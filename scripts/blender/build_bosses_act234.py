"""
scripts/blender/build_bosses_act234.py
2·3·4막 보스 원본 GLB(5만 폴리곤 · 2048px)를 주인공 마스터(build_hero_master.py)와 동일한 품질로 빌드:
  1) 5만 폴리곤 -> 1.5만 폴리곤 Decimate + 1024px Tangent-Space Normal Map 베이킹
  2) 수묵 먹선 인버티드 헐 외곽선(Boss_Outline) 생성
  3) 기존 boss.glb의 Mesh2Motion 66본 스켈레톤 + 8종 보스 모션 이식 & 보스별 실측 체형 정밀 피팅
  4) 복셀 프록시 볼륨 본 히트 스키닝 + 허리/도포 팔 가중치 오염 제거 + A->T 포즈 정합
  5) 막별 전용 3D 무기 오른손 손바닥(hand_r) 정밀 밀착 부착 (2막 설산 석장 / 3막 혈월 언월도 / 4막 무간 대태도)
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
RAW_DIR = os.path.join(ROOT, "scripts", "blender", "_raw_bosses")
TEMPLATE_BOSS_GLB = os.path.join(MODELS_DIR, "boss.glb")

SRC_BOSS_FIT = {
    "z_ankle": 0.11, "z_knee": 0.41, "z_pelvis": 0.71,
    "z_shoulder": 1.21, "z_neck": 1.33, "z_head": 1.45,
    "hip_x": 0.13, "shoulder_x": 0.29, "arm_len": 0.59,
    "a_deg": 75.0,
}

# Measured directly from boss_act{2,3,4}_raw.glb cross-sections so hand_r lands dead-center in the fist
BOSS_CONFIGS = [
    {
        "id": "boss_act2",
        "label": "2막 설산 묵승",
        "raw": "boss_act2_raw.glb",
        "out": "boss_act2.glb",
        "weapon": "monk_staff",
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.42, "z_pelvis": 0.74,
            "z_shoulder": 1.26, "z_neck": 1.38, "z_head": 1.48,
            "hip_x": 0.13, "shoulder_x": 0.22, "arm_len": 0.44,
            "a_deg": 64.0,
        },
        "torso_clean_z": 1.18,
        "torso_clean_x": 0.23,
    },
    {
        "id": "boss_act3",
        "label": "3막 혈월 무장",
        "raw": "boss_act3_raw.glb",
        "out": "boss_act3.glb",
        "weapon": "blood_glaive",
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.42, "z_pelvis": 0.73,
            "z_shoulder": 1.25, "z_neck": 1.36, "z_head": 1.47,
            "hip_x": 0.13, "shoulder_x": 0.22, "arm_len": 0.48,
            "a_deg": 68.0,
        },
        "torso_clean_z": 1.16,
        "torso_clean_x": 0.22,
    },
    {
        "id": "boss_act4",
        "label": "4막 무간의 검귀",
        "raw": "boss_act4_raw.glb",
        "out": "boss_act4.glb",
        "weapon": "demon_odachi",
        "fit": {
            "z_ankle": 0.11, "z_knee": 0.43, "z_pelvis": 0.75,
            "z_shoulder": 1.29, "z_neck": 1.41, "z_head": 1.52,
            "hip_x": 0.13, "shoulder_x": 0.22, "arm_len": 0.47,
            "a_deg": 66.0,
        },
        "torso_clean_z": 1.20,
        "torso_clean_x": 0.23,
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
    nmap.inputs["Strength"].default_value = 0.58
    nt.links.new(tex_node.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    print(f"  + Baked 50k->15k Normal Map ({size}x{size}) onto {low_obj.name}")
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


def _make_mat(name, rgba, met=0.85, rough=0.25):
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = met
        bsdf.inputs["Roughness"].default_value = rough
    return m


def _finalize_weapon(bm, mats, t_arm, label):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Boss_Weapon")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new("Boss_Weapon", mesh)
    bpy.context.scene.collection.objects.link(obj)
    for m in mats:
        obj.data.materials.append(m)

    vg = obj.vertex_groups.new(name="hand_r")
    vg.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
    obj.parent = t_arm
    mod = obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = t_arm

    out_mesh = mesh.copy()
    out_mesh.name = "Boss_Weapon_Outline"
    out_mesh.materials.clear()
    bm_o = bmesh.new()
    bm_o.from_mesh(out_mesh)
    bmesh.ops.recalc_face_normals(bm_o, faces=bm_o.faces)
    for v in bm_o.verts:
        v.co += v.normal * 0.007
    bmesh.ops.reverse_faces(bm_o, faces=bm_o.faces)
    bm_o.to_mesh(out_mesh)
    bm_o.free()
    out_obj = bpy.data.objects.new("Boss_Weapon_Outline", out_mesh)
    bpy.context.scene.collection.objects.link(out_obj)
    vg_o = out_obj.vertex_groups.new(name="hand_r")
    vg_o.add([v.index for v in out_obj.data.vertices], 1.0, "REPLACE")
    out_obj.parent = t_arm
    mod_o = out_obj.modifiers.new(name="Armature", type="ARMATURE")
    mod_o.object = t_arm
    print(f"  + Boss_Weapon ({label}) attached to hand_r ({len(obj.data.vertices)} verts)")


def create_monk_staff(t_arm):
    """2막 설산 묵승: 흑철 선장(석장) + 청동 고리 + 서리강 창촉"""
    hand_b = t_arm.data.bones["hand_r"]
    grip = t_arm.matrix_world @ ((hand_b.head_local + hand_b.tail_local) * 0.5)
    mat_iron = _make_mat("MonkStaff_Iron", (0.20, 0.22, 0.26, 1.0), 0.85, 0.34)
    mat_bronze = _make_mat("MonkStaff_Bronze", (0.72, 0.60, 0.34, 1.0), 0.88, 0.26)
    mat_blade = _make_mat("MonkStaff_Blade", (0.64, 0.72, 0.78, 1.0), 0.94, 0.20)
    bm = bmesh.new()

    m_sh = Euler((math.radians(90), 0, 0), "XYZ").to_matrix().to_4x4()
    m_sh.translation = grip + Vector((0.0, -0.21, 0.0))
    ret = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.022, radius2=0.022, depth=1.78, matrix=m_sh)
    for v in ret["verts"]:
        for f in v.link_faces: f.material_index = 0

    for y_off, r, dp in [(-1.08, 0.036, 0.09), (-0.52, 0.028, 0.06), (0.68, 0.028, 0.10)]:
        mc = Euler((math.radians(90), 0, 0), "XYZ").to_matrix().to_4x4()
        mc.translation = grip + Vector((0.0, y_off, 0.0))
        ret = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=r, radius2=r*0.85, depth=dp, matrix=mc)
        for v in ret["verts"]:
            for f in v.link_faces: f.material_index = 1

    ring_c = grip + Vector((0.0, -1.34, 0.0))
    segs = 14
    rx, ry = 0.095, 0.20
    prev_ring = None
    first_ring = None
    for i in range(segs):
        ang = (i / segs) * math.pi * 2.0
        pt = ring_c + Vector((0.0, math.cos(ang) * ry, math.sin(ang) * rx))
        nrm = Vector((0.0, math.cos(ang), math.sin(ang))).normalized()
        side = Vector((1.0, 0.0, 0.0))
        rad = 0.015
        cur = []
        for k in range(6):
            ka = (k / 6.0) * math.pi * 2.0
            v = bm.verts.new(pt + (nrm * math.cos(ka) + side * math.sin(ka)) * rad)
            cur.append(v)
        if first_ring is None:
            first_ring = cur
        if prev_ring is not None:
            for k in range(6):
                kn = (k + 1) % 6
                f = bm.faces.new((prev_ring[k], prev_ring[kn], cur[kn], cur[k]))
                f.material_index = 1
        prev_ring = cur
    for k in range(6):
        kn = (k + 1) % 6
        f = bm.faces.new((prev_ring[k], prev_ring[kn], first_ring[kn], first_ring[k]))
        f.material_index = 1

    mt = Euler((math.radians(90), 0, 0), "XYZ").to_matrix().to_4x4()
    mt.translation = grip + Vector((0.0, -1.62, 0.0))
    ret = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4, radius1=0.036, radius2=0.002, depth=0.22, matrix=mt)
    for v in ret["verts"]:
        for f in v.link_faces: f.material_index = 2

    _finalize_weapon(bm, (mat_iron, mat_bronze, mat_blade), t_arm, "act2 iron monk staff")


def create_demon_odachi(t_arm):
    """4막 무간의 검귀: 흑금 대태도(Odachi / Greatsword)"""
    hand_b = t_arm.data.bones["hand_r"]
    grip = t_arm.matrix_world @ ((hand_b.head_local + hand_b.tail_local) * 0.5)
    mat_wrap = _make_mat("Odachi_Wrap", (0.10, 0.08, 0.10, 1.0), 0.15, 0.72)
    mat_gold = _make_mat("Odachi_Gold", (0.84, 0.64, 0.22, 1.0), 0.92, 0.22)
    mat_blade = _make_mat("Odachi_Blade", (0.48, 0.50, 0.56, 1.0), 0.96, 0.18)
    bm = bmesh.new()

    mh = Euler((math.radians(90), 0, 0), "XYZ").to_matrix().to_4x4()
    mh.translation = grip + Vector((0.0, 0.16, 0.0))
    ret = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=0.020, radius2=0.024, depth=0.52, matrix=mh)
    for v in ret["verts"]:
        for f in v.link_faces: f.material_index = 0

    for y_off, rx, rz, dp in [(0.43, 0.032, 0.032, 0.05), (-0.11, 0.042, 0.095, 0.035)]:
        mg = Euler((math.radians(90), 0, 0), "XYZ").to_matrix().to_4x4()
        mg.translation = grip + Vector((0.0, y_off, 0.0))
        ret = bmesh.ops.create_cube(bm, size=1.0, matrix=mg)
        for v in ret["verts"]:
            d = v.co - (grip + Vector((0.0, y_off, 0.0)))
            v.co = grip + Vector((d.x * rx * 2.0, y_off + d.y * dp, d.z * rz * 2.0))
            for f in v.link_faces: f.material_index = 1

    profile = [
        (-0.12, 0.012,  0.030, -0.028),
        (-0.45, 0.011,  0.034, -0.024),
        (-0.85, 0.010,  0.046, -0.012),
        (-1.25, 0.009,  0.068,  0.012),
        (-1.58, 0.006,  0.096,  0.048),
        (-1.78, 0.002,  0.125,  0.118),
    ]
    rings = []
    for y_off, hx, z_back, z_edge in profile:
        z_mid = (z_back + z_edge) * 0.5
        v0 = bm.verts.new(grip + Vector((0.0, y_off, z_back)))
        v1 = bm.verts.new(grip + Vector((hx, y_off, z_mid)))
        v2 = bm.verts.new(grip + Vector((0.0, y_off, z_edge)))
        v3 = bm.verts.new(grip + Vector((-hx, y_off, z_mid)))
        rings.append((v0, v1, v2, v3))
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(4):
            kn = (k + 1) % 4
            f = bm.faces.new((r0[k], r0[kn], r1[kn], r1[k]))
            f.material_index = 2
    f0 = bm.faces.new((rings[0][3], rings[0][2], rings[0][1], rings[0][0]))
    f0.material_index = 2
    f1 = bm.faces.new((rings[-1][0], rings[-1][1], rings[-1][2], rings[-1][3]))
    f1.material_index = 2

    _finalize_weapon(bm, (mat_wrap, mat_gold, mat_blade), t_arm, "act4 abyssal odachi")


def build_one_boss(cfg):
    bid = cfg["id"]
    raw_path = os.path.join(RAW_DIR, cfg["raw"])
    out_path = os.path.join(MODELS_DIR, cfg["out"])
    fit = cfg["fit"]
    assert os.path.isfile(raw_path), f"Missing {raw_path}"
    assert os.path.isfile(TEMPLATE_BOSS_GLB), f"Missing {TEMPLATE_BOSS_GLB}"

    print(f"\n================ [{bid.upper()}] {cfg['label']} ================")
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1) Load template boss.glb to inherit 66-bone Mesh2Motion armature + 8 curated boss actions
    bpy.ops.import_scene.gltf(filepath=TEMPLATE_BOSS_GLB)
    t_arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    t_arm.name = f"{bid}_Armature"
    for o in list(bpy.data.objects):
        if o.type == "MESH":
            bpy.data.objects.remove(o, do_unlink=True)

    # Deduplicate and rebuild clean NLA tracks with pelvis height rescaling
    pel_ratio = fit["z_pelvis"] / SRC_BOSS_FIT["z_pelvis"]
    clean_acts = []
    for act in list(bpy.data.actions):
        cname = act.name.replace("_Boss_Armature", "")
        act.name = cname
        act.use_fake_user = True
        for fc in act.fcurves:
            if fc.data_path.endswith('pose.bones["pelvis"].location'):
                for kp in fc.keyframe_points:
                    kp.co.y *= pel_ratio
                    kp.handle_left.y *= pel_ratio
                    kp.handle_right.y *= pel_ratio
        clean_acts.append(act)

    if t_arm.animation_data:
        t_arm.animation_data_clear()
    t_arm.animation_data_create()
    for act in clean_acts:
        tr = t_arm.animation_data.nla_tracks.new()
        tr.name = act.name
        tr.strips.new(act.name, int(act.frame_range[0]), act)
        tr.mute = True
    t_arm.animation_data.action = None

    refit_boss_armature(t_arm, SRC_BOSS_FIT, fit)
    print(f"  + Refitted 66-bone armature (pelvis_z={fit['z_pelvis']:.2f}, sh_z={fit['z_shoulder']:.2f}, sh_x={fit['shoulder_x']:.2f}, arm_len={fit['arm_len']:.2f}, a_deg={fit['a_deg']:.1f})")

    # 2) Import 50k-poly 2048px raw boss mesh
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
    body_high.name = "Boss_Body_High50k"

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

    # 3) Decimate to ~15,000 tris & Bake 50k->15k Normal Map
    bpy.ops.object.select_all(action="DESELECT")
    body_high.select_set(True)
    bpy.context.view_layer.objects.active = body_high
    bpy.ops.object.duplicate()
    body = bpy.context.active_object
    body.name = "Boss_Body"
    body.data = body.data.copy()
    body.data.name = "Boss_Body"
    dec = body.modifiers.new(name="Decimate", type="DECIMATE")
    dec.ratio = 0.30
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for poly in body.data.polygons:
        poly.use_smooth = True

    bake_normal_map(body_high, body, f"{bid}_Normal", size=1024)
    bpy.data.objects.remove(body_high, do_unlink=True)

    # 4) Inverted-hull sumi-ink outline
    outline = make_outline(body, "Boss_Outline", offset=0.0040, dec_ratio=0.50)

    # 5) Create Temp_APose_Arm matching sculpted A-pose arm angle
    bpy.ops.object.select_all(action="DESELECT")
    t_arm.select_set(True)
    bpy.context.view_layer.objects.active = t_arm
    bpy.ops.object.duplicate()
    a_arm = bpy.context.active_object
    a_arm.name = "Temp_APose_Arm"
    a_arm.animation_data_clear()

    a_rad = math.radians(fit["a_deg"])
    bpy.ops.object.mode_set(mode="POSE")
    for bname, sgn in [("upperarm_l", -1.0), ("upperarm_r", 1.0)]:
        pb = a_arm.pose.bones[bname]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = Euler((0.0, 0.0, sgn * a_rad), "XYZ")
    bpy.context.view_layer.update()
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # 6) Volumetric Voxel-Proxy Bone Heat skinning + strip torso/robe arm bleed
    m2m.skin_via_voxel_heat(body, a_arm, fit)
    arm_vg_names = {"clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r"}
    arm_vgs = [vg for vg in body.vertex_groups if vg.name in arm_vg_names]
    spine_vg = body.vertex_groups.get("spine_02") or body.vertex_groups.get("spine_01")
    cleaned = 0
    for v in body.data.vertices:
        if v.co.z < cfg["torso_clean_z"] and abs(v.co.x) < cfg["torso_clean_x"]:
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
    print(f"  + Stripped arm-weight bleed from {cleaned} torso/robe verts")
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

    m2m.transfer_vertex_weights(body, outline)
    outline.parent = a_arm
    mod_o = outline.modifiers.new(name="Armature", type="ARMATURE")
    mod_o.object = a_arm

    # 7) Rotate Temp_APose_Arm back into T-pose and bake body + outline to T-pose
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

    # 8) Attach act-themed forged 3D weapon to hand_r
    if cfg["weapon"] == "monk_staff":
        create_monk_staff(t_arm)
    elif cfg["weapon"] == "blood_glaive":
        m2m.create_boss_glaive(t_arm)
    elif cfg["weapon"] == "demon_odachi":
        create_demon_odachi(t_arm)

    # 9) Export GLB
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
        if o.type in ("ARMATURE", "MESH"):
            o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_force_sampling=True,
        export_yup=True,
        export_image_format="JPEG",
    )
    print(f"  [SAVED] {out_path} ({os.path.getsize(out_path):,} bytes)")


def main():
    for cfg in BOSS_CONFIGS:
        build_one_boss(cfg)
    print("\n[ALL 3 ACT 2/3/4 BOSSES BAKED, RIGGED & EXPORTED!]")


if __name__ == "__main__":
    main()
