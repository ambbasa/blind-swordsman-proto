#!/usr/bin/env python3
"""
scripts/run_monsters_mv.py
RTX 3070 8GB 로컬 PC에서 하데스풍 몬스터 4종(minion, heavy, stone, boss) 4방향 턴어라운드 멀티뷰 GLB 일괄 생성 + Blender 리깅/외곽선 후처리 스크립트.

사용 예시:
  python scripts/run_monsters_mv.py                 # 4종 전체 생성 + Blender 후처리
  python scripts/run_monsters_mv.py --only boss     # 보스만 생성
  python scripts/run_monsters_mv.py --octree 320    # VRAM 여유 확보용 해상도
  python scripts/run_monsters_mv.py --skip-blender  # Hunyuan3D-2mv 원본 GLB만 생성
"""
import argparse
import os
import subprocess
import sys

MONSTERS = [
    {
        "id": "minion",
        "mv_dir": "scripts/blender/_concepts/minion_mv",
        "raw_glb": "scripts/blender/_raw/minion_mv_raw.glb",
        "out_glb": "v2/assets/models/minion.glb",
        "height": 2.4,
        "tris": 9000,
        "outline": 0.0042,
    },
    {
        "id": "heavy",
        "mv_dir": "scripts/blender/_concepts/heavy_mv",
        "raw_glb": "scripts/blender/_raw/heavy_mv_raw.glb",
        "out_glb": "v2/assets/models/heavy.glb",
        "height": 3.0,
        "tris": 11000,
        "outline": 0.0048,
    },
    {
        "id": "stone",
        "mv_dir": "scripts/blender/_concepts/stone_mv",
        "raw_glb": "scripts/blender/_raw/stone_mv_raw.glb",
        "out_glb": "v2/assets/models/stone.glb",
        "height": 2.6,
        "tris": 11000,
        "outline": 0.0048,
    },
    {
        "id": "boss",
        "mv_dir": "scripts/blender/_concepts/boss_mv",
        "raw_glb": "scripts/blender/_raw/boss_mv_raw.glb",
        "out_glb": "v2/assets/models/boss.glb",
        "height": 2.8,
        "tris": 16000,
        "outline": 0.0050,
    },
]


def run_cmd(cmd):
    print("\n>>>", " ".join(cmd), flush=True)
    rc = subprocess.run(cmd, check=False).returncode
    if rc != 0:
        sys.exit(rc)


def main():
    p = argparse.ArgumentParser(description="Batch Hades-style Multi-View 3D Monster Generator")
    p.add_argument("--only", choices=["minion", "heavy", "stone", "boss"], default="")
    p.add_argument("--octree", type=int, default=384)
    p.add_argument("--steps", type=int, default=30)
    p.add_argument("--tex-res", type=int, default=1024)
    p.add_argument("--blender", default="blender")
    p.add_argument("--skip-hy3d", action="store_true")
    p.add_argument("--skip-blender", action="store_true")
    args = p.parse_args()

    targets = [m for m in MONSTERS if not args.only or m["id"] == args.only]
    for m in targets:
        print(f"\n================ [{m['id'].upper()}] ================")
        if not args.skip_hy3d:
            run_cmd([
                sys.executable, "scripts/local_hunyuan3d.py",
                "--mv-dir", m["mv_dir"],
                "--out", m["raw_glb"],
                "--octree", str(args.octree),
                "--steps", str(args.steps),
                "--tex-res", str(args.tex_res),
                "--skip-delight",
            ])
        if not args.skip_blender:
            run_cmd([
                args.blender, "--background", "--python", "scripts/blender/postprocess_glb.py", "--",
                "--in", m["raw_glb"],
                "--out", m["out_glb"],
                "--height", str(m["height"]),
                "--tris", str(m["tris"]),
                "--outline", str(m["outline"]),
                "--rig", "humanoid",
            ])
    print("\n[DONE] All requested monster GLB assets generated.")


if __name__ == "__main__":
    main()
