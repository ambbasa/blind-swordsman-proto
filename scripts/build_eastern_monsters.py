"""Build all 15 Ember & Blade Korean monsters/bosses from 4-view turnaround sheets.

Pipeline per monster:
  1. Auto-slice `design/character-concepts/ember-eastern-monsters/<key>_turnaround_4view.png`
     into clean 1024x1024 multi-view inputs (`front.png`, `back.png`, `left.png`, `right.png`).
  2. Generate textured 3D mesh via local Hunyuan3D-2mv (`scripts/local_hunyuan3d.py --mv-dir ... --skip-delight`).
  3. Rig, skin, animate (Idle/Walk/Attack/Hit/Die) using the monster's exact body archetype
     via `scripts/blender/rig_eastern_monster.py`, saving BOTH:
       - Editable Blender project: `build/eastern_monsters/blend/<key>.blend`
       - Game-ready rigged GLB:    `build/eastern_monsters/models/<key>.glb`
"""
import argparse
from pathlib import Path
import subprocess
from PIL import Image, ImageOps
import numpy as np

from build_ember_carved import run_step
from run_monsters_mv import find_blender, find_hy3d_python

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "design/character-concepts/ember-eastern-monsters"
BUILD = ROOT / "build/eastern_monsters"

# (archetype, target_height_m, mobile_tris, view_order)
# view_order describes the left-to-right panels in `<key>_turnaround_4view.png`.
MONSTERS = {
    # --- 1) Humanoid bipedal (6) ---
    "baekgol_skeleton":  ("humanoid",  1.95,  8500, ("front", "right", "left", "back")),
    "jangseung_stone":   ("humanoid",  2.30,  8500, ("front", "right", "back", "left")),
    "gwibul_bomber":     ("humanoid",  1.40,  7500, ("front", "back", "right", "left")),
    "dokkaebi_boss":     ("humanoid",  2.65, 11000, ("front", "back", "right", "left")),
    "susal_ghost":       ("humanoid",  1.90,  8000, ("front", "back", "right", "left")),
    "bulgasari_charger": ("humanoid",  2.05,  9000, ("front", "back", "right", "left")),
    # --- 2) Floating ghost / long robe (4) ---
    "changgui_zombie":   ("float",     1.85,  7800, ("front", "right", "left", "back")),
    "cheonyeo_ghost":    ("float",     1.80,  7800, ("front", "back", "right", "left")),
    "dalgyalgwishin":    ("float",     1.90,  7800, ("front", "back", "right", "left")),
    "mudang_wraith":     ("float",     1.90,  8500, ("front", "back", "right", "left")),
    # --- 3) Gliding long-robe boss (2) ---
    "gumiho_boss":       ("robe",      2.35, 11500, ("front", "back", "right", "left")),
    "jeoseung_boss":     ("robe",      2.45, 10500, ("front", "back", "right", "left")),
    # --- 4) Non-human specialized archetypes (3) ---
    "samjoko":           ("avian",     2.00,  8500, ("front", "back", "right", "left")),
    "imugi_king_boss":   ("serpent",   2.90, 12000, ("front", "back", "right", "left")),
    "jangsanbeom":       ("quadruped", 1.55,  9500, ("front", "back", "left")),
}


def slice_turnaround(key, mv_dir, view_order):
    src = ART / f"{key}_turnaround_4view.png"
    if not src.is_file():
        raise FileNotFoundError(src)
    im = Image.open(src).convert("RGB")
    arr = np.array(im)
    # Detect foreground columns (non-black pixels, threshold > 14)
    col_mask = arr.max(axis=2).max(axis=0) > 14
    w = arr.shape[1]
    spans = []
    in_seg = False
    start = 0
    for x in range(w):
        if col_mask[x] and not in_seg:
            start = x
            in_seg = True
        elif not col_mask[x] and in_seg:
            if x - start > 40:
                spans.append((start, x))
            in_seg = False
    if in_seg and w - start > 40:
        spans.append((start, w))

    expected = len(view_order)
    if len(spans) != expected:
        # Fallback to equal horizontal slices if panels touch slightly
        step = w / expected
        spans = [(int(i * step), int((i + 1) * step)) for i in range(expected)]

    mv_dir.mkdir(parents=True, exist_ok=True)
    saved = {}
    for (x0, x1), vname in zip(spans, view_order):
        sub = arr[:, x0:x1]
        row_mask = sub.max(axis=2).max(axis=1) > 14
        ys = np.where(row_mask)[0]
        y0, y1 = (int(ys[0]), int(ys[-1]) + 1) if len(ys) else (0, sub.shape[0])
        crop = Image.fromarray(sub[y0:y1, :])
        # Fit cleanly inside 1024x1024 pure-black canvas with 8% margin
        canvas = Image.new("RGB", (1024, 1024), (0, 0, 0))
        scale = min(860 / max(1, crop.width), 860 / max(1, crop.height))
        nw, nh = max(1, int(crop.width * scale)), max(1, int(crop.height * scale))
        resized = crop.resize((nw, nh), Image.Resampling.LANCZOS)
        canvas.paste(resized, ((1024 - nw) // 2, (1024 - nh) // 2))
        out_p = mv_dir / f"{vname}.png"
        canvas.save(out_p, format="PNG", optimize=True)
        saved[vname] = out_p

    # If 3-view quadruped (front/back/left), mirror left -> right cleanly
    if "left" in saved and "right" not in saved:
        mirrored = ImageOps.mirror(Image.open(saved["left"]))
        mirrored.save(mv_dir / "right.png", format="PNG", optimize=True)
    elif "right" in saved and "left" not in saved:
        mirrored = ImageOps.mirror(Image.open(saved["right"]))
        mirrored.save(mv_dir / "left.png", format="PNG", optimize=True)
    return mv_dir


def build_one(key, args):
    archetype, height, tris, view_order = MONSTERS[key]
    mv_dir = BUILD / "mv" / key
    raw_glb = BUILD / "raw" / f"{key}.glb"
    out_glb = BUILD / "models" / f"{key}.glb"
    out_blend = BUILD / "blend" / f"{key}.blend"

    def run(argv, blender=False):
        argv = list(map(str, argv))
        print(subprocess.list2cmdline(argv), flush=True)
        if not args.dry_run:
            run_step(argv, blender)

    if not args.skip_hy3d:
        if not args.dry_run or args.slice_only:
            slice_turnaround(key, mv_dir, view_order)
            print(f"[{key}] Sliced {len(view_order)} views -> {mv_dir}")
        else:
            src = ART / f"{key}_turnaround_4view.png"
            if not src.is_file():
                raise FileNotFoundError(src)
        if args.slice_only:
            return
        raw_glb.parent.mkdir(parents=True, exist_ok=True)
        run([
            args.hy3d_python, ROOT / "scripts/local_hunyuan3d.py",
            "--mv-dir", mv_dir, "--out", raw_glb,
            "--steps", args.steps, "--octree", args.octree,
            "--tex-res", args.tex_res, "--skip-delight"
        ])

    if args.skip_blender or args.slice_only:
        return

    run([
        find_blender(args.blender), "--background", "--factory-startup",
        "--python-exit-code", "1", "--python", ROOT / "scripts/blender/rig_eastern_monster.py",
        "--", "--in", raw_glb, "--out", out_glb, "--blend", out_blend,
        "--key", key, "--archetype", archetype, "--height", height, "--tris", tris
    ], blender=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--only", choices=MONSTERS, help="Build one specific monster")
    p.add_argument("--group", choices=["all", "humanoid", "float", "robe", "nonhuman", "bosses"], default="all")
    p.add_argument("--dry-run", action="store_true", help="Verify inputs and print commands")
    p.add_argument("--slice-only", action="store_true", help="Only slice turnaround PNGs into mv/<key>/")
    p.add_argument("--skip-hy3d", action="store_true", help="Skip Hunyuan3D and re-run Blender rigging only")
    p.add_argument("--skip-blender", action="store_true", help="Only run Hunyuan3D-2mv shape+texture")
    p.add_argument("--steps", type=int, default=30)
    p.add_argument("--octree", type=int, default=384)
    p.add_argument("--tex-res", type=int, default=1024)
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
