/* v2/js/inkpose3d.js — v0.44 '물 흐르는 12프레임' 포즈 카드 캐릭터.

   v0.42~0.43 은 동작당 3~6장이라 프레임 사이 간극이 커서 걸음·베기가 뚝뚝 끊겼다.
   v0.44 는 자산 자체를 **동작당 12프레임 연속 동작**으로 다시 그렸고(assets/diorama/poses, nf=12),
   그 위에 60fps 보간을 얹는다.

   · 타이밍 곡선: 프레임마다 머무는 시간이 다르다(기 모으기 느리게 → 베기 빠르게 → 여운 느리게).
     ACT[].curve 가 프레임별 가중치다. 12장을 균등 재생하면 '기계처럼' 보이므로 손그림 타이밍을 흉내낸다.
   · 판 2차 흔들림(uShear): 아래(발)는 고정, 위로 갈수록 늦게 따라오는 전단 변형 — 도포자락·머리카락이
     프레임과 무관하게 60fps 로 흔들린다.
   · 접지 스쿼시: 발이 땅에 닿는 위상에서 세로로 눌리고 가로로 퍼진다.
   · 좌우 반전은 종이 뒤집힘: 판 폭이 0을 지나며 반전(즉시 스냅 없음). 부모 group 은 절대 뒤집지 않는다
     (v0.43.2 핫픽스 — 부모 반전은 빌보드 회전까지 거울 반사해 2시 방향으로 눕혔다).
   · 무리 동기화 방지: 적마다 걷기 위상·호흡 시계를 어긋나게 시작한다.

   자산 규칙(반드시 지킬 것)
   · uFx = **정수 프레임 번호**, uFs = 1 / nf. (uFx 에 f/nf 를 넣으면 칸 경계에 걸려 분신처럼 보인다.)
   · 판은 캐릭터당 한 장. 동작이 바뀌면 그 판의 스트립·칸 수만 갈아 끼우고 프레임 0부터 센다.
     반투명 크로스페이드를 쓰지 않는다(같은 인물이 두 겹으로 보이던 원인). */
import * as THREE from 'three';

const BASE = new URL('../assets/diorama/poses/', import.meta.url).href;

export const state = { started: false, ready: false, ms: 0, n: 0, fail: [] };
export let manifest = null;
const tex = {};
let promise = null;

/* 동작별 재생 규칙
   dur  : 한 번(또는 한 주기) 재생 시간(초) — v0.43 의 nf/fps 와 같은 길이로 맞춰 게임 리듬을 유지한다
   loop : 반복   hold: 마지막 프레임을 붙잡는 여운(초)   burst: 상태가 아니라 사건(일섬·피격)
   curve: 프레임별 머무름 가중치(합은 자유 — 정규화한다) */
const ACT = {
  idle:   { loop: true,  dur: 3.50, curve: [1.00, 1.05, 1.10, 1.06, 1.00, 0.95, 0.98, 1.04, 1.10, 1.06, 1.00, 0.96] },
  walk:   { loop: true,  stride: true },
  slash:  { loop: false, dur: 0.28, hold: 0.10, burst: true, curve: [1.90, 1.60, 1.30, 1.05, 0.90, 0.82, 0.80, 0.85, 0.95, 1.10, 1.35, 1.70] },
  attack: { loop: false, dur: 0.42, hold: 0.15, burst: true, curve: [1.90, 1.50, 1.15, 0.90, 0.75, 0.65, 0.70, 0.80, 0.95, 1.15, 1.45, 1.70] },
  windup: { loop: false, dur: 0.83, hold: 2.00, curve: [1.40, 1.30, 1.20, 1.10, 1.00, 0.95, 0.90, 0.90, 0.95, 1.05, 1.15, 1.20] },
  strike: { loop: false, dur: 0.47, hold: 0.30, curve: [1.80, 1.45, 1.10, 0.85, 0.70, 0.60, 0.65, 0.75, 0.95, 1.20, 1.50, 1.75] },
  hit:    { loop: false, dur: 0.20, hold: 0.08, burst: true, curve: [1.30, 0.95, 0.75, 0.62, 0.58, 0.60, 0.72, 0.90, 1.15, 1.45, 1.70, 1.85] }
};
/* 한 걸음에 나아가는 거리(m) — 걷기 위상을 실제 이동 속도에 묶는다 */
const STRIDE = { hero: 1.15, minion: 0.95, heavy: 1.25, stone: 1.05, boss: 1.55 };
const BOB = { hero: 0.055, minion: 0.040, heavy: 0.050, stone: 0.034, boss: 0.075 };
/* 전단(2차 흔들림) 세기 — 키 대비 비율 */
const SHEAR = { hero: 0.030, minion: 0.026, heavy: 0.020, stone: 0.012, boss: 0.024 };

const CUMS = {};   /* 동작별 누적 타이밍 곡선 캐시 */
function cumFor(act, nf) {
  const key = act + ':' + nf;
  if (CUMS[key]) return CUMS[key];
  const def = ACT[act];
  if (!def || !def.curve) { CUMS[key] = null; return null; }
  const c = def.curve;
  const w = [];
  let s = 0;
  for (let i = 0; i < nf; i++) {
    const j = Math.min(c.length - 1, Math.floor(((i + 0.5) / nf) * c.length));
    w.push(c[j]); s += c[j];
  }
  const out = [];
  let acc = 0;
  for (let i = 0; i < nf; i++) { out.push(acc / s); acc += w[i]; }
  out.push(1);
  CUMS[key] = out;
  return out;
}
function frameAt(u, cum, nf) {
  if (!cum) return Math.max(0, Math.min(nf - 1, Math.floor(u * nf)));
  if (u <= 0) return 0;
  if (u >= 1) return nf - 1;
  let lo = 0, hi = cum.length - 1;
  while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (cum[m] <= u) lo = m; else hi = m; }
  return Math.max(0, Math.min(nf - 1, lo));
}

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
  const u = {
    uNext: { value: 0 }, uMix: { value: 0 }, uFx: { value: 0 }, uFs: { value: 1 / Math.max(1, nf) }, uInset: { value: inset },
    uShear: { value: new THREE.Vector2(0, 0) }, uH: { value: opt.h || 1 }
  };
  mat.userData.frameU = u;
  mat.userData.shearU = u;
  mat.userData.nf = Math.max(1, nf);
  mat.onBeforeCompile = function (sh) {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uShear;\nuniform float uH;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float inkK = clamp(position.y / uH, 0.0, 1.0);',
        'transformed.x += uShear.x * inkK * inkK;'
      ].join('\n'));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNext; uniform float uMix; uniform float uFx;\nuniform float uFs;\nuniform float uInset;')
      .replace('#include <map_fragment>', [
        'float inkX = uFx * uFs + uInset;',
        'float inkW = uFs - uInset * 2.0;',
        'vec4 sampledDiffuseColor = texture2D(map, vec2(inkX + vMapUv.x * inkW, vMapUv.y));',
        'vec4 nextColor = texture2D(map, vec2(uNext*uFs + uInset + vMapUv.x*inkW,vMapUv.y));',
        'float alpha = mix(sampledDiffuseColor.a,nextColor.a,uMix);',
        'vec3 rgb = mix(sampledDiffuseColor.rgb*sampledDiffuseColor.a,nextColor.rgb*nextColor.a,uMix);',
        'diffuseColor *= vec4(rgb/max(alpha,0.0001),alpha);'
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
  const geo = new THREE.PlaneGeometry(pw, ph, name === "boss" ? 18 : 1, name === "boss" ? 24 : 1);
  geo.translate(0, ph / 2, 0);          /* 바닥(발)이 원점 */
  if (name === 'boss') {
    const positions=geo.attributes.position, indices=[], weights=[];
    for(let i=0;i<positions.count;i++) {
      const y=positions.getY(i)/ph, x=positions.getX(i)/pw;
      const upper=THREE.MathUtils.smoothstep(y,.25,.67);
      const shoulder=upper*THREE.MathUtils.smoothstep(Math.abs(x),.08,.32)*(1-THREE.MathUtils.smoothstep(y,.7,.92));
      const head=upper*THREE.MathUtils.smoothstep(y,.72,.91)*(1-shoulder);
      indices.push(0,1,x<0?2:3,4);
      weights.push(1-upper,upper-shoulder-head,shoulder,head);
    }
    geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
    geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  }
  GEOM[name] = geo;
  return geo;
}

function poseMesh(geo,material,height) {
  if (!geo.attributes.skinIndex) return new THREE.Mesh(geo,material);
  const mesh=new THREE.SkinnedMesh(geo,material);
  const [base,spine,left,right,head]=Array.from({length:5},()=>new THREE.Bone());
  mesh.add(base); base.add(spine); spine.add(left,right,head);
  spine.position.y=.38*height;
  left.position.set(-.12*height,.27*height,0);
  right.position.set(.12*height,.27*height,0);
  head.position.y=.40*height;
  mesh.bind(new THREE.Skeleton([base,spine,left,right,head]));
  return mesh;
}

/**
 * 포즈 카드 캐릭터를 만든다. 자산이 없으면 null(→ art.js 가 v0.41 리그·코드 드로잉으로 폴백).
 * opt: { order, bossVar, tint, opacity, auraColor, auraOpacity }
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
  const geoH = fig.cell[1] / fig.ppm;
  const base = opt.order != null ? opt.order : (name === 'hero' ? 8 : 2);
  const auraHex = opt.auraColor != null ? opt.auraColor : 0xE7D7B2;

  const rig = {
    kind: 'pose', name: name, fig: fig, acts: acts, face: opt.face || 1, faceS: opt.face || 1, root: root,
    speed: 0, px: 0, pz: 0, first: true, base: base,
    cur: null, trans: 1, t: 0, burst: null, burstT: 0,
    lean: 0, st: {}, alpha: opt.opacity != null ? opt.opacity : 1,
    tint: [1, 1, 1], auraHex: auraHex, auraOp: opt.auraOpacity != null ? opt.auraOpacity : 0.55,
    layers: [], parts: [], bob: 0, frameOf: {},
    /* v0.44: 무리 전체가 같은 박자로 걷지 않도록 위상·호흡 시계를 어긋나게 시작한다 */
    phase: name === 'hero' ? 0 : Math.random() * 12,
    sq: 0, sqV: 0, sh: 0, shV: 0, wind: Math.random() * 6.28, rec: 0, land: 0
  };
  rig.t = name === 'hero' ? 0 : Math.random() * 2.6;

  for (let i = 0; i < 1; i++) {
    const mesh = poseMesh(geo, frameMat(tex[acts[start].f], acts[start].nf, { depthTest: false, h: geoH }),geoH);
    if (CAM) mesh.quaternion.copy(CAM.quaternion);
    mesh.frustumCulled = false;
    mesh.renderOrder = base;
    root.add(mesh);
    const aura = poseMesh(geo, frameMat(tex[acts[start].a] || tex[acts[start].f], acts[start].nf,
      { depthTest: false, add: true, h: geoH }),geoH);
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
  if (opt.height) root.scale.setScalar(opt.height / geoH);
  group.userData.worldH = opt.height || geoH;
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
  let f, fraction;
  if (def.stride) {
    f = Math.floor(rig.phase) % nf;
    fraction = rig.phase % 1;
  } else {
    const dur = def.dur || 1;
    const u = def.loop ? ((L.t % dur) / dur) : Math.min(1, L.t / dur);
    const curve=cumFor(L.act,nf);
    f=frameAt(u,curve,nf);
    fraction=curve ? (u-curve[f])/(curve[f+1]-curve[f]) : u*nf-f;
  }
  if (f < 0 || !isFinite(f)) f = 0;
  L.frame = f;
  /* 셰이더는 inkX = uFx * uFs + inset 로 칸을 찾는다 → uFx 는 **정수 프레임 번호**. */
  const next = def.loop || def.stride ? (f+1)%nf : Math.min(f+1,nf-1);
  const mix = THREE.MathUtils.smoothstep(fraction,rig.name==='boss' ? .10 : .40,.96);
  for (const part of rig.parts) {
    const u=part.material.userData.frameU;
    u.uFx.value=f; u.uNext.value=next; u.uMix.value=mix;
  }
  rig.frameOf[L.act] = f;
}

/* 동작 전환 — 한 장짜리 판의 스트립·칸 수만 바로 갈아 끼우고 프레임 0 부터 다시 센다.
   두 층 크로스페이드는 쓰지 않는다(같은 인물이 두 겹으로 보이던 원인). */
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
   force=false 는 상태가 매 프레임 같은 값을 보내는 경우 — 재시작하지 않고 그대로 재생한다. */
function burst(rig, action, force) {
  if (!rig || !rig.acts[action]) return;
  const A = rig.layers[0];
  if (A.act === action && !force) return;
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
  rig.speed += (Math.min(spRaw, 16) - rig.speed) * (-Math.expm1(-dt * 10));
  /* 히스테리시스: 걷기 시작 0.45 · 멈춤 0.25 — 경계에서 대기/걷기가 깜빡이지 않게 */
  const walking = rig.speed > (rig.walking ? 0.25 : 0.45);
  rig.walking = walking;

  /* --- 좌우 반전: 종이 뒤집힘(판 폭이 0을 지나며 반전) --- */
  const fd = (vx || 0) - (vz || 0);
  if (Math.abs(fd) > .12*Math.max(1,Math.hypot(vx||0,vz||0))) rig.face = fd < 0 ? -1 : 1;
  group.scale.x = 1;                      /* v0.43.2 핫픽스 — 부모는 절대 뒤집지 않는다 */
  const fT = rig.face;
  /* v0.44: 방향 전환은 '종이 뒤집힘' — 0.12초 동안 폭이 0을 지나며 부드럽게 뒤집힌다(즉시 스냅 금지). */
  if (rig.flipTo !== fT) { rig.flipFrom = rig.faceS == null ? fT : rig.faceS; rig.flipTo = fT; rig.flipT = 0; }
  if (rig.flipT == null || rig.flipT < 1) {
    rig.flipT = Math.min(1, (rig.flipT || 0) + dt / 0.12);
    const e = rig.flipT * rig.flipT * (3 - 2 * rig.flipT);
    rig.faceS = rig.flipFrom + (rig.flipTo - rig.flipFrom) * e;
  } else rig.faceS = fT;
  const fS = rig.faceS == null ? fT : rig.faceS;
  const vis = Math.abs(fS) < 0.12 ? (fS < 0 ? -0.12 : 0.12) : fS;   /* 폭 0 순간을 피한다 */

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
    const dur = (def.dur || 0) + (def.hold || 0);
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

  /* --- 보조 움직임: 바운스·기울기·좌우 흔들림·접지 스쿼시 --- */
  const nfA = Math.max(1, A.nf);
  const walkK = walking ? Math.min(1, rig.speed / 1.6) : 0;
  const cyc = Math.PI * (rig.phase / nfA) * 2;
  const breathe = Math.sin(rig.t * 1.2) * 0.004;
  rig.bob = Math.abs(Math.sin(cyc)) * (BOB[name] || 0.05) * walkK + breathe;

  /* 접지 순간(위상 0 · nf/2)에 세로로 눌리고 가로로 퍼진다 — 종이가 땅을 딛는 무게 */
  const contact = Math.max(0, Math.cos(2 * cyc));
  const actNow = A.act;
  const defA = ACT[actNow] || ACT.idle;
  const progA = defA.dur ? Math.min(1, A.t / defA.dur) : 0;
  if (A.mesh.isSkinnedMesh) {
    const drive=actNow==='windup' ? -.12 : actNow==='strike' ? .24 : actNow==='hit' ? -.09 : 0;
    const smooth=1-Math.exp(-14*dt);
    for(const layer of [A.mesh,A.aura]){
      const [,spine,left,right,head]=layer.skeleton.bones;
      const gait=Math.sin(cyc)*walkK;
      spine.rotation.z+=(drive+.025*gait-spine.rotation.z)*smooth;
      left.rotation.x+=(.13*gait-drive-left.rotation.x)*smooth;
      right.rotation.x+=(-.13*gait+drive*1.6-right.rotation.x)*smooth;
      head.rotation.z+=(-drive*.48-head.rotation.z)*smooth;
    }
  }
  let sqT = -0.050 * contact * walkK;
  if (actNow === 'slash' || actNow === 'attack' || actNow === 'strike') {
    /* 내려치는 순간 살짝 길게 뻗었다가 착지에서 눌린다 */
    sqT += 0.045 * Math.max(0, Math.sin(Math.PI * Math.min(1, progA / 0.55))) - 0.03 * Math.max(0, (progA - 0.5) * 2);
  }
  rig.sqV += (-(rig.sq - sqT) * 190 - rig.sqV * 17) * dt;
  rig.sq += rig.sqV * dt;
  rig.sq = Math.max(-0.09, Math.min(0.09, rig.sq));

  root.position.y = rig.bob;
  const leanT = (walking ? 0.05 * walkK : 0) + ((actNow === 'slash' || actNow === 'attack' || actNow === 'strike') ? 0.06 : 0);
  rig.lean += (leanT - rig.lean) * (-Math.expm1(-dt * 9));
  rig.lean = Math.max(-0.09, Math.min(0.13, rig.lean));
  /* 화면 기울기 = +tilt → 앞으로 기울이는 방향은 -lean * (향한 쪽) */
  const tilt = (-rig.lean * (fS < 0 ? -1 : 1) * 0.7) + Math.sin(rig.t * 1.1) * 0.005;
  const sway = Math.sin(cyc) * 0.018 * walkK;

  /* 판 2차 흔들림: 화면 오른쪽 성분 속도에 뒤처지며 도포·머리가 늦게 따라온다 */
  const velR = (dx / Math.max(1e-4, dt)) * RIGHT.x + (dz / Math.max(1e-4, dt)) * RIGHT.z;
  const shT = Math.max(-1, Math.min(1, -velR * 0.16 + Math.sin(rig.t * 0.85 + rig.wind) * 0.22 * (0.4 + walkK)));
  rig.shV += ((shT - rig.sh) * 120 - rig.shV * 15) * dt;
  rig.sh += rig.shV * dt;
  const shearX = rig.sh * (SHEAR[name] || 0.02) * (geoHFor(rig));

  if (CAM) {
    A.mesh.quaternion.copy(CAM.quaternion); A.aura.quaternion.copy(CAM.quaternion);
  }
  A.mesh.rotateZ(tilt); A.aura.rotateZ(tilt);
  A.mesh.scale.x = vis; A.aura.scale.x = vis;
  A.mesh.scale.y = 1 + rig.sq; A.aura.scale.y = 1 + rig.sq;
  const us = A.mesh.material.userData.shearU;
  if (us && us.uShear) us.uShear.value.set(shearX, 0);
  const ua = A.aura.material.userData.shearU;
  if (ua && ua.uShear) ua.uShear.value.set(shearX, 0);
  root.position.x = RIGHT.x * sway * (fT < 0 ? -1 : 1);
  root.position.z = RIGHT.z * sway * (fT < 0 ? -1 : 1);
  /* 피격 반등 — 맞은 쪽 반대로 살짝 밀렸다가 제자리로 */
  if (rig.rec > 0.0005) {
    rig.rec *= Math.max(0, 1 - dt * 6.5);
    const back = -rig.rec * (fT < 0 ? -1 : 1);
    root.position.x += RIGHT.x * back;
    root.position.z += RIGHT.z * back;
  } else rig.rec = 0;
  rig.t += dt;
  return true;
}

function geoHFor(rig) {
  const g = rig && rig.fig;
  return g && g.cell ? g.cell[1] / g.ppm : 2.4;
}

/** 피격: hit 동작을 처음부터 재생 + 살짝 밀리는 반동 */
export function kick(group, strength) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  burst(rig, rig.acts.hit ? 'hit' : 'attack', true);
  rig.rec = Math.min(0.16, 0.05 + (strength || 0) * 0.06);
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
  A.mesh.scale.set(rig.face, 1, 1); A.aura.scale.set(rig.face, 1, 1);
  if (CAM) { A.mesh.quaternion.copy(CAM.quaternion); A.aura.quaternion.copy(CAM.quaternion); }
  return true;
}

export function actsOf(name) {
  const f = manifestOf(name);
  if (!f) return null;
  const out = {};
  Object.keys(f.actions).forEach(function (k) { out[k] = f.actions[k].nf; });
  return out;
}
