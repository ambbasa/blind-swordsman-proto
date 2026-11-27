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
    "hero": 18000,
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

    # 8-head sleek Ember-Eastern hero overrides (measured directly from hero_raw.glb + 2D concept shoulder line):
    # - Natural straight athletic shoulders (shoulder_x=0.184m, z_shoulder=1.398m) matching the 2D turnaround
    # - Keep torso_clean below the true armpit split (z=1.14m, torso_max=0.145m) so underarm skin never stretches
    if "hero" in profiles:
        hp = profiles["hero"]
        hp["fit"]["shoulder_x"] = 0.184
        hp["fit"]["z_shoulder"] = 1.398
        hp["fit"]["z_neck"] = 1.430
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


def weld_mesh_watertight(mesh_obj, dist=1e-4):
    """Weld unwelded glTF UV-seam vertices BEFORE Decimate while keeping loop UVs intact."""
    bm = bmesh.new()
    bm.from_mesh(mesh_obj.data)
    v_before = len(bm.verts)
    b_before = sum(1 for e in bm.edges if e.is_boundary)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    v_after = len(bm.verts)
    b_after = sum(1 for e in bm.edges if e.is_boundary)
    bm.to_mesh(mesh_obj.data)
    bm.free()
    mesh_obj.data.update()
    print(
        f"  + Welded glTF seams on {mesh_obj.name}: "
        f"verts {v_before:,}->{v_after:,}, boundary edges {b_before:,}->{b_after:,}"
    )


def smooth_hero_back_shelf(mesh_obj, iterations=8):
    """Smooth out Hunyuan3D's unintended curved mid-back shelf (z=1.09..1.22) BEFORE 4-view projection
    so the black tunic flows cleanly down into the waist sash just like hero_mv/back.png.
    """
    bm = bmesh.new()
    bm.from_mesh(mesh_obj.data)
    bm.verts.ensure_lookup_table()
    targets = [
        v for v in bm.verts
        if abs(v.co.x) < 0.155 and v.co.y > 0.055 and 1.07 <= v.co.z <= 1.24
    ]
    if targets:
        tset = set(targets)
        for _ in range(iterations):
            new_y = {}
            for v in targets:
                nbs = [e.other_vert(v) for e in v.link_edges]
                if not nbs:
                    continue
                # Smooth mainly depth (Y) with mild Z relaxation, stronger in center of shelf
                cx_w = max(0.0, 1.0 - (abs(v.co.x) / 0.155) ** 2)
                cz_w = math.sin(max(0.0, min(1.0, (v.co.z - 1.07) / 0.17)) * math.pi)
                w = 0.55 * cx_w * cz_w
                avg_y = sum(nb.co.y for nb in nbs) / len(nbs)
                new_y[v] = v.co.y * (1.0 - w) + avg_y * w
            for v, yv in new_y.items():
                v.co.y = yv
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh_obj.data)
    bm.free()
    mesh_obj.data.update()
    print(f"  + Smoothed mid-back tunic shelf on {len(targets):,} verts (clean waist sash transition)")


def sculpt_hero_shoulder_line(mesh_obj):
    """Conform upper shoulder contour AFTER 4-view texture projection to a straight, natural athletic line
    (shaving off any trapezius hump and lifting slumped outer deltoids cleanly, watertight & UV-preserving).
    """
    def _ss(e0, e1, v):
        t = max(0.0, min(1.0, (v - e0) / max(1e-6, e1 - e0)))
        return t * t * (3.0 - 2.0 * t)

    bins = {}
    for v in mesh_obj.data.vertices:
        ax = abs(v.co.x)
        if 0.065 <= ax <= 0.25 and 1.30 <= v.co.z <= 1.49:
            b = int(round(ax * 100.0))
            if b not in bins or v.co.z > bins[b]:
                bins[b] = v.co.z

    sh_moved = 0
    for v in mesh_obj.data.vertices:
        ax = abs(v.co.x)
        z = v.co.z
        if 0.068 <= ax <= 0.28 and 1.24 <= z <= 1.48:
            z_line = 1.436 - 0.21 * (ax - 0.068)
            b = int(round(min(0.25, ax) * 100.0))
            z_cur_top = bins.get(b, z_line)
            dz_needed = max(-0.018, min(+0.028, z_line - z_cur_top))
            mx = _ss(0.068, 0.098, ax) * (1.0 - _ss(0.215, 0.280, ax))
            mz = _ss(1.24, 1.36, z) * (1.0 - _ss(1.455, 1.485, z))
            w = mx * mz
            if w > 1e-4:
                v.co.z += dz_needed * w
                out_w = _ss(0.140, 0.195, ax) * (1.0 - _ss(0.225, 0.280, ax)) * mz
                if out_w > 1e-4:
                    sgn = 1.0 if v.co.x >= 0.0 else -1.0
                    v.co.x += sgn * 0.008 * out_w
                sh_moved += 1
    mesh_obj.data.update()
    print(f"  + Refined straight athletic shoulder line ({sh_moved:,} verts)")


def slim_hero_head_and_neck(mesh_obj):
    """Match the 2D turnaround's exact chin height, under-chin neck separation, and natural masculine jawline.

    Avoids X-only narrowing (which elongates the face); instead lifts Hunyuan3D's drooped chin bottom
    up to the true 2D chin line under the mouth and tucks the throat back for crisp jaw-neck separation.
    """
    def _ss(e0, e1, v):
        t = max(0.0, min(1.0, (v - e0) / max(1e-6, e1 - e0)))
        return t * t * (3.0 - 2.0 * t)

    head_ys = [v.co.y for v in mesh_obj.data.vertices if v.co.z >= 1.54]
    head_cy = sum(head_ys) / len(head_ys) if head_ys else 0.0
    neck_ys = [v.co.y for v in mesh_obj.data.vertices if 1.43 <= v.co.z <= 1.50 and abs(v.co.x) < 0.08]
    neck_cy = sum(neck_ys) / len(neck_ys) if neck_ys else head_cy

    head_moved = 0
    for v in mesh_obj.data.vertices:
        ax = abs(v.co.x)
        z = v.co.z

        # 1) Lift drooped chin/lower-jaw bottom UP (+2.2cm peak at z~1.50) to match the 2D turnaround chin line
        if 1.460 <= z <= 1.575 and ax < 0.085:
            # Front/side of chin & jaw (y < head_cy + 0.025)
            front_w = 1.0 - _ss(head_cy + 0.005, head_cy + 0.045, v.co.y)
            chin_z_w = _ss(1.460, 1.498, z) * (1.0 - _ss(1.522, 1.575, z))
            chin_x_w = 1.0 - _ss(0.052, 0.085, ax)
            cw = front_w * chin_z_w * chin_x_w
            if cw > 1e-4:
                v.co.z += 0.022 * cw
                head_moved += 1

        # 2) Tuck throat directly beneath the lifted chin (+1.2cm toward +Y) & gently slim neck (-8%)
        if 1.425 <= z <= 1.515 and ax < 0.082:
            nw = _ss(1.425, 1.452, z) * (1.0 - _ss(1.492, 1.515, z)) * (1.0 - _ss(0.052, 0.082, ax))
            if nw > 1e-4:
                v.co.x *= 1.0 - 0.08 * nw
                v.co.y = neck_cy + (v.co.y - neck_cy) * (1.0 - 0.08 * nw)
                # Carve crisp under-chin throat recess on the front (-Y) side
                throat_front = 1.0 - _ss(neck_cy - 0.015, neck_cy + 0.015, v.co.y)
                v.co.y += 0.012 * nw * throat_front
                head_moved += 1

        # 3) Very gentle natural head slimming (-4% X/Y only, preserving masculine cheekbone/jaw width)
        if z >= 1.505:
            hw = _ss(1.505, 1.555, z)
            v.co.x *= 1.0 - 0.04 * hw
            v.co.y = head_cy + (v.co.y - head_cy) * (1.0 - 0.04 * hw)
            head_moved += 1

    mesh_obj.data.update()
    print(f"  + Matched 2D chin line, jaw-neck separation & natural head ratio ({head_moved:,} verts)")


def refit_hero_hand_bones(t_arm, hand_scale=0.78, z_shoulder=1.412):
    """Raise hero clavicles to heroic horizontal line and scale/connect 40 finger bones around each wrist."""
    bpy.ops.object.select_all(action="DESELECT")
    t_arm.select_set(True)
    bpy.context.view_layer.objects.active = t_arm
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = t_arm.data.edit_bones
    saved_rolls = {eb.name: eb.roll for eb in ebones}
    finger_prefixes = ("thumb_", "index_", "middle_", "ring_", "pinky_")

    # Keep clavicles centered inside the upper chest (never poking out the front V-collar!) so Bone Heat succeeds 100%
    for suffix in ("l", "r"):
        cl = ebones.get(f"clavicle_{suffix}")
        if cl is not None:
            cl.head.y = 0.015
            cl.head.z = z_shoulder - 0.022
            cl.tail.z = z_shoulder
            cl.roll = saved_rolls[cl.name]

    for suffix in ("l", "r"):
        hb = ebones.get(f"hand_{suffix}")
        if hb is None:
            continue
        h0 = hb.head.copy()
        for eb in ebones:
            if eb.name.endswith(f"_{suffix}") and eb.name.startswith(finger_prefixes):
                eb.head = h0 + (eb.head - h0) * hand_scale
                eb.tail = h0 + (eb.tail - h0) * hand_scale
                eb.roll = saved_rolls[eb.name]
        # Span hand bone cleanly across the refitted palm to middle MCP
        mid1 = ebones.get(f"middle_01_{suffix}")
        if mid1 is not None:
            axis = (hb.tail - hb.head).normalized()
            palm_len = max(0.052, (mid1.head - h0).dot(axis) * 0.88)
            hb.tail = h0 + axis * palm_len
            hb.roll = saved_rolls[hb.name]

        # Physically connect every finger phalanx chain (01 -> 02 -> 03 -> 04_leaf) so joints never detach
        for fname in ("thumb", "index", "middle", "ring", "pinky"):
            for idx_n in ("02", "03", "04_leaf"):
                eb_c = ebones.get(f"{fname}_{idx_n}_{suffix}")
                if eb_c is not None and eb_c.parent is not None:
                    eb_c.head = eb_c.parent.tail.copy()
                    eb_c.use_connect = True
                    eb_c.roll = saved_rolls[eb_c.name]

    bpy.ops.object.mode_set(mode="OBJECT")
    # Remove oversized M2M icosphere custom shapes on finger/hand bones so bones read cleanly as connected joints
    t_arm.data.display_type = "OCTAHEDRAL"
    for pb in t_arm.pose.bones:
        if any(pb.name.startswith(p) for p in ("hand_", "thumb_", "index_", "middle_", "ring_", "pinky_")):
            pb.custom_shape = None
    print(f"  + Refitted & connected 40 hero finger bones (scale={hand_scale:.2f}, exact rolls preserved)")


def _make_hero_hands_texture(img_name="Hero_Hands_BaseColor", size=256):
    """Create a crisp 256x256 matte painterly texture for Hero_Hands (left half: charcoal glove + crimson trim, right half: porcelain fingers)."""
    old = bpy.data.images.get(img_name)
    if old is not None:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(img_name, width=size, height=size, alpha=True)
    arr = np.zeros((size, size, 4), dtype=np.float32)
    half = size // 2

    # UV layout:
    # u in [0.0, 0.5): matte ink-charcoal fingerless glove + refined dark crimson cuff/knuckle piping
    # u in [0.5, 1.0): warm porcelain skin + subtle warm-rose knuckle tint + pale nail cap
    for y in range(size):
        v = y / max(1, size - 1)
        # Left half: glove (v=0 wrist cuff -> v=1 knuckle cuff)
        if v < 0.12 or v > 0.92:
            # Refined dark crimson silk piping matching hero's shoulder/waist sash
            r, g, b = 0.40, 0.075, 0.095
        else:
            # Matte charcoal cloth/leather with subtle tonal plane lift toward knuckles
            lift = 0.022 * math.sin(v * math.pi)
            r, g, b = 0.098 + lift, 0.095 + lift, 0.114 + lift * 1.1
        arr[y, :half, 0] = r
        arr[y, :half, 1] = g
        arr[y, :half, 2] = b
        arr[y, :half, 3] = 1.0

        # Right half: porcelain fingers (v=0 MCP base -> v=1 fingertip)
        # Warm porcelain base sampled from hero face palette
        sr, sg, sb = 0.85, 0.72, 0.63
        # Subtle warm-rose knuckle shading at PIP (~0.38) and DIP (~0.68)
        k_pip = math.exp(-((v - 0.38) / 0.065) ** 2)
        k_dip = math.exp(-((v - 0.68) / 0.055) ** 2)
        k_amt = 0.075 * k_pip + 0.060 * k_dip
        sr -= k_amt * 0.45
        sg -= k_amt * 1.05
        sb -= k_amt * 1.15
        # Soft fingertip/nail highlight near v > 0.86
        if v > 0.84:
            nt = min(1.0, (v - 0.84) / 0.12)
            sr = sr * (1.0 - nt * 0.25) + 0.91 * (nt * 0.25)
            sg = sg * (1.0 - nt * 0.25) + 0.79 * (nt * 0.25)
            sb = sb * (1.0 - nt * 0.25) + 0.72 * (nt * 0.25)
        # Subtle palmar crease darkening on inner edge of right half (u in [0.50..0.64])
        arr[y, half:, 0] = sr
        arr[y, half:, 1] = sg
        arr[y, half:, 2] = sb
        arr[y, half:, 3] = 1.0

    # Gently shade palmar side (left strip of right half) for readable finger separation
    palm_strip = int(size * 0.12)
    arr[:, half : half + palm_strip, 0] *= 0.88
    arr[:, half : half + palm_strip, 1] *= 0.85
    arr[:, half : half + palm_strip, 2] *= 0.84

    img.pixels.foreach_set(arr.ravel())
    img.pack()
    return img


def replace_hero_hands_articulated(body, t_arm):
    """Trim Hunyuan3D's blobby fused hands at the wrist cuffs (keeping Hero_Body 100% watertight)
    and build clean articulated 5-finger fingerless-glove hands (`Hero_Hands`) rigged 1:1 to all 30 finger bones.
    """
    # 1) Razor-clean planar slice of blobby fused hands on Hero_Body at each wrist cuff (0 jagged flaps!)
    bm_body = bmesh.new()
    bm_body.from_mesh(body.data)
    bm_body.verts.ensure_lookup_table()
    bm_body.edges.ensure_lookup_table()
    bm_body.faces.ensure_lookup_table()
    uv_body = bm_body.loops.layers.uv.active

    cut_limits = {}
    for suffix, sgn in (("r", -1.0), ("l", 1.0)):
        hb = t_arm.data.bones.get(f"hand_{suffix}")
        if hb is None:
            continue
        cut_x = abs(hb.head_local.x) - 0.014
        cut_limits[suffix] = (sgn, cut_x, hb.head_local.copy())

        # Collect only arm geometry on this side (z > 1.05, sgn*x > cut_x - 0.14) and bisect cleanly
        arm_faces = [
            f for f in bm_body.faces
            if any(v.co.z > 1.05 and sgn * v.co.x > cut_x - 0.14 for v in f.verts)
        ]
        arm_edges = list({e for f in arm_faces for e in f.edges})
        arm_verts = list({v for f in arm_faces for v in f.verts})
        if arm_faces:
            bmesh.ops.bisect_plane(
                bm_body,
                geom=arm_faces + arm_edges + arm_verts,
                dist=1e-4,
                plane_co=Vector((sgn * cut_x, 0.0, 1.36)),
                plane_no=Vector((sgn, 0.0, 0.0)),
                use_snap_center=False,
                clear_outer=True,
                clear_inner=False,
            )

    # Remove any isolated vertices left behind
    loose = [v for v in bm_body.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm_body, geom=loose, context="VERTS")

    # Cleanly cap the recessed wrist cuff openings so Hero_Body stays 100% watertight (0 boundary edges)
    for suffix, (sgn, cut_x, h_head) in cut_limits.items():
        b_edges = [
            e for e in bm_body.edges
            if e.is_boundary
            and e.verts[0].co.z > 1.05
            and sgn * e.verts[0].co.x > cut_x - 0.09
        ]
        if not b_edges:
            continue
        b_verts = list({v for e in b_edges for v in e.verts})
        center_co = sum((v.co for v in b_verts), Vector((0.0, 0.0, 0.0))) / len(b_verts)
        # Tuck cap slightly inward along forearm so the dark sleeve cuff reads as hollow around the glove
        center_co.x -= sgn * 0.010
        v_cap = bm_body.verts.new(center_co)
        # Sample dark cuff UV from boundary loops
        sample_uv = Vector((0.5, 0.5))
        if uv_body is not None:
            for e in b_edges:
                if e.link_loops:
                    sample_uv = e.link_loops[0][uv_body].uv.copy()
                    break
        for e in b_edges:
            # Preserve consistent winding against existing adjacent face
            lp = e.link_loops[0] if e.link_loops else None
            if lp is not None:
                v0, v1 = lp.vert, lp.link_loop_next.vert
                try:
                    nf = bm_body.faces.new((v1, v0, v_cap))
                    if uv_body is not None:
                        for nl in nf.loops:
                            nl[uv_body].uv = sample_uv
                except ValueError:
                    pass

    bmesh.ops.recalc_face_normals(bm_body, faces=bm_body.faces)
    body_b_after = sum(1 for e in bm_body.edges if e.is_boundary)
    bm_body.to_mesh(body.data)
    bm_body.free()
    body.data.update()

    # Ensure newly added cuff cap vertices carry clean lowerarm weight
    for suffix, (sgn, cut_x, _) in cut_limits.items():
        la_vg = body.vertex_groups.get(f"lowerarm_{suffix}")
        if la_vg is None:
            continue
        for v in body.data.vertices:
            if v.co.z > 1.05 and sgn * v.co.x > cut_x - 0.06 and not v.groups:
                la_vg.add([v.index], 1.0, "REPLACE")

    # 2) Build Hero_Hands: watertight sculpted fingerless-glove palm + 5 articulated 3-phalanx fingers per hand
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    vert_weights = []  # parallel list of dict[bone_name, float]

    def add_v(co, wdict):
        v = bm.verts.new(co)
        v.index = len(vert_weights)
        vert_weights.append(dict(wdict))
        return v

    def add_closed_loft(rings_data, u_range, v_vals, flip_winding=False):
        """rings_data: list of (ring_verts, v_coord). Creates smooth closed watertight tube with end caps."""
        ring_vs = []
        for pts_w in rings_data:
            rv = [add_v(co, wd) for (co, wd) in pts_w]
            ring_vs.append(rv)
        u0, u1 = u_range
        n_ring = len(ring_vs[0])

        for ri in range(len(ring_vs) - 1):
            r0, r1 = ring_vs[ri], ring_vs[ri + 1]
            v0, v1 = v_vals[ri], v_vals[ri + 1]
            for j in range(n_ring):
                jn = (j + 1) % n_ring
                ua = u0 + (u1 - u0) * (j / n_ring)
                ub = u0 + (u1 - u0) * ((j + 1) / n_ring)
                verts_q = (r0[j], r0[jn], r1[jn], r1[j]) if not flip_winding else (r0[jn], r0[j], r1[j], r1[jn])
                uvs_q = [(ua, v0), (ub, v0), (ub, v1), (ua, v1)] if not flip_winding else [(ub, v0), (ua, v0), (ua, v1), (ub, v1)]
                f = bm.faces.new(verts_q)
                f.smooth = True
                for lp, uv in zip(f.loops, uvs_q):
                    lp[uv_layer].uv = uv

        # Watertight end caps using ring centroids
        for end_idx, (rv, vc, rev) in enumerate([(ring_vs[0], v_vals[0], not flip_winding), (ring_vs[-1], v_vals[-1], flip_winding)]):
            c_co = sum((v.co for v in rv), Vector((0.0, 0.0, 0.0))) / n_ring
            # Average weights of ring for cap center
            c_w = {}
            for v in rv:
                for bn, wt in vert_weights[v.index].items():
                    c_w[bn] = c_w.get(bn, 0.0) + wt / n_ring
            v_c = add_v(c_co, c_w)
            u_mid = 0.5 * (u0 + u1)
            for j in range(n_ring):
                jn = (j + 1) % n_ring
                tri = (rv[jn], rv[j], v_c) if rev else (rv[j], rv[jn], v_c)
                f = bm.faces.new(tri)
                f.smooth = True
                for lp in f.loops:
                    lp[uv_layer].uv = (u_mid, vc)

    finger_specs = [
        # (name, r_base_x, r_base_z, r_pip, r_dip, r_tip, glove_cut_t1)
        ("index",  0.0086, 0.0090, 0.0074, 0.0064, 0.0048, 0.18),
        ("middle", 0.0090, 0.0095, 0.0078, 0.0067, 0.0051, 0.18),
        ("ring",   0.0084, 0.0089, 0.0073, 0.0063, 0.0047, 0.18),
        ("pinky",  0.0072, 0.0076, 0.0062, 0.0054, 0.0041, 0.18),
        ("thumb",  0.0128, 0.0124, 0.0102, 0.0088, 0.0068, 0.42),
    ]

    for suffix, sgn in (("r", -1.0), ("l", 1.0)):
        hb = t_arm.data.bones[f"hand_{suffix}"]
        h0 = hb.head_local.copy()
        la_name = f"lowerarm_{suffix}"
        h_name = f"hand_{suffix}"

        # Measure actual refitted MCP knuckle coordinates on this hand
        idx_h = t_arm.data.bones[f"index_01_{suffix}"].head_local
        mid_h = t_arm.data.bones[f"middle_01_{suffix}"].head_local
        rng_h = t_arm.data.bones[f"ring_01_{suffix}"].head_local
        pnk_h = t_arm.data.bones[f"pinky_01_{suffix}"].head_local
        thm_h = t_arm.data.bones[f"thumb_01_{suffix}"].head_local

        palm_len = abs(mid_h.x - h0.x)
        y_idx = idx_h.y - h0.y  # negative (-Y = thumb/index side)
        y_pnk = pnk_h.y - h0.y  # positive (+Y = pinky side)
        z_knk = mid_h.z - h0.z

        # --- A) Sculpted anatomical palm + fingerless glove cuff (tapered cleanly to MCP knuckle arch!) ---
        # Stations along sgn*(x - h0.x) from tucked wrist cuff (-0.024) to MCP knuckle bridge (palm_len - 0.002)
        n_palm_sides = 16
        palm_stations = [
            # (x_off, y_min, y_max, z_bot, z_top, v_uv, w_lowerarm)
            (-0.024, -0.020, +0.020, -0.015, +0.015, 0.04, 0.90),
            (-0.010, -0.022, +0.021, -0.016, +0.016, 0.11, 0.60),
            (+0.005, -0.024, +0.022, -0.016, +0.016, 0.20, 0.22),
            (+0.022, y_idx * 0.86 - 0.005, y_pnk * 0.84 + 0.005, -0.018, +0.015, 0.42, 0.0),
            (+0.044, y_idx * 1.00 - 0.006, y_pnk * 0.95 + 0.005, -0.016, +0.014, 0.68, 0.0),
            (palm_len - 0.012, y_idx - 0.006, y_pnk + 0.006, z_knk - 0.012, z_knk + 0.011, 0.86, 0.0),
            (palm_len - 0.004, y_idx - 0.005, y_pnk + 0.005, z_knk - 0.009, z_knk + 0.009, 0.94, 0.0),
            (palm_len - 0.000, y_idx - 0.002, y_pnk + 0.002, z_knk - 0.005, z_knk + 0.005, 0.98, 0.0),
        ]
        palm_rings = []
        palm_vs = []
        for x_off, ymin, ymax, zbot, ztop, vc, w_la in palm_stations:
            cy = 0.5 * (ymin + ymax)
            ry = 0.5 * (ymax - ymin)
            cz = 0.5 * (zbot + ztop)
            rz = 0.5 * (ztop - zbot)
            wdict = {h_name: 1.0 - w_la}
            if w_la > 1e-3:
                wdict[la_name] = w_la
            ring = []
            for k in range(n_palm_sides):
                ang = (2.0 * math.pi * k) / n_palm_sides
                ca, sa = math.cos(ang), math.sin(ang)
                # Slightly squircle cross-section for crisp stylized hand planes + palm cupping
                sy = math.copysign(abs(ca) ** 0.84, ca)
                sz = math.copysign(abs(sa) ** 0.86, sa)
                py = h0.y + cy + ry * sy
                pz = h0.z + cz + rz * sz
                # Anatomical knuckle arch curve: pinky MCP sits slightly further back than middle MCP
                arch_x = x_off
                if x_off > palm_len - 0.016:
                    # Smoothly recess pinky/index corners so palm never overhangs knuckle skin
                    edge_t = max(0.0, (py - mid_h.y) / max(1e-4, y_pnk - (mid_h.y - h0.y)))
                    arch_x -= 0.006 * (edge_t ** 2)
                # Muscular thenar pad bulge on thumb-palm side (mid-palm, -Y, -Z)
                if 0.015 < x_off < 0.052 and ca < -0.2 and sa < -0.1:
                    pz -= 0.0045 * (-ca) * (-sa)
                    py -= 0.0025 * (-ca)
                # Subtle dorsal knuckle ridges near knuckle line
                if x_off > palm_len - 0.014 and sa > 0.35:
                    for fk_h in (idx_h, mid_h, rng_h, pnk_h):
                        dy = abs(py - fk_h.y)
                        if dy < 0.007:
                            pz += 0.0018 * (1.0 - dy / 0.007) * sa
                px = h0.x + sgn * arch_x
                ring.append((Vector((px, py, pz)), wdict))
            palm_rings.append(ring)
            palm_vs.append(vc)

        add_closed_loft(palm_rings, u_range=(0.04, 0.46), v_vals=palm_vs, flip_winding=(sgn < 0))

        # --- B) 5 Articulated 3-Phalanx Fingers (1:1 weighted to *_01, *_02, *_03) ---
        n_f_sides = 12
        for fname, rbx, rbz, rpip, rdip, rtip, glove_t1 in finger_specs:
            b1_n = f"{fname}_01_{suffix}"
            b2_n = f"{fname}_02_{suffix}"
            b3_n = f"{fname}_03_{suffix}"
            b1 = t_arm.data.bones[b1_n]
            b2 = t_arm.data.bones[b2_n]
            b3 = t_arm.data.bones[b3_n]

            # Build 15 cross-section stations with 3 dense joint rings across MCP, PIP, DIP!
            # Each tuple: (bone, t_along, rx, rz, v_uv, weight_dict)
            if fname == "thumb":
                stations = [
                    (b1, -0.22, rbx * 1.18, rbz * 1.15, 0.02, {h_name: 0.72, b1_n: 0.28}),
                    (b1,  0.00, rbx * 1.08, rbz * 1.05, 0.08, {h_name: 0.38, b1_n: 0.62}),
                    (b1,  0.35, rbx * 0.98, rbz * 0.96, 0.18, {b1_n: 1.0}),
                    (b1,  0.76, rpip * 1.06, rpip * 1.02, 0.30, {b1_n: 0.88, b2_n: 0.12}),
                    (b1,  0.94, rpip * 1.08, rpip * 1.06, 0.36, {b1_n: 0.62, b2_n: 0.38}),
                    (b2,  0.06, rpip * 1.05, rpip * 1.02, 0.42, {b1_n: 0.32, b2_n: 0.68}),
                    (b2,  0.48, (rpip + rdip) * 0.49, (rpip + rdip) * 0.48, 0.54, {b2_n: 1.0}),
                    (b2,  0.86, rdip * 1.04, rdip * 1.04, 0.65, {b2_n: 0.75, b3_n: 0.25}),
                    (b2,  1.00, rdip * 1.07, rdip * 1.05, 0.70, {b2_n: 0.50, b3_n: 0.50}),
                    (b3,  0.12, rdip * 1.00, rdip * 0.98, 0.75, {b2_n: 0.22, b3_n: 0.78}),
                    (b3,  0.55, (rdip + rtip) * 0.50, (rdip + rtip) * 0.46, 0.85, {b3_n: 1.0}),
                    (b3,  0.92, rtip * 0.92, rtip * 0.82, 0.94, {b3_n: 1.0}),
                    (b3,  1.10, rtip * 0.46, rtip * 0.40, 0.99, {b3_n: 1.0}),
                ]
            else:
                stations = [
                    (b1, -0.24, rbx * 1.06, rbz * 1.04, 0.02, {h_name: 0.85, b1_n: 0.15}),
                    (b1,  0.00, rbx * 1.04, rbz * 1.04, 0.08, {h_name: 0.48, b1_n: 0.52}),
                    (b1,  0.22, rbx * 0.96, rbz * 0.95, 0.16, {b1_n: 0.95, h_name: 0.05}),
                    (b1,  0.60, (rbx + rpip) * 0.47, (rbz + rpip) * 0.47, 0.28, {b1_n: 1.0}),
                    (b1,  0.88, rpip * 1.04, rpip * 1.06, 0.35, {b1_n: 0.78, b2_n: 0.22}),
                    (b1,  1.00, rpip * 1.07, rpip * 1.08, 0.39, {b1_n: 0.50, b2_n: 0.50}),
                    (b2,  0.12, rpip * 1.00, rpip * 1.00, 0.43, {b1_n: 0.22, b2_n: 0.78}),
                    (b2,  0.52, (rpip + rdip) * 0.48, (rpip + rdip) * 0.48, 0.55, {b2_n: 1.0}),
                    (b2,  0.88, rdip * 1.03, rdip * 1.04, 0.65, {b2_n: 0.76, b3_n: 0.24}),
                    (b2,  1.00, rdip * 1.06, rdip * 1.06, 0.69, {b2_n: 0.50, b3_n: 0.50}),
                    (b3,  0.12, rdip * 0.98, rdip * 0.96, 0.73, {b2_n: 0.24, b3_n: 0.76}),
                    (b3,  0.52, (rdip + rtip) * 0.50, (rdip + rtip) * 0.45, 0.84, {b3_n: 1.0}),
                    (b3,  0.90, rtip * 0.90, rtip * 0.78, 0.93, {b3_n: 1.0}),
                    (b3,  1.08, rtip * 0.44, rtip * 0.38, 0.98, {b3_n: 1.0}),
                ]

            f_rings = []
            f_vs = []
            for bone, t_al, rx, rz, vc, wdict in stations:
                m = bone.matrix_local.to_3x3()
                bx = m.col[0].normalized()  # width axis (hinge axis)
                by = m.col[1].normalized()  # bone length axis
                bz = m.col[2].normalized()  # palmar (+bz) / dorsal (-bz) axis
                center = bone.head_local + by * (bone.length * t_al)
                ring = []
                for k in range(n_f_sides):
                    ang = (2.0 * math.pi * k) / n_f_sides
                    ca, sa = math.cos(ang), math.sin(ang)
                    # Faceted stylized finger cross-section: flat dorsal nail plane (-bz) & fuller palmar pad (+bz)
                    sx = math.copysign(abs(ca) ** 0.86, ca)
                    sz = math.copysign(abs(sa) ** 0.86, sa)
                    z_rad = rz * (1.06 if sa > 0 else 0.94)
                    # Slight dorsal knuckle bump right at joints (v ~ 0.39 or 0.69)
                    if (abs(vc - 0.39) < 0.03 or abs(vc - 0.69) < 0.03) and sa < -0.35:
                        z_rad *= 1.10
                    pt = center + bx * (rx * sx) + bz * (z_rad * sz)
                    ring.append((pt, wdict))
                f_rings.append(ring)
                f_vs.append(vc)

            # Determine winding consistency from bone basis det (right vs left mirror)
            m0 = b1.matrix_local.to_3x3()
            flip_f = (m0.col[0].cross(m0.col[2]).dot(m0.col[1]) > 0)
            # Porcelain skin UV region on right half of texture (u in [0.54, 0.96])
            add_closed_loft(f_rings, u_range=(0.54, 0.96), v_vals=f_vs, flip_winding=flip_f)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    hands_b = sum(1 for e in bm.edges if e.is_boundary)
    hands_mesh = bpy.data.meshes.new("Hero_Hands_Mesh")
    bm.to_mesh(hands_mesh)
    bm.free()

    old_hands = bpy.data.objects.get("Hero_Hands")
    if old_hands is not None:
        bpy.data.objects.remove(old_hands, do_unlink=True)
    hands_obj = bpy.data.objects.new("Hero_Hands", hands_mesh)
    bpy.context.collection.objects.link(hands_obj)

    # Smooth-by-angle bevel normals so knuckles read crisp & painterly
    apply_smooth_with_bevel_normals(hands_obj, sharp_angle_deg=44.0)

    # Assign crisp matte painted Base Color texture (compatible with glbhero.js & Blender viewport)
    tex_img = _make_hero_hands_texture("Hero_Hands_BaseColor", size=256)
    mat_name = "Hero_Hands_Mat"
    old_mat = bpy.data.materials.get(mat_name)
    if old_mat is not None:
        bpy.data.materials.remove(old_mat)
    mat = bpy.data.materials.new(mat_name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out_n = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex_n = nt.nodes.new("ShaderNodeTexImage")
    tex_n.image = tex_img
    nt.links.new(tex_n.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out_n.inputs["Surface"])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.84
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.12
    hands_obj.data.materials.append(mat)

    # Create exact vertex groups and assign exact per-phalanx weights
    vg_cache = {}
    for vi, wdict in enumerate(vert_weights):
        total = sum(wdict.values()) or 1.0
        for bn, wt in wdict.items():
            if wt <= 1e-4:
                continue
            vg = vg_cache.get(bn)
            if vg is None:
                vg = hands_obj.vertex_groups.new(name=bn)
                vg_cache[bn] = vg
            vg.add([vi], wt / total, "REPLACE")

    hands_obj.parent = t_arm
    mod = hands_obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = t_arm
    hands_tris = sum(len(p.vertices) - 2 for p in hands_obj.data.polygons)
    print(
        f"  + Built articulated 5-finger Hero_Hands ({hands_tris:,} tris, boundary={hands_b}, "
        f"Hero_Body cuff boundary={body_b_after}, bone groups={len(vg_cache)})"
    )
    return hands_obj


def attach_ember_great_dao(t_arm, body, template, outline_mode="none"):
    """Build and snap the faceted Ember Eastern Great-Dao dead-center into hand_r palm."""
    blade_obj, core_obj = _build_ember_great_dao_mesh()
    sword_objs = [blade_obj, core_obj]
    if outline_mode != "none":
        off = 0.0022 if outline_mode == "subtle" else 0.0038
        sword_out = make_outline(blade_obj, "Hero_Sword_Outline", offset=off, dec_ratio=0.75)
        sword_objs.append(sword_out)

    # Compute exact curled fist grip tunnel & cutting-edge orientation directly from posed finger bones!
    before_tmp = set(bpy.data.objects)
    before_act_tmp = set(bpy.data.actions)
    idle_path = os.path.join(M2M_DIR, "idle-a.glb")
    bpy.ops.import_scene.gltf(filepath=idle_path if os.path.isfile(idle_path) else template)
    tmp_objs = [o for o in bpy.data.objects if o not in before_tmp]
    tmp_acts = [a for a in bpy.data.actions if a not in before_act_tmp]

    hand_b = t_arm.data.bones["hand_r"]
    palm = t_arm.matrix_world @ ((hand_b.head_local + hand_b.tail_local) * 0.5)
    rot_m = Matrix.Identity(3)

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
        m_pose = t_arm.matrix_world @ pb_hr.matrix
        m_rest = t_arm.matrix_world @ t_arm.data.bones["hand_r"].matrix_local
        pose_to_rest = m_rest @ m_pose.inverted()

        # Measure each curled finger's ring center in posed world space
        def finger_curl_center(prefix):
            b1 = t_arm.pose.bones.get(f"{prefix}_01_r")
            b2 = t_arm.pose.bones.get(f"{prefix}_02_r")
            b3 = t_arm.pose.bones.get(f"{prefix}_03_r")
            if not (b1 and b2 and b3):
                return None
            pts = [
                t_arm.matrix_world @ b1.head,
                t_arm.matrix_world @ b1.tail,
                t_arm.matrix_world @ b2.tail,
                t_arm.matrix_world @ b3.tail,
            ]
            return sum(pts, Vector((0.0, 0.0, 0.0))) / len(pts)

        c_idx = finger_curl_center("index")
        c_mid = finger_curl_center("middle")
        c_rng = finger_curl_center("ring")
        c_pnk = finger_curl_center("pinky")
        if all(p is not None for p in (c_idx, c_mid, c_rng, c_pnk)):
            # Exact center of the curled 4-finger tunnel in posed space
            grip_pose = (c_idx + c_mid + c_rng + c_pnk) * 0.25
            # Natural grip axis pointing from pinky out through index/thumb side
            tunnel_axis = (c_idx - c_pnk).normalized()
            # Outward knuckle direction (cutting edge -Y faces forward along knuckles)
            b_mid1 = t_arm.pose.bones["middle_01_r"]
            knuckle_out = ((t_arm.matrix_world @ b_mid1.tail) - (t_arm.matrix_world @ b_mid1.head)).normalized()
            # Slight natural martial-arts forward cant (~14 deg toward knuckles so blade projects cleanly)
            sword_z_pose = (tunnel_axis + knuckle_out * 0.24).normalized()
            # Blade cutting edge is local -Y, spine is local +Y -> point -Y along knuckle_out
            edge_dir = (knuckle_out - sword_z_pose * knuckle_out.dot(sword_z_pose)).normalized()
            sword_y_pose = -edge_dir
            sword_x_pose = sword_y_pose.cross(sword_z_pose).normalized()
            sword_y_pose = sword_z_pose.cross(sword_x_pose).normalized()
            # Shift hilt slightly (-1.8cm along blade axis, -0.4cm deeper into palm) so guard clears index knuckle & grip is iron-tight
            grip_pose = grip_pose - sword_z_pose * 0.018 - edge_dir * 0.004

            # Transform exact posed grip center & 3-axis basis back into T-pose rest space
            palm = pose_to_rest @ grip_pose
            pr_rot = pose_to_rest.to_3x3()
            sx = (pr_rot @ sword_x_pose).normalized()
            sy = (pr_rot @ sword_y_pose).normalized()
            sz = (pr_rot @ sword_z_pose).normalized()
            rot_m = Matrix((
                (sx.x, sy.x, sz.x),
                (sx.y, sy.y, sz.y),
                (sx.z, sy.z, sz.z),
            ))
        else:
            delta_rot = m_pose.to_3x3() @ m_rest.to_3x3().inverted()
            desired_idle_world = Vector((-0.42, -0.80, +0.42)).normalized()
            target_dir = (delta_rot.inverted() @ desired_idle_world).normalized()
            rot_m = Vector((0.0, 0.0, 1.0)).rotation_difference(target_dir).to_matrix()

        t_arm.animation_data.action = None
        for pb in t_arm.pose.bones:
            pb.matrix_basis.identity()
        bpy.context.view_layer.update()

    for o in tmp_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in tmp_acts:
        bpy.data.actions.remove(a)

    for so in sword_objs:
        for v in so.data.vertices:
            v.co = rot_m @ v.co + palm
        so.data.update()
        so.animation_data_clear()
        so.vertex_groups.clear()
        vg = so.vertex_groups.new(name="hand_r")
        vg.add([v.index for v in so.data.vertices], 1.0, "REPLACE")
        so.parent = t_arm
        mod = so.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = t_arm
    print("  + Attached Ember-Eastern faceted Great-Dao + EmberCore dead-center inside curled 5-finger fist!")


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
    if profile["id"] == "hero":
        required.append("Hero_Hands")
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
    # Weld glTF UV-seam split vertices BEFORE Decimate so zero holes/T-junctions tear open on back/seams
    weld_mesh_watertight(body_high, dist=1e-4)
    if bid == "hero":
        smooth_hero_back_shelf(body_high, iterations=8)

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
    if bid == "hero":
        refit_hero_hand_bones(t_arm, hand_scale=0.78, z_shoulder=fit["z_shoulder"])
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
        # Sculpt broad squared heroic shoulder line AFTER 4-view texture projection so bare shoulder skin stays 100% crisp
        sculpt_hero_shoulder_line(body)

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

        # Also strip lower-body/torso weight bleed from outer forearms & hands so A-pose->T-pose bake unfolds straight
        arm_keep_prefixes = ("clavicle_", "upperarm_", "lowerarm_", "hand_", "thumb_", "index_", "middle_", "ring_", "pinky_")
        non_arm_vgs = [vg for vg in body.vertex_groups if not vg.name.startswith(arm_keep_prefixes)]
        arm_segs = []
        for sfx in ("l", "r"):
            for bname in (f"lowerarm_{sfx}", f"hand_{sfx}"):
                b = a_arm.data.bones.get(bname)
                if b is not None:
                    arm_segs.append((bname, b.head_local.copy(), b.tail_local.copy()))

        def _pt_seg_d(p, a, b):
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-8, ab.length_squared)))
            return (p - (a + ab * t)).length

        arm_cleaned = 0
        for v in body.data.vertices:
            if abs(v.co.x) < max(0.24, cfg["torso_clean_x"] + 0.08):
                continue
            if v.co.z < arm_floor_z - 0.04:
                continue
            best_d = 999.0
            best_bn = None
            for bn, a, b in arm_segs:
                d = _pt_seg_d(v.co, a, b)
                if d < best_d:
                    best_d = d
                    best_bn = bn
            if best_d < 0.085:
                had_non = False
                for vg in non_arm_vgs:
                    try:
                        if vg.weight(v.index) > 0.0:
                            vg.remove([v.index])
                            had_non = True
                    except RuntimeError:
                        pass
                if had_non:
                    arm_cleaned += 1
                    if not v.groups and best_bn:
                        vg_dst = body.vertex_groups.get(best_bn)
                        if vg_dst:
                            vg_dst.add([v.index], 1.0, "REPLACE")
        print(f"  + Stripped leg/torso bleed from {arm_cleaned} forearm/hand verts")

        # Keep inner trapezius & acromion shoulder plateau weighted to clavicle so arm drop never collapses heroic shoulders
        if bid == "hero":
            sh_z = fit["z_shoulder"]
            sh_x = fit["shoulder_x"]
            sh_fixed = 0
            for v in body.data.vertices:
                ax = abs(v.co.x)
                if 0.080 <= ax <= sh_x + 0.012 and sh_z - 0.025 <= v.co.z <= sh_z + 0.095:
                    sfx = "l" if v.co.x >= 0.0 else "r"
                    ua_vg = body.vertex_groups.get(f"upperarm_{sfx}")
                    cl_vg = body.vertex_groups.get(f"clavicle_{sfx}")
                    if ua_vg is None or cl_vg is None:
                        continue
                    try:
                        w_ua = ua_vg.weight(v.index)
                    except RuntimeError:
                        w_ua = 0.0
                    if w_ua > 0.02:
                        # Smooth cap on upperarm pull across the top shoulder plateau (0% near collar -> up to 45% at outer edge)
                        t_out = max(0.0, min(1.0, (ax - 0.105) / max(1e-4, (sh_x + 0.012) - 0.105)))
                        max_ua = 0.45 * (t_out * t_out)
                        if w_ua > max_ua:
                            delta = w_ua - max_ua
                            ua_vg.add([v.index], max_ua, "REPLACE")
                            try:
                                w_cl = cl_vg.weight(v.index)
                            except RuntimeError:
                                w_cl = 0.0
                            cl_vg.add([v.index], w_cl + delta, "REPLACE")
                            sh_fixed += 1
            print(f"  + Preserved squared shoulder plateau weights on {sh_fixed} acromion/trapezius verts")

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

    # 7b) Replace Hunyuan3D's blobby fused hands with clean articulated 5-finger fingerless-glove hands
    if bid == "hero":
        replace_hero_hands_articulated(body, t_arm)

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
