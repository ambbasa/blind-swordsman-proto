/**
 * v2/js/modules/stages.js
 * 심안(SIMAN) v0.49 — 3막 12장 캠페인 데이터, 한지·먹안개 톤 프리셋 및 스테이지 헬퍼.
 *
 * Node.js 단위 테스트에서 Three.js 없이도 로드·검증할 수 있도록 순수 JS 데이터로 분리했습니다.
 */

export const ACT_NAMES = Object.freeze({
  1: '폐허의 도성',
  2: '안개 산사',
  3: '혈월의 나락'
});

/* v0.49: 심안 원 안쪽은 따뜻한 한지 수묵화를 유지하면서 원 바깥쪽은 깊은 조선 먹안개로 잠기게 대비 강화. */
export const HANJI_TONE = Object.freeze({
  1: { mix: 0.70, paper: 0xdcc9a4, fog: [32, 26, 20], dens: 0.0095, light: 1.45 },
  2: { mix: 0.66, paper: 0xcfd2c8, fog: [24, 34, 36], dens: 0.0130, light: 1.35 },
  3: { mix: 0.62, paper: 0xd6b49a, fog: [42, 16, 14], dens: 0.0115, light: 1.40 }
});

export function actOf(n) {
  return Math.max(1, Math.min(3, Math.ceil((n | 0) / 4)));
}

export const STAGES = [
  /* ---------- 제1막 「폐허의 도성」 ---------- */
  {
    id: 1, act: 1, name: '잿빛 장터', sub: '불탄 기와집, 첫 번째 획', map: 'map1', tag: '가로 한 획',
    goal: '혼령이 든 가로 한 획(—)을 그어 귀물을 베어 넘기세요.',
    tip: '제자리에서 짧게 콕 누르면 칼집으로 받아치는 패링이 됩니다.',
    time: 90, bossAt: 60, bossShapes: 3,
    shapes: ['hline'], spiritCap: 1,
    terrain: { kind: 'none', name: '없음', line: '지형 규칙 없음 — 첫 획을 몸으로 익히는 장터' },
    opening: { n: 5, ring: [0.45, 0.72], brute: 0 },
    mix: [[0, { imp: 1 }], [26, { imp: 0.8, brute: 0.2 }]],
    waves: [
      { t: 42, n: 20, mix: { imp: 0.85, brute: 0.15 }, r: [9, 11] }
    ],
    spawn: { ms: 900, max: 28, earlyMax: 9, earlyMinMs: 1300 },
    boss: { telegraph: 1.35, charge: 16, adds: 0, hazard: 0, patterns: ['charge', 'sweep'], seal: true },
    starCombo: 14, star3: { kind: 'combo' }, bossVisual: { var: 3, scale: 0.9 }, bossName: '재 문지기', bossLine: '불탄 저잣거리를 아직 지키는 자',
    atmo: { clear: 0x1b1a1c, fogCol: [21, 18, 15], fog: 0.020, moon: 22.0, amb: 6.0, hemiI: 6.0, fill: 4.2, hemi: 0x6a6860, ground: 0x1a1612, moonCol: 0xc8c0b0, tint: 'linear-gradient(180deg, rgba(96,112,130,0.12) 0%, rgba(34,44,54,0.18) 100%)' }
  },
  {
    id: 2, act: 1, name: '무너진 성문', sub: '성곽 위에 매달린 원혼', map: 'map2', tag: '가로 · 세로',
    goal: '세로 획(ㅣ)이 열립니다. 두 방향을 오가며 성문을 지키세요.',
    tip: '금테를 두른 정예 원귀를 베면 부적 상자가 떨어집니다.',
    time: 150, eliteAt: 75, bossAt: 115, bossShapes: 4,
    shapes: ['hline', 'vline'], spiritCap: 1,
    terrain: { kind: 'rubble', name: '잔해', line: '잔해 위에 착지하면 0.2초 비틀거림 — 다음 획은 선입력' },
    opening: { n: 6, ring: [0.5, 0.8], brute: 1 },
    mix: [[0, { imp: 0.85, brute: 0.15 }], [22, { imp: 0.66, brute: 0.34 }], [46, { imp: 0.5, brute: 0.32, stone: 0.18 }]],
    waves: [
      { t: 42, n: 24, mix: { imp: 0.7, brute: 0.3 }, r: [9, 11] },
      { t: 90, n: 28, mix: { imp: 0.6, brute: 0.3, stone: 0.1 }, r: [9.5, 12], elite: 1 }
    ],
    spawn: { ms: 800, max: 34, earlyMax: 10, earlyMinMs: 1200 },
    boss: { telegraph: 1.25, charge: 18, adds: 0, hazard: 0, patterns: ['sweep', 'kiai', 'slam', 'charge'], seal: true },
    starCombo: 20, star3: { kind: 'combo', alt: { kind: 'terrain', key: 'rubble', need: 4, text: '잔해 위 착지 4회' } }, bossVisual: { var: 3, scale: 0.92 }, bossName: '성문의 문지기', bossLine: '무너진 성문에 매달려 우는 원혼',
    atmo: { clear: 0x141a26, fogCol: [12, 17, 26], fog: 0.024, moon: 20.0, amb: 5.6, hemiI: 6.6, fill: 4.0, hemi: 0x5c6a8c, ground: 0x11141c, moonCol: 0xa9b8dd, tint: 'linear-gradient(180deg, rgba(44,64,150,0.20) 0%, rgba(8,18,58,0.26) 100%)' }
  },
  {
    id: 3, act: 1, name: '대나무 골', sub: '서낭당 너머로 우는 소리', map: 'map3', tag: 'V 두 획',
    goal: 'V자 두 획이 열립니다. 조여오는 무리를 한 번에 가르세요.',
    tip: 'V·번개 획은 가장 위협적인 귀물을 알아서 찾아갑니다.',
    time: 180, eliteAt: 90, bossAt: 140, bossShapes: 4,
    shapes: ['hline', 'vline', 'vee'], spiritCap: 2,
    terrain: { kind: 'bamboo', name: '대숲', line: '대숲을 가로지르는 일섬은 0.3초 느려지지만 피해 +30%' },
    opening: { n: 7, ring: [0.55, 0.85], brute: 1 },
    mix: [[0, { imp: 0.8, brute: 0.2 }], [20, { imp: 0.6, brute: 0.3, stone: 0.1 }], [44, { imp: 0.45, brute: 0.33, stone: 0.22 }]],
    waves: [
      { t: 42, n: 26, mix: { imp: 0.7, brute: 0.3 }, r: [9, 11] },
      { t: 84, n: 30, mix: { imp: 0.55, brute: 0.3, stone: 0.15 }, r: [9.5, 12], elite: 1 },
      { t: 126, n: 34, mix: { imp: 0.5, brute: 0.32, stone: 0.18 }, r: [9.5, 12.5], elite: 1 }
    ],
    spawn: { ms: 700, max: 40, earlyMax: 11, earlyMinMs: 1100 },
    boss: { telegraph: 1.15, charge: 19, adds: 0, hazard: 1, patterns: ['clones', 'charge', 'veil', 'kiai'], seal: true },
    starCombo: 26, star3: { kind: 'combo', alt: { kind: 'terrain', key: 'bamboo', need: 3, text: '대숲 가로지른 일섬 3회' } }, bossVisual: { var: 3, scale: 0.94 }, bossName: '대숲의 울음', bossLine: '베인 대나무 사이에서 우는 것',
    atmo: { clear: 0x121a15, fogCol: [11, 19, 14], fog: 0.026, moon: 18.0, amb: 5.4, hemiI: 6.2, fill: 3.6, hemi: 0x6f8472, ground: 0x12160f, moonCol: 0xb4d2b4, tint: 'linear-gradient(180deg, rgba(28,92,60,0.18) 0%, rgba(6,26,16,0.26) 100%)' }
  },
  {
    id: 4, act: 1, name: '붉은 달', sub: '모든 획이 열린 밤', map: 'map1', tag: '번개 획',
    goal: '번개 획(Z)까지 열렸습니다. 여섯 번의 절단으로 끝내세요.',
    tip: '보스가 돌진한 뒤 경직될 때 베면 절단이 두 번 들어갑니다.',
    time: 180, eliteAt: 85, bossAt: 135, bossShapes: 6,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 2,
    terrain: { kind: 'moon', name: '월광 주기', line: '20초마다 5초 붉은 달빛 — 원귀 +20% · 처치 엽전 ×2' },
    opening: { n: 8, ring: [0.55, 0.9], brute: 2 },
    mix: [[0, { imp: 0.75, brute: 0.25 }], [18, { imp: 0.55, brute: 0.3, stone: 0.15 }], [40, { imp: 0.42, brute: 0.33, stone: 0.25 }]],
    waves: [
      { t: 40, n: 28, mix: { imp: 0.65, brute: 0.35 }, r: [9, 11] },
      { t: 82, n: 32, mix: { imp: 0.5, brute: 0.32, stone: 0.18 }, r: [9.5, 12], elite: 1 },
      { t: 122, n: 36, mix: { imp: 0.45, brute: 0.33, stone: 0.22 }, r: [9.5, 12.5], elite: 1 }
    ],
    spawn: { ms: 580, max: 45, earlyMax: 12, earlyMinMs: 1000 },
    boss: { telegraph: 1.0, charge: 21, adds: 0, hazard: 1, patterns: ['sweep', 'volley', 'chant', 'charge'], phase2: ['slam', 'kiai', 'clones'], seal: true },
    starCombo: 32, star3: { kind: 'pattern', counter: 'goldReflect', need: 2, text: '금빛 부적 되받기 2회' }, bossVisual: { var: 0, scale: 1.05 }, bossName: '붉은 달의 사냥꾼', bossLine: '달이 붉어지면 사냥을 시작하는 자',
    atmo: { clear: 0x1c0f12, fogCol: [30, 10, 11], fog: 0.028, moon: 21.0, amb: 6.0, hemiI: 5.8, fill: 4.0, hemi: 0x8a5a52, ground: 0x1e1210, moonCol: 0xff9c84, tint: 'linear-gradient(180deg, rgba(150,32,28,0.22) 0%, rgba(52,6,8,0.28) 100%)' }
  },

  /* ---------- 제2막 「안개 산사」 ---------- */
  {
    id: 5, act: 2, name: '안개 석탑', sub: '구름에 잠긴 탑, 흔들리는 종소리', map: 'map5', tag: '네 획의 밤',
    goal: '네 가지 획이 모두 열린 산길입니다. 탑을 등지고 오는 무리를 베세요.',
    tip: '푸른 테의 원귀가 붉게 웅크리면 곧 곧장 달려옵니다 — 그 순간 일섬으로 비켜서세요.',
    time: 190, eliteAt: 95, bossAt: 150, bossShapes: 5,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 2,
    terrain: { kind: 'fog', name: '짙은 안개 띠', line: '심안의 원이 10초 주기로 ±8% 숨을 쉽니다' },
    opening: { n: 8, ring: [0.55, 0.88], brute: 2 },
    mix: [[0, { imp: 0.7, brute: 0.22, charger: 0.08 }], [24, { imp: 0.52, brute: 0.26, charger: 0.14, stone: 0.08 }], [58, { imp: 0.42, brute: 0.26, charger: 0.16, stone: 0.1, thrower: 0.06 }]],
    waves: [
      { t: 40, n: 30, mix: { imp: 0.6, brute: 0.3, charger: 0.1 }, r: [9, 11] },
      { t: 84, n: 34, mix: { imp: 0.5, brute: 0.28, charger: 0.14, stone: 0.08 }, r: [9.5, 12], elite: 1 },
      { t: 126, n: 38, mix: { imp: 0.42, brute: 0.26, charger: 0.18, thrower: 0.08, stone: 0.06 }, r: [9.5, 12.5], elite: 1 }
    ],
    spawn: { ms: 680, max: 44, earlyMax: 12, earlyMinMs: 1050 },
    boss: { telegraph: 1.15, charge: 19, adds: 0, hazard: 2, patterns: ['charge', 'kiai', 'slam'], seal: true },
    starCombo: 30, star3: { kind: 'goal', text: '석등을 60초 지키기' }, subgoal: { id: 'guard', t: 60, hp: 10, label: '석등 지키기 60초' }, bossVisual: { var: 3, scale: 0.96 }, bossName: '탑을 감은 안개', bossLine: '구름에 잠긴 탑의 종지기',
    atmo: { clear: 0x101a1e, fogCol: [14, 24, 28], fog: 0.032, moon: 17.0, amb: 5.2, hemiI: 6.4, fill: 3.4, hemi: 0x6f8a92, ground: 0x0d1417, moonCol: 0xbcd8dc, tint: 'linear-gradient(180deg, rgba(38,86,96,0.20) 0%, rgba(6,20,26,0.30) 100%)' }
  },
  {
    id: 6, act: 2, name: '설산 폐사찰', sub: '눈에 덮인 부처, 꺼지지 않은 향', map: 'map6', tag: '눈보라',
    goal: '눈 덮인 산사에 부적을 던지는 원귀가 숨어 있습니다. 그들을 먼저 끊으세요.',
    tip: '멀찍이 서서 부적을 던지는 원귀는 일섬으로 파고들어야 합니다.',
    time: 200, eliteAt: 100, bossAt: 158, bossShapes: 6,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 2,
    terrain: { kind: 'snow', name: '눈밭', line: '착지 뒤 0.6m 미끄러짐 — 착지 지점을 계산하세요' },
    opening: { n: 9, ring: [0.5, 0.9], brute: 2 },
    mix: [[0, { imp: 0.66, brute: 0.24, thrower: 0.1 }], [22, { imp: 0.5, brute: 0.26, thrower: 0.14, stone: 0.1 }], [55, { imp: 0.4, brute: 0.24, thrower: 0.16, charger: 0.1, stone: 0.1 }]],
    waves: [
      { t: 42, n: 32, mix: { imp: 0.54, brute: 0.28, thrower: 0.18 }, r: [9, 11] },
      { t: 88, n: 36, mix: { imp: 0.44, brute: 0.26, thrower: 0.16, stone: 0.14 }, r: [9.5, 12], elite: 1 },
      { t: 132, n: 40, mix: { imp: 0.36, brute: 0.24, thrower: 0.18, charger: 0.12, stone: 0.1 }, r: [9.5, 12.5], elite: 1 }
    ],
    spawn: { ms: 620, max: 46, earlyMax: 12, earlyMinMs: 1000 },
    boss: { telegraph: 1.05, charge: 20, adds: 0, hazard: 3, patterns: ['volley', 'sweep', 'slam', 'kiai'], seal: true },
    starCombo: 34, star3: { kind: 'combo', alt: { kind: 'terrain', key: 'snow', need: 4, text: '눈밭 미끄러짐 4회' } }, bossVisual: { var: 3, scale: 0.98 }, bossName: '눈 밑의 중', bossLine: '향을 끊지 못한 채 눈에 덮인 자',
    atmo: { clear: 0x161d25, fogCol: [22, 30, 40], fog: 0.034, moon: 16.0, amb: 5.4, hemiI: 6.8, fill: 3.6, hemi: 0x8aa0b4, ground: 0x11161d, moonCol: 0xdcecf8, tint: 'linear-gradient(180deg, rgba(120,160,200,0.20) 0%, rgba(14,24,38,0.30) 100%)' }
  },
  {
    id: 7, act: 2, name: '고목 골', sub: '잎이 진 나무들이 길을 막는다', map: 'map7', tag: '혼령 셋',
    goal: '혼령이 셋 머무는 골짜기입니다. 세 갈래 획을 한 번에 꿰세요.',
    tip: '몸이 주황으로 부풀어 오르는 원귀는 터집니다 — 붙기 전에 베세요.',
    time: 210, eliteAt: 105, bossAt: 166, bossShapes: 7,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 3,
    terrain: { kind: 'root', name: '뿌리', line: '뿌리 위 착지는 0.4초 묶이지만 착지 충격이 두 배' },
    opening: { n: 10, ring: [0.5, 0.9], brute: 2 },
    mix: [[0, { imp: 0.6, brute: 0.26, bomber: 0.14 }], [20, { imp: 0.44, brute: 0.26, bomber: 0.16, charger: 0.14 }], [50, { imp: 0.34, brute: 0.24, bomber: 0.16, charger: 0.16, stone: 0.1 }]],
    waves: [
      { t: 42, n: 34, mix: { imp: 0.5, brute: 0.28, bomber: 0.22 }, r: [9, 11] },
      { t: 88, n: 38, mix: { imp: 0.4, brute: 0.26, bomber: 0.18, charger: 0.16 }, r: [9.5, 12], elite: 1 },
      { t: 134, n: 42, mix: { imp: 0.32, brute: 0.24, bomber: 0.18, charger: 0.16, stone: 0.1 }, r: [9.5, 12.5], elite: 1 }
    ],
    spawn: { ms: 580, max: 48, earlyMax: 13, earlyMinMs: 980 },
    boss: { telegraph: 1.0, charge: 21, adds: 0, hazard: 3, patterns: ['clones', 'charge', 'veil', 'kiai'], phase2: ['slam'], seal: true },
    starCombo: 38, star3: { kind: 'goal', text: '정예 3마리 사냥' }, subgoal: { id: 'hunt', n: 3, t: 90, label: '정예 3마리 사냥' }, bossVisual: { var: 3, scale: 1.0 }, bossName: '고목에 깃든 것', bossLine: '잎이 진 나무에 뿌리내린 원혼',
    atmo: { clear: 0x121a14, fogCol: [16, 24, 18], fog: 0.030, moon: 17.5, amb: 5.3, hemiI: 6.2, fill: 3.4, hemi: 0x74886e, ground: 0x0f1410, moonCol: 0xbfd6bc, tint: 'linear-gradient(180deg, rgba(46,84,52,0.20) 0%, rgba(8,20,10,0.30) 100%)' }
  },
  {
    id: 8, act: 2, name: '무명 산문', sub: '이름 없는 절의 마지막 문', map: 'map8', tag: '산문 앞',
    goal: '산문을 지키는 원혼이 길고 긴 도형을 듭니다. 아홉 번의 절단.',
    tip: '보스가 부르는 잔몹은 참으로 한꺼번에 쓸어 담으세요.',
    time: 220, eliteAt: 110, bossAt: 162, bossShapes: 9,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 3,
    terrain: { kind: 'bell', name: '종루', line: '일섬으로 종을 치면 원 밖 원귀가 2초 드러납니다' },
    opening: { n: 10, ring: [0.5, 0.92], brute: 3 },
    mix: [[0, { imp: 0.58, brute: 0.26, thrower: 0.16 }], [18, { imp: 0.42, brute: 0.26, thrower: 0.18, charger: 0.14 }], [46, { imp: 0.32, brute: 0.24, thrower: 0.18, charger: 0.14, bomber: 0.12 }]],
    waves: [
      { t: 44, n: 36, mix: { imp: 0.46, brute: 0.28, thrower: 0.26 }, r: [9, 11] },
      { t: 92, n: 40, mix: { imp: 0.38, brute: 0.26, thrower: 0.2, charger: 0.16 }, r: [9.5, 12], elite: 1 },
      { t: 140, n: 44, mix: { imp: 0.3, brute: 0.24, thrower: 0.18, charger: 0.16, bomber: 0.12 }, r: [9.5, 13], elite: 1 }
    ],
    spawn: { ms: 520, max: 50, earlyMax: 13, earlyMinMs: 950 },
    boss: { telegraph: 0.9, charge: 22, adds: 0, hazard: 4, patterns: ['clash', 'sweep', 'slam'], phase2: ['mimic', 'veil', 'kiai'], seal: true },
    starCombo: 42, star3: { kind: 'pattern', counter: 'clashWin', need: 2, text: '합 겨루기 2합 성공' }, bossVisual: { var: 1, scale: 1.1 }, bossName: '무명 검귀', bossLine: '눈을 잃은 채 길을 지키는 자',
    atmo: { clear: 0x171a22, fogCol: [24, 26, 34], fog: 0.036, moon: 15.5, amb: 5.6, hemiI: 7.0, fill: 3.8, hemi: 0x8c8ea4, ground: 0x13151b, moonCol: 0xd6d2e8, tint: 'linear-gradient(180deg, rgba(92,86,150,0.18) 0%, rgba(14,14,30,0.30) 100%)' }
  },

  /* ---------- 제3막 「혈월의 나락」 ---------- */
  {
    id: 9, act: 3, name: '혈석 제단', sub: '붉은 돌이 숨 쉬는 제단', map: 'map9', tag: '혈석',
    goal: '혈석이 빛을 머금습니다. 제단에 닿기 전에 모두 베세요.',
    tip: '다중 장판이 깔리면 빛나는 땅을 밟지 마세요 — 터지기 전에 빠져나옵니다.',
    time: 225, eliteAt: 112, bossAt: 166, bossShapes: 8,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 3,
    terrain: { kind: 'blood', name: '혈석', line: '핏빛 바닥 위 원귀는 재생 — 혈석을 베어 끄세요' },
    opening: { n: 11, ring: [0.5, 0.92], brute: 3 },
    mix: [[0, { imp: 0.52, brute: 0.26, charger: 0.22 }], [18, { imp: 0.38, brute: 0.26, charger: 0.2, bomber: 0.16 }], [44, { imp: 0.28, brute: 0.24, charger: 0.18, bomber: 0.16, stone: 0.14 }]],
    waves: [
      { t: 44, n: 38, mix: { imp: 0.42, brute: 0.28, charger: 0.3 }, r: [9, 11.5] },
      { t: 92, n: 42, mix: { imp: 0.34, brute: 0.26, charger: 0.22, bomber: 0.18 }, r: [9.5, 12.5], elite: 1 },
      { t: 142, n: 46, mix: { imp: 0.26, brute: 0.24, charger: 0.2, bomber: 0.16, stone: 0.14 }, r: [9.5, 13], elite: 1 }
    ],
    spawn: { ms: 580, max: 52, earlyMax: 14, earlyMinMs: 920 },
    boss: { telegraph: 1.0, charge: 22, adds: 0, hazard: 4, patterns: ['shrink', 'charge', 'kiai', 'volley'], phase2: ['clones'], seal: true },
    starCombo: 46, star3: { kind: 'goal', text: '한 무늬로 30초' }, subgoal: { id: 'shapeLock', at: 20, t: 30, label: '한 무늬로 30초' }, bossVisual: { var: 3, scale: 1.03 }, bossName: '혈석을 문 자', bossLine: '붉은 돌에 목숨을 맡긴 제관',
    atmo: { clear: 0x1e0e11, fogCol: [34, 12, 14], fog: 0.030, moon: 22.0, amb: 7.4, hemiI: 6.2, fill: 4.6, hemi: 0xa8746e, ground: 0x1e0f10, moonCol: 0xff9a80, tint: 'linear-gradient(180deg, rgba(150,28,34,0.20) 0%, rgba(44,4,8,0.24) 100%)' }
  },
  {
    id: 10, act: 3, name: '뼈의 강', sub: '마른 강바닥에 쌓인 뼈', map: 'map10', tag: '혼령 넷',
    goal: '혼령이 넷까지 머뭅니다. 넷을 한 번에 꿰는 획을 노리세요.',
    tip: '혼령 슬롯 카드가 있으면 넷이 동시에 종을 듭니다.',
    time: 230, eliteAt: 115, bossAt: 170, bossShapes: 9,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 4,
    terrain: { kind: 'water', name: '물길', line: '물길을 가로지르는 일섬은 길이 −30%, 물 위 원귀는 느림' },
    opening: { n: 12, ring: [0.5, 0.95], brute: 3 },
    mix: [[0, { imp: 0.48, brute: 0.26, thrower: 0.26 }], [16, { imp: 0.36, brute: 0.26, thrower: 0.2, charger: 0.18 }], [42, { imp: 0.26, brute: 0.24, thrower: 0.18, charger: 0.16, bomber: 0.16 }]],
    waves: [
      { t: 44, n: 40, mix: { imp: 0.38, brute: 0.28, thrower: 0.34 }, r: [9, 11.5] },
      { t: 94, n: 44, mix: { imp: 0.3, brute: 0.26, thrower: 0.22, charger: 0.22 }, r: [9.5, 12.5], elite: 1 },
      { t: 146, n: 48, mix: { imp: 0.24, brute: 0.24, thrower: 0.2, charger: 0.16, bomber: 0.16 }, r: [9.5, 13], elite: 1 }
    ],
    spawn: { ms: 520, max: 54, earlyMax: 14, earlyMinMs: 900 },
    boss: { telegraph: 0.92, charge: 23, adds: 0, hazard: 4, patterns: ['chant', 'slam', 'clones', 'charge', 'kiai'], phase2: ['volley'], seal: true },
    starCombo: 50, star3: { kind: 'goal', text: '어둠 60초 버티기' }, subgoal: { id: 'dark', t: 60, label: '어둠 60초 버티기' }, bossVisual: { var: 3, scale: 1.06 }, bossName: '뼈의 뱃사공', bossLine: '마른 강에서 삯을 받는 자',
    atmo: { clear: 0x18100f, fogCol: [28, 20, 16], fog: 0.036, moon: 18.0, amb: 6.0, hemiI: 6.0, fill: 4.2, hemi: 0x9a8a76, ground: 0x151010, moonCol: 0xe8c8a8, tint: 'linear-gradient(180deg, rgba(120,88,58,0.22) 0%, rgba(34,18,12,0.32) 100%)' }
  },
  {
    id: 11, act: 3, name: '혈월 성채', sub: '달이 가장 가까운 성벽', map: 'map11', tag: '정예 셋',
    goal: '성벽 위의 원혼이 열한 번의 도형을 겁니다. 정예도 셋입니다.',
    tip: '정예 원귀의 부적 상자는 강화 3연속 — 놓치지 마세요.',
    time: 240, eliteAt: 118, bossAt: 176, bossShapes: 10,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 4,
    terrain: { kind: 'wall', name: '성벽 포대', line: '30초마다 성벽에서 화살비 — 예고 원 1.2초를 피하세요' },
    opening: { n: 12, ring: [0.48, 0.95], brute: 4 },
    mix: [[0, { imp: 0.44, brute: 0.26, charger: 0.3 }], [16, { imp: 0.32, brute: 0.26, charger: 0.22, bomber: 0.2 }], [40, { imp: 0.24, brute: 0.24, charger: 0.2, bomber: 0.18, stone: 0.14 }]],
    waves: [
      { t: 44, n: 42, mix: { imp: 0.34, brute: 0.28, charger: 0.38 }, r: [9, 12] },
      { t: 96, n: 46, mix: { imp: 0.28, brute: 0.26, charger: 0.24, bomber: 0.22 }, r: [9.5, 13], elite: 1 },
      { t: 150, n: 50, mix: { imp: 0.22, brute: 0.24, charger: 0.2, bomber: 0.18, stone: 0.16 }, r: [9.5, 13], elite: 1 }
    ],
    spawn: { ms: 500, max: 56, earlyMax: 15, earlyMinMs: 880 },
    boss: { telegraph: 0.88, charge: 24, adds: 0, hazard: 5, patterns: ['volley', 'veil', 'charge', 'slam', 'kiai'], phase2: ['clones', 'chant'], seal: true },
    starCombo: 54, star3: { kind: 'goal', text: '줄어든 시간에 클리어' }, subgoal: { id: 'timed', cut: 0.3, add: 0.5, label: '시간 −30% · 처치 +0.5초' }, bossVisual: { var: 3, scale: 1.1 }, bossName: '성벽의 활잡이', bossLine: '혈월 아래 성벽을 지키는 자',
    atmo: { clear: 0x22090d, fogCol: [40, 10, 14], fog: 0.030, moon: 23.0, amb: 7.8, hemiI: 6.4, fill: 5.0, hemi: 0xb0706a, ground: 0x220b0e, moonCol: 0xff8a72, tint: 'linear-gradient(180deg, rgba(170,20,30,0.20) 0%, rgba(48,2,8,0.24) 100%)' }
  },
  {
    id: 12, act: 3, name: '나락의 심연', sub: '검은 달이 떨어지는 자리', map: 'map12', tag: '올 클리어',
    goal: '열두 번의 도형, 쉼 없는 장판. 마지막 획으로 나락을 끊으세요.',
    tip: '마지막 귀물은 장판을 다섯 겹으로 깝니다 — 붉은 예고선을 보고 일섬으로 빠져나가세요.',
    time: 250, eliteAt: 125, bossAt: 182, bossShapes: 11,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 4,
    terrain: { kind: 'none', name: '없음', line: '지형 규칙 없음 — 마지막 획에 집중하는 심연' },
    opening: { n: 14, ring: [0.48, 1.0], brute: 4 },
    mix: [[0, { imp: 0.4, brute: 0.26, charger: 0.34 }], [14, { imp: 0.28, brute: 0.26, charger: 0.24, bomber: 0.22 }], [38, { imp: 0.2, brute: 0.24, charger: 0.22, bomber: 0.2, thrower: 0.14 }]],
    waves: [
      { t: 44, n: 44, mix: { imp: 0.3, brute: 0.28, charger: 0.42 }, r: [9, 12] },
      { t: 96, n: 48, mix: { imp: 0.24, brute: 0.26, charger: 0.26, bomber: 0.24 }, r: [9.5, 13], elite: 1 },
      { t: 150, n: 52, mix: { imp: 0.18, brute: 0.24, charger: 0.22, bomber: 0.2, thrower: 0.16 }, r: [9.5, 13.5], elite: 1 }
    ],
    spawn: { ms: 460, max: 58, earlyMax: 15, earlyMinMs: 860 },
    boss: { telegraph: 0.8, charge: 25, adds: 0, hazard: 5, patterns: ['shuffle', 'sweep', 'volley'], phase2: ['chant', 'slam', 'kiai'], phase3: ['clones', 'veil', 'mimic'], seal: true },
    starCombo: 58, star3: { kind: 'pattern', counter: 'shuffleLock', need: 2, text: '무늬 뒤섞기 고정 2회' }, bossVisual: { var: 2, scale: 1.15 }, bossName: '나락의 주인', bossLine: '검은 달이 떨어지는 자리를 지키는 것',
    atmo: { clear: 0x2a0709, fogCol: [40, 8, 12], fog: 0.028, moon: 26.0, amb: 8.4, hemiI: 7.2, fill: 5.4, hemi: 0xc08a80, ground: 0x2a0b10, moonCol: 0xff7a5c, tint: 'linear-gradient(180deg, rgba(150,16,26,0.20) 0%, rgba(44,2,8,0.24) 100%)' }
  }
];

export function stageOf(n) {
  const idx = Math.max(1, Math.min(STAGES.length, (n | 0) || 1)) - 1;
  return STAGES[idx];
}

/**
 * Three.Color 생성자를 주입받아 1~3막 한지 톤·먹안개 파생 값을 STAGES[].atmo에 적용합니다.
 */
export function applyHanjiToneToStages(ColorCtor, stages = STAGES) {
  if (!ColorCtor) return stages;
  const hc = new ColorCtor();
  const hp = new ColorCtor();
  stages.forEach(function (st) {
    const a = st.atmo;
    if (!a) return;
    const t = HANJI_TONE[actOf(st.id)] || HANJI_TONE[1];
    hc.setHex(a.clear || 0x1b1a1c);
    hp.setHex(t.paper);
    hc.lerp(hp, t.mix);
    a.clear = hc.getHex();
    a.fogCol = t.fog.slice();
    a.fog = t.dens;
    ['moon', 'amb', 'hemiI', 'fill'].forEach(function (k) {
      if (a[k] != null) a[k] = +(a[k] * t.light).toFixed(2);
    });
    a.hemi = hc.clone().offsetHSL(0, -0.04, 0.06).getHex();
    a.ground = hp.clone().offsetHSL(0.01, -0.02, -0.16).getHex();
    a.moonCol = hp.clone().offsetHSL(0.02, 0.16, 0.18).getHex();
    a.tint = actOf(st.id) === 3
      ? 'linear-gradient(180deg, rgba(150,60,34,0.10) 0%, rgba(60,18,12,0.10) 100%)'
      : 'linear-gradient(180deg, rgba(198,168,116,0.10) 0%, rgba(120,96,62,0.08) 100%)';
  });
  return stages;
}
