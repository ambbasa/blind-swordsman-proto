/**
 * v2/js/modules/economy.js
 * 심안(SIMAN) v0.70 — 상점 3탭(상점·무구·유물) + 별도 치장 문구, 5축 완만 비용 곡선(1.11^lv),
 * 전투력 계산, 스탯 전액 환불(초기화), 방치 보상 순수 계산 모듈.
 */
import { STAT_DEFS, FORGE_COSTS, swordForgeLv } from '../meta.js';

export const SHOP_TAB_NOTES = Object.freeze({
  stat: '엽전으로 5대 기량(공력·체력·빈틈·파세·재물운)을 단련합니다. 언제든 무료 초기화로 배분을 바꿀 수 있습니다.',
  sword: '각 장을 처음 돌파해 도면을 열고, 고유 규칙을 지닌 무구를 제작·벼림(먹묵+엽전)합니다.',
  relic: '전투 규칙을 바꾸는 유물입니다. 8장 클리어 시 유물 2칸이 열립니다. (획고↔만획 인장 동시 장착 불가)',
  cosmetic: '능력치 변화가 전혀 없는 순수 수묵·금박 치장(주인공 3D 도포 · 검기 궤적)입니다.'
});

export function getShopTabNote(tabKey) {
  return SHOP_TAB_NOTES[tabKey] || SHOP_TAB_NOTES.stat;
}

/**
 * v0.70 완만 지수 비용 곡선: round(25 * (lv + 1) * 1.11^lv)
 * (구버전 cfg.upgradeBase 명시 테스트와도 하위 호환 유지)
 */
export function statUpgradeCost(lv, cfg = {}) {
  const safeLv = Math.max(0, Math.floor(Number(lv || 0)));
  if (cfg && cfg.linearLegacy) {
    const base = Number(cfg.upgradeBase ?? 20);
    return base * (safeLv + 1);
  }
  const base = Number(cfg.upgradeBase ?? 25);
  return Math.round(base * (safeLv + 1) * Math.pow(1.11, safeLv));
}

export function statTotalSpent(lvOrSave, cfg = {}) {
  if (lvOrSave && typeof lvOrSave === 'object') {
    let total = 0;
    for (let i = 0; i < STAT_DEFS.length; i++) {
      total += statTotalSpent(lvOrSave[STAT_DEFS[i].key] || 0, cfg);
    }
    return total;
  }
  let sum = 0;
  const n = Math.max(0, Math.floor(Number(lvOrSave || 0)));
  for (let i = 0; i < n; i++) sum += statUpgradeCost(i, cfg);
  return sum;
}

/** 상점 5축 스탯 전액 환불(초기화) */
export function resetAllStats(saveObj, cfg = {}) {
  if (!saveObj) return { ok: false, refund: 0 };
  let refund = 0;
  for (let i = 0; i < STAT_DEFS.length; i++) {
    const k = STAT_DEFS[i].key;
    const lv = Math.max(0, Number(saveObj[k] || 0));
    if (lv > 0) {
      refund += statTotalSpent(lv, cfg);
      saveObj[k] = 0;
    }
  }
  if (refund <= 0) return { ok: false, refund: 0 };
  saveObj.coins = Number(saveObj.coins || 0) + refund;
  return { ok: true, refund, coins: saveObj.coins };
}

/** 현재 전투력 계산 (공력 · 체력 · 빈틈 · 파세 · 무구 벼림 단계 반영) */
export function computeCombatPower(saveObj = {}) {
  const atk = Math.max(0, Number(saveObj.atkLv || 0));
  const hp = Math.max(0, Number(saveObj.hpLv || 0));
  const gap = Math.max(0, Number(saveObj.gapLv || 0));
  const poise = Math.max(0, Number(saveObj.poiseLv || 0));
  const forge = swordForgeLv(saveObj);
  const maxHp = 14 + hp * 2;
  const val = 100 * (1 + atk * 0.05) * (maxHp / 14) * (1 + gap * 0.015 + poise * 0.018) * (1 + forge * 0.06);
  return Math.round(val);
}

/** 스테이지별 권장 전투력 (1~16장: 5·10·16장 소프트 벽) */
export function stageRecommendedPower(stageNo) {
  const tbl = [80, 90, 100, 120, 150, 175, 200, 225, 260, 300, 335, 370, 410, 445, 480, 520];
  const idx = Math.max(0, Math.min(tbl.length - 1, (Number(stageNo || 1) | 0) - 1));
  return tbl[idx];
}

export function forgeCostOf(currentForgeLv) {
  const idx = Math.max(0, Math.floor(Number(currentForgeLv || 0)));
  return FORGE_COSTS[idx] || null;
}

/** 경과 시간(ms) 기반 방치 보상 계산 */
export function computeIdleCoins(elapsedMs, saveObj = {}, cfg = {}) {
  const maxHours = Number(cfg.idleMaxHours ?? 6);
  const perMin = Number(cfg.idlePerMin ?? 1);
  const coinStep = Number(cfg.coinStep ?? 0.08);
  const multCap = Number(cfg.idleCoinMultCap ?? 2.0);
  const capMs = maxHours * 3600 * 1000;
  const clampedMs = Math.min(Math.max(0, Number(elapsedMs || 0)), capMs);
  const coinLv = Math.max(0, Number(saveObj?.coinLv || 0));
  const mult = Math.min(multCap, 1 + coinLv * coinStep);
  return Math.floor((clampedMs / 60000) * perMin * mult);
}

/** 5축 스탯 구매 */
export function purchaseStatUpgrade(saveObj, stat, cfg = {}) {
  const def = STAT_DEFS.find((d) => d.id === stat);
  if (!def || !saveObj) return { ok: false, reason: 'invalid_stat' };
  const maxLv = Number(def.maxLv ?? cfg.maxLv ?? 20);
  const lv = Math.max(0, Number(saveObj[def.key] || 0));
  if (lv >= maxLv) return { ok: false, reason: 'max_level', lv };
  const cost = statUpgradeCost(lv, cfg);
  const coins = Number(saveObj.coins || 0);
  if (coins < cost) return { ok: false, reason: 'insufficient_coins', cost, coins };
  saveObj.coins = coins - cost;
  saveObj[def.key] = lv + 1;
  return { ok: true, key: def.key, lv: saveObj[def.key], cost, coins: saveObj.coins };
}

/** v1.76: 막별 스테이지 기본 엽전 배율 (3막 ×1.35, 4막 ×1.75로 후반 파밍 피로 완화) */
export function actCoinMul(actNo) {
  const a = Math.max(1, Math.min(4, Number(actNo || 1) | 0));
  return a === 4 ? 1.75 : (a === 3 ? 1.35 : (a === 2 ? 1.15 : 1.0));
}

export function getIdleNotice(cfg = {}) {
  const maxHours = Number(cfg.idleMaxHours ?? 6);
  return '자리를 비운 동안 최대 ' + maxHours + '시간까지 엽전이 쌓입니다.';
}
