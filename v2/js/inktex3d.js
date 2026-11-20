/* v2/js/inktex3d.js — v0.47 동양 수묵 **절차(procedural) 텍스처 아틀라스**.
 *
 * 왜 이 모듈이 필요한가 —
 *   v0.45/0.46의 3D 주인공·몬스터는 부위 색(vertex color)만 있고 UV 결이 없어, 화면에서 보면
 *   '칠한 플라스틱 덩어리'로 읽혔다. 옛 2D 에셋(v2/assets/diorama/chars)이 가진 한지 바탕결·
 *   거친 먹 붓질·찰갑 비늘·붉은 부적·바위 균열을 3D 셰이더 안으로 그대로 끌어온다.
 *
 * 원칙 1) **로딩 지연 0ms · 외부 404 0건** — 이미지 파일을 하나도 받지 않는다. 512×512 캔버스에
 *        직접 그리고 `THREE.CanvasTexture` 로 GPU에 한 번만 올린다(전 종족·전 개체가 공유).
 * 원칙 2) **색은 버텍스가, 결은 텍스처가** — 텍스처는 1.0 근처의 '명암 결'만 담는다. 붉은 부적·
 *        금테·바위의 색은 기존 uColor(버텍스 색)가 그대로 내고, 이 아틀라스는 그 위에 한지 섬유·
 *        먹 번짐·비늘 테두리·균열 같은 **결**만 곱한다. 그래서 어떤 종족에 얹어도 색이 죽지 않는다.
 * 원칙 3) **아틀라스 8칸** — 2열 × 4행(칸 256×128). 정점마다 `zone`(칸 번호) 하나를 실어 보내고
 *        프래그먼트가 `fract(uv)` 로 그 칸 안에서만 타일링한다. 드로우콜은 그대로(재질 1개 = 텍스처 1개).
 *
 * `?notex=1` 로 끄면 아틀라스를 아예 만들지 않는다(1×1 흰 텍스처 + uTexAmt 0) — 비교 캡처용.
 * `?texamt=0.9` 로 결의 세기를 조절할 수 있다(기본 0.90).
 */
import * as THREE from 'three';

/* 아틀라스 칸 번호 — 모델 쪽(inkhero3d/inkmonsters3d)이 이 값을 정점 zone 으로 굽는다. */
export const Z = { CLOTH: 0, PAPER: 1, IRON: 2, TALIS: 3, ROCK: 4, GOLD: 5, BLADE: 6, SASH: 7 };
export const COLS = 2, ROWS = 4, CELL_W = 256, CELL_H = 128, SIZE = 512;

const Q = (function () {
  try { return new URLSearchParams(location.search); } catch (e) { return null; }
})();
export const OFF = !!(Q && Q.get('notex') === '1');
const AMT = (function () {
  if (OFF) return 0;
  const v = Q ? parseFloat(Q.get('texamt')) : NaN;
  return isFinite(v) && v >= 0 && v <= 1.5 ? v : 0.90;
})();

export function amount() { return AMT; }
export function enabled() { return !OFF && AMT > 0; }

/* ---------------------------------------------------------------- 그리기 도구 */
let _seed = 20261119;
function rnd() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }
function rr(a, b) { return a + (b - a) * rnd(); }

/** 한지 섬유 — 가로/세로로 아주 얇고 불규칙한 실오라기. */
function fibers(g, w, h, n, alpha) {
  g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, L = rr(6, 34), a = rnd() * Math.PI;
    g.strokeStyle = 'rgba(120,112,98,' + (alpha * rr(0.35, 1)).toFixed(3) + ')';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L * 0.45);
    g.stroke();
  }
}
/** 젖은 먹 한 방울 — 가운데가 진하고 가장자리로 스며드는 얼룩. */
function blot(g, x, y, r, col, a) {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, 'rgba(' + col + ',' + a + ')');
  rg.addColorStop(0.55, 'rgba(' + col + ',' + (a * 0.55).toFixed(3) + ')');
  rg.addColorStop(1, 'rgba(' + col + ',0)');
  g.fillStyle = rg;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
/** 거친 붓 한 획 — 굵기가 흔들리고 끝이 갈라진다(마른 붓). */
function stroke(g, x0, y0, x1, y1, wid, col, a, seed) {
  let s = (seed || 7) * 9301 + 49297;
  const r2 = function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const seg = 7;
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    const w0 = wid * (1 - t0 * 0.55) * (0.8 + r2() * 0.5);
    g.strokeStyle = 'rgba(' + col + ',' + (a * (0.55 + r2() * 0.6)).toFixed(3) + ')';
    g.lineWidth = Math.max(0.7, w0);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0 + (r2() - 0.5) * 2.2);
    g.lineTo(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1 + (r2() - 0.5) * 2.2);
    g.stroke();
  }
}
/** 한자 모양 먹획 — 폰트 없이(헤드리스에도 안전) 기본 필획 4~6개로 글자처럼 세운다. */
function glyph(g, x, y, w, h, col, a) {
  g.strokeStyle = 'rgba(' + col + ',' + a + ')';
  g.lineCap = 'square';
  const n = 3 + Math.floor(rnd() * 3);
  g.lineWidth = Math.max(2, w * 0.11);
  for (let i = 0; i < n; i++) {
    const yy = y + h * (i + 0.6) / (n + 0.2);
    g.beginPath();
    g.moveTo(x + w * (0.06 + rnd() * 0.16), yy);
    g.lineTo(x + w * (0.94 - rnd() * 0.16), yy - h * 0.02);
    g.stroke();
  }
  g.beginPath(); g.moveTo(x + w * 0.5, y + h * 0.04); g.lineTo(x + w * 0.5, y + h * 0.96); g.stroke();
  if (rnd() > 0.45) { g.beginPath(); g.moveTo(x + w * 0.22, y + h * 0.30); g.lineTo(x + w * 0.22, y + h * 0.74); g.stroke(); }
  if (rnd() > 0.55) { g.beginPath(); g.arc(x + w * 0.66, y + h * 0.55, w * 0.13, 0, Math.PI * 2); g.stroke(); }
}

/* ---------------------------------------------------------------- 칸별 화가 */
/* 0 · 옷감 — 비단/삼베의 세로 결 + 거친 먹 붓질 + 도포 주름 그늘. */
function pCloth(g, w, h) {
  g.fillStyle = '#e7e2d9'; g.fillRect(0, 0, w, h);
  /* 큰 얼룩부터 — 화면에서 캐릭터가 60px 남짓이므로 잔 결보다 **큰 명암 덩어리**가 읽힌다.
     검은 옷(albedo 0.04)에서도 보이도록 밝은 마모는 2.0배까지 올린다. */
  for (let i = 0; i < 6; i++) blot(g, rnd() * w, rnd() * h, rr(40, 86), '255,252,242', rr(0.16, 0.34));
  for (let i = 0; i < 5; i++) blot(g, rnd() * w, rnd() * h, rr(34, 74), '26,22,19', rr(0.18, 0.40));
  for (let x = 0; x < w; x += 3) {
    g.fillStyle = 'rgba(96,88,78,' + (0.03 + rnd() * 0.05).toFixed(3) + ')';
    g.fillRect(x + rnd(), 0, 1, h);
  }
  fibers(g, w, h, 60, 0.13);
  /* 진한 먹획(젖은 자리)과 **해져서 한지빛이 비치는 마모**(밝은 획)를 번갈아 */
  for (let i = 0; i < 7; i++) {
    const x = rnd() * w, y = rnd() * h;
    stroke(g, x, y, x + rr(-52, 52), y + rr(34, 96), rr(4, 13), '40,36,31', rr(0.20, 0.46), i + 3);
  }
  for (let i = 0; i < 7; i++) {
    const x = rnd() * w, y = rnd() * h;
    stroke(g, x, y, x + rr(-46, 46), y + rr(30, 88), rr(3, 10), '255,252,240', rr(0.26, 0.62), i + 31);
  }
  /* 주름 — 위는 한지빛, 아래로 갈수록 먹이 고인다. */
  const vg = g.createLinearGradient(0, 0, 0, h);
  vg.addColorStop(0, 'rgba(255,252,244,0.26)');
  vg.addColorStop(0.55, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(16,13,11,0.44)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    const x = rnd() * w;
    g.strokeStyle = 'rgba(255,250,240,0.26)'; g.lineWidth = rr(2, 4.5);
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + rr(-14, 14), h * 0.5, x + rr(-18, 18), h); g.stroke();
  }
}

/* 1 · 한지 — 안대·목안감·살갗에 쓰는 밝은 종이 직조. 얼룩과 섬유만. */
function pPaper(g, w, h) {
  g.fillStyle = '#f4efe4'; g.fillRect(0, 0, w, h);
  fibers(g, w, h, 150, 0.16);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = 'rgba(126,116,98,' + rr(0.04, 0.12).toFixed(3) + ')';
    g.fillRect(rnd() * w, rnd() * h, rr(2, 9), rr(1, 3));
  }
  for (let i = 0; i < 7; i++) blot(g, rnd() * w, rnd() * h, rr(14, 34), '120,108,86', 0.13);
  const vg = g.createLinearGradient(0, 0, 0, h);
  vg.addColorStop(0, 'rgba(255,255,250,0.10)');
  vg.addColorStop(1, 'rgba(70,62,50,0.10)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
}

/* 2 · 철갑 — 찰갑(비늘 갑옷)의 겹친 비늘 + 징 + 세로 능선. */
function pIron(g, w, h) {
  g.fillStyle = '#d6d2cb'; g.fillRect(0, 0, w, h);
  const rows = 5, cols = 6;
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const cx = c * cw + (r % 2 ? cw * 0.5 : 0);
      const cy = r * ch + ch * 0.5;
      const rg = g.createLinearGradient(cx, cy - ch * 0.6, cx, cy + ch * 0.6);
      rg.addColorStop(0, 'rgba(255,253,246,0.85)');
      rg.addColorStop(0.6, 'rgba(190,184,174,0.24)');
      rg.addColorStop(1, 'rgba(40,35,30,0.55)');
      g.fillStyle = rg;
      g.beginPath();
      g.moveTo(cx - cw * 0.52, cy);
      g.quadraticCurveTo(cx, cy + ch * 0.86, cx + cw * 0.52, cy);
      g.quadraticCurveTo(cx, cy - ch * 0.42, cx - cw * 0.52, cy);
      g.fill();
      g.strokeStyle = 'rgba(36,32,27,0.62)'; g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(cx - cw * 0.52, cy);
      g.quadraticCurveTo(cx, cy + ch * 0.86, cx + cw * 0.52, cy);
      g.stroke();
      g.fillStyle = 'rgba(24,21,18,0.72)';
      g.beginPath(); g.arc(cx, cy - ch * 0.06, 2.1, 0, Math.PI * 2); g.fill();
    }
  }
  g.strokeStyle = 'rgba(40,36,30,0.18)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(w * 0.5, 0); g.lineTo(w * 0.5, h); g.stroke();
  for (let i = 0; i < 5; i++) blot(g, rnd() * w, rnd() * h, rr(10, 26), '52,46,40', 0.10);
}

/* 3 · 부적 — 붉은 종이(색은 버텍스) 위에 실제 먹물 주사(한자)와 테두리. */
function pTalis(g, w, h) {
  g.fillStyle = '#f7f3e9'; g.fillRect(0, 0, w, h);
  fibers(g, w, h, 90, 0.14);
  g.strokeStyle = 'rgba(40,20,16,0.72)'; g.lineWidth = 4;
  g.strokeRect(w * 0.10, h * 0.06, w * 0.80, h * 0.88);
  g.strokeStyle = 'rgba(46,26,22,0.30)'; g.lineWidth = 1.4;
  g.strokeRect(w * 0.155, h * 0.115, w * 0.69, h * 0.77);
  /* 세 글자 — 세로로 이어 쓴 주문 */
  const gw = w * 0.40, gh = h * 0.22;
  for (let i = 0; i < 3; i++) glyph(g, w * 0.30, h * 0.13 + i * h * 0.235, gw, gh, '20,14,11', 0.96);
  /* 낙관(도장) — 붉은 먹 네모는 버텍스 색이 내고, 여기엔 검은 테와 획만 */
  g.fillStyle = 'rgba(26,18,14,0.80)';
  g.fillRect(w * 0.60, h * 0.74, w * 0.16, h * 0.15);
  g.strokeStyle = 'rgba(240,236,226,0.75)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(w * 0.63, h * 0.78); g.lineTo(w * 0.73, h * 0.78);
  g.moveTo(w * 0.68, h * 0.76); g.lineTo(w * 0.68, h * 0.87); g.stroke();
  for (let i = 0; i < 3; i++) blot(g, rnd() * w, rnd() * h, rr(12, 26), '120,44,32', 0.10);
}

/* 4 · 바위 — 화강암 균열과 이끼. 석인의 몸. */
function pRock(g, w, h) {
  g.fillStyle = '#dcd8cf'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) blot(g, rnd() * w, rnd() * h, rr(8, 30), '96,90,82', 0.13);
  for (let i = 0; i < 220; i++) {
    g.fillStyle = 'rgba(' + (rnd() > 0.5 ? '250,248,242' : '70,64,58') + ',' + rr(0.05, 0.16).toFixed(3) + ')';
    g.fillRect(rnd() * w, rnd() * h, rr(1, 3), rr(1, 3));
  }
  /* 균열 — 꺾인 선과 갈라진 가지 */
  for (let i = 0; i < 6; i++) {
    let x = rnd() * w, y = rnd() * h;
    g.strokeStyle = 'rgba(26,23,20,0.70)'; g.lineWidth = rr(1.8, 3.6);
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += rr(-26, 26); y += rr(-22, 22); g.lineTo(x, y); }
    g.stroke();
    g.strokeStyle = 'rgba(255,253,246,0.30)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x + 1.5, y - 1.5); g.lineTo(x + rr(-18, 18), y + rr(-18, 18)); g.stroke();
  }
  /* 이끼 — 초록기 도는 얼룩(색은 곱해지며 바위의 회녹이 된다) */
  for (let i = 0; i < 7; i++) {
    const x = rnd() * w, y = rnd() * h, r = rr(12, 30);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(132,158,110,0.42)');
    rg.addColorStop(1, 'rgba(150,168,128,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}

/* 5 · 금박 구름 — 보스의 관·금테·용 문양. */
function pGold(g, w, h) {
  g.fillStyle = '#ded9ce'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i++) blot(g, rnd() * w, rnd() * h, rr(14, 34), '86,70,44', 0.10);
  /* 구름 문양 — 여러 겹 나선과 파도 호 */
  for (let i = 0; i < 7; i++) {
    const cx = rnd() * w, cy = rnd() * h, s = rr(16, 34);
    g.strokeStyle = 'rgba(40,31,18,0.72)'; g.lineWidth = rr(2.4, 4);
    g.beginPath();
    for (let k = 0; k < 26; k++) {
      const a = (k / 25) * Math.PI * 2.4, rad = s * (1 - k / 34);
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.7;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255,252,238,0.70)'; g.lineWidth = 1.6;
    g.beginPath();
    for (let k = 0; k < 20; k++) {
      const a = (k / 19) * Math.PI * 2.0, rad = s * 0.72 * (1 - k / 26);
      const x = cx - 1 + Math.cos(a) * rad, y = cy - 1 + Math.sin(a) * rad * 0.7;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const x = rnd() * w, y = rnd() * h, L = rr(20, 52);
    g.strokeStyle = 'rgba(52,42,26,0.42)'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + L * 0.5, y - L * 0.45, x + L, y); g.stroke();
  }
}

/* 6 · 칼날 — 은빛 바탕에 물결 무늬(하몬)와 마른 붓 결. */
function pBlade(g, w, h) {
  g.fillStyle = '#f1f0ec'; g.fillRect(0, 0, w, h);
  const vg = g.createLinearGradient(0, 0, 0, h);
  vg.addColorStop(0, 'rgba(255,255,255,0.16)');
  vg.addColorStop(0.5, 'rgba(0,0,0,0.02)');
  vg.addColorStop(1, 'rgba(40,44,48,0.16)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  /* 하몬(刃文) — 날을 따라 흐르는 물결 */
  for (let rep = 0; rep < 2; rep++) {
    const base = h * (0.30 + rep * 0.42);
    g.strokeStyle = 'rgba(238,242,244,0.95)'; g.lineWidth = 3.6;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = base + Math.sin((x / w) * Math.PI * 5 + rep) * h * 0.05 + Math.sin((x / w) * Math.PI * 13) * h * 0.014;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = 'rgba(46,52,58,0.48)'; g.lineWidth = 1.6;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = base + 3 + Math.sin((x / w) * Math.PI * 5 + rep) * h * 0.05 + Math.sin((x / w) * Math.PI * 13) * h * 0.014;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const y = rnd() * h;
    g.strokeStyle = 'rgba(90,94,98,' + rr(0.03, 0.10).toFixed(3) + ')';
    g.lineWidth = rr(0.6, 1.6);
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + rr(-2, 2)); g.stroke();
  }
}

/* 7 · 홍색 천 — 망토·띠. 세로 주름과 넓은 먹 그늘. */
function pSash(g, w, h) {
  g.fillStyle = '#e2dcd1'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) {
    const x = rnd() * w;
    g.strokeStyle = 'rgba(40,22,18,' + rr(0.10, 0.30).toFixed(3) + ')';
    g.lineWidth = rr(1.4, 4.5);
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + rr(-10, 10), h * 0.5, x + rr(-14, 14), h); g.stroke();
  }
  for (let i = 0; i < 5; i++) blot(g, rnd() * w, rnd() * h, rr(16, 36), '52,26,20', 0.10);
  fibers(g, w, h, 50, 0.10);
}

/* ---------------------------------------------------------------- 아틀라스 */
let _tex = null, _url = null, _white = null;
function whiteTex() {
  if (_white) return _white;
  const d = new Uint8Array([255, 255, 255, 255]);
  _white = new THREE.DataTexture(d, 1, 1, THREE.RGBAFormat);
  _white.needsUpdate = true;
  return _white;
}
/** 512×512 아틀라스. 처음 요청될 때 한 번만 그린다. */
export function atlas() {
  if (OFF) return whiteTex();
  if (_tex) return _tex;
  const cv = document.createElement('canvas');
  cv.width = SIZE; cv.height = SIZE;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#e9e4db'; g.fillRect(0, 0, SIZE, SIZE);
  const paint = [pCloth, pPaper, pIron, pTalis, pRock, pGold, pBlade, pSash];
  /* 칸 배치: zone 0,1 = 맨 아래 줄 … 6,7 = 맨 윗줄. (텍스처 v축과 canvas y축을 맞춘다) */
  for (let i = 0; i < paint.length; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = col * CELL_W, y = SIZE - (row + 1) * CELL_H;
    g.save();
    g.beginPath(); g.rect(x, y, CELL_W, CELL_H); g.clip();
    g.translate(x, y);
    paint[i](g, CELL_W, CELL_H);
    g.restore();
    /* 칸 경계 — 이웃 칸으로 새지 않게 1px 어둡게 덮는다(밉맵 없이도 경계가 보이지 않는다) */
    g.save();
    g.globalAlpha = 0.16; g.fillStyle = '#2a2622';
    g.fillRect(x, y, CELL_W, 1); g.fillRect(x, y + CELL_H - 1, CELL_W, 1);
    g.fillRect(x, y, 1, CELL_H); g.fillRect(x + CELL_W - 1, y, 1, CELL_H);
    g.restore();
  }
  /* 칸 중심 맞춤 — 칸마다 **중앙 밝기(median)를 0.75** 로 옮긴다(스케일이 아니라 오프셋).
     셰이더가 `1.0 + (c - 0.75) * 1.9` 로 명암을 벌리므로, 0.75 가 '아무 결도 아닌 바탕'이 된다.
     오프셋만 쓰는 이유: 곱으로 정규화하면 밝은 쪽이 255에서 잘려 결이 사라진다(실측). */
  for (let i = 0; i < paint.length; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = col * CELL_W, y = SIZE - (row + 1) * CELL_H;
    const img = g.getImageData(x, y, CELL_W, CELL_H);
    const d = img.data;
    const histogram = new Uint32Array(766);
    for (let k = 0; k < d.length; k += 4) histogram[d[k] + d[k + 1] + d[k + 2]]++;
    const middle = (d.length / 4) >> 1;
    let count = 0, sum = 0;
    while (count + histogram[sum] <= middle) count += histogram[sum++];
    const med = Math.fround(sum / 765);
    const off = (0.75 - med) * 255;
    for (let k = 0; k < d.length; k += 4) {
      d[k] = Math.max(0, Math.min(255, d[k] + off));
      d[k + 1] = Math.max(0, Math.min(255, d[k + 1] + off));
      d[k + 2] = Math.max(0, Math.min(255, d[k + 2] + off));
    }
    g.putImageData(img, x, y);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;       /* 값 그대로 = 1.0 근처의 명암 결 */
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;               /* 칸 사이 밉 번짐 방지 · 로딩 지연 0 */
  t.anisotropy = 1;
  t.needsUpdate = true;
  _tex = t;
  if (SIZE <= 512) { try { _url = cv.toDataURL('image/png'); } catch (e) {} }
  return _tex;
}
/** QA — 아틀라스를 PNG dataURL 로 꺼낸다(육안 확인용). */
export function dataUrl() { atlas(); return _url; }

export function uniforms() {
  return {
    uTex: { value: atlas() },
    uTexAmt: { value: AMT }
  };
}

/* ---------------------------------------------------------------- UV 만들기
   부위 지오메트리마다 결의 방향과 밀도를 정한다.
   · plane : 납작한 판(부적·흉갑·칼날) — 한 칸을 판 앞면에 한 번만 앉힌다.
   · cyl   : 몸통·팔다리 — 둘레로 감고, 0.45m 마다 한 칸씩 반복한다.
   반환값은 BufferGeometry 에 그대로 붙일 수 있는 Float32Array(count*2). */
export function makeUV(geo, mode) {
  const pos = geo.getAttribute('position');
  if (!pos) return null;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const w = Math.max(1e-4, bb.max.x - bb.min.x);
  const h = Math.max(1e-4, bb.max.y - bb.min.y);
  const d = Math.max(1e-4, bb.max.z - bb.min.z);
  const cx = (bb.max.x + bb.min.x) * 0.5, cz = (bb.max.z + bb.min.z) * 0.5;
  const arr = new Float32Array(pos.count * 2);
  const flat = mode === 'plane';
  const su = flat ? 1 : Math.max(1, Math.round((Math.PI * Math.max(w, d)) / 0.55));
  const sv = flat ? 1 : Math.max(1, h / 0.45);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (flat) {
      u = (x - bb.min.x) / w;
      v = (y - bb.min.y) / h;
    } else {
      u = (Math.atan2(x - cx, z - cz) / (Math.PI * 2) + 0.5) * su;
      v = ((y - bb.min.y) / h) * sv;
    }
    arr[i * 2] = u;
    arr[i * 2 + 1] = v;
  }
  return arr;
}
/** 지오메트리 종류로 결 방향을 고른다(납작한 판은 plane, 나머지는 cyl). */
export function uvModeFor(geo) {
  const t = geo && geo.type;
  return (t === 'BoxGeometry' || t === 'ExtrudeGeometry' || t === 'PlaneGeometry') ? 'plane' : 'cyl';
}
export function info() {
  return { on: enabled(), amt: AMT, cells: COLS * ROWS, size: SIZE, off: OFF };
}
