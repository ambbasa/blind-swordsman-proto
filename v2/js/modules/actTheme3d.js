/**
 * v2/js/modules/actTheme3d.js
 * 심안(SIMAN) v0.50 — UI(v049-theme-overhaul.css)와 3D 무대(inkarena·inkhero3d·inkfx3d·inkslash3d)를
 * 하나로 통합하는 1~4막 상용화 비주얼 팔레트 단일 소스.
 */

export const ACT_THEMES_3D = Object.freeze({
  1: Object.freeze({
    act: 1,
    name: '1막 달빛 금박',
    uiAccent: '#e1ba82',
    fogHex: 0x121014,
    fogDensity: 0.0082,
    keyHex: 0xf4e3be,
    fillHex: 0x7b92b2,
    ambHex: 0x3b352d,
    rimHex: 0xffe4ad,
    rimStrength: 0.28,
    mistHex: 0x241f1a,
    mistAmt: 0.34,
    specAmt: 0.18,
    lanternHex: 0xffc66e,
    lanternPulse: 0.14,
    slashCore: '#e8c47a',
    slashHot: '#fff8e2',
    fxTint: Object.freeze([1.0, 0.88, 0.64]),
  }),
  2: Object.freeze({
    act: 2,
    name: '2막 대숲 비취',
    uiAccent: '#7ee0c6',
    fogHex: 0x0b1615,
    fogDensity: 0.0094,
    keyHex: 0xc9f2e4,
    fillHex: 0x4b8f84,
    ambHex: 0x223632,
    rimHex: 0x7ee0c6,
    rimStrength: 0.32,
    mistHex: 0x132a26,
    mistAmt: 0.40,
    specAmt: 0.20,
    lanternHex: 0x7ef2cc,
    lanternPulse: 0.18,
    slashCore: '#4be8bc',
    slashHot: '#e8fff7',
    fxTint: Object.freeze([0.58, 0.96, 0.84]),
  }),
  3: Object.freeze({
    act: 3,
    name: '3막 혈월 주홍',
    uiAccent: '#f0957d',
    fogHex: 0x1a0c0d,
    fogDensity: 0.0102,
    keyHex: 0xffb39e,
    fillHex: 0x7a3842,
    ambHex: 0x381e1c,
    rimHex: 0xff8469,
    rimStrength: 0.35,
    mistHex: 0x2e1314,
    mistAmt: 0.42,
    specAmt: 0.22,
    lanternHex: 0xff704d,
    lanternPulse: 0.22,
    slashCore: '#ff523b',
    slashHot: '#ffe8e0',
    fxTint: Object.freeze([1.0, 0.58, 0.48]),
  }),
  4: Object.freeze({
    act: 4,
    name: '4막 나락 자주',
    uiAccent: '#c9a6ff',
    fogHex: 0x100b1a,
    fogDensity: 0.0110,
    keyHex: 0xdcc7ff,
    fillHex: 0x5c478f,
    ambHex: 0x271e38,
    rimHex: 0xc9a6ff,
    rimStrength: 0.38,
    mistHex: 0x1d1330,
    mistAmt: 0.46,
    specAmt: 0.24,
    lanternHex: 0xb788ff,
    lanternPulse: 0.24,
    slashCore: '#b57cff',
    slashHot: '#f6edff',
    fxTint: Object.freeze([0.82, 0.68, 1.0]),
  }),
});

export function actFromStageId(stageId) {
  const s = Math.max(1, Number(stageId || 1));
  return Math.max(1, Math.min(4, Math.ceil(s / 3)));
}

export function getActTheme3D(actNo) {
  const n = Math.max(1, Math.min(4, Number(actNo || 1)));
  return ACT_THEMES_3D[n] || ACT_THEMES_3D[1];
}

/**
 * INK3D 셰이더 유니폼 객체(uKeyCol, uFillCol, uAmbCol, uRimCol, uRim, uMistCol, uMistAmt, uSpecAmt)에
 * 현재 막 테마를 일괄 주입합니다.
 */
export function applyThemeToInkUniforms(u, actNo, lightScale = {}) {
  if (!u) return getActTheme3D(actNo);
  const t = getActTheme3D(actNo);
  const keyS = Number(lightScale.key ?? 1.05);
  const fillS = Number(lightScale.fill ?? 0.34);
  const ambS = Number(lightScale.amb ?? 0.24);
  if (u.uKeyCol && u.uKeyCol.value && u.uKeyCol.value.setHex) u.uKeyCol.value.setHex(t.keyHex).multiplyScalar(keyS);
  if (u.uFillCol && u.uFillCol.value && u.uFillCol.value.setHex) u.uFillCol.value.setHex(t.fillHex).multiplyScalar(fillS);
  if (u.uAmbCol && u.uAmbCol.value && u.uAmbCol.value.setHex) u.uAmbCol.value.setHex(t.ambHex).multiplyScalar(ambS);
  if (u.uRimCol && u.uRimCol.value && u.uRimCol.value.setHex) u.uRimCol.value.setHex(t.rimHex);
  if (u.uRim) u.uRim.value = t.rimStrength;
  if (u.uMistCol && u.uMistCol.value && u.uMistCol.value.setHex) u.uMistCol.value.setHex(t.mistHex);
  if (u.uMistAmt) u.uMistAmt.value = t.mistAmt;
  if (u.uSpecAmt) u.uSpecAmt.value = t.specAmt;
  return t;
}

/**
 * 장면(fog/lights), 아레나(석등/건물), 이펙트(PaperFx), 영웅 3D 재질에 1~4막 테마를 한 번에 동기화합니다.
 */
export function syncSceneActTheme3D({ actNo, scene, lights, arena, paperFx, heroGroup } = {}) {
  const t = getActTheme3D(actNo);

  if (scene) {
    if (scene.fog && scene.fog.color && scene.fog.color.setHex) {
      scene.fog.color.setHex(t.fogHex);
      if ('density' in scene.fog) scene.fog.density = t.fogDensity;
    }
    if (scene.background && scene.background.setHex) {
      scene.background.setHex(t.fogHex);
    }
  }

  if (lights) {
    if (lights.moon && lights.moon.color && lights.moon.color.setHex) lights.moon.color.setHex(t.keyHex);
    if (lights.fill && lights.fill.color && lights.fill.color.setHex) lights.fill.color.setHex(t.fillHex);
    if (lights.amb && lights.amb.color && lights.amb.color.setHex) lights.amb.color.setHex(t.ambHex);
    if (lights.hemi && lights.hemi.color && lights.hemi.color.setHex) lights.hemi.color.setHex(t.rimHex);
  }

  if (arena && typeof arena.applyActTheme === 'function') {
    arena.applyActTheme(t.act);
  }

  if (paperFx && typeof paperFx.setActTheme === 'function') {
    paperFx.setActTheme(t.act);
  }

  if (heroGroup && typeof heroGroup.traverse === 'function') {
    heroGroup.traverse((o) => {
      if (o && o.material && o.material.userData && o.material.userData.inkUniforms) {
        applyThemeToInkUniforms(o.material.userData.inkUniforms, t.act);
      }
    });
  }

  return t;
}
