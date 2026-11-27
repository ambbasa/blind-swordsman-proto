"""Build all 15 Ember & Blade Korean monsters/bosses from pre-split 4-view PNGs.

Pipeline per monster (visual parity with shipped `hero.glb` via `build_ember_eastern.py`):
  1. Read pre-aligned 1024x1024 multi-view inputs directly from:
     `design/character-concepts/ember-eastern-monsters/<key>/{front,back,left,right}.png`
  2. Generate textured 3D mesh via local Hunyuan3D-2mv (`scripts/local_hunyuan3d.py --mv-dir ... --skip-delight`).
  3. Apply hero visual styling (UV-preserving Decimate, Smooth-by-Angle 42 deg, 4-view re-projection,
     pigment plane cleanup, 1024px Normal Map bake, matte painterly BSDF) + archetype rigging & 5 clips
     via `scripts/blender/rig_eastern_monster.py`, saving BOTH:
       - Editable Blender project: `build/eastern_monsters/blend/<key>.blend`
       - Game-ready rigged GLB:    `build/eastern_monsters/models/<key>.glb`
  4. Optional `--optimize` runs `scripts/blender/optimize_glb_mobile.py` (WebP compression + static channel strip).
"""
import argparse
from pathlib import Path
import subprocess
import sys

from build_ember_carved import run_step
from run_monsters_mv import find_blender, find_hy3d_python

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "design/character-concepts/ember-eastern-monsters"
BUILD = ROOT / "build/eastern_monsters"
REQUIRED_VIEWS = ("front.png", "back.png", "left.png", "right.png")

# (archetype, target_height_m, mobile_tris)
MONSTERS = {
    # --- 1) Humanoid bipedal (6) ---
    "baekgol_skeleton":  ("humanoid",  1.95,  8500),
    "jangseung_stone":   ("humanoid",  2.30,  8500),
    "gwibul_bomber":     ("humanoid",  1.40,  7500),
    "dokkaebi_boss":     ("humanoid",  2.65, 11000),
    "susal_ghost":       ("humanoid",  1.90,  8000),
    "bulgasari_charger": ("humanoid",  2.05,  9000),
    # --- 2) Floating ghost / long robe (4) ---
    "changgui_zombie":   ("float",     1.85,  7800),
    "cheonyeo_ghost":    ("float",     1.80,  7800),
    "dalgyalgwishin":    ("float",     1.90,  7800),
    "mudang_wraith":     ("float",     1.90,  8500),
    # --- 3) Gliding long-robe boss (2) ---
    "gumiho_boss":       ("robe",      2.35, 11500),
    "jeoseung_boss":     ("robe",      2.45, 10500),
    # --- 4) Non-human specialized archetypes (3) ---
    "samjoko":           ("avian",     2.00,  8500),
    "imugi_king_boss":   ("serpent",   4.20, 14000),
    "jangsanbeom":       ("quadruped", 1.55,  9500),
}


def verify_mv_dir(key):
    mv_dir = ART / key
    missing = [name for name in REQUIRED_VIEWS if not (mv_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(f"Missing views for {key} in {mv_dir}: {', '.join(missing)}")
    return mv_dir


def build_one(key, args):
    archetype, height, tris = MONSTERS[key]
    mv_dir = verify_mv_dir(key)
    raw_glb = BUILD / "raw" / f"{key}.glb"
    out_glb = BUILD / "models" / f"{key}.glb"
    out_blend = BUILD / "blend" / f"{key}.blend"
    out_preview = BUILD / "previews" / f"{key}_preview.png"

    def run(argv, blender=False):
        argv = list(map(str, argv))
        print(subprocess.list2cmdline(argv), flush=True)
        if not args.dry_run:
            run_step(argv, blender)

    if not args.skip_hy3d:
        raw_glb.parent.mkdir(parents=True, exist_ok=True)
        run([
            args.hy3d_python, ROOT / "scripts/local_hunyuan3d.py",
            "--mv-dir", mv_dir, "--out", raw_glb,
            "--steps", args.steps, "--octree", args.octree,
            "--tex-res", args.tex_res, "--skip-delight"
        ])

    if args.skip_blender:
        return

    blender_cmd = [
        find_blender(args.blender), "--background", "--factory-startup",
        "--python-exit-code", "1", "--python", ROOT / "scripts/blender/rig_eastern_monster.py",
        "--",
        "--in", raw_glb,
        "--out", out_glb,
        "--blend", out_blend,
        "--mv-dir", mv_dir,
        "--key", key,
        "--archetype", archetype,
        "--height", height,
        "--tris", tris,
        "--tex-size", args.tex_res,
        "--sharp-angle", args.sharp_angle,
        "--pigment-clean", args.pigment_clean,
        "--rot-z-deg", args.rot_z_deg,
    ]
    if args.no_normal_bake:
        blender_cmd.append("--no-normal-bake")
    if args.no_project:
        blender_cmd.append("--no-project")
    if args.preview:
        blender_cmd.extend(["--preview-out", out_preview])
    run(blender_cmd, blender=True)

    if args.optimize:
        run([sys.executable, ROOT / "scripts/blender/optimize_glb_mobile.py", out_glb], blender=False)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--only", choices=MONSTERS, help="Build one specific monster")
    p.add_argument("--group", choices=["all", "humanoid", "float", "robe", "nonhuman", "bosses"], default="all")
    p.add_argument("--dry-run", action="store_true", help="Verify inputs and print commands")
    p.add_argument("--skip-hy3d", action="store_true", help="Skip Hunyuan3D and re-run Blender rigging only")
    p.add_argument("--skip-blender", action="store_true", help="Only run Hunyuan3D-2mv shape+texture")
    p.add_argument("--steps", type=int, default=30)
    p.add_argument("--octree", type=int, default=384)
    p.add_argument("--tex-res", type=int, default=1024)
    p.add_argument("--sharp-angle", type=float, default=42.0)
    p.add_argument("--pigment-clean", type=float, default=0.35)
    p.add_argument("--no-normal-bake", action="store_true")
    p.add_argument("--no-project", action="store_true")
    p.add_argument("--rot-z-deg", type=float, default=0.0)
    p.add_argument("--preview", action="store_true", help="Render 3/4 Blender verification PNG")
    p.add_argument("--optimize", action="store_true", help="Run optimize_glb_mobile.py on exported GLB")
    p.add_argument("--hy3d-python", default=find_hy3d_python())
    p.add_argument("--blender", default="blender")
    args = p.parse_args()

    if args.only:
        targets = [args.only]
    elif args.group == "bosses":
        targets = [k for k in MONSTERS if k.endswith("_boss")]
    elif args.group == "nonhuman":
        targets = [k for k, v in MONSTERS.items() if v[0] in ("avian", "serpent", "quadruped")]
    elif args.group in ("humanoid", "float", "robe"):
        targets = [k for k, v in MONSTERS.items() if v[0] == args.group]
    else:
        targets = list(MONSTERS)

    for key in targets:
        build_one(key, args)


if __name__ == "__main__":
    main()
