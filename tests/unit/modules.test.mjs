import assert from 'node:assert/strict';
import { BALANCE_V049, applyBalanceV049 } from '../../v2/js/modules/balance.js';
import {
  getShopTabNote,
  statUpgradeCost,
  statTotalSpent,
  resetAllStats,
  computeCombatPower,
  stageRecommendedPower,
  forgeCostOf,
  computeIdleCoins,
  purchaseStatUpgrade,
  getIdleNotice
} from '../../v2/js/modules/economy.js';
import {
  computeAtkBonus,
  computeGapBonus,
  computePoiseBonus,
  computeComboMul,
  computeDashDmg,
  computeMaxHp
} from '../../v2/js/modules/combat.js';
import {
  SAVE_VERSION, STAT_DEFS, SWORDS, RELICS, COSMETIC_CLOAKS, COSMETIC_TRAILS,
  DAILY_QUESTS, ATTENDANCE_REWARDS, STAR_CHESTS, CODEX_MILESTONES,
  newSaveMeta, migrateMetaV4, relicSlots, swordFx, swordForgeLv, cloakOf, trailOf
} from '../../v2/js/meta.js';
import { getSwordSvg, getRelicSvg, getCosmeticSvg } from '../../v2/js/modules/itemArt.js';
import { LANDMARKS, STAGE_SCENERY, groundPoint } from '../../v2/js/modules/stageScenery.js';
import { STAGES, ACT_NAMES, HANJI_TONE, actOf, stageOf } from '../../v2/js/modules/stages.js';
import { MODES, MODE_ORDER, CHALLENGES, RUN_UPGRADES, EVO_RECIPES, modeOf, challengeOf } from '../../v2/js/modules/upgrades.js';
import { PAT_CODE, getPatternMeta } from '../../v2/js/modules/bossCatalog.js';
import { createInputQueue, createDashLatencyTracker } from '../../v2/js/modules/inputQueue.js';

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
assert.equal(cfg.dashDur, 0.24);
assert.equal(cfg.bossSpeed, 1.85);
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
assert.equal(statUpgradeCost(0), 25);
assert.equal(statUpgradeCost(0, cfg), 20);
assert.equal(statUpgradeCost(4), Math.round(25 * 5 * Math.pow(1.11, 4)));
assert.equal(statUpgradeCost(4, cfg), Math.round(20 * 5 * Math.pow(1.11, 4)));
const buy1 = purchaseStatUpgrade(save, 'hp', cfg);
assert.equal(buy1.ok, true);
assert.equal(save.hpLv, 1);
assert.equal(save.coins, 80);
const buy2 = purchaseStatUpgrade(save, 'atk', cfg);
assert.equal(buy2.ok, true);
assert.equal(save.atkLv, 1);
assert.equal(save.coins, 60);
const buy3 = purchaseStatUpgrade(save, 'gap', cfg);
assert.equal(buy3.ok, true);
assert.equal(save.gapLv, 1);
const buy4 = purchaseStatUpgrade(save, 'poise', cfg);
assert.equal(buy4.ok, true);
assert.equal(save.poiseLv, 1);
// v0.75 regression: atk/hp must upgrade past Lv 10 even when cfg.maxLv=10
const lv10Save = { coins: 10000, atkLv: 10, hpLv: 10, coinLv: 10 };
assert.equal(purchaseStatUpgrade(lv10Save, 'atk', cfg).ok, true);
assert.equal(lv10Save.atkLv, 11);
assert.equal(purchaseStatUpgrade(lv10Save, 'hp', cfg).ok, true);
assert.equal(lv10Save.hpLv, 11);
assert.equal(purchaseStatUpgrade(lv10Save, 'coin', cfg).ok, true);
assert.equal(lv10Save.coinLv, 11);
assert.equal(statTotalSpent(save, cfg), 80);
const rst = resetAllStats(save, cfg);
assert.equal(rst.ok, true);
assert.equal(rst.refund, 80);
assert.equal(save.coins, 100);
assert.equal(save.atkLv, 0);

assert.match(getShopTabNote('stat'), /5대 기량/);
assert.match(getShopTabNote('cosmetic'), /능력치 변화가 전혀 없는/);
assert.match(getIdleNotice(cfg), /최대 6시간/);

/* 3. 전투·체력 공식 검증 */
assert.equal(computeMaxHp({ hpLv: 0, cfg }), 14);
assert.equal(computeMaxHp({ hpLv: 10, cfg }), 34);
assert.equal(computeAtkBonus(10, cfg), 0.6);
assert.equal(computeAtkBonus(10), 0.5);
assert.ok(Math.abs(computeGapBonus(10) - 0.3) < 1e-9);
assert.ok(Math.abs(computePoiseBonus(10) - 0.4) < 1e-9);
assert.equal(computeComboMul(0, cfg), 1);
assert.equal(computeComboMul(10, cfg), 1.4);
assert.equal(computeComboMul(25, cfg), 1.5);
const dmg = computeDashDmg({ baseDashDmg: 2.5, combo: 10, atkLv: 5, bloodRelicActive: true, cfg });
assert.ok(Math.abs(dmg - 5.6875) < 1e-9);
const dmgNeedle = computeDashDmg({ baseDashDmg: 2.5, combo: 0, atkLv: 0, needleRelicActive: true, monoSealStacks: 2, cfg });
assert.ok(Math.abs(dmgNeedle - 2.5 * 1.15 * 1.2) < 1e-9);

/* 3b. v0.70 메타·무구8·유물10·치장8·자동환불·SVG 아트 검증 */
assert.equal(SAVE_VERSION, 4);
assert.equal(STAT_DEFS.length, 5);
assert.equal(SWORDS.length, 8);
assert.equal(RELICS.length, 10);
assert.equal(COSMETIC_CLOAKS.length, 4);
assert.equal(COSMETIC_TRAILS.length, 4);
assert.equal(DAILY_QUESTS.length, 3);
assert.equal(ATTENDANCE_REWARDS.length, 7);
assert.equal(STAR_CHESTS.length, 3);
assert.equal(CODEX_MILESTONES.length, 4);
assert.ok(forgeCostOf(0).ink > 0 && forgeCostOf(0).coins > 0);
assert.equal(forgeCostOf(3), null);
const oldV3 = {
  version: 3, coins: 100, stage: 8, stars: { 8: 2 },
  skins: { owned: { base: 1, crimson: 1 }, equipped: 'crimson' },
  brush: { owned: { ink: 1, gold: 1 }, equipped: 'gold' },
  relics: { owned: { jar: 1, beads: 1, mirror: 1 }, equipped: ['beads', 'mirror'] },
  swords: { owned: { base: 1, crescent: 1, star: 1 }, equipped: 'crescent' }
};
const mig = migrateMetaV4(oldV3);
assert.ok(mig > 0, 'legacy skins/brush/relics must refund coins');
assert.equal(oldV3.swords.equipped, 'thunder', 'legacy crescent migrates to thunder');
assert.equal(oldV3.swords.owned.breaker, 1, 'legacy star migrates to breaker');
assert.equal(relicSlots(oldV3), 2, 'stage 8 clear unlocks 2 relic slots');
assert.ok(computeCombatPower(oldV3) > 0 && stageRecommendedPower(8) > stageRecommendedPower(1));
assert.ok(getSwordSvg('thunder').includes('sword_thunder.webp'));
assert.ok(getRelicSvg('sheath').includes('relic_sheath.webp'));
assert.ok(getCosmeticSvg('cloak', 'gilded_eclipse').includes('cloak_gilded_eclipse.webp'));
assert.ok(getCosmeticSvg('trail', 'gold_leaf').includes('trail_gold_leaf.webp'));

/* 4. 3막 12장 스테이지 무결성 검증 */
assert.equal(STAGES.length, 16);
assert.deepEqual(Object.keys(ACT_NAMES), ['1', '2', '3', '4']);
assert.deepEqual(Object.keys(HANJI_TONE), ['1', '2', '3', '4']);
assert.equal(actOf(1), 1);
assert.equal(actOf(5), 2);
assert.equal(actOf(12), 3);
assert.equal(stageOf(0).id, 1);
assert.equal(stageOf(99).id, 16);
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

/* 6. 보스 패턴 도감 19종(기본 13 + 신규 6대 기믹) 및 오탈자 교정 검증 */
assert.equal(PAT_CODE.length, 19);
assert.equal(getPatternMeta('sweep').name, '전방 횡파');
['donut', 'soak', 'rhythm', 'tether', 'gaze', 'pizza'].forEach((id) => {
  const m = getPatternMeta(id);
  assert.ok(m && m.name && m.guides.length >= 2, 'missing gimmick catalog: ' + id);
});
assert.equal(getPatternMeta('shuffle').name, '무늬 뒤섞기(12장)');
assert.match(getPatternMeta('charge').guides[0], /비켜서세요/);
assert.match(getPatternMeta('volley').desc, /부적을/);
assert.match(getPatternMeta('clash').guides[1], /받아내면/);

/* 7. 연속 일섬 2칸 FIFO 선입력 버퍼 검증 */
const q = createInputQueue({ maxSize: 2, dedupMs: 45, graceMs: 350 });
assert.equal(q.push({ type: 'hline', ttl: 450 }, 1000).size, 1);
// 45ms 이내 동일 획은 중복 입력 방지
assert.equal(q.push({ type: 'hline', ttl: 450 }, 1020).deduped, true);
assert.equal(q.size(), 1);
// 두 번째 획은 첫 번째를 덮어쓰지 않고 2번째 슬롯에 FIFO 저장
const p2 = q.push({ type: 'vline', ttl: 450 }, 1100);
assert.equal(p2.size, 2);
assert.equal(p2.overwritten, false);
// 3번째 획은 1번째 예약은 보존하고 2번째 슬롯만 최신 의도로 교체
const p3 = q.push({ type: 'vee', ttl: 450 }, 1200);
assert.equal(p3.size, 2);
assert.equal(p3.overwritten, true);
assert.equal(q.shiftValid(1300).type, 'hline');
assert.equal(q.shiftValid(1400).type, 'vee');
assert.equal(q.shiftValid(1450), null);
assert.equal(q.stats().consumed, 2);
assert.equal(q.stats().overwritten, 1);

/* 8. 일섬 지연(단타·연타·다수 처치) 계측기 검증 */
const lat = createDashLatencyTracker(10);
lat.record({ shape: 'hline', chained: false, hits: 1, tInput: 100, tStart: 104, tLand: 384, hitstopMs: 35, frameDtMs: 16.6 });
lat.record({ shape: 'vline', chained: true, hits: 3, tInput: 260, tStart: 384, tLand: 630, hitstopMs: 45, frameDtMs: 16.7, tailCanceled: true });
const rep = lat.summary();
assert.equal(rep.count, 2);
assert.equal(rep.single.count, 1);
assert.equal(rep.single.avgInputToStartMs, 4);
assert.equal(rep.chained.count, 1);
assert.equal(rep.chained.avgInputToStartMs, 124);
assert.equal(rep.multiKill.count, 1);
assert.equal(rep.last.tailCanceled, true);

console.log('ALL SIMAN v0.49.2 MODULE TESTS PASSED (8/8 suites)');


/* --- v0.49 추가 모듈 검증: state.js, hudController.js, uiRouter.js --- */
import { createRunState, resetRunStateOnQuit } from '../../v2/js/modules/state.js';
import { createHudController } from '../../v2/js/modules/hudController.js';
import { createUiRouter } from '../../v2/js/modules/uiRouter.js';

{
  const S = createRunState({
    opts: { stage: 2 },
    stageNo: 2,
    st: { time: 75, spiritCap: 2, eliteAt: 40 },
    runMode: 'jeongseok',
    mapId: 'arena',
    cfg: { hpBase: 14, hpStep: 2, dashCount: 1, dashDmg: 2.5, pathRadius: 1.35 },
    save: { hpLv: 3, coins: 250 },
    shapeUnlock: ['hline', 'vline'],
  });
  assert.equal(S.hp, 20);
  assert.equal(S.stageNo, 2);
  assert.equal(S.lastAxis, 'vline');
  assert.equal(S.phaseTele, 1);
  resetRunStateOnQuit(S);
  assert.equal(S.playing, false);
  assert.equal(S.paused, null);

  // Mock DOM for hudController & uiRouter
  const makeEl = (id) => {
    const attrs = {};
    const classes = new Set();
    const listeners = {};
    return {
      id,
      hidden: false,
      textContent: '',
      parentNode: null,
      nextSibling: null,
      classList: {
        toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)),
        remove: (c) => classes.delete(c),
        has: (c) => classes.has(c),
      },
      setAttribute: (k, v) => { attrs[k] = v; },
      getAttribute: (k) => attrs[k],
      addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
      click: () => (listeners.click || []).forEach((fn) => fn({ stopPropagation() {} })),
    };
  };
  const nodes = {};
  ['app', 'hud', 'comboLabel', 'bossCard', 'guide', 'toast', 'judgeFlash', 'goalLabel', 'btnMute', 'btnStart', 'btnTrain', 'titleTag'].forEach((id) => {
    nodes[id] = makeEl(id);
  });
  nodes.titleTag.parentNode = { insertBefore: (el) => { nodes[el.id] = el; } };
  const mockDoc = {
    getElementById: (id) => nodes[id] || null,
    createElement: () => makeEl(''),
  };

  const hud = createHudController(mockDoc);
  assert.equal(hud.syncActTheme(4), 4);
  assert.equal(nodes.app.getAttribute('data-act'), '4');
  hud.clearOnTitleReturn();
  assert.equal(nodes.comboLabel.textContent, '콤보 0');
  assert.equal(nodes.bossCard.hidden, true);
  assert.equal(nodes.hud.getAttribute('aria-hidden'), 'true');

  let audioEnabled = 0, trainOpened = 0, runStarted = 0;
  const router = createUiRouter({
    doc: mockDoc,
    hudCtrl: hud,
    isMuted: () => true,
    onEnableAudio: () => { audioEnabled++; },
  });
  const pill = router.mountAudioPill();
  assert.ok(pill && pill.id === 'simanAudioPill');
  router.bindStartAndTrain({
    onStart: () => { runStarted++; },
    onTrain: () => { trainOpened++; },
  });
  nodes.btnTrain.click();
  assert.equal(trainOpened, 1);
  assert.equal(runStarted, 0);
  assert.equal(audioEnabled, 1);
  assert.equal(nodes.btnMute.getAttribute('data-sound'), 'on');
  console.log('EXTRA v0.49 MODULES (state, hudController, uiRouter) PASSED');
}


/* --- v0.50 1~4막 3D 테마 팔레트 동기화 검증: actTheme3d.js --- */
import { ACT_THEMES_3D, actFromStageId, getActTheme3D, applyThemeToInkUniforms, syncSceneActTheme3D } from '../../v2/js/modules/actTheme3d.js';

{
  assert.equal(Object.keys(ACT_THEMES_3D).length, 4);
  assert.equal(actFromStageId(1), 1);
  assert.equal(actFromStageId(4), 2);
  assert.equal(actFromStageId(9), 3);
  assert.equal(actFromStageId(12), 4);
  const t3 = getActTheme3D(3);
  assert.equal(t3.uiAccent, '#f0957d');
  assert.equal(t3.slashCore, '#ff523b');

  const mkCol = () => ({ hex: 0, mul: 1, setHex(h) { this.hex = h; return this; }, multiplyScalar(s) { this.mul = s; return this; } });
  const u = {
    uKeyCol: { value: mkCol() }, uFillCol: { value: mkCol() }, uAmbCol: { value: mkCol() },
    uRimCol: { value: mkCol() }, uRim: { value: 0 }, uMistCol: { value: mkCol() }, uMistAmt: { value: 0 }, uSpecAmt: { value: 0 }
  };
  applyThemeToInkUniforms(u, 4);
  assert.equal(u.uRimCol.value.hex, 0xc9a6ff);
  assert.equal(u.uMistAmt.value, 0.46);

  let arenaAct = 0, fxAct = 0;
  syncSceneActTheme3D({
    actNo: 2,
    scene: { fog: { color: mkCol(), density: 0 }, background: mkCol() },
    lights: { moon: { color: mkCol() }, fill: { color: mkCol() }, amb: { color: mkCol() }, hemi: { color: mkCol() } },
    arena: { applyActTheme: (a) => { arenaAct = a; } },
    paperFx: { setActTheme: (a) => { fxAct = a; } },
  });
  assert.equal(arenaAct, 2);
  assert.equal(fxAct, 2);
  console.log('v0.50 ACT_THEME_3D SYNC TESTS PASSED');
}

/* --- v1.08 보스 패턴/페이즈 연출·수련장 6대 기믹 드릴·한자/이모지 0건·캐시 버전 일관성 검증 --- */
import fs from 'node:fs';
import path from 'node:path';
import { PAT_COST, PAT_CUE, ACT_PHASE_FX, getActPhaseFx, bossPatternMean, buildBossBannerInfo } from '../../v2/js/modules/bossPatterns.js';
import { GIMMICK_DRILLS, getDrillDef, createDrillState, handleDrillInput } from '../../v2/js/modules/trainingDrills.js';

{
  assert.equal(Object.keys(PAT_COST).length, 19);
  assert.equal(Object.keys(PAT_CUE).length, 18);
  assert.equal(Object.keys(ACT_PHASE_FX).length, 4);
  for (let act = 1; act <= 4; act++) {
    const p2 = getActPhaseFx(act, 2);
    const p3 = getActPhaseFx(act, 3);
    assert.ok(p2.title && p2.msg && p2.hex > 0 && p2.auraHex > 0);
    assert.ok(p3.title && p3.msg && p3.hex > 0 && p3.auraHex > 0);
  }
  assert.ok(bossPatternMean(STAGES[0], 1) > 0);
  const bDonut = buildBossBannerInfo({ alive: true, state: 'donut', stateT: 1.0, donut: { dur: 2.0, safeInside: true } }, {}, { teleT: 1 }, 2);
  assert.equal(bDonut.name, '도넛 결계');
  const bSweep2 = buildBossBannerInfo({ alive: true, state: 'sweepTele', stateT: 0.5, sweep: { tele: 1.0 } }, {}, { teleT: 1 }, 2);
  assert.equal(bSweep2.name, '한빙 장풍');
  assert.equal(bDonut.f, 0.5);

  assert.equal(GIMMICK_DRILLS.length, 7);
  ['parry', 'donut', 'soak', 'rhythm', 'tether', 'gaze', 'pizza'].forEach((id) => {
    const st = createDrillState(id);
    assert.equal(getDrillDef(id).id, id);
    if (id === 'parry') {
      st.t = st.dur - 0.6;
      assert.equal(handleDrillInput(st, 0.5, 0.5), 'fail');
      assert.match(st.msg, /기다리세요/);
      assert.ok(st.lastTapRadius > 30);
      st.t = st.dur + 0.1;
      assert.equal(handleDrillInput(st, 0.5, 0.5), 'fail');
      assert.match(st.msg, /일찍/);
      assert.equal(st.lastTapRadius, 30);
      st.t = st.dur - 0.05;
      assert.equal(handleDrillInput(st, 0.5, 0.5), 'just');
      assert.equal(st.streak, 1);
    } else if (id === 'rhythm') {
      st.t = st.dur - 0.05;
      assert.equal(handleDrillInput(st, 0.5, 0.5), 'just');
      assert.equal(st.beatOk, 1);
    } else {
      const okT = st.targets.find((t) => t.ok);
      assert.ok(okT, 'drill target missing for ' + id);
      const r = handleDrillInput(st, okT.x, okT.y);
      assert.ok(r === 'just' || r === 'step');
    }
  });

  /* 캐시 버전 일치 검사: sw.js(siman-vXXX) === index.html(?v=vXXX) === glbboss.js(?v=vXXX) */
  const swSrc = fs.readFileSync(path.resolve('v2/sw.js'), 'utf8');
  const idxSrc = fs.readFileSync(path.resolve('v2/index.html'), 'utf8');
  const bossSrc = fs.readFileSync(path.resolve('v2/js/glbboss.js'), 'utf8');
  const swVer = (swSrc.match(/siman-(v\d+)/) || [])[1];
  assert.ok(swVer, 'v2/sw.js must define siman-vXXX');
  assert.ok(idxSrc.includes('game.js?' + 'v=' + swVer), 'v2/index.html game.js version mismatch: expected ' + swVer);
  assert.ok(bossSrc.includes('boss.glb?v=' + swVer), 'v2/js/glbboss.js boss.glb version mismatch: expected ' + swVer);

  /* 런타임 한자(U+4E00..U+9FFF) 0건 검사 (주석 제거 후 v2/js/*.js 및 v2/js/modules/*.js 전수) */
  const walkJs = (dir) => {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walkJs(full));
      else if (ent.name.endsWith('.js')) out.push(full);
    }
    return out;
  };
  const hanjaHits = [];
  const emojiHits = [];
  const importMap = new Map();
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u26A1]/u;
  for (const fp of walkJs(path.resolve('v2/js'))) {
    const raw = fs.readFileSync(fp, 'utf8');
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
    const m = code.match(/[\u4E00-\u9FFF]/);
    if (m) hanjaHits.push(path.relative(process.cwd(), fp) + ':' + m[0]);
    const em = code.match(emojiRe);
    if (em) emojiHits.push(path.relative(process.cwd(), fp) + ':' + em[0]);
    for (const im of raw.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const spec = im[1];
      const base = spec.split('?')[0].split('/').pop();
      const tail = spec.split('/').pop();
      if (!importMap.has(base)) importMap.set(base, new Set());
      importMap.get(base).add(tail);
    }
  }
  const dupImports = [];
  for (const [base, set] of importMap.entries()) {
    if (set.size > 1) dupImports.push(base + '=' + Array.from(set).join('|'));
  }
  assert.deepEqual(hanjaHits, [], 'Runtime Hanja found in v2/js: ' + hanjaHits.join(', '));
  assert.deepEqual(emojiHits, [], 'Runtime OS color emoji found in v2/js: ' + emojiHits.join(', '));
  assert.deepEqual(dupImports, [], 'Duplicate ES module ?v= instances found: ' + dupImports.join(', '));
  console.log('v1.09 BOSS_PATTERNS, TRAINING_DRILLS, CACHE_SYNC, ZERO-HANJA/EMOJI & SINGLE-INSTANCE TESTS PASSED (' + swVer + ')');
}

/* --- v1.21 모듈 분리 검증: stageTerrain.js, retention.js, codexView.js --- */
import { TERRAIN_CFG, tHash, getRiverCfg, tWaterCenter, tWaterAt, resolveZoneAt, resolveSegZone } from '../../v2/js/modules/stageTerrain.js';
import {
  ensureDailyFresh, bumpDailyProgress, actStarTotalOf, hasClaimableRetentionOf,
  claimAttendanceReward, claimDailyQuestReward, claimStarChestReward, claimCodexMilestoneReward
} from '../../v2/js/modules/retention.js';
import { CODEX_SPECIES, CODEX_ANIM_KO } from '../../v2/js/modules/codexView.js';

{
  // stageTerrain.js: deterministic hash, river geometry, zoneAt/segZone
  assert.equal(TERRAIN_CFG.water.lenMul, 0.7);
  assert.equal(tHash(3, -5, 11), tHash(3, -5, 11));
  assert.ok(tHash(3, -5, 11) >= 0 && tHash(3, -5, 11) < 1);
  assert.equal(getRiverCfg(10).flowDir, 1);
  assert.equal(getRiverCfg(14).flowDir, -1);
  const c10 = tWaterCenter(0, 10);
  assert.ok(tWaterAt(0, c10, 10) !== null, 'point on river centerline must be inside water');
  assert.equal(resolveZoneAt(0, 0, { id: 1, terrain: { kind: 'none' } }, null), null);
  const wz = resolveSegZone({ x: 0, z: c10 - 6 }, { x: 0, z: c10 + 6 }, { id: 10, terrain: { kind: 'water' } }, null);
  assert.ok(wz && wz.kind === 'water', 'segment crossing stage 10 river must hit water');

  // retention.js: attendance, daily quests, star chests, codex milestones
  const rs = { coins: 0, ink: 0, stars: { 1: 3, 2: 3, 3: 3, 4: 3 } };
  ensureDailyFresh(rs, '2026-11-24');
  assert.equal(actStarTotalOf(rs, 1), 12);
  assert.equal(hasClaimableRetentionOf(rs, '2026-11-24'), true);
  const att1 = claimAttendanceReward(rs, '2026-11-24');
  assert.ok(att1 && att1.day === 1);
  assert.equal(claimAttendanceReward(rs, '2026-11-24'), null, 'cannot claim attendance twice same day');
  bumpDailyProgress(rs, '2026-11-24', DAILY_QUESTS[0].id, DAILY_QUESTS[0].goal);
  const dq = claimDailyQuestReward(rs, '2026-11-24', DAILY_QUESTS[0].id);
  assert.ok(dq && dq.id === DAILY_QUESTS[0].id);
  assert.equal(claimDailyQuestReward(rs, '2026-11-24', DAILY_QUESTS[0].id), null);
  const sc = claimStarChestReward(rs, '2026-11-24', 1, STAR_CHESTS[0].stars);
  assert.ok(sc && sc.stars === STAR_CHESTS[0].stars);
  const cm = claimCodexMilestoneReward(rs, '2026-11-24', CODEX_MILESTONES[0].pct, 100);
  assert.ok(cm && cm.pct === CODEX_MILESTONES[0].pct);

  // codexView.js metadata integrity (v1.76: hero + 15 Eastern monsters = 16)
  assert.equal(CODEX_SPECIES.length, 16);
  assert.equal(CODEX_ANIM_KO.stagger, '자세 붕괴');
  console.log('v1.21 MODULES (stageTerrain, retention, codexView) PASSED');
}

/* --- v1.22 보스 회전 혼령·기믹 혼령 비중복 배정 및 추가 배너 검증 --- */
import { pickBossOrbitShapes, pickZoneSpiritShape } from '../../v2/js/modules/bossPatterns.js';

{
  for (const bossSh of ['hline', 'vline', 'vee', 'bolt']) {
    // 1장(풀이 2개뿐인 경우)에서도 보스와 겹치지 않고 3개끼리도 모두 달라야 한다
    const orb1 = pickBossOrbitShapes(bossSh, ['hline', 'vline'], ['hline', 'vline', 'vee', 'bolt'], ['tri', 'square', 'spiral']);
    assert.equal(orb1.length, 3);
    assert.equal(new Set(orb1).size, 3, 'orbit shapes must be pairwise distinct');
    assert.ok(!orb1.includes(bossSh), 'orbit shapes must not overlap boss shape: ' + bossSh);

    // 기믹 전용 혼령도 보스 + 회전 혼령 3개와 겹치지 않아야 한다
    const used = [bossSh, ...orb1];
    const zSh = pickZoneSpiritShape('hline', used, ['hline', 'vline'], ['hline', 'vline', 'vee', 'bolt'], ['tri', 'square', 'spiral']);
    assert.ok(!used.includes(zSh), 'zone spirit shape must not overlap boss or orbit shapes');
  }
  assert.equal(buildBossBannerInfo({ alive: true, state: 'kiai', stateT: 1.0, kiai: { t: 2.0, open: true } }, {}, { teleT: 1 }, 1).mode, 'parry');
  assert.equal(buildBossBannerInfo({ alive: true, state: 'chant', stateT: 1.0, chant: { i: 0 }, chantT: 4.0 }, {}, { teleT: 1 }, 1).name, '영창 저지');
  assert.equal(buildBossBannerInfo({ alive: true, state: 'clash', stateT: 0.4, clash: { i: 1, need: 3, t: 0.4, win: 1.2 } }, {}, { teleT: 1 }, 2).name, '합 겨루기 2/3');
  assert.equal(buildBossBannerInfo({ alive: true, state: 'seal', stateT: 1.0 }, { seal: { t: 3.5 } }, { teleT: 1 }, 1).name, '봉인 마무리');
  console.log('v1.22 ORBIT_SPIRITS_NO_OVERLAP & BOSS_BANNER TESTS PASSED');
}

/* --- v1.23 상점·치장 뷰 모듈 검증: shopView.js --- */
import { STAT_ICONS } from '../../v2/js/modules/shopView.js';

{
  assert.equal(Object.keys(STAT_ICONS).length, 5);
  console.log('v1.23 SHOP_VIEW MODULE PASSED');
}

/* --- v1.24 수련장 컨트롤러·별점 계산 모듈 검증: trainView.js, starRating.js --- */
import { TRAIN_SHAPES, SHAPE_LABEL, trainStatsOfSave } from '../../v2/js/modules/trainView.js';
import { computeStar3Info, computeStarsFor } from '../../v2/js/modules/starRating.js';
import { rollRunMissions, evalRunMissions, computeStyleKillPoints, styleGradeOf } from '../../v2/js/modules/runMissions.js';

{
  assert.equal(TRAIN_SHAPES.length, 10);
  assert.equal(SHAPE_LABEL.star, '⛤');
  const st = trainStatsOfSave({ train: { stats: { hline: [1, 0, 1, 1] } } }, 'hline');
  assert.equal(st.n, 4);
  assert.equal(st.hit, 3);
  assert.equal(st.rate, 0.75);

  const s3 = computeStar3Info({ starCombo: 10 }, { comboMax: 8 }, { star3ComboMul: 0.8 });
  assert.equal(s3.done, true);
  assert.equal(computeStarsFor(true, { hp: 10, hits: 1, comboMax: 8, stage: { starCombo: 10 } }, { star3ComboMul: 0.8, star2Hits: 3 }, 14, 3), 3);
  assert.equal(computeStarsFor(true, { hp: 10, hits: 1, comboMax: 8, challenge: 'endless', stage: { starCombo: 10 } }, {}, 14, 3), 0);
  console.log('v1.24 MODULES (trainView, starRating) PASSED');
}

/* --- v1.25 부목표·도전모드·강화픽커 모듈 검증: stageGoal.js, challengeMode.js, runUpgrades.js --- */
import { createStageGoalController } from '../../v2/js/modules/stageGoal.js';
import { createChallengeController } from '../../v2/js/modules/challengeMode.js';
import { isElemKey, cardNameOfKey, rollUpgradePicks, evoMatInfoFor, pickRecommendedId } from '../../v2/js/modules/runUpgrades.js';

{
  // stageGoal.js
  let gState = { hero: { x: 0, z: 0 }, elapsed: 0, timeLeft: 60, stage: { time: 60, subgoal: { id: 'timed', add: 0.5 } } };
  const gc = createStageGoalController({
    getState: () => gState,
    elById: () => null,
    shapeUnlock: ['hline', 'vline'],
    totemShapes: ['tri', 'square', 'spiral'],
    shapeMark: { hline: '—' },
    dist: (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
    spawnZombie: () => null,
    showJudge: () => {},
    toast: () => {},
    getAudio: () => null,
    telemetry: { event: () => {} }
  });
  gc.initGoal({ time: 60, subgoal: { id: 'shapeLock', label: '한 무늬', at: 5, t: 10 }, shapes: ['hline', 'vline'] }, {});
  assert.equal(gState.goal.shape, 'vline');
  gState.goal.t = 6;
  assert.equal(gc.goalWindowOn(), true);
  assert.equal(gc.goalOnStroke('hline'), true);
  assert.equal(gState.goal.fail, true);

  // challengeMode.js
  let cState = { stage: { shapes: ['hline', 'vline', 'vee'] }, pool: [] };
  const cc = createChallengeController({
    getState: () => cState,
    getSave: () => ({ stage: 1, records: {} }),
    persist: () => {},
    cfg: { bossSpawnR: 7 },
    shapeUnlock: ['hline', 'vline', 'vee'],
    elById: () => null,
    challengeUnlocked: () => true,
    challengeRecord: () => 0,
    curMode: () => ({ bossShapes: 0 }),
    spawnBoss: () => null,
    closeArena: () => {},
    gainXp: () => {},
    xpNeed: () => 10,
    openLevelUp: () => {},
    endRun: () => {},
    startRun: () => {},
    showBossCard: () => {},
    toast: () => {},
    telemetry: { event: () => {} }
  });
  cc.initChallenge('trial', 1);
  assert.equal(cState.challenge, 'trial');
  assert.equal(cState.pool.length, 2);

  // runUpgrades.js
  assert.equal(isElemKey('ice'), true);
  assert.equal(isElemKey('dmg'), false);
  assert.equal(cardNameOfKey('dmg'), '일섬 위력');
  const picks = rollUpgradePicks(3, () => 0, () => 0, false);
  assert.equal(picks.length, 3);
  const rec = pickRecommendedId(picks, { evo: {} }, () => 0, () => 0);
  assert.ok(rec !== null);
  const mats = evoMatInfoFor('fire', { evo: {} }, () => 0, (k) => (k === 'ice' ? 1 : 0));
  assert.ok(mats.includes('증기 폭발'));
  console.log('v1.25 MODULES (stageGoal, challengeMode, runUpgrades) PASSED');
}

/* --- v1.26 대규모 모듈화 스모크 검증: gameConfig + 10개 팩토리 모듈 --- */
import { CFG, SHAPE_MARK, TOTEM_SHAPES, SHAPE_UNLOCK, SHAPE_STYLE } from '../../v2/js/modules/gameConfig.js';
import { createQaBridge } from '../../v2/js/modules/qaBridge.js';
import { createOverlay2d } from '../../v2/js/modules/overlay2d.js';
import { createBossEngine } from '../../v2/js/modules/bossEngine.js';
import { createCombatEngine } from '../../v2/js/modules/combatEngine.js';
import { createStageFlow } from '../../v2/js/modules/stageFlow.js';
import { createStrokeInput } from '../../v2/js/modules/strokeInput.js';
import { createWorld3d } from '../../v2/js/modules/world3d.js';
import { createRunLoop } from '../../v2/js/modules/runLoop.js';
import { createTutorialSys } from '../../v2/js/modules/tutorialSys.js';
import { createUiBindings } from '../../v2/js/modules/uiBindings.js';
import { createSaveHud } from '../../v2/js/modules/saveHud.js';
import { createMainLoop } from '../../v2/js/modules/mainLoop.js';
import { createShopLogic } from '../../v2/js/modules/shopLogic.js';

{
  assert.ok(CFG.hpBase === 14 && SHAPE_UNLOCK.length === 4 && TOTEM_SHAPES.length === 3 && SHAPE_MARK.star === '⛤');
  const mkVec = class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} normalize(){return this;} };
  const dummyRt = new Proxy({ THREE: { Vector2: mkVec, Vector3: mkVec, Color: mkVec }, WF: {} }, {
    get: (t, k) => (k in t ? t[k] : () => ({}))
  });
  [
    createQaBridge, createOverlay2d, createBossEngine, createCombatEngine,
    createStageFlow, createStrokeInput, createWorld3d, createRunLoop,
    createTutorialSys, createUiBindings, createSaveHud, createMainLoop, createShopLogic
  ].forEach((fn) => {
    const api = fn(dummyRt);
    assert.ok(api && typeof api === 'object' && Object.keys(api).length >= 2);
  });
  console.log('v1.26 FULL MODULARIZATION (gameConfig + 13 factory modules) PASSED');

// v1.30 SHAPE_STYLE & 3-tier game feel assertions
{
  for (const sh of ['hline', 'vline', 'vee', 'bolt']) {
    const st = SHAPE_STYLE[sh];
    assert.ok(st && typeof st.name === 'string' && st.dur > 0 && st.chainDur > 0 && st.chainDur < st.dur, 'SHAPE_STYLE valid for ' + sh);
    assert.ok(!/[\u4E00-\u9FFF]/.test(st.name), 'no hanja in SHAPE_STYLE.' + sh);
  }
  assert.ok(SHAPE_STYLE.hline.widthMul > 1.25, 'hline wide sweep');
  assert.ok(SHAPE_STYLE.vline.reachMul > 1.2 && SHAPE_STYLE.vline.falloff === 1.0, 'vline long pierce no falloff');
  assert.ok(SHAPE_STYLE.vee.landR > 1.4 && SHAPE_STYLE.vee.landDmgMul > 0, 'vee slam AoE');
  assert.ok(SHAPE_STYLE.bolt.chainN >= 2, 'bolt lightning chain');
  console.log('v1.30 SHAPE_STYLE & TIERED GAME FEEL PASSED');
}

// v1.32 RUN_MISSIONS, STYLE_SCORE & 3-STAR INTEGRATION TESTS
{
  const ms = rollRunMissions(STAGES[15], 42);
  assert.equal(ms.length, 3);
  for (const m of ms) assert.ok(!/[\u4E00-\u9FFF]/.test(m.label), 'no hanja in mission label');
  assert.equal(computeStyleKillPoints({ multiN: 1, why: 'slash' }), 100);
  assert.equal(computeStyleKillPoints({ multiN: 3, why: 'cleave' }), 1100);
  assert.equal(styleGradeOf(0).label, '병');
  assert.equal(styleGradeOf(10500).label, '극');
  const mockS = { hp: 12, hits: 1, maxMultiHit: 4, comboMax: 30, parryOkN: 3, cleaveKills: 5, shapeKills: { vee: 5, bolt: 5, vline: 5 }, missions: ms };
  assert.equal(evalRunMissions(ms, mockS, 14).doneCount, 3);
  assert.equal(computeStarsFor(true, mockS, {}, 14, 3), 3);
  console.log('v1.32 RUN_MISSIONS, STYLE_SCORE & 3-STAR TESTS PASSED');
}
}

// Stages sharing a combat map still need their own scenery. A replacement must
// not change the playable centre or point to a nonexistent shipped model.
assert.equal(Object.keys(STAGE_SCENERY).length, STAGES.length);
for (const stage of STAGES) {
  const plan = STAGE_SCENERY[stage.id];
  assert.equal(plan.name, stage.name);
  assert.ok(plan.route.length >= 3 && plan.slots.length >= 1);
  for (const [slotKey] of plan.slots) {
    assert.ok(LANDMARKS[slotKey] && LANDMARKS[slotKey].model, stage.name + ': non-GLB slot ' + slotKey);
  }
  const [signature] = plan.slots[0];
  assert.ok(LANDMARKS[signature].height > 0);
  for (const [, side, depth] of plan.slots) {
    const { x, z } = groundPoint(side, depth);
    assert.ok(Number.isFinite(x) && Number.isFinite(z));
    assert.ok(Math.hypot(x, z) >= 7, stage.name + ': central gesture space');
  }
}
assert.equal(new Set(Object.values(STAGE_SCENERY).map(plan => plan.slots[0][0])).size, STAGES.length);
for (const spec of Object.values(LANDMARKS)) {
  if (spec.model) assert.ok(fs.existsSync(new URL('../../v2/assets/models/props/' + spec.model, import.meta.url)));
}
console.log('16 STAGE SCENERY PLANS & SHIPPED MODELS PASSED');


// Refreshing the lobby must retain the chosen unlocked stage, not jump to the unlock limit.
{
  const app = { style: { setProperty() {} }, dataset: {} };
  const rt = {
    $: id => id === 'app' ? app : id === 'titleShapes' ? {} : null,
    STAGES: Array(16), save: { stage: 2, stars: { 1: 1 } },
    clamp: (n, lo, hi) => n < lo ? lo : n > hi ? hi : n,
    stageOf: id => ({ id, shapes: [] }), renderModes() {}, renderChallenges() {}
  };
  const flow = createStageFlow(rt);
  assert.equal(flow.refreshTitleHelp().run, 2);
  rt.titleSel = 3;
  assert.equal(flow.refreshTitleHelp().run, 3);
  rt.titleSel = 7;
  assert.equal(flow.refreshTitleHelp().run, 4);
  rt.developerMode = true;
  rt.titleSel = 9;
  assert.equal(flow.refreshTitleHelp().run, 9);
}

/* --- v1.62 리팩터링 분리 모듈 검증: dashController, bossGimmickStep, bossOverlay --- */
import { createDashController } from '../../v2/js/modules/dashController.js';
import { createBossGimmickStep } from '../../v2/js/modules/bossGimmickStep.js';
import { createBossOverlay } from '../../v2/js/modules/bossOverlay.js';

{
  const dc = createDashController(
    {
      $: () => null,
      S: { arena: { on: false, x: 0, z: 0 }, hero: { x: 0, z: 0 }, combo: 0 },
      CFG: { arenaEdge: 0.6 },
      three: { chunks: { bounds: { x: 0, z: 0, r: 16.5 } } },
      arenaR: () => 16.5
    },
    { showJudge() {}, stampSkill() {} }
  );
  assert.equal(typeof dc.beginDash, 'function');
  assert.equal(typeof dc.resolvePropCollision, 'function');
  const clamped = dc.clipWorld({ x: 30, z: 0 }, 0.5);
  assert.ok(clamped.x <= 16.01 && Math.abs(clamped.z) < 1e-6, 'clipWorld clamps to arena radius');

  const gs = createBossGimmickStep(
    { S: { elapsed: 0 } },
    {
      heroHurt() {}, notePatSeen() {}, applyVulnStack() {}, clearZoneSpirits() {},
      spawnDonutZoneSpirit() {}, spawnPizzaSafeSpirit() {}, bossJustDodge() {},
      bossPoise() {}, spawnBossShot() {}, spawnBossWave() {}
    }
  );
  assert.equal(gs.stepBossGimmick({ state: 'walk' }, 0.016, {}), null);
  assert.equal(gs.stepBossGimmick({ state: 'donut' }, 0.016, {}), null);

  const bo = createBossOverlay(
    { S: { boss: null, sealFx: 0 } },
    { bossPat: () => ({}), kiaiWin: () => false, bossMinions: () => [], reflectReady: () => false, bossPatList: () => null, bossBannerInfo: () => null }
  );
  assert.equal(typeof bo.drawBossPat, 'function');
  console.log('v1.62 REFACTORED MODULES (dashController, bossGimmickStep, bossOverlay) PASSED');
}

/* --- v1.76 15종 막별 몬스터 생태계 · 4막 서사/보스 대사 · 19패턴 즉각 힌트 · 3·4막 경제 · 0.88s 예고 하한선 검증 --- */
import { ACT_NARRATIVE, BOSS_QUOTES, ACT_MONSTER_ROSTER, actMonsterPreloadKeys } from '../../v2/js/modules/stages.js';
import { getPatternHint } from '../../v2/js/modules/bossCatalog.js';
import { actCoinMul } from '../../v2/js/modules/economy.js';

{
  // 1) All 15 Eastern monsters are placed across Acts 1~4
  const deployedSet = new Set();
  for (let a = 1; a <= 4; a++) {
    assert.ok(Array.isArray(ACT_NARRATIVE[a]) && ACT_NARRATIVE[a].length === 3, `Act ${a} has 3-line narrative`);
    assert.ok(BOSS_QUOTES[a] && BOSS_QUOTES[a].enter && BOSS_QUOTES[a].seal, `Act ${a} has boss enter/seal quotes`);
    actMonsterPreloadKeys(a).forEach((k) => deployedSet.add(k));
  }
  assert.equal(deployedSet.size, 15, 'All 15 Eastern monsters are assigned across Acts 1-4');

  // 2) Every pattern in PAT_CODE has a short first-encounter hint
  PAT_CODE.forEach((p) => {
    const h = getPatternHint(p.id);
    assert.ok(h && h.length >= 6, `Pattern ${p.id} has short action hint`);
  });

  // 3) Mobile fair telegraph floor >= 0.88s across all 16 stages + Act 4 subgoals
  STAGES.forEach((st) => {
    assert.ok(st.boss && st.boss.telegraph >= 0.88, `Stage ${st.id} telegraph >= 0.88s (got ${st.boss && st.boss.telegraph})`);
  });
  assert.ok(stageOf(14).subgoal && stageOf(14).subgoal.id === 'dark', 'Stage 14 has dark survival subgoal');
  assert.ok(stageOf(15).subgoal && stageOf(15).subgoal.id === 'hunt', 'Stage 15 has elite hunt subgoal');

  // 4) Act 3 & Act 4 coin multipliers
  assert.equal(actCoinMul(1), 1.0);
  assert.equal(actCoinMul(3), 1.35);
  assert.equal(actCoinMul(4), 1.75);
  console.log('v1.76 ECOSYSTEM, NARRATIVE, HINTS, ECONOMY & FAIRNESS PASSED');
}
