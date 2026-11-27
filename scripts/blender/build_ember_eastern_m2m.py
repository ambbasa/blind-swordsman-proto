"""Build Ember & Blade style Eastern characters with 66-bone Mesh2Motion rigging.

Upgrades over the legacy carved pipeline (build_carved_m2m.py):
  1. Preserves smooth silhouette topology (14k hero / 8.5k-13.5k mobs & bosses)
     with angle-based sharp bevels + 1024px lossless tangent-space Normal Map bake
     instead of forced 2600-quad flat-shaded QuadriFlow wood-carving.
  2. Crisp 4-view orthographic turnaround projection + edge-preserving pigment
     plane cleanup for occluded pockets (clean matte painterly color blocks).
  3. Lineless by default (--outline-mode none) to pair with Three.js stark-white
     hard rim lighting, while keeping subtle/ink outline modes optional.
  4. Optional beveled Ember-style Eastern Great-Dao (--sword-style ember-dao)
     with glowing crimson-white ember core fissure snapped to hand_r palm.
  5. Optional 4-view + 3/4 Blender verification preview render (--preview-out).
"""
import argparse
import json
import math
import os
from pathlib import Path
import struct
import sys
import tempfile

import bmesh
import bpy
from mathutils import Matrix, Vector
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import apply_mesh2motion as m2m
from build_bosses_act234 import (
    BOSS_CONFIGS,
    MODELS_DIR,
    SRC_BOSS_FIT,
    UNARMED_ACTIONS,
    compute_arm_local_quat,
    guardian_ankle,
    load_unarmed_actions,
    make_outline,
    measure_hand_targets,
    refit_boss_armature,
)
from build_hero_master import M2M_DIR, attach_sword
from project_mv_carved import _bake_geom_map, _find_base_color_image, project_4view_onto_mesh


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MV_ROOT = ROOT / "design" / "character-concepts" / "ember-eastern-mv"

TRI_BUDGETS = {
    "hero": 14000,
    "minion": 8500,
    "heavy": 10500,
    "stone": 10500,
    "boss_act1": 13500,
    "boss_act2": 13500,
    "boss_act3": 13500,
    "boss_act4": 13500,
}


def character_profiles():
    profiles = {}
    for profile in m2m.CHARACTERS:
        name = profile["name"]
        if name == "boss":
            continue
        fit = dict(profile["fit"])
        profiles[name] = {
            **profile,
            "id": name,
            "label": f"Ember-Eastern {name}",
            "mesh_prefix": name.capitalize(),
            "raw": f"{name}_raw.glb",
            "out": f"{name}.glb",
            "template": str(Path(MODELS_DIR) / f"{name}.glb"),
            "source_fit": fit,
            "clip_names": [clip for clip, _ in profile["clips"]],
            "torso_clean_z": fit["z_shoulder"] - 0.12,
            "torso_clean_x": fit["shoulder_x"] * 0.80,
            "arm_floor_z": fit["z_shoulder"] - fit["arm_len"] - 0.10,
            "tri_budget": TRI_BUDGETS[name],
        }

    bosses = {boss["id"]: boss for boss in BOSS_CONFIGS}
    for name, boss in bosses.items():
        donor = bosses["boss_act2"] if name == "boss_act1" else boss
        profiles[name] = {
            **boss,
            "label": f"Ember-Eastern {name}",
            "template": str(Path(MODELS_DIR) / donor["out"]),
            "source_fit": dict(donor["fit"]),
            "clip_names": [spec[0] for spec in UNARMED_ACTIONS],
            "tri_budget": TRI_BUDGETS[name],
        }

    for profile in profiles.values():
        fit = profile["fit"]
        wrist_z = fit["z_shoulder"] - fit["arm_len"]
        profile["wrist_band"] = (max(0.40, wrist_z - 0.12), min(1.16, wrist_z + 0.24))

    # 8-head sleek Ember-Eastern hero overrides (measured directly from hero_raw.glb):
    # - True shoulder pivot is narrower (0.178m) and slightly higher (1.372m) than legacy 6-head template
    # - Keep torso_clean below the true armpit split (z=1.14m, torso_max=0.138m) so underarm skin never stretches
    if "hero" in profiles:
        hp = profiles["hero"]
        hp["fit"]["shoulder_x"] = 0.178
        hp["fit"]["z_shoulder"] = 1.372
        hp["torso_clean_z"] = 1.12
        hp["torso_clean_x"] = 0.145
        hp["coat_clean_z"] = 1.00
        hp["coat_clean_x"] = 0.235
        hp["arm_floor_z"] = 0.70
        hp["shoulder_y_target"] = 0.070
        hp["two_stage_arms"] = True
    return profiles


def measure_elbow_targets(mesh_obj, z_shoulder, lh_wrist, rh_wrist, torso_x=0.145):
    """Measure the exact 3D elbow centers halfway down each A-pose arm."""
    z_l = 0.5 * (z_shoulder + lh_wrist.z) - 0.022
    z_r = 0.5 * (z_shoulder + rh_wrist.z) - 0.022
    vs = [v.co for v in mesh_obj.data.vertices]
    l_pts = [p for p in vs if abs(p.z - z_l) <= 0.032 and p.x > torso_x + 0.020]
    r_pts = [p for p in vs if abs(p.z - z_r) <= 0.032 and p.x < -(torso_x + 0.020)]
    if not l_pts or not r_pts:
        return None, None
    lh_elbow = sum(l_pts, Vector((0, 0, 0))) / len(l_pts)
    rh_elbow = sum(r_pts, Vector((0, 0, 0))) / len(r_pts)
    return lh_elbow, rh_elbow


def apply_smooth_with_bevel_normals(mesh_obj, sharp_angle_deg=42.0):
    """Smooth organic surfaces while preserving crisp planar creases on armor/boots."""
    for p in mesh_obj.data.polygons:
        p.use_smooth = True
    mesh_obj.data.update()

    if sharp_angle_deg <= 0:
        return

    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_obj
    angle_rad = math.radians(sharp_angle_deg)
    try:
        # Blender 4.1+ / 5.x native sharp-by-angle without splitting geometry
        bpy.ops.object.shade_smooth_by_angle(angle=angle_rad, keep_sharp_edges=True)
        print(f"  + Applied Smooth-by-Angle ({sharp_angle_deg:.0f} deg) crisp bevel normals")
    except Exception:
        # Fallback: mark sharp edges via bmesh for exporter / normal continuity
        bm = bmesh.new()
        bm.from_mesh(mesh_obj.data)
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) >= angle_rad:
                e.smooth = False
        bm.to_mesh(mesh_obj.data)
        bm.free()
        mesh_obj.data.update()
        print(f"  + Marked sharp edges >= {sharp_angle_deg:.0f} deg via bmesh")


def clean_pigment_planes(mesh_obj, strength=0.38, sigma_color=0.11):
    """Edge-preserving bilateral-like smoothing on Base Color to remove AI speckle noise
    while keeping crisp Ember & Blade material boundaries (skin/blindfold/collar/belt)."""
    _, base_img = _find_base_color_image(mesh_obj)
    if base_img is None or strength <= 0.0:
        return
    w, h = base_img.size[0], base_img.size[1]
    buf = np.empty(w * h * 4, dtype=np.float32)
    base_img.pixels.foreach_get(buf)
    rgba = buf.reshape((h, w, 4))
    rgb = rgba[..., :3].copy()

    # Fast 3x3 edge-preserving bilateral pass (2 iterations)
    inv_2sig2 = 1.0 / max(1e-4, 2.0 * sigma_color * sigma_color)
    cur = rgb
    for _ in range(2):
        pad = np.pad(cur, ((1, 1), (1, 1), (0, 0)), mode="edge")
        acc = np.zeros_like(cur)
        wsum = np.zeros((h, w, 1), dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nbr = pad[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]
                diff2 = np.sum((nbr - cur) ** 2, axis=-1, keepdims=True)
                sp_w = 1.0 if (dx == 0 and dy == 0) else (0.75 if (dx == 0 or dy == 0) else 0.5)
                wt = sp_w * np.exp(-diff2 * inv_2sig2)
                acc += nbr * wt
                wsum += wt
        cur = acc / np.maximum(wsum, 1e-6)

    blended = rgb * (1.0 - strength) + cur * strength
    rgba[..., :3] = np.clip(blended, 0.0, 1.0)
    base_img.pixels.foreach_set(rgba.ravel())
    base_img.pack()
    print(f"  + Cleaned Base Color pigment planes (strength={strength:.2f}, sigma={sigma_color:.2f})")


def bake_clean_normal_map(high_obj, low_obj, img_name, size=1024, strength=0.32):
    """Bake ONLY a subtle tangent-space Normal Map (zero grainy AO/Curvature Base Color pollution)."""
    mat = low_obj.data.materials[0] if low_obj.data.materials else None
    if mat is None or not mat.use_nodes:
        return None
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return None

    scene = bpy.context.scene
    prev_engine = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.012
    scene.render.bake.max_ray_distance = 0.028
    scene.render.bake.margin = 6

    n_img = bpy.data.images.new(img_name, width=size, height=size, alpha=False)
    n_img.colorspace_settings.name = "Non-Color"
    tex_node = nt.nodes.new("ShaderNodeTexImage")
    tex_node.image = n_img
    for n in nt.nodes:
        n.select = False
    tex_node.select = True
    nt.nodes.active = tex_node

    bpy.ops.object.select_all(action="DESELECT")
    high_obj.select_set(True)
    low_obj.select_set(True)
    bpy.context.view_layer.objects.active = low_obj
    bpy.ops.object.bake(type="NORMAL")
    n_img.pack()

    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = strength
    nt.links.new(tex_node.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    scene.render.engine = prev_engine
    print(f"  + Baked clean Normal Map only ({size}x{size}, strength={strength:.2f}, zero AO noise)")
    return n_img


def polish_hero_face_texture(mesh_obj, tex_size=2048):
    """Paint crisp anti-aliased Ember & Blade face, blindfold, Y-collar, and bangs without altering mesh topology."""
    mat, base_img = _find_base_color_image(mesh_obj)
    if base_img is None:
        return

    if base_img.size[0] != tex_size or base_img.size[1] != tex_size:
        base_img.scale(tex_size, tex_size)

    prev_smooth = [p.use_smooth for p in mesh_obj.data.polygons]
    for p in mesh_obj.data.polygons:
        p.use_smooth = True
    pos = _bake_geom_map(mesh_obj, "POS", size=tex_size)
    nrm = _bake_geom_map(mesh_obj, "NRM", size=tex_size)
    for p, sm in zip(mesh_obj.data.polygons, prev_smooth):
        p.use_smooth = sm

    uv_mask = np.linalg.norm(nrm, axis=-1) > 0.1
    buf = np.empty(tex_size * tex_size * 4, dtype=np.float32)
    base_img.pixels.foreach_get(buf)
    rgb = buf.reshape((tex_size, tex_size, 4))[..., :3].copy()

    def dilate_uv(img_rgb, mask, iters=14):
        out = img_rgb.copy()
        cur = mask.copy()
        for _ in range(iters):
            if cur.all():
                break
            acc = np.zeros_like(out)
            cnt = np.zeros(cur.shape, dtype=np.float32)
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
                wt = 1.0 if (dy == 0 or dx == 0) else 0.707
                sm = np.roll(np.roll(cur, dy, axis=0), dx, axis=1)
                si = np.roll(np.roll(out, dy, axis=0), dx, axis=1)
                if dy == 1:
                    sm[0, :] = False
                elif dy == -1:
                    sm[-1, :] = False
                if dx == 1:
                    sm[:, 0] = False
                elif dx == -1:
                    sm[:, -1] = False
                acc += si * (sm[..., None] * wt)
                cnt += sm * wt
            fill = (~cur) & (cnt > 0)
            out[fill] = acc[fill] / cnt[fill][..., None]
            cur = cur | fill
        return out

    def smoothstep(edge0, edge1, val):
        diff = np.asarray(edge1, dtype=np.float32) - np.asarray(edge0, dtype=np.float32)
        safe = np.where(np.abs(diff) < 1e-6, 1e-6, diff)
        t = np.clip((val - edge0) / safe, 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)

    # Erode 1px along UV borders to strip dark seam pixels before painting
    eroded = uv_mask.copy()
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        eroded &= np.roll(np.roll(uv_mask, dy, axis=0), dx, axis=1)
    rgb = dilate_uv(rgb, eroded, iters=14)

    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    nx, ny, nz = nrm[..., 0], nrm[..., 1], nrm[..., 2]
    ax = np.abs(x)
    luma = rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114

    col_skin_light  = np.array([0.895, 0.845, 0.822], dtype=np.float32)
    col_skin_mid    = np.array([0.830, 0.778, 0.768], dtype=np.float32)
    col_skin_shadow = np.array([0.690, 0.648, 0.688], dtype=np.float32)
    col_skin_deep   = np.array([0.555, 0.515, 0.575], dtype=np.float32)
    col_lip_upper   = np.array([0.620, 0.530, 0.555], dtype=np.float32)
    col_lip_part    = np.array([0.460, 0.400, 0.445], dtype=np.float32)
    col_bf_light    = np.array([0.895, 0.865, 0.790], dtype=np.float32)
    col_bf_mid      = np.array([0.805, 0.770, 0.690], dtype=np.float32)
    col_bf_shadow   = np.array([0.665, 0.630, 0.565], dtype=np.float32)
    col_hair_dark   = np.array([0.110, 0.145, 0.215], dtype=np.float32)
    col_hair_hi     = np.array([0.185, 0.250, 0.355], dtype=np.float32)
    col_collar_wht  = np.array([0.880, 0.850, 0.775], dtype=np.float32)
    col_cloth_blk   = np.array([0.120, 0.125, 0.140], dtype=np.float32)

    bf_bottom_z = 1.540 - 0.007 * np.clip(ax / 0.065, 0.0, 1.0) + 0.003 * (x / 0.065)
    v_inner_x = np.clip((z - 1.345) * 0.44, 0.0, 0.050)

    in_face_area = uv_mask & (z >= 1.462) & (z < bf_bottom_z + 0.002) & (ax < 0.088) & (y < 0.01) & (ny < 0.15)
    # Keep neck polish strictly on actual exposed skin pixels so original 4-view Y-collar stays 100% intact
    in_neck_area = uv_mask & (z >= 1.355) & (z < 1.472) & (ax < 0.052) & (y < 0.015) & (ny < 0.15) & (luma > 0.42)
    not_hair_side = ~((ax > 0.058) & (z > 1.485) & (luma < 0.36))
    skin_mask = (in_face_area | in_neck_area) & not_hair_side

    skin_col = np.broadcast_to(col_skin_light, rgb.shape).copy()
    right_plane = smoothstep(0.16, 0.42, nx) * smoothstep(0.008, 0.032, x)
    left_cheek = smoothstep(-0.42, -0.68, nx) * smoothstep(-0.038, -0.055, x)
    skin_col = skin_col * (1.0 - 0.65 * right_plane[..., None]) + col_skin_shadow * (0.65 * right_plane[..., None])
    skin_col = skin_col * (1.0 - 0.42 * left_cheek[..., None]) + col_skin_mid * (0.42 * left_cheek[..., None])

    chin_v_z = 1.468 - 0.032 * np.clip(1.0 - ax / 0.048, 0.0, 1.0)
    neck_shadow = (
        smoothstep(1.482, 1.464, z) *
        smoothstep(chin_v_z - 0.012, chin_v_z + 0.008, z) *
        smoothstep(0.060, 0.025, ax)
    )
    jaw_under = smoothstep(-0.24, -0.52, nz) * smoothstep(1.502, 1.475, z) * smoothstep(1.455, 1.470, z)
    skin_col = skin_col * (1.0 - 0.72 * neck_shadow[..., None]) + col_skin_shadow * (0.72 * neck_shadow[..., None])
    skin_col = skin_col * (1.0 - 0.55 * jaw_under[..., None]) + col_skin_shadow * (0.55 * jaw_under[..., None])

    nose_ridge = smoothstep(1.538, 1.530, z) * smoothstep(1.515, 1.522, z) * smoothstep(0.009, 0.003, ax) * smoothstep(-0.088, -0.098, y)
    nose_under = smoothstep(1.522, 1.516, z) * smoothstep(1.507, 1.513, z) * smoothstep(0.013, 0.005, ax) * smoothstep(-0.08, -0.32, nz)
    nose_rwall = smoothstep(1.536, 1.528, z) * smoothstep(1.512, 1.518, z) * smoothstep(0.003, 0.008, x) * smoothstep(0.019, 0.012, x) * smoothstep(0.22, 0.45, nx)
    skin_col = skin_col * (1.0 - 0.55 * nose_ridge[..., None]) + np.array([0.93, 0.89, 0.87], dtype=np.float32) * (0.55 * nose_ridge[..., None])
    skin_col = skin_col * (1.0 - 0.78 * nose_under[..., None]) + col_skin_deep * (0.78 * nose_under[..., None])
    skin_col = skin_col * (1.0 - 0.55 * nose_rwall[..., None]) + col_skin_shadow * (0.55 * nose_rwall[..., None])

    taper = smoothstep(0.0175, 0.003, ax)
    bow = 0.0011 * np.cos(np.clip(ax / 0.010, 0.0, 1.0) * math.pi)
    lip_z = 1.5012 + bow
    upper_lip = (
        smoothstep(0.0028 * (0.35 + 0.65 * taper), 0.0008, np.abs(z - (lip_z + 0.0010))) *
        smoothstep(0.0175, 0.0110, ax) * smoothstep(-0.072, -0.084, y)
    )
    mouth_crease = (
        smoothstep(0.0011, 0.0002, np.abs(z - (lip_z - 0.0006))) *
        smoothstep(0.0170, 0.0090, ax) * smoothstep(-0.072, -0.084, y)
    )
    lower_lip_sh = (
        smoothstep(0.0022, 0.0006, np.abs(z - 1.4932)) *
        smoothstep(0.0095, 0.0035, ax) * smoothstep(-0.070, -0.082, y)
    )
    skin_col = skin_col * (1.0 - 0.68 * upper_lip[..., None]) + col_lip_upper * (0.68 * upper_lip[..., None])
    skin_col = skin_col * (1.0 - 0.62 * mouth_crease[..., None]) + col_lip_part * (0.62 * mouth_crease[..., None])
    skin_col = skin_col * (1.0 - 0.55 * lower_lip_sh[..., None]) + col_skin_shadow * (0.55 * lower_lip_sh[..., None])

    nose_bridge_protect = 1.0 - 0.55 * smoothstep(0.012, 0.004, ax)
    under_bf = (
        smoothstep(bf_bottom_z - 0.0085, bf_bottom_z - 0.0015, z) *
        smoothstep(bf_bottom_z + 0.002, bf_bottom_z - 0.0005, z) *
        smoothstep(0.075, 0.055, ax) * nose_bridge_protect
    )
    skin_col = skin_col * (1.0 - 0.72 * under_bf[..., None]) + col_skin_deep * (0.72 * under_bf[..., None])
    rgb[skin_mask] = skin_col[skin_mask]

    # Blindfold & bangs
    bf_top_z = 1.592 - 0.004 * (ax / 0.065)
    is_hair_lock = (z > 1.590) | ((z > 1.568) & (y < -0.109)) | ((z > 1.576) & (luma < 0.28) & (ax > 0.018))
    bf_mask = uv_mask & (z >= bf_bottom_z - 0.001) & (z <= bf_top_z) & (ax < 0.095) & (y < 0.04) & (~is_hair_lock)
    fold_u = (z - bf_bottom_z) * 32.0 + x * 8.0
    fold_mid = smoothstep(0.15, 0.45, np.sin(fold_u * 1.9))
    fold_cr = smoothstep(0.76, 0.90, np.abs(np.cos(fold_u * 1.35)))
    bf_rsh = smoothstep(0.18, 0.52, nx)
    bf_col = np.broadcast_to(col_bf_light, rgb.shape).copy()
    bf_col = bf_col * (1.0 - 0.48 * fold_mid[..., None]) + col_bf_mid * (0.48 * fold_mid[..., None])
    bf_col = bf_col * (1.0 - 0.52 * fold_cr[..., None]) + col_bf_shadow * (0.52 * fold_cr[..., None])
    bf_col = bf_col * (1.0 - 0.42 * bf_rsh[..., None]) + col_bf_shadow * (0.42 * bf_rsh[..., None])
    rgb[bf_mask] = bf_col[bf_mask]

    hair_bleed = uv_mask & (((z >= 1.584) & (luma > 0.30)) | ((z > 1.568) & (y < -0.109))) & (~bf_mask)
    hair_up = smoothstep(0.25, 0.70, nz)
    hair_col = np.broadcast_to(col_hair_dark, rgb.shape).copy()
    hair_col = hair_col * (1.0 - 0.65 * hair_up[..., None]) + col_hair_hi * (0.65 * hair_up[..., None])
    rgb[hair_bleed] = hair_col[hair_bleed]

    # Preserve authentic 4-view Joseon Y-collar; apply soft 2-pass Gaussian AA on painted face/blindfold/hair zones
    painted = skin_mask | bf_mask | hair_bleed
    aa_rgb = rgb.copy()
    for _ in range(2):
        acc = aa_rgb * 4.0
        for dy, dx, wt in ((-1, 0, 2.0), (1, 0, 2.0), (0, -1, 2.0), (0, 1, 2.0), (-1, -1, 1.0), (-1, 1, 1.0), (1, -1, 1.0), (1, 1, 1.0)):
            acc += np.roll(np.roll(aa_rgb, dy, axis=0), dx, axis=1) * wt
        aa_rgb = acc / 16.0
    rgb[painted] = aa_rgb[painted]

    rgb = dilate_uv(rgb, uv_mask, iters=14)
    out = np.ones((tex_size, tex_size, 4), dtype=np.float32)
    out[..., :3] = np.clip(rgb, 0.0, 1.0)
    base_img.pixels.foreach_set(out.ravel())
    base_img.pack()

    # Flatten baked normal map on face/blindfold/neck only so stylized porcelain stays clean without mismatch
    if mat and mat.use_nodes:
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf and bsdf.inputs["Normal"].is_linked:
            nmap = bsdf.inputs["Normal"].links[0].from_node
            if nmap.type == "NORMAL_MAP" and nmap.inputs["Color"].is_linked:
                nimg = nmap.inputs["Color"].links[0].from_node.image
                if nimg is not None:
                    nw, nh = nimg.size[0], nimg.size[1]
                    nbuf = np.empty(nw * nh * 4, dtype=np.float32)
                    nimg.pixels.foreach_get(nbuf)
                    npix = nbuf.reshape((nh, nw, 4)).copy()
                    step = max(1, tex_size // nw)
                    head_zone = (uv_mask & (z >= 1.35) & (ax < 0.16))[::step, ::step][:nh, :nw]
                    npix[head_zone, :3] = np.array([0.5, 0.5, 1.0], dtype=np.float32)
                    nimg.pixels.foreach_set(npix.ravel())
                    nimg.pack()

    print(f"  + Polished {tex_size}px Ember & Blade face/blindfold/Y-collar texture (topology preserved)")


def configure_matte_painterly_material(mesh_obj):
    """Set matte painterly Principled BSDF defaults so glTF matches Ember & Blade."""
    for mat in mesh_obj.data.materials:
        if not mat or not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        bsdf.inputs["Roughness"].default_value = 0.92
        bsdf.inputs["Metallic"].default_value = 0.0
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.14


def _make_sword_material(name, base_rgba, metallic, roughness, emission_rgba=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = base_rgba
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission_rgba is not None and emission_strength > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission_rgba
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = emission_rgba
    return mat


def _build_ember_great_dao_mesh():
    """Create a sleek, refined, slightly curved single-edged Jade Eastern Blade (비취 장도) along +Z.

    Grip palm center is at Z=0. Total length ~1.46m (hilt 0.30m + sleek blade 1.16m), max blade width 4.6cm.
    Returns (blade_obj, core_obj) for independent jade-steel and luminous white-mint fissure shading.
    """
    bm = bmesh.new()

    def add_section_loft(sections, mat_idx=0):
        rings = [[bm.verts.new(Vector(p)) for p in pts] for pts in sections]
        for i in range(len(rings) - 1):
            r0, r1 = rings[i], rings[i + 1]
            n = len(r0)
            for j in range(n):
                jn = (j + 1) % n
                f = bm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
                f.material_index = mat_idx
        bm.faces.new(list(reversed(rings[0]))).material_index = mat_idx
        bm.faces.new(rings[-1]).material_index = mat_idx

    # Faceted jade pommel (z: -0.205 .. -0.135)
    add_section_loft([
        [(0.0, -0.004, -0.205), (0.004, 0.0, -0.205), (0.0, 0.004, -0.205), (-0.004, 0.0, -0.205)],
        [(0.0, -0.018, -0.170), (0.014, 0.0, -0.170), (0.0, 0.018, -0.170), (-0.014, 0.0, -0.170)],
        [(0.0, -0.011, -0.135), (0.009, 0.0, -0.135), (0.0, 0.011, -0.135), (-0.009, 0.0, -0.135)],
    ], mat_idx=2)

    # Sleek two-handed wrapped Eastern hilt (z: -0.135 .. +0.125), palm at z=0.0
    add_section_loft([
        [(0.0, -0.014, -0.135), (0.009, 0.0, -0.135), (0.0, 0.014, -0.135), (-0.009, 0.0, -0.135)],
        [(0.0, -0.015, 0.000),  (0.010, 0.0, 0.000),  (0.0, 0.015, 0.000),  (-0.010, 0.0, 0.000)],
        [(0.0, -0.016, 0.125),  (0.011, 0.0, 0.125),  (0.0, 0.016, 0.125),  (-0.011, 0.0, 0.125)],
    ], mat_idx=1)

    # Refined octagonal Eastern guard (코등이, z: 0.125 .. 0.152)
    def oct_ring(rx, ry, z):
        return [
            (0.0, -ry, z), (rx * 0.72, -ry * 0.72, z), (rx, 0.0, z), (rx * 0.72, ry * 0.72, z),
            (0.0, ry, z), (-rx * 0.72, ry * 0.72, z), (-rx, 0.0, z), (-rx * 0.72, -ry * 0.72, z),
        ]
    add_section_loft([
        oct_ring(0.024, 0.038, 0.125),
        oct_ring(0.032, 0.048, 0.138),
        oct_ring(0.022, 0.034, 0.152),
    ], mat_idx=1)

    # Habaki collar (z: 0.152 .. 0.188)
    add_section_loft([
        [(0.0, -0.022, 0.152), (0.010, 0.0, 0.152), (0.006, 0.016, 0.152), (-0.006, 0.016, 0.152), (-0.010, 0.0, 0.152)],
        [(0.0, -0.020, 0.188), (0.008, 0.0, 0.188), (0.005, 0.015, 0.188), (-0.005, 0.015, 0.188), (-0.008, 0.0, 0.188)],
    ], mat_idx=1)

    # Sleek, refined curved single-edged Eastern Jade Blade (z: 0.188 .. 1.320, max width ~4.6cm)
    blade_profile = [
        # (z, edge_y, spine_y, half_thick, ridge_y)
        (0.188, -0.020,  0.015, 0.0075,  0.003),
        (0.430, -0.024,  0.016, 0.0075,  0.004),
        (0.700, -0.028,  0.018, 0.0070,  0.004),
        (0.960, -0.029,  0.017, 0.0064,  0.004),
        (1.150, -0.020,  0.022, 0.0052,  0.009),
        (1.255, -0.002,  0.029, 0.0034,  0.016),
        (1.320,  0.024,  0.032, 0.0014,  0.028),
    ]
    blade_sections = [
        [
            (0.0, ey, z),
            (ht, ry, z),
            (ht * 0.52, sy, z),
            (-ht * 0.52, sy, z),
            (-ht, ry, z),
        ]
        for z, ey, sy, ht, ry in blade_profile
    ]
    add_section_loft(blade_sections, mat_idx=0)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Hero_Sword_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = False

    blade_obj = bpy.data.objects.new("Hero_Sword", mesh)
    bpy.context.collection.objects.link(blade_obj)
    mat_blade = _make_sword_material(
        "EmberDao_JadeSteel",
        base_rgba=(0.08, 0.44, 0.36, 1.0),
        metallic=0.84,
        roughness=0.22,
        emission_rgba=(0.10, 0.58, 0.48, 1.0),
        emission_strength=0.32,
    )
    mat_hilt = _make_sword_material(
        "EmberDao_ForgedIron",
        base_rgba=(0.09, 0.09, 0.11, 1.0),
        metallic=0.72,
        roughness=0.42,
    )
    mat_pommel = _make_sword_material(
        "EmberDao_JadePommel",
        base_rgba=(0.14, 0.62, 0.52, 1.0),
        metallic=0.35,
        roughness=0.28,
        emission_rgba=(0.20, 0.80, 0.66, 1.0),
        emission_strength=0.45,
    )
    blade_obj.data.materials.append(mat_blade)
    blade_obj.data.materials.append(mat_hilt)
    blade_obj.data.materials.append(mat_pommel)

    # Razor-thin glowing pale-mint white jade fissure inlaid along the bevel ridge (z: 0.46 .. 1.12)
    bm_c = bmesh.new()
    core_sections = [
        [(0.0, -0.005, 0.46), (0.0082, -0.001, 0.46), (0.0, 0.003, 0.46), (-0.0082, -0.001, 0.46)],
        [(0.0, -0.011, 0.66), (0.0084, -0.003, 0.66), (0.0, 0.004, 0.66), (-0.0084, -0.003, 0.66)],
        [(0.0, -0.008, 0.82), (0.0080, -0.001, 0.82), (0.0, 0.006, 0.82), (-0.0080, -0.001, 0.82)],
        [(0.0, -0.014, 0.98), (0.0074, -0.005, 0.98), (0.0, 0.002, 0.98), (-0.0074, -0.005, 0.98)],
        [(0.0, -0.006, 1.12), (0.0058, -0.002, 1.12), (0.0, 0.002, 1.12), (-0.0058, -0.002, 1.12)],
    ]
    rings = [[bm_c.verts.new(Vector(p)) for p in sec] for sec in core_sections]
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for j in range(4):
            jn = (j + 1) % 4
            bm_c.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
    bm_c.faces.new(list(reversed(rings[0])))
    bm_c.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm_c, faces=bm_c.faces)

    core_mesh = bpy.data.meshes.new("Hero_Sword_EmberCore_Mesh")
    bm_c.to_mesh(core_mesh)
    bm_c.free()
    for p in core_mesh.polygons:
        p.use_smooth = False

    core_obj = bpy.data.objects.new("Hero_Sword_EmberCore", core_mesh)
    bpy.context.collection.objects.link(core_obj)
    mat_core = _make_sword_material(
        "EmberDao_JadeCore",
        base_rgba=(0.92, 1.0, 0.97, 1.0),
        metallic=0.0,
        roughness=0.12,
        emission_rgba=(0.45, 1.0, 0.86, 1.0),
        emission_strength=2.2,
    )
    core_obj.data.materials.append(mat_core)
    return blade_obj, core_obj


def attach_ember_great_dao(t_arm, body, template, outline_mode="none"):
    """Build and snap the faceted Ember Eastern Great-Dao dead-center into hand_r palm."""
    blade_obj, core_obj = _build_ember_great_dao_mesh()
    sword_objs = [blade_obj, core_obj]
    if outline_mode != "none":
        off = 0.0022 if outline_mode == "subtle" else 0.0038
        sword_out = make_outline(blade_obj, "Hero_Sword_Outline", offset=off, dec_ratio=0.75)
        sword_objs.append(sword_out)

    # Measure real right-hand palm center from Hero_Body vertices weighted to hand_r
    vg_hr = body.vertex_groups.get("hand_r")
    hr_pts = []
    if vg_hr:
        for v in body.data.vertices:
            try:
                if vg_hr.weight(v.index) > 0.45 and v.co.x < -0.22:
                    hr_pts.append(v.co.copy())
            except RuntimeError:
                pass
    if hr_pts:
        palm = sum(hr_pts, Vector((0, 0, 0))) / len(hr_pts)
    else:
        hand_b = t_arm.data.bones["hand_r"]
        palm = t_arm.matrix_world @ ((hand_b.head_local + hand_b.tail_local) * 0.5)

    # Compute exact T-pose blade direction so M2M_Idle points cleanly outward-forward-up
    before_tmp = set(bpy.data.objects)
    before_act_tmp = set(bpy.data.actions)
    idle_path = os.path.join(M2M_DIR, "idle-a.glb")
    bpy.ops.import_scene.gltf(filepath=idle_path if os.path.isfile(idle_path) else template)
    tmp_objs = [o for o in bpy.data.objects if o not in before_tmp]
    tmp_acts = [a for a in bpy.data.actions if a not in before_act_tmp]

    target_dir = Vector((-0.55, -0.55, -0.62)).normalized()
    idle = next((a for a in tmp_acts if a.name.startswith("M2M_Idle")), None)
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
        m_pose = (t_arm.matrix_world @ pb_hr.matrix).to_3x3()
        m_rest = (t_arm.matrix_world @ t_arm.data.bones["hand_r"].matrix_local).to_3x3()
        delta_rot = m_pose @ m_rest.inverted()
        desired_idle_world = Vector((-0.42, -0.80, +0.42)).normalized()
        target_dir = (delta_rot.inverted() @ desired_idle_world).normalized()
        palm += delta_rot.inverted() @ Vector((+0.008, -0.006, +0.002))
        t_arm.animation_data.action = None
        for pb in t_arm.pose.bones:
            pb.matrix_basis.identity()
        bpy.context.view_layer.update()

    for o in tmp_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in tmp_acts:
        bpy.data.actions.remove(a)

    rot_q = Vector((0.0, 0.0, 1.0)).rotation_difference(target_dir)
    for so in sword_objs:
        for v in so.data.vertices:
            v.co = rot_q @ v.co + palm
        so.data.update()
        so.animation_data_clear()
        so.vertex_groups.clear()
        vg = so.vertex_groups.new(name="hand_r")
        vg.add([v.index for v in so.data.vertices], 1.0, "REPLACE")
        so.parent = t_arm
        mod = so.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = t_arm
    print("  + Attached Ember-Eastern faceted Great-Dao + EmberCore to hand_r palm!")


def render_verification_preview(t_arm, out_png):
    """Render a clean, denoised 3/4 studio check with soft front fill + stark-white rim light."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 960
    scene.render.image_settings.file_format = "PNG"

    world = bpy.data.worlds.new("_PreviewWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.11, 0.115, 0.145, 1.0)
        bg.inputs["Strength"].default_value = 1.10
    scene.world = world

    def add_sun(name, energy, rot_deg, color=(1, 1, 1), angle_deg=18.0):
        ld = bpy.data.lights.new(name, type="SUN")
        ld.energy = energy
        ld.color = color
        ld.angle = math.radians(angle_deg)
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = tuple(math.radians(a) for a in rot_deg)
        bpy.context.collection.objects.link(lo)
        return lo

    lights = [
        add_sun("_KeySun", 1.8, (22, 0, -24), (1.0, 0.98, 0.96), 24.0),
        add_sun("_FillSun", 0.9, (12, 0, 38), (0.86, 0.90, 1.0), 40.0),
        add_sun("_RimSun", 4.5, (14, 0, 132), (0.96, 0.99, 1.0), 6.0),
    ]

    cam_data = bpy.data.cameras.new("_PreviewCam")
    cam_data.lens = 55
    cam_obj = bpy.data.objects.new("_PreviewCam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    target = Vector((0.0, 0.0, 0.90))
    cam_pos = Vector((-1.45, -2.55, 1.12))
    cam_obj.location = cam_pos
    cam_obj.rotation_euler = (target - cam_pos).to_track_quat("-Z", "Y").to_euler()

    # Pose into M2M_Idle frame 20 if present so preview reflects real in-game stance
    anim = t_arm.animation_data
    prev_action = anim.action if anim else None
    if anim:
        idle_track = next((tr for tr in anim.nla_tracks if tr.name.startswith("M2M_Idle")), None)
        if idle_track and idle_track.strips:
            anim.action = idle_track.strips[0].action
            scene.frame_set(20)
            bpy.context.view_layer.update()

    Path(out_png).parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)
    print(f"  + Rendered 3/4 verification preview -> {out_png}")

    # Clean up temporary preview scene objects & restore rest pose
    if anim:
        anim.action = prev_action
    for pb in t_arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    for lo in lights:
        bpy.data.objects.remove(lo, do_unlink=True)
    bpy.data.objects.remove(cam_obj, do_unlink=True)
    bpy.data.worlds.remove(world, do_unlink=True)


def verify_export(path, profile, outline_mode="none", sword_style="ember-dao"):
    """Verify exported GLB header, 66-joint skinning, weights, and clips."""
    with path.open("rb") as stream:
        magic, version, length, size, chunk = struct.unpack("<4sIII4s", stream.read(20))
        if (magic, version, chunk) != (b"glTF", 2, b"JSON") or length != path.stat().st_size:
            raise ValueError(f"Invalid GLB header: {path}")
        data = json.loads(stream.read(size))

    clips = {a["name"] for a in data.get("animations", []) if a.get("channels")}
    missing = set(profile["clip_names"]) - clips
    if missing:
        raise ValueError(f"Missing exported animation clips: {sorted(missing)}")

    prefix = profile.get("mesh_prefix", "Boss")
    meshes = {n["name"]: n for n in data["nodes"] if "mesh" in n}
    required = [prefix + "_Body"]
    if outline_mode != "none":
        required.append(prefix + "_Outline")
    if profile.get("keep_sword"):
        required.append("Hero_Sword")
        if sword_style == "ember-dao":
            required.append("Hero_Sword_EmberCore")
        if outline_mode != "none":
            required.append("Hero_Sword_Outline")
    elif any(part in name.lower() for name in meshes for part in ("weapon", "sword", "club")):
        raise ValueError(f"Unexpected weapon in unarmed {profile['id']} export")

    skeleton = None
    for name in required:
        node = meshes.get(name)
        if node is None or "skin" not in node:
            raise ValueError(f"Missing skinned mesh: {name}")
        joints = set(data["skins"][node["skin"]]["joints"])
        if len(joints) != 66 or (skeleton is not None and skeleton != joints):
            raise ValueError(f"{name} must use the same 66 joints as the body")
        skeleton = joints
        for primitive in data["meshes"][node["mesh"]]["primitives"]:
            if not {"JOINTS_0", "WEIGHTS_0"}.issubset(primitive["attributes"]):
                raise ValueError(f"Missing exported vertex weights: {name}")


def build_ember_eastern_character(
    cfg,
    raw_dir,
    out_dir,
    mv_dir=None,
    outline_mode="none",
    sword_style="ember-dao",
    tex_size=1024,
    sharp_angle=42.0,
    pigment_clean=0.35,
    bake_normals=True,
    preview_out=None,
):
    bid = cfg["id"]
    raw_path = os.path.join(raw_dir, cfg["raw"])
    out_path = os.path.join(out_dir, cfg["out"])
    fit = dict(cfg["fit"])
    prefix = cfg.get("mesh_prefix", "Boss")
    template = cfg["template"]
    if not os.path.isfile(raw_path):
        raise FileNotFoundError(raw_path)
    if not os.path.isfile(template):
        raise FileNotFoundError(template)

    print(f"\n================ [EMBER-EASTERN: {bid.upper()}] ================")
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1) Load 66-bone Mesh2Motion armature & keep character's curated NLA animation clips
    bpy.ops.import_scene.gltf(filepath=template)
    t_arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    t_arm.name = f"{bid}_Armature"
    for o in list(bpy.data.objects):
        if o.type == "MESH":
            bpy.data.objects.remove(o, do_unlink=True)

    if "clip_names" in cfg:
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

    for pb in t_arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()

    # 2) Import raw Hunyuan3D mesh & normalize to H=1.72m with torso-spine Y alignment
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
    body_high.name = f"{prefix}_Body_High"

    bmin, bmax = m2m.get_world_bbox(body_high)
    s = 1.72 / max(1e-4, bmax.z - bmin.z)
    cx = (bmin.x + bmax.x) * 0.5
    cz = bmin.z
    cy_rough = (bmin.y + bmax.y) * 0.5
    for v in body_high.data.vertices:
        v.co.x = (v.co.x - cx) * s
        v.co.y = (v.co.y - cy_rough) * s
        v.co.z = (v.co.z - cz) * s
    shoulder_y_target = cfg.get("shoulder_y_target")
    if shoulder_y_target is not None:
        sh_vs = [
            v.co.y for v in body_high.data.vertices
            if 1.33 <= v.co.z <= 1.39 and 0.14 <= abs(v.co.x) <= 0.21
        ]
        if sh_vs:
            y_shift = shoulder_y_target - (sum(sh_vs) / len(sh_vs))
            for v in body_high.data.vertices:
                v.co.y += y_shift
    else:
        torso_vs = [v.co.y for v in body_high.data.vertices if 0.70 <= v.co.z <= 1.25 and abs(v.co.x) < 0.15]
        if torso_vs:
            torso_y = sum(torso_vs) / len(torso_vs)
            y_shift = 0.020 - torso_y
            for v in body_high.data.vertices:
                v.co.y += y_shift
    body_high.data.update()

    # 3) Fit 66-bone armature to exact 3D wrist, elbow & spread-leg landmarks
    lh_wrist, rh_wrist = measure_hand_targets(body_high, cfg.get("wrist_band"))
    horizontal_arms = cfg.get("horizontal_arms", False)
    two_stage_arms = cfg.get("two_stage_arms", False) and not horizontal_arms
    source_fit = dict(cfg.get("source_fit", SRC_BOSS_FIT))
    fit["spread_stance"] = True
    bones = t_arm.data.bones
    shoulder = bones["upperarm_l"].head_local
    source_fit["shoulder_x"] = abs(shoulder.x)
    source_fit["z_shoulder"] = shoulder.z
    source_fit["arm_len"] = (bones["hand_l"].head_local - shoulder).length

    if horizontal_arms:
        shoulder_z = (lh_wrist.z + rh_wrist.z) / 2.0
        for key in ("z_neck", "z_head"):
            fit[key] = min(1.71, fit[key] + shoulder_z - fit["z_shoulder"])
        fit["z_shoulder"] = shoulder_z
    else:
        lh_wrist = Vector((lh_wrist.x, lh_wrist.y, lh_wrist.z + 0.020))
        rh_wrist = Vector((rh_wrist.x, rh_wrist.y, rh_wrist.z + 0.020))
        fit["arm_min_z"] = max(fit["z_pelvis"] - 0.03, min(lh_wrist.z, rh_wrist.z) - 0.14)

    lh_elbow, rh_elbow = (None, None)
    if two_stage_arms:
        lh_elbow, rh_elbow = measure_elbow_targets(
            body_high, fit["z_shoulder"], lh_wrist, rh_wrist, torso_x=cfg.get("torso_clean_x", 0.145)
        )

    sh_l = Vector((fit["shoulder_x"], 0.065, fit["z_shoulder"]))
    sh_r = Vector((-fit["shoulder_x"], 0.065, fit["z_shoulder"]))
    if lh_elbow is not None and rh_elbow is not None:
        len_l = (lh_elbow - sh_l).length + (lh_wrist - lh_elbow).length
        len_r = (rh_elbow - sh_r).length + (rh_wrist - rh_elbow).length
        fit["arm_len"] = round(0.5 * (len_l + len_r), 4)
    else:
        fit["arm_len"] = round(0.5 * ((lh_wrist - sh_l).length + (rh_wrist - sh_r).length), 4)
    refit_boss_armature(t_arm, source_fit, fit)
    print(f"  + Refitted 66-bone armature (sh_x={fit['shoulder_x']:.3f}, sh_z={fit['z_shoulder']:.3f}, arm_len={fit['arm_len']:.3f}, 2stage={lh_elbow is not None})")

    # 4) Silhouette-preserving Decimate + Smooth-by-Angle + Tangent Normal Bake + 4-view Projection
    bpy.ops.object.select_all(action="DESELECT")
    body_high.select_set(True)
    bpy.context.view_layer.objects.active = body_high
    bpy.ops.object.duplicate()
    body = bpy.context.active_object
    body.name = f"{prefix}_Body"
    body.data = body.data.copy()
    body.data.name = body.name

    orig_tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    budget = cfg.get("tri_budget", 14000)
    if orig_tris > budget:
        dec = body.modifiers.new(name="Decimate", type="DECIMATE")
        dec.ratio = min(1.0, budget / max(1, orig_tris))
        dec.delimit = {"UV"}
        bpy.ops.object.modifier_apply(modifier=dec.name)
    final_tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    print(f"  + Decimated {orig_tris:,} -> {final_tris:,} tris (UV-preserving)")

    apply_smooth_with_bevel_normals(body, sharp_angle_deg=sharp_angle)

    if mv_dir and Path(mv_dir).is_dir():
        project_4view_onto_mesh(
            body,
            mv_dir,
            tex_size=tex_size,
            skip_side_arms=not horizontal_arms,
        )

    if pigment_clean > 0.0:
        clean_pigment_planes(body, strength=pigment_clean, sigma_color=0.11)

    if bake_normals:
        bake_clean_normal_map(body_high, body, f"{bid}_Normal", size=1024, strength=0.22)

    if bid == "hero":
        polish_hero_face_texture(body, tex_size=max(tex_size, 2048))

    configure_matte_painterly_material(body)
    bpy.data.objects.remove(body_high, do_unlink=True)

    # 5) Optional outline mesh (default: NONE for lineless Ember & Blade style)
    outline = None
    if outline_mode != "none":
        off = 0.0022 if outline_mode == "subtle" else 0.0040
        outline = make_outline(body, f"{prefix}_Outline", offset=off, dec_ratio=0.50)

    # 6) 3D A/T-pose alignment armature & Voxel-Proxy Bone Heat skinning
    bpy.ops.object.select_all(action="DESELECT")
    t_arm.select_set(True)
    bpy.context.view_layer.objects.active = t_arm
    bpy.ops.object.duplicate()
    a_arm = bpy.context.active_object
    a_arm.name = "Temp_APose_Arm"
    a_arm.animation_data_clear()

    if lh_elbow is not None and rh_elbow is not None:
        stage1_targets = [("upperarm_l", "lowerarm_l", lh_elbow), ("upperarm_r", "lowerarm_r", rh_elbow)]
    else:
        stage1_targets = [("upperarm_l", "hand_l", lh_wrist), ("upperarm_r", "hand_r", rh_wrist)]
    for suffix, side in (("l", 1), ("r", -1)):
        ankle = guardian_ankle(body, side, fit["z_ankle"])
        stage1_targets.append((f"thigh_{suffix}", f"foot_{suffix}", ankle))

    rotations = []
    for start, end, target in stage1_targets:
        rot = compute_arm_local_quat(a_arm, start, end, target)
        if rot.angle > math.radians(2):
            rotations.append((start, rot))

    bpy.ops.object.mode_set(mode="POSE")
    for bname, q in rotations:
        pb = a_arm.pose.bones[bname]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = q
    bpy.context.view_layer.update()
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Stage 2: Align forearms from exact 3D elbows to exact 3D wrists so T-pose arms unfold completely straight
    if lh_elbow is not None and rh_elbow is not None:
        stage2_rots = []
        for start, end, target in (("lowerarm_l", "hand_l", lh_wrist), ("lowerarm_r", "hand_r", rh_wrist)):
            rot = compute_arm_local_quat(a_arm, start, end, target)
            if rot.angle > math.radians(2):
                stage2_rots.append((start, rot))
        if stage2_rots:
            bpy.ops.object.mode_set(mode="POSE")
            for bname, q in stage2_rots:
                pb = a_arm.pose.bones[bname]
                pb.rotation_mode = "QUATERNION"
                pb.rotation_quaternion = q
            bpy.context.view_layer.update()
            bpy.ops.pose.armature_apply(selected=False)
            bpy.ops.object.mode_set(mode="OBJECT")
            rotations.extend(stage2_rots)

    m2m.skin_via_voxel_heat(body, a_arm, fit)

    # Strip torso/belt arm-weight bleed on A-pose characters (prevents belt kinking)
    if not horizontal_arms:
        arm_vg_names = {"clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r"}
        arm_vgs = [vg for vg in body.vertex_groups if vg.name in arm_vg_names]
        spine_vg = body.vertex_groups.get("spine_02") or body.vertex_groups.get("spine_01")
        pelvis_vg = body.vertex_groups.get("pelvis") or spine_vg
        arm_floor_z = cfg.get("arm_floor_z", 0.78)
        coat_clean_z = cfg.get("coat_clean_z", 0.0)
        coat_clean_x = cfg.get("coat_clean_x", 0.0)
        cleaned = 0
        for v in body.data.vertices:
            in_torso = (v.co.z < cfg["torso_clean_z"] and abs(v.co.x) < cfg["torso_clean_x"])
            in_coat = (v.co.z < coat_clean_z and abs(v.co.x) < coat_clean_x)
            below_arms = (v.co.z < arm_floor_z and abs(v.co.x) < 0.45)
            if in_torso or in_coat or below_arms:
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
                        tgt = pelvis_vg if v.co.z < fit["z_pelvis"] + 0.10 else spine_vg
                        if tgt:
                            tgt.add([v.index], 1.0, "REPLACE")
        print(f"  + Stripped arm-weight bleed from {cleaned} torso/waist verts")

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

    meshes_to_bake = [body]
    if outline is not None:
        m2m.transfer_vertex_weights(body, outline)
        outline.parent = a_arm
        mod_o = outline.modifiers.new(name="Armature", type="ARMATURE")
        mod_o.object = a_arm
        meshes_to_bake.append(outline)

    # 7) Inverse-rotate A-pose -> T-pose & bind cleanly to animated t_arm
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

    for o in meshes_to_bake:
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

    # 8) Attach weapon (Hero only)
    if cfg.get("keep_sword"):
        if sword_style == "ember-dao":
            attach_ember_great_dao(t_arm, body, template, outline_mode=outline_mode)
        else:
            attach_sword(t_arm, body, template, template)

    # 9) Optional 3/4 Blender verification preview
    if preview_out:
        render_verification_preview(t_arm, preview_out)

    # 10) Export GLB (lossless PNG for baked normal map + crisp base color)
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
        export_image_format="WEBP" if bpy.app.version >= (4, 0, 0) else "AUTO",
    )
    print(f"  [SAVED EMBER-EASTERN] {out_path} ({os.path.getsize(out_path):,} bytes)")


def main():
    profiles = character_profiles()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", required=True, choices=profiles)
    parser.add_argument("--raw-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--mv-dir", type=Path, default=None, help="4-view turnaround folder (front/back/left/right.png)")
    parser.add_argument("--pose", choices=("apose", "tpose"), default=None, help="Override raw mesh arm pose")
    parser.add_argument("--outline-mode", choices=("none", "subtle", "ink"), default="none")
    parser.add_argument("--sword-style", choices=("ember-dao", "template"), default="ember-dao")
    parser.add_argument("--tex-size", type=int, default=1024)
    parser.add_argument("--sharp-angle", type=float, default=42.0)
    parser.add_argument("--pigment-clean", type=float, default=0.35)
    parser.add_argument("--no-normal-bake", action="store_true")
    parser.add_argument("--preview-out", type=Path, default=None)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

    args.out_dir.mkdir(parents=True, exist_ok=True)
    profile = profiles[args.only]
    is_horizontal = (args.pose == "tpose") if args.pose else (args.only != "hero")
    profile["horizontal_arms"] = is_horizontal
    profile["wrist_band"] = (1.03, 1.52) if is_horizontal else (0.74, 1.12)

    mv_dir = args.mv_dir or (DEFAULT_MV_ROOT / f"{args.only}_mv")
    if not mv_dir.is_dir():
        mv_dir = None

    with tempfile.TemporaryDirectory(dir=args.out_dir) as temp:
        staged = Path(temp) / profile["out"]
        build_ember_eastern_character(
            profile,
            raw_dir=str(args.raw_dir),
            out_dir=temp,
            mv_dir=str(mv_dir) if mv_dir else None,
            outline_mode=args.outline_mode,
            sword_style=args.sword_style,
            tex_size=args.tex_size,
            sharp_angle=args.sharp_angle,
            pigment_clean=args.pigment_clean,
            bake_normals=not args.no_normal_bake,
            preview_out=str(args.preview_out) if args.preview_out else None,
        )
        verify_export(staged, profile, outline_mode=args.outline_mode, sword_style=args.sword_style)
        destination = args.out_dir / profile["out"]
        staged.replace(destination)
        print(f"[VERIFIED] {destination}")


if __name__ == "__main__":
    main()
