"""Build staged Ember & Blade style Eastern character GLBs (Hunyuan3D-2mv -> Blender -> Verify).

Examples:
    python scripts/build_ember_eastern.py --only hero --dry-run
    python scripts/build_ember_eastern.py --only hero --preview
    python scripts/build_ember_eastern.py --only hero --skip-shape-paint --preview
    python scripts/build_ember_eastern.py --only hero --skip-shape-paint --optimize --deploy
"""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys

from run_monsters_mv import find_blender, find_hy3d_python


ROOT = Path(__file__).resolve().parents[1]
BLENDER_SCRIPTS = ROOT / "scripts" / "blender"
CHARACTERS = (
    "hero",
    "minion",
    "heavy",
    "stone",
    "boss_act1",
    "boss_act2",
    "boss_act3",
    "boss_act4",
)

BLENDER_RETRIES = 4
BLENDER_TIMEOUT = 180


def build_commands(character, args):
    mv_root = Path(args.mv_root) if args.mv_root else (ROOT / "design" / "character-concepts" / "ember-eastern-mv")
    views = mv_root / f"{character}_mv"
    build_root = ROOT / "build" / "ember-eastern"
    raw = build_root / "raw" / f"{character}_raw.glb"
    models = build_root / "models"
    previews = build_root / "previews"
    out_glb = models / f"{character}.glb"

    # Stage 1: Hunyuan3D-2mv 4-view shape + texture generation
    if not args.skip_shape_paint:
        for view in ("front", "back", "left", "right"):
            image = views / f"{view}.png"
            if not image.is_file():
                raise FileNotFoundError(f"Missing turnaround view: {image}")
        yield (
            False,
            [
                args.hy3d_python,
                ROOT / "scripts" / "local_hunyuan3d.py",
                "--mv-dir", views,
                "--out", raw,
                "--skip-delight",
                "--octree", str(args.octree),
                "--steps", str(args.steps),
                "--tex-res", str(args.tex_res),
            ],
        )
    elif not raw.is_file() and not args.dry_run:
        raise FileNotFoundError(f"Missing staged raw mesh (--skip-shape-paint): {raw}")

    # Stage 2: Blender 66-bone rig + Smooth-by-Angle + Normal Bake + 4-view Projection + Great-Dao
    blender_cmd = [
        find_blender(args.blender),
        "--background",
        "--factory-startup",
        "--python-exit-code", "1",
        "--python", BLENDER_SCRIPTS / "build_ember_eastern_m2m.py",
        "--",
        "--only", character,
        "--raw-dir", raw.parent,
        "--out-dir", models,
        "--mv-dir", views,
        "--outline-mode", args.outline_mode,
        "--sword-style", args.sword_style,
        "--tex-size", str(args.tex_res),
        "--sharp-angle", str(args.sharp_angle),
        "--pigment-clean", str(args.pigment_clean),
    ]
    if args.pose:
        blender_cmd.extend(["--pose", args.pose])
    if args.no_normal_bake:
        blender_cmd.append("--no-normal-bake")
    if args.preview:
        blender_cmd.extend(["--preview-out", previews / f"{character}_preview.png"])
    yield (True, blender_cmd)

    # Stage 3 (optional): Mobile WebP & static channel optimization
    if args.optimize:
        yield (
            False,
            [
                sys.executable,
                BLENDER_SCRIPTS / "optimize_glb_mobile.py",
                str(out_glb),
            ],
        )


def run_step(argv, is_blender):
    if not is_blender:
        subprocess.run(argv, check=True, cwd=ROOT)
        return
    last_err = None
    for attempt in range(1, BLENDER_RETRIES + 1):
        try:
            res = subprocess.run(argv, check=False, cwd=ROOT, timeout=BLENDER_TIMEOUT)
            if res.returncode == 0:
                return
            last_err = subprocess.CalledProcessError(res.returncode, argv)
            if res.returncode == 1 or attempt == BLENDER_RETRIES:
                raise last_err
            print(
                f"[WARN] Blender native crash (exit {res.returncode}), retrying ({attempt + 1}/{BLENDER_RETRIES})...",
                flush=True,
            )
        except subprocess.TimeoutExpired as exc:
            last_err = exc
            if attempt == BLENDER_RETRIES:
                raise
            print(
                f"[WARN] Blender timed out after {BLENDER_TIMEOUT}s, retrying ({attempt + 1}/{BLENDER_RETRIES})...",
                flush=True,
            )
    if last_err is not None:
        raise last_err


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=CHARACTERS, default="hero", help="Character to build (default: hero)")
    parser.add_argument("--all", action="store_true", help="Build all 8 characters instead of --only")
    parser.add_argument("--mv-root", default=None, help="Override 4-view concept directory root")
    parser.add_argument("--hy3d-python", default=find_hy3d_python())
    parser.add_argument("--blender", default="blender")
    parser.add_argument("--octree", type=int, default=384)
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--tex-res", type=int, default=1024)
    parser.add_argument("--pose", choices=("apose", "tpose"), default=None)
    parser.add_argument("--outline-mode", choices=("none", "subtle", "ink"), default="none")
    parser.add_argument("--sword-style", choices=("ember-dao", "template"), default="ember-dao")
    parser.add_argument("--sharp-angle", type=float, default=42.0)
    parser.add_argument("--pigment-clean", type=float, default=0.35)
    parser.add_argument("--no-normal-bake", action="store_true")
    parser.add_argument("--skip-shape-paint", action="store_true", help="Reuse staged raw GLB")
    parser.add_argument("--preview", action="store_true", help="Render 3/4 Blender verification PNG")
    parser.add_argument("--optimize", action="store_true", help="Run optimize_glb_mobile.py on exported GLB")
    parser.add_argument("--deploy", action="store_true", help="Copy verified GLB into v2/assets/models/")
    parser.add_argument("--dry-run", action="store_true", help="Validate inputs and print planned commands")
    args = parser.parse_args()

    targets = list(CHARACTERS) if args.all else [args.only]
    for target in targets:
        plan = list(build_commands(target, args))
        for is_blender, cmd in plan:
            argv = list(map(str, cmd))
            print(subprocess.list2cmdline(argv), flush=True)
            if not args.dry_run:
                run_step(argv, is_blender)
        if args.deploy and not args.dry_run:
            src = ROOT / "build" / "ember-eastern" / "models" / f"{target}.glb"
            dst_name = "boss.glb" if target == "boss_act1" else f"{target}.glb"
            dst = ROOT / "v2" / "assets" / "models" / dst_name
            shutil.copy2(src, dst)
            print(f"[DEPLOYED] {src} -> {dst}")


if __name__ == "__main__":
    main()
