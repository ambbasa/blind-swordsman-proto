/* v2/js/modules/tutorialSys.js — 심안: 묵검 v1.26 접근성·첫 경험·튜토리얼·모드 UI */

export function createTutorialSys(rt) {
  const $ = rt.$;
/* ---------- v0.30 §11 접근성 · §8.2 '처음 보는 순간' · §7.3 동적 보정 · §8.1 몸통 튜토리얼 ----------
   난이도·연패·첫 경험은 모두 save에 남긴다(기기 안, 개인정보 없음). */
function a11yCb() { return !!(rt.save.a11y && rt.save.a11y.colorblind); }
/** 화면 흔들림을 줄이는 설정(켜면 흔들림 ×0.3, 느린 화면은 0.6배까지). */
function a11yShake() { return !!(rt.save.a11y && rt.save.a11y.shake); }
function haptic(pat) {
  if (typeof navigator !== 'undefined' && navigator.vibrate && !a11yShake() && !reducedMotion()) {
    try { navigator.vibrate(pat); } catch (_) {}
  }
}
const SWORD_GLOW_MAP = { muk: null, seori: 0x88e8ff, hwa: 0xff6838, maeng: 0x62f0bc, cheong: 0x78e8d8, gwi: 0xc078ff, thunder: 0xffe066, breaker: 0xff5240 };
function syncHeroWeaponCosmetic() {
  if (!rt.art || !rt.art.heroSwordTrail || !rt.three || !rt.three.hero) return;
  const sw = rt.swordOf ? rt.swordOf(rt.save) : null;
  const tr = rt.trailOf ? rt.trailOf(rt.save) : null;
  const swHex = sw ? (SWORD_GLOW_MAP[sw.id] != null ? SWORD_GLOW_MAP[sw.id] : null) : null;
  const cHex = tr && tr.id !== 'ink' ? tr.coreHex : null;
  const hHex = tr && tr.id !== 'ink' ? tr.hotHex : null;
  rt.art.heroSwordTrail(rt.three.hero, swHex, cHex, hHex);
}
function setA11y(key, v) {
  rt.save.a11y = rt.save.a11y || { colorblind: 0, shake: 0 };
  rt.save.a11y[key] = v ? 1 : 0;
  rt.persist();
  syncA11yUi();
  return !!rt.save.a11y[key];
}
function syncA11yUi() {
  const cb = a11yCb(), sh = a11yShake();
  [['btnCb', '색약 팔레트'], ['btnCb1', '색약 팔레트']].forEach(function (p) {
    const b = $(p[0]); if (b) { b.textContent = p[1] + ': ' + (cb ? '켬' : '끔'); b.classList.toggle('on', cb); }
  });
  [['btnShake', '화면 흔들림'], ['btnShake1', '화면 흔들림']].forEach(function (p) {
    const b = $(p[0]); if (b) { b.textContent = p[1] + ': ' + (sh ? '줄임' : '켬'); b.classList.toggle('on', sh); }
  });
  const gfxMode = (rt.save.a11y && rt.save.a11y.gfx) || 'normal';
  const gfxTxt = gfxMode === 'light' ? '가볍게' : (gfxMode === 'high' ? '높음' : '보통');
  ['btnGfx', 'btnGfx1'].forEach(function (id) {
    const b = $(id); if (!b) return;
    b.textContent = '그래픽: ' + gfxTxt;
    b.classList.toggle('on', gfxMode === 'light');
  });

}
function setLevelMode(mode) {
  rt.save.levelMode = 'pause';
  rt.persist();
  syncA11yUi();
  return rt.save.levelMode;
}
/* §8.2 저장 단위 기록: 한 번 본 순간은 다시 늦추지 않는다(무늬·패턴·기물·칼 튕김·참). */
function seen(k) { return !!(rt.save.moments && rt.save.moments[k]); }
function markSeen(k) {
  rt.save.moments = rt.save.moments || {};
  if (rt.qa && rt.qa.noFirstMoments) return false;
  if (rt.save.moments[k]) return false;
  rt.save.moments[k] = 1;
  rt.persist();
  return true;
}
/* §7.3 같은 장 연패 기억. */
function streakOf(stageNo) {
  const s = rt.save.streak;
  return (s && (s.stage | 0) === (stageNo | 0)) ? (s.n | 0) : 0;
}
function bumpStreak(stageNo, win) {
  const n = win ? 0 : Math.min(9, streakOf(stageNo) + 1);
  rt.save.streak = n ? { stage: stageNo | 0, n: n } : null;
  rt.persist();
  return n;
}
/** 느린 화면을 한 가지 통로로 모은다(튜토리얼·첫 등장·간발). 흔들림을 줄인 설정이면 0.6배까지. */
function addSlow(mul, dur) {
  if (!rt.S) return;
  let m = mul, d = dur;
  if (a11yShake() || reducedMotion()) { m = Math.max(0.6, m); d = Math.max(d, 0.001) * 0.6; }
  rt.S.slowMul = Math.min(rt.S.slowMul || 1, m);
  rt.S.slowMulT = Math.max(rt.S.slowMulT || 0, d);
}
function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}
/* 무늬·기물의 유도 획 모양(화면 좌표). 유도 획·첫 등장 안내·기물 연습이 같은 함수를 쓴다. */
function ghostShapePath(type, cx, cy, s) {
  const p = [];
  const line = function (x1, y1, x2, y2, n) {
    n = n || 20;
    for (let i = 0; i < n; i++) { const t = i / (n - 1); p.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }); }
  };
  if (type === 'vline') line(cx, cy - s, cx, cy + s, 18);
  else if (type === 'vee') { line(cx - s * 0.8, cy - s * 0.7, cx, cy + s * 0.8, 12); line(cx, cy + s * 0.8, cx + s * 0.8, cy - s * 0.7, 12); }
  else if (type === 'bolt') { line(cx + s * 0.25, cy - s, cx - s * 0.25, cy - s * 0.15, 8); line(cx - s * 0.25, cy - s * 0.15, cx + s * 0.3, cy + s * 0.12, 7); line(cx + s * 0.3, cy + s * 0.12, cx - s * 0.25, cy + s, 9); }
  else if (type === 'circle') { for (let i = 0; i <= 44; i++) { const a = -Math.PI * 0.5 + Math.PI * 2 * (i / 44); p.push({ x: cx + Math.cos(a) * s * 0.8, y: cy + Math.sin(a) * s * 0.8 }); } }
  else if (type === 'square') { line(cx - s * 0.7, cy - s * 0.7, cx + s * 0.7, cy - s * 0.7, 10); line(cx + s * 0.7, cy - s * 0.7, cx + s * 0.7, cy + s * 0.7, 10); line(cx + s * 0.7, cy + s * 0.7, cx - s * 0.7, cy + s * 0.7, 10); line(cx - s * 0.7, cy + s * 0.7, cx - s * 0.7, cy - s * 0.7, 10); }
  else if (type === 'tri') { line(cx, cy - s * 0.8, cx + s * 0.8, cy + s * 0.6, 10); line(cx + s * 0.8, cy + s * 0.6, cx - s * 0.8, cy + s * 0.6, 10); line(cx - s * 0.8, cy + s * 0.6, cx, cy - s * 0.8, 10); }
  else if (type === 'arc') { for (let i = 0; i <= 26; i++) { const a = Math.PI * (i / 26); p.push({ x: cx - Math.cos(a) * s * 0.85, y: cy + Math.sin(a) * s * 0.6 }); } }
  else if (type === 'spiral') { for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * Math.PI * 4.0 - 0.4, r = s * (0.1 + 0.75 * t); p.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } }
  else line(cx - s, cy, cx + s, cy, 18);
  return p;
}
/** 반여명의 획 가이드: 콸리콸 흐르는 점선. 대각 위에 작은 획이 머리무리에서 나가는 방향으로 움직인다. */
function drawGhostPath(ctx, pts, color, alpha, width) {
  if (!pts || pts.length < 2) return;
  const t = (rt.S && rt.S.elapsed) || 0;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.globalAlpha = alpha * 0.35;
  ctx.lineWidth = (width || 5) + 3;
  ctx.beginPath();
  pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width || 5;
  ctx.setLineDash([12, 10]);
  ctx.lineDashOffset = -((t * 90) % 22);
  ctx.beginPath();
  pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
  ctx.stroke();
  ctx.setLineDash([]);
  /* 머리(그리는 방향): 마지막 두 점의 방향으로 화살촉 */
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - Math.cos(ang - 0.5) * 15, b.y - Math.sin(ang - 0.5) * 15);
  ctx.lineTo(b.x - Math.cos(ang + 0.5) * 15, b.y - Math.sin(ang + 0.5) * 15);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
/* ---------- §8.1 첫 10초 몸통 튜토리얼 ---------- */
function startTutorial(force) {
  if (!rt.S) return null;
  if (!force && rt.S.stageNo !== 1) return null;
  rt.S.tutorial = { on: true, t: 0, first: false, firstAt: -1, tapDone: false };
  rt.S.tutSlow = rt.CFG.tut.slow0;
  const b = $('btnSkip');
  if (b) b.hidden = false;
  return rt.S.tutorial;
}
function endTutorial(reason) {
  if (!rt.S || !rt.S.tutorial) return false;
  rt.S.tutorial = null;
  rt.S.tutSlow = 1;
  rt.hideGuide();
  const b = $('btnSkip');
  if (b) b.hidden = true;
  rt.save.tutorialDone = 1;
  rt.persist();
  rt.telemetry.event('tutorial', { done: reason || 'end' });
  return true;
}
/** 튜토리얼·첫 등장 연출은 게임 시간이 아니라 실제 시간으로 센다(느린 화면에 안 밀리게). */
function stepTutorial(real) {
  if (!rt.S) return;
  if (rt.S.slowMulT > 0) {
    rt.S.slowMulT -= real;
    if (rt.S.slowMulT <= 0) { rt.S.slowMulT = 0; rt.S.slowMul = 1; }
  }
  const T = rt.S.tutorial;
  if (!T || !T.on) { rt.S.tutSlow = 1; return; }
  T.t += real;
  tickTutorial();
}
/** 단계 문턱(5초 제자리 탭·10초 종료)을 한 곳에 모은다 — QA에서는 advanceTutorial로 결정론적으로 돌린다. */
function tickTutorial() {
  const T = rt.S && rt.S.tutorial;
  if (!T || !T.on) return;
  if (!T.first) rt.S.tutSlow = rt.CFG.tut.slow0;
  else if (T.firstAt >= 0 && (T.t - T.firstAt) < rt.CFG.tut.firstDur) rt.S.tutSlow = rt.CFG.tut.firstSlow;
  else rt.S.tutSlow = 1;
  if (!T.tapSpawned && T.t >= rt.CFG.tut.tapAt) {
    T.tapSpawned = true;
    /* 제자리 탭 단계: 앞에서 귀물 하나가 다가온다. 탭은 패링 — 실패해도 피해 없음. */
    if (!reducedMotion()) addSlow(rt.CFG.tut.tapSlow, rt.CFG.tut.tapSlowDur);
    const p = rt.S.hero;
    rt.spawnZombie({ x: p.x + Math.cos(-Math.PI / 2) * 2.6, z: p.z + Math.sin(-Math.PI / 2) * 2.6, type: 'imp' });
    rt.showGuide('제자리 탭', 2.4);
    if (rt.audio && rt.audio.gong) rt.audio.gong();
  }
  if (rt.S.playing) rt.S.iframe = Math.max(rt.S.iframe || 0, 0.25);
  if (T.t >= rt.CFG.tut.end) endTutorial('end');
}
function tutorialFirstSuccess() {
  const T = rt.S && rt.S.tutorial;
  if (!T || !T.on || T.first) return false;
  T.first = true; T.firstAt = T.t;
  rt.addHitstop(0.05);
  if (rt.audio && rt.audio.slash) rt.audio.slash(null, rt.S ? (rt.S.combo || 0) : 0, (rt.art && rt.art.heroComboStep && rt.three && rt.three.hero) ? rt.art.heroComboStep(rt.three.hero) : 1);
  rt.showGuide('일섬!', 1.6);
  return true;
}
/* 안내를 그릴 대상: 튜토리얼의 첫 혼령 */
function guideSpirit() {
  const ms = rt.livingMarks();
  if (!ms.length) return null;
  return rt.nearestTo(ms, rt.S.hero);
}
function drawTutorial(ctx, r, hs) {
  if (!rt.S) return;
  const T = rt.S.tutorial;
  const t = rt.S.elapsed || 0;
  /* 참 게이지 100 첫 안내: 화면 가운데 O 유도 획 1회 */
  if (rt.S.chargeGuide > 0) {
    rt.S.chargeGuide -= rt.frameDt;
    const k = rt.clamp(rt.S.chargeGuide / 2.2, 0, 1);
    drawGhostPath(ctx, ghostShapePath('circle', r.width * 0.5, r.height * 0.42, Math.min(r.width, r.height) * 0.16), 'rgba(91,232,196,1)', 0.35 + 0.35 * k, 6);
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(244,236,214,' + (0.7 * k).toFixed(2) + ')';
    ctx.font = '700 15px "InkSerif", serif'; ctx.fillText('O — 참', r.width * 0.5, r.height * 0.42 + Math.min(r.width, r.height) * 0.16 + 26); ctx.restore();
  }
  /* 새 무늬 첫 혼령: 0.8초 반투명 유도 획 */
  if (rt.S.newShape && rt.S.newShape.guide > 0) {
    rt.S.newShape.guide -= rt.frameDt;
    const sp = guideSpirit();
    if (sp) {
      const p = rt.projectXZ(sp.x, sp.z, 0.9);
      const a = rt.clamp(rt.S.newShape.guide / (rt.CFG.firstShapeGuide || 0.8), 0, 1);
      drawGhostPath(ctx, ghostShapePath(rt.spiritShape(sp), p.x, p.y, Math.max(26, Math.min(r.width, r.height) * 0.075)), 'rgba(244,236,214,1)', a, 6);
    }
  }
  /* 기물 연습: 보스 등장 직후 3초, 가장 가까운 기물로 유도 획 */
  if (rt.S.totemGuide > 0) {
    rt.S.totemGuide -= rt.frameDt;
    const tt = rt.nearestTo(rt.bossMinions(), rt.S.hero);
    if (tt) {
      const p = rt.projectXZ(tt.x, tt.z, 0.9);
      const a = rt.clamp(rt.S.totemGuide / (rt.CFG.totemPractice || 3), 0, 1);
      drawGhostPath(ctx, ghostShapePath(tt.shape || 'tri', p.x, p.y, Math.max(24, Math.min(r.width, r.height) * 0.07)), 'rgba(201,166,255,1)', a, 6);
    }
  }
  /* 첫 칼 튕김: 빈틈 고리를 가리키는 화살표 */
  if (rt.S.bounceArrow > 0) {
    rt.S.bounceArrow -= rt.frameDt;
    const b = rt.S.boss;
    if (b && b.alive) {
      const p = rt.projectXZ(b.x, b.z, 0.05), k = rt.clamp(rt.S.bounceArrow / 3, 0, 1);
      const wpc = rt.worldPerCss(), rx = 2.6 * wpc, ry = rx * 0.55;
      ctx.save(); ctx.globalAlpha = 0.5 + 0.4 * k; ctx.strokeStyle = 'rgba(255,240,200,0.95)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      const ang = -Math.PI * 0.5 + Math.sin(t * 2) * 0.25;
      const ax = p.x + Math.cos(ang) * rx * 1.55, ay = p.y + Math.sin(ang) * ry * 4.0;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.lineTo(ax + Math.cos(ang + Math.PI * 0.85) * 16, ay + Math.sin(ang + Math.PI * 0.85) * 16);
      ctx.lineTo(ax + Math.cos(ang - Math.PI * 0.85) * 16, ay + Math.sin(ang - Math.PI * 0.85) * 16);
      ctx.closePath(); ctx.fillStyle = 'rgba(255,240,200,0.95)'; ctx.fill(); ctx.restore();
    }
  }
  if (!T || !T.on) return;
  /* 0~0.5초: 첫 혼령 위로 획이 흐른다 + 그 방향으로 손가락 길 안내 */
  if (!T.first) {
    const sp = guideSpirit();
    if (sp) {
      const p = rt.projectXZ(sp.x, sp.z, 0.9);
      const sh = rt.spiritShape(sp);
      drawGhostPath(ctx, ghostShapePath(sh, p.x, p.y, Math.max(30, Math.min(r.width, r.height) * 0.085)), 'rgba(244,236,214,1)', 0.8, 7);
      /* 손가락 궤적: 주인공에서 혼령으로 */
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = 'rgba(120,240,200,0.9)'; ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]); ctx.lineDashOffset = -((t * 70) % 14);
      ctx.beginPath(); ctx.moveTo(hs.x, hs.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.setLineDash([]);
      /* 길잡이 원 */
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 5);
      ctx.beginPath(); ctx.arc(hs.x, hs.y, 26, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  /* 5.0초 제자리 탭 단계: 주인공 주위 패링 링 */
  if (T.tapSpawned && !T.tapDone) {
    const R = (rt.CFG.parryR || 2.4) * rt.worldPerCss();
    ctx.save();
    ctx.strokeStyle = 'rgba(232,192,74,' + (0.45 + 0.35 * Math.sin(t * 6)).toFixed(3) + ')';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hs.x, hs.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([5, 7]); ctx.lineDashOffset = -((t * 40) % 12);
    ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hs.x, hs.y, R * 0.7, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }
}
/* ---------- §7.2·§7.3 타이틀 난이도 UI ---------- */
function renderModes() {
  const box = $('titleModes');
  if (!box) return;
  const gosu = rt.gosuUnlocked();
  const cur = rt.MODES[rt.save.mode] ? rt.save.mode : 'jeongseok';
  box.querySelectorAll('[data-mode]').forEach(function (b) { b.remove(); });
  box.innerHTML = rt.MODE_ORDER.map(function (id) {
    const m = rt.MODES[id];
    const lock = id === 'gosu' && !gosu;
    const on = id === cur && !lock;
    return '<button type="button" class="mode-btn' + (on ? ' on' : '') + (lock ? ' lock' : '') + '" data-mode="' + id + '"' + (lock ? ' disabled aria-disabled="true"' : '') + '>'
      + '<b>' + m.name + '</b><span>' + (lock ? '12장 클리어' : m.tag) + '</span></button>';
  }).join('');
  box.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      const id = b.getAttribute('data-mode');
      if (id === 'gosu' && !rt.gosuUnlocked()) { rt.toast('고수 모드는 12장을 깨면 열립니다'); return; }
      setMode(id);
      if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'hline');
    });
  });
  const note = $('titleModeNote');
  if (note) note.textContent = rt.MODE_NOTE[cur] || '';
}
function setMode(id) {
  if (!rt.MODES[id]) return rt.save.mode;
  if (id === 'gosu' && !rt.gosuUnlocked()) return rt.save.mode;
  rt.save.mode = id;
  rt.persist();
  renderModes();
  rt.refreshTitleHelp();
  return rt.save.mode;
}

/* ---------- game state ---------- */
  return { SWORD_GLOW_MAP, a11yCb, a11yShake, addSlow, bumpStreak, drawTutorial, endTutorial, haptic, markSeen, reducedMotion, renderModes, seen, setA11y, setLevelMode, setMode, startTutorial, stepTutorial, streakOf, syncA11yUi, syncHeroWeaponCosmetic, tickTutorial, tutorialFirstSuccess };
}
