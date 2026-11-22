/**
 * v2/js/modules/itemArt.js
 * 심안(SIMAN) v0.70 — 무구 8종 · 유물 10종 · 치장 8종 전용 조선 수묵/금박 벡터 SVG 아트워크
 * - 레티나 고해상도 선명도 보장 · 외부 이미지 404 위험 0 · 한자/컬러이모지 0
 */

const FRAME = (bgA, bgB, border, inner) =>
  `<svg class="item-art-svg" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">` +
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bgA}"/><stop offset="100%" stop-color="${bgB}"/></linearGradient></defs>` +
  `<rect x="2" y="2" width="60" height="60" rx="8" fill="url(#g)" stroke="${border}" stroke-width="2"/>` +
  `<rect x="6" y="6" width="52" height="52" rx="5" fill="none" stroke="${border}" stroke-opacity="0.32" stroke-width="1"/>` +
  inner + `</svg>`;

const SWORD_ART = {
  muk: () => FRAME('#1e1b18', '#0e0c0b', '#9e8f76',
    `<path d="M16 48L46 14L50 16L22 50Z" fill="#e8dfd0"/>` +
    `<path d="M18 40L26 47" stroke="#c8b698" stroke-width="3.2" stroke-linecap="round"/>` +
    `<path d="M13 51L21 44" stroke="#7d6c56" stroke-width="3.4" stroke-linecap="round"/>`),
  seori: () => FRAME('#142530', '#0a141c', '#7fd4f0',
    `<path d="M15 49L47 13L51 16L22 51Z" fill="#d9f4ff"/>` +
    `<path d="M27 31L36 22M33 34L42 25" stroke="#72d2f5" stroke-width="2" stroke-linecap="round"/>` +
    `<polygon points="46,16 52,18 48,23" fill="#9ee8ff" opacity="0.85"/>` +
    `<path d="M18 40L26 47" stroke="#8ad4ed" stroke-width="3.2" stroke-linecap="round"/>`),
  hwa: () => FRAME('#301410', '#160908', '#ff7b4a',
    `<path d="M15 49L46 14L50 17L22 51Z" fill="#ffdfbe"/>` +
    `<path d="M30 22C34 15 42 15 40 24C46 21 48 29 41 34C37 37 32 35 30 22Z" fill="#ff5a36" opacity="0.82"/>` +
    `<path d="M18 40L26 47" stroke="#e89a56" stroke-width="3.2" stroke-linecap="round"/>`),
  maeng: () => FRAME('#261f12', '#120f09', '#e8c468',
    `<path d="M16 48L45 15L49 18L22 50Z" fill="#f3e6cc"/>` +
    `<circle cx="43" cy="21" r="6" fill="#e8c468" stroke="#fff2c4" stroke-width="1.5"/>` +
    `<path d="M34 15C38 11 47 11 51 17" fill="none" stroke="#ffd878" stroke-width="1.8" stroke-linecap="round"/>` +
    `<path d="M18 40L26 47" stroke="#d4aa4c" stroke-width="3.2" stroke-linecap="round"/>`),
  cheong: () => FRAME('#122b24', '#091613', '#6ee8bc',
    `<path d="M14 48L48 13L51 16L20 51Z" fill="#d8fff0"/>` +
    `<path d="M14 34C24 22 38 20 50 28" fill="none" stroke="#62e8b8" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M19 41C28 32 39 30 48 36" fill="none" stroke="#a6ffdf" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M17 41L24 48" stroke="#5cc49e" stroke-width="3.2" stroke-linecap="round"/>`),
  gwi: () => FRAME('#2c1018', '#14070b', '#ff5268',
    `<path d="M15 49L47 13L51 17L22 51Z" fill="#ffd8de"/>` +
    `<path d="M24 26L40 26L32 38Z" fill="none" stroke="#ff485e" stroke-width="2"/>` +
    `<circle cx="32" cy="30" r="3" fill="#ff7084"/>` +
    `<path d="M17 40L26 48" stroke="#c9465a" stroke-width="3.4" stroke-linecap="round"/>`),
  thunder: () => FRAME('#1a1636', '#0c0a1c', '#9a8eff',
    `<path d="M15 49L46 14L50 17L22 51Z" fill="#e8e4ff"/>` +
    `<polyline points="42,12 28,28 37,30 23,46" fill="none" stroke="#b6a6ff" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="M17 41L25 48" stroke="#8a7cf0" stroke-width="3.2" stroke-linecap="round"/>`),
  breaker: () => FRAME('#2e2010', '#160f08', '#ffd466',
    `<path d="M14 48L46 12L52 17L22 51Z" fill="#fff2cc"/>` +
    `<path d="M26 20L44 38M44 20L26 38" stroke="#ffb838" stroke-width="2.4" stroke-linecap="round"/>` +
    `<circle cx="35" cy="29" r="9" fill="none" stroke="#ffe082" stroke-width="1.6" stroke-dasharray="4 3"/>` +
    `<path d="M16 40L25 48" stroke="#d9a438" stroke-width="3.4" stroke-linecap="round"/>`)
};

const RELIC_ART = {
  oldbell: () => FRAME('#262014', '#13100a', '#dfb862',
    `<path d="M32 14C23 14 19 22 18 38L15 43H49L46 38C45 22 41 14 32 14Z" fill="#c9a24b" stroke="#f5dfa0" stroke-width="1.6"/>` +
    `<circle cx="32" cy="46" r="3.5" fill="#ffe699"/>` +
    `<path d="M14 24C10 28 10 34 14 38M50 24C54 28 54 34 50 38" fill="none" stroke="#ffd878" stroke-width="1.8" stroke-linecap="round"/>`),
  mirror: () => FRAME('#1a2826', '#0d1514', '#7ed4c6',
    `<circle cx="32" cy="30" r="15" fill="#2c4a46" stroke="#a6e8dc" stroke-width="2.4"/>` +
    `<circle cx="32" cy="30" r="10" fill="#82d8ca" opacity="0.35"/>` +
    `<path d="M25 23L37 35" stroke="#e4fffb" stroke-width="2.2" stroke-linecap="round"/>` +
    `<rect x="29" y="45" width="6" height="9" rx="2" fill="#8f7a52"/>`),
  needle: () => FRAME('#18242a', '#0c1216', '#86c8e0',
    `<path d="M14 48L50 14L44 26L20 50Z" fill="#d8f2ff"/>` +
    `<circle cx="43" cy="21" r="2.2" fill="#18242a"/>` +
    `<path d="M16 32C24 26 38 38 48 32" fill="none" stroke="#76b8d4" stroke-width="1.8" stroke-dasharray="3 3"/>`),
  sheath: () => FRAME('#2b1a14', '#150c0a', '#e6b85c',
    `<path d="M16 46L44 16L50 22L22 52Z" fill="#59221c" stroke="#e8c068" stroke-width="2"/>` +
    `<path d="M24 38L30 44M32 30L38 36M40 22L46 28" stroke="#ffd878" stroke-width="2"/>`),
  echo_bell: () => FRAME('#162624', '#0b1413', '#6ef0c8',
    `<circle cx="32" cy="32" r="7" fill="#6ef0c8"/>` +
    `<circle cx="32" cy="32" r="13" fill="none" stroke="#8ef5d6" stroke-width="1.8" opacity="0.8"/>` +
    `<circle cx="32" cy="32" r="20" fill="none" stroke="#6ef0c8" stroke-width="1.3" opacity="0.45"/>`),
  blood: () => FRAME('#320e12', '#170608', '#ff5244',
    `<rect x="21" y="12" width="22" height="40" rx="3" fill="#6e1418" stroke="#ff7666" stroke-width="1.8"/>` +
    `<circle cx="32" cy="26" r="7" fill="#ff4a3d"/>` +
    `<path d="M26 40H38M28 45H36" stroke="#ffd2a6" stroke-width="2" stroke-linecap="round"/>`),
  tower: () => FRAME('#201a2a', '#100c16', '#b896e8',
    `<polygon points="18,16 46,16 40,28 24,28" fill="#5c4678" stroke="#d4beff" stroke-width="1.5"/>` +
    `<polygon points="22,30 42,30 37,42 27,42" fill="#47355e" stroke="#b896e8" stroke-width="1.4"/>` +
    `<polygon points="27,44 37,44 32,53" fill="#ff5a4a"/>`),
  eye: () => FRAME('#1d182b', '#0d0b16', '#9cd4ff',
    `<path d="M10 32C18 19 46 19 54 32C46 45 18 45 10 32Z" fill="#1e2b45" stroke="#a6dcff" stroke-width="2"/>` +
    `<circle cx="32" cy="32" r="8" fill="#64c4ff"/>` +
    `<circle cx="32" cy="32" r="3.5" fill="#fff8e0"/>`),
  mono_seal: () => FRAME('#2d1614', '#160a09', '#f0a858',
    `<rect x="14" y="14" width="36" height="36" rx="4" fill="#8f241c" stroke="#ffd282" stroke-width="2"/>` +
    `<path d="M21 24H43M21 32H43M21 40H43" stroke="#fff0d4" stroke-width="3.2" stroke-linecap="round"/>`),
  multi_seal: () => FRAME('#18242e', '#0c1218', '#78e0ff',
    `<rect x="14" y="14" width="36" height="36" rx="4" fill="#1c3b4f" stroke="#8ee8ff" stroke-width="2"/>` +
    `<path d="M20 23H44" stroke="#ffe49e" stroke-width="2.6" stroke-linecap="round"/>` +
    `<polyline points="21,31 32,42 43,31" fill="none" stroke="#84f5d2" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="32" cy="32" r="14" fill="none" stroke="#a8dcff" stroke-width="1.2" stroke-dasharray="3 3"/>`)
};

const COSMETIC_ART = {
  cloak_ink: () => FRAME('#221f1c', '#100e0c', '#a8967a',
    `<path d="M20 18L32 12L44 18L49 50H15Z" fill="#2c2926" stroke="#b8a88e" stroke-width="1.6"/>` +
    `<path d="M25 18L32 34L39 18" fill="none" stroke="#d8cbb4" stroke-width="2"/>` +
    `<rect x="20" y="34" width="24" height="4" fill="#9c8a6e"/>`),
  cloak_snow_sage: () => FRAME('#172936', '#0b161e', '#92ecff',
    `<path d="M20 18L32 12L44 18L49 50H15Z" fill="#e6f4fc" stroke="#8ce4ff" stroke-width="1.8"/>` +
    `<path d="M25 18L32 34L39 18" fill="none" stroke="#5ec2e0" stroke-width="2.2"/>` +
    `<rect x="20" y="34" width="24" height="4" fill="#52b2d4"/>`),
  cloak_crimson_guard: () => FRAME('#361012', '#180708', '#ff7054',
    `<path d="M20 18L32 12L44 18L49 50H15Z" fill="#8c191b" stroke="#ff8266" stroke-width="1.8"/>` +
    `<path d="M25 18L32 34L39 18" fill="none" stroke="#ffd278" stroke-width="2.2"/>` +
    `<rect x="20" y="34" width="24" height="4.5" fill="#e6b44c"/>`),
  cloak_gilded_eclipse: () => FRAME('#261d0e', '#100c06', '#ffd866',
    `<path d="M20 18L32 12L44 18L49 50H15Z" fill="#171412" stroke="#ffd866" stroke-width="2.2"/>` +
    `<path d="M25 18L32 34L39 18" fill="none" stroke="#ffe484" stroke-width="2.4"/>` +
    `<circle cx="32" cy="24" r="4" fill="#ffd25a"/><rect x="20" y="34" width="24" height="5" fill="#f2be42"/>`),
  trail_ink: () => FRAME('#1f1d1a', '#0f0d0c', '#b8ab96',
    `<path d="M12 46C22 24 40 20 54 16C42 28 28 38 14 50Z" fill="#ece2d0"/>`),
  trail_jade_bamboo: () => FRAME('#102b22', '#081611', '#62f0bc',
    `<path d="M12 46C22 24 40 20 54 16C42 28 28 38 14 50Z" fill="#62f0bc"/>` +
    `<path d="M18 42C26 28 38 24 48 20" fill="none" stroke="#e4fff4" stroke-width="2.2" stroke-linecap="round"/>`),
  trail_crimson_moon: () => FRAME('#300e10', '#160607', '#ff5442',
    `<path d="M12 46C22 24 40 20 54 16C42 28 28 38 14 50Z" fill="#ff4c3b"/>` +
    `<path d="M18 42C26 28 38 24 48 20" fill="none" stroke="#ffd6b0" stroke-width="2.2" stroke-linecap="round"/>`),
  trail_gold_leaf: () => FRAME('#291f0c', '#120d05', '#ffd666',
    `<path d="M12 46C22 24 40 20 54 16C42 28 28 38 14 50Z" fill="#ffcf54"/>` +
    `<path d="M18 42C26 28 38 24 48 20" fill="none" stroke="#fff8d6" stroke-width="2.5" stroke-linecap="round"/>` +
    `<circle cx="24" cy="24" r="2" fill="#ffe680"/><circle cx="44" cy="36" r="2.2" fill="#ffd252"/>`)
};

export function getSwordSvg(id) {
  return (SWORD_ART[id] || SWORD_ART.muk)();
}
export function getRelicSvg(id) {
  return (RELIC_ART[id] || RELIC_ART.mirror)();
}
export function getCosmeticSvg(kind, id) {
  const key = (kind === 'trails' ? 'trail_' : 'cloak_') + id;
  return (COSMETIC_ART[key] || COSMETIC_ART.cloak_ink)();
}
