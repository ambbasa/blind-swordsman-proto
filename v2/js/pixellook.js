/* v2/js/pixellook.js — 픽셀 룩(프로토타입): 수묵 후처리 대신 화면 전체를 아트 픽셀 격자 + 고정 팔레트로 바꾸고,
   ink-studio 로 구운 캐릭터 시트(assets/v2/pixel/, tools/pixelbake/bake.js)를 불러온다.
   기본 URL 은 기존 수묵 룩 그대로이고, ?look=pixel 로 열었을 때만 켜진다. */
import * as THREE from 'three';
import { ShaderPass } from '../../assets/v2/fx-ink/code/vendor/three-r170-addons/postprocessing/ShaderPass.js';

/** true only when the URL carries `?look=pixel`; the default URL keeps the ink-wash look. */
export const PIXEL_LOOK = (function () {
  try { return new URLSearchParams(location.search).get('look') === 'pixel'; } catch (e) { return false; }
})();

/** Tuning values for the pixel look. PALETTE must stay equal to tools/pixelbake/palette.js. */
export const PIXELLOOK = {
  artPx: 2,        /* 아트 픽셀 하나의 크기(CSS px). 렌더 해상도(DPR)와 무관하게 화면에서 같은 크기로 보인다. */
  dither: 0.012,   /* 4×4 정렬 디더 세기(선형 색 공간) */
  gain: 1.0,
  palette: [
    0x07080b,
    0x14151a, 0x25272e, 0x3d4049, 0x5f636c,
    0x6a6252, 0x9c927b, 0xcfc4a8, 0xf0e7d0,
    0x0c4f3d, 0x1fa57e, 0x2ee6a6, 0xa6f7dc,
    0x4f100e, 0x9c241c, 0xd8402e, 0xf58a66,
    0x5e410f, 0xa87a1f, 0xe0b23a, 0xf7e08a,
    0x3f4a54, 0x7d8d96, 0xc2d0d4, 0xf2f8f8,
    0x5b4a3c, 0x8c735c, 0xb99a7c, 0xdcc0a0
  ]
};

const N = PIXELLOOK.palette.length;
const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
#define PAL_N ${N}
uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uPx, uDither, uGain;
uniform vec3 uPal[PAL_N];
varying vec2 vUv;
float bayer4(vec2 p){
  vec2 q = floor(mod(p, 4.0));
  float i = q.x + q.y * 4.0;
  float v = 0.0;
  if (i < 0.5) v = 0.0; else if (i < 1.5) v = 8.0; else if (i < 2.5) v = 2.0; else if (i < 3.5) v = 10.0;
  else if (i < 4.5) v = 12.0; else if (i < 5.5) v = 4.0; else if (i < 6.5) v = 14.0; else if (i < 7.5) v = 6.0;
  else if (i < 8.5) v = 3.0; else if (i < 9.5) v = 11.0; else if (i < 10.5) v = 1.0; else if (i < 11.5) v = 9.0;
  else if (i < 12.5) v = 15.0; else if (i < 13.5) v = 7.0; else if (i < 14.5) v = 13.0; else v = 5.0;
  return (v + 0.5) / 16.0 - 0.5;
}
void main(){
  /* 아트 픽셀 격자: 칸의 가운데 한 점만 읽는다. */
  vec2 cell = floor(vUv * uRes / uPx);
  vec2 uv = (cell + 0.5) * uPx / uRes;
  vec3 src = texture2D(tDiffuse, uv).rgb * uGain;
  /* HDR(>1) 은 블룸이 이미 번지게 했다 — 팔레트 안으로 눌러 가장 밝은 색에 붙인다. */
  vec3 c = clamp(src, 0.0, 1.0);
  /* 지각적으로 고르게 비교하려고 감마 공간에서 가장 가까운 팔레트 색을 찾는다. */
  vec3 g = pow(c, vec3(1.0 / 2.2)) + bayer4(cell) * uDither * 4.0;
  float best = 1e9; vec3 pick = uPal[0];
  for (int i = 0; i < PAL_N; i++) {
    vec3 d = g - uPal[i];
    float dist = dot(d * vec3(0.9, 1.2, 0.8), d);
    if (dist < best) { best = dist; pick = uPal[i]; }
  }
  gl_FragColor = vec4(pow(pick, vec3(2.2)), 1.0);
}`;

/** Creates the pixel-look ShaderPass (pixel grid + palette quantisation + ordered dither).
 *  Runs in linear space before OutputPass; setSize(w, h) receives the composer's device-pixel size. */
export function createPixelLookPass(params) {
  const P = Object.assign({}, PIXELLOOK, params || {});
  const pal = P.palette.map(function (h) {
    return new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);
  });
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
      uPx: { value: P.artPx }, uDither: { value: P.dither }, uGain: { value: P.gain }, uPal: { value: pal }
    },
    vertexShader: VERT,
    fragmentShader: FRAG
  });
  const baseSize = pass.setSize.bind(pass);
  /* composer 는 (css 크기 × pixelRatio) 를 넘긴다. artPx 는 CSS px 기준이라 pixelRatio 를 곱해 맞춘다. */
  pass.setSize = function (w, h) {
    baseSize(w, h);
    pass.uniforms.uRes.value.set(Math.max(1, w), Math.max(1, h));
    pass.uniforms.uPx.value = Math.max(1, Math.round(P.artPx * (pass.pixelRatio || 1)));
  };
  /** Tells the pass the renderer pixel ratio so one art pixel stays artPx CSS pixels wide. */
  pass.setPixelRatio = function (pr) { pass.pixelRatio = pr > 0 ? pr : 1; pass.uniforms.uPx.value = Math.max(1, Math.round(P.artPx * pass.pixelRatio)); };
  return pass;
}

/** Loads the baked sprite sheets listed in assets/v2/pixel/pixel-manifest.json.
 *  Resolves to { 'hero-idle': { tex, frames, ... }, ... } or null when the look is off or anything is missing
 *  (the caller then keeps the code-drawn ink sheets). */
export async function loadPixelPack(base) {
  if (!PIXEL_LOOK) return null;
  try {
    const res = await fetch(base + 'pixel/pixel-manifest.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const man = await res.json();
    const out = {};
    await Promise.all(Object.keys(man.sheets).map(function (key) {
      const s = man.sheets[key];
      return new Promise(function (resolve) {
        const img = new Image();
        /* CDN 미러(raw.githack 등)에서도 텍스처 업로드가 막히지 않게 — 같은 출처면 무해. */
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          const t = new THREE.Texture(img);
          t.colorSpace = THREE.SRGBColorSpace;
          /* 확대는 격자를 살리고(Nearest), 축소는 밉맵으로 평균낸다 — 화면에서 셀이 60px 안팎으로 줄어들 때
             Nearest 축소는 아트 픽셀 줄을 건너뛰어 그림이 깨진다. 뭉개진 색은 화면 후처리가 팔레트로 다시 맞춘다. */
          t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
          t.generateMipmaps = true;
          t.needsUpdate = true;
          out[key] = { tex: t, frames: s.frames, fps: s.fps, cell: man.cell, anchor: man.anchor };
          resolve();
        };
        img.onerror = function () { resolve(); };
        img.src = base + 'pixel/' + s.file;
      });
    }));
    return out;
  } catch (e) { return null; }
}
