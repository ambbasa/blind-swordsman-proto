/* v2/js/inkpaper.js — 한지·수묵 팝업북(papercut) 소품 텍스처.
   박스·원기둥 대신, 종이를 오려 세운 듯한 실루엣 + 한지빛 테두리 + 먹 번짐을 캔버스에 그려
   청크 월드가 crossed-plane(교차 평면)에 세운다. 모든 스프라이트는 투명 PNG(atlas 없는 개별 텍스처)이며
   alphaTest 컷아웃으로 그려져 그림자를 투사한다. 네온·인공 테두리는 쓰지 않는다. */

const TAU = Math.PI * 2;
const INK = 'rgba(13,12,15,';
const INK2 = 'rgba(28,26,30,';
const INK3 = 'rgba(58,53,56,';
const PAPER = 'rgba(232,222,200,';
const WARM = 'rgba(240,176,96,';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 종이를 오린 자리: 실루엣을 먹으로 채우고, 바깥 윤곽에 한지빛 테두리 한 줄. */
function cutPaper(ctx, path, opts) {
  opts = opts || {};
  ctx.save();
  ctx.beginPath(); path(ctx); ctx.closePath();
  const g = ctx.createLinearGradient(0, opts.y0 || 0, 0, opts.y1 || ctx.canvas.height);
  g.addColorStop(0, opts.top || INK + '1)');
  g.addColorStop(0.55, opts.mid || INK + '0.98)');
  g.addColorStop(1, opts.bottom || 'rgba(6,6,8,1)');
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  /* 한지 테두리 — 두 겹(넓은 옅은 빛 + 얇은 밝은 선). */
  if (opts.rim !== false) {
    ctx.save();
    ctx.beginPath(); path(ctx); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = PAPER + (opts.rimA == null ? 0.20 : opts.rimA) + ')';
    ctx.lineWidth = opts.rimW == null ? 9 : opts.rimW;
    ctx.stroke();
    ctx.strokeStyle = PAPER + (opts.rimA2 == null ? 0.40 : opts.rimA2) + ')';
    ctx.lineWidth = (opts.rimW == null ? 9 : opts.rimW) * 0.34;
    ctx.stroke();
    ctx.restore();
  }
}

/* 먹 번짐 + 한지 섬유 결. */
function grain(ctx, w, h, seed, amount) {
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const n = Math.round(w * h / 90 * (amount == null ? 1 : amount));
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, a = rnd();
    ctx.fillStyle = a > 0.55 ? 'rgba(4,4,6,' + (0.10 + rnd() * 0.18).toFixed(3) + ')'
      : PAPER + (0.05 + rnd() * 0.10).toFixed(3) + ')';
    ctx.fillRect(x, y, 1 + rnd() * 2.2, 1 + rnd() * 2.2);
  }
  ctx.restore();
}

/* 왼쪽에서 오는 달빛: 왼쪽 가장자리를 살짝 밝힌다. */

/* ---------- 소품 그리기 ---------- */

/* 기와집: 팔작지붕 + 처마 + 기둥 + 한지 창 + 등불. 512×512, 발치 y=496. */
function drawHouse(ctx, seed) {
  const rnd = mulberry32(seed);
  const body = function (c) {
    c.moveTo(96, 496); c.lineTo(96, 250); c.lineTo(150, 244); c.lineTo(150, 214);
    c.lineTo(362, 214); c.lineTo(362, 244); c.lineTo(416, 250); c.lineTo(416, 496);
  };
  cutPaper(ctx, body, { top: INK2 + '1)', mid: 'rgba(20,18,21,1)', y0: 200, y1: 512, rimA: 0.26 });
  /* 널벽의 세로 결과 가로 들보 */
  ctx.save(); ctx.beginPath(); body(ctx); ctx.closePath(); ctx.clip();
  for (let i = 0; i < 9; i++) {
    const x = 104 + i * 36 + rnd() * 6;
    ctx.strokeStyle = INK + (0.28 + rnd() * 0.25).toFixed(2) + ')';
    ctx.lineWidth = 2 + rnd() * 2.4;
    ctx.beginPath(); ctx.moveTo(x, 250); ctx.lineTo(x + (rnd() - 0.5) * 8, 496); ctx.stroke();
  }
  ctx.strokeStyle = INK3 + '0.55)'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(96, 330); ctx.lineTo(416, 330); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(96, 420); ctx.lineTo(416, 420); ctx.stroke();
  /* 한지 창: 따뜻한 등불이 비친다. */
  [[168, 300], [268, 300]].forEach(function (p) {
    ctx.fillStyle = WARM + '0.30)'; ctx.fillRect(p[0], p[1], 78, 92);
    ctx.fillStyle = WARM + '0.52)'; ctx.fillRect(p[0] + 8, p[1] + 10, 62, 72);
    ctx.strokeStyle = INK + '0.85)'; ctx.lineWidth = 4;
    ctx.strokeRect(p[0], p[1], 78, 92);
    ctx.beginPath(); ctx.moveTo(p[0] + 39, p[1]); ctx.lineTo(p[0] + 39, p[1] + 92);
    ctx.moveTo(p[0], p[1] + 46); ctx.lineTo(p[0] + 78, p[1] + 46); ctx.stroke();
  });
  grain(ctx, 512, 512, seed + 7, 0.7);
  ctx.restore();
  /* 기둥 */
  [[100, 244], [352, 244]].forEach(function (p) {
    ctx.fillStyle = INK + '0.9)'; ctx.fillRect(p[0], p[1], 16, 252);
    ctx.fillStyle = PAPER + '0.16)'; ctx.fillRect(p[0] + 2, p[1], 4, 252);
  });
  /* 지붕: 처마 두께를 가진 용마루 지붕(먹 덩어리) + 기와 골. */
  const roof = function (c) {
    c.moveTo(52, 272);
    c.quadraticCurveTo(84, 246, 132, 236);
    c.lineTo(192, 206); c.lineTo(320, 206); c.lineTo(380, 236);
    c.quadraticCurveTo(428, 246, 460, 272);
    c.lineTo(438, 268);
    c.quadraticCurveTo(256, 232, 74, 268);
  };
  cutPaper(ctx, roof, { top: 'rgba(34,31,33,1)', mid: 'rgba(18,17,20,1)', bottom: 'rgba(8,8,10,1)', y0: 180, y1: 300, rimA: 0.24 });
  ctx.save(); ctx.beginPath(); roof(ctx); ctx.closePath(); ctx.clip();
  for (let i = 0; i < 24; i++) {
    const x = 54 + i * 17;
    ctx.strokeStyle = PAPER + (0.04 + (i % 3) * 0.02).toFixed(2) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 210); ctx.lineTo(x - 10, 276); ctx.stroke();
  }
  ctx.strokeStyle = PAPER + '0.16)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(60, 268); ctx.quadraticCurveTo(256, 230, 452, 268); ctx.stroke();
  ctx.restore();
  /* 용마루와 망와 */
  ctx.fillStyle = 'rgba(8,8,10,1)';
  ctx.beginPath(); ctx.moveTo(196, 208); ctx.lineTo(316, 208); ctx.lineTo(322, 226); ctx.lineTo(190, 226); ctx.closePath(); ctx.fill();
  [44, 468].forEach(function (x, i) {
    ctx.beginPath(); ctx.ellipse(x, 264 + i * 2, 16, 9, 0.2 * (i ? -1 : 1), 0, TAU);
    ctx.fillStyle = 'rgba(10,10,12,1)'; ctx.fill();
    ctx.strokeStyle = PAPER + '0.30)'; ctx.lineWidth = 2.4; ctx.stroke();
  });
}

/* 대나무 떨기: 가는 마디 대 + 잎. 384×640, 발치 y=620. */
function drawBamboo(ctx, seed) {
  const rnd = mulberry32(seed);
  const stalks = [];
  for (let i = 0; i < 9; i++) {
    const x = 100 + i * 22 + (rnd() - 0.5) * 14;
    const h = 300 + rnd() * 290;
    const lean = (rnd() - 0.5) * 26;
    stalks.push({ x: x, h: h, lean: lean, w: 4 + rnd() * 3.4 });
  }
  stalks.sort(function (a, b) { return b.x - a.x; });
  stalks.forEach(function (s, k) {
    const topX = s.x + s.lean, topY = 620 - s.h;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(s.x - s.w, 620);
    ctx.quadraticCurveTo(s.x - s.w * 0.9, (620 + topY) / 2, topX - s.w * 0.6, topY);
    ctx.lineTo(topX + s.w * 0.6, topY);
    ctx.quadraticCurveTo(s.x + s.w * 0.9, (620 + topY) / 2, s.x + s.w, 620);
    ctx.closePath();
    const g = ctx.createLinearGradient(s.x - s.w, 0, s.x + s.w, 0);
    g.addColorStop(0, PAPER + '0.16)'); g.addColorStop(0.3, INK3 + '0.92)'); g.addColorStop(1, INK + '0.98)');
    ctx.fillStyle = g; ctx.fill();
    /* 윤곽은 얇게, 밝은 테두리는 바깥 실루엣에만(대숲 전체 윤곽은 drawBamboo 끝에서 한 번). */
    ctx.strokeStyle = INK + '0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    /* 마디 */
    for (let y = 620 - 42; y > topY + 8; y -= 46 + rnd() * 8) {
      const t = (620 - y) / Math.max(1, s.h);
      const cx = s.x + s.lean * t;
      ctx.strokeStyle = INK + '0.75)'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(cx - s.w * 1.05, y); ctx.lineTo(cx + s.w * 1.05, y - 1.5); ctx.stroke();
      ctx.strokeStyle = PAPER + '0.18)';
      ctx.beginPath(); ctx.moveTo(cx - s.w * 1.05, y + 2); ctx.lineTo(cx + s.w * 1.05, y + 0.5); ctx.stroke();
    }
    ctx.restore();
    /* 잎: 위쪽으로 모인 붓 잎 무리 — 대숲의 윤곽을 만든다. */
    const leafN = 10 + Math.floor(rnd() * 9);
    for (let i = 0; i < leafN; i++) {
      const ly = topY + 6 + rnd() * 190, lx = topX + (rnd() - 0.5) * 86;
      const dir = rnd() < 0.5 ? -1 : 1, L = 16 + rnd() * 30;
      ctx.save();
      ctx.translate(lx, ly); ctx.rotate(dir * (0.35 + rnd() * 0.95));
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(L * 0.55, -2.6, L, -0.8);
      ctx.quadraticCurveTo(L * 0.5, 3.0, 0, 0);
      ctx.fillStyle = INK + (0.62 + rnd() * 0.3).toFixed(2) + ')'; ctx.fill();
      ctx.restore();
    }
  });
  grain(ctx, 384, 640, seed + 3, 0.6);
}

/* 늙은 소나무: 구불구불한 줄기 + 층층 먹 잎. 512×512, 발치 y=500. */
function drawPine(ctx, seed) {
  const rnd = mulberry32(seed);
  const trunk = function (c) {
    c.moveTo(232, 500); c.quadraticCurveTo(272, 400, 246, 320);
    c.quadraticCurveTo(226, 268, 250, 220); c.lineTo(268, 218);
    c.quadraticCurveTo(252, 270, 274, 330); c.quadraticCurveTo(292, 410, 266, 500);
  };
  cutPaper(ctx, trunk, { top: 'rgba(22,20,22,1)', mid: INK + '1)', y0: 200, y1: 512, rimA: 0.24, rimW: 7 });
  /* 가지 */
  [[246, 300, 150, 250], [258, 340, 360, 292], [252, 240, 196, 190], [262, 270, 340, 220]].forEach(function (b) {
    ctx.strokeStyle = INK + '1)'; ctx.lineCap = 'round';
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.quadraticCurveTo((b[0] + b[2]) / 2, b[1] - 18, b[2], b[3]); ctx.stroke();
    ctx.strokeStyle = PAPER + '0.22)'; ctx.lineWidth = 2; ctx.stroke();
  });
  /* 잎 층: 넓게 겹친 먹 덩어리(소나무 갓) — 층마다 한지 테두리 한 줄. */
  const pads = [[152, 246, 108, 42], [206, 190, 96, 36], [346, 286, 112, 44], [338, 210, 94, 34], [262, 148, 86, 32], [236, 306, 88, 30], [120, 300, 78, 28], [392, 244, 74, 28]];
  pads.forEach(function (p, i) {
    ctx.save();
    ctx.beginPath();
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * TAU;
      const r = 1 + Math.sin(a * 3 + i) * 0.22 + rnd() * 0.10;
      const x = p[0] + Math.cos(a) * p[2] * 0.5 * r, y = p[1] + Math.sin(a) * p[3] * 0.5 * r;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(p[0], p[1] - 6, 4, p[0], p[1], p[2] * 0.6);
    g.addColorStop(0, 'rgba(24,26,22,1)'); g.addColorStop(1, 'rgba(8,9,8,1)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = PAPER + '0.26)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = PAPER + '0.42)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
  });
  grain(ctx, 512, 512, seed + 5, 0.7);
}

/* 돌등불: 기단·기둥·불집·지붕, 불집 창은 따뜻한 호박빛. 256×512, 발치 y=496. */
function drawLantern(ctx, seed) {
  const rnd = mulberry32(seed);
  const base = function (c) { c.moveTo(70, 496); c.lineTo(186, 496); c.lineTo(180, 452); c.lineTo(76, 452); };
  const post = function (c) { c.moveTo(104, 452); c.lineTo(152, 452); c.lineTo(148, 322); c.lineTo(108, 322); };
  const box = function (c) { c.moveTo(84, 322); c.lineTo(172, 322); c.lineTo(172, 236); c.lineTo(84, 236); };
  const cap = function (c) {
    c.moveTo(58, 240); c.quadraticCurveTo(74, 214, 96, 206); c.lineTo(160, 206);
    c.quadraticCurveTo(182, 214, 198, 240); c.lineTo(172, 234); c.lineTo(84, 234);
  };
  cutPaper(ctx, base, { rimA: 0.30, rimW: 7 });
  cutPaper(ctx, post, { rimA: 0.26, rimW: 6 });
  cutPaper(ctx, box, { top: 'rgba(26,24,26,1)', rimA: 0.34, rimW: 7 });
  cutPaper(ctx, cap, { top: 'rgba(30,28,30,1)', rimA: 0.36, rimW: 7 });
  /* 불집의 호박빛 창 */
  ctx.fillStyle = WARM + '0.34)'; ctx.fillRect(96, 250, 64, 62);
  ctx.fillStyle = WARM + '0.62)'; ctx.fillRect(104, 258, 48, 46);
  ctx.strokeStyle = INK + '0.9)'; ctx.lineWidth = 4; ctx.strokeRect(96, 250, 64, 62);
  ctx.beginPath(); ctx.moveTo(128, 250); ctx.lineTo(128, 312); ctx.stroke();
  /* 꼭대기 보주 */
  ctx.beginPath(); ctx.arc(128, 198, 9, 0, TAU); ctx.fillStyle = 'rgba(12,12,14,1)'; ctx.fill();
  ctx.strokeStyle = PAPER + '0.40)'; ctx.lineWidth = 2; ctx.stroke();
  grain(ctx, 256, 512, seed + 11, 0.5);
}

/* 종이 오린 바위: 뾰족한 먹 실루엣 + 한지 테두리 + 먹 결. 512×384, 발치 y=372. */
function drawRock(ctx, seed) {
  const rnd = mulberry32(seed);
  const shape = function (c) {
    c.moveTo(6, 372);
    let x = 6;
    c.lineTo(60 + rnd() * 20, 300 - rnd() * 40);
    c.lineTo(120 + rnd() * 30, 210 - rnd() * 60);
    c.lineTo(198 + rnd() * 30, 120 - rnd() * 40);
    c.lineTo(276 + rnd() * 30, 190 - rnd() * 50);
    c.lineTo(350 + rnd() * 30, 250 - rnd() * 40);
    c.lineTo(430 + rnd() * 30, 320 - rnd() * 30);
    c.lineTo(506, 372);
  };
  cutPaper(ctx, shape, { top: 'rgba(30,28,28,1)', mid: 'rgba(14,13,14,1)', rimA: 0.34, rimW: 8, y0: 80, y1: 384 });
  ctx.save(); ctx.beginPath(); shape(ctx); ctx.closePath(); ctx.clip();
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = PAPER + (0.05 + rnd() * 0.07).toFixed(2) + ')';
    ctx.lineWidth = 2 + rnd() * 5;
    ctx.beginPath();
    const x0 = 40 + rnd() * 420;
    ctx.moveTo(x0, 130 + rnd() * 80);
    ctx.quadraticCurveTo(x0 + 10, 240, x0 - 20 + rnd() * 40, 370);
    ctx.stroke();
  }
  grain(ctx, 512, 384, seed + 13, 0.8);
  ctx.restore();
}

const PAINTERS = { house: [drawHouse, 512, 512], bamboo: [drawBamboo, 384, 640], pine: [drawPine, 512, 512], lantern: [drawLantern, 256, 512], rock: [drawRock, 512, 384] };

/** 종류별 한지·수묵 팝업북 텍스처(캔버스). 무대 재질이 이걸 map 으로 쓴다. */
export function paperPropCanvas(kind, seed) {
  const P = PAINTERS[kind] || PAINTERS.rock;
  const c = document.createElement('canvas');
  c.width = P[1]; c.height = P[2];
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  P[0](ctx, seed || 1);
  return c;
}

/** 화면 비율(가로/세로) — 교차 평면 스케일을 맞출 때 쓴다. */
export const PAPER_ASPECT = { house: 1.0, bamboo: 0.6, pine: 1.0, lantern: 0.5, rock: 1.33 };
