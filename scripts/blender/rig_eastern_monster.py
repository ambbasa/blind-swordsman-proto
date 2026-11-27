"""Blender 3.4+/5.x archetype-specific rigging, Ember & Blade visual styling & animation builder
for all 15 Korean monsters/bosses.

Integrates the exact Ember & Blade visual pipeline used by the shipped hero (`build_ember_eastern_m2m.py`):
  1. High-poly -> Low-poly Decimate with `delimit={'UV'}` (UV seam preservation)
  2. Smooth-by-Angle (42 deg) crisp bevel normals
  3. 4-view orthographic re-projection (`project_4view_onto_mesh`) + edge-preserving
     Base Color pigment plane cleanup (`clean_pigment_planes`)
  4. Lossless tangent-space Normal Map bake (1024px, strength 0.32, zero AO noise)
  5. Matte painterly Principled BSDF (Roughness 0.92, Metallic 0.0, Specular IOR 0.14)

Rigging & Animation features (6 dedicated archetypes):
  - humanoid  : 19-bone bipedal rig (skeleton, jangseung, bomber, dokkaebi, susal, bulgasari)
  - float     : 13-bone floating robe/ghost rig (zero leg tearing; skirt chain + hover sway)
  - robe      : 19-bone long-robe rig (+ 3 tail fan bones for `gumiho_boss` -> 22 bones)
  - avian     : 12-bone winged bird rig (samjoko wingbeats + talon rake)
  - serpent   : 15-bone serpent-tail + bipedal torso rig (imugi S-wave slither + upper strike)
  - quadruped : 18-bone four-legged feline rig (jangsanbeom prowl/gallop + lunge)
  - Welded-proxy Bone Heat weighting + Data Transfer (preserves UV seam vertices on glTF meshes)
  - Horn/crown/tall-hat head lock + Gumiho tail fan isolation (zero tearing/scattering)
  - Automated export verification (`verify_export`) + optional `--preview` render sheet.
"""
import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

try:
    from build_ember_eastern_m2m import (
        apply_smooth_with_bevel_normals,
        bake_clean_normal_map,
        clean_pigment_planes,
        configure_matte_painterly_material,
    )
    from project_mv_carved import project_4view_onto_mesh
except Exception as _imp_err:
    print(f"[WARN] Could not import hero visual helpers: {_imp_err}", flush=True)
    apply_smooth_with_bevel_normals = None
    bake_clean_normal_map = None
    clean_pigment_planes = None
    configure_matte_painterly_material = None
    project_4view_onto_mesh = None

HEAD_LOCK_KEYS = {
    "dokkaebi_boss",
    "imugi_king_boss",
    "gwibul_bomber",
    "mudang_wraith",
    "jeoseung_boss",
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="in_glb", required=True)
    p.add_argument("--out", dest="out_glb", required=True)
    p.add_argument("--blend", dest="out_blend", default="")
    p.add_argument("--mv-dir", dest="mv_dir", default="", help="4-view PNG folder for orthographic re-projection")
    p.add_argument("--key", required=True)
    p.add_argument("--archetype", choices=["humanoid", "float", "robe", "avian", "serpent", "quadruped"], required=True)
    p.add_argument("--height", type=float, default=1.85)
    p.add_argument("--tris", type=int, default=8500)
    p.add_argument("--tex-size", type=int, default=1024)
    p.add_argument("--sharp-angle", type=float, default=42.0)
    p.add_argument("--pigment-clean", type=float, default=0.35)
    p.add_argument("--no-normal-bake", action="store_true")
    p.add_argument("--no-project", action="store_true")
    p.add_argument("--rot-z-deg", type=float, default=0.0, help="Extra Z rotation if Hunyuan3D faces another axis")
    p.add_argument("--preview-out", default="", help="Optional preview render PNG path")
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _fallback_smooth_bevel(mesh_obj, sharp_angle_deg=42.0):
    for p in mesh_obj.data.polygons:
        p.use_smooth = True
    if sharp_angle_deg > 0:
        bm = bmesh.new()
        bm.from_mesh(mesh_obj.data)
        angle_rad = math.radians(sharp_angle_deg)
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) >= angle_rad:
                e.smooth = False
        bm.to_mesh(mesh_obj.data)
        bm.free()
    mesh_obj.data.update()


def _fallback_matte_material(mesh_obj):
    for mat in mesh_obj.data.materials:
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                if "Roughness" in node.inputs and not node.inputs["Roughness"].is_linked:
                    node.inputs["Roughness"].default_value = 0.92
                if "Metallic" in node.inputs and not node.inputs["Metallic"].is_linked:
                    node.inputs["Metallic"].default_value = 0.0
                if "Specular IOR Level" in node.inputs and not node.inputs["Specular IOR Level"].is_linked:
                    node.inputs["Specular IOR Level"].default_value = 0.14


def import_and_prepare_mesh(args):
    bpy.ops.import_scene.gltf(filepath=args.in_glb)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh objects found in {args.in_glb}")

    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = f"{args.key}_Mesh"

    # Remove non-mesh leftovers (empty parents, cameras, lights, imported armatures)
    for o in list(bpy.context.scene.objects):
        if o != body:
            bpy.data.objects.remove(o, do_unlink=True)

    # Clear any inherited vertex groups / armature modifiers from input GLB
    body.vertex_groups.clear()
    for mod in list(body.modifiers):
        body.modifiers.remove(mod)

    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if abs(args.rot_z_deg) > 1e-3:
        body.rotation_euler = Euler((0.0, 0.0, math.radians(args.rot_z_deg)), "XYZ")
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    # Measure world bbox, center X/Y, ground Z=0, scale uniformly to target_h
    xs = [v.co.x for v in body.data.vertices]
    ys = [v.co.y for v in body.data.vertices]
    zs = [v.co.z for v in body.data.vertices]
    cx = 0.5 * (min(xs) + max(xs))
    cy = 0.5 * (min(ys) + max(ys))
    min_z = min(zs)
    cur_h = max(1e-4, max(zs) - min_z)
    sc = args.height / cur_h

    for v in body.data.vertices:
        v.co.x = (v.co.x - cx) * sc
        v.co.y = (v.co.y - cy) * sc
        v.co.z = (v.co.z - min_z) * sc
    body.data.update()

    # Keep a high-poly duplicate before Decimate for tangent-space normal map baking
    orig_tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    high_obj = None
    want_bake = (
        not args.no_normal_bake
        and bake_clean_normal_map is not None
        and orig_tris > args.tris
        and len(body.data.uv_layers) > 0
        and len(body.data.materials) > 0
    )
    if want_bake:
        high_obj = body.copy()
        high_obj.data = body.data.copy()
        high_obj.name = f"{args.key}_HighPolyTmp"
        bpy.context.collection.objects.link(high_obj)

    # Decimate to mobile triangle budget while strictly preserving UV seams
    if orig_tris > args.tris:
        dec = body.modifiers.new("DecimateMobile", "DECIMATE")
        dec.ratio = max(0.05, min(1.0, args.tris / max(1, orig_tris)))
        try:
            dec.delimit = {"UV"}
        except Exception:
            pass
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.modifier_apply(modifier=dec.name)
    final_tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    print(f"[{args.key}] Mesh prepared: H={args.height:.2f}m, tris {orig_tris:,} -> {final_tris:,}")

    # 1) Smooth-by-Angle crisp bevel normals (identical to hero.glb)
    if apply_smooth_with_bevel_normals is not None:
        apply_smooth_with_bevel_normals(body, sharp_angle_deg=args.sharp_angle)
    else:
        _fallback_smooth_bevel(body, sharp_angle_deg=args.sharp_angle)

    # 2) Optional 4-view orthographic re-projection + Base Color pigment plane cleanup
    if args.mv_dir and not args.no_project and project_4view_onto_mesh is not None and os.path.isdir(args.mv_dir):
        if len(body.data.uv_layers) > 0 and len(body.data.materials) > 0:
            try:
                project_4view_onto_mesh(body, args.mv_dir, tex_size=args.tex_size)
                print(f"  + Projected 4-view orthographic art from {args.mv_dir}")
            except Exception as exc:
                print(f"  [WARN] 4-view projection skipped ({exc}); keeping Hunyuan3D texture")
    if args.pigment_clean > 0.0 and clean_pigment_planes is not None:
        try:
            clean_pigment_planes(body, strength=args.pigment_clean, sigma_color=0.11)
        except Exception as exc:
            print(f"  [WARN] Pigment cleanup skipped ({exc})")

    # 3) Clean tangent-space Normal Map bake from high-poly to decimated low-poly
    if high_obj is not None:
        try:
            bake_clean_normal_map(high_obj, body, f"{args.key}_Normal", size=args.tex_size, strength=0.32)
        except Exception as exc:
            print(f"  [WARN] Normal map bake skipped ({exc})")
        bpy.data.objects.remove(high_obj, do_unlink=True)

    # 4) Matte painterly Principled BSDF (identical to hero.glb)
    if configure_matte_painterly_material is not None:
        configure_matte_painterly_material(body)
    else:
        _fallback_matte_material(body)

    xs = [v.co.x for v in body.data.vertices]
    ys = [v.co.y for v in body.data.vertices]
    zs = [v.co.z for v in body.data.vertices]
    bbox = {
        "min_x": min(xs), "max_x": max(xs), "w": max(xs) - min(xs),
        "min_y": min(ys), "max_y": max(ys), "d": max(ys) - min(ys),
        "min_z": min(zs), "max_z": max(zs), "h": max(zs) - min(zs),
    }

    # Arm span: measure only the hand-to-shoulder band on the front half of the body, so
    # antlers (above), tails/sleeves trailing behind and robe hems (below) don't push the
    # arm bones outward past the real hands. 98th percentile ignores stray spike verts.
    h = bbox["h"]
    band = [v.co for v in body.data.vertices if 0.45 * h <= v.co.z - bbox["min_z"] <= 0.82 * h]
    mid_y = sorted(c.y for c in band)[len(band) // 2] if band else 0.0
    front_x = sorted(abs(c.x) for c in band if c.y <= mid_y)
    bbox["arm_w"] = 2.0 * front_x[int(0.98 * (len(front_x) - 1))] if front_x else bbox["w"]
    print(f"[{args.key}] Arm span {bbox['arm_w']:.2f}m (full bbox width {bbox['w']:.2f}m)")
    return body, bbox


def add_bone(ebones, name, head, tail, parent=None, deform=True):
    b = ebones.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if (b.tail - b.head).length < 1e-4:
        b.tail = b.head + Vector((0, 0, 0.05))
    b.use_deform = deform
    if parent:
        b.parent = ebones[parent]
    return b


def build_armature(key, archetype, bbox):
    arm_data = bpy.data.armatures.new(f"{key}_Rig")
    arm_obj = bpy.data.objects.new(f"{key}_Armature", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    H = bbox["h"]
    W = bbox["w"]
    AW = bbox["arm_w"]  # torso/arm band width; W stays for wings & quadruped legs
    D = bbox["d"]

    if archetype in ("humanoid", "robe"):
        sh_x = max(0.14 * H, min(0.24 * H, AW * 0.24))
        arm_x = max(sh_x + 0.18 * H, AW * 0.44)
        hip_x = sh_x * 0.48
        add_bone(eb, "root", (0, 0, 0), (0, 0, 0.12 * H), None, deform=False)
        add_bone(eb, "pelvis", (0, 0, 0.50 * H), (0, 0, 0.58 * H), "root")
        add_bone(eb, "spine", (0, 0, 0.58 * H), (0, 0, 0.70 * H), "pelvis")
        add_bone(eb, "chest", (0, 0, 0.70 * H), (0, 0, 0.82 * H), "spine")
        add_bone(eb, "neck", (0, 0, 0.82 * H), (0, 0, 0.87 * H), "chest")
        add_bone(eb, "head", (0, 0, 0.87 * H), (0, 0, 1.00 * H), "neck")
        for s, tag in ((-1, "l"), (1, "r")):
            add_bone(eb, f"upperarm_{tag}", (s * sh_x, 0, 0.79 * H), (s * (sh_x + (arm_x - sh_x) * 0.55), 0, 0.65 * H), "chest")
            add_bone(eb, f"forearm_{tag}", (s * (sh_x + (arm_x - sh_x) * 0.55), 0, 0.65 * H), (s * arm_x, 0, 0.51 * H), f"upperarm_{tag}")
            add_bone(eb, f"hand_{tag}", (s * arm_x, 0, 0.51 * H), (s * (arm_x + 0.05 * H), 0, 0.45 * H), f"forearm_{tag}")
            add_bone(eb, f"thigh_{tag}", (s * hip_x, 0, 0.50 * H), (s * hip_x, 0, 0.27 * H), "pelvis")
            add_bone(eb, f"shin_{tag}", (s * hip_x, 0, 0.27 * H), (s * hip_x, 0, 0.05 * H), f"thigh_{tag}")
            add_bone(eb, f"foot_{tag}", (s * hip_x, 0, 0.05 * H), (s * hip_x, -0.09 * H, 0.01 * H), f"shin_{tag}")
        if key == "gumiho_boss":
            # 3-bone fan for the nine tails behind the robe (22 bones total; prevents arm/leg tearing)
            ty = max(0.14 * H, 0.30 * D)
            add_bone(eb, "tail_mid", (0, 0.08 * H, 0.46 * H), (0, ty * 1.45, 0.78 * H), "pelvis")
            add_bone(eb, "tail_l", (-0.08 * H, 0.08 * H, 0.46 * H), (-0.34 * W, ty * 1.30, 0.70 * H), "pelvis")
            add_bone(eb, "tail_r", (0.08 * H, 0.08 * H, 0.46 * H), (0.34 * W, ty * 1.30, 0.70 * H), "pelvis")

    elif archetype == "float":
        sh_x = max(0.13 * H, min(0.22 * H, AW * 0.24))
        arm_x = max(sh_x + 0.18 * H, AW * 0.44)
        add_bone(eb, "root", (0, 0, 0), (0, 0, 0.12 * H), None, deform=False)
        add_bone(eb, "pelvis", (0, 0, 0.50 * H), (0, 0, 0.58 * H), "root")
        add_bone(eb, "skirt_mid", (0, 0, 0.50 * H), (0, 0, 0.26 * H), "pelvis")
        add_bone(eb, "skirt_hem", (0, 0, 0.26 * H), (0, 0, 0.03 * H), "skirt_mid")
        add_bone(eb, "spine", (0, 0, 0.58 * H), (0, 0, 0.71 * H), "pelvis")
        add_bone(eb, "chest", (0, 0, 0.71 * H), (0, 0, 0.83 * H), "spine")
        add_bone(eb, "head", (0, 0, 0.83 * H), (0, 0, 0.99 * H), "chest")
        for s, tag in ((-1, "l"), (1, "r")):
            add_bone(eb, f"upperarm_{tag}", (s * sh_x, 0, 0.79 * H), (s * (sh_x + (arm_x - sh_x) * 0.55), 0, 0.65 * H), "chest")
            add_bone(eb, f"forearm_{tag}", (s * (sh_x + (arm_x - sh_x) * 0.55), 0, 0.65 * H), (s * arm_x, 0, 0.51 * H), f"upperarm_{tag}")
            add_bone(eb, f"hand_{tag}", (s * arm_x, 0, 0.51 * H), (s * (arm_x + 0.05 * H), 0, 0.45 * H), f"forearm_{tag}")

    elif archetype == "avian":
        wing_mid = max(0.24 * H, W * 0.28)
        wing_tip = max(0.45 * H, W * 0.48)
        add_bone(eb, "root", (0, 0, 0), (0, 0, 0.10 * H), None, deform=False)
        add_bone(eb, "body", (0, 0, 0.50 * H), (0, -0.05 * H, 0.68 * H), "root")
        add_bone(eb, "head", (0, -0.05 * H, 0.68 * H), (0, -0.14 * H, 0.80 * H), "body")
        add_bone(eb, "tail_1", (0, 0.04 * H, 0.46 * H), (0, 0.14 * H, 0.25 * H), "body")
        add_bone(eb, "tail_2", (0, 0.14 * H, 0.25 * H), (0, 0.22 * H, 0.04 * H), "tail_1")
        for s, tag in ((-1, "l"), (1, "r")):
            add_bone(eb, f"wing_in_{tag}", (s * 0.08 * H, 0, 0.62 * H), (s * wing_mid, 0, 0.76 * H), "body")
            add_bone(eb, f"wing_out_{tag}", (s * wing_mid, 0, 0.76 * H), (s * wing_tip, 0, 0.94 * H), f"wing_in_{tag}")
            add_bone(eb, f"talon_{tag}", (s * 0.07 * H, -0.04 * H, 0.44 * H), (s * 0.08 * H, -0.08 * H, 0.24 * H), "body")

    elif archetype == "serpent":
        sh_x = max(0.14 * H, min(0.24 * H, AW * 0.24))
        arm_x = max(sh_x + 0.18 * H, AW * 0.44)
        add_bone(eb, "root", (0, 0, 0), (0, 0, 0.12 * H), None, deform=False)
        add_bone(eb, "pelvis", (0, 0, 0.48 * H), (0, 0, 0.56 * H), "root")
        add_bone(eb, "tail_1", (0, 0, 0.48 * H), (0, 0.06 * H, 0.34 * H), "pelvis")
        add_bone(eb, "tail_2", (0, 0.06 * H, 0.34 * H), (0, 0.12 * H, 0.18 * H), "tail_1")
        add_bone(eb, "tail_3", (0, 0.12 * H, 0.18 * H), (0, 0.16 * H, 0.04 * H), "tail_2")
        add_bone(eb, "spine", (0, 0, 0.56 * H), (0, 0, 0.69 * H), "pelvis")
        add_bone(eb, "chest", (0, 0, 0.69 * H), (0, 0, 0.80 * H), "spine")
        add_bone(eb, "neck", (0, 0, 0.80 * H), (0, 0, 0.88 * H), "chest")
        add_bone(eb, "head", (0, 0, 0.88 * H), (0, -0.06 * H, 0.99 * H), "neck")
        for s, tag in ((-1, "l"), (1, "r")):
            add_bone(eb, f"upperarm_{tag}", (s * sh_x, 0, 0.77 * H), (s * (sh_x + (arm_x - sh_x) * 0.55), 0, 0.64 * H), "chest")
            add_bone(eb, f"forearm_{tag}", (s * (sh_x + (arm_x - sh_x) * 0.55), 0, 0.64 * H), (s * arm_x, 0, 0.52 * H), f"upperarm_{tag}")
            add_bone(eb, f"hand_{tag}", (s * arm_x, 0, 0.52 * H), (s * (arm_x + 0.05 * H), 0, 0.47 * H), f"forearm_{tag}")

    elif archetype == "quadruped":
        fy = -max(0.28 * H, D * 0.30)
        by = max(0.28 * H, D * 0.30)
        lx = max(0.14 * H, W * 0.24)
        add_bone(eb, "root", (0, 0, 0), (0, 0, 0.10 * H), None, deform=False)
        add_bone(eb, "spine_mid", (0, 0, 0.60 * H), (0, fy * 0.45, 0.64 * H), "root")
        add_bone(eb, "spine_front", (0, fy * 0.45, 0.64 * H), (0, fy * 0.95, 0.68 * H), "spine_mid")
        add_bone(eb, "neck", (0, fy * 0.95, 0.68 * H), (0, fy * 1.25, 0.78 * H), "spine_front")
        add_bone(eb, "head", (0, fy * 1.25, 0.78 * H), (0, fy * 1.60, 0.76 * H), "neck")
        add_bone(eb, "spine_back", (0, 0, 0.60 * H), (0, by * 0.90, 0.58 * H), "spine_mid")
        add_bone(eb, "tail_1", (0, by * 0.90, 0.58 * H), (0, by * 1.35, 0.40 * H), "spine_back")
        add_bone(eb, "tail_2", (0, by * 1.35, 0.40 * H), (0, by * 1.55, 0.18 * H), "tail_1")
        for s, tag in ((-1, "l"), (1, "r")):
            add_bone(eb, f"leg_f{tag}_up", (s * lx, fy * 0.75, 0.58 * H), (s * lx, fy * 0.75, 0.30 * H), "spine_front")
            add_bone(eb, f"leg_f{tag}_lo", (s * lx, fy * 0.75, 0.30 * H), (s * lx, fy * 0.78, 0.03 * H), f"leg_f{tag}_up")
            add_bone(eb, f"leg_b{tag}_up", (s * lx, by * 0.75, 0.56 * H), (s * lx, by * 0.82, 0.28 * H), "spine_back")
            add_bone(eb, f"leg_b{tag}_lo", (s * lx, by * 0.82, 0.28 * H), (s * lx, by * 0.78, 0.03 * H), f"leg_b{tag}_up")

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def point_seg_dist(p, a, b):
    ab = b - a
    denom = ab.dot(ab)
    if denom < 1e-8:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / denom))
    return (p - (a + ab * t)).length


def _try_welded_bone_heat(body, arm_obj):
    """Run Blender Bone Heat on a temporary welded copy (fixing glTF UV-split seams),
    then Data-Transfer vertex weights back onto the UV-intact original mesh."""
    proxy = body.copy()
    proxy.data = body.data.copy()
    proxy.name = f"{body.name}_HeatProxy"
    bpy.context.collection.objects.link(proxy)

    bm = bmesh.new()
    bm.from_mesh(proxy.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0006)
    bm.to_mesh(proxy.data)
    bm.free()
    proxy.data.update()

    bpy.ops.object.select_all(action="DESELECT")
    proxy.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    heat_ok = False
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        weighted = sum(1 for v in proxy.data.vertices if sum(g.weight for g in v.groups) > 1e-4)
        heat_ok = weighted > 0.5 * max(1, len(proxy.data.vertices))
    except Exception:
        heat_ok = False

    if heat_ok:
        # Ensure original body has armature parent + matching vertex groups, then transfer
        bpy.ops.object.select_all(action="DESELECT")
        body.select_set(True)
        arm_obj.select_set(True)
        bpy.context.view_layer.objects.active = arm_obj
        bpy.ops.object.parent_set(type="ARMATURE_NAME")
        for vg in proxy.vertex_groups:
            if vg.name not in body.vertex_groups:
                body.vertex_groups.new(name=vg.name)

        dt = body.modifiers.new("HeatWeightTransfer", "DATA_TRANSFER")
        dt.object = proxy
        dt.use_vert_data = True
        dt.data_types_verts = {"VGROUP_WEIGHTS"}
        dt.vert_mapping = "NEAREST"
        bpy.ops.object.select_all(action="DESELECT")
        body.select_set(True)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.modifier_apply(modifier=dt.name)

    bpy.data.objects.remove(proxy, do_unlink=True)
    return heat_ok


def skin_mesh_to_armature(body, arm_obj, key, archetype, bbox):
    heat_ok = _try_welded_bone_heat(body, arm_obj)
    if not heat_ok:
        bpy.ops.object.select_all(action="DESELECT")
        body.select_set(True)
        arm_obj.select_set(True)
        bpy.context.view_layer.objects.active = arm_obj
        try:
            bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        except Exception:
            bpy.ops.object.parent_set(type="ARMATURE_NAME")

    deform_bones = [(b.name, b.head_local.copy(), b.tail_local.copy())
                    for b in arm_obj.data.bones if b.use_deform]
    for bname, _, _ in deform_bones:
        if bname not in body.vertex_groups:
            body.vertex_groups.new(name=bname)

    unweighted = 0
    sharpness = 2.6 if archetype == "robe" else 3.8
    for v in body.data.vertices:
        total = sum(g.weight for g in v.groups)
        if total < 1e-4:
            unweighted += 1
            dists = [(bname, point_seg_dist(v.co, a, b)) for bname, a, b in deform_bones]
            dists.sort(key=lambda it: it[1])
            top = dists[:3]
            raw = [(bn, 1.0 / ((d + 0.035) ** sharpness)) for bn, d in top]
            s = sum(w for _, w in raw) or 1.0
            for bn, w in raw:
                body.vertex_groups[bn].add([v.index], w / s, "REPLACE")

    # Smooth weights before rigid overrides
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    iters = 6 if archetype in ("robe", "float") else 3
    try:
        bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=0.55, repeat=iters)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="BONE_DEFORM", lock_active=False)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")

    # Specialized anatomical locks to prevent tail tearing & horn/antler scattering
    H = bbox["h"]
    D = bbox["d"]
    if key == "gumiho_boss" and "tail_mid" in body.vertex_groups:
        tail_bones = [(b.name, b.head_local.copy(), b.tail_local.copy())
                      for b in arm_obj.data.bones if b.name in ("tail_mid", "tail_l", "tail_r")]
        y_cut = 0.14 * D
        tail_locked = 0
        for v in body.data.vertices:
            if v.co.y > y_cut and 0.12 * H <= v.co.z <= 0.99 * H:
                for vg in body.vertex_groups:
                    vg.remove([v.index])
                raw = [(bn, 1.0 / ((point_seg_dist(v.co, a, b) + 0.04) ** 2.8)) for bn, a, b in tail_bones]
                s = sum(w for _, w in raw) or 1.0
                for bn, w in raw:
                    body.vertex_groups[bn].add([v.index], w / s, "REPLACE")
                tail_locked += 1
        print(f"  + Isolated Gumiho tail fan vertices ({tail_locked} verts -> tail_mid/l/r)")

    if key in HEAD_LOCK_KEYS and "head" in body.vertex_groups:
        z_cut = 0.87 * H
        head_locked = 0
        for v in body.data.vertices:
            if v.co.z >= z_cut:
                for vg in body.vertex_groups:
                    vg.remove([v.index])
                body.vertex_groups["head"].add([v.index], 1.0, "REPLACE")
                head_locked += 1
        print(f"  + Locked horns/crown/hat vertices ({head_locked} verts -> head)")

    print(
        f"  + Skinned ({archetype}, {len(deform_bones)} deform bones, "
        f"welded_heat={heat_ok}, fallback_verts={unweighted}, smooth_iters={iters})"
    )


def set_pose_key(arm_obj, frame, rot_map, loc_map=None):
    bpy.context.scene.frame_set(frame)
    loc_map = loc_map or {}
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "XYZ"
        if pb.name in rot_map:
            rx, ry, rz = rot_map[pb.name]
            pb.rotation_euler = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), "XYZ")
            pb.keyframe_insert(data_path="rotation_euler", frame=frame)
        if pb.name in loc_map:
            # loc_map offsets are authored in world/armature axes (z = up, -y = forward);
            # pose-bone location is in the bone's own rest axes, so rotate into bone space.
            pb.location = pb.bone.matrix_local.to_3x3().inverted() @ Vector(loc_map[pb.name])
            pb.keyframe_insert(data_path="location", frame=frame)


def build_action(arm_obj, name, frames_data):
    action = bpy.data.actions.new(name=name)
    if not arm_obj.animation_data:
        arm_obj.animation_data_create()
    arm_obj.animation_data.action = action
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)
    for frame, rot_map, loc_map in frames_data:
        set_pose_key(arm_obj, frame, rot_map, loc_map)
    track = arm_obj.animation_data.nla_tracks.new()
    track.name = name
    start_f = frames_data[0][0]
    strip = track.strips.new(name, start_f, action)
    strip.name = name
    arm_obj.animation_data.action = None


def create_archetype_animations(arm_obj, key, archetype, H):
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="POSE")
    bpy.context.scene.render.fps = 30
    has_gumiho_tails = key == "gumiho_boss" and "tail_mid" in arm_obj.pose.bones

    if archetype in ("humanoid", "robe"):
        stride = 14.0 if archetype == "robe" else 30.0
        knee = 12.0 if archetype == "robe" else 28.0
        arm_sw = 18.0 if archetype == "robe" else 26.0
        t_idle_a = {"tail_mid": (0, 0, 5), "tail_l": (4, 0, 8), "tail_r": (4, 0, -8)} if has_gumiho_tails else {}
        t_idle_b = {"tail_mid": (0, 0, -5), "tail_l": (-4, 0, -6), "tail_r": (-4, 0, 6)} if has_gumiho_tails else {}
        t_walk_a = {"tail_mid": (4, 0, 8), "tail_l": (6, 0, 10), "tail_r": (-4, 0, 6)} if has_gumiho_tails else {}
        t_walk_b = {"tail_mid": (4, 0, -8), "tail_l": (-4, 0, -6), "tail_r": (6, 0, -10)} if has_gumiho_tails else {}
        t_atk_a = {"tail_mid": (-8, 0, 0), "tail_l": (-10, 0, 14), "tail_r": (-10, 0, -14)} if has_gumiho_tails else {}
        t_atk_b = {"tail_mid": (10, 0, 0), "tail_l": (8, 0, -8), "tail_r": (8, 0, 8)} if has_gumiho_tails else {}

        build_action(arm_obj, "Idle", [
            (1,  {"chest": (0, 0, 0), "head": (0, 0, 0), "upperarm_l": (0, 0, -6), "upperarm_r": (0, 0, 6), **t_idle_a}, {"pelvis": (0, 0, 0)}),
            (20, {"chest": (3, 0, 0), "head": (-2, 0, 0), "upperarm_l": (2, 0, -8), "upperarm_r": (2, 0, 8), **t_idle_b}, {"pelvis": (0, 0, 0.015 * H)}),
            (40, {"chest": (0, 0, 0), "head": (0, 0, 0), "upperarm_l": (0, 0, -6), "upperarm_r": (0, 0, 6), **t_idle_a}, {"pelvis": (0, 0, 0)}),
        ])
        build_action(arm_obj, "Walk", [
            (1,  {"pelvis": (0, 0, 3), "chest": (4, 0, -4), "thigh_l": (stride, 0, 0), "shin_l": (-knee * 0.4, 0, 0), "thigh_r": (-stride, 0, 0), "shin_r": (-knee, 0, 0), "upperarm_l": (-arm_sw, 0, -5), "upperarm_r": (arm_sw, 0, 5), **t_walk_a}, {"pelvis": (0, 0, 0.01 * H)}),
            (13, {"pelvis": (0, 0, -3), "chest": (4, 0, 4), "thigh_l": (-stride, 0, 0), "shin_l": (-knee, 0, 0), "thigh_r": (stride, 0, 0), "shin_r": (-knee * 0.4, 0, 0), "upperarm_l": (arm_sw, 0, -5), "upperarm_r": (-arm_sw, 0, 5), **t_walk_b}, {"pelvis": (0, 0, 0.01 * H)}),
            (25, {"pelvis": (0, 0, 3), "chest": (4, 0, -4), "thigh_l": (stride, 0, 0), "shin_l": (-knee * 0.4, 0, 0), "thigh_r": (-stride, 0, 0), "shin_r": (-knee, 0, 0), "upperarm_l": (-arm_sw, 0, -5), "upperarm_r": (arm_sw, 0, 5), **t_walk_a}, {"pelvis": (0, 0, 0.01 * H)}),
        ])
        # Moderated Attack twist & Hit head snapback (per QA report)
        build_action(arm_obj, "Attack", [
            (1,  {"chest": (0, 0, 0), "upperarm_r": (0, 0, 6), "forearm_r": (0, 0, 0), **t_idle_a}, {"pelvis": (0, 0, 0)}),
            (9,  {"chest": (-10, 0, -16), "upperarm_r": (-72, 0, 26), "forearm_r": (-32, 0, 0), "upperarm_l": (16, 0, -16), **t_atk_a}, {"pelvis": (0, 0, -0.02 * H)}),
            (15, {"chest": (16, 0, 20), "upperarm_r": (48, 0, -14), "forearm_r": (-14, 0, 0), "upperarm_l": (-22, 0, -12), **t_atk_b}, {"pelvis": (0, -0.05 * H, -0.03 * H)}),
            (26, {"chest": (0, 0, 0), "upperarm_r": (0, 0, 6), "forearm_r": (0, 0, 0), **t_idle_a}, {"pelvis": (0, 0, 0)}),
        ])
        build_action(arm_obj, "Hit", [
            (1,  {"chest": (0, 0, 0), "head": (0, 0, 0)}, {}),
            (5,  {"chest": (-14, 0, 6), "head": (-10, 0, 0), "upperarm_l": (-16, 0, -16), "upperarm_r": (-16, 0, 16)}, {}),
            (13, {"chest": (0, 0, 0), "head": (0, 0, 0)}, {}),
        ])
        build_action(arm_obj, "Die", [
            (1,  {"pelvis": (0, 0, 0), "chest": (0, 0, 0)}, {"pelvis": (0, 0, 0)}),
            (18, {"pelvis": (-78, 0, 0), "chest": (-12, 0, 0), "upperarm_l": (-35, 0, -35), "upperarm_r": (-35, 0, 35)}, {"pelvis": (0, 0, -0.44 * H)}),
        ])

    elif archetype == "float":
        build_action(arm_obj, "Idle", [
            (1,  {"chest": (0, 0, 0), "skirt_mid": (4, 0, 0), "skirt_hem": (6, 0, 0), "upperarm_l": (10, 0, -12), "upperarm_r": (10, 0, 12)}, {"pelvis": (0, 0, 0.02 * H)}),
            (20, {"chest": (4, 0, 0), "skirt_mid": (-5, 0, 0), "skirt_hem": (-8, 0, 0), "upperarm_l": (16, 0, -16), "upperarm_r": (16, 0, 16)}, {"pelvis": (0, 0, 0.08 * H)}),
            (40, {"chest": (0, 0, 0), "skirt_mid": (4, 0, 0), "skirt_hem": (6, 0, 0), "upperarm_l": (10, 0, -12), "upperarm_r": (10, 0, 12)}, {"pelvis": (0, 0, 0.02 * H)}),
        ])
        build_action(arm_obj, "Walk", [
            (1,  {"chest": (12, 0, 0), "skirt_mid": (16, 0, 5), "skirt_hem": (22, 0, 8), "upperarm_l": (28, 0, -10), "upperarm_r": (28, 0, 10)}, {"pelvis": (0, 0, 0.05 * H)}),
            (13, {"chest": (14, 0, 0), "skirt_mid": (12, 0, -5), "skirt_hem": (18, 0, -8), "upperarm_l": (32, 0, -12), "upperarm_r": (32, 0, 12)}, {"pelvis": (0, 0, 0.11 * H)}),
            (25, {"chest": (12, 0, 0), "skirt_mid": (16, 0, 5), "skirt_hem": (22, 0, 8), "upperarm_l": (28, 0, -10), "upperarm_r": (28, 0, 10)}, {"pelvis": (0, 0, 0.05 * H)}),
        ])
        build_action(arm_obj, "Attack", [
            (1,  {"chest": (0, 0, 0), "upperarm_l": (10, 0, -12), "upperarm_r": (10, 0, 12)}, {"pelvis": (0, 0, 0.04 * H)}),
            (8,  {"chest": (-14, 0, 0), "upperarm_l": (-52, 0, -24), "upperarm_r": (-52, 0, 24), "skirt_mid": (-12, 0, 0)}, {"pelvis": (0, 0, 0.11 * H)}),
            (15, {"chest": (20, 0, 0), "upperarm_l": (62, 0, -8), "upperarm_r": (62, 0, 8), "skirt_mid": (22, 0, 0)}, {"pelvis": (0, -0.07 * H, 0.02 * H)}),
            (25, {"chest": (0, 0, 0), "upperarm_l": (10, 0, -12), "upperarm_r": (10, 0, 12)}, {"pelvis": (0, 0, 0.04 * H)}),
        ])
        build_action(arm_obj, "Hit", [
            (1,  {"chest": (0, 0, 0)}, {}),
            (5,  {"chest": (-18, 0, 0), "head": (-10, 0, 0), "skirt_mid": (-12, 0, 0)}, {}),
            (13, {"chest": (0, 0, 0)}, {}),
        ])
        build_action(arm_obj, "Die", [
            (1,  {"pelvis": (0, 0, 0)}, {"pelvis": (0, 0, 0.04 * H)}),
            (18, {"pelvis": (-70, 0, 0), "skirt_mid": (28, 0, 0)}, {"pelvis": (0, 0, -0.45 * H)}),
        ])

    elif archetype == "avian":
        build_action(arm_obj, "Idle", [
            (1,  {"wing_in_l": (0, 18, 0), "wing_out_l": (0, 12, 0), "wing_in_r": (0, -18, 0), "wing_out_r": (0, -12, 0), "tail_1": (6, 0, 0)}, {"body": (0, 0, 0.02 * H)}),
            (12, {"wing_in_l": (0, -34, 0), "wing_out_l": (0, -24, 0), "wing_in_r": (0, 34, 0), "wing_out_r": (0, 24, 0), "tail_1": (-8, 0, 0)}, {"body": (0, 0, 0.12 * H)}),
            (24, {"wing_in_l": (0, 18, 0), "wing_out_l": (0, 12, 0), "wing_in_r": (0, -18, 0), "wing_out_r": (0, -12, 0), "tail_1": (6, 0, 0)}, {"body": (0, 0, 0.02 * H)}),
        ])
        build_action(arm_obj, "Walk", [
            (1,  {"body": (14, 0, 0), "wing_in_l": (0, 26, 0), "wing_out_l": (0, 20, 0), "wing_in_r": (0, -26, 0), "wing_out_r": (0, -20, 0)}, {"body": (0, 0, 0.04 * H)}),
            (9,  {"body": (14, 0, 0), "wing_in_l": (0, -45, 0), "wing_out_l": (0, -32, 0), "wing_in_r": (0, 45, 0), "wing_out_r": (0, 32, 0)}, {"body": (0, 0, 0.14 * H)}),
            (18, {"body": (14, 0, 0), "wing_in_l": (0, 26, 0), "wing_out_l": (0, 20, 0), "wing_in_r": (0, -26, 0), "wing_out_r": (0, -20, 0)}, {"body": (0, 0, 0.04 * H)}),
        ])
        build_action(arm_obj, "Attack", [
            (1,  {"body": (0, 0, 0), "talon_l": (0, 0, 0), "talon_r": (0, 0, 0)}, {"body": (0, 0, 0.06 * H)}),
            (8,  {"body": (-20, 0, 0), "wing_in_l": (0, 38, 0), "wing_in_r": (0, -38, 0), "talon_l": (35, 0, 0), "talon_r": (35, 0, 0)}, {"body": (0, 0, 0.16 * H)}),
            (15, {"body": (30, 0, 0), "wing_in_l": (0, -30, 0), "wing_in_r": (0, 30, 0), "talon_l": (-28, 0, 0), "talon_r": (-28, 0, 0)}, {"body": (0, -0.10 * H, -0.02 * H)}),
            (24, {"body": (0, 0, 0), "talon_l": (0, 0, 0), "talon_r": (0, 0, 0)}, {"body": (0, 0, 0.06 * H)}),
        ])
        build_action(arm_obj, "Hit", [
            (1,  {"body": (0, 0, 0)}, {}),
            (5,  {"body": (-18, 0, 8), "head": (-10, 0, 0)}, {}),
            (12, {"body": (0, 0, 0)}, {}),
        ])
        build_action(arm_obj, "Die", [
            (1,  {"body": (0, 0, 0)}, {"body": (0, 0, 0.06 * H)}),
            (18, {"body": (85, 0, 20), "wing_in_l": (0, -50, 0), "wing_in_r": (0, 50, 0)}, {"body": (0, 0, -0.45 * H)}),
        ])

    elif archetype == "serpent":
        build_action(arm_obj, "Idle", [
            (1,  {"spine": (0, 0, 6), "chest": (0, 0, -6), "tail_1": (0, 0, 12), "tail_2": (0, 0, -16), "tail_3": (0, 0, 12)}, {"pelvis": (0, 0, 0)}),
            (20, {"spine": (0, 0, -6), "chest": (0, 0, 6), "tail_1": (0, 0, -12), "tail_2": (0, 0, 16), "tail_3": (0, 0, -12)}, {"pelvis": (0, 0, 0.02 * H)}),
            (40, {"spine": (0, 0, 6), "chest": (0, 0, -6), "tail_1": (0, 0, 12), "tail_2": (0, 0, -16), "tail_3": (0, 0, 12)}, {"pelvis": (0, 0, 0)}),
        ])
        build_action(arm_obj, "Walk", [
            (1,  {"pelvis": (0, 0, 12), "spine": (6, 0, -10), "tail_1": (0, 0, 22), "tail_2": (0, 0, -28), "tail_3": (0, 0, 24)}, {"pelvis": (0, 0, 0)}),
            (13, {"pelvis": (0, 0, -12), "spine": (6, 0, 10), "tail_1": (0, 0, -22), "tail_2": (0, 0, 28), "tail_3": (0, 0, -24)}, {"pelvis": (0, 0, 0)}),
            (25, {"pelvis": (0, 0, 12), "spine": (6, 0, -10), "tail_1": (0, 0, 22), "tail_2": (0, 0, -28), "tail_3": (0, 0, 24)}, {"pelvis": (0, 0, 0)}),
        ])
        build_action(arm_obj, "Attack", [
            (1,  {"spine": (0, 0, 0), "chest": (0, 0, 0), "upperarm_r": (0, 0, 8)}, {"pelvis": (0, 0, 0)}),
            (10, {"spine": (-14, 0, -14), "chest": (-10, 0, -10), "upperarm_r": (-68, 0, 22), "upperarm_l": (-30, 0, -20)}, {"pelvis": (0, 0.05 * H, 0.04 * H)}),
            (16, {"spine": (22, 0, 14), "chest": (16, 0, 12), "upperarm_r": (55, 0, -14), "upperarm_l": (35, 0, 12)}, {"pelvis": (0, -0.09 * H, -0.02 * H)}),
            (28, {"spine": (0, 0, 0), "chest": (0, 0, 0), "upperarm_r": (0, 0, 8)}, {"pelvis": (0, 0, 0)}),
        ])
        build_action(arm_obj, "Hit", [
            (1,  {"chest": (0, 0, 0)}, {}),
            (5,  {"chest": (-16, 0, 8), "head": (-10, 0, 0)}, {}),
            (13, {"chest": (0, 0, 0)}, {}),
        ])
        build_action(arm_obj, "Die", [
            (1,  {"pelvis": (0, 0, 0), "spine": (0, 0, 0)}, {"pelvis": (0, 0, 0)}),
            (20, {"pelvis": (72, 0, 0), "spine": (18, 0, 0)}, {"pelvis": (0, 0, -0.40 * H)}),
        ])

    elif archetype == "quadruped":
        build_action(arm_obj, "Idle", [
            (1,  {"spine_front": (0, 0, 0), "head": (0, 0, 0), "tail_1": (0, 0, 14), "tail_2": (0, 0, 18)}, {"spine_mid": (0, 0, 0)}),
            (20, {"spine_front": (3, 0, 0), "head": (-4, 0, 0), "tail_1": (0, 0, -14), "tail_2": (0, 0, -18)}, {"spine_mid": (0, 0, -0.02 * H)}),
            (40, {"spine_front": (0, 0, 0), "head": (0, 0, 0), "tail_1": (0, 0, 14), "tail_2": (0, 0, 18)}, {"spine_mid": (0, 0, 0)}),
        ])
        build_action(arm_obj, "Walk", [
            (1,  {"spine_mid": (6, 0, 0), "leg_fl_up": (32, 0, 0), "leg_fl_lo": (-22, 0, 0), "leg_fr_up": (-26, 0, 0), "leg_bl_up": (-28, 0, 0), "leg_br_up": (30, 0, 0), "tail_1": (0, 0, 12)}, {"spine_mid": (0, 0, 0.03 * H)}),
            (11, {"spine_mid": (-6, 0, 0), "leg_fl_up": (-26, 0, 0), "leg_fl_lo": (-10, 0, 0), "leg_fr_up": (32, 0, 0), "leg_bl_up": (30, 0, 0), "leg_br_up": (-28, 0, 0), "tail_1": (0, 0, -12)}, {"spine_mid": (0, 0, -0.02 * H)}),
            (21, {"spine_mid": (6, 0, 0), "leg_fl_up": (32, 0, 0), "leg_fl_lo": (-22, 0, 0), "leg_fr_up": (-26, 0, 0), "leg_bl_up": (-28, 0, 0), "leg_br_up": (30, 0, 0), "tail_1": (0, 0, 12)}, {"spine_mid": (0, 0, 0.03 * H)}),
        ])
        build_action(arm_obj, "Attack", [
            (1,  {"spine_mid": (0, 0, 0), "leg_fl_up": (0, 0, 0), "leg_fr_up": (0, 0, 0)}, {"spine_mid": (0, 0, 0)}),
            (8,  {"spine_mid": (-22, 0, 0), "leg_fl_up": (42, 0, 0), "leg_fr_up": (42, 0, 0), "head": (12, 0, 0)}, {"spine_mid": (0, 0, 0.14 * H)}),
            (15, {"spine_mid": (16, 0, 0), "leg_fl_up": (-35, 0, 0), "leg_fr_up": (-35, 0, 0), "head": (-10, 0, 0)}, {"spine_mid": (0, -0.14 * H, -0.04 * H)}),
            (24, {"spine_mid": (0, 0, 0), "leg_fl_up": (0, 0, 0), "leg_fr_up": (0, 0, 0)}, {"spine_mid": (0, 0, 0)}),
        ])
        build_action(arm_obj, "Hit", [
            (1,  {"spine_front": (0, 0, 0)}, {}),
            (5,  {"spine_front": (-16, 0, 0)}, {}),
            (12, {"spine_front": (0, 0, 0)}, {}),
        ])
        build_action(arm_obj, "Die", [
            (1,  {"spine_mid": (0, 0, 0)}, {"spine_mid": (0, 0, 0)}),
            (18, {"spine_mid": (0, 82, 0)}, {"spine_mid": (0, 0, -0.42 * H)}),
        ])

    bpy.ops.object.mode_set(mode="OBJECT")


def verify_export(body, arm_obj, key):
    """Sanity-check triangle budget, deform bones, weights, and all 5 NLA clips."""
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    deform_bones = [b.name for b in arm_obj.data.bones if b.use_deform]
    unweighted = sum(1 for v in body.data.vertices if sum(g.weight for g in v.groups) < 1e-4)
    tracks = [t.name for t in (arm_obj.animation_data.nla_tracks if arm_obj.animation_data else [])]
    expected = {"Idle", "Walk", "Attack", "Hit", "Die"}
    missing = sorted(expected - set(tracks))
    print(
        f"[{key}] VERIFY: tris={tris:,}, deform_bones={len(deform_bones)}, "
        f"unweighted={unweighted}, clips={tracks}"
    )
    if missing:
        raise RuntimeError(f"[{key}] Missing required NLA clips: {missing}")
    if unweighted > 0:
        raise RuntimeError(f"[{key}] Found {unweighted} unweighted vertices")


def render_preview(body, arm_obj, bbox, preview_path):
    """Render a clean 3/4 neutral studio preview PNG for visual inspection."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.image_settings.file_format = "PNG"

    if not scene.world:
        scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.08, 0.08, 0.10, 1.0)
        bg.inputs[1].default_value = 0.7

    H = bbox["h"]
    dist = max(2.2, max(H, bbox["w"]) * 2.15)
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = Vector((dist * 0.42, -dist * 0.92, H * 0.56))
    direction = Vector((0.0, 0.0, H * 0.50)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    key_data = bpy.data.lights.new("KeyLight", type="AREA")
    key_data.energy = 180.0 * (H / 1.85) ** 2
    key_data.size = 2.0
    key_obj = bpy.data.objects.new("KeyLight", key_data)
    bpy.context.collection.objects.link(key_obj)
    key_obj.location = Vector((dist * 0.6, -dist * 0.7, H * 1.35))
    key_obj.rotation_euler = (Vector((0, 0, H * 0.5)) - key_obj.location).to_track_quat("-Z", "Y").to_euler()

    rim_data = bpy.data.lights.new("RimLight", type="AREA")
    rim_data.energy = 260.0 * (H / 1.85) ** 2
    rim_data.size = 1.6
    rim_obj = bpy.data.objects.new("RimLight", rim_data)
    bpy.context.collection.objects.link(rim_obj)
    rim_obj.location = Vector((-dist * 0.65, dist * 0.55, H * 1.15))
    rim_obj.rotation_euler = (Vector((0, 0, H * 0.55)) - rim_obj.location).to_track_quat("-Z", "Y").to_euler()

    os.makedirs(os.path.dirname(os.path.abspath(preview_path)), exist_ok=True)
    scene.render.filepath = os.path.abspath(preview_path)
    bpy.ops.render.render(write_still=True)
    print(f"  + Rendered preview: {preview_path}")

    for tmp in (cam_obj, key_obj, rim_obj):
        bpy.data.objects.remove(tmp, do_unlink=True)


def main():
    args = parse_args()
    clear_scene()
    body, bbox = import_and_prepare_mesh(args)
    arm_obj = build_armature(args.key, args.archetype, bbox)
    skin_mesh_to_armature(body, arm_obj, args.key, args.archetype, bbox)
    create_archetype_animations(arm_obj, args.key, args.archetype, bbox["h"])
    verify_export(body, arm_obj, args.key)

    if args.preview_out:
        render_preview(body, arm_obj, bbox, args.preview_out)

    # Pack textures & save editable .blend so user can fine-tune bones/weights/keyframes in Blender UI
    if args.out_blend:
        os.makedirs(os.path.dirname(os.path.abspath(args.out_blend)), exist_ok=True)
        try:
            bpy.ops.file.pack_all()
        except Exception:
            pass
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.out_blend))
        print(f"[{args.key}] Saved editable Blender file: {args.out_blend}")

    # Export clean GLB with NLA tracks
    os.makedirs(os.path.dirname(os.path.abspath(args.out_glb)), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    export_kwargs = dict(
        filepath=os.path.abspath(args.out_glb),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_skins=True,
        export_materials="EXPORT",
    )
    if bpy.app.version >= (4, 0, 0):
        export_kwargs["export_animation_mode"] = "NLA_TRACKS"
        export_kwargs["export_image_format"] = "WEBP"
    else:
        export_kwargs["export_nla_strips"] = True
        export_kwargs["export_image_format"] = "AUTO"
    bpy.ops.export_scene.gltf(**export_kwargs)
    print(f"[{args.key}] Exported rigged GLB: {args.out_glb}")


if __name__ == "__main__":
    main()
