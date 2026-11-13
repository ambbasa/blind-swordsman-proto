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

/** The engraved shape mark, centred on (x, y) with half-size s. */
function mark(ctx, shape, x, y, s, width, color, rnd) {
  let pts = null;
  if (shape === 'hline') pts = [[[x - s, y], [x + s, y]]];
  else if (shape === 'vline') pts = [[[x, y - s], [x, y + s]]];
  else if (shape === 'vee') pts = [[[x - s, y - s * 0.75], [x, y + s * 0.85], [x + s, y - s * 0.75]]];
  else if (shape === 'bolt') pts = [[[x + s * 0.45, y - s], [x - s * 0.45, y - s * 0.05], [x + s * 0.45, y + s * 0.05], [x - s * 0.4, y + s]]];
  if (!pts) return;
  pts.forEach(function (p) {
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
  const tint = { xp: JADE, coin: GOLD, heal: RED, dashplus: JADE, ice: 'rgba(142,232,255,', fire: RED, poison: 'rgba(176,77,255,', bell: GOLD }[kind] || PAPER;
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

/** The shape mark alone, for the spirit's orb: thick ink strokes with a paper edge on transparency. */
export function drawGlyph(shape) {
  const S = 128, c = canvas(S, S), ctx = c.getContext('2d');
  const rnd = rng(INK_ICONS.seed + (shape || 'plain').length * 23);
  /* Dark ink strokes with a paper edge, so the mark reads on the bright orb. */
  if (shape && shape !== 'plain') {
    const k = { hline: [[[-1, 0], [1, 0]]], vline: [[[0, -1], [0, 1]]], vee: [[[-1, -0.75], [0, 0.85], [1, -0.75]]], bolt: [[[0.45, -1], [-0.45, -0.05], [0.45, 0.05], [-0.4, 1]]] }[shape];
    const sc = 40;
    (k || []).forEach(function (line) {
      const p = line.map(function (q) { return [S / 2 + q[0] * sc, S / 2 + q[1] * sc]; });
      stroke(ctx, p, 24, PAPER + '0.9)');
      stroke(ctx, p, 15, INK + '1)');
      brush(ctx, p, 8, 'rgba(40,36,38,', 0.6, rnd, 4);
    });
  }
  return c;
}

/** A shaman's rattle (무당방울): a short red handle, tiers of small brass bells, five-colour ribbons. Handle end at the bottom centre. */
export function drawRattle() {
  const W = 96, H = 168, c = canvas(W, H), ctx = c.getContext('2d');
  const rnd = rng(INK_ICONS.seed + 401);
  const cx = W / 2;
  const cols = [RED, GOLD, 'rgba(46,120,200,', PAPER, 'rgba(40,140,90,'];
  cols.forEach(function (col, i) {
    const x = cx - 10 + i * 5;
    stroke(ctx, curve([cx, H - 30], [x - 6, H - 14], [x - 12 + (rnd() - 0.5) * 6, H - 2], 8), 4, col + '0.95)');
  });
  stroke(ctx, [[cx, H - 4], [cx, 70]], 9, 'rgba(150,40,30,1)');
  brush(ctx, [[cx - 2, H - 6], [cx - 2, 72]], 2, PAPER, 0.4, rnd, 2);
  /* Tiers of bells: 1 on top, then 2, then 4. */
  const tiers = [[1, 16], [2, 38], [4, 60]];
  tiers.forEach(function (t) {
    for (let i = 0; i < t[0]; i++) {
      const x = cx + (i - (t[0] - 1) / 2) * 20, y = t[1];
      const gg = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
      gg.addColorStop(0, 'rgba(255,236,170,1)'); gg.addColorStop(0.6, GOLD + '1)'); gg.addColorStop(1, 'rgba(110,80,30,1)');
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = gg; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 5, y + 2); ctx.lineTo(x + 5, y + 2); ctx.strokeStyle = 'rgba(40,28,10,0.9)'; ctx.lineWidth = 2; ctx.stroke();
      stroke(ctx, [[x, y + 9], [cx, 70]], 2.5, 'rgba(90,70,40,0.9)');
    }
  });
  return c;
}
