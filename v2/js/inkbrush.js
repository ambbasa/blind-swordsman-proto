/* 붓 도구: 코드로 그리는 수묵 그림(보스, 캐릭터, 소품)이 함께 쓰는 마른 붓 획, 곡선, 먹 번짐. */

/** Seeded random in [0, 1), so every frame of a sheet draws the same brush hairs. */
export function rng(seed) {
  let s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Dry-brush stroke (飛白): thin hairs along a polyline, each drying out at its own point. `color` is an 'rgba(r,g,b,' prefix. */
export function brush(ctx, pts, width, color, alpha, rnd, hairs) {
  hairs = hairs || 14;
  for (let h = 0; h < hairs; h++) {
    const off = (hairs > 1 ? h / (hairs - 1) - 0.5 : 0) * width;
    const dry = 0.55 + rnd() * 0.45;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      if (t > dry) break;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const taper = Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05));
      const x = pts[i][0] - dy / L * off * taper + (rnd() - 0.5) * 1.2;
      const y = pts[i][1] + dx / L * off * taper + (rnd() - 0.5) * 1.2;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.strokeStyle = color + (alpha * (0.5 + rnd() * 0.5)).toFixed(3) + ')';
    ctx.lineWidth = 0.8 + rnd() * 1.8;
    ctx.stroke();
  }
}

/** Solid tapered ink stroke (a wet brush), widest in the middle. */
export function stroke(ctx, pts, width, color) {
  let total = 0;
  const seg = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  const step = Math.max(0.6, width * 0.18);
  const n = Math.max(2, Math.ceil(total / step));
  ctx.fillStyle = color;
  let si = 0, acc = 0;
  for (let k = 0; k <= n; k++) {
    const want = (k / n) * total;
    while (si < seg.length - 1 && acc + seg[si] < want) { acc += seg[si]; si++; }
    const u = seg.length ? Math.min(1, (want - acc) / (seg[si] || 1)) : 0;
    const a = pts[si], b = pts[Math.min(pts.length - 1, si + 1)];
    const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
    const r = Math.max(0.5, width * 0.5 * Math.sin(Math.PI * (0.12 + 0.76 * (k / n))));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

/** Quadratic curve sampled into n+1 points. */
export function curve(p0, p1, p2, n) {
  n = n || 12;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return out;
}

/** Fills a closed polygon; `fill` is a CSS colour or gradient. */
export function poly(ctx, pts, fill) {
  ctx.beginPath();
  pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Soft ink-wash blots clipped to the current path region (call after ctx.clip()). */
export function wash(ctx, x0, y0, w, h, n, color, rnd, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w, y = y0 + rnd() * h, r = rMin + rnd() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color + (0.15 + rnd() * 0.25).toFixed(3) + ')');
    g.addColorStop(1, color + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Draws `frames` cells side by side on one canvas; draw(ctx, frameIndex) paints one cell at the origin. */
export function sheetCanvas(cellW, cellH, frames, draw) {
  const c = document.createElement('canvas');
  c.width = cellW * frames; c.height = cellH;
  const ctx = c.getContext('2d');
  for (let f = 0; f < frames; f++) {
    ctx.save();
    ctx.translate(f * cellW, 0);
    ctx.beginPath(); ctx.rect(0, 0, cellW, cellH); ctx.clip();
    draw(ctx, f);
    ctx.restore();
  }
  return c;
}
