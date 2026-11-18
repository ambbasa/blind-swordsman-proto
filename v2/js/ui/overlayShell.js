/* v2/js/ui/overlayShell.js — 8개 오버레이(#ov-*)와 인게임 제스처 입력 UX 일관성 계층. */
const CLOSE_MAP = {
  'ov-shop': 'btnShopClose',
  'ov-codex': 'btnCodexClose',
  'ov-train': 'btnTrainClose',
  'ov-pause': 'btnResume'
};

export function initOverlayShell({ onResizeTrain } = {}) {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const [ovId, btnId] of Object.entries(CLOSE_MAP)) {
      const ov = document.getElementById(ovId);
      if (ov && ov.classList.contains('show')) {
        const btn = document.getElementById(btnId);
        if (btn && !btn.disabled) { e.preventDefault(); btn.click(); return; }
      }
    }
  });

  const app = document.getElementById('app');
  let drawing = false;
  const startDraw = (e) => {
    if (e.target && e.target.closest && e.target.closest('#hud, .ov.show, #quickCards, #btnSkip')) return;
    drawing = true;
    document.body.classList.add('drawing-active');
  };
  const endDraw = () => {
    if (!drawing) return;
    drawing = false;
    document.body.classList.remove('drawing-active');
  };
  if (app) {
    app.addEventListener('pointerdown', startDraw, { passive: true });
    window.addEventListener('pointerup', endDraw, { passive: true });
    window.addEventListener('pointercancel', endDraw, { passive: true });
  }

  const pairs = [['btnCb1', 'btnCb'], ['btnShake1', 'btnShake'], ['btnLvMode1', 'btnLvMode']];
  for (const [aId, bId] of pairs) {
    const a = document.getElementById(aId);
    const b = document.getElementById(bId);
    if (!a || !b) continue;
    const sync = (src, dst) => { queueMicrotask(() => { dst.textContent = src.textContent; }); };
    a.addEventListener('click', () => sync(a, b));
    b.addEventListener('click', () => sync(b, a));
  }

  const trainCanvas = document.getElementById('trainCanvas');
  if (trainCanvas && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      const rect = trainCanvas.getBoundingClientRect();
      if (rect.width < 10) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(rect.width * dpr);
      const h = Math.round((rect.width * (230 / 320)) * dpr);
      if (trainCanvas.width !== w || trainCanvas.height !== h) {
        trainCanvas.width = w;
        trainCanvas.height = h;
        if (onResizeTrain) onResizeTrain(trainCanvas, dpr);
      }
    });
    ro.observe(trainCanvas);
  }
}
