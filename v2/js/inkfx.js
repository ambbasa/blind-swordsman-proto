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
  const ek = ease(k);
  const r = 8 + e.r1 * ek;
  const inv = 1 - k;
  ctx.globalCompositeOperation = 'lighter';
  /* 1) 핫 코어 플래시 + 다층 그라디언트 */
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 0.95);
  g.addColorStop(0, rgba([255, 252, 236], inv * 0.72));
  g.addColorStop(0.35, rgba(e.color, inv * 0.52));
  g.addColorStop(1, rgba(e.color, 0));
  ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  /* 2) 이중 충격파 링 (외곽 브러시 + 내부 날카로운 코어) */
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(e.color, inv * 0.92); ctx.lineWidth = (e.big ? 6 : 3.6) * inv + 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.72, 0, Math.PI * 2);
  ctx.strokeStyle = rgba([255, 248, 224], inv * 0.65); ctx.lineWidth = 1.6 * inv + 0.5; ctx.stroke();
  /* 3) 붓끝 테이퍼 파편 + 비산 먹방울 */
  for (let i = 0; i < e.n; i++) {
    const a = (i / e.n) * Math.PI * 2 + 0.3 + k * 0.12;
    const r0 = r * 0.38, r2 = r * (1.08 + 0.32 * (i % 3) * 0.5);
    const ca = Math.cos(a), sa = Math.sin(a) * 0.82;
    const nx = -sa * (2.6 * inv + 0.6), ny = ca * (2.6 * inv + 0.6);
    ctx.beginPath();
    ctx.moveTo(p.x + ca * r0 + nx, p.y + sa * r0 + ny);
    ctx.lineTo(p.x + ca * r2, p.y + sa * r2);
    ctx.lineTo(p.x + ca * r0 - nx, p.y + sa * r0 - ny);
    ctx.closePath();
    ctx.fillStyle = (i % 2 === 0) ? rgba([255, 250, 232], inv * 0.9) : rgba(e.color, inv * 0.85);
    ctx.fill();
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
  const rad = Math.max(0.2, e.R * ease(k));
  const inv = 1 - k;
  /* 1) 외곽 발광 붓 파동 */
  ctx.globalCompositeOperation = 'lighter';
  groundEllipse(ctx, project, hero.x, hero.z, rad);
  ctx.strokeStyle = rgba(e.color, inv * 0.42); ctx.lineWidth = 11 * inv + 2.5; ctx.stroke();
  /* 2) 중심 선명한 코어 파동 */
  groundEllipse(ctx, project, hero.x, hero.z, rad);
  ctx.strokeStyle = rgba([255, 250, 234], inv * 0.88); ctx.lineWidth = 3.2 * inv + 0.8; ctx.stroke();
  /* 3) 내부 먹 잔향 링 + 12개 회전 불티 입자 */
  if (rad > 0.5) {
    groundEllipse(ctx, project, hero.x, hero.z, rad * 0.84);
    ctx.strokeStyle = rgba(e.color, inv * 0.55); ctx.lineWidth = 1.8 * inv + 0.6; ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + k * 1.4;
    const sp = project(hero.x + Math.cos(a) * rad, hero.z + Math.sin(a) * rad, 0.14 + 0.28 * Math.sin(k * Math.PI));
    ctx.fillStyle = (i % 2 === 0) ? rgba([255, 250, 228], inv * 0.9) : rgba(e.color, inv * 0.8);
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 2.6 * inv + 0.8, 0, Math.PI * 2); ctx.fill();
  }
}

function drawEvo(ctx, e, k, view) {
  const w = view.width, h = view.height, cx = w / 2, cy = h * 0.40;
  const a = k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.72) / 0.28);
  const ek = ease(Math.min(1, k * 1.8));
  const R = Math.max(w, h) * (0.18 + 0.58 * ek);
  const g = ctx.createRadialGradient(cx, cy, R * 0.12, cx, cy, R);
  g.addColorStop(0, rgba(e.color, 0.34 * a)); g.addColorStop(0.55, rgba([8, 7, 9], 0.52 * a)); g.addColorStop(1, rgba([8, 7, 9], 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  /* 가로 먹 붓터치 배너 + 금박 상하 테두리 */
  const bw = w * (0.25 + 0.75 * ek), bh = 88;
  ctx.fillStyle = rgba([12, 10, 14], 0.76 * a);
  ctx.fillRect(cx - bw * 0.5, cy - bh * 0.5, bw, bh);
  ctx.fillStyle = rgba(e.color, 0.85 * a);
  ctx.fillRect(cx - bw * 0.46, cy - bh * 0.5, bw * 0.92, 2.5);
  ctx.fillRect(cx - bw * 0.46, cy + bh * 0.5 - 2.5, bw * 0.92, 2.5);
  /* 금박 비산 불티 */
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const px = cx + Math.sin(i * 2.17 + k * 2.5) * bw * 0.44;
    const py = cy + Math.cos(i * 3.11) * (bh * 0.45) - k * 22;
    ctx.fillStyle = rgba(i % 2 ? [255, 244, 200] : e.color, 0.75 * a);
    ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = '400 44px "InkBrush", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 7; ctx.strokeStyle = rgba([8, 7, 9], a * 0.95); ctx.strokeText(e.text, cx, cy + 8);
  ctx.fillStyle = rgba(e.color, a); ctx.fillText(e.text, cx, cy + 8);
  ctx.font = '600 16px "InkBrush", serif';
  ctx.fillStyle = rgba([255, 242, 204], a * 0.95); ctx.fillText('경지 진화', cx, cy - 26);
}
