"""Blender 5.x archetype-specific rigging & animation builder for Ember & Blade Korean monsters.

Supports 6 dedicated rig archetypes so every body plan deforms cleanly without tearing:
  - humanoid  : 19-bone bipedal rig (skeleton, jangseung, bomber, dokkaebi, susal, bulgasari)
  - float     : 13-bone floating robe/ghost rig (zero leg tearing; skirt chain + hover sway)
  - robe      : 19-bone long-robe bipedal rig (damped stride + smooth hem blending)
  - avian     : 12-bone winged bird rig (samjoko wingbeats + talon rake)
  - serpent   : 15-bone serpent-tail + bipedal torso rig (imugi S-wave slither + upper strike)
  - quadruped : 18-bone four-legged feline rig (jangsanbeom prowl/gallop + lunge)

Always saves an editable `.blend` (with packed textures) alongside the exported `.glb`
containing 5 game-ready NLA clips: Idle, Walk, Attack, Hit, Die.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Euler, Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="in_glb", required=True)
    p.add_argument("--out", dest="out_glb", required=True)
    p.add_argument("--blend", dest="out_blend", default="")
    p.add_argument("--key", required=True)
    p.add_argument("--archetype", choices=["humanoid", "float", "robe", "avian", "serpent", "quadruped"], required=True)
    p.add_argument("--height", type=float, default=1.85)
    p.add_argument("--tris", type=int, default=8500)
    p.add_argument("--rot-z-deg", type=float, default=0.0, help="Extra Z rotation if Hunyuan3D faces another axis")
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_and_prepare_mesh(in_glb, key, target_h, target_tris, rot_z_deg=0.0):
    bpy.ops.import_scene.gltf(filepath=in_glb)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh objects found in {in_glb}")

    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = f"{key}_Mesh"

    # Remove non-mesh leftovers (empty parents, cameras, lights)
    for o in list(bpy.context.scene.objects):
        if o != body:
            bpy.data.objects.remove(o, do_unlink=True)

    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if abs(rot_z_deg) > 1e-3:
        body.rotation_euler = Euler((0.0, 0.0, math.radians(rot_z_deg)), "XYZ")
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    # Measure world bbox, center X/Y, ground Z=0, scale uniformly to target_h
    xs = [v.co.x for v in body.data.vertices]
    ys = [v.co.y for v in body.data.vertices]
    zs = [v.co.z for v in body.data.vertices]
    cx = 0.5 * (min(xs) + max(xs))
    cy = 0.5 * (min(ys) + max(ys))
    min_z = min(zs)
    cur_h = max(1e-4, max(zs) - min_z)
    sc = target_h / cur_h

    for v in body.data.vertices:
        v.co.x = (v.co.x - cx) * sc
        v.co.y = (v.co.y - cy) * sc
        v.co.z = (v.co.z - min_z) * sc
    body.data.update()

    # Decimate to mobile triangle budget while preserving UV seams
    orig_tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    if orig_tris > target_tris:
        dec = body.modifiers.new("DecimateMobile", "DECIMATE")
        dec.ratio = max(0.05, min(1.0, target_tris / max(1, orig_tris)))
        bpy.ops.object.modifier_apply(modifier=dec.name)
    final_tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    print(f"[{key}] Mesh prepared: H={target_h:.2f}m, tris {orig_tris:,} -> {final_tris:,}")

    # Smooth shading + Ember & Blade matte painterly material setup
    for p in body.data.polygons:
        p.use_smooth = True
    for mat in body.data.materials:
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                if "Roughness" in node.inputs and not node.inputs["Roughness"].is_linked:
                    node.inputs["Roughness"].default_value = 0.88
                if "Metallic" in node.inputs and not node.inputs["Metallic"].is_linked:
                    node.inputs["Metallic"].default_value = 0.05
                if "Specular IOR Level" in node.inputs and not node.inputs["Specular IOR Level"].is_linked:
                    node.inputs["Specular IOR Level"].default_value = 0.14

    xs = [v.co.x for v in body.data.vertices]
    ys = [v.co.y for v in body.data.vertices]
    zs = [v.co.z for v in body.data.vertices]
    bbox = {
        "min_x": min(xs), "max_x": max(xs), "w": max(xs) - min(xs),
        "min_y": min(ys), "max_y": max(ys), "d": max(ys) - min(ys),
        "min_z": min(zs), "max_z": max(zs), "h": max(zs) - min(zs),
    }
    return body, bbox


def add_bone(ebones, name, head, tail, parent=None, deform=True):
    b = ebones.new(name)
    b.head = Vector(head)
    t = Vector(tail)
    if (t - b.head).length < 1e-3:
        t = b.head + Vector((0, 0, 0.05))
    b.tail = t
    b.use_deform = deform
    if parent:
        b.parent = ebones[parent]
    return b


def build_armature(key, archetype, bbox):
    arm_data = bpy.data.armatures.new(f"{key}_RigData")
    arm_obj = bpy.data.objects.new(f"{key}_Armature", arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    H = bbox["h"]
    W = bbox["w"]
    D = bbox["d"]

    if archetype in ("humanoid", "robe"):
        sh_x = max(0.14 * H, min(0.24 * H, W * 0.24))
        arm_x = max(sh_x + 0.18 * H, W * 0.44)
        hip_x = sh_x * 0.48
        add_bone(eb, "root", (0, 0, 0), (0, 0, 0.12 * H), None, deform=False)
        add_bone(eb, "pelvis", (0, 0, 0.50 * H), (0, 0, 0.58 * H), "root")
        add_bone(eb, "spine", (0, 0, 0.58 * H), (0, 0, 0.70 * H), "pelvis")
        add_bone(eb, "chest", (0, 0, 0.70 * H), (0, 0, 0.82 * H), "spine")
        add_bone(eb, "neck", (0, 0, 0.82 * H), (0, 0, 0.88 * H), "chest")
        add_bone(eb, "head", (0, 0, 0.88 * H), (0, 0, 0.99 * H), "neck")
        for s, tag in ((1, "l"), (-1, "r")):
            add_bone(eb, f"shoulder_{tag}", (s * 0.04 * H, 0, 0.80 * H), (s * sh_x, 0, 0.79 * H), "chest")
            add_bone(eb, f"upperarm_{tag}", (s * sh_x, 0, 0.79 * H), (s * (sh_x + (arm_x - sh_x) * 0.52), 0, 0.65 * H), f"shoulder_{tag}")
            add_bone(eb, f"forearm_{tag}", (s * (sh_x + (arm_x - sh_x) * 0.52), 0, 0.65 * H), (s * arm_x, 0, 0.51 * H), f"upperarm_{tag}")
            add_bone(eb, f"hand_{tag}", (s * arm_x, 0, 0.51 * H), (s * (arm_x + 0.05 * H), 0, 0.44 * H), f"forearm_{tag}")
            add_bone(eb, f"thigh_{tag}", (s * hip_x, 0, 0.50 * H), (s * hip_x, 0, 0.27 * H), "pelvis")
            add_bone(eb, f"shin_{tag}", (s * hip_x, 0, 0.27 * H), (s * hip_x, 0, 0.05 * H), f"thigh_{tag}")
            add_bone(eb, f"foot_{tag}", (s * hip_x, 0, 0.05 * H), (s * hip_x, -0.09 * H, 0.01 * H), f"shin_{tag}")

    elif archetype == "float":
        sh_x = max(0.13 * H, min(0.22 * H, W * 0.24))
        arm_x = max(sh_x + 0.18 * H, W * 0.44)
        add_bone(eb, "root", (0, 0, 0), (0, 0, 0.12 * H), None, deform=False)
        add_bone(eb, "pelvis", (0, 0, 0.50 * H), (0, 0, 0.58 * H), "root")
        add_bone(eb, "skirt_mid", (0, 0, 0.50 * H), (0, 0, 0.26 * H), "pelvis")
        add_bone(eb, "skirt_hem", (0, 0, 0.26 * H), (0, 0, 0.02 * H), "skirt_mid")
        add_bone(eb, "spine", (0, 0, 0.58 * H), (0, 0, 0.70 * H), "pelvis")
        add_bone(eb, "chest", (0, 0, 0.70 * H), (0, 0, 0.82 * H), "spine")
        add_bone(eb, "neck", (0, 0, 0.82 * H), (0, 0, 0.88 * H), "chest")
        add_bone(eb, "head", (0, 0, 0.88 * H), (0, 0, 0.99 * H), "neck")
        for s, tag in ((1, "l"), (-1, "r")):
            add_bone(eb, f"upperarm_{tag}", (s * sh_x, 0, 0.79 * H), (s * (sh_x + (arm_x - sh_x) * 0.52), 0, 0.65 * H), "chest")
            add_bone(eb, f"forearm_{tag}", (s * (sh_x + (arm_x - sh_x) * 0.52), 0, 0.65 * H), (s * arm_x, 0, 0.51 * H), f"upperarm_{tag}")
            add_bone(eb, f"hand_{tag}", (s * arm_x, 0, 0.51 * H), (s * (arm_x + 0.05 * H), 0, 0.44 * H), f"forearm_{tag}")

    elif archetype == "avian":
        wing_mid = max(0.24 * H, W * 0.25)
        wing_tip = max(0.48 * H, W * 0.48)
        add_bone(eb, "root", (0, 0, 0), (0, 0, 0.12 * H), None, deform=False)
        add_bone(eb, "body", (0, 0, 0.48 * H), (0, -0.05 * H, 0.66 * H), "root")
        add_bone(eb, "neck", (0, -0.05 * H, 0.66 * H), (0, -0.08 * H, 0.78 * H), "body")
        add_bone(eb, "head", (0, -0.08 * H, 0.78 * H), (0, -0.14 * H, 0.90 * H), "neck")
        add_bone(eb, "tail_base", (0, 0.04 * H, 0.46 * H), (0, 0.14 * H, 0.25 * H), "body")
        add_bone(eb, "tail_tip", (0, 0.14 * H, 0.25 * H), (0, 0.20 * H, 0.04 * H), "tail_base")
        for s, tag in ((1, "l"), (-1, "r")):
            add_bone(eb, f"wing_{tag}_in", (s * 0.08 * H, 0, 0.62 * H), (s * wing_mid, 0.04 * H, 0.74 * H), "body")
            add_bone(eb, f"wing_{tag}_out", (s * wing_mid, 0.04 * H, 0.74 * H), (s * wing_tip, 0.08 * H, 0.90 * H), f"wing_{tag}_in")
            add_bone(eb, f"talon_{tag}", (s * 0.07 * H, -0.04 * H, 0.44 * H), (s * 0.08 * H, -0.08 * H, 0.24 * H), "body")

    elif archetype == "serpent":
        sh_x = max(0.14 * H, min(0.24 * H, W * 0.24))
        arm_x = max(sh_x + 0.18 * H, W * 0.44)
        add_bone(eb, "root", (0, 0, 0), (0, 0, 0.12 * H), None, deform=False)
        add_bone(eb, "pelvis", (0, 0, 0.48 * H), (0, 0, 0.56 * H), "root")
        add_bone(eb, "tail_1", (0, 0, 0.48 * H), (0, 0.06 * H, 0.34 * H), "pelvis")
        add_bone(eb, "tail_2", (0, 0.06 * H, 0.34 * H), (0, 0.14 * H, 0.20 * H), "tail_1")
        add_bone(eb, "tail_3", (0, 0.14 * H, 0.20 * H), (0, 0.24 * H, 0.08 * H), "tail_2")
        add_bone(eb, "tail_4", (0, 0.24 * H, 0.08 * H), (0, 0.36 * H, 0.02 * H), "tail_3")
        add_bone(eb, "spine", (0, 0, 0.56 * H), (0, 0, 0.68 * H), "pelvis")
        add_bone(eb, "chest", (0, 0, 0.68 * H), (0, 0, 0.80 * H), "spine")
        add_bone(eb, "neck", (0, 0, 0.80 * H), (0, 0, 0.87 * H), "chest")
        add_bone(eb, "head", (0, 0, 0.87 * H), (0, 0, 0.99 * H), "neck")
        for s, tag in ((1, "l"), (-1, "r")):
            add_bone(eb, f"upperarm_{tag}", (s * sh_x, 0, 0.77 * H), (s * (sh_x + (arm_x - sh_x) * 0.52), 0, 0.63 * H), "chest")
            add_bone(eb, f"forearm_{tag}", (s * (sh_x + (arm_x - sh_x) * 0.52), 0, 0.63 * H), (s * arm_x, 0, 0.49 * H), f"upperarm_{tag}")
            add_bone(eb, f"hand_{tag}", (s * arm_x, 0, 0.49 * H), (s * (arm_x + 0.05 * H), 0, 0.42 * H), f"forearm_{tag}")

    elif archetype == "quadruped":
        # Facing -Y: front shoulders at -0.32*D, rear hips at +0.30*D
        half_d = max(0.38 * H, D * 0.42)
        leg_x = max(0.14 * H, W * 0.26)
        add_bone(eb, "root", (0, 0, 0), (0, 0, 0.12 * H), None, deform=False)
        add_bone(eb, "spine_mid", (0, 0.05 * half_d, 0.62 * H), (0, -0.35 * half_d, 0.66 * H), "root")
        add_bone(eb, "spine_front", (0, -0.35 * half_d, 0.66 * H), (0, -0.78 * half_d, 0.70 * H), "spine_mid")
        add_bone(eb, "neck", (0, -0.78 * half_d, 0.70 * H), (0, -0.98 * half_d, 0.82 * H), "spine_front")
        add_bone(eb, "head", (0, -0.98 * half_d, 0.82 * H), (0, -1.22 * half_d, 0.80 * H), "neck")
        add_bone(eb, "spine_rear", (0, 0.05 * half_d, 0.62 * H), (0, 0.72 * half_d, 0.60 * H), "spine_mid")
        add_bone(eb, "tail_1", (0, 0.72 * half_d, 0.60 * H), (0, 1.05 * half_d, 0.48 * H), "spine_rear")
        add_bone(eb, "tail_2", (0, 1.05 * half_d, 0.48 * H), (0, 1.25 * half_d, 0.25 * H), "tail_1")
        for s, tag in ((1, "l"), (-1, "r")):
            add_bone(eb, f"leg_f{tag}_up", (s * leg_x, -0.68 * half_d, 0.62 * H), (s * leg_x, -0.64 * half_d, 0.30 * H), "spine_front")
            add_bone(eb, f"leg_f{tag}_lo", (s * leg_x, -0.64 * half_d, 0.30 * H), (s * leg_x, -0.72 * half_d, 0.02 * H), f"leg_f{tag}_up")
            add_bone(eb, f"leg_b{tag}_up", (s * leg_x, 0.66 * half_d, 0.58 * H), (s * leg_x, 0.74 * half_d, 0.28 * H), "spine_rear")
            add_bone(eb, f"leg_b{tag}_lo", (s * leg_x, 0.74 * half_d, 0.28 * H), (s * leg_x, 0.66 * half_d, 0.02 * H), f"leg_b{tag}_up")

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def point_seg_dist(p, a, b):
    ab = b - a
    denom = ab.length_squared
    if denom < 1e-8:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / denom))
    return (p - (a + ab * t)).length


def skin_mesh_to_armature(body, arm_obj, archetype):
    # First try Blender's automatic heat weights; fall back to clean distance weights if heat fails
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    except Exception:
        bpy.ops.object.parent_set(type="ARMATURE_NAME")

    # Verify every vertex has non-zero weights; fill any unweighted vertices via smooth distance fallback
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

    # Smooth weights (stronger smoothing for robe/float so skirts never crease harshly)
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
    print(f"  + Skinned ({archetype}, {len(deform_bones)} deform bones, fallback_verts={unweighted}, smooth_iters={iters})")


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
            pb.location = Vector(loc_map[pb.name])
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


def create_archetype_animations(arm_obj, archetype, H):
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="POSE")
    bpy.context.scene.render.fps = 30

    if archetype in ("humanoid", "robe"):
        stride = 14.0 if archetype == "robe" else 30.0
        knee = 12.0 if archetype == "robe" else 28.0
        arm_sw = 18.0 if archetype == "robe" else 26.0
        build_action(arm_obj, "Idle", [
            (1,  {"chest": (0, 0, 0), "head": (0, 0, 0), "upperarm_l": (0, 0, -6), "upperarm_r": (0, 0, 6)}, {"pelvis": (0, 0, 0)}),
            (20, {"chest": (3, 0, 0), "head": (-2, 0, 0), "upperarm_l": (2, 0, -8), "upperarm_r": (2, 0, 8)}, {"pelvis": (0, 0, 0.015 * H)}),
            (40, {"chest": (0, 0, 0), "head": (0, 0, 0), "upperarm_l": (0, 0, -6), "upperarm_r": (0, 0, 6)}, {"pelvis": (0, 0, 0)}),
        ])
        build_action(arm_obj, "Walk", [
            (1,  {"pelvis": (0, 0, 3), "chest": (4, 0, -4), "thigh_l": (stride, 0, 0), "shin_l": (-knee * 0.4, 0, 0), "thigh_r": (-stride, 0, 0), "shin_r": (-knee, 0, 0), "upperarm_l": (-arm_sw, 0, -5), "upperarm_r": (arm_sw, 0, 5)}, {"pelvis": (0, 0, 0.01 * H)}),
            (13, {"pelvis": (0, 0, -3), "chest": (4, 0, 4), "thigh_l": (-stride, 0, 0), "shin_l": (-knee, 0, 0), "thigh_r": (stride, 0, 0), "shin_r": (-knee * 0.4, 0, 0), "upperarm_l": (arm_sw, 0, -5), "upperarm_r": (-arm_sw, 0, 5)}, {"pelvis": (0, 0, 0.01 * H)}),
            (25, {"pelvis": (0, 0, 3), "chest": (4, 0, -4), "thigh_l": (stride, 0, 0), "shin_l": (-knee * 0.4, 0, 0), "thigh_r": (-stride, 0, 0), "shin_r": (-knee, 0, 0), "upperarm_l": (-arm_sw, 0, -5), "upperarm_r": (arm_sw, 0, 5)}, {"pelvis": (0, 0, 0.01 * H)}),
        ])
        build_action(arm_obj, "Attack", [
            (1,  {"spine": (0, 0, 0), "chest": (0, 0, 0), "upperarm_r": (0, 0, 6), "forearm_r": (0, 0, 0), "upperarm_l": (0, 0, -6)}, {}),
            (8,  {"spine": (-10, 0, -18), "chest": (-14, 0, -22), "upperarm_r": (-75, 0, 28), "forearm_r": (-35, 0, 0), "upperarm_l": (20, 0, -18)}, {}),
            (15, {"spine": (18, 0, 24), "chest": (22, 0, 30), "upperarm_r": (68, 0, -24), "forearm_r": (-15, 0, 0), "upperarm_l": (-28, 0, -10)}, {}),
            (26, {"spine": (0, 0, 0), "chest": (0, 0, 0), "upperarm_r": (0, 0, 6), "forearm_r": (0, 0, 0), "upperarm_l": (0, 0, -6)}, {}),
        ])
        build_action(arm_obj, "Hit", [
            (1,  {"spine": (0, 0, 0), "chest": (0, 0, 0), "head": (0, 0, 0)}, {}),
            (5,  {"spine": (-14, 0, 0), "chest": (-16, 0, 0), "head": (-12, 0, 0)}, {}),
            (12, {"spine": (0, 0, 0), "chest": (0, 0, 0), "head": (0, 0, 0)}, {}),
        ])
        build_action(arm_obj, "Die", [
            (1,  {"pelvis": (0, 0, 0), "spine": (0, 0, 0), "chest": (0, 0, 0)}, {"pelvis": (0, 0, 0)}),
            (18, {"pelvis": (78, 0, 0), "spine": (12, 0, 0), "chest": (10, 0, 0)}, {"pelvis": (0, 0, -0.44 * H)}),
        ])

    elif archetype == "float":
        build_action(arm_obj, "Idle", [
            (1,  {"chest": (2, 0, 0), "skirt_mid": (4, 0, 0), "skirt_hem": (6, 0, 0), "upperarm_l": (12, 0, -12), "upperarm_r": (12, 0, 12)}, {"pelvis": (0, 0, 0.05 * H)}),
            (20, {"chest": (-3, 0, 0), "skirt_mid": (-5, 0, 0), "skirt_hem": (-8, 0, 0), "upperarm_l": (18, 0, -16), "upperarm_r": (18, 0, 16)}, {"pelvis": (0, 0, 0.11 * H)}),
            (40, {"chest": (2, 0, 0), "skirt_mid": (4, 0, 0), "skirt_hem": (6, 0, 0), "upperarm_l": (12, 0, -12), "upperarm_r": (12, 0, 12)}, {"pelvis": (0, 0, 0.05 * H)}),
        ])
        build_action(arm_obj, "Walk", [
            (1,  {"pelvis": (10, 0, 0), "chest": (8, 0, 0), "skirt_mid": (14, 0, 0), "skirt_hem": (18, 0, 0), "upperarm_l": (35, 0, -14), "upperarm_r": (35, 0, 14)}, {"pelvis": (0, 0, 0.07 * H)}),
            (15, {"pelvis": (12, 0, 0), "chest": (6, 0, 0), "skirt_mid": (18, 0, 0), "skirt_hem": (24, 0, 0), "upperarm_l": (42, 0, -18), "upperarm_r": (42, 0, 18)}, {"pelvis": (0, 0, 0.13 * H)}),
            (30, {"pelvis": (10, 0, 0), "chest": (8, 0, 0), "skirt_mid": (14, 0, 0), "skirt_hem": (18, 0, 0), "upperarm_l": (35, 0, -14), "upperarm_r": (35, 0, 14)}, {"pelvis": (0, 0, 0.07 * H)}),
        ])
        build_action(arm_obj, "Attack", [
            (1,  {"chest": (0, 0, 0), "upperarm_l": (15, 0, -12), "upperarm_r": (15, 0, 12)}, {"pelvis": (0, 0, 0.08 * H)}),
            (9,  {"chest": (-14, 0, 0), "upperarm_l": (-45, 0, -35), "upperarm_r": (-45, 0, 35)}, {"pelvis": (0, 0, 0.15 * H)}),
            (16, {"chest": (20, 0, 0), "upperarm_l": (72, 0, -8), "upperarm_r": (72, 0, 8)}, {"pelvis": (0, -0.08 * H, 0.06 * H)}),
            (26, {"chest": (0, 0, 0), "upperarm_l": (15, 0, -12), "upperarm_r": (15, 0, 12)}, {"pelvis": (0, 0, 0.08 * H)}),
        ])
        build_action(arm_obj, "Hit", [
            (1, {"chest": (0, 0, 0)}, {"pelvis": (0, 0, 0.08 * H)}),
            (5, {"chest": (-18, 0, 0)}, {"pelvis": (0, 0.08 * H, 0.05 * H)}),
            (12, {"chest": (0, 0, 0)}, {"pelvis": (0, 0, 0.08 * H)}),
        ])
        build_action(arm_obj, "Die", [
            (1, {"pelvis": (0, 0, 0), "chest": (0, 0, 0)}, {"pelvis": (0, 0, 0.08 * H)}),
            (18, {"pelvis": (65, 0, 0), "chest": (15, 0, 0)}, {"pelvis": (0, 0, -0.35 * H)}),
        ])

    elif archetype == "avian":
        build_action(arm_obj, "Idle", [
            (1,  {"body": (4, 0, 0), "wing_l_in": (0, -28, 0), "wing_l_out": (0, -16, 0), "wing_r_in": (0, 28, 0), "wing_r_out": (0, 16, 0), "tail_base": (-8, 0, 0)}, {"body": (0, 0, 0.08 * H)}),
            (12, {"body": (-4, 0, 0), "wing_l_in": (0, 32, 0), "wing_l_out": (0, 24, 0), "wing_r_in": (0, -32, 0), "wing_r_out": (0, -24, 0), "tail_base": (10, 0, 0)}, {"body": (0, 0, 0.16 * H)}),
            (24, {"body": (4, 0, 0), "wing_l_in": (0, -28, 0), "wing_l_out": (0, -16, 0), "wing_r_in": (0, 28, 0), "wing_r_out": (0, 16, 0), "tail_base": (-8, 0, 0)}, {"body": (0, 0, 0.08 * H)}),
        ])
        build_action(arm_obj, "Walk", [
            (1,  {"body": (18, 0, 0), "wing_l_in": (0, -38, 0), "wing_l_out": (0, -22, 0), "wing_r_in": (0, 38, 0), "wing_r_out": (0, 22, 0)}, {"body": (0, 0, 0.10 * H)}),
            (9,  {"body": (10, 0, 0), "wing_l_in": (0, 42, 0), "wing_l_out": (0, 28, 0), "wing_r_in": (0, -42, 0), "wing_r_out": (0, -28, 0)}, {"body": (0, 0, 0.20 * H)}),
            (18, {"body": (18, 0, 0), "wing_l_in": (0, -38, 0), "wing_l_out": (0, -22, 0), "wing_r_in": (0, 38, 0), "wing_r_out": (0, 22, 0)}, {"body": (0, 0, 0.10 * H)}),
        ])
        build_action(arm_obj, "Attack", [
            (1,  {"body": (0, 0, 0), "wing_l_in": (0, 0, 0), "wing_r_in": (0, 0, 0), "talon_l": (0, 0, 0), "talon_r": (0, 0, 0)}, {"body": (0, 0, 0.12 * H)}),
            (8,  {"body": (-20, 0, 0), "wing_l_in": (0, -45, 0), "wing_r_in": (0, 45, 0), "talon_l": (-25, 0, 0), "talon_r": (-25, 0, 0)}, {"body": (0, 0, 0.24 * H)}),
            (15, {"body": (34, 0, 0), "wing_l_in": (0, 38, 0), "wing_r_in": (0, -38, 0), "talon_l": (45, 0, 0), "talon_r": (45, 0, 0)}, {"body": (0, -0.15 * H, 0.05 * H)}),
            (24, {"body": (0, 0, 0), "wing_l_in": (0, 0, 0), "wing_r_in": (0, 0, 0), "talon_l": (0, 0, 0), "talon_r": (0, 0, 0)}, {"body": (0, 0, 0.12 * H)}),
        ])
        build_action(arm_obj, "Hit", [
            (1, {"body": (0, 0, 0)}, {"body": (0, 0, 0.12 * H)}),
            (5, {"body": (-24, 0, 0)}, {"body": (0, 0.08 * H, 0.10 * H)}),
            (12, {"body": (0, 0, 0)}, {"body": (0, 0, 0.12 * H)}),
        ])
        build_action(arm_obj, "Die", [
            (1, {"body": (0, 0, 0)}, {"body": (0, 0, 0.12 * H)}),
            (18, {"body": (80, 0, 25)}, {"body": (0, 0, -0.42 * H)}),
        ])

    elif archetype == "serpent":
        build_action(arm_obj, "Idle", [
            (1,  {"tail_1": (0, 0, 10), "tail_2": (0, 0, -14), "tail_3": (0, 0, 14), "tail_4": (0, 0, -10), "chest": (2, 0, -4)}, {"pelvis": (0, 0, 0.02 * H)}),
            (20, {"tail_1": (0, 0, -10), "tail_2": (0, 0, 14), "tail_3": (0, 0, -14), "tail_4": (0, 0, 10), "chest": (-2, 0, 4)}, {"pelvis": (0, 0, 0.05 * H)}),
            (40, {"tail_1": (0, 0, 10), "tail_2": (0, 0, -14), "tail_3": (0, 0, 14), "tail_4": (0, 0, -10), "chest": (2, 0, -4)}, {"pelvis": (0, 0, 0.02 * H)}),
        ])
        build_action(arm_obj, "Walk", [
            (1,  {"pelvis": (6, 0, 8), "tail_1": (0, 0, 18), "tail_2": (0, 0, -24), "tail_3": (0, 0, 24), "tail_4": (0, 0, -18), "chest": (6, 0, -8)}, {"pelvis": (0, 0, 0.03 * H)}),
            (13, {"pelvis": (6, 0, -8), "tail_1": (0, 0, -18), "tail_2": (0, 0, 24), "tail_3": (0, 0, -24), "tail_4": (0, 0, 18), "chest": (6, 0, 8)}, {"pelvis": (0, 0, 0.03 * H)}),
            (25, {"pelvis": (6, 0, 8), "tail_1": (0, 0, 18), "tail_2": (0, 0, -24), "tail_3": (0, 0, 24), "tail_4": (0, 0, -18), "chest": (6, 0, -8)}, {"pelvis": (0, 0, 0.03 * H)}),
        ])
        build_action(arm_obj, "Attack", [
            (1,  {"spine": (0, 0, 0), "chest": (0, 0, 0), "upperarm_l": (0, 0, -10), "upperarm_r": (0, 0, 10)}, {}),
            (9,  {"spine": (-14, 0, -20), "chest": (-18, 0, -24), "upperarm_r": (-70, 0, 30), "upperarm_l": (-40, 0, -25)}, {}),
            (16, {"spine": (22, 0, 26), "chest": (24, 0, 28), "upperarm_r": (75, 0, -20), "upperarm_l": (55, 0, 15)}, {}),
            (28, {"spine": (0, 0, 0), "chest": (0, 0, 0), "upperarm_l": (0, 0, -10), "upperarm_r": (0, 0, 10)}, {}),
        ])
        build_action(arm_obj, "Hit", [
            (1, {"chest": (0, 0, 0)}, {}),
            (5, {"chest": (-18, 0, 0)}, {}),
            (12, {"chest": (0, 0, 0)}, {}),
        ])
        build_action(arm_obj, "Die", [
            (1, {"pelvis": (0, 0, 0), "spine": (0, 0, 0)}, {"pelvis": (0, 0, 0)}),
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
            (1, {"spine_front": (0, 0, 0)}, {}),
            (5, {"spine_front": (-16, 0, 0)}, {}),
            (12, {"spine_front": (0, 0, 0)}, {}),
        ])
        build_action(arm_obj, "Die", [
            (1, {"spine_mid": (0, 0, 0)}, {"spine_mid": (0, 0, 0)}),
            (18, {"spine_mid": (0, 82, 0)}, {"spine_mid": (0, 0, -0.42 * H)}),
        ])

    bpy.ops.object.mode_set(mode="OBJECT")


def main():
    args = parse_args()
    clear_scene()
    body, bbox = import_and_prepare_mesh(args.in_glb, args.key, args.height, args.tris, args.rot_z_deg)
    arm_obj = build_armature(args.key, args.archetype, bbox)
    skin_mesh_to_armature(body, arm_obj, args.archetype)
    create_archetype_animations(arm_obj, args.archetype, bbox["h"])

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
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(args.out_glb),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_skins=True,
        export_materials="EXPORT",
        export_image_format="WEBP",
    )
    print(f"[{args.key}] Exported rigged GLB: {args.out_glb}")


if __name__ == "__main__":
    main()
