/**
 * v2/js/modules/combat.js
 * 심안(SIMAN) v0.70 — 콤보 배수·일섬 피해·공력/빈틈/파세 5축 보너스 순수 계산 모듈.
 */

export function computeAtkBonus(atkLv, cfg = {}) {
  const maxLv = Number(cfg.maxLv ?? 20);
  const step = Number(cfg.atkStep ?? 0.05);
  const lv = Math.max(0, Math.min(maxLv, Number(atkLv || 0)));
  return lv * step;
}

export function computeGapBonus(gapLv) {
  const lv = Math.max(0, Math.min(10, Number(gapLv || 0)));
  return lv * 0.03;
}

export function computePoiseBonus(poiseLv) {
  const lv = Math.max(0, Math.min(10, Number(poiseLv || 0)));
  return lv * 0.04;
}

export function computeComboMul(combo, cfg = {}) {
  const c = Math.max(0, Number(combo || 0));
  const step = Number(cfg.comboMulStep ?? 0.04);
  const cap = Number(cfg.comboMulCap ?? 15);
  const maxMul = Number(cfg.comboMulMax ?? 1.5);
  return Math.min(maxMul, 1 + step * Math.min(cap, c));
}

export function computeDashDmg({
  baseDashDmg,
  combo = 0,
  atkLv = 0,
  bloodRelicActive = false,
  needleRelicActive = false,
  monoSealStacks = 0,
  cfg = {}
}) {
  const base = Number(baseDashDmg ?? cfg.dashDmg ?? 2.5);
  const blood = bloodRelicActive ? 1.25 : 1;
  const needle = needleRelicActive ? 1.15 : 1;
  const mono = 1 + Math.min(3, Math.max(0, Number(monoSealStacks || 0))) * 0.10;
  return base * computeComboMul(combo, cfg) * (1 + computeAtkBonus(atkLv, cfg)) * blood * needle * mono;
}

export function computeMaxHp({ hpLv = 0, runHp = 0, beadsRelicOn = false, cfg = {} }) {
  const base = Number(cfg.hpBase ?? 14);
  const step = Number(cfg.hpStep ?? 2);
  return Math.max(1, base + Number(hpLv || 0) * step + Number(runHp || 0) - (beadsRelicOn ? 4 : 0));
}
