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
  hpBase: 10, dmg: 1, bossDmg: 3, iframeMs: 800,
  timeLimit: 75, bossAt: 50, bossShapes: 5,
  coinPerKill: 3, comboExtra: 2,
  idlePerMin: 4, idleMaxHours: 8,
  upgradeBase: 15, atkStep: 0.08, hpStep: 3, coinStep: 0.25, maxLv: 10,
  xpBase: 5, xpPerKill: 1,
  dashDur: 0.28, pathRadius: 1.35, dashDmg: 2, zombieHp: 2, spiritHp: 1,
  perfectPathBonus: 0.4,
  dashCount: 1, spawnZombieMs: 1250, spawnSpiritMs: 950,
  spawnZombieMax: 16, spawnSpiritMax: 0,
  spawnZombieMinMs: 450, spawnSpiritMinMs: 480,
  spawnZombieDelay: 5, practiceZombieMs: 3200, practiceZombieMax: 2, earlyZombieMax: 4, earlyZombieUntil: 25,
  spiritCapStart: 1, spiritMax: 4, sameShapeMax: 2, spiritExitMul: 1.08, spiritDimAlpha: 0.35, spiritGlowAlpha: 0.5,
  ringScreenFrac: 0.70, ringMaxFrac: 0.90, ringBoost: 0.14, ringLvMax: 4,
  spiritOmega: 2.8, spiritAvoidMax: 0.30, spiritAvoidOmega: 8, bossSpeed: 1.0, bossSpawnR: 14,
  dashThroughMul: 1.5, dashPastTarget: 0.8, playBound: 28,
  landBounce: 0.28, landBounceT: 0.16, landRippleDur: 0.45,
  landIframe: 0.25, landShockR: 1.6, landPush: 1.2, landStun: 0.3, landPast: 1.0,
  slideNear: 1.4, slideExtra: 1.5,
  hitstopKill: 0.06, hitstopKillMax: 0.12, hitHitstop: 0.08, hitKnock: 0.6,
  recoilU: 0.12, recoilT: 0.12, hurtVignette: 0.3,
  aimConeCos: 0.5, aimNearW: 0.35, telegraphRange: 3.2,
  spiritRing: [5, 7.2], zombieRing: [9, 13],
  zombieSpeed: 2.15, spiritSpeed: 0.55,
  camOff: { x: 14.4, y: 22.4, z: 14.4 }, camLookY: 1.2, fov: 62,
  markMinCss: 40, markMaxCss: 72,
  bpm: 100, beatWindow: 0.09, beatGood: 0.18, comboTimeout: 2.8,
  perfectDmgMul: 1, comboBurstAt: [4, 8, 12],
  comboBurstR: [3.2, 4.2, 5.2], comboBurstDmg: [1, 1.5, 2],
  practiceSec: 10, practiceSpawns: 6, comboBurstMs: 220,
  iceDur: 2.5, burnDur: 3, burnPeriod: 0.75, burnDmg: 1,
  poisonMax: 5, poisonDur: 4, poisonPeriod: 1, poisonDmgPer: 1,
  shatterDmg: 4, explodeDmg: 3, explodeR: 2.5,
  bellDur: 8, slowDur: 0.9, slowScale: 0.35,
  sightWaveDur: 0.45
};
const RUN_UPGRADES = [
  { id: 'dmg', name: '돌진 데미지', desc: '일섬이 좀비에게 더 큰 상처를 남깁니다.' },
  { id: 'width', name: '경로 폭', desc: '베기 선이 넓어져 더 많은 것을 스칩니다.' },
  { id: 'dash', name: '일섬 횟수', desc: '같은 모양 혼령 방향으로 한 번 더 이어 돌진합니다.' },
  { id: 'ring', name: '푸른 원 반경', desc: '심안 원이 넓어져 좀비를 더 멀리서 느낍니다.' },
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
const qa = { timeScale: 1, noDelay: false, sandbox: false, atkRoll: null, noMove: false };
let S = null, art = null, three = null, raf = 0, lastTs = 0, toastT = 0;
const audio = createAudio();
let idlePending = 0;
const pointers = { down: false, id: null, pts: [] };
const fps = { samples: [], last: 0 };
let lastStroke = null, inkFade = 0;

function costOf(lv) { return CFG.upgradeBase * (lv + 1); }
function atkChance() { return Math.min(CFG.maxLv, save.atkLv) * CFG.atkStep; }
function maxHp() { return CFG.hpBase + save.hpLv * CFG.hpStep + (S && S.runHp || 0); }
function coinMult() { return 1 + save.coinLv * CFG.coinStep + (S && S.runCoin || 0); }
function dashDmg() {
  let d = (S && S.dashDmg) || CFG.dashDmg;
  if (S && S.combo > 1) d += Math.min(2, (S.combo - 1) * 0.1);
  const roll = (qa && typeof qa.atkRoll === 'function') ? qa.atkRoll() : Math.random();
  if (roll < atkChance()) d += 1;
  return d;
}
function pathR() {
  let r = (S && S.pathR) || CFG.pathRadius;
  if (S && (S.pendingPerfect || (S.dash && S.dash.perfect))) r += (CFG.perfectPathBonus || 0.4);
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
function xpNeed(lv) { return CFG.xpBase + (lv - 1) * 4; }
function renderHud() {
  if (!S) {
    $('timer').textContent = '—';
    $('dashLabel').textContent = '일섬 1';
    $('coinLabel').textContent = '엽전 ' + save.coins;
    $('lvlLabel').textContent = 'Lv —';
    if ($('comboLabel')) { $('comboLabel').textContent = '콤보 0'; $('comboLabel').classList.remove('hot'); }
    $('xpFill').style.width = '0%';
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
  fillHp();
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
    combo: 0, comboIdle: 0, comboMax: 0, pendingPerfect: false, lastJudge: null,
    perfects: 0, misses: 0, bursts: [], lastBurst: 0,
    beatPulse: 0, lastBeat: -1,
    sightWave: 0, lastStrokeDir: null,
    hitstop: 0, hurtFlash: 0, aimTarget: null, bellPans: [], recoil: null,
    ringR: 0, ringLv: 0, bounce: null, landRipple: null,
    spiritCap: CFG.spiritCapStart
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
  const host = $('app') || $('ink');
  const r = host ? host.getBoundingClientRect() : { width: 375, height: 667 };
  const p = screenOf(ent);
  const m = margin == null ? 20 : margin;
  return !(p.x < -m || p.y < -m || p.x > r.width + m || p.y > r.height + m);
}
function livingThreats() {
  if (!S) return [];
  return (S.zombies || []).filter(function (z) { return z.alive; });
}
/* A spirit appears only for a threat inside the mind's-eye ring: the nearest ones (boss first) up to the spirit cap. */
function assignSpiritTargets() {
  if (!S) return;
  const R = ringR();
  const cap = Math.min(CFG.spiritMax || 4, S.spiritCap || 1);
  const bound = livingMarks().filter(function (s) { return !s.free; });
  const near = livingThreats().filter(function (z) {
    const held = bound.some(function (s) { return s.target === z; });
    return dist(z, S.hero) < R * (held ? (CFG.spiritExitMul || 1.08) : 1);
  });
  near.sort(function (a, b) {
    if (a.isBoss && !b.isBoss) return -1;
    if (b.isBoss && !a.isBoss) return 1;
    return dist(a, S.hero) - dist(b, S.hero);
  });
  const want = near.slice(0, cap);
  bound.forEach(function (s) {
    if (!s.target || !s.target.alive || want.indexOf(s.target) < 0) destroySpirit(s);
  });
  want.forEach(function (z) {
    if (!livingMarks().some(function (s) { return s.target === z; })) spawnSpirit({ x: z.x, z: z.z, target: z });
  });
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
    placeSpiritOnRing(s);
    setSpiritAlpha(s);
    if (art.tickChar) art.tickChar(s.obj, 'spirit', 'idle', Math.min(0.05, dt), 0, 0);
  });
}
function setSpiritAlpha(s) {
  const ud = s && s.obj && s.obj.userData;
  if (!ud) return;
  const dim = CFG.spiritDimAlpha == null ? 0.35 : CFG.spiritDimAlpha;
  const k = Math.max((S && S.beatPulse) || 0, (S && S.sightWave) || 0);
  const a = dim + (1 - dim) * clamp(k, 0, 1);
  if (ud.sprite && ud.sprite.material) { ud.sprite.material.transparent = true; ud.sprite.material.opacity = a; }
  const bell = ud.bellHang && ud.bellHang.bell;
  if (bell && bell.material) { bell.material.transparent = true; bell.material.opacity = a; }
  if (ud.glow && ud.glow.material) ud.glow.material.opacity = (CFG.spiritGlowAlpha || 0.5) * a;
}
function addSpirit(opts) {
  opts = opts || {};
  if (!S) return null;
  if (!opts.force && livingMarks().length >= (CFG.spiritMax || 4)) return null;
  return spawnSpirit(opts);
}
function setSpiritCount(n) {
  if (!S) return [];
  n = clamp(n | 0, 0, CFG.spiritMax || 4);
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
  const vis = (S.bellT > 0 && S.bellShape) ? S.bellShape : e.shape;
  e.obj = addEntityVisual('spirit', vis);
  if (S.bellT > 0 && art.setAura) art.setAura(e.obj, true);
  placeSpiritOnRing(e);
  S.spirits.push(e);
  if (S.practiceSpawns > 0 && S.practiceShape && e.shape === S.practiceShape) S.practiceSpawns--;
  setSpiritAlpha(e);
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
  const e = {
    id: ++S._id, kind: 'zombie', x: p.x, z: p.z, r: 0.55, alive: true,
    hp: opts.hp != null ? opts.hp : CFG.zombieHp,
    frozen: 0, burn: 0, burnTick: 0, poison: 0, poisonT: 0, poisonTick: 0, stun: 0,
    marked: false, shape: null, isBoss: false
  };
  e.obj = addEntityVisual('zombie');
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
    if (pool.length === 1) sub.textContent = '1판은 가로선만 나옵니다. 원 위 혼령 쪽으로 가로로 길게 그어 돌진하세요.';
    else sub.textContent = '주인공 둘레 푸른 원 위의 종 모양을 그려, 그 혼령 방향으로 돌진하세요';
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
    _proj.c.set(0, bh * 0.52, 0);
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
      copy.sort(function (a, b) { return dist(a, from) - dist(b, from); });
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
      if (art.setSpiritShape) art.setSpiritShape(s.obj, s.isBoss ? s.seq[s.seqI] : s.shape);
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
  const min = CFG.markMinCss || 40;
  const max = CFG.markMaxCss || 72;
  return clamp(Math.round(min * Math.sqrt((w || 375) / 375)), min, max);
}

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
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(6, 5, 4, 0.42)';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(46, 230, 166, 0.10)';
      ctx.lineWidth = 12;
      ctx.stroke();
      for (let i = 0; i < pts.length; i++) {
        const hsh = Math.abs(Math.sin(i * 127.1 + 7 * 311.7) * 43758.5453) % 1;
        if (hsh < 0.14) continue;
        const a = pts[i], b = pts[(i + 1) % pts.length];
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(214, 236, 240, ' + (0.5 + 0.25 * hsh).toFixed(3) + ')';
        ctx.lineWidth = 1.6 + 1.2 * hsh;
        ctx.stroke();
      }
      ctx.restore();
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
    const glyphPx = clamp(Math.round(bellPx * 0.82), 28, 80);
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
        const need = Math.max(a.cssPx || size, b.cssPx || size) * 0.85 + 0.05;
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
  lastMarkMetrics.markStyle = 'bell-tex';
  lastMarkMetrics.glyphOn = 'boss-only';
  if (placed.length) {
    lastMarkMetrics.cssPx = placed.reduce(function (m, p) { return Math.max(m, p.cssPx || 0); }, 0) || size;
    lastMarkMetrics.bellPx = placed.reduce(function (m, p) { return Math.max(m, p.bellPx || 0); }, 0);
    lastMarkMetrics.bodyPx = placed.reduce(function (m, p) { return Math.max(m, p.bodyPx || 0); }, 0);
  }
  placed.forEach(function (m) {
    const x = m.x, y = m.y;
    const pulse = (S && S.beatPulse) ? S.beatPulse : 0;
    const gsize = m.cssPx || size;
    const rad = gsize / 2 + pulse * 2;
    ctx.save();
    if (m.seq && m.seq.length) {
      const gap = size * 0.38;
      const rowW = (m.seq.length - 1) * gap;
      const rowX = clamp(x - rowW * 0.5, 10, r.width - 10 - rowW);
      const rowY = clamp(y - rad - 10, 90, r.height - 10);
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
  if (S && S.playing && S.hero && three && three.camera) {
    _proj.v.set(S.hero.x, 0.05, S.hero.z).project(three.camera);
    const hx = (_proj.v.x * 0.5 + 0.5) * r.width;
    const hy = (-_proj.v.y * 0.5 + 0.5) * r.height;
    const info = beatInfo();
    const pulse = S.beatPulse || 0;
    const nowCue = !!(info && info.perfect);
    const rad0 = 15 + pulse * 10;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, rad0, 0, 7);
    ctx.strokeStyle = nowCue ? 'rgba(244,232,208,0.95)' : 'rgba(244,232,208,' + (0.35 + pulse * 0.55).toFixed(2) + ')';
    ctx.lineWidth = nowCue ? 4 : 2 + pulse * 3;
    ctx.stroke();
    if (pulse > 0.45 || (nowCue && pulse > 0.15)) {
      ctx.font = '800 13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,8,6,0.75)';
      ctx.fillStyle = 'rgba(244,232,208,' + (nowCue ? 0.95 : 0.7) + ')';
      const label = '지금';
      const ly = hy - rad0 - 4;
      ctx.strokeText(label, hx, ly);
      ctx.fillText(label, hx, ly);
    }
    ctx.restore();
    lastMarkMetrics.footRing = { x: hx, y: hy, r: rad0, now: nowCue, pulse: pulse };
    lastMarkMetrics.beatPulse = pulse;
  }
}



function beatClock() {
  if (audio && audio.info && !qa.noDelay && (qa.timeScale || 1) === 1) {
    const inf = audio.info();
    if (inf && inf.clock != null) return inf.clock;
  }
  return (S && S.elapsed) || 0;
}
function beatInfo() {
  const per = 60 / (CFG.bpm || 100);
  const t = beatClock();
  let ph = (t / per) % 1;
  if (ph < 0) ph += 1;
  const dt = Math.min(ph, 1 - ph) * per;
  const perf = CFG.beatWindow || 0.09;
  const good = CFG.beatGood || 0.18;
  return { period: per, phase: ph, dt: dt, perfect: dt <= perf, good: dt <= good && dt > perf, bpm: CFG.bpm };
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
function playBeatBell() {
  if (!audio) return;
  audio.setQuiet(qa.mute, qa.noDelay);
  const host = $('app') || $('ink');
  const w = host ? host.getBoundingClientRect().width : 375;
  const pans = [];
  livingMarks().forEach(function (s) {
    const scr = screenOf(s);
    const pan = Math.max(-1, Math.min(1, (scr.x / Math.max(1, w)) * 2 - 1));
    pans.push({ id: s.id, pan: pan, x: s.x, z: s.z });
    audio.bell(pan);
  });
  if (!pans.length) audio.bell(0);
  if (S) S.bellPans = pans;
  if (audio.setLastPans) audio.setLastPans(pans);
}
function tickBeat(dt) {
  if (!S) return;
  const info = beatInfo();
  const idx = Math.floor(((S.elapsed) / info.period) + 1e-6);
  if (idx !== S.lastBeat && S.elapsed > 0) {
    S.lastBeat = idx;
    const app = $('app');
    S.beatPulse = 1;
    if (app) {
      app.classList.add('beat');
      const hold = qa.noDelay ? 0 : 200;
      setTimeout(function () { app.classList.remove('beat'); }, hold);
    }
    playBeatBell();
    triggerSightWave();
  }
  if (S.beatPulse > 0) S.beatPulse = Math.max(0, S.beatPulse - dt / 0.22);
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
function applyJudge(forced) {
  if (!S) return 'miss';
  let kind = forced;
  if (!kind) {
    if (qa.autoPerfect) kind = 'perfect';
    else if (S.sandbox && !qa.useBeat) kind = 'miss';
    else {
      const b = beatInfo();
      kind = b.perfect ? 'perfect' : (b.good ? 'good' : 'miss');
    }
  }
  if (kind !== 'perfect' && kind !== 'miss' && kind !== 'good') {
    const b = beatInfo();
    kind = b.perfect ? 'perfect' : (b.good ? 'good' : 'miss');
  }
  S.lastJudge = kind;
  S.pendingPerfect = kind === 'perfect';
  if (kind === 'perfect' || kind === 'good') {
    S.combo = (S.combo || 0) + 1;
    S.comboIdle = 0;
    if (kind === 'perfect') S.perfects = (S.perfects || 0) + 1;
    if (S.combo > (S.comboMax || 0)) S.comboMax = S.combo;
    showJudge(kind === 'perfect' ? '완벽' : '좋음');
    const hits = CFG.comboBurstAt || [4, 8, 12];
    if (hits.indexOf(S.combo) >= 0) triggerComboBurst(S.combo);
  } else {
    S.combo = Math.floor((S.combo || 0) / 2);
    S.comboIdle = 0;
    S.misses = (S.misses || 0) + 1;
    S.pendingPerfect = false;
    if (S.combo <= 0) S.combo = 0;
  }
  return kind;
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
  if (lock) len = Math.max(len, dist(from, lock) + (CFG.dashPastTarget || 0.8));
  const raw = clipBound({ x: from.x + dir.x * len, z: from.z + dir.z * len });
  const land = safeLand(from, raw);
  return { x: land.x, z: land.z, raw: raw };
}
function beginDash(shape, opts) {
  opts = opts || {};
  if (!S || !S.playing || S.paused || S.dash) return null;
  const n = S.dashCount;
  const dir = opts.dir || S.lastStrokeDir || null;
  const targets = pickSpirits(shape, n, S.hero, dir, null);
  if (!targets.length) { toast('화면에 그 모양이 없어요'); return { type: shape, targets: [], hits: [], items: [] }; }
  const rec = { type: shape, targets: targets.map(function (t) { return t.id; }), hits: [], items: [], t0: now(), segs: [], elem: S.dashElem, cinematic: false };
  S.lastDash = rec;
  S.dashQueue = targets.slice();
  if (S.bellT > 0 && S.bellShape === shape && targets.length) triggerCinematic();
  startSeg();
  return rec;
}
function startSeg() {
  if (!S.dashQueue.length) { S.dash = null; maybeEnd(); return; }
  const tgt = S.dashQueue.shift();
  if (!tgt.alive) { startSeg(); return; }
  const from = { x: S.hero.x, z: S.hero.z };
  const end = dashEndPoint(from, tgt);
  const to = { x: end.x, z: end.z };
  const raw = end.raw ? { x: end.raw.x, z: end.raw.z } : to;
  const slash = makeSlash(from, raw);
  S.dash = { from: from, to: to, raw: raw, t: 0, dur: CFG.dashDur, target: tgt, slash: slash, judged: false, perfect: !!S.pendingPerfect };
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
function applyPath(from, to, rec, skip) {
  const r = pathR(), dmg = dashDmg();
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
    if (skip && z === skip) return;
    if (z.isBoss || z.marked) return;
    if (segDist(z.x, z.z, from.x, from.z, to.x, to.z) <= r + z.r) {
      hurtZombie(z, dmg, 'slash', rec);
      if (z.alive) applyElement(z, S.dashElem, rec);
    }
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
  const elem = !z.alive ? null : (z.frozen > 0 ? 'ice' : z.burn > 0 ? 'fire' : z.poison > 0 ? 'poison' : null);
  if (art.setStatus) art.setStatus(z.obj, elem);
}
function tickStatuses(dt) {
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
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
  grantKill();
  gainXp(CFG.xpPerKill);
  if (Math.random() < 0.35) spawnItem({ type: dropType(), x: z.x, z: z.z });
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
function grantKill() {
  const c = Math.round(CFG.coinPerKill * coinMult());
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
  } else if (it.kind === 'heal') {
    S.runHp += 0; S.hp = Math.min(maxHp(), S.hp + 3);
  } else if (it.kind === 'coin') {
    save.coins += Math.round(5 * coinMult()); persist();
  } else if (it.kind === 'xp') gainXp(1);
  else if (it.kind === 'ice' || it.kind === 'fire' || it.kind === 'poison') setDashElem(it.kind);
  else if (it.kind === 'bell') startBell(it.shape, it.dur);
  renderHud();
}
function gainXp(n) {
  S.xp += n;
  while (S.xp >= xpNeed(S.level)) {
    S.xp -= xpNeed(S.level);
    S.level++;
    S.spiritCap = Math.min(CFG.spiritMax || 4, (S.spiritCap || 1) + 1);
    openLevelUp();
  }
}
function openLevelUp() {
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
  else if (id === 'bell') startBell(null, CFG.bellDur);
  hideOvs(); S.paused = null; renderHud();
  if (S._pendingLv) { S._pendingLv--; openLevelUp(); }
  return true;
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
    S.comboIdle = (S.comboIdle || 0) + dt;
    if (S.comboIdle > (CFG.comboTimeout || 2.8)) S.combo = 0;
  }
  tickBeat(dt);
  if (S.bellT > 0) {
    S.bellT -= dt;
    if (S.bellT <= 0) endBell();
  }
  if (!S.sandbox && !S.bossSpawned && S.elapsed >= CFG.bossAt) {
    spawnBoss({ r: CFG.bossSpawnR, nShapes: CFG.bossShapes });
    toast('부적을 단 귀물이 다가옵니다');
  }
  const wave = 1 + 0.7 * clamp(S.elapsed / CFG.timeLimit, 0, 1);
  if (!S.sandbox) {
    S.zAcc += dt * 1000;
    S.sAcc += dt * 1000;
    const practicing = (S.practiceT > 0) && (S.practiceSpawns > 0);
    const delayed = S.elapsed < (CFG.spawnZombieDelay || 12);
    const early = S.elapsed < (CFG.earlyZombieUntil || 25);
    let zMax = CFG.spawnZombieMax || 16;
    let zBase = CFG.spawnZombieMs;
    if (practicing) { zMax = CFG.practiceZombieMax || 2; zBase = CFG.practiceZombieMs || 3200; }
    else if (delayed) { S.zAcc = 0; zMax = 0; }
    else if (early) { zMax = CFG.earlyZombieMax || 4; zBase = Math.max(zBase, 2000); }
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
    if (!qa.noMove && !frozen) {
      const sp = z.isBoss ? (CFG.bossSpeed || 1) : zsp;
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
        S.hp -= z.isBoss ? (CFG.bossDmg || 3) : CFG.dmg;
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
function paintInk(pts, fading) {
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
  ctx.fillStyle = paperRgba(0.94 * a);
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
  paintInk(pointers.pts, 1);
  if (S && S.playing && !S.paused && pointers.pts.length >= 3 && G && G.recognize) {
    const rec = G.recognize(pointers.pts, { allowBolt: true });
    if (rec && rec.type && (S.sandbox || !S.pool || S.pool.indexOf(rec.type) >= 0)) {
      const dir = strokeAimDir(pointers.pts, rec.type);
      S.aimTarget = pickSpirits(rec.type, 1, S.hero, dir, null)[0] || null;
    } else S.aimTarget = null;
    updateMarks();
  }
}
function onUp(e) {
  if (!pointers.down || (e.pointerId != null && e.pointerId !== pointers.id)) return;
  pointers.down = false;
  finishStroke(pointers.pts);
}
function finishStroke(pts, opts) {
  opts = opts || {};
  lastStroke = (pts || []).slice(); inkFade = 0.28;
  paintInk(lastStroke, 1);
  if (!S || !S.playing || S.paused) return null;
  const rec = G.recognize(pts, { allowBolt: true });
  S.lastRec = rec;
  S.aimTarget = null;
  const read = (G.readMessage && G.readMessage(rec)) || '';
  rec.readMessage = read;
  if (!rec.type) {
    inkFade = 0.16;
    toast((read ? read + ' ' : '잘 안 그려졌어요. ') + failHint());
    setTimeout(clearInk, qa.noDelay ? 80 : 160);
    return rec;
  }
  if (!S.sandbox && S.pool && S.pool.indexOf(rec.type) < 0) {
    toast((read ? read + ' ' : '') + '지금은 ' + failHint());
    inkFade = 0.16;
    setTimeout(clearInk, qa.noDelay ? 80 : 160);
    return rec;
  }
  const dir = strokeAimDir(pts, rec.type);
  S.lastStrokeDir = dir;
  rec.dir = dir;
  applyJudge(opts.judge);
  rec.judge = S.lastJudge;
  rec.combo = S.combo;
  rec.perfect = !!S.pendingPerfect;
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
  label($('buyAtk'), '공격력', save.atkLv, '일섬이 두 배로 베일 확률 ' + Math.round(atkChance() * 100) + '%');
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
  fog.setTransform(dpr, 0, 0, dpr, 0, 0);
  /* Edge ink-fog. The wave opens a clearer disc so enemies and bells show through. */
  const hole = 0.16 + 0.58 * wave;
  const hs = S.hero ? heroScreen() : { x: w * 0.5, y: h * 0.5 };
  const cx = hs.x, cy = hs.y;
  host.style.setProperty('--hero-x', cx.toFixed(1) + 'px');
  host.style.setProperty('--hero-y', cy.toFixed(1) + 'px');
  const edgeA = 0.92 * (1 - wave * 0.18);
  const midA = (0.55 * (1 - wave) + 0.12);
  const grd = fog.createRadialGradient(cx, cy, Math.min(w, h) * hole * 0.28, cx, cy, Math.max(w, h) * 0.82);
  grd.addColorStop(0, 'rgba(10,8,6,0)');
  grd.addColorStop(0.32, 'rgba(16,12,10,' + (0.08 * (1 - wave)).toFixed(3) + ')');
  grd.addColorStop(0.58, 'rgba(12,9,7,' + midA.toFixed(3) + ')');
  grd.addColorStop(0.82, 'rgba(8,6,5,' + (0.78 * (0.55 + 0.45 * (1 - wave * 0.3))).toFixed(3) + ')');
  grd.addColorStop(1, 'rgba(4,3,2,' + edgeA.toFixed(3) + ')');
  fog.fillStyle = grd;
  fog.fillRect(0, 0, w, h);
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
  beatInfo: beatInfo,
  shapePool: function () { return S ? (S.pool || []).slice() : []; },
  spawnPool: spawnPool,
  waitBeat: function (kind) {
    kind = kind || 'on';
    return new Promise(function (res) {
      const t0 = now();
      const id = setInterval(function () {
        const b = beatInfo();
        const ok = kind === 'on' ? b.perfect : !b.perfect;
        if (ok || now() - t0 > 2000) { clearInterval(id); res(b); }
      }, 8);
    });
  },
  strokePath: finishStroke,
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
      combo: S && S.combo, comboMax: S && S.comboMax,
      lastJudge: S && S.lastJudge, perfects: S && S.perfects, misses: S && S.misses,
      bursts: S && (S.bursts || []).slice(),
      runNo: S && S.runNo, pool: S && (S.pool || []).slice(),
      practice: S && { t: S.practiceT, shape: S.practiceShape, left: S.practiceSpawns },
      sightWave: S && S.sightWave,
      iframe: S && S.iframe, hitstop: S && S.hitstop, hurtFlash: S && S.hurtFlash,
      bellPans: S && (S.bellPans || []).slice(),
      lastRec: S && S.lastRec && { type: S.lastRec.type, best: S.lastRec.best, readMessage: S.lastRec.readMessage, reason: S.lastRec.reason },
      telegraphs: S ? S.zombies.filter(function (z) { return z.alive && z.obj && z.obj.userData && z.obj.userData.teleOn; }).map(function (z) { return z.id; }) : [],
      beat: beatInfo(),

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
