/* 수묵 순간 효과: 획득 터짐, HUD로 날아가는 엽전·혼백, 강화 인장, 경로 폭 미리보기, 심안 고리 파동, 진화 연출.
   화면 위 2D 층에 그려 블룸·수묵 후처리에 뭉개지지 않는다. 위치는 매 프레임 세계 좌표에서 다시 투영한다. */

/** Colours (r, g, b) the effects use; keys match items, elements and upgrades. */
export const FX_COLORS = {
  fire: [255, 96, 52], ice: [150, 228, 255], poison: [186, 96, 255], jade: [46, 230, 166],
  gold: [232, 192, 74], vermilion: [214, 48, 34], crimson: [214, 48, 34], paper: [240, 230, 206]
};

function rgba(c, a) {
  const col = (c && c.length >= 3) ? c : FX_COLORS.paper;
  return 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
}
function ease(k) { return 1 - (1 - k) * (1 - k); }

/** Holds short-lived effects and draws them each frame. `project(x, z, y)` returns screen {x, y}. */
export class InkFx {
  constructor() { this.list = []; }
  clear() { this.list = []; }
  /** Ring and sparks bursting out of a world point. */
  burst(x, z, color, opts) {
    opts = opts || {};
    this.list.push({ kind: 'burst', x: x, z: z, y: opts.y || 0.5, color: color, t: 0, dur: opts.dur || 0.5, r1: opts.r1 || 42, n: opts.n || 8, big: !!opts.big });
  }
  /** Dots flying from a world point to a screen point (a HUD label). */
  fly(x, z, to, color, n) {
    for (let i = 0; i < (n || 4); i++) {
      this.list.push({ kind: 'fly', x: x, z: z, y: 0.6, to: to, color: color, t: -i * 0.05, dur: 0.55, jx: (Math.random() - 0.5) * 30, jy: -10 - Math.random() * 20 });
    }
  }
  /** Seal stamp over the hero: two rings and the upgrade's name in brush letters rising. */
  seal(text, color) { this.list.push({ kind: 'seal', text: text, color: color, t: 0, dur: 1.2 }); }
  /** Band from the hero showing the cut's width along a world direction. */
  band(dir, width, len, color) { this.list.push({ kind: 'band', dir: dir, w: width, len: len, color: color, t: 0, dur: 1.0 }); }
  /** Ground ring around the hero growing out to world radius R. */
  ring(R, color, dur) { this.list.push({ kind: 'ring', R: R, color: color, t: 0, dur: dur || 0.9 }); }
  /** Full-screen evolution banner: an ink bloom and the skill name in large brush letters. */
  evo(text, color) { this.list.push({ kind: 'evo', text: text, color: color, t: 0, dur: 1.8 }); }

  draw(ctx, project, hero, view, dt) {
    const keep = [];
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      e.t += dt;
      if (e.t < 0) { keep.push(e); continue; }
      const k = Math.min(1, e.t / e.dur);
      ctx.save();
      if (e.kind === 'burst') drawBurst(ctx, e, k, project);
      else if (e.kind === 'fly') drawFly(ctx, e, k, project);
      else if (e.kind === 'seal') drawSeal(ctx, e, k, project, hero);
      else if (e.kind === 'band') drawBand(ctx, e, k, project, hero);
      else if (e.kind === 'ring') drawRing(ctx, e, k, project, hero);
      else if (e.kind === 'evo') drawEvo(ctx, e, k, view);
      ctx.restore();
      if (k < 1) keep.push(e);
    }
    this.list = keep;
  }
}

function drawBurst(ctx, e, k, project) {
  const p = project(e.x, e.z, e.y);
  const r = 6 + e.r1 * ease(k);
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(e.color, (1 - k) * 0.9); ctx.lineWidth = (e.big ? 5 : 3) * (1 - k) + 1; ctx.stroke();
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 0.8);
  g.addColorStop(0, rgba(e.color, (1 - k) * 0.5)); g.addColorStop(1, rgba(e.color, 0));
  ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  for (let i = 0; i < e.n; i++) {
    const a = (i / e.n) * Math.PI * 2 + 0.3, r0 = r * 0.5, r2 = r * (1.05 + 0.25 * (i % 2));
    ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0 * 0.8); ctx.lineTo(p.x + Math.cos(a) * r2, p.y + Math.sin(a) * r2 * 0.8);
    ctx.strokeStyle = rgba(e.color, (1 - k)); ctx.lineWidth = 2; ctx.stroke();
  }
}

function drawFly(ctx, e, k, project) {
  const p = project(e.x, e.z, e.y);
  const u = ease(k);
  const mx = (p.x + e.to.x) / 2 + e.jx, my = Math.min(p.y, e.to.y) + e.jy - 40;
  const x = (1 - u) * (1 - u) * p.x + 2 * (1 - u) * u * mx + u * u * e.to.x;
  const y = (1 - u) * (1 - u) * p.y + 2 * (1 - u) * u * my + u * u * e.to.y;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, 7);
  g.addColorStop(0, rgba([255, 250, 230], 0.95)); g.addColorStop(0.4, rgba(e.color, 0.8)); g.addColorStop(1, rgba(e.color, 0));
  ctx.fillStyle = g; ctx.fillRect(x - 7, y - 7, 14, 14);
}

function drawSeal(ctx, e, k, project, hero) {
  const p = project(hero.x, hero.z, 1.0);
  for (let i = 0; i < 2; i++) {
    const kk = Math.max(0, k - i * 0.12);
    const r = 14 + 70 * ease(kk);
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 10, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(e.color, (1 - kk) * 0.85); ctx.lineWidth = 4 * (1 - kk) + 1; ctx.stroke();
  }
  const a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
  ctx.font = '400 26px "InkBrush", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const y = p.y - 44 - 26 * ease(k);
  ctx.lineWidth = 5; ctx.strokeStyle = rgba([8, 7, 9], a * 0.85); ctx.strokeText(e.text, p.x, y);
  ctx.fillStyle = rgba(e.color, a); ctx.fillText(e.text, p.x, y);
}

function drawBand(ctx, e, k, project, hero) {
  const nx = -e.dir.z, nz = e.dir.x, hw = e.w;
  const pts = [[-hw, 0], [hw, 0], [hw, e.len], [-hw, e.len]].map(function (q) {
    return project(hero.x + nx * q[0] + e.dir.x * q[1], hero.z + nz * q[0] + e.dir.z * q[1], 0.05);
  });
  const a = Math.sin(Math.PI * k);
  ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath();
  ctx.fillStyle = rgba(e.color, a * 0.22); ctx.fill();
  ctx.setLineDash([8, 6]); ctx.strokeStyle = rgba(e.color, a * 0.9); ctx.lineWidth = 2; ctx.stroke();
}

function groundEllipse(ctx, project, cx, cz, R) {
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2, p = project(cx + Math.cos(a) * R, cz + Math.sin(a) * R, 0.05);
    if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
  }
}

function drawRing(ctx, e, k, project, hero) {
  groundEllipse(ctx, project, hero.x, hero.z, Math.max(0.2, e.R * ease(k)));
  ctx.strokeStyle = rgba(e.color, (1 - k) * 0.9); ctx.lineWidth = 6 * (1 - k) + 1.5; ctx.stroke();
}

function drawEvo(ctx, e, k, view) {
  const w = view.width, h = view.height, cx = w / 2, cy = h * 0.42;
  const a = k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.7) / 0.3);
  const R = Math.max(w, h) * (0.2 + 0.6 * ease(Math.min(1, k * 1.6)));
  const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
  g.addColorStop(0, rgba(e.color, 0.28 * a)); g.addColorStop(0.6, rgba([8, 7, 9], 0.45 * a)); g.addColorStop(1, rgba([8, 7, 9], 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.font = '400 48px "InkBrush", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 7; ctx.strokeStyle = rgba([8, 7, 9], a * 0.9); ctx.strokeText(e.text, cx, cy);
  ctx.fillStyle = rgba(e.color, a); ctx.fillText(e.text, cx, cy);
  ctx.font = '400 22px "InkBrush", serif';
  ctx.fillStyle = rgba([240, 230, 206], a * 0.9); ctx.fillText('진화', cx, cy - 46);
}
