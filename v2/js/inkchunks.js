/* 심안 v0.22 — 3×3 시드 청크 무한 맵 (inkchunks.js)
   24m × 24m 청크 하나를 (cx, cz, stageId) 시드로 절차 생성한다.
   영웅이 청크 경계를 넘을 때마다 3×3 창을 밀고, 창 밖으로 나간 청크는 버린다.
   같은 자리로 돌아오면 같은 소품이 다시 서고(시드 고정), 부순 묵항아리는 그대로 부서진 채다.
   소품은 전부 InstancedMesh 배칭 → 청크 아홉 개를 세워도 드로우콜은 열 몇 개. */

import * as THREE from 'three';
import {
  groundSet, bambooSet, leafTexture, woodSet, plainSet, glowTexture, shadowTexture, mulberry
} from './inkbake.js';
import { makeMaterials, instanced, rockGeo, crossQuads, glowBatch, aoBatch, mergeGeo } from './inkprops3d.js';
import { paperPropCanvas } from './inkpaper.js';
import { texOf, aspectOf, panoOf } from './inkdiorama.js';
import { createFloorLayer, floorReady, soilTexture, floorInfo } from './inkfloor.js';
import { buildArena, ARENA } from './inkarena.js';

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

/* ---------- 청크 하나의 소품 배치 ---------- */
function emptyBuckets() {
  return {
    wood: [], dark: [], plank: [], plaster: [], tile: [], canopy: [],
    cloth: [], ribbon: [], paper: [], ember: [], rock: [], leaf: [],
    bamboo: [], glow: [], ao: [], stain: [],
    pHouse: [], pBamboo: [], pPine: [], pLantern: [], pRock: []
  };
}

function push(B, kind, x, y, z, sx, sy, sz, ry, rx, rz, color) {
  const o = {
    x: x, y: y || 0, z: z,
    sx: sx == null ? 1 : sx, sy: sy == null ? 1 : sy, sz: sz == null ? 1 : sz,
    rx: rx || 0, ry: ry || 0, rz: rz || 0
  };
  if (color) o.color = color;
  B[kind].push(o);
}

/* 청크 안 빈 자리: 가운데 동선(반경 clearR)과 이미 놓은 소품을 피한다. */
function spot(rnd, clearR, occupied) {
  for (let k = 0; k < 30; k++) {
    const lx = (rnd() * 2 - 1) * 10.6;
    const lz = (rnd() * 2 - 1) * 10.6;
    const r = Math.hypot(lx, lz);
    if (r < clearR) continue;
    let bad = false;
    for (let i = 0; i < occupied.length; i++) {
      const o = occupied[i];
      if (Math.hypot(lx - o.x, lz - o.z) < o.r) { bad = true; break; }
    }
    if (bad) continue;
    return { x: lx, z: lz, a: Math.atan2(lz, lx) };
  }
  return null;
}

function banner(B, x, z, ry, w, h, rnd) {
  push(B, 'dark', x, h * 0.5, z, 0.12, h, 0.12, ry);
  push(B, 'ribbon', x, h * 0.72, z, w, h * 0.46, 1, ry);
  if (rnd() < 0.6) push(B, 'cloth', x + Math.cos(ry) * 0.02, h * 0.42, z + Math.sin(ry) * 0.02, w * 0.7, h * 0.3, 1, ry + 0.2);
}

/* 장터 등불 기둥: 기둥 + 가로대 + 매단 종이등. 심안 둘레를 받쳐 준다. */
function lanternPost(B, x, z, rnd) {
  const h = 2.5 + rnd() * 0.6;
  push(B, 'wood', x, h * 0.5, z, 0.15, h, 0.15, rnd() * TAU);
  push(B, 'wood', x, h - 0.05, z, 1.25, 0.09, 0.09, rnd() * TAU);
  const a = rnd() * TAU;
  const lx = x + Math.cos(a) * 0.52, lz = z + Math.sin(a) * 0.52;
  push(B, 'paper', lx, h - 0.38, lz, 0.42, 0.54, 0.42);
  push(B, 'glow', lx, 0.03, lz, 3.6, 1, 3.6);
  push(B, 'ao', x, 0, z, 1.4, 1, 1.3);
}
function stoneLantern(B, x, z, rnd) {
  /* v0.36 한지 팝업북: 돌을 쌓은 대신 오린 등불 한 장(호박빛 창을 품었다). */
  push(B, 'rock', x, 0.1, z, 0.9, 0.2, 0.9, rnd() * TAU);
  const h = 2.35;
  push(B, 'pLantern', x, h * 0.5, z, h * 0.5, h, h * 0.5, faceRy(rnd));
  push(B, 'glow', x, 0.03, z, 4.2, 1, 4.2);
  push(B, 'ao', x, 0, z, 1.6, 1, 1.6);
}

function marketStall(B, x, z, ry, rnd, broken) {
  const w = 2.4 + rnd() * 0.9, d = 1.9 + rnd() * 0.6, h = 2.0 + rnd() * 0.4;
  const ca = Math.cos(ry), sa = Math.sin(ry);
  /* 네 기둥 — 천막을 받치는 다리 */
  [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].forEach(function (c, k) {
    if (broken && (k === 1 || k === 2)) return;
    push(B, 'wood', x + c[0] * ca - c[1] * sa, h / 2, z + c[0] * sa + c[1] * ca,
      0.17, h + 0.1, 0.17, ry + (rnd() - 0.5) * 0.1);
  });
  push(B, 'wood', x, h, z, w + 0.4, 0.16, 0.16, ry);
  push(B, 'wood', x, h, z, 0.16, 0.16, d + 0.4, ry);
  /* 천막 두 장 */
  const dz = d * 0.25, tilt = broken ? 0.34 : 0.17;
  [-1, 1].forEach(function (sgn) {
    push(B, 'canopy', x + Math.sin(ry) * dz * sgn, h + 0.06 + dz * Math.sin(tilt), z + Math.cos(ry) * dz * sgn,
      w + 0.55, 0.07, d * 0.58, ry, tilt * sgn);
  });
  push(B, 'wood', x, h + 0.1 + dz * Math.sin(tilt) * 2, z, w + 0.7, 0.1, 0.14, ry);
  /* 좌판: 허리 높이의 상 + 다리 + 늘어진 천 */
  const th = 0.82;
  push(B, 'plank', x, th + 0.05, z, w * 0.86, d * 0.62, 1, ry, -Math.PI / 2);
  [[-w * 0.36, -d * 0.24], [w * 0.36, -d * 0.24], [-w * 0.36, d * 0.24], [w * 0.36, d * 0.24]].forEach(function (c) {
    push(B, 'wood', x + c[0] * ca - c[1] * sa, th / 2, z + c[0] * sa + c[1] * ca, 0.09, th, 0.09, ry);
  });
  [-1, 1].forEach(function (sgn) {
    push(B, 'cloth', x + Math.sin(ry) * (d * 0.31) * sgn, th - 0.26, z + Math.cos(ry) * (d * 0.31) * sgn,
      w * 0.84, 0.52, 1, ry, 0, 0.02 * sgn);
  });
  if (!broken && rnd() < 0.7) {
    const lx = x + (rnd() - 0.5) * w * 0.6, lz = z + (rnd() - 0.5) * d * 0.4;
    push(B, 'paper', lx, h - 0.36, lz, 0.42, 0.54, 0.42);
    push(B, 'glow', lx, 0.03, lz, 3.4, 1, 3.4);
  }
  if (rnd() < 0.6) push(B, 'wood', x + (rnd() - 0.5) * 1.0, th + 0.32, z + (rnd() - 0.5) * 0.6, 0.5, 0.44, 0.42, rnd() * 3);
  if (rnd() < 0.5) push(B, 'dark', x + (rnd() - 0.5) * 1.1, 0.26, z + (rnd() - 0.5) * 0.8, 0.3, 0.34, 0.3, rnd() * 3);
  push(B, 'ao', x, 0, z, 3.4, 1, 3.2);
}

function burntStall(B, x, z, ry, rnd) {
  const w = 2.2 + rnd() * 1.1, d = 1.7 + rnd() * 0.6, h = 1.2 + rnd() * 0.9;
  push(B, 'dark', x, h * 0.4, z, 0.16, h, 0.16, ry + 0.1, 0, 0.12);
  push(B, 'dark', x + Math.cos(ry) * w * 0.5, h * 0.75, z + Math.sin(ry) * w * 0.5, 0.14, h * 1.4, 0.14, ry - 0.14);
  push(B, 'dark', x, h, z, w + 0.3, 0.13, 0.13, ry);
  push(B, 'canopy', x, h + 0.12, z, w * 0.9, 0.06, d * 0.55, ry + 0.1, -0.36);
  push(B, 'ember', x + (rnd() - 0.5) * 0.6, 0.04, z + (rnd() - 0.5) * 0.6, 0.7, 0.06, 0.5);
  push(B, 'glow', x, 0.03, z, 2.4, 1, 2.4);
  push(B, 'ao', x, 0, z, 3.2, 1, 2.8);
  for (let i = 0; i < 3; i++) {
    push(B, 'dark', x + (rnd() - 0.5) * 2.4, 0.12, z + (rnd() - 0.5) * 2.0, 0.5 + rnd() * 0.8, 0.12, 0.14, rnd() * TAU, 0, (rnd() - 0.5) * 0.3);
  }
}

function deadTree(B, x, z, rnd) {
  const h = 3.6 + rnd() * 2.6;
  push(B, 'dark', x, h * 0.5, z, 0.26, h, 0.26, rnd() * TAU, 0, (rnd() - 0.5) * 0.12);
  for (let i = 0; i < 4; i++) {
    const a = rnd() * TAU, y = h * (0.5 + rnd() * 0.42), L = 1.2 + rnd() * 1.6;
    push(B, 'dark', x + Math.cos(a) * L * 0.42, y, z + Math.sin(a) * L * 0.42, 0.1, 0.1, L, a, 0, (rnd() - 0.5) * 0.5);
  }
  push(B, 'ao', x, 0, z, 2.2, 1, 2.0);
}

function bambooClump(B, x, z, rnd) {
  /* v0.36 한지 팝업북: 원기둥 대신 오린 종이 대나무 스프라이트(교차 평면) 두 장. */
  const h = 4.8 + rnd() * 2.6;
  push(B, 'pBamboo', x, h * 0.5, z, h * 0.6, h, h * 0.6, rnd() * TAU);
  const h2 = 3.2 + rnd() * 1.6;
  push(B, 'pBamboo', x + (rnd() - 0.5) * 1.8, h2 * 0.5, z + (rnd() - 0.5) * 1.8, h2 * 0.6, h2, h2 * 0.6, rnd() * TAU);
  push(B, 'ao', x, 0, z, 3.0, 1, 2.6);
}

function wallRun(B, x, z, len, ry, rnd) {
  /* 긴 담은 민가(기와집) 한 채로 세운다 — 박스 벽보다 팝업북 실루엣이 멀리서도 읽힌다. */
  if (len >= 4.6) {
    const h = 4.4 + rnd() * 1.0;
    push(B, 'pHouse', x, h * 0.5, z, h, h, h, faceRy(rnd, 0.2));
    push(B, 'ao', x, 0, z, Math.max(3, len), 1, 2.4);
    if (rnd() < 0.6) push(B, 'glow', x + Math.cos(ry) * 1.2, 0.03, z + Math.sin(ry) * 1.2, 3.2, 1, 3.2);
    return;
  }
  push(B, 'plaster', x, 1.15, z, len, 2.3, 0.72, ry);
  push(B, 'tile', x, 2.38, z, len + 0.36, 0.24, 1.02, ry);
  push(B, 'dark', x, 0.16, z, len + 0.4, 0.32, 0.92, ry);
  const n = Math.max(1, Math.round(len / 2.6));
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.5) continue;
    const u = (i - (n - 1) / 2) * (len / n);
    push(B, 'tile', x + Math.cos(ry) * u, 2.56, z - Math.sin(ry) * u, 0.5, 0.18, 0.7, ry, 0, (rnd() - 0.5) * 0.2);
  }
  push(B, 'ao', x, 0, z, Math.max(3, len), 1, 1.6);
}

function gatePair(B, x, z, ry, rnd) {
  const ca = Math.cos(ry), sa = Math.sin(ry);
  [-1, 1].forEach(function (sgn) {
    const px = x + ca * 1.9 * sgn, pz = z + sa * 1.9 * sgn;
    push(B, 'plaster', px, 2.1, pz, 0.9, 4.2, 0.9, ry);
    push(B, 'tile', px, 4.32, pz, 1.3, 0.3, 1.3, ry + Math.PI / 4);
    push(B, 'ao', px, 0, pz, 1.8, 1, 1.8);
  });
  push(B, 'dark', x, 4.16, z, 5.0, 0.44, 0.6, ry);
  push(B, 'tile', x, 4.55, z, 5.6, 0.26, 1.4, ry);
  if (rnd() < 0.5) banner(B, x, z - 0.6, ry, 0.9, 3.2, rnd);
}

function shrineCairn(B, x, z, rnd) {
  for (let i = 0; i < 5; i++) {
    const s = 0.7 - i * 0.1;
    push(B, 'rock', x + (rnd() - 0.5) * 0.12, 0.2 + i * 0.34, z + (rnd() - 0.5) * 0.12, s, 0.3, s, rnd() * TAU);
  }
  push(B, 'ribbon', x, 2.1, z, 0.28, 1.0, 1, rnd() * TAU);
  push(B, 'glow', x, 0.03, z, 2.4, 1, 2.4);
  push(B, 'ao', x, 0, z, 1.6, 1, 1.4);
}

/* ---------- v0.23 제2막·제3막 소품 ---------- */
/* 석탑: 받침 + 층층 지붕 + 꼭대기 등. 산사의 방향을 잡아 준다. */
function stonePagoda(B, x, z, rnd, tiers) {
  const n = tiers || (3 + Math.floor(rnd() * 3));
  const base = 1.4 + rnd() * 0.5;
  push(B, 'rock', x, 0.18, z, base * 1.7, 0.36, base * 1.7, rnd() * TAU);
  let y = 0.38;
  for (let i = 0; i < n; i++) {
    const w = base * (1 - i * 0.15);
    push(B, 'plaster', x, y + 0.52, z, w, 1.02, w, rnd() * TAU);
    push(B, 'tile', x, y + 1.1, z, w * 1.55, 0.18, w * 1.55, rnd() * TAU);
    y += 1.18;
  }
  push(B, 'ember', x, y + 0.1, z, 0.32, 0.2, 0.32);
  push(B, 'glow', x, 0.03, z, 4.4, 1, 4.4);
  push(B, 'ao', x, 0, z, 3.0, 1, 2.8);
}
/* 설송: 눈을 얹은 소나무 — 설산 폐사찰의 표지 */
function snowPine(B, x, z, rnd) {
  /* v0.36 한지 팝업북: 층층 쌓던 상자·잎 대신 오린 소나무 한 장. */
  const h = 4.2 + rnd() * 2.8;
  push(B, 'pPine', x, h * 0.5, z, h, h, h, faceRy(rnd, 0.4));
  push(B, 'ao', x, 0, z, 2.2, 1, 2.0);
}
/* v0.37 비단 병풍 디오라마: 소나무 한 그루(카메라를 바라보는 한 장) — 장터·대숲·성문의 원경을 받친다. */
function pineTree(B, x, z, rnd) {
  const h = 4.4 + rnd() * 2.6;
  push(B, 'pPine', x, h * 0.5, z, h, h, h, faceRy(rnd, 0.3));
  push(B, 'ao', x, 0, z, 2.6, 1, 2.4);
}
/* 산문: 두 기둥과 긴 들보, 문 앞 등불 */
function stoneGate(B, x, z, ry, rnd) {
  const ca = Math.cos(ry), sa = Math.sin(ry);
  [-1, 1].forEach(function (sgn) {
    const px = x + ca * 2.0 * sgn, pz = z + sa * 2.0 * sgn;
    push(B, 'plaster', px, 2.4, pz, 0.8, 4.8, 0.8, ry);
    push(B, 'tile', px, 4.98, pz, 1.2, 0.3, 1.2, ry + Math.PI / 4);
    push(B, 'ao', px, 0, pz, 1.6, 1, 1.6);
  });
  push(B, 'dark', x, 4.62, z, 5.4, 0.5, 0.7, ry);
  push(B, 'tile', x, 5.1, z, 6.0, 0.3, 1.5, ry);
  push(B, 'paper', x, 3.4, z, 0.42, 0.6, 0.42);
  push(B, 'glow', x, 0.03, z, 5.2, 1, 5.2);
  if (rnd() < 0.6) banner(B, x + ca * 0.7, z + sa * 0.7, ry, 0.85, 3.0, rnd);
}
/* 혈석 제단: 붉은 원반과 여섯 기둥, 가운데 잉걸 */
function bloodAltar(B, x, z, rnd) {
  push(B, 'rock', x, 0.1, z, 2.7, 0.22, 2.7, rnd() * TAU, 0, 0, [1.4, 0.72, 0.72]);
  push(B, 'rock', x, 0.32, z, 1.7, 0.22, 1.7, rnd() * TAU, 0, 0, [1.55, 0.68, 0.68]);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    push(B, 'dark', x + Math.cos(a) * 1.6, 0.52, z + Math.sin(a) * 1.6, 0.17, 1.0, 0.17, a, 0, 0.18);
  }
  push(B, 'ember', x, 0.42, z, 0.9, 0.12, 0.7);
  push(B, 'glow', x, 0.03, z, 6.2, 1, 6.2);
  push(B, 'ao', x, 0, z, 3.4, 1, 3.0);
}
/* 혈석 뾰족바위 */
function bloodSpire(B, x, z, rnd) {
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const h = 1.6 + rnd() * 3.6, w = 0.5 + rnd() * 0.6;
    push(B, 'rock', x + (rnd() - 0.5) * 1.4, h * 0.5, z + (rnd() - 0.5) * 1.4, w, h, w,
      rnd() * TAU, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2, [1.5, 0.6, 0.6]);
  }
  push(B, 'glow', x, 0.03, z, 3.2, 1, 3.2);
  push(B, 'ao', x, 0, z, 2.6, 1, 2.2);
}
/* 뼈 무더기: 갈비와 해골 */
function bonePile(B, x, z, rnd) {
  push(B, 'rock', x, 0.06, z, 2.0, 0.12, 1.6, rnd() * TAU, 0, 0, [2.1, 1.9, 1.55]);
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU, L = 0.6 + rnd() * 1.2;
    push(B, 'plaster', x + Math.cos(a) * rnd() * 1.2, 0.1 + rnd() * 0.12, z + Math.sin(a) * rnd() * 1.2,
      0.08, 0.08, L, a, 0, (rnd() - 0.5) * 0.1, [1.65, 1.55, 1.3]);
  }
  push(B, 'rock', x, 0.22, z, 0.34, 0.3, 0.36, rnd() * TAU, 0, 0, [1.95, 1.85, 1.55]);
  push(B, 'ao', x, 0, z, 2.0, 1, 1.7);
}

/* 청크 하나를 (스테이지, cx, cz) 시드로 짓는다. 월드 좌표 아이템과 항아리 자리를 돌려준다. */
export function buildChunkData(cx, cz, stageId) {
  const rnd = mulberry(seedOf(cx, cz, stageId));
  const B = emptyBuckets();
  const occupied = [];
  const jars = [];
  const originChunk = (cx === 0 && cz === 0);
  const clearR = originChunk ? 4.0 : 2.6;
  const W = function (lx) { return cx * CHUNK + lx; };
  const Z = function (lz) { return cz * CHUNK + lz; };
  const theme = stageId;

  function addOcc(lx, lz, r) { occupied.push({ x: lx, z: lz, r: r }); }

  /* 바닥 먹 자국 — 넓고 옅은 얼룩으로 회색 판석이 획처럼 읽히게. */
  for (let i = 0; i < 3; i++) {
    const p = spot(rnd, 0.4, []);
    if (!p) break;
    push(B, 'stain', W(p.x), 0.014, Z(p.z), 4 + rnd() * 6, 1, 4 + rnd() * 6, rnd() * TAU);
  }

  if (theme === 1) {
    /* 장터: 좌판 두 채 + 헛간 + 살림 */
    const stalls = 1 + (rnd() < 0.65 ? 1 : 0);
    for (let i = 0; i < stalls; i++) {
      const p = spot(rnd, clearR + 2.0, occupied);
      if (!p) continue;
      const ry = rnd() * TAU;
      if (i === 1) burntStall(B, W(p.x), Z(p.z), ry, rnd);
      else marketStall(B, W(p.x), Z(p.z), ry, rnd, rnd() < 0.16);
      addOcc(p.x, p.z, 2.6);
    }
    if (rnd() < 0.62) {
      const p = spot(rnd, clearR + 3.0, occupied);
      if (p) {
        const ry = rnd() * TAU, w = 4.4 + rnd() * 2.4, d = 3.6 + rnd() * 1.4, h = 4.2 + rnd() * 0.9;
        /* v0.36 팝업복: 박스 벽 + 지붕 두 장 대신 오린 기와집 한 장. */
        push(B, 'pHouse', W(p.x), h * 0.5, Z(p.z), h, h, h, faceRy(rnd, 0.2));
        push(B, 'ao', W(p.x), 0, Z(p.z), w * 1.2, 1, d * 1.15);
        push(B, 'glow', W(p.x) + Math.sin(ry) * 0.9, 0.03, Z(p.z) + Math.cos(ry) * 0.9, 4.2, 1, 4.2);
        if (rnd() < 0.6) push(B, 'paper', W(p.x) + Math.cos(ry) * 1.6, 1.9, Z(p.z) - Math.sin(ry) * 1.6, 0.42, 0.54, 0.42);
        addOcc(p.x, p.z, 3.6);
      }
    }
    for (let i = 0; i < 5; i++) {
      const p = spot(rnd, clearR, occupied);
      if (!p) continue;
      if (rnd() < 0.5) push(B, 'wood', W(p.x), 0.24, Z(p.z), 0.42 + rnd() * 0.35, 0.34 + rnd() * 0.3, 0.42 + rnd() * 0.3, rnd() * TAU);
      else push(B, 'dark', W(p.x), 0.32, Z(p.z), 0.3, 0.34, 0.3, rnd() * TAU);
      addOcc(p.x, p.z, 1.1);
    }
    /* 심안 안쪽을 채우는 작은 살림 — 플레이를 막지 않는 크기로 가까이 */
    for (let i = 0; i < 8; i++) {
      const p = spot(rnd, clearR - 0.4, occupied);
      if (!p) continue;
      const kind = rnd();
      if (kind < 0.36) push(B, 'wood', W(p.x), 0.18, Z(p.z), 0.36 + rnd() * 0.3, 0.26 + rnd() * 0.22, 0.34 + rnd() * 0.24, rnd() * TAU);
      else if (kind < 0.62) push(B, 'dark', W(p.x), 0.22, Z(p.z), 0.24 + rnd() * 0.16, 0.26 + rnd() * 0.2, 0.24 + rnd() * 0.16, rnd() * TAU);
      else if (kind < 0.82) push(B, 'rock', W(p.x), 0.12, Z(p.z), 0.3 + rnd() * 0.4, 0.18 + rnd() * 0.24, 0.3 + rnd() * 0.4, rnd() * TAU);
      else push(B, 'leaf', W(p.x), 0.3, Z(p.z), 0.9 + rnd() * 0.7, 0.8 + rnd() * 0.5, 0.9, rnd() * TAU);
      addOcc(p.x, p.z, 0.8);
    }
    for (let i = 0; i < 6; i++) {
      const p = spot(rnd, 1.6, occupied);
      if (!p) continue;
      push(B, 'stain', W(p.x), 0.016, Z(p.z), 1.2 + rnd() * 2.4, 1, 1.2 + rnd() * 2.4, rnd() * TAU);
      if (rnd() < 0.5) push(B, 'rock', W(p.x), 0.16, Z(p.z), 0.4 + rnd() * 0.7, 0.26 + rnd() * 0.4, 0.4 + rnd() * 0.7, rnd() * TAU);
    }
    if (rnd() < 0.55) {
      const p = spot(rnd, clearR + 1.2, occupied);
      if (p) stoneLantern(B, W(p.x), Z(p.z), rnd);
    }
    /* 장터 뒤편의 소나무 — 화면 위쪽 원경에 수묵 실루엣을 세운다. */
    for (let i = 0; i < 2; i++) {
      const p = spot(rnd, clearR + 3.2, occupied);
      if (!p) continue;
      pineTree(B, W(p.x), Z(p.z), rnd);
      addOcc(p.x, p.z, 2.2);
    }
    if (rnd() < 0.42) {
      const p = spot(rnd, clearR + 1.0, occupied);
      if (p) {
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * TAU;
          push(B, 'rock', W(p.x) + Math.cos(a) * 0.7, 0.12, Z(p.z) + Math.sin(a) * 0.7, 0.22, 0.16, 0.22, rnd() * TAU);
        }
        push(B, 'ember', W(p.x), 0.12, Z(p.z), 0.62, 0.14, 0.5);
        push(B, 'glow', W(p.x), 0.03, Z(p.z), 4.2, 1, 4.2);
        push(B, 'ao', W(p.x), 0, Z(p.z), 2.4, 1, 2.2);
        addOcc(p.x, p.z, 1.8);
      }
    }
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR, occupied);
      if (!p) continue;
      push(B, 'leaf', W(p.x), 0.4 + rnd() * 0.3, Z(p.z), 1.3 + rnd() * 1.0, 1.1 + rnd() * 0.8, 1.3, rnd() * TAU);
    }
  } else if (theme === 2) {
    /* 성문: 성벽 한 줄 + 문기둥 + 깃발 */
    for (let i = 0; i < 2; i++) {
      const p = spot(rnd, clearR + 2.2, occupied);
      if (!p) continue;
      const ry = rnd() < 0.5 ? 0 : Math.PI / 2;
      wallRun(B, W(p.x), Z(p.z), 5.5 + rnd() * 4.0, ry + (rnd() - 0.5) * 0.1, rnd);
      addOcc(p.x, p.z, 3.4);
    }
    if (rnd() < 0.42) {
      const p = spot(rnd, clearR + 2.4, occupied);
      if (p) { gatePair(B, W(p.x), Z(p.z), rnd() < 0.5 ? 0 : Math.PI / 2, rnd); addOcc(p.x, p.z, 3.4); }
    }
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR, occupied);
      if (!p) continue;
      banner(B, W(p.x), Z(p.z), rnd() * TAU, 0.9, 2.8 + rnd() * 1.2, rnd);
      addOcc(p.x, p.z, 1.0);
    }
    for (let i = 0; i < 7; i++) {
      const p = spot(rnd, clearR - 0.6, occupied);
      if (!p) continue;
      if (rnd() < 0.45) push(B, 'rock', W(p.x), 0.16, Z(p.z), 0.5 + rnd() * 0.8, 0.3 + rnd() * 0.5, 0.5 + rnd() * 0.7, rnd() * TAU);
      else push(B, 'stain', W(p.x), 0.016, Z(p.z), 0.9 + rnd() * 1.8, 1, 0.9 + rnd() * 1.8, rnd() * TAU);
    }
    if (rnd() < 0.5) {
      const p = spot(rnd, clearR + 1.0, occupied);
      if (p) stoneLantern(B, W(p.x), Z(p.z), rnd);
    }
    if (rnd() < 0.3) {
      const p = spot(rnd, clearR + 1.6, occupied);
      if (p) {
        /* v0.36 팝업복: 바위 더미를 오린 바위 실루엣으로. */
        const rh = 2.3 + rnd() * 1.3;
        push(B, 'pRock', W(p.x), rh * 0.5, Z(p.z), rh * 1.33, rh, rh * 1.33, faceRy(rnd, 0.5));
        push(B, 'ao', W(p.x), 0, Z(p.z), 2.6, 1, 2.4);
        addOcc(p.x, p.z, 2.2);
      }
    }
  } else if (theme === 3) {
    /* 대나무 골: 대숲 두세 무리 + 서낭당 + 바위 */
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR + 2.0, occupied);
      if (!p) continue;
      bambooClump(B, W(p.x), Z(p.z), rnd);
      addOcc(p.x, p.z, 2.8);
    }
    for (let i = 0; i < 5; i++) {
      const p = spot(rnd, clearR - 0.4, occupied);
      if (!p) continue;
      push(B, 'rock', W(p.x), 0.18, Z(p.z), 0.5 + rnd() * 0.9, 0.3 + rnd() * 0.5, 0.5 + rnd() * 0.8, rnd() * TAU);
      if (rnd() < 0.6) push(B, 'leaf', W(p.x), 0.22, Z(p.z), 1.1 + rnd() * 0.9, 0.8 + rnd() * 0.6, 1.1, rnd() * TAU);
      addOcc(p.x, p.z, 1.2);
    }
    if (rnd() < 0.4) {
      const p = spot(rnd, clearR + 1.2, occupied);
      if (p) { shrineCairn(B, W(p.x), Z(p.z), rnd); addOcc(p.x, p.z, 1.6); }
    }
    if (rnd() < 0.5) {
      const p = spot(rnd, clearR + 1.0, occupied);
      if (p) stoneLantern(B, W(p.x), Z(p.z), rnd);
    }
    /* 대숲 사이 늙은 소나무 한 그루 — 잎 결이 다른 실루엣으로 원경을 나눈다. */
    if (rnd() < 0.75) {
      const p = spot(rnd, clearR + 2.6, occupied);
      if (p) { pineTree(B, W(p.x), Z(p.z), rnd); addOcc(p.x, p.z, 2.2); }
    }
    for (let i = 0; i < 4; i++) {
      const p = spot(rnd, 1.4, occupied);
      if (!p) continue;
      push(B, 'stain', W(p.x), 0.016, Z(p.z), 1.4 + rnd() * 2.2, 1, 1.4 + rnd() * 2.2, rnd() * TAU);
      if (rnd() < 0.5) push(B, 'leaf', W(p.x), 0.18, Z(p.z), 0.9 + rnd() * 0.8, 0.7 + rnd() * 0.5, 0.9, rnd() * TAU);
    }
  } else if (theme === 4) {
    /* 붉은 달: 그을린 잔해 */
    for (let i = 0; i < 4; i++) {
      const p = spot(rnd, clearR + 2.0, occupied);
      if (!p) continue;
      burntStall(B, W(p.x), Z(p.z), rnd() * TAU, rnd);
      addOcc(p.x, p.z, 2.8);
    }
    for (let i = 0; i < 4; i++) {
      const p = spot(rnd, clearR + 1.4, occupied);
      if (!p) continue;
      deadTree(B, W(p.x), Z(p.z), rnd);
      push(B, 'glow', W(p.x), 0.03, Z(p.z), 3.0, 1, 3.0);
      addOcc(p.x, p.z, 1.8);
    }
    /* 잉걸불 무더기 — 붉은 달의 바닥을 밝히는 불 */
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR + 0.6, occupied);
      if (!p) continue;
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * TAU + rnd() * 0.4;
        push(B, 'dark', W(p.x) + Math.cos(a) * 0.5, 0.1, Z(p.z) + Math.sin(a) * 0.5, 0.4 + rnd() * 0.4, 0.12, 0.16, a, 0, (rnd() - 0.5) * 0.4);
      }
      push(B, 'ember', W(p.x), 0.1, Z(p.z), 0.9, 0.14, 0.7);
      push(B, 'glow', W(p.x), 0.03, Z(p.z), 4.6, 1, 4.6);
      push(B, 'ao', W(p.x), 0, Z(p.z), 2.2, 1, 2.0);
      addOcc(p.x, p.z, 1.4);
    }
    for (let i = 0; i < 6; i++) {
      const p = spot(rnd, 1.4, occupied);
      if (!p) continue;
      push(B, 'stain', W(p.x), 0.016, Z(p.z), 1.0 + rnd() * 2.6, 1, 1.0 + rnd() * 2.6, rnd() * TAU);
      if (rnd() < 0.4) push(B, 'rock', W(p.x), 0.14, Z(p.z), 0.4 + rnd() * 0.6, 0.24 + rnd() * 0.3, 0.4 + rnd() * 0.6, rnd() * TAU);
      if (rnd() < 0.3) push(B, 'ember', W(p.x), 0.04, Z(p.z), 0.5, 0.06, 0.4);
    }
    if (rnd() < 0.78) {
      const p = spot(rnd, clearR + 0.8, occupied);
      if (p) {
        push(B, 'dark', W(p.x), 0.5, Z(p.z), 1.5, 0.3, 2.2, rnd() * TAU, 0.14);
        push(B, 'dark', W(p.x) + 0.7, 0.34, Z(p.z) + 0.5, 0.1, 0.6, 0.9, rnd() * TAU, Math.PI / 2);
        push(B, 'ember', W(p.x), 0.06, Z(p.z), 1.2, 0.06, 0.8);
        push(B, 'glow', W(p.x), 0.03, Z(p.z), 3.0, 1, 3.0);
        push(B, 'ao', W(p.x), 0, Z(p.z), 2.6, 1, 2.4);
        addOcc(p.x, p.z, 2.0);
      }
    }
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR, occupied);
      if (!p) continue;
      push(B, 'cloth', W(p.x), 1.3 + rnd() * 0.9, Z(p.z), 0.6 + rnd() * 0.5, 1.1 + rnd() * 0.8, 1, rnd() * TAU, 0, (rnd() - 0.5) * 0.2);
    }
  }

  else if (theme === 5) {
    /* 안개 석탑: 탑 두세 기 + 돌등 + 안개 자욱 */
    for (let i = 0; i < 2 + (rnd() < 0.4 ? 1 : 0); i++) {
      const p = spot(rnd, clearR + 2.4, occupied);
      if (!p) continue;
      stonePagoda(B, W(p.x), Z(p.z), rnd);
      addOcc(p.x, p.z, 3.0);
    }
    for (let i = 0; i < 5; i++) {
      const p = spot(rnd, clearR - 0.4, occupied);
      if (!p) continue;
      if (rnd() < 0.5) stoneLantern(B, W(p.x), Z(p.z), rnd);
      else push(B, 'rock', W(p.x), 0.16, Z(p.z), 0.6 + rnd() * 0.9, 0.3 + rnd() * 0.5, 0.6 + rnd() * 0.8, rnd() * TAU);
      addOcc(p.x, p.z, 1.2);
    }
    for (let i = 0; i < 6; i++) {
      const p = spot(rnd, 1.4, occupied);
      if (!p) continue;
      push(B, 'stain', W(p.x), 0.016, Z(p.z), 1.6 + rnd() * 2.8, 1, 1.6 + rnd() * 2.8, rnd() * TAU);
      if (rnd() < 0.35) push(B, 'cloth', W(p.x), 1.4 + rnd() * 0.8, Z(p.z), 0.7, 1.2, 1, rnd() * TAU, 0, (rnd() - 0.5) * 0.2);
    }
  } else if (theme === 6) {
    /* 설산 폐사찰: 눈 덮인 소나무 + 무너진 기둥 + 눈더미 */
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR + 2.0, occupied);
      if (!p) continue;
      snowPine(B, W(p.x), Z(p.z), rnd);
      addOcc(p.x, p.z, 2.4);
    }
    for (let i = 0; i < 4; i++) {
      const p = spot(rnd, clearR - 0.2, occupied);
      if (!p) continue;
      const ry = rnd() * TAU;
      push(B, 'plaster', W(p.x), 0.24, Z(p.z), 0.62, 0.42, 2.6 + rnd() * 2.0, ry, Math.PI / 2 - 0.04, 0.02);
      push(B, 'tile', W(p.x), 0.44, Z(p.z), 0.9, 0.16, 1.2, ry, 0, 0.1);
      addOcc(p.x, p.z, 1.6);
    }
    if (rnd() < 0.35) {
      const p = spot(rnd, clearR + 2.2, occupied);
      if (p) { stoneGate(B, W(p.x), Z(p.z), rnd() < 0.5 ? 0 : Math.PI / 2, rnd); addOcc(p.x, p.z, 3.4); }
    }
    for (let i = 0; i < 7; i++) {
      const p = spot(rnd, 1.2, occupied);
      if (!p) continue;
      push(B, 'rock', W(p.x), 0.1, Z(p.z), 1.0 + rnd() * 1.6, 0.16, 1.0 + rnd() * 1.4, rnd() * TAU, 0, 0, [2.0, 2.15, 2.3]);
      if (rnd() < 0.4) push(B, 'stain', W(p.x), 0.02, Z(p.z), 1.4 + rnd() * 2.2, 1, 1.4 + rnd() * 2.2, rnd() * TAU);
    }
  } else if (theme === 7) {
    /* 고목 골: 잎을 잃은 고목과 낙엽, 바위 */
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR + 2.0, occupied);
      if (!p) continue;
      deadTree(B, W(p.x), Z(p.z), rnd);
      deadTree(B, W(p.x) + 0.9, Z(p.z) - 0.7, rnd);
      addOcc(p.x, p.z, 2.8);
    }
    for (let i = 0; i < 6; i++) {
      const p = spot(rnd, clearR - 0.4, occupied);
      if (!p) continue;
      if (rnd() < 0.55) push(B, 'leaf', W(p.x), 0.22, Z(p.z), 1.2 + rnd() * 1.2, 0.7 + rnd() * 0.5, 1.2, rnd() * TAU, 0, 0, [0.8, 0.72, 0.5]);
      else push(B, 'rock', W(p.x), 0.16, Z(p.z), 0.6 + rnd() * 0.9, 0.3 + rnd() * 0.5, 0.6 + rnd() * 0.8, rnd() * TAU);
      addOcc(p.x, p.z, 1.2);
    }
    if (rnd() < 0.5) {
      const p = spot(rnd, clearR + 1.2, occupied);
      if (p) { shrineCairn(B, W(p.x), Z(p.z), rnd); addOcc(p.x, p.z, 1.6); }
    }
    for (let i = 0; i < 5; i++) {
      const p = spot(rnd, 1.4, occupied);
      if (!p) continue;
      push(B, 'stain', W(p.x), 0.016, Z(p.z), 1.4 + rnd() * 2.2, 1, 1.4 + rnd() * 2.2, rnd() * TAU);
    }
  } else if (theme === 8) {
    /* 무명 산문: 석문 + 계단 + 탑 */
    for (let i = 0; i < 2; i++) {
      const p = spot(rnd, clearR + 2.6, occupied);
      if (!p) continue;
      stoneGate(B, W(p.x), Z(p.z), rnd() < 0.5 ? 0 : Math.PI / 2, rnd);
      addOcc(p.x, p.z, 3.6);
    }
    if (rnd() < 0.7) {
      const p = spot(rnd, clearR + 3.0, occupied);
      if (p) { stonePagoda(B, W(p.x), Z(p.z), rnd, 4); addOcc(p.x, p.z, 3.0); }
    }
    for (let i = 0; i < 5; i++) {
      const p = spot(rnd, clearR - 0.6, occupied);
      if (!p) continue;
      push(B, 'dark', W(p.x), 0.12, Z(p.z), 1.8, 0.16, 0.7, rnd() * TAU);
      push(B, 'tile', W(p.x), 0.24, Z(p.z), 2.0, 0.1, 0.9, rnd() * TAU);
      addOcc(p.x, p.z, 1.4);
    }
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR, occupied);
      if (!p) continue;
      banner(B, W(p.x), Z(p.z), rnd() * TAU, 0.95, 3.0 + rnd() * 1.2, rnd);
      addOcc(p.x, p.z, 1.0);
    }
  } else if (theme === 9) {
    /* 혈석 제단 */
    for (let i = 0; i < 2; i++) {
      const p = spot(rnd, clearR + 2.2, occupied);
      if (!p) continue;
      bloodAltar(B, W(p.x), Z(p.z), rnd);
      addOcc(p.x, p.z, 3.0);
    }
    for (let i = 0; i < 4; i++) {
      const p = spot(rnd, clearR + 1.2, occupied);
      if (!p) continue;
      bloodSpire(B, W(p.x), Z(p.z), rnd);
      addOcc(p.x, p.z, 2.0);
    }
    for (let i = 0; i < 5; i++) {
      const p = spot(rnd, 1.4, occupied);
      if (!p) continue;
      push(B, 'stain', W(p.x), 0.016, Z(p.z), 1.6 + rnd() * 2.6, 1, 1.6 + rnd() * 2.6, rnd() * TAU);
      if (rnd() < 0.4) push(B, 'ember', W(p.x), 0.04, Z(p.z), 0.6, 0.08, 0.5);
    }
  } else if (theme === 10) {
    /* 뼈의 강: 마른 강바닥과 뼈 무더기 */
    for (let i = 0; i < 4; i++) {
      const p = spot(rnd, clearR + 0.8, occupied);
      if (!p) continue;
      bonePile(B, W(p.x), Z(p.z), rnd);
      addOcc(p.x, p.z, 1.8);
    }
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR + 1.8, occupied);
      if (!p) continue;
      if (rnd() < 0.5) deadTree(B, W(p.x), Z(p.z), rnd);
      else bloodSpire(B, W(p.x), Z(p.z), rnd);
      addOcc(p.x, p.z, 2.2);
    }
    for (let i = 0; i < 6; i++) {
      const p = spot(rnd, 1.2, occupied);
      if (!p) continue;
      push(B, 'stain', W(p.x), 0.014, Z(p.z), 2.2 + rnd() * 3.4, 1, 1.0 + rnd() * 1.6, rnd() * TAU);
      if (rnd() < 0.3) push(B, 'rock', W(p.x), 0.12, Z(p.z), 0.6 + rnd() * 0.8, 0.2, 0.5 + rnd() * 0.6, rnd() * TAU);
    }
  } else if (theme === 11) {
    /* 혈월 성채: 성벽 + 깃발 + 화로 */
    for (let i = 0; i < 2; i++) {
      const p = spot(rnd, clearR + 2.4, occupied);
      if (!p) continue;
      const ry = rnd() < 0.5 ? 0 : Math.PI / 2;
      wallRun(B, W(p.x), Z(p.z), 5.5 + rnd() * 4.0, ry + (rnd() - 0.5) * 0.1, rnd);
      addOcc(p.x, p.z, 3.4);
    }
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR, occupied);
      if (!p) continue;
      banner(B, W(p.x), Z(p.z), rnd() * TAU, 1.0, 3.2 + rnd() * 1.4, rnd);
      addOcc(p.x, p.z, 1.0);
    }
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR + 0.6, occupied);
      if (!p) continue;
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * TAU;
        push(B, 'dark', W(p.x) + Math.cos(a) * 0.5, 0.1, Z(p.z) + Math.sin(a) * 0.5, 0.4, 0.12, 0.16, a, 0, 0);
      }
      push(B, 'ember', W(p.x), 0.1, Z(p.z), 0.9, 0.14, 0.7);
      push(B, 'glow', W(p.x), 0.03, Z(p.z), 4.8, 1, 4.8);
      push(B, 'ao', W(p.x), 0, Z(p.z), 2.2, 1, 2.0);
      addOcc(p.x, p.z, 1.4);
    }
    for (let i = 0; i < 2; i++) {
      const p = spot(rnd, clearR + 1.2, occupied);
      if (!p) continue;
      bloodSpire(B, W(p.x), Z(p.z), rnd);
      addOcc(p.x, p.z, 2.0);
    }
  } else {
    /* 나락의 심연: 검붉은 뾰족바위와 제단, 갈라진 땅 */
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR + 1.8, occupied);
      if (!p) continue;
      bloodSpire(B, W(p.x), Z(p.z), rnd);
      addOcc(p.x, p.z, 2.2);
    }
    for (let i = 0; i < 2; i++) {
      const p = spot(rnd, clearR + 2.6, occupied);
      if (!p) continue;
      bloodAltar(B, W(p.x), Z(p.z), rnd);
      addOcc(p.x, p.z, 3.0);
    }
    for (let i = 0; i < 8; i++) {
      const p = spot(rnd, 1.2, occupied);
      if (!p) continue;
      push(B, 'stain', W(p.x), 0.014, Z(p.z), 2.6 + rnd() * 4.0, 1, 0.7 + rnd() * 1.2, rnd() * TAU);
      if (rnd() < 0.5) push(B, 'ember', W(p.x), 0.04, Z(p.z), 0.7 + rnd() * 0.5, 0.08, 0.5 + rnd() * 0.4);
      if (rnd() < 0.35) push(B, 'dark', W(p.x), 0.3, Z(p.z), 0.16, 0.6, 1.6 + rnd() * 2.0, rnd() * TAU, 0, (rnd() - 0.5) * 0.3);
    }
    for (let i = 0; i < 3; i++) {
      const p = spot(rnd, clearR, occupied);
      if (!p) continue;
      push(B, 'cloth', W(p.x), 1.5 + rnd() * 0.9, Z(p.z), 0.7 + rnd() * 0.5, 1.2 + rnd() * 0.8, 1, rnd() * TAU, 0, (rnd() - 0.5) * 0.2);
    }
  }

  /* 청크마다 최소 하나의 화톳불 — 어두운 장에서도 따뜻한 빛의 닻이 된다. */
  if (!B.ember.length) {
    const p = spot(rnd, clearR + 1.4, occupied);
    if (p) {
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * TAU;
        push(B, 'rock', W(p.x) + Math.cos(a) * 0.7, 0.12, Z(p.z) + Math.sin(a) * 0.7, 0.22, 0.16, 0.22, rnd() * TAU);
      }
      push(B, 'ember', W(p.x), 0.12, Z(p.z), 0.7, 0.16, 0.55);
      push(B, 'glow', W(p.x), 0.03, Z(p.z), 5.0, 1, 5.0);
      push(B, 'ao', W(p.x), 0, Z(p.z), 2.6, 1, 2.4);
      addOcc(p.x, p.z, 1.6);
    }
  }

  /* 심안 둘레를 받쳐 주는 등불 기둥 — 어느 방향을 봐도 무대가 읽히게. */
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3 + rnd() * 0.5;
    const r = 5.0 + rnd() * 3.0;
    const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
    if (Math.hypot(lx, lz) < clearR + 2.0) continue;
    lanternPost(B, W(lx), Z(lz), rnd);
    addOcc(lx, lz, 1.0);
  }

  /* 묵항아리: 시드 자리 두세 개. 소품과 겹치지 않게, 동선 한가운데는 비워 둔다. */
  const jarN = 2 + (rnd() < 0.35 ? 1 : 0);
  for (let i = 0; i < jarN; i++) {
    let p = null;
    for (let k = 0; k < 24 && !p; k++) {
      const c = spot(rnd, Math.max(2.6, clearR - 0.6), occupied);
      if (!c) continue;
      let ok = true;
      for (let j = 0; j < jars.length; j++) if (Math.hypot(c.x - jars[j].lx, c.z - jars[j].lz) < 3.0) ok = false;
      if (ok) p = c;
    }
    if (!p) continue;
    jars.push({ lx: p.x, lz: p.z, idx: i, x: W(p.x), z: Z(p.z), ry: rnd() * TAU });
    addOcc(p.x, p.z, 1.2);
    push(B, 'glow', W(p.x), 0.03, Z(p.z), 1.8, 1, 1.8);
    push(B, 'ao', W(p.x), 0, Z(p.z), 1.1, 1, 1.0);
  }

  return { cx: cx, cz: cz, stageId: stageId, seed: seedOf(cx, cz, stageId), buckets: B, jars: jars };
}

/* ---------- 청크 월드 ---------- */
/* v0.48 이전의 3×3 시드 청크 무한맵 — `?arena=0` 비교용으로만 남긴다. */
function createChunkWindow(opts) {
  opts = opts || {};
  const stageId = opts.stageId || 1;
  const mapId = opts.mapId || 'map1';
  const M = makeMaterials(stageId);
  /* 청크 소품은 멀리서도 형체가 읽히도록 재질을 한 단계 밝힌다(수묵 실루엣은 유지). */
  [['wood', 1.55], ['woodDark', 1.7], ['plaster', 1.35], ['tile', 1.4], ['clothBox', 1.45], ['cloth', 1.35], ['rock', 1.9], ['rockMoss', 1.6], ['bronze', 1.4], ['ash', 1.5]].forEach(function (p) {
    const m = M[p[0]];
    if (m && m.color) m.color.multiplyScalar(p[1]);
  });

  const group = new THREE.Group();
  group.name = 'chunkworld-' + mapId + '-' + stageId;

  /* v0.36 한지·수묵 팝업북 소품 재질 — 오린 종이 실루엣을 교차 평면에 세운다.
     map 은 알파 컷아웃(alphaTest)이라 그림자도 종이 모양 그대로 떨어진다. color 는 장 색조. */
  const PAPER_TINT = {
    1: 0xfff3e2, 2: 0xdde6f4, 3: 0xe6f2e2, 4: 0xffd8cc,
    5: 0xd8e6ee, 6: 0xe2eaf6, 7: 0xdceae0, 8: 0xe8e2f2,
    9: 0xffd0cc, 10: 0xf6e2cc, 11: 0xffc8c4, 12: 0xffbcbc
  }[stageId] || 0xfff3e2;
  const paperMats = {};
  /* v0.37: images CLI 로 그린 수묵화 PNG(투명 컷아웃)가 있으면 그것을 쓴다.
     없으면(로딩 실패·오프라인) v0.36 절차 캔버스로 그대로 되돌아간다. */
  [['house', 31], ['bamboo', 47], ['pine', 59], ['lantern', 71], ['rock', 83]].forEach(function (k) {
    const png = texOf(k[0]);
    let tex = png;
    if (!tex) {
      tex = new THREE.CanvasTexture(paperPropCanvas(k[0], k[1]));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
    }
    /* 등불·기와집은 창호지 창이 스스로 빛난다(밤 무대에서 호박빛이 살아나게). */
    const lit = (k[0] === 'lantern' || k[0] === 'house');
    paperMats[k[0]] = new THREE.MeshStandardMaterial({
      map: tex, color: new THREE.Color(PAPER_TINT).multiplyScalar(png ? 0.92 : 1.75),
      alphaTest: png ? 0.4 : 0.44, side: THREE.DoubleSide,
      roughness: 0.96, metalness: 0.0,
      /* 종이 윗면에만 아주 옅은 자체 빛 — 검은 실루엣이 완전한 구멍이 되지 않게. */
      emissive: lit ? new THREE.Color(0xffb45c) : new THREE.Color(0.05, 0.043, 0.036),
      emissiveMap: lit ? tex : null,
      emissiveIntensity: lit ? 0.42 : 1.0
    });
    /* v0.39: 종이 컷아웃 소품은 cardstock 'paper' 프로필(역광 투과·시트 톤이 가장 강한 층)을 쓴다. */
    paperMats[k[0]].userData.cardProfile = 'paper';
  });

  /* 바닥: 24m 판 하나를 청크마다 깔고, 텍스처 반복을 맞춰 이웃 청크와 무늬가 이어진다.
     v0.37: images CLI 로 구운 사각 돌판(512, 심리스) + 그 휘도에서 뽑은 노멀·러프니스를 쓴다.
     판 하나가 4.8m(반복 5) — 1.2m 판석 네 줄이 24m 청크에 깔린다(4번 시안과 같은 결). */
  const gStyle = GROUND_STYLE[stageId] || GROUND_STYLE[1];
  const gs = groundSet(gStyle);
  const REPEAT = 5;
  /* v0.41: 바탕면은 '흙(soil)'이 되고, 판석은 inkfloor.js 의 인스턴스 레이어가 얹는다.
     바닥 에셋이 없으면(로드 실패) v0.40 의 512 사각 판석으로 그대로 폴백한다. */
  const v41Floor = floorReady();
  const floorKey = 'floor-' + stageId + (v41Floor ? '-hanji' : '');
  let fset = FLOOR_CACHE.get(floorKey);
  if (!fset) {
    const fMap = v41Floor ? soilTexture() : texOf('floor'), fN = v41Floor ? null : texOf('floorN'), fR = v41Floor ? null : texOf('floorR');
    const map = (fMap || gs.map).clone(); map.needsUpdate = true; map.repeat.set(v41Floor ? 3 : REPEAT, v41Floor ? 3 : REPEAT);
    const nrm = fN ? (fN || gs.normalMap).clone() : null; if (nrm) { nrm.needsUpdate = true; nrm.repeat.set(REPEAT, REPEAT); }
    const rgh = fR ? (fR || gs.roughnessMap).clone() : null; if (rgh) { rgh.needsUpdate = true; rgh.repeat.set(REPEAT, REPEAT); }
    [map, nrm, rgh].forEach(function (t) { if (t && t.userData) t.userData.shared = true; });
    /* 장마다 다른 돌빛: 시드 스타일의 stone 색에 한지·호박 기운을 얹는다. */
    const st = gStyle.stone;
    /* v0.37: 사각 돌판 PNG 는 밝고 주황이 강해 그대로 쓰면 무대가 하얗게 뜬다.
       장별 돌빛을 0.42 로 눌러 밤 알베도로 맞추고, 살짝 중성으로 당긴다. */
    const raw = new THREE.Color(st[0] * 2.55 * 1.16, st[1] * 2.55, st[2] * 2.55 * 0.80);
    if (!v41Floor) {
      if (fMap) {
        const g = (raw.r + raw.g + raw.b) / 3;
        raw.lerp(new THREE.Color(g, g, g), 0.28);
      }
    }
    /* v0.43: 바닥은 이제 '따뜻한 한지·연갈색'(1~3막 공통). 장별로 아주 옅은 기운만 남긴다. */
    if (v41Floor) {
      const warm = new THREE.Color(1.02, 0.955, 0.855);
      const g = (st[0] + st[1] + st[2]) / 3;
      const cool = new THREE.Color(Math.min(1.1, st[2] / Math.max(1e-4, g)), Math.min(1.1, st[1] / Math.max(1e-4, g)), Math.min(1.1, st[0] / Math.max(1e-4, g)));
      warm.lerp(cool, stageId >= 5 && stageId <= 8 ? 0.16 : (stageId >= 9 ? 0.12 : 0.08));
      raw.copy(warm);
    }
    const base = raw.multiplyScalar((v41Floor ? 1.02 : fMap ? 0.58 : 1) * FLOOR_MUL);
    fset = { map: map, normalMap: nrm, roughnessMap: rgh, base: base, png: !!fMap, soil: v41Floor };
    FLOOR_CACHE.set(floorKey, fset);
    /* 12장을 다 돌아도 GPU 텍스처가 쌓이지 않게 최근 4장만 남긴다(512 판석 3장 = 약 4MB). */
    while (FLOOR_CACHE.size > 4) {
      const oldKey = FLOOR_CACHE.keys().next().value;
      const old = FLOOR_CACHE.get(oldKey);
      FLOOR_CACHE.delete(oldKey);
      [old.map, old.normalMap, old.roughnessMap].forEach(function (t) { if (t && t.userData && t.userData.shared) { try { t.dispose(); } catch (e) {} } });
    }
  }
  const gmap = fset.map, gnorm = fset.normalMap, grough = fset.roughnessMap;
  const groundBase = fset.base.clone();
  const groundMat = new THREE.MeshStandardMaterial({
    map: gmap, normalMap: gnorm || null, roughnessMap: grough || null,
    normalScale: new THREE.Vector2(fset.png ? 0.78 : 0.3, fset.png ? 0.78 : 0.3),
    color: groundBase.clone(), roughness: 0.95, metalness: 0.0
  });
  groundMat.userData.inkGround = true; /* game.js 가 지면 소나 셰이더(inklights.js)를 붙이는 표식 */
  groundMat.userData.cardProfile = 'ground'; /* v0.39: 월드 안개를 가장 짙게 받는 층 */
  const groundGeo = new THREE.PlaneGeometry(CHUNK, CHUNK, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  const grounds = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Mesh(groundGeo, groundMat);
    g.receiveShadow = true;
    g.visible = false;
    group.add(g);
    grounds.push(g);
  }

  /* v0.41: 판석 레이어(창 전체에 한 번). 청크 창이 움직일 때 판 위치만 다시 쓴다. */
  const floorLayer = v41Floor ? createFloorLayer({ stageId: stageId, style: gStyle }) : null;
  if (floorLayer) group.add(floorLayer.group);
  let floorPlaced = false;
  function placeFloor(x0, z0, x1, z1) {
    if (!floorLayer) return;
    floorLayer.layout(x0, z0, x1, z1);
    floorPlaced = true;
  }

  const stainTex = shadowTexture();
  const stainMat = new THREE.MeshBasicMaterial({
    map: stainTex, transparent: true, opacity: 0.24, depthWrite: false, color: 0x07080c, fog: true
  });

  /* 영웅을 따라오는 등불: 무한맵에서도 심안 안쪽이 따뜻하게 읽힌다. v0.36: 컨셉 아트의 호박빛 못을 따라
     색을 더 붉고 따뜻하게(0xffa955), 어깨 너머 달빛은 조금 낮춰 가장자리를 먹빛으로 돌린다. */
  const heroLight = new THREE.PointLight(0xffb45c, 34, 20, 1.7);
  heroLight.position.set(0, 3.6, 1.6);
  group.add(heroLight);
  const rimLight = new THREE.PointLight(0x9fc0e0, 8, 30, 1.5);
  rimLight.position.set(3.2, 5.4, -3.0);
  group.add(rimLight);

  /* ---------- v0.37 접이식 비단 산수 병풍 ----------
     화면 위쪽(카메라 반대편)에만 두르는 원호 띠 → 미니어처 무대의 배경막.
     카메라 방위가 고정 45°라 "위쪽"도 고정: 영웅에서 (-1,-1) 방향 21m, 10판이 170°로 감싼다.
     판을 번갈아 반경을 흔들어 실제 접이식 병풍처럼 꺾인 주름을 만들고, 파노라마는 미러 반복해
     이음새 없이 잇는다. 판 높이 11m 라 화면 맨 위까지 덮고, 텍스처 위쪽은 알파로 하늘에 스민다.
     한 장의 지오메트리 → 드로우콜 1. */
  let screenMesh = null;
  const SCREEN = { N: 10, R: 21, H: 11, arc: Math.PI * 170 / 180, mid: Math.PI * 1.25, pleat: 0.85, x: null, z: null, tex: null };
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
    const N = SCREEN.N, R = SCREEN_R, H = SCREEN_H, pl = SCREEN.pleat;
    const arc = SCREEN.arc, a0 = SCREEN.mid - arc / 2;
    const chord = 2 * R * Math.sin(arc / (2 * N));
    /* 텍스처 한 조각이 정사각(2048×512 의 1/4)이 되도록 u 폭을 판 비율에 맞춘다. */
    const uw = chord / H;
    const pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i < N; i++) {
      const t0a = a0 + (i / N) * arc, t1a = a0 + ((i + 1) / N) * arc;
      const r0 = R + (i % 2 ? -pl : pl), r1 = R + (i % 2 ? pl : -pl);
      const x0 = Math.cos(t0a) * r0, z0 = Math.sin(t0a) * r0;
      const x1 = Math.cos(t1a) * r1, z1 = Math.sin(t1a) * r1;
      const u0 = i * uw, u1 = (i + 1) * uw;
      const b = i % 2 ? 0.80 : 1.0;   /* 접힌 면과 펴진 면의 명도 차 */
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
    /* 배경막: 조명을 받지 않게(밤에 실크가 하얗게 뜨지 않게) 기본 재질 + 어두운 배율. */
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

  try {
    /* v0.43: 막별 원경 파노라마(먼 산·처마·배·안개)를 먼저 쓰고, 없으면 옛 병풍으로. */
    const act = stageId <= 4 ? 1 : (stageId <= 8 ? 2 : 3);
    const st = panoOf(act) || texOf('screen');
    if (st) screenMesh = buildScreenRing(st);
  } catch (e) { screenMesh = null; }

  const geos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    plank: new THREE.PlaneGeometry(1, 1),
    sphere: new THREE.SphereGeometry(1, 10, 7),
    rock: rockGeo(5),
    leaf: crossQuads(),
    /* 한지 팝업북 스프라이트용: 세로로만 선 교차 평면(가로로 눕힌 세 번째 장은 뺐다). */
    paperPlane: (function () { const a = new THREE.PlaneGeometry(1, 1); const b2 = a.clone(); b2.rotateY(Math.PI / 2); return mergeGeo([a, b2]); })(),
    /* 카메라를 바라보는 한 장(집·소나무·석등·바위). */ paperPlane1: new THREE.PlaneGeometry(1, 1),
    bamboo: (function () { const g = new THREE.CylinderGeometry(0.055, 0.085, 1, 6, 1, true); g.translate(0, 0.5, 0); return g; })(),
    jar: (function () {
      const pts = [[0.0, 0.0], [0.2, 0.01], [0.3, 0.1], [0.34, 0.26], [0.33, 0.4], [0.26, 0.55], [0.19, 0.62], [0.17, 0.68], [0.22, 0.72], [0.19, 0.75]]
        .map(function (p) { return new THREE.Vector2(p[0], p[1]); });
      return new THREE.LatheGeometry(pts, 16);
    })(),
    seal: new THREE.PlaneGeometry(0.26, 0.42)
  };

  const jarMat = new THREE.MeshStandardMaterial({
    color: 0x24242c, roughness: 0.42, metalness: 0.14,
    emissive: new THREE.Color(0.05, 0.06, 0.1), emissiveIntensity: 0.9
  });
  const sealMat = new THREE.MeshStandardMaterial({
    map: plainSet('paper').map, color: 0xffe0b0, side: THREE.DoubleSide,
    emissive: new THREE.Color(1, 0.62, 0.28), emissiveIntensity: 0.85, roughness: 0.9
  });

  const bucketSpec = {
    wood: { geo: geos.box, mat: M.wood, cast: true },
    dark: { geo: geos.box, mat: M.woodDark, cast: true },
    plank: { geo: geos.plank, mat: M.woodDark, cast: false },
    plaster: { geo: geos.box, mat: M.plaster, cast: true },
    tile: { geo: geos.box, mat: M.tile, cast: true },
    canopy: { geo: geos.box, mat: M.clothBox, cast: true },
    cloth: { geo: geos.plank, mat: M.cloth, cast: false },
    ribbon: { geo: geos.plank, mat: M.ribbon, cast: false },
    paper: { geo: geos.sphere, mat: M.paper, cast: false },
    ember: { geo: geos.box, mat: M.ember, cast: false },
    rock: { geo: geos.rock, mat: M.rock, cast: true },
    leaf: { geo: geos.leaf, mat: M.leaf, cast: false },
    bamboo: { geo: geos.bamboo, mat: M.bamboo, cast: true },
    /* 한지 팝업북 스프라이트 배치 — aspect 는 텍스처 가로/세로 비(높이만 지정해도 그림이 안 늘어난다). */
    pHouse: { geo: geos.paperPlane1, mat: paperMats.house, cast: true, aspect: aspectOf('house') },
    pBamboo: { geo: geos.paperPlane, mat: paperMats.bamboo, cast: true, aspect: aspectOf('bamboo') },
    pPine: { geo: geos.paperPlane1, mat: paperMats.pine, cast: true, aspect: aspectOf('pine') },
    pLantern: { geo: geos.paperPlane1, mat: paperMats.lantern, cast: true, aspect: aspectOf('lantern') },
    pRock: { geo: geos.paperPlane1, mat: paperMats.rock, cast: true, aspect: aspectOf('rock') }
  };

  const dataCache = new Map();
  const brokenKeys = Object.create(null);
  const batches = [];
  let glowMesh = null, aoMesh = null, stainMesh = null;
  let jarMesh = null, jarSealMesh = null, jarCap = 0;
  let center = { cx: null, cz: null };
  let built = false;
  const dummy = new THREE.Object3D();

  const world = {
    group: group,
    stageId: stageId,
    mapId: mapId,
    jars: [],
    center: center,
    /* v0.39: 청크 배치는 update() 때 지연 생성되므로, 재질 목록을 내보내 game.js 가 한 번에 칠하게 한다. */
    materials: null,
    stats: { chunks: 0, props: 0, jars: 0, batches: 0, cached: 0, rebuilds: 0 }
  };

  function chunkData(cx, cz) {
    const k = chunkKey(cx, cz);
    let d = dataCache.get(k);
    if (!d) {
      d = buildChunkData(cx, cz, stageId);
      dataCache.set(k, d);
      world.stats.dataBuilt = (world.stats.dataBuilt || 0) + 1;
      if (dataCache.size > 49) {
        const first = dataCache.keys().next().value;
        dataCache.delete(first);
      }
    }
    return d;
  }

  /* ---------- v0.34 §14 청크 다시 짓기 비용 줄이기 ----------
     창(3×3)이 밀릴 때마다 지오메트리·InstancedMesh를 새로 만들면 그 프레임이 멈춘다.
     그래서 배치(종류별 InstancedMesh)를 한 번 만들고 **용량을 넉넉히** 잡아 두고,
     청크가 바뀌면 행렬만 다시 쓴다(버퍼 생성 없음). 창 밖 데이터는 데이터 캐시에서 버린다.
     배칭은 창 전체를 하나로 묶으므로 드로우콜도 예전과 같다(종류 수만큼). */
  const pooled = {};   /* bucket → { mesh, cap } */
  let groundUsed = [];

  function makeBatch(spec, cap) {
    const mesh = new THREE.InstancedMesh(spec.geo, spec.mat, cap);
    mesh.castShadow = !!spec.cast;
    mesh.receiveShadow = spec.receive !== false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    /* 소품 색(눈·혈석·해골)을 위해 색 버퍼를 함께 둔다. */
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.frustumCulled = false;
    return mesh;
  }
  function ensurePool(key, spec, need) {
    let p = pooled[key];
    if (p && p.cap >= need) return p;
    const cap = Math.max(16, Math.ceil(need * 1.35));
    if (p && p.mesh) { if (p.mesh.parent) p.mesh.parent.remove(p.mesh); if (p.mesh.dispose) p.mesh.dispose(); const ix = batches.indexOf(p.mesh); if (ix >= 0) batches.splice(ix, 1); }
    const mesh = makeBatch(spec, cap);
    group.add(mesh);
    batches.push(mesh);
    p = pooled[key] = { mesh: mesh, cap: cap };
    return p;
  }
  const _d = new THREE.Object3D();
  const _c = new THREE.Color();
  function writeBatch(p, items, fill) {
    const mesh = p.mesh;
    items.forEach(function (it, i) {
      fill(_d, it);
      _d.updateMatrix();
      mesh.setMatrixAt(i, _d.matrix);
      if (mesh.instanceColor) {
        if (it.color && it.color.length >= 3) { _c.setRGB(it.color[0], it.color[1], it.color[2]); mesh.setColorAt(i, _c); }
        else { _c.setRGB(1, 1, 1); mesh.setColorAt(i, _c); }
      }
    });
    for (let i = items.length; i < p.cap; i++) {
      _d.position.set(0, -999, 0); _d.rotation.set(0, 0, 0); _d.scale.set(0.0001, 0.0001, 0.0001);
      _d.updateMatrix(); mesh.setMatrixAt(i, _d.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.visible = true;
  }

  function rebuild(cx, cz, hx, hz) {
    const all = emptyBuckets();
    const jars = [];
    const chs = [];
    for (let dz = -WINDOW_R; dz <= WINDOW_R; dz++) {
      for (let dx = -WINDOW_R; dx <= WINDOW_R; dx++) {
        const ch = chunkData(cx + dx, cz + dz);
        chs.push(ch);
        Object.keys(all).forEach(function (k) {
          const src = ch.buckets[k];
          if (src && src.length) for (let i = 0; i < src.length; i++) all[k].push(src[i]);
        });
        ch.jars.forEach(function (j) {
          const key = chunkKey(ch.cx, ch.cz) + '#' + j.idx;
          const alive = !brokenKeys[key];
          jars.push({ id: key, cx: ch.cx, cz: ch.cz, x: j.x, z: j.z, ry: j.ry, alive: alive, broken: !alive, slot: -1 });
        });
      }
    }
    for (let i = 0; i < chs.length && i < grounds.length; i++) {
      const g = grounds[i];
      g.visible = true;
      g.position.set(chs[i].cx * CHUNK + HALF, 0, chs[i].cz * CHUNK + HALF);
    }
    placeFloor((cx - WINDOW_R) * CHUNK, (cz - WINDOW_R) * CHUNK, (cx + WINDOW_R + 1) * CHUNK, (cz + WINDOW_R + 1) * CHUNK);
    /* 소품 배치: 용량이 모자랄 때만 새 버퍼를 만든다(보통은 행렬만 다시 쓴다). */
    Object.keys(bucketSpec).forEach(function (k) {
      const items = all[k];
      const spec = bucketSpec[k];
      if (!items.length) { if (pooled[k]) pooled[k].mesh.visible = false; return; }
      const p = ensurePool(k, spec, items.length);
      writeBatch(p, items, function (d, it) {
        const sy = it.sy == null ? 1 : it.sy;
        const sx = it.sx == null ? 1 : it.sx;
        const w = spec.aspect ? sy * spec.aspect : sx;
        d.position.set(it.x || 0, it.y || 0, it.z || 0);
        d.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
        d.scale.set(w, sy, spec.aspect ? w : (it.sz == null ? 1 : it.sz));
      });
    });
    /* 불티·바닥 그림자·먹 자국은 수가 적어 매번 새로 만든다(이전 판과 같다). */
    if (glowMesh) { if (glowMesh.parent) glowMesh.parent.remove(glowMesh); if (glowMesh.dispose) glowMesh.dispose(); glowMesh = null; }
    if (aoMesh) { if (aoMesh.parent) aoMesh.parent.remove(aoMesh); if (aoMesh.dispose) aoMesh.dispose(); aoMesh = null; }
    if (stainMesh) { if (stainMesh.parent) stainMesh.parent.remove(stainMesh); if (stainMesh.dispose) stainMesh.dispose(); stainMesh = null; }
    if (all.glow.length) {
      glowMesh = glowBatch(all.glow.map(function (g) { return { x: g.x, y: g.y, z: g.z, size: g.sx || 3, squash: 1, ry: g.ry || 0, color: g.color }; }));
      if (glowMesh) { glowMesh.frustumCulled = false; group.add(glowMesh); }
    }
    if (all.ao.length) {
      aoMesh = aoBatch(all.ao.map(function (a) { return { x: a.x, z: a.z, size: a.sx, squash: 0.85 }; }));
      if (aoMesh) { aoMesh.frustumCulled = false; group.add(aoMesh); }
    }
    if (all.stain.length) {
      stainMesh = new THREE.InstancedMesh(geos.plank, stainMat, all.stain.length);
      const d = new THREE.Object3D();
      all.stain.forEach(function (it, i) {
        d.position.set(it.x, it.y || 0.014, it.z);
        d.rotation.set(-Math.PI / 2, 0, it.ry || 0);
        d.scale.set(it.sx, it.sz, 1);
        d.updateMatrix();
        stainMesh.setMatrixAt(i, d.matrix);
      });
      stainMesh.instanceMatrix.needsUpdate = true;
      stainMesh.renderOrder = 1; stainMesh.frustumCulled = false;
      stainMesh.receiveShadow = false; stainMesh.castShadow = false;
      group.add(stainMesh);
    }
    /* 항아리: 하나의 배치를 재사용하고, 부수면 그 슬롯만 줄인다. */
    if (jars.length) {
      if (!jarMesh || jarCap < jars.length) {
        const cap = Math.max(16, Math.ceil(jars.length * 1.4));
        if (jarMesh) { if (jarMesh.parent) jarMesh.parent.remove(jarMesh); if (jarMesh.dispose) jarMesh.dispose(); }
        if (jarSealMesh) { if (jarSealMesh.parent) jarSealMesh.parent.remove(jarSealMesh); if (jarSealMesh.dispose) jarSealMesh.dispose(); }
        jarMesh = new THREE.InstancedMesh(geos.jar, jarMat, cap);
        jarSealMesh = new THREE.InstancedMesh(geos.seal, sealMat, cap);
        jarMesh.castShadow = true; jarMesh.receiveShadow = true;
        jarMesh.frustumCulled = false; jarSealMesh.frustumCulled = false;
        jarMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        jarSealMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        group.add(jarMesh); group.add(jarSealMesh);
        jarCap = cap;
      }
      jarMesh.visible = true; jarSealMesh.visible = true;
      jars.forEach(function (j, i) {
        dummy.position.set(j.x, 0, j.z);
        dummy.rotation.set(0, j.ry, 0);
        dummy.scale.set(j.alive ? 1 : 0.0001, j.alive ? 1 : 0.0001, j.alive ? 1 : 0.0001);
        dummy.updateMatrix();
        jarMesh.setMatrixAt(i, dummy.matrix);
        dummy.position.set(j.x + Math.sin(j.ry) * 0.3, 0.44, j.z + Math.cos(j.ry) * 0.3);
        dummy.rotation.set(-0.18, j.ry, 0.1);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        jarSealMesh.setMatrixAt(i, dummy.matrix);
        j.slot = i;
      });
      for (let i = jars.length; i < jarCap; i++) {
        dummy.position.set(0, -999, 0); dummy.scale.set(0.0001, 0.0001, 0.0001); dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix(); jarMesh.setMatrixAt(i, dummy.matrix); jarSealMesh.setMatrixAt(i, dummy.matrix);
      }
      jarMesh.instanceMatrix.needsUpdate = true; jarSealMesh.instanceMatrix.needsUpdate = true;
    } else if (jarMesh) { jarMesh.visible = false; jarSealMesh.visible = false; }

    world.embers = all.ember.map(function (e) { return { x: e.x, y: (e.y || 0.12) + 0.2, z: e.z }; });
    world.jars = jars;
    world.stats.chunks = 9;
    world.stats.props = Object.keys(all).reduce(function (n, k) { return n + all[k].length; }, 0);
    /* v0.37 검수용: 고화질 PNG 소품이 몇 개 서 있는지 종류별로 남긴다. */
    world.stats.paper = { house: all.pHouse.length, bamboo: all.pBamboo.length, pine: all.pPine.length, lantern: all.pLantern.length, rock: all.pRock.length };
    world.stats.jars = jars.filter(function (j) { return j.alive; }).length;
    world.stats.jarTotal = jars.length;
    world.stats.batches = batches.length;
    world.stats.cached = dataCache.size;
    world.stats.rebuilds++;
    world.stats.lastBuilt = 9;
    built = true;
    const keep = new Set();
    for (let dz = -WINDOW_R; dz <= WINDOW_R; dz++) for (let dx = -WINDOW_R; dx <= WINDOW_R; dx++) keep.add(chunkKey(cx + dx, cz + dz));
    Array.from(dataCache.keys()).forEach(function (k) { if (!keep.has(k)) dataCache.delete(k); });
  }

  world.update = function (dt, t, hx, hz) {
    const cx = chunkOf(hx || 0), cz = chunkOf(hz || 0);
    if (!built || cx !== center.cx || cz !== center.cz) {
      center.cx = cx; center.cz = cz;
      world.center = center;
      rebuild(cx, cz, hx, hz);
    }
    /* 등불·잉걸불 숨쉬기 — v0.37: 장별 돌빛을 유지하면서 밝기만 살짝 흔든다. */
    const pulse = 0.9 + Math.sin(t * 2.4) * 0.1;
    if (groundMat && groundMat.color) groundMat.color.copy(groundBase).multiplyScalar(0.94 + 0.035 * pulse);
    heroLight.position.set(hx || 0, 3.5, (hz || 0) + 1.8);
    heroLight.intensity = 30 + 4 * pulse;

    rimLight.position.set((hx || 0) + 3.4, 5.6, (hz || 0) - 3.2);
  };

  /* 같은 자리에서 판을 다시 시작할 때: 청크 9개를 통째로 다시 짓지 않고 부순 항아리만 되살린다.
     (startRun마다 reset이 청크 9개 재구축을 한 프레임에 돌려 출전 직후가 멈추던 원인) */
  function resetJarsOnly() {
    world.jars.forEach(function (j) { j.alive = true; j.broken = false; });
    if (!jarMesh || !world.jars.length || !jarSealMesh) return;
    jarMesh.visible = true; jarSealMesh.visible = true;
    world.jars.forEach(function (j, i) {
      dummy.position.set(j.x, 0, j.z);
      dummy.rotation.set(0, j.ry, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); jarMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(j.x + Math.sin(j.ry) * 0.3, 0.44, j.z + Math.cos(j.ry) * 0.3);
      dummy.rotation.set(-0.18, j.ry, 0.1);
      dummy.updateMatrix(); jarSealMesh.setMatrixAt(i, dummy.matrix);
      j.slot = i;
    });
    jarMesh.instanceMatrix.needsUpdate = true; jarSealMesh.instanceMatrix.needsUpdate = true;
  }

  world.reset = function (hx, hz) {
    Object.keys(brokenKeys).forEach(function (k) { delete brokenKeys[k]; });
    const cx = chunkOf(hx || 0), cz = chunkOf(hz || 0);
    if (built && center.cx === cx && center.cz === cz) { resetJarsOnly(); return; }
    built = false;
    center.cx = null; center.cz = null;
    world.update(0, 0, hx || 0, hz || 0);
  };

  world.screenInfo = function () {
    return screenMesh ? { panels: SCREEN.N, r: SCREEN.R, h: SCREEN.H, x: 0, z: 0, png: true } : null;
  };

  world.jarsOnPath = function (ax, az, bx, bz, r) {
    const out = [];
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz || 1;
    world.jars.forEach(function (j) {
      if (!j.alive) return;
      const t = Math.max(0, Math.min(1, ((j.x - ax) * dx + (j.z - az) * dz) / L2));
      const px = ax + dx * t, pz = az + dz * t;
      if (Math.hypot(j.x - px, j.z - pz) <= (r || 1) + 0.55) out.push(j);
    });
    return out;
  };

  world.jarsNear = function (x, z, r) {
    return world.jars.filter(function (j) { return j.alive && Math.hypot(j.x - x, j.z - z) <= (r || 3); });
  };

  /* v0.39: 배치가 쓰는 모든 재질(청크가 나중에 메시를 만들므로 재질은 지금 존재한다). */
  world.materials = (function () {
    const list = [];
    Object.keys(M).forEach(function (k) { if (M[k] && M[k].isMaterial) list.push(M[k]); });
    Object.keys(paperMats).forEach(function (k) { if (paperMats[k]) list.push(paperMats[k]); });
    [groundMat, stainMat, jarMat, sealMat].forEach(function (m) { if (m) list.push(m); });
    if (floorLayer) floorLayer.materials.forEach(function (m) { if (m) list.push(m); });
    return list;
  })();

  world.breakJar = function (j) {
    if (!j || !j.alive) return false;
    j.alive = false;
    j.broken = true;
    brokenKeys[j.id] = 1;
    const n = Object.keys(brokenKeys).length;
    if (n > 600) { /* 기록이 무한정 쌓이지 않게 오래된 것부터 */
      Object.keys(brokenKeys).slice(0, 200).forEach(function (k) { delete brokenKeys[k]; });
    }
    if (jarMesh && j.slot >= 0) {
      dummy.position.set(j.x, 0, j.z);
      dummy.rotation.set(0, j.ry || 0, 0);
      dummy.scale.set(0.0001, 0.0001, 0.0001);
      dummy.updateMatrix();
      jarMesh.setMatrixAt(j.slot, dummy.matrix);
      jarSealMesh.setMatrixAt(j.slot, dummy.matrix);
      jarMesh.instanceMatrix.needsUpdate = true;
      jarSealMesh.instanceMatrix.needsUpdate = true;
    }
    if (world.stats) world.stats.jars = world.jars.filter(function (q) { return q.alive; }).length;
    return true;
  };

  world.dispose = function () {
    Object.keys(pooled).forEach(function (k) { const m = pooled[k].mesh; if (m) { if (m.parent) m.parent.remove(m); if (m.dispose) m.dispose(); } });
    [glowMesh, aoMesh, stainMesh, jarMesh, jarSealMesh, screenMesh].forEach(function (m) { if (m) { if (m.parent) m.parent.remove(m); if (m.dispose) m.dispose(); } });
    if (SCREEN.tex) { try { SCREEN.tex.dispose(); } catch (e) {} }
    grounds.forEach(function (g) { group.remove(g); });
    groundGeo.dispose();
    groundMat.dispose();
    if (floorLayer) floorLayer.dispose();
    /* 판석 텍스처는 장별로 공유된다 — 청크 월드를 버린다고 GPU 텍스처를 지우지 않는다. */
    [gmap, gnorm, grough].forEach(function (t) { if (t && t.userData && t.userData.shared !== true) t.dispose(); });
    stainMat.dispose();
    jarMat.dispose(); sealMat.dispose();
    Object.keys(geos).forEach(function (k) { if (geos[k] && geos[k].dispose) geos[k].dispose(); });
    Object.keys(M).forEach(function (k) { if (M[k] && M[k].dispose) M[k].dispose(); });
    group.removeFromParent();
  };

  return world;
}

/* ================================================================== v0.48 고정 아레나
   창현님 지시: "맵이 계속 확장 되면서 움직이지 말고 이 영상의 맵처럼 맵이 고정되어 있는
   상태에서…" — 청크 창이 영웅을 따라 밀리던 구조를 끄고, 한 번만 짓는 무대를 세운다.
   바닥·판석 레이어는 창 전체(ARENA.GROUND 반경)에 한 번 깔고, 기물은 inkarena.js 가
   전부 3D 메시로 지어 하나의 그룹으로 돌려준다. update() 는 이제 아무것도 다시 짓지 않는다. */
function createArenaWorld(opts) {
  opts = opts || {};
  const stageId = opts.stageId || 1;
  const mapId = opts.mapId || 'map1';
  const group = new THREE.Group();
  group.name = 'arenaWorld-' + mapId + '-' + stageId;

  // v0.49: Map the painted courtyard cleanly across the playable area without mirrored kaleidoscope tiling,
  // then blend organic multi-octave sumi-ink & hanji vertex washes over the 96x96 ground mesh.
  const texStageId = stageId > 12 ? (stageId - 4) : stageId;
  const url = new URL('../assets/ink-edition/terrain-' + texStageId + '.webp', import.meta.url);
  const map = new THREE.TextureLoader().load(url.href);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const coverage = 1.24;
  map.repeat.setScalar(coverage);
  map.offset.set((1 - coverage) * 0.5, (1 - coverage) * 0.5);
  map.center.set(0.5, 0.5);
  map.rotation = Math.PI / 4 + ((stageId * 0.31) % 0.6);
  const ACT4_GROUND_TINT = {
    13: [1.14, 0.80, 0.76],
    14: [0.80, 0.92, 1.12],
    15: [0.94, 0.88, 0.92],
    16: [1.12, 0.98, 0.80]
  };
  const gt = ACT4_GROUND_TINT[stageId] || [1, 0.96, 0.90];
  const groundBase = new THREE.Color(gt[0], gt[1], gt[2]).multiplyScalar(FLOOR_MUL * (stageId > 12 ? 2.55 : 2.3));
  const softGround = [1,3,6,7,10,14].includes(stageId);
  const detail = new THREE.TextureLoader().load(new URL('../assets/ink-edition/' +
    (softGround ? 'earth' : 'stone') + '-relief.webp', import.meta.url).href);
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.repeat.set(16, 16);
  detail.center.set(0.5, 0.5);
  detail.rotation = stageId * 0.47;
  detail.anisotropy = 4;
  const groundMat = new THREE.MeshStandardMaterial({
    map, bumpMap: detail, bumpScale: softGround ? 0.08 : 0.12, color: groundBase.clone(), roughness: 0.96, metalness: 0.0,
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
    groundMat.bumpScale *= 0.55;
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
    heroLight.intensity = 30 + 4 * pulse;
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
    groundGeo.dispose(); groundMat.dispose(); detail.dispose();
    if (arena) { arena.body.skeleton.dispose(); arena.materials.forEach(m => m.dispose()); }
    if (map && map.userData && map.userData.shared !== true) { try { map.dispose(); } catch (e) {} }
    group.removeFromParent();
  };

  return world;
}

/** v0.48 무대 팩토리 — 기본은 고정 아레나, `?arena=0` 이면 옛 무한 청크(비교용). */
export function createChunkWorld(opts) {
  let legacy = false;
  try { legacy = new URLSearchParams(location.search).get('arena') === '0'; } catch (e) {}
  if (legacy) return createChunkWindow(opts);
  return createArenaWorld(opts);
}
