# 심안: 묵검 v1.03 — 2·3·4막 비무장 보스 3체 고밀도(2048px / 50k poly) Hunyuan3D-2mv 배치 생성 스크립트
$ErrorActionPreference = "Stop"
$PY = "C:\Users\cheon\.gemini\tools\Hunyuan3D-2\.venv\Scripts\python.exe"
$ROOT = Split-Path -Parent $PSScriptRoot
$OUT = Join-Path $ROOT "scripts\blender\_raw_bosses"
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

$BOSSES = @(
  @{ Name = "boss_act2"; Dir = "scripts\blender\_concepts\boss_act2_mv" },
  @{ Name = "boss_act3"; Dir = "scripts\blender\_concepts\boss_act3_mv" },
  @{ Name = "boss_act4"; Dir = "scripts\blender\_concepts\boss_act4_mv" }
)

foreach ($b in $BOSSES) {
  $srcDir = Join-Path $ROOT $b.Dir
  $dstGlb = Join-Path $OUT ($b.Name + "_raw.glb")
  Write-Host "=== Generating $($b.Name) (2048px / 50k poly) ==="
  & $PY -c @"
import os, torch
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
from hy3dgen.texgen import Hunyuan3DPaintPipeline

src = r'$srcDir'
imgs = {k: Image.open(os.path.join(src, k + '.png')).convert('RGBA') for k in ['front','left','back','right']}
pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2mv', subfolder='hunyuan3d-dit-v2-mv', variant='fp16')
mesh = pipe(image=imgs, num_inference_steps=50, octree_resolution=384, num_chunks=20000)[0]
del pipe; torch.cuda.empty_cache()

paint = Hunyuan3DPaintPipeline.from_pretrained('tencent/Hunyuan3D-2')
mesh = paint(mesh, image=imgs['front'])
mesh.export(r'$dstGlb')
print('SAVED:', r'$dstGlb')
"@
}
Write-Host "ALL 3 BOSS RAW GLBs COMPLETE -> $OUT"
