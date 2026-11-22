/* 심안 v0.70 — 메타 데이터 (판 밖 성장 · 리텐션 · 별도 치장 코스메틱)
   - SAVE_VERSION = 4 (v3 구 외형·붓·삭제 유물 100% 엽전 자동 환불 마이그레이션)
   - 상점 정예 5축(공력·체력·빈틈·파세·심안) · 무구 8종(+벼림 3단계·먹묵) · 유물 10종(8장 클리어 2칸 · 획고↔만획 배타)
   - 별도 「치장」 코스메틱: 주인공 3D 도포 4종 + 검기 궤적 VFX 4종 (능력치 변화 0, 비-P2W)
   - 리텐션 루프: 오늘의 수련(일일 3종) · 7일 출석 수련표 · 막별 별(★) 누적 상자 · 도감 마일스톤 */

export const SAVE_VERSION = 4;

/* 정예 5축 상점 능력치 정의 */
export const STAT_DEFS = [
  { id: 'atk',   key: 'atkLv',   name: '공력', maxLv: 20, step: 0.05, unlock: 0, unit: '%', desc: '일섬 기본 피해 +5%/레벨 (최대 +100%)' },
  { id: 'hp',    key: 'hpLv',    name: '체력', maxLv: 20, step: 2,    unlock: 0, unit: '',  desc: '최대 체력 +2/레벨 (14 → 54)' },
  { id: 'gap',   key: 'gapLv',   name: '빈틈', maxLv: 10, step: 0.03, unlock: 4, unit: '%', desc: '보스 자세 붕괴·약점 일섬 피해 +3%/레벨 (최대 +30%)' },
  { id: 'poise', key: 'poiseLv', name: '파세', maxLv: 10, step: 0.04, unlock: 5, unit: '%', desc: '보스 강인도(자세) 타격량 +4%/레벨 (최대 +40%)' },
  { id: 'coin',  key: 'coinLv',  name: '심안', maxLv: 15, step: 0.08, unlock: 3, unit: '%', desc: '전투 엽전 획득 +8%/레벨 (전투 상한 ×2.5)' }
];

/* 무구 벼림 3단계 비용 (먹묵 + 엽전) */
export const FORGE_COSTS = [
  { ink: 8,  coins: 200  },
  { ink: 20, coins: 500  },
  { ink: 40, coins: 1000 }
];

/* 무구 8종 (장착 1자루 · 평타 공격력 대신 고유 전투 규칙 + 벼림 3단계로 고유 효과 강화) */
export const SWORDS = [
  { id: 'muk',     name: '묵검',   price: 0,    unlock: 0,  rarity: '기본', desc: '기본 검. 군더더기 없는 수묵의 첫 획.', fx: {} },
  { id: 'seori',   name: '서릿검', price: 800,  unlock: 4,  rarity: '희귀', desc: '일섬 착지 반경 1.8m에 0.6초 서리권(보스 포함 감속 −40%). 벼림 시 지속 연장.', fx: { frostField: 0.6 } },
  { id: 'hwa',     name: '화살검', price: 1200, unlock: 5,  rarity: '희귀', desc: '콤보가 끊길 때 1회 불씨 유지 + 다음 일섬 피해 +30%. 벼림 시 유예·피해 상승.', fx: { emberSave: 1, emberMul: 0.30 } },
  { id: 'maeng',   name: '맹종검', price: 1200, unlock: 6,  rarity: '희귀', desc: '방울이 울린 0.8초 안에 일섬하면 피해 +25%, 참 +3. 벼림 시 배율 강화.', fx: { bellDashMul: 0.25, bellCharge: 3 } },
  { id: 'cheong',  name: '청풍검', price: 1600, unlock: 8,  rarity: '영웅', desc: '일섬 무적 +0.15초, 착지 후 다음 획 선입력 여유 +0.2초. 벼림 시 무적 연장.', fx: { dashInvuln: 0.15, chainGrace: 0.20 } },
  { id: 'gwi',     name: '귀문검', price: 2000, unlock: 10, rarity: '영웅', desc: '보스 빈틈·그로기 일섬 시 참 +5, 해당 일섬 피해 +20%. 벼림 시 극대화.', fx: { gapCharge: 5, gapDmgMul: 0.20 } },
  { id: 'thunder', name: '뇌전검', price: 2200, unlock: 11, rarity: '전설', desc: '번개 획 일섬 시 보스 강인도 피해 +35% 및 주변 2체 연쇄 전격.', fx: { boltPoiseMul: 0.35, boltChain: 2 } },
  { id: 'breaker', name: '파세검', price: 2600, unlock: 14, rarity: '전설', desc: '간발 회피·금강부 반사 시 보스 강인도 추가 −1.5, 자세 붕괴 시간 +0.8초.', fx: { parryPoiseAdd: 1.5, groggyAdd: 0.8 } }
];

/* 유물 10종 (시작 1칸 · 8장 클리어 시 2칸 해금 · 영구 보유 및 자유 교체 · 획고↔만획 상호 배타) */
export const RELICS = [
  { id: 'oldbell',    name: '묵은 방울',   price: 400,  unlock: 2,  rarity: '희귀', desc: '원 밖 화살표 0.5초 조기 표시 + 방울 0.8초 내 일섬 시 피해 +12%.' },
  { id: 'mirror',     name: '청동 거울',   price: 400,  unlock: 3,  rarity: '희귀', desc: '판당 첫 피격을 1회 완전히 막아냅니다.' },
  { id: 'needle',     name: '안개 바늘',   price: 600,  unlock: 5,  rarity: '희귀', desc: '심안 반경 −10%, 대신 원 안의 모든 일섬 피해 +15%.' },
  { id: 'sheath',     name: '금실 칼집',   price: 650,  unlock: 5,  rarity: '영웅', desc: '모든 보스 패링·간발 회피 판정 창 +0.12초, 성공 시 강인도 추가 −0.8.' },
  { id: 'echo_bell',  name: '여음 청',     price: 750,  unlock: 6,  rarity: '영웅', desc: '방울이 울린 혼령을 1초 안에 베면 근처 같은 무늬 적에게 공명 피해.' },
  { id: 'blood',      name: '혈월 부적',   price: 750,  unlock: 7,  rarity: '영웅', desc: '체력이 절반 아래일 때 일섬 피해 +25%.' },
  { id: 'tower',      name: '거꾸로 된 탑', price: 850,  unlock: 8,  rarity: '영웅', desc: '보스 무늬 수 −1, 대신 받는 피해 +1 (고위험 속공 빌드).' },
  { id: 'eye',        name: '세 번째 눈',  price: 900,  unlock: 10, rarity: '영웅', desc: '모든 보스 예고 방울 간격 −20%, 빈틈 노출 시간 +0.25초.' },
  { id: 'mono_seal',  name: '획고 인장',   price: 1000, unlock: 11, rarity: '전설', mutex: 'multi_seal', desc: '직전과 같은 획으로 연속 일섬 시 피해 +10% 중첩 (최대 +30%). 만획 인장과 동시 장착 불가.' },
  { id: 'multi_seal', name: '만획 인장',   price: 1100, unlock: 14, rarity: '전설', mutex: 'mono_seal',  desc: '서로 다른 획 3연속 성공 시 일섬 폭 +15% · 콤보 유지 +0.4초. 획고 인장과 동시 장착 불가.' }
];

/* 별도 「치장」 코스메틱 — 주인공 3D 도포 4종 (능력치 변화 0, 순수 비주얼 프리미엄) */
export const COSMETIC_CLOAKS = [
  {
    id: 'ink', name: '묵객의 도포', price: 0, rarity: '기본',
    desc: '깊은 먹빛 무명 도포와 은빛 허리띠. 눈 먼 검객의 본래 모습.',
    palette: { keyMul: [0.86, 0.83, 0.76], fillMul: [0.62, 0.68, 0.78], rimHex: 0xffe4ad, rimGain: 1.0, spec: 0.18, badge: ['#1c1a18', '#b9a684'] }
  },
  {
    id: 'snow_sage', name: '설산 백의 검객', price: 1400, rarity: '희귀',
    desc: '눈꽃처럼 맑은 백의 도포와 청옥빛 림광. 설산 폐사찰의 고고한 검선.',
    palette: { keyMul: [1.22, 1.28, 1.36], fillMul: [0.76, 0.94, 1.08], rimHex: 0x9cf0ff, rimGain: 1.55, spec: 0.32, badge: ['#d8e8f2', '#64c6e0'] }
  },
  {
    id: 'crimson_guard', name: '혈월 어영무사', price: 2400, rarity: '영웅',
    desc: '진홍 비단 갑주 도포에 금박 띠와 붉은 아우라가 감도는 호위무사 예복.',
    palette: { keyMul: [1.26, 0.68, 0.62], fillMul: [0.86, 0.44, 0.42], rimHex: 0xff624a, rimGain: 1.75, spec: 0.38, badge: ['#6e1717', '#ff6b4e'] }
  },
  {
    id: 'gilded_eclipse', name: '황금 일식 검제', price: 3800, rarity: '전설',
    desc: '칠흑 비단 위로 눈부신 순금박 테두리가 흐르는 최종 경지의 검제 의복.',
    palette: { keyMul: [1.18, 0.98, 0.58], fillMul: [0.58, 0.50, 0.34], rimHex: 0xffdc72, rimGain: 2.1, spec: 0.48, badge: ['#18130d', '#f5c754'] }
  }
];

/* 별도 「치장」 코스메틱 — 일섬 검기 궤적 VFX 4종 (능력치 변화 0) */
export const COSMETIC_TRAILS = [
  { id: 'ink',          name: '기본 먹검기',   price: 0,    rarity: '기본', desc: '전통 짙은 먹빛과 한지 잔향이 남는 기본 일섬 궤적.', coreHex: 0xf4e8d2, hotHex: 0xfff8e6, badge: ['#1e1b18', '#e8dcc4'] },
  { id: 'jade_bamboo',  name: '청죽 비취검기', price: 1200, rarity: '희귀', desc: '대숲을 가르는 맑은 청록 비취빛 검기와 옥빛 잔광.', coreHex: 0x62f0bc, hotHex: 0xd8fff0, badge: ['#12382b', '#62f0bc'] },
  { id: 'crimson_moon', name: '혈월 잔광',     price: 2000, rarity: '영웅', desc: '붉은 달빛처럼 타오르는 진홍 검기와 흑적 불티 궤적.', coreHex: 0xff4c3b, hotHex: 0xffd0a6, badge: ['#4a1010', '#ff5442'] },
  { id: 'gold_leaf',    name: '금박 묵선',     price: 3200, rarity: '전설', desc: '먹선 가장자리를 따라 순금박이 흩날리는 최고급 검기. 7일 출석 최종 보상으로 무료 획득 가능.', coreHex: 0xffcf54, hotHex: 0xfff8cf, badge: ['#2b200c', '#ffd666'] }
];

/* v3 → v4 자동 환불 정가표 (구 외형 5종 + 구 붓 4종 + 삭제 유물 4종) */
export const LEGACY_REFUND_PRICES = Object.freeze({
  skins:  { hwang: 400, cheong: 450, jaju: 500, baek: 600, nok: 800 },
  brush:  { jin: 200, yeon: 200, hwang: 200, jeok: 200 },
  relics: { jar: 350, brush: 450, lantern: 300, beads: 700 }
});

/* 오늘의 수련 (일일 목표 3종 — 먹묵·엽전 안정 수급처) */
export const DAILY_QUESTS = [
  { id: 'q_slash', name: '일섬 30회 성공',   goal: 30, coins: 220, ink: 4 },
  { id: 'q_poise', name: '보스 자세 붕괴 1회', goal: 1,  coins: 300, ink: 6 },
  { id: 'q_clear', name: '스테이지 1회 클리어', goal: 1,  coins: 280, ink: 5 }
];

/* 7일 출석 수련표 (D7 리텐션 핵심 — 7일차 전설 검기 '금박 묵선' 무료 증정) */
export const ATTENDANCE_REWARDS = [
  { day: 1, label: '엽전 350',          coins: 350, ink: 0  },
  { day: 2, label: '먹묵 8',            coins: 0,   ink: 8  },
  { day: 3, label: '엽전 600 · 먹묵 5', coins: 600, ink: 5  },
  { day: 4, label: '먹묵 12',           coins: 0,   ink: 12 },
  { day: 5, label: '엽전 900 · 먹묵 8', coins: 900, ink: 8  },
  { day: 6, label: '먹묵 18',           coins: 0,   ink: 18 },
  { day: 7, label: '전설 검기 「금박 묵선」', coins: 500, ink: 15, trail: 'gold_leaf' }
];

/* 막별 별(★) 누적 보상 상자 (각 막 4개 스테이지 = 최대 12★) */
export const STAR_CHESTS = [
  { need: 4,  coins: 300, ink: 6  },
  { need: 8,  coins: 550, ink: 12 },
  { need: 12, coins: 900, ink: 20 }
];

/* 도감 달성도(%) 마일스톤 보상 */
export const CODEX_MILESTONES = [
  { pct: 25,  coins: 350,  ink: 8  },
  { pct: 50,  coins: 700,  ink: 15 },
  { pct: 75,  coins: 1100, ink: 24 },
  { pct: 100, coins: 1800, ink: 40 }
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

export const PAT_SLOTS = 9;
export const EVO_SLOTS = 10;
export const CODEX_GROUPS = [
  { key: 'mon', label: '귀물', slots: 8 },
  { key: 'boss', label: '보스', slots: 16 },
  { key: 'evo', label: '진화', slots: 10 },
  { key: 'pat', label: '패턴', slots: 9 }
];

/* 호환용 더미 (구 호출부 방어) */
export const SKINS = [{ id: 'none', name: '기본', price: 0, rim: 0xF2E2C0, glow: [1.7, 0.22, 0.14] }];
export const BRUSHES = [{ id: 'none', name: '기본 먹', price: 0, color: '236,240,230', width: 1 }];

/* ---------- 순수 헬퍼 ---------- */
export function ownedOf(save, kind, id) {
  const box = save && save[kind];
  return !!(box && box.owned && box.owned[id]);
}
export function equipOf(save, kind) {
  const box = save && save[kind];
  return (box && box.equipped) || null;
}
export function swordOf(save) {
  const eq = equipOf(save, 'swords') || 'muk';
  for (let i = 0; i < SWORDS.length; i++) if (SWORDS[i].id === eq) return SWORDS[i];
  return SWORDS[0];
}
export function swordForgeLv(save, swordId) {
  const id = swordId || equipOf(save, 'swords') || 'muk';
  return Math.max(0, Math.min(3, Number((save && save.swords && save.swords.forge && save.swords.forge[id]) || 0)));
}
export function swordFx(save) {
  const sw = swordOf(save);
  const base = Object.assign({}, sw.fx || {});
  const flv = swordForgeLv(save, sw.id);
  if (flv <= 0) return base;
  if (base.frostField) base.frostField = +(base.frostField + flv * 0.2).toFixed(2);
  if (base.emberSave) { base.emberSave = flv >= 3 ? 2 : 1; base.emberMul = +(base.emberMul + flv * 0.10).toFixed(2); }
  if (base.bellDashMul) { base.bellDashMul = +(base.bellDashMul + flv * 0.08).toFixed(2); base.bellCharge = (base.bellCharge || 3) + flv; }
  if (base.dashInvuln) base.dashInvuln = +(base.dashInvuln + flv * 0.05).toFixed(2);
  if (base.gapCharge) { base.gapCharge = base.gapCharge + flv * 3; base.gapDmgMul = +((base.gapDmgMul || 0.2) + flv * 0.05).toFixed(2); }
  if (base.boltPoiseMul) { base.boltPoiseMul = +(base.boltPoiseMul + flv * 0.10).toFixed(2); base.boltChain = (base.boltChain || 2) + (flv >= 2 ? 1 : 0); }
  if (base.parryPoiseAdd) { base.parryPoiseAdd = +(base.parryPoiseAdd + flv * 0.4).toFixed(2); base.groggyAdd = +((base.groggyAdd || 0.8) + flv * 0.25).toFixed(2); }
  return base;
}
export function relicSlots(save) {
  const st8 = save && save.stars && Number(save.stars[8] || save.stars['8'] || 0);
  const maxSt = Number((save && save.stage) || 1);
  return (st8 > 0 || maxSt > 8) ? 2 : 1;
}
export function equippedRelics(save) {
  const box = (save && save.relics) || {};
  const slots = relicSlots(save);
  const valid = new Set(RELICS.map((r) => r.id));
  return Array.isArray(box.equipped) ? box.equipped.filter((id) => valid.has(id)).slice(0, slots) : [];
}
export function relicOn(save, id) {
  return equippedRelics(save).indexOf(id) >= 0;
}
export function relicOf(id) {
  for (let i = 0; i < RELICS.length; i++) if (RELICS[i].id === id) return RELICS[i];
  return null;
}
export function cloakOf(save) {
  const eq = equipOf(save, 'cloaks') || 'ink';
  for (let i = 0; i < COSMETIC_CLOAKS.length; i++) if (COSMETIC_CLOAKS[i].id === eq) return COSMETIC_CLOAKS[i];
  return COSMETIC_CLOAKS[0];
}
export function trailOf(save) {
  const eq = equipOf(save, 'trails') || 'ink';
  for (let i = 0; i < COSMETIC_TRAILS.length; i++) if (COSMETIC_TRAILS[i].id === eq) return COSMETIC_TRAILS[i];
  return COSMETIC_TRAILS[0];
}
export function skinOf() { return SKINS[0]; }
export function brushOf() { return BRUSHES[0]; }

export function codexCounts(save) {
  const c = (save && save.codex) || {};
  const mon = c.mon ? Object.keys(c.mon).filter((k) => c.mon[k]).length : 0;
  const boss = c.boss ? Object.keys(c.boss).filter((k) => c.boss[k]).length : 0;
  const evo = c.evo ? Object.keys(c.evo).filter((k) => c.evo[k]).length : 0;
  const pat = c.pat ? Object.keys(c.pat).filter((k) => c.pat[k] && isBasePat(k)).length : 0;
  return { mon, boss, evo, pat };
}
export function isBasePat(id) {
  return ['charge', 'kiai', 'slam', 'volley', 'chant', 'clones', 'veil', 'shrink', 'seal'].indexOf(id) >= 0;
}
export function codexTotalPct(save) {
  const n = codexCounts(save);
  const total = 8 + 16 + 10 + 9;
  const got = Math.min(8, n.mon) + Math.min(16, n.boss) + Math.min(10, n.evo) + Math.min(9, n.pat);
  return Math.round((got / total) * 100);
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

export function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function newSaveMeta() {
  return {
    version: SAVE_VERSION,
    ink: 0,
    gapLv: 0,
    poiseLv: 0,
    swords: { owned: { muk: 1 }, equipped: 'muk', forge: {} },
    relics: { owned: {}, equipped: [] },
    cloaks: { owned: { ink: 1 }, equipped: 'ink' },
    trails: { owned: { ink: 1 }, equipped: 'ink' },
    starChests: {},
    codexClaimed: {},
    daily: { date: todayKey(), prog: { q_slash: 0, q_poise: 0, q_clear: 0 }, claimed: {} },
    attend: { days: 0, lastDate: '' },
    codex: { mon: {}, boss: {}, evo: {}, pat: {} },
    trials: { cleared: {} },
    chalBest: {}
  };
}

/** v3 → v4 자동 환불 마이그레이션: 구 외형·붓·삭제 유물 정가 100% 엽전 환불 */
export function migrateMetaV4(save) {
  if (!save) return 0;
  let refund = 0;
  if (save.skins && save.skins.owned) {
    Object.keys(save.skins.owned).forEach((id) => {
      if (save.skins.owned[id] && LEGACY_REFUND_PRICES.skins[id]) refund += LEGACY_REFUND_PRICES.skins[id];
    });
    delete save.skins;
  }
  if (save.brush && save.brush.owned) {
    Object.keys(save.brush.owned).forEach((id) => {
      if (save.brush.owned[id] && LEGACY_REFUND_PRICES.brush[id]) refund += LEGACY_REFUND_PRICES.brush[id];
    });
    delete save.brush;
  }
  if (save.relics && save.relics.owned) {
    Object.keys(LEGACY_REFUND_PRICES.relics).forEach((id) => {
      if (save.relics.owned[id]) {
        refund += LEGACY_REFUND_PRICES.relics[id];
        delete save.relics.owned[id];
      }
    });
    if (Array.isArray(save.relics.equipped)) {
      save.relics.equipped = save.relics.equipped.filter((id) => !LEGACY_REFUND_PRICES.relics[id]);
    }
  }
  if (refund > 0) save.coins = Math.max(0, Number(save.coins || 0)) + refund;
  if (typeof save.ink !== 'number') save.ink = 0;
  if (typeof save.gapLv !== 'number') save.gapLv = 0;
  if (typeof save.poiseLv !== 'number') save.poiseLv = 0;
  if (!save.swords) save.swords = { owned: { muk: 1 }, equipped: 'muk', forge: {} };
  if (!save.swords.owned) save.swords.owned = { muk: 1 };
  if (save.swords.owned.ban || save.swords.owned.crescent) {
    save.swords.owned.thunder = 1;
    delete save.swords.owned.ban; delete save.swords.owned.crescent;
    if (save.swords.equipped === 'ban' || save.swords.equipped === 'crescent') save.swords.equipped = 'thunder';
  }
  if (save.swords.owned.star) {
    save.swords.owned.breaker = 1;
    delete save.swords.owned.star;
    if (save.swords.equipped === 'star') save.swords.equipped = 'breaker';
  }
  if (!save.swords.forge) save.swords.forge = {};
  if (!save.cloaks) save.cloaks = { owned: { ink: 1 }, equipped: 'ink' };
  if (!save.trails) save.trails = { owned: { ink: 1 }, equipped: 'ink' };
  if (!save.starChests) save.starChests = {};
  if (!save.codexClaimed) save.codexClaimed = {};
  if (!save.daily) save.daily = { date: todayKey(), prog: { q_slash: 0, q_poise: 0, q_clear: 0 }, claimed: {} };
  if (!save.attend) save.attend = { days: 0, lastDate: '' };
  save.version = SAVE_VERSION;
  return refund;
}
