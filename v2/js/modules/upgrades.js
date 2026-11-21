/**
 * v2/js/modules/upgrades.js
 * 심안(SIMAN) v0.49 — 난이도 모드, 도전 모드, 판 안 강화 카드(17종), 진화 레시피(10종) 데이터 모듈.
 */

export const MODES = Object.freeze({
  train: { id: 'train', name: '수련', tag: '천천히 익힌다', tele: 1.5, dmg: 0.5, spd: 0.85, bossShapes: -2, starCap: 2, coin: 0.7, gold: false },
  jeongseok: { id: 'jeongseok', name: '정석', tag: '기본 난이도', tele: 1.0, dmg: 1.0, spd: 1.0, bossShapes: 0, starCap: 3, coin: 1.0, gold: false },
  gosu: { id: 'gosu', name: '고수', tag: '금별', tele: 0.85, dmg: 1.5, spd: 1.1, bossShapes: 2, starCap: 3, coin: 1.4, gold: true }
});

export const MODE_ORDER = Object.freeze(['train', 'jeongseok', 'gosu']);

export const MODE_NOTE = Object.freeze({
  train: '예고 ×1.5 · 받는 피해 ×0.5 · 별 2개까지 · 엽전 ×0.7',
  jeongseok: '예고 ×1 · 받는 피해 ×1 · 별 3개 · 엽전 ×1',
  gosu: '예고 ×0.85 · 받는 피해 ×1.5 · 보스 무늬 +2 · 금별 · 엽전 ×1.4'
});

export function modeOf(id) {
  return MODES[id] || MODES.jeongseok;
}

export const CHALLENGES = Object.freeze([
  { id: 'endless', name: '무한 심연', unlock: 8, desc: '끝없는 웨이브 · 3분마다 보스 · 최고 기록' },
  { id: 'bossrush', name: '보스 러시', unlock: 12, desc: '열두 보스 연속 · 체력 이어짐 · 보스 사이 카드 1장' },
  { id: 'trial', name: '무늬 시련', unlock: 4, desc: '장마다 쓸 수 있는 무늬 1~2종만' }
]);

export function challengeOf(id) {
  for (let i = 0; i < CHALLENGES.length; i++) if (CHALLENGES[i].id === id) return CHALLENGES[i];
  return null;
}

export const RUN_UPGRADES = Object.freeze([
  { id: 'dmg', name: '일섬 위력', desc: '일섬이 더 큰 상처를 남깁니다.', maxLv: 8, steps: [1, 0.8, 0.6, 0.5, 0.4, 0.4, 0.4, 0.4] },
  { id: 'width', name: '경로 폭', desc: '베기 선이 넓어져 더 많은 것을 스칩니다.', maxLv: 6 },
  { id: 'dash', name: '일섬 횟수', desc: '같은 모양 혼령 방향으로 한 번 더 돌진합니다.', maxLv: 4 },
  { id: 'ring', name: '심안 반경', desc: '심안(먹안개)이 넓어집니다. Lv3이 최대입니다.', maxLv: 3 },
  { id: 'charge', name: '참 게이지', desc: '참 게이지가 더 빨리 차오릅니다.', maxLv: 5 },
  { id: 'heal', name: '체력 회복', desc: '체력 +5, 이번 판 최대 체력 +2(최대 체력은 3번까지).', maxLv: 99 },
  { id: 'perfect', name: '정확한 획', desc: '획을 깔끔하게 그릴수록(인식 정확도 기준 이상) 일섬이 더 깊이 듭니다.', maxLv: 3 },
  { id: 'parry', name: '칼집 각성', desc: '칼집 패링이 충격파를 내고 참 게이지를 채웁니다.', maxLv: 3 },
  { id: 'ice', name: '얼음 각인', desc: '얼음 일섬 — 이동과 공격을 멈추고, 화염으로 깨뜨립니다.', maxLv: 3 },
  { id: 'fire', name: '화염 각인', desc: '화염 일섬 — 명중 즉시 추가 피해를 줍니다.', maxLv: 3 },
  { id: 'poison', name: '독 각인', desc: '독 일섬 — 중첩 상한과 독구름이 커집니다.', maxLv: 3 },
  { id: 'ward', name: '회전 호신부', desc: '부적 2개가 몸 둘레를 돕니다. 접촉 0.8 피해.', maxLv: 3, auto: true },
  { id: 'bolt', name: '진노의 벼락부적', desc: '4.5초마다 무리 한가운데에 떨어집니다. 예고 0.6초.', maxLv: 5, auto: true },
  { id: 'echo', name: '메아리 칼', desc: '일섬 0.5초 뒤 같은 경로에 잔영이 한 번 더 지나갑니다.', maxLv: 3 },
  { id: 'reson', name: '방울 공명', desc: '혼령이 붙는 순간 그 원귀에게 피해를 줍니다.', maxLv: 3 },
  { id: 'counter', name: '칼집 반격', desc: '정확한 패링 성공 시 가장 가까운 혼령으로 자동 일섬.', maxLv: 2 },
  { id: 'inkstep', name: '먹 발자국', desc: '착지 자리에 먹 웅덩이 2초. 지나는 적이 느려집니다.', maxLv: 3 }
]);

export const EVO_RECIPES = Object.freeze([
  { key: 'frostNova', name: '빙결 참격(절대영도)', a: ['ice'], b: 'width', bLv: 2 },
  { key: 'fireTrail', name: '업화 연쇄', a: ['fire'], b: 'dash', bLv: 2 },
  { key: 'poisonSpread', name: '만독 쇄도', a: ['poison'], b: 'charge', bLv: 2 },
  { key: 'iceCleave', name: '빙참', a: ['ice'], b: 'charge', bLv: 2 },
  { key: 'myriadBell', name: '만종', a: [], b: 'dash', bLv: 2, bell: true },
  { key: 'manryun', name: '만륜', a: ['ward'], aLv: 3, b: 'ring', bLv: 3 },
  { key: 'noebing', name: '뇌빙', a: ['bolt'], aLv: 3, b: 'ice', bLv: 1 },
  { key: 'cheonjong', name: '천종', a: ['reson'], aLv: 3, b: 'dash', bLv: 2 },
  { key: 'gwigeom', name: '귀검', a: ['counter'], aLv: 2, b: 'parry', bLv: 2 },
  { key: 'steam', name: '증기 폭발', a: ['ice'], aLv: 1, b: 'fire', bLv: 1 }
]);
