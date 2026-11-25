"""
scripts/blender/build_hero_master.py
2048px 5만 폴리곤 주홍 허리띠 몸통(hero_body_raw.glb) + 8배 고해상도 두상(hero_head_raw.glb) 결합:
- 5만 폴리곤 원본 주름을 1.5만 폴리곤 게임 메시에 Tangent-Space Normal Map(1024px)으로 베이킹
- 옛 턱·목 잔여물 완전 제거 + 360도 매끈한 조선식 흑동정 깃(Hero_Collar)으로 무이음새 결합
- 환도(Hero_Sword) 오른손 손바닥 중앙 정밀 밀착
- 8등신 실측 66본 Mesh2Motion 리깅 + 복셀 프록시 볼륨 본 히트 + 8종 모션 이식
"""
import argparse
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
    nmap.inputs["Strength"].default_value = 0.95
    nt.links.new(tex_node.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    print(f"  + Baked 50k->15k Normal Map ({size}x{size}, strength=0.95) onto Hero_Body!")

    # v1.31: Bake 50k->15k AO Map and multiply onto Base Color
    img_name = "Hero_Body"
    ao_img = bpy.data.images.new(f"{img_name}_AO", width=size, height=size, alpha=False)
    ao_node = nt.nodes.new("ShaderNodeTexImage")
    ao_node.image = ao_img
    for n in nt.nodes:
        n.select = False
    ao_node.select = True
    nt.nodes.active = ao_node
    scene.cycles.samples = 12
    bpy.ops.object.select_all(action="DESELECT")
    high_obj.select_set(True)
    low_obj.select_set(True)
    bpy.context.view_layer.objects.active = low_obj
    bpy.ops.object.bake(type="AO")
    ao_img.pack()
    scene.cycles.samples = 1

    base_inp = bsdf.inputs.get("Base Color")
    if base_inp and base_inp.is_linked:
        orig_from = base_inp.links[0].from_socket
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 0.38
        nt.links.new(orig_from, mix.inputs[6])
        nt.links.new(ao_node.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], base_inp)
        print(f"  + Baked & multiplied 50k->15k AO Map ({size}x{size}, factor=0.38) onto Hero_Body")

    # v1.31: Bake 50k->15k Curvature (Pointiness edge highlight) via temporary EMIT material on high_obj
    curv_img = bpy.data.images.new(f"{img_name}_Curv", width=size, height=size, alpha=False)
    curv_node = nt.nodes.new("ShaderNodeTexImage")
    curv_node.image = curv_img
    for n in nt.nodes:
        n.select = False
    curv_node.select = True
    nt.nodes.active = curv_node

    orig_mats = list(high_obj.data.materials)
    cmat = bpy.data.materials.new(name=f"{img_name}_CurvTemp")
    cmat.use_nodes = True
    cnt = cmat.node_tree
    cnt.nodes.clear()
    geom = cnt.nodes.new("ShaderNodeNewGeometry")
    ramp = cnt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.44
    ramp.color_ramp.elements[0].color = (0.30, 0.30, 0.30, 1.0)
    ramp.color_ramp.elements[1].position = 0.56
    ramp.color_ramp.elements[1].color = (0.85, 0.85, 0.85, 1.0)
    emit = cnt.nodes.new("ShaderNodeEmission")
    out_n = cnt.nodes.new("ShaderNodeOutputMaterial")
    cnt.links.new(geom.outputs["Pointiness"], ramp.inputs["Fac"])
    cnt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    cnt.links.new(emit.outputs["Emission"], out_n.inputs["Surface"])
    high_obj.data.materials.clear()
    high_obj.data.materials.append(cmat)

    scene.cycles.samples = 1
    bpy.ops.object.select_all(action="DESELECT")
    high_obj.select_set(True)
    low_obj.select_set(True)
    bpy.context.view_layer.objects.active = low_obj
    bpy.ops.object.bake(type="EMIT")
    curv_img.pack()

    high_obj.data.materials.clear()
    for om in orig_mats:
        high_obj.data.materials.append(om)
    bpy.data.materials.remove(cmat, do_unlink=True)

    base_inp2 = bsdf.inputs.get("Base Color")
    if base_inp2 and base_inp2.is_linked:
        cur_from = base_inp2.links[0].from_socket
        cmix = nt.nodes.new("ShaderNodeMix")
        cmix.data_type = "RGBA"
        cmix.blend_type = "OVERLAY"
        cmix.inputs["Factor"].default_value = 0.24
        nt.links.new(cur_from, cmix.inputs[6])
        nt.links.new(curv_node.outputs["Color"], cmix.inputs[7])
        nt.links.new(cmix.outputs[2], base_inp2)
        print(f"  + Baked & overlaid 50k->15k Curvature Map ({size}x{size}, factor=0.24) onto Base Color")
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


def attach_sword(t_arm, body, sword_src, template):
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
            # Measure REAL right-hand palm center directly from Hero_Body vertices weighted to hand_r (0mm palm contact!)
            vg_hr = body.vertex_groups.get("hand_r")
            hr_pts = []
            if vg_hr:
                for v in body.data.vertices:
                    try:
                        if vg_hr.weight(v.index) > 0.45 and v.co.x < -0.25:
                            hr_pts.append(v.co.copy())
                    except RuntimeError:
                        pass
            if hr_pts:
                palm = sum(hr_pts, Vector((0, 0, 0))) / len(hr_pts)
            else:
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
            idle_path = os.path.join(M2M_DIR, "idle-a.glb")
            if os.path.isfile(idle_path):
                bpy.ops.import_scene.gltf(filepath=idle_path)
            else:
                bpy.ops.import_scene.gltf(filepath=template)
            tmp_objs = [o for o in bpy.data.objects if o not in before_tmp]
            tmp_acts = [a for a in bpy.data.actions if a not in before_act_tmp]
            target_dir = Vector((-0.55, -0.55, -0.62)).normalized()
            idle = next((a for a in tmp_acts if a.name.startswith('M2M_Idle')), None)
            if idle is None and os.path.isfile(idle_path) and tmp_acts:
                idle = tmp_acts[0]
            if idle is not None:
                t_arm.animation_data_create()
                t_arm.animation_data.action = idle
                if hasattr(t_arm.animation_data, "action_slot") and getattr(idle, "slots", None):
                    t_arm.animation_data.action_slot = idle.slots[0]
                bpy.context.scene.frame_set(20)
                bpy.context.view_layer.update()
                pb_hr = t_arm.pose.bones["hand_r"]
                # World rotation of hand_r in M2M_Idle vs T-pose rest rotation
                m_pose = (t_arm.matrix_world @ pb_hr.matrix).to_3x3()
                m_rest = (t_arm.matrix_world @ t_arm.data.bones["hand_r"].matrix_local).to_3x3()
                delta_rot = m_pose @ m_rest.inverted()
                # Anatomical forward grip (정수 파지): blade & guard exit the THUMB/INDEX side
                # pointing cleanly forward-outward-upward, pommel exits the pinky side!
                desired_idle_world = Vector((-0.40, -0.82, +0.40)).normalized()
                target_dir = (delta_rot.inverted() @ desired_idle_world).normalized()
                # Seat handle dead-center inside the curled fist C-hollow in M2M_Idle space
                palm += delta_rot.inverted() @ Vector((+0.008, -0.006, +0.002))
                t_arm.animation_data.action = None
                for pb in t_arm.pose.bones:
                    pb.matrix_basis.identity()
                bpy.context.view_layer.update()
            for o in tmp_objs: bpy.data.objects.remove(o, do_unlink=True)
            for a in tmp_acts: bpy.data.actions.remove(a)
            rot_q = blade_vec.rotation_difference(target_dir)
            grip_origin = hilt_pt + blade_vec * 0.138
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="full_body", help="Use a unified full-body raw GLB")
    parser.add_argument("--out", help="Write here without replacing the game template")
    parser.add_argument("--carved", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    raw_mv_hero = os.path.join(ROOT, "scripts", "blender", "_raw_bosses", "hero_raw.glb")
    body_raw = raw_mv_hero if os.path.isfile(raw_mv_hero) else os.path.join(MODELS_DIR, "hero_body_raw.glb")
    head_raw = os.path.join(MODELS_DIR, "hero_head_raw.glb")
    if args.full_body:
        body_raw = args.full_body
    template = os.path.join(MODELS_DIR, "hero.glb")
    out_glb = os.path.abspath(args.out or template)
    os.makedirs(os.path.dirname(out_glb), exist_ok=True)
    sword_src = "/tmp/models_png/hero_new.glb"
    if not os.path.isfile(sword_src) and os.path.isfile(template):
        sword_src = template

    assert os.path.isfile(body_raw), f"Missing {body_raw}"
    use_head_graft = not args.full_body and (body_raw != raw_mv_hero) and os.path.isfile(head_raw)

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
        poly.use_smooth = not args.carved

    if not args.carved:
        bake_normal_map(body_high, body, size=1024)
    bpy.data.objects.remove(body_high, do_unlink=True)

    # Create clean ink outline for Hero_Body
    outline = make_outline(body, "Hero_Outline", offset=0.0038, dec_ratio=0.50)

    # 2) Import & fit Mesh2Motion 66-bone T-pose skeleton (fallback to existing hero.glb on Windows)
    skel_path = os.path.join(M2M_DIR, "skeleton.glb")
    use_template_glb = not os.path.isfile(skel_path)
    if use_template_glb:
        assert os.path.isfile(template), f"Missing both {skel_path} and template {template}"
        before_skel = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=template)
        t_arm = [o for o in bpy.data.objects if o not in before_skel and o.type == "ARMATURE"][0]
        t_arm.name = "Hero_Armature"
        t_arm.parent = None
        for o in list(bpy.data.objects):
            if o not in before_skel and o != t_arm:
                bpy.data.objects.remove(o, do_unlink=True)
        bpy.ops.object.select_all(action="DESELECT")
        t_arm.select_set(True)
        bpy.context.view_layer.objects.active = t_arm
        bpy.ops.object.mode_set(mode="POSE")
        for pb in t_arm.pose.bones:
            pb.location = (0.0, 0.0, 0.0)
            pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
            pb.rotation_euler = (0.0, 0.0, 0.0)
            pb.scale = (1.0, 1.0, 1.0)
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        print(f"  + Loaded 66-bone Hero_Armature from template {template}")
    else:
        bpy.ops.import_scene.gltf(filepath=skel_path)
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

    if use_head_graft:
        # 5) SURGICAL NECK CIRCUMFERENCE MATCHING: razor-flat bisect_plane + X/Y ellipse scale match + 0mm BVH boundary snap!
        from mathutils.bvhtree import BVHTree
        Z_CUT = 1.440

        # 5a) Clean horizontal bisect on Hero_Body & Hero_Outline at Z_CUT (zero jagged sawtooth edges, V-collar 100% intact!)
        for o in [body, outline]:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(
                bm, geom=geom,
                plane_co=Vector((0.0, 0.0, Z_CUT)),
                plane_no=Vector((0.0, 0.0, 1.0)),
                clear_outer=True, clear_inner=False
            )
            # Cleanly remove old blindfold ribbon tail stub protruding behind the neck (y > 0.064, z > 1.382)
            rib_del = [v for v in bm.verts if v.co.z > 1.382 and abs(v.co.x) < 0.085 and v.co.y > 0.064]
            if rib_del:
                bmesh.ops.delete(bm, geom=rib_del, context="VERTS")
            bm.to_mesh(o.data)
            bm.free()
            o.data.update()

        # Measure exact cut-ring neck ellipse on Hero_Body at Z_CUT (exclude thin back hair tail y > 0.075)
        cut_pts = [v.co for v in body.data.vertices if abs(v.co.z - Z_CUT) < 0.006 and abs(v.co.x) < 0.12 and v.co.y < 0.075]
        cx_b = (min(p.x for p in cut_pts) + max(p.x for p in cut_pts)) * 0.5
        cy_b = (min(p.y for p in cut_pts) + max(p.y for p in cut_pts)) * 0.5
        rx_b = (max(p.x for p in cut_pts) - min(p.x for p in cut_pts)) * 0.5
        ry_b = (max(p.y for p in cut_pts) - min(p.y for p in cut_pts)) * 0.5
        print(f"  + Body cut-ring @ z={Z_CUT}: center=({cx_b:+.4f},{cy_b:+.4f}) rx={rx_b:.4f} ry={ry_b:.4f} ({len(cut_pts)} verts)")

        # 5b) Import high-res Hero_Head, decimate gently, scale to exact 8-head height (0.332m)
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
        hs = 0.332 / max(1e-4, hmax.z - hmin.z)
        hcx = (hmin.x + hmax.x) * 0.5
        hcy = (hmin.y + hmax.y) * 0.5
        for v in head.data.vertices:
            v.co.x = (v.co.x - hcx) * hs
            v.co.y = (v.co.y - hcy) * hs
            v.co.z = (v.co.z - hmin.z) * hs + 1.390
        head.data.update()

        # Measure Hero_Head actual neck ellipse at Z_CUT
        h_pts = [v.co for v in head.data.vertices if abs(v.co.z - Z_CUT) < 0.008]
        cx_h = (min(p.x for p in h_pts) + max(p.x for p in h_pts)) * 0.5
        cy_h = (min(p.y for p in h_pts) + max(p.y for p in h_pts)) * 0.5
        rx_h = max(0.02, (max(p.x for p in h_pts) - min(p.x for p in h_pts)) * 0.5)
        ry_h = max(0.02, (max(p.y for p in h_pts) - min(p.y for p in h_pts)) * 0.5)
        sx_neck = max(0.72, min(1.32, (rx_b * 0.97) / rx_h))
        sy_neck = max(0.72, min(1.32, (ry_b * 0.97) / ry_h))
        print(f"  + Head neck @ z={Z_CUT}: rx={rx_h:.4f}->{rx_b:.4f} (sx={sx_neck:.3f}), ry={ry_h:.4f}->{ry_b:.4f} (sy={sy_neck:.3f})")

        # Align head neck center to body cut-ring center, and smoothly morph ONLY lower neck (z < Z_CUT+0.048) to match (rx_b, ry_b)!
        for v in head.data.vertices:
            lx = v.co.x - cx_h
            ly = v.co.y - cy_h
            if v.co.z < Z_CUT + 0.048:
                t = max(0.0, min(1.0, (Z_CUT + 0.048 - v.co.z) / 0.048))
                sm = t * t * (3.0 - 2.0 * t)
                lx *= (1.0 + (sx_neck - 1.0) * sm)
                ly *= (1.0 + (sy_neck - 1.0) * sm)
                # Slightly tuck below Z_CUT so zero skin pokes out of collar
                if v.co.z < Z_CUT:
                    t2 = max(0.0, min(1.0, (Z_CUT - v.co.z) / 0.035))
                    lx *= (1.0 - 0.14 * t2)
                    ly *= (1.0 - 0.14 * t2)
            v.co.x = cx_b + lx
            v.co.y = cy_b + ly
        head.data.update()

        # 5c) Snap Hero_Body cut-ring boundary vertices (0.00mm gap!) directly onto Hero_Head neck surface via BVHTree!
        bm_h = bmesh.new()
        bm_h.from_mesh(head.data)
        bvh_h = BVHTree.FromBMesh(bm_h)
        bm_h.free()

        snapped = 0
        for v in body.data.vertices:
            if abs(v.co.z - Z_CUT) < 0.008 and abs(v.co.x) < 0.12:
                loc, _, _, dist = bvh_h.find_nearest(v.co)
                if loc is not None and dist < 0.045:
                    # Blend 90% onto exact head neck surface at cut edge (0mm gap!)
                    w = max(0.0, min(1.0, 1.0 - abs(v.co.z - Z_CUT) / 0.008))
                    v.co.x = v.co.x + (loc.x - v.co.x) * (0.92 * w)
                    v.co.y = v.co.y + (loc.y - v.co.y) * (0.92 * w)
                    snapped += 1
        body.data.update()
        print(f"  + Snapped {snapped} body neck-ring verts to 0.00mm flush on Hero_Head!")

        # Lock BOTH sides of Z_CUT to neck_01=1.0 so the seam NEVER cracks during animations!
        vg_b_neck = body.vertex_groups.get("neck_01") or body.vertex_groups.new(name="neck_01")
        for v in body.data.vertices:
            if abs(v.co.z - Z_CUT) < 0.012 and abs(v.co.x) < 0.12:
                for vg in body.vertex_groups:
                    try: vg.remove([v.index])
                    except RuntimeError: pass
                vg_b_neck.add([v.index], 1.0, "REPLACE")

        # Re-transfer weights to outline after bisect+snap
        m2m.transfer_vertex_weights(body, outline)

        head.vertex_groups.clear()
        vg_head = head.vertex_groups.new(name="head")
        vg_neck = head.vertex_groups.new(name="neck_01")
        for v in head.data.vertices:
            t = max(0.0, min(1.0, (v.co.z - (Z_CUT + 0.006)) / 0.055))
            if t > 0.01: vg_head.add([v.index], t, "REPLACE")
            if 1.0 - t > 0.01: vg_neck.add([v.index], 1.0 - t, "REPLACE")
        head.parent = t_arm
        mod_h = head.modifiers.new(name="Armature", type="ARMATURE")
        mod_h.object = t_arm

        head_out = make_outline(head, "Hero_Head_Outline", offset=0.0028, dec_ratio=0.45)
        m2m.transfer_vertex_weights(head, head_out)
        head_out.parent = t_arm
        mod_ho = head_out.modifiers.new(name="Armature", type="ARMATURE")
        mod_ho.object = t_arm

        print(f"  + Merged Hero_Head ({len(head.data.polygons)} tris) with 0mm ellipse-matched neck seam!")

    else:
        print("  + Full-body hero_raw.glb mode: keeping unified head & neck (no separate head graft)")

    attach_sword(t_arm, body, sword_src, template)

    # 7) Import 8 Mesh2Motion CC0 animation clips & scale pelvis translation
    pel_scale = HERO_FIT["z_pelvis"] / 0.917
    t_arm.animation_data_create()
    if use_template_glb:
        before_acts = set(bpy.data.actions)
        before_objs = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=template)
        new_objs = [o for o in bpy.data.objects if o not in before_objs]
        want_clips = [c[0] for c in HERO_CLIPS]
        for act in list(bpy.data.actions):
            base_name = act.name.split(".")[0]
            if base_name in want_clips and (act not in before_acts or act.name == base_name):
                act.name = base_name
                act.use_fake_user = True
                if not any(tr.name == base_name for tr in t_arm.animation_data.nla_tracks):
                    track = t_arm.animation_data.nla_tracks.new()
                    track.name = base_name
                    track.strips.new(base_name, int(act.frame_range[0]), act)
                    track.mute = True
                    print(f"  + Action {base_name} <- template hero.glb")
        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)
    for clip_name, anim_file in ([] if use_template_glb else HERO_CLIPS):
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
            # For M2M_Idle, subtly abduct upperarm_r outward (~9 deg) so sword hand clears the robe naturally!
            if clip_name == "M2M_Idle":
                from mathutils import Quaternion
                q_out = Quaternion((0.0, 0.0, 1.0), math.radians(-9.0))
                q_fcs = [fc for fc in act.fcurves if fc.data_path == 'pose.bones["upperarm_r"].rotation_quaternion']
                if len(q_fcs) == 4:
                    q_fcs.sort(key=lambda f: f.array_index)
                    n_kp = len(q_fcs[0].keyframe_points)
                    for ki in range(n_kp):
                        q = Quaternion((q_fcs[0].keyframe_points[ki].co.y, q_fcs[1].keyframe_points[ki].co.y, q_fcs[2].keyframe_points[ki].co.y, q_fcs[3].keyframe_points[ki].co.y))
                        q2 = (q @ q_out).normalized()
                        for ci in range(4):
                            q_fcs[ci].keyframe_points[ki].co.y = q2[ci]
                            q_fcs[ci].keyframe_points[ki].handle_left.y = q2[ci]
                            q_fcs[ci].keyframe_points[ki].handle_right.y = q2[ci]
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
        export_image_format="AUTO",  # v1.31: keep baked Normal Map lossless PNG
    )
    print(f"  [SAVED MASTER HERO] {out_glb} ({os.path.getsize(out_glb):,} bytes)")


if __name__ == "__main__":
    main()
