import { createDashController } from './dashController.js?v=v177';
/* v2/js/modules/overlay2d.js — 심안: 묵검 v1.26 2D 오버레이·혼령 마크·지형 표시 렌더러 */

export function createOverlay2d(rt) {
  const $ = rt.$;
function loadMarkImages() {
  if (!rt.art) return;
  const dabUrl = rt.art.images && rt.art.images.inkDab && rt.art.images.inkDab.image ? null : (rt.art.images && rt.art.fx);
  if (rt.art.images && rt.art.images.inkDab && rt.art.images.inkDab.image) {
    rt.paintInk._dab = rt.art.images.inkDab.image;
  } else if (rt.art.atlas && rt.art.atlas.fx && rt.art.atlas.fx['ink-dab']) {
    const im = new Image();
    im.src = rt.art.BASE + rt.art.atlas.fx['ink-dab'].file;
    rt.paintInk._dab = im;
  }
}
function setOnebellInk(n) {
  const app = $('app'); if (!app) return;
  rt.onebell.ink = n;
  for (let i = 0; i < 4; i++) app.classList.toggle('onebell-ink-' + i, i === n);
}
function beginOnebell() {
  const app = $('app'); if (!app) return;
  rt.onebell.phase = 'hold'; rt.onebell.t = 0;
  app.classList.add('onebell', 'onebell-hold');
  setOnebellInk(0);
  setTimeout(function () { if (rt.onebell.phase !== 'off') setOnebellInk(1); }, rt.qa.noDelay ? 0 : 250);
  if (!rt.qa.noDelay) {
    const prev = rt.qa.timeScale || 1;
    rt.qa.timeScale = 0.001;
    setTimeout(function () { if (rt.qa.timeScale === 0.001) rt.qa.timeScale = prev; }, 80);
  }
}
function onebellSlash() {
  const app = $('app'); if (!app || rt.onebell.phase === 'off') return;
  rt.onebell.phase = 'slash';
  setOnebellInk(3);
  /* v0.74: 저화질 2D PNG(#onebellBurst/#onebellPaper) 제거 — 3D 충격파와 먹선 테두리만 깔끔하게 유지 */
  setTimeout(function () {
    if (rt.onebell.phase === 'slash') { setOnebellInk(1); rt.onebell.phase = 'hold'; }
  }, rt.qa.noDelay ? 0 : 400);
}
function endOnebell() {
  clearOnebell(false);
}
function clearOnebell(immediate) {
  const app = $('app'); if (!app) return;
  const go = function () {
    rt.onebell.phase = 'off';
    app.classList.remove('onebell', 'onebell-hold', 'onebell-paper', 'onebell-burst');
    for (let i = 0; i < 4; i++) app.classList.remove('onebell-ink-' + i);
  };
  if (immediate || rt.qa.noDelay) go();
  else setTimeout(go, 400);
}

const _proj = { v: null };
function markCssSize(w) {
  const min = rt.CFG.markMinCss || 12;
  const max = rt.CFG.markMaxCss || 32;
  return rt.clamp(Math.round(min * Math.sqrt((w || 375) / 375)), min, max);
}

/* 2D 오버레이의 방사형 그라디언트를 한 번만 구워 스프라이트로 재사용한다.
   예전에는 영혼 흐름·안개 물결·혼령 창이 프레임마다 createRadialGradient를 30~110번 새로 만들었다
   (매번 새 객체 → GC 압박 + 래스터라이즈 비용). 이제 drawImage 한 번으로 끝난다. */
const _glowSprites = {};
function glowSprite(key, stops, size) {
  if (_glowSprites[key]) return _glowSprites[key];
  const n = size || 64;
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  stops.forEach(function (s) { grd.addColorStop(s[0], s[1]); });
  g.fillStyle = grd;
  g.fillRect(0, 0, n, n);
  _glowSprites[key] = c;
  return c;
}
function drawGlow(ctx, img, x, y, rx, ry, alpha) {
  if (!(alpha > 0) || !(rx > 0) || !(ry > 0)) return;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * Math.min(1, alpha);
  ctx.drawImage(img, x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = a;
}

/* Soul stream: a soft jade wisp drawn from each spirit into the hero.
   v0.27: the spirit body stays the bright thing — the tether is a thin, dim ink wisp, not a beam. */
function drawSoulStreams(ctx, marks) {
  const t = (rt.S.elapsed || 0);
  const hs = rt.heroScreen();
  const ribbon = glowSprite('soul-ribbon', [[0, 'rgba(110,214,176,1)'], [1, 'rgba(110,214,176,0)']], 32);
  const mote = glowSprite('soul-mote', [[0, 'rgba(170,240,215,1)'], [0.5, 'rgba(88,190,160,0.636)'], [1, 'rgba(88,190,160,0)']], 32);
  (marks || rt.livingMarks()).forEach(function (sp, si) {
    if (!sp.target || !sp.target.alive || !sp.obj) return;
    const a0 = (rt.CFG.spiritStreamAlpha || 0.55) * rt.clamp((sp.age || 0) / (rt.CFG.spiritFadeIn || 0.4), 0, 1);
    const from = rt.screenOf(sp);
    const dx = hs.x - from.x, dy = hs.y - from.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const bend = Math.min(26, L * 0.12) * (si % 2 ? 1 : -1);
    const cx = (from.x + hs.x) / 2 + nx * bend, cy = (from.y + hs.y) / 2 + ny * bend;
    function at(u) {
      const v = 1 - u, w = Math.sin(u * Math.PI * 3 - t * 6 + si) * 5 * (1 - u);
      return { x: v * v * from.x + 2 * v * u * cx + u * u * hs.x + nx * w, y: v * v * from.y + 2 * v * u * cy + u * u * hs.y + ny * w };
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    /* Faint ribbon: a hair thin at the hero, never wider than a few pixels of glow. */
    for (let k = 0; k < 18; k++) {
      const u = k / 17, p = at(u), r = 5.0 * (1 - u) + 1.4;
      drawGlow(ctx, ribbon, p.x, p.y, r, r, a0 * 0.11);
    }
    /* A few dim motes drifting into the hero — no white core, no bright bead. */
    for (let k = 0; k < 4; k++) {
      const u = ((t * 0.42 + k / 4 + si * 0.13) % 1);
      const p = at(u), r = 3.4 * (1 - u * 0.7);
      const wa = a0 * Math.sin(Math.PI * u) * 0.5;
      drawGlow(ctx, mote, p.x, p.y, r * 2.4, r * 2.4, wa * 0.55);
    }
    ctx.restore();
  });
}
/* 혼령 구슬의 화면 중심과 반지름(px). 구슬은 256px 셀에서 반지름 58px로 그려진다. */
function spiritOrbScreen(s) {
  const ud = (s && s.obj && s.obj.userData) || {};
  const H = ud.bodyH || ud.worldH || 1.5;
  const c = rt.bellScreen(s);
  const yc = rt.bellWorld(s).y;
  const offx = (ud.bellLocal && ud.bellLocal.x) || 0;
  const rw = H * (58 / 256);
  const up = rt.projectXZ((s && s.x) || 0, (s && s.z) || 0, yc + rw);
  const dn = rt.projectXZ((s && s.x) || 0, (s && s.z) || 0, yc - rw);
  return { x: c.x, y: c.y, r: Math.max(5, Math.max(Math.abs(c.y - up.y), Math.abs(dn.y - c.y))), x0: offx };
}
/* 드로잉 프리뷰: 인식 중인 기호의 잉크 색 — v0.39 팔레트 토큰에서만 꺼낸다(2D 캔버스는 hex 문자열). */
const INK_OF = {
  hline: rt.palHex('jade'), vline: rt.palHex('rust'), vee: rt.palHex('violet'), bolt: rt.palHex('goldHot'), circle: rt.palHex('goldHot'),
  tap: rt.palHex('paper'), tri: rt.palHex('violetPale'), arc: rt.palHex('violetPale'), spiral: rt.palHex('violetPale')
};
function inkColorFor(type) { return INK_OF[type] || rt.palHex('jadeInk'); }
// Use the same stroke paths as the marks engraved on the spirit bells.
function brushMark(ctx,shape,x,y,size) {
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(size,size);
  ctx.strokeStyle=ctx.fillStyle;
  ctx.lineJoin='round';ctx.lineCap='round';
  for(const path of rt.SPIRIT_GLYPH_PATHS[shape] || []) {
    for(let i=1;i<path.length;i++){
      ctx.lineWidth=(shape==='spiral' ? .14 : .25)*(.65+.45*Math.sin(Math.PI*i/(path.length+.5)));
      ctx.beginPath();ctx.moveTo(...path[i-1]);ctx.lineTo(...path[i]);ctx.stroke();
    }
  }
  ctx.restore();
}
function updateMarks() {
  const c = $('marks');
  if (!c) return;
  const r = rt.viewBox();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.floor(r.width * dpr) || c.height !== Math.floor(r.height * dpr)) {
    c.width = Math.max(1, Math.floor(r.width * dpr));
    c.height = Math.max(1, Math.floor(r.height * dpr));
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  const size = markCssSize(r.width);
  rt.lastMarkMetrics = { cssPx: size, minCss: rt.CFG.markMinCss || 12, w: r.width, h: r.height, marks: [] };
  if (!rt.S || !rt.three) return;
  if (!_proj.v) _proj.v = new rt.THREE.Vector3();
  if (rt.S.playing && rt.S.hero) {
    if (!(rt.S.ringR > 0)) rt.applyRingBoost();
    else rt.refreshRingPoly();
  }
  const hs = (rt.S.playing && rt.S.hero) ? rt.heroScreen() : { x: r.width * 0.5, y: r.height * 0.55 };
  const ringPx = (rt.S.playing && rt.S.hero) ? ((rt.S.ringPx > 0) ? rt.S.ringPx : rt.screenRingPx()) : 0;
  if (rt.S.playing && rt.S.hero && ringPx > 0) {
    if (!(rt.S.ringR > 0) || !rt.S.ringPoly) rt.applyRingBoost();
    const pts = rt.ringScreenPts();
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    if (pts.length) {
      pts.forEach(function (p) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      });
    }
    const diam = (maxX > minX) ? (maxX - minX) : ringPx * 2;
    rt.lastMarkMetrics.ring = {
      r: rt.ringR(), px: diam / 2, rx: diam / 2, ry: (maxY > minY) ? (maxY - minY) / 2 : 0,
      cx: hs.x, cy: hs.y, diamPx: diam, frac: r.width ? diam / r.width : 0,
      ringLv: rt.S.ringLv || 0, pts: pts, kind: 'ellipse'
    };
  }
  drawSoulStreams(ctx, rt.livingMarks());
  const placed = [];
  const arrows = [];
  const aimId = rt.S.aimTarget && rt.S.aimTarget.alive ? rt.S.aimTarget.id : null;
  /* The boss's shape order rides on its spirit's bell; the boss itself carries no mark. */
  const marks = rt.livingMarks();
  const bossSpirit = (rt.S.boss && rt.S.boss.alive && rt.S.boss.state !== 'clones') ? marks.filter(function (s) { return s.target === rt.S.boss; })[0] : null;
  marks.forEach(function (s) {
    if (!s.obj || !s.obj.visible) return;
    const bp = rt.bellScreen(s);
    const ox = bp.x, oy = bp.y;
    const bh = (s.obj.userData && s.obj.userData.bellH) || 0.4;
    const bodyH = (s.obj.userData && s.obj.userData.bodyH) || 1.5;
    const bellTop = rt.projectXZ(s.x, s.z, ((s.obj.userData.bellLocal || {}).y || bh) + bh * 0.5);
    const bellBot = rt.projectXZ(s.x, s.z, ((s.obj.userData.bellLocal || {}).y || bh) - bh * 0.5);
    const bellPx = Math.max(16, Math.hypot(bellTop.x - bellBot.x, bellTop.y - bellBot.y));
    const bodyTop = rt.projectXZ(s.x, s.z, bodyH);
    const bodyBot = rt.projectXZ(s.x, s.z, 0);
    const bodyPx = Math.max(16, Math.hypot(bodyTop.x - bodyBot.x, bodyTop.y - bodyBot.y));
    const orb = spiritOrbScreen(s);
    /* 혼령 기호는 구슬 지름의 0.82배 — 구슬 안에 쏙 들어가는 크기. 보스는 눈 위 기호라 조금 크게. */
    const glyphPx = s.isBoss
      ? rt.clamp(Math.round(bellPx * 1.25), 20, 40)
      : rt.clamp(Math.round(orb.r * 2 * 0.82), rt.CFG.markMinCss || 12, rt.CFG.markMaxCss || 30);
    const on = !(ox < -20 || oy < -20 || ox > r.width + 20 || oy > r.height + 20);
    const item = {
      x: orb.x, y: orb.y, ox: ox, oy: oy, cssPx: glyphPx, orbR: orb.r, onScreen: on,
      shape: rt.spiritShape(s), boss: !!(s.isBoss || (s.target && s.target.isBoss)), id: s.id, aim: s.id === aimId,
      seq: s === bossSpirit ? (rt.S.boss.seq || []).slice() : null, seqI: s === bossSpirit ? (rt.S.boss.seqI || 0) : 0,
      bellPx: bellPx, bodyPx: bodyPx
    };
    rt.lastMarkMetrics.marks.push(item);
    if (on) placed.push(item);
    if (s.target && s.target.alive && !rt.isOnScreen(s.target, 20)) {
      const tp = rt.projectXZ(s.target.x, s.target.z, 0.8);
      const m = 18;
      arrows.push({
        x: rt.clamp(tp.x, m, r.width - m), y: rt.clamp(tp.y, m, r.height - m),
        ox: tp.x, oy: tp.y, id: s.target.id, shape: item.shape
      });
    } else if (s.target && s.target.alive && rt.relicOn(rt.save, 'oldbell') && rt.dist(s.target, rt.S.hero) > rt.ringR() * 1.15) {
      /* §9.4 묵은 방울: 원 밖 혼령의 방향 화살표가 방울 주기(0.9초) 중 마지막 0.5초 — 0.5초 일찍 미리 보인다. */
      if (((rt.S.elapsed || 0) % 0.9) > 0.4) {
        const tp = rt.projectXZ(s.target.x, s.target.z, 0.8);
        const m = 18;
        arrows.push({
          x: rt.clamp(tp.x, m, r.width - m), y: rt.clamp(tp.y, m, r.height - m),
          ox: tp.x, oy: tp.y, id: s.target.id, shape: item.shape, lead: true
        });
      }
    }
  });
  rt.lastMarkMetrics.arrows = arrows;
  rt.lastMarkMetrics.markStyle = 'ink';
  if (placed.length) {
    rt.lastMarkMetrics.cssPx = placed.reduce(function (m, p) { return Math.max(m, p.cssPx || 0); }, 0) || size;
    rt.lastMarkMetrics.bellPx = placed.reduce(function (m, p) { return Math.max(m, p.bellPx || 0); }, 0);
    rt.lastMarkMetrics.bodyPx = placed.reduce(function (m, p) { return Math.max(m, p.bodyPx || 0); }, 0);
  }
  /* v0.52: 보스전이 HP 대결 체계로 전환됨에 따라 머리 위 구식 '무늬 순서 배열' 칩은 숨겨
     플레이어가 "HP를 깎는가 vs 무늬 순서를 지우는가" 혼동하지 않도록 정리한다(현재 약점 혼령은 3D로 선명히 표시). */
  arrows.forEach(function (a) {
    const dx = a.ox - a.x, dy = a.oy - a.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = 'rgba(232,192,74,0.92)';
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, 6); ctx.lineTo(-7, -6); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
  if (aimId && rt.S.hero && rt.three && rt.three.camera) {
    const tgt = marks.filter(function (s) { return s.id === aimId; })[0];
    if (tgt) {
      _proj.v.set(rt.S.hero.x, 0.4, rt.S.hero.z).project(rt.three.camera);
      const hx = (_proj.v.x * 0.5 + 0.5) * r.width;
      const hy = (-_proj.v.y * 0.5 + 0.5) * r.height;
      const tscr = rt.screenOf(tgt);
      ctx.save();
      ctx.strokeStyle = 'rgba(232,192,74,0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tscr.x, tscr.y); ctx.stroke();
      ctx.restore();
    }
  }
  drawOverlays(ctx, r, hs);
}
/* 프리뷰·락온·보스 예고선·참(斬)·패링 연출을 한 겹에 그린다. */
function drawOverlays(ctx, r, hs) {
  if (!rt.S) return;
  const t = rt.S.elapsed || 0;
  /* §3.1 금빛 화면 가장자리 번쩍임: 받아치기·역류·파훼 — 화면을 가리지 않게 가장자리만. */
  if (rt.S.goldEdge > 0) {
    const k = rt.clamp(rt.S.goldEdge / 0.2, 0, 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,110,' + (0.22 * k).toFixed(3) + ')';
    ctx.lineWidth = 22 + 12 * k;
    ctx.strokeRect(2, 2, r.width - 4, r.height - 4);
    ctx.strokeStyle = 'rgba(255,226,138,' + (0.62 * k).toFixed(3) + ')';
    ctx.lineWidth = 6 + 6 * k;
    ctx.strokeRect(2, 2, r.width - 4, r.height - 4);
    ctx.restore();
  }
  const pv = rt.S.preview;
  /* 1) v1.58 확정 예고선: 테이퍼 엠버 궤도 리본 + 착지 지점 3D 시길 마커 */
  if (pv && pv.show && pv.to && rt.S.hero) {
    const a = rt.projectXZ(rt.S.hero.x, rt.S.hero.z, 0.24);
    const b = rt.projectXZ(pv.to.x, pv.to.z, 0.08);
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist, ny = dx / dist;
    ctx.save();
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, 'rgba(78,234,208,0.08)');
    grad.addColorStop(0.65, 'rgba(78,234,208,0.42)');
    grad.addColorStop(1, 'rgba(232,255,248,0.78)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * 1.4, a.y + ny * 1.4);
    ctx.lineTo(b.x + nx * 3.8, b.y + ny * 3.8);
    ctx.lineTo(b.x - nx * 3.8, b.y - ny * 3.8);
    ctx.lineTo(a.x - nx * 1.4, a.y - ny * 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(236,255,248,0.68)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    /* 착지점 3D 투영 시길 링 + 다이아몬드 코어 */
    const pulse = 1 + 0.08 * Math.sin(t * 7);
    ctx.strokeStyle = 'rgba(78,234,208,0.78)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, 15 * pulse, 8.6 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(238,255,248,0.88)';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y - 4.2); ctx.lineTo(b.x + 4.2, b.y);
    ctx.lineTo(b.x, b.y + 4.2); ctx.lineTo(b.x - 4.2, b.y);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  /* 2) v1.58 락온 3D 원근 시길 링 + 부드러운 페이드 조준 쐐기 (바닥 장판 가독성 보존) */
  const tgt = (rt.S.aimTarget && rt.S.aimTarget.alive) ? rt.S.aimTarget : null;
  if (tgt && rt.S.hero) {
    const tp = rt.projectXZ(tgt.x, tgt.z, 0.08);
    const rot = (t % 6) * 0.45;
    ctx.save();
    const dirA = Math.atan2(tp.y - hs.y, tp.x - hs.x);
    const len = Math.max(24, Math.hypot(tp.x - hs.x, tp.y - hs.y));
    const coneG = ctx.createRadialGradient(hs.x, hs.y, 8, hs.x, hs.y, len);
    coneG.addColorStop(0, 'rgba(78,234,208,0.12)');
    coneG.addColorStop(0.65, 'rgba(78,234,208,0.04)');
    coneG.addColorStop(1, 'rgba(78,234,208,0)');
    ctx.beginPath(); ctx.moveTo(hs.x, hs.y);
    ctx.arc(hs.x, hs.y, len, dirA - 0.58, dirA + 0.58);
    ctx.closePath();
    ctx.fillStyle = coneG;
    ctx.fill();
    const rx = 20 + Math.sin(t * 4.5) * 1.8, ry = rx * 0.58;
    ctx.strokeStyle = 'rgba(78,234,208,0.82)';
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(tp.x, tp.y, rx, ry, 0, rot + i * 2.094, rot + i * 2.094 + 1.2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(245,206,104,0.88)';
    for (let i = 0; i < 4; i++) {
      const a4 = rot * 0.5 + i * Math.PI * 0.5;
      const px = tp.x + Math.cos(a4) * (rx + 3.5), py = tp.y + Math.sin(a4) * (ry + 2.2);
      ctx.beginPath();
      ctx.moveTo(px, py - 2.6); ctx.lineTo(px + 2.6, py);
      ctx.lineTo(px, py + 2.6); ctx.lineTo(px - 2.6, py);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  /* 3) v1.58 손가락 위 옻칠·금박 메달리온 상태 칩 */
  const chip = pv && pv.chip;
  if (chip) {
    const x = chip.x, y = chip.y - 28;
    const col = chip.type ? inkColorFor(chip.type) : 'rgba(186,196,200,0.9)';
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,16,20,0.86)'; ctx.fill();
    ctx.strokeStyle = 'rgba(217,185,126,0.55)'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 23, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rt.clamp(chip.conf || 0, 0, 1));
    ctx.strokeStyle = (chip.conf || 0) >= 0.38 ? col : 'rgba(130,145,150,0.65)';
    ctx.lineWidth = 2.6; ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = '700 17px "InkSerif", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(chip.type ? (rt.G.LABELS[chip.type] || '') : '?', x, y + 1);
    if (chip.hint) {
      ctx.font = '700 11px "InkSerif", "Gowun Batang", serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,12,15,0.88)';
      ctx.strokeText(chip.hint, x, y + 34);
      ctx.fillStyle = 'rgba(244,236,214,0.95)';
      ctx.fillText(chip.hint, x, y + 34);
    }
    ctx.restore();
  }
  /* 4) 보스 돌진 예고선: v0.50 수묵·주홍 테이퍼 레인 + 전진 화살 펄스 */
  const b = rt.S.boss;
  if (b && b.alive && b.state === 'telegraph' && b.aim) {
    const bt = rt.bossTiming();
    const tf = rt.clamp((b.stateT || 0) / bt.teleT, 0, 1);
    rt.bossFx.drawChargeTele(ctx, rt.projectXZ, b.x, b.z, b.aim.x, b.aim.z, tf, t);
  }
  rt.bossFx.drawHazards(ctx, rt.projectXZ, rt.S.hazards, t);
  rt.bossFx.drawShots(ctx, rt.projectXZ, rt.S.shots, t, rt.S.hero);
  rt.drawBossPat(ctx, r, hs);
  /* 5) 정예 원귀 바닥 경고 링 */
  rt.S.zombies.forEach(function (z) {
    if (!z.alive || !z.elite) return;
    const p = rt.projectXZ(z.x, z.z, 0.05);
    const rr = (z.r || 0.85) * rt.worldPerCss() * (1.35 + 0.12 * Math.sin(t * 5));
    ctx.save();
    ctx.strokeStyle = 'rgba(232,192,74,0.55)';
    ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(10, rr), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });
  /* 6) v1.58 참 — 영웅 월드 좌표 3D 투영 이중 검기 타원 + 대각선 참격선 + 절제된 캘리그래피 인장 */
  if (rt.S.cleaveFx > 0) {
    const k = rt.clamp(rt.S.cleaveFx / 0.6, 0, 1);
    const prog = 1 - k;
    const ep = rt.S.hero ? rt.projectXZ(rt.S.hero.x, rt.S.hero.z, 0.08) : { x: r.width * 0.5, y: r.height * 0.48 };
    ctx.save();
    const rx = (28 + prog * Math.min(r.width, r.height) * 0.56);
    const ry = rx * 0.56;
    ctx.strokeStyle = 'rgba(78,234,208,' + (0.52 * k).toFixed(3) + ')';
    ctx.lineWidth = 6 * k + 1.4;
    ctx.beginPath(); ctx.ellipse(ep.x, ep.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(245,206,104,' + (0.48 * k).toFixed(3) + ')';
    ctx.lineWidth = 2.0 * k + 0.6;
    ctx.beginPath(); ctx.ellipse(ep.x, ep.y, rx * 0.74, ry * 0.74, 0, 0, Math.PI * 2); ctx.stroke();
    /* 대각선 비취-백옥 참격 궤적 */
    const slashLen = Math.min(r.width, r.height) * (0.28 + 0.24 * prog);
    ctx.strokeStyle = 'rgba(232,255,248,' + (0.65 * k).toFixed(3) + ')';
    ctx.lineWidth = 3.5 * k + 0.5;
    ctx.beginPath();
    ctx.moveTo(ep.x - slashLen * 0.85, ep.y + slashLen * 0.32);
    ctx.lineTo(ep.x + slashLen * 0.85, ep.y - slashLen * 0.32);
    ctx.stroke();
    /* 인장은 초반 0.42초만 선명히 떠올라 시야를 가리지 않는다 */
    const textA = rt.clamp((k - 0.25) / 0.75, 0, 1);
    if (textA > 0.02) {
      const ty = ep.y - 44 - prog * 18;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '400 ' + Math.round(Math.min(r.width, r.height) * 0.19) + 'px "InkBrush", "InkSerif", serif';
      ctx.strokeStyle = 'rgba(10,16,20,' + (0.72 * textA).toFixed(3) + ')';
      ctx.lineWidth = 7;
      ctx.strokeText('참', ep.x, ty);
      ctx.fillStyle = 'rgba(244,238,220,' + (0.86 * textA).toFixed(3) + ')';
      ctx.fillText('참', ep.x, ty);
      ctx.strokeStyle = 'rgba(78,234,208,' + (0.75 * textA).toFixed(3) + ')';
      ctx.lineWidth = 1.4;
      ctx.strokeText('참', ep.x, ty);
    }
    ctx.restore();
  }
  /* 8) 지금 일섬에 실린 원소: 주인공 발밑 오라, 바닥 부적은 남은 시간 고리 */
  drawHeroElement(ctx, t);
  /* 9) 체력이 깎인 원귀의 체력 막대 (심안 안이거나 혼령이 붙은 적만) */
  drawEnemyBars(ctx);
  /* v0.31: 파훼 표시·정예 봉인 순서·호신부·벼락 예고·먹 발자국 */
  drawV31(ctx, r, hs, t);
  /* v0.32 §6.1: 지형 마커·달빛·종의 드러냄 */
  drawTerrain(ctx, r, hs, t);
  /* v0.34 §6.2: 부목표 표시(석등·어둠) */
  drawGoal(ctx, r, hs, t);
  /* 7) v1.58 칼집 패링: 흰 원판 제거 -> 청옥-금박 초승달 방어 호 + 4각 스타 글린트 */
  if (rt.S.parryFlash > 0) {
    const k = rt.clamp(rt.S.parryFlash / 0.12, 0, 1);
    const prog = 1 - k;
    const rx = 28 + prog * 54, ry = rx * 0.58;
    ctx.save();
    ctx.strokeStyle = 'rgba(78,234,208,' + (0.78 * k).toFixed(3) + ')';
    ctx.lineWidth = 4.2 * k + 1.0;
    ctx.beginPath(); ctx.ellipse(hs.x, hs.y + 4, rx, ry, 0, -Math.PI * 0.82, Math.PI * 0.18); ctx.stroke();
    ctx.strokeStyle = 'rgba(245,206,104,' + (0.72 * k).toFixed(3) + ')';
    ctx.lineWidth = 2.0 * k + 0.6;
    ctx.beginPath(); ctx.ellipse(hs.x, hs.y + 4, rx * 0.78, ry * 0.78, 0, 0, Math.PI * 2); ctx.stroke();
    const gl = 26 + prog * 18;
    ctx.fillStyle = 'rgba(246,255,248,' + (0.85 * k).toFixed(3) + ')';
    ctx.beginPath();
    for (let gi = 0; gi < 8; gi++) {
      const ga = (gi * Math.PI) / 4;
      const gr = (gi % 2 === 0) ? gl : gl * 0.16;
      if (gi === 0) ctx.moveTo(hs.x + Math.cos(ga) * gr, hs.y - 6 + Math.sin(ga) * gr);
      else ctx.lineTo(hs.x + Math.cos(ga) * gr, hs.y - 6 + Math.sin(ga) * gr);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  rt.inkFx.draw(ctx, rt.projectXZ, rt.S.hero, r, rt.frameDt);
  rt.bossFx.draw(ctx, rt.projectXZ, rt.frameDt);
  drawFloaters(ctx, rt.frameDt);
  if (rt.three && rt.three.vfx3d) rt.three.vfx3d.drawImpactFrame(ctx, r.width, r.height, rt.frameDt);
  /* §8.1·§8.2: 유도 획·참(O) 안내·기물 연습·첫 칼 튕김 화살표·제자리 탭 링 */
  rt.drawTutorial(ctx, r, hs);
  /* §11 색약: 붉은 장판은 색 대신 '바깥으로 뻗은 막대'로도 읽힌다. */
  if (rt.a11yCb() && rt.S.hazards && rt.S.hazards.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,150,70,0.85)'; ctx.lineWidth = 2.5;
    rt.S.hazards.forEach(function (h) {
      if (h.done) return;
      const c = rt.projectXZ(h.x, h.z, 0.05), rx = h.r * rt.worldPerCss(), ry = rx * 0.55;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + (t || 0) * 0.4;
        const x1 = c.x + Math.cos(a) * rx * 0.55, y1 = c.y + Math.sin(a) * ry * 0.55;
        const x2 = c.x + Math.cos(a) * rx, y2 = c.y + Math.sin(a) * ry;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    });
    ctx.restore();
  }
}
/* ---------- v0.32 §6.1 지형 표시 ----------
   지형은 3D 소품과 무관하게 판정되므로, 판단에 필요한 것만 얇은 먹선으로 그린다.
   한 화면에 너무 많이 그리지 않도록 영웅 주변(원 ×1.5)만, 종류별로 최대 몇 개만. */
function drawGoal(ctx, r, hs, t) {
  const g = rt.S && rt.S.goal;
  if (!g) return;
  if (g.id === 'guard' && g.pos) {
    const p = rt.projectXZ(g.pos.x, g.pos.z, 0.1);
    const ok = g.ok, fail = g.fail;
    ctx.save();
    ctx.strokeStyle = fail ? 'rgba(120,110,100,0.5)' : ok ? 'rgba(46,230,166,0.8)' : 'rgba(232,192,74,' + (0.55 + 0.35 * Math.sin(t * 4)).toFixed(3) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 26, 14, 0, 0, Math.PI * 2); ctx.stroke();
    const top = rt.projectXZ(g.pos.x, g.pos.z, 1.5);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    ctx.font = '700 16px "InkSerif", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = fail ? 'rgba(160,150,140,0.7)' : 'rgba(255,236,190,0.95)';
    ctx.fillText('석등', top.x, top.y - 8);
    ctx.font = '700 12px "InkSerif", serif';
    ctx.fillText(g.hp + '/' + g.hpMax, top.x, top.y + 12);
    ctx.restore();
  } else if (g.id === 'dark' && rt.goalWindowOn()) {
    ctx.save();
    /* v0.71.2: 뼈의 강 어둠 구간 — 중앙 심안 원 안쪽은 선명하게 유지하고 바깥 둘레만 은은하게 어둡힌다. */
    const hc = (rt.S && rt.S.hero) ? rt.screenOf(rt.S.hero) : { x: r.width * 0.5, y: r.height * 0.52 };
    const innerR = Math.min(r.width, r.height) * 0.24;
    const outerR = Math.max(r.width, r.height) * 0.68;
    const vg = ctx.createRadialGradient(hc.x, hc.y, innerR, hc.x, hc.y, outerR);
    vg.addColorStop(0, 'rgba(4,4,10,0)');
    vg.addColorStop(0.55, 'rgba(4,4,10,0.08)');
    vg.addColorStop(1, 'rgba(4,4,10,0.26)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.font = '700 13px "InkSerif", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(210,200,240,0.8)';
    ctx.fillText('어둠 — 원이 좁아졌습니다 · 방울이 크게 울립니다 ' + Math.max(0, Math.ceil(g.win - g.t)) + '초', r.width * 0.5, 108);
    ctx.restore();
  }
}
const PATCH_SPECS = {rubble:[5,11,.42,.9,1.9],bamboo:[6.5,37,.55,2,3.4],bell:[10,83,.4,.5,.5],blood:[8,97,.55,2.4,3.2]};
function syncGroundEffects() {
  const layer = rt.three.groundEffects || (rt.three.groundEffects = rt.makeGroundLayer(rt.three.scene));
  layer.begin();
  if (!rt.S?.hero || !rt.S.playing) { layer.end(); return; }
  const hx=rt.S.hero.x, hz=rt.S.hero.z, R=Math.min(16,Math.max(6,rt.ringR()*1.5));
  const T=rt.S.terrain, kind=T?.kind;

  if (PATCH_SPECS[kind]) {
    // Cell centres do not move. Re-query only after movement or a sight change.
    const cached = layer.patches;
    if (!cached || cached.kind !== kind || cached.radius !== R || Math.hypot(hx-cached.x,hz-cached.z) > .5) {
      layer.patches = {kind, radius:R, x:hx, z:hz, list:rt.tPatchesNear(hx,hz,R+.5,...PATCH_SPECS[kind])};
    }
    if ((kind === 'blood' || kind === 'bell') && rt.three && rt.three.terrain3d && typeof rt.three.terrain3d.syncPatches === 'function') {
      rt.three.terrain3d.syncPatches(layer.patches.list, kind === 'blood' ? T.stones : T.bells, rt.S.elapsed);
    }
     for (const p of layer.patches.list) {
      if ((kind === 'bamboo' || kind === 'rubble' || kind === 'blood' || kind === 'bell') && rt.three && rt.three.terrain3d) {
        /* v0.65: 2장 잔해·3장 대숲·8장 종루·9/13장 혈석의 평면 2D 바닥 스티커를 제거하고 3D 입체 기물로 통일 */
      } else {
        const cell=kind==='rubble'?0:kind==='bell'?2:T.stones[p.key]>rt.S.elapsed?4:3;
        layer.put('terrain',cell,p.x,p.z,p.r*2,p.r*2);
      }
    }
  } else if(kind==='root'||kind==='snow') {
    for(let cx=Math.floor((hx-R)/7);cx<=Math.floor((hx+R)/7);cx++) {
      for(let cz=Math.floor((hz-R)/7);cz<=Math.floor((hz+R)/7);cz++) {
        if(rt.tHash(cx,cz,71)>=.55)continue;
        const x=cx*7+3.5+(rt.tHash(cx,cz,72)-.5)*3.5,z=cz*7+3.5+(rt.tHash(cx,cz,73)-.5)*3.5;
        const a=rt.tHash(cx,cz,74)*Math.PI,len=2.2+rt.tHash(cx,cz,75)*1.6;
        layer.put('terrain',kind==='root'?1:6,x+Math.cos(a)*len/2,z+Math.sin(a)*len/2,len,kind==='root'?1.1:2,a);
      }
    }
  } else if(kind==='water' && !(rt.three && rt.three.river)) {
    for(let i=Math.floor((hx-R)/3);i<=Math.ceil((hx+R)/3);i++) {
      const x=i*3,z=rt.tWaterCenter(x),width=2*(2.1+.7*Math.sin(x*.13+.6));
      layer.put('terrain',5,x,z,3.5,width);
    }
  }
  for(const hazard of rt.S.hazards || []) if(hazard.arrowVolley && hazard.done)
    layer.put('terrain',7,hazard.x,hazard.z,hazard.r*2,hazard.r*2);
  const bossTeleDim = (rt.S.boss && rt.S.boss.alive && ['telegraph','slamTele','sweepTele','volleyTele','kiai','donut','soak','rhythm','tether','gaze','pizza'].indexOf(rt.S.boss.state) >= 0) ? 0.35 : 1.0;
  for(const p of rt.S.inkSteps || []) {
    const age=1-rt.clamp(p.t/(rt.CFG.inkStep.dur||2),0,1);
    layer.put('phases',8+Math.min(3,Math.floor(age*4)),p.x,p.z,p.r*2,p.r*2);
  }
  /* v1.38 구형 주황 회오리/연보라 구름 스프라이트 제거 -> drawV31에서 절제된 방사형 수묵/불씨 장판으로 렌더 */
  layer.end();
}
function drawTerrain(ctx,r,hs,t) {
  if(!rt.S?.terrain)return;
  const T=rt.S.terrain,C=rt.TERRAIN_CFG;
  ctx.save();
  if(T.kind==='moon'){
    if (T.moon) {
      ctx.fillStyle = 'rgba(150,24,22,' + (0.10 + 0.03 * Math.sin((rt.S.elapsed || 0) * 3)).toFixed(3) + ')';
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.font = '700 13px "InkSerif", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,140,120,0.85)';
      rt.paintFrame(ctx,'terrain',8,r.width*.5,83,24,24);
      ctx.fillText('붉은 달 — 원귀가 빠르다 · 엽전 두 배 ' + Math.ceil(T.moonT) + '초', r.width * 0.5, 84);
    }
  } else if (T.kind === 'wall') {
    const left = Math.max(0, C.wall.every - (T.wallT || 0));
    ctx.font = '700 12px "InkSerif", serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = left < 3 ? 'rgba(255,120,90,0.9)' : 'rgba(220,200,160,0.5)';
    ctx.fillText('성벽 포대 ' + Math.ceil(left) + '초', r.width - 14, 86);
  }
  /* 8장 종루: 2초만 원 밖을 드러낸다(§17 결정 8 — 짧은 순간만) */
  if (T.revealT > 0) {
    const k = rt.clamp(T.revealT / C.bell.reveal, 0, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    (rt.S.zombies || []).forEach(function (z) {
      if (!z.alive || z.isBoss || z.isClone || rt.dist(z, rt.S.hero) <= rt.ringR()) return;
      const p = rt.projectXZ(z.x, z.z, 1.0);
      if (p.x < -20 || p.y < -20 || p.x > r.width + 20 || p.y > r.height + 20) return;
      ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(232,192,74,' + (0.85 * k).toFixed(3) + ')'; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.font = '700 16px "InkSerif", serif';
      ctx.fillStyle = 'rgba(255,236,190,' + (0.95 * k).toFixed(3) + ')'; ctx.fillText(rt.SHAPE_MARK[rt.spiritShape(z)] || '?', p.x, p.y + 1);
    });
  }
  ctx.restore();
}
function drawV31(ctx, r, hs, t) {
  if (!rt.S) return;
  if (rt.S.boss?.alive && !rt.S.boss.hidden && rt.S.boss.state !== 'clones') {
    const boss = rt.S.boss;
    const maxHp = Math.max(1, boss.maxHp || 1);
    const curHp = Math.max(0, boss.hp || 0);
    if (boss.hpTrail == null || boss.hpTrail < curHp) boss.hpTrail = curHp;
    else boss.hpTrail = Math.max(curHp, boss.hpTrail - maxHp * 0.38 * rt.frameDt);

    /* v0.58 + v0.59.1 화면 상단 고정 보스 바 — 상단 HUD(y=0..58) 아래 y=64..120 구간에 깔끔히 배치 */
    const w = Math.min(312, Math.max(210, r.width - 56));
    const h = 10, ph = 5;
    const cx = r.width * 0.5;
    const x = cx - w * 0.5;
    const y = 92;
    const nowT = rt.S.elapsed || 0;
    const openLeft = Math.max(0, (boss.openUntil || 0) - nowT);
    const isOpen = openLeft > 0 || boss.state === 'groggy';
    const isSeal = boss.state === 'seal' || boss.state === 'sealing';
    const isPhaseCut = (boss.phaseCutInvulnUntil || 0) > nowT;
    const P = rt.bossPat();
    const pMax = boss.poiseMax || (P && P.poise) || 6;
    const pCur = rt.clamp(boss.poise == null ? pMax : boss.poise, 0, pMax);
    const pFrac = isOpen ? rt.clamp(1 - (boss.stateT || 0) / Math.max(0.1, boss.groggyDur || P.groggyT || 3.4), 0, 1) : (pCur / pMax);

    ctx.save();
    /* v1.38 시안식 거친 먹선 붓터치 보스 체력바 (투박한 사각 박스 제거) */
    ctx.fillStyle = 'rgba(7,10,13,0.90)';
    ctx.beginPath();
    ctx.moveTo(x - 18, y + h * 0.5);
    ctx.lineTo(x - 4, y - 3);
    ctx.lineTo(x + w + 8, y - 2);
    ctx.lineTo(x + w + 22, y + h * 0.5);
    ctx.lineTo(x + w + 6, y + h + 4);
    ctx.lineTo(x - 6, y + h + 3);
    ctx.closePath();
    ctx.fill();

    ctx.font = '700 13px "InkSerif", serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#f4f8fa';
    ctx.fillText((rt.S.stage.bossName || '귀물 우두머리') + '  ·  ' + (boss.phase || 1) + '국면', cx, y - 7);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(18,12,14,0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,232,188,0.82)';
    ctx.fillRect(x, y, w * rt.clamp(boss.hpTrail / maxHp, 0, 1), h);
    const hpGrad = ctx.createLinearGradient(x, y, x + w, y);
    if (isPhaseCut) { hpGrad.addColorStop(0, '#ff4d2e'); hpGrad.addColorStop(1, '#ff9c54'); }
    else if (isOpen) { hpGrad.addColorStop(0, '#d93829'); hpGrad.addColorStop(1, '#ff7340'); }
    else { hpGrad.addColorStop(0, '#8f191d'); hpGrad.addColorStop(0.7, '#d42c2a'); hpGrad.addColorStop(1, '#ff4f42'); }
    ctx.fillStyle = hpGrad;
    ctx.fillRect(x, y, w * rt.clamp(curHp / maxHp, 0, 1), h);
    ctx.strokeStyle = isPhaseCut ? 'rgba(255,140,100,0.95)' : (isOpen ? 'rgba(255,224,118,0.95)' : 'rgba(6,8,10,0.95)');
    ctx.lineWidth = (isOpen || isPhaseCut) ? 1.6 : 1.2;
    ctx.strokeRect(x, y, w, h);

    const B = rt.bossCfg();
    const cutMarks = (B.phase3 || (rt.S.stageNo || 1) >= 12) ? [0.30, 0.60] : [0.60];
    ctx.fillStyle = 'rgba(255,244,210,0.85)';
    cutMarks.forEach(function (mk) { ctx.fillRect(x + w * mk - 1, y, 2, h); });

    const py = y + h + 4;
    const ph2 = ph + 2;
    ctx.fillStyle = 'rgba(24,20,14,0.96)';
    ctx.fillRect(x, py, w, ph2);
    const pw = w * rt.clamp(pFrac, 0, 1);
    const pg = ctx.createLinearGradient(x, py, x + w, py);
    pg.addColorStop(0, isOpen ? '#fff5be' : '#d99f2b');
    pg.addColorStop(1, isOpen ? '#ffd35c' : '#ffe07d');
    ctx.fillStyle = pg;
    ctx.fillRect(x, py, pw, ph2);
    ctx.fillStyle = 'rgba(18,14,10,0.45)';
    for (let ti = 1; ti < 4; ti++) ctx.fillRect(x + w * (ti / 4) - 0.5, py, 1, ph2);
    ctx.font = '700 10px "InkSerif", serif';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = isOpen ? '#fff0a8' : '#f2d07b';
    ctx.fillText(isOpen ? '강인도 붕괴' : '강인도', x, py + ph2 + 11);

    ctx.font = '700 10.5px "InkSerif", serif';
    ctx.textAlign = 'center';
    const hint = isSeal
      ? '봉인 가능 — 마지막 획을 그어 마무리하세요'
      : isPhaseCut
        ? '국면 전환 — 기합 충격파 주의'
        : isOpen
          ? '자세 붕괴 — 지금 일섬 피해 2.00배'
          : '회피·패링·특수 획으로 자세를 무너뜨리세요';
    ctx.fillStyle = isOpen || isSeal ? '#ffe68c' : (isPhaseCut ? '#ff9c82' : '#d6cbb5');
    ctx.fillText(hint, cx, py + ph + 13);
    ctx.restore();
  }
  /* v0.99 저스트 패링 예고 섬광(Attack Tell) + 바닥 수축 타이밍 링 (0.38초 예고, 0.18초 완벽 막기 구간 옥빛 강조) */
  if (rt.S && rt.S.playing && !rt.S.paused && rt.S.hero && (rt.S.parryCd || 0) <= 0.08) {
    const tellW = 0.38;
    const thr = rt.incomingParryThreat(tellW);
    if (thr) {
      const justW = rt.CFG.justParryWin || 0.18;
      const inJust = (thr.t || 0) <= justW;
      const frac = rt.clamp((thr.t || 0) / tellW, 0, 1);
      const hs = rt.heroScreen();
      ctx.save();
      /* 1) v1.58 주인공 발밑 3D 원근 수축 타이밍 룬 링 */
      const innerR = 26, outerR = 26 + 42 * frac;
      ctx.strokeStyle = inJust ? 'rgba(120,250,222,0.92)' : 'rgba(245,206,104,0.68)';
      ctx.lineWidth = inJust ? 3.0 : 1.8;
      ctx.beginPath(); ctx.ellipse(hs.x, hs.y + 6, outerR, outerR * 0.58, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = inJust ? 'rgba(245,206,104,0.90)' : 'rgba(245,206,104,0.32)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(hs.x, hs.y + 6, innerR, innerR * 0.58, 0, 0, Math.PI * 2); ctx.stroke();
      if (inJust) {
        ctx.font = '700 12px "InkSerif", "Gowun Batang", serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(8,14,18,0.92)';
        ctx.strokeText('막기!', hs.x, hs.y - 24);
        ctx.fillStyle = '#9effe4';
        ctx.fillText('막기!', hs.x, hs.y - 24);
      }
      /* 2) 위협 대상 무기/투사체 4각 경고 섬광 */
      const src = thr.z || thr.sh;
      if (src) {
        const tp = rt.projectXZ(src.x, src.z, thr.sh ? 0.7 : 1.35);
        const glintR = inJust ? 22 : 13;
        ctx.translate(tp.x, tp.y);
        ctx.rotate((1 - frac) * 0.9);
        ctx.fillStyle = inJust ? 'rgba(158,255,228,0.95)' : 'rgba(255,142,102,0.88)';
        ctx.beginPath();
        for (let gi = 0; gi < 8; gi++) {
          const ga = (gi * Math.PI) / 4;
          const gr = (gi % 2 === 0) ? glintR : glintR * 0.22;
          if (gi === 0) ctx.moveTo(Math.cos(ga) * gr, Math.sin(ga) * gr);
          else ctx.lineTo(Math.cos(ga) * gr, Math.sin(ga) * gr);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }
  /* v0.97 저스트 패링(완벽 막기) 수묵 흑백 반전 연출 (0.14초, 접근성 흔들림 끔 설정 존중) */
  if (rt.S && rt.S.justParryInvertT > 0) {
    rt.S.justParryInvertT = Math.max(0, rt.S.justParryInvertT - Math.min(0.05, rt.frameDt || 0.016));
    if (!rt.a11yShake() && !rt.reducedMotion()) {
      const jk = rt.clamp(rt.S.justParryInvertT / 0.14, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = 'rgba(245,240,226,' + (0.78 * jk).toFixed(3) + ')';
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.restore();
      ctx.save();
      const jcx = r.width * 0.5, jcy = r.height * 0.48, jrad = Math.hypot(jcx, jcy);
      const jGrad = ctx.createRadialGradient(jcx, jcy, jrad * 0.05, jcx, jcy, jrad * 0.65);
      jGrad.addColorStop(0, 'rgba(130,248,216,' + (0.32 * jk).toFixed(3) + ')');
      jGrad.addColorStop(0.45, 'rgba(255,228,136,' + (0.16 * jk).toFixed(3) + ')');
      jGrad.addColorStop(1, 'rgba(10,10,12,0)');
      ctx.fillStyle = jGrad;
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.restore();
    }
  }
  /* v0.67 수묵 2톤 임팩트 프레임 + 먹물 집중선 (lightning-energy-skill-vfx · WCAG 안전 0.085초) */
  if (rt.S && rt.S.impactFrameT > 0) {
    rt.S.impactFrameT = Math.max(0, rt.S.impactFrameT - Math.min(0.05, rt.frameDt || 0.016));
    const k = rt.clamp(rt.S.impactFrameT / 0.085, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(242,235,218,' + (0.24 * k).toFixed(3) + ')';
    ctx.fillRect(0, 0, r.width, r.height);
    const icx = r.width * 0.5, icy = r.height * 0.48, rad = Math.hypot(icx, icy);
    ctx.strokeStyle = 'rgba(14,12,15,' + (0.62 * k).toFixed(3) + ')';
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + (i % 3) * 0.03;
      const r0 = rad * (0.34 + (i % 5) * 0.06);
      ctx.lineWidth = (i % 3 === 0) ? 2.4 : 1.1;
      ctx.beginPath();
      ctx.moveTo(icx + Math.cos(a) * r0, icy + Math.sin(a) * r0);
      ctx.lineTo(icx + Math.cos(a) * rad, icy + Math.sin(a) * rad);
      ctx.stroke();
    }
    ctx.restore();
  }
  const wpp = rt.worldPerCss();
  /* v1.38 절제된 카툰 방사형 화염/청독 장판 (최대 8개, 겹침 과다 억제) */
  if (rt.S.clouds && rt.S.clouds.length) {
    ctx.save();
    let drawnC = 0;
    for (let ci = rt.S.clouds.length - 1; ci >= 0 && drawnC < 8; ci--) {
      const cl = rt.S.clouds[ci];
      if (!cl || !(cl.t > 0)) continue;
      drawnC++;
      const fade = rt.clamp(cl.t / 0.5, 0, 1);
      const cp = rt.projectXZ(cl.x, cl.z, 0.04);
      const rad = Math.max(14, (cl.r || 1.6) * wpp * 0.72);
      const gr = ctx.createRadialGradient(cp.x, cp.y, rad * 0.08, cp.x, cp.y, rad);
      if (cl.kind === 'fire') {
        gr.addColorStop(0, 'rgba(255,112,56,' + (0.28 * fade).toFixed(3) + ')');
        gr.addColorStop(0.55, 'rgba(196,42,30,' + (0.16 * fade).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(196,42,30,0)');
      } else {
        gr.addColorStop(0, 'rgba(72,226,184,' + (0.22 * fade).toFixed(3) + ')');
        gr.addColorStop(0.6, 'rgba(32,126,112,' + (0.12 * fade).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(20,76,72,0)');
      }
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(cp.x, cp.y, rad, rad * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  let shownMobHp = 0;
  rt.S.zombies.forEach(function (z) {
    if (!z.alive || z.isBoss) return;
    const zh = (z.obj && z.obj.userData && z.obj.userData.worldH) || 2.4;
    const p = rt.projectXZ(z.x, z.z, zh * 0.9);
    if (z.obj && !z.obj.visible) return;
    /* v1.38 잡몹 HP바: 정예/중장 또는 피격 적 최대 6기만 초슬림 1.8px 진홍 실선 표시 */
    const zMaxHp = Math.max(1, z.maxHp || z.hp || 1);
    const zCurHp = Math.max(0, z.hp || 0);
    const isPriority = !!(z.elite || z.heavy);
    if (zCurHp > 0 && (isPriority || (zCurHp < zMaxHp * 0.92 && shownMobHp < 6))) {
      if (!isPriority) shownMobHp++;
      const bw = isPriority ? 22 : 13;
      const bx = p.x - bw * 0.5, by = p.y - 6;
      ctx.fillStyle = 'rgba(6,8,10,0.68)';
      ctx.fillRect(bx - 0.5, by - 0.5, bw + 1, 2.8);
      ctx.fillStyle = '#e43636';
      ctx.fillRect(bx, by, bw * rt.clamp(zCurHp / zMaxHp, 0, 1), 1.8);
    }
    /* 갑옷을 두른 장정 */
    if (z.armored && (z.armor || 0) > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(186,196,206,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y + 8, Math.max(11, (z.r || 0.7) * wpp * 1.15), Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      ctx.restore();
    }
    /* 바뀐 순간 금빛 테두리(0.3초) */
    if (z.rimFlash > 0) {
      const k = rt.clamp(z.rimFlash / (rt.CFG.breakRimT || 0.3), 0, 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,214,110,' + (0.85 * k).toFixed(3) + ')';
      ctx.lineWidth = 2 + 2 * k;
      ctx.beginPath(); ctx.arc(p.x, p.y + 8, Math.max(14, (z.r || 0.6) * wpp * 1.4 + 6 * k), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    /* 돌덩이 금 */
    if (z.hasCracks && z.cracks > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(214,204,182,0.8)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < z.cracks; i++) {
        const a = -0.7 + i * 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * 5, p.y + 8);
        ctx.lineTo(p.x + Math.cos(a) * 15, p.y + 20);
        ctx.stroke();
      }
      ctx.restore();
    }
    /* 정예: 머리 위 봉인 순서 3개 — 지금 차례만 밝다 */
    if (z.eliteSeq && z.seq && z.seq.length) {
      const n = z.seq.length, gap = 23, w = n * gap;
      ctx.save();
      for (let i = 0; i < n; i++) {
        const cx = p.x - w / 2 + gap * (i + 0.5), cy = p.y - 26;
        const done = i < z.seqI, cur = i === z.seqI;
        ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.fillStyle = done ? 'rgba(255,214,110,0.18)' : 'rgba(8,7,9,0.74)';
        ctx.fill();
        ctx.strokeStyle = done ? 'rgba(255,214,110,0.5)' : (cur ? 'rgba(255,214,110,0.95)' : 'rgba(240,232,210,0.26)');
        ctx.lineWidth = cur ? 2.2 : 1.2;
        ctx.stroke();
        ctx.fillStyle = done ? 'rgba(255,214,110,0.5)' : (cur ? 'rgba(255,244,214,1)' : 'rgba(240,232,210,0.4)');
        ctx.font = '700 12px "InkSerif", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        brushMark(ctx,z.seq[i],cx,cy,6);
        if (i < n - 1) {
          ctx.strokeStyle = 'rgba(240,232,210,0.22)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cx + 11, cy); ctx.lineTo(cx + gap - 11, cy); ctx.stroke();
        }
      }
      ctx.restore();
    }
  });
  for (const fx of rt.S.skillStamps || []) {
    const age = rt.S.elapsed - fx.start;
    if (age >= .4) continue;
    const p = rt.projectXZ(fx.x, fx.z, 1);
    ctx.save(); ctx.globalAlpha = 1 - age / .4;
    const size = 36 + age * 48;
    if (fx.kind === 'reson' || fx.kind === 'echo') {
      const radius = 4 + age * (fx.kind === 'reson' ? 65 : 90);
      ctx.strokeStyle = fx.kind === 'reson' ? '#cfab70' : '#a9c7ba';
      ctx.lineWidth = 2.4 - age*4;
      for (let i=0;i<2;i++) {
        ctx.beginPath();
        ctx.ellipse(p.x,p.y,radius*(1-i*.25),radius*.46*(1-i*.25),-.18,i*.8,5.6+i*.8);
        ctx.stroke();
      }
    } else {
      rt.paintSkill(ctx, fx.kind, p.x, p.y, size, size);
    }
    ctx.restore();
  }
  /* v1.00 회전 호신부: 이중 금박 궤도 + 잔광 호 + 회전 부적 */
  const w = rt.wardInfo();
  if (w) {
    const isManryun = !!(rt.S.evo && rt.S.evo.manryun);
    ctx.save();
    ctx.strokeStyle = isManryun ? 'rgba(130,248,216,0.34)' : 'rgba(255,214,110,0.26)';
    ctx.lineWidth = isManryun ? 2.4 : 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = i / 40 * Math.PI * 2;
      const p = rt.projectXZ(rt.S.hero.x + Math.cos(a) * w.r, rt.S.hero.z + Math.sin(a) * w.r, 0.06);
      if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < w.n; i++) {
      const a = (rt.S.wardSpin || 0) + i * Math.PI * 2 / w.n;
      const p = rt.projectXZ(rt.S.hero.x + Math.cos(a) * w.r, rt.S.hero.z + Math.sin(a) * w.r, 0.6);
      /* 잔광 꼬리(3점 호) */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let ti = 1; ti <= 3; ti++) {
        const ta = a - ti * 0.22;
        const tp = rt.projectXZ(rt.S.hero.x + Math.cos(ta) * w.r, rt.S.hero.z + Math.sin(ta) * w.r, 0.56);
        ctx.fillStyle = isManryun ? ('rgba(120,248,216,' + (0.32 - ti * 0.08).toFixed(2) + ')') : ('rgba(255,216,118,' + (0.30 - ti * 0.08).toFixed(2) + ')');
        ctx.beginPath(); ctx.arc(tp.x, tp.y, 9 - ti * 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(.32 * Math.sin(a));
      rt.paintSkill(ctx, 'ward', 0, 0, isManryun ? 36 : 32, isManryun ? 42 : 38);
      ctx.restore();
    }
  }
  /* 벼락부적 예고 원 */
  (rt.S.bolts || []).forEach(function (b) {
    const c = rt.projectXZ(b.x, b.z, 0.05);
    const rx = b.r * wpp, ry = rx * 0.58;
    if (b.done) {
      const age = b.t - b.delay;
      const pulse = age < .12 || (age > .17 && age < .28) ? 1 : .72;
      ctx.save();ctx.globalAlpha = rt.clamp(1-(age-.32)/.26,0,1);
      // Reach the top of the playfield without scaling stroke width with height.
      const height = Math.max(1,c.y + 2);
      const width = rt.clamp(height*.075,14,44);
      const seed = b.x*7.1 + b.z*13.3 + (age < .17 ? 0 : 2);
      ctx.translate(c.x,c.y);
      ctx.globalAlpha *= pulse;
      ctx.lineJoin='bevel';
      ctx.beginPath();
      ctx.moveTo(0,0);
      for (let i=1;i<=22;i++) {
        const u=i/22;
        const x=width*Math.min(1,u*5)*(.54*Math.sin(seed+i*.81)+.32*Math.sin(seed+i*2.4)+u*.45);
        const y=-height*u;
        ctx.lineTo(x,y);
        if (i%5===2) {
          const side=i%2 ? 1 : -1;
          ctx.moveTo(x+width*side*1.24,y+height*.13);
          ctx.lineTo(x+width*side*.72,y+height*.055);
          ctx.lineTo(x+width*side*.76,y+height*.074);
          ctx.lineTo(x,y);
        }
      }
      ctx.strokeStyle='rgba(230,165,65,.22)'; ctx.lineWidth=7; ctx.stroke();
      ctx.strokeStyle='#c48c43'; ctx.lineWidth=3.4; ctx.stroke();
      ctx.strokeStyle='#fff3cc'; ctx.lineWidth=1.45; ctx.stroke();
      ctx.beginPath();
      for (let i=0;i<7;i++) {
        const angle=(i+.35)*Math.PI/7;
        ctx.moveTo(0,0);
        ctx.lineTo(Math.cos(angle)*width*.65,-Math.sin(angle)*width*.35);
      }
      ctx.stroke();
      ctx.restore();return;
    }
    const u = rt.clamp(b.t / Math.max(0.01, b.delay), 0, 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,110,' + (0.30 + 0.55 * u).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(8, rx * (0.55 + 0.45 * u)), Math.max(5, ry * (0.55 + 0.45 * u)), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });

}
// Dry vermilion strokes, angular frost, and dilute violet washes.
function drawElementMote(ctx, el, x, y, u, color) {
  ctx.globalAlpha = Math.sin(Math.PI * u);
  ctx.fillStyle = el === 'poison' ? '#bb92cc' : 'rgb(' + color.join(',') + ')';
  ctx.beginPath();
  if (el === 'poison') {
    ctx.globalAlpha *= .24;
    ctx.ellipse(x,y,4+u*3,2+u*2,-.25,0,Math.PI*2);
  } else if (el === 'fire') {
    ctx.moveTo(x-1.5,y+2); ctx.quadraticCurveTo(x-2,y,x+2+u*2,y-6);
    ctx.quadraticCurveTo(x+2,y+1,x-1.5,y+2);
  } else {
    ctx.moveTo(x,y-3); ctx.lineTo(x+1.6,y); ctx.lineTo(x,y+3); ctx.lineTo(x-1.6,y);
  }
  ctx.fill();
}
/* v0.54: 주인공·심안 경계의 인위적 2D 원형 테두리 선을 제거해 한지 수묵화 몰입감을 높인다.
   (원 안/밖 대비는 3D 월드 먹안개가 자연스럽게 담당한다.) */
function drawHeroElement(ctx, t) {
  if (!rt.S || !rt.S.hero) return;
  /* v1.58 참(O) 준비 완료 발밑 3D 회전 시길 룬 + 상승 불씨 오라 */
  const maxC = (rt.CFG && rt.CFG.cleaveCharge) || 100;
  if ((rt.S.charge || 0) >= maxC) {
    const fp = rt.projectXZ(rt.S.hero.x, rt.S.hero.z, 0.05);
    const pulse = 1 + 0.06 * Math.sin(t * 5.2);
    const rx = 25 * pulse, ry = rx * 0.56;
    const rot = t * 1.1;
    ctx.save();
    ctx.strokeStyle = 'rgba(78,234,208,0.68)';
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(fp.x, fp.y, rx, ry, 0, rot + i * Math.PI * 0.5, rot + i * Math.PI * 0.5 + 0.92);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(245,206,104,0.62)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(fp.x, fp.y, rx * 0.74, ry * 0.74, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const u = (t * 0.9 + i * 0.25) % 1;
      const a = i * 1.57 + t * 0.8;
      const mp = rt.projectXZ(rt.S.hero.x + Math.cos(a) * 0.72, rt.S.hero.z + Math.sin(a) * 0.72, 0.1 + u * 1.45);
      ctx.fillStyle = (i % 2 === 0) ? 'rgba(245,206,104,' + (Math.sin(Math.PI * u) * 0.82).toFixed(3) + ')'
        : 'rgba(78,234,208,' + (Math.sin(Math.PI * u) * 0.82).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(mp.x, mp.y, 1.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  const el = rt.curElem();
  if (!el) return;
  const c = rt.FX_COLORS[el] || rt.FX_COLORS.jade;
  const R = 0.9;
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const u = ((t * 0.8 + i / 6) % 1), a = i * 1.05 + t * 0.5;
    const p = rt.projectXZ(rt.S.hero.x + Math.cos(a) * R * 0.8, rt.S.hero.z + Math.sin(a) * R * 0.8, 0.1 + u * 1.6);
    drawElementMote(ctx, el, p.x, p.y, u, c);
  }
  ctx.restore();
  if (rt.S.tempElem && rt.S.tempElem.t > 0) {
    const f = rt.clamp(rt.S.tempElem.t / (rt.CFG.tempElemDur || 12), 0, 1);
    drawFootGauge(ctx, f, 'rgb(' + c.join(',') + ')', 38, 7);
  }
}
function drawFootGauge(ctx, fraction, color, width, offset, windowStart) {
  const foot = rt.projectXZ(rt.S.hero.x, rt.S.hero.z, 0);
  const x = Math.round(foot.x - width / 2), y = Math.round(foot.y + offset);
  ctx.save();
  ctx.fillStyle = 'rgba(23,19,18,.88)';
  ctx.fillRect(x-1,y-1,width+2,7);
  if (windowStart != null) {
    ctx.fillStyle = '#aa8744';
    ctx.fillRect(x+width*windowStart,y,width*(1-windowStart),5);
  }
  ctx.fillStyle = color;
  ctx.fillRect(x,y+1,width*fraction,3);
  ctx.restore();
}
function drawEnemyBars(ctx) {
  const R = rt.ringR();
  const t = rt.S.elapsed || 0;
  /* Status motes for kinds without their own status art (brute, stone, elites): flames, frost glints, bubbles. */
  rt.S.zombies.forEach(function (z) {
    if (!z.alive || z.obj?.visible === false || ((z.isBoss || z.type === 'imp') && !(z.frozen > 0))) return;
    const el = z.frozen > 0 ? 'ice' : z.burn > 0 ? 'fire' : z.poison > 0 ? 'poison' : null;
    if (!el || rt.dist(z, rt.S.hero) > R) return;
    const c = rt.FX_COLORS[el], zh = (z.obj && z.obj.userData && z.obj.userData.worldH) || 2.4;
    if (el === 'ice') {
      const foot = rt.projectXZ(z.x,z.z,0);
      const head = rt.projectXZ(z.x,z.z,zh);
      const span = rt.clamp(Math.abs(foot.y-head.y)*.32,8,32);
      ctx.save();
      ctx.translate(foot.x,foot.y);
      ctx.scale(span,span);
      ctx.beginPath();
      for (const side of [-1,1]) {
        ctx.moveTo(side*.42,0); ctx.lineTo(side*.96,-.66);
        ctx.lineTo(side*.83,-.21); ctx.lineTo(side*1.14,-.32);
        ctx.lineTo(side*.76,.04); ctx.closePath();
      }
      ctx.fillStyle='#a8e6ec'; ctx.strokeStyle='#35566d'; ctx.lineWidth=.095;
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const u = ((t * (el === 'ice' ? 0.4 : 0.9) + i / 5 + z.id * 0.17) % 1);
      const p = rt.projectXZ(z.x + Math.cos(i * 2.1) * (z.r || 0.6) * 0.8, z.z + Math.sin(i * 2.1) * (z.r || 0.6) * 0.8, zh * (0.15 + 0.5 * u));
      drawElementMote(ctx,el,p.x,p.y,u,c);
    }
    ctx.restore();
  });
  rt.S.zombies.forEach(function (z) {
    if (!z.alive || z.isBoss || !(z.maxHp > 0) || z.hp >= z.maxHp - 0.01) return;
    if (rt.dist(z, rt.S.hero) > R) return;
    const zh = (z.obj && z.obj.userData && z.obj.userData.worldH) || 2.4;
    const p = rt.projectXZ(z.x, z.z, zh * 0.78);
    const w = 26, h = 4, f = rt.clamp(z.hp / z.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(8,7,9,0.8)'; ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(214,48,34,0.95)'; ctx.fillRect(p.x - w / 2, p.y, w * f, h);
    ctx.restore();
  });
}



function secondScore(rec) {
  if (!rec || !rec.scores) return 0;
  const vals = Object.keys(rec.scores).map(function (k) { return rec.scores[k] || 0; }).sort(function (a, b) { return b - a; });
  return +(vals[1] || 0).toFixed(2);
}
function failHint() {
  if (!rt.S) return 'ㅣ — V 중에 그려 보세요';
  if (rt.S.practiceShape && (rt.S.practiceT > 0 || rt.S.practiceSpawns > 0) && rt.SHAPE_HINT[rt.S.practiceShape]) {
    return rt.SHAPE_HINT[rt.S.practiceShape];
  }
  const counts = {};
  rt.livingMarks().forEach(function (s) {
    const k = rt.spiritShape(s);
    counts[k] = (counts[k] || 0) + 1;
  });
  let best = null, n = 0;
  Object.keys(counts).forEach(function (k) { if (counts[k] > n) { n = counts[k]; best = k; } });
  if (best && rt.SHAPE_HINT[best]) return rt.SHAPE_HINT[best];
  const pool = rt.S.pool || [];
  if (pool.length === 1 && rt.SHAPE_HINT[pool[0]]) return rt.SHAPE_HINT[pool[0]];
  if (pool.length === 2) {
    return (rt.SHAPE_HINT[pool[0]] || '') + (rt.SHAPE_HINT[pool[1]] ? ' ' + rt.SHAPE_HINT[pool[1]] : '');
  }
  return pool.map(function (s) { return rt.SHAPE_HINT[s] || rt.SHAPE_MARK[s] || s; }).filter(Boolean).join(' ');
}
function showJudge(text) {
  const el = $('judgeFlash');
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}
/* A spirit announces itself with one bell from its side of the screen; the pitch tells the shape. */
function stampSkill(kind, x, z) {
  const live = (rt.S.skillStamps || []).filter(fx => rt.S.elapsed - fx.start < .4);
  live.push({kind, x, z, start: rt.S.elapsed});
  rt.S.skillStamps = live;
}
const { ringSpiritBell, triggerComboBurst, comboBreak, comboReward, scoreDash, triggerSightWave, clampPointToArena, worldBounds, resolvePropCollision, clipWorld, clipBound, clampHeroToArena, dashEndPoint, enqueueInputBuf, consumeInputBuf, beginDash, startSeg, resolveDash, landDash, landingShock } = createDashController(rt, { showJudge, stampSkill });
/* 제자리 탭 → 칼집 패링: 반경 2.4m 넉백·경직·0.5 피해. 성공 시 parry 사운드 + 히트스톱. */
/* v1.32 제로-GC 수묵 플로팅 데미지 & 기예 점수 팝업 풀 */
const _floaters = [];
for (let _fi = 0; _fi < 28; _fi++) _floaters.push({ alive: false, x: 0, z: 0, text: '', kind: 'dmg', t: 0, dur: 0.65, ox: 0 });
let _floaterNext = 0;
function spawnFloater(x, z, text, kind) {
  if (!text) return;
  const f = _floaters[_floaterNext];
  _floaterNext = (_floaterNext + 1) % _floaters.length;
  f.alive = true; f.x = x; f.z = z; f.text = String(text); f.kind = kind || 'dmg';
  f.t = 0; f.dur = kind === 'score' ? 0.85 : (kind === 'weak' ? 0.78 : 0.58);
  f.ox = ((_floaterNext % 5) - 2) * 7;
}
function drawFloaters(ctx, dt) {
  const stepDt = Math.min(0.05, dt || 0.016);
  let any = false;
  for (let i = 0; i < _floaters.length; i++) if (_floaters[i].alive) { any = true; break; }
  if (!any) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < _floaters.length; i++) {
    const f = _floaters[i];
    if (!f.alive) continue;
    f.t += stepDt;
    if (f.t >= f.dur) { f.alive = false; continue; }
    const u = f.t / f.dur;
    const p = rt.projectXZ(f.x, f.z, f.kind === 'score' ? 1.55 : 1.15);
    const rise = (1 - Math.pow(1 - u, 2)) * (f.kind === 'score' ? 38 : 26);
    const alpha = u < 0.7 ? 1 : Math.max(0, 1 - (u - 0.7) / 0.3);
    const sc = u < 0.14 ? (0.75 + (u / 0.14) * 0.45) : (1.2 - Math.min(0.2, (u - 0.14) * 0.4));
    const px = f.kind === 'weak' ? 20 : (f.kind === 'score' ? 16 : (f.kind === 'crit' ? 17 : 13));
    ctx.globalAlpha = alpha;
    ctx.font = '800 ' + Math.round(px * sc) + 'px system-ui, -apple-system, sans-serif';
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = 'rgba(10, 9, 12, 0.88)';
    ctx.fillStyle = f.kind === 'weak' ? '#ff644c' : (f.kind === 'score' ? '#7ef5d4' : (f.kind === 'crit' ? '#ffd978' : '#f4efe6'));
    ctx.strokeText(f.text, p.x + f.ox, p.y - rise);
    ctx.fillText(f.text, p.x + f.ox, p.y - rise);
  }
  ctx.restore();
}
  return { _proj, beginDash, beginOnebell, brushMark, clampHeroToArena, clampPointToArena, clearOnebell, clipBound, clipWorld, comboBreak, comboReward, consumeInputBuf, dashEndPoint, endOnebell, enqueueInputBuf, failHint, inkColorFor, landDash, landingShock, loadMarkImages, onebellSlash, resolveDash, resolvePropCollision, ringSpiritBell, scoreDash, secondScore, showJudge, spawnFloater, stampSkill, startSeg, syncGroundEffects, triggerSightWave, updateMarks, worldBounds };
}
