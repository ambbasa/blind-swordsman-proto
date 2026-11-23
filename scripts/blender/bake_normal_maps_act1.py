"""
scripts/blender/bake_normal_maps_act1.py
1막 보스(boss.glb) + 잡몹 3종(minion/heavy/stone.glb)에 대해:
  - 기존 66본 Mesh2Motion 리깅·웨이트·액션·외곽선·무기를 100% 보존하면서
  - 원본 하이폴리 GLB(scripts/blender/_raw/*_mv_raw.glb)로부터 1024x1024 Tangent-Space Normal Map을 베이킹
  - WebP 압축 익스포트 + 4면 육안 검증 시트 렌더링
"""
import math
import os
import sys
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_DIR = os.path.join(ROOT, "v2", "assets", "models")
RAW_DIR = os.path.join(ROOT, "scripts", "blender", "_raw")
RENDER_DIR = os.path.join(
    os.path.expanduser("~"),
    ".gemini", "antigravity-cli", "brain",
    "0fb4ed9a-28d7-4346-b4cd-73fa2830cab4", "act1_norm_verify"
)
os.makedirs(RENDER_DIR, exist_ok=True)

TARGETS = [
    {"id": "boss",   "glb": "boss.glb",   "raw": "boss_mv_raw.glb",   "strength": 0.58},
    {"id": "minion", "glb": "minion.glb", "raw": "minion_mv_raw.glb", "strength": 0.55},
    {"id": "heavy",  "glb": "heavy.glb",  "raw": "heavy_mv_raw.glb",  "strength": 0.58},
    {"id": "stone",  "glb": "stone.glb",  "raw": "stone_mv_raw.glb",  "strength": 0.65},
]


def world_bbox(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def find_body_mesh(objs):
    meshes = [o for o in objs if o.type == "MESH"]
    # Exclude outline and weapon meshes
    candidates = [
        o for o in meshes
        if "outline" not in o.name.lower()
        and "sword" not in o.name.lower()
        and "weapon" not in o.name.lower()
        and "axe" not in o.name.lower()
        and "club" not in o.name.lower()
        and "halberd" not in o.name.lower()
        and "spear" not in o.name.lower()
    ]
    if not candidates:
        candidates = meshes
    return max(candidates, key=lambda o: len(o.data.polygons))


def align_high_to_low(high_obj, low_obj):
    """Align high-poly raw mesh to low-poly rigged body mesh in rest pose."""
    bpy.context.view_layer.update()
    l_mn, l_mx = world_bbox(low_obj)
    h_mn, h_mx = world_bbox(high_obj)
    l_h = max(1e-4, l_mx.z - l_mn.z)
    h_h = max(1e-4, h_mx.z - h_mn.z)
    scale = l_h / h_h

    high_obj.scale = (high_obj.scale.x * scale, high_obj.scale.y * scale, high_obj.scale.z * scale)
    bpy.context.view_layer.update()
    h_mn, h_mx = world_bbox(high_obj)
    l_cx = 0.5 * (l_mn.x + l_mx.x)
    l_cy = 0.5 * (l_mn.y + l_mx.y)
    h_cx = 0.5 * (h_mn.x + h_mx.x)
    h_cy = 0.5 * (h_mn.y + h_mx.y)
    high_obj.location += Vector((l_cx - h_cx, l_cy - h_cy, l_mn.z - h_mn.z))
    bpy.context.view_layer.update()
    h_mn2, h_mx2 = world_bbox(high_obj)
    print(f"  + Aligned high {high_obj.name} ({len(high_obj.data.polygons)} tris) -> low {low_obj.name} ({len(low_obj.data.polygons)} tris)")
    print(f"    low  bbox Z=[{l_mn.z:.3f},{l_mx.z:.3f}] X=[{l_mn.x:.3f},{l_mx.x:.3f}] Y=[{l_mn.y:.3f},{l_mx.y:.3f}]")
    print(f"    high bbox Z=[{h_mn2.z:.3f},{h_mx2.z:.3f}] X=[{h_mn2.x:.3f},{h_mx2.x:.3f}] Y=[{h_mn2.y:.3f},{h_mx2.y:.3f}]")


def bake_normal(high_obj, low_obj, img_name, strength=0.58, size=1024):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.015
    scene.render.bake.max_ray_distance = 0.032
    scene.render.bake.margin = 4
    scene.render.bake.use_clear = True

    # Ensure UV exists on low_obj
    if not low_obj.data.uv_layers:
        print(f"  ! WARNING: {low_obj.name} has no UV layer, skipping normal bake")
        return False

    mat = low_obj.data.materials[0] if low_obj.data.materials else None
    if mat is None or not mat.use_nodes:
        print(f"  ! WARNING: {low_obj.name} has no node material, skipping normal bake")
        return False

    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return False

    # Initialize neutral tangent-space normal color (0.5, 0.5, 1.0) so unhit rays stay flat
    n_img = bpy.data.images.new(img_name, width=size, height=size, alpha=False)
    n_img.colorspace_settings.name = "Non-Color"
    n_img.pixels[:] = [0.5, 0.5, 1.0, 1.0] * (size * size)
    n_img.update()

    # Temporarily disable armature modifiers so baking happens in exact rest pose
    disabled_mods = []
    for m in low_obj.modifiers:
        if m.type == "ARMATURE" and m.show_viewport:
            m.show_viewport = False
            disabled_mods.append(m)

    # Ensure bake target is visible & renderable
    prev_hide_r = low_obj.hide_render
    prev_hide_v = low_obj.hide_viewport
    low_obj.hide_render = False
    low_obj.hide_viewport = False
    high_obj.hide_render = False
    high_obj.hide_viewport = False

    tex_node = nt.nodes.new("ShaderNodeTexImage")
    tex_node.image = n_img
    tex_node.select = True
    nt.nodes.active = tex_node

    bpy.ops.object.select_all(action="DESELECT")
    high_obj.select_set(True)
    low_obj.select_set(True)
    bpy.context.view_layer.objects.active = low_obj
    bpy.ops.object.bake(type="NORMAL")
    n_img.pack()

    # Remove any old normal map links
    for link in list(bsdf.inputs["Normal"].links):
        nt.links.remove(link)

    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = strength
    nt.links.new(tex_node.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    for m in disabled_mods:
        m.show_viewport = True
    low_obj.hide_render = prev_hide_r
    low_obj.hide_viewport = prev_hide_v

    print(f"  + Baked {size}x{size} Normal Map (strength={strength}) onto {low_obj.name}")
    return True


def render_4view(cid, low_obj):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 384
    scene.render.resolution_y = 512
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("VerifyWorld")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.14, 0.13, 0.12, 1.0)
        bg.inputs["Strength"].default_value = 0.7

    # Key + rim lights
    key_data = bpy.data.lights.new("KeyLight", type="AREA")
    key_data.energy = 160
    key_data.size = 2.0
    key = bpy.data.objects.new("KeyLight", key_data)
    scene.collection.objects.link(key)
    key.location = (2.2, -2.5, 2.8)

    rim_data = bpy.data.lights.new("RimLight", type="AREA")
    rim_data.energy = 120
    rim_data.color = (1.0, 0.88, 0.72)
    rim = bpy.data.objects.new("RimLight", rim_data)
    scene.collection.objects.link(rim)
    rim.location = (-2.0, 2.4, 2.2)

    mn, mx = world_bbox(low_obj)
    ctr = (mn + mx) * 0.5
    h = max(0.8, mx.z - mn.z)
    dist = h * 1.95

    cam_data = bpy.data.cameras.new("VerifyCam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("VerifyCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    views = [
        ("front", (0.0, -dist, ctr.z + h * 0.05)),
        ("3q",    (dist * 0.68, -dist * 0.73, ctr.z + h * 0.08)),
        ("side",  (dist, 0.0, ctr.z + h * 0.05)),
        ("back",  (0.0, dist, ctr.z + h * 0.05)),
    ]
    out_paths = []
    for vname, loc in views:
        cam.location = Vector(loc)
        direction = (ctr - cam.location).normalized()
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        out_p = os.path.join(RENDER_DIR, f"{cid}_{vname}.png")
        scene.render.filepath = out_p
        bpy.ops.render.render(write_still=True)
        out_paths.append(out_p)
    return out_paths


def process_one(spec):
    cid = spec["id"]
    glb_path = os.path.join(MODELS_DIR, spec["glb"])
    raw_path = os.path.join(RAW_DIR, spec["raw"])
    assert os.path.isfile(glb_path), f"Missing {glb_path}"
    assert os.path.isfile(raw_path), f"Missing {raw_path}"

    print(f"\n================ [{cid.upper()}] Normal Map Upgrade ================")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb_path)
    orig_objs = list(bpy.data.objects)
    body = find_body_mesh(orig_objs)

    # Import high-poly raw mesh
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=raw_path)
    raw_objs = [o for o in bpy.data.objects if o not in before]
    raw_meshes = [o for o in raw_objs if o.type == "MESH"]
    assert raw_meshes, f"No mesh in {raw_path}"

    # Join multiple raw meshes if any
    if len(raw_meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for o in raw_meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = raw_meshes[0]
        bpy.ops.object.join()
    high_obj = raw_meshes[0]

    # Apply transforms on high_obj before alignment
    bpy.ops.object.select_all(action="DESELECT")
    high_obj.select_set(True)
    bpy.context.view_layer.objects.active = high_obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    align_high_to_low(high_obj, body)
    ok = bake_normal(high_obj, body, f"{cid}_normal", strength=spec["strength"], size=1024)

    # Remove all imported raw objects so export only contains the original rigged character
    for o in list(raw_objs):
        if o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)

    if ok:
        # Export back to glb_path with WebP texture compression for mobile size
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(
            filepath=glb_path,
            export_format="GLB",
            export_image_format="WEBP",
            export_image_quality=82,
            export_animations=True,
            export_nla_strips=True,
            export_skins=True,
            export_normals=True,
            export_tangents=False,
            export_materials="EXPORT",
        )
        sz = os.path.getsize(glb_path)
        print(f"  + Exported {glb_path} ({sz:,} B)")

        # Re-import clean exported GLB to render 4-view verification
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=glb_path)
        body2 = find_body_mesh(list(bpy.data.objects))
        render_4view(cid, body2)


def main():
    for spec in TARGETS:
        process_one(spec)
    print("\nALL 4 ACT1 MODELS NORMAL-BAKED AND RENDERED!")


if __name__ == "__main__":
    main()
