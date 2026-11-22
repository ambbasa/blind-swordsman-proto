"""
scripts/blender/postprocess_glb.py
Blender 5.3 후처리 파이프라인 (Stage 2):
  Image-to-3D AI가 생성한 고해상도 텍스처 GLB를 입력받아:
   1. 원점 정렬(발바닥 Z=0, 중심 X/Y=0, 목표 높이 스케일링, 정면 방향 보정)
   2. 모바일 60fps용 UV 보존 경량화(Decimate) + 텍스처 해상도 최적화(1024px)
   3. 수묵 먹선 인버티드 헐 외곽선(Hero_Outline) 자동 생성 (glbboss.js 규격 호환)
   4. 휴머노이드 뼈대(Hero_Armature) 자동 피팅 + 자동 스키닝 + 4종 애니메이션(idle/walk/slash/hit) 베이킹
   5. 게임용 GLB 내보내기 + 4방향(정면/3/4/후면/인게임 탑다운) Cycles 스튜디오 미리보기 렌더링

직접 호출 예시:
  blender --background --python scripts/blender/postprocess_glb.py -- \
    --in hero_raw.glb --out v2/assets/models/hero.glb \
    --height 1.85 --tris 12000 --outline 0.0045 --rig humanoid --render-dir preview
"""
import argparse
import math
import os
import sys
import bpy
import bmesh
from mathutils import Vector, Euler, Matrix


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    p = argparse.ArgumentParser(description="SIMAN Blender 5.3 GLB Post-Processor")
    p.add_argument("--in", dest="in_glb", required=True, help="Input raw GLB from Image-to-3D AI")
    p.add_argument("--out", dest="out_glb", required=True, help="Output game-ready GLB path")
    p.add_argument("--name", default="Hero", help="Base asset name (e.g., Hero, Boss, Prop)")
    p.add_argument("--height", type=float, default=1.85, help="Target height in meters")
    p.add_argument("--yaw", type=float, default=0.0, help="Extra Z-rotation in degrees to face -Y (front)")
    p.add_argument("--tris", type=int, default=12000, help="Target body triangle count (0 = no decimate)")
    p.add_argument("--tex-size", type=int, default=1024, help="Max texture dimension (0 = keep original)")
    p.add_argument("--outline", type=float, default=0.0045, help="Sumi-ink outline thickness in meters (0 = none)")
    p.add_argument("--rig", choices=["none", "humanoid"], default="humanoid", help="Auto-rig mode")
    p.add_argument("--render-dir", default="", help="Directory for 4-angle studio turnaround PNGs")
    p.add_argument("--samples", type=int, default=32, help="Cycles samples for turnaround preview")
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def set_smooth(obj):
    if obj.type != "MESH":
        return
    for p in obj.data.polygons:
        p.use_smooth = True


def get_mesh_bounds_world(obj):
    mat = obj.matrix_world
    pts = [mat @ v.co for v in obj.data.vertices]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def import_and_merge_glb(in_glb, base_name):
    bpy.ops.import_scene.gltf(filepath=in_glb)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh found in {in_glb}")

    # Clear parents while keeping world transforms, remove imported armatures/empties/lights/cameras
    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    for o in list(bpy.context.scene.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)

    if len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for m in meshes:
            m.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()

    body = bpy.context.active_object
    body.name = f"{base_name}_Body"
    body.data.name = f"{base_name}_Body"
    return body


def normalize_mesh(body, target_height, yaw_deg):
    # Apply optional yaw correction directly to mesh vertices (100% deterministic, no operator selection quirks)
    if abs(yaw_deg) > 1e-4:
        rot_m = Matrix.Rotation(math.radians(yaw_deg), 3, "Z")
        for v in body.data.vertices:
            v.co = rot_m @ v.co
        body.data.update()

    bmin, bmax = get_mesh_bounds_world(body)
    size = bmax - bmin
    h = max(1e-4, size.z)
    scale = target_height / h
    cx = (bmin.x + bmax.x) * 0.5
    cy = (bmin.y + bmax.y) * 0.5
    cz = bmin.z

    for v in body.data.vertices:
        v.co.x = (v.co.x - cx) * scale
        v.co.y = (v.co.y - cy) * scale
        v.co.z = (v.co.z - cz) * scale
    body.data.update()
    set_smooth(body)
    print(f"NORMALIZED: raw_size=({size.x:.3f},{size.y:.3f},{size.z:.3f}) -> scale={scale:.4f}, height={target_height:.2f}m")


def optimize_materials_and_textures(body, max_tex_size):
    # Resize oversized AI textures for fast mobile web loading and tune PBR response for sumi-ink aesthetic
    seen_imgs = set()
    for mat in body.data.materials:
        if not mat or not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and node.image.name not in seen_imgs:
                img = node.image
                seen_imgs.add(img.name)
                if max_tex_size > 0 and (img.size[0] > max_tex_size or img.size[1] > max_tex_size):
                    w, h = img.size[0], img.size[1]
                    k = max_tex_size / float(max(w, h))
                    nw, nh = max(64, int(round(w * k))), max(64, int(round(h * k)))
                    img.scale(nw, nh)
                    img.pack()
                    print(f"RESIZED_TEX: {img.name} {w}x{h} -> {nw}x{nh}")
            elif node.type == "BSDF_PRINCIPLED":
                # Keep painted illustration crisp without plastic glare if AI didn't wire a roughness map
                if not node.inputs["Roughness"].is_linked:
                    node.inputs["Roughness"].default_value = max(0.68, node.inputs["Roughness"].default_value)
                if "Specular IOR Level" in node.inputs and not node.inputs["Specular IOR Level"].is_linked:
                    node.inputs["Specular IOR Level"].default_value = min(0.32, node.inputs["Specular IOR Level"].default_value)


def remove_floating_islands(body, min_ratio=0.008):
    """Remove tiny disconnected AI artifacts (floating crumbs/noise) while keeping the main character."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    total_v = len(bm.verts)
    if total_v < 100:
        bm.free()
        return
    visited = set()
    islands = []
    for v in bm.verts:
        if v.index in visited:
            continue
        comp = []
        stack = [v]
        visited.add(v.index)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for e in cur.link_edges:
                ov = e.other_vert(cur)
                if ov.index not in visited:
                    visited.add(ov.index)
                    stack.append(ov)
        islands.append(comp)
    if len(islands) <= 1:
        bm.free()
        return
    islands.sort(key=len, reverse=True)
    keep_thresh = max(30, int(total_v * min_ratio))
    to_del = []
    for comp in islands[1:]:
        if len(comp) < keep_thresh:
            to_del.extend(comp)
    if to_del:
        bmesh.ops.delete(bm, geom=to_del, context="VERTS")
        bm.to_mesh(body.data)
        body.data.update()
        print(f"CLEANED_ISLANDS: removed {len(to_del)} floating debris verts")
    bm.free()


def decimate_body(body, target_tris):
    remove_floating_islands(body)
    cur_tris = sum(max(1, len(p.vertices) - 2) for p in body.data.polygons)
    print(f"RAW_TRIS: {cur_tris}")
    if target_tris > 0 and cur_tris > target_tris * 1.05:
        ratio = max(0.02, min(1.0, float(target_tris) / float(cur_tris)))
        bpy.context.view_layer.objects.active = body
        mod = body.modifiers.new(name="SmartDecimate", type="DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        mod.delimit = {"UV"}
        bpy.ops.object.modifier_apply(modifier="SmartDecimate")
        set_smooth(body)

    # Clean merge tiny duplicate verts & validate for zero glTF export warnings
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(body.data)
    bm.free()
    body.data.validate(verbose=False)
    after_tris = sum(max(1, len(p.vertices) - 2) for p in body.data.polygons)
    print(f"BODY_TRIS_AFTER_DECIMATE: {after_tris}")
    return after_tris


def make_outline_mat_gltf():
    mat = bpy.data.materials.new(name="Mat_InkOutline")
    mat.use_backface_culling = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.010, 0.010, 0.014, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def upgrade_outline_mat_for_cycles(mat):
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    trans = nt.nodes.new("ShaderNodeBsdfTransparent")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (0.010, 0.010, 0.014, 1.0)
    emit.inputs["Strength"].default_value = 1.0
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(geom.outputs["Backfacing"], mix.inputs["Fac"])
    nt.links.new(emit.outputs["Emission"], mix.inputs[1])
    nt.links.new(trans.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])


def build_sumi_outline(body, base_name, thick, outline_mat):
    outline = body.copy()
    outline.data = body.data.copy()
    outline.name = f"{base_name}_Outline"
    outline.data.name = f"{base_name}_Outline"
    bpy.context.collection.objects.link(outline)
    outline.data.materials.clear()
    outline.data.materials.append(outline_mat)
    # Strip UV layers & vertex colors on outline to save GLB bytes!
    while len(outline.data.uv_layers) > 0:
        outline.data.uv_layers.remove(outline.data.uv_layers[0])
    while len(outline.data.color_attributes) > 0:
        outline.data.color_attributes.remove(outline.data.color_attributes[0])

    bmin, bmax = get_mesh_bounds_world(body)
    h = max(1e-4, bmax.z - bmin.z)

    bm = bmesh.new()
    bm.from_mesh(outline.data)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    for v in bm.verts:
        # Slightly finer ink stroke on head/face region, crisp contour on coat/boots
        k = 0.68 if v.co.z > h * 0.80 else 1.0
        v.co += v.normal * (thick * k)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(outline.data)
    bm.free()
    outline.data.validate(verbose=False)
    set_smooth(outline)
    return outline


def create_fitted_humanoid_rig(body, base_name):
    """Build a 16-bone humanoid armature proportionally fitted to the mesh's exact bounding box."""
    bmin, bmax = get_mesh_bounds_world(body)
    h = max(0.5, bmax.z - bmin.z)

    # Estimate torso shoulder width from vertices in upper-chest band (z in 0.68..0.78 * h)
    chest_xs = [abs(v.co.x) for v in body.data.vertices if 0.68 * h <= v.co.z <= 0.78 * h]
    sh_x = max(0.14 * h, min(0.24 * h, (sorted(chest_xs)[int(len(chest_xs) * 0.65)] if chest_xs else 0.16 * h)))
    hip_x = 0.065 * h

    arm_data = bpy.data.armatures.new(f"{base_name}_Armature")
    arm_obj = bpy.data.objects.new(f"{base_name}_Armature", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def add_bone(name, head, tail, parent=None, connected=False):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connected
        return b

    add_bone("hips",  (0, 0, 0.50 * h), (0, 0, 0.57 * h))
    add_bone("spine", (0, 0, 0.57 * h), (0, 0, 0.68 * h), "hips", True)
    add_bone("chest", (0, 0, 0.68 * h), (0, 0, 0.80 * h), "spine", True)
    add_bone("neck",  (0, 0, 0.80 * h), (0, 0, 0.85 * h), "chest", True)
    add_bone("head",  (0, 0, 0.85 * h), (0, 0, 0.99 * h), "neck", True)

    for s in (-1, 1):
        suf = "L" if s > 0 else "R"
        add_bone(f"upperArm_{suf}", (s * sh_x * 0.72, 0.0, 0.75 * h), (s * sh_x * 1.12, 0.0, 0.61 * h), "chest")
        add_bone(f"forearm_{suf}",  (s * sh_x * 1.12, 0.0, 0.61 * h), (s * sh_x * 1.25, -0.02 * h, 0.48 * h), f"upperArm_{suf}", True)
        add_bone(f"hand_{suf}",     (s * sh_x * 1.25, -0.02 * h, 0.48 * h), (s * sh_x * 1.32, -0.03 * h, 0.41 * h), f"forearm_{suf}", True)
        add_bone(f"thigh_{suf}",    (s * hip_x, 0.0, 0.50 * h), (s * hip_x * 1.12, 0.0, 0.27 * h), "hips")
        add_bone(f"shin_{suf}",     (s * hip_x * 1.12, 0.0, 0.27 * h), (s * hip_x * 1.18, 0.01 * h, 0.06 * h), f"thigh_{suf}", True)
        add_bone(f"foot_{suf}",     (s * hip_x * 1.18, 0.01 * h, 0.06 * h), (s * hip_x * 1.18, -0.08 * h, 0.01 * h), f"shin_{suf}", True)

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def point_seg_dist(p, a, b):
    ab = b - a
    l2 = ab.length_squared
    if l2 < 1e-8:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / l2))
    return (p - (a + ab * t)).length


def assign_smooth_distance_weights(mesh_obj, arm_obj):
    """Guaranteed 100%-coverage smooth inverse-distance bone skinning fallback for arbitrary AI meshes."""
    bones = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in arm_obj.data.bones]
    mesh_obj.vertex_groups.clear()
    vgs = {name: mesh_obj.vertex_groups.new(name=name) for name, _, _ in bones}
    for v in mesh_obj.data.vertices:
        p = v.co
        # Score top 3 closest bones with smooth Gaussian-like falloff
        dists = []
        for name, a, b in bones:
            d = point_seg_dist(p, a, b)
            # Keep left/right limbs cleanly separated across X=0
            if name.endswith("_L") and p.x < -0.04:
                d += 0.35
            elif name.endswith("_R") and p.x > 0.04:
                d += 0.35
            dists.append((d, name))
        dists.sort(key=lambda x: x[0])
        top = dists[:3]
        raw = [1.0 / ((d + 0.035) ** 3.2) for d, _ in top]
        s = sum(raw) or 1.0
        for (_, name), w in zip(top, raw):
            wn = w / s
            if wn > 0.02:
                vgs[name].add([v.index], wn, "REPLACE")


def skin_meshes_to_armature(body, outline, arm_obj):
    # Try Blender automatic heat weighting first; fallback cleanly if AI mesh has non-manifold islands
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    heat_ok = False
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        # Verify at least 95% of vertices received weights
        weighted = sum(1 for v in body.data.vertices if len(v.groups) > 0)
        if weighted >= len(body.data.vertices) * 0.95:
            heat_ok = True
            print(f"SKINNING: ARMATURE_AUTO succeeded ({weighted}/{len(body.data.vertices)} verts)")
    except Exception as e:
        print(f"SKINNING: ARMATURE_AUTO raised {e}, using smooth distance weights")

    if not heat_ok:
        # Ensure clean parent + Armature modifier + smooth distance skinning
        if body.parent != arm_obj:
            body.parent = arm_obj
        if not any(m.type == "ARMATURE" for m in body.modifiers):
            mod = body.modifiers.new(name="Armature", type="ARMATURE")
            mod.object = arm_obj
        assign_smooth_distance_weights(body, arm_obj)
        print("SKINNING: Smooth distance-envelope skinning applied (100% vertex coverage)")

    # Clamp to max 4 bone influences per vertex & normalize (strict glTF 2.0 compliance!)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

    if outline is not None:
        outline.parent = arm_obj
        mod = outline.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = arm_obj
        # Copy exact vertex weights from body -> outline (identical vertex indices!)
        outline.vertex_groups.clear()
        for vg in body.vertex_groups:
            outline.vertex_groups.new(name=vg.name)
        for v in body.data.vertices:
            for g in v.groups:
                outline.vertex_groups[g.group].add([v.index], g.weight, "REPLACE")


def bake_humanoid_clips(arm_obj):
    arm_obj.animation_data_create()
    pb = arm_obj.pose.bones
    for b in pb:
        b.rotation_mode = "XYZ"

    def set_rot(bone_name, rx, ry, rz, frame):
        if bone_name not in pb:
            return
        b = pb[bone_name]
        b.rotation_euler = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), "XYZ")
        b.keyframe_insert(data_path="rotation_euler", frame=frame)

    def set_loc(bone_name, x, y, z, frame):
        if bone_name not in pb:
            return
        b = pb[bone_name]
        b.location = Vector((x, y, z))
        b.keyframe_insert(data_path="location", frame=frame)

    def reset_all():
        for b in pb:
            b.rotation_euler = Euler((0, 0, 0), "XYZ")
            b.location = Vector((0, 0, 0))

    def finish_action(name):
        act = arm_obj.animation_data.action
        act.name = name
        act.use_fake_user = True
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, act)
        track.mute = True
        arm_obj.animation_data.action = None

    # 1) idle
    arm_obj.animation_data.action = bpy.data.actions.new("idle")
    reset_all()
    for f, k in [(1, 0.0), (16, 1.0), (31, 0.0)]:
        set_loc("hips", 0, 0, 0.010 * k, f)
        set_rot("chest", 1.8 * k, 0, 0, f)
        set_rot("upperArm_R", -2.5 * k, 0, -1.5 * k, f)
        set_rot("upperArm_L", 2.0 * k, 0, 1.5 * k, f)
    finish_action("idle")

    # 2) walk
    arm_obj.animation_data.action = bpy.data.actions.new("walk")
    reset_all()
    for f, s in [(1, 0.0), (7, 1.0), (13, 0.0), (19, -1.0), (25, 0.0)]:
        set_loc("hips", 0, 0, 0.018 * abs(s), f)
        set_rot("spine", 5.0, 0, 5.0 * s, f)
        set_rot("thigh_L", 20.0 * s, 0, 0, f)
        set_rot("shin_L", -14.0 * max(0.0, -s) - 4.0, 0, 0, f)
        set_rot("thigh_R", -20.0 * s, 0, 0, f)
        set_rot("shin_R", -14.0 * max(0.0, s) - 4.0, 0, 0, f)
        set_rot("upperArm_L", -14.0 * s, 0, 0, f)
        set_rot("upperArm_R", 10.0 * s - 5.0, 0, 0, f)
    finish_action("walk")

    # 3) slash (일섬)
    arm_obj.animation_data.action = bpy.data.actions.new("slash")
    reset_all()
    set_rot("spine", 10, 0, -24, 1); set_rot("chest", 6, 0, -18, 1)
    set_rot("upperArm_R", -32, 14, -22, 1); set_rot("forearm_R", -20, 0, 0, 1)
    set_rot("spine", 14, 0, 28, 7); set_rot("chest", 8, 0, 22, 7)
    set_rot("upperArm_R", 42, -18, 36, 7); set_rot("forearm_R", -8, 0, 0, 7)
    set_rot("spine", 4, 0, 6, 16); set_rot("chest", 2, 0, 5, 16)
    set_rot("upperArm_R", 5, -4, 8, 16); set_rot("forearm_R", -6, 0, 0, 16)
    finish_action("slash")

    # 4) hit
    arm_obj.animation_data.action = bpy.data.actions.new("hit")
    reset_all()
    set_rot("spine", -12, 0, 10, 1); set_rot("head", -8, 0, 0, 1)
    set_rot("spine", -16, 0, 14, 5); set_rot("head", -12, 0, 0, 5)
    set_rot("spine", 0, 0, 0, 12); set_rot("head", 0, 0, 0, 12)
    finish_action("hit")

    reset_all()


def render_turnaround(body, outline, outline_mat, render_dir, base_name, samples):
    os.makedirs(render_dir, exist_ok=True)
    if outline is not None and outline_mat is not None:
        upgrade_outline_mat_for_cycles(outline_mat)
        outline.visible_shadow = False
        outline.visible_diffuse = False
        outline.visible_glossy = False

    bmin, bmax = get_mesh_bounds_world(body)
    center = (bmin + bmax) * 0.5
    h = max(0.5, bmax.z - bmin.z)
    rad = max((bmax.x - bmin.x), (bmax.y - bmin.y), h) * 0.55

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 540
    scene.render.resolution_y = 780
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("StudioWorld")
    scene.world = world
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.85, 0.82, 0.76, 1.0)
        bg.inputs["Strength"].default_value = 0.75

    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=rad * 1.8, depth=0.04, location=(0, 0, -0.02))
    floor = bpy.context.active_object
    fmat = bpy.data.materials.new("Mat_StudioFloor")
    bsdf = fmat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.78, 0.74, 0.67, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.92
    floor.data.materials.append(fmat)

    def add_area(name, loc, target, energy, size, col):
        ldata = bpy.data.lights.new(name=name, type="AREA")
        ldata.energy = energy
        ldata.size = size
        ldata.color = col
        lobj = bpy.data.objects.new(name, ldata)
        bpy.context.collection.objects.link(lobj)
        lobj.location = Vector(loc)
        lobj.rotation_euler = (Vector(target) - lobj.location).to_track_quat("-Z", "Y").to_euler()

    add_area("KeyLight", (-2.2 * rad, -2.6 * rad, 2.4 * h), center, 240 * rad, 1.6 * rad, (1.0, 0.95, 0.88))
    add_area("FillLight", (2.4 * rad, -1.8 * rad, 1.4 * h), center, 110 * rad, 2.2 * rad, (0.82, 0.88, 1.0))
    add_area("RimLight", (0.8 * rad, 2.5 * rad, 2.0 * h), center, 220 * rad, 1.4 * rad, (1.0, 0.96, 0.88))

    cam_data = bpy.data.cameras.new("StudioCam")
    cam = bpy.data.objects.new("StudioCam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    d = max(h * 2.15, rad * 3.2)
    views = [
        ("front", (0.0, -d, center.z * 1.04), center, 56),
        ("three_quarter", (-d * 0.56, -d * 0.82, center.z * 1.12), center, 56),
        ("back", (d * 0.14, d * 0.98, center.z * 1.08), center, 56),
        ("game_cam", (-d * 0.60, -d * 0.62, h * 1.75), Vector((center.x, center.y, center.z * 0.92)), 48),
    ]
    prefix = base_name.lower()
    for tag, loc, target, lens in views:
        cam.data.lens = lens
        cam.location = Vector(loc)
        cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(render_dir, f"{prefix}_{tag}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print("RENDERED:", path)


def main():
    args = parse_args()
    clear_scene()

    body = import_and_merge_glb(args.in_glb, args.name)
    normalize_mesh(body, args.height, args.yaw)
    optimize_materials_and_textures(body, args.tex_size)
    body_tris = decimate_body(body, args.tris)

    outline = None
    outline_mat = None
    if args.outline > 0.0:
        outline_mat = make_outline_mat_gltf()
        outline = build_sumi_outline(body, args.name, args.outline, outline_mat)

    arm_obj = None
    if args.rig == "humanoid":
        arm_obj = create_fitted_humanoid_rig(body, args.name)
        skin_meshes_to_armature(body, outline, arm_obj)
        bake_humanoid_clips(arm_obj)

    out_tris = sum(max(1, len(p.vertices) - 2) for p in outline.data.polygons) if outline else 0
    print(f"FINAL_TRIS: body={body_tris}, outline={out_tris}, total={body_tris + out_tris}")

    # Export clean game-ready GLB BEFORE studio lighting & Cycles outline shader
    os.makedirs(os.path.dirname(os.path.abspath(args.out_glb)), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    if outline:
        outline.select_set(True)
    if arm_obj:
        arm_obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=args.out_glb,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=(arm_obj is not None),
        export_nla_strips=(arm_obj is not None),
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_quality=88,
    )
    print("EXPORTED_GLB:", args.out_glb, "BYTES:", os.path.getsize(args.out_glb))

    if args.render_dir:
        render_turnaround(body, outline, outline_mat, args.render_dir, args.name, args.samples)


if __name__ == "__main__":
    main()
