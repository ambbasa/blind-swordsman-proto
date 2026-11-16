/* 심안(SIMAN) v2 — 2.5D quarter-view, Three.js, camera-follow dashes.
   v0.23: 아이템 전수 개편(원소 각인 Lv1~3 · 임시 원소 부적 · 혼령 슬롯 · 정확한 획 · 칼집 각성 ·
          카드 아이콘/레벨 표시 · 바닥 종 만종 진화) + 3막 12장 스테이지 확장(신규 적 3종 ·
          보스 다중 장판 · 막/장 단위 스테이지 선택). */
import * as THREE from 'three';
import { probeAssets, buildArt } from './art.js';
import * as Anim from './anim.js';
import { createAudio } from './audio.js';
import { createInkSlash, prewarmInkSlash } from '../../assets/v2/fx-ink/code/inkSlashMaterial.js';
import { InkParticles } from '../../assets/v2/fx-ink/code/inkParticles.js';
import { setupBloom, AutoQuality } from '../../assets/v2/fx-ink/code/bloomSetup.js';
import { drawSonarRing2D } from '../../assets/v2/fx-ink/code/sonarRing.js';
import { createInkWashPass } from './inkwash.js';
import { createCinematicPass } from './inkcinematic.js';
import { createSlashArc } from './inkslash3d.js';
import { StageAtmosphere } from './inkatmos.js';
import { createChunkWorld, buildChunkData, chunkOf } from './inkchunks.js';
import { InkFx, FX_COLORS } from './inkfx.js';
const inkFx = new InkFx();
let frameDt = 1 / 60;

const G = window.GPGestures;
const SAVE_KEY = 'gesture-proto.v2';
const FXINK_BASE = '../assets/v2/fx-ink/';
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
const SHAPE_MARK = { hline: '—', vline: 'ㅣ', vee: 'V', bolt: '⚡' };
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
  coinPerKill: 3,
  idlePerMin: 4, idleMaxHours: 8,
  upgradeBase: 15, atkStep: 0.05, hpStep: 3, coinStep: 0.25, maxLv: 10,
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
  comboMulStep: 0.05, comboMulCap: 20, pierceFalloff: 0.85,
  spreadR: 1.5, iceSlowDur: 2, iceSlowMul: 0.5, poisonCloudR: 2, poisonCloudDur: 3,
  dashCount: 1, spawnZombieMs: 900,
  spawnZombieMax: 20,
  spawnZombieMinMs: 450,
  spawnZombieDelay: 1.2, practiceZombieMs: 3200, practiceZombieMax: 2, earlyZombieMax: 6, earlyZombieUntil: 15, earlyZombieMinMs: 1400,
  openingZombies: 6, openingRing: [0.5, 0.8],
  spiritStreamAlpha: 0.7, spiritFadeIn: 0.4, spiritAlpha: 1, spiritHover: 1.26, spiritCapStart: 1, spiritMax: 5, spiritGlowAlpha: 0.5,
  /* 혼령 회수 되돌림(hysteresis): 획득 0.95R, 회수 1.15R(=fogOuter). */
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
  ], waveBoostSec: 8,
  ringScreenFrac: 0.70, ringMaxFrac: 0.90, ringBoost: 0.095, /* Lv3 lands on ringMaxFrac (0.70 x 1.285 = 0.90) so each level shows in portrait */ ringLvMax: 3,
  spiritOmega: 2.8, spiritAvoidMax: 0.30, spiritAvoidOmega: 8, bossSpeed: 1.0, bossCatchUp: 0.3, bossSpawnR: 11,
  dashThroughMul: 1.5, dashPastTarget: 0.8, dashPastBodyMul: 1.5, dashPastExtra: 2.0, playBound: 0,
  /* v0.22 보스 결계(아레나): 보스가 서면 이 반경 안에서만 싸운다. */
  arenaR: 12, arenaRing: 0.5, arenaPulse: 1.4,
  /* v0.22 묵항아리: 부수면 세 가지 픽업 중 하나 */
  jarR: 0.62, jarDropWeights: { herb: 0.4, magnet: 0.3, bang: 0.3 }, herbHeal: 2, bangR: 15,
  landBounce: 0.28, landBounceT: 0.16, landRippleDur: 0.45,
  landIframe: 0.25, landShockR: 1.6, landPush: 1.2, landStun: 0.3, landPast: 1.0,
  hitstopKill: 0.06, hitstopKillMax: 0.12, hitHitstop: 0.08, hitKnock: 0.6,
  recoilU: 0.12, recoilT: 0.12, hurtVignette: 0.3,
  aimConeCos: 0.5, aimNearW: 0.35, telegraphRange: 3.2,
  spiritRing: [5, 7.2], zombieRing: [6, 8.5],
  zombieSpeed: 2.15, spiritSpeed: 0.55,
  qlLowFps: 44, qlHighFps: 57, qlDownSec: 3.5, qlUpSec: 8,
  camOff: { x: 14.4, y: 22.4, z: 14.4 }, camLookY: 1.2, fov: 62,
  markMinCss: 12, seqDotGap: 16, markMaxCss: 32,
  comboTimeout: 2.8,
  /* v0.23 아이템 개편: 자동 흡수·수명 · 원소 각인 · 정확한 획 · 칼집 각성 */
  autoPickR: 1.25, itemLife: 24, tempElemDur: 12, elemLvMax: 3,
  iceDurStep: 0.5, shatterStep: 1, burnDurStep: 0.5, burnDmgStep: 0.3,
  poisonMaxStep: 1, poisonDmgStep: 0.2, cloudRStep: 0.6,
  perfectDmgMul: 1.5, perfectStep: 0.15, perfectThresh: 0.80, perfectThreshStep: 0.05,
  parryAwakenR: 0.45, parryAwakenDmg: 0.4, parryAwakenCharge: 14, parryAwakenStun: 0.12,
  bellMyriadDur: 12,
  comboBurstAt: [4, 8, 12],
  comboBurstR: [3.2, 4.2, 5.2], comboBurstDmg: [1, 1.5, 2],
  practiceSec: 10, practiceSpawns: 6, comboBurstMs: 220,
  iceDur: 2.5, burnDur: 3, burnPeriod: 0.75, burnDmg: 1,
  poisonMax: 5, poisonDur: 4, poisonPeriod: 1, poisonDmgPer: 1,
  shatterDmg: 4, explodeDmg: 3, explodeR: 2.5,
  bellDur: 8, slowDur: 0.45, slowScale: 0.35,
  sightWaveDur: 0.45,
  /* Fog outside the mind's-eye ring: clear inside fogInner x ring, fully fogged at fogOuter x ring. */
  fogColor: [7, 6, 8], fogAlpha: 0.84, fogInner: 0.86, fogOuter: 1.16, fogWisps: 28, fogWispAlpha: 0.05
};
const RUN_UPGRADES = [
  { id: 'dmg', name: '돌진 데미지', desc: '일섬이 더 큰 상처를 남깁니다.', maxLv: 99 },
  { id: 'width', name: '경로 폭', desc: '베기 선이 넓어져 더 많은 것을 스칩니다.', maxLv: 6 },
  { id: 'dash', name: '일섬 횟수', desc: '같은 모양 혼령 방향으로 한 번 더 돌진합니다.', maxLv: 4 },
  { id: 'ring', name: '심안 반경', desc: '심안(먹안개)이 넓어집니다. Lv3이 최대입니다.', maxLv: 3 },
  { id: 'charge', name: '참(斬) 게이지', desc: '참 게이지가 더 빨리 차오릅니다.', maxLv: 5 },
  { id: 'heal', name: '체력 회복', desc: '체력 +5, 이번 판 최대 체력 +2.', maxLv: 99 },
  { id: 'perfect', name: '정확한 획', desc: '획을 깔끔하게 그릴수록(인식 정확도 기준 이상) 일섬이 더 깊이 듭니다.', maxLv: 3 },
  { id: 'parry', name: '칼집 각성', desc: '칼집 패링이 충격파를 내고 참 게이지를 채웁니다.', maxLv: 3 },
  { id: 'ice', name: '얼음 각인', desc: '얼음 일섬 — 빙결과 파열이 강해집니다.', maxLv: 3 },
  { id: 'fire', name: '화염 각인', desc: '화염 일섬 — 연소가 길고 아프게 붙습니다.', maxLv: 3 },
  { id: 'poison', name: '독 각인', desc: '독 일섬 — 중첩 상한과 독구름이 커집니다.', maxLv: 3 }
];

/* ---------- 스테이지 ----------
   한 판 = 한 스테이지. 목표는 "제한 시간 안에 부적 귀물(보스)이 든 도형 순서를 모두 베는 것".
   스테이지가 오르면 맵·안개·적 구성·웨이브 수·보스 순서 길이가 함께 확장된다. */
const STAGES = [
  /* ---------- 제1막 「폐허의 도성」 ---------- */
  {
    id: 1, act: 1, name: '잿빛 장터', sub: '불탄 기와집, 첫 번째 획', map: 'map1', tag: '가로 한 획',
    goal: '혼령이 든 가로 한 획(—)을 그어 귀물을 베어 넘기세요.',
    tip: '제자리에서 짧게 콕 누르면 칼집으로 받아치는 패링이 됩니다.',
    time: 90, bossAt: 60, bossShapes: 3,
    shapes: ['hline'], spiritCap: 1,
    opening: { n: 5, ring: [0.45, 0.72], brute: 0 },
    mix: [[0, { imp: 1 }], [26, { imp: 0.8, brute: 0.2 }]],
    waves: [
      { t: 42, n: 20, mix: { imp: 0.85, brute: 0.15 }, r: [9, 11] }
    ],
    spawn: { ms: 900, max: 28, earlyMax: 9, earlyMinMs: 1300 },
    boss: { telegraph: 1.35, charge: 16, adds: 0, hazard: 0 },
    starCombo: 14,
    atmo: { clear: 0x1b1a1c, fogCol: [21, 18, 15], fog: 0.020, moon: 22.0, amb: 6.0, hemiI: 6.0, fill: 4.2, hemi: 0x6a6860, ground: 0x1a1612, moonCol: 0xc8c0b0, tint: 'linear-gradient(180deg, rgba(96,112,130,0.12) 0%, rgba(34,44,54,0.18) 100%)' }
  },
  {
    id: 2, act: 1, name: '무너진 성문', sub: '성곽 위에 매달린 원혼', map: 'map2', tag: '가로 · 세로',
    goal: '세로 획(ㅣ)이 열립니다. 두 방향을 오가며 성문을 지키세요.',
    tip: '금테를 두른 정예 원귀를 베면 부적 상자가 떨어집니다.',
    time: 150, eliteAt: 75, bossAt: 115, bossShapes: 4,
    shapes: ['hline', 'vline'], spiritCap: 1,
    opening: { n: 6, ring: [0.5, 0.8], brute: 1 },
    mix: [[0, { imp: 0.85, brute: 0.15 }], [22, { imp: 0.66, brute: 0.34 }], [46, { imp: 0.5, brute: 0.32, stone: 0.18 }]],
    waves: [
      { t: 42, n: 24, mix: { imp: 0.7, brute: 0.3 }, r: [9, 11] },
      { t: 90, n: 28, mix: { imp: 0.6, brute: 0.3, stone: 0.1 }, r: [9.5, 12], elite: 1 }
    ],
    spawn: { ms: 780, max: 34, earlyMax: 10, earlyMinMs: 1200 },
    boss: { telegraph: 1.2, charge: 18, adds: 0, hazard: 0 },
    starCombo: 20,
    atmo: { clear: 0x141a26, fogCol: [12, 17, 26], fog: 0.024, moon: 20.0, amb: 5.6, hemiI: 6.6, fill: 4.0, hemi: 0x5c6a8c, ground: 0x11141c, moonCol: 0xa9b8dd, tint: 'linear-gradient(180deg, rgba(44,64,150,0.20) 0%, rgba(8,18,58,0.26) 100%)' }
  },
  {
    id: 3, act: 1, name: '대나무 골', sub: '서낭당 너머로 우는 소리', map: 'map3', tag: 'V 두 획',
    goal: 'V자 두 획이 열립니다. 조여오는 무리를 한 번에 가르세요.',
    tip: 'V·번개 획은 가장 위협적인 귀물을 알아서 찾아갑니다.',
    time: 180, eliteAt: 90, bossAt: 140, bossShapes: 5,
    shapes: ['hline', 'vline', 'vee'], spiritCap: 2,
    opening: { n: 7, ring: [0.55, 0.85], brute: 1 },
    mix: [[0, { imp: 0.8, brute: 0.2 }], [20, { imp: 0.6, brute: 0.3, stone: 0.1 }], [44, { imp: 0.45, brute: 0.33, stone: 0.22 }]],
    waves: [
      { t: 42, n: 26, mix: { imp: 0.7, brute: 0.3 }, r: [9, 11] },
      { t: 84, n: 30, mix: { imp: 0.55, brute: 0.3, stone: 0.15 }, r: [9.5, 12], elite: 1 },
      { t: 126, n: 34, mix: { imp: 0.5, brute: 0.32, stone: 0.18 }, r: [9.5, 12.5], elite: 1 }
    ],
    spawn: { ms: 660, max: 40, earlyMax: 11, earlyMinMs: 1100 },
    boss: { telegraph: 1.1, charge: 19, adds: 2, hazard: 1 },
    starCombo: 26,
    atmo: { clear: 0x121a15, fogCol: [11, 19, 14], fog: 0.026, moon: 18.0, amb: 5.4, hemiI: 6.2, fill: 3.6, hemi: 0x6f8472, ground: 0x12160f, moonCol: 0xb4d2b4, tint: 'linear-gradient(180deg, rgba(28,92,60,0.18) 0%, rgba(6,26,16,0.26) 100%)' }
  },
  {
    id: 4, act: 1, name: '붉은 달', sub: '모든 획이 열린 밤', map: 'map1', tag: '번개 획',
    goal: '번개 획(⚡)까지 열렸습니다. 여섯 번의 절단으로 끝내세요.',
    tip: '보스가 돌진한 뒤 경직될 때 베면 절단이 두 번 들어갑니다.',
    time: 180, eliteAt: 85, bossAt: 135, bossShapes: 6,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 2,
    opening: { n: 8, ring: [0.55, 0.9], brute: 2 },
    mix: [[0, { imp: 0.75, brute: 0.25 }], [18, { imp: 0.55, brute: 0.3, stone: 0.15 }], [40, { imp: 0.42, brute: 0.33, stone: 0.25 }]],
    waves: [
      { t: 40, n: 28, mix: { imp: 0.65, brute: 0.35 }, r: [9, 11] },
      { t: 82, n: 32, mix: { imp: 0.5, brute: 0.32, stone: 0.18 }, r: [9.5, 12], elite: 1 },
      { t: 122, n: 36, mix: { imp: 0.45, brute: 0.33, stone: 0.22 }, r: [9.5, 12.5], elite: 1 }
    ],
    spawn: { ms: 580, max: 45, earlyMax: 12, earlyMinMs: 1000 },
    boss: { telegraph: 1.0, charge: 21, adds: 3, hazard: 1 },
    starCombo: 32,
    atmo: { clear: 0x1c0f12, fogCol: [30, 10, 11], fog: 0.028, moon: 21.0, amb: 6.0, hemiI: 5.8, fill: 4.0, hemi: 0x8a5a52, ground: 0x1e1210, moonCol: 0xff9c84, tint: 'linear-gradient(180deg, rgba(150,32,28,0.22) 0%, rgba(52,6,8,0.28) 100%)' }
  },

  /* ---------- 제2막 「안개 산사」 ---------- */
  {
    id: 5, act: 2, name: '안개 석탑', sub: '구름에 잠긴 탑, 흔들리는 종소리', map: 'map5', tag: '네 획의 밤',
    goal: '네 가지 획이 모두 열린 산길입니다. 탑을 등지고 오는 무리를 베세요.',
    tip: '푸른 테의 원귀가 붉게 웅크리면 곧 곧장 달려옵니다 — 그 순간 일섬으로 비켜서세요.',
    time: 190, eliteAt: 95, bossAt: 150, bossShapes: 6,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 2,
    opening: { n: 8, ring: [0.55, 0.88], brute: 2 },
    mix: [[0, { imp: 0.7, brute: 0.22, charger: 0.08 }], [24, { imp: 0.52, brute: 0.26, charger: 0.14, stone: 0.08 }], [58, { imp: 0.42, brute: 0.26, charger: 0.16, stone: 0.1, thrower: 0.06 }]],
    waves: [
      { t: 40, n: 30, mix: { imp: 0.6, brute: 0.3, charger: 0.1 }, r: [9, 11] },
      { t: 84, n: 34, mix: { imp: 0.5, brute: 0.28, charger: 0.14, stone: 0.08 }, r: [9.5, 12], elite: 1 },
      { t: 126, n: 38, mix: { imp: 0.42, brute: 0.26, charger: 0.18, thrower: 0.08, stone: 0.06 }, r: [9.5, 12.5], elite: 1 }
    ],
    spawn: { ms: 620, max: 44, earlyMax: 12, earlyMinMs: 1050 },
    boss: { telegraph: 1.05, charge: 19, adds: 2, hazard: 2 },
    starCombo: 30,
    atmo: { clear: 0x101a1e, fogCol: [14, 24, 28], fog: 0.032, moon: 17.0, amb: 5.2, hemiI: 6.4, fill: 3.4, hemi: 0x6f8a92, ground: 0x0d1417, moonCol: 0xbcd8dc, tint: 'linear-gradient(180deg, rgba(38,86,96,0.20) 0%, rgba(6,20,26,0.30) 100%)' }
  },
  {
    id: 6, act: 2, name: '설산 폐사찰', sub: '눈에 덮인 부처, 꺼지지 않은 향', map: 'map6', tag: '눈보라',
    goal: '눈 덮인 산사에 부적을 던지는 원귀가 숨어 있습니다. 그들을 먼저 끊으세요.',
    tip: '멀찍이 서서 부적을 던지는 원귀는 일섬으로 파고들어야 합니다.',
    time: 200, eliteAt: 100, bossAt: 158, bossShapes: 7,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 2,
    opening: { n: 9, ring: [0.5, 0.9], brute: 2 },
    mix: [[0, { imp: 0.66, brute: 0.24, thrower: 0.1 }], [22, { imp: 0.5, brute: 0.26, thrower: 0.14, stone: 0.1 }], [55, { imp: 0.4, brute: 0.24, thrower: 0.16, charger: 0.1, stone: 0.1 }]],
    waves: [
      { t: 42, n: 32, mix: { imp: 0.54, brute: 0.28, thrower: 0.18 }, r: [9, 11] },
      { t: 88, n: 36, mix: { imp: 0.44, brute: 0.26, thrower: 0.16, stone: 0.14 }, r: [9.5, 12], elite: 1 },
      { t: 132, n: 40, mix: { imp: 0.36, brute: 0.24, thrower: 0.18, charger: 0.12, stone: 0.1 }, r: [9.5, 12.5], elite: 1 }
    ],
    spawn: { ms: 600, max: 46, earlyMax: 12, earlyMinMs: 1000 },
    boss: { telegraph: 1.0, charge: 20, adds: 2, hazard: 3 },
    starCombo: 34,
    atmo: { clear: 0x161d25, fogCol: [22, 30, 40], fog: 0.034, moon: 16.0, amb: 5.4, hemiI: 6.8, fill: 3.6, hemi: 0x8aa0b4, ground: 0x11161d, moonCol: 0xdcecf8, tint: 'linear-gradient(180deg, rgba(120,160,200,0.20) 0%, rgba(14,24,38,0.30) 100%)' }
  },
  {
    id: 7, act: 2, name: '고목 골', sub: '잎이 진 나무들이 길을 막는다', map: 'map7', tag: '혼령 셋',
    goal: '혼령이 셋 머무는 골짜기입니다. 세 갈래 획을 한 번에 꿰세요.',
    tip: '몸이 주황으로 부풀어 오르는 원귀는 터집니다 — 붙기 전에 베세요.',
    time: 210, eliteAt: 105, bossAt: 166, bossShapes: 8,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 3,
    opening: { n: 10, ring: [0.5, 0.9], brute: 2 },
    mix: [[0, { imp: 0.6, brute: 0.26, bomber: 0.14 }], [20, { imp: 0.44, brute: 0.26, bomber: 0.16, charger: 0.14 }], [50, { imp: 0.34, brute: 0.24, bomber: 0.16, charger: 0.16, stone: 0.1 }]],
    waves: [
      { t: 42, n: 34, mix: { imp: 0.5, brute: 0.28, bomber: 0.22 }, r: [9, 11] },
      { t: 88, n: 38, mix: { imp: 0.4, brute: 0.26, bomber: 0.18, charger: 0.16 }, r: [9.5, 12], elite: 1 },
      { t: 134, n: 42, mix: { imp: 0.32, brute: 0.24, bomber: 0.18, charger: 0.16, stone: 0.1 }, r: [9.5, 12.5], elite: 1 }
    ],
    spawn: { ms: 570, max: 48, earlyMax: 13, earlyMinMs: 980 },
    boss: { telegraph: 0.95, charge: 21, adds: 3, hazard: 3 },
    starCombo: 38,
    atmo: { clear: 0x121a14, fogCol: [16, 24, 18], fog: 0.030, moon: 17.5, amb: 5.3, hemiI: 6.2, fill: 3.4, hemi: 0x74886e, ground: 0x0f1410, moonCol: 0xbfd6bc, tint: 'linear-gradient(180deg, rgba(46,84,52,0.20) 0%, rgba(8,20,10,0.30) 100%)' }
  },
  {
    id: 8, act: 2, name: '무명 산문', sub: '이름 없는 절의 마지막 문', map: 'map8', tag: '산문 앞',
    goal: '산문을 지키는 원혼이 길고 긴 도형을 듭니다. 아홉 번의 절단.',
    tip: '보스가 부르는 잔몹은 참(斬)으로 한꺼번에 쓸어 담으세요.',
    time: 220, eliteAt: 110, bossAt: 172, bossShapes: 9,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 3,
    opening: { n: 10, ring: [0.5, 0.92], brute: 3 },
    mix: [[0, { imp: 0.58, brute: 0.26, thrower: 0.16 }], [18, { imp: 0.42, brute: 0.26, thrower: 0.18, charger: 0.14 }], [46, { imp: 0.32, brute: 0.24, thrower: 0.18, charger: 0.14, bomber: 0.12 }]],
    waves: [
      { t: 44, n: 36, mix: { imp: 0.46, brute: 0.28, thrower: 0.26 }, r: [9, 11] },
      { t: 92, n: 40, mix: { imp: 0.38, brute: 0.26, thrower: 0.2, charger: 0.16 }, r: [9.5, 12], elite: 1 },
      { t: 140, n: 44, mix: { imp: 0.3, brute: 0.24, thrower: 0.18, charger: 0.16, bomber: 0.12 }, r: [9.5, 13], elite: 1 }
    ],
    spawn: { ms: 540, max: 50, earlyMax: 13, earlyMinMs: 950 },
    boss: { telegraph: 0.92, charge: 22, adds: 3, hazard: 4 },
    starCombo: 42,
    atmo: { clear: 0x171a22, fogCol: [24, 26, 34], fog: 0.036, moon: 15.5, amb: 5.6, hemiI: 7.0, fill: 3.8, hemi: 0x8c8ea4, ground: 0x13151b, moonCol: 0xd6d2e8, tint: 'linear-gradient(180deg, rgba(92,86,150,0.18) 0%, rgba(14,14,30,0.30) 100%)' }
  },

  /* ---------- 제3막 「혈월의 나락」 ---------- */
  {
    id: 9, act: 3, name: '혈석 제단', sub: '붉은 돌이 숨 쉬는 제단', map: 'map9', tag: '혈석',
    goal: '혈석이 빛을 머금습니다. 제단에 닿기 전에 모두 베세요.',
    tip: '다중 장판이 깔리면 빛나는 땅을 밟지 마세요 — 터지기 전에 빠져나옵니다.',
    time: 225, eliteAt: 112, bossAt: 176, bossShapes: 9,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 3,
    opening: { n: 11, ring: [0.5, 0.92], brute: 3 },
    mix: [[0, { imp: 0.52, brute: 0.26, charger: 0.22 }], [18, { imp: 0.38, brute: 0.26, charger: 0.2, bomber: 0.16 }], [44, { imp: 0.28, brute: 0.24, charger: 0.18, bomber: 0.16, stone: 0.14 }]],
    waves: [
      { t: 44, n: 38, mix: { imp: 0.42, brute: 0.28, charger: 0.3 }, r: [9, 11.5] },
      { t: 92, n: 42, mix: { imp: 0.34, brute: 0.26, charger: 0.22, bomber: 0.18 }, r: [9.5, 12.5], elite: 1 },
      { t: 142, n: 46, mix: { imp: 0.26, brute: 0.24, charger: 0.2, bomber: 0.16, stone: 0.14 }, r: [9.5, 13], elite: 1 }
    ],
    spawn: { ms: 520, max: 52, earlyMax: 14, earlyMinMs: 920 },
    boss: { telegraph: 0.9, charge: 22, adds: 3, hazard: 4 },
    starCombo: 46,
    atmo: { clear: 0x1e0e11, fogCol: [34, 12, 14], fog: 0.034, moon: 19.0, amb: 6.2, hemiI: 5.6, fill: 4.0, hemi: 0x8e5a5a, ground: 0x1a0d0e, moonCol: 0xff8a72, tint: 'linear-gradient(180deg, rgba(150,28,34,0.26) 0%, rgba(44,4,8,0.32) 100%)' }
  },
  {
    id: 10, act: 3, name: '뼈의 강', sub: '마른 강바닥에 쌓인 뼈', map: 'map10', tag: '혼령 넷',
    goal: '혼령이 넷까지 머뭅니다. 넷을 한 번에 꿰는 획을 노리세요.',
    tip: '혼령 슬롯 카드가 있으면 넷이 동시에 종을 듭니다.',
    time: 230, eliteAt: 115, bossAt: 180, bossShapes: 10,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 4,
    opening: { n: 12, ring: [0.5, 0.95], brute: 3 },
    mix: [[0, { imp: 0.48, brute: 0.26, thrower: 0.26 }], [16, { imp: 0.36, brute: 0.26, thrower: 0.2, charger: 0.18 }], [42, { imp: 0.26, brute: 0.24, thrower: 0.18, charger: 0.16, bomber: 0.16 }]],
    waves: [
      { t: 44, n: 40, mix: { imp: 0.38, brute: 0.28, thrower: 0.34 }, r: [9, 11.5] },
      { t: 94, n: 44, mix: { imp: 0.3, brute: 0.26, thrower: 0.22, charger: 0.22 }, r: [9.5, 12.5], elite: 1 },
      { t: 146, n: 48, mix: { imp: 0.24, brute: 0.24, thrower: 0.2, charger: 0.16, bomber: 0.16 }, r: [9.5, 13], elite: 1 }
    ],
    spawn: { ms: 500, max: 54, earlyMax: 14, earlyMinMs: 900 },
    boss: { telegraph: 0.88, charge: 23, adds: 3, hazard: 4 },
    starCombo: 50,
    atmo: { clear: 0x18100f, fogCol: [28, 20, 16], fog: 0.036, moon: 18.0, amb: 6.0, hemiI: 6.0, fill: 4.2, hemi: 0x9a8a76, ground: 0x151010, moonCol: 0xe8c8a8, tint: 'linear-gradient(180deg, rgba(120,88,58,0.22) 0%, rgba(34,18,12,0.32) 100%)' }
  },
  {
    id: 11, act: 3, name: '혈월 성채', sub: '달이 가장 가까운 성벽', map: 'map11', tag: '정예 셋',
    goal: '성벽 위의 원혼이 열한 번의 도형을 겁니다. 정예도 셋입니다.',
    tip: '정예 원귀의 부적 상자는 강화 3연속 — 놓치지 마세요.',
    time: 240, eliteAt: 118, bossAt: 188, bossShapes: 11,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 4,
    opening: { n: 12, ring: [0.48, 0.95], brute: 4 },
    mix: [[0, { imp: 0.44, brute: 0.26, charger: 0.3 }], [16, { imp: 0.32, brute: 0.26, charger: 0.22, bomber: 0.2 }], [40, { imp: 0.24, brute: 0.24, charger: 0.2, bomber: 0.18, stone: 0.14 }]],
    waves: [
      { t: 44, n: 42, mix: { imp: 0.34, brute: 0.28, charger: 0.38 }, r: [9, 12] },
      { t: 96, n: 46, mix: { imp: 0.28, brute: 0.26, charger: 0.24, bomber: 0.22 }, r: [9.5, 13], elite: 1 },
      { t: 150, n: 50, mix: { imp: 0.22, brute: 0.24, charger: 0.2, bomber: 0.18, stone: 0.16 }, r: [9.5, 13], elite: 1 }
    ],
    spawn: { ms: 480, max: 56, earlyMax: 15, earlyMinMs: 880 },
    boss: { telegraph: 0.85, charge: 24, adds: 4, hazard: 5 },
    starCombo: 54,
    atmo: { clear: 0x22090d, fogCol: [40, 10, 14], fog: 0.038, moon: 20.0, amb: 6.4, hemiI: 5.4, fill: 4.4, hemi: 0x9a4e4e, ground: 0x1c090c, moonCol: 0xff6a5a, tint: 'linear-gradient(180deg, rgba(170,20,30,0.28) 0%, rgba(48,2,8,0.34) 100%)' }
  },
  {
    id: 12, act: 3, name: '나락의 심연', sub: '검은 달이 떨어지는 자리', map: 'map12', tag: '올 클리어',
    goal: '열두 번의 도형, 쉼 없는 장판. 마지막 획으로 나락을 끊으세요.',
    tip: '마지막 귀물은 장판을 다섯 겹으로 깝니다 — 붉은 예고선을 보고 일섬으로 빠져나가세요.',
    time: 250, eliteAt: 125, bossAt: 196, bossShapes: 12,
    shapes: ['hline', 'vline', 'vee', 'bolt'], spiritCap: 4,
    opening: { n: 14, ring: [0.48, 1.0], brute: 4 },
    mix: [[0, { imp: 0.4, brute: 0.26, charger: 0.34 }], [14, { imp: 0.28, brute: 0.26, charger: 0.24, bomber: 0.22 }], [38, { imp: 0.2, brute: 0.24, charger: 0.22, bomber: 0.2, thrower: 0.14 }]],
    waves: [
      { t: 44, n: 44, mix: { imp: 0.3, brute: 0.28, charger: 0.42 }, r: [9, 12] },
      { t: 96, n: 48, mix: { imp: 0.24, brute: 0.26, charger: 0.26, bomber: 0.24 }, r: [9.5, 13], elite: 1 },
      { t: 150, n: 52, mix: { imp: 0.18, brute: 0.24, charger: 0.22, bomber: 0.2, thrower: 0.16 }, r: [9.5, 13.5], elite: 1 }
    ],
    spawn: { ms: 460, max: 58, earlyMax: 15, earlyMinMs: 860 },
    boss: { telegraph: 0.8, charge: 25, adds: 4, hazard: 5 },
    starCombo: 58,
    atmo: { clear: 0x2a0709, fogCol: [46, 6, 10], fog: 0.042, moon: 22.0, amb: 6.6, hemiI: 5.2, fill: 4.6, hemi: 0xa84a48, ground: 0x22060a, moonCol: 0xff4a3c, tint: 'linear-gradient(180deg, rgba(190,12,24,0.32) 0%, rgba(54,0,6,0.38) 100%)' }
  }
];
function actOf(n) { return Math.max(1, Math.min(3, Math.ceil((n | 0) / 4))); }
const ACT_NAMES = { 1: '폐허의 도성', 2: '안개 산사', 3: '혈월의 나락' };
function stageOf(n) { return STAGES[clamp((n | 0) || 1, 1, STAGES.length) - 1]; }
function curStage() { return (S && S.stage) || stageOf(save.stage || 1); }
function stageWaves() { const st = curStage(); return (st && st.waves) || CFG.waves || []; }
function stageBoss() { const st = curStage(); return (st && st.boss) || {}; }
/* 한 판의 제한 시간(스테이지별). 적 성장·포위 가속의 기준. */
function runLimit() { return (S && S.stage && S.stage.time) || CFG.timeLimit; }
/* 보스 결계(아레나): 보스가 살아 있는 동안만 성립한다. */
function arenaActive() { return !!(S && S.arena && S.boss && S.boss.alive); }
function arenaR() { return (S && S.arena && S.arena.r) || (CFG.arenaR || 12); }

function $(id) { return document.getElementById(id); }
function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
function dist(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.hypot(dx, dz); }
function now() { return performance.now(); }

const save = { coins: 0, atkLv: 0, hpLv: 0, coinLv: 0, cleared: 0, lastSeen: Date.now(), best: 0, runs: 0, stage: 1, stars: {}, bestScore: 0 };
const qa = { timeScale: 1, noDelay: false, sandbox: false, noMove: false };
let S = null, art = null, three = null, raf = 0, lastTs = 0, toastT = 0;
const audio = createAudio();
let idlePending = 0;
const pointers = { down: false, id: null, pts: [] };
const fps = { samples: [], last: 0 };
let lastStroke = null, inkFade = 0;

function costOf(lv) { return CFG.upgradeBase * (lv + 1); }
function atkBonus() { return Math.min(CFG.maxLv, save.atkLv) * CFG.atkStep; }
function maxHp() { return CFG.hpBase + save.hpLv * CFG.hpStep + (S && S.runHp || 0); }
function coinMult() { return 1 + save.coinLv * CFG.coinStep + (S && S.runCoin || 0); }
/* Dash damage = (base + upgrades) x combo x meta attack. */
function dashDmg() {
  const base = (S && S.dashDmg) || CFG.dashDmg;
  const combo = 1 + (CFG.comboMulStep || 0) * Math.min(CFG.comboMulCap || 20, (S && S.combo) || 0);
  return base * combo * (1 + atkBonus());
}
function pathR() {
  let r = (S && S.pathR) || CFG.pathRadius;
  return r;
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    ['coins', 'atkLv', 'hpLv', 'coinLv', 'cleared', 'lastSeen', 'best', 'runs', 'stage', 'stars', 'bestScore'].forEach(function (k) {
      if (o[k] != null) save[k] = o[k];
    });
    if (!save.stars || typeof save.stars !== 'object') save.stars = {};
    save.stage = clamp(save.stage | 0 || 1, 1, STAGES.length);
  } catch (e) {}
}
function persist(touch) {
  if (touch !== false) save.lastSeen = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}

function showOv(id) {
  ['ov-title', 'ov-shop', 'ov-result', 'ov-idle', 'ov-level', 'ov-stage'].forEach(function (k) {
    $(k).classList.toggle('show', k === id);
  });
  if (id === 'ov-title') refreshTitleHelp();
}
function hideOvs() {
  ['ov-title', 'ov-shop', 'ov-result', 'ov-idle', 'ov-level', 'ov-stage'].forEach(function (k) { $(k).classList.remove('show'); });
}
function toast(msg) {
  const el = $('toast');
  el.hidden = false; el.textContent = msg;
  toastT = now() + 1600;
}
function fillHp() {
  const n = maxHp(), cur = S ? S.hp : n;
  let h = '', i;
  for (i = 0; i < n; i++) h += '<i' + (i < cur ? '' : ' class="off"') + '></i>';
  $('hpPips').innerHTML = h;
}
function xpNeed(lv) { return CFG.xpBase + (lv - 1) * CFG.xpStep; }
function renderHud() {
  if (!S) {
    $('timer').textContent = '—';
    $('dashLabel').textContent = '일섬 1';
    $('coinLabel').textContent = '엽전 ' + save.coins;
    $('lvlLabel').textContent = 'Lv —';
    if ($('comboLabel')) { $('comboLabel').textContent = '콤보 0'; $('comboLabel').classList.remove('hot'); }
    $('xpFill').style.width = '0%';
    renderCharge();
    fillHp();
    return;
  }
  $('timer').textContent = Math.max(0, Math.ceil(S.timeLeft));
  const permElem = S.dashElem;
  const temp = (S.tempElem && S.tempElem.t > 0) ? S.tempElem : null;
  const elemLvBit = (permElem && elemLv(permElem) > 1) ? ('Lv' + elemLv(permElem)) : '';
  const permBit = permElem ? ('·' + elemNameOf(permElem) + elemLvBit) : '';
  const tempBit = temp ? ((permElem ? ' +' : '·') + elemNameOf(temp.el) + Math.ceil(temp.t) + 's') : '';
  const bellBit = S.bellT > 0 ? (' 종' + (SHAPE_MARK[S.bellShape] || '') + Math.ceil(S.bellT) + 's') : '';
  $('dashLabel').textContent = '일섬 ' + S.dashCount + permBit + tempBit + bellBit;
  $('coinLabel').textContent = '엽전 ' + save.coins;
  $('lvlLabel').textContent = 'Lv ' + S.level;
  if ($('comboLabel')) {
    $('comboLabel').textContent = '콤보 ' + (S.combo || 0);
    $('comboLabel').classList.toggle('hot', (S.combo || 0) >= 4);
  }
  $('stageLabel').textContent = S.sandbox ? '연습' : (S.stage ? (S.stageNo + '장 ' + S.stage.name) : '심안');
  if (S.boss && S.boss.alive) $('stageLabel').textContent = '보스';
  $('xpFill').style.width = Math.min(100, (S.xp / xpNeed(S.level)) * 100) + '%';
  renderCharge();
  fillHp();
}
function renderCharge() {
  const w = $('chargeWrap'), t = $('chargeText');
  if (!w) return;
  const max = CFG.cleaveCharge || 100;
  const c = (S && S.charge) || 0;
  w.classList.toggle('full', c >= max);
  $('chargeFill').style.width = Math.min(100, (c / max) * 100) + '%';
  if (t) t.textContent = c >= max ? '참 준비' : '참 ' + Math.floor(c);
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
    return art.applyMap(three.scene, want, three.map, { stage: st }).then(function (m) {
      three.map = m;
      three.torches = [];
      if (three.atmo) { try { three.atmo.dispose(); } catch (e) {} }
      try { three.atmo = new StageAtmosphere(three.scene, st, m); } catch (e) { three.atmo = null; }
      setupChunkWorld(st, m.id);
      if (S) { S.mapId = m.id; S.mapStage = st; }
      applyFxinkAtmo(m.id);
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
    three.chunks.update(0, 0, (S && S.hero) ? S.hero.x : 0, (S && S.hero) ? S.hero.z : 0);
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
  /* 모바일 60fps: 기기 DPR을 2까지만 쓰고, 프레임이 무너지면 1까지 내린다. */
  const dprCap = DPR_QUERY || Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dprCap);
  renderer.setSize(view.clientWidth, view.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const clear = nightColor();
  renderer.setClearColor(clear, 1);
  view.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(clear);
  scene.fog = new THREE.FogExp2(clear, 0.007);

  const camera = new THREE.PerspectiveCamera(CFG.fov || 38, view.clientWidth / Math.max(1, view.clientHeight), 0.1, 200);
  camera.position.set(CFG.camOff.x, CFG.camOff.y, CFG.camOff.z);
  camera.lookAt(0, CFG.camLookY, 0);

  const amb = new THREE.AmbientLight(0x3a3834, 1.0);
  scene.add(amb);
  const hemi = new THREE.HemisphereLight(0x6a6860, 0x1a1612, 1.0);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xc8c0b0, 1.45);
  moon.position.set(-18, 28, 10);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -30; moon.shadow.camera.right = 30;
  moon.shadow.camera.top = 30; moon.shadow.camera.bottom = -30;
  moon.shadow.camera.near = 1; moon.shadow.camera.far = 90;
  moon.shadow.bias = -0.0011;
  moon.shadow.normalBias = 0.045;
  moon.target.position.set(0, 0, 0);
  scene.add(moon);
  scene.add(moon.target);
  /* 그림자 진 곳을 죽이지 않는 반대편 달빛(그림자 없음) — 먹 그림자가 검은 구멍이 되지 않게. */
  const fill = new THREE.DirectionalLight(0x93a0b8, 0.85);
  fill.position.set(14, 12, -16);
  scene.add(fill);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 16),
    new THREE.MeshBasicMaterial({ color: clear, side: THREE.BackSide })
  );
  scene.add(sky);

  const map = await art.applyMap(scene, 'map1', null, { stage: 1 });
  const world = {
    renderer: renderer, scene: scene, camera: camera, map: map, torches: [], fx: [], slashes: [],
    view: view, fxForced: fxQForced, amb: amb, hemi: hemi, moon: moon, fill: fill, sky: sky, baseClear: clear,
    dprCap: dprCap, dprNow: dprCap, atmo: new StageAtmosphere(scene, 1, map)
  };
  try {
    world.bloom = setupBloom(renderer, scene, camera, {
      quality: fxQ,
      post: function () { return [createInkWashPass(), createCinematicPass()]; }
    });
  } catch (e) { world.bloom = null; }
  try {
    world.ink = new InkParticles(scene, { base: FXINK_BASE, quality: fxQ === 'high' ? 'high' : 'low' });
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
  return world;
}

/* One quality ladder for the whole look. Going down: shadows off, bloom low, then resolution in steps.
   Going up again when the frame rate has recovered, so a hitch early in a run does not leave the
   screen soft for the rest of it. A level that drops again within 10 s of being restored is locked. */
const QL_LEVELS = 5;
function applyQuality(level) {
  const w = three; if (!w) return;
  const shadows = level < 1;
  if (w.moon && w.moon.castShadow !== shadows) w.moon.castShadow = shadows;
  const bq = level < 2 ? fxQualityFromUrl() : 'low';
  if (w.bloom && w.bloom.quality !== bq && bq !== 'off') {
    w.bloom.setQuality(bq);
    if (w.ink) w.ink.setQuality(bq === 'high' ? 'high' : 'low');
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

function addEntityVisual(kind, shape) {
  const group = art.makeChar ? art.makeChar(kind, shape) : new THREE.Group();
  if (!art.makeChar) {
    const spr = spriteMat((art.item && art.item[kind]) || art.hero, kind === 'hero' ? 2.7 : 2.2);
    group.add(spr);
  }
  three.scene.add(group);
  return group;
}
function placeGroup(g, x, z, bob) {
  g.position.set(x, bob || 0, z);
}

/* ---------- game state ---------- */
function startRun(opts) {
  opts = opts || {};
  const stageNo = opts.sandbox ? 1 : clamp((opts.stage != null ? opts.stage : (save.stage || 1)) | 0, 1, STAGES.length);
  const st = stageOf(stageNo);
  hideOvs();
  clearEntities();
  S = {
    playing: true, paused: null, won: false, lost: false, sandbox: !!opts.sandbox,
    stage: st, stageNo: opts.sandbox ? 0 : stageNo,
    hp: CFG.hpBase + save.hpLv * CFG.hpStep, runHp: 0, runCoin: 0,
    timeLeft: opts.time != null ? opts.time : st.time, elapsed: 0,
    dashCount: CFG.dashCount, dashDmg: CFG.dashDmg, pathR: CFG.pathRadius,
    xp: 0, level: 1, iframe: 0, boss: null, bossSpawned: false,
    hero: { x: 0, z: 0 },
    spirits: [], zombies: [], items: [],
    zAcc: 0, sAcc: 0, _id: 0,
    dash: null, dashQueue: [], lastDash: null, shake: 0,
    cam: { x: 0, z: 0 },
    dashElem: null, elemLv: {}, tempElem: null, dashQuality: 0, bellT: 0, bellShape: null, slowT: 0,
    mapId: mapIdOf(opts.stage != null ? opts : Object.assign({}, opts, { stage: stageNo })),
    mapStage: opts.sandbox ? 1 : stageNo,
    runNo: 1, pool: SHAPE_UNLOCK.slice(), practiceT: 0, practiceShape: null, practiceSpawns: 0,
    combo: 0, comboIdle: 0, comboMax: 0, kills: 0, coin0: save.coins,
    bursts: [], lastBurst: 0,
    sightWave: 0, lastStrokeDir: null,
    hitstop: 0, hurtFlash: 0, aimTarget: null, bellPans: [], recoil: null,
    ringR: 0, ringLv: 0, bounce: null, landRipple: null,
    spiritCap: opts.sandbox ? CFG.spiritCapStart : Math.max(1, st.spiritCap || CFG.spiritCapStart),
    /* v0.15~v0.17: 참 게이지·패링·선입력·웨이브·자석·진화 */
    charge: 0, chargeLv: 0, magnetR: CFG.magnetR || 1.8,
    parryCd: 0, parryFlash: 0, parryHits: [], cleaveFx: 0, cleaveCount: 0,
    inputBuf: null, comboGrace: 0,
    waveDone: {}, waveBoostT: 0, waveIds: [], wavesFired: [], fogPulse: 0, noMarkT: 0,
    evo: {}, evolved: [], preview: null, lastAxis: 'vline',
    /* v0.22: 무한 청크·묵항아리·보스 결계·진화 레벨 */
    upLv: {}, jarsBroken: 0, hazardSeq: 0, shots: [], hazards: [], arena: null, arenaFx: 0, eliteDone: false, eliteAt: st.eliteAt || 0
  };
  S.runNo = opts.sandbox ? SHAPE_UNLOCK.length : stageNo;
  S.pool = opts.sandbox ? SHAPE_UNLOCK.slice() : (st.shapes || SHAPE_UNLOCK.slice()).slice();
  if (!opts.sandbox) {
    /* 스테이지의 새 획을 먼저 연습할 시간을 준다(첫 10초는 잔몹 상한 2). */
    S.practiceShape = S.pool[S.pool.length - 1];
    S.practiceT = CFG.practiceSec;
    S.practiceSpawns = CFG.practiceSpawns;
    save.runs = (save.runs || 0) + 1;
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
  if (three && three.chunks) three.chunks.reset(0, 0);
  renderHud();
  lastTs = 0;
  if (audio) { audio.setQuiet(qa.mute, qa.noDelay); audio.startBgm(); }
  if (!opts.sandbox) {
    spawnOpening();
    snapSpiritsToTargets();
  }
  triggerSightWave();
  if (!raf) loop(now());
}

function clearEntities() {
  if (!S || !three) return;
  function rm(list) { list.forEach(function (e) { if (e.obj) three.scene.remove(e.obj); }); }
  rm(S.spirits || []); rm(S.zombies || []); rm(S.items || []);
  (three.dying || []).forEach(function (d) { three.scene.remove(d.obj); });
  three.dying = [];
  inkFx.clear();
  (three.fx || []).forEach(function (f) { three.scene.remove(f.mesh); });
  three.fx = [];
  if (three.ink && three.ink.clear) three.ink.clear();
  (three.slashes || []).forEach(function (s) {
    if (s.mesh) three.scene.remove(s.mesh);
    if (s.dispose) s.dispose();
  });
  three.slashes = [];
  (S.shots || []).forEach(function (sh) { if (sh.mesh) three.scene.remove(sh.mesh); });
  (S.hazards || []).forEach(function (h) { if (h.mesh) three.scene.remove(h.mesh); });
  S.shots = []; S.hazards = [];
}

function livingMarks() {
  if (!S) return [];
  return (S.spirits || []).filter(function (s) { return s.alive; });
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
function worldRingRFromScreen() { return fitGroundRingR(); }
function baseRingR() { return fitGroundRingR(); }
function capRingR(r) { return Math.max(1.4, r); }
function ringR() {
  if (S && S.ringR > 0) return S.ringR;
  return baseRingR();
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
    + ',' + (cam ? cam.fov : 0) + ',' + (typeof innerWidth === 'number' ? innerWidth : 0);
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
function shapeCount(sh) {
  return livingMarks().filter(function (s) { return spiritShape(s) === sh; }).length;
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
/* 프레임당 한 번만 레이아웃을 읽는다(isOnScreen가 수십 번 불려도 리플로를 반복하지 않게). */
let _frameId = 0, _rectCache = { id: -1, r: null };
function hostRect() {
  if (_rectCache.id === _frameId) return _rectCache.r;
  const host = $('app') || $('ink');
  _rectCache = { id: _frameId, r: host ? host.getBoundingClientRect() : { width: 375, height: 667 } };
  return _rectCache.r;
}
function livingThreats() {
  if (!S) return [];
  return (S.zombies || []).filter(function (z) { return z.alive; });
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
    const near = zs.slice().sort(function (a, b) { return dist(a, S.hero) - dist(b, S.hero); })[0];
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
    const host = $('app') || $('ink');
    const w = host ? host.getBoundingClientRect().width : 375;
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
  const R = ringR();
  const cap = Math.min(CFG.spiritMax || 5, S.spiritCap || CFG.spiritCapStart || 3);
  const outR = R * (CFG.spiritReleaseMul || 1.15);
  const inR = R * (CFG.spiritAcquireMul || 0.95);
  /* 1) 대상이 죽었거나 안개 밖(1.15R)으로 벗어난 혼령은 즉시 회수한다. */
  livingMarks().forEach(function (s) {
    if (s.free) return;
    if (!s.target || !s.target.alive) { destroySpirit(s); return; }
    if (dist(s.target, S.hero) > outR * (s.far ? 1.9 : 1)) { releaseSpirit(s); return; }
  });
  /* 2) 화면 밖으로 나간 대상은 '화면 안 대체 대상'이 있을 때만 회수한다(획득-회수 진동 방지). */
  const heldNow = livingMarks().filter(function (s) { return !s.free && s.target && s.target.alive; }).map(function (s) { return s.target; });
  const onFree = screenThreats().filter(function (z) { return z.alive && heldNow.indexOf(z) < 0; });
  if (onFree.length) {
    livingMarks().forEach(function (s) {
      if (s.free || !s.target || !s.target.alive) return;
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
  if (!boss || !boss.alive) return;
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
  const a = (CFG.spiritAlpha || 0.9) * clamp((s.age || 0) / (CFG.spiritFadeIn || 0.4), 0, 1);
  if (ud.sprite && ud.sprite.material) { ud.sprite.material.transparent = true; ud.sprite.material.opacity = a; }
  if (ud.glow && ud.glow.material) ud.glow.material.opacity = (CFG.spiritGlowAlpha || 0.5) * a;
  if (ud.outline && ud.outline.material) ud.outline.material.opacity = 0.7 * a;
}
/* A spirit bound to a zombie hovers over its head and follows it; free (test) spirits stay on the ring. */
function placeSpirit(s) {
  const z = s.target;
  if (!z || !z.alive || s.free) { placeSpiritOnRing(s); return; }
  const ud = (z.obj && z.obj.userData) || {};
  const zh = ud.worldH || 2.4;
  let bob = zh * (CFG.spiritHover || 0.62);
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
  setSpiritAlpha(e);
  if (e.target) ringSpiritBell(e);
  return e;
}
function spawnBoss(opts) {
  opts = opts || {};
  const ring = CFG.zombieRing || [10, 14];
  const p = opts.x != null ? { x: opts.x, z: opts.z } : ringPos(opts.r || 16);
  const seq = opts.seq || pickSeq(opts.nShapes || CFG.bossShapes);
  const e = {
    id: ++S._id, kind: 'zombie', shape: seq[0], x: p.x, z: p.z, r: 1.1,
    alive: true, hp: opts.hp != null ? opts.hp : 99,
    frozen: 0, burn: 0, burnTick: 0, poison: 0, poisonT: 0, poisonTick: 0, stun: 0,
    marked: false, isBoss: true, seq: seq, seqI: 0
  };
  const vis = e.shape;
  e.obj = addEntityVisual('boss', vis);
  placeGroup(e.obj, e.x, e.z);
  S.zombies.push(e);
  S.boss = e; S.bossSpawned = true;
  /* v0.22 보스 결계: 잡몹을 걷어내고, 영웅을 중심으로 원형 아레나를 세운다. */
  clearFieldForBoss();
  openArena(S.hero.x, S.hero.z);
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
  const group = new THREE.Group();
  group.name = 'boss-arena';
  const ringGeo = new THREE.RingGeometry(r - 0.42, r, 128, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff6a3a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.06;
  ring.renderOrder = 4;
  group.add(ring);
  const innerGeo = new THREE.RingGeometry(r * 0.94, r * 0.955, 96, 1);
  innerGeo.rotateX(-Math.PI / 2);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xffd7a0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.position.y = 0.07;
  inner.renderOrder = 4;
  group.add(inner);
  /* 결계 벽: 바닥에서 솟은 먹빛 원기둥(은은한 발광) */
  const wallGeo = new THREE.CylinderGeometry(r, r, 2.8, 96, 1, true);
  const wallMat = new THREE.MeshBasicMaterial({
    color: 0xff7040, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 1.4;
  wall.renderOrder = 4;
  group.add(wall);
  group.position.set(S.arena.x, 0, S.arena.z);
  three.scene.add(group);
  three.arena = { group: group, ring: ring, inner: inner, wall: wall, ringMat: ringMat, innerMat: innerMat, wallMat: wallMat, t: 0 };
  return S.arena;
}
function closeArena(instant) {
  if (three && three.arena) {
    const a = three.arena;
    three.scene.remove(a.group);
    a.group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    three.arena = null;
  }
  if (S) S.arena = null;
}
function stepArena(dt) {
  const a = three && three.arena;
  if (!a) return;
  a.t += dt || 0;
  const p = 0.55 + 0.45 * Math.sin(a.t * 2.7);
  a.ringMat.opacity = 0.55 + 0.3 * p;
  a.innerMat.opacity = 0.3 + 0.3 * p;
  a.wallMat.opacity = 0.14 + 0.16 * p;
  const s = 1 + 0.006 * Math.sin(a.t * 3.3);
  a.ring.scale.set(s, 1, s);
  a.inner.scale.set(2 - s, 1, 2 - s);
}
function spawnZombie(opts) {
  opts = opts || {};
  const zr = CFG.zombieRing || [10, 14];
  const p = opts.x != null ? { x: opts.x, z: opts.z } : ringPos(opts.r != null ? opts.r : (zr[0] + Math.random() * (zr[1] - zr[0])));
  const type = opts.type || pickZombieType();
  const def = CFG.zombieTypes[type] || CFG.zombieTypes.imp;
  const grow = 1 + (CFG.hpGrowth || 0) * clamp(S.elapsed / runLimit(), 0, 1);
  const e = {
    id: ++S._id, kind: 'zombie', type: type, x: p.x, z: p.z, r: def.r, alive: true,
    hp: opts.hp != null ? opts.hp : def.hp * grow, maxHp: def.hp * grow,
    frozen: 0, burn: 0, burnTick: 0, poison: 0, poisonT: 0, poisonTick: 0, stun: 0,
    marked: false, shape: null, isBoss: false, elite: type === 'elite'
  };
  e.obj = addEntityVisual('zombie', type);
  placeGroup(e.obj, e.x, e.z);
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
  if (audio && !qa.mute) audio.hit();
  S.shake = Math.max(S.shake || 0, 0.18);
  const kind = pickJarDrop();
  spawnItem({ type: kind, x: j.x, z: j.z });
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
      cutBoss(z);
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
  /* 마지막에 깨운 스테이지가 이미 깨졌으면 새로 열린 장을 기본 선택으로 보여 준다. */
  if (titleSel == null) titleSel = clamp(save.stage || 1, 1, STAGES.length);
  else if (((save.stars || {})[titleSel] || 0) > 0 && (save.stage || 1) > titleSel) titleSel = clamp(save.stage, 1, STAGES.length);
  const el = $('titleShapes') || document.querySelector('.shapes-help');
  const sel = clamp((titleSel != null ? titleSel : (save.stage || 1)) | 0, 1, STAGES.length);
  const st = stageOf(sel);
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
      + (save.bestScore ? ' · 최고 ' + save.bestScore : '');
  }
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
function fillStageIntro(st) {
  $('stageKicker').textContent = '제 ' + st.id + ' 장';
  $('stageName').textContent = st.name;
  $('stageSub').textContent = st.sub;
  $('stageGoal').textContent = st.goal;
  $('stageChips').innerHTML = (st.shapes || []).map(function (sh) {
    const isNew = sh === (st.shapes || [])[(st.shapes || []).length - 1];
    return '<i class="' + (isNew ? 'new' : '') + '">' + (SHAPE_MARK[sh] || sh) + '</i>';
  }).join('');
  $('stageTip').textContent = st.tip || '';
  const b = $('btnStageGo');
  if (b) b.textContent = '일섬';
}
function beginStage(n) {
  const st = stageOf(n);
  titleSel = st.id;
  fillStageIntro(st);
  showOv('ov-stage');
  if (audio && audio.startBgm) { try { audio.startBgm(); } catch (e) {} }
  pendingStage = { no: st.id, until: now() + (qa.noDelay ? 0 : 2600), at: now() };
  return st.id;
}
function goStageNow() {
  if (!pendingStage) return null;
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
  const host = $('app') || $('ink');
  const r = host.getBoundingClientRect();
  if (!_proj.v) _proj.v = new THREE.Vector3();
  _proj.v.set(x, y == null ? 0.4 : y, z).project(three.camera);
  return { x: (_proj.v.x * 0.5 + 0.5) * r.width, y: (-_proj.v.y * 0.5 + 0.5) * r.height };
}
function viewBox() {
  const host = $('app') || $('ink');
  return host ? host.getBoundingClientRect() : { width: 375, height: 667, left: 0, top: 0 };
}
function heroScreen() {
  const y = (three && three.heroSpr && three.heroSpr.userData && three.heroSpr.userData.worldH)
    ? three.heroSpr.userData.worldH * 0.45 : 0.85;
  return projectXZ(S.hero.x, S.hero.z, y);
}
function screenRingPx() {
  const box = viewBox();
  const lv = (S && S.ringLv) || 0;
  let frac = (CFG.ringScreenFrac || 0.70) * (1 + (CFG.ringBoost || 0.14) * lv);
  const capFrac = CFG.ringMaxFrac || 0.90;
  const diam = Math.min(box.width * frac, Math.min(box.width, box.height) * capFrac);
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
  if (s.isBoss) k += 30;
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
function farthestSpirits(shape, n, from) {
  return pickSpirits(shape, n, from, S && S.lastStrokeDir);
}
function spiritShape(s) {
  if (!s) return null;
  if (S && S.bellT > 0 && S.bellShape) return S.bellShape;
  if (s.kind === 'spirit' && s.target && s.target.isBoss && s.target.alive && s.target.seq) {
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
  return S.dashElem;
}
function elemIceDur() { return (CFG.iceDur || 2.5) + (CFG.iceDurStep || 0.5) * Math.max(0, elemLv('ice') - 1); }
function elemShatterDmg() { return (CFG.shatterDmg || 4) + (CFG.shatterStep || 1) * Math.max(0, elemLv('ice') - 1); }
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
  const min = CFG.markMinCss || 28;
  const max = CFG.markMaxCss || 36;
  return clamp(Math.round(min * Math.sqrt((w || 375) / 375)), min, max);
}

/* Soul stream: a blurred jade wisp flows from each spirit into the hero, as if being drawn in. */
function drawSoulStreams(ctx) {
  const t = (S.elapsed || 0);
  const hs = heroScreen();
  livingMarks().forEach(function (sp, si) {
    if (!sp.target || !sp.target.alive || !sp.obj) return;
    const a0 = (CFG.spiritStreamAlpha || 0.7) * clamp((sp.age || 0) / (CFG.spiritFadeIn || 0.4), 0, 1);
    const from = screenOf(sp);
    const dx = hs.x - from.x, dy = hs.y - from.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const bend = Math.min(40, L * 0.18) * (si % 2 ? 1 : -1);
    const cx = (from.x + hs.x) / 2 + nx * bend, cy = (from.y + hs.y) / 2 + ny * bend;
    function at(u) {
      const v = 1 - u, w = Math.sin(u * Math.PI * 3 - t * 6 + si) * 6 * (1 - u);
      return { x: v * v * from.x + 2 * v * u * cx + u * u * hs.x + nx * w, y: v * v * from.y + 2 * v * u * cy + u * u * hs.y + ny * w };
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    /* Hazy ribbon, wide at the spirit and thin at the hero. */
    for (let k = 0; k < 24; k++) {
      const u = k / 23, p = at(u), r = 10 * (1 - u) + 2;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, 'rgba(46,230,166,' + (a0 * 0.16).toFixed(3) + ')'); g.addColorStop(1, 'rgba(46,230,166,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    /* Wisps drifting toward the hero, shrinking as they are drawn in. */
    for (let k = 0; k < 5; k++) {
      const u = ((t * 0.55 + k / 5 + si * 0.13) % 1);
      const p = at(u), r = 7 * (1 - u * 0.7);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.2);
      const wa = a0 * Math.sin(Math.PI * u);
      g.addColorStop(0, 'rgba(226,255,244,' + (wa * 0.9).toFixed(3) + ')');
      g.addColorStop(0.4, 'rgba(46,230,166,' + (wa * 0.45).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(46,230,166,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - r * 2.2, p.y - r * 2.2, r * 4.4, r * 4.4);
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
/* 드로잉 프리뷰: 인식 중인 기호의 잉크 색 */
const INK_OF = { hline: '#5BE8C4', vline: '#E8654A', vee: '#B48CE8', bolt: '#E8C04A', circle: '#E8C04A', tap: '#F2EAD6' };
function inkColorFor(type) { return INK_OF[type] || '#6B6B6B'; }
function updateMarks() {
  const c = $('marks');
  if (!c) return;
  const host = $('app') || $('view') || c;
  const r = host.getBoundingClientRect();
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
  lastMarkMetrics = { cssPx: size, minCss: CFG.markMinCss || 40, w: r.width, h: r.height, marks: [] };
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
  drawSoulStreams(ctx);
  const placed = [];
  const arrows = [];
  const aimId = S.aimTarget && S.aimTarget.alive ? S.aimTarget.id : null;
  /* The boss's shape order rides on its spirit's bell; the boss itself carries no mark. */
  const bossSpirit = (S.boss && S.boss.alive) ? livingMarks().filter(function (s) { return s.target === S.boss; })[0] : null;
  livingMarks().forEach(function (s) {
    if (!s.obj) return;
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
      shape: spiritShape(s), boss: !!s.isBoss, id: s.id, aim: s.id === aimId,
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
    }
  });
  lastMarkMetrics.arrows = arrows;
  lastMarkMetrics.markStyle = 'ink';
  if (placed.length) {
    lastMarkMetrics.cssPx = placed.reduce(function (m, p) { return Math.max(m, p.cssPx || 0); }, 0) || size;
    lastMarkMetrics.bellPx = placed.reduce(function (m, p) { return Math.max(m, p.bellPx || 0); }, 0);
    lastMarkMetrics.bodyPx = placed.reduce(function (m, p) { return Math.max(m, p.bodyPx || 0); }, 0);
  }
  placed.forEach(function (m) {
    /* 기호는 혼령 텍스처에 구워져 3D 월드에서 렌더링된다. 2D 레이어에는 보스의 도형 순서만 남긴다. */
    if (!(m.seq && m.seq.length)) return;
    const x = m.x, y = m.y;
    const gsize = m.cssPx || size;
    ctx.save();
    const gap = CFG.seqDotGap || 16; /* fixed: dots are 10-14px wide whatever the glyph size */
    const rowW = (m.seq.length - 1) * gap;
    const rowX = clamp(x - rowW * 0.5, 10, r.width - 10 - rowW);
    const rowY = clamp(y - gsize * 0.5 - 10, 90, r.height - 10);
    m.seq.forEach(function (seqSh, i) {
      const done = i < m.seqI;
      const cur = i === m.seqI;
      const px = rowX + i * gap;
      ctx.beginPath(); ctx.arc(px, rowY, cur ? 7 : 5, 0, 7);
      ctx.fillStyle = done ? 'rgba(80,70,60,0.7)' : (cur ? '#E8C04A' : 'rgba(244,232,208,0.85)');
      ctx.fill();
      ctx.fillStyle = '#0E0C0A';
      ctx.font = '700 9px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(SHAPE_MARK[seqSh] || '', px, rowY + 0.5);
    });
    ctx.restore();
  });
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
    const tgt = livingMarks().filter(function (s) { return s.id === aimId; })[0];
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
  /* 4) 보스 돌진 예고선: 붉은 붓글씨 돌진선 */
  const b = S.boss;
  if (b && b.alive && b.state === 'telegraph' && b.aim) {
    const dx = b.aim.x - b.x, dz = b.aim.z - b.z, L = Math.hypot(dx, dz) || 1;
    const a = projectXZ(b.x, b.z, 0.12);
    const bt = bossTiming(), reach = bt.chargeSp * bt.chargeT;
    const e = projectXZ(b.x + dx / L * reach, b.z + dz / L * reach, 0.12);
    const tf = clamp((b.stateT || 0) / bt.teleT, 0, 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(200,40,30,' + (0.30 + 0.45 * tf).toFixed(2) + ')';
    ctx.lineWidth = Math.max(6, worldPerCss() * 1.2);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (e.x - a.x) * tf, a.y + (e.y - a.y) * tf); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,120,90,0.55)';
    ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
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
  /* 8) 지금 일섬에 실린 원소: 주인공 발밑 오라, 바닥 부적은 남은 시간 고리 */
  drawHeroElement(ctx, t);
  /* 9) 체력이 깎인 원귀의 체력 막대 (심안 안이거나 혼령이 붙은 적만) */
  drawEnemyBars(ctx);
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
}
function drawHeroElement(ctx, t) {
  const el = curElem();
  if (!el || !S.hero) return;
  const c = FX_COLORS[el] || FX_COLORS.jade;
  const R = 0.9;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2, w = 1 + 0.08 * Math.sin(a * 5 + t * 6);
    const p = projectXZ(S.hero.x + Math.cos(a) * R * w, S.hero.z + Math.sin(a) * R * w, 0.05);
    if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
  }
  ctx.strokeStyle = 'rgba(' + c.join(',') + ',0.75)'; ctx.lineWidth = 2.5; ctx.stroke();
  /* rising motes: flames, ice glints or bubbles share one look, coloured by element */
  for (let i = 0; i < 6; i++) {
    const u = ((t * 0.8 + i / 6) % 1), a = i * 1.05 + t * 0.5;
    const p = projectXZ(S.hero.x + Math.cos(a) * R * 0.8, S.hero.z + Math.sin(a) * R * 0.8, 0.1 + u * 1.6);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 5);
    g.addColorStop(0, 'rgba(' + c.join(',') + ',' + (0.9 * (1 - u)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + c.join(',') + ',0)');
    ctx.fillStyle = g; ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
  }
  ctx.restore();
  if (S.tempElem && S.tempElem.t > 0) {
    const f = clamp(S.tempElem.t / (CFG.tempElemDur || 12), 0, 1);
    const hp = projectXZ(S.hero.x, S.hero.z, 2.3);
    ctx.save();
    ctx.beginPath(); ctx.arc(hp.x, hp.y, 9, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,7,9,0.6)'; ctx.fill();
    ctx.beginPath(); ctx.arc(hp.x, hp.y, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
    ctx.strokeStyle = 'rgba(' + c.join(',') + ',0.95)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
}
function drawEnemyBars(ctx) {
  const R = ringR() * 1.05;
  const t = S.elapsed || 0;
  /* Status motes for kinds without their own status art (brute, stone, elites): flames, frost glints, bubbles. */
  S.zombies.forEach(function (z) {
    if (!z.alive || z.isBoss || z.type === 'imp') return;
    const el = z.frozen > 0 ? 'ice' : z.burn > 0 ? 'fire' : z.poison > 0 ? 'poison' : null;
    if (!el || dist(z, S.hero) > R * 1.2) return;
    const c = FX_COLORS[el], zh = (z.obj && z.obj.userData && z.obj.userData.worldH) || 2.4;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const u = ((t * (el === 'ice' ? 0.4 : 0.9) + i / 5 + z.id * 0.17) % 1);
      const p = projectXZ(z.x + Math.cos(i * 2.1) * (z.r || 0.6) * 0.8, z.z + Math.sin(i * 2.1) * (z.r || 0.6) * 0.8, zh * (0.15 + 0.5 * u));
      const rr = el === 'ice' ? 3 : 5;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
      g.addColorStop(0, 'rgba(' + c.join(',') + ',' + (0.9 * Math.sin(Math.PI * u)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + c.join(',') + ',0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
    }
    ctx.restore();
  });
  S.zombies.forEach(function (z) {
    if (!z.alive || z.isBoss || !(z.maxHp > 0) || z.hp >= z.maxHp - 0.01) return;
    const held = livingMarks().some(function (m) { return m.target === z; });
    if (!held && dist(z, S.hero) > R) return;
    const zh = (z.obj && z.obj.userData && z.obj.userData.worldH) || 2.4;
    const p = projectXZ(z.x, z.z, zh * 0.78);
    const w = 26, h = 4, f = clamp(z.hp / z.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(8,7,9,0.8)'; ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(214,48,34,0.95)'; ctx.fillRect(p.x - w / 2, p.y, w * f, h);
    ctx.restore();
  });
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
function ringSpiritBell(sp) {
  if (!audio || !sp) return;
  audio.setQuiet(qa.mute, qa.noDelay);
  const host = $('app') || $('ink');
  const w = host ? host.getBoundingClientRect().width : 375;
  const scr = screenOf(sp);
  const pan = Math.max(-1, Math.min(1, (scr.x / Math.max(1, w)) * 2 - 1));
  audio.bell(pan, spiritShape(sp));
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
    const prev = three.bloom.quality === 'low' ? 0.5 : 0.6;
    three.bloom.setStrength(1.2);
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
/* Combo: a dash that cuts something within comboTimeout of the last one adds 1; a dash that cuts nothing resets it. */
function scoreDash(rec) {
  if (!S || !rec || rec.scored) return;
  rec.scored = true;
  if (!rec.targets || !rec.targets.length) return;
  /* A boss cut counts too, or the combo would sit at 0 for the whole boss fight. */
  const cut = rec.bossCut || (rec.hits || []).some(function (h) { return h.why === 'slash'; });
  if (!cut) { S.combo = 0; return; }
  S.combo = (S.combo || 0) + 1;
  S.comboIdle = 0;
  if (S.combo > (S.comboMax || 0)) S.comboMax = S.combo;
  if ((CFG.comboBurstAt || [4, 8, 12]).indexOf(S.combo) >= 0) triggerComboBurst(S.combo);
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
function clipBound(p) {
  if (!arenaActive()) return { x: p.x, z: p.z };
  const A = S.arena, R = arenaR() - (CFG.arenaEdge || 0.6);
  const dx = p.x - A.x, dz = p.z - A.z;
  const ro = Math.hypot(dx, dz);
  if (ro <= R) return { x: p.x, z: p.z };
  return { x: A.x + dx * R / ro, z: A.z + dz * R / ro };
}
/* 넉백·반동으로도 결계 밖으로 밀리지 않게 영웅을 다시 안으로 넣는다. */
function clampHeroToArena() {  if (!S || !S.hero || !arenaActive()) return false;
  const c = clipBound(S.hero);
  if (Math.abs(c.x - S.hero.x) < 1e-6 && Math.abs(c.z - S.hero.z) < 1e-6) return false;
  S.hero.x = c.x; S.hero.z = c.z;
  if (three && three.heroSpr) placeGroup(three.heroSpr, S.hero.x, S.hero.z);
  return true;
}
function dashEndPoint(from, tgt) {
  const dir = dashDirOf(tgt, from);
  const R = ringR();
  let len = R * (CFG.dashThroughMul || 1.5);
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
/* 선입력 버퍼 소비: 착지 0프레임에 예약된 획을 이어 붙인다. */
function consumeInputBuf() {
  if (!S || !S.inputBuf) return false;
  const b = S.inputBuf;
  S.inputBuf = null;
  /* 돌진 중에 예약된 획은 착지 직후(ttl 200ms + 여유) 소비된다. */
  if (now() - b.t0 > (b.ttl || 200) + 300) return false;
  if (!S.playing || S.paused) return false;
  if (b.type === 'circle') return false;
  S.comboGrace = Math.max(S.comboGrace || 0, 0.1);
  beginDash(b.type, { dir: b.dir, quality: b.quality });
  return true;
}
function beginDash(shape, opts) {
  opts = opts || {};
  if (!S || !S.playing || S.paused || S.dash) return null;
  const n = S.dashCount;
  const dir = ('dir' in opts) ? opts.dir : (S.lastStrokeDir || null);
  const targets = pickSpirits(shape, n, S.hero, dir, null);
  if (!targets.length) { toast('화면에 그 모양이 없어요'); return { type: shape, targets: [], hits: [], items: [] }; }
  S.dashQuality = (opts.quality != null) ? opts.quality : 0;
  const rec = { type: shape, targets: targets.map(function (t) { return t.id; }), hits: [], items: [], t0: now(), segs: [], elem: curElem(), cinematic: false, quality: S.dashQuality };
  S.dashSeq = (S.dashSeq || 0) + 1;
  S.lastDash = rec;
  S.dashQueue = targets.slice();
  /* Only the first cut of a one-bell spell is the slow cinematic; later cuts run at full speed. */
  if (S.bellT > 0 && S.bellShape === shape && targets.length && !S.bellCine) { S.bellCine = true; triggerCinematic(); }
  startSeg();
  return rec;
}
function startSeg() {
  if (!S.dashQueue.length) {
    S.dash = null; scoreDash(S.lastDash);
    consumeInputBuf();
    maybeEnd(); return;
  }
  const tgt = S.dashQueue.shift();
  if (!tgt.alive) { startSeg(); return; }
  const from = { x: S.hero.x, z: S.hero.z };
  const end = dashEndPoint(from, tgt);
  const to = { x: end.x, z: end.z };
  const raw = end.raw ? { x: end.raw.x, z: end.raw.z } : to;
  const slash = makeSlash(from, raw);
  S.dash = { from: from, to: to, raw: raw, t: 0, dur: CFG.dashDur, target: tgt, slash: slash, judged: false };
  S.iframe = Math.max(S.iframe || 0, CFG.dashDur + 0.05);
  S.shake = 0.28;
  S.lastDash.segs.push({ from: from, to: raw, r: pathR() });
  S.lastDash.vfxAt = S.lastDash.vfxAt || now();
  afterimages(from, to);
  if (audio) audio.slash();
  triggerSightWave();
}
function resolveDash(d) {
  if (!d || d.judged) return;
  d.judged = true;
  const hitTo = d.raw || d.to;
  applyPath(d.from, hitTo, S.lastDash, null);
  const boss = S && S.boss;
  /* Only a dash aimed at the boss (its spirit, so its current shape) advances the order; grazing it on the way to another spirit does not. */
  const aimed = d.target && (d.target === boss || d.target.target === boss);
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
  triggerSightWave();
  if (three && three.ink && three.ink.hit) {
    three.ink.hit(d.to.x, d.to.z, ux, uz);
    fxinkStat.hits++;
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
    if (!z.alive) return;
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
function doParry(rec) {
  if (!S || !S.playing || S.paused) return rec || null;
  const r = rec || { type: 'tap', targets: [], hits: [] };
  r.type = 'tap';
  r.targets = r.targets || [];
  r.hits = r.hits || [];
  if ((S.parryCd || 0) > 0) { r.parry = { hits: 0, cooling: true }; return r; }
  /* v0.23 칼집 각성: 패링이 충격파(반경·피해)와 참 게이지로 자란다. */
  const awaken = upLv('parry');
  const R = (CFG.parryR || 2.4) + (CFG.parryAwakenR || 0.45) * awaken;
  const hits = [];
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
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
  r.parry = { hits: hits.length };
  if (hits.length) {
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
    if (z.isBoss) { cutSpirit(z); return; }
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
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2 + (Math.random() - 0.5) * 0.24;
    const rad = Math.max(rr[0], R * 1.05) + Math.random() * Math.max(0.5, rr[1] - rr[0]);
    let roll = Math.random() * sum, type = 'imp';
    for (const k in mix) { roll -= mix[k]; if (roll <= 0) { type = k; break; } }
    const z = spawnZombie({ x: S.hero.x + Math.cos(a) * rad, z: S.hero.z + Math.sin(a) * rad, type: type });
    if (z) S.waveIds.push(z.id);
  }
  if (w.elite) {
    const ang = Math.random() * Math.PI * 2;
    const z = spawnZombie({ x: S.hero.x + Math.cos(ang) * rr[1], z: S.hero.z + Math.sin(ang) * rr[1], type: 'elite' });
    if (z) { z.elite = true; S.waveIds.push(z.id); }
  }
  S.waveBoostT = CFG.waveBoostSec || 8;
  S.fogPulse = 1;
  S.shake = Math.max(S.shake || 0, 0.6);
  triggerSightWave();
  if (audio && !qa.noDelay) {
    audio.drum();
    setTimeout(function () { if (audio) audio.drum(); }, 140);
    setTimeout(function () { if (audio) audio.drum(); }, 280);
  }
  showJudge('포위!');
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
  S.waveBoostT = Math.max(S.waveBoostT || 0, 3);
  S.shake = Math.max(S.shake || 0, 0.5);
  toast('정예 원귀가 부적 상자를 지고 옵니다');
  showJudge('정예 원귀');
  if (audio && !qa.noDelay) audio.drum();
  return 1;
}
/* 착지 자석: 반경 안의 바닥 아이템이 곡선으로 빨려온다. */
function magnetPull(at) {
  if (!S) return 0;
  const R = S.magnetR || CFG.magnetR || 1.8;
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
  const thresh = (CFG.perfectThresh || 0.80) - (CFG.perfectThreshStep || 0.05) * Math.max(0, pLv - 1);
  const perfect = pLv > 0 && quality >= thresh;
  const mul = perfect ? ((CFG.perfectDmgMul || 1.5) + (CFG.perfectStep || 0.15) * Math.max(0, pLv - 1)) : 1;
  const dmg = dashDmg() * mul;
  if (perfect && rec) { rec.perfect = true; showJudge('정확한 획'); }
  const dx = to.x - from.x, dz = to.z - from.z, L2 = dx * dx + dz * dz || 1;
  const hit = S.zombies.filter(function (z) {
    return z.alive && z !== skip && !z.isBoss && segDist(z.x, z.z, from.x, from.z, to.x, to.z) <= r + z.r;
  });
  /* Nearest along the cut takes full damage; each one after it a little less. */
  hit.sort(function (a, b) { return ((a.x - from.x) * dx + (a.z - from.z) * dz) / L2 - ((b.x - from.x) * dx + (b.z - from.z) * dz) / L2; });
  hit.forEach(function (z, k) {
    hurtZombie(z, dmg * Math.pow(CFG.pierceFalloff || 1, k), 'slash', rec);
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
function hurtZombie(z, amount, why, rec) {
  if (!z || !z.alive) return;
  z.hp -= amount;
  if (rec) rec.hits.push({ id: z.id, dmg: amount, hp: z.hp, why: why });
  tintZombie(z);
  if (audio && why === 'slash') audio.hit();
  if (z.hp <= 0) killZombie(z, rec);
  else {
    const d = inkDir(rec, z);
    if (three && three.ink) { three.ink.hit(z.x, z.z, d.x, d.z); fxinkStat.hits++; }
    /* Stagger: a white flash and a short shove along the cut; the boss and status ticks do not shove. */
    z.flinchT = CFG.flinchDur || 0.14;
    if (!z.isBoss && (why === 'slash' || why === 'cleave' || why === 'combo-burst')) {
      const L = Math.hypot(d.x, d.z) || 1, k = (CFG.hitKnockZ || 0.35) * (z.type === 'stone' ? (CFG.stoneKnockMul || 0.35) : 1);
      z.x += d.x / L * k; z.z += d.z / L * k;
    }
  }
}
function applyElement(z, elem, rec) {
  if (!z.alive || !elem) return;
  if (elem === 'fire') {
    if (z.frozen > 0) shatterZombie(z, rec);
    else if (z.poison > 0) explodeZombie(z, rec);
    else applyBurn(z, rec);
  } else if (elem === 'ice') {
    z.frozen = elemIceDur();
    z.burn = 0;
    if (rec) rec.statuses = (rec.statuses || []).concat([{ id: z.id, ice: true }]);
    tintZombie(z);
  } else if (elem === 'poison') {
    z.poison = Math.min(elemPoisonMax(), (z.poison || 0) + 1);
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
    else if (elem === 'ice') { o.slowT = CFG.iceSlowDur || 2; tintZombie(o); }
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
  z.frozen = 0;
  if (rec) rec.shatter = (rec.shatter || []).concat([z.id]);
  if (art.playFx) {
    const fx = art.playFx(three.scene, 'ice-shatter', z.x, z.z, 2.4);
    if (fx) three.fx.push(fx);
  }
  S.shake = Math.max(S.shake || 0, 0.15);
  hurtZombie(z, elemShatterDmg(), 'shatter', rec);
}
function explodeZombie(z, rec) {
  const stacks = z.poison || 0;
  z.poison = 0; z.poisonT = 0;
  if (rec) rec.explode = (rec.explode || []).concat([{ id: z.id, stacks: stacks }]);
  if (art.playFx) {
    const fx = art.playFx(three.scene, 'poison-burst', z.x, z.z, 2.6);
    if (fx) three.fx.push(fx);
  }
  S.shake = Math.max(S.shake || 0, 0.2);
  hurtZombie(z, CFG.explodeDmg, 'explode', rec);
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
        if (z.alive && !z.isBoss && dist(z, c) <= (c.r || 1.5) + z.r) hurtZombie(z, CFG.burnDmg || 1, 'burn', S.lastDash);
      });
      return;
    }
    S.zombies.forEach(function (z) {
      if (z.alive && !z.isBoss && dist(z, c) <= (c.r || CFG.poisonCloudR || 2) + z.r) applyElement(z, 'poison', null);
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
    if (z.slowT > 0) { z.slowT -= dt; if (z.slowT < 0) z.slowT = 0; }
    if (z.stun > 0) { z.stun -= dt; if (z.stun < 0) z.stun = 0; }
    if (z.frozen > 0) {
      z.frozen -= dt;
      if (z.frozen <= 0) {
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
      z.poisonT -= dt;
      if (z.poisonT <= 0) { z.poison = 0; z.poisonT = 0; }
      else {
        z.poisonTick = (z.poisonTick || 0) + dt;
        while (z.alive && z.poisonTick >= CFG.poisonPeriod) {
          z.poisonTick -= CFG.poisonPeriod;
          hurtZombie(z, z.poison * elemPoisonDmg(), 'poison', S.lastDash);
        }
      }
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
    const arc = createSlashArc({
      from: from, to: to, elem: elemNow,
      coreGain: q === 'off' ? 1.05 : 1.45,
      height: 0.5 + pathR() * 0.12,
      width: Math.max(0.9, pathR() * 0.95)
    });
    three.scene.add(arc.mesh);
    three.slashes.push(arc);
  } catch (e) {}
  if (three.ink) three.ink.slash(from, to);
  fxinkStat.slashes++;
  if (elemNow === 'fire' && art.trailTex) {
    const tgeo = new THREE.PlaneGeometry(pathR() * 2.2, len);
    const tmat = new THREE.MeshBasicMaterial({
      map: art.trailTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    const trail = new THREE.Mesh(tgeo, tmat);
    trail.rotation.set(-Math.PI / 2, 0, yaw);
    trail.position.set((from.x + to.x) / 2, 0.06, (from.z + to.z) / 2);
    three.scene.add(trail);
    three.fx.push({ mesh: trail, life: 1.2, max: 1.2 });
  }
  return s.mesh;
}
function afterimages(from, to) {
  for (let i = 1; i <= 4; i++) {
    const u = i / 5;
    const g = art.makeChar ? art.makeChar('afterimage') : new THREE.Group();
    if (!art.makeChar) {
      const spr = spriteMat(art.hero, 2.5);
      spr.material.opacity = 0.35 - i * 0.06;
      g.add(spr);
    } else if (g.userData.sprite) {
      const mat = g.userData.sprite.material;
      mat.opacity = 0.28 - i * 0.05;
      if (mat.blending != null) mat.blending = THREE.NormalBlending;
    }
    g.position.set(from.x + (to.x - from.x) * u, 0, from.z + (to.z - from.z) * u);
    three.scene.add(g);
    three.fx.push({ mesh: g, life: 0.16 + i * 0.03, max: 0.22 });
  }
}
function cutBoss(s) { cutSpirit(s); }
function cutSpirit(s) {
  if (!s || !s.alive) return;
  if (s.kind === 'spirit') return;
  if (s.isBoss) {
    s.seqI++;
    /* 돌진 뒤 경직(등 뒤)에서 베면 절단이 두 번 들어간다 — 예고→회피→반격 파훼. */
    if (s.state === 'stun') { s.seqI++; showJudge('파훼!'); }
    addCharge(CFG.cleaveGainBoss || 10);
    livingMarks().forEach(function (m) { if (m.target === s && art.setSpiritShape) art.setSpiritShape(m.obj, spiritShape(m)); });
    addHitstop(CFG.hitstopKill || 0.06);
    if (s.seqI >= s.seq.length) { killZombie(s, S && S.lastDash); }
    else {
      s.shape = s.seq[s.seqI];
      if (s.obj && art.setSpiritShape) art.setSpiritShape(s.obj, spiritShape(s));
    }
    return;
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
  const cap = CFG.hitstopKillMax || 0.12;
  S.hitstop = Math.min(cap, (S.hitstop || 0) + (sec || 0));
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
  if (S) S.kills = (S.kills || 0) + 1;
  if (S && S.spirits) S.spirits.forEach(function (s) { if (s.target === z) s.target = null; });
  assignSpiritTargets();
  z.marked = false;
  if (z.obj) startDying(z.obj);
  if (three && three.ink) {
    const d = inkDir(rec || (S && S.lastDash), z);
    three.ink.kill(z.x, z.z, d.x, d.z);
    fxinkStat.kills++;
  }
  if (rec && rec.hits && rec.hits.some(function (h) { return h.id === z.id && h.why === 'slash'; })) addHitstop(CFG.hitstopKill || 0.06);
  const kd = CFG.zombieTypes[z.type] || CFG.zombieTypes.imp;
  /* The boss pays its own coin value; its xp does not matter, the run ends on its death. */
  grantKill(z.isBoss ? (CFG.bossCoin || 20) : kd.coin);
  gainXp(CFG.xpPerKill * kd.xp);
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
  const c = Math.round(CFG.coinPerKill * (mul || 1) * coinMult());
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
  if (it.kind === 'dashplus') inkFx.seal('일섬 ' + (S.dashCount + 1), c); /* pickupFx runs before the count goes up */
}
function collectItem(it, rec) {
  pickupFx(it);
  it.alive = false;
  if (it.obj) three.scene.remove(it.obj);
  S.items = S.items.filter(function (x) { return x.alive; });
  if (rec) rec.items.push({ id: it.id, type: it.kind });
  if (it.kind === 'dashplus') {
    S.dashCount++;
    if (S.dash && rec && rec.type) {
      const skip = (S.dashQueue || []).concat(S.dash.target ? [S.dash.target] : []);
      const more = pickSpirits(rec.type, 1, { x: S.dash.to.x, z: S.dash.to.z }, S.lastStrokeDir, skip);
      if (more[0]) {
        S.dashQueue.push(more[0]);
        if (rec.targets.indexOf(more[0].id) < 0) rec.targets.push(more[0].id);
      }
    }
  } else if (it.kind === 'charm') {
    /* 부적 상자(잭팟): 강화 3연속 */
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
    S.hp = Math.min(maxHp(), S.hp + (CFG.herbHeal || 2));
    showJudge('약초 +' + (CFG.herbHeal || 2));
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
  } else if (it.kind === 'xp') gainXp(1);
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
    toast('✦ 진화: ' + name);
    inkFx.evo(name, FX_COLORS[S.dashElem || 'gold'] || FX_COLORS.gold);
    S.slowT = Math.max(S.slowT || 0, 0.5);
    if (audio) audio.bell(0, 'bolt');
  }
  /* 1) 빙결 참격(절대영도): 일섬·얼음 + 경로 폭 Lv2↑ → 착지점 광역 동결·분쇄 */
  if (el === 'ice' && upLv('width') >= 2) born('frostNova', '빙결 참격(절대영도)');
  /* 2) 업화 연쇄: 일섬·화염 + 일섬 횟수 Lv2↑ → 돌진마다 화염 폭발 장판 */
  if (el === 'fire' && upLv('dash') >= 2) born('fireTrail', '업화 연쇄');
  /* 3) 만독 쇄도: 일섬·독 + 참(斬) 게이지 Lv2↑ → 독폭발 연쇄 + 참 게이지 충전 */
  if (el === 'poison' && upLv('charge') >= 2) born('poisonSpread', '만독 쇄도');
  /* 4) 빙참: 일섬·얼음 + 참 게이지 Lv2↑ — 모든 진화가 "각인 + 짝 카드 Lv2" 규칙을 따른다. */
  if (el === 'ice' && upLv('charge') >= 2) born('iceCleave', '빙참(氷斬)');
  /* 5) 만종: 한 가지 종 + 일섬 횟수 카드 Lv2↑ (바닥의 일섬 +1은 세지 않는다) */
  if ((S.bellT > 0 || ctx.bell) && upLv('dash') >= 2) born('myriadBell', '만종(萬鐘)');
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
    if (!z.alive || z.isBoss) return;
    if (dist(z, at) > R + z.r) return;
    z.frozen = Math.max(z.frozen || 0, elemIceDur());
    z.burn = 0;
    tintZombie(z);
    hurtZombie(z, CFG.shatterDmg || 4, 'frost', S.lastDash);
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
    if (!z.alive || z.isBoss) return;
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
    if (o === z || !o.alive || o.isBoss) return;
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
    if (!o.alive || o === z || o.isBoss) return;
    if (dist(o, z) <= 3) {
      hurtZombie(o, 4, 'frost', rec);
      if (o.alive) { o.slowT = Math.max(o.slowT || 0, CFG.iceSlowDur || 2); tintZombie(o); }
    }
  });
}
function gainXp(n) {
  S.xp += n;
  while (S.xp >= xpNeed(S.level)) {
    S.xp -= xpNeed(S.level);
    S.level++;
    S.spiritCap = Math.min(CFG.spiritMax || 5, (S.spiritCap || CFG.spiritCapStart || 3) + 1);
    openLevelUp();
  }
}
/* v0.23 카드 UI: 지금 레벨과 다음 레벨의 실제 수치를 카드에 적는다. */
function elemScale(base, step, lv) { return base + step * Math.max(0, (lv || 0) - 1); }
function fmt1(v) { return (Math.round(v * 10) / 10).toString(); }
function upDesc(u) {
  const next = upLv(u.id) + 1;
  if (u.id === 'ring') return '심안 반경 Lv' + (S.ringLv || 0) + ' → Lv' + Math.min(CFG.ringLvMax || 3, next) + ' (최대)';
  if (u.id === 'ice') return '빙결 ' + fmt1(elemScale(CFG.iceDur || 2.5, CFG.iceDurStep || 0.5, next)) + '초 · 파열 '
    + fmt1(elemScale(CFG.shatterDmg || 4, CFG.shatterStep || 1, next)) + ' 피해';
  if (u.id === 'fire') return '연소 ' + fmt1(elemScale(CFG.burnDur || 3, CFG.burnDurStep || 0.5, next)) + '초 · '
    + fmt1(elemScale(CFG.burnDmg || 1, CFG.burnDmgStep || 0.3, next)) + ' 피해/틱';
  if (u.id === 'poison') return '중첩 ' + Math.round(elemScale(CFG.poisonMax || 5, CFG.poisonMaxStep || 1, next)) + ' · 독구름 '
    + fmt1(elemScale(CFG.poisonCloudR || 2, CFG.cloudRStep || 0.6, next)) + 'm';
  if (u.id === 'perfect') return '정확도 ' + Math.round(((CFG.perfectThresh || 0.8) - (CFG.perfectThreshStep || 0.05) * (next - 1)) * 100)
    + '% 이상이면 ×' + fmt1((CFG.perfectDmgMul || 1.5) + (CFG.perfectStep || 0.15) * (next - 1));
  if (u.id === 'parry') return '패링 반경 ' + fmt1((CFG.parryR || 2.4) + (CFG.parryAwakenR || 0.45) * next) + 'm · 충격파 '
    + fmt1((CFG.parryDmg || 0.5) + (CFG.parryAwakenDmg || 0.4) * next) + ' · 참 +' + Math.round((CFG.parryAwakenCharge || 14) * next);
  if (u.id === 'dmg') return '일섬 피해 ' + fmt1(S.dashDmg) + ' → ' + fmt1(S.dashDmg + 1);
  if (u.id === 'width') return '경로 폭 ' + fmt1(S.pathR) + ' → ' + fmt1(S.pathR + 0.55) + 'm';
  if (u.id === 'dash') return '연쇄 ' + S.dashCount + ' → ' + (S.dashCount + 1) + '회';
  if (u.id === 'charge') return '게이지 획득 +' + Math.round(25 * next) + '%';
  if (u.id === 'heal') return '체력 +5 · 최대 체력 +2';
  return u.desc;
}
function upCardLevelText(u) {
  const lv = upLv(u.id);
  if (!lv) return 'NEW';
  return 'Lv' + lv + ' → Lv' + Math.min(u.maxLv || 99, lv + 1);
}
function openLevelUp() {
  /* 참(斬) 연출 중에는 카드를 잠시 미룬다 — 필살의 손맛을 가리지 않도록. */
  if (S && S.cleaveFx > 0.05) { S._cleaveLv = (S._cleaveLv || 0) + 1; return; }
  if (S.paused === 'levelup') { S._pendingLv = (S._pendingLv || 0) + 1; return; }
  S.paused = 'levelup';
  S.upLv = S.upLv || {};
  /* 상한에 닿은 카드는 풀에서 뺀다(심안 반경 Lv3 등) — 빈 카드가 섞이지 않는다. */
  const pool = RUN_UPGRADES.filter(function (u) { return (S.upLv[u.id] || 0) < (u.maxLv || 99); }), picks = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const k = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(k, 1)[0]);
  }
  S.levelPicks = picks;
  const boxEl = $('levelChoices'); boxEl.innerHTML = '';
  picks.forEach(function (u) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn up-card'; b.dataset.up = u.id;
    const icon = (art && art.upIconUrl) ? art.upIconUrl(u.id) : '';
    b.innerHTML = '<img class="up-icon" src="' + icon + '" alt="" width="34" height="34">'
      + '<span class="up-text"><strong>' + u.name + '</strong>'
      + '<span class="up-lv' + (upLv(u.id) ? '' : ' new') + '">' + upCardLevelText(u) + '</span>'
      + '<span class="up-desc">' + upDesc(u) + '</span></span>';
    b.addEventListener('click', function () { pickUpgrade(u.id); });
    boxEl.appendChild(b);
  });
  showOv('ov-level');
}
const UPGRADE_FX = { dmg: 'vermilion', width: 'jade', dash: 'jade', ring: 'paper', charge: 'gold', heal: 'vermilion', perfect: 'gold', parry: 'paper', ice: 'ice', fire: 'fire', poison: 'poison', bell: 'gold' };
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
  S.upLv = S.upLv || {};
  const def = RUN_UPGRADES.filter(function (u) { return u.id === id; })[0];
  if (def && (S.upLv[id] || 0) >= (def.maxLv || 99)) return false;
  S.upLv[id] = (S.upLv[id] || 0) + 1;
  if (id === 'dmg') S.dashDmg += 1;
  else if (id === 'width') S.pathR += 0.55;
  else if (id === 'dash') S.dashCount += 1;
  else if (id === 'ring') { S.ringLv = Math.min(CFG.ringLvMax || 3, (S.ringLv || 0) + 1); applyRingBoost(); }
  else if (id === 'heal') { S.runHp += 2; S.hp = Math.min(maxHp(), S.hp + 5); }
  else if (id === 'wealth') S.runCoin += 0.25;
  else if (id === 'ice' || id === 'fire' || id === 'poison') {
    /* v0.23 원소 각인: 처음 고르면 원소 장착, 다시 고르면 Lv2·Lv3으로 수치가 실제로 오른다. */
    S.elemLv = S.elemLv || {};
    S.elemLv[id] = Math.min(CFG.elemLvMax || 3, (S.elemLv[id] || 0) + 1);
    setDashElem(id);
    toast(elemNameOf(id) + ' 각인 Lv' + S.elemLv[id]);
  }
  else if (id === 'perfect') { toast('정확한 획 Lv' + S.upLv.perfect); }
  else if (id === 'parry') { toast('칼집 각성 Lv' + S.upLv.parry); }
  else if (id === 'bell') { /* 진화(만종)를 먼저 판정해야 첫 종부터 12초가 된다. */
    checkEvolutions({ bell: true });
    startBell(null, (S.evo && S.evo.myriadBell) ? (CFG.bellMyriadDur || 12) : CFG.bellDur);
  }
  else if (id === 'magnet') S.magnetR = Math.min(CFG.magnetMax || 3.8, (S.magnetR || CFG.magnetR || 2.2) + (CFG.magnetStep || 0.6));
  else if (id === 'charge') S.chargeLv = (S.chargeLv || 0) + 1;
  upgradeFx(id);
  hideOvs(); S.paused = null; renderHud();
  checkEvolutions();
  if (S._pendingLv) { S._pendingLv--; openLevelUp(); }
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
  if (z.state === 'walk') {
    /* A parry or landing stun holds the boss in place and pauses its walk clock; telegraph and charge are not interrupted. */
    if ((z.stun || 0) > 0) z.stateT -= dt;
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
    if (z.stateT > teleT) {
      z.state = 'charge'; z.stateT = 0;
      const dx = (z.aim ? z.aim.x : S.hero.x) - z.x, dz = (z.aim ? z.aim.z : S.hero.z) - z.z;
      const L = Math.hypot(dx, dz) || 1;
      z.chargeDir = { x: dx / L, z: dz / L };
      if (audio) audio.slash();
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
    if ((S.iframe || 0) <= 0 && !S.dash && dist(z, S.hero) < z.r + 0.7) {
      S.hp -= CFG.bossDmg || 2;
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
    if (z.stateT > chargeT) { z.state = 'stun'; z.stateT = 0; }
    return true;
  }
  if (z.state === 'stun') {
    if (z.stateT > stunT) {
      z.state = 'walk'; z.stateT = 0;
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
  const sp = z.flinchT > 0 ? 0 : zsp * kd.speed * (z.slowT > 0 ? (CFG.iceSlowMul || 0.5) : 1);
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
function heroHurt(n, why) {
  if (!S || !S.playing) return;
  if ((S.iframe || 0) > 0 || S.dash) return;
  S.hp -= n;
  S.iframe = CFG.iframeMs / 1000;
  S.hurtFlash = CFG.hurtVignette || 0.3;
  S.hitstop = Math.max(S.hitstop || 0, CFG.hitHitstop || 0.08);
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
/* ---------- 투척 부적 ---------- */
let _shotMat = null, _shotGeo = null;
function spawnShot(from) {
  if (!S || !three) return null;
  const kd = CFG.zombieTypes.thrower || {};
  if (!_shotGeo) _shotGeo = new THREE.SphereGeometry(0.22, 8, 6);
  if (!_shotMat) _shotMat = new THREE.MeshBasicMaterial({ color: 0xc9a6ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(_shotGeo, _shotMat);
  mesh.position.set(from.x, 0.75, from.z);
  three.scene.add(mesh);
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
    sh.x += sh.vx * dt;
    sh.z += sh.vz * dt;
    if (sh.mesh) { sh.mesh.position.set(sh.x, 0.75, sh.z); sh.mesh.rotation.y += dt * 6; }
    /* One reach for hit and vanish. A dashing hero cuts the charm out of the air instead. */
    const reached = Math.hypot(S.hero.x - sh.x, S.hero.z - sh.z) <= (CFG.shotR || 0.42) + 0.55;
    if (reached) {
      if (S.dash) inkFx.burst(sh.x, sh.z, FX_COLORS.poison, { r1: 30, n: 6, dur: 0.35 });
      else if ((S.iframe || 0) <= 0) heroHurt(CFG.shotDmg || 1, '부적에 맞았습니다.');
    }
    const dead = sh.t >= sh.life || reached;
    if (dead && sh.mesh) three.scene.remove(sh.mesh);
    return !dead;
  });
}
/* ---------- 보스 다중 장판 ---------- */
let _hazGeo = null;
function spawnHazard(x, z, r, delay) {
  if (!S || !three) return null;
  const R = r || CFG.hazardR || 2.5;
  if (!_hazGeo) _hazGeo = new THREE.CircleGeometry(1, 28);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(_hazGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.06, z);
  mesh.scale.set(R, R, 1);
  three.scene.add(mesh);
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
      if (art && art.playFx) {
        const fx = art.playFx(three.scene, 'ink-splat', h.x, h.z, h.r);
        if (fx) three.fx.push(fx);
      }
      S.shake = Math.max(S.shake || 0, 0.4);
      if (S.hero && Math.hypot(S.hero.x - h.x, S.hero.z - h.z) <= h.r + 0.4) heroHurt(CFG.hazardDmg || 1, '혈월의 장판에 닿았습니다.');
    }
    if (h.done && h.t >= h.life) {
      if (h.mesh) { three.scene.remove(h.mesh); h.mat.dispose(); }
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
function maybeEnd() {
  if (!S || S.won || S.lost || !S.playing) return;
  if (S.hp <= 0) { endRun(false, '좀비에게 닿았습니다.'); return; }
  if (S.boss && !S.boss.alive) endRun(true, '귀물을 베었습니다.');
}
/* 별점: 클리어 1 + 체력 50% 이상 1 + 스테이지 목표 콤보 1 */
function starsFor(win) {
  if (!S || !win) return 0;
  const st = S.stage || {};
  let n = 1;
  if (S.hp / Math.max(1, maxHp()) >= 0.5) n++;
  if ((S.comboMax || 0) >= (st.starCombo || 10)) n++;
  return n;
}
function endRun(win, msg) {
  if (!S || S.won || S.lost) return;
  S.won = win; S.lost = !win; S.playing = false; S.paused = 'result'; S.dash = null;
  closeArena();
  const st = S.stage || stageOf(1);
  const stars = starsFor(win);
  const coinsGain = Math.max(0, save.coins - (S.coin0 || 0));
  const score = (S.kills || 0) * 10 + (S.comboMax || 0) * 5 + stars * 100 + (win ? 150 : 0);
  S.stars = stars; S.coinGain = coinsGain; S.score = score;
  if (win) {
    save.cleared = Math.max(save.cleared || 0, 1);
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
  save.bestScore = Math.max(save.bestScore || 0, score);
  persist();
  if (audio) audio.stopBgm();
  const nextSt = STAGES[(S.stageNo || st.id)];
  $('resultKicker').textContent = S.stageNo ? (S.stageNo + '장 · ' + st.name) : '연습';
  $('resultTitle').textContent = win ? '베었다' : '쓰러졌다';
  $('resultStars').innerHTML = [0, 1, 2].map(function (i) {
    return '<i class="' + (i < stars ? 'on' : '') + '">★</i>';
  }).join('');
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
  if (win && stars < 3) {
    const lack = [];
    if (S.hp / Math.max(1, maxHp()) < 0.5) lack.push('체력 50% 이상');
    if ((S.comboMax || 0) < (st.starCombo || 10)) lack.push('콤보 ' + (st.starCombo || 10));
    note = '★ 더 받으려면: ' + lack.join(' · ');
  } else if (!win) {
    note = '보스의 도형 순서를 끝까지 베면 클리어입니다.';
  }
  $('resultNext').textContent = note;
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

function step(dt) {
  if (!S || !S.playing || S.paused) return;
  S.elapsed += dt; S.timeLeft -= dt;
  if (S.iframe > 0) S.iframe -= dt;
  if (S.parryCd > 0) S.parryCd = Math.max(0, S.parryCd - dt);
  if (S.parryFlash > 0) S.parryFlash = Math.max(0, S.parryFlash - dt);
  if (S.cleaveFx > 0) S.cleaveFx = Math.max(0, S.cleaveFx - dt);
  if (S.cleaveFx <= 0 && S._cleaveLv > 0 && !S.paused && S.playing) {
    const n = S._cleaveLv;
    S._cleaveLv = 0;
    if (n > 1) S._pendingLv = (S._pendingLv || 0) + (n - 1);
    openLevelUp();
  }
  if (S.fogPulse > 0) S.fogPulse = Math.max(0, S.fogPulse - dt / 0.6);
  if (S.waveBoostT > 0) S.waveBoostT = Math.max(0, S.waveBoostT - dt);
  if (S.comboGrace > 0) S.comboGrace = Math.max(0, S.comboGrace - dt);
  if (S.inputBuf) {
    const busy = !!S.dash || (S.dashQueue && S.dashQueue.length);
    const age = now() - S.inputBuf.t0;
    if ((!busy && age > (S.inputBuf.ttl || 200) + 300) || age > 1200) S.inputBuf = null;
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
  if (S.sightWave > 0 && !qa.freezeWave) S.sightWave = Math.max(0, S.sightWave - dt / (CFG.sightWaveDur || 0.7));
  if (S.combo > 0) {
    /* 선입력으로 이어진 연쇄는 판정을 조금 더 봐준다. */
    if (!(S.comboGrace > 0)) {
      S.comboIdle = (S.comboIdle || 0) + dt;
      if (S.comboIdle > (CFG.comboTimeout || 2.8)) S.combo = 0;
    }
  }
  if (S.tempElem && S.tempElem.t > 0) {
    S.tempElem.t -= dt;
    if (S.tempElem.t <= 0) { S.tempElem = null; renderHud(); }
  }
  if (S.bellT > 0) {
    S.bellT -= dt;
    if (S.bellT <= 0) endBell();
  }
  if (!S.sandbox && !S.bossSpawned && S.elapsed >= ((S.stage && S.stage.bossAt) || CFG.bossAt)) {
    spawnBoss({ r: CFG.bossSpawnR, nShapes: (S.stage && S.stage.bossShapes) || CFG.bossShapes });
    toast('부적을 단 귀물이 다가옵니다 — 결계가 내려앉습니다');
  }
  const bossAlive = !!(S.boss && S.boss.alive);
  /* 중간 정예(보스 전 엘리트) — 스테이지별 1회 */
  if (!S.sandbox && !bossAlive && S.eliteAt > 0 && !S.eliteDone && S.elapsed >= S.eliteAt) {
    S.eliteDone = true;
    spawnEliteEvent();
  }
  /* 포위 웨이브 (스테이지별 스케줄). 보스 결계 안에서는 잔몹을 부르지 않는다. */
  if (!S.sandbox && !bossAlive) {
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
    /* 귀물이 하나도 남지 않았으면 다음 스폰을 기다리지 않고 바로 한 마리 내보낸다(비는 시간 0). */
    if (zMax > 0 && !S.zombies.some(function (z) { return z.alive && !z.isBoss; })) S.zAcc = Math.max(S.zAcc, zms);
    while (zMax > 0 && S.zAcc >= zms && S.zombies.filter(function (z) { return z.alive && !z.isBoss; }).length < zMax) {
      S.zAcc -= zms; spawnZombie();
    }
    stepSpirits(dt);
  } else {
    stepSpirits(dt);
  }
  if (qa.autoStroke) {
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
      if (!S.dash && !(S.dashQueue && S.dashQueue.length)) break;
    }
  }
  tickStatuses(dt);
  const zsp = CFG.zombieSpeed * wave * (S.elapsed < 20 ? 0.65 : 1);
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
    const d = dist(z, S.hero) || 0.001;
    const frozen = z.frozen > 0 || (z.stun || 0) > 0;
    if (z.flinchT > 0) z.flinchT = Math.max(0, z.flinchT - dt);
    const bossHandled = z.isBoss ? stepBoss(z, dt) : (qa.noMove ? false : stepEnemySpecial(z, dt, d, frozen, zsp));
    if (!qa.noMove && !frozen && !bossHandled && !(z.flinchT > 0 && !z.isBoss)) {
      const kd = CFG.zombieTypes[z.type] || CFG.zombieTypes.imp;
      /* The boss speeds up the farther it is outside the ring, so a dashing hero cannot outrun it. */
      const sp = z.isBoss ? (CFG.bossSpeed || 1) * (1 + (CFG.bossCatchUp || 0) * Math.max(0, d - ringR())) : zsp * kd.speed * (z.slowT > 0 ? (CFG.iceSlowMul || 0.5) : 1);
      z.x += (S.hero.x - z.x) / d * sp * dt;
      z.z += (S.hero.z - z.z) / d * sp * dt;
    }
    placeGroup(z.obj, z.x, z.z);
    if (art.tickChar) {
      const kind = z.isBoss ? 'boss' : 'zombie';
      const st = z.isBoss ? 'idle' : (frozen ? 'frozen' : (z.burn > 0 ? 'burning' : (z.poison > 0 ? 'poisoned' : 'walk')));
      const vx = S.hero.x - z.x, vz = S.hero.z - z.z;
      art.tickChar(z.obj, kind, st, Math.min(0.05, dt), vx, vz);
    }
    /* Hit flash over the status tint (tintZombie resets the colour next frame). */
    if (z.flinchT > 0 && z.obj && z.obj.userData && z.obj.userData.sprite) {
      const fk = 1 + 1.6 * (z.flinchT / (CFG.flinchDur || 0.14));
      z.obj.userData.sprite.material.color.setRGB(fk, fk, fk * 0.95);
    }
    if (art.setTelegraph && !z.isBoss) art.setTelegraph(z.obj, !frozen && (d < (CFG.telegraphRange || 3.2) || z.windT > 0 || z.dashPhase > 0));
    if (d < z.r + 0.55) {
      /* 빙결·경직된 귀물은 몸이 굳은 사이 닿아도 해치지 못한다(얼음·충격이 실제로 방어가 된다). */
      if ((S.iframe || 0) <= 0 && !S.dash && !frozen) {
        S.hp -= z.isBoss ? (CFG.bossDmg || 3) : ((CFG.zombieTypes[z.type] || {}).dmg || CFG.dmg);
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
        if (S.hp <= 0) { endRun(false, '좀비에게 닿았습니다.'); return; }
      }
      const push = Math.max(1.2, z.r + 0.65);
      z.x = S.hero.x - (S.hero.x - z.x) / d * push;
      z.z = S.hero.z - (S.hero.z - z.z) / d * push;
    }
  });
  stepShots(dt);
  stepHazards(dt);
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
  const d = S.dash;
  d.t += dt;
  const u = clamp(d.t / d.dur, 0, 1);
  const k = u * u * (3 - 2 * u);
  S.hero.x = d.from.x + (d.to.x - d.from.x) * k;
  S.hero.z = d.from.z + (d.to.z - d.from.z) * k;
  if (three && three.heroSpr) placeGroup(three.heroSpr, S.hero.x, S.hero.z);
  if (u >= 0.85) resolveDash(d);
  if (u >= 1) { landDash(d); S.dash = null; startSeg(); }
}

function updateCam(dt) {
  if (!three) return;
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
  S.cam.x += (targetX - S.cam.x) * Math.min(1, dt * 6);
  S.cam.z += (targetZ - S.cam.z) * Math.min(1, dt * 6);
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
    const a = S.shake * 0.55;
    sx += (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a; sz += (Math.random() - 0.5) * a;
  }
  three.camera.position.set(S.cam.x + CFG.camOff.x + sx, CFG.camOff.y + sy, S.cam.z + CFG.camOff.z + sz);
  three.camera.lookAt(S.cam.x, CFG.camLookY, S.cam.z);
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
    const w = (1.8 + 6.8 * Math.sin(Math.PI * tt)) * (0.7 + 0.3 * a);
    left.push({ x: p.x + -dy / L * w, y: p.y + dx / L * w });
    right.push({ x: p.x - -dy / L * w, y: p.y - dx / L * w });
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = color ? hexRgba(color, 0.62 * a) : paperRgba(0.94 * a);
  ctx.fill();
  const dab = paintInk._dab;
  if (dab && dab.complete) {
    let acc = 0, prev = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      acc += Math.hypot(p.x - prev.x, p.y - prev.y);
      if (acc >= 4) {
        const s = 7 + (i % 3);
        ctx.globalAlpha = 0.55 * a;
        ctx.drawImage(dab, p.x - s / 2, p.y - s / 2, s, s);
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
function onDown(e) {
  if (pointers.down) return;
  if (e.target.closest && e.target.closest('.ov.show, .btn')) return;
  pointers.down = true; pointers.id = e.pointerId; pointers.pts = [localPts(e)];
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
  }
}
function onUp(e) {
  if (!pointers.down || (e.pointerId != null && e.pointerId !== pointers.id)) return;
  pointers.down = false;
  const pts = pointers.pts;
  pointers._chip = null;
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
  const rec = G.recognize(pts, { allowBolt: true });
  S.lastRec = rec;
  S.aimTarget = null;
  S.preview = null;
  const read = (G.readMessage && G.readMessage(rec)) || '';
  rec.readMessage = read;
  /* 제자리 탭 = 칼집 패링 (인식기는 이미 tap을 읽는다) */
  if (rec.type === 'tap' || opts.tap) return doParry(rec);
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
  /* O = 전 화면 참(斬) 필살기 */
  if (rec.type === 'circle') { rec.cleave = true; return castCleave(rec); }
  if (!S.sandbox && S.pool && S.pool.indexOf(rec.type) < 0) {
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
  /* 선입력 버퍼: 돌진 중에 들어온 획은 버리지 않고 200ms 예약한다. */
  if (S.dash || (S.dashQueue && S.dashQueue.length)) {
    S.inputBuf = { type: rec.type, dir: dir, t0: now(), ttl: CFG.inputBufMs || 200, quality: rec.bestScore };
    inkFade = 0.20;
    showJudge('예약');
    rec.buffered = true;
    rec.targets = [];
    return rec;
  }
  const dash = beginDash(rec.type, { dir: dir, quality: rec.bestScore });
  rec.targets = dash && dash.targets;
  rec.dash = dash;
  return rec;
}
function syntheticPath(type, x, y, s) {
  s = s || 70;
  function line(x1, y1, x2, y2, n) {
    const p = []; n = n || 24;
    for (let i = 0; i < n; i++) { const t = i / (n - 1); p.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }); }
    return p;
  }
  if (type === 'vline') return line(x, y - s, x, y + s);
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
  const cap = CFG.idleMaxHours * 3600 * 1000;
  const t = Math.min(Math.max(0, ms), cap);
  return Math.floor((t / 60000) * CFG.idlePerMin * (1 + save.coinLv * CFG.coinStep));
}
function checkIdle() {
  const c = idleCoins(Date.now() - (save.lastSeen || Date.now()));
  if (c <= 0) return 0;
  idlePending = c;
  $('idleBody').textContent = '자리를 비운 동안 엽전 ' + c + '이 쌓였습니다.';
  showOv('ov-idle');
  return c;
}
function collectIdle(double) {
  let n = idlePending; if (!n) return 0;
  if (double) n *= 2;
  save.coins += n; idlePending = 0; persist();
  hideOvs(); showOv('ov-title'); renderHud();
  return n;
}
function refreshShop() {
  $('shopCoins').textContent = save.coins;
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
  const lv = stat === 'atk' ? save.atkLv : stat === 'hp' ? save.hpLv : save.coinLv;
  if (lv >= CFG.maxLv) return false;
  const c = costOf(lv);
  if (save.coins < c) return false;
  save.coins -= c;
  if (stat === 'atk') save.atkLv++;
  else if (stat === 'hp') save.hpLv++;
  else save.coinLv++;
  persist(); refreshShop(); renderHud();
  return true;
}

function activeFov() {
  if (!three || !three.view) return CFG.fov || 40;
  const a = three.view.clientWidth / Math.max(1, three.view.clientHeight);
  return CFG.fov || 62;
}
function applyCameraLens() {
  if (!three) return;
  const w = three.view.clientWidth, h = Math.max(1, three.view.clientHeight);
  three.camera.aspect = w / h;
  three.camera.fov = activeFov();
  three.camera.updateProjectionMatrix();
}
function onResize() {
  if (!three) return;
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
function applyStageAtmo(st) {
  st = st || (S && S.stage) || stageOf(save.stage || 1);
  const a = (st && st.atmo) || {};
  if (three) {
    const clear = (a.clear != null) ? a.clear : (three.baseClear != null ? three.baseClear : nightColor());
    if (three.scene) {
      three.scene.background = new THREE.Color(clear);
      if (three.scene.fog) { three.scene.fog.color.set(clear); three.scene.fog.density = a.fog != null ? a.fog : 0.007; }
    }
    if (three.sky && three.sky.material && three.sky.material.color) three.sky.material.color.set(clear);
    if (three.moon) {
      three.moon.intensity = a.moon != null ? a.moon : 1.45;
      if (a.moonCol != null && three.moon.color) three.moon.color.setHex(a.moonCol);
    }
    if (three.amb) three.amb.intensity = a.amb != null ? a.amb : 1.0;
    if (three.fill) three.fill.intensity = a.fill != null ? a.fill : 0.85;
    if (three.hemi && a.hemiI != null) three.hemi.intensity = a.hemiI;
    if (three.hemi && a.hemi != null) three.hemi.color.setHex(a.hemi);
    if (three.hemi && a.ground != null) three.hemi.groundColor.setHex(a.ground);
    if (three.renderer) three.renderer.setClearColor(clear, 1);
  }
  const tint = $('stageTint');
  if (tint) tint.style.background = a.tint || 'transparent';
  const app = $('app');
  if (app) app.dataset.stage = String((st && st.id) || 1);
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

function sizeOverlayCanvas(c, host, dpr, css) {
  if (!c) return null;
  if (c.width !== Math.floor(css.width * dpr) || c.height !== Math.floor(css.height * dpr)) {
    c.width = Math.max(1, Math.floor(css.width * dpr));
    c.height = Math.max(1, Math.floor(css.height * dpr));
    c.style.width = css.width + 'px'; c.style.height = css.height + 'px';
  }
  return c;
}
function punchAtmoRing(cx, cy, ringR, wave) {
  const root = $('fxinkAtmo');
  if (!root) return;
  if (!(wave > 0.02) || !(ringR > 0)) {
    root.style.webkitMaskImage = '';
    root.style.maskImage = '';
    return;
  }
  const inner = Math.max(0, ringR - 22);
  const outer = ringR + 22;
  const img = 'radial-gradient(circle at ' + cx + 'px ' + cy + 'px,#fff 0,#fff ' + inner + 'px,transparent ' + inner + 'px,transparent ' + outer + 'px,#fff ' + outer + 'px)';
  root.style.webkitMaskImage = img;
  root.style.maskImage = img;
}
/* Mind's-eye fog: everything inside the ring is clear; outside lies dark fog. The edge is soft and
   broken by drifting mist so it reads as fog, not a line. */
function fogRgb() {
  const a = (S && S.stage && S.stage.atmo) || {};
  return a.fogCol || CFG.fogColor || [7, 6, 8];
}
function drawRingFog(fog, w, h) {
  const pts = ringScreenPts();
  if (!pts || !pts.length) return;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  pts.forEach(function (p) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; });
  const ex = (x0 + x1) / 2, ey = (y0 + y1) / 2, rx = Math.max(10, (x1 - x0) / 2), ry = Math.max(10, (y1 - y0) / 2);
  const t = (S && S.elapsed) || 0;
  const pulse = (S && S.fogPulse) || 0;
  /* 스테이지 색의 먹안개. 심안 가장자리에서 짙고, 화면 먼 곳은 조금 옅어
     무대의 실루엣(대나무·성문·등불)이 안개 너머로 어렴풋이 읽힌다. */
  const fc = fogRgb();
  const hh = S && S.hero ? heroScreen() : { x: w * 0.5, y: h * 0.5 };
  const rad = Math.max(w, h);
  const grd = fog.createRadialGradient(hh.x, hh.y, rad * 0.16, hh.x, hh.y, rad * 0.92);
  grd.addColorStop(0, 'rgba(' + fc.join(',') + ',' + Math.min(0.96, CFG.fogAlpha + 0.04) + ')');
  grd.addColorStop(0.55, 'rgba(' + fc.join(',') + ',' + CFG.fogAlpha + ')');
  grd.addColorStop(1, 'rgba(' + fc.join(',') + ',' + Math.max(0.56, CFG.fogAlpha - 0.22) + ')');
  fog.fillStyle = grd;
  fog.fillRect(0, 0, w, h);
  /* Carve the clear ellipse with a soft rim. */
  fog.save();
  fog.globalCompositeOperation = 'destination-out';
  fog.translate(ex, ey); fog.scale(rx, ry);
  const g = fog.createRadialGradient(0, 0, 0, 0, 0, CFG.fogOuter);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(CFG.fogInner / CFG.fogOuter * (1 - 0.07 * pulse), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  fog.fillStyle = g;
  fog.beginPath(); fog.arc(0, 0, CFG.fogOuter, 0, Math.PI * 2); fog.fill();
  fog.restore();
  /* Drifting mist along the rim: long thin banks stretched along the edge, pale and dark, slowly sliding. */
  const n = CFG.fogWisps;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 0.035 * (i % 2 ? 1 : -1) + Math.sin(i * 7.3) * 0.25;
    const rr = 1.04 + 0.08 * Math.sin(t * 0.4 + i * 1.7);
    const px = ex + Math.cos(a) * rx * rr, py = ey + Math.sin(a) * ry * rr;
    const len = rx * (0.32 + 0.12 * Math.sin(t * 0.5 + i * 2.3)), thick = len * 0.28;
    const pale = i % 3 !== 0;
    const al = pale ? CFG.fogWispAlpha * (0.6 + 0.4 * Math.sin(t * 0.7 + i)) : 0.3;
    fog.save();
    fog.translate(px, py);
    fog.rotate(Math.atan2(Math.cos(a) * ry, -Math.sin(a) * rx));
    fog.scale(1, thick / len);
    const gw = fog.createRadialGradient(0, 0, 0, 0, 0, len);
    gw.addColorStop(0, pale ? 'rgba(160,162,158,' + al.toFixed(3) + ')' : 'rgba(' + fc.join(',') + ',' + al.toFixed(3) + ')');
    gw.addColorStop(1, 'rgba(160,162,158,0)');
    fog.fillStyle = gw;
    fog.fillRect(-len, -len, len * 2, len * 2);
    fog.restore();
  }
}
function drawSightFog() {
  const c = $('sightFog');
  const sc = $('sonarRing');
  const host = $('app') || c;
  if (!c || !host) return;
  const box = host.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  sizeOverlayCanvas(c, host, dpr, box);
  if (sc) sizeOverlayCanvas(sc, host, dpr, box);
  const w = box.width, h = box.height;
  const fog = c.getContext('2d');
  fog.setTransform(1, 0, 0, 1, 0, 0);
  fog.clearRect(0, 0, c.width, c.height);
  if (sc) {
    const s0 = sc.getContext('2d');
    s0.setTransform(1, 0, 0, 1, 0, 0);
    s0.clearRect(0, 0, sc.width, sc.height);
  }
  const playing = !!(S && S.playing);
  const wave = (S && S.sightWave) || 0;
  if (!playing) { punchAtmoRing(0, 0, 0, 0); return; }
  const cx = (S.hero ? heroScreen() : { x: w * 0.5 }).x, cy = (S.hero ? heroScreen() : { y: h * 0.5 }).y;
  fog.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hs = S.hero ? heroScreen() : { x: w * 0.5, y: h * 0.5 };
  host.style.setProperty('--hero-x', hs.x.toFixed(1) + 'px');
  host.style.setProperty('--hero-y', hs.y.toFixed(1) + 'px');
  drawRingFog(fog, w, h);
  const ringCtx = sc ? sc.getContext('2d') : fog;
  if (sc) ringCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  /* 4차: 심안 파동은 안개 구멍을 열기만 하고, 궤도 안의 두 번째 동심원 획은 그리지 않음. */
  if (wave > 0.04 && S.hero) {
    const holePx = Math.min(w, h) * (0.12 + 0.28 * wave);
    punchAtmoRing(cx, cy, holePx, wave);
  } else {
    punchAtmoRing(0, 0, 0, 0);
  }
  if (S && S.landRipple && S.landRipple.t > 0) {
    const lp = projectXZ(S.landRipple.x, S.landRipple.z, 0.15);
    const lt = S.landRipple.t;
    const lr = 28 + (1 - lt) * 70;
    drawSonarRing2D(ringCtx, w, h, lt, {
      r: lr, cx: lp.x, cy: lp.y,
      coreAlpha: 0.8, coreWidth: 2.4, haloAlpha: 0.35, haloWidth: 6, glowAlpha: 0.12, innerAlpha: 0
    });
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
  const dt = raw * scale;
  lastTs = ts;
  if (real > 0 && real < 1) {
    const f = 1 / real;
    fps.samples.push(f);
    if (fps.samples.length > 300) fps.samples.shift();
    fps.last = f;
  }
  if (toastT && now() > toastT) { $('toast').hidden = true; toastT = 0; }
  if (pendingStage && now() >= pendingStage.until) goStageNow();
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
    if (three.map && three.map.follow) three.map.follow(S ? S.cam.x : 0, S ? S.cam.z : 0);
    stepArena(raw);
    if (three.map && three.map.update) three.map.update(raw, ts * 0.001);
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
    const fx = three.fx || [];
    three.fx = fx.filter(function (f) {
      f.life -= raw;
      fadeFx(f.mesh, Math.max(0, f.life / f.max * 0.85));
      if (f.life <= 0) { three.scene.remove(f.mesh); return false; }
      return true;
    });
    if (three.heroSpr && art.tickChar) {
      const st = (S && S.dash) ? 'dash' : 'idle';
      let hvx = 0, hvz = 0;
      if (S && S.dash) { hvx = S.dash.to.x - S.dash.from.x; hvz = S.dash.to.z - S.dash.from.z; }
      art.tickChar(three.heroSpr, 'hero', st, raw, hvx, hvz);
      const spr = three.heroSpr.userData && three.heroSpr.userData.sprite;
      if (spr) {
        spr.visible = true;
        if (spr.material) spr.material.opacity = 1;
        spr.renderOrder = 8;
        if (spr.material) spr.material.depthTest = false;
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
      three.slashes = three.slashes.filter(function (s) {
        if (s.update && s.update(dt)) return true;
        if (s.mesh) three.scene.remove(s.mesh);
        if (s.dispose) s.dispose();
        return false;
      });
    }
    if (three.ink && three.ink.update) three.ink.update(dt);
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
}
function bindUi() {
  $('btnStart').addEventListener('click', function () { beginStage(upcomingRun()); });
  $('btnShop').addEventListener('click', function () { refreshShop(); showOv('ov-shop'); });
  $('btnShopClose').addEventListener('click', function () {
    if (S && (S.won || S.lost)) showOv('ov-result');
    else showOv('ov-title');
  });
  $('btnResultShop').addEventListener('click', function () { refreshShop(); showOv('ov-shop'); });
  $('btnResultGo').addEventListener('click', function () {
    const n = (S && S.won && S.nextStage) ? S.nextStage : ((S && S.stageNo) || save.stage || 1);
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
  loadSave();
  await probeAssets();
  art = await buildArt(THREE);
  three = await makeWorld();
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
  const idled = checkIdle();
  if (!idled) showOv('ov-title');
  /* An unclaimed idle reward keeps the old lastSeen, so a refresh does not lose it. */
  persist(!idled);
  if (!raf) loop(now());
  window.GPv2.ready = true;
  window.GPv2.assetsUsed = art.used;
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
    save.cleared = 0; save.lastSeen = Date.now(); save.best = 0; save.runs = 0;
    save.stage = 1; save.stars = {}; save.bestScore = 0;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    persist(); renderHud(); refreshTitleHelp();
  },
  setQa: function (o) { Object.keys(o || {}).forEach(function (k) { qa[k] = o[k]; }); if (audio) audio.setQuiet(qa.mute, qa.noDelay); },
  startRun: startRun,
  spawnSpirit: function (o) { return spawnSpirit(o); },
  spawnBoss: function (o) { return spawnBoss(o); },
  spawnZombie: function (o) { return spawnZombie(o); },
  addSpirit: function (o) { return addSpirit(o || { force: true }); },
  setSpiritCount: function (n) { return setSpiritCount(n); },
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
    return b ? { state: b.state || 'walk', t: b.stateT || 0, seqI: b.seqI, alive: b.alive, aim: b.aim || null } : null;
  },
  setBossState: function (st) {
    const b = S && S.boss;
    if (!b) return null;
    b.state = st; b.stateT = 0;
    if (st === 'telegraph') b.aim = { x: S.hero.x, z: S.hero.z };
    return b.state;
  },
  recognize: function (pts, opt) { return G.recognize(pts, opt); },
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
      saveStage: save.stage, stars: Object.assign({}, save.stars), bestScore: save.bestScore
    };
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
  selectStage: function (n) { titleSel = clamp(n | 0, 1, STAGES.length); refreshTitleHelp(); previewStageWorld(titleSel); return titleSel; },
  stageSelectHtml: function () { return $('titleStages') ? $('titleStages').innerHTML : ''; },
  resultInfo: function () {
    return S ? { won: !!S.won, lost: !!S.lost, stars: S.stars || 0, kills: S.kills || 0, comboMax: S.comboMax || 0, coinGain: S.coinGain || 0, score: S.score || 0, nextStage: S.nextStage || null, stageNo: S.stageNo || 0 } : null;
  },
  pickSpirits: function (shape, n, from, dir) { return pickSpirits(shape, n, from, dir); },
  audioInfo: function () { return audio ? audio.info() : null; },
  triggerSightWave: triggerSightWave,
  drawSightFog: drawSightFog,

  fxInfo: function () {
    const idle = art && art.atlas && art.atlas.heroAnim && art.atlas.heroAnim.actions && art.atlas.heroAnim.actions.idle;
    const zWalk = art && art.atlas && art.atlas.zombieAnim && art.atlas.zombieAnim.actions && art.atlas.zombieAnim.actions.walk;
    const atmo = $('fxinkAtmo');
    const slash = three && three.slashes && three.slashes[0];
    const marks = $('marks');
    const fog = $('sightFog');
    return {
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
      fogZ: fog ? +getComputedStyle(fog).zIndex : 0,
      sonarZ: $('sonarRing') ? +getComputedStyle($('sonarRing')).zIndex : 0,
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
  heroVisible: function () {
    const g = three && three.heroSpr;
    const spr = g && g.userData && g.userData.sprite;
    return {
      group: !!(g && g.visible !== false),
      visible: !!(spr && spr.visible !== false && g && g.visible !== false),
      opacity: spr && spr.material ? spr.material.opacity : 0,
      action: g && g.userData && g.userData.action,
      hasMap: !!(spr && spr.material && spr.material.map)
    };
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
      wave: S && { fired: (S.wavesFired || []).slice(), boost: S.waveBoostT || 0, pending: (S.waveIds || []).length },
      evo: S && Object.keys(S.evo || {}), evolved: S && (S.evolved || []).slice(),
      magnetR: S && S.magnetR,
      marks: (lastMarkMetrics && lastMarkMetrics.marks) || [],
      glyphs: (lastMarkMetrics && lastMarkMetrics.marks) || [],
      dashSeq: S && (S.dashSeq || 0),
      markStyle: lastMarkMetrics && lastMarkMetrics.markStyle,
      markCssPx: lastMarkMetrics && lastMarkMetrics.cssPx,
      bossState: S && S.boss ? (S.boss.state || 'walk') : null,
      elites: S ? S.zombies.filter(function (z) { return z.alive && z.elite; }).map(function (z) { return { id: z.id, hp: z.hp }; }) : [],
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
