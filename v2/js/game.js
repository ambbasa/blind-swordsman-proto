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
import * as THREE from 'three';
import { probeAssets, buildArt } from './art.js';
import * as Anim from './anim.js';
import { createAudio } from './audio.js';
import { createInkSlash, prewarmInkSlash } from '../../assets/v2/fx-ink/code/inkSlashMaterial.js';
import { InkParticles } from '../../assets/v2/fx-ink/code/inkParticles.js';
import { setupBloom, AutoQuality } from '../../assets/v2/fx-ink/code/bloomSetup.js';
import { createInkWashPass } from './inkwash.js';
import { createTiltShiftPass, createDepthCapture, focusDistance } from './doftilt.js';
import { foldPop, tickFolds } from './foldspring.js';
import { PIXEL_LOOK, createPixelLookPass } from './pixellook.js';
import { createCinematicPass } from './inkcinematic.js';
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
import {
  SAVE_VERSION, SWORDS, RELICS, SKINS, BRUSHES, MON_CODE, CODEX_GROUPS, EVO_SLOTS, PAT_SLOTS,
  newSaveMeta, swordFx, swordOf, equippedRelics, relicOn, relicSlots, skinOf, brushOf, codexCounts, codexBonus, isBasePat
} from './meta.js';
import { InkLightPool, createWorldInkUniforms, attachGroundInkShader } from './inklights.js';
import { initOverlayShell } from './ui/overlayShell.js';
import { installCssVars, color as palColor, hex as palHex } from './palette.js';
import { WF, paint as paintCard, updateFade as updateWorldFade, stats as cardStats } from './cardstock.js';
import { applyBalanceV049 } from './modules/balance.js';
import { getShopTabNote, statUpgradeCost, computeIdleCoins, purchaseStatUpgrade, getIdleNotice } from './modules/economy.js';
import { computeAtkBonus, computeComboMul, computeDashDmg, computeMaxHp } from './modules/combat.js';
import { STAGES, ACT_NAMES, HANJI_TONE, actOf, stageOf, applyHanjiToneToStages } from './modules/stages.js';
import { MODES, MODE_ORDER, MODE_NOTE, modeOf, CHALLENGES, challengeOf, RUN_UPGRADES, EVO_RECIPES } from './modules/upgrades.js';
import { PAT_CODE } from './modules/bossCatalog.js';
import { createInputQueue, createDashLatencyTracker } from './modules/inputQueue.js';
import { createRunState, resetRunStateOnQuit } from './modules/state.js';
import { createHudController } from './modules/hudController.js';
import { createUiRouter } from './modules/uiRouter.js';
import { syncSceneActTheme3D } from './modules/actTheme3d.js';
import { createInkRiver3D } from './modules/inkWater3d.js';
import { createInkTerrain3D } from './modules/inkTerrain3d.js';
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
function fxQualityFromUrl() {
  try {
    const q = new URLSearchParams(location.search).get('fx');
    if (q === 'low' || q === 'off' || q === 'high') return q;
  } catch (e) {}
  return 'high';
}
const fxQForced = (function () {
  try { return ['high', 'low', 'off'].indexOf(new URLSearchParams(location.search).get('fx')) >= 0; } catch (e) { return false; }
})();
let fxQ = fxQualityFromUrl();
const fxinkStat = { slashes: 0, hits: 0, kills: 0 };
const SHAPE_MARK = { hline: '—', vline: 'ㅣ', vee: 'V', bolt: '⚡', star: '⛤', square: 'ㅁ', tri: '△', arc: '◡', spiral: '@' };
/* 기물 전용 제스처: 보스 무늬(장의 무늬)와 겹치지 않고, 기물끼리도 하나씩 나눠 가진다. */
const TOTEM_SHAPES = ['tri', 'square', 'spiral'];
const SHAPE_KEY = { hline: 'H', vline: 'I', vee: 'V', bolt: 'Z' };
const SHAPE_UNLOCK = ['hline', 'vline', 'vee', 'bolt'];
const COMBAT = SHAPE_UNLOCK.slice();

const SHAPE_HINT = {
  hline: '가로로 길게 그어 보세요',
  vline: '세로로 길게 그어 보세요',
  vee: 'V자를 그려 보세요',
  bolt: '번개(⚡)처럼 지그재그로 그어 보세요'
};
/* v1 numbers reused where the new brief is silent. Documented as defaults. */
const CFG = {
  hpBase: 10, dmg: 1, bossDmg: 2, bossCoin: 20, iframeMs: 800,
  timeLimit: 75, bossAt: 50, bossShapes: 6,
  coinPerKill: 2,
  idlePerMin: 4, idleMaxHours: 8,
  upgradeBase: 20, atkStep: 0.05, hpStep: 3, coinStep: 0.25, maxLv: 10,
  xpBase: 9, xpStep: 5, xpPerKill: 1,
  /* Hit feedback: white flash, stagger and knockback (stone resists); death sinks and fades. */
  flinchDur: 0.14, hitKnockZ: 0.35, stoneKnockMul: 0.35, dieDur: 0.5,
  dashDur: 0.28, pathRadius: 1.35, dashDmg: 2.5, spiritHp: 1,
  /* Zombie kinds: hp grows over the run by (1 + hpGrowth * t / timeLimit). */
  zombieTypes: {
    imp: { hp: 2, speed: 1.0, r: 0.55, dmg: 1, xp: 1, coin: 1 },
    brute: { hp: 5, speed: 0.9, r: 0.7, dmg: 1, xp: 2, coin: 2 },
    stone: { hp: 10, speed: 0.6, r: 0.9, dmg: 2, xp: 3, coin: 3 },
    /* v0.23 후반 장(5~12장) 변주: 빠른 돌진형·부적 투척형·자폭형 */
    charger: { hp: 3, speed: 1.1, r: 0.56, dmg: 1, xp: 2, coin: 2, dashSpeed: 5.6, dashRange: 7.5, dashCd: 3.4, dashT: 0.3, windT: 0.35, tint: 0x8fd8ff },
    thrower: { hp: 3, speed: 0.78, r: 0.55, dmg: 1, xp: 2, coin: 2, hold: 4.6, throwRange: 10, throwCd: 2.9, shotSpeed: 7.2, tint: 0xd8b6ff },
    bomber: { hp: 2, speed: 1.34, r: 0.5, dmg: 1, xp: 2, coin: 2, fuseR: 2.0, fuse: 0.85, blastR: 2.7, blastDmg: 2, tint: 0xffc06a },
    /* 정예 원귀: 금테를 두른 느린 귀물. 처치하면 부적 상자(강화 3연속)를 떨어뜨린다. */
    elite: { hp: 12, speed: 0.8, r: 0.85, dmg: 1, xp: 5, coin: 6 }
  },
  /* v0.23 투척 부적·보스 장판 */
  shotSpeed: 7.2, shotR: 0.42, shotDmg: 1, shotLife: 3.2,
  hazardR: 2.5, hazardDmg: 1, hazardDelay: 1.05, hazardLife: 2.6,
  zombieMix: [[0, { imp: 1 }], [25, { imp: 0.75, brute: 0.25 }], [45, { imp: 0.55, brute: 0.3, stone: 0.15 }]],
  hpGrowth: 0.18,
  /* v0.31 §3.3 콤보: 1+0.04c(15 상한 → ×1.5). 끊기면 0이 아니라 절반, 연속 두 번 끊기면 0. */
  comboMulStep: 0.04, comboMulCap: 15, comboMulMax: 1.5, pierceFalloff: 0.85,
  spreadR: 1.5, iceSlowDur: 2, iceSlowMul: 0.5, poisonCloudR: 2, poisonCloudDur: 3,
  dashCount: 1, spawnZombieMs: 900,
  spawnZombieMax: 20,
  spawnZombieMinMs: 450,
  spawnZombieDelay: 1.2, practiceZombieMs: 3200, practiceZombieMax: 2, earlyZombieMax: 6, earlyZombieUntil: 15, earlyZombieMinMs: 1400,
  openingZombies: 6, openingRing: [0.5, 0.8],
  spiritStreamAlpha: 0.55, spiritFadeIn: 0.4, spiritAlpha: 1, spiritHover: 1.26, spiritCapStart: 1, spiritMax: 5, spiritGlowAlpha: 0.22,
  /* 혼령 회수 되돌림(hysteresis): 획득 1.02R, 회수 1.15R(안개 경계 fogOuter 1.16 바로 안). */
  spiritReleaseMul: 1.15, spiritAcquireMul: 1.02,
  /* 제자리 탭 = 칼집 패링 */
  parryR: 2.4, parryPush: 1.6, parryStun: 0.35, parryDmg: 0.5, parryCd: 0.45, parryFailCd: 0.2, parryIframe: 0.2, parryHitstop: 0.05,
  /* 선입력 버퍼 */
  inputBufMs: 200,
  /* 참(斬) 필살기 */
  cleaveCharge: 100, cleaveR: 12, cleaveDmgMul: 3, cleaveBossDmg: 6, cleaveGainKill: 7, cleaveGainWave: 15, cleaveGainBoss: 10,
  /* 자석 수집 */
  magnetR: 2.2, magnetDur: 0.18, magnetStep: 0.6, magnetMax: 3.8,
  /* 포위 웨이브 */
  waves: [
    { t: 20, n: 14, mix: { imp: 0.7, brute: 0.3 }, r: [9, 10] },
    { t: 40, n: 20, mix: { imp: 0.6, brute: 0.3, stone: 0.1 }, r: [9, 11], elite: 1 }
  ],
  ringScreenFrac: 0.70, ringMaxFrac: 0.90, ringBoost: 0.095, /* Lv3 lands on ringMaxFrac (0.70 x 1.285 = 0.90) so each level shows in portrait */ ringLvMax: 3,
  spiritOmega: 2.8, spiritAvoidMax: 0.30, spiritAvoidOmega: 8, bossSpeed: 1.0, bossCatchUp: 0.3, bossSpawnR: 11,
  dashThroughMul: 1.5, dashPastTarget: 0.8, dashPastBodyMul: 1.5, dashPastExtra: 2.0,
  /* v0.22 보스 결계(아레나): 보스가 서면 이 반경 안에서만 싸운다. */
  arenaR: 12,
  /* v0.26 보스 패턴: 예고 색으로 대응을 알린다(붉은 = 일섬 회피, 금 = 탭 패링, 비취 = 무늬 그리기).
     장별 패턴 목록은 STAGES[n].boss.patterns. 목록이 없는 장은 예전 돌진 순환을 쓴다. */
  bossPat: {
    walk: 2.6, poise: 3, groggyT: 3.0, dodgeSlow: 0.5, dodgeR: 1.4,
    kiai: { t: 2.2, win: 0.4, grace: 0.08, dmg: 2, charge: 20 },
    slam: { tele: 1.0, r: 3.0, dmg: 2, stun: 1.0 },
    clones: { n: 3, t: 8, r: 0.72, dmg: 1, bell: 0.9 },
    veil: { t: 5, bell: 1.0, cone: 0.82, ambushTele: 0.7, dist: [6, 9] },
    volley: { n: 7, spread: 1.0, gold: 2, tele: 0.8, speed: 7.5 },
    chant: { n: 3, t: 4.5, dmg: 2, stun: 1.6 },
    shrink: { to: 6.5, t: 10, n: 3, dmg: 2 },
    seal: { t: 4, extra: 2 },
    /* 보스전 기물: 주인공은 일섬으로만 움직이므로, 보스 곁에 늘 피해 갈 고정 기물을 세워 둔다(1~12장 공통).
       기물은 움직이지 않고 번갈아 느린 부적을 쏜다. 일섬에 부서지면 비어 있는 방향에 다시 선다. */
    summon: { keep: 3, every: 2.5, r: [0.55, 0.85], shotEvery: 3.0, shotWarn: 0.6, shotSpeed: 4.5 },
    tips: {
      charge: '붉은 선이 뻗으면 일섬으로 비켜서세요. 스치듯 피하면 "간발"입니다.',
      kiai: '귀물이 기를 모읍니다 — 게이지가 금빛 칸에 닿는 순간 탭!',
      slam: '붉은 원이 깔리면 원 밖으로 일섬하세요. 내려찍은 뒤가 빈틈입니다.',
      clones: '분신 가운데 방울이 우는 것이 진짜입니다. 가짜를 베면 반격당합니다.',
      veil: '귀물이 안개에 숨었습니다 — 방울이 우는 쪽으로 획을 그으세요.',
      volley: '부적 탄막입니다. 사이로 일섬하고, 금빛 부적은 탭으로 되받아치세요.',
      chant: '영창입니다 — 아래 뜬 무늬를 순서대로 그려 끊으세요.',
      shrink: '결계가 조여 옵니다 — 부적 기둥을 모두 베세요.',
      seal: '귀물이 무릎 꿇었습니다 — 획이 교차하는 한붓별(⛤)을 그려 봉인하세요.',
      /* v0.32 §4.4 막 보스 전용 */
      clash: '칼이 맞붙었습니다 — 1.2초 안에 뜬 무늬를 그으면 한 합을 받습니다.',
      mimic: '귀물이 방금 그은 궤적을 따라옵니다 — 그 선과 직각으로 비켜서세요.',
      shuffle: '무늬가 2초마다 바뀝니다 — 금빛 테두리 0.4초에 그으면 무늬가 고정됩니다.'
    }
  },
  /* v0.22 묵항아리: 부수면 세 가지 픽업 중 하나 */
  jarDropWeights: { herb: 0.4, magnet: 0.3, bang: 0.3 }, herbHeal: 2, bangR: 15,
  landBounce: 0.28, landBounceT: 0.16, landRippleDur: 0.45,
  landIframe: 0.25, landShockR: 1.6, landPush: 1.2, landStun: 0.3, landPast: 1.0,
  hitstopKill: 0.06, hitstopKillMax: 0.12, hitHitstop: 0.08, hitKnock: 0.6,
  /* v0.29 §3.1 타격감: 일반 명중에 히트스톱을 넣고, 파훼는 더 길게, 칼 튕길 때는 짧은 쇳소리. */
  hitstopHit: 0.035, hitstopHitCap: 0.06, hitstopBreak: 0.10, hitstopBounce: 0.03, killSplatScale: 1.4,
  /* v0.29 §4.1 기물 역공: 보스 예고 중 기물로 일섬하면 기물이 먹궤적이 되어 날아가 보스를 1.0초 경직시킨다. */
  reflectStun: 1.0, reflectCharge: 12, reflectPoise: 1,
  /* v0.29 §4.2 빈틈 고리: 걷는 보스 발밑에 1.6초마다 차오르는 고리. 다 차기 전에 그은 획은 0.5초까지 선입력한다. */
  gapPeriod: 1.6, gapFlash: 0.5, gapBufWait: 0.5,
  /* v0.29 §3.4 공정성: 판에서 처음 맞는 '피할 수 없는' 공격은 피해 1, 피격 무적 중에는 다음 공격이 발동하지 않는다. */
  firstForcedDmg: 1, chainGuard: 0.8,
  recoilU: 0.12, recoilT: 0.12, hurtVignette: 0.3,
  aimConeCos: 0.5, aimNearW: 0.35, telegraphRange: 3.2,
  zombieRing: [6, 8.5],
  zombieSpeed: 2.15,
  qlLowFps: 44, qlHighFps: 57, qlDownSec: 3.5, qlUpSec: 8,
  camOff: { x: 14.4, y: 22.4, z: 14.4 }, camLookY: 1.2, fov: 62,
  markMinCss: 12, seqDotGap: 16, markMaxCss: 32,
  comboTimeout: 2.8, bpm: 100,
  /* v0.23 아이템 개편: 자동 흡수·수명 · 원소 각인 · 정확한 획 · 칼집 각성 */
  autoPickR: 1.25, itemLife: 24, tempElemDur: 12, elemLvMax: 3,
  iceDurStep: 0.5, shatterStep: 1, burnDurStep: 0.5, burnDmgStep: 0.3,
  poisonMaxStep: 1, poisonDmgStep: 0.25, cloudRStep: 0.6,
  perfectDmgMul: 1.5, perfectStep: 0.15, perfectThresh: 0.80, perfectThreshStep: 0.05,
  parryAwakenR: 0.45, parryAwakenDmg: 0.4, parryAwakenCharge: 14, parryAwakenStun: 0.12,
  bellMyriadDur: 12,
  comboBurstAt: [4, 8, 12],
  comboBurstR: [3.2, 4.2, 5.2], comboBurstDmg: [1, 1.5, 2],
  practiceSec: 10, practiceSpawns: 6, comboBurstMs: 220,
  iceDur: 2.5, burnDur: 3, burnPeriod: 0.75, burnDmg: 1,
  poisonMax: 5, poisonDur: 4, poisonPeriod: 1, poisonDmgPer: 0.75,
  shatterDmg: 4, explodeDmg: 3, explodeR: 2.5,
  bellDur: 8, slowDur: 0.45, slowScale: 0.35,
  sightWaveDur: 0.45,
  /* Fog outside the mind's-eye ring: clear inside fogInner x ring, fully fogged at fogOuter x ring. */
  fogColor: [7, 6, 8], fogAlpha: 0.78, fogInner: 0.86, fogOuter: 1.16, fogWisps: 28, fogWispAlpha: 0.05,
  /* 혼령의 창: 혼령은 먹안개를 뚫고 보인다. 링 경계·그 너머·짙은 안개에서도 혼령 몸과 기호가 읽히도록
     혼령 자리에 부드러운 창을 뚫는다(중심 지움 정도 / 구슬·몸 높이 대비 반지름 / 최소·최대 px). */
  spiritLightClear: 0.84, spiritLightOrb: 2.4, spiritLightBody: 0.72, spiritLightPx: 26,
  spiritLightBoss: 1.45, spiritLightMax: 120,
  /* v0.30 §8.1 첫 10초 몸통 튜토리얼: 느린 화면 + 유도 획 → 첫 성공 → 제자리 탭. */
  tut: { slow0: 0.45, firstSlow: 0.75, firstDur: 0.8, tapAt: 5.0, tapSlow: 0.35, tapSlowDur: 0.6, end: 10 },
  /* v0.30 §8.2 '처음 보는 순간': 한 번 본 것은 다시 늦추지 않는다(저장 단위 기록). */
  firstPatTele: 1.6, firstPatSlow: 0.5, firstPatSlowDur: 0.6, firstShapeGuide: 0.8, totemPractice: 3.0,
  /* v0.30 §7.3 동적 보정: 같은 장 연패 시 조용히 돕는다(고수 모드 제외). */
  help2Charge: 30, help3Tele: 1.1, helpOfferAt: 4,
  /* v0.30 §4.3 보스전 시간 예산: 목표 여유 비율 1.4~1.8, 수용 기준 '시간 초과 패배 10% 이하'. */
  budget: { walk: 2.6, stun: 1.2, seal: 2, K: 2, slackMin: 1.4, slackMax: 1.8, overMax: 0.10 },
  /* v0.31 §3.2 강적 깨는 법: 장정=갑옷 1겹 · 돌덩이=금 2단계 · 정예=봉인 순서 3개. */
  bruteArmor: 1, armorDmg: 0.5, breakRimT: 0.3, crackStages: 2, crackSameMul: 0.5,
  eliteSeqLen: 3, eliteSeqCharge: 20,
  /* v0.31 §3.3 콤보 단계 보상: 10 참+10 · 15 다음 일섬 폭 ×1.5 · 20 혼백+3·엽전+5 · 30부터 10마다 참+10. */
  comboTiers: { 10: { charge: 10 }, 15: { wide: 1.5 }, 20: { xp: 3, coin: 5 }, 30: { charge: 10 } },
  /* v0.31 §3.5 정확한 패링: 공격이 닿기 0.2초 안의 탭 = 피해 2배·참 +10·0.2초 느린 화면. */
  preciseWin: 0.2, preciseDmgMul: 2, preciseCharge: 10, preciseSlow: 0.2, preciseStun: 0.6,
  /* v0.31 §5.2 멈추지 않는 선택: 0.3배 1.5초 + 아래 카드 3장, 4초 안에 고르면 자동 추천. */
  quick: { slow: 0.3, slowDur: 1.5, pickSec: 4.0, zone: 0.22 },
  /* v0.31 §5.3 새 카드 */
  ward: { n: 2, r: 2.2, dmg: 0.8, period: 0.35, r2: 2.6, n3: 4, spin: 2.1, manryunR: 1.2, manryunSlow: 0.3 },
  boltCard: { every: 4.5, r: 2.2, dmg: 2.2, tele: 0.6, range: 6, lvStep: 0.4, lvMax: 5, freeze: 1.5 },
  echoCard: { delay: 0.4, mul: [0.4, 0.55, 0.7] },
  resonCard: { dmg: [0.65, 0.95, 1.25] },
  inkStep: { dur: 2, slow: [0.3, 0.4, 0.5], r: 1.7 },
  /* 자동 피해(호신부·벼락부적)는 총 피해의 25%를 넘지 않는다 — 제스처 정체성 유지(§17-4). */
  /* v0.31 §5.5 판 안 경험치: 곡선(7+4n+0.6n²)이 정해졌으니, 목표 레벨(1장 4~5·12장 8~9)에 맞게
     한 마리의 경험치 양을 맞춘다. v0.23 이후 연쇄·참·자동으로 처치 밀도가 2~3배가 되어 0.3으로 낮춤. */
  xpScale: 0.2,
  autoCap: 0.25
};
applyBalanceV049(CFG);
/* v0.49: MODES, CHALLENGES, RUN_UPGRADES, EVO_RECIPES, STAGES, HANJI_TONE, ACT_NAMES 는
   v2/js/modules/upgrades.js 및 stages.js 로 분리했습니다. */
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

applyHanjiToneToStages(THREE.Color, STAGES);
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
const TERRAIN_CFG = {
  rubble: { stumble: 0.2 },
  bamboo: { slow: 0.3, dmgMul: 1.3 },
  moon: { period: 20, lit: 5, speed: 1.2, coin: 2 },
  fog: { period: 10, amp: 0.08 },
  snow: { slip: 0.6 },
  root: { bind: 0.4, shockMul: 2 },
  bell: { reveal: 2.0, cd: 6 },
  blood: { regen: 0.9, offT: 8 },
  water: { lenMul: 0.7, slow: 0.7 },
  wall: { every: 30, tele: 1.2, r: 2.0, n: 3 }
};
function tHash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/* 세포 격자 하나에 놓이는 둥근 지형 조각(잔해·대숲·종·혈석) */
function tPatchAt(x, z, cell, seed, chance, minR, maxR, pad) {
  const cx0 = Math.floor(x / cell), cz0 = Math.floor(z / cell);
  const P = pad || 0;
  let best = null, bestD = 1e9;
  for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
    for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) {
      if (tHash(cx, cz, seed) >= chance) continue;
      const px = cx * cell + cell * 0.5 + (tHash(cx, cz, seed + 1) - 0.5) * cell * 0.62;
      const pz = cz * cell + cell * 0.5 + (tHash(cx, cz, seed + 2) - 0.5) * cell * 0.62;
      const rr = minR + tHash(cx, cz, seed + 3) * (maxR - minR);
      const d = Math.hypot(x - px, z - pz);
      if (d <= rr + P && d < bestD) { best = { x: px, z: pz, r: rr, key: cx + ':' + cz }; bestD = d; }
    }
  }
  return best;
}
function tPatchesNear(x, z, radius, cell, seed, chance, minR, maxR) {
  const out = [];
  const cx0 = Math.floor((x - radius) / cell), cx1 = Math.floor((x + radius) / cell);
  const cz0 = Math.floor((z - radius) / cell), cz1 = Math.floor((z + radius) / cell);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      if (tHash(cx, cz, seed) >= chance) continue;
      const px = cx * cell + cell * 0.5 + (tHash(cx, cz, seed + 1) - 0.5) * cell * 0.62;
      const pz = cz * cell + cell * 0.5 + (tHash(cx, cz, seed + 2) - 0.5) * cell * 0.62;
      const rr = minR + tHash(cx, cz, seed + 3) * (maxR - minR);
      if (Math.hypot(x - px, z - pz) <= radius + rr) out.push({ x: px, z: pz, r: rr, key: cx + ':' + cz });
    }
  }
  return out;
}
/* 뿌리: 세포마다 놓이는 짧은 선분 하나 */
function tRootAt(x, z) {
  const cell = 7.0, seed = 71;
  const cx0 = Math.floor(x / cell), cz0 = Math.floor(z / cell);
  for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
    for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) {
      if (tHash(cx, cz, seed) >= 0.55) continue;
      const ax = cx * cell + cell * 0.5 + (tHash(cx, cz, seed + 1) - 0.5) * cell * 0.5;
      const az = cz * cell + cell * 0.5 + (tHash(cx, cz, seed + 2) - 0.5) * cell * 0.5;
      const a = tHash(cx, cz, seed + 3) * Math.PI;
      const half = 2.2 + tHash(cx, cz, seed + 4) * 1.6;
      const bx = ax + Math.cos(a) * half, bz = az + Math.sin(a) * half;
      if (segDist(x, z, ax, az, bx, bz) <= 0.55) return { x: ax, z: az, x2: bx, z2: bz, r: 0.55, key: cx + ':' + cz };
    }
  }
  return null;
}
/* 물길: 마른 강바닥이 사인 곡선으로 지나간다(길이 −30% · 물 위 원귀 느림) */
function tWaterCenter(x) { return 5.5 * Math.sin(x * 0.085) + 2.0 * Math.sin(x * 0.021 + 1.3); }
function tWaterAt(x, z) {
  const c = tWaterCenter(x);
  const w = 2.1 + 0.7 * Math.sin(x * 0.13 + 0.6);
  return Math.abs(z - c) <= w ? { x: x, z: c, r: w, key: 'river' } : null;
}
/* 그 자리의 지형 — 없으면 null */
function zoneAt(x, z, st) {
  const stage = st || (S && S.stage) || null;
  const T = stage && stage.terrain;
  if (!T || T.kind === 'none') return null;
  if (T.kind === 'rubble') {
    const p = tPatchAt(x, z, 5.0, 11, 0.42, 0.9, 1.9);
    return p ? { kind: 'rubble', x: p.x, z: p.z, r: p.r, key: p.key } : null;
  }
  if (T.kind === 'bamboo') {
    const p = tPatchAt(x, z, 6.5, 37, 0.55, 2.0, 3.4);
    return p ? { kind: 'bamboo', x: p.x, z: p.z, r: p.r, key: p.key } : null;
  }
  if (T.kind === 'root') { const p = tRootAt(x, z); return p ? Object.assign({ kind: 'root' }, p) : null; }
  if (T.kind === 'bell') {
    const p = tPatchAt(x, z, 10.0, 83, 0.4, 0.5, 0.5);
    return p ? { kind: 'bell', x: p.x, z: p.z, r: 1.3, key: p.key } : null;
  }
  if (T.kind === 'blood') {
    const p = tPatchAt(x, z, 8.0, 97, 0.55, 2.4, 3.2);
    if (!p) return null;
    const st2 = (S && S.terrain && S.terrain.stones) || {};
    if ((st2[p.key] || 0) > (S ? S.elapsed : 0)) return null;
    return { kind: 'blood', x: p.x, z: p.z, r: p.r, key: p.key };
  }
  if (T.kind === 'water') { const p = tWaterAt(x, z); return p ? Object.assign({ kind: 'water' }, p) : null; }
  return null;
}
function tSegZone(from, to, st) {
  for (let i = 1; i <= 6; i++) {
    const u = i / 6;
    const z = zoneAt(from.x + (to.x - from.x) * u, from.z + (to.z - from.z) * u, st);
    if (z) return z;
  }
  return null;
}
function terrainInit() {
  if (!S) return;
  S.terrain = {
    kind: (S.stage && S.stage.terrain && S.stage.terrain.kind) || 'none', name: (S.stage && S.stage.terrain && S.stage.terrain.name) || '',
    counts: {}, stumbleT: 0, rootT: 0, ringMul: 1, moon: false, moonT: 0,
    revealT: 0, bells: {}, stones: {}, wallT: 0, volleyOn: false, volleyHp: 0
  };
  if (three && three.river) { try { three.river.dispose(); } catch (e) {} three.river = null; }
  if (three && three.scene && S.terrain && S.terrain.kind === 'water') {
    try { three.river = createInkRiver3D(three.scene, { centerFn: tWaterCenter }); } catch (e) { three.river = null; }
  }
  if (three && three.terrain3d) { try { three.terrain3d.dispose(); } catch (e) {} three.terrain3d = null; }
  if (three && three.scene && S.terrain && S.terrain.kind && S.terrain.kind !== 'none' && S.terrain.kind !== 'water') {
    try { three.terrain3d = createInkTerrain3D(three.scene, S.terrain.kind, { stageNo: S.stageNo }); } catch (e) { three.terrain3d = null; }
  }
   telemetry.event('stage_terrain', { stage: S.stageNo || 0, rule: S.terrain.kind });
}

/* ---------- v0.34 §6.2 장마다 부목표 ----------
   3막 장에 목적이 다른 목표 하나를 둔다: 수호(5) · 사냥(7) · 무늬 제한(9) · 어둠(10) · 시간 공격(11).
   목표는 별 3(§7.4)과 이어진다. */
function initGoal(st, opts) {
  if (!S) return;
  if (!st || !st.subgoal || opts.sandbox || opts.challenge) { S.goal = null; renderGoalHud(); return; }
  const g = st.subgoal;
  S.goal = {
    id: g.id, label: g.label || '', t: 0, ok: false, fail: false, hp: g.hp || 0, hpMax: g.hp || 0,
    n: 0, need: g.n || 0, win: g.t || 0, at: g.at || 0, ringMul: 1, shape: null,
    pos: g.id === 'guard' ? { x: S.hero.x + 4.2, z: S.hero.z - 1.0 } : null, ids: []
  };
  if (g.id === 'shapeLock') {
    const pool = (st.shapes && st.shapes.length) ? st.shapes : SHAPE_UNLOCK;
    S.goal.shape = pool[pool.length - 1];
  }
  if (g.id === 'timed') S.timeLeft = Math.max(30, Math.round((S.timeLeft || st.time) * (1 - (g.cut || 0.3))));
  renderGoalHud();
}
function goalWindowOn() {
  const g = S && S.goal;
  if (!g) return false;
  if (g.id === 'shapeLock') return g.t >= g.at && g.t < g.at + g.win;
  if (g.id === 'dark') return g.t < g.win;
  return false;
}
function goalOnStroke(type) {
  const g = S && S.goal;
  if (!g || g.fail || g.ok) return false;
  if (g.id === 'shapeLock' && goalWindowOn() && type !== 'tap' && type !== 'circle' && TOTEM_SHAPES.indexOf(type) < 0 && type !== g.shape) {
    g.fail = true;
    renderGoalHud();
    showJudge('다른 무늬 — 목표 실패');
    toast('부목표 실패: ' + g.label + ' — ' + (SHAPE_MARK[g.shape] || '') + '만 써야 했습니다');
    telemetry.event('subgoal', { id: g.id, result: 'fail', got: type, want: g.shape });
    return true;
  }
  return false;
}
function goalOnKill(z) {
  const g = S && S.goal;
  if (!g || g.fail) return;
  if (g.id === 'hunt' && g.ids.indexOf(z.id) >= 0) {
    g.n++;
    if (g.n >= g.need) goalPass('사냥 완료');
  }
  if (g.id === 'timed') S.timeLeft = Math.min((S.stage && S.stage.time) || 999, (S.timeLeft || 0) + (S.stage.subgoal.add || 0.5));
}
function goalPass(msg) {
  const g = S && S.goal;
  if (!g || g.ok) return;
  g.ok = true;
  showJudge('부목표 달성');
  toast('부목표 달성 — ' + g.label + (msg ? ' · ' + msg : ''));
  S.goldEdge = Math.max(S.goldEdge || 0, 0.25);
  if (audio && audio.gong) audio.gong();
  renderGoalHud();
  telemetry.event('subgoal', { id: g.id, result: 'pass' });
}
function goalFail(msg) {
  const g = S && S.goal;
  if (!g || g.fail || g.ok) return;
  g.fail = true;
  renderGoalHud();
  toast('부목표 실패 — ' + (msg || g.label));
  telemetry.event('subgoal', { id: g.id, result: 'fail', why: msg || null });
}
function tickGoal(dt) {
  const g = S && S.goal;
  if (!g || g.ok || g.fail) { renderGoalHud(); return; }
  g.t += dt;
  if (g.id === 'guard') {
    /* 석등: 원귀가 닿을 때마다 체력 1씩 (1.2초 간격). 석등으로 향하는 무리가 주기적으로 온다. */
    g.hitT = (g.hitT || 0) + dt;
    g.spawnT = (g.spawnT || 0) + dt;
    const guardN = (S.zombies || []).filter(function (z) { return z.alive && z.goalTarget; }).length;
    if (g.spawnT >= 6 && guardN < 5 && g.t < g.win) {
      g.spawnT = 0;
      const a = Math.random() * Math.PI * 2;
      const z = spawnZombie({ x: g.pos.x + Math.cos(a) * 8, z: g.pos.z + Math.sin(a) * 8, type: Math.random() < 0.3 ? 'brute' : 'imp' });
      if (z) z.goalTarget = true;
    }
    if (g.hitT >= 1.2) {
      const near = (S.zombies || []).some(function (z) { return z.alive && !z.isBoss && dist(z, g.pos) < 1.5; });
      if (near) {
        g.hitT = 0;
        g.hp -= 1;
        S.shake = Math.max(S.shake || 0, 0.3);
        if (audio && audio.drum) audio.drum();
        if (g.hp <= 0) { g.hp = 0; goalFail('석등이 꺼졌습니다'); }
      }
    }
    if (g.t >= g.win && g.hp > 0) goalPass('석등이 살아 있습니다');
  } else if (g.id === 'hunt') {
    if (!g.ids.length && g.t >= 2) {
      for (let i = 0; i < g.need; i++) {
        const a = i / g.need * Math.PI * 2 + 0.4;
        const z = spawnZombie({ x: S.hero.x + Math.cos(a) * 9, z: S.hero.z + Math.sin(a) * 9, type: 'elite' });
        if (z) { z.elite = true; z.goalTarget = true; g.ids.push(z.id); }
      }
      toast('사냥감 — 정예 셋이 골짜기에 들어섰습니다');
    }
    if (g.ids.length && g.ids.every(function (id) { return !(S.zombies || []).some(function (z) { return z.id === id && z.alive; }); })) goalPass('셋 다 베었습니다');
    else if (g.t > g.win) goalFail('시간이 지났습니다');
  } else if (g.id === 'shapeLock') {
    if (g.t >= g.at && !g.announced) { g.announced = true; toast('한 무늬 구간 — ' + (SHAPE_MARK[g.shape] || '') + '만 쓸 수 있습니다'); }
    if (g.t >= g.at + g.win) goalPass('한 무늬로 버텼습니다');
  } else if (g.id === 'dark') {
    g.ringMul = g.t < g.win ? 0.7 : 1;
    if (g.t >= g.win) goalPass('어둠을 버텼습니다');
  }
  renderGoalHud();
}
function goalHudText() {
  const g = S && S.goal;
  if (!g) return '';
  const left = Math.max(0, Math.ceil((g.win || 0) - g.t));
  if (g.ok) return '✔ ' + g.label;
  if (g.fail) return '✘ ' + g.label;
  if (g.id === 'guard') return '석등 ' + g.hp + '/' + g.hpMax + ' · ' + left + '초';
  if (g.id === 'hunt') return '정예 ' + g.n + '/' + g.need + ' · ' + left + '초';
  if (g.id === 'shapeLock') return (g.t >= g.at ? '한 무늬 ' + Math.max(0, Math.ceil(g.at + g.win - g.t)) + '초' : '한 무늬까지 ' + Math.ceil(g.at - g.t) + '초');
  if (g.id === 'dark') return '어둠 ' + left + '초';
  if (g.id === 'timed') return '시간 사냥 · 처치 +' + (S.stage.subgoal.add || 0.5) + '초';
  return g.label;
}
let _goalHudCache = '';
function renderGoalHud() {
  const el = $('goalLabel');
  if (!el) return;
  const txt = goalHudText();
  if (txt === _goalHudCache) return;
  _goalHudCache = txt;
  el.textContent = txt;
  el.hidden = !txt;
  el.classList.toggle('ok', !!(S && S.goal && S.goal.ok));
  el.classList.toggle('fail', !!(S && S.goal && S.goal.fail));
}
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
      inkFx.ring(3.2, FX_COLORS.gold, 0.5);
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
/* 실측한 패턴 지속 시간(초). `GPv2.cycleProbe`가 보스 상태기계를 1/30초로 돌려 잰 값
   (걷기 2.6 · 경직 1.2 고정). 결계 수축은 기둥을 부수지 않으면 걷기로 풀리는 2.6초로 끝난다. */
const PAT_COST = {
  charge: [1.0, 0.03], kiai: [2.3, 0], slam: [1.03, 0], clones: [8.03, 0], veil: [5.03, 0],
  volley: [0.83, 0], chant: [4.53, 0], shrink: [2.6, 0], seal: [2.0, 0],
  /* v0.32 §4.4 막 보스 전용(실측: 합 3합 · 흉내 0.8+0.45 · 뒤석기 8초) */
  clash: [5.4, 0], mimic: [1.45, 0], shuffle: [8.3, 0]
};
function bossPatternMean(st, tele, shapeAdj) {
  const B = (st && st.boss) || {};
  const list = (B.patterns || []).concat(B.phase2 || [], B.phase3 || []);
  if (!list.length) return 2.5;
  const tm = (tele == null ? 1 : tele);
  /* 예고 배율은 예고로 시작하는 패턴에만 적용된다(분신·은신·결계는 고정 길이). */
  const SCALED = { charge: 1, kiai: 1, slam: 1, volley: 1, chant: 1 };
  const sum = list.reduce(function (a, id) {
    const c = PAT_COST[id] || [2.5, 0];
    const t = id === 'charge' ? (B.telegraph != null ? B.telegraph : 1.1) : c[0];
    return a + (SCALED[id] ? t * tm : t) + c[1];
  }, 0);
  return sum / list.length;
}
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

const save = { coins: 0, atkLv: 0, hpLv: 0, coinLv: 0, lastSeen: Date.now(), runs: 0, stage: 1, stars: {}, bestScore: 0, totemTip: false, muted: false,  /* v0.30: 난이도 모드 · 첫 경험 기록(저장 단위) · 접근성 · 같은 장 연패 · 수련 권유 기록 */
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

function costOf(lv) { return statUpgradeCost(lv, CFG); }
function atkBonus() { return computeAtkBonus(save.atkLv, CFG); }
function maxHp() {
  return computeMaxHp({ hpLv: save.hpLv, runHp: (S && S.runHp) || 0, beadsRelicOn: relicOn(save, 'beads'), cfg: CFG });
}
/* 엽전 배율 = 상점 × 지형 · 유물(안개 바늘) · 도감 보너스(§9.3) */
function coinMult() {
  const needle = relicOn(save, 'needle') ? 1.3 : 1;
  return (1 + save.coinLv * CFG.coinStep + (S && S.runCoin || 0)) * needle * (1 + codexBonus(save));
}
/* Dash damage = (base + upgrades) x combo x meta attack x 혈월 부적. */
function dashDmg() {
  return computeDashDmg({
    baseDashDmg: (S && S.dashDmg) || CFG.dashDmg,
    combo: (S && S.combo) || 0,
    atkLv: save.atkLv,
    bloodRelicActive: !!(relicOn(save, 'blood') && S && S.hp < maxHp() * 0.5),
    cfg: CFG
  });
}
/* §3.3: 1 + 0.04c, 15에서 상한 ×1.5. */
function comboMul() {
  return computeComboMul((S && S.combo) || 0, CFG);
}
function pathR() {
  let r = (S && S.pathR) || CFG.pathRadius;
  /* §3.3 15콤보 보상: 다음 일섬 한 번만 경로 폭 +50%. */
  if (S && S.pathWideN > 0) r *= (CFG.comboTiers[15] || {}).wide || 1.5;
  return r;
}

function loadSave() {
  const BAK = SAVE_KEY + '.bak';
  let raw = null, broken = false;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return; }
  if (raw) {
    let o = null, restored = false;
    try { o = JSON.parse(raw); } catch (e) { broken = true; }
    if (!o || typeof o !== 'object') broken = true;
    if (broken) {
      /* §14 저장: 손상된 세이브는 백업에서 되살린다(백업은 지우지 않는다). */
      try {
        const bak = localStorage.getItem(BAK);
        if (bak) { o = JSON.parse(bak); restored = !!(o && typeof o === 'object'); }
      } catch (e) { o = null; }
    }
    if (o && typeof o === 'object') {
      migrateSave(o);
      if (restored) {
        telemetry.event('save_restore', { from: 'backup' });
        /* 되살린 세이브를 정본으로 되돌려 둔다. */
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
      } else {
        /* 정상 세이브는 바로 백업본으로 돌려 둔다(다음 손상 때 복구). */
        try { localStorage.setItem(BAK, raw); } catch (e) {}
      }
    } else {
      telemetry.event('save_reset', { reason: 'corrupt-no-backup' });
      return;
    }
  }
  if (!save.stars || typeof save.stars !== 'object') save.stars = {};
  if (!save.moments || typeof save.moments !== 'object') save.moments = {};
  if (!save.a11y || typeof save.a11y !== 'object') save.a11y = { colorblind: 0, shake: 0 };
  save.a11y.colorblind = save.a11y.colorblind ? 1 : 0;
  save.a11y.shake = save.a11y.shake ? 1 : 0;
  if (!MODES[save.mode]) save.mode = 'jeongseok';
  save.levelMode = 'pause';
  if (save.mode === 'gosu' && !gosuUnlocked()) save.mode = 'jeongseok';
  save.tutorialDone = save.tutorialDone ? 1 : 0;
  save.stage = clamp(save.stage | 0 || 1, 1, STAGES.length);
  save.version = SAVE_VERSION;
}
/* v2 → v3 이전: 예전 세이브에 메타 칸이 없으면 기본값으로 메우고, 도감 구조도 맞춘다. */
function migrateSave(o) {
  const META_KEYS = ['coins', 'atkLv', 'hpLv', 'coinLv', 'lastSeen', 'runs', 'stage', 'stars', 'bestScore', 'totemTip', 'muted',
    'mode', 'tutorialDone', 'moments', 'a11y', 'streak', 'trainOffered', 'levelMode', 'codex',
    'version', 'swords', 'relics', 'skins', 'brush', 'train', 'records', 'challenge'];
  const from = o.version | 0;
  Object.keys(o).forEach(function (k) { if (o[k] != null) save[k] = o[k]; });
  if (from < SAVE_VERSION) {
    const base = newSaveMeta();
    /* 무구·유물·외형·붓 자국은 보유분만 보존하며 보충 */
    ['swords', 'relics', 'skins', 'brush'].forEach(function (k) {
      if (!save[k] || typeof save[k] !== 'object') save[k] = base[k];
      save[k].owned = Object.assign({}, base[k].owned, save[k].owned || {});
      if (typeof save[k].equipped !== 'object' && save[k].equipped == null) save[k].equipped = base[k].equipped;
      if (Array.isArray(base[k].equipped) && !Array.isArray(save[k].equipped)) save[k].equipped = base[k].equipped;
    });
    if (!save.codex || typeof save.codex !== 'object') save.codex = base.codex;
    ['mon', 'boss', 'evo', 'pat'].forEach(function (k) { if (!save.codex[k] || typeof save.codex[k] !== 'object') save.codex[k] = {}; });
    save.train = Object.assign({ stats: {}, seen: 0 }, save.train || {});
    if (!save.train.stats) save.train.stats = {};
    save.records = Object.assign({ endless: 0, bossrush: 0, trials: 0 }, save.records || {});
    save.challenge = Object.assign({ endless: 0, bossrush: 0, trial: 0 }, save.challenge || {});
    telemetry.event('save_migrate', { from: from, to: SAVE_VERSION, coins: save.coins | 0, stage: save.stage | 0 });
  }
  META_KEYS.forEach(function (k) { if (save[k] == null && o[k] != null) save[k] = o[k]; });
  if (!save.codex.boss) save.codex.boss = {};
  if (!save.codex.pat) save.codex.pat = {};
  if (!save.relics || !Array.isArray(save.relics.equipped)) save.relics = Object.assign(newSaveMeta().relics, save.relics || {});
}
function persist(touch) {
  if (touch !== false) save.lastSeen = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}

function showOv(id) {
  ['ov-title', 'ov-shop', 'ov-result', 'ov-idle', 'ov-level', 'ov-stage', 'ov-pause', 'ov-codex', 'ov-train'].forEach(function (k) {
    const el = $(k); if (el) el.classList.toggle('show', k === id);
  });
  if (id === 'ov-title') {
    hudCtrl.clearOnTitleReturn();
    hudCtrl.syncActTheme(actOf(save.stage || 1));
    refreshTitleHelp();
  } else {
    hudCtrl.syncOverlayVisibility(!!id);
  }
}
function hideOvs() {
  ['ov-title', 'ov-shop', 'ov-result', 'ov-idle', 'ov-level', 'ov-stage', 'ov-pause', 'ov-codex', 'ov-train'].forEach(function (k) { if ($(k)) $(k).classList.remove('show'); });
  hudCtrl.syncOverlayVisibility(false);
}
function toast(msg) {
  const el = $('toast');
  el.hidden = false; el.textContent = msg;
  toastT = now() + 1600;
}
/* 판 안내 문구(첫 진입·참 준비·기물 학습). 조작을 막지 않는 한 줄 칩. */
let guideUntil = 0;
function showGuide(html, sec) {
  const el = $('guide');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = false;
  el.classList.add('show');
  /* 만료는 게임 시간 기준 — 느린 기기·로딩 중에 안내가 먼저 사라지지 않는다. */
  guideUntil = (S ? (S.elapsed || 0) + (sec || 4.5) : 0);
}
function hideGuide() {
  const el = $('guide');
  if (!el) return;
  el.classList.remove('show');
  guideUntil = 0;
  el.hidden = true;
}
let shownMaxHp, shownHp;
function fillHp() {
  const n = maxHp(), cur = S ? S.hp : n;
  if (n === shownMaxHp && cur === shownHp) return;
  shownMaxHp = n; shownHp = cur;
  /* 12개까지만 핍으로 그리고, 넘는 최대 체력은 +N으로 적는다(2줄로 넘치지 않게). */
  const show = Math.min(12, n);
  let h = '', i;
  for (i = 0; i < show; i++) h += '<i' + (i < cur ? '' : ' class="off"') + '></i>';
  $('hpPips').innerHTML = h;
  const more = $('hpMore');
  if (more) more.textContent = n > show ? '+' + (n - show) : '';
}
/* v0.31 §5.5 판 안 경험치 곡선: 7 + 4(lv-1) + 0.6(lv-1)^2 — 첫 3레벨은 빠르고 8레벨 이후는 느리다. */
function xpNeed(lv) {
  const n = Math.max(1, lv | 0) - 1;
  return Math.round(7 + 4 * n + 0.6 * n * n);
}
function setHudText(el, value) {
  const text = String(value);
  if (el.textContent !== text) el.textContent = text;
}
function renderHud() {
  if (!S) {
    setHudText($('stageLabel'), '심안');
    $('judgeFlash').hidden = true;
    $('goalLabel').hidden = true;
    _goalHudCache = null;
    setHudText($('timer'), '—');
    setHudText($('dashLabel'), '일섬 1');
    setHudText($('coinLabel'), '엽전 ' + save.coins);
    setHudText($('lvlLabel'), 'Lv —');
    if ($('comboLabel')) { setHudText($('comboLabel'), '콤보 0'); $('comboLabel').classList.remove('hot'); }
    $('xpFill').style.width = '0%';
    renderCharge();
    fillHp();
    return;
  }
  setHudText($('timer'), Math.max(0, Math.ceil(S.timeLeft)));
  const permElem = S.dashElem;
  const temp = (S.tempElem && S.tempElem.t > 0) ? S.tempElem : null;
  const elemLvBit = (permElem && elemLv(permElem) > 1) ? ('Lv' + elemLv(permElem)) : '';
  const permBit = permElem ? ('·' + elemNameOf(permElem) + elemLvBit) : '';
  const tempBit = temp ? ((permElem ? ' +' : '·') + elemNameOf(temp.el) + Math.ceil(temp.t) + 's') : '';
  const bellBit = S.bellT > 0 ? (' 종' + (SHAPE_MARK[S.bellShape] || '') + Math.ceil(S.bellT) + 's') : '';
  setHudText($('dashLabel'), '일섬 ' + S.dashCount + permBit + tempBit + bellBit);
  setHudText($('coinLabel'), '엽전 ' + save.coins);
  setHudText($('lvlLabel'), 'Lv ' + S.level);
  if ($('comboLabel')) {
    setHudText($('comboLabel'), '콤보 ' + (S.combo || 0));
    $('comboLabel').classList.toggle('hot', (S.combo || 0) >= 4);
  }
  let stageText = S.sandbox ? '연습' : (S.stage ? (S.stageNo + '장 ' + S.stage.name) : '심안');
  if (S.challenge) {
    const c = challengeOf(S.challenge);
    stageText = c ? c.name : '도전';
    if (S.challenge === 'bossrush') stageText = '보스 러시 ' + (S.bossIdx || 0) + '/' + STAGES.length;
    else if (S.challenge === 'endless') stageText = '무한 심연 ' + (S.endlessBossN || 0) + '귀물';
  }
  if (S.boss && S.boss.alive) stageText = '보스';
  setHudText($('stageLabel'), stageText);
  $('xpFill').style.width = Math.min(100, (S.xp / xpNeed(S.level)) * 100) + '%';
  renderCharge();
  fillHp();
}
/* v0.27: 판 중 소리 토글·일시정지·나가기 */
function setMuted(m) {
  save.muted = !!m;
  qa.mute = !!m;
  persist();
  if (audio) audio.setQuiet(!!m, qa.noDelay);
  const b = $('btnMute'), b2 = $('btnMute2');
  if (b) {
    if (!b.querySelector('svg')) b.textContent = m ? '무음' : '소리';
    b.classList.toggle('off', !!m);
    b.setAttribute('aria-label', m ? '소리 켜기' : '소리 끄기');
  }
  if (b2) b2.textContent = m ? '소리 켜기' : '소리 끄기';
  hudCtrl.syncMuteUi(!!m);
  return save.muted;
}
function pauseRun() {
  if (!S || !S.playing || S.paused) return false;
  S.paused = 'manual';
  setDrawingActive(false);
  if (S.quick) { const q = recommendedPick(); if (q) pickQuick(q, true); else closeQuickCards(); }
  hideGuide();
  showOv('ov-pause');
  if (audio) audio.stopBgm();
  return true;
}
function resumeRun() {
  if (!S || S.paused !== 'manual') return false;
  S.paused = null;
  hideOvs();
  if (audio) { audio.setQuiet(!!save.muted, qa.noDelay); audio.startBgm(); }
  return true;
}
/* 판을 접고 타이틀로 — 결과 카드를 띄우지 않는다. */
function quitRun() {
  const had = !!S;
  $('toast').hidden = true;
  toastT = 0;
  if (S) resetRunStateOnQuit(S);
  hudCtrl.clearOnTitleReturn();
  closeQuickCards();
  const sk = $('btnSkip');
  if (sk) sk.hidden = true;
  hideGuide();
  hideOvs();
  if (three && three.river) { try { three.river.dispose(); } catch (e) {} three.river = null; }
  if (three && three.terrain3d) { try { three.terrain3d.dispose(); } catch (e) {} three.terrain3d = null; }
   clearEntities();
  closeArena(true);
  S = null;
  if (audio) { if (audio.setBossMode) audio.setBossMode(false); audio.stopBgm(); }
  if (three) {
    three.camera.position.set(CFG.camOff.x, CFG.camOff.y, CFG.camOff.z);
    three.camera.lookAt(0, CFG.camLookY, 0);
  }
  applyCameraLens();
  renderHud();
  showOv('ov-title');
  return had;
}
function renderCharge() {
  const w = $('chargeWrap'), t = $('chargeText');
  if (!w) return;
  const max = CFG.cleaveCharge || 100;
  const c = (S && S.charge) || 0;
  const full = c >= max;
  w.classList.toggle('full', full);
  $('chargeFill').style.width = Math.min(100, (c / max) * 100) + '%';
  if (t) setHudText(t, full ? '참 준비 (O)' : '참 ' + Math.floor(c));
  /* 게이지가 처음 꽉 찬 순간, 무엇을 그려야 하는지 한 번 알려 준다. */
  if (full && S && S.playing && !S.chargeReadyHint) {
    S.chargeReadyHint = true;
    showGuide('참 준비 — <b>O</b>를 그려 참(斬)을 터뜨리세요', 3.6);
    if (audio && audio.gong) audio.gong();
  }
  /* §8.2 참 게이지 100을 처음 보는 순간: 화면 가운데에 O 유도 획을 한 번 보여 준다. */
  if (full && S && S.playing && markSeen('charge')) {
    S.chargeGuide = 2.2;
    telemetry.event('first_moment', { kind: 'charge', stage: S.stageNo });
  }
}

/* ---------- three.js world ---------- */
function nightColor() {
  return (art && art.night) || 0x1e1c1a;
}
function mapIdOf(opts) {
  opts = opts || {};
  if (opts.map) {
    const m = String(opts.map);
    return (m.indexOf('map') === 0) ? m : ('map' + m);
  }
  if (opts.sandbox) return 'map1';
  return stageOf(opts.stage != null ? opts.stage : (save.stage || 1)).map;
}
function switchMap(id, stageNo) {
  if (!art || !three) return Promise.resolve(null);
  const want = (id && art.atlas && art.atlas.maps && art.atlas.maps[id]) ? id : 'map1';
  const st = stageNo || (S && S.stageNo) || (save.stage || 1);
  const run = function () {
    const _t0 = performance.now();
    return art.applyMap(three.scene, want, three.map, { stage: st }).then(function (m) {
      three.map = m;
      three.torches = [];
      /* v0.39: 장이 바뀌면 새 팔레트·새 종이 소품이 온다 — 같은 종이/안개 규칙으로 다시 칠한다. */
      try { if (m && m.group) paintCard(m.group, 'prop'); } catch (e) {}
      if (three.chunks && three.chunks.arena && typeof three.chunks.arena.tickTheme === 'function') three.chunks.arena.tickTheme(performance.now() * 0.001);
    if (three.atmo) { try { three.atmo.dispose(); } catch (e) {} }
      try { three.atmo = new StageAtmosphere(three.scene, st); } catch (e) { three.atmo = null; }
      const _t1 = performance.now();
      setupChunkWorld(st, m.id);
      perfMark('switchMap.chunks', performance.now() - _t1, { stage: st, map: m.id });
      if (S) { S.mapId = m.id; S.mapStage = st; }
      applyFxinkAtmo(m.id);
      perfMark('switchMap', performance.now() - _t0, { stage: st, map: m.id });
      return { id: m.id, name: m.name, key: m.key, stageId: st };
    });
  };
  if (three._mapP) three._mapP = three._mapP.then(run, run);
  else three._mapP = run();
  const p = three._mapP;
  p.then(function () { if (three._mapP === p) three._mapP = null; });
  return p;
}

/* v0.22: 3×3 시드 청크 무한 맵을 (다시) 세운다. 스테이지가 바뀌면 통째로 갈아 끼운다. */
function setupChunkWorld(stageId, mapId) {
  if (!three) return null;
  if (three.chunks) {
    try { three.chunks.dispose(); } catch (e) {}
    three.chunks = null;
  }
  try {
    three.chunks = createChunkWorld({ stageId: stageId || 1, mapId: mapId || 'map1' });
    three.scene.add(three.chunks.group);
    /* 장이 바뀔 때마다 새 지면 재질이 생기므로 여기서 지면 소나 셰이더를 붙인다(지면만). */
    if (three.inkUniforms) {
      three.chunks.group.traverse(function (obj) {
        if (obj.isMesh && obj.material && obj.material.userData && obj.material.userData.inkGround) {
          attachGroundInkShader(obj.material, three.inkUniforms);
        }
      });
    }
    /* v0.39: 청크 소품도 같은 종이·안개 규칙. 배치 메시는 update() 때 생기므로,
       재질 목록을 직접 칠한다(메시가 생겨도 이미 패치된 재질을 공유한다). */
    try {
      const mats = three.chunks && three.chunks.materials;
      if (mats) mats.forEach(function (m) { paintCard(m, 'prop'); });
      paintCard(three.chunks.group, 'prop');
    } catch (e) {}
    const _t0 = performance.now();
    three.chunks.update(0, 0, (S && S.hero) ? S.hero.x : 0, (S && S.hero) ? S.hero.z : 0);
    perfMark('chunkWorld.build', performance.now() - _t0, { stage: stageId || 1 });
  } catch (e) {
    three.chunks = null;
    if (window.console && console.warn) console.warn('[심안] 청크 월드 생성 실패', e);
  }
  return three.chunks;
}

let DPR_QUERY = 0;
try {
  const q = parseFloat(new URLSearchParams(location.search).get('dpr'));
  if (q > 0) DPR_QUERY = Math.min(2.5, q);
} catch (e) {}

async function makeWorld() {
  const view = $('view');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  // On the RTX 3050 ANGLE/D3D11 path, enabling parallel link-status queries
  // produces GL_INVALID_VALUE at startup. Keep Three's ordinary link path on
  // that backend only; do not change the WebGL context or silence its errors.
  const gl = renderer.getContext();
  const gpuInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = gpuInfo ? gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL) : '';
  if (/ANGLE.*GeForce RTX 3050.*Direct3D11/i.test(gpuName)) {
    const hasExtension = renderer.extensions.has.bind(renderer.extensions);
    renderer.extensions.has = name => name !== 'KHR_parallel_shader_compile' && hasExtension(name);
  }
  /* 모바일 60fps: 기기 DPR을 2까지만 쓰고, 프레임이 무너지면 1까지 내린다. */
  const dprCap = DPR_QUERY || Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dprCap);
  renderer.setSize(view.clientWidth, view.clientHeight);
  renderer.shadowMap.enabled = true;
  /* v0.39 3단계: PCF(반경 사용) 경로 — 그림자 프러스텀을 카메라 가시 바닥에 맞추면서
     texel 이 작아졌으므로, 반경을 키워 부드러운 페넘브라를 얻는다(stock 청크 그대로 = 버전 안전). */
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  /* 셰이더마다 오류 로그를 동기로 읽으면 컴파일이 끝날 때까지 프레임이 멈춘다 — ?debug 때만 검사. */
  try { renderer.debug.checkShaderErrors = new URLSearchParams(location.search).has('debug'); } catch (e) {}
  const clear = nightColor();
  renderer.setClearColor(clear, 1);
  view.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(clear);
  scene.fog = new THREE.FogExp2(clear, 0.007);

  const camera = new THREE.PerspectiveCamera(CFG.fov || 62, view.clientWidth / Math.max(1, view.clientHeight), 0.1, 200);
  camera.position.set(CFG.camOff.x, CFG.camOff.y, CFG.camOff.z);
  camera.lookAt(0, CFG.camLookY, 0);

  const amb = new THREE.AmbientLight(palColor('rigAmbient'), 1.0);
  scene.add(amb);
  const hemi = new THREE.HemisphereLight(palColor('rigHemiSky'), palColor('rigHemiGround'), 1.0);
  scene.add(hemi);
  /* v0.36 컨셉 아트 톤: 달빛을 낮추고 중앙 등불을 키워, 가장자리는 먹빛으로 스며들고 가운데만 호박빛으로 맺힌다. */
  const moon = new THREE.DirectionalLight(palColor('rigMoonlight'), 1.25);
  moon.position.set(-18, 28, 10);
  moon.castShadow = true;
  moon.shadow.mapSize.set(fxQ === 'high' ? 2048 : 1024, fxQ === 'high' ? 2048 : 1024);
  /* 프러스텀은 fitShadowFrustum() 이 매 프레임 카메라가 보는 바닥에 맞춘다(초기값만 넉넉히). */
  moon.shadow.camera.left = -30; moon.shadow.camera.right = 30;
  moon.shadow.camera.top = 30; moon.shadow.camera.bottom = -30;
  moon.shadow.camera.near = 1; moon.shadow.camera.far = 90;
  moon.shadow.bias = -0.0011;
  moon.shadow.normalBias = 0.045;
  moon.shadow.radius = 2.4;
  moon.target.position.set(0, 0, 0);
  scene.add(moon);
  scene.add(moon.target);
  /* 그림자 진 곳을 죽이지 않는 반대편 달빛(그림자 없음) — 먹 그림자가 검은 구멍이 되지 않게. */
  const fill = new THREE.DirectionalLight(palColor('rigFill'), 0.6);
  fill.position.set(14, 12, -16);
  scene.add(fill);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 16),
    new THREE.MeshBasicMaterial({ color: clear, side: THREE.BackSide })
  );
  scene.add(sky);

  const map = await art.applyMap(scene, 'map1', null, { stage: 1 });
  /* v0.39: 무대 소품·원경 병풍·하늘을 같은 종이/안개 규칙으로 칠한다. */
  try { if (map && map.group) paintCard(map.group, 'prop'); } catch (e) {}
  try { if (sky && sky.material) { sky.material.userData.cardProfile = 'backdrop'; paintCard(sky.material, 'backdrop'); } } catch (e) {}
  const world = {
    renderer: renderer, scene: scene, camera: camera, map: map, torches: [], fx: [], slashes: [],
    view: view, fxForced: fxQForced, amb: amb, hemi: hemi, moon: moon, fill: fill, sky: sky, baseClear: clear,
    dprCap: dprCap, dprNow: dprCap, atmo: new StageAtmosphere(scene, 1)
  };
  /* 점광원 풀은 재질 예열(prewarmInkSlash) 전에 만든다 — 조명 개수가 바뀌면 예열한 프로그램이 다시 링크된다.
     상시 visible(강도 0) 점광원은 모든 조명 재질의 프래그먼트 비용이므로, 품질이 high 가 아니면 2개만 만든다. */
  world.lights = new InkLightPool(scene, { maxLights: fxQ === 'high' ? 4 : 2, distance: 13 });
  world.inkUniforms = createWorldInkUniforms();
  try {
    /* post() 는 build() 때마다 다시 불리므로(품질 변경) 패스도 매번 새로 만든다 — dispose 된 패스를 재사용하지 않게. */
    world.bloom = setupBloom(renderer, scene, camera, {
      quality: fxQ,
      depth: true,
      post: function () {
        if (PIXEL_LOOK) {
          const px = createPixelLookPass();
          px.setPixelRatio(renderer.getPixelRatio());
          return [createCinematicPass(), px];
        }
        const wash = createInkWashPass();
        wash.enableDepth(camera.near, camera.far);
        /* v0.40 4단계: 마지막에 틸트시프트 심도 — 디오라마를 접사로 찍은 룩. 저사양은 레더가 끈다.
           깊이는 RenderPass 직후에 따로 떠 둔다(체인 끝에서는 readBuffer 깊이가 이미 비어 있다). */
        const dof = createTiltShiftPass({ amount: 0.72, band: 6.5, soft: 14.0 });
        const dep = createDepthCapture(dof);
        dof.setCamera(camera);
        dep.setCamera(camera);
        dof.setLevel(0);
        return [dep, wash, createCinematicPass(), dof];
      }
    });
  } catch (e) { world.bloom = null; }
  /* v0.39 2단계: 후처리에도 같은 월드 안개 목표를 넘긴다 — 재질이 놓친 픽셀(하늘·구멍)을 한 겹 더 잠근다. */
  try {
    const wash = world.bloom && world.bloom.post && washOf(world.bloom.post);
    if (wash && wash.setFadeSource) wash.setFadeSource(camera, WF_POST);
  } catch (e) {}
  try {
    world.ink = new InkParticles(scene, { base: FXINK_BASE, quality: fxQ === 'high' ? 'high' : 'low' });
    /* v0.41: 종이 컷아웃 멀티프레임 이펙트(스킬·타격·부적·혼소멸) */
    try { world.paper = new PaperFx(scene, { quality: fxQ === 'high' ? 'high' : 'low' }); } catch (e) { world.paper = null; }
    /* v0.43: 바닥에 남는 원소 흔적(먹 튐·그을림·얼음 균열·번개 자국) */
    try { world.traces = new TraceField(scene, { cap: fxQ === 'high' ? 10 : 6 }); } catch (e) { world.traces = null; }
    /* 바닥 먹 데칼은 밝아진 2.5D 바닥에서 검은 사각형으로 읽혀 끈다. 튐·터짐은 유지. */
    if (world.ink.decals) world.ink.decals.mesh.visible = false;
  } catch (e) { world.ink = null; }
  try { prewarmInkSlash(renderer, scene, camera); } catch (e) {}
  try {
    renderer.domElement.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      if (window.console && console.warn) console.warn('[심안] WebGL context lost — 복구를 기다립니다');
    }, false);
  } catch (e) {}
  world.ql = { level: 0, lowT: 0, highT: 0, cool: 0, lockAt: 99, lastUp: -99, t: 0 };
  initOverlayShell();
  return world;
}

/* 후처리 fade 소스: cardstock 의 공유 uniform 을 그대로 읽고, 화면 좌표만 여기서 더한다. */
const WF_POST = { uWfHero: WF.uWfHero, uWfRange: WF.uWfRange, uWfAmt: WF.uWfAmt, uWfColor: WF.uWfColor, uWfDirK: WF.uWfDirK, heroScreen: new THREE.Vector2(0.5, 0.5), post: 0.50 };
/* 품질 변경으로 포스트 체인이 다시 만들어져도 안개 소스를 다시 묶는다(새 패스는 소스가 없다). */
function wireFadeSource() {
  try {
    const w = three;
    const wash = w && w.bloom && washOf(w.bloom.post);
    if (wash && wash.setFadeSource && w.camera) wash.setFadeSource(w.camera, WF_POST);
    const dp = dofPassOf();
    if (dp && w && w.camera) { dp.setCamera(w.camera); dp.setLevel(w.ql ? w.ql.level : 0); }
    const dc = depPassOf();
    if (dc && w && w.camera) dc.setCamera(w.camera);
  } catch (e) {}
}
/* v0.40: 포스트 체인에서 수묵 워시 패스를 찾는다(체인 앞에 깊이 캐시 패스가 들어와도 안전). */
function washOf(post) {
  if (!post) return null;
  for (let i = 0; i < post.length; i++) if (post[i] && post[i].setFadeSource) return post[i];
  return null;
}
/* v0.40: 깊이 캐시 패스(체인 맨 앞)를 찾는다. */
function depPassOf() {
  const w = three;
  const post = w && w.bloom && w.bloom.post;
  if (!post) return null;
  for (let i = 0; i < post.length; i++) if (post[i] && post[i].setCamera && !post[i].setFocus) return post[i];
  return null;
}
/* v0.40: 포스트 체인에서 틸트시프트 심도 패스를 찾는다(품질 변경으로 체인이 새로 만들어져도 매번 찾는다). */
function dofPassOf() {
  const w = three;
  const post = w && w.bloom && w.bloom.post;
  if (!post) return null;
  for (let i = 0; i < post.length; i++) if (post[i] && post[i].setFocus) return post[i];
  return null;
}
/* QA/튜닝 스위치 — 0 이면 각 층의 안개를 끈다(전후 비교 스크린샷용). */
let qaFadeMat = 1, qaFadePostK = 1, qaFadeColor = false;

/* ---------- v0.39 3단계: 그림자 프러스텀 피팅 ----------
   60m 고정 ortho(1024)는 화면에 보이는 10~15m 바닥에 비해 해상도를 4배 이상 낭비했다.
   매 프레임 카메라가 보는 바닥 영역을 재어 반음(0.5m) 단위로 맞추고, 그림자 텍셀에 스냅한다
   (스냅하지 않으면 카메라가 움직일 때 그림자 가장자리가 흐물흐물 떨린다). */
const _shadowDir = new THREE.Vector3(-18, 28, 10).normalize();
const _shadowC = new THREE.Vector3();
const _shadowR = new THREE.Vector3();
const _shadowU = new THREE.Vector3();
const _shadowTmp = new THREE.Vector3();
const _shadowFwd = new THREE.Vector3();
const _shadowUp = new THREE.Vector3();
const _shadowEye = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
let _shadowExtent = -1;
function fitShadowFrustum() {
  const w = three;
  if (!w || !w.moon || !w.camera) return;
  const moon = w.moon, cam = w.camera;
  if (!moon.castShadow) return;
  const MS = moon.shadow, c = MS.camera;
  cam.updateMatrixWorld();
  const e = cam.matrixWorld.elements;
  _shadowR.set(e[0], 0, e[2]);
  _shadowFwd.set(-e[8], -e[9], -e[10]);
  _shadowUp.set(e[4], 0, e[6]);
  if (_shadowR.lengthSq() < 1e-8) _shadowR.set(1, 0, 0);
  _shadowR.normalize();
  const sinPitch = Math.min(1, Math.max(0.2, -_shadowFwd.y));
  _shadowEye.setFromMatrixPosition(cam.matrixWorld);
  let dist = 18;
  if (_shadowFwd.y < -0.05) {
    const t = Math.min(200, _shadowEye.y / -_shadowFwd.y);
    _shadowC.copy(_shadowEye).addScaledVector(_shadowFwd, t);
    dist = t;
  } else {
    _shadowC.copy(_shadowEye);
    dist = _shadowEye.distanceTo(_shadowC);
  }
  _shadowC.y = 0;
  /* 영웅 쪽으로 조금 당겨, 화면 아래(플레이어) 그림자가 더 선명하게 들어오게. */
  if (S && S.hero) {
    _shadowC.x += (S.hero.x - _shadowC.x) * 0.35;
    _shadowC.z += (S.hero.z - _shadowC.z) * 0.35;
  }
  const fovTan = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
  const halfW = dist * fovTan * (cam.aspect || 1);
  const halfD = (dist * fovTan) / sinPitch;
  let want = Math.max(halfW, halfD) * 1.12 + 1.5;
  want = Math.min(26, Math.max(6, Math.ceil(want * 2) / 2));
  const size = MS.mapSize.x || 1024;
  if (want !== _shadowExtent) {
    _shadowExtent = want;
    c.left = -want; c.right = want; c.top = want; c.bottom = -want;
    c.near = 1; c.far = 90;
    c.updateProjectionMatrix();
    /* penumbra: 프러스텀 반경에 반비례하는 월드 크기를 텍셀 단위로 환산한다. */
    moon.shadow.radius = Math.max(1.4, Math.min(3.4, 2.4 * (30 / want)));
  }
  /* 텍셀 스냅 */
  const texel = (2 * _shadowExtent) / size;
  _shadowR.crossVectors(WORLD_UP, _shadowDir).normalize();
  _shadowU.crossVectors(_shadowDir, _shadowR).normalize();
  const a = Math.round(_shadowC.dot(_shadowR) / texel) * texel;
  const b = Math.round(_shadowC.dot(_shadowU) / texel) * texel;
  _shadowTmp.set(0, 0, 0).addScaledVector(_shadowR, a).addScaledVector(_shadowU, b).addScaledVector(_shadowDir, _shadowC.dot(_shadowDir));
  moon.target.position.copy(_shadowTmp);
  moon.position.copy(_shadowTmp).addScaledVector(_shadowDir, 35);
  moon.target.updateMatrixWorld();
  moon.updateMatrixWorld();
}

/* One quality ladder for the whole look. Going down: shadows off, bloom low, then resolution in steps.
   Going up again when the frame rate has recovered, so a hitch early in a run does not leave the
   screen soft for the rest of it. A level that drops again within 10 s of being restored is locked. */
const QL_LEVELS = 5;
function applyQuality(level) {
  const w = three; if (!w) return;
  const shadows = level < 1;
  if (w.moon && w.moon.castShadow !== shadows) w.moon.castShadow = shadows;
  /* v0.39 3단계: 그림자 맵 해상도도 레더에 연결한다. 프러스텀이 카메라 가시 바닥에 맞춰지므로
     1024 로도 충분히 선명하다 — 한 단계 내려가면 바로 1024 로 떨어뜨린다.
     (맵 크기를 바꿀 때는 기존 맵을 버려야 three 가 다시 굽는다.) */
  if (w.moon) {
    const want = level < 1 && fxQ === 'high' ? 2048 : 1024;
    const ms = w.moon.shadow.mapSize;
    if (ms.x !== want) {
      ms.set(want, want);
      if (w.moon.shadow.map) { w.moon.shadow.map.dispose(); w.moon.shadow.map = null; }
      _shadowExtent = -1;
    }
  }
  /* 가장 낮은 두 단계에서는 후처리 안개 한 겸을 생략한다(재질 안개가 그대로 남아 룩은 유지된다). */
  qaFadePostK = level >= 3 ? 0 : 1;
  /* v0.40 4단계: 틸트시프트 심도도 같은 레더에 매단다 — 3단계 이하(저사양)에서 자동으로 꺼진다. */
  try { const dp = dofPassOf(); if (dp) dp.setLevel(level); } catch (e) {}
  const bq = level < 2 ? fxQualityFromUrl() : 'low';
  if (w.bloom && w.bloom.quality !== bq && bq !== 'off') {
    w.bloom.setQuality(bq);
    if (w.ink) w.ink.setQuality(bq === 'high' ? 'high' : 'low');
    wireFadeSource();
  }
  const dprSteps = [w.dprCap, w.dprCap, w.dprCap, Math.max(1, w.dprCap - 0.5), Math.max(1, w.dprCap - 1)];
  const d = Math.round(dprSteps[Math.min(level, QL_LEVELS - 1)] * 10) / 10;
  if (Math.abs((w.dprNow || 0) - d) > 0.01) { w.dprNow = d; w.renderer.setPixelRatio(d); onResize(); }
}
function stepQuality(real) {
  const w = three;
  if (!w || !w.renderer || DPR_QUERY || w.fxForced || !w.ql || !(real > 0) || real > 0.5) return;
  const q = w.ql;
  q.t += real;
  if (q.cool > 0) { q.cool -= real; return; }
  const fpsNow = 1 / real;
  q.lowT = fpsNow < CFG.qlLowFps ? q.lowT + real : Math.max(0, q.lowT - real * 0.5);
  q.highT = fpsNow >= CFG.qlHighFps ? q.highT + real : 0;
  if (q.lowT >= CFG.qlDownSec && q.level < QL_LEVELS - 1) {
    if (q.t - q.lastUp < 10) q.lockAt = q.level;
    q.level++; q.lowT = 0; q.highT = 0; q.cool = 2;
    applyQuality(q.level);
  } else if (q.highT >= CFG.qlUpSec && q.level > 0 && q.level - 1 < q.lockAt) {
    q.level--; q.lowT = 0; q.highT = 0; q.cool = 2; q.lastUp = q.t;
    applyQuality(q.level);
  }
}

function addEntityVisual(kind, shape, opt) {
  const group = art.makeChar(kind, shape, opt);
  three.scene.add(group);
  /* v0.39: 캐릭터 파츠는 그림(그림자 재질)이므로 안개를 면제하고 종이 결만 얇게 입힌다.
     혼령·보스는 조준 표적이라 더더욱 어둠에 잠기면 안 된다. */
  try { if (group) paintCard(group, kind === 'spirit' ? 'spirit' : kind === 'item' ? 'item' : 'figure'); } catch (e) {}
  return group;
}
/* 잔상(3D 뼈대 고스트)은 주인공의 지오메트리를 공유한다 — 지오메트리만 놓지 않고 재질만 놓아 준다. */
function disposeCharGeom(g) {
  if (g && g.userData && g.userData.sharedGeom) {
    const mesh = g.userData.sprite;
    mesh.skeleton.dispose();
    mesh.material.dispose();
    return;
  }
  try {
    g.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
  } catch (e) {}
}
function placeGroup(g, x, z, bob) {
  if (!g) return;   /* 그림 없는 판정용 개체(QA·임시 기물) — 위치를 옮길 몸이 없다 */
  g.position.set(x, bob || 0, z);
}

/* ---------- v0.30 §11 접근성 · §8.2 '처음 보는 순간' · §7.3 동적 보정 · §8.1 몸통 튜토리얼 ----------
   난이도·연패·첫 경험은 모두 save에 남긴다(기기 안, 개인정보 없음). */
function a11yCb() { return !!(save.a11y && save.a11y.colorblind); }
/** 화면 흔들림을 줄이는 설정(켜면 흔들림 ×0.3, 느린 화면은 0.6배까지). */
function a11yShake() { return !!(save.a11y && save.a11y.shake); }
function setA11y(key, v) {
  save.a11y = save.a11y || { colorblind: 0, shake: 0 };
  save.a11y[key] = v ? 1 : 0;
  persist();
  syncA11yUi();
  return !!save.a11y[key];
}
function syncA11yUi() {
  const cb = a11yCb(), sh = a11yShake();
  [['btnCb', '색약 팔레트'], ['btnCb1', '색약 팔레트']].forEach(function (p) {
    const b = $(p[0]); if (b) { b.textContent = p[1] + ': ' + (cb ? '켬' : '끔'); b.classList.toggle('on', cb); }
  });
  [['btnShake', '화면 흔들림'], ['btnShake1', '화면 흔들림']].forEach(function (p) {
    const b = $(p[0]); if (b) { b.textContent = p[1] + ': ' + (sh ? '줄임' : '켬'); b.classList.toggle('on', sh); }
  });

}
function setLevelMode(mode) {
  save.levelMode = 'pause';
  persist();
  syncA11yUi();
  return save.levelMode;
}
/* §8.2 저장 단위 기록: 한 번 본 순간은 다시 늦추지 않는다(무늬·패턴·기물·칼 튕김·참). */
function seen(k) { return !!(save.moments && save.moments[k]); }
function markSeen(k) {
  save.moments = save.moments || {};
  if (qa && qa.noFirstMoments) return false;
  if (save.moments[k]) return false;
  save.moments[k] = 1;
  persist();
  return true;
}
/* §7.3 같은 장 연패 기억. */
function streakOf(stageNo) {
  const s = save.streak;
  return (s && (s.stage | 0) === (stageNo | 0)) ? (s.n | 0) : 0;
}
function bumpStreak(stageNo, win) {
  const n = win ? 0 : Math.min(9, streakOf(stageNo) + 1);
  save.streak = n ? { stage: stageNo | 0, n: n } : null;
  persist();
  return n;
}
/** 느린 화면을 한 가지 통로로 모은다(튜토리얼·첫 등장·간발). 흔들림을 줄인 설정이면 0.6배까지. */
function addSlow(mul, dur) {
  if (!S) return;
  let m = mul, d = dur;
  if (a11yShake() || reducedMotion()) { m = Math.max(0.6, m); d = Math.max(d, 0.001) * 0.6; }
  S.slowMul = Math.min(S.slowMul || 1, m);
  S.slowMulT = Math.max(S.slowMulT || 0, d);
}
function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}
/* 무늬·기물의 유도 획 모양(화면 좌표). 유도 획·첫 등장 안내·기물 연습이 같은 함수를 쓴다. */
function ghostShapePath(type, cx, cy, s) {
  const p = [];
  const line = function (x1, y1, x2, y2, n) {
    n = n || 20;
    for (let i = 0; i < n; i++) { const t = i / (n - 1); p.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }); }
  };
  if (type === 'vline') line(cx, cy - s, cx, cy + s, 18);
  else if (type === 'vee') { line(cx - s * 0.8, cy - s * 0.7, cx, cy + s * 0.8, 12); line(cx, cy + s * 0.8, cx + s * 0.8, cy - s * 0.7, 12); }
  else if (type === 'bolt') { line(cx + s * 0.25, cy - s, cx - s * 0.25, cy - s * 0.15, 8); line(cx - s * 0.25, cy - s * 0.15, cx + s * 0.3, cy + s * 0.12, 7); line(cx + s * 0.3, cy + s * 0.12, cx - s * 0.25, cy + s, 9); }
  else if (type === 'circle') { for (let i = 0; i <= 44; i++) { const a = -Math.PI * 0.5 + Math.PI * 2 * (i / 44); p.push({ x: cx + Math.cos(a) * s * 0.8, y: cy + Math.sin(a) * s * 0.8 }); } }
  else if (type === 'square') { line(cx - s * 0.7, cy - s * 0.7, cx + s * 0.7, cy - s * 0.7, 10); line(cx + s * 0.7, cy - s * 0.7, cx + s * 0.7, cy + s * 0.7, 10); line(cx + s * 0.7, cy + s * 0.7, cx - s * 0.7, cy + s * 0.7, 10); line(cx - s * 0.7, cy + s * 0.7, cx - s * 0.7, cy - s * 0.7, 10); }
  else if (type === 'tri') { line(cx, cy - s * 0.8, cx + s * 0.8, cy + s * 0.6, 10); line(cx + s * 0.8, cy + s * 0.6, cx - s * 0.8, cy + s * 0.6, 10); line(cx - s * 0.8, cy + s * 0.6, cx, cy - s * 0.8, 10); }
  else if (type === 'arc') { for (let i = 0; i <= 26; i++) { const a = Math.PI * (i / 26); p.push({ x: cx - Math.cos(a) * s * 0.85, y: cy + Math.sin(a) * s * 0.6 }); } }
  else if (type === 'spiral') { for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * Math.PI * 4.0 - 0.4, r = s * (0.1 + 0.75 * t); p.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } }
  else line(cx - s, cy, cx + s, cy, 18);
  return p;
}
/** 반여명의 획 가이드: 콸리콸 흐르는 점선. 대각 위에 작은 획이 머리무리에서 나가는 방향으로 움직인다. */
function drawGhostPath(ctx, pts, color, alpha, width) {
  if (!pts || pts.length < 2) return;
  const t = (S && S.elapsed) || 0;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.globalAlpha = alpha * 0.35;
  ctx.lineWidth = (width || 5) + 3;
  ctx.beginPath();
  pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width || 5;
  ctx.setLineDash([12, 10]);
  ctx.lineDashOffset = -((t * 90) % 22);
  ctx.beginPath();
  pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
  ctx.stroke();
  ctx.setLineDash([]);
  /* 머리(그리는 방향): 마지막 두 점의 방향으로 화살촉 */
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - Math.cos(ang - 0.5) * 15, b.y - Math.sin(ang - 0.5) * 15);
  ctx.lineTo(b.x - Math.cos(ang + 0.5) * 15, b.y - Math.sin(ang + 0.5) * 15);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
/* ---------- §8.1 첫 10초 몸통 튜토리얼 ---------- */
function startTutorial(force) {
  if (!S) return null;
  if (!force && S.stageNo !== 1) return null;
  S.tutorial = { on: true, t: 0, first: false, firstAt: -1, tapDone: false };
  S.tutSlow = CFG.tut.slow0;
  const b = $('btnSkip');
  if (b) b.hidden = false;
  return S.tutorial;
}
function endTutorial(reason) {
  if (!S || !S.tutorial) return false;
  S.tutorial = null;
  S.tutSlow = 1;
  hideGuide();
  const b = $('btnSkip');
  if (b) b.hidden = true;
  save.tutorialDone = 1;
  persist();
  telemetry.event('tutorial', { done: reason || 'end' });
  return true;
}
/** 튜토리얼·첫 등장 연출은 게임 시간이 아니라 실제 시간으로 센다(느린 화면에 안 밀리게). */
function stepTutorial(real) {
  if (!S) return;
  if (S.slowMulT > 0) {
    S.slowMulT -= real;
    if (S.slowMulT <= 0) { S.slowMulT = 0; S.slowMul = 1; }
  }
  const T = S.tutorial;
  if (!T || !T.on) { S.tutSlow = 1; return; }
  T.t += real;
  tickTutorial();
}
/** 단계 문턱(5초 제자리 탭·10초 종료)을 한 곳에 모은다 — QA에서는 advanceTutorial로 결정론적으로 돌린다. */
function tickTutorial() {
  const T = S && S.tutorial;
  if (!T || !T.on) return;
  if (!T.first) S.tutSlow = CFG.tut.slow0;
  else if (T.firstAt >= 0 && (T.t - T.firstAt) < CFG.tut.firstDur) S.tutSlow = CFG.tut.firstSlow;
  else S.tutSlow = 1;
  if (!T.tapSpawned && T.t >= CFG.tut.tapAt) {
    T.tapSpawned = true;
    /* 제자리 탭 단계: 앞에서 귀물 하나가 다가온다. 탭은 패링 — 실패해도 피해 없음. */
    if (!reducedMotion()) addSlow(CFG.tut.tapSlow, CFG.tut.tapSlowDur);
    const p = S.hero;
    spawnZombie({ x: p.x + Math.cos(-Math.PI / 2) * 2.6, z: p.z + Math.sin(-Math.PI / 2) * 2.6, type: 'imp' });
    showGuide('제자리 탭', 2.4);
    if (audio && audio.gong) audio.gong();
  }
  if (S.playing) S.iframe = Math.max(S.iframe || 0, 0.25);
  if (T.t >= CFG.tut.end) endTutorial('end');
}
function tutorialFirstSuccess() {
  const T = S && S.tutorial;
  if (!T || !T.on || T.first) return false;
  T.first = true; T.firstAt = T.t;
  addHitstop(0.05);
  if (audio && audio.slash) audio.slash();
  showGuide('일섬!', 1.6);
  return true;
}
/* 안내를 그릴 대상: 튜토리얼의 첫 혼령 */
function guideSpirit() {
  const ms = livingMarks();
  if (!ms.length) return null;
  return nearestTo(ms, S.hero);
}
function drawTutorial(ctx, r, hs) {
  if (!S) return;
  const T = S.tutorial;
  const t = S.elapsed || 0;
  /* 참 게이지 100 첫 안내: 화면 가운데 O 유도 획 1회 */
  if (S.chargeGuide > 0) {
    S.chargeGuide -= frameDt;
    const k = clamp(S.chargeGuide / 2.2, 0, 1);
    drawGhostPath(ctx, ghostShapePath('circle', r.width * 0.5, r.height * 0.42, Math.min(r.width, r.height) * 0.16), 'rgba(91,232,196,1)', 0.35 + 0.35 * k, 6);
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(244,236,214,' + (0.7 * k).toFixed(2) + ')';
    ctx.font = '700 15px serif'; ctx.fillText('O — 참(斬)', r.width * 0.5, r.height * 0.42 + Math.min(r.width, r.height) * 0.16 + 26); ctx.restore();
  }
  /* 새 무늬 첫 혼령: 0.8초 반투명 유도 획 */
  if (S.newShape && S.newShape.guide > 0) {
    S.newShape.guide -= frameDt;
    const sp = guideSpirit();
    if (sp) {
      const p = projectXZ(sp.x, sp.z, 0.9);
      const a = clamp(S.newShape.guide / (CFG.firstShapeGuide || 0.8), 0, 1);
      drawGhostPath(ctx, ghostShapePath(spiritShape(sp), p.x, p.y, Math.max(26, Math.min(r.width, r.height) * 0.075)), 'rgba(244,236,214,1)', a, 6);
    }
  }
  /* 기물 연습: 보스 등장 직후 3초, 가장 가까운 기물로 유도 획 */
  if (S.totemGuide > 0) {
    S.totemGuide -= frameDt;
    const tt = nearestTo(bossMinions(), S.hero);
    if (tt) {
      const p = projectXZ(tt.x, tt.z, 0.9);
      const a = clamp(S.totemGuide / (CFG.totemPractice || 3), 0, 1);
      drawGhostPath(ctx, ghostShapePath(tt.shape || 'tri', p.x, p.y, Math.max(24, Math.min(r.width, r.height) * 0.07)), 'rgba(201,166,255,1)', a, 6);
    }
  }
  /* 첫 칼 튕김: 빈틈 고리를 가리키는 화살표 */
  if (S.bounceArrow > 0) {
    S.bounceArrow -= frameDt;
    const b = S.boss;
    if (b && b.alive) {
      const p = projectXZ(b.x, b.z, 0.05), k = clamp(S.bounceArrow / 3, 0, 1);
      const wpc = worldPerCss(), rx = 2.6 * wpc, ry = rx * 0.55;
      ctx.save(); ctx.globalAlpha = 0.5 + 0.4 * k; ctx.strokeStyle = 'rgba(255,240,200,0.95)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      const ang = -Math.PI * 0.5 + Math.sin(t * 2) * 0.25;
      const ax = p.x + Math.cos(ang) * rx * 1.55, ay = p.y + Math.sin(ang) * ry * 4.0;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.lineTo(ax + Math.cos(ang + Math.PI * 0.85) * 16, ay + Math.sin(ang + Math.PI * 0.85) * 16);
      ctx.lineTo(ax + Math.cos(ang - Math.PI * 0.85) * 16, ay + Math.sin(ang - Math.PI * 0.85) * 16);
      ctx.closePath(); ctx.fillStyle = 'rgba(255,240,200,0.95)'; ctx.fill(); ctx.restore();
    }
  }
  if (!T || !T.on) return;
  /* 0~0.5초: 첫 혼령 위로 획이 흐른다 + 그 방향으로 손가락 길 안내 */
  if (!T.first) {
    const sp = guideSpirit();
    if (sp) {
      const p = projectXZ(sp.x, sp.z, 0.9);
      const sh = spiritShape(sp);
      drawGhostPath(ctx, ghostShapePath(sh, p.x, p.y, Math.max(30, Math.min(r.width, r.height) * 0.085)), 'rgba(244,236,214,1)', 0.8, 7);
      /* 손가락 궤적: 주인공에서 혼령으로 */
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = 'rgba(120,240,200,0.9)'; ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]); ctx.lineDashOffset = -((t * 70) % 14);
      ctx.beginPath(); ctx.moveTo(hs.x, hs.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.setLineDash([]);
      /* 길잡이 원 */
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 5);
      ctx.beginPath(); ctx.arc(hs.x, hs.y, 26, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  /* 5.0초 제자리 탭 단계: 주인공 주위 패링 링 */
  if (T.tapSpawned && !T.tapDone) {
    const R = (CFG.parryR || 2.4) * worldPerCss();
    ctx.save();
    ctx.strokeStyle = 'rgba(232,192,74,' + (0.45 + 0.35 * Math.sin(t * 6)).toFixed(3) + ')';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hs.x, hs.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([5, 7]); ctx.lineDashOffset = -((t * 40) % 12);
    ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hs.x, hs.y, R * 0.7, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }
}
/* ---------- §7.2·§7.3 타이틀 난이도 UI ---------- */
function renderModes() {
  const box = $('titleModes');
  if (!box) return;
  const gosu = gosuUnlocked();
  const cur = MODES[save.mode] ? save.mode : 'jeongseok';
  box.querySelectorAll('[data-mode]').forEach(function (b) { b.remove(); });
  box.innerHTML = MODE_ORDER.map(function (id) {
    const m = MODES[id];
    const lock = id === 'gosu' && !gosu;
    const on = id === cur && !lock;
    return '<button type="button" class="mode-btn' + (on ? ' on' : '') + (lock ? ' lock' : '') + '" data-mode="' + id + '"' + (lock ? ' disabled aria-disabled="true"' : '') + '>'
      + '<b>' + m.name + '</b><span>' + (lock ? '12장 클리어' : m.tag) + '</span></button>';
  }).join('');
  box.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      const id = b.getAttribute('data-mode');
      if (id === 'gosu' && !gosuUnlocked()) { toast('고수 모드는 12장을 깨면 열립니다'); return; }
      setMode(id);
      if (audio && audio.bell) audio.bell(0, 'hline');
    });
  });
  const note = $('titleModeNote');
  if (note) note.textContent = MODE_NOTE[cur] || '';
}
function setMode(id) {
  if (!MODES[id]) return save.mode;
  if (id === 'gosu' && !gosuUnlocked()) return save.mode;
  save.mode = id;
  persist();
  renderModes();
  refreshTitleHelp();
  return save.mode;
}

/* ---------- game state ---------- */
function startRun(opts) {
  const _tRun = performance.now();
  opts = opts || {};
  /* QA sandbox도 장을 지정할 수 있다(v0.32 지형·보스 검증). 지정이 없으면 1장. */
  const stageNo = clamp((opts.stage != null ? opts.stage : (opts.sandbox ? 1 : (save.stage || 1))) | 0, 1, STAGES.length);
  const st = stageOf(stageNo);
  hideOvs();
  closeQuickCards();
  clearEntities();
  if (audio && audio.setBossMode) audio.setBossMode(false);
  /* 판 모드는 타이틀에서 고른 save.mode를 따른다(이전 판의 S.mode에 묶이지 않게). */
  const runMode = modeOf(save.mode || 'jeongseok').id;
  /* 소개 카드를 거치지 않고 바로 시작하는 경로(QA·다시 버튼)도 예열은 반드시 거친다.
     다만 QA에서 소프트웨어 GL이라 셰이더 컴파일이 분 단위가 되는 환경이면 qa.skipWarm으로 빠진다. */
  if (!qa.skipWarm && !shadersWarmed()) warmShaders();
  hudCtrl.syncActTheme(actOf(stageNo));
  S = createRunState({
    opts,
    stageNo,
    st,
    runMode,
    mapId: mapIdOf(opts.stage != null ? opts : Object.assign({}, opts, { stage: stageNo })),
    cfg: CFG,
    save,
    shapeUnlock: SHAPE_UNLOCK,
    createInputQueue,
    createDashLatencyTracker,
    modeOf
  });
  terrainInit();
  S.runNo = opts.sandbox ? SHAPE_UNLOCK.length : stageNo;
  S.pool = opts.sandbox ? SHAPE_UNLOCK.slice() : (st.shapes || SHAPE_UNLOCK.slice()).slice();
  initGoal(st, opts);
  if (opts.challenge) initChallenge(opts.challenge, stageNo);
  /* §7.2·§7.3: 이 판의 예고 배율(모드 × 연패 보정)과 판 시작 도움. */
  S.mode = runMode;
  S.streak = opts.sandbox ? 0 : streakOf(stageNo);
  S.teleMul = modeOf(runMode).tele;
  S.help = [];
  if (!opts.sandbox && S.mode !== 'gosu' && S.streak >= 2) {
    S.charge = Math.min(CFG.cleaveCharge || 100, CFG.help2Charge || 30);
    S.help.push('판 시작 참 +' + Math.round(S.charge));
  }
  if (!opts.sandbox && S.mode !== 'gosu' && S.streak >= 3) {
    S.teleMul *= CFG.help3Tele || 1.1;
    S.help.push('예고 +10%');
  }
  if (!opts.sandbox && S.mode !== 'gosu' && S.streak >= (CFG.helpOfferAt || 4)) S.help.push('수련 모드 권유');
  /* §9.4 연꽃 등: 판 시작 참 +30 */
  if (relicOn(save, 'lantern')) S.charge = Math.min(CFG.cleaveCharge || 100, (S.charge || 0) + 30);
  if (S.help.length) telemetry.event('stage_help', { stage: stageNo, streak: S.streak, help: S.help.slice() });
  /* §8.2 새 무늬: 이 장에서 처음 보는 무늬라면 첫 혼령에 0.8초 유도 획. */
  if (!opts.sandbox) {
    const ns = S.pool[S.pool.length - 1];
    if (ns && !seen('shape:' + ns)) {
      markSeen('shape:' + ns);
      S.newShape = { shape: ns, guide: 0, need: 1, t0: S.elapsed };
    }
  }
  /* §13 데이터: 판 시작(장·모드·판 번호). 기기 안에만 쌓인다. */
  telemetry.event('stage_start', { stage: opts.sandbox ? 0 : stageNo, mode: S.mode, run: opts.sandbox ? 0 : (save.runs || 0) + 1, sandbox: !!opts.sandbox, streak: S.streak, help: S.help.slice() });
  if (!opts.sandbox) {
    /* 스테이지의 새 획을 먼저 연습할 시간을 준다(첫 10초는 잔몹 상한 2). */
    S.practiceShape = S.pool[S.pool.length - 1];
    S.practiceT = CFG.practiceSec;
    S.practiceSpawns = CFG.practiceSpawns;
    if (!opts.replay) save.runs = (save.runs || 0) + 1;
    persist();
  }
  const appEl = $('app');
  if (appEl) {
    appEl.classList.remove('ink-burst');
    appEl.classList.remove('hurt');
    appEl.style.removeProperty('--hero-x');
    appEl.style.removeProperty('--hero-y');
    clearOnebell(true);
  }
  if (three && three.map && (three.map.id !== S.mapId || three.map.stageId !== S.mapStage)) switchMap(S.mapId, S.mapStage);
  else applyFxinkAtmo(S.mapId);
  if (three && three.atmo) three.atmo.setCenter(0, 6, 0);
  applyStageAtmo(st);
  if (three && three.heroSpr) { three.scene.remove(three.heroSpr); }
  three.heroSpr = addEntityVisual('hero');
  placeGroup(three.heroSpr, 0, 0);
  three.camera.position.set(CFG.camOff.x, CFG.camOff.y, CFG.camOff.z);
  three.camera.lookAt(0, CFG.camLookY, 0);
  applyCameraLens();
  applyRingBoost();
  closeArena(true);
  if (three && three.chunks) { const _tc = performance.now(); three.chunks.reset(0, 0); perfMark('chunksReset', performance.now() - _tc, { stage: stageNo }); }
  renderHud();
  lastTs = 0;
  if (audio) { audio.setQuiet(qa.mute, qa.noDelay); audio.startBgm(); }
  if (!opts.sandbox) {
    spawnOpening();
    snapSpiritsToTargets();
  }
  triggerSightWave();
  hideGuide();
  const btnSkip = $('btnSkip');
  if (btnSkip) btnSkip.hidden = true;
  /* §8.1: 1장 첫 진입(또는 타이틀 "수련" 다시 보기)에만 3단 몸통 튜토리얼. */
  const wantTut = !opts.sandbox && (opts.replay || (stageNo === 1 && !save.tutorialDone));
  if (wantTut) startTutorial(!!opts.replay);
  if (three) { three.camera.position.set(CFG.camOff.x, CFG.camOff.y, CFG.camOff.z); }
  if (!opts.sandbox) {
    if (wantTut) {
      /* 튜토리얼은 화면당 6자 이내 문구만 — 설명창 없이 몸으로 익힌다. */
      showGuide('그어 보세요', 6);
    } else {
      /* 첫 진입 안내: 이 판에서 무엇을 그려야 하는지 한 줄. 조작을 막지 않는다. */
      const sh = S.practiceShape || (S.pool && S.pool[0]) || 'hline';
      const hint = SHAPE_HINT[sh] || '혼령의 종 모양을 따라 그어 보세요';
      showGuide('<b>' + (SHAPE_MARK[sh] || '') + '</b> ' + hint + ' — 그으면 일섬', stageNo === 1 ? 7 : 5);
    }
  }
  if (!raf) loop(now());
  perfMark('startRun', performance.now() - _tRun, { stage: stageNo });
}

function clearEntities() {
  if (!S || !three) return;
  function rm(list) { list.forEach(function (e) { if (e.obj) three.scene.remove(e.obj); }); }
  rm(S.spirits || []); rm(S.zombies || []); rm(S.items || []);
  (three.dying || []).forEach(function (d) { three.scene.remove(d.obj); });
  three.dying = [];
  inkFx.clear();
  bossFx.clear();
  (three.fx || []).forEach(function (f) { three.scene.remove(f.mesh); });
  three.fx = [];
  if (three.ink && three.ink.clear) three.ink.clear();
  if (three.paper && three.paper.clear) three.paper.clear();
  if (three.traces && three.traces.clear) three.traces.clear();
  (three.slashes || []).forEach(function (s) {
    if (s.mesh) three.scene.remove(s.mesh);
    if (s.dispose) s.dispose();
  });
  three.slashes = [];
  (S.shots || []).forEach(function (sh) { if (sh.mesh) three.scene.remove(sh.mesh); });
  (S.hazards || []).forEach(function (h) { if (h.mesh) three.scene.remove(h.mesh); });
  (S.reflects || []).forEach(function (r) { if (r.mesh) three.scene.remove(r.mesh); });
  S.shots = []; S.hazards = []; S.reflects = [];
}

/* v0.43 최적화: 한 프레임에 여러 번 불려도 배열을 한 번만 만든다(프레임 번호로 캐시).
   혼령은 프레임 중에 늘거나 줄지 않으므로 같은 프레임이면 같은 결과다. */
let _lmList = [];
function livingMarks() {
  /* v0.43: 매번 새 배열을 만들지 않고 하나를 재사용한다(읽기 전용으로만 쓴다). */
  if (!S) return _lmList;
  const sp = S.spirits || [];
  let n = 0;
  for (let i = 0; i < sp.length; i++) if (sp[i] && sp[i].alive) _lmList[n++] = sp[i];
  _lmList.length = n;
  return _lmList;
}
function refreshSpirits() {
  return livingMarks();
}
function worldPerCss() {
  if (!S || !S.hero || !three || !three.camera) return 50;
  const a = projectXZ(S.hero.x, S.hero.z, 0.2);
  const bx = projectXZ(S.hero.x + 1, S.hero.z, 0.2);
  const bz = projectXZ(S.hero.x, S.hero.z + 1, 0.2);
  const sx = Math.hypot(bx.x - a.x, bx.y - a.y);
  const sz = Math.hypot(bz.x - a.x, bz.y - a.y);
  return Math.max(8, (sx + sz) * 0.5);
}
function groundCirclePts(R, y0) {
  const pts = [];
  if (!S || !S.hero) return pts;
  const n = 64;
  y0 = y0 == null ? 0 : y0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(projectXZ(S.hero.x + Math.cos(a) * R, S.hero.z + Math.sin(a) * R, y0));
  }
  return pts;
}
function groundCircleWidth(R, y0) {
  const pts = groundCirclePts(R, y0);
  let minX = 1e9, maxX = -1e9;
  pts.forEach(function (p) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; });
  return Math.max(0, maxX - minX);
}
function fitGroundRingR() {
  if (!S || !S.hero || !three || !three.camera) return 3.2;
  /* project() reads matrixWorldInverse, which is stale until the next render after the camera moves. */
  three.camera.updateMatrixWorld();
  const target = screenRingPx() * 2;
  let lo = 1.2, hi = 12;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (groundCircleWidth(mid, 0) < target) lo = mid; else hi = mid;
  }
  return Math.max(1.4, hi);
}
function baseRingR() { return fitGroundRingR(); }
function ringR() {
  const base = (S && S.ringR > 0) ? S.ringR : baseRingR();
  /* §6.1 5장 짙은 안개 띠: 원 반경이 10초 주기로 ±8% 숨쉰다. §9.4 안개 바늘: −10% */
  const k = (S && S.terrain && S.terrain.ringMul) || 1;
  const gk = (S && S.goal && S.goal.ringMul) || 1;
  return base * k * gk * (relicOn(save, 'needle') ? 0.9 : 1);
}
function applyRingBoost() {
  if (!S) return ringR();
  S.ringPx = screenRingPx();
  S.ringR = fitGroundRingR();
  refreshRingPoly();
  return S.ringR;
}
function refreshRingPoly(force) {
  if (!S) return [];
  const h = S.hero || { x: 0, z: 0 };
  const R = ringR();
  const cam = three && three.camera;
  const key = (h.x || 0).toFixed(3) + ',' + (h.z || 0).toFixed(3) + ',' + (R || 0).toFixed(3)
    + ',' + (cam ? cam.fov : 0) + ',' + (typeof innerWidth === 'number' ? innerWidth : 0)
    + ',' + (cam ? cam.position.x.toFixed(2) + ',' + cam.position.z.toFixed(2) : '');
  if (!force && S.ringPoly && S.ringPoly.length && S._ringKey === key) return S.ringPoly;
  S._ringKey = key;
  S.ringPoly = groundCirclePts(R, 0);
  return S.ringPoly;
}
function ringScreenPts() {
  if (S && S.ringPoly && S.ringPoly.length) return S.ringPoly;
  return refreshRingPoly();
}
function distToSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1), 0, 1);
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}
function rimErrorPx(sx, sy) {
  const pts = ringScreenPts();
  if (!pts || pts.length < 2) return 999;
  let best = 1e9;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const d = distToSeg(sx, sy, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return best;
}
function ellipseScreenAt(theta, from) {
  from = from || heroScreen();
  if (!S || !S.hero) return { x: from.x, y: from.y, t: 0 };
  const R = ringR();
  const ux = Math.cos(theta || 0), uy = Math.sin(theta || 0);
  function worldD(t) {
    const p = unprojectToY(from.x + ux * t, from.y + uy * t, 0);
    return dist(p, S.hero);
  }
  let lo = 0, hi = Math.max(48, (S.ringPx || 80));
  while (worldD(hi) < R && hi < 900) hi *= 1.5;
  if (worldD(hi) < R) {
    /* Fallback: nearest screen-angle point on the projected ground circle. */
    const pts = ringScreenPts();
    let best = pts[0] || from, bestD = 1e9;
    pts.forEach(function (p) {
      const d = Math.abs(angDiff(theta, screenAngleTo(p.x, p.y, from)));
      if (d < bestD) { bestD = d; best = p; }
    });
    return { x: best.x, y: best.y, t: Math.hypot(best.x - from.x, best.y - from.y) };
  }
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (worldD(mid) < R) lo = mid; else hi = mid;
  }
  return { x: from.x + ux * hi, y: from.y + uy * hi, t: hi };
}
function bellFootY(s) {
  const ud = s && s.obj && s.obj.userData;
  if (ud && ud.bellFootY != null) return ud.bellFootY;
  const bh = (ud && ud.bellH) != null ? ud.bellH : 0.4;
  if (ud && ud.bellAttachY != null) return ud.bellAttachY - bh;
  const off = (ud && ud.bellLocal) || { y: 1 };
  return Math.max(0.02, (off.y || 1) - bh * 0.15);
}
function bellFootScreen(s) {
  const y = bellFootY(s);
  const offx = (s && s.obj && s.obj.userData && s.obj.userData.bellLocal && s.obj.userData.bellLocal.x) || 0;
  return projectXZ((s && s.x || 0) + offx, s && s.z || 0, y);
}
function angNorm(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function angDiff(a, b) { return angNorm(b - a); }
function angStep(a, b, maxStep) {
  const d = angDiff(a, b);
  if (Math.abs(d) <= maxStep) return angNorm(a + d);
  return angNorm(a + (d < 0 ? -1 : 1) * maxStep);
}
function angleOf(x, z, from) {
  from = from || (S && S.hero) || { x: 0, z: 0 };
  return Math.atan2((x - from.x), (z - from.z));
}
function placeSpiritOnRing(s) {
  if (!S || !s) return;
  if (!(S.ringR > 0)) applyRingBoost();
  else refreshRingPoly();
  const h = heroScreen();
  const ang = (s.angle || 0) + (s.avoid || 0);
  const sp = ellipseScreenAt(ang, h);
  const offx = (s.obj && s.obj.userData && s.obj.userData.bellLocal && s.obj.userData.bellLocal.x) || 0;
  const p = unprojectToY(sp.x, sp.y, bellFootY(s));
  s.x = p.x - offx;
  s.z = p.z;
  if (s.obj) placeGroup(s.obj, s.x, s.z, 0);
}
function screenOf(ent) {
  const y = (ent.obj && ent.obj.position && ent.obj.position.y) || 0.8;
  const off = (ent.obj && ent.obj.userData && ent.obj.userData.bellLocal) || { x: 0, y: 1.2 };
  return projectXZ(ent.x + (off.x || 0), ent.z, y + (off.y || 0));
}
function isOnScreen(ent, margin) {
  const r = hostRect();
  const p = screenOf(ent);
  const m = margin == null ? 20 : margin;
  return !(p.x < -m || p.y < -m || p.x > r.width + m || p.y > r.height + m);
}
/* 프레임당 한 번만 레이아웃을 읽는다 — 이제 viewBox 캐시를 그대로 쓴다(창 크기가 바뀔 때만 잰다). */
let _frameId = 0, _rectCache = { id: -1, r: null };
function hostRect() { return viewBox(); }
function livingThreats() {
  if (!S) return [];
  return (S.zombies || []).filter(function (z) { return z.alive && !z.hidden; });
}
/* 화면 안 + 반경 2R 이내의 살아 있는 귀물 — 화면 밖 혼령을 놓을 대상을 고를 때 쓴다. */
function screenThreats() {
  if (!S) return [];
  const R = ringR();
  return livingThreats().filter(function (z) { return isOnScreen(z, 40) && dist(z, S.hero) <= R * 2; });
}
/* 0초 오프닝: 심안 원 안쪽에 귀물을 각도 분산 배치해 첫 획부터 방향 선택이 성립한다. */
function spawnOpening() {
  if (!S) return;
  const R = ringR();
  const op = (S.stage && S.stage.opening) || {};
  const n = op.n != null ? op.n : (CFG.openingZombies || 0);
  const ring = op.ring || CFG.openingRing || [0.5, 0.8];
  const brutes = op.brute != null ? op.brute : 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
    const rr = R * (ring[0] + Math.random() * (ring[1] - ring[0]));
    const isBrute = i >= n - brutes;
    spawnZombie({
      x: S.hero.x + Math.cos(a) * rr,
      z: S.hero.z + Math.sin(a) * rr,
      type: isBrute ? 'brute' : 'imp'
    });
  }
  seedOpeningSpirits();
}
/** 시작 혼령을 각도가 고른 방향에 미리 묶어 둔다 — 1개면 최근접, 3개 이상이면 등간격. */
function seedOpeningSpirits() {
  if (!S) return;
  const cap = Math.min(CFG.spiritMax || 5, S.spiritCap || CFG.spiritCapStart || 1);
  const zs = S.zombies.filter(function (z) { return z.alive; });
  if (!zs.length || cap <= 0) return;
  /* 오프닝 스폰이 이미 최근접 위주로 묶어 둔 혼령은 풀고, 고른 방향으로 다시 묶는다. */
  livingMarks().forEach(function (s) { destroySpirit(s); });
  if (cap === 1) {
    const near = nearestTo(zs, S.hero);
    if (near) spawnSpirit({ x: near.x, z: near.z, target: near });
    return;
  }
  const sorted = zs.map(function (z) { return { z: z, a: angNorm(angleOf(z.x, z.z, S.hero)) }; });
  sorted.sort(function (p, q) { return p.a - q.a; });
  const step = sorted.length / cap;
  for (let i = 0; i < cap; i++) {
    const pick = sorted[Math.floor(i * step) % sorted.length];
    spawnSpirit({ x: pick.z.x, z: pick.z.z, target: pick.z });
  }
}
/* 혼령을 놓아준다: 대상 사망이 아니라 거리·화면 조건으로 회수될 때. 요령 소리가 짧게 끊긴다. */
function releaseSpirit(s) {
  if (!s || s.kind !== 'spirit' || !s.alive) return;
  if (audio && !qa.mute) {
    const w = viewBox().width;
    const scr = screenOf(s);
    const pan = clamp((scr.x / Math.max(1, w)) * 2 - 1, -1, 1);
    if (audio.bellCut) audio.bellCut(pan, spiritShape(s));
    else audio.bell(pan, spiritShape(s));
  }
  if (art && art.playFx && three) {
    const fx = art.playFx(three.scene, 'ink-splat', s.x, s.z, 0.9);
    if (fx) three.fx.push(fx);
  }
  destroySpirit(s);
}
/* A spirit stays on its zombie until that zombie dies. A free slot (under the cap) goes to the
   nearest zombie inside the mind's-eye ring that has no spirit yet, the boss first. */
function assignSpiritTargets() {
  if (!S) return;
  const R = arenaActive() ? arenaR()+dist(S.hero,S.arena)+1 : ringR();
  const capBase = Math.min(CFG.spiritMax || 5, S.spiritCap || CFG.spiritCapStart || 3);
  /* 보스전에는 보스와 소환 잡귀 모두에 혼령이 붙어야 피할 곳이 생긴다. */
  const cap = ((S.boss && S.boss.alive) ? Math.max(capBase, 1 + ((CFG.bossPat || {}).summon || {}).keep || 0) : capBase) +
    (S.zombies || []).filter(function (z) { return z.alive && (z.isClone || z.isPillar); }).length;
  const outR = R * (CFG.spiritReleaseMul || 1.15);
  const inR = R * (CFG.spiritAcquireMul || 1.02);
  /* 1) 대상이 죽었거나 안개 밖(1.15R)으로 벗어난 혼령은 즉시 회수한다. */
  livingMarks().forEach(function (s) {
    if (s.free) return;
    if (!s.target || !s.target.alive) { destroySpirit(s); return; }
    if (cloneHeld(s)) return;
    if (dist(s.target, S.hero) > outR * (s.far ? 1.9 : 1)) { releaseSpirit(s); return; }
  });
  /* 2) 화면 밖으로 나간 대상은 '화면 안 대체 대상'이 있을 때만 회수한다(획득-회수 진동 방지). */
  const heldNow = livingMarks().filter(function (s) { return !s.free && s.target && s.target.alive; }).map(function (s) { return s.target; });
  const onFree = screenThreats().filter(function (z) { return z.alive && heldNow.indexOf(z) < 0; });
  if (onFree.length) {
    livingMarks().forEach(function (s) {
      if (s.free || !s.target || !s.target.alive || cloneHeld(s)) return;
      if (!isOnScreen(s.target, 40)) releaseSpirit(s);
    });
  }
  const bound = livingMarks().filter(function (s) { return !s.free; });
  let room = cap - bound.length;
  if (room <= 0) { bossClaimsSpirit(); return; }
  const held = bound.map(function (s) { return s.target; });
  const pool = livingThreats().filter(function (z) { return held.indexOf(z) < 0 && dist(z, S.hero) < inR; });
  const onPool = pool.filter(function (z) { return isOnScreen(z, 40); });
  const use = onPool.length ? onPool : pool;
  use.sort(function (a, b) {
    if (a.isBoss && !b.isBoss) return -1;
    if (b.isBoss && !a.isBoss) return 1;
    return dist(a, S.hero) - dist(b, S.hero);
  });
  for (let i = 0; i < use.length && room > 0; i++, room--) spawnSpirit({ x: use[i].x, z: use[i].z, target: use[i] });
  bossClaimsSpirit();
  ensureMarks();
}
/* 심안 안에 그을 혼령이 하나도 없으면(떼를 다 벨고 다음 무리가 아직 먼 순간) 가장 가까운 귀물을 붙잡아 준다.
   '그을 게 없는' 빈 화면이 길게 이어지는 것을 막는다. */
function ensureMarks() {
  if (!S || S.sandbox || !S.playing) return;
  if (livingMarks().length) return;
  if ((S.noMarkT || 0) < 0.6) return;
  const zs = livingThreats().filter(function (z) { return z.alive && dist(z, S.hero) < ringR() * 2.6; });
  if (!zs.length) return;
  zs.sort(function (a, b) { return dist(a, S.hero) - dist(b, S.hero); });
  const s = spawnSpirit({ x: zs[0].x, z: zs[0].z, target: zs[0] });
  if (s) s.far = true;
}
/* 보스는 혼령 한을 반드시 차지한다 — 잔몹이 슬롯을 다 먹어도 순서를 읽을 수 있게. */
function bossClaimsSpirit() {
  const boss = S && S.boss;
  if (!boss || !boss.alive || boss.hidden) return;
  /* 심안 밖의 보스에게 혼령을 붙이면 매 프레임 회수-재할당이 반복된다. */
  if (dist(boss, S.hero) > ringR() * (CFG.spiritAcquireMul || 1.02)) return;
  const ms = livingMarks();
  if (ms.some(function (s) { return s.target === boss; })) return;
  const cand = ms.filter(function (s) { return !s.free && s.target && s.target.alive && !s.target.isBoss; });
  if (cand.length) {
    /* 영웅에서 가장 먼 잔몹의 혼령을 보스에게 옮긴다. */
    cand.sort(function (a, b) { return dist(b.target, S.hero) - dist(a.target, S.hero); });
    const s = cand[0];
    s.target = boss;
    s.x = boss.x; s.z = boss.z;
    if (art && art.setSpiritShape) art.setSpiritShape(s.obj, spiritShape(s));
    ringSpiritBell(s);
    return;
  }
  if (ms.length < (CFG.spiritMax || 5)) spawnSpirit({ x: boss.x, z: boss.z, target: boss });
}
function zombieScreenBody(z) {
  const top = projectXZ(z.x, z.z, 1.45);
  const bot = projectXZ(z.x, z.z, 0);
  return {
    x: (top.x + bot.x) * 0.5,
    y: (top.y + bot.y) * 0.5,
    r: Math.max(16, Math.hypot(top.x - bot.x, top.y - bot.y) * 0.42)
  };
}
function spiritAvoidWant(s) {
  if (!S || !s) return 0;
  const hs = heroScreen();
  const R = ringR();
  const px = (S.ringPx > 0) ? S.ringPx : screenRingPx();
  if (!(R > 0.5) || !(px > 8)) return 0;
  const base = s.angle || 0;
  const on = ellipseScreenAt(base, hs);
  const sx = on.x, sy = on.y;
  const sprR = 18;
  const cap = CFG.spiritAvoidMax || 0.30;
  let push = 0;
  livingThreats().forEach(function (z) {
    /* Inside the ground-circle orbit, not merely standing just outside the rim. */
    if (dist(z, S.hero) >= R - 0.12) return;
    const zb = zombieScreenBody(z);
    const d = Math.hypot(zb.x - sx, zb.y - sy);
    const need = sprR + zb.r + 6;
    if (d >= need) return;
    const zAng = screenAngleTo(zb.x, zb.y, hs);
    let side = -Math.sign(angDiff(base, zAng));
    if (!side) side = (s.id % 2) ? 1 : -1;
    const ang = clamp((need - d) / Math.max(24, px), 0, cap);
    const signed = side * ang;
    if (Math.abs(signed) > Math.abs(push)) push = signed;
  });
  return clamp(push, -cap, cap);
}
function stepSpiritAvoid(s, dt, snap) {
  const want = spiritAvoidWant(s);
  if (snap || qa.noDelay) {
    s.avoid = want;
    return;
  }
  const cur = s.avoid || 0;
  const step = (CFG.spiritAvoidOmega || 8) * (dt || 0);
  const d = want - cur;
  s.avoid = (Math.abs(d) <= step) ? want : cur + Math.sign(d) * step;
}
function snapSpiritsToTargets() {
  if (!S) return;
  assignSpiritTargets();
  if (!(S.ringPx > 0) || !(S.ringR > 0)) applyRingBoost();
  const hs = heroScreen();
  livingMarks().forEach(function (s) {
    if (s.target && s.target.alive) {
      const tp = projectXZ(s.target.x, s.target.z, 0.8);
      s.angle = screenAngleTo(tp.x, tp.y, hs);
    }
    stepSpiritAvoid(s, 0, true);
    placeSpiritOnRing(s);
  });
}
function stepSpirits(dt) {
  if (!S) return;
  if (!(S.ringPx > 0) || !(S.ringR > 0)) applyRingBoost();
  S.noMarkT = livingMarks().length ? 0 : (S.noMarkT || 0) + (dt || 0);
  assignSpiritTargets();
  const maxW = (qa.noDelay ? 20 : 1) * (CFG.spiritOmega || 2.8);
  const hs = heroScreen();
  livingMarks().forEach(function (s) {
    let want = s.angle;
    if (s.target && s.target.alive) {
      const tp = projectXZ(s.target.x, s.target.z, 0.8);
      want = screenAngleTo(tp.x, tp.y, hs);
    }
    if (qa.noDelay) s.angle = angNorm(want);
    else s.angle = angStep(s.angle || 0, want, maxW * dt);
    stepSpiritAvoid(s, dt, false);
  });
  livingMarks().forEach(function (s) {
    s.age = (s.age || 0) + dt;
    placeSpirit(s);
    setSpiritAlpha(s);
    if (art.tickChar) art.tickChar(s.obj, 'spirit', 'idle', Math.min(0.05, dt), 0, 0);
  });
}
function setSpiritAlpha(s) {
  const ud = s && s.obj && s.obj.userData;
  if (!ud) return;
  /* Fades in when the zombie enters the ring, then stays. */
  const a = (CFG.spiritAlpha || 1) * clamp((s.age || 0) / (CFG.spiritFadeIn || 0.4), 0, 1);
  if (ud.sprite && ud.sprite.material) { ud.sprite.material.transparent = true; ud.sprite.material.opacity = a; }
  if (ud.glow && ud.glow.material) ud.glow.material.opacity = CFG.spiritGlowAlpha * a;
  if (ud.outline && ud.outline.material) ud.outline.material.opacity = 0.7 * a;
}
/* A spirit bound to a zombie hovers over its head and follows it; free (test) spirits stay on the ring. */
function placeSpirit(s) {
  const z = s.target;
  if (!z || !z.alive || s.free) { placeSpiritOnRing(s); return; }
  const ud = (z.obj && z.obj.userData) || {};
  const zh = ud.worldH || 2.4;
  let bob = zh * (CFG.spiritHover || 1.26);
  /* 보스는 덩치가 커서(월드 높이 × 배율) 머리 높이를 눈 위치로 삼아 그 바로 위에 띄운다. */
  if (z.isBoss) {
    const eye = (ud.bellLocal && ud.bellLocal.y) || zh * 0.55;
    bob = eye + Math.max(0.75, Math.min(1.5, zh * 0.16));
  }
  s.x = z.x; s.z = z.z;
  if (s.obj) placeGroup(s.obj, s.x, s.z, bob);
}
function addSpirit(opts) {
  opts = opts || {};
  if (!S) return null;
  if (!opts.force && livingMarks().length >= (CFG.spiritMax || 5)) return null;
  return spawnSpirit(opts);
}
function setSpiritCount(n) {
  if (!S) return [];
  n = clamp(n | 0, 0, CFG.spiritMax || 5);
  while (livingMarks().length > n) {
    const s = S.spirits[S.spirits.length - 1];
    s.alive = false;
    if (s.obj && three) three.scene.remove(s.obj);
    S.spirits.pop();
  }
  while (livingMarks().length < n) spawnSpirit({ force: true });
  if (qa.noDelay) snapSpiritsToTargets();
  else assignSpiritTargets();
  return livingMarks();
}
function spawnSpirit(opts) {
  opts = opts || {};
  if (opts.boss) return spawnBoss(opts);
  if (!S) return null;
  const shape = opts.shape || leastUsedShape();
  let angle;
  if (opts.angle != null) angle = opts.angle;
  else if (opts.x != null && opts.z != null) {
    const hs = heroScreen();
    const tp = projectXZ(opts.x, opts.z, 0.8);
    angle = screenAngleTo(tp.x, tp.y, hs);
  } else {
    const n = livingMarks().length;
    angle = (n * 1.134) + Math.random() * 0.4;
  }
  const e = {
    id: ++S._id, kind: 'spirit', shape: shape, angle: angNorm(angle),
    x: 0, z: 0, r: 0.7, alive: true, hp: 1, isBoss: false, target: opts.target || null, avoid: 0,
    free: !opts.target
  };
  /* Show the shape the spirit answers to: the one-bell shape, or the boss's current shape. */
  e.obj = addEntityVisual('spirit', spiritShape(e));
  if (S.bellT > 0 && art.setAura) art.setAura(e.obj, true);
  placeSpirit(e);
  S.spirits.push(e);
  if (S.practiceSpawns > 0 && S.practiceShape && e.shape === S.practiceShape) S.practiceSpawns--;
  /* §8.2 새 무늬를 처음 보는 장: 그 무늬 첫 혼령 위에 0.8초 유도 획. */
  if (S.newShape && S.newShape.need > 0 && e.shape === S.newShape.shape) {
    S.newShape.need--;
    S.newShape.guide = CFG.firstShapeGuide || 0.8;
    telemetry.event('first_moment', { kind: 'shape', shape: e.shape, stage: S.stageNo });
  }
  setSpiritAlpha(e);
  if (e.target) ringSpiritBell(e);
  return e;
}
function spawnBoss(opts) {
  opts = opts || {};
  /* §5.2 보스전은 멈추는 창을 쓴다 — 열려 있던 빠른 카드는 추천으로 닫는다. */
  if (S && S.quick) { const q = recommendedPick(); if (q) pickQuick(q, true); else closeQuickCards(); }
  const ring = CFG.zombieRing || [10, 14];
  const p = opts.x != null ? { x: opts.x, z: opts.z } : ringPos(opts.r || 16);
  const seq = opts.seq || pickSeq(opts.nShapes || CFG.bossShapes);
  const e = {
    id: ++S._id, kind: 'zombie', shape: seq[0], x: p.x, z: p.z, r: 1.1,
    alive: true, hp: opts.hp != null ? opts.hp : 99,
    frozen: 0, burn: 0, burnTick: 0, poison: 0, poisonT: 0, poisonTick: 0, stun: 0,
    marked: false, isBoss: true, seq: seq, seqI: 0, poise: (CFG.bossPat || {}).poise || 3, firstWalk: true,
    phase: 1, phase2: false, phase3: false
  };
  e.maxHp=opts.hp ?? [18,23,28,32,37,42,47,52,55,63,71,80][S.stage.id-1] ?? 18;
  e.hp=e.maxHp; S.autoDmg=0; S.manualDmg=0;
  const vis = e.shape;
  /* §4.5 보스 개성: 장마다 외형 변주(머리 장신구·장기 4종, 무기 3종, 크기 0.9~1.15배) */
  const BV = bossVisualOf(S.stage);
  S.bossVar = BV.var;
  e.obj = addEntityVisual('boss', vis, { bossVar: BV.var, bossScale: BV.scale });
  applySkin(e.obj);
  placeGroup(e.obj, e.x, e.z);
  S.zombies.push(e);
  art.tickChar(e.obj,'boss','boss:idle',1/60,S.hero.x-e.x,S.hero.z-e.z);
  S.boss = e; S.bossSpawned = true;
  /* v0.50: 보스 등장 장단 전환 + 웅장한 등장이펙트·사운드 */
  if (audio) {
    if (audio.setBossMode) audio.setBossMode(true);
    if (audio.bossSpawn) audio.bossSpawn();
  }
  bossFx.triggerSmokeBurst(e.x, e.z, false);
  if (three && three.lights) three.lights.burst(e.x, 1.8, e.z, { color: 0xe64532, intensity: 6.0, duration: 0.65 });
  /* §4.5 보스 등장 순간 1.2초 이름 카드 */
  showBossCard(S.stage);
  /* v0.22 보스 결계: 잡몹을 걷어내고, 영웅을 중심으로 원형 아레나를 세운다. */
  clearFieldForBoss();
  openArena(S.hero.x, S.hero.z);
  S.summonT = 0;
  const keepN = ((CFG.bossPat || {}).summon || {}).keep || 3;
  for (let i = 0; i < keepN + (relicOn(save, 'totem') ? 1 : 0); i++) summonDodgeTarget(e);
  if (!S.totemSeen && !save.totemTip) {
    S.totemSeen = true;
    save.totemTip = true; persist();
    showGuide('보스가 공격을 예고하면 <b>기물 무늬</b>를 그려 역공하세요', 6.5);
  }
  /* §8.2 기물 무늬(△ ◡ @)를 처음 보는 순간: 보스 등장 직후 3초 기물 연습(0.4배) + 가장 가까운 기물 유도 획. */
  if (!opts.sandbox && markSeen('totem')) {
    S.totemGuide = CFG.totemPractice || 3;
    addSlow(0.4, CFG.totemPractice || 3);
    telemetry.event('first_moment', { kind: 'totem', stage: S.stageNo });
  }
  assignSpiritTargets();
  return e;
}
/* 보스전 집중: 필드의 잔몹은 보상 없이 연기처럼 사라진다. */
function clearFieldForBoss() {
  if (!S) return 0;
  let n = 0;
  (S.zombies || []).forEach(function (z) {
    if (!z.alive || z.isBoss) return;
    z.alive = false;
    if (z.obj && three) three.scene.remove(z.obj);
    if (three && three.ink && n < 14) three.ink.kill(z.x, z.z, 0, 1);
    n++;
  });
  S.waveIds = [];
  S.spirits = (S.spirits || []).filter(function (s) {
    if (s.target && !s.target.alive) { if (s.obj && three) three.scene.remove(s.obj); return false; }
    return true;
  });
  return n;
}

/* ---------- 보스 결계(아레나) 연출 ---------- */
function openArena(cx, cz) {
  closeArena(true);
  if (!S) return null;
  const r = CFG.arenaR || 12;
  S.arena = { x: cx || 0, z: cz || 0, r: r, t: 0 };
  if (!three) return S.arena;
  const a = makeArenaGroup(r);
  a.group.scale.set(1, 1, 1);
  a.t = 0;
  a.group.position.set(S.arena.x, 0, S.arena.z);
  a.group.visible = true;
  /* v0.40 5단계: 결계 벽이 바닥에서 종이처럼 펴져 솟는다(1자유도 접힘 스프링). */
  try {
    if (a.wall) foldPop(a.wall, { from: 0.03, stiff: 145, damp: 10.5, anchorY: 1.4 });
    if (audio && !qa.mute && audio.paperFold) audio.paperFold(1.1);
  } catch (e) {}
  /* 예열 때 만든 결계를 그대로 장면에 둔다(보스 순간에 처음 붙이지 않는다). */
  if (a.group.parent !== three.scene) three.scene.add(a.group);
  three.arena = a;
  applyCameraLens();
  return S.arena;
}
/* 결계는 판마다 같은 모양이라 한 번만 만들어 재사용한다.
   매번 새로 만들면 재질이 새로 생기고(→ 프로그램 재링크) 지오메트리도 다시 올라간다. */
let _arenaCache = null;
/** The barrier's ring, inner ring and wall, as one group (also used to pre-compile its shaders). */
function makeArenaGroup(r) {
  if (_arenaCache && _arenaCache.r === r) return _arenaCache.a;
  if (_arenaCache) { _arenaCache.a.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
  const group = new THREE.Group();
  group.name = 'boss-arena';
  /* v0.54.1: 보스 결계(붉은 장막 벽 wall + 바닥 홍기 띠 ring)는 그대로 살리고,
     거슬리던 안쪽 흰색 얇은 테두리 선(inner)만 제거한다. */
  const ringGeo = new THREE.RingGeometry(r - 0.55, r, 128, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xe0522c, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.06;
  ring.renderOrder = 4;
  group.add(ring);
  const innerGeo = new THREE.RingGeometry(r * 0.94, r * 0.955, 64, 1);
  innerGeo.rotateX(-Math.PI / 2);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xffd7a0, transparent: true, opacity: 0,
    depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.position.y = 0.07;
  inner.visible = false;
  group.add(inner);
  /* 결계 벽: 바닥에서 솟아오르는 반투명 붉은 결계 장막 */
  const wallGeo = new THREE.CylinderGeometry(r, r, 2.8, 96, 1, true);
  const wallMat = new THREE.MeshBasicMaterial({
    color: 0xe85a34, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 1.4;
  wall.renderOrder = 4;
  group.add(wall);
  const out = { group: group, ring: ring, inner: inner, wall: wall, ringMat: ringMat, innerMat: innerMat, wallMat: wallMat, t: 0, r: r };
  _arenaCache = { r: r, a: out };
  return out;
}
/* ---------- 판 시작 전 예열(pre-warm) ----------
   "가끔 갑자기 멈춤"은 게임 로직이 아니라 **처음 쓰는 재질의 셰이더 링크**와 **캔버스 텍스처의 첫 업로드**
   때문이다(v0.29 실측: 보스 소환 프레임 309.7ms에 프로그램 32→46). 그래서 소개 카드가 떠 있는 동안
   이 판에 등장할 수 있는 모든 재질 변형을 한 번 실제로 컴파일하고, 그 재질을 붙들고 있어서
   three가 프로그램을 해제하지 못하게 한다 → 런 중 renderer.info.programs 가 늘지 않는다. */
function prewarmRecipes() {
  const R = [];
  const add = function (label, make) { R.push({ label: label, make: make }); };
  /* 영웅·잔상·원귀 종류별 그림 + 상태이상 시트(얼음/불/독) */
  add('hero', function () { return art.makeChar('hero'); });
  add('afterimage', function () { return art.makeChar('afterimage'); });
  Object.keys(CFG.zombieTypes || {}).forEach(function (t) {
    add('zombie:' + t, function () { return art.makeChar('zombie', t); });
  });
  add('zombie:status', function () {
    const g = art.makeChar('zombie', 'imp');
    ['frozen', 'burning', 'poisoned'].forEach(function (st) { art.tickChar(g, 'zombie', st, 0.016, 0, 1); });
    return g;
  });
  /* 혼령: 기호 8종의 먹획을 시트에 굽는 비용이 크다 → 여기서 전부 굽고 올린다.
     qa.warmCore 는 계측용으로 한 종만 굽는다(굽기 비용 제외, 재질은 동일). */
  const warmShapes = qa.warmCore ? ['hline'] : Object.keys(SHAPE_MARK);
  warmShapes.forEach(function (sh) {
    add('spirit:' + sh, function () {
      const g = art.makeChar('spirit', sh);      // 기호를 시트에 굽는다(비싼 캔버스 작업)
      const spr = g && g.userData && g.userData.sprite;
      /* 굽기 결과는 캐시에 남고, 큰 텍스처(512×5120)는 GPU에 올리지 않는다 — 기호 8종을 모두 올리면
         80MB가 넘는다. 실제 혼령이 처음 나올 때 한 번만 올라간다(10ms 안팎). */
      if (spr && spr.material && art.glowTex) { spr.material.map = art.glowTex; spr.material.needsUpdate = true; }
      return g;
    });
  });
  /* §4.5 보스 외형 변주 4벌 — 이 장이 쓸 벌과 나머지를 모두 미리 구워 둔다. */
  for (let bv = 0; bv < 4; bv++) {
    (function (k) { add('boss:' + k, function () { return art.makeChar('boss', 'hline', { bossVar: k }); }); })(bv);
  }
  /* 아이템 12종 */
  ['xp', 'heal', 'coin', 'elem-ice', 'elem-fire', 'elem-poison', 'one-bell', 'dash-plus', 'herb', 'magnet', 'bang', 'charm']
    .forEach(function (k) { add('item:' + k, function () { return art.makeChar(k); }); });
  /* 3D 이펙트 시트(터짐·얼음 파편·독 폭발) */
  ['ink-splat', 'ice-shatter', 'poison-burst', 'fire-trail'].forEach(function (name) {
    add('fx:' + name, function () {
      const f = art.playFx(three.scene, name, 0, 0, 1.7);
      if (!f) return null;
      three.scene.remove(f.mesh);
      return f.mesh;
    });
  });
  /* 보스전: 결계(실제로 쓰는 그 그룹) · 부적 기둥 · 기물 · 탄막 · 되받기 · 장판 */
  add('arena', function () { return makeArenaGroup(CFG.arenaR || 12).group; });
  add('pillar', function () { return makePillarObj(); });
  add('totem', function () { return makeTotemObj(); });
  add('shot', function () { return new THREE.Mesh(shotGeo(), shotMaterial()); });
  add('shot:gold', function () { return new THREE.Mesh(shotGeo(), goldShotMaterial()); });
  add('reflect', function () { return makeReflectMesh(); });
  add('hazard', function () {
    const m = new THREE.Mesh(hazardGeo(), new THREE.MeshBasicMaterial({
      color: 0xff5a3c, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    m.rotation.x = -Math.PI / 2;
    return m;
  });
  /* 일섬 검기: 바닥 먹 궤적 · 솟는 리본 아크 · 화염 잔불 */
  ['jade', 'fire', 'ice', 'poison', 'lightning'].forEach(function (el) {
    add('slash:' + el, function () {
      const s = createInkSlash({ from: { x: 0, z: 0 }, to: { x: 0, z: 1 }, elem: el });
      return s.mesh;
    });
  });
  add('slash-arc', function () {
    const s = createSlashArc({ from: { x: 0, z: 0 }, to: { x: 0, z: 1 }, elem: 'fire' });
    return s.mesh;
  });
  add('trail', function () { return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), trailMaterial()); });
  /* 기본 재질 변형(fog·투명·면·맵·alphaTest) 총망라 — 생성부를 못 따라간 변형까지 덮는다. */
  materialVariants(THREE, art.glowTex || art.trailTex || null).forEach(function (r) { R.push(r); });
  return R;
}
let _warmP = null;
/* budget: 프레임당 예열 예산(ms). 타이틀 유휴 예열은 8~12ms로 작게 잡아 화면이 끊기지 않게 한다. */
function warmShaders(budget) {
  if (!three || !three.renderer) return Promise.resolve();
  if (_warmP) return _warmP;
  const _tw = performance.now();
  _warmP = warmScene({
    THREE: THREE, renderer: three.renderer, scene: three.scene, camera: three.camera,
    recipes: prewarmRecipes(),
    budgetMs: budget || 24, texPerFrame: 3,
    textures: [art.trailTex, art.torchGlow, art.glowTex, art.shadowTex,
      art.images && art.images.inkStroke, art.images && art.images.inkLit, art.images && art.images.inkDab]
  }).then(function (r) {
    three.warm = r;
    /* 결계는 판이 시작될 때부터 장면에 두고 숨겨 둔다(보스 순간에 처음 세우지 않게). */
    try {
      const a = makeArenaGroup(CFG.arenaR || 12);
      a.group.visible = false;
      if (a.group.parent !== three.scene) three.scene.add(a.group);
    } catch (e) {}
    if (window.console && console.info) console.info('[심안] 셰이더 예열 ' + r.ms + 'ms · 레시피 ' + r.recipes + ' · 텍스처 ' + r.textures + ' · 프로그램 ' + r.programs);
    perfMark('warm', performance.now() - _tw, { budget: budget || 24, recipes: r.recipes, textures: r.textures, programs: r.programs });
    return r;
  }, function () { return null; });
  return _warmP;
}
/* ---------- v0.35 타이틀 유휴 예열 ----------
   증상: 타이틀에서 '출전'을 누르면 게임이 시작되기까지 길게 멈춘다.
   원인: 셰이더·텍스처 예열(warmShaders)과 바닥 판석 베이킹·청크 월드 구축이
         모두 그 순간에 몰렸기 때문이다. 소개 카드가 떠 있는 2.6초 동안 하려던 일을
         타이틀이 떠 있는 여유 프레임으로 앞당긴다(프레임당 예산 10ms).
     1) warmShaders: 셰이더 링크·텍스처 업로드를 작은 예산으로 분산
     2) 바닥 판석: 선택한 막의 4장을 한 프레임에 하나씩 미리 굽는다
     3) 선택한 장의 무대·청크 월드는 previewStageWorld/switchMap이 이미 맡는다 */
let _titleWarm = false;
function titlePrewarm() {
  if (_titleWarm || qa.skipWarm) return _titleWarm;
  _titleWarm = true;
  const nextFrame = function (fn) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { fn(); });
    else setTimeout(fn, 16);
  };
  const startWarm = function () {
    if (!three || !three.renderer || !art) return;
    try { warmShaders(10); } catch (e) {}
  };
  const startGround = function () {
    if (!three || S) return;
    const sel = clamp(titleSel || save.stage || 1, 1, STAGES.length);
    const act = actOf(sel);
    const ids = STAGES.filter(function (s) { return actOf(s.id) === act; }).map(function (s) { return s.id; });
    ids.sort(function (a, b) { return (a === sel ? -1 : 0) - (b === sel ? -1 : 0); });
    const queue = ids.slice();
    const step = function () {
      if (!queue.length || S) return;         /* 판이 시작되면 손을 뗀다 */
      try { prebakeGroundStage(queue.shift()); } catch (e) {}
      nextFrame(step);
    };
    nextFrame(step);
  };
  /* 첫 화면(타이틀)이 한 번 그려진 뒤에 시작한다. */
  nextFrame(function () { nextFrame(function () { startWarm(); startGround(); }); });
  return _titleWarm;
}
function closeArena(instant) {
  if (three && three.arena) {
    const a = three.arena;
    /* 결계는 장면에 둔 채로 숨기기만 한다 — 지웠다 다시 만들면 재질·프로그램이 다시 올라간다. */
    a.group.visible = false;
    a.group.scale.set(1, 1, 1);
    a.t = 0;
    a.ring.scale.set(1, 1, 1);
    a.inner.scale.set(1, 1, 1);
    three.arena = null;
  }
  if (S) S.arena = null;
  applyCameraLens();
}
function stepArena(dt) {
  const a = three && three.arena;
  if (!a) return;
  a.t += dt || 0;
  const p = 0.55 + 0.45 * Math.sin(a.t * 2.6);
  a.ringMat.opacity = 0.30 + 0.16 * p;
  a.innerMat.opacity = 0;
  a.wallMat.opacity = 0.14 + 0.09 * p;
  const s = 1 + 0.005 * Math.sin(a.t * 3.1);
  a.ring.scale.set(s, 1, s);
}
function spawnZombie(opts) {
  opts = opts || {};
  const zr = CFG.zombieRing || [10, 14];
  const p = opts.x != null ? { x: opts.x, z: opts.z } : ringPos(opts.r != null ? opts.r : (zr[0] + Math.random() * (zr[1] - zr[0])));
  /* v0.48: 고정 아레나 밖(절벽 너머)에서 태어나지 않게 경계 안으로 당긴다. */
  { const cp = clipWorld(p, 1.0); p.x = cp.x; p.z = cp.z; }
  const type = opts.type || pickZombieType();
  const def = CFG.zombieTypes[type] || CFG.zombieTypes.imp;
  const grow = 1 + (CFG.hpGrowth || 0) * clamp(S.elapsed / runLimit(), 0, 1);
  const e = {
    id: ++S._id, kind: 'zombie', type: type, x: p.x, z: p.z, r: def.r, alive: true,
    hp: opts.hp != null ? opts.hp : def.hp * grow, maxHp: opts.hp != null ? opts.hp : def.hp * grow,
    frozen: 0, burn: 0, burnTick: 0, poison: 0, poisonT: 0, poisonTick: 0, stun: 0,
    marked: false, shape: null, isBoss: false, elite: type === 'elite'
  };
  e.obj = addEntityVisual('zombie', type);
  placeGroup(e.obj, e.x, e.z);
  /* v0.31 §3.2 강적 깨는 법: 장정=갑옷 1겹 · 돌덩이=금 2단계 · 정예=봉인 순서 3개. */
  if (type === 'brute') { e.armor = CFG.bruteArmor || 1; e.armored = true; e.shapeOv = null; }
  else if (type === 'stone') { e.cracks = 0; e.hasCracks = true; e.lastShape = null; }
  else if (type === 'elite') {
    e.eliteSeq = true; e.seq = pickSeq(CFG.eliteSeqLen || 3); e.seqI = 0;
    /* v0.34 §6.3 정예 속성: 얼음(닿으면 느려짐) · 분열(죽으면 둘로) · 방울(주기적으로 봉인) */
    const ATTRS = ['ice', 'split', 'bell'];
    e.eliteAttr = ATTRS[((S.stageNo || 1) + (S._id % 3)) % 3];
    const tintAttr = { ice: 0x7fd8ff, split: 0xc08aff, bell: 0xE8C04A }[e.eliteAttr];
    if (e.obj && e.obj.userData && e.obj.userData.rim && e.obj.userData.rim.material) {
      e.obj.userData.rim.material.color.setHex(tintAttr); e.obj.userData.rim.material.opacity = 0.62;
      e.obj.userData.rimHex = tintAttr; e.obj.userData.rimOp = 0.62;
    }
    e.bellCd = 2.4; e.invuln = 0;
  }
  /* v0.23 변주 원귀: 테두리 빛으로 종류를 구분한다(돌진=청, 투척=보라, 자폭=주황). */
  if (def.tint && e.obj && e.obj.userData && e.obj.userData.rim && e.obj.userData.rim.material && e.obj.userData.rim.material.color) {
    e.obj.userData.rim.material.color.setHex(def.tint);
    e.obj.userData.rim.material.opacity = 0.6;
    e.obj.userData.rimHex = def.tint; e.obj.userData.rimOp = 0.6;
  }
  S.zombies.push(e);
  if (qa.noDelay) snapSpiritsToTargets();
  else assignSpiritTargets();
  return e;
}
function spawnItem(opts) {
  opts = opts || {};
  const type = opts.type || 'xp';
  const p = opts.x != null ? { x: opts.x, z: opts.z } : { x: S.hero.x, z: S.hero.z };
  const e = { id: ++S._id, kind: type, x: p.x, z: p.z, r: 0.45, alive: true, shape: opts.shape, dur: opts.dur, born: S.elapsed || 0 };
  e.obj = addEntityVisual(type);
  placeGroup(e.obj, e.x, e.z, 0.2);
  /* v0.40 5단계: 떨어진 부적/혼백이 종이처럼 탁 펴지며 등장한다(과회전 후 정착). */
  try {
    if (e.obj && e.obj.scale) foldPop(e.obj, { from: 0.06, stiff: 210, damp: 14, tilt: 0.16 });
    if (audio && !qa.mute && audio.paperFold) audio.paperFold(0.45);
    /* v0.41: 부적이 종이로 펄럭이며 떨어진다. */
    if (three && three.paper) three.paper.talisman(e.x, 0.9, e.z, { size: 0.9 });
  } catch (err) {}
  S.items.push(e);
  return e;
}

/* ---------- 묵항아리: 부수면 세 가지 픽업 중 하나 ---------- */
function pickJarDrop() {
  const w = CFG.jarDropWeights || { herb: 0.4, magnet: 0.3, bang: 0.3 };
  const keys = Object.keys(w);
  const sum = keys.reduce(function (a, k) { return a + w[k]; }, 0) || 1;
  let roll = Math.random() * sum;
  for (let i = 0; i < keys.length; i++) { roll -= w[keys[i]]; if (roll <= 0) return keys[i]; }
  return keys[0];
}
function breakJar(j) {
  if (!j || !j.alive) return false;
  if (three && three.chunks) three.chunks.breakJar(j);
  j.alive = false;
  if (!S) return true;
  S.jarsBroken = (S.jarsBroken || 0) + 1;
  if (art && art.playFx && three) {
    const fx = art.playFx(three.scene, 'ink-splat', j.x, j.z, 1.7);
    if (fx) three.fx.push(fx);
  }
  if (three && three.ink) three.ink.hit(j.x, j.z, 0.7, 0.7);
  if (audio && !qa.mute) { audio.hit(); if (audio.paperCrush) audio.paperCrush(0.9); if (audio.paperTear) audio.paperTear(0.55); }
  S.shake = Math.max(S.shake || 0, 0.18);
  const kind = pickJarDrop();
  spawnItem({ type: kind, x: j.x, z: j.z });
  /* §9.4 빈 항아리: 드롭이 두 배 */
  if (relicOn(save, 'jar')) spawnItem({ type: pickJarDrop(), x: j.x + 0.5, z: j.z + 0.3 });
  addCharge(3);
  showJudge('항아리 파괴');
  return true;
}
/* 자석 부적: 필드의 모든 바닥 아이템(엽전·혼백·회복·부적·종 등)을 즉시 빨아들인다. */
function absorbAllItems(except) {
  if (!S) return 0;
  const list = (S.items || []).filter(function (x) { return x.alive && x !== except; });
  let n = 0;
  const hp = heroScreen();
  list.forEach(function (x) { if (x.alive) { inkFx.fly(x.x, x.z, hp, FX_COLORS.gold, 1); collectItem(x, null); n++; } });
  if (n && audio && audio.pickup) audio.pickup(n);
  return n;
}
/* 화약 부적: 화면 안의 일반 적을 쓸어버리고 보스를 절단한다. */
function firecrackerBurst() {
  if (!S) return 0;
  const R = Math.max(CFG.bangR || 15, ringR() * 2.2);
  let killed = 0;
  S.zombies.slice().forEach(function (z) {
    if (!z.alive) return;
    if (!isOnScreen(z, 120) && dist(z, S.hero) > R) return;
    if (z.isBoss) {
      hurtZombie(z,z.maxHp*.05,'bang',null);
      z.stun = Math.max(z.stun || 0, 0.8);
      showJudge('화약 폭발!');
      return;
    }
    if (dist(z, S.hero) > R + (z.r || 0.5)) return;
    hurtZombie(z, 999, 'bang', S.lastDash);
    if (!z.alive) killed++;
  });
  S.shake = Math.max(S.shake || 0, 1.0);
  addHitstop(0.1);
  inkFx.ring(R, FX_COLORS.fire, 0.8);
  inkFx.ring(R * 0.6, FX_COLORS.gold, 0.6);
  if (audio && !qa.mute) audio.explode();
  showJudge('화약 부적!');
  triggerSightWave();
  return killed;
}
function pickZombieType() {
  const st = curStage();
  const mix = (st && st.mix) || CFG.zombieMix || [[0, { imp: 1 }]];
  let w = mix[0][1];
  mix.forEach(function (m) { if (S.elapsed >= m[0]) w = m[1]; });
  let roll = Math.random() * Object.keys(w).reduce(function (a, k) { return a + w[k]; }, 0);
  for (const k in w) { roll -= w[k]; if (roll <= 0) return k; }
  return 'imp';
}
function ringPos(r) {
  const a = Math.random() * Math.PI * 2;
  return { x: S.hero.x + Math.cos(a) * r, z: S.hero.z + Math.sin(a) * r };
}
function unlockedShapes(runNo) {
  const n = clamp(runNo != null ? runNo : 1, 1, SHAPE_UNLOCK.length);
  return SHAPE_UNLOCK.slice(0, n);
}
function upcomingRun() {
  return clamp(titleSel != null ? titleSel : (save.stage || 1), 1, STAGES.length);
}
let titleSel = null;
function titleChip(shape) {
  const alt = SHAPE_MARK[shape] || shape;
  const src = art && art.sealUrl ? art.sealUrl(shape) : '';
  return '<span class="hanji-chip" data-shape="' + shape + '" title="' + alt + '"><img src="' + src + '" alt="' + alt + '" width="40" height="40"></span>';
}
/* v0.23 해금: 앞 장을 깨면 다음 장이 열리고, 한 막에 들어서 첫 장을 깼다면
   그 막의 네 장은 순서와 상관없이 도전할 수 있다(막 단위 도전 해금). */
function unlockedMax() {
  if (developerMode) return STAGES.length;
  const seq = clamp(save.stage || 1, 1, STAGES.length);
  const actStart = Math.floor((seq - 1) / 4) * 4 + 1;
  const actEnd = Math.min(STAGES.length, actStart + 3);
  const stars = save.stars || {};
  if (seq > actStart && (stars[actStart] || 0) > 0) return actEnd;
  return seq;
}
function selActOf(n) { return Math.max(1, Math.min(3, Math.floor(((n | 0) - 1) / 4) + 1)); }
let titleAct = null;
function previewStageWorld(n) {
  if (!three || (S && S.playing)) return;
  const st = stageOf(n || 1);
  applyStageAtmo(st);
  if (!three.map || three.map.stageId !== st.id || three.map.id !== st.map) switchMap(st.map, st.id);
}
function refreshTitleHelp() {
  try { renderChallenges(); } catch (e) {}
  /* 마지막에 깨운 스테이지가 이미 깨졌으면 새로 열린 장을 기본 선택으로 보여 준다. */
  if (titleSel == null) titleSel = clamp(save.stage || 1, 1, STAGES.length);
  else titleSel = clamp(titleSel, 1, unlockedMax());
  const el = $('titleShapes') || document.querySelector('.shapes-help');
  const sel = clamp((titleSel != null ? titleSel : (save.stage || 1)) | 0, 1, STAGES.length);
  const st = stageOf(sel);
  setChapterArt(st);
  const pool = (st.shapes || ['hline']).slice();
  if (el) el.innerHTML = pool.map(titleChip).join('');
  const sub = $('titleSub');
  if (sub) sub.textContent = st.sub + ' — 먹안개 안쪽 혼령의 종 모양을 그려, 그 혼령 방향으로 일섬 돌진하세요';
  const btn = $('btnStart');
  if (btn) btn.textContent = sel + '장 출전';
  const note = $('titleStageNote');
  if (note) {
    const stars = (save.stars || {})[st.id] || 0;
    note.innerHTML = '제' + actOf(st.id) + '막 ' + ACT_NAMES[actOf(st.id)] + ' · ' + st.tag + ' · 목표 ' + st.time + '초 · 별 '
      + '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars))
      + (save.bestScore ? ' · 최고 ' + save.bestScore : '')
      + ' · ' + curMode().name;
  }
  renderModes();
  renderStageSelect(sel);
  return { run: sel, stage: st, pool: pool, html: el ? el.innerHTML : '' };
}
/* 타이틀의 스테이지 선택 — 막 탭 + 4장 격자. 해금된 장만 누를 수 있다. */
function renderStageSelect(sel) {
  const box = $('titleStages');
  if (!box) return;
  const unlocked = unlockedMax();
  const cur = clamp(sel || titleSel || save.stage || 1, 1, STAGES.length);
  if (titleAct == null || titleAct !== selActOf(cur)) titleAct = selActOf(cur);
  const tabs = $('actTabs');
  if (tabs) {
    tabs.innerHTML = [1, 2, 3].map(function (a) {
      const first = (a - 1) * 4 + 1;
      const openA = unlocked >= first;
      let stars = 0;
      for (let i = 0; i < 4; i++) stars += ((save.stars || {})[first + i] || 0);
      const on = a === titleAct;
      return '<button type="button" class="act-tab' + (on ? ' on' : '') + (openA ? '' : ' lock') + '" data-act="' + a + '" role="tab" aria-selected="' + (on ? 'true' : 'false') + '">'
        + '<b>제' + a + '막</b><span>' + ACT_NAMES[a] + '</span><i>' + (openA ? ('★ ' + stars + '/12') : '잠김') + '</i></button>';
    }).join('');
    tabs.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        const a = +b.getAttribute('data-act');
        if (unlocked < (a - 1) * 4 + 1) return;
        titleAct = a;
        if (selActOf(titleSel || 1) !== a) titleSel = (a - 1) * 4 + 1;
        if (audio && audio.bell) audio.bell(0, 'hline');
        refreshTitleHelp();
        previewStageWorld(titleSel);
      });
    });
  }
  const list = STAGES.filter(function (s2) { return selActOf(s2.id) === titleAct; });
  box.innerHTML = list.map(function (s2) {
    const lock = s2.id > unlocked;
    const stars = (save.stars || {})[s2.id] || 0;
    const st = lock ? '' : ('<span class="st">' + '★'.repeat(stars) + '<i>' + '☆'.repeat(Math.max(0, 3 - stars)) + '</i></span>');
    return '<button type="button" class="stage-chip' + (s2.id === cur ? ' on' : '') + (lock ? ' lock' : '') + '" data-stage="' + s2.id + '"' + (lock ? ' disabled' : '') + '>'
      + '<b>' + (lock ? '·' : (s2.id + '장')) + '</b>' + (lock ? '잠김<br>' + s2.name : s2.name) + st + '<span class="tm">' + s2.time + '초</span></button>';
  }).join('');
  box.querySelectorAll('[data-stage]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.disabled) return;
      titleSel = +b.getAttribute('data-stage');
      if (audio && audio.bell) audio.bell(0, 'hline');
      refreshTitleHelp();
      previewStageWorld(titleSel);
    });
  });
}
/* 스테이지 인트로 카드 → 잠시 뒤 자동 출전(버튼·화면 탭으로 바로 시작) */
let pendingStage = null;
function setChapterArt(st) {
  const app = $('app');
  app.style.setProperty('--chapter-art', 'url("' + new URL('../assets/ink-edition/stage-' + st.id + '.webp', import.meta.url).href + '")');
  app.dataset.act = st.act;
}
function fillStageIntro(st) {
  setChapterArt(st);
  $('stageKicker').textContent = '제 ' + st.id + ' 장 · ' + curMode().name;
  $('stageName').textContent = st.name;
  $('stageSub').textContent = st.sub;
  $('stageGoal').textContent = st.goal;
  /* §6.1 수용 기준: 장 소개 카드에 지형 규칙 한 줄 */
  const te = $('stageTerrain');
  if (te) {
    const T = st.terrain;
    te.textContent = (T && T.kind !== 'none') ? ('지형 · ' + T.name + ' — ' + T.line) : '지형 효과 없음';
    te.hidden = !T || T.kind === 'none';
  }
  $('stageChips').innerHTML = (st.shapes || []).map(function (sh) {
    return titleChip(sh);
  }).join('');
  $('stageTip').textContent = st.tip || '';
  const b = $('btnStageGo');
  if (b) b.textContent = '일섬';
}
function beginStage(n) {
  const _t0 = performance.now();
  const st = stageOf(n);
  titleSel = st.id;
  fillStageIntro(st);
  showOv('ov-stage');
  const ps = pendingStage = { no: st.id, until: now() + (qa.noDelay ? 0 : 2600), at: now(), ready: false };
  // Give the intro card a paint before opening the audio device. Only start
  // the beat clock in startRun, even when the player skips the card early.
  const audioReady = new Promise(resolve => {
    if (!audio || qa.mute || qa.noDelay) { resolve(); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        if (pendingStage === ps && !qa.mute && !qa.noDelay) audio.resume();
      } catch (error) {
        console.warn('Audio preparation failed:', error);
      } finally {
        resolve();
      }
    }));
  });
  /* 소개 카드가 떠 있는 동안 무대를 짓고 셰이더를 데운다 — 카드가 걷힌 뒤 멈추지 않게. */
  if (three && (!three.map || three.map.stageId !== st.id || three.map.id !== st.map)) { applyStageAtmo(st); switchMap(st.map, st.id); }
  const stageReady = Promise.resolve(three && three._mapP).then(() => qa.skipWarm ? null : warmShaders());
  Promise.allSettled([stageReady, audioReady]).then(() => {
    ps.ready = true;
    if (pendingStage === ps && now() >= ps.until) goStageNow();
  });
  perfMark('beginStage', performance.now() - _t0, { stage: st.id });
  return st.id;
}
function goStageNow(force) {
  if (!pendingStage) return null;
  /* 카드를 눌러 넘겨도 무대가 다 지어질 때까지는 기다렸다가 바로 시작한다. */
  if (!pendingStage.ready && force !== true) {
    pendingStage.until = Math.min(pendingStage.until, now());
    $('btnStageGo').textContent = '무대 준비 중…';
    return null;
  }
  const n = pendingStage.no;
  pendingStage = null;
  startRun({ stage: n });
  return n;
}
function spawnPool() {
  if (!S) return unlockedShapes(1);
  if (S.sandbox) return SHAPE_UNLOCK.slice();
  if (S.practiceT > 0 && S.practiceSpawns > 0 && S.practiceShape) return [S.practiceShape];
  return (S.pool && S.pool.length) ? S.pool.slice() : unlockedShapes(S.runNo || 1);
}
function leastUsedShape() {
  const pool = spawnPool();
  const counts = {};
  pool.forEach(function (sh) { counts[sh] = 0; });
  livingMarks().forEach(function (s) {
    if (s.isBoss) return;
    const sh = spiritShape(s);
    if (counts[sh] != null) counts[sh]++;
  });
  let min = 99, best = pool.slice();
  pool.forEach(function (sh) {
    const n = counts[sh] || 0;
    if (n < min) { min = n; best = [sh]; }
    else if (n === min) best.push(sh);
  });
  return best[Math.floor(Math.random() * best.length)];
}
function pickSeq(n) {
  /* 보스의 도형 순서는 판 전체 기호를 고르게 섞어 쓴다(같은 모양 연속 금지). */
  const src = (S && S.pool && S.pool.length) ? S.pool : spawnPool();
  const pool = src.slice();
  if (!pool.length) return ['hline'];
  const a = [];
  let bag = [];
  while (a.length < n) {
    if (!bag.length) {
      bag = pool.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
      if (a.length && bag.length > 1 && bag[0] === a[a.length - 1]) { const t = bag[0]; bag[0] = bag[1]; bag[1] = t; }
    }
    a.push(bag.shift());
  }
  return a;
}

function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const apx = px - ax, apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  let t = ab2 < 1e-6 ? 0 : (apx * abx + apz * abz) / ab2;
  t = clamp(t, 0, 1);
  const qx = ax + abx * t, qz = az + abz * t;
  return Math.hypot(px - qx, pz - qz);
}

function projectXZ(x, z, y) {
  if (!three || !three.camera) return { x: 0, y: 0 };
  const box = viewBox();
  if (!_proj.v) _proj.v = new THREE.Vector3();
  _proj.v.set(x, y == null ? 0.4 : y, z).project(three.camera);
  return { x: (_proj.v.x * 0.5 + 0.5) * box.width, y: (-_proj.v.y * 0.5 + 0.5) * box.height };
}
/* 화면 상자(#app)는 뷰포트를 꽉 채우므로, 창 크기가 그대로면 다시 재지 않는다.
   예전에는 projectXZ 가 호출될 때마다 getBoundingClientRect 를 불러 한 프레임에 150~250번
   레이아웃을 강제했다(모바일에서 프레임 비용의 큰 몫). */
const _vb = { width: 375, height: 667, left: 0, top: 0 };
let _vbKey = '';
let _heroCssX = '', _heroCssY = '';
let _atmoMask = '';
function viewBox() {
  const key = (window.innerWidth || 0) + 'x' + (window.innerHeight || 0) + 'x' + (window.devicePixelRatio || 1);
  if (key !== _vbKey) {
    const host = $('app') || $('ink');
    if (!host) return _vb;
    const r = host.getBoundingClientRect();
    _vb.width = r.width; _vb.height = r.height; _vb.left = r.left; _vb.top = r.top;
    _vbKey = key;
  }
  return _vb;
}
function invalidateViewBox() { _vbKey = ''; }
function heroScreen() {
  const y = (three && three.heroSpr && three.heroSpr.userData && three.heroSpr.userData.worldH)
    ? three.heroSpr.userData.worldH * 0.45 : 0.85;
  return projectXZ(S.hero.x, S.hero.z, y);
}
function screenRingPx() {
  const box = viewBox();
  const lv = (S && S.ringLv) || 0;
  /* 짧은 축 기준 — 세로·가로 어느 쪽에서도 시야 원이 화면의 같은 비율을 차지한다. */
  let frac = (CFG.ringScreenFrac || 0.70) * (1 + (CFG.ringBoost || 0.14) * lv);
  const capFrac = CFG.ringMaxFrac || 0.90;
  const short = Math.min(box.width, box.height);
  const diam = Math.min(short * frac, short * capFrac);
  return Math.max(40, diam / 2);
}
function unprojectToY(sx, sy, y0) {
  if (!three || !three.camera) return { x: S && S.hero ? S.hero.x : 0, z: S && S.hero ? S.hero.z : 0 };
  const box = viewBox();
  if (!_proj.a) { _proj.a = new THREE.Vector3(); _proj.b = new THREE.Vector3(); }
  const ndcX = (sx / Math.max(1, box.width)) * 2 - 1;
  const ndcY = -(sy / Math.max(1, box.height)) * 2 + 1;
  _proj.a.set(ndcX, ndcY, 0).unproject(three.camera);
  _proj.b.set(ndcX, ndcY, 1).unproject(three.camera);
  const dx = _proj.b.x - _proj.a.x, dy = _proj.b.y - _proj.a.y, dz = _proj.b.z - _proj.a.z;
  if (Math.abs(dy) < 1e-6) return { x: S.hero.x, z: S.hero.z };
  const k = (y0 - _proj.a.y) / dy;
  return { x: _proj.a.x + dx * k, z: _proj.a.z + dz * k };
}
/* 혼령의 기호가 놓인 월드 좌표(구슬 중심). 혼령 그룹은 좀비 머리 위로 떠 있으므로 그 높이를 더한다. */
function bellWorld(s) {
  const off = (s && s.obj && s.obj.userData && s.obj.userData.bellLocal) || { x: 0, y: 1 };
  const g = (s && s.obj && s.obj.position) || { x: (s && s.x) || 0, y: 0, z: (s && s.z) || 0 };
  return { x: g.x, y: g.y + (off.y || 1), z: g.z };
}
function bellScreen(s) {
  const b = bellWorld(s);
  return projectXZ(b.x, b.z, b.y);
}
function screenAngleTo(sx, sy, from) {
  return Math.atan2(sy - from.y, sx - from.x);
}
function strokeScreenDir(pts) {
  if (!pts || pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 8) return null;
  return { x: dx / L, y: dy / L };
}
function strokeAimDir(pts, type) {
  if (!pts || pts.length < 2) return null;
  if (type === 'vee') {
    const ap = G.veeApex(pts);
    if (!ap.dir || ap.depth < 8) return strokeScreenDir(pts);
    return ap.dir;
  }
  return strokeScreenDir(pts);
}
/* 자동 추격기(V·⚡)의 대상 선택: 위협도 우선 — 예고 중 > 보스 > 가까운 것 > 마무리 가능. */
function threatScore(s, from) {
  if (!s) return 0;
  let k = 0;
  if (s.isBoss && s.state !== 'clones') k += 30; /* 분신 중에는 V·⚡ 자동 조준이 진짜를 알려 주지 않는다 */
  if (s.obj && s.obj.userData && s.obj.userData.teleOn) k += 20;
  k += 40 / (1 + dist(s, from));
  if (s.hp != null && s.hp <= (S ? dashDmg() : 2.5)) k += 8;
  return k;
}
function pickSpirits(shape, n, from, dir, exclude) {
  from = from || (S && S.hero);
  const skip = exclude || [];
  const list = livingMarks().filter(function (s) { return spiritShape(s) === shape && skip.indexOf(s) < 0; });
  const boss = list.filter(function (s) { return s.isBoss; });
  let rest = list.filter(function (s) { return !s.isBoss; });
  const on = rest.filter(function (s) { return isOnScreen(s, 20); });
  const off = rest.filter(function (s) { return !isOnScreen(s, 20); });
  if (on.length) rest = on;
  const heroScr = projectXZ(from.x, from.z);
  function sortRest(arr) {
    const copy = arr.slice();
    if (dir && (dir.x || dir.y)) {
      const dMax = copy.reduce(function (m, s) { return Math.max(m, dist(s, from)); }, 1) || 1;
      const cone = CFG.aimConeCos || 0.5;
      const wN = CFG.aimNearW == null ? 0.35 : CFG.aimNearW;
      const scored = copy.map(function (s) {
        const va = projectXZ(s.x, s.z);
        const da = Math.hypot(va.x - heroScr.x, va.y - heroScr.y) || 1;
        const cos = ((va.x - heroScr.x) / da) * dir.x + ((va.y - heroScr.y) / da) * dir.y;
        const score = cos - wN * (dist(s, from) / dMax);
        return { s: s, cos: cos, score: score };
      });
      let pick = scored.filter(function (o) { return o.cos >= cone; });
      if (!pick.length) {
        copy.sort(function (a, b) { return dist(a, from) - dist(b, from); });
        return copy;
      }
      pick.sort(function (a, b) { return b.score - a.score; });
      return pick.map(function (o) { return o.s; });
    } else {
      /* 방향이 없는 모양(V·⚡)은 위협도 순위로 고른다. */
      copy.sort(function (a, b) { return threatScore(b.target, from) - threatScore(a.target, from); });
    }
    return copy;
  }
  rest = sortRest(rest);
  if (rest.length < n && off.length) rest = rest.concat(sortRest(off));
  return boss.concat(rest).slice(0, Math.max(0, n));
}
function spiritShape(s) {
  if (!s) return null;
  /* 기물은 제 무늬를 지킨다(한 가지 종도 덮지 않는다). */
  if (s.kind === 'spirit' && s.target && s.target.isTotem) return s.target.shape;
  if (S && S.bellT > 0 && S.bellShape) return S.bellShape;
  if (s.kind === 'spirit' && s.target && s.target.isClone && S && S.boss && S.boss.alive) return S.boss.seq[S.boss.seqI] || s.shape;
  /* v0.31 §3.2 강적 깨는 법: 갑이 깨지거나 돌에 금이 가면 혼령 무늬가 판 중에 바뀐다. */
  if (s.kind === 'spirit' && s.target && s.target.alive && s.target.shapeOv) return s.target.shapeOv;
  if (s.kind === 'spirit' && s.target && s.target.isBoss && s.target.alive && s.target.state === 'seal') return 'star';
  if (s.kind === 'spirit' && s.target && s.target.isBoss && s.target.alive && s.target.seq) {
    return s.target.seq[s.target.seqI] || s.shape;
  }
  /* 정예 봉인 순서: 지금 차례의 무늬만 혼령에 뜬다. */
  if (s.kind === 'spirit' && s.target && s.target.alive && s.target.seq && s.target.seqI != null) {
    return s.target.seq[s.target.seqI] || s.shape;
  }
  return s.isBoss ? s.seq[s.seqI] : s.shape;
}
function startBell(shape, dur) {
  if (!S) return;
  S.bellShape = shape || spawnPool()[Math.floor(Math.random() * spawnPool().length)];
  /* v0.23: 바닥에서 주운 종도 만종(萬鐘) 진화를 먼저 판정한다 — 진화가 지속시간을 늘린다. */
  checkEvolutions({ bell: true });
  const base = dur != null ? dur : CFG.bellDur;
  S.bellT = (S.evo && S.evo.myriadBell) ? Math.max(base, CFG.bellMyriadDur || 12) : base;
  S.bellCine = false;
  livingMarks().forEach(function (s) {
    if (s.obj) {
      if (art.setSpiritShape) art.setSpiritShape(s.obj, S.bellShape);
      if (art.setAura) art.setAura(s.obj, true);
    }
  });
  beginOnebell();
  toast('모든 종이 ' + (SHAPE_MARK[S.bellShape] || '') + ' 모양이 됐습니다');
  renderHud();
}
function endBell() {
  if (!S) return;
  S.bellT = 0; S.bellShape = null;
  livingMarks().forEach(function (s) {
    if (s.obj) {
      if (art.setSpiritShape) art.setSpiritShape(s.obj, spiritShape(s));
      if (art.setAura) art.setAura(s.obj, false);
    }
  });
  endOnebell();
  renderHud();
}
function setDashElem(el) {
  if (!S) return;
  S.dashElem = el || null;
  renderHud();
}
/* ---------- v0.23 원소 각인 · 임시 부적 ----------
   레벨업 카드 = 원소 각인 Lv1~3(영구), 바닥 부적 = 12초 임시 부여.
   둘을 분리해 바닥 부적이 키운 빌드를 덮어쓰지 않는다. */
function elemLv(el) { return (S && S.elemLv && S.elemLv[el]) || 0; }
function elemNameOf(el) { return el === 'ice' ? '얼음' : el === 'fire' ? '화염' : el === 'poison' ? '독' : ''; }
function curElem() {
  if (!S) return null;
  if (S.tempElem && S.tempElem.t > 0) return S.tempElem.el;
  /* §5.4 두 번째 원소 칸: 일섬마다 두 원소가 번갈아 실린다. */
  const sl = S.elemSlots || [];
  if (sl.length >= 2) return sl[(S.elemIdx || 0) % 2];
  return S.dashElem;
}
/** §5.4 원소 칸: 각인 하나가 Lv2가 되면 두 번째 칸이 열린다. */
function refreshElemSlots() {
  if (!S) return [];
  S.elemOrder = S.elemOrder || [];
  ['ice', 'fire', 'poison'].forEach(function (el) {
    if (elemLv(el) > 0 && S.elemOrder.indexOf(el) < 0) S.elemOrder.push(el);
  });
  const maxLv = Math.max(elemLv('ice'), elemLv('fire'), elemLv('poison'));
  S.elemSlotN = maxLv >= 2 ? 2 : 1;
  S.elemSlots = S.elemOrder.slice(0, S.elemSlotN);
  if (S.elemSlots.length) S.dashElem = S.elemSlots[0];
  return S.elemSlots;
}
function elemIceDur() { return (CFG.iceDur || 2.5) + (CFG.iceDurStep || 0.5) * Math.max(0, elemLv('ice') - 1); }
function elemShatterDmg() { return (CFG.shatterDmg || 4) + (CFG.shatterStep || 1) * Math.max(0, elemLv('ice') - 1); }
function frostImpact(lv) { return 1 + .5 * Math.max(0,lv-1); }
function fireImpact(lv) { return 2 + Math.max(0, lv - 1); }
function elemBurnDur() { return (CFG.burnDur || 3) + (CFG.burnDurStep || 0.5) * Math.max(0, elemLv('fire') - 1); }
function elemBurnDmg() { return (CFG.burnDmg || 1) + (CFG.burnDmgStep || 0.3) * Math.max(0, elemLv('fire') - 1); }
function elemPoisonMax() { return Math.round((CFG.poisonMax || 5) + (CFG.poisonMaxStep || 1) * Math.max(0, elemLv('poison') - 1)); }
function elemPoisonDmg() { return (CFG.poisonDmgPer || 1) + (CFG.poisonDmgStep || 0.2) * Math.max(0, elemLv('poison') - 1); }
function elemCloudR() { return (CFG.poisonCloudR || 2) + (CFG.cloudRStep || 0.6) * Math.max(0, elemLv('poison') - 1); }
function triggerCinematic() {
  S.slowT = CFG.slowDur;
  if (S.lastDash) S.lastDash.cinematic = true;
  const app = $('app');
  if (app) {
    app.classList.add('ink-burst');
    setTimeout(function () { app.classList.remove('ink-burst'); }, 900);
  }
  onebellSlash();
}

const onebell = { phase: 'off', ink: 0, t: 0 };
function loadMarkImages() {
  const dabUrl = art.images && art.images.inkDab && art.images.inkDab.image ? null : (art.images && art.fx);
  if (art.images && art.images.inkDab && art.images.inkDab.image) {
    paintInk._dab = art.images.inkDab.image;
  } else if (art.atlas && art.atlas.fx && art.atlas.fx['ink-dab']) {
    const im = new Image();
    im.src = art.BASE + art.atlas.fx['ink-dab'].file;
    paintInk._dab = im;
  }
}
function setOnebellInk(n) {
  const app = $('app'); if (!app) return;
  onebell.ink = n;
  for (let i = 0; i < 4; i++) app.classList.toggle('onebell-ink-' + i, i === n);
}
function beginOnebell() {
  const app = $('app'); if (!app) return;
  onebell.phase = 'hold'; onebell.t = 0;
  app.classList.add('onebell', 'onebell-hold');
  setOnebellInk(0);
  setTimeout(function () { if (onebell.phase !== 'off') setOnebellInk(1); }, qa.noDelay ? 0 : 250);
  if (!qa.noDelay) {
    const prev = qa.timeScale || 1;
    qa.timeScale = 0.001;
    setTimeout(function () { if (qa.timeScale === 0.001) qa.timeScale = prev; }, 80);
  }
}
function onebellSlash() {
  const app = $('app'); if (!app || onebell.phase === 'off') return;
  onebell.phase = 'slash';
  setOnebellInk(3);
  app.classList.add('onebell-paper', 'onebell-burst');
  setTimeout(function () { app.classList.remove('onebell-paper'); }, 80);
  setTimeout(function () { app.classList.remove('onebell-burst'); }, 350);
  setTimeout(function () {
    if (onebell.phase === 'slash') { setOnebellInk(1); onebell.phase = 'hold'; }
  }, qa.noDelay ? 0 : 400);
}
function endOnebell() {
  clearOnebell(false);
}
function clearOnebell(immediate) {
  const app = $('app'); if (!app) return;
  const go = function () {
    onebell.phase = 'off';
    app.classList.remove('onebell', 'onebell-hold', 'onebell-paper', 'onebell-burst');
    for (let i = 0; i < 4; i++) app.classList.remove('onebell-ink-' + i);
  };
  if (immediate || qa.noDelay) go();
  else setTimeout(go, 400);
}

const _proj = { v: null };
let lastMarkMetrics = { cssPx: 40, minCss: 40, w: 0, h: 0, marks: [] };
function markCssSize(w) {
  const min = CFG.markMinCss || 12;
  const max = CFG.markMaxCss || 32;
  return clamp(Math.round(min * Math.sqrt((w || 375) / 375)), min, max);
}

/* 2D 오버레이의 방사형 그라디언트를 한 번만 구워 스프라이트로 재사용한다.
   예전에는 영혼 흐름·안개 물결·혼령 창이 프레임마다 createRadialGradient를 30~110번 새로 만들었다
   (매번 새 객체 → GC 압박 + 래스터라이즈 비용). 이제 drawImage 한 번으로 끝난다. */
const _glowSprites = {};
function glowSprite(key, stops, size) {
  if (_glowSprites[key]) return _glowSprites[key];
  const n = size || 64;
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  stops.forEach(function (s) { grd.addColorStop(s[0], s[1]); });
  g.fillStyle = grd;
  g.fillRect(0, 0, n, n);
  _glowSprites[key] = c;
  return c;
}
function drawGlow(ctx, img, x, y, rx, ry, alpha) {
  if (!(alpha > 0) || !(rx > 0) || !(ry > 0)) return;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * Math.min(1, alpha);
  ctx.drawImage(img, x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = a;
}

/* Soul stream: a soft jade wisp drawn from each spirit into the hero.
   v0.27: the spirit body stays the bright thing — the tether is a thin, dim ink wisp, not a beam. */
function drawSoulStreams(ctx, marks) {
  const t = (S.elapsed || 0);
  const hs = heroScreen();
  const ribbon = glowSprite('soul-ribbon', [[0, 'rgba(110,214,176,1)'], [1, 'rgba(110,214,176,0)']], 32);
  const mote = glowSprite('soul-mote', [[0, 'rgba(170,240,215,1)'], [0.5, 'rgba(88,190,160,0.636)'], [1, 'rgba(88,190,160,0)']], 32);
  (marks || livingMarks()).forEach(function (sp, si) {
    if (!sp.target || !sp.target.alive || !sp.obj) return;
    const a0 = (CFG.spiritStreamAlpha || 0.55) * clamp((sp.age || 0) / (CFG.spiritFadeIn || 0.4), 0, 1);
    const from = screenOf(sp);
    const dx = hs.x - from.x, dy = hs.y - from.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const bend = Math.min(26, L * 0.12) * (si % 2 ? 1 : -1);
    const cx = (from.x + hs.x) / 2 + nx * bend, cy = (from.y + hs.y) / 2 + ny * bend;
    function at(u) {
      const v = 1 - u, w = Math.sin(u * Math.PI * 3 - t * 6 + si) * 5 * (1 - u);
      return { x: v * v * from.x + 2 * v * u * cx + u * u * hs.x + nx * w, y: v * v * from.y + 2 * v * u * cy + u * u * hs.y + ny * w };
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    /* Faint ribbon: a hair thin at the hero, never wider than a few pixels of glow. */
    for (let k = 0; k < 18; k++) {
      const u = k / 17, p = at(u), r = 5.0 * (1 - u) + 1.4;
      drawGlow(ctx, ribbon, p.x, p.y, r, r, a0 * 0.11);
    }
    /* A few dim motes drifting into the hero — no white core, no bright bead. */
    for (let k = 0; k < 4; k++) {
      const u = ((t * 0.42 + k / 4 + si * 0.13) % 1);
      const p = at(u), r = 3.4 * (1 - u * 0.7);
      const wa = a0 * Math.sin(Math.PI * u) * 0.5;
      drawGlow(ctx, mote, p.x, p.y, r * 2.4, r * 2.4, wa * 0.55);
    }
    ctx.restore();
  });
}
/* 혼령 구슬의 화면 중심과 반지름(px). 구슬은 256px 셀에서 반지름 58px로 그려진다. */
function spiritOrbScreen(s) {
  const ud = (s && s.obj && s.obj.userData) || {};
  const H = ud.bodyH || ud.worldH || 1.5;
  const c = bellScreen(s);
  const yc = bellWorld(s).y;
  const offx = (ud.bellLocal && ud.bellLocal.x) || 0;
  const rw = H * (58 / 256);
  const up = projectXZ((s && s.x) || 0, (s && s.z) || 0, yc + rw);
  const rt = projectXZ((s && s.x) || 0, (s && s.z) || 0, yc - rw);
  return { x: c.x, y: c.y, r: Math.max(5, Math.max(Math.abs(c.y - up.y), Math.abs(rt.y - c.y))), x0: offx };
}
/* 드로잉 프리뷰: 인식 중인 기호의 잉크 색 — v0.39 팔레트 토큰에서만 꺼낸다(2D 캔버스는 hex 문자열). */
const INK_OF = {
  hline: palHex('jade'), vline: palHex('rust'), vee: palHex('violet'), bolt: palHex('goldHot'), circle: palHex('goldHot'),
  tap: palHex('paper'), tri: palHex('violetPale'), arc: palHex('violetPale'), spiral: palHex('violetPale')
};
function inkColorFor(type) { return INK_OF[type] || palHex('jadeInk'); }
// Use the same stroke paths as the marks engraved on the spirit bells.
function brushMark(ctx,shape,x,y,size) {
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(size,size);
  ctx.strokeStyle=ctx.fillStyle;
  ctx.lineJoin='round';ctx.lineCap='round';
  for(const path of SPIRIT_GLYPH_PATHS[shape] || []) {
    for(let i=1;i<path.length;i++){
      ctx.lineWidth=(shape==='spiral' ? .14 : .25)*(.65+.45*Math.sin(Math.PI*i/(path.length+.5)));
      ctx.beginPath();ctx.moveTo(...path[i-1]);ctx.lineTo(...path[i]);ctx.stroke();
    }
  }
  ctx.restore();
}
function updateMarks() {
  const c = $('marks');
  if (!c) return;
  const r = viewBox();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.floor(r.width * dpr) || c.height !== Math.floor(r.height * dpr)) {
    c.width = Math.max(1, Math.floor(r.width * dpr));
    c.height = Math.max(1, Math.floor(r.height * dpr));
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  const size = markCssSize(r.width);
  lastMarkMetrics = { cssPx: size, minCss: CFG.markMinCss || 12, w: r.width, h: r.height, marks: [] };
  if (!S || !three) return;
  if (!_proj.v) _proj.v = new THREE.Vector3();
  if (S.playing && S.hero) {
    if (!(S.ringR > 0)) applyRingBoost();
    else refreshRingPoly();
  }
  const hs = (S.playing && S.hero) ? heroScreen() : { x: r.width * 0.5, y: r.height * 0.55 };
  const ringPx = (S.playing && S.hero) ? ((S.ringPx > 0) ? S.ringPx : screenRingPx()) : 0;
  if (S.playing && S.hero && ringPx > 0) {
    if (!(S.ringR > 0) || !S.ringPoly) applyRingBoost();
    const pts = ringScreenPts();
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    if (pts.length) {
      pts.forEach(function (p) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      });
    }
    const diam = (maxX > minX) ? (maxX - minX) : ringPx * 2;
    lastMarkMetrics.ring = {
      r: ringR(), px: diam / 2, rx: diam / 2, ry: (maxY > minY) ? (maxY - minY) / 2 : 0,
      cx: hs.x, cy: hs.y, diamPx: diam, frac: r.width ? diam / r.width : 0,
      ringLv: S.ringLv || 0, pts: pts, kind: 'ellipse'
    };
  }
  drawSoulStreams(ctx, livingMarks());
  const placed = [];
  const arrows = [];
  const aimId = S.aimTarget && S.aimTarget.alive ? S.aimTarget.id : null;
  /* The boss's shape order rides on its spirit's bell; the boss itself carries no mark. */
  const marks = livingMarks();
  const bossSpirit = (S.boss && S.boss.alive && S.boss.state !== 'clones') ? marks.filter(function (s) { return s.target === S.boss; })[0] : null;
  marks.forEach(function (s) {
    if (!s.obj || !s.obj.visible) return;
    const bp = bellScreen(s);
    const ox = bp.x, oy = bp.y;
    const bh = (s.obj.userData && s.obj.userData.bellH) || 0.4;
    const bodyH = (s.obj.userData && s.obj.userData.bodyH) || 1.5;
    const bellTop = projectXZ(s.x, s.z, ((s.obj.userData.bellLocal || {}).y || bh) + bh * 0.5);
    const bellBot = projectXZ(s.x, s.z, ((s.obj.userData.bellLocal || {}).y || bh) - bh * 0.5);
    const bellPx = Math.max(16, Math.hypot(bellTop.x - bellBot.x, bellTop.y - bellBot.y));
    const bodyTop = projectXZ(s.x, s.z, bodyH);
    const bodyBot = projectXZ(s.x, s.z, 0);
    const bodyPx = Math.max(16, Math.hypot(bodyTop.x - bodyBot.x, bodyTop.y - bodyBot.y));
    const orb = spiritOrbScreen(s);
    /* 혼령 기호는 구슬 지름의 0.82배 — 구슬 안에 쏙 들어가는 크기. 보스는 눈 위 기호라 조금 크게. */
    const glyphPx = s.isBoss
      ? clamp(Math.round(bellPx * 1.25), 20, 40)
      : clamp(Math.round(orb.r * 2 * 0.82), CFG.markMinCss || 12, CFG.markMaxCss || 30);
    const on = !(ox < -20 || oy < -20 || ox > r.width + 20 || oy > r.height + 20);
    const item = {
      x: orb.x, y: orb.y, ox: ox, oy: oy, cssPx: glyphPx, orbR: orb.r, onScreen: on,
      shape: spiritShape(s), boss: !!(s.isBoss || (s.target && s.target.isBoss)), id: s.id, aim: s.id === aimId,
      seq: s === bossSpirit ? (S.boss.seq || []).slice() : null, seqI: s === bossSpirit ? (S.boss.seqI || 0) : 0,
      bellPx: bellPx, bodyPx: bodyPx
    };
    lastMarkMetrics.marks.push(item);
    if (on) placed.push(item);
    if (s.target && s.target.alive && !isOnScreen(s.target, 20)) {
      const tp = projectXZ(s.target.x, s.target.z, 0.8);
      const m = 18;
      arrows.push({
        x: clamp(tp.x, m, r.width - m), y: clamp(tp.y, m, r.height - m),
        ox: tp.x, oy: tp.y, id: s.target.id, shape: item.shape
      });
    } else if (s.target && s.target.alive && relicOn(save, 'oldbell') && dist(s.target, S.hero) > ringR() * 1.15) {
      /* §9.4 묵은 방울: 원 밖 혼령의 방향 화살표가 방울 주기(0.9초) 중 마지막 0.5초 — 0.5초 일찍 미리 보인다. */
      if (((S.elapsed || 0) % 0.9) > 0.4) {
        const tp = projectXZ(s.target.x, s.target.z, 0.8);
        const m = 18;
        arrows.push({
          x: clamp(tp.x, m, r.width - m), y: clamp(tp.y, m, r.height - m),
          ox: tp.x, oy: tp.y, id: s.target.id, shape: item.shape, lead: true
        });
      }
    }
  });
  lastMarkMetrics.arrows = arrows;
  lastMarkMetrics.markStyle = 'ink';
  if (placed.length) {
    lastMarkMetrics.cssPx = placed.reduce(function (m, p) { return Math.max(m, p.cssPx || 0); }, 0) || size;
    lastMarkMetrics.bellPx = placed.reduce(function (m, p) { return Math.max(m, p.bellPx || 0); }, 0);
    lastMarkMetrics.bodyPx = placed.reduce(function (m, p) { return Math.max(m, p.bodyPx || 0); }, 0);
  }
  /* v0.52: 보스전이 HP 대결 체계로 전환됨에 따라 머리 위 구식 '무늬 순서 배열' 칩은 숨겨
     플레이어가 "HP를 깎는가 vs 무늬 순서를 지우는가" 혼동하지 않도록 정리한다(현재 약점 혼령은 3D로 선명히 표시). */
  arrows.forEach(function (a) {
    const dx = a.ox - a.x, dy = a.oy - a.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = 'rgba(232,192,74,0.92)';
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, 6); ctx.lineTo(-7, -6); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
  if (aimId && S.hero && three && three.camera) {
    const tgt = marks.filter(function (s) { return s.id === aimId; })[0];
    if (tgt) {
      _proj.v.set(S.hero.x, 0.4, S.hero.z).project(three.camera);
      const hx = (_proj.v.x * 0.5 + 0.5) * r.width;
      const hy = (-_proj.v.y * 0.5 + 0.5) * r.height;
      const tscr = screenOf(tgt);
      ctx.save();
      ctx.strokeStyle = 'rgba(232,192,74,0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tscr.x, tscr.y); ctx.stroke();
      ctx.restore();
    }
  }
  drawOverlays(ctx, r, hs);
}
/* 프리뷰·락온·보스 예고선·참(斬)·패링 연출을 한 겹에 그린다. */
function drawOverlays(ctx, r, hs) {
  if (!S) return;
  const t = S.elapsed || 0;
  /* §3.1 금빛 화면 가장자리 번쩍임: 받아치기·역류·파훼 — 화면을 가리지 않게 가장자리만. */
  if (S.goldEdge > 0) {
    const k = clamp(S.goldEdge / 0.2, 0, 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,110,' + (0.55 * k).toFixed(3) + ')';
    ctx.lineWidth = 10 + 10 * k;
    ctx.shadowColor = 'rgba(255,214,110,' + (0.8 * k).toFixed(3) + ')';
    ctx.shadowBlur = 26 * k;
    ctx.strokeRect(2, 2, r.width - 4, r.height - 4);
    ctx.restore();
  }
  const pv = S.preview;
  /* 1) 확정 예고선: 손을 떼기 전에 예상 착지까지 먹선으로 보여 준다. */
  if (pv && pv.show && pv.to && S.hero) {
    const a = projectXZ(S.hero.x, S.hero.z, 0.35);
    const b = projectXZ(pv.to.x, pv.to.z, 0.15);
    ctx.save();
    ctx.strokeStyle = 'rgba(236,240,230,0.35)';
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }
  /* 2) 락온 링(회전) + 조준 콘(±60°) */
  const tgt = (S.aimTarget && S.aimTarget.alive) ? S.aimTarget : null;
  if (tgt && S.hero) {
    const tp = screenOf(tgt);
    const rot = (t % 6) * 0.21;
    ctx.save();
    ctx.strokeStyle = 'rgba(91,232,196,0.85)';
    ctx.lineWidth = 2;
    const rr = 20 + Math.sin(t * 4) * 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(tp.x, tp.y, rr, rot + i * 2.094, rot + i * 2.094 + 1.1); ctx.stroke();
    }
    const dirA = Math.atan2(tp.y - hs.y, tp.x - hs.x);
    const len = Math.hypot(tp.x - hs.x, tp.y - hs.y);
    ctx.beginPath(); ctx.moveTo(hs.x, hs.y);
    ctx.arc(hs.x, hs.y, Math.max(20, len), dirA - 1.047, dirA + 1.047);
    ctx.closePath();
    ctx.fillStyle = 'rgba(91,232,196,0.09)';
    ctx.fill();
    ctx.restore();
  }
  /* 3) 손가락 위 상태 칩: 지금 무엇으로 읽히는지, 신뢰도는 얼마인지 */
  const chip = pv && pv.chip;
  if (chip) {
    const x = chip.x, y = chip.y - 26;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(9,8,11,0.74)'; ctx.fill();
    ctx.strokeStyle = inkColorFor(chip.type); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(chip.conf || 0, 0, 1));
    ctx.strokeStyle = (chip.conf || 0) >= 0.38 ? inkColorFor(chip.type) : 'rgba(140,140,140,0.85)';
    ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = chip.type ? inkColorFor(chip.type) : 'rgba(210,210,210,0.95)';
    ctx.font = '700 17px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(chip.type ? (G.LABELS[chip.type] || '') : '?', x, y + 1);
    if (chip.hint) {
      ctx.font = '700 11px sans-serif';
      ctx.fillStyle = 'rgba(244,236,214,0.92)';
      ctx.fillText(chip.hint, x, y + 34);
    }
    ctx.restore();
  }
  /* 4) 보스 돌진 예고선: v0.50 수묵·주홍 테이퍼 레인 + 전진 화살 펄스 */
  const b = S.boss;
  if (b && b.alive && b.state === 'telegraph' && b.aim) {
    const bt = bossTiming();
    const tf = clamp((b.stateT || 0) / bt.teleT, 0, 1);
    bossFx.drawChargeTele(ctx, projectXZ, b.x, b.z, b.aim.x, b.aim.z, tf, t);
  }
  bossFx.drawHazards(ctx, projectXZ, S.hazards, t);
  bossFx.drawShots(ctx, projectXZ, S.shots, t, S.hero);
  drawBossPat(ctx, r, hs);
  /* 5) 정예 원귀 바닥 경고 링 */
  S.zombies.forEach(function (z) {
    if (!z.alive || !z.elite) return;
    const p = projectXZ(z.x, z.z, 0.05);
    const rr = (z.r || 0.85) * worldPerCss() * (1.35 + 0.12 * Math.sin(t * 5));
    ctx.save();
    ctx.strokeStyle = 'rgba(232,192,74,0.55)';
    ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(10, rr), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });
  /* 6) 참(斬) — 거대한 붓글씨와 먹 번짐 */
  if (S.cleaveFx > 0) {
    const k = clamp(S.cleaveFx / 0.6, 0, 1);
    const cx = r.width * 0.5, cy = r.height * 0.46;
    ctx.save();
    ctx.globalAlpha = k;
    const rr = (1 - k) * Math.min(r.width, r.height) * 0.62;
    ctx.strokeStyle = 'rgba(91,232,196,' + (0.55 * k).toFixed(3) + ')';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,250,' + (0.35 * k).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, rr * 0.72, 0, Math.PI * 2); ctx.stroke();
    /* 글자는 먹 위에 얹힌 한지빛 — 화면을 가리지 않도록 반투명으로 */
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(Math.min(r.width, r.height) * 0.26) + 'px serif';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(244,236,214,' + (0.72 * k).toFixed(3) + ')';
    ctx.fillText('斬', cx, cy);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(91,232,196,' + (0.8 * k).toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    ctx.strokeText('斬', cx, cy);
    ctx.restore();
  }
  /* 7.5) v0.49 집중 개편: 심안의 원 붓경계 + 난전 주인공 발밑 시인성 비콘 */
  drawHeroBeaconAndSightRing(ctx, r, hs, t);
  /* 8) 지금 일섬에 실린 원소: 주인공 발밑 오라, 바닥 부적은 남은 시간 고리 */
  drawHeroElement(ctx, t);
  /* 9) 체력이 깎인 원귀의 체력 막대 (심안 안이거나 혼령이 붙은 적만) */
  drawEnemyBars(ctx);
  /* v0.31: 파훼 표시·정예 봉인 순서·호신부·벼락 예고·먹 발자국 */
  drawV31(ctx, r, hs, t);
  /* v0.32 §6.1: 지형 마커·달빛·종의 드러냄 */
  drawTerrain(ctx, r, hs, t);
  /* v0.34 §6.2: 부목표 표시(석등·어둠) */
  drawGoal(ctx, r, hs, t);
  /* 7) 칼집 패링 섬광 */
  if (S.parryFlash > 0) {
    const k = clamp(S.parryFlash / 0.12, 0, 1);
    const g = ctx.createRadialGradient(hs.x, hs.y, 0, hs.x, hs.y, 120);
    g.addColorStop(0, 'rgba(255,255,250,' + (0.55 * k).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,255,250,0)');
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(hs.x - 130, hs.y - 130, 260, 260);
    ctx.strokeStyle = 'rgba(255,255,250,' + (0.7 * k).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hs.x, hs.y, 30 + (1 - k) * 70, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  inkFx.draw(ctx, projectXZ, S.hero, r, frameDt);
  bossFx.draw(ctx, projectXZ, frameDt);
  /* §8.1·§8.2: 유도 획·참(O) 안내·기물 연습·첫 칼 튕김 화살표·제자리 탭 링 */
  drawTutorial(ctx, r, hs);
  /* §11 색약: 붉은 장판은 색 대신 '바깥으로 뻗은 막대'로도 읽힌다. */
  if (a11yCb() && S.hazards && S.hazards.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,150,70,0.85)'; ctx.lineWidth = 2.5;
    S.hazards.forEach(function (h) {
      if (h.done) return;
      const c = projectXZ(h.x, h.z, 0.05), rx = h.r * worldPerCss(), ry = rx * 0.55;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + (t || 0) * 0.4;
        const x1 = c.x + Math.cos(a) * rx * 0.55, y1 = c.y + Math.sin(a) * ry * 0.55;
        const x2 = c.x + Math.cos(a) * rx, y2 = c.y + Math.sin(a) * ry;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    });
    ctx.restore();
  }
}
/* ---------- v0.32 §6.1 지형 표시 ----------
   지형은 3D 소품과 무관하게 판정되므로, 판단에 필요한 것만 얇은 먹선으로 그린다.
   한 화면에 너무 많이 그리지 않도록 영웅 주변(원 ×1.5)만, 종류별로 최대 몇 개만. */
function drawGoal(ctx, r, hs, t) {
  const g = S && S.goal;
  if (!g) return;
  if (g.id === 'guard' && g.pos) {
    const p = projectXZ(g.pos.x, g.pos.z, 0.1);
    const ok = g.ok, fail = g.fail;
    ctx.save();
    ctx.strokeStyle = fail ? 'rgba(120,110,100,0.5)' : ok ? 'rgba(46,230,166,0.8)' : 'rgba(232,192,74,' + (0.55 + 0.35 * Math.sin(t * 4)).toFixed(3) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 26, 14, 0, 0, Math.PI * 2); ctx.stroke();
    const top = projectXZ(g.pos.x, g.pos.z, 1.5);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    ctx.font = '700 16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = fail ? 'rgba(160,150,140,0.7)' : 'rgba(255,236,190,0.95)';
    ctx.fillText('석등', top.x, top.y - 8);
    ctx.font = '700 12px serif';
    ctx.fillText(g.hp + '/' + g.hpMax, top.x, top.y + 12);
    ctx.restore();
  } else if (g.id === 'dark' && goalWindowOn()) {
    ctx.save();
    ctx.fillStyle = 'rgba(2,2,6,0.34)';
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.font = '700 13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(210,200,240,0.8)';
    ctx.fillText('어둠 — 원이 좁아졌습니다 · 방울이 크게 울립니다 ' + Math.max(0, Math.ceil(g.win - g.t)) + '초', r.width * 0.5, 108);
    ctx.restore();
  }
}
const PATCH_SPECS = {rubble:[5,11,.42,.9,1.9],bamboo:[6.5,37,.55,2,3.4],bell:[10,83,.4,.5,.5],blood:[8,97,.55,2.4,3.2]};
function syncGroundEffects() {
  const layer = three.groundEffects || (three.groundEffects = makeGroundLayer(three.scene));
  layer.begin();
  if (!S?.hero || !S.playing) { layer.end(); return; }
  const hx=S.hero.x, hz=S.hero.z, R=Math.min(16,Math.max(6,ringR()*1.5));
  const T=S.terrain, kind=T?.kind;

  if (PATCH_SPECS[kind]) {
    // Cell centres do not move. Re-query only after movement or a sight change.
    const cached = layer.patches;
    if (!cached || cached.kind !== kind || cached.radius !== R || Math.hypot(hx-cached.x,hz-cached.z) > .5) {
      layer.patches = {kind, radius:R, x:hx, z:hz, list:tPatchesNear(hx,hz,R+.5,...PATCH_SPECS[kind])};
    }
    for (const p of layer.patches.list) {
      if (kind==='bamboo') {
        for(let i=0;i<6;i++) {
          const a=i*Math.PI/3+p.x*.13;
          layer.put('loot',12+i%4,p.x+Math.cos(a)*p.r*.8,p.z+Math.sin(a)*p.r*.8,p.r*.83,p.r*.83,a);
        }
      } else {
        const cell=kind==='rubble'?0:kind==='bell'?2:T.stones[p.key]>S.elapsed?4:3;
        layer.put('terrain',cell,p.x,p.z,p.r*2,p.r*2);
      }
    }
  } else if(kind==='root'||kind==='snow') {
    for(let cx=Math.floor((hx-R)/7);cx<=Math.floor((hx+R)/7);cx++) {
      for(let cz=Math.floor((hz-R)/7);cz<=Math.floor((hz+R)/7);cz++) {
        if(tHash(cx,cz,71)>=.55)continue;
        const x=cx*7+3.5+(tHash(cx,cz,72)-.5)*3.5,z=cz*7+3.5+(tHash(cx,cz,73)-.5)*3.5;
        const a=tHash(cx,cz,74)*Math.PI,len=2.2+tHash(cx,cz,75)*1.6;
        layer.put('terrain',kind==='root'?1:6,x+Math.cos(a)*len/2,z+Math.sin(a)*len/2,len,kind==='root'?1.1:2,a);
      }
    }
  } else if(kind==='water' && !(three && three.river)) {
    for(let i=Math.floor((hx-R)/3);i<=Math.ceil((hx+R)/3);i++) {
      const x=i*3,z=tWaterCenter(x),width=2*(2.1+.7*Math.sin(x*.13+.6));
      layer.put('terrain',5,x,z,3.5,width);
    }
  }
  for(const hazard of S.hazards || []) if(hazard.arrowVolley && hazard.done)
    layer.put('terrain',7,hazard.x,hazard.z,hazard.r*2,hazard.r*2);
  for(const p of S.inkSteps || []) {
    const age=1-clamp(p.t/(CFG.inkStep.dur||2),0,1);
    layer.put('phases',8+Math.min(3,Math.floor(age*4)),p.x,p.z,p.r*2,p.r*2);
  }
  for (const cloud of S.clouds || []) {
    if (cloud.kind === 'fire') {
      layer.put('skill',7,cloud.x,cloud.z,cloud.r*2,cloud.r*2);
      continue;
    }
    const drift = S.elapsed * .48 + cloud.x * .71 + cloud.z * .37;
    const fade = clamp(cloud.t / .45, 0, 1);
    for (let i = 0; i < 6; i++) {
      const angle = drift + i * Math.PI * 2 / 5;
      const offset = i === 5 ? 0 : cloud.r * .48;
      const size = cloud.r * (1.02 + .16 * Math.sin(drift * 2 + i)) * fade;
      layer.put('mist',0,cloud.x + Math.cos(angle)*offset,cloud.z + Math.sin(angle)*offset,
        size*1.14,size,angle,.1 + .12*(1 + Math.sin(angle*2)));
    }
  }
  layer.end();
}
function drawTerrain(ctx,r,hs,t) {
  if(!S?.terrain)return;
  const T=S.terrain,C=TERRAIN_CFG;
  ctx.save();
  if(T.kind==='moon'){
    if (T.moon) {
      ctx.fillStyle = 'rgba(150,24,22,' + (0.10 + 0.03 * Math.sin((S.elapsed || 0) * 3)).toFixed(3) + ')';
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.font = '700 13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,140,120,0.85)';
      paintFrame(ctx,'terrain',8,r.width*.5,83,24,24);
      ctx.fillText('붉은 달 — 원귀가 빠르다 · 엽전 두 배 ' + Math.ceil(T.moonT) + '초', r.width * 0.5, 84);
    }
  } else if (T.kind === 'wall') {
    const left = Math.max(0, C.wall.every - (T.wallT || 0));
    ctx.font = '700 12px serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = left < 3 ? 'rgba(255,120,90,0.9)' : 'rgba(220,200,160,0.5)';
    ctx.fillText('성벽 포대 ' + Math.ceil(left) + '초', r.width - 14, 86);
  }
  /* 8장 종루: 2초만 원 밖을 드러낸다(§17 결정 8 — 짧은 순간만) */
  if (T.revealT > 0) {
    const k = clamp(T.revealT / C.bell.reveal, 0, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    (S.zombies || []).forEach(function (z) {
      if (!z.alive || z.isBoss || z.isClone || dist(z, S.hero) <= ringR()) return;
      const p = projectXZ(z.x, z.z, 1.0);
      if (p.x < -20 || p.y < -20 || p.x > r.width + 20 || p.y > r.height + 20) return;
      ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(232,192,74,' + (0.85 * k).toFixed(3) + ')'; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.font = '700 16px serif';
      ctx.fillStyle = 'rgba(255,236,190,' + (0.95 * k).toFixed(3) + ')'; ctx.fillText(SHAPE_MARK[spiritShape(z)] || '?', p.x, p.y + 1);
    });
  }
  ctx.restore();
}
function drawV31(ctx, r, hs, t) {
  if (!S) return;
  if (S.boss?.alive && !S.boss.hidden && S.boss.state !== 'clones') {
    const boss = S.boss;
    const maxHp = Math.max(1, boss.maxHp || 1);
    const curHp = Math.max(0, boss.hp || 0);
    if (boss.hpTrail == null || boss.hpTrail < curHp) boss.hpTrail = curHp;
    else boss.hpTrail = Math.max(curHp, boss.hpTrail - maxHp * 0.38 * frameDt);

    /* v0.54.2: 보스 약점 혼령의 실제 화면 상단 좌표(y - orbR)를 직접 읽어 HP 바·기세 마름모가
       혼령과 단 1px도 겹치지 않도록 정확히 34px 위(여백 확보)에 고정한다. */
    const ud = (boss.obj && boss.obj.userData) || {};
    const zh = ud.worldH || 5.8;
    const eye = (ud.bellLocal && ud.bellLocal.y) || zh * 0.55;
    const orbY = eye + Math.max(0.75, Math.min(1.5, zh * 0.16));
    const topP = projectXZ(boss.x, boss.z, orbY + 1.55);
    const bossMark = (lastMarkMetrics && lastMarkMetrics.marks || []).find(function (m) { return m.boss && m.onScreen; });
    const w = 108, h = 7;
    const cx = clamp(bossMark ? bossMark.x : topP.x, w * 0.5 + 14, r.width - w * 0.5 - 14);
    const anchorY = bossMark ? (bossMark.y - (bossMark.orbR || 22) - 34) : (topP.y - 34);
    const y = clamp(anchorY, 128, r.height - 140);
    const x = cx - w * 0.5;
    const openLeft = Math.max(0, (boss.openUntil || 0) - (S.elapsed || 0));
    const isOpen = openLeft > 0 || boss.state === 'groggy';
    const isSeal = boss.state === 'seal' || boss.state === 'sealing';

    ctx.save();
    /* 옻칠 먹 프레임 + 금박 외곽 */
    ctx.fillStyle = 'rgba(18,12,12,0.88)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.strokeStyle = isOpen ? 'rgba(255,224,118,0.96)' : 'rgba(180,146,88,0.68)';
    ctx.lineWidth = isOpen ? 1.8 : 1;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);

    /* 잔상 데미지 트레일 바 */
    ctx.fillStyle = 'rgba(255,224,152,0.85)';
    ctx.fillRect(x, y, w * clamp(boss.hpTrail / maxHp, 0, 1), h);
    /* 주홍 실제 HP 바 */
    ctx.fillStyle = isOpen ? '#ee5e3a' : '#c44034';
    ctx.fillRect(x, y, w * clamp(curHp / maxHp, 0, 1), h);

    /* 페이즈 전환 눈금 */
    const B = bossCfg();
    if (B.phase2) {
      ctx.fillStyle = 'rgba(20,14,12,0.85)';
      const marks = B.phase3 ? [1 / 3, 2 / 3] : [0.5];
      marks.forEach(function (mk) { ctx.fillRect(x + w * mk - 1, y, 2, h); });
    }

    /* 보스 이름 + 수치 (HP 바 바로 위, 작고 또렷하게) */
    ctx.font = '700 11px "InkSerif", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = 'rgba(16,11,10,0.94)'; ctx.lineWidth = 3.2;
    const label = S.stage.bossName + ' ' + Math.ceil(curHp) + '/' + maxHp;
    ctx.strokeText(label, cx, y - 4);
    ctx.fillStyle = '#f6ebd4';
    ctx.fillText(label, cx, y - 4);

    /* 기세(poise) 금빛 마름모 — HP 바 바로 아래 통합 */
    const P = bossPat();
    if (P && P.poise) {
      const pn = P.poise, left = boss.poise == null ? pn : boss.poise;
      const py = y + h + 9;
      for (let i = 0; i < pn; i++) {
        const px = cx + (i - (pn - 1) / 2) * 12;
        ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + 4, py); ctx.lineTo(px, py + 4); ctx.lineTo(px - 4, py); ctx.closePath();
        ctx.fillStyle = i < left ? 'rgba(242,202,86,0.96)' : 'rgba(54,46,40,0.68)';
        ctx.fill();
      }
    }

    /* 빈틈(×1.3) 또는 봉인 가능 뱃지 */
    if (isSeal) {
      ctx.font = '700 11px "InkSerif", serif';
      ctx.strokeText('★ 봉인 가능', cx, y + h + 23);
      ctx.fillStyle = '#ffe078';
      ctx.fillText('★ 봉인 가능', cx, y + h + 23);
    } else if (isOpen) {
      const ow = w * 0.88, ox = cx - ow * 0.5, oy = y + h + 16;
      const frac = boss.state === 'groggy' ? clamp(1 - (boss.stateT || 0) / Math.max(0.1, P.groggyT || 3), 0, 1) : clamp(openLeft / 2.0, 0, 1);
      ctx.fillStyle = 'rgba(24,18,10,0.85)';
      ctx.fillRect(ox, oy, ow, 4);
      ctx.fillStyle = '#ffd86b';
      ctx.fillRect(ox, oy, ow * frac, 4);
      ctx.font = '700 10.5px "InkSerif", serif';
      ctx.strokeText('빈틈 ×1.3', cx, oy + 13);
      ctx.fillStyle = '#ffe484';
      ctx.fillText('빈틈 ×1.3', cx, oy + 13);
    }
    ctx.restore();
  }
  const wpp = worldPerCss();
  S.zombies.forEach(function (z) {
    if (!z.alive || z.isBoss) return;
    const zh = (z.obj && z.obj.userData && z.obj.userData.worldH) || 2.4;
    const p = projectXZ(z.x, z.z, zh * 0.9);
    if (z.obj && !z.obj.visible) return;
    /* 갑옷을 두른 장정 */
    if (z.armored && (z.armor || 0) > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(186,196,206,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y + 8, Math.max(11, (z.r || 0.7) * wpp * 1.15), Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      ctx.restore();
    }
    /* 바뀐 순간 금빛 테두리(0.3초) */
    if (z.rimFlash > 0) {
      const k = clamp(z.rimFlash / (CFG.breakRimT || 0.3), 0, 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,214,110,' + (0.85 * k).toFixed(3) + ')';
      ctx.lineWidth = 2 + 2 * k;
      ctx.beginPath(); ctx.arc(p.x, p.y + 8, Math.max(14, (z.r || 0.6) * wpp * 1.4 + 6 * k), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    /* 돌덩이 금 */
    if (z.hasCracks && z.cracks > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(214,204,182,0.8)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < z.cracks; i++) {
        const a = -0.7 + i * 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * 5, p.y + 8);
        ctx.lineTo(p.x + Math.cos(a) * 15, p.y + 20);
        ctx.stroke();
      }
      ctx.restore();
    }
    /* 정예: 머리 위 봉인 순서 3개 — 지금 차례만 밝다 */
    if (z.eliteSeq && z.seq && z.seq.length) {
      const n = z.seq.length, gap = 23, w = n * gap;
      ctx.save();
      for (let i = 0; i < n; i++) {
        const cx = p.x - w / 2 + gap * (i + 0.5), cy = p.y - 26;
        const done = i < z.seqI, cur = i === z.seqI;
        ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.fillStyle = done ? 'rgba(255,214,110,0.18)' : 'rgba(8,7,9,0.74)';
        ctx.fill();
        ctx.strokeStyle = done ? 'rgba(255,214,110,0.5)' : (cur ? 'rgba(255,214,110,0.95)' : 'rgba(240,232,210,0.26)');
        ctx.lineWidth = cur ? 2.2 : 1.2;
        ctx.stroke();
        ctx.fillStyle = done ? 'rgba(255,214,110,0.5)' : (cur ? 'rgba(255,244,214,1)' : 'rgba(240,232,210,0.4)');
        ctx.font = '700 12px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        brushMark(ctx,z.seq[i],cx,cy,6);
        if (i < n - 1) {
          ctx.strokeStyle = 'rgba(240,232,210,0.22)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cx + 11, cy); ctx.lineTo(cx + gap - 11, cy); ctx.stroke();
        }
      }
      ctx.restore();
    }
  });
  for (const fx of S.skillStamps || []) {
    const age = S.elapsed - fx.start;
    if (age >= .4) continue;
    const p = projectXZ(fx.x, fx.z, 1);
    ctx.save(); ctx.globalAlpha = 1 - age / .4;
    const size = 36 + age * 48;
    if (fx.kind === 'reson' || fx.kind === 'echo') {
      const radius = 4 + age * (fx.kind === 'reson' ? 65 : 90);
      ctx.strokeStyle = fx.kind === 'reson' ? '#cfab70' : '#a9c7ba';
      ctx.lineWidth = 2.4 - age*4;
      for (let i=0;i<2;i++) {
        ctx.beginPath();
        ctx.ellipse(p.x,p.y,radius*(1-i*.25),radius*.46*(1-i*.25),-.18,i*.8,5.6+i*.8);
        ctx.stroke();
      }
    } else {
      paintSkill(ctx, fx.kind, p.x, p.y, size, size);
    }
    ctx.restore();
  }
  /* 회전 호신부: 궤도와 부적 */
  const w = wardInfo();
  if (w) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,110,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = i / 40 * Math.PI * 2;
      const p = projectXZ(S.hero.x + Math.cos(a) * w.r, S.hero.z + Math.sin(a) * w.r, 0.05);
      if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < w.n; i++) {
      const a = (S.wardSpin || 0) + i * Math.PI * 2 / w.n;
      const p = projectXZ(S.hero.x + Math.cos(a) * w.r, S.hero.z + Math.sin(a) * w.r, 0.6);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(.32 * Math.sin(a));
      paintSkill(ctx, 'ward', 0, 0, 32, 38);
      ctx.restore();
    }
  }
  /* 벼락부적 예고 원 */
  (S.bolts || []).forEach(function (b) {
    const c = projectXZ(b.x, b.z, 0.05);
    const rx = b.r * wpp, ry = rx * 0.58;
    if (b.done) {
      const age = b.t - b.delay;
      const pulse = age < .12 || (age > .17 && age < .28) ? 1 : .72;
      ctx.save();ctx.globalAlpha = clamp(1-(age-.32)/.26,0,1);
      // Reach the top of the playfield without scaling stroke width with height.
      const height = Math.max(1,c.y + 2);
      const width = clamp(height*.075,14,44);
      const seed = b.x*7.1 + b.z*13.3 + (age < .17 ? 0 : 2);
      ctx.translate(c.x,c.y);
      ctx.globalAlpha *= pulse;
      ctx.lineJoin='bevel';
      ctx.beginPath();
      ctx.moveTo(0,0);
      for (let i=1;i<=22;i++) {
        const u=i/22;
        const x=width*Math.min(1,u*5)*(.54*Math.sin(seed+i*.81)+.32*Math.sin(seed+i*2.4)+u*.45);
        const y=-height*u;
        ctx.lineTo(x,y);
        if (i%5===2) {
          const side=i%2 ? 1 : -1;
          ctx.moveTo(x+width*side*1.24,y+height*.13);
          ctx.lineTo(x+width*side*.72,y+height*.055);
          ctx.lineTo(x+width*side*.76,y+height*.074);
          ctx.lineTo(x,y);
        }
      }
      ctx.strokeStyle='rgba(230,165,65,.22)'; ctx.lineWidth=7; ctx.stroke();
      ctx.strokeStyle='#c48c43'; ctx.lineWidth=3.4; ctx.stroke();
      ctx.strokeStyle='#fff3cc'; ctx.lineWidth=1.45; ctx.stroke();
      ctx.beginPath();
      for (let i=0;i<7;i++) {
        const angle=(i+.35)*Math.PI/7;
        ctx.moveTo(0,0);
        ctx.lineTo(Math.cos(angle)*width*.65,-Math.sin(angle)*width*.35);
      }
      ctx.stroke();
      ctx.restore();return;
    }
    const u = clamp(b.t / Math.max(0.01, b.delay), 0, 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,110,' + (0.30 + 0.55 * u).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(8, rx * (0.55 + 0.45 * u)), Math.max(5, ry * (0.55 + 0.45 * u)), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });

}
// Dry vermilion strokes, angular frost, and dilute violet washes.
function drawElementMote(ctx, el, x, y, u, color) {
  ctx.globalAlpha = Math.sin(Math.PI * u);
  ctx.fillStyle = el === 'poison' ? '#bb92cc' : 'rgb(' + color.join(',') + ')';
  ctx.beginPath();
  if (el === 'poison') {
    ctx.globalAlpha *= .24;
    ctx.ellipse(x,y,4+u*3,2+u*2,-.25,0,Math.PI*2);
  } else if (el === 'fire') {
    ctx.moveTo(x-1.5,y+2); ctx.quadraticCurveTo(x-2,y,x+2+u*2,y-6);
    ctx.quadraticCurveTo(x+2,y+1,x-1.5,y+2);
  } else {
    ctx.moveTo(x,y-3); ctx.lineTo(x+1.6,y); ctx.lineTo(x,y+3); ctx.lineTo(x-1.6,y);
  }
  ctx.fill();
}
/* v0.54: 주인공·심안 경계의 인위적 2D 원형 테두리 선을 제거해 한지 수묵화 몰입감을 높인다.
   (원 안/밖 대비는 3D 월드 먹안개가 자연스럽게 담당한다.) */
function drawHeroBeaconAndSightRing() {}
function drawHeroElement(ctx, t) {
  const el = curElem();
  if (!el || !S.hero) return;
  const c = FX_COLORS[el] || FX_COLORS.jade;
  const R = 0.9;
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const u = ((t * 0.8 + i / 6) % 1), a = i * 1.05 + t * 0.5;
    const p = projectXZ(S.hero.x + Math.cos(a) * R * 0.8, S.hero.z + Math.sin(a) * R * 0.8, 0.1 + u * 1.6);
    drawElementMote(ctx,el,p.x,p.y,u,c);
  }
  ctx.restore();
  if (S.tempElem && S.tempElem.t > 0) {
    const f = clamp(S.tempElem.t / (CFG.tempElemDur || 12), 0, 1);
    drawFootGauge(ctx, f, 'rgb(' + c.join(',') + ')', 38, 7);
  }
}
function drawFootGauge(ctx, fraction, color, width, offset, windowStart) {
  const foot = projectXZ(S.hero.x, S.hero.z, 0);
  const x = Math.round(foot.x - width / 2), y = Math.round(foot.y + offset);
  ctx.save();
  ctx.fillStyle = 'rgba(23,19,18,.88)';
  ctx.fillRect(x-1,y-1,width+2,7);
  if (windowStart != null) {
    ctx.fillStyle = '#aa8744';
    ctx.fillRect(x+width*windowStart,y,width*(1-windowStart),5);
  }
  ctx.fillStyle = color;
  ctx.fillRect(x,y+1,width*fraction,3);
  ctx.restore();
}
function drawEnemyBars(ctx) {
  const R = ringR();
  const t = S.elapsed || 0;
  /* Status motes for kinds without their own status art (brute, stone, elites): flames, frost glints, bubbles. */
  S.zombies.forEach(function (z) {
    if (!z.alive || z.obj?.visible === false || ((z.isBoss || z.type === 'imp') && !(z.frozen > 0))) return;
    const el = z.frozen > 0 ? 'ice' : z.burn > 0 ? 'fire' : z.poison > 0 ? 'poison' : null;
    if (!el || dist(z, S.hero) > R) return;
    const c = FX_COLORS[el], zh = (z.obj && z.obj.userData && z.obj.userData.worldH) || 2.4;
    if (el === 'ice') {
      const foot = projectXZ(z.x,z.z,0);
      const head = projectXZ(z.x,z.z,zh);
      const span = clamp(Math.abs(foot.y-head.y)*.32,8,32);
      ctx.save();
      ctx.translate(foot.x,foot.y);
      ctx.scale(span,span);
      ctx.beginPath();
      for (const side of [-1,1]) {
        ctx.moveTo(side*.42,0); ctx.lineTo(side*.96,-.66);
        ctx.lineTo(side*.83,-.21); ctx.lineTo(side*1.14,-.32);
        ctx.lineTo(side*.76,.04); ctx.closePath();
      }
      ctx.fillStyle='#a8e6ec'; ctx.strokeStyle='#35566d'; ctx.lineWidth=.095;
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const u = ((t * (el === 'ice' ? 0.4 : 0.9) + i / 5 + z.id * 0.17) % 1);
      const p = projectXZ(z.x + Math.cos(i * 2.1) * (z.r || 0.6) * 0.8, z.z + Math.sin(i * 2.1) * (z.r || 0.6) * 0.8, zh * (0.15 + 0.5 * u));
      drawElementMote(ctx,el,p.x,p.y,u,c);
    }
    ctx.restore();
  });
  S.zombies.forEach(function (z) {
    if (!z.alive || z.isBoss || !(z.maxHp > 0) || z.hp >= z.maxHp - 0.01) return;
    if (dist(z, S.hero) > R) return;
    const zh = (z.obj && z.obj.userData && z.obj.userData.worldH) || 2.4;
    const p = projectXZ(z.x, z.z, zh * 0.78);
    const w = 26, h = 4, f = clamp(z.hp / z.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(8,7,9,0.8)'; ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(214,48,34,0.95)'; ctx.fillRect(p.x - w / 2, p.y, w * f, h);
    ctx.restore();
  });
}



function secondScore(rec) {
  if (!rec || !rec.scores) return 0;
  const vals = Object.keys(rec.scores).map(function (k) { return rec.scores[k] || 0; }).sort(function (a, b) { return b - a; });
  return +(vals[1] || 0).toFixed(2);
}
function failHint() {
  if (!S) return 'ㅣ — V 중에 그려 보세요';
  if (S.practiceShape && (S.practiceT > 0 || S.practiceSpawns > 0) && SHAPE_HINT[S.practiceShape]) {
    return SHAPE_HINT[S.practiceShape];
  }
  const counts = {};
  livingMarks().forEach(function (s) {
    const k = spiritShape(s);
    counts[k] = (counts[k] || 0) + 1;
  });
  let best = null, n = 0;
  Object.keys(counts).forEach(function (k) { if (counts[k] > n) { n = counts[k]; best = k; } });
  if (best && SHAPE_HINT[best]) return SHAPE_HINT[best];
  const pool = S.pool || [];
  if (pool.length === 1 && SHAPE_HINT[pool[0]]) return SHAPE_HINT[pool[0]];
  if (pool.length === 2) {
    return (SHAPE_HINT[pool[0]] || '') + (SHAPE_HINT[pool[1]] ? ' ' + SHAPE_HINT[pool[1]] : '');
  }
  return pool.map(function (s) { return SHAPE_HINT[s] || SHAPE_MARK[s] || s; }).filter(Boolean).join(' ');
}
function showJudge(text) {
  const el = $('judgeFlash');
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}
let _audio = null;
/* A spirit announces itself with one bell from its side of the screen; the pitch tells the shape. */
function stampSkill(kind, x, z) {
  const live = (S.skillStamps || []).filter(fx => S.elapsed - fx.start < .4);
  live.push({kind, x, z, start: S.elapsed});
  S.skillStamps = live;
}
function ringSpiritBell(sp) {
  if (!sp) return;
  /* v0.31 §5.3 방울 공명: 혼령이 붙는 순간 그 원귀에게 피해(보스제외). */
  const rs = upLv('reson');
  if (rs && sp.target && sp.target.alive && !sp.target.isTotem && !sp.target.isClone && !sp.target.isPillar) {
    const d = (CFG.resonCard.dmg || [0.5, 0.8, 1.1])[Math.min(2, rs - 1)];
    stampSkill('reson', sp.target.x, sp.target.z);
    hurtZombie(sp.target, d, 'reson', S && S.lastDash);
  }
  if (!audio) return;
  audio.setQuiet(qa.mute, qa.noDelay);
  const w = viewBox().width;
  const scr = screenOf(sp);
  const pan = Math.max(-1, Math.min(1, (scr.x / Math.max(1, w)) * 2 - 1));
  const darkBell = !!(S && S.goal && S.goal.id === 'dark' && goalWindowOn());
  audio.bell(pan, spiritShape(sp), (relicOn(save, 'oldbell') ? 1.5 : 1) * (darkBell ? 2 : 1));
  S.bellPans = [{ id: sp.id, pan: pan, x: sp.x, z: sp.z, shape: spiritShape(sp) }];
  if (audio.setLastPans) audio.setLastPans(S.bellPans);
}
function triggerComboBurst(n) {
  if (!S) return;
  S.lastBurst = n;
  S.bursts.push(n);
  S.shake = 0.5;
  const idx = Math.max(0, (CFG.comboBurstAt || [4, 8, 12]).indexOf(n));
  const R = (CFG.comboBurstR || [3.2, 4.2, 5.2])[idx] || 3.5;
  const mul = (CFG.comboBurstDmg || [1, 1.5, 2])[idx] || 1;
  const dmg = ((S.dashDmg || CFG.dashDmg) * mul);
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
    if (dist(z, S.hero) <= R + z.r) hurtZombie(z, dmg, 'combo-burst', S.lastDash);
  });
  const app = $('app');
  if (app) {
    app.classList.add('combo-burst');
    const hold = qa.noDelay ? 0 : (CFG.comboBurstMs || 220);
    S.comboBurstT = hold / 1000;
    setTimeout(function () {
      S.comboBurstT = 0;
      app.classList.remove('combo-burst');
    }, hold);
  }
  showJudge(n + '콤보!');
  if (audio) audio.explode();
  if (three && three.bloom && three.bloom.setStrength && fxQ !== 'off') {
    /* 콤보 버스트 순간에는 프리셋보다 조금 더 밝게 번쩍였다가 돌아온다(임계값 1.15 는 그대로). */
    const prev = three.bloom.quality === 'low' ? 0.7 : 0.85;
    three.bloom.setStrength(1.45);
    setTimeout(function () { if (three.bloom) three.bloom.setStrength(prev); }, qa.noDelay ? 0 : 300);
  }
  if (art && art.playFx && three) {
    const fx = art.playFx(three.scene, 'ink-splat', S.hero.x, S.hero.z, 1.6);
    if (fx) {
      fx.life = Math.min(fx.life || 0.3, 0.28);
      fx.max = Math.min(fx.max || 0.3, 0.28);
      three.fx.push(fx);
    }
  }
}
/* Combo: a dash that cuts something within comboTimeout of the last one adds 1.
   v0.31 §3.3: 빗나간 일섬은 콤보를 0이 아니라 절반으로 내린다(연속 두 번 빗나가면 0).
   단계 보상: 10 참+10 · 15 다음 일섬 폭 ×1.5 · 20 혼백+3·엽전+5 · 30부터 10마다 참+10. */
const COMBO_CUT_WHY = { slash: 1, break: 1, crack: 1, 'crack-same': 1, 'seal-break': 1, echo: 1, counter: 1, reson: 1 };
function cutRec(rec) {
  if (!rec) return false;
  if (rec.bossCut) return true;
  return (rec.hits || []).some(function (h) { return COMBO_CUT_WHY[h.why]; });
}
function dropCombo(n) {
  if (!S) return;
  S.comboDrop = n || 'half';
  S.comboFlash = 0.5;
  if ($('comboLabel')) $('comboLabel').classList.remove('tier');
}
function comboBreak() {
  if (!S) return;
  const c = S.combo || 0;
  if (!c) return;
  S.comboBreakN = (S.comboBreakN || 0) + 1;
  S.combo = S.comboBreakN >= 2 ? 0 : Math.floor(c / 2);
  S.comboIdle = 0;
  dropCombo(S.comboBreakN >= 2 ? 'zero' : 'half');
  if (S.comboBreakN >= 2) S.comboBreakN = 0;
}
function comboReward(n) {
  if (!S) return null;
  const T = CFG.comboTiers || {};
  const tier = T[n] || (n > 30 && (n - 30) % 10 === 0 ? T[30] : null);
  if (!tier) return null;
  const bits = [];
  if (tier.charge) { addCharge(tier.charge); bits.push('참 +' + tier.charge); }
  if (tier.wide) { S.pathWideN = 1; bits.push('다음 일섬 폭 ×' + tier.wide); }
  if (tier.xp) { gainXp(tier.xp); bits.push('혼백 +' + tier.xp); }
  if (tier.coin) { save.coins += tier.coin; persist(); bits.push('엽전 +' + tier.coin); }
  S.comboTierN = (S.comboTierN || 0) + 1;
  if ($('comboLabel')) $('comboLabel').classList.add('tier');
  S.comboFlash = 0.6;
  S.goldEdge = Math.max(S.goldEdge || 0, 0.2);
  if (audio) { if (audio.bell) audio.bell(0, 'bolt'); if (audio.parry) audio.parry(); }
  inkFx.ring(3.2, FX_COLORS.gold, 0.5);
  showJudge(n + '콤보 · ' + bits.join(' · '));
  telemetry.event('combo_tier', { n: n, stage: S.stageNo, reward: bits.slice() });
  return bits;
}
function scoreDash(rec) {
  if (!S || !rec || rec.scored) return;
  rec.scored = true;
  if (!rec.targets || !rec.targets.length) return;
  /* A boss cut counts too, or the combo would sit at 0 for the whole boss fight. */
  const cut = cutRec(rec);
  if (!cut) { comboBreak(); return; }
  S.combo = (S.combo || 0) + 1;
  S.comboIdle = 0;
  S.comboBreakN = 0;
  if (S.combo > (S.comboMax || 0)) S.comboMax = S.combo;
  if ((CFG.comboBurstAt || [4, 8, 12]).indexOf(S.combo) >= 0) triggerComboBurst(S.combo);
  comboReward(S.combo);
  /* §9.2 화살검: 콤보 12마다 불꽃이 터져 주변을 태운다. */
  const hwa = swordFx(save).comboFire;
  if (hwa && S.combo % hwa === 0 && S._hwaAt !== S.combo) {
    S._hwaAt = S.combo;
    (S.zombies || []).forEach(function (z) {
      if (!z.alive || z.isBoss || z.isClone) return;
      if (dist(z, S.hero) > 3.2) return;
      applyBurn(z, S.lastDash);
    });
    inkFx.ring(3.2, FX_COLORS.fire || FX_COLORS.red, 0.5);
    showJudge('화살검 — 불꽃');
    telemetry.event('sword', { id: 'hwa', combo: S.combo });
  }
}

function triggerSightWave() {
  if (!S) return;
  S.sightWave = 1;
  const app = $('app');
  if (app) {
    app.classList.remove('sight-wave');
    void app.offsetWidth;
    app.classList.add('sight-wave');
    setTimeout(function () { app.classList.remove('sight-wave'); }, qa.noDelay ? 0 : 700);
  }
}
function dashDirOf(tgt, from) {
  from = from || (S && S.hero) || { x: 0, z: 0 };
  if (!tgt) return { x: 0, z: 1 };
  if (tgt.kind === 'spirit' || (tgt.angle != null && tgt.kind !== 'zombie')) {
    if (tgt.target && tgt.target.alive) {
      const dx = tgt.target.x - from.x, dz = tgt.target.z - from.z, L = Math.hypot(dx, dz) || 1;
      return { x: dx / L, z: dz / L };
    }
    const dx = (tgt.x != null ? tgt.x : from.x) - from.x;
    const dz = (tgt.z != null ? tgt.z : from.z) - from.z;
    const L = Math.hypot(dx, dz);
    if (L > 0.05) return { x: dx / L, z: dz / L };
    return { x: 0, z: 1 };
  }
  const dx = tgt.x - from.x, dz = tgt.z - from.z, L = Math.hypot(dx, dz) || 1;
  return { x: dx / L, z: dz / L };
}
function safeLand(from, to) {
  let x = to.x, z = to.z;
  const clipped = clipBound({ x: x, z: z });
  x = clipped.x; z = clipped.z;
  const dx = x - from.x, dz = z - from.z, L = Math.hypot(dx, dz) || 1;
  function blocked(px, pz) {
    const c = clipBound({ x: px, z: pz });
    if (Math.hypot(c.x - px, c.z - pz) > 0.01) return true;
    let hit = false;
    (S.zombies || []).forEach(function (q) {
      if (!q.alive) return;
      if (Math.hypot(px - q.x, pz - q.z) < (q.r || 0.55) + 0.5) hit = true;
    });
    return hit;
  }
  if (!blocked(x, z)) return { x: x, z: z };
  const minU = 0.45;
  for (let u = 0.92; u >= minU; u -= 0.04) {
    const px = from.x + dx * u, pz = from.z + dz * u;
    if (!blocked(px, pz)) return { x: px, z: pz };
  }
  return { x: from.x + dx / L * Math.max(1, L * minU), z: from.z + dz / L * Math.max(1, L * minU) };
}
/* v0.22: 맵은 끝없이 이어진다. 보스 결계가 서 있을 때만 아레나 원 안으로 묶는다. */
function clampPointToArena(x, z, pad) {
  if (!arenaActive()) return { x: x, z: z };
  const A = S.arena, R = Math.max(2, arenaR() - (pad || 0));
  const dx = x - A.x, dz = z - A.z, ro = Math.hypot(dx, dz);
  if (ro <= R) return { x: x, z: z };
  return { x: A.x + dx * R / ro, z: A.z + dz * R / ro };
}
/* v0.48 고정 아레나: 무대 자체의 플레이 반경(three.chunks.bounds) — 영웅과 귀물이 이 밖으로 나가지 않는다.
   보스 결계(arenaActive)는 그 안에서 한 번 더 좁힌다. */
function worldBounds() {
  const b = three && three.chunks && three.chunks.bounds;
  return (b && b.r > 0) ? b : null;
}
function clipWorld(p, pad) {
  const b = worldBounds();
  if (!b) return { x: p.x, z: p.z };
  const R = Math.max(2, b.r - (pad == null ? 0.55 : pad));
  const dx = p.x - b.x, dz = p.z - b.z, ro = Math.hypot(dx, dz);
  if (ro <= R) return { x: p.x, z: p.z };
  return { x: b.x + dx * R / ro, z: b.z + dz * R / ro };
}
function clipBound(p) {
  const w = clipWorld(p);
  if (!arenaActive()) return w;
  const A = S.arena, R = arenaR() - (CFG.arenaEdge || 0.6);
  const dx = w.x - A.x, dz = w.z - A.z;
  const ro = Math.hypot(dx, dz);
  if (ro <= R) return w;
  return { x: A.x + dx * R / ro, z: A.z + dz * R / ro };
}
/* 넉백·반동으로도 결계 밖으로 밀리지 않게 영웅을 다시 안으로 넣는다. */
function clampHeroToArena() {
  if (!S || !S.hero) return false;
  /* 돌진 중에는 from→to 보간을 건드리지 않는다(목표점은 시작할 때 이미 경계 안으로 잘렸다). */
  if (S.dash) return false;
  const c = clipBound(S.hero);
  if (Math.abs(c.x - S.hero.x) < 1e-6 && Math.abs(c.z - S.hero.z) < 1e-6) return false;
  S.hero.x = c.x; S.hero.z = c.z;
  if (three && three.heroSpr) placeGroup(three.heroSpr, S.hero.x, S.hero.z);
  return true;
}
function dashEndPoint(from, tgt) {
  const dir = dashDirOf(tgt, from);
  const R = ringR();
  let len = R * (CFG.dashThroughMul || 1.5) * (swordFx(save).dashLen || 1);
  const lock = tgt && (tgt.target && tgt.target.alive ? tgt.target : (tgt.kind === 'zombie' ? tgt : null));
  /* Land clear of the target: bigger bodies need a longer run-out. */
  if (lock) {
    const past = (CFG.dashPastTarget || 0.8) + (lock.r || 0) * (CFG.dashPastBodyMul || 1.5);
    len = Math.max(len, dist(from, lock) + past);
    /* 상대를 베고 너무 멀리 달려나가지 않는다 — 다음 혼령이 사거리 안에 남도록. */
    len = Math.min(len, dist(from, lock) + past + (CFG.dashPastExtra || 2.0));
  }
  const raw = clipBound({ x: from.x + dir.x * len, z: from.z + dir.z * len });
  const land = safeLand(from, raw);
  return { x: land.x, z: land.z, raw: raw };
}
/* v0.49.2 2칸 FIFO 선입력 버퍼: 연타 시 앞선 예약을 덮어쓰지 않고 순서대로 이어 붙인다. */
function enqueueInputBuf(entry) {
  if (!S) return { queued: false, size: 0, overwritten: false };
  if (!S.inputQueue) S.inputQueue = createInputQueue({ maxSize: 2 });
  const tNow = (entry && entry.t0 != null) ? entry.t0 : now();
  const res = S.inputQueue.push(entry, tNow);
  S.inputBuf = S.inputQueue.peek();
  /* 후속 획이 대기 중이면 남은 히트스톱을 45ms로 정리해 연속 일섬 반응성을 끌어올린다. */
  if (res.queued && S.hitstop > 0.045) S.hitstop = 0.045;
  return res;
}
/* 선입력 버퍼 소비: 착지 0프레임에 예약된 획을 이어 붙인다. */
function consumeInputBuf() {
  if (!S) return false;
  let b = null;
  if (S.inputQueue) {
    b = S.inputQueue.shiftValid(now());
    S.inputBuf = S.inputQueue.peek();
  } else if (S.inputBuf) {
    b = S.inputBuf;
    S.inputBuf = null;
    if (now() - b.t0 > (b.ttl || 450) + 350) b = null;
  }
  if (!b) return false;
  if (!S.playing || S.paused) return false;
  if (b.type === 'circle') return false;
  S.comboGrace = Math.max(S.comboGrace || 0, 0.12);
  beginDash(b.type, { dir: b.dir, quality: b.quality, tInput: b.t0, chained: true });
  return true;
}
function beginDash(shape, opts) {
  opts = opts || {};
  if (!S || !S.playing || S.paused || S.dash) return null;
  /* §6.1 뿌리: 착지 직후 0.4초는 몸이 묶인다 — 획은 예약으로 남는다. */
  if (terrainDashingBlocked()) {
    showJudge('뿌리에 묶였다');
    enqueueInputBuf({ type: shape, dir: (('dir' in opts) ? opts.dir : (S.lastStrokeDir || null)), t0: opts.tInput || now(), ttl: 550, quality: opts.quality });
    return { type: shape, targets: [], hits: [], items: [], bound: true };
  }
  const n = S.dashCount;
  const dir = ('dir' in opts) ? opts.dir : (S.lastStrokeDir || null);
  const targets = pickSpirits(shape, n, S.hero, dir, null);
  if (!targets.length) {
    const nearby = nearestTo(livingMarks().filter(mark => isOnScreen(mark, 20)), S.hero);
    const hint = nearby && SHAPE_MARK[spiritShape(nearby)];
    toast(hint ? '가까운 혼령의 무늬: ' + hint : '혼령이 보이면 종의 무늬를 그리세요');
    return { type: shape, targets: [], hits: [], items: [] };
  }
  S.dashQuality = (opts.quality != null) ? opts.quality : 0;
  /* §5.4 두 원소 교대: 일섬마다 실리는 원소를 바꾼다. */
  if ((S.elemSlots || []).length >= 2) S.elemIdx = ((S.elemIdx || 0) + 1) % 2;
  const tStart = now();
  const rec = {
    type: shape, targets: targets.map(function (t) { return t.id; }), hits: [], items: [],
    t0: tStart, tInput: opts.tInput || tStart, chained: !!opts.chained, hitstopMs: 0,
    segs: [], elem: curElem(), cinematic: false, quality: S.dashQuality
  };
  S.dashSeq = (S.dashSeq || 0) + 1;
  S.lastDash = rec;
  S.dashQueue = targets.slice();
  /* Only the first cut of a one-bell spell is the slow cinematic; later cuts run at full speed. */
  if (S.bellT > 0 && S.bellShape === shape && targets.length && !S.bellCine) { S.bellCine = true; triggerCinematic(); }
  startSeg();
  return rec;
}
// The first cut teaches the shape; the next asks which side to land on.
function openMarketFork() {
  if (S.stageNo !== 1 || S.sandbox || S.marketForkSeen || S.boss || !S.lastDash?.hits.length) return;
  S.marketForkSeen = true;
  const origin = S.hero;
  const reach = ringR() * 0.68 * Math.SQRT1_2;
  const point = k => clampPointToArena(origin.x + k * reach, origin.z - k * reach, 1.2);
  const foe = (k, type) => spawnZombie({ ...point(k), type });
  foe(0.48, 'imp');
  const guard = foe(1, 'brute');
  const escape = foe(-1, 'imp');
  livingMarks().forEach(destroySpirit);
  S.spiritCap = Math.max(2, S.spiritCap);
  for (const target of [guard, escape]) {
    if (target) spawnSpirit({ x: target.x, z: target.z, target });
  }
  showGuide('왼쪽 획은 포위 밖으로 · 오른쪽 획은 장정 쪽으로', 4);
}
function startSeg() {
  if (!S.dashQueue.length) {
    S.dash = null; scoreDash(S.lastDash);
    openMarketFork();
    consumeInputBuf();
    maybeEnd(); return;
  }
  const tgt = S.dashQueue.shift();
  if (!tgt.alive) { startSeg(); return; }
  const from = { x: S.hero.x, z: S.hero.z };
  const end = dashEndPoint(from, tgt);
  const to0 = { x: end.x, z: end.z };
  let raw = end.raw ? { x: end.raw.x, z: end.raw.z } : to0;
  /* §6.1 지형: 대숲(느려짐·피해) · 물길(길이 −30%) · 종 · 혈석 */
  const tadj = onDashPath(from, raw);
  let to = { x: to0.x, z: to0.z };
  const rl = Math.hypot(raw.x - from.x, raw.z - from.z) || 1;
  const tl = Math.hypot(tadj.to.x - from.x, tadj.to.z - from.z);
  if (tl < rl - 1e-4) {
    /* 물길: 경로와 착지점을 같은 비율로 줄인다. */
    const u = clamp(tl / rl, 0, 1);
    raw = { x: from.x + (raw.x - from.x) * u, z: from.z + (raw.z - from.z) * u };
    to = { x: from.x + (to0.x - from.x) * u, z: from.z + (to0.z - from.z) * u };
  }
  const slash = makeSlash(from, raw);
  /* v0.50: 일섬 연타 가속 — 선입력/연속 궤적 체인 시 0.19초로 경쾌하게 이어진다 */
  const baseDashDur = (S.lastDash && S.lastDash.chained) ? Math.min(CFG.dashDur || 0.24, 0.19) : (CFG.dashDur || 0.24);
  S.dash = { from: from, to: to, raw: raw, t: 0, dur: baseDashDur + (tadj.dur || 0), target: tgt, slash: slash, judged: false, dmgMul: tadj.dmgMul || 1 };
  S.iframe = Math.max(S.iframe || 0, baseDashDur + 0.06);
  S.shake = 0.28;
  S.lastDash.segs.push({ from: from, to: raw, r: pathR() });
  S.lastDash.dmgMul = tadj.dmgMul || 1;
  S.lastDash.vfxAt = S.lastDash.vfxAt || now();
  afterimages(from, to);
  /* §3.1 + v0.50: 칼날 소리는 획 길이와 콤보 단계에 따라 날카롭고 풍성하게 오른다. */
  if (audio) audio.slash(S.strokeLenRatio == null ? 0.55 : S.strokeLenRatio, S.combo || 0);
  triggerSightWave();
}
function resolveDash(d) {
  if (!d || d.judged) return;
  d.judged = true;
  const hitTo = d.raw || d.to;
  applyPath(d.from, hitTo, S.lastDash, null);
  /* §5.3 메아리 칼: 이 일섬의 경로를 0.5초 뒤 한 번 더 지나간다. */
  queueEcho(S.lastDash);
  /* §3.3 15콤보 폭 보상은 한 번만 — 이 일섬이 그 혜택을 썼다. */
  if (S.pathWideN > 0) S.pathWideN = Math.max(0, S.pathWideN - 1);
  const boss = S && S.boss;
  /* Only a dash aimed at the boss (its spirit, so its current shape) advances the order; grazing it on the way to another spirit does not. */
  const aimed = d.target && (d.target === boss || d.target.target === boss);
  const fake = d.target && d.target.target;
  if (fake && fake.isClone && fake.alive) popClone(fake, true);
  if (boss && boss.alive && aimed && segDist(boss.x, boss.z, d.from.x, d.from.z, hitTo.x, hitTo.z) <= pathR() + boss.r) {
    cutBoss(boss);
    if (S.lastDash) S.lastDash.bossCut = true;
  }
}
function landDash(d) {
  S.iframe = Math.max(S.iframe || 0, CFG.landIframe || 0.25);
  landingShock(d.to);
  const dx = d.to.x - d.from.x, dz = d.to.z - d.from.z, L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L;
  S.recoil = { x: ux, z: uz, t: CFG.recoilT || 0.12, dur: CFG.recoilT || 0.12, amp: CFG.recoilU || 0.12 };
  S.shake = Math.max(S.shake || 0, 0.22);
  const back = CFG.landBounce || 0.28;
  S.bounce = {
    from: { x: d.to.x, z: d.to.z },
    to: { x: d.to.x - ux * back, z: d.to.z - uz * back },
    t: 0, dur: CFG.landBounceT || 0.16
  };
  S.landRipple = { x: d.to.x, z: d.to.z, t: 1, dur: CFG.landRippleDur || 0.45 };
  S.sightWave = 1;
  triggerSightWave();
  /* §5.3 먹 발자국: 착지 자리에 먹 웅덩이 */
  dropInkStep(d.to);
  if (three && three.ink && three.ink.hit) {
    three.ink.hit(d.to.x, d.to.z, ux, uz);
    fxinkStat.hits++;
  }
  /* §6.1 착지 지형: 잔해(비틀) · 눈밭(미끄러짐) · 뿌리(묶임 + 충격 2배) */
  onLand(d.to, d);
  /* v0.49.2 P0 계측: 단타·연타·다수 처치별 입력→돌진→착지 지연 기록 */
  if (S && S.dashLatency && S.lastDash && !(S.dashQueue && S.dashQueue.length)) {
    const rec = S.lastDash;
    const entry = S.dashLatency.record({
      shape: rec.type,
      chained: !!rec.chained,
      hits: (rec.hits && rec.hits.length) || 0,
      tInput: rec.tInput || rec.t0,
      tStart: rec.t0,
      tLand: now(),
      hitstopMs: rec.hitstopMs || 0,
      frameDtMs: frameDt * 1000,
      tailCanceled: !!d.tailCanceled
    });
    telemetry.event('dash_latency', entry);
  }
}
function landingShock(at) {
  if (!S) return;
  const R = CFG.landShockR || 1.6, push = CFG.landPush || 1.2, stun = CFG.landStun || 0.3;
  magnetPull(at);
  if (three && three.chunks) three.chunks.jarsNear(at.x, at.z, R + 0.7).forEach(breakJar);
  if (S.evo && S.evo.frostNova) frostLanding(at);
  if (S.evo && S.evo.fireTrail) fireLanding(at);
  if (S.evo && S.evo.fireTrail) {
    /* 묵염(墨炎) 장판: 착지점 한 곳이 아니라 베고 지나온 자리에 불길이 남는다. */
    S.clouds = S.clouds || [];
    const seg = (S.lastDash && S.lastDash.segs && S.lastDash.segs[S.lastDash.segs.length - 1]) || null;
    const pts = seg ? [0.45, 0.8, 1.0].map(function (u) {
      return { x: seg.from.x + (seg.to.x - seg.from.x) * u, z: seg.from.z + (seg.to.z - seg.from.z) * u };
    }) : [{ x: at.x, z: at.z }];
    pts.forEach(function (p) {
      const fires = S.clouds.filter(function (c) { return c.kind === 'fire' && c.t > 0; });
      if (fires.length >= 12) return;
      if (fires.some(function (c) { return dist(c, p) < 0.9; })) return;
      S.clouds.push({ kind: 'fire', x: p.x, z: p.z, t: 4, tick: 0.55, r: 1.6 });
    });
  }
  S.zombies.forEach(function (z) {
    /* 보스는 착지 충격에 밀리지도 굳지도 않는다(몸이 커서 매번 걸리고, 경직이 걷기 시간을 멈춘다). */
    if (!z.alive || z.isBoss) return;
    const d = dist(z, at);
    if (d > R + (z.r || 0)) return;
    const k = d < 1e-3 ? 1 : 1;
    const ux = d < 1e-3 ? 1 : (z.x - at.x) / d;
    const uz = d < 1e-3 ? 0 : (z.z - at.z) / d;
    z.x += ux * push;
    z.z += uz * push;
    z.stun = Math.max(z.stun || 0, stun);
    if (z.obj) placeGroup(z.obj, z.x, z.z);
  });
  if (S.lastDash) S.lastDash.shock = { x: at.x, z: at.z, r: R, push: push };
}
/* 제자리 탭 → 칼집 패링: 반경 2.4m 넉백·경직·0.5 피해. 성공 시 parry 사운드 + 히트스톱. */
/* v0.31 §3.5: 지금 닿기 직전(W초 안)인 공격을 찾는다 — 돌진·투척 부적·자폭 점화·보스 돌진. */
function preciseTarget() {
  if (!S || !S.hero) return null;
  const W = CFG.preciseWin || 0.2;
  const hx = S.hero.x, hz = S.hero.z;
  let best = null, bestT = W + 1e-6;
  (S.zombies || []).forEach(function (z) {
    if (!z.alive || z.isBoss) return;
    const kd = CFG.zombieTypes[z.type] || {};
    if ((z.dashPhase || 0) > 0 && kd.dashSpeed) {
      const d = Math.max(0, Math.hypot(hx - z.x, hz - z.z) - (z.r || 0.5) - 0.55);
      const t = d / kd.dashSpeed;
      if (t <= W && t < bestT) { best = { kind: 'charger', z: z, t: t }; bestT = t; }
    }
    if (z.type === 'bomber' && (z.fuse || 0) > 0 && z.fuse <= W) {
      const d = Math.hypot(hx - z.x, hz - z.z);
      if (d <= (kd.blastR || 2.7) + 1.1 && z.fuse < bestT) { best = { kind: 'bomber', z: z, t: z.fuse }; bestT = z.fuse; }
    }
  });
  (S.shots || []).forEach(function (sh) {
    if (sh.reflect) return;
    const sp = Math.hypot(sh.vx || 0, sh.vz || 0) || 1;
    const d = Math.max(0, Math.hypot(hx - sh.x, hz - sh.z) - (CFG.shotR || 0.42) - 0.55);
    const t = d / sp;
    if (t <= W && t < bestT) { best = { kind: 'shot', sh: sh, t: t }; bestT = t; }
  });
  const b = S.boss;
  if (b && b.alive && b.state === 'charge' && !b.hidden) {
    const sp = bossTiming().chargeSp || 20;
    const d = Math.max(0, Math.hypot(hx - b.x, hz - b.z) - (b.r || 1.1) - 0.7);
    const t = d / sp;
    if (t <= W && t < bestT) { best = { kind: 'boss', z: b, t: t }; bestT = t; }
  }
  return best;
}
function preciseParry(prec, rec) {
  if (!S || !prec) return rec;
  const awaken = upLv('parry');
  const mul = CFG.preciseDmgMul || 2;
  const dmg = ((CFG.parryDmg || 0.5) + (CFG.parryAwakenDmg || 0.4) * awaken) * mul;
  S.parryCd = CFG.parryCd || 0.45;
  S.iframe = Math.max(S.iframe || 0, 0.45);
  S.parryFlash = 0.25;
  S.parryHits = [];
  S.shake = Math.max(S.shake || 0, 0.5);
  S.goldEdge = Math.max(S.goldEdge || 0, 0.2);
  addHitstop(0.08);
  addSlow(CFG.preciseSlow || 0.2, 0.35);
  addCharge(CFG.preciseCharge || 10);
  if (rec) rec.parry = { precise: prec.kind, t: +(prec.t || 0).toFixed(3), dmg: dmg };
  telemetry.event('parry', { target: prec.kind, errMs: Math.round((prec.t || 0) * 1000), result: 'precise' });
  if (audio && audio.parry) audio.parry();
  inkFx.ring(3.4, FX_COLORS.gold, 0.5);
  if (prec.kind === 'charger' && prec.z && prec.z.alive) {
    const z = prec.z;
    z.dashPhase = 0; z.windT = 0; z.dashCd = (CFG.zombieTypes.charger || {}).dashCd || 3.4;
    z.stun = Math.max(z.stun || 0, CFG.preciseStun || 0.6);
    const d = dist(z, S.hero) || 1;
    z.x += (z.x - S.hero.x) / d * 1.6; z.z += (z.z - S.hero.z) / d * 1.6;
    if (z.obj) placeGroup(z.obj, z.x, z.z);
    hurtZombie(z, dmg, 'parry', rec);
    if (rec && rec.hits) rec.hits.push({ id: z.id, dmg: dmg, hp: z.hp, why: 'parry' });
  } else if (prec.kind === 'shot' && prec.sh) {
    const sh = prec.sh;
    sh.reflect = true; sh.t = 0;
    if (!sh.gold) {
      const src = nearestTo((S.zombies || []).filter(z => z.alive && z.type === 'thrower'), sh);
      if (src) { sh.backTo = src; sh.vx = 0; sh.vz = 0; } else { sh.reflect = false; }
    }
    if (sh.mesh && sh.gold) sh.mesh.material = goldShotMaterial();
    inkFx.burst(sh.x, sh.z, FX_COLORS.gold, { r1: 30, n: 6, dur: 0.35 });
  } else if (prec.kind === 'bomber' && prec.z && prec.z.alive) {
    const z = prec.z;
    z.fuse = 0;
    z.stun = Math.max(z.stun || 0, CFG.preciseStun || 0.6);
    hurtZombie(z, dmg, 'parry', rec);
  } else if (prec.kind === 'boss' && prec.z && prec.z.alive) {
    const b = prec.z;
    b.openUntil=S.elapsed+1.8+(b.chilled ? .4 : 0); b.chilled=false;
    b.state = 'stun'; b.stateT = 0;
    b.pat = b.pat || null;
    bossPoise(b, 1);
  }
  /* §5.3 칼집 반격: 정확한 패링 성공 시 가장 가까운 혼령으로 자동 일섬 1회. */
  if (upLv('counter') > 0) sheathCounter();
  /* §5.4 귀검(歸劍): 정확한 패링이 보스에게도 1칸 절단. */
  if (S.evo && S.evo.gwigeom && prec.kind === 'boss' && S.boss && S.boss.alive) cutBoss(S.boss);
  showJudge('챙—!');
  triggerSightWave();
  return rec;
}
/* 칼집 반격: 가장 가까운 혼령의 무늬로 그 혼령을 바로 벤다. */
function sheathCounter() {
  if (!S || S.dash || (S.dashQueue && S.dashQueue.length)) return null;
  const ms = livingMarks().filter(function (s) { return s.target && s.target.alive; });
  if (!ms.length) return null;
  ms.sort(function (a, b) { return dist(a.target, S.hero) - dist(b.target, S.hero); });
  const s = ms[0];
  const shape = spiritShape(s);
  if (!shape) return null;
  S.comboGrace = Math.max(S.comboGrace || 0, 0.1);
  stampSkill('counter', S.hero.x, S.hero.z);
  showJudge('반격!');
  return beginDash(shape, { dir: null });
}
function doParry(rec) {
  if (!S || !S.playing || S.paused) return rec || null;
  /* §8.1 튜토리얼 3단계: 제자리 탭을 해 냈다(피해 없이 넉백만). */
  if (S.tutorial && S.tutorial.on && S.tutorial.tapSpawned) S.tutorial.tapDone = true;
  const r = rec || { type: 'tap', targets: [], hits: [] };
  r.type = 'tap';
  r.targets = r.targets || [];
  r.hits = r.hits || [];
  /* 기모으기 중의 탭은 게이지 판정이 먼저다(쿨다운과 무관). */
  const kt = kiaiTap();
  if (kt) { r.parry = kt; return r; }
  if ((S.parryCd || 0) > 0) { r.parry = { hits: 0, cooling: true }; return r; }
  /* v0.31 §3.5 정확한 패링: 적의 공격이 닿기 0.2초 안의 탭 — 피해 2배·참 +10·0.2초 느린 화면. */
  const prec = preciseTarget();
  if (prec) { preciseParry(prec, r); return r; }
  /* v0.23 칼집 각성: 패링이 충격파(반경·피해)와 참 게이지로 자란다. */
  const awaken = upLv('parry');
  const R = (CFG.parryR || 2.4) + (CFG.parryAwakenR || 0.45) * awaken;
  const hits = [];
  const refl = reflectGoldShots(R);
  if (refl) {
    S.goldReflectN = (S.goldReflectN || 0) + refl;
    tcount('goldReflect', refl);
    telemetry.event('reflect', { gold: refl, n: S.goldReflectN });
  }
  S.zombies.forEach(function (z) {
    if (!z.alive || z.isBoss || z.isClone || z.isPillar || z.isTotem) return;
    const d = dist(z, S.hero);
    if (d > R + (z.r || 0.55)) return;
    hits.push(z.id);
    hurtZombie(z, (CFG.parryDmg || 0.5) + (CFG.parryAwakenDmg || 0.4) * awaken, 'parry', r);
    if (z.alive) {
      const ux = d < 1e-3 ? 1 : (z.x - S.hero.x) / d;
      const uz = d < 1e-3 ? 0 : (z.z - S.hero.z) / d;
      const push = CFG.parryPush || 1.6;
      z.x += ux * push; z.z += uz * push;
      z.stun = Math.max(z.stun || 0, (CFG.parryStun || 0.35) + (CFG.parryAwakenStun || 0.12) * awaken);
      if (z.obj) placeGroup(z.obj, z.x, z.z);
    }
  });
  r.parry = { hits: hits.length, reflected: refl };
  telemetry.event('parry', { target: 'parry', hits: hits.length, reflected: refl, result: (hits.length || refl) ? 'hit' : 'miss' });
  if (hits.length || refl) {
    S.parryCd = CFG.parryCd || 0.45;
    S.iframe = Math.max(S.iframe || 0, CFG.parryIframe || 0.2);
    S.parryFlash = 0.12;
    S.parryHits = hits;
    S.shake = Math.max(S.shake || 0, 0.35);
    if (audio) audio.parry();
    addHitstop(CFG.parryHitstop || 0.05);
    if (awaken > 0) {
      addCharge((CFG.parryAwakenCharge || 14) * awaken);
      if (art && art.playFx && three) {
        const fx = art.playFx(three.scene, 'ink-splat', S.hero.x, S.hero.z, 2.4 + awaken * 0.5);
        if (fx) three.fx.push(fx);
      }
      S.shake = Math.max(S.shake || 0, 0.45);
    }
    showJudge(awaken > 0 ? '챙— 각성!' : '챙-');
    triggerSightWave();
  } else {
    S.parryCd = CFG.parryFailCd || 0.2;
    S.parryHits = [];
    if (audio && audio.whiff) audio.whiff();
    showJudge('휙');
  }
  return r;
}

/* O 한 붓 = 참(斬): 게이지 100에서 반경 12m 전멸급 배기. */
function castCleave(rec) {
  if (!S || !S.playing || S.paused) return rec || null;
  const max = CFG.cleaveCharge || 100;
  rec = rec || { type: 'circle', targets: [], hits: [] };
  rec.type = 'circle';
  rec.hits = rec.hits || [];
  rec.targets = rec.targets || [];
  if ((S.charge || 0) < max) {
    toast('참(斬)의 기운이 모자랍니다 — ' + Math.floor(S.charge || 0) + '/' + max);
    showJudge('기운 ' + Math.floor(S.charge || 0));
    rec.cleave = false;
    return rec;
  }
  S.charge = 0;
  S.cleaveCount = (S.cleaveCount || 0) + 1;
  S.cleaveFx = 0.6;
  const R = CFG.cleaveR || 12;
  const dmg = dashDmg() * (CFG.cleaveDmgMul || 3);
  const hitIds = [];
  const iceCleave = !!S.evo.iceCleave;
  S.zombies.slice().forEach(function (z) {
    if (!z.alive) return;
    if (dist(z, S.hero) > R + (z.r || 0.5)) return;
    hitIds.push(z.id);
    if (z.isBoss) { hurtZombie(z,dmg,'cleave',rec); return; }
    /* 참 피해는 항상 그대로 들어간다. 상태이상은 그 위에 얹히는 보너스다(예전에는 빙결·독 대상이
       4·3 피해로 '대체'되어 진화를 띄울수록 참이 약해졌다). */
    const wasFrozen = z.frozen > 0;
    const wasPoison = z.poison > 0;
    hurtZombie(z, dmg, 'cleave', rec);
    if (!z.alive) { if (wasPoison) spreadElement(z, 'poison', rec); return; }
    if (wasFrozen) shatterZombie(z, rec);
    else if (wasPoison) explodeZombie(z, rec);
    if (z.alive && iceCleave) { z.frozen = Math.max(z.frozen || 0, CFG.iceDur || 2.5); tintZombie(z); }
  });
  rec.cleaveHits = hitIds;
  rec.targets = hitIds;
  if (three && three.chunks) three.chunks.jarsNear(S.hero.x, S.hero.z, R).forEach(breakJar);
  S.shake = Math.max(S.shake || 0, 0.9);
  S.slowT = Math.max(S.slowT || 0, 0.35);
  addHitstop(0.12);
  if (audio) { audio.explode(); audio.bell(0, 'bolt'); }
  if (three && three.ink) three.ink.hit(S.hero.x + 0.5, S.hero.z, 0, 1);
  inkFx.ring(R, FX_COLORS.jade, 0.7);
  showJudge('참(斬)');
  renderHud();
  return rec;
}

/* 포위 웨이브: 8방향 균등 배치 + 안개 수축 + 북 3연타. */
function fireWave(w) {
  if (!S || !w) return;
  S.waveDone = S.waveDone || {};
  if (S.waveDone[w.t]) return;
  S.waveDone[w.t] = true;
  S.wavesFired = S.wavesFired || [];
  S.wavesFired.push(w.t);
  const R = ringR();
  const total = w.n || 10;
  const rr = w.r || [9, 10];
  const mix = w.mix || { imp: 1 };
  const sum = Object.keys(mix).reduce(function (a, k) { return a + mix[k]; }, 0) || 1;
  /* v0.34 §6.3 포위 웨이브 3종: 원형 · 반원 협공(한쪽이 빔) · 두 줄 행렬(일섬 관통 보상) */
  const FORMS = ['circle', 'pincer', 'rows'];
  const form = w.form || FORMS[((S.stageNo || 1) + (S.wavesFired.length)) % 3];
  S.waveForm = form;
  const a0 = Math.random() * Math.PI * 2;
  function pickType() {
    let roll = Math.random() * sum, type = 'imp';
    for (const k in mix) { roll -= mix[k]; if (roll <= 0) { type = k; break; } }
    return type;
  }
  for (let i = 0; i < total; i++) {
    let px = 0, pz = 0;
    if (form === 'rows') {
      /* 영웅을 향한 두 줄: 줄 간격 3.2m, 줄 안 간격 1.45m */
      const row = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2) - (total / 4 - 0.5);
      const rad = Math.max(rr[0], R * 1.15);
      px = S.hero.x + (Math.cos(a0) * -row * 1.6) + Math.cos(a0 + Math.PI / 2) * k * 1.45 + Math.cos(a0) * rad * 0.55;
      pz = S.hero.z + (Math.sin(a0) * -row * 1.6) + Math.sin(a0 + Math.PI / 2) * k * 1.45 + Math.sin(a0) * rad * 0.55;
    } else if (form === 'pincer') {
      /* 반원 협공: 한쪽 120°가 비어 있어 그쪽으로 빠져나갈 수 있다(보상) */
      const span = Math.PI * 1.35;
      const a = a0 + (i / Math.max(1, total - 1) - 0.5) * span;
      const rad = Math.max(rr[0], R * 1.05) + Math.random() * Math.max(0.5, rr[1] - rr[0]);
      px = S.hero.x + Math.cos(a) * rad; pz = S.hero.z + Math.sin(a) * rad;
    } else {
      const a = (i / total) * Math.PI * 2 + (Math.random() - 0.5) * 0.24;
      const rad = Math.max(rr[0], R * 1.05) + Math.random() * Math.max(0.5, rr[1] - rr[0]);
      px = S.hero.x + Math.cos(a) * rad; pz = S.hero.z + Math.sin(a) * rad;
    }
    const z = spawnZombie({ x: px, z: pz, type: pickType() });
    if (z) S.waveIds.push(z.id);
  }
  telemetry.event('wave', { stage: S.stageNo, form: form, n: total, t: w.t });
  if (w.elite) {
    const ang = Math.random() * Math.PI * 2;
    const z = spawnZombie({ x: S.hero.x + Math.cos(ang) * rr[1], z: S.hero.z + Math.sin(ang) * rr[1], type: 'elite' });
    if (z) { z.elite = true; S.waveIds.push(z.id); }
  }
  S.fogPulse = 1;
  S.shake = Math.max(S.shake || 0, 0.6);
  triggerSightWave();
  if (audio && !qa.noDelay) {
    audio.drum();
    setTimeout(function () { if (audio) audio.drum(); }, 140);
    setTimeout(function () { if (audio) audio.drum(); }, 280);
  }
  showJudge(form === 'pincer' ? '반원 협공!' : form === 'rows' ? '두 줄 행렬!' : '포위!');
}
/* 중간 엘리트: 보스 전에 금테 원귀 한 마리와 그 패거리가 몰려온다. */
function spawnEliteEvent() {
  if (!S) return 0;
  const R = Math.max(8, ringR() * 1.9);
  const ang = Math.random() * Math.PI * 2;
  const e = spawnZombie({ x: S.hero.x + Math.cos(ang) * R, z: S.hero.z + Math.sin(ang) * R, type: 'elite' });
  if (e) { e.elite = true; S.waveIds.push(e.id); }
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = ang + (i - (n - 1) / 2) * 0.3;
    const z = spawnZombie({ x: S.hero.x + Math.cos(a) * R * 1.08, z: S.hero.z + Math.sin(a) * R * 1.08, type: i % 3 === 2 ? 'brute' : 'imp' });
    if (z) S.waveIds.push(z.id);
  }
  S.shake = Math.max(S.shake || 0, 0.5);
  toast('정예 원귀가 부적 상자를 지고 옵니다');
  showJudge('정예 원귀');
  if (audio && !qa.noDelay) audio.drum();
  return 1;
}
/* 착지 자석: 반경 안의 바닥 아이템이 곡선으로 빨려온다. */
function magnetPull(at) {
  if (!S) return 0;
  const R = S.magnetR || CFG.magnetR || 2.2;
  let n = 0;
  S.items.forEach(function (it) {
    if (!it.alive) return;
    if (dist(it, at) > R) return;
    it.home = { from: { x: it.x, z: it.z }, t: 0, dur: CFG.magnetDur || 0.18 };
    n++;
  });
  if (n && audio && audio.pickup) audio.pickup(n);
  return n;
}

function applyPath(from, to, rec, skip) {
  const r = pathR();
  /* v0.23 정확한 획: 획의 인식 점수가 기준 이상이면 일섬 피해가 배로 든다. */
  const pLv = upLv('perfect');
  const quality = (rec && rec.quality != null) ? rec.quality : (S.dashQuality || 0);
  const thresh = (CFG.perfectThresh || 0.80) - (CFG.perfectThreshStep || 0.05) * Math.max(0, pLv - 1) - (relicOn(save, 'brush') ? 0.05 : 0);
  const perfect = pLv > 0 && quality >= thresh;
  const mul = perfect ? ((CFG.perfectDmgMul || 1.5) + (CFG.perfectStep || 0.15) * Math.max(0, pLv - 1)) : 1;
  const dmg = dashDmg() * mul * ((rec && rec.dmgMul) || 1);
  if (perfect && rec) { rec.perfect = true; showJudge('정확한 획'); }
  const dx = to.x - from.x, dz = to.z - from.z, L2 = dx * dx + dz * dz || 1;
  const hit = S.zombies.filter(function (z) {
    return z.alive && z !== skip && !z.isClone && segDist(z.x, z.z, from.x, from.z, to.x, to.z) <= r + z.r;
  });
  /* Nearest along the cut takes full damage; each one after it a little less. */
  hit.sort(function (a, b) { return ((a.x - from.x) * dx + (a.z - from.z) * dz) / L2 - ((b.x - from.x) * dx + (b.z - from.z) * dz) / L2; });
  const swordF = swordFx(save);
  hit.forEach(function (z, k) {
    hurtZombie(z, dmg * Math.pow(CFG.pierceFalloff || 1, k), 'slash', rec);
    /* §9.2 서릿검: 일섬의 첫 원귀를 얼린다. */
    if (k === 0 && z.alive && !z.isBoss && swordF.freeze) z.frozen = Math.max(z.frozen || 0, swordF.freeze);
    if (z.alive) applyElement(z, curElem(), rec);
    else spreadElement(z, curElem(), rec);
  });
  S.items.slice().forEach(function (it) {
    if (!it.alive) return;
    if (segDist(it.x, it.z, from.x, from.z, to.x, to.z) <= r + it.r) collectItem(it, rec);
  });
  /* 결을 지나간 자리의 묵항아리는 깨진다. */
  if (three && three.chunks) three.chunks.jarsOnPath(from.x, from.z, to.x, to.z, r).forEach(breakJar);
}
function inkDir(rec, z) {
  const segs = rec && rec.segs;
  const d = segs && segs[segs.length - 1];
  if (d && d.to && d.from) return { x: d.to.x - d.from.x, z: d.to.z - d.from.z };
  if (S && S.hero && z) return { x: z.x - S.hero.x, z: z.z - S.hero.z };
  return { x: 1, z: 0 };
}
/* ---------- v0.31 §3.2 강적 깨는 법 ----------
   체력으로 버티는 대신 '어떻게 베는지'를 묻는다. 바꾸는 무늬는 장의 무늬 풀 안에서 고른다. */
function otherShape(cur) {
  const src = (S && S.pool && S.pool.length) ? S.pool : SHAPE_UNLOCK;
  const pool = src.filter(function (k) { return k !== cur; });
  if (!pool.length) return cur;
  return pool[Math.floor(Math.random() * pool.length)];
}
function refreshEnemyShape(z) {
  if (!S) return;
  (S.spirits || []).forEach(function (s) {
    if (s.target === z && s.obj && art && art.setSpiritShape) art.setSpiritShape(s.obj, spiritShape(s));
  });
}
/* 다른 무늬로 바뀔 때 0.3초 금빛 테두리 — 바뀌었다는 사실을 놓치지 않게. */
function setEnemyShape(z, shape, label) {
  if (!z || !shape) return;
  z.shapeOv = shape;
  z.rimFlash = CFG.breakRimT || 0.3;
  refreshEnemyShape(z);
  if (label) showJudge(label);
  if (audio && audio.bell) audio.bell(0, shape);
  telemetry.event('break', { kind: z.type, stage: S && S.stageNo, to: shape });
}
/** 그은 획에만 적용되는 파훼 규칙. null이면 평소 피해. */
function breakHit(z, rec, amount) {
  if (!z || z.isBoss || !S) return null;
  const shape = rec && rec.type;
  if (!shape) return null;
  /* 장정: 첫 일섬은 갑옷만 깨고(피해 0.5) 혼령 무늬가 다른 무늬로 바뀐다. 바뀐 무늬로 베면 즉사. */
  if (z.type === 'brute' && z.armored) {
    if ((z.armor || 0) > 0) {
      z.armor = 0;
      setEnemyShape(z, otherShape(shape), '갑옷 파훼!');
      S.shake = Math.max(S.shake || 0, 0.3);
      if (audio) audio.breakCue();
      return { dmg: CFG.armorDmg || 0.5, why: 'break' };
    }
    if (z.shapeOv && shape === z.shapeOv) {
      showJudge('갑옷 틈 — 즉사!');
      S.goldEdge = Math.max(S.goldEdge || 0, 0.2);
      return { dmg: 9999, why: 'break' };
    }
    return null;
  }
  /* 돌덩이: 서로 다른 무늬 2번이면 갈라진다. 같은 무늬를 반복하면 피해 ×0.5. */
  if (z.type === 'stone' && z.hasCracks) {
    if (z.lastShape && shape === z.lastShape) return { dmg: amount * (CFG.crackSameMul || 0.5), why: 'crack-same' };
    z.lastShape = shape;
    z.cracks = (z.cracks || 0) + 1;
    if (z.cracks >= (CFG.crackStages || 2)) {
      showJudge('돌이 갈라졌다!');
      if (audio) audio.breakCue();
      if (art && art.playFx && three) { const fx = art.playFx(three.scene, 'ink-splat', z.x, z.z, 2.4); if (fx) three.fx.push(fx); }
      S.shake = Math.max(S.shake || 0, 0.35);
      telemetry.event('break', { kind: 'stone', stage: S.stageNo, cracks: z.cracks });
      return { dmg: 9999, why: 'crack' };
    }
    setEnemyShape(z, otherShape(shape), '금이 갔다 · ' + (CFG.crackStages || 2) + '단계 중 ' + z.cracks);
    return null;
  }
  /* 정예: 머리 위 무늬 3개를 순서대로. 순서를 틀리면 일반 피해만. */
  if (z.eliteSeq && z.seq && z.seq.length) {
    if (shape !== z.seq[z.seqI]) return null;
    z.seqI += 1;
    if (z.seqI >= z.seq.length) {
      showJudge('봉인 순서 완성!');
      addCharge(CFG.eliteSeqCharge || 20);
      S.goldEdge = Math.max(S.goldEdge || 0, 0.2);
      if (audio && audio.bell) audio.bell(0, 'bolt');
      telemetry.event('break', { kind: 'elite', stage: S.stageNo, result: 'sealed' });
      return { dmg: 9999, why: 'seal-break' };
    }
    z.rimFlash = CFG.breakRimT || 0.3;
    refreshEnemyShape(z);
    if (audio && audio.bell) audio.bell(0, shape);
    showJudge('봉인 ' + z.seqI + '/' + z.seq.length);
    return null;
  }
  return null;
}
/* v0.31 §5.3: 자동 피해(호신부·벼락부적)는 총 피해의 25%를 넘지 않는다. */
function autoBudget() {
  const cap = CFG.autoCap;
  return Math.max(0,(S.manualDmg || 0)*cap/(1-cap) - (S.autoDmg || 0));
}
function autoShare() {
  const a = (S && S.autoDmg) || 0, m = (S && S.manualDmg) || 0;
  return (a + m) > 0 ? +(a / (a + m)).toFixed(3) : 0;
}
function hurtZombie(z, amount, why, rec) {
  if (!z || !z.alive) return;
  if (z.isBoss) {
    if (!z.hp || z.hidden) return;
    const isWeak = (z.openUntil > S.elapsed) || z.state === 'groggy';
    const mult = why === 'bang' ? 1 : (isWeak ? 1.3 : 0.7);
    const dealt = Math.min(z.hp, amount * mult);
    z.hpTrail = Math.max(z.hpTrail || z.hp, z.hp);
    z.hp -= dealt;
    const meter = why === 'bolt' || why === 'ward' ? 'autoDmg' : 'manualDmg';
    S[meter] = (S[meter] || 0) + dealt;
    if (rec && rec.hits) rec.hits.push({ id: z.id, dmg: dealt, hp: z.hp, why: why });
    /* v0.52: 보스 피격 타격감 전면 복구 — 소리·히트스톱·먹파편·피격 섬광·플로팅 데미지 */
    bossFx.spawnDamageNumber(z.x, z.z, dealt, isWeak);
    if (why === 'slash' || why === 'bang') {
      if (rec && !rec.hitstopDone) { rec.hitstopDone = true; addStrokeHitstop(rec, isWeak ? 0.05 : 0.035); }
      if (audio) audio.hit(isWeak || !!(rec && rec.perfect), S ? (S.combo || 0) : 0);
      S.shake = Math.max(S.shake || 0, isWeak ? 0.34 : 0.18);
    }
    const d = inkDir(rec, z);
    if (three && three.ink) { three.ink.hit(z.x, z.z, d.x, d.z); fxinkStat.hits++; }
    if (three && three.paper) three.paper.hit(z.x, 1.5, z.z, { size: isWeak ? 1.7 : 1.25 });
    z.flinchT = CFG.flinchDur || 0.14;
    if (z.obj && art.kickChar) art.kickChar(z.obj, 1);
    z.seqI = Math.min(z.seq.length - 1, Math.floor((1 - z.hp / z.maxHp) * z.seq.length));
    z.shape = z.seq[z.seqI];
    if (z.hp <= 0.001) { z.hp = 0; startSeal(z); }
    else { bossPhaseCheck(z); refreshBossGlyphs(z); }
    return;
  }
  if (z.isClone) { popClone(z, false); return; }
  /* 방울 정예: 방울이 울린 직후 0.5초는 봉인되어 칼이 미끄러진다. */
  if (z.invuln > 0) { if (!(S.armorJudgeT > 0)) { showJudge('봉인'); S.armorJudgeT = 0.4; } if (audio && audio.whiff) audio.whiff(true); return; }
  if (z.isPillar) { breakPillar(z); return; }
  if (z.isTotem) { breakTotem(z); return; }
  /* §3.2: 그은 획에만 파훼 규칙을 건다(참·콤보 폭발·상태이상은 평소대로). */
  if (why === 'slash' || why === 'echo' || why === 'counter') {
    const rule = breakHit(z, rec, amount);
    if (rule) { amount = rule.dmg; why = rule.why; }
  }
  const effectiveDamage = Math.min(Math.max(0,z.hp),amount);
  z.hp -= amount;
  if (S) {
    if (why === 'ward' || why === 'bolt') S.autoDmg = (S.autoDmg || 0) + effectiveDamage;
    else S.manualDmg = (S.manualDmg || 0) + effectiveDamage;
  }
  if (rec) rec.hits.push({ id: z.id, dmg: amount, hp: z.hp, why: why });
  tintZombie(z);
  /* §3.1: 일반 명중에도 짧은 히트스톱. 한 획에 여러 마리를 베어도 1번, 0.06초를 넘기지 않는다. */
  if (why === 'slash') {
    if (rec && !rec.hitstopDone) { rec.hitstopDone = true; addStrokeHitstop(rec, CFG.hitstopHit || 0.035); }
    if (audio) audio.hit(!!(rec && rec.perfect), S ? (S.combo || 0) : 0);
  }
  if (z.hp <= 0) killZombie(z, rec);
  else {
    const d = inkDir(rec, z);
    if (three && three.ink) { three.ink.hit(z.x, z.z, d.x, d.z); fxinkStat.hits++; }
    if (three && three.paper) three.paper.hit(z.x, 1.0, z.z, { size: z.type === 'stone' ? 1.6 : 1.1 });
    /* Stagger: a white flash and a short shove along the cut; the boss and status ticks do not shove. */
    z.flinchT = CFG.flinchDur || 0.14;
    if (z.obj && art.kickChar) art.kickChar(z.obj, 1);
    if (!z.isBoss && !(z.frozen > 0) && (why === 'slash' || why === 'cleave' || why === 'combo-burst')) {
      const L = Math.hypot(d.x, d.z) || 1, k = (CFG.hitKnockZ || 0.35) * (z.type === 'stone' ? (CFG.stoneKnockMul || 0.35) : 1);
      z.x += d.x / L * k; z.z += d.z / L * k;
    }
  }
}
/* v0.43: 원소별 바닥 흔적 — 화염=그을림, 빙결=얼음 균열, 번개=벼락 자국, 나머지=먹 튐. */
function groundTrace(elem, x, z, r) {
  if (!three || !three.traces) return;
  const kind = elem === 'fire' ? 'scorch' : elem === 'ice' ? 'ice' : (elem === 'lightning' || elem === 'bolt') ? 'bolt' : 'ink';
  const size = (r != null ? r * 2.1 : 2.7) * (0.85 + Math.random() * 0.4);
  three.traces.decal(kind, x, z, { size: size, dur: kind === 'scorch' ? 4.6 : kind === 'ice' ? 5.2 : kind === 'bolt' ? 3.4 : 3.0, alpha: 0.85 });
}
function applyElement(z, elem, rec) {
  if (!z.alive || !elem || (z.isBoss && !z.hp)) return;
  if(z.isBoss && elem==='ice'){ z.chilled=true; hurtZombie(z,frostImpact(elemLv('ice')),'ice-impact',rec); return; }
  /* v0.41: 원소 스킬 시트 — 붙은 자리에서 그 원소가 종이 컷으로 터진다. */
  if (three && three.paper) three.paper.elem(elem, z.x, z.z, { size: 1.6, ringR: 1.8 });
  /* v0.43: 같은 순간 바닥에 흔적이 남는다 — 궤적·터짐·흔적이 한 프레임에 맞물린다. */
  groundTrace(elem, z.x, z.z);
  if (elem === 'fire') {
    if (z.frozen > 0) shatterZombie(z, rec);
    else if (z.poison > 0) explodeZombie(z, rec);
    else {
      // The burning body and rising embers carry the hit without an icon.
      hurtZombie(z, fireImpact(elemLv('fire')), 'fire-impact', rec);
    }
  } else if (elem === 'ice') {
    if (!(z.frozen > 0)) {
      hurtZombie(z,frostImpact(elemLv('ice')),'ice-impact',rec);
      if (!z.alive) return;
    }
    z.frozen = elemIceDur();
    z.burn = 0;
    if (rec) rec.statuses = (rec.statuses || []).concat([{ id: z.id, ice: true }]);
    tintZombie(z);
  } else if (elem === 'poison') {
    z.poison = Math.min(z.isBoss ? 3 : elemPoisonMax(), (z.poison || 0) + 1);
    z.poisonT = CFG.poisonDur;
    if (rec) rec.statuses = (rec.statuses || []).concat([{ id: z.id, poison: z.poison }]);
    tintZombie(z);
  }
}
/* A cut that kills still carries its element: fire spreads, ice slows the crowd, poison leaves a cloud. */
function spreadElement(z, elem, rec) {
  if (!elem || !S) return;
  const R = CFG.spreadR || 1.5;
  if (elem === 'poison') {
    S.clouds = S.clouds || [];
    S.clouds.push({ x: z.x, z: z.z, t: CFG.poisonCloudDur || 3, tick: 0, r: (S.evo && S.evo.poisonSpread) ? Math.max(3.2, elemCloudR()) : elemCloudR() });
    if (art.playFx && three) { const fx = art.playFx(three.scene, 'poison-burst', z.x, z.z, 2.6); if (fx) three.fx.push(fx); }
    return;
  }
  S.zombies.forEach(function (o) {
    if (!o.alive || o === z || o.isBoss || dist(o, z) > R + o.r) return;
    if (elem === 'fire') applyElement(o, 'fire', rec);
    else if (elem === 'ice') { o.frozen = Math.max(o.frozen || 0, elemIceDur()); tintZombie(o); }
  });
  /* 얼음 일섬으로 한 번에 베어 넘긴 적도 '얼어붙은 채 죽은 것'으로 본다 — 사방 한기가 발동한다. */
  if (elem === 'ice') frostNovaAt(z, rec);
}
function applyBurn(z, rec) {
  z.burn = elemBurnDur();
  if (rec) rec.statuses = (rec.statuses || []).concat([{ id: z.id, burn: true }]);
  tintZombie(z);
}
function shatterZombie(z, rec) {
  z.freezeAt = null;
  z.frozen = 0;
  if (rec) rec.shatter = (rec.shatter || []).concat([z.id]);
  if (art.playFx) {
    const fx = art.playFx(three.scene, 'ice-shatter', z.x, z.z, 2.4);
    if (fx) three.fx.push(fx);
  }
  S.shake = Math.max(S.shake || 0, 0.15);
  hurtZombie(z, elemShatterDmg(), 'shatter', rec);
  /* v0.31 §5.4 증기 폭발: 얼음+화염 두 칸 — 깨짐이 반경 2m로 퍼진다. */
  if (S.evo && S.evo.steam) {
    S.zombies.forEach(function (o) {
      if (o === z || !o.alive || o.isBoss || o.isClone || o.isPillar || o.isTotem) return;
      if (dist(o, z) > 2 + (o.r || 0.5)) return;
      hurtZombie(o, 2, 'steam', rec);
    });
    if (art && art.playFx && three) { const fx = art.playFx(three.scene, 'ink-splat', z.x, z.z, 2.2); if (fx) three.fx.push(fx); }
  }
}
function explodeZombie(z, rec) {
  const stacks = z.poison || 0;
  z.poison = 0; z.poisonT = 0; z.poisonTick = 0;
  if (rec) rec.explode = (rec.explode || []).concat([{ id: z.id, stacks: stacks }]);
  if (art.playFx) {
    const fx = art.playFx(three.scene, 'poison-burst', z.x, z.z, 2.6);
    if (fx) three.fx.push(fx);
  }
  S.shake = Math.max(S.shake || 0, 0.2);
  hurtZombie(z, Math.max(CFG.explodeDmg,fireImpact(elemLv('fire'))) + .5*Math.max(0,stacks-1), 'explode', rec);
  S.zombies.forEach(function (o) {
    if (o === z || !o.alive) return;
    if (dist(o, z) <= CFG.explodeR + o.r) hurtZombie(o, CFG.explodeDmg, 'explode-aoe', rec);
  });
}
function tintZombie(z) {
  if (!z || !z.obj) return;
  const elem = !z.alive ? null : (z.frozen > 0 ? 'ice' : z.burn > 0 ? 'fire' : z.poison > 0 ? 'poison' : z.slowT > 0 ? 'slow' : null);
  if (art.setStatus) art.setStatus(z.obj, elem);
}
function tickStatuses(dt) {
  (S.clouds || []).forEach(function (c) {
    c.t -= dt;
    const period = c.kind === 'fire' ? (CFG.burnPeriod || 0.75) : (CFG.poisonPeriod || 1);
    c.tick += dt;
    if (c.tick < period) return;
    c.tick -= period;
    if (c.kind === 'fire') {
      /* 묵염(墨炎) 장판: 0.75초당 1뎀 */
      S.zombies.forEach(function (z) {
        if (z.alive && dist(z, c) <= (c.r || 1.5) + z.r) hurtZombie(z, CFG.burnDmg || 1, 'burn', S.lastDash);
      });
      return;
    }
    S.zombies.forEach(function (z) {
      if (!z.alive || dist(z,c) > (c.r || CFG.poisonCloudR || 2) + z.r) return;
      // Staying in one cloud refreshes exposure; different clouds can stack.
      c.exposed ??= new Set();
      if (c.exposed.has(z.id) && z.poison > 0) z.poisonT = CFG.poisonDur;
      else { c.exposed.add(z.id); applyElement(z,'poison',null); }
    });
  });
  if (S.clouds) S.clouds = S.clouds.filter(function (c) { return c.t > 0; });
  /* 둑운(毒雲) 확산: 구름끼리 만나면 병합 */
  if (S.evo && S.evo.poisonSpread && S.clouds && S.clouds.length > 1) {
    for (let i = 0; i < S.clouds.length; i++) {
      for (let j = i + 1; j < S.clouds.length; j++) {
        const a = S.clouds[i], b = S.clouds[j];
        if (!a || !b) continue;
        if (a.kind === 'fire' || b.kind === 'fire') continue;
        if (dist(a, b) > 1.2) continue;
        a.r = Math.max(a.r || 2, b.r || 2) + 0.4;
        a.t = Math.max(a.t, b.t);
        S.clouds.splice(j, 1);
        j--;
      }
    }
  }
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
    if (z.slowT > 0) { z.slowT -= dt; if (z.slowT < 0) z.slowT = 0; if (z.slowT <= 0) z.inkSlow = 0; }
    if (z.stun > 0) { z.stun -= dt; if (z.stun < 0) z.stun = 0; }
    if (z.rimFlash > 0) z.rimFlash = Math.max(0, z.rimFlash - dt);
    if (z.frozen > 0) {
      if (z.freezeAt == null) z.freezeAt = S.elapsed;
      z.frozen -= dt;
      if (z.frozen <= 0) {
        z.freezeAt = null;
        z.frozen = 0;
        /* 빙결이 끝나면 잠깐 둔화가 남아 칼을 다시 챙길 시간을 준다. */
        z.slowT = Math.max(z.slowT || 0, 0.9);
      }
    }
    if (z.burn > 0) {
      z.burn -= dt;
      z.burnTick = (z.burnTick || 0) + dt;
      while (z.alive && z.burnTick >= CFG.burnPeriod) {
        z.burnTick -= CFG.burnPeriod;
        hurtZombie(z, elemBurnDmg(), 'burn', S.lastDash);
      }
      if (z.burn <= 0) z.burn = 0;
    }
    if (z.poison > 0) {
      z.poisonTick = (z.poisonTick || 0) + Math.min(dt,z.poisonT);
      z.poisonT -= dt;
        while (z.alive && z.poisonTick + 1e-8 >= CFG.poisonPeriod) {
          z.poisonTick -= CFG.poisonPeriod;
          hurtZombie(z, z.poison * elemPoisonDmg(), 'poison', S.lastDash);
        }
      if (z.poisonT <= 1e-8) { z.poison = 0; z.poisonT = 0; z.poisonTick = 0; }
    }
    tintZombie(z);
  });
}
function makeSlash(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.max(0.2, Math.hypot(dx, dz));
  const yaw = Math.atan2(dx, dz);
  const q = (three && three.bloom && three.bloom.quality) || fxQ;
  /* The cut shows the element it actually applies: a ground charm (12 s) over the engraved one. */
  const elemNow = S ? curElem() : null;
  const s = createInkSlash({
    from: from, to: to,
    width: pathR() * 1.6 * 1.2,
    elem: elemNow,
    coreGain: q === 'off' ? 1.2 : 1.6
  });
  three.scene.add(s.mesh);
  three.slashes = three.slashes || [];
  three.slashes.push(s);
  /* 3D 검기 아크: 바닥 궤적 위로 솟는 먹 리본 */
  try {
    const arc = createSlashArc({ actNo: actOf((S && S.stageNo) || save.stage || 1),
      from: from, to: to, elem: elemNow,
      coreGain: q === 'off' ? 1.05 : 1.45,
      height: 0.5 + pathR() * 0.12,
      width: Math.max(0.9, pathR() * 0.95)
    });
    three.scene.add(arc.mesh);
    three.slashes.push(arc);
  } catch (e) {}
  if (three.ink) three.ink.slash(from, to);
  /* v0.41: 검기 시트(초승달 종이 아크) — 원소면 그 원소 시트가 함께 터진다. */
  if (three.paper) three.paper.slash(from, to, elemNow);
  /* v0.41: 베기 자세 프레임 — 주인공 팔·몸통이 베는 그림으로 빠르게 넘어간다 */
  if (three.heroSpr && art.slashChar) art.slashChar(three.heroSpr, 1.0);
  if (three.lights) three.lights.burst((from.x + to.x) * 0.5, 1.2, (from.z + to.z) * 0.5, { color: palColor('jade'), intensity: 4.5, duration: 0.28 });
  fxinkStat.slashes++;
  if (elemNow === 'fire' && art.trailTex) {
    const tgeo = new THREE.PlaneGeometry(pathR() * 2.2, len);
    const trail = new THREE.Mesh(tgeo, trailMaterial());
    trail.rotation.set(-Math.PI / 2, 0, yaw);
    trail.position.set((from.x + to.x) / 2, 0.06, (from.z + to.z) / 2);
    three.scene.add(trail);
    three.fx.push({ mesh: trail, life: 1.2, max: 1.2 });
  }
  return s.mesh;
}
/* v0.50: 보스 전용 3D 수묵·주홍 검기 (주인공 일섬과 동일한 WebGL 3D 리본 + 아크 + 동적 광원) */
function makeBossSlash(from, to, opts) {
  if (!three || !three.scene) return null;
  opts = opts || {};
  const q = (three.bloom && three.bloom.quality) || fxQ;
  const elem = opts.elem || 'fire';
  const width = opts.width || 2.8;
  try {
    const s = createInkSlash({
      from: from, to: to, width: width, elem: elem,
      coreGain: q === 'off' ? 1.25 : 1.75
    });
    three.scene.add(s.mesh);
    three.slashes = three.slashes || [];
    three.slashes.push(s);
    const arc = createSlashArc({ actNo: actOf((S && S.stageNo) || save.stage || 1),
      from: from, to: to, elem: elem,
      coreGain: q === 'off' ? 1.15 : 1.65,
      height: opts.height || 0.85,
      width: Math.max(1.2, width * 0.65)
    });
    three.scene.add(arc.mesh);
    three.slashes.push(arc);
    if (three.ink) three.ink.slash(from, to);
    if (three.paper) three.paper.slash(from, to, elem);
    if (three.lights) {
      three.lights.burst((from.x + to.x) * 0.5, 1.35, (from.z + to.z) * 0.5, {
        color: opts.lightColor || 0xe84830, intensity: 5.5, duration: 0.36
      });
    }
    return s.mesh;
  } catch (e) { return null; }
}
function afterimages(from, to) {
  for (let i = 1; i <= 4; i++) {
    const u = i / 5;
    const g = art.makeChar('afterimage');
    if (g.userData.sprite) {
      const mat = g.userData.sprite.material;
      const op = 0.28 - i * 0.05;
      if (g.userData.rig) art.setCharOpacity(g, op);
      else mat.opacity = op;
      if (mat.blending != null && !g.userData.rig) mat.blending = THREE.NormalBlending;
    }
    g.position.set(from.x + (to.x - from.x) * u, 0, from.z + (to.z - from.z) * u);
    three.scene.add(g);
    three.fx.push({ mesh: g, life: 0.16 + i * 0.03, max: 0.22 });
  }
}
function cutBoss(s) { cutSpirit(s); }
/* §4.2 빈틈 고리: 걷는 보스의 빈틈은 1.6초에 한 번 열린다. 다음 빈틈까지의 진행을 돌려준다. */
function gapInfo(s) {
  const period = CFG.gapPeriod || 1.6;
  const t = (S.elapsed || 0) - ((s && s.walkCutAt != null) ? s.walkCutAt : -9);
  const u = clamp(t / period, 0, 1);
  return { open: u >= 1, progress: u, readyIn: Math.max(0, period - t), period: period };
}
function cutSpirit(s) {
  if (!s || !s.alive) return;
  if (s.kind === 'spirit') return;
  if (s.isBoss && s.hp && !s.hidden && !(s.openUntil>S.elapsed) &&
      ['telegraph','slamTele','sweepTele','volleyTele','charge','stun','groggy','clones','veil','shuffle'].includes(s.state)) {
    endBossSide(s);
    s.openUntil=S.elapsed+1.8+(s.chilled ? .4 : 0);
    s.chilled=false; s.state='stun'; s.stateT=0; s.leapY=0;
    bossFx.triggerSmokeBurst(s.x, s.z, true);
    showJudge('빈틈! 피해 ×1.3');
    if(audio) audio.breakCue();
  }
}

function destroySpirit(s) {
  if (!s || s.kind !== 'spirit') return;
  s.alive = false;
  if (s.obj && three) three.scene.remove(s.obj);
  if (S) S.spirits = (S.spirits || []).filter(function (q) { return q.alive; });
}
function addHitstop(sec) {
  if (!S) return;
  const queued = !!(S.inputQueue && S.inputQueue.size() > 0);
  const cap = queued ? 0.045 : (CFG.hitstopKillMax || 0.12);
  const prev = S.hitstop || 0;
  S.hitstop = Math.min(cap, prev + (sec || 0));
  const added = Math.max(0, S.hitstop - prev);
  if (added > 0 && S.lastDash) S.lastDash.hitstopMs = (S.lastDash.hitstopMs || 0) + added * 1000;
}
/* §3.1 한 획의 정지 예산: 명중·처치가 몇 번 들어가든 0.06초를 넘기지 않는다. */
function addStrokeHitstop(rec, sec) {
  if (!rec) { addHitstop(sec); return; }
  const cap = CFG.hitstopHitCap || 0.06;
  const used = rec.hsUsed || 0;
  const add = Math.min(sec || 0, Math.max(0, cap - used));
  if (add <= 0) return;
  rec.hsUsed = used + add;
  addHitstop(add);
}
/* A slain body sinks and fades over dieDur instead of vanishing on the spot. */
function startDying(obj) {
  three.dying = three.dying || [];
  const mats = [];
  obj.traverse(function (o) { if (o.material && o.material.opacity != null && o.visible) mats.push([o.material, o.material.opacity]); });
  if (obj.userData && obj.userData.tele) obj.userData.tele.visible = false;
  three.dying.push({ obj: obj, t: 0, dur: CFG.dieDur || 0.5, mats: mats, y0: obj.position.y });
}
function stepDying(dt) {
  if (!three || !three.dying || !three.dying.length) return;
  three.dying = three.dying.filter(function (d) {
    d.t += dt;
    const k = Math.min(1, d.t / d.dur);
    d.mats.forEach(function (m) { m[0].opacity = m[1] * (1 - k); m[0].transparent = true; });
    d.obj.scale.set(1 + 0.25 * k, 1 - 0.55 * k, 1);
    d.obj.position.y = d.y0 - 0.3 * k;
    if (k >= 1) { three.scene.remove(d.obj); return false; }
    return true;
  });
}
function killZombie(z, rec) {
  if (!z || !z.alive) return;
  z.alive = false;
  if (z.isBoss && S) {
    codexBoss(S.stage);
    if (audio && audio.setBossMode) audio.setBossMode(false);
    bossFx.triggerGroggyBreak(z.x, z.z);
  } else codexMon(z.type);
  /* 분열 정예: 죽으면 둘로 갈라진다. */
  if (S && z.eliteAttr === 'split' && !z.splitDone) {
    z.splitDone = true;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      spawnZombie({ x: z.x + Math.cos(a) * 1.1, z: z.z + Math.sin(a) * 1.1, type: 'imp' });
    }
    showJudge('분열!');
    telemetry.event('elite_attr', { attr: 'split', stage: S.stageNo });
  }
  if (S && !z.isBoss) goalOnKill(z);
  if (S) S.kills = (S.kills || 0) + 1;
  if (S && S.spirits) S.spirits.forEach(function (s) { if (s.target === z) s.target = null; });
  assignSpiritTargets();
  z.marked = false;
  if (z.obj) startDying(z.obj);
  /* v0.41: 처치 — 혼령 자리에서 종이 부스러기로 흩어진다. */
  if (three && three.paper) three.paper.dissolve(z.x, (z.isBoss ? 3.2 : 1.3), z.z, { size: z.isBoss ? 4.2 : 1.5 });
  if (three && three.ink) {
    const d = inkDir(rec || (S && S.lastDash), z);
    /* §3.1: 처치의 먹 번짐은 반경 ×1.4 — 한 획에 여러 마리가 사라져도 '벌었다'가 보이게. */
    three.ink.kill(z.x, z.z, d.x, d.z, { scale: CFG.killSplatScale || 1.4 });
    fxinkStat.kills++;
  }
  if (audio && rec && !z.isBoss) audio.drum();
  if (rec && rec.hits && rec.hits.some(function (h) { return h.id === z.id && h.why === 'slash'; })) addStrokeHitstop(rec, CFG.hitstopKill || 0.06);
  const kd = CFG.zombieTypes[z.type] || CFG.zombieTypes.imp;
  /* §6.1 5장 안개 띠: 원이 가장 넓은 순간(안개가 옅음)의 처치를 별 3 대안석으로 센다. */
  if (!z.isBoss && S && S.terrain && S.terrain.kind === 'fog' && (S.terrain.ringMul || 1) > 1.06) tcount('fogWide');
  /* The boss pays its own coin value; its xp does not matter, the run ends on its death. */
  grantKill(z.isBoss ? (CFG.bossCoin || 20) : kd.coin);
  gainXp(CFG.xpPerKill * kd.xp * (CFG.xpScale || 1));
  /* 혼백구 100% + 20% 추가 드롭, 정예는 부적 상자 */
  spawnItem({ type: 'xp', x: z.x, z: z.z });
  if (Math.random() < 0.2) spawnItem({ type: dropType(), x: z.x + (Math.random() - 0.5) * 0.7, z: z.z + (Math.random() - 0.5) * 0.7 });
  if (z.elite) spawnItem({ type: 'charm', x: z.x, z: z.z });
  /* 참 게이지 */
  if (!z.isBoss) addCharge(CFG.cleaveGainKill || 7);
  /* 사방 한기(寒氣): 얼어붙은 적이 죽으면 사방으로 얼음 검기 */
  if (S.evo && S.evo.frostNova && (z.frozen > 0 || z.slowT > 0) && !z.novaDone) {
    frostNovaAt(z, rec);
  }
  /* 만독 쇄도: 독이 오른 적의 죽음이 독폭발과 참 게이지로 이어진다. */
  if (S.evo && S.evo.poisonSpread && (z.poison || 0) > 0 && !z.manpoDone) {
    z.manpoDone = true;
    manpoBurst(z, rec);
  }
  /* 포위 웨이브 정리 보상 */
  if (S) {
    const ix = (S.waveIds || []).indexOf(z.id);
    if (ix >= 0) {
      S.waveIds.splice(ix, 1);
      if (!S.waveIds.length) { addCharge(CFG.cleaveGainWave || 15); showJudge('포위 격파!'); }
    }
  }
  refreshSpirits();
}
function dropType() {
  const r = Math.random();
  if (r < 0.24) return 'xp';
  if (r < 0.42) return 'coin';
  if (r < 0.58) return 'heal';
  if (r < 0.72) return 'dashplus';
  if (r < 0.80) return 'ice';
  if (r < 0.88) return 'fire';
  if (r < 0.94) return 'poison';
  return 'bell';
}
function grantKill(mul) {
  /* v0.30 §7.2: 엽전에도 모드 배율(수련 ×0.7 · 고수 ×1.4). v0.32 §6.1: 4장 붉은 달빛에는 두 배. */
  const c = Math.round(CFG.coinPerKill * (mul || 1) * coinMult() * modeCoin() * terrainCoinMul());
  save.coins += c; persist();
}
/* Screen point (inside #app) of a HUD element, for pickups flying to it. */
function hudPoint(id) {
  const el = $(id), app = $('app');
  if (!el || !app) return { x: 30, y: 30 };
  const a = app.getBoundingClientRect(), b = el.getBoundingClientRect();
  return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2 };
}
const ITEM_FX = {
  coin: 'gold', xp: 'jade', heal: 'vermilion', herb: 'vermilion', dashplus: 'jade', ice: 'ice', fire: 'fire', poison: 'poison',
  bell: 'gold', charm: 'gold', magnet: 'gold', bang: 'fire'
};
/* Every pickup bursts in its colour; currency and spirit orbs fly to their HUD counter. */
function pickupFx(it) {
  const c = FX_COLORS[ITEM_FX[it.kind] || 'paper'];
  if (it.kind === 'xp') { inkFx.burst(it.x, it.z, c, { r1: 18, n: 0, dur: 0.3 }); inkFx.fly(it.x, it.z, hudPoint('xpWrap'), c, 1); return; }
  if (it.kind === 'coin') { inkFx.burst(it.x, it.z, c, { r1: 26, n: 6 }); inkFx.fly(it.x, it.z, hudPoint('coinLabel'), c, 4); return; }
  const big = it.kind === 'charm' || it.kind === 'bang' || it.kind === 'magnet' || it.kind === 'bell';
  inkFx.burst(it.x, it.z, c, { r1: big ? 70 : 44, n: big ? 12 : 8, big: big, dur: big ? 0.7 : 0.5 });
  if (it.kind === 'heal' || it.kind === 'herb') inkFx.fly(it.x, it.z, hudPoint('hpWrap'), c, 3);
  if (it.kind === 'ice' || it.kind === 'fire' || it.kind === 'poison') inkFx.ring(1.6, c, 0.6);

}
function collectItem(it, rec) {
  pickupFx(it);
  it.alive = false;
  if (it.obj) three.scene.remove(it.obj);
  S.items = S.items.filter(function (x) { return x.alive; });
  if (rec) rec.items.push({ id: it.id, type: it.kind });
  if (it.kind === 'dashplus') {
    /* §5.1 바닥 일섬 +1은 한 판 3번까지, 그 뒤에는 엽전 +10으로 바뀐다. */
    if ((S.floorDash || 0) >= 3) {
      save.coins += 10; persist();
      showJudge('일섬 상한 · 엽전 +10');
    } else {
      S.floorDash = (S.floorDash || 0) + 1;
      S.dashCount++;
      inkFx.seal('일섬 ' + S.dashCount, FX_COLORS[ITEM_FX.dashplus || 'paper']);
      if (S.dash && rec && rec.type) {
        const skip = (S.dashQueue || []).concat(S.dash.target ? [S.dash.target] : []);
        const more = pickSpirits(rec.type, 1, { x: S.dash.to.x, z: S.dash.to.z }, S.lastStrokeDir, skip);
        if (more[0]) {
          S.dashQueue.push(more[0]);
          if (rec.targets.indexOf(more[0].id) < 0) rec.targets.push(more[0].id);
        }
      }
    }
  } else if (it.kind === 'charm') {
    /* 부적 상자(잭팟): 강화 3연속 — §5.2 부적 상자는 지금처럼 멈추는 창을 쓴다. */
    S.forcePauseLv = true;
    S._pendingLv = (S._pendingLv || 0) + 2;
    S.slowT = Math.max(S.slowT || 0, 0.35);
    if (audio) {
      audio.bell(0, 'bolt');
      setTimeout(function () { if (audio) audio.bell(0.4, 'vee'); }, 120);
      setTimeout(function () { if (audio) audio.bell(-0.4, 'hline'); }, 240);
    }
    showJudge('부적 상자!');
    openLevelUp();
  } else if (it.kind === 'heal') {
    S.hp = Math.min(maxHp(), S.hp + 3);
  } else if (it.kind === 'herb') {
    /* 회복 약초·주먹밥: 체력 +2 */
    const restored = Math.min(maxHp() - S.hp, CFG.herbHeal || 2);
    S.hp += restored;
    showJudge(restored ? '체력 +' + restored : '체력 가득');
    if (audio && audio.pickup) audio.pickup(1);
  } else if (it.kind === 'magnet') {
    /* 자석 부적: 바닥 아이템 전부를 한 번에 */
    showJudge('자석 부적!');
    absorbAllItems(it);
  } else if (it.kind === 'bang') {
    /* 화약 부적: 화면 안 광역 폭발 */
    firecrackerBurst();
  } else if (it.kind === 'coin') {
    save.coins += Math.round(5 * coinMult()); persist();
  } else if (it.kind === 'xp') gainXp((CFG.xpPerKill || 1) * (CFG.xpScale || 1));
  else if (it.kind === 'ice' || it.kind === 'fire' || it.kind === 'poison') {
    /* v0.23: 바닥 원소 부적은 12초 임시 부여 — 레벨업으로 키운 원소 각인을 덮어쓰지 않는다. */
    S.tempElem = { el: it.kind, t: CFG.tempElemDur || 12 };
    showJudge(elemNameOf(it.kind) + ' 부적 ' + Math.round(CFG.tempElemDur || 12) + '초');
    if (audio && audio.pickup) audio.pickup(1);
  }
  else if (it.kind === 'bell') startBell(it.shape, it.dur);
  renderHud();
}
function addCharge(n) {
  if (!S) return;
  const max = CFG.cleaveCharge || 100;
  const before = S.charge || 0;
  const mul = 1 + 0.25 * (S.chargeLv || 0);
  S.charge = Math.min(max, before + n * mul);
  if (before < max && S.charge >= max) { showJudge('참(斬) 준비'); if (audio) audio.bell(0, 'bolt'); }
}
/* 스킬 진화: 조합이 갖춰지면 화면과 손에서 바로 티나는 효과가 켜진다.
   v0.22: 강화 레벨(upLv)까지 조건에 넣어 '한 번 집은 것'이 아니라 '키운 것'으로 진화한다. */
function upLv(id) { return (S && S.upLv && S.upLv[id]) || 0; }
function checkEvolutions(ctx) {
  if (!S) return;
  ctx = ctx || {};
  const has = S.evo || (S.evo = {});
  S.evolved = S.evolved || [];
  const el = S.dashElem;
  function born(key, name) {
    if (has[key]) return;
    has[key] = true;
    S.evolved.push(name);
    codexEvo(key);
    toast('✦ 진화: ' + name);
    inkFx.evo(name, FX_COLORS[S.dashElem || 'gold'] || FX_COLORS.gold);
    S.slowT = Math.max(S.slowT || 0, 0.5);
    if (audio) audio.bell(0, 'bolt');
  }
  /* 1) 빙결 참격(절대영도): 일섬·얼음 + 경로 폭 Lv2↑ → 착지점 광역 동결·분쇄 */
  const hasIce = el === 'ice' || elemLv('ice') > 0;
  const hasFire = el === 'fire' || elemLv('fire') > 0;
  const hasPoison = el === 'poison' || elemLv('poison') > 0;
  if (hasIce && upLv('width') >= 2) born('frostNova', '빙결 참격(절대영도)');
  /* 2) 업화 연쇄: 일섬·화염 + 일섬 횟수 Lv2↑ → 돌진마다 화염 폭발 장판 */
  if (hasFire && upLv('dash') >= 2) born('fireTrail', '업화 연쇄');
  /* 3) 만독 쇄도: 일섬·독 + 참(斬) 게이지 Lv2↑ → 독폭발 연쇄 + 참 게이지 충전 */
  if (hasPoison && upLv('charge') >= 2) born('poisonSpread', '만독 쇄도');
  /* 4) 빙참: 일섬·얼음 + 참 게이지 Lv2↑ — 모든 진화가 "각인 + 짝 카드 Lv2" 규칙을 따른다. */
  if (hasIce && upLv('charge') >= 2) born('iceCleave', '빙참(氷斬)');
  /* 5) 만종: 한 가지 종 + 일섬 횟수 카드 Lv2↑ (바닥의 일섬 +1은 세지 않는다) */
  if ((S.bellT > 0 || ctx.bell) && upLv('dash') >= 2) born('myriadBell', '만종(萬鐘)');
  /* v0.31 §5.4 새 진화 5종 */
  if (upLv('ward') >= 3 && (S.ringLv || 0) >= 3) born('manryun', '만륜(萬輪)');
  if (upLv('bolt') >= 3 && hasIce) born('noebing', '뇌빙(雷氷)');
  if (upLv('reson') >= 3 && upLv('dash') >= 2) born('cheonjong', '천종(千鐘)');
  if (upLv('counter') >= 2 && upLv('parry') >= 2) born('gwigeom', '귀검(歸劍)');
  if (elemLv('ice') >= 1 && elemLv('fire') >= 1) born('steam', '증기 폭발');
}
/* 빙결 참격: 착지점이 얼어붙고 부서지는 얼음 파편이 퍼진다. */
function frostLanding(at) {
  if (!S || !at) return;
  const R = 4.2;
  if (art && art.playFx && three) {
    const fx = art.playFx(three.scene, 'ink-splat', at.x, at.z, 3.4);
    if (fx) three.fx.push(fx);
  }
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
    if (dist(z, at) > R + z.r) return;
    if(z.isBoss) z.chilled=true; else z.frozen = Math.max(z.frozen || 0, elemIceDur());
    z.burn = 0;
    tintZombie(z);
    hurtZombie(z, 3, 'frost', S.lastDash);
  });
  S.shake = Math.max(S.shake || 0, 0.35);
}
/* 업화 연쇄: 착지할 때마다 불꽃이 터지고 지나온 자리에 장판이 남는다. */
function fireLanding(at) {
  if (!S || !at) return;
  const R = 2.7;
  if (art && art.playFx && three) {
    const fx = art.playFx(three.scene, 'ink-splat', at.x, at.z, 2.4);
    if (fx) three.fx.push(fx);
  }
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
    if (dist(z, at) > R + z.r) return;
    hurtZombie(z, CFG.explodeDmg || 3, 'fire-burst', S.lastDash);
    if (z.alive) { z.burn = CFG.burnDur || 3; tintZombie(z); }
  });
  S.shake = Math.max(S.shake || 0, 0.3);
}
/* 만독 쇄도: 독이 오른 적이 쓰러지면 독이 터져 옆으로 옮고 참 게이지가 더 찬다. */
function manpoBurst(z, rec) {
  if (!S || !z) return;
  const stacks = Math.max(1, Math.min(elemPoisonMax(), z.poison || 1));
  const R = 2.8 + stacks * 0.3;
  if (art && art.playFx && three) {
    const fx = art.playFx(three.scene, 'ink-splat', z.x, z.z, 2.8);
    if (fx) three.fx.push(fx);
  }
  S.zombies.forEach(function (o) {
    if (o === z || !o.alive) return;
    if (dist(o, z) > R + o.r) return;
    hurtZombie(o, 2 + stacks, 'poison-burst', rec);
    if (o.alive) {
      o.poison = Math.min(elemPoisonMax(), (o.poison || 0) + 1);
      o.poisonT = CFG.poisonDur || 4;
      tintZombie(o);
    }
  });
  addCharge(6 + stacks * 2);
  S.shake = Math.max(S.shake || 0, 0.22);
}
/* 사방 한기(寒氣): 얼어붙은 적(혹은 얼음 일섬으로 베어 넘긴 적)이 터지며 사방을 얼린다. */
function frostNovaAt(z, rec) {
  if (!S || !z || !S.evo || !S.evo.frostNova || z.novaDone) return;
  z.novaDone = true;
  if (art.playFx && three) {
    const fx = art.playFx(three.scene, 'ice-shatter', z.x, z.z, 3.2);
    if (fx) three.fx.push(fx);
  }
  S.zombies.forEach(function (o) {
    if (!o.alive || o === z) return;
    if (dist(o, z) <= 3) {
      hurtZombie(o, 4, 'frost', rec);
      if (o.alive) { o.slowT = Math.max(o.slowT || 0, CFG.iceSlowDur || 2); tintZombie(o); }
    }
  });
}
/* ---------- v0.31 §5.3 새 카드 ----------
   회전 호신부·진노의 벼락부적은 자동 피해 — 총 피해의 25%(autoCap)를 넘으면 대미지를 받지 않는다.
   메아리 칼·방울 공명·칼집 반격·먹 발자국은 획과 판단에 딸린 효과라 수동 피해로 센다. */
function wardInfo() {
  const lv = upLv('ward');
  if (!lv) return null;
  const W = CFG.ward || {};
  return {
    lv: lv,
    n: lv >= 3 ? (W.n3 || 4) : (W.n || 2),
    r: (lv >= 2 ? (W.r2 || 2.6) : (W.r || 2.2)) + ((S.evo && S.evo.manryun) ? (W.manryunR || 1.2) : 0),
    dmg: W.dmg || 0.8, period: W.period || 0.35
  };
}
function stepWard(dt) {
  const w = wardInfo();
  if (!w) return;
  S.wardSpin = (S.wardSpin || 0) + dt * (CFG.ward.spin || 2.1);
  S.wardTick = (S.wardTick || 0) + dt;
  if (S.wardTick < w.period) return;
  S.wardTick -= w.period;
  for (let i = 0; i < w.n; i++) {
    const a = S.wardSpin + i * Math.PI * 2 / w.n;
    const p = { x: S.hero.x + Math.cos(a) * w.r, z: S.hero.z + Math.sin(a) * w.r };
    S.zombies.forEach(function (z) {
      if (!z.alive || z.isClone || z.isPillar || z.isTotem) return;
      if (dist(z, p) > 0.62 + (z.r || 0.5)) return;
      const damage = Math.min(w.dmg,autoBudget());
      if (damage < .001) return;
      hurtZombie(z, damage, 'ward', S.lastDash);
      if (z.alive && S.evo && S.evo.manryun) { z.slowT = Math.max(z.slowT || 0, CFG.ward.manryunSlow || 0.3); tintZombie(z); }
    });
  }
}
function boltPeriod() {
  const B = CFG.boltCard || {};
  return Math.max(2.5, (B.every || 4.5) - (B.lvStep || 0.4) * Math.max(0, upLv('bolt') - 1));
}
/* 가장 밀집한 지점: 6m 안 원귀 중 2.4m 안에 가장 많이 모인 자리. */
function densestPoint(range) {
  let best = null, bestN = -1;
  (S.zombies || []).forEach(function (z) {
    if (!z.alive || z.hidden || z.isClone || z.isPillar || z.isTotem) return;
    if (dist(z, S.hero) > range && !(z.isBoss && arenaActive())) return;
    let n = 0;
    S.zombies.forEach(function (o) { if (o.alive && !o.isBoss && !o.isClone && !o.isPillar && !o.isTotem && dist(o, z) <= CFG.boltCard.r + o.r) n++; });
    if (n > bestN) { bestN = n; best = { x: z.x, z: z.z }; }
  });
  return best;
}
function stepBolt(dt) {
  const lv = upLv('bolt');
  if (!lv) return;
  S.boltT = (S.boltT || 0) + dt;
  if (S.boltT < boltPeriod()) return;
  const at = densestPoint(Math.min(ringR(),CFG.boltCard.range || 6));
  if (!at) return;
  S.boltT = 0;
  S.bolts = S.bolts || [];
  S.bolts.push({ x: at.x, z: at.z, t: 0, delay: CFG.boltCard.tele || 0.6, r: CFG.boltCard.r || 2.2, done: false });
  if (audio && audio.bell) audio.bell(0, 'bolt');
  telemetry.event('auto_skill', { kind: 'bolt', lv: lv, stage: S.stageNo });
}
function stepBolts(dt) {
  if (!S.bolts || !S.bolts.length) return;
  S.bolts.forEach(function (b) {
    b.t += dt;
    if (b.done || b.t < b.delay) return;
    b.done = true;
    S.shake = Math.max(S.shake || 0, 0.3);
    const dmg = CFG.boltCard.dmg || 2.2;
    const targets = S.zombies.filter(z => z.alive && !z.isClone && !z.isPillar && !z.isTotem && dist(z,b) <= b.r + z.r);
    const perTarget = Math.min(dmg,autoBudget()/Math.max(1,targets.length));
    if (perTarget < .001) return;
    targets.forEach(function (z) {
      if (!z.alive) return;
      hurtZombie(z, perTarget, 'bolt', S.lastDash);
      S.boltHits = (S.boltHits || 0) + 1;
      if (z.alive && S.evo && S.evo.noebing) { if(z.isBoss) z.chilled=true; else z.frozen = Math.max(z.frozen || 0, CFG.boltCard.freeze || 1.5); tintZombie(z); }
    });
  });
  S.bolts = S.bolts.filter(function (b) { return !(b.done && b.t > b.delay + 0.58); });
}
/* 메아리 칼: 일섬 0.5초 뒤 같은 경로에 잔영이 지나간다(피해 40/55/70%). */
function queueEcho(rec) {
  const lv = upLv('echo');
  if (!lv || !rec || !rec.segs || !rec.segs.length) return null;
  const seg = rec.segs[rec.segs.length - 1];
  if (!seg || !seg.from || !seg.to) return null;
  S.echoes = S.echoes || [];
  const e = { from: { x: seg.from.x, z: seg.from.z }, to: { x: seg.to.x, z: seg.to.z }, t: CFG.echoCard.delay || 0.5, mul: (CFG.echoCard.mul || [0.4, 0.55, 0.7])[Math.min(2, lv - 1)] };
  S.echoes.push(e);
  return e;
}
function stepEchoes(dt) {
  if (!S.echoes || !S.echoes.length) return;
  const out = [];
  S.echoes.forEach(function (e) {
    e.t -= dt;
    if (e.t > 0) { out.push(e); return; }
    if (Math.hypot(e.to.x - S.hero.x, e.to.z - S.hero.z) > ringR() * 2.4) return;
    stampSkill('echo', e.to.x, e.to.z);
    const r = pathR(), dmg = dashDmg() * e.mul;
    S.zombies.slice().forEach(function (z) {
      if (!z.alive || z.isClone || z.isPillar || z.isTotem) return;
      if (segDist(z.x, z.z, e.from.x, e.from.z, e.to.x, e.to.z) > r + z.r) return;
      hurtZombie(z, dmg, 'echo', S.lastDash);
    });
    inkFx.burst(e.to.x, e.to.z, FX_COLORS.jade, { r1: 26, n: 4, dur: 0.3 });
    if (S.lastDash && S.lastDash.segs) S.lastDash.echo = e.mul;
  });
  S.echoes = out;
}
/* 먹 발자국: 착지 자리에 2초 웅덩이 — 지나는 적이 느려진다. */
function dropInkStep(at) {
  const lv = upLv('inkstep');
  if (!lv || !at || !S) return null;
  S.inkSteps = S.inkSteps || [];
  S.inkSteps.push({ x: at.x, z: at.z, t: CFG.inkStep.dur || 2, r: CFG.inkStep.r || 1.7, slow: (CFG.inkStep.slow || [0.3, 0.4, 0.5])[Math.min(2, lv - 1)] });
  if (S.inkSteps.length > 14) S.inkSteps.shift();
  return S.inkSteps[S.inkSteps.length - 1];
}
function stepInkSteps(dt) {
  if (!S.inkSteps || !S.inkSteps.length) return;
  S.inkSteps.forEach(function (p) {
    p.t -= dt;
    if (p.t <= 0) return;
    S.zombies.forEach(function (z) {
      if (!z.alive || z.isBoss || z.isClone || z.isPillar || z.isTotem) return;
      if (dist(z, p) > p.r + z.r) return;
      z.slowT = Math.max(z.slowT || 0, 0.22);
      z.inkSlow = p.slow;
    });
  });
  S.inkSteps = S.inkSteps.filter(function (p) { return p.t > 0; });
}
/** 원귀가 사라지거나 상태가 끝나면 먹 발자국 감속도 함께 끝난다. */
function slowMulOf(z) {
  if (!z || !(z.slowT > 0)) return 1;
  if (z.inkSlow) return 1 - z.inkSlow;
  return CFG.iceSlowMul || 0.5;
}
function gainXp(n) {
  S.xp += n;
  while (S.xp >= xpNeed(S.level)) {
    S.xp -= xpNeed(S.level);
    S.level++;
    /* §5.1 혼령 상한은 2레벨마다 +1 — 장마다 시작값 차이를 오래 남긴다. */
    if (S.level % 2 === 0) S.spiritCap = Math.min(CFG.spiritMax || 5, (S.spiritCap || CFG.spiritCapStart || 3) + 1);
    openLevelUp();
  }
}
/* v0.23 카드 UI: 지금 레벨과 다음 레벨의 실제 수치를 카드에 적는다. */
function elemScale(base, step, lv) { return base + step * Math.max(0, (lv || 0) - 1); }
function fmt1(v) { return (Math.round(v * 10) / 10).toString(); }
function upDesc(u) {
  const next = upLv(u.id) + 1;
  if (u.id === 'ring') {
    const nextLv = Math.min(CFG.ringLvMax || 3, upLv('ring') + 1);
    return '심안 반경 Lv' + (S.ringLv || 0) + ' → Lv' + nextLv + (nextLv >= (CFG.ringLvMax || 3) ? ' (최대)' : '');
  }
  if (u.id === 'ice') return '빙결 ' + fmt1(elemScale(CFG.iceDur || 2.5, CFG.iceDurStep || 0.5, next)) + '초 · 파열 '
    + fmt1(elemScale(CFG.shatterDmg || 4, CFG.shatterStep || 1, next)) + ' 피해';
  if (u.id === 'fire') return '명중 즉시 +' + fireImpact(next) + ' 피해';
  if (u.id === 'poison') return '중첩 ' + Math.round(elemScale(CFG.poisonMax || 5, CFG.poisonMaxStep || 1, next)) + ' · 독구름 '
    + fmt1(elemScale(CFG.poisonCloudR || 2, CFG.cloudRStep || 0.6, next)) + 'm';
  if (u.id === 'perfect') return '정확도 ' + Math.round(((CFG.perfectThresh || 0.8) - (CFG.perfectThreshStep || 0.05) * (next - 1)) * 100)
    + '% 이상이면 ×' + fmt1((CFG.perfectDmgMul || 1.5) + (CFG.perfectStep || 0.15) * (next - 1));
  if (u.id === 'parry') return '패링 반경 ' + fmt1((CFG.parryR || 2.4) + (CFG.parryAwakenR || 0.45) * next) + 'm · 충격파 '
    + fmt1((CFG.parryDmg || 0.5) + (CFG.parryAwakenDmg || 0.4) * next) + ' · 참 +' + Math.round((CFG.parryAwakenCharge || 14) * next);
  if (u.id === 'dmg') { const st = (u.steps || [1])[Math.min((u.steps || [1]).length - 1, upLv('dmg'))]; return '일섬 피해 ' + fmt1(S.dashDmg) + ' → ' + fmt1(S.dashDmg + st); }
  if (u.id === 'width') return '경로 폭 ' + fmt1(S.pathR) + ' → ' + fmt1(S.pathR + 0.55) + 'm';
  if (u.id === 'dash') return '연쇄 ' + S.dashCount + ' → ' + (S.dashCount + 1) + '회';
  if (u.id === 'charge') return '게이지 획득 +' + Math.round(25 * next) + '%';
  if (u.id === 'heal') return (S.healMaxN || 0) < 3 ? '체력 +5 · 최대 체력 +2 (' + (S.healMaxN || 0) + '/3)' : '체력 +5 (최대 체력은 3번까지)';
  if (u.id === 'ward') {
    const lv = Math.min(3, upLv('ward') + 1);
    return '부적 ' + (lv >= 3 ? (CFG.ward.n3 || 4) : (CFG.ward.n || 2)) + '개 · 반경 ' + fmt1(lv >= 2 ? (CFG.ward.r2 || 2.6) : (CFG.ward.r || 2.2)) + 'm · 접촉 ' + fmt1(CFG.ward.dmg || 0.8);
  }
  if (u.id === 'bolt') {
    const lv = Math.min(CFG.boltCard.lvMax || 5, upLv('bolt') + 1);
    return '주기 ' + fmt1(Math.max(2.5, (CFG.boltCard.every || 4.5) - (CFG.boltCard.lvStep || 0.4) * (lv - 1))) + '초 · 피해 ' + fmt1(CFG.boltCard.dmg || 2.2);
  }
  if (u.id === 'echo') { const m = (CFG.echoCard.mul || [0.4, 0.55, 0.7])[Math.min(2, upLv('echo'))]; return '일섬 ' + CFG.echoCard.delay + '초 뒤 같은 길에 ' + Math.round(m * 100) + '% 피해'; }
  if (u.id === 'reson') { const d = (CFG.resonCard.dmg || [0.5, 0.8, 1.1])[Math.min(2, upLv('reson'))]; return '방울 피해 ' + fmt1(d); }
  if (u.id === 'counter') return '정확한 패링 → 자동 일섬 1회';
  if (u.id === 'inkstep') { const sl = (CFG.inkStep.slow || [0.3, 0.4, 0.5])[Math.min(2, upLv('inkstep'))]; return '먹 웅덩이 · 감속 ' + Math.round(sl * 100) + '% · 2초'; }
  return u.desc;
}
function upCardLevelText(u) {
  const lv = upLv(u.id);
  if (!lv) return '신규';
  return 'Lv' + lv + ' → Lv' + Math.min(u.maxLv || 99, lv + 1);
}
/* ---------- v0.31 §5.2 멈추지 않는 선택 ----------
   레벨업이 판을 멈추지 않는다. 0.3배 1.5초 + 화면 아래 카드 3장, 4초 안에 탭하면 고르고 아니면 추천이 자동 선택된다.
   보스전과 부적 상자(3연속)는 지금처럼 멈추는 창을 쓴다. 설정에서 '멈추고 고르기'로 되돌릴 수 있다. */
function rollPicks(n) {
  const pool = RUN_UPGRADES.filter(function (u) { return (S.upLv[u.id] || 0) < (u.maxLv || 99); }), picks = [];
  for (let i = 0; i < (n || 3) && pool.length; i++) {
    const k = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(k, 1)[0]);
  }
  return picks;
}
/* 진화 레시피의 재료 목록 — 각인은 elemLv, 카드는 upLv로 센다. */
function evoParts(r) {
  const parts = [];
  (r.a || []).forEach(function (k) { parts.push({ k: k, lv: r.aLv || 1 }); });
  if (r.b) parts.push({ k: r.b, lv: r.bLv || 1 });
  return parts;
}
function isElemKey(k) { return k === 'ice' || k === 'fire' || k === 'poison'; }
function partLv(k) { return isElemKey(k) ? elemLv(k) : upLv(k); }
function cardNameOf(k) {
  const u = RUN_UPGRADES.filter(function (x) { return x.id === k; })[0];
  if (u) return u.name;
  return isElemKey(k) ? elemNameOf(k) + ' 각인' : k;
}
function evoBorn(r) { return !!(S && S.evo && S.evo[r.key]); }
/** 이 카드를 집으면 짝이 다 갖춰진 진화의 재료가 되는가 → 진화 이름 목록. */
function evoMatInfo(id) {
  if (!S) return [];
  return EVO_RECIPES.filter(function (r) {
    if (evoBorn(r)) return false;
    const parts = evoParts(r);
    const mine = parts.filter(function (p) { return p.k === id; })[0];
    if (!mine || partLv(id) >= mine.lv) return false;
    return parts.every(function (p) { return p.k === id || partLv(p.k) >= p.lv; });
  }).map(function (r) { return r.name; });
}
function evoHints() {
  if (!S) return [];
  return EVO_RECIPES.filter(function (r) {
    if (evoBorn(r)) return false;
    return evoParts(r).some(function (p) { return partLv(p.k) > 0; });
  }).map(function (r) {
    const parts = evoParts(r);
    return {
      key: r.key, name: r.name, done: parts.every(function (p) { return partLv(p.k) >= p.lv; }),
      text: r.name + ': ' + parts.map(function (p) {
        return cardNameOf(p.k) + (partLv(p.k) >= p.lv ? ' ✓' : ' Lv' + partLv(p.k) + '/' + p.lv);
      }).join(' · ')
    };
  });
}
function renderEvoHint() {
  const el = $('evoHint');
  if (!el) return null;
  const hs = evoHints();
  if (!hs.length) { el.hidden = true; el.textContent = ''; return null; }
  hs.sort(function (a, b) { return (b.done ? 1 : 0) - (a.done ? 1 : 0); });
  el.hidden = false;
  el.textContent = '진화까지 — ' + hs.slice(0, 2).map(function (h) { return h.text; }).join(' / ');
  return el.textContent;
}
/** 4초가 지나면 고르는 카드: 진화 재료 → 빌드에 없는 카드 → 무작위. */
function recommendedPick() {
  if (!S) return null;
  const picks = (S.levelPicks || []).slice();
  if (!picks.length) return null;
  const mat = picks.filter(function (u) { return evoMatInfo(u.id).length; });
  if (mat.length) return mat[0].id;
  const fresh = picks.filter(function (u) { return !upLv(u.id); });
  if (fresh.length) return fresh[0].id;
  return picks[Math.floor(Math.random() * picks.length)].id;
}
function closeQuickCards() {
  const wrap = $('quickCards');
  if (wrap) wrap.hidden = true;
  if (S) S.quick = null;
}
function tickQuick() {
  if (!S || !S.quick) return;
  if (now() - S.quick.t0 < S.quick.dur) return;
  const id = recommendedPick();
  if (id) pickQuick(id, true);
  else closeQuickCards();
}
function pickQuick(id, auto) {
  if (!S || !S.quick) return false;
  closeQuickCards();
  applyUpgrade(id, !!auto);
  if (S && S._pendingLv > 0) { S._pendingLv--; openLevelUp(); }
  return true;
}
function openLevelUp() {
  /* 참(斬) 연출 중에는 카드를 잠시 미룬다 — 필살의 손맛을 가리지 않도록. */
  if (S && S.cleaveFx > 0.05) { S._cleaveLv = (S._cleaveLv || 0) + 1; return; }
  if (!S) return;
  S.upLv = S.upLv || {};
  S.levelUps = (S.levelUps || 0) + 1;
  if (S.paused === 'levelup') { S._pendingLv = (S._pendingLv || 0) + 1; return; }
  S.paused = 'levelup';
  S.levelPicks = rollPicks(3);
  const boxEl = $('levelChoices'); boxEl.innerHTML = '';
  S.levelPicks.forEach(function (u) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn up-card' + (evoMatInfo(u.id).length ? ' evo-mat' : '');
    b.dataset.up = u.id;
    const icon = (art && art.upIconUrl) ? art.upIconUrl(u.id) : '';
    const mat = evoMatInfo(u.id);
    b.innerHTML = '<img class="up-icon" src="' + icon + '" alt="" width="34" height="34">'
      + '<span class="up-text"><strong>' + u.name + '</strong>'
      + '<span class="up-lv' + (upLv(u.id) ? '' : ' new') + '">' + upCardLevelText(u) + '</span>'
      + '<span class="up-desc">' + upDesc(u) + '</span>'
      + (mat.length ? '<span class="up-evo">진화 재료 — ' + mat.join(' · ') + '</span>' : '') + '</span>';
    b.addEventListener('click', function () { pickUpgrade(u.id); });
    boxEl.appendChild(b);
  });
  renderEvoHint();
  showOv('ov-level');
  telemetry.event('levelup_pause', { level: S.level, picks: S.levelPicks.map(function (u) { return u.id; }) });
}
const UPGRADE_FX = { dmg: 'vermilion', width: 'jade', dash: 'jade', ring: 'paper', charge: 'gold', heal: 'vermilion', perfect: 'gold', parry: 'paper', ice: 'ice', fire: 'fire', poison: 'poison', bell: 'gold', ward: 'gold', bolt: 'gold', echo: 'jade', reson: 'paper', counter: 'gold', inkstep: 'paper' };
/* The chosen upgrade stamps over the hero, and the ones that change space show the change. */
function upgradeFx(id) {
  const def = RUN_UPGRADES.filter(function (u) { return u.id === id; })[0];
  const c = FX_COLORS[UPGRADE_FX[id] || 'paper'];
  inkFx.seal(((def && def.name) || id) + ' Lv' + ((S.upLv && S.upLv[id]) || 1), c);
  if (id === 'width') {
    const d = S.lastDash && S.lastDash.segs && S.lastDash.segs.length ? S.lastDash.segs[S.lastDash.segs.length - 1] : null;
    let dx = 1, dz = -1;
    if (d && d.to && d.from) { dx = d.to.x - d.from.x; dz = d.to.z - d.from.z; }
    const L = Math.hypot(dx, dz) || 1;
    inkFx.band({ x: dx / L, z: dz / L }, pathR(), ringR() * 1.3, c);
  } else if (id === 'ring') inkFx.ring(ringR(), c, 1.0);
  else if (id === 'dash' || id === 'ice' || id === 'fire' || id === 'poison') inkFx.ring(2.2, c, 0.7);
}
function pickUpgrade(id) {
  if (!S || S.paused !== 'levelup') return false;
  hideOvs(); S.paused = null;
  applyUpgrade(id, false);
  if (S._pendingLv) { S._pendingLv--; openLevelUp(); }
  else S.forcePauseLv = false;
  return true;
}
/* 카드 하나를 실제로 적용한다 — 멈추는 창과 멈추지 않는 선택이 같은 길을 쓴다. */
function applyUpgrade(id, auto) {
  if (!S) return false;
  S.upLv = S.upLv || {};
  const def = RUN_UPGRADES.filter(function (u) { return u.id === id; })[0];
  if (!def || (S.upLv[id] || 0) >= (def.maxLv || 99)) return false;
  S.upLv[id] = (S.upLv[id] || 0) + 1;
  /* §13 데이터: 제시 3장·고른 카드·레벨 — 카드 선택률(밸런스)을 나중에 잴 수 있게. */
  telemetry.event('card_pick', {
    offered: (S.levelPicks || []).map(function (u) { return u.id; }), picked: id, lv: S.upLv[id], auto: !!auto
  });
  if (id === 'dmg') {
    /* §5.1 체감식: +1, +0.8, +0.6, +0.5, 이후 +0.4 */
    const steps = def.steps || [1];
    S.dashDmg = Math.round((S.dashDmg + steps[Math.min(steps.length - 1, S.upLv[id] - 1)]) * 100) / 100;
  }
  else if (id === 'width') S.pathR += 0.55;
  else if (id === 'dash') S.dashCount += 1;
  else if (id === 'ring') { S.ringLv = Math.min(CFG.ringLvMax || 3, (S.ringLv || 0) + 1); applyRingBoost(); }
  else if (id === 'heal') {
    /* §5.1 최대 체력 +2는 3번까지, 그 뒤는 회복만 */
    if ((S.healMaxN || 0) < 3) { S.runHp += 2; S.healMaxN = (S.healMaxN || 0) + 1; }
    S.hp = Math.min(maxHp(), S.hp + 5);
  }
  else if (id === 'wealth') S.runCoin += 0.25;
  else if (id === 'ice' || id === 'fire' || id === 'poison') {
    /* v0.23 원소 각인: 처음 고르면 원소 장착, 다시 고르면 Lv2·Lv3으로 수치가 실제로 오른다. */
    S.elemLv = S.elemLv || {};
    S.elemLv[id] = Math.min(CFG.elemLvMax || 3, (S.elemLv[id] || 0) + 1);
    setDashElem(id);
    /* §5.4 두 번째 원소 칸: 한 각인이 Lv2가 되면 열리고, 일섬마다 두 원소가 번갈아 실린다. */
    refreshElemSlots();
    toast(elemNameOf(id) + ' 각인 Lv' + S.elemLv[id] + ((S.elemSlots || []).length >= 2 ? ' — 두 원소 교대' : ''));
  }
  else if (id === 'perfect') { toast('정확한 획 Lv' + S.upLv.perfect); }
  else if (id === 'parry') { toast('칼집 각성 Lv' + S.upLv.parry); }
  else if (id === 'bell') { /* 진화(만종)를 먼저 판정해야 첫 종부터 12초가 된다. */
    checkEvolutions({ bell: true });
    startBell(null, (S.evo && S.evo.myriadBell) ? (CFG.bellMyriadDur || 12) : CFG.bellDur);
  }
  else if (id === 'magnet') S.magnetR = Math.min(CFG.magnetMax || 3.8, (S.magnetR || CFG.magnetR || 2.2) + (CFG.magnetStep || 0.6));
  else if (id === 'charge') S.chargeLv = (S.chargeLv || 0) + 1;
  else if (id === 'ward') { S.wardSpin = S.wardSpin || 0; showJudge('회전 호신부 Lv' + S.upLv.ward); }
  else if (id === 'bolt') { S.boltT = boltPeriod(); showJudge('벼락부적 Lv' + S.upLv.bolt); }
  else if (id === 'echo') { toast('메아리 칼 Lv' + S.upLv.echo); }
  else if (id === 'reson') { toast('방울 공명 Lv' + S.upLv.reson); }
  else if (id === 'counter') { toast('칼집 반격 Lv' + S.upLv.counter); }
  else if (id === 'inkstep') { toast('먹 발자국 Lv' + S.upLv.inkstep); }
  upgradeFx(id);
  renderHud();
  checkEvolutions();
  return true;
}

/* 보스 돌진 예고(walk → telegraph → charge → stun) 상태기계. 이동을 직접 처리했으면 true.
   스테이지가 오르면 예고가 짧아지고 돌진이 빨라지며, 뒤로 갈수록 경직 뒤에 잔몹을 부른다. */
/** The stage's boss timings (seconds) and charge speed (m/s), with the shared defaults. */
function bossTiming() {
  const B = (S && S.stage && S.stage.boss) || {};
  return {
    walkT: B.walk != null ? B.walk : 4.5,
    teleT: B.telegraph != null ? B.telegraph : 1.1,
    chargeSp: B.charge != null ? B.charge : 20,
    chargeT: B.chargeDur != null ? B.chargeDur : 0.45,
    stunT: B.stun != null ? B.stun : 1.2
  };
}
function stepBoss(z, dt) {
  if (!z || !z.alive || !S) return false;
  const B = (S.stage && S.stage.boss) || {};
  const bt = bossTiming();
  const walkT = bt.walkT, teleT = bt.teleT, chargeSp = bt.chargeSp, chargeT = bt.chargeT, stunT = bt.stunT;
  z.state = z.state || 'walk';
  z.stateT = (z.stateT || 0) + dt;
  if(z.state==='sealing'){ if(z.stateT>.8) killZombie(z,S.lastDash); return true; }
  if(!z.hp || z.openUntil>S.elapsed) return true;
  const pats = bossPatList(z);
  if (pats) {
    if (z.cue) z.cue.t += dt;
    const h = stepBossPat(z, dt);
    if (h !== null) return h;
  }
  if (z.state === 'walk') {
    /* A parry or landing stun holds the boss in place and pauses its walk clock; telegraph and charge are not interrupted. */
    if ((z.stun || 0) > 0) z.stateT -= dt;
    /* §4.2 빈틈 고리: 다 차면 하얗게 빛나며 짧은 방울 소리가 난다 — '지금이다'를 소리와 빛으로 같이 알린다. */
    if (z.gapFlashT > 0) z.gapFlashT = Math.max(0, z.gapFlashT - dt);
    if (!z.firstWalk) {
      const g = gapInfo(z);
      if (g.open && (z.gapRangAt == null || (S.elapsed - z.gapRangAt) >= (CFG.gapPeriod || 1.6) - 0.02)) {
        z.gapRangAt = S.elapsed; z.gapFlashT = CFG.gapFlash || 0.5;
        if (audio && !z.stun) audio.bell(0, 'hline');
      }
    } else z.gapRangAt = null;
    if (pats) {
      if (z.stateT > (bossPat().walk || walkT)) nextBossPattern(z);
      return false;
    }
    if (z.stateT > walkT) {
      z.state = 'telegraph'; z.stateT = 0;
      z.aim = { x: S.hero.x, z: S.hero.z };
      /* 장판은 예고와 함께 깔려, 경직(반격 구간)이 오기 전에 모두 터진다. */
      bossHazards(z);
      if (audio) audio.drum();
    }
    return false;
  }
  if (z.state === 'telegraph') {
    const durT = teleT * (z.teleMul || 1);
    if (!z._warnTicked && z.stateT >= durT * 0.78) {
      z._warnTicked = true;
      if (audio && audio.bell) audio.bell(0, 'vline');
    }
    if (z.stateT > durT) {
      z.state = 'charge'; z.stateT = 0; z._trailT = 0; z._warnTicked = false;
      const dx = (z.aim ? z.aim.x : S.hero.x) - z.x, dz = (z.aim ? z.aim.z : S.hero.z) - z.z;
      const L = Math.hypot(dx, dz) || 1;
      z.chargeDir = { x: dx / L, z: dz / L };
      if (audio) { if (audio.bossCharge) audio.bossCharge(); else audio.slash(); }
      const reach = Math.min(8.5, chargeSp * chargeT);
      makeBossSlash({ x: z.x, z: z.z }, { x: z.x + z.chargeDir.x * reach, z: z.z + z.chargeDir.z * reach }, { width: 3.1, height: 0.95 });
      bossFx.pushChargePoint(z.x, z.z);
    }
    return true;
  }
  if (z.state === 'charge') {
    const sp = chargeSp;
    z.x += (z.chargeDir ? z.chargeDir.x : 0) * sp * dt;
    z.z += (z.chargeDir ? z.chargeDir.z : 0) * sp * dt;
    /* 결계 벽에 막히는 돌진 — 밖으로 빠져나가 영웅을 놓치는 일이 없다. */
    const ca = clampPointToArena(z.x, z.z, 1.3);
    z.x = ca.x; z.z = ca.z;
    z._trailT = (z._trailT || 0) + dt;
    if (z._trailT >= 0.028) {
      z._trailT = 0;
      bossFx.pushChargePoint(z.x, z.z);
      if (three && three.ink && three.ink.hit && z.chargeDir) three.ink.hit(z.x, z.z, z.chargeDir.x, z.chargeDir.z);
    }
    /* 패턴 보스: 돌진을 일섬으로 스치듯 피하면 간발 — 기세가 꺾인다. */
    if (pats && S.dash && !z.dodged && dist(z, S.hero) < z.r + (bossPat().dodgeR || 1.4)) { z.dodged = true; bossJustDodge(z); }
    if ((S.iframe || 0) <= 0 && !S.dash && dist(z, S.hero) < z.r + 0.7) {
      if (mirrorSave('boss-charge')) return true;
      noteHit();
      S.hp -= modeDmg(CFG.bossDmg || 2) + relicDmgAdd();
      S.iframe = CFG.iframeMs / 1000;
      S.hurtFlash = CFG.hurtVignette || 0.3;
      const d = dist(z, S.hero) || 1;
      S.hero.x += (S.hero.x - z.x) / d * 2.2;
      S.hero.z += (S.hero.z - z.z) / d * 2.2;
      if (three && three.heroSpr) placeGroup(three.heroSpr, S.hero.x, S.hero.z);
      if (audio) audio.drum();
      renderHud();
      if (S.hp <= 0) endRun(false, '귀물의 돌진에 닿았습니다.');
    }
    if (z.stateT > chargeT) {
      /* v0.52 다단 패턴: 2페이즈 또는 4장 이상에서는 돌진 끝자락에 언월 검기 파동을 한 번 더 날린다 */
      if ((z.phase2 || (S.stageNo || 1) >= 4) && z.chargeDir) {
        const ang = Math.atan2(z.chargeDir.z, z.chargeDir.x);
        bossFx.triggerSweepBurst(z.x, z.z, ang, 5.2);
        spawnBossWave(z, ang);
      }
      z.state = 'stun'; z.stateT = 0;
    }
    return true;
  }
  if (z.state === 'stun') {
    if (z.stateT > (z.stunT || stunT)) {
      z.state = 'walk'; z.stateT = 0; z.stunT = 0;
      /* 스테이지 3 이후: 경직이 끝나면 잔몹을 부른다. */
      const adds = B.adds || 0;
      if (adds > 0 && !z.summoned) {
        z.summoned = true;
        for (let i = 0; i < adds; i++) {
          const a = (i / adds) * Math.PI * 2 + Math.random() * 0.4;
          spawnZombie({ x: z.x + Math.cos(a) * 2.2, z: z.z + Math.sin(a) * 2.2, type: 'imp' });
        }
        toast('원혼이 부른 귀물');
        if (audio) audio.drum();
      }
    }
    return true;
  }
  return false;
}
/* ---------- v0.23 후반 장 변주 적 ----------
   charger: 몸을 낮추고 곧장 달려든다. thrower: 거리를 두고 부적을 던진다.
   bomber: 붙으면 부풀어 터진다. 셋 다 몸빛(테두리)으로 미리 구분된다. */
function stepEnemySpecial(z, dt, d, frozen, zsp) {
  if (!S || z.isBoss || frozen) return false;
  const kd = CFG.zombieTypes[z.type];
  if (!kd) return false;
  /* Same walking rule as the basic kinds: tempo, early slow-down, ice slow, and a stop while flinching. */
  const sp = z.flinchT > 0 ? 0 : zsp * kd.speed * slowMulOf(z) * terrainSlowMul(z);
  const ux = (S.hero.x - z.x) / (d || 1), uz = (S.hero.z - z.z) / (d || 1);
  if (kd.dashSpeed) {
    z.dashCd = (z.dashCd || 0) - dt;
    if ((z.dashPhase || 0) > 0) {
      z.dashPhase -= dt;
      z.x += ux * kd.dashSpeed * dt;
      z.z += uz * kd.dashSpeed * dt;
      return true;
    }
    /* Crouch first: it stands still with a red rim, then runs. */
    if ((z.windT || 0) > 0) {
      z.windT -= dt;
      if (z.windT <= 0) z.dashPhase = kd.dashT || 0.3;
      return true;
    }
    if (z.dashCd <= 0 && d < (kd.dashRange || 7.5) && d > 1.1) {
      z.dashCd = kd.dashCd || 3.4;
      z.windT = kd.windT || 0.35;
      if (audio && !qa.noDelay && audio.drum) audio.drum();
      return true;
    }
    z.x += ux * sp * dt; z.z += uz * sp * dt;
    return true;
  }
  if (kd.throwRange) {
    z.throwCd = (z.throwCd || 0) - dt;
    if (z.throwCd <= 0 && d < kd.throwRange && d > 2.0) {
      z.throwCd = kd.throwCd || 2.9;
      spawnShot(z);
      return true;
    }
    if (d > (kd.hold || 4.6)) { z.x += ux * sp * dt; z.z += uz * sp * dt; }
    else if (d < (kd.hold || 4.6) * 0.72) { z.x -= ux * sp * 0.8 * dt; z.z -= uz * sp * 0.8 * dt; }
    return true;
  }
  if (kd.blastR) {
    if ((z.fuse || 0) > 0) {
      z.fuse -= dt;
      if (z.fuse <= 0) { bomberBlast(z); return true; }
      return true;
    }
    if (d < (kd.fuseR || 2.0)) { z.fuse = kd.fuse || 0.85; showJudge('자폭!'); return true; }
    z.x += ux * sp * dt; z.z += uz * sp * dt;
    return true;
  }
  return false;
}
/* §7.4 별 2: 피해 횟수 — 맞은 횟수를 센다(피격 3회 이하면 별 2). */
function noteHit() { if (S) S.hits = (S.hits || 0) + 1; }
/* §9.4 청동 거울: 판당 첫 피격 1회 무효. */
function mirrorSave(why) {
  if (!relicOn(save, 'mirror') || !S || S.mirrorUsed) return false;
  S.mirrorUsed = true;
  S.iframe = Math.max(S.iframe || 0, CFG.iframeMs / 1000);
  S.goldEdge = Math.max(S.goldEdge || 0, 0.2);
  showJudge('거울이 막았다');
  if (audio && audio.parry) audio.parry();
  telemetry.event('relic', { id: 'mirror', stage: S.stageNo, why: why || null });
  return true;
}
/* §9.4 거꾸로 된 탑: 받는 피해 +1 */
function relicDmgAdd() { return relicOn(save, 'tower') ? 1 : 0; }
function heroHurt(n, why) {
  if (!S || !S.playing) return;
  if ((S.iframe || 0) > 0 || S.dash) return;
  if (mirrorSave(why)) return;
  noteHit();
  /* v0.30 §7.2: 모드별 받는 피해(수련 ×0.5 최소 1 · 고수 ×1.5). */
  S.hp -= modeDmg(n) + relicDmgAdd();
  if (S.hp <= 0) S.deathWhy = why || '귀물에게 닿았습니다.';
  S.iframe = CFG.iframeMs / 1000;
  S.hurtFlash = CFG.hurtVignette || 0.3;
  S.hitstop = Math.max(S.hitstop || 0, CFG.hitHitstop || 0.08);
  if (three && three.heroSpr && art.kickChar) art.kickChar(three.heroSpr, 1);
  const app = $('app');
  if (app) app.classList.add('hurt');
  if (audio && audio.drum) audio.drum();
  renderHud();
  if (S.hp <= 0) endRun(false, why || '귀물에게 닿았습니다.');
}
function bomberBlast(z) {
  const kd = CFG.zombieTypes.bomber || {};
  const R = kd.blastR || 2.7;
  if (art && art.playFx && three) {
    const fx = art.playFx(three.scene, 'ink-splat', z.x, z.z, R);
    if (fx) three.fx.push(fx);
  }
  S.shake = Math.max(S.shake || 0, 0.5);
  if (S.hero && Math.hypot(S.hero.x - z.x, S.hero.z - z.z) <= R + 0.5) heroHurt(kd.blastDmg || 2, '자폭하는 귀물에 닿았습니다.');
  S.zombies.forEach(function (o) {
    if (o === z || !o.alive || o.isBoss) return;
    if (dist(o, z) <= R + o.r) hurtZombie(o, 2, 'bomb', S.lastDash);
  });
  hurtZombie(z, 999, 'bomb', S.lastDash);
}
/* ---------- 투척 부적 ----------
   탄·장판·불꽃 잔불·반사패 재질은 하나씩만 만들어 쓴다(같은 재질 = 같은 셰이더 프로그램). */
let _shotMat = null, _shotGeo = null, _shotGoldMat = null, _hazGeo = null, _trailMat = null;
function shotGeo() {
  if (!_shotGeo) _shotGeo = new THREE.SphereGeometry(0.22, 8, 6);
  return _shotGeo;
}
function shotMaterial() {
  if (!_shotMat) _shotMat = new THREE.MeshBasicMaterial({ color: 0xc9a6ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  return _shotMat;
}
function goldShotMaterial() {
  if (!_shotGoldMat) _shotGoldMat = new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  return _shotGoldMat;
}
function hazardGeo() {
  if (!_hazGeo) _hazGeo = new THREE.CircleGeometry(1, 28);
  return _hazGeo;
}
/* 화염 일섬이 남기는 잔불 바닥 */
function trailMaterial() {
  if (!_trailMat) _trailMat = new THREE.MeshBasicMaterial({
    map: art && art.trailTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  return _trailMat;
}
/* v0.34 §14 오브젝트 풀: 부적 탄은 최대 24개를 돌려 쓴다(최대 개수 고정). */
const SHOT_POOL_MAX = 24;
const shotPool = [];
function takeShotMesh() {
  let m = shotPool.pop();
  if (!m) {
    m = new THREE.Mesh(shotGeo(), shotMaterial());
    m.userData.pooled = true;
  }
  m.visible = true;
  m.material = shotMaterial();
  if (m.parent !== three.scene) three.scene.add(m);
  return m;
}
function releaseShotMesh(m) {
  if (!m) return;
  m.visible = false;
  if (shotPool.length < SHOT_POOL_MAX) shotPool.push(m);
  else if (m.parent) m.parent.remove(m);
}
function spawnShot(from) {
  if (!S || !three) return null;
  /* §14 풀 상한: 부적 탄은 화면에 최대 24개 — 넘으면 가장 오래된 탄을 회수한다. */
  while (S.shots.length >= SHOT_POOL_MAX) {
    const old = S.shots.shift();
    if (old && old.mesh) releaseShotMesh(old.mesh);
  }
  const kd = CFG.zombieTypes.thrower || {};
  const mesh = takeShotMesh();
  mesh.position.set(from.x, 0.75, from.z);
  const d = Math.hypot(S.hero.x - from.x, S.hero.z - from.z) || 1;
  const shot = {
    x: from.x, z: from.z,
    vx: (S.hero.x - from.x) / d * (kd.shotSpeed || CFG.shotSpeed || 7.2),
    vz: (S.hero.z - from.z) / d * (kd.shotSpeed || CFG.shotSpeed || 7.2),
    t: 0, life: CFG.shotLife || 3.2, mesh: mesh
  };
  S.shots.push(shot);
  return shot;
}
function stepShots(dt) {
  if (!S || !S.shots || !S.shots.length) return;
  S.shots = S.shots.filter(function (sh) {
    sh.t += dt;
    if (sh.reflect) {
      const fly = stepReflectedShot(sh, dt);
      if (!fly && sh.mesh) { releaseShotMesh(sh.mesh); sh.mesh = null; }
      return fly;
    }
    sh.x += sh.vx * dt;
    sh.z += sh.vz * dt;
    if (sh.mesh) { sh.mesh.position.set(sh.x, 0.75, sh.z); sh.mesh.rotation.y += dt * 6; }
    /* One reach for hit and vanish. A dashing hero cuts the charm out of the air instead. */
    const reached = Math.hypot(S.hero.x - sh.x, S.hero.z - sh.z) <= (sh.r || CFG.shotR || 0.42) + 0.55;
    if (reached) {
      if (S.dash) inkFx.burst(sh.x, sh.z, FX_COLORS.poison, { r1: 30, n: 6, dur: 0.35 });
      else if ((S.iframe || 0) <= 0) heroHurt(sh.dmg || CFG.shotDmg || 1, sh.isWave ? '언월 검기에 베였습니다.' : '부적에 맞았습니다.');
    }
    const dead = sh.t >= sh.life || reached;
    if (dead && sh.mesh) { releaseShotMesh(sh.mesh); sh.mesh = null; }
    return !dead;
  });
}
/* ---------- 보스 다중 장판 ---------- */
/* v0.34 §14: 장판도 풀에서 꺼내 쓴다(재질을 새로 만들지 않는다). */
const HAZARD_POOL_MAX = 12;
const hazardPool = [];
function takeHazardMesh() {
  let h = hazardPool.pop();
  if (!h) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(hazardGeo(), mat);
    mesh.rotation.x = -Math.PI / 2;
    h = { mesh: mesh, mat: mat };
  }
  h.mat.opacity = 0.34;
  h.mesh.visible = true;
  if (h.mesh.parent !== three.scene) three.scene.add(h.mesh);
  return h;
}
function releaseHazardMesh(mesh, mat) {
  if (mesh) { mesh.visible = false; if (hazardPool.length < HAZARD_POOL_MAX) hazardPool.push({ mesh: mesh, mat: mat }); else if (mesh.parent) mesh.parent.remove(mesh); }
}
function spawnHazard(x, z, r, delay) {
  if (!S || !three) return null;
  /* §14 풀 상한: 장판 12개 — 넘으면 가장 오래된 장판을 회수한다. */
  while (S.hazards.length >= HAZARD_POOL_MAX) {
    const old = S.hazards.shift();
    if (old && old.mesh) releaseHazardMesh(old.mesh, old.mat);
  }
  const R = r || CFG.hazardR || 2.5;
  const taken = takeHazardMesh();
  const mat = taken.mat, mesh = taken.mesh;
  mesh.position.set(x, 0.06, z);
  mesh.scale.set(R, R, 1);
  const h = { x: x, z: z, r: R, t: 0, delay: delay != null ? delay : (CFG.hazardDelay || 1.05), done: false, mesh: mesh, mat: mat, life: CFG.hazardLife || 2.6 };
  S.hazards.push(h);
  return h;
}
function stepHazards(dt) {
  if (!S || !S.hazards || !S.hazards.length) return;
  S.hazards.slice().forEach(function (h) {
    h.t += dt;
    const u = Math.min(1, h.t / Math.max(0.01, h.delay));
    if (h.mesh) {
      h.mat.opacity = 0.18 + 0.34 * u;
      const s = h.r * (0.72 + 0.28 * u);
      h.mesh.scale.set(s, s, 1);
    }
    if (!h.done && h.t >= h.delay) {
      h.done = true;
      h.t = 0;
      bossFx.triggerHazardBlast(h.x, h.z, h.r);
      if (audio) audio.explode();
      if (three && three.lights) three.lights.burst(h.x, 1.0, h.z, { color: 0xe64532, intensity: 4.5, duration: 0.35 });
      if (art && art.playFx) {
        const fx = art.playFx(three.scene, 'ink-splat', h.x, h.z, h.r);
        if (fx) three.fx.push(fx);
      }
      S.shake = Math.max(S.shake || 0, 0.4);
      if (S.hero && Math.hypot(S.hero.x - h.x, S.hero.z - h.z) <= h.r + 0.4) heroHurt(CFG.hazardDmg || 1, '혈월의 장판에 닿았습니다.');
    }
    if (h.done && h.t >= h.life) {
      if (h.mesh) { releaseHazardMesh(h.mesh, h.mat); h.mesh = null; }
      h.dead = true;
    }
  });
  S.hazards = S.hazards.filter(function (h) { return !h.dead; });
}
/* 보스 예고 순간: 스테이지가 후반이면 장판이 여러 개 깔린다. */
function bossHazards(z) {
  const B = (S.stage && S.stage.boss) || {};
  const n = B.hazard || 0;
  if (!n || !S) return;
  /* Stagger shrinks so the last blast lands by the end of the charge, before the stun opens. */
  const bt = bossTiming(), d0 = CFG.hazardDelay || 1.05;
  const step = n > 1 ? Math.min(0.18, Math.max(0, bt.teleT + bt.chargeT - d0) / (n - 1)) : 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const rad = i === 0 ? 0 : 2.6 + Math.random() * 2.2;
    spawnHazard(S.hero.x + Math.cos(a) * rad, S.hero.z + Math.sin(a) * rad, (CFG.hazardR || 2.5) * (0.8 + Math.random() * 0.3), d0 + i * step);
  }
}
/* ---------- v0.26 보스 패턴 ----------
   장마다 STAGES[n].boss.patterns 목록을 차례로 돈다(배워서 읽을 수 있게 고정 순서).
   예고 색이 대응을 알린다: 붉은 = 일섬 회피, 금 = 탭 패링, 비취 = 무늬 그리기. 수치는 CFG.bossPat. */
const CUE_RGB = { red: '200,40,30', gold: '232,192,74', jade: '46,230,166' };
/* v0.30 §11 색약 팔레트: 붉은→주황, 비취→청록. 모양 아이콘과 함께 쓴다. */
const CUE_RGB_CB = { red: '255,140,50', gold: '242,206,96', jade: '70,214,236' };
const CUE_LABEL = { red: '피하라', gold: '받아쳐라', jade: '그려라' };
const PAT_CUE = { charge: 'red', slam: 'red', sweep: 'red', volley: 'red', kiai: 'gold', chant: 'jade', clones: 'jade', veil: 'jade', shrink: 'gold', clash: 'jade', mimic: 'red', shuffle: 'jade' };
function cueRgb(c) { return (a11yCb() ? CUE_RGB_CB : CUE_RGB)[c] || CUE_RGB.red; }
/** §11 대응 아이콘: 피하라 = 바깥 화살표, 받아쳐라 = 칼집, 그려라 = 붓. 색만으로 구분하지 않게. */
function drawCueIcon(ctx, c, x, y, k, rgb, scale) {
  const s = (scale || 1) * 10;
  const a = clamp((k == null ? 1 : k) + 0.3, 0, 1);
  ctx.save();
  ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.95 * a).toFixed(3) + ')';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (c === 'red') {
    [-1, 1].forEach(function (d) {
      ctx.beginPath(); ctx.moveTo(x - d * s * 0.15, y); ctx.lineTo(x + d * s * 0.45, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + d * s * 0.45, y); ctx.lineTo(x + d * s * 0.12, y - s * 0.32);
      ctx.moveTo(x + d * s * 0.45, y); ctx.lineTo(x + d * s * 0.12, y + s * 0.32); ctx.stroke();
    });
  } else if (c === 'gold') {
    ctx.beginPath(); ctx.rect(x - s * 0.8, y - s * 0.34, s * 1.05, s * 0.68); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * 0.25, y - s * 0.22); ctx.lineTo(x + s * 0.25, y + s * 0.22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * 0.25, y); ctx.lineTo(x + s * 0.85, y); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(x - s * 0.45, y + s * 0.6); ctx.lineTo(x + s * 0.5, y - s * 0.45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - s * 0.45, y + s * 0.6); ctx.lineTo(x - s * 0.85, y + s * 0.82); ctx.lineTo(x - s * 0.62, y + s * 0.28); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
/* ---------- v0.32 §4.5 보스 개성 · §9.3 도감 대비 ----------
   장마다 머리 장신구・무기・크기가 다르고(3막 색조는 재질 틴트), 이름 카드는 1.2초. */
/* §9.2 외형: 보스·기물의 윤곽광과 발광 색만 바꾼다(능력 없음). */
function applySkin(obj) {
  if (!obj || !obj.userData) return;
  const sk = skinOf(save);
  const rim = obj.userData.rim;
  if (rim && rim.material && rim.material.color) { rim.material.color.setHex(sk.rim); obj.userData.rimHex = sk.rim; }
  const glow = obj.userData.glow;
  if (glow && glow.material && glow.material.color) glow.material.color.setRGB(sk.glow[0], sk.glow[1], sk.glow[2]);
}
function bossVisualOf(st) {
  const v = (st && st.bossVisual) || {};
  return { var: clamp(v.var != null ? v.var : 3, 0, 3), scale: clamp(v.scale != null ? v.scale : 1, 0.9, 1.15) };
}
let bossCardT = null;
function showBossCard(st) {
  const el = $('bossCard');
  if (!el || !st) return;
  const nm = $('bossCardName'), ln = $('bossCardLine');
  if (nm) nm.textContent = st.bossName || '귀물';
  if (ln) ln.textContent = st.bossLine || '';
  el.hidden = false; el.classList.add('show');
  if (bossCardT) clearTimeout(bossCardT);
  const ms = qa.noDelay ? 200 : 1200;
  bossCardT = setTimeout(function () { el.classList.remove('show'); el.hidden = true; bossCardT = null; }, ms);
  telemetry.event('boss_card', { stage: S && S.stageNo, name: st.bossName || '' });
}
/* §9.3 도감 9칸(패턴) + 막 전용 3칸 — v0.49: v2/js/modules/bossCatalog.js 로 분리(오탈자 교정 포함). */
/* 도감 기록: 보스 처치(상·하 공략 포함)와 패턴 받아치기 */
/* §9.3 도감: 귀물 8칸 — 종류별로 처음 하나를 베면 도감에 오른다. */
function codexMon(type) {
  if (!type) return;
  const slot = MON_CODE.filter(function (m) { return m.id === type; })[0];
  if (!slot) return;
  save.codex = save.codex || {};
  save.codex.mon = save.codex.mon || {};
  if (save.codex.mon[type]) return;
  save.codex.mon[type] = 1;
  persist();
  telemetry.event('codex', { kind: 'mon', id: type });
  const n = codexCounts(save);
  if (n.mon >= 8) toast('도감 · 귀물 8칸을 채웠습니다 — 엽전 +5%');
}
function codexEvo(key) {
  if (!key) return;
  save.codex = save.codex || {};
  save.codex.evo = save.codex.evo || {};
  if (save.codex.evo[key]) return;
  save.codex.evo[key] = 1;
  persist();
  telemetry.event('codex', { kind: 'evo', id: key });
  const n = codexCounts(save);
  if (n.evo >= EVO_SLOTS) toast('도감 · 진화 10칸을 채웠습니다 — 엽전 +5%');
}
function codexBoss(st) {
  if (!st) return;
  save.codex = save.codex || { boss: {}, pat: {} };
  save.codex.boss = save.codex.boss || {};
  const first = !save.codex.boss[st.id];
  save.codex.boss[st.id] = {
    name: st.bossName || '', line: st.bossLine || '',
    guides: [(st.terrain && st.terrain.line) || '보스의 무늬를 차례로 베세요.', '빈틈 고리가 다 차는 순간이 절단 찬스입니다.'],
    n: ((save.codex.boss[st.id] && save.codex.boss[st.id].n) || 0) + 1
  };
  persist();
  if (first) telemetry.event('codex', { kind: 'boss', stage: st.id, name: st.bossName || '' });
}
function notePatSeen(id, how) {
  if (!id) return;
  save.codex = save.codex || { boss: {}, pat: {} };
  save.codex.pat = save.codex.pat || {};
  save.codex.pat[id] = (save.codex.pat[id] || 0) + 1;
  telemetry.event('pat_codex', { id: id, how: how || null, n: save.codex.pat[id] });
}
function bossPat() { return CFG.bossPat || {}; }
/* §9.4 금실 칼집: 기모으기 금빛 칸 +0.1초 */
function kiaiWin(K) { return (K && K.win || 0) + (relicOn(save, 'sheath') ? 0.1 : 0); }
/** Spirits on the clones and on the boss among them stay bound for the whole pattern, wherever the hero dashes. */
function cloneHeld(s) { const t = s && s.target; return !!(t && (t.isClone || t.isTotem || t.isPillar || (t.isBoss && t.state === 'clones'))); }
function ensureCloneSpirits(z) {
  const held = livingMarks().map(function (m) { return m.target; });
  [z].concat(z.clones || []).forEach(function (c) { if (c.alive && held.indexOf(c) < 0) spawnSpirit({ x: c.x, z: c.z, target: c }); });
}
function bossCfg() { return (S && S.stage && S.stage.boss) || {}; }
function bossSealOn() { return !!bossCfg().seal; }
/** The boss's standing totems (기물): fixed dash targets that take turns throwing a slow charm. */
function bossMinions() {
  return S.zombies.filter(function (q) { return q.alive && q.isTotem; });
}
/** Raises one totem in the widest empty direction around the hero, inside the sight ring, so there is always somewhere to dash. */
function summonDodgeTarget(boss) {
  const M = bossPat().summon;
  const center=S.arena || S.hero;
  const taken=bossMinions().map(q=>Math.atan2(q.z-center.z,q.x-center.x));
  let best = Math.random() * Math.PI * 2, bestGap = -1;
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6 + Math.random() * 0.2;
    const gap = taken.reduce(function (m, t) { return Math.min(m, Math.abs(angDiff(a, t))); }, Math.PI);
    if (gap > bestGap) { bestGap = gap; best = a; }
  }
  const d=arenaR()-.35;
  const p={x:center.x+Math.cos(best)*d,z:center.z+Math.sin(best)*d};
  inkFx.burst(p.x, p.z, FX_COLORS.poison, { r1: 30, n: 6, dur: 0.4 });
  const used = bossMinions().map(function (q) { return q.shape; });
  const shape = TOTEM_SHAPES.filter(function (k) { return used.indexOf(k) < 0; })[0];
  if (!shape) return null;
  const t = { id: ++S._id, kind: 'zombie', type: 'totem', shape: shape, x: p.x, z: p.z, r: 0.6, alive: true, hp: 1, isTotem: true, frozen: 0, burn: 0, poison: 0, stun: 0, marked: false };
  t.edgeAngle=best;
  t.obj = makeTotemObj(shape);
  if (three) three.scene.add(t.obj);
  placeGroup(t.obj, t.x, t.z);
  S.zombies.push(t);
  assignSpiritTargets();
  return t;
}
function stepBossSummons(dt) {
  const M = bossPat().summon;
  S.summonT = (S.summonT || 0) - dt;
  if (S.summonT <= 0 && bossMinions().length < M.keep) { S.summonT = M.every; summonDodgeTarget(S.boss); }
  /* 기물 혼령은 주인공이 어디로 일섬해 가든 붙어 있다 — 피할 곳이 사라지지 않게. */
  const held = livingMarks().map(function (m) { return m.target; });
  bossMinions().forEach(function (q) { if (held.indexOf(q) < 0) spawnSpirit({ x: q.x, z: q.z, target: q }); });
  /* 기물은 한 번에 하나씩 번갈아 쏜다: 예고(보랏빛 고리) 뒤 느린 부적 한 장. */
  const list = bossMinions();
  if (!list.length) return;
  S.totemShotT = (S.totemShotT == null ? M.shotEvery : S.totemShotT) - dt;
  if (!S.totemNext || !S.totemNext.alive) { S.totemI = ((S.totemI || 0) + 1) % list.length; S.totemNext = list[S.totemI]; }
  if (S.totemShotT > 0) return;
  S.totemShotT = M.shotEvery;
  const t = S.totemNext;
  const sh = spawnShot({ x: t.x, z: t.z });
  if (sh) {
    const d = Math.hypot(S.hero.x - t.x, S.hero.z - t.z) || 1;
    sh.vx = (S.hero.x - t.x) / d * M.shotSpeed; sh.vz = (S.hero.z - t.z) / d * M.shotSpeed;
    sh.life = Math.max(sh.life, d / M.shotSpeed + 1);
  }
  inkFx.burst(t.x, t.z, FX_COLORS.poison, { r1: 24, n: 5, dur: 0.3 });
  S.totemNext = null;
}
/* v0.29 §4.1 기물 역공: 보스가 예고 중일 때(telegraph·slamTele·volleyTele·kiai) 기물로 일섬하면
   기물이 먹 궤적이 되어 보스에게 날아간다 → 경직 1.0초 + 참 +12 + 기세 1칸.
   예고가 아닐 때 부수면 예전처럼 참 +3. 한 번의 예고에 역류는 1번만. */
function bossReflectWindow(z) {
  return !!z && z.alive && (z.state === 'telegraph' || z.state === 'slamTele' || z.state === 'volleyTele' || z.state === 'kiai');
}
function reflectReady() {
  const z = S && S.boss;
  return !!(z && bossReflectWindow(z) && !z.reflectUsed);
}
let _reflectGeo = null, _reflectMat = null;
function makeReflectMesh() {
  if (!_reflectGeo) _reflectGeo = new THREE.PlaneGeometry(1.3, 0.7);
  if (!_reflectMat) _reflectMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(_reflectGeo, _reflectMat);
  m.position.y = 1.1;
  return m;
}
function reflectTotem(t, b) {
  if (!t || !t.alive) return;
  t.alive = false;
  if (t.obj && three) releaseTotemObj(t.obj);
  b.reflectUsed = true;
  S.reflects = S.reflects || [];
  const mesh = makeReflectMesh();
  mesh.position.set(t.x, 1.1, t.z);
  if (three) three.scene.add(mesh);
  S.reflects.push({ x: t.x, z: t.z, t: 0, mesh: mesh });
  S.shake = Math.max(S.shake || 0, 0.3);
  inkFx.burst(t.x, t.z, FX_COLORS.gold, { r1: 40, n: 8, dur: 0.4 });
  inkFx.ring(1.8, FX_COLORS.gold, 0.4);
  showJudge('역류!');
  if (audio) audio.gong();
  assignSpiritTargets();
}
function reflectHit(b) {
  if (!b || !b.alive) return;
  endBossSide(b);
  b.state = 'stun'; b.stateT = 0; b.stunT = CFG.reflectStun || 1.0;
  addCharge(CFG.reflectCharge || 12);
  addHitstop(CFG.hitstopBreak || 0.10);
  S.goldEdge = Math.max(S.goldEdge || 0, 0.18);
  S.shake = Math.max(S.shake || 0, 0.75);
  inkFx.ring(2.6, FX_COLORS.gold, 0.5);
  inkFx.burst(b.x, b.z, FX_COLORS.gold, { r1: 54, n: 12, dur: 0.5 });
  showJudge('역류 명중!');
  toast('기물이 되돌아가 귀물이 휘청입니다 — 지금 베세요');
  if (audio) { audio.drum(); audio.hit(false); }
  bossPoise(b, CFG.reflectPoise || 1);
}
function stepReflects(dt) {
  if (!S || !S.reflects || !S.reflects.length) return;
  S.reflects = S.reflects.filter(function (r) {
    r.t += dt;
    const b = S.boss;
    if (!b || !b.alive) { if (r.mesh && three) three.scene.remove(r.mesh); return false; }
    const dx = b.x - r.x, dz = b.z - r.z, L = Math.hypot(dx, dz) || 1;
    const sp = 15;
    r.x += dx / L * sp * dt; r.z += dz / L * sp * dt;
    if (r.mesh) { r.mesh.position.set(r.x, 1.1, r.z); r.mesh.rotation.y += dt * 12; }
    if (L < (b.r || 1) + 0.6 || r.t > 3) {
      if (L < (b.r || 1) + 0.6) reflectHit(b);
      if (r.mesh && three) three.scene.remove(r.mesh);
      return false;
    }
    return true;
  });
}
const TOTEM_POOL_MAX = 6;
const totemPool = [];
function makeTotemObj(shape='tri') {
  const group=totemPool.pop() || buildSealStake();
  group.userData.paper.material=sealPaper(shape);
  return group;
}
/* 기물이 부서지면 장면에서 빼고 풀로 돌려 둔다(최대 6개). */
function releaseTotemObj(g) {
  if (!g) return;
  if (g.parent) g.parent.remove(g);
  if (totemPool.length < TOTEM_POOL_MAX) totemPool.push(g);
}
function breakTotem(t) {
  if (!t.alive) return;
  /* §4.1: 보스가 예고 중이면 부수는 대신 되돌려 보낸다. */
  const b = S && S.boss;
  if (b && bossReflectWindow(b) && !b.reflectUsed) { reflectTotem(t, b); return; }
  t.alive = false;
  if (t.obj && three) releaseTotemObj(t.obj);
  if (art && art.playFx && three) { const fx = art.playFx(three.scene, 'ink-splat', t.x, t.z, 1.4); if (fx) three.fx.push(fx); }
  if (audio) audio.hit();
  addCharge(3);
  assignSpiritTargets();
}
/** The boss's pattern list for its current phase, or null for the old charge-only loop.
    v0.32 §4.4: 12장은 무늬 1/3마다 페이즈가 열려 3페이즈까지 쌓인다. */
function bossPatList(z) {
  const B = bossCfg();
  if (!B.patterns) return null;
  const ph = (z && z.phase) || 1;
  if (ph >= 3 && B.phase3) return B.patterns.concat(B.phase2 || [], B.phase3);
  if (ph >= 2 && B.phase2) return B.patterns.concat(B.phase2);
  return B.patterns;
}
function refreshBossGlyphs(z) {
  livingMarks().forEach(function (m) {
    if ((m.target === z || (m.target && m.target.isClone)) && art.setSpiritShape) art.setSpiritShape(m.obj, spiritShape(m));
  });
}
/** Shows the colour cue over the boss, plays its sound, and teaches the pattern once per run. */
function bossCue(z, color, id) {
  z.cue = { c: color, t: 0 };
  if (audio) {
    if (color === 'red') audio.drum();
    else if (color === 'gold' && audio.gong) audio.gong();
    else if (color === 'jade') audio.bell(0, z.shape);
  }
  S.bossTips = S.bossTips || {};
  const tip = (bossPat().tips || {})[id];
  if (tip && !S.bossTips[id]) { S.bossTips[id] = true; hideGuide(); toast(tip); }
}
function nextBossPattern(z) {
  const list = bossPatList(z);
  const id = list[(z.patI || 0) % list.length];
  z.patI = (z.patI || 0) + 1;
  startBossPattern(z, id);
}
function startBossPattern(z, id) {
  z.pat = id; z.stateT = 0;
  z.firstWalk = false;
  z.reflectUsed = false;
  /* v0.30 §8.2: 이 패턴을 처음 보는 순간이면 예고 ×1.6 + 0.5배 느린 화면 0.6초 + 대응 아이콘. */
  const first = markSeen('pat:' + id);
  z.teleBoost = first ? (CFG.firstPatTele || 1.6) : 1;
  z.teleMul = teleMul() * z.teleBoost;
  if (first && S) {
    addSlow(CFG.firstPatSlow || 0.5, CFG.firstPatSlowDur || 0.6);
    S.firstPatIcon = { id: id, c: PAT_CUE[id] || 'red', t: 1.6 };
    telemetry.event('first_moment', { kind: 'pattern', id: id, stage: S.stageNo });
  }
  telemetry.event('boss_pattern', { p: id, stage: S && S.stageNo, start: true, first: first });
  const P = bossPat();
  if (id === 'kiai') {
    z.state = 'kiai'; z.kiai = { lock: false, open: false, t: P.kiai.t * (z.teleMul || 1) };
    bossCue(z, 'gold', id);
    if (audio && audio.charge) audio.charge(z.kiai.t);
  } else if (id === 'slam') startSlam(z, P.slam.tele * (z.teleMul || 1));
  else if (id === 'sweep') startSweep(z);
  else if (id === 'clones') startClones(z);
  else if (id === 'veil') startVeil(z);
  else if (id === 'volley') {
    z.state = 'volleyTele'; z._warnTicked = false;
    z.aimA = Math.atan2(S.hero.z - z.z, S.hero.x - z.x);
    z.volleyTele = P.volley.tele * (z.teleMul || 1);
    /* v0.53: 발사 전에 금빛 패링 부적 위치를 미리 결정해 예고 편대에 금빛으로 표시한다 */
    const Vo = P.volley, gMap = {};
    while (Object.keys(gMap).length < Math.min(Vo.gold, Vo.n)) gMap[Math.floor(Math.random() * Vo.n)] = true;
    z.volleyGold = gMap;
    bossCue(z, 'red', id);
  } else if (id === 'chant') {
    z.state = 'chant'; z.chant = { seq: pickSeq(P.chant.n), i: 0 };
    z.chantT = P.chant.t * (z.teleMul || 1);
    bossCue(z, 'jade', id);
  } else if (id === 'shrink') {
    startShrink(z);
    z.state = 'walk';
  } else if (id === 'clash') startClash(z);
  else if (id === 'mimic') startMimic(z);
  else if (id === 'shuffle') startShuffle(z);
  else startCharge(z);
}
function startCharge(z) {
  z.state = 'telegraph'; z.stateT = 0; z.pat = 'charge'; z._warnTicked = false;
  z.reflectUsed = false;
  z.teleMul = teleMul() * (z.teleBoost || 1);
  z.aim = { x: S.hero.x, z: S.hero.z };
  z.dodged = false;
  bossHazards(z);
  bossCue(z, 'red', 'charge');
}
function startSlam(z, tele) {
  z.state = 'slamTele'; z.stateT = 0; z.leapY = 0; z._warnTicked = false;
  z.reflectUsed = false;
  z.slam = { fromX: z.x, fromZ: z.z, x: S.hero.x, z: S.hero.z, tele: tele };
  bossCue(z, 'red', 'slam');
}
/* v0.52 신규 스킬 — 언월 횡참(sweep): 120도 광역 부채꼴 베기 + 전진 검기 파동 (+ 2페이즈 양옆 부적 2발) */
function startSweep(z) {
  const SW = (bossPat().sweep) || { tele: 0.92, range: 6.0, arc: 2.1, dmg: 2, stun: 0.85 };
  z.state = 'sweepTele'; z.stateT = 0; z.pat = 'sweep'; z._warnTicked = false;
  z.reflectUsed = false;
  z.sweep = {
    aimA: Math.atan2(S.hero.z - z.z, S.hero.x - z.x),
    tele: SW.tele * (z.teleMul || 1),
    range: SW.range || 6.0,
    arc: SW.arc || 2.1,
    dmg: SW.dmg || 2,
    stun: SW.stun || 0.85
  };
  bossCue(z, 'red', 'sweep');
  if (audio && audio.drum) audio.drum();
}
/* ---------- v0.32 §4.4 막 보스 전용 패턴 ----------
   8장 무명 검귀 — 합 겨루기(1.2초)와 흉내(방금 그은 궤적 추적)
   12장 나락의 주인 — 무늬 뒤석기(2초마다 변경, 금빛 0.4초에 고정) */
function startClash(z) {
  z.state = 'clash'; z.stateT = 0;
  z.clash = { i: 0, need: CFG.clashRounds || 3, win: CFG.clashWin || 1.2, t: 0, shape: pickSeq(1)[0] };
  z.pat = 'clash';
  bossCue(z, 'jade', 'clash');
  S.shake = Math.max(S.shake || 0, 0.35);
  inkFx.burst(z.x, z.z, FX_COLORS.gold, { r1: 44, n: 8, dur: 0.4 });
  showJudge('합!');
  if (audio && audio.gong) audio.gong();
}
function clashStroke(type) {
  const z = S && S.boss;
  if (!z || !z.alive || z.state !== 'clash' || !z.clash) return false;
  const c = z.clash;
  if (!type || type === 'tap' || type === 'circle') return false;
  if (type !== c.shape) {
    showJudge('틀린 합');
    if (audio && audio.whiff) audio.whiff();
    clashRoundFail(z, true);
    return true;
  }
  c.i++;
  S.clashWin = (S.clashWin || 0) + 1;
  tcount('clash');
  telemetry.event('boss_pattern', { p: 'clash', result: 'win', n: S.clashWin });
  /* 보스가 0.6m 밀리고 기세 1칸 */
  const d = dist(z, S.hero) || 1;
  z.x += (z.x - S.hero.x) / d * 0.6;
  z.z += (z.z - S.hero.z) / d * 0.6;
  const ca = clampPointToArena(z.x, z.z, 1.2);
  z.x = ca.x; z.z = ca.z;
  if (z.obj) placeGroup(z.obj, z.x, z.z);
  S.goldEdge = Math.max(S.goldEdge || 0, 0.2);
  addHitstop(0.1);
  addCharge(8);
  if (audio) audio.parry();
  showJudge('한 합 받아냄 ' + c.i + '/' + c.need);
  notePatSeen('clash', 'win');
  bossPoise(z, 1);
  if (c.i >= c.need) { z.clash = null; z.state = 'walk'; z.stateT = 0; }
  else { c.shape = pickSeq(1)[0]; c.t = 0; }
  return true;
}
function clashRoundFail(z, wrong) {
  const c = z && z.clash;
  if (!c) return;
  c.i++;
  telemetry.event('boss_pattern', { p: 'clash', result: wrong ? 'wrong' : 'late', round: c.i });
  heroHurtForce(1, '합에 밀렸습니다.');
  const d = dist(z, S.hero) || 1;
  S.hero.x += (S.hero.x - z.x) / d * 1.0;
  S.hero.z += (S.hero.z - z.z) / d * 1.0;
  if (three && three.heroSpr) placeGroup(three.heroSpr, S.hero.x, S.hero.z);
  showJudge('밀렸다');
  if (c.i >= c.need) { z.clash = null; z.state = 'walk'; z.stateT = 0; }
  else { c.shape = pickSeq(1)[0]; c.t = 0; }
}
function startMimic(z) {
  const seg = S.lastDash && S.lastDash.segs && S.lastDash.segs[S.lastDash.segs.length - 1];
  let dir = { x: 1, z: 0 };
  if (seg) {
    const dx = seg.to.x - seg.from.x, dz = seg.to.z - seg.from.z, L = Math.hypot(dx, dz) || 1;
    dir = { x: dx / L, z: dz / L };
  }
  z.state = 'mimicTele'; z.stateT = 0;
  z.mimic = { dir: dir, tele: CFG.mimicTele || 0.8, t: 0, dur: CFG.mimicDur || 0.45, started: false };
  z.pat = 'mimic';
  bossCue(z, 'red', 'mimic');
  showJudge('흉내');
  toast('귀물이 방금 그은 궤적을 따라옵니다 — 그 선과 직각으로 비켜서세요');
}
function startShuffle(z) {
  z.state = 'shuffle'; z.stateT = 0;
  z.shuffle = { t: 0, every: CFG.shuffleEvery || 2, win: CFG.shuffleWin || 0.4, dur: CFG.shuffleDur || 8, gold: 0, locked: false };
  z.pat = 'shuffle';
  changeBossShape(z, true);
  bossCue(z, 'jade', 'shuffle');
}
function changeBossShape(z, gold) {
  if (!z) return;
  z.shape = otherShape(z.shape);
  z.shuffle = z.shuffle || {};
  if (gold) {
    z.shuffle.gold = z.shuffle.win || 0.4;
    z.rimFlash = z.shuffle.gold;
    if (audio && audio.bell) audio.bell(0, z.shape);
  }
  refreshBossGlyphs(z);
}
/** Pattern states; returns true/false like stepBoss, or null when the state is not a pattern state. */
function stepBossPat(z, dt) {
  const P = bossPat();
  const st = z.state;
  if (st === 'groggy') {
    if (z.stateT > P.groggyT) { z.state = 'walk'; z.stateT = 0; }
    return true;
  }
  /* §4.4 합 겨루기: 3합. 1.2초 안에 뜬 무늬를 그으면 한 합, 늦으면 주인공이 밀리고 피해 1. */
  if (st === 'clash') {
    const c = z.clash;
    if (!c) { z.state = 'walk'; z.stateT = 0; return true; }
    c.t += dt;
    if (c.t >= c.win) clashRoundFail(z, false);
    return true;
  }
  /* §4.4 흉내: 0.8초 뒤, 주인공이 방금 그은 궤적을 그대로 따라 돌진한다. */
  if (st === 'mimicTele') {
    z.mimic.t += dt;
    if (z.mimic.t >= z.mimic.tele) {
      z.state = 'mimicCharge'; z.stateT = 0; z.mimic.t = 0; z._trailT = 0;
      if (audio) { if (audio.bossCharge) audio.bossCharge(); else audio.slash(); }
      const m = z.mimic;
      makeBossSlash({ x: z.x, z: z.z }, { x: z.x + m.dir.x * 7.5, z: z.z + m.dir.z * 7.5 }, { width: 2.9, height: 0.9 });
      bossFx.pushChargePoint(z.x, z.z);
    }
    return true;
  }
  if (st === 'mimicCharge') {
    const m = z.mimic;
    m.t += dt;
    const sp = CFG.mimicSpeed || 16;
    const nx = z.x + m.dir.x * sp * dt, nz = z.z + m.dir.z * sp * dt;
    const ca = clampPointToArena(nx, nz, 1.2);
    z.x = ca.x; z.z = ca.z;
    z._trailT = (z._trailT || 0) + dt;
    if (z._trailT >= 0.028) { z._trailT = 0; bossFx.pushChargePoint(z.x, z.z); }
    if (S.iframe <= 0 && !S.dash && dist(z, S.hero) < z.r + 0.8) heroHurt(1, '흉내에 베였습니다.');
    if (m.t >= m.dur) { z.state = 'walk'; z.stateT = 0; z.mimic = null; }
    return true;
  }
  /* §4.4 무늬 뒤석기: 2초마다 무늬가 바뀐다. 금빛 0.4초에 그으면 고정된다(고정은 cutSpirit에서). */
  if (st === 'shuffle') {
    const s = z.shuffle;
    if (!s) { z.state = 'walk'; z.stateT = 0; return true; }
    s.t += dt;
    if (s.gold > 0) s.gold = Math.max(0, s.gold - dt);
    if (z.rimFlash > 0) z.rimFlash = Math.max(0, z.rimFlash - dt);
    if (!s.locked && s.t >= s.every) { s.t = 0; changeBossShape(z, true); }
    if (s.t >= s.dur) { z.state = 'walk'; z.stateT = 0; z.shuffle = null; }
    return true;
  }
  if (st === 'kiai') {
    const K = P.kiai, T = z.kiai.t;
    if (!z.kiai.open && z.stateT >= T - kiaiWin(K)) {
      z.kiai.open = true;
      if (!z.kiai.lock && audio && audio.gong) audio.gong();
    }
    if (z.stateT >= T + K.grace) {
      inkFx.ring(arenaR(), FX_COLORS.gold, 0.6);
      bossFx.triggerKiaiBurst(z.x, z.z, false);
      if (audio && audio.bossSlam) audio.bossSlam();
      S.fogPulse = Math.max(S.fogPulse || 0, 0.55);
      /* §3.4 대응 2개: 기물 뒤에 숨었으면(기물·보스 선분 0.8m 안) 피해 1로 경감. */
      const cover = totemCover(z);
      if (cover) showJudge('기물 뒤로!');
      heroHurtForce(cover ? 1 : K.dmg, '귀물의 기합에 휩쓸렸습니다.', { note: cover });
      z.state = 'walk'; z.stateT = 0; z.kiai = null;
    }
    return true;
  }
  if (st === 'slamTele') {
    if (!z._warnTicked && z.stateT >= z.slam.tele * 0.78) {
      z._warnTicked = true;
      if (audio && audio.bell) audio.bell(0, 'vline');
    }
    /* v0.50: 순간이동 대신 마지막 0.38초 동안 포물선 도약 후 내려찍기 */
    const leapDur = Math.min(0.38, z.slam.tele * 0.42);
    const leapStart = Math.max(0, z.slam.tele - leapDur);
    if (z.stateT >= leapStart && z.stateT <= z.slam.tele) {
      const lu = clamp((z.stateT - leapStart) / Math.max(0.01, leapDur), 0, 1);
      const sx = z.slam.fromX != null ? z.slam.fromX : z.x;
      const sz = z.slam.fromZ != null ? z.slam.fromZ : z.z;
      const ca = clampPointToArena(sx + (z.slam.x - sx) * lu, sz + (z.slam.z - sz) * lu, 1.2);
      z.x = ca.x; z.z = ca.z;
      z.leapY = Math.sin(lu * Math.PI) * 3.8;
    } else {
      z.leapY = 0;
    }
    if (z.stateT > z.slam.tele) {
      const L = P.slam;
      z.x = z.slam.x; z.z = z.slam.z; z.leapY = 0; z._warnTicked = false;
      if (z.hidden) revealBoss(z);
      bossFx.triggerSlamImpact(z.x, z.z, L.r);
      /* 주인공 일섬 동급의 3D 교차 수묵 검기 + 먹파편 + 붉은 광원 폭발 */
      makeBossSlash({ x: z.x - L.r * 0.85, z: z.z - L.r * 0.45 }, { x: z.x + L.r * 0.85, z: z.z + L.r * 0.45 }, { width: 2.6, height: 1.05 });
      makeBossSlash({ x: z.x - L.r * 0.45, z: z.z + L.r * 0.85 }, { x: z.x + L.r * 0.45, z: z.z - L.r * 0.85 }, { width: 2.4, height: 0.9 });
      if (three && three.ink) three.ink.kill(z.x, z.z, 0, 1, { scale: 1.85 });
      if (three && three.lights) three.lights.burst(z.x, 1.25, z.z, { color: 0xf25236, intensity: 7.0, duration: 0.48 });
      if (art && art.playFx && three) { const fx = art.playFx(three.scene, 'ink-splat', z.x, z.z, L.r); if (fx) three.fx.push(fx); }
      S.shake = Math.max(S.shake || 0, 0.72);
      if (audio) { if (audio.bossSlam) audio.bossSlam(); else audio.explode(); }
      /* v0.52 다단 패턴: 2페이즈 또는 4장 이상에서는 착지 지점 양옆에 여진 장판 2개 추가 */
      if (z.phase2 || (S.stageNo || 1) >= 4) {
        const baseA = Math.atan2(S.hero.z - z.z, S.hero.x - z.x);
        [-0.75, 0.75].forEach(function (off) {
          const ha = baseA + off;
          const hp = clampPointToArena(z.x + Math.cos(ha) * (L.r + 1.4), z.z + Math.sin(ha) * (L.r + 1.4), 1.5);
          spawnHazard(hp.x, hp.z, 2.1, 0.82);
        });
      }
      const d = dist(z, S.hero);
      if (d <= L.r) {
        if (S.dash) bossJustDodge(z);
        else {
          heroHurt(L.dmg, '내려찍기에 맞았습니다.');
          const k = d > 0.01 ? d : 1;
          S.hero.x += (S.hero.x - z.x) / k * 2.0; S.hero.z += (S.hero.z - z.z) / k * 2.0;
        }
      }
      if (z.state === 'slamTele') { z.state = 'stun'; z.stateT = 0; z.stunT = L.stun; }
    }
    return true;
  }
  /* v0.52 신규 스킬 — 언월 횡참(sweepTele): 광역 부채꼴 베기 + 전진 초승달 검기 파동 */
  if (st === 'sweepTele' && z.sweep) {
    const sw = z.sweep;
    if (!z._warnTicked && z.stateT >= sw.tele * 0.78) {
      z._warnTicked = true;
      if (audio && audio.bell) audio.bell(0, 'vline');
    }
    if (z.stateT >= sw.tele) {
      z._warnTicked = false;
      const a = sw.aimA, half = sw.arc * 0.5, R = sw.range;
      bossFx.triggerSweepBurst(z.x, z.z, a, R);
      makeBossSlash(
        { x: z.x + Math.cos(a - half * 0.85) * 2.8, z: z.z + Math.sin(a - half * 0.85) * 2.8 },
        { x: z.x + Math.cos(a + half * 0.85) * 3.8, z: z.z + Math.sin(a + half * 0.85) * 3.8 },
        { width: 3.4, height: 1.0 }
      );
      if (audio) { if (audio.bossCharge) audio.bossCharge(); else audio.slash(); }
      S.shake = Math.max(S.shake || 0, 0.52);
      /* 전진 초승달 검기 파동 발사 (+ 2페이즈/4장 이상에서는 양옆 살부적 2발, 그중 1발은 패링 가능 금빛) */
      spawnBossWave(z, a);
      if (z.phase2 || (S.stageNo || 1) >= 4) {
        spawnBossShot(z, a - 0.42, true);
        spawnBossShot(z, a + 0.42, false);
      }
      /* 근거리 부채꼴 타격 판정 */
      const dx = S.hero.x - z.x, dz = S.hero.z - z.z, d = Math.hypot(dx, dz);
      if (d <= R + 0.35) {
        let da = Math.atan2(dz, dx) - a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) <= half) {
          if (S.dash) bossJustDodge(z);
          else {
            heroHurt(sw.dmg, '언월 횡참에 베였습니다.');
            const k = d > 0.01 ? d : 1;
            S.hero.x += dx / k * 1.8; S.hero.z += dz / k * 1.8;
          }
        }
      }
      if (z.state === 'sweepTele') { z.state = 'stun'; z.stateT = 0; z.stunT = sw.stun || 0.85; z.sweep = null; }
    }
    return true;
  }
  if (st === 'clones') {
    const C = P.clones;
    ensureCloneSpirits(z);
    z.bellT = (z.bellT || 0) - dt;
    if (z.bellT <= 0) {
      z.bellT = C.bell;
      const sp = livingMarks().filter(function (m) { return m.target === z; })[0];
      if (sp) ringSpiritBell(sp);
      z.ping = 0.6;
    }
    if (z.ping > 0) z.ping -= dt;
    if (z.stateT > C.t) { endClones(z); startCharge(z); }
    return true;
  }
  if (st === 'veil') {
    const V = P.veil;
    S.fogPulse = Math.max(S.fogPulse || 0, 0.7);
    z.bellT = (z.bellT || 0) - dt;
    if (z.bellT <= 0) {
      z.bellT = V.bell * (relicOn(save, 'eye') ? 0.7 : 1);
      const w = viewBox().width;
      const p = projectXZ(z.x, z.z, 1.5);
      if (audio) audio.bell(clamp((p.x / Math.max(1, w)) * 2 - 1, -1, 1), z.shape);
      z.ping = 0.6;
    }
    if (z.ping > 0) z.ping -= dt;
    if (z.stateT > V.t) bossAmbush(z);
    return true;
  }
  if (st === 'volleyTele') {
    const vDur = z.volleyTele || P.volley.tele;
    if (!z._warnTicked && z.stateT >= vDur * 0.78) {
      z._warnTicked = true;
      if (audio && audio.bell) audio.bell(0, 'vline');
    }
    if (z.stateT > vDur) {
      z._warnTicked = false;
      const Vo = P.volley, gold = z.volleyGold || {};
      if (!Object.keys(gold).length) {
        while (Object.keys(gold).length < Math.min(Vo.gold, Vo.n)) gold[Math.floor(Math.random() * Vo.n)] = true;
      }
      for (let i = 0; i < Vo.n; i++) {
        const a = z.aimA + (Vo.n > 1 ? (i / (Vo.n - 1) - 0.5) : 0) * Vo.spread * 2;
        spawnBossShot(z, a, !!gold[i]);
      }
      z.volleyGold = null;
      bossFx.triggerSmokeBurst(z.x, z.z, false);
      if (three && three.lights) three.lights.burst(z.x, 1.4, z.z, { color: 0xe64532, intensity: 4.0, duration: 0.3 });
      if (audio) { if (audio.bossVolley) audio.bossVolley(); else audio.slash(); }
      z.state = 'walk'; z.stateT = 0;
    }
    return true;
  }
  if (st === 'chant') {
    if (z.stateT > (z.chantT || P.chant.t)) {
      inkFx.ring(arenaR(), FX_COLORS.jade, 0.7);
      /* §3.4 대응 2개: 무늬 3개 중 2개 이상을 끊었으면 피해 1. */
      const broken = z.chant ? z.chant.i : 0;
      if (broken >= 2) showJudge('거의 끊었다');
      heroHurtForce(broken >= 2 ? 1 : P.chant.dmg, '영창이 터졌습니다.', { note: broken >= 2 });
      z.state = 'walk'; z.stateT = 0; z.chant = null;
    }
    return true;
  }
  if (st === 'sealing') {
    /* 封 글자가 다 번질 때까지 기다렸다가 쓰러진다. */
    if (z.stateT > 0.8) killZombie(z, S.lastDash);
    return true;
  }
  if (st === 'seal') {
    if (z.stateT > P.seal.t) {
      /* v0.52 버그 수정: 봉인 실패 시 HP=0에 고착되지 않도록 최대 HP의 22%를 회복하고 전투 복귀 */
      const recover = Math.max(4, Math.ceil((z.maxHp || 18) * 0.22));
      z.hp = recover;
      z.hpTrail = recover;
      z.state = 'walk'; z.stateT = 0;
      z.shape = z.seq[z.seqI] || z.seq[0];
      refreshBossGlyphs(z);
      bossFx.triggerSmokeBurst(z.x, z.z, false);
      showJudge('봉인 실패');
      toast('귀물이 기력을 되찾았습니다 (+' + recover + ' HP)');
    }
    return true;
  }
  return null;
}
/** Damage that the dash does not dodge (the kiai blast, a broken chant, a fake's counter, the closing barrier).
    v0.29 §3.4 공정성: 피격 무적 중에는 연쇄로 발동하지 않고, 판에서 처음 맞는 큰 피해는 1로 깎는다. */
function heroHurtForce(n, why, opts) {
  if (!S || !S.playing) return false;
  opts = opts || {};
  /* §3.4 연쇄 금지: 방금다 맞은 뒤 무적(0.8초) 중에는 다음 공격이 예고만 하고 발동하지 않는다. */
  if ((S.iframe || 0) > 0.05) { if (opts.note) showJudge('막아냈다'); return false; }
  if (mirrorSave(why)) return false;
  let dmg = n;
  /* §3.4 첫 실패 완화: 이 판에서 처음 맞는 '피할 수 없는' 공격은 피해 1. */
  if (dmg >= 2 && !S.firstForcedHit) {
    S.firstForcedHit = true;
    dmg = CFG.firstForcedDmg || 1;
    showJudge('처음은 가볍게');
  }
  /* v0.30 §7.2 모드 배율. */
  dmg = modeDmg(dmg) + relicDmgAdd();
  noteHit();
  S.hp -= dmg;
  if (S.hp <= 0) S.deathWhy = why;
  S.iframe = CFG.iframeMs / 1000;
  S.hurtFlash = CFG.hurtVignette || 0.3;
  S.shake = Math.max(S.shake || 0, 0.8);
  if (three && three.heroSpr && art.kickChar) art.kickChar(three.heroSpr, 1);
  const app = $('app');
  if (app) app.classList.add('hurt');
  if (audio) audio.explode();
  renderHud();
  if (S.hp <= 0) endRun(false, why);
  return true;
}
/* §3.4 대응 2개(기모으기): 보스와 주인공 사이 선분 0.8m 안에 기물이 있으면 몸을 숨긴 것 — 피해 1. */
function totemCover(boss) {
  if (!boss || !S || !S.hero) return false;
  const ax = S.hero.x, az = S.hero.z, bx = boss.x, bz = boss.z;
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  return bossMinions().some(function (t) {
    const u = ((t.x - ax) * dx + (t.z - az) * dz) / L2;
    if (u <= 0.05 || u >= 0.95) return false;
    const px = ax + dx * u, pz = az + dz * u;
    return Math.hypot(t.x - px, t.z - pz) <= 0.8;
  });
}
function bossJustDodge(z) {
  S.slowT = Math.max(S.slowT || 0, bossPat().dodgeSlow || 0.5);
  showJudge('간발!');
  if (z.pat) notePatSeen(z.pat, 'dodge');
  telemetry.event('boss_pattern', { p: z.pat || null, result: 'dodge', t: +(z.stateT || 0).toFixed(2) });
  bossPoise(z, 1);
}
/** Knocks pips off the boss's poise; at zero it breaks into a long stun (groggy). */
function bossPoise(z, n) {
  const P = bossPat();
  z.poise = (z.poise == null ? P.poise : z.poise) - n;
  if (z.poise <= 0) bossGroggy(z);
}
function bossGroggy(z) {
  endBossSide(z);
  z.state = 'groggy'; z.stateT = 0; z.leapY = 0; z.poise = bossPat().poise;
  S.shake = Math.max(S.shake || 0, 0.6);
  bossFx.triggerGroggyBreak(z.x, z.z);
  if (audio && audio.bossBreak) audio.bossBreak();
  showJudge('기세 붕괴!');
  toast('귀물이 무너졌습니다 — 지금 베면 두 칸씩 넘어갑니다');
}
/** Ends whatever side pieces a pattern left out: clones, the fog veil, a chant, a kiai. */
function endBossSide(z) {
  endClones(z);
  if (z.hidden) revealBoss(z);
  z.chant = null; z.kiai = null;
}
/* 기모으기: 금빛 칸(마지막 win초)에서 탭하면 받아치고 기세가 단번에 무너진다. 이르게 누르면 그 기합은 막을 수 없다. */
function kiaiTap() {
  const z = S && S.boss;
  if (!z || !z.alive || z.state !== 'kiai' || !z.kiai) return null;
  const K = bossPat().kiai;
  if (z.kiai.lock) { showJudge('흐트러졌다'); return { kiai: 'locked' }; }
  if (z.stateT < z.kiai.t - kiaiWin(K)) {
    /* §3.4 재시도: 이른 탭은 판당 한 번 봐준다 — 두 번째 이른 탭부터 실패. */
    z.kiai.early = (z.kiai.early || 0) + 1;
    telemetry.event('parry', { target: 'kiai', errMs: Math.round((z.stateT - (z.kiai.t - kiaiWin(K))) * 1000), result: 'early' });
    if (z.kiai.early <= 1) {
      showJudge('아직 — 조금만 더');
      if (audio && audio.whiff) audio.whiff();
      return { kiai: 'earlyGrace' };
    }
    z.kiai.lock = true;
    showJudge('이르다!');
    if (audio && audio.whiff) audio.whiff(true);
    return { kiai: 'early' };
  }
  telemetry.event('parry', { target: 'kiai', errMs: Math.round((z.stateT - (z.kiai.t - kiaiWin(K))) * 1000), result: 'parry' });
  S.parryFlash = 0.25;
  S.iframe = Math.max(S.iframe || 0, 0.5);
  addHitstop(0.15);
  /* §3.1: 받아치기에는 화면 가장자리 금빛 번쩍임 0.2초. */
  S.goldEdge = Math.max(S.goldEdge || 0, 0.2);
  addCharge(K.charge || 20);
  if (audio) audio.parry();
  inkFx.ring(4, FX_COLORS.gold, 0.5);
  bossFx.triggerKiaiBurst(z.x, z.z, true);
  showJudge('받아치기!');
  notePatSeen('kiai', 'parry');
  bossGroggy(z);
  return { kiai: 'parry' };
}
/* 분신: 진짜만 방울이 운다. 진짜를 겨눠 베면 경직, 가짜를 겨누면 반격. */
function startClones(z) {
  const C = bossPat().clones, n = C.n + 1;
  const R = ringR() * C.r, a0 = Math.random() * Math.PI * 2, realI = Math.floor(Math.random() * n);
  z.clones = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + i * Math.PI * 2 / n;
    const p = clampPointToArena(S.hero.x + Math.cos(a) * R, S.hero.z + Math.sin(a) * R, 1.5);
    inkFx.burst(p.x, p.z, FX_COLORS.jade, { r1: 40, n: 8, dur: 0.5 });
    if (i === realI) { z.x = p.x; z.z = p.z; continue; }
    const c = { id: ++S._id, kind: 'zombie', type: 'clone', x: p.x, z: p.z, r: z.r, alive: true, hp: 1, isClone: true, frozen: 0, burn: 0, poison: 0, stun: 0, marked: false };
    c.obj = addEntityVisual('boss', z.shape, { bossVar: S.bossVar });
    placeGroup(c.obj, c.x, c.z);
    S.zombies.push(c);
    z.clones.push(c);
  }
  placeGroup(z.obj, z.x, z.z);
  z.state = 'clones'; z.stateT = 0; z.bellT = 0.5;
  ensureCloneSpirits(z);
  bossCue(z, 'jade', 'clones');
}
function popClone(c, counter) {
  if (!c || !c.alive) return;
  c.alive = false;
  if (c.obj && three) three.scene.remove(c.obj);
  inkFx.burst(c.x, c.z, FX_COLORS.poison, { r1: 40, n: 8, dur: 0.45 });
  if (counter) { showJudge('가짜!'); heroHurtForce(bossPat().clones.dmg, '분신에게 반격당했습니다.'); }
  assignSpiritTargets();
}
function endClones(z) {
  if (!z.clones || !z.clones.length) return;
  z.clones.forEach(function (c) { popClone(c, false); });
  z.clones = [];
}
/* 은신: 혼령이 꺼지고 방울만 운다. 소리 쪽으로 그은 획이 맞으면 돌진해 벤다. */
function startVeil(z) {
  const V = bossPat().veil;
  const a = Math.random() * Math.PI * 2, d = V.dist[0] + Math.random() * (V.dist[1] - V.dist[0]);
  const p = clampPointToArena(S.hero.x + Math.cos(a) * d, S.hero.z + Math.sin(a) * d, 1.5);
  inkFx.burst(z.x, z.z, FX_COLORS.jade, { r1: 50, n: 10, dur: 0.6 });
  bossFx.triggerSmokeBurst(z.x, z.z, true);
  z.x = p.x; z.z = p.z;
  z.hidden = true;
  if (z.obj) z.obj.visible = false;
  livingMarks().filter(function (m) { return m.target === z; }).forEach(destroySpirit);
  z.state = 'veil'; z.stateT = 0; z.bellT = 0.4;
  bossCue(z, 'jade', 'veil');
}
function revealBoss(z) {
  z.hidden = false;
  bossFx.triggerSmokeBurst(z.x, z.z, true);
  if (z.obj) { z.obj.visible = true; placeGroup(z.obj, z.x, z.z); }
  assignSpiritTargets();
}
function bossAmbush(z) {
  revealBoss(z);
  showJudge('기습!');
  startSlam(z, bossPat().veil.ambushTele);
}
/** A stroke while the boss hides: true if it was used (a dash at the boss or a miss that wakes it). */
function veilStroke(pts) {
  const z = S && S.boss;
  if (!z || !z.alive || z.state !== 'veil' || S.dash) return false;
  const dir = strokeScreenDir(pts);
  if (!dir) return false;
  const hs = heroScreen(), bp = projectXZ(z.x, z.z, 0.8);
  const L = Math.hypot(bp.x - hs.x, bp.y - hs.y) || 1;
  const cos = ((bp.x - hs.x) / L) * dir.x + ((bp.y - hs.y) / L) * dir.y;
  if (cos < bossPat().veil.cone) { showJudge('빗나감'); bossAmbush(z); return true; }
  revealBoss(z);
  dashAtBoss(z, 'hline');
  return true;
}
function dashAtBoss(z, type) {
  const rec = { type: type, targets: [z.id], hits: [], items: [], t0: now(), segs: [], elem: curElem(), cinematic: false, quality: 0 };
  S.dashSeq = (S.dashSeq || 0) + 1;
  S.lastDash = rec;
  S.dashQueue = [z];
  startSeg();
  return rec;
}
/* 부적 탄막: 부채꼴. 금빛 부적은 탭으로 되받아 보스를 벤다. */
function spawnBossShot(z, a, gold) {
  const sh = spawnShot({ x: z.x, z: z.z });
  if (!sh) return null;
  const sp = bossPat().volley.speed;
  sh.vx = Math.cos(a) * sp; sh.vz = Math.sin(a) * sp;
  /* v0.52: 커스텀 살부적 2D 에셋(boss-talisman.webp)이 선명히 보이도록 구형 3D 기본 메쉬를 축소/숨김 */
  if (sh.mesh) sh.mesh.visible = false;
  if (gold) sh.gold = true;
  return sh;
}
/* v0.52: 언월도 초승달 검기 파동 투사체 (boss-wave.webp) */
function spawnBossWave(z, a) {
  const sh = spawnShot({ x: z.x + Math.cos(a) * 1.1, z: z.z + Math.sin(a) * 1.1 });
  if (!sh) return null;
  const sp = ((bossPat().sweep && bossPat().sweep.waveSpeed) || 10.5);
  sh.vx = Math.cos(a) * sp; sh.vz = Math.sin(a) * sp;
  sh.isWave = true;
  sh.r = 0.85;
  sh.dmg = 2;
  sh.life = 2.1;
  if (sh.mesh) sh.mesh.visible = false;
  return sh;
}
function reflectGoldShots(R) {
  let n = 0;
  (S.shots || []).forEach(function (sh) {
    if (!sh.gold || sh.reflect) return;
    if (Math.hypot(sh.x - S.hero.x, sh.z - S.hero.z) > R + 0.6) return;
    sh.reflect = true; sh.t = 0; n++;
    inkFx.burst(sh.x, sh.z, FX_COLORS.gold, { r1: 30, n: 6, dur: 0.35 });
  });
  return n;
}
/** Moves a reflected gold charm home to the boss; true while it flies. */
function stepReflectedShot(sh, dt) {
  /* v0.31 §3.5: 일반 투척 부적을 되받으면 던진 원귀에게 돌아가 꿰뚫는다. */
  const bt = sh.backTo;
  if (bt) {
    if (!bt.alive) return false;
    const dx = bt.x - sh.x, dz = bt.z - sh.z, L = Math.hypot(dx, dz) || 1;
    const sp = (CFG.shotSpeed || 7.2) * 2.0;
    sh.x += dx / L * sp * dt; sh.z += dz / L * sp * dt;
    if (sh.mesh) sh.mesh.position.set(sh.x, 0.75, sh.z);
    if (L < (bt.r || 0.55) + 0.45) {
      showJudge('되받아침!');
      addCharge(CFG.preciseCharge || 10);
      hurtZombie(bt, 9999, 'counter-kill', S.lastDash);
      return false;
    }
    return sh.t < 3;
  }
  const b = S.boss;
  if (!b || !b.alive) return false;
  const dx = b.x - sh.x, dz = b.z - sh.z, L = Math.hypot(dx, dz) || 1;
  const sp = bossPat().volley.speed * 1.8;
  sh.x += dx / L * sp * dt; sh.z += dz / L * sp * dt;
  if (sh.mesh) sh.mesh.position.set(sh.x, 0.75, sh.z);
  if (L < b.r + 0.5) {
    showJudge('되받아침! 빈틈');
    if (b.state !== 'seal') {
      cutBoss(b);
      hurtZombie(b, 3.2, 'bang', S.lastDash);
    }
    return false;
  }
  return sh.t < 3;
}
/* 결계 수축: 결계가 조이는 동안 부적 기둥을 모두 베면 풀린다. 다 조이면 짓눌린다. */
function startShrink(z) {
  if (!S.arena || S.arena.shrink) return;
  const K = bossPat().shrink;
  S.arena.r0 = S.arena.r0 || S.arena.r;
  S.arena.shrink = { from: S.arena.r, to: K.to, t: 0, dur: K.t, pillars: [] };
  for (let i = 0; i < K.n; i++) {
    const a = Math.random() * 0.6 + i * Math.PI * 2 / K.n, rr = arenaR()-.35;
    const p = { id: ++S._id, kind: 'zombie', type: 'pillar', x: S.arena.x + Math.cos(a) * rr, z: S.arena.z + Math.sin(a) * rr, r: 0.6, alive: true, hp: 1, isPillar: true, frozen: 0, burn: 0, poison: 0, stun: 0, marked: false };
    p.edgeAngle=a;
    p.obj = makePillarObj();
    if (three) three.scene.add(p.obj);
    placeGroup(p.obj, p.x, p.z);
    S.zombies.push(p);
    S.arena.shrink.pillars.push(p);
  }
  bossCue(z, 'jade', 'shrink');
  assignSpiritTargets();
}
/* v0.34 §14 보스전 풀: 기둥·기물은 한 번 만들어 돌려 쓴다(최대 개수 고정). */
const PILLAR_POOL_MAX = 6;
const pillarPool = [];
function makePillarObj() {
  const g = new THREE.Group();
  if (!three) return g;
  if (!geosPillar.body) {
    geosPillar.body = new THREE.CylinderGeometry(0.32, 0.42, 2.6, 10);
    geosPillar.band = new THREE.BoxGeometry(0.5, 1.4, 0.06);
    geosPillar.bodyMat = new THREE.MeshBasicMaterial({ color: 0x6a2a20 });
    geosPillar.bandMat = new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  }
  const body = new THREE.Mesh(geosPillar.body, geosPillar.bodyMat);
  body.position.y = 1.3;
  g.add(body);
  const band = new THREE.Mesh(geosPillar.band, geosPillar.bandMat);
  band.position.set(0, 1.5, 0.4);
  g.add(band);
  g.userData.pillar = true;
  return g;
}
const geosPillar = {};
function breakPillar(p) {
  if (!p.alive) return;
  p.alive = false;
  if (p.obj && three) three.scene.remove(p.obj);
  if (art && art.playFx && three) { const fx = art.playFx(three.scene, 'ink-splat', p.x, p.z, 1.6); if (fx) three.fx.push(fx); }
  if (audio) audio.hit();
  const sk = S.arena && S.arena.shrink;
  const left = sk ? sk.pillars.filter(function (q) { return q.alive; }).length : 0;
  showJudge('기둥 ' + (sk ? sk.pillars.length - left : 0) + '/' + (sk ? sk.pillars.length : 0));
  assignSpiritTargets();
  if (sk && !left) {
    endShrink(false);
    showJudge('결계 해제');
    if (S.boss && S.boss.alive) bossPoise(S.boss, 1);
  }
}
function endShrink(crush) {
  const sk = S.arena && S.arena.shrink;
  if (!sk) return;
  /* §3.4 대응 2개: 기둥을 2개 이상 부쉈으면 짓눌림이 가볍다(피해 1). */
  const broken = sk.pillars.filter(function (p) { return !p.alive; }).length;
  sk.pillars.forEach(function (p) { if (p.alive) { p.alive = false; if (p.obj && three) three.scene.remove(p.obj); } });
  S.arena.shrink = null;
  S.arena.r = S.arena.r0 || CFG.arenaR || 12;
  if (three && three.arena) three.arena.group.scale.set(1, 1, 1);
  if (crush) heroHurtForce(broken >= 2 ? 1 : bossPat().shrink.dmg, '좁아진 결계에 짓눌렸습니다.', { note: broken >= 2 });
  assignSpiritTargets();
}
function stepShrink(dt) {
  const sk = S && S.arena && S.arena.shrink;
  if (!sk) return;
  sk.t += dt;
  S.arena.r = sk.from + (sk.to - sk.from) * clamp(sk.t / sk.dur, 0, 1);
  const k = S.arena.r / (S.arena.r0 || sk.from);
  if (three && three.arena) three.arena.group.scale.set(k, 1, k);
  if (sk.t >= sk.dur + 0.5) endShrink(true);
}
/* 봉인 마무리: 순서를 다 베면 무릎 꿇는다. 획이 교차하는 한붓별(⛤)을 그려야 끝난다. */
function startSeal(z) {
  endBossSide(z);
  z.state = 'seal'; z.stateT = 0;
  refreshBossGlyphs(z);
  showJudge('봉인하라');
  bossCue(z, 'jade', 'seal');
}
function sealStroke() {
  const z = S && S.boss;
  if (!z || !z.alive || z.state !== 'seal') return false;
  z.sealed = true;
  z.state = 'sealing'; z.stateT = 0;
  S.sealFx = 0.9;
  S.slowT = Math.max(S.slowT || 0, 0.5);
  addHitstop(0.2);
  if (audio) { audio.explode(); audio.bell(0, 'bolt'); }
  inkFx.ring(6, FX_COLORS.gold, 0.8);
  showJudge('봉인(封印)');
  return true;
}
/** A stroke while the boss chants: right shape advances, wrong shape is spent. */
function chantStroke(type) {
  const z = S && S.boss;
  if (!z || !z.alive || z.state !== 'chant' || !z.chant) return false;
  const c = z.chant;
  if (type !== c.seq[c.i]) { showJudge('틀린 획'); if (audio && audio.whiff) audio.whiff(); return true; }
  c.i++;
  if (audio && audio.bellCut) audio.bellCut(0, type);
  if (c.i < c.seq.length) { showJudge('끊음 ' + c.i + '/' + c.seq.length); return true; }
  z.chant = null;
  z.state = 'stun'; z.stateT = 0; z.stunT = bossPat().chant.stun;
  showJudge('영창 파훼!');
  if (audio) audio.breakCue();
  notePatSeen('chant', 'break');
  telemetry.event('boss_pattern', { p: 'chant', result: 'break', t: 0 });
  bossPoise(z, 1);
  return true;
}
function bossPhaseCheck(z) {
  const B = bossCfg();
  const len = z.seq.length;
  if (B.phase2 && !z.phase2 && z.seqI >= Math.ceil(len / (B.phase3 ? 3 : 2))) {
    z.phase2 = true; z.phase = 2;
    S.shake = Math.max(S.shake || 0, 0.6);
    toast('귀물이 분노합니다 — 새 기술이 섞입니다');
    telemetry.event('boss_phase', { stage: S.stageNo, phase: 2, seqI: z.seqI });
  }
  /* §4.4 12장 3페이즈: 결계 반경 9m 고정 + 모든 예고 −10% */
  if (B.phase3 && !z.phase3 && z.seqI >= Math.ceil(len * 2 / 3)) {
    z.phase3 = true; z.phase = 3;
    S.phaseTele = CFG.phase3Tele || 0.9;
    if (S.arena) {
      S.arena.r0 = S.arena.r0 || S.arena.r;
      S.arena.r = Math.min(S.arena.r, CFG.phase3R || 9);
      S.arena.fixedR = S.arena.r;
      if (three && three.arena) {
        const k = S.arena.r / (S.arena.r0 || CFG.arenaR || 12);
        three.arena.group.scale.set(k, 1, k);
      }
    }
    S.shake = Math.max(S.shake || 0, 0.8);
    inkFx.ring(arenaR(), FX_COLORS.gold, 0.9);
    toast('나락이 조여 옵니다 — 결계 9m · 예고 −10%');
    showJudge('3페이즈');
    telemetry.event('boss_phase', { stage: S.stageNo, phase: 3, seqI: z.seqI, arena: S.arena ? +S.arena.r.toFixed(1) : null });
  }
}
/* v0.52: 보스 스킬명 + 대응 행동(회피/받아치기/파훼/봉인) + 정밀 타이밍 배너 데이터 생성 */
function bossBannerInfo(z) {
  if (!z || !z.alive) return null;
  const P = bossPat();
  const bt = bossTiming();
  const st = z.state;
  if (st === 'telegraph') {
    const dur = bt.teleT * (z.teleMul || 1);
    return { mode: 'dodge', name: '언월 쇄도', hint: '옆으로 일섬 회피', f: clamp((z.stateT || 0) / Math.max(0.01, dur), 0, 1), sweetStart: 0.78 };
  }
  if (st === 'slamTele' && z.slam) {
    return { mode: 'dodge', name: '혈월 내려찍기', hint: '원 밖으로 일섬', f: clamp((z.stateT || 0) / Math.max(0.01, z.slam.tele), 0, 1), sweetStart: 0.78 };
  }
  if (st === 'sweepTele' && z.sweep) {
    return { mode: 'dodge', name: '언월 횡참', hint: '등 뒤로 일섬', f: clamp((z.stateT || 0) / Math.max(0.01, z.sweep.tele), 0, 1), sweetStart: 0.78 };
  }
  if (st === 'volleyTele') {
    const dur = z.volleyTele || P.volley.tele;
    return { mode: 'dodge', name: '살부적 난사', hint: '금빛 부적은 탭 반사!', f: clamp((z.stateT || 0) / Math.max(0.01, dur), 0, 1), sweetStart: 0.78 };
  }
  if (st === 'mimicTele' && z.mimic) {
    return { mode: 'dodge', name: '궤적 흉내', hint: '직각으로 일섬 회피', f: clamp((z.mimic.t || 0) / Math.max(0.01, z.mimic.tele), 0, 1), sweetStart: 0.78 };
  }
  if (st === 'clones') {
    return { mode: 'break', name: '환영 분신', hint: '방울 울리는 본체 베기', f: clamp(1 - (z.stateT || 0) / Math.max(0.01, P.clones.t), 0, 1), sweetStart: 0.85 };
  }
  if (st === 'veil') {
    return { mode: 'break', name: '어둠 은신', hint: '비취 물결 쪽으로 베기', f: clamp(1 - (z.stateT || 0) / Math.max(0.01, P.veil.t), 0, 1), sweetStart: 0.85 };
  }
  if (st === 'shuffle' && z.shuffle) {
    return { mode: 'break', name: '무늬 뒤섞기', hint: z.shuffle.gold > 0 ? '★ 지금 베면 고정!' : '금빛 순간을 노려라', f: clamp(1 - (z.shuffle.t || 0) / Math.max(0.01, z.shuffle.dur), 0, 1), sweetStart: 0.8, sweetOpen: z.shuffle.gold > 0 };
  }
  /* v0.53: kiai(기합)·chant(영창)·clash(합 겨루기)·seal(봉인)은 상단 대신
     주인공 바로 아래 시선 고정대(drawKiaiFocalGauge / drawGestureFocalDock)에서 직접 표시해 시선 이동을 최소화한다. */
  return null;
}
/* 보스 패턴 그림: 예고 색 고리·문구, 기모으기 게이지, 내려찍기 원, 탄막 부채, 영창 무늬, 은신 방울, 기세, 봉인. */
function drawBossPat(ctx, r, hs) {
  const z = S.boss;
  if (z && z.alive) {
    const bInfo = bossBannerInfo(z);
    if (bInfo) bossFx.drawSkillBanner(ctx, r, bInfo, S.elapsed || 0);
  }
  if (S.sealFx > 0) {
    const k = clamp(S.sealFx / 0.9, 0, 1);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(Math.min(r.width, r.height) * 0.3) + 'px serif';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(232,192,74,' + (0.85 * k).toFixed(3) + ')';
    ctx.fillText('封', r.width * 0.5, r.height * 0.42);
    ctx.restore();
  }
  /* 기물: 발밑 보랏빛 고리. 다음에 쏠 기물은 쏘기 직전 밝게 맥동한다.
     §4.1: 지금 역류할 수 있는 순간(보스 예고 중)이면 고리가 금빛으로 바뀐다 — '받아쳐라'의 색이다. */
  if (z && z.alive) {
    const M = bossPat().summon, tt = S.elapsed || 0, wpc0 = worldPerCss();
    const canReflect = reflectReady();
    ctx.save();
    bossMinions().forEach(function (q) {
    const f = projectXZ(q.x, q.z, 0.05);
    const warn = q === S.totemNext && (S.totemShotT || 0) < M.shotWarn;
    ctx.lineWidth = canReflect ? 4 : (warn ? 4 : 2);
    const col = canReflect
      ? 'rgba(232,192,74,' + (0.65 + 0.35 * Math.sin(tt * 9)).toFixed(3) + ')'
      : (warn ? 'rgba(201,166,255,' + (0.6 + 0.4 * Math.sin(tt * 30)).toFixed(3) + ')' : 'rgba(201,166,255,0.45)');
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, 0.9 * wpc0, 0.5 * wpc0, 0, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();
  }
  if (!z || !z.alive || !bossPatList(z) || dist(z, S.hero) > ringR()) return;
  const P = bossPat(), t = S.elapsed || 0;
  const bp = projectXZ(z.x, z.z, 0.05), wpc = worldPerCss();
  /* 분신 중에는 진짜에게만 붙는 표시(예고 고리·문구·기세)를 숨긴다 — 진짜는 방울로만 가린다. */
  const onScr = !z.hidden && z.state !== 'clones' && bp.x > -40 && bp.y > -40 && bp.x < r.width + 40 && bp.y < r.height + 40;
  ctx.save();
  /* v0.54: 보스 발밑의 구식 2D 붉은/흰/금 타원 테두리 선 제거 — 3D 바닥 진법과 보스 발밑 HP 바·기세로 일원화 */
  if (S.firstPatIcon) {
    S.firstPatIcon.t -= frameDt;
    if (S.firstPatIcon.t <= 0) S.firstPatIcon = null;
  }
  /* 기모으기 게이지: v0.53 주인공 바로 아래 시선 고정대 대형 타이밍 게이지 + 소용돌이 */
  if (z.state === 'kiai' && z.kiai) {
    const K = P.kiai, T = z.kiai.t, f = clamp(z.stateT / T, 0, 1), g0 = (T - kiaiWin(K)) / T;
    const open = z.stateT >= T - kiaiWin(K), lock = z.kiai.lock;
    bossFx.drawKiaiFocalGauge(ctx, r, hs, f, g0, open, lock, t);
    if (onScr) bossFx.drawKiaiVortex(ctx, projectXZ, z.x, z.z, f, open && !lock, t, S.hero);
  }
  /* 내려찍기 예고: v0.52 커스텀 수묵 만다라 + 수렴 백금 타이밍 링 */
  if (z.state === 'slamTele' && z.slam) {
    const f = clamp(z.stateT / z.slam.tele, 0, 1);
    bossFx.drawSlamTele(ctx, projectXZ, z.slam.x, z.slam.z, P.slam.r, f, t);
  }
  /* 언월 횡참 예고: v0.53 3D 바닥 수묵 초승달 붓결 + 수렴 백금 칼날 호선 */
  if (z.state === 'sweepTele' && z.sweep) {
    const f = clamp(z.stateT / Math.max(0.01, z.sweep.tele), 0, 1);
    bossFx.drawSweepTele(ctx, projectXZ, z.x, z.z, z.sweep.aimA, z.sweep.arc, z.sweep.range, f, t);
  }
  /* 부적 탄막 예고: v0.53 공중 정렬 살부적 편대 + 갈필 먹연기 궤적 */
  if (z.state === 'volleyTele' && onScr) {
    const Vo = P.volley, f = clamp(z.stateT / (z.volleyTele || Vo.tele), 0, 1);
    bossFx.drawVolleyTele(ctx, projectXZ, z.x, z.z, z.aimA, Vo.n, Vo.spread, f, t, z.volleyGold);
  }
  /* 영창 중 회전 수묵 만다라 진법 */
  if (z.state === 'chant' && z.chant && onScr) {
    const f = clamp(z.stateT / (z.chantT || P.chant.t), 0, 1);
    bossFx.drawChantMandala(ctx, projectXZ, z.x, z.z, f, t);
  }
  /* 은신·분신의 방울: 소리가 나는 쪽 심안 가장자리에 비취 물결 */
  if ((z.state === 'veil' || z.state === 'clones') && z.ping > 0) {
    const p = projectXZ(z.x, z.z, 0.8), a = Math.atan2(p.y - hs.y, p.x - hs.x), k = z.ping / 0.6;
    const rr = (lastMarkMetrics.ring && lastMarkMetrics.ring.px) || 120;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(46,230,166,' + (0.85 * k).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(hs.x, hs.y, rr * (0.92 + 0.12 * (1 - k)), a - 0.3, a + 0.3); ctx.stroke();
  }
  /* v0.53 영창·봉인·합 겨루기: 주인공 바로 아래(엄지 위) 시선 고정대에 큼직하게 표시 */
  const want = z.state === 'chant' && z.chant
    ? { kind: 'chant', seq: z.chant.seq, i: z.chant.i, frac: 1 - clamp(z.stateT / Math.max(0.01, z.chantT || P.chant.t), 0, 1), title: '원혼 영창 — 순서대로 그려 끊어라' }
    : z.state === 'seal'
      ? { kind: 'seal', seq: ['star'], i: 0, frac: 1 - clamp(z.stateT / Math.max(0.01, P.seal.t), 0, 1), title: '귀물 봉인 — 교차별(★)을 그려라!' }
      : z.state === 'clash' && z.clash
        ? { kind: 'clash', seq: [z.clash.shape], i: 0, frac: 1 - clamp(z.clash.t / Math.max(0.01, z.clash.win), 0, 1), title: '합 겨루기 ' + Math.min(z.clash.i + 1, z.clash.need) + '/' + z.clash.need + ' — 즉시 베어라!' }
        : null;
  if (want) bossFx.drawGestureFocalDock(ctx, r, hs, want, t, brushMark);
  /* 결계 수축: 부적 기둥마다 발밑 금빛 고리와 빛기둥 */
  const sk = S.arena && S.arena.shrink;
  if (sk) {
    sk.pillars.forEach(function (p) {
      if (!p.alive) return;
      const f = projectXZ(p.x, p.z, 0.05), top = projectXZ(p.x, p.z, 4.2);
      ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
      ctx.strokeStyle = 'rgba(232,192,74,' + (0.65 + 0.3 * Math.sin(t * 6)).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 1.1 * wpc, 0.6 * wpc, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const g = ctx.createLinearGradient(f.x, f.y, top.x, top.y);
      g.addColorStop(0, 'rgba(255,210,90,0.55)'); g.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    });
  }
  /* 기세 붕괴: 보스 무릎 꿇기 모션 + 발밑 HP 바 금빛 '빈틈 ×1.3'으로 표시 */
  /* §4.4 8장 합 겨루기: v0.53 주인공 아래 시선 고정대(drawGestureFocalDock)로 통합 */
  /* §4.4 8장 흉내: v0.50 수묵·주홍 테이퍼 레인 */
  if ((z.state === 'mimicTele' || z.state === 'mimicCharge') && z.mimic) {
    const m = z.mimic;
    const f = z.state === 'mimicCharge' ? 1 : clamp(m.t / Math.max(0.01, m.tele), 0, 1);
    bossFx.drawChargeTele(ctx, projectXZ, z.x, z.z, z.x + m.dir.x * 11, z.z + m.dir.z * 11, f, t);
  }
  /* §4.4 12장 무늬 뒤석기: 금빛 테두리 0.4초 */
  if (z.state === 'shuffle' && z.shuffle) {
    const s = z.shuffle, gold = s.gold > 0;
    if (gold) {
      ctx.beginPath(); ctx.ellipse(bp.x, bp.y, 1.7 * wpc * 1.1, 1.0 * wpc * 1.1, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(232,192,74,0.95)'; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 13px serif';
    ctx.fillStyle = gold ? 'rgba(255,236,190,0.98)' : 'rgba(200,190,170,0.6)';
    ctx.fillText((s.locked ? '무늬 고정' : (gold ? '지금 — 무늬 고정' : '무늬가 바뀝니다')) + '  ' + Math.max(0, Math.ceil(s.dur - s.t)) + '초', r.width * 0.5, 118);
  }
  ctx.restore();
}
function maybeEnd() {
  if (!S || S.won || S.lost || !S.playing) return;
  if (S.hp <= 0) { endRun(false, challengeOf(S.challenge) ? challengeOf(S.challenge).name + '에서 쓰러졌습니다.' : '좀비에게 닿았습니다.'); return; }
  if (S.challenge) { challengeProgress(); return; }
  if (S.boss && !S.boss.alive) endRun(true, '귀물을 베었습니다.');
}
/* 별점 (v0.32 §7.4): 클리어 1 + (체력 50% 이상 **또는** 피격 3회 이하) 1 + 도전 과제 1.
   정점 장(4·8·12)의 세 번째 별은 패턴 공략, 나머지 장은 콤보(0.8배) 또는 지형 도전. 수련 모드는 2개까지(§7.2). */
function star3Info(st) {
  const s3 = (st && st.star3) || { kind: 'combo' };
  if (s3.kind === 'goal') {
    const g = S && S.goal;
    const done = !!(g && g.ok);
    return { kind: 'goal', text: s3.text || (g && g.label) || '부목표', have: done ? 1 : 0, need: 1, done: done,
      short: (s3.text || (g && g.label) || '부목표') + (g && g.fail ? ' (실패)' : ' ' + (done ? '1/1' : '0/1')) };
  }
  if (s3.kind === 'pattern') {
    const have = s3.counter === 'goldReflect' ? (S.goldReflectN || 0) : s3.counter === 'clashWin' ? (S.clashWin || 0) : (S.shuffleLock || 0);
    const need = s3.need || 2;
    return { kind: 'pattern', text: s3.text, have: have, need: need, done: have >= need, short: s3.text + ' ' + Math.min(have, need) + '/' + need };
  }
  const comboNeed = Math.ceil((st.starCombo || 10) * (CFG.star3ComboMul || 0.8));
  const byCombo = (S.comboMax || 0) >= comboNeed;
  let alt = null;
  if (s3.alt) {
    const have = (S.terrain && S.terrain.counts && S.terrain.counts[s3.alt.key]) || 0;
    alt = { text: s3.alt.text, have: have, need: s3.alt.need || 1, done: have >= (s3.alt.need || 1) };
  }
  return {
    kind: 'combo', comboNeed: comboNeed, byCombo: byCombo, alt: alt,
    text: '콤보 ' + comboNeed + (alt ? ' 또는 ' + alt.text : ''),
    done: byCombo || !!(alt && alt.done),
    short: '콤보 ' + Math.min(S.comboMax || 0, comboNeed) + '/' + comboNeed + (alt ? ' · ' + alt.text + ' ' + Math.min(alt.have, alt.need) + '/' + alt.need : '')
  };
}
function starsFor(win) {
  if (!S || !win) return 0;
  if (S.challenge) return 0;   /* 도전 모드는 별이 아니라 기록으로 남긴다 */
  const st = S.stage || {};
  let n = 1;
  if (S.hp / Math.max(1, maxHp()) >= 0.5 || (S.hits || 0) <= (CFG.star2Hits || 3)) n++;
  if (star3Info(st).done) n++;
  return Math.min(starCap(), n);
}
function endRun(win, msg) {
  if (!S || S.won || S.lost) return;
  if (audio && audio.setBossMode) audio.setBossMode(false);
  S.won = win; S.lost = !win; S.playing = false; S.paused = 'result'; S.dash = null;
  setDrawingActive(false);
  closeQuickCards();
  hideGuide();
  const sk = $('btnSkip');
  if (sk) sk.hidden = true;
  S.tutorial = null; S.tutSlow = 1;
  closeArena();
  const st = S.stage || stageOf(1);
  /* §6.2 11장 시간 공격: 목표는 '줄어든 시간에 클리어' — 이기면 달성이다. */
  if (win && S.goal && S.goal.id === 'timed' && !S.goal.fail) goalPass('줄어든 시간에 베었습니다');
  const stars = starsFor(win);
  const coinsGain = Math.max(0, save.coins - (S.coin0 || 0));
  const score = (S.kills || 0) * 10 + (S.comboMax || 0) * 5 + stars * 100 + (win ? 150 : 0);
  S.stars = stars; S.coinGain = coinsGain; S.score = score;
  if (!S.noScore) telemetry.event('income', { source: 'run', stage: st.id, seconds: Math.round(S.elapsed), coins: coinsGain });
  /* 타이틀 "수련" 다시 보기는 점수·별에 반영하지 않는다. */
  if (win && !S.noScore && !S.challenge) {
    save.stars = save.stars || {};
    save.stars[st.id] = Math.max(save.stars[st.id] || 0, stars);
    const next = Math.min(STAGES.length, (S.stageNo || st.id) + 1);
    save.stage = Math.max(save.stage || 1, S.stageNo >= STAGES.length ? STAGES.length : next);
    /* v0.23: 막의 마지막 장을 깨면 다음 막이 열린다. 마지막 장이면 올 클리어. */
    if ((st.id % 4) === 0) {
      if (st.id < STAGES.length) toast('제' + (actOf(st.id) + 1) + '막 「' + ACT_NAMES[actOf(st.id) + 1] + '」 열림');
      else toast('올 클리어 — 나락의 끝을 베었습니다');
    }
    renderStageSelect(st.id);
  }
  if (!S.noScore) save.bestScore = Math.max(save.bestScore || 0, score);
  /* v0.30 §7.3: 같은 장 연승/연패. 이기면 0으로 돌아간다. */
  const streakBefore = S.streak || 0;
  S.streakAfter = S.noScore ? streakBefore : bumpStreak(st.id, !!win);
  persist();
  /* §13 데이터: 판 결과·사망 원인·fps. 상용 튜닝(클리어율·시간 예산·공정성)의 바탕이다. */
  const fprep = fpsReport();
  const timeUp = !win && (S.timeLeft || 0) <= 0;
  telemetry.event('stage_end', {
    stage: S.stageNo || st.id, win: !!win, time: +(S.elapsed || 0).toFixed(1),
    hp: Math.max(0, S.hp), hpMax: maxHp(), stars: stars, kills: S.kills || 0,
    comboMax: S.comboMax || 0, level: S.level || 1, bossState: S.boss ? S.boss.state : null,
    mode: S.mode || save.mode, timeUp: timeUp,
    bossFight: (S.bossSeenAt && S.boss) ? +((S.elapsed || 0) - S.bossSeenAt).toFixed(1) : 0,
    timeLeft: +(S.timeLeft || 0).toFixed(1), streak: streakBefore, help: (S.help || []).slice(),
    hits: S.hits || 0, terrain: S.terrain ? { rule: S.terrain.kind, counts: Object.assign({}, S.terrain.counts) } : null,
    star3: star3Info(S.stage).done, goldReflect: S.goldReflectN || 0, clashWin: S.clashWin || 0, shuffleLock: S.shuffleLock || 0,
    goal: S.goal ? { id: S.goal.id, ok: !!S.goal.ok, fail: !!S.goal.fail, t: +(S.goal.t || 0).toFixed(1) } : null
  });
  if (!win) telemetry.event('death', { cause: S.deathWhy || msg, hp: Math.max(0, S.hp), bossState: S.boss ? S.boss.state : null, t: +(S.elapsed || 0).toFixed(1) });
  telemetry.event('fps', { stage: S.stageNo || st.id, avg: +fprep.avg.toFixed(1), low: +fprep.min.toFixed(1), q: (three && three.bloom) ? three.bloom.quality : null });
  telemetry.save();
  if (audio) audio.stopBgm();
  const nextSt = STAGES[(S.stageNo || st.id)];
  $('resultKicker').textContent = S.stageNo ? (S.stageNo + '장 · ' + st.name + ' · ' + curMode().name) : '연습';
  $('resultTitle').textContent = win ? '베었다' : '쓰러졌다';
  S.goldStar = !!(win && curMode().gold);
  const starsEl = $('resultStars');
  if (win) {
    starsEl.classList.remove('defeat-seal');
    starsEl.setAttribute('aria-label', '획득 별 ' + stars + '/3' + (S.goldStar ? ' · 금별' : ''));
    starsEl.innerHTML = [0, 1, 2].map(function (i) {
      return '<i aria-hidden="true" class="' + (i < stars ? 'on' : '') + (i < stars && S.goldStar ? ' gold' : '') + '">★</i>';
    }).join('') + (S.goldStar ? '<em class="gold-star">금별</em>' : '');
  } else {
    starsEl.classList.add('defeat-seal');
    starsEl.setAttribute('aria-label', '전투 패배 · 획득 별 0/3');
    starsEl.textContent = '敗 · 다시 일어서라';
  }
  $('resultBody').textContent = win ? (msg || '') : (msg || '') + ' 다시 한 번.';
  const hpPct = Math.round((S.hp / Math.max(1, maxHp())) * 100);
  $('resultStats').innerHTML = [
    ['처치', (S.kills || 0) + '기'],
    ['최대 콤보', (S.comboMax || 0)],
    ['획득 엽전', '+' + coinsGain],
    ['부순 항아리', (S.jarsBroken || 0) + '개'],
    ['남은 체력', Math.max(0, hpPct) + '%']
  ].map(function (r) {
    return '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>';
  }).join('');
  let note = '';
  if (S.challenge) {
    const c = challengeOf(S.challenge);
    if (c && S.challenge === 'bossrush') note = '보스 러시 ' + (S.bossIdx || 0) + '/' + STAGES.length + ' · 최고 기록 ' + (save.records.bossrush || 0);
    else if (c && S.challenge === 'endless') note = '무한 심연 — 귀물 ' + (S.endlessBossN || 0) + ' · 최고 기록 ' + (save.records.endless || 0);
    else if (c) note = c.name + ' — 무늬 ' + (S.trialPool || []).map(function (k) { return SHAPE_MARK[k] || k; }).join(' ');
  } else if (win && stars < 3 && stars < starCap()) {
    const lack = [];
    if (S.hp / Math.max(1, maxHp()) < 0.5 && (S.hits || 0) > (CFG.star2Hits || 3)) lack.push('체력 50% 이상 또는 피격 3회 이하(지금 ' + (S.hits || 0) + '회)');
    const s3i = star3Info(st);
    if (!s3i.done) lack.push(s3i.short);
    note = '★ 더 받으려면: ' + lack.join(' · ');
  } else if (win && starCap() < 3) {
    note = '수련 모드는 별 2개까지입니다 — 정석에서 세 번째 별을 노리세요.';
  } else if (!win && timeUp) {
    note = '시간이 모자랐습니다 — 보스의 빈틈에 집중하거나 모드를 바꿔 보세요.';
  } else if (!win) {
    note = '보스의 도형 순서를 끝까지 베면 클리어입니다.';
  }
  $('resultNext').textContent = note;
  /* §7.3 투명성: 이번 판에 어떤 도움이 들어갔는지 결과 화면에 작게 남긴다. */
  const helpEl = $('resultHelp');
  if (helpEl) {
    const hs = (S.help && S.help.length) ? S.help.slice() : [];
    helpEl.textContent = hs.length ? ('도움이 적용됐다 — ' + hs.join(' · ')) : '';
    helpEl.hidden = !hs.length;
  }
  /* §7.2 수련 권유(3연패 이상, 정석 모드): 강요하지 않고 한 번만 권한다. */
  const offerKey = st.id + ':' + (S.streakAfter || 0);
  const offerBox = $('btnTrainOffer');
  if (offerBox) {
    const offer = !win && (S.streakAfter || 0) >= 3 && curMode().id === 'jeongseok' && save.trainOffered !== offerKey;
    offerBox.hidden = !offer;
    if (offer) offerBox.textContent = '수련 모드로 한 판';
  }
  if (win && nextSt) {
    $('btnResultGo').textContent = '다음 장 — ' + nextSt.name;
    S.nextStage = nextSt.id;
  } else if (win) {
    $('btnResultGo').textContent = '다시 도전';
    S.nextStage = null;
  } else {
    $('btnResultGo').textContent = '다시 도전';
    S.nextStage = null;
  }
  $('btnResultGo').classList.toggle('long', $('btnResultGo').textContent.length > 8);
  showOv('ov-result');
  renderHud();
}

/* v0.43: 무리 간 간격 유지(separation). 좁은 무리에서 서로 밀어내 한 덩어리로 겹치지 않게 한다.
   비용: 살아 있는 잔몹 n 에 대해 n(n-1)/2 거리 비교(상한 45마리 → 1천 회 내외). */
function separateCrowd(dt) {
  if (!S || !S.zombies || S.zombies.length < 2) return;
  const list = [];
  for (let i = 0; i < S.zombies.length; i++) {
    const z = S.zombies[i];
    if (z && z.alive && !z.isBoss && !z.isClone && !z.isPillar && !z.isTotem) list.push(z);
  }
  const n = list.length;
  if (n < 2) return;
  const k = Math.min(1, dt * 14) * 0.5;
  for (let i = 0; i < n; i++) {
    const a = list[i];
    for (let j = i + 1; j < n; j++) {
      const b = list[j];
      const dx = a.x - b.x, dz = a.z - b.z;
      const min = (a.r + b.r) * 0.92;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.001;
      const push = (min - d) * k;
      const ux = dx / d, uz = dz / d;
      if (!(a.frozen > 0)) { a.x += ux * push; a.z += uz * push; }
      if (!(b.frozen > 0)) { b.x -= ux * push; b.z -= uz * push; }
    }
  }
}
function step(dt) {
  if (!S || !S.playing || S.paused) return;
  if (S.boss?.alive && !S.boss.hp) {
    stepBoss(S.boss,dt);
    if (S.boss?.alive && art.tickChar) art.tickChar(S.boss.obj,'boss','boss:'+S.boss.state,dt,0,0);
    return;
  }
  S.elapsed += dt; S.timeLeft -= dt;
  if (S.iframe > 0) S.iframe -= dt;
  if (S.parryCd > 0) S.parryCd = Math.max(0, S.parryCd - dt);
  if (S.armorJudgeT > 0) S.armorJudgeT = Math.max(0, S.armorJudgeT - dt);
  if (S.parryFlash > 0) S.parryFlash = Math.max(0, S.parryFlash - dt);
  if (S.cleaveFx > 0) S.cleaveFx = Math.max(0, S.cleaveFx - dt);
  if (S.cleaveFx <= 0 && S._cleaveLv > 0 && !S.paused && S.playing) {
    const n = S._cleaveLv;
    S._cleaveLv = 0;
    if (n > 1) S._pendingLv = (S._pendingLv || 0) + (n - 1);
    openLevelUp();
  }
  if (S.fogPulse > 0) S.fogPulse = Math.max(0, S.fogPulse - dt / 0.6);
  if (S.comboGrace > 0) S.comboGrace = Math.max(0, S.comboGrace - dt);
  if (S.inputQueue) {
    const busy = !!S.dash || (S.dashQueue && S.dashQueue.length) || !!(S.terrain && S.terrain.stumbleT > 0);
    S.inputQueue.prune(now(), busy);
    S.inputBuf = S.inputQueue.peek();
  } else if (S.inputBuf) {
    const busy = !!S.dash || (S.dashQueue && S.dashQueue.length);
    const age = now() - S.inputBuf.t0;
    if ((!busy && age > (S.inputBuf.ttl || 450) + 350) || age > 1400) S.inputBuf = null;
  }
  if (S.landRipple && S.landRipple.t > 0) {
    S.landRipple.t -= dt / (S.landRipple.dur || 0.45);
    if (S.landRipple.t <= 0) S.landRipple = null;
  }
  if (S.bounce && !S.dash) {
    S.bounce.t += dt;
    const u = clamp(S.bounce.t / (S.bounce.dur || 0.16), 0, 1);
    const k = 1 - (1 - u) * (1 - u);
    S.hero.x = S.bounce.from.x + (S.bounce.to.x - S.bounce.from.x) * k;
    S.hero.z = S.bounce.from.z + (S.bounce.to.z - S.bounce.from.z) * k;
    if (three && three.heroSpr) placeGroup(three.heroSpr, S.hero.x, S.hero.z);
    if (u >= 1) S.bounce = null;
  }
  if (S.hurtFlash > 0) {
    S.hurtFlash -= dt;
    if (S.hurtFlash <= 0) {
      S.hurtFlash = 0;
      const app = $('app');
      if (app) app.classList.remove('hurt');
    }
  }
  if (S.practiceT > 0) S.practiceT -= dt;
  if (S.sightWave > 0 && !qa.freezeWave) S.sightWave = Math.max(0, S.sightWave - dt / (CFG.sightWaveDur || 0.45));
  if (S.combo > 0) {
    /* 선입력으로 이어진 연쇄는 판정을 조금 더 봐준다. */
    if (!(S.comboGrace > 0)) {
      S.comboIdle = (S.comboIdle || 0) + dt;
      if (S.comboIdle > (CFG.comboTimeout || 2.8)) { comboBreak(); S.comboIdle = 0; }
    }
  }
  if (S.comboFlash > 0) {
    S.comboFlash = Math.max(0, S.comboFlash - dt);
    if (S.comboFlash <= 0 && $('comboLabel')) $('comboLabel').classList.remove('tier');
  }
  if (S.tempElem && S.tempElem.t > 0) {
    S.tempElem.t -= dt;
    if (S.tempElem.t <= 0) { S.tempElem = null; renderHud(); }
  }
  if (S.bellT > 0) {
    S.bellT -= dt;
    if (S.bellT <= 0) endBell();
  }
  const bossTriggerAt = devBossNow ? 1.2 : ((S.stage && S.stage.bossAt) || CFG.bossAt);
  if (!S.sandbox && !S.challenge && !S.bossSpawned && S.elapsed >= bossTriggerAt) {
    /* §7.2: 보스 무늬 수에 모드 보정(수련 −2 · 고수 +2). 최소 2개. */
    const nShapes = Math.max(2, (((S.stage && S.stage.bossShapes) || CFG.bossShapes) + (S.bossShapeAdj || 0) - (relicOn(save, 'tower') ? 1 : 0)));
    S.bossSeenAt = S.elapsed;
    telemetry.event('boss_seen', { stage: S.stageNo, mode: S.mode, at: +(S.elapsed || 0).toFixed(1), left: +(S.timeLeft || 0).toFixed(1), shapes: nShapes });
    spawnBoss({ r: CFG.bossSpawnR, nShapes: nShapes });
    toast('부적을 단 귀물이 다가옵니다 — 결계가 내려앉습니다');
  }
  const bossAlive = !!(S.boss && S.boss.alive);
  if (bossAlive && !S.sandbox) stepBossSummons(dt);
  /* 중간 정예(보스 전 엘리트) — 스테이지별 1회 */
  if (!S.sandbox && !bossAlive && S.eliteAt > 0 && !S.eliteDone && S.elapsed >= S.eliteAt) {
    S.eliteDone = true;
    spawnEliteEvent();
  }
  /* 포위 웨이브 (스테이지별 스케줄). 보스 결계 안에서는 잔몹을 부르지 않는다. */
  if (!S.sandbox && !bossAlive && S.challenge !== 'bossrush') {
    stageWaves().forEach(function (w) {
      if (!S.waveDone[w.t] && S.elapsed >= w.t) fireWave(w);
    });
  }
  const wave = 1 + 0.7 * clamp(S.elapsed / runLimit(), 0, 1);
  if (!S.sandbox && !bossAlive) {
    S.zAcc += dt * 1000;
    S.sAcc += dt * 1000;
    const SP = (S.stage && S.stage.spawn) || {};
    const practicing = (S.practiceT > 0) && (S.practiceSpawns > 0);
    const delayed = S.elapsed < (CFG.spawnZombieDelay || 12);
    const early = S.elapsed < (CFG.earlyZombieUntil || 25);
    let zMax = SP.max || CFG.spawnZombieMax || 20;
    let zBase = SP.ms || CFG.spawnZombieMs;
    if (practicing) { zMax = CFG.practiceZombieMax || 2; zBase = CFG.practiceZombieMs || 3200; }
    else if (delayed) { S.zAcc = 0; zMax = 0; }
    else if (early) { zMax = SP.earlyMax || CFG.earlyZombieMax || 4; zBase = Math.max(zBase, SP.earlyMinMs || CFG.earlyZombieMinMs || 2000); }
    const zms = Math.max(CFG.spawnZombieMinMs || 450, zBase / (practicing || delayed ? 1 : wave));
    /* v0.43 최적화: 잔몹 수를 한 번만 세고(예전엔 매 프레임 some+filter 로 배열 2개를 새로 만들었다)
       스폰할 때마다 +1 한다. 스폰 루프 안에서 다시 filter 하지 않는다. */
    let aliveNormal = 0;
    for (let i = 0; i < S.zombies.length; i++) {
      const z = S.zombies[i];
      if (z && z.alive && !z.isBoss) aliveNormal++;
    }
    /* 귀물이 하나도 남지 않았으면 다음 스폰을 기다리지 않고 바로 한 마리 내보낸다(비는 시간 0). */
    if (zMax > 0 && aliveNormal === 0) S.zAcc = Math.max(S.zAcc, zms);
    let guardSpawn = 0;
    while (zMax > 0 && S.zAcc >= zms && aliveNormal < zMax && guardSpawn++ < 8) {
      S.zAcc -= zms; spawnZombie(); aliveNormal++;
    }
    stepSpirits(dt);
  } else {
    stepSpirits(dt);
  }
  /* v0.31 QA: autoEvery(초)를 주면 자동 플레이가 그 간격으로만 획을 낸다 — 사람의 손 속도 대역. */
  const autoGo = qa.autoStroke && (!qa.autoEvery || S.elapsed >= (S._autoNext || 0));
  if (autoGo) {
    let guard = 0;
    const burst = (qa.timeScale && qa.timeScale > 4) ? 32 : 1;
    while (guard < burst && S.playing && !S.paused) {
      guard++;
      if (S.dash) {
        finishCurrentDash();
        if (!S.playing || S.paused) break;
        continue;
      }
      if (S.dashQueue && S.dashQueue.length) { startSeg(); continue; }
      let sh = null;
      /* v0.26 QA 자동 대응: 봉인·기모으기·영창·은신·분신은 정답 입력을 대신 넣는다. */
      const qb = S.boss;
      if (qb && qb.alive && qa.autoBoss !== false && bossPatList(qb)) {
        if (qb.state === 'seal') { sealStroke(); break; }
        if (qb.state === 'sealing' || qb.state === 'slamTele') break;
        if (qb.state === 'kiai') { if (qb.kiai && qb.stateT >= qb.kiai.t - kiaiWin(bossPat().kiai) * 0.5) kiaiTap(); break; }
        if (qb.state === 'chant' && qb.chant) { chantStroke(qb.chant.seq[qb.chant.i]); break; }
        if (qb.state === 'veil' || qb.state === 'clones') { revealBoss(qb); dashAtBoss(qb, 'hline'); continue; }
      }
      if (S.boss && S.boss.alive) {
        const lock = livingMarks().filter(function (s) { return s.target && s.target.isBoss; })[0];
        sh = lock ? spiritShape(lock) : (S.boss.seq && S.boss.seq[S.boss.seqI]);
      } else {
        const counts = {};
        livingMarks().forEach(function (s) {
          const k = spiritShape(s);
          counts[k] = (counts[k] || 0) + 1;
        });
        let n = 0;
        Object.keys(counts).forEach(function (k) { if (counts[k] > n) { n = counts[k]; sh = k; } });
      }
      if (!sh) break;
      beginDash(sh);
      if (qa.autoEvery) S._autoNext = S.elapsed + qa.autoEvery;
      if (!S.dash && !(S.dashQueue && S.dashQueue.length)) break;
    }
  }
  tickStatuses(dt);
  const zsp = CFG.zombieSpeed * wave * (S.elapsed < 20 ? 0.65 : 1) * modeSpd() * terrainSpeedMul();
  /* §6.1 지형 주기 효과(4장 달빛·5장 안개·9장 재생·11장 포대·12장 끌림) */
  onTick(dt);
  /* §6.2 장별 부목표 */
  tickGoal(dt);
  const goalPos = (S.goal && S.goal.id === 'guard' && S.goal.pos) ? S.goal.pos : null;
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
    if (z.isClone || z.isPillar || z.isTotem) {
      if (S.arena && z.edgeAngle!=null) {const r=arenaR()-.35;z.x=S.arena.x+r*Math.cos(z.edgeAngle);z.z=S.arena.z+r*Math.sin(z.edgeAngle);}
      placeGroup(z.obj, z.x, z.z);
      if (z.isClone && art.tickChar) art.tickChar(z.obj, 'boss', 'idle', Math.min(0.05, dt), S.hero.x - z.x, S.hero.z - z.z);
      return;
    }
    const d = dist(z, S.hero) || 0.001;
    const frozen = z.frozen > 0 || (z.stun || 0) > 0;
    if (z.flinchT > 0) z.flinchT = Math.max(0, z.flinchT - dt);
    /* v0.43 적 AI: 접촉 피해 몹도 '치기 전 동작'을 한다.
       사거리에 들어오면 0.34초 몸을 웅크려(공격 포즈) 거의 멈추고, 그 뒤에야 닿는다.
       → 때리는 순간이 눈에 보이고, 플레이어가 비켜설 틈이 생긴다. */
    const clubAttack = !z.isBoss && z.type === 'brute';
    let clubImpact = false;
    if (clubAttack && (frozen || z.flinchT > 0)) z.atkTele = 0;
    if (!z.isBoss && !frozen) {
      z.atkCd = Math.max(0, (z.atkCd || 0) - dt);
      if (z.atkTele > 0) {
        z.atkTele -= dt;
        if (z.atkTele <= 0) {
          z.atkTele = 0;
          clubImpact = clubAttack && !(z.flinchT > 0);
        }
      } else if (z.atkCd <= 0 && d < z.r + 1.55 && !S.dash && !(clubAttack && z.flinchT > 0)) {
        const windup = clubAttack ? CLUB_IMPACT_TIME : (CFG.atkTele || 0.34);
        z.atkTele = windup;
        z.atkCd = windup + (CFG.atkCool || 0.95);
        if (clubAttack) z.clubAim = Math.atan2(S.hero.z - z.z, S.hero.x - z.x);
      }
    }
    const bossHandled = z.isBoss ? (frozen || stepBoss(z, dt)) : (qa.noMove ? false : stepEnemySpecial(z, dt, d, frozen, zsp));
    if (!qa.noMove && !frozen && !bossHandled && !(z.flinchT > 0 && !z.isBoss)) {
      const kd = CFG.zombieTypes[z.type] || CFG.zombieTypes.imp;
      /* The boss speeds up the farther it is outside the ring, so a dashing hero cannot outrun it. */
      let sp = z.isBoss ? (CFG.bossSpeed || 1) * (1 + (CFG.bossCatchUp || 0) * Math.max(0, d - ringR())) : zsp * kd.speed * slowMulOf(z) * terrainSlowMul(z);
      /* 공격 예비 동작 동안은 발이 묶인다(웅크린 채로 밀고 들어오지 않는다). */
      if (!z.isBoss && z.atkTele > 0) sp *= CFG.atkTeleSp || 0.22;
      /* §6.2 수호: 석등을 노리는 무리는 주인공이 아니라 석등으로 간다. */
      const tgt = (z.goalTarget && goalPos) ? goalPos : S.hero;
      const md = Math.hypot(tgt.x - z.x, tgt.z - z.z) || 0.001;
      const ux = (tgt.x - z.x) / md, uz = (tgt.z - z.z) / md;
      /* v0.43: 살짝 측면으로 우회 기동 — 한 줄로 곧장 몰려오지 않는다. */
      if (!z.isBoss) {
        if (!z.sw) z.sw = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.7);
        const lat = Math.sin((S.elapsed || 0) * 1.15 + (z.id || 0) * 1.7) * (CFG.mobWeave || 0.26) * z.sw;
        z.x += (ux - uz * lat) * sp * dt;
        z.z += (uz + ux * lat) * sp * dt;
      } else {
        z.x += ux * sp * dt;
        z.z += uz * sp * dt;
      }
    }
    if (z.isBoss && z.state !== 'slamTele') z.leapY = 0;
    placeGroup(z.obj, z.x, z.z, z.isBoss ? (z.leapY || 0) : 0);
    if (art.tickChar) {
      const kind = z.isBoss ? 'boss' : 'zombie';
      /* v0.42 + v0.50: 보스는 도약 하강 중 slam(내려찍기) 자세로 전환, 돌진/예고 시 목표 방향 고정 */
      const bossSt = (z.state === 'slamTele' && (z.leapY || 0) > 0.1) ? 'slam' : (z.state || 'idle');
      const st = z.isBoss ? ('boss:' + bossSt)
        : (frozen ? 'frozen'
          : (z.flinchT > 0 ? 'hit'
            : ((z.windT || 0) > 0 || (z.dashPhase || 0) > 0 || (z.atkTele || 0) > 0 ? 'attack'
              : (z.burn > 0 ? 'burning' : (z.poison > 0 ? 'poisoned' : 'walk')))));
      const locked = clubAttack && (clubImpact || z.atkTele > 0);
      let vx = locked ? Math.cos(z.clubAim) : S.hero.x - z.x;
      let vz = locked ? Math.sin(z.clubAim) : S.hero.z - z.z;
      if (z.isBoss) {
        if (z.state === 'charge' && z.chargeDir) { vx = z.chargeDir.x; vz = z.chargeDir.z; }
        else if (z.state === 'mimicCharge' && z.mimic && z.mimic.dir) { vx = z.mimic.dir.x; vz = z.mimic.dir.z; }
        else if (z.state === 'telegraph' && z.aim) { vx = z.aim.x - z.x; vz = z.aim.z - z.z; }
        else if (z.state === 'slamTele' && z.slam) { vx = z.slam.x - z.x; vz = z.slam.z - z.z; }
        else if (z.state === 'sweepTele' && z.sweep) { vx = Math.cos(z.sweep.aimA); vz = Math.sin(z.sweep.aimA); }
      }
      art.tickChar(z.obj, kind, st, Math.min(0.05, dt), vx, vz);
    }
    /* Hit flash over the status tint (tintZombie resets the colour next frame). */
    if (z.flinchT > 0 && z.obj && z.obj.userData && z.obj.userData.sprite) {
      const fk = 1 + 1.6 * (z.flinchT / (CFG.flinchDur || 0.14));
      if (z.obj.userData.rig || z.obj.userData.m3d) art.tintChar(z.obj, fk, fk, fk * 0.95);
      else z.obj.userData.sprite.material.color.setRGB(fk, fk, fk * 0.95);
    }
    if (art.setTelegraph && !z.isBoss) art.setTelegraph(z.obj, !frozen && (clubAttack ? z.atkTele > 0 : d < (CFG.telegraphRange || 3.2) || z.windT > 0 || z.dashPhase > 0));
    const inContact = d < z.r + 0.55;
    const clubConnects = clubImpact && d < z.r + 1.55 &&
      (d <= 0.01 || Math.cos(z.clubAim) * (S.hero.x - z.x) + Math.sin(z.clubAim) * (S.hero.z - z.z) >= d * 0.5);
    if ((inContact || clubConnects) && !(z.isBoss && (z.hidden || z.state === 'seal' || z.state === 'sealing' || z.state === 'groggy'))) {
      /* 빙결·경직된 귀물은 몸이 굳은 사이 닿아도 해치지 못한다(얼음·충격이 실제로 방어가 된다). */
      if ((S.iframe || 0) <= 0 && !S.dash && !frozen && (!clubAttack || clubConnects)) {
        if (z.eliteAttr === 'ice') { addSlow(0.6, 1.2); showJudge('얼음 — 느려진다'); }
        if (mirrorSave('contact')) return;
        noteHit();
        S.hp -= modeDmg(z.isBoss ? (CFG.bossDmg || 2) : ((CFG.zombieTypes[z.type] || {}).dmg || CFG.dmg)) + relicDmgAdd();
        if (S.hp <= 0) S.deathWhy = z.isBoss ? 'boss-contact' : ('zombie:' + z.type);
        S.iframe = CFG.iframeMs / 1000;
        S.hitstop = Math.max(S.hitstop || 0, CFG.hitHitstop || 0.08);
        S.hurtFlash = CFG.hurtVignette || 0.3;
        const app = $('app');
        if (app) app.classList.add('hurt');
        const kn = CFG.hitKnock || 0.6;
        S.hero.x += (S.hero.x - z.x) / d * kn;
        S.hero.z += (S.hero.z - z.z) / d * kn;
        if (three && three.heroSpr) placeGroup(three.heroSpr, S.hero.x, S.hero.z);
        if (audio && audio.drum) audio.drum();
        renderHud();
        if (S.hp <= 0) { endRun(false, clubAttack ? '장정의 몽둥이에 맞았습니다. 예고가 끝나기 전에 일섬으로 벗어나세요.' : '귀물에게 닿았습니다.'); return; }
      }
      /* 일섬은 몸을 뚫고 지나간다 — 돌진 중에는 밀어내지 않는다(안 그러면 적을 앞으로 밀고 간다). */
      if (inContact && !S.dash) {
        const push = Math.max(1.2, z.r + 0.65);
        z.x = S.hero.x - (S.hero.x - z.x) / d * push;
        z.z = S.hero.z - (S.hero.z - z.z) / d * push;
      }
    }
  });
  /* v0.34 §6.3 정예 속성: 방울 정예는 주기적으로 몸을 봉인한다 */
  (S.zombies || []).forEach(function (z) {
    if (!z.alive || !z.eliteAttr) return;
    if (z.invuln > 0) z.invuln = Math.max(0, z.invuln - dt);
    if (z.eliteAttr === 'bell') {
      z.bellCd = (z.bellCd || 2.4) - dt;
      if (z.bellCd <= 0) {
        z.bellCd = 2.4; z.invuln = 0.5;
        if (audio && audio.bell) audio.bell(0, 'hline');
        inkFx.ring(2.0, FX_COLORS.gold, 0.4);
      }
    }
  });
  /* v0.43: 무리 간 간격 유지 — 한 점에 겹쳐 뭉치지 않게 서로를 살짝 민다. */
  if (!qa.noMove) separateCrowd(dt);
  /* v0.48: 무리도 고정 아레나 밖으로 나가지 않는다(절벽·난간 앞에서 멈춘다). */
  if (S.zombies.length) {
    const wb = worldBounds();
    if (wb) {
      const lim = wb.r + 0.35;
      for (let i = 0; i < S.zombies.length; i++) {
        const z = S.zombies[i];
        if (!z.alive || z.isClone || z.isPillar || z.isTotem) continue;
        const dx = z.x - wb.x, dz = z.z - wb.z, ro = Math.hypot(dx, dz);
        if (ro > lim) { const k = lim / ro; z.x = wb.x + dx * k; z.z = wb.z + dz * k; }
      }
    }
  }
  stepShots(dt);
  stepHazards(dt);
  stepShrink(dt);
  stepReflects(dt);
  stepGapBuffer();
  /* v0.31 §5.3 새 카드: 자동 스킬·메아리·먹 발자국 */
  stepWard(dt);
  stepBolt(dt);
  stepBolts(dt);
  stepEchoes(dt);
  stepInkSteps(dt);
  if (S.quick) tickQuick();
  if (S.goldEdge > 0) S.goldEdge = Math.max(0, S.goldEdge - dt);
  if (S.sealFx > 0) S.sealFx = Math.max(0, S.sealFx - dt);
  clampHeroToArena();
  refreshSpirits();
  S.items.slice().forEach(function (it) {
    if (!it.alive) return;
    /* 자석으로 날아오는 중 */
    if (it.home) {
      it.home.t += dt;
      const u = clamp(it.home.t / (it.home.dur || 0.18), 0, 1);
      const k = u * u;
      it.x = it.home.from.x + (S.hero.x - it.home.from.x) * k;
      it.z = it.home.from.z + (S.hero.z - it.home.from.z) * k;
      if (u >= 1) { collectItem(it, null); return; }
    } else {
      /* v0.23: 밟으면 줍는다(1.25m), 오래된 픽업은 안개 속으로 사라진다(24초). */
      const age = (S.elapsed || 0) - (it.born || 0);
      if (age > (CFG.itemLife || 24)) {
        it.alive = false;
        if (it.obj && three) three.scene.remove(it.obj);
        return;
      }
      if (Math.hypot(it.x - S.hero.x, it.z - S.hero.z) <= (CFG.autoPickR || 1.25)) { collectItem(it, null); return; }
    }
    placeGroup(it.obj, it.x, it.z, 0.2 + Math.sin(S.elapsed * 3 + it.id) * 0.08);
  });
  if (S.items.length > 48) S.items = S.items.filter(function (it) { return it.alive; });
  /* 시체 누적 정리(무한맵에서 장시간 플레이해도 배열이 자라지 않게) */
  if (S.zombies.length > 120) S.zombies = S.zombies.filter(function (z) { return z.alive; });
  renderHud();
  /* Check time after autoStroke/combat so a large timeScale dt cannot skip the last boss hit. */
  if (S.playing && S.timeLeft <= 0) {
    if (S.boss && !S.boss.alive) endRun(true, '시간을 버텼습니다.');
    else endRun(false, '시간이 끝났습니다.');
  }
  maybeEnd();
}

function finishCurrentDash() {
  if (!S || !S.dash) return;
  const d = S.dash;
  S.hero.x = d.to.x; S.hero.z = d.to.z;
  if (three && three.heroSpr) placeGroup(three.heroSpr, S.hero.x, S.hero.z);
  resolveDash(d);
  landDash(d);
  S.dash = null;
  startSeg();
}
function stepDash(dt) {
  if (!S || !S.dash) return;
  if (S.paused) return;
  const d = S.dash;
  d.t += dt;
  const u = clamp(d.t / d.dur, 0, 1);
  const k = u * u * (3 - 2 * u);
  S.hero.x = d.from.x + (d.to.x - d.from.x) * k;
  S.hero.z = d.from.z + (d.to.z - d.from.z) * k;
  if (three && three.heroSpr) placeGroup(three.heroSpr, S.hero.x, S.hero.z);
  if (u >= 0.85) resolveDash(d);
  /* v0.49.2 테일 캔슬: 판정이 끝난 뒤(u>=0.88) 예약된 후속 획이 대기 중이면 잔여 프레임을 생략하고 즉시 다음 일섬으로 연결 */
  const tailCancel = u >= 0.88 && d.judged && !(S.dashQueue && S.dashQueue.length) && S.inputQueue && S.inputQueue.size() > 0;
  if (u >= 1 || tailCancel) {
    if (tailCancel) {
      d.tailCanceled = true;
      S.hero.x = d.to.x; S.hero.z = d.to.z;
      if (three && three.heroSpr) placeGroup(three.heroSpr, S.hero.x, S.hero.z);
    }
    landDash(d); S.dash = null; startSeg();
  }
}

/* v0.48 부드러운 카메라 — 프레임 독립 지수 감속(exp)으로 두 단계(따라가기·시선)를 나눠 굴린다.
   v0.47까지는 `cam += (hero - cam) * dt * 6` 이라 저프레임에서 뚝뚝 끊기고(곱셈 계수가 dt 에 비례),
   돌진 시작·착지에서 화면이 튀었다. 이제 ① dt 와 무관한 계수 ② 돌진 방향으로 살짝 앞을 보는 시선
   ③ 무대 밖 허공을 비추지 않는 경계 패딩(초점 클램프)을 함께 쓴다. */
function camLerpK(tau, dt) { return 1 - Math.exp(-Math.max(0, dt) / Math.max(0.0001, tau)); }
let QA_CAM = null;   /* QA 전용: 특정 시점을 고정해 기물·동작을 클로즈업한다 */
function updateCam(dt) {
  if (!three) return;
  if (QA_CAM) {
    three.camera.position.set(QA_CAM.x, QA_CAM.y, QA_CAM.z);
    three.camera.lookAt(QA_CAM.tx, QA_CAM.ty, QA_CAM.tz);
    return;
  }
  const targetX = S ? S.hero.x : 0, targetZ = S ? S.hero.z : 0;
  if (!S) {
    /* 타이틀: 무대를 천천히 도는 고정 시점 — 3D 무대를 보여 준다. */
    const t = now() * 0.001;
    const a = Math.PI / 4 + Math.sin(t * 0.085) * 0.16;
    const rad = 20.4;
    three.camera.position.set(Math.cos(a) * rad, CFG.camOff.y, Math.sin(a) * rad);
    three.camera.lookAt(0, CFG.camLookY, 0);
    return;
  }
  /* 1단계 — 따라갈 목표: 영웅 + 돌진 방향 1.1m 앞 + 보스 쪽 2.6m */
  let tx = targetX, tz = targetZ;
  if (S.dash) {
    const dx = S.dash.to.x - S.dash.from.x, dz = S.dash.to.z - S.dash.from.z;
    const L = Math.hypot(dx, dz);
    if (L > 1e-4) { tx += dx / L * 1.1; tz += dz / L * 1.1; }
  }
  const b = S.boss;
  if (b && b.alive && !b.hidden && arenaActive()) {
    const bx = b.x - targetX, bz = b.z - targetZ, bd = Math.hypot(bx, bz) || 1;
    const k = Math.min(2.6, bd * 0.3);
    tx += bx / bd * k; tz += bz / bd * k;
  }
  /* 2단계 — 경계 패딩: 초점이 무대 가장자리를 넘어 허공을 비추지 않게 클램프한다.
     영웅이 울타리에 닿으면 화면 안에서 영웅이 가장자리로 걸어가고, 배경(절벽·병풍)은 그대로 남는다. */
  const wb = worldBounds();
  if (wb) {
    const R = Math.max(4, wb.r - 5.6);
    const dx = tx - wb.x, dz = tz - wb.z, ro = Math.hypot(dx, dz);
    if (ro > R) { tx = wb.x + dx * R / ro; tz = wb.z + dz * R / ro; }
  }
  /* 3단계 — 부드러운 추적(지수 감속). 따라가기 0.10s · 시선 0.17s 순차 이중 감쇠 = 관성 있는 무빙. */
  S.cam.x += (tx - S.cam.x) * camLerpK(0.10, dt);
  S.cam.z += (tz - S.cam.z) * camLerpK(0.10, dt);
  if (!S.focus) S.focus = { x: S.cam.x, z: S.cam.z };
  S.focus.x += (S.cam.x - S.focus.x) * camLerpK(0.17, dt);
  S.focus.z += (S.cam.z - S.focus.z) * camLerpK(0.17, dt);
  let sx = 0, sy = 0, sz = 0;
  if (S.recoil && S.recoil.t > 0) {
    S.recoil.t -= dt;
    const u = Math.max(0, S.recoil.t / (S.recoil.dur || 0.12));
    const a = (S.recoil.amp || 0.12) * u;
    sx += (S.recoil.x || 0) * a;
    sz += (S.recoil.z || 0) * a;
    if (S.recoil.t <= 0) S.recoil = null;
  }
  if (S.shake > 0) {
    S.shake -= dt;
    /* §11 흔들림을 줄이는 설정: 진동 폭 ×0.3(멀미 방지). */
    const a = S.shake * 0.55 * (a11yShake() ? 0.3 : 1);
    sx += (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a; sz += (Math.random() - 0.5) * a;
  }
  three.camera.position.set(S.focus.x + CFG.camOff.x + sx, CFG.camOff.y + sy, S.focus.z + CFG.camOff.z + sz);
  three.camera.lookAt(S.focus.x, CFG.camLookY, S.focus.z);
}

/* ---------- ink + input ---------- */
function resizeInk() {
  const c = $('ink'), r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(1, Math.floor(r.width * dpr));
  c.height = Math.max(1, Math.floor(r.height * dpr));
  c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function hexRgba(hex, a) {
  const h = String(hex || '#ffffff').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0, g = parseInt(h.slice(2, 4), 16) || 0, b = parseInt(h.slice(4, 6), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function paperRgba(a) {
  const pal = (art && art.pal) || {};
  const hex = (pal.paper || pal.paperRim || '#EDE3CF').replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function clearInk() {
  lastStroke = null;
  inkFade = 0;
  const c = $('ink');
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.restore();
}
function paintInk(pts, fading, color) {
  const c = $('ink');
  if (!c) return;
  const host = $('app') || c;
  const r = host.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.floor(r.width * dpr) || c.height !== Math.floor(r.height * dpr)) {
    c.width = Math.max(1, Math.floor(r.width * dpr));
    c.height = Math.max(1, Math.floor(r.height * dpr));
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!pts || pts.length < 2) return;
  const a = fading != null ? fading : 1;
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[i === 0 ? i + 1 : i - 1];
    const dx = p.x - q.x, dy = p.y - q.y, L = Math.hypot(dx, dy) || 1;
    const tt = i / (pts.length - 1);
    const w = (1.3 + 4.4 * Math.sin(Math.PI * tt)) * (0.72 + 0.28 * a);
    left.push({ x: p.x + -dy / L * w, y: p.y + dx / L * w });
    right.push({ x: p.x - -dy / L * w, y: p.y - dx / L * w });
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  /* v0.41: 획 자체도 '먹 붓 자국' — 바탕은 먹, 둘레는 한지 단면, 결은 붓털 텍스처. */
  ctx.fillStyle = color ? hexRgba(color, 0.62 * a) : 'rgba(20,17,16,' + (0.58 * a).toFixed(3) + ')';
  ctx.fill();
  /* v0.41: 획을 '한지 붓 자국'으로 — 붓털·금박 텍스처를 폴리곤에 채우고 크림 단면을 두른다. */
  if (brushTex.ink) {
    try {
      const b = paintInk._box || (paintInk._box = {});
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < left.length; i++) {
        x0 = Math.min(x0, left[i].x, right[i].x); x1 = Math.max(x1, left[i].x, right[i].x);
        y0 = Math.min(y0, left[i].y, right[i].y); y1 = Math.max(y1, left[i].y, right[i].y);
      }
      const pat = paintInk._pat || (paintInk._pat = ctx.createPattern(brushTex.ink, 'repeat'));
      if (pat) {
        if (pat.setTransform) { try { pat.setTransform(new DOMMatrix([0.5, 0, 0, 0.42, (x0 * 0.7) % 64, (y0 + (paintInk._t = (paintInk._t || 0) + 9)) % 64])); } catch (e) {} }
        ctx.save();
        ctx.globalAlpha = 0.62 * a;
        ctx.fillStyle = pat;
        ctx.fill();
        ctx.restore();
      }
      /* 다이컷 종이 단면: 바깥쪽 옅은 크림 테 */
      ctx.save();
      ctx.globalAlpha = 0.42 * a;
      ctx.strokeStyle = paperRgba(0.9);
      ctx.lineWidth = 1.1;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    } catch (e) {}
  }
  const dab = brushTex.splat || paintInk._dab;
  const dabIsSheet = dab === brushTex.splat;
  const dabW = dabIsSheet ? dab.width / 6 : 0;
  if (dab && dab.complete !== false) {
    let acc = 0, prev = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      acc += Math.hypot(p.x - prev.x, p.y - prev.y);
      if (acc >= 4) {
        const s = 7 + (i % 3);
        ctx.globalAlpha = 0.55 * a;
        if (dabIsSheet) {
          /* v0.41: 획 꼬리마다 잉크 흩날림 프레임을 찍는다(프레임은 위치로 고른다). */
          const fi = (i + (paintInk._n = (paintInk._n || 0) + 1)) % 6;
          ctx.drawImage(dab, fi * dabW, 0, dabW, dabW, p.x - s * 0.9, p.y - s * 0.9, s * 1.8, s * 1.8);
        } else {
          ctx.drawImage(dab, p.x - s / 2, p.y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
        acc = 0;
      }
      prev = p;
    }
  }
}
function localPts(e) {
  const r = $('ink').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
/* HUD 잠금(drawing-active): 제스처 획이 실제로 판정되는 동안에만 #hud/#quickCards를 어둡게 하고 터치를 잠근다.
   예전에는 #app pointerdown마다 잠겨서, 이동 드래그 중에도 HUD가 72%로 흐려지고 둘째 손가락의 일시정지·빠른 카드가 막혔다.
   이제 game.js가 획 인식 결과(type/조준 대상)가 난 순간에만 켜고, 손을 떼거나 획이 사라지면 바로 푼다. */
let _hudLock = false;
function setDrawingActive(on) {
  on = !!on;
  if (on === _hudLock) return;
  _hudLock = on;
  try { document.body.classList.toggle('drawing-active', on); } catch (e) {}
}
function onDown(e) {
  if (pointers.down) return;
  if (e.target.closest && e.target.closest('.ov.show, .btn, #hudBtns button')) return;
  /* §5.2 멈추지 않는 선택: 화면 아래 22%의 탭은 카드 고르기 — 패링과 겹치지 않게 비워 둔다. */
  if (S && S.quick) {
    const p = localPts(e);
    if (p.y >= viewBox().height * (1 - (CFG.quick.zone || 0.22))) return;
  }
  pointers.down = true; pointers.id = e.pointerId; pointers.pts = [localPts(e)];
  setDrawingActive(false);
  try { $('app').setPointerCapture(e.pointerId); } catch (err) {}
  paintInk(pointers.pts, 1);
}
function onMove(e) {
  if (!pointers.down || e.pointerId !== pointers.id) return;
  const p = localPts(e), last = pointers.pts[pointers.pts.length - 1];
  if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1) pointers.pts.push(p);
  const chipped = pointers._chip && pointers._chip.color;
  paintInk(pointers.pts, 1, chipped);
  if (S && S.playing && !S.paused && pointers.pts.length >= 3 && G && G.recognize) {
    const rec = G.recognize(pointers.pts, { allowBolt: true });
    const res = resolveStrokeType(rec, pointers.pts);
    const type = res.type;
    let aim = null, to = null;
    if (type && type !== 'tap' && type !== 'circle') {
      const dir = AUTO_TARGET[type] ? null : strokeAimDir(pointers.pts, type);
      if (S.sandbox || !S.pool || S.pool.indexOf(type) >= 0) aim = pickSpirits(type, 1, S.hero, dir, null)[0] || null;
      if (aim && (now() - (pointers._prevT || 0) > 12)) {
        pointers._prevT = now();
        const end = dashEndPoint(S.hero, aim);
        to = { x: end.x, z: end.z };
      }
    }
    S.aimTarget = aim;
    const color = inkColorFor(type);
    pointers._chip = { x: p.x, y: p.y, type: type, conf: rec.bestScore || 0, color: color, hint: type ? '' : ambiguousHint(rec) };
    S.preview = {
      show: !!to, to: to,
      chip: pointers._chip
    };
    paintInk(pointers.pts, 1, color);
    updateMarks();
    /* HUD 잠금은 '지금 쓸 수 있는 제스처 획'이 판정된 때만 켠다.
       - tap(짧은 탭 = 칼잡 패링)은 손을 때며 바로 끝나므로 잠그지 않는다.
       - 아직 배우지 않은 무늬(획은 인식됐지만 pool에 없음)도 잠그지 않는다.
       - 혼령/기물 조준(to)이 걸리면 항상 잠근다. */
    const usable = !!type && type !== 'tap' && (S.sandbox || !S.pool || S.pool.indexOf(type) >= 0);
    setDrawingActive(usable || !!to);
  } else {
    setDrawingActive(false);
  }
}
function onUp(e) {
  if (!pointers.down || (e.pointerId != null && e.pointerId !== pointers.id)) return;
  pointers.down = false;
  const pts = pointers.pts;
  pointers._chip = null;
  setDrawingActive(false);
  if (S) { S.preview = null; S.aimTarget = null; }
  finishStroke(pts);
}
/* 모호한(45°) 직선은 조준으로 확정한다: 획 방향 콘 안 혼령의 hline/vline 분포를 따름. */
function resolveTieAxis(dir) {
  if (!S) return null;
  const n = { hline: 0, vline: 0 };
  const hs = heroScreen();
  livingMarks().forEach(function (s) {
    const sh = spiritShape(s);
    if (sh !== 'hline' && sh !== 'vline') return;
    if (dir) {
      const va = projectXZ(s.x, s.z, 0.8);
      const da = Math.hypot(va.x - hs.x, va.y - hs.y) || 1;
      const cos = ((va.x - hs.x) / da) * dir.x + ((va.y - hs.y) / da) * dir.y;
      if (cos < (CFG.aimConeCos || 0.5)) return;
    }
    n[sh]++;
  });
  if (!n.hline && !n.vline) return null;
  if (n.hline === n.vline) return S.lastAxis || 'vline';
  return n.hline > n.vline ? 'hline' : 'vline';
}
function resolveStrokeType(rec, pts) {
  if (!rec) return { type: null, rec: rec };
  if (rec.tie) {
    const dir = strokeScreenDir(pts);
    const a = resolveTieAxis(dir);
    if (a) return { type: a, rec: rec, tieResolved: true };
    return { type: S.lastAxis || 'vline', rec: rec, tieResolved: true };
  }
  if (rec.type) return { type: rec.type, rec: rec };
  return { type: null, rec: rec };
}
function ambiguousHint(rec) {
  if (!rec) return '';
  const k = rec.best;
  if (k && (rec.bestScore || 0) >= 0.30) return (G.NAMES[k] || '') + '? 더 크게';
  return '획이 짧아요';
}
/* 방향 무시 자동 추격기: V·⚡ */
const AUTO_TARGET = { vee: 1, bolt: 1 };
function finishStroke(pts, opts) {
  opts = opts || {};
  lastStroke = (pts || []).slice(); inkFade = 0.28;
  paintInk(lastStroke, 1);
  if (!S || !S.playing || S.paused) return null;
  const rec = G.recognize(pts, { allowBolt: true, seal: !!(S && S.boss && S.boss.state === "seal"), totem: !!(S && S.boss && S.boss.alive && bossMinions().length) });
  S.lastRec = rec;
  /* §13 데이터: 획 하나하나의 의도/결과/점수/2등 점수/길이/실패 이유 — 인식 튜닝의 원자료다. */
  telemetry.event('stroke', {
    want: (S.aimTarget && S.aimTarget.alive) ? spiritShape(S.aimTarget) : null,
    got: rec.type || null, best: rec.best || null, score: +(rec.bestScore || 0).toFixed(2),
    second: secondScore(rec), len: Math.round(G.pathLen(pts)), why: rec.reason || null
  });
  S.aimTarget = null;
  S.preview = null;
  const read = (G.readMessage && G.readMessage(rec)) || '';
  rec.readMessage = read;
  if (S.boss && S.boss.alive && S.boss.state === 'seal') {
    if (rec.type === 'star') rec.seal = sealStroke();
    else toast('획이 교차하는 한붓별(⛤)을 그려 봉인하세요');
    return rec;
  }
  /* 제자리 탭 = 칼집 패링 (인식기는 이미 tap을 읽는다) */
  if (rec.type === 'tap' || opts.tap) return doParry(rec);
  /* v0.26 보스 패턴: 은신 중에는 무늬와 상관없이 획의 방향만 본다. */
  /* 기물 무늬는 은신·영창 중에도 그 기물로 일섬한다(피할 곳은 늘 열려 있어야 한다). */
  const totemStroke = TOTEM_SHAPES.indexOf(rec.type) >= 0;
  if (!totemStroke && veilStroke(pts)) { rec.veil = true; return rec; }
  const res = resolveStrokeType(rec, pts);
  if (!res.type) {
    inkFade = 0.16;
    toast((read ? read + ' ' : '잘 안 그려졌어요. ') + failHint());
    setTimeout(clearInk, qa.noDelay ? 80 : 160);
    return rec;
  }
  if (res.type !== rec.type) {
    rec.type = res.type;
    rec.label = (G.LABELS && G.LABELS[res.type]) || rec.label;
    rec.tieResolved = true;
  }
  /* v0.34 §6.2 9장 부목표: 한 무늬 구간에 다른 무늬를 그리면 목표 실패 */
  if (goalOnStroke(rec.type)) { rec.goalFail = true; return rec; }
  /* v0.32 §4.4 8장 「합 겨루기」: 1.2초 안에 뜬 무늬를 그리면 한 합을 받아친다. */
  if (S.boss && S.boss.alive && S.boss.state === 'clash' && !totemStroke && clashStroke(rec.type)) { rec.clash = true; return rec; }
  /* 영창 중에는 무늬 획이 영창을 끊는 데 쓰인다. */
  if (rec.type !== 'circle' && !totemStroke && chantStroke(rec.type)) { rec.chant = true; return rec; }
  /* O = 전 화면 참(斬) 필살기 */
  if (rec.type === 'circle') { rec.cleave = true; return castCleave(rec); }
  if (!S.sandbox && S.pool && S.pool.indexOf(rec.type) < 0 && TOTEM_SHAPES.indexOf(rec.type) < 0) {
    toast((read ? read + ' ' : '') + '지금은 ' + failHint());
    inkFade = 0.16;
    setTimeout(clearInk, qa.noDelay ? 80 : 160);
    return rec;
  }
  /* 스마트 타겟팅 이원화: 직선은 그은 방향, V/⚡는 위협도순 자동 */
  const dir = AUTO_TARGET[rec.type] ? null : strokeAimDir(pts, rec.type);
  if (rec.type === 'hline' || rec.type === 'vline') S.lastAxis = rec.type;
  S.lastStrokeDir = dir;
  rec.dir = dir;
  rec.combo = S.combo;
  /* 칼날 소리의 높이: 화면에서 그린 획 길이를 0~1로 옮긴다(80px~280px). */
  S.strokeLenRatio = clamp((G.pathLen(pts) - 80) / 200, 0, 1);
  /* 선입력 버퍼: 돌진·비틀거림 중에 들어온 획은 버리지 않고 2칸 FIFO 큐에 예약한다. */
  const tInput = now();
  const stumbling = !!(S.terrain && S.terrain.stumbleT > 0);
  if (S.dash || (S.dashQueue && S.dashQueue.length) || stumbling) {
    const qres = enqueueInputBuf({
      type: rec.type, dir: dir, t0: tInput,
      ttl: stumbling ? 550 : Math.max(450, CFG.inputBufMs || 200),
      quality: (rec.q != null ? rec.q : rec.bestScore)
    });
    inkFade = 0.20;
    showJudge(stumbling ? '비틀 — 다음 획' : (qres.size >= 2 ? '연속 예약' : '예약'));
    rec.buffered = true;
    rec.queueSize = qres.size;
    rec.targets = [];
    return rec;
  }
  /* §4.2 빈틈 선입력: 걷는 보스의 빈틈이 0.5초 안에 열리면, 튕길 획을 버리지 않고 그 순간 자동으로 낸다. */
  if (bufferGapStroke(rec, dir)) { rec.gapBuffered = true; return rec; }
  const dash = beginDash(rec.type, { dir: dir, quality: (rec.q != null ? rec.q : rec.bestScore), tInput: tInput });
  rec.targets = dash && dash.targets;
  rec.dash = dash;
  /* §8.1 튜토리얼 첫 성공: 0.05초 히트스톱 + 칼소리 + "일섬!" */
  if (dash && S.tutorial) tutorialFirstSuccess();
  return rec;
}
/* §4.2: 빈틈이 0.5초 안에 열리는 순간에 그은 획은 선입력으로 잡아 둔다 — 튕기고 다시 긋는 일을 줄인다. */
function bufferGapStroke(rec, dir) {
  const b = S && S.boss;
  if (!b || !b.alive || b.state !== 'walk' || b.firstWalk) return false;
  if (rec.type !== (b.seq && b.seq[b.seqI])) return false;
  const g = gapInfo(b);
  if (g.open || g.readyIn > (CFG.gapBufWait || 0.5)) return false;
  S.gapBuf = { type: rec.type, dir: dir, quality: (rec.q != null ? rec.q : rec.bestScore), t0: now() };
  inkFade = 0.20;
  showJudge('빈틈 준비');
  rec.buffered = true;
  rec.targets = [];
  return true;
}
function stepGapBuffer() {
  if (!S || !S.gapBuf) return;
  const b = S.boss;
  const age = now() - S.gapBuf.t0;
  if (!b || !b.alive || b.state !== 'walk' || age > (CFG.gapBufWait || 0.5) * 1000 + 150) { S.gapBuf = null; return; }
  if (!gapInfo(b).open) return;
  const q = S.gapBuf;
  S.gapBuf = null;
  if (S.dash || (S.dashQueue && S.dashQueue.length)) return;
  /* 빈틈을 노리고 그은 획은 그 방향(조준 콘)과 상관없이 보스에게 난다 — 그것이 이 획의 의도다. */
  const rec = dashAtBoss(b, q.type);
  if (rec) { rec.quality = q.quality; S.dashQuality = q.quality; }
  showJudge('빈틈!');
}
function syntheticPath(type, x, y, s) {
  s = s || 70;
  function line(x1, y1, x2, y2, n) {
    const p = []; n = n || 24;
    for (let i = 0; i < n; i++) { const t = i / (n - 1); p.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }); }
    return p;
  }
  if (type === 'star' || type === 'circle') {
    const count = type === 'star' ? 5 : 40;
    const turn = type === 'star' ? 2 : 1;
    return Array.from({ length: count + 1 }, (_, i) => {
      const angle = i * turn * Math.PI * 2 / count;
      return { x: x + s * Math.sin(angle), y: y - s * Math.cos(angle) };
    });
  }
  if (type === 'vline') return line(x, y - s, x, y + s);
  if (type === 'tri') return line(x, y - s, x + s, y + s * 0.7, 14).concat(line(x + s, y + s * 0.7, x - s, y + s * 0.7, 14).slice(1), line(x - s, y + s * 0.7, x, y - s * 0.95, 14).slice(1));
  if (type === 'arc') { const p = []; for (let i = 0; i <= 30; i++) { const a = Math.PI * i / 30; p.push({ x: x - Math.cos(a) * s, y: y + Math.sin(a) * s * 0.8 }); } return p; }
  if (type === 'spiral') { const p = []; for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * Math.PI * 4.2, rr = s * (0.12 + 0.8 * t); p.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr }); } return p; }
  if (type === 'square') return line(x - s, y - s, x + s, y - s, 12).concat(line(x + s, y - s, x + s, y + s, 12).slice(1), line(x + s, y + s, x - s, y + s, 12).slice(1), line(x - s, y + s, x - s, y - s, 12).slice(1));
  if (type === 'hline') return line(x - s, y, x + s, y);
  if (type === 'vee') return line(x - s, y - s * 0.7, x, y + s * 0.8, 16).concat(line(x, y + s * 0.8, x + s, y - s * 0.7, 16).slice(1));
  if (type === 'bolt') {
    return line(x + s * 0.35, y - s, x - s * 0.35, y - s * 0.15, 10)
      .concat(line(x - s * 0.35, y - s * 0.15, x + s * 0.35, y + s * 0.15, 10).slice(1),
              line(x + s * 0.35, y + s * 0.15, x - s * 0.35, y + s, 10).slice(1));
  }
  return [];
}
function strokeType(type, opts) {
  const r = $('ink').getBoundingClientRect();
  const pts = syntheticPath(type, r.width * 0.5, r.height * 0.32, Math.min(80, r.width * 0.22));
  return finishStroke(pts, opts);
}

function idleCoins(ms) {
  return computeIdleCoins(ms, save, CFG);
}
function checkIdle() {
  const c = idleCoins(Date.now() - (save.lastSeen || Date.now()));
  if (c <= 0) return 0;
  idlePending = c;
  $('idleBody').textContent = '자리를 비운 동안 엽전 ' + c + '이 쌓였습니다.';
  const adNote = $('idleAdNote');
  if (adNote) adNote.textContent = getIdleNotice(CFG);
  showOv('ov-idle');
  return c;
}
function collectIdle(double) {
  let n = idlePending; if (!n) return 0;
  if (double) n *= 2;
  save.coins += n; idlePending = 0; persist();
  telemetry.event('income', { source: 'idle', coins: n });
  hideOvs(); showOv('ov-title'); renderHud();
  return n;
}
function refreshShop() {
  $('shopCoins').textContent = save.coins;
  try { renderShopTab(); } catch (e) {}
  function label(btn, name, lv, desc) {
    const c = costOf(lv), max = lv >= CFG.maxLv;
    btn.disabled = max || save.coins < c;
    btn.innerHTML = name + ' Lv ' + lv + (max ? ' (최대)' : ' · ' + c + '엽전') + '<br>' + desc;
  }
  label($('buyAtk'), '공격력', save.atkLv, '일섬 피해 +' + Math.round(atkBonus() * 100) + '%');
  label($('buyHp'), '영웅 체력', save.hpLv, '최대 체력 ' + (CFG.hpBase + save.hpLv * CFG.hpStep));
  label($('buyCoin'), '엽전 획득', save.coinLv, '획득량 ×' + (1 + save.coinLv * CFG.coinStep).toFixed(2));
}
function buy(stat) {
  const res = purchaseStatUpgrade(save, stat, CFG);
  if (!res.ok) return false;
  persist(); refreshShop(); renderHud();
  return true;
}

/* ---------- v0.34 §10 도전 모드 ----------
   무한 심연: 끝없는 웨이브 + 179초마다 보스. 보스 러시: 열두 보스 연속(체력 유지). 무늬 시련: 1~2종만. */
function initChallenge(id, stageNo) {
  if (!S) return;
  const c = challengeOf(id);
  if (!c || !challengeUnlocked(id)) { S.challenge = null; return; }
  S.challenge = id;
  S.challengeT = 0;
  if (id === 'endless') {
    S.timeLeft = 99999;
    S.endlessKills = 0; S.endlessBossN = 0; S.endlessNextBoss = 180;
  } else if (id === 'bossrush') {
    S.timeLeft = 99999;
    S.bossIdx = 0; S.rushNext = 0.8;
  } else if (id === 'trial') {
    const pool = (S.stage.shapes || SHAPE_UNLOCK).slice(0, 2);
    S.pool = pool.slice(0, Math.max(1, Math.min(2, pool.length)));
    S.trialPool = S.pool.slice();
  }
  telemetry.event('challenge_start', { id: id, stage: stageNo, record: challengeRecord(id) });
  toast(c.name + ' — ' + c.desc);
}
function challengeProgress() {
  if (!S || !S.challenge) return;
  const b = S.boss;
  if (S.challenge === 'bossrush') {
    if (S.rushNext > 0) {
      S.rushNext -= 1 / 60;
      if (S.rushNext <= 0) spawnRushBoss();
      return;
    }
    if (b && !b.alive) {
      S.bossIdx = (S.bossIdx || 0) + 1;
      if (S.bossIdx >= STAGES.length) {
        save.records = save.records || {};
        save.records.bossrush = Math.max(save.records.bossrush || 0, STAGES.length);
        persist();
        endRun(true, '열두 보스를 모두 베었습니다');
        return;
      }
      closeArena(true);
      S.boss = null; S.bossSpawned = false;
      /* 보스 사이 카드 1장 */
      S.rushNext = 1.2;
      /* 보스 사이 카드 1장: 다음 레벨까지 조금만 남긴 혼백을 준다. */
      gainXp(xpNeed(S.level) - (S.xp || 0));
      openLevelUp();
      return;
    }
    return;
  }
  if (S.challenge === 'endless') {
    if (b && !b.alive) {
      S.endlessBossN = (S.endlessBossN || 0) + 1;
      save.records = save.records || {};
      save.records.endless = Math.max(save.records.endless || 0, S.endlessBossN);
      persist();
      closeArena(true);
      S.boss = null; S.bossSpawned = false;
      S.endlessNextBoss = (S.elapsed || 0) + 180;
      gainXp(60);
      toast('귀물을 베었다 — 3분 뒤 다음 귀물');
      return;
    }
    if (!b && !S.bossSpawned && (S.elapsed || 0) >= (S.endlessNextBoss || 180)) {
      endlessBoss();
    }
  }
}
/* 무한 심연의 보스: 장을 돌며 무늬 수·패턴을 무작위로 섮는다. */
function endlessBoss() {
  if (!S) return null;
  const n = (S.endlessBossN || 0);
  const stageNo = 1 + (n % STAGES.length);
  const st = stageOf(stageNo);
  const shapes = 4 + Math.floor(Math.random() * 5);
  const prev = S.stage;
  S.stage = st;
  S.bossShapeAdj = curMode().bossShapes;
  const b = spawnBoss({ r: CFG.bossSpawnR, nShapes: shapes });
  S.stage = prev;
  if (b) {
    toast('무한 심연 — ' + (st.bossName || '귀물') + ' (무늬 ' + shapes + ')');
    telemetry.event('endless_boss', { n: n + 1, stage: stageNo, shapes: shapes });
  }
  S.bossSpawned = true;
  return b;
}
/* 보스 러시: 1장 보스부터 12장 보스까지. 체력은 이어지고, 보스 사이에 카드 한 장. */
function spawnRushBoss() {
  if (!S || S.challenge !== 'bossrush') return null;
  const idx = S.bossIdx || 0;
  const st = stageOf(Math.min(STAGES.length, idx + 1));
  const prev = S.stage, prevAdj = S.bossShapeAdj;
  S.stage = st;
  const shapes = Math.max(3, st.bossShapes + (curMode().bossShapes || 0));
  const b = spawnBoss({ r: CFG.bossSpawnR, nShapes: shapes });
  S.stage = prev; S.bossShapeAdj = prevAdj;
  S.bossSpawned = true;
  S.rushNext = 0;
  if (b) {
    toast('보스 러시 ' + (idx + 1) + '/' + STAGES.length + ' — ' + (st.bossName || st.name));
    showBossCard(st);
    telemetry.event('rush_boss', { n: idx + 1, stage: st.id, shapes: shapes });
  }
  return b;
}
function startChallenge(id) {
  if (!challengeUnlocked(id)) { toast('아직 잠긴 도전입니다'); return false; }
  startRun({ stage: save.stage || 1, challenge: id });
  return true;
}
function renderChallenges() {
  const box = $('titleChallenges');
  if (!box) return;
  const rows = CHALLENGES.map(function (c) {
    const on = challengeUnlocked(c.id);
    const rec = challengeRecord(c.id);
    const recTxt = c.id === 'endless' ? (rec ? '최고 ' + rec + '귀물' : '기록 없음')
      : c.id === 'bossrush' ? (rec ? '최고 ' + rec + '/' + STAGES.length : '기록 없음')
      : (rec ? '기록 ' + rec : '기록 없음');
    return '<button type="button" class="btn chal' + (on ? '' : ' locked') + '" data-chal="' + c.id + '"' + (on ? '' : ' disabled') + '>'
      + '<b>' + c.name + '</b><span>' + (on ? recTxt : c.unlock + '장 클리어로 해금') + '</span></button>';
  });
  box.innerHTML = rows.join('');
  Array.prototype.forEach.call(box.querySelectorAll('button[data-chal]'), function (b) {
    b.addEventListener('click', function () { startChallenge(b.getAttribute('data-chal')); });
  });
}
let shopTab = 'stat';
function swordBlueprint(stageNo) { return !stageNo || ((save.stars || {})[stageNo] || 0) > 0; }
function buySword(id) {
  const sw = SWORDS.filter(function (s) { return s.id === id; })[0];
  if (!sw || save.swords.owned[id] || !swordBlueprint(sw.unlock) || save.coins < sw.price) return false;
  save.coins -= sw.price; save.swords.owned[id] = 1; persist(); refreshShop(); renderHud();
  toast('무구 · ' + sw.name + '을 얻었습니다');
  telemetry.event('meta_buy', { kind: 'sword', id: id, price: sw.price });
  return true;
}
function equipSword(id) {
  if (!save.swords.owned[id]) return false;
  save.swords.equipped = id; persist(); refreshShop();
  toast('무구 · ' + swordOf(save).name + ' 장착');
  return true;
}
function buyRelic(id) {
  const r = RELICS.filter(function (x) { return x.id === id; })[0];
  if (!r || save.relics.owned[id] || save.coins < r.price) return false;
  save.coins -= r.price; save.relics.owned[id] = 1; persist(); refreshShop(); renderHud();
  toast('유물 · ' + r.name + '을 얻었습니다');
  telemetry.event('meta_buy', { kind: 'relic', id: id, price: r.price });
  return true;
}
function toggleRelic(id) {
  if (!save.relics.owned[id]) return false;
  const eq = (save.relics.equipped || []).slice();
  const i = eq.indexOf(id);
  if (i >= 0) eq.splice(i, 1);
  else {
    eq.push(id);
    const slots = relicSlots(save);
    while (eq.length > slots) eq.shift();
  }
  save.relics.equipped = eq; persist(); refreshShop(); renderHud();
  return true;
}
function buySkin(id, kind) {
  const list = kind === 'brush' ? BRUSHES : SKINS;
  const box = kind === 'brush' ? save.brush : save.skins;
  const it = list.filter(function (x) { return x.id === id; })[0];
  if (!it || box.owned[id] || save.coins < it.price) return false;
  save.coins -= it.price; box.owned[id] = 1; persist(); refreshShop(); renderHud();
  toast((kind === 'brush' ? '붓 자국' : '외형') + ' · ' + it.name + '을 얻었습니다');
  telemetry.event('meta_buy', { kind: kind, id: id, price: it.price });
  return true;
}
function equipSkin(id, kind) {
  const box = kind === 'brush' ? save.brush : save.skins;
  if (!box.owned[id]) return false;
  box.equipped = id; persist(); refreshShop();
  if (kind === 'brush') showJudge('붓 자국 · ' + brushOf(save).name);
  return true;
}
function renderShopTab() {
  const tabs = $('shopTabs'), statList = $('shopStatList'), body = $('shopBody'), noteEl = $('shopNote') || document.querySelector('#ov-shop .shop-note');
  if (tabs) Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) {
    b.classList.toggle('on', b.getAttribute('data-tab') === shopTab);
  });
  if (noteEl) noteEl.textContent = getShopTabNote(shopTab);
  if (statList) statList.hidden = shopTab !== 'stat';
  if (!body) return;
  body.hidden = shopTab === 'stat';
  if (shopTab === 'stat') { body.innerHTML = ''; return; }
  const rows = [];
  const coins = save.coins;
  if (shopTab === 'sword') {
    SWORDS.forEach(function (s) {
      const owned = !!save.swords.owned[s.id], eq = save.swords.equipped === s.id;
      const open = swordBlueprint(s.unlock);
      const can = !owned && open && coins >= s.price;
      rows.push('<button type="button" class="btn shop-item' + (owned ? ' owned' : '') + (eq ? ' equipped' : '') + (open ? '' : ' locked') + '" data-act="' + (owned ? 'equip-sword' : 'buy-sword') + '" data-id="' + s.id + '"' + (owned || can ? '' : ' disabled') + '>' +
        '<b>' + s.name + '</b><span class="meta-price">' + (owned ? (eq ? '장착' : '보유') : (open ? s.price + '엽전' : '도면 잠김 — ' + s.unlock + '장 첫 클리어')) + '</span><br>' + s.desc + '</button>');
    });
  } else if (shopTab === 'relic') {
    rows.push('<p class="shop-note">판 시작에 장착한 유물 하나가 규칙을 바꿉니다. 지금 칸: ' + relicSlots(save) + '개</p>');
    RELICS.forEach(function (r) {
      const owned = !!save.relics.owned[r.id], eq = relicOn(save, r.id);
      const can = !owned && coins >= r.price;
      rows.push('<button type="button" class="btn shop-item' + (owned ? ' owned' : '') + (eq ? ' equipped' : '') + '" data-act="' + (owned ? 'equip-relic' : 'buy-relic') + '" data-id="' + r.id + '"' + (owned || can ? '' : ' disabled') + '>' +
        '<b>' + r.name + '</b><span class="meta-price">' + (owned ? (eq ? '장착됨' : '보유') : r.price + '엽전') + '</span><br>' + r.desc + '</button>');
    });
  } else {
    rows.push('<p class="shop-note">보스·기물 색조 — 능력은 없습니다.</p>');
    SKINS.forEach(function (s) {
      const owned = !!save.skins.owned[s.id], eq = save.skins.equipped === s.id;
      const can = !owned && coins >= s.price;
      rows.push('<button type="button" class="btn shop-item' + (owned ? ' owned' : '') + (eq ? ' equipped' : '') + '" data-act="' + (owned ? 'equip-skin' : 'buy-skin') + '" data-id="' + s.id + '"' + (owned || can ? '' : ' disabled') + '>' +
        '<b>' + s.name + '</b><span class="meta-price">' + (owned ? (eq ? '장착됨' : '보유') : s.price + '엽전') + '</span></button>');
    });
    rows.push('<p class="shop-note">수련장 붓 자국 — 획의 색과 굵기뿐입니다.</p>');
    BRUSHES.forEach(function (s) {
      const owned = !!save.brush.owned[s.id], eq = save.brush.equipped === s.id;
      const can = !owned && coins >= s.price;
      rows.push('<button type="button" class="btn shop-item' + (owned ? ' owned' : '') + (eq ? ' equipped' : '') + '" data-act="' + (owned ? 'equip-brush' : 'buy-brush') + '" data-id="' + s.id + '"' + (owned || can ? '' : ' disabled') + '>' +
        '<b>' + s.name + '</b><span class="meta-price">' + (owned ? (eq ? '장착됨' : '보유') : s.price + '엽전') + '</span></button>');
    });
  }
  body.innerHTML = rows.join('');
  Array.prototype.forEach.call(body.querySelectorAll('button[data-act]'), function (b) {
    b.addEventListener('click', function () {
      const act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
      if (act === 'buy-sword') buySword(id);
      else if (act === 'equip-sword') equipSword(id);
      else if (act === 'buy-relic') buyRelic(id);
      else if (act === 'equip-relic') toggleRelic(id);
      else if (act === 'buy-skin') buySkin(id, 'skin');
      else if (act === 'equip-skin') equipSkin(id, 'skin');
      else if (act === 'buy-brush') buySkin(id, 'brush');
      else if (act === 'equip-brush') equipSkin(id, 'brush');
    });
  });
}
function wireShopTabs() {
  const tabs = $('shopTabs');
  if (!tabs) return;
  Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () { shopTab = b.getAttribute('data-tab'); renderShopTab(); });
  });
}

/* §9.3 도감 화면: 귀물 8 · 보스 12 · 진화 10 · 패턴 9칸 */
function renderCodex() {
  const body = $('codexBody'), bonus = $('codexBonus');
  if (!body) return;
  const n = codexCounts(save);
  const b = Math.round(codexBonus(save) * 100);
  if (bonus) bonus.innerHTML = '귀물 ' + n.mon + '/8 · 보스 ' + n.boss + '/12 · 진화 ' + n.evo + '/' + EVO_SLOTS + ' · 패턴 ' + n.pat + '/' + PAT_SLOTS + '<br>묶음 보너스: 엽전 +' + b + '%';
  const out = [];
  out.push('<div class="codex-group"><h3>귀물 ' + n.mon + '/8</h3><div class="codex-grid">');
  MON_CODE.forEach(function (m) {
    const on = !!(save.codex.mon && save.codex.mon[m.id]);
    out.push('<div class="codex-cell' + (on ? ' on' : ' unknown') + '"><b>' + (on ? m.name : '???') + '</b><span>' + (on ? m.desc : '') + '</span></div>');
  });
  out.push('</div></div>');
  out.push('<div class="codex-group"><h3>보스 ' + n.boss + '/12</h3><div class="codex-grid">');
  STAGES.forEach(function (st) {
    const rec = save.codex.boss && save.codex.boss[st.id];
    out.push('<div class="codex-cell' + (rec ? ' on' : ' unknown') + '"><b>' + (rec ? st.bossName : '???') + '</b><span>' + (rec ? st.name : '') + '</span></div>');
  });
  out.push('</div></div>');
  out.push('<div class="codex-group"><h3>진화 ' + n.evo + '/' + EVO_SLOTS + '</h3><div class="codex-grid">');
  EVO_RECIPES.forEach(function (r) {
    const on = !!(save.codex.evo && save.codex.evo[r.key]);
    out.push('<div class="codex-cell' + (on ? ' on' : ' unknown') + '"><b>' + (on ? r.name : '???') + '</b><span>' + (on ? '재료 ' + (r.a.length ? cardNameOf(r.a[0]) : '종') + ' + ' + cardNameOf(r.b) : '') + '</span></div>');
  });
  out.push('</div></div>');
  out.push('<div class="codex-group"><h3>패턴 ' + n.pat + '/' + PAT_SLOTS + '</h3><div class="codex-grid">');
  PAT_CODE.filter(function (p) { return isBasePat(p.id); }).forEach(function (p) {
    const on = !!(save.codex.pat && save.codex.pat[p.id]);
    out.push('<div class="codex-cell' + (on ? ' on' : ' unknown') + '"><b>' + (on ? p.name : '???') + '</b><span>' + (on ? p.guides[0] : '') + '</span></div>');
  });
  out.push('</div></div>');
  body.innerHTML = out.join('');
}

/* §8.3 무늬 수련장: 10종 자유 연습 + 최근 20회 인식률 + 그리는 요령 애니메이션 */
const TRAIN_SHAPES = ['hline', 'vline', 'vee', 'bolt', 'circle', 'square', 'tri', 'arc', 'spiral', 'star', 'tap'];
const SHAPE_LABEL = { hline: '—', vline: 'ㅣ', vee: 'V', bolt: '⚡', circle: 'O', star: '⛤', square: 'ㅁ', tri: '△', arc: '◡', spiral: '@', tap: '•' };
const SHAPE_TIP = {
  hline: '가로로 곧게, 화면 폭의 절반쯤. 끝에서 멈칫하지 마세요.',
  vline: '위에서 아래로 한 번에. 좌우로 흔들리면 번개로 읽힙니다.',
  vee: '내려갔다가 같은 기울기로 올라옵니다. 바닥은 뾰족하게.',
  bolt: '세 마디 지그재그. 가로로 눕히지 말고 세로로 길게.',
  circle: '한 바퀴 크게, 시계 방향이든 반대로든 상관없습니다.',
  square: '네 모서리를 각지게. 모서리를 둥글리면 원으로 읽힙니다.',
  tri: '세 변을 한 번에. 마지막 변을 짧게 끝내세요.',
  arc: '반달을 옆으로 눕힌 모양. 위로 볼록하게.',
  spiral: '안에서 밖으로 말아 올리며 두 바퀴.',
  star: '한붓으로 다섯 꼭짓점을 교차해 별(⛤)을 그립니다.',
  tap: '제자리에서 짧게 콕 — 패링입니다.'
};
const train = { shape: 'hline', pts: [], drawing: false, raf: 0, result: null, animT: 0, need: 0 };
function trainStatsOf(shape) {
  const arr = (save.train && save.train.stats && save.train.stats[shape]) || [];
  const last = arr.slice(-20);
  const hit = last.filter(function (v) { return v; }).length;
  return { n: last.length, hit: hit, rate: last.length ? hit / last.length : 0 };
}
function renderTrainShapes() {
  const box = $('trainShapes');
  if (!box) return;
  box.innerHTML = TRAIN_SHAPES.map(function (sh) {
    const st = trainStatsOf(sh);
    const label = (G && G.NAMES && G.NAMES[sh]) || SHAPE_LABEL[sh] || sh;
    return '<button type="button" data-shape="' + sh + '" class="' + (sh === train.shape ? 'on' : '') + '" aria-label="' + label + ' (' + (SHAPE_LABEL[sh] || sh) + ')" title="' + label + ' · ' + (st.n ? Math.round(st.rate * 100) + '%' : '—') + '">' + titleChip(sh) + '</button>';
  }).join('');
  Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () { train.shape = b.getAttribute('data-shape'); train.pts = []; train.result = null; renderTrainShapes(); });
  });
  const noteEl = $('trainNote');
  if (noteEl && SHAPE_TIP[train.shape]) noteEl.textContent = SHAPE_TIP[train.shape];
  const st = trainStatsOf(train.shape);
  const el = $('trainStats');
  if (el) {
    el.textContent = (SHAPE_LABEL[train.shape] + ' 최근 ' + st.n + '회 · 인식 ' + (st.n ? Math.round(st.rate * 100) : 0) + '%'
      + (st.n && st.rate < 0.8 ? ' — 요령 애니메이션을 봅니다' : ''));
  }
  train.need = st.n >= 3 && st.rate < 0.8 ? 1 : 0;
}
function trainDraw() {
  const cv = $('trainCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.62);
  bg.addColorStop(0, 'rgba(24,22,26,1)'); bg.addColorStop(1, 'rgba(9,8,11,1)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  /* 목표 무늬의 옅은 유도선 */
  const ghost = syntheticPath(train.shape, W * 0.5, H * 0.5, Math.min(70, W * 0.26));
  if (ghost && ghost.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(239,228,204,0.16)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ghost.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.stroke();
    ctx.restore();
  }
  /* 요령 애니메이션: 붓끝이 무늬를 따라간다(80% 미만일 때) */
  if (train.need && ghost && ghost.length) {
    const k = (train.animT % 2.2) / 1.8;
    if (k <= 1) {
      const i = Math.min(ghost.length - 1, Math.floor(k * (ghost.length - 1)));
      const p = ghost[i];
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232,192,74,0.85)'; ctx.fill();
    }
  }
  /* 내가 그은 획 */
  if (train.pts.length) {
    const bs = brushOf(save);
    ctx.strokeStyle = 'rgba(' + bs.color + ',0.9)';
    ctx.lineWidth = 7 * (bs.width || 1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); train.pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.stroke();
  }
  if (train.result) {
    ctx.save();
    ctx.font = '700 15px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = train.result.ok ? 'rgba(46,230,166,0.95)' : 'rgba(232,120,90,0.95)';
    ctx.fillText(train.result.text, W / 2, H - 10);
    ctx.restore();
  }
}
function trainLoop(ts) {
  train.animT = (ts || 0) / 1000;
  trainDraw();
  train.raf = requestAnimationFrame(trainLoop);
}
function openTrain() {
  showOv('ov-train');
  renderTrainShapes();
  train.pts = []; train.result = null;
  if (!train.raf) train.raf = requestAnimationFrame(trainLoop);
  telemetry.event('train_open', { shape: train.shape });
}
function closeTrain() {
  if (train.raf) cancelAnimationFrame(train.raf);
  train.raf = 0;
  hideOvs(); showOv('ov-title');
}
function trainPoint(e) {
  const cv = $('trainCanvas');
  if (!cv) return { x: 0, y: 0 };
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * cv.width / Math.max(1, r.width), y: (e.clientY - r.top) * cv.height / Math.max(1, r.height) };
}
function trainFinish() {
  if (!train.pts.length) return;
  const rec = G.recognize(train.pts, { allowBolt: true, seal: train.shape === 'star', totem: ['tri', 'square', 'arc', 'spiral'].includes(train.shape) });
  const ok = rec.type === train.shape;
  save.train = save.train || { stats: {}, seen: 0 };
  save.train.stats[train.shape] = (save.train.stats[train.shape] || []).concat([ok ? 1 : 0]).slice(-20);
  save.train.seen = (save.train.seen || 0) + 1;
  persist();
  train.result = { ok: ok, text: ok ? ('맞았습니다 — ' + SHAPE_LABEL[train.shape]) : ('읽힌 무늬: ' + (SHAPE_LABEL[rec.type] || rec.type || '?')) };
  renderTrainShapes();
  telemetry.event('train_stroke', { shape: train.shape, got: rec.type || null, ok: ok, score: +(rec.bestScore || 0).toFixed(2) });
}
function wireTrain() {
  const cv = $('trainCanvas');
  if (!cv) return;
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    train.drawing = true; train.result = null; train.pts = [trainPoint(e)];
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  });
  cv.addEventListener('pointermove', function (e) {
    if (!train.drawing) return;
    e.preventDefault();
    const p = trainPoint(e), last = train.pts[train.pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1.5) train.pts.push(p);
  });
  cv.addEventListener('pointerup', function (e) {
    if (!train.drawing) return;
    train.drawing = false;
    e.preventDefault();
    trainFinish();
  });
  cv.addEventListener('pointercancel', function () { train.drawing = false; });
}

function activeFov() {
  if (!three || !three.view) return CFG.fov || 62;
  return viewFov(three.view.clientWidth || 390, Math.max(1, three.view.clientHeight || 844));
}
/* v0.27 화면 통일: 화면의 짧은 축이 언제나 같은 세계 폭(≈16.6m)을 담게 한다.
   360·390·430·가로·데스크톱에서 캐릭터·시야 원의 픽셀 크기가 같아지고, 넓은 축만 더 많이 보인다.
   (예전에는 세로 FOV가 고정이라 가로 화면에서 세상이 2배쯤 작게 보였다.) */
const VIEW_REF = { shortPx: 390, span: 16.6, growMax: 1.6 };
function viewSpanFor(shortPx) {
  const k = Math.sqrt(Math.max(120, shortPx) / VIEW_REF.shortPx);
  return VIEW_REF.span * clamp(k, 0.7, VIEW_REF.growMax);
}
function camDist() { return Math.hypot(CFG.camOff.x, CFG.camOff.y, CFG.camOff.z) || 30; }
function viewFov(w, h) {
  const short = Math.min(w, h), span = viewSpanFor(short);
  const aspect = w / Math.max(1, h);
  const tanV = (aspect >= 1) ? (span / (2 * camDist())) : (span / (2 * camDist() * aspect));
  const fov = 2 * Math.atan(tanV) * 180 / Math.PI;
  /* 보스 결계에서는 조금 물러나 보스의 예고 동작까지 화면에 담는다. */
  const arena = arenaActive() ? 1.10 : 1;
  return clamp(fov * arena, 24, 78);
}
function applyCameraLens() {
  if (!three) return;
  const w = three.view.clientWidth, h = Math.max(1, three.view.clientHeight);
  three.camera.aspect = w / h;
  three.camera.fov = activeFov();
  three.camera.updateProjectionMatrix();
  if (S) S._lensKey = (w | 0) + 'x' + (h | 0) + ':' + three.camera.fov.toFixed(2);
}
function onResize() {
  if (!three) return;
  invalidateViewBox();
  applyCameraLens();
  const w = three.view.clientWidth, h = Math.max(1, three.view.clientHeight);
  three.renderer.setSize(w, h);
  if (three.bloom && three.bloom.setSize) three.bloom.setSize(w, h);
  resizeInk();
  if (S && S.playing) applyRingBoost();
}

function fadeFx(obj, a) {
  if (!obj) return;
  if (obj.material && obj.material.opacity != null) obj.material.opacity = a;
  if (obj.children) obj.children.forEach(function (c) { fadeFx(c, a); });
}


/* 스테이지 분위기: 밤 색·안개 농도·달빛·색조를 스테이지마다 바꾼다. */
/* v0.43 QA 노브: 바탕이 한지로 밝아진 만큼 빛의 세기를 화면에서 바로 맞춘다(?atmoK=0.5). */
const ATMO_K = (function () {
  try {
    const v = parseFloat(new URLSearchParams(location.search).get('atmoK'));
    return isFinite(v) && v > 0 ? v : 0.32;   /* v0.43 기본값: 한지 바탕에 맞춘 조도 */
  } catch (e) { return 1; }
})();
function applyStageAtmo(st) {
  st = st || (S && S.stage) || stageOf(save.stage || 1);
  setChapterArt(st);
  const a = (st && st.atmo) || {};
  if (three) {
    const clear = (a.clear != null) ? a.clear : (three.baseClear != null ? three.baseClear : nightColor());
    if (three.scene) {
      three.scene.background = new THREE.Color(clear);
      if (three.scene.fog) { three.scene.fog.color.set(clear); three.scene.fog.density = a.fog != null ? a.fog : 0.007; }
    }
    if (three.sky && three.sky.material && three.sky.material.color) three.sky.material.color.set(clear);
    if (three.moon) {
      three.moon.intensity = (a.moon != null ? a.moon : 1.45) * ATMO_K;
      if (a.moonCol != null && three.moon.color) three.moon.color.setHex(a.moonCol);
    }
    if (three.amb) three.amb.intensity = (a.amb != null ? a.amb : 1.0) * ATMO_K;
    if (three.fill) three.fill.intensity = (a.fill != null ? a.fill : 0.85) * ATMO_K;
    if (three.hemi && a.hemiI != null) three.hemi.intensity = a.hemiI * ATMO_K;
    if (three.hemi && a.hemi != null) three.hemi.color.setHex(a.hemi);
    if (three.hemi && a.ground != null) three.hemi.groundColor.setHex(a.ground);
    if (three.renderer) three.renderer.setClearColor(clear, 1);
  }
  const tint = $('stageTint');
  if (tint) tint.style.background = a.tint || 'transparent';
  const app = $('app');
  if (app) app.dataset.stage = String((st && st.id) || 1);
  const actNo = actOf((st && st.id) || 1);
  hudCtrl.syncActTheme(actNo);
  syncSceneActTheme3D({
    actNo,
    scene: three && three.scene,
    lights: three,
    arena: three && three.chunks && three.chunks.arena,
    paperFx: three && three.paper,
    heroGroup: three && three.heroSpr
  });
}

function applyFxinkAtmo(mapId) {
  const root = $('fxinkAtmo');
  if (!root) return;
  const id = mapId || (S && S.mapId) || (three && three.map && three.map.id) || 'map1';
  const q = (three && three.bloom && three.bloom.quality) || fxQ;
  const B = FXINK_BASE;
  const rays = q === 'high';
  const fogLayers = (q === 'low' || q === 'off') ? 1 : 2;
  const fs = (window.innerWidth < 600) ? '512px 256px' : '1024px 512px';
  root.innerHTML = (rays ? '<div class="rays" style="background-image:url(' + B + 'atmo/moonrays-' + id + '.png)"></div>' : '') +
    '<div class="lay edge a" style="background-image:url(' + B + 'atmo/fog-ink-' + id + '.png);background-size:' + fs + '"></div>' +
    (fogLayers > 1 ? '<div class="lay edge b" style="background-image:url(' + B + 'atmo/fog-mist-' + id + '.png);background-size:' + fs + '"></div>' : '');
  root.dataset.map = id;
  root.dataset.q = q;
}

function punchAtmoRing(cx, cy, ringR, wave) {
  const root = $('fxinkAtmo');
  if (!root) return;
  if (!(wave > 0.02) || !(ringR > 0)) {
    if (_atmoMask !== '') { root.style.webkitMaskImage = ''; root.style.maskImage = ''; _atmoMask = ''; }
    return;
  }
  const inner = Math.max(0, ringR - 22);
  const outer = ringR + 22;
  const img = 'radial-gradient(circle at ' + cx + 'px ' + cy + 'px,#fff 0,#fff ' + inner + 'px,transparent ' + inner + 'px,transparent ' + outer + 'px,#fff ' + outer + 'px)';
  if (img === _atmoMask) return;
  _atmoMask = img;
  root.style.webkitMaskImage = img;
  root.style.maskImage = img;
}
/* Mind's-eye fog: everything inside the ring is clear; outside lies dark fog. The edge is soft and
   broken by drifting mist so it reads as fog, not a line. */
function fogRgb() {
  const a = (S && S.stage && S.stage.atmo) || {};
  return a.fogCol || CFG.fogColor || [7, 6, 8];
}
/* ---- v0.39 2단계: 2D #sightFog 캔버스 은퇴 ----
   안개는 이제 재질(cardstock.js)과 후처리(inkwash.js)의 월드 거리 fade-to-dark 가 맡는다.
   이 함수는 2D 캔버스가 하던 나머지 세 가지 일만 남긴다:
     (a) CSS 레이어(#mindWave 등)가 읽는 영웅 화면 좌표 --hero-x/--hero-y
     (b) 심안 파동 순간 대기 레이어에 뚫리는 구멍(punchAtmoRing)
     (c) 착지 소나의 3D 지면 uniform (예전 그대로)
   혼령 창(punchSpiritLights)은 필요 없어졌다 — 혼령은 안개 면제 프로필이라 어둠에 잠기지 않는다. */
function syncHeroCss(hs) {
  const host = $('app');
  if (!host || !hs) return;
  const hxs = hs.x.toFixed(1) + 'px', hys = hs.y.toFixed(1) + 'px';
  if (hxs !== _heroCssX) { host.style.setProperty('--hero-x', hxs); _heroCssX = hxs; }
  if (hys !== _heroCssY) { host.style.setProperty('--hero-y', hys); _heroCssY = hys; }
}
/* 매 프레임: 영웅·심안 링 반경·파동·스테이지 안개색 → 공유 안개 uniform 과 후처리용 화면 좌표. */
function syncWorldFade() {
  const hero = S && S.hero;
  if (!hero) return;
  const R = ringR();
  /* 카메라가 바라보는 바닥 방향(화면 위 = 멀어지는 방향)을 안개 타원의 축으로 넘긴다. */
  let fx = 0, fz = -1;
  const cam = three && three.camera;
  if (cam) {
    const e = cam.matrixWorld.elements;
    fx = -e[8]; fz = -e[10];
    if (Math.hypot(fx, fz) < 1e-4) { fx = 0; fz = -1; }
  }
  updateWorldFade(arenaActive()?S.arena:hero, arenaActive()?arenaR()*1.65:R, (S && S.fogPulse) || 0, 12.5, qaFadeColor ? '#00ff00' : fogRgb(), qaFadeMat > 0, fx, fz);
  WF_POST.post = arenaActive() ? 0 : 0.50 * qaFadePostK;
  const hs = heroScreen();
  WF_POST.heroScreen.set(hs.x, hs.y);
  return hs;
}
function drawSightFog() {
  const hs = (S && S.hero) ? syncWorldFade() : null;
  if (!hs) { punchAtmoRing(0, 0, 0, 0); return; }
  syncHeroCss(hs);
  if (!(S && S.playing)) { punchAtmoRing(0, 0, 0, 0); return; }
  const box = viewBox();
  const wave = (S && S.sightWave) || 0;
  /* 4차: 심안 파동은 안개 구멍을 열기만 하고, 궤도 안의 두 번째 동심원 획은 그리지 않음. */
  if (wave > 0.04) {
    const holePx = Math.min(box.width, box.height) * (0.12 + 0.28 * wave);
    punchAtmoRing(hs.x, hs.y, holePx, wave);
  } else {
    punchAtmoRing(0, 0, 0, 0);
  }
  /* 착지 소나: 2D #sonarRing 은 걷어냈다(3D 지면 소나와 겹쳐 링이 두 겹이 되었다).
     이제 지면 셰이더(inklights.js)가 한 겹의 수묵 파동만 지형을 따라 내보낸다. */
  if (S && S.landRipple && S.landRipple.t > 0) {
    const lp = projectXZ(S.landRipple.x, S.landRipple.z, 0.15);
    const lt = S.landRipple.t;
    const lr = 8 + (1 - lt) * 68;   /* 화면 픽셀 반경 */
    if (three && three.inkUniforms) {
      /* 착지점에서 1m 가 몇 px 인지로 나눠 월드 반경(m)으로 바꾼다 — 지면 링이 예전 2D 링과 같은 크기로 퍼진다. */
      const lp1 = projectXZ(S.landRipple.x + 1, S.landRipple.z, 0.15);
      const pxPerM = Math.max(1, Math.hypot(lp1.x - lp.x, lp1.y - lp.y));
      three.inkUniforms.uSonarOrigin.value.set(S.landRipple.x, 0, S.landRipple.z);
      three.inkUniforms.uSonarRadius.value = lr / pxPerM;
      /* lt 는 1 → 0 으로 줄어든다: 처음에 가장 밝고 사라진다. 한 겹만 남았으므로 조금 더 세게. */
      three.inkUniforms.uSonarAlpha.value = Math.min(1.15, Math.max(0, lt) * 1.15);
    }
  } else if (three && three.inkUniforms) {
    three.inkUniforms.uSonarAlpha.value = 0;
  }
}
function loop(ts) {
  raf = requestAnimationFrame(loop);
  _frameId++;
  let scale = qa.timeScale || 1;
  if (!lastTs) lastTs = ts;
  const real = Math.max(0.0001, (ts - lastTs) / 1000);
  frameDt = Math.min(0.1, real);
  const raw = Math.min((qa.timeScale && qa.timeScale > 1) ? 0.2 : 0.05, real);
  if (S && S.slowT > 0) {
    S.slowT -= raw;
    if (S.slowT < 0) S.slowT = 0;
    else scale *= CFG.slowScale;
  }
  /* v0.30: 튜토리얼 느린 화면·첫 등장 느린 화면. 흔들림을 줄인 설정이면 0.6배까지만.
     prefers-reduced-motion이면 느린 화면 없이 안내 문구만(v0.24 6장). */
  if (S && S.playing && !S.paused) stepTutorial(raw);
  if (S) {
    const floor = a11yShake() ? 0.6 : 0.05;
    const noSlow = reducedMotion();
    if (!noSlow && S.slowMulT > 0 && S.slowMul < 1) scale *= Math.max(floor, S.slowMul);
    if (!noSlow && S.tutSlow && S.tutSlow < 1) scale *= Math.max(floor, S.tutSlow);
  }
  const dt = raw * scale;
  lastTs = ts;
  if (real > 0 && real < 1) {
    const f = 1 / real;
    fps.samples.push(f);
    if (fps.samples.length > 300) fps.samples.shift();
    fps.last = f;
  }
  if (toastT && now() > toastT) { $('toast').hidden = true; toastT = 0; }
  if (guideUntil && S && (S.elapsed || 0) >= guideUntil) hideGuide();
  if (pendingStage && now() >= pendingStage.until && (pendingStage.ready || now() >= pendingStage.until + 8000)) goStageNow(true);
  if (S && S.comboBurstT > 0) {
    S.comboBurstT -= raw;
    if (S.comboBurstT <= 0) {
      S.comboBurstT = 0;
      const app = $('app');
      if (app) app.classList.remove('combo-burst');
    }
  }
  if (inkFade > 0 && !pointers.down) {
    inkFade -= raw;
    if (inkFade <= 0) clearInk();
    else paintInk(lastStroke, clamp(inkFade / 0.35, 0, 1));
  }
  if (S && S.paused === 'levelup' && (qa.autoPick === true || (qa.autoPick !== false && (qa.autoStroke || (qa.noDelay && qa.timeScale > 1))))) {
    const b = document.querySelector('#levelChoices [data-up]');
    if (b) pickUpgrade(b.getAttribute('data-up'));
    else if (S.levelPicks && S.levelPicks[0]) pickUpgrade(S.levelPicks[0].id);
  }
  /* §5.2 QA·빠른 진행: 멈추지 않는 카드는 화면을 막지 않으므로 바로 추천으로 넘긴다. */
  if (S && S.quick) {
    const auto = qa.autoPick === true || (qa.autoPick !== false && (qa.autoStroke || (qa.noDelay && qa.timeScale > 1)));
    if (auto || now() - S.quick.t0 >= S.quick.dur) {
      const id = recommendedPick();
      if (id) pickQuick(id, auto); else closeQuickCards();
    }
  }
  /* §5.2 수용 기준 측정: 멈춰 있는 시간의 합(레벨업 정지). */
  if (S && S.playing && S.paused) S.stopT = (S.stopT || 0) + real;
  if (S && S.hitstop > 0) {
    S.hitstop -= raw;
    if (S.hitstop < 0) S.hitstop = 0;
  } else {
    if (S && S.playing && !S.paused) step(dt);
    stepDash(dt);
  }
  updateCam(dt);
  if (three) {
    /* v0.22 무한 청크: 영웅이 청크를 넘으면 3×3 창을 밀고 새 청크를 세운다. */
    if (three.chunks) three.chunks.update(raw, ts * 0.001, S ? S.hero.x : 0, S ? S.hero.z : 0);
    /* Hand the window's bonfires to the ember field whenever the chunks rebuild or the atmosphere is replaced. */
    if (three.chunks && three.atmo && (three.emberAt !== three.chunks.stats.rebuilds || three.emberAtmo !== three.atmo)) {
      three.emberAt = three.chunks.stats.rebuilds; three.emberAtmo = three.atmo;
      three.atmo.setEmitters(three.chunks.embers);
    }
    if (three.map && three.map.follow && !(three.chunks && three.chunks.bounds)) three.map.follow(S ? S.cam.x : 0, S ? S.cam.z : 0);
    stepArena(raw);
    if (three.map && three.map.update) three.map.update(raw, ts * 0.001);
    if (three.river && typeof three.river.update === 'function') three.river.update(raw);
    if (three.terrain3d && typeof three.terrain3d.update === 'function') three.terrain3d.update(raw);
     if (three.atmo) {
      if (S && S.hero) {
        three.atmo.setCenter(S.cam.x, 6, S.cam.z);
        three.atmo.update(raw);
      } else three.atmo.update(raw);
    }
    if (three.moon && three.moon.target) {
      const hx = S ? S.cam.x : 0, hz = S ? S.cam.z : 0;
      three.moon.position.set(hx - 18, 28, hz + 10);
      three.moon.target.position.set(hx, 0, hz);
      three.moon.target.updateMatrixWorld();
    }
    stepQuality(real);
    stepDying(raw);
    /* 매 프레임 배열을 새로 만들지 않고 제자리에서 걸러낸다(GC 압박 감소). */
    const fx = three.fx || [];
    let fxN = 0;
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      f.life -= raw;
      fadeFx(f.mesh, Math.max(0, f.life / f.max * 0.85));
      if (f.life <= 0) { if (f.mesh && f.mesh.userData && f.mesh.userData.rig) disposeCharGeom(f.mesh); three.scene.remove(f.mesh); continue; }
      fx[fxN++] = f;
    }
    fx.length = fxN;
    three.fx = fx;
    if (three.heroSpr && art.tickChar) {
      const st = (S && S.dash) ? 'dash' : 'idle';
      let hvx = 0, hvz = 0;
      if (S && S.dash) { hvx = S.dash.to.x - S.dash.from.x; hvz = S.dash.to.z - S.dash.from.z; }
      art.tickChar(three.heroSpr, 'hero', st, raw, hvx, hvz);
      const spr = three.heroSpr.userData && three.heroSpr.userData.sprite;
      if (spr) {
        spr.visible = true;
        if (spr.material) spr.material.opacity = 1;
        if (three.heroSpr.userData.rig) art.setCharOrder(three.heroSpr, 8);
        else { spr.renderOrder = 8; if (spr.material) spr.material.depthTest = false; }
      }
      three.heroSpr.visible = true;
    }
    (three.fx || []).forEach(function (f) {
      if (!f.sheet || !f.spr || !f.spr.material || !f.spr.material.map) return;
      const fr = Math.min(f.n - 1, Math.max(0, Math.floor((1 - f.life / f.max) * f.n)));
      const tmap = f.spr.material.map;
      tmap.repeat.set(1 / f.n, 1);
      tmap.offset.set(fr / f.n, 0);
    });
    if (three.slashes && three.slashes.length) {
      const sl = three.slashes;
      let w = 0;
      for (let i = 0; i < sl.length; i++) {
        const s = sl[i];
        if (s.update && s.update(dt)) { sl[w++] = s; continue; }
        if (s.mesh) three.scene.remove(s.mesh);
        if (s.dispose) s.dispose();
      }
      sl.length = w;
    }
    if (three.ink && three.ink.update) three.ink.update(dt);
    if (three.paper) three.paper.update(dt);
    if (three.traces) three.traces.update(dt);
    if (three.lights) three.lights.update(dt);
    /* v0.40 4단계: 초점 거리 = 주인공 가슴. 디오라마의 접사 초점 밴드가 주인공에 고정된다. */
    try {
      const dp = dofPassOf();
      if (dp && three.camera) {
        const hx = S && S.hero ? S.hero.x : 0, hz = S && S.hero ? S.hero.z : 0;
        dp.setFocus(focusDistance(three.camera, hx, 1.05, hz));
      }
    } catch (e) {}
    /* v0.40 5단계: 접힘 스프링 대상(부적·결계·카드) 적분 */
    try { tickFolds(dt); } catch (e) {}
    if (three.inkUniforms && S && S.hero) three.inkUniforms.uHeroPos.value.set(S.hero.x, 0, S.hero.z);
    /* v0.39: 그림자 프러스텀을 그 프레임의 카메라 가시 바닥에 맞춘다(텍셀 스냅 포함). */
    if (S && S.hero && S.playing) {
      const radius = ringR();
      for (const enemy of S.zombies) {
        if (enemy.alive && enemy.obj) enemy.obj.visible = !enemy.hidden && (arenaActive() || dist(enemy, S.hero) <= radius);
      }
      for (const spirit of livingMarks()) {
        if (spirit.obj && spirit.target) spirit.obj.visible = !spirit.target.hidden && (arenaActive() || dist(spirit.target, S.hero) <= radius);
      }
    }
    syncGroundEffects();
    bossFx.syncGround3D(S && S.boss, S && S.hazards, (S && S.elapsed) || 0, dt, ((CFG.bossPat || {}).slam || {}).r || 3.2);
    fitShadowFrustum();
    if (three.bloom && three.bloom.render) three.bloom.render(dt);
    else three.renderer.render(three.scene, three.camera);
    updateMarks();
    drawSightFog();
  }
  if (audio) audio.tick(CFG.bpm);
}

function guardEvents() {
  const app = $('app');
  function stop(e) { e.preventDefault(); }
  /* v1 교훈: 버튼 위 터치를 preventDefault하면 모바일에서 click이 사라진다. */
  function stopTouch(e) {
    if (e.target && e.target.closest && e.target.closest('button,a,input,label')) return;
    e.preventDefault();
  }
  ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
    document.addEventListener(ev, stopTouch, { passive: false });
    app.addEventListener(ev, stopTouch, { passive: false });
  });
  document.addEventListener('contextmenu', stop);
  document.addEventListener('dblclick', stop);
  window.addEventListener('scroll', function () { window.scrollTo(0, 0); });
  app.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    /* 상점·도감·수련장 같은 메뉴 오버레이가 열려 있으면 ESC는 그 오버레이 닿기(overlayShell)만 맡는다.
       예전에는 같은 ESC가 상점을 닫은 뒤 일시정지까지 열어, 메뉴를 닫을 때 판이 멈춰 있었다. */
    const menus = ['ov-shop', 'ov-codex', 'ov-train', 'ov-level', 'ov-stage', 'ov-result', 'ov-idle', 'ov-title'];
    for (let i = 0; i < menus.length; i++) {
      const el = $(menus[i]);
      if (el && el.classList.contains('show')) return;
    }
    if (S && S.paused === 'manual') resumeRun();
    else if (S && S.playing) pauseRun();
  });
}
function bindUi() {
  if ($('btnMute')) $('btnMute').addEventListener('click', function (e) { e.stopPropagation(); setMuted(!save.muted); });
  if ($('btnMute2')) $('btnMute2').addEventListener('click', function () { setMuted(!save.muted); });
  if ($('btnPause')) $('btnPause').addEventListener('click', function (e) { e.stopPropagation(); pauseRun(); });
  if ($('btnResume')) $('btnResume').addEventListener('click', function () { resumeRun(); });
  if ($('btnQuit')) $('btnQuit').addEventListener('click', function () { quitRun(); });
  /* v0.29 §13: 기록 보내기(선택)와 내보내기. 아직 서버가 없어 '켬'은 동의 표시만 남긴다. */
  function syncRecBtn() {
    const b = $('btnRec');
    if (b) b.textContent = '기록 보내기: ' + (telemetry.isOptIn() ? '켬' : '끔');
  }
  if ($('btnRec')) $('btnRec').addEventListener('click', function () {
    telemetry.setOptIn(!telemetry.isOptIn()); syncRecBtn();
    toast(telemetry.isOptIn() ? '기록 보내기에 동의했습니다 (아직 서버 없음 — 기기에만 쌓임)' : '기록 보내기를 껐습니다');
  });
  if ($('btnRecOut')) $('btnRecOut').addEventListener('click', function () {
    telemetry.save();
    if (telemetry.download()) toast('기록을 파일로 내보냈습니다 (' + telemetry.stats().total + '개)');
    else toast('내보내지 못했습니다');
  });
  syncRecBtn();
  uiRouter.mountAudioPill();
  uiRouter.bindStartAndTrain({
    onStart: function () { beginStage(upcomingRun()); },
    onTrain: function () { openTrain(); }
  });
  hudCtrl.syncMuteUi(!!save.muted);
  hudCtrl.syncActTheme(actOf(save.stage || 1));
  wireShopTabs();
  wireTrain();
  $('btnShop').addEventListener('click', function () { refreshShop(); showOv('ov-shop'); });
  if ($('btnCodex')) $('btnCodex').addEventListener('click', function () { renderCodex(); showOv('ov-codex'); });
  if ($('btnCodexClose')) $('btnCodexClose').addEventListener('click', function () { hideOvs(); showOv('ov-title'); });
  if ($('btnTrainClose')) $('btnTrainClose').addEventListener('click', function () { closeTrain(); });
  if ($('btnTrainTut')) $('btnTrainTut').addEventListener('click', function () { closeTrain(); startRun({ stage: 1, replay: true }); });
  $('btnShopClose').addEventListener('click', function () {
    if (S && (S.won || S.lost)) showOv('ov-result');
    else showOv('ov-title');
  });
  $('btnResultShop').addEventListener('click', function () { refreshShop(); showOv('ov-shop'); });
  $('btnResultGo').addEventListener('click', function () {
    const n = (S && S.won && S.nextStage) ? S.nextStage : ((S && S.stageNo) || save.stage || 1);
    if (S && !S.noScore) telemetry.event('result_choice', { stage: S.stageNo, next: n, won: S.won, action: n === S.stageNo ? 'retry' : 'advance' });
    if (S && S.won && S.nextStage && !qa.noDelay) { beginStage(n); return; }
    startRun({ stage: n });
  });
  if ($('btnStageGo')) $('btnStageGo').addEventListener('click', function (e) { e.stopPropagation(); goStageNow(); });
  if ($('ov-stage')) $('ov-stage').addEventListener('click', function () { goStageNow(); });
  $('btnIdleTake').addEventListener('click', function () { collectIdle(false); });
  $('btnIdleDouble').addEventListener('click', function () {
    $('btnIdleDouble').disabled = true;
    $('btnIdleDouble').textContent = '광고 자리…';
    setTimeout(function () {
      $('btnIdleDouble').disabled = false;
      $('btnIdleDouble').textContent = '광고로 두 배 받기';
      collectIdle(true);
    }, qa.noDelay ? 0 : 800);
  });
  document.querySelectorAll('[data-buy]').forEach(function (b) {
    b.addEventListener('click', function () { buy(b.getAttribute('data-buy')); });
  });
  /* v0.30 §7.2 모드 선택 · §8.1 수련 다시 보기 · §11 접근성 · 튜토리얼 건너뛰기 */
  $('judgeFlash').addEventListener('animationend', function () { this.hidden = true; });
  if ($('btnA11y')) $('btnA11y').addEventListener('click', function () {
    const r = $('titleA11y');
    if (r) r.hidden = !r.hidden;
  });
  [['btnCb', 'colorblind'], ['btnCb1', 'colorblind'], ['btnShake', 'shake'], ['btnShake1', 'shake']].forEach(function (p) {
    const b = $(p[0]);
    if (!b) return;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      const key = p[1];
      const next = !(key === 'colorblind' ? a11yCb() : a11yShake());
      setA11y(key, next);
      toast(key === 'colorblind' ? (next ? '색약 팔레트를 켰습니다 — 예고마다 모양 아이콘이 붙습니다' : '색약 팔레트를 껐습니다')
        : (next ? '화면 흔들림을 줄입니다' : '화면 흔들림을 되돌렸습니다'));
    });
  });
  if ($('btnSkip')) $('btnSkip').addEventListener('click', function (e) {
    e.stopPropagation();
    endTutorial('skip');
    toast('안내를 건너뜁니다');
  });
  if ($('btnTrainOffer')) $('btnTrainOffer').addEventListener('click', function () {
    if (S) save.trainOffered = (S.stage ? S.stage.id : 1) + ':' + (S.streakAfter || 0);
    persist();
    setMode('train');
    startRun({ stage: (S && S.stageNo) || 1 });
  });
}

function fpsReport() {
  const raw = fps.samples.slice();
  const a = raw.filter(function (f) { return f >= 20 && f <= 144; });
  const use = a.length >= 10 ? a : raw;
  if (!use.length) return { avg: 0, min: 0, n: 0, rawN: raw.length, last: fps.last };
  let s = 0, m = use[0];
  for (let i = 0; i < use.length; i++) { s += use[i]; if (use[i] < m) m = use[i]; }
  return { avg: s / use.length, min: m, n: use.length, rawN: raw.length, last: fps.last };
}

async function boot() {
  const _tBoot = performance.now();
  loadSave();
  qa.mute = !!save.muted;
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
  await probeAssets();
  art = await buildArt(THREE);
  three = await makeWorld();
  bossFx.attachScene(THREE, three.scene);
  try { art.setCamera(three.camera); } catch (e) {}
  setupChunkWorld((three.map && three.map.stageId) || 1, (three.map && three.map.id) || 'map1');
  applyFxinkAtmo((three.map && three.map.id) || 'map1');
  applyStageAtmo(stageOf(titleSel || save.stage || 1));
  previewStageWorld(titleSel || save.stage || 1);
  loadMarkImages();
  resizeInk();
  guardEvents();
  bindUi();
  onResize();
  renderHud();
  refreshTitleHelp();
  renderModes();
  syncA11yUi();
  const idled = checkIdle();
  if (!idled) showOv('ov-title');
  /* An unclaimed idle reward keeps the old lastSeen, so a refresh does not lose it. */
  persist(!idled);
  /* v0.35/v0.49: 타이틀이 즉시 조작 가능해진 뒤 백그라운드로 예열·디오라마 프리로드 수행 */
  try { titlePrewarm(); } catch (e) {}
  setTimeout(function () {
    try { preloadDiorama(); } catch (e) {}
    if (!need2d) { try { preloadFigures().catch(function () {}); } catch (e) {} }
  }, 600);
  if (!raf) loop(now());
  window.GPv2.ready = true;
  window.GPv2.assetsUsed = art.used;
  perfMark('boot_ready', performance.now() - _tBoot, { need2d: need2d });
}

const GPv2 = {
  CFG: CFG, SHAPE_MARK: SHAPE_MARK,
  get save() { return save; },
  get state() { return S; },
  get three() { return three; },
  get ready() { return !!this._ready; },
  set ready(v) { this._ready = v; },
  resetSave: function () {
    save.coins = 0; save.atkLv = 0; save.hpLv = 0; save.coinLv = 0;
    save.lastSeen = Date.now(); save.runs = 0;
    save.stage = 1; save.stars = {}; save.bestScore = 0;
    /* v0.30: 난이도·첫 경험 기록·연패도 초기화(새 세이브 검증용). */
    save.mode = 'jeongseok'; save.tutorialDone = 0; save.moments = {};
    save.streak = null; save.trainOffered = null;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    persist(); renderHud(); refreshTitleHelp(); syncA11yUi();
  },
  setQa: function (o) { Object.keys(o || {}).forEach(function (k) { qa[k] = o[k]; }); if (audio) audio.setQuiet(qa.mute, qa.noDelay); },
  /* QA 훅: 시작 경로 계측(타이틀 예열·소개 카드 준비·판 시작·청크 재구축에 걸린 ms) */
  warmNow: function () { return warmShaders(); },
  perfLog: function () { return PERF_LOG.slice(); },
  perfClear: function () { PERF_LOG.length = 0; return true; },
  dashLatencyReport: function () {
    return {
      latency: S && S.dashLatency ? S.dashLatency.summary() : null,
      queue: S && S.inputQueue ? S.inputQueue.stats() : null,
      fps: fpsReport()
    };
  },
  warmInfo: function () { return warmInfo(); },
  /* QA: 지금까지 먹획을 구운 혼령 기호 */
  bakedShapes: function () { return art.spiritInkShapes ? art.spiritInkShapes() : null; },
  /* QA: 예열 후에도 '새 프로그램'을 만드는 레시피를 찾는다(각 레시피를 실제 렌더 경로에 넣고 컴파일). */
  warmCensus: function () {
    const out = [];
    const R = three.renderer, SC = three.scene, CAM = three.camera;
    prewarmRecipes().forEach(function (r) {
      const p0 = R.info.programs.length;
      let obj = null;
      try { obj = r.make(); } catch (e) { out.push({ label: r.label, err: String(e).slice(0, 40) }); return; }
      if (!obj) return;
      SC.add(obj);
      try { R.compile(SC, CAM); } catch (e) {}
      const dp = R.info.programs.length - p0;
      SC.remove(obj);
      if (dp !== 0) out.push({ label: r.label, dp: dp });
    });
    return out;
  },
  /* QA: 레시피별 제작 비용을 한 번에 하나씩 재며 window.__WR 에 쌓는다(페이지가 멈춰도 진행을 볼 수 있게). */
  warmProfile: function (only) {
    if (window.__WR) return window.__WR.length;
    window.__WR = [];
    const list = prewarmRecipes().filter(function (r) { return !only || String(r.label).indexOf(only) === 0; });
    let i = 0;
    const step = function () {
      if (i >= list.length) { window.__WR.push({ done: true }); return; }
      const r = list[i++];
      const t0 = performance.now();
      let ok = true;
      try { r.make(); } catch (e) { ok = String(e).slice(0, 60); }
      window.__WR.push({ label: r.label, ms: Math.round(performance.now() - t0), ok: ok });
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
    return 0;
  },
  startRun: startRun,
  spawnSpirit: function (o) { return spawnSpirit(o); },
  spawnBoss: function (o) { return spawnBoss(o); },
  spawnZombie: function (o) { return spawnZombie(o); },
  addSpirit: function (o) { return addSpirit(o || { force: true }); },
  setSpiritCount: function (n) { return setSpiritCount(n); },
  /* v0.27 QA 훅: 화면 통일·HUD·안내 문구 */
  lensInfo: function () {
    const w = three && three.view ? three.view.clientWidth : 0;
    const h = three && three.view ? Math.max(1, three.view.clientHeight) : 1;
    return {
      w: w, h: h, short: Math.min(w, h), fov: (three && three.camera && three.camera.fov) || 0,
      span: viewSpanFor(Math.min(w, h)), camDist: camDist(), arena: arenaActive(),
      ringPx: (lastMarkMetrics && lastMarkMetrics.ring && lastMarkMetrics.ring.px) || (S && S.ringPx) || 0,
      ringR: S ? ringR() : 0, focus: S && S.focus ? { x: S.focus.x, z: S.focus.z } : null,
      hero: S ? { x: S.hero.x, z: S.hero.z } : null
    };
  },
  hudInfo: function () {
    const rect = function (id) { const e = $(id); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: e.textContent }; };
    const hud = $('hud'), row = document.querySelector('#hud .row-top'), pips = $('hpPips');
    const doc = document.documentElement;
    return {
      hudH: hud ? Math.round(hud.getBoundingClientRect().height) : 0,
      overflowX: doc.scrollWidth - doc.clientWidth,
      rowOverflow: row ? row.scrollWidth - row.clientWidth : 0,
      hudOverflow: hud ? hud.scrollWidth - hud.clientWidth : 0,
      stage: rect('stageLabel'), timer: rect('timer'), coin: rect('coinLabel'), combo: rect('comboLabel'),
      chargeText: rect('chargeText'), dashLabel: rect('dashLabel'), lvl: rect('lvlLabel'),
      pips: pips ? { n: pips.querySelectorAll('i').length, h: Math.round(pips.getBoundingClientRect().height), w: Math.round(pips.getBoundingClientRect().width) } : null,
      hpMore: rect('hpMore'),
      vw: window.innerWidth, vh: window.innerHeight
    };
  },
  guideText: function () { const g = $('guide'); return g && g.classList.contains('show') ? g.textContent : ''; },
  /* 렌더 프레임 없이 카메라를 수렴시켜 투영만 잰다 — 헤드리스 소프트웨어 렌더 대책. */
  /* 보스 그림·윤곽광만 따로 세워 본다(결계 없이) — 헤드리스 결계 렌더가 느리기 때문. */
  bossVisualProbe: function (shape, varN, scale) {
    if (!three) return null;
    if (this._bv && this._bv.parent) three.scene.remove(this._bv);
    const obj = addEntityVisual('boss', shape || 'hline', { bossVar: varN, bossScale: scale == null ? 1 : scale });
    obj.position.set(0, 0, 0);
    three.scene.add(obj);
    if (art.tickChar) art.tickChar(obj, 'boss', 'idle', 0.016, 0, 1);
    this._bv = obj;
    const ud = obj.userData || {};
    return { hasRim: !!ud.rim, rimOp: ud.rim && ud.rim.material ? ud.rim.material.opacity : null, rimHex: ud.rimHex, worldH: ud.worldH, bell: ud.bellLocal, bossVar: varN == null ? 3 : varN, scale: scale == null ? 1 : scale };
  },
  /* 스테이지 분위기만 적용해 수치를 읽는다(맵 재구성 없이) — 12장 대비 검증용. */
  atmoProbe: function (n) {
    const st = stageOf(n || 1);
    applyStageAtmo(st);
    const T = three;
    return {
      stage: st.id, fog: T.scene.fog ? +T.scene.fog.density.toFixed(4) : null,
      moon: T.moon && T.moon.intensity, amb: T.amb && T.amb.intensity, hemi: T.hemi && T.hemi.intensity,
      fill: T.fill && T.fill.intensity, fogCol: st.atmo.fogCol, tint: st.atmo.tint,
      clear: T.scene.background && T.scene.background.getHexString ? '#' + T.scene.background.getHexString() : null
    };
  },
  camSettle: function (n) {
    if (!S || !three) return null;
    for (let i = 0; i < (n || 14); i++) { S.cam.x = S.hero.x; S.cam.z = S.hero.z; updateCam(0.2); }
    three.camera.updateMatrixWorld(true);
    return { focus: { x: +S.focus.x.toFixed(2), z: +S.focus.z.toFixed(2) }, pos: three.camera.position.toArray().map(function (v) { return +v.toFixed(2); }), fov: three.camera.fov };
  },
  overlayShown: function () { return ['ov-title', 'ov-shop', 'ov-result', 'ov-idle', 'ov-level', 'ov-stage', 'ov-pause', 'ov-codex', 'ov-train'].filter(function (k) { return $(k) && $(k).classList.contains('show'); }); },
  setMuted: setMuted,
  pauseRun: pauseRun,
  resumeRun: resumeRun,
  quitRun: quitRun,
  ringInfo: function () { updateMarks(); const rg = lastMarkMetrics && lastMarkMetrics.ring; return { r: ringR(), px: (rg && rg.px) || (S && S.ringPx), rx: rg && rg.rx, ry: rg && rg.ry, cx: rg && rg.cx, cy: rg && rg.cy, lv: S && (S.ringLv || 0), frac: rg && rg.frac, fov: (three && three.camera && three.camera.fov) || (CFG.fov), max: CFG.spiritMax, cssPx: lastMarkMetrics && lastMarkMetrics.cssPx, bellPx: lastMarkMetrics && lastMarkMetrics.bellPx, bodyPx: lastMarkMetrics && lastMarkMetrics.bodyPx, kind: rg && rg.kind, pts: rg && rg.pts, markStyle: lastMarkMetrics && lastMarkMetrics.markStyle }; },
  heroScreen: function () { return S && S.hero ? heroScreen() : { x: 0, y: 0 }; },
  unproject: function (sx, sy, y0) { return unprojectToY(sx, sy, y0 == null ? 0.2 : y0); },
  ellipseAt: function (theta) { if (!(S && S.ringR > 0)) applyRingBoost(); return ellipseScreenAt(theta, heroScreen()); },
  rimErrorPx: function (sx, sy) { if (!(S && S.ringR > 0)) applyRingBoost(); return rimErrorPx(sx, sy); },
  despawnZombie: function (id) {
    if (!S) return false;
    const z = (S.zombies || []).filter(function (q) { return q.id === id; })[0];
    if (!z) return false;
    z.alive = false;
    if (z.obj && three) three.scene.remove(z.obj);
    if (qa.noDelay) snapSpiritsToTargets();
    else assignSpiritTargets();
    return true;
  },


  markedList: livingMarks,
  assign: function () { assignSpiritTargets(); return livingMarks().length; },
  bellPans: function () { return (S && S.bellPans) || (audio && audio.lastPans && audio.lastPans()) || []; },
  readMessage: function (rec) { return (G.readMessage && G.readMessage(rec)) || ''; },
  spawnItem: function (o) { return spawnItem(o); },
  setHero: function (x, z) { if (!S) return; S.hero.x = x; S.hero.z = z; S.cam.x = x; S.cam.z = z; if (three.heroSpr) placeGroup(three.heroSpr, x, z); },
  setDashCount: function (n) { if (S) S.dashCount = n; renderHud(); },
  setElement: function (el) { setDashElem(el); checkEvolutions(); return S && S.dashElem; },
  startBell: function (shape, dur) { startBell(shape, dur); },
  setMap: function (id) { return switchMap(id); },
  getMap: function () { return three && three.map && { id: three.map.id, name: three.map.name, key: three.map.key }; },
  anim: Anim,
  strokeType: strokeType,
  shapePool: function () { return S ? (S.pool || []).slice() : []; },
  spawnPool: spawnPool,
  strokePath: finishStroke,
  /* v0.15~v0.17 QA 훅 */
  parry: function () { return doParry(null); },
  tap: function () { return doParry(null); },
  cleave: function (rec) { return castCleave(rec || null); },
  setCharge: function (n) { if (S) { S.charge = clamp(n | 0, 0, CFG.cleaveCharge || 100); renderHud(); } return S && S.charge; },
  addCharge: function (n) { addCharge(n); return S && S.charge; },
  fireWave: function (t) {
    const list = stageWaves();
    const w = list.filter(function (x) { return t == null || x.t === t; })[0];
    if (!w) return null;
    fireWave(w);
    return { t: w.t, spawned: (S && S.waveIds || []).length };
  },
  waves: function () { return stageWaves().map(function (w) { return { t: w.t, n: w.n, fired: !!(S && S.waveDone && S.waveDone[w.t]) }; }); },
  magnet: function (x, z) { return magnetPull({ x: x == null ? (S && S.hero.x) : x, z: z == null ? (S && S.hero.z) : z }); },
  evolve: function () { checkEvolutions(); return S && Object.keys(S.evo || {}); },
  setSpiritCap: function (n) { if (S) S.spiritCap = clamp(n | 0, 0, CFG.spiritMax || 5); return S && S.spiritCap; },
  preview: function () { return (S && S.preview) || null; },
  resolveTieAxis: function (dir) { return resolveTieAxis(dir); },
  inputBuf: function () { return (S && S.inputBuf) || null; },
  openLevelUp: function () { if (S) openLevelUp(); },
  spawnElite: function (o) {
    o = o || {};
    const z = spawnZombie({ type: 'elite', x: o.x, z: o.z, hp: o.hp });
    if (z) z.elite = true;
    return z;
  },
  bossInfo: function () {
    const b = S && S.boss;
    return b ? { state: b.state || 'walk', t: b.stateT || 0, seqI: b.seqI, seqN: b.seq.length, alive: b.alive, aim: b.aim || null, pat: b.pat || null, poise: b.poise, phase2: !!b.phase2, hidden: !!b.hidden, x: b.x, z: b.z,
      clones: (b.clones || []).filter(function (c) { return c.alive; }).map(function (c) { return { id: c.id, x: c.x, z: c.z }; }),
      chant: b.chant ? { seq: b.chant.seq.slice(), i: b.chant.i } : null, kiai: b.kiai ? { t: b.kiai.t, lock: b.kiai.lock } : null,
      shrink: S.arena && S.arena.shrink ? { r: S.arena.r, left: S.arena.shrink.pillars.filter(function (p) { return p.alive; }).length } : null,
      shots: (S.shots || []).length, gold: (S.shots || []).filter(function (q) { return q.gold; }).length } : null;
  },
  bossPattern: function (id) { const b = S && S.boss; if (!b || !b.alive) return null; startBossPattern(b, id); return b.state; },
  /* v0.27 QA: 걷기 무적 규칙을 프레임 없이 직접 확인한다(일섬→절단 경로와 같은 함수). */
  cutProbe: function (state) {
    const b = S && S.boss;
    if (!b || !b.alive) return null;
    if (state) { b.state = state; b.stateT = 0; }
    const before = b.seqI;
    cutBoss(b);
    return { state: b.state, before: before, after: b.seqI, alive: b.alive, judged: (document.getElementById('judgeFlash') || {}).textContent };
  },
  /* 장면(결계) 없이 상태별 절단 규칙만 추린다 — 헤드리스에서 결계 렌더가 느리기 때문. */
  bossArmorProbe: function () {
    if (!S) return null;
    const prev = S.boss;
    const out = {};
    const mk = function (state, extra) {
      const o = { id: -1, isBoss: true, alive: true, state: state, stateT: 0, seq: ['hline', 'hline', 'hline', 'hline', 'hline', 'hline'], seqI: 0, r: 1.1, poise: 3, x: 3, z: 0, obj: null, marked: false, hp: 99, clones: [] };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      return o;
    };
    ['walk', 'telegraph', 'kiai', 'slamTele', 'volleyTele', 'stun', 'groggy', 'charge', 'seal'].forEach(function (st) {
      const fake = mk(st, { firstWalk: false });
      S.boss = fake;
      cutBoss(fake);
      out[st] = { seqI: fake.seqI, state: fake.state, alive: fake.alive };
      S.boss = prev;
    });
    /* 첫 걷기(등장 직후)는 완전 무적 */
    let f = mk('walk', { firstWalk: true });
    S.boss = f; cutBoss(f); out['walk(first)'] = { seqI: f.seqI };
    /* 그 뒤 걷기: 한 번은 빈틈, 곸바로 다음은 튕김 */
    f = mk('walk', { firstWalk: false, walkCutAt: null });
    S.boss = f; cutBoss(f); const a1 = f.seqI; cutBoss(f); out['walk(빈틈)'] = { first: a1, second: f.seqI };
    S.boss = prev;
    return out;
  },
  bossTap: function () { return kiaiTap(); },
  bossStroke: function (type) { if (type === 'star') return sealStroke(); return chantStroke(type); },
  veilStroke: function (pts) { return veilStroke(pts); },
  dashAtBoss: function () { const b = S && S.boss; return b ? dashAtBoss(b, 'hline') : null; },
  dashAt: function (id) { const m = livingMarks().filter(function (q) { return q.target && q.target.id === id; })[0]; return m ? dashAtBoss(m, 'hline') : null; },
  screenOf: function (x, z, y) { return projectXZ(x, z, y || 0); },
  setBossState: function (st) {
    const b = S && S.boss;
    if (!b) return null;
    b.state = st; b.stateT = 0;
    if (st === 'telegraph') b.aim = { x: S.hero.x, z: S.hero.z };
    return b.state;
  },
  recognize: function (pts, opt) { return G.recognize(pts, opt); },
  /* v0.29 QA 훅: 빈틈 고리·기물 역류·타격감·공정성·기록 */
  gapInfo: function () { const b = S && S.boss; return b && b.alive ? gapInfo(b) : null; },
  gapBuf: function () { return S && S.gapBuf ? { type: S.gapBuf.type, age: Math.round(now() - S.gapBuf.t0) } : null; },
  reflectState: function () {
    const b = S && S.boss;
    return { ready: reflectReady(), used: !!(b && b.reflectUsed), flying: ((S && S.reflects) || []).length, totems: bossMinions().length, bossState: b ? b.state : null };
  },
  hitstop: function () { return S ? +(S.hitstop || 0).toFixed(3) : 0; },
  goldEdge: function () { return S ? +(S.goldEdge || 0).toFixed(3) : 0; },
  fairness: function () { return S ? { firstForcedHit: !!S.firstForcedHit, iframe: +(S.iframe || 0).toFixed(2), hp: S.hp, deathWhy: S.deathWhy || null } : null; },
  hurtForce: function (n, why, opts) { return heroHurtForce(n, why, opts); },
  /* §3.4 검증용: 보스와 주인공 사이에 임시 기물을 세운다(그림 없이 판정만). */
  fakeTotem: function (x, z) {
    if (!S) return null;
    const t = { id: ++S._id, kind: 'zombie', type: 'totem', shape: 'tri', x: x, z: z, r: 0.6, alive: true, hp: 1, isTotem: true, frozen: 0, burn: 0, poison: 0, stun: 0, marked: false, obj: null };
    S.zombies.push(t);
    return { id: t.id, x: t.x, z: t.z };
  },
  /* 결정론적 진행: rAF 없이 게임 로직만 n스텝 돌린다(헤드리스 3fps 환경의 시간 시험용). */
  stepN: function (n, dt) {
    if (!S) return null;
    n = n || 1; dt = dt || 1 / 60;
    for (var i = 0; i < n; i++) {
      S.hitstop = 0;
      if (S.tutorial) tickTutorial();
      if (S.playing && !S.paused) step(dt);
      stepDash(dt);
    }
    updateMarks();
    return { elapsed: +(S.elapsed || 0).toFixed(2), state: S.boss ? S.boss.state : null, hp: S.hp };
  },
  telemetryStats: function () { return telemetry.stats(); },
  telemetryEvents: function (name) { const all = telemetry.all(); return name ? all.filter(function (e) { return e.n === name; }) : all; },
  exportTelemetry: function () { telemetry.save(); return telemetry.exportJSON(); },
  clearTelemetry: function () { telemetry.clear(); return telemetry.stats(); },
  /* 보스전 시간 예산(§4.3)은 v0.30이지만, 지금 실측할 수 있게 재료를 내준다. */
  bossClock: function () {
    const b = S && S.boss, st = S && S.stage;
    return b && st ? { state: b.state, t: +(b.stateT || 0).toFixed(2), elapsed: +(S.elapsed || 0).toFixed(1), left: +(S.timeLeft || 0).toFixed(1),
      seqI: b.seqI, seqN: b.seq.length, poise: b.poise, phase2: !!b.phase2 } : null;
  },
  failHint: failHint,
  titleHelp: refreshTitleHelp,
  upcomingRun: upcomingRun,
  unlockedShapes: unlockedShapes,
  /* 스테이지 */
  STAGES: STAGES,
  stageOf: stageOf,
  stageInfo: function () {
    const st = curStage();
    return {
      id: st.id, name: st.name, sub: st.sub, map: st.map, time: st.time, bossAt: st.bossAt, eliteAt: st.eliteAt || 0,
      bossShapes: st.bossShapes, shapes: (st.shapes || []).slice(), spiritCap: st.spiritCap,
      spawn: st.spawn ? Object.assign({}, st.spawn) : null,
      waves: stageWaves().map(function (w) { return { t: w.t, n: w.n, elite: !!w.elite }; }),
      /* v0.32: 지형 규칙·별 3 과제·보스 개성 */
      terrain: st.terrain ? Object.assign({}, st.terrain) : null,
      terrainLine: st.terrain ? st.terrain.line : null,
      star3: st.star3 || null, bossName: st.bossName || '', bossVisual: bossVisualOf(st),
      bossPatterns: st.boss ? { p1: (st.boss.patterns || []).slice(), p2: (st.boss.phase2 || []).slice(), p3: (st.boss.phase3 || []).slice(), telegraph: st.boss.telegraph } : null,
      saveStage: save.stage, stars: Object.assign({}, save.stars), bestScore: save.bestScore
    };
  },
  /* v0.32 QA: 지형 엔진 — 규칙·발동 횟수·그 자리 판정 */
  terrainInfo: function () {
    if (!S) return null;
    const T = S.terrain || {};
    return {
      rule: T.kind, name: T.name, counts: Object.assign({}, T.counts || {}), ringMul: +(T.ringMul || 1).toFixed(4),
      moon: !!T.moon, moonT: +(T.moonT || 0).toFixed(1), revealT: +(T.revealT || 0).toFixed(2),
      stumbleT: +(T.stumbleT || 0).toFixed(2), rootT: +(T.rootT || 0).toFixed(2), wallT: +(T.wallT || 0).toFixed(1),
      lines: S.stage && S.stage.terrain ? S.stage.terrain.line : null
    };
  },
  zoneAt: function (x, z, stageNo) { return zoneAt(x, z, stageNo != null ? stageOf(stageNo) : null); },
  /* 소개 카드를 실제로 채워 그 한 줄을 읽는다(판은 건드리지 않는다) */
  stageIntroText: function (n) {
    const st = stageOf(n || (S && S.stage && S.stage.id) || 1);
    fillStageIntro(st);
    const el = $('stageTerrain');
    return { stage: st.id, terrain: el ? el.textContent : null, goal: $('stageGoal') ? $('stageGoal').textContent : null, tip: $('stageTip') ? $('stageTip').textContent : null };
  },
  terrainProbe: function (x, z, stageNo) {
    const st = stageNo != null ? stageOf(stageNo) : (S && S.stage) || stageOf(1);
    const out = [];
    const kinds = ['rubble', 'bamboo', 'bell', 'blood'];
    const cell = { rubble: [5.0, 11, 0.42, 0.9, 1.9], bamboo: [6.5, 37, 0.55, 2.0, 3.4], bell: [10.0, 83, 0.4, 0.5, 0.5], blood: [8.0, 97, 0.55, 2.4, 3.2] };
    tPatchesNear(x, z, 12, 7.0, 71, 1, 0, 0);
    kinds.forEach(function (k) {
      const c = cell[k];
      tPatchesNear(x, z, 12, c[0], c[1], c[2], c[3], c[4]).slice(0, 4).forEach(function (p) { out.push({ kind: k, x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: +p.r.toFixed(2), key: p.key }); });
    });
    if (tWaterAt(x, z)) out.push({ kind: 'water', x: x, z: +tWaterCenter(x).toFixed(2), r: 2.1 });
    if (tRootAt(x, z)) out.push({ kind: 'root' });
    return { stage: st.id, rule: st.terrain ? st.terrain.kind : null, at: zoneAt(x, z, st), zones: out };
  },
  /* 한 장의 지형 조각을 영웅 앞에 강제로 세워 두는 QA 도구(그 장판 위로 일섬·착지 시험) */
  warpHeroToZone: function (kind) {
    if (!S) return null;
    const want = kind || (S.terrain && S.terrain.kind);
    for (let r = 0.5; r <= 40; r += 0.35) {
      for (let i = 0; i < 48; i++) {
        const a = i / 24 * Math.PI * 2;
        const x = S.hero.x + Math.cos(a) * r, z = S.hero.z + Math.sin(a) * r;
        const zz = zoneAt(x, z);
        const hit = zz && (zz.kind === want);
        if (hit) {
          S.hero.x = x; S.hero.z = z; S.cam.x = x; S.cam.z = z;
          if (three && three.heroSpr) placeGroup(three.heroSpr, x, z);
          return { x: +x.toFixed(2), z: +z.toFixed(2), zone: zz };
        }
      }
    }
    return null;
  },
  /* v0.32 QA: 별 3 판정(현재 상태)과 7.1 난이도 지수 */
  starProbe: function (stageNo) {
    const st = stageNo != null ? stageOf(stageNo) : (S && S.stage) || stageOf(1);
    const info = star3Info(st);
    return {
      stage: st.id, hits: S ? (S.hits || 0) : 0, hpPct: S ? +(S.hp / Math.max(1, maxHp())).toFixed(3) : null,
      comboMax: S ? (S.comboMax || 0) : 0, star2: S ? (S.hp / Math.max(1, maxHp()) >= 0.5 || (S.hits || 0) <= (CFG.star2Hits || 3)) : null,
      star3: info, stars: S ? starsFor(!!S.won) : null, cap: starCap()
    };
  },
  difficultyCurve: function () {
    return STAGES.map(function (st) {
      const B = st.boss || {};
      const mix = (st.mix && st.mix.length) ? st.mix[st.mix.length - 1][1] : {};
      const keys = Object.keys(mix).filter(function (k) { return k !== 'imp' && k !== 'brute'; });
      const variant = keys.reduce(function (a, k) { return a + (mix[k] || 0); }, 0);
      const tele = B.telegraph || 1.1, shapes = st.bossShapes || 3, ms = (st.spawn && st.spawn.ms) || 900;
      const D = 0.35 * (1.35 / tele) + 0.25 * (shapes / 6) + 0.25 * (900 / ms) + 0.15 * (variant / 0.5);
      return { stage: st.id, tele: tele, shapes: shapes, ms: ms, variant: +variant.toFixed(2), D: +D.toFixed(3) };
    });
  },
  bossInfoPlus: function () {
    const b = S && S.boss;
    if (!b) return null;
    return {
      stage: S.stageNo, name: S.stage && S.stage.bossName, var: S.bossVar,
      state: b.state, phase: b.phase || 1, phase2: !!b.phase2, phase3: !!b.phase3, patI: b.patI || 0,
      clash: b.clash ? { i: b.clash.i, shape: b.clash.shape, t: +b.clash.t.toFixed(2), need: b.clash.need } : null,
      mimic: b.mimic ? { dir: b.mimic.dir, t: +b.mimic.t.toFixed(2) } : null,
      shuffle: b.shuffle ? { t: +b.shuffle.t.toFixed(2), gold: +b.shuffle.gold.toFixed(2), locked: !!b.shuffle.locked } : null,
      shape: b.shape, arena: S.arena ? +S.arena.r.toFixed(2) : null, phaseTele: S.phaseTele,
      clashWin: S.clashWin || 0, shuffleLock: S.shuffleLock || 0, goldReflect: S.goldReflectN || 0,
      card: $('bossCard') ? { hidden: $('bossCard').hidden, show: $('bossCard').classList.contains('show'), name: $('bossCardName') ? $('bossCardName').textContent : null } : null
    };
  },
  codexInfo: function () { return JSON.parse(JSON.stringify(save.codex || { mon: {}, boss: {}, evo: {}, pat: {} })); },
  /* v0.33 메타 훅 */
  metaInfo: function () {
    return {
      version: save.version, coins: save.coins,
      sword: { equipped: save.swords.equipped, owned: Object.keys(save.swords.owned || {}), fx: swordFx(save), name: swordOf(save).name },
      relics: { equipped: equippedRelics(save).slice(), owned: Object.keys(save.relics.owned || {}), slots: relicSlots(save) },
      skins: { equipped: save.skins.equipped, owned: Object.keys(save.skins.owned || {}) },
      brush: { equipped: save.brush.equipped, owned: Object.keys(save.brush.owned || {}) },
      codex: codexCounts(save), codexBonus: codexBonus(save),
      train: { seen: (save.train && save.train.seen) || 0, stats: JSON.parse(JSON.stringify((save.train && save.train.stats) || {})) },
      relicFlags: { mirror: relicOn(save, 'mirror'), jar: relicOn(save, 'jar'), blood: relicOn(save, 'blood'), tower: relicOn(save, 'tower'), needle: relicOn(save, 'needle'), eye: relicOn(save, 'eye'), totem: relicOn(save, 'totem'), brush: relicOn(save, 'brush'), lantern: relicOn(save, 'lantern'), oldbell: relicOn(save, 'oldbell'), sheath: relicOn(save, 'sheath'), beads: relicOn(save, 'beads') },
      maxHp: S ? maxHp() : null, coinMult: coinMult(), dashDmg: S ? +dashDmg().toFixed(3) : null, ringR: S ? +ringR().toFixed(3) : null
    };
  },
  giveCoins: function (n) { save.coins += n | 0; persist(); renderHud(); return save.coins; },
  buySword: function (id) { return buySword(id); },
  equipSword: function (id) { return equipSword(id); },
  buyRelic: function (id) { return buyRelic(id); },
  equipRelic: function (id) { return toggleRelic(id); },
  buySkin: function (kind, id) { return buySkin(id, kind); },
  equipSkin: function (kind, id) { return equipSkin(id, kind); },
  unlockBlueprint: function (stageNo) { save.stars = save.stars || {}; save.stars[stageNo] = Math.max(save.stars[stageNo] || 0, 1); persist(); return save.stars; },
  codexRecord: function (kind, id) {
    if (kind === 'mon') codexMon(id);
    else if (kind === 'evo') codexEvo(id);
    else if (kind === 'boss') codexBoss(stageOf(id | 0));
    else if (kind === 'pat') notePatSeen(id, 'qa');
    return this.codexInfo();
  },
  trainInfo: function (shape) {
    if (!shape) return { shape: train.shape, stats: (save.train && save.train.stats) || {}, seen: (save.train && save.train.seen) || 0, need: train.need, result: train.result, overlay: $('ov-train') ? $('ov-train').classList.contains('show') : null };
    return trainStatsOf(shape);
  },
  trainStroke: function (pts, shape) {
    if (shape) train.shape = shape;
    train.pts = (pts || []).slice();
    trainFinish();
    return { result: train.result, stats: trainStatsOf(train.shape) };
  },
  shopInfo: function () { return { tab: shopTab, body: $('shopBody') ? $('shopBody').innerHTML.length : 0, statHidden: $('shopStatList') ? !!$('shopStatList').hidden : null }; },
  /* v0.34 QA 훅: 부목표 · 웨이브 · 정예 속성 · 도전 모드 · 풀/성능 */
  goalInfo: function () {
    const g = S && S.goal;
    if (!g) return null;
    return { id: g.id, label: g.label, t: +g.t.toFixed(2), ok: !!g.ok, fail: !!g.fail, hp: g.hp, hpMax: g.hpMax, n: g.n, need: g.need, win: g.win, at: g.at, shape: g.shape, ringMul: g.ringMul, pos: g.pos, ids: (g.ids || []).slice(), hud: $('goalLabel') ? $('goalLabel').textContent : '' };
  },
  goalSet: function (o) { if (S && S.goal) { Object.assign(S.goal, o); _goalHudCache = ''; renderGoalHud(); } return this.goalInfo(); },
  waveInfo: function () { return { form: S && S.waveForm, fired: S ? (S.wavesFired || []).slice() : [], ids: S ? (S.waveIds || []).length : 0, forms: ['circle', 'pincer', 'rows'] }; },
  eliteInfo: function () {
    return (S ? S.zombies.filter(function (z) { return z.alive && (z.elite || z.goalTarget); }) : []).map(function (z) {
      return { id: z.id, type: z.type, attr: z.eliteAttr || null, hp: +(+z.hp).toFixed(1), seqI: z.seqI, invuln: +(z.invuln || 0).toFixed(2), goal: !!z.goalTarget };
    });
  },
  challengeInfo: function () {
    const c = S && S.challenge;
    return {
      active: c || null, name: c ? (challengeOf(c) || {}).name : null,
      unlocks: CHALLENGES.map(function (x) { return { id: x.id, unlock: x.unlock, open: challengeUnlocked(x.id), record: challengeRecord(x.id) }; }),
      bossIdx: S ? (S.bossIdx || 0) : 0, endlessBossN: S ? (S.endlessBossN || 0) : 0, endlessKills: S ? (S.endlessKills || 0) : 0,
      pool: S ? (S.pool || []).slice() : [], timeLeft: S ? +(S.timeLeft || 0).toFixed(1) : null, records: Object.assign({}, save.records || {})
    };
  },
  startChallenge: function (id) { return startChallenge(id); },
  setStars: function (stageNo, n) { save.stars = save.stars || {}; save.stars[stageNo] = n | 0; persist(); return save.stars; },
  poolInfo: function () {
    const c = three && three.chunks;
    return { shots: (S && S.shots || []).length, shotPool: shotPool.length, hazards: (S && S.hazards || []).length, hazardPool: hazardPool.length, pillars: (S && S.zombies || []).filter(function (z) { return z.isPillar; }).length, totemPool: totemPool.length, drawCalls: three && three.renderer && three.renderer.info ? three.renderer.info.render.calls : null, chunks: c ? Object.assign({}, c.stats) : null };
  },
  trainOpen: function () { openTrain(); return this.trainInfo(); },
  trainClose: function () { closeTrain(); return true; },
  codexOpen: function () { renderCodex(); showOv('ov-codex'); refreshTitleHelp(); return this.codexInfo(); },
  shopTab: function (t) { shopTab = t || 'stat'; refreshShop(); showOv('ov-shop'); return this.shopInfo(); },
  /* v0.33 상세 프로브 */
  saveInfo: function () {
    let raw = null, bak = null;
    try { raw = localStorage.getItem(SAVE_KEY); bak = localStorage.getItem(SAVE_KEY + '.bak'); } catch (e) {}
    return { version: save.version, rawLen: raw ? raw.length : 0, bakLen: bak ? bak.length : 0, keys: Object.keys(save).sort() };
  },
  setSaveRaw: function (raw) { try { localStorage.setItem(SAVE_KEY, raw); } catch (e) {} return true; },
  reloadSave: function () { loadSave(); return this.saveInfo(); },
  relicProbe: function () {
    return { kiaiWin: bossPat().kiai ? +kiaiWin(bossPat().kiai).toFixed(2) : null, summonKeep: (((CFG.bossPat || {}).summon || {}).keep || 3) + (relicOn(save, 'totem') ? 1 : 0),
      bellVol: relicOn(save, 'oldbell') ? 1.5 : 1, perfectThresh: (CFG.perfectThresh || 0.8) - (relicOn(save, 'brush') ? 0.05 : 0),
      jarDouble: relicOn(save, 'jar'), eyeBell: relicOn(save, 'eye') ? 0.7 : 1, mirrorUsed: !!(S && S.mirrorUsed), beadsSlots: relicSlots(save) };
  },
  hurtProbe: function (n) { const h0 = S ? S.hp : 0; heroHurt(n || 1, 'QA'); return { hp0: h0, hp1: S ? S.hp : 0, lost: +(h0 - (S ? S.hp : 0)).toFixed(2), hits: S ? S.hits : 0 }; },
  breakJarProbe: function () { if (!three || !three.chunks) return null; const j = three.chunks.jars.filter(function (x) { return x.alive; })[0]; if (!j) return null; const n0 = (S.items || []).length; breakJar(j); return { items: (S.items || []).length - n0 }; },
  trainReset: function () { save.train = { stats: {}, seen: 0 }; persist(); return this.trainInfo(); },
  /* v0.32 QA: 지정한 지점으로 실제 일섬을 한 번 낸다(지형 훅·착지 훅을 게임과 같은 순서로 부른다). */
  qaDashTo: function (x, z) {
    if (!S || !S.playing) return null;
    const from = { x: S.hero.x, z: S.hero.z };
    S.lastDash = { type: 'hline', targets: [], hits: [], items: [], t0: now(), segs: [], elem: curElem(), cinematic: false, quality: 0 };
    const adj = onDashPath(from, { x: x, z: z });
    const rl = Math.hypot(x - from.x, z - from.z) || 1;
    const tl = Math.hypot(adj.to.x - from.x, adj.to.z - from.z);
    const u = clamp(tl / rl, 0, 1);
    const raw = { x: from.x + (x - from.x) * u, z: from.z + (z - from.z) * u };
    S.lastDash.segs.push({ from: from, to: raw, r: pathR() });
    S.lastDash.dmgMul = adj.dmgMul || 1;
    const d = { from: from, to: { x: raw.x, z: raw.z }, raw: raw, t: 0, dur: (CFG.dashDur || 0.16) + (adj.dur || 0), target: null, slash: null, judged: false, dmgMul: adj.dmgMul || 1 };
    S.hero.x = raw.x; S.hero.z = raw.z;
    if (three && three.heroSpr) placeGroup(three.heroSpr, raw.x, raw.z);
    resolveDash(d);
    landDash(d);
    S.dash = null;
    return { dur: d.dur, dmgMul: d.dmgMul, req: { x: x, z: z }, to: { x: +raw.x.toFixed(3), z: +raw.z.toFixed(3) }, len: +Math.hypot(raw.x - from.x, raw.z - from.z).toFixed(3), adj: { lenMul: adj.lenMul || 1, water: !!adj.water }, terrain: this.terrainInfo(), bounce: S.bounce ? { to: { x: +S.bounce.to.x.toFixed(3), z: +S.bounce.to.z.toFixed(3) }, dur: S.bounce.dur } : null };
  },
  /* 뿌리 묶임처럼 일섬 자체가 막히는지 확인용 */
  tryBeginDash: function (shape) {
    if (!S) return null;
    const r = beginDash(shape || 'hline', {});
    return { began: !!(r && r.targets && r.targets.length), bound: !!(r && r.bound), inputBuf: S.inputBuf ? S.inputBuf.type : null, rootT: +((S.terrain && S.terrain.rootT) || 0).toFixed(2) };
  },
  clashStroke: function (type) { return clashStroke(type); },
  killBoss: function () { if (S && S.boss && S.boss.alive) killZombie(S.boss, S.lastDash); return this.codexInfo(); },
  killById: function (id) { const z = (S.zombies || []).filter(function (q) { return q.id === (id | 0) && q.alive; })[0]; if (z) killZombie(z, S.lastDash); return !!z; },
  bossPhase: function (seqI) {
    const b = S && S.boss;
    if (!b) return null;
    b.seqI = seqI | 0;
    bossPhaseCheck(b);
    return this.bossInfoPlus();
  },
  terrainMuls: function () { return { speed: terrainSpeedMul(), coin: terrainCoinMul(), slowAt: S ? terrainSlowMul(S.hero) : 1, blocked: terrainDashingBlocked(), ringMul: S && S.terrain ? +(S.terrain.ringMul || 1).toFixed(4) : 1, ring: S ? +ringR().toFixed(3) : null }; },
  setCounter: function (k, n) {
    if (!S) return null;
    if (k === 'hits') S.hits = n | 0;
    else if (k === 'goldReflect') S.goldReflectN = n | 0;
    else if (k === 'clashWin') S.clashWin = n | 0;
    else if (k === 'shuffleLock') S.shuffleLock = n | 0;
    else if (S.terrain) { S.terrain.counts = S.terrain.counts || {}; S.terrain.counts[k] = n | 0; }
    return this.starProbe();
  },
  patCode: function () { return PAT_CODE.map(function (p) { return Object.assign({}, p); }); },
  /* v0.48 고정 아레나 검수: 무대 정보·영웅 위치·카메라·기물 통계 */
  arenaWorldInfo: function () {
    const c = three && three.chunks;
    if (!c) return null;
    const a = c.arena;
    return {
      fixed: !!c.stats.fixed, stageId: c.stageId,
      bounds: c.bounds ? { x: c.bounds.x, z: c.bounds.z, r: c.bounds.r } : null,
      stats: Object.assign({}, c.stats),
      props: a ? a.stats : null,
      spots: a ? a.spots.slice(0, 40) : [],
      screen: c.screenInfo ? c.screenInfo() : null,
      jars: c.jars.filter(function (j) { return j.alive; }).length,
      drawCalls: three.renderer && three.renderer.info ? three.renderer.info.render.calls : null,
      tris: three.renderer && three.renderer.info ? three.renderer.info.render.triangles : null
    };
  },
  qaCam: function (o) {
    if (!three) return null;
    QA_CAM = o ? { x: +(o.x || 0), y: +(o.y == null ? 8 : o.y), z: +(o.z || 0), tx: +(o.tx || 0), ty: +(o.ty == null ? 1 : o.ty), tz: +(o.tz || 0) } : null;
    return QA_CAM;
  },
  arenaDebug: function () {
    const c = three && three.chunks;
    if (!c || !c.arena || !c.arena.body) return null;
    const m = c.arena.body.material;
    const geo = c.arena.body.geometry;
    const col = geo.getAttribute('color');
    const z = geo.getAttribute('zone');
    const u = m.uniforms || {};
    return {
      hasColor: !!col, hasZone: !!z, verts: geo.getAttribute('position').count,
      col0: col ? [col.getX(0), col.getY(0), col.getZ(0)] : null,
      col100: col ? [col.getX(100), col.getY(100), col.getZ(100)] : null,
      zone100: z ? z.getX(100) : null,
      uAmb: u.uAmbCol ? u.uAmbCol.value.toArray() : null,
      uKey: u.uKeyCol ? u.uKeyCol.value.toArray() : null,
      uTexAmt: u.uTexAmt ? u.uTexAmt.value : null,
      uRamp: !!u.uRamp,
      prog: m.program ? 1 : 0
    };
  },
  heroArenaInfo: function () {
    if (!S || !S.hero) return null;
    const c = three && three.chunks;
    const b = c && c.bounds;
    return {
      hero: { x: +S.hero.x.toFixed(2), z: +S.hero.z.toFixed(2) },
      r: b ? +Math.hypot(S.hero.x - b.x, S.hero.z - b.z).toFixed(2) : null,
      bound: b ? b.r : null,
      cam: three && three.camera ? [+three.camera.position.x.toFixed(2), +three.camera.position.y.toFixed(2), +three.camera.position.z.toFixed(2)] : null,
      focus: S.focus ? { x: +S.focus.x.toFixed(2), z: +S.focus.z.toFixed(2) } : null,
      zombies: S.zombies ? S.zombies.filter(function (z) { return z.alive; }).map(function (z) { return +Math.hypot(z.x - (b ? b.x : 0), z.z - (b ? b.z : 0)).toFixed(1); }).sort(function (p, q) { return q - p; }).slice(0, 3) : null
    };
  },
  cameraPos: function () {
    const c = three && three.camera;
    return c ? { x: +c.position.x.toFixed(2), y: +c.position.y.toFixed(2), z: +c.position.z.toFixed(2), fov: c.fov } : null;
  },
  /* v0.22 QA 훅: 청크·항아리·결계·진화 */
  chunkInfo: function () {
    const c = three && three.chunks;
    if (!c) return null;
    return {
      stageId: c.stageId, center: { cx: c.center.cx, cz: c.center.cz }, stats: Object.assign({}, c.stats),
      jars: c.jars.map(function (j) { return { id: j.id, x: j.x, z: j.z, alive: j.alive, cx: j.cx, cz: j.cz }; }),
      heroChunk: S ? { cx: chunkOf(S.hero.x), cz: chunkOf(S.hero.z) } : null
    };
  },
  /* 시드 고정 확인: 같은 좌표를 다시 지으면 같은 소품 수·같은 항아리 자리가 나와야 한다. */
  chunkSeedInfo: function (cx, cz, stageId) {
    const d = buildChunkData(cx | 0, cz | 0, stageId || (three && three.chunks && three.chunks.stageId) || 1);
    let n = 0;
    Object.keys(d.buckets).forEach(function (k) { n += d.buckets[k].length; });
    return { seed: d.seed, props: n, jars: d.jars.map(function (j) { return [Math.round(j.x * 100) / 100, Math.round(j.z * 100) / 100]; }) };
  },
  jarInfo: function () {
    const c = three && three.chunks;
    if (!c) return null;
    return c.jars.map(function (j) { return { id: j.id, x: j.x, z: j.z, alive: j.alive }; });
  },
  breakJarAt: function (x, z, r) {
    const c = three && three.chunks;
    if (!c) return 0;
    const list = c.jarsNear(x, z, r == null ? 2.5 : r);
    list.forEach(breakJar);
    return list.length;
  },
  spawnJarDrop: function (kind) {
    if (!S) return null;
    return spawnItem({ type: kind || 'herb', x: S.hero.x + 1.2, z: S.hero.z });
  },
  arenaInfo: function () {
    const a = S && S.arena;
    return {
      active: !!a, x: a ? a.x : null, z: a ? a.z : null, r: a ? a.r : 0,
      heroDist: a && S ? Math.hypot(S.hero.x - a.x, S.hero.z - a.z) : null,
      hasMesh: !!(three && three.arena), bossAlive: !!(S && S.boss && S.boss.alive)
    };
  },
  firecracker: function () { return firecrackerBurst(); },
  absorbAll: function () { return absorbAllItems(null); },
  eliteEvent: function () { return spawnEliteEvent(); },
  /* 진화 효과 확인용: 착지 충격을 그 자리에서 일으킨다(실제 landingShock 경로). */
  landingProbe: function (x, z) {
    if (!S) return null;
    const at = { x: x == null ? S.hero.x : x, z: z == null ? S.hero.z : z };
    landingShock(at);
    return S.zombies.filter(function (zz) { return zz.alive; }).map(function (zz) {
      return { id: zz.id, hp: zz.hp, frozen: zz.frozen > 0, burn: zz.burn > 0, poison: zz.poison || 0 };
    });
  },
  /* 만독 쇄도 확인용: 독이 오른 적을 쓰러뜨린다. */
  poisonKillProbe: function (x, z) {
    if (!S) return null;
    const p = { x: x == null ? S.hero.x + 3 : x, z: z == null ? S.hero.z : z };
    const z1 = spawnZombie({ x: p.x, z: p.z, hp: 4 });
    z1.poison = 3; z1.poisonT = 4;
    const before = S.charge || 0;
    hurtZombie(z1, 99, 'probe', S.lastDash);
    return { chargeBefore: before, chargeAfter: S.charge || 0, alive: z1.alive, evo: Object.keys(S.evo || {}) };
  },
  upInfo: function () {
    return S ? {
      upLv: Object.assign({}, S.upLv || {}), evo: Object.keys(S.evo || {}), evolved: (S.evolved || []).slice(),
      dashElem: S.dashElem, elemLv: Object.assign({}, S.elemLv || {}), tempElem: S.tempElem ? { el: S.tempElem.el, t: S.tempElem.t } : null,
      dashCount: S.dashCount, pathR: S.pathR, chargeLv: S.chargeLv || 0, spiritCap: S.spiritCap, ringLv: S.ringLv || 0,
      perfectMul: (CFG.perfectDmgMul || 1.5) + (CFG.perfectStep || 0.15) * Math.max(0, upLv('perfect') - 1),
      perfectOn: upLv('perfect') > 0
    } : null;
  },
  setQuality: function (q) { if (S) S.dashQuality = q; return S && S.dashQuality; },
  itemIconUrl: function (kind) {
    const keyMap = { bell: 'one-bell', charm: 'charm', ice: 'elem-ice', fire: 'elem-fire', poison: 'elem-poison', xp: 'xp-orb', dashplus: 'dash-plus' };
    return (art && art.itemIconUrl) ? art.itemIconUrl(keyMap[kind] || kind) : null;
  },
  elemProbe: function (el, lv) {
    const saved = Object.assign({}, S && S.elemLv || {});
    if (S) { S.elemLv = saved; if (lv != null) S.elemLv[el] = lv; else delete S.elemLv[el]; }
    const out = { el: el, lv: S && S.elemLv ? (S.elemLv[el] || 0) : 0, iceDur: elemIceDur(), shatter: elemShatterDmg(), burnDur: elemBurnDur(), burnDmg: elemBurnDmg(), poisonMax: elemPoisonMax(), poisonDmg: elemPoisonDmg(), cloudR: elemCloudR() };
    if (S) S.elemLv = saved;
    return out;
  },
  applyElemProbe: function (el) {
    if (!S) return null;
    const z = spawnZombie({ x: S.hero.x + 2.4, z: S.hero.z, hp: 999 });
    applyElement(z, el, null);
    const out = { id: z.id, frozen: +(z.frozen || 0).toFixed(2), burn: +(z.burn || 0).toFixed(2), poison: z.poison || 0 };
    z.alive = false;
    if (z.obj && three) three.scene.remove(z.obj);
    return out;
  },
  enemyTypes: function () { return Object.keys(CFG.zombieTypes); },
  spawnSpecial: function (type, x, z, hp) { return spawnZombie({ type: type, x: x, z: z, hp: hp }); },
  shotsInfo: function () { return (S && S.shots || []).map(function (sh) { return { x: sh.x, z: sh.z, t: sh.t }; }); },
  hazardInfo: function () { return (S && S.hazards || []).map(function (h) { return { x: h.x, z: h.z, r: h.r, t: h.t, done: !!h.done }; }); },
  spawnHazard: function (x, z, r, delay) { return spawnHazard(x, z, r, delay); },
  stages: function () { return STAGES.map(function (st) { return { id: st.id, act: st.act, name: st.name, map: st.map, time: st.time, bossShapes: st.bossShapes, shapes: (st.shapes || []).slice(), spiritCap: st.spiritCap, hazard: (st.boss && st.boss.hazard) || 0 }; }); },
  beginStage: beginStage,
  goStageNow: goStageNow,
  /* v0.30 QA 훅: 난이도·동적 보정·첫 경험·접근성·보스 시간 예산 */
  modeInfo: function () {
    return {
      saveMode: save.mode, runMode: S ? S.mode : null, gosu: gosuUnlocked(), note: MODE_NOTE[save.mode],
      modes: MODE_ORDER.map(function (id) { return { id: id, name: MODES[id].name, tele: MODES[id].tele, dmg: MODES[id].dmg, spd: MODES[id].spd, bossShapes: MODES[id].bossShapes, starCap: MODES[id].starCap, coin: MODES[id].coin, locked: id === 'gosu' && !gosuUnlocked() }; }),
      html: $('titleModes') ? $('titleModes').innerHTML : '',
      noteShown: $('titleModeNote') ? $('titleModeNote').textContent : ''
    };
  },
  setMode: function (id) { return setMode(id); },
  a11yInfo: function () { return { colorblind: a11yCb(), shake: a11yShake(), save: Object.assign({}, save.a11y), cbLabel: $('btnCb') ? $('btnCb').textContent : null, shakeLabel: $('btnShake') ? $('btnShake').textContent : null }; },
  setA11y: function (k, v) { return setA11y(k, v); },
  tutorialInfo: function () {
    const T = S && S.tutorial;
    return {
      on: !!(T && T.on), t: T ? +T.t.toFixed(2) : 0, first: !!(T && T.first), tapSpawned: !!(T && T.tapSpawned), tapDone: !!(T && T.tapDone),
      slow: S ? +(S.tutSlow || 1).toFixed(2) : 1, done: !!save.tutorialDone,
      skipHidden: $('btnSkip') ? !!$('btnSkip').hidden : null, guide: ($('guide') && $('guide').classList.contains('show')) ? $('guide').textContent : ''
    };
  },
  skipTutorial: function () { return endTutorial('skip'); },
  advanceTutorial: function (sec) {
    if (S && S.tutorial) { S.tutorial.t += sec; tickTutorial(); }
    return S && S.tutorial ? +S.tutorial.t.toFixed(2) : null;
  },
  endRunProbe: function (win, msg) { if (!S) return null; endRun(!!win, msg || (win ? '귀물을 베었습니다.' : '귀물에게 닿았습니다.')); return this.resultUi(); },
  moments: function () { return Object.assign({}, save.moments || {}); },
  resetMoments: function () { save.moments = {}; save.tutorialDone = 0; persist(); return save.moments; },
  momentState: function () {
    return {
      newShape: S && S.newShape ? { shape: S.newShape.shape, guide: +(S.newShape.guide || 0).toFixed(2), need: S.newShape.need } : null,
      chargeGuide: S ? +(S.chargeGuide || 0).toFixed(2) : 0, totemGuide: S ? +(S.totemGuide || 0).toFixed(2) : 0,
      bounceArrow: S ? +(S.bounceArrow || 0).toFixed(2) : 0, slowMul: S ? +(S.slowMul || 1).toFixed(2) : 1, slowMulT: S ? +(S.slowMulT || 0).toFixed(2) : 0,
      firstPatIcon: (S && S.firstPatIcon) ? S.firstPatIcon.id : null, bossTeleMul: (S && S.boss) ? +(S.boss.teleMul || 1).toFixed(2) : null
    };
  },
  streak: function () { return { save: save.streak ? Object.assign({}, save.streak) : null, run: S ? S.streak : 0, help: S ? (S.help || []).slice() : [], after: S ? S.streakAfter : null }; },
  setStreak: function (stageNo, n) { save.streak = n ? { stage: stageNo | 0, n: n | 0 } : null; persist(); return save.streak; },
  teleInfo: function () { return { run: S ? +((S.teleMul || 1)).toFixed(2) : 1, mode: curMode().tele, boss: (S && S.boss) ? +(S.boss.teleMul || 1).toFixed(2) : null }; },
  economy: function () {
    return { mode: curMode().id, coinMul: modeCoin(), coinMult: coinMult(), kill: Math.round(CFG.coinPerKill * modeCoin() * coinMult()),
      spd: modeSpd(), spdApplied: CFG.zombieSpeed * modeSpd(), dmgMul: curMode().dmg, dmg2: modeDmg(2), starCap: starCap(), bossShapes: curMode().bossShapes };
  },
  budget: function (n, mode) { return bossBudget(n, mode); },
  budgetTable: function () { return budgetTable(); },
  bossAt: function () { return { bossAt: (S && S.stage) ? S.stage.bossAt : null, seenAt: S ? +(S.bossSeenAt || 0).toFixed(1) : null, elapsed: S ? +(S.elapsed || 0).toFixed(1) : null, left: S ? +(S.timeLeft || 0).toFixed(1) : null }; },
  /* 실측: 걷기·경직·패턴별 지속 시간을 실제 상태기계로(렌더 없이) 잰다. */
  cycleProbe: function (dt) {
    if (!S || !S.boss || !S.boss.alive) return null;
    const b = S.boss, d = dt || (1 / 30);
    const keep = { hp: S.hp, noMove: qa.noMove, nf: qa.noFirstMoments, tm: b.teleMul, tb: b.teleBoost };
    S.hp = 9999; qa.noMove = true; qa.noFirstMoments = true;
    const tick = function (n) { let i = 0; while (i++ < n) { S.hitstop = 0; S.iframe = 9; if (!S.playing) break; if (!S.paused) step(d); } };
    const out = { walk: 0, stun: 0, patterns: {}, seqN: (b.seq || []).length };
    b.state = 'walk'; b.stateT = 0; b.firstWalk = false; b.stun = 0;
    let g = 0, wt = S.elapsed;
    while (g++ < 400 && b.state === 'walk' && S.playing) tick(1);
    out.walk = +(S.elapsed - wt).toFixed(2);
    b.state = 'stun'; b.stateT = 0; b.stunT = 0;
    g = 0;
    const stT = S.elapsed;
    while (g++ < 200 && b.state === 'stun' && S.playing) tick(1);
    out.stun = +(S.elapsed - stT).toFixed(2);
    const list = bossPatList(b) || [];
    list.forEach(function (id) {
      if (!S.playing || !b.alive) { out.patterns[id] = null; return; }
      b.state = 'walk'; b.stateT = 999; b.stun = 0; b.teleBoost = 1; b.teleMul = teleMul();
      startBossPattern(b, id);
      const st0 = b.state, t0 = S.elapsed;
      let k = 0;
      while (k++ < 900 && b.state === st0 && S.playing) tick(1);
      out.patterns[id] = (b.state === st0) ? -1 : +(S.elapsed - t0).toFixed(2);
    });
    S.hp = keep.hp; qa.noMove = keep.noMove; qa.noFirstMoments = keep.nf;
    b.teleMul = keep.tm; b.teleBoost = keep.tb;
    return out;
  },
  resultUi: function () {
    const g = $('resultHelp'), o = $('btnTrainOffer'), s = $('resultStars'), k = $('resultKicker'), n = $('resultNext');
    return { kicker: k ? k.textContent : '', help: g ? g.textContent : '', helpHidden: g ? !!g.hidden : null,
      offerHidden: o ? !!o.hidden : null, offerText: o ? o.textContent : '', stars: s ? s.innerHTML : '', note: n ? n.textContent : '', gold: !!(S && S.goldStar) };
  },
  startReplay: function () { startRun({ stage: 1, replay: true }); return true; },
  skipBtnVisible: function () { const b = $('btnSkip'); return b ? !b.hidden : null; },
  selectStage: function (n) { titleSel = clamp(n | 0, 1, STAGES.length); refreshTitleHelp(); previewStageWorld(titleSel); return titleSel; },
  stageSelectHtml: function () { return $('titleStages') ? $('titleStages').innerHTML : ''; },
  resultInfo: function () {
    return S ? { won: !!S.won, lost: !!S.lost, stars: S.stars || 0, kills: S.kills || 0, comboMax: S.comboMax || 0, coinGain: S.coinGain || 0, score: S.score || 0, nextStage: S.nextStage || null, stageNo: S.stageNo || 0 } : null;
  },
  pickSpirits: function (shape, n, from, dir) { return pickSpirits(shape, n, from, dir); },
  /* v0.40 QA: 파츠 리그 상태 덤프(부위별 위치·회전·스케일) — 이음매 진단용. */
  rigDump: function (i) {
    if (!three || !S || !S.zombies) return null;
    const z = S.zombies[i || 0];
    if (!z || !z.obj) return null;
    const rig = z.obj.userData.rig;
    if (!rig) return { name: z.shape || z.type, rig: false };
    const out = { fig: rig.name, speed: +rig.speed.toFixed(2), phase: +rig.phase.toFixed(2), parts: {} };
    Object.keys(rig.parts).forEach(function (k) {
      const m = rig.parts[k];
      if (!m) return;
      out.parts[k] = { p: [+m.position.x.toFixed(2), +m.position.y.toFixed(2)], rz: +m.rotation.z.toFixed(3), s: [+m.scale.x.toFixed(2), +m.scale.y.toFixed(2)], piv: m.userData.pivot };
    });
    out.anim = { hero: three.heroSpr && three.heroSpr.userData.rig ? { fig: three.heroSpr.userData.rig.name } : null };
    return out;
  },
  audioInfo: function () { return audio ? audio.info() : null; },
  /* v0.40 QA: 종이 소리 3종을 직접 때려 버스 보이스가 잡히는지 확인한다. */
  paperProbe: function () {
    if (!audio) return null;
    const r = {};
    if (audio.paperFold) { audio.paperFold(0.8); r.fold = true; }
    if (audio.paperTear) { audio.paperTear(0.9); r.tear = true; }
    if (audio.paperCrush) { audio.paperCrush(1.0); r.crush = true; }
    r.bus = audio.info().bus;
    return r;
  },
  /* v0.39 QA: 같은 순간에 소리 N개를 몰아쳐 보이스 상한·레이트리밋·덕킹을 확인한다. */
  audioHammer: function (n) {
    if (!audio) return null;
    const k = Math.max(1, Math.min(200, n || 40));
    for (let i = 0; i < k; i++) { audio.slash(0.5); audio.hit(i % 3 === 0); }
    return audio.info().bus;
  },
  paperPreview: function (k) { try { return paperPropCanvas(k, 31).toDataURL('image/png'); } catch (e) { return null; } },
  diorama: function () {
    const info = dioramaInfo();
    const w = three && three.chunks;
    info.screen = !!(w && w.stats && w.screenInfo ? w.screenInfo() : null);
    return info;
  },
  triggerSightWave: triggerSightWave,
  /* v0.39 QA: 장면 경계·카메라·영웅 좌표(보스 결계처럼 무대가 바뀌는 순간의 진단). */
  sceneInfo: function () {
    if (!three || !three.scene) return null;
    const b = new THREE.Box3().setFromObject(three.scene);
    return {
      min: [b.min.x, b.min.y, b.min.z].map(function (v) { return +v.toFixed(2); }),
      max: [b.max.x, b.max.y, b.max.z].map(function (v) { return +v.toFixed(2); }),
      cam: three.camera.position.toArray().map(function (v) { return +v.toFixed(2); }),
      fov: three.camera.fov,
      hero: S && S.hero ? [+S.hero.x.toFixed(2), +S.hero.z.toFixed(2)] : null,
      heroObj: three.heroSpr ? three.heroSpr.position.toArray().map(function (v) { return +v.toFixed(2); }) : null,
      groupPos: three.chunks && three.chunks.group ? three.chunks.group.position.toArray().map(function (v) { return +v.toFixed(2); }) : null,
      boss: (function () {
        const b = S && S.boss && S.boss.obj;
        if (!b) return null;
        const v = new THREE.Vector3();
        b.getWorldPosition(v);
        return { local: b.position.toArray().map(function (q) { return +q.toFixed(2); }), world: v.toArray().map(function (q) { return +q.toFixed(2); }) };
      })(),
      fade: { hero: WF.uWfHero.value.toArray(), range: WF.uWfRange.value.toArray() }
    };
  },
  /* v0.39 QA: 장면 안에서 아직 카드스탁 패치를 안 받은 재질을 찾는다(안개 구멍·톤 이질감 진단). */
  cardAudit: function () {
    const out = { total: 0, patched: 0, skip: {}, list: [] };
    if (!three || !three.scene) return out;
    three.scene.traverse(function (o) {
      const m = o.material;
      if (!m) return;
      const arr = Array.isArray(m) ? m : [m];
      arr.forEach(function (mat) {
        if (!mat) return;
        out.total++;
        if (mat.userData && mat.userData.cardKind) { out.patched++; return; }
        const k = (mat.type || '?') + (mat.isShaderMaterial ? ':shader' : '');
        out.skip[k] = (out.skip[k] || 0) + 1;
        if (out.list.length < 24) out.list.push({ type: mat.type, col: mat.color ? '#' + mat.color.getHexString() : '', map: !!mat.map, inst: !!o.isInstancedMesh, visible: o.visible });
      });
    });
    return out;
  },
  /* v0.39 QA: 층별 안개 끄기(0=끔, 1=켬). 반환값은 현재 안개 상태와 카드스탁 통계. */
  fadeDebug: function (o) {
    if (o) {
      if (o.mat != null) qaFadeMat = o.mat ? 1 : 0;
      if (o.post != null) qaFadePostK = o.post;
      if (o.amt != null) WF.uWfAmt.value.x = o.amt;
      if (o.far != null) WF.uWfAmt.value.y = o.far;
      if (o.green != null) qaFadeColor = !!o.green;
      if (o.dbg != null) WF.uWfDbg.value = o.dbg ? 1 : 0;
    }
    return {
      mat: qaFadeMat, post: qaFadePostK, postAmt: WF_POST.post,
      range: WF.uWfRange.value.toArray(), amt: WF.uWfAmt.value.toArray(),
      color: [WF.uWfColor.value.r, WF.uWfColor.value.g, WF.uWfColor.value.b],
      cards: cardStats(), postPass: !!(three && three.bloom && three.bloom.post && three.bloom.post[0] && three.bloom.post[0].setFadeSource),
      postU: (function () {
        const p = three && three.bloom && three.bloom.post && three.bloom.post[0];
        if (!p || !p.uniforms) return null;
        const u = p.uniforms;
        return { uWfPost: u.uWfPost && u.uWfPost.value, hasDepth: u.uHasDepth && u.uHasDepth.value, heroScreen: u.uHeroScreen && u.uHeroScreen.value.toArray(), amt: u.uWfAmt && u.uWfAmt.value.toArray(), range: u.uWfRange && u.uWfRange.value.toArray() };
      })()
    };
  },
  drawSightFog: drawSightFog,

  fxInfo: function () {
    const idle = art && art.atlas && art.atlas.heroAnim && art.atlas.heroAnim.actions && art.atlas.heroAnim.actions.idle;
    const zWalk = art && art.atlas && art.atlas.zombieAnim && art.atlas.zombieAnim.actions && art.atlas.zombieAnim.actions.walk;
    const atmo = $('fxinkAtmo');
    const slash = three && three.slashes && three.slashes[0];
    const marks = $('marks');
    return {
      /* v0.39: 2D 안개 캔버스는 없다. 대신 월드 안개 uniform 을 그대로 내보낸다. */
      fog: { canvas: false, range: WF.uWfRange.value.toArray(), amt: WF.uWfAmt.value.toArray(), hero: WF.uWfHero.value.toArray(), cards: cardStats() },
      bloom: three && three.bloom && three.bloom.quality,
      hasBloom: !!(three && three.bloom),
      hasInk: !!(three && three.ink),
      slashes: three && three.slashes ? three.slashes.length : 0,
      slashShader: !!(slash && slash.material && slash.material.uniforms && slash.material.uniforms.uProgress),
      slashRotZ: slash && slash.mesh ? slash.mesh.rotation.z : null,
      stat: { slashes: fxinkStat.slashes, hits: fxinkStat.hits, kills: fxinkStat.kills },
      atmo: !!(atmo && atmo.children && atmo.children.length),
      atmoMap: atmo && atmo.dataset && atmo.dataset.map,
      atmoZ: atmo ? +getComputedStyle(atmo).zIndex : 0,
      marksZ: marks ? +getComputedStyle(marks).zIndex : 0,
      rimHero: idle && (idle.file1x || idle.file),
      rimZombie: zWalk && (zWalk.file1x || zWalk.file),
      torch: art && art.torchGlowUrl && art.torchGlowUrl(),
      aq: three && three.ql && three.ql.level,
      forced: !!(three && three.fxForced)
    };
  },
  setFxQuality: function (q) {
    if (!three || !three.bloom) return null;
    if (q !== 'high' && q !== 'low' && q !== 'off') return three.bloom.quality;
    three.fxForced = true;
    fxQ = q;
    three.bloom.setQuality(q);
    if (three.ink) three.ink.setQuality(q === 'high' ? 'high' : 'low');
    wireFadeSource();
    applyFxinkAtmo(S && S.mapId);
    return three.bloom.quality;
  },
  testAutoQuality: function () {
    const log = [];
    const aq = new AutoQuality({
      start: 'high', lowFps: 40, low1: 20, holdSec: 0.2, windowSec: 0.3,
      onChange: function (q) { log.push(q); }
    });
    for (let i = 0; i < 6; i++) aq.tick(0.05);
    const mid = aq.q;
    for (let i = 0; i < 12; i++) aq.tick(1 / 15);
    return { mid: mid, end: aq.q, log: log };
  },
  sonarGeom: function (wave) {
    const host = $('app') || $('sightFog');
    const r = host ? host.getBoundingClientRect() : { width: 375, height: 667 };
    const w = r.width, h = r.height;
    const hs = (S && S.hero) ? heroScreen() : { x: w * 0.5, y: h * 0.5 };
    return { cx: hs.x, cy: hs.y, r: Math.min(w, h) * (0.18 + 0.7 * (1 - (wave == null ? ((S && S.sightWave) || 0) : wave))), w: w, h: h, wave: wave == null ? ((S && S.sightWave) || 0) : wave };
  },
  heroVisible: function () {    const g = three && three.heroSpr;
    const spr = g && g.userData && g.userData.sprite;
    return {
      group: !!(g && g.visible !== false),
      visible: !!(spr && spr.visible !== false && g && g.visible !== false),
      opacity: spr && spr.material ? spr.material.opacity : 0,
      action: g && g.userData && g.userData.action,
      hasMap: !!(spr && spr.material && spr.material.map)
    };
  },
  /* v0.38 QA: 캐릭터 파츠 리그 상태 — 파츠 수·포즈·좌우 반전·빌보드 여부 */
  /* QA: 리그가 매 프레임(dt)로 얼마나 촘촘히 움직이는지 — 60스텝을 강제로 돌려 각도를 돌려준다. */
  rigTrace: function (n, dt, state) {
    const g = three && three.heroSpr;
    const r = g && g.userData && g.userData.rig;
    if (!r) return null;
    const out = [];
    const px = g.position.x;
    const N = n || 60, D = dt || (1 / 60), st = state || 'idle';
    for (let i = 0; i < N; i++) {
      g.position.x = px + i * 0.02;           /* 1.2 m/s 로 걷는 것과 같은 이동 */
      art.tickChar(g, 'hero', st, D, 1, 0);
      out.push({ a: +(r.dbg ? r.dbg.ang : 0).toFixed(4), y: +(r.dbg ? r.dbg.bob : 0).toFixed(4),
        ph: +r.phase.toFixed(3), sp: +r.speed.toFixed(2), face: r.face,
        arm: +r.arm.toFixed(3), armVis: !!(r.armMesh && r.armMesh.visible),
        sash: +r.sashA.toFixed(3),
        head: +(r.parts.head ? (r.dbg && r.dbg.headAng != null ? r.dbg.headAng : 0) : 0).toFixed(4) });
    }
    g.position.x = px;
    art.tickChar(g, 'hero', 'idle', 1 / 60, 1, 0);
    return out;
  },
  /* QA: 원혼 45마리 분량 tickChar 비용(ms) — 리그 자체의 CPU 비용 측정 */
  rigBench: function (n) {
    const t0 = performance.now();
    const list = (S && S.zombies ? S.zombies : []).filter(function (z) { return z.obj && z.obj.userData && z.obj.userData.rig; });
    if (!list.length) return null;
    const N = n || 30;
    for (let k = 0; k < N; k++) {
      for (let i = 0; i < list.length; i++) art.tickChar(list[i].obj, 'zombie', 'walk', 1 / 60, 1, 0);
    }
    const ms = performance.now() - t0;
    return { chars: list.length, ticks: N, ms: +ms.toFixed(2), perCharFrame: +(ms / N / list.length).toFixed(4),
      sceneSprites: (function () { let a = 0, b = 0; three.scene.traverse(function (o) { if (o.isSprite) a++; else if (o.isMesh) b++; }); return { sprites: a, meshes: b }; })() };
  },
  /* v0.42 QA: 포즈를 한 장에 고정한다 — i=-1 주인공, 0+ 원귀/보스. action=null 이면 해제. */
  posePin: function (i, action, frame) {
    const g = (i < 0) ? (three && three.heroSpr) : (S && S.zombies && S.zombies[i] && S.zombies[i].obj);
    if (!g || !art.debugPose) return null;
    art.debugPose(g, action, frame == null ? 0 : frame);
    return { ok: true, act: action, frame: frame };
  },
  /* v0.43.2 QA: 포즈 판(mesh) 네 모서리의 화면 좌표 — 빌보드가 카메라 평면에 바로 서 있는지 검사.
     좌·우 변의 x 차이(px)가 곧 기울기다(0 이면 정립, 크면 2시 방향으로 누운 것). */
  poseQuad: function (i) {
    const g = (i < 0) ? (three && three.heroSpr) : (S && S.zombies && S.zombies[i] && S.zombies[i].obj);
    const r = g && g.userData && g.userData.rig;
    const L = r && r.layers && r.layers[0];
    if (!L || !L.mesh || !three || !three.camera) return null;
    const m = L.mesh, geo = m.geometry;
    const px = geo.parameters ? geo.parameters.width / 2 : 0.5;
    const h = geo.parameters ? geo.parameters.height : 1;
    const v = new THREE.Vector3();
    const corners = [[-px, 0], [px, 0], [-px, h], [px, h]].map(function (c) {
      v.set(c[0], c[1], 0).applyMatrix4(m.matrixWorld).project(three.camera);
      return { x: +((v.x * 0.5 + 0.5) * 1000).toFixed(2), y: +((-v.y * 0.5 + 0.5) * 1000).toFixed(2) };
    });
    const leftSlant = corners[2].x - corners[0].x;
    const rightSlant = corners[3].x - corners[1].x;
    const topW = corners[3].x - corners[2].x, botW = corners[1].x - corners[0].x;
    return { face: r.face, groupScaleX: g.scale.x, meshScaleX: m.scale.x, corners: corners,
      leftSlant: +leftSlant.toFixed(2), rightSlant: +rightSlant.toFixed(2),
      topW: +topW.toFixed(2), botW: +botW.toFixed(2), uFx: m.material && m.material.userData.frameU ? m.material.userData.frameU.uFx.value : null };
  },
  poseActs: function (name) { return art.actsOf ? art.actsOf(name) : null; },
  /* v0.45 QA: 장면 객체 수·잔상(고스트) 수·GPU 자원 수 — 누수·정리 확인 */
  sceneStats: function () {
    if (!three || !three.scene) return null;
    let meshes = 0, ghosts = 0, hulls = 0;
    three.scene.traverse(function (o) {
      if (!o.isMesh) return;
      meshes++;
      if (o.userData && o.userData.rig && o.userData.rig.kind === 'ghost') ghosts++;
      if (o.userData && o.userData.hero3dHull) hulls++;
    });
    const inf = three.renderer.info;
    return { meshes: meshes, ghosts: ghosts, hulls: hulls, geometries: inf.memory.geometries, textures: inf.memory.textures, programs: inf.programs ? inf.programs.length : null, fx: (three.fx || []).length };
  },
  /* v0.45 QA: 장면 한 번 그리기의 드로우콜·삼각형(후처리 제외) — 주인공 기여분 차분용 */
  sceneCost: function () {
    if (!three || !three.renderer) return null;
    const r = three.renderer;
    const prevAuto = r.info.autoReset;
    r.info.autoReset = false;
    r.info.reset();
    try { r.render(three.scene, three.camera); } catch (e) {}
    const out = { calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs ? r.info.programs.length : null };
    r.info.autoReset = prevAuto;
    r.info.reset();
    return out;
  },
  /* v0.45 QA: 프레임 비용 계측 — 드로우콜·삼각형·프로그램, 주인공 보이기/숨기기 차분용 */
  renderInfo: function (heroOn) {
    if (!three || !three.renderer) return null;
    if (heroOn != null && three.heroSpr) three.heroSpr.visible = !!heroOn;
    const inf = three.renderer.info;
    return {
      calls: inf.render.calls, triangles: inf.render.triangles, programs: inf.programs ? inf.programs.length : null,
      textures: inf.memory.textures, geometries: inf.memory.geometries, heroOn: three.heroSpr ? three.heroSpr.visible : null,
      fps: fps.last ? +(1 / fps.last).toFixed(1) : null
    };
  },
  /* v0.45 QA: 주인공 3D 뼈대 — 상태·클립 가중치·방향 */
  hero3dInfo: function () {
    const g = three && three.heroSpr;
    if (!g || !art.hero3d) return null;
    const o = art.hero3d.info(g) || null;
    if (o) o.bounds = art.hero3d.bounds(g);
    return o;
  },
  /* v0.45 QA: 셰이더 uniform·정점색·렌더타깃 색공간 덤프(먹의 자리 진단) */
  hero3dDump: function () {
    const g = three && three.heroSpr;
    const H = g && g.userData && g.userData.hero3d;
    if (!H) return null;
    const u = H.uniforms[0];
    const mesh = H.meshes[0];
    const col = mesh && mesh.geometry.getAttribute('color');
    const uni = {};
    Object.keys(u).forEach(function (k) {
      const v = u[k].value;
      uni[k] = (v && v.toArray) ? v.toArray().map(function (n) { return typeof n === 'number' ? +n.toFixed(4) : n; }) : (v && v.isTexture ? 'tex' : v);
    });
    const rt = three && three.bloom && three.bloom.composer && three.bloom.composer.renderTarget1;
    return {
      uniforms: uni,
      color0: col ? [+col.getX(0).toFixed(4), +col.getY(0).toFixed(4), +col.getZ(0).toFixed(4)] : null,
      colorCount: col ? col.count : 0,
      rtColorSpace: rt ? rt.texture.colorSpace : 'none',
      outputColorSpace: three.renderer.outputColorSpace,
      toneMapping: three.renderer.toneMapping,
      lights: H.lights ? { amb: !!H.lights.amb, hemi: !!H.lights.hemi, dirs: H.lights.dirs.length } : null,
      moon: three.moon ? { i: +three.moon.intensity.toFixed(3), c: three.moon.color.toArray().map(function (n) { return +n.toFixed(3); }) } : null,
      amb: three.amb ? { i: +three.amb.intensity.toFixed(3), c: three.amb.color.toArray().map(function (n) { return +n.toFixed(3); }) } : null
    };
  },
  /* v0.45 QA: 클립을 특정 시각에 고정(스크린샷용). o={clip,t,yaw,freeze} */
  hero3dPin: function (o) {
    const g = three && three.heroSpr;
    if (!g || !art.hero3d) return null;
    return art.hero3d.pin(g, o || {});
  },
  /* v0.45 QA: n스텝 × dt 강제 진행(헤드리스 rAF 우회) — 궤적 기록 */
  hero3dStep: function (o) {
    const g = three && three.heroSpr;
    if (!g || !art.hero3d) return null;
    return art.hero3d.step(g, o || {});
  },
  /* v0.45 QA: 일섬·피격 동작을 직접 건다. */
  hero3dAct: function (name, k) {
    const g = three && three.heroSpr;
    if (!g || !art.hero3d) return null;
    if (name === 'slash') art.slashChar(g, k == null ? 1 : k);
    else if (name === 'hit') art.kickChar(g, k == null ? 1 : k);
    return art.hero3d.info(g);
  },
  /* v0.44 QA: 포즈 리그를 dt 간격으로 n스텝 강제 진행하며 동작·프레임 궤적을 기록한다.
     (헤드리스는 rAF 가 1fps 라 실시간 관측이 불가능하다 — 로직을 직접 돌려 12칸이 실제로 도는지 본다.) */
  poseTrace: function (o) {
    o = o || {};
    const i = o.i == null ? -1 : o.i;
    const g = (i < 0) ? (three && three.heroSpr) : (S && S.zombies && S.zombies[i] && S.zombies[i].obj);
    const r = g && g.userData && g.userData.rig;
    if (!r) return null;
    const kind = r.name === 'hero' ? 'hero' : (r.name === 'boss' ? 'boss' : 'zombie');
    const n = o.n || 60, dt = o.dt || (1 / 60), st = o.state || 'idle';
    const vx = o.vx == null ? 1 : o.vx, vz = o.vz == null ? 0 : o.vz;
    const walk = o.walk == null ? 0 : o.walk;   /* 스텝당 전진(m) — 걷기 위상 구동 */
    const px0 = g.position.x, pz0 = g.position.z;
    const out = [];
    for (let k = 0; k < n; k++) {
      if (walk) { g.position.x = px0 + walk * (k + 1); }
      art.tickChar(g, kind, st, dt, vx, vz);
      const L = r.layers && r.layers[0];
      out.push({ t: +((k + 1) * dt).toFixed(3), act: r.cur, f: r.frameOf[r.cur],
        uFx: L && L.mesh && L.mesh.material && L.mesh.material.userData.frameU ? L.mesh.material.userData.frameU.uFx.value : null,
        sq: +r.sq.toFixed(3), sh: +r.sh.toFixed(3), faceS: +r.faceS.toFixed(2) });
    }
    g.position.x = px0; g.position.z = pz0;
    return out;
  },
  /* v0.43.2 QA: 좌우 반전을 강제한다(빌보드 축 검사 — 양방향 모두 12시 정방향이어야 한다). */
  poseFace: function (i, f) {
    const g = (i < 0) ? (three && three.heroSpr) : (S && S.zombies && S.zombies[i] && S.zombies[i].obj);
    const r = g && g.userData && g.userData.rig;
    if (!r) return null;
    r.face = f < 0 ? -1 : 1;
    if (r.layers) r.layers.forEach(function (L) { if (L.mesh) L.mesh.scale.x = r.face; if (L.aura) L.aura.scale.x = r.face; });
    return { face: r.face, groupScaleX: g.scale.x, meshScaleX: r.layers && r.layers[0] ? r.layers[0].mesh.scale.x : null };
  },
  /* v0.42 QA: 검수용 무대 — 배경을 평평한 한지색으로 두고 그 캐릭터만 남긴다. */
  /* v0.42 QA: 한 캐릭터만 보이기/숨기기 — 두 장을 찍어 차분하면 그 캐릭터의 정확한 화면 영역이 나온다. */
  poseVis: function (i, on) {
    const g = (i < 0) ? (three && three.heroSpr) : (S && S.zombies && S.zombies[i] && S.zombies[i].obj);
    if (!g) return 0;
    const r = g.userData && g.userData.rig;
    if (r && r.kind === 'pose') {
      /* 그림 판만 끈다(아우라·그림자는 남겨 두어 차분이 '인물'만 잡게). */
      r.layers.forEach(function (L) {
        L.mesh.visible = !!on;
        L.aura.visible = !!on && !!L.aura.material.map && L.mesh.material.opacity > 0.01;
      });
      g.userData.heroHidden = !on;
      return 1;
    }
    g.visible = !!on;
    g.scale.y = on ? 1 : 0.0001;
    return 1;
  },
  poseStage: function (mode) {
    if (!three || !three.scene) return null;
    const sc = three.scene;
    if (!window.__psSaved || mode === 'reset') {
      window.__psSaved = sc.children.map(function (o) { return o.visible; });
      window.__psBg = sc.background && sc.background.isColor ? sc.background.getHex() : null;
      window.__psFog = sc.fog ? sc.fog.color.getHex() : null;
    }
    if (!mode || mode === 'reset') {
      sc.children.forEach(function (o, i) { o.visible = window.__psSaved[i] !== false; });
      if (window.__psBg != null) { if (!sc.background || !sc.background.isColor) sc.background = new THREE.Color(window.__psBg); else sc.background.setHex(window.__psBg); }
      if (window.__psFog != null && sc.fog) sc.fog.color.setHex(window.__psFog);
      return 1;
    }
    const only = (mode === 'hero') ? three.heroSpr : ((S.boss && S.boss.obj) || (S.zombies[0] && S.zombies[0].obj));
    if (!only) return 0;
    sc.children.forEach(function (o) { if (!(o === only || o === only.parent)) o.visible = false; });
    only.visible = true;
    if (!sc.background || !sc.background.isColor) sc.background = new THREE.Color(0x15130f); else sc.background.setHex(0x15130f);
    if (sc.fog) sc.fog.color.setHex(0x15130f);
    return 1;
  },
  poseTransforms: function (i) {
    const g = (i < 0) ? (three && three.heroSpr) : (S && S.zombies && S.zombies[i] && S.zombies[i].obj);
    if (!g) return null;
    function t(o) { return { p: o.position.toArray().map(function (v) { return +v.toFixed(3); }),
      q: o.quaternion.toArray().map(function (v) { return +v.toFixed(3); }),
      s: o.scale.toArray().map(function (v) { return +v.toFixed(3); }), vis: o.visible,
      geo: o.geometry && o.geometry.parameters ? o.geometry.parameters : null }; }
    const out = { group: t(g), kids: [] };
    g.children.forEach(function (c) { if (c.children) c.children.forEach(function (m) { out.kids.push(t(m)); }); else out.kids.push(t(c)); });
    return out;
  },
  /* v0.42 QA: 캐릭터가 화면 어디에 서 있는지(발·머리 픽셀) — 리뷰 시트 크롭용 */
  poseScreen: function (i) {
    const g = (i < 0) ? (three && three.heroSpr) : (S && S.zombies && S.zombies[i] && S.zombies[i].obj);
    if (!g || !three || !three.camera) return null;
    const v = new THREE.Vector3();
    g.getWorldPosition(v);
    const foot = v.clone().project(three.camera);
    const top = v.clone(); top.y += (g.userData.worldH || 2.4);
    top.project(three.camera);
    const W = three.renderer.domElement.width, H = three.renderer.domElement.height;
    return { x: (foot.x * 0.5 + 0.5) * W, y: (-foot.y * 0.5 + 0.5) * H,
      top: (-top.y * 0.5 + 0.5) * H, h: (top.y - foot.y) * 0.5 * H, w: W, hh: H };
  },
  /* v0.42 QA: 동작별 포즈 카드 상태(현재 동작·프레임·레이어 겹침). */
  poseInfo: function () {
    const out = figurePoseInfo();
    function brief(g) {
      const r = g && g.userData && g.userData.rig;
      if (!r || r.kind !== 'pose') return null;
      return { name: r.name, act: r.cur, frame: r.frameOf[r.cur], burst: r.burst,
        face: r.face, speed: +r.speed.toFixed(2), lean: +r.lean.toFixed(3),
        layers: r.layers.map(function (l) { return { act: l.act, f: l.frame, op: +l.mesh.material.opacity.toFixed(2) }; }) };
    }
    out.hero = brief(three && three.heroSpr);
    out.enemies = [];
    if (S && S.zombies) {
      S.zombies.forEach(function (z) { const b = brief(z.obj); if (b) out.enemies.push(b); });
    }
    return out;
  },
  rigInfo: function () {
    const out = { ready: !!(art && art.rigInfo && art.rigInfo().ready), hero: null, enemies: 0, rigEnemies: 0, parts: 0, sample: null, mon3d: 0, mon3dSample: null };
    function brief(g) {
      if (!g || !g.userData || !g.userData.rig) return null;
      const r = g.userData.rig;
      /* v0.42: 포즈 카드 리그(kind='pose')도 같은 함수로 본다 — 없는 값은 null. */
      const nParts = r.parts ? (Array.isArray(r.parts) ? r.parts.length : Object.keys(r.parts).length) : 0;
      return { name: r.name, kind: r.kind || 'rig', parts: nParts, face: r.face,
        lean: r.lean != null ? +r.lean.toFixed(3) : null,
        bob: +(g.children[0].position.y || 0).toFixed(3), speed: +(r.speed || 0).toFixed(2),
        arm: r.arm != null ? +r.arm.toFixed(2) : null,
        act: r.cur || null,
        scaleX: +g.scale.x.toFixed(2), visible: g.visible };
    }
    out.hero = brief(three && three.heroSpr);
    if (S && S.zombies) {
      S.zombies.forEach(function (z) {
        if (!z.obj || !z.obj.userData) return;
        out.enemies++;
        if (z.obj.userData.rig) { out.rigEnemies++; const rp = z.obj.userData.rig.parts; out.parts += rp ? (Array.isArray(rp) ? rp.length : Object.keys(rp).length) : 0; if (!out.sample) out.sample = brief(z.obj); }
        if (z.obj.userData.m3d && art.mon3d) { out.mon3d++; if (!out.mon3dSample) out.mon3dSample = art.mon3d.info(z.obj); }
      });
    }
    if (S && S.boss && S.boss.obj) out.boss = brief(S.boss.obj);
    return out;
  },
  inkBlank: function () {
    const c = $('ink');
    if (!c) return true;
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    if (!w || !h) return true;
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 8) return false;
    return true;
  },
  beginDash: beginDash,
  buy: buy, pickUpgrade: pickUpgrade,
  grantIdle: function (ms) { save.lastSeen = Date.now() - ms; persist(false); return checkIdle(); },
  collectIdle: collectIdle,
  idleCoins: idleCoins,
  forceLevelUp: function () { if (!S) return false; openLevelUp(); return true; },
  giveXp: function (n) { if (S) gainXp(n); },
  waitDash: function () {
    return new Promise(function (res) {
      const t0 = now();
      const id = setInterval(function () {
        if (!S || !S.dash && !(S.dashQueue && S.dashQueue.length) || now() - t0 > 8000) { clearInterval(id); res(S && S.lastDash); }
      }, 16);
    });
  },
  visualTune: function (o) {
    if (o && three) {
      if (o.amb != null && three.amb) three.amb.intensity = o.amb;
      if (o.hemi != null && three.hemi) three.hemi.intensity = o.hemi;
      if (o.moon != null && three.moon) three.moon.intensity = o.moon;
      if (o.fog != null && three.scene && three.scene.fog) three.scene.fog.density = o.fog;
      if (three.bloom && three.bloom.post) {
        three.bloom.post.forEach(function (p) {
          const u = p.uniforms;
          if (!u) return;
          if (u.uStrength && o.inkStrength != null) u.uStrength.value = o.inkStrength;
          if (u.uExposure && o.exposure != null) u.uExposure.value = o.exposure;
          if (u.uVignette && o.vignette != null) u.uVignette.value = o.vignette;
          if (u.uGrain && o.grain != null) u.uGrain.value = o.grain;
        });
      }
    }
    const ps = (three && three.bloom && three.bloom.post) || [];
    return {
      amb: three && three.amb ? three.amb.intensity : 0,
      hemi: three && three.hemi ? three.hemi.intensity : 0,
      moon: three && three.moon ? three.moon.intensity : 0,
      inkStrength: ps[0] && ps[0].uniforms && ps[0].uniforms.uStrength ? ps[0].uniforms.uStrength.value : null,
      exposure: ps[1] && ps[1].uniforms && ps[1].uniforms.uExposure ? ps[1].uniforms.uExposure.value : null,
      vignette: ps[1] && ps[1].uniforms && ps[1].uniforms.uVignette ? ps[1].uniforms.uVignette.value : null
    };
  },
  /* v0.40 QA: 틸트시프트 심도 세기 조절(0=off) — 전후 스크린샷 비교용 */
  dofSet: function (v) {
    try { const d = dofPassOf(); if (d && d.setAmount) { d.setAmount(v); return d.debugInfo ? d.debugInfo() : true; } } catch (e) { return String(e); }
    return false;
  },
  floorInfo: function () { try { return floorStatus(); } catch (e) { return String(e); } },
  fxInfo: function () { try { const a = fxSheetInfo(); const b = three && three.paper ? three.paper.info() : null; return { sheets: a, live: b }; } catch (e) { return String(e); } },
  /* v0.41 QA: 실제 일섬 경로를 그대로 만들어 검기 이펙트를 확인한다. */
  dashQa: function (shape) {
    try { const t = (S.zombies || []).filter(function (z) { return z.alive; })[0] || null; return beginDash(shape || 'vline', { target: t, rec: null }); } catch (e) { return String(e); }
  },
  fxEmit: function (kind, x, y, z, size) { try { return !!(three && three.paper && three.paper.emit(kind, { x: x, y: y, z: z, size: size || 2 })); } catch (e) { return String(e); } },
  visualInfo: function () {
    const r = three && three.renderer;
    return {
      dpr: r ? r.getPixelRatio() : 0,
      dprCap: three ? three.dprCap : 0,
      shadows: !!(r && r.shadowMap && r.shadowMap.enabled),
      shadowMap: three && three.moon ? three.moon.shadow.mapSize.x : 0,
      stageId: three && three.map ? three.map.stageId : null,
      mapId: three && three.map ? three.map.id : null,
      props: three && three.chunks ? three.chunks.stats.batches : (three && three.map && three.map.w3 ? three.map.w3.batches : 0),
      chunkProps: three && three.chunks ? three.chunks.stats.props : 0,
      chunkJars: three && three.chunks ? three.chunks.jars.filter(function (j) { return j.alive; }).length : 0,
      chunkRebuilds: three && three.chunks ? three.chunks.stats.rebuilds : 0,
      triangles: three && three.map && three.map.w3 ? three.map.w3.triangles : 0,
      lights: three && three.map ? (three.map.lights || []).length : 0,
      atmoFields: three && three.atmo ? three.atmo.fields.length : 0,
      post: three && three.bloom && three.bloom.composer ? three.bloom.composer.passes.map(function (p) { return p.constructor && p.constructor.name; }) : [],
      dof: (function () { try { const d = dofPassOf(); return d && d.debugInfo ? d.debugInfo() : null; } catch (e) { return null; } })(),
      calls: r ? r.info.render.calls : 0,
      tris: r ? r.info.render.triangles : 0,
      programs: r ? r.info.programs.length : 0,
      geometryCalls: r ? r.info.memory.geometries : 0
    };
  },
  fps: fpsReport,
  clearFps: function () { fps.samples = []; },
  showTitle: function () { if (audio) audio.stopBgm(); showOv('ov-title'); },
  openShop: function () { refreshShop(); showOv('ov-shop'); },
  markMetrics: function () { updateMarks(); return lastMarkMetrics; },
  /* v0.31 QA 훅: 강적 파훼·콤보·정확한 패링·카드·경험치·자동 피해 비중 */
  v31: function () {
    return S ? {
      combo: S.combo || 0, comboMul: +comboMul().toFixed(3), comboMax: S.comboMax || 0,
      comboBreakN: S.comboBreakN || 0, pathWideN: S.pathWideN || 0, comboTierN: S.comboTierN || 0, comboFlash: +(S.comboFlash || 0).toFixed(2),
      level: S.level, xp: S.xp, xpNeed: xpNeed(S.level), spiritCap: S.spiritCap, levelUps: S.levelUps || 0,
      stopT: +(S.stopT || 0).toFixed(2), levelMode: save.levelMode, quickZone: CFG.quick.zone,
      quick: S.quick ? { age: Math.round(now() - S.quick.t0), dur: S.quick.dur, picks: (S.levelPicks || []).map(function (u) { return u.id; }) } : null,
      autoDmg: +(S.autoDmg || 0).toFixed(2), manualDmg: +(S.manualDmg || 0).toFixed(2), autoShare: autoShare(), autoCap: CFG.autoCap,
      ward: wardInfo(), boltT: +(S.boltT || 0).toFixed(2), boltPeriod: upLv('bolt') ? +boltPeriod().toFixed(2) : null,
      bolts: (S.bolts || []).length, boltHits: (S.boltHits || 0), echoes: (S.echoes || []).length,
      echoMul: upLv('echo') ? (CFG.echoCard.mul || [])[Math.min(2, upLv('echo') - 1)] : null,
      inkSteps: (S.inkSteps || []).length, reson: upLv('reson'), counter: upLv('counter'),
      elemSlots: (S.elemSlots || []).slice(), elemSlotN: S.elemSlotN || 1, curElem: curElem(), elemLv: Object.assign({}, S.elemLv || {}),
      evoHints: evoHints(), levelCards: (S.levelPicks || []).map(function (u) { return { id: u.id, mat: evoMatInfo(u.id) }; }),
      dmg: +dashDmg().toFixed(3), dmgBase: S.dashDmg, healMaxN: S.healMaxN || 0, runHp: S.runHp || 0, floorDash: S.floorDash || 0
    } : null;
  },
  breaks: function () {
    return (S ? S.zombies : []).filter(function (z) { return z.alive; }).map(function (z) {
      return { id: z.id, type: z.type, hp: +z.hp.toFixed(2), armor: z.armor || 0, shapeOv: z.shapeOv || null,
        cracks: z.cracks || 0, lastShape: z.lastShape || null, seq: z.seq || null,
        seqI: (z.seqI == null ? null : z.seqI), elite: !!z.elite };
    });
  },
  setCombo: function (n) { if (S) { S.combo = n | 0; S.comboIdle = 0; S.comboBreakN = 0; renderHud(); } return S && S.combo; },
  comboTierProbe: function (n) { return comboReward(n | 0); },
  comboBreakProbe: function () { comboBreak(); return S ? { combo: S.combo || 0, n: S.comboBreakN || 0 } : null; },
  tapProbe: function () { const p = preciseTarget(); return p ? { kind: p.kind, t: +(p.t || 0).toFixed(3), id: p.z ? p.z.id : null } : null; },
  parryNow: function () { return doParry({ type: 'tap', targets: [], hits: [] }); },
  quickPick: function (id) { return id ? pickQuick(id, false) : pickQuick(recommendedPick(), true); },
  quickRecommended: function () { const id = recommendedPick(); return { id: id, ok: id ? pickQuick(id, true) : false }; },
  quickDom: function () { const w = $('quickCards'); return { hidden: w ? !!w.hidden : null, html: $('quickList') ? $('quickList').innerHTML : '', note: $('quickNote') ? $('quickNote').textContent : '' }; },
  levelUpInfo: function () {
    const e = $('evoHint');
    return { paused: S ? S.paused : null, evo: e && !e.hidden ? e.textContent : '',
      cards: ((S && S.levelPicks) || []).map(function (u) { return { id: u.id, name: u.name, level: upCardLevelText(u), desc: upDesc(u), mat: evoMatInfo(u.id) }; }) };
  },
  setLevelMode: setLevelMode,
  xpTable: function (n) { const out = []; for (let i = 1; i <= (n || 12); i++) out.push({ lv: i, need: xpNeed(i) }); return out; },
  gainLevel: function (n) { for (let i = 0; i < (n || 1); i++) gainXp(xpNeed(S.level) - S.xp); return S && S.level; },
  spawnBreak: function (type, x, z, hp) { return spawnZombie({ type: type, x: x == null ? S.hero.x + 3 : x, z: z == null ? S.hero.z : z, hp: hp }); },
  /* 그은 획 하나를 직접 적용한다 — 파훼 규칙을 결정적으로 잴 때 쓴다(입력 경로는 같다). */
  zInfo: function (id) {
    const z = (S.zombies || []).filter(function (o) { return o.id === id; })[0];
    if (!z) return null;
    return { id: z.id, type: z.type, hp: +z.hp.toFixed(2), alive: !!z.alive, armor: z.armor || 0, shapeOv: z.shapeOv || null,
      cracks: z.cracks || 0, lastShape: z.lastShape || null, seq: z.seq || null, seqI: (z.seqI == null ? null : z.seqI), elite: !!z.elite };
  },
  cutRaw: function (id, shape, dmg) {
    if (!S) return null;
    const z = S.zombies.filter(function (o) { return o.alive && o.id === id; })[0];
    if (!z) return null;
    const before = this.zInfo(id);
    hurtZombie(z, dmg == null ? 2.5 : dmg, 'slash', { type: shape, targets: [id], hits: [], segs: [] });
    const after = this.zInfo(id);
    return { before: before, after: after, alive: z.alive, hp: +z.hp.toFixed(2) };
  },
  cut: function (id, shape, dmg) {
    if (!S) return null;
    const z = S.zombies.filter(function (o) { return o.alive && o.id === id; })[0];
    if (!z) return null;
    const rec = { type: shape, targets: [id], hits: [], segs: [] };
    hurtZombie(z, dmg == null ? dashDmg() : dmg, 'slash', rec);
    scoreDash(rec);
    return { hp: +z.hp.toFixed(2), alive: z.alive, hits: rec.hits, z: this.zInfo(id) };
  },
  clearLevels: function () {
    closeQuickCards(); hideOvs();
    if (S) { if (S.paused === 'levelup') S.paused = null; S._pendingLv = 0; S._cleaveLv = 0; S.forcePauseLv = false; }
    return true;
  },
  setDashDmg: function (v) { if (S) S.dashDmg = +v; return S && S.dashDmg; },
  resetDmgMeter: function () { if (S) { S.autoDmg = 0; S.manualDmg = 0; } return true; },
  applyMany: function (list) { (list || []).forEach(function (id) { applyUpgrade(id, true); }); return this.v31(); },
  spawnItemKind: function (kind, x, z) { return spawnItem({ type: kind, x: x == null ? S.hero.x : x, z: z == null ? S.hero.z : z }); },
  collectKind: function (kind) {
    if (!S) return null;
    const it = spawnItem({ type: kind, x: S.hero.x, z: S.hero.z });
    collectItem(it, { type: 'hline', targets: [], hits: [], items: [] });
    return { dashCount: S.dashCount, floorDash: S.floorDash || 0, coins: save.coins };
  },
  wardKillProbe: function (n, r, hp) {
    const out = [];
    const R = r == null ? 2.2 : r;
    for (let i = 0; i < (n || 4); i++) {
      const a = i / (n || 4) * Math.PI * 2;
      out.push(spawnZombie({ type: 'imp', x: S.hero.x + Math.cos(a) * R, z: S.hero.z + Math.sin(a) * R, hp: hp || 30 }).id);
    }
    return out;
  },
  spiritShapes: function () { return livingMarks().map(function (s) { return { id: s.id, shape: spiritShape(s), target: s.target ? s.target.id : null }; }); },
  clearZombies: function () {
    (S.zombies || []).forEach(function (z) { z.alive = false; if (z.obj && three) three.scene.remove(z.obj); });
    S.zombies = []; S.bolts = []; S.shots.forEach(function (sh) { if (sh.mesh) three.scene.remove(sh.mesh); }); S.shots = [];
    assignSpiritTargets();
    return this.breaks();
  },
  mark: function () { assignSpiritTargets(); return this.spiritShapes(); },
  setSpiritCap: function (n) { if (S) S.spiritCap = n | 0; assignSpiritTargets(); return S ? S.spiritCap : 0; },
  spawnShotAt: function (x, z) {
    const sh = spawnShot({ x: x == null ? S.hero.x + 4 : x, z: z == null ? S.hero.z : z });
    return sh ? { x: sh.x, z: sh.z } : null;
  },
  bossNow: function (nShapes) { if (!S) return null; const b = spawnBoss({ nShapes: nShapes || 3 }); return b ? b.id : null; },
  levelProbe: function (xp) { gainXp(xp); return this.v31(); },
  /* 렌더 없이 시뮬레이션만 돌려 판 전체의 성장을 잰다(소프트웨어 GL에서 12장 프레임이 너무 느릴 때). */
  simRun: function (sec, dt, auto) {
    if (!S) return null;
    const d = dt || (1 / 30);
    const n = Math.round((sec || 60) / d);
    const e0 = S.elapsed, k0 = S.kills || 0, l0 = S.level;
    const prevAuto = qa.autoStroke;
    if (auto !== false) qa.autoStroke = true;
    for (let i = 0; i < n && S && S.playing; i++) {
      if (S.paused && S.paused !== 'manual') { if (S.paused === 'levelup') { const b = (S.levelPicks || [])[0]; if (b) pickUpgrade(b.id); } }
      step(d);
      if (S && S.quick) { const id = recommendedPick(); if (id) pickQuick(id, true); }
      if (!S || !S.playing) break;
    }
    qa.autoStroke = prevAuto;
    return { elapsed: +(S.elapsed - e0).toFixed(1), level: S.level, levelFrom: l0, kills: (S.kills || 0) - k0, xpNeed: xpNeed(S.level), won: !!S.won, lost: !!S.lost };
  },
  snapshot: function () {
    return {
      hero: S && { x: S.hero.x, z: S.hero.z },
      spirits: S ? livingMarks().map(function (s) {
        const fs = bellFootScreen(s);
        const hs = heroScreen();
        let tscr = null;
        if (s.target && s.target.alive) tscr = projectXZ(s.target.x, s.target.z, 0.8);
        return {
          id: s.id, shape: spiritShape(s), x: s.x, z: s.z, angle: s.angle, avoid: s.avoid || 0,
          sx: fs.x, sy: fs.y, screenAngle: screenAngleTo(fs.x, fs.y, hs),
          rimErr: rimErrorPx(fs.x, fs.y),
          targetId: s.target && s.target.alive ? s.target.id : null,
          targetSx: tscr && tscr.x, targetSy: tscr && tscr.y,
          targetScreenAngle: tscr ? screenAngleTo(tscr.x, tscr.y, hs) : null,
          boss: false
        };
      }) : [],
      marked: S ? livingMarks().map(function (s) { return { id: s.id, shape: spiritShape(s), x: s.x, z: s.z, angle: s.angle, targetId: s.target && s.target.alive ? s.target.id : null }; }) : [],
      ring: S ? { r: ringR(), px: (lastMarkMetrics && lastMarkMetrics.ring && lastMarkMetrics.ring.px) || S.ringPx || 0, rx: lastMarkMetrics && lastMarkMetrics.ring && lastMarkMetrics.ring.rx, ry: lastMarkMetrics && lastMarkMetrics.ring && lastMarkMetrics.ring.ry, cx: lastMarkMetrics && lastMarkMetrics.ring && lastMarkMetrics.ring.cx, cy: lastMarkMetrics && lastMarkMetrics.ring && lastMarkMetrics.ring.cy, lv: S.ringLv || 0, frac: (lastMarkMetrics && lastMarkMetrics.ring && lastMarkMetrics.ring.frac) || 0, kind: lastMarkMetrics && lastMarkMetrics.ring && lastMarkMetrics.ring.kind, fov: (three && three.camera && three.camera.fov) || CFG.fov, bounce: !!(S.bounce), ripple: !!(S.landRipple && S.landRipple.t > 0) } : null,
      zombies: S ? S.zombies.filter(function (z) { return z.alive; }).map(function (z) { return { id: z.id, x: z.x, z: z.z, hp: z.hp, frozen: z.frozen > 0, freezeLeft: z.frozen || 0, burn: z.burn > 0, burnLeft: z.burn || 0, poison: z.poison || 0, stun: z.stun || 0, marked: !!z.marked, shape: z.marked || z.isBoss ? spiritShape(z) : null, isBoss: !!z.isBoss, seqI: z.isBoss ? z.seqI : 0, hasRim: !!(z.obj && z.obj.userData && (z.obj.userData.rim || z.obj.userData.bakedRim)), tele: !!(z.obj && z.obj.userData && z.obj.userData.teleOn) }; }) : [],
      items: S ? S.items.filter(function (i) { return i.alive; }).map(function (i) { return { id: i.id, type: i.kind, x: i.x, z: i.z }; }) : [],
      lastDash: S && S.lastDash,
      charge: S && S.charge, cleaveCount: S && S.cleaveCount, cleaveFx: S && S.cleaveFx,
      parry: S && { cd: S.parryCd || 0, hits: (S.parryHits || []).slice(), flash: S.parryFlash || 0 },
      inputBuf: (S && S.inputBuf) ? { type: S.inputBuf.type, age: now() - S.inputBuf.t0 } : null,
      wave: S && { fired: (S.wavesFired || []).slice(), pending: (S.waveIds || []).length },
      evo: S && Object.keys(S.evo || {}), evolved: S && (S.evolved || []).slice(),
      magnetR: S && S.magnetR,
      marks: (lastMarkMetrics && lastMarkMetrics.marks) || [],
      glyphs: (lastMarkMetrics && lastMarkMetrics.marks) || [],
      dashSeq: S && (S.dashSeq || 0),
      markStyle: lastMarkMetrics && lastMarkMetrics.markStyle,
      markCssPx: lastMarkMetrics && lastMarkMetrics.cssPx,
      bossState: S && S.boss ? (S.boss.state || 'walk') : null,
      elites: S ? S.zombies.filter(function (z) { return z.alive && z.elite; }).map(function (z) { return { id: z.id, hp: +(+z.hp).toFixed(1), attr: z.eliteAttr || null, invuln: z.invuln || 0 }; }) : [],
      combo: S && S.combo, comboMax: S && S.comboMax,
      stageNo: S && S.stageNo, stageName: S && S.stage && S.stage.name, stageMap: S && S.stage && S.stage.map,
      kills: S && (S.kills || 0), stars: S && (S.stars || 0),
      bursts: S && (S.bursts || []).slice(),
      runNo: S && S.runNo, pool: S && (S.pool || []).slice(),
      practice: S && { t: S.practiceT, shape: S.practiceShape, left: S.practiceSpawns },
      sightWave: S && S.sightWave,
      iframe: S && S.iframe, hitstop: S && S.hitstop, hurtFlash: S && S.hurtFlash,
      bellPans: S && (S.bellPans || []).slice(),
      lastRec: S && S.lastRec && { type: S.lastRec.type, best: S.lastRec.best, readMessage: S.lastRec.readMessage, reason: S.lastRec.reason },
      telegraphs: S ? S.zombies.filter(function (z) { return z.alive && z.obj && z.obj.userData && z.obj.userData.teleOn; }).map(function (z) { return z.id; }) : [],

      dashCount: S && S.dashCount,
      dashElem: S && S.dashElem,
      bell: S && { t: S.bellT, shape: S.bellShape, cinematic: !!(S.lastDash && S.lastDash.cinematic) },
      map: three && three.map && { id: three.map.id, name: three.map.name, key: three.map.key },
      chunks: three && three.chunks ? Object.assign({ center: { cx: three.chunks.center.cx, cz: three.chunks.center.cz }, jarsAlive: three.chunks.jars.filter(function (j) { return j.alive; }).length }, three.chunks.stats) : null,
      arena: S && S.arena ? { x: S.arena.x, z: S.arena.z, r: S.arena.r, bossAlive: !!(S.boss && S.boss.alive) } : null,
      hp: S && S.hp, coins: save.coins, playing: !!(S && S.playing), paused: S && S.paused,
      timeLeft: S && S.timeLeft, boss: !!(S && S.boss), bossAlive: !!(S && S.boss && S.boss.alive), bossSeqI: S && S.boss && S.boss.alive ? S.boss.seqI : null,
      fps: fpsReport(),
      touchAction: getComputedStyle(document.body).touchAction,
      overscroll: getComputedStyle(document.body).overscrollBehavior,
      toast: $('toast').hidden ? '' : $('toast').textContent,
      titleShown: $('ov-title').classList.contains('show')
    };
  }
};
window.GPv2 = GPv2;
boot();
