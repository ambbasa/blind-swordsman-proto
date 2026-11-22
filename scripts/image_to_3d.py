"""
scripts/image_to_3d.py
심안(SIMAN) 2단계 자동 Image-to-3D 파이프라인 (토큰 소모 0원, 터미널 단독 실행 가능!)

  Stage 1: 일러스트 이미지 -> Hugging Face 무료 Image-to-3D AI (Hunyuan3D-2.1 / TRELLIS.2 / Hunyuan3D-2)
           -> 고디테일 텍스처 원본 GLB 생성
  Stage 2: 로컬 Blender 5.3 자동 후처리 (scripts/blender/postprocess_glb.py)
           -> 원점/높이 정렬 + UV 보존 경량화(Decimate) + 텍스처 WebP 최적화
           -> 수묵 먹선 인버티드 헐 외곽선(Hero_Outline) + 휴머노이드 자동 리깅 & 4종 애니메이션(idle/walk/slash/hit)
           -> 게임용 GLB 내보내기 + 4방향 턴어라운드 시트 PNG 자동 생성

사용 예시:
  # 1) 주인공 일러스트로 바로 게임용 3D 모델 생성
  python scripts/image_to_3d.py v2/assets/hero/lobby_ink.webp -o v2/assets/models/hero.glb

  # 2) 엔진 지정 (trellis2 또는 hunyuan21 또는 hunyuan2)
  python scripts/image_to_3d.py v2/assets/hero/lobby_ink.webp -o v2/assets/models/hero.glb --engine trellis2

  # 3) 지형지물/프롭용 (리깅 없음, 가벼운 폴리곤)
  python scripts/image_to_3d.py my_lantern.png -o v2/assets/models/lantern.glb --rig none --height 2.2 --tris 3500 --name Lantern

  # 4) 이미 뽑은 원본 GLB로 방향(--yaw)/외곽선(--outline)/폴리곤(--tris)만 5초 만에 재조정
  python scripts/image_to_3d.py v2/assets/hero/lobby_ink.webp -o v2/assets/models/hero.glb --skip-ai --yaw 180
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
BLENDER_POST = ROOT / "scripts" / "blender" / "postprocess_glb.py"
LOCAL_HUNYUAN_WORKER = ROOT / "scripts" / "local_hunyuan3d.py"
LOCAL_HUNYUAN_PY = Path(r"C:\Users\cheon\.gemini\tools\Hunyuan3D-2\.venv\Scripts\python.exe")
DEFAULT_RAW_DIR = ROOT / "scripts" / "blender" / "_raw"


def find_blender():
    for cand in [
        shutil.which("blender"),
        r"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 4.3\blender.exe",
    ]:
        if cand and os.path.isfile(cand):
            return cand
    raise FileNotFoundError("Blender 실행 파일을 찾을 수 없습니다. PATH 또는 Blender 설치 경로를 확인하세요.")


def prepare_input_png(src_path: Path, tmp_dir: Path) -> Path:
    """Convert .webp/.jpg/.png cleanly to PNG (max 1024px) for reliable HF Gradio upload."""
    img = Image.open(src_path)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    # Preserve aspect ratio, cap longest edge at 1024 for fast upload & clean rembg
    if max(img.size) > 1024:
        img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    out_png = tmp_dir / f"{src_path.stem}.png"
    img.save(out_png, format="PNG")
    return out_png


def extract_file_path(item):
    """Extract local downloaded filepath from gradio_client return item (str or dict)."""
    if isinstance(item, str) and os.path.isfile(item):
        return item
    if isinstance(item, dict):
        for k in ("path", "value", "url"):
            v = item.get(k)
            if isinstance(v, str) and os.path.isfile(v):
                return v
    return None


def get_hf_token():
    tok = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN")
    if tok:
        return tok.strip()
    cache_tok = Path.home() / ".cache" / "huggingface" / "token"
    if cache_tok.is_file():
        t = cache_tok.read_text(encoding="utf-8").strip()
        if t:
            return t
    return None


def run_hunyuan(space_id: str, png_path: Path, raw_out: Path, seed: int, steps: int = 30) -> Path:
    from gradio_client import Client, handle_file

    print(f"[Stage 1] Calling {space_id} (/generation_all, steps={steps}, seed={seed})...")
    hf_token = get_hf_token()
    client = Client(space_id, token=hf_token, verbose=True)
    res = client.predict(
        image=handle_file(str(png_path)),
        mv_image_front=None,
        mv_image_back=None,
        mv_image_left=None,
        mv_image_right=None,
        steps=steps,
        guidance_scale=5.0,
        seed=seed,
        octree_resolution=256,
        check_box_rembg=True,
        num_chunks=8000,
        randomize_seed=False,
        api_name="/generation_all",
    )
    # /generation_all returns (white_mesh_glb, textured_glb, html_stats, seed)
    # Prefer the SECOND GLB (textured!) if present; fallback to first valid .glb file.
    candidates = []
    items = res if isinstance(res, (list, tuple)) else [res]
    for it in items:
        p = extract_file_path(it)
        if p and p.lower().endswith((".glb", ".gltf", ".obj")):
            candidates.append(p)
    if not candidates:
        raise RuntimeError(f"{space_id} returned no 3D file: {res}")
    chosen = candidates[1] if len(candidates) >= 2 else candidates[0]
    raw_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(chosen, raw_out)
    print(f"[Stage 1] Downloaded textured GLB ({raw_out.stat().st_size:,} bytes) -> {raw_out}")
    return raw_out


def run_trellis(png_path: Path, raw_out: Path, seed: int) -> Path:
    from gradio_client import Client, handle_file

    space_id = "trellis-community/TRELLIS"
    print(f"[Stage 1] Calling {space_id} (/preprocess_image -> /generate_and_extract_glb, 1024px UV texture, seed={seed})...")
    hf_token = get_hf_token()
    client = Client(space_id, token=hf_token, verbose=True)

    try:
        client.predict(api_name="/start_session")
    except Exception:
        pass

    pre = client.predict(image=handle_file(str(png_path)), api_name="/preprocess_image")
    pre_path = extract_file_path(pre) or str(png_path)

    res = client.predict(
        image=handle_file(pre_path),
        multiimages=[],
        seed=seed,
        ss_guidance_strength=7.5,
        ss_sampling_steps=12,
        slat_guidance_strength=3.0,
        slat_sampling_steps=12,
        multiimage_algo="stochastic",
        mesh_simplify=0.95,
        texture_size=1024,
        api_name="/generate_and_extract_glb",
    )
    items = res if isinstance(res, (list, tuple)) else [res]
    chosen = None
    for it in reversed(items):
        p = extract_file_path(it)
        if p and p.lower().endswith(".glb"):
            chosen = p
            break
    if not chosen:
        raise RuntimeError(f"TRELLIS returned no GLB: {res}")
    raw_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(chosen, raw_out)
    print(f"[Stage 1] Downloaded TRELLIS 1024px textured GLB ({raw_out.stat().st_size:,} bytes) -> {raw_out}")
    return raw_out


def run_trellis2(png_path: Path, raw_out: Path, seed: int) -> Path:
    from gradio_client import Client, handle_file

    space_id = "microsoft/TRELLIS.2"
    print(f"[Stage 1] Calling {space_id} (preprocess -> image_to_3d -> extract_glb, seed={seed})...")
    hf_token = get_hf_token()
    client = Client(space_id, token=hf_token, verbose=True)

    try:
        client.predict(api_name="/start_session")
    except Exception:
        pass

    pre = client.predict(input=handle_file(str(png_path)), api_name="/preprocess_image")
    pre_path = extract_file_path(pre) or str(png_path)

    client.predict(
        image=handle_file(pre_path),
        seed=seed,
        resolution="1024",
        ss_guidance_strength=7.5,
        ss_guidance_rescale=0.7,
        ss_sampling_steps=12,
        ss_rescale_t=5.0,
        shape_slat_guidance_strength=7.5,
        shape_slat_guidance_rescale=0.5,
        shape_slat_sampling_steps=12,
        shape_slat_rescale_t=3.0,
        tex_slat_guidance_strength=1.0,
        tex_slat_guidance_rescale=0.0,
        tex_slat_sampling_steps=12,
        tex_slat_rescale_t=3.0,
        api_name="/image_to_3d",
    )

    glb_res = client.predict(
        decimation_target=100000,
        texture_size=2048,
        api_name="/extract_glb",
    )
    items = glb_res if isinstance(glb_res, (list, tuple)) else [glb_res]
    chosen = None
    for it in items:
        p = extract_file_path(it)
        if p and p.lower().endswith(".glb"):
            chosen = p
            break
    if not chosen:
        raise RuntimeError(f"TRELLIS.2 returned no GLB: {glb_res}")
    raw_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(chosen, raw_out)
    print(f"[Stage 1] Downloaded TRELLIS.2 GLB ({raw_out.stat().st_size:,} bytes) -> {raw_out}")
    return raw_out


def run_triposg(png_path: Path, raw_out: Path, seed: int) -> Path:
    from gradio_client import Client, handle_file

    space_id = "VAST-AI/TripoSG"
    print(f"[Stage 1] Calling {space_id} (segmentation -> image_to_3d -> run_texture, seed={seed})...")
    hf_token = get_hf_token()
    client = Client(space_id, token=hf_token, verbose=True)

    try:
        client.predict(api_name="/start_session")
    except Exception:
        pass

    seg = client.predict(image=handle_file(str(png_path)), api_name="/run_segmentation")
    seg_path = extract_file_path(seg) or str(png_path)

    mesh_res = client.predict(
        image=handle_file(seg_path),
        seed=seed,
        num_inference_steps=35,
        guidance_scale=7.0,
        simplify=True,
        target_face_num=40000,
        api_name="/image_to_3d",
    )
    mesh_path = extract_file_path(mesh_res)
    if not mesh_path:
        raise RuntimeError(f"TripoSG /image_to_3d returned no GLB: {mesh_res}")

    # Apply PBR texture painted directly from the concept illustration!
    chosen = mesh_path
    try:
        tex_res = client.predict(
            image=handle_file(seg_path),
            mesh_path=mesh_path,
            seed=seed,
            api_name="/run_texture",
        )
        tex_path = extract_file_path(tex_res)
        if tex_path and tex_path.lower().endswith(".glb"):
            chosen = tex_path
    except Exception as e:
        print(f"[WARN] TripoSG /run_texture failed ({e}), trying handle_file(mesh_path)...")
        try:
            tex_res = client.predict(
                image=handle_file(seg_path),
                mesh_path=handle_file(mesh_path),
                seed=seed,
                api_name="/run_texture",
            )
            tex_path = extract_file_path(tex_res)
            if tex_path and tex_path.lower().endswith(".glb"):
                chosen = tex_path
        except Exception as e2:
            print(f"[WARN] TripoSG /run_texture skipped ({e2}); using untextured geometry.")

    raw_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(chosen, raw_out)
    print(f"[Stage 1] Downloaded TripoSG GLB ({raw_out.stat().st_size:,} bytes) -> {raw_out}")
    return raw_out


def run_instantmesh(png_path: Path, raw_out: Path, seed: int) -> Path:
    from gradio_client import Client, handle_file

    space_id = "TencentARC/InstantMesh"
    print(f"[Stage 1] Calling {space_id} (preprocess -> generate_mvs -> make3d, seed={seed})...")
    hf_token = get_hf_token()
    client = Client(space_id, token=hf_token, verbose=True)

    pre = client.predict(input_image=handle_file(str(png_path)), do_remove_background=True, api_name="/preprocess")
    pre_path = extract_file_path(pre) or str(png_path)

    client.predict(
        input_image=handle_file(pre_path),
        sample_steps=75,
        sample_seed=seed,
        api_name="/generate_mvs",
    )

    res = client.predict(api_name="/make3d")
    items = res if isinstance(res, (list, tuple)) else [res]
    chosen = None
    for it in items:
        p = extract_file_path(it)
        if p and p.lower().endswith(".glb"):
            chosen = p
            break
    if not chosen:
        raise RuntimeError(f"InstantMesh returned no GLB: {res}")
    raw_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(chosen, raw_out)
    print(f"[Stage 1] Downloaded InstantMesh GLB ({raw_out.stat().st_size:,} bytes) -> {raw_out}")
    return raw_out


def run_local_hunyuan(png_path: Path, raw_out: Path, seed: int) -> Path:
    if not LOCAL_HUNYUAN_PY.is_file():
        raise FileNotFoundError(f"Local Hunyuan3D-2 venv not found at {LOCAL_HUNYUAN_PY}")
    print(f"[Stage 1] Running LOCAL RTX GPU Hunyuan3D-2mini + Paint (seed={seed})...")
    raw_out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(LOCAL_HUNYUAN_PY),
        str(LOCAL_HUNYUAN_WORKER),
        "--in", str(png_path),
        "--out", str(raw_out),
        "--seed", str(seed),
    ]
    proc = subprocess.run(cmd, check=False)
    if proc.returncode != 0 or not raw_out.is_file():
        raise RuntimeError(f"Local Hunyuan3D-2 worker failed with code {proc.returncode}")
    print(f"[Stage 1] Generated LOCAL textured GLB ({raw_out.stat().st_size:,} bytes) -> {raw_out}")
    return raw_out


def generate_raw_glb(image_path: Path, raw_out: Path, engine: str, seed: int) -> Path:
    with tempfile.TemporaryDirectory(prefix="siman_i23d_") as td:
        png_path = prepare_input_png(image_path, Path(td))
        auto_order = (["local"] if LOCAL_HUNYUAN_PY.is_file() else []) + ["trellis", "trellis2", "triposg", "instantmesh", "hunyuan21"]
        order = {
            "auto": auto_order,
            "local": ["local"],
            "trellis": ["trellis"],
            "trellis2": ["trellis2"],
            "triposg": ["triposg"],
            "instantmesh": ["instantmesh"],
            "hunyuan21": ["hunyuan21"],
            "hunyuan2": ["hunyuan2"],
        }[engine]

        last_err = None
        for eng in order:
            try:
                if eng == "local":
                    return run_local_hunyuan(png_path, raw_out, seed)
                elif eng == "trellis":
                    return run_trellis(png_path, raw_out, seed)
                elif eng == "triposg":
                    return run_triposg(png_path, raw_out, seed)
                elif eng == "instantmesh":
                    return run_instantmesh(png_path, raw_out, seed)
                elif eng == "trellis2":
                    return run_trellis2(png_path, raw_out, seed)
                elif eng == "hunyuan21":
                    return run_hunyuan("tencent/Hunyuan3D-2.1", png_path, raw_out, seed)
                elif eng == "hunyuan2":
                    return run_hunyuan("tencent/Hunyuan3D-2", png_path, raw_out, seed)
            except Exception as e:
                print(f"[WARN] Engine '{eng}' failed: {type(e).__name__}: {e}", file=sys.stderr)
                last_err = e
        raise RuntimeError(f"All Image-to-3D engines failed. Last error: {last_err}")


def stitch_turnaround(render_dir: Path, base_name: str) -> Path | None:
    prefix = base_name.lower()
    views = [
        (f"{prefix}_front.png", "FRONT"),
        (f"{prefix}_three_quarter.png", "3/4 VIEW"),
        (f"{prefix}_back.png", "BACK"),
        (f"{prefix}_game_cam.png", "IN-GAME TOP-DOWN"),
    ]
    paths = [render_dir / f for f, _ in views]
    if not all(p.is_file() for p in paths):
        return None
    imgs = [Image.open(p).convert("RGB") for p in paths]
    w, h = imgs[0].size
    pad, hdr = 12, 44
    canvas = Image.new("RGB", (w * 4 + pad * 5, h + hdr + pad * 2), (24, 24, 28))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("segoeui.ttf", 20)
    except Exception:
        font = ImageFont.load_default()
    for i, ((_, label), im) in enumerate(zip(views, imgs)):
        x = pad + i * (w + pad)
        bbox = draw.textbbox((0, 0), label, font=font)
        tw = bbox[2] - bbox[0]
        draw.text((x + (w - tw) // 2, 10), label, fill=(232, 226, 214), font=font)
        canvas.paste(im, (x, hdr))
    sheet = render_dir / f"{prefix}_turnaround.png"
    canvas.save(sheet)
    print(f"[Stage 2] Saved turnaround sheet -> {sheet}")
    return sheet


def run_blender_postprocess(raw_glb: Path, out_glb: Path, args):
    blender = find_blender()
    cmd = [
        blender,
        "--background",
        "--python", str(BLENDER_POST),
        "--",
        "--in", str(raw_glb),
        "--out", str(out_glb),
        "--name", args.name,
        "--height", str(args.height),
        "--yaw", str(args.yaw),
        "--tris", str(args.tris),
        "--tex-size", str(args.tex_size),
        "--outline", str(args.outline),
        "--rig", args.rig,
        "--samples", str(args.samples),
    ]
    if args.attach_sword:
        cmd.append("--attach-sword")
    if args.render_dir:
        cmd.extend(["--render-dir", str(args.render_dir)])

    print(f"[Stage 2] Running Blender 5.3 post-processing -> {out_glb}")
    proc = subprocess.run(cmd, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"Blender postprocess exited with code {proc.returncode}")

    if args.render_dir:
        stitch_turnaround(Path(args.render_dir), args.name)


def main():
    p = argparse.ArgumentParser(description="SIMAN 2-Stage Image-to-3D + Blender 5.3 Pipeline")
    p.add_argument("image", help="Input 2D concept image (.webp/.png/.jpg)")
    p.add_argument("-o", "--out", required=True, help="Final game-ready GLB output path")
    p.add_argument("--name", default="Hero", help="Base mesh/rig name (e.g. Hero, Boss, Prop)")
    p.add_argument("--engine", choices=["auto", "local", "trellis", "trellis2", "triposg", "instantmesh", "hunyuan21", "hunyuan2"], default="auto",
                   help="Image-to-3D engine (default: auto = local RTX GPU if installed -> trellis -> trellis2 -> triposg -> instantmesh)")
    p.add_argument("--seed", type=int, default=42, help="Random seed for Image-to-3D")
    p.add_argument("--raw-out", default="", help="Path to save/read raw AI GLB (default: scripts/blender/_raw/<name>_raw.glb)")
    p.add_argument("--skip-ai", action="store_true", help="Skip Stage 1 AI and re-run Blender Stage 2 on existing raw GLB")
    p.add_argument("--height", type=float, default=1.85, help="Target height in meters")
    p.add_argument("--yaw", type=float, default=0.0, help="Z-rotation degrees to face -Y front (try 180 or 90 if rotated)")
    p.add_argument("--tris", type=int, default=12000, help="Target body triangle count (0 = keep raw)")
    p.add_argument("--tex-size", type=int, default=1024, help="Max embedded texture size (default 1024)")
    p.add_argument("--outline", type=float, default=0.0045, help="Sumi-ink outline thickness in meters (0 = off)")
    p.add_argument("--rig", choices=["humanoid", "none"], default="humanoid", help="Auto-rig mode")
    p.add_argument("--attach-sword", action="store_true", help="Attach clean sculpted Korean Hwando sword to hand_R")
    p.add_argument("--render-dir", default="", help="Optional output folder for 4-angle studio turnaround PNGs")
    p.add_argument("--samples", type=int, default=32, help="Cycles render samples for turnaround")
    args = p.parse_args()

    img_path = Path(args.image).resolve()
    out_glb = Path(args.out).resolve()
    raw_glb = Path(args.raw_out).resolve() if args.raw_out else (DEFAULT_RAW_DIR / f"{args.name.lower()}_raw.glb")

    if not args.skip_ai:
        if not img_path.is_file():
            raise FileNotFoundError(f"Input image not found: {img_path}")
        generate_raw_glb(img_path, raw_glb, args.engine, args.seed)
    else:
        if not raw_glb.is_file():
            raise FileNotFoundError(f"--skip-ai requested but raw GLB not found: {raw_glb}")
        print(f"[Stage 1] Skipped (--skip-ai). Reusing {raw_glb}")

    run_blender_postprocess(raw_glb, out_glb, args)
    print(f"\nDONE! Game-ready GLB: {out_glb} ({out_glb.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
