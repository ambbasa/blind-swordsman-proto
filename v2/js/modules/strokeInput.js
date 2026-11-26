/* v2/js/modules/strokeInput.js — 심안: 묵검 v1.26 잉크 드로잉·제스처 인식·선입력 버퍼 */

export function createStrokeInput(rt) {
  const $ = rt.$;
/* ---------- ink + input ---------- */
function resizeInk() {
  const c = $('ink'), r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(1, Math.floor(r.width * dpr));
  c.height = Math.max(1, Math.floor(r.height * dpr));
  c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function hexRgba(hex, a) {
  const h = String(hex || '#ffffff').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0, g = parseInt(h.slice(2, 4), 16) || 0, b = parseInt(h.slice(4, 6), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function paperRgba(a) {
  const pal = (rt.art && rt.art.pal) || {};
  const hex = (pal.paper || pal.paperRim || '#EDE3CF').replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function clearInk() {
  rt.lastStroke = null;
  rt.inkFade = 0;
  const c = $('ink');
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.restore();
}
function paintInk(pts, fading, color) {
  const c = $('ink');
  if (!c) return;
  const host = $('app') || c;
  const r = host.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.floor(r.width * dpr) || c.height !== Math.floor(r.height * dpr)) {
    c.width = Math.max(1, Math.floor(r.width * dpr));
    c.height = Math.max(1, Math.floor(r.height * dpr));
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!pts || pts.length < 2) return;
  const a = fading != null ? fading : 1;
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[i === 0 ? i + 1 : i - 1];
    const dx = p.x - q.x, dy = p.y - q.y, L = Math.hypot(dx, dy) || 1;
    const tt = i / (pts.length - 1);
    const w = (1.3 + 4.4 * Math.sin(Math.PI * tt)) * (0.72 + 0.28 * a);
    left.push({ x: p.x + -dy / L * w, y: p.y + dx / L * w });
    right.push({ x: p.x - -dy / L * w, y: p.y - dx / L * w });
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  /* v0.41: 획 자체도 '먹 붓 자국' — 바탕은 먹, 둘레는 한지 단면, 결은 붓털 텍스처. */
  ctx.fillStyle = color ? hexRgba(color, 0.62 * a) : 'rgba(20,17,16,' + (0.58 * a).toFixed(3) + ')';
  ctx.fill();
  /* v0.41: 획을 '한지 붓 자국'으로 — 붓털·금박 텍스처를 폴리곤에 채우고 크림 단면을 두른다. */
  if (rt.brushTex.ink) {
    try {
      const b = paintInk._box || (paintInk._box = {});
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < left.length; i++) {
        x0 = Math.min(x0, left[i].x, right[i].x); x1 = Math.max(x1, left[i].x, right[i].x);
        y0 = Math.min(y0, left[i].y, right[i].y); y1 = Math.max(y1, left[i].y, right[i].y);
      }
      const pat = paintInk._pat || (paintInk._pat = ctx.createPattern(rt.brushTex.ink, 'repeat'));
      if (pat) {
        if (pat.setTransform) { try { pat.setTransform(new DOMMatrix([0.5, 0, 0, 0.42, (x0 * 0.7) % 64, (y0 + (paintInk._t = (paintInk._t || 0) + 9)) % 64])); } catch (e) {} }
        ctx.save();
        ctx.globalAlpha = 0.62 * a;
        ctx.fillStyle = pat;
        ctx.fill();
        ctx.restore();
      }
      /* 다이컷 종이 단면: 바깥쪽 옅은 크림 테 */
      ctx.save();
      ctx.globalAlpha = 0.42 * a;
      ctx.strokeStyle = paperRgba(0.9);
      ctx.lineWidth = 1.1;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    } catch (e) {}
  }
  const dab = rt.brushTex.splat || paintInk._dab;
  const dabIsSheet = dab === rt.brushTex.splat;
  const dabW = dabIsSheet ? dab.width / 6 : 0;
  if (dab && dab.complete !== false) {
    let acc = 0, prev = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      acc += Math.hypot(p.x - prev.x, p.y - prev.y);
      if (acc >= 4) {
        const s = 7 + (i % 3);
        ctx.globalAlpha = 0.55 * a;
        if (dabIsSheet) {
          /* v0.41: 획 꼬리마다 잉크 흩날림 프레임을 찍는다(프레임은 위치로 고른다). */
          const fi = (i + (paintInk._n = (paintInk._n || 0) + 1)) % 6;
          ctx.drawImage(dab, fi * dabW, 0, dabW, dabW, p.x - s * 0.9, p.y - s * 0.9, s * 1.8, s * 1.8);
        } else {
          ctx.drawImage(dab, p.x - s / 2, p.y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
        acc = 0;
      }
      prev = p;
    }
  }
}
function localPts(e) {
  const r = $('ink').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
/* HUD 잠금(drawing-active): 제스처 획이 실제로 판정되는 동안에만 #hud/#quickCards를 어둡게 하고 터치를 잠근다.
   예전에는 #app pointerdown마다 잠겨서, 이동 드래그 중에도 HUD가 72%로 흐려지고 둘째 손가락의 일시정지·빠른 카드가 막혔다.
   이제 game.js가 획 인식 결과(type/조준 대상)가 난 순간에만 켜고, 손을 떼거나 획이 사라지면 바로 푼다. */
let _hudLock = false;
function setDrawingActive(on) {
  on = !!on;
  if (on === _hudLock) return;
  _hudLock = on;
  try { document.body.classList.toggle('drawing-active', on); } catch (e) {}
}
function onDown(e) {
  if (rt.pointers.down) return;
  if (e.target.closest && e.target.closest('.ov.show, .btn, #hudBtns button')) return;
  /* §5.2 멈추지 않는 선택: 화면 아래 22%의 탭은 카드 고르기 — 패링과 겹치지 않게 비워 둔다. */
  if (rt.S && rt.S.quick) {
    const p = localPts(e);
    if (p.y >= rt.viewBox().height * (1 - (rt.CFG.quick.zone || 0.22))) return;
  }
  rt.pointers.down = true; rt.pointers.id = e.pointerId; rt.pointers.pts = [localPts(e)];
  setDrawingActive(false);
  try { $('app').setPointerCapture(e.pointerId); } catch (err) {}
  paintInk(rt.pointers.pts, 1);
}
function onMove(e) {
  if (!rt.pointers.down || e.pointerId !== rt.pointers.id) return;
  const p = localPts(e), last = rt.pointers.pts[rt.pointers.pts.length - 1];
  if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1) rt.pointers.pts.push(p);
  const chipped = rt.pointers._chip && rt.pointers._chip.color;
  paintInk(rt.pointers.pts, 1, chipped);
  if (rt.S && rt.S.playing && !rt.S.paused && rt.pointers.pts.length >= 3 && rt.G && rt.G.recognize) {
    const rec = rt.G.recognize(rt.pointers.pts, { allowBolt: true });
    const res = resolveStrokeType(rec, rt.pointers.pts);
    const type = res.type;
    let aim = null, to = null;
    if (type && type !== 'tap' && type !== 'circle') {
      const dir = AUTO_TARGET[type] ? null : rt.strokeAimDir(rt.pointers.pts, type);
      if (rt.S.sandbox || !rt.S.pool || rt.S.pool.indexOf(type) >= 0) aim = rt.pickSpirits(type, 1, rt.S.hero, dir, null)[0] || null;
      if (aim && (rt.now() - (rt.pointers._prevT || 0) > 12)) {
        rt.pointers._prevT = rt.now();
        const end = rt.dashEndPoint(rt.S.hero, aim);
        to = { x: end.x, z: end.z };
      }
    }
    rt.S.aimTarget = aim;
    const color = rt.inkColorFor(type);
    rt.pointers._chip = { x: p.x, y: p.y, type: type, conf: rec.bestScore || 0, color: color, hint: type ? '' : ambiguousHint(rec) };
    rt.S.preview = {
      show: !!to, to: to,
      chip: rt.pointers._chip
    };
    paintInk(rt.pointers.pts, 1, color);
    rt.updateMarks();
    /* HUD 잠금은 '지금 쓸 수 있는 제스처 획'이 판정된 때만 켠다.
       - tap(짧은 탭 = 칼잡 패링)은 손을 때며 바로 끝나므로 잠그지 않는다.
       - 아직 배우지 않은 무늬(획은 인식됐지만 pool에 없음)도 잠그지 않는다.
       - 혼령/기물 조준(to)이 걸리면 항상 잠근다. */
    const usable = !!type && type !== 'tap' && (rt.S.sandbox || !rt.S.pool || rt.S.pool.indexOf(type) >= 0);
    setDrawingActive(usable || !!to);
  } else {
    setDrawingActive(false);
  }
}
function onUp(e) {
  if (!rt.pointers.down || (e.pointerId != null && e.pointerId !== rt.pointers.id)) return;
  rt.pointers.down = false;
  const pts = rt.pointers.pts;
  rt.pointers._chip = null;
  setDrawingActive(false);
  if (rt.S) { rt.S.preview = null; rt.S.aimTarget = null; }
  finishStroke(pts);
}
/* 모호한(45°) 직선은 조준으로 확정한다: 획 방향 콘 안 혼령의 hline/vline 분포를 따름. */
function resolveTieAxis(dir) {
  if (!rt.S) return null;
  const n = { hline: 0, vline: 0 };
  const hs = rt.heroScreen();
  rt.livingMarks().forEach(function (s) {
    const sh = rt.spiritShape(s);
    if (sh !== 'hline' && sh !== 'vline') return;
    if (dir) {
      const va = rt.projectXZ(s.x, s.z, 0.8);
      const da = Math.hypot(va.x - hs.x, va.y - hs.y) || 1;
      const cos = ((va.x - hs.x) / da) * dir.x + ((va.y - hs.y) / da) * dir.y;
      if (cos < (rt.CFG.aimConeCos || 0.5)) return;
    }
    n[sh]++;
  });
  if (!n.hline && !n.vline) return null;
  if (n.hline === n.vline) return rt.S.lastAxis || 'vline';
  return n.hline > n.vline ? 'hline' : 'vline';
}
function resolveStrokeType(rec, pts) {
  if (!rec) return { type: null, rec: rec };
  if (rec.tie) {
    const dir = rt.strokeScreenDir(pts);
    const a = resolveTieAxis(dir);
    if (a) return { type: a, rec: rec, tieResolved: true };
    return { type: rt.S.lastAxis || 'vline', rec: rec, tieResolved: true };
  }
  if (rec.type) return { type: rec.type, rec: rec };
  return { type: null, rec: rec };
}
function ambiguousHint(rec) {
  if (!rec) return '';
  const k = rec.best;
  if (k && (rec.bestScore || 0) >= 0.30) return (rt.G.NAMES[k] || '') + '? 더 크게';
  return '획이 짧아요';
}
/* 방향 무시 자동 추격기: V·⚡ */
const AUTO_TARGET = { vee: 1, bolt: 1 };
function finishStroke(pts, opts) {
  opts = opts || {};
  rt.lastStroke = (pts || []).slice(); rt.inkFade = 0.28;
  paintInk(rt.lastStroke, 1);
  if (!rt.S || !rt.S.playing || rt.S.paused) return null;
  const rec = rt.G.recognize(pts, { allowBolt: true, seal: !!(rt.S && rt.S.boss && rt.S.boss.state === "seal"), totem: !!(rt.S && rt.S.boss && rt.S.boss.alive && rt.bossMinions().length) });
  rt.S.lastRec = rec;
  /* §13 데이터: 획 하나하나의 의도/결과/점수/2등 점수/길이/실패 이유 — 인식 튜닝의 원자료다. */
  rt.telemetry.event('stroke', {
    want: (rt.S.aimTarget && rt.S.aimTarget.alive) ? rt.spiritShape(rt.S.aimTarget) : null,
    got: rec.type || null, best: rec.best || null, score: +(rec.bestScore || 0).toFixed(2),
    second: rt.secondScore(rec), len: Math.round(rt.G.pathLen(pts)), why: rec.reason || null
  });
  rt.S.aimTarget = null;
  rt.S.preview = null;
  const read = (rt.G.readMessage && rt.G.readMessage(rec)) || '';
  rec.readMessage = read;
  if (rt.S.boss && rt.S.boss.alive && rt.S.boss.state === 'seal') {
    if (rec.type === 'star') rec.seal = rt.sealStroke();
    else rt.toast('획이 교차하는 한붓별(⛤)을 그려 봉인하세요');
    return rec;
  }
  /* 제자리 탭 = 칼집 패링 (인식기는 이미 tap을 읽는다) */
  if (rec.type === 'tap' || opts.tap) return rt.doParry(rec);
  /* v0.26 보스 패턴: 은신 중에는 무늬와 상관없이 획의 방향만 본다. */
  /* 기물 무늬는 은신·영창 중에도 그 기물로 일섬한다(피할 곳은 늘 열려 있어야 한다). */
  const totemStroke = rt.TOTEM_SHAPES.indexOf(rec.type) >= 0;
  if (!totemStroke && rt.veilStroke(pts)) { rec.veil = true; return rec; }
  let res = resolveStrokeType(rec, pts);
  /* v0.97 모바일 한손 엄지 빠른 플릭 보정: 짧지만 곧은 스와이프(26px 이상, 직진도 0.80+)는 가로/세로선으로 구제 */
  if (!res.type && rt.IS_MOBILE && pts && pts.length >= 2 && rt.G && rt.G.pathLen && rt.G.straightness) {
    const fl = rt.G.pathLen(pts);
    if (fl >= 26 && rt.G.straightness(pts) >= 0.80) {
      const dx = Math.abs(pts[pts.length - 1].x - pts[0].x);
      const dy = Math.abs(pts[pts.length - 1].y - pts[0].y);
      const flickType = dx >= dy ? 'hline' : 'vline';
      res = { type: flickType, rec: rec, flickRecovered: true };
    }
  }
  if (!res.type) {
    rt.inkFade = 0.16;
    rt.toast((read ? read + ' ' : '잘 안 그려졌어요. ') + rt.failHint());
    setTimeout(clearInk, rt.qa.noDelay ? 80 : 160);
    return rec;
  }
  if (res.type !== rec.type) {
    rec.type = res.type;
    rec.label = (rt.G.LABELS && rt.G.LABELS[res.type]) || rec.label;
    rec.tieResolved = true;
  }
  /* v0.34 §6.2 9장 부목표: 한 무늬 구간에 다른 무늬를 그리면 목표 실패 */
  if (rt.goalOnStroke(rec.type)) { rec.goalFail = true; return rec; }
  /* v0.32 §4.4 8장 「합 겨루기」: 1.2초 안에 뜬 무늬를 그리면 한 합을 받아친다. */
  if (rt.S.boss && rt.S.boss.alive && rt.S.boss.state === 'clash' && !totemStroke && rt.clashStroke(rec.type)) { rec.clash = true; return rec; }
  /* 영창 중에는 무늬 획이 영창을 끊는 데 쓰인다. */
  if (rec.type !== 'circle' && !totemStroke && rt.chantStroke(rec.type)) { rec.chant = true; return rec; }
  /* O = 전 화면 참(斬) 필살기 */
  if (rec.type === 'circle') { rec.cleave = true; return rt.castCleave(rec); }
  const activeAnchorStroke = (rt.S.spirits || []).some(function (m) {
    return m && m.alive && (m.orbitSlot != null || m.zoneTag) && (m.shape === rec.type || rt.spiritShape(m) === rec.type);
  });
  if (!rt.S.sandbox && !activeAnchorStroke && rt.S.pool && rt.S.pool.indexOf(rec.type) < 0 && rt.TOTEM_SHAPES.indexOf(rec.type) < 0) {
    rt.toast((read ? read + ' ' : '') + '지금은 ' + rt.failHint());
    rt.inkFade = 0.16;
    setTimeout(clearInk, rt.qa.noDelay ? 80 : 160);
    return rec;
  }
  /* 스마트 타겟팅 이원화: 직선은 그은 방향, V/⚡는 위협도순 자동 */
  const dir = AUTO_TARGET[rec.type] ? null : rt.strokeAimDir(pts, rec.type);
  if (rec.type === 'hline' || rec.type === 'vline') rt.S.lastAxis = rec.type;
  rt.S.lastStrokeDir = dir;
  rec.dir = dir;
  rec.combo = rt.S.combo;
  /* 칼날 소리의 높이: 화면에서 그린 획 길이를 0~1로 옮긴다(80px~280px). */
  rt.S.strokeLenRatio = rt.clamp((rt.G.pathLen(pts) - 80) / 200, 0, 1);
  /* 선입력 버퍼: 돌진·비틀거림 중에 들어온 획은 버리지 않고 2칸 FIFO 큐에 예약한다. */
  const tInput = rt.now();
  const stumbling = !!(rt.S.terrain && rt.S.terrain.stumbleT > 0);
  if (rt.S.dash || (rt.S.dashQueue && rt.S.dashQueue.length) || stumbling) {
    const qres = rt.enqueueInputBuf({
      type: rec.type, dir: dir, t0: tInput,
      ttl: (stumbling ? 550 : Math.max(450, rt.CFG.inputBufMs || 200)) + Math.round((rt.swordFx(rt.save).chainGrace || 0) * 1000),
      quality: (rec.q != null ? rec.q : rec.bestScore)
    });
    rt.inkFade = 0.20;
    rt.haptic(10);
    rt.showJudge(stumbling ? '비틀 — 다음 획' : (qres.size >= 3 ? '3연속 예약!' : (qres.size >= 2 ? '2연속 예약' : '예약')));
    rec.buffered = true;
    rec.queueSize = qres.size;
    rec.targets = [];
    return rec;
  }
  /* §4.2 빈틈 선입력: 걷는 보스의 빈틈이 0.5초 안에 열리면, 튕길 획을 버리지 않고 그 순간 자동으로 낸다. */
  if (bufferGapStroke(rec, dir)) { rec.gapBuffered = true; return rec; }
  const dash = rt.beginDash(rec.type, { dir: dir, quality: (rec.q != null ? rec.q : rec.bestScore), tInput: tInput });
  rec.targets = dash && dash.targets;
  rec.dash = dash;
  /* §8.1 튜토리얼 첫 성공: 0.05초 히트스톱 + 칼소리 + "일섬!" */
  if (dash && rt.S.tutorial) rt.tutorialFirstSuccess();
  return rec;
}
/* §4.2: 빈틈이 0.5초 안에 열리는 순간에 그은 획은 선입력으로 잡아 둔다 — 튕기고 다시 긋는 일을 줄인다. */
function bufferGapStroke(rec, dir) {
  const b = rt.S && rt.S.boss;
  if (!b || !b.alive || b.state !== 'walk' || b.firstWalk) return false;
  if (rec.type !== (b.seq && b.seq[b.seqI])) return false;
  const g = rt.gapInfo(b);
  if (g.open || g.readyIn > (rt.CFG.gapBufWait || 0.5)) return false;
  rt.S.gapBuf = { type: rec.type, dir: dir, quality: (rec.q != null ? rec.q : rec.bestScore), t0: rt.now() };
  rt.inkFade = 0.20;
  rt.showJudge('빈틈 준비');
  rec.buffered = true;
  rec.targets = [];
  return true;
}
function stepGapBuffer() {
  if (!rt.S || !rt.S.gapBuf) return;
  const b = rt.S.boss;
  const age = rt.now() - rt.S.gapBuf.t0;
  if (!b || !b.alive || b.state !== 'walk' || age > (rt.CFG.gapBufWait || 0.5) * 1000 + 150) { rt.S.gapBuf = null; return; }
  if (!rt.gapInfo(b).open) return;
  const q = rt.S.gapBuf;
  rt.S.gapBuf = null;
  if (rt.S.dash || (rt.S.dashQueue && rt.S.dashQueue.length)) return;
  /* 빈틈을 노리고 그은 획은 그 방향(조준 콘)과 상관없이 보스에게 난다 — 그것이 이 획의 의도다. */
  const rec = rt.dashAtBoss(b, q.type);
  if (rec) { rec.quality = q.quality; rt.S.dashQuality = q.quality; }
  rt.showJudge('빈틈!');
}
function syntheticPath(type, x, y, s) {
  s = s || 70;
  function line(x1, y1, x2, y2, n) {
    const p = []; n = n || 24;
    for (let i = 0; i < n; i++) { const t = i / (n - 1); p.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }); }
    return p;
  }
  if (type === 'star' || type === 'circle') {
    const count = type === 'star' ? 5 : 40;
    const turn = type === 'star' ? 2 : 1;
    return Array.from({ length: count + 1 }, (_, i) => {
      const angle = i * turn * Math.PI * 2 / count;
      return { x: x + s * Math.sin(angle), y: y - s * Math.cos(angle) };
    });
  }
  if (type === 'vline') return line(x, y - s, x, y + s);
  if (type === 'tri') return line(x, y - s, x + s, y + s * 0.7, 14).concat(line(x + s, y + s * 0.7, x - s, y + s * 0.7, 14).slice(1), line(x - s, y + s * 0.7, x, y - s * 0.95, 14).slice(1));
  if (type === 'arc') { const p = []; for (let i = 0; i <= 30; i++) { const a = Math.PI * i / 30; p.push({ x: x - Math.cos(a) * s, y: y + Math.sin(a) * s * 0.8 }); } return p; }
  if (type === 'spiral') { const p = []; for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * Math.PI * 4.2, rr = s * (0.12 + 0.8 * t); p.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr }); } return p; }
  if (type === 'square') return line(x - s, y - s, x + s, y - s, 12).concat(line(x + s, y - s, x + s, y + s, 12).slice(1), line(x + s, y + s, x - s, y + s, 12).slice(1), line(x - s, y + s, x - s, y - s, 12).slice(1));
  if (type === 'hline') return line(x - s, y, x + s, y);
  if (type === 'vee') return line(x - s, y - s * 0.7, x, y + s * 0.8, 16).concat(line(x, y + s * 0.8, x + s, y - s * 0.7, 16).slice(1));
  if (type === 'bolt') {
    return line(x + s * 0.35, y - s, x - s * 0.35, y - s * 0.15, 10)
      .concat(line(x - s * 0.35, y - s * 0.15, x + s * 0.35, y + s * 0.15, 10).slice(1),
              line(x + s * 0.35, y + s * 0.15, x - s * 0.35, y + s, 10).slice(1));
  }
  return [];
}
function strokeType(type, opts) {
  const r = $('ink').getBoundingClientRect();
  const pts = syntheticPath(type, r.width * 0.5, r.height * 0.32, Math.min(80, r.width * 0.22));
  return finishStroke(pts, opts);
}

function idleCoins(ms) {
  return rt.computeIdleCoins(ms, rt.save, rt.CFG);
}
function checkIdle() {
  const c = idleCoins(Date.now() - (rt.save.lastSeen || Date.now()));
  if (c <= 0) return 0;
  rt.idlePending = c;
  $('idleBody').textContent = '자리를 비운 동안 엽전 ' + c + '이 쌓였습니다.';
  const adNote = $('idleAdNote');
  if (adNote) adNote.textContent = rt.getIdleNotice(rt.CFG);
  rt.showOv('ov-idle');
  return c;
}
function collectIdle(double) {
  let n = rt.idlePending; if (!n) return 0;
  if (double) n *= 2;
  rt.save.coins += n; rt.idlePending = 0; rt.persist();
  rt.telemetry.event('income', { source: 'idle', coins: n });
  rt.hideOvs(); rt.showOv('ov-title'); rt.renderHud();
  return n;
}
function syncLobbyStatus() {
  if ($('lobbyCoins')) $('lobbyCoins').textContent = (rt.save.coins || 0).toLocaleString();
  if ($('lobbyInk')) $('lobbyInk').textContent = rt.save.ink || 0;
  if ($('lobbyPower')) $('lobbyPower').textContent = '전투력 ' + rt.computeCombatPower(rt.save);
}
const LOBBY_HERO_ART = {
  ink: 'assets/hero/lobby_hero_latest.webp?v=v151',
  snow_sage: 'assets/hero/lobby_hero_latest.webp?v=v151',
  crimson_guard: 'assets/hero/lobby_hero_latest.webp?v=v151',
  gilded_eclipse: 'assets/hero/lobby_hero_latest.webp?v=v151'
};
function syncLobbyHeroVisual() {
  const cloak = rt.cloakOf(rt.save);
  const cid = (cloak && cloak.id) || 'ink';
  const stage = $('lobbyHeroStage');
  if (stage) stage.dataset.cloak = cid;
  const img = $('lobbyHeroImg');
  const nextSrc = LOBBY_HERO_ART[cid] || LOBBY_HERO_ART.ink;
  if (img && img.getAttribute('src') !== nextSrc) {
    img.src = nextSrc;
  }
}
function ensureLobbyHero3D() {
  syncLobbyHeroVisual();
  if (!rt.three || !rt.three.scene || !rt.art) return;
  const onTitle = $('ov-title') && $('ov-title').classList.contains('show');
  if (rt.three.heroSpr && (onTitle || !rt.S || !rt.S.playing)) {
    rt.three.heroSpr.visible = false;
  }
  syncHeroCosmetic3D();
}
function syncHeroCosmetic3D() {
  syncLobbyHeroVisual();
  if (!rt.three || !rt.three.heroSpr) return;
  try { rt.applyHeroCloak3D(rt.three.heroSpr, rt.cloakOf(rt.save), rt.swordForgeLv(rt.save)); } catch (e) {}
}
function statUnlocked(def) {
  return !def.unlockStage || ((rt.save.stage || 1) >= def.unlockStage) || Object.keys(rt.save.stars || {}).some(function (k) { return (+k >= def.unlockStage - 1) && (rt.save.stars[k] > 0); });
}
function pickAffordableStatUpgrade() {
  const order = ['atk', 'hp', 'gap', 'poise', 'coin'];
  let best = null;
  for (let i = 0; i < order.length; i++) {
    const def = rt.STAT_DEFS.filter(function (d) { return d.id === order[i]; })[0];
    if (!def || !statUnlocked(def)) continue;
    const lv = rt.save[def.key] || 0;
    if (lv >= def.maxLv) continue;
    const cost = rt.statUpgradeCost(lv, rt.CFG);
    if ((rt.save.coins || 0) >= cost && (!best || cost < best.cost)) {
      best = { id: def.id, name: def.name, lv: lv, cost: cost };
    }
  }
  return best;
}
function refreshShop() {
  rt.renderShopOverview({
    save: rt.save,
    cfg: rt.CFG,
    curStage: (rt.S && rt.S.stageNo) || rt.save.stage || 1,
    statUnlocked: statUnlocked,
    atkBonus: rt.atkBonus,
    gapBonus: rt.gapBonus,
    poiseBonus: rt.poiseBonus,
    elById: $,
    renderTab: rt.renderShopTab
  });
}
function buy(stat) {
  const def = rt.STAT_DEFS.filter(function (d) { return d.id === stat; })[0];
  if (def && !statUnlocked(def)) { rt.toast(def.unlockStage + '장에 도달하면 열립니다'); return false; }
  const res = rt.purchaseStatUpgrade(rt.save, stat, rt.CFG);
  if (!res.ok) return false;
  rt.persist(); refreshShop(); rt.renderHud();
  return true;
}
function doResetStats() {
  const res = rt.resetAllStats(rt.save, rt.CFG);
  if (!res.ok) { rt.toast('초기화할 기량이 없습니다'); return false; }
  rt.persist(); refreshShop(); rt.renderHud();
  rt.toast('기량 초기화 완료 — ' + res.refund + '엽전 전액 환불');
  rt.telemetry.event('stat_reset', { refund: res.refund });
  return true;
}

/* ---------- v0.34 §10 도전 모드 ----------
   무한 심연: 끝없는 웨이브 + 179초마다 보스. 보스 러시: 열두 보스 연속(체력 유지). 무늬 시련: 1~2종만. */
  return { buy, checkIdle, clearInk, collectIdle, doResetStats, ensureLobbyHero3D, finishStroke, idleCoins, onDown, onMove, onUp, paintInk, pickAffordableStatUpgrade, refreshShop, resizeInk, resolveTieAxis, setDrawingActive, stepGapBuffer, strokeType, syncHeroCosmetic3D, syncLobbyStatus, syntheticPath };
}
