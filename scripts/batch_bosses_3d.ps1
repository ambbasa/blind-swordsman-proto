# 심안: 묵검 v1.03 — 2·3·4막 비무장 보스 3체 고밀도(2048px / octree 384) Hunyuan3D-2mv 배치 스크립트
# 기존 검증된 scripts/local_hunyuan3d.py (자동 rembg 누끼 + 8GB VRAM 안전 관리) 사용
$ErrorActionPreference = "Stop"
$PY = "C:\Users\cheon\.gemini\tools\Hunyuan3D-2\.venv\Scripts\python.exe"
$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT
$OUT = Join-Path $ROOT "scripts\blender\_raw_bosses"
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

$BOSSES = @(
  @{ Name = "boss_act2"; Dir = "scripts/blender/_concepts/boss_act2_mv" },
  @{ Name = "boss_act3"; Dir = "scripts/blender/_concepts/boss_act3_mv" },
  @{ Name = "boss_act4"; Dir = "scripts/blender/_concepts/boss_act4_mv" }
)

foreach ($b in $BOSSES) {
  $dstGlb = Join-Path $OUT ($b.Name + "_raw.glb")
  Write-Host "`n=== Generating $($b.Name) (2048px / octree 384 / auto-rembg) ===" -ForegroundColor Yellow
  & $PY scripts/local_hunyuan3d.py --mv-dir $b.Dir --out $dstGlb --octree 384 --steps 35 --tex-res 2048 --skip-delight
  if ($LASTEXITCODE -ne 0) { throw "Hunyuan3D failed on $($b.Name)" }
}
Write-Host "`nALL 3 BOSS RAW GLBs COMPLETE -> $OUT" -ForegroundColor Green
