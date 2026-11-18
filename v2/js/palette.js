/* v2/js/palette.js — 『심안』 단일 팔레트 토큰.
   v0.39 1단계: CSS·2D 캔버스·3D 재질이 각자 들고 있던 비취/청옥/진홍/금 색을 한 곳으로 모은다.
   - PALETTE: 역할 이름 하나 = 색 하나(#rrggbb sRGB). 화면에 칠하는 값은 전부 여기서만 꺼낸다.
   - cssVars(): 같은 값을 CSS 사용자 속성(--sm-*)으로 documentElement 에 주입한다(빌드 없이 단일 소스).
   - inverseTone(): 후처리(수묵 wash → ACES → sRGB)를 통과한 뒤 원하는 색이 나오는 '장면 안' 색.
     씬 배경·안개처럼 "화면에서 이 색으로 보여야 하는" 값은 반드시 이걸 거쳐 넣는다.
   - color()/rgb01(): three 재질·2D 캔버스용 캐시된 값(매 프레임 새 객체를 만들지 않는다). */
import * as THREE from 'three';

/** 역할 토큰. 이름은 재료가 아니라 '무엇을 하는 색'인지로 붙였다. */
export const PALETTE = {
  /* 먹 — 바탕과 가장 깊은 그림자 */
  ink: '#0b0a09',
  ink2: '#1a1714',
  inkDeep: '#05040a',
  inkWash: '#2a231c',
  /* 한지 — 종이와 글자 */
  paper: '#efe4cc',
  paperDim: '#b9ad95',
  hanji: '#ede3cf',
  cutEdge: '#fbf6ea',
  /* 비취 — 심안의 빛(방출)과 안료(획) */
  jade: '#5be8c4',
  jadeInk: '#2ee6a6',
  jadePale: '#8ff0dd',
  /* 진홍 — 낙관·경고·보스 */
  vermilion: '#c8281e',
  vermilionHot: '#ff4a36',
  rust: '#c45a2a',
  /* 금 — 표식·보상·정예 */
  gold: '#d9b45a',
  goldHot: '#e8c04a',
  /* 보랏빛 — 봉인 무늬 */
  violet: '#b48ce8',
  violetPale: '#c9a6ff',
  /* 등불·달빛·안개 — 조명 리그 기본값 */
  rigMoonlight: '#c8c0b0', rigAmbient: '#3a3834', rigHemiSky: '#6a6860', rigHemiGround: '#1a1612', rigFill: '#93a0b8',
  amber: '#ffb45c',
  ember: '#ff8a3a',
  /* 안개 */
  mist: '#b9c4cc',
  /* 공중 입자 — 반딧불·불티 */
  moteJade: '#7dffb0',
  moteCold: '#8fd0ff'
};

/** CSS 로 내보내는 이름(역할 → 속성명). style.css 의 --sm-* 와 같은 값이어야 한다. */
export const CSS_TOKENS = {
  ink: '--sm-ink', ink2: '--sm-ink-2', inkDeep: '--sm-ink-deep', inkWash: '--sm-ink-wash',
  paper: '--sm-paper', paperDim: '--sm-paper-dim', hanji: '--sm-hanji', cutEdge: '--sm-cut-edge',
  jade: '--sm-jade', jadeInk: '--sm-jade-ink', jadePale: '--sm-jade-pale',
  vermilion: '--sm-vermilion', vermilionHot: '--sm-vermilion-hot', rust: '--sm-rust',
  gold: '--sm-gold', goldHot: '--sm-gold-hot',
  violet: '--sm-violet', violetPale: '--sm-violet-pale',
  mist: '--sm-mist', amber: '--sm-amber', ember: '--sm-ember',
  moteJade: '--sm-mote-jade', moteCold: '--sm-mote-cold'
};

const _colorCache = new Map();
/** hex 문자열 → 공유 three.Color(작업 색공간 = linear). 같은 이름은 늘 같은 객체. */
export function color(name) {
  const key = PALETTE[name] ? name : null;
  const hex = key ? PALETTE[key] : String(name);
  let c = _colorCache.get(hex);
  if (!c) { c = new THREE.Color(hex); _colorCache.set(hex, c); }
  return c;
}
/** hex → #rrggbb 그대로(CSS/2D 캔버스용). */
export function hex(name) { return PALETTE[name] || String(name); }
/** hex → [r,g,b] 0~1 sRGB(2D 캔버스 fillStyle 조립용). */
export function rgb01(name, out) {
  const h = hex(name).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  if (out) { out[0] = r; out[1] = g; out[2] = b; return out; }
  return [r, g, b];
}
/** hex → [r,g,b] 0~255(기존 2D 코드가 쓰던 fogRgb 형식). */
export function rgb255(name) { const v = rgb01(name); return [Math.round(v[0] * 255), Math.round(v[1] * 255), Math.round(v[2] * 255)]; }
/** hex → rgba() 문자열. */
export function rgba(name, a) { const v = rgb01(name); return 'rgba(' + Math.round(v[0] * 255) + ',' + Math.round(v[1] * 255) + ',' + Math.round(v[2] * 255) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }

/** CSS 토큰 주입. index.html 의 style.css 가 같은 기본값을 들고 있으므로 JS 가 늦어도 화면은 그대로다. */
export function installCssVars(root) {
  try {
    const el = root || (typeof document !== 'undefined' ? document.documentElement : null);
    if (!el || !el.style) return false;
    Object.keys(CSS_TOKENS).forEach(function (k) { el.style.setProperty(CSS_TOKENS[k], PALETTE[k]); });
    return true;
  } catch (e) { return false; }
}

/* ------------------------------------------------------------------------------------------------
   역톤매핑 — '화면에서 이 색으로 보이게' 하는 장면 안(linear) 색.
   후처리 체인의 실제 변환을 JS 로 그대로 옮겨 두고, 목표 sRGB 로 수렴시킨다.
     inkwash(수묵 wash, uStrength 0.85) → cinematic(노출 1.32 · ACES) → sRGB
   ---------------------------------------------------------------------------------------------- */
/** inkwash.js 의 INKWASH 기본값과 같아야 한다(바뀌면 여기도 같이 고친다). */
export const GRADE_REF = {
  ink: [0.004, 0.0035, 0.003], wash: [0.035, 0.032, 0.028], paper: [0.78, 0.71, 0.57],
  toneGamma: 0.9, bands: 5.0, bandSoft: 1.0, accentSatLo: 0.16, accentSatHi: 0.42, accentBoost: 1.35, strength: 0.85,
  exposure: 1.32
};

function aces(x) {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  const v = (x * (a * x + b)) / (x * (c * x + d) + e);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function toSrgb(c) { return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
function smoothstep(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1e-6))); return t * t * (3 - 2 * t); }
function luma(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }

/** 장면 안 linear rgb → 화면 sRGB(수묵 wash + ACES + 노출). out 은 [r,g,b] 0~1. */
export function gradeForward(lin, out) {
  const G = GRADE_REF;
  const l = Math.max(0, luma(lin));
  const mx = Math.max(lin[0], Math.max(lin[1], lin[2])), mn = Math.min(lin[0], Math.min(lin[1], lin[2]));
  const sat = mx > 1e-4 ? (mx - mn) / mx : 0;
  let t = Math.pow(Math.min(1, Math.max(0, Math.sqrt(l) * 1.25)), G.toneGamma);
  const b = t * G.bands, fb = b - Math.floor(b);
  let tb = (Math.floor(b) + smoothstep(0.5 - G.bandSoft * 0.5, 0.5 + G.bandSoft * 0.5, fb)) / G.bands;
  tb = tb + (t - tb) * 0.35;
  const tone = tb < 0.5
    ? [G.ink[0] + (G.wash[0] - G.ink[0]) * tb * 2, G.ink[1] + (G.wash[1] - G.ink[1]) * tb * 2, G.ink[2] + (G.wash[2] - G.ink[2]) * tb * 2]
    : [G.wash[0] + (G.paper[0] - G.wash[0]) * (tb - 0.5) * 2, G.wash[1] + (G.paper[1] - G.wash[1]) * (tb - 0.5) * 2, G.wash[2] + (G.paper[2] - G.wash[2]) * (tb - 0.5) * 2];
  const acc = smoothstep(G.accentSatLo, G.accentSatHi, sat) * smoothstep(0.004, 0.03, l);
  const o = out || [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const col = tone[i] + (lin[i] * G.accentBoost - tone[i]) * acc + Math.max(lin[i] - 1, 0);
    const mixed = lin[i] + (col - lin[i]) * G.strength;
    o[i] = toSrgb(aces(Math.max(0, mixed) * G.exposure));
  }
  return o;
}

/** sRGB hex → 장면 안 linear [r,g,b]. 후처리를 통과한 뒤 화면에서 그 hex 로 보인다. */
export function inverseTone(hexColor, out) {
  const h = String(hexColor).replace('#', '');
  const want = [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  const x = [0.02, 0.02, 0.02];
  const got = [0, 0, 0];
  for (let it = 0; it < 40; it++) {
    gradeForward(x, got);
    for (let i = 0; i < 3; i++) {
      const ratio = (want[i] + 0.02) / (Math.max(got[i], -0.015) + 0.02);
      x[i] = Math.min(8, Math.max(1e-5, x[i] * Math.pow(ratio, 0.75)));
    }
  }
  const o = out || [0, 0, 0];
  o[0] = x[0]; o[1] = x[1]; o[2] = x[2];
  return o;
}

/** inverseTone 결과를 three.Color(linear) 로. 색키가 같으면 다시 계산하지 않는다. */
const _toneCache = new Map();
export function tonedColor(hexColor, outColor) {
  const key = String(hexColor);
  let c = _toneCache.get(key);
  if (!c) {
    const v = inverseTone(key);
    c = new THREE.Color().setRGB(v[0], v[1], v[2], THREE.LinearSRGBColorSpace);
    _toneCache.set(key, c);
  }
  return outColor ? outColor.copy(c) : c;
}
