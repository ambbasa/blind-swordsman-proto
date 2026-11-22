"""
scripts/blender/build_hero.py
심안(SIMAN) 주인공 '무명 검객(심안 무사)' 고품질 3D 모델 + 리깅 + 4종 애니메이션 + 수묵 외곽선 GLB 빌더 (v3)
공식 컨셉(v2/assets/hero/lobby_ink.webp) 100% 충실 재현:
 - 삿갓 없음 / 깔끔히 넘긴 먹색 머리(목덜미까지 자연스러운 뒷머리) + 상투(Topknot)
 - 검은 안대(주름 디테일) & 뒤로 흐르는 두 가닥 안대 끈
 - 또렷한 콧대·입선·각진 턱선·강인한 목선
 - 깊은 묵색 조선 무복·도포(자연스럽게 흐르는 어깨선, 은백색 동정 V깃, 우측 고름 매듭, 앞·옆 트임 세로 주름 자락)
 - 은회색 다층 허리띠(깊은 가로 주름) + 앞매듭 + 두 가닥 드리운 띠 자락
 - 팔꿈치까지 흐르는 소매 + 나선 감긴 검은 팔목 토시(붕대) + 5지 손(검 파지)
 - 무릎 위 살짝 부푼 흑의 바지 + 굽·밑창·발목 주름이 살아있는 검은 가죽 목화 전투화
 - 정면·3/4·후면·탑다운 어디서나 선명히 빛나는 휜 조선 환도(강철 장검) + 좌측 허리 밀착 검집
 - 수묵 먹선 인버티드 헐 외곽선(Hero_Outline) + 18본 Armature + 4종 애니메이션(idle/walk/slash/hit)
"""
import math
import os
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

ROOT = r"c:\Users\cheon\Downloads\project\blind-swordsman-proto"
OUT_GLB = os.path.join(ROOT, "v2", "assets", "models", "hero.glb")
OUT_RENDER_DIR = r"C:\Users\cheon\.gemini\antigravity\brain\85c41841-3dcb-4f10-9134-720bf94c3d01\scratch\hero_renders"
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
os.makedirs(OUT_RENDER_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, rgba, roughness=0.78, metallic=0.0, coat=0.0, spec=0.5, bump_scale=0.0, bump_str=0.0, use_vcol=True):
    mat = bpy.data.materials.new(name=name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = spec
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat

    if use_vcol:
        vcol = nt.nodes.new("ShaderNodeVertexColor")
        vcol.layer_name = "Col"
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs["A"].default_value = rgba
        nt.links.new(vcol.outputs["Color"], mix.inputs["B"])
        nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = rgba

    if bump_str > 0.0 and bump_scale > 0.0:
        tex_coord = nt.nodes.new("ShaderNodeTexCoord")
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = bump_scale
        noise.inputs["Detail"].default_value = 7.0
        noise.inputs["Roughness"].default_value = 0.68
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_str
        bump.inputs["Distance"].default_value = 0.008
        nt.links.new(tex_coord.outputs["Object"], noise.inputs["Vector"])
        nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_outline_mat_gltf():
    """Clean glTF-compatible ink outline material (single-sided backface-culled black)."""
    mat = bpy.data.materials.new(name="Mat_InkOutline")
    mat.use_backface_culling = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.008, 0.008, 0.010, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def upgrade_outline_mat_for_cycles(mat):
    """Cycles inverted-hull backface-transparent shader."""
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    trans = nt.nodes.new("ShaderNodeBsdfTransparent")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (0.008, 0.008, 0.011, 1.0)
    emit.inputs["Strength"].default_value = 1.0
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(geom.outputs["Backfacing"], mix.inputs["Fac"])
    nt.links.new(emit.outputs["Emission"], mix.inputs[1])
    nt.links.new(trans.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])


def set_smooth(obj):
    if obj.type != "MESH":
        return
    for p in obj.data.polygons:
        p.use_smooth = True


def assign_mat(obj, mat):
    if len(obj.data.materials) == 0:
        obj.data.materials.append(mat)
    else:
        obj.data.materials[0] = mat


def assign_bone_group(obj, bone_name, weight=1.0):
    vg = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
    vg.add([v.index for v in obj.data.vertices], weight, "REPLACE")


def add_cap_fan(bm, ring_verts, reverse=False):
    if len(ring_verts) < 3:
        return
    center = sum((v.co for v in ring_verts), Vector((0, 0, 0))) / len(ring_verts)
    c_vert = bm.verts.new(center)
    n = len(ring_verts)
    for i in range(n):
        v0 = ring_verts[i]
        v1 = ring_verts[(i + 1) % n]
        if (v0.co - v1.co).length < 1e-6:
            continue
        tri = (c_vert, v1, v0) if reverse else (c_vert, v0, v1)
        try:
            bm.faces.new(tri)
        except ValueError:
            pass


def build_loft_mesh(name, rings, closed_u=True, cap_bottom=True, cap_top=True, sharp_edges=False):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bm_rings = []
    for ring in rings:
        bm_rings.append([bm.verts.new(Vector(p)) for p in ring])
    bm.verts.ensure_lookup_table()
    n_rings = len(bm_rings)
    n_seg = len(bm_rings[0])
    for r in range(n_rings - 1):
        r0 = bm_rings[r]
        r1 = bm_rings[r + 1]
        for i in range(n_seg if closed_u else n_seg - 1):
            j = (i + 1) % n_seg
            verts = (r0[i], r0[j], r1[j], r1[i])
            if len({v for v in verts}) < 3:
                continue
            try:
                bm.faces.new(verts)
            except ValueError:
                pass
    if cap_bottom and closed_u:
        add_cap_fan(bm, bm_rings[0], reverse=True)
    if cap_top and closed_u:
        add_cap_fan(bm, bm_rings[-1], reverse=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if not sharp_edges:
        set_smooth(obj)
    return obj


def build_tube_ribbon(name, points, widths, thicknesses, tilt_angles=None, n_profile=8):
    rings = []
    n = len(points)
    for idx in range(n):
        p = Vector(points[idx])
        if idx == 0:
            t = (Vector(points[1]) - p).normalized()
        elif idx == n - 1:
            t = (p - Vector(points[idx - 1])).normalized()
        else:
            t = (Vector(points[idx + 1]) - Vector(points[idx - 1])).normalized()
        ref = Vector((0, 0, 1)) if abs(t.z) < 0.92 else Vector((0, 1, 0))
        side = t.cross(ref).normalized()
        norm = side.cross(t).normalized()
        if tilt_angles:
            ang = tilt_angles[idx]
            c, s = math.cos(ang), math.sin(ang)
            side, norm = side * c + norm * s, -side * s + norm * c
        hw = widths[idx] * 0.5
        ht = thicknesses[idx] * 0.5
        ring = []
        for k in range(n_profile):
            a = (k / n_profile) * math.tau
            ring.append(p + side * (math.cos(a) * hw) + norm * (math.sin(a) * ht))
        rings.append(ring)
    return build_loft_mesh(name, rings, closed_u=True, cap_bottom=True, cap_top=True)


def build_limb_tube(name, centers, radii_x, radii_y, n_seg=20, fold_fn=None, cap_bottom=True, cap_top=True):
    rings = []
    n = len(centers)
    t0 = (Vector(centers[1]) - Vector(centers[0])).normalized()
    ref = Vector((0, -1, 0)) if abs(t0.y) < 0.9 else Vector((1, 0, 0))
    right = t0.cross(ref).normalized()
    fwd = right.cross(t0).normalized()
    prev_t = t0

    for idx in range(n):
        c = Vector(centers[idx])
        if idx == 0:
            t = t0
        elif idx == n - 1:
            t = (c - Vector(centers[idx - 1])).normalized()
        else:
            t = (Vector(centers[idx + 1]) - Vector(centers[idx - 1])).normalized()
        rot_q = prev_t.rotation_difference(t)
        right = (rot_q @ right).normalized()
        fwd = (rot_q @ fwd).normalized()
        prev_t = t

        u = idx / max(1, n - 1)
        rx = radii_x[idx]
        ry = radii_y[idx]
        ring = []
        for i in range(n_seg):
            a = (i / n_seg) * math.tau
            ca, sa = math.cos(a), math.sin(a)
            dr = fold_fn(u, a) if fold_fn else 0.0
            ring.append(c + right * (ca * (rx + dr)) + fwd * (sa * (ry + dr)))
        rings.append(ring)
    return build_loft_mesh(name, rings, closed_u=True, cap_bottom=cap_bottom, cap_top=cap_top)


def build_hero_parts(mats):
    parts = []  # list of (obj, primary_bone, part_tag)

    # ==========================================================
    # 1. SCULPTED HEAD, SHARP MASCULINE JAW, CRISP NOSE, STERN LIPS, EARS, NECK
    # ==========================================================
    head_specs = [
        # (z, rx, ry, y_off, jaw_pinch)
        (1.556, 0.026, 0.036, -0.030, 0.46),  # angular heroic chin
        (1.572, 0.048, 0.062, -0.022, 0.34),  # lower jawbone
        (1.590, 0.062, 0.078, -0.015, 0.24),  # below mouth / chin cleft
        (1.602, 0.068, 0.083, -0.012, 0.20),  # lower lip
        (1.610, 0.070, 0.084, -0.011, 0.18),  # mouth seam (stern closed lips!)
        (1.618, 0.072, 0.086, -0.010, 0.15),  # upper lip
        (1.630, 0.076, 0.090, -0.007, 0.10),  # nose base / philtrum
        (1.648, 0.080, 0.094, -0.004, 0.05),  # nose tip / cheekbones
        (1.674, 0.082, 0.097, -0.001, 0.00),  # nose bridge / eyes
        (1.706, 0.084, 0.099,  0.002, 0.00),  # brow / temple
        (1.738, 0.083, 0.097,  0.005, 0.00),  # forehead
        (1.770, 0.072, 0.086,  0.009, 0.00),  # upper skull
        (1.794, 0.044, 0.054,  0.012, 0.00),  # crown
    ]
    n_h = 32
    h_rings = []
    for z, rx, ry, y_off, pinch in head_specs:
        ring = []
        for i in range(n_h):
            a = (i / n_h) * math.tau
            sx, sy = math.sin(a), -math.cos(a)  # -Y is front
            front_k = max(0.0, -sy)
            r_x = rx * (1.0 - pinch * 0.44 * (front_k ** 1.35))
            r_y = ry * (1.0 + pinch * 0.14 * front_k)

            # Distinct angular nose ridge & tip right below the blindfold!
            nose = 0.0
            if 1.624 <= z <= 1.678 and front_k > 0.88:
                u_n = (z - 1.624) / 0.054
                # Sharper tip near u_n = 0.28, straight bridge rising into blindfold
                prof = (u_n / 0.28) if u_n < 0.28 else (1.0 - 0.55 * (u_n - 0.28) / 0.72)
                nose = 0.025 * ((front_k - 0.88) / 0.12) ** 1.55 * max(0.0, prof)

            # Sculpted lips + stern closed mouth crease!
            mouth = 0.0
            if front_k > 0.84:
                m_w = ((front_k - 0.84) / 0.16) ** 1.3
                if abs(z - 1.610) < 0.003:
                    mouth = -0.0075 * m_w  # crisp mouth crease
                elif abs(z - 1.618) < 0.004 or abs(z - 1.602) < 0.004:
                    mouth = 0.0055 * m_w   # sculpted upper/lower lip ridge
                elif abs(z - 1.590) < 0.005:
                    mouth = -0.0035 * m_w  # labiomental chin groove

            # Subtle cheekbone & jaw-corner definition
            cheek = 0.0045 * max(0.0, 1.0 - abs(z - 1.646) / 0.024) * (abs(sx) * front_k)
            jaw_corner = 0.005 * max(0.0, 1.0 - abs(z - 1.608) / 0.022) * max(0.0, abs(sx) - 0.65)
            ring.append(Vector((sx * (r_x + cheek + jaw_corner), sy * r_y + y_off - nose - mouth, z)))
        h_rings.append(ring)
    head = build_loft_mesh("Hero_Head", h_rings)
    assign_mat(head, mats["skin"])
    parts.append((head, "head", "face"))

    # Ears
    for s in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.022, location=(s * 0.080, 0.006, 1.658))
        ear = bpy.context.active_object
        ear.name = f"Hero_Ear_{'L' if s > 0 else 'R'}"
        ear.scale = (0.36, 0.66, 1.24)
        ear.rotation_euler = (0.08, 0.0, s * -0.22)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        set_smooth(ear)
        assign_mat(ear, mats["skin"])
        parts.append((ear, "head", "skin"))

    # Strong athletic neck + upper chest V-skin
    neck_specs = [
        (1.365, 0.102, 0.092, -0.012),
        (1.430, 0.084, 0.080, -0.005),
        (1.482, 0.064, 0.062,  0.002),
        (1.532, 0.056, 0.058,  0.004),
        (1.582, 0.057, 0.062,  0.006),
    ]
    n_rings = []
    for z, rx, ry, y_off in neck_specs:
        n_rings.append([
            Vector((math.sin(i / 20 * math.tau) * rx, -math.cos(i / 20 * math.tau) * ry + y_off, z))
            for i in range(20)
        ])
    neck = build_loft_mesh("Hero_Neck", n_rings)
    assign_mat(neck, mats["skin"])
    parts.append((neck, "neck", "skin"))

    # ==========================================================
    # 2. SLEEK JET-BLACK HAIR (FULL BACK COVERAGE TO NAPE!) + TOPKNOT (상투) — NO HAT!
    # ==========================================================
    # Back hair tapers down cleanly to the nape (Z=1.575) while front sweeps cleanly above blindfold!
    hair_specs = [
        # (z_base, rx, ry, y_off, front_lift)
        (1.580, 0.062, 0.072, 0.022, 0.135),  # nape hairline in back; lifted cleanly above forehead in front!
        (1.625, 0.078, 0.091, 0.016, 0.095),  # lower occiput in back
        (1.672, 0.088, 0.102, 0.011, 0.055),  # mid skull / behind ears
        (1.716, 0.091, 0.105, 0.008, 0.022),  # temples / forehead hairline
        (1.756, 0.086, 0.100, 0.009, 0.006),  # upper head
        (1.790, 0.064, 0.076, 0.013, 0.000),  # crown gathering
        (1.810, 0.036, 0.044, 0.018, 0.000),  # topknot base
    ]
    hair_rings = []
    for z, rx, ry, y_off, f_lift in hair_specs:
        ring = []
        for i in range(30):
            a = (i / 30) * math.tau
            sx, sy = math.sin(a), -math.cos(a)  # -Y front, +Y back
            # Smooth transition: back (+Y) stays low at nape, sides rise over ears, front (-Y) lifts cleanly to hairline!
            front_w = max(0.0, (-sy + 0.25) / 1.25) ** 1.15
            z_mod = z + f_lift * front_w
            # Tuck front edge slightly inward at hairline so it hugs the forehead flush!
            r_scale = 0.96 if (f_lift > 0.04 and sy < -0.2) else 1.0
            ridge = (1.0 + 0.022 * math.sin(a * 12.0) + 0.010 * math.cos(a * 7.0)) * r_scale
            ring.append(Vector((sx * rx * ridge, sy * ry * ridge + y_off, z_mod)))
        hair_rings.append(ring)
    hair = build_loft_mesh("Hero_Hair", hair_rings)
    assign_mat(hair, mats["hair"])
    parts.append((hair, "head", "hair"))

    # Joseon Topknot Bun (상투) + sleek dark tie band
    tk_specs = [
        (1.798, 0.022, 0.024, 0.026),
        (1.818, 0.025, 0.027, 0.032),
        (1.846, 0.037, 0.039, 0.036),
        (1.870, 0.033, 0.035, 0.039),
        (1.886, 0.017, 0.019, 0.041),
    ]
    tk_rings = []
    for z, rx, ry, y_off in tk_specs:
        tk_rings.append([
            Vector((math.sin(i / 18 * math.tau) * rx, -math.cos(i / 18 * math.tau) * ry + y_off, z))
            for i in range(18)
        ])
    topknot = build_loft_mesh("Hero_Topknot", tk_rings)
    assign_mat(topknot, mats["hair"])
    parts.append((topknot, "head", "hair"))

    bpy.ops.mesh.primitive_torus_add(major_radius=0.024, minor_radius=0.006, location=(0.0, 0.031, 1.815))
    tk_band = bpy.context.active_object
    tk_band.name = "Hero_TopknotBand"
    set_smooth(tk_band)
    assign_mat(tk_band, mats["coat_dark"])
    parts.append((tk_band, "head", "cloth"))

    # ==========================================================
    # 3. BLINDFOLD (안대) + BACK KNOT + TWIN FLOWING RIBBONS
    # ==========================================================
    bf_specs = [
        (1.656, 0.088, 0.105, -0.002),
        (1.672, 0.092, 0.110, -0.004),
        (1.690, 0.093, 0.112, -0.004),
        (1.708, 0.092, 0.110, -0.003),
        (1.722, 0.089, 0.106,  0.000),
    ]
    bf_rings = []
    for idx, (z, rx, ry, y_off) in enumerate(bf_specs):
        ring = []
        for i in range(30):
            a = (i / 30) * math.tau
            sx, sy = math.sin(a), -math.cos(a)
            fold = 1.0 + 0.020 * math.sin(idx * 2.4 + a * 3.0)
            z_tilt = z - 0.010 * max(0.0, sy)
            ring.append(Vector((sx * rx * fold, sy * ry * fold + y_off, z_tilt)))
        bf_rings.append(ring)
    blindfold = build_loft_mesh("Hero_Blindfold", bf_rings, cap_bottom=True, cap_top=True)
    assign_mat(blindfold, mats["blindfold"])
    parts.append((blindfold, "head", "cloth"))

    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.022, location=(-0.024, 0.106, 1.678))
    bf_knot = bpy.context.active_object
    bf_knot.name = "Hero_BlindfoldKnot"
    bf_knot.scale = (1.15, 0.82, 0.92)
    bpy.ops.object.transform_apply(scale=True)
    set_smooth(bf_knot)
    assign_mat(bf_knot, mats["blindfold"])
    parts.append((bf_knot, "head", "cloth"))

    tail1 = build_tube_ribbon(
        "Hero_BlindfoldTail_A",
        [
            (-0.026, 0.108, 1.678),
            (-0.108, 0.134, 1.618),
            (-0.210, 0.155, 1.530),
            (-0.322, 0.170, 1.445),
            (-0.425, 0.184, 1.382),
            (-0.510, 0.196, 1.350),
        ],
        [0.024, 0.032, 0.036, 0.038, 0.032, 0.012],
        [0.0055, 0.005, 0.0045, 0.004, 0.0035, 0.002],
        [0.15, 0.30, 0.45, 0.58, 0.72, 0.82],
    )
    assign_mat(tail1, mats["blindfold"])
    parts.append((tail1, "ribbon_A", "cloth"))

    tail2 = build_tube_ribbon(
        "Hero_BlindfoldTail_B",
        [
            (-0.018, 0.109, 1.672),
            (-0.078, 0.140, 1.592),
            (-0.152, 0.168, 1.490),
            (-0.232, 0.188, 1.398),
            (-0.312, 0.204, 1.332),
        ],
        [0.022, 0.028, 0.032, 0.028, 0.010],
        [0.005, 0.0045, 0.004, 0.0035, 0.002],
        [-0.08, 0.12, 0.28, 0.42, 0.56],
    )
    assign_mat(tail2, mats["blindfold"])
    parts.append((tail2, "ribbon_B", "cloth"))

    # ==========================================================
    # 4. ATHLETIC V-TAPER TORSO COAT (SMOOTH SLOPING SHOULDERS — ZERO POINTY CAPS!)
    # ==========================================================
    torso_specs = [
        # (z, rx, ry, y_off, fold_amp)
        (0.940, 0.145, 0.106,  0.004, 0.008),  # cinched waist
        (1.035, 0.152, 0.114,  0.003, 0.008),  # lower ribs
        (1.135, 0.172, 0.126,  0.000, 0.010),  # mid chest
        (1.245, 0.196, 0.134, -0.004, 0.011),  # broad athletic chest
        (1.335, 0.214, 0.132, -0.002, 0.009),  # upper chest / deltoid base
        (1.385, 0.202, 0.124,  0.000, 0.007),  # rounded deltoid slope
        (1.425, 0.178, 0.114,  0.002, 0.006),  # smooth curving upper shoulder
        (1.460, 0.142, 0.100,  0.004, 0.004),  # natural sloping trapezius
        (1.490, 0.098, 0.086,  0.005, 0.002),  # collar base
        (1.506, 0.085, 0.079,  0.005, 0.001),  # snug neck wrap
    ]
    t_rings = []
    for r_i, (z, rx, ry, y_off, f_amp) in enumerate(torso_specs):
        ring = []
        for i in range(32):
            a = (i / 32) * math.tau
            sx, sy = math.sin(a), -math.cos(a)
            # Painterly diagonal martial coat folds radiating across chest
            crease = f_amp * math.sin(a * 5.0 + r_i * 0.72) + f_amp * 0.45 * math.cos(a * 8.0 - r_i * 0.48)
            front_c = max(0.0, -sy) ** 3.2
            v_recess = 0.0
            if z > 1.33:
                v_u = (z - 1.33) / 0.175
                v_recess = 0.038 * front_c * v_u
            flat_fb = 1.0 - 0.06 * (sy ** 2)
            ring.append(Vector((sx * (rx + crease), sy * (ry * flat_fb + crease) + y_off + v_recess, z)))
        t_rings.append(ring)
    torso = build_loft_mesh("Hero_TorsoCoat", t_rings)
    assign_mat(torso, mats["coat"])
    parts.append((torso, "chest", "cloth"))

    # Crisp dark lapel + silver-white `동정` V-collar (hugging torso seamlessly!)
    collar_dark_R = build_tube_ribbon(
        "Hero_LapelDark_R",
        [
            (-0.070, -0.020, 1.504),
            (-0.072, -0.072, 1.450),
            (-0.042, -0.118, 1.378),
            ( 0.004, -0.136, 1.304),
            ( 0.042, -0.134, 1.240),
        ],
        [0.034, 0.038, 0.040, 0.038, 0.030],
        [0.011, 0.012, 0.013, 0.012, 0.010],
        [0.35, 0.28, 0.18, 0.12, 0.08],
    )
    assign_mat(collar_dark_R, mats["coat_dark"])
    parts.append((collar_dark_R, "chest", "cloth"))

    collar_white_R = build_tube_ribbon(
        "Hero_Dongjeong_R",
        [
            (-0.058, -0.028, 1.508),
            (-0.058, -0.078, 1.453),
            (-0.028, -0.124, 1.380),
            ( 0.010, -0.141, 1.312),
        ],
        [0.017, 0.019, 0.020, 0.017],
        [0.0085, 0.0095, 0.0095, 0.008],
        [0.32, 0.25, 0.16, 0.10],
    )
    assign_mat(collar_white_R, mats["collar"])
    parts.append((collar_white_R, "chest", "collar"))

    collar_dark_L = build_tube_ribbon(
        "Hero_LapelDark_L",
        [
            ( 0.070, -0.020, 1.504),
            ( 0.072, -0.074, 1.450),
            ( 0.040, -0.122, 1.374),
            (-0.012, -0.142, 1.288),
            (-0.064, -0.135, 1.196),
            (-0.095, -0.118, 1.110),
        ],
        [0.034, 0.038, 0.042, 0.040, 0.036, 0.028],
        [0.012, 0.013, 0.014, 0.014, 0.012, 0.009],
        [-0.35, -0.28, -0.18, -0.12, -0.08, -0.05],
    )
    assign_mat(collar_dark_L, mats["coat_dark"])
    parts.append((collar_dark_L, "chest", "cloth"))

    collar_white_L = build_tube_ribbon(
        "Hero_Dongjeong_L",
        [
            ( 0.056, -0.028, 1.508),
            ( 0.056, -0.080, 1.453),
            ( 0.024, -0.128, 1.376),
            (-0.022, -0.147, 1.290),
            (-0.050, -0.143, 1.240),
        ],
        [0.017, 0.019, 0.021, 0.020, 0.018],
        [0.0095, 0.010, 0.010, 0.010, 0.0085],
        [-0.32, -0.25, -0.16, -0.10, -0.06],
    )
    assign_mat(collar_white_L, mats["collar"])
    parts.append((collar_white_L, "chest", "collar"))

    # Flush traditional `고름` chest tie bow on hero's right chest
    goreum_bow = build_tube_ribbon(
        "Hero_GoreumBow",
        [(-0.056, -0.138, 1.204), (-0.088, -0.132, 1.206), (-0.110, -0.120, 1.194)],
        [0.016, 0.024, 0.014],
        [0.008, 0.010, 0.007],
    )
    assign_mat(goreum_bow, mats["coat_dark"])
    parts.append((goreum_bow, "chest", "cloth"))

    goreum_tail = build_tube_ribbon(
        "Hero_GoreumTail",
        [(-0.068, -0.137, 1.196), (-0.080, -0.132, 1.148), (-0.086, -0.125, 1.095)],
        [0.016, 0.018, 0.014],
        [0.007, 0.006, 0.005],
    )
    assign_mat(goreum_tail, mats["coat_dark"])
    parts.append((goreum_tail, "chest", "cloth"))

    # ==========================================================
    # 5. ASH-SILVER LAYERED WAIST SASH (허리띠) + KNOT + TWIN TAILS
    #    Deeply sculpted horizontal wrap folds + crisp dark fold crevices!
    # ==========================================================
    sash_rings = []
    for k in range(13):
        u = k / 12.0
        z = 0.930 + u * 0.152
        # 4 bold overlapping horizontal cloth bands
        bulge = 0.013 * abs(math.sin(u * math.pi * 4.0))
        rx = 0.162 + bulge + (0.005 if u < 0.25 else 0.0)
        ry = 0.124 + bulge
        ring = []
        for i in range(32):
            a = (i / 32) * math.tau
            sx, sy = math.sin(a), -math.cos(a)
            w_fold = 0.006 * math.sin(a * 5.0 + u * 7.5)
            ring.append(Vector((sx * (rx + w_fold), sy * (ry + w_fold) + 0.003, z)))
        sash_rings.append(ring)
    sash = build_loft_mesh("Hero_WaistSash", sash_rings)
    assign_mat(sash, mats["sash"])
    parts.append((sash, "spine", "sash"))

    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.031, location=(0.056, -0.134, 1.008))
    sknot = bpy.context.active_object
    sknot.name = "Hero_SashKnot"
    sknot.scale = (1.18, 0.72, 0.88)
    bpy.ops.object.transform_apply(scale=True)
    set_smooth(sknot)
    assign_mat(sknot, mats["sash"])
    parts.append((sknot, "spine", "sash"))

    stail1 = build_tube_ribbon(
        "Hero_SashTail_Long",
        [
            (0.058, -0.138, 1.000),
            (0.072, -0.148, 0.875),
            (0.088, -0.156, 0.738),
            (0.100, -0.162, 0.598),
            (0.108, -0.166, 0.478),
        ],
        [0.032, 0.038, 0.042, 0.044, 0.030],
        [0.0085, 0.0075, 0.0065, 0.0055, 0.004],
        [-0.06, -0.10, -0.12, -0.09, -0.06],
    )
    assign_mat(stail1, mats["sash"])
    parts.append((stail1, "skirt_F", "sash"))

    stail2 = build_tube_ribbon(
        "Hero_SashTail_Short",
        [
            (0.046, -0.139, 0.998),
            (0.042, -0.148, 0.885),
            (0.046, -0.154, 0.760),
            (0.052, -0.157, 0.642),
        ],
        [0.028, 0.033, 0.035, 0.024],
        [0.0075, 0.0065, 0.0055, 0.004],
        [0.05, 0.08, 0.10, 0.06],
    )
    assign_mat(stail2, mats["sash"])
    parts.append((stail2, "skirt_F", "sash"))

    # Flush dark inner coat ribbon hanging on front-right (exact lobby_ink.webp detail!)
    rtail = build_tube_ribbon(
        "Hero_DarkWaistRibbon",
        [
            (-0.076, -0.124, 0.945),
            (-0.092, -0.136, 0.835),
            (-0.106, -0.144, 0.725),
        ],
        [0.028, 0.032, 0.026],
        [0.006, 0.0055, 0.0045],
    )
    assign_mat(rtail, mats["coat_dark"])
    parts.append((rtail, "skirt_F", "cloth"))

    # ==========================================================
    # 6. SLEEK TAILORED SPLIT COAT SKIRT (TUCKED CLEANLY INSIDE WAIST SASH!)
    #    ZERO waist corner steps! Hem at Z=0.465 so baggy trousers puff subtly above boots!
    # ==========================================================
    def build_skirt_panel(name, ang_start, ang_end, bone_name, n_u=15, flare_x=0.095, flare_y=0.064):
        rings = []
        # Top ring tucked deeply INSIDE waist sash (Z=0.985) so it emerges seamlessly with ZERO hip ledge!
        z_levels = [0.985, 0.935, 0.855, 0.750, 0.635, 0.530, 0.465]
        rx_base = [0.134, 0.146, 0.168, 0.190, 0.212, 0.230, 0.242]
        ry_base = [0.102, 0.112, 0.128, 0.146, 0.162, 0.174, 0.182]
        for zi, z in enumerate(z_levels):
            u_z = zi / (len(z_levels) - 1)
            rx = rx_base[zi] + (flare_x - 0.095) * (u_z ** 1.2)
            ry = ry_base[zi] + (flare_y - 0.064) * (u_z ** 1.2)
            thick = 0.011 - u_z * 0.0025
            outer = []
            inner = []
            for i in range(n_u):
                t = i / (n_u - 1)
                a = ang_start + (ang_end - ang_start) * t
                # Sculpted vertical cloth folds expanding naturally toward hem
                pleat = (0.020 * (u_z ** 1.15) + 0.002) * math.sin(t * math.pi * 4.5 + 0.25)
                edge_lift = 0.010 * ((1.0 - math.sin(t * math.pi)) ** 2) * (1.0 if zi == len(z_levels) - 1 else 0.0)
                sx, sy = math.sin(a), -math.cos(a)
                outer.append(Vector((sx * (rx + pleat), sy * (ry + pleat) + 0.004, z + edge_lift)))
                inner.append(Vector((sx * (rx + pleat - thick), sy * (ry + pleat - thick) + 0.004, z + edge_lift)))
            rings.append(outer + list(reversed(inner)))
        panel = build_loft_mesh(name, rings, closed_u=True, cap_bottom=True, cap_top=True)
        assign_mat(panel, mats["coat"])
        parts.append((panel, bone_name, "cloth"))

    build_skirt_panel("Hero_Skirt_FrontR", -math.pi * 0.47, -math.pi * 0.06, "skirt_F", n_u=14, flare_x=0.098, flare_y=0.062)
    build_skirt_panel("Hero_Skirt_FrontL",  math.pi * 0.06,  math.pi * 0.47, "skirt_F", n_u=14, flare_x=0.098, flare_y=0.062)
    build_skirt_panel("Hero_Skirt_Back",    math.pi * 0.51,  math.pi * 1.49, "skirt_B", n_u=24, flare_x=0.115, flare_y=0.075)

    # ==========================================================
    # 7. SEAMLESS SLOPED ARMS -> DRAPED SLEEVES -> SPIRAL BRACERS -> 5-FINGER HANDS!
    #    ZERO pointy shoulder cap seams!
    # ==========================================================
    def build_arm(side_sign, holding_sword=False):
        suf = "L" if side_sign > 0 else "R"
        # Smooth organic shoulder curve tucked cleanly INSIDE torso shoulder curve!
        p_in = Vector((side_sign * 0.140, 0.003, 1.350))   # buried smoothly inside upper chest
        p_sh = Vector((side_sign * 0.214, 0.005, 1.342))   # rounded deltoid curve (below torso trapezius!)
        p_ua = Vector((side_sign * 0.260, 0.015, 1.230))   # mid upper sleeve
        p_el = Vector((side_sign * 0.280, 0.022, 1.115))   # elbow
        p_wr = Vector((side_sign * 0.298, -0.028, 0.890))  # wrist

        sl_pts = [
            p_in,
            p_in.lerp(p_sh, 0.65),
            p_sh,
            p_sh.lerp(p_ua, 0.55),
            p_ua,
            p_ua.lerp(p_el, 0.60),
            p_el,
            p_el.lerp(p_wr, 0.14),  # sleeve puff gathers & tucks cleanly over upper bracer!
        ]
        # Smoothly tapered top -> athletic draped sleeve -> gathered elbow cuff (ZERO shoulder spikes!)
        sl_rx = [0.058, 0.072, 0.074, 0.072, 0.075, 0.082, 0.074, 0.055]
        sl_ry = [0.068, 0.082, 0.082, 0.078, 0.081, 0.088, 0.078, 0.057]

        def sleeve_fold(u, a):
            if u < 0.28:
                return 0.0
            return 0.008 * math.sin(a * 4.0 + u * 5.8) * math.sin(u * math.pi)

        sleeve = build_limb_tube(f"Hero_Sleeve_{suf}", sl_pts, sl_rx, sl_ry, n_seg=22, fold_fn=sleeve_fold)
        assign_mat(sleeve, mats["coat"])
        parts.append((sleeve, f"upperArm_{suf}", "cloth"))

        # Spiral-wrapped forearm bracer (토시/붕대)
        fa_pts, fa_rx, fa_ry = [], [], []
        n_fa = 16
        for k in range(n_fa):
            u = k / (n_fa - 1)
            t_seg = -0.06 + u * 1.09
            c = p_el.lerp(p_wr, t_seg)
            wrap_r = 0.0052 * abs(math.sin(u * math.pi * 7.0))
            r_base = (0.057 * (1.0 - u) + 0.036 * u) + wrap_r
            fa_pts.append(c)
            fa_rx.append(r_base * 0.96)
            fa_ry.append(r_base * 1.04)

        def bracer_spiral(u, a):
            return 0.0032 * math.sin(a * 1.0 + u * 28.0)

        bracer = build_limb_tube(f"Hero_Bracer_{suf}", fa_pts, fa_rx, fa_ry, n_seg=18, fold_fn=bracer_spiral)
        assign_mat(bracer, mats["leather"])
        parts.append((bracer, f"forearm_{suf}", "leather"))

        # Sculpted Hand (palm + 4 fingers + thumb)
        h_dir = (p_wr - p_el).normalized()
        h_right = Vector((side_sign, 0, 0))
        h_fwd = h_right.cross(h_dir).normalized()
        h_right = h_dir.cross(h_fwd).normalized()

        palm_pts = [
            p_wr - h_dir * 0.015,
            p_wr + h_dir * 0.018,
            p_wr + h_dir * 0.056,
            p_wr + h_dir * 0.088,
        ]
        palm = build_limb_tube(f"Hero_HandPalm_{suf}", palm_pts, [0.030, 0.032, 0.022, 0.016], [0.034, 0.040, 0.044, 0.040], n_seg=14)
        assign_mat(palm, mats["skin"])
        parts.append((palm, f"hand_{suf}", "skin"))

        knuckle_base = p_wr + h_dir * 0.084
        for fi, (fy_off, flen) in enumerate([(0.028, 0.068), (0.010, 0.076), (-0.009, 0.072), (-0.026, 0.058)]):
            k0 = knuckle_base + h_fwd * fy_off
            if holding_sword:
                k1 = k0 + h_dir * (flen * 0.36) - h_right * 0.018
                k2 = k1 + h_dir * (flen * 0.14) - h_right * 0.034
                k3 = k2 - h_dir * (flen * 0.18) - h_right * 0.016
            else:
                k1 = k0 + h_dir * (flen * 0.48) - h_right * 0.008
                k2 = k1 + h_dir * (flen * 0.34) - h_right * 0.018
                k3 = k2 + h_dir * (flen * 0.20) - h_right * 0.014
            fing = build_limb_tube(f"Hero_Finger_{suf}_{fi}", [k0, k1, k2, k3], [0.0095, 0.0085, 0.0075, 0.006], [0.0095, 0.0085, 0.0075, 0.006], n_seg=8)
            assign_mat(fing, mats["skin"])
            parts.append((fing, f"hand_{suf}", "skin"))

        th0 = p_wr + h_dir * 0.034 + h_fwd * 0.032 - h_right * 0.006
        if holding_sword:
            th1 = th0 + h_dir * 0.030 + h_fwd * 0.012 - h_right * 0.024
            th2 = th1 + h_dir * 0.020 - h_fwd * 0.012 - h_right * 0.022
        else:
            th1 = th0 + h_dir * 0.036 + h_fwd * 0.016 - h_right * 0.010
            th2 = th1 + h_dir * 0.026 + h_fwd * 0.004 - h_right * 0.014
        thumb = build_limb_tube(f"Hero_Thumb_{suf}", [th0, th1, th2], [0.012, 0.010, 0.008], [0.012, 0.010, 0.008], n_seg=8)
        assign_mat(thumb, mats["skin"])
        parts.append((thumb, f"hand_{suf}", "skin"))

        grip_center = knuckle_base + h_dir * 0.006 - h_right * 0.022
        return p_wr, grip_center

    wr_L, grip_L = build_arm(+1, holding_sword=False)
    wr_R, grip_R = build_arm(-1, holding_sword=True)

    # ==========================================================
    # 8. BAGGY MARTIAL TROUSERS (VISIBLE PUFF ABOVE BOOT CUFF!) + SCULPTED LEATHER BOOTS (목화)
    # ==========================================================
    for side_sign in (-1, 1):
        suf = "L" if side_sign > 0 else "R"
        hip = Vector((side_sign * 0.098, 0.005, 0.945))
        knee = Vector((side_sign * 0.118, -0.010, 0.515))
        ank = Vector((side_sign * 0.132, 0.014, 0.105))
        toe_yaw = side_sign * math.radians(11.0)

        # Baggy dark martial trousers puffing right above boot cuff at Z=0.41..0.48 (exact lobby_ink.webp!)
        tr_pts = [
            hip,
            hip.lerp(knee, 0.35),
            hip.lerp(knee, 0.70),
            knee,
            Vector((knee.x + side_sign * 0.004, knee.y + 0.002, 0.445)),  # dramatic trouser gather puff!
            Vector((knee.x + side_sign * 0.005, knee.y + 0.004, 0.395)),  # tucks cleanly into boot!
        ]
        tr_rx = [0.098, 0.096, 0.092, 0.092, 0.100, 0.068]
        tr_ry = [0.102, 0.098, 0.094, 0.094, 0.102, 0.070]
        trouser = build_limb_tube(
            f"Hero_Trouser_{suf}",
            tr_pts,
            tr_rx,
            tr_ry,
            n_seg=20,
            fold_fn=lambda u, a: 0.009 * math.sin(a * 4.0 + u * 5.5) * (0.35 + 0.65 * u),
        )
        assign_mat(trouser, mats["coat_dark"])
        parts.append((trouser, f"thigh_{suf}", "cloth"))

        # Sculpted tall black leather martial boot (flared knee cuff, calf curve, ankle creases, welt sole!)
        boot_spec_rings = [
            # (z, rx, ry_front, ry_back, y_center, crease)
            (0.422, 0.084, 0.084, 0.084,  0.000, 0.000),  # crisp flared knee-high cuff rim
            (0.402, 0.076, 0.076, 0.076,  0.000, 0.000),  # cuff band tuck
            (0.355, 0.070, 0.070, 0.074,  0.003, 0.002),  # upper calf
            (0.275, 0.064, 0.064, 0.070,  0.008, 0.002),  # mid calf
            (0.195, 0.055, 0.057, 0.061,  0.011, 0.003),  # lower shin
            (0.145, 0.052, 0.060, 0.056,  0.008, 0.005),  # ankle crease ridge 1
            (0.112, 0.048, 0.064, 0.054,  0.005, 0.004),  # fitted ankle crease 2
            (0.074, 0.052, 0.114, 0.058, -0.012, 0.002),  # instep / vamp
            (0.042, 0.056, 0.148, 0.060, -0.024, 0.000),  # toe box upper
            (0.024, 0.058, 0.158, 0.062, -0.026, 0.000),  # sole upper welt step
            (0.016, 0.061, 0.163, 0.064, -0.027, 0.000),  # proud heavy martial boot sole edge!
            (0.000, 0.059, 0.160, 0.062, -0.026, 0.000),  # grounded flat sole at Z=0.00!
        ]
        bt_rings = []
        n_b = 22
        ct, st = math.cos(toe_yaw), math.sin(toe_yaw)
        for z, rx, ry_f, ry_b, yc, cr in boot_spec_rings:
            t_k = max(0.0, min(1.0, (0.422 - z) / 0.32))
            cx = knee.x * (1.0 - t_k) + ank.x * t_k
            cy = knee.y * (1.0 - t_k) + ank.y * t_k
            ring = []
            for i in range(n_b):
                a = (i / n_b) * math.tau
                sx, sy = math.sin(a), -math.cos(a)
                ry = ry_f if sy < 0 else ry_b
                toe_taper = (0.76 + 0.24 * (1.0 + sy)) if (sy < 0 and z < 0.09) else 1.0
                # Center-front vertical boot seam ridge (iconic Joseon 목화 boot line!)
                seam = 0.0035 * (max(0.0, -sy) ** 8) if z > 0.08 else 0.0
                c_fold = cr * math.sin(a * 4.0)
                lx = sx * (rx + c_fold) * toe_taper
                ly = sy * (ry + seam + c_fold) + yc
                wx = cx + lx * ct - ly * st
                wy = cy + lx * st + ly * ct
                ring.append(Vector((wx, wy, z)))
            bt_rings.append(ring)
        boot = build_loft_mesh(f"Hero_Boot_{suf}", bt_rings)
        assign_mat(boot, mats["leather"])
        parts.append((boot, f"shin_{suf}", "leather"))

    # ==========================================================
    # 9. ICONIC CURVED JOSEON HWANDO SWORD (환도) — HEROICALLY VISIBLE FROM EVERY ANGLE!
    #    Angled outward-downward-forward (-X, -Y, -Z) so the full steel blade gleams cleanly!
    # ==========================================================
    # Local +Z = blade tip!
    # Compute exact orthonormal basis so blade points along desired world direction cleanly!
    blade_dir = Vector((-0.68, -0.34, -0.65)).normalized()  # Outward right (-X), forward (-Y), downward (-Z)!
    blade_edge_hint = Vector((-0.25, -0.70, 0.65)).normalized()
    bx = blade_dir.cross(blade_edge_hint).normalized()
    by = bx.cross(blade_dir).normalized()  # -by = sharp cutting edge!
    sword_rot = Matrix((
        (bx.x, by.x, blade_dir.x, 0.0),
        (bx.y, by.y, blade_dir.y, 0.0),
        (bx.z, by.z, blade_dir.z, 0.0),
        (0.0,  0.0,  0.0,         1.0),
    ))
    sword_xf = Matrix.Translation(grip_R) @ sword_rot

    # Cord-wrapped oval hilt (손잡이)
    hilt_rings = []
    for k in range(11):
        u = k / 10.0
        z = -0.155 + u * 0.265
        ridge = 0.0024 * abs(math.sin(u * math.pi * 8.0))
        hilt_rings.append([
            sword_xf @ Vector((math.sin(i / 12 * math.tau) * (0.013 + ridge), -math.cos(i / 12 * math.tau) * (0.018 + ridge), z))
            for i in range(12)
        ])
    hilt = build_loft_mesh("Hero_SwordHilt", hilt_rings)
    assign_mat(hilt, mats["leather"])
    parts.append((hilt, "sword", "leather"))

    # Iron pommel (병두)
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.018, depth=0.018)
    pommel = bpy.context.active_object
    pommel.name = "Hero_SwordPommel"
    pommel.matrix_world = sword_xf @ Matrix.Translation((0.0, 0.0, -0.160))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    set_smooth(pommel)
    assign_mat(pommel, mats["iron"])
    parts.append((pommel, "sword", "metal"))

    # Round iron guard (코등이 / Tsuba)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.045, depth=0.011)
    guard = bpy.context.active_object
    guard.name = "Hero_SwordGuard"
    guard.matrix_world = sword_xf @ Matrix.Translation((0.0, 0.0, 0.114))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    set_smooth(guard)
    assign_mat(guard, mats["iron"])
    parts.append((guard, "sword", "metal"))

    # Silver/brass blade collar (하바키)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.016, depth=0.026)
    habaki = bpy.context.active_object
    habaki.name = "Hero_SwordHabaki"
    habaki.matrix_world = sword_xf @ Matrix.Translation((0.0, 0.0, 0.132))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    set_smooth(habaki)
    assign_mat(habaki, mats["collar"])
    parts.append((habaki, "sword", "metal"))

    # Gleaming curved steel Hwando blade (환도 장검, 0.98m)
    blade_rings = []
    for k in range(16):
        u = k / 15.0
        z = 0.142 + u * 0.96
        curve_y = 0.052 * (u ** 2.15)  # graceful Korean Hwando sweep!
        taper = 1.0 - 0.16 * u
        if u > 0.87:
            taper *= max(0.05, (1.0 - u) / 0.13)
        w_edge = 0.024 * taper
        w_thick = 0.0055 * taper
        pts_local = [
            Vector((0.0, curve_y - w_edge, z)),
            Vector((w_thick, curve_y - w_edge * 0.18, z)),
            Vector((w_thick * 0.82, curve_y + w_edge * 0.52, z)),
            Vector((-w_thick * 0.82, curve_y + w_edge * 0.52, z)),
            Vector((-w_thick, curve_y - w_edge * 0.18, z)),
        ]
        blade_rings.append([sword_xf @ p for p in pts_local])
    blade = build_loft_mesh("Hero_SwordBlade", blade_rings, sharp_edges=True)
    assign_mat(blade, mats["steel"])
    parts.append((blade, "sword", "metal"))

    # Sleek lacquered scabbard (검집) tucked close along left hip angled rearward (+Y, -Z)!
    scab_dir = Vector((0.22, 0.78, -0.58)).normalized()
    scab_ref = Vector((0, 0, 1))
    sx_v = scab_dir.cross(scab_ref).normalized()
    sy_v = sx_v.cross(scab_dir).normalized()
    scab_rot = Matrix((
        (sx_v.x, sy_v.x, scab_dir.x, 0.0),
        (sx_v.y, sy_v.y, scab_dir.y, 0.0),
        (sx_v.z, sy_v.z, scab_dir.z, 0.0),
        (0.0,    0.0,    0.0,        1.0),
    ))
    scab_xf = Matrix.Translation((0.175, 0.018, 0.942)) @ scab_rot
    scab_rings = []
    for k in range(12):
        u = k / 11.0
        z = -0.14 + u * 0.92
        curve_y = 0.036 * (u ** 2.0)
        scab_rings.append([
            scab_xf @ Vector((math.sin(i / 12 * math.tau) * 0.013, curve_y - math.cos(i / 12 * math.tau) * 0.022, z))
            for i in range(12)
        ])
    scabbard = build_loft_mesh("Hero_Scabbard", scab_rings)
    assign_mat(scabbard, mats["leather"])
    parts.append((scabbard, "spine", "leather"))

    for tag, z_pos in [("Mouth", -0.135), ("Tip", 0.775)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.020, depth=0.032)
        fit = bpy.context.active_object
        fit.name = f"Hero_Scabbard_{tag}"
        fit.scale = (0.76, 1.18, 1.0)
        bpy.ops.object.transform_apply(scale=True)
        fit.matrix_world = scab_xf @ Matrix.Translation((0.0, 0.036 if tag == "Tip" else 0.0, z_pos))
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        set_smooth(fit)
        assign_mat(fit, mats["iron"])
        parts.append((fit, "spine", "metal"))

    return parts


def create_armature():
    arm_data = bpy.data.armatures.new("Hero_Armature")
    arm_obj = bpy.data.objects.new("Hero_Armature", arm_data)
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

    add_bone("hips", (0, 0, 0.94), (0, 0, 1.04))
    add_bone("spine", (0, 0, 1.04), (0, 0, 1.24), "hips", True)
    add_bone("chest", (0, 0, 1.24), (0, 0, 1.48), "spine", True)
    add_bone("neck", (0, 0, 1.48), (0, 0, 1.58), "chest", True)
    add_bone("head", (0, 0, 1.58), (0, 0, 1.82), "neck", True)
    add_bone("ribbon_A", (-0.026, 0.108, 1.678), (-0.36, 0.18, 1.41), "head")
    add_bone("ribbon_B", (-0.018, 0.109, 1.672), (-0.25, 0.19, 1.37), "head")

    for s in (-1, 1):
        suf = "L" if s > 0 else "R"
        add_bone(f"upperArm_{suf}", (s * 0.214, 0.005, 1.342), (s * 0.280, 0.022, 1.115), "chest")
        add_bone(f"forearm_{suf}", (s * 0.280, 0.022, 1.115), (s * 0.298, -0.028, 0.890), f"upperArm_{suf}", True)
        add_bone(f"hand_{suf}", (s * 0.298, -0.028, 0.890), (s * 0.305, -0.042, 0.805), f"forearm_{suf}", True)
        add_bone(f"thigh_{suf}", (s * 0.098, 0.005, 0.945), (s * 0.118, -0.010, 0.515), "hips")
        add_bone(f"shin_{suf}", (s * 0.118, -0.010, 0.515), (s * 0.132, 0.014, 0.105), f"thigh_{suf}", True)
        add_bone(f"foot_{suf}", (s * 0.132, 0.014, 0.105), (s * 0.132, -0.105, 0.020), f"shin_{suf}", True)

    add_bone("sword", (-0.305, -0.042, 0.810), (-0.950, -0.360, 0.200), "hand_R")
    add_bone("skirt_F", (0, -0.11, 0.94), (0, -0.16, 0.45), "hips")
    add_bone("skirt_B", (0, 0.11, 0.94), (0, 0.17, 0.45), "hips")

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def add_clips(arm_obj):
    arm_obj.animation_data_create()
    pb = arm_obj.pose.bones
    for b in pb:
        b.rotation_mode = "XYZ"

    def set_rot(bone_name, rx, ry, rz, frame):
        b = pb[bone_name]
        b.rotation_euler = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), "XYZ")
        b.keyframe_insert(data_path="rotation_euler", frame=frame)

    def set_loc(bone_name, x, y, z, frame):
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
        set_rot("upperArm_R", -3.0 * k, 0, -1.5 * k, f)
        set_rot("upperArm_L", 2.5 * k, 0, 1.5 * k, f)
        set_rot("ribbon_A", 3.5 * k, 5.5 * k, 4.5 * k, f)
        set_rot("ribbon_B", -3.0 * k, -4.5 * k, 5.5 * k, f)
        set_rot("skirt_F", 1.5 * k, 0, 0, f)
        set_rot("skirt_B", -2.2 * k, 0, 0, f)
    finish_action("idle")

    # 2) walk
    arm_obj.animation_data.action = bpy.data.actions.new("walk")
    reset_all()
    for f, s in [(1, 0.0), (7, 1.0), (13, 0.0), (19, -1.0), (25, 0.0)]:
        set_loc("hips", 0, 0, 0.020 * abs(s), f)
        set_rot("spine", 5.5, 0, 5.5 * s, f)
        set_rot("thigh_L", 24.0 * s, 0, 0, f)
        set_rot("shin_L", -16.0 * max(0.0, -s) - 5.0, 0, 0, f)
        set_rot("thigh_R", -24.0 * s, 0, 0, f)
        set_rot("shin_R", -16.0 * max(0.0, s) - 5.0, 0, 0, f)
        set_rot("upperArm_L", -16.0 * s, 0, 0, f)
        set_rot("upperArm_R", 10.0 * s - 6.0, 0, 0, f)
        set_rot("ribbon_A", 11.0, 7.0 * s, 7.0, f)
        set_rot("skirt_B", -12.0 - 5.0 * abs(s), 0, 0, f)
    finish_action("walk")

    # 3) slash (일섬)
    arm_obj.animation_data.action = bpy.data.actions.new("slash")
    reset_all()
    set_rot("spine", 10, 0, -26, 1); set_rot("chest", 6, 0, -20, 1)
    set_rot("upperArm_R", -38, 16, -28, 1); set_rot("forearm_R", -24, 0, 0, 1)
    set_rot("ribbon_A", 14, -12, 16, 1); set_rot("skirt_B", -16, 0, 0, 1)
    set_rot("spine", 14, 0, 32, 7); set_rot("chest", 8, 0, 24, 7)
    set_rot("upperArm_R", 48, -22, 44, 7); set_rot("forearm_R", -10, 0, 0, 7)
    set_rot("ribbon_A", 22, 20, -14, 7); set_rot("skirt_B", -24, 0, 0, 7)
    set_rot("spine", 5, 0, 8, 16); set_rot("chest", 2, 0, 6, 16)
    set_rot("upperArm_R", 6, -5, 10, 16); set_rot("forearm_R", -8, 0, 0, 16)
    set_rot("ribbon_A", 7, 5, 3, 16); set_rot("skirt_B", -6, 0, 0, 16)
    finish_action("slash")

    # 4) hit
    arm_obj.animation_data.action = bpy.data.actions.new("hit")
    reset_all()
    set_rot("spine", -12, 0, 10, 1); set_rot("head", -8, 0, 0, 1)
    set_rot("spine", -16, 0, 14, 5); set_rot("head", -12, 0, 0, 5)
    set_rot("spine", 0, 0, 0, 12); set_rot("head", 0, 0, 0, 12)
    finish_action("hit")

    reset_all()


def paint_sumi_vertex_shading(body_obj):
    """Bake comic/sumi-ink painterly AO, fold ink creases, and subtle stern mouth line into COLOR_0!"""
    mesh = body_obj.data
    vcol_attr = mesh.color_attributes.get("Col")
    if vcol_attr is None:
        vcol_attr = mesh.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")

    # Compute local concavity/crease score per vertex via bmesh neighbor curvature!
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    crease_scores = [0.0] * len(bm.verts)
    for v in bm.verts:
        if not v.link_edges:
            continue
        avg_co = Vector((0, 0, 0))
        cnt = 0
        for e in v.link_edges:
            ov = e.other_vert(v)
            avg_co += ov.co
            cnt += 1
        avg_co /= max(1, cnt)
        # Positive dot -> vertex sits INSIDE a concave fold crease -> darken with sumi ink!
        concavity = (avg_co - v.co).dot(v.normal)
        crease_scores[v.index] = max(0.0, min(1.0, concavity * 95.0))
    bm.free()

    verts = mesh.vertices
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            v = verts[vi]
            co = v.co
            n = v.normal
            # Vertical grounding gradient
            h_grad = 0.74 + 0.28 * max(0.0, min(1.0, co.z / 1.72))
            # Soft directional volume + comic cavity darkening in cloth folds & sash wraps!
            dir_ao = 0.80 + 0.22 * max(0.0, n.z * 0.62 - n.y * 0.38 + 0.34)
            fold_ink = 1.0 - 0.42 * crease_scores[vi]
            # Subtle warm-ink shadow under chin, under nose, and stern mouth crease!
            face_ink = 1.0
            if 1.49 < co.z < 1.585 and co.y < -0.01 and abs(co.x) < 0.068:
                face_ink *= 0.72  # strong chin cast shadow on neck (iconic lobby_ink.webp look!)
            if 1.606 < co.z < 1.614 and co.y < -0.078 and abs(co.x) < 0.025:
                face_ink *= 0.56  # crisp stern closed-mouth ink shadow line!
            if 1.622 < co.z < 1.632 and co.y < -0.085 and abs(co.x) < 0.016:
                face_ink *= 0.72  # subtle under-nose shadow!
            # Subtle underside shadow directly beneath waist sash
            if 0.90 < co.z < 0.955:
                face_ink *= 0.78

            k = max(0.32, min(1.06, h_grad * dir_ao * fold_ink * face_ink))
            vcol_attr.data[li].color = (k, k, k, 1.0)


def join_and_skin(parts, arm_obj, outline_mat):
    for obj, bone_name, _ in parts:
        assign_bone_group(obj, bone_name, 1.0)

    bpy.ops.object.select_all(action="DESELECT")
    for obj, _, _ in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0][0]
    bpy.ops.object.join()
    body = bpy.context.active_object
    body.name = "Hero_Body"
    body.data.name = "Hero_Body"

    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(body.data)
    bm.free()
    body.data.validate(verbose=False)
    paint_sumi_vertex_shading(body)

    # Dedicated inverted-hull sumi-ink outline mesh
    outline = body.copy()
    outline.data = body.data.copy()
    outline.name = "Hero_Outline"
    outline.data.name = "Hero_Outline"
    bpy.context.collection.objects.link(outline)
    outline.data.materials.clear()
    outline.data.materials.append(outline_mat)
    while len(outline.data.color_attributes) > 0:
        outline.data.color_attributes.remove(outline.data.color_attributes[0])

    bm = bmesh.new()
    bm.from_mesh(outline.data)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    for v in bm.verts:
        if v.co.z > 1.54:
            thick = 0.0036
        elif v.co.x < -0.34 and v.co.z < 0.88:
            thick = 0.0026  # razor-fine sword outline
        else:
            thick = 0.0058
        v.co += v.normal * thick
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(outline.data)
    bm.free()
    outline.data.validate(verbose=False)
    set_smooth(outline)

    for mesh_obj in (body, outline):
        mesh_obj.parent = arm_obj
        mod = mesh_obj.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = arm_obj

    tris_body = sum(max(1, len(p.vertices) - 2) for p in body.data.polygons)
    tris_out = sum(max(1, len(p.vertices) - 2) for p in outline.data.polygons)
    print(f"HERO_TRIS: body={tris_body}, outline={tris_out}, total={tris_body + tris_out}")
    return body, outline


def setup_studio_and_render(body, outline, outline_mat):
    upgrade_outline_mat_for_cycles(outline_mat)
    outline.visible_shadow = False
    outline.visible_diffuse = False
    outline.visible_glossy = False

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 540
    scene.render.resolution_y = 780
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"

    # Warm hanji parchment background (contrasts darkly inked coat cleanly!)
    world = bpy.data.worlds.new("StudioWorld")
    scene.world = world
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.86, 0.83, 0.77, 1.0)
        bg.inputs["Strength"].default_value = 0.65

    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.65, depth=0.04, location=(0, 0, -0.02))
    floor = bpy.context.active_object
    floor.name = "StudioFloor"
    fmat = make_mat("Mat_StudioFloor", (0.80, 0.76, 0.69, 1.0), roughness=0.92, use_vcol=False)
    assign_mat(floor, fmat)

    def add_area(name, loc, target, energy, size, col):
        ldata = bpy.data.lights.new(name=name, type="AREA")
        ldata.energy = energy
        ldata.size = size
        ldata.color = col
        lobj = bpy.data.objects.new(name, ldata)
        bpy.context.collection.objects.link(lobj)
        lobj.location = Vector(loc)
        lobj.rotation_euler = (Vector(target) - lobj.location).to_track_quat("-Z", "Y").to_euler()
        return lobj

    # Dramatic ink-illustration 3-point lighting with crisp warm rim on black coat & gleaming steel blade!
    add_area("KeyLight", (-2.0, -2.7, 2.7), (0, 0, 1.05), 240, 1.4, (1.0, 0.94, 0.85))
    add_area("FillLight", (2.6, -1.9, 1.7), (0, 0, 1.00), 70, 2.4, (0.76, 0.84, 1.0))
    add_area("RimLight", (0.9, 2.4, 2.2), (0, 0, 1.15), 290, 1.2, (1.0, 0.94, 0.82))
    add_area("BladeSpec", (-1.8, -1.6, 1.2), (-0.65, -0.25, 0.45), 140, 0.7, (0.92, 0.96, 1.0))

    cam_data = bpy.data.cameras.new("StudioCam")
    cam = bpy.data.objects.new("StudioCam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    views = [
        ("front", (-0.18, -4.15, 1.02), (-0.14, 0.0, 0.94), 56),
        ("three_quarter", (-2.25, -3.25, 1.10), (-0.14, 0.0, 0.94), 56),
        ("back", (0.45, 3.95, 1.08), (-0.08, 0.0, 0.94), 56),
        ("game_cam", (-2.40, -2.55, 3.30), (-0.12, 0.0, 0.84), 48),
    ]
    out_files = []
    for tag, loc, target, lens in views:
        cam.data.lens = lens
        cam.location = Vector(loc)
        cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(OUT_RENDER_DIR, f"hero_{tag}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        out_files.append(path)
        print("RENDERED:", path)
    return out_files


def main():
    clear_scene()
    # Authentic deep Joseon sumi-ink charcoal palette matching lobby_ink.webp (low spec on matte woven cloth!)
    mats = {
        "skin": make_mat("Mat_HeroSkin", (0.46, 0.27, 0.17, 1.0), roughness=0.62, spec=0.28, bump_scale=44.0, bump_str=0.025),
        "hair": make_mat("Mat_HeroHair", (0.008, 0.008, 0.011, 1.0), roughness=0.36, spec=0.38, coat=0.22, bump_scale=65.0, bump_str=0.07),
        "blindfold": make_mat("Mat_HeroBlindfold", (0.011, 0.012, 0.015, 1.0), roughness=0.90, spec=0.10, bump_scale=80.0, bump_str=0.14),
        "coat": make_mat("Mat_HeroCoat", (0.016, 0.017, 0.021, 1.0), roughness=0.88, spec=0.11, bump_scale=68.0, bump_str=0.16),
        "coat_dark": make_mat("Mat_HeroCoatDark", (0.008, 0.009, 0.012, 1.0), roughness=0.90, spec=0.09, bump_scale=72.0, bump_str=0.14),
        "collar": make_mat("Mat_HeroCollar", (0.64, 0.62, 0.58, 1.0), roughness=0.76, spec=0.18, bump_scale=88.0, bump_str=0.06),
        "sash": make_mat("Mat_HeroSash", (0.14, 0.138, 0.136, 1.0), roughness=0.84, spec=0.14, bump_scale=78.0, bump_str=0.18),
        "leather": make_mat("Mat_HeroLeather", (0.009, 0.009, 0.012, 1.0), roughness=0.44, spec=0.24, coat=0.10, bump_scale=52.0, bump_str=0.10),
        "iron": make_mat("Mat_HeroIron", (0.08, 0.08, 0.10, 1.0), roughness=0.32, metallic=0.88),
        "steel": make_mat("Mat_HeroSteel", (0.86, 0.89, 0.94, 1.0), roughness=0.16, metallic=0.95),
    }
    outline_mat = make_outline_mat_gltf()

    arm_obj = create_armature()
    parts = build_hero_parts(mats)
    body, outline = join_and_skin(parts, arm_obj, outline_mat)
    add_clips(arm_obj)

    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    body.select_set(True)
    outline.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_nla_strips=True,
        export_materials="EXPORT",
    )
    print("EXPORTED_GLB:", OUT_GLB, "BYTES:", os.path.getsize(OUT_GLB))

    setup_studio_and_render(body, outline, outline_mat)


if __name__ == "__main__":
    main()
