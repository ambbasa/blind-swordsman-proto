"""Build mobile-optimized static 3D prop GLBs from design/prop-concepts/*.png.

    python scripts/build_ember_props.py --dry-run
    python scripts/build_ember_props.py
    python scripts/build_ember_props.py --only shrine
"""
import argparse
from pathlib import Path
import subprocess

from build_ember_carved import run_step
from run_monsters_mv import find_blender, find_hy3d_python


ROOT = Path(__file__).resolve().parents[1]
PROP_SPECS = {
    "shrine":       {"height": 4.2, "tris": 5500},
    "rock_cluster": {"height": 3.0, "tris": 3800},
    "lantern":      {"height": 2.4, "tris": 3200},
    "pine_tree":    {"height": 4.8, "tris": 5200},
}


def commands(prop_name, args):
    spec = PROP_SPECS[prop_name]
    src_img = ROOT / "design/prop-concepts" / f"{prop_name}.png"
    raw_glb = ROOT / "build/ember-props/raw" / f"{prop_name}_raw.glb"
    out_glb = ROOT / "v2/assets/models/props" / f"{prop_name}.glb"

    if not args.skip_shape_paint:
        if not src_img.is_file():
            raise FileNotFoundError(src_img)
        raw_glb.parent.mkdir(parents=True, exist_ok=True)
        yield (False, [
            args.hy3d_python, ROOT / "scripts/local_hunyuan3d.py",
            "--in", src_img, "--out", raw_glb,
            "--skip-delight", "--tex-res", "1024",
        ])
    elif not raw_glb.is_file():
        raise FileNotFoundError(raw_glb)

    yield (True, [
        find_blender(args.blender), "--background", "--factory-startup", "--python-exit-code", "1",
        "--python", ROOT / "scripts/blender/optimize_static_prop.py", "--",
        "--in", raw_glb, "--out", out_glb,
        "--name", prop_name, "--height", str(spec["height"]), "--tris", str(spec["tris"]),
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=tuple(PROP_SPECS))
    parser.add_argument("--hy3d-python", default=find_hy3d_python())
    parser.add_argument("--blender", default="blender")
    parser.add_argument("--skip-shape-paint", action="store_true", help="Reuse staged raw prop GLBs")
    parser.add_argument("--dry-run", action="store_true", help="Check inputs and print commands")
    args = parser.parse_args()

    targets = [args.only] if args.only else tuple(PROP_SPECS)
    plan = [step for target in targets for step in commands(target, args)]
    for is_blender, cmd in plan:
        argv = list(map(str, cmd))
        print(subprocess.list2cmdline(argv), flush=True)
        if not args.dry_run:
            run_step(argv, is_blender)


if __name__ == "__main__":
    main()
