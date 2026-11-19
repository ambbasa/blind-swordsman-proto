/* v2/js/inkdiorama.js — v0.37 비단 병풍 디오라마 에셋(PNG) 로더.
   images CLI 로 그린 수묵화 PNG(투명 컷아웃)를 게임 텍스처로 올린다.
   - 모듈이 로드되는 즉시(타이틀이 뜨기 전) 비동기로 받아 디코드해 둔다 → '출전' 순간에 텍스처 업로드로 멈추지 않는다.
   - 하나라도 실패하면 그 소품만 절차 텍스처(inkpaper.js)로 되돌아간다(게임은 그대로 돈다).
   - 실제 적용: inkchunks.js(소품·바닥·병풍), game.js(조명·프리로드 호출). */
import * as THREE from 'three';

const BASE = new URL('../assets/diorama/', import.meta.url).href;
const FILES = {
  house: 'house.png',
  pine: 'pine.png',
  bamboo: 'bamboo.png',
  lantern: 'lantern.png',
  rock: 'rock.png',
  floor: 'stone_floor.png',
  floorN: 'stone_floor_n.png',
  floorR: 'stone_floor_r.png',
  screen: 'folding_screen.png',
  /* v0.43 막별 원경 파노라마 — 1막 저잣거리·나루터, 2막 안개 산사, 3막 혈월 나락. */
  pano1: 'pano_1.jpg',
  pano2: 'pano_2.jpg',
  pano3: 'pano_3.jpg'
};
const COLORS = { floorN: false, floorR: false };
const REPEAT = { floor: true, floorN: true, floorR: true };

export const tex = {};
const state = { started: false, done: false, t0: 0, ms: 0, ok: {}, fail: [] };

function loadTexture(key, url) {
  return new Promise(function (resolve) {
    const img = new Image();
    img.decoding = 'async';
    const finish = function () {
      let t;
      try {
        t = new THREE.Texture(img);
        t.colorSpace = COLORS[key] === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        t.anisotropy = key === 'screen' ? 2 : 4;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = true;
        if (REPEAT[key]) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
        t.needsUpdate = true;
        tex[key] = t;
        state.ok[key] = (img.naturalWidth || 0) + 'x' + (img.naturalHeight || 0);
      } catch (e) { state.fail.push(key); }
      resolve(t || null);
    };
    img.onload = finish;
    img.onerror = function () { state.fail.push(key); resolve(null); };
    img.src = url;
    if (img.decode) img.decode().then(finish, function () { /* onload 이 처리 */ });
  });
}

let p = null;
export function preloadDiorama() {
  if (p) return p;
  state.started = true;
  state.t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  p = Promise.all(Object.keys(FILES).map(function (k) { return loadTexture(k, BASE + FILES[k]); }))
    .then(function () {
      state.done = true;
      state.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - state.t0);
      try {
        if (window.console && console.info) {
          console.info('[심안] 디오라마 에셋 ' + Object.keys(state.ok).length + '/' + Object.keys(FILES).length + ' · ' + state.ms + 'ms');
        }
      } catch (e) {}
      return state;
    });
  return p;
}

export function isReady() { return state.done; }
export function texOf(k) { return state.done ? (tex[k] || null) : (tex[k] || null); }
/** 막(1~3)에 맞는 원경 파노라마. 없으면 null(→ 기존 병풍 한 장). */
export function panoOf(act) {
  const k = 'pano' + Math.max(1, Math.min(3, act | 0));
  return tex[k] || null;
}
export function aspectOf(k) {
  const t = tex[k];
  if (!t || !t.image) return 1;
  const w = t.image.naturalWidth || t.image.width || 1;
  const h = t.image.naturalHeight || t.image.height || 1;
  return w / Math.max(1, h);
}
export function dioramaInfo() {
  return { started: state.started, ready: state.done, ms: state.ms, ok: Object.assign({}, state.ok), fail: state.fail.slice() };
}

/* 모듈 로드 즉시 시작 — 타이틀 화면이 그려지기 전에 이미 받고 있다. */
try { preloadDiorama(); } catch (e) {}
