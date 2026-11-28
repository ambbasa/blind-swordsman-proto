"""Upgrade Idle/Walk/Attack/Hit/Die animations across all 15 Eastern monster GLBs in-place.

Preserves 100% of existing meshes, UVs, WebP textures, normals, and skinning weights while
replacing stiff 2-3 keyframe clips with anatomically verified, multi-stage world-space curves:
  - Walk   : 9-key 4-beat gait (Contact -> Down -> Passing knee-lift -> High -> Contact)
             with true backward knee flexion, pelvis bob/sway, and counter-arm swing.
  - Attack : 7-key kinetic chain (Crouch anticipation -> Hip-lead -> Whip strike -> Follow-through).
  - Hit    : 5-key impact stagger + knee buckle + defensive arm recoil.
  - Die    : 7-key dramatic multi-stage collapse (Stagger -> Knees buckle -> Drop to knees ->
             Heavy slump -> Ground settle) instead of sudden plank tipping.
  - Idle   : Breathing combat stance with natural slight knee & elbow bend.
"""
import json
import math
import shutil
import struct
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MON_DIR = ROOT / "v2/assets/models/monsters"
CORE_DIR = ROOT / "v2/assets/models"

ARCHETYPES = {
    "baekgol_skeleton":  "humanoid",
    "jangseung_stone":   "humanoid",
    "gwibul_bomber":     "humanoid",
    "dokkaebi_boss":     "humanoid",
    "susal_ghost":       "humanoid",
    "bulgasari_charger": "quadruped",
    "changgui_zombie":   "float",
    "cheonyeo_ghost":    "float",
    "dalgyalgwishin":    "float",
    "mudang_wraith":     "float",
    "gumiho_boss":       "robe",
    "jeoseung_boss":     "robe",
    "samjoko":           "avian",
    "imugi_king_boss":   "serpent",
    "jangsanbeom":       "quadruped",
}

CORE_SLOTS = {
    "dokkaebi_boss":     "boss.glb",
    "gumiho_boss":       "boss_act2.glb",
    "jeoseung_boss":     "boss_act3.glb",
    "imugi_king_boss":   "boss_act4.glb",
    "baekgol_skeleton":  "minion.glb",
    "bulgasari_charger": "heavy.glb",
    "jangseung_stone":   "stone.glb",
}


# --- Quaternion helpers (glTF order: [x, y, z, w]) ---
def q_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ], dtype=np.float64)


def q_conj(q):
    return np.array([-q[0], -q[1], -q[2], q[3]], dtype=np.float64)


def q_norm(q):
    n = np.linalg.norm(q)
    return q / n if n > 1e-12 else np.array([0.0, 0.0, 0.0, 1.0], dtype=np.float64)


def q_from_euler_xyz_deg(rx, ry, rz):
    """Intrinsic/extrinsic XYZ Euler in degrees -> glTF quaternion [x, y, z, w]."""
    cx, sx = math.cos(math.radians(rx) * 0.5), math.sin(math.radians(rx) * 0.5)
    cy, sy = math.cos(math.radians(ry) * 0.5), math.sin(math.radians(ry) * 0.5)
    cz, sz = math.cos(math.radians(rz) * 0.5), math.sin(math.radians(rz) * 0.5)
    qx = np.array([sx, 0.0, 0.0, cx])
    qy = np.array([0.0, sy, 0.0, cy])
    qz = np.array([0.0, 0.0, sz, cz])
    return q_norm(q_mul(qz, q_mul(qy, qx)))


def q_rotate_vec(q, v):
    vq = np.array([v[0], v[1], v[2], 0.0], dtype=np.float64)
    r = q_mul(q_mul(q, vq), q_conj(q))
    return r[:3]


def world_delta_to_local_quat(q_rest, q_world_rest, rx, ry, rz):
    """Apply world-space delta rotation (rx, ry, rz deg in glTF +Y up, +Z forward, +X right)
    to a bone whose rest local rotation is q_rest and rest world rotation is q_world_rest."""
    q_dw = q_from_euler_xyz_deg(rx, ry, rz)
    q_dl = q_mul(q_mul(q_conj(q_world_rest), q_dw), q_world_rest)
    return q_norm(q_mul(q_rest, q_dl))


def world_offset_to_parent_local(parent_world_q, world_offset):
    """Convert a world-space translation delta (dx, dy, dz in glTF +Y up, +Z fwd) into parent space."""
    return q_rotate_vec(q_conj(parent_world_q), np.array(world_offset, dtype=np.float64))


# --- Archetype keyframe definitions ---
# All rotations are WORLD-SPACE deltas in glTF coords (+X right, +Y up, +Z forward):
#   +rx (around +X):
#     - For upward bone (pelvis/spine/chest/head): leans FORWARD (+Z)
#     - For downward bone (thigh/shin/arms): swings BACKWARD (-Z)  [so +rx on shin = natural backward KNEE BEND!]
#   -rx (around +X):
#     - For upward bone: leans BACKWARD (-Z)
#     - For downward bone (thigh/arms): swings FORWARD (+Z)        [so -rx on thigh = stride forward, -rx on forearm = natural ELBOW BEND!]
#   +ry (around +Y): twist CCW (left shoulder forward / right shoulder back)
#   +rz (around +Z): roll left/right
# All translations are WORLD-SPACE deltas (dx, dy_up, dz_fwd) scaled by H (character height).

def get_clips(key, archetype, H):
    has_gumiho_tails = (key == "gumiho_boss")

    if archetype in ("humanoid", "robe"):
        is_robe = (archetype == "robe")
        st = 0.56 if is_robe else 1.0   # stride scale
        kn = 0.65 if is_robe else 1.0   # knee bend scale
        ar = 0.68 if is_robe else 1.0   # arm swing scale

        t_i1 = {"tail_mid": (4, 6, 0), "tail_l": (4, 8, 5), "tail_r": (4, -8, -5)} if has_gumiho_tails else {}
        t_i2 = {"tail_mid": (-4, -6, 0), "tail_l": (-4, -6, -5), "tail_r": (-4, 6, 5)} if has_gumiho_tails else {}
        t_w1 = {"tail_mid": (8, 10, 0), "tail_l": (6, 12, 6), "tail_r": (6, 8, -4)} if has_gumiho_tails else {}
        t_w2 = {"tail_mid": (8, -10, 0), "tail_l": (6, -8, 4), "tail_r": (6, -12, -6)} if has_gumiho_tails else {}
        t_a1 = {"tail_mid": (-12, -10, 0), "tail_l": (-10, 14, 12), "tail_r": (-10, -14, -12)} if has_gumiho_tails else {}
        t_a2 = {"tail_mid": (14, 10, 0), "tail_l": (10, -8, -6), "tail_r": (10, 8, 6)} if has_gumiho_tails else {}

        idle = [
            (0.00, {"pelvis": (2, 0, 1), "chest": (3, 0, 0), "head": (-2, 2, 0),
                    "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "foot_l": (-8, 0, 0),
                    "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0), "foot_r": (-8, 0, 0),
                    "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0),
                    "upperarm_r": (4, 0, 6),  "forearm_r": (-26, 0, 0), **t_i1},
                   {"pelvis": (0, -0.015 * H, 0)}),
            (0.80, {"pelvis": (4, 0, -1), "chest": (-2, 0, 0), "head": (1, -2, 0),
                    "thigh_l": (-11, 0, 0), "shin_l": (22, 0, 0), "foot_l": (-11, 0, 0),
                    "thigh_r": (-11, 0, 0), "shin_r": (22, 0, 0), "foot_r": (-11, 0, 0),
                    "upperarm_l": (2, 0, -9), "forearm_l": (-32, 0, 0),
                    "upperarm_r": (2, 0, 9),  "forearm_r": (-32, 0, 0), **t_i2},
                   {"pelvis": (0, -0.032 * H, 0)}),
            (1.60, {"pelvis": (2, 0, 1), "chest": (3, 0, 0), "head": (-2, 2, 0),
                    "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "foot_l": (-8, 0, 0),
                    "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0), "foot_r": (-8, 0, 0),
                    "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0),
                    "upperarm_r": (4, 0, 6),  "forearm_r": (-26, 0, 0), **t_i1},
                   {"pelvis": (0, -0.015 * H, 0)}),
        ]

        # 9-keyframe 4-beat human walk cycle with real backward knee flexion (+rx on shin!)
        walk = [
            # 0.00: Left Heel Contact (L forward, R back)
            (0.00, {"pelvis": (5, 7 * st, 2), "spine": (3, -4 * st, 0), "chest": (5, -8 * st, -2), "head": (-4, 5 * st, 0),
                    "thigh_l": (-34 * st, 0, 0), "shin_l": (12 * kn, 0, 0), "foot_l": (-10 * st, 0, 0),
                    "thigh_r": (24 * st, 0, 0),  "shin_r": (24 * kn, 0, 0), "foot_r": (18 * st, 0, 0),
                    "upperarm_l": (22 * ar, 0, -5),  "forearm_l": (-18 * ar, 0, 0),
                    "upperarm_r": (-26 * ar, 0, 5),  "forearm_r": (-38 * ar, 0, 0), **t_w1},
                   {"pelvis": (0, -0.025 * H, 0)}),
            # 0.11: Left Down (L knee absorbs weight, R toe-off begins bending)
            (0.11, {"pelvis": (7, 4 * st, 3), "spine": (4, -2 * st, 0), "chest": (7, -5 * st, -2), "head": (-5, 3 * st, 0),
                    "thigh_l": (-24 * st, 0, 0), "shin_l": (32 * kn, 0, 0), "foot_l": (-8 * st, 0, 0),
                    "thigh_r": (28 * st, 0, 0),  "shin_r": (48 * kn, 0, 0), "foot_r": (22 * st, 0, 0),
                    "upperarm_l": (16 * ar, 0, -6),  "forearm_l": (-22 * ar, 0, 0),
                    "upperarm_r": (-18 * ar, 0, 6),  "forearm_r": (-42 * ar, 0, 0), **t_w1},
                   {"pelvis": (0, -0.058 * H * st, 0)}),
            # 0.22: Left Passing (L supports, R knee bends sharply backward +68deg!)
            (0.22, {"pelvis": (4, 0, 1), "spine": (2, 0, 0), "chest": (4, 0, 0), "head": (-3, 0, 0),
                    "thigh_l": (-6 * st, 0, 0),  "shin_l": (10 * kn, 0, 0), "foot_l": (-4 * st, 0, 0),
                    "thigh_r": (-12 * st, 0, 0), "shin_r": (68 * kn, 0, 0), "foot_r": (12 * st, 0, 0),
                    "upperarm_l": (2 * ar, 0, -6),   "forearm_l": (-28 * ar, 0, 0),
                    "upperarm_r": (-2 * ar, 0, 6),   "forearm_r": (-30 * ar, 0, 0), **t_i1},
                   {"pelvis": (0, 0.012 * H * st, 0)}),
            # 0.33: Left High Point (R thigh swings forward, shin extending)
            (0.33, {"pelvis": (4, -4 * st, -1), "spine": (2, 2 * st, 0), "chest": (4, 5 * st, 1), "head": (-3, -3 * st, 0),
                    "thigh_l": (14 * st, 0, 0),  "shin_l": (12 * kn, 0, 0), "foot_l": (6 * st, 0, 0),
                    "thigh_r": (-36 * st, 0, 0), "shin_r": (34 * kn, 0, 0), "foot_r": (-6 * st, 0, 0),
                    "upperarm_l": (-16 * ar, 0, -5), "forearm_l": (-34 * ar, 0, 0),
                    "upperarm_r": (14 * ar, 0, 5),   "forearm_r": (-22 * ar, 0, 0), **t_w2},
                   {"pelvis": (0, 0.022 * H * st, 0)}),
            # 0.44: Right Heel Contact (R forward, L back)
            (0.44, {"pelvis": (5, -7 * st, -2), "spine": (3, 4 * st, 0), "chest": (5, 8 * st, 2), "head": (-4, -5 * st, 0),
                    "thigh_r": (-34 * st, 0, 0), "shin_r": (12 * kn, 0, 0), "foot_r": (-10 * st, 0, 0),
                    "thigh_l": (24 * st, 0, 0),  "shin_l": (24 * kn, 0, 0), "foot_l": (18 * st, 0, 0),
                    "upperarm_r": (22 * ar, 0, 5),   "forearm_r": (-18 * ar, 0, 0),
                    "upperarm_l": (-26 * ar, 0, -5), "forearm_l": (-38 * ar, 0, 0), **t_w2},
                   {"pelvis": (0, -0.025 * H, 0)}),
            # 0.55: Right Down
            (0.55, {"pelvis": (7, -4 * st, -3), "spine": (4, 2 * st, 0), "chest": (7, 5 * st, 2), "head": (-5, -3 * st, 0),
                    "thigh_r": (-24 * st, 0, 0), "shin_r": (32 * kn, 0, 0), "foot_r": (-8 * st, 0, 0),
                    "thigh_l": (28 * st, 0, 0),  "shin_l": (48 * kn, 0, 0), "foot_l": (22 * st, 0, 0),
                    "upperarm_r": (16 * ar, 0, 6),   "forearm_r": (-22 * ar, 0, 0),
                    "upperarm_l": (-18 * ar, 0, -6), "forearm_l": (-42 * ar, 0, 0), **t_w2},
                   {"pelvis": (0, -0.058 * H * st, 0)}),
            # 0.66: Right Passing (L knee bends sharply backward +68deg!)
            (0.66, {"pelvis": (4, 0, -1), "spine": (2, 0, 0), "chest": (4, 0, 0), "head": (-3, 0, 0),
                    "thigh_r": (-6 * st, 0, 0),  "shin_r": (10 * kn, 0, 0), "foot_r": (-4 * st, 0, 0),
                    "thigh_l": (-12 * st, 0, 0), "shin_l": (68 * kn, 0, 0), "foot_l": (12 * st, 0, 0),
                    "upperarm_r": (2 * ar, 0, 6),    "forearm_r": (-28 * ar, 0, 0),
                    "upperarm_l": (-2 * ar, 0, -6),  "forearm_l": (-30 * ar, 0, 0), **t_i2},
                   {"pelvis": (0, 0.012 * H * st, 0)}),
            # 0.77: Right High Point
            (0.77, {"pelvis": (4, 4 * st, 1), "spine": (2, -2 * st, 0), "chest": (4, -5 * st, -1), "head": (-3, 3 * st, 0),
                    "thigh_r": (14 * st, 0, 0),  "shin_r": (12 * kn, 0, 0), "foot_r": (6 * st, 0, 0),
                    "thigh_l": (-36 * st, 0, 0), "shin_l": (34 * kn, 0, 0), "foot_l": (-6 * st, 0, 0),
                    "upperarm_r": (-16 * ar, 0, 5),  "forearm_r": (-34 * ar, 0, 0),
                    "upperarm_l": (14 * ar, 0, -5),  "forearm_l": (-22 * ar, 0, 0), **t_w1},
                   {"pelvis": (0, 0.022 * H * st, 0)}),
            # 0.88: Loop close (= 0.00)
            (0.88, {"pelvis": (5, 7 * st, 2), "spine": (3, -4 * st, 0), "chest": (5, -8 * st, -2), "head": (-4, 5 * st, 0),
                    "thigh_l": (-34 * st, 0, 0), "shin_l": (12 * kn, 0, 0), "foot_l": (-10 * st, 0, 0),
                    "thigh_r": (24 * st, 0, 0),  "shin_r": (24 * kn, 0, 0), "foot_r": (18 * st, 0, 0),
                    "upperarm_l": (22 * ar, 0, -5),  "forearm_l": (-18 * ar, 0, 0),
                    "upperarm_r": (-26 * ar, 0, 5),  "forearm_r": (-38 * ar, 0, 0), **t_w1},
                   {"pelvis": (0, -0.025 * H, 0)}),
        ]

        # 7-keyframe kinetic-chain Attack (Anticipation crouch -> Hip lead -> Whip slash -> Follow-through -> Recover)
        attack = [
            (0.00, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                    "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                    "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0), **t_i1},
                   {"pelvis": (0, -0.015 * H, 0)}),
            # Anticipation: crouch + coil right shoulder BACK (+ry) + raise right arm overhead
            (0.18, {"pelvis": (8, 16, -4), "spine": (-4, 10, 0), "chest": (-10, 22, -6), "head": (6, -26, 0),
                    "thigh_l": (-22 * st, 0, 0), "shin_l": (44 * kn, 0, 0), "foot_l": (-18 * st, 0, 0),
                    "thigh_r": (-18 * st, 0, 0), "shin_r": (40 * kn, 0, 0), "foot_r": (-16 * st, 0, 0),
                    "upperarm_r": (-128, 18, 28), "forearm_r": (-64, 0, 0),
                    "upperarm_l": (-34, -14, -18), "forearm_l": (-54, 0, 0), **t_a1},
                   {"pelvis": (0, -0.085 * H * st, -0.04 * H)}),
            # Peak tension hold (readable wind-up telegraph)
            (0.30, {"pelvis": (10, 20, -5), "spine": (-5, 12, 0), "chest": (-12, 26, -7), "head": (8, -32, 0),
                    "thigh_l": (-26 * st, 0, 0), "shin_l": (50 * kn, 0, 0), "foot_l": (-20 * st, 0, 0),
                    "thigh_r": (-16 * st, 0, 0), "shin_r": (38 * kn, 0, 0), "foot_r": (-16 * st, 0, 0),
                    "upperarm_r": (-142, 22, 32), "forearm_r": (-70, 0, 0),
                    "upperarm_l": (-40, -18, -22), "forearm_l": (-60, 0, 0), **t_a1},
                   {"pelvis": (0, -0.095 * H * st, -0.05 * H)}),
            # Whip strike impact! Hips lunge forward, right shoulder whips FORWARD (-ry), arm extends forward-down
            (0.46, {"pelvis": (14, -18, 5), "spine": (8, -12, 0), "chest": (22, -26, 6), "head": (-14, 24, 0),
                    "thigh_l": (-38 * st, 0, 0), "shin_l": (46 * kn, 0, 0), "foot_l": (-8 * st, 0, 0),
                    "thigh_r": (26 * st, 0, 0),  "shin_r": (20 * kn, 0, 0), "foot_r": (16 * st, 0, 0),
                    "upperarm_r": (-74, -18, -16), "forearm_r": (-14, 0, 0),
                    "upperarm_l": (36, 18, -22), "forearm_l": (-34, 0, 0), **t_a2},
                   {"pelvis": (0, -0.075 * H * st, 0.11 * H)}),
            # Follow-through settle (arm sweeps low-forward across)
            (0.64, {"pelvis": (10, -22, 4), "spine": (6, -10, 0), "chest": (16, -22, 4), "head": (-10, 20, 0),
                    "thigh_l": (-30 * st, 0, 0), "shin_l": (38 * kn, 0, 0), "foot_l": (-8 * st, 0, 0),
                    "thigh_r": (20 * st, 0, 0),  "shin_r": (18 * kn, 0, 0), "foot_r": (12 * st, 0, 0),
                    "upperarm_r": (-32, -24, -22), "forearm_r": (-32, 0, 0),
                    "upperarm_l": (28, 12, -16), "forearm_l": (-32, 0, 0), **t_a2},
                   {"pelvis": (0, -0.060 * H * st, 0.08 * H)}),
            # Recovery back to stance
            (0.92, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                    "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                    "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0), **t_i1},
                   {"pelvis": (0, -0.015 * H, 0)}),
        ]

        # 4-keyframe crisp Hit stagger
        hit = [
            (0.00, {"pelvis": (2, 0, 0), "chest": (2, 0, 0), "head": (0, 0, 0),
                    "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                    "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0)},
                   {"pelvis": (0, -0.015 * H, 0)}),
            (0.12, {"pelvis": (-8, 8, -4), "spine": (-6, 4, 0), "chest": (-16, 10, -4), "head": (-14, -8, 6),
                    "thigh_l": (-18 * st, 0, 0), "shin_l": (36 * kn, 0, 0), "thigh_r": (-12 * st, 0, 0), "shin_r": (28 * kn, 0, 0),
                    "upperarm_l": (-28, 0, -28), "forearm_l": (-52, 0, 0), "upperarm_r": (-22, 0, 28), "forearm_r": (-48, 0, 0)},
                   {"pelvis": (0, -0.055 * H * st, -0.06 * H)}),
            (0.28, {"pelvis": (-3, 3, -1), "chest": (-6, 4, -1), "head": (-5, -3, 2),
                    "thigh_l": (-12 * st, 0, 0), "shin_l": (24 * kn, 0, 0), "thigh_r": (-10 * st, 0, 0), "shin_r": (20 * kn, 0, 0),
                    "upperarm_l": (-8, 0, -14), "forearm_l": (-34, 0, 0), "upperarm_r": (-6, 0, 14), "forearm_r": (-34, 0, 0)},
                   {"pelvis": (0, -0.030 * H * st, -0.02 * H)}),
            (0.46, {"pelvis": (2, 0, 0), "chest": (2, 0, 0), "head": (0, 0, 0),
                    "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                    "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0)},
                   {"pelvis": (0, -0.015 * H, 0)}),
        ]

        # 7-keyframe dramatic multi-stage Die (Stagger -> Knees buckle -> Drop to knees -> Slump -> Flat settle!)
        die = [
            (0.00, {"pelvis": (2, 0, 0), "chest": (2, 0, 0), "head": (0, 0, 0),
                    "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                    "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0)},
                   {"pelvis": (0, -0.015 * H, 0)}),
            # 0.18: Fatal impact recoil (chest arches back, arms fling out)
            (0.18, {"pelvis": (-10, 8, -4), "spine": (-8, 4, 0), "chest": (-20, 8, -4), "head": (-22, -6, 8),
                    "thigh_l": (-16, 0, 0), "shin_l": (34, 0, 0), "thigh_r": (-12, 0, 0), "shin_r": (28, 0, 0),
                    "upperarm_l": (-32, 0, -36), "forearm_l": (-46, 0, 0), "upperarm_r": (-28, 0, 36), "forearm_r": (-44, 0, 0)},
                   {"pelvis": (0, -0.05 * H, -0.06 * H)}),
            # 0.42: Knees buckle sharply, torso hunches forward
            (0.42, {"pelvis": (10, 4, 4), "spine": (12, 0, 0), "chest": (22, 0, 4), "head": (24, 6, -8),
                    "thigh_l": (-34, 0, 0), "shin_l": (76, 0, 0), "foot_l": (-26, 0, 0),
                    "thigh_r": (-28, 0, 0), "shin_r": (68, 0, 0), "foot_r": (-22, 0, 0),
                    "upperarm_l": (-24, 0, -14), "forearm_l": (-36, 0, 0), "upperarm_r": (-20, 0, 14), "forearm_r": (-34, 0, 0)},
                   {"pelvis": (0, -0.22 * H, -0.02 * H)}),
            # 0.68: Drop onto knees (knees folded back +108deg!)
            (0.68, {"pelvis": (22, 6, 8), "spine": (16, 0, 0), "chest": (28, 4, 6), "head": (34, 10, -12),
                    "thigh_l": (-24, 0, 0), "shin_l": (108, 0, 0), "foot_l": (-14, 0, 0),
                    "thigh_r": (-20, 0, 0), "shin_r": (102, 0, 0), "foot_r": (-14, 0, 0),
                    "upperarm_l": (-36, 0, -20), "forearm_l": (-24, 0, 0), "upperarm_r": (-32, 0, 22), "forearm_r": (-22, 0, 0)},
                   {"pelvis": (0, -0.39 * H, 0.04 * H)}),
            # 0.94: Heavy collapse forward onto ground
            (0.94, {"pelvis": (68, 12, 16), "spine": (10, 4, 4), "chest": (14, 6, 6), "head": (16, 18, -14),
                    "thigh_l": (4, 0, -6), "shin_l": (42, 0, 0), "foot_l": (12, 0, 0),
                    "thigh_r": (10, 0, 8), "shin_r": (34, 0, 0), "foot_r": (10, 0, 0),
                    "upperarm_l": (-78, 0, -34), "forearm_l": (-18, 0, 0), "upperarm_r": (-66, 0, 42), "forearm_r": (-24, 0, 0)},
                   {"pelvis": (0, -0.46 * H, 0.16 * H)}),
            # 1.15: Ground impact settle
            (1.15, {"pelvis": (84, 14, 18), "spine": (4, 4, 4), "chest": (6, 4, 4), "head": (8, 22, -16),
                    "thigh_l": (8, 0, -8), "shin_l": (22, 0, 0), "foot_l": (16, 0, 0),
                    "thigh_r": (12, 0, 10), "shin_r": (18, 0, 0), "foot_r": (14, 0, 0),
                    "upperarm_l": (-84, 0, -40), "forearm_l": (-14, 0, 0), "upperarm_r": (-74, 0, 48), "forearm_r": (-18, 0, 0)},
                   {"pelvis": (0, -0.48 * H, 0.20 * H)}),
            # 1.40: Hold resting pose
            (1.40, {"pelvis": (84, 14, 18), "spine": (4, 4, 4), "chest": (6, 4, 4), "head": (8, 22, -16),
                    "thigh_l": (8, 0, -8), "shin_l": (22, 0, 0), "foot_l": (16, 0, 0),
                    "thigh_r": (12, 0, 10), "shin_r": (18, 0, 0), "foot_r": (14, 0, 0),
                    "upperarm_l": (-84, 0, -40), "forearm_l": (-14, 0, 0), "upperarm_r": (-74, 0, 48), "forearm_r": (-18, 0, 0)},
                   {"pelvis": (0, -0.48 * H, 0.20 * H)}),
        ]
        return {"Idle": idle, "Walk": walk, "Attack": attack, "Hit": hit, "Die": die}

    if archetype == "float":
        idle = [
            (0.00, {"chest": (4, 0, 0), "head": (-3, 2, 0), "skirt_mid": (6, 0, 2), "skirt_hem": (10, 0, 3),
                    "upperarm_l": (-12, 0, -10), "forearm_l": (-34, 0, 0), "upperarm_r": (-12, 0, 10), "forearm_r": (-34, 0, 0)},
                   {"pelvis": (0, 0.02 * H, 0)}),
            (0.85, {"chest": (-2, 0, 0), "head": (2, -2, 0), "skirt_mid": (-5, 0, -2), "skirt_hem": (-9, 0, -3),
                    "upperarm_l": (-18, 0, -14), "forearm_l": (-40, 0, 0), "upperarm_r": (-18, 0, 14), "forearm_r": (-40, 0, 0)},
                   {"pelvis": (0, 0.09 * H, 0)}),
            (1.70, {"chest": (4, 0, 0), "head": (-3, 2, 0), "skirt_mid": (6, 0, 2), "skirt_hem": (10, 0, 3),
                    "upperarm_l": (-12, 0, -10), "forearm_l": (-34, 0, 0), "upperarm_r": (-12, 0, 10), "forearm_r": (-34, 0, 0)},
                   {"pelvis": (0, 0.02 * H, 0)}),
        ]
        walk = [
            (0.00, {"pelvis": (10, 4, 2), "chest": (12, -4, 0), "head": (-10, 0, 0), "skirt_mid": (18, 0, 5), "skirt_hem": (26, 0, 8),
                    "upperarm_l": (-30, 0, -10), "forearm_l": (-28, 0, 0), "upperarm_r": (-24, 0, 10), "forearm_r": (-32, 0, 0)},
                   {"pelvis": (0, 0.05 * H, 0)}),
            (0.45, {"pelvis": (12, -4, -2), "chest": (14, 4, 0), "head": (-12, 0, 0), "skirt_mid": (14, 0, -5), "skirt_hem": (22, 0, -8),
                    "upperarm_l": (-24, 0, -12), "forearm_l": (-32, 0, 0), "upperarm_r": (-30, 0, 12), "forearm_r": (-28, 0, 0)},
                   {"pelvis": (0, 0.12 * H, 0)}),
            (0.90, {"pelvis": (10, 4, 2), "chest": (12, -4, 0), "head": (-10, 0, 0), "skirt_mid": (18, 0, 5), "skirt_hem": (26, 0, 8),
                    "upperarm_l": (-30, 0, -10), "forearm_l": (-28, 0, 0), "upperarm_r": (-24, 0, 10), "forearm_r": (-32, 0, 0)},
                   {"pelvis": (0, 0.05 * H, 0)}),
        ]
        attack = [
            (0.00, {"chest": (4, 0, 0), "upperarm_l": (-12, 0, -10), "forearm_l": (-34, 0, 0), "upperarm_r": (-12, 0, 10), "forearm_r": (-34, 0, 0)}, {"pelvis": (0, 0.04 * H, 0)}),
            (0.22, {"pelvis": (-12, 0, 0), "chest": (-16, 0, 0), "head": (-10, 0, 0), "skirt_mid": (-14, 0, 0),
                    "upperarm_l": (-92, 0, -30), "forearm_l": (-52, 0, 0), "upperarm_r": (-92, 0, 30), "forearm_r": (-52, 0, 0)},
                   {"pelvis": (0, 0.14 * H, -0.05 * H)}),
            (0.46, {"pelvis": (18, 0, 0), "chest": (22, 0, 0), "head": (-14, 0, 0), "skirt_mid": (26, 0, 0), "skirt_hem": (30, 0, 0),
                    "upperarm_l": (-46, 18, -6), "forearm_l": (-18, 0, 0), "upperarm_r": (-46, -18, 6), "forearm_r": (-18, 0, 0)},
                   {"pelvis": (0, 0.02 * H, 0.11 * H)}),
            (0.68, {"pelvis": (12, 0, 0), "chest": (14, 0, 0), "skirt_mid": (16, 0, 0),
                    "upperarm_l": (-20, 8, -10), "forearm_l": (-28, 0, 0), "upperarm_r": (-20, -8, 10), "forearm_r": (-28, 0, 0)},
                   {"pelvis": (0, 0.03 * H, 0.06 * H)}),
            (0.92, {"chest": (4, 0, 0), "upperarm_l": (-12, 0, -10), "forearm_l": (-34, 0, 0), "upperarm_r": (-12, 0, 10), "forearm_r": (-34, 0, 0)}, {"pelvis": (0, 0.04 * H, 0)}),
        ]
        hit = [
            (0.00, {"chest": (4, 0, 0), "head": (0, 0, 0)}, {"pelvis": (0, 0.04 * H, 0)}),
            (0.12, {"pelvis": (-10, 8, 0), "chest": (-18, 8, 0), "head": (-14, 0, 6), "skirt_mid": (-16, 0, 0),
                    "upperarm_l": (-24, 0, -28), "upperarm_r": (-24, 0, 28)}, {"pelvis": (0, 0.07 * H, -0.06 * H)}),
            (0.42, {"chest": (4, 0, 0), "head": (0, 0, 0)}, {"pelvis": (0, 0.04 * H, 0)}),
        ]
        die = [
            (0.00, {"pelvis": (0, 0, 0), "chest": (4, 0, 0)}, {"pelvis": (0, 0.04 * H, 0)}),
            (0.22, {"pelvis": (-16, 12, -8), "chest": (-22, 10, 0), "head": (-22, 0, 12), "upperarm_l": (-40, 0, -40), "upperarm_r": (-40, 0, 40)}, {"pelvis": (0, 0.12 * H, -0.06 * H)}),
            (0.55, {"pelvis": (16, 18, 12), "chest": (22, 10, 6), "head": (28, 14, -10), "skirt_mid": (26, 0, 0), "upperarm_l": (-20, 0, -18), "upperarm_r": (-20, 0, 18)}, {"pelvis": (0, -0.18 * H, 0.02 * H)}),
            (0.95, {"pelvis": (68, 22, 18), "chest": (18, 8, 8), "head": (20, 18, -14), "skirt_mid": (32, 0, 0), "upperarm_l": (-76, 0, -34), "upperarm_r": (-66, 0, 38)}, {"pelvis": (0, -0.44 * H, 0.14 * H)}),
            (1.30, {"pelvis": (82, 24, 20), "chest": (10, 8, 6), "head": (12, 20, -16), "skirt_mid": (24, 0, 0), "upperarm_l": (-82, 0, -38), "upperarm_r": (-72, 0, 42)}, {"pelvis": (0, -0.47 * H, 0.18 * H)}),
        ]
        return {"Idle": idle, "Walk": walk, "Attack": attack, "Hit": hit, "Die": die}

    if archetype == "quadruped":
        # Four-legged feline (Jangsanbeom): true 4-beat feline prowl + pounce + multi-stage side collapse
        idle = [
            (0.00, {"spine_front": (2, 0, 0), "head": (-4, 3, 0), "tail_1": (0, 14, 0), "tail_2": (0, 18, 0),
                    "leg_fl_up": (-6, 0, 0), "leg_fl_lo": (12, 0, 0), "leg_fr_up": (-6, 0, 0), "leg_fr_lo": (12, 0, 0),
                    "leg_bl_up": (8, 0, 0),  "leg_bl_lo": (-14, 0, 0), "leg_br_up": (8, 0, 0), "leg_br_lo": (-14, 0, 0)},
                   {"spine_mid": (0, 0, 0)}),
            (0.80, {"spine_front": (5, 0, 0), "head": (-2, -3, 0), "tail_1": (0, -14, 0), "tail_2": (0, -18, 0),
                    "leg_fl_up": (-10, 0, 0), "leg_fl_lo": (20, 0, 0), "leg_fr_up": (-10, 0, 0), "leg_fr_lo": (20, 0, 0),
                    "leg_bl_up": (12, 0, 0),  "leg_bl_lo": (-22, 0, 0), "leg_br_up": (12, 0, 0), "leg_br_lo": (-22, 0, 0)},
                   {"spine_mid": (0, -0.03 * H, 0)}),
            (1.60, {"spine_front": (2, 0, 0), "head": (-4, 3, 0), "tail_1": (0, 14, 0), "tail_2": (0, 18, 0),
                    "leg_fl_up": (-6, 0, 0), "leg_fl_lo": (12, 0, 0), "leg_fr_up": (-6, 0, 0), "leg_fr_lo": (12, 0, 0),
                    "leg_bl_up": (8, 0, 0),  "leg_bl_lo": (-14, 0, 0), "leg_br_up": (8, 0, 0), "leg_br_lo": (-14, 0, 0)},
                   {"spine_mid": (0, 0, 0)}),
        ]
        walk = [
            (0.00, {"spine_mid": (4, 4, 0), "spine_front": (4, -4, 0), "head": (-4, 0, 0), "tail_1": (0, 14, 0), "tail_2": (0, 10, 0),
                    "leg_fl_up": (-32, 0, 0), "leg_fl_lo": (14, 0, 0), "leg_fr_up": (26, 0, 0),  "leg_fr_lo": (48, 0, 0),
                    "leg_bl_up": (28, 0, 0),  "leg_bl_lo": (-18, 0, 0), "leg_br_up": (-26, 0, 0), "leg_br_lo": (34, 0, 0)},
                   {"spine_mid": (0, -0.02 * H, 0)}),
            (0.20, {"spine_mid": (-3, 0, 0), "spine_front": (-2, 0, 0), "head": (-2, 0, 0), "tail_1": (0, 0, 0), "tail_2": (0, -6, 0),
                    "leg_fl_up": (-4, 0, 0),  "leg_fl_lo": (16, 0, 0), "leg_fr_up": (-16, 0, 0), "leg_fr_lo": (58, 0, 0),
                    "leg_bl_up": (-10, 0, 0), "leg_bl_lo": (44, 0, 0), "leg_br_up": (4, 0, 0),   "leg_br_lo": (-10, 0, 0)},
                   {"spine_mid": (0, 0.03 * H, 0)}),
            (0.40, {"spine_mid": (4, -4, 0), "spine_front": (4, 4, 0), "head": (-4, 0, 0), "tail_1": (0, -14, 0), "tail_2": (0, -10, 0),
                    "leg_fr_up": (-32, 0, 0), "leg_fr_lo": (14, 0, 0), "leg_fl_up": (26, 0, 0),  "leg_fl_lo": (48, 0, 0),
                    "leg_br_up": (28, 0, 0),  "leg_br_lo": (-18, 0, 0), "leg_bl_up": (-26, 0, 0), "leg_bl_lo": (34, 0, 0)},
                   {"spine_mid": (0, -0.02 * H, 0)}),
            (0.60, {"spine_mid": (-3, 0, 0), "spine_front": (-2, 0, 0), "head": (-2, 0, 0), "tail_1": (0, 0, 0), "tail_2": (0, 6, 0),
                    "leg_fr_up": (-4, 0, 0),  "leg_fr_lo": (16, 0, 0), "leg_fl_up": (-16, 0, 0), "leg_fl_lo": (58, 0, 0),
                    "leg_br_up": (-10, 0, 0), "leg_br_lo": (44, 0, 0), "leg_bl_up": (4, 0, 0),   "leg_bl_lo": (-10, 0, 0)},
                   {"spine_mid": (0, 0.03 * H, 0)}),
            (0.80, {"spine_mid": (4, 4, 0), "spine_front": (4, -4, 0), "head": (-4, 0, 0), "tail_1": (0, 14, 0), "tail_2": (0, 10, 0),
                    "leg_fl_up": (-32, 0, 0), "leg_fl_lo": (14, 0, 0), "leg_fr_up": (26, 0, 0),  "leg_fr_lo": (48, 0, 0),
                    "leg_bl_up": (28, 0, 0),  "leg_bl_lo": (-18, 0, 0), "leg_br_up": (-26, 0, 0), "leg_br_lo": (34, 0, 0)},
                   {"spine_mid": (0, -0.02 * H, 0)}),
        ]
        attack = [
            (0.00, {"spine_mid": (0, 0, 0), "head": (0, 0, 0)}, {"spine_mid": (0, 0, 0)}),
            (0.22, {"spine_mid": (14, 0, 0), "spine_front": (-10, 0, 0), "head": (-12, 0, 0),
                    "leg_fl_up": (-24, 0, 0), "leg_fl_lo": (58, 0, 0), "leg_fr_up": (-24, 0, 0), "leg_fr_lo": (58, 0, 0),
                    "leg_bl_up": (-28, 0, 0), "leg_bl_lo": (52, 0, 0), "leg_br_up": (-28, 0, 0), "leg_br_lo": (52, 0, 0)},
                   {"spine_mid": (0, -0.14 * H, -0.08 * H)}),
            (0.46, {"spine_mid": (-18, 0, 0), "spine_front": (-8, 0, 0), "head": (10, 0, 0),
                    "leg_fl_up": (-58, 0, 0), "leg_fl_lo": (22, 0, 0), "leg_fr_up": (-52, 0, 0), "leg_fr_lo": (28, 0, 0),
                    "leg_bl_up": (42, 0, 0),  "leg_bl_lo": (12, 0, 0), "leg_br_up": (42, 0, 0),  "leg_br_lo": (12, 0, 0)},
                   {"spine_mid": (0, 0.14 * H, 0.18 * H)}),
            (0.66, {"spine_mid": (10, 0, 0), "spine_front": (8, 0, 0), "head": (6, 0, 0),
                    "leg_fl_up": (-18, 0, 0), "leg_fl_lo": (44, 0, 0), "leg_fr_up": (-18, 0, 0), "leg_fr_lo": (44, 0, 0)},
                   {"spine_mid": (0, -0.08 * H, 0.10 * H)}),
            (0.90, {"spine_mid": (0, 0, 0), "head": (0, 0, 0)}, {"spine_mid": (0, 0, 0)}),
        ]
        hit = [
            (0.00, {"spine_front": (0, 0, 0), "head": (0, 0, 0)}, {"spine_mid": (0, 0, 0)}),
            (0.14, {"spine_mid": (-10, 6, 0), "spine_front": (-14, 8, 0), "head": (-14, 0, 8)}, {"spine_mid": (0, -0.04 * H, -0.07 * H)}),
            (0.42, {"spine_front": (0, 0, 0), "head": (0, 0, 0)}, {"spine_mid": (0, 0, 0)}),
        ]
        die = [
            (0.00, {"spine_mid": (0, 0, 0)}, {"spine_mid": (0, 0, 0)}),
            (0.22, {"spine_mid": (-12, 0, -10), "head": (-18, 0, 12), "leg_fl_up": (-22, 0, 0), "leg_fl_lo": (55, 0, 0), "leg_fr_up": (-22, 0, 0), "leg_fr_lo": (55, 0, 0)},
                   {"spine_mid": (0, -0.08 * H, -0.06 * H)}),
            (0.56, {"spine_mid": (8, 0, 38), "head": (12, 0, 16), "leg_fl_up": (-34, 0, 0), "leg_fl_lo": (82, 0, 0), "leg_bl_up": (-24, 0, 0), "leg_bl_lo": (68, 0, 0)},
                   {"spine_mid": (0, -0.28 * H, 0)}),
            (0.95, {"spine_mid": (6, 0, 82), "head": (14, 0, 12), "tail_1": (0, 20, 0), "leg_fl_up": (-16, 0, 0), "leg_fl_lo": (36, 0, 0), "leg_fr_up": (10, 0, 0), "leg_fr_lo": (28, 0, 0)},
                   {"spine_mid": (0, -0.44 * H, 0)}),
            (1.30, {"spine_mid": (6, 0, 86), "head": (16, 0, 10), "tail_1": (0, 24, 0), "leg_fl_up": (-12, 0, 0), "leg_fl_lo": (28, 0, 0), "leg_fr_up": (12, 0, 0), "leg_fr_lo": (22, 0, 0)},
                   {"spine_mid": (0, -0.46 * H, 0)}),
        ]
        return {"Idle": idle, "Walk": walk, "Attack": attack, "Hit": hit, "Die": die}

    if archetype == "serpent":
        idle = [
            (0.00, {"spine": (2, 7, 0), "chest": (2, -7, 0), "tail_1": (0, 14, 0), "tail_2": (0, -18, 0), "tail_3": (0, 14, 0),
                    "upperarm_l": (-10, 0, -10), "forearm_l": (-28, 0, 0), "upperarm_r": (-10, 0, 10), "forearm_r": (-28, 0, 0)},
                   {"pelvis": (0, 0, 0)}),
            (0.85, {"spine": (-2, -7, 0), "chest": (-2, 7, 0), "tail_1": (0, -14, 0), "tail_2": (0, 18, 0), "tail_3": (0, -14, 0),
                    "upperarm_l": (-14, 0, -14), "forearm_l": (-34, 0, 0), "upperarm_r": (-14, 0, 14), "forearm_r": (-34, 0, 0)},
                   {"pelvis": (0, 0.03 * H, 0)}),
            (1.70, {"spine": (2, 7, 0), "chest": (2, -7, 0), "tail_1": (0, 14, 0), "tail_2": (0, -18, 0), "tail_3": (0, 14, 0),
                    "upperarm_l": (-10, 0, -10), "forearm_l": (-28, 0, 0), "upperarm_r": (-10, 0, 10), "forearm_r": (-28, 0, 0)},
                   {"pelvis": (0, 0, 0)}),
        ]
        walk = [
            (0.00, {"pelvis": (6, 12, 0), "spine": (4, -10, 0), "tail_1": (0, 22, 0), "tail_2": (0, -28, 0), "tail_3": (0, 24, 0),
                    "upperarm_l": (-16, 0, -10), "forearm_l": (-28, 0, 0), "upperarm_r": (-8, 0, 10), "forearm_r": (-24, 0, 0)},
                   {"pelvis": (0, 0, 0)}),
            (0.45, {"pelvis": (6, -12, 0), "spine": (4, 10, 0), "tail_1": (0, -22, 0), "tail_2": (0, 28, 0), "tail_3": (0, -24, 0),
                    "upperarm_l": (-8, 0, -10), "forearm_l": (-24, 0, 0), "upperarm_r": (-16, 0, 10), "forearm_r": (-28, 0, 0)},
                   {"pelvis": (0, 0.02 * H, 0)}),
            (0.90, {"pelvis": (6, 12, 0), "spine": (4, -10, 0), "tail_1": (0, 22, 0), "tail_2": (0, -28, 0), "tail_3": (0, 24, 0),
                    "upperarm_l": (-16, 0, -10), "forearm_l": (-28, 0, 0), "upperarm_r": (-8, 0, 10), "forearm_r": (-24, 0, 0)},
                   {"pelvis": (0, 0, 0)}),
        ]
        attack = [
            (0.00, {"spine": (0, 0, 0), "chest": (0, 0, 0), "upperarm_r": (-10, 0, 10), "forearm_r": (-28, 0, 0)}, {"pelvis": (0, 0, 0)}),
            (0.28, {"pelvis": (-10, -14, 0), "spine": (-14, -14, 0), "chest": (-12, -16, 0), "head": (10, 20, 0),
                    "upperarm_r": (-102, -20, 28), "forearm_r": (-64, 0, 0), "upperarm_l": (-38, 12, -22), "forearm_l": (-46, 0, 0)},
                   {"pelvis": (0, 0.05 * H, -0.06 * H)}),
            (0.50, {"pelvis": (14, 14, 0), "spine": (20, 14, 0), "chest": (18, 16, 0), "head": (-14, -16, 0),
                    "upperarm_r": (-34, 28, -14), "forearm_r": (-16, 0, 0), "upperarm_l": (24, -16, -18), "forearm_l": (-28, 0, 0)},
                   {"pelvis": (0, -0.03 * H, 0.12 * H)}),
            (0.72, {"pelvis": (8, 12, 0), "spine": (12, 10, 0), "chest": (10, 10, 0), "upperarm_r": (10, 20, -16), "forearm_r": (-30, 0, 0)},
                   {"pelvis": (0, -0.02 * H, 0.06 * H)}),
            (0.98, {"spine": (0, 0, 0), "chest": (0, 0, 0), "upperarm_r": (-10, 0, 10), "forearm_r": (-28, 0, 0)}, {"pelvis": (0, 0, 0)}),
        ]
        hit = [
            (0.00, {"chest": (0, 0, 0), "head": (0, 0, 0)}, {"pelvis": (0, 0, 0)}),
            (0.14, {"chest": (-16, 10, 0), "head": (-14, -8, 6), "upperarm_l": (-24, 0, -24), "upperarm_r": (-24, 0, 24)}, {"pelvis": (0, 0, -0.05 * H)}),
            (0.44, {"chest": (0, 0, 0), "head": (0, 0, 0)}, {"pelvis": (0, 0, 0)}),
        ]
        die = [
            (0.00, {"pelvis": (0, 0, 0), "spine": (0, 0, 0)}, {"pelvis": (0, 0, 0)}),
            (0.26, {"pelvis": (-16, 12, 0), "spine": (-14, 10, 0), "head": (-22, 0, 10), "upperarm_l": (-36, 0, -34), "upperarm_r": (-36, 0, 34)}, {"pelvis": (0, 0.04 * H, -0.06 * H)}),
            (0.64, {"pelvis": (26, 16, 12), "spine": (24, 8, 8), "head": (28, 12, -10), "tail_1": (12, -20, 0)}, {"pelvis": (0, -0.18 * H, 0.04 * H)}),
            (1.05, {"pelvis": (70, 18, 18), "spine": (18, 6, 8), "head": (16, 18, -14), "upperarm_l": (-76, 0, -36), "upperarm_r": (-68, 0, 38)}, {"pelvis": (0, -0.40 * H, 0.14 * H)}),
            (1.38, {"pelvis": (80, 18, 20), "spine": (12, 6, 8), "head": (12, 20, -16), "upperarm_l": (-80, 0, -40), "upperarm_r": (-72, 0, 42)}, {"pelvis": (0, -0.43 * H, 0.16 * H)}),
        ]
        return {"Idle": idle, "Walk": walk, "Attack": attack, "Hit": hit, "Die": die}

    # avian (Samjoko)
    idle = [
        (0.00, {"wing_in_l": (0, 0, 22), "wing_out_l": (0, 0, 14), "wing_in_r": (0, 0, -22), "wing_out_r": (0, 0, -14), "tail_1": (8, 0, 0)}, {"body": (0, 0.02 * H, 0)}),
        (0.45, {"wing_in_l": (0, 0, -36), "wing_out_l": (0, 0, -24), "wing_in_r": (0, 0, 36), "wing_out_r": (0, 0, 24), "tail_1": (-8, 0, 0)}, {"body": (0, 0.12 * H, 0)}),
        (0.90, {"wing_in_l": (0, 0, 22), "wing_out_l": (0, 0, 14), "wing_in_r": (0, 0, -22), "wing_out_r": (0, 0, -14), "tail_1": (8, 0, 0)}, {"body": (0, 0.02 * H, 0)}),
    ]
    walk = [
        (0.00, {"body": (14, 0, 0), "wing_in_l": (0, 0, 28), "wing_out_l": (0, 0, 20), "wing_in_r": (0, 0, -28), "wing_out_r": (0, 0, -20)}, {"body": (0, 0.04 * H, 0)}),
        (0.32, {"body": (14, 0, 0), "wing_in_l": (0, 0, -44), "wing_out_l": (0, 0, -32), "wing_in_r": (0, 0, 44), "wing_out_r": (0, 0, 32)}, {"body": (0, 0.14 * H, 0)}),
        (0.64, {"body": (14, 0, 0), "wing_in_l": (0, 0, 28), "wing_out_l": (0, 0, 20), "wing_in_r": (0, 0, -28), "wing_out_r": (0, 0, -20)}, {"body": (0, 0.04 * H, 0)}),
    ]
    attack = [
        (0.00, {"body": (0, 0, 0), "talon_l": (0, 0, 0), "talon_r": (0, 0, 0)}, {"body": (0, 0.06 * H, 0)}),
        (0.24, {"body": (-22, 0, 0), "wing_in_l": (0, 0, 40), "wing_in_r": (0, 0, -40), "talon_l": (-36, 0, 0), "talon_r": (-36, 0, 0)}, {"body": (0, 0.18 * H, -0.05 * H)}),
        (0.48, {"body": (30, 0, 0), "wing_in_l": (0, 0, -32), "wing_in_r": (0, 0, 32), "talon_l": (28, 0, 0), "talon_r": (28, 0, 0)}, {"body": (0, -0.02 * H, 0.12 * H)}),
        (0.80, {"body": (0, 0, 0), "talon_l": (0, 0, 0), "talon_r": (0, 0, 0)}, {"body": (0, 0.06 * H, 0)}),
    ]
    hit = [
        (0.00, {"body": (0, 0, 0)}, {"body": (0, 0.06 * H, 0)}),
        (0.14, {"body": (-18, 10, 0), "head": (-12, 0, 8)}, {"body": (0, 0.09 * H, -0.06 * H)}),
        (0.40, {"body": (0, 0, 0)}, {"body": (0, 0.06 * H, 0)}),
    ]
    die = [
        (0.00, {"body": (0, 0, 0)}, {"body": (0, 0.06 * H, 0)}),
        (0.26, {"body": (-22, 16, 18), "wing_in_l": (0, 0, 42), "wing_in_r": (0, 0, -42)}, {"body": (0, 0.10 * H, -0.05 * H)}),
        (0.68, {"body": (48, 20, 32), "wing_in_l": (0, 0, -30), "wing_in_r": (0, 0, 30)}, {"body": (0, -0.24 * H, 0.04 * H)}),
        (1.10, {"body": (84, 22, 26), "wing_in_l": (0, 0, -48), "wing_in_r": (0, 0, 48)}, {"body": (0, -0.45 * H, 0.10 * H)}),
    ]
    return {"Idle": idle, "Walk": walk, "Attack": attack, "Hit": hit, "Die": die}


def rebuild_glb_animations(glb_path, key, archetype):
    raw = glb_path.read_bytes()
    magic, ver, total_len = struct.unpack_from("<4sII", raw, 0)
    assert magic == b"glTF" and ver == 2
    jlen, jtype = struct.unpack_from("<II", raw, 12)
    assert jtype == 0x4E4F534A
    gltf = json.loads(raw[20:20 + jlen].decode("utf-8"))

    bin_off = 20 + jlen
    blen, btype = struct.unpack_from("<II", raw, bin_off)
    assert btype == 0x004E4942
    bin_data = bytearray(raw[bin_off + 8:bin_off + 8 + blen])

    nodes = gltf["nodes"]
    # Build parent map & world rest rotations for every node
    parent_of = {}
    for idx, n in enumerate(nodes):
        for c in n.get("children", []):
            parent_of[c] = idx

    world_q = {}
    def get_world_q(idx):
        if idx in world_q:
            return world_q[idx]
        q_loc = np.array(nodes[idx].get("rotation", [0.0, 0.0, 0.0, 1.0]), dtype=np.float64)
        if idx in parent_of:
            q_w = q_norm(q_mul(get_world_q(parent_of[idx]), q_loc))
        else:
            q_w = q_norm(q_loc)
        world_q[idx] = q_w
        return q_w

    for i in range(len(nodes)):
        get_world_q(i)

    # Estimate character height H from pelvis/body/spine_mid rest Y * 2
    name_to_idx = {n.get("name", ""): i for i, n in enumerate(nodes)}
    H = 2.0
    for probe in ("pelvis", "body", "spine_mid"):
        if probe in name_to_idx:
            ty = nodes[name_to_idx[probe]].get("translation", [0, 1.0, 0])[1]
            if ty > 0.2:
                H = ty * 2.0
                break

    # Append new animation accessors to bufferViews / accessors (keeping all mesh/skin/image bufferViews intact!)
    def append_accessor(arr, comp_type, acc_type, compute_minmax=False):
        while len(bin_data) % 4 != 0:
            bin_data.append(0)
        offset = len(bin_data)
        raw_bytes = arr.astype("<f4").tobytes()
        bin_data.extend(raw_bytes)
        bv_idx = len(gltf["bufferViews"])
        gltf["bufferViews"].append({
            "buffer": 0,
            "byteOffset": offset,
            "byteLength": len(raw_bytes),
        })
        acc = {
            "bufferView": bv_idx,
            "componentType": comp_type,
            "count": len(arr),
            "type": acc_type,
        }
        if compute_minmax:
            acc["min"] = [float(arr.min())]
            acc["max"] = [float(arr.max())]
        acc_idx = len(gltf["accessors"])
        gltf["accessors"].append(acc)
        return acc_idx

    clips = get_clips(key, archetype, H)
    new_anims = []
    for clip_name, frames in clips.items():
        times = np.array([f[0] for f in frames], dtype=np.float32)
        t_acc = append_accessor(times, 5126, "SCALAR", compute_minmax=True)

        # Collect all bone names animated in rotation or translation
        rot_bones = set()
        loc_bones = set()
        for _, rmap, lmap in frames:
            rot_bones.update(rmap.keys())
            loc_bones.update(lmap.keys())

        samplers = []
        channels = []

        for bname in sorted(rot_bones):
            if bname not in name_to_idx:
                continue
            ni = name_to_idx[bname]
            q_rest = np.array(nodes[ni].get("rotation", [0.0, 0.0, 0.0, 1.0]), dtype=np.float64)
            qw_rest = world_q[ni]
            quats = []
            prev_q = None
            for _, rmap, _ in frames:
                rx, ry, rz = rmap.get(bname, (0.0, 0.0, 0.0))
                q = world_delta_to_local_quat(q_rest, qw_rest, rx, ry, rz)
                # Keep shortest quaternion hemisphere for smooth SLERP
                if prev_q is not None and float(np.dot(prev_q, q)) < 0.0:
                    q = -q
                prev_q = q
                quats.append(q)
            q_acc = append_accessor(np.array(quats, dtype=np.float32), 5126, "VEC4")
            s_idx = len(samplers)
            samplers.append({"input": t_acc, "interpolation": "LINEAR", "output": q_acc})
            channels.append({"sampler": s_idx, "target": {"node": ni, "path": "rotation"}})

        for bname in sorted(loc_bones):
            if bname not in name_to_idx:
                continue
            ni = name_to_idx[bname]
            t_rest = np.array(nodes[ni].get("translation", [0.0, 0.0, 0.0]), dtype=np.float64)
            p_wq = world_q[parent_of[ni]] if ni in parent_of else np.array([0.0, 0.0, 0.0, 1.0])
            locs = []
            for _, _, lmap in frames:
                off = lmap.get(bname, (0.0, 0.0, 0.0))
                locs.append(t_rest + world_offset_to_parent_local(p_wq, off))
            l_acc = append_accessor(np.array(locs, dtype=np.float32), 5126, "VEC3")
            s_idx = len(samplers)
            samplers.append({"input": t_acc, "interpolation": "LINEAR", "output": l_acc})
            channels.append({"sampler": s_idx, "target": {"node": ni, "path": "translation"}})

        new_anims.append({"name": clip_name, "channels": channels, "samplers": samplers})

    gltf["animations"] = new_anims
    while len(bin_data) % 4 != 0:
        bin_data.append(0)
    gltf["buffers"][0]["byteLength"] = len(bin_data)

    jbytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(jbytes) % 4 != 0:
        jbytes += b" "

    out_len = 12 + 8 + len(jbytes) + 8 + len(bin_data)
    out = bytearray()
    out += struct.pack("<4sII", b"glTF", 2, out_len)
    out += struct.pack("<II", len(jbytes), 0x4E4F534A)
    out += jbytes
    out += struct.pack("<II", len(bin_data), 0x004E4942)
    out += bin_data
    glb_path.write_bytes(bytes(out))
    return len(new_anims), sum(len(a["channels"]) for a in new_anims), H


def main():
    for key, arch in ARCHETYPES.items():
        p = MON_DIR / f"{key}.glb"
        if not p.is_file():
            print(f"[SKIP] Missing {p}")
            continue
        na, nc, H = rebuild_glb_animations(p, key, arch)
        print(f"[OK] {key:18s} ({arch:9s}, H={H:.2f}m): {na} clips, {nc} channels -> {p.stat().st_size/1024:.0f}KB")
        if key in CORE_SLOTS:
            dst = CORE_DIR / CORE_SLOTS[key]
            shutil.copy2(p, dst)
            print(f"     synced -> {dst.name}")


if __name__ == "__main__":
    main()
