/* 심안 v0.33 — 메타 데이터 (판 밖 성장)
   무구(검) 5 · 유물 12 · 보스/기물 외형 6 · 수련장 붓 자국 4 · 도감 4묶음.
   여기에는 '값'만 두고, 판 안 효과는 game.js가 save를 읽어 적용한다.
   힘을 파는 상품(능력치 직접 판매)은 없다 — §12 원칙: 배운 만큼 강해진다. */

export const SAVE_VERSION = 3;

/* §9.2 무구(검): 600~1,500. 장 첫 클리어로 도면이 열린다. */
export const SWORDS = [
  { id: 'muk', name: '묵검', price: 0, unlock: 0, desc: '기본 검. 먹이 가장 깊이 든다.', fx: {} },
  { id: 'seori', name: '서릿검', price: 600, unlock: 4, desc: '일섬의 첫 원귀를 0.6초 얼립니다.', fx: { freeze: 0.6 } },
  { id: 'hwa', name: '화살검', price: 900, unlock: 5, desc: '콤보 12마다 불꽃이 터져 주변을 태웁니다.', fx: { comboFire: 12 } },
  { id: 'cheong', name: '청풍검', price: 1200, unlock: 8, desc: '일섬이 10% 더 멀리 지나갑니다.', fx: { dashLen: 1.1 } },
  { id: 'gwi', name: '귀문검', price: 1500, unlock: 10, desc: '빈틈을 베면 참이 5 더 찹니다.', fx: { gapCharge: 5 } }
];

/* §9.4 유물 12종: 규칙을 바꾸는 효과. 판 시작 1개(저주 염주면 2개) 장착. */
export const RELICS = [
  { id: 'mirror', name: '청동 거울', price: 300, desc: '판당 첫 피격을 한 번 막습니다.' },
  { id: 'oldbell', name: '묵은 방울', price: 250, desc: '원 밖 혼령의 화살표가 0.5초 일찍 뜨고 방울이 크게 울립니다.' },
  { id: 'sheath', name: '금실 칼집', price: 500, desc: '기모으기 금빛 칸이 0.1초 길어집니다.' },
  { id: 'jar', name: '빈 항아리', price: 350, desc: '묵항아리 드롭이 두 배입니다.' },
  { id: 'blood', name: '혈월 부적', price: 450, desc: '체력 절반 아래면 일섬 피해 +25%.' },
  { id: 'tower', name: '거꾸로 된 탑', price: 600, desc: '보스 무늬 −1, 대신 받는 피해 +1.' },
  { id: 'needle', name: '안개 바늘', price: 400, desc: '원 반경 −10%, 처치 엽전 +30%.' },
  { id: 'eye', name: '세 번째 눈', price: 350, desc: '은신한 보스의 방울 간격 −30%.' },
  { id: 'totem', name: '기물 장인', price: 700, desc: '보스전 기물이 4개(무늬 하나는 V 재사용).' },
  { id: 'brush', name: '늙은 붓', price: 450, desc: '정확한 획 문턱 −0.05.' },
  { id: 'lantern', name: '연꽃 등', price: 300, desc: '판 시작 참 +30.' },
  { id: 'beads', name: '저주 염주', price: 700, desc: '유물을 2개 장착, 대신 최대 체력 −4.' }
];

/* §9.2 외형: 보스·기물 색조 6종(능력 없음) */
export const SKINS = [
  { id: 'none', name: '기본', price: 0, rim: 0xF2E2C0, glow: [1.7, 0.22, 0.14] },
  { id: 'hwang', name: '황혼빛', price: 400, rim: 0xE8C04A, glow: [1.6, 1.1, 0.35] },
  { id: 'cheong', name: '청동빛', price: 450, rim: 0x6FD2C4, glow: [0.5, 1.5, 1.4] },
  { id: 'jaju', name: '자줏빛', price: 500, rim: 0xB08AE8, glow: [1.4, 0.7, 1.8] },
  { id: 'baek', name: '백골빛', price: 600, rim: 0xF2E2C0, glow: [1.4, 1.4, 1.3] },
  { id: 'nok', name: '이끼빛', price: 800, rim: 0x8AC26A, glow: [0.8, 1.5, 0.7] }
];

/* §9.2 수련장 붓 자국 4종: 획의 먹색·굵기(능력 없음) */
export const BRUSHES = [
  { id: 'none', name: '기본 먹', price: 0, color: '236,240,230', width: 1 },
  { id: 'jin', name: '진먹', price: 200, color: '255,250,236', width: 1.15 },
  { id: 'yeon', name: '연먹', price: 200, color: '210,220,236', width: 0.9 },
  { id: 'hwang', name: '황먹', price: 200, color: '255,224,150', width: 1 },
  { id: 'jeok', name: '적먹', price: 200, color: '255,150,130', width: 1 }
];

export const MON_CODE = [
  { id: 'imp', name: '원귀', desc: '가장 흔한 잡귀' },
  { id: 'brute', name: '장정 원귀', desc: '갑옷을 두른 원귀 — 첫 일섬은 갑옷만 깨고 무늬가 바뀐다' },
  { id: 'stone', name: '돌덩이 원귀', desc: '다른 무늬 두 번이면 갈라진다' },
  { id: 'elite', name: '정예 원귀', desc: '머리 위 봉인 순서 3개를 차례로 벤다' },
  { id: 'charger', name: '돌진 원귀', desc: '낮게 웅크린 뒤 곧장 달려든다' },
  { id: 'thrower', name: '투척 원귀', desc: '거리를 두고 부적을 던진다' },
  { id: 'bomber', name: '자폭 원귀', desc: '붙으면 부풀어 터진다' },
  { id: 'clone', name: '분신', desc: '방울이 우는 쪽이 진짜다' }
];

export const PAT_SLOTS = 9;      /* 도감 패턴 9칸(기본 9패턴) */
export const EVO_SLOTS = 10;     /* 진화 10칸 */
export const CODEX_GROUPS = [
  { key: 'mon', label: '귀물', slots: 8 },
  { key: 'boss', label: '보스', slots: 12 },
  { key: 'evo', label: '진화', slots: 10 },
  { key: 'pat', label: '패턴', slots: 9 }
];

/* ---------- 순수 헬퍼: save 조각을 받아 계산만 한다 ---------- */
export function ownedOf(save, kind, id) {
  const box = save && save[kind];
  return !!(box && box.owned && box.owned[id]);
}
export function equipOf(save, kind) {
  const box = save && save[kind];
  return (box && box.equipped) || null;
}
export function swordFx(save) {
  const eq = equipOf(save, 'swords') || 'muk';
  for (let i = 0; i < SWORDS.length; i++) if (SWORDS[i].id === eq) return SWORDS[i].fx || {};
  return {};
}
export function swordOf(save) {
  const eq = equipOf(save, 'swords') || 'muk';
  for (let i = 0; i < SWORDS.length; i++) if (SWORDS[i].id === eq) return SWORDS[i];
  return SWORDS[0];
}
export function equippedRelics(save) {
  const box = (save && save.relics) || {};
  const eq = Array.isArray(box.equipped) ? box.equipped.slice(0, relicSlots(save)) : [];
  return eq;
}
export function relicSlots(save) {
  const eq = (save && save.relics && Array.isArray(save.relics.equipped)) ? save.relics.equipped : [];
  return eq.indexOf('beads') >= 0 ? 2 : 1;
}
export function relicOn(save, id) {
  return equippedRelics(save).indexOf(id) >= 0;
}
export function skinOf(save) {
  const eq = equipOf(save, 'skins') || 'none';
  for (let i = 0; i < SKINS.length; i++) if (SKINS[i].id === eq) return SKINS[i];
  return SKINS[0];
}
export function brushOf(save) {
  const eq = equipOf(save, 'brush') || 'none';
  for (let i = 0; i < BRUSHES.length; i++) if (BRUSHES[i].id === eq) return BRUSHES[i];
  return BRUSHES[0];
}
/* §9.3 묶음을 완성할 때마다 엽전 +5% (최대 +20%) */
export function codexCounts(save) {
  const c = (save && save.codex) || {};
  const mon = c.mon ? Object.keys(c.mon).filter(function (k) { return c.mon[k]; }).length : 0;
  const boss = c.boss ? Object.keys(c.boss).filter(function (k) { return c.boss[k]; }).length : 0;
  const evo = c.evo ? Object.keys(c.evo).filter(function (k) { return c.evo[k]; }).length : 0;
  const pat = c.pat ? Object.keys(c.pat).filter(function (k) { return c.pat[k] && isBasePat(k); }).length : 0;
  return { mon: mon, boss: boss, evo: evo, pat: pat };
}
export function isBasePat(id) {
  return ['charge', 'kiai', 'slam', 'volley', 'chant', 'clones', 'veil', 'shrink', 'seal'].indexOf(id) >= 0;
}
export function codexBonus(save) {
  const n = codexCounts(save);
  let done = 0;
  if (n.mon >= 8) done++;
  if (n.boss >= 12) done++;
  if (n.evo >= 10) done++;
  if (n.pat >= 9) done++;
  return Math.min(0.20, done * 0.05);
}
export function newSaveMeta() {
  return {
    version: SAVE_VERSION,
    swords: { owned: { muk: 1 }, equipped: 'muk' },
    relics: { owned: {}, equipped: [] },
    skins: { owned: { none: 1 }, equipped: 'none' },
    brush: { owned: { none: 1 }, equipped: 'none' },
    codex: { mon: {}, boss: {}, evo: {}, pat: {} },
    train: { stats: {}, seen: 0 },
    records: { endless: 0, bossrush: 0, trials: 0 },
    challenge: { endless: 0, bossrush: 0, trial: 0 }
  };
}
