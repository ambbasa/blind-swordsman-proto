/* v2/js/modules/uiBindings.js — 심안: 묵검 v1.26 DOM 이벤트 가드·UI 바인딩 */

import { createDrillState, getDrillDef } from './trainingDrills.js?v=v162';

export function createUiBindings(rt) {
  const $ = rt.$;
function guardEvents() {
  const app = $('app');
  function stop(e) { e.preventDefault(); }
  /* v1 교훈: 버튼 위 터치를 preventDefault하면 모바일에서 click이 사라진다. */
  function stopTouch(e) {
    /* v0.71.1: 버튼 및 스크롤 가능한 오버레이 내부(무구·유물·치장·수련표·도감)에서는 터치 스크롤을 막지 않는다. */
    if (e.target && e.target.closest && e.target.closest('button,a,input,label,.shop-list,.cosmetic-grid,.daily-body,.codex-body,.ov.show .card')) return;
    e.preventDefault();
  }
  ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
    document.addEventListener(ev, stopTouch, { passive: false });
    app.addEventListener(ev, stopTouch, { passive: false });
  });
  document.addEventListener('contextmenu', stop);
  document.addEventListener('dblclick', stop);
  window.addEventListener('scroll', function () { window.scrollTo(0, 0); });
  app.addEventListener('pointerdown', rt.onDown);
  window.addEventListener('pointermove', rt.onMove);
  window.addEventListener('pointerup', rt.onUp);
  window.addEventListener('pointercancel', rt.onUp);
  window.addEventListener('resize', rt.onResize);
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    /* 상점·도감·수련장 같은 메뉴 오버레이가 열려 있으면 ESC는 그 오버레이 닿기(overlayShell)만 맡는다.
       예전에는 같은 ESC가 상점을 닫은 뒤 일시정지까지 열어, 메뉴를 닫을 때 판이 멈춰 있었다. */
    const menus = ['ov-stages', 'ov-shop', 'ov-cosmetic', 'ov-daily', 'ov-codex', 'ov-train', 'ov-level', 'ov-stage', 'ov-result', 'ov-idle', 'ov-title'];
    for (let i = 0; i < menus.length; i++) {
      const el = $(menus[i]);
      if (el && el.classList.contains('show')) return;
    }
    if (rt.S && rt.S.paused === 'manual') rt.resumeRun();
    else if (rt.S && rt.S.playing) rt.pauseRun();
  });
}
function bindUi() {
  if ($('btnMute')) $('btnMute').addEventListener('click', function (e) { e.stopPropagation(); rt.setMuted(!rt.save.muted); });
  if ($('btnMute2')) $('btnMute2').addEventListener('click', function () { rt.setMuted(!rt.save.muted); });
  if ($('btnPause')) $('btnPause').addEventListener('click', function (e) { e.stopPropagation(); rt.pauseRun(); });
  if ($('btnResume')) $('btnResume').addEventListener('click', function () { rt.resumeRun(); });
  if ($('btnQuit')) $('btnQuit').addEventListener('click', function () { rt.quitRun(); });
  /* v0.29 §13: 기록 보내기(선택)와 내보내기. 아직 서버가 없어 '켬'은 동의 표시만 남긴다. */
  function syncRecBtn() {
    const b = $('btnRec');
    if (b) b.textContent = '기록 보내기: ' + (rt.telemetry.isOptIn() ? '켬' : '끔');
  }
  if ($('btnRec')) $('btnRec').addEventListener('click', function () {
    rt.telemetry.setOptIn(!rt.telemetry.isOptIn()); syncRecBtn();
    rt.toast(rt.telemetry.isOptIn() ? '기록 보내기에 동의했습니다 (아직 서버 없음 — 기기에만 쌓임)' : '기록 보내기를 껐습니다');
  });
  if ($('btnRecOut')) $('btnRecOut').addEventListener('click', function () {
    rt.telemetry.save();
    if (rt.telemetry.download()) rt.toast('기록을 파일로 내보냈습니다 (' + rt.telemetry.stats().total + '개)');
    else rt.toast('내보내지 못했습니다');
  });
  syncRecBtn();
  rt.uiRouter.mountAudioPill();
  rt.uiRouter.bindStartAndTrain({
    onStart: function () { rt.beginStage(rt.upcomingRun()); },
    onTrain: function () { rt.openTrain(); }
  });
  rt.hudCtrl.syncMuteUi(!!rt.save.muted);
  rt.hudCtrl.syncActTheme(rt.actOf(rt.save.stage || 1));
  rt.wireShopTabs();
  rt.wireTrain();
  $('btnShop').addEventListener('click', function () { rt.refreshShop(); rt.showOv('ov-shop'); });
  if ($('btnCosmetic')) $('btnCosmetic').addEventListener('click', function () { rt.renderCosmeticOverlay(); rt.showOv('ov-cosmetic'); });
  if ($('btnCosClose')) $('btnCosClose').addEventListener('click', function () { rt.hideOvs(); rt.showOv('ov-title'); });
  if ($('btnDaily')) $('btnDaily').addEventListener('click', function () { rt.renderDailyOverlay(); rt.showOv('ov-daily'); });
  if ($('btnDailyClose')) $('btnDailyClose').addEventListener('click', function () { rt.hideOvs(); rt.showOv('ov-title'); });
  if ($('btnResultUpgrade')) $('btnResultUpgrade').addEventListener('click', function () {
    const st = this.dataset.stat;
    if (st && rt.buy(st)) {
      rt.toast('강화 완료 — 다시 도전해 보세요!');
      const next = rt.pickAffordableStatUpgrade();
      if (next) {
        this.dataset.stat = next.id;
        this.textContent = next.name + ' Lv ' + (next.lv + 1) + ' 바로 단련 (' + next.cost + '엽전)';
      } else {
        this.hidden = true;
      }
    }
  });
  if ($('btnCodex')) $('btnCodex').addEventListener('click', function () { rt.renderCodex(); rt.showOv('ov-codex'); });
  if ($('btnCodexClose')) $('btnCodexClose').addEventListener('click', function () { rt.hideOvs(); rt.showOv('ov-title'); });
  if ($('btnTrainClose')) $('btnTrainClose').addEventListener('click', function () { rt.closeTrain(); });
  if ($('btnTrainTut')) $('btnTrainTut').addEventListener('click', function () { rt.closeTrain(); rt.startRun({ stage: 1, replay: true }); });
  $('btnShopClose').addEventListener('click', function () {
    if (rt.S && (rt.S.won || rt.S.lost)) rt.showOv('ov-result');
    else rt.showOv('ov-title');
  });
  $('btnResultShop').addEventListener('click', function () { rt.refreshShop(); rt.showOv('ov-shop'); });
  if ($('btnResultRetry')) $('btnResultRetry').addEventListener('click', function () {
    const n = (rt.S && rt.S.stageNo) || rt.save.stage || 1;
    rt.startRun({ stage: n });
  });
  if ($('btnResultTitle')) $('btnResultTitle').addEventListener('click', function () {
    rt.hideOvs(); rt.showOv('ov-title');
  });
  $('btnResultGo').addEventListener('click', function () {
    const n = (rt.S && rt.S.won && rt.S.nextStage) ? rt.S.nextStage : ((rt.S && rt.S.stageNo) || rt.save.stage || 1);
    if (rt.S && !rt.S.noScore) rt.telemetry.event('result_choice', { stage: rt.S.stageNo, next: n, won: rt.S.won, action: n === rt.S.stageNo ? 'retry' : 'advance' });
    if (rt.S && rt.S.won && rt.S.nextStage && !rt.qa.noDelay) { rt.beginStage(n); return; }
    rt.startRun({ stage: n });
  });
  if ($('btnStageGo')) $('btnStageGo').addEventListener('click', function (e) { e.stopPropagation(); rt.goStageNow(true); });
  if ($('ov-stage')) $('ov-stage').addEventListener('click', function () { rt.goStageNow(true); });
  $('btnIdleTake').addEventListener('click', function () { rt.collectIdle(false); });
  if ($('btnDockHome')) $('btnDockHome').addEventListener('click', function () {
    ['ov-stages', 'ov-shop', 'ov-cosmetic', 'ov-daily', 'ov-codex', 'ov-train'].forEach(function (id) {
      const el = $(id); if (el) el.classList.remove('show');
    });
    try { rt.stopCodex3d(); } catch (_) {}
    rt.showOv('ov-title');
  });
  document.querySelectorAll('[data-buy]').forEach(function (b) {
    b.addEventListener('click', function () { rt.buy(b.getAttribute('data-buy')); });
  });
  /* v0.30 §7.2 모드 선택 · §8.1 수련 다시 보기 · §11 접근성 · 튜토리얼 건너뛰기 */
  $('judgeFlash').addEventListener('animationend', function () { this.hidden = true; });
  if ($('btnA11y')) $('btnA11y').addEventListener('click', function () {
    const r = $('titleA11y');
    if (r) r.hidden = !r.hidden;
  });
  if ($('btnStagePrev')) $('btnStagePrev').addEventListener('click', function () {
    const cur = rt.clamp((rt.titleSel != null ? rt.titleSel : (rt.save.stage || 1)) | 0, 1, rt.STAGES.length);
    if (cur <= 1) return;
    rt.titleSel = cur - 1;
    if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'hline');
    rt.refreshTitleHelp();
    rt.previewStageWorld(rt.titleSel);
  });
  if ($('btnStageNext')) $('btnStageNext').addEventListener('click', function () {
    const maxU = rt.unlockedMax();
    const cur = rt.clamp((rt.titleSel != null ? rt.titleSel : (rt.save.stage || 1)) | 0, 1, rt.STAGES.length);
    if (cur >= maxU) return;
    rt.titleSel = cur + 1;
    if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'hline');
    rt.refreshTitleHelp();
    rt.previewStageWorld(rt.titleSel);
  });
  if ($('btnStagePicker')) $('btnStagePicker').addEventListener('click', function () {
    rt.refreshTitleHelp();
    rt.showOv('ov-stages');
  });
  if ($('btnStagesClose')) $('btnStagesClose').addEventListener('click', function () {
    rt.hideOvs(); rt.showOv('ov-title');
  });
  if ($('btnToggleChal')) $('btnToggleChal').addEventListener('click', function () {
    const c = $('titleChallenges');
    if (!c) return;
    c.hidden = !c.hidden;
    this.textContent = c.hidden ? '도전 모드 펼치기 ▾' : '도전 모드 접기 ▴';
  });
  function applyGfxPreset(mode) {
    rt.save.a11y = rt.save.a11y || { colorblind: 0, shake: 0 };
    rt.save.a11y.gfx = mode;
    rt.persist();
    rt.syncA11yUi();
    if (!rt.three) return;
    try {
      const dprMax = mode === 'light' ? 1.0 : (mode === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, rt.IS_MOBILE ? 1.5 : 2));
      rt.three.dprCap = rt.DPR_QUERY || dprMax;
      rt.three.dprNow = rt.three.dprCap;
      if (rt.three.renderer) { rt.three.renderer.setPixelRatio(rt.three.dprCap); rt.onResize(); }
      if (rt.three.moon) rt.three.moon.castShadow = mode !== 'light';
      const wantFx = mode === 'light' ? 'off' : (mode === 'high' ? 'high' : 'low');
      rt.fxQ = wantFx;
      if (rt.three.bloom && rt.three.bloom.setQuality) rt.three.bloom.setQuality(wantFx);
      if (rt.three.ink && rt.three.ink.setQuality) rt.three.ink.setQuality(wantFx === 'high' ? 'high' : 'low');
      rt.wireFadeSource();
    } catch (err) {
      if (window.console && console.warn) console.warn('[심안] 그래픽 전환 중 경고:', err);
    }
  }
  if (rt.save.a11y && rt.save.a11y.gfx && rt.save.a11y.gfx !== 'normal') applyGfxPreset(rt.save.a11y.gfx);
  ['btnGfx', 'btnGfx1'].forEach(function (id) {
    const b = $(id); if (!b) return;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      const cur = (rt.save.a11y && rt.save.a11y.gfx) || 'normal';
      const next = cur === 'normal' ? 'light' : (cur === 'light' ? 'high' : 'normal');
      applyGfxPreset(next);
      rt.toast(next === 'light' ? '그래픽: 가볍게 (최고 프레임 · 그림자/블룸 끔)' : (next === 'high' ? '그래픽: 높음 (고해상도 · 풀 이펙트)' : '그래픽: 보통 (모바일 권장 균형)'));
    });
  });
  [['btnCb', 'colorblind'], ['btnCb1', 'colorblind'], ['btnShake', 'shake'], ['btnShake1', 'shake']].forEach(function (p) {
    const b = $(p[0]);
    if (!b) return;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      const key = p[1];
      const next = !(key === 'colorblind' ? rt.a11yCb() : rt.a11yShake());
      rt.setA11y(key, next);
      rt.toast(key === 'colorblind' ? (next ? '색약 팔레트를 켰습니다 — 예고마다 모양 아이콘이 붙습니다' : '색약 팔레트를 껐습니다')
        : (next ? '화면 흔들림을 줄입니다' : '화면 흔들림을 되돌렸습니다'));
    });
  });
  if ($('btnSkip')) $('btnSkip').addEventListener('click', function (e) {
    e.stopPropagation();
    rt.endTutorial('skip');
    rt.toast('안내를 건너뜁니다');
  });
  if ($('btnTrainOffer')) $('btnTrainOffer').addEventListener('click', function () {
    if (rt.S) rt.save.trainOffered = (rt.S.stage ? rt.S.stage.id : 1) + ':' + (rt.S.streakAfter || 0);
    rt.persist();
    rt.setMode('train');
    rt.startRun({ stage: (rt.S && rt.S.stageNo) || 1 });
  });
  if ($('btnResultDrill')) $('btnResultDrill').addEventListener('click', function () {
    rt.openTrain();
    if (!rt.train.parryMode && $('btnTrainParry')) $('btnTrainParry').click();
    const lastG = rt.S && (rt.S.lastBossGimmick || (rt.S.boss && rt.S.boss.pat));
    if (lastG && ['donut', 'soak', 'rhythm', 'tether', 'gaze', 'pizza'].indexOf(lastG) >= 0) {
      rt.train.drill = createDrillState(lastG);
      rt.renderTrainDrills();
      const noteEl = $('trainNote');
      if (noteEl) noteEl.textContent = getDrillDef(lastG).tip;
    }
  });
  if ($('btnSaveExport')) $('btnSaveExport').addEventListener('click', function () {
    try {
      const code = btoa(unescape(encodeURIComponent(JSON.stringify(rt.save))));
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () {
          rt.toast('기록 백업 코드를 클립보드에 복사했습니다.');
        }).catch(function () {
          window.prompt('아래 백업 코드를 복사해 보관하세요:', code);
        });
      } else {
        window.prompt('아래 백업 코드를 복사해 보관하세요:', code);
      }
    } catch (e) { rt.toast('백업 코드 생성에 실패했습니다.'); }
  });
  if ($('btnSaveImport')) $('btnSaveImport').addEventListener('click', function () {
    const raw = window.prompt('보관해 둔 기록 백업 코드를 붙여넣으세요:');
    if (!raw || !raw.trim()) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(raw.trim()))));
      if (!parsed || typeof parsed !== 'object' || typeof parsed.coins !== 'number') {
        rt.toast('올바르지 않은 백업 코드입니다.');
        return;
      }
      Object.assign(rt.save, parsed);
      rt.migrateMetaV4(rt.save);
      rt.persist();
      rt.refreshTitleHelp();
      try { rt.renderStageSelect(); } catch (_) {}
      try { rt.refreshShop(); } catch (_) {}
      try { rt.syncLobby3dStyle(rt.cloakOf(rt.save), rt.trailOf(rt.save)); } catch (_) {}
      rt.toast('기록을 복원했습니다.');
    } catch (e) { rt.toast('백업 코드를 읽을 수 없습니다.'); }
  });
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    if (rt.S && rt.S.playing && !rt.S.paused) rt.pauseRun();
    else if (rt.audio) rt.audio.stopBgm();
    if (rt.audio && rt.audio.suspend) rt.audio.suspend();
  } else if (rt.audio && rt.audio.resume && !rt.save.muted && !rt.qa.mute) {
    rt.audio.resume();
  }
});
window.addEventListener('pagehide', function () {
  if (rt.S && rt.S.playing && !rt.S.paused) rt.pauseRun();
  else if (rt.audio) rt.audio.stopBgm();
  if (rt.audio && rt.audio.suspend) rt.audio.suspend();
});
}

  return { bindUi, guardEvents };
}
