/* 수묵 3D 무대 텍스처 베이킹.
   외부 파일 없이 캔버스에서 알베도·노멀·러프니스·잎·파노라마를 굽는다.
   모두 타일이 이어지도록 주기(periodic) 노이즈를 쓴다. */
import * as THREE from 'three';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function ctxOf(c) { return c.getContext('2d', { willReadFrequently: true }); }

export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function h2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
/* 주기 격자 값 노이즈: (u,v) 0..1, per = 타일 한 변의 격자 수. */
function pval(u, v, per, s) {
  const x = u * per, y = v * per;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const x0 = ((xi % per) + per) % per, y0 = ((yi % per) + per) % per;
  const x1 = (x0 + 1) % per, y1 = (y0 + 1) % per;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h2(x0, y0, s), b = h2(x1, y0, s), c = h2(x0, y1, s), d = h2(x1, y1, s);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}
function pfbm(u, v, per, oct, s) {
  let a = 0.5, sum = 0, norm = 0, p = per;
  for (let i = 0; i < oct; i++) {
    sum += a * pval(u, v, p, s + i * 17);
    norm += a; a *= 0.5; p *= 2;
  }
  return sum / norm;
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function mix(a, b, t) { return a + (b - a) * t; }

/* height(float 0..1) 배열 → 노멀 캔버스 */
function normalFromHeight(hgt, W, strength) {
  const c = cv(W, W), g = ctxOf(c);
  const img = g.createImageData(W, W), d = img.data;
  for (let y = 0; y < W; y++) {
    const y0 = (y - 1 + W) % W, y1 = (y + 1) % W;
    for (let x = 0; x < W; x++) {
      const x0 = (x - 1 + W) % W, x1 = (x + 1) % W;
      const dx = (hgt[y * W + x1] - hgt[y * W + x0]) * strength;
      const dy = (hgt[y1 * W + x] - hgt[y0 * W + x]) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      d[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      d[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function toTex(c, { srgb = false, repeat = 1, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const GROUND_CACHE = new Map();
/** 바닥 한 벌: map / normalMap / roughnessMap (CanvasTexture, RepeatWrapping). */
export function groundSet(style) {
  const key = JSON.stringify(style);
  if (GROUND_CACHE.has(key)) return GROUND_CACHE.get(key);
  const W = 512;
  const seed = style.seed || 11;
  const stoneC = style.stone || [0.34, 0.31, 0.27];
  const dirtC = style.dirt || [0.16, 0.14, 0.12];
  const moss = style.moss || 0;
  const wet = style.wet != null ? style.wet : 0.6;
  const alb = cv(W, W), na = ctxOf(alb).createImageData(W, W), ad = na.data;
  const ruf = cv(W, W), rg = ctxOf(ruf), ri = rg.createImageData(W, W), rd = ri.data;
  const hgt = new Float32Array(W * W);
  /* 이음매 없는 부정형 판석: 주기 격자 지터 보로노이 */
  const G = 4, cell = W / G;
  const cx = [], cy = [], tone = [];
  const rnd = mulberry(seed);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    cx.push((i + 0.5 + (rnd() - 0.5) * 0.76) * cell);
    cy.push((j + 0.5 + (rnd() - 0.5) * 0.76) * cell);
    tone.push(0.72 + rnd() * 0.56);
  }
  for (let y = 0; y < W; y++) {
    const v = y / W;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let d1 = 1e9, d2 = 1e9, ci = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = Math.floor(x / cell) + ox, gy = Math.floor(y / cell) + oy;
        const wx = ((gx % G) + G) % G, wy = ((gy % G) + G) % G;
        const k = wy * G + wx;
        const px = cx[k] + (gx - wx) * cell, py = cy[k] + (gy - wy) * cell;
        const dd = Math.hypot(x - px, y - py);
        if (dd < d1) { d2 = d1; d1 = dd; ci = k; } else if (dd < d2) d2 = dd;
      }
      const edge = smooth(2, 16, d2 - d1);              /* 판석 내부 1, 이음매 0 */
      const grain = pfbm(u, v, 8, 4, seed + 3);
      const wetM = smooth(0.55, 0.74, pfbm(u, v, 3, 4, seed + 29)) * wet;
      const mossM = moss * smooth(0.6, 0.82, pfbm(u, v, 5, 3, seed + 41)) * (1 - edge * 0.7);
      const base = tone[ci] * (0.82 + 0.36 * grain);
      const shade = edge * 0.9 + 0.1;
      /* 큰 붓 번짐: 판석 위에 먹물이 스민 얼룩 */
      const stain = smooth(0.42, 0.78, pfbm(u, v, 2, 4, seed + 71));
      const stain2 = smooth(0.55, 0.85, pfbm(u, v, 4, 3, seed + 83));
      let r = mix(dirtC[0], stoneC[0] * base, shade);
      let g = mix(dirtC[1], stoneC[1] * base, shade);
      let b = mix(dirtC[2], stoneC[2] * base, shade);
      const inkm = 1 - stain * 0.55 - stain2 * 0.3;
      r *= inkm; g *= inkm; b *= inkm * 0.96;
      /* 젖은 자리: 반사가 서는 물웅덩이 */
      r *= 1 - wetM * 0.5; g *= 1 - wetM * 0.46; b *= 1 - wetM * 0.38;
      r = mix(r, 0.16, mossM); g = mix(g, 0.24, mossM); b = mix(b, 0.12, mossM);
      const i4 = (y * W + x) * 4;
      ad[i4] = Math.max(0, Math.min(255, Math.round(r * 255)));
      ad[i4 + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
      ad[i4 + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
      ad[i4 + 3] = 255;
      const h = edge * (0.55 + 0.45 * smooth(0, 26, d2 - d1)) + grain * 0.16 - wetM * 0.24;
      hgt[y * W + x] = h;
      const rough = mix(0.95, 0.66, edge) * (1 - wetM * 0.82) + 0.03;
      const rr = Math.round(Math.max(0.06, Math.min(0.98, rough)) * 255);
      rd[i4] = rr; rd[i4 + 1] = rr; rd[i4 + 2] = rr; rd[i4 + 3] = 255;
    }
  }
  ctxOf(alb).putImageData(na, 0, 0);
  rg.putImageData(ri, 0, 0);
  const normal = normalFromHeight(hgt, W, 2.3);
  const out = {
    map: toTex(alb, { srgb: true, aniso: 8 }),
    normalMap: toTex(normal, { aniso: 4 }),
    roughnessMap: toTex(ruf, { aniso: 4 })
  };
  GROUND_CACHE.set(key, out);
  return out;
}

/* 대나무 줄기: 마디 링 + 세로 결 */
let BAMBOO = null;
export function bambooSet() {
  if (BAMBOO) return BAMBOO;
  const W = 64, H = 512;
  const alb = cv(W, H), ga = ctxOf(alb), ia = ga.createImageData(W, H), ad = ia.data;
  const hgt = new Float32Array(W * H);
  const rnd = mulberry(77);
  const verts = []; for (let x = 0; x < W; x++) verts.push(0.82 + rnd() * 0.36);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const node = Math.exp(-Math.pow(((y % 96) - 48) / 5.5, 2));         /* 48px 간격 마디 */
    const groove = Math.exp(-Math.pow(((y % 96) - 56) / 9, 2));
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const streak = 0.86 + 0.28 * pfbm(u * 0.25, v * 6, 6, 3, 5);
      const vy = verts[x];
      let r = 86 * streak * vy, g = 108 * streak * vy, b = 72 * streak * vy;
      r = mix(r === undefined ? 0 : r, 138, node * 0.55); g = mix(g, 158, node * 0.5); b = mix(b, 112, node * 0.5);
      r *= 1 - groove * 0.45; g *= 1 - groove * 0.4; b *= 1 - groove * 0.35;
      const i4 = (y * W + x) * 4;
      ad[i4] = Math.min(255, r); ad[i4 + 1] = Math.min(255, g); ad[i4 + 2] = Math.min(255, b); ad[i4 + 3] = 255;
      hgt[y * W + x] = node * 0.8 - groove * 0.5 + (streak - 0.9) * 0.25;
    }
  }
  ga.putImageData(ia, 0, 0);
  BAMBOO = { map: toTex(alb, { srgb: true, repeat: 1, aniso: 4 }) };
  /* 노멀은 정사각 배열을 요구하므로 256² 로 다시 굽는다. */
  const S = 256;
  const h2a = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const sy = Math.floor(y / S * H);
    for (let x = 0; x < S; x++) h2a[y * S + x] = hgt[sy * W + x];
  }
  BAMBOO.normalMap = toTex(normalFromHeight(h2a, S, 1.3), { aniso: 2 });
  return BAMBOO;
}

/* 대나무 잎 군락 (알파 테스트) */
let LEAF = null;
export function leafTexture() {
  if (LEAF) return LEAF;
  const S = 256, c = cv(S, S), g = ctxOf(c);
  g.clearRect(0, 0, S, S);
  const rnd = mulberry(913);
  const cols = ['#40573c', '#4c6644', '#37492f', '#5a7047', '#2f3f2b'];
  for (let i = 0; i < 26; i++) {
    const bx = S * 0.5 + (rnd() - 0.5) * S * 0.9, by = S * 0.5 + (rnd() - 0.5) * S * 0.9;
    const ang = rnd() * Math.PI * 2, len = 26 + rnd() * 62, wid = 4 + rnd() * 7;
    const tipX = bx + Math.cos(ang) * len, tipY = by + Math.sin(ang) * len * 0.72;
    const nAng = ang + Math.PI / 2;
    const mx = (bx + tipX) / 2 + Math.cos(nAng) * wid, my = (by + tipY) / 2 + Math.sin(nAng) * wid;
    g.beginPath();
    g.moveTo(bx, by);
    g.quadraticCurveTo(mx, my, tipX, tipY);
    g.quadraticCurveTo(mx - Math.cos(nAng) * wid * 1.7, my - Math.sin(nAng) * wid * 1.7, bx, by);
    g.closePath();
    g.fillStyle = cols[(rnd() * cols.length) | 0];
    g.fill();
    g.strokeStyle = 'rgba(18,26,18,0.75)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(mx, my, tipX, tipY); g.stroke();
  }
  LEAF = new THREE.CanvasTexture(c);
  LEAF.colorSpace = THREE.SRGBColorSpace;
  LEAF.anisotropy = 4;
  return LEAF;
}

/* 목재 결 */
let WOOD = null;
export function woodSet() {
  if (WOOD) return WOOD;
  const W = 128, H = 256, c = cv(W, H), g = ctxOf(c);
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const grain = pfbm(u * 2, v * 0.5, 8, 4, 21);
    const ring = 0.5 + 0.5 * Math.sin((u * 9 + grain * 3) * Math.PI * 2);
    const val = 74 + 44 * grain + 16 * ring;
    const i = (y * W + x) * 4;
    d[i] = val * 0.82; d[i + 1] = val * 0.68; d[i + 2] = val * 0.54; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  WOOD = { map: toTex(c, { srgb: true, aniso: 4 }) };
  return WOOD;
}

/* 회벽·기와·천 */
export function plainSet(kind) {
  const key = 'p:' + kind;
  if (GROUND_CACHE.has(key)) return GROUND_CACHE.get(key);
  const W = 128, c = cv(W, W), g = ctxOf(c);
  const img = g.createImageData(W, W), d = img.data;
  const col = { plaster: [138, 128, 112], tile: [58, 60, 66], cloth: [94, 52, 44], clothBlue: [52, 70, 104], paper: [226, 208, 168] }[kind] || [120, 120, 120];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const n = pfbm(x / W, y / W, 6, 4, 7 + kind.length);
    const weave = kind === 'cloth' ? (0.85 + 0.12 * Math.sin(x * 1.7) * Math.sin(y * 1.7) + 0.06 * Math.sin(x * 0.28)) : 1;
    const band = (kind === 'cloth' && (y < 10 || y > W - 10)) ? 0.55 : 1;
    const i = (y * W + x) * 4;
    d[i] = Math.min(255, col[0] * (0.65 + 0.7 * n) * weave * band);
    d[i + 1] = Math.min(255, col[1] * (0.65 + 0.7 * n) * weave * band);
    d[i + 2] = Math.min(255, col[2] * (0.65 + 0.7 * n) * weave * band);
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = toTex(c, { srgb: true, aniso: 4 });
  const out = { map: tex };
  GROUND_CACHE.set(key, out);
  return out;
}

/* 부드러운 원형 발광/그림자 */
let GLOW = null, SHADOW = null, MOTE = null, EMBER = null;
function radial(size, stops) {
  const c = cv(size, size), g = ctxOf(c);
  const r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
export function glowTexture() {
  if (!GLOW) {
    GLOW = new THREE.CanvasTexture(radial(128, [[0, 'rgba(255,255,255,1)'], [0.28, 'rgba(255,255,255,0.55)'], [0.62, 'rgba(255,255,255,0.13)'], [1, 'rgba(255,255,255,0)']]));
    GLOW.colorSpace = THREE.SRGBColorSpace;
  }
  return GLOW;
}
export function shadowTexture() {
  if (!SHADOW) {
    const S = 128, c = cv(S, S), g = ctxOf(c);
    const r = S / 2, gr = g.createRadialGradient(r, r, r * 0.1, r, r, r);
    gr.addColorStop(0, 'rgba(0,0,0,0.72)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.34)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.save(); g.translate(r, r); g.scale(1, 0.72); g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore();
    SHADOW = new THREE.CanvasTexture(c);
  }
  return SHADOW;
}
export function moteTexture() {
  if (!MOTE) {
    MOTE = new THREE.CanvasTexture(radial(64, [[0, 'rgba(255,255,255,0.95)'], [0.4, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]));
  }
  return MOTE;
}
export function emberTexture() {
  if (!EMBER) {
    EMBER = new THREE.CanvasTexture(radial(48, [[0, 'rgba(255,255,235,1)'], [0.18, 'rgba(255,210,120,0.95)'], [0.5, 'rgba(255,110,40,0.42)'], [1, 'rgba(255,60,20,0)']]));
  }
  return EMBER;
}

/* 원경 파노라마: 수묵 산등성이 + 스테이지 실루엣 + 달 */
const PanoCache = new Map();
export function panoramaTexture(stageId) {
  if (PanoCache.has(stageId)) return PanoCache.get(stageId);
  const W = 2048, H = 512, c = cv(W, H), g = ctxOf(c);
  const rnd = mulberry(500 + stageId * 31);
  const P = {
    1: { top: [10, 9, 11], bot: [46, 36, 30], moon: [232, 222, 196], tint: [58, 40, 30] },
    2: { top: [7, 9, 14], bot: [34, 44, 66], moon: [186, 205, 235], tint: [26, 36, 60] },
    3: { top: [6, 10, 8], bot: [26, 48, 34], moon: [200, 226, 196], tint: [20, 44, 30] },
    4: { top: [14, 5, 7], bot: [70, 18, 18], moon: [255, 84, 62], tint: [96, 22, 20] }
  }[stageId] || { top: [10, 9, 11], bot: [40, 34, 30], moon: [230, 220, 195], tint: [50, 40, 34] };
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, 'rgb(' + P.top.join(',') + ')');
  sky.addColorStop(0.62, 'rgb(' + P.bot.join(',') + ')');
  sky.addColorStop(1, 'rgb(' + P.top.join(',') + ')');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  /* 달 + 번지는 후광 */
  const mx = W * 0.665, my = H * 0.30, mr = stageId === 4 ? 62 : 40;
  const halo = g.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 5.2);
  halo.addColorStop(0, 'rgba(' + P.moon.join(',') + ',0.55)');
  halo.addColorStop(0.25, 'rgba(' + P.moon.join(',') + ',0.16)');
  halo.addColorStop(1, 'rgba(' + P.moon.join(',') + ',0)');
  g.fillStyle = halo; g.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12);
  g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2);
  g.fillStyle = 'rgba(' + P.moon.join(',') + ',0.92)'; g.fill();
  /* 먹 구름 */
  for (let i = 0; i < 18; i++) {
    const x = rnd() * W, y = H * (0.1 + rnd() * 0.32), w = 120 + rnd() * 300, h = 14 + rnd() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, w * 0.5);
    gr.addColorStop(0, 'rgba(8,7,9,' + (0.16 + rnd() * 0.2).toFixed(2) + ')');
    gr.addColorStop(1, 'rgba(8,7,9,0)');
    g.fillStyle = gr;
    g.save(); g.translate(x, y); g.scale(1, h / (w * 0.5)); g.beginPath(); g.arc(0, 0, w * 0.5, 0, Math.PI * 2); g.fill(); g.restore();
  }
  /* 산등성이 3겹 */
  for (let layer = 0; layer < 3; layer++) {
    const base = H * (0.56 + layer * 0.11), amp = 96 - layer * 22, alpha = 0.5 + layer * 0.18;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 12) {
      const y = base - amp * (0.45 + 0.55 * Math.sin(x * 0.0032 + layer * 2.4) * (0.55 + 0.45 * Math.sin(x * 0.011 + layer * 1.3)));
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath();
    const gr = g.createLinearGradient(0, base - amp, 0, H);
    gr.addColorStop(0, 'rgba(8,8,10,' + alpha.toFixed(2) + ')');
    gr.addColorStop(0.5, 'rgba(' + P.tint.join(',') + ',' + (alpha * 0.42).toFixed(2) + ')');
    gr.addColorStop(1, 'rgba(8,8,10,0)');
    g.fillStyle = gr; g.fill();
  }
  /* 스테이지 실루엣 */
  g.fillStyle = 'rgba(7,7,9,0.94)';
  if (stageId === 2) {
    /* 성곽과 성문 */
    for (let i = 0; i < 5; i++) {
      const x = i * (W / 5);
      g.fillRect(x, H * 0.66, W / 5 - 26, H * 0.36);
      for (let k = 0; k < 8; k++) g.fillRect(x + k * (W / 40), H * 0.63, 22, 26);
    }
    const gx = W * 0.24;
    g.fillRect(gx - 60, H * 0.52, 60, H * 0.5); g.fillRect(gx + 180, H * 0.52, 60, H * 0.5);
    g.beginPath(); g.moveTo(gx - 110, H * 0.52); g.lineTo(gx + 250, H * 0.52); g.lineTo(gx + 200, H * 0.46); g.lineTo(gx - 60, H * 0.46); g.closePath(); g.fill();
  } else if (stageId === 3) {
    /* 대나무 숲 */
    for (let i = 0; i < 90; i++) {
      const x = rnd() * W, top = H * (0.06 + rnd() * 0.22), w = 3 + rnd() * 6;
      g.fillRect(x, top, w, H * 0.9);
      for (let k = 0; k < 4; k++) {
        const y = top + rnd() * H * 0.5, len = 26 + rnd() * 54;
        g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + (rnd() > 0.5 ? len : -len), y - 12 - rnd() * 18); g.lineTo(x + w / 2, y + 5); g.closePath(); g.fill();
      }
    }
  } else {
    /* 기와집·탑 실루엣 */
    for (let i = 0; i < 9; i++) {
      const x = i * (W / 9) + rnd() * 40, w = 100 + rnd() * 130, h = 60 + rnd() * 90, y = H * 0.72;
      g.fillRect(x, y, w, H * 0.3);
      g.beginPath(); g.moveTo(x - 26, y); g.quadraticCurveTo(x + w * 0.5, y - h, x + w + 26, y); g.lineTo(x + w, y + 12); g.lineTo(x, y + 12); g.closePath(); g.fill();
    }
    /* 멀리 탑 */
    g.fillRect(W * 0.13, H * 0.4, 26, H * 0.5);
    for (let k = 0; k < 5; k++) g.fillRect(W * 0.13 - 34 + k * 4, H * (0.4 + k * 0.055), 94 - k * 8, 8);
  }
  /* 지평선 근처 먹 번짐 */
  const mist = g.createLinearGradient(0, H * 0.55, 0, H);
  mist.addColorStop(0, 'rgba(' + P.bot.join(',') + ',0)');
  mist.addColorStop(0.6, 'rgba(' + P.bot.join(',') + ',0.22)');
  mist.addColorStop(1, 'rgba(7,7,9,0.85)');
  g.fillStyle = mist; g.fillRect(0, H * 0.5, W, H * 0.5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  t.anisotropy = 4;
  PanoCache.set(stageId, t);
  return t;
}

/* 큰 먹 번짐 베일: 바닥 판석 위에 깔리는 대형 수묵 얼룩 (70m 한 장) */
let VEIL = null;
export function inkVeilTexture() {
  if (VEIL) return VEIL;
  const S = 1024, c = cv(S, S), g = ctxOf(c);
  g.clearRect(0, 0, S, S);
  const rnd = mulberry(4242);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S;
    const r = 90 + rnd() * 240;
    const gr = g.createRadialGradient(x, y, r * 0.1, x, y, r);
    const a = 0.30 + rnd() * 0.34;
    gr.addColorStop(0, 'rgba(6,6,7,' + a.toFixed(2) + ')');
    gr.addColorStop(0.55, 'rgba(6,6,7,' + (a * 0.55).toFixed(2) + ')');
    gr.addColorStop(1, 'rgba(6,6,7,0)');
    g.fillStyle = gr;
    g.save(); g.translate(x, y); g.scale(1, 0.55 + rnd() * 0.7); g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore();
  }
  /* 마른 붓 자국 */
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, w = 40 + rnd() * 220, h = 2 + rnd() * 9;
    g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI);
    const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    gr.addColorStop(0, 'rgba(8,8,9,0)');
    gr.addColorStop(0.5, 'rgba(8,8,9,' + (0.1 + rnd() * 0.22).toFixed(2) + ')');
    gr.addColorStop(1, 'rgba(8,8,9,0)');
    g.fillStyle = gr; g.fillRect(-w / 2, -h / 2, w, h);
    g.restore();
  }
  VEIL = new THREE.CanvasTexture(c);
  VEIL.colorSpace = THREE.SRGBColorSpace;
  VEIL.wrapS = VEIL.wrapT = THREE.RepeatWrapping;
  VEIL.anisotropy = 4;
  return VEIL;
}
