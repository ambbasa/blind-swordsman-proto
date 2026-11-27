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
BASE_ASSETS = {
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

EXTRA_ASSETS = {
    # 1순위: 스테이지 슬롯 복원용 (9종)
    "ruinedWall": (3.5, 5500), "deadTree": (4.8, 5200),
    "basaltSpire": (5.2, 4200), "bambooGrove": (5.8, 5800),
    "boneRibs": (2.8, 5500), "charredHouse": (4.5, 7500),
    "brokenStall": (2.8, 5500), "woodenBridge": (2.5, 6200),
    "corridorGate": (5.5, 6500),
    # 2순위: 전장 외곽·분위기 보강용 (10종)
    "warBanner": (3.6, 3500), "ironBrazier": (1.6, 3800),
    "bronzeCenser": (1.8, 4200), "mossySteps": (1.2, 3800),
    "moonStele": (3.2, 4000), "snowPillar": (2.6, 4000),
    "dockPilings": (2.0, 4500), "mapleTree": (4.8, 5500),
    "fernCluster": (0.9, 3200), "skyLantern": (0.9, 2800),
    # 3순위: 전투 기믹용 (2종)
    "interactiveBelfry": (4.2, 6500), "interactiveBloodstone": (2.8, 4200),
}

ASSETS = {**BASE_ASSETS, **EXTRA_ASSETS}


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
    parser.add_argument("--only", choices=ASSETS, help="Build one asset instead of a full batch")
    parser.add_argument("--batch", choices=["all", "base20", "extra21"], default="all",
                        help="Select asset group when --only is not set (default: all 41)")
    parser.add_argument("--dry-run", action="store_true", help="Check inputs and print commands")
    parser.add_argument("--skip-shape-paint", action="store_true", help="Optimize an existing raw GLB")
    parser.add_argument("--hy3d-python", default=find_hy3d_python())
    parser.add_argument("--blender", default="blender")
    args = parser.parse_args()
    if args.only:
        targets = [args.only]
    elif args.batch == "base20":
        targets = list(BASE_ASSETS)
    elif args.batch == "extra21":
        targets = list(EXTRA_ASSETS)
    else:
        targets = list(ASSETS)
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
