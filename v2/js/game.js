/* 맹인 검객 일섬 v2 — 2.5D quarter-view, Three.js, camera-follow dashes. */
import * as THREE from 'three';
import { probeAssets, buildArt } from './art.js';
import * as Anim from './anim.js';
import { createAudio } from './audio.js';
import { createInkSlash, prewarmInkSlash } from '../../assets/v2/fx-ink/code/inkSlashMaterial.js';
import { InkParticles } from '../../assets/v2/fx-ink/code/inkParticles.js';
import { setupBloom, AutoQuality } from '../../assets/v2/fx-ink/code/bloomSetup.js';
import { drawSonarRing2D } from '../../assets/v2/fx-ink/code/sonarRing.js';

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
const SHAPE_MARK = { tap: '탭', hline: '—', vline: 'ㅣ', vee: 'V', square: 'ㅁ', circle: 'O' };
const SHAPE_KEY = { tap: 'tap', hline: 'H', vline: 'I', vee: 'V', square: 'sq', circle: 'O' };
const SHAPE_UNLOCK = ['tap', 'hline', 'vline', 'vee', 'square', 'circle'];
const COMBAT = SHAPE_UNLOCK.slice();

const SHAPE_HINT = {
  tap: '점을 찍거나 짧게 눌러 보세요',
  hline: '가로로 길게 그어 보세요',
  vline: '세로로 길게 그어 보세요',
  vee: 'V자를 그려 보세요',
  square: '네모를 그려 보세요',
  circle: '동그라미를 그려 보세요'
};
/* v1 numbers reused where the new brief is silent. Documented as defaults. */
const CFG = {
  hpBase: 10, dmg: 1, bossDmg: 3, iframeMs: 800,
  timeLimit: 75, bossAt: 50, bossShapes: 5,
  coinPerKill: 3, comboExtra: 2,
  idlePerMin: 4, idleMaxHours: 8,
  upgradeBase: 15, atkStep: 0.08, hpStep: 3, coinStep: 0.25, maxLv: 10,
  xpBase: 5,
  dashDur: 0.28, pathRadius: 1.35, dashDmg: 1, zombieHp: 2, spiritHp: 1,
  dashCount: 1, spawnZombieMs: 1250, spawnSpiritMs: 950,
  spawnZombieMax: 16, spawnSpiritMax: 10,
  spawnZombieMinMs: 450, spawnSpiritMinMs: 480,
  spawnZombieDelay: 12, practiceZombieMs: 3200, practiceZombieMax: 2, earlyZombieMax: 4, earlyZombieUntil: 25,
  startSpirits: 4, spiritRing: [5, 7.2], zombieRing: [7, 10.5],
  zombieSpeed: 2.15, spiritSpeed: 0.55,
  camOff: { x: 7.2, y: 11.2, z: 7.2 }, camLookY: 1.2, fov: 40,
  markMinCss: 40, markMaxCss: 72,
  bpm: 100, beatWindow: 0.16, comboTimeout: 2.8,
  perfectDmgMul: 1.5, comboBurstAt: [4, 8, 12],
  comboBurstR: [3.2, 4.2, 5.2], comboBurstDmg: [1, 1.5, 2],
  practiceSec: 10, practiceSpawns: 6, comboBurstMs: 220,
  iceDur: 2.5, burnDur: 3, burnPeriod: 0.75, burnDmg: 1,
  poisonMax: 5, poisonDur: 4, poisonPeriod: 1, poisonDmgPer: 1,
  shatterDmg: 4, explodeDmg: 3, explodeR: 2.5,
  bellDur: 8, slowDur: 0.9, slowScale: 0.35,
  parryRange: 1.9, parrySlow: 1.4, sightWaveDur: 0.7
};
const RUN_UPGRADES = [
  { id: 'dmg', name: '돌진 데미지', desc: '일섬이 좀비에게 더 큰 상처를 남깁니다.' },
  { id: 'width', name: '경로 폭', desc: '베기 선이 넓어져 더 많은 것을 스칩니다.' },
  { id: 'dash', name: '일섬 횟수', desc: '같은 모양 혼령에게 한 번 더 이어 돌진합니다.' },
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
  if (S && S.pendingPerfect) d *= (CFG.perfectDmgMul || 1.5);
  if (S && S.combo > 1) d += Math.min(2, (S.combo - 1) * 0.1);
  if (Math.random() < atkChance()) d += 1;
  return d;
}
function pathR() { return (S && S.pathR) || CFG.pathRadius; }

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
  scene.fog = new THREE.FogExp2(clear, 0.014);

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
    world.bloom = setupBloom(renderer, scene, camera, { quality: fxQ });
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
    sightWave: 0, parryT: 0, lastParry: null, lastStrokeDir: null
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
  if (!opts.sandbox && CFG.startSpirits) {
    for (let i = 0; i < CFG.startSpirits; i++) spawnSpirit({ r: CFG.spiritRing[0] + Math.random() * (CFG.spiritRing[1] - CFG.spiritRing[0]) });
  }
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

function spawnSpirit(opts) {
  opts = opts || {};
  const shape = opts.shape || leastUsedShape();
  const ring = CFG.spiritRing || [8, 12];
  const p = opts.x != null ? { x: opts.x, z: opts.z } : ringPos(opts.r || (ring[0] + Math.random() * (ring[1] - ring[0])));
  const isBoss = !!opts.boss;
  const e = {
    id: ++S._id, kind: 'spirit', shape: shape, x: p.x, z: p.z, r: isBoss ? 1.1 : 0.7,
    alive: true, hp: 1, isBoss: isBoss,
    seq: isBoss ? (opts.seq || pickSeq(opts.nShapes || CFG.bossShapes)) : null,
    seqI: 0
  };
  if (isBoss) e.shape = e.seq[0];
  const vis = (S.bellT > 0 && S.bellShape) ? S.bellShape : e.shape;
  e.obj = addEntityVisual(isBoss ? 'boss' : 'spirit', vis);
  if (S.bellT > 0 && art.setAura) art.setAura(e.obj, true);
  placeGroup(e.obj, e.x, e.z, 0.15);
  S.spirits.push(e);
  if (isBoss) { S.boss = e; S.bossSpawned = true; }
  if (!isBoss && S.practiceSpawns > 0) S.practiceSpawns--;
  return e;
}
function spawnZombie(opts) {
  opts = opts || {};
  const zr = CFG.zombieRing || [10, 14];
  const p = opts.x != null ? { x: opts.x, z: opts.z } : ringPos(zr[0] + Math.random() * (zr[1] - zr[0]));
  const e = { id: ++S._id, kind: 'zombie', x: p.x, z: p.z, r: 0.55, alive: true, hp: opts.hp != null ? opts.hp : CFG.zombieHp, frozen: 0, burn: 0, burnTick: 0, poison: 0, poisonT: 0, poisonTick: 0 };
  e.obj = addEntityVisual('zombie');
  placeGroup(e.obj, e.x, e.z);
  S.zombies.push(e);
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
  if (shape === 'tap') {
    return '<span class="hanji-chip tap-chip" data-shape="tap" title="탭"><svg class="tap-drop-svg" viewBox="0 0 32 40" width="26" height="32" aria-hidden="true"><path d="M16 1.2C10.5 9.2 6.2 16.8 6.2 24a9.8 9.8 0 1 0 19.6 0C25.8 16.8 21.5 9.2 16 1.2z" fill="#0E0C0A"/><path d="M8.5 36.5q7.5 6.2 15 0" fill="none" stroke="#0E0C0A" stroke-width="2.2" stroke-linecap="round"/></svg><em class="tap-caption">탭</em></span>';
  }
  const seals = { hline: 'H', vline: 'I', vee: 'V', circle: 'O', square: 'sq' };
  const alt = SHAPE_MARK[shape] || shape;
  if (shape === 'square') {
    return '<span class="hanji-chip" data-shape="square" title="네모"><span style="font-weight:800;font-size:18px;color:#0E0C0A">ㅁ</span></span>';
  }
  const k = seals[shape];
  if (k && k !== 'sq') {
    return '<span class="hanji-chip" data-shape="' + shape + '" title="' + alt + '"><img src="../assets/v2/ui/seal-' + k + '@2x.png" alt="' + alt + '" width="40" height="40"></span>';
  }
  return '<span class="hanji-chip" data-shape="' + shape + '">' + alt + '</span>';
}
function refreshTitleHelp() {
  const el = $('titleShapes') || document.querySelector('.shapes-help');
  if (!el) return upcomingRun();
  const run = upcomingRun();
  const pool = unlockedShapes(run);
  el.innerHTML = pool.map(titleChip).join('');
  const sub = $('titleSub');
  if (sub) {
    if (pool.length === 1 && pool[0] === 'tap') sub.textContent = '1판은 탭만 나옵니다. 점을 찍거나 짧게 눌러 혼령에게 다가가세요.';
    else sub.textContent = '종에 새겨진 모양을 그려, 그은 방향의 혼령에게 돌진하세요';
  }
  return { run: run, pool: pool, html: el.innerHTML };
}
function spawnPool() {
  if (!S) return unlockedShapes(1);
  if (S.sandbox) return SHAPE_UNLOCK.slice();
  if ((S.practiceT > 0 || S.practiceSpawns > 0) && S.practiceShape) return [S.practiceShape];
  return (S.pool && S.pool.length) ? S.pool.slice() : unlockedShapes(S.runNo || 1);
}
function leastUsedShape() {
  const pool = spawnPool();
  const counts = {};
  pool.forEach(function (sh) { counts[sh] = 0; });
  if (S && S.spirits) {
    S.spirits.forEach(function (s) {
      if (!s.alive || s.isBoss) return;
      const sh = spiritShape(s);
      if (counts[sh] != null) counts[sh]++;
    });
  }
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
  _proj.v.set(x, y || 0.4, z).project(three.camera);
  return { x: (_proj.v.x * 0.5 + 0.5) * r.width, y: (-_proj.v.y * 0.5 + 0.5) * r.height };
}
function strokeScreenDir(pts) {
  if (!pts || pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 8) return null;
  return { x: dx / L, y: dy / L };
}
function pickSpirits(shape, n, from, dir, exclude) {
  from = from || (S && S.hero);
  const skip = exclude || [];
  const list = S.spirits.filter(function (s) { return s.alive && spiritShape(s) === shape && skip.indexOf(s) < 0; });
  const boss = list.filter(function (s) { return s.isBoss; });
  const rest = list.filter(function (s) { return !s.isBoss; });
  const heroScr = projectXZ(from.x, from.z);
  if (dir && (dir.x || dir.y)) {
    rest.sort(function (a, b) {
      const va = projectXZ(a.x, a.z), vb = projectXZ(b.x, b.z);
      const da = Math.hypot(va.x - heroScr.x, va.y - heroScr.y) || 1;
      const db = Math.hypot(vb.x - heroScr.x, vb.y - heroScr.y) || 1;
      const sa = ((va.x - heroScr.x) / da) * dir.x + ((va.y - heroScr.y) / da) * dir.y;
      const sb = ((vb.x - heroScr.x) / db) * dir.x + ((vb.y - heroScr.y) / db) * dir.y;
      if (Math.abs(sb - sa) > 0.08) return sb - sa;
      return dist(b, from) - dist(a, from);
    });
  } else {
    /* Tap (or no direction): nearest first. */
    rest.sort(function (a, b) { return dist(a, from) - dist(b, from); });
  }
  /* Living boss of the same shape stays first so play-to-boss is reliable. */
  return boss.concat(rest).slice(0, Math.max(0, n));
}
function farthestSpirits(shape, n, from) {
  return pickSpirits(shape, n, from, S && S.lastStrokeDir);
}
function spiritShape(s) {
  if (S && S.bellT > 0 && S.bellShape) return S.bellShape;
  return s.isBoss ? s.seq[s.seqI] : s.shape;
}
function startBell(shape, dur) {
  if (!S) return;
  S.bellShape = shape || spawnPool()[Math.floor(Math.random() * spawnPool().length)];
  S.bellT = dur != null ? dur : CFG.bellDur;
  S.spirits.forEach(function (s) {
    if (s.alive && s.obj) {
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
  S.spirits.forEach(function (s) {
    if (s.alive && s.obj) {
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
const markImgs = {};
function loadMarkImages() {
  const files = art && art.images && art.images.marks;
  if (!files) return;
  Object.keys(files).forEach(function (k) {
    const im = new Image();
    im.src = art.BASE + files[k];
    markImgs[k] = im;
  });
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

function drawTapGlyph(ctx, x, y, size) {
  /* Finger-tap / ink droplet — pointed, not a hollow O. */
  const s = size * 0.42;
  ctx.save();
  ctx.translate(x, y - size * 0.04);
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.05);
  ctx.bezierCurveTo(s * 0.55, -s * 0.35, s * 0.78, s * 0.15, s * 0.72, s * 0.55);
  ctx.bezierCurveTo(s * 0.62, s * 1.05, s * 0.32, s * 1.22, 0, s * 1.22);
  ctx.bezierCurveTo(-s * 0.32, s * 1.22, -s * 0.62, s * 1.05, -s * 0.72, s * 0.55);
  ctx.bezierCurveTo(-s * 0.78, s * 0.15, -s * 0.55, -s * 0.35, 0, -s * 1.05);
  ctx.closePath();
  ctx.fillStyle = '#F4E8D0';
  ctx.fill();
  ctx.strokeStyle = '#0E0C0A';
  ctx.lineWidth = Math.max(2, size * 0.055);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, s * 1.55, s * 0.72, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.strokeStyle = '#F4E8D0';
  ctx.lineWidth = Math.max(1.6, size * 0.05);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
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
  if (!S || !three || !S.spirits) return;
  if (!_proj.v) _proj.v = new THREE.Vector3();
  const placed = [];
  S.spirits.forEach(function (s) {
    if (!s.alive || !s.obj) return;
    const off = s.obj.userData.bellLocal || { x: 0, y: 1.2 };
    _proj.v.set(s.x + (off.x || 0), (s.obj.position.y || 0) + off.y, s.z).project(three.camera);
    const ox = (_proj.v.x * 0.5 + 0.5) * r.width;
    const oy = (-_proj.v.y * 0.5 + 0.5) * r.height;
    const on = !(ox < -20 || oy < -20 || ox > r.width + 20 || oy > r.height + 20);
    const item = { x: ox, y: oy, ox: ox, oy: oy, cssPx: size, onScreen: on, shape: spiritShape(s), boss: !!s.isBoss };
    lastMarkMetrics.marks.push(item);
    if (on) placed.push(item);
  });
  const minD = size + 10;
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }
        if (d < minD) {
          const push = (minD - d) * 0.5;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }
    }
  }
  const maxOff = size * 1.25;
  placed.forEach(function (m) {
    const odx = m.x - m.ox, ody = m.y - m.oy, ol = Math.hypot(odx, ody);
    if (ol > maxOff) { m.x = m.ox + odx / ol * maxOff; m.y = m.oy + ody / ol * maxOff; }
  });
  let minSep = 9999;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      minSep = Math.min(minSep, Math.hypot(placed[j].x - placed[i].x, placed[j].y - placed[i].y));
    }
  }
  lastMarkMetrics.minSep = placed.length > 1 ? minSep : minD;
  lastMarkMetrics.tapStyle = 'droplet';
  placed.forEach(function (m) {
    const x = m.x, y = m.y, sh = m.shape;
    const key = SHAPE_KEY[sh] || 'O';
    const im = markImgs[key];
    const pulse = (S && S.beatPulse) ? S.beatPulse : 0;
    const rad = size / 2 + 3 + pulse * 4;
    ctx.save();
    if (Math.hypot(x - m.ox, y - m.oy) > 3) {
      ctx.strokeStyle = 'rgba(244,232,208,0.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(m.ox, m.oy); ctx.lineTo(x, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(8,6,5,0.78)';
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    ctx.strokeStyle = paperRgba(0.95);
    ctx.lineWidth = Math.max(2, size * 0.08);
    ctx.beginPath(); ctx.arc(x, y, rad - 1, 0, 7); ctx.stroke();
    if (sh === 'tap') {
      drawTapGlyph(ctx, x, y, size);
    } else if (sh === 'square') {
      const q = size * 0.28;
      ctx.strokeStyle = '#F4E8D0';
      ctx.lineWidth = Math.max(3, size * 0.1);
      ctx.strokeRect(x - q, y - q, q * 2, q * 2);
      ctx.strokeStyle = '#0E0C0A';
      ctx.lineWidth = Math.max(1.5, size * 0.05);
      ctx.strokeRect(x - q + 1, y - q + 1, q * 2 - 2, q * 2 - 2);
    } else if (im && im.complete && im.naturalWidth) {
      ctx.drawImage(im, x - size / 2, y - size / 2, size, size);
    } else {
      ctx.fillStyle = '#F4E8D0';
      ctx.font = '700 ' + Math.round(size * 0.62) + 'px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(SHAPE_MARK[sh] || '', x, y + 1);
    }
    ctx.restore();
  });
  if (S && S.playing && S.hero && three && three.camera) {
    _proj.v.set(S.hero.x, 0.05, S.hero.z).project(three.camera);
    const hx = (_proj.v.x * 0.5 + 0.5) * r.width;
    const hy = (-_proj.v.y * 0.5 + 0.5) * r.height;
    const info = beatInfo();
    const pulse = S.beatPulse || 0;
    const nowCue = !!(info && info.perfect);
    const rad0 = 22 + pulse * 14;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, rad0, 0, 7);
    ctx.strokeStyle = nowCue ? 'rgba(244,232,208,0.95)' : 'rgba(244,232,208,' + (0.35 + pulse * 0.55).toFixed(2) + ')';
    ctx.lineWidth = nowCue ? 4 : 2 + pulse * 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy, rad0 * 0.62, 0, 7);
    ctx.strokeStyle = nowCue ? 'rgba(201,162,74,0.9)' : 'rgba(201,162,74,' + (0.2 + pulse * 0.5).toFixed(2) + ')';
    ctx.lineWidth = 2;
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



function beatInfo() {
  const per = 60 / (CFG.bpm || 100);
  const t = (S && S.elapsed) || 0;
  let ph = (t / per) % 1;
  if (ph < 0) ph += 1;
  const dt = Math.min(ph, 1 - ph) * per;
  return { period: per, phase: ph, dt: dt, perfect: dt <= (CFG.beatWindow || 0.16), bpm: CFG.bpm };
}

function failHint() {
  if (!S) return 'ㅣ — V 중에 그려 보세요';
  if (S.practiceShape && (S.practiceT > 0 || S.practiceSpawns > 0) && SHAPE_HINT[S.practiceShape]) {
    return SHAPE_HINT[S.practiceShape];
  }
  const counts = {};
  (S.spirits || []).forEach(function (s) {
    if (!s.alive) return;
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
  if (audio) {
    audio.setQuiet(qa.mute, qa.noDelay);
    audio.bell();
  }
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
    /* Subtle glow pulse on living spirits. */
    S.spirits.forEach(function (s) {
      if (!s.alive || !s.obj || !s.obj.userData || !s.obj.userData.glow) return;
      const g = s.obj.userData.glow;
      if (g.material) g.material.opacity = 0.95;
    });
  }
  S.spirits.forEach(function (s) {
    if (!s.alive || !s.obj || !s.obj.userData || !s.obj.userData.glow || !s.obj.userData.glow.material) return;
    const g = s.obj.userData.glow;
    g.material.opacity += (0.7 - g.material.opacity) * Math.min(1, dt * 6);
  });
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
    else kind = beatInfo().perfect ? 'perfect' : 'miss';
  }
  if (kind !== 'perfect' && kind !== 'miss') kind = beatInfo().perfect ? 'perfect' : 'miss';
  S.lastJudge = kind;
  S.pendingPerfect = kind === 'perfect';
  if (kind === 'perfect') {
    S.combo = (S.combo || 0) + 1;
    S.comboIdle = 0;
    S.perfects = (S.perfects || 0) + 1;
    if (S.combo > (S.comboMax || 0)) S.comboMax = S.combo;
    showJudge('완벽');
    const hits = CFG.comboBurstAt || [4, 8, 12];
    if (hits.indexOf(S.combo) >= 0) triggerComboBurst(S.combo);
  } else {
    S.combo = 0;
    S.comboIdle = 0;
    S.misses = (S.misses || 0) + 1;
    S.pendingPerfect = false;
  }
  return kind;
}

function closeZombie() {
  if (!S) return null;
  const R = CFG.parryRange || 1.9;
  let best = null, bestD = R;
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
    const d = dist(z, S.hero);
    if (d <= bestD) { bestD = d; best = z; }
  });
  return best;
}
function doParry(z) {
  if (!S || !z) return;
  S.slowT = Math.max(S.slowT || 0, CFG.parrySlow || 1.4);
  S.iframe = Math.max(S.iframe || 0, 0.65);
  S.parryT = 1.2;
  S.lastParry = { id: z.id, t: now() };
  const d = dist(z, S.hero) || 0.001;
  z.x += (z.x - S.hero.x) / d * 1.15;
  z.z += (z.z - S.hero.z) / d * 1.15;
  if (z.obj) placeGroup(z.obj, z.x, z.z);
  S.shake = Math.max(S.shake || 0, 0.22);
  if (audio) audio.parry();
  triggerSightWave();
  showJudge('패링');
  toast('지금입니다. 모양을 그어 일섬하세요');
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
function beginDash(shape, opts) {
  opts = opts || {};
  if (!S || !S.playing || S.paused || S.dash) return null;
  const n = S.dashCount;
  const dir = opts.dir || S.lastStrokeDir || null;
  const targets = pickSpirits(shape, n, S.hero, dir);
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
  const to = { x: tgt.x, z: tgt.z };
  const slash = makeSlash(from, to);
  S.dash = { from: from, to: to, t: 0, dur: CFG.dashDur, target: tgt, slash: slash };
  S.shake = 0.28;
  S.lastDash.segs.push({ from: from, to: to, r: pathR() });
  S.lastDash.vfxAt = S.lastDash.vfxAt || now();
  applyPath(from, to, S.lastDash);
  cutSpirit(tgt);
  afterimages(from, to);
  if (audio) audio.slash();
  triggerSightWave();
}
function applyPath(from, to, rec) {
  const r = pathR(), dmg = dashDmg();
  S.zombies.forEach(function (z) {
    if (!z.alive) return;
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
function cutSpirit(s) {
  if (s.isBoss) {
    s.seqI++;
    if (s.seqI >= s.seq.length) { destroySpirit(s); grantKill(); }
    else {
      s.shape = s.seq[s.seqI];
      if (s.obj && art.setSpiritShape) art.setSpiritShape(s.obj, spiritShape(s));
    }
  } else { destroySpirit(s); grantKill(); }
}
function destroySpirit(s) {
  s.alive = false;
  if (s.obj) three.scene.remove(s.obj);
  if (Math.random() < 0.45) spawnItem({ type: dropType(), x: s.x, z: s.z });
}
function killZombie(z, rec) {
  z.alive = false;
  if (z.obj) three.scene.remove(z.obj);
  if (three && three.ink) {
    const d = inkDir(rec || (S && S.lastDash), z);
    three.ink.kill(z.x, z.z, d.x, d.z);
    fxinkStat.kills++;
  }
  grantKill();
  if (Math.random() < 0.35) spawnItem({ type: dropType(), x: z.x, z: z.z });
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
  if (S.boss && !S.boss.alive) endRun(true, '큰 종을 베었습니다.');
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
  if (S.practiceT > 0) S.practiceT -= dt;
  if (S.sightWave > 0 && !qa.freezeWave) S.sightWave = Math.max(0, S.sightWave - dt / (CFG.sightWaveDur || 0.7));
  if (S.parryT > 0) S.parryT = Math.max(0, S.parryT - dt);
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
    spawnSpirit({ boss: true, r: 16, nShapes: CFG.bossShapes });
    toast('큰 종을 든 혼령이 나타났어요');
  }
  const wave = 1 + 0.7 * clamp(S.elapsed / CFG.timeLimit, 0, 1);
  if (!S.sandbox) {
    S.zAcc += dt * 1000;
    S.sAcc += dt * 1000;
    const practicing = (S.practiceT > 0) || (S.practiceSpawns > 0);
    const delayed = S.elapsed < (CFG.spawnZombieDelay || 12);
    const early = S.elapsed < (CFG.earlyZombieUntil || 25);
    let zMax = CFG.spawnZombieMax || 16;
    let zBase = CFG.spawnZombieMs;
    if (delayed) { S.zAcc = 0; zMax = 0; }
    else if (practicing) { zMax = CFG.practiceZombieMax || 2; zBase = CFG.practiceZombieMs || 3200; }
    else if (early) { zMax = CFG.earlyZombieMax || 4; zBase = Math.max(zBase, 2000); }
    const zms = Math.max(CFG.spawnZombieMinMs || 450, zBase / (practicing || delayed ? 1 : wave));
    const sms = Math.max(CFG.spawnSpiritMinMs || 480, CFG.spawnSpiritMs / wave);
    while (zMax > 0 && S.zAcc >= zms && S.zombies.filter(function (z) { return z.alive; }).length < zMax) {
      S.zAcc -= zms; spawnZombie();
    }
    while (S.sAcc >= sms && S.spirits.filter(function (s) { return s.alive && !s.isBoss; }).length < (CFG.spawnSpiritMax || 10)) {
      S.sAcc -= sms; spawnSpirit();
    }
  }
  if (qa.autoStroke) {
    let guard = 0;
    const burst = (qa.timeScale && qa.timeScale > 4) ? 10 : 1;
    while (guard < burst && S.playing && !S.paused) {
      guard++;
      if (S.dash) {
        S.hero.x = S.dash.to.x;
        S.hero.z = S.dash.to.z;
        if (three && three.heroSpr) placeGroup(three.heroSpr, S.hero.x, S.hero.z);
        S.dash = null;
        startSeg();
        if (!S.playing || S.paused) break;
        continue;
      }
      if (S.dashQueue && S.dashQueue.length) { startSeg(); continue; }
      let sh = null;
      if (S.boss && S.boss.alive) sh = spiritShape(S.boss);
      else {
        const counts = {};
        S.spirits.forEach(function (s) {
          if (!s.alive) return;
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
    const frozen = z.frozen > 0;
    if (!qa.noMove && !frozen) {
      z.x += (S.hero.x - z.x) / d * zsp * dt;
      z.z += (S.hero.z - z.z) / d * zsp * dt;
    }
    placeGroup(z.obj, z.x, z.z);
    if (art.tickChar) {
      const st = frozen ? 'frozen' : (z.burn > 0 ? 'burning' : (z.poison > 0 ? 'poisoned' : 'walk'));
      const vx = S.hero.x - z.x, vz = S.hero.z - z.z;
      art.tickChar(z.obj, 'zombie', st, Math.min(0.05, dt), vx, vz);
    }
    if (art.setTelegraph) art.setTelegraph(z.obj, !frozen && d < 2.6);
    if (d < z.r + 0.55) {
      if (S.iframe <= 0) {
        S.hp -= CFG.dmg;
        S.iframe = CFG.iframeMs / 1000;
        renderHud();
        if (S.hp <= 0) { endRun(false, '좀비에게 닿았습니다.'); return; }
      }
      const push = 1.2;
      z.x = S.hero.x - (S.hero.x - z.x) / d * push;
      z.z = S.hero.z - (S.hero.z - z.z) / d * push;
    }
  });
  S.spirits.forEach(function (s) {
    if (!s.alive) return;
    const u = art.unit || 0.0039;
    const amp = (s.isBoss ? 10 : 6) * u;
    const per = s.isBoss ? 2.4 : 1.6;
    const bob = 0.12 + Math.sin((S.elapsed / per) * Math.PI * 2 + s.id) * amp;
    if (!s.isBoss && !qa.noMove) {
      const d = dist(s, S.hero) || 1;
      s.x += (S.hero.x - s.x) / d * CFG.spiritSpeed * dt * 0.4;
      s.z += (S.hero.z - s.z) / d * CFG.spiritSpeed * dt * 0.4;
    }
    placeGroup(s.obj, s.x, s.z, bob);
    if (art.tickChar) art.tickChar(s.obj, s.isBoss ? 'boss' : 'spirit', 'idle', Math.min(0.05, dt), 0, 0);
  });
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

function stepDash(dt) {
  if (!S || !S.dash) return;
  const d = S.dash;
  d.t += dt;
  const u = clamp(d.t / d.dur, 0, 1);
  const k = u * u * (3 - 2 * u);
  S.hero.x = d.from.x + (d.to.x - d.from.x) * k;
  S.hero.z = d.from.z + (d.to.z - d.from.z) * k;
  placeGroup(three.heroSpr, S.hero.x, S.hero.z);
  if (u >= 1) startSeg();
}

function updateCam(dt) {
  if (!three) return;
  const targetX = S ? S.hero.x : 0, targetZ = S ? S.hero.z : 0;
  if (!S) return;
  S.cam.x += (targetX - S.cam.x) * Math.min(1, dt * 6);
  S.cam.z += (targetZ - S.cam.z) * Math.min(1, dt * 6);
  let sx = 0, sy = 0, sz = 0;
  if (S.shake > 0) {
    S.shake -= dt;
    const a = S.shake * 0.55;
    sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a; sz = (Math.random() - 0.5) * a;
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
  const rec = G.recognize(pts, {});
  S.lastRec = rec;
  if (!rec.type) {
    inkFade = 0.16;
    toast('잘 안 그려졌어요. ' + failHint());
    setTimeout(clearInk, qa.noDelay ? 80 : 160);
    return rec;
  }
  if (!S.sandbox && S.pool && S.pool.indexOf(rec.type) < 0) {
    toast('지금은 ' + failHint());
    inkFade = 0.16;
    setTimeout(clearInk, qa.noDelay ? 80 : 160);
    return rec;
  }
  const dir = strokeScreenDir(pts);
  S.lastStrokeDir = dir;
  rec.dir = dir;
  if (rec.type === 'tap') {
    const threat = closeZombie();
    if (threat) {
      applyJudge(opts.judge);
      rec.judge = S.lastJudge;
      rec.combo = S.combo;
      rec.perfect = !!S.pendingPerfect;
      rec.parry = true;
      rec.parryId = threat.id;
      doParry(threat);
      return rec;
    }
  }
  applyJudge(opts.judge);
  rec.judge = S.lastJudge;
  rec.combo = S.combo;
  rec.perfect = !!S.pendingPerfect;
  const dash = beginDash(rec.type, { dir: rec.type === 'tap' ? null : dir });
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
  if (type === 'tap') return [{ x: x, y: y }, { x: x + 0.6, y: y - 0.4 }, { x: x - 0.3, y: y + 0.3 }];
  if (type === 'vline') return line(x, y - s, x, y + s);
  if (type === 'hline') return line(x - s, y, x + s, y);
  if (type === 'vee') return line(x - s, y - s * 0.7, x, y + s * 0.8, 16).concat(line(x, y + s * 0.8, x + s, y - s * 0.7, 16).slice(1));
  if (type === 'square') {
    const q = s * 0.7;
    return line(x - q, y - q, x + q, y - q, 12)
      .concat(line(x + q, y - q, x + q, y + q, 12).slice(1),
              line(x + q, y + q, x - q, y + q, 12).slice(1),
              line(x - q, y + q, x - q, y - q, 12).slice(1));
  }
  const p = []; const n = 36;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + Math.PI * 2 * 0.98 * (i / (n - 1));
    p.push({ x: x + Math.cos(a) * s * 0.7, y: y + Math.sin(a) * s * 0.7 });
  }
  return p;
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
  return a < 0.85 ? (CFG.fov || 40) + 8 : (CFG.fov || 40);
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
  const cx = w * 0.5, cy = h * 0.58;
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
  const ringR = Math.min(w, h) * (0.18 + 0.7 * (1 - wave));
  if (wave > 0.02) {
    fog.save();
    fog.globalCompositeOperation = 'destination-out';
    fog.lineWidth = 40;
    fog.strokeStyle = 'rgba(0,0,0,1)';
    fog.beginPath();
    fog.arc(cx, cy, ringR, 0, Math.PI * 2);
    fog.stroke();
    fog.restore();
  }
  punchAtmoRing(cx, cy, ringR, wave);
  const ringCtx = sc ? sc.getContext('2d') : fog;
  if (sc) ringCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  /* Module fades by min(1, wave*1.25); compensate so an early wide ring stays opaque. */
  const k = Math.max(0.2, Math.min(1, wave * 1.25));
  drawSonarRing2D(ringCtx, w, h, wave, {
    r: ringR, cx: cx, cy: cy,
    coreAlpha: 1 / k, haloAlpha: 0.9 / k, coreWidth: 5.2, glowAlpha: 0.3 / k
  });
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
  if (S && S.playing && !S.paused) step(dt);
  stepDash(dt);
  updateCam(dt);
  if (three) {
    (three.torches || []).forEach(function (t, i) {
      const flick = t.base * (0.85 + Math.sin(ts / 120 + i) * 0.12 + Math.random() * 0.06);
      if (t.light) t.light.intensity = flick;
      if (t.glow && t.glow.material) {
        t.glow.material.opacity = 0.55 + Math.sin(ts / 90 + i) * 0.12;
        const sc = 0.95 + Math.sin(ts / 80 + i) * 0.08;
        t.glow.scale.set(2.4 * sc, 2.4 * sc, 1);
      }
    });
    ((three.map && three.map.fogs) || []).forEach(function (fog) {
      if (fog.material && fog.material.map && fog.userData.fogScroll) {
        fog.material.map.offset.x += (fog.userData.fogScroll / 1024) * raw;
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
  spawnZombie: function (o) { return spawnZombie(o); },
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
    return { cx: w * 0.5, cy: h * 0.58, r: Math.min(w, h) * (0.18 + 0.7 * (1 - (wave == null ? ((S && S.sightWave) || 0) : wave))), w: w, h: h, wave: wave == null ? ((S && S.sightWave) || 0) : wave };
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
      spirits: S ? S.spirits.filter(function (s) { return s.alive; }).map(function (s) { return { id: s.id, shape: spiritShape(s), x: s.x, z: s.z, boss: s.isBoss, seqI: s.seqI, seq: s.seq }; }) : [],
      zombies: S ? S.zombies.filter(function (z) { return z.alive; }).map(function (z) { return { id: z.id, x: z.x, z: z.z, hp: z.hp, frozen: z.frozen > 0, freezeLeft: z.frozen || 0, burn: z.burn > 0, burnLeft: z.burn || 0, poison: z.poison || 0, hasRim: !!(z.obj && z.obj.userData && (z.obj.userData.rim || z.obj.userData.bakedRim)), tele: !!(z.obj && z.obj.userData && z.obj.userData.teleOn) }; }) : [],
      items: S ? S.items.filter(function (i) { return i.alive; }).map(function (i) { return { id: i.id, type: i.kind, x: i.x, z: i.z }; }) : [],
      lastDash: S && S.lastDash,
      combo: S && S.combo, comboMax: S && S.comboMax,
      lastJudge: S && S.lastJudge, perfects: S && S.perfects, misses: S && S.misses,
      bursts: S && (S.bursts || []).slice(),
      runNo: S && S.runNo, pool: S && (S.pool || []).slice(),
      practice: S && { t: S.practiceT, shape: S.practiceShape, left: S.practiceSpawns },
      sightWave: S && S.sightWave, parryT: S && S.parryT, lastParry: S && S.lastParry,
      telegraphs: S ? S.zombies.filter(function (z) { return z.alive && z.obj && z.obj.userData && z.obj.userData.teleOn; }).map(function (z) { return z.id; }) : [],
      beat: beatInfo(),

      dashCount: S && S.dashCount,
      dashElem: S && S.dashElem,
      bell: S && { t: S.bellT, shape: S.bellShape, cinematic: !!(S.lastDash && S.lastDash.cinematic) },
      map: three && three.map && { id: three.map.id, name: three.map.name, key: three.map.key },
      hp: S && S.hp, coins: save.coins, playing: !!(S && S.playing), paused: S && S.paused,
      timeLeft: S && S.timeLeft, boss: !!(S && S.boss), bossAlive: !!(S && S.boss && S.boss.alive),
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
