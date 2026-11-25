/* 수묵 시네마틱 마무리 패스: ACES 톤매핑 + 먹 비네트 + 한지 알갱이.
   블룸 뒤, OutputPass 앞에 놓는다. */
import * as THREE from 'three';
import { ShaderPass } from '../../assets/v2/fx-ink/code/vendor/three-r170-addons/postprocessing/ShaderPass.js';

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime, uExposure, uVignette, uGrain, uBleed, uChroma;
varying vec2 vUv;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void main(){
  /* 먹 번짐: 아주 옅은 굴절로 한지 위 번진 느낌 */
  vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(d);
  vec2 wob = vec2(vnoise(vUv * uRes / 90.0), vnoise(vUv * uRes / 90.0 + 7.0)) - 0.5;
  vec2 uv = vUv + wob * uBleed * smoothstep(0.25, 0.95, r);
  vec3 src;
  if (uChroma > 0.0005) {
    vec2 dir = normalize(vUv - 0.5 + vec2(1e-5)) * uChroma * smoothstep(0.14, 0.88, r);
    src = vec3(
      texture2D(tDiffuse, clamp(uv + dir, 0.0, 1.0)).r,
      texture2D(tDiffuse, uv).g,
      texture2D(tDiffuse, clamp(uv - dir, 0.0, 1.0)).b
    );
  } else {
    src = texture2D(tDiffuse, uv).rgb;
  }
  src *= uExposure;
  vec3 toned = aces(src);
  /* 먹 비네트: 가장자리로 갈수록 먹이 스민다 */
  float vig = smoothstep(0.32, 1.02, r + (vnoise(vUv * 5.0 + 3.0) - 0.5) * 0.2);
  toned = mix(toned, vec3(0.010, 0.016, 0.020), vig * uVignette);
  /* 한지 알갱이 */
  float g = h21(floor(vUv * uRes)) - 0.5;
  toned *= 1.0 + g * uGrain;
  gl_FragColor = vec4(max(toned, 0.0), 1.0);
}`;

let _activeCinematic = null;
let _chromaPulse = 0;

/** v1.34 타격·일섬 순간 화면 외곽 RGB 색수차 펄스 (0~1 강도) */
export function pulseImpactChroma(amount = 0.65) {
  const a = Math.max(0, Math.min(1, Number(amount) || 0));
  if (a > _chromaPulse) _chromaPulse = a;
}

export function createCinematicPass(params) {
  const P = Object.assign({ exposure: 1.24, vignette: 0.62, grain: 0.022, bleed: 0 }, params || {});
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uExposure: { value: P.exposure }, uVignette: { value: P.vignette }, uGrain: { value: P.grain }, uBleed: { value: P.bleed },
      uChroma: { value: 0 }
    },
    vertexShader: VERT, fragmentShader: FRAG
  });
  _activeCinematic = pass;
  pass.pulseChroma = pulseImpactChroma;
  pass.tick = function (dt) {
    const d = dt || 0;
    pass.uniforms.uTime.value += d;
    if (_chromaPulse > 0) {
      _chromaPulse = Math.max(0, _chromaPulse - d * 5.8);
      pass.uniforms.uChroma.value = _chromaPulse * 0.011;
    } else if (pass.uniforms.uChroma.value !== 0) {
      pass.uniforms.uChroma.value = 0;
    }
  };
  const base = pass.setSize.bind(pass);
  pass.setSize = function (w, h) { base(w, h); pass.uniforms.uRes.value.set(Math.max(1, w), Math.max(1, h)); };
  return pass;
}
