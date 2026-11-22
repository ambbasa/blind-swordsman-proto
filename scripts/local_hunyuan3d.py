"""
scripts/local_hunyuan3d.py
RTX 3070 (8GB VRAM) 최적화 로컬 Image-to-3D 워커 (Hunyuan3D-2mini-turbo + Hunyuan3D-Paint-v2-0-turbo)
  - 1단계: BackgroundRemover -> Hunyuan3D-2mini-turbo (0.6B, ~4GB VRAM)로 고디테일 3D 메쉬 생성
  - 2단계: Shape 파이프라인 완전 언로드 (VRAM 0MB 초기화)
  - 3단계: Hunyuan3D-Paint-v2-0-turbo (enable_model_cpu_offload + attention/vae slicing)로 1024/2048px UV PBR 텍스처 베이킹
  - 4단계: 텍스처 포함 원본 GLB 저장 (이후 scripts/blender/postprocess_glb.py로 자동 경량화·수묵 외곽선·리깅)
"""
import argparse
import gc
import os
import sys
import time
from pathlib import Path

import torch
from PIL import Image


def patch_windows_hf_symlinks():
    """Avoid WinError 1314 symlink privilege races during multi-threaded snapshot_download on Windows."""
    os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
    try:
        import huggingface_hub.file_download as _fd
        _fd.are_symlinks_supported = lambda cache_dir=None: False
    except Exception:
        pass


def load_hf_token():
    if os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN"):
        return
    tok_path = Path.home() / ".cache" / "huggingface" / "token"
    if tok_path.is_file():
        tok = tok_path.read_text(encoding="utf-8").strip()
        if tok:
            os.environ["HF_TOKEN"] = tok


def prepare_rgba(image_path: str) -> Image.Image:
    from hy3dgen.rembg import BackgroundRemover

    img = Image.open(image_path)
    # If already has genuine transparency, preserve it; otherwise run rembg cleanly!
    if img.mode == "RGBA":
        extrema = img.getextrema()
        if extrema[3][0] < 245:
            return img
        img = img.convert("RGB")
    else:
        img = img.convert("RGB")
    print("[Local3D] Running background removal (rembg)...")
    rembg = BackgroundRemover()
    out = rembg(img)
    del rembg
    gc.collect()
    return out


def main():
    p = argparse.ArgumentParser(description="Local RTX 3070 8GB Hunyuan3D-2mini + Paint Worker")
    p.add_argument("--in", dest="in_img", required=True, help="Input image path")
    p.add_argument("--out", dest="out_glb", required=True, help="Output raw textured GLB path")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--steps", type=int, default=20, help="Shape inference steps (mini-turbo works great at 10~25)")
    p.add_argument("--octree", type=int, default=256, help="Octree resolution (256 or 384)")
    p.add_argument("--max-faces", type=int, default=40000, help="Max faces before UV unwrap + paint (lower = faster & lower VRAM)")
    p.add_argument("--tex-res", type=int, default=1024, help="Paint texture resolution (1024 recommended for 8GB VRAM)")
    p.add_argument("--no-paint", action="store_true", help="Skip texture painting (shape only)")
    args = p.parse_args()

    patch_windows_hf_symlinks()
    load_hf_token()
    os.makedirs(os.path.dirname(os.path.abspath(args.out_glb)), exist_ok=True)
    t0 = time.time()

    image = prepare_rgba(args.in_img)

    # ----------------------------------------------------------
    # STEP 1: High-detail 3D Shape Generation (Hunyuan3D-2mini)
    # ----------------------------------------------------------
    from hy3dgen.shapegen import (
        FaceReducer,
        FloaterRemover,
        DegenerateFaceRemover,
        Hunyuan3DDiTFlowMatchingPipeline,
    )

    print(f"[Local3D] Loading Hunyuan3D-2mini (fp16, CUDA={torch.cuda.is_available()})...")
    shape_pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        "tencent/Hunyuan3D-2mini",
        subfolder="hunyuan3d-dit-v2-mini",
        variant="fp16",
        use_safetensors=True,
        device="cuda",
    )
    print(f"[Local3D] Generating 3D shape (steps={args.steps}, octree={args.octree}, seed={args.seed})...")
    gen = torch.Generator(device="cuda").manual_seed(args.seed)
    mesh = shape_pipe(
        image=image,
        num_inference_steps=args.steps,
        octree_resolution=args.octree,
        num_chunks=8000,
        generator=gen,
        output_type="trimesh",
    )[0]

    # Clean floating noise & reduce faces before UV unwrap + paint (much cleaner UVs & faster paint!)
    mesh = FloaterRemover()(mesh)
    mesh = DegenerateFaceRemover()(mesh)
    mesh = FaceReducer()(mesh, max_facenum=args.max_faces)

    # Save intermediate untextured shape backup right away!
    shape_only_path = str(Path(args.out_glb).with_name(Path(args.out_glb).stem + "_shape.glb"))
    mesh.export(shape_only_path)
    print(f"[Local3D] Shape complete in {time.time() - t0:.1f}s -> {shape_only_path} ({len(mesh.faces):,} faces)")

    # Free ALL shape VRAM cleanly before loading Paint pipeline!
    del shape_pipe
    gc.collect()
    torch.cuda.empty_cache()

    if args.no_paint:
        mesh.export(args.out_glb)
        print(f"[Local3D] Saved shape-only GLB -> {args.out_glb}")
        return

    # ----------------------------------------------------------
    # STEP 2: High-res UV PBR Texture Painting (Hunyuan3D-Paint-v2-0-turbo)
    # ----------------------------------------------------------
    t1 = time.time()
    from hy3dgen.texgen import Hunyuan3DPaintPipeline

    print(f"[Local3D] Loading Hunyuan3D-Paint (hunyuan3d-paint-v2-0-turbo, CPU offload for 8GB VRAM)...")
    paint_pipe = Hunyuan3DPaintPipeline.from_pretrained(
        "tencent/Hunyuan3D-2",
        subfolder="hunyuan3d-paint-v2-0-turbo",
    )
    # Optimize memory footprint for RTX 3070 8GB VRAM
    paint_pipe.config.render_size = args.tex_res
    paint_pipe.config.texture_size = args.tex_res
    paint_pipe.render.default_resolution = args.tex_res
    paint_pipe.render.texture_size = args.tex_res
    paint_pipe.enable_model_cpu_offload()
    for key in ("delight_model", "multiview_model"):
        sub = paint_pipe.models.get(key)
        if sub is not None and hasattr(sub, "pipeline"):
            try:
                sub.pipeline.enable_attention_slicing("max")
            except Exception:
                pass
            try:
                sub.pipeline.enable_vae_slicing()
            except Exception:
                pass

    print(f"[Local3D] Painting {args.tex_res}px UV texture directly from concept art...")
    mesh_textured = paint_pipe(mesh, image=image)
    mesh_textured.export(args.out_glb)
    print(f"[Local3D] Textured GLB saved in {time.time() - t1:.1f}s (total {time.time() - t0:.1f}s) -> {args.out_glb}")

    del paint_pipe
    gc.collect()
    torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
