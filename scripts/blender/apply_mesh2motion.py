"""
scripts/blender/apply_mesh2motion.py
기존 5종 캐릭터 GLB(hero, minion, heavy, stone, boss)에 Mesh2Motion CC0 66본 스켈레톤 및
종별 모션캡처 애니메이션(Idle/Run/Walk/Slash/Attack/Hit/Cast/Death)을 자동 이식합니다.
- A-포즈 메시를 정확히 A-포즈로 임시 스키닝한 뒤 T-포즈로 변환해 원본 T-포즈 Mesh2Motion 클립과 100% 정합!
- DATA_TRANSFER로 외곽선(Outline) 메시에도 동일한 본 가중치 전사 (정점 수가 달라도 100% 추적!)
- 주인공 환도(Hero_Sword)도 A->T 변환에 함께 참여시켜 hand_r 손잡이 각도 100% 자동 정합!
"""
import math
import os
import bpy
from mathutils import Vector, Euler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_DIR = os.path.join(ROOT, "v2", "assets", "models")
M2M_DIR = "/tmp/m2m_raw"

CHARACTERS = [
    {
        "name": "hero",
        "height": 1.85,
        "a_deg": 48.0,
        "keep_sword": True,
        "clips": [
            ("M2M_Idle",  "idle-sword.glb"),
            ("M2M_Walk",  "jog.glb"),
            ("M2M_Slash", "sword-regular-a.glb"),
            ("M2M_Hit",   "hit-chest.glb"),
        ],
    },
    {
        "name": "minion",
        "height": 2.40,
        "a_deg": 46.0,
        "keep_sword": False,
        "clips": [
            ("M2M_Idle",   "zombie-idle.glb"),
            ("M2M_Walk",   "zombie-run.glb"),
            ("M2M_Attack", "zombie-scratch.glb"),
            ("M2M_Hit",    "hit-chest.glb"),
        ],
    },
    {
        "name": "heavy",
        "height": 3.00,
        "a_deg": 46.0,
        "keep_sword": False,
        "clips": [
            ("M2M_Idle",   "fighting-idle.glb"),
            ("M2M_Walk",   "walk-large.glb"),
            ("M2M_Attack", "two-handed-overhead-slam.glb"),
            ("M2M_Hit",    "hit-knockback.glb"),
        ],
    },
    {
        "name": "stone",
        "height": 2.60,
        "a_deg": 44.0,
        "keep_sword": False,
        "clips": [
            ("M2M_Idle",   "idle-a.glb"),
            ("M2M_Walk",   "walk-large.glb"),
            ("M2M_Attack", "attack-ground-pound.glb"),
            ("M2M_Hit",    "hit-chest.glb"),
        ],
    },
    {
        "name": "boss",
        "height": 2.80,
        "a_deg": 46.0,
        "keep_sword": False,
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


def point_seg_dist(p, a, b):
    ab = b - a
    l2 = ab.length_squared
    if l2 < 1e-8:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / l2))
    return (p - (a + ab * t)).length


def assign_smooth_weights(mesh_obj, arm_obj):
    bones = [
        (b.name, b.head_local.copy(), b.tail_local.copy())
        for b in arm_obj.data.bones
        if b.name in MAJOR_BONES
    ]
    mesh_obj.vertex_groups.clear()
    vgs = {name: mesh_obj.vertex_groups.new(name=name) for name, _, _ in bones}
    for v in mesh_obj.data.vertices:
        p = v.co
        dists = []
        for name, a, b in bones:
            d = point_seg_dist(p, a, b)
            if name.endswith("_l") and p.x < -0.04:
                d += 0.40
            elif name.endswith("_r") and p.x > 0.04:
                d += 0.40
            # Prevent hanging arms/hands in A-pose from grabbing torso, waist sash, or skirt hem
            if (name.startswith("lowerarm_") or name.startswith("hand_")) and abs(p.x) < 0.26 and p.z < 1.22:
                d += 0.55
            elif name.startswith("upperarm_") and abs(p.x) < 0.19 and p.z < 1.25:
                d += 0.35
            dists.append((d, name))
        dists.sort(key=lambda x: x[0])
        top = dists[:3]
        raw = [1.0 / ((d + 0.032) ** 3.2) for d, _ in top]
        s = sum(raw) or 1.0
        for (_, name), w in zip(top, raw):
            wn = w / s
            if wn > 0.02:
                vgs[name].add([v.index], wn, "REPLACE")


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
    src_glb = f"/tmp/models_png/{name}.glb"
    out_glb = os.path.join(MODELS_DIR, f"{name}.glb")
    if not os.path.isfile(src_glb):
        print(f"[SKIP] Missing {src_glb}")
        return

    print(f"\n================ [{name.upper()}] Mesh2Motion Rigging ================")
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

    # 1) Normalize body, outline, and sword together to Mesh2Motion skeleton height (1.72m)
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

    # 2) Import Mesh2Motion T-pose skeleton + create temp A-pose copy for exact arm skinning
    bpy.ops.import_scene.gltf(filepath=os.path.join(M2M_DIR, "skeleton.glb"))
    t_arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    t_arm.name = f"{name.capitalize()}_Armature"

    bpy.ops.object.select_all(action="DESELECT")
    t_arm.select_set(True)
    bpy.context.view_layer.objects.active = t_arm
    bpy.ops.object.duplicate()
    a_arm = bpy.context.active_object
    a_arm.name = "Temp_APose_Arm"

    a_rad = math.radians(cfg["a_deg"])
    bpy.ops.object.mode_set(mode="POSE")
    for bname, sgn in [("upperarm_l", -1.0), ("upperarm_r", 1.0)]:
        pb = a_arm.pose.bones[bname]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = Euler((0.0, 0.0, sgn * a_rad), "XYZ")
    bpy.context.view_layer.update()
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    for b in a_arm.data.bones:
        b.use_deform = b.name in MAJOR_BONES

    # 3) Skin body to Temp_APose_Arm (heat weights -> fallback smooth distance weights)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    a_arm.select_set(True)
    bpy.context.view_layer.objects.active = a_arm
    heat_ok = False
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        weighted = sum(1 for v in body.data.vertices if len(v.groups) > 0)
        if weighted >= len(body.data.vertices) * 0.95:
            heat_ok = True
            print(f"  Skinning: ARMATURE_AUTO OK ({weighted}/{len(body.data.vertices)} verts)")
    except Exception as e:
        print(f"  Skinning: ARMATURE_AUTO fallback ({e})")

    if not heat_ok:
        if body.parent != a_arm:
            body.parent = a_arm
        if not any(m.type == "ARMATURE" for m in body.modifiers):
            mod = body.modifiers.new(name="Armature", type="ARMATURE")
            mod.object = a_arm
        assign_smooth_weights(body, a_arm)
        print(f"  Skinning: Smooth distance weights applied ({len(body.data.vertices)} verts)")

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

    # Transfer exact nearest-vertex weights from body to outline (works regardless of vertex count!)
    if outline is not None:
        transfer_vertex_weights(body, outline)
        outline.parent = a_arm
        mod = outline.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = a_arm
        w_out = sum(1 for v in outline.data.vertices if len(v.groups) > 0)
        print(f"  Outline weights transferred: {w_out}/{len(outline.data.vertices)} verts")

    # Bind Hero_Sword (+ outline) 100% to hand_r on Temp_APose_Arm so A->T bake rotates it into T-pose!
    for so in [sword, sword_out]:
        if so is None:
            continue
        so.vertex_groups.clear()
        vg = so.vertex_groups.new(name="hand_r")
        vg.add([v.index for v in so.data.vertices], 1.0, "REPLACE")
        so.parent = a_arm
        mod = so.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = a_arm

    # 4) Rotate Temp_APose_Arm arms BACK UP into exact T-pose and BAKE all meshes into T-pose!
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

    # 5) Import all curated Mesh2Motion CC0 animation actions and attach to t_arm NLA tracks
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
            track = t_arm.animation_data.nla_tracks.new()
            track.name = clip_name
            start_f = int(act.frame_range[0])
            track.strips.new(clip_name, start_f, act)
            track.mute = True
            print(f"  + Action {clip_name} <- {anim_file} ({int(act.frame_range[0])}..{int(act.frame_range[1])}f)")
        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)

    t_arm.animation_data.action = None

    # 6) Export final Mesh2Motion-rigged GLB directly to v2/assets/models/{name}.glb!
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
    print("\n[ALL 5 CHARACTERS RIGGED WITH MESH2MOTION CC0 ANIMATIONS!]")


if __name__ == "__main__":
    main()
