/* v2/js/modules/stageTerrain.js — 심안: 묵검 v1.21 스테이지 지형 규칙 결정론적 지오메트리 모듈 */

export const TERRAIN_CFG = {
  rubble: { stumble: 0.2 },
  bamboo: { slow: 0.3, dmgMul: 1.3 },
  moon: { period: 20, lit: 5, speed: 1.2, coin: 2 },
  fog: { period: 10, amp: 0.08 },
  snow: { slip: 0.6 },
  root: { bind: 0.4, shockMul: 2 },
  bell: { reveal: 2.0, cd: 6 },
  blood: { regen: 0.9, offT: 8 },
  water: { lenMul: 0.7, slow: 0.7 },
  wall: { every: 30, tele: 1.2, r: 2.0, n: 3 }
};

function segDist2D(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-9) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function tHash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* 세포 격자 하나에 놓이는 둥근 지형 조각(잔해·대숲·종·혈석) */
export function tPatchAt(x, z, cell, seed, chance, minR, maxR, pad) {
  const cx0 = Math.floor(x / cell), cz0 = Math.floor(z / cell);
  const P = pad || 0;
  let best = null, bestD = 1e9;
  for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
    for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) {
      if (tHash(cx, cz, seed) >= chance) continue;
      const px = cx * cell + cell * 0.5 + (tHash(cx, cz, seed + 1) - 0.5) * cell * 0.62;
      const pz = cz * cell + cell * 0.5 + (tHash(cx, cz, seed + 2) - 0.5) * cell * 0.62;
      const rr = minR + tHash(cx, cz, seed + 3) * (maxR - minR);
      const d = Math.hypot(x - px, z - pz);
      if (d <= rr + P && d < bestD) {
        best = { x: px, z: pz, r: rr, key: cx + ':' + cz };
        bestD = d;
      }
    }
  }
  return best;
}

export function tPatchesNear(x, z, radius, cell, seed, chance, minR, maxR) {
  const out = [];
  const cx0 = Math.floor((x - radius) / cell), cx1 = Math.floor((x + radius) / cell);
  const cz0 = Math.floor((z - radius) / cell), cz1 = Math.floor((z + radius) / cell);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      if (tHash(cx, cz, seed) >= chance) continue;
      const px = cx * cell + cell * 0.5 + (tHash(cx, cz, seed + 1) - 0.5) * cell * 0.62;
      const pz = cz * cell + cell * 0.5 + (tHash(cx, cz, seed + 2) - 0.5) * cell * 0.62;
      const rr = minR + tHash(cx, cz, seed + 3) * (maxR - minR);
      if (Math.hypot(x - px, z - pz) <= radius + rr) {
        out.push({ x: px, z: pz, r: rr, key: cx + ':' + cz });
      }
    }
  }
  return out;
}

/* 뿌리: 세포마다 놓이는 짧은 선분 하나 */
export function tRootAt(x, z) {
  const cell = 7.0, seed = 71;
  const cx0 = Math.floor(x / cell), cz0 = Math.floor(z / cell);
  for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
    for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) {
      if (tHash(cx, cz, seed) >= 0.55) continue;
      const ax = cx * cell + cell * 0.5 + (tHash(cx, cz, seed + 1) - 0.5) * cell * 0.5;
      const az = cz * cell + cell * 0.5 + (tHash(cx, cz, seed + 2) - 0.5) * cell * 0.5;
      const a = tHash(cx, cz, seed + 3) * Math.PI;
      const half = 2.2 + tHash(cx, cz, seed + 4) * 1.6;
      const bx = ax + Math.cos(a) * half, bz = az + Math.sin(a) * half;
      if (segDist2D(x, z, ax, az, bx, bz) <= 0.55) {
        return { x: ax, z: az, x2: bx, z2: bz, r: 0.55, key: cx + ':' + cz };
      }
    }
  }
  return null;
}

/* 물길: 10장 '뼈의 강'과 14장 '망각의 나루'가 서로 다른 각도·위치·곡선으로 흐른다 */
export function getRiverCfg(stageId) {
  if (stageId === 14) {
    return {
      angle: -Math.PI * 0.36,
      offset: -3.6,
      flowDir: -1,
      centerFn: (u) => -4.2 * Math.cos(u * 0.095 + 0.7) + 1.8 * Math.sin(u * 0.045),
      widthFn: (u) => 2.25 + 0.65 * Math.cos(u * 0.11),
      deepCol: 0x090b18, shallowCol: 0x24334a, foamCol: 0xb6c7d9, moonCol: 0xc2d8ff
    };
  }
  return {
    angle: 0,
    offset: 0,
    flowDir: 1,
    centerFn: (u) => 5.5 * Math.sin(u * 0.085) + 2.0 * Math.sin(u * 0.021 + 1.3),
    widthFn: (u) => 2.1 + 0.7 * Math.sin(u * 0.13 + 0.6),
    deepCol: 0x0b1a1f, shallowCol: 0x2d484b, foamCol: 0xd9ceb8, moonCol: 0xf0dec2
  };
}

export function tWaterCenter(x, stageId) {
  const cfg = getRiverCfg(stageId || 10);
  return cfg.centerFn(x) + cfg.offset;
}

export function tWaterAt(x, z, stageId) {
  const cfg = getRiverCfg(stageId || 10);
  const cosA = Math.cos(-cfg.angle), sinA = Math.sin(-cfg.angle);
  const lx = x * cosA - z * sinA;
  const lz = x * sinA + z * cosA;
  const c = cfg.centerFn(lx) + cfg.offset;
  const w = cfg.widthFn(lx);
  return Math.abs(lz - c) <= w ? { x: x, z: z, r: w, key: 'river' } : null;
}

/* 그 자리의 지형 — 없으면 null */
export function resolveZoneAt(x, z, stage, state) {
  const T = stage && stage.terrain;
  if (!T || T.kind === 'none') return null;
  if (T.kind === 'rubble') {
    const p = tPatchAt(x, z, 5.0, 11, 0.42, 0.9, 1.9);
    return p ? { kind: 'rubble', x: p.x, z: p.z, r: p.r, key: p.key } : null;
  }
  if (T.kind === 'bamboo') {
    const p = tPatchAt(x, z, 6.5, 37, 0.55, 2.0, 3.4);
    return p ? { kind: 'bamboo', x: p.x, z: p.z, r: p.r, key: p.key } : null;
  }
  if (T.kind === 'root') {
    const p = tRootAt(x, z);
    return p ? Object.assign({ kind: 'root' }, p) : null;
  }
  if (T.kind === 'bell') {
    const p = tPatchAt(x, z, 10.0, 83, 0.4, 0.5, 0.5);
    return p ? { kind: 'bell', x: p.x, z: p.z, r: 1.3, key: p.key } : null;
  }
  if (T.kind === 'blood') {
    const p = tPatchAt(x, z, 8.0, 97, 0.55, 2.4, 3.2);
    if (!p) return null;
    const stones = (state && state.terrain && state.terrain.stones) || {};
    const elapsed = (state && state.elapsed) || 0;
    if ((stones[p.key] || 0) > elapsed) return null;
    return { kind: 'blood', x: p.x, z: p.z, r: p.r, key: p.key };
  }
  if (T.kind === 'water') {
    const p = tWaterAt(x, z, stage.id);
    return p ? Object.assign({ kind: 'water' }, p) : null;
  }
  return null;
}

export function resolveSegZone(from, to, stage, state) {
  for (let i = 1; i <= 6; i++) {
    const u = i / 6;
    const z = resolveZoneAt(from.x + (to.x - from.x) * u, from.z + (to.z - from.z) * u, stage, state);
    if (z) return z;
  }
  return null;
}
