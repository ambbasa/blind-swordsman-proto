"""
scripts/blender/apply_mesh2motion.py
기존 5종 캐릭터 GLB(hero, minion, heavy, stone, boss)의 실제 3D 메시 단면 치수를 측정해
Mesh2Motion CC0 66본 스켈레톤의 관절 위치(골반·척추·어깨 폭·팔 길이·무릎·목·머리)를
캐릭터별로 정밀 피팅한 뒤, 종별 모션캡처 애니메이션을 이식합니다.
- 캐릭터별 실측 A-포즈 팔 각도(67°~78°)로 임시 스키닝 후 T-포즈 정합
- DATA_TRANSFER로 외곽선(Outline) 메시에도 동일한 본 가중치 전사
- 주인공 환도(Hero_Sword)도 A->T 변환에 함께 참여시켜 hand_r 손잡이 각도 자동 정합
"""
import math
import os
import bpy
from mathutils import Vector, Euler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_DIR = os.path.join(ROOT, "v2", "assets", "models")
M2M_DIR = "/tmp/m2m_raw"

# Mesh2Motion skeleton.glb 표준 기준치 (H = 1.72m)
STD_Z = [0.000, 0.098, 0.526, 0.917, 1.446, 1.568, 1.720]
STD_HIP_X = 0.089
STD_SH_X = 0.174
STD_ARM_LEN = 0.576  # upperarm_l(0.174 -> 0.470) + lowerarm_l(0.470 -> 0.750)

CHARACTERS = [
    {
        "name": "hero",
        "keep_sword": True,
        # 실측 단면 기반 (H=1.72m 정규화 기준)
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.45, "z_pelvis": 0.78,
            "z_shoulder": 1.28, "z_neck": 1.39, "z_head": 1.50,
            "hip_x": 0.11, "shoulder_x": 0.23, "arm_len": 0.58,
            "a_deg": 67.0,
        },
        "clips": [
            ("M2M_Idle",  "idle-sword.glb"),
            ("M2M_Walk",  "jog.glb"),
            ("M2M_Slash", "sword-regular-a.glb"),
            ("M2M_Hit",   "hit-chest.glb"),
        ],
    },
    {
        "name": "minion",
        "keep_sword": False,
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.44, "z_pelvis": 0.75,
            "z_shoulder": 1.25, "z_neck": 1.36, "z_head": 1.48,
            "hip_x": 0.12, "shoulder_x": 0.22, "arm_len": 0.60,
            "a_deg": 69.0,
        },
        "clips": [
            ("M2M_Idle",   "zombie-idle.glb"),
            ("M2M_Walk",   "zombie-run.glb"),
            ("M2M_Attack", "zombie-scratch.glb"),
            ("M2M_Hit",    "hit-chest.glb"),
        ],
    },
    {
        "name": "heavy",
        "keep_sword": False,
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.42, "z_pelvis": 0.72,
            "z_shoulder": 1.24, "z_neck": 1.39, "z_head": 1.50,
            "hip_x": 0.15, "shoulder_x": 0.30, "arm_len": 0.65,
            "a_deg": 73.0,
        },
        "clips": [
            ("M2M_Idle",   "fighting-idle.glb"),
            ("M2M_Walk",   "walk-large.glb"),
            ("M2M_Attack", "two-handed-overhead-slam.glb"),
            ("M2M_Hit",    "hit-knockback.glb"),
        ],
    },
    {
        "name": "stone",
        "keep_sword": False,
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.38, "z_pelvis": 0.66,
            "z_shoulder": 1.30, "z_neck": 1.48, "z_head": 1.58,
            "hip_x": 0.16, "shoulder_x": 0.38, "arm_len": 0.86,
            "a_deg": 74.0,
        },
        "clips": [
            ("M2M_Idle",   "idle-a.glb"),
            ("M2M_Walk",   "walk-large.glb"),
            ("M2M_Attack", "attack-ground-pound.glb"),
            ("M2M_Hit",    "hit-chest.glb"),
        ],
    },
    {
        "name": "boss",
        "keep_sword": False,
        # 뿔(z=0.93~1.00)을 제외한 실제 투구·어깨(z=0.705)·골반 기준 피팅!
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.41, "z_pelvis": 0.71,
            "z_shoulder": 1.21, "z_neck": 1.33, "z_head": 1.45,
            "hip_x": 0.13, "shoulder_x": 0.29, "arm_len": 0.59,
            "a_deg": 75.0,
        },
        "clips": [
            ("M2M_Idle",   "polearm-idle.glb"),
            ("M2M_Walk",   "polearm-run.glb"),
            ("M2M_Attack", "two-handed-horizontal-swing.glb"),
            ("M2M_Cast",   "power-burst.glb"),
            ("M2M_Hit",    "hit-knockback.glb"),
            ("M2M_Death",  "death-b.glb"),
        ],
    },
]

MAJOR_BONES = {
    "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head",
    "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
    "thigh_l", "calf_l", "foot_l", "ball_l",
    "thigh_r", "calf_r", "foot_r", "ball_r",
}

LEG_KEYS = ("thigh_", "calf_", "foot_", "ball_")
ARM_KEYS = ("upperarm_", "lowerarm_", "hand_", "thumb_", "index_", "middle_", "ring_", "pinky_")


def map_z(z, fit):
    dst = [0.000, fit["z_ankle"], fit["z_knee"], fit["z_pelvis"], fit["z_shoulder"], fit["z_head"], 1.720]
    if z <= STD_Z[0]:
        return dst[0]
    if z >= STD_Z[-1]:
        return dst[-1] + (z - STD_Z[-1])
    for i in range(len(STD_Z) - 1):
        if STD_Z[i] <= z <= STD_Z[i + 1]:
            t = (z - STD_Z[i]) / max(1e-6, STD_Z[i + 1] - STD_Z[i])
            return dst[i] + t * (dst[i + 1] - dst[i])
    return z


def fit_skeleton_to_profile(arm_obj, fit):
    """Edit Mode에서 Mesh2Motion 66본 관절 좌표를 캐릭터 실측 치수에 정밀 피팅 (본 축/롤 유지)."""
    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")

    arm_scale = fit["arm_len"] / STD_ARM_LEN
    sh_x = fit["shoulder_x"]
    hip_x = fit["hip_x"]
    sh_z = fit["z_shoulder"]

    def map_point(p, bname):
        x, y, z = p.x, p.y, p.z
        nz = map_z(z, fit)
        nx = x
        if any(bname.startswith(k) for k in LEG_KEYS):
            sgn = 1.0 if bname.endswith("_l") else -1.0
            nx = sgn * hip_x
        elif bname.startswith("clavicle_"):
            sgn = 1.0 if bname.endswith("_l") else -1.0
            if abs(x) > 0.08:
                nx = sgn * sh_x
                nz = sh_z
        elif any(bname.startswith(k) for k in ARM_KEYS):
            sgn = 1.0 if bname.endswith("_l") else -1.0
            dx = max(0.0, abs(x) - STD_SH_X)
            nx = sgn * (sh_x + dx * arm_scale)
            # T-포즈 팔은 어깨 높이 sh_z에 수평 정렬 (손가락 미세 Z 오프셋만 비례 유지)
            nz = sh_z + (z - 1.444) * arm_scale
        return Vector((nx, y, nz))

    saved_rolls = {eb.name: eb.roll for eb in arm_obj.data.edit_bones}
    for eb in arm_obj.data.edit_bones:
        eb.head = map_point(eb.head.copy(), eb.name)
        eb.tail = map_point(eb.tail.copy(), eb.name)
        eb.roll = saved_rolls[eb.name]

    bpy.ops.object.mode_set(mode="OBJECT")


def point_seg_dist(p, a, b):
    ab = b - a
    l2 = ab.length_squared
    if l2 < 1e-8:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / l2))
    return (p - (a + ab * t)).length


def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / max(1e-6, edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def assign_smooth_weights(mesh_obj, arm_obj, fit):
    bones = [
        (b.name, b.head_local.copy(), b.tail_local.copy())
        for b in arm_obj.data.bones
        if b.name in MAJOR_BONES
    ]
    mesh_obj.vertex_groups.clear()
    vgs = {name: mesh_obj.vertex_groups.new(name=name) for name, _, _ in bones}
    sh_x = fit["shoulder_x"]
    sh_z = fit["z_shoulder"]
    neck_z = fit["z_neck"]
    hip_x = fit["hip_x"]

    for v in mesh_obj.data.vertices:
        p = v.co
        ax = abs(p.x)
        # 목 위 머리/투구/뿔 영역은 head 뼈가 단단히 지배하도록 처리
        if p.z > neck_z + 0.04 and ax < sh_x * 0.85:
            vgs["head"].add([v.index], 1.0, "REPLACE")
            continue

        # 부드러운 영역 판별 계수 (급격한 절단선으로 인한 스파이크 방지)
        in_torso_x = 1.0 - smoothstep(sh_x * 0.65, sh_x * 1.05, ax)
        below_sh = 1.0 - smoothstep(sh_z - 0.14, sh_z + 0.02, p.z)
        out_arm_x = smoothstep(hip_x + 0.10, hip_x + 0.22, ax)

        dists = []
        for name, a, b in bones:
            d = point_seg_dist(p, a, b)
            # 좌우 팔다리 교차 오염 차단
            if name.endswith("_l") and p.x < -0.02:
                d += 0.50 * smoothstep(-0.02, -0.10, p.x)
            elif name.endswith("_r") and p.x > 0.02:
                d += 0.50 * smoothstep(0.02, 0.10, p.x)
            # 몸통/치마 중심부가 팔/손에 끌려가지 않도록 부드러운 감쇠 페널티
            if name.startswith("lowerarm_") or name.startswith("hand_"):
                d += 0.55 * in_torso_x * below_sh
            elif name.startswith("upperarm_"):
                d += 0.30 * (1.0 - smoothstep(sh_x * 0.50, sh_x * 0.85, ax)) * below_sh
            # 바깥쪽 팔 정점이 다리/척추에 끌리지 않도록 부드러운 감쇠 페널티
            if any(name.startswith(k) for k in LEG_KEYS):
                d += 0.55 * out_arm_x * smoothstep(0.12, 0.30, p.z)
            if name.startswith("spine_") or name == "pelvis":
                d += 0.45 * out_arm_x * below_sh
            dists.append((d, name))

        dists.sort(key=lambda x: x[0])
        top = dists[:3]
        raw = [1.0 / ((d + 0.032) ** 3.2) for d, _ in top]
        s = sum(raw) or 1.0
        for (_, name), w in zip(top, raw):
            wn = w / s
            if wn > 0.02:
                vgs[name].add([v.index], wn, "REPLACE")



def smooth_weights_mesh(mesh_obj, iterations=3, factor=0.55):
    n = len(mesh_obj.data.vertices)
    adj = [[] for _ in range(n)]
    for e in mesh_obj.data.edges:
        a, b = e.vertices[0], e.vertices[1]
        adj[a].append(b)
        adj[b].append(a)
    cur = []
    for v in mesh_obj.data.vertices:
        d = {}
        for g in v.groups:
            if g.weight > 1e-4:
                d[g.group] = g.weight
        cur.append(d)
    for _ in range(iterations):
        nxt = []
        for i in range(n):
            nb = adj[i]
            if not nb:
                nxt.append(cur[i])
                continue
            acc = {}
            for k, w in cur[i].items():
                acc[k] = w * (1.0 - factor)
            inv = factor / len(nb)
            for j in nb:
                for k, w in cur[j].items():
                    acc[k] = acc.get(k, 0.0) + w * inv
            # keep top 4 and normalize
            top = sorted(acc.items(), key=lambda x: x[1], reverse=True)[:4]
            tot = sum(w for _, w in top) or 1.0
            nxt.append({k: w / tot for k, w in top if w / tot > 0.01})
        cur = nxt
    vgs = list(mesh_obj.vertex_groups)
    for vg in vgs:
        vg.remove(range(n))
    for i, d in enumerate(cur):
        for k, w in d.items():
            vgs[k].add([i], w, "REPLACE")


def skin_via_voxel_heat(body, a_arm, fit):
    # Create watertight voxel proxy so Blender native ARMATURE_AUTO (bone heat) succeeds 100% without air-gap bleed!
    for b in a_arm.data.bones:
        b.use_deform = b.name in MAJOR_BONES

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.duplicate()
    proxy = bpy.context.active_object
    proxy.name = "Temp_Heat_Proxy"
    proxy.vertex_groups.clear()

    rm = proxy.modifiers.new(name="VoxelRemesh", type="REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = 0.028
    bpy.ops.object.modifier_apply(modifier=rm.name)

    bpy.ops.object.select_all(action="DESELECT")
    proxy.select_set(True)
    a_arm.select_set(True)
    bpy.context.view_layer.objects.active = a_arm
    heat_ok = False
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        w_cnt = sum(1 for v in proxy.data.vertices if len(v.groups) > 0)
        if w_cnt >= len(proxy.data.vertices) * 0.90:
            heat_ok = True
            print(f"  Voxel-Proxy Bone Heat OK ({w_cnt}/{len(proxy.data.vertices)} proxy verts)")
    except Exception as e:
        print(f"  Voxel-Proxy Bone Heat failed: {e}")

    if heat_ok:
        transfer_vertex_weights(proxy, body)
        # Ensure 100% of vertices (including tiny disconnected hair/rag islands) have valid bone weights
        bones_m = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in a_arm.data.bones if b.name in MAJOR_BONES]
        vgs_by_name = {vg.name: vg for vg in body.vertex_groups}
        fixed = 0
        for v in body.data.vertices:
            if not v.groups or sum(g.weight for g in v.groups) < 0.05:
                best = min(bones_m, key=lambda b: point_seg_dist(v.co, b[1], b[2]))[0]
                if best not in vgs_by_name:
                    vgs_by_name[best] = body.vertex_groups.new(name=best)
                vgs_by_name[best].add([v.index], 1.0, "REPLACE")
                fixed += 1
        if fixed:
            print(f"  Patched {fixed} disconnected island verts to nearest bone")
        body.parent = a_arm
        mod = body.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = a_arm
    else:
        body.parent = a_arm
        mod = body.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = a_arm
        assign_smooth_weights(body, a_arm, fit)
        smooth_weights_mesh(body, iterations=3, factor=0.55)
        print("  Fallback to smooth distance weights")

    bpy.data.objects.remove(proxy, do_unlink=True)

def transfer_vertex_weights(src, dst):
    dst.vertex_groups.clear()
    for vg in src.vertex_groups:
        dst.vertex_groups.new(name=vg.name)
    bpy.ops.object.select_all(action="DESELECT")
    dst.select_set(True)
    bpy.context.view_layer.objects.active = dst
    dt = dst.modifiers.new(name="WeightTransfer", type="DATA_TRANSFER")
    dt.object = src
    dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "NEAREST"
    bpy.ops.object.modifier_apply(modifier=dt.name)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)


def get_world_bbox(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def process_character(cfg):
    name = cfg["name"]
    fit = cfg["fit"]
    src_glb = f"/tmp/models_png/{name}.glb"
    out_glb = os.path.join(MODELS_DIR, f"{name}.glb")
    if not os.path.isfile(src_glb):
        print(f"[SKIP] Missing {src_glb}")
        return

    print(f"\n================ [{name.upper()}] Fitted Mesh2Motion Rigging ================")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src_glb)

    body = None
    outline = None
    sword = None
    sword_out = None
    to_remove = []

    for obj in list(bpy.data.objects):
        low = obj.name.lower()
        if obj.type == "ARMATURE":
            to_remove.append(obj)
        elif obj.type == "MESH":
            for mod in list(obj.modifiers):
                if mod.type == "ARMATURE":
                    obj.modifiers.remove(mod)
            obj.vertex_groups.clear()
            obj.animation_data_clear()
            obj.parent = None
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            obj.select_set(False)
            if "sword" in low:
                if "outline" in low:
                    sword_out = obj
                else:
                    sword = obj
            elif "outline" in low:
                outline = obj
            else:
                if body is None:
                    body = obj

    for obj in to_remove:
        bpy.data.objects.remove(obj, do_unlink=True)
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)

    assert body is not None, f"Body mesh not found in {src_glb}"

    if not cfg["keep_sword"]:
        for so in [sword, sword_out]:
            if so is not None:
                bpy.data.objects.remove(so, do_unlink=True)
        sword = None
        sword_out = None

    # 1) Normalize body, outline, sword together to H = 1.72m
    bmin, bmax = get_world_bbox(body)
    cur_h = max(1e-4, bmax.z - bmin.z)
    skel_h = 1.72
    s = skel_h / cur_h
    cx = (bmin.x + bmax.x) * 0.5
    cy = (bmin.y + bmax.y) * 0.5
    cz = bmin.z

    for o in [body, outline, sword, sword_out]:
        if o is None:
            continue
        for v in o.data.vertices:
            v.co.x = (v.co.x - cx) * s
            v.co.y = (v.co.y - cy) * s
            v.co.z = (v.co.z - cz) * s
        o.data.update()

    # 2) Import Mesh2Motion T-pose skeleton and FIT every joint to this character's measured proportions!
    bpy.ops.import_scene.gltf(filepath=os.path.join(M2M_DIR, "skeleton.glb"))
    t_arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    t_arm.name = f"{name.capitalize()}_Armature"
    fit_skeleton_to_profile(t_arm, fit)
    print(f"  Fitted rig: sh_x={fit['shoulder_x']:.2f}m sh_z={fit['z_shoulder']:.2f}m pel_z={fit['z_pelvis']:.2f}m arm={fit['arm_len']:.2f}m a_deg={fit['a_deg']:.1f}°")

    # Duplicate fitted T-pose rig into temp A-pose rig matching sculpted arm angle
    bpy.ops.object.select_all(action="DESELECT")
    t_arm.select_set(True)
    bpy.context.view_layer.objects.active = t_arm
    bpy.ops.object.duplicate()
    a_arm = bpy.context.active_object
    a_arm.name = "Temp_APose_Arm"

    a_rad = math.radians(fit["a_deg"])
    bpy.ops.object.mode_set(mode="POSE")
    for bname, sgn in [("upperarm_l", -1.0), ("upperarm_r", 1.0)]:
        pb = a_arm.pose.bones[bname]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = Euler((0.0, 0.0, sgn * a_rad), "XYZ")
    bpy.context.view_layer.update()
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # 3) Skin body to fitted Temp_APose_Arm via watertight Voxel-Proxy Volumetric Bone Heat!
    skin_via_voxel_heat(body, a_arm, fit)

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

    if outline is not None:
        transfer_vertex_weights(body, outline)
        outline.parent = a_arm
        mod = outline.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = a_arm
        print(f"  Outline weights transferred: {len(outline.data.vertices)} verts")

    for so in [sword, sword_out]:
        if so is None:
            continue
        so.vertex_groups.clear()
        vg = so.vertex_groups.new(name="hand_r")
        vg.add([v.index for v in so.data.vertices], 1.0, "REPLACE")
        so.parent = a_arm
        mod = so.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = a_arm

    # 4) Rotate Temp_APose_Arm arms BACK UP into fitted T-pose and bake meshes into T-pose!
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

    for o in [body, outline, sword, sword_out]:
        if o is None:
            continue
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

    # 5) Import curated Mesh2Motion CC0 animation actions & scale pelvis translation to fitted leg height
    pel_scale = fit["z_pelvis"] / 0.917
    t_arm.animation_data_create()
    for clip_name, anim_file in cfg["clips"]:
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
            start_f = int(act.frame_range[0])
            track.strips.new(clip_name, start_f, act)
            track.mute = True
            print(f"  + Action {clip_name} <- {anim_file} ({int(act.frame_range[0])}..{int(act.frame_range[1])}f)")
        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)

    t_arm.animation_data.action = None

    # 6) Export final fitted Mesh2Motion-rigged GLB
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
    print(f"  [SAVED] {out_glb} ({os.path.getsize(out_glb):,} bytes)")


def main():
    for cfg in CHARACTERS:
        process_character(cfg)
    print("\n[ALL 5 CHARACTERS FITTED & RIGGED WITH MESH2MOTION CC0 ANIMATIONS!]")


if __name__ == "__main__":
    main()
