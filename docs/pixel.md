# 2026-11.md

## [요청일시: 2026-11-19] 픽셀 룩 프로토타입 — ink-studio 로 구운 캐릭터 + 화면 후처리 교체 (방식 A)

### 요청
- 요청자: ch.cheon
- 요청 내용: shapeshift-labs-ink-studio 를 활용해 심안의 화풍 전체를 바꾸고 싶음. 우선 방식 A(구워서 넣기)로 시도

### 처리 과정
- ink-studio 저장소 확인: SDF → 픽셀아트 가우시안 스플랫 툴킷(Node, 헤드리스 CLI). 브라우저 실시간 뷰포트는 없음 → 실시간 렌더링(방식 B) 대신 스프라이트로 굽는 방식 A 를 권장
- **Decision**: 방식 A 로 진행(사용자 선택)
- 가정(사용자 답 없음, 보고함): 색은 먹 바탕 + 비취·진홍·금 강조색 유지 / 기존 feedback loop 수정의 별도 검증은 생략
- 굽기 도구 작성: ink-studio 소프트웨어 렌더러로 프레임을 그려 256px 셀 시트(PNG, 투명 배경)로 출력. 렌더러의 captureCoverage 는 색 렌더와 어긋나 바탕색 키잉으로 알파를 만듦
- 영웅(대기 10·돌진 8·잔상 3 프레임), 혼령(대기 10 프레임) 모델 작성 및 굽기
- 게임 연결: 코드로 그리던 수묵 시트와 같은 규격이면 구운 텍스처로 교체. 수묵 후처리 대신 픽셀 격자 + 29색 팔레트 양자화 패스 적용. `?look=ink` 로 기존 수묵 룩 유지
- 추가 수정: three r170 에서 렌더 타깃 복제 시 depthTexture 가 같은 Source 를 공유해 rt1·rt2 가 한 GPU 텍스처를 씀 → rt2 에 독립 depthTexture 부여(수묵 룩의 feedback loop 원인)
- 검증: 헤드리스 Chrome(GPU)으로 타이틀·튜토리얼 판 실행, 스크린샷 저장. 픽셀 룩에서 feedback loop / INVALID_OPERATION 경고 0건. `?look=ink` 경로는 재검증하지 못함

### 결과
- (생성) `tools/pixelbake/bake.js`, `tools/pixelbake/palette.js`, `tools/pixelbake/models/hero.js`, `tools/pixelbake/models/spirit.js`
- (생성) `assets/v2/pixel/` — hero-idle/dash/after.png, spirit-idle.png, pixel-manifest.json
- (생성) `v2/js/pixellook.js` — PIXEL_LOOK 플래그, 픽셀 룩 후처리 패스, 구운 시트 로더
- (수정) `v2/js/art.js` — 구운 시트로 교체하는 분기, `v2/js/game.js` — 후처리 패스 선택
- (수정) `assets/v2/fx-ink/code/bloomSetup.js` — rt2 독립 depthTexture
- (생성) `production/qa/evidence/2026-11-19-pixel-*.png` — 실행 화면·시트 스크린샷
- 남은 일: 좀비·보스·기물·지형은 아직 코드로 그린 수묵 그림(후처리로만 픽셀화). DOM 레이어(시야 안개·HUD·표식)는 픽셀화되지 않음. 캐릭터가 화면에서 작아 구운 디테일이 많이 사라짐

## [요청일시: 2026-11-18] PR #2(v0.35 업그레이드) 렌더링 오류 검토 및 수정

### 요청
- 요청자: ch.cheon
- 요청 내용: blind-swordsman-proto 프로젝트를 분석하고, 가장 최근 수정(PR #2 feat/v035-upgrade)에서 화면이 제대로 나오지 않는 원인을 검토한 뒤 문제 부분을 모두 권장안대로 수정

### 처리 과정
- devkit으로 workflow/스킬 확인: 설치된 workflow 없음. 코드 리뷰에 꼭 필요한 추가 스킬 없음
- `3769d2f..03988fd` diff 검토(bloomSetup.js, inkwash.js, game.js, inklights.js, overlayShell.js, events.js, ux-upgrade.css)
- 원인: depthTexture를 composer rt1에 고정으로 묶어 InkWashPass가 자기가 쓰는 버퍼의 depth를 샘플링 → WebGL feedback loop(INVALID_OPERATION)
- **Decision**: 이슈 9건을 모두 권장안대로 수정(사용자 승인)
- **Decision**: ai-log 위치는 blind-swordsman-proto/docs/ai-log(사용자 선택)
- 검증: 수정 파일 전체 `node --check` 통과. 사용자 브라우저 확인에서 경고가 계속 남 → 2026-11-19 항목의 rt2 독립 depthTexture 수정으로 이어짐

### 결과
- `assets/v2/fx-ink/code/bloomSetup.js`: `depth` 옵션 추가, `depthTexture` getter를 `hasDepth`로 교체
- `v2/js/inkwash.js`: 매 프레임 readBuffer의 depth를 사용(`enableDepth`), 주석 복원
- `v2/js/game.js`: post 패스를 build마다 새로 생성, 점광원 풀을 재질 예열 전에 생성, 지면 셰이더를 지면 재질에만 적용, 소나 반경 단위 변환, 미사용 이벤트 버스 연결 제거
- `v2/js/inklights.js`: 조명을 intensity로만 제어, 풀 6→4, 3D 시야안개 기본 꺼짐, doc 주석
- `v2/js/inkchunks.js`: 지면 재질 표식 / `v2/js/ui/overlayShell.js`: ESC 맵에서 ov-pause 제거, 중복 로직 제거 / `v2/js/core/events.js`: doc 주석
