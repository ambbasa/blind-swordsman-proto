/**
 * v2/js/modules/combat.js
 * 심안(SIMAN) v0.49 — 콤보 배수·일섬 피해·공격 보너스 순수 계산 모듈.
 *
 * 실제 game.js의 comboMul / atkBonus / dashDmg 규칙을 100% 유지하면서
 * Node.js 단위 테스트로 회귀 검증할 수 있도록 분리했습니다.
 */

export function computeAtkBonus(atkLv, cfg = {}) {
  const maxLv = Number(cfg.maxLv ?? 10);
  const step = Number(cfg.atkStep ?? 0.06);
  const lv = Math.max(0, Math.min(maxLv, Number(atkLv || 0)));
  return lv * step;
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
  cfg = {}
}) {
  const base = Number(baseDashDmg ?? cfg.dashDmg ?? 2.5);
  const blood = bloodRelicActive ? 1.25 : 1;
  return base * computeComboMul(combo, cfg) * (1 + computeAtkBonus(atkLv, cfg)) * blood;
}

export function computeMaxHp({ hpLv = 0, runHp = 0, beadsRelicOn = false, cfg = {} }) {
  const base = Number(cfg.hpBase ?? 14);
  const step = Number(cfg.hpStep ?? 2);
  return Math.max(1, base + Number(hpLv || 0) * step + Number(runHp || 0) - (beadsRelicOn ? 4 : 0));
}
