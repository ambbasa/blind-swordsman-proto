/* v2/js/modules/uiMotion.js — v1.52 anime.js v4 기반 UI 모션(엠버 앤 블레이드풍 메달리온 각인 · 결과창 · 배너) */
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

export function animateLevelCards(overlayEl, orbs) {
  if (!overlayEl || !orbs || !orbs.length || prefersReducedMotion()) return;
  getAnime().then(function (A) {
    if (!A) return;
    try {
      A.animate(orbs, {
        opacity: [0, 1],
        translateY: [-22, 0],
        scale: [0.76, 1],
        delay: A.stagger(75, { start: 30 }),
        ease: A.spring({ bounce: 0.30, duration: 480 })
      });
      const detail = overlayEl.querySelector('.eb-detail');
      if (detail) {
        A.animate(detail, {
          opacity: [0, 1],
          translateY: [18, 0],
          scale: [0.96, 1],
          delay: 110,
          duration: 280,
          ease: 'outCubic'
        });
      }
      const owned = overlayEl.querySelector('.eb-owned-bar');
      if (owned) {
        A.animate(owned, {
          opacity: [0, 1],
          translateY: [14, 0],
          delay: 180,
          duration: 260,
          ease: 'outCubic'
        });
      }
    } catch (_) {}
  });
}

export function animateOrbFocus(orbEl, detailEl) {
  if (prefersReducedMotion()) return;
  getAnime().then(function (A) {
    if (!A) return;
    try {
      if (orbEl) {
        const pillar = orbEl.querySelector('.eb-pillar');
        if (pillar) {
          A.animate(pillar, {
            opacity: [0, 1],
            scaleY: [0.35, 1],
            duration: 240,
            ease: 'outQuint'
          });
        }
        const crest = orbEl.querySelector('.eb-crest');
        if (crest) {
          A.animate(crest, {
            scale: [0.96, 1.10, 1.06],
            duration: 280,
            ease: 'outBack(1.8)'
          });
        }
      }
      if (detailEl) {
        A.animate(detailEl, {
          opacity: [0.55, 1],
          translateY: [6, 0],
          duration: 190,
          ease: 'outQuad'
        });
      }
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
    const tl = A.createTimeline({
      onComplete: function () {
        if (onDone) onDone();
      }
    });
    if (others.length) {
      tl.add(others, {
        opacity: 0,
        scale: 0.78,
        translateY: 12,
        duration: 170,
        ease: 'inQuad'
      }, 0);
    }
    tl.add(chosenBtn, {
      scale: [1.06, 1.24, 1.08],
      duration: 240,
      ease: 'outBack(2.0)'
    }, 0);
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
