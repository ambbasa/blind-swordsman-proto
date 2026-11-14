/* 맹인 검객 일섬 v2 — 2.5D quarter-view, Three.js, camera-follow dashes. */
import * as THREE from 'three';
import { probeAssets, buildArt } from './art.js';
import * as Anim from './anim.js';
import { createAudio } from './audio.js';
import { createInkSlash, prewarmInkSlash } from '../../assets/v2/fx-ink/code/inkSlashMaterial.js';
import { InkParticles } from '../../assets/v2/fx-ink/code/inkParticles.js';
import { setupBloom, AutoQuality } from '../../assets/v2/fx-ink/code/bloomSetup.js';
import { drawSonarRing2D } from '../../assets/v2/fx-ink/code/sonarRing.js';
import { createInkWashPass } from './inkwash.js';

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
  hpBase: 10, dmg: 1, bossDmg: 2, iframeMs: 800,
  timeLimit: 75, bossAt: 50, bossShapes: 6,
  coinPerKill: 3, comboExtra: 2,
  idlePerMin: 4, idleMaxHours: 8,
  upgradeBase: 15, atkStep: 0.05, hpStep: 3, coinStep: 0.25, maxLv: 10,
  xpBase: 4, xpStep: 5, xpPerKill: 1,
  dashDur: 0.28, pathRadius: 1.35, dashDmg: 2.5, spiritHp: 1,
  /* Zombie kinds: hp grows over the run by (1 + hpGrowth * t / timeLimit). */
  zombieTypes: {
    imp: { hp: 2, speed: 1.0, r: 0.55, dmg: 1, xp: 1, coin: 1 },
    brute: { hp: 5, speed: 0.9, r: 0.7, dmg: 1, xp: 2, coin: 2 },
    stone: { hp: 10, speed: 0.6, r: 0.9, dmg: 2, xp: 3, coin: 3 },
    /* 정예 원귀: 금테를 두른 느린 귀물. 처치하면 부적 상자(강화 3연속)를 떨어뜨린다. */
    elite: { hp: 12, speed: 0.8, r: 0.85, dmg: 1, xp: 5, coin: 6 }
  },
  zombieMix: [[0, { imp: 1 }], [25, { imp: 0.75, brute: 0.25 }], [45, { imp: 0.55, brute: 0.3, stone: 0.15 }]],
  hpGrowth: 0.45,
  comboMulStep: 0.05, comboMulCap: 20, pierceFalloff: 0.85,
  spreadR: 1.5, iceSlowDur: 2, iceSlowMul: 0.5, poisonCloudR: 2, poisonCloudDur: 3,
  dashCount: 1, spawnZombieMs: 900,
  spawnZombieMax: 20,
  spawnZombieMinMs: 450,
  spawnZombieDelay: 1.2, practiceZombieMs: 3200, practiceZombieMax: 2, earlyZombieMax: 6, earlyZombieUntil: 15, earlyZombieMinMs: 1400,
  openingZombies: 6, openingRing: [0.5, 0.8],
  spiritStreamAlpha: 0.7, spiritFadeIn: 0.4, spiritAlpha: 0.9, spiritHover: 1.05, spiritCapStart: 3, spiritMax: 5, spiritGlowAlpha: 0.5,
  /* 혼령 회수 되돌림(hysteresis): 획득 0.95R, 회수 1.15R(=fogOuter). */
  spiritReleaseMul: 1.15, spiritAcquireMul: 1.02,
  /* 제자리 탭 = 칼집 패링 */
  parryR: 2.4, parryPush: 1.6, parryStun: 0.35, parryDmg: 0.5, parryCd: 0.45, parryFailCd: 0.2, parryIframe: 0.2, parryHitstop: 0.05,
  /* 선입력 버퍼 */
  inputBufMs: 200,
  /* 참(斬) 필살기 */
  cleaveCharge: 100, cleaveR: 12, cleaveDmgMul: 3, cleaveBossDmg: 6, cleaveGainKill: 7, cleaveGainWave: 15, cleaveGainBoss: 10,
  /* 자석 수집 */
  magnetR: 1.8, magnetDur: 0.18, magnetStep: 0.6, magnetMax: 3.6,
  /* 포위 웨이브 */
  waves: [
    { t: 20, n: 14, mix: { imp: 0.7, brute: 0.3 }, r: [9, 10] },
    { t: 40, n: 20, mix: { imp: 0.6, brute: 0.3, stone: 0.1 }, r: [9, 11], elite: 1 }
  ], waveBoostSec: 8,
  ringScreenFrac: 0.70, ringMaxFrac: 0.90, ringBoost: 0.14, ringLvMax: 4,
  spiritOmega: 2.8, spiritAvoidMax: 0.30, spiritAvoidOmega: 8, bossSpeed: 1.0, bossCatchUp: 0.3, bossSpawnR: 11,
  dashThroughMul: 1.5, dashPastTarget: 0.8, dashPastBodyMul: 1.5, dashPastExtra: 2.0, playBound: 28,
  landBounce: 0.28, landBounceT: 0.16, landRippleDur: 0.45,
  landIframe: 0.25, landShockR: 1.6, landPush: 1.2, landStun: 0.3, landPast: 1.0,
  slideNear: 1.4, slideExtra: 1.5,
  hitstopKill: 0.06, hitstopKillMax: 0.12, hitHitstop: 0.08, hitKnock: 0.6,
  recoilU: 0.12, recoilT: 0.12, hurtVignette: 0.3,
  aimConeCos: 0.5, aimNearW: 0.35, telegraphRange: 3.2,
  spiritRing: [5, 7.2], zombieRing: [6, 8.5],
  zombieSpeed: 2.15, spiritSpeed: 0.55,
  camOff: { x: 14.4, y: 22.4, z: 14.4 }, camLookY: 1.2, fov: 62,
  markMinCss: 28, markMaxCss: 36,
  comboTimeout: 2.8,
  perfectDmgMul: 1, comboBurstAt: [4, 8, 12],
  comboBurstR: [3.2, 4.2, 5.2], comboBurstDmg: [1, 1.5, 2],
  practiceSec: 10, practiceSpawns: 6, comboBurstMs: 220,
  iceDur: 2.5, burnDur: 3, burnPeriod: 0.75, burnDmg: 1,
  poisonMax: 5, poisonDur: 4, poisonPeriod: 1, poisonDmgPer: 1,
  shatterDmg: 4, explodeDmg: 3, explodeR: 2.5,
  bellDur: 8, slowDur: 0.45, slowScale: 0.35,
  sightWaveDur: 0.45,
  /* Fog outside the mind's-eye ring: clear inside fogInner x ring, fully fogged at fogOuter x ring. */
  fogColor: [7, 6, 8], fogAlpha: 0.9, fogInner: 0.86, fogOuter: 1.16, fogWisps: 44, fogWispAlpha: 0.09
};
const RUN_UPGRADES = [
  { id: 'dmg', name: '돌진 데미지', desc: '일섬이 좀비에게 더 큰 상처를 남깁니다.' },
  { id: 'width', name: '경로 폭', desc: '베기 선이 넓어져 더 많은 것을 스칩니다.' },
  { id: 'dash', name: '일섬 횟수', desc: '같은 모양 혼령 방향으로 한 번 더 이어 돌진합니다.' },
  { id: 'ring', name: '심안 반경', desc: '심안(먹안개)이 넓어져 좀비를 더 멀리서 느낍니다.' },
  { id: 'magnet', name: '혼백 자석', desc: '일섬 착지점 주변의 혼백구와 엽전이 빨려 옵니다.' },
  { id: 'charge', name: '참(斬) 게이지', desc: '참 게이지가 더 빨리 차오릅니다.' },
  { id: 'heal', name: '체력 회복', desc: '체력을 회복하고 이번 판 최대 체력이 조금 늘어납니다.' },
  { id: 'wealth', name: '엽전 주머니', desc: '이번 판 코인 획득이 늘어납니다.' },
  { id: 'ice', name: '일섬·얼음', desc: '경로에 맞은 좀비가 일정 시간 얼어붙습니다.' },
  { id: 'fire', name: '일섬·화염', desc: '경로에 맞은 좀비가 몇 초 동안 불에 탑니다.' },
  { id: 'poison', name: '일섬·독', desc: '경로에 맞은 좀비에게 독이 쌓입니다.' },
  { id: 'bell', name: '한 가지 종', desc: '잠시 모든 혼령이 같은 모양의 종을 듭니다.' }
];

function $(id) { return document.getElementById(id); }
function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
function dist(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.hypot(dx, dz); }
function now() { return performance.now(); }

const save = { coins: 0, atkLv: 0, hpLv: 0, coinLv: 0, cleared: 0, lastSeen: Date.now(), best: 0, runs: 0 };
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
    ['coins', 'atkLv', 'hpLv', 'coinLv', 'cleared', 'lastSeen', 'best', 'runs'].forEach(function (k) {
      if (o[k] != null) save[k] = o[k];
    });
  } catch (e) {}
}
function persist(touch) {
  if (touch !== false) save.lastSeen = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}

function showOv(id) {
  ['ov-title', 'ov-shop', 'ov-result', 'ov-idle', 'ov-level'].forEach(function (k) {
    $(k).classList.toggle('show', k === id);
  });
  if (id === 'ov-title') refreshTitleHelp();
}
function hideOvs() {
  ['ov-title', 'ov-shop', 'ov-result', 'ov-idle', 'ov-level'].forEach(function (k) { $(k).classList.remove('show'); });
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
  const elemName = S.dashElem === 'ice' ? '얼음' : S.dashElem === 'fire' ? '화염' : S.dashElem === 'poison' ? '독' : '';
  const bellBit = S.bellT > 0 ? (' 종' + (SHAPE_MARK[S.bellShape] || '') + Math.ceil(S.bellT) + 's') : '';
  $('dashLabel').textContent = '일섬 ' + S.dashCount + (elemName ? '·' + elemName : '') + bellBit;
  $('coinLabel').textContent = '엽전 ' + save.coins;
  $('lvlLabel').textContent = 'Lv ' + S.level;
  if ($('comboLabel')) {
    $('comboLabel').textContent = '콤보 ' + (S.combo || 0);
    $('comboLabel').classList.toggle('hot', (S.combo || 0) >= 4);
  }
  $('stageLabel').textContent = S.boss ? '보스' : ((S.runNo || 1) + '판');
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
  save.runs = (save.runs || 0) + 1;
  persist();
  return 'map' + (((save.runs - 1) % 3) + 1);
}
function switchMap(id) {
  if (!art || !three) return Promise.resolve(null);
  const want = (id && art.atlas && art.atlas.maps && art.atlas.maps[id]) ? id : 'map1';
  const run = function () {
    return art.applyMap(three.scene, want, three.map).then(function (m) {
      three.map = m;
      three.torches = m.lights || [];
      if (S) S.mapId = m.id;
      applyFxinkAtmo(m.id);
      return { id: m.id, name: m.name, key: m.key };
    });
  };
  if (three._mapP) three._mapP = three._mapP.then(run, run);
  else three._mapP = run();
  const p = three._mapP;
  p.then(function () { if (three._mapP === p) three._mapP = null; });
  return p;
}

async function makeWorld() {
  const view = $('view');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(view.clientWidth, view.clientHeight);
  renderer.shadowMap.enabled = false;
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

  scene.add(new THREE.AmbientLight(0x3a3834, 1.0));
  const hemi = new THREE.HemisphereLight(0x6a6860, 0x1a1612, 1.0);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xc8c0b0, 1.45);
  moon.position.set(-18, 28, 10);
  moon.castShadow = false;
  scene.add(moon);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 16),
    new THREE.MeshBasicMaterial({ color: clear, side: THREE.BackSide })
  );
  scene.add(sky);

  const map = await art.applyMap(scene, 'map1', null);
  const world = { renderer: renderer, scene: scene, camera: camera, map: map, torches: map.lights || [], fx: [], slashes: [], view: view, fxForced: fxQForced };
  try {
    world.bloom = setupBloom(renderer, scene, camera, { quality: fxQ, post: function () { return [createInkWashPass()]; } });
  } catch (e) { world.bloom = null; }
  try {
    world.ink = new InkParticles(scene, { base: FXINK_BASE, quality: fxQ === 'high' ? 'high' : 'low' });
  } catch (e) { world.ink = null; }
  try { prewarmInkSlash(renderer, scene, camera); } catch (e) {}
  if (!world.fxForced) {
    world.aq = new AutoQuality({
      start: fxQ,
      onChange: function (q) {
        fxQ = q;
        if (world.bloom) world.bloom.setQuality(q);
        if (world.ink) world.ink.setQuality(q === 'high' ? 'high' : 'low');
        applyFxinkAtmo((S && S.mapId) || (world.map && world.map.id) || 'map1');
      }
    });
  }
  return world;
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
  hideOvs();
  clearEntities();
  S = {
    playing: true, paused: null, won: false, lost: false, sandbox: !!opts.sandbox,
    hp: CFG.hpBase + save.hpLv * CFG.hpStep, runHp: 0, runCoin: 0,
    timeLeft: opts.time != null ? opts.time : CFG.timeLimit, elapsed: 0,
    dashCount: CFG.dashCount, dashDmg: CFG.dashDmg, pathR: CFG.pathRadius,
    xp: 0, level: 1, iframe: 0, boss: null, bossSpawned: false,
    hero: { x: 0, z: 0 },
    spirits: [], zombies: [], items: [],
    zAcc: 0, sAcc: 0, _id: 0,
    dash: null, dashQueue: [], lastDash: null, shake: 0,
    cam: { x: 0, z: 0 },
    dashElem: null, bellT: 0, bellShape: null, slowT: 0,
    mapId: mapIdOf(opts),
    runNo: 1, pool: SHAPE_UNLOCK.slice(), practiceT: 0, practiceShape: null, practiceSpawns: 0,
    combo: 0, comboIdle: 0, comboMax: 0,
    bursts: [], lastBurst: 0,
    sightWave: 0, lastStrokeDir: null,
    hitstop: 0, hurtFlash: 0, aimTarget: null, bellPans: [], recoil: null,
    ringR: 0, ringLv: 0, bounce: null, landRipple: null,
    spiritCap: CFG.spiritCapStart,
    /* v0.15~v0.17: 참 게이지·패링·선입력·웨이브·자석·진화 */
    charge: 0, chargeLv: 0, magnetR: CFG.magnetR || 1.8,
    parryCd: 0, parryFlash: 0, parryHits: [], cleaveFx: 0, cleaveCount: 0,
    inputBuf: null, comboGrace: 0,
    waveDone: {}, waveBoostT: 0, waveIds: [], wavesFired: [], fogPulse: 0,
    evo: {}, evolved: [], preview: null, lastAxis: 'vline'
  };
  S.runNo = opts.sandbox ? SHAPE_UNLOCK.length : (save.runs || 1);
  S.pool = unlockedShapes(S.runNo);
  const fresh = !opts.sandbox && S.runNo >= 2 && S.runNo <= SHAPE_UNLOCK.length;
  if (fresh) {
    S.practiceShape = SHAPE_UNLOCK[S.runNo - 1];
    S.practiceT = CFG.practiceSec;
    S.practiceSpawns = CFG.practiceSpawns;
  }
  const appEl = $('app');
  if (appEl) {
    appEl.classList.remove('ink-burst');
    clearOnebell(true);
  }
  if (three && three.map && three.map.id !== S.mapId) switchMap(S.mapId);
  else applyFxinkAtmo(S.mapId);
  if (three && three.heroSpr) { three.scene.remove(three.heroSpr); }
  three.heroSpr = addEntityVisual('hero');
  placeGroup(three.heroSpr, 0, 0);
  three.camera.position.set(CFG.camOff.x, CFG.camOff.y, CFG.camOff.z);
  three.camera.lookAt(0, CFG.camLookY, 0);
  applyCameraLens();
  applyRingBoost();
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
  (three.fx || []).forEach(function (f) { three.scene.remove(f.mesh); });
  three.fx = [];
  if (three.ink && three.ink.clear) three.ink.clear();
  (three.slashes || []).forEach(function (s) {
    if (s.mesh) three.scene.remove(s.mesh);
    if (s.dispose) s.dispose();
  });
  three.slashes = [];
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
/* 0초 오프닝: 심안 원 안쪽(0.5~0.8R)에 귀물을 각도 분산 배치해 첫 획부터 3방향 선택이 성립한다. */
function spawnOpening() {
  if (!S) return;
  const R = ringR();
  const n = CFG.openingZombies || 0;
  const ring = CFG.openingRing || [0.5, 0.8];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
    const rr = R * (ring[0] + Math.random() * (ring[1] - ring[0]));
    spawnZombie({
      x: S.hero.x + Math.cos(a) * rr,
      z: S.hero.z + Math.sin(a) * rr,
      type: (i % 4 === 3) ? 'brute' : 'imp'
    });
  }
  seedOpeningSpirits();
}
/** 시작 혼령 3개를 서로 120° 떨어지게 미리 묶어 둔다 — 첫 프레임부터 3방향 선택. */
function seedOpeningSpirits() {
  if (!S) return;
  const cap = Math.min(CFG.spiritMax || 5, S.spiritCap || CFG.spiritCapStart || 3);
  const zs = S.zombies.filter(function (z) { return z.alive; });
  if (!zs.length || cap <= 0) return;
  /* 오프닝 스폰이 이미 최근접 위주로 묶어 둔 혼령은 풀고, 각도가 고른 3방향으로 다시 묶는다. */
  livingMarks().forEach(function (s) { destroySpirit(s); });
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
    if (dist(s.target, S.hero) > outR) { releaseSpirit(s); return; }
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
  if (room <= 0) return;
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
  const bell = ud.bellHang && ud.bellHang.bell;
  if (bell && bell.material) { bell.material.transparent = true; bell.material.opacity = a; }
  if (ud.glow && ud.glow.material) ud.glow.material.opacity = (CFG.spiritGlowAlpha || 0.5) * a;
}
/* A spirit bound to a zombie hovers over its head and follows it; free (test) spirits stay on the ring. */
function placeSpirit(s) {
  const z = s.target;
  if (!z || !z.alive || s.free) { placeSpiritOnRing(s); return; }
  const zh = (z.obj && z.obj.userData && z.obj.userData.worldH) || 2.4;
  s.x = z.x; s.z = z.z;
  if (s.obj) placeGroup(s.obj, s.x, s.z, zh * (CFG.spiritHover || 0.62));
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
  assignSpiritTargets();
  return e;
}
function spawnZombie(opts) {
  opts = opts || {};
  const zr = CFG.zombieRing || [10, 14];
  const p = opts.x != null ? { x: opts.x, z: opts.z } : ringPos(opts.r != null ? opts.r : (zr[0] + Math.random() * (zr[1] - zr[0])));
  const type = opts.type || pickZombieType();
  const def = CFG.zombieTypes[type] || CFG.zombieTypes.imp;
  const grow = 1 + (CFG.hpGrowth || 0) * clamp(S.elapsed / CFG.timeLimit, 0, 1);
  const e = {
    id: ++S._id, kind: 'zombie', type: type, x: p.x, z: p.z, r: def.r, alive: true,
    hp: opts.hp != null ? opts.hp : def.hp * grow, maxHp: def.hp * grow,
    frozen: 0, burn: 0, burnTick: 0, poison: 0, poisonT: 0, poisonTick: 0, stun: 0,
    marked: false, shape: null, isBoss: false, elite: type === 'elite'
  };
  e.obj = addEntityVisual('zombie', type);
  placeGroup(e.obj, e.x, e.z);
  S.zombies.push(e);
  if (qa.noDelay) snapSpiritsToTargets();
  else assignSpiritTargets();
  return e;
}
function spawnItem(opts) {
  opts = opts || {};
  const type = opts.type || 'xp';
  const p = opts.x != null ? { x: opts.x, z: opts.z } : { x: S.hero.x, z: S.hero.z };
  const e = { id: ++S._id, kind: type, x: p.x, z: p.z, r: 0.45, alive: true, shape: opts.shape, dur: opts.dur };
  e.obj = addEntityVisual(type);
  placeGroup(e.obj, e.x, e.z, 0.2);
  S.items.push(e);
  return e;
}
function pickZombieType() {
  const mix = CFG.zombieMix || [[0, { imp: 1 }]];
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
  return (save.runs || 0) + 1;
}
function titleChip(shape) {
  const alt = SHAPE_MARK[shape] || shape;
  const src = art && art.sealUrl ? art.sealUrl(shape) : '';
  return '<span class="hanji-chip" data-shape="' + shape + '" title="' + alt + '"><img src="' + src + '" alt="' + alt + '" width="40" height="40"></span>';
}
function refreshTitleHelp() {
  const el = $('titleShapes') || document.querySelector('.shapes-help');
  if (!el) return upcomingRun();
  const run = upcomingRun();
  const pool = unlockedShapes(run);
  el.innerHTML = pool.map(titleChip).join('');
  const sub = $('titleSub');
  if (sub) {
    if (pool.length === 1) sub.textContent = '1판은 가로선만 나옵니다. 심안(먹안개) 안쪽 혼령 쪽으로 가로로 길게 그어 돌진하세요.';
    else sub.textContent = '주인공 둘레 심안(먹안개) 안쪽 혼령의 종 모양을 그려, 그 혼령 방향으로 돌진하세요';
  }
  return { run: run, pool: pool, html: el.innerHTML };
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
  const pool = spawnPool();
  const a = [];
  for (let i = 0; i < n; i++) a.push(pool[Math.floor(Math.random() * pool.length)]);
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
function bellWorld(s) {
  const hang = s && s.obj && s.obj.userData && s.obj.userData.bellHang;
  if (hang && hang.bell) {
    if (!_proj.c) _proj.c = new THREE.Vector3();
    const bh = (s.obj.userData.bellH != null) ? s.obj.userData.bellH : 0.4;
    /* A spirit's mark is centred on its sprite; a hanging bell is measured from its top. */
    _proj.c.set(0, hang.pivot === null ? 0 : bh * 0.52, 0);
    hang.bell.updateWorldMatrix(true, false);
    _proj.c.applyMatrix4(hang.bell.matrixWorld);
    return { x: _proj.c.x, y: _proj.c.y, z: _proj.c.z };
  }
  const off = (s && s.obj && s.obj.userData && s.obj.userData.bellLocal) || { x: 0, y: 1 };
  return { x: s.x, y: off.y || 1, z: s.z };
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
  S.bellT = dur != null ? dur : CFG.bellDur;
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
/* The shape mark, written like a brush stroke on the 2D layer over the spirit's orb (bloom cannot blur it):
   each stroke presses in heavy, thins out and lifts off; a faint paper glow behind keeps it readable. */
function brushStrokeAlong(ctx, pts, w, color) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  const n = Math.max(8, Math.ceil(total / 0.7));
  ctx.fillStyle = color;
  let si = 0, acc = 0;
  for (let k = 0; k <= n; k++) {
    const want = (k / n) * total;
    while (si < seg.length - 1 && acc + seg[si] < want) { acc += seg[si]; si++; }
    const u = Math.min(1, (want - acc) / (seg[si] || 1));
    const a = pts[si], b = pts[si + 1];
    const t = k / n;
    const r = w * (t < 0.08 ? 1.25 - t * 2 : 1.1 - 0.75 * Math.pow(t, 1.6));
    ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.max(0.4, r), 0, Math.PI * 2); ctx.fill();
  }
}
function drawMarkGlyph(ctx, shape, x, y, size, opt) {
  const k = { hline: [[[-1, 0.08], [0.05, -0.04], [1, 0.02]]], vline: [[[0.04, -1], [-0.03, 0.1], [0.02, 1]]], vee: [[[-0.95, -0.7], [0, 0.85]], [[0, 0.85], [0.95, -0.8]]], bolt: [[[0.45, -1], [-0.45, -0.05]], [[-0.45, -0.05], [0.45, 0.05]], [[0.45, 0.05], [-0.4, 1]]] }[shape];
  if (!k) return;
  opt = opt || {};
  const h = size * 0.46, w = Math.max(1.1, size * 0.09);
  const glow = opt.glow !== false;
  ctx.save();
  /* (a) 옻빛 후광: 먹안개 속에서도 종 위치를 먼저 읽게 한다. */
  const g = ctx.createRadialGradient(x, y, 0, x, y, size * 0.85);
  g.addColorStop(0, 'rgba(91,232,196,0.30)'); g.addColorStop(0.55, 'rgba(91,232,196,0.10)'); g.addColorStop(1, 'rgba(91,232,196,0)');
  ctx.fillStyle = g; ctx.fillRect(x - size, y - size, size * 2, size * 2);
  k.forEach(function (line) {
    const p = line.map(function (q) { return [x + q[0] * h, y + q[1] * h]; });
    /* (b) 청록 네온 잉크 글로우 (넓게) */
    ctx.save();
    if (glow) { ctx.shadowColor = '#5BE8C4'; ctx.shadowBlur = 6; }
    brushStrokeAlong(ctx, p, w * 3.0, 'rgba(91,232,196,0.35)');
    ctx.restore();
    /* (c) 네온 잉크 테두리 */
    brushStrokeAlong(ctx, p, w * 1.9, 'rgba(64,240,214,0.95)');
    /* (d) 거의 검은 먹 코어 — 경계를 선명하게 */
    brushStrokeAlong(ctx, p, w * 0.95, 'rgba(8,7,10,0.96)');
  });
  ctx.restore();
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
    const glyphPx = clamp(Math.round(bellPx * 1.8), CFG.markMinCss || 28, CFG.markMaxCss || 36);
    const on = !(ox < -20 || oy < -20 || ox > r.width + 20 || oy > r.height + 20);
    const item = {
      x: ox, y: oy, ox: ox, oy: oy, cssPx: glyphPx, onScreen: on,
      shape: spiritShape(s), boss: !!s.isBoss, id: s.id, aim: s.id === aimId,
      seq: s === bossSpirit ? (S.boss.seq || []).slice() : null, seqI: s === bossSpirit ? (S.boss.seqI || 0) : 0,
      bellPx: bellPx, bodyPx: bodyPx, glyph: !!s.isBoss, bellTex: (s.obj.userData.bellHang && s.obj.userData.bellHang.bell && s.obj.userData.bellHang.bell.userData && s.obj.userData.bellHang.bell.userData.bellTex) || null
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
  livingMarks().forEach(function (s) {
    if (art.setBellAim) art.setBellAim(s.obj, !!(aimId && s.id === aimId));
  });
  const minD = 8;
  /* Separate overlapping glyphs enough to read; stay near the bell when already apart. */
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }
        const need = Math.max(a.cssPx || size, b.cssPx || size) * 0.9 + 0.05;
        if (d < need) {
          const push = (need - d) * 0.5;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }
    }
  }
  let minSep = 9999;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      minSep = Math.min(minSep, Math.hypot(placed[j].x - placed[i].x, placed[j].y - placed[i].y));
    }
  }
  lastMarkMetrics.minSep = placed.length > 1 ? minSep : minD;
  lastMarkMetrics.markStyle = 'neon-brush';
  lastMarkMetrics.glyphOn = 'all';
  if (placed.length) {
    lastMarkMetrics.cssPx = placed.reduce(function (m, p) { return Math.max(m, p.cssPx || 0); }, 0) || size;
    lastMarkMetrics.bellPx = placed.reduce(function (m, p) { return Math.max(m, p.bellPx || 0); }, 0);
    lastMarkMetrics.bodyPx = placed.reduce(function (m, p) { return Math.max(m, p.bodyPx || 0); }, 0);
  }
  const denseGlow = (placed.length <= 6) && (((fps.last || 60) >= 50) && fxQ !== 'low' && fxQ !== 'off');
  lastMarkMetrics.denseGlow = denseGlow;
  placed.forEach(function (m) {
    /* 밀집도: 60px 안에 기호가 3개 이상이면 1.15배 확대해 서로 묻히지 않게 한다. */
    let near = 0;
    placed.forEach(function (o) { if (o !== m && Math.hypot(o.x - m.x, o.y - m.y) < 60) near++; });
    const dense = near >= 2;
    m.dense = dense;
    m.drawPx = Math.round((m.cssPx || size) * (dense ? 1.15 : 1));
    const x = m.x, y = m.y - 6;
    const gsize = m.drawPx;
    ctx.save();
    drawMarkGlyph(ctx, m.shape, x, y, gsize, { glow: denseGlow });
    if (m.seq && m.seq.length) {
      const gap = size * 0.38;
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
    }
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
    const e = projectXZ(b.x + dx / L * 9, b.z + dz / L * 9, 0.12);
    const tf = clamp((b.stateT || 0) / 1.1, 0, 1);
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
  const cut = (rec.hits || []).some(function (h) { return h.why === 'slash'; });
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
  const bound = CFG.playBound || 28;
  let x = to.x, z = to.z;
  const ro = Math.hypot(x, z);
  if (ro > bound) { x *= bound / ro; z *= bound / ro; }
  const dx = x - from.x, dz = z - from.z, L = Math.hypot(dx, dz) || 1;
  function blocked(px, pz) {
    if (Math.hypot(px, pz) > bound + 0.01) return true;
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
function clipBound(p) {
  const bound = CFG.playBound || 28;
  const ro = Math.hypot(p.x, p.z);
  if (ro <= bound) return { x: p.x, z: p.z };
  return { x: p.x * bound / ro, z: p.z * bound / ro };
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
  beginDash(b.type, { dir: b.dir });
  return true;
}
function beginDash(shape, opts) {
  opts = opts || {};
  if (!S || !S.playing || S.paused || S.dash) return null;
  const n = S.dashCount;
  const dir = ('dir' in opts) ? opts.dir : (S.lastStrokeDir || null);
  const targets = pickSpirits(shape, n, S.hero, dir, null);
  if (!targets.length) { toast('화면에 그 모양이 없어요'); return { type: shape, targets: [], hits: [], items: [] }; }
  const rec = { type: shape, targets: targets.map(function (t) { return t.id; }), hits: [], items: [], t0: now(), segs: [], elem: S.dashElem, cinematic: false };
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
  if (boss && boss.alive && segDist(boss.x, boss.z, d.from.x, d.from.z, hitTo.x, hitTo.z) <= pathR() + boss.r) {
    cutBoss(boss);
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
  if (S.evo && S.evo.fireTrail) {
    S.clouds = S.clouds || [];
    S.clouds.push({ kind: 'fire', x: at.x, z: at.z, t: 4, tick: 0, r: 1.5 });
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
  const R = CFG.parryR || 2.4;
  const hits = [];
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
    const d = dist(z, S.hero);
    if (d > R + (z.r || 0.55)) return;
    hits.push(z.id);
    hurtZombie(z, CFG.parryDmg || 0.5, 'parry', r);
    if (z.alive) {
      const ux = d < 1e-3 ? 1 : (z.x - S.hero.x) / d;
      const uz = d < 1e-3 ? 0 : (z.z - S.hero.z) / d;
      const push = CFG.parryPush || 1.6;
      z.x += ux * push; z.z += uz * push;
      z.stun = Math.max(z.stun || 0, CFG.parryStun || 0.35);
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
    showJudge('챙-');
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
    if (iceCleave) z.frozen = Math.max(z.frozen || 0, 3);
    if (z.frozen > 0) shatterZombie(z, rec);
    else if (z.poison > 0) explodeZombie(z, rec);
    else hurtZombie(z, dmg, 'cleave', rec);
  });
  rec.cleaveHits = hitIds;
  rec.targets = hitIds;
  S.shake = Math.max(S.shake || 0, 0.9);
  S.slowT = Math.max(S.slowT || 0, 0.35);
  addHitstop(0.12);
  if (audio) { audio.explode(); audio.bell(0, 'bolt'); }
  if (three && three.ink) three.ink.hit(S.hero.x + 0.5, S.hero.z, 0, 1);
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
/* 착지 자석: 반경 안의 혼백구·엽전이 곡선으로 빨려온다. */
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
  const r = pathR(), dmg = dashDmg();
  const dx = to.x - from.x, dz = to.z - from.z, L2 = dx * dx + dz * dz || 1;
  const hit = S.zombies.filter(function (z) {
    return z.alive && z !== skip && !z.isBoss && segDist(z.x, z.z, from.x, from.z, to.x, to.z) <= r + z.r;
  });
  /* Nearest along the cut takes full damage; each one after it a little less. */
  hit.sort(function (a, b) { return ((a.x - from.x) * dx + (a.z - from.z) * dz) / L2 - ((b.x - from.x) * dx + (b.z - from.z) * dz) / L2; });
  hit.forEach(function (z, k) {
    hurtZombie(z, dmg * Math.pow(CFG.pierceFalloff || 1, k), 'slash', rec);
    if (z.alive) applyElement(z, S.dashElem, rec);
    else spreadElement(z, S.dashElem, rec);
  });
  S.items.slice().forEach(function (it) {
    if (!it.alive) return;
    if (segDist(it.x, it.z, from.x, from.z, to.x, to.z) <= r + it.r) collectItem(it, rec);
  });
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
  else if (three && three.ink) {
    const d = inkDir(rec, z);
    three.ink.hit(z.x, z.z, d.x, d.z);
    fxinkStat.hits++;
  }
}
function applyElement(z, elem, rec) {
  if (!z.alive || !elem) return;
  if (elem === 'fire') {
    if (z.frozen > 0) shatterZombie(z, rec);
    else if (z.poison > 0) explodeZombie(z, rec);
    else applyBurn(z, rec);
  } else if (elem === 'ice') {
    z.frozen = CFG.iceDur;
    z.burn = 0;
    if (rec) rec.statuses = (rec.statuses || []).concat([{ id: z.id, ice: true }]);
    tintZombie(z);
  } else if (elem === 'poison') {
    z.poison = Math.min(CFG.poisonMax, (z.poison || 0) + 1);
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
    S.clouds.push({ x: z.x, z: z.z, t: CFG.poisonCloudDur || 3, tick: 0, r: S.evo && S.evo.poisonSpread ? 3.2 : (CFG.poisonCloudR || 2) });
    if (art.playFx && three) { const fx = art.playFx(three.scene, 'poison-burst', z.x, z.z, 2.6); if (fx) three.fx.push(fx); }
    return;
  }
  S.zombies.forEach(function (o) {
    if (!o.alive || o === z || o.isBoss || dist(o, z) > R + o.r) return;
    if (elem === 'fire') applyElement(o, 'fire', rec);
    else if (elem === 'ice') { o.slowT = CFG.iceSlowDur || 2; tintZombie(o); }
  });
}
function applyBurn(z, rec) {
  z.burn = CFG.burnDur;
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
  hurtZombie(z, CFG.shatterDmg, 'shatter', rec);
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
    c.t -= dt; c.tick += dt;
    if (c.tick < CFG.poisonPeriod) return;
    c.tick -= CFG.poisonPeriod;
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
    if (z.frozen > 0) { z.frozen -= dt; if (z.frozen < 0) z.frozen = 0; }
    if (z.burn > 0) {
      z.burn -= dt;
      z.burnTick = (z.burnTick || 0) + dt;
      while (z.alive && z.burnTick >= CFG.burnPeriod) {
        z.burnTick -= CFG.burnPeriod;
        hurtZombie(z, CFG.burnDmg, 'burn', S.lastDash);
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
          hurtZombie(z, z.poison * CFG.poisonDmgPer, 'poison', S.lastDash);
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
  const s = createInkSlash({
    from: from, to: to,
    width: pathR() * 1.6 * 1.2,
    elem: S && S.dashElem,
    coreGain: q === 'off' ? 1.2 : 1.6
  });
  three.scene.add(s.mesh);
  three.slashes = three.slashes || [];
  three.slashes.push(s);
  if (three.ink) three.ink.slash(from, to);
  fxinkStat.slashes++;
  if (S && S.dashElem === 'fire' && art.trailTex) {
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
function killZombie(z, rec) {
  if (!z || !z.alive) return;
  z.alive = false;
  if (S && S.spirits) S.spirits.forEach(function (s) { if (s.target === z) s.target = null; });
  assignSpiritTargets();
  z.marked = false;
  if (z.obj) three.scene.remove(z.obj);
  if (three && three.ink) {
    const d = inkDir(rec || (S && S.lastDash), z);
    three.ink.kill(z.x, z.z, d.x, d.z);
    fxinkStat.kills++;
  }
  if (rec && rec.hits && rec.hits.some(function (h) { return h.id === z.id && h.why === 'slash'; })) addHitstop(CFG.hitstopKill || 0.06);
  const kd = CFG.zombieTypes[z.type] || CFG.zombieTypes.imp;
  grantKill(kd.coin);
  gainXp(CFG.xpPerKill * kd.xp);
  /* 혼백구 100% + 20% 추가 드롭, 정예는 부적 상자 */
  spawnItem({ type: 'xp', x: z.x, z: z.z });
  if (Math.random() < 0.2) spawnItem({ type: dropType(), x: z.x + (Math.random() - 0.5) * 0.7, z: z.z + (Math.random() - 0.5) * 0.7 });
  if (z.elite) spawnItem({ type: 'charm', x: z.x, z: z.z });
  /* 참 게이지 */
  if (!z.isBoss) addCharge(CFG.cleaveGainKill || 7);
  /* 사방 한기(寒氣): 얼어붙은 적이 죽으면 사방으로 얼음 검기 */
  if (S.evo && S.evo.frostNova && (z.frozen > 0 || z.slowT > 0) && !z.novaDone) {
    z.novaDone = true;
    S.zombies.forEach(function (o) {
      if (!o.alive || o === z || o.isBoss) return;
      if (dist(o, z) <= 3) hurtZombie(o, 4, 'frost', rec);
    });
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
function collectItem(it, rec) {
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
    S.runHp += 0; S.hp = Math.min(maxHp(), S.hp + 3);
  } else if (it.kind === 'coin') {
    save.coins += Math.round(5 * coinMult()); persist();
  } else if (it.kind === 'xp') gainXp(1);
  else if (it.kind === 'ice' || it.kind === 'fire' || it.kind === 'poison') { setDashElem(it.kind); checkEvolutions(); }
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
/* 스킬 진화: 조합이 갖춰지면 화면과 손에서 바로 티나는 효과가 켜진다. */
function checkEvolutions() {
  if (!S) return;
  const has = S.evo || (S.evo = {});
  S.evolved = S.evolved || [];
  const el = S.dashElem;
  function born(key, name) {
    if (has[key]) return;
    has[key] = true;
    S.evolved.push(name);
    toast('✦ 진화: ' + name);
    showJudge('✦ ' + name);
    if (audio) audio.bell(0, 'bolt');
  }
  if (S.dashCount >= 2 && el === 'fire') born('fireTrail', '묵염(墨炎) 장판');
  if (el === 'ice' && S.pathR >= (CFG.pathRadius + 1.0)) born('frostNova', '사방 한기(寒氣)');
  if (el === 'poison' && S.dashCount >= 2) born('poisonSpread', '독운(毒雲) 확산');
  if ((S.chargeLv || 0) > 0 && el === 'ice') born('iceCleave', '빙참(氷斬)');
  if (S.bellT > 0 && S.dashCount >= 3) born('myriadBell', '만종(萬鐘)');
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
function openLevelUp() {
  /* 참(斬) 연출 중에는 카드를 잠시 미룬다 — 필살의 손맛을 가리지 않도록. */
  if (S && S.cleaveFx > 0.05) { S._cleaveLv = (S._cleaveLv || 0) + 1; return; }
  if (S.paused === 'levelup') { S._pendingLv = (S._pendingLv || 0) + 1; return; }
  S.paused = 'levelup';
  const pool = RUN_UPGRADES.slice(), picks = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const k = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(k, 1)[0]);
  }
  if ((S.ringLv || 0) < (CFG.ringLvMax || 4) && !picks.some(function (u) { return u.id === 'ring'; })) {
    const ringUp = RUN_UPGRADES.filter(function (u) { return u.id === 'ring'; })[0];
    if (ringUp) picks[picks.length ? picks.length - 1 : 0] = ringUp;
  }
  S.levelPicks = picks;
  const boxEl = $('levelChoices'); boxEl.innerHTML = '';
  picks.forEach(function (u) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.dataset.up = u.id;
    b.innerHTML = '<strong>' + u.name + '</strong><br>' + u.desc;
    b.addEventListener('click', function () { pickUpgrade(u.id); });
    boxEl.appendChild(b);
  });
  showOv('ov-level');
}
function pickUpgrade(id) {
  if (!S || S.paused !== 'levelup') return false;
  if (id === 'dmg') S.dashDmg += 1;
  else if (id === 'width') S.pathR += 0.55;
  else if (id === 'dash') S.dashCount += 1;
  else if (id === 'ring') { S.ringLv = (S.ringLv || 0) + 1; applyRingBoost(); }
  else if (id === 'heal') { S.runHp += 2; S.hp = Math.min(maxHp(), S.hp + 5); }
  else if (id === 'wealth') S.runCoin += 0.25;
  else if (id === 'ice' || id === 'fire' || id === 'poison') setDashElem(id);
  else if (id === 'bell') startBell(null, S.evo && S.evo.myriadBell ? 12 : CFG.bellDur);
  else if (id === 'magnet') S.magnetR = Math.min(CFG.magnetMax || 3.6, (S.magnetR || CFG.magnetR || 1.8) + (CFG.magnetStep || 0.6));
  else if (id === 'charge') S.chargeLv = (S.chargeLv || 0) + 1;
  hideOvs(); S.paused = null; renderHud();
  checkEvolutions();
  if (S._pendingLv) { S._pendingLv--; openLevelUp(); }
  return true;
}

/* 보스 돌진 예고(walk → telegraph → charge → stun) 상태기계. 이동을 직접 처리했으면 true. */
function stepBoss(z, dt) {
  if (!z || !z.alive || !S) return false;
  z.state = z.state || 'walk';
  z.stateT = (z.stateT || 0) + dt;
  if (z.state === 'walk') {
    if (z.stateT > 4.5) {
      z.state = 'telegraph'; z.stateT = 0;
      z.aim = { x: S.hero.x, z: S.hero.z };
      if (audio) audio.drum();
    }
    return false;
  }
  if (z.state === 'telegraph') {
    if (z.stateT > 1.1) {
      z.state = 'charge'; z.stateT = 0;
      const dx = (z.aim ? z.aim.x : S.hero.x) - z.x, dz = (z.aim ? z.aim.z : S.hero.z) - z.z;
      const L = Math.hypot(dx, dz) || 1;
      z.chargeDir = { x: dx / L, z: dz / L };
      if (audio) audio.slash();
    }
    return true;
  }
  if (z.state === 'charge') {
    const sp = 20;
    z.x += (z.chargeDir ? z.chargeDir.x : 0) * sp * dt;
    z.z += (z.chargeDir ? z.chargeDir.z : 0) * sp * dt;
    if ((S.iframe || 0) <= 0 && dist(z, S.hero) < z.r + 0.7) {
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
    if (z.stateT > 0.45) { z.state = 'stun'; z.stateT = 0; }
    return true;
  }
  if (z.state === 'stun') {
    if (z.stateT > 1.2) { z.state = 'walk'; z.stateT = 0; }
    return true;
  }
  return false;
}
function maybeEnd() {
  if (!S || S.won || S.lost || !S.playing) return;
  if (S.hp <= 0) { endRun(false, '좀비에게 닿았습니다.'); return; }
  if (S.boss && !S.boss.alive) endRun(true, '귀물을 베었습니다.');
}
function endRun(win, msg) {
  if (!S || S.won || S.lost) return;
  S.won = win; S.lost = !win; S.playing = false; S.paused = 'result'; S.dash = null;
  if (win) { save.cleared = Math.max(save.cleared, 1); persist(); }
  if (audio) audio.stopBgm();
  $('resultTitle').textContent = win ? '생존' : '패배';
  $('resultBody').textContent = (msg || '') + ' 엽전 ' + save.coins;
  $('btnResultGo').textContent = '다시';
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
  if (S.bellT > 0) {
    S.bellT -= dt;
    if (S.bellT <= 0) endBell();
  }
  if (!S.sandbox && !S.bossSpawned && S.elapsed >= CFG.bossAt) {
    spawnBoss({ r: CFG.bossSpawnR, nShapes: CFG.bossShapes });
    toast('부적을 단 귀물이 다가옵니다');
  }
  /* 포위 웨이브 (20s / 40s) */
  if (!S.sandbox) {
    (CFG.waves || []).forEach(function (w) {
      if (!S.waveDone[w.t] && S.elapsed >= w.t) fireWave(w);
    });
  }
  const wave = 1 + 0.7 * clamp(S.elapsed / CFG.timeLimit, 0, 1);
  if (!S.sandbox) {
    S.zAcc += dt * 1000;
    S.sAcc += dt * 1000;
    const practicing = (S.practiceT > 0) && (S.practiceSpawns > 0);
    const delayed = S.elapsed < (CFG.spawnZombieDelay || 12);
    const early = S.elapsed < (CFG.earlyZombieUntil || 25);
    let zMax = CFG.spawnZombieMax || 20;
    /* 웨이브 중에는 잔몹 스폰을 멈춰 45마리까지 쌓이지 않게 한다(포위는 웨이브가 만든다). */
    if (S.waveBoostT > 0) zMax = 0;
    let zBase = CFG.spawnZombieMs;
    if (practicing) { zMax = CFG.practiceZombieMax || 2; zBase = CFG.practiceZombieMs || 3200; }
    else if (delayed) { S.zAcc = 0; zMax = 0; }
    else if (early) { zMax = CFG.earlyZombieMax || 4; zBase = Math.max(zBase, CFG.earlyZombieMinMs || 2000); }
    const zms = Math.max(CFG.spawnZombieMinMs || 450, zBase / (practicing || delayed ? 1 : wave));
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
    const bossHandled = z.isBoss ? stepBoss(z, dt) : false;
    if (!qa.noMove && !frozen && !bossHandled) {
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
    if (art.setTelegraph && !z.isBoss) art.setTelegraph(z.obj, !frozen && d < (CFG.telegraphRange || 3.2));
    if (d < z.r + 0.55) {
      if ((S.iframe || 0) <= 0 && !S.dash) {
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
  refreshSpirits();
  S.items.forEach(function (it) {
    if (!it.alive) return;
    /* 자석으로 날아오는 중 */
    if (it.home) {
      it.home.t += dt;
      const u = clamp(it.home.t / (it.home.dur || 0.18), 0, 1);
      const k = u * u;
      it.x = it.home.from.x + (S.hero.x - it.home.from.x) * k;
      it.z = it.home.from.z + (S.hero.z - it.home.from.z) * k;
      if (u >= 1) { collectItem(it, null); return; }
    }
    placeGroup(it.obj, it.x, it.z, 0.2 + Math.sin(S.elapsed * 3 + it.id) * 0.08);
  });
  renderHud();
  /* Check time after autoStroke/combat so a large timeScale dt cannot skip the last boss hit. */
  if (S.playing && S.timeLeft <= 0) {
    if (S.boss && !S.boss.alive) endRun(true, '시간을 버텼습니다.');
    else endRun(false, '시간이 끝났습니다.');
  }
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
  if (!S) return;
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
    S.inputBuf = { type: rec.type, dir: dir, t0: now(), ttl: CFG.inputBufMs || 200 };
    inkFade = 0.20;
    showJudge('예약');
    rec.buffered = true;
    rec.targets = [];
    return rec;
  }
  const dash = beginDash(rec.type, { dir: dir });
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
  label($('buyCoin'), '코인 획득', save.coinLv, '획득량 ×' + (1 + save.coinLv * CFG.coinStep).toFixed(2));
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
function drawRingFog(fog, w, h) {
  const pts = ringScreenPts();
  if (!pts || !pts.length) return;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  pts.forEach(function (p) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; });
  const ex = (x0 + x1) / 2, ey = (y0 + y1) / 2, rx = Math.max(10, (x1 - x0) / 2), ry = Math.max(10, (y1 - y0) / 2);
  const t = (S && S.elapsed) || 0;
  const pulse = (S && S.fogPulse) || 0;
  fog.fillStyle = 'rgba(' + CFG.fogColor.join(',') + ',' + CFG.fogAlpha + ')';
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
    gw.addColorStop(0, pale ? 'rgba(160,162,158,' + al.toFixed(3) + ')' : 'rgba(' + CFG.fogColor.join(',') + ',' + al.toFixed(3) + ')');
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
  if (S && S.paused === 'levelup' && (qa.autoStroke || (qa.noDelay && qa.timeScale > 1))) {
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
    (three.torches || []).forEach(function (t, i) {
      const flick = t.base * (0.85 + Math.sin(ts / 120 + i) * 0.12 + Math.random() * 0.06);
      if (t.light) t.light.intensity = flick;
      if (t.glow && t.glow.material) {
        t.glow.material.opacity = 0.55 + Math.sin(ts / 90 + i) * 0.12;
        const sc = 0.95 + Math.sin(ts / 80 + i) * 0.08;
        const gb = t.glow.userData.baseScale || 2.4;
        t.glow.scale.set(gb * sc, gb * sc, 1);
      }
    });
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
    if (three.aq && !three.fxForced && !qa.noDelay) three.aq.tick(real);
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
  $('btnStart').addEventListener('click', function () { startRun(); });
  $('btnShop').addEventListener('click', function () { refreshShop(); showOv('ov-shop'); });
  $('btnShopClose').addEventListener('click', function () {
    if (S && (S.won || S.lost)) showOv('ov-result');
    else showOv('ov-title');
  });
  $('btnResultShop').addEventListener('click', function () { refreshShop(); showOv('ov-shop'); });
  $('btnResultGo').addEventListener('click', function () { startRun(); });
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
  applyFxinkAtmo((three.map && three.map.id) || 'map1');
  loadMarkImages();
  resizeInk();
  guardEvents();
  bindUi();
  onResize();
  renderHud();
  refreshTitleHelp();
  const idled = checkIdle();
  if (!idled) showOv('ov-title');
  persist();
  if (!raf) loop(now());
  window.GPv2.ready = true;
  window.GPv2.assetsUsed = art.used;
}

const GPv2 = {
  CFG: CFG, SHAPE_MARK: SHAPE_MARK,
  get save() { return save; },
  get state() { return S; },
  get ready() { return !!this._ready; },
  set ready(v) { this._ready = v; },
  resetSave: function () {
    save.coins = 0; save.atkLv = 0; save.hpLv = 0; save.coinLv = 0;
    save.cleared = 0; save.lastSeen = Date.now(); save.best = 0; save.runs = 0;
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
  setElement: function (el) { setDashElem(el); },
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
    const list = CFG.waves || [];
    const w = list.filter(function (x) { return t == null || x.t === t; })[0];
    if (!w) return null;
    fireWave(w);
    return { t: w.t, spawned: (S && S.waveIds || []).length };
  },
  waves: function () { return (CFG.waves || []).map(function (w) { return { t: w.t, n: w.n, fired: !!(S && S.waveDone && S.waveDone[w.t]) }; }); },
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
      aq: three && three.aq && three.aq.q,
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
        const hang = s.obj && s.obj.userData && s.obj.userData.bellHang;
        const bellTex = hang && hang.bell && hang.bell.userData && hang.bell.userData.bellTex;
        return {
          id: s.id, shape: spiritShape(s), x: s.x, z: s.z, angle: s.angle, avoid: s.avoid || 0,
          sx: fs.x, sy: fs.y, screenAngle: screenAngleTo(fs.x, fs.y, hs),
          rimErr: rimErrorPx(fs.x, fs.y), bellTex: bellTex || null,
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
