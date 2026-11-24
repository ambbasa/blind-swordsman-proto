# 심안: 묵검 v1.31 — 주인공 + 1~4막 보스 5체 일괄 고밀도(2048px / octree 384) Hunyuan3D-2mv 배치 스크립트
# 사용 예시:
#   .\scripts\batch_bosses_3d.ps1                          # 5체 전체 생성 (hero + boss_act1~4)
#   .\scripts\batch_bosses_3d.ps1 -SkipExisting            # 이미 생성된 GLB 건너뛰고 이어서 실행
#   .\scripts\batch_bosses_3d.ps1 -Only hero,boss_act1     # 특정 캐릭터만 선택 실행
param(
  [string[]]$Only = @(),
  [switch]$SkipExisting,
  [int]$Octree = 384,
  [int]$Steps = 35,
  [int]$TexRes = 2048
)

$ErrorActionPreference = "Stop"
$PY = "C:\Users\cheon\.gemini\tools\Hunyuan3D-2\.venv\Scripts\python.exe"
$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT
$OUT = Join-Path $ROOT "scripts\blender\_raw_bosses"
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

$TARGETS = @(
  @{ Name = "hero";      Dir = "scripts/blender/_concepts/hero_mv" },
  @{ Name = "boss_act1"; Dir = "scripts/blender/_concepts/boss_act1_mv" },
  @{ Name = "boss_act2"; Dir = "scripts/blender/_concepts/boss_act2_mv" },
  @{ Name = "boss_act3"; Dir = "scripts/blender/_concepts/boss_act3_mv" },
  @{ Name = "boss_act4"; Dir = "scripts/blender/_concepts/boss_act4_mv" }
)

if ($Only.Count -gt 0) {
  $wanted = @($Only | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $TARGETS = @($TARGETS | Where-Object { $wanted -contains $_.Name })
}

$totalSw = [System.Diagnostics.Stopwatch]::StartNew()
$idx = 0
foreach ($t in $TARGETS) {
  $idx++
  $dstGlb = Join-Path $OUT ($t.Name + "_raw.glb")
  if ($SkipExisting -and (Test-Path $dstGlb)) {
    Write-Host "[$idx/$($TARGETS.Count)] Skipping $($t.Name) (already exists: $dstGlb)" -ForegroundColor DarkGray
    continue
  }
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  Write-Host "`n[$idx/$($TARGETS.Count)] === Generating $($t.Name) (${TexRes}px / octree ${Octree} / steps ${Steps}) ===" -ForegroundColor Yellow
  & $PY scripts/local_hunyuan3d.py --mv-dir $t.Dir --out $dstGlb --octree $Octree --steps $Steps --tex-res $TexRes --skip-delight
  if ($LASTEXITCODE -ne 0) { throw "Hunyuan3D failed on $($t.Name)" }
  $sw.Stop()
  Write-Host "  -> Done $($t.Name) in $([math]::Round($sw.Elapsed.TotalSeconds, 1))s : $dstGlb" -ForegroundColor Cyan
}

$totalSw.Stop()
Write-Host "`nALL $($TARGETS.Count) RAW GLBs COMPLETE in $([math]::Round($totalSw.Elapsed.TotalMinutes, 1)) min -> $OUT" -ForegroundColor Green
