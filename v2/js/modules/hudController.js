/**
 * v2/js/modules/hudController.js
 * 심안(SIMAN) v0.49 — HUD 접근성·1~4막 테마·타이틀 복귀 DOM 정리 컨트롤러
 */

export function createHudController(doc = typeof document !== 'undefined' ? document : null) {
  const byId = (id) => (doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);

  function syncOverlayVisibility(isOverlayOpen) {
    const app = byId('app');
    const hud = byId('hud');
    if (app && app.classList) app.classList.toggle('overlay-open', !!isOverlayOpen);
    if (hud && typeof hud.setAttribute === 'function') {
      hud.setAttribute('aria-hidden', isOverlayOpen ? 'true' : 'false');
    }
  }

  function syncActTheme(actNo) {
    const app = byId('app');
    const clamped = Math.max(1, Math.min(4, Number(actNo) || 1));
    if (app && typeof app.setAttribute === 'function') {
      app.setAttribute('data-act', String(clamped));
    }
    return clamped;
  }

  function syncMuteUi(isMuted) {
    const btn = byId('btnMute');
    if (btn && typeof btn.setAttribute === 'function') {
      btn.setAttribute('data-sound', isMuted ? 'off' : 'on');
      btn.setAttribute('aria-pressed', isMuted ? 'false' : 'true');
    }
    const pill = byId('simanAudioPill');
    if (pill) {
      pill.textContent = isMuted
        ? '심안 청각 · 출전 시 소리 켜짐'
        : '심안 청각 활성';
    }
  }

  function clearOnTitleReturn() {
    syncOverlayVisibility(true);
    const combo = byId('comboLabel');
    if (combo) {
      combo.textContent = '콤보 0';
      if (combo.classList) combo.classList.remove('hot');
    }
    ['bossCard', 'guide', 'toast', 'judgeFlash', 'goalLabel'].forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.hidden = true;
      if (typeof el.setAttribute === 'function') el.setAttribute('aria-hidden', 'true');
    });
  }

  return {
    syncOverlayVisibility,
    syncActTheme,
    syncMuteUi,
    clearOnTitleReturn,
  };
}
