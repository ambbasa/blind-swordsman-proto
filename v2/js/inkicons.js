/* 수묵 아이콘: 혼령의 종(무늬 새김), 아이템, 타이틀 무늬 칩을 캔버스에 붓 획으로 그린다. */
import { rng, brush, stroke, curve, poly } from './inkbrush.js';

/** Sizes of the code-drawn icons; the bell keeps the old 190:376 hanging-bell aspect. */
export const INK_ICONS = { bellW: 190, bellH: 376, item: 160, seal: 96, seed: 777 };

const PAPER = 'rgba(240,230,206,', INK = 'rgba(10,9,12,', RED = 'rgba(200,40,30,', GOLD = 'rgba(217,180,90,', JADE = 'rgba(46,230,166,';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export const SPIRIT_GLYPH_PATHS = {
    hline: [[[-1, 0.08], [0.05, -0.04], [1, 0.02]]],
    vline: [[[0.04, -1], [-0.03, 0.1], [0.02, 1]]],
    vee: [[[-0.95, -0.7], [0, 0.85]], [[0, 0.85], [0.95, -0.8]]],
    bolt: [[[0.45, -1], [-0.45, -0.05]], [[-0.45, -0.05], [0.45, 0.05]], [[0.45, 0.05], [-0.4, 1]]],
    star: [[[0,-1],[0.59,0.81],[-0.95,-0.31],[0.95,-0.31],[-0.59,0.81],[0,-1]]],
    circle: [Array.from({ length: 33 }, (_, i) => [Math.sin(i * Math.PI / 16), -Math.cos(i * Math.PI / 16)])],
    tap: [[[-0.09, 0.02], [0.09, -0.02]]],
    square: [[[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85], [-0.85, -0.85]]],
    /* v0.26 기물 전용: 삼각 · 반달 · 소용돌이 */
    tri: [[[0, -0.95], [0.9, 0.75], [-0.9, 0.75], [0, -0.95]]],
    arc: [[[-0.95, -0.35], [-0.918, -0.104], [-0.823, 0.125], [-0.672, 0.322], [-0.475, 0.473], [-0.246, 0.568], [-0.0, 0.6], [0.246, 0.568], [0.475, 0.473], [0.672, 0.322], [0.823, 0.125], [0.918, -0.104], [0.95, -0.35]]],
    spiral: [[[0.12, 0.0], [0.133, 0.046], [0.128, 0.099], [0.1, 0.152], [0.05, 0.197], [-0.018, 0.223], [-0.097, 0.224], [-0.179, 0.196], [-0.251, 0.138], [-0.302, 0.053], [-0.323, -0.051], [-0.308, -0.163], [-0.253, -0.269], [-0.16, -0.355], [-0.039, -0.409], [0.101, -0.419], [0.242, -0.382], [0.369, -0.296], [0.464, -0.167], [0.514, -0.008], [0.509, 0.165], [0.444, 0.334], [0.324, 0.477], [0.158, 0.576], [-0.039, 0.617], [-0.244, 0.59], [-0.436, 0.495], [-0.591, 0.337], [-0.689, 0.131], [-0.715, -0.102], [-0.662, -0.337], [-0.531, -0.548], [-0.334, -0.709], [-0.088, -0.8], [0.18, -0.806], [0.442, -0.722], [0.668, -0.553], [0.83, -0.314], [0.908, -0.029], [0.888, 0.273], [0.769, 0.558]]]
  };

/** The engraved shape mark, centred on (x, y) with half-size s. */
function mark(ctx, shape, x, y, s, width, color, rnd) {
  const paths = SPIRIT_GLYPH_PATHS[shape];
  if (!paths) return;
  paths.forEach(function (path) {
    const p = path.map(([dx, dy]) => [x + dx * s, y + dy * s]);
    stroke(ctx, p, width + 6, INK + '0.9)');
    stroke(ctx, p, width, color);
    brush(ctx, p, width * 0.7, 'rgba(255,250,236,', 0.5, rnd, 4);
  });
}

/** A hanging bell (방울 종): vermilion cord, dark bronze body with a paper rim, the shape mark in paper white. */
export function drawBell(shape) {
  const W = INK_ICONS.bellW, H = INK_ICONS.bellH;
  const c = canvas(W, H), ctx = c.getContext('2d');
  const rnd = rng(INK_ICONS.seed + (shape || 'plain').length * 31);
  const cx = W / 2;
  /* Cord from the top. */
  stroke(ctx, [[cx, 0], [cx - 3, 40], [cx, 86]], 9, RED + '1)');
  ctx.beginPath(); ctx.arc(cx, 92, 14, 0, Math.PI * 2); ctx.fillStyle = RED + '1)'; ctx.fill();
  /* Bell body. */
  const body = curve([cx - 20, 104], [cx - 30, 106], [cx - 52, 180], 10)
    .concat(curve([cx - 52, 180], [cx - 76, 290], [cx - 86, 340], 10).slice(1))
    .concat([[cx + 86, 340]])
    .concat(curve([cx + 86, 340], [cx + 76, 290], [cx + 52, 180], 10).slice(1))
    .concat(curve([cx + 52, 180], [cx + 30, 106], [cx + 20, 104], 10).slice(1));
  const g = ctx.createLinearGradient(cx - 86, 0, cx + 86, 0);
  g.addColorStop(0, 'rgba(36,32,30,1)'); g.addColorStop(0.45, 'rgba(70,62,52,1)'); g.addColorStop(1, 'rgba(18,16,16,1)');
  poly(ctx, body, g);
  brush(ctx, body, 6, PAPER, 0.55, rnd, 6);
  /* Lip and clapper. */
  ctx.beginPath(); ctx.ellipse(cx, 340, 88, 14, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(14,12,12,1)'; ctx.fill();
  brush(ctx, curve([cx - 88, 338], [cx, 330], [cx + 88, 338], 16), 5, GOLD, 0.8, rnd, 5);
  ctx.beginPath(); ctx.arc(cx, 360, 12, 0, Math.PI * 2); ctx.fillStyle = 'rgba(14,12,12,1)'; ctx.fill();
  /* Paper medallion with the mark. */
  if (shape && shape !== 'plain') {
    ctx.beginPath(); ctx.arc(cx, 246, 62, 0, Math.PI * 2); ctx.fillStyle = PAPER + '0.95)'; ctx.fill();
    mark(ctx, shape, cx, 246, 38, 14, INK + '1)', rnd);
  }
  return c;
}

function disc(ctx, x, y, r, fill, rim, rnd) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  const ring = [];
  for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2; ring.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  brush(ctx, ring, 6, rim, 0.85, rnd, 6);
}

/** An item medallion: ink disc with a paper rim and the item's emblem. */
export function drawItem(kind) {
  const S = INK_ICONS.item, c = canvas(S, S), ctx = c.getContext('2d');
  const rnd = rng(INK_ICONS.seed + kind.length * 17);
  const x = S / 2, y = S / 2;
  const glow = ctx.createRadialGradient(x, y, 30, x, y, 78);
  const tint = { xp: JADE, coin: GOLD, heal: RED, dashplus: JADE, ice: 'rgba(142,232,255,', fire: RED, poison: 'rgba(176,77,255,', bell: GOLD, charm: GOLD, herb: 'rgba(96,214,120,', magnet: 'rgba(120,196,255,', bang: 'rgba(255,150,60,' }[kind] || PAPER;
  glow.addColorStop(0, tint + '0.45)'); glow.addColorStop(1, tint + '0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, S, S);
  disc(ctx, x, y, 52, 'rgba(14,12,14,0.96)', PAPER, rnd);
  if (kind === 'coin') {
    disc(ctx, x, y, 34, GOLD + '1)', 'rgba(120,90,30,', rnd);
    ctx.fillStyle = 'rgba(14,12,14,1)'; ctx.fillRect(x - 10, y - 10, 20, 20);
  } else if (kind === 'xp') {
    const g = ctx.createRadialGradient(x - 10, y - 12, 4, x, y, 34);
    g.addColorStop(0, 'rgba(230,255,244,1)'); g.addColorStop(0.5, JADE + '1)'); g.addColorStop(1, 'rgba(10,90,70,1)');
    ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  } else if (kind === 'heal') {
    /* Gourd bottle (호리병). */
    ctx.beginPath(); ctx.arc(x, y + 14, 22, 0, Math.PI * 2); ctx.arc(x, y - 14, 14, 0, Math.PI * 2);
    ctx.fillStyle = RED + '1)'; ctx.fill();
    stroke(ctx, [[x, y - 30], [x, y - 40]], 8, PAPER + '1)');
    brush(ctx, curve([x - 12, y + 6], [x, y + 2], [x + 12, y + 6], 8), 3, PAPER, 0.7, rnd, 3);
  } else if (kind === 'dashplus') {
    stroke(ctx, [[x - 30, y + 26], [x + 26, y - 30]], 8, 'rgba(214,226,224,1)');
    brush(ctx, [[x - 30, y + 26], [x + 26, y - 30]], 3, JADE, 0.9, rnd, 3);
    stroke(ctx, [[x - 22, y + 4], [x - 4, y + 22]], 7, 'rgba(120,92,60,1)');
    stroke(ctx, [[x + 14, y + 14], [x + 34, y + 14]], 6, GOLD + '1)');
    stroke(ctx, [[x + 24, y + 4], [x + 24, y + 24]], 6, GOLD + '1)');
  } else if (kind === 'fire') {
    ctx.beginPath(); ctx.moveTo(x - 20, y + 24); ctx.quadraticCurveTo(x - 26, y - 6, x + 2, y - 34);
    ctx.quadraticCurveTo(x + 6, y - 6, x + 22, y + 24); ctx.quadraticCurveTo(x, y + 36, x - 20, y + 24);
    ctx.fillStyle = 'rgba(230,60,30,1)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 9, y + 22); ctx.quadraticCurveTo(x - 10, y + 4, x + 2, y - 10);
    ctx.quadraticCurveTo(x + 4, y + 6, x + 10, y + 22); ctx.closePath(); ctx.fillStyle = 'rgba(255,210,120,1)'; ctx.fill();
  } else if (kind === 'ice') {
    poly(ctx, [[x, y - 36], [x + 18, y - 4], [x + 8, y + 32], [x - 10, y + 30], [x - 20, y - 2]], 'rgba(190,236,252,1)');
    brush(ctx, [[x, y - 36], [x - 2, y + 30]], 3, 'rgba(255,255,255,', 0.9, rnd, 3);
  } else if (kind === 'poison') {
    ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.quadraticCurveTo(x + 28, y + 2, x + 18, y + 20);
    ctx.quadraticCurveTo(x, y + 38, x - 18, y + 20); ctx.quadraticCurveTo(x - 28, y + 2, x, y - 34);
    ctx.fillStyle = 'rgba(150,60,220,1)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x - 6, y + 8, 6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(230,200,255,0.8)'; ctx.fill();
  } else if (kind === 'bell') {
    const b = drawBell('plain');
    ctx.drawImage(b, x - 22, y - 44, 44, 88);
  } else if (kind === 'herb') {
    /* 묵항아리에서 나온 약초·주먹밥: 잎 세 장과 뿌리 */
    stroke(ctx, [[x, y + 30], [x - 2, y - 6]], 6, 'rgba(60,140,80,1)');
    [[-1, 0], [1, -6], [0, -20]].forEach(function (o) {
      ctx.beginPath();
      ctx.ellipse(x + o[0] * 16, y + o[1], 16, 9, o[0] * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(86,196,110,1)'; ctx.fill();
      ctx.strokeStyle = 'rgba(30,80,40,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    });
    ctx.beginPath(); ctx.ellipse(x, y + 14, 13, 8, 0, 0, Math.PI * 2); ctx.fillStyle = PAPER + '1)'; ctx.fill();
  } else if (kind === 'magnet') {
    /* 자석 부적: 종이 부적에 붉은 글씨 */
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.08);
    ctx.fillStyle = PAPER + '0.98)'; ctx.fillRect(-20, -32, 40, 64);
    ctx.strokeStyle = 'rgba(150,30,24,0.9)'; ctx.lineWidth = 3; ctx.strokeRect(-20, -32, 40, 64);
    stroke(ctx, [[0, -22], [0, 22]], 6, 'rgba(180,40,30,1)');
    stroke(ctx, [[-10, -10], [10, -10]], 5, 'rgba(180,40,30,1)');
    stroke(ctx, [[-8, 8], [8, 8]], 5, 'rgba(180,40,30,1)');
    ctx.restore();
    const g2 = ctx.createRadialGradient(x, y, 8, x, y, 46);
    g2.addColorStop(0, 'rgba(120,196,255,0.5)'); g2.addColorStop(1, 'rgba(120,196,255,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'charm') {
    /* 부적 상자(보물함): 황금 테를 두른 먹빛 함에 붉은 봉인 — 한 가지 종과 확실히 구분된다. */
    ctx.save();
    ctx.translate(x, y + 2);
    const body = ctx.createLinearGradient(-30, -24, 30, 26);
    body.addColorStop(0, 'rgba(96,74,32,1)'); body.addColorStop(0.5, 'rgba(52,42,22,1)'); body.addColorStop(1, 'rgba(26,20,12,1)');
    ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(30, 0); ctx.lineTo(26, 26); ctx.lineTo(-26, 26); ctx.closePath();
    ctx.fillStyle = body; ctx.fill();
    stroke(ctx, [[-30, 0], [30, 0], [26, 26], [-26, 26], [-30, 0]], 5, GOLD + '0.95)');
    /* 뚜껑 — 둥근 지붕 */
    ctx.beginPath(); ctx.moveTo(-32, -2); ctx.quadraticCurveTo(0, -34, 32, -2); ctx.closePath();
    ctx.fillStyle = 'rgba(70,54,26,1)'; ctx.fill();
    brush(ctx, curve([-32, -2], [0, -34], [32, -2], 16), 5, GOLD, 0.9, rnd, 5);
    /* 붉은 봉인 */
    ctx.fillStyle = RED + '1)'; ctx.fillRect(-9, -6, 18, 20);
    stroke(ctx, [[-9, -6], [-9, 14]], 2, PAPER + '0.7)');
    stroke(ctx, [[0, -2], [0, 10]], 3, PAPER + '0.95)');
    stroke(ctx, [[-6, 2], [6, 2]], 3, PAPER + '0.95)');
    ctx.restore();
    const g3 = ctx.createRadialGradient(x, y, 6, x, y, 56);
    g3.addColorStop(0, 'rgba(230,190,90,0.55)'); g3.addColorStop(1, 'rgba(230,190,90,0)');
    ctx.fillStyle = g3; ctx.beginPath(); ctx.arc(x, y, 56, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'bang') {
    /* 화약 부적: 터지는 불꽃 */
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      stroke(ctx, [[x + Math.cos(a) * 10, y + Math.sin(a) * 10], [x + Math.cos(a) * 34, y + Math.sin(a) * 34]], 5, 'rgba(255,150,50,1)');
    }
    ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,214,120,1)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,96,40,1)'; ctx.fill();
  }
  return c;
}

/**
 * 레벨업 카드 아이콘: 먹 원판 위에 그 카드만의 표식을 붓으로 그린다.
 * 카드가 서로 구분되도록 원소·회복은 기존 아이템 도안을 그대로 쓴다.
 */
export function drawUpgrade(id) {
  if (id === 'ice' || id === 'fire' || id === 'poison' || id === 'heal') return drawItem(id === 'heal' ? 'heal' : id);
  const S = INK_ICONS.item, c = canvas(S, S), ctx = c.getContext('2d');
  const rnd = rng(INK_ICONS.seed + (id || '').length * 23 + (id || '').charCodeAt(0));
  const x = S / 2, y = S / 2;
  const tint = {
    dmg: 'rgba(226,232,228,', width: 'rgba(190,232,255,', dash: JADE, ring: 'rgba(150,220,255,',
    charge: GOLD, perfect: 'rgba(255,244,214,', parry: 'rgba(255,196,120,'
  }[id] || PAPER;
  const glow = ctx.createRadialGradient(x, y, 28, x, y, 76);
  glow.addColorStop(0, tint + '0.34)'); glow.addColorStop(1, tint + '0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, S, S);
  disc(ctx, x, y, 52, 'rgba(14,12,14,0.96)', PAPER, rnd);
  if (id === 'dmg') {
    stroke(ctx, [[x - 30, y + 28], [x + 28, y - 30]], 9, 'rgba(226,232,228,0.95)');
    stroke(ctx, [[x + 26, y + 26], [x - 6, y - 4]], 5, 'rgba(150,160,158,0.85)');
    for (let i = 0; i < 3; i++) {
      const a = -0.9 + i * 0.35;
      stroke(ctx, [[x + Math.cos(a) * 12, y + Math.sin(a) * 12], [x + Math.cos(a) * 34, y + Math.sin(a) * 34]], 3, RED + '0.9)');
    }
  } else if (id === 'width') {
    stroke(ctx, [[x - 34, y + 10], [x + 34, y + 10]], 5, 'rgba(190,232,255,0.95)');
    stroke(ctx, [[x - 34, y + 24], [x + 34, y + 24]], 3, 'rgba(120,170,200,0.7)');
    stroke(ctx, [[x - 34, y - 8], [x + 34, y - 8]], 3, 'rgba(120,170,200,0.7)');
    brush(ctx, [[x - 30, y - 18], [x + 30, y - 18]], 4, PAPER, 0.5, rnd, 4);
  } else if (id === 'dash') {
    for (let i = 0; i < 3; i++) {
      const ox = -24 + i * 22;
      stroke(ctx, [[x + ox, y - 26], [x + ox + 14, y], [x + ox, y + 26]], 7, JADE + '0.95)');
    }
  } else if (id === 'ring') {
    const ring = [];
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; ring.push([x + Math.cos(a) * 32, y + Math.sin(a) * 32]); }
    brush(ctx, ring, 5, 'rgba(150,220,255,0.95)', 0.9, rnd, 6);
    const inner = [];
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2 + 0.6; inner.push([x + Math.cos(a) * 18, y + Math.sin(a) * 18]); }
    brush(ctx, inner, 3, 'rgba(150,220,255,0.55)', 0.6, rnd, 4);
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = PAPER + '1)'; ctx.fill();
  } else if (id === 'charge') {
    const arc = [];
    for (let i = 0; i <= 34; i++) { const a = -Math.PI * 0.5 + (i / 34) * Math.PI * 1.6; arc.push([x + Math.cos(a) * 30, y + Math.sin(a) * 30]); }
    stroke(ctx, [[x, y - 34], [x, y + 8]], 6, GOLD + '0.9)');
    brush(ctx, arc, 7, GOLD, 0.95, rnd, 6);
    ctx.beginPath(); ctx.arc(x, y + 12, 7, 0, Math.PI * 2); ctx.fillStyle = GOLD + '1)'; ctx.fill();

  } else if (id === 'perfect') {
    stroke(ctx, [[x - 34, y + 18], [x + 34, y + 18]], 6, 'rgba(255,244,214,0.98)');
    brush(ctx, [[x - 30, y + 18], [x + 30, y + 18]], 3, GOLD, 0.9, rnd, 3);
    for (let i = -1; i <= 1; i++) {
      const tx = x + i * 20;
      stroke(ctx, [[tx, y - 2], [tx, y + 8]], 3, 'rgba(200,206,200,0.8)');
    }
    stroke(ctx, [[x, y - 8], [x, y - 34]], 2, 'rgba(255,244,214,0.5)');
    stroke(ctx, [[x - 6, y - 22], [x + 6, y - 22]], 2, 'rgba(255,244,214,0.5)');
    ctx.beginPath(); ctx.arc(x, y - 24, 3, 0, Math.PI * 2); ctx.fillStyle = GOLD + '1)'; ctx.fill();
  } else if (id === 'parry') {
    /* 칼집(鞘)과 받아치는 궤적 */
    stroke(ctx, [[x - 6, y - 34], [x - 6, y + 26]], 10, 'rgba(60,50,44,1)');
    stroke(ctx, [[x - 6, y - 34], [x - 6, y + 26]], 4, 'rgba(150,120,80,0.9)');
    const arc = [];
    for (let i = 0; i <= 20; i++) { const a = -0.8 + (i / 20) * 1.7; arc.push([x + 6 + Math.cos(a) * 30, y + Math.sin(a) * 30]); }
    brush(ctx, arc, 6, 'rgba(255,196,120,0.95)', 0.9, rnd, 5);
    for (let i = 0; i < 4; i++) {
      const a = -0.5 + i * 0.5;
      stroke(ctx, [[x + 6 + Math.cos(a) * 34, y + Math.sin(a) * 34], [x + 6 + Math.cos(a) * 46, y + Math.sin(a) * 46]], 2, 'rgba(255,230,180,0.85)');
    }
  } else if (id === 'ward') {
    /* 회전 호신부: 궤도 위의 부적 두 장 */
    const orb = [];
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; orb.push([x + Math.cos(a) * 30, y + Math.sin(a) * 30]); }
    stroke(ctx, orb, 2.5, 'rgba(255,220,130,0.45)');
    [[0.5, 30], [3.7, 30]].forEach(function (p) {
      const px = x + Math.cos(p[0]) * p[1], py = y + Math.sin(p[0]) * p[1];
      ctx.save(); ctx.translate(px, py); ctx.rotate(p[0] + 0.5);
      ctx.fillStyle = GOLD + '0.95)'; ctx.fillRect(-5, -9, 10, 18);
      ctx.strokeStyle = 'rgba(20,16,12,0.8)'; ctx.lineWidth = 1.6; ctx.strokeRect(-5, -9, 10, 18);
      ctx.restore();
    });
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fillStyle = PAPER + '0.9)'; ctx.fill();
  } else if (id === 'bolt') {
    /* 벼락부적: 지그재그 번개 + 예고 원 */
    const ring = [];
    for (let i = 0; i <= 36; i++) { const a = (i / 36) * Math.PI * 2; ring.push([x + Math.cos(a) * 32, y + Math.sin(a) * 32]); }
    stroke(ctx, ring, 2, 'rgba(255,214,110,0.35)');
    stroke(ctx, [[x - 8, y - 30], [x + 8, y - 8], [x - 6, y - 2], [x + 10, y + 12], [x - 4, y + 14], [x - 2, y + 30]], 6, GOLD + '0.98)');
    stroke(ctx, [[x - 8, y - 30], [x + 8, y - 8], [x - 6, y - 2], [x + 10, y + 12], [x - 4, y + 14], [x - 2, y + 30]], 2, 'rgba(255,250,220,0.9)');
  } else if (id === 'echo') {
    /* 메아리 칼: 같은 경로를 한 번 더 지나는 잔영 */
    stroke(ctx, [[x - 32, y + 22], [x + 18, y - 26]], 7, 'rgba(190,232,255,0.95)');
    stroke(ctx, [[x - 20, y + 30], [x + 30, y - 18]], 4, 'rgba(120,200,220,0.5)');
    for (let i = 0; i < 3; i++) {
      const u = i / 3;
      ctx.beginPath();
      ctx.arc(x - 6 + u * 26, y + 4 - u * 20, 3 + i, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(190,232,255,' + (0.5 - i * 0.12).toFixed(2) + ')'; ctx.fill();
    }
  } else if (id === 'reson') {
    /* 방울 공명: 방울과 퍼지는 물결 */
    stroke(ctx, [[x, y - 32], [x, y - 22]], 4, 'rgba(150,120,80,0.95)');
    const bg = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, 16);
    bg.addColorStop(0, 'rgba(255,240,190,1)'); bg.addColorStop(0.65, GOLD + '1)'); bg.addColorStop(1, 'rgba(110,80,30,1)');
    ctx.beginPath(); ctx.moveTo(x - 12, y + 14); ctx.quadraticCurveTo(x - 12, y - 14, x, y - 16);
    ctx.quadraticCurveTo(x + 12, y - 14, x + 12, y + 14); ctx.closePath(); ctx.fillStyle = bg; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 16, y + 16); ctx.lineTo(x + 16, y + 16); ctx.strokeStyle = 'rgba(40,28,10,0.85)'; ctx.lineWidth = 3; ctx.stroke();
    [[24, 0.6], [32, 0.35], [40, 0.2]].forEach(function (p) {
      const arc = [];
      for (let i = 0; i <= 16; i++) { const a = -0.6 + (i / 16) * 1.2; arc.push([x + Math.cos(a) * p[0], y + 30 + Math.sin(a) * p[0]]); }
      stroke(ctx, arc, 2, 'rgba(255,220,130,' + p[1] + ')');
    });
  } else if (id === 'counter') {
    /* 칼집 반격: 칼집에서 되돌아 나가는 일섬 */
    stroke(ctx, [[x - 26, y - 30], [x - 26, y + 22]], 9, 'rgba(60,50,44,1)');
    stroke(ctx, [[x - 26, y - 30], [x - 26, y + 22]], 3.5, 'rgba(150,120,80,0.9)');
    stroke(ctx, [[x - 20, y + 12], [x + 30, y - 24]], 5, 'rgba(255,214,120,0.95)');
    for (let i = 0; i < 3; i++) {
      const a = -0.6 + i * 0.5;
      stroke(ctx, [[x + 4 + Math.cos(a) * 16, y + Math.sin(a) * 16], [x + 4 + Math.cos(a) * 30, y + Math.sin(a) * 30]], 2, 'rgba(255,235,190,0.8)');
    }
  } else if (id === 'inkstep') {
    /* 먹 발자국: 발자국과 먹 웅덩이 */
    ctx.beginPath(); ctx.ellipse(x, y + 18, 30, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,9,12,0.9)'; ctx.fill();
    ctx.strokeStyle = 'rgba(150,140,126,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x - 8, y - 6, 6, 10, -0.2, 0, Math.PI * 2); ctx.fillStyle = PAPER + '0.5)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 10, y - 14, 5.5, 9, -0.1, 0, Math.PI * 2); ctx.fillStyle = PAPER + '0.36)'; ctx.fill();
  }
  return c;
}

/** A round title chip with the shape mark in ink on paper. */
export function drawSeal(shape) {
  const S = INK_ICONS.seal, c = canvas(S, S), ctx = c.getContext('2d');
  const rnd = rng(INK_ICONS.seed + shape.length * 7);
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); ctx.fillStyle = RED + '1)'; ctx.fill();
  mark(ctx, shape, S / 2, S / 2, S * 0.26, 9, PAPER + '1)', rnd);
  return c;
}

/** A shaman's rattle (무당방울), hanging: the red handle on top (its end at the top centre), tiers of small brass bells below, five-colour ribbons trailing down. */
export function drawRattle() {
  const W = 96, H = 168, c = canvas(W, H), ctx = c.getContext('2d');
  const rnd = rng(INK_ICONS.seed + 401);
  const cx = W / 2;
  stroke(ctx, [[cx, 4], [cx, 92]], 9, 'rgba(150,40,30,1)');
  brush(ctx, [[cx - 2, 8], [cx - 2, 88]], 2, PAPER, 0.4, rnd, 2);
  const cols = [RED, GOLD, 'rgba(46,120,200,', PAPER, 'rgba(40,140,90,'];
  cols.forEach(function (col, i) {
    const x = cx - 14 + i * 7;
    stroke(ctx, curve([cx, 18], [x - 8, 80], [x - 4 + (rnd() - 0.5) * 8, H - 4], 10), 4, col + '0.9)');
  });
  /* Bells hanging under the handle: 4, then 2, then 1. */
  const tiers = [[4, 104], [2, 128], [1, 150]];
  tiers.forEach(function (t) {
    for (let i = 0; i < t[0]; i++) {
      const x = cx + (i - (t[0] - 1) / 2) * 20, y = t[1];
      stroke(ctx, [[cx, 92], [x, y - 8]], 2.5, 'rgba(90,70,40,0.9)');
      const gg = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
      gg.addColorStop(0, 'rgba(255,236,170,1)'); gg.addColorStop(0.6, GOLD + '1)'); gg.addColorStop(1, 'rgba(110,80,30,1)');
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = gg; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 5, y + 2); ctx.lineTo(x + 5, y + 2); ctx.strokeStyle = 'rgba(40,28,10,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    }
  });
  return c;
}
