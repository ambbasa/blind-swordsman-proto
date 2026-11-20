import assert from 'node:assert/strict';
import { BALANCE_V049, applyBalanceV049 } from '../../v2/js/modules/balance.js';
import {
  getShopTabNote,
  statUpgradeCost,
  computeIdleCoins,
  purchaseStatUpgrade,
  getIdleNotice
} from '../../v2/js/modules/economy.js';
import {
  computeAtkBonus,
  computeComboMul,
  computeDashDmg,
  computeMaxHp
} from '../../v2/js/modules/combat.js';
import { STAGES, ACT_NAMES, HANJI_TONE, actOf, stageOf } from '../../v2/js/modules/stages.js';
import { MODES, MODE_ORDER, CHALLENGES, RUN_UPGRADES, EVO_RECIPES, modeOf, challengeOf } from '../../v2/js/modules/upgrades.js';
import { PAT_CODE, getPatternMeta } from '../../v2/js/modules/bossCatalog.js';

/* 1. v0.49 밸런스 병합 검증 */
const cfg = {
  hpBase: 10, hpStep: 3, atkStep: 0.05, iframeMs: 800,
  coinPerKill: 2, bossCoin: 20, coinStep: 0.25,
  idlePerMin: 4, idleMaxHours: 8, upgradeBase: 20, maxLv: 10,
  dashDmg: 2.5, comboMulStep: 0.04, comboMulCap: 15, comboMulMax: 1.5
};
applyBalanceV049(cfg);
assert.equal(cfg.hpBase, 14);
assert.equal(cfg.hpStep, 2);
assert.equal(cfg.atkStep, 0.06);
assert.equal(cfg.iframeMs, 850);
assert.equal(cfg.coinPerKill, 4);
assert.equal(cfg.bossCoin, 80);
assert.equal(cfg.coinStep, 0.18);
assert.equal(cfg.idlePerMin, 1);
assert.equal(cfg.idleMaxHours, 6);
assert.equal(BALANCE_V049.idleCoinMultCap, 2.0);

/* 2. 경제·방치 보상 검증 (실제 save.atkLv/hpLv/coinLv 스키마 호환) */
const EIGHT_HOURS_MS = 8 * 3600 * 1000;
assert.equal(computeIdleCoins(EIGHT_HOURS_MS, { coinLv: 0 }, cfg), 360);
assert.equal(computeIdleCoins(EIGHT_HOURS_MS, { coinLv: 10 }, cfg), 720);
assert.equal(computeIdleCoins(-1000, { coinLv: 5 }, cfg), 0);

const save = { coins: 100, atkLv: 0, hpLv: 0, coinLv: 0, lastSeen: Date.now() };
assert.equal(statUpgradeCost(0, cfg), 20);
assert.equal(statUpgradeCost(4, cfg), 100);
const buy1 = purchaseStatUpgrade(save, 'hp', cfg);
assert.equal(buy1.ok, true);
assert.equal(save.hpLv, 1);
assert.equal(save.coins, 80);
const buy2 = purchaseStatUpgrade(save, 'atk', cfg);
assert.equal(buy2.ok, true);
assert.equal(save.atkLv, 1);
assert.equal(save.coins, 60);

assert.match(getShopTabNote('stat'), /공격력·체력/);
assert.match(getShopTabNote('skin'), /외형·붓 자국/);
assert.match(getIdleNotice(cfg), /최대 6시간/);

/* 3. 전투·체력 공식 검증 */
assert.equal(computeMaxHp({ hpLv: 0, cfg }), 14);
assert.equal(computeMaxHp({ hpLv: 10, cfg }), 34);
assert.equal(computeMaxHp({ hpLv: 0, beadsRelicOn: true, cfg }), 10);
assert.equal(computeAtkBonus(10, cfg), 0.6);
assert.equal(computeComboMul(0, cfg), 1);
assert.equal(computeComboMul(10, cfg), 1.4);
assert.equal(computeComboMul(25, cfg), 1.5);
const dmg = computeDashDmg({ baseDashDmg: 2.5, combo: 10, atkLv: 5, bloodRelicActive: true, cfg });
assert.ok(Math.abs(dmg - 5.6875) < 1e-9);

/* 4. 3막 12장 스테이지 무결성 검증 */
assert.equal(STAGES.length, 12);
assert.deepEqual(Object.keys(ACT_NAMES), ['1', '2', '3']);
assert.deepEqual(Object.keys(HANJI_TONE), ['1', '2', '3']);
assert.equal(actOf(1), 1);
assert.equal(actOf(5), 2);
assert.equal(actOf(12), 3);
assert.equal(stageOf(0).id, 1);
assert.equal(stageOf(99).id, 12);
STAGES.forEach((st, i) => {
  assert.equal(st.id, i + 1);
  assert.equal(st.act, actOf(st.id));
  assert.ok(Array.isArray(st.shapes) && st.shapes.length >= 1);
  assert.ok(st.boss && Array.isArray(st.boss.patterns) && st.boss.patterns.length >= 1);
  assert.ok(st.bossName && st.bossName.length > 0);
});

/* 5. 모드·도전·강화 17종·진화 10종 무결성 검증 */
assert.deepEqual(MODE_ORDER, ['train', 'jeongseok', 'gosu']);
assert.equal(modeOf('unknown').id, 'jeongseok');
assert.equal(MODES.gosu.gold, true);
assert.equal(CHALLENGES.length, 3);
assert.equal(challengeOf('bossrush').unlock, 12);
assert.equal(RUN_UPGRADES.length, 17);
assert.equal(EVO_RECIPES.length, 10);
const upIds = new Set(RUN_UPGRADES.map((u) => u.id));
EVO_RECIPES.forEach((r) => {
  r.a.forEach((id) => assert.ok(upIds.has(id), 'unknown evo ingredient a: ' + id));
  assert.ok(upIds.has(r.b), 'unknown evo ingredient b: ' + r.b);
});

/* 6. 보스 패턴 도감 12종 및 오탈자 교정 검증 */
assert.equal(PAT_CODE.length, 12);
assert.equal(getPatternMeta('shuffle').name, '무늬 뒤섞기(12장)');
assert.match(getPatternMeta('charge').guides[0], /비켜서세요/);
assert.match(getPatternMeta('volley').desc, /부적을/);
assert.match(getPatternMeta('clash').guides[1], /받아내면/);

console.log('ALL SIMAN v0.49 PHASE-2 MODULE TESTS PASSED (6/6 suites)');
