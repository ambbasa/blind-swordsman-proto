/* 2.5D 입체 무대: 수묵 3D 소품·지형·조명.
   스테이지마다 장터/성문/대나무 골/붉은 달의 실루엣과 조명이 다르다.
   반복 소품은 InstancedMesh 로 묶어 드로우콜을 줄인다. */
import * as THREE from 'three';
import {
  groundSet, bambooSet, leafTexture, woodSet, plainSet, glowTexture, shadowTexture,
  panoramaTexture, inkVeilTexture, mulberry
} from './inkbake.js';

const TAU = Math.PI * 2;

/* ---------- 지오메트리 유틸 ---------- */
export function mergeGeo(list) {
  let vCount = 0, iCount = 0;
  list.forEach(function (g) {
    vCount += g.getAttribute('position').count;
    iCount += g.index ? g.index.count : g.getAttribute('position').count;
  });
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  list.forEach(function (g) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv');
    pos.set(p.array, vo * 3);
    if (n) nor.set(n.array, vo * 3);
    if (u) uv.set(u.array, vo * 2);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
      io += g.index.count;
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export function crossQuads() {
  const a = new THREE.PlaneGeometry(1, 1);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  const c = a.clone(); c.rotateX(Math.PI / 2);
  return mergeGeo([a, b, c]);
}

/* 부정형 바위: 정이십면체 꼭짓점을 시드로 밀어낸다. */
export function rockGeo(seed, detail) {
  const g = new THREE.IcosahedronGeometry(1, detail || 1);
  const rnd = mulberry(seed);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.68 + rnd() * 0.55;
    p.setXYZ(i, x * k, y * k * 0.72, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/* ---------- 재질 ---------- */
export function makeMaterials(stageId) {
  const stageTint = {
    1: [1.0, 0.96, 0.9], 2: [0.86, 0.93, 1.12], 3: [0.9, 1.06, 0.92], 4: [1.18, 0.82, 0.78],
    /* v0.23 제2막 안개 산사: 푸른 안개, 설산은 흰빛, 고목은 검푸름, 산문은 보랏빛 회색 */
    5: [0.78, 0.96, 1.02], 6: [0.9, 0.98, 1.16], 7: [0.84, 1.0, 0.84], 8: [0.94, 0.9, 1.06],
    /* 제3막 혈월의 나락: 검붉은 기운이 돌·나무·천에 스민다 */
    9: [1.3, 0.66, 0.66], 10: [1.18, 0.94, 0.8], 11: [1.36, 0.6, 0.62], 12: [1.46, 0.52, 0.56]
  }[stageId] || [1, 1, 1];
  function tint(c) { return new THREE.Color(c[0] * stageTint[0], c[1] * stageTint[1], c[2] * stageTint[2]); }
  const wood = woodSet().map;
  const bamboo = bambooSet();
  const M = {
    ground: null,
    rock: new THREE.MeshStandardMaterial({ color: tint([0.055, 0.052, 0.05]), roughness: 0.94, metalness: 0.0, flatShading: true }),
    rockMoss: new THREE.MeshStandardMaterial({ color: tint([0.05, 0.065, 0.045]), roughness: 0.95, flatShading: true }),
    wood: new THREE.MeshStandardMaterial({ map: wood, color: tint([0.62, 0.54, 0.46]), roughness: 0.86, metalness: 0.0 }),
    woodDark: new THREE.MeshStandardMaterial({ map: wood, color: tint([0.3, 0.26, 0.23]), roughness: 0.9 }),
    bamboo: new THREE.MeshStandardMaterial({
      map: bamboo.map, normalMap: bamboo.normalMap, color: tint([1.0, 1.06, 0.95]),
      roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide
    }),
    leaf: new THREE.MeshStandardMaterial({
      map: leafTexture(), alphaTest: 0.42, transparent: false, side: THREE.DoubleSide,
      color: tint([0.78, 0.9, 0.72]), roughness: 0.78, metalness: 0.0
    }),
    plaster: new THREE.MeshStandardMaterial({ map: plainSet('plaster').map, color: tint([0.72, 0.7, 0.66]), roughness: 0.96 }),
    tile: new THREE.MeshStandardMaterial({ color: tint([0.055, 0.058, 0.065]), roughness: 0.66, metalness: 0.08, flatShading: true }),
    cloth: new THREE.MeshStandardMaterial({ map: plainSet('cloth').map, color: tint([0.78, 0.72, 0.68]), roughness: 0.92, side: THREE.DoubleSide }),
    clothBox: new THREE.MeshStandardMaterial({ map: plainSet('cloth').map, color: tint([0.62, 0.58, 0.55]), roughness: 0.95, side: THREE.FrontSide }),
    clothBlue: new THREE.MeshStandardMaterial({ map: plainSet('clothBlue').map, color: tint([0.9, 0.94, 1.0]), roughness: 0.92, side: THREE.DoubleSide }),
    ribbon: new THREE.MeshStandardMaterial({ map: plainSet('paper').map, color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide }),
    paper: new THREE.MeshStandardMaterial({
      map: plainSet('paper').map, color: tint([0.9, 0.75, 0.55]),
      emissive: new THREE.Color(1, 0.55, 0.2), emissiveIntensity: 1.15, roughness: 0.85
    }),
    ember: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.1, 0.05, 0.02), emissive: new THREE.Color(1.0, 0.45, 0.13), emissiveIntensity: 2.6, roughness: 0.6
    }),
    bronze: new THREE.MeshStandardMaterial({ color: tint([0.2, 0.18, 0.12]), roughness: 0.5, metalness: 0.65, flatShading: true }),
    ash: new THREE.MeshStandardMaterial({ color: tint([0.08, 0.075, 0.07]), roughness: 1.0, flatShading: true })
  };
  return M;
}

/* ---------- 인스턴스 배치 ---------- */
let _instColor = null;
export function instanced(geo, material, items, opts) {
  opts = opts || {};
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, material, items.length);
  const d = new THREE.Object3D();
  items.forEach(function (it, i) {
    d.position.set(it.x || 0, it.y || 0, it.z || 0);
    d.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    d.scale.set(it.sx != null ? it.sx : 1, it.sy != null ? it.sy : 1, it.sz != null ? it.sz : 1);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    /* v0.23: 청크 소품이 [r,g,b] 배열로 색을 실어 보낸다(눈·혈석·해골의 색 구분). */
    if (it.color) {
      if (!_instColor) _instColor = new THREE.Color();
      _instColor.setRGB(it.color[0], it.color[1], it.color[2]);
      mesh.setColorAt(i, _instColor);
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  mesh.frustumCulled = false;
  return mesh;
}

function ringPoint(rnd, rMin, rMax, avoid) {
  for (let k = 0; k < 24; k++) {
    const a = rnd() * TAU, r = rMin + Math.pow(rnd(), 0.7) * (rMax - rMin);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!avoid || Math.hypot(x, z) > (avoid || 0)) return { x: x, z: z, a: a, r: r };
  }
  return { x: rMin, z: 0, a: 0, r: rMin };
}

export function glowBatch(items) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    /* v0.37: 0.62 는 어두워진 판석 위에서 등불 바닥빛이 흰 원으로 타 버렸다 — 조금 낮추고 호박빛을 진하게. */
    map: glowTexture(), transparent: true, opacity: 0.40, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true
  });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const d = new THREE.Object3D();
  items.forEach(function (it, i) {
    d.position.set(it.x, it.y != null ? it.y : 0.04, it.z);
    d.rotation.set(0, it.ry || 0, 0);
    const s = it.size || 4;
    d.scale.set(s, 1, s * (it.squash || 1));
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    mesh.setColorAt(i, it.color || new THREE.Color(1, 0.46, 0.17));
  });
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}

export function aoBatch(items) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTexture(), transparent: true, opacity: 0.62, depthWrite: false, color: 0x000000, fog: true
  });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const d = new THREE.Object3D();
  items.forEach(function (it, i) {
    d.position.set(it.x, 0.025, it.z);
    d.rotation.set(0, it.ry || 0, 0);
    d.scale.set(it.size, 1, it.size * (it.squash || 0.8));
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}

/* ---------- 스테이지별 배치 ---------- */
function buildMarket(R, T, P, opts) {
  const rnd = mulberry(1301 + (opts.burnt ? 77 : 0));
  const burnt = !!opts.burnt;
  const box = [], postsWood = [], beams = [], canopies = [], lanterns = [], lanternCaps = [];
  const houses = [], roofPlanes = [], boards = [], crates = [], barrels = [], rubble = [], rocks = [], cloth = [];
  const pools = [], ao = [], lights = [], lanternSpots = [];

  /* 장터 좌판 14~16개: 네 기둥 + 들보 + 천막 */
  const clusters = burnt ? 6 : 7;
  const perCluster = 3;
  for (let ci = 0; ci < clusters; ci++) {
   const cp = ringPoint(rnd, 5.2, 18.5, 3.6);
   const tangent = cp.a + Math.PI / 2 + (rnd() - 0.5) * 0.3;
   for (let k = 0; k < perCluster; k++) {
    const off = (k - (perCluster - 1) / 2) * 2.9;
    const p = { x: cp.x + Math.cos(tangent) * off, z: cp.z + Math.sin(tangent) * off, a: cp.a, r: cp.r };
    if (Math.hypot(p.x, p.z) < 3.4) continue;
    const ry = tangent + (rnd() - 0.5) * 0.22;
    const w = 2.3 + rnd() * 1.1, dpt = 1.8 + rnd() * 0.8, h = 2.05 + rnd() * 0.45;
    const broken = burnt ? rnd() < 0.55 : rnd() < 0.18;
    const ca = Math.cos(ry), sa = Math.sin(ry);
    const corners = [[-w / 2, -dpt / 2], [w / 2, -dpt / 2], [-w / 2, dpt / 2], [w / 2, dpt / 2]];
    corners.forEach(function (c, k) {
      if (broken && (k === 1 || k === 2)) return;
      const x = p.x + c[0] * ca - c[1] * sa, z = p.z + c[0] * sa + c[1] * ca;
      postsWood.push({ x: x, y: h / 2, z: z, sx: 0.15, sy: h + 0.1, sz: 0.15, ry: ry + (rnd() - 0.5) * 0.08, rz: (rnd() - 0.5) * 0.03 });
      ao.push({ x: x, z: z, size: 0.9 });
    });
    beams.push({ x: p.x, y: h, z: p.z, sx: w + 0.4, sy: 0.14, sz: 0.14, ry: ry });
    beams.push({ x: p.x, y: h, z: p.z, sx: 0.14, sy: 0.14, sz: dpt + 0.4, ry: ry });
    /* 천막 밑의 널판과 처마: 종이처럼 얇지 않게 */
    boards.push({ x: p.x, y: h + 0.06, z: p.z, sx: w + 0.5, sy: dpt + 0.4, rx: -Math.PI / 2, ry: ry, rz: 0 });
    /* 천막: 용마루에서 만나는 두 장의 판 — 기울어진 천막 지붕 */
    const dz = dpt * 0.25;
    const tilt = broken ? 0.3 : 0.17;
    [-1, 1].forEach(function (sgn) {
      const cxx = p.x + Math.sin(ry) * dz * sgn, czz = p.z + Math.cos(ry) * dz * sgn;
      canopies.push({
        x: cxx, y: h + 0.06 + dz * Math.sin(tilt), z: czz,
        sx: w + 0.55, sy: 0.07, sz: dpt * 0.55,
        rx: tilt * sgn, ry: ry, rz: 0
      });
    });
    beams.push({ x: p.x, y: h + 0.08 + dz * Math.sin(tilt) * 2 + 0.05, z: p.z, sx: w + 0.7, sy: 0.09, sz: 0.12, ry: ry });
    /* 처마 끝에 늘어진 천 조각 */
    if (rnd() < 0.5) {
      for (let k = 0; k < 3; k++) {
        cloth.push({ x: p.x - Math.sin(ry) * (dpt * 0.5) + Math.cos(ry) * (k - 1) * w * 0.3, y: h - 0.18, z: p.z - Math.cos(ry) * (dpt * 0.5) - Math.sin(ry) * (k - 1) * w * 0.3, sx: 0.24, sy: 0.5 + rnd() * 0.3, ry: ry });
      }
    }
    if (!broken && rnd() < 0.75) {
      const lx = p.x + (rnd() - 0.5) * w * 0.7, lz = p.z + (rnd() - 0.5) * dpt * 0.5;
      lanternSpots.push({ x: lx, z: lz, y: h - 0.35 });
    }
    /* 좌판 위 궤짝 */
    if (rnd() < 0.6) crates.push({ x: p.x + (rnd() - 0.5) * 1.2, y: 0.26, z: p.z + (rnd() - 0.5) * 0.9, sx: 0.62, sy: 0.52, sz: 0.5, ry: rnd() * 3 });
   }
  }

  /* 불탄 기와집 4채 (담장 + 지붕) */
  const housesN = burnt ? 6 : 5;
  for (let i = 0; i < housesN; i++) {
    const p = ringPoint(rnd, 10.5, 21, 7);
    const ry = p.a + (rnd() - 0.5) * 0.6;
    const w = 5.0 + rnd() * 2.6, dpt = 4.0 + rnd() * 1.6, h = 2.8 + rnd() * 0.9;
    const ca = Math.cos(ry), sa = Math.sin(ry);
    function put(lx, lz, sx, sy, sz, yy) {
      houses.push({ x: p.x + lx * ca - lz * sa, y: yy, z: p.z + lx * sa + lz * ca, sx: sx, sy: sy, sz: sz, ry: ry });
    }
    put(0, -dpt / 2, w, h, 0.26, h / 2);
    put(-w / 2, 0, 0.26, h, dpt, h / 2);
    if (!burnt || rnd() < 0.5) put(w / 2, 0, 0.26, h * 0.8, dpt, h * 0.4);
    /* 지붕: 좌우로 기운 두 장 */
    const rw = w * 0.72, rl = dpt * 0.62;
    const off = dpt * 0.29;
    roofPlanes.push({ x: p.x - Math.sin(ry) * off, y: h + 0.55, z: p.z - Math.cos(ry) * off, sx: rw, sy: rl, rx: -Math.PI / 2 + 0.42, ry: ry, rz: 0 });
    roofPlanes.push({ x: p.x + Math.sin(ry) * off, y: h + 0.55, z: p.z + Math.cos(ry) * off, sx: rw, sy: rl, rx: -Math.PI / 2 - 0.42, ry: ry, rz: 0 });
    beams.push({ x: p.x, y: h + 0.95, z: p.z, sx: rw * 1.02, sy: 0.2, sz: 0.22, ry: ry });
    ao.push({ x: p.x, z: p.z, size: w * 1.1 });
    if (!burnt) {
      lights.push({ x: p.x, y: 1.7, z: p.z, color: 0xff8a3a, intensity: 3.2, dist: 11 });
      pools.push({ x: p.x, z: p.z, size: 5.2, color: new THREE.Color(0.9, 0.42, 0.16) });
    }
  }

  /* 심안 테두리를 감싸는 장터 프레임: 어느 방향을 봐도 무대가 읽히게 */
  const FRAME = 10;
  for (let i = 0; i < FRAME; i++) {
    const a = (i / FRAME) * TAU + 0.18;
    const r = 5.2 + rnd() * 2.0;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const pick = (i + (burnt ? 2 : 0)) % 3;
    if (pick === 0) {
      /* 등불 기둥: 나무 기둥 + 매단 종이등 */
      postsWood.push({ x: x, y: 1.35, z: z, sx: 0.16, sy: 2.7, sz: 0.16 });
      beams.push({ x: x, y: 2.66, z: z, sx: 1.5, sy: 0.1, sz: 0.1, ry: a + Math.PI / 2 });
      lanternSpots.push({ x: x + Math.cos(a + Math.PI / 2) * 0.55, z: z + Math.sin(a + Math.PI / 2) * 0.55, y: 2.3 });
      ao.push({ x: x, z: z, size: 1.5 });
      pools.push({ x: x, z: z, size: 3.2, color: new THREE.Color(1.0, 0.5, 0.2) });
      if (lights.length < 6) lights.push({ x: x, y: 2.2, z: z, color: 0xffa14a, intensity: 3.2, dist: 8 });
    } else if (pick === 1) {
      crates.push({ x: x, y: 0.26, z: z, sx: 0.55, sy: 0.5, sz: 0.45, ry: rnd() * TAU });
      crates.push({ x: x + 0.4, y: 0.2, z: z + 0.3, sx: 0.4, sy: 0.38, sz: 0.36, ry: rnd() * TAU });
      rubble.push({ x: x - 0.3, y: 0.05, z: z - 0.2, sx: 0.3, sy: 0.08, sz: 0.28, ry: rnd() * TAU });
      ao.push({ x: x, z: z, size: 1.4 });
    } else {
      rocks.push({ x: x, y: 0.26, z: z, sx: 0.55 + rnd() * 0.4, sy: 0.4 + rnd() * 0.3, sz: 0.55 + rnd() * 0.4, ry: rnd() * TAU });
      rubble.push({ x: x + 0.5, y: 0.06, z: z + 0.2, sx: 0.25, sy: 0.07, sz: 0.2, ry: rnd() * TAU });
      ao.push({ x: x, z: z, size: 1.3 });
    }
  }

  /* 화톳불 3곳 */
  for (let i = 0; i < 3; i++) {
    const p = ringPoint(rnd, 4.5, 11, 3.6);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + rnd() * 0.3;
      rocks.push({ x: p.x + Math.cos(a) * 0.72, y: 0.13, z: p.z + Math.sin(a) * 0.72, sx: 0.2 + rnd() * 0.1, sy: 0.16, sz: 0.2, ry: rnd() * TAU });
    }
    box.push({ x: p.x, y: 0.16, z: p.z, sx: 0.9, sy: 0.16, sz: 0.22, ry: rnd() * 3, rx: 0.12 });
    box.push({ x: p.x, y: 0.2, z: p.z, sx: 0.9, sy: 0.16, sz: 0.22, ry: rnd() * 3 + 1, rx: -0.1 });
    lights.push({ x: p.x, y: 0.9, z: p.z, color: 0xff7a2a, intensity: 4.4, dist: 9 });
    pools.push({ x: p.x, z: p.z, size: 4.4, color: new THREE.Color(1.0, 0.45, 0.14) });
    ao.push({ x: p.x, z: p.z, size: 2.4 });
    (T.firePits = T.firePits || []).push({ x: p.x, y: 0.5, z: p.z });
  }

  /* 석등 3기 */
  for (let i = 0; i < 4; i++) {
    const p = ringPoint(rnd, 5, 14, 3.6);
    (T.lanterns = T.lanterns || []).push({ x: p.x, z: p.z, ry: rnd() * TAU });
    ao.push({ x: p.x, z: p.z, size: 1.5 });
    pools.push({ x: p.x, z: p.z, size: 3.4, color: new THREE.Color(1.0, 0.6, 0.26) });
    if (i < 2) lights.push({ x: p.x, y: 1.55, z: p.z, color: 0xffb15a, intensity: 2.6, dist: 8 });
  }

  /* 심안 안쪽에 놓이는 작은 살림: 궤짝·항아리·자갈 (플레이를 막지 않는 크기) */
  for (let i = 0; i < 16; i++) {
    const p = ringPoint(rnd, 2.6, 4.8, 1.8);
    if (rnd() < 0.45) crates.push({ x: p.x, y: 0.18, z: p.z, sx: 0.4 + rnd() * 0.25, sy: 0.3 + rnd() * 0.18, sz: 0.4 + rnd() * 0.2, ry: rnd() * TAU });
    else if (rnd() < 0.5) barrels.push({ x: p.x, y: 0.25, z: p.z, sx: 0.22, sy: 0.28, sz: 0.22, ry: rnd() * TAU });
    else rubble.push({ x: p.x, y: 0.06, z: p.z, sx: 0.2 + rnd() * 0.3, sy: 0.08 + rnd() * 0.1, sz: 0.2 + rnd() * 0.3, ry: rnd() * TAU });
  }

  /* 궤짝·통·잔해 */
  for (let i = 0; i < 18; i++) {
    const p = ringPoint(rnd, 5, 26, 3);
    if (rnd() < 0.5) crates.push({ x: p.x, y: 0.24 + rnd() * 0.2, z: p.z, sx: 0.4 + rnd() * 0.4, sy: 0.4 + rnd() * 0.3, sz: 0.4 + rnd() * 0.35, ry: rnd() * TAU });
    else barrels.push({ x: p.x, y: 0.36, z: p.z, sx: 0.3, sy: 0.36, sz: 0.3, ry: rnd() * TAU });
  }
  for (let i = 0; i < 34; i++) {
    const p = ringPoint(rnd, 5, 27, 2.5);
    rubble.push({ x: p.x, y: 0.09, z: p.z, sx: 0.3 + rnd() * 0.45, sy: 0.12 + rnd() * 0.16, sz: 0.3 + rnd() * 0.45, ry: rnd() * TAU, rz: (rnd() - 0.5) * 0.3 });
  }
  for (let i = 0; i < 12; i++) {
    const p = ringPoint(rnd, 7, 26, 4);
    rocks.push({ x: p.x, y: 0.2, z: p.z, sx: 0.5 + rnd() * 0.9, sy: 0.35 + rnd() * 0.5, sz: 0.5 + rnd() * 0.8, ry: rnd() * TAU });
  }
  /* 붉은 달 장: 그을린 들보·수레·붉은 천 */
  if (burnt) {
    for (let i = 0; i < 10; i++) {
      const p = ringPoint(rnd, 4, 22, 3.5);
      box.push({ x: p.x, y: 0.35, z: p.z, sx: 2.2 + rnd() * 1.6, sy: 0.22, sz: 0.24, ry: rnd() * TAU, rz: (rnd() - 0.5) * 0.5 });
      if (i < 6) cloth.push({ x: p.x, y: 1.6 + rnd() * 0.8, z: p.z, sx: 0.5 + rnd() * 0.4, sy: 1.2 + rnd() * 0.9, ry: rnd() * TAU, rz: (rnd() - 0.5) * 0.2 });
    }
    for (let i = 0; i < 2; i++) {
      const p = ringPoint(rnd, 6, 16, 4);
      box.push({ x: p.x, y: 0.55, z: p.z, sx: 1.5, sy: 0.32, sz: 2.2, ry: p.a, rx: 0.15 });
      for (let k = 0; k < 2; k++) {
        const off = k ? 1 : -1;
        barrels.push({ x: p.x + Math.cos(p.a) * 0.02 + Math.sin(p.a) * off * 0.75, y: 0.42, z: p.z - Math.cos(p.a) * off * 0.75, sx: 0.44, sy: 0.44, sz: 0.1, rx: Math.PI / 2, ry: p.a });
      }
    }
  }
  return { box: box, postsWood: postsWood, beams: beams, canopies: canopies, houses: houses, roofs: roofPlanes, boards: boards, crates: crates, barrels: barrels, rubble: rubble, rocks: rocks, cloth: cloth, lanternSpots: lanternSpots, pools: pools, ao: ao, lights: lights };
}

function buildGateWorld(R, T, P) {
  const rnd = mulberry(2207);
  const box = [], pillars = [], beams = [], tiles = [], roofGable = [], rubble = [], rocks = [], banners = [], poles = [], statues = [];
  const pools = [], ao = [], lights = [];

  /* 주 성문: 두 기둥 + 상인방 + 맞배 기와 지붕, 한쪽 문짝은 무너짐 */
  const gx = 0, gz = -15;
  pillars.push({ x: gx - 3.6, y: 2.5, z: gz, sx: 1.35, sy: 5.0, sz: 1.35 });
  pillars.push({ x: gx + 3.6, y: 2.7, z: gz, sx: 1.35, sy: 5.4, sz: 1.35 });
  beams.push({ x: gx, y: 5.15, z: gz, sx: 9.0, sy: 0.65, sz: 1.5 });
  /* 상인방 위 작은 화반·포벽 */
  for (let i = 0; i < 7; i++) box.push({ x: gx - 3.3 + i * 1.1, y: 5.55, z: gz, sx: 0.34, sy: 0.4, sz: 0.9 });
  /* 맞배 지붕: 두 장의 경사면 + 처마 서까래 */
  roofGable.push({ x: gx, y: 6.6, z: gz - 1.55, sx: 9.6, sy: 3.4, sz: 0.3, rx: 0.62 });
  roofGable.push({ x: gx, y: 6.6, z: gz + 1.55, sx: 9.6, sy: 3.4, sz: 0.3, rx: -0.62 });
  for (let i = 0; i < 15; i++) {
    const x = gx - 4.6 + i * 0.66;
    tiles.push({ x: x, y: 5.92, z: gz - 1.7, sx: 0.3, sy: 0.3, sz: 1.9, rx: 0.62, ry: 0 });
    tiles.push({ x: x, y: 5.92, z: gz + 1.7, sx: 0.3, sy: 0.3, sz: 1.9, rx: -0.62, ry: 0 });
  }
  beams.push({ x: gx, y: 6.4, z: gz, sx: 10.0, sy: 0.24, sz: 0.4 });
  /* 어두운 문틈 */
  box.push({ x: gx, y: 2.3, z: gz, sx: 5.2, sy: 4.4, sz: 0.3, color: null, shade: 'gate' });
  /* 무너진 성문짝 */
  box.push({ x: gx - 1.9, y: 1.9, z: gz + 0.45, sx: 2.2, sy: 3.8, sz: 0.22, ry: 0.25, rz: 0.08 });
  box.push({ x: gx + 2.4, y: 0.45, z: gz + 1.7, sx: 2.4, sy: 0.9, sz: 0.24, ry: 0.9, rz: 0.2 });
  ao.push({ x: gx, z: gz, size: 9 });
  for (let i = 0; i < 12; i++) {
    const a = rnd() * TAU, r = 2.5 + rnd() * 5;
    rubble.push({ x: gx + Math.cos(a) * r, y: 0.16, z: gz + Math.sin(a) * r * 0.7, sx: 0.5 + rnd() * 0.9, sy: 0.3 + rnd() * 0.5, sz: 0.5 + rnd() * 0.8, ry: rnd() * TAU });
  }

  /* 성곽 담장: 큰 호를 따라 끊긴 구간 */
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * TAU + 0.22;
    const r = 19 + (rnd() - 0.5) * 3;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - gx, z - gz) < 8) continue;
    const ry = -a + Math.PI / 2;
    const h = 2.4 + rnd() * 1.1, w = 4.6 + rnd() * 2.4;
    box.push({ x: x, y: h / 2, z: z, sx: w, sy: h, sz: 0.8, ry: ry });
    for (let k = 0; k < Math.floor(w / 0.9); k++) {
      if (rnd() < 0.25) continue;
      box.push({ x: x + (k - w / 1.8) * 0.9 * Math.cos(ry), y: h + 0.22, z: z - (k - w / 1.8) * 0.9 * Math.sin(ry), sx: 0.5, sy: 0.44, sz: 0.7, ry: ry });
    }
    ao.push({ x: x, z: z, size: w * 1.1 });
  }

  /* 깃발: 창대 + 붉은 천 */
  for (let i = 0; i < 7; i++) {
    const p = ringPoint(rnd, 6, 18, 5);
    const h = 3.0 + rnd() * 1.3;
    poles.push({ x: p.x, y: h / 2, z: p.z, sx: 0.09, sy: h, sz: 0.09 });
    banners.push({ x: p.x + 0.62, y: h - 0.85, z: p.z, sx: 1.24, sy: 1.45, ry: rnd() * 0.6, rz: 0.02 });
    ao.push({ x: p.x, z: p.z, size: 0.8 });
  }

  /* 해태 석상 2기 (성문 앞) */
  [[-5.2, -12.6], [5.2, -12.6]].forEach(function (c) {
    statues.push({ x: c[0], y: 0, z: c[1], ry: 0.1 });
    ao.push({ x: c[0], z: c[1], size: 2.2 });
  });

  /* 바리케이드: 창을 엇갈려 세운 목책 */
  for (let i = 0; i < 9; i++) {
    const p = ringPoint(rnd, 5.5, 16, 4);
    const ry = rnd() * TAU;
    for (let k = 0; k < 3; k++) {
      const o = (k - 1) * 0.55;
      poles.push({ x: p.x + Math.cos(ry) * o, y: 0.9, z: p.z + Math.sin(ry) * o, sx: 0.06, sy: 1.8, sz: 0.06, rz: 0.32, ry: ry });
      poles.push({ x: p.x + Math.cos(ry) * o, y: 0.9, z: p.z + Math.sin(ry) * o, sx: 0.06, sy: 1.8, sz: 0.06, rz: -0.32, ry: ry });
    }
  }

  /* 심안 테두리 프레임: 부서진 담장 조각·창 목책·깃발 */
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    const r = 5.4 + rnd() * 1.8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const ry = -a + Math.PI / 2;
    if (i % 3 === 0) {
      const h = 1.5 + rnd() * 0.9, w = 2.0 + rnd() * 1.0;
      box.push({ x: x, y: h / 2, z: z, sx: w, sy: h, sz: 0.55, ry: ry });
      for (let k = 0; k < 3; k++) {
        box.push({ x: x + (k - 1) * 0.6 * Math.cos(ry), y: h + 0.2, z: z - (k - 1) * 0.6 * Math.sin(ry), sx: 0.42, sy: 0.34, sz: 0.5, ry: ry });
      }
      ao.push({ x: x, z: z, size: 2.4 });
    } else if (i % 3 === 1) {
      const h = 2.6 + rnd() * 1.0;
      poles.push({ x: x, y: h / 2, z: z, sx: 0.1, sy: h, sz: 0.1 });
      banners.push({ x: x + 0.6, y: h - 0.8, z: z, sx: 1.15, sy: 1.35, ry: rnd() * 0.5 });
      ao.push({ x: x, z: z, size: 0.9 });
    } else {
      for (let k = 0; k < 3; k++) {
        const o = (k - 1) * 0.5;
        poles.push({ x: x + Math.cos(ry) * o, y: 0.85, z: z + Math.sin(ry) * o, sx: 0.06, sy: 1.7, sz: 0.06, rz: 0.3, ry: ry });
        poles.push({ x: x + Math.cos(ry) * o, y: 0.85, z: z + Math.sin(ry) * o, sx: 0.06, sy: 1.7, sz: 0.06, rz: -0.3, ry: ry });
      }
      rubble.push({ x: x + 0.6, y: 0.1, z: z, sx: 0.5, sy: 0.2, sz: 0.4, ry: rnd() * TAU });
      ao.push({ x: x, z: z, size: 1.2 });
    }
  }

  /* 화로 3기 */
  for (let i = 0; i < 3; i++) {
    const p = ringPoint(rnd, 6, 15, 4.5);
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU;
      poles.push({ x: p.x + Math.cos(a) * 0.42, y: 0.45, z: p.z + Math.sin(a) * 0.42, sx: 0.07, sy: 0.9, sz: 0.07, rz: Math.cos(a) * 0.18 });
    }
    (T.braziers = T.braziers || []).push({ x: p.x, y: 1.0, z: p.z });
    pools.push({ x: p.x, z: p.z, size: 4.2, color: new THREE.Color(0.55, 0.7, 1.0) });
    lights.push({ x: p.x, y: 1.2, z: p.z, color: 0x76a6ff, intensity: 3.0, dist: 9 });
    ao.push({ x: p.x, z: p.z, size: 1.6 });
  }
  for (let i = 0; i < 26; i++) {
    const p = ringPoint(rnd, 5, 27, 2.5);
    rubble.push({ x: p.x, y: 0.12, z: p.z, sx: 0.4 + rnd() * 0.8, sy: 0.2 + rnd() * 0.3, sz: 0.4 + rnd() * 0.7, ry: rnd() * TAU });
  }
  for (let i = 0; i < 10; i++) {
    const p = ringPoint(rnd, 8, 26, 4);
    rocks.push({ x: p.x, y: 0.25, z: p.z, sx: 0.6 + rnd() * 1.2, sy: 0.4 + rnd() * 0.7, sz: 0.6 + rnd() * 1.0, ry: rnd() * TAU });
  }
  return { box: box, pillars: pillars, beams: beams, tiles: tiles, roofGable: roofGable, rubble: rubble, rocks: rocks, banners: banners, poles: poles, statues: statues, pools: pools, ao: ao, lights: lights };
}

function buildBamboo(R, T, P) {
  const rnd = mulberry(3301);
  const culms = [], leaves = [], rocks = [], rubble = [], poles = [], cloth = [], pools = [], ao = [], lights = [];
  const planks = [];
  const clumps = 30;
  for (let i = 0; i < clumps; i++) {
    const p = ringPoint(rnd, 6.2, 27, 5.0);
    const n = 4 + Math.floor(rnd() * 6);
    for (let k = 0; k < n; k++) {
      const ox = (rnd() - 0.5) * 2.2, oz = (rnd() - 0.5) * 2.2;
      const h = 5.6 + rnd() * 4.0;
      const lean = (rnd() - 0.5) * 0.16;
      const x = p.x + ox, z = p.z + oz;
      const dir = rnd() * TAU;
      culms.push({
        x: x, y: 0, z: z, sx: 1.2 + rnd() * 0.8, sy: h, sz: 1.2 + rnd() * 0.8,
        rx: lean * Math.cos(dir) * 0, rz: lean * 0.6, ry: dir, color: new THREE.Color(0.85 + rnd() * 0.3, 0.9 + rnd() * 0.25, 0.82 + rnd() * 0.2)
      });
      const levels = 2 + (rnd() < 0.6 ? 1 : 0);
      for (let l = 0; l < levels; l++) {
        const t = 0.5 + l * 0.17 + rnd() * 0.08;
        leaves.push({
          x: x + lean * 2 * t, y: h * t, z: z, sx: 1.6 + rnd() * 1.2, sy: 1.6 + rnd() * 1.2, sz: 1.6 + rnd() * 1.2,
          ry: rnd() * TAU, rx: (rnd() - 0.5) * 0.4, rz: (rnd() - 0.5) * 0.4,
          color: new THREE.Color(0.8 + rnd() * 0.4, 0.9 + rnd() * 0.3, 0.75 + rnd() * 0.25)
        });
      }
      ao.push({ x: x, z: z, size: 0.85 });
    }
    if (p.r < 13) ao.push({ x: p.x, z: p.z, size: 3.4 });
  }

  /* 심안 테두리 프레임: 가까운 대나무 군락이 시야를 감싼다 */
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.12;
    const r = 7.2 + rnd() * 2.8;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const x = cx + (rnd() - 0.5) * 1.4, z = cz + (rnd() - 0.5) * 1.4;
      const h = 5.5 + rnd() * 3.6;
      culms.push({ x: x, y: 0, z: z, sx: 1.2 + rnd() * 0.7, sy: h, sz: 1.2 + rnd() * 0.7, rz: (rnd() - 0.5) * 0.12, ry: rnd() * TAU });
      for (let l = 0; l < 2; l++) {
        leaves.push({ x: x, y: h * (0.55 + l * 0.2), z: z, sx: 1.5 + rnd() * 1.0, sy: 1.5 + rnd() * 1.0, sz: 1.5 + rnd() * 1.0, ry: rnd() * TAU, rx: (rnd() - 0.5) * 0.3, rz: (rnd() - 0.5) * 0.3 });
      }
      ao.push({ x: x, z: z, size: 1.0 });
    }
  }

  /* 서낭당: 신목 + 오방색 천 + 돌무더기 */
  const sx = -7.5, sz = 7.5;
  (T.shrine = { x: sx, z: sz });
  poles.push({ x: sx, y: 2.2, z: sz, sx: 0.34, sy: 4.4, sz: 0.34, rz: 0.04 });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.3;
    poles.push({ x: sx + Math.cos(a) * 0.8, y: 3.1 + rnd() * 0.5, z: sz + Math.sin(a) * 0.8, sx: 0.08, sy: 1.9, sz: 0.08, rz: Math.cos(a) * 0.9, rx: Math.sin(a) * 0.9 });
  }
  for (let i = 0; i < 9; i++) {
    cloth.push({ x: sx + (rnd() - 0.5) * 2.2, y: 2.5 + rnd() * 0.8, z: sz + (rnd() - 0.5) * 1.6, sx: 0.18, sy: 0.9 + rnd() * 0.5, rz: (rnd() - 0.5) * 0.3, color: new THREE.Color(1, 1, 1) });
  }
  ao.push({ x: sx, z: sz, size: 3 });

  /* 돌탑 2기 */
  for (let i = 0; i < 2; i++) {
    const p = ringPoint(rnd, 7, 18, 5);
    let y = 0;
    for (let k = 0; k < 5; k++) {
      const s = 0.9 - k * 0.13;
      rocks.push({ x: p.x, y: y + 0.12, z: p.z, sx: s, sy: 0.16 + rnd() * 0.05, sz: s, ry: rnd() * TAU });
      y += 0.22;
    }
    ao.push({ x: p.x, z: p.z, size: 1.6 });
  }

  /* 나무다리 */
  const bx = 9.5, bz = -9.5;
  for (let i = 0; i < 9; i++) {
    planks.push({ x: bx + (i - 4) * 0.62, y: 0.34 + Math.sin((i / 8) * Math.PI) * 0.22, z: bz, sx: 0.56, sy: 0.1, sz: 2.6, rz: Math.cos((i / 8) * Math.PI) * 0.12 });
  }
  [[-1.25], [1.25]].forEach(function (o) {
    for (let i = 0; i < 5; i++) poles.push({ x: bx + (i - 2) * 1.2, y: 0.72, z: bz + o[0], sx: 0.07, sy: 0.8, sz: 0.07 });
    poles.push({ x: bx, y: 1.15, z: bz + o[0], sx: 0.09, sy: 0.09, sz: 2.9, rx: 0, ry: 0, rz: Math.PI / 2 });
  });
  ao.push({ x: bx, z: bz, size: 4 });

  /* 바위·잔해 */
  for (let i = 0; i < 18; i++) {
    const p = ringPoint(rnd, 5, 26, 3.5);
    rocks.push({ x: p.x, y: 0.2, z: p.z, sx: 0.5 + rnd() * 1.0, sy: 0.35 + rnd() * 0.6, sz: 0.5 + rnd() * 0.9, ry: rnd() * TAU, color: rnd() < 0.5 ? new THREE.Color(0.62, 0.72, 0.55) : null });
    ao.push({ x: p.x, z: p.z, size: 1.6 });
  }
  for (let i = 0; i < 16; i++) {
    const p = ringPoint(rnd, 5, 27, 2.5);
    rubble.push({ x: p.x, y: 0.08, z: p.z, sx: 0.3 + rnd() * 0.4, sy: 0.1 + rnd() * 0.14, sz: 0.3 + rnd() * 0.4, ry: rnd() * TAU });
  }
  /* 반딧불 나무 곁의 빛 */
  for (let i = 0; i < 3; i++) {
    const p = ringPoint(rnd, 6, 15, 5);
    pools.push({ x: p.x, z: p.z, size: 3.0, color: new THREE.Color(0.35, 0.9, 0.5) });
    if (i < 2) lights.push({ x: p.x, y: 1.4, z: p.z, color: 0x5adca0, intensity: 1.8, dist: 7 });
  }
  return { culms: culms, leaves: leaves, rocks: rocks, rubble: rubble, poles: poles, cloth: cloth, planks: planks, pools: pools, ao: ao, lights: lights };
}

/* ---------- 월드 조립 ---------- */
export function buildStage3D(THREE_IGNORED, opts) {
  opts = opts || {};
  const stageId = opts.stageId || 1;
  const mapId = opts.mapId || 'map1';
  /* chunked: 바닥과 소품은 3×3 시드 청크(inkchunks.js)가 맡고, 여기서는 원경 파노라마만 세운다. */
  const chunked = !!opts.chunked;
  const T = {};
  const M = makeMaterials(stageId);
  const group = new THREE.Group();
  group.name = 'stage3d-' + mapId + '-' + stageId;

  /* 지형: 판석 + 젖은 흙, 노멀·러프니스 */
  const gStyle = {
    1: { stone: [0.195, 0.205, 0.21], dirt: [0.095, 0.095, 0.10], moss: 0.22, wet: 0.7, seed: 11 },
    2: { stone: [0.29, 0.32, 0.37], dirt: [0.14, 0.16, 0.21], moss: 0.12, wet: 0.78, seed: 23 },
    3: { stone: [0.28, 0.31, 0.24], dirt: [0.15, 0.18, 0.13], moss: 0.8, wet: 0.5, seed: 37 },
    4: { stone: [0.36, 0.26, 0.23], dirt: [0.18, 0.12, 0.11], moss: 0.14, wet: 0.45, seed: 41 }
  }[stageId] || { stone: [0.195, 0.205, 0.21], dirt: [0.095, 0.095, 0.10], moss: 0.22, wet: 0.7, seed: 11 };
  let ground = null, groundMat = null;
  if (!chunked) {
    const gs = groundSet(gStyle);
    const gmap = gs.map.clone(); gmap.needsUpdate = true; gmap.repeat.set(60, 60);
    const gnorm = gs.normalMap.clone(); gnorm.needsUpdate = true; gnorm.repeat.set(60, 60);
    const grough = gs.roughnessMap.clone(); grough.needsUpdate = true; grough.repeat.set(60, 60);
    groundMat = new THREE.MeshStandardMaterial({
      map: gmap, normalMap: gnorm, roughnessMap: grough, normalScale: new THREE.Vector2(0.3, 0.3),
      color: 0x6e6e6e, roughness: 1.0, metalness: 0.0
    });
    groundMat.userData.inkGround = true;
    groundMat.userData.cardProfile = 'ground';
    const groundGeo = new THREE.PlaneGeometry(120, 120, 48, 48);
    const gp = groundGeo.getAttribute('position');
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), y = gp.getY(i);
      const h = Math.sin(x * 0.23) * Math.cos(y * 0.19) * 0.07 + Math.sin(x * 0.07 + y * 0.11) * 0.12;
      gp.setZ(i, h);
    }
    groundGeo.computeVertexNormals();
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);
    T.groundMat = groundMat;

    /* 대형 먹 번짐 베일 */
    const veilMat = new THREE.MeshBasicMaterial({ map: inkVeilTexture(), transparent: true, opacity: 0.95, depthWrite: false, color: 0xffffff, fog: true });
    veilMat.userData.cardProfile = 'backdrop'; /* v0.39: 이중으로 잠그지 않도록 가장 얇은 안개 */
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(72, 72, 1, 1), veilMat);
    veil.rotation.x = -Math.PI / 2;
    veil.position.y = 0.012;
    veil.renderOrder = 1;
    group.add(veil);
  }

  /* 원경 파노라마 */
  const panoMat = new THREE.MeshBasicMaterial({ map: panoramaTexture(stageId), side: THREE.BackSide, fog: true, depthWrite: false, color: 0xffffff });
  panoMat.userData.cardProfile = 'backdrop';
  const pano = new THREE.Mesh(new THREE.CylinderGeometry(44, 44, 30, 72, 1, true), panoMat);
  const panoHome = 11.5;
  pano.position.y = panoHome;
  pano.renderOrder = -2;
  group.add(pano);

  /* 스테이지별 소품 (청크 모드에서는 inkchunks.js가 청크마다 세운다) */
  let D = { lights: [] };
  if (!chunked) {
    if (stageId === 3) D = buildBamboo(null, T, null);
    else if (stageId === 2) D = buildGateWorld(null, T, null);
    else D = buildMarket(null, T, null, { burnt: stageId === 4 });
  }

  const geos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8, 1),
    poleCyl: new THREE.CylinderGeometry(1, 1, 1, 6, 1),
    sphere: new THREE.SphereGeometry(1, 10, 7),
    plane: new THREE.PlaneGeometry(1, 1),
    rock0: rockGeo(5), rock1: rockGeo(9, 0), rock2: rockGeo(13),
    leaf: crossQuads(),
    bamboo: (function () { const g = new THREE.CylinderGeometry(0.055, 0.085, 1, 6, 1, true); g.translate(0, 0.5, 0); return g; })()
  };

  const batches = [];
  function addBatch(mesh) { if (mesh) { group.add(mesh); batches.push(mesh); } }

  addBatch(instanced(geos.box, M.woodDark, D.box || [], { cast: true }));
  addBatch(instanced(geos.box, M.wood, D.postsWood || [], { cast: true }));
  addBatch(instanced(geos.box, M.wood, D.beams || [], { cast: true }));
  addBatch(instanced(geos.box, M.plaster, D.houses || [], { cast: true }));
  addBatch(instanced(geos.box, M.tile, D.roofs || [], { cast: true }));
  addBatch(instanced(geos.plane, M.woodDark, D.boards || [], { cast: false }));
  addBatch(instanced(geos.box, M.wood, D.crates || [], { cast: true }));
  addBatch(instanced(geos.cyl, M.woodDark, D.barrels || [], { cast: true }));
  addBatch(instanced(geos.box, M.rock, D.rubble || [], { cast: false }));
  addBatch(instanced(geos.rock0, M.rock, D.rocks || [], { cast: true }));
  addBatch(instanced(geos.box, M.wood, D.planks || [], { cast: true }));
  addBatch(instanced(geos.box, M.clothBox, D.canopies || [], { cast: true }));
  addBatch(instanced(geos.plane, M.cloth, D.banners || [], { cast: false }));
  addBatch(instanced(geos.plane, M.ribbon, D.cloth || [], { cast: false }));
  addBatch(instanced(geos.cyl, M.woodDark, D.poles || [], { cast: true }));
  addBatch(instanced(geos.cyl, M.plaster, D.pillars || [], { cast: true }));
  addBatch(instanced(geos.box, M.tile, D.tiles || [], { cast: true }));
  addBatch(instanced(geos.box, M.tile, D.roofGable || [], { cast: true }));
  addBatch(instanced(geos.bamboo, M.bamboo, D.culms || [], { cast: true }));
  addBatch(instanced(geos.leaf, M.leaf, D.leaves || [], { cast: false }));

  /* 해태 석상 */
  if (D.statues && D.statues.length) {
    const body = [], head = [], mane = [], horn = [];
    D.statues.forEach(function (s) {
      body.push({ x: s.x, y: 0.85, z: s.z, sx: 1.05, sy: 0.9, sz: 1.7, ry: s.ry });
      head.push({ x: s.x + 0.1, y: 1.75, z: s.z + 0.7, sx: 0.6, sy: 0.55, sz: 0.6, ry: s.ry });
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * 0.55 + i * 0.26;
        mane.push({ x: s.x + 0.1 + Math.cos(a) * 0.55, y: 1.85 + Math.sin(a) * 0.42, z: s.z + 0.7, sx: 0.1, sy: 0.34, sz: 0.1, rz: -a + Math.PI / 2 });
      }
      horn.push({ x: s.x + 0.1, y: 2.18, z: s.z + 0.62, sx: 0.12, sy: 0.34, sz: 0.12 });
    });
    addBatch(instanced(geos.box, M.rock, body, { cast: true }));
    addBatch(instanced(geos.sphere, M.rock, head, { cast: true }));
    addBatch(instanced(geos.box, M.rock, mane, { cast: false }));
    addBatch(instanced(geos.cyl, M.rock, horn, { cast: false }));
  }

  /* 매달린 등불(장터): 종이 등 + 쇠 고리 */
  if (D.lanternSpots && D.lanternSpots.length) {
    const body = [], cap = [], cord = [];
    D.lanternSpots.forEach(function (l) {
      body.push({ x: l.x, y: l.y, z: l.z, sx: 0.42, sy: 0.54, sz: 0.42 });
      cap.push({ x: l.x, y: l.y + 0.3, z: l.z, sx: 0.16, sy: 0.08, sz: 0.16 });
      cord.push({ x: l.x, y: l.y + 0.55, z: l.z, sx: 0.02, sy: 0.4, sz: 0.02 });
    });
    addBatch(instanced(geos.sphere, M.paper, body, { cast: false }));
    addBatch(instanced(geos.cyl, M.bronze, cap, { cast: false }));
    addBatch(instanced(geos.cyl, M.bronze, cord, { cast: false }));
    D.lanternSpots.forEach(function (l, i) {
      if (i % 3 !== 0) return;
      (D.pools = D.pools || []).push({ x: l.x, y: 0.03, z: l.z, size: 2.6, color: new THREE.Color(0.9, 0.45, 0.18) });
    });
  }

  /* 석등 */
  if (T.lanterns && T.lanterns.length) {
    const base = [], shaft = [], firebox = [], win = [], roof = [], finial = [];
    T.lanterns.forEach(function (l) {
      base.push({ x: l.x, y: 0.1, z: l.z, sx: 0.9, sy: 0.2, sz: 0.9 });
      shaft.push({ x: l.x, y: 0.75, z: l.z, sx: 0.26, sy: 1.1, sz: 0.26 });
      firebox.push({ x: l.x, y: 1.5, z: l.z, sx: 0.52, sy: 0.46, sz: 0.52 });
      win.push({ x: l.x, y: 1.5, z: l.z, sx: 0.36, sy: 0.3, sz: 0.36 });
      roof.push({ x: l.x, y: 1.82, z: l.z, sx: 0.86, sy: 0.24, sz: 0.86, ry: Math.PI / 4 });
      finial.push({ x: l.x, y: 2.05, z: l.z, sx: 0.2, sy: 0.26, sz: 0.2, ry: Math.PI / 4 });
    });
    addBatch(instanced(geos.box, M.rock, base, { cast: true }));
    addBatch(instanced(geos.cyl, M.rock, shaft, { cast: true }));
    addBatch(instanced(geos.box, M.rock, firebox, { cast: true }));
    addBatch(instanced(geos.box, M.ember, win, { cast: false }));
    addBatch(instanced(new THREE.ConeGeometry(1, 1, 4), M.rock, roof, { cast: true }));
    addBatch(instanced(new THREE.ConeGeometry(1, 1, 4), M.rock, finial, { cast: false }));
  }

  /* 바닥 발광 웅덩이와 접지 음영 */
  if (D.pools && D.pools.length) addBatch(glowBatch(D.pools));
  if (D.ao && D.ao.length) addBatch(aoBatch(D.ao));

  /* 조명: 모바일 forward 렌더링 비용을 위해 스테이지당 5개로 제한 */
  const lights = [];
  (D.lights || []).slice(0, 5).forEach(function (l, i) {
    const pl = new THREE.PointLight(l.color, l.intensity, l.dist || 10, 1.8);
    pl.position.set(l.x, l.y, l.z);
    group.add(pl);
    lights.push({ light: pl, base: l.intensity, glow: null, phase: i * 2.1 });
  });
  T.lights = lights;

  const dyn = [];
  group.traverse(function (o) { if (o.isInstancedMesh) dyn.push(o); });

  const api = {
    id: mapId, stageId: stageId, group: group, lights: lights, ground: ground, groundMat: groundMat,
    pano: pano, chunked: chunked,
    pools: D.pools || [], firePits: T.firePits || [], braziers: T.braziers || [], shrine: T.shrine || null,
    batches: batches.length, triangles: 0,
    /* 원경 파노라마가 영웅을 따라간다 — 끝없이 걸어도 지평선이 남아 있게. */
    follow(x, z) {
      pano.position.x = x || 0;
      pano.position.z = z || 0;
    },
    update(dt, t) {
      T.t = t;
      for (let i = 0; i < lights.length; i++) {
        const l = lights[i];
        const f = 0.86 + 0.1 * Math.sin(t * 6.4 + l.phase) + 0.04 * Math.sin(t * 13.7 + l.phase * 3.1);
        l.light.intensity = l.base * f;
      }
      if (M.ember && M.ember.emissiveIntensity != null) M.ember.emissiveIntensity = 2.3 + Math.sin(t * 5.2) * 0.35;
    },
    dispose() {
      group.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const arr = Array.isArray(o.material) ? o.material : [o.material];
          arr.forEach(function (m) { if (m && m.dispose) m.dispose(); });
        }
      });
      group.removeFromParent();
    }
  };
  let tri = 0;
  group.traverse(function (o) {
    if (o.geometry && o.geometry.index) tri += o.geometry.index.count / 3 * (o.isInstancedMesh ? o.count : 1);
    else if (o.geometry && o.geometry.getAttribute('position')) tri += o.geometry.getAttribute('position').count / 3 * (o.isInstancedMesh ? o.count : 1);
  });
  api.triangles = Math.round(tri);
  return api;
}
