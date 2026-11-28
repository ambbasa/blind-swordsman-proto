/**
 * v2/js/modules/itemArt.js
 * 심안(SIMAN) v0.71 — 무구 8종 · 유물 10종 · 치장 도포 4종 · 치장 검기 4종
 * 조선 수묵·금박 페인팅 WebP 아트워크 로더 (구형 SVG 호출 시그니처 완전 호환).
 */

const SWORD_FILES = Object.freeze({
  muk: 'sword_muk',
  seori: 'sword_seori',
  hwa: 'sword_hwa',
  maeng: 'sword_maeng',
  cheong: 'sword_cheong',
  gwi: 'sword_gwi',
  thunder: 'sword_thunder',
  breaker: 'sword_breaker'
});

const RELIC_FILES = Object.freeze({
  oldbell: 'relic_oldbell',
  mirror: 'relic_mirror',
  needle: 'relic_needle',
  sheath: 'relic_sheath',
  echo_bell: 'relic_echo_bell',
  blood: 'relic_blood',
  tower: 'relic_tower',
  eye: 'relic_eye',
  mono_seal: 'relic_mono_seal',
  multi_seal: 'relic_multi_seal'
});

const CLOAK_FILES = Object.freeze({
  ink: 'cloak_ink',
  snow_sage: 'cloak_snow_sage',
  crimson_guard: 'cloak_crimson_guard',
  gilded_eclipse: 'cloak_gilded_eclipse'
});

const TRAIL_FILES = Object.freeze({
  ink: 'trail_ink',
  jade_bamboo: 'trail_jade_bamboo',
  crimson_moon: 'trail_crimson_moon',
  gold_leaf: 'trail_gold_leaf'
});

function imgTag(fileKey, alt) {
  return '<img class="art-img" src="assets/icons/' + fileKey + '.webp?v=v182" alt="' + (alt || '') + '" decoding="async">';
}

export function getSwordSvg(id) {
  return imgTag(SWORD_FILES[id] || SWORD_FILES.muk, id || 'sword');
}

export function getRelicSvg(id) {
  return imgTag(RELIC_FILES[id] || RELIC_FILES.oldbell, id || 'relic');
}

export function getCosmeticSvg(kind, id) {
  if (kind === 'trail') {
    return imgTag(TRAIL_FILES[id] || TRAIL_FILES.ink, id || 'trail');
  }
  return imgTag(CLOAK_FILES[id] || CLOAK_FILES.ink, id || 'cloak');
}

export const ICON_ASSET_COUNTS = Object.freeze({
  swords: Object.keys(SWORD_FILES).length,
  relics: Object.keys(RELIC_FILES).length,
  cloaks: Object.keys(CLOAK_FILES).length,
  trails: Object.keys(TRAIL_FILES).length
});
