"""Build static scenery GLBs from SIMAN quarter-view concept PNGs."""
import argparse
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from build_ember_carved import run_step
from run_monsters_mv import find_blender, find_hy3d_python

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "design/scenery-concepts"
BUILD = ROOT / "build/scenery"
# Runtime slot height in metres; mobile triangle target before export.
ASSETS = {
    "marketAwning": (3.4, 5500), "brokenGate": (6, 5500),
    "bambooShrine": (6, 6500), "moonPavilion": (5, 7000),
    "mistPagoda": (7, 6000), "snowHall": (5, 8000),
    "rootArch": (6, 6500), "bellGate": (6, 6500),
    "bloodAltar": (5, 4000), "ribBridge": (3, 6500),
    "siegeTower": (7, 8000), "riftSpire": (7, 4500),
    "corridorPillar": (6, 4000), "ferryJetty": (3, 7500),
    "blackPavilion": (7, 8000), "sealMonolith": (6, 4000),
    "pine_tree": (4.5, 5200), "rock_cluster": (1.3, 3800),
    "lantern": (2.2, 3200), "shrine": (3.6, 5500),
}


def check_glb(path):
    with path.open("rb") as stream:
        header = stream.read(12)
    if (header[:8] != b"glTF\x02\x00\x00\x00" or path.stat().st_size <= 12
            or int.from_bytes(header[8:12], "little") != path.stat().st_size):
        raise ValueError(f"Invalid GLB header or incomplete output: {path}")


def build_one(key, args, work):
    image = ART / key / "quarter.png"
    raw = BUILD / "raw" / (key + ".glb")
    final = BUILD / "models" / (key + ".glb")
    height, tris = ASSETS[key]

    def run(argv, blender=False):
        argv = list(map(str, argv))
        print(subprocess.list2cmdline(argv), flush=True)
        if not args.dry_run:
            run_step(argv, blender)

    if args.skip_shape_paint:
        check_glb(raw)
    else:
        if not image.is_file():
            raise FileNotFoundError(image)
        generated = work / (key + "_raw.glb")
        run([args.hy3d_python, ROOT / "scripts/local_hunyuan3d.py", "--in", image,
             "--out", generated, "--tex-res", "1024", "--skip-delight"])
        if not args.dry_run:
            check_glb(generated)
            raw.parent.mkdir(parents=True, exist_ok=True)
            generated.replace(raw)

    optimized = work / (key + ".glb")
    run([find_blender(args.blender), "--background", "--factory-startup",
         "--python-exit-code", "1", "--python", ROOT / "scripts/blender/optimize_static_prop.py",
         "--", "--in", raw, "--out", optimized, "--name", key, "--height", height,
         "--tris", tris], blender=True)
    if not args.dry_run:
        check_glb(optimized)
        final.parent.mkdir(parents=True, exist_ok=True)
        optimized.replace(final)
        print(f"Saved {final}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=ASSETS, help="Build one asset instead of all 20")
    parser.add_argument("--dry-run", action="store_true", help="Check inputs and print commands")
    parser.add_argument("--skip-shape-paint", action="store_true", help="Optimize an existing raw GLB")
    parser.add_argument("--hy3d-python", default=find_hy3d_python())
    parser.add_argument("--blender", default="blender")
    args = parser.parse_args()
    targets = [args.only] if args.only else ASSETS
    if args.dry_run:
        for key in targets:
            build_one(key, args, BUILD / "work")
        return
    BUILD.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="work-", dir=BUILD) as tmp:
        for key in targets:
            build_one(key, args, Path(tmp))


if __name__ == "__main__":
    main()
