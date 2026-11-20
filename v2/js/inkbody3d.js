/* v2/js/inkbody3d.js — v0.49 3D 캐릭터 공용 몸 만들기 도구.

   v0.48까지 3D 캐릭터는 뼈마다 원통·구를 하나씩 100% 바인딩한 '막대 인형'이었다(관절이 끊기고,
   도포 자락은 판 네 장). 이 모듈은 2D 원화(v2/assets/diorama/poses)의 실루엣을 따라가는 몸을 만든다.

   1) loft/tube — 높이별 단면(반지름·앞뒤 두께)을 이어 붙인 매끈한 곡면. 정점마다 위아래 두 뼈에
      가중치를 나눠 줘(스무스 스키닝) 팔꿈치·무릎·허리가 접히지 않고 휜다.
   2) skirtWeights — 도포·치마 자락을 골반·양 허벅지·자락 뼈에 나눠 묶는다. 다리가 나가면 자락이 밀린다.
   3) mergeBody — 스킨 파츠와 강체 파츠(상투·검·몽둥이)를 한 장의 SkinnedMesh 지오메트리로 합친다.
   4) walkPose — 발 궤적을 먼저 정하고 2관절 IK 로 허벅지·정강이 각을 푼다. 디딘 발은 보폭만큼만
      뒤로 가므로, 이동 속도에 재생 속도를 맞추면 발이 미끄러지지 않는다.
   5) clipFromKeys/clipFromFn — 키 사이를 이징(예비동작·오버슈트)으로 촘촘히 샘플한 AnimationClip.
   6) clothStep/uprightBone — 옷자락·머리끈 2차 흔들림 스프링, 지팡이를 세워 드는 구속.
   7) artTex — 원화에서 구운 무늬 아틀라스(tools/skin3d/extract.py → assets/diorama/skin3d/atlas.png). */
import * as THREE from 'three';
import * as TEX from './inktex3d.js';

/* ---------------------------------------------------------------- 원화 무늬 아틀라스 */
/** Atlas zone ids baked by tools/skin3d/extract.py (zone = 8 + cell index; 4×4 cells). */
export const AZ = {
  heroCloth: 8, heroFace: 9, minionCloth: 10, minionFace: 11,
  heavySkin: 12, heavyFace: 13, heavyStraw: 14, heavyTorso: 15,
  stoneRock: 16, stoneFace: 17, bossRobe: 18, bossMask: 19,
  bossTrim: 20, bossInner: 21, wood: 22, heavyPants: 23
};
const ART_OFF = (function () {
  try { return new URLSearchParams(location.search).get('noart') === '1'; } catch (e) { return false; }
})();
let _art = null;
/** Shared art-detail texture. Starts as a 1×1 neutral texel (ratio 1.0) and swaps to the atlas PNG once it
 *  has loaded, so characters built before the image arrives still render (flat colour) and pick it up later. */
export function artTex() {
  if (_art) return _art;
  const cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, 1, 1);
  const t = new THREE.Texture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  _art = t;
  if (!ART_OFF) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () { t.dispose(); t.image = img; t.needsUpdate = true; t.userData.loaded = true; };
    img.src = new URL('../assets/diorama/skin3d/atlas.png', import.meta.url).href;
  }
  return t;
}

/* ---------------------------------------------------------------- 스키닝 셰이더(정점) */
/** Vertex shader shared by every skinned ink character (hero and monsters). */
export const SKIN_VERT = [
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
/** Outline hull shaders (inverted hull, skinned). */
export const HULL_VERT = [
  '#include <common>',
  '#include <skinning_pars_vertex>',
  'void main() {',
  '  vec3 transformed = vec3(position);',
  '#include <skinbase_vertex>',
  '#include <skinning_vertex>',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);',
  '}'
].join('\n');
export const HULL_FRAG = 'uniform vec3 uColor;\nuniform float uAlpha;\nvoid main() { gl_FragColor = vec4(uColor, uAlpha); }';

/* ---------------------------------------------------------------- 형상 */
function hash2(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function spow(v, e) { return v < 0 ? -Math.pow(-v, e) : Math.pow(v, e); }

/**
 * Lofts a smooth surface through a list of cross-section rings.
 * ring: { y, x, z, rx, rzF, rzB, pl (pleat amplitude), jag (hem raggedness, m), tz (front-up tilt, m), w ({bone: weight}) }
 * opt:  { seg, arc:[a0,a1] (radians, 0 = front +Z; omitted = closed), capA, capB (close first/last ring),
 *         pleats (fold count), sq (superellipse exponent, <1 = boxier), tile (metres per texture tile),
 *         uvRect:[x0,x1,y0,y1] (planar front projection instead of wrapping), wfn(ring, angle, ringIndex) → weights,
 *         axis:'z' (ring axis runs along +Z instead of +Y: ring.y → z, ring z-radii → vertical) }
 * Returns { geo (indexed, smooth normals, uv), skin: [{bone: weight}, …] per vertex }.
 */
export function loft(rings, opt) {
  const o = opt || {};
  const seg = o.seg || 12;
  const closed = !o.arc;
  const a0 = closed ? -Math.PI : o.arc[0], a1 = closed ? Math.PI : o.arc[1];
  const cols = seg + 1, n = rings.length;
  const e = o.sq || 1;
  const tile = o.tile || 0.5;
  const pos = [], uv = [], skin = [];
  let vAcc = 0, circ = 0;
  for (let i = 0; i < n; i++) circ += (rings[i].rx + ((rings[i].rzF + rings[i].rzB) * 0.5)) * Math.PI;
  circ /= n;
  const uRep = Math.max(1, Math.round(circ * (closed ? 1 : (a1 - a0) / (Math.PI * 2)) / tile));
  for (let i = 0; i < n; i++) {
    const r = rings[i];
    if (i > 0) {
      const q = rings[i - 1];
      vAcc += Math.hypot(r.y - q.y, (r.rx - q.rx), (r.x || 0) - (q.x || 0), (r.z || 0) - (q.z || 0)) / tile;
    }
    for (let j = 0; j <= seg; j++) {
      const a = a0 + (a1 - a0) * (j / seg);
      const s = Math.sin(a), c = Math.cos(a);
      const jj = closed && j === seg ? 0 : j;
      const k = 1 + (r.pl || 0) * Math.sin(a * (o.pleats || 9) + (o.pleatPh || 0));
      const px = (r.x || 0) + r.rx * k * spow(s, e);
      const pz = (r.z || 0) + (c >= 0 ? r.rzF : r.rzB) * k * spow(c, e);
      const py = r.y + (r.jag ? r.jag * (hash2(jj, i) - 0.35) : 0) + (r.tz || 0) * c;
      if (o.axis === 'z') pos.push(px, pz, py); else pos.push(px, py, pz);
      if (o.uvRect) uv.push((px - o.uvRect[0]) / (o.uvRect[1] - o.uvRect[0]), (py - o.uvRect[2]) / (o.uvRect[3] - o.uvRect[2]));
      else uv.push((j / seg) * uRep, vAcc);
      skin.push(o.wfn ? o.wfn(r, a, i) : (r.w || null));
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = function (ri, flip) {
    const r = rings[ri];
    const ci = pos.length / 3;
    if (o.axis === 'z') pos.push(r.x || 0, r.z || 0, r.y); else pos.push(r.x || 0, r.y, r.z || 0);
    uv.push(0.5, ri === 0 ? 0 : vAcc);
    skin.push(o.wfn ? o.wfn(r, 0, ri) : (r.w || null));
    for (let j = 0; j < seg; j++) {
      const a = ri * cols + j, b = a + 1;
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  if (o.capA) cap(0, false);
  if (o.capB) cap(n - 1, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  /* 바깥을 보게: 첫 삼각형들의 법선이 축에서 멀어지는 쪽이 아니면 감는 방향을 뒤집는다. */
  const P = geo.getAttribute('position'), N = geo.getAttribute('normal');
  let dot = 0;
  const mid = Math.min(n - 1, Math.max(0, n >> 1));
  for (let j = 0; j < seg; j++) {
    const v = mid * cols + j, r = rings[mid];
    const ox = P.getX(v) - (r.x || 0);
    const oz = (o.axis === 'z' ? P.getY(v) : P.getZ(v)) - (r.z || 0);
    dot += ox * N.getX(v) + oz * (o.axis === 'z' ? N.getY(v) : N.getZ(v));
  }
  if (dot < 0) {
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  if (closed) {
    /* 이음매(뒤쪽) 양쪽 법선을 평균 — 먹선과 음영이 끊기지 않게. */
    const NN = geo.getAttribute('normal');
    for (let i = 0; i < n; i++) {
      const a = i * cols, b = a + seg;
      const x = NN.getX(a) + NN.getX(b), y = NN.getY(a) + NN.getY(b), z = NN.getZ(a) + NN.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      NN.setXYZ(a, x / l, y / l, z / l); NN.setXYZ(b, x / l, y / l, z / l);
    }
  }
  return { geo: geo, skin: skin };
}

/** Blend weights along a bone chain. chain = [[bone, yStart], …] in travel order (up or down the body);
 *  bone i owns the span from its yStart to the next joint, blending over ±blend around each joint. */
export function chainW(chain, y, blend) {
  const dir = chain.length > 1 && chain[1][1] < chain[0][1] ? -1 : 1;
  const s = y * dir;
  const bl = blend == null ? 0.07 : blend;
  let k = 0;
  for (let i = 1; i < chain.length; i++) if (s >= chain[i][1] * dir - bl) k = i;
  const w = {};
  if (k === 0) { w[chain[0][0]] = 1; return w; }
  const j = chain[k][1] * dir;
  const t = Math.max(0, Math.min(1, (s - (j - bl)) / (2 * bl)));
  const u = t * t * (3 - 2 * t);
  if (u >= 0.999) { w[chain[k][0]] = 1; return w; }
  w[chain[k - 1][0]] = 1 - u; w[chain[k][0]] = u;
  return w;
}

/**
 * A smooth-skinned tube along a vertical bone chain.
 * rows: [[y, rx, rzF, rzB, x, z, pl, jag], …] (rzF defaults to rx, rzB to rzF) — control sections, any order of y.
 * Extra rings are inserted around every joint so the bend is round, not creased.
 * opt: loft options + { chain, blend, color, zone, cx, cz (centre offsets added to every ring), nh, ht }.
 */
export function tube(rows, opt) {
  const o = opt || {};
  const chain = o.chain;
  const bl = o.blend == null ? 0.07 : o.blend;
  const R = rows.map(function (r) {
    const rzF = r[2] == null ? r[1] : r[2];
    return { y: r[0], rx: r[1], rzF: rzF, rzB: r[3] == null ? rzF : r[3], x: (r[4] || 0) + (o.cx || 0), z: (r[5] || 0) + (o.cz || 0), pl: r[6] || 0, jag: r[7] || 0 };
  });
  const dir = R[R.length - 1].y < R[0].y ? -1 : 1;
  const at = function (y) {
    for (let i = 1; i < R.length; i++) {
      const a = R[i - 1], b = R[i];
      if ((y - a.y) * dir >= 0 && (b.y - y) * dir >= 0) {
        const t = Math.abs(b.y - a.y) < 1e-6 ? 0 : (y - a.y) / (b.y - a.y);
        const L = function (k) { return a[k] + (b[k] - a[k]) * t; };
        return { y: y, rx: L('rx'), rzF: L('rzF'), rzB: L('rzB'), x: L('x'), z: L('z'), pl: L('pl'), jag: 0 };
      }
    }
    return null;
  };
  let rings = R.slice();
  if (chain) {
    for (let i = 1; i < chain.length; i++) {
      [-bl, -bl * 0.45, 0, bl * 0.45, bl].forEach(function (d) {
        const y = chain[i][1] + d;
        if (rings.some(function (r) { return Math.abs(r.y - y) < 0.012; })) return;
        const r = at(y);
        if (r) rings.push(r);
      });
    }
    rings.sort(function (a, b) { return (a.y - b.y) * dir; });
    rings.forEach(function (r) { if (!r.w) r.w = chainW(chain, r.y, bl); });
  }
  const L = loft(rings, o);
  return { geo: L.geo, skin: chain || o.wfn ? L.skin : null, color: o.color, zone: o.zone, nh: o.nh, ht: o.ht, uvKeep: true, b: o.bone, m: o.m || null };
}

/** Weight function for a robe skirt: waist rings follow the pelvis, lower rings are shared between the pelvis,
 *  the thigh on that side (so a stride pushes the cloth) and a lagging cloth bone (spring follow-through). */
export function skirtWeights(yTop, yHem, o) {
  const p = o || {};
  const pelvis = p.pelvis || 'pelvis', cloth = p.cloth || 'skirt';
  const legK = p.leg == null ? 0.62 : p.leg, clothK = p.clothK == null ? 0.55 : p.clothK;
  return function (ring, a) {
    const t = Math.max(0, Math.min(1, (yTop - ring.y) / Math.max(1e-4, yTop - yHem)));
    const k = t * t * (3 - 2 * t);
    const side = Math.max(-1, Math.min(1, Math.sin(a) * 1.6));
    const leg = legK * k;
    const wl = leg * (0.5 + 0.5 * side), wr = leg - wl;
    const rest = 1 - leg;
    const wc = rest * clothK * k;
    const w = {};
    w[pelvis] = rest - wc;
    if (wc > 0.001) w[cloth] = wc;
    if (wl > 0.001) w.thighL = wl;
    if (wr > 0.001) w.thighR = wr;
    return w;
  };
}

/** A rigid part bound 100% to one bone, drawn in that bone's local space. */
export function rigid(bone, geo, color, opt) {
  const o = opt || {};
  const q = new THREE.Quaternion();
  if (o.rot) q.setFromEuler(new THREE.Euler(o.rot[0] || 0, o.rot[1] || 0, o.rot[2] || 0, 'XYZ'));
  const s = o.scale || [1, 1, 1];
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(o.pos ? o.pos[0] : 0, o.pos ? o.pos[1] : 0, o.pos ? o.pos[2] : 0), q, new THREE.Vector3(s[0], s[1], s[2]));
  return { geo: geo, color: color, zone: o.zone, b: bone, m: m, nh: o.nh, ht: o.ht, uvKeep: !!o.uvKeep };
}
/** Ellipsoid. */
export function ball(r, sx, sy, sz, ws, hs) {
  const g = new THREE.SphereGeometry(r, ws || 10, hs || 7);
  g.scale(sx || 1, sy || 1, sz || 1);
  g.computeVertexNormals();
  return g;
}
/** Lumpy boulder with smooth normals (golem body, club knots). */
export function rock(r, seed, sx, sy, sz, amp) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const pos = g.getAttribute('position');
  const A = amp == null ? 0.20 : amp;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    /* 같은 자리의 정점은 같은 값으로 밀어야 면이 벌어지지 않는다(비인덱스 지오메트리). */
    const h = Math.sin(x * 37.1 / r + seed * 1.7) * Math.cos(y * 29.3 / r + seed * 2.3) * Math.sin(z * 31.7 / r + seed * 0.9);
    const k = 1 + A * h;
    pos.setXYZ(i, x * k * (sx || 1), y * k * (sy || 1), z * k * (sz || 1));
  }
  /* 정점을 합쳐 매끈한 법선을 만든다 — 먹선(헐)이 모서리에서 갈라지지 않는다. */
  const map = {}, idx = [], P = [];
  for (let i = 0; i < pos.count; i++) {
    const key = Math.round(pos.getX(i) * 2000) + '_' + Math.round(pos.getY(i) * 2000) + '_' + Math.round(pos.getZ(i) * 2000);
    if (map[key] == null) { map[key] = P.length / 3; P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    idx.push(map[key]);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

/* ---------------------------------------------------------------- 병합 */
/**
 * Merges skinned and rigid parts into one SkinnedMesh geometry (position/normal/color/uv/zone/skinIndex/skinWeight).
 * parts: output of tube()/rigid(). boneIdx: {bone: index}. rest: {bone: [x,y,z]} bind-pose joint positions (model space).
 * hullT > 0 builds the outline hull instead: parts flagged nh are skipped and vertices are pushed along their normals.
 */
export function mergeBody(parts, boneIdx, rest, hullT) {
  const bufs = [];
  let total = 0, idxTotal = 0;
  const T = new THREE.Matrix4();
  parts.forEach(function (p) {
    if (hullT && p.nh) return;
    let geo = p.geo.clone();
    if (!p.skin) {
      const r = rest[p.b] || [0, 0, 0];
      T.makeTranslation(r[0], r[1], r[2]);
      geo.applyMatrix4(p.m ? T.clone().multiply(p.m) : T);
    } else if (p.m) geo.applyMatrix4(p.m);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const pos = geo.getAttribute('position');
    const uvA = p.uvKeep && geo.getAttribute('uv') ? geo.getAttribute('uv').array : TEX.makeUV(geo, TEX.uvModeFor(p.geo));
    const index = geo.getIndex();
    bufs.push({ p: p, pos: pos, nrm: geo.getAttribute('normal'), uv: uvA, col: new THREE.Color(p.color),
      index: index ? index.array : null, off: total, n: pos.count });
    total += pos.count;
    idxTotal += index ? index.count : pos.count;
  });
  const P3 = new Float32Array(total * 3), N3 = new Float32Array(total * 3), C3 = new Float32Array(total * 3);
  const U2 = new Float32Array(total * 2), Z1 = new Float32Array(total);
  const S4 = new Uint16Array(total * 4), W4 = new Float32Array(total * 4);
  const IDX = total > 65000 ? new Uint32Array(idxTotal) : new Uint16Array(idxTotal);
  let k3 = 0;
  bufs.forEach(function (b) {
    const p = b.p, pa = b.pos.array, na = b.nrm.array;
    const push = hullT ? hullT * (p.ht == null ? 1 : p.ht) : 0;
    const rigidIdx = boneIdx[p.b] == null ? 0 : boneIdx[p.b];
    let previousWeights = null;
    for (let k = 0; k < b.n; k++) {
      const v = b.off + k, p3 = v * 3;
      P3[p3] = pa[k * 3] + na[k * 3] * push; P3[p3 + 1] = pa[k * 3 + 1] + na[k * 3 + 1] * push; P3[p3 + 2] = pa[k * 3 + 2] + na[k * 3 + 2] * push;
      N3[p3] = na[k * 3]; N3[p3 + 1] = na[k * 3 + 1]; N3[p3 + 2] = na[k * 3 + 2];
      C3[p3] = b.col.r; C3[p3 + 1] = b.col.g; C3[p3 + 2] = b.col.b;
      if (b.uv) { U2[v * 2] = b.uv[k * 2]; U2[v * 2 + 1] = b.uv[k * 2 + 1]; }
      Z1[v] = p.zone || 0;
      const sw = p.skin ? p.skin[k] : null;
      if (sw && sw === previousWeights) {
        // A loft ring normally shares one weight map across all its vertices.
        const offset = v * 4;
        S4.copyWithin(offset, offset - 4, offset);
        W4.copyWithin(offset, offset - 4, offset);
      } else if (sw) {
        const names = Object.keys(sw).filter(function (nm) { return boneIdx[nm] != null && sw[nm] > 0; })
          .sort(function (a, c) { return sw[c] - sw[a]; }).slice(0, 4);
        let sum = 0;
        names.forEach(function (nm) { sum += sw[nm]; });
        if (!names.length || sum <= 0) { S4[v * 4] = rigidIdx; W4[v * 4] = 1; }
        else names.forEach(function (nm, q) { S4[v * 4 + q] = boneIdx[nm]; W4[v * 4 + q] = sw[nm] / sum; });
      } else { S4[v * 4] = rigidIdx; W4[v * 4] = 1; }
      previousWeights = sw;
    }
    if (b.index) for (let k = 0; k < b.index.length; k++) IDX[k3++] = b.index[k] + b.off;
    else for (let k = 0; k < b.n; k++) IDX[k3++] = b.off + k;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P3, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N3, 3));
  if (!hullT) geo.setAttribute('color', new THREE.BufferAttribute(C3, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
  geo.setAttribute('zone', new THREE.BufferAttribute(Z1, 1));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(S4, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(W4, 4));
  geo.setIndex(new THREE.BufferAttribute(IDX, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Bind-pose joint positions in model space from a [name, parent, localPos] bone list. */
export function restOf(defs) {
  const boneIdx = {}, rest = {};
  defs.forEach(function (d, i) {
    boneIdx[d[0]] = i;
    const par = d[1] ? rest[d[1]] : [0, 0, 0];
    rest[d[0]] = [par[0] + d[2][0], par[1] + d[2][1], par[2] + d[2][2]];
  });
  return { boneIdx: boneIdx, rest: rest };
}
/** Builds the THREE.Bone hierarchy for one character instance. */
export function makeBones(defs, prefix) {
  const bones = {}, list = [];
  defs.forEach(function (d) {
    const b = new THREE.Bone();
    b.name = prefix + d[0];
    b.position.set(d[2][0], d[2][1], d[2][2]);
    bones[d[0]] = b;
    list.push(b);
    if (d[1]) bones[d[1]].add(b);
  });
  return { bones: bones, list: list, root: list[0] };
}
// Parts are contiguous in the merged body. Reuse its bind-pose vertices and
// normalized skin weights; the outline shader only needs position and skinning.
function outlineFromBody(parts, body, thickness) {
  const spans = [];
  let sourceVertex = 0, sourceIndex = 0, vertices = 0, indices = 0;
  for (const part of parts) {
    const count = part.geo.attributes.position.count;
    const indexCount = part.geo.index ? part.geo.index.count : count;
    if (!part.nh) {
      spans.push({ sourceVertex, sourceIndex, count, indexCount, push: thickness * (part.ht ?? 1) });
      vertices += count;
      indices += indexCount;
    }
    sourceVertex += count;
    sourceIndex += indexCount;
  }
  const src = body.attributes;
  const positions = new Float32Array(vertices * 3);
  const bones = new Uint16Array(vertices * 4);
  const weights = new Float32Array(vertices * 4);
  const index = vertices > 65000 ? new Uint32Array(indices) : new Uint16Array(indices);
  let vertex = 0, cursor = 0;
  for (const span of spans) {
    const first = span.sourceVertex;
    for (let k = 0; k < span.count * 3; k++) {
      const i = first * 3 + k;
      positions[vertex * 3 + k] = src.position.array[i] + src.normal.array[i] * span.push;
    }
    bones.set(src.skinIndex.array.subarray(first * 4, (first + span.count) * 4), vertex * 4);
    weights.set(src.skinWeight.array.subarray(first * 4, (first + span.count) * 4), vertex * 4);
    for (let k = 0; k < span.indexCount; k++) {
      index[cursor++] = body.index.array[span.sourceIndex + k] - first + vertex;
    }
    vertex += span.count;
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  hull.setAttribute('skinIndex', new THREE.BufferAttribute(bones, 4));
  hull.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  hull.setIndex(new THREE.BufferAttribute(index, 1));
  hull.computeBoundingSphere();
  return hull;
}

/** Bakes body + outline geometry for a character spec ({ defs, parts(variant), hullT }). */
export function bakeBody(spec, variant) {
  const R = restOf(spec.defs);
  const parts = spec.parts(variant, R.rest);
  const geo = mergeBody(parts, R.boneIdx, R.rest, 0);
  const hull = outlineFromBody(parts, geo, spec.hullT || 0.024);
  return {
    geo: geo, hull: hull, boneIdx: R.boneIdx, rest: R.rest,
    verts: geo.getAttribute('position').count, tris: Math.round(geo.index.count / 3),
    hullVerts: hull.getAttribute('position').count
  };
}

/* ---------------------------------------------------------------- 동작(클립) */
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3();
function emit(spec, prefix, name, times, poses) {
  const names = spec.animBones;
  const tracks = [];
  names.forEach(function (bn) {
    const vals = [];
    poses.forEach(function (k) {
      const eu = (k.p && k.p[bn]) || spec.base[bn] || [0, 0, 0];
      _q.setFromEuler(_e.set(eu[0], eu[1], eu[2], 'XYZ'));
      vals.push(_q.x, _q.y, _q.z, _q.w);
    });
    tracks.push(new THREE.QuaternionKeyframeTrack(prefix + bn + '.quaternion', times, vals));
  });
  const pos = [];
  poses.forEach(function (k) { pos.push(k.px || 0, spec.pelvisY + (k.py || 0), k.pz || 0); });
  tracks.push(new THREE.VectorKeyframeTrack(prefix + 'pelvis.position', times, pos));
  return new THREE.AnimationClip(name, times[times.length - 1], tracks);
}
/** Clip sampled from a pose function: fn(u in 0..1) → { p: {bone: [rx,ry,rz]}, px, py, pz }. */
export function clipFromFn(spec, prefix, name, dur, n, fn) {
  const times = [], poses = [];
  for (let i = 0; i <= n; i++) { times.push((i / n) * dur); poses.push(fn(i / n)); }
  return emit(spec, prefix, name, times, poses);
}
const EASE = {
  lin: function (u) { return u; },
  io: function (u) { return u * u * (3 - 2 * u); },
  in: function (u) { return u * u; },
  out: function (u) { return 1 - (1 - u) * (1 - u); },
  snap: function (u) { const v = 1 - u; return 1 - v * v * v * v; },
  back: function (u) { const c = 1.9, v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; }
};
function fullPose(spec, k) {
  const p = {};
  spec.animBones.forEach(function (bn) { p[bn] = (k.p && k.p[bn]) || spec.base[bn] || [0, 0, 0]; });
  return { p: p, px: k.px || 0, py: k.py || 0, pz: k.pz || 0 };
}
function mixPose(spec, a, b, u) {
  const p = {};
  spec.animBones.forEach(function (bn) {
    const x = a.p[bn], y = b.p[bn];
    p[bn] = [x[0] + (y[0] - x[0]) * u, x[1] + (y[1] - x[1]) * u, x[2] + (y[2] - x[2]) * u];
  });
  return { p: p, px: a.px + (b.px - a.px) * u, py: a.py + (b.py - a.py) * u, pz: a.pz + (b.pz - a.pz) * u };
}
/**
 * Clip from keyed poses, densely sampled (60 fps) with easing so motion accelerates and settles instead of
 * moving at constant speed between keys. key: { t, p, px, py, pz, e } — e names how the pose is *arrived at*
 * ('io' default, 'in', 'out', 'snap', 'back' = overshoot, 'lin').
 * opt.spline = true: Catmull-Rom through the keys instead (continuous velocity — for breathing/idle loops).
 */
export function clipFromKeys(spec, prefix, name, keys, opt) {
  const o = opt || {};
  const K = keys.map(function (k) { return fullPose(spec, k); });
  const times = [], poses = [];
  const n = keys.length;
  for (let i = 0; i < n - 1; i++) {
    const t0 = keys[i].t, t1 = keys[i + 1].t;
    const steps = Math.max(1, Math.ceil((t1 - t0) * (o.fps || 60)));
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      times.push(t0 + (t1 - t0) * u);
      if (o.spline) {
        const a = K[(i - 1 + (n - 1)) % (n - 1)], b = K[i], c = K[i + 1], d = K[(i + 2) % (n - 1)];
        const p = {};
        const cr = function (w, x, y, z) {
          return 0.5 * ((2 * x) + (-w + y) * u + (2 * w - 5 * x + 4 * y - z) * u * u + (-w + 3 * x - 3 * y + z) * u * u * u);
        };
        spec.animBones.forEach(function (bn) {
          p[bn] = [0, 1, 2].map(function (q) { return cr(a.p[bn][q], b.p[bn][q], c.p[bn][q], d.p[bn][q]); });
        });
        poses.push({ p: p, px: cr(a.px, b.px, c.px, d.px), py: cr(a.py, b.py, c.py, d.py), pz: cr(a.pz, b.pz, c.pz, d.pz) });
      } else {
        poses.push(mixPose(spec, K[i], K[i + 1], (EASE[keys[i + 1].e] || EASE.io)(u)));
      }
    }
  }
  times.push(keys[n - 1].t);
  poses.push(K[n - 1]);
  return emit(spec, prefix, name, times, poses);
}

function legInfo(spec) {
  if (spec._leg) return spec._leg;
  const d = {};
  spec.defs.forEach(function (b) { d[b[0]] = b[2]; });
  const L1 = Math.hypot(d.shinL[0], d.shinL[1], d.shinL[2]), L2 = Math.hypot(d.footL[0], d.footL[1], d.footL[2]);
  spec._leg = { hip: d.thighL, L1: L1, L2: L2, ankleH: spec.pelvisY + d.thighL[1] - L1 - L2 };
  return spec._leg;
}
/**
 * One frame of an IK-planted walk cycle at phase u (0..1). The feet are placed first (a planted foot travels
 * exactly `stride * duty` backwards during stance) and the leg angles are solved from them, so playing the clip
 * at timeScale = speed / (stride / dur) keeps the feet from sliding.
 * W: { stride, duty, lift, stanceW, bob, sway, yaw, roll, lean, crouch, heel, toe, arm, limp (0..1: right leg drags) }
 * Returns { p, px, py, pz } with pelvis, spine, chest, neck, head, arms, thighs, shins and feet filled in;
 * callers layer character flavour on top.
 */
export function walkPose(spec, u, W) {
  const TAU = Math.PI * 2;
  const G = legInfo(spec);
  const duty = W.duty || 0.6, mid = duty / 2;
  const half = (W.stride * duty) / 2;
  const Lt = G.L1 + G.L2;
  const drop = Lt - Math.sqrt(Math.max(1e-4, Math.pow(0.985 * Lt, 2) - Math.pow(half + 0.02, 2)));
  const py = -(drop + (W.crouch || 0)) + (W.bob || 0) * 0.5 * (1 + Math.cos(2 * TAU * (u - mid)));
  const px = (W.sway || 0) * Math.cos(TAU * (u - mid));
  const lean = W.lean || 0;
  const yawP = -(W.yaw || 0) * Math.cos(TAU * u);
  const rollP = (W.roll || 0) * Math.cos(TAU * (u - mid));
  const B = spec.base;
  const p = {};
  p.pelvis = [lean * 0.35, yawP, rollP];
  _m.makeRotationFromEuler(_e.set(p.pelvis[0], p.pelvis[1], p.pelvis[2], 'XYZ')).invert();
  [['L', 1, 0], ['R', -1, 0.5]].forEach(function (S) {
    const side = S[1];
    const lim = side < 0 ? (W.limp || 0) : 0;
    let ph = u + S[2];
    ph -= Math.floor(ph);
    let z, y = 0, pitch = 0;
    if (ph < duty) {
      const s = ph / duty;
      z = half * (1 - 2 * s);
      pitch = -(W.heel || 0) * Math.max(0, 1 - s * 5) + (W.toe || 0) * Math.pow(Math.max(0, (s - 0.72) / 0.28), 2);
    } else {
      const s = (ph - duty) / (1 - duty);
      const es = s * s * (3 - 2 * s);
      z = -half + 2 * half * es;
      y = (W.lift || 0.1) * (1 - 0.8 * lim) * Math.sin(Math.PI * Math.pow(s, 0.8));
      pitch = (W.toe || 0) * (1 - s) * (1 - s) * (1 + lim) - (W.heel || 0) * s * s * s * (1 - lim);
    }
    _v.set(side * (W.stanceW == null ? Math.abs(G.hip[0]) : W.stanceW) - px, G.ankleH + y - (spec.pelvisY + py), z + (W.zoff || 0));
    _v.applyMatrix4(_m);
    const dx = _v.x - side * Math.abs(G.hip[0]), dy = _v.y - G.hip[1], dz = _v.z - G.hip[2];
    let D = Math.hypot(dx, dy, dz);
    const Dm = Math.min(D, Lt * 0.995);
    const b = Math.asin(Math.max(-1, Math.min(1, dx / D)));
    const a = Math.atan2(-dz, -dy);
    const alpha = Math.acos(Math.max(-1, Math.min(1, (G.L1 * G.L1 + Dm * Dm - G.L2 * G.L2) / (2 * G.L1 * Dm))));
    const knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, (G.L1 * G.L1 + G.L2 * G.L2 - Dm * Dm) / (2 * G.L1 * G.L2))));
    const tx = a - alpha;
    p['thigh' + S[0]] = [tx, 0, b];
    p['shin' + S[0]] = [knee, 0, 0];
    p['foot' + S[0]] = [pitch - tx - knee - p.pelvis[0], 0, -b];
  });
  const c = Math.cos(TAU * u);
  const A = W.arm == null ? 0.3 : W.arm;
  const bs = function (n) { return B[n] || [0, 0, 0]; };
  p.spine = [bs('spine')[0] + lean * 0.35, -yawP * 0.5, -rollP * 0.6];
  p.chest = [bs('chest')[0] + lean * 0.30, -yawP * 1.3, -rollP * 0.7];
  p.neck = [bs('neck')[0], yawP * 0.4, rollP * 0.2];
  p.head = [bs('head')[0] - lean * 0.5, yawP * 0.4, rollP * 0.15];
  p.upperarmL = [bs('upperarmL')[0] + A * c, bs('upperarmL')[1], bs('upperarmL')[2]];
  p.upperarmR = [bs('upperarmR')[0] - A * c, bs('upperarmR')[1], bs('upperarmR')[2]];
  p.forearmL = [bs('forearmL')[0] - A * 0.7 * Math.max(0, -c), bs('forearmL')[1], bs('forearmL')[2]];
  p.forearmR = [bs('forearmR')[0] - A * 0.7 * Math.max(0, c), bs('forearmR')[1], bs('forearmR')[2]];
  return { p: p, px: px, py: py, pz: 0 };
}
/** Walk-clip speed (m/s) at which the feet neither slide forward nor back. */
export function strideSpeed(W, dur) { return W.stride / dur; }

/* ---------------------------------------------------------------- 2차 흔들림 */
function spring(st, key, target, dt, k, damp) {
  const s = st[key] || (st[key] = { v: 0, x: target });
  /* 큰 dt 에서도 터지지 않게 나눠 적분한다. */
  const n = dt > 0.02 ? Math.ceil(dt / 0.02) : 1, h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += ((target - s.x) * k - s.v * damp) * h;
    s.x += s.v * h;
  }
  return s.x;
}
/**
 * Secondary motion for hanging cloth/hair bones. Each bone trails the body's local velocity (drag) on a
 * damped spring, so cloth lags when the body starts, swings past when it stops, and sways a little at rest.
 * cloth: { bone: { g: drag gain (rad per m/s), k: stiffness, d: damping, rx, rz: rest angles, sw: idle sway, ph: phase, max } }
 * vx, vz: body velocity in the character's local frame (z = forward).
 */
export function clothStep(H, cloth, dt, vx, vz) {
  if (!cloth) return;
  const st = H.cloth || (H.cloth = {});
  const t = H.t || 0;
  for (const name in cloth) {
    const b = H.bones[name];
    if (!b) continue;
    const c = cloth[name];
    const mx = c.max == null ? 0.9 : c.max;
    const sw = c.sw == null ? 0.03 : c.sw, ph = c.ph || 0;
    const tx = Math.max(-mx, Math.min(mx, (c.rx || 0) + vz * c.g + Math.sin(t * 1.7 + ph) * sw));
    const tz = Math.max(-mx, Math.min(mx, (c.rz || 0) - vx * c.g + Math.sin(t * 1.3 + ph * 1.9) * sw * 0.7));
    b.rotation.set(spring(st, name + 'x', tx, dt, c.k || 36, c.d || 7), 0, spring(st, name + 'z', tz, dt, c.k || 36, c.d || 7));
  }
}
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
/** Pulls a held prop (the boss's staff) towards upright in the character's frame, by weight w (0..1).
 *  Run after the mixer has posed the arm: the prop then stays planted while the hand drifts with breathing. */
export function uprightBone(bone, rootObj, w) {
  if (!bone || !bone.parent || w <= 0.001) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_q1);
  rootObj.getWorldQuaternion(_q2);
  _q1.invert().multiply(_q2);
  bone.quaternion.slerp(_q1, Math.min(1, w));
}
