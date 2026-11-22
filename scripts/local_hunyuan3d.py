"""
scripts/local_hunyuan3d.py
RTX 3070 (8GB VRAM / 16GB RAM) 안전 최적화 로컬 Image-to-3D 워커
  - --phase shape : BackgroundRemover + Hunyuan3D-2mini (fp16) -> *_shape.glb 생성
  - --phase paint : Delight(로드->실행->즉시해제) -> UV 언랩 -> Multiview Paint(CPU 오프로드->실행->즉시해제) -> 1024px UV PBR 베이킹 -> 최종 raw GLB 저장
  - --phase all   : shape 후 paint 순차 실행 (별도 서브프로세스로 실행하면 OS가 RAM/VRAM을 100% 회수해 8GB 카드에서 절대 OOM 없음)
"""
import argparse
import gc
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image


def patch_windows_hf_symlinks():
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


def recenter_rgba(image: Image.Image, border_ratio: float = 0.2) -> Image.Image:
    if image.mode != "RGBA":
        return image.convert("RGB")
    alpha = np.array(image)[:, :, 3]
    nz = np.argwhere(alpha > 0)
    if nz.size == 0:
        return image
    min_r, min_c = nz.min(axis=0)
    max_r, max_c = nz.max(axis=0)
    crop = image.crop((min_c, min_r, max_c + 1, max_r + 1))
    w, h = crop.size
    bw, bh = int(w * border_ratio), int(h * border_ratio)
    nw, nh = w + 2 * bw, h + 2 * bh
    sq = max(nw, nh)
    canvas = Image.new("RGBA", (sq, sq), (255, 255, 255, 0))
    canvas.paste(crop, ((sq - nw) // 2 + bw, (sq - nh) // 2 + bh))
    return canvas


def run_shape(in_img: str, shape_glb: str, seed: int, steps: int, octree: int, max_faces: int):
    t0 = time.time()
    image = prepare_rgba(in_img)

    from hy3dgen.shapegen import (
        FaceReducer,
        FloaterRemover,
        DegenerateFaceRemover,
        Hunyuan3DDiTFlowMatchingPipeline,
    )

    print(f"[Local3D:Shape] Loading Hunyuan3D-2mini (fp16, CUDA={torch.cuda.is_available()})...")
    shape_pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        "tencent/Hunyuan3D-2mini",
        subfolder="hunyuan3d-dit-v2-mini",
        variant="fp16",
        use_safetensors=True,
        device="cuda",
    )
    print(f"[Local3D:Shape] Generating 3D shape (steps={steps}, octree={octree}, seed={seed})...")
    gen = torch.Generator(device="cuda").manual_seed(seed)
    mesh = shape_pipe(
        image=image,
        num_inference_steps=steps,
        octree_resolution=octree,
        num_chunks=8000,
        generator=gen,
        output_type="trimesh",
    )[0]

    mesh = FloaterRemover()(mesh)
    mesh = DegenerateFaceRemover()(mesh)
    mesh = FaceReducer()(mesh, max_facenum=max_faces)

    os.makedirs(os.path.dirname(os.path.abspath(shape_glb)), exist_ok=True)
    mesh.export(shape_glb)
    print(f"[Local3D:Shape] Saved in {time.time() - t0:.1f}s -> {shape_glb} ({len(mesh.faces):,} faces)")


def resolve_paint_paths(subfolder="hunyuan3d-paint-v2-0-turbo"):
    import huggingface_hub
    delight_root = huggingface_hub.snapshot_download(
        repo_id="tencent/Hunyuan3D-2",
        allow_patterns=["hunyuan3d-delight-v2-0/*"],
    )
    mv_root = huggingface_hub.snapshot_download(
        repo_id="tencent/Hunyuan3D-2",
        allow_patterns=[f"{subfolder}/*"],
    )
    return (
        os.path.join(delight_root, "hunyuan3d-delight-v2-0"),
        os.path.join(mv_root, subfolder),
    )


@torch.no_grad()
def run_paint(in_img: str, shape_glb: str, out_glb: str, tex_res: int):
    import trimesh
    from hy3dgen.texgen.pipelines import Hunyuan3DTexGenConfig
    from hy3dgen.texgen.differentiable_renderer.mesh_render import MeshRender
    from hy3dgen.texgen.utils.dehighlight_utils import Light_Shadow_Remover
    from hy3dgen.texgen.utils.multiview_utils import Multiview_Diffusion_Net
    from hy3dgen.texgen.utils.uv_warp_utils import mesh_uv_wrap

    t0 = time.time()
    image = recenter_rgba(prepare_rgba(in_img))
    delight_path, mv_path = resolve_paint_paths("hunyuan3d-paint-v2-0-turbo")

    cfg = Hunyuan3DTexGenConfig(delight_path, mv_path, "hunyuan3d-paint-v2-0-turbo")
    cfg.render_size = tex_res
    cfg.texture_size = tex_res

    # ----------------------------------------------------------
    # 2A. Delight model ONLY (load on CPU -> sequential offload -> run -> FREE!)
    # ----------------------------------------------------------
    print("[Local3D:Paint 1/3] Delighting concept art (low-VRAM sequential)...")
    cfg.device = "cpu"
    delight_model = Light_Shadow_Remover(cfg)
    delight_model.pipeline.enable_model_cpu_offload()
    try:
        delight_model.pipeline.enable_attention_slicing("max")
        delight_model.pipeline.enable_vae_slicing()
    except Exception:
        pass
    delighted_img = delight_model(image)
    del delight_model
    gc.collect()
    torch.cuda.empty_cache()
    print(f"[Local3D:Paint 1/3] Delight complete ({time.time() - t0:.1f}s)")

    # ----------------------------------------------------------
    # 2B. UV Unwrap + Normal/Position Render
    # ----------------------------------------------------------
    print("[Local3D:Paint 2/3] UV unwrapping mesh & rendering multiview guides...")
    loaded = trimesh.load(shape_glb, force="mesh")
    mesh = mesh_uv_wrap(loaded)
    render = MeshRender(default_resolution=tex_res, texture_size=tex_res)
    render.load_mesh(mesh)

    elevs = cfg.candidate_camera_elevs
    azims = cfg.candidate_camera_azims
    weights = cfg.candidate_view_weights

    normal_maps = [render.render_normal(e, a, use_abs_coor=True, return_type="pl") for e, a in zip(elevs, azims)]
    pos_maps = [render.render_position(e, a, return_type="pl") for e, a in zip(elevs, azims)]
    camera_info = [
        (((a // 30) + 9) % 12) // {-20: 1, 0: 1, 20: 1, -90: 3, 90: 3}[e]
        + {-20: 0, 0: 12, 20: 24, -90: 36, 90: 40}[e]
        for a, e in zip(azims, elevs)
    ]

    # ----------------------------------------------------------
    # 2C. Multiview Diffusion ONLY (load on CPU -> offload -> run -> FREE!)
    # ----------------------------------------------------------
    print("[Local3D:Paint 3/3] Generating 6-view consistent textures (RTX 3070 8GB offload)...")
    cfg.device = "cpu"
    mv_model = Multiview_Diffusion_Net(cfg)
    mv_model.pipeline.enable_model_cpu_offload()
    try:
        mv_model.pipeline.enable_attention_slicing("max")
        mv_model.pipeline.enable_vae_slicing()
    except Exception:
        pass
    multiviews = mv_model([delighted_img], normal_maps + pos_maps, camera_info)
    del mv_model
    gc.collect()
    torch.cuda.empty_cache()

    multiviews = [v.resize((tex_res, tex_res)) for v in multiviews]
    proj_tex, proj_cos = [], []
    for view, e, a, w in zip(multiviews, elevs, azims, weights):
        pt, pc, _ = render.back_project(view, e, a)
        proj_tex.append(pt)
        proj_cos.append(w * (pc ** cfg.bake_exp))

    texture, trust = render.fast_bake_texture(proj_tex, proj_cos)
    mask_np = ((trust > 1e-8).squeeze(-1).cpu().numpy() * 255).astype(np.uint8)
    tex_np = render.uv_inpaint(texture, mask_np)
    texture = torch.tensor(tex_np / 255.0).float().to(texture.device)

    render.set_texture(texture)
    textured_mesh = render.save_mesh()
    os.makedirs(os.path.dirname(os.path.abspath(out_glb)), exist_ok=True)
    textured_mesh.export(out_glb)
    print(f"[Local3D:Paint] DONE in {time.time() - t0:.1f}s -> {out_glb} ({os.path.getsize(out_glb):,} bytes)")


def main():
    p = argparse.ArgumentParser(description="Local RTX 3070 8GB Hunyuan3D-2mini + Paint Worker")
    p.add_argument("--in", dest="in_img", required=True)
    p.add_argument("--out", dest="out_glb", required=True)
    p.add_argument("--shape-glb", default="", help="Intermediate shape GLB path")
    p.add_argument("--phase", choices=["all", "shape", "paint"], default="all")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--steps", type=int, default=20)
    p.add_argument("--octree", type=int, default=256)
    p.add_argument("--max-faces", type=int, default=40000)
    p.add_argument("--tex-res", type=int, default=1024)
    p.add_argument("--no-paint", action="store_true")
    args = p.parse_args()

    patch_windows_hf_symlinks()
    load_hf_token()

    shape_glb = args.shape_glb or str(Path(args.out_glb).with_name(Path(args.out_glb).stem + "_shape.glb"))

    if args.phase == "shape":
        run_shape(args.in_img, shape_glb, args.seed, args.steps, args.octree, args.max_faces)
    elif args.phase == "paint":
        run_paint(args.in_img, shape_glb, args.out_glb, args.tex_res)
    else:
        # Run shape and paint in isolated child processes so Windows reclaims 100% RAM/VRAM between phases!
        base_cmd = [sys.executable, __file__, "--in", args.in_img, "--out", args.out_glb, "--shape-glb", shape_glb]
        rc1 = subprocess.run(
            base_cmd + ["--phase", "shape", "--seed", str(args.seed), "--steps", str(args.steps),
                        "--octree", str(args.octree), "--max-faces", str(args.max_faces)],
            check=False,
        ).returncode
        if rc1 != 0:
            sys.exit(rc1)
        if args.no_paint:
            import shutil
            shutil.copy2(shape_glb, args.out_glb)
            return
        rc2 = subprocess.run(
            base_cmd + ["--phase", "paint", "--tex-res", str(args.tex_res)],
            check=False,
        ).returncode
        if rc2 != 0:
            sys.exit(rc2)


if __name__ == "__main__":
    main()
