/* v2/js/inkpose3d.js — v0.43 '동작마다 전용 그림' 포즈 카드 캐릭터.

   v0.41 리그는 한 장의 정면 그림을 부위로 잘라 비틀어 움직였다(자세 자체는 하나).
   v0.42 는 캐릭터마다 **동작별로 실제로 다른 자세를 그린 그림**을 가로로 이어 붙인 스트립을 쓴다.

   · 자산: assets/diorama/poses/{char}_{action}.png  — N칸 가로 스트립(칸마다 같은 발 앵커)
           assets/diorama/poses/{char}_{action}_aura.png — 같은 실루엣을 부풀린 발광판(정예 금테·예고)
   · 동작: idle(호흡) · walk(보폭) · slash(일섬) · attack · windup(기 모으기) · strike(강공) · hit(피격)
   · v0.43: 그림판은 **한 장만** 쓴다. 동작이 바뀌면 그 판의 스트립·칸 수를 바로 갈아 끼우고
     프레임 0 부터 다시 센다 — 반투명 크로스페이드가 없으므로 같은 인물이 두 겹으로 보이지 않는다.
   · v0.43: 프레임 UV 는 `uFx = 정수 프레임 번호` 다(셰이더가 uFx * 1/nf 로 칸을 찾는다).
   · 보조 움직임: 걷기 위상에 맞춘 상하 바운스·앞기울기·좌우 흔들림(그림은 그대로, 몸만 산다).
   · 좌우 반전은 group.scale.x. 지오메트리·텍스처는 캐릭터 간 공유, 재질은 한 장. */
import * as THREE from 'three';

const BASE = new URL('../assets/diorama/poses/', import.meta.url).href;

export const state = { started: false, ready: false, ms: 0, n: 0, fail: [] };
export let manifest = null;
const tex = {};
let promise = null;

/* 동작별 재생 규칙
   fps  : 초당 프레임(그림 전환 속도)   loop: 반복
   fade : 동작 전환 크로스페이드(초)     hold: 마지막 프레임을 붙잡는 여운(초)
   burst: 상태가 아니라 사건(일섬·피격)으로 터지는 동작 */
const ACT = {
  idle:   { loop: true,  fps: 0.85 },
  walk:   { loop: true,  fps: 8.0,  stride: true },
  slash:  { loop: false, fps: 18.0, hold: 0.10, burst: true },
  attack: { loop: false, fps: 9.5,  hold: 0.15, burst: true },
  windup: { loop: false, fps: 6.0,  hold: 2.00 },
  strike: { loop: false, fps: 8.5,  hold: 0.30 },
  hit:    { loop: false, fps: 15.0, hold: 0.08, burst: true }
};
/* 한 걸음에 나아가는 거리(m) — 걷기 위상을 실제 이동 속도에 묶는다 */
const STRIDE = { hero: 1.15, minion: 0.95, heavy: 1.25, stone: 1.05, boss: 1.55 };
const BOB = { hero: 0.070, minion: 0.048, heavy: 0.060, stone: 0.040, boss: 0.090 };

function loadImage(url) {
  return new Promise(function (resolve) {
    const img = new Image();
    img.decoding = 'async';
    let done = false;
    const fin = function (ok) { if (done) return; done = true; resolve(ok ? img : null); };
    img.onload = function () { fin(true); };
    img.onerror = function () { fin(false); };
    img.src = url;
    if (img.decode) img.decode().then(function () { fin(true); }, function () {});
  });
}

function makeTex(img) {
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export function preload() {
  if (promise) return promise;
  state.started = true;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  promise = fetch(BASE + 'manifest.json')
    .then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
    .then(function (m) {
      manifest = m;
      const files = [];
      Object.keys(m.chars || {}).forEach(function (c) {
        const A = m.chars[c].actions || {};
        Object.keys(A).forEach(function (a) { files.push(A[a].f); if (A[a].a) files.push(A[a].a); });
      });
      return Promise.all(files.map(function (f) {
        return loadImage(BASE + f).then(function (img) {
          if (!img) { state.fail.push(f); return null; }
          tex[f] = makeTex(img);
          return f;
        });
      }));
    })
    .then(function () {
      state.ready = state.fail.length === 0 && !!manifest;
      state.n = Object.keys(tex).length;
      state.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      try {
        if (window.console && console.info) {
          console.info('[심안] 동작 포즈 ' + state.n + '장 · ' + state.ms + 'ms' +
            (state.fail.length ? ' · 실패 ' + state.fail.join(',') : ''));
        }
      } catch (e) {}
      return state;
    })
    .catch(function (e) {
      state.fail.push(String((e && e.message) || e).slice(0, 80));
      state.ready = false;
      return state;
    });
  return promise;
}

export function ready() { return !!(state.ready && manifest); }
export function manifestOf(name) { return (ready() && manifest.chars[name]) || null; }
export function texOf(f) { return tex[f] || null; }
export function info() {
  return { ready: state.ready, n: state.n, ms: state.ms, fail: state.fail.slice(), chars: manifest ? Object.keys(manifest.chars) : [] };
}

/* ---------- 스트립에서 한 칸만 골라 그리는 재질 ---------- */
function frameMat(texImg, nf, opt) {
  opt = opt || {};
  const mat = new THREE.MeshBasicMaterial({
    map: texImg, transparent: true, depthWrite: false, depthTest: opt.depthTest === false ? false : true,
    alphaTest: 0.02, side: THREE.DoubleSide,
    blending: opt.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    premultipliedAlpha: !opt.add, opacity: 1, fog: true
  });
  /* uInset: 이웃 칸과의 경계에서 한두 픽셀이 섞이지 않도록 각 칸 안쪽으로 조금 들어간다.
     칸 폭(1/nf)의 약 1.2%(최소 0.004) — 그림 여백 안에서만 잘리므로 인물은 온전히 남는다. */
  const inset = Math.min(0.02, Math.max(0.004, 0.012 / Math.max(1, nf)));
  const u = { uFx: { value: 0 }, uFs: { value: 1 / Math.max(1, nf) }, uInset: { value: inset } };
  mat.userData.frameU = u;
  mat.userData.nf = Math.max(1, nf);
  mat.onBeforeCompile = function (sh) {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFx;\nuniform float uFs;\nuniform float uInset;')
      .replace('#include <map_fragment>', [
        'float inkX = uFx * uFs + uInset;',
        'float inkW = uFs - uInset * 2.0;',
        'vec4 sampledDiffuseColor = texture2D(map, vec2(inkX + vMapUv.x * inkW, vMapUv.y));',
        'diffuseColor *= sampledDiffuseColor;'
      ].join('\n'));
  };
  mat.customProgramCacheKey = function () { return 'inkpose' + (opt.add ? 'a' : ''); };
  return mat;
}

const GEOM = {};   /* 캐릭터별 공유 지오메트리(모든 동작이 같은 칸 크기) */
let CAM = null;    /* 카메라(비스듬히 위에서 내려다본다) — 포즈 판을 카메라 평면에 세운다 */
const RIGHT = new THREE.Vector3(1, 0, 0);
export function setCamera(c) {
  CAM = c;
  if (CAM && CAM.matrixWorld) RIGHT.setFromMatrixColumn(CAM.matrixWorld, 0);
}

function geomOf(name, fig) {
  if (GEOM[name]) return GEOM[name];
  const pw = fig.cell[0] / fig.ppm, ph = fig.cell[1] / fig.ppm;
  const geo = new THREE.PlaneGeometry(pw, ph, 1, 1);
  geo.translate(0, ph / 2, 0);          /* 바닥(발)이 원점 */
  GEOM[name] = geo;
  return geo;
}

/**
 * 포즈 카드 캐릭터를 만든다. 자산이 없으면 null(→ art.js 가 v0.41 리그·코드 드로잉으로 폴백).
 * opt: { order, bossVar, tint, opacity, auraColor, opacity }
 */
export function buildPose(name, opt) {
  if (!ready()) return null;
  const fig = manifest.chars[name];
  if (!fig) return null;
  opt = opt || {};
  const acts = fig.actions || {};
  const start = acts.idle ? 'idle' : (acts.walk ? 'walk' : Object.keys(acts)[0]);
  if (!start) return null;

  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);
  const geo = geomOf(name, fig);
  const base = opt.order != null ? opt.order : (name === 'hero' ? 8 : 2);
  const auraHex = opt.auraColor != null ? opt.auraColor : 0xE7D7B2;

  const rig = {
    kind: 'pose', name: name, fig: fig, acts: acts, face: opt.face || 1, root: root,
    speed: 0, px: 0, pz: 0, first: true, base: base,
    cur: null, trans: 1, t: 0, phase: 0, burst: null, burstT: 0,
    lean: 0, st: {}, alpha: opt.opacity != null ? opt.opacity : 1,
    tint: [1, 1, 1], auraHex: auraHex, auraOp: opt.auraOpacity != null ? opt.auraOpacity : 0.55,
    layers: [], parts: [], bob: 0, frameOf: {}
  };

  for (let i = 0; i < 1; i++) {
    const mesh = new THREE.Mesh(geo, frameMat(tex[acts[start].f], acts[start].nf, { depthTest: false }));
    mesh.frustumCulled = false;
    mesh.renderOrder = base;
    root.add(mesh);
    const aura = new THREE.Mesh(geo, frameMat(tex[acts[start].a] || tex[acts[start].f], acts[start].nf,
      { depthTest: false, add: true }));
    aura.frustumCulled = false;
    aura.renderOrder = base - 0.06;
    aura.material.color.setHex(auraHex);
    aura.material.opacity = 0;
    aura.visible = !!acts[start].a;
    root.add(aura);
    mesh.scale.x = rig.face;      /* v0.43.2: 좌우 반전은 판(자식)에서 한다 — 부모를 뒤집으면
                                     카메라 회전(빌보드)까지 함께 뒤집혀 캐릭터가 2시 방향으로 누운다. */
    aura.scale.x = rig.face;
    const L = { act: start, t: 0, nf: acts[start].nf, mesh: mesh, aura: aura, frame: 0 };
    rig.layers.push(L);
    rig.parts.push(mesh, aura);
  }
  rig.cur = start;
  rig.fadeOn = false;
  rig.layers[0].mesh.material.opacity = rig.alpha;
  rig.layers[0].aura.visible = !!acts[start].a;

  group.userData.rig = rig;
  group.userData.pose = rig;
  group.userData.worldH = fig.cell[1] / fig.ppm;
  group.userData.sprite = rig.layers[0].mesh;
  group.userData.parts = rig.parts;
  group.userData.poseSource = 'pose';
  return group;
}

/* 레이어에 동작을 물린다 — 재질은 그대로 두고 텍스처·칸 수만 바꾼다. */
function setLayerAction(L, action, acts) {
  const A = acts[action];
  if (!A) return false;
  const ti = tex[A.f];
  if (!ti) return false;
  L.act = action;
  L.nf = Math.max(1, A.nf || 1);
  L.mesh.material.map = ti;
  L.mesh.material.userData.frameU.uFs.value = 1 / L.nf;
  const ai = A.a ? tex[A.a] : null;
  if (ai) {
    L.aura.material.map = ai;
    L.aura.material.userData.frameU.uFs.value = 1 / L.nf;
  }
  L.frame = 0;
  L.aura.visible = !!ai;
  return true;
}

function applyFrame(rig, L) {
  if (!L.mesh) return;
  const nf = L.nf;
  const def = ACT[L.act] || ACT.idle;
  let f;
  if (def.loop && def.stride) f = Math.floor(rig.phase) % nf;
  else if (def.loop) f = Math.floor(L.t * def.fps) % nf;
  else f = Math.floor(Math.min(L.t * def.fps, nf - 1e-4));
  if (f < 0 || !isFinite(f)) f = 0;
  L.frame = f;
  /* v0.43 버그 수정: 셰이더는 inkX = uFx * uFs + inset 로 칸을 찾는다 → uFx 는 **정수 프레임 번호**.
     예전에는 f/nf 를 넣어 f/nf² 가 되어 두 칸 경계에 걸쳤고, 그 때문에 인물이 반쪽씩 두 겹으로 보였다. */
  L.mesh.material.userData.frameU.uFx.value = f;
  L.aura.material.userData.frameU.uFx.value = f;
  rig.frameOf[L.act] = f;
}

/* 동작 전환 — 한 장짜리 판의 스트립·칸 수만 바로 갈아 끼우고 프레임 0 부터 다시 센다.
   v0.43: 두 층 크로스페이드 제거(같은 인물이 두 겹으로 보이던 원인). */
function begin(rig, action) {
  if (!rig || !action || rig.cur === action) return false;
  const A = rig.layers[0];
  if (!setLayerAction(A, action, rig.acts)) return false;
  A.t = 0;
  rig.cur = action;
  applyFrame(rig, A);
  return true;
}

/* 사건형 동작(일섬·피격·공격)을 처음부터.
   force=true 는 '새 사건'(맞았다·베었다) — 같은 동작이라도 0프레임부터 다시.
   force=false 는 상태가 매 프레임 같은 값을 보내는 경우 — 재시작하지 않고 그대로 재생한다
   (그렇지 않으면 걷기 사이사이 공격 자세가 0프레임에 멈춘다). */
function burst(rig, action, force) {
  if (!rig || !rig.acts[action]) return;
  const A = rig.layers[0];
  if (A.act === action && rig.burst === action && !force) { rig.burstT = 0; return; }
  if (A.act !== action) {
    if (!setLayerAction(A, action, rig.acts)) return;
    rig.cur = action;
  }
  A.t = 0;
  rig.burst = action;
  rig.burstT = 0;
  applyFrame(rig, A);
}

/** 한 프레임. state: idle/walk/dash/attack/hit/boss:walk/boss:telegraph … */
export function tickPose(group, kind, state, dt, vx, vz) {
  const ud = group && group.userData;
  const rig = ud && ud.rig;
  if (!rig) return false;
  if (rig.freeze) return true;
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.1) dt = 0.1;
  const st = String(state || 'idle');
  const name = rig.name;
  const root = rig.root;

  /* --- 이동 속도(위치 차분) --- */
  const gx = group.position.x, gz = group.position.z;
  if (rig.first) { rig.px = gx; rig.pz = gz; rig.first = false; }
  const dx = gx - rig.px, dz = gz - rig.pz;
  rig.px = gx; rig.pz = gz;
  const spRaw = Math.sqrt(dx * dx + dz * dz) / dt;
  rig.speed += (Math.min(spRaw, 16) - rig.speed) * Math.min(1, dt * 10);
  /* 히스테리시스: 걷기 시작 0.45 · 멈춤 0.25 — 경계에서 대기/걷기가 깜빡이지 않게 */
  const walking = rig.speed > (rig.walking ? 0.25 : 0.45);
  rig.walking = walking;

  /* --- 좌우 반전 --- */
  const fd = (vx || 0) - (vz || 0);
  if (Math.abs(fd) > 0.05) rig.face = fd < 0 ? -1 : 1;
  /* v0.43.2 핫픽스: 부모 group.scale.x = face 로 뒤집으면 자식의 빌보드 회전(R_cam)까지 거울 반사되어
     캐릭터·적이 화면에서 2시 방향으로 기울어졌다. 반전은 판(mesh)에만 준다(재질 DoubleSide). */
  group.scale.x = 1;
  for (let li = 0; li < rig.layers.length; li++) {
    const LL = rig.layers[li];
    if (LL.mesh) LL.mesh.scale.x = rig.face;
    if (LL.aura) LL.aura.scale.x = rig.face;
  }

  /* --- 상태 → 원하는 동작 --- */
  let want = 'idle';
  if (name === 'boss') {
    const bs = st.indexOf('boss:') === 0 ? st.slice(5) : st;
    if (bs === 'telegraph' || bs === 'slamTele' || bs === 'volleyTele' || bs === 'mimicTele' ||
        bs === 'chant' || bs === 'kiai' || bs === 'seal' || bs === 'sealing' || bs === 'cast') want = 'windup';
    else if (bs === 'charge' || bs === 'mimicCharge' || bs === 'clash' || bs === 'shuffle' || bs === 'slam' || bs === 'strike') want = 'strike';
    else if (bs === 'stun' || bs === 'groggy' || bs === 'hit') want = 'hit';
    else want = walking && rig.acts.walk ? 'walk' : 'idle';
    if (want === 'hit') { burst(rig, 'hit'); want = 'hit'; }
  } else if (st === 'dash' || st === 'slash') {
    burst(rig, rig.acts.slash ? 'slash' : 'attack');
    want = rig.acts.slash ? 'slash' : 'attack';
  } else if (st === 'attack' || st === 'wind') {
    burst(rig, rig.acts.attack ? 'attack' : 'slash');
    want = rig.acts.attack ? 'attack' : 'slash';
  } else if (st === 'hit') {
    burst(rig, rig.acts.hit ? 'hit' : 'attack');
    want = rig.acts.hit ? 'hit' : 'attack';
  } else if (st === 'frozen') {
    want = rig.acts.idle ? 'idle' : 'walk';
  } else {
    want = walking && rig.acts.walk ? 'walk' : (rig.acts.idle ? 'idle' : 'walk');
  }

  /* 사건형 동작이 살아 있는 동안은 그 동작을 유지(끝나면 상태로 복귀) */
  if (rig.burst) {
    const def = ACT[rig.burst] || ACT.idle;
    const L = rig.layers[0];
    const dur = L.nf / def.fps + (def.hold || 0);
    rig.burstT += dt;
    if (rig.burstT < dur && L.act === rig.burst) want = rig.burst;
    else { rig.burst = null; }
  }
  begin(rig, want);

  /* --- 한 장짜리 판 진행 --- */
  const A = rig.layers[0];
  A.t += dt;

  /* 걷기 위상: 실제 이동 거리에 묶는다 */
  const stride = STRIDE[name] || 1.1;
  if (walking) rig.phase += (rig.speed * dt) / stride * Math.max(1, A.nf);
  else rig.phase += dt * 0.6;

  applyFrame(rig, A);
  A.mesh.visible = true;
  A.mesh.material.opacity = rig.alpha;
  A.aura.material.opacity = rig.auraOp * rig.alpha;
  A.aura.visible = !!A.aura.material.map;

  /* --- 보조 움직임: 바운스·기울기·좌우 흔들림 --- */
  const nfA = Math.max(1, A.nf);
  const walkK = walking ? Math.min(1, rig.speed / 1.6) : 0;
  const cyc = Math.PI * (rig.phase / nfA) * 2;
  rig.bob = Math.abs(Math.sin(cyc)) * (BOB[name] || 0.06) * walkK + Math.sin(rig.t * 1.2) * 0.004;
  root.position.y = rig.bob;
  const active = A;
  const lunge = (active.act === 'slash' || active.act === 'attack' || active.act === 'strike') ? 0.06 : 0;
  const leanT = (walking ? 0.05 * walkK : 0) + lunge;
  rig.lean += (leanT - rig.lean) * Math.min(1, dt * 9);
  rig.lean = Math.max(-0.09, Math.min(0.13, rig.lean));
  const tilt = (-rig.lean * rig.face * 0.7) + Math.sin(rig.t * 1.1) * 0.005;
  const sway = Math.sin(cyc) * 0.020 * walkK;
  if (CAM) {
    A.mesh.quaternion.copy(CAM.quaternion); A.aura.quaternion.copy(CAM.quaternion);
  }
  A.mesh.rotateZ(tilt); A.aura.rotateZ(tilt);
  root.position.x = RIGHT.x * sway * rig.face;
  root.position.z = RIGHT.z * sway * rig.face;
  rig.t += dt;
  return true;
}

/** 피격: hit 동작을 처음부터 재생 + 살짝 밀리는 반동 */
export function kick(group, strength) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  burst(rig, rig.acts.hit ? 'hit' : 'attack', true);
}

/** 일섬: slash 동작을 처음부터 */
export function slashPose(group, k) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  burst(rig, rig.acts.slash ? 'slash' : 'attack', true);
}

export function setOpacity(group, o) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  rig.alpha = o;
  rig.layers.forEach(function (L) {
    L.mesh.material.opacity = o;
    L.aura.material.opacity = rig.auraOp * o;
  });
}

export function setTint(group, r, g, b) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  rig.tint = [r, g, b];
  rig.layers.forEach(function (L) {
    if (L.mesh.material && L.mesh.material.color) L.mesh.material.color.setRGB(r, g, b);
  });
}

export function setAuraColor(group, hex, opacity) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  rig.auraHex = hex;
  if (opacity != null) rig.auraOp = opacity;
  rig.layers.forEach(function (L) {
    L.aura.material.color.setHex(hex);
    if (opacity != null) L.aura.material.opacity = opacity * rig.alpha;
  });
}

export function setOrder(group, base) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  rig.base = base;
  rig.layers.forEach(function (L) {
    L.mesh.renderOrder = base;
    L.aura.renderOrder = base - 0.06;
  });
}


try { preload(); } catch (e) {}

/* QA: 자세를 한 장에 고정한다(리뷰 시트·연속 스트립 촬영용). action=null 이면 고정 해제. */
export function debugPose(group, action, frame) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig || rig.kind !== 'pose') return false;
  if (action == null) { rig.freeze = false; return true; }
  rig.freeze = true;
  const A = rig.layers[0];
  if (A.act !== action) setLayerAction(A, action, rig.acts);
  A.mesh.visible = true; A.aura.visible = !!A.aura.material.map;
  A.mesh.material.opacity = rig.alpha;
  A.aura.material.opacity = rig.auraOp * rig.alpha;
  rig.cur = action;
  A.t = 0; rig.phase = 0;
  const nf = Math.max(1, A.nf);
  const f = Math.max(0, Math.min(nf - 1, frame | 0));
  A.mesh.material.userData.frameU.uFx.value = f;
  A.aura.material.userData.frameU.uFx.value = f;
  A.mesh.material.userData.frameU.uFs.value = 1 / nf;
  A.aura.material.userData.frameU.uFs.value = 1 / nf;
  A.frame = f;
  rig.frameOf[action] = f;
  rig.root.position.set(0, 0, 0);
  if (CAM) { A.mesh.quaternion.copy(CAM.quaternion); A.aura.quaternion.copy(CAM.quaternion); }
  A.mesh.scale.x = rig.face; A.aura.scale.x = rig.face;
  return true;
}

export function actsOf(name) {
  const f = manifestOf(name);
  if (!f) return null;
  const out = {};
  Object.keys(f.actions).forEach(function (k) { out[k] = f.actions[k].nf; });
  return out;
}
