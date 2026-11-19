/* v2/js/inkcharart.js — v0.38 비단 병풍 디오라마 캐릭터 파츠(PNG) 로더.
   scripts/diorama_chars_build.py 가 구운 파츠 캐시를 게임 텍스처로 올린다.
   - 모듈 로드 즉시(타이틀 전) manifest.json + 파츠 PNG 를 받아 디코드한다 → '출전' 순간 업로드 멈춤 없음.
   - 하나라도 실패하면 rigReady() 가 false 로 남고, art.js 는 기존 코드 드로잉 시트로 되돌아간다(폴백 유지).
   - 파츠마다 다른 텍스처를 쓰므로 프리멀티플라이 알파 그대로 SRGB 로 올린다. */
import * as THREE from 'three';

const BASE = new URL('../assets/diorama/chars/', import.meta.url).href;

export const state = { started: false, ready: false, ms: 0, n: 0, fail: [] };
export let manifest = null;
const tex = {};

function loadImage(url) {
  return new Promise(function (resolve) {
    const img = new Image();
    img.decoding = 'async';
    let done = false;
    const fin = function (ok) {
      if (done) return;
      done = true;
      resolve(ok ? img : null);
    };
    img.onload = function () { fin(true); };
    img.onerror = function () { fin(false); };
    img.src = url;
    if (img.decode) img.decode().then(function () { fin(true); }, function () { /* onload/onerror 가 처리 */ });
  });
}

function makeTex(img) {
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** 모든 파츠 파일 이름(manifest 순회) */
function filesOf(m) {
  const out = [];
  Object.keys(m || {}).forEach(function (k) {
    if (k === 'version' || k === 'tools') return;
    (m[k].parts || []).forEach(function (p) { out.push(p.f); });
    if (m[k].aura) out.push(m[k].aura.f);
  });
  Object.keys((m && m.tools) || {}).forEach(function (k) { out.push(m.tools[k].f); });
  return out;
}

let p = null;
export function preloadChars() {
  if (p) return p;
  state.started = true;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  p = fetch(BASE + 'manifest.json')
    .then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
    .then(function (m) {
      manifest = m;
      const files = filesOf(m);
      return Promise.all(files.map(function (f) {
        return loadImage(BASE + f).then(function (img) {
          if (!img) { state.fail.push(f); return null; }
          tex[f] = makeTex(img);
          return f;
        });
      }));
    })
    .then(function () {
      state.ready = state.fail.length === 0 && !!manifest;
      state.n = Object.keys(tex).length;
      state.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      try {
        if (window.console && console.info) {
          console.info('[심안] 캐릭터 파츠 ' + state.n + '장 · ' + state.ms + 'ms' + (state.fail.length ? ' · 실패 ' + state.fail.join(',') : ''));
        }
      } catch (e) {}
      return state;
    })
    .catch(function (e) {
      state.fail.push(String(e && e.message || e).slice(0, 60));
      state.ready = false;
      return state;
    });
  return p;
}

export function rigReady() { return !!(state.ready && manifest); }
export function texOf(file) { return tex[file] || null; }
export function info() {
  return { ready: state.ready, n: state.n, ms: state.ms, fail: state.fail.slice(), files: Object.keys(tex) };
}

/* v0.42: 자동 프리로드 제거 — inkchars3d.preload() 가 포즈 자산을 먼저 시도하고,
   실패했을 때만 이 파츠를 받는다. */
