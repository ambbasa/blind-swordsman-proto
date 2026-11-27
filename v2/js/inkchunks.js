/* 심안 v0.22 — 3×3 시드 청크 무한 맵 (inkchunks.js)
   24m × 24m 청크 하나를 (cx, cz, stageId) 시드로 절차 생성한다.
   영웅이 청크 경계를 넘을 때마다 3×3 창을 밀고, 창 밖으로 나간 청크는 버린다.
   같은 자리로 돌아오면 같은 소품이 다시 서고(시드 고정), 부순 묵항아리는 그대로 부서진 채다.
   소품은 전부 InstancedMesh 배칭 → 청크 아홉 개를 세워도 드로우콜은 열 몇 개. */

import * as THREE from 'three';
import { groundSet, plainSet, mulberry } from './inkbake.js';
import { texOf, panoOf } from './inkdiorama.js';
import { floorInfo } from './inkfloor.js';
import { buildArena, ARENA } from './inkarena.js';
import { LANDMARKS, STAGE_SCENERY, groundPoint } from './modules/stageScenery.js';

export const CHUNK = 24;
export const WINDOW_R = 1; /* 3×3 */
/* v0.37: 카메라 방위는 고정 45°(쿼터뷰) — 큰 소품(집·소나무·석등·바위)은 교차 평면 대신
   카메라를 바라보는 한 장으로 세운다. 교차시키면 집이 두 채 겹친 X자로 보였다. */
const CAM_RY = Math.PI * 0.25;
function faceRy(rnd, spread) {
  const r = (typeof rnd === 'function' ? rnd() : 0.5) - 0.5;
  return CAM_RY + r * (spread == null ? 0.26 : spread);
}
/* 장별 바닥 텍스처(복제본) 캐시 — 장을 오갈 때 같은 512 판을 다시 GPU에 올리지 않는다. */
const FLOOR_CACHE = new Map();
const TAU = Math.PI * 2;
const HALF = CHUNK / 2;

/* v0.37 QA 조정 노브: URL 로 바닥 밝기·병풍 반경/높이를 바로 바꿔 가며 스크린샷을 비교한다.
   (?floorMul=0.45&screenR=22&screenH=7) 값이 없으면 아래 기본값. */
function qnum(k, d) {
  try {
    const v = parseFloat(new URLSearchParams(location.search).get(k));
    return isFinite(v) && v > 0 ? v : d;
  } catch (e) { return d; }
}
const FLOOR_MUL = qnum('floorMul', 0.22);   /* v0.43: 한지 바탕 알베도(예전 밤 돌바닥보다 밝되 종이처럼) */
const SCREEN_R = qnum('screenR', 21);
const SCREEN_H = qnum('screenH', 11);

const GROUND_STYLE = {
  1: { stone: [0.195, 0.205, 0.21], dirt: [0.095, 0.095, 0.10], moss: 0.22, wet: 0.7, seed: 11 },
  2: { stone: [0.29, 0.32, 0.37], dirt: [0.14, 0.16, 0.21], moss: 0.12, wet: 0.78, seed: 23 },
  3: { stone: [0.28, 0.31, 0.24], dirt: [0.15, 0.18, 0.13], moss: 0.8, wet: 0.5, seed: 37 },
  4: { stone: [0.36, 0.26, 0.23], dirt: [0.18, 0.12, 0.11], moss: 0.14, wet: 0.45, seed: 41 },
  /* 제2막 안개 산사 */
  5: { stone: [0.20, 0.26, 0.28], dirt: [0.09, 0.12, 0.14], moss: 0.42, wet: 0.88, seed: 53 },
  6: { stone: [0.30, 0.33, 0.38], dirt: [0.14, 0.17, 0.22], moss: 0.10, wet: 0.62, seed: 61 },
  7: { stone: [0.20, 0.24, 0.18], dirt: [0.10, 0.13, 0.09], moss: 0.74, wet: 0.40, seed: 71 },
  8: { stone: [0.26, 0.24, 0.30], dirt: [0.12, 0.11, 0.15], moss: 0.30, wet: 0.68, seed: 83 },
  /* 제3막 혈월의 나락 */
  9: { stone: [0.32, 0.15, 0.15], dirt: [0.16, 0.06, 0.07], moss: 0.06, wet: 0.72, seed: 97 },
  10: { stone: [0.30, 0.25, 0.19], dirt: [0.15, 0.12, 0.09], moss: 0.12, wet: 0.34, seed: 103 },
  11: { stone: [0.28, 0.11, 0.13], dirt: [0.13, 0.04, 0.05], moss: 0.04, wet: 0.66, seed: 113 },
  12: { stone: [0.22, 0.07, 0.10], dirt: [0.10, 0.02, 0.04], moss: 0.02, wet: 0.80, seed: 127 }
};

export function chunkOf(v) { return Math.floor(v / CHUNK); }
export function chunkKey(cx, cz) { return cx + ':' + cz; }

/* 타이틀 유휴 예열: 한 장의 바닥 판석을 미리 굽는다(groundSet은 캐시된다). */
export function prebakeGroundStage(stageId) {
  groundSet(GROUND_STYLE[stageId] || GROUND_STYLE[1]);
  return stageId;
}
/* v0.41 QA: 바닥 에셋 로드 상태 */
export function floorStatus() { return floorInfo(); }

/* 좌표를 섞어 32bit 시드로: 같은 자리·같은 장은 언제나 같은 무대. */
export function seedOf(cx, cz, stageId) {
  let h = Math.imul(cx | 0, 374761393) ^ Math.imul(cz | 0, 668265263) ^ Math.imul(stageId | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return (h ^ (h >>> 15)) >>> 0;
}


/* v1.55: 고정 아레나 전용 — 구형 3×3 무한 청크 절차 생성기(~1,300줄) 제거, QA 호환 스텁만 유지 */
export function buildChunkData(cx, cz, stageId) {
  return { cx: cx | 0, cz: cz | 0, stageId: stageId || 1, seed: seedOf(cx, cz, stageId), buckets: {}, jars: [], lights: [] };
}

function createArenaWorld(opts) {
  opts = opts || {};
  const stageId = opts.stageId || 1;
  const mapId = opts.mapId || 'map1';
  const group = new THREE.Group();
  group.name = 'arenaWorld-' + mapId + '-' + stageId;

  const plan = STAGE_SCENERY[stageId] || STAGE_SCENERY[1];
  const groundBase = new THREE.Color(0xbabcb7);
  const softGround = plan.ground === 'river' || plan.ground === 'trail';
  const emberGroundTex = (function () {
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const pal = { base: plan.edge, mid: plan.mid, edge: plan.edge };

    const rg = g.createRadialGradient(S * 0.5, S * 0.5, S * 0.06, S * 0.5, S * 0.5, S * 0.54);
    rg.addColorStop(0, pal.mid);
    rg.addColorStop(0.62, pal.base);
    rg.addColorStop(1, pal.edge);
    g.fillStyle = rg;
    g.fillRect(0, 0, S, S);

    let rs = (stageId || 1) * 9973 + 31;
    const rr = function () { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };

    // Build broad masses first; detail stays on the banks rather than beneath the hero.
    const unit = S / (2 * ARENA.GROUND);
    const route = plan.route.map(([side, depth]) => {
      const { x, z } = groundPoint(side, depth);
      return [S / 2 + x * unit, S / 2 + z * unit];
    });
    // Continue the lane beyond the fighting area; a round stroke cap in the
    // camera looks like a painted button rather than a road into the scenery.
    function beyond(a, b) {
      const dx = a[0] - b[0], dy = a[1] - b[1];
      const scale = unit * 28 / Math.hypot(dx, dy);
      return [a[0] + dx * scale, a[1] + dy * scale];
    }
    route.unshift(beyond(route[0], route[1]));
    route.push(beyond(route[route.length - 1], route[route.length - 2]));
    function traceRoute() {
      g.beginPath(); g.moveTo(...route[0]);
      for (let i = 1; i < route.length - 1; i++) {
        const next = route[i+1], here = route[i];
        g.quadraticCurveTo(...here, (here[0]+next[0])/2, (here[1]+next[1])/2);
      }
      g.lineTo(...route[route.length-1]);
    }
    g.lineJoin = g.lineCap = 'round';
    // Overlapping translucent shoulders soften the boundary without a blur pass.
    traceRoute();
    g.strokeStyle = plan.path;
    const width = plan.ground === 'river' ? 5.4 : 6.8;
    for (const [extra, opacity] of [[2.1, 0.09], [1.1, 0.12], [0, 0.24]]) {
      g.globalAlpha = opacity;
      g.lineWidth = (width + extra) * unit;
      g.stroke();
    }
    g.globalAlpha = 1;
    if (plan.ground === 'court') {
      g.beginPath();
      for (let i=0;i<8;i++) {
        const a = i*Math.PI/4 + Math.PI/8, x=S/2+Math.cos(a)*unit*9, y=S/2+Math.sin(a)*unit*9;
        if (!i) g.moveTo(x,y); else g.lineTo(x,y);
      }
      g.closePath(); g.fillStyle=plan.mid; g.fill(); g.lineWidth=unit*0.22; g.strokeStyle=plan.path; g.stroke();
    }
    // Dress the shoulders, not the centre of the stroke lane. Work in route
    // coordinates so paving, snow and shingle follow bends at any camera angle.
    for (let section = 1; section < route.length; section++) {
      const [ax, ay] = route[section - 1];
      const [bx, by] = route[section];
      const dx = bx - ax, dy = by - ay;
      const length = Math.hypot(dx, dy);
      const rows = Math.ceil(length / (unit * 1.35));
      for (let j = 0; j < rows; j++) {
        const t = (j + 0.5) / rows;
        for (const bank of [-1, 1]) {
          const offset = bank * unit * (2.4 + rr() * 1.4);
          g.save();
          g.translate(ax + t * dx - dy / length * offset, ay + t * dy + dx / length * offset);
          g.rotate(Math.atan2(dy, dx));
          g.scale(unit, unit);
          if (plan.ground === 'river' || plan.ground === 'trail') {
            // Short brush marks read as sediment, snow or grass, not an attack telegraph.
            g.fillStyle = stageId === 6 ? 'rgba(234,244,242,.47)' : plan.path;
            g.globalAlpha = stageId === 6 ? 0.85 : 0.36;
            g.beginPath();
            g.moveTo(-1.05, 0); g.quadraticCurveTo(-0.4, -0.55, 1.05, -0.16);
            g.quadraticCurveTo(0.4, 0.03, -1.05, 0.14); g.fill();
          } else {
            g.fillStyle = plan.path; g.globalAlpha = 0.31;
            g.beginPath(); g.moveTo(-0.7, -0.48); g.lineTo(0.48, -0.49);
            g.lineTo(0.83, -0.19); g.lineTo(0.68, 0.39); g.lineTo(-0.55, 0.5);
            g.closePath(); g.fill();
          }
          g.restore();
        }
      }
    }
    for (let i=0;i<880;i++) {
      const x=rr()*S, y=rr()*S, w=(1+rr()*4.8), h=w*(0.15+rr()*0.4);
      g.fillStyle = i%3 ? 'rgba(255,240,213,.09)' : 'rgba(16,18,26,.14)';
      g.beginPath(); g.moveTo(x-w,y); g.lineTo(x+w*.6,y-h); g.lineTo(x+w,y); g.lineTo(x-w*.4,y+h); g.fill();
    }
    // Graphic contact shadows anchor every grounded structure proportionally.
    for (const [key, side, depth, , scaleMul] of plan.slots) {
      if (key === 'skyLantern') continue;
      const { x, z } = groundPoint(side, depth);
      const h = ((LANDMARKS[key] && LANDMARKS[key].height) || 3.2) * (scaleMul || 1);
      const sr = Math.min(2.2, Math.max(0.72, h * 0.38));
      g.beginPath(); g.ellipse(S / 2 + x * unit, S / 2 + z * unit, unit * sr, unit * sr * 0.65, -0.52, 0, Math.PI * 2);
      g.fillStyle = 'rgba(15,18,24,.12)'; g.fill();
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
    tx.anisotropy = 4;
    tx.needsUpdate = true;
    return tx;
  })();
  const groundMat = new THREE.MeshStandardMaterial({
    map: emberGroundTex, bumpMap: null, color: new THREE.Color(0xcfdce0), roughness: 0.94, metalness: 0.0,
    vertexColors: true
  });
  groundMat.userData.inkGround = true;
  groundMat.userData.cardProfile = 'ground';
  const groundGeo = new THREE.PlaneGeometry(ARENA.GROUND * 2, ARENA.GROUND * 2, 96, 96);
  groundGeo.rotateX(-Math.PI / 2);
  // Keep the combat plane level. The surrounding banks have real silhouettes
  // and catch light instead of stretching the playfield image to the horizon.
  const points = groundGeo.attributes.position;
  const colors = new Float32Array(points.count * 3);
  const seed = stageId * 1.37;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), z = points.getZ(i);
    const rad = Math.hypot(x, z);
    const bank = THREE.MathUtils.smoothstep(rad, ARENA.R + 1, ARENA.CLIFF + 2);
    const ridge = 0.9 + 0.52 * Math.sin(x * 0.39 + stageId) + 0.38 * Math.cos(z * 0.51 - x * 0.23);
    points.setY(i, bank * ridge * (softGround ? 1.0 : 1.65));

    // Organic sumi-ink & hanji wash breakup (eliminates repetitive symmetry without extra draw calls)
    const w1 = Math.sin(x * 0.19 + z * 0.13 + seed) * Math.cos(z * 0.21 - x * 0.11 + seed * 0.7);
    const w2 = Math.sin(x * 0.43 - z * 0.37 + seed * 1.9) * 0.5;
    const brush = 0.95 + 0.095 * w1 + 0.045 * w2;
    const rimShade = 1 - 0.14 * THREE.MathUtils.smoothstep(rad, ARENA.R * 0.75, ARENA.CLIFF);
    let r = brush * rimShade;
    let g = (brush - 0.012 * Math.max(0, -w1)) * rimShade;
    let b = (brush - 0.025 * Math.max(0, -w1)) * rimShade;

    if (stageId === 4) {
      // A broken wash of reflected moonlight at the rear, outside the gesture lane.
      const depth = -(x + z) * Math.SQRT1_2, side = (x - z) * Math.SQRT1_2;
      const distance = Math.hypot((side + 7) / 7, (depth - 12) / 8);
      const wash = (1 - THREE.MathUtils.smoothstep(distance, 0.45, 1)) * (0.8 + 0.2 * Math.cos(z * 1.8));
      g *= (1 - 0.57 * wash);
      b *= (1 - 0.62 * wash);
    }
    colors[i * 3] = Math.min(1.08, Math.max(0.65, r));
    colors[i * 3 + 1] = Math.min(1.06, Math.max(0.62, g));
    colors[i * 3 + 2] = Math.min(1.04, Math.max(0.58, b));
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (stageId === 4) {
    const moon = new THREE.Mesh(new THREE.CircleGeometry(3.5, 48),
      new THREE.MeshBasicMaterial({ color: 0xac5045, fog: true }));
    moon.name = 'vermilionMoon';
    moon.position.set(-20, 8, -12);
    moon.rotation.y = Math.PI / 4;
    group.add(moon);
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.name = 'arenaGround';
  group.add(ground);

  /* 판석·물길·다진 길·풀잎 — 고정 사각형 한 번. */
  let arena = null;
  try { arena = buildArena({ stageId: stageId, seed: 20261120 + stageId * 31 }); } catch (e) {
    arena = null;
    if (window.console && console.warn) console.warn('[심안] 아레나 기물 생성 실패', e);
  }
  if (arena) group.add(arena.group);

  /* ---------- 묵항아리 — 고정 자리(시드 고정). 부수면 다시 서지 않는다. */
  const rnd = mulberry(0x5eed ^ (stageId * 2654435761 >>> 0));
  const jarPts = [[0.0, 0.0], [0.2, 0.01], [0.3, 0.1], [0.34, 0.26], [0.33, 0.4], [0.26, 0.55], [0.19, 0.62], [0.17, 0.68], [0.22, 0.72], [0.19, 0.75]]
    .map(function (p) { return new THREE.Vector2(p[0], p[1]); });
  const jarGeo = new THREE.LatheGeometry(jarPts, 16);
  const jarMat = new THREE.MeshStandardMaterial({
    color: 0x24242c, roughness: 0.42, metalness: 0.14,
    emissive: new THREE.Color(0.05, 0.06, 0.1), emissiveIntensity: 0.9
  });
  const sealMat = new THREE.MeshStandardMaterial({
    map: plainSet('paper').map, color: 0xffe0b0, side: THREE.DoubleSide,
    emissive: new THREE.Color(1, 0.62, 0.28), emissiveIntensity: 0.85, roughness: 0.9
  });
  const sealGeo = new THREE.PlaneGeometry(0.26, 0.42);
  const jars = [];
  const NOBJ = 10;
  for (let i = 0; i < NOBJ; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 4.2 + Math.pow(rnd(), 0.85) * 13.0;
    jars.push({ id: 'jar#' + i, cx: 0, cz: 0, x: Math.cos(a) * r, z: Math.sin(a) * r, ry: rnd() * Math.PI * 2, alive: true, broken: false, slot: i });
  }
  const jarMesh = new THREE.InstancedMesh(jarGeo, jarMat, NOBJ);
  const jarSealMesh = new THREE.InstancedMesh(sealGeo, sealMat, NOBJ);
  jarMesh.castShadow = true; jarMesh.receiveShadow = true;
  jarMesh.frustumCulled = false; jarSealMesh.frustumCulled = false;
  jarMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  jarSealMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(jarMesh); group.add(jarSealMesh);
  const dummy = new THREE.Object3D();
  function writeJars() {
    jars.forEach(function (j, i) {
      const k = j.alive ? 1 : 0.0001;
      dummy.position.set(j.x, 0, j.z); dummy.rotation.set(0, j.ry, 0); dummy.scale.set(k, k, k);
      dummy.updateMatrix(); jarMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(j.x + Math.sin(j.ry) * 0.3, 0.44, j.z + Math.cos(j.ry) * 0.3);
      dummy.rotation.set(-0.18, j.ry, 0.1); dummy.scale.set(k, k, k);
      dummy.updateMatrix(); jarSealMesh.setMatrixAt(i, dummy.matrix);
      j.slot = i;
    });
    jarMesh.instanceMatrix.needsUpdate = true; jarSealMesh.instanceMatrix.needsUpdate = true;
  }
  writeJars();

  /* ---------- 영웅을 따라오는 등불(무대 위 조명) — 기존과 같은 색·세기. */
  const heroLight = new THREE.PointLight(0xffb45c, 34, 22, 1.7);
  heroLight.position.set(0, 3.6, 1.6);
  group.add(heroLight);
  const rimLight = new THREE.PointLight(0x9fc0e0, 8, 32, 1.5);
  rimLight.position.set(3.2, 5.4, -3.0);
  group.add(rimLight);

  /* ---------- 뒤편 병풍 — 고정 무대이므로 카메라 초점을 그대로 따라간다(하늘함처럼). */
  let screenMesh = null;
  const SCREEN = { N: 12, R: 31, H: 15, arc: Math.PI * 170 / 180, mid: Math.PI * 1.25, pleat: 0.9, x: null, z: null, tex: null };
  function buildScreenRing(srcTex) {
    const tex = new THREE.TextureLoader().load(new URL('../assets/ink-edition/stage-' + (stageId > 12 ? stageId - 4 : stageId) + '.webp', import.meta.url).href);
    tex.image = srcTex.image;
    tex.needsUpdate = true;
    tex.wrapS = THREE.MirroredRepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
    tex.repeat.set(1, 1);
    SCREEN.tex = tex;
    const N = SCREEN.N, R = SCREEN.R, H = SCREEN.H, pl = SCREEN.pleat;
    const arc = SCREEN.arc, a0 = SCREEN.mid - arc / 2;
    const chord = 2 * R * Math.sin(arc / (2 * N));
    const uw = chord / H;
    const pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i < N; i++) {
      const t0a = a0 + (i / N) * arc, t1a = a0 + ((i + 1) / N) * arc;
      const r0 = R + (i % 2 ? -pl : pl), r1 = R + (i % 2 ? pl : -pl);
      const x0 = Math.cos(t0a) * r0, z0 = Math.sin(t0a) * r0;
      const x1 = Math.cos(t1a) * r1, z1 = Math.sin(t1a) * r1;
      const u0 = i * uw, u1 = (i + 1) * uw;
      const b = i % 2 ? 0.80 : 1.0;
      const base = pos.length / 3;
      pos.push(x0, 0, z0, x1, 0, z1, x1, H, z1, x0, H, z0);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
      for (let k = 0; k < 4; k++) col.push(b, b, b);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      map: tex, color: new THREE.Color(0xe6d9bd), transparent: true, opacity: 0.96,
      side: THREE.DoubleSide, depthWrite: false, fog: true, vertexColors: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -2;
    mesh.name = 'silkScreen';
    group.add(mesh);
    return mesh;
  }
  /* v0.48: 고정 아레나에서는 원경 원통(44m)이 이미 병풍 역할을 한다. 31m 비단 병풍을 겹치면
     절벽 위로 종이 조각처럼 뜯긴 판때기가 보여서 끈다(`?screen=1` 비교용). */
  try {
    const wantScreen = (function () { try { return new URLSearchParams(location.search).get('screen') === '1'; } catch (e) { return false; } })();
    const act = stageId <= 4 ? 1 : (stageId <= 8 ? 2 : 3);
    const st = wantScreen ? (panoOf(act) || texOf('screen')) : null;
    if (st) screenMesh = buildScreenRing(st);
  } catch (e) { screenMesh = null; }

  const embers = (arena ? arena.lightSpots : []).slice(0, 6).map(function (s) {
    return { x: s.x, y: 1.6, z: s.z };
  });

  const center = { cx: 0, cz: 0 };
  const world = {
    group: group, stageId: stageId, mapId: mapId, jars: jars, center: center,
    embers: embers, materials: null, arena: arena,
    bounds: { x: 0, z: 0, r: ARENA.R },
    stats: { chunks: 1, props: arena ? arena.stats.props : 0, jars: jars.length, batches: arena ? 3 : 0, cached: 0, rebuilds: 1, fixed: true }
  };

  world.update = function (dt, t, hx, hz) {
    const pulse = 0.9 + Math.sin((t || 0) * 2.4) * 0.1;
    if (groundMat && groundMat.color) groundMat.color.copy(groundBase).multiplyScalar(0.94 + 0.035 * pulse);
    heroLight.position.set(hx || 0, 3.5, (hz || 0) + 1.8);
    heroLight.intensity = 23 + 3 * pulse;
    rimLight.position.set((hx || 0) + 3.4, 5.6, (hz || 0) - 3.2);

  };

  world.reset = function (hx, hz) {
    jars.forEach(function (j) { j.alive = true; j.broken = false; });
    writeJars();
    world.stats.jars = jars.length;
  };

  world.screenInfo = function () {
    return screenMesh ? { panels: SCREEN.N, r: SCREEN.R, h: SCREEN.H, x: Math.round((SCREEN.x || 0) * 10) / 10, z: Math.round((SCREEN.z || 0) * 10) / 10, fixed: true } : null;
  };
  world.jarsOnPath = function (ax, az, bx, bz, r) {
    const out = [];
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz || 1;
    jars.forEach(function (j) {
      if (!j.alive) return;
      const t = Math.max(0, Math.min(1, ((j.x - ax) * dx + (j.z - az) * dz) / L2));
      const px = ax + dx * t, pz = az + dz * t;
      if (Math.hypot(j.x - px, j.z - pz) <= (r || 1) + 0.55) out.push(j);
    });
    return out;
  };
  world.jarsNear = function (x, z, r) {
    return jars.filter(function (j) { return j.alive && Math.hypot(j.x - x, j.z - z) <= (r || 3); });
  };
  world.breakJar = function (j) {
    if (!j || !j.alive) return false;
    j.alive = false; j.broken = true;
    writeJars();
    world.stats.jars = jars.filter(function (q) { return q.alive; }).length;
    return true;
  };

  world.materials = (function () {
    const list = [groundMat, jarMat, sealMat];
    if (arena && arena.materials) arena.materials.forEach(function (m) { if (m) list.push(m); });
    return list;
  })();

  world.dispose = function () {
    if (arena) { try { arena.group.removeFromParent(); } catch (e) {} }
    if (arena && arena.body) { try { arena.body.geometry.dispose(); } catch (e) {} }
    if (arena && arena.hull) { try { arena.hull.geometry.dispose(); } catch (e) {} }
    if (arena && arena.glow) { try { arena.glow.geometry.dispose(); } catch (e) {} }
    jarMesh.dispose(); jarSealMesh.dispose(); jarGeo.dispose(); sealGeo.dispose();
    jarMat.dispose(); sealMat.dispose();
    if (screenMesh) { if (screenMesh.parent) screenMesh.parent.remove(screenMesh); screenMesh.geometry.dispose(); screenMesh.material.dispose(); }
    if (SCREEN.tex) { try { SCREEN.tex.dispose(); } catch (e) {} }
    groundGeo.dispose(); groundMat.dispose(); emberGroundTex.dispose();
    if (arena && arena.body && arena.body.skeleton) arena.body.skeleton.dispose();
    if (arena && arena.materials) arena.materials.forEach(m => m && m.dispose && m.dispose());
    if (arena && arena.glbProps && arena.glbProps.dispose) arena.glbProps.dispose();
    group.removeFromParent();
  };

  return world;
}

/** v1.55 무대 팩토리 — 고정 아레나 생성. */
export function createChunkWorld(opts) {
  return createArenaWorld(opts);
}
