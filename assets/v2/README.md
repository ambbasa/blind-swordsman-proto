# 맹인 검객 일섬 v2: 2.5D 아트 에셋, 먹 바탕 수묵판 + 맵 3종 + 8방향 동작 (디자이너, 2026-11-11)

기획서: `docs/BRIEF.md` v2 + 닭부장님 의견(11/11 22:18): "마을 배경이 참고 이미지와 너무 똑같다 → 배경 구성을 새로, 맵 2~3종, 먹색 바탕에 색 포인트". 이 폴더에는 게임 코드 없이 에셋만 있음.
**백업**: 직전 한지 마을판 → `assets/v2-ink-village-1111/`(원화, README, 스크립트 사본 `_tools/`), 그 전 밤판 → `assets/v2-night-1111/`. 마을판 목업 HTML 사본: `docs/shots/v2-art/mock-ink-village/`.

## A. 동작 애니메이션 확장 (11/11 23:07 요청, 디자이너 23:50)
**백업**: 직전 먹 바탕판 전체 → `assets/v2-inkdark-1111/`(원화, README, atlas, 스크립트 사본 `_tools/`). 목업 HTML 사본: `docs/shots/v2-art/mock-inkdark-1111/`.

### A-1. 제작 방식과 고른 이유
- **3D 컷아웃 리그 + 먹 후처리**를 골랐음. Blender에서 원통·구·판 같은 단순 도형을 관절(빈 객체)에 붙여 사람 형태를 만들고, 프레임마다 포즈를 코드로 줌(`tools/rig/char_rig.py`). 렌더는 색·법선·부위 ID 3장을 평평하게 뽑은 뒤 `tools/rig/ink_post.py`에서 그림으로 바꿈: 2단 담채 명암(차가운 먹 그림자), 부위 경계·꺾임·외곽 먹선(공필), 한지 결, 바깥 한지색 테두리 2px. 반사광·광택은 일부러 넣지 않음.
- 이유: (1) 2D 컷아웃이나 생성 원화로는 **5방향 × 7동작 × 8~12프레임** 동안 비례·옷 색·갓 크기를 똑같이 유지할 수 없음. 3D는 같은 모델을 돌려서 찍으니 방향 사이 비례와 색이 정확히 같음. (2) 후처리로 선과 면을 직접 그려서 매끈한 3D 느낌이 나지 않음. (3) 포즈를 숫자로 고칠 수 있어 수정과 재생성이 빠름(전체 다시 만드는 데 약 4분).
- 갓 양태는 반투명 말총 느낌을 위해 양태 없는 렌더 위에 48% 먹 망사로 합성(얼굴·안대가 비쳐 보임).
- 혼령·보스는 사람 관절이 없어서 **새 생성 원화**(`src/dark2-wisp.jpg`, `dark2-boss.jpg`, `dark2-bell.jpg`) + 2D 절차 애니메이션(꼬리 흔들림 변형, 불꽃 밝기 깜빡임, 종 진자, 소멸 침식)으로 만듦. 아이템도 새 원화(`src/dark2-items.jpg`).

### A-2. 동작·프레임·방향 (`atlas.heroAnim`, `zombieAnim`, `spiritAnim`, `bossAnim`)
| 대상 | 동작(파일) | 프레임 | fps | 반복 | 방향 |
|---|---|---|---|---|---|
| 주인공 | 대기 `sprites/hero/hero-idle` | 10 | 8 | 반복 | 8행(그린 5 + 반전 3) |
| | 걷기 `hero-walk` | 12 | 12 | 반복 | 〃 |
| | 일섬 준비 `hero-windup` | 8 | 16 | 마지막 유지 | 〃 |
| | 돌진 `hero-dash` | 8 | 18 | 반복 | 〃 |
| | 베기 `hero-slash` | 10 | 20 | 1회 (events: 칼 뽑음 1, 벰 4, 회수 7) | 〃 |
| | 피격 `hero-hit` | 8 | 14 | 1회 | 〃 |
| | 쓰러짐 `hero-down` | 10 | 12 | 마지막 유지 | 〃 |
| | 잔상 `hero-afterimage-dirs` | 3 (dash2, dash6, slash4) | - | screen, 알파 .5→0 | 〃 |
| 좀비 | 걷기 `sprites/zombie/zombie-walk` | 12 | 8 | 반복 (절뚝임) | 8행(그린 5 + 반전 3) |
| | 피격 `zombie-hit` | 8 (0번 = 한지색 번쩍임) | 14 | 1회 | 〃 |
| | 쓰러짐 `zombie-down` | 10 (앞으로 엎어짐) | 12 | 마지막 .6초 유지 후 .4초 페이드 | 〃 |
| | 빙결 `zombie-frozen-dirs` | 2 (얼음, 금 감) | 0 | 마지막 .3초에 1번 + 2px 흔들기 | 〃 |
| | 화상 `zombie-burning-dirs` | 12 (걷기 + 불꽃) | 12 | 반복 | 〃 |
| | 중독 `zombie-poisoned-dirs` | 12 (걷기 + 오르는 거품) | 10 | 반복 | 〃 |
| 혼령 | `sprites/spirit/spirit-anim` 행 = ㅣ, —, V, O, 무표식 | 10 | 10 | 반복 (불꽃 깜빡임 + 꼬리 + 종 흔들림) | 방향 없음(대칭, 반전 자유) |
| 보스 | `sprites/boss/boss-anim` 행 = 대기, 공격, 피격, 소멸 | 8 / 10 / 6 / 12 | 8 / 12 / 14 / 10 | 대기만 반복 (공격 4번에서 종 울림 고리) | 정면 1방향 |

- **방향 순서**: 시트 행 위→아래 = `e, ne, n, nw, w, sw, s, se`(`dirOrder`). 이 순서는 `v2/js/anim.js`의 `DEFAULT_DIR_ORDER`, `chooseDir`(동쪽 0°에서 반시계 45°씩)와 같음. 각 동작 객체에 `dirs: 8`, `dirOrder`, `layout: 'frames-x-dirs-y'`, `count`, `frame`, `anchor`, `states`, `fpsByState`가 들어 있어서 지금 `anim.js`가 그대로 읽음(node로 `dirCount=8`, `layoutOf='frames-x-dirs-y'` 확인).
  - 실제로 그린 방향은 `s, se, e, ne, n` 5개. **`nw, w, sw` 행은 `ne, e, se`를 X 반전해서 미리 구워 둔 것**(`mirroredRows`, `mirroredFrom`). 그래서 코드에서 반전할 필요는 없음.
  - `s` = 카메라 쪽(화면 아래), `e` = 화면 오른쪽, `n` = 화면 위(등).
  - 반전 때문에 칼집이 반대 허리로 감. 실루엣에서는 거의 안 보이지만 기록해 둠.
- 8방향 고르기: 월드 이동 벡터로 `chooseDir`(이미 구현됨). 화면 벡터로 고를 때는 쿼터뷰 바닥이 세로로 0.57배 눌려 있으니 `atan2(-dy/0.57, dx)`로 고를 것.
- 동작마다 시트가 따로임(`heroAnim.actions.{idle,walk,...}`). 한 장으로 합치면 가로가 2만 px을 넘어 GPU 텍스처 한도를 넘어서, 동작이 바뀔 때 텍스처를 바꿔 끼워야 함.
- **이동 속도(발 미끄러짐 없음)**: 걷기 166 px/s @2x, 돌진 635 px/s @2x, 좀비 걷기 80 px/s @2x(@1x는 ÷2, `moveSpeed`).

### A-3. 셀·anchor (개발자가 알아야 할 규격 변화)
| 키 | 셀 @2x (@1x) | anchor @2x (@1x) | 시트 크기 @2x |
|---|---|---|---|
| `heroAnim` | 432×312 (216×156) | (216, 224) ((108, 112)) | 프레임 수 × 432, 8 × 312 |
| `zombieAnim` | 320×384 (160×192) | (160, 248) ((80, 124)) | 프레임 수 × 320, 8 × 384 |
| `spiritAnim` | 256×256 (128×128) | (128, 236) ((64, 118)); 표식 중심 (128, 75), 56px | 2560×1280 |
| `bossAnim` | 512×512 (256×256) | (256, 495) ((128, 247)); 종 중심 `bellCenters[프레임]`, 표식 64px | 6144×2048 |
| 전환 타일 `tiles.transitions` | 724×362 마름모 (362×181) | - | 4×3 칸, PNG-8 |

- **셀을 줄인 이유**: 기존 셀(주인공 640×512, 좀비·혼령 512, 보스 1024)로 동작 수 × 방향 수를 늘리면 시트가 수십 MB로 커짐. 그래서 @2x 기준 **사람 키 약 215px**(화면 약 107 css px)로 다시 정함. 셀은 모든 동작·방향의 외곽 합집합에 여백 6px만 둔 크기이고, 반전해도 발이 같은 자리에 오도록 **anchor.x를 셀 가운데**에 둠.
  - 주인공 셀은 칼 휘두름이 잘리지 않도록 가로로 넓음.
  - 좀비 셀은 앞으로 엎어지는 동작과 머리 위 불꽃 때문에 위아래로 김.
- **기존 키는 그대로 둠(하위 호환)**: `hero`, `hero-afterimage`, `zombie`, `elements.zombie-frozen|burning|poisoned`, `spirit`, `spirit-wisp`, `boss`, `items.*`.
  - 파일명, 셀, 프레임 수·순서, anchor (320,472)/(256,472)/(512,980)는 같고, 그림만 새 리그·새 원화로 다시 만듦(오른쪽 E 방향 고해상도 렌더). 지금 코드는 바꾸지 않아도 새 그림으로 보임.
  - 바뀐 값은 2개: `boss.bellCenter`(새 종 위치), `spirit.bellCenter` = 표식 중심 (256,150).
- 새 키 사용: `M.heroAnim.actions.walk`를 지금 `anim.js`에 시트 객체로 그대로 넘기면 됨(`frameUV(sheet, f, dirIndex)`). three.js Sprite `center = (ax/cw, 1 - ay/ch)`.
- 좀비 피격은 0번 프레임에 번쩍임이 들어 있음. 주인공 피격은 번쩍임 없음(필요하면 코드에서 0~1번에 색 입히기).

### A-4. 바닥 전환 타일 (`atlas.tiles.transitions`)
- 묶음: `map1-map2`(장터 바닥→성곽 박석), `map2-map3`(박석→낙엽), 맵 안 바닥 사이 `m1-courtyard-dirt|stone|grass|water`, `m2-paving-rubble`, `m3-leaves-path`. 파일 `tiles/trans/{묶음}-iso.png`(@1x `-iso-1x.png`).
- 한 묶음 = 12칸(4×3). `index = 행*4+열`.
  - edge 4: B가 한쪽 절반(bSide = NW, SW, SE, NE).
  - outer 4: B가 모서리 하나(bSide = W, N, S, E).
  - inner 4: A가 반대 모서리 하나만 남음.
  - 이름과 `bSide`는 `tiles.transitions.tiles[]`에 있음.
- 경계선은 모든 칸이 같은 지점에서 타일 가장자리를 지나서 edge, outer, inner와 원래 `iso-*` 타일이 이음매 없이 맞음(확인: `docs/shots/v2-art/anim-sheets/trans-fit-*.png`). 경계에는 끊긴 마른 붓 먹선. 물가는 먹선 대신 옅은 회색 테두리.
- 256색 PNG-8로 저장(8묶음 합계 2.3MB). 바닥이 먹색 위주라 색 손실은 거의 안 보임.

### A-5. QA 결과
- **떨림·크기 튐**: 3D 고정 배율과 고정 anchor라 크기 튐은 없음. `docs/shots/v2-art/anim-qa.txt`에 방향별 외곽 높이와 프레임 사이 최대 변화를 기록함.
  - 대기 1px, 걷기 5~16px, 돌진 13~19px. 걷기·돌진의 큰 값은 팔과 칼 흔들림 때문임.
  - 셀 밖으로 잘리는 프레임 0.
- **방향 사이 비례·색**: 같은 모델이라 같음.
  - 방향별 키 차이는 원근 때문에 ±5px 이내.
  - 갓 양태 망사는 S·SE에서 얼굴이 비침.
- **대비**(`docs/shots/v2-art/contrast-anim.txt`; 9종 바닥 중 최악 기준):
  - 아이템 한지 테두리 9.5:1
  - 캐릭터 한지 테두리 9.4:1
  - 주인공 흰 도포 10.0:1
  - 혼령 6.6:1
  - 보스 5.9:1
  - 좀비 남색 저고리는 1.8:1이지만 테두리(9.4:1)로 형태가 읽힘
- **색맹·흑백**(`cb-anim-elements.png`): 빙결(얼음 조각), 화상(불꽃 혀), 중독(둥근 거품)은 적록 색맹에서 색이 비슷해져도 모양으로 구분됨. 표식 먹 대 한지 16.9:1.
- 미리보기:
  - 동작별 시트 `docs/shots/v2-art/anim-sheets/*.png`(빨간 십자 = anchor)
  - 움직이는 미리보기 `docs/shots/v2-art/anim-preview.mp4`(19초, 720×1280) / `anim-preview.gif`(240px 가벼운 판)

### A-6. 용량
- 새 동작 시트(@2x+@1x): 주인공 19MB, 좀비 16MB, 혼령+보스 11MB, 전환 타일 2.3MB, 합계 약 48MB(8행 중 3행은 반전 사본이라 약 3/8이 중복). `assets/v2` 전체 110MB(백업 직전 65MB).
- 런타임에 @1x만 쓰면 새 시트는 약 10MB.

## 0. 개발자가 알아야 할 것 (규격·합성 변화)
- **파일명, 셀 크기, anchor 규칙, 시트 프레임 수·순서, atlas 키는 그대로.** 기존 바닥·배경·소품 파일명은 **맵1(폐허 장터)** 내용으로 바뀜 → 지금 코드는 손대지 않아도 맵1로 보임.
- **맵2·맵3은 새 파일**(`bg/map2-*`, `tiles/map2-*`, `props/map2-*`, map3 동일). 목록은 `atlas.maps.map1|map2|map3`(아래 4절).
- 바뀐 값(atlas에서 읽으면 자동):
  - `props.*.size/anchor`: 그림이 바뀌어 크기가 다름(anchor는 계속 밑변 가운데, 바닥에서 10px 위). 표 4-1.
  - `props.torch.flameOffset` = (0, −108): 이제 **진짜 불(화톳불 잔해)** 이라 `fx/torch-glow.png`를 다시 붙여도 됨(screen/add, 깜박임).
  - `boss.bellCenter` (504,532) → (504,526). `spirit.bellCenter` (256,150)·`bellMarkSize` 113 그대로.
  - `zombie` frame5 `hitFlash`: 붉은 먹 → **한지색 흰 번쩍임**(어두운 바닥이라 흰색이 다시 잘 보임).
  - `palette`: 새 키 `ground #1E1C1A`, `vermilion #E8432A`, `ice/fire/poison`(+`*Hi` 심 색), `paperRim` 등. 예전 키는 별칭으로 남김: `palette.night` = `#1E1C1A`(clear color로 쓰면 먹 바탕), `torch` = 불씨 주황.
- **합성 모드(중요, 마을판과 반대)**: 바탕이 어두워서 **빛나는 것은 screen/add 권장**: 일섬 선(`slash-line*`), `fire-trail`, `torch-glow`, `spirit-glow`, 잔상(`hero-afterimage`). normal 알파로 써도 보이게 만들었음(심이 밝은 크림/흰색). 그림자·비네트·먹 테두리는 normal(또는 multiply).
- 제스처 선 `fx/ink-stroke*`/`ink-dab`은 **먹색 → 한지색 흰 붓(호분)** 으로 바뀜(어두운 바닥에서 먹 획이 안 보여서). `ink-stroke-lit`은 흰 획 + 검은 먹 테두리(밝은 혼령 빛·안개 위용).

| 파일명(그대로) | 한지 마을판 | 먹 바탕 맵1(폐허 장터·불탄 기와집) |
|---|---|---|
| `props/palace-wall` | 돌담 | **불탄 기와 헛간·담** |
| `props/choga-hut` | 초가 | **불탄 기와집**(검게 탄 기둥, 처진 지붕) |
| `props/torch` | 우물 | **화톳불 잔해**(불씨 주황) |
| `props/stone-lantern` | 장독대 | **깨진 옹기 더미** |
| `props/ssari-fence` | 싸리 울타리 | **부서진 장터 좌판·찢긴 차양** |
| `props/vegetable-patch` | 텃밭 | **엎어진 손수레** |
| `props/reeds` | 갈대 | **찢긴 상점 깃발** |
| `props/boulder` | 바위 | **무너진 기와 더미** |
| `tiles/ground-courtyard` | 한지 마당 | **잿빛 장터 바닥**(기본) |
| `tiles/ground-dirt` | 흙길 | 진흙 길(수레 자국) |
| `tiles/ground-stone` | 물가 자갈길 | 갈라진 판석 |
| `tiles/ground-grass` | 풀밭 | 시든 풀과 재 |
| `tiles/ground-water` + `pond-mask/rim` | 연못 | **검은 물웅덩이**(작게 쓰기 권장, rim은 옅은 회색 붓 테두리) |
| `bg/backdrop-palace-night.*` (=`backdrop-village.png`) | 마을 원경 | **불탄 장터 거리 원경**(불씨 붉은 점) |
| `fx/fog-0/1` | 한지 흰 안개 | 회백 안개(먹 바탕 위 α .35~.6) |
| `fx/vignette` | 세피아 | 먹 검정 가장자리 |
| `fx/torch-glow` | 옅은 햇빛 | 불씨 주황 빛(screen/add) |

- **새 파일**: `bg/map2-backdrop.png/.jpg`, `bg/map3-backdrop.png/.jpg`, `bg/hanji-ink.png`(어두운 먹 한지 512 seamless), `tiles/map2-ground-{paving,rubble}-{1024,512}.png`, `tiles/map2-iso-*.png`, `tiles/map3-ground-{leaves,path}-*.png`, `tiles/map3-iso-*.png`, `props/map2-*`(6), `props/map3-*`(6).

## 1. 해상도·형식을 이렇게 정한 이유
- 용량 제한이 없고 품질 우선이라 고해상도 PNG(@2x 기본, @1x 동봉). 공필 먹선(2px@2x)과 종이 결은 저해상도나 SVG로는 살지 않음.
- 게임 안에서는 3D 모델을 쓰지 않음(전부 2D 스프라이트 + 쿼터뷰 바닥). 단, 주인공·좀비 동작 시트는 제작 단계에서 3D 리그로 찍은 뒤 먹 그림으로 바꿈(A절).
- 원화는 이미지 생성(`src/dark-*.jpg`, 마젠타 배경) → 스크립트로 배경 제거, **공필 외곽선(먹 2px) + 한지색 테두리(2px)**, 셀 맞춤. 소품은 채도를 45%로 눌러 수묵 톤으로 맞추되 **붉은색(군기, 천 조각, 불씨)만 채도를 살림**(먹 바탕 + 색 포인트 원칙). 바닥은 휘도를 어두운 먹 범위로 다시 매핑하고 한지 섬유 결을 얹음.

## 2. 용량
- (동작 세트 이전 기준) `assets/v2` 약 **56MB**(원화 `src/` 제외), 동작 세트 포함 현재 용량은 A-6. 배경(맵 3종 2560 PNG + 1280 JPG)과 바닥 텍스처(9종)가 대부분. 런타임에 @1x와 512 텍스처, 배경 JPG만 쓰면 약 1/4.

## 3. 공통 규격 (이전 세트와 같음)
- 방향(기존 키 `hero`, `zombie`): 캐릭터는 모두 **오른쪽을 봄**. 왼쪽은 X 반전. 새 `heroAnim`, `zombieAnim`은 8방향(A-2).
- **anchor = 발밑**(@2x 셀 픽셀 좌표, @1x는 ÷2). three.js Sprite: `center = (ax/fw, 1 - ay/fh)`.
- 깊이 정렬은 발밑 y 순서. 그림자 `fx/shadow.png`(256×96, 검정)를 anchor에 맞춰 먼저 그림(α .6~.7).
- **공필 윤곽**: 주인공·좀비는 가는 먹선(원화) + 먹 외곽선 2px + 바깥 한지색 테두리 2px(@2x). 어두운 바닥에서 테두리 대비 최저 9.4:1, 흰 도포 10.6:1.

| 시트 | 파일(@2x / @1x) | 프레임(@2x) | 수 | 순서 | 권장 fps | anchor(@2x) |
|---|---|---|---|---|---|---|
| 주인공(갓, 흰 도포, 눈가리개) | `sprites/hero@2x.png` / `hero.png` | 640×512 | 6 | idle0, idle1, windup, dash0, dash1, slash | idle 3 · dash 18 · slash 14 | (320, 472) |
| 상태 묶음 | | | | idle=[0,1], dash=[2,3,4], slash=[2,5] | | |
| 주인공 잔상 | `sprites/hero-afterimage@2x.png` | 640×512 | 3 | dash0, dash1, slash(한지색 흰 실루엣, screen 권장) | — | (320, 472) |
| 좀비 | `sprites/zombie@2x.png` | 512×512 | 6 | walk0, walk1, walk2, hit, down, hitFlash(한지색 흰 번쩍임) | walk 6 · hit 12 | (256, 472) |
| 상태 묶음 | | | | walk=[0,1,0,2], hit=[5,3], down=[4](0.6초 뒤 0.4초 페이드) | | |
| 얼어붙은 좀비 | `sprites/zombie-frozen@2x.png` | 512×512 | 2 | frozen, cracking | — | (256, 472) |
| 타는 좀비 | `sprites/zombie-burning@2x.png` | 512×512 | 4 | w0,w1,w0,w2 | 8 | (256, 472) |
| 중독 좀비 | `sprites/zombie-poisoned@2x.png` | 512×512 | 4 | w0,w1,w0,w2 | 6 | (256, 472) |
| 혼령(도깨비불) | `sprites/spirit@2x.png` | 512×512 | 5 | mark-I(ㅣ), mark-H(—), mark-V(V), mark-O(O), plain | — (위아래 ±6px, 1.6초) | (256, 472) |
| 혼령 꼬리 루프 **NEW** | `sprites/spirit-wisp@2x.png` | 512×512 | 4 | t0..t3 (표식 없음) | 8 | (256, 472) |
| 보스 혼령(큰 도깨비불 + 큰 종) | `sprites/boss@2x.png` | 1024×1024 | 1 | 종에 표식 없음, `bellCenter` (504,526) | — (±10px, 2.4초) | (512, 980) |

- 혼령(도깨비불)은 마을판 그림 그대로, 먹 바탕에 맞게 빛 테두리(halo)만 밝힘(혼령 16px α.8, 보스 24px α.75). `fx/spirit-glow.png`를 screen으로 밑에 깔면 더 뜸.
- 혼령은 땅에 서 있지 않고 떠 있음. 머리(빛 중심)는 `bellCenter = (256,150)`, 꼬리 끝은 anchor 바로 위까지 내려옴.
- **판독성(권장 유지)**: 혼령을 작게 그리면 시트에 그려진 표식도 작아짐. **`ui/mark-*.png`를 `bellCenter`(spirit-wisp는 `markCenter`, 같은 값) 위에 화면 고정 26~32 css px로 덧그려 주세요.** 꼬리를 흔들려면 `spirit-wisp` 4프레임을 돌리고 표식은 위에 얹으면 됨. 목업도 이렇게 함.
- 표식 `ui/mark-{I,H,V,O}@2x.png`(256²): 먹 붓획 + 한지색 테두리 + 옅은 그림자. 한지, 혼령 빛, 청동 종 어디에 올려도 또렷함(먹 대비 한지 테두리 16.9:1, 혼령 빛 대비 15.8:1, 한지 테두리 대비 가장 밝은 바닥 10.8:1).
- 도장 `ui/seal-{I,H,V,O}@2x.png`(256²) **NEW**: 붉은 전각 도장에 모양을 흰 획으로 새긴 것. 보스 순서 표시, HUD 칩용.

## 4. 맵별 바닥·배경·소품 (`atlas.maps`)
- 1 텍스처 = 월드 4×4m(이전과 같음). 512 텍스처를 200~300px 반복(목업). iso 마름모 타일은 724×362.
- 배경(원경)은 2560×1440 PNG / 1280×720 JPG. 화면 위쪽 20~27%에 깔고 아래는 그라데이션으로 바닥에 녹임(목업 방식).
- 모든 소품: 먹 외곽선 2px + 옅은 한지색 테두리 2px(α .45), anchor = 밑변 가운데(바닥에서 10px 위). 좌우 반전 자유.

### 4-1. 맵1 폐허 장터·불탄 기와집 (`maps.map1`, 기존 파일명)
| 종류 | 파일 | 크기(@2x) / anchor |
|---|---|---|
| 배경 | `bg/backdrop-palace-night.png`(=`backdrop-village.png`) / `.jpg` | 불탄 장터 거리, 오른쪽 위 불탄 기와 저택, 연기와 불씨 |
| 바닥 | `tiles/ground-courtyard`(기본 잿빛 바닥), `dirt`(진흙 길, 대각선 띠로), `stone`(판석 조각), `grass`(시든 풀, 가장자리), `water`+`pond-mask/rim`(작은 물웅덩이) | 1024² / 512² |
| 소품 | `props/palace-wall` 불탄 헛간 | 288×272 / (144,262) |
| | `props/choga-hut` 불탄 기와집 | 362×352 / (181,342) |
| | `props/torch` 화톳불 잔해 (flameOffset 0,−108) | 281×242 / (140,232) |
| | `props/stone-lantern` 깨진 옹기 더미 | 261×232 / (130,222) |
| | `props/ssari-fence` 부서진 좌판·차양 | 302×292 / (151,282) |
| | `props/vegetable-patch` 엎어진 손수레 | 293×242 / (146,232) |
| | `props/reeds` 찢긴 상점 깃발 | 219×332 / (109,322) |
| | `props/boulder` 기와 잔해 더미 | 286×202 / (143,192) |
| 빛 | `fx/torch-glow.png` 화톳불 위 + 불탄 집 둘레 작은 불씨(screen α .35~.6) | 512² |

### 4-2. 맵2 무너진 성문·성곽 (`maps.map2`, 새 파일)
| 종류 | 파일 | 크기(@2x) / anchor |
|---|---|---|
| 배경 | `bg/map2-backdrop.png/.jpg` | 달빛 아래 산등성이를 넘는 성곽과 반쯤 무너진 문루, 붉은 깃발 조각 |
| 바닥 | `tiles/map2-ground-paving-*`(성곽 마당 박석, 기본), `map2-ground-rubble-*`(성돌 자갈, 무너진 곳 둘레) + `tiles/map2-iso-*` | 1024² / 512² |
| 소품 | `props/map2-gate` 무너진 성문 누각 | 520×392 / (260,382) |
| | `props/map2-wall` 성곽 조각(대각선, 반전해 양쪽) | 397×272 / (198,262) |
| | `props/map2-rubble` 성돌 무더기 | 336×222 / (168,212) |
| | `props/map2-banner` 찢긴 붉은 군기 | 277×332 / (138,322) |
| | `props/map2-barricade` 목책(마름쇠) | 211×212 / (105,202) |
| | `props/map2-haetae` 부서진 해태상 | 262×262 / (131,252) |
| 안개 | fog α .4~.55 | |

### 4-3. 맵3 대나무 숲·서낭당·장승·안개 다리 (`maps.map3`, 새 파일)
| 종류 | 파일 | 크기(@2x) / anchor |
|---|---|---|
| 배경 | `bg/map3-backdrop.png/.jpg` | 왼쪽 대숲, 안개 낀 협곡 위 돌 홍예다리, 천 조각 매단 신목과 돌무더기, 장승 한 쌍 |
| 바닥 | `tiles/map3-ground-leaves-*`(댓잎 깔린 숲 바닥, 기본), `map3-ground-path-*`(이끼 디딤돌, 구불구불한 길 띠) + `tiles/map3-iso-*` | 1024² / 512² |
| 소품 | `props/map3-bamboo` 대나무 덤불 | 375×432 / (187,422) |
| | `props/map3-jangseung` 장승 한 쌍 | 262×342 / (131,332) |
| | `props/map3-seonangdang` 서낭당(돌무더기+신목+천) | 301×352 / (150,342) |
| | `props/map3-bridge` 돌 홍예다리(대각선) | 384×232 / (192,222) |
| | `props/map3-rock` 이끼 바위·고사리 | 346×212 / (173,202) |
| | `props/map3-cairn` 돌탑+붉은 천 | 218×242 / (109,232) |
| 안개 | fog α .6~.8 (안개 다리 분위기) | |

### 4-4. 공용
| 파일 | 크기 | 용도 |
|---|---|---|
| `fx/fog-0/1.png` | 1024×512 | 회백 안개. 가로 repeat, +8px/s, −5px/s. 맵별 α는 위 표 |
| `fx/vignette.png` | 1080×1920 | 먹 검정 가장자리(normal) |
| `fx/spirit-glow.png` | 256² | 혼령 밑 청백 빛(screen/add α .6~.8) |
| `fx/shadow.png` | 256×96 | 발밑 그림자(검정, α .6~.7) |
| `bg/hanji-paper.png` / `bg/hanji-ink.png` **NEW** | 512² | 밝은 한지(UI 패널) / 어두운 먹 한지(빈 바탕, 로딩 화면 등) |

### 4-5. 참고 이미지와 다르게 만든 점 (`docs/shots/v2-art/ref-compare-map{1,2,3}.png`)
- 참고 이미지: 밝은 한지 바탕, 초가 2채 + 싸리 울타리 + 텃밭 + 우물 + 연못·갈대·물고기, 가로 화면 위에서 내려다본 구도.
- 새 맵: 어두운 먹 바탕. 초가·우물·텃밭·연못·갈대·싸리 울타리를 전부 뺌(파일명만 호환용으로 남음). 건물은 기와(불탄 기와집, 성문 누각)이거나 건물이 없음(맵3). 맵1은 대각선 장터 거리를 따라 좌판이 늘어서고 오른쪽 위에 불탄 기와집, 왼쪽 아래 화톳불 → 참고 이미지의 "가운데 위 초가 + 왼쪽 텃밭 + 아래 우물" 배치와 겹치지 않음.
- 겹치는 것: 주인공(갓 + 흰 도포)은 기획서 설정이라 유지. 수묵 기법(먹선, 담채) 자체는 공통.

## 5. 일섬·제스처 이펙트 (먹 바탕: 빛나는 것은 screen/add, normal도 가능)
| 파일 | 크기 | 사용 |
|---|---|---|
| `fx/slash-line.png` | 1024×128 | **일섬 = 주홍 붓획 + 뜨거운 크림색 심**. 비백 갈라짐. 돌진 선분을 따라 늘임, 수명 0.25초. screen/add 권장 |
| `fx/slash-line-{ice,fire,poison}.png` | 1024×128 | 속성 일섬. 밝은 심 + 진한 속성색 번짐 + 모양(각진 가시 / 불꽃 혀·불티 / 둥근 거품). 기본 일섬 위에 겹쳐도 됨(목업) |
| `fx/fire-trail.png` | 1024×256 | 불 잔상. 아래 가장자리를 경로에 맞춤. u=0 오래된 쪽 → 1 주인공 쪽. 수명 1.2초, screen |
| `sprites/hero-afterimage@2x.png` | 640×512×3 | 한지색 흰 잔상. 경로 위에 3~6장, α .5→0, screen |
| `fx/slash-arc-sheet.png` | 512×512×4, 24fps | 벤 자리 주홍 초승달 |
| `fx/ink-stroke.png` / `ink-stroke-lit.png` | 1024×96 | 제스처 선 = **한지색 흰 붓(호분)**. lit은 검은 먹 테두리 포함(밝은 혼령 빛·안개 위) |
| `fx/ink-dab.png` | 128² | 한지색 붓 도장(경로를 따라 3~4px마다) |
| `fx/blood-splat.png` | 256² | 붉은 점 + 검붉은 번짐 데칼 |
| `fx/ink-splat.png` | 256² | 흰 먹 튀김(혼령 소멸, 돌진 시작), α .7 |
- 화면 흔들림 권장값은 그대로: 일섬 4px/0.12초, 얼음 파쇄 6px/0.15초, 독 폭발 8px/0.2초.
- 대비(가장 밝은 바닥 기준): 주홍 테두리 3.1:1, 크림 심 10.1:1, 얼음 6.4:1, 화염 4.4:1, 독 7.2:1, 제스처 흰 획 10.4:1.

## 6. 속성(얼음·화염·독)과 조합
색맹·흑백에서도 모양과 질감으로 구분됨: 얼음 = 먹선 두른 각진 조각과 반짝이, 화염 = 불꽃 혀와 주황 불티, 독 = 먹 테두리 둥근 거품과 방울. 확인 결과: `docs/shots/v2-art/cb-inkdark-elements.png`(먹 바탕 위)(정상·적색맹·녹색맹·청색맹·흑백).

| 효과 | 파일 | 프레임 | fps | anchor |
|---|---|---|---|---|
| 얼음 상태 | `sprites/zombie-frozen@2x.png` | 512×512×2 | — | (256,472) |
| 화염 상태 | `sprites/zombie-burning@2x.png` | 512×512×4 | 8 | (256,472) |
| 불꽃 단독 | `fx/flame@2x.png` | 256×256×4 | 12 | (128,244) |
| 독 상태 | `sprites/zombie-poisoned@2x.png` | 512×512×4 | 6 | (256,472) |
| 독안개 | `fx/poison-fog@2x.png` | 512×256×3 | 4 | (256,128) |
| 얼음 파쇄 | `fx/ice-shatter@2x.png` | 512×512×6 | 18 | (256,300) |
| 독 폭발 | `fx/poison-burst@2x.png` | 512×512×6 | 16 | (256,256) |
- 속성색(먹 바탕용, 진하게): 얼음 `#5FC4FF`(심 `#F2FBFF`), 화염 `#FF6A1E`(심 `#FFF0C8`), 독 `#7FDB4A`(심 `#F0FFD8`). 적색맹·녹색맹에서 화염과 독은 둘 다 노랗게 보이지만 불꽃 혀/둥근 거품 모양으로 구분됨(미리보기 확인).
- 얼음 파쇄 첫 고리는 먹 대신 옅은 얼음색으로 바꿈(어두운 바닥).

## 7. 아이템 아이콘 (256² @2x / 128² @1x, anchor 가운데, 화면 44~60 css px)
먹 원형 + 붉은 도장 톤은 그대로: 한지 원판, 마른 붓 테두리, 담채 그림, 오른쪽 아래 붉은 도장. `items/dash-plus`, `heal`, `coin`, `xp-orb`, `elem-ice`, `elem-fire`, `elem-poison`, `one-bell`.
- 11/11 23:50 새 원화(`src/dark2-items.jpg`)로 교체: 먹 원판 + 두꺼운 한지 고리 + 바깥 먹선 3px, 오른쪽 아래 붉은 도장. 한지 고리 대비 9.5:1(기준 3:1). 결과: `docs/shots/v2-art/contrast-anim.txt`, 미리보기 `anim-sheets/items.png`.
- 붉은 도장(`ui/seal-*`)은 맨바닥 대비 2.3:1이라 **한지 원판·HUD 한지 칩 위에만** 둘 것(도장 대 흰 획 4.6:1).

## 8. 한 가지 모양 종: 가장 강한 순간 (먹 바탕판)
세상이 먹 단색으로 빠지고 가장자리에서 검은 먹이 조여 옴. 혼령 표식, 붉은 도장, 일섬·속성색만 색을 남김("같은 모양"이 튀게).

| 파일 | 크기 | 사용 |
|---|---|---|
| `fx/onebell-ink-0..3.png` | 1080×1920 | 가장자리 먹 테두리 4단계(이전과 같음, 어두운 바닥 위에서 더 짙은 먹 웅덩이로 보임) |
| `fx/onebell-paper-0..2.png` | 1080×1920 | 옅은 한지 빛(α 낮춤 .12/.22/.32). 그리는 순간의 짧은 흰 번쩍임용 |
| `fx/onebell-ink-burst.png` | 1024² | **한지색 흰 먹 튀김**(호분). 0.6→1.1배, 0.35초 |
| `fx/onebell-aura.png` | 256² | **흰 붓 원상** + 붉은 도장. 초당 20° 회전, y 0.45배 |
| `fx/onebell.frag.glsl` | — | 먹 바탕판 후처리: 휘도→먹 단색, 채도 높은 색 유지, 가장자리 먹 고임, 먹 테두리 일렁임. 입력 `uK`, `uInk`, `uTime` |

권장 타이밍(8초 가정, 이전과 같은 박자):
1. 먹는 순간: 히트스톱 80ms. 모든 혼령 표식이 같은 모양으로(0.2초 1.4→1배 팝). aura 켬, ink-0 → ink-1을 250ms.
2. 지속 중: ink-1, `uK = 0.35`. 먹 테두리 ±2% 일렁임.
3. **모양을 그린 순간**: 시간 1→0.3을 150ms. `uK` 0.35→1, ink-2→3, paper-0을 α .2로 80ms 번쩍, ink-burst. 연속 돌진은 한 번에 약 120ms, 사이 40ms, 매번 흔들림 4px. 주인공·일섬 선·잔상은 탈색 레이어 **위에** 그림.
4. 마지막 돌진 뒤: 시간 0.3→1을 300ms(ease-out). `uK` 1→0.35, ink-3→1.
5. 끝: 먹 테두리와 aura를 400ms에 걷음.
- CSS·2D 대체안: 월드에 `saturate(.22) brightness(.82) contrast(1.08)` + `onebell-ink-N` 덮기(목업 방식).

## 9. 팔레트
먹 바탕 `#1E1C1A` / 회먹 `#3A3632`, 먹선 `#0E0C0A`, 한지 `#EDE3CF` / 한지 테두리 `#E9DFC8`, 일섬 주홍 `#E8432A`(심 `#FFE2C8`), 전각 붉은색 `#C8321F`, 피 `#C8281E`, 불씨 `#FF8A3A`, 도깨비불 `#CFEFEA` / `#F7FFFD`. 속성색은 6절. 바닥 평균색: 맵1 `#333231`~`#191C21`, 맵2 `#2F3134`/`#272726`, 맵3 `#1C211A`/`#2C2E25`.

## 10. 사용 예 (three.js)
```js
const M = window.ART_V2_ATLAS, base = 'assets/v2/';
const tex = new THREE.TextureLoader().load(base + M.hero.file);   // 3840x512
const [fw, fh] = M.hero.frame, n = M.hero.count;
tex.repeat.set(1 / n, 1); tex.offset.x = frame / n;
const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));  // 캐릭터: NormalBlending / 일섬·잔상·glow: AdditiveBlending
spr.center.set(M.hero.anchor[0] / fw, 1 - M.hero.anchor[1] / fh);
// 혼령 표식: 화면 고정 크기 sprite를 spirit 위치 + (bellCenter - anchor) * scale 에 배치
renderer.setClearColor(M.palette.ground);
// 맵 전환: const MP = M.maps.map2; MP.bg, MP.tiles.paving.texture, MP.props['map2-gate'].file ...
// 맵1은 기존 키 그대로: M.tiles.courtyard, M.props.torch ...
```

## 11. 다시 만들기
```
# 동작 세트 (A절). Blender 4.2 (/tmp/blender), 렌더 중간 파일은 /tmp/rig (지워도 아래로 다시 만듦)
/tmp/blender/blender -b --factory-startup -P tools/rig/char_rig.py -- hero   /tmp/rig/hero      # 약 1.5분
/tmp/blender/blender -b --factory-startup -P tools/rig/char_rig.py -- zombie /tmp/rig/zombie    # 약 1분
/tmp/artvenv/bin/python tools/gen_anim_v2.py all            # 시트, 기존 키 재생성, 혼령, 보스, 아이템, 전환 타일, atlas.json/js (약 3분)
/tmp/artvenv/bin/python tools/anim_sheet_previews.py        # docs/shots/v2-art/anim-sheets/*.png
/tmp/artvenv/bin/python tools/check_anim_v2_cb.py           # contrast-anim.txt, cb-anim-elements.png
/tmp/artvenv/bin/python tools/anim_preview_video.py         # anim-preview.mp4 / .gif
# 주의: gen_art_v2_inkdark.py를 다시 돌리면 기존 키 시트(hero, zombie, spirit, boss, items)가 이전 그림으로 덮이므로, 그 뒤 gen_anim_v2.py all을 다시 돌릴 것
/tmp/artvenv/bin/python tools/gen_art_v2_inkdark.py    # 먹 바탕판 전체 생성(src/dark-*.jpg + ink-wisp/boss/items/flame → assets/v2, atlas.json/js)
/tmp/artvenv/bin/python tools/check_v2_inkdark_cb.py   # 색맹·흑백 미리보기와 대비 → docs/shots/v2-art/cb-inkdark-elements.png, contrast-inkdark.txt
node tools/shots-v2-inkdark.playwright.js              # 목업 → docs/shots/v2-art/mock-inkdark-*.png, sheets-inkdark-preview.png
/tmp/artvenv/bin/python tools/ref_compare_inkdark.py   # 참고 이미지 비교 → docs/shots/v2-art/ref-compare-map{1,2,3}.png
```
- `gen_art_v2_inkdark.py`는 `gen_art_v2_ink.py`(마을판)의 공용 함수를 import해서 덮어씀. 마을판 원화(`src/ink-hero*` 등)는 백업 폴더로만 남겨서 `gen_art_v2_ink.py` 단독 실행은 실패함(실행하지 말 것. 마을판을 다시 만들려면 `assets/v2-ink-village-1111/_tools/`와 그 `src/` 사용).

## 12. 한계
- 동작 세트(A절):
  - 주인공·좀비는 단순 도형 리그라 손가락, 얼굴 표정, 옷 주름의 세부가 없음. 화면 크기(약 100 css px)에서는 실루엣과 먹선으로 읽히지만 확대하면 인형처럼 보임.
  - 도포 자락은 판 몇 장이라 천처럼 흐르지 않음.
  - 반전 3방향(nw, w, sw)은 칼집이 반대 허리로 감.
  - 혼령·보스는 2D 변형이라 몸이 돌지 않음(정면 고정).
  - 보스 공격 고리와 소멸 입자는 단순한 흰 선과 점.
- 기존 6프레임 시트(`hero`, `zombie`)는 하위 호환용이라 프레임이 적음. 새 코드는 `heroAnim`, `zombieAnim`을 쓸 것.
- 소품·배경은 생성 원화라 세밀한 삽화 느낌이 조금 남아 있음(채도와 대비를 눌러 수묵 쪽으로 맞춤). 맵2 박석 바닥은 격자가 규칙적이라 넓게 깔면 반복이 보임 → rubble 패치를 섞을 것.
- 전환 타일(A-4)은 경계선 모양이 1종(같은 굴곡 반복)이라 길게 이으면 패턴이 보일 수 있음. 넓은 경계는 소품으로 끊을 것.
- 원화 해상도 한계로 배경 2560은 업스케일.
- 붉은 도장은 맨 먹 바탕 위 대비가 2.3:1이라 단독 HUD로 쓸 때는 한지 칩을 깔아야 함.
