/* v2/js/inkfloor.js — v0.43 '일체형 수묵 지형 바닥'.
   창현님 목표(@coldmountainlab): 바닥이 '작은 돌판·풀 조각을 흩뿌린 무대'가 아니라
   **한 폭의 수묵 그림**으로 읽혀야 한다. 그래서 v0.41 의 판석 격자 흩뿌리기를 버리고
   월드 좌표에 **이어서 그린 지형**을 깐다.

   구성(창 전체에 한 번 깔리고, 창이 움직이면 좌표만 다시 쓴다):
     1) 바탕     : 따뜻한 한지(hanji.png). 어두운 흙 대신 1~3막 기본 톤.
     2) 물길     : 월드 곡선 X(z) 를 따라 흐르는 강물 띠(water.png, 가장자리는 알파로 스며든다).
                   장마다 폭·위치가 달라 청크를 넘어가도 끊기지 않는다.
     3) 다진 길  : 물길 옆을 따라가는 흙길 띠(earth.png) + 그 위에 깐 돌길 판석.
     4) 번짐 얼룩: wash.png 를 넓게 깔아 바탕이 균일한 벽지처럼 보이지 않게 한다.
     5) 장식      : 눈밭(6장)·심연(9~12장) 패치, 이끼·풀잎 카드(옛 카드 재사용, 밀도 하향).
   모두 월드 시드로 고정 → 같은 자리로 돌아오면 같은 그림. */
import * as THREE from 'three';

const BASE = new URL('../assets/diorama/ground/', import.meta.url).href;
const OLDBASE = new URL('../assets/diorama/floor/', import.meta.url).href;

const SLAB_N = 6;
const PAVE_N = 4;
const CARDS = ['grass_a', 'grass_b', 'grass_c', 'pebble_a', 'pebble_b', 'moss_a', 'moss_b', 'leaf_a', 'leaf_b', 'straw', 'sprout'];
const GROUND_FILES = {
  hanji: 'hanji.png', earth: 'earth.png', water: 'water.png', dock: 'dock.png',
  snow: 'snow.png', abyss: 'abyss.png', wash: 'wash.png'
};
const FILES = (function () {
  const o = {};
  Object.keys(GROUND_FILES).forEach(function (k) { o[k] = BASE + GROUND_FILES[k]; });
  o.soil = OLDBASE + 'soil.png';
  for (let i = 0; i < PAVE_N; i++) { o['pave' + i] = BASE + 'pave_' + i + '.png'; }
  for (let i = 0; i < SLAB_N; i++) { o['slab' + i] = OLDBASE + 'slab_' + i + '.png'; o['slabN' + i] = OLDBASE + 'slab_' + i + '_n.png'; }
  CARDS.forEach(function (k) { o[k] = OLDBASE + k + '.png'; });
  return o;
})();

export const tex = {};
const state = { started: false, ready: false, ms: 0, fail: [] };

function load(url) {
  return new Promise(function (res) {
    const img = new Image();
    img.decoding = 'async';
    let done = false;
    const fin = function (ok) { if (done) return; done = true; res(ok ? img : null); };
    img.onload = function () { fin(true); };
    img.onerror = function () { fin(false); };
    img.src = url;
    if (img.decode) img.decode().then(function () { fin(true); }, function () {});
  });
}
function mk(img, linear, repeat) {
  const t = new THREE.Texture(img);
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.needsUpdate = true;
  return t;
}

let p = null;
export function preloadFloor() {
  if (p) return p;
  state.started = true;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  p = Promise.all(Object.keys(FILES).map(function (k) {
    return load(FILES[k]).then(function (img) {
      if (!img) { state.fail.push(k); return; }
      const rep = true;
      tex[k] = mk(img, k.indexOf('slabN') === 0, rep);
    });
  })).then(function () {
    state.ready = !!(tex.hanji && tex.pave0) && state.fail.filter(function (f) { return GROUND_FILES[f] || f === 'pave0'; }).length === 0;
    state.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    try {
      if (window.console && console.info) {
        console.info('[심안] 지형 바닥 ' + Object.keys(tex).length + '장 · ' + state.ms + 'ms' + (state.fail.length ? ' · 실패 ' + state.fail.join(',') : ''));
      }
    } catch (e) {}
    return state;
  });
  return p;
}
export function floorReady() { return !!(state.ready && tex.pave0); }
export function floorInfo() { return { ready: state.ready, n: Object.keys(tex).length, ms: state.ms, fail: state.fail.slice() }; }
try { preloadFloor(); } catch (e) {}

/* ---------- 시드 해시 ---------- */
function h2(i, j, s) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/* 부드러운 1D 값 노이즈 — 물길·길 곡선을 자연스럽게 흔든다(청크 경계에서도 이어진다). */
function n1(x, s) {
  const i = Math.floor(x), f = x - i;
  const a = h2(i, 0, s), b = h2(i + 1, 0, s);
  const t = f * f * (3 - 2 * f);
  return a * (1 - t) + b * t;
}
function knob(k, d) {
  try {
    const v = parseFloat(new URLSearchParams(location.search).get(k));
    return isFinite(v) ? v : d;
  } catch (e) { return d; }
}

/* ---------- 장(청크) 테마 ----------
   kind 가 물·눈·심연·번짐의 양을 정한다. world 좌표 곡선이라 청크를 넘어도 이어진다. */
export const THEME = {
  1: { name: '저잣거리', water: 7.0, waterOff: 6, path: 1, wash: 0.75, moss: 0.30, stone: 0.16, snow: 0, abyss: 0 },
  2: { name: '성문 길', water: 5.0, waterOff: 13, path: 1, wash: 0.55, moss: 0.16, stone: 0.22, snow: 0, abyss: 0 },
  3: { name: '대숲 길', water: 4.2, waterOff: 4, path: 1, wash: 0.65, moss: 0.62, stone: 0.12, snow: 0, abyss: 0 },
  4: { name: '붉은 달', water: 6.0, waterOff: 9, path: 1, wash: 0.80, moss: 0.24, stone: 0.18, snow: 0, abyss: 0 },
  5: { name: '안개 산길', water: 5.4, waterOff: 3, path: 1, wash: 0.90, moss: 0.45, stone: 0.20, snow: 0, abyss: 0 },
  6: { name: '설산', water: 3.6, waterOff: 15, path: 1, wash: 0.40, moss: 0.08, stone: 0.14, snow: 1.0, abyss: 0 },
  7: { name: '고목 골', water: 3.2, waterOff: 5, path: 1, wash: 0.70, moss: 0.55, stone: 0.16, snow: 0.15, abyss: 0 },
  8: { name: '무명 산문', water: 4.4, waterOff: 11, path: 1, wash: 0.85, moss: 0.30, stone: 0.26, snow: 0.2, abyss: 0 },
  9: { name: '혈월', water: 5.0, waterOff: 7, path: 1, wash: 0.85, moss: 0.06, stone: 0.18, snow: 0, abyss: 0.75 },
  10: { name: '재의 벌', water: 3.0, waterOff: 14, path: 1, wash: 0.60, moss: 0.10, stone: 0.20, snow: 0.35, abyss: 0.35 },
  11: { name: '붉은 강', water: 6.4, waterOff: 2, path: 1, wash: 0.80, moss: 0.04, stone: 0.16, snow: 0, abyss: 0.55 },
  12: { name: '나락', water: 4.0, waterOff: 16, path: 1, wash: 0.90, moss: 0.02, stone: 0.14, snow: 0, abyss: 1.0 }
};
export function themeOf(stageId) { return THEME[stageId] || THEME[1]; }

/* 월드 곡선 — 물길과 길. 장마다 위상을 달리해 같은 곡선이 반복되지 않는다. */
function riverX(z, s) {
  return Math.sin(z * 0.038 + s * 1.7) * 5.5 + Math.sin(z * 0.011 + s * 0.9) * 2.6 + (s * 3.1 % 7) - 3.5;
}
function pathX(z, s) {
  return riverX(z + 6, s) + 8.2 + Math.sin(z * 0.031 + s * 2.3) * 2.4;
}

/* 가장자리를 부드럽게 지우는 재질 패치(띠 geometry 의 u 방향 양끝). */
function softEdgeU(mat, lo, hi) {
  mat.transparent = true;
  mat.depthWrite = false;
  mat.onBeforeCompile = function (sh) {
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>',
      '#include <alphamap_fragment>\n' +
      '  diffuseColor.a *= smoothstep(0.0, ' + lo.toFixed(3) + ', vMapUv.x) * smoothstep(1.0, ' + (1 - hi).toFixed(3) + ', vMapUv.x);');
  };
  mat.customProgramCacheKey = function () { return 'inkfloorEdge' + lo + '_' + hi; };
  return mat;
}

/* 띠 하나(곡선을 따라가는 폭 W 의 면). step 간격으로 표본을 잡는다. */
function ribbonGeo(x0, z0, x1, z1, fx, width, step, y) {
  const yy = y == null ? 0.02 : y;
  const zs = [];
  const za = z0 - 3, zb = z1 + 3;
  for (let z = za; z <= zb + 1e-6; z += step) zs.push(z);
  const n = zs.length;
  const pos = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  const idx = [];
  for (let i = 0; i < n; i++) {
    const z = zs[i];
    const cx = fx(z);
    const tangent = (fx(z + 0.5) - fx(z - 0.5)) / 1.0;
    const nx = 1 / Math.sqrt(1 + tangent * tangent);
    const nz = -tangent / Math.sqrt(1 + tangent * tangent);
    const hw = width * 0.5;
    pos[i * 6] = cx - nx * hw; pos[i * 6 + 1] = yy; pos[i * 6 + 2] = z - nz * hw;
    pos[i * 6 + 3] = cx + nx * hw; pos[i * 6 + 4] = yy; pos[i * 6 + 5] = z + nz * hw;
    uv[i * 4] = 0; uv[i * 4 + 1] = z / 6; uv[i * 4 + 2] = 1; uv[i * 4 + 3] = z / 6;
    if (i < n - 1) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const CELL = 1.62;
const CARD_CELL = 2.6;

/** 일체형 지형 레이어를 만든다. 창(window) 전체를 덮는 그룹을 돌려준다. */
export function createFloorLayer(opts) {
  opts = opts || {};
  const stageId = opts.stageId || 1;
  const T = themeOf(stageId);
  const s = (stageId * 1.37) % 97;
  const group = new THREE.Group();
  group.name = 'groundLayer';
  const materials = [];
  if (!floorReady()) return { group: group, materials: materials, layout: function () {}, dispose: function () { group.removeFromParent(); }, ready: false };

  const bright = knob('floorBright', 1.0);
  const act = stageId <= 4 ? 1 : (stageId <= 8 ? 2 : 3);
  /* 막별 종이 톤 — 1막 따뜻한 황토, 2막 안개 낀 회청, 3막 핏빛 도는 갈색. */
  const TINT = { 1: [1.0, 0.955, 0.865], 2: [0.955, 0.975, 1.0], 3: [1.0, 0.9, 0.84] }[act];
  /* TINT 는 '화면에서 보는 색'(sRGB) — three 의 작업 공간(linear)으로 바꿔 넣는다. */
  const tcol = function (k) { return new THREE.Color().setRGB(TINT[0] * k, TINT[1] * k, TINT[2] * k, THREE.SRGBColorSpace); };
  const srgb = function (r, g, b) { return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace); };

  /* ---------- 1) 바탕 흙(길 밑) · 물길 · 다진 길 띠 ---------- */
  const waterMat = new THREE.MeshStandardMaterial({
    map: tex.water, color: tcol(0.62), roughness: 0.42, metalness: 0.0,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.95
  });
  waterMat.userData.cardProfile = 'ground';
  materials.push(waterMat);
  const waterMesh = new THREE.Mesh(new THREE.BufferGeometry(), waterMat);
  waterMesh.renderOrder = 0.6;
  waterMesh.receiveShadow = false;
  waterMesh.frustumCulled = false;
  group.add(waterMesh);

  const pathMat = softEdgeU(new THREE.MeshStandardMaterial({
    map: tex.earth, color: tcol(0.80), roughness: 0.96, metalness: 0.0, transparent: true, depthWrite: false
  }), 0.10, 0.10);
  pathMat.userData.cardProfile = 'ground';
  materials.push(pathMat);
  const pathMesh = new THREE.Mesh(new THREE.BufferGeometry(), pathMat);
  pathMesh.renderOrder = 0.5;
  pathMesh.frustumCulled = false;
  group.add(pathMesh);

  /* ---------- 1b) 나루터 잔교 (물가) ---------- */
  let dockMesh = null;
  if (tex.dock) {
    const dm = new THREE.MeshStandardMaterial({
      map: tex.dock, transparent: true, alphaTest: 0.35, depthWrite: true,
      roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide, color: tcol(0.98)
    });
    dm.userData.cardProfile = 'ground';
    materials.push(dm);
    dockMesh = new THREE.InstancedMesh(paveGeoShared(), dm, 16);
    dockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    dockMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16 * 3).fill(1), 3);
    dockMesh.frustumCulled = false;
    dockMesh.count = 0;
    dockMesh.renderOrder = 0.66;
    dockMesh.receiveShadow = true;
    group.add(dockMesh);
  }

  /* ---------- 2) 번짐 얼룩 · 눈밭 · 심연 패치 (인스턴스 3배치) ---------- */
  const patchGeo = new THREE.PlaneGeometry(1, 1);
  patchGeo.rotateX(-Math.PI / 2);
  const patchMats = {};
  const patchMeshes = {};
  [['wash', 26, 0.55], ['snow', 14, 0.16], ['abyss', 10, 0.14]].forEach(function (d) {
    const key = d[0];
    if (!tex[key]) return;
    const m = new THREE.MeshStandardMaterial({
      map: tex[key], transparent: true, depthWrite: false, side: THREE.DoubleSide,
      roughness: 0.94, metalness: 0.0, color: tcol(key === 'snow' ? 1.0 : key === 'wash' ? 1.0 : 0.85)
    });
    m.userData.cardProfile = 'ground';
    patchMats[key] = m;
    materials.push(m);
    const mesh = new THREE.InstancedMesh(patchGeo, m, 64);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3).fill(1), 3);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = d[2];
    mesh.receiveShadow = true;
    group.add(mesh);
    patchMeshes[key] = mesh;
  });

  /* ---------- 3) 길 돌(유기적 강돌) ---------- */
  const paveGeo = new THREE.PlaneGeometry(1, 1);
  paveGeo.rotateX(-Math.PI / 2);
  const paveMat = [];
  const paveMesh = [];
  for (let i = 0; i < PAVE_N; i++) {
    if (!tex['pave' + i]) continue;
    const m = new THREE.MeshStandardMaterial({
      map: tex['pave' + i], roughness: 0.96, metalness: 0.0,
      transparent: true, alphaTest: 0.42, depthWrite: true, color: tcol(0.52)
    });
    m.userData.inkGround = true;
    m.userData.cardProfile = 'ground';
    paveMat.push(m);
    materials.push(m);
    const mesh = new THREE.InstancedMesh(paveGeo, m, 1400);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1400 * 3).fill(1), 3);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 0.72;
    group.add(mesh);
    paveMesh.push(mesh);
  }

  /* ---------- 4) 풀잎·이끼·조약돌 카드 (밀도 하향, 물가·번짐 둘레에 몰아서) ---------- */
  const uprightGeo = new THREE.PlaneGeometry(1, 1);
  const flatGeo = new THREE.PlaneGeometry(1, 1);
  flatGeo.rotateX(-Math.PI / 2);
  const cardMat = {};
  const cardMesh = {};
  const UPRIGHT = { grass_a: 1, grass_b: 1, grass_c: 1, sprout: 1 };
  CARDS.forEach(function (k) {
    if (!tex[k]) return;
    const m = new THREE.MeshStandardMaterial({
      map: tex[k], transparent: true, alphaTest: 0.34, side: THREE.DoubleSide,
      roughness: 0.95, metalness: 0.0, depthWrite: true, color: tcol(1.0)
    });
    m.userData.cardProfile = UPRIGHT[k] ? 'paper' : 'ground';
    cardMat[k] = m;
    materials.push(m);
    const mesh = new THREE.InstancedMesh(UPRIGHT[k] ? uprightGeo : flatGeo, m, 220);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(220 * 3).fill(1), 3);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = UPRIGHT[k] ? 1.2 : 0.95;
    group.add(mesh);
    cardMesh[k] = mesh;
  });

  const _d = new THREE.Object3D();
  const _c = new THREE.Color();
  function paveGeoShared() {
    if (!paveGeoShared.g) {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      paveGeoShared.g = g;
    }
    return paveGeoShared.g;
  }

  function layout(x0, z0, x1, z1) {
    /* 물길 · 다진 길 */
    const wW = T.water || 0;
    if (wW > 0) {
      const g = ribbonGeo(x0, z0, x1, z1, function (z) { return riverX(z, s) + T.waterOff; }, wW, 2.0, 0.026);
      waterMesh.geometry.dispose();
      waterMesh.geometry = g;
      waterMesh.visible = true;
    } else if (waterMesh.visible) {
      waterMesh.visible = false;
    }
    if (T.path) {
      const g2 = ribbonGeo(x0, z0, x1, z1, function (z) { return pathX(z, s); }, 4.6, 2.2, 0.014);
      pathMesh.geometry.dispose();
      pathMesh.geometry = g2;
      pathMesh.visible = true;
    }

    /* 나루터 잔교: 물가에 16m 간격으로. 긴 축이 물을 향한다. */
    if (dockMesh) {
      let nd = 0;
      if (T.water > 0) {
        const zA2 = Math.floor((z0 - 8) / 16) * 16, zB2 = z1 + 12;
        for (let z = zA2; z <= zB2 && nd < 16; z += 16) {
          if (h2(Math.round(z), 3, stageId * 19 + 7) > 0.72) continue;
          const side = h2(Math.round(z), 5, stageId + 13) < 0.5 ? -1 : 1;
          const rx = riverX(z, s) + T.waterOff;
          const tz = (riverX(z + 0.5, s) - riverX(z - 0.5, s));
          const nx = 1 / Math.sqrt(1 + tz * tz), nz = -tz / Math.sqrt(1 + tz * tz);
          const off = T.water * 0.5 * 0.55 + 1.6;
          const x = rx + nx * off * side, zz = z + nz * off * side;
          _d.position.set(x, 0.02, zz);
          /* 긴 축(로컬 +z)이 물 쪽(-side 방향)을 향하도록 회전 */
          _d.rotation.set(0, Math.atan2(-nx * side, -nz * side), 0);
          _d.scale.set(1.9, 1, 4.4);
          _d.updateMatrix();
          dockMesh.setMatrixAt(nd, _d.matrix);
          _c.copy(srgb(1, 1, 1));
          dockMesh.setColorAt(nd, _c);
          nd++;
        }
      }
      dockMesh.count = nd;
      dockMesh.instanceMatrix.needsUpdate = true;
      if (dockMesh.instanceColor) dockMesh.instanceColor.needsUpdate = true;
      dockMesh.visible = nd > 0;
    }

    /* 길 돌: 길을 따라 촘촘히 깔고, 나머지 바닥에는 아주 드물게. */
    const cap = paveMesh.map(function () { return 0; });
    function putPave(x, z, rot, sc, tone, t) {
      const m = paveMesh[t];
      if (!m || cap[t] >= 1400) return;
      _d.position.set(x, 0.013 + h2(Math.round(x * 4), Math.round(z * 4), stageId + 17) * 0.004, z);
      _d.rotation.set(0, rot, 0);
      _d.scale.set(sc, 1, sc);
      _d.updateMatrix();
      m.setMatrixAt(cap[t], _d.matrix);
      _c.copy(srgb(TINT[0] * tone, TINT[1] * tone, TINT[2] * tone));
      m.setColorAt(cap[t], _c);
      cap[t]++;
    }
    const zA = Math.floor((z0 - 2) / 1.15) * 1.15, zB = z1 + 2;
    for (let z = zA; z <= zB; z += 1.15) {
      const px = pathX(z, s);
      const tz = (pathX(z + 0.5, s) - pathX(z - 0.5, s));
      const nx = 1 / Math.sqrt(1 + tz * tz), nz = -tz / Math.sqrt(1 + tz * tz);
      for (let col = -1; col <= 1; col += 2) {
        const r = h2(Math.round(z * 10), col + 7, stageId * 13 + 5);
        if (r > 0.90) continue;
        const off = col * 0.62 + (h2(col, Math.round(z * 10), stageId + 3) - 0.5) * 0.30;
        const x = px + nx * off, zz = z + nz * off;
        putPave(x, zz, h2(Math.round(x * 8), Math.round(zz * 8), stageId + 9) * Math.PI * 2,
          1.10 + r * 0.42, 0.94 + r * 0.16, (h2(Math.round(z * 10), col, stageId + 11) * PAVE_N) | 0);
      }
    }
    /* 흩어진 돌 — 드물게, 물가·길가에만 */
    const i0 = Math.floor((x0 - 2) / CELL), i1 = Math.ceil((x1 + 2) / CELL);
    const j0 = Math.floor((z0 - 2) / CELL), j1 = Math.ceil((z1 + 2) / CELL);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const r0 = h2(i, j, stageId * 31 + 7);
        if (r0 > (T.stone || 0.16) * 0.42) continue;
        const x = (i + 0.5 + (h2(i, j, stageId + 3) - 0.5) * 0.55) * CELL;
        const z = (j + 0.5 + (h2(i, j, stageId + 5) - 0.5) * 0.55) * CELL;
        if (Math.abs(x - pathX(z, s)) < 2.2) continue;   /* 길 위는 이미 깔았다 */
        if (T.water > 0 && Math.abs(x - (riverX(z, s) + T.waterOff)) < T.water * 0.5) continue;
        const t = (h2(i + 1, j - 2, stageId * 31 + 11) * PAVE_N) | 0;
        putPave(x, z, h2(i, j, stageId + 9) * 6.283, 0.70 + r0 * 2.6, 0.90 + h2(i, j, stageId + 19) * 0.18, t);
      }
    }
    for (let t = 0; t < paveMesh.length; t++) {
      const m = paveMesh[t];
      m.count = cap[t];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.visible = cap[t] > 0;
    }

    /* 번짐 얼룩 · 눈밭 · 심연 패치 — 월드 격자에 시드로 */
    const cells = { wash: [6.5, Math.min(1.0, T.wash * 1.15), 6, 11], snow: [7, T.snow, 9, 13], abyss: [10, T.abyss, 8, 17] };
    Object.keys(cells).forEach(function (k) {
      const mesh = patchMeshes[k];
      if (!mesh) return;
      const spec = cells[k];
      const cell = spec[0], density = spec[1];
      let n = 0;
      const a0 = Math.floor((x0 - cell) / cell), a1 = Math.ceil((x1 + cell) / cell);
      const b0 = Math.floor((z0 - cell) / cell), b1 = Math.ceil((z1 + cell) / cell);
      for (let b = b0; b <= b1; b++) {
        for (let a = a0; a <= a1; a++) {
          const r = h2(a, b, stageId * 71 + spec[2] + k.length);
          if (r > density) continue;
          if (n >= 60) break;
          const x = (a + 0.5 + (h2(a, b, stageId + 23) - 0.5) * 0.6) * cell;
          const z = (b + 0.5 + (h2(a, b, stageId + 29) - 0.5) * 0.6) * cell;
          if (k === 'abyss' && T.water > 0 && Math.abs(x - (riverX(z, s) + T.waterOff)) < T.water * 0.6) continue;
          const sc = cell * (1.35 + h2(a, b, stageId + 31) * 1.05);
          _d.position.set(x, 0.010 + (k === 'snow' ? 0.006 : k === 'abyss' ? 0.004 : 0.0), z);
          _d.rotation.set(0, h2(a, b, stageId + 37) * Math.PI * 2, 0);
          _d.scale.set(sc, 1, sc);
          _d.updateMatrix();
          mesh.setMatrixAt(n, _d.matrix);
          const tone = 0.82 + h2(a, b, stageId + 41) * 0.3;
          _c.copy(srgb(TINT[0] * tone, TINT[1] * tone, TINT[2] * tone));
          mesh.setColorAt(n, _c);
          n++;
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = n > 0;
    });

    /* 카드: 풀잎은 길 밖, 물가·바위 둘레에 몰아서. 예전보다 40% 정도만. */
    const caps = {};
    CARDS.forEach(function (k) { caps[k] = 0; });
    const k0 = Math.floor((x0 - 2) / CARD_CELL), k1 = Math.ceil((x1 + 2) / CARD_CELL);
    const l0 = Math.floor((z0 - 2) / CARD_CELL), l1 = Math.ceil((z1 + 2) / CARD_CELL);
    for (let l = l0; l <= l1; l++) {
      for (let k = k0; k <= k1; k++) {
        const r = h2(k, l, stageId * 17 + 3);
        if (r > 0.62 * (0.6 + (T.moss || 0.3))) continue;
        const px = (k + 0.2 + h2(k, l, stageId + 41) * 0.6) * CARD_CELL;
        const pz = (l + 0.2 + h2(k, l, stageId + 43) * 0.6) * CARD_CELL;
        if (Math.abs(px - pathX(pz, s)) < 2.2) continue;
        if (T.water > 0 && Math.abs(px - (riverX(pz, s) + T.waterOff)) < T.water * 0.55) continue;
        const pick = h2(k, l, stageId * 17 + 29);
        let kind;
        if (pick < 0.40) kind = pick < 0.20 ? 'grass_a' : (pick < 0.32 ? 'grass_b' : 'grass_c');
        else if (pick < 0.56) kind = pick < 0.48 ? 'pebble_a' : 'pebble_b';
        else if (pick < 0.74) kind = pick < 0.66 ? 'moss_a' : 'moss_b';
        else if (pick < 0.90) kind = pick < 0.82 ? 'leaf_a' : 'leaf_b';
        else if (pick < 0.96) kind = 'straw';
        else kind = 'sprout';
        const mesh = cardMesh[kind];
        if (!mesh || caps[kind] >= 220) continue;
        const sz = 0.30 + h2(k, l, stageId + 47) * 0.36;
        const rot = h2(k, l, stageId + 53) * Math.PI * 2;
        const tone = 0.86 + h2(k, l, stageId + 59) * 0.24;
        if (UPRIGHT[kind]) {
          _d.position.set(px, 0.014, pz);
          _d.rotation.set(0, Math.PI * 0.25 + (h2(k, l, stageId + 61) - 0.5) * 1.1, 0);
          _d.scale.set(sz * 1.05, sz * 1.05, 1);
        } else {
          _d.position.set(px, 0.016 + h2(k, l, stageId + 67) * 0.004, pz);
          _d.rotation.set(0, rot, 0);
          _d.scale.set(sz * 1.5, 1, sz * 1.5);
        }
        _d.updateMatrix();
        mesh.setMatrixAt(caps[kind], _d.matrix);
        _c.copy(srgb(TINT[0] * tone, TINT[1] * tone, TINT[2] * tone));
        mesh.setColorAt(caps[kind], _c);
        caps[kind]++;
      }
    }
    CARDS.forEach(function (kk) {
      const mesh = cardMesh[kk];
      if (!mesh) return;
      mesh.count = caps[kk];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = caps[kk] > 0;
    });
  }

  return {
    group: group, materials: materials, layout: layout, ready: true, theme: T,
    dispose: function () {
      group.traverse(function (o) { if (o.isInstancedMesh) o.dispose(); if (o.isMesh && o.geometry) o.geometry.dispose(); });
      paveGeo.dispose(); patchGeo.dispose(); uprightGeo.dispose(); flatGeo.dispose();
      materials.forEach(function (m) { m.dispose(); });
      group.removeFromParent();
    }
  };
}

/** 바탕면 텍스처(청크 지면 쿼드가 쓴다). 없으면 null. */
export function soilTexture() { return tex.hanji || tex.soil || null; }
export function hanjiTexture() { return tex.hanji || null; }
