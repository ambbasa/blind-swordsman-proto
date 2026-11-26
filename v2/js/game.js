import {buildSealStake,sealPaper} from './sealstake.js';
import { SPIRIT_GLYPH_PATHS } from './inkicons.js';
import { makeGroundLayer, paintFrame } from './groundfx.js';
import { paintSkill } from './fieldart.js';
/* 심안(SIMAN) v2 — 2.5D quarter-view, Three.js, camera-follow dashes.
   v0.39 (Papertrails 통합 개편 1~3단계):
     · 1단계 톤 기준선 — js/palette.js 단일 팔레트 토큰(먹·한지·비취·진홍·금·옥) + CSS 변수 주입 + 역톤매핑,
       style.css/ux-upgrade.css 의 이중 정의·사문화 토큰 정리,
       js/audiobus.js 공용 오디오 버스(보이스 슬롯·토큰버킷·밀도 덕킹·방 초기반사·소프트니 리미터).
     · 2단계 안개 통합 — js/cardstock.js 월드 거리 fade-to-dark 로 지면·소품·기물·병풍·캐릭터를 한 규칙으로,
       2D #sightFog 캔버스와 punchSpiritLights 은퇴(혼령은 안개 면제), 후처리(inkwash)에 마지막 한 겹.
     · 3단계 재질 통합 — 랩 라이팅·얇은 종이 역광·시트별 톤을 모든 소품·빌보드에,
       그림자 프러스텀을 카메라 가시 바닥에 매 프레임 피팅 + 텍셀 스냅 + PCF 페넘브라(2048/1024).
   v0.38: 주인공·원혼·보스 캐릭터 파츠 리그 — images CLI 로 구운 비단 디오라마 파츠(몸통·머리·다리·띠·칼팔)를
          관절별 빌보드 메시로 세우고 dt 기반 사인·스프링으로 60fps 연속 변형(걷기 바운스·앞기울기·띠 펄럭임·피격 반동).
          실루엣 테 발광(한지빛 주인공·청옥빛 원혼·진홍 보스) · 좌우 반전을 메시 음수 스케일로 정정 · 타이틀 프리로드
   v0.37: 비단 병풍 디오라마 — images CLI 로 그린 수묵화 PNG 소품(기와집·소나무·대나무·석등·바위)과
          사각 돌판 바닥(노멀·러프니스 포함)·원경 접이식 산수 병풍 띠(1 드로우콜, 영웅 추적) ·
          타이틀에서 디오라마 에셋 비동기 프리로드(출전 멈춤 없음) · 호박빛 0xffb45c 등불 풀
   v0.36: 한지·수묵 팝업북 소품(inkpaper.js — 기와집·대나무·소나무·돌등불·바위 교차평면 컷아웃) ·
          주인공 검은 무사복(두건·안대·상의·바지·장화, 한지빛 림) · HUD 잠금은 제스처 획 판정 중에만 ·
          소나 2D 링 제거(3D 지면 소나 한 겹) · 지면 시야안개(uSightFog)로 깊이 · 블룸 임계값 1.15로 빛 분리 · 점광원 품질별 4/2개
   v0.35: 12장 '나락' 지형 규칙(검은 구덩이·0.5m/초 끌림) 제거 · 출전 직후 멈춤 제거 —
          셰이더/텍스처 예열을 타이틀 여유 프레임으로(10ms 예산) · 바닥 판석 512→256(계산 1/4) · 같은 자리 판 재시작 때 청크 재구축 생략
   v0.31: 판 안 재미 — 강적 깨는 법(장정 갑옷·돌 금·정예 봉인 순서) · 콤보 개편(반감 유지·단계 보상) ·
          정확한 패링(닿기 0.2초 탭) · 카드 개편(멈추지 않는 선택·체감 성장·새 카드 6종·두 원소 칸·진화 5종) · 경험치 곡선
   v0.30: 난이도 모드(수련·정석·고수) · 동적 보정 · 첫 10초 몸통 튜토리얼 · '처음 보는 순간' 규칙 ·
          색약 팔레트와 화면 흔들림 끄기 · 보스전 시간 예산 실측·조정(§4.3)
   v0.28: 혼령의 창 — 먹안개가 혼령을 삼키지 않게, 링 경계·그 너머·짙은 안개에서도 혼령 몸과 기호가 그대로 읽힌다
   v0.27: 화면별 시야 통일(짧은 축 고정 스케일) · HUD 3줄 개편(넘침·줄바꿈 제거·소리·일시정지) ·
          혼령 영혼 흐름 얇고 연하게 · 5~12장 보스 패턴·봉인 · 걷는 보스 무적(빈틈 공략) ·
          첫 진입/참(O)/기물 안내 · 보스 윤곽광·12장 대비 · 제스처 완화(O 40° 열림·얕은 V·좁은 ⚡·U 반달) */
import { CLUB_IMPACT_TIME } from './inkmodels3d.js';
import { makeBossGlb, preloadMonsterGlb } from './glbboss.js?v=v153';
import * as THREE from 'three';
import { probeAssets, buildArt } from './art.js?v=v153';
import * as Anim from './anim.js';
import { createAudio } from './audio.js?v=v153';
import { startLobby3d, stopLobby3d, syncLobby3dStyle, startCodex3d, playCodexAnim3d, stopCodex3d } from './lobbyPreview3d.js?v=v153';
import { PAT_COST, PAT_CUE, getActPhaseFx, getActSkillNames, bossPatternMean, buildBossBannerInfo, pickBossOrbitShapes, pickZoneSpiritShape } from './modules/bossPatterns.js?v=v153';
import { TERRAIN_CFG, tHash, tPatchAt, tPatchesNear, tRootAt, getRiverCfg, tWaterCenter as terrainWaterCenter, tWaterAt as terrainWaterAt, resolveZoneAt, resolveSegZone } from './modules/stageTerrain.js?v=v153';
import { ensureDailyFresh as ensureDailyFreshState, bumpDailyProgress, actStarTotalOf, hasClaimableRetentionOf, claimAttendanceReward, claimDailyQuestReward, claimStarChestReward, claimCodexMilestoneReward, renderDailyView } from './modules/retention.js?v=v153';
import { renderCodexView } from './modules/codexView.js?v=v153';
import { renderShopOverview, renderShopTabView, renderCosmeticView } from './modules/shopView.js?v=v153';
import { TRAIN_SHAPES, SHAPE_LABEL, SHAPE_TIP, createTrainController } from './modules/trainView.js?v=v153';
import { computeStar3Info, computeStarsFor } from './modules/starRating.js?v=v153';
import { rollRunMissions, evalRunMissions, computeStyleKillPoints, styleGradeOf } from './modules/runMissions.js?v=v153';
import { createStageGoalController } from './modules/stageGoal.js?v=v153';
import { createChallengeController } from './modules/challengeMode.js?v=v153';
import { isElemKey, cardNameOfKey, rollUpgradePicks, evoPartsOf, evoMatInfoFor, evoHintsFor, pickRecommendedId } from './modules/runUpgrades.js?v=v153';
import { createQaBridge } from './modules/qaBridge.js?v=v153';
import { createOverlay2d } from './modules/overlay2d.js?v=v153';
import { createWorld3d } from './modules/world3d.js?v=v153';
import { createUiBindings } from './modules/uiBindings.js?v=v153';
import { createShopLogic } from './modules/shopLogic.js?v=v153';
import { createMainLoop } from './modules/mainLoop.js?v=v153';
import { createSaveHud } from './modules/saveHud.js?v=v153';
import { createTutorialSys } from './modules/tutorialSys.js?v=v153';
import { createRunLoop } from './modules/runLoop.js?v=v153';
import { createStrokeInput } from './modules/strokeInput.js?v=v153';
import { createStageFlow } from './modules/stageFlow.js?v=v153';
import { createCombatEngine } from './modules/combatEngine.js?v=v153';
import { createBossEngine } from './modules/bossEngine.js?v=v153';
import { preloadHeroGlb, heroGlbReady } from './glbhero.js?v=v153';
import { createInkSlash, prewarmInkSlash } from '../../assets/v2/fx-ink/code/inkSlashMaterial.js';
import { InkParticles } from '../../assets/v2/fx-ink/code/inkParticles.js';
import { setupBloom, AutoQuality } from '../../assets/v2/fx-ink/code/bloomSetup.js';
import { createInkWashPass } from './inkwash.js?v=v153';
import { createTiltShiftPass, createDepthCapture, focusDistance } from './doftilt.js';
import { foldPop, tickFolds } from './foldspring.js';
import { PIXEL_LOOK, createPixelLookPass } from './pixellook.js';
import { createCinematicPass, pulseImpactChroma } from './inkcinematic.js?v=v153';
import { createSlashArc } from './inkslash3d.js';
import { PaperFx, preloadFx, fxInfo as fxSheetInfo, brushTex } from './inkfx3d.js';
import { TraceField, preloadTraces, tracesReady } from './traces.js';
import { StageAtmosphere } from './inkatmos.js';
import { paperPropCanvas } from './inkpaper.js';
import { preload as preloadFigures, poseInfo as figurePoseInfo } from './inkchars3d.js';
import { preloadDiorama, dioramaInfo } from './inkdiorama.js';
import { createChunkWorld, buildChunkData, chunkOf, prebakeGroundStage, floorStatus } from './inkchunks.js';
import { warmScene, isWarmed as shadersWarmed, info as warmInfo, materialVariants } from './prewarm.js';
import { InkFx, FX_COLORS } from './inkfx.js';
import { BossFx } from './bossFx.js';
import { createTelemetry } from './telemetry.js';
import { applyHeroCloak3D } from './inkhero3d.js?v=v153';
import {
  SAVE_VERSION, STAT_DEFS, FORGE_COSTS, SWORDS, RELICS, COSMETIC_CLOAKS, COSMETIC_TRAILS,
  DAILY_QUESTS, ATTENDANCE_REWARDS, STAR_CHESTS, CODEX_MILESTONES,
  SKINS, BRUSHES, MON_CODE, CODEX_GROUPS, EVO_SLOTS, PAT_SLOTS,
  newSaveMeta, migrateMetaV4, swordForgeLv, swordFx, swordOf, equippedRelics, relicOn, relicSlots,
  cloakOf, trailOf, skinOf, brushOf, codexCounts, codexBonus, codexTotalPct, todayKey, isBasePat
} from './meta.js';
import { getSwordSvg, getRelicSvg, getCosmeticSvg } from './modules/itemArt.js';
import { InkLightPool, createWorldInkUniforms, attachGroundInkShader } from './inklights.js';
import { initOverlayShell } from './ui/overlayShell.js';
import { installCssVars, color as palColor, hex as palHex } from './palette.js';
import { WF, paint as paintCard, updateFade as updateWorldFade, stats as cardStats } from './cardstock.js';
import { SHAPE_MARK, TOTEM_SHAPES, SHAPE_KEY, SHAPE_UNLOCK, COMBAT, SHAPE_HINT, SHAPE_STYLE, CFG } from './modules/gameConfig.js?v=v153';
import {
  getShopTabNote, statUpgradeCost, statTotalSpent, resetAllStats,
  computeCombatPower, stageRecommendedPower, forgeCostOf,
  computeIdleCoins, purchaseStatUpgrade, getIdleNotice
} from './modules/economy.js';
import {
  computeAtkBonus, computeGapBonus, computePoiseBonus,
  computeComboMul, computeDashDmg, computeMaxHp
} from './modules/combat.js';
import { STAGES, ACT_NAMES, HANJI_TONE, actOf, stageOf, applyHanjiToneToStages } from './modules/stages.js';
import { MODES, MODE_ORDER, MODE_NOTE, modeOf, CHALLENGES, challengeOf, RUN_UPGRADES, EVO_RECIPES } from './modules/upgrades.js';
import { PAT_CODE } from './modules/bossCatalog.js';
import { createInputQueue, createDashLatencyTracker } from './modules/inputQueue.js';
import { createRunState, resetRunStateOnQuit } from './modules/state.js';
import { createHudController } from './modules/hudController.js?v=v153';
import { createUiRouter } from './modules/uiRouter.js?v=v153';
import { syncSceneActTheme3D } from './modules/actTheme3d.js';
import { createInkRiver3D } from './modules/inkWater3d.js';
import { createInkTerrain3D } from './modules/inkTerrain3d.js';
import { SimanVfx3D } from './modules/simanVfx3d.js';
import { SimanShaderFx3D } from './modules/simanShaderFx3d.js';
/* v0.39 1단계: 팔레트 토큰을 CSS 변수로 내린다(빌드 없이 단일 소스). */
installCssVars();
const hudCtrl = createHudController(document);
const uiRouter = createUiRouter({
  doc: document,
  hudCtrl,
  isMuted: () => !!save.muted,
  onEnableAudio: () => {
    if (!save.muted && audio) {
      audio.setQuiet(false, qa.noDelay);
      hudCtrl.syncMuteUi(false);
    }
  }
});
const inkFx = new InkFx();
const bossFx = new BossFx();
const telemetry = createTelemetry({ version: '0.39' });
let frameDt = 1 / 60;

const G = window.GPGestures;
const developerMode = new URLSearchParams(location.search).get('dev') === '1';
const devBossNow = developerMode && new URLSearchParams(location.search).get('bossNow') === '1';
const SAVE_KEY = developerMode ? 'gesture-proto.v2.dev' : 'gesture-proto.v2';
const FXINK_BASE = '../assets/v2/fx-ink/';
/* v0.35 QA: 시작 경로 계측 — 타이틀 예열·소개 카드 준비·판 시작·청크 재구축에 걸린 시간(ms).
   출전 직후 멈춤을 "느낌"이 아니라 숫자로 재기 위한 기록이다(최근 40개만 남는다). */
const PERF_LOG = [];
function perfMark(name, ms, extra) {
  try {
    PERF_LOG.push(Object.assign({ name: name, ms: Math.round(ms), at: Math.round(performance.now()) }, extra || {}));
    if (PERF_LOG.length > 40) PERF_LOG.shift();
  } catch (e) {}
}
const IS_MOBILE = (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
  || (typeof window !== 'undefined' && Math.min(window.innerWidth || 999, window.innerHeight || 999) <= 768);
function fxQualityFromUrl() {
  try {
    const q = new URLSearchParams(location.search).get('fx');
    if (q === 'low' || q === 'off' || q === 'high') return q;
  } catch (e) {}
  /* v0.72: 모바일은 기본 'low'(DPR 1.5·512 그림자·DoF 생략)로 60fps 확보, 데스크톱은 'high' */
  return IS_MOBILE ? 'low' : 'high';
}
const fxQForced = (function () {
  try { return ['high', 'low', 'off'].indexOf(new URLSearchParams(location.search).get('fx')) >= 0; } catch (e) { return false; }
})();
let fxQ = fxQualityFromUrl();
const fxinkStat = { slashes: 0, hits: 0, kills: 0 };
applyHanjiToneToStages(THREE.Color, STAGES);
let titleSel = null, pendingStage = null, _frameId = 0, _atmoMask = '', _heroCssX = '';
let QA_CAM = null, lastMarkMetrics = { cssPx: 40, minCss: 40, w: 0, h: 0, marks: [] }, guideUntil = 0;
let qaFadeMat = 1, qaFadePostK = 1, qaFadeColor = false;
function curMode() { return modeOf((S && S.mode) || save.mode || 'jeongseok'); }
/** 고수 모드는 12장을 깨야 열린다. */
function gosuUnlocked() { return ((save.stars || {})[STAGES.length] || 0) > 0; }
function challengeUnlocked(id) {
  const c = challengeOf(id);
  if (!c) return false;
  return ((save.stars || {})[c.unlock] || 0) > 0 || ((save.stars || {})[STAGES.length] || 0) > 0;
}
function challengeRecord(id) { return (save.records && save.records[id]) || 0; }
/** 이 판의 예고 배율(모드 × 동적 보정). 첫 등장 연출은 이 값 위에 한 번 더 곱한다. */
function teleMul() { return ((S && S.teleMul) || curMode().tele) * ((S && S.phaseTele) || 1); }
/** 받는 피해: 모드 배율(최소 1). */
function modeDmg(n) { return Math.max(1, Math.round((n || 0) * curMode().dmg)); }
function modeSpd() { return curMode().spd; }
function modeCoin() { return curMode().coin; }
/** 별 상한: 수련은 2개까지. */
function starCap() { return curMode().starCap; }
function curStage() { return (S && S.stage) || stageOf(save.stage || 1); }
function stageWaves() { const st = curStage(); return (st && st.waves) || CFG.waves || []; }
/* 한 판의 제한 시간(스테이지별). 적 성장·포위 가속의 기준. */
function runLimit() { return (S && S.stage && S.stage.time) || CFG.timeLimit; }

/* ---------- v0.32 §6.1 지형 규칙 엔진 ----------
   장마다 지형 규칙 하나. 엔진의 입구는 네 갈래뿐이다.
     onLand(land, dash)  — 착지 순간
     onDashPath(from,to) — 일섬의 경로(길이·느려짐·피해 배율·종·혈석)
     onTick(dt)          — 주기·지속 효과(달빛·안개·재생·포대·끌림)
     zoneAt(x, z)        — 그 자리의 지형(그리기·판정 공용)
   지형은 (x, z, 장)의 결정론적 함수다 — 같은 자리는 언제나 같은 지형이고,
   청크 시드와 같은 방식(정수 해시)이라 저장할 필요가 없다. */
/* 지형 규칙 결정론적 지오메트리(TERRAIN_CFG, tHash, tPatchAt, tPatchesNear, tRootAt, getRiverCfg 등)는 modules/stageTerrain.js로 분리 */
function tWaterCenter(x, st) {
  const sid = (st && st.id) || (S && S.stage && S.stage.id) || 10;
  return terrainWaterCenter(x, sid);
}
function tWaterAt(x, z, st) {
  const sid = (st && st.id) || (S && S.stage && S.stage.id) || 10;
  return terrainWaterAt(x, z, sid);
}
function zoneAt(x, z, st) {
  return resolveZoneAt(x, z, st || (S && S.stage) || null, S);
}
function tSegZone(from, to, st) {
  return resolveSegZone(from, to, st || (S && S.stage) || null, S);
}
function rebuildTerrain3D() {
  if (!S || !three || !three.scene || !S.terrain) return;
  const rCfg = (S.terrain && S.terrain.kind === 'water') ? getRiverCfg(S.stageNo) : null;
  const arenaProps = (three.chunks && three.chunks.arena && three.chunks.arena.props) || [];
  if (three.terrain3d) { try { three.terrain3d.dispose(); } catch (e) {} three.terrain3d = null; }
  try {
    three.terrain3d = createInkTerrain3D(three.scene, S.terrain.kind, {
      stageNo: S.stageNo,
      riverCfg: rCfg,
      arenaProps: arenaProps
    });
  } catch (e) { three.terrain3d = null; }
}
function terrainInit() {
  if (!S) return;
  S.terrain = {
    kind: (S.stage && S.stage.terrain && S.stage.terrain.kind) || 'none', name: (S.stage && S.stage.terrain && S.stage.terrain.name) || '',
    counts: {}, stumbleT: 0, rootT: 0, ringMul: 1, moon: false, moonT: 0,
    revealT: 0, bells: {}, stones: {}, wallT: 0, volleyOn: false, volleyHp: 0
  };
  if (three && three.river) { try { three.river.dispose(); } catch (e) {} three.river = null; }
  const rCfg = (S.terrain && S.terrain.kind === 'water') ? getRiverCfg(S.stageNo) : null;
  if (three && three.scene && rCfg) {
    try { three.river = createInkRiver3D(three.scene, rCfg); } catch (e) { three.river = null; }
  }
  rebuildTerrain3D();
  telemetry.event('stage_terrain', { stage: S.stageNo || 0, rule: S.terrain.kind });
}

/* ---------- v0.34 §6.2 장마다 부목표 ----------
   3막 장에 목적이 다른 목표 하나를 둔다: 수호(5) · 사냥(7) · 무늬 제한(9) · 어둠(10) · 시간 공격(11).
   목표는 별 3(§7.4)과 이어진다. */
const _goalCtrl = createStageGoalController({
  getState: function () { return S; },
  elById: $,
  shapeUnlock: SHAPE_UNLOCK,
  totemShapes: TOTEM_SHAPES,
  shapeMark: SHAPE_MARK,
  dist: dist,
  spawnZombie: function (o) { return spawnZombie(o); },
  showJudge: (...a) => showJudge(...a),
  toast: (...a) => toast(...a),
  getAudio: function () { return audio; },
  telemetry: telemetry
});
function initGoal(st, opts) { return _goalCtrl.initGoal(st, opts); }
function goalWindowOn() { return _goalCtrl.goalWindowOn(); }
function goalOnStroke(type) { return _goalCtrl.goalOnStroke(type); }
function goalOnKill(z) { return _goalCtrl.goalOnKill(z); }
function goalPass(msg) { return _goalCtrl.goalPass(msg); }
function goalFail(msg) { return _goalCtrl.goalFail(msg); }
function tickGoal(dt) { return _goalCtrl.tickGoal(dt); }
function goalHudText() { return _goalCtrl.goalHudText(); }
function renderGoalHud() { return _goalCtrl.renderGoalHud(); }
function tcount(key, n) {
  if (!S || !S.terrain) return 0;
  S.terrain.counts[key] = (S.terrain.counts[key] || 0) + (n == null ? 1 : n);
  return S.terrain.counts[key];
}
function tFire(kind, detail) {
  if (!S || !S.terrain) return;
  const d = { rule: S.terrain.kind, kind: kind, stage: S.stageNo || 0 };
  if (detail) Object.keys(detail).forEach(function (k) { d[k] = detail[k]; });
  telemetry.event('terrain', d);
}
/* 착지: 잔해(비틀) · 눈밭(미끄러짐) · 뿌리(묶임 + 충격 2배) */
function onLand(land, d) {
  if (!S || !S.terrain || !land) return null;
  const T = S.terrain, C = TERRAIN_CFG;
  const zone = zoneAt(land.x, land.z);
  if (T.kind === 'rubble' && zone) {
    T.stumbleT = Math.max(T.stumbleT, C.rubble.stumble);
    const n = tcount('rubble');
    tFire('rubble', { x: +land.x.toFixed(2), z: +land.z.toFixed(2) });
    showJudge('비틀');
    return { stumble: C.rubble.stumble, n: n };
  }
  if (T.kind === 'snow') {
    const dx = land.x - (d && d.from ? d.from.x : land.x), dz = land.z - (d && d.from ? d.from.z : land.z);
    const L = Math.hypot(dx, dz) || 1;
    const tx = land.x + dx / L * C.snow.slip, tz = land.z + dz / L * C.snow.slip;
    const c = clipBound({ x: tx, z: tz });
    S.bounce = { from: { x: land.x, z: land.z }, to: { x: c.x, z: c.z }, t: 0, dur: 0.18 };
    const n = tcount('snow');
    tFire('snow', { slip: C.snow.slip });
    return { slip: C.snow.slip, n: n };
  }
  if (T.kind === 'root' && zone) {
    T.rootT = Math.max(T.rootT, C.root.bind);
    const n = tcount('root');
    tFire('root', { x: +land.x.toFixed(2), z: +land.z.toFixed(2) });
    landingShock(land);
    if (S.lastDash) S.lastDash.shock = { x: land.x, z: land.z, r: (CFG.landShockR || 1.6) * 1.3, push: (CFG.landPush || 1.2) * C.root.shockMul };
    S.shake = Math.max(S.shake || 0, 0.45);
    showJudge('뿌리 — 충격 두 배');
    return { bound: C.root.bind, n: n };
  }
  return null;
}
/* 일섬 경로: 대숲(느려짐+피해) · 물길(길이 −30%) · 종(드러냄) · 혈석(끄기) */
function onDashPath(from, to) {
  const out = { to: { x: to.x, z: to.z }, dur: 0, dmgMul: 1 };
  if (!S || !S.terrain || !from || !to) return out;
  const T = S.terrain, C = TERRAIN_CFG;
  if (T.kind === 'bamboo') {
    if (tSegZone(from, to)) {
      out.dur = C.bamboo.slow; out.dmgMul = C.bamboo.dmgMul;
      const n = tcount('bamboo');
      tFire('bamboo', { slow: C.bamboo.slow, dmg: C.bamboo.dmgMul, n: n });
      showJudge('대를 베며 느려진다');
    }
  } else if (T.kind === 'water') {
    const w = tSegZone(from, to);
    if (w) {
      out.to = { x: from.x + (to.x - from.x) * C.water.lenMul, z: from.z + (to.z - from.z) * C.water.lenMul };
      out.water = true;
      const n = tcount('water');
      tFire('water', { lenMul: C.water.lenMul, n: n });
    }
  } else if (T.kind === 'bell') {
    tPatchesNear(from.x, from.z, 4, 10.0, 83, 0.4, 0.5, 0.5).forEach(function (p) {
      if (segDist(p.x, p.z, from.x, from.z, to.x, to.z) > 1.5) return;
      const nowT = S.elapsed || 0;
      if ((T.bells[p.key] || 0) > nowT) return;
      T.bells[p.key] = nowT + C.bell.cd;
      T.revealT = C.bell.reveal;
      const n = tcount('bell');
      tFire('bell', { reveal: C.bell.reveal, n: n });
      if (three && three.terrain3d && typeof three.terrain3d.triggerBellWave === 'function') three.terrain3d.triggerBellWave(p.x, p.z);
      else inkFx.ring(3.2, FX_COLORS.gold, 0.5);
      if (audio && audio.gong) audio.gong(); else if (audio && audio.bell) audio.bell(0, 'hline');
      showJudge('종이 울린다 — 2초');
    });
  } else if (T.kind === 'blood') {
    tPatchesNear(from.x, from.z, 4, 8.0, 97, 0.55, 2.4, 3.2).forEach(function (p) {
      if (segDist(p.x, p.z, from.x, from.z, to.x, to.z) > (p.r * 0.45 + 0.7)) return;
      if ((T.stones[p.key] || 0) > (S.elapsed || 0)) return;
      T.stones[p.key] = (S.elapsed || 0) + C.blood.offT;
      const n = tcount('blood');
      tFire('blood', { off: C.blood.offT, n: n });
      inkFx.burst(p.x, p.z, FX_COLORS.gold, { r1: 40, n: 10, dur: 0.5 });
      showJudge('혈석이 꺼졌다');
    });
  }
  return out;
}
/* 주기·지속: 달빛 · 안개 숨쉼 · 혈석 재생 · 성벽 화살비 · 나락 끌림 */
function onTick(dt) {
  if (!S || !S.terrain) return;
  const T = S.terrain, C = TERRAIN_CFG;
  if (T.stumbleT > 0) {
    T.stumbleT = Math.max(0, T.stumbleT - dt);
    /* 비틀거림이 끝나면 예약해 둔 획이 저절로 나간다. */
    if (T.stumbleT === 0 && S.inputBuf) consumeInputBuf();
  }
  if (T.rootT > 0) T.rootT = Math.max(0, T.rootT - dt);
  if (T.revealT > 0) T.revealT = Math.max(0, T.revealT - dt);
  T.ringMul = T.kind === 'fog' ? 1 + C.fog.amp * Math.sin(((S.elapsed || 0) / C.fog.period) * Math.PI * 2) : 1;
  if (T.kind === 'moon') {
    const cyc = (S.elapsed || 0) % C.moon.period;
    const was = T.moon;
    T.moon = cyc >= C.moon.period - C.moon.lit;
    T.moonT = T.moon ? (C.moon.period - cyc) : 0;
    if (T.moon && !was) { tFire('moon', { on: true }); showJudge('붉은 달'); if (audio && audio.gong) audio.gong(); }
  }
  if (T.kind === 'blood') {
    (S.zombies || []).forEach(function (z) {
      if (!z || !z.alive || z.isBoss || z.isClone || z.isPillar) return;
      const max = z.maxHp || z.hp;
      if (z.hp >= max) return;
      if (!zoneAt(z.x, z.z)) return;
      z.hp = Math.min(max, z.hp + C.blood.regen * dt);
    });
  }
  if (T.kind === 'fog' && T.ringMul > 1.06) { /* 가장 넓은 순간의 처치를 센다(별 3 대안) */ }
  if (T.kind === 'wall') {
    T.wallT += dt;
    if (T.wallT >= C.wall.every) {
      T.wallT = 0;
      for (let i = 0; i < C.wall.n; i++) {
        const a = (i / C.wall.n) * Math.PI * 2 + Math.random() * 0.5;
        const rr = i === 0 ? 0 : 1.3 + Math.random() * 1.4;
        const arrow = spawnHazard(S.hero.x + Math.cos(a) * rr, S.hero.z + Math.sin(a) * rr, C.wall.r, C.wall.tele + i * 0.08);
        if (arrow) arrow.arrowVolley = true;
      }
      T.volleyOn = true; T.volleyHp = S.hp;
      tFire('wall', { arrows: C.wall.n, tele: C.wall.tele });
      toast('성벽에서 화살비 — 예고 원을 벗어나세요');
    }
    if (T.volleyOn && !(S.hazards || []).some(function (h) { return !h.done; })) {
      T.volleyOn = false;
      if (S.hp >= T.volleyHp) { const n = tcount('wall'); tFire('wall', { dodge: true, n: n }); showJudge('화살비를 피했다'); }
    }
  }
  /* 지형이 바뀌는 장의 숫자도 남긴다(텔레메트리 요약용). */
  if (T.kind !== 'fog' && T.kind !== 'none' && !T.firedOnce) { T.firedOnce = true; }
}
/* 달빛·혈석·물길이 적과 엽전에 거는 배율 */
function terrainSpeedMul() {
  if (!S || !S.terrain) return 1;
  const T = S.terrain;
  if (T.kind === 'moon' && T.moon) return TERRAIN_CFG.moon.speed;
  return 1;
}
function terrainSlowMul(at) {
  if (!S || !S.terrain) return 1;
  const T = S.terrain;
  if (T.kind === 'water' && at && zoneAt(at.x, at.z)) return TERRAIN_CFG.water.slow;
  return 1;
}
function terrainCoinMul() {
  if (!S || !S.terrain) return 1;
  const T = S.terrain;
  return (T.kind === 'moon' && T.moon) ? TERRAIN_CFG.moon.coin : 1;
}
function terrainDashingBlocked() {
  return !!(S && S.terrain && S.terrain.rootT > 0);
}
/* v0.30 §4.3 보스전 시간 예산.
     A = time − bossAt (가용), C = walk(2.6) + 패턴 평균 길이 P + 경직(1.2)
     N = ceil(무늬 수 / 2),  Need = N×C + 봉인 2초,  Slack = A / Need  → 목표 1.4~1.8
   패턴 길이는 문서의 P(추정) 대신 실제 패턴 지속 시간을 넣는다(예고는 모드 배율로 늘/줍힌다). */
/* 실측한 패턴 지속 시간(PAT_COST) 및 평균 패턴 길이(bossPatternMean)는 modules/bossPatterns.js에서 임포트. */
function bossBudget(stageNo, modeId, opt) {
  opt = opt || {};
  const st = stageOf(stageNo || (save.stage || 1));
  const m = modeOf(modeId || save.mode || 'jeongseok');
  const B = CFG.budget;
  const A = Math.max(0, st.time - st.bossAt);
  const shapes = Math.max(2, (st.bossShapes || CFG.bossShapes) + (opt.shapeAdj != null ? opt.shapeAdj : m.bossShapes));
  const P = opt.P != null ? opt.P : bossPatternMean(st, m.tele, m.bossShapes);
  const C = opt.C != null ? opt.C : ((B.walk || 2.6) + P + (B.stun || 1.2));
  const N = Math.ceil(shapes / (B.K || 2));
  const need = N * C + (B.seal || 2);
  return {
    stage: st.id, mode: m.id, A: +A.toFixed(1), time: st.time, bossAt: st.bossAt,
    shapes: shapes, P: +P.toFixed(2), C: +C.toFixed(2), N: N, need: +need.toFixed(1),
    slack: +(A / Math.max(0.1, need)).toFixed(2), ok: (A / Math.max(0.1, need)) >= (B.slackMin || 1.4)
  };
}
function budgetTable(opt) {
  return STAGES.map(function (st) {
    return {
      stage: st.id, bossAt: st.bossAt, time: st.time, shapes: st.bossShapes,
      train: bossBudget(st.id, 'train', opt), jeongseok: bossBudget(st.id, 'jeongseok', opt), gosu: bossBudget(st.id, 'gosu', opt)
    };
  });
}
/* 보스 결계(아레나): 보스가 살아 있는 동안만 성립한다. */
function arenaActive() { return !!(S && S.arena && S.boss && S.boss.alive); }
function arenaR() { return (S && S.arena && S.arena.r) || (CFG.arenaR || 12); }

function $(id) { return document.getElementById(id); }
function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
function dist(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.hypot(dx, dz); }
function nearestTo(items, origin) {
  let nearest;
  let bestDistance = Infinity;
  for (const item of items) {
    const dx = item.x - origin.x;
    const dz = item.z - origin.z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      nearest = item;
      bestDistance = distance;
    }
  }
  return nearest;
}
function now() { return performance.now(); }

const save = { coins: 0, ink: 0, atkLv: 0, hpLv: 0, gapLv: 0, poiseLv: 0, coinLv: 0, lastSeen: Date.now(), runs: 0, stage: 1, stars: {}, bestScore: 0, totemTip: false, muted: false,  /* v0.30: 난이도 모드 · 첫 경험 기록(저장 단위) · 접근성 · 같은 장 연패 · 수련 권유 기록 */
  mode: 'jeongseok', tutorialDone: 0, moments: {}, a11y: { colorblind: 0, shake: 0 }, streak: null, trainOffered: null,
  /* v0.31: 레벨업 방식(quick = 멈추지 않는 선택, pause = 멈추고 고르기) */
  levelMode: 'pause',
  /* v0.32: 도감 원료 — 잡은 보스와 받아친 패턴 */
  codex: { mon: {}, boss: {}, evo: {}, pat: {} } };
/* v0.33 메타 기본값(무구·유물·외형·붓 자국·도감·수련장·기록) — save.version 3 */
Object.assign(save, newSaveMeta());
const qa = { timeScale: 1, noDelay: false, sandbox: false, noMove: false };
/* ?nowarm=1: 타이틀 예열을 건너뛴다(약한 기기·QA용 탈출구). */
try { if (new URLSearchParams(location.search).get('nowarm') === '1') qa.skipWarm = true; } catch (e) {}
let S = null, art = null, three = null, raf = 0, lastTs = 0, toastT = 0;
const audio = createAudio();
let idlePending = 0;
const pointers = { down: false, id: null, pts: [] };
const fps = { samples: [], last: 0 };
let lastStroke = null, inkFade = 0;

const _rt = {
  get $() { return $; },
  get ACT_NAMES() { return ACT_NAMES; },
  get Anim() { return Anim; },
  get AutoQuality() { return AutoQuality; },
  get CFG() { return CFG; },
  get CHALLENGES() { return CHALLENGES; },
  get CLUB_IMPACT_TIME() { return CLUB_IMPACT_TIME; },
  get COSMETIC_CLOAKS() { return COSMETIC_CLOAKS; },
  get COSMETIC_TRAILS() { return COSMETIC_TRAILS; },
  get DPR_QUERY() { return DPR_QUERY; },
  get EVO_SLOTS() { return EVO_SLOTS; },
  get FXINK_BASE() { return FXINK_BASE; },
  get FX_COLORS() { return FX_COLORS; },
  get G() { return G; },
  get IS_MOBILE() { return IS_MOBILE; },
  get InkLightPool() { return InkLightPool; },
  get InkParticles() { return InkParticles; },
  get MODES() { return MODES; },
  get MODE_NOTE() { return MODE_NOTE; },
  get MODE_ORDER() { return MODE_ORDER; },
  get MON_CODE() { return MON_CODE; },
  get PAT_CODE() { return PAT_CODE; },
  get PAT_CUE() { return PAT_CUE; },
  get PERF_LOG() { return PERF_LOG; },
  get PIXEL_LOOK() { return PIXEL_LOOK; },
  get PaperFx() { return PaperFx; },
  get QA_CAM() { return QA_CAM; }, set QA_CAM(v) { QA_CAM = v; },
  get RELICS() { return RELICS; },
  get RUN_UPGRADES() { return RUN_UPGRADES; },
  get EVO_RECIPES() { return EVO_RECIPES; },
  get S() { return S; }, set S(v) { S = v; },
  get SAVE_KEY() { return SAVE_KEY; },
  get SAVE_VERSION() { return SAVE_VERSION; },
  get SHAPE_HINT() { return SHAPE_HINT; },
  get SHAPE_STYLE() { return SHAPE_STYLE; },
  get rollRunMissions() { return rollRunMissions; },
  get evalRunMissions() { return evalRunMissions; },
  get computeStyleKillPoints() { return computeStyleKillPoints; },
  get styleGradeOf() { return styleGradeOf; },
  get spawnFloater() { return spawnFloater; },
  get SHAPE_MARK() { return SHAPE_MARK; },
  get SHAPE_UNLOCK() { return SHAPE_UNLOCK; },
  get SPIRIT_GLYPH_PATHS() { return SPIRIT_GLYPH_PATHS; },
  get STAGES() { return STAGES; },
  get STAT_DEFS() { return STAT_DEFS; },
  get SWORDS() { return SWORDS; },
  get SimanShaderFx3D() { return SimanShaderFx3D; },
  get SimanVfx3D() { return SimanVfx3D; },
  get StageAtmosphere() { return StageAtmosphere; },
  get TERRAIN_CFG() { return TERRAIN_CFG; },
  get THREE() { return THREE; },
  get TOTEM_SHAPES() { return TOTEM_SHAPES; },
  get TraceField() { return TraceField; },
  get WF() { return WF; },
  get WF_POST() { return WF_POST; },
  get _atmoMask() { return _atmoMask; }, set _atmoMask(v) { _atmoMask = v; },
  get _frameId() { return _frameId; }, set _frameId(v) { _frameId = v; },
  get _heroCssX() { return _heroCssX; }, set _heroCssX(v) { _heroCssX = v; },
  get _proj() { return _proj; },
  get a11yCb() { return a11yCb; },
  get a11yShake() { return a11yShake; },
  get absorbAllItems() { return absorbAllItems; },
  get actOf() { return actOf; },
  get addCharge() { return addCharge; },
  get addEntityVisual() { return addEntityVisual; },
  get addHitstop() { return addHitstop; },
  get addSlow() { return addSlow; },
  get addSpirit() { return addSpirit; },
  get afterimages() { return afterimages; },
  get angDiff() { return angDiff; },
  get applyCameraLens() { return applyCameraLens; },
  get applyElement() { return applyElement; },
  get applyFxinkAtmo() { return applyFxinkAtmo; },
  get applyHeroCloak3D() { return applyHeroCloak3D; },
  get applyPath() { return applyPath; },
  get applyRingBoost() { return applyRingBoost; },
  get applySkin() { return applySkin; },
  get applyStageAtmo() { return applyStageAtmo; },
  get applyUpgrade() { return applyUpgrade; },
  get arenaActive() { return arenaActive; },
  get arenaR() { return arenaR; },
  get art() { return art; }, set art(v) { art = v; },
  get assignSpiritTargets() { return assignSpiritTargets; },
  get atkBonus() { return atkBonus; },
  get attachGroundInkShader() { return attachGroundInkShader; },
  get audio() { return audio; },
  get autoShare() { return autoShare; },
  get beginDash() { return beginDash; },
  get beginOnebell() { return beginOnebell; },
  get beginStage() { return beginStage; },
  get bellFootScreen() { return bellFootScreen; },
  get bellScreen() { return bellScreen; },
  get bellWorld() { return bellWorld; },
  get boltPeriod() { return boltPeriod; },
  get bossBudget() { return bossBudget; },
  get bossCfg() { return bossCfg; },
  get bossFx() { return bossFx; },
  get bossHasNewGimmick() { return bossHasNewGimmick; },
  get bossMinions() { return bossMinions; },
  get bossPat() { return bossPat; },
  get bossPatList() { return bossPatList; },
  get bossPhaseCheck() { return bossPhaseCheck; },
  get bossPoise() { return bossPoise; },
  get bossTiming() { return bossTiming; },
  get bossVisualOf() { return bossVisualOf; },
  get breakJar() { return breakJar; },
  get breakPillar() { return breakPillar; },
  get breakTotem() { return breakTotem; },
  get brushMark() { return brushMark; },
  get brushTex() { return brushTex; },
  get budgetTable() { return budgetTable; },
  get buildBossBannerInfo() { return buildBossBannerInfo; },
  get buildChunkData() { return buildChunkData; },
  get buildSealStake() { return buildSealStake; },
  get bumpDaily() { return bumpDaily; },
  get bumpStreak() { return bumpStreak; },
  get buy() { return buy; },
  get buyCosmetic() { return buyCosmetic; },
  get buyRelic() { return buyRelic; },
  get buySword() { return buySword; },
  get camDist() { return camDist; },
  get cardNameOfKey() { return cardNameOfKey; },
  get cardStats() { return cardStats; },
  get castCleave() { return castCleave; },
  get challengeOf() { return challengeOf; },
  get challengeProgress() { return challengeProgress; },
  get challengeRecord() { return challengeRecord; },
  get challengeUnlocked() { return challengeUnlocked; },
  get chantStroke() { return chantStroke; },
  get checkEvolutions() { return checkEvolutions; },
  get checkIdle() { return checkIdle; },
  get chunkOf() { return chunkOf; },
  get clamp() { return clamp; },
  get clampHeroToArena() { return clampHeroToArena; },
  get clampPointToArena() { return clampPointToArena; },
  get clashStroke() { return clashStroke; },
  get clearEntities() { return clearEntities; },
  get clearInk() { return clearInk; },
  get clearOnebell() { return clearOnebell; },
  get clearOrbitSpirits() { return clearOrbitSpirits; },
  get clipBound() { return clipBound; },
  get clipWorld() { return clipWorld; },
  get cloakOf() { return cloakOf; },
  get cloneHeld() { return cloneHeld; },
  get closeArena() { return closeArena; },
  get closeQuickCards() { return closeQuickCards; },
  get closeTrain() { return closeTrain; },
  get codexBonus() { return codexBonus; },
  get codexBoss() { return codexBoss; },
  get codexCounts() { return codexCounts; },
  get codexEvo() { return codexEvo; },
  get codexMon() { return codexMon; },
  get coinMult() { return coinMult; },
  get collectIdle() { return collectIdle; },
  get collectItem() { return collectItem; },
  get comboBreak() { return comboBreak; },
  get comboMul() { return comboMul; },
  get comboReward() { return comboReward; },
  get computeAtkBonus() { return computeAtkBonus; },
  get computeCombatPower() { return computeCombatPower; },
  get computeComboMul() { return computeComboMul; },
  get computeDashDmg() { return computeDashDmg; },
  get computeGapBonus() { return computeGapBonus; },
  get computeIdleCoins() { return computeIdleCoins; },
  get computeMaxHp() { return computeMaxHp; },
  get computePoiseBonus() { return computePoiseBonus; },
  get cosTab() { return cosTab; }, set cosTab(v) { cosTab = v; },
  get createChunkWorld() { return createChunkWorld; },
  get createCinematicPass() { return createCinematicPass; },
  get pulseImpactChroma() { return pulseImpactChroma; },
  get createDashLatencyTracker() { return createDashLatencyTracker; },
  get createDepthCapture() { return createDepthCapture; },
  get createInkSlash() { return createInkSlash; },
  get createInkWashPass() { return createInkWashPass; },
  get createInputQueue() { return createInputQueue; },
  get createPixelLookPass() { return createPixelLookPass; },
  get createRunState() { return createRunState; },
  get createSlashArc() { return createSlashArc; },
  get createTiltShiftPass() { return createTiltShiftPass; },
  get createWorldInkUniforms() { return createWorldInkUniforms; },
  get curElem() { return curElem; },
  get curMode() { return curMode; },
  get curStage() { return curStage; },
  get cutBoss() { return cutBoss; },
  get dashAtBoss() { return dashAtBoss; },
  get dashDmg() { return dashDmg; },
  get dashEndPoint() { return dashEndPoint; },
  get destroySpirit() { return destroySpirit; },
  get devBossNow() { return devBossNow; },
  get developerMode() { return developerMode; },
  get dioramaInfo() { return dioramaInfo; },
  get disposeCharGeom() { return disposeCharGeom; },
  get dist() { return dist; },
  get doParry() { return doParry; },
  get dofPassOf() { return dofPassOf; },
  get drawBossPat() { return drawBossPat; },
  get drawSightFog() { return drawSightFog; },
  get drawTutorial() { return drawTutorial; },
  get dropInkStep() { return dropInkStep; },
  get elemBurnDmg() { return elemBurnDmg; },
  get elemBurnDur() { return elemBurnDur; },
  get elemCloudR() { return elemCloudR; },
  get elemIceDur() { return elemIceDur; },
  get elemLv() { return elemLv; },
  get elemNameOf() { return elemNameOf; },
  get elemPoisonDmg() { return elemPoisonDmg; },
  get elemPoisonMax() { return elemPoisonMax; },
  get elemShatterDmg() { return elemShatterDmg; },
  get ellipseScreenAt() { return ellipseScreenAt; },
  get endBell() { return endBell; },
  get endBossSide() { return endBossSide; },
  get endOnebell() { return endOnebell; },
  get endRun() { return endRun; },
  get endShrink() { return endShrink; },
  get endTutorial() { return endTutorial; },
  get enqueueInputBuf() { return enqueueInputBuf; },
  get ensureLobbyHero3D() { return ensureLobbyHero3D; },
  get equipCosmetic() { return equipCosmetic; },
  get equipSword() { return equipSword; },
  get equippedRelics() { return equippedRelics; },
  get evoHints() { return evoHints; },
  get evoHintsFor() { return evoHintsFor; },
  get evoMatInfo() { return evoMatInfo; },
  get evoMatInfoFor() { return evoMatInfoFor; },
  get evoPartsOf() { return evoPartsOf; },
  get failHint() { return failHint; },
  get figurePoseInfo() { return figurePoseInfo; },
  get fillStageIntro() { return fillStageIntro; },
  get finishStroke() { return finishStroke; },
  get fireImpact() { return fireImpact; },
  get fireLanding() { return fireLanding; },
  get fireWave() { return fireWave; },
  get firecrackerBurst() { return firecrackerBurst; },
  get fitShadowFrustum() { return fitShadowFrustum; },
  get floorStatus() { return floorStatus; },
  get focusDistance() { return focusDistance; },
  get foldPop() { return foldPop; },
  get forgeCostOf() { return forgeCostOf; },
  get fps() { return fps; },
  get fpsReport() { return fpsReport; },
  get frameDt() { return frameDt; }, set frameDt(v) { frameDt = v; },
  get frostImpact() { return frostImpact; },
  get frostLanding() { return frostLanding; },
  get fxQ() { return fxQ; }, set fxQ(v) { fxQ = v; },
  get fxQForced() { return fxQForced; },
  get fxQualityFromUrl() { return fxQualityFromUrl; },
  get fxSheetInfo() { return fxSheetInfo; },
  get fxinkStat() { return fxinkStat; },
  get gainXp() { return gainXp; },
  get gapBonus() { return gapBonus; },
  get gapInfo() { return gapInfo; },
  get getActPhaseFx() { return getActPhaseFx; },
  get getActSkillNames() { return getActSkillNames; },
  get getIdleNotice() { return getIdleNotice; },
  get goStageNow() { return goStageNow; },
  get goalOnKill() { return goalOnKill; },
  get goalOnStroke() { return goalOnStroke; },
  get goalPass() { return goalPass; },
  get goalWindowOn() { return goalWindowOn; },
  get goldShotMaterial() { return goldShotMaterial; },
  get gosuUnlocked() { return gosuUnlocked; },
  get groundYAt() { return groundYAt; },
  get guideUntil() { return guideUntil; }, set guideUntil(v) { guideUntil = v; },
  get haptic() { return haptic; },
  get hazardGeo() { return hazardGeo; },
  get hazardPool() { return hazardPool; },
  get heroHurt() { return heroHurt; },
  get heroHurtForce() { return heroHurtForce; },
  get heroScreen() { return heroScreen; },
  get hideGuide() { return hideGuide; },
  get hideOvs() { return hideOvs; },
  get hudCtrl() { return hudCtrl; },
  get hurtZombie() { return hurtZombie; },
  get idleCoins() { return idleCoins; },
  get idlePending() { return idlePending; }, set idlePending(v) { idlePending = v; },
  get incomingParryThreat() { return incomingParryThreat; },
  get initChallenge() { return initChallenge; },
  get initGoal() { return initGoal; },
  get initOverlayShell() { return initOverlayShell; },
  get inkColorFor() { return inkColorFor; },
  get inkFade() { return inkFade; }, set inkFade(v) { inkFade = v; },
  get inkFx() { return inkFx; },
  get invalidateViewBox() { return invalidateViewBox; },
  get isElemKey() { return isElemKey; },
  get isOnScreen() { return isOnScreen; },
  get kiaiTap() { return kiaiTap; },
  get kiaiWin() { return kiaiWin; },
  get killZombie() { return killZombie; },
  get landDash() { return landDash; },
  get landingShock() { return landingShock; },
  get lastMarkMetrics() { return lastMarkMetrics; }, set lastMarkMetrics(v) { lastMarkMetrics = v; },
  get lastStroke() { return lastStroke; }, set lastStroke(v) { lastStroke = v; },
  get lastTs() { return lastTs; }, set lastTs(v) { lastTs = v; },
  get livingMarks() { return livingMarks; },
  get loadSave() { return loadSave; },
  get loop() { return loop; },
  get magnetPull() { return magnetPull; },
  get makeBossGlb() { return makeBossGlb; },
  get makeBossSlash() { return makeBossSlash; },
  get makeGroundLayer() { return makeGroundLayer; },
  get makePillarObj() { return makePillarObj; },
  get makeReflectMesh() { return makeReflectMesh; },
  get makeSlash() { return makeSlash; },
  get makeTotemObj() { return makeTotemObj; },
  get mapIdOf() { return mapIdOf; },
  get markSeen() { return markSeen; },
  get materialVariants() { return materialVariants; },
  get maxHp() { return maxHp; },
  get maybeEnd() { return maybeEnd; },
  get migrateMetaV4() { return migrateMetaV4; },
  get mirrorSave() { return mirrorSave; },
  get modeCoin() { return modeCoin; },
  get modeDmg() { return modeDmg; },
  get modeOf() { return modeOf; },
  get modeSpd() { return modeSpd; },
  get nearestTo() { return nearestTo; },
  get newSaveMeta() { return newSaveMeta; },
  get nightColor() { return nightColor; },
  get noteHit() { return noteHit; },
  get notePatSeen() { return notePatSeen; },
  get now() { return now; },
  get onDashPath() { return onDashPath; },
  get onDown() { return onDown; },
  get onLand() { return onLand; },
  get onMove() { return onMove; },
  get onResize() { return onResize; },
  get onTick() { return onTick; },
  get onUp() { return onUp; },
  get onebell() { return onebell; },
  get onebellSlash() { return onebellSlash; },
  get openLevelUp() { return openLevelUp; },
  get openTrain() { return openTrain; },
  get otherShape() { return otherShape; },
  get paintCard() { return paintCard; },
  get paintFrame() { return paintFrame; },
  get paintInk() { return paintInk; },
  get paintSkill() { return paintSkill; },
  get palColor() { return palColor; },
  get palHex() { return palHex; },
  get paperPropCanvas() { return paperPropCanvas; },
  get pathR() { return pathR; },
  get pauseRun() { return pauseRun; },
  get worldReady() { return worldReady; },
  get bootComplete() { return GPv2.ready === true; },
  get pendingStage() { return pendingStage; }, set pendingStage(v) { pendingStage = v; },
  get perfMark() { return perfMark; },
  get persist() { return persist; },
  get pickAffordableStatUpgrade() { return pickAffordableStatUpgrade; },
  get pickBossOrbitShapes() { return pickBossOrbitShapes; },
  get pickQuick() { return pickQuick; },
  get pickRecommendedId() { return pickRecommendedId; },
  get pickSeq() { return pickSeq; },
  get pickSpirits() { return pickSpirits; },
  get pickUpgrade() { return pickUpgrade; },
  get pickZoneSpiritShape() { return pickZoneSpiritShape; },
  get placeGroup() { return placeGroup; },
  get placeSpirit() { return placeSpirit; },
  get pointers() { return pointers; },
  get poiseBonus() { return poiseBonus; },
  get popClone() { return popClone; },
  get prebakeGroundStage() { return prebakeGroundStage; },
  get preciseTarget() { return preciseTarget; },
  get preloadMonsterGlb() { return preloadMonsterGlb; },
  get previewStageWorld() { return previewStageWorld; },
  get prewarmInkSlash() { return prewarmInkSlash; },
  get prewarmRecipes() { return prewarmRecipes; },
  get projectXZ() { return projectXZ; },
  get purchaseStatUpgrade() { return purchaseStatUpgrade; },
  get qa() { return qa; },
  get qaFadeColor() { return qaFadeColor; }, set qaFadeColor(v) { qaFadeColor = v; },
  get qaFadeMat() { return qaFadeMat; }, set qaFadeMat(v) { qaFadeMat = v; },
  get qaFadePostK() { return qaFadePostK; }, set qaFadePostK(v) { qaFadePostK = v; },
  get queueEcho() { return queueEcho; },
  get quitRun() { return quitRun; },
  get raf() { return raf; }, set raf(v) { raf = v; },
  get rebuildTerrain3D() { return rebuildTerrain3D; },
  get recommendedPick() { return recommendedPick; },
  get reducedMotion() { return reducedMotion; },
  get reflectGoldShots() { return reflectGoldShots; },
  get reflectReady() { return reflectReady; },
  get refreshBossGlyphs() { return refreshBossGlyphs; },
  get refreshElemSlots() { return refreshElemSlots; },
  get refreshRingPoly() { return refreshRingPoly; },
  get refreshShop() { return refreshShop; },
  get refreshSpirits() { return refreshSpirits; },
  get refreshTitleHelp() { return refreshTitleHelp; },
  get releaseShotMesh() { return releaseShotMesh; },
  get relicDmgAdd() { return relicDmgAdd; },
  get relicOn() { return relicOn; },
  get relicSlots() { return relicSlots; },
  get renderChallenges() { return renderChallenges; },
  get renderCodex() { return renderCodex; },
  get renderCosmeticOverlay() { return renderCosmeticOverlay; },
  get renderCosmeticView() { return renderCosmeticView; },
  get renderDailyOverlay() { return renderDailyOverlay; },
  get renderGoalHud() { return renderGoalHud; },
  get _goalCtrl() { return _goalCtrl; },
  get trainFinish() { return trainFinish; },
  get renderHud() { return renderHud; },
  get renderModes() { return renderModes; },
  get renderShopOverview() { return renderShopOverview; },
  get renderShopTab() { return renderShopTab; },
  get renderShopTabView() { return renderShopTabView; },
  get renderStageSelect() { return renderStageSelect; },
  get renderTrainDrills() { return renderTrainDrills; },
  get renderVulnBadge() { return renderVulnBadge; },
  get resetAllStats() { return resetAllStats; },
  get resetRunStateOnQuit() { return resetRunStateOnQuit; },
  get resizeInk() { return resizeInk; },
  get resolveDash() { return resolveDash; },
  get resolvePropCollision() { return resolvePropCollision; },
  get resolveTieAxis() { return resolveTieAxis; },
  get resumeRun() { return resumeRun; },
  get revealBoss() { return revealBoss; },
  get rhythmTap() { return rhythmTap; },
  get rimErrorPx() { return rimErrorPx; },
  get ringR() { return ringR; },
  get ringScreenPts() { return ringScreenPts; },
  get ringSpiritBell() { return ringSpiritBell; },
  get rollUpgradePicks() { return rollUpgradePicks; },
  get runLimit() { return runLimit; },
  get save() { return save; },
  get scoreDash() { return scoreDash; },
  get screenAngleTo() { return screenAngleTo; },
  get screenOf() { return screenOf; },
  get screenRingPx() { return screenRingPx; },
  get sealPaper() { return sealPaper; },
  get sealStroke() { return sealStroke; },
  get secondScore() { return secondScore; },
  get seen() { return seen; },
  get segDist() { return segDist; },
  get setA11y() { return setA11y; },
  get setChapterArt() { return setChapterArt; },
  get setDashElem() { return setDashElem; },
  get setDrawingActive() { return setDrawingActive; },
  get setLevelMode() { return setLevelMode; },
  get setMode() { return setMode; },
  get setMuted() { return setMuted; },
  get setSpiritCount() { return setSpiritCount; },
  get setupBloom() { return setupBloom; },
  get shadersWarmed() { return shadersWarmed; },
  get shopTab() { return shopTab; }, set shopTab(v) { shopTab = v; },
  get shotGeo() { return shotGeo; },
  get shotMaterial() { return shotMaterial; },
  get shotPool() { return shotPool; },
  get showBossCard() { return showBossCard; },
  get showGuide() { return showGuide; },
  get showJudge() { return showJudge; },
  get showOv() { return showOv; },
  get skinOf() { return skinOf; },
  get slowMulOf() { return slowMulOf; },
  get snapSpiritsToTargets() { return snapSpiritsToTargets; },
  get spawnBoss() { return spawnBoss; },
  get spawnEliteEvent() { return spawnEliteEvent; },
  get spawnHazard() { return spawnHazard; },
  get spawnItem() { return spawnItem; },
  get spawnPool() { return spawnPool; },
  get spawnShot() { return spawnShot; },
  get spawnSpirit() { return spawnSpirit; },
  get spawnZombie() { return spawnZombie; },
  get spiritShape() { return spiritShape; },
  get stageOf() { return stageOf; },
  get stageRecommendedPower() { return stageRecommendedPower; },
  get stageWaves() { return stageWaves; },
  get stampSkill() { return stampSkill; },
  get star3Info() { return star3Info; },
  get starCap() { return starCap; },
  get starsFor() { return starsFor; },
  get startBell() { return startBell; },
  get startBossPattern() { return startBossPattern; },
  get startChallenge() { return startChallenge; },
  get startRun() { return startRun; },
  get startSeal() { return startSeal; },
  get startSeg() { return startSeg; },
  get startTutorial() { return startTutorial; },
  get statUpgradeCost() { return statUpgradeCost; },
  get step() { return step; },
  get stepArena() { return stepArena; },
  get stepBolt() { return stepBolt; },
  get stepBolts() { return stepBolts; },
  get stepBoss() { return stepBoss; },
  get stepBossSummons() { return stepBossSummons; },
  get stepDash() { return stepDash; },
  get stepDying() { return stepDying; },
  get stepEchoes() { return stepEchoes; },
  get stepEnemySpecial() { return stepEnemySpecial; },
  get stepGapBuffer() { return stepGapBuffer; },
  get stepHazards() { return stepHazards; },
  get stepInkSteps() { return stepInkSteps; },
  get stepQuality() { return stepQuality; },
  get stepReflects() { return stepReflects; },
  get stepShots() { return stepShots; },
  get stepShrink() { return stepShrink; },
  get stepSpirits() { return stepSpirits; },
  get stepTutorial() { return stepTutorial; },
  get stepWard() { return stepWard; },
  get stopCodex3d() { return stopCodex3d; },
  get streakOf() { return streakOf; },
  get strokeAimDir() { return strokeAimDir; },
  get strokeScreenDir() { return strokeScreenDir; },
  get strokeType() { return strokeType; },
  get summonDodgeTarget() { return summonDodgeTarget; },
  get switchMap() { return switchMap; },
  get swordForgeLv() { return swordForgeLv; },
  get swordFx() { return swordFx; },
  get swordOf() { return swordOf; },
  get syncA11yUi() { return syncA11yUi; },
  get syncBossOrbitSpirits() { return syncBossOrbitSpirits; },
  get syncGroundEffects() { return syncGroundEffects; },
  get syncHeroCosmetic3D() { return syncHeroCosmetic3D; },
  get syncHeroWeaponCosmetic() { return syncHeroWeaponCosmetic; },
  get syncLobby3dStyle() { return syncLobby3dStyle; },
  get syncLobbyStatus() { return syncLobbyStatus; },
  get syncSceneActTheme3D() { return syncSceneActTheme3D; },
  get tHash() { return tHash; },
  get tPatchesNear() { return tPatchesNear; },
  get tRootAt() { return tRootAt; },
  get tWaterAt() { return tWaterAt; },
  get tWaterCenter() { return tWaterCenter; },
  get tcount() { return tcount; },
  get teleMul() { return teleMul; },
  get telemetry() { return telemetry; },
  get terrainCoinMul() { return terrainCoinMul; },
  get terrainDashingBlocked() { return terrainDashingBlocked; },
  get terrainInit() { return terrainInit; },
  get terrainSlowMul() { return terrainSlowMul; },
  get terrainSpeedMul() { return terrainSpeedMul; },
  get three() { return three; }, set three(v) { three = v; },
  get tickFolds() { return tickFolds; },
  get tickGoal() { return tickGoal; },
  get tickQuick() { return tickQuick; },
  get tickStatuses() { return tickStatuses; },
  get tickTutorial() { return tickTutorial; },
  get tintZombie() { return tintZombie; },
  get titleSel() { return titleSel; }, set titleSel(v) { titleSel = v; },
  get toast() { return toast; },
  get toastT() { return toastT; }, set toastT(v) { toastT = v; },
  get toggleRelic() { return toggleRelic; },
  get totemPool() { return totemPool; },
  get trailMaterial() { return trailMaterial; },
  get trailOf() { return trailOf; },
  get train() { return train; },
  get trainStatsOf() { return trainStatsOf; },
  get triggerCinematic() { return triggerCinematic; },
  get triggerGroundCrackHeat() { return triggerGroundCrackHeat; },
  get triggerSightWave() { return triggerSightWave; },
  get tutorialFirstSuccess() { return tutorialFirstSuccess; },
  get uiRouter() { return uiRouter; },
  get unlockedMax() { return unlockedMax; },
  get unlockedShapes() { return unlockedShapes; },
  get unprojectToY() { return unprojectToY; },
  get upCardLevelText() { return upCardLevelText; },
  get upDesc() { return upDesc; },
  get upLv() { return upLv; },
  get upcomingRun() { return upcomingRun; },
  get updateCam() { return updateCam; },
  get updateMarks() { return updateMarks; },
  get updateRetentionBadge() { return updateRetentionBadge; },
  get updateWorldFade() { return updateWorldFade; },
  get veilStroke() { return veilStroke; },
  get viewBox() { return viewBox; },
  get viewSpanFor() { return viewSpanFor; },
  get wardInfo() { return wardInfo; },
  get warmInfo() { return warmInfo; },
  get warmScene() { return warmScene; },
  get warmShaders() { return warmShaders; },
  get wireFadeSource() { return wireFadeSource; },
  get wireShopTabs() { return wireShopTabs; },
  get wireTrain() { return wireTrain; },
  get worldBounds() { return worldBounds; },
  get worldPerCss() { return worldPerCss; },
  get xpNeed() { return xpNeed; },
  get zoneAt() { return zoneAt; },
};
const { atkBonus, coinMult, comboMul, dashDmg, gapBonus, hideGuide, hideOvs, loadSave, mapIdOf, maxHp, nightColor, pathR, pauseRun, persist, poiseBonus, quitRun, renderHud, renderVulnBadge, resumeRun, setMuted, showGuide, showOv, toast, xpNeed } = createSaveHud(_rt);
const { DPR_QUERY, WF_POST, addEntityVisual, disposeCharGeom, dofPassOf, fitShadowFrustum, groundYAt, makeWorld, placeGroup, setupChunkWorld, stepQuality, switchMap, wireFadeSource } = createWorld3d(_rt);
const { SWORD_GLOW_MAP, a11yCb, a11yShake, addSlow, bumpStreak, drawTutorial, endTutorial, haptic, markSeen, reducedMotion, renderModes, seen, setA11y, setLevelMode, setMode, startTutorial, stepTutorial, streakOf, syncA11yUi, syncHeroWeaponCosmetic, tickTutorial, tutorialFirstSuccess } = createTutorialSys(_rt);
const { absorbAllItems, addSpirit, angDiff, applyRingBoost, assignSpiritTargets, beginStage, bellFootScreen, bellScreen, bellWorld, breakJar, clearEntities, closeArena, curElem, elemBurnDmg, elemBurnDur, elemCloudR, elemIceDur, elemLv, elemNameOf, elemPoisonDmg, elemPoisonMax, elemShatterDmg, ellipseScreenAt, endBell, fillStageIntro, fireImpact, firecrackerBurst, frostImpact, goStageNow, heroScreen, invalidateViewBox, isOnScreen, livingMarks, onebell, pickSeq, pickSpirits, placeSpirit, previewStageWorld, prewarmRecipes, projectXZ, refreshElemSlots, refreshRingPoly, refreshSpirits, refreshTitleHelp, renderStageSelect, rimErrorPx, ringR, ringScreenPts, screenAngleTo, screenOf, screenRingPx, segDist, setChapterArt, setDashElem, setSpiritCount, snapSpiritsToTargets, spawnBoss, spawnItem, spawnPool, spawnSpirit, spawnZombie, spiritShape, startBell, startRun, stepArena, stepSpirits, strokeAimDir, strokeScreenDir, titleChip, titlePrewarm, triggerCinematic, unlockedMax, unlockedShapes, unprojectToY, upcomingRun, viewBox, warmShaders, worldPerCss } = createStageFlow(_rt);
const { _proj, beginDash, beginOnebell, brushMark, clampHeroToArena, clampPointToArena, clearOnebell, clipBound, clipWorld, comboBreak, comboReward, consumeInputBuf, dashEndPoint, endOnebell, enqueueInputBuf, failHint, inkColorFor, landDash, landingShock, loadMarkImages, onebellSlash, resolveDash, resolvePropCollision, ringSpiritBell, scoreDash, secondScore, showJudge, spawnFloater, stampSkill, startSeg, syncGroundEffects, triggerSightWave, updateMarks, worldBounds } = createOverlay2d(_rt);
const { addCharge, addHitstop, afterimages, applyElement, applyPath, applyUpgrade, autoShare, boltPeriod, bossTiming, cardNameOf, castCleave, checkEvolutions, closeQuickCards, collectItem, cutBoss, destroySpirit, doParry, dropInkStep, evoHints, evoMatInfo, fireLanding, fireWave, frostLanding, gainXp, gapInfo, hurtZombie, incomingParryThreat, killZombie, magnetPull, makeBossSlash, makeSlash, openLevelUp, otherShape, pickQuick, pickUpgrade, preciseTarget, queueEcho, recommendedPick, slowMulOf, spawnEliteEvent, stepBolt, stepBolts, stepDying, stepEchoes, stepInkSteps, stepWard, tickQuick, tickStatuses, tintZombie, triggerGroundCrackHeat, upCardLevelText, upDesc, upLv, wardInfo } = createCombatEngine(_rt);
const { applySkin, bossCfg, bossHasNewGimmick, bossMinions, bossPat, bossPatList, bossPhaseCheck, bossPoise, bossVisualOf, breakPillar, breakTotem, chantStroke, clashStroke, clearOrbitSpirits, cloneHeld, codexBoss, codexEvo, codexMon, dashAtBoss, drawBossPat, endBossSide, endShrink, goldShotMaterial, hazardGeo, hazardPool, heroHurt, heroHurtForce, kiaiTap, kiaiWin, makePillarObj, makeReflectMesh, makeTotemObj, maybeEnd, mirrorSave, noteHit, notePatSeen, popClone, reflectGoldShots, reflectReady, refreshBossGlyphs, releaseShotMesh, relicDmgAdd, revealBoss, rhythmTap, sealStroke, shotGeo, shotMaterial, shotPool, showBossCard, spawnHazard, spawnShot, startBossPattern, startSeal, stepBoss, stepBossSummons, stepEnemySpecial, stepHazards, stepReflects, stepShots, stepShrink, summonDodgeTarget, syncBossOrbitSpirits, totemPool, trailMaterial, veilStroke } = createBossEngine(_rt);
/* 별점 (v0.32 §7.4): 클리어 1 + (체력 50% 이상 **또는** 피격 3회 이하) 1 + 도전 과제 1.
   정점 장(4·8·12)의 세 번째 별은 패턴 공략, 나머지 장은 콤보(0.8배) 또는 지형 도전. 수련 모드는 2개까지(§7.2). */
function star3Info(st) { return computeStar3Info(st, S, CFG); }
function starsFor(win) { return computeStarsFor(win, S, CFG, maxHp(), starCap()); }
const { endRun, step, stepDash, updateCam } = createRunLoop(_rt);
const { buy, checkIdle, clearInk, collectIdle, doResetStats, ensureLobbyHero3D, finishStroke, idleCoins, onDown, onMove, onUp, paintInk, pickAffordableStatUpgrade, refreshShop, resizeInk, resolveTieAxis, setDrawingActive, stepGapBuffer, strokeType, syncHeroCosmetic3D, syncLobbyStatus, syntheticPath } = createStrokeInput(_rt);
const _challengeCtrl = createChallengeController({
  getState: function () { return S; },
  getSave: function () { return save; },
  persist: function () { persist(); },
  cfg: CFG,
  shapeUnlock: SHAPE_UNLOCK,
  elById: $,
  challengeUnlocked: challengeUnlocked,
  challengeRecord: challengeRecord,
  curMode: curMode,
  spawnBoss: function (o) { return spawnBoss(o); },
  closeArena: (...a) => closeArena(...a),
  gainXp: (...a) => gainXp(...a),
  xpNeed: (...a) => xpNeed(...a),
  openLevelUp: (...a) => openLevelUp(...a),
  endRun: (...a) => endRun(...a),
  startRun: (...a) => startRun(...a),
  showBossCard: (...a) => showBossCard(...a),
  toast: (...a) => toast(...a),
  telemetry: telemetry
});
function initChallenge(id, stageNo) { return _challengeCtrl.initChallenge(id, stageNo); }
function challengeProgress() { return _challengeCtrl.challengeProgress(); }
function endlessBoss() { return _challengeCtrl.endlessBoss(); }
function spawnRushBoss() { return _challengeCtrl.spawnRushBoss(); }
function startChallenge(id) { return _challengeCtrl.startChallenge(id); }
function renderChallenges() { return _challengeCtrl.renderChallenges(); }
let shopTab = 'stat';
let cosTab = 'cloak';
const { buyCosmetic, buyRelic, buySword, equipCosmetic, equipSword, renderCosmeticOverlay, renderShopTab, toggleRelic } = createShopLogic(_rt);
function ensureDailyFresh() { ensureDailyFreshState(save, todayKey()); }
function bumpDaily(qid, delta) { bumpDailyProgress(save, todayKey(), qid, delta); }
function actStarTotal(actNo) { return actStarTotalOf(save, actNo); }
function hasClaimableRetention() { return hasClaimableRetentionOf(save, todayKey()); }
function updateRetentionBadge() {
  const dot = $('dailyDot');
  if (dot) dot.hidden = !hasClaimableRetention();
}
function claimAttendance() {
  const res = claimAttendanceReward(save, todayKey());
  if (!res) return false;
  persist(); renderDailyOverlay(); renderHud(); updateRetentionBadge();
  toast(res.day + '일차 출석 완료 — ' + res.reward.label + ' 획득!');
  return true;
}
function claimDailyQuest(qid) {
  const q = claimDailyQuestReward(save, todayKey(), qid);
  if (!q) return false;
  persist(); renderDailyOverlay(); renderHud(); updateRetentionBadge();
  toast(q.name + ' 보상: +' + q.coins + '엽전 · 먹묵 +' + q.ink);
  return true;
}
function claimStarChest(actNo, reqStars) {
  const ch = claimStarChestReward(save, todayKey(), actNo, reqStars);
  if (!ch) return false;
  persist(); renderDailyOverlay(); renderHud(); updateRetentionBadge();
  toast('제' + actNo + '막 ' + reqStars + '별 상자: +' + ch.coins + '엽전 · 먹묵 +' + ch.ink);
  return true;
}
function claimCodexMilestone(pct) {
  const ms = claimCodexMilestoneReward(save, todayKey(), pct, codexTotalPct(save));
  if (!ms) return false;
  persist(); renderCodex(); renderHud();
  toast('도감 ' + pct + '% 달성 보상: +' + ms.coins + '엽전 · 먹묵 +' + ms.ink);
  return true;
}
function renderDailyOverlay() {
  renderDailyView({
    save: save,
    dateKey: todayKey(),
    coinsEl: $('dailyCoins'),
    inkEl: $('dailyInk'),
    bodyEl: $('dailyBody'),
    onClaimAttendance: claimAttendance,
    onClaimQuest: claimDailyQuest,
    onClaimChest: claimStarChest
  });
}
function wireShopTabs() {
  const tabs = $('shopTabs');
  if (tabs) {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { shopTab = b.getAttribute('data-tab'); renderShopTab(); });
    });
  }
  const ctabs = $('cosTabs');
  if (ctabs) {
    Array.prototype.forEach.call(ctabs.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { cosTab = b.getAttribute('data-ctab'); renderCosmeticOverlay(); });
    });
  }
  if ($('btnStatReset')) $('btnStatReset').addEventListener('click', function () { doResetStats(); });
}

/* §9.3 도감 화면: 귀물 8 · 보스 12 · 진화 10 · 패턴 9칸 */
function renderCodex() {
  ensureDailyFresh();
  if (!renderCodex._tab) renderCodex._tab = '3d';
  renderCodexView({
    save: save,
    bodyEl: $('codexBody'),
    bonusEl: $('codexBonus'),
    milestonesEl: $('codexMilestones'),
    tab: renderCodex._tab,
    onTabChange: function (next) { renderCodex._tab = next; renderCodex(); },
    counts: codexCounts(save),
    bonusPct: Math.round(codexBonus(save) * 100),
    totalPct: codexTotalPct(save),
    evoSlots: EVO_SLOTS,
    patSlots: PAT_SLOTS,
    monCode: MON_CODE,
    patCue: PAT_CUE,
    isBasePat: isBasePat,
    cardNameOf: cardNameOf,
    onClaimMilestone: claimCodexMilestone,
    startCodex3d: startCodex3d,
    playCodexAnim3d: playCodexAnim3d,
    stopCodex3d: stopCodex3d
  });
}

/* §8.3 무늬 수련장 · 기믹/패링 드릴 컨트롤러 (modules/trainView.js 위임) */
const _trainCtrl = createTrainController({
  elById: $,
  getSave: function () { return save; },
  persist: function () { persist(); },
  getG: function () { return G; },
  titleChip: (...a) => titleChip(...a),
  syntheticPath: (...a) => syntheticPath(...a),
  brushOf: brushOf,
  showOv: (...a) => showOv(...a),
  hideOvs: (...a) => hideOvs(...a),
  getAudio: function () { return audio; },
  haptic: (...a) => haptic(...a),
  telemetry: telemetry
});
const train = _trainCtrl.train;
function renderTrainDrills() { return _trainCtrl.renderTrainDrills(); }
function trainStatsOf(shape) { return (save.train && save.train.stats && save.train.stats[shape]) ? (function(a){ const l=a.slice(-20),h=l.filter(Boolean).length; return {n:l.length,hit:h,rate:l.length?h/l.length:0}; })(save.train.stats[shape]) : {n:0,hit:0,rate:0}; }
function renderTrainShapes() { return _trainCtrl.renderTrainShapes(); }
function openTrain() { return _trainCtrl.openTrain(); }
function closeTrain() { return _trainCtrl.closeTrain(); }
function wireTrain() { return _trainCtrl.wireTrain(); }
function trainFinish() { return _trainCtrl.trainFinish(); }

const { bindUi, guardEvents } = createUiBindings(_rt);
const { applyCameraLens, applyFxinkAtmo, applyStageAtmo, camDist, drawSightFog, fpsReport, loop, onResize, viewSpanFor } = createMainLoop(_rt);
async function boot() {
  const _tBoot = performance.now();
  loadSave();
  const idled = checkIdle();
  qa.mute = !!save.muted;
  try {
    guardEvents();
    bindUi();
    renderHud();
    refreshTitleHelp();
    renderModes();
    syncA11yUi();
  } catch (e) { console.warn('[심안] 초기 UI 바인딩 경고:', e); }
  /* v0.49 빠른 콜드 스타트: v0.45~v0.48은 3D 관절 뼈대를 기본 사용하므로,
     구형 2D 포즈 시트(preloadFigures)가 타이틀 진입을 최대 6초 막지 않도록 비동기 지연 로딩으로 전환한다.
     (?hero2d / ?mon2d 명시 시에만 동기 대기) */
  let need2d = false;
  try {
    const qs = new URLSearchParams(location.search);
    need2d = qs.has('hero2d') || qs.has('mon2d');
  } catch (e) {}
  if (need2d) {
    try {
      await Promise.race([
        preloadFigures().catch(function () { return null; }),
        new Promise(function (res) { setTimeout(res, 2500); })
      ]);
    } catch (e) {}
  }
  try { await probeAssets(); } catch (e) { console.warn('[심안] 에셋 탐색 경고:', e); }
  try { art = await buildArt(THREE); } catch (e) { console.warn('[심안] 아트 빌드 경고:', e); }
  try { three = await makeWorld(); } catch (e) { console.error('[심안] 3D 월드 초기화 실패:', e); three = null; }
  if (three && three.scene) {
    bossFx.attachScene(THREE, three.scene);
    try { if (art && art.setCamera) art.setCamera(three.camera, three.renderer); } catch (e) {}
    setupChunkWorld((three.map && three.map.stageId) || 1, (three.map && three.map.id) || 'map1');
    applyFxinkAtmo((three.map && three.map.id) || 'map1');
    applyStageAtmo(stageOf(titleSel || save.stage || 1));
    previewStageWorld(titleSel || save.stage || 1);
  }
  ensureLobbyHero3D();
  loadMarkImages();
  resizeInk();
  onResize();
  renderHud();
  refreshTitleHelp();
  renderModes();
  syncA11yUi();
  if (!idled && !document.querySelector('.ov.show')) showOv('ov-title');
  /* An unclaimed idle reward keeps the old lastSeen, so a refresh does not lose it. */
  persist(!idled);
  /* v0.35/v0.49: 타이틀이 즉시 조작 가능해진 뒤 백그라운드로 예열·디오라마 프리로드 수행 */
  try { titlePrewarm(); } catch (e) {}
  try {
    if (!heroGlbReady()) {
      const playBtn = $('btnStart');
      const origTxt = playBtn ? playBtn.textContent : null;
      if (playBtn && origTxt) playBtn.setAttribute('data-orig-label', origTxt);
      const hp = preloadHeroGlb();
      if (playBtn && hp && !heroGlbReady()) {
        playBtn.textContent = '3D 검객 준비 중...';
        Promise.resolve(hp).finally(function () {
          if (playBtn.getAttribute('data-orig-label')) playBtn.textContent = playBtn.getAttribute('data-orig-label');
        });
      }
    }
  } catch (e) {}
  if (need2d || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('arena') === '0')) { setTimeout(function () {
    try { preloadDiorama(); } catch (e) {}
    if (need2d) { try { preloadFigures().catch(function () {}); } catch (e) {} }
  }, 800); }
  if (!raf) loop(now());
  window.GPv2.ready = true;
  window.GPv2.assetsUsed = art ? art.used : null;
  perfMark('boot_ready', performance.now() - _tBoot, { need2d: need2d });
}

const GPv2 = createQaBridge(_rt);
window.GPv2 = GPv2;
const worldReady = boot();

/* v0.85 보스·중갑·석상 무기 스윙/내려찍기 임팩트 프레임 동기화 & 로비 실시간 3D 미리보기 */
if (typeof window !== 'undefined') {
  window.__simanOnWeaponSwing = function (species, kind) {
    if (audio && audio.heavySweep && (/^boss/.test(species) || species === 'heavy')) audio.heavySweep();
  };
  window.__simanOnWeaponImpact = function (species, kind, x, z) {
    const heavyHit = (kind === 'slam' || species === 'stone' || species === 'heavy');
    if (!heavyHit) return;
    if (audio && audio.heavySlam) audio.heavySlam();
    if (S) S.shake = Math.max(S.shake || 0, /^boss/.test(species) ? 0.24 : 0.14);
    try { triggerGroundCrackHeat(x, z, /^boss/.test(species) ? 3.8 : 2.6, /^boss/.test(species) ? 0xff7040 : 0xd4c2a0); } catch (_) {}
    if (art && art.playFx && three && three.scene) {
      const fx = art.playFx(three.scene, 'ink-splat', x, z, /^boss/.test(species) ? 2.6 : 1.8);
      if (fx) three.fx.push(fx);
    }
  };
  (function initLobby3dToggle() {
    const btn = document.getElementById('btnLobby3d');
    const cv = document.getElementById('lobby3dCanvas');
    const img = document.getElementById('lobbyHeroImg');
    if (!btn || !cv || !img) return;
    let on = false;
    function getCurStyle() {
      const ck = cloakOf ? cloakOf(save) : null;
      const flv = swordForgeLv ? swordForgeLv(save) : 0;
      const prof = ck ? { tint: ck.tint != null ? ck.tint : 0xffffff, emissive: ck.emissive || 0, mix: ck.mix || 0, rimCol: ck.rimCol || 0xffe4ad } : { tint: 0xffffff, mix: 0 };
      const sw = swordOf ? swordOf(save) : null;
      const swHex = sw ? (SWORD_GLOW_MAP[sw.id] != null ? SWORD_GLOW_MAP[sw.id] : null) : null;
      return { prof: prof, flv: flv, swHex: swHex };
    }
    btn.addEventListener('click', function () {
      on = !on;
      if (on) {
        cv.hidden = false;
        img.style.opacity = '0';
        btn.textContent = '일러스트';
        const st = getCurStyle();
        startLobby3d(cv, st.prof, st.flv);
      } else {
        stopLobby3d();
        cv.hidden = true;
        img.style.opacity = '';
        btn.textContent = '3D 보기';
      }
    });
    const titleEl = document.getElementById('title');
    if (titleEl && typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        if (titleEl.hidden || titleEl.style.display === 'none') {
          stopLobby3d();
        } else if (on) {
          const st = getCurStyle();
          startLobby3d(cv, st.prof, st.flv);
        }
      }).observe(titleEl, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    }
    const stageEl = document.getElementById('lobbyHeroStage');
    if (stageEl && typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        const st = getCurStyle();
        syncLobby3dStyle(st.prof, st.flv, st.swHex);
      }).observe(stageEl, { attributes: true, attributeFilter: ['data-cloak'] });
    }
  })();
}