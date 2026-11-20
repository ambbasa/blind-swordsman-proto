import {buildPaintedBoss} from './paintedboss.js';
/* v2/js/inkmonsters3d.js — v0.47 몬스터·보스 전종 **3D 관절 뼈대 + 수묵 툰 셰이더 + 동양 수묵 텍스처**.

   v0.45에서 주인공만 3D 관절 뼈대(inkhero3d.js)로 세웠다. v0.46은 원귀(조선 좀비)·거한(장정)·
   돌덩이(석인)·보스를 같은 방식으로 올린다. v0.44까지의 2D 포즈 카드는 폴백으로 남긴다.

   1) **성능이 설계의 중심** — 한 화면에 30~50마리가 뜬다. 주인공처럼 파츠마다 Mesh 를 두면
      마리당 12~16 드로우콜이 되어 40마리에서 600콜이 넘는다. 그래서 종류마다 파츠 지오메트리를
      **하나로 합친 단일 `SkinnedMesh`**(skinIndex/skinWeight 정점 바인딩) + 먹 외곽선 1장 =
      **마리당 2콜**로 묶었다. 지오메트리·클립은 종류별 캐시에서 나눠 쓰고, 개체마다 뼈대
      (Bone 20여 개)·Skeleton·재질 2개·AnimationMixer 만 가볍게 새로 만든다.
   2) **톤 일치** — 조각 셰이더 문자열을 inkhero3d.js 에서 그대로 받아(INK3D.FRAG) 3단 붓 계조·
      한지 바탕광·먹 그레인·가장자리 농도를 주인공과 100% 같게 쓴다. 다른 점은 두 가지뿐:
      (a) 정점 스키닝을 위해 vertex 셰이더에 skinning 청크를 넣고, (b) 개체별 tint·rim·alpha
      uniform 을 더했다(상태이상 색·정예 금테·예고 붉은 테·죽을 때 옅어짐).
   3) **동작** — 종류마다 idle/walk/attack/hit (+보스는 wind/strike) 클립을 키프레임으로 만들고
      AnimationMixer 로 재생, crossFadeTo 로 잇는다. 무리 위상은 개체마다 랜덤 오프셋을 줘
      좀비들이 같은 박자로 걷지 않는다.
   4) **8방향** — group.scale.x = -1 을 쓰지 않는다. 이동·조준 방향으로 rotation.y 를 slerp 한다.
   5) **v0.47 텍스처·걷기** — 부위마다 아틀라스 칸(zone)을 굽고(원귀=관복 천·붉은 부적 한자,
      거한=찰갑 비늘, 석인=바위 균열, 보스=금박 구름) uv 로 결을 얹는다. 그리고 v0.46에서 걷기
      키프레임이 `p:{}` 밖에 놓여 **다리가 전혀 움직이지 않던 버그**를 고쳤다(아래 clips 참조).

   상태 문자열은 게임이 이미 넘겨 주는 것을 그대로 받는다(art.js tickChar):
     원귀 = walk | frozen | hit | attack | burning | poisoned,  보스 = 'boss:<상태>'.
*/
import * as THREE from 'three';
import { INK3D } from './inkhero3d.js';
import { SPECS } from './inkmodels3d.js';
import { bakeBody, makeBones, clothStep, uprightBone } from './inkbody3d.js';
import * as TEX from './inktex3d.js';

const B = INK3D;

/* 종류별 지오메트리·클립·재질 원본은 한 번만 만든다(개체가 늘어도 GPU 메모리·링크 비용 0). */
const GEO = {};
const CLIPS = {};
let LIVE = 0, FRAME = 0, CAM = null;
export function setCamera(c) { CAM = c; }
export function stats() {
  const g = {};
  Object.keys(GEO).forEach(function (k) { g[k] = { verts: GEO[k].verts, tris: GEO[k].tris, hull: GEO[k].hullVerts }; });
  return { live: LIVE, species: g, frames: FRAME };
}

/* ---------------------------------------------------------------- 셰이더 */
/* 주인공(inkhero3d.js)의 정점/프래그먼트와 같은 계조를 쓰되, 정점만 스키닝을 위해 청크를 끼운다. */
const VERT = [
  'attribute vec3 color;',
  'attribute float zone;',
  'uniform float uHeight;',
  'varying vec3 vAlb;',
  'varying vec3 vN;',
  'varying vec3 vV;',
  'varying vec3 vW;',
  'varying float vH;',
  'varying vec2 vTuv;',
  'varying float vZone;',
  '#include <common>',
  '#include <skinning_pars_vertex>',
  'void main() {',
  '  vAlb = color;',
  '  vTuv = uv;',
  '  vZone = zone;',
  '  vec3 transformed = vec3(position);',
  '  vec3 objectNormal = vec3(normal);',
  '#include <skinbase_vertex>',
  '#include <skinnormal_vertex>',
  '#include <skinning_vertex>',
  '  vec4 wp = modelMatrix * vec4(transformed, 1.0);',
  '  vW = wp.xyz;',
  '  vN = normalize(mat3(modelMatrix) * objectNormal);',
  '  vV = normalize(cameraPosition - wp.xyz);',
  '  vH = clamp(wp.y / max(0.6, uHeight), 0.0, 1.0);',
  '  gl_Position = projectionMatrix * viewMatrix * wp;',
  '}'
].join('\n');

/* 주인공 프래그먼트에 개체별 tint(uTint)와 투명도(uAlpha)만 얹는다 — 나머지는 글자 하나 안 바뀐다.
   v0.47의 한지·먹결 텍스처 샘플링은 주인공 셰이더에 이미 들어 있어 이대로 따라온다. */
const FRAG = B.FRAG
  .replace('uniform float uRim, uWash, uGrain;', 'uniform float uRim, uWash, uGrain;\nuniform vec3 uTint;\nuniform float uAlpha;')
  /* 테는 '가장자리 선'이어야 한다 — 몬스터는 정예 금테·예고 붉은 테를 자주 켜므로
     주인공(4제곱)보다 좁은 5제곱으로 좁히고 세기도 절반으로 줄인다. */
  .replace('float fres = pow(1.0 - clamp(dot(N, normalize(vV)), 0.0, 1.0), 4.0);',
           'float fres = pow(1.0 - clamp(dot(N, normalize(vV)), 0.0, 1.0), 5.0) * 0.22;')
  .replace('vec3 col = vAlb * light * wash * grain;', 'vec3 col = vAlb * uTint * light * wash * grain;')
  .replace('gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);', 'gl_FragColor = vec4(max(col, vec3(0.0)), uAlpha);');

const HVERT = [
  '#include <common>',
  '#include <skinning_pars_vertex>',
  'void main() {',
  '  vec3 transformed = vec3(position);',
  '#include <skinbase_vertex>',
  '#include <skinning_vertex>',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);',
  '}'
].join('\n');
const HFRAG = 'uniform vec3 uColor;\nuniform float uAlpha;\nvoid main() { gl_FragColor = vec4(uColor, uAlpha); }';

function bodyMat(height) {
  const u = B.inkUniforms();
  u.uTint = { value: new THREE.Color(1, 1, 1) };
  u.uAlpha = { value: 1 };
  u.uHeight = { value: height };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
  m.userData.m3dKind = 'body';
  m.customProgramCacheKey = function () { return 'm3d-body'; };
  return m;
}
function hullMat() {
  const u = { uColor: { value: new THREE.Color(0x0b0a09) }, uAlpha: { value: 1 } };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: HVERT, fragmentShader: HFRAG, side: THREE.BackSide });
  m.userData.m3dKind = 'hull';
  m.customProgramCacheKey = function () { return 'm3d-hull'; };
  return m;
}
/* 개체별 값(색조·예고 테·죽음 투명도)은 그릴 직전에 재질에 실어 보낸다 — 상태이상 색과
   정예 금테가 한 마리만 바뀌어야 하는데 재질은 종류별로 공유하지 않고 개체마다 갖는다. */
function hookMesh(mesh, H) {
  mesh.onBeforeRender = function () {
    const m = mesh.material;
    if (!m || !m.uniforms) return;
    const u = m.uniforms;
    if (u.uAlpha) u.uAlpha.value = m.opacity == null ? 1 : m.opacity;
    if (u.uTint) u.uTint.value.setRGB(H.tint[0], H.tint[1], H.tint[2]);
    if (u.uRimCol) {
      u.uRimCol.value.copy(H.rimCol);
      u.uRim.value = H.rimOp;
    }
    m.uniformsNeedUpdate = true;
  };
}

/* ---------------------------------------------------------------- 형상 도구 */
function bake(spec, variant) {
  const clips = CLIPS[spec.key] || (CLIPS[spec.key] = spec.clips(spec, 'm3_'));
  return { ...bakeBody(spec, variant), bones: spec.defs, spec, h: spec.h, clips };
}

/**
 * 한 마리를 세운다. 없으면 null(→ art.js 가 2D 폴백).
 * opt: { scale, variant(보스 0~3), shadow }
 */
export function build(species, opt) {
  opt = opt || {};
  const spec = SPECS[species];
  if (!spec) return null;
  const variant = species === 'boss' ? ((opt.variant | 0) + 4) % 4 : 0;
  const key = species + (species === 'boss' ? ':' + variant : '');
  let C = GEO[key];
  if (!C) {
    try { C = GEO[key] = bake(spec, variant); } catch (e) {
      if (window.console && console.warn) console.warn('[심안] 3D 몬스터 베이킹 실패 — 2D 폴백', species, e);
      return null;
    }
  }
  const group = new THREE.Group();
  const root = new THREE.Group();
  const sc = opt.scale || 1;
  root.scale.setScalar(sc);
  group.add(root);
  const bg = makeBones(C.bones, 'm3_');
  root.add(bg.root);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bg.list);

  const mat = bodyMat(C.h);
  const mesh = new THREE.SkinnedMesh(C.geo, mat);
  mesh.frustumCulled = false;
  mesh.castShadow = species === 'boss' && opt.shadow !== false;
  mesh.name = 'm3-body';
  root.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(skeleton);

  let hull = null;
  if (C.hull) {
    const hm = hullMat();
    hull = new THREE.SkinnedMesh(C.hull, hm);
    hull.frustumCulled = false;
    hull.name = 'm3-hull';
    root.add(hull);
    hull.updateMatrixWorld(true);
    hull.bind(skeleton);
  }

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  Object.keys(C.clips).forEach(function (k) {
    const a = mixer.clipAction(C.clips[k]);
    if (k !== 'idle' && k !== 'walk' && k !== 'charge') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    actions[k] = a;
  });
  actions.idle.play();
  actions.idle.setEffectiveWeight(1);

  const H = {
    species: species, variant: variant, root: root, bones: bg.bones, skeleton: skeleton,
    mixer: mixer, actions: actions, clips: C.clips, geo: C.geo, verts: C.verts,
    body: mesh, hull: hull, mats: [mat, hull ? hull.material : null].filter(Boolean),
    base: 'idle', burst: null, held: null, prevBurst: null, speed: 0, yaw: 0, yawTarget: 0,
    px: 0, pz: 0, first: true, t: Math.random() * 4, phase: Math.random() * 6.28,
    tint: [1, 1, 1], rimCol: new THREE.Color(1.0, 0.93, 0.80), rimOp: 0.18,
    cloth: {}, freeze: false, acc: 0, idleT: Math.random() * 3, opacity: 1, lights: null,
    slice: (LIVE % 3), h: C.h
  };
  /* 외곽선·테는 개체마다 따로 흐른다(정예 금테·예고 붉은 테가 한 마리만 바뀌어야 한다). */
  hookMesh(mesh, H);
  if (hull) hookMesh(hull, H);

  /* art.js 가 2D 리그에 붙이던 '테두리(rim) 슬롯'과 같은 모양의 가짜 객체.
     setTelegraph·applySkin 이 rim.material.color/opacity 만 만지므로 그대로 먹힌다. */
  const rim = {
    material: { color: new THREE.Color(0x5fb8a0), opacity: 0.20 },
    scale: new THREE.Vector3(1, 1, 1), center: new THREE.Vector2(0.5, 0.5), visible: true
  };
  H.rim = rim;
  H.rimCol.copy(rim.material.color);
  H.rimOp = rim.material.opacity;
  group.userData.m3d = H;
  group.userData.mrim = rim;
  group.userData.worldH = C.h * sc;
  group.userData.poseSource = 'mon3d';
  group.userData.sprite = mesh;          /* 기존 코드가 sprite.material 을 만질 때를 대비 */
  mesh.center = new THREE.Vector2(0.5, 0.5);

  const finished = function (e) {
    /* wind(예비)·kneel(무릎 꿇음)은 상태가 바뀔 때까지 끝 자세로 굳어 있어야 한다. */
    if (e.action === actions.wind) { H.burst = null; H.held = 'wind'; return; }
    if (actions.kneel && e.action === actions.kneel) { H.burst = null; H.held = 'kneel'; return; }
    if (!H.burst || e.action !== actions[H.burst]) return;
    backToBase(H, 0.16);
  };
  mixer.addEventListener('finished', finished);
  /* v0.50: 주인공·몬스터와 완벽히 통일된 3단 수묵 툰 셰이더+먹선 헐 보스(SPECS.boss)를 기본 사용.
     실험용 종이 래핑 보스(paintedboss.js)는 ?boss=painted 명시 시에만 활성화. */
  let usePaintedBoss = false;
  try { usePaintedBoss = new URLSearchParams(location.search).get('boss') === 'painted'; } catch (e) {}
  if (species === 'boss' && usePaintedBoss) {
    buildPaintedBoss().then(model => {
      const painted = model.body;
      painted.scale.setScalar(C.h / 1.976);
      root.add(painted);
      painted.traverse(part => {
        if (!part.isMesh) return;
        part.castShadow = mesh.castShadow;
        part.material.opacity = H.opacity;
        part.material.transparent = H.opacity < .999;
        H.mats.push(part.material);
        part.onBeforeRender = () => {
          part.material.color.setRGB(...H.tint);
          part.material.emissive.copy(H.rimCol).multiplyScalar(Math.max(0, H.rimOp - .20) * .28);
        };
      });
      mesh.visible = false;
      if (hull) hull.visible = false;
      H.painted = model;
      group.userData.poseSource = 'paintedBoss';
    }).catch(error => console.warn('[심안] paintedBoss 로드 실패 — 3D 수묵 보스 유지', error));
  }
  LIVE++;
  return group;
}

/* ---------------------------------------------------------------- 상태 → 동작 */
/* v0.50 보스 상태별 전용 포즈 매핑: 예비(wind) · 쇄도(charge) · 내리찍기(strike) · 무릎 꿇음(kneel) · 경직(hit) */
const BOSS_WIND = { telegraph: 1, wind: 1, volleyTele: 1, slamTele: 1, sweepTele: 1, mimicTele: 1, chant: 1, kiai: 1, clash: 1, shuffle: 1 };
const BOSS_CHARGE = { charge: 1, mimicCharge: 1 };
const BOSS_STRIKE = { strike: 1, slam: 1, sweep: 1 };
const BOSS_KNEEL = { groggy: 1, seal: 1, sealing: 1 };
const BOSS_HIT = { stun: 1 };

function planFor(H, st) {
  if (H.species === 'boss') {
    const bs = st.indexOf('boss:') === 0 ? st.slice(5) : st;
    if (BOSS_KNEEL[bs]) return { base: 'idle', burst: H.actions.kneel ? 'kneel' : 'hit' };
    if (BOSS_CHARGE[bs]) return { base: 'idle', burst: H.actions.charge ? 'charge' : 'strike' };
    if (BOSS_STRIKE[bs]) return { base: 'idle', burst: 'strike' };
    if (BOSS_HIT[bs]) return { base: 'idle', burst: 'hit' };
    if (BOSS_WIND[bs]) return { base: 'idle', burst: 'wind' };
    return { base: null, burst: null };
  }
  if (st === 'hit') return { base: null, burst: 'hit' };
  if (st === 'attack') return { base: null, burst: 'attack' };
  if (st === 'frozen') return { base: 'idle', burst: null };
  return { base: null, burst: null };
}

function crossFade(H, fromName, toName, dur) {
  const from = H.actions[fromName], to = H.actions[toName];
  if (!from || !to || from === to) return;
  to.enabled = true;
  to.setEffectiveWeight(1);
  to.setEffectiveTimeScale(1);
  to.play();
  from.crossFadeTo(to, dur, false);
}
function backToBase(H, dur) {
  const from = H.actions[H.burst || H.held || H.base];
  H.burst = null;
  H.held = null;
  const back = H.actions[H.base] || H.actions.idle;
  if (!back) return;
  back.enabled = true;
  back.setEffectiveTimeScale(1);
  back.setEffectiveWeight(1);
  back.play();
  if (from && from !== back) { from.paused = false; from.crossFadeTo(back, dur, false); }
}
function startBurst(H, name, fadeIn) {
  const a = H.actions[name];
  if (!a || H.burst === name) return;
  const from = H.actions[H.burst || H.base];
  a.reset();
  a.setEffectiveTimeScale(1);
  a.setEffectiveWeight(1);
  a.enabled = true;
  a.play();
  if (from && from !== a) from.crossFadeTo(a, fadeIn, false);
  H.burst = name;
}

/* ---------------------------------------------------------------- 매 프레임 */
const _v1 = new THREE.Vector3();
/* 무대 광원은 모든 개체가 공유한다 — 한 마리마다 scene 전체를 훑으면 30마리 소환 때 한 프레임이
   멈춘다. 장면 광원은 2초에 한 번만 다시 찾는다(장이 바뀌면 광원 개체가 새로 서므로). */
let LIGHTS = null, LIGHT_MS = -1e9;
function sceneLights(H) {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (LIGHTS && (now - LIGHT_MS) < 2000) return LIGHTS;
  let scene = H.root;
  while (scene && !scene.isScene) scene = scene.parent;
  if (!scene) return LIGHTS;
  const L = { dirs: [], amb: null };
  scene.traverse(function (o) {
    if (o.isDirectionalLight) L.dirs.push(o);
    else if (o.isAmbientLight && !L.amb) L.amb = o;
  });
  LIGHTS = L;
  LIGHT_MS = now;
  return L;
}
function syncLightUniforms(H) {
  if (H.lights && H.lightsStamp === LIGHT_MS) return;
  const L = sceneLights(H);
  if (!L) return;
  H.lights = L;
  H.lightsStamp = LIGHT_MS;
  /* 주인공과 같은 규칙(주광 방향·색조 50%)을 이 개체의 재질 uniform 에 한 번만 옮긴다. */
  const U = H.mats.map(function (m) { return m.uniforms; }).filter(function (u) { return u && u.uKeyDir; });
  if (!U.length) return;
  const moon = L.dirs[0], fill = L.dirs[1];
  let kx = -0.45, ky = 0.78, kz = 0.44, fx = 0.55, fy = 0.42, fz = -0.72;
  if (moon) {
    _v1.copy(moon.position);
    if (moon.target) _v1.sub(moon.target.position);
    if (_v1.lengthSq() > 1e-6) { _v1.normalize(); kx = _v1.x; ky = _v1.y; kz = _v1.z; }
  }
  if (fill) {
    _v1.copy(fill.position);
    if (fill.target) _v1.sub(fill.target.position);
    if (_v1.lengthSq() > 1e-6) { _v1.normalize(); fx = _v1.x; fy = _v1.y; fz = _v1.z; }
  }
  let kr = 0.92, kg = 0.90, kb = 0.86, fr = 0.62, fg = 0.70, fb = 0.82;
  if (moon) {
    const c = moon.color, m = Math.max(1e-4, c.r, c.g, c.b);
    kr = 0.5 + 0.5 * c.r / m; kg = 0.5 + 0.5 * c.g / m; kb = 0.5 + 0.5 * c.b / m;
  }
  if (fill) {
    const c = fill.color, m = Math.max(1e-4, c.r, c.g, c.b);
    fr = c.r / m; fg = c.g / m; fb = c.b / m;
  }
  const LT = B.LIGHT;
  for (let i = 0; i < U.length; i++) {
    const u = U[i];
    u.uKeyDir.value.set(kx, ky, kz).normalize();
    u.uFillDir.value.set(fx, fy, fz).normalize();
    u.uKeyCol.value.setRGB(kr * LT.key, kg * LT.key, kb * LT.key);
    u.uFillCol.value.setRGB(fr * LT.fill, fg * LT.fill, fb * LT.fill);
    u.uAmbCol.value.setRGB(1.00 * LT.amb, 0.955 * LT.amb, 0.88 * LT.amb);
    u.uWash.value = LT.wash;
    u.uRim.value = H.rimOp;
  }
}

/** 한 프레임. state 문자열은 게임이 이미 넘긴다(위 주석 참조). */
export function tick(group, kind, state, dt, vx, vz) {
  const H = group && group.userData && group.userData.m3d;
  if (!H) return false;
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.12) dt = 0.12;
  FRAME++;
  const st = String(state || 'walk');

  /* 이동 속도는 놓인 위치의 차분에서 잰다(게임은 방향만 준다). */
  const gx = group.position.x, gz = group.position.z;
  if (H.first) { H.px = gx; H.pz = gz; H.first = false; }
  const dx = gx - H.px, dz = gz - H.pz;
  H.px = gx; H.pz = gz;
  const raw = Math.sqrt(dx * dx + dz * dz) / dt;
  const sp = Math.min(raw, 24);
  H.speed += (sp - H.speed) * (-Math.expm1(-dt * 10));

  /* 8방향 — 몸이 이동·조준 방향으로 돌아간다(좌우 반전 없음). */
  let dirX = 0, dirZ = 0;
  if (vx != null && vz != null && (Math.abs(vx) + Math.abs(vz)) > 1e-4) { dirX = vx; dirZ = vz; }
  else if (sp > 0.3) { dirX = dx; dirZ = dz; }
  if (Math.abs(dirX) + Math.abs(dirZ) > 1e-5) H.yawTarget = Math.atan2(dirX, dirZ);
  let d = H.yawTarget - H.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  H.yaw += d * (1 - Math.exp(-(H.burst === 'strike' ? 18 : 8) * dt));
  group.rotation.y = H.yaw;

  syncLightUniforms(H);
  /* 예고·노출 테는 fake rim 에서 셰이더 uniform 으로 매 프레임 옮긴다. */
  H.rimCol.copy(H.rim.material.color);
  H.rimOp = H.rim.material.opacity;

  if (H.freeze) return true;

  const plan = planFor(H, st);
  /* v0.47 + v0.51 — 보스 상태 문자열('boss:walk')도 걷기 상태로 인식해 다리가 멈추지 않도록 보장. */
  const walkingState = (st === 'walk' || st === 'boss:walk' || st === 'burning' || st === 'poisoned' || st === 'chase');
  const wantBase = plan.base || ((walkingState || H.speed > 0.35) ? 'walk' : 'idle');
  if (!H.burst && !H.held && wantBase !== H.base && H.actions[wantBase]) {
    crossFade(H, H.base, wantBase, 0.18);
    H.base = wantBase;
  }
  /* 같은 상태가 여러 프레임 이어져도 일회 동작은 한 번만 — 상태가 새로 들어올 때만 시작한다.
     루프형 burst(charge)는 상태가 끝나면 부드럽게 기본 자세로 복귀시킨다. */
  if (plan.burst) {
    if (plan.burst !== H.prevBurst && H.held !== plan.burst) startBurst(H, plan.burst, plan.burst === 'hit' ? 0.05 : 0.09);
  } else if (H.held || H.burst === 'charge') {
    backToBase(H, 0.22);
  }
  H.prevBurst = plan.burst;

  /* 원거리·화면 밖은 2~3프레임에 한 번만 적분한다(CPU 절감).
     v0.47 — 기준 거리를 14m→40m 로 늘였다. 카메라 오프셋이 (14.4, 22.4, 14.4) 라 **카메라의 xz**
     는 이미 주인공에서 20m 떨어져 있다. 14m 기준이면 화면 안 몬스터까지 전부 '원거리'가 되어
     걷기가 3프레임(20fps)에 한 번만 갱신됐다 — 다리가 가만히 있는 것처럼 보인 주범. */
  const far = (function () {
    if (!CAM) return false;
    const cp = CAM.position;
    const ddx = cp.x - gx, ddz = cp.z - gz;
    return (ddx * ddx + ddz * ddz) > 1600;     /* 카메라 xz 기준 40m 밖 */
  })();
  H.acc += dt;
  let step = false;
  if (!far) step = true;
  else if ((FRAME + H.slice) % 3 === 0) step = true;
  if (step) {
    const use = H.acc;
    H.acc = 0;
    H.mixer.update(use);
    applyCloth(H, use);
  }
  if (H.actions.walk) {
    const ts = H.species === 'boss'
      ? Math.max(1.05, Math.min(1.95, 0.95 + H.speed * 0.32))
      : Math.max(0.55, Math.min(1.9, 0.75 + H.speed * 0.35));
    H.actions.walk.setEffectiveTimeScale(ts);
  }

  /* v0.48/v0.50 무게감 — 일반 몬스터는 보행 흔들림을, 보스는 전투 동작 중 어색한 흔들림을 차단하고
     보행 시에만 묵직하고 위엄 있는 보폭과 호흡을 얹는다. */
  const bossCombatPose = H.species === 'boss' && (H.burst || H.held);
  if (!bossCombatPose) {
    const bossWalkScale = H.species === 'boss' ? 0.42 : 1.0;
    H.walkT = (H.walkT || 0) + dt * (H.base === 'walk' ? (0.85 + H.speed * 0.4) * bossWalkScale : 0.35);
    const wAmp = (H.base === 'walk' ? Math.min(1.15, 0.4 + H.speed * 0.5) : 0.15) * (H.species === 'boss' ? 0.45 : 1.0);
    const ph = H.walkT * 2.5;
    const sway = Math.sin(ph) * 0.06 * wAmp;
    const bob = Math.cos(ph * 2) * 0.032 * wAmp;
    if (H.bones.pelvis) H.bones.pelvis.rotateZ(sway * 0.9);
    if (H.bones.spine) H.bones.spine.rotateZ(sway * 0.4);
    if (H.bones.chest) { H.bones.chest.rotateZ(-sway * 0.85); H.bones.chest.rotateX(bob); }
    if (H.bones.head) { H.bones.head.rotateZ(sway * 0.55); H.bones.head.rotateX(-bob * 0.6); }
    if (H.species !== 'boss') {
      if (H.bones.upperarmL) H.bones.upperarmL.rotateX(sway * 1.25);
      if (H.bones.upperarmR) H.bones.upperarmR.rotateX(-sway * 1.25);
    }
  }
  /* 공격 완급: 예비(젖힘) → 타격(몸이 실림) — 클립의 키 위에 작게 겹쳐 맛을 낸다. */
  if (H.burst === 'attack') {
    const a = H.actions.attack;
    const u = a ? Math.min(1, a.time / (a.getClip().duration || 0.55)) : 0;
    const wind = u < 0.22 ? (u / 0.22) : Math.max(0, 1 - (u - 0.22) / 0.18);
    const hit = u >= 0.22 && u < 0.42 ? 1 - (u - 0.22) / 0.20 : 0;
    if (H.bones.chest) H.bones.chest.rotateX(-wind * 0.10 + hit * 0.13);
    if (H.bones.spine) H.bones.spine.rotateX(-wind * 0.06 + hit * 0.08);
  }
  if(H.painted){
    const action=H.actions[H.burst || H.held];
    const combat=action ? {bones:H.bones,base:SPECS.boss.base,weight:action.getEffectiveWeight()} : null;
    const walking=H.speed>.12 && !combat;
    H.painted.update(dt,walking,Math.max(.6,Math.min(2,H.speed/(1.25*H.root.scale.x))),combat);
  }
  H.t += dt;
  return true;
}


/* 망토·자락·부적끈: 2차 지연 스프링(프레임률 무관). */
function applyCloth(H, dt) {
  const spec = SPECS[H.species];
  clothStep(H, spec.cloth, dt, 0, H.speed);
  if (spec.upright && spec.upright.clips.includes(H.burst || H.base)) {
    uprightBone(H.bones[spec.upright.bone], H.root, 1);
  }
}

/* ---------------------------------------------------------------- 외부 훅 */
export function kick(group, k) {
  const H = group && group.userData && group.userData.m3d;
  if (!H) return;
  startBurst(H, 'hit', 0.05);
}
export function slashPose(group, k) {
  const H = group && group.userData && group.userData.m3d;
  if (!H) return;
  if (H.species === 'boss') startBurst(H, 'strike', 0.08);
  else startBurst(H, 'attack', 0.08);
}
export function setOpacity(group, o) {
  const H = group && group.userData && group.userData.m3d;
  if (!H) return;
  H.opacity = o;
  for (let i = 0; i < H.mats.length; i++) {
    const m = H.mats[i];
    if (m.transparent !== (o < 0.999)) { m.transparent = o < 0.999; m.needsUpdate = true; }
    m.opacity = o;
  }
}
export function setTint(group, r, g, b) {
  const H = group && group.userData && group.userData.m3d;
  if (!H) return;
  H.tint[0] = r; H.tint[1] = g; H.tint[2] = b;
}
export function setAuraColor(group, hex, op) {
  const H = group && group.userData && group.userData.m3d;
  if (!H) return;
  if (hex != null) H.rim.material.color.setHex(hex);
  if (op != null) H.rim.material.opacity = op;
}
export function setOrder(group, base) { return true; }
export function ready() { return true; }
/* QA — 텍스처 아틀라스가 실제로 붙었는지(칸·세기·PNG) 확인한다. */
export function texInfo() { return TEX.info(); }
export function texAtlas() { return TEX.dataUrl(); }

/* ---------------------------------------------------------------- QA */
export function info(group) {
  const H = group && group.userData && group.userData.m3d;
  if (!H) return null;
  const w = {};
  Object.keys(H.actions).forEach(function (k) {
    const a = H.actions[k];
    w[k] = { w: +a.getEffectiveWeight().toFixed(3), t: +a.time.toFixed(3), run: a.isRunning(), on: a.enabled };
  });
  return {
    species: H.species, variant: H.variant, bones: H.skeleton.bones.length,
    meshes: H.hull ? 2 : 1, verts: H.verts, clips: Object.keys(H.clips),
    base: H.base, burst: H.burst, yawDeg: +(H.yaw * 180 / Math.PI).toFixed(1),
    speed: +H.speed.toFixed(2), tint: H.tint.map(function (v) { return +v.toFixed(2); }),
    rim: { hex: '#' + H.rim.material.color.getHexString(), op: +H.rimOp.toFixed(2) },
    actions: w, h: H.h
  };
}
/** QA: 자세를 시각에 고정한다(스크린샷 비교용). */
export function pin(group, o) {
  const H = group && group.userData && group.userData.m3d;
  if (!H) return null;
  o = o || {};
  H.freeze = !!o.freeze;
  if (o.yaw != null) { H.yaw = o.yaw * Math.PI / 180; H.yawTarget = H.yaw; group.rotation.y = H.yaw; }
  if (o.clip) {
    Object.keys(H.actions).forEach(function (k) { const a = H.actions[k]; a.stop(); a.setEffectiveWeight(0); a.enabled = false; });
    const a = H.actions[o.clip];
    if (!a) return null;
    a.enabled = true; a.setEffectiveWeight(1); a.play(); a.paused = true; a.time = o.t || 0;
    H.burst = (o.clip === 'idle' || o.clip === 'walk') ? null : o.clip;
    H.base = (o.clip === 'walk') ? 'walk' : 'idle';
    H.mixer.update(0); H.mixer.update(0.0001);
  }
  return info(group);
}
