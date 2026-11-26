/* v2/js/modules/uiMotion.js — v1.51 anime.js v4 기반 UI 모션(레벨업 각인 카드 · 결과창 별점/카운트업 · 보스 배너) */
let _anime = null;
let _animeLoading = null;

function getAnime() {
  if (_anime) return Promise.resolve(_anime);
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!_animeLoading) {
    _animeLoading = import('../../vendor/anime.esm.min.js')
      .then(function (m) { _anime = m; return m; })
      .catch(function () { return null; });
  }
  return _animeLoading;
}
if (typeof window !== 'undefined') getAnime();

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

export function animateLevelCards(overlayEl, cards) {
  if (!overlayEl || !cards || !cards.length || prefersReducedMotion()) return;
  getAnime().then(function (A) {
    if (!A) return;
    try {
      const panel = overlayEl.querySelector('.level-panel');
      if (panel) {
        A.animate(panel, {
          opacity: [0, 1],
          translateY: [14, 0],
          scale: [0.96, 1],
          duration: 240,
          ease: 'outCubic'
        });
      }
      A.animate(cards, {
        opacity: [0, 1],
        translateY: [26, 0],
        scale: [0.92, 1],
        delay: A.stagger(68, { start: 50 }),
        ease: A.spring({ bounce: 0.26, duration: 460 })
      });
    } catch (_) {}
  });
}

export function animateCardPick(chosenBtn, allBtns, onDone, skipAnim) {
  if (!chosenBtn || skipAnim || prefersReducedMotion()) {
    if (onDone) onDone();
    return;
  }
  const A = _anime;
  if (!A) {
    if (onDone) onDone();
    return;
  }
  try {
    const others = [];
    for (let i = 0; i < allBtns.length; i++) {
      if (allBtns[i] !== chosenBtn) others.push(allBtns[i]);
    }
    const seal = chosenBtn.querySelector('.up-seal');
    const tl = A.createTimeline({
      onComplete: function () {
        if (onDone) onDone();
      }
    });
    if (others.length) {
      tl.add(others, {
        opacity: 0,
        scale: 0.92,
        translateY: 10,
        duration: 170,
        ease: 'inQuad'
      }, 0);
    }
    tl.add(chosenBtn, {
      scale: [1, 1.045, 1.015],
      duration: 230,
      ease: 'outBack(1.8)'
    }, 0);
    if (seal) {
      seal.hidden = false;
      tl.add(seal, {
        opacity: [0, 1],
        scale: [2.3, 1],
        rotate: [-22, -9],
        duration: 210,
        ease: 'outBack(2.0)'
      }, 20);
    }
  } catch (_) {
    if (onDone) onDone();
  }
}

export function animateResultOverlay(overlayEl, starsEl, statsEl) {
  if (!overlayEl || prefersReducedMotion()) return;
  getAnime().then(function (A) {
    if (!A) return;
    try {
      const card = overlayEl.querySelector('.result-card');
      if (card) {
        A.animate(card, {
          opacity: [0, 1],
          translateY: [20, 0],
          scale: [0.95, 1],
          duration: 280,
          ease: 'outCubic'
        });
      }
      if (starsEl) {
        const litStars = starsEl.querySelectorAll('.star.on, .star');
        if (litStars.length) {
          A.animate(litStars, {
            opacity: [0, 1],
            scale: [2.1, 1],
            rotate: [-16, 0],
            delay: A.stagger(115, { start: 120 }),
            ease: A.spring({ bounce: 0.34, duration: 520 })
          });
        }
      }
      if (statsEl) {
        const rows = statsEl.querySelectorAll('li');
        if (rows.length) {
          A.animate(rows, {
            opacity: [0, 1],
            translateX: [-12, 0],
            delay: A.stagger(48, { start: 180 }),
            duration: 260,
            ease: 'outQuad'
          });
        }
      }
    } catch (_) {}
  });
}

export function animateBannerIn(el) {
  if (!el || prefersReducedMotion()) return;
  getAnime().then(function (A) {
    if (!A) return;
    try {
      A.animate(el, {
        opacity: [0, 1],
        scaleX: [0.72, 1],
        translateY: [-8, 0],
        duration: 260,
        ease: 'outQuint'
      });
    } catch (_) {}
  });
}

export function pulseButton(el) {
  if (!el || prefersReducedMotion()) return;
  getAnime().then(function (A) {
    if (!A) return;
    try {
      A.animate(el, {
        scale: [1, 0.94, 1.04, 1],
        duration: 260,
        ease: 'outBack(1.8)'
      });
    } catch (_) {}
  });
}
