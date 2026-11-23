<#
scripts/batch_all_3d.ps1
심안(SIMAN) 원클릭 3D 캐릭터 일괄 배치 스크립트 (토큰 0원 로컬 실행 / 새 채팅 1줄 호출용)
- 자동으로 git pull --ff-only origin main 수행
- 각 캐릭터(hero, minion, heavy, stone, boss)별로:
    * 원본 *_raw.glb가 없거나 -ForceAI 옵션을 주면 Hunyuan3D-2mv (RTX 3070 GPU) 실행
    * 이미 *_raw.glb가 있으면 AI를 생략하고 Blender 5.3 후처리만 15초 만에 재베이킹
- -Push 옵션을 주면 생성된 v2/assets/models/*.glb를 자동 커밋 & 푸시

사용 예시:
  .\scripts\batch_all_3d.ps1                   # 변경된 Blender 자세만 고속 재베이킹 (없는 것만 AI 생성)
  .\scripts\batch_all_3d.ps1 -ForceAI          # 5종 전부 AI부터 새로 생성
  .\scripts\batch_all_3d.ps1 -Only boss -Push  # 보스만 갱신 후 GitHub 푸시
#>
param(
  [ValidateSet("all", "hero", "minion", "heavy", "stone", "boss")]
  [string]$Only = "all",
  [switch]$ForceAI,
  [switch]$NoPull,
  [switch]$Push,
  [int]$Octree = 384,
  [int]$Steps = 30
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$Hy3dPy = "C:\Users\cheon\.gemini\tools\Hunyuan3D-2\.venv\Scripts\python.exe"
$Blender = "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe"

if (-not $NoPull) {
  Write-Host "`n[1] Syncing latest GitHub main..." -ForegroundColor Cyan
  git pull --ff-only origin main
}

$Chars = @(
  @{ id="hero";   mv="scripts/blender/_concepts/hero_b_mv"; raw="scripts/blender/_raw/hero_b_mv_raw.glb"; out="v2/assets/models/hero.glb";   name="Hero";   h=1.85; tris=15000; outl=0.0040; sword=$true  }
  @{ id="minion"; mv="scripts/blender/_concepts/minion_mv"; raw="scripts/blender/_raw/minion_mv_raw.glb"; out="v2/assets/models/minion.glb"; name="Minion"; h=2.40; tris=9000;  outl=0.0042; sword=$false }
  @{ id="heavy";  mv="scripts/blender/_concepts/heavy_mv";  raw="scripts/blender/_raw/heavy_mv_raw.glb";  out="v2/assets/models/heavy.glb";  name="Heavy";  h=3.00; tris=11000; outl=0.0048; sword=$false }
  @{ id="stone";  mv="scripts/blender/_concepts/stone_mv";  raw="scripts/blender/_raw/stone_mv_raw.glb";  out="v2/assets/models/stone.glb";  name="Stone";  h=2.60; tris=11000; outl=0.0048; sword=$false }
  @{ id="boss";   mv="scripts/blender/_concepts/boss_mv";   raw="scripts/blender/_raw/boss_mv_raw.glb";   out="v2/assets/models/boss.glb";   name="Boss";   h=2.80; tris=16000; outl=0.0050; sword=$false }
)

foreach ($c in $Chars) {
  if ($Only -ne "all" -and $c.id -ne $Only) { continue }
  Write-Host "`n================ [$($c.id.ToUpper())] ================" -ForegroundColor Yellow

  if ($ForceAI -or -not (Test-Path $c.raw)) {
    Write-Host "[AI] Running Hunyuan3D-2mv -> $($c.raw)" -ForegroundColor Green
    & $Hy3dPy scripts/local_hunyuan3d.py --mv-dir $c.mv --out $c.raw --octree $Octree --steps $Steps --tex-res 1024 --skip-delight
    if ($LASTEXITCODE -ne 0) { throw "Hunyuan3D failed on $($c.id)" }
  } else {
    Write-Host "[AI] Reusing cached $($c.raw) (pass -ForceAI to regenerate)" -ForegroundColor DarkGray
  }

  $bArgs = @(
    "--background", "--factory-startup",
    "--python", "scripts/blender/postprocess_glb.py", "--",
    "--in", $c.raw, "--out", $c.out, "--name", $c.name,
    "--height", "$($c.h)", "--tris", "$($c.tris)", "--outline", "$($c.outl)", "--rig", "humanoid"
  )
  if ($c.sword) { $bArgs += "--attach-sword" }

  for ($try = 1; $try -le 2; $try++) {
    Write-Host "[Blender] Post-processing -> $($c.out) (try $try)" -ForegroundColor Green
    & $Blender @bArgs
    if ($LASTEXITCODE -eq 0) { break }
    if ($try -eq 2) { throw "Blender failed on $($c.id)" }
  }
}

Write-Host "`n[DONE] Generated GLB summary:" -ForegroundColor Cyan
Get-ChildItem v2\assets\models\*.glb | Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1KB,1)}}, LastWriteTime | Format-Table -AutoSize

if ($Push) {
  git add v2/assets/models/*.glb
  git commit -m "feat(3d): batch update 3D character GLBs ($Only)"
  git push origin main
}
