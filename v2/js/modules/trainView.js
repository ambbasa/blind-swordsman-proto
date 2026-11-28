/* v2/js/modules/trainView.js — 심안: 묵검 v1.24 무늬 수련장 · 기믹/패링 훈련 컨트롤러 모듈 */

import {
  GIMMICK_DRILLS,
  getDrillDef,
  createDrillState,
  resetDrillRound,
  stepDrill,
  handleDrillInput,
  drawDrillCanvas
} from './trainingDrills.js?v=v182';

export const TRAIN_SHAPES = Object.freeze(['hline', 'vline', 'vee', 'bolt', 'circle', 'square', 'tri', 'spiral', 'star', 'tap']);

export const SHAPE_LABEL = Object.freeze({
  hline: '—', vline: 'ㅣ', vee: 'V', bolt: 'Z', circle: 'O',
  star: '⛤', square: 'ㅁ', tri: '△', arc: '◡', spiral: '@', tap: '•'
});

export const SHAPE_TIP = Object.freeze({
  hline: '[횡참 · 폭 ×1.4] 가로로 곧게 화면 폭의 절반쯤 그어 넓게 베세요.',
  vline: '[직선 관통 · 사거리 +28% · 감쇠 0] 위에서 아래로 일직선으로 꿰뚫으세요.',
  vee: '[도약 찍기 · 착지 광역 피해] 내려갔다 뾰족하게 올려 충격파를 터뜨리세요.',
  bolt: '[뇌전 연쇄 · 주변 2체 전격] 세 마디 지그재그로 연쇄 번개를 일으키세요.',
  circle: '한 바퀴 크게, 시계 방향이든 반대로든 상관없습니다.',
  square: '네 모서리를 각지게. 모서리를 둥글리면 원으로 읽힙니다.',
  tri: '세 변을 한 번에. 마지막 변을 짧게 끝내세요.',
  arc: '반달을 옆으로 눕힌 모양. 위로 볼록하게.',
  spiral: '안에서 밖으로 말아 올리며 두 바퀴.',
  star: '한붓으로 다섯 꼭짓점을 교차해 별(⛤)을 그립니다.',
  tap: '제자리에서 짧게 콕 — 패링입니다.'
});

export function trainStatsOfSave(save, shape) {
  const arr = (save && save.train && save.train.stats && save.train.stats[shape]) || [];
  const last = arr.slice(-20);
  const hit = last.filter(function (v) { return v; }).length;
  return { n: last.length, hit: hit, rate: last.length ? hit / last.length : 0 };
}

export function createTrainController(deps) {
  const {
    elById,
    getSave,
    persist,
    getG,
    titleChip,
    syntheticPath,
    brushOf,
    showOv,
    hideOvs,
    getAudio,
    haptic,
    telemetry
  } = deps;

  const train = {
    shape: 'hline', pts: [], drawing: false, raf: 0,
    result: null, animT: 0, need: 0, parryMode: false,
    drill: createDrillState('parry')
  };

  function renderTrainDrills() {
    const box = elById('trainDrills');
    if (!box) return;
    box.innerHTML = GIMMICK_DRILLS.map(function (d) {
      return '<button type="button" data-drill="' + d.id + '" class="' + (train.drill.kind === d.id ? 'on' : '') + '">' + d.name + '</button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        const k = b.getAttribute('data-drill');
        train.drill = createDrillState(k);
        renderTrainDrills();
        const noteEl = elById('trainNote');
        if (noteEl) noteEl.textContent = getDrillDef(k).tip;
      });
    });
  }

  function renderTrainShapes() {
    const box = elById('trainShapes');
    if (!box) return;
    const save = getSave();
    const G = getG();
    box.innerHTML = TRAIN_SHAPES.map(function (sh) {
      const st = trainStatsOfSave(save, sh);
      const label = (G && G.NAMES && G.NAMES[sh]) || SHAPE_LABEL[sh] || sh;
      return '<button type="button" data-shape="' + sh + '" class="' + (sh === train.shape ? 'on' : '') + '" aria-label="' + label + ' (' + (SHAPE_LABEL[sh] || sh) + ')" title="' + label + ' · ' + (st.n ? Math.round(st.rate * 100) + '%' : '—') + '">' + titleChip(sh) + '</button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        train.shape = b.getAttribute('data-shape');
        train.pts = [];
        train.result = null;
        renderTrainShapes();
      });
    });
    const noteEl = elById('trainNote');
    if (noteEl && SHAPE_TIP[train.shape]) noteEl.textContent = SHAPE_TIP[train.shape];
    const st = trainStatsOfSave(save, train.shape);
    const el = elById('trainStats');
    if (el) {
      const last = train.result ? train.result.text + ' · ' : '';
      el.textContent = last + '최근 ' + st.n + '회 중 ' + st.hit + '회 성공';
    }
    train.need = st.n >= 3 && st.rate < 0.8 && !train.result?.ok ? 1 : 0;
  }

  function trainDraw() {
    const cv = elById('trainCanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.62);
    bg.addColorStop(0, 'rgba(24,22,26,1)');
    bg.addColorStop(1, 'rgba(9,8,11,1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (train.parryMode) {
      const nowMs = performance.now();
      const drillDt = train._lastMs ? Math.min(0.05, Math.max(0.004, (nowMs - train._lastMs) / 1000)) : 0.016;
      train._lastMs = nowMs;
      stepDrill(train.drill, drillDt);
      drawDrillCanvas(ctx, W, H, train.drill);
      if (train.drillDrag && train.pts && train.pts.length > 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(136,245,212,0.88)';
        ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let ti = 0; ti < train.pts.length; ti++) {
          const tp = train.pts[ti];
          if (ti === 0) ctx.moveTo(tp.x, tp.y); else ctx.lineTo(tp.x, tp.y);
        }
        ctx.stroke();
        ctx.restore();
      }
      const stEl = elById('trainStats');
      if (stEl) {
        const def = getDrillDef(train.drill.kind);
        const feedback = train.drill.msg || def.name;
        const text = feedback + ' · 최고 기록 ' + train.drill.best + '회';
        if (stEl.textContent !== text) stEl.textContent = text;
      }
      return;
    }

    const ghost = syntheticPath(train.shape, W * 0.5, H * 0.5, Math.min(70, W * 0.26));
    if (ghost && ghost.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(239,228,204,0.16)';
      ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ghost.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.stroke();
      ctx.restore();
    }
    if (train.need && ghost && ghost.length) {
      const k = (train.animT % 2.2) / 1.8;
      if (k <= 1) {
        const i = Math.min(ghost.length - 1, Math.floor(k * (ghost.length - 1)));
        const p = ghost[i];
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,192,74,0.85)'; ctx.fill();
      }
    }
    if (train.pts.length) {
      const bs = brushOf(getSave());
      ctx.strokeStyle = 'rgba(' + bs.color + ',0.9)';
      ctx.lineWidth = 7 * (bs.width || 1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      train.pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.stroke();
    }
    if (train.result) {
      ctx.save();
      ctx.font = '700 15px "InkSerif", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = train.result.ok ? 'rgba(46,230,166,0.95)' : 'rgba(232,120,90,0.95)';
      ctx.fillText(train.result.text, W / 2, H - 10);
      ctx.restore();
    }
  }

  function trainLoop(ts) {
    train.animT = (ts || 0) / 1000;
    trainDraw();
    train.raf = requestAnimationFrame(trainLoop);
  }

  function openTrain() {
    showOv('ov-train');
    train.pts = [];
    train.result = null;
    renderTrainShapes();
    if (!train.raf) train.raf = requestAnimationFrame(trainLoop);
    telemetry.event('train_open', { shape: train.shape });
  }

  function closeTrain() {
    if (train.raf) cancelAnimationFrame(train.raf);
    train.raf = 0;
    hideOvs();
    showOv('ov-title');
  }

  function trainPoint(e) {
    const cv = elById('trainCanvas');
    if (!cv) return { x: 0, y: 0 };
    const r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * cv.width / Math.max(1, r.width),
      y: (e.clientY - r.top) * cv.height / Math.max(1, r.height)
    };
  }

  function trainFinish() {
    if (!train.pts.length) return;
    const G = getG();
    const save = getSave();
    const rec = G.recognize(train.pts, { allowBolt: true, seal: train.shape === 'star', totem: ['tri', 'square', 'spiral'].includes(train.shape) });
    const ok = rec.type === train.shape;
    save.train = save.train || { stats: {}, seen: 0 };
    save.train.stats[train.shape] = (save.train.stats[train.shape] || []).concat([ok ? 1 : 0]).slice(-20);
    save.train.seen = (save.train.seen || 0) + 1;
    persist();
    train.result = { ok: ok, text: ok ? ('맞았습니다: ' + SHAPE_LABEL[train.shape]) : ('읽힌 무늬: ' + (SHAPE_LABEL[rec.type] || rec.type || '?')) };
    renderTrainShapes();
    telemetry.event('train_stroke', { shape: train.shape, got: rec.type || null, ok: ok, score: +(rec.bestScore || 0).toFixed(2) });
  }

  function wireTrain() {
    const cv = elById('trainCanvas');
    if (!cv) return;
    const btnParry = elById('btnTrainParry');
    // Mobile browsers can suppress the compatibility click immediately after a canvas stroke.
    // Complete a stationary single-finger footer tap here, leaving scrolling and keyboard clicks alone.
    const footer = btnParry?.closest('.train-foot');
    if (footer) {
      let tap = null;
      footer.addEventListener('touchstart', e => {
        const button = e.target.closest('button');
        const t = e.touches[0];
        tap = button && e.touches.length === 1 ? { button, x: t.clientX, y: t.clientY } : null;
      }, { passive: true });
      footer.addEventListener('touchmove', e => {
        const t = e.touches[0];
        if (tap && Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 10) tap = null;
      }, { passive: true });
      footer.addEventListener('touchcancel', () => { tap = null; });
      footer.addEventListener('touchend', e => {
        const start = tap, t = e.changedTouches[0];
        tap = null;
        if (!start || !e.cancelable || e.touches.length || start.button.disabled) return;
        if (!start.button.contains(document.elementFromPoint(t.clientX, t.clientY))) return;
        e.preventDefault();
        start.button.click();
      }, { passive: false });
    }
    if (btnParry) btnParry.addEventListener('click', function () {
      train.parryMode = !train.parryMode;
      resetDrillRound(train.drill);
      train.drill.msg = '';
      btnParry.textContent = train.parryMode ? '무늬 연습으로' : '기믹·패링 훈련';
      const noteEl = elById('trainNote');
      if (noteEl) noteEl.textContent = train.parryMode ? getDrillDef(train.drill.kind).tip : (SHAPE_TIP[train.shape] || '');
      if (elById('trainShapes')) elById('trainShapes').style.display = train.parryMode ? 'none' : '';
      if (elById('trainDrills')) {
        elById('trainDrills').hidden = !train.parryMode;
        if (train.parryMode) renderTrainDrills();
      }
    });
    cv.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      const audio = getAudio();
      if (train.parryMode) {
        const pt = trainPoint(e);
        const isSpatial = train.drill && train.drill.kind !== 'parry' && train.drill.kind !== 'rhythm';
        if (isSpatial) {
          train.drillDrag = true;
          train.pts = [pt];
          try { cv.setPointerCapture(e.pointerId); } catch (_) {}
        }
        const res = handleDrillInput(train.drill, pt.x / Math.max(1, cv.width), pt.y / Math.max(1, cv.height));
        if (res === 'just' || res === 'step') {
          train.drillDrag = false;
          if (audio && audio.justParry) audio.justParry();
          haptic([24, 16, 36]);
        } else if (res === 'fail') {
          train.drillDrag = false;
          if (audio && audio.whiff) audio.whiff();
        }
        return;
      }
      train.drawing = true; train.result = null; train.pts = [trainPoint(e)];
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    });
    cv.addEventListener('pointermove', function (e) {
      const audio = getAudio();
      if (train.drillDrag && train.parryMode) {
        e.preventDefault();
        const p = trainPoint(e);
        train.pts.push(p);
        const res = handleDrillInput(train.drill, p.x / Math.max(1, cv.width), p.y / Math.max(1, cv.height));
        if (res === 'just' || res === 'step') {
          train.drillDrag = false; train.pts = [];
          if (audio && audio.justParry) audio.justParry();
          haptic([24, 16, 36]);
        } else if (res === 'fail') {
          train.drillDrag = false; train.pts = [];
          if (audio && audio.whiff) audio.whiff();
        }
        return;
      }
      if (!train.drawing) return;
      e.preventDefault();
      const p = trainPoint(e), last = train.pts[train.pts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1.5) train.pts.push(p);
    });
    cv.addEventListener('pointerup', function (e) {
      if (train.drillDrag) { train.drillDrag = false; train.pts = []; return; }
      if (!train.drawing) return;
      train.drawing = false;
      e.preventDefault();
      trainFinish();
    });
    cv.addEventListener('pointercancel', function () { train.drawing = false; train.drillDrag = false; });
  }

  return {
    train,
    renderTrainDrills,
    renderTrainShapes,
    openTrain,
    closeTrain,
    wireTrain,
    trainFinish
  };
}
