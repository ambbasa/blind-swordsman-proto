"""
scripts/batch_3d.py
심안(SIMAN) 올인원 배치 2D -> 3D -> Blender 후처리 -> 종합 미리보기 자동화 스크립트
(터미널 단독 실행 = 토큰 0 / 에이전트 1턴 일괄 실행 = 토큰 90%+ 절감)

지원 모드:
  1) 폴더 자동 스캔 모드 (가장 간단):
     python scripts/batch_3d.py --folder scripts/blender/_concepts
     * 파일명 접두사로 프리셋 자동 인식(--preset auto):
       - hero_*  -> 주인공 프리셋 (1.85m, 15,000 tris, 휴머노이드 리깅 + 환도 장착)
       - boss_*  -> 보스 프리셋   (2.60m, 16,000 tris, 휴머노이드 리깅)
       - prop_*  -> 프롭 프리셋   (2.00m,  3,500 tris, 리깅 없음)
       - 그 외   -> 적군 프리셋   (1.85m, 10,000 tris, 휴머노이드 리깅)

  2) 매니페스트 JSON 모드 (세부 옵션 & 선택적 2D 원화 자동 생성 포함):
     python scripts/batch_3d.py --manifest scripts/batch_manifest.example.json

  3) 유용한 옵션:
     --dry-run   : 실제 실행 없이 처리 대상·명령어 미리 확인
     --force     : 이미 만들어진 .glb가 있어도 덮어쓰기 재생성
     --skip-ai   : 이미 생성된 raw GLB로 전체 모델의 Blender 후처리(외곽선·폴리곤·리깅)만 일괄 재실행
     --engine    : local(기본, RTX 3070 무료 무제한) / auto / trellis / trellis2 / instantmesh
"""
import argparse
import base64
import html
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
IMAGE_TO_3D = ROOT / "scripts" / "image_to_3d.py"
DEFAULT_OUT_DIR = ROOT / "v2" / "assets" / "models"
DEFAULT_PREVIEW_DIR = ROOT / "scripts" / "blender" / "_batch_previews"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}

PRESETS = {
    "hero": {
        "height": 1.85,
        "tris": 15000,
        "outline": 0.0040,
        "rig": "humanoid",
        "attach_sword": True,
        "tex_size": 1024,
    },
    "enemy": {
        "height": 1.85,
        "tris": 10000,
        "outline": 0.0040,
        "rig": "humanoid",
        "attach_sword": False,
        "tex_size": 1024,
    },
    "boss": {
        "height": 2.60,
        "tris": 16000,
        "outline": 0.0055,
        "rig": "humanoid",
        "attach_sword": False,
        "tex_size": 1024,
    },
    "prop": {
        "height": 2.00,
        "tris": 3500,
        "outline": 0.0040,
        "rig": "none",
        "attach_sword": False,
        "tex_size": 512,
    },
}

HADES_STYLE_PREFIX = (
    "Single front-facing strictly symmetrical A-pose full-body 2D game character concept art, "
    "Supergiant Games Hades (Jen Zee) stylized bold black ink outlines, deep pure-black cel shadows, "
    "clean simplified painterly color blocks (NOT photorealistic, NOT cluttered), "
    "Korean dark-fantasy Joseon sumi-ink aesthetic, 6.5-head heroic proportions, "
    "arms extended outward 35 degrees, EMPTY HANDS (no weapon held), legs shoulder-width apart, "
    "solid flat warm parchment background (#e6e2da), no text, no props, no multi-view. Subject: "
)


def infer_preset_from_name(stem: str) -> str:
    low = stem.lower()
    if low.startswith(("hero_", "hero-", "player_", "lobby_")):
        return "hero"
    if low.startswith(("boss_", "boss-")):
        return "boss"
    if low.startswith(("prop_", "prop-", "env_", "stage_", "item_")):
        return "prop"
    return "enemy"


def maybe_generate_2d_concept(prompt: str, dest_path: Path, is_prop: bool = False) -> bool:
    """Optional Stage 0: Generate 2D concept via Gemini Imagen API if GEMINI_API_KEY is set."""
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print(f"  [2D SKIP] GEMINI_API_KEY가 없어 2D 원화 자동 생성을 건너뜁니다 -> {dest_path}")
        return False

    full_prompt = prompt if is_prop else (HADES_STYLE_PREFIX + prompt)
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"imagen-3.0-generate-002:predict?key={api_key}"
    )
    payload = json.dumps({
        "instances": [{"prompt": full_prompt}],
        "parameters": {"sampleCount": 1, "aspectRatio": "3:4"},
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        b64 = data["predictions"][0]["bytesBase64Encoded"]
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_bytes(base64.b64decode(b64))
        print(f"  [Stage 0] Generated 2D concept -> {dest_path}")
        return True
    except Exception as e:
        print(f"  [Stage 0 ERROR] 2D 원화 생성 실패: {e}", file=sys.stderr)
        return False


def load_jobs_from_folder(folder: Path, default_preset: str, out_dir: Path, engine: str) -> list[dict]:
    jobs = []
    for p in sorted(folder.iterdir()):
        if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
            continue
        stem = p.stem
        preset_key = infer_preset_from_name(stem) if default_preset == "auto" else default_preset
        cfg = dict(PRESETS[preset_key])
        jobs.append({
            "name": stem,
            "preset": preset_key,
            "image": str(p.resolve()),
            "out": str((out_dir / f"{stem}.glb").resolve()),
            "engine": engine,
            "yaw": 0.0,
            "seed": 42,
            **cfg,
        })
    return jobs


def load_jobs_from_manifest(manifest_path: Path, out_dir: Path, default_engine: str) -> list[dict]:
    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    items = raw.get("items", raw) if isinstance(raw, dict) else raw
    jobs = []
    for item in items:
        name = item["name"]
        preset_key = item.get("preset") or infer_preset_from_name(name)
        if preset_key not in PRESETS:
            raise ValueError(f"Unknown preset '{preset_key}' for item '{name}'")
        cfg = dict(PRESETS[preset_key])
        for k in ("height", "tris", "outline", "rig", "attach_sword", "tex_size"):
            if k in item:
                cfg[k] = item[k]
        img_raw = item.get("image") or f"scripts/blender/_concepts/{name}.png"
        img_path = Path(img_raw)
        if not img_path.is_absolute():
            img_path = (ROOT / img_path).resolve()
        out_raw = item.get("out")
        if out_raw:
            out_path = Path(out_raw)
            if not out_path.is_absolute():
                out_path = (ROOT / out_path).resolve()
        else:
            out_path = (out_dir / f"{name}.glb").resolve()
        jobs.append({
            "name": name,
            "preset": preset_key,
            "image": str(img_path),
            "prompt": item.get("prompt", ""),
            "out": str(out_path),
            "engine": item.get("engine", default_engine),
            "yaw": float(item.get("yaw", 0.0)),
            "seed": int(item.get("seed", 42)),
            **cfg,
        })
    return jobs


def build_command(job: dict, render_dir: Path, skip_ai: bool, samples: int) -> list[str]:
    cmd = [
        sys.executable,
        str(IMAGE_TO_3D),
        job["image"],
        "-o", job["out"],
        "--name", job["name"],
        "--engine", job["engine"],
        "--seed", str(job["seed"]),
        "--height", str(job["height"]),
        "--yaw", str(job["yaw"]),
        "--tris", str(job["tris"]),
        "--tex-size", str(job["tex_size"]),
        "--outline", str(job["outline"]),
        "--rig", job["rig"],
        "--samples", str(samples),
        "--render-dir", str(render_dir),
    ]
    if job.get("attach_sword"):
        cmd.append("--attach-sword")
    if skip_ai:
        cmd.append("--skip-ai")
    return cmd


def stitch_master_sheet(results: list[dict], preview_dir: Path) -> Path | None:
    rows = []
    for r in results:
        sheet = r.get("turnaround")
        if sheet and Path(sheet).is_file():
            rows.append((r["name"], r["preset"], Image.open(sheet).convert("RGB")))
    if not rows:
        return None
    target_w = min(1800, max(im.width for _, _, im in rows))
    resized = []
    for name, preset, im in rows:
        h = int(round(im.height * (target_w / im.width)))
        resized.append((name, preset, im.resize((target_w, h), Image.Resampling.LANCZOS)))
    pad, hdr = 16, 40
    total_h = sum(im.height + hdr + pad for _, _, im in resized) + pad
    canvas = Image.new("RGB", (target_w + pad * 2, total_h), (18, 18, 22))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("segoeui.ttf", 22)
    except Exception:
        font = ImageFont.load_default()
    y = pad
    for name, preset, im in resized:
        draw.text((pad, y + 6), f"{name}  [{preset}]", fill=(238, 230, 214), font=font)
        canvas.paste(im, (pad, y + hdr))
        y += hdr + im.height + pad
    out_png = preview_dir / "batch_summary.png"
    canvas.save(out_png)
    return out_png


def write_html_report(results: list[dict], preview_dir: Path) -> Path:
    cards = []
    for r in results:
        status_col = "#34d399" if r["status"] in ("OK", "SKIPPED") else "#f87171"
        kb = f"{r['bytes'] / 1024:.0f} KB" if r.get("bytes") else "-"
        src_img = Path(r["image"])
        ta_img = Path(r["turnaround"]) if r.get("turnaround") else None
        src_uri = src_img.as_uri() if src_img.is_file() else ""
        ta_uri = ta_img.as_uri() if (ta_img and ta_img.is_file()) else ""
        cards.append(f"""
        <div class="card">
          <div class="hdr">
            <strong>{html.escape(r['name'])}</strong>
            <span class="tag">{html.escape(r['preset'])}</span>
            <span class="st" style="color:{status_col}">{html.escape(r['status'])}</span>
            <span class="meta">{kb} · {r['elapsed']:.1f}s</span>
          </div>
          <div class="imgs">
            {f'<img class="src" src="{src_uri}" alt="2D">' if src_uri else ''}
            {f'<img class="ta" src="{ta_uri}" alt="3D">' if ta_uri else ''}
          </div>
          <div class="path">{html.escape(r['out'])}</div>
          {f'<div class="err">{html.escape(r["error"])}</div>' if r.get("error") else ''}
        </div>""")
    doc = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>SIMAN 3D Batch Report</title>
<style>
  body {{ background:#141418; color:#ece6da; font-family:'Segoe UI',sans-serif; margin:24px; }}
  h1 {{ margin:0 0 18px; font-size:22px; }}
  .card {{ background:#1e1e24; border:1px solid #32323c; border-radius:10px; padding:14px; margin-bottom:18px; }}
  .hdr {{ display:flex; gap:12px; align-items:center; margin-bottom:10px; font-size:15px; }}
  .tag {{ background:#2c2c38; padding:2px 8px; border-radius:6px; font-size:12px; color:#cbd5e1; }}
  .meta {{ margin-left:auto; color:#9ca3af; font-size:13px; }}
  .imgs {{ display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; }}
  .imgs img.src {{ height:260px; border-radius:6px; border:1px solid #3f3f4a; }}
  .imgs img.ta {{ height:260px; max-width:100%; border-radius:6px; border:1px solid #3f3f4a; }}
  .path {{ margin-top:8px; font-size:12px; color:#94a3b8; word-break:break-all; }}
  .err {{ margin-top:6px; font-size:12px; color:#fca5a5; }}
</style></head><body>
<h1>SIMAN 3D Batch Report ({len(results)} items)</h1>
{''.join(cards)}
</body></html>"""
    out_html = preview_dir / "batch_report.html"
    out_html.write_text(doc, encoding="utf-8")
    return out_html


def main():
    p = argparse.ArgumentParser(description="SIMAN All-in-One Batch 2D->3D->Blender Pipeline")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--folder", help="Folder of 2D concept images (.png/.jpg/.webp)")
    src.add_argument("--manifest", help="Path to JSON batch manifest")
    p.add_argument("--preset", choices=["auto", "hero", "enemy", "boss", "prop"], default="auto",
                   help="Default preset in --folder mode (default: auto by filename prefix)")
    p.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="Default GLB output directory")
    p.add_argument("--preview-dir", default=str(DEFAULT_PREVIEW_DIR), help="Preview sheets & HTML report directory")
    p.add_argument("--engine", choices=["local", "auto", "trellis", "trellis2", "triposg", "instantmesh"], default="local",
                   help="3D AI engine (default: local RTX GPU)")
    p.add_argument("--samples", type=int, default=24, help="Cycles samples for turnaround preview (default 24)")
    p.add_argument("--skip-ai", action="store_true", help="Re-run Blender Stage 2 only on existing raw GLBs")
    p.add_argument("--force", action="store_true", help="Overwrite existing up-to-date GLB outputs")
    p.add_argument("--dry-run", action="store_true", help="Print planned commands without executing")
    args = p.parse_args()

    out_dir = Path(args.out_dir).resolve()
    preview_dir = Path(args.preview_dir).resolve()
    preview_dir.mkdir(parents=True, exist_ok=True)

    if args.folder:
        folder = Path(args.folder).resolve()
        if not folder.is_dir():
            raise FileNotFoundError(f"Folder not found: {folder}")
        jobs = load_jobs_from_folder(folder, args.preset, out_dir, args.engine)
    else:
        manifest = Path(args.manifest).resolve()
        if not manifest.is_file():
            raise FileNotFoundError(f"Manifest not found: {manifest}")
        jobs = load_jobs_from_manifest(manifest, out_dir, args.engine)

    if not jobs:
        print("No jobs found.")
        return

    print(f"=== SIMAN 3D Batch: {len(jobs)} item(s) | engine={args.engine} | skip_ai={args.skip_ai} ===")
    results = []
    t_batch = time.time()

    for idx, job in enumerate(jobs, 1):
        name = job["name"]
        img_path = Path(job["image"])
        out_glb = Path(job["out"])
        item_render_dir = preview_dir / name
        turnaround = item_render_dir / f"{name.lower()}_turnaround.png"
        t0 = time.time()

        print(f"\n[{idx}/{len(jobs)}] {name} (preset={job['preset']}, tris={job['tris']}, rig={job['rig']})")

        # Stage 0: Optional 2D concept generation if image missing & prompt provided
        if not args.skip_ai and not img_path.is_file():
            if job.get("prompt") and not args.dry_run:
                maybe_generate_2d_concept(job["prompt"], img_path, is_prop=(job["preset"] == "prop"))
            if not img_path.is_file() and not args.dry_run:
                msg = f"2D 이미지 없음: {img_path}"
                print(f"  [SKIP] {msg}")
                results.append({"name": name, "preset": job["preset"], "image": str(img_path), "out": str(out_glb),
                                "status": "MISSING_2D", "bytes": 0, "elapsed": 0.0, "turnaround": "", "error": msg})
                continue

        # Smart resume: skip if GLB exists & newer than source image (unless --force or --skip-ai)
        if not args.force and not args.skip_ai and out_glb.is_file() and img_path.is_file():
            if out_glb.stat().st_mtime >= img_path.stat().st_mtime:
                print(f"  [SKIP] 이미 최신 GLB 존재 ({out_glb.stat().st_size:,} bytes) -> --force 로 강제 재생성 가능")
                results.append({
                    "name": name, "preset": job["preset"], "image": str(img_path), "out": str(out_glb),
                    "status": "SKIPPED", "bytes": out_glb.stat().st_size, "elapsed": 0.0,
                    "turnaround": str(turnaround) if turnaround.is_file() else "", "error": "",
                })
                continue

        cmd = build_command(job, item_render_dir, args.skip_ai, args.samples)
        if args.dry_run:
            print("  [DRY-RUN]", " ".join(f'"{c}"' if " " in c else c for c in cmd))
            continue

        proc = subprocess.run(cmd, check=False)
        elapsed = time.time() - t0
        if proc.returncode == 0 and out_glb.is_file():
            sz = out_glb.stat().st_size
            print(f"  [OK] {out_glb.name} ({sz:,} bytes) in {elapsed:.1f}s")
            results.append({
                "name": name, "preset": job["preset"], "image": str(img_path), "out": str(out_glb),
                "status": "OK", "bytes": sz, "elapsed": elapsed,
                "turnaround": str(turnaround) if turnaround.is_file() else "", "error": "",
            })
        else:
            msg = f"image_to_3d.py exited with code {proc.returncode}"
            print(f"  [FAIL] {msg}", file=sys.stderr)
            results.append({
                "name": name, "preset": job["preset"], "image": str(img_path), "out": str(out_glb),
                "status": "FAIL", "bytes": 0, "elapsed": elapsed, "turnaround": "", "error": msg,
            })

    if args.dry_run:
        return

    sheet = stitch_master_sheet(results, preview_dir)
    report = write_html_report(results, preview_dir)
    ok_cnt = sum(1 for r in results if r["status"] in ("OK", "SKIPPED"))
    print(f"\n=== BATCH DONE: {ok_cnt}/{len(results)} succeeded in {time.time() - t_batch:.1f}s ===")
    if sheet:
        print("MASTER_SHEET:", sheet)
    print("HTML_REPORT:", report)


if __name__ == "__main__":
    main()
