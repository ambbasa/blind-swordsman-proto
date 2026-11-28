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

RANGED_MONSTERS = frozenset({
    "gwibul_bomber",
    "cheonyeo_ghost",
    "mudang_wraith",
    "gumiho_boss",
    "samjoko",
    "imugi_king_boss",
})

SECONDARY_LAG_BONES = frozenset({
    "head", "tail_1", "tail_2", "tail_3",
    "skirt_mid", "skirt_hem", "skirt_f", "skirt_b", "skirt_l", "skirt_r",
    "wing_out_l", "wing_out_r", "forearm_l", "forearm_r",
})


def _catmull_rom_vec(p0, p1, p2, p3, u):
    """Uniform Catmull-Rom cubic spline (C1 smooth, zero linear sawtooth corners)."""
    u2 = u * u
    u3 = u2 * u
    return 0.5 * (
        (2.0 * p1)
        + (-p0 + p2) * u
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * u2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * u3
    )


def _eval_track_smooth(times, vals, t_query, is_loop):
    """Evaluate a 3D vector track smoothly at time t_query using periodic/clamped Catmull-Rom splines."""
    n = len(times)
    if n == 1:
        return vals[0]
    dur = float(times[-1] - times[0])
    if dur <= 1e-6:
        return vals[0]
    if is_loop:
        tq = ((t_query - times[0]) % dur) + times[0]
    else:
        tq = max(float(times[0]), min(float(times[-1]), t_query))

    # Find segment i such that times[i] <= tq <= times[i+1]
    i = 0
    for k in range(n - 1):
        if tq <= times[k + 1] or k == n - 2:
            i = k
            break
    dt = max(1e-6, float(times[i + 1] - times[i]))
    u = max(0.0, min(1.0, (tq - float(times[i])) / dt))

    if is_loop and n >= 3:
        # Note: loop clips repeat key[0] at key[-1], so unique cycle length is n - 1
        m = n - 1
        p0 = vals[(i - 1) % m]
        p1 = vals[i % m]
        p2 = vals[(i + 1) % m]
        p3 = vals[(i + 2) % m]
        return _catmull_rom_vec(p0, p1, p2, p3, u)

    # Non-loop: smooth Hermite ease (zero overshoot on Hit/Die/Attack)
    # Compute clamped finite-difference slopes (Fritsch-Carlson style damping)
    def slope(idx):
        if idx <= 0:
            return np.zeros(3, dtype=np.float64)
        if idx >= n - 1:
            return np.zeros(3, dtype=np.float64)
        d0 = (vals[idx] - vals[idx - 1]) / max(1e-6, float(times[idx] - times[idx - 1]))
        d1 = (vals[idx + 1] - vals[idx]) / max(1e-6, float(times[idx + 1] - times[idx]))
        # Damp slope where sign reverses so peaks stay crisp and never wobble
        same = (d0 * d1) > 0.0
        avg = 0.5 * (d0 + d1)
        return np.where(same, avg, 0.0)

    m0 = slope(i) * dt
    m1 = slope(i + 1) * dt
    u2 = u * u
    u3 = u2 * u
    h00 = 2.0 * u3 - 3.0 * u2 + 1.0
    h10 = u3 - 2.0 * u2 + u
    h01 = -2.0 * u3 + 3.0 * u2
    h11 = u3 - u2
    return h00 * vals[i] + h10 * m0 + h01 * vals[i + 1] + h11 * m1


def resample_smooth_clip(frames, clip_name, fps=30):
    """Resample sparse keyframe list into buttery-smooth 30fps cubic splines with secondary follow-through."""
    is_loop = clip_name in ("Idle", "Walk")
    dur = float(frames[-1][0] - frames[0][0])
    if dur <= 1e-4 or len(frames) < 2:
        return frames

    n_steps = max(14, min(48, int(round(dur * fps))))
    sample_ts = np.linspace(float(frames[0][0]), float(frames[-1][0]), n_steps + 1)
    src_ts = np.array([f[0] for f in frames], dtype=np.float64)

    rot_bones = sorted({b for _, rm, _ in frames for b in rm.keys()})
    loc_bones = sorted({b for _, _, lm in frames for b in lm.keys()})

    rot_tracks = {
        b: np.array([rm.get(b, (0.0, 0.0, 0.0)) for _, rm, _ in frames], dtype=np.float64)
        for b in rot_bones
    }
    loc_tracks = {
        b: np.array([lm.get(b, (0.0, 0.0, 0.0)) for _, _, lm in frames], dtype=np.float64)
        for b in loc_bones
    }

    dense = []
    for t in sample_ts:
        rm = {}
        for b in rot_bones:
            # Subtle 38ms follow-through drag on head, tails, skirts, wings & forearms for organic motion
            lag = 0.038 if (b in SECONDARY_LAG_BONES and clip_name in ("Idle", "Walk", "Attack")) else 0.0
            v = _eval_track_smooth(src_ts, rot_tracks[b], float(t) - lag, is_loop)
            rm[b] = (float(v[0]), float(v[1]), float(v[2]))
        lm = {}
        for b in loc_bones:
            v = _eval_track_smooth(src_ts, loc_tracks[b], float(t), is_loop)
            lm[b] = (float(v[0]), float(v[1]), float(v[2]))
        dense.append((float(t), rm, lm))
    return dense

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

        # 7-keyframe weapon-tailored Attack clips per species!
        if key == "dokkaebi_boss":
            # Massive Spiked Iron Kanabo (hand_r): towering overhead hoist -> thunderous ground-crater slam!
            attack = [
                (0.00, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -8), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 8), "forearm_r": (-26, 0, 0)},
                       {"pelvis": (0, -0.015 * H, 0)}),
                # Deep crouch + hoist kanabo straight overhead
                (0.22, {"pelvis": (8, 14, -4), "spine": (-8, 8, 0), "chest": (-16, 16, -6), "head": (10, -18, 0),
                        "thigh_l": (-24, 0, 0), "shin_l": (48, 0, 0), "foot_l": (-18, 0, 0),
                        "thigh_r": (-20, 0, 0), "shin_r": (42, 0, 0), "foot_r": (-16, 0, 0),
                        "upperarm_r": (-152, 14, 22), "forearm_r": (-44, 0, 0),
                        "upperarm_l": (-46, -16, -24), "forearm_l": (-56, 0, 0)},
                       {"pelvis": (0, -0.095 * H, -0.05 * H)}),
                # Peak overhead loom (unmistakable heavy boss windup)
                (0.36, {"pelvis": (10, 18, -5), "spine": (-10, 10, 0), "chest": (-18, 20, -6), "head": (12, -22, 0),
                        "thigh_l": (-26, 0, 0), "shin_l": (52, 0, 0), "foot_l": (-20, 0, 0),
                        "thigh_r": (-18, 0, 0), "shin_r": (40, 0, 0), "foot_r": (-16, 0, 0),
                        "upperarm_r": (-166, 16, 20), "forearm_r": (-48, 0, 0),
                        "upperarm_l": (-52, -20, -28), "forearm_l": (-62, 0, 0)},
                       {"pelvis": (0, -0.105 * H, -0.06 * H)}),
                # DEVASTATING OVERHEAD KANABO SLAM!
                (0.52, {"pelvis": (20, -16, 4), "spine": (14, -10, 0), "chest": (28, -18, 5), "head": (-16, 18, 0),
                        "thigh_l": (-40, 0, 0), "shin_l": (52, 0, 0), "foot_l": (-10, 0, 0),
                        "thigh_r": (24, 0, 0),  "shin_r": (22, 0, 0), "foot_r": (16, 0, 0),
                        "upperarm_r": (-18, -16, -10), "forearm_r": (-12, 0, 0),
                        "upperarm_l": (36, 18, -26), "forearm_l": (-34, 0, 0)},
                       {"pelvis": (0, -0.115 * H, 0.12 * H)}),
                # Crater impact hold (feels like heavy iron!)
                (0.68, {"pelvis": (18, -18, 3), "spine": (12, -8, 0), "chest": (24, -16, 4), "head": (-12, 16, 0),
                        "thigh_l": (-36, 0, 0), "shin_l": (48, 0, 0), "foot_l": (-10, 0, 0),
                        "thigh_r": (20, 0, 0),  "shin_r": (20, 0, 0), "foot_r": (12, 0, 0),
                        "upperarm_r": (-8, -18, -12), "forearm_r": (-16, 0, 0),
                        "upperarm_l": (30, 12, -20), "forearm_l": (-32, 0, 0)},
                       {"pelvis": (0, -0.105 * H, 0.10 * H)}),
                (0.98, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -8), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 8), "forearm_r": (-26, 0, 0)},
                       {"pelvis": (0, -0.015 * H, 0)}),
            ]
        elif key == "baekgol_skeleton":
            # Black Pole-Glaive (hand_r): draw wide back-right -> sweeping horizontal-diagonal polearm cleave!
            attack = [
                (0.00, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0)},
                       {"pelvis": (0, -0.015 * H, 0)}),
                (0.20, {"pelvis": (10, 22, -4), "spine": (2, 16, 0), "chest": (-4, 28, -5), "head": (4, -34, 0),
                        "thigh_l": (-22, 0, 0), "shin_l": (44, 0, 0), "thigh_r": (-16, 0, 0), "shin_r": (36, 0, 0),
                        "upperarm_r": (-58, 40, 44), "forearm_r": (-44, 0, 0),
                        "upperarm_l": (-36, -18, -16), "forearm_l": (-52, 0, 0)},
                       {"pelvis": (0, -0.075 * H, -0.04 * H)}),
                (0.32, {"pelvis": (12, 26, -5), "spine": (2, 18, 0), "chest": (-6, 32, -6), "head": (6, -38, 0),
                        "thigh_l": (-24, 0, 0), "shin_l": (48, 0, 0), "thigh_r": (-16, 0, 0), "shin_r": (38, 0, 0),
                        "upperarm_r": (-64, 46, 48), "forearm_r": (-48, 0, 0),
                        "upperarm_l": (-40, -22, -18), "forearm_l": (-56, 0, 0)},
                       {"pelvis": (0, -0.085 * H, -0.05 * H)}),
                # Wide sweeping pole-glaive slash across front!
                (0.48, {"pelvis": (14, -24, 5), "spine": (8, -16, 0), "chest": (18, -32, 6), "head": (-12, 32, 0),
                        "thigh_l": (-38, 0, 0), "shin_l": (46, 0, 0), "thigh_r": (26, 0, 0), "shin_r": (20, 0, 0),
                        "upperarm_r": (-76, -46, -30), "forearm_r": (-14, 0, 0),
                        "upperarm_l": (32, 22, -24), "forearm_l": (-32, 0, 0)},
                       {"pelvis": (0, -0.070 * H, 0.12 * H)}),
                (0.66, {"pelvis": (10, -26, 4), "spine": (6, -12, 0), "chest": (12, -26, 4), "head": (-8, 26, 0),
                        "thigh_l": (-30, 0, 0), "shin_l": (38, 0, 0), "thigh_r": (20, 0, 0), "shin_r": (18, 0, 0),
                        "upperarm_r": (-44, -48, -34), "forearm_r": (-26, 0, 0),
                        "upperarm_l": (26, 16, -18), "forearm_l": (-30, 0, 0)},
                       {"pelvis": (0, -0.055 * H, 0.08 * H)}),
                (0.94, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0)},
                       {"pelvis": (0, -0.015 * H, 0)}),
            ]
        elif key == "susal_ghost":
            # Jade Spirit Spear (hand_r): coil spear low behind waist -> razor-sharp linear lunge thrust!
            attack = [
                (0.00, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0)},
                       {"pelvis": (0, -0.015 * H, 0)}),
                # Coil right arm straight back along hip preparing spear thrust
                (0.20, {"pelvis": (12, 24, -4), "spine": (4, 14, 0), "chest": (6, 26, -4), "head": (-6, -34, 0),
                        "thigh_l": (-26, 0, 0), "shin_l": (52, 0, 0), "thigh_r": (14, 0, 0), "shin_r": (36, 0, 0),
                        "upperarm_r": (34, 18, 16), "forearm_r": (-66, 0, 0),
                        "upperarm_l": (-56, -12, -14), "forearm_l": (-32, 0, 0)},
                       {"pelvis": (0, -0.095 * H, -0.07 * H)}),
                (0.32, {"pelvis": (14, 28, -4), "spine": (4, 16, 0), "chest": (8, 30, -4), "head": (-8, -38, 0),
                        "thigh_l": (-28, 0, 0), "shin_l": (56, 0, 0), "thigh_r": (16, 0, 0), "shin_r": (38, 0, 0),
                        "upperarm_r": (42, 22, 18), "forearm_r": (-74, 0, 0),
                        "upperarm_l": (-62, -14, -14), "forearm_l": (-28, 0, 0)},
                       {"pelvis": (0, -0.105 * H, -0.08 * H)}),
                # Explosive forward linear spear stab!
                (0.46, {"pelvis": (16, -16, 2), "spine": (12, -10, 0), "chest": (20, -18, 2), "head": (-16, 22, 0),
                        "thigh_l": (-44, 0, 0), "shin_l": (52, 0, 0), "thigh_r": (32, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_r": (-88, -10, -4), "forearm_r": (-4, 0, 0),
                        "upperarm_l": (36, 18, -22), "forearm_l": (-36, 0, 0)},
                       {"pelvis": (0, -0.090 * H, 0.16 * H)}),
                # Brief thrust extension hold
                (0.60, {"pelvis": (14, -14, 2), "spine": (10, -8, 0), "chest": (16, -14, 2), "head": (-12, 18, 0),
                        "thigh_l": (-38, 0, 0), "shin_l": (46, 0, 0), "thigh_r": (26, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_r": (-82, -8, -4), "forearm_r": (-8, 0, 0),
                        "upperarm_l": (28, 12, -18), "forearm_l": (-34, 0, 0)},
                       {"pelvis": (0, -0.075 * H, 0.12 * H)}),
                (0.90, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0)},
                       {"pelvis": (0, -0.015 * H, 0)}),
            ]
        elif key == "jeoseung_boss":
            # Huge Crescent Grim-Reaper Scythe (hand_r): draw wide far back-right -> sweeping 180-deg harvest reap!
            attack = [
                (0.00, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0)},
                       {"pelvis": (0, -0.015 * H, 0)}),
                (0.22, {"pelvis": (4, 24, -4), "spine": (-4, 16, 0), "chest": (-8, 30, -6), "head": (6, -34, 0),
                        "thigh_l": (-16 * st, 0, 0), "shin_l": (32 * kn, 0, 0), "thigh_r": (-12 * st, 0, 0), "shin_r": (26 * kn, 0, 0),
                        "upperarm_r": (-76, 48, 44), "forearm_r": (-34, 0, 0),
                        "upperarm_l": (-34, -18, -22), "forearm_l": (-46, 0, 0)},
                       {"pelvis": (0, -0.045 * H, -0.06 * H)}),
                (0.38, {"pelvis": (6, 30, -5), "spine": (-6, 20, 0), "chest": (-10, 36, -6), "head": (8, -40, 0),
                        "thigh_l": (-18 * st, 0, 0), "shin_l": (36 * kn, 0, 0), "thigh_r": (-12 * st, 0, 0), "shin_r": (28 * kn, 0, 0),
                        "upperarm_r": (-84, 54, 48), "forearm_r": (-36, 0, 0),
                        "upperarm_l": (-42, -22, -26), "forearm_l": (-52, 0, 0)},
                       {"pelvis": (0, -0.055 * H, -0.07 * H)}),
                # Sweeping Grim-Reaper 180-deg crescent scythe harvest cleave!
                (0.54, {"pelvis": (14, -26, 5), "spine": (8, -18, 0), "chest": (18, -36, 6), "head": (-12, 34, 0),
                        "thigh_l": (-28 * st, 0, 0), "shin_l": (36 * kn, 0, 0), "thigh_r": (18 * st, 0, 0), "shin_r": (16 * kn, 0, 0),
                        "upperarm_r": (-64, -56, -34), "forearm_r": (-18, 0, 0),
                        "upperarm_l": (30, 20, -24), "forearm_l": (-28, 0, 0)},
                       {"pelvis": (0, -0.040 * H, 0.11 * H)}),
                (0.74, {"pelvis": (10, -28, 4), "spine": (6, -14, 0), "chest": (12, -28, 4), "head": (-8, 28, 0),
                        "upperarm_r": (-38, -54, -36), "forearm_r": (-26, 0, 0),
                        "upperarm_l": (24, 14, -18), "forearm_l": (-28, 0, 0)},
                       {"pelvis": (0, -0.030 * H, 0.06 * H)}),
                (1.00, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0)},
                       {"pelvis": (0, -0.015 * H, 0)}),
            ]
        elif key == "gwibul_bomber":
            # Left-Hand Glowing Fire Talisman (hand_l): lift talisman high in front -> snap forward fireball cast!
            attack = [
                (0.00, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0)},
                       {"pelvis": (0, -0.015 * H, 0)}),
                (0.22, {"pelvis": (-4, -14, 2), "spine": (-6, -8, 0), "chest": (-10, -16, 3), "head": (6, 18, 0),
                        "thigh_l": (-16, 0, 0), "shin_l": (32, 0, 0), "thigh_r": (-16, 0, 0), "shin_r": (32, 0, 0),
                        "upperarm_l": (-102, -16, -20), "forearm_l": (-58, 0, 0),
                        "upperarm_r": (16, 12, 16), "forearm_r": (-44, 0, 0)},
                       {"pelvis": (0, -0.040 * H, -0.05 * H)}),
                (0.38, {"pelvis": (-6, -18, 3), "spine": (-8, -10, 0), "chest": (-14, -20, 4), "head": (8, 22, 0),
                        "thigh_l": (-18, 0, 0), "shin_l": (36, 0, 0), "thigh_r": (-18, 0, 0), "shin_r": (36, 0, 0),
                        "upperarm_l": (-114, -20, -24), "forearm_l": (-66, 0, 0),
                        "upperarm_r": (20, 14, 20), "forearm_r": (-48, 0, 0)},
                       {"pelvis": (0, -0.050 * H, -0.06 * H)}),
                # Snap left talisman hand straight forward launching blazing ember orb!
                (0.54, {"pelvis": (12, 16, -3), "spine": (10, 10, 0), "chest": (18, 18, -3), "head": (-10, -18, 0),
                        "thigh_l": (16, 0, 0), "shin_l": (18, 0, 0), "thigh_r": (-24, 0, 0), "shin_r": (30, 0, 0),
                        "upperarm_l": (-92, 14, -6), "forearm_l": (-8, 0, 0),
                        "upperarm_r": (30, -14, 22), "forearm_r": (-34, 0, 0)},
                       {"pelvis": (0, -0.025 * H, 0.09 * H)}),
                (0.74, {"pelvis": (6, 10, -2), "spine": (4, 6, 0), "chest": (8, 10, -2), "head": (-5, -10, 0),
                        "upperarm_l": (-58, 8, -10), "forearm_l": (-22, 0, 0),
                        "upperarm_r": (16, -6, 14), "forearm_r": (-28, 0, 0)},
                       {"pelvis": (0, -0.020 * H, 0.04 * H)}),
                (0.94, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0)},
                       {"pelvis": (0, -0.015 * H, 0)}),
            ]
        elif key == "gumiho_boss":
            # Right-Hand Mystic Foxfire Orb (hand_r): graceful orb spiral raise -> sweeping foxfire barrage!
            attack = [
                (0.00, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0), **t_i1},
                       {"pelvis": (0, -0.015 * H, 0)}),
                (0.22, {"pelvis": (-4, 14, -3), "spine": (-6, 10, 0), "chest": (-12, 18, -4), "head": (6, -20, 0),
                        "thigh_l": (-14 * st, 0, 0), "shin_l": (28 * kn, 0, 0), "thigh_r": (-14 * st, 0, 0), "shin_r": (28 * kn, 0, 0),
                        "upperarm_r": (-110, 22, 26), "forearm_r": (-44, 0, 0),
                        "upperarm_l": (-48, 22, -16), "forearm_l": (-68, 0, 0), **t_a1},
                       {"pelvis": (0, -0.035 * H * st, -0.05 * H)}),
                (0.38, {"pelvis": (-6, 18, -4), "spine": (-8, 12, 0), "chest": (-16, 22, -5), "head": (8, -24, 0),
                        "thigh_l": (-16 * st, 0, 0), "shin_l": (32 * kn, 0, 0), "thigh_r": (-16 * st, 0, 0), "shin_r": (32 * kn, 0, 0),
                        "upperarm_r": (-124, 26, 30), "forearm_r": (-50, 0, 0),
                        "upperarm_l": (-56, 28, -18), "forearm_l": (-74, 0, 0), **t_a1},
                       {"pelvis": (0, -0.045 * H * st, -0.06 * H)}),
                # Graceful foxfire orb weave forward release!
                (0.56, {"pelvis": (10, -16, 3), "spine": (8, -12, 0), "chest": (16, -24, 4), "head": (-10, 22, 0),
                        "thigh_l": (-22 * st, 0, 0), "shin_l": (28 * kn, 0, 0), "thigh_r": (14 * st, 0, 0), "shin_r": (16 * kn, 0, 0),
                        "upperarm_r": (-88, -22, -8), "forearm_r": (-8, 0, 0),
                        "upperarm_l": (-64, -14, -22), "forearm_l": (-18, 0, 0), **t_a2},
                       {"pelvis": (0, -0.020 * H * st, 0.08 * H)}),
                (0.76, {"pelvis": (6, -12, 2), "spine": (4, -8, 0), "chest": (8, -14, 2), "head": (-5, 14, 0),
                        "upperarm_r": (-58, -14, 12), "forearm_r": (-24, 0, 0),
                        "upperarm_l": (-38, -8, -16), "forearm_l": (-28, 0, 0), **t_a2},
                       {"pelvis": (0, -0.015 * H * st, 0.03 * H)}),
                (0.98, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0), **t_i1},
                       {"pelvis": (0, -0.015 * H, 0)}),
            ]
        else:
            # Default melee humanoid (jangseung_stone heavy unarmed smash)
            attack = [
                (0.00, {"pelvis": (2, 0, 0), "chest": (3, 0, 0), "head": (-2, 0, 0),
                        "thigh_l": (-8, 0, 0), "shin_l": (16, 0, 0), "thigh_r": (-8, 0, 0), "shin_r": (16, 0, 0),
                        "upperarm_l": (4, 0, -6), "forearm_l": (-26, 0, 0), "upperarm_r": (4, 0, 6), "forearm_r": (-26, 0, 0), **t_i1},
                       {"pelvis": (0, -0.015 * H, 0)}),
                (0.18, {"pelvis": (8, 16, -4), "spine": (-4, 10, 0), "chest": (-10, 22, -6), "head": (6, -26, 0),
                        "thigh_l": (-22 * st, 0, 0), "shin_l": (44 * kn, 0, 0), "foot_l": (-18 * st, 0, 0),
                        "thigh_r": (-18 * st, 0, 0), "shin_r": (40 * kn, 0, 0), "foot_r": (-16 * st, 0, 0),
                        "upperarm_r": (-128, 18, 28), "forearm_r": (-64, 0, 0),
                        "upperarm_l": (-34, -14, -18), "forearm_l": (-54, 0, 0), **t_a1},
                       {"pelvis": (0, -0.085 * H * st, -0.04 * H)}),
                (0.30, {"pelvis": (10, 20, -5), "spine": (-5, 12, 0), "chest": (-12, 26, -7), "head": (8, -32, 0),
                        "thigh_l": (-26 * st, 0, 0), "shin_l": (50 * kn, 0, 0), "foot_l": (-20 * st, 0, 0),
                        "thigh_r": (-16 * st, 0, 0), "shin_r": (38 * kn, 0, 0), "foot_r": (-16 * st, 0, 0),
                        "upperarm_r": (-142, 22, 32), "forearm_r": (-70, 0, 0),
                        "upperarm_l": (-40, -18, -22), "forearm_l": (-60, 0, 0), **t_a1},
                       {"pelvis": (0, -0.095 * H * st, -0.05 * H)}),
                (0.46, {"pelvis": (14, -18, 5), "spine": (8, -12, 0), "chest": (22, -26, 6), "head": (-14, 24, 0),
                        "thigh_l": (-38 * st, 0, 0), "shin_l": (46 * kn, 0, 0), "foot_l": (-8 * st, 0, 0),
                        "thigh_r": (26 * st, 0, 0),  "shin_r": (20 * kn, 0, 0), "foot_r": (16 * st, 0, 0),
                        "upperarm_r": (-74, -18, -16), "forearm_r": (-14, 0, 0),
                        "upperarm_l": (36, 18, -22), "forearm_l": (-34, 0, 0), **t_a2},
                       {"pelvis": (0, -0.075 * H * st, 0.11 * H)}),
                (0.64, {"pelvis": (10, -22, 4), "spine": (6, -10, 0), "chest": (16, -22, 4), "head": (-10, 20, 0),
                        "thigh_l": (-30 * st, 0, 0), "shin_l": (38 * kn, 0, 0), "foot_l": (-8 * st, 0, 0),
                        "thigh_r": (20 * st, 0, 0),  "shin_r": (18 * kn, 0, 0), "foot_r": (12 * st, 0, 0),
                        "upperarm_r": (-32, -24, -22), "forearm_r": (-32, 0, 0),
                        "upperarm_l": (28, 12, -16), "forearm_l": (-32, 0, 0), **t_a2},
                       {"pelvis": (0, -0.060 * H * st, 0.08 * H)}),
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
        if key == "mudang_wraith":
            # Dual-wield Shaman Ritual: shake left bronze bell (hand_l) while sweeping right golden fan (hand_r)!
            attack = [
                (0.00, {"chest": (4, 0, 0), "upperarm_l": (-12, 0, -10), "forearm_l": (-34, 0, 0), "upperarm_r": (-12, 0, 10), "forearm_r": (-34, 0, 0)}, {"pelvis": (0, 0.04 * H, 0)}),
                # Raise bronze bell high + cock golden fan wide back-right
                (0.18, {"pelvis": (-6, 16, -2), "chest": (-10, 22, -4), "head": (-4, -18, 0), "skirt_mid": (-12, 0, 4), "skirt_hem": (-18, 0, 6),
                        "upperarm_l": (-112, -8, -24), "forearm_l": (-56, 0, 0),
                        "upperarm_r": (-64, 34, 34), "forearm_r": (-44, 0, 0)},
                       {"pelvis": (0, 0.14 * H, -0.05 * H)}),
                # Ritual bell-shake chime peak!
                (0.34, {"pelvis": (-8, 22, -3), "chest": (-14, 28, -5), "head": (-6, -24, 0), "skirt_mid": (-16, 0, -4), "skirt_hem": (-22, 0, -6),
                        "upperarm_l": (-124, -12, -28), "forearm_l": (-22, 0, 0),
                        "upperarm_r": (-76, 42, 40), "forearm_r": (-48, 0, 0)},
                       {"pelvis": (0, 0.18 * H, -0.06 * H)}),
                # Wide Golden Fan Sweep forward releasing shaman talismans!
                (0.54, {"pelvis": (14, -22, 4), "chest": (18, -32, 5), "head": (-10, 26, 0), "skirt_mid": (24, 0, 6), "skirt_hem": (30, 0, 8),
                        "upperarm_l": (-92, -16, -34), "forearm_l": (-66, 0, 0),
                        "upperarm_r": (-86, -42, -24), "forearm_r": (-12, 0, 0)},
                       {"pelvis": (0, 0.06 * H, 0.09 * H)}),
                (0.76, {"pelvis": (8, -14, 2), "chest": (10, -18, 2), "skirt_mid": (14, 0, 3), "skirt_hem": (18, 0, 4),
                        "upperarm_l": (-56, -8, -22), "forearm_l": (-42, 0, 0),
                        "upperarm_r": (-48, -24, -14), "forearm_r": (-26, 0, 0)},
                       {"pelvis": (0, 0.05 * H, 0.04 * H)}),
                (0.98, {"chest": (4, 0, 0), "upperarm_l": (-12, 0, -10), "forearm_l": (-34, 0, 0), "upperarm_r": (-12, 0, 10), "forearm_r": (-34, 0, 0)}, {"pelvis": (0, 0.04 * H, 0)}),
            ]
        elif key == "cheonyeo_ghost":
            # Left-Hand Floating Spirit Flame (hand_l): eerie rise holding glowing wisp high -> forward palm launch!
            attack = [
                (0.00, {"chest": (4, 0, 0), "upperarm_l": (-12, 0, -10), "forearm_l": (-34, 0, 0), "upperarm_r": (-12, 0, 10), "forearm_r": (-34, 0, 0)}, {"pelvis": (0, 0.04 * H, 0)}),
                (0.24, {"pelvis": (-10, -14, 3), "chest": (-14, -18, 4), "head": (-8, 16, -6), "skirt_mid": (-16, 0, 0), "skirt_hem": (-22, 0, 0),
                        "upperarm_l": (-108, -16, -26), "forearm_l": (-44, 0, 0),
                        "upperarm_r": (-16, 12, 22), "forearm_r": (-46, 0, 0)},
                       {"pelvis": (0, 0.16 * H, -0.06 * H)}),
                (0.40, {"pelvis": (-12, -18, 4), "chest": (-18, -22, 5), "head": (-10, 20, -8), "skirt_mid": (-18, 0, 0), "skirt_hem": (-24, 0, 0),
                        "upperarm_l": (-122, -20, -30), "forearm_l": (-50, 0, 0),
                        "upperarm_r": (-12, 16, 26), "forearm_r": (-52, 0, 0)},
                       {"pelvis": (0, 0.19 * H, -0.07 * H)}),
                (0.56, {"pelvis": (14, 18, -3), "chest": (18, 22, -4), "head": (-12, -18, 4), "skirt_mid": (24, 0, 0), "skirt_hem": (30, 0, 0),
                        "upperarm_l": (-90, 16, -8), "forearm_l": (-6, 0, 0),
                        "upperarm_r": (18, -12, 20), "forearm_r": (-32, 0, 0)},
                       {"pelvis": (0, 0.06 * H, 0.09 * H)}),
                (0.76, {"pelvis": (8, 10, -2), "chest": (10, 12, -2), "skirt_mid": (14, 0, 0), "skirt_hem": (18, 0, 0),
                        "upperarm_l": (-52, 8, -12), "forearm_l": (-22, 0, 0),
                        "upperarm_r": (6, -6, 14), "forearm_r": (-30, 0, 0)},
                       {"pelvis": (0, 0.05 * H, 0.04 * H)}),
                (0.96, {"chest": (4, 0, 0), "upperarm_l": (-12, 0, -10), "forearm_l": (-34, 0, 0), "upperarm_r": (-12, 0, 10), "forearm_r": (-34, 0, 0)}, {"pelvis": (0, 0.04 * H, 0)}),
            ]
        else:
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
        # Left-Hand Jade Dragon Trident (hand_l): coil serpent spine & hoist trident skyward -> thunderous forward thrust & breath!
        attack = [
            (0.00, {"spine": (0, 0, 0), "chest": (0, 0, 0),
                    "upperarm_l": (-10, 0, -10), "forearm_l": (-28, 0, 0),
                    "upperarm_r": (-10, 0, 10), "forearm_r": (-28, 0, 0)}, {"pelvis": (0, 0, 0)}),
            (0.24, {"pelvis": (-10, -16, 0), "spine": (-14, -14, 0), "chest": (-14, -18, 0), "head": (10, 20, 0),
                    "upperarm_l": (-128, -20, -28), "forearm_l": (-46, 0, 0),
                    "upperarm_r": (-36, 14, 24), "forearm_r": (-48, 0, 0)},
                   {"pelvis": (0, 0.06 * H, -0.06 * H)}),
            (0.40, {"pelvis": (-12, -20, 0), "spine": (-16, -18, 0), "chest": (-16, -22, 0), "head": (12, 24, 0),
                    "upperarm_l": (-142, -24, -32), "forearm_l": (-50, 0, 0),
                    "upperarm_r": (-42, 18, 28), "forearm_r": (-54, 0, 0)},
                   {"pelvis": (0, 0.08 * H, -0.07 * H)}),
            (0.58, {"pelvis": (14, 18, 0), "spine": (22, 16, 0), "chest": (20, 22, 0), "head": (-14, -20, 0),
                    "upperarm_l": (-84, 24, 10), "forearm_l": (-10, 0, 0),
                    "upperarm_r": (24, -18, 22), "forearm_r": (-28, 0, 0)},
                   {"pelvis": (0, -0.03 * H, 0.14 * H)}),
            (0.78, {"pelvis": (8, 12, 0), "spine": (12, 10, 0), "chest": (10, 12, 0),
                    "upperarm_l": (-46, 16, 6), "forearm_l": (-22, 0, 0),
                    "upperarm_r": (10, -10, 16), "forearm_r": (-28, 0, 0)},
                   {"pelvis": (0, -0.02 * H, 0.06 * H)}),
            (1.02, {"spine": (0, 0, 0), "chest": (0, 0, 0),
                    "upperarm_l": (-10, 0, -10), "forearm_l": (-28, 0, 0),
                    "upperarm_r": (-10, 0, 10), "forearm_r": (-28, 0, 0)}, {"pelvis": (0, 0, 0)}),
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
    # avian (Samjoko — solar feather ranged cast + hovering wing beat!)
    attack = [
        (0.00, {"body": (0, 0, 0), "wing_in_l": (0, 0, 16), "wing_out_l": (0, 0, 10), "wing_in_r": (0, 0, -16), "wing_out_r": (0, 0, -10), "talon_l": (0, 0, 0), "talon_r": (0, 0, 0)}, {"body": (0, 0.06 * H, 0)}),
        # Flare wings high & arch chest back to gather blazing sun feathers
        (0.24, {"body": (-24, 0, 0), "head": (12, 0, 0), "wing_in_l": (-16, 0, 48), "wing_out_l": (-10, 0, 32), "wing_in_r": (-16, 0, -48), "wing_out_r": (-10, 0, -32), "talon_l": (-30, 0, 0), "talon_r": (-30, 0, 0)}, {"body": (0, 0.20 * H, -0.06 * H)}),
        (0.38, {"body": (-28, 0, 0), "head": (14, 0, 0), "wing_in_l": (-22, 0, 54), "wing_out_l": (-14, 0, 38), "wing_in_r": (-22, 0, -54), "wing_out_r": (-14, 0, -38), "talon_l": (-36, 0, 0), "talon_r": (-36, 0, 0)}, {"body": (0, 0.22 * H, -0.07 * H)}),
        # Explosive forward wing-snap launching golden solar feather projectiles!
        (0.54, {"body": (26, 0, 0), "head": (-14, 0, 0), "wing_in_l": (28, 0, -38), "wing_out_l": (18, 0, -28), "wing_in_r": (28, 0, 38), "wing_out_r": (18, 0, 28), "talon_l": (22, 0, 0), "talon_r": (22, 0, 0)}, {"body": (0, 0.04 * H, 0.12 * H)}),
        (0.74, {"body": (10, 0, 0), "wing_in_l": (8, 0, -14), "wing_out_l": (4, 0, -8), "wing_in_r": (8, 0, 14), "wing_out_r": (4, 0, 8)}, {"body": (0, 0.08 * H, 0.04 * H)}),
        (0.92, {"body": (0, 0, 0), "wing_in_l": (0, 0, 16), "wing_out_l": (0, 0, 10), "wing_in_r": (0, 0, -16), "wing_out_r": (0, 0, -10), "talon_l": (0, 0, 0), "talon_r": (0, 0, 0)}, {"body": (0, 0.06 * H, 0)}),
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

    # Reclaim prior tail-only animation accessors/bufferViews so repeated rebakes never bloat GLB size
    old_anim_accs = set()
    for a in gltf.get("animations", []):
        for s in a.get("samplers", []):
            if "input" in s:
                old_anim_accs.add(s["input"])
            if "output" in s:
                old_anim_accs.add(s["output"])
    if old_anim_accs:
        min_acc = min(old_anim_accs)
        non_anim_accs = set(range(len(gltf["accessors"]))) - old_anim_accs
        if not non_anim_accs or min_acc > max(non_anim_accs):
            old_bvs = {gltf["accessors"][i]["bufferView"] for i in old_anim_accs if "bufferView" in gltf["accessors"][i]}
            if old_bvs:
                min_bv = min(old_bvs)
                non_anim_bvs = set(range(len(gltf["bufferViews"]))) - old_bvs
                if not non_anim_bvs or min_bv > max(non_anim_bvs):
                    min_off = min(gltf["bufferViews"][b].get("byteOffset", 0) for b in old_bvs)
                    max_keep_end = max(
                        (gltf["bufferViews"][b].get("byteOffset", 0) + gltf["bufferViews"][b].get("byteLength", 0))
                        for b in non_anim_bvs
                    ) if non_anim_bvs else 0
                    if min_off >= max_keep_end:
                        gltf["accessors"] = gltf["accessors"][:min_acc]
                        gltf["bufferViews"] = gltf["bufferViews"][:min_bv]
                        bin_data = bin_data[:min_off]

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
    for clip_name, raw_frames in clips.items():
        frames = resample_smooth_clip(raw_frames, clip_name, fps=30)
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
