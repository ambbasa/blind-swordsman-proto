"""
scripts/blender/build_bosses_act234.py
2·3·4막 보스 원본 GLB(5만 폴리곤 · 2048px)를 무장 해제(맨손) + 정밀 66본 관절 피팅으로 빌드:
  1) 5만 폴리곤 -> 1.5만 폴리곤 Decimate + 1024px Tangent-Space Normal Map 베이킹
  2) 수묵 먹선 인버티드 헐 외곽선(Boss_Outline) 생성
  3) 원본 3D 메쉬의 실제 어깨/손목/골반/다리 좌표를 직접 계측해 Mesh2Motion 66본 관절을 3D(X/Y/Z) 정밀 정합
  4) 무기 없는 맨손 보스 전용 Mesh2Motion 8종 액션 이식
     - M2M_Idle    <- heavy.glb  (fighting-idle: 맨손 무투 자세)
     - M2M_Walk    <- stone.glb  (walk-large: 묵직한 맨손 보행)
     - M2M_Attack  <- minion.glb (zombie-scratch: 맨손 근접 타격)
     - M2M_Slam    <- stone.glb  (attack-ground-pound: 양손 내려찍기)
     - M2M_Cast    <- boss.glb   (power-burst: 맨손 기합/폭발 시전)
     - M2M_Hit     <- boss.glb   (hit-chest)
     - M2M_Stagger <- boss.glb   (hit-knockback)
     - M2M_Death   <- boss.glb   (death-b)
  5) 복셀 프록시 볼륨 본 히트 스키닝 + 허리/도포/망토 팔·다리 가중치 오염 제거 + 3D 쿼터니언 A->T 정합
  6) 3D 무기 부착 없음 (2·3·4막 보스 전원 맨손)
"""
import argparse
import math
import os
from statistics import median
import sys
import bpy
import bmesh
from mathutils import Vector, Quaternion

sys.path.append(os.path.dirname(__file__))
import apply_mesh2motion as m2m

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_DIR = os.path.join(ROOT, "v2", "assets", "models")
RAW_DIR = os.path.join(ROOT, "scripts", "blender", "_raw_bosses")
TEMPLATE_BOSS_GLB = os.path.join(MODELS_DIR, "boss.glb")

SRC_BOSS_FIT = {
    "z_ankle": 0.11, "z_knee": 0.41, "z_pelvis": 0.71,
    "z_shoulder": 1.21, "z_neck": 1.33, "z_head": 1.45,
    "hip_x": 0.13, "shoulder_x": 0.29, "arm_len": 0.59,
}

# Unarmed Mesh2Motion action donor map: (target_name, source_glb, source_action_name, src_z_pelvis)
UNARMED_ACTIONS = [
    ("M2M_Idle",    "heavy.glb",  "M2M_Idle_Heavy_Armature",   0.72),
    ("M2M_Walk",    "stone.glb",  "M2M_Walk_Stone_Armature",   0.66),
    ("M2M_Attack",  "minion.glb", "M2M_Attack_Minion_Armature", 0.75),
    ("M2M_Slam",    "stone.glb",  "M2M_Attack_Stone_Armature", 0.66),
    ("M2M_Cast",    "boss.glb",   "M2M_Cast_Boss_Armature",    0.71),
    ("M2M_Hit",     "boss.glb",   "M2M_Hit_Boss_Armature",     0.71),
    ("M2M_Stagger", "boss.glb",   "M2M_Stagger_Boss_Armature", 0.71),
    ("M2M_Death",   "boss.glb",   "M2M_Death_Boss_Armature",   0.71),
]

# Exact per-boss anatomical landmarks measured from normalized H=1.72m raw GLBs
BOSS_CONFIGS = [
    {
        "id": "boss_act1",
        "label": "1막 붉은 달의 사냥꾼 (맨손)",
        "raw": "boss_act1_raw.glb",
        "out": "boss.glb",
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.43, "z_pelvis": 0.76,
            "z_shoulder": 1.29, "z_neck": 1.42, "z_head": 1.52,
            "hip_x": 0.165, "shoulder_x": 0.21, "arm_len": 0.48,
        },
        "torso_clean_z": 1.20,
        "torso_clean_x": 0.22,
        "cape_clean": False,
        "arm_floor_z": 0.72,
    },
    {
        "id": "boss_act2",
        "label": "2막 설산 묵승 (맨손)",
        "raw": "boss_act2_raw.glb",
        "out": "boss_act2.glb",
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.42, "z_pelvis": 0.74,
            "z_shoulder": 1.27, "z_neck": 1.40, "z_head": 1.50,
            "hip_x": 0.185, "shoulder_x": 0.22, "arm_len": 0.44,
        },
        "torso_clean_z": 1.18,
        "torso_clean_x": 0.23,
        "cape_clean": False,
        "arm_floor_z": 0.74,
    },
    {
        "id": "boss_act3",
        "label": "3막 혈월 무장 (맨손)",
        "raw": "boss_act3_raw.glb",
        "out": "boss_act3.glb",
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.41, "z_pelvis": 0.72,
            "z_shoulder": 1.24, "z_neck": 1.35, "z_head": 1.46,
            "hip_x": 0.185, "shoulder_x": 0.21, "arm_len": 0.51,
        },
        "torso_clean_z": 1.16,
        "torso_clean_x": 0.22,
        "cape_clean": False,
        "arm_floor_z": 0.62,
    },
    {
        "id": "boss_act4",
        "label": "4막 무간의 검귀 (맨손)",
        "raw": "boss_act4_raw.glb",
        "out": "boss_act4.glb",
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.43, "z_pelvis": 0.75,
            "z_shoulder": 1.31, "z_neck": 1.44, "z_head": 1.54,
            "hip_x": 0.165, "shoulder_x": 0.22, "arm_len": 0.48,
        },
        "torso_clean_z": 1.20,
        "torso_clean_x": 0.23,
        "cape_clean": True,
        "arm_floor_z": 0.74,
    },
]


def map_z_between(z, src_fit, dst_fit):
    sz = [0.000, src_fit["z_ankle"], src_fit["z_knee"], src_fit["z_pelvis"], src_fit["z_shoulder"], src_fit["z_head"], 1.720]
    dz = [0.000, dst_fit["z_ankle"], dst_fit["z_knee"], dst_fit["z_pelvis"], dst_fit["z_shoulder"], dst_fit["z_head"], 1.720]
    if z <= sz[0]:
        return dz[0]
    if z >= sz[-1]:
        return dz[-1] + (z - sz[-1])
    for i in range(len(sz) - 1):
        if sz[i] <= z <= sz[i + 1]:
            t = (z - sz[i]) / max(1e-6, sz[i + 1] - sz[i])
            return dz[i] + t * (dz[i + 1] - dz[i])
    return z


def refit_boss_armature(arm_obj, src_fit, dst_fit):
    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")

    arm_scale = dst_fit["arm_len"] / max(1e-4, src_fit["arm_len"])
    src_sh_x = src_fit["shoulder_x"]
    dst_sh_x = dst_fit["shoulder_x"]
    dst_hip_x = dst_fit["hip_x"]
    src_sh_z = src_fit["z_shoulder"]
    dst_sh_z = dst_fit["z_shoulder"]

    def map_pt(p, bname):
        x, y, z = p.x, p.y, p.z
        nz = map_z_between(z, src_fit, dst_fit)
        nx = x
        if any(bname.startswith(k) for k in m2m.LEG_KEYS):
            sgn = 1.0 if bname.endswith("_l") else -1.0
            nx = sgn * dst_hip_x
        elif bname.startswith("clavicle_"):
            sgn = 1.0 if bname.endswith("_l") else -1.0
            if abs(x) > 0.08:
                nx = sgn * dst_sh_x
                nz = dst_sh_z
        elif any(bname.startswith(k) for k in m2m.ARM_KEYS):
            sgn = 1.0 if bname.endswith("_l") else -1.0
            dx = max(0.0, abs(x) - src_sh_x)
            nx = sgn * (dst_sh_x + dx * arm_scale)
            nz = dst_sh_z + (z - src_sh_z) * arm_scale
        return Vector((nx, y, nz))

    saved_rolls = {eb.name: eb.roll for eb in arm_obj.data.edit_bones}
    for eb in arm_obj.data.edit_bones:
        eb.head = map_pt(eb.head.copy(), eb.name)
        eb.tail = map_pt(eb.tail.copy(), eb.name)
        eb.roll = saved_rolls[eb.name]

    bpy.ops.object.mode_set(mode="OBJECT")


def load_unarmed_actions(t_arm, dst_z_pelvis):
    """Import curated unarmed Mesh2Motion actions from repo GLBs and rescale pelvis Z."""
    # Clear existing actions first
    if t_arm.animation_data:
        t_arm.animation_data_clear()
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act, do_unlink=True)

    # Group donors by source glb so each donor GLB is imported once
    by_glb = {}
    for target_name, src_glb, src_act, src_pel_z in UNARMED_ACTIONS:
        by_glb.setdefault(src_glb, []).append((target_name, src_act, src_pel_z))

    kept_actions = []
    for src_glb, specs in by_glb.items():
        glb_path = os.path.join(MODELS_DIR, src_glb)
        assert os.path.isfile(glb_path), f"Missing donor GLB {glb_path}"
        before_objs = set(bpy.data.objects)
        before_acts = set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=glb_path)
        new_objs = [o for o in bpy.data.objects if o not in before_objs]
        new_acts = [a for a in bpy.data.actions if a not in before_acts]

        # Match requested actions
        for target_name, src_act, src_pel_z in specs:
            found = None
            for a in new_acts:
                if a.name == src_act or a.name.startswith(src_act):
                    found = a
                    break
            assert found is not None, f"Action {src_act} not found in {src_glb} (got {[a.name for a in new_acts]})"
            cp = found.copy()
            cp.name = target_name
            cp.use_fake_user = True
            pel_ratio = dst_z_pelvis / max(1e-4, src_pel_z)
            for fc in cp.fcurves:
                if fc.data_path.endswith('pose.bones["pelvis"].location'):
                    for kp in fc.keyframe_points:
                        kp.co.y *= pel_ratio
                        kp.handle_left.y *= pel_ratio
                        kp.handle_right.y *= pel_ratio
            kept_actions.append(cp)

        # Clean up donor objects & temporary actions
        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)
        for a in new_acts:
            if a.users == 0 or a not in kept_actions:
                bpy.data.actions.remove(a, do_unlink=True)

    t_arm.animation_data_create()
    for act in kept_actions:
        tr = t_arm.animation_data.nla_tracks.new()
        tr.name = act.name
        tr.strips.new(act.name, int(act.frame_range[0]), act)
        tr.mute = True
    t_arm.animation_data.action = None
    print(f"  + Loaded {len(kept_actions)} unarmed Mesh2Motion actions: {[a.name for a in kept_actions]}")


def measure_hand_targets(mesh_obj, wrist_band=None):
    """Measure the exact 3D wrist/hand centers of the normalized A-pose mesh."""
    vs = [v.co for v in mesh_obj.data.vertices]
    if wrist_band:
        # Exclude crowns, pauldrons and flared hems before measuring lateral extrema.
        vs = [p for p in vs if wrist_band[0] <= p.z <= wrist_band[1]]
        if not vs or min(p.x for p in vs) >= 0 or max(p.x for p in vs) <= 0:
            raise ValueError("Cannot locate both arms in the character's wrist band")
        cutoff = 0.65 * min(-min(p.x for p in vs), max(p.x for p in vs))
    else:
        cutoff = 0.30
    l_pts = sorted([v for v in vs if v.x > cutoff], key=lambda v: -v.x)[:90]
    r_pts = sorted([v for v in vs if v.x < -cutoff], key=lambda v: v.x)[:90]
    lh = sum(l_pts, Vector((0, 0, 0))) / max(1, len(l_pts))
    rh = sum(r_pts, Vector((0, 0, 0))) / max(1, len(r_pts))
    # Pull slightly inward (7%) from fingertips toward wrist joint center
    lh_wrist = Vector((lh.x * 0.93, lh.y, lh.z + 0.015))
    rh_wrist = Vector((rh.x * 0.93, rh.y, rh.z + 0.015))
    return lh_wrist, rh_wrist


def compute_arm_local_quat(arm_obj, upper_name, hand_name, target_world):
    """Compute exact local quaternion on upperarm so hand_name.head lands on target_world."""
    ub = arm_obj.data.bones[upper_name]
    hb = arm_obj.data.bones[hand_name]
    sh_w = arm_obj.matrix_world @ ub.head_local
    hd_w = arm_obj.matrix_world @ hb.head_local
    v_src = (hd_w - sh_w).normalized()
    v_dst = (target_world - sh_w).normalized()
    b_rot_inv = (arm_obj.matrix_world.to_3x3() @ ub.matrix_local.to_3x3()).inverted()
    v_src_l = (b_rot_inv @ v_src).normalized()
    v_dst_l = (b_rot_inv @ v_dst).normalized()
    return v_src_l.rotation_difference(v_dst_l)


def guardian_ankle(mesh_obj, side, height):
    # Sample the lower shin, not the toe (whose forward projection biases Y).
    points = [v.co for v in mesh_obj.data.vertices
              if abs(v.co.z - height) < 0.045 and side * v.co.x > 0.025]
    if not points:
        raise ValueError("Cannot locate both lower legs in the guardian raw mesh")
    return Vector((median(p.x for p in points), median(p.y for p in points), height))


def bake_normal_map(high_obj, low_obj, img_name, size=1024):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.012
    scene.render.bake.max_ray_distance = 0.028
    scene.render.bake.margin = 4

    n_img = bpy.data.images.new(img_name, width=size, height=size, alpha=False)
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
    print(f"  + Baked 50k->15k Normal Map ({size}x{size}, strength=0.95) onto {low_obj.name}")

    # v1.31: Bake 50k->15k Ambient Occlusion (AO) and multiply onto Base Color for crisp sculpt depth
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
        mix.inputs["Factor"].default_value = 0.42
        nt.links.new(orig_from, mix.inputs[6])
        nt.links.new(ao_node.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], base_inp)
        print(f"  + Baked & multiplied 50k->15k AO Map ({size}x{size}, factor=0.42) onto Base Color")
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


def make_outline(src_obj, name, offset=0.0040, dec_ratio=0.50):
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


def build_character(cfg, raw_dir=RAW_DIR, out_dir=MODELS_DIR, carved=False):
    bid = cfg["id"]
    raw_path = os.path.join(raw_dir, cfg["raw"])
    out_path = os.path.join(out_dir, cfg["out"])
    fit = dict(cfg["fit"])
    prefix = cfg.get("mesh_prefix", "Boss")
    template = cfg.get("template", TEMPLATE_BOSS_GLB)
    if not os.path.isfile(raw_path):
        if carved:
            raise FileNotFoundError(raw_path)
        print(f"  [SKIP] Missing {raw_path}")
        return
    assert os.path.isfile(template), f"Missing {template}"

    print(f"\n================ [{bid.upper()}] {cfg['label']} ================")
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1) Load base 66-bone Mesh2Motion armature from boss.glb & replace with 8 unarmed actions
    bpy.ops.import_scene.gltf(filepath=template)
    t_arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    t_arm.name = f"{bid}_Armature"
    for o in list(bpy.data.objects):
        if o.type == "MESH":
            bpy.data.objects.remove(o, do_unlink=True)

    if "clip_names" in cfg:
        # Imported glTF animations are stashed as NLA tracks. Keep the character's
        # actual clips (including sword combos or ground pound), not generic cycles.
        anim = t_arm.animation_data
        expected = set(cfg["clip_names"])
        found = set()
        if anim:
            anim.action = None
            for track in list(anim.nla_tracks):
                if track.name not in expected:
                    anim.nla_tracks.remove(track)
                    continue
                track.mute = True
                found.add(track.name)
        if expected != found:
            raise ValueError(f"{bid}: missing template clips {sorted(expected - found)}")
    else:
        load_unarmed_actions(t_arm, fit["z_pelvis"])
    # Reset all pose bones to exact rest identity (clearing glTF import frame-0 pose residue)
    for pb in t_arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()

    # 2) Import 50k-poly 2048px raw boss mesh & normalize to H=1.72m with torso-spine Y alignment
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=raw_path)
    raw_meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    assert raw_meshes, f"No mesh in {raw_path}"
    for o in raw_meshes:
        o.parent = None
    bpy.ops.object.select_all(action="DESELECT")
    for o in raw_meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = raw_meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(raw_meshes) > 1:
        bpy.ops.object.join()
    body_high = bpy.context.active_object
    body_high.name = f"{prefix}_Body_High50k"

    bmin, bmax = m2m.get_world_bbox(body_high)
    s = 1.72 / max(1e-4, bmax.z - bmin.z)
    cx = (bmin.x + bmax.x) * 0.5
    cz = bmin.z
    # First scale X, Z and center Y roughly, then measure torso core Y to align with M2M spine (y=+0.02)
    cy_rough = (bmin.y + bmax.y) * 0.5
    for v in body_high.data.vertices:
        v.co.x = (v.co.x - cx) * s
        v.co.y = (v.co.y - cy_rough) * s
        v.co.z = (v.co.z - cz) * s
    torso_vs = [v.co.y for v in body_high.data.vertices if 0.70 <= v.co.z <= 1.25 and abs(v.co.x) < 0.15]
    if torso_vs:
        torso_y = sum(torso_vs) / len(torso_vs)
        y_shift = 0.020 - torso_y
        for v in body_high.data.vertices:
            v.co.y += y_shift
        print(f"  + Aligned torso core Y ({torso_y:.3f} -> +0.020, shift={y_shift:+.3f}m)")
    body_high.data.update()

    # Measure exact 3D wrist targets and compute true arm_len from shoulder -> wrist
    lh_wrist, rh_wrist = measure_hand_targets(body_high, cfg.get("wrist_band"))
    guardian = cfg.get("guardian", False)
    horizontal_arms = cfg.get("horizontal_arms", True)
    source_fit = dict(cfg.get("source_fit", SRC_BOSS_FIT))
    if guardian:
        fit["spread_stance"] = True
        # The shipped donor is itself a fitted export: its physical arm length
        # need not match the historical profile used for the first generation.
        bones = t_arm.data.bones
        shoulder = bones["upperarm_l"].head_local
        source_fit["shoulder_x"] = abs(shoulder.x)
        source_fit["z_shoulder"] = shoulder.z
        source_fit["arm_len"] = (bones["hand_l"].head_local - shoulder).length
        if horizontal_arms:
            shoulder_z = (lh_wrist.z + rh_wrist.z) / 2
            for key in ("z_neck", "z_head"):
                fit[key] = min(1.71, fit[key] + shoulder_z - fit["z_shoulder"])
            fit["z_shoulder"] = shoulder_z
        else:
            # 45-deg A-pose guardian (e.g. hero): keep anatomical shoulder/neck/head heights,
            # nudge wrist target slightly up along the angled forearm, and lower arm skinning floor
            # so forearms/hands stay in arm territory while spread knees stay excluded.
            lh_wrist = Vector((lh_wrist.x, lh_wrist.y, lh_wrist.z + 0.020))
            rh_wrist = Vector((rh_wrist.x, rh_wrist.y, rh_wrist.z + 0.020))
            fit["arm_min_z"] = max(fit["z_pelvis"] - 0.03, min(lh_wrist.z, rh_wrist.z) - 0.14)
    sh_l = Vector((fit["shoulder_x"], 0.065, fit["z_shoulder"]))
    sh_r = Vector((-fit["shoulder_x"], 0.065, fit["z_shoulder"]))
    true_arm_len = 0.5 * ((lh_wrist - sh_l).length + (rh_wrist - sh_r).length)
    fit["arm_len"] = round(true_arm_len, 4)

    refit_boss_armature(t_arm, source_fit, fit)
    print(f"  + Refitted 66-bone armature (pelvis_z={fit['z_pelvis']:.2f}, hip_x={fit['hip_x']:.3f}, sh=({fit['shoulder_x']:.2f},{fit['z_shoulder']:.2f}), arm_len={fit['arm_len']:.3f})")
    print(f"    Measured wrists: L={tuple(round(c,3) for c in lh_wrist)}, R={tuple(round(c,3) for c in rh_wrist)}")

    # 3) Decimate to ~15,000 tris & Bake 50k->15k Normal Map
    bpy.ops.object.select_all(action="DESELECT")
    body_high.select_set(True)
    bpy.context.view_layer.objects.active = body_high
    bpy.ops.object.duplicate()
    body = bpy.context.active_object
    body.name = f"{prefix}_Body"
    body.data = body.data.copy()
    body.data.name = body.name
    dec = body.modifiers.new(name="Decimate", type="DECIMATE")
    dec.ratio = 0.30
    if "tri_budget" in cfg:
        triangles = sum(len(p.vertices) - 2 for p in body.data.polygons)
        dec.ratio = min(1.0, cfg["tri_budget"] / max(1, triangles))
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for poly in body.data.polygons:
        poly.use_smooth = not carved

    if not carved:
        bake_normal_map(body_high, body, f"{bid}_Normal", size=1024)
    bpy.data.objects.remove(body_high, do_unlink=True)

    # 4) Inverted-hull sumi-ink outline
    outline = make_outline(body, f"{prefix}_Outline", offset=0.0040, dec_ratio=0.50)

    # 5) Create Temp_APose_Arm matched in full 3D (X/Y/Z) via exact quaternion rotation_difference
    bpy.ops.object.select_all(action="DESELECT")
    t_arm.select_set(True)
    bpy.context.view_layer.objects.active = t_arm
    bpy.ops.object.duplicate()
    a_arm = bpy.context.active_object
    a_arm.name = "Temp_APose_Arm"
    a_arm.animation_data_clear()

    targets = [("upperarm_l", "hand_l", lh_wrist), ("upperarm_r", "hand_r", rh_wrist)]
    if guardian:
        for suffix, side in (("l", 1), ("r", -1)):
            ankle = guardian_ankle(body, side, fit["z_ankle"])
            targets.append((f"thigh_{suffix}", f"foot_{suffix}", ankle))
    rotations = []
    for start, end, target in targets:
        rotation = compute_arm_local_quat(a_arm, start, end, target)
        # Do not bake noisy sub-degree corrections into an already level arm.
        if not guardian or rotation.angle > math.radians(2):
            rotations.append((start, rotation))

    bpy.ops.object.mode_set(mode="POSE")
    for bname, q in rotations:
        pb = a_arm.pose.bones[bname]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = q
    bpy.context.view_layer.update()
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Verify exact 3D wrist error after A-pose fitting
    hl_after = a_arm.matrix_world @ a_arm.data.bones["hand_l"].head_local
    hr_after = a_arm.matrix_world @ a_arm.data.bones["hand_r"].head_local
    err_l = (hl_after - lh_wrist).length * 100.0
    err_r = (hr_after - rh_wrist).length * 100.0
    print(f"  + 3D A-pose wrist fit error: L={err_l:.2f}cm, R={err_r:.2f}cm")

    # 6) Volumetric Voxel-Proxy Bone Heat skinning + strip torso/robe/cape arm & leg bleed
    m2m.skin_via_voxel_heat(body, a_arm, fit)
    arm_vg_names = {"clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r"}
    leg_vg_names = {"thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r", "ball_l", "ball_r"}
    arm_vgs = [vg for vg in body.vertex_groups if vg.name in arm_vg_names]
    leg_vgs = [vg for vg in body.vertex_groups if vg.name in leg_vg_names]
    spine_vg = body.vertex_groups.get("spine_02") or body.vertex_groups.get("spine_01")
    pelvis_vg = body.vertex_groups.get("pelvis") or spine_vg
    cleaned = 0
    cape_cleaned = 0
    arm_floor_z = cfg.get("arm_floor_z", 0.78)
    # Hard coordinate cuts were intended for long robes / A-pose arms before A->T bake.
    # Horizontal-arm guardian silhouettes keep continuous heat weights; 45-deg A-pose guardians
    # still strip torso arm bleed so the waist/belt does not kink when rotating arms up to T-pose.
    for v in (() if (guardian and horizontal_arms) else body.data.vertices):
        in_torso_core = (v.co.z < cfg["torso_clean_z"] and abs(v.co.x) < cfg["torso_clean_x"])
        below_arms = (v.co.z < arm_floor_z and abs(v.co.x) < 0.40)
        in_rear_cape = (cfg.get("cape_clean") and v.co.y > 0.10 and abs(v.co.x) < 0.40 and v.co.z < 1.25)
        if in_torso_core or below_arms or in_rear_cape:
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
                if not v.groups:
                    target_vg = pelvis_vg if v.co.z < fit["z_pelvis"] + 0.10 else spine_vg
                    if target_vg:
                        target_vg.add([v.index], 1.0, "REPLACE")
        if in_rear_cape and v.co.z < 0.95:
            had_c = False
            for vg in leg_vgs:
                try:
                    if vg.weight(v.index) > 0.0:
                        vg.remove([v.index])
                        had_c = True
                except RuntimeError:
                    pass
            if had_c:
                cape_cleaned += 1
                if pelvis_vg:
                    pelvis_vg.add([v.index], 0.70, "REPLACE")
                if spine_vg:
                    spine_vg.add([v.index], 0.30, "ADD")
    print(f"  + Stripped arm-weight bleed from {cleaned} torso verts (cape={cape_cleaned})")
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

    m2m.transfer_vertex_weights(body, outline)
    outline.parent = a_arm
    mod_o = outline.modifiers.new(name="Armature", type="ARMATURE")
    mod_o.object = a_arm

    # 7) Rotate Temp_APose_Arm back into exact T-pose via inverse quaternions and bake body + outline
    bpy.ops.object.select_all(action="DESELECT")
    a_arm.select_set(True)
    bpy.context.view_layer.objects.active = a_arm
    bpy.ops.object.mode_set(mode="POSE")
    for bname, q in rotations:
        pb = a_arm.pose.bones[bname]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = q.inverted()
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

    if cfg.get("keep_sword"):
        from build_hero_master import attach_sword
        attach_sword(t_arm, body, template, template)

    # 9) Export GLB
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
        if o.type in ("ARMATURE", "MESH"):
            o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        **({"export_animation_mode": "NLA_TRACKS"} if "clip_names" in cfg else {}),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_force_sampling=True,
        export_yup=True,
        export_image_format="AUTO",  # v1.31: keep baked Normal Map lossless PNG
    )
    print(f"  [SAVED UNARMED] {out_path} ({os.path.getsize(out_path):,} bytes)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=[cfg["id"] for cfg in BOSS_CONFIGS])
    parser.add_argument("--raw-dir", default=RAW_DIR)
    parser.add_argument("--out-dir", default=MODELS_DIR)
    parser.add_argument("--carved", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    os.makedirs(args.out_dir, exist_ok=True)
    for cfg in BOSS_CONFIGS:
        if not args.only or cfg["id"] == args.only:
            build_character(cfg, args.raw_dir, args.out_dir, args.carved)


if __name__ == "__main__":
    main()
