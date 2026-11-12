# 모양별 종 (bells) — 디자이너 11/12 20:2x

BRIEF '4차 다듬기'에 따라 만들었습니다. 종 위에 흰 글자를 얹는 방식을 없애고, **모양 무늬가 처음부터 종 몸에 주조된 이미지**로 바꿨습니다. 무늬는 음각 홈 안에 옅은 비취빛(심안 기운)이 차 있고, 홈 벽은 먹선, 아래쪽 턱에는 밝은 주조 턱이 있습니다. 종은 수묵 담채 톤의 손그림입니다(굵고 살짝 고르지 않은 외곽선, 먹 번짐 질감). 반사광·광택은 넣지 않았습니다. 바깥에는 옅은 푸른 기운이 둘러 있어 어두운 바닥에서도 실루엣이 떨어져 보입니다.
- 게임 js는 수정하지 않았습니다. 기존 파일도 덮어쓰지 않았습니다(이 폴더는 새로 만듦, `v2/img/hang-bell.png`는 그대로).
- 생성기: `tools/bells/gen_bells.py` (`/tmp/artvenv/bin/python`). 절차 생성이며 이미지 생성 AI는 쓰지 않았습니다. 미리보기 시트와 대비 측정: `tools/bells/sheet_bells.py`.

## 파일 ↔ 코드 키

모양 키는 `v2/js/gestures.js`의 `LABELS`/`COMBAT`, `game.js`의 `SHAPE_UNLOCK`·`SHAPE_MARK`·`inkGlyphPath()`에서 가져왔고, 파일명에 그대로 씁니다.

| 코드 키 | 모양 | 1x (190×376) | 2x (380×752) | 비고 |
|---|---|---|---|---|
| `tap` | 물방울(탭) | `bell-tap.png` | `bell-tap@2x.png` | 채운 물방울 |
| `hline` | — 가로선 | `bell-hline.png` | `bell-hline@2x.png` | |
| `vline` | ㅣ 세로선 | `bell-vline.png` | `bell-vline@2x.png` | |
| `vee` | V | `bell-vee.png` | `bell-vee@2x.png` | |
| `square` | ㅁ 네모 | `bell-square.png` | `bell-square@2x.png` | 두 모서리를 붓으로 살짝 넘겨 그어 흐려져도 모난 느낌 유지 |
| `circle` | O 원 | `bell-circle.png` | `bell-circle@2x.png` | 원상(ensō), 왼쪽 위가 살짝 열림 |
| `bolt` | ⚡ 번개 | `bell-bolt.png` | `bell-bolt@2x.png` | **예비**: 인식기에만 있고(`allowBolt`) 지금 게임에서는 안 씀 |
| (없음) | 무늬 없음 | `bell-plain.png` | `bell-plain@2x.png` | 보스·연출용 예비 |

## 크기·앵커 (기존 `v2/img/hang-bell.png`과 같은 규격)

- 캔버스는 1x 190×376(기존과 같음), 2x는 380×752입니다. 투명 PNG(RGBA)입니다.
- 매다는 점은 **위쪽 가운데**(x 95, y 0)입니다. 붉은 끈이 맨 위에서 시작하므로 지금 `imgSprite(texBell, bw, bh, { cx: 0.5, cy: 1 })`, `bw = bh * 190/376`을 그대로 쓰면 됩니다.
- 무늬 중심은 1x 기준 (95, 246) 근처, 반폭은 약 51 px입니다(`bells-meta.json`). 몸통은 종 맨 아래까지입니다.
- 종 모양은 기존 범종 실루엣 계열(고리 → 둥근 어깨 → 거의 곧은 몸 → 입술 띠)로 맞췄습니다. 몸통은 조금 넓혀 무늬 자리를 키웠습니다.
- 바깥 푸른 기운은 알파 0.38 이하라서 `alphaTest: 0.08`이면 가장자리 일부만 잘립니다. 기운을 살리려면 0.02로 낮추세요(선택).

## 개발자 적용 (흰 글자 제거 위치)

줄 번호는 11/12 20:23 `game.js`, 19:49 `art.js` 기준입니다(개발자가 계속 수정 중이라 함수 이름으로 찾으세요).

1. **텍스처 미리 불러오기:** `art.js` 154행 `want('img/hang-bell.png', { noBase: true })` 옆에 키마다 `want('bells/bell-' + k + '@2x.png')`를 넣습니다(BASE `assets/v2/` 기준). k = tap, hline, vline, vee, square, circle. 폰에서 텍스처 메모리를 줄이려면 1x를 써도 됩니다(화면에서 25–40px라 1x로 충분).
2. **종 텍스처를 모양별로:** `attachHangingBell(group, bodySheet, worldH, isBoss, opts)`(art.js 360행)에서 `getHangBellTex()` 대신 `tex('bells/bell-' + shape + '@2x.png') || getHangBellTex()`를 씁니다. 모양은 `addEntityVisual('spirit', vis)`의 `vis`(game.js `spawnSpirit` 600행)를 `opts.shape`로 넘기면 됩니다.
3. **모양이 바뀌는 경우:** 종 아이템(`S.bellT > 0`이면 `S.bellShape`)이나 보스 대상 혼령은 `spiritShape(s)`(game.js 867행)가 바뀝니다. 매 프레임 또는 바뀔 때 `s.obj.userData.bellHang.bell.material.map = tex('bells/bell-' + spiritShape(s) + '@2x.png')`로 바꾸세요(바뀔 때만 `needsUpdate`). 미리보기 하네스가 이렇게 했습니다.
4. **흰 글자 오버레이 제거:** `game.js` `updateMarks()`(1042행) 안 1158행 `drawInkGlyph(ctx, sh, x, y, gsize, !!m.aim);`를 일반 혼령에서는 그리지 않게 합니다(`if (m.boss) drawInkGlyph(...)`처럼). 위치 계산·겹침 분리·`lastMarkMetrics`(테스트가 씀)·보스 기호 줄(바로 아래 `if (m.boss && m.seq ...)` 블록)·화면 밖 화살표·심안 원은 그대로 두세요. `drawInkGlyph`/`inkGlyphPath`(986–1038행)는 보스와 화살표에서 계속 쓸 수 있습니다.
5. **조준 표시(금색):** 지금은 `lit`일 때 글자색이 금색(`#F0D48A`)입니다. 오버레이를 없애면 그 표시도 사라지므로, 조준 대상 종은 `bell.material.color.setRGB(1.25, 1.1, 0.8)`(살짝 금빛)이나 종 뒤 작은 금색 후광 스프라이트로 바꾸는 것을 권합니다. 이 부분은 개발자 판단입니다.
6. **크기:** 지금 `bellH = spiritH*0.27*1.5`이고, 375px 화면에서 종이 약 25px입니다(`markMetrics().bellPx` 실측 24.8). 이 크기에서도 무늬가 구분되도록 만들었지만, 4배 확대로 보면 원·네모는 6–7 px짜리 무늬입니다. 여유가 있으면 1.15–1.25배(29–31px) 키우는 것을 권합니다.

## 대비 (측정: `docs/qa-shots/v2/bells-1112/bells-contrast.json`)

- **무늬 vs 종 몸** (WCAG 휘도 비, 획 영역 평균): 1x에서 4.75–5.08:1, 25px로 줄였을 때 3.95–5.27:1(가장 낮은 것은 hline 3.95). 기준 3:1을 모두 넘습니다.
- **색각 시뮬레이션**(Machado 2009, 1·2·3형 강도 1.0): 4.75:1 이상. 무늬는 색이 아니라 밝기 차로 구분되므로 색각 유형과 관계없습니다.
- **어두운 바닥 대비**(맵 1/2/3 바닥 휘도 중앙값): 무늬 11.8 / 13.2 / 13.1:1, 종 몸 2.4 / 2.7 / 2.7:1. 종 몸은 바깥 푸른 기운과 굵은 외곽선으로 바닥과 갈라집니다.
- **25px 구분**(서로 가장 비슷한 쌍, 25px 흑백 평균 절대차): tap/bolt 9.6, square/circle 9.7, hline/vline 9.9. 1차 버전보다 5.5 → 9.6으로 벌어졌습니다.

## 미리보기 (docs/qa-shots/v2/bells-1112/)

- `bells-sheet.png`: 1x 원본, 실제 25px·38px, 맵 3종 실제 바닥 위 배치, 25px 4배 확대(픽셀 그대로), 색각 1·2·3형과 흑백.
- `bells-25px-zoom-v1-v2-v3.png`: 자체 검토 단계별 25px 비교(맵 3종). `bells-sheet-v1.png`, `-v2.png`는 이전 단계입니다.
- `compare-bells-map1-375x667.png`, `compare-bells-map1-1280x720.png`, `before-bells-*`, `after-injected-preview-bells-*`(맵 1–3).
  - after는 **주입 미리보기**입니다. 라이브 빌드에 페이지 쪽 모듈을 넣어 혼령 종 텍스처만 바꾸고 `#marks` 캔버스를 숨겼습니다(`preview/bells-ingame.playwright.js`). 게임 js는 그대로입니다.
  - `#marks`를 통째로 숨겼기 때문에 미리보기에서는 심안 원과 화면 밖 화살표도 같이 안 보입니다. 실제 적용에서는 위 4번처럼 글자만 빼세요.

## 자체 검토 기록

| 단계 | 문제 | 고침 |
|---|---|---|
| v0 | 평평한 윗면에 곧은 옆면이라 항아리·전등갓처럼 보임. 무늬가 검은 테두리 흰 스티커 같음 | 범종 실루엣(둥근 어깨, 원래 고리 모양, 연잎 띠)으로 바꿈. 홈 벽을 얇게 하고 먹 얼룩을 넣음, 주조 턱 하이라이트, 몸통 곡면을 따라 무늬를 휨 |
| v1 | 25px에서 hline 대비 3.06:1로 겨우 넘김. square/circle, vline/bolt가 비슷함(차이 5.5) | 획 0.125 → 0.15, 빛 심을 넓게, 네모는 모서리를 각지게, 번개는 지그재그를 넓게 |
| v2 | 실제 게임(375, 종 약 25px)에서 원·네모 무늬가 5–6px라 작음 | 무늬 크기 +16%, 획 0.17, 중심을 몸통 넓은 곳으로 내림 → 25px 대비 3.95:1 이상, 차이 9.6 |
| 남음 | 무늬를 키운 만큼 1x 원본에서는 '새긴 문양'보다 '큰 표식'에 가까워 보임(가독성 우선). 종 몸 vs 바닥 2.4–2.7:1이라 실루엣은 외곽선과 바깥 기운에 기댐 | 종을 1.15–1.25배 키우면 무늬를 다시 줄여 더 자연스럽게 할 수 있음 |
