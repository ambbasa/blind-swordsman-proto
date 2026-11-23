# 심안: 묵검 (`blind-swordsman-proto`) 개발 인수인계 & 핵심 노하우

- **저장소**: `https://github.com/ambbasa/blind-swordsman-proto`
- **라이브 데모**: `https://ambbasa.github.io/blind-swordsman-proto/v2/`
- **최신 버전**: `v1.03` (2026-11-23 기준)
- **기술 스택**: Vanilla JS ES Modules + Three.js r170 + Custom GLSL + Web Audio API (모바일 세로 웹/PWA, 100% 무료 로컬 파이프라인)

## 1. 절대 원칙 (Standing Rules)
1. **런타임 한자(`[\u4E00-\u9FFF]`) 및 OS 컬러 이모지 0건**: `v2/js/` 실행 문자열(주석 제외)에 한자·이모지를 절대 넣지 않는다.
2. **캐시 버전업 & 테스트 필수**: 수정 후 `v2/index.html`, `v2/sw.js`, `v2/js/*.js`의 `?v=vXXX` 및 `siman-vXXX`를 일괄 올리고, `node --check` + `node tests/unit/modules.test.mjs` 통과를 확인한다.
3. **GitHub Pages 배포 확인**: `git push origin main` 후 반드시 `gh run list --limit 1`로 `pages build and deployment`가 `completed / success`인지 확인한 뒤 보고한다.
4. **3D 변경 시 Blender 4면 렌더 육안 검증 필수**: 3D 메시·리깅·파지 수정 후에는 푸시 전 반드시 Blender 렌더로 정면/측면/후면/근접을 확인한다.

## 2. 3D 캐릭터 제작 & 리깅 노하우 (시행착오 총정리)
- **PC AI 생성 환경 (`RTX 3070 8GB`)**:
  - Python: `C:\Users\cheon\.gemini\tools\Hunyuan3D-2\.venv\Scripts\python.exe`
  - **반드시 `scripts/local_hunyuan3d.py` 사용** (`rembg` 자동 누끼 + `fp16` + 8GB VRAM 안전 관리).
  - **주의**: `Hunyuan3D-2mv` `fp16`이 `6.1 GB` VRAM을 점유하므로 크롬/영상 등 GPU 앱을 켠 채 돌리면 Windows 공유 RAM 스와핑으로 `0.5초/스텝 → 271초/스텝`으로 폭락한다. 브라우저를 잠시 닫고 실행한다.
  - `pymeshlab` 초반 `filter_embree.dll ... does not seem to be a Qt Plugin` 경고는 무해하므로 무시한다.
- **주인공 마스터 파이프라인 (`scripts/blender/build_hero_master.py`)**:
  - 50k 폴리곤 → 15k 리토폴로지 + `1024×1024` Tangent-Space Normal Map 베이킹(`2048px` 컬러 텍스처 유지).
  - **허리띠 V자 꺾임 방지**: A→T 포즈 베이킹 전 몸통/허리 정점(`z < 1.24, abs(x) < 0.225`)에서 `upperarm_l/r` 웨이트 누수를 반드시 제거한다.
  - **머리-몸통 `0.00mm` 무봉제 접합**: 가짜 칼라 링/허리띠 실린더 절대 금지. `bmesh.ops.bisect_plane`(`Z_CUT = 1.440m`) + X/Y 목 타원 스케일 일치 + `BVHTree` 경계 스냅 + `neck_01 = 1.0` 공유 웨이트.
  - **검 파지 정렬**: `M2M_Idle`에서 `upperarm_r`을 바깥으로 `-9°` 벌리고 실제 `hand_r` 손바닥 중심에 검자루를 밀착시켜 도포·다리 관통을 차단한다.
  - **보스 무기 방침**: 손 파지 관통/부유 문제를 원천 차단하기 위해 **신규 2·3·4막 보스는 비무장(권법·도술·부유 영검)** 콘셉트로 제작한다.
  - **모바일 경량화**: `scripts/blender/optimize_glb_mobile.py`로 고정 애니메이션 채널 제거 + WebP 텍스처 압축 (`hero.glb` `2.36 MB`).

## 3. Three.js r170+ 그래픽 & VFX 핵심 노하우
- **금속 PBR (`v2/js/modules/metalStudioEnv.js` · `3d-metal-material`)**:
  - Three.js r163+에서는 `scene.environment`만 쓰면 `material.envMapIntensity`가 무시된다. 반드시 `PMREMGenerator` 다크 HDR 스튜디오 카드 룸을 생성해 **`mat.envMap`에 명시적 바인딩** + `metalness: 1.0` + 선형 강철 F0 `(0.56, 0.57, 0.58)` 적용.
- **직물 PBR (`v2/js/glbhero.js` · `3d-cloth-material`)**:
  - `Hero_Body`는 `MeshPhysicalMaterial` + 도포 4종별 `sheen`/`sheenRoughness`/`sheenColor` 차별화 (`sheen`을 0으로 교차시키지 않아 재컴파일 히치 방지, 전용 `customProgramCacheKey` 사용).
- **3D 낙엽 (`v2/js/inkatmos.js` · `3d-falling-leaves`)**:
  - `FallingLeaves3D` (`InstancedMesh` 1드로우콜, 곡면 양면 잎, `sideOffset = -(slip/omega)*cos(angle)` 텀블링 연동 횡이동, 제로 GC).
- **성능 (`game-perf`)**:
  - 매 프레임 `.filter()` 대신 인플레이스 컴팩션(`stepBolts`, `stepInkSteps`), 3D 도감 뷰어 종 전환 시 이전 메시 `geometry/material.dispose()` 필수.

## 4. 보스전 설계 & 조작 구조 (`v1.02` ~ `v1.03`)
- **핵심 조작 제약**: 자유 이동(조이스틱)이 없고 **혼령(`spirit`)으로의 일섬으로만 이동**한다.
  - 보스전 외곽 테두리 결계 메시 숨김(`a.group.visible = false`).
  - 보스 중심 **정삼각형 대형 혼령 3개**가 시계방향 회전(`orbitR = 5.8m > 보스 원형 폭발 반경`).
  - 이동이 필요한 모든 기믹(`donut`, `soak`, `tether`, `gaze`, `pizza`)은 목표 안전지대/기둥/배후에 **전용 `worldAnchor` 혼령을 즉시 자동 생성**한다.
- **4색 표준 예고 문법 & 최상위 시각 계층**:
  - 주홍 실선(`#FF4D3D` 회피) · 옥빛 수축 링(`#5FE8C2` 완벽 막기 `0.18s`) · 호박빛 빛기둥(`#F2B84B` 소크 진입) · 청록 도넛(`#4DD4FF` 안전지대).
  - 보스 예고 중 아군 바닥 장판 알파를 `35%`로 자동 감쇄.
- **밸런스 기준**: 보스 일반 타격 배율 `0.50`, 자세 붕괴(그로기) `2.00`, 기믹 실패 시 즉사 대신 취약 중첩(`vulnStacks` 최대 2, `8초`), 상점 `공력 +6%/Lv`, `재물운 +8%/Lv (전투 상한 ×2.5)`.

## 5. 다음 작업 예정 (2·3·4막 신규 비무장 보스 3D 적용)
- 4면 고밀도 원화 준비 완료: `scripts/blender/_concepts/boss_act{2,3,4}_mv/{front,left,back,right,turnaround_sheet}.png`
  - 2막: 설산 묵승 · 3막: 혈월 무장 · 4막: 무간의 검귀
- PC 배치 스크립트: `scripts/batch_bosses_3d.ps1` → 출력 `scripts/blender/_raw_bosses/boss_act{2,3,4}_raw.glb`
- 생성 완료 후 작업: 50k→15k 노멀맵 베이킹 + `Mesh2Motion` 66본 리깅 + 모바일 최적화 + `glbboss.js` 막별 지연 로딩(Lazy Load) 연동.
