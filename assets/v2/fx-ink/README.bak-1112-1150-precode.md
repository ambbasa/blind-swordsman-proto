# fx-ink: 렐름 오브 더 잉크 톤 그래픽 팩 (디자이너, 2026-11-12)

BRIEF '그래픽 개선' 절(11/12 10:55)을 따른 새 에셋과 연결 명세입니다. 원작 그림은 베끼지 않았고, 톤과 기법(먹 바탕, 발광 동양 색, 비백, 먹물 튀김, 림라이트, 먹안개)만 참고했습니다. 모두 절차 생성(numpy/scipy/PIL)이라 반들거리는 3D 느낌이 없습니다.

- 기존 파일은 덮어쓰지 않았습니다. 새 파일은 모두 `assets/v2/fx-ink/` 아래에 있습니다. `atlas.json`, `atlas.js`, `README.md`는 손대지 않았고, 백업은 `assets/v2-backup-1112-fxink/`에 있습니다.
- 게임 코드(`v2/js/*`)는 수정하지 않았습니다. 연결 예시 코드는 `shaders/REFERENCE-inject-fxink.preview.js`에 있습니다(미리보기 하네스이며 게임 코드가 아님).
- 숫자 파라미터는 모두 `fx-ink.json`에 있습니다(품질 high/low, 수명, 개수, 색, 블렌드). 코드에서 이 JSON을 읽어 쓰면 됩니다.
- 생성기: `tools/fxink/gen_fx_ink.py [slash|particles|atmo|rim|all]` (`/tmp/artvenv/bin/python`).

## 0. 레이어 순서 (아래 → 위)

| z | 레이어 | 블렌드 | 비고 |
|---|---|---|---|
| 3D, renderOrder 1 | 바닥 먹 얼룩 데칼 | normal | 바닥 위, 캐릭터 아래 |
| 3D, 4 | 일섬 블룸 | additive | 저사양에서 끔 |
| 3D, 5 | 일섬 먹 리본(비백) | normal | 마르며 사라짐(디졸브) |
| 3D, 6 | 일섬 검기 코어 | additive | 속성 색 |
| 3D, 7 | 먹물 방울·파편(Points 1개), 타격 먹꽃 | normal | |
| 3D, 8 | 주인공(지금 코드 그대로) | | 림 시트로 교체 |
| DOM z2 | `#fxinkAtmo`: 달빛 빛줄기 → 먹안개 → 옅은 안개 | normal | 새 div, `#view`와 `#ink` 사이 |
| DOM z3 | `#vignette`, `#sightFog`(심안 파동) | | 지금 그대로 |
| DOM z4 / z6 / z8 | `#ink` 제스처 선, `#marks` 표식, HUD | | **표식은 언제나 안개·빛줄기 위** |

## ① 일섬 궤적

**지금 방식(확인함):** `game.js makeSlash(from, to)`가 바닥에 `PlaneGeometry(pathR*1.6, len)` 한 장을 깔고 `slash-line-*.png`를 붙입니다. `AdditiveBlending`, opacity 0.7, 수명 0.25초이고, `three.fx`와 `fadeFx`가 opacity를 내리며 지웁니다. 늘어나는 리본 한 장 방식이라 에셋도 그 방식에 맞췄습니다.

**새 에셋 (`slash/`):**

| 파일 | 크기 | 블렌드 | 용도 |
|---|---|---|---|
| `slash-ink-ribbon-512.png` (`slash-ink-ribbon.png` 2x) | 128×512 (256×1024) | normal | 거친 붓 먹선 + 비백(붓털이 마르며 갈라짐). 이미지 위쪽(v=0)이 누르는 시작점, 아래쪽이 갈라지는 꼬리. 붓결이 길이 방향이라 길이로 늘려도 깨지지 않음 |
| `slash-core-{jade,fire,lightning,poison,ice}.png` | 128×1024 | additive | 가운데 검기. 흰 심 + 속성 색 번짐 |
| `slash-bloom.png` | 64×256 | additive, `color`=속성색 | 넓은 은은한 번짐(저사양 끔) |
| `slash-dissolve-mask.png` | 128×512, L | — | 먹이 꼬리부터 마르게 하는 디졸브 마스크 |
| `slash-press-splat.png` | 256 | normal | 시작점 먹 튐 |

**속성 색 (BRIEF):** 기본 비취 `#2EE6A6`, 화염 진홍 `#FF2E4A`, 번개 금 `#FFC83A`, 독 자색 `#B04DFF`, 얼음 옥빛 `#8EE8FF`. `S.dashElem`이 null이면 jade입니다. 번개는 아직 게임에 없지만 텍스처는 미리 넣었습니다.

**연결 (`game.js makeSlash` 교체 제안):**
1. 그룹 하나에 메쉬 4장을 넣습니다.
   - 먹: 폭 `pathR*1.6*1.2`, `MeshBasicMaterial`, normal, `depthWrite:false`, renderOrder 5. 디졸브는 `shaders/slash-ink-dissolve.glsl`을 `onBeforeCompile`로 붙입니다.
   - 코어: 폭 ×0.55, additive, renderOrder 6, z +0.01.
   - 블룸: 폭 ×1.6, 길이 ×1.05, additive, opacity 0.5.
   - 시작점 튐: 정사각 `pathR*1.6*0.9`, 로컬 (0, −len/2).
2. 그룹 회전은 `rotation.set(-PI/2, 0, Math.atan2(dx, dz))`로 둡니다(dx = to.x−from.x, dz = to.z−from.z). 이러면 시작점이 from, 꼬리가 to에 옵니다.
   - ⚠️ **지금 코드의 `rotation.z = -atan2(dx, dz)`는 Z 방향이 뒤집혀서, 대각선 돌진이면 띠가 실제 경로와 거울상으로 그려집니다.** 미리보기 샷의 불길 자국(`fire-trail`)이 경로와 다른 대각선으로 나가는 것으로 확인했습니다(`showcase/slash-fire-*.png`). 계산: XYZ 오일러에서 로컬 +Y → (−sinθ, 0, −cosθ).
3. 수명은 0.25초 대신 **0.55초**로 하고, 이 그룹은 `fadeFx` 대신 전용 곡선으로 흐리게 합니다(`fx-ink.json slash.curves`).
   - 먹 opacity: 25%까지 1, 그 뒤 0으로. opacity가 내려가면서 디졸브 임계값이 같이 올라갑니다.
   - 코어: 처음 6%는 1.3, 그 뒤 `1-u/0.45`.
   - 블룸: `0.5*(1-u/0.35)`.
   - 기존 `three.fx`에 넣으려면 `{mesh, life, max, custom:fn}` 식으로 `fadeFx`를 건너뛰는 분기를 하나 두면 됩니다.
4. 기존 화염 꼬리(`fire-trail`, 1.2초)는 그대로 둬도 되지만, 위 2번 회전 수정을 똑같이 해야 합니다.
5. 맵을 읽을 때 텍스처를 미리 불러오고 셰이더를 한 번 컴파일해 두세요(`renderer.compile` 또는 바닥 아래 더미 메쉬). 그러지 않으면 첫 일섬에서 끊깁니다(1% low 악화).

## ② 먹물 튀김·바닥 얼룩

| 파일 | 규격 | 블렌드 |
|---|---|---|
| `particles/ink-particles.png` (@2x) | 8×4칸, 칸 64 (128). 0행 먹 방울(꼬리 +x = 날아가는 방향), 1행 먹 파편, 2행 진홍 먹 방울(좀비), 3행 진홍 파편 | normal. 가장자리 1px 한지색 테두리가 있어 먹 바탕에서도 보임 |
| `particles/ink-hit-burst.png` (@2x) | 6프레임 가로, 칸 128 (256) | normal, 빌보드 |
| `particles/ink-decal-sheet.png` (@2x) | 6열(단계) × 4행(모양), 칸 128 (256). 0–2 퍼짐, 3–5 스며듦(가장자리 번지고 옅어지며 구멍) | normal, 바닥 평면 |

**권장값** (high / low):
- 상한: 파티클 160 / 60, 데칼 24 / 10, 먹꽃 6 / 3. 개수는 일섬마다 7 / 3, 타격 14 / 6, 처치 22 / 9.
- 방출: 속도 2.5–7 m/s, 퍼짐 ±52°(1.8 rad, 일섬 방향 기준), 위로 2–5 m/s, 시작 높이 0.6–1.4 m, 중력 −14, 수명 0.35–0.65초, 크기 0.18–0.40 m, 회전 ±3 rad/s, 방울 65% / 파편 35%.
- 감쇠: `alpha = min(1, 남은수명/(0.3*수명))`. 땅(y<0.03)에 닿으면 수평 속도 ×0.3으로 멈추고, 15% 확률로 작은 데칼(0.45 m)을 남긴 뒤 0.08초 안에 사라집니다.
- 먹꽃: 0.36초, 1.35 m, y=1.0.
- 데칼 단계 시각: 0, 0.05, 0.12, 1.2, 2.0, 2.8초. 3.4초부터 0.6초 동안 사라집니다. 크기는 처치 2.2 m, 타격 1.4 m, 방울 0.45 m. 상한에 닿으면 가장 오래된 것부터 다시 씁니다.

**연결:**
- 파티클 전체를 `THREE.Points` 하나(draw call 1)로 그립니다. 셰이더는 `shaders/ink-particles.glsl`이고, 속성은 position/aSize/aFrame/aRot/aAlpha입니다. 배열은 미리 잡아 두고 `needsUpdate`만 켭니다.
- 훅을 거는 곳:
  - `hurtZombie(z, amount, why, rec)`에서 `fxInk.hit(z.x, z.z, dir)`를 부릅니다. 진홍 방울, 먹꽃, 데칼 1.4 m가 나옵니다. dir은 `rec.segs` 마지막 구간 방향입니다.
  - `killZombie(z)`에서 `fxInk.kill(...)`을 부릅니다. 처치 개수만큼 튀기고 데칼 2.2 m를 남깁니다.
  - `makeSlash`에서 `fxInk.slash(...)`를 부릅니다. 경로 가운데에서 일섬 방향으로 먹 방울이 나갑니다.
- `clearEntities`나 맵을 바꿀 때 데칼과 파티클을 비우세요.

## ③ 림라이트 / 귀기 외곽선

- **기존 시트와 같은 규격(셀·anchor·행 순서 동일)**이라 URL만 바꾸면 됩니다.
  - `rim/<원래이름>-rim.png`(1x)와 `-rim@2x.png`는 구운 시트입니다. 바깥 선, 달빛 쪽 안쪽 테두리, 은은한 번짐이 들어 있습니다.
  - `rim/<원래이름>-rimmask.png`(1x, RGB: R 바깥선, G 안쪽 테두리, B 번짐)는 셰이더로 색을 입힐 때 쓰는 마스크입니다. 선택 사항이며 `shaders/rim-tint.glsl` 참고. 좀비 공격 예비동작 때 귀기를 맥동시키는 데 쓸 수 있습니다.
- 주인공은 차가운 옥·청백입니다(선 `#A9E6DE`, 안쪽 테두리 `#F2FFFD`, 번짐 `#6FCFC2`).
- 좀비는 진홍 선 `#B81E3A`, 안쪽 테두리 `#FF9FB0`, 자색 귀기 번짐 `#7426B8`입니다(노이즈로 일렁임).
- 대상은 `heroAnim` 7동작(idle, walk, windup, dash, slash, hit, down)과 `zombieAnim` 6개(walk, hit, down, frozen, burning, poisoned)입니다. 원래 경로와 새 경로는 `route-map.json`, 동작별 표는 `rim-meta.json`에 있습니다.
- **연결:** `art.js`에서 `animFile(s)`가 고르는 경로를 rim 경로로 바꿉니다. 예를 들어 `loadAtlas()` 뒤에 `heroAnim.actions[k].file1x = 'fx-ink/rim/hero-<k>-rim.png'`로 덮어씁니다(BASE가 `assets/v2/`이므로 상대경로 그대로 맞음). 잔상(`hero-afterimage-dirs`)과 옛 6프레임 시트는 바꾸지 않습니다.
- 용량:
  - 1x 13장 합계는 원본 9.5 MB → rim 16.1 MB(PNG)입니다. 노이즈 번짐 때문에 압축이 덜 됩니다.
  - **WebP 무손실 `*-rim.webp`(같은 픽셀)를 쓰면 원본과 비슷한 크기**가 됩니다.
  - GPU 메모리는 원본과 같습니다(같은 해상도).

## ④ 먹안개·달빛·초롱 빛 (맵 3종 톤)

| 파일 | 규격 | 쓰는 법 |
|---|---|---|
| `atmo/fog-ink-{map1,2,3}.png` | 1024×512, 상하좌우 이음매 없음 | 진한 먹안개. normal, opacity 0.95. 화면 위 0–30%와 아래 68–100%에만 보이게 마스크 |
| `atmo/fog-mist-{map}.png` | 1024×512 | 옅은 안개. 반대 방향으로 더 빠르게, opacity 0.75. **저사양 끔** |
| `atmo/fog-edge-mask.png` | 4×256, L | 위아래 띠 마스크(Three 화면 쿼드용). CSS는 `mask-image` 그라데이션으로 같음 |
| `atmo/moonrays-{map}.png` | 768×768 | 왼쪽 위에서 내려오는 달빛 줄기. normal(밝은 색 + 알파 = screen과 비슷하고 더 쌈), opacity 0.32↔0.55, 9초 왕복. **저사양 끔** |
| `atmo/glow-lantern-{map}.png` / `-sheet.png`(256, 4프레임 흔들림) | 256 | 초롱·모닥불 빛 번짐. additive |
| `atmo/torch-glow-{map}.png` | 512 | `fx/torch-glow.png`와 같은 크기의 드롭인 교체본 |

맵 톤:
- 맵1 폐허 장터: 먹 `#0B0908`, 안개 세피아 `#8C7A66`, 달빛 `#F1E2C2`, 불빛 `#FF8A3A`
- 맵2 성문·성곽: 먹 `#07090C`, 안개 청회 `#6F7C8C`, 달빛 `#D8E6F4`, 불빛 `#FF6A2A`
- 맵3 대숲·서낭당: 먹 `#060A08`, 안개 녹회 `#6F8670`, 달빛 `#E4F2DC`, 불빛 `#FFB04A`

**연결 (DOM 방식 권장, 미리보기 하네스와 같음):**
- `index.html`의 `#view` 다음, `#ink` 앞에 `<div id="fxinkAtmo">`(z-index 2)를 넣습니다.
- 그 안에 빛줄기 div 1개와 안개 div 2개(폭 200%, `background-repeat`)를 둡니다.
  - 움직임은 `transform: translate3d(-50%,0,0)` 무한 반복 애니메이션으로만 줍니다(합성만 하므로 다시 그리기 없음). 먹안개 64초, 옅은 안개 41초 반대 방향.
  - `background-position` 애니메이션은 매 프레임 다시 그리게 되니 쓰지 마세요.
  - 배경 크기: 폰(<600px)은 512×256, PC는 1024×512.
- 맵이 바뀔 때(`applyMap`) 클래스나 URL을 `{map}`으로 바꿉니다.
- CSS 원문은 `REFERENCE-inject-fxink.preview.js`의 `atmoTick()`에 있습니다.
- 기존 3D 안개(`fog-0/1` 평면, `applyMap`의 `fogs`)는 같이 두면 겹칩니다. 저사양에서는 그쪽을 끄는 것을 권합니다.
- `#sightFog`(심안 파동, z3)와의 관계:
  - 먹안개 레이어가 그 아래(z2)에 깔리므로, 파동이 열리면 안개 결이 보입니다.
  - `drawSightFog()`는 지금 매 프레임 캔버스 전체를 다시 그립니다. 파동이 없을 때는 다시 그리지 않거나, 정적인 CSS 그라데이션으로 바꾸면 폰에서 이득이 있습니다(개발자 판단).
- 초롱 빛: `torches[].glow`의 텍스처만 `torch-glow-{map}.png`로 바꾸면 됩니다. 새 초롱을 놓는다면 맵3은 서낭당과 장승 옆, 맵2는 성문 화로가 어울립니다. `glow-lantern-*-sheet` 4프레임을 4fps로 무작위 재생하고 크기 0.95–1.05로 흔들면 됩니다.

## 성능·저사양 모드

- 텍스처: 새로 상주하는 것은 대략 1024×512 ×2(안개), 768²(빛줄기), 512²(불빛), 그리고 일섬·파티클·데칼 6장(합계 약 0.3 MP)입니다. 림 시트는 원본을 **바꿔 끼우는 것**이라 추가가 아닙니다.
- draw call 추가: 일섬 1회당 4(살아 있는 0.55초 동안), 파티클 1, 데칼 수만큼(상한 24 / 10), 먹꽃 수만큼(6 / 3). 안개와 빛줄기는 DOM 합성이라 WebGL draw call이 없습니다.
- 블렌드: additive는 코어와 블룸, 불빛뿐입니다. 나머지는 normal입니다. `mix-blend-mode`는 쓰지 않았습니다(폰 합성 비용).
- **저사양(low):** 안개 1겹, 빛줄기 끔, 블룸 끔, 파티클 상한 60, 개수 약 40%, 데칼 10, 먹꽃 3.
  - 자동 전환: 2초 평균 fps가 40 아래로 3초 이어지거나 1% low가 20 아래면 low로 내리고, 판 안에서는 다시 올리지 않습니다. URL `?fx=low`로 강제할 수 있습니다.
  - 림 시트는 low에서도 그대로 씁니다(비용 없음).
- 측정 결과는 `docs/qa-shots/v2/ink-1112/fps.json`과 `fps.md`에 있습니다(헤드리스 소프트웨어 GL이라 절대값은 실제 기기보다 훨씬 낮고, 전후 비교용입니다).

## 파일 목록·용량
`fx-ink.json`(파라미터), `route-map.json`(원래 경로 → 새 경로; 미리보기 하네스가 씀), `rim-meta.json`, `shaders/*.glsl`, `shaders/REFERENCE-inject-fxink.preview.js`.
