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
    fogHex: 0x141216,
    fogDensity: 0.0080,
    keyHex: 0xfff0d4,
    fillHex: 0x9bb2cc,
    ambHex: 0x6e6454,
    rimHex: 0xffebb8,
    rimStrength: 0.34,
    mistHex: 0x4b4236,
    mistAmt: 0.28,
    specAmt: 0.22,
    lanternHex: 0xffc86e,
    lanternPulse: 0.16,
    slashCore: '#e8c47a',
    slashHot: '#fff8e2',
    fxTint: Object.freeze([1.0, 0.90, 0.68]),
  }),
  2: Object.freeze({
    act: 2,
    name: '2막 대숲 비취',
    uiAccent: '#7ee0c6',
    fogHex: 0x0d1817,
    fogDensity: 0.0090,
    keyHex: 0xdff8ef,
    fillHex: 0x6ea89f,
    ambHex: 0x45605b,
    rimHex: 0x8ef0d8,
    rimStrength: 0.36,
    mistHex: 0x2e4a45,
    mistAmt: 0.32,
    specAmt: 0.24,
    lanternHex: 0x8af5d2,
    lanternPulse: 0.18,
    slashCore: '#4be8bc',
    slashHot: '#e8fff7',
    fxTint: Object.freeze([0.62, 0.97, 0.86]),
  }),
  3: Object.freeze({
    act: 3,
    name: '3막 혈월 주홍',
    uiAccent: '#f0957d',
    fogHex: 0x1b0e10,
    fogDensity: 0.0096,
    keyHex: 0xffcab8,
    fillHex: 0x995866,
    ambHex: 0x5c3c3a,
    rimHex: 0xff987d,
    rimStrength: 0.38,
    mistHex: 0x4a292d,
    mistAmt: 0.34,
    specAmt: 0.25,
    lanternHex: 0xff8254,
    lanternPulse: 0.22,
    slashCore: '#ff523b',
    slashHot: '#ffe8e0',
    fxTint: Object.freeze([1.0, 0.62, 0.50]),
  }),
  4: Object.freeze({
    act: 4,
    name: '4막 나락 자주',
    uiAccent: '#c9a6ff',
    fogHex: 0x120d1c,
    fogDensity: 0.0102,
    keyHex: 0xeadcff,
    fillHex: 0x7e6db0,
    ambHex: 0x4a4063,
    rimHex: 0xc9a6ff,
    rimStrength: 0.40,
    mistHex: 0x352c4d,
    mistAmt: 0.46,
    specAmt: 0.26,
    lanternHex: 0xc29aff,
    lanternPulse: 0.24,
    slashCore: '#b57cff',
    slashHot: '#f6edff',
    fxTint: Object.freeze([0.84, 0.72, 1.0]),
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
    if (lights.rim && lights.rim.color && lights.rim.color.setHex) lights.rim.color.setHex(t.rimHex);
    if (lights.inkUniforms && lights.inkUniforms.uGroundSheenCol && lights.inkUniforms.uGroundSheenCol.value && lights.inkUniforms.uGroundSheenCol.value.setHex) {
      lights.inkUniforms.uGroundSheenCol.value.setHex(t.rimHex);
    }
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
