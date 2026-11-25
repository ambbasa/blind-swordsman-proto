"""Build staged GLBs from the eight Ember carved four-view sets.

    python scripts/build_ember_carved.py --dry-run
    python scripts/build_ember_carved.py --only hero
"""
import argparse
from pathlib import Path
import subprocess

from run_monsters_mv import find_blender, find_hy3d_python


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "design/character-concepts/ember-carved-mv"
BUILD = ROOT / "build/ember-carved"
BLENDER = ROOT / "scripts/blender"
CHARACTERS = ("hero", "minion", "heavy", "stone", "boss_act1", "boss_act2", "boss_act3", "boss_act4")


BLENDER_RETRIES = 4
BLENDER_TIMEOUT = 180


def commands(character, args):
    views = ART / f"{character}_mv"
    raw = BUILD / "raw" / f"{character}_raw.glb"
    models = BUILD / "models"
    if not args.skip_shape_paint:
        for view in ("front", "back", "left", "right"):
            image = views / f"{view}.png"
            if not image.is_file():
                raise FileNotFoundError(image)
        yield (False, [args.hy3d_python, ROOT / "scripts/local_hunyuan3d.py",
               "--mv-dir", views, "--out", raw, "--skip-delight", "--tex-res", "1024"])
    elif not raw.is_file():
        raise FileNotFoundError(raw)

    yield (True, [find_blender(args.blender), "--background", "--factory-startup", "--python-exit-code", "1",
           "--python", BLENDER / "build_carved_m2m.py", "--", "--only", character,
           "--raw-dir", raw.parent, "--out-dir", models])


def run_step(argv, is_blender):
    if not is_blender:
        subprocess.run(argv, check=True, cwd=ROOT)
        return
    # Blender 5.3 on Windows intermittently crashes (0xC0000005 in combase.dll/fsmenu_read_system)
    # or deadlocks during WM_init before executing the Python script. Retry native crashes/timeouts,
    # while failing fast on exit code 1 (Python script error from --python-exit-code 1).
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
                f"[WARN] Blender timed out after {BLENDER_TIMEOUT}s (COM/fsmenu startup deadlock), "
                f"retrying ({attempt + 1}/{BLENDER_RETRIES})...",
                flush=True,
            )
    if last_err is not None:
        raise last_err


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=CHARACTERS)
    parser.add_argument("--hy3d-python", default=find_hy3d_python())
    parser.add_argument("--blender", default="blender")
    parser.add_argument("--skip-shape-paint", action="store_true", help="Reuse staged raw meshes")
    parser.add_argument("--dry-run", action="store_true", help="Check inputs and print commands")
    args = parser.parse_args()
    targets = [args.only] if args.only else CHARACTERS
    plan = [step for target in targets for step in commands(target, args)]
    for is_blender, cmd in plan:
        argv = list(map(str, cmd))
        print(subprocess.list2cmdline(argv), flush=True)
        if not args.dry_run:
            run_step(argv, is_blender)


if __name__ == "__main__":
    main()
