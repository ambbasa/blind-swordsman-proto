/* 수묵 후처리: 장면을 먹·한지 단색조로 바꾸고 비취·진홍·금 같은 강조색만 남긴다. 윤곽 먹선, 붓 번짐, 한지 결을 더한다. */
import * as THREE from 'three';
import { ShaderPass } from '../../assets/v2/fx-ink/code/vendor/three-r170-addons/postprocessing/ShaderPass.js';

/** Tuning values for the ink-wash pass; every number a designer would tune lives here. */
export const INKWASH = {
  ink: [0.004, 0.0035, 0.003],
  wash: [0.035, 0.032, 0.028],
  paper: [0.80, 0.72, 0.56],
  toneGamma: 0.78,
  bands: 4.0,
  bandSoft: 0.55,
  accentSatLo: 0.16,
  accentSatHi: 0.42,
  accentBoost: 1.35,
  edge: 0.85,
  edgeLo: 0.035,
  edgeHi: 0.16,
  edgeDark: 0.22,
  wobble: 0.0016,
  grain: 0.10,
  vignette: 0.55,
  strength: 1.0
};

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime;
uniform vec3 uInk, uWash, uPaper;
uniform float uEdgeDark, uGamma, uBands, uBandSoft, uSatLo, uSatHi, uBoost, uEdge, uEdgeLo, uEdgeHi, uWobble, uGrain, uVig, uStrength;
varying vec2 vUv;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float L(vec2 uv){ return sqrt(max(luma(texture2D(tDiffuse, uv).rgb), 0.0)); }
void main(){
  vec2 px = 1.0 / uRes;
  vec2 q = vUv * uRes / 220.0;
  vec2 warp = vec2(fbm(q + 3.1), fbm(q + 7.7)) - 0.5;
  vec2 uv = vUv + warp * uWobble * 2.0;
  vec3 src = texture2D(tDiffuse, uv).rgb;
  float l = luma(src);
  float mx = max(src.r, max(src.g, src.b)), mn = min(src.r, min(src.g, src.b));
  float sat = mx > 1e-4 ? (mx - mn) / mx : 0.0;

  /* 먹의 농담: 焦·濃·淡을 부드러운 띠로 나눈다. */
  float t = pow(clamp(sqrt(max(l, 0.0)) * 1.25, 0.0, 1.0), uGamma);
  float b = t * uBands; float fb = fract(b);
  float tb = (floor(b) + smoothstep(0.5 - uBandSoft * 0.5, 0.5 + uBandSoft * 0.5, fb)) / uBands;
  tb = mix(tb, t, 0.35);
  vec3 tone = tb < 0.5 ? mix(uInk, uWash, tb * 2.0) : mix(uWash, uPaper, (tb - 0.5) * 2.0);

  /* 강조색은 살린다 (비취 일섬, 진홍 경고, 금빛 표식). HDR 블룸은 그대로 빛난다. */
  float acc = smoothstep(uSatLo, uSatHi, sat) * smoothstep(0.004, 0.03, l);
  vec3 accent = src * uBoost;
  vec3 col = mix(tone, accent, acc);
  col += max(src - 1.0, 0.0);

  /* 윤곽 먹선: 떨리는 붓처럼 굵기와 위치를 흔든다. */
  float w = 1.0 + 0.8 * vnoise(vUv * uRes / 18.0 + uTime * 0.05);
  vec2 o = px * w;
  float tl = L(uv + vec2(-o.x, o.y)), tc = L(uv + vec2(0, o.y)), tr = L(uv + o);
  float ml = L(uv + vec2(-o.x, 0)), mr = L(uv + vec2(o.x, 0));
  float bl = L(uv - o), bc = L(uv - vec2(0, o.y)), br = L(uv + vec2(o.x, -o.y));
  float gx = (tr + 2.0*mr + br) - (tl + 2.0*ml + bl);
  float gy = (tl + 2.0*tc + tr) - (bl + 2.0*bc + br);
  float e = smoothstep(uEdgeLo, uEdgeHi, length(vec2(gx, gy)));
  e *= 0.6 + 0.4 * vnoise(vUv * uRes / 6.0);
  e *= smoothstep(uEdgeDark, uEdgeDark + 0.18, max(max(tc, bc), max(ml, mr)));
  col = mix(col, uInk, e * uEdge * (1.0 - acc * 0.7));

  /* 한지 결과 번짐 얼룩 */
  float fiber = vnoise(vec2(vUv.x * uRes.x / 1.5, vUv.y * uRes.y / 40.0));
  float grain = (h21(floor(vUv * uRes)) - 0.5) * 0.6 + (fiber - 0.5) * 0.8;
  float stain = fbm(vUv * 3.0 + 11.0);
  col *= 1.0 + uGrain * grain;
  col = mix(col, col * vec3(0.92, 0.86, 0.76), smoothstep(0.55, 0.8, stain) * 0.35);

  vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vig = smoothstep(0.35, 0.95, length(d) + (fbm(vUv * 4.0) - 0.5) * 0.25);
  col = mix(col, uInk, vig * uVig);

  gl_FragColor = vec4(mix(src, col, uStrength), 1.0);
}`;

/** Creates the ink-wash ShaderPass; call tick(dt) each frame and setSize(w, h) on resize. */
export function createInkWashPass(params) {
  const P = Object.assign({}, INKWASH, params || {});
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uInk: { value: new THREE.Vector3().fromArray(P.ink) }, uWash: { value: new THREE.Vector3().fromArray(P.wash) },
      uPaper: { value: new THREE.Vector3().fromArray(P.paper) },
      uGamma: { value: P.toneGamma }, uBands: { value: P.bands }, uBandSoft: { value: P.bandSoft },
      uSatLo: { value: P.accentSatLo }, uSatHi: { value: P.accentSatHi }, uBoost: { value: P.accentBoost },
      uEdgeDark: { value: P.edgeDark }, uEdge: { value: P.edge }, uEdgeLo: { value: P.edgeLo }, uEdgeHi: { value: P.edgeHi },
      uWobble: { value: P.wobble }, uGrain: { value: P.grain }, uVig: { value: P.vignette }, uStrength: { value: P.strength }
    },
    vertexShader: VERT,
    fragmentShader: FRAG
  });
  pass.tick = function (dt) { pass.uniforms.uTime.value += dt || 0; };
  const baseSize = pass.setSize.bind(pass);
  pass.setSize = function (w, h) { baseSize(w, h); pass.uniforms.uRes.value.set(Math.max(1, w), Math.max(1, h)); };
  return pass;
}
