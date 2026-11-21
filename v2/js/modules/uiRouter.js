/**
 * v2/js/modules/uiRouter.js
 * 심안(SIMAN) v0.49 — 타이틀 청각 온보딩 배지 & 수련장/출전 단일 이벤트 가드
 */

export function createUiRouter({
  doc = typeof document !== 'undefined' ? document : null,
  hudCtrl = null,
  isMuted = () => false,
  onEnableAudio = () => {},
} = {}) {
  let audioUnlocked = false;
  let abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;

  const byId = (id) => (doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);

  function mountAudioPill() {
    if (!doc || typeof doc.createElement !== 'function') return null;
    const existing = byId('simanAudioPill');
    if (existing) return existing;
    const tag = byId('titleTag');
    if (!tag || !tag.parentNode) return null;
    const pill = doc.createElement('p');
    pill.id = 'simanAudioPill';
    pill.className = 'siman-audio-pill';
    pill.textContent = isMuted()
      ? '심안 청각 · 출전 시 무당방울 소리 자동 활성화'
      : '심안 청각 활성 · 무당방울(2600~3800Hz) 켜짐';
    tag.parentNode.insertBefore(pill, tag.nextSibling);
    return pill;
  }

  function unlockAudioOnce() {
    if (audioUnlocked) return false;
    audioUnlocked = true;
    onEnableAudio();
    if (hudCtrl) hudCtrl.syncMuteUi(false);
    return true;
  }

  function bindStartAndTrain({ onStart, onTrain } = {}) {
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const opts = abortCtrl ? { signal: abortCtrl.signal } : undefined;

    const btnStart = byId('btnStart');
    if (btnStart && typeof btnStart.addEventListener === 'function') {
      btnStart.addEventListener(
        'click',
        (ev) => {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
          unlockAudioOnce();
          if (typeof onStart === 'function') onStart();
        },
        opts
      );
    }

    const btnTrain = byId('btnTrain');
    if (btnTrain && typeof btnTrain.addEventListener === 'function') {
      btnTrain.addEventListener(
        'click',
        (ev) => {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
          unlockAudioOnce();
          if (typeof onTrain === 'function') onTrain();
        },
        opts
      );
    }
  }

  return {
    mountAudioPill,
    unlockAudioOnce,
    bindStartAndTrain,
    destroy: () => {
      if (abortCtrl) abortCtrl.abort();
    },
  };
}
