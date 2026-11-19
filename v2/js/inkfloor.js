/* v2/js/inkfloor.js — v0.41 Papertrails식 '종이 판석 마당' 바닥 레이어.
   refs/papertrails 의 바닥 원리(종이 섬유 · 시트별 톤 · 다이컷 단면 · 겹친 종이 판)를 따른다.

   구성(청크 창 전체에 한 번 깔린다 — 청크마다 따로 만들지 않는다):
     1) 바탕 흙(soil) : 24m 청크마다 한 장. 판석 사이 틈으로 보이는 젖은 흙 + 종이 섬유.
     2) 판석 6종      : 월드 격자(1.55m)에 씨드로 흩뿌린 InstancedMesh. 판마다 톤·회전·크기가 달라
                        같은 무늬가 반복되지 않고, 종류별로 한 번에 그린다(6 드로우콜).
     3) 작은 카드      : 풀잎(선 채로)·조약돌·이끼·낙엽·지푸라기·새싹. 소품과 같은 크림 단면을 가진
                        종이 카드라 정자·소나무·등불과 한 물성으로 읽힌다.
   모두 cardstock 패치(시트 톤·랩 라이팅·월드 안개)를 그대로 통과한다.
   에셋이 하나라도 없으면 floorReady()=false → inkchunks 가 기존 512 판석으로 폴백한다. */
import * as THREE from 'three';

const BASE = new URL('../assets/diorama/floor/', import.meta.url).href;
const SLAB_N = 6;
const CARDS = ['grass_a', 'grass_b', 'grass_c', 'pebble_a', 'pebble_b', 'moss_a', 'moss_b', 'leaf_a', 'leaf_b', 'straw', 'sprout'];
const FILES = (function () {
  const o = { soil: 'soil.png' };
  for (let i = 0; i < SLAB_N; i++) { o['slab' + i] = 'slab_' + i + '.png'; o['slabN' + i] = 'slab_' + i + '_n.png'; }
  CARDS.forEach(function (k) { o[k] = k + '.png'; });
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
function mk(img, linear) {
  const t = new THREE.Texture(img);
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

let p = null;
export function preloadFloor() {
  if (p) return p;
  state.started = true;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  p = Promise.all(Object.keys(FILES).map(function (k) {
    return load(BASE + FILES[k]).then(function (img) {
      if (!img) { state.fail.push(k); return; }
      tex[k] = mk(img, k.indexOf('slabN') === 0);
    });
  })).then(function () {
    state.ready = state.fail.length === 0;
    state.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    try {
      if (window.console && console.info) {
        console.info('[심안] 바닥 판석 ' + Object.keys(tex).length + '장 · ' + state.ms + 'ms' + (state.fail.length ? ' · 실패 ' + state.fail.join(',') : ''));
      }
    } catch (e) {}
    return state;
  });
  return p;
}
export function floorReady() { return !!(state.ready && tex.slab0); }
export function floorInfo() { return { ready: state.ready, n: Object.keys(tex).length, ms: state.ms, fail: state.fail.slice() }; }
try { preloadFloor(); } catch (e) {}

/* ---------- 시드 해시(청크 시드와 같은 계열: 같은 자리는 늘 같은 판) ---------- */
function h2(i, j, s) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const CELL = 1.58;        /* 판석 격자 한 칸(m) */
const CARD_CELL = 2.35;   /* 작은 카드 격자 */

function knob(k, d) {
  try {
    const v = parseFloat(new URLSearchParams(location.search).get(k));
    return isFinite(v) ? v : d;
  } catch (e) { return d; }
}

/** 판석·카드 레이어 하나를 만든다. 창(window) 전체를 덮는 인스턴스 메시를 돌려준다. */
export function createFloorLayer(opts) {
  opts = opts || {};
  const stageId = opts.stageId || 1;
  const style = opts.style || { stone: [0.2, 0.2, 0.2], dirt: [0.1, 0.1, 0.1], moss: 0.2 };
  const group = new THREE.Group();
  group.name = 'floorLayer';
  const materials = [];
  const toneK = knob('floorTone', 1);
  if (!floorReady()) return { group: group, materials: materials, layout: function () {}, dispose: function () { group.removeFromParent(); }, ready: false };

  /* 판석 재질 6종 — map + 노멀. 판 하나가 약 1.4m. */
  const slabMat = [];
  const slabMesh = [];
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  for (let i = 0; i < SLAB_N; i++) {
    const m = new THREE.MeshStandardMaterial({
      map: tex['slab' + i], normalMap: tex['slabN' + i] || null,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.93, metalness: 0.0, color: 0xa9a196,
      dithering: true
    });
    m.userData.inkGround = true;
    m.userData.cardProfile = 'ground';
    if (tex['slabN' + i]) { tex['slabN' + i].colorSpace = THREE.NoColorSpace; }
    slabMat.push(m);
    materials.push(m);
    const mesh = new THREE.InstancedMesh(geo, m, 700);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(700 * 3).fill(1), 3);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 0;
    group.add(mesh);
    slabMesh.push(mesh);
  }

  /* 작은 카드 — 풀잎만 세로로 선 평면, 나머지는 바닥에 눕힌다. */
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
      roughness: 0.95, metalness: 0.0, depthWrite: true, color: 0xffffff
    });
    m.userData.cardProfile = UPRIGHT[k] ? 'paper' : 'ground';
    cardMat[k] = m;
    materials.push(m);
    const mesh = new THREE.InstancedMesh(UPRIGHT[k] ? uprightGeo : flatGeo, m, 260);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(260 * 3).fill(1), 3);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = UPRIGHT[k] ? 1.2 : 0.9;
    group.add(mesh);
    cardMesh[k] = mesh;
  });

  /* 장별 틴트: 그 장의 돌빛 방향을 40%만 남긴다(판 자체의 온기는 유지). */
  const st = style.stone;
  const mx = Math.max(1e-4, st[0], st[1], st[2]);
  const tint = [0.42 + 0.58 * (st[0] / mx), 0.42 + 0.58 * (st[1] / mx), 0.42 + 0.58 * (st[2] / mx)];
  const bright = knob('floorBright', 1.0);
  const _d = new THREE.Object3D();
  const _c = new THREE.Color();

  function layout(x0, z0, x1, z1) {
    const cap = [0, 0, 0, 0, 0, 0];
    const caps = {};
    CARDS.forEach(function (k) { caps[k] = 0; });
    const i0 = Math.floor(x0 / CELL) - 1, i1 = Math.ceil(x1 / CELL) + 1;
    const j0 = Math.floor(z0 / CELL) - 1, j1 = Math.ceil(z1 / CELL) + 1;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const r0 = h2(i, j, stageId * 31 + 7);
        if (r0 > 0.965) continue;                     /* 아주 드문 빈 칸(큰 흙 패임) */
        const t = (h2(i + 1, j - 2, stageId * 31 + 11) * SLAB_N) | 0;
        const n = slabMesh[t];
        if (cap[t] >= 700) continue;
        const jx = (h2(i, j, stageId + 3) - 0.5) * CELL * 0.16;
        const jz = (h2(i, j, stageId + 5) - 0.5) * CELL * 0.16;
        const rot = h2(i, j, stageId + 9) * Math.PI * 2;
        const sv = h2(i, j, stageId + 13);
        const sc = CELL * (sv < 0.14 ? 0.70 + sv * 1.2 : 1.06 + (sv - 0.14) * 0.22);
        const y = 0.004 + h2(i, j, stageId + 17) * 0.007;
        const tone = (0.80 + h2(i, j, stageId + 19) * 0.34) * bright;
        _d.position.set((i + 0.5) * CELL + jx, y, (j + 0.5) * CELL + jz);
        _d.rotation.set(0, rot, 0);
        _d.scale.set(sc, 1, sc * (0.94 + h2(i, j, stageId + 23) * 0.12));
        _d.updateMatrix();
        n.setMatrixAt(cap[t], _d.matrix);
        _c.setRGB(tint[0] * tone, tint[1] * tone, tint[2] * tone);
        n.setColorAt(cap[t], _c);
        cap[t]++;
      }
    }
    for (let t = 0; t < SLAB_N; t++) {
      const n = slabMesh[t];
      n.count = cap[t];
      n.instanceMatrix.needsUpdate = true;
      if (n.instanceColor) n.instanceColor.needsUpdate = true;
      n.visible = cap[t] > 0;
    }

    /* 작은 카드: 이끼는 장의 moss 값에 비례해 더 많이. */
    const mossBias = style.moss != null ? style.moss : 0.3;
    const k0 = Math.floor(x0 / CARD_CELL) - 1, k1 = Math.ceil(x1 / CARD_CELL) + 1;
    const l0 = Math.floor(z0 / CARD_CELL) - 1, l1 = Math.ceil(z1 / CARD_CELL) + 1;
    for (let l = l0; l <= l1; l++) {
      for (let k = k0; k <= k1; k++) {
        const r = h2(k, l, stageId * 17 + 3);
        if (r > 0.74) continue;
        const pick = h2(k, l, stageId * 17 + 29);
        let kind;
        if (pick < 0.30) kind = 'grass_a';
        else if (pick < 0.44) kind = 'grass_b';
        else if (pick < 0.52) kind = 'grass_c';
        else if (pick < 0.62) kind = 'pebble_a';
        else if (pick < 0.70) kind = 'pebble_b';
        else if (pick < 0.70 + 0.16 * (0.4 + mossBias)) kind = (pick < 0.74 ? 'moss_a' : 'moss_b');
        else if (pick < 0.90) kind = (pick < 0.84 ? 'leaf_a' : 'leaf_b');
        else if (pick < 0.96) kind = 'straw';
        else kind = 'sprout';
        const mesh = cardMesh[kind];
        if (!mesh) continue;
        if (caps[kind] >= 260) continue;
        const px = (k + 0.2 + h2(k, l, stageId + 41) * 0.6) * CARD_CELL;
        const pz = (l + 0.2 + h2(k, l, stageId + 43) * 0.6) * CARD_CELL;
        const s = 0.34 + h2(k, l, stageId + 47) * 0.40;
        const rot = h2(k, l, stageId + 53) * Math.PI * 2;
        const tone = 0.86 + h2(k, l, stageId + 59) * 0.26;
        if (UPRIGHT[kind]) {
          _d.position.set(px, 0.01, pz);
          _d.rotation.set(0, Math.PI * 0.25 + (h2(k, l, stageId + 61) - 0.5) * 1.1, 0);
          _d.scale.set(s * 1.05, s * 1.05, 1);
        } else {
          _d.position.set(px, 0.012 + h2(k, l, stageId + 67) * 0.004, pz);
          _d.rotation.set(0, rot, 0);
          _d.scale.set(s * 1.4, 1, s * 1.4);
        }
        _d.updateMatrix();
        mesh.setMatrixAt(caps[kind], _d.matrix);
        _c.setRGB(tint[0] * tone, tint[1] * tone, tint[2] * tone);
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
    group: group, materials: materials, layout: layout, ready: true,
    cardNames: CARDS.slice(),
    dispose: function () {
      group.traverse(function (o) { if (o.isInstancedMesh) o.dispose(); });
      geo.dispose(); uprightGeo.dispose(); flatGeo.dispose();
      materials.forEach(function (m) { m.dispose(); });
      group.removeFromParent();
    }
  };
}

/** 바탕 흙 텍스처(청크 지면 쿼드가 쓴다). 없으면 null. */
export function soilTexture() { return tex.soil || null; }
