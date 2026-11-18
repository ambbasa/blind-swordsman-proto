/* v2/js/ui/overlayShell.js — 메뉴 오버레이(#ov-*) ESC 닫기와 인게임 제스처 입력 UX 일관성 계층. */

/* ESC 로 닫는 메뉴 오버레이 → 닫기 버튼.
   ov-pause 는 넣지 않는다: game.js(guardEvents)의 ESC 가 일시정지/재개를 맡는다. 이 리스너가 먼저 등록되므로
   여기서도 재개하면 곧이어 game.js 가 다시 일시정지해 ESC 로 풀리지 않는다. */
const CLOSE_MAP = {
  'ov-shop': 'btnShopClose',
  'ov-codex': 'btnCodexClose',
  'ov-train': 'btnTrainClose'
};

let inited = false;

/** Wires ESC-to-close for menu overlays and the `drawing-active` body class (dims HUD while a stroke is drawn).
 *  Safe to call more than once; only the first call binds listeners.
 *  Label sync of duplicated buttons (btnCb/btnCb1 …) stays in game.js syncA11yUi; the training canvas keeps
 *  its 320×230 backing store (game.js draws in that space) and is scaled by CSS only. */
export function initOverlayShell() {
  if (inited) return;
  inited = true;

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
}
