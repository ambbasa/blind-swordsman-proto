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
import * as TEX from './inktex3d.js';

const B = INK3D;
const P = B.P, lathe = B.lathe, limbGeo = B.limbGeo, ballGeo = B.ballGeo, ringGeo = B.ringGeo, ribbonGeo = B.ribbonGeo;

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
function rockGeo(r, seed, sx, sy, sz) {
  const g = new THREE.SphereGeometry(r, 7, 5);
  const pos = g.getAttribute('position');
  let s = ((seed || 1) * 2654435761) >>> 0;
  const rnd = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < pos.count; i++) {
    const k = 0.76 + rnd() * 0.46;
    pos.setXYZ(i, pos.getX(i) * k * (sx || 1), pos.getY(i) * k * (sy || 1), pos.getZ(i) * k * (sz || 1));
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}
function boxGeo(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
/** 관절 구 — 몬스터는 40마리가 동시에 뜨므로 구 해상도를 낮춰 정점을 아낀다(먹 그림에선 티가 안 난다). */
function ball(r, sx, sy, sz) {
  const g = new THREE.SphereGeometry(r, 9, 6);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(sx || 1, sy || 1, sz || 1));
  g.applyMatrix4(m);
  return g;
}
function coneGeo(r, h, seg) { return new THREE.ConeGeometry(r, h, seg || 6); }
function NH(p) { p.nh = 1; return p; }     /* 먹선(헐)을 두지 않는 작은 장식 — 드로우콜·정점 절약 */

/* ---------------------------------------------------------------- 스키닝 병합
   파츠마다 뼈 하나에 100% 바인딩한다(종이 인형의 관절이 그대로 3D 뼈대가 된 셈 — 면이 접히지
   않고 단단한 먹 덩어리로 돈다). 관절은 부모 뼈에 붙은 구가 메운다. */
function prepGeo(g, m) {
  let geo = g.clone();
  if (m) geo.applyMatrix4(m);
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  return geo;
}
function mergeSkinned(parts, boneIdx, wantHull, rest) {
  const bufs = [];
  let total = 0, idxTotal = 0;
  const T = new THREE.Matrix4();
  parts.forEach(function (p) {
    if (wantHull && p.nh) return;
    /* 파츠는 뼈 로컬 좌표로 그렸다. SkinnedMesh 의 정점은 **모델 공간**이어야 하므로,
       바인드 자세의 뼈 위치(rest)를 먼저 곱해 모델 공간으로 옮긴다. 이래야 AnimationMixer 가
       뼈를 돌릴 때 그 뼈에 붙은 파츠가 관절을 축으로 함께 돈다. */
    const r = rest[p.b] || [0, 0, 0];
    T.makeTranslation(r[0], r[1], r[2]);
    const mm = p.m ? T.clone().multiply(p.m) : T.clone();
    const mode = TEX.uvModeFor(p.geo);
    const geo = prepGeo(p.geo, mm);
    const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal');
    if (!pos || !nrm) return;
    const bi = boneIdx[p.b] == null ? 0 : boneIdx[p.b];
    const index = geo.getIndex();
    bufs.push({ pos: pos, nrm: nrm, col: new THREE.Color(p.color), uv: TEX.makeUV(geo, mode),
      zone: p.z || 0, bi: bi, index: index ? index.array : null, off: total, n: pos.count });
    total += pos.count;
    idxTotal += index ? index.count : pos.count;
  });
  const P3 = new Float32Array(total * 3), N3 = new Float32Array(total * 3), C3 = new Float32Array(total * 3);
  const U2 = new Float32Array(total * 2), Z1 = new Float32Array(total);
  const S4 = new Uint16Array(total * 4), W4 = new Float32Array(total * 4);
  const IDX = idxTotal > 65000 ? new Uint32Array(idxTotal) : new Uint16Array(idxTotal);
  let o = 0, k3 = 0;
  for (let i = 0; i < bufs.length; i++) {
    const b = bufs[i], n = b.n;
    const pa = b.pos.array, na = b.nrm.array, c = b.col, ua = b.uv;
    for (let k = 0; k < n; k++) {
      const v = o + k, p3 = v * 3;
      P3[p3] = pa[k * 3]; P3[p3 + 1] = pa[k * 3 + 1]; P3[p3 + 2] = pa[k * 3 + 2];
      N3[p3] = na[k * 3]; N3[p3 + 1] = na[k * 3 + 1]; N3[p3 + 2] = na[k * 3 + 2];
      C3[p3] = c.r; C3[p3 + 1] = c.g; C3[p3 + 2] = c.b;
      if (ua) { U2[v * 2] = ua[k * 2]; U2[v * 2 + 1] = ua[k * 2 + 1]; }
      Z1[v] = b.zone;
      S4[v * 4] = b.bi; W4[v * 4] = 1;
    }
    if (b.index) {
      for (let k = 0; k < b.index.length; k++) IDX[k3++] = b.index[k] + b.off;
    } else {
      for (let k = 0; k < n; k++) IDX[k3++] = b.off + k;
    }
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P3, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N3, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C3, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
  geo.setAttribute('zone', new THREE.BufferAttribute(Z1, 1));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(S4, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(W4, 4));
  geo.setIndex(new THREE.BufferAttribute(IDX, 1));
  geo.computeBoundingSphere();
  return geo;
}
function hullFrom(geo, t) {
  const g = geo.clone();
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
  const p = pos.array, n = nrm.array;
  for (let i = 0; i < p.length; i += 3) {
    p[i] += n[i] * t; p[i + 1] += n[i + 1] * t; p[i + 2] += n[i + 2] * t;
  }
  pos.needsUpdate = true;
  g.deleteAttribute('color');
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------- 뼈대·클립 */
function makeBones(defs) {
  const bones = {}, list = [];
  defs.forEach(function (d) {
    const b = new THREE.Bone();
    b.name = 'm3_' + d[0];
    b.position.set(d[2][0], d[2][1], d[2][2]);
    bones[d[0]] = b;
    list.push(b);
    if (d[1]) bones[d[1]].add(b);
  });
  return { bones: bones, list: list, root: list[0] };
}
const _e = new THREE.Euler(), _q = new THREE.Quaternion();
/* keys 의 자세는 **반드시 k.p 안에** 둔다. k 최상위에 두면 조용히 무시되어 '뼈가 안 도는'
   클립이 된다 — v0.46 의 걷기 클립이 정확히 그랬고(다리가 가만히), v0.47 에서 frames() 가
   돌려주는 자세를 p 로 감싸 고쳤다. */
function mkClip(spec, name, dur, keys) {
  const names = spec.animBones;
  const times = keys.map(function (k) { return k.t; });
  const tracks = [];
  names.forEach(function (bn) {
    const vals = [];
    keys.forEach(function (k) {
      const e = (k.p && k.p[bn]) || spec.base[bn] || [0, 0, 0];
      _q.setFromEuler(_e.set(e[0], e[1], e[2], 'XYZ'));
      vals.push(_q.x, _q.y, _q.z, _q.w);
    });
    tracks.push(new THREE.QuaternionKeyframeTrack('m3_' + bn + '.quaternion', times, vals));
  });
  const pos = [];
  keys.forEach(function (k) {
    pos.push(k.px || 0, spec.pelvisY + (k.py || 0), k.pz || 0);
  });
  tracks.push(new THREE.VectorKeyframeTrack('m3_pelvis.position', times, pos));
  return new THREE.AnimationClip(name, dur, tracks);
}
function frames(n, dur, fn) {
  const K = [];
  for (let i = 0; i <= n; i++) {
    const k = fn(i / n, (i / n) * Math.PI * 2);
    if (!k) continue;
    k.t = (i / n) * dur;
    K.push(k);
  }
  return K;
}

/* ================================================================ 원귀 → 조선 좌비
   낡은 관복·삼베옷이 흘러내리고 이마·가슴에 붉은 부적, 창백한 먹빛 얼굴에 두 팔을 앞으로 뻗은
   구부정한 실루엣. 걷기는 한쪽 다리를 끄는 절뚝거림(위상 비대칭)이다. */
const MINION = {
  key: 'minion', h: 2.4, pelvisY: 1.04,
  /* v0.47 — 붉은 부적은 주사 한자(칸 3), 창백한 살·삼베는 한지(칸 1), 나머지는 해진 관복 천. */
  zoneOf: function (c) {
    if (c === 0x7c2621 || c === 0xc44a2e) return TEX.Z.TALIS;
    if (c === 0x8b8578) return TEX.Z.PAPER;
    return TEX.Z.CLOTH;
  },
  defs: [
    ['pelvis', null, [0, 1.04, 0]],
    ['spine', 'pelvis', [0, 0.16, 0]],
    ['chest', 'spine', [0, 0.26, 0]],
    ['neck', 'chest', [0, 0.20, 0]],
    ['head', 'neck', [0, 0.10, 0]],
    ['shoulderL', 'chest', [0.148, 0.15, 0]],
    ['upperarmL', 'shoulderL', [0.055, -0.01, 0]],
    ['forearmL', 'upperarmL', [0, -0.30, 0]],
    ['handL', 'forearmL', [0, -0.27, 0]],
    ['shoulderR', 'chest', [-0.148, 0.15, 0]],
    ['upperarmR', 'shoulderR', [-0.055, -0.01, 0]],
    ['forearmR', 'upperarmR', [0, -0.30, 0]],
    ['handR', 'forearmR', [0, -0.27, 0]],
    ['thighL', 'pelvis', [0.105, -0.04, 0]],
    ['shinL', 'thighL', [0, -0.50, 0]],
    ['footL', 'shinL', [0, -0.46, 0]],
    ['thighR', 'pelvis', [-0.105, -0.04, 0]],
    ['shinR', 'thighR', [0, -0.50, 0]],
    ['footR', 'shinR', [0, -0.46, 0]],
    ['robeF', 'pelvis', [0, -0.03, 0.082]],
    ['robeB', 'pelvis', [0, -0.03, -0.084]],
    ['robeL', 'pelvis', [0.132, -0.02, 0]],
    ['robeR', 'pelvis', [-0.132, -0.02, 0]]
  ],
  cloth: { robeF: [0.28, 0.0], robeB: [0.24, 0.7], robeL: [0.16, 1.2], robeR: [0.16, 1.9] },
  base: {
    pelvis: [0, 0, 0], spine: [0.10, 0, 0], chest: [0.17, 0, 0], neck: [0.12, 0, 0], head: [-0.08, 0, 0],
    shoulderL: [0, 0, 0.05], shoulderR: [0, 0, -0.05],
    upperarmL: [-1.34, 0, 0.10], upperarmR: [-1.28, 0, -0.12],
    forearmL: [-0.20, 0, 0.04], forearmR: [-0.24, 0, -0.04],
    handL: [0, 0, 0], handR: [0, 0, 0],
    thighL: [0.02, 0, 0.02], thighR: [0.02, 0, -0.02],
    shinL: [0.11, 0, 0], shinR: [0.11, 0, 0],
    footL: [-0.05, 0, 0], footR: [-0.05, 0, 0]
  },
  parts: function () {
    /* v0.47 — 관복을 한 단계 밝힌다(0x3c3b40→0x47464b). 완전 검정에 가까우면 한지 마모·먹획 텍스처가
       화면에서 죽는다(실측: 종전 값에서는 결이 보이지 않았다). */
    const ROBE = 0x47464b, ROBE2 = 0x3d3c41, SKIN = 0x8b8578, HAIR = 0x232227;
    const TAL = 0x7c2621, TAL2 = 0xc44a2e, BELT = 0x4c443a;
    const out = {};
    const add = function (b, p) { (out[b] || (out[b] = [])).push(p); };

    /* 몸통 — 흘러내린 관복. 허리에서 아래로 갈수록 폭이 넓다. */
    add('pelvis', P(lathe([[0, -0.15], [0.086, -0.135], [0.118, -0.09], [0.130, -0.02], [0.128, 0.06], [0.110, 0.108], [0, 0.128]], 12, 1.0, 0.84), ROBE));
    add('pelvis', NH(P(ringGeo(0.134, 0.016, 12), BELT, { pos: [0, 0.048, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.86] })));
    add('spine', P(lathe([[0, -0.19], [0.096, -0.176], [0.118, -0.10], [0.124, 0.0], [0.132, 0.10], [0.138, 0.17], [0, 0.19]], 12, 1.0, 0.82), ROBE));
    add('chest', P(lathe([[0, -0.21], [0.100, -0.196], [0.132, -0.12], [0.148, -0.02], [0.150, 0.07], [0.132, 0.14], [0.088, 0.184], [0, 0.20]], 14, 1.06, 0.82), ROBE));
    add('chest', NH(P(boxGeo(0.015, 0.23, 0.010), 0x8d877a, { pos: [0.036, 0.04, 0.116], rot: [0.05, 0, 0.26] })));
    /* 가슴 부적 — 붉은 먹 한 장. 좀비가 사람이었다는 유일한 표식. */
    add('chest', NH(P(boxGeo(0.104, 0.148, 0.011), TAL, { pos: [0, 0.045, 0.126], rot: [0.04, -0.06, 0.05] })));
    add('chest', NH(P(boxGeo(0.050, 0.098, 0.008), TAL2, { pos: [0, 0.045, 0.133], rot: [0.04, -0.06, 0.05] })));
    /* 어깨 솔기 */
    add('chest', NH(P(ringGeo(0.062, 0.012, 12), ROBE2, { pos: [0, 0.178, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.85] })));

    /* 목·머리 — 창백한 먹빛 해골 얼굴, 꺼진 눈, 이마 부적, 쪽진 머리 */
    add('neck', P(lathe([[0, -0.05], [0.046, -0.03], [0.050, 0.03], [0.046, 0.08], [0, 0.10]], 10, 1.0, 0.94), SKIN));
    add('head', P(lathe([[0, -0.05], [0.030, -0.032], [0.052, 0.0], [0.070, 0.05], [0.084, 0.10], [0.090, 0.15], [0.084, 0.20], [0.058, 0.234], [0, 0.25]], 12, 1.0, 0.96), SKIN));
    add('head', NH(P(ball(0.026, 1.0, 0.68, 0.5), 0x1d1c1a, { pos: [0.032, 0.138, 0.078] })));
    add('head', NH(P(ball(0.026, 1.0, 0.68, 0.5), 0x1d1c1a, { pos: [-0.032, 0.138, 0.078] })));
    add('head', NH(P(boxGeo(0.048, 0.011, 0.010), 0x27251f, { pos: [0, 0.055, 0.084] })));
    add('head', NH(P(boxGeo(0.072, 0.095, 0.011), TAL, { pos: [0, 0.186, 0.070], rot: [0.16, 0, 0] })));
    add('head', NH(P(ball(0.020, 1, 1, 1), TAL2, { pos: [0, 0.192, 0.079], scale: [1, 1, 0.5] })));
    add('head', P(lathe([[0.074, 0.180], [0.086, 0.212], [0.078, 0.244], [0.048, 0.264], [0, 0.272]], 12, 1.0, 0.95), HAIR));
    add('head', NH(P(new THREE.CylinderGeometry(0.050, 0.054, 0.028, 10), 0x1c1b1e, { pos: [0, 0.264, 0] })));
    add('head', NH(P(ball(0.024, 1, 0.9, 1), 0x1c1b1e, { pos: [0, 0.288, -0.012] })));

    /* 팔 — 소매는 어깨에서, 아래팔은 걷어 올린 창백한 살. 손가락 세 가닥을 앞으로 뻗는다. */
    ['L', 'R'].forEach(function (s) {
      add('upperarm' + s, P(ball(0.056, 1, 0.92, 0.92), ROBE));
      add('upperarm' + s, P(limbGeo(0.066, 0.050, 0.285, 10), ROBE));
      add('upperarm' + s, NH(P(ringGeo(0.052, 0.008, 10), ROBE2, { pos: [0, -0.278, 0], rot: [Math.PI / 2, 0, 0] })));
      add('forearm' + s, P(ball(0.043, 1, 0.94, 0.94), SKIN));
      add('forearm' + s, P(limbGeo(0.046, 0.034, 0.25, 10), SKIN));
      add('forearm' + s, P(ball(0.038, 1.0, 1.10, 0.90), SKIN, { pos: [0, -0.278, 0.006] }));
      [-0.019, 0, 0.019].forEach(function (dx, j) {
        add('forearm' + s, NH(P(coneGeo(0.009, 0.072, 5), SKIN, { pos: [dx, -0.318 + j * 0.004, 0.030], rot: [1.28, 0, 0] })));
      });
    });

    /* 다리 — 헐렁한 바지, 드러난 정강이, 짚신 대신 맨발 */
    ['L', 'R'].forEach(function (s) {
      add('thigh' + s, P(ball(0.076, 1, 0.95, 1), 0x46424a));
      add('thigh' + s, P(limbGeo(0.084, 0.060, 0.49, 10), 0x46424a));
      add('shin' + s, P(ball(0.052, 1, 0.97, 1), SKIN, { pos: [0, -0.004, 0] }));
      add('shin' + s, P(limbGeo(0.058, 0.040, 0.42, 10), SKIN));
      add('foot' + s, P(ball(0.050, 1.0, 0.60, 1.9), 0x232226, { pos: [0, -0.026, 0.036] }));
    });

    /* 자락 — 앞뒤는 길게, 옆은 짧게. 바람에 늘어진다. */
    add('robeF', P(ribbonGeo(0.235, 0.265, 0.40, 3, 0.014, 0.012), ROBE2, { pos: [0, 0, 0.074] }));
    add('robeB', P(ribbonGeo(0.250, 0.280, 0.42, 3, -0.014, 0.012), ROBE2, { pos: [0, 0, -0.076] }));
    add('robeL', P(ribbonGeo(0.115, 0.150, 0.38, 3, 0.008, 0.010), ROBE, { pos: [0, 0, 0], rot: [0, Math.PI / 2, 0.05] }));
    add('robeR', P(ribbonGeo(0.115, 0.150, 0.38, 3, -0.008, 0.010), ROBE, { pos: [0, 0, 0], rot: [0, Math.PI / 2, -0.05] }));
    return out;
  },
  clips: function (spec) {
    /* idle — 주저앉을 듯 흔들리는 호흡. 팔은 앞으로 늘어지고 머리가 느리게 까딱인다. */
    const idle = [
      { t: 0.00, p: { chest: [0.17, 0.02, 0], head: [-0.08, 0.06, 0.03], upperarmL: [-1.34, 0, 0.10], upperarmR: [-1.28, 0, -0.12] }, py: 0 },
      { t: 1.30, p: { spine: [0.13, 0, 0.02], chest: [0.21, -0.02, 0.02], head: [-0.05, -0.05, -0.04], upperarmL: [-1.28, 0, 0.13], upperarmR: [-1.33, 0, -0.10] }, py: -0.016 },
      { t: 2.60, p: { chest: [0.15, 0.03, -0.02], head: [-0.12, 0.08, 0.05], upperarmL: [-1.38, 0, 0.08], upperarmR: [-1.24, 0, -0.15] }, py: 0.008 },
      { t: 3.90, p: {}, py: 0 }
    ];
    /* walk — 12키. 한쪽 다리를 끌고, 골반이 좌우로 넘어가며, 팔은 앞으로 뻗은 채 조금씩 흔들린다. */
    const walk = frames(12, 1.12, function (u, p) {
      const c = Math.cos(p), s = Math.sin(p);
      const drag = Math.max(0, Math.sin(p - 1.9));
      return {
        p: {
        pelvis: [0.03, 0.09 * s, 0.10 * Math.sin(p * 0.5)],
        spine: [0.11, -0.05 * s, -0.05 * Math.sin(p * 0.5)],
        chest: [0.18 + 0.03 * c, -0.08 * s, -0.04 * Math.sin(p * 0.5)],
        neck: [0.12, 0.03 * s, 0], head: [-0.08 + 0.05 * s, 0.05 * s, 0.05 * Math.sin(p * 0.5 + 0.6)],
        upperarmL: [-1.34 + 0.10 * c, 0, 0.10], upperarmR: [-1.28 - 0.08 * c, 0, -0.12],
        forearmL: [-0.20 - 0.10 * Math.max(0, c), 0, 0.04], forearmR: [-0.24 + 0.08 * Math.max(0, -c), 0, -0.04],
        thighL: [0.02 + 0.66 * c, 0, 0.02], thighR: [0.02 - 0.60 * c, 0, -0.02],
        shinL: [0.11 + 0.66 * drag, 0, 0], shinR: [0.11 + 0.46 * Math.max(0, -Math.sin(p - 1.9)), 0, 0],
        footL: [-0.05 - 0.34 * drag, 0, 0], footR: [-0.05 + 0.14 * Math.max(0, c), 0, 0]
      }, py: -0.03 + 0.030 * Math.abs(s) - 0.012 * drag };
    });
    /* attack — 두 팔을 앞으로 내지르며 상체가 따라간다(할퀴기). */
    const attack = [
      { t: 0.00, p: {} },
      { t: 0.10, p: { chest: [-0.06, 0, 0], upperarmL: [-0.92, 0, 0.20], upperarmR: [-0.88, 0, -0.22], forearmL: [-0.55, 0, 0.04], forearmR: [-0.58, 0, -0.04] } },
      { t: 0.22, p: { chest: [0.30, 0, 0], spine: [0.18, 0, 0], upperarmL: [-1.62, 0, 0.04], upperarmR: [-1.60, 0, -0.06], forearmL: [-0.06, 0, 0.02], forearmR: [-0.08, 0, -0.02], head: [-0.02, 0, 0] } },
      { t: 0.34, p: { chest: [0.24, 0, 0], upperarmL: [-1.52, 0, 0.06], upperarmR: [-1.50, 0, -0.08], forearmL: [-0.16, 0, 0.02], forearmR: [-0.18, 0, -0.02] } },
      { t: 0.55, p: {} }
    ];
    /* hit — 맞은 쪽으로 상체가 젖혀지고 팔이 풀린다. */
    const hit = [
      { t: 0.00, p: {} },
      { t: 0.06, p: { pelvis: [-0.06, 0.10, 0], spine: [-0.16, 0.08, 0.06], chest: [-0.24, 0.12, 0.08], head: [-0.30, 0.10, 0.06], upperarmL: [-1.02, 0, 0.30], upperarmR: [-0.96, 0, -0.32], forearmL: [-0.05, 0, 0.04], forearmR: [-0.06, 0, -0.04] }, py: 0.02 },
      { t: 0.16, p: { spine: [-0.02, 0.04, 0.02], chest: [0.06, 0.06, 0.03], head: [-0.16, 0.05, 0.02], upperarmL: [-1.20, 0, 0.18], upperarmR: [-1.14, 0, -0.20] }, py: 0.01 },
      { t: 0.42, p: {} }
    ];
    return { idle: mkClip(spec, 'idle', 3.9, idle), walk: mkClip(spec, 'walk', 1.12, walk), attack: mkClip(spec, 'attack', 0.55, attack), hit: mkClip(spec, 'hit', 0.42, hit) };
  }
};

/* ================================================================ 거한 → 장정·거한
   키와 어깨가 큰 장수 체형. 묵직한 갑옷 판·투구·대검. 성큼성큼, 땅을 밟을 때마다 몸이 가라앉는다. */
const HEAVY = {
  key: 'heavy', h: 3.0, pelvisY: 1.48,
  /* v0.47 — 철갑(찰갑 비늘)·금테·칼날 하몬·맨살 한지. */
  zoneOf: function (c) {
    if (c === 0x6d5c38) return TEX.Z.GOLD;
    if (c === 0x8f9598) return TEX.Z.BLADE;
    if (c === 0x45403a || c === 0x37332e || c === 0x585a5c) return TEX.Z.IRON;
    if (c === 0x6f6558) return TEX.Z.PAPER;
    return TEX.Z.CLOTH;
  },
  defs: [
    ['pelvis', null, [0, 1.48, 0]],
    ['spine', 'pelvis', [0, 0.24, 0]],
    ['chest', 'spine', [0, 0.40, 0]],
    ['neck', 'chest', [0, 0.26, 0]],
    ['head', 'neck', [0, 0.13, 0]],
    ['shoulderL', 'chest', [0.235, 0.20, 0]],
    ['upperarmL', 'shoulderL', [0.075, -0.01, 0]],
    ['forearmL', 'upperarmL', [0, -0.38, 0]],
    ['handL', 'forearmL', [0, -0.34, 0]],
    ['shoulderR', 'chest', [-0.235, 0.20, 0]],
    ['upperarmR', 'shoulderR', [-0.075, -0.01, 0]],
    ['forearmR', 'upperarmR', [0, -0.38, 0]],
    ['handR', 'forearmR', [0, -0.34, 0]],
    ['weapon', 'handR', [0, -0.06, 0]],
    ['thighL', 'pelvis', [0.145, -0.05, 0]],
    ['shinL', 'thighL', [0, -0.72, 0]],
    ['footL', 'shinL', [0, -0.62, 0]],
    ['thighR', 'pelvis', [-0.145, -0.05, 0]],
    ['shinR', 'thighR', [0, -0.72, 0]],
    ['footR', 'shinR', [0, -0.62, 0]],
    ['skirtF', 'pelvis', [0, -0.03, 0.135]],
    ['skirtB', 'pelvis', [0, -0.03, -0.135]],
    ['skirtL', 'pelvis', [0.185, -0.02, 0]],
    ['skirtR', 'pelvis', [-0.185, -0.02, 0]]
  ],
  cloth: { skirtF: [0.22, 0.0], skirtB: [0.20, 0.9], skirtL: [0.12, 1.5], skirtR: [0.12, 2.1] },
  base: {
    pelvis: [0, 0, 0], spine: [0.04, 0, 0], chest: [0.05, 0, 0], neck: [0.04, 0, 0], head: [-0.04, 0, 0],
    shoulderL: [0, 0, 0.10], shoulderR: [0, 0, -0.10],
    upperarmL: [0.10, 0, 0.20], upperarmR: [0.02, 0, -0.22],
    forearmL: [-0.30, 0, 0.05], forearmR: [-0.34, 0, -0.05],
    handL: [0, 0, 0], handR: [0.10, 0, 0],
    weapon: [0.42, 0, 0.10],
    thighL: [-0.03, 0, 0.03], thighR: [-0.03, 0, -0.03],
    shinL: [0.07, 0, 0], shinR: [0.07, 0, 0],
    footL: [-0.03, 0, 0], footR: [-0.03, 0, 0]
  },
  parts: function () {
    const PLATE = 0x45403a, PLATE2 = 0x37332e, CLOTH = 0x3b3839, IRON = 0x585a5c;
    const TRIM = 0x6d5c38, SKIN = 0x6f6558, BLADE = 0x8f9598, GRIP = 0x33302b;
    const out = {};
    const add = function (b, p) { (out[b] || (out[b] = [])).push(p); };

    add('pelvis', P(lathe([[0, -0.20], [0.115, -0.185], [0.160, -0.12], [0.178, -0.02], [0.174, 0.08], [0.150, 0.145], [0, 0.170]], 14, 1.0, 0.86), PLATE));
    add('pelvis', NH(P(ringGeo(0.182, 0.022, 14), TRIM, { pos: [0, 0.062, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.88] })));
    add('spine', P(lathe([[0, -0.27], [0.130, -0.25], [0.166, -0.15], [0.176, 0.0], [0.188, 0.14], [0.196, 0.24], [0, 0.27]], 14, 1.0, 0.84), PLATE));
    add('chest', P(lathe([[0, -0.30], [0.150, -0.28], [0.205, -0.19], [0.232, -0.04], [0.236, 0.09], [0.212, 0.19], [0.150, 0.26], [0, 0.29]], 16, 1.10, 0.84), PLATE));
    /* 가슴 판(흉갑) — 두 짝의 철판과 금테 두 줄 */
    add('chest', NH(P(boxGeo(0.20, 0.26, 0.05), PLATE2, { pos: [0.105, 0.05, 0.205], rot: [0.06, -0.10, 0.05] })));
    add('chest', NH(P(boxGeo(0.20, 0.26, 0.05), PLATE2, { pos: [-0.105, 0.05, 0.205], rot: [0.06, 0.10, -0.05] })));
    add('chest', NH(P(boxGeo(0.42, 0.028, 0.012), TRIM, { pos: [0, 0.175, 0.222], rot: [0.10, 0, 0] })));
    add('chest', NH(P(boxGeo(0.42, 0.028, 0.012), TRIM, { pos: [0, -0.075, 0.224], rot: [0.10, 0, 0] })));
    /* 목 둘레 */
    add('chest', P(ringGeo(0.098, 0.024, 12), IRON, { pos: [0, 0.262, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.86] }));

    /* 머리 — 투구(철모)와 얼굴 가리개, 뿔 두 개 */
    add('neck', P(lathe([[0, -0.06], [0.062, -0.03], [0.066, 0.05], [0.062, 0.11], [0, 0.13]], 10, 1.0, 0.94), SKIN));
    add('head', P(lathe([[0, -0.06], [0.040, -0.040], [0.068, 0.0], [0.088, 0.06], [0.098, 0.13], [0.100, 0.20], [0.086, 0.26], [0.058, 0.31], [0, 0.335]], 12, 1.0, 0.96), SKIN));
    add('head', P(lathe([[0.104, 0.145], [0.112, 0.20], [0.104, 0.26], [0.082, 0.31], [0.050, 0.345], [0, 0.360]], 14, 1.0, 0.98), IRON));
    add('head', NH(P(ringGeo(0.112, 0.016, 14), TRIM, { pos: [0, 0.150, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.96] })));
    add('head', NH(P(boxGeo(0.020, 0.075, 0.014), 0x1a1917, { pos: [0.036, 0.115, 0.086] })));
    add('head', NH(P(boxGeo(0.020, 0.075, 0.014), 0x1a1917, { pos: [-0.036, 0.115, 0.086] })));
    add('head', NH(P(coneGeo(0.026, 0.150, 6), TRIM, { pos: [0.090, 0.300, 0.010], rot: [0.24, 0, -0.55] })));
    add('head', NH(P(coneGeo(0.026, 0.150, 6), TRIM, { pos: [-0.090, 0.300, 0.010], rot: [0.24, 0, 0.55] })));
    add('head', NH(P(new THREE.CylinderGeometry(0.016, 0.020, 0.075, 8), TRIM, { pos: [0, 0.395, 0] })));

    /* 팔 — 두꺼운 위팔, 철팔보호구, 큰 주먹 */
    ['L', 'R'].forEach(function (s) {
      add('upperarm' + s, P(ball(0.088, 1, 0.94, 0.94), PLATE));
      add('upperarm' + s, P(limbGeo(0.098, 0.076, 0.365, 12), PLATE));
      /* 어깨 판(견갑) */
      add('upperarm' + s, P(ball(0.118, 1.06, 0.62, 1.0), PLATE2, { pos: [0, 0.012, 0] }));
      add('upperarm' + s, NH(P(ringGeo(0.104, 0.010, 12), TRIM, { pos: [0, -0.19, 0], rot: [Math.PI / 2, 0, 0] })));
      add('forearm' + s, P(ball(0.066, 1, 0.96, 0.96), IRON));
      add('forearm' + s, P(limbGeo(0.078, 0.056, 0.32, 12), IRON));
      add('forearm' + s, P(ball(0.058, 1.0, 1.10, 0.94), SKIN, { pos: [0, -0.325, 0.004] }));
      /* 다리 */
      add('thigh' + s, P(ball(0.110, 1, 0.96, 1), CLOTH));
      add('thigh' + s, P(limbGeo(0.120, 0.088, 0.70, 12), CLOTH));
      add('shin' + s, P(ball(0.082, 1, 0.98, 1), PLATE2, { pos: [0, -0.004, 0] }));
      add('shin' + s, P(limbGeo(0.092, 0.066, 0.60, 12), PLATE2));
      add('shin' + s, NH(P(ringGeo(0.080, 0.014, 12), TRIM, { pos: [0, -0.30, 0], rot: [Math.PI / 2, 0, 0] })));
      add('foot' + s, P(ball(0.074, 1.0, 0.60, 1.9), 0x24232a, { pos: [0, -0.034, 0.052] }));
      add('foot' + s, NH(P(ball(0.064, 1.0, 0.22, 2.0), 0x141317, { pos: [0, -0.062, 0.058] })));
    });

    /* 대검 — 손 축에서 뽑힌 큰 날. 거한이 어깨에 걸쳐 든다. */
    add('weapon', P(B.bladeGeo(), BLADE, { pos: [0, 0.014, 0], scale: [1.9, 1.65, 1.9] }));
    add('weapon', NH(P(ringGeo(0.074, 0.014, 12), TRIM, { pos: [0, 0.0, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.5] })));
    add('weapon', P(new THREE.CylinderGeometry(0.026, 0.030, 0.30, 10), GRIP, { pos: [0, -0.16, 0] }));
    add('weapon', NH(P(ball(0.034, 1, 0.7, 1), TRIM, { pos: [0, -0.32, 0] })));

    /* 갑옷 자락 */
    add('skirtF', P(ribbonGeo(0.30, 0.36, 0.46, 3, 0.020, 0.014), PLATE2, { pos: [0, 0, 0.120] }));
    add('skirtB', P(ribbonGeo(0.32, 0.38, 0.48, 3, -0.020, 0.014), PLATE2, { pos: [0, 0, -0.122] }));
    add('skirtL', P(ribbonGeo(0.16, 0.20, 0.42, 3, 0.010, 0.012), PLATE, { pos: [0, 0, 0], rot: [0, Math.PI / 2, 0.05] }));
    add('skirtR', P(ribbonGeo(0.16, 0.20, 0.42, 3, -0.010, 0.012), PLATE, { pos: [0, 0, 0], rot: [0, Math.PI / 2, -0.05] }));
    return out;
  },
  clips: function (spec) {
    const idle = [
      { t: 0.00, p: {}, py: 0 },
      { t: 1.30, p: { chest: [0.09, -0.02, 0.01], head: [-0.01, 0.03, 0], upperarmL: [0.06, 0, 0.22], upperarmR: [0.00, 0, -0.24] }, py: -0.014 },
      { t: 2.70, p: { chest: [0.03, 0.02, -0.01], head: [-0.07, -0.03, 0], upperarmL: [0.13, 0, 0.18], upperarmR: [0.05, 0, -0.20] }, py: 0.006 },
      { t: 4.00, p: {}, py: 0 }
    ];
    /* walk — 성큼 걷기 12키. 발을 딛을 때마다 골반이 가라앉는다. */
    const walk = frames(12, 1.45, function (u, p) {
      const c = Math.cos(p), s = Math.sin(p);
      const stomp = Math.abs(Math.sin(p));
      return {
        p: {
        pelvis: [0.02, 0.13 * s, 0.05 * s],
        spine: [0.05, -0.06 * s, 0], chest: [0.07, -0.12 * s, -0.03 * s],
        neck: [0.03, 0.04 * s, 0], head: [-0.05, 0.05 * s, 0],
        upperarmL: [0.10 + 0.34 * c, 0, 0.20], upperarmR: [0.02 - 0.16 * c, 0, -0.22],
        forearmL: [-0.30 - 0.16 * Math.max(0, c), 0, 0.05], forearmR: [-0.34, 0, -0.05],
        weapon: [0.42 + 0.05 * s, 0, 0.10],
        thighL: [-0.03 + 0.78 * c, 0, 0.03], thighR: [-0.03 - 0.78 * c, 0, -0.03],
        shinL: [0.07 + 0.62 * Math.max(0, Math.sin(p - 0.3)), 0, 0], shinR: [0.07 + 0.62 * Math.max(0, Math.sin(p + Math.PI - 0.3)), 0, 0],
        footL: [-0.03 - 0.30 * Math.max(0, s), 0, 0], footR: [-0.03 - 0.30 * Math.max(0, -s), 0, 0]
      }, py: -0.05 + 0.045 * stomp };
    });
    /* attack — 대검을 머리 위로 들어 내려찍는다. */
    const attack = [
      { t: 0.00, p: {} },
      { t: 0.16, p: { spine: [-0.08, -0.10, 0], chest: [-0.12, -0.16, 0], head: [-0.10, -0.08, 0], upperarmR: [-2.55, 0, -0.30], forearmR: [-0.85, 0, -0.05], weapon: [0.10, 0, 0.0], upperarmL: [-0.55, 0, 0.30] }, py: 0.03 },
      { t: 0.30, p: { spine: [-0.14, -0.06, 0], chest: [-0.20, -0.10, 0], upperarmR: [-2.75, 0, -0.22], forearmR: [-0.50, 0, -0.05], weapon: [0.02, 0, 0] }, py: 0.05 },
      { t: 0.48, p: { pelvis: [0.10, 0.05, 0], spine: [0.24, 0.10, 0], chest: [0.34, 0.16, 0], neck: [0.10, 0, 0], head: [0.06, 0.06, 0], upperarmR: [-0.45, 0, -0.10], forearmR: [-0.10, 0, -0.03], weapon: [1.10, 0, 0.05], upperarmL: [0.20, 0, 0.34] }, py: -0.10 },
      { t: 0.66, p: { chest: [0.20, 0.08, 0], upperarmR: [-0.20, 0, -0.12], weapon: [0.95, 0, 0.08] }, py: -0.04 },
      { t: 0.80, p: {} }
    ];
    const hit = [
      { t: 0.00, p: {} },
      { t: 0.07, p: { pelvis: [-0.08, 0.12, 0], spine: [-0.22, 0.10, 0.05], chest: [-0.30, 0.14, 0.07], head: [-0.34, 0.10, 0.05], upperarmL: [0.42, 0, 0.42], upperarmR: [0.30, 0, -0.44], forearmL: [-0.20, 0, 0.05], forearmR: [-0.24, 0, -0.05] }, py: 0.03 },
      { t: 0.20, p: { spine: [-0.04, 0.04, 0.02], chest: [0.02, 0.06, 0.02], head: [-0.18, 0.04, 0.02] }, py: 0.01 },
      { t: 0.50, p: {} }
    ];
    return { idle: mkClip(spec, 'idle', 4.0, idle), walk: mkClip(spec, 'walk', 1.45, walk), attack: mkClip(spec, 'attack', 0.80, attack), hit: mkClip(spec, 'hit', 0.50, hit) };
  }
};

/* ================================================================ 돌덩이 → 석인(石人)
   바위 덩어리가 관절로 이어진 골렘. 이끼가 앉은 거친 먹바위, 눈두덩에 붉은 등잔 하나.
   걷기는 한 걸음마다 땅이 울리는 둔중한 스톰프. */
const STONE = {
  key: 'stone', h: 2.6, pelvisY: 1.06,
  /* v0.47 — 화강암 [균열 + 이끼]. */
  zoneOf: function (c) { return TEX.Z.ROCK; },
  defs: [
    ['pelvis', null, [0, 1.06, 0]],
    ['spine', 'pelvis', [0, 0.20, 0]],
    ['chest', 'spine', [0, 0.30, 0]],
    ['neck', 'chest', [0, 0.16, 0]],
    ['head', 'neck', [0, 0.16, 0]],
    ['shoulderL', 'chest', [0.26, 0.14, 0]],
    ['upperarmL', 'shoulderL', [0.09, 0.0, 0]],
    ['forearmL', 'upperarmL', [0, -0.42, 0]],
    ['handL', 'forearmL', [0, -0.34, 0]],
    ['shoulderR', 'chest', [-0.26, 0.14, 0]],
    ['upperarmR', 'shoulderR', [-0.09, 0.0, 0]],
    ['forearmR', 'upperarmR', [0, -0.42, 0]],
    ['handR', 'forearmR', [0, -0.34, 0]],
    ['thighL', 'pelvis', [0.135, -0.06, 0]],
    ['shinL', 'thighL', [0, -0.50, 0]],
    ['footL', 'shinL', [0, -0.44, 0]],
    ['thighR', 'pelvis', [-0.135, -0.06, 0]],
    ['shinR', 'thighR', [0, -0.50, 0]],
    ['footR', 'shinR', [0, -0.44, 0]]
  ],
  cloth: {},
  base: {
    pelvis: [0, 0, 0], spine: [0.06, 0, 0], chest: [0.08, 0, 0], neck: [0.05, 0, 0], head: [-0.03, 0, 0],
    shoulderL: [0, 0, 0.08], shoulderR: [0, 0, -0.08],
    upperarmL: [0.10, 0, 0.22], upperarmR: [0.10, 0, -0.22],
    forearmL: [-0.34, 0, 0.04], forearmR: [-0.34, 0, -0.04],
    handL: [0, 0, 0], handR: [0, 0, 0],
    thighL: [-0.02, 0, 0.03], thighR: [-0.02, 0, -0.03],
    shinL: [0.14, 0, 0], shinR: [0.14, 0, 0],
    footL: [-0.06, 0, 0], footR: [-0.06, 0, 0]
  },
  parts: function () {
    const ROCK = 0x565049, ROCK2 = 0x46423d, ROCK3 = 0x625a52, MOSS = 0x3f4a3c, EYE = 0xd04a2c;
    const out = {};
    const add = function (b, p) { (out[b] || (out[b] = [])).push(p); };

    /* 몸통 — 큰 바위 덩어리 세 개가 이어진다. */
    add('pelvis', P(rockGeo(0.22, 7, 1.15, 0.78, 1.0), ROCK, { pos: [0, 0.02, 0] }));
    add('spine', P(rockGeo(0.25, 13, 1.10, 0.86, 1.05), ROCK2, { pos: [0, -0.02, 0] }));
    add('chest', P(rockGeo(0.34, 23, 1.22, 0.92, 1.08), ROCK, { pos: [0, 0.04, 0] }));
    add('chest', NH(P(rockGeo(0.09, 31, 1.1, 0.9, 1.0), MOSS, { pos: [0.16, 0.22, 0.10] })));
    add('chest', NH(P(rockGeo(0.07, 37, 1.1, 0.9, 1.0), MOSS, { pos: [-0.19, 0.12, -0.06] })));

    /* 머리 — 각진 바위 하나에 눈두덩 둘(붉은 등잔)과 이가 드러난 틈. */
    add('head', P(rockGeo(0.22, 41, 1.05, 0.95, 1.0), ROCK3, { pos: [0, 0.07, 0] }));
    add('head', P(rockGeo(0.055, 43, 1.0, 0.9, 0.7), 0x22201e, { pos: [0.088, 0.11, 0.175] }));
    add('head', P(rockGeo(0.055, 47, 1.0, 0.9, 0.7), 0x22201e, { pos: [-0.088, 0.11, 0.175] }));
    add('head', NH(P(ball(0.024, 1, 1, 0.6), EYE, { pos: [0.088, 0.115, 0.196] })));
    add('head', NH(P(ball(0.024, 1, 1, 0.6), EYE, { pos: [-0.088, 0.115, 0.196] })));
    add('head', NH(P(boxGeo(0.15, 0.022, 0.02), 0x24221f, { pos: [0, -0.03, 0.20] })));
    add('head', NH(P(rockGeo(0.045, 53, 1.0, 0.8, 0.7), MOSS, { pos: [0.06, 0.235, -0.02] })));

    /* 팔 — 어깨 바위 → 위팔 바위 → 주먹 바위. 관절마다 작은 자갈이 끼어 있다. */
    ['L', 'R'].forEach(function (s) {
      add('upperarm' + s, P(rockGeo(0.125, s === 'L' ? 61 : 67, 1.0, 1.0, 1.0), ROCK2, { pos: [0, 0.01, 0] }));
      add('upperarm' + s, P(rockGeo(0.105, s === 'L' ? 71 : 73, 0.95, 1.35, 0.95), ROCK, { pos: [0, -0.26, 0] }));
      add('forearm' + s, P(rockGeo(0.075, s === 'L' ? 79 : 83, 1.0, 1.0, 1.0), ROCK3, { pos: [0, -0.01, 0] }));
      add('forearm' + s, P(rockGeo(0.095, s === 'L' ? 89 : 97, 0.95, 1.25, 0.95), ROCK2, { pos: [0, -0.24, 0] }));
      add('forearm' + s, P(rockGeo(0.115, s === 'L' ? 101 : 103, 1.05, 0.95, 1.05), ROCK, { pos: [0, -0.40, 0.01] }));
      add('thigh' + s, P(rockGeo(0.115, s === 'L' ? 107 : 109, 1.0, 1.0, 1.0), ROCK2, { pos: [0, -0.02, 0] }));
      add('thigh' + s, P(rockGeo(0.115, s === 'L' ? 113 : 127, 0.95, 1.30, 0.95), ROCK, { pos: [0, -0.30, 0] }));
      add('shin' + s, P(rockGeo(0.085, s === 'L' ? 131 : 137, 1.0, 1.0, 1.0), ROCK3, { pos: [0, -0.01, 0] }));
      add('shin' + s, P(rockGeo(0.100, s === 'L' ? 139 : 149, 0.95, 1.25, 0.95), ROCK2, { pos: [0, -0.26, 0] }));
      add('foot' + s, P(rockGeo(0.115, s === 'L' ? 151 : 157, 1.15, 0.62, 1.35), ROCK, { pos: [0, -0.02, 0.03] }));
    });
    return out;
  },
  clips: function (spec) {
    const idle = [
      { t: 0.00, p: {}, py: 0 },
      { t: 1.60, p: { chest: [0.11, -0.03, 0.02], head: [0.01, 0.05, 0], upperarmL: [0.06, 0, 0.24], upperarmR: [0.06, 0, -0.24] }, py: -0.012 },
      { t: 3.20, p: { chest: [0.05, 0.03, -0.02], head: [-0.06, -0.04, 0], upperarmL: [0.14, 0, 0.20], upperarmR: [0.14, 0, -0.20] }, py: 0.006 },
      { t: 4.60, p: {}, py: 0 }
    ];
    /* walk — 12키. 한 발씩 무겁게 딛고, 몸 전체가 그 충격에 기운다. */
    const walk = frames(12, 1.55, function (u, p) {
      const c = Math.cos(p), s = Math.sin(p);
      const stomp = Math.abs(Math.sin(p));
      return {
        p: {
        pelvis: [0.03, 0.10 * s, 0.07 * s],
        spine: [0.07, -0.05 * s, -0.03 * s], chest: [0.09, -0.09 * s, -0.04 * s],
        neck: [0.05, 0.04 * s, 0], head: [-0.02 + 0.04 * s, 0.05 * s, 0.04 * s],
        upperarmL: [0.10 - 0.26 * c, 0, 0.22], upperarmR: [0.10 + 0.26 * c, 0, -0.22],
        forearmL: [-0.34 - 0.10 * Math.max(0, -c), 0, 0.04], forearmR: [-0.34 - 0.10 * Math.max(0, c), 0, -0.04],
        thighL: [-0.02 + 0.74 * c, 0, 0.03], thighR: [-0.02 - 0.74 * c, 0, -0.03],
        shinL: [0.14 + 0.60 * Math.max(0, Math.sin(p - 0.4)), 0, 0], shinR: [0.14 + 0.60 * Math.max(0, Math.sin(p + Math.PI - 0.4)), 0, 0],
        footL: [-0.06 - 0.26 * Math.max(0, s), 0, 0], footR: [-0.06 - 0.26 * Math.max(0, -s), 0, 0]
      }, py: -0.045 + 0.040 * stomp };
    });
    /* attack — 두 주먹을 들어 내리찍는다. */
    const attack = [
      { t: 0.00, p: {} },
      { t: 0.20, p: { spine: [-0.10, 0, 0], chest: [-0.16, 0, 0], head: [-0.06, 0, 0], upperarmL: [-2.30, 0, 0.20], upperarmR: [-2.30, 0, -0.20], forearmL: [-0.70, 0, 0.04], forearmR: [-0.70, 0, -0.04] }, py: 0.04 },
      { t: 0.34, p: { spine: [-0.14, 0, 0], chest: [-0.20, 0, 0], upperarmL: [-2.45, 0, 0.16], upperarmR: [-2.45, 0, -0.16], forearmL: [-0.50, 0, 0.04], forearmR: [-0.50, 0, -0.04] }, py: 0.05 },
      { t: 0.50, p: { pelvis: [0.10, 0, 0], spine: [0.26, 0, 0], chest: [0.34, 0, 0], neck: [0.10, 0, 0], head: [0.10, 0, 0], upperarmL: [-0.30, 0, 0.30], upperarmR: [-0.30, 0, -0.30], forearmL: [-0.05, 0, 0.04], forearmR: [-0.05, 0, -0.04], thighL: [-0.20, 0, 0.03], thighR: [-0.20, 0, -0.03], shinL: [0.36, 0, 0], shinR: [0.36, 0, 0] }, py: -0.12 },
      { t: 0.72, p: { spine: [0.14, 0, 0], chest: [0.18, 0, 0], upperarmL: [0.0, 0, 0.26], upperarmR: [0.0, 0, -0.26], py: -0.05 } },
      { t: 1.00, p: {} }
    ];
    const hit = [
      { t: 0.00, p: {} },
      { t: 0.07, p: { pelvis: [-0.06, 0.08, 0], spine: [-0.16, 0.06, 0.04], chest: [-0.22, 0.10, 0.06], head: [-0.20, 0.08, 0.05], upperarmL: [0.34, 0, 0.40], upperarmR: [0.34, 0, -0.40] }, py: 0.02 },
      { t: 0.22, p: { spine: [0.0, 0.03, 0.02], chest: [0.04, 0.04, 0.02], head: [-0.10, 0.03, 0.02] } },
      { t: 0.55, p: {} }
    ];
    return { idle: mkClip(spec, 'idle', 4.6, idle), walk: mkClip(spec, 'walk', 1.55, walk), attack: mkClip(spec, 'attack', 1.00, attack), hit: mkClip(spec, 'hit', 0.55, hit) };
  }
};

/* ================================================================ 보스 — 어둠의 검객·대장군
   위압적인 덩치. 투구·견갑·긴 망토, 환도(또는 장창·법봉). 여섯 장마다 장신구·무기를 바꾼다.
   wind(예비 동작 — 칼을 머리 위로 들어 드는 자세로 굳는다) / strike(내려베기) 가 보스 패턴의 몸짓이다. */
const BOSS = {
  key: 'boss', h: 6.2, pelvisY: 2.75,
  /* v0.47 — 대장군 갑옷(비늘·철판)·금박 구름 문양·망토 홍색 천·환도 하몬. */
  zoneOf: function (c) {
    if (c === 0x5f4c2e) return TEX.Z.GOLD;
    if (c === 0x8f9598) return TEX.Z.BLADE;
    if (c === 0x3d3b40 || c === 0x2e2c31 || c === 0x55575a) return TEX.Z.IRON;
    if (c === 0x6e2a24) return TEX.Z.SASH;
    if (c === 0x6a6154) return TEX.Z.PAPER;
    return TEX.Z.CLOTH;
  },
  defs: [
    ['pelvis', null, [0, 2.75, 0]],
    ['spine', 'pelvis', [0, 0.42, 0]],
    ['chest', 'spine', [0, 0.78, 0]],
    ['neck', 'chest', [0, 0.50, 0]],
    ['head', 'neck', [0, 0.22, 0]],
    ['shoulderL', 'chest', [0.345, 0.36, 0]],
    ['upperarmL', 'shoulderL', [0.10, -0.02, 0]],
    ['forearmL', 'upperarmL', [0, -0.78, 0]],
    ['handL', 'forearmL', [0, -0.66, 0]],
    ['shoulderR', 'chest', [-0.345, 0.36, 0]],
    ['upperarmR', 'shoulderR', [-0.10, -0.02, 0]],
    ['forearmR', 'upperarmR', [0, -0.78, 0]],
    ['handR', 'forearmR', [0, -0.66, 0]],
    ['weapon', 'handR', [0, -0.12, 0]],
    ['thighL', 'pelvis', [0.175, -0.09, 0]],
    ['shinL', 'thighL', [0, -1.28, 0]],
    ['footL', 'shinL', [0, -1.30, 0]],
    ['thighR', 'pelvis', [-0.175, -0.09, 0]],
    ['shinR', 'thighR', [0, -1.28, 0]],
    ['footR', 'shinR', [0, -1.30, 0]],
    ['capeA', 'pelvis', [0, 0.10, -0.30]],
    ['capeB', 'capeA', [0, -0.92, -0.06]],
    ['capeC', 'capeB', [0, -0.90, -0.04]],
    ['sashL', 'pelvis', [0.24, 0.0, 0.02]],
    ['sashR', 'pelvis', [-0.24, 0.0, 0.02]],
    ['hornL', 'head', [0.16, 0.42, -0.02]],
    ['hornR', 'head', [-0.16, 0.42, -0.02]]
  ],
  cloth: { capeA: [0.30, 0.0], capeB: [0.42, 0.4], capeC: [0.50, 0.9], sashL: [0.18, 1.4], sashR: [0.18, 2.0] },
  base: {
    pelvis: [0, 0, 0], spine: [0.04, 0, 0], chest: [0.06, 0, 0], neck: [0.03, 0, 0], head: [-0.05, 0, 0],
    shoulderL: [0, 0, 0.08], shoulderR: [0, 0, -0.08],
    upperarmL: [0.06, 0, 0.16], upperarmR: [-0.10, 0, -0.18],
    forearmL: [-0.26, 0, 0.04], forearmR: [-0.30, 0, -0.04],
    handL: [0, 0, 0], handR: [0.08, 0, 0],
    weapon: [0.62, 0, 0.12],
    thighL: [-0.04, 0, 0.03], thighR: [-0.04, 0, -0.03],
    shinL: [0.08, 0, 0], shinR: [0.08, 0, 0],
    footL: [-0.03, 0, 0], footR: [-0.03, 0, 0],
    hornL: [0, 0, -0.45], hornR: [0, 0, 0.45]
  },
  parts: function (v) {
    const ARMOR = 0x3d3b40, ARMOR2 = 0x2e2c31, CLOTH = 0x2d2729, SASH = 0x6e2a24;
    const IRON = 0x55575a, BLADE = 0x8f9598, GRIP = 0x2a2723, CROWN = 0x5f4c2e, FACE = 0x1e1d20;
    const out = {};
    const add = function (b, p) { (out[b] || (out[b] = [])).push(p); };

    add('pelvis', P(lathe([[0, -0.30], [0.185, -0.28], [0.245, -0.19], [0.262, -0.04], [0.256, 0.10], [0.222, 0.20], [0, 0.235]], 16, 1.0, 0.84), ARMOR));
    add('pelvis', NH(P(ringGeo(0.268, 0.030, 16), SASH, { pos: [0, 0.075, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.86] })));
    add('spine', P(lathe([[0, -0.42], [0.190, -0.39], [0.240, -0.24], [0.252, -0.02], [0.268, 0.20], [0.280, 0.36], [0, 0.40]], 16, 1.0, 0.82), ARMOR));
    add('chest', P(lathe([[0, -0.46], [0.215, -0.43], [0.295, -0.29], [0.330, -0.06], [0.336, 0.13], [0.302, 0.29], [0.215, 0.39], [0, 0.44]], 18, 1.12, 0.82), ARMOR));
    /* 흉갑 — 두 짝 판 + 붉은 띠 */
    add('chest', NH(P(boxGeo(0.28, 0.42, 0.07), ARMOR2, { pos: [0.145, 0.06, 0.300], rot: [0.05, -0.10, 0.04] })));
    add('chest', NH(P(boxGeo(0.28, 0.42, 0.07), ARMOR2, { pos: [-0.145, 0.06, 0.300], rot: [0.05, 0.10, -0.04] })));
    add('chest', NH(P(boxGeo(0.045, 0.60, 0.02), SASH, { pos: [0, 0.02, 0.330], rot: [0.06, 0, 0.30] })));
    add('chest', NH(P(boxGeo(0.56, 0.032, 0.02), CROWN, { pos: [0, 0.255, 0.318], rot: [0.10, 0, 0] })));
    add('chest', P(ringGeo(0.135, 0.032, 14), IRON, { pos: [0, 0.400, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.86] }));

    /* 머리 — 투구 + 가리개. 장신구는 장마다 다르다(horn·kasa·crown·veil). */
    add('neck', P(lathe([[0, -0.09], [0.086, -0.05], [0.092, 0.06], [0.086, 0.14], [0, 0.17]], 12, 1.0, 0.94), FACE));
    add('head', P(lathe([[0, -0.10], [0.058, -0.075], [0.098, 0.0], [0.125, 0.09], [0.138, 0.19], [0.140, 0.29], [0.120, 0.37], [0.082, 0.44], [0, 0.475]], 14, 1.0, 0.96), FACE));
    add('head', P(lathe([[0.146, 0.215], [0.156, 0.29], [0.144, 0.375], [0.114, 0.44], [0.070, 0.492], [0, 0.515]], 16, 1.0, 0.98), IRON));
    add('head', NH(P(ringGeo(0.152, 0.022, 16), CROWN, { pos: [0, 0.222, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.96] })));
    add('head', NH(P(boxGeo(0.030, 0.105, 0.018), 0x141312, { pos: [0.050, 0.165, 0.122] })));
    add('head', NH(P(boxGeo(0.030, 0.105, 0.018), 0x141312, { pos: [-0.050, 0.165, 0.122] })));
    add('head', NH(P(boxGeo(0.075, 0.014, 0.012), 0x8f2a1e, { pos: [0, 0.120, 0.128] })));
    /* 장신구 변주 */
    if (v === 1) {              /* 살갓 — 넓은 챙 */
      add('head', NH(P(new THREE.CylinderGeometry(0.420, 0.445, 0.030, 16), CLOTH, { pos: [0, 0.470, 0] })));
      add('head', NH(P(new THREE.CylinderGeometry(0.175, 0.185, 0.075, 14), CLOTH, { pos: [0, 0.500, 0] })));
    } else if (v === 2) {        /* 관 — 세 봉우리 */
      add('head', NH(P(boxGeo(0.36, 0.075, 0.24), CROWN, { pos: [0, 0.545, -0.02] })));
      [-0.13, 0, 0.13].forEach(function (dx, j) {
        add('head', NH(P(coneGeo(0.032, 0.13 + j * 0.035, 5), CROWN, { pos: [dx, 0.64 + j * 0.018, -0.02] })));
      });
    } else if (v === 3) {        /* 너저분한 수건 */
      add('head', NH(P(ribbonGeo(0.30, 0.22, 0.36, 3, 0.010, 0.030), CLOTH, { pos: [0, 0.48, -0.10] })));
      add('head', NH(P(ball(0.155, 1.05, 0.55, 1.05), CLOTH, { pos: [0, 0.515, 0] })));
    }
    /* 뿔 뼈대(0·1·2에서도 작게 솟는다 — 보스 실루엣의 표식) */
    add('hornL', NH(P(coneGeo(0.038, 0.30, 6), CROWN, { pos: [0, 0.12, 0] })));
    add('hornR', NH(P(coneGeo(0.038, 0.30, 6), CROWN, { pos: [0, 0.12, 0] })));

    /* 팔 — 견갑(가시 달린 어깨 판), 철 팔, 큰 손 */
    ['L', 'R'].forEach(function (s) {
      add('upperarm' + s, P(ball(0.128, 1, 0.94, 0.94), ARMOR));
      add('upperarm' + s, P(limbGeo(0.142, 0.110, 0.75, 12), ARMOR));
      add('upperarm' + s, P(ball(0.185, 1.08, 0.60, 1.02), ARMOR2, { pos: [0, 0.03, 0] }));
      add('upperarm' + s, NH(P(coneGeo(0.045, 0.19, 5), CROWN, { pos: [0.12, 0.10, 0], rot: [0, 0, -0.85] })));
      add('upperarm' + s, NH(P(ringGeo(0.150, 0.018, 12), CROWN, { pos: [0, -0.36, 0], rot: [Math.PI / 2, 0, 0] })));
      add('forearm' + s, P(ball(0.098, 1, 0.96, 0.96), IRON));
      add('forearm' + s, P(limbGeo(0.115, 0.082, 0.66, 12), IRON));
      add('forearm' + s, P(ball(0.086, 1.0, 1.10, 0.92), 0x6a6154, { pos: [0, -0.655, 0.006] }));
      add('thigh' + s, P(ball(0.190, 1, 0.96, 1), CLOTH));
      add('thigh' + s, P(limbGeo(0.205, 0.165, 1.24, 12), CLOTH));
      add('shin' + s, P(ball(0.150, 1, 0.98, 1), ARMOR2, { pos: [0, -0.006, 0] }));
      add('shin' + s, P(limbGeo(0.170, 0.125, 1.20, 12), ARMOR2));
      add('shin' + s, NH(P(ringGeo(0.150, 0.024, 12), CROWN, { pos: [0, -0.62, 0], rot: [Math.PI / 2, 0, 0] })));
      add('foot' + s, P(ball(0.108, 1.0, 0.62, 1.9), 0x1d1c22, { pos: [0, -0.055, 0.075] }));
    });

    /* 무기 — 환도 / 장창 / 법봉 */
    if (v === 1) {
      add('weapon', P(new THREE.CylinderGeometry(0.026, 0.030, 2.10, 10), GRIP, { pos: [0, 0.72, 0] }));
      add('weapon', P(coneGeo(0.062, 0.46, 6), BLADE, { pos: [0, 1.95, 0] }));
      add('weapon', NH(P(ringGeo(0.052, 0.012, 10), CROWN, { pos: [0, 1.70, 0], rot: [Math.PI / 2, 0, 0] })));
      add('weapon', NH(P(ringGeo(0.050, 0.014, 10), CROWN, { pos: [0, 0.0, 0], rot: [Math.PI / 2, 0, 0] })));
    } else if (v === 2) {
      add('weapon', P(new THREE.CylinderGeometry(0.028, 0.032, 2.15, 10), GRIP, { pos: [0, 0.78, 0] }));
      add('weapon', NH(P(ringGeo(0.085, 0.020, 12), CROWN, { pos: [0, 1.90, 0], rot: [Math.PI / 2, 0, 0] })));
      add('weapon', P(ball(0.075, 1, 1, 1), IRON, { pos: [0, 1.94, 0] }));
      add('weapon', NH(P(ringGeo(0.050, 0.014, 10), CROWN, { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0] })));
    } else {
      add('weapon', P(B.bladeGeo(), BLADE, { pos: [0, 0.02, 0], scale: [2.6, 2.6, 2.6] }));
      add('weapon', NH(P(ringGeo(0.088, 0.016, 12), CROWN, { pos: [0, 0.0, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.5] })));
      add('weapon', P(new THREE.CylinderGeometry(0.030, 0.034, 0.40, 10), GRIP, { pos: [0, -0.22, 0] }));
      add('weapon', NH(P(ball(0.042, 1, 0.7, 1), CROWN, { pos: [0, -0.44, 0] })));
    }

    /* 망토 — 세 마디로 늘어진다(허리에서 발뒤꿈치까지). */
    add('capeA', P(ribbonGeo(0.52, 0.60, 0.94, 3, -0.05, 0.020), CLOTH, { pos: [0, 0, 0] }));
    add('capeB', P(ribbonGeo(0.60, 0.66, 0.92, 3, -0.05, 0.024), CLOTH, { pos: [0, 0, 0] }));
    add('capeC', P(ribbonGeo(0.66, 0.70, 0.90, 3, -0.04, 0.026), CLOTH, { pos: [0, 0, 0] }));
    add('sashL', P(ribbonGeo(0.13, 0.18, 0.80, 3, 0.010, 0.016), SASH, { pos: [0, 0, 0] }));
    add('sashR', P(ribbonGeo(0.12, 0.16, 0.74, 3, -0.010, 0.016), SASH, { pos: [0, 0, 0] }));
    return out;
  },
  clips: function (spec) {
    const idle = [
      { t: 0.00, p: {}, py: 0 },
      { t: 1.60, p: { chest: [0.10, -0.03, 0.012], head: [-0.02, 0.05, 0], upperarmL: [0.02, 0, 0.19], upperarmR: [-0.14, 0, -0.15], weapon: [0.70, 0.02, 0.14] }, py: -0.028 },
      { t: 3.20, p: { chest: [0.02, 0.03, -0.012], head: [-0.09, -0.05, 0], upperarmL: [0.10, 0, 0.13], upperarmR: [-0.06, 0, -0.21], weapon: [0.56, -0.02, 0.10] }, py: 0.012 },
      { t: 4.60, p: {}, py: 0 }
    ];
    /* walk — 위압적인 느린 걸음. 팔이 거의 흔들리지 않고 상체가 앞뒤로 눌린다. */
    const walk = frames(12, 1.70, function (u, p) {
      const c = Math.cos(p), s = Math.sin(p);
      return {
        p: {
        pelvis: [0.02, 0.10 * s, 0.03 * s],
        spine: [0.05, -0.06 * s, 0], chest: [0.08, -0.12 * s, -0.03 * s],
        neck: [0.03, 0.05 * s, 0], head: [-0.05, 0.06 * s, 0],
        upperarmL: [0.06 + 0.18 * c, 0, 0.16], upperarmR: [-0.10 - 0.10 * c, 0, -0.18],
        forearmL: [-0.26 - 0.10 * Math.max(0, c), 0, 0.04],
        weapon: [0.62 + 0.06 * s, 0, 0.12],
        thighL: [-0.04 + 0.64 * c, 0, 0.03], thighR: [-0.04 - 0.64 * c, 0, -0.03],
        shinL: [0.08 + 0.54 * Math.max(0, Math.sin(p - 0.35)), 0, 0], shinR: [0.08 + 0.54 * Math.max(0, Math.sin(p + Math.PI - 0.35)), 0, 0],
        footL: [-0.03 - 0.24 * Math.max(0, s), 0, 0], footR: [-0.03 - 0.24 * Math.max(0, -s), 0, 0]
      }, py: -0.045 + 0.035 * Math.abs(s) };
    });
    /* wind — 예비 동작. 검을 머리 위로 높이 들어 몸을 비튼 자세로 굳는다(텔레그래프). */
    const wind = [
      { t: 0.00, p: {} },
      { t: 0.30, p: { pelvis: [0.02, -0.18, 0], spine: [-0.06, -0.16, 0], chest: [-0.10, -0.26, 0.04], head: [-0.02, -0.18, 0], upperarmR: [-2.35, 0, -0.42], forearmR: [-1.05, 0, -0.05], weapon: [0.10, 0.20, 0.10], upperarmL: [-0.85, 0, 0.44], forearmL: [-0.60, 0, 0.05] }, py: 0.02 },
      { t: 0.62, p: { pelvis: [0.03, -0.26, 0], spine: [-0.10, -0.22, 0], chest: [-0.16, -0.36, 0.05], head: [-0.04, -0.24, 0], upperarmR: [-2.62, 0, -0.52], forearmR: [-0.80, 0, -0.05], weapon: [0.02, 0.28, 0.12], upperarmL: [-1.05, 0, 0.50], forearmL: [-0.55, 0, 0.05], thighL: [-0.12, 0, 0.05], thighR: [0.10, 0, -0.06] }, py: 0.03 },
      { t: 0.95, p: { pelvis: [0.03, -0.30, 0], spine: [-0.12, -0.24, 0], chest: [-0.18, -0.40, 0.06], head: [-0.05, -0.26, 0], upperarmR: [-2.70, 0, -0.55], forearmR: [-0.72, 0, -0.05], weapon: [0.00, 0.30, 0.12], upperarmL: [-1.12, 0, 0.52], forearmL: [-0.50, 0, 0.05] }, py: 0.03 }
    ];
    /* strike — 내려베기. 허리 비틀기 → 어깨·팔꿈치 스냅 → 잔심. */
    const strike = [
      { t: 0.00, p: { pelvis: [0.03, -0.30, 0], spine: [-0.12, -0.24, 0], chest: [-0.18, -0.40, 0.06], upperarmR: [-2.70, 0, -0.55], forearmR: [-0.72, 0, -0.05], weapon: [0.00, 0.30, 0.12] } },
      { t: 0.10, p: { pelvis: [0.10, 0.10, 0], spine: [0.16, 0.14, 0], chest: [0.26, 0.26, -0.04], neck: [0.06, 0.08, 0], head: [0.02, 0.14, 0], upperarmR: [-1.55, -0.10, -0.10], forearmR: [-0.25, 0, 0], weapon: [1.35, 0, 0.05], upperarmL: [0.20, 0, 0.34] }, py: -0.05 },
      { t: 0.18, p: { pelvis: [0.12, 0.18, 0], spine: [0.22, 0.20, 0], chest: [0.34, 0.36, -0.05], head: [0.04, 0.20, 0], upperarmR: [-1.10, -0.14, 0.10], forearmR: [-0.18, 0, 0], weapon: [1.55, -0.04, 0.0], upperarmL: [0.26, 0, 0.38] }, py: -0.07 },
      { t: 0.30, p: { pelvis: [0.08, 0.12, 0], spine: [0.16, 0.14, 0], chest: [0.24, 0.26, -0.03], upperarmR: [-1.30, -0.06, 0.20], forearmR: [-0.35, 0, 0], weapon: [1.30, -0.06, 0.02], upperarmL: [0.16, 0, 0.28] }, py: -0.04 },
      { t: 0.50, p: {} }
    ];
    const hit = [
      { t: 0.00, p: {} },
      { t: 0.08, p: { pelvis: [-0.09, 0.12, 0.04], spine: [-0.24, 0.10, 0.07], chest: [-0.34, 0.14, 0.10], neck: [-0.10, 0, 0], head: [-0.36, 0.10, 0.06], upperarmL: [0.44, 0, 0.46], upperarmR: [0.30, 0, -0.48], weapon: [0.90, 0, 0.22] }, py: 0.05 },
      { t: 0.24, p: { spine: [-0.06, 0.04, 0.02], chest: [0.0, 0.06, 0.03], head: [-0.18, 0.04, 0.02], weapon: [0.70, 0, 0.14] }, py: 0.02 },
      { t: 0.60, p: {} }
    ];
    return {
      idle: mkClip(spec, 'idle', 4.6, idle), walk: mkClip(spec, 'walk', 1.70, walk),
      wind: mkClip(spec, 'wind', 0.95, wind), strike: mkClip(spec, 'strike', 0.50, strike),
      hit: mkClip(spec, 'hit', 0.60, hit)
    };
  }
};

const SPECS = { minion: MINION, heavy: HEAVY, stone: STONE, boss: BOSS };

/* ---------------------------------------------------------------- 베이킹·조립 */
function bake(spec, variant) {
  const boneIdx = {}, rest = {};
  spec.defs.forEach(function (d, i) {
    boneIdx[d[0]] = i;
    const par = d[1] ? (rest[d[1]] || [0, 0, 0]) : [0, 0, 0];
    rest[d[0]] = [par[0] + d[2][0], par[1] + d[2][1], par[2] + d[2][2]];
  });
  const parts = spec.parts(variant);
  const list = [];
  Object.keys(parts).forEach(function (b) {
    parts[b].forEach(function (p) { p.b = b; p.z = spec.zoneOf ? spec.zoneOf(p.color) : 0; list.push(p); });
  });
  const geo = mergeSkinned(list, boneIdx, false, rest);
  const hull = hullFrom(mergeSkinned(list, boneIdx, true, rest), 0.028);
  const animBones = spec.defs.map(function (d) { return d[0]; }).filter(function (n) { return !spec.cloth[n]; });
  const s2 = Object.assign({}, spec, { animBones: animBones });
  const clips = CLIPS[spec.key] || (CLIPS[spec.key] = spec.clips(s2));
  return {
    bones: spec.defs, boneIdx: boneIdx, geo: geo, hull: hull,
    clips: clips, spec: spec, h: spec.h,
    verts: geo.getAttribute('position').count,
    tris: geo.index ? Math.round(geo.index.count / 3) : Math.round(geo.getAttribute('position').count / 3),
    hullVerts: hull ? hull.getAttribute('position').count : 0
  };
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
  const bg = makeBones(C.bones);
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
    if (k !== 'idle' && k !== 'walk') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
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
    /* wind(예비 동작)는 끝까지 재생한 자세로 **굳어 있어야** 한다 — 보스가 칼을 든 채 버티는
       그 순간이 예고다. 나머지 일회 동작은 끝나면 기본 자세로 돌아간다. */
    if (e.action === actions.wind) { H.burst = null; H.held = 'wind'; return; }
    if (!H.burst || e.action !== actions[H.burst]) return;
    backToBase(H, 0.16);
  };
  mixer.addEventListener('finished', finished);
  LIVE++;
  return group;
}

/* ---------------------------------------------------------------- 상태 → 동작 */
/* 보스 상태는 게임이 'boss:<상태>' 로 넘긴다. 예비(굳는 자세)와 내려베기를 나눠 받는다. */
const BOSS_WIND = { telegraph: 1, wind: 1, volleyTele: 1, slamTele: 1, mimicTele: 1, chant: 1, seal: 1, sealing: 1, kiai: 1, clash: 1, shuffle: 1 };
const BOSS_STRIKE = { charge: 1, strike: 1, slam: 1, mimicCharge: 1, clones: 0, veil: 0 };
const BOSS_HIT = { stun: 1, groggy: 1 };

function planFor(H, st) {
  if (H.species === 'boss') {
    const bs = st.indexOf('boss:') === 0 ? st.slice(5) : st;
    if (BOSS_HIT[bs]) return { base: 'idle', burst: 'hit' };
    if (BOSS_STRIKE[bs]) return { base: 'walk', burst: 'strike' };
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
  H.speed += (sp - H.speed) * Math.min(1, dt * 10);

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
  /* v0.47 — 창현님 지적 "몬스터들이 걷는 모션이 없네 다리가 가만히 있네".
     느린 원귀는 실측 속도가 0.45m/s 아래로 떨어지는 순간(공격 예비 0.22배·지형 감속·무리 밀집)이
     잦아 idle 로 떨어졌다. 게임이 걷기 상태를 넘기면 **속도와 무관하게** 걷는다 — 얼음(frozen)·
     경직(hit)·공격(attack) 같은 '몸이 멈춘' 상태만 예외다. */
  const walkingState = (st === 'walk' || st === 'burning' || st === 'poisoned' || st === 'chase');
  const wantBase = plan.base || ((walkingState || H.speed > 0.45) ? 'walk' : 'idle');
  if (!H.burst && !H.held && wantBase !== H.base && H.actions[wantBase]) {
    crossFade(H, H.base, wantBase, 0.18);
    H.base = wantBase;
  }
  /* 같은 상태가 여러 프레임 이어져도 일회 동작은 한 번만 — 상태가 새로 들어올 때만 시작한다. */
  if (plan.burst) {
    if (plan.burst !== H.prevBurst && H.held !== plan.burst) startBurst(H, plan.burst, plan.burst === 'hit' ? 0.05 : 0.09);
  } else if (H.held) {
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
  if (H.actions.walk) H.actions.walk.setEffectiveTimeScale(Math.max(0.55, Math.min(1.9, 0.75 + H.speed * 0.35)));

  /* v0.48 무게감 — 클립 위에 절차적으로 얹는 '살아 있는' 층:
     ① 걷기 위상에 맞춘 골반·가슴 좌우 흔들림과 어깨 반동(상체가 통째로 고정된 판처럼 보이지 않게),
     ② 공격 예비에서 상체를 젖혔다가 타격에 실리는 오버슈트(완급),
     ③ 추적 중 머리의 미세한 끄덕임. */
  H.walkT = (H.walkT || 0) + dt * (H.base === 'walk' ? (0.85 + H.speed * 0.4) : 0.35);
  const wAmp = H.base === 'walk' ? Math.min(1.15, 0.4 + H.speed * 0.5) : 0.15;
  const ph = H.walkT * 2.5;
  const sway = Math.sin(ph) * 0.06 * wAmp;
  const bob = Math.cos(ph * 2) * 0.032 * wAmp;
  if (H.bones.pelvis) H.bones.pelvis.rotateZ(sway * 0.9);
  if (H.bones.spine) H.bones.spine.rotateZ(sway * 0.4);
  if (H.bones.chest) { H.bones.chest.rotateZ(-sway * 0.85); H.bones.chest.rotateX(bob); }
  if (H.bones.head) { H.bones.head.rotateZ(sway * 0.55); H.bones.head.rotateX(-bob * 0.6); }
  if (H.bones.upperarmL) H.bones.upperarmL.rotateX(sway * 1.25);
  if (H.bones.upperarmR) H.bones.upperarmR.rotateX(-sway * 1.25);
  /* 공격 완급: 예비(젖힘) → 타격(몸이 실림) — 클립의 키 위에 작게 겹쳐 맛을 낸다. */
  if (H.burst === 'attack') {
    const a = H.actions.attack;
    const u = a ? Math.min(1, a.time / (a.getClip().duration || 0.55)) : 0;
    const wind = u < 0.22 ? (u / 0.22) : Math.max(0, 1 - (u - 0.22) / 0.18);
    const hit = u >= 0.22 && u < 0.42 ? 1 - (u - 0.22) / 0.20 : 0;
    if (H.bones.chest) H.bones.chest.rotateX(-wind * 0.10 + hit * 0.13);
    if (H.bones.spine) H.bones.spine.rotateX(-wind * 0.06 + hit * 0.08);
  }
  H.t += dt;
  return true;
}


/* 망토·자락·부적끈: 2차 지연 스프링(프레임률 무관). */
function spring(st, key, target, dt, k, damp) {
  const s = st[key] || (st[key] = { v: 0, x: target });
  s.v += ((target - s.x) * k - s.v * damp) * dt;
  s.x += s.v * dt;
  return s.x;
}
function applyCloth(H, dt) {
  const spec = SPECS[H.species];
  if (!spec || !spec.cloth) return;
  const blow = Math.min(0.55, H.speed * 0.07);
  Object.keys(spec.cloth).forEach(function (name) {
    const b = H.bones[name];
    if (!b) return;
    const prm = spec.cloth[name];
    const lag = prm[1];
    const tgt = prm[0] * (0.35 + blow * 1.6) + 0.02 * Math.sin(H.t * 1.7 + lag * 2.1);
    const a = spring(H.cloth, name, tgt, dt, 34 - lag * 3, 8.6);
    b.rotation.x = a;
    b.rotation.z = Math.sin(H.t * 1.5 + lag * 1.7) * 0.02;
  });
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
