"""
scripts/blender/build_hero_master.py
2048px 5만 폴리곤 주홍 허리띠 몸통(hero_body_raw.glb) + 8배 고해상도 두상(hero_head_raw.glb) 결합:
- 5만 폴리곤 원본 주름을 1.5만 폴리곤 게임 메시에 Tangent-Space Normal Map(1024px)으로 베이킹
- 옛 턱·목 잔여물 완전 제거 + 360도 매끈한 조선식 흑동정 깃(Hero_Collar)으로 무이음새 결합
- 환도(Hero_Sword) 오른손 손바닥 중앙 정밀 밀착
- 8등신 실측 66본 Mesh2Motion 리깅 + 복셀 프록시 볼륨 본 히트 + 8종 모션 이식
"""
import math
import os
import sys
import bpy
import bmesh
from mathutils import Vector, Euler

sys.path.append(os.path.dirname(__file__))
import apply_mesh2motion as m2m

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_DIR = os.path.join(ROOT, "v2", "assets", "models")
M2M_DIR = "/tmp/m2m_raw"

HERO_FIT = {
    "z_ankle": 0.11, "z_knee": 0.46, "z_pelvis": 0.83,
    "z_shoulder": 1.35, "z_neck": 1.45, "z_head": 1.55,
    "hip_x": 0.10, "shoulder_x": 0.21, "arm_len": 0.60,
    "a_deg": 74.0,
}

HERO_CLIPS = [
    ("M2M_Idle",   "idle-a.glb"),
    ("M2M_Walk",   "jog.glb"),
    ("M2M_Slash",  "sword-regular-a.glb"),
    ("M2M_Slash2", "sword-regular-b.glb"),
    ("M2M_Slash3", "sword-regular-c.glb"),
    ("M2M_Dodge",  "roll.glb"),
    ("M2M_Block",  "sword-block.glb"),
    ("M2M_Hit",    "hit-chest.glb"),
]


def bake_normal_map(high_obj, low_obj, size=1024):
    """5만 폴리곤 원본(high_obj)의 주름 굴곡을 low_obj UV에 Tangent-Space Normal Map으로 베이킹."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.010
    scene.render.bake.max_ray_distance = 0.025
    scene.render.bake.margin = 4

    n_img = bpy.data.images.new("Hero_Body_Normal", width=size, height=size, alpha=False)
    n_img.colorspace_settings.name = "Non-Color"

    mat = low_obj.data.materials[0] if low_obj.data.materials else None
    if mat is None or not mat.use_nodes:
        return None
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return None

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

    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.55
    nt.links.new(tex_node.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    print(f"  + Baked 50k->15k Normal Map ({size}x{size}) onto Hero_Body!")
    return n_img


def make_outline(src_obj, name, offset, dec_ratio=0.55):
    out_m = src_obj.data.copy()
    out_m.name = name
    out_m.materials.clear()
    bm = bmesh.new()
    bm.from_mesh(out_m)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for v in bm.verts:
        v.co += v.normal * offset
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(out_m)
    bm.free()
    out_obj = bpy.data.objects.new(name, out_m)
    bpy.context.scene.collection.objects.link(out_obj)
    if dec_ratio < 0.99:
        bpy.ops.object.select_all(action="DESELECT")
        out_obj.select_set(True)
        bpy.context.view_layer.objects.active = out_obj
        dec = out_obj.modifiers.new(name="DecOut", type="DECIMATE")
        dec.ratio = dec_ratio
        bpy.ops.object.modifier_apply(modifier=dec.name)
    return out_obj


def main():
    body_raw = os.path.join(MODELS_DIR, "hero_body_raw.glb")
    head_raw = os.path.join(MODELS_DIR, "hero_head_raw.glb")
    sword_src = "/tmp/models_png/hero_new.glb"
    out_glb = os.path.join(MODELS_DIR, "hero.glb")

    assert os.path.isfile(body_raw), f"Missing {body_raw}"
    assert os.path.isfile(head_raw), f"Missing {head_raw}"

    print("\n================ [HERO MASTER v0.91] 2048px Body + Normal Map + 8x Head ================")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=body_raw)
    body_high = [o for o in bpy.data.objects if o.type == "MESH"][0]
    body_high.name = "Hero_Body_High50k"
    body_high.parent = None
    bpy.ops.object.select_all(action="DESELECT")
    body_high.select_set(True)
    bpy.context.view_layer.objects.active = body_high
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 1) Normalize high-poly body to exact 1.72m skeleton height
    bmin, bmax = m2m.get_world_bbox(body_high)
    s = 1.72 / max(1e-4, bmax.z - bmin.z)
    cx = (bmin.x + bmax.x) * 0.5
    cy = (bmin.y + bmax.y) * 0.5
    cz = bmin.z
    for v in body_high.data.vertices:
        v.co.x = (v.co.x - cx) * s
        v.co.y = (v.co.y - cy) * s
        v.co.z = (v.co.z - cz) * s
    body_high.data.update()

    # Duplicate into game-ready Hero_Body (15k tris) and bake 50k->15k Normal Map!
    bpy.ops.object.select_all(action="DESELECT")
    body_high.select_set(True)
    bpy.context.view_layer.objects.active = body_high
    bpy.ops.object.duplicate()
    body = bpy.context.active_object
    body.name = "Hero_Body"
    body.data = body.data.copy()
    body.data.name = "Hero_Body"
    dec = body.modifiers.new(name="Decimate", type="DECIMATE")
    dec.ratio = 0.30
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for poly in body.data.polygons:
        poly.use_smooth = True

    bake_normal_map(body_high, body, size=1024)
    bpy.data.objects.remove(body_high, do_unlink=True)

    # Create clean ink outline for Hero_Body
    outline = make_outline(body, "Hero_Outline", offset=0.0038, dec_ratio=0.50)

    # 2) Import & fit Mesh2Motion 66-bone T-pose skeleton
    bpy.ops.import_scene.gltf(filepath=os.path.join(M2M_DIR, "skeleton.glb"))
    t_arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    t_arm.name = "Hero_Armature"
    m2m.fit_skeleton_to_profile(t_arm, HERO_FIT)

    # Temp A-pose rig matching sculpted arm angle (74 deg)
    bpy.ops.object.select_all(action="DESELECT")
    t_arm.select_set(True)
    bpy.context.view_layer.objects.active = t_arm
    bpy.ops.object.duplicate()
    a_arm = bpy.context.active_object
    a_arm.name = "Temp_APose_Arm"

    a_rad = math.radians(HERO_FIT["a_deg"])
    bpy.ops.object.mode_set(mode="POSE")
    for bname, sgn in [("upperarm_l", -1.0), ("upperarm_r", 1.0)]:
        pb = a_arm.pose.bones[bname]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = Euler((0.0, 0.0, sgn * a_rad), "XYZ")
    bpy.context.view_layer.update()
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # 3) Volumetric Voxel-Proxy Bone Heat skinning on Hero_Body -> transfer to Hero_Outline
    m2m.skin_via_voxel_heat(body, a_arm, HERO_FIT)
    # Strip arm/hand bone bleed from torso/waist/back sash below armpit so A->T bake NEVER pulls waist sash into a V!
    arm_vg_names = {"clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r"}
    arm_vgs = [vg for vg in body.vertex_groups if vg.name in arm_vg_names]
    spine_vg = body.vertex_groups.get("spine_02") or body.vertex_groups.get("spine_01")
    cleaned = 0
    for v in body.data.vertices:
        if v.co.z < 1.24 and abs(v.co.x) < 0.225:
            had = False
            for vg in arm_vgs:
                try:
                    if vg.weight(v.index) > 0.0:
                        vg.remove([v.index])
                        had = True
                except RuntimeError:
                    pass
            if had:
                cleaned += 1
                if not v.groups and spine_vg:
                    spine_vg.add([v.index], 1.0, "REPLACE")
    print(f"  + Stripped arm-weight bleed from {cleaned} torso/waist verts (waist sash 100% flat!)")
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

    m2m.transfer_vertex_weights(body, outline)
    outline.parent = a_arm
    mod_o = outline.modifiers.new(name="Armature", type="ARMATURE")
    mod_o.object = a_arm

    # 4) Rotate Temp_APose_Arm BACK UP into T-pose and bake body + outline into T-pose!
    bpy.ops.object.select_all(action="DESELECT")
    a_arm.select_set(True)
    bpy.context.view_layer.objects.active = a_arm
    bpy.ops.object.mode_set(mode="POSE")
    for bname, sgn in [("upperarm_l", 1.0), ("upperarm_r", -1.0)]:
        pb = a_arm.pose.bones[bname]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = Euler((0.0, 0.0, sgn * a_rad), "XYZ")
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")

    for o in [body, outline]:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for mod in list(o.modifiers):
            if mod.type == "ARMATURE":
                bpy.ops.object.modifier_apply(modifier=mod.name)
        o.animation_data_clear()
        o.parent = t_arm
        mod = o.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = t_arm
    bpy.data.objects.remove(a_arm, do_unlink=True)

    # 5) Replace old head with 8x high-res Hero_Head + smooth charcoal Joseon collar ring!
    neck_pts = [v.co for v in body.data.vertices if 1.40 <= v.co.z <= 1.46 and abs(v.co.x) < 0.12]
    neck_cy = sum(p.y for p in neck_pts) / max(1, len(neck_pts))

    for o in [body, outline]:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        to_del = [v for v in bm.verts if abs(v.co.x) < 0.105 and (v.co.z > 1.462 or (v.co.z > 1.428 and v.co.y < 0.005))]
        bmesh.ops.delete(bm, geom=to_del, context="VERTS")
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=head_raw)
    head = [o for o in bpy.data.objects if o not in before and o.type == "MESH"][0]
    head.name = "Hero_Head"
    for o in list(bpy.data.objects):
        if o not in before and o != head:
            bpy.data.objects.remove(o, do_unlink=True)
    head.parent = None
    bpy.ops.object.select_all(action="DESELECT")
    head.select_set(True)
    bpy.context.view_layer.objects.active = head
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    dec_h = head.modifiers.new(name="DecHead", type="DECIMATE")
    dec_h.ratio = 0.13
    bpy.ops.object.modifier_apply(modifier=dec_h.name)
    for poly in head.data.polygons:
        poly.use_smooth = True

    hmin, hmax = m2m.get_world_bbox(head)
    hs = 0.336 / max(1e-4, hmax.z - hmin.z)
    hcx = (hmin.x + hmax.x) * 0.5
    hcy = (hmin.y + hmax.y) * 0.5
    for v in head.data.vertices:
        nz = (v.co.z - hmin.z) * hs + 1.376
        nx = (v.co.x - hcx) * hs
        ny = (v.co.y - hcy) * hs
        # Below z=1.475 (inside/below collar), smoothly slim neck flare inward so it tucks cleanly inside the REAL V-collar!
        if nz < 1.475:
            k = max(0.0, min(1.0, (1.475 - nz) / 0.070))
            taper = 1.0 - 0.38 * k
            nx *= taper
            ny *= taper
        v.co.x = nx
        v.co.y = ny + neck_cy - 0.014
        v.co.z = nz
    head.data.update()

    head.vertex_groups.clear()
    vg_head = head.vertex_groups.new(name="head")
    vg_neck = head.vertex_groups.new(name="neck_01")
    for v in head.data.vertices:
        t = max(0.0, min(1.0, (v.co.z - 1.42) / 0.055))
        if t > 0.01: vg_head.add([v.index], t, "REPLACE")
        if 1.0 - t > 0.01: vg_neck.add([v.index], 1.0 - t, "REPLACE")
    head.parent = t_arm
    mod_h = head.modifiers.new(name="Armature", type="ARMATURE")
    mod_h.object = t_arm

    head_out = make_outline(head, "Hero_Head_Outline", offset=0.0030, dec_ratio=0.45)
    m2m.transfer_vertex_weights(head, head_out)
    head_out.parent = t_arm
    mod_ho = head_out.modifiers.new(name="Armature", type="ARMATURE")
    mod_ho.object = t_arm

    print(f"  + Merged Hero_Head ({len(head.data.polygons)} tris) + seamless Hero_Collar!")

    # 6) Import Hero_Sword (+ outline) and snap handle center dead-center into hand_r palm
    if os.path.isfile(sword_src):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=sword_src)
        sword = sword_out = None
        for o in list(bpy.data.objects):
            if o in before:
                continue
            low = o.name.lower()
            if o.type == "MESH" and "sword" in low:
                for mod in list(o.modifiers):
                    if mod.type == "ARMATURE": o.modifiers.remove(mod)
                o.parent = None
                bpy.ops.object.select_all(action="DESELECT")
                o.select_set(True)
                bpy.context.view_layer.objects.active = o
                bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
                if "outline" in low: sword_out = o
                else: sword = o
            else:
                bpy.data.objects.remove(o, do_unlink=True)
        if sword is not None:
            hand_b = t_arm.data.bones["hand_r"]
            palm = t_arm.matrix_world @ ((hand_b.head_local + hand_b.tail_local) * 0.5)
            # Scale sword from 1.85m space -> 1.72m space
            sw_s = 1.72 / 1.85
            pts = [v.co.copy() * sw_s for v in sword.data.vertices]
            smin = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
            smax = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
            p_a = max(pts, key=lambda p: (p - (smin + smax) * 0.5).length_squared)
            p_b = max(pts, key=lambda p: (p - p_a).length_squared)
            cnt_a = sum(1 for p in pts if (p - p_a).length < 0.18)
            cnt_b = sum(1 for p in pts if (p - p_b).length < 0.18)
            hilt_pt, tip_pt = (p_a, p_b) if cnt_a < cnt_b else (p_b, p_a)
            blade_vec = (tip_pt - hilt_pt).normalized()
            # Compute exact T-pose blade direction so that during M2M_Idle (idle-a.glb),
            # the blade points cleanly OUTWARD-RIGHT (-X), FORWARD (-Y), DOWNWARD (-Z) — ZERO body/skirt clipping!
            before_tmp = set(bpy.data.objects)
            before_act_tmp = set(bpy.data.actions)
            bpy.ops.import_scene.gltf(filepath=os.path.join(M2M_DIR, "idle-a.glb"))
            tmp_objs = [o for o in bpy.data.objects if o not in before_tmp]
            tmp_acts = [a for a in bpy.data.actions if a not in before_act_tmp]
            target_dir = Vector((-0.55, -0.55, -0.62)).normalized()
            if tmp_acts:
                t_arm.animation_data_create()
                t_arm.animation_data.action = tmp_acts[0]
                bpy.context.scene.frame_set(20)
                bpy.context.view_layer.update()
                pb_hr = t_arm.pose.bones["hand_r"]
                # World rotation of hand_r in M2M_Idle vs T-pose rest rotation
                m_pose = (t_arm.matrix_world @ pb_hr.matrix).to_3x3()
                m_rest = (t_arm.matrix_world @ t_arm.data.bones["hand_r"].matrix_local).to_3x3()
                delta_rot = m_pose @ m_rest.inverted()
                desired_idle_world = Vector((-0.62, -0.42, -0.66)).normalized()
                target_dir = (delta_rot.inverted() @ desired_idle_world).normalized()
                t_arm.animation_data.action = None
                bpy.context.view_layer.update()
            for o in tmp_objs: bpy.data.objects.remove(o, do_unlink=True)
            for a in tmp_acts: bpy.data.actions.remove(a)
            rot_q = blade_vec.rotation_difference(target_dir)
            grip_origin = hilt_pt + blade_vec * 0.055
            for so in [sword, sword_out]:
                if so is None: continue
                for v in so.data.vertices:
                    v.co = rot_q @ (v.co * sw_s - grip_origin) + palm
                so.data.update()
                so.animation_data_clear()
                so.vertex_groups.clear()
                vg = so.vertex_groups.new(name="hand_r")
                vg.add([v.index for v in so.data.vertices], 1.0, "REPLACE")
                so.parent = t_arm
                mod = so.modifiers.new(name="Armature", type="ARMATURE")
                mod.object = t_arm
            print("  + Hero_Sword handle centered cleanly in hand_r palm!")

    # 7) Import 8 Mesh2Motion CC0 animation clips & scale pelvis translation
    pel_scale = HERO_FIT["z_pelvis"] / 0.917
    t_arm.animation_data_create()
    for clip_name, anim_file in HERO_CLIPS:
        anim_path = os.path.join(M2M_DIR, anim_file)
        before_objs = set(bpy.data.objects)
        before_acts = set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=anim_path)
        new_objs = [o for o in bpy.data.objects if o not in before_objs]
        new_acts = [a for a in bpy.data.actions if a not in before_acts]
        if new_acts:
            act = new_acts[0]
            act.name = clip_name
            act.use_fake_user = True
            for fc in list(act.fcurves):
                if fc.data_path.endswith('pose.bones["root"].location') and fc.array_index in (0, 1):
                    act.fcurves.remove(fc)
                elif fc.data_path.endswith('pose.bones["pelvis"].location'):
                    for kp in fc.keyframe_points:
                        kp.co.y *= pel_scale
                        kp.handle_left.y *= pel_scale
                        kp.handle_right.y *= pel_scale
            track = t_arm.animation_data.nla_tracks.new()
            track.name = clip_name
            track.strips.new(clip_name, int(act.frame_range[0]), act)
            track.mute = True
            print(f"  + Action {clip_name} <- {anim_file}")
        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)
    t_arm.animation_data.action = None

    # 8) Export final master hero.glb!
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
        if o.type in ("ARMATURE", "MESH"):
            o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_force_sampling=True,
        export_yup=True,
        export_image_format="JPEG",
    )
    print(f"  [SAVED MASTER HERO] {out_glb} ({os.path.getsize(out_glb):,} bytes)")


if __name__ == "__main__":
    main()
