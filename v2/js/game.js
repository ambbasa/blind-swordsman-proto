/* 맹인 검객 일섬 v2 — 2.5D quarter-view, Three.js, camera-follow dashes. */
import * as THREE from 'three';
import { probeAssets, buildArt } from './art.js';
import * as Anim from './anim.js';

const G = window.GPGestures;
const SAVE_KEY = 'gesture-proto.v2';
const SHAPE_MARK = { vline: 'ㅣ', hline: '—', vee: 'V', circle: 'O' };
const SHAPE_KEY = { vline: 'I', hline: 'H', vee: 'V', circle: 'O' };
const COMBAT = ['vline', 'hline', 'vee', 'circle'];
/* v1 numbers reused where the new brief is silent. Documented as defaults. */
const CFG = {
  hpBase: 10, dmg: 1, bossDmg: 3, iframeMs: 800,
  timeLimit: 75, bossAt: 50, bossShapes: 5,
  coinPerKill: 3, comboExtra: 2,
  idlePerMin: 4, idleMaxHours: 8,
  upgradeBase: 15, atkStep: 0.08, hpStep: 3, coinStep: 0.25, maxLv: 10,
  xpBase: 5,
  dashDur: 0.28, pathRadius: 1.35, dashDmg: 1, zombieHp: 2, spiritHp: 1,
  dashCount: 1, spawnZombieMs: 1600, spawnSpiritMs: 2800,
  zombieSpeed: 2.15, spiritSpeed: 0.55,
  iceDur: 2.5, burnDur: 3, burnPeriod: 0.75, burnDmg: 1,
  poisonMax: 5, poisonDur: 4, poisonPeriod: 1, poisonDmgPer: 1,
  shatterDmg: 4, explodeDmg: 3, explodeR: 2.5,
  bellDur: 8, slowDur: 0.9, slowScale: 0.35
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
let idlePending = 0;
const pointers = { down: false, id: null, pts: [] };
const fps = { samples: [], last: 0 };
let lastStroke = null, inkFade = 0;

function costOf(lv) { return CFG.upgradeBase * (lv + 1); }
function atkChance() { return Math.min(CFG.maxLv, save.atkLv) * CFG.atkStep; }
function maxHp() { return CFG.hpBase + save.hpLv * CFG.hpStep + (S && S.runHp || 0); }
function coinMult() { return 1 + save.coinLv * CFG.coinStep + (S && S.runCoin || 0); }
function dashDmg() { return (S && S.dashDmg || CFG.dashDmg) + (Math.random() < atkChance() ? 1 : 0); }
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
  $('stageLabel').textContent = S.boss ? '보스' : '일섬';
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

  const camera = new THREE.PerspectiveCamera(42, view.clientWidth / Math.max(1, view.clientHeight), 0.1, 200);
  camera.position.set(11, 14, 11);

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
  return { renderer: renderer, scene: scene, camera: camera, map: map, torches: map.lights || [], fx: [], view: view };
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
    mapId: mapIdOf(opts)
  };
  const appEl = $('app');
  if (appEl) {
    appEl.classList.remove('ink-burst');
    clearOnebell(true);
  }
  if (three && three.map && three.map.id !== S.mapId) switchMap(S.mapId);
  if (three && three.heroSpr) { three.scene.remove(three.heroSpr); }
  three.heroSpr = addEntityVisual('hero');
  placeGroup(three.heroSpr, 0, 0);
  three.camera.position.set(11, 14, 11);
  three.camera.lookAt(0, 1.2, 0);
  renderHud();
  lastTs = 0;
  if (!raf) loop(now());
}

function clearEntities() {
  if (!S || !three) return;
  function rm(list) { list.forEach(function (e) { if (e.obj) three.scene.remove(e.obj); }); }
  rm(S.spirits || []); rm(S.zombies || []); rm(S.items || []);
  (three.fx || []).forEach(function (f) { three.scene.remove(f.mesh); });
  three.fx = [];
}

function spawnSpirit(opts) {
  opts = opts || {};
  const shape = opts.shape || COMBAT[Math.floor(Math.random() * 4)];
  const p = opts.x != null ? { x: opts.x, z: opts.z } : ringPos(opts.r || (12 + Math.random() * 5));
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
  return e;
}
function spawnZombie(opts) {
  opts = opts || {};
  const p = opts.x != null ? { x: opts.x, z: opts.z } : ringPos(14 + Math.random() * 5);
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
function pickSeq(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(COMBAT[Math.floor(Math.random() * 4)]);
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

function farthestSpirits(shape, n, from) {
  from = from || S.hero;
  const list = S.spirits.filter(function (s) { return s.alive && spiritShape(s) === shape; });
  list.sort(function (a, b) { return dist(b, from) - dist(a, from); });
  return list.slice(0, Math.max(0, n));
}
function spiritShape(s) {
  if (S && S.bellT > 0 && S.bellShape) return S.bellShape;
  return s.isBoss ? s.seq[s.seqI] : s.shape;
}
function startBell(shape, dur) {
  if (!S) return;
  S.bellShape = shape || COMBAT[Math.floor(Math.random() * 4)];
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
function updateMarks() {
  const c = $('marks');
  if (!c) return;
  const r = c.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.floor(r.width * dpr) || c.height !== Math.floor(r.height * dpr)) {
    c.width = Math.max(1, Math.floor(r.width * dpr));
    c.height = Math.max(1, Math.floor(r.height * dpr));
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  if (!S || !three || !S.spirits) return;
  if (!_proj.v) _proj.v = new THREE.Vector3();
  const size = 28;
  S.spirits.forEach(function (s) {
    if (!s.alive || !s.obj) return;
    const off = s.obj.userData.bellLocal || { x: 0, y: 1.2 };
    _proj.v.set(s.x, (s.obj.position.y || 0) + off.y, s.z).project(three.camera);
    const x = (_proj.v.x * 0.5 + 0.5) * r.width;
    const y = (-_proj.v.y * 0.5 + 0.5) * r.height;
    if (x < -20 || y < -20 || x > r.width + 20 || y > r.height + 20) return;
    const key = SHAPE_KEY[spiritShape(s)] || 'O';
    const im = markImgs[key];
    if (im && im.complete && im.naturalWidth) {
      ctx.drawImage(im, x - size / 2, y - size / 2, size, size);
    } else {
      ctx.fillStyle = paperRgba(0.95);
      ctx.beginPath(); ctx.arc(x, y, size / 2, 0, 7); ctx.fill();
      ctx.fillStyle = '#0E0C0A';
      ctx.font = '700 16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(SHAPE_MARK[spiritShape(s)] || '', x, y + 1);
    }
  });
}


function beginDash(shape) {
  if (!S || !S.playing || S.paused || S.dash) return null;
  const n = S.dashCount;
  const targets = farthestSpirits(shape, n, S.hero);
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
function hurtZombie(z, amount, why, rec) {
  if (!z || !z.alive) return;
  z.hp -= amount;
  if (rec) rec.hits.push({ id: z.id, dmg: amount, hp: z.hp, why: why });
  tintZombie(z);
  if (z.hp <= 0) killZombie(z);
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
  const len = Math.max(0.2, Math.hypot(to.x - from.x, to.z - from.z));
  const geo = new THREE.PlaneGeometry(pathR() * 1.6, len);
  const slashMap = art.slashTex ? art.slashTex(S && S.dashElem) : null;
  const mat = new THREE.MeshBasicMaterial({
    map: slashMap, color: 0xffffff,
    transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((from.x + to.x) / 2, 0.08, (from.z + to.z) / 2);
  mesh.rotation.z = -Math.atan2(to.x - from.x, to.z - from.z);
  three.scene.add(mesh);
  three.fx.push({ mesh: mesh, life: 0.25, max: 0.25 });
  if (S && S.dashElem === 'fire' && art.trailTex) {
    const tgeo = new THREE.PlaneGeometry(pathR() * 2.2, len);
    const tmat = new THREE.MeshBasicMaterial({
      map: art.trailTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    const trail = new THREE.Mesh(tgeo, tmat);
    trail.rotation.x = -Math.PI / 2;
    trail.position.set((from.x + to.x) / 2, 0.06, (from.z + to.z) / 2);
    trail.rotation.z = mesh.rotation.z;
    three.scene.add(trail);
    three.fx.push({ mesh: trail, life: 1.2, max: 1.2 });
  }
  return mesh;
}
function afterimages(from, to) {
  for (let i = 1; i <= 4; i++) {
    const u = i / 5;
    const g = art.makeChar ? art.makeChar('afterimage') : new THREE.Group();
    if (!art.makeChar) {
      const spr = spriteMat(art.hero, 2.5);
      spr.material.opacity = 0.35 - i * 0.06;
      g.add(spr);
    } else if (g.userData.sprite) g.userData.sprite.material.opacity = 0.5 - i * 0.08;
    g.position.set(from.x + (to.x - from.x) * u, 0, from.z + (to.z - from.z) * u);
    three.scene.add(g);
    three.fx.push({ mesh: g, life: 0.22 + i * 0.04, max: 0.28 });
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
function killZombie(z) {
  z.alive = false;
  if (z.obj) three.scene.remove(z.obj);
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
      const more = farthestSpirits(rec.type, 1, { x: S.dash.to.x, z: S.dash.to.z })
        .filter(function (s) { return S.dashQueue.indexOf(s) < 0 && s !== S.dash.target; });
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
  if (S.bellT > 0) {
    S.bellT -= dt;
    if (S.bellT <= 0) endBell();
  }
  if (S.timeLeft <= 0) {
    if (S.boss && !S.boss.alive) endRun(true, '시간을 버텼습니다.');
    else endRun(false, '시간이 끝났습니다.');
    return;
  }
  if (!S.sandbox && !S.bossSpawned && S.elapsed >= CFG.bossAt) {
    spawnSpirit({ boss: true, r: 16, nShapes: CFG.bossShapes });
    toast('큰 종을 든 혼령이 나타났어요');
  }
  const wave = 1 + 0.7 * clamp(S.elapsed / CFG.timeLimit, 0, 1);
  if (!S.sandbox) {
    S.zAcc += dt * 1000;
    S.sAcc += dt * 1000;
    const zms = Math.max(500, CFG.spawnZombieMs / wave);
    const sms = Math.max(900, CFG.spawnSpiritMs / wave);
    while (S.zAcc >= zms && S.zombies.filter(function (z) { return z.alive; }).length < 18) {
      S.zAcc -= zms; spawnZombie();
    }
    while (S.sAcc >= sms && S.spirits.filter(function (s) { return s.alive && !s.isBoss; }).length < 8) {
      S.sAcc -= sms; spawnSpirit();
    }
  }
  tickStatuses(dt);
  const zsp = CFG.zombieSpeed * wave;
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
      const st = frozen ? 'hit' : 'walk';
      const vx = S.hero.x - z.x, vz = S.hero.z - z.z;
      art.tickChar(z.obj, 'zombie', st, Math.min(0.05, dt), vx, vz);
    }
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
  three.camera.position.set(S.cam.x + 11 + sx, 14 + sy, S.cam.z + 11 + sz);
  three.camera.lookAt(S.cam.x, 1.2, S.cam.z);
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
function paintInk(pts, fading) {
  const c = $('ink'), ctx = c.getContext('2d'), r = c.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
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
function finishStroke(pts) {
  lastStroke = pts.slice(); inkFade = 0.45;
  paintInk(lastStroke, 1);
  if (!S || !S.playing || S.paused) return null;
  const rec = G.recognize(pts, {});
  S.lastRec = rec;
  if (!rec.type) { toast('잘 안 그려졌어요. ㅣ — V O 중에 그려 보세요'); return rec; }
  beginDash(rec.type);
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
  const p = []; const n = 36;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + Math.PI * 2 * 0.98 * (i / (n - 1));
    p.push({ x: x + Math.cos(a) * s * 0.7, y: y + Math.sin(a) * s * 0.7 });
  }
  return p;
}
function strokeType(type) {
  const r = $('ink').getBoundingClientRect();
  const pts = syntheticPath(type, r.width * 0.5, r.height * 0.32, Math.min(80, r.width * 0.22));
  return finishStroke(pts);
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

function onResize() {
  if (!three) return;
  const w = three.view.clientWidth, h = Math.max(1, three.view.clientHeight);
  three.camera.aspect = w / h;
  three.camera.updateProjectionMatrix();
  three.renderer.setSize(w, h);
  resizeInk();
}

function fadeFx(obj, a) {
  if (!obj) return;
  if (obj.material && obj.material.opacity != null) obj.material.opacity = a;
  if (obj.children) obj.children.forEach(function (c) { fadeFx(c, a); });
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
  if (inkFade > 0 && !pointers.down) {
    inkFade -= raw;
    if (inkFade <= 0) { lastStroke = null; paintInk(null); }
    else paintInk(lastStroke, clamp(inkFade / 0.35, 0, 1));
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
    }
    (three.fx || []).forEach(function (f) {
      if (!f.sheet || !f.spr || !f.spr.material || !f.spr.material.map) return;
      const fr = Math.min(f.n - 1, Math.max(0, Math.floor((1 - f.life / f.max) * f.n)));
      const tmap = f.spr.material.map;
      tmap.repeat.set(1 / f.n, 1);
      tmap.offset.set(fr / f.n, 0);
    });
    three.renderer.render(three.scene, three.camera);
    updateMarks();
  }
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
  loadMarkImages();
  resizeInk();
  guardEvents();
  bindUi();
  onResize();
  renderHud();
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
    persist(); renderHud();
  },
  setQa: function (o) { Object.keys(o || {}).forEach(function (k) { qa[k] = o[k]; }); },
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
  strokePath: finishStroke,
  recognize: function (pts, opt) { return G.recognize(pts, opt); },
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
  showTitle: function () { showOv('ov-title'); },
  openShop: function () { refreshShop(); showOv('ov-shop'); },
  snapshot: function () {
    return {
      hero: S && { x: S.hero.x, z: S.hero.z },
      spirits: S ? S.spirits.filter(function (s) { return s.alive; }).map(function (s) { return { id: s.id, shape: spiritShape(s), x: s.x, z: s.z, boss: s.isBoss, seqI: s.seqI, seq: s.seq }; }) : [],
      zombies: S ? S.zombies.filter(function (z) { return z.alive; }).map(function (z) { return { id: z.id, x: z.x, z: z.z, hp: z.hp, frozen: z.frozen > 0, freezeLeft: z.frozen || 0, burn: z.burn > 0, burnLeft: z.burn || 0, poison: z.poison || 0 }; }) : [],
      items: S ? S.items.filter(function (i) { return i.alive; }).map(function (i) { return { id: i.id, type: i.kind, x: i.x, z: i.z }; }) : [],
      lastDash: S && S.lastDash,
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
