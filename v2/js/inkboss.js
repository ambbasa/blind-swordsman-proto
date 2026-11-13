/* 수묵 귀물(보스): 캔버스에 붓 획으로 그린다. 종 없이, 먹 번짐 몸통·해진 소매·긴 손톱·진홍 눈·흘러내리는 먹 연기. */
import { rng, brush, curve } from './inkbrush.js';

/** Sheet layout and look of the code-drawn boss; cell and anchor match the old boss sheet. */
export const INK_BOSS = {
  cell: 512, frames: 8, fps: 8, anchor: [256, 495],
  ink: '#07060a', wash: 'rgba(40,34,38,', rim: 'rgba(200,40,30,', eye: '#ff3a24', claw: '#d9cdb4',
  sway: 0.035, breathe: 0.025, seed: 1913
};

function drawFrame(ctx, f, P) {
  const T = (f / P.frames) * Math.PI * 2;
  const rnd = rng(P.seed + f * 7);
  const still = rng(P.seed);
  const cx = 256, foot = P.anchor[1];
  ctx.save();
  ctx.translate(cx, foot);
  ctx.rotate(Math.sin(T) * P.sway);
  ctx.scale(1, 1 + Math.sin(T + 1.2) * P.breathe);
  ctx.translate(-cx, -foot);

  /* Ink smoke trailing from the hem down to the ground. */
  for (let i = 0; i < 9; i++) {
    const x0 = 170 + i * 21 + (still() - 0.5) * 12;
    const sw = Math.sin(T + i * 0.9) * 10;
    const g = ctx.createLinearGradient(0, 400, 0, foot);
    g.addColorStop(0, 'rgba(7,6,10,0.85)'); g.addColorStop(1, 'rgba(7,6,10,0)');
    ctx.beginPath();
    ctx.moveTo(x0 - 9, 395);
    ctx.quadraticCurveTo(x0 + sw, 450, x0 + sw * 1.6, foot - 4);
    ctx.quadraticCurveTo(x0 + sw + 6, 450, x0 + 11, 395);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
  }

  /* Robe body: hunched shoulders, ragged hem that waves. */
  const hem = [];
  for (let i = 0; i <= 12; i++) {
    const x = 132 + i * 20.6;
    const y = 400 + (i % 2 ? 26 : 0) + Math.sin(T * 1 + i) * 7 + (still() - 0.5) * 10;
    hem.push([x, y]);
  }
  ctx.beginPath();
  ctx.moveTo(206, 150);
  ctx.quadraticCurveTo(128, 160, 118, 240);
  ctx.quadraticCurveTo(112, 330, 132, hem[0][1]);
  hem.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
  ctx.quadraticCurveTo(400, 330, 394, 240);
  ctx.quadraticCurveTo(384, 160, 306, 150);
  ctx.closePath();
  const body = ctx.createRadialGradient(256, 230, 20, 256, 290, 210);
  body.addColorStop(0, 'rgba(7,6,10,1)'); body.addColorStop(0.75, 'rgba(14,12,16,0.97)'); body.addColorStop(1, 'rgba(40,34,38,0.6)');
  ctx.fillStyle = body; ctx.fill();

  /* Wash blots inside the robe: uneven ink density. */
  ctx.save(); ctx.clip();
  for (let i = 0; i < 26; i++) {
    const x = 130 + still() * 260, y = 160 + still() * 260, r = 14 + still() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, P.wash + (0.18 + still() * 0.2).toFixed(3) + ')'); g.addColorStop(1, P.wash + '0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();

  /* A few uneven fold strokes, curving with the hunch. */
  [[176, 200, -26, 0.9], [232, 196, 18, 0.6], [292, 204, -14, 0.75], [338, 210, 30, 0.85]].forEach(function (q, i) {
    const x = q[0], y = q[1];
    brush(ctx, curve([x, y], [x + q[2], y + 90], [x + q[2] * 0.4 + Math.sin(T + i) * 6, y + 190 * q[3]], 18), 9, 'rgba(46,40,44,', 0.55, rnd, 7);
  });

  /* Sleeves and long claws, swinging slightly out of phase. */
  [-1, 1].forEach(function (side) {
    const sx = 256 + side * 112, swing = Math.sin(T + (side > 0 ? 0 : Math.PI)) * 8;
    ctx.beginPath();
    ctx.moveTo(sx - side * 8, 175);
    ctx.quadraticCurveTo(sx + side * 46, 240, sx + side * 40 + swing, 330);
    ctx.lineTo(sx + side * 6 + swing, 345);
    ctx.quadraticCurveTo(sx - side * 10, 260, sx - side * 30, 200);
    ctx.closePath();
    ctx.fillStyle = 'rgba(9,8,12,0.98)'; ctx.fill();
    const sleeveEdge = curve([sx - side * 6, 178], [sx + side * 48, 242], [sx + side * 41 + swing, 332], 20);
    brush(ctx, sleeveEdge, 11, side > 0 ? P.rim : 'rgba(217,205,180,', side > 0 ? 0.95 : 0.6, rnd, 9);
    for (let k = 0; k < 4; k++) {
      const bx = sx + side * (10 + k * 9) + swing, by = 338 + k * 2;
      const tip = [bx + side * (6 + k * 3) + Math.sin(T + k) * 3, by + 44 + k * 4];
      brush(ctx, curve([bx, by], [bx + side * 2, by + 24], tip, 10), 3.2, 'rgba(217,205,180,', 0.85, rnd, 4);
    }
  });

  /* Hood with two bent horns. */
  ctx.beginPath();
  ctx.moveTo(256, 62);
  ctx.quadraticCurveTo(318, 70, 314, 150);
  ctx.quadraticCurveTo(290, 182, 256, 184);
  ctx.quadraticCurveTo(222, 182, 198, 150);
  ctx.quadraticCurveTo(194, 70, 256, 62);
  ctx.closePath();
  ctx.fillStyle = 'rgba(6,5,8,1)'; ctx.fill();
  [-1, 1].forEach(function (side) {
    const horn = curve([256 + side * 34, 84], [256 + side * 80, 52], [256 + side * 70 + Math.sin(T) * 2, 8], 16);
    brush(ctx, horn, 14, 'rgba(20,17,19,', 1, rnd, 12);
    brush(ctx, horn, 5, 'rgba(217,205,180,', 0.55, rnd, 4);
  });

  /* Vermilion eyes, flickering. */
  const flick = 0.75 + 0.25 * Math.sin(T * 3);
  [-1, 1].forEach(function (side) {
    const ex = 256 + side * 22, ey = 128;
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 26);
    g.addColorStop(0, P.rim + (0.55 * flick).toFixed(3) + ')'); g.addColorStop(1, P.rim + '0)');
    ctx.fillStyle = g; ctx.fillRect(ex - 26, ey - 26, 52, 52);
    ctx.beginPath();
    ctx.moveTo(ex - side * 13, ey - 5); ctx.quadraticCurveTo(ex, ey - 9, ex + side * 12, ey + 3);
    ctx.quadraticCurveTo(ex, ey + 4, ex - side * 13, ey - 5);
    ctx.fillStyle = P.eye; ctx.globalAlpha = flick; ctx.fill(); ctx.globalAlpha = 1;
  });

  /* Talisman (부적) on the chest in place of the old bell: gold paper, vermilion script. */
  ctx.save();
  ctx.translate(256 + Math.sin(T) * 3, 198);
  ctx.rotate(Math.sin(T + 0.6) * 0.08);
  ctx.fillStyle = 'rgba(217,180,90,0.95)';
  ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(17, 0); ctx.lineTo(19, 92); ctx.lineTo(4, 86); ctx.lineTo(-8, 95); ctx.lineTo(-18, 88); ctx.closePath(); ctx.fill();
  brush(ctx, [[0, 10], [2, 30], [-3, 50], [1, 74]], 5, 'rgba(180,24,18,', 0.95, rnd, 5);
  brush(ctx, [[-10, 22], [10, 26]], 4, 'rgba(180,24,18,', 0.9, rnd, 4);
  brush(ctx, [[-9, 44], [9, 40], [-6, 60]], 4, 'rgba(180,24,18,', 0.9, rnd, 4);
  ctx.restore();

  /* Silhouette: paper-white dry brush on the lit side, vermilion rim on the other, so it reads on dark ground. */
  const outline = curve([206, 150], [124, 160], [118, 240]).concat(curve([118, 240], [110, 330], [132, 400]).slice(1));
  brush(ctx, outline, 12, 'rgba(217,205,180,', 0.55, rnd, 9);
  const outlineR = curve([306, 150], [386, 160], [394, 240]).concat(curve([394, 240], [402, 330], [384, 400]).slice(1));
  brush(ctx, outlineR, 12, P.rim, 0.95, rnd, 9);
  brush(ctx, curve([204, 140], [194, 66], [256, 60], 14), 7, 'rgba(217,205,180,', 0.5, rnd, 6);
  brush(ctx, curve([256, 60], [320, 66], [312, 142], 14), 7, P.rim, 0.85, rnd, 6);

  ctx.restore();
}

/** Draws the boss sheet (frames in one row) on a canvas; returns the canvas and its sheet description. */
export function drawInkBossSheet(params) {
  const P = Object.assign({}, INK_BOSS, params || {});
  const c = document.createElement('canvas');
  c.width = P.cell * P.frames; c.height = P.cell;
  const ctx = c.getContext('2d');
  for (let f = 0; f < P.frames; f++) {
    ctx.save();
    ctx.translate(f * P.cell, 0);
    ctx.beginPath(); ctx.rect(0, 0, P.cell, P.cell); ctx.clip();
    drawFrame(ctx, f, P);
    ctx.restore();
  }
  const frames = [];
  for (let i = 0; i < P.frames; i++) frames.push(i);
  return {
    canvas: c,
    sheet: {
      frame: [P.cell, P.cell], count: P.frames, dirs: 1, layout: 'frames-x', anchor: P.anchor.slice(),
      states: { idle: frames }, fpsByState: { idle: P.fps }, fps: P.fps, loop: true
    },
    eyes: [[234, 128], [278, 128]]
  };
}
