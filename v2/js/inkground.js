/* 수묵 바닥: 먹 번짐 웅덩이, 마른 붓 자국, 맵별 담채. 기존 바닥 텍스처는 맵 구분용으로 은은하게만 비친다. */
import * as THREE from 'three';

/** Per-map ground palette (linear RGB) and the tuning values of the ink ground. */
export const INK_GROUND = {
  map1: { ink: [0.010, 0.008, 0.007], wash: [0.050, 0.038, 0.028], tint: [0.090, 0.030, 0.018] },
  map2: { ink: [0.007, 0.008, 0.011], wash: [0.032, 0.038, 0.050], tint: [0.020, 0.030, 0.080] },
  map3: { ink: [0.007, 0.009, 0.007], wash: [0.034, 0.045, 0.030], tint: [0.040, 0.070, 0.020] },
  detail: 0.30,
  washScale: 0.07,
  streakScale: 0.35,
  streak: 0.35,
  tintAmt: 0.55
};

const VERT = /* glsl */`
varying vec2 vUv; varying vec2 vW;
#include <fog_pars_vertex>
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
uniform sampler2D uDetail; uniform vec2 uRepeat; uniform float uDetailW, uWashS, uStreakS, uStreak, uTintAmt;
uniform vec3 uInk, uWash, uTint;
varying vec2 vUv; varying vec2 vW;
#include <fog_pars_fragment>
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
void main(){
  vec2 p = vW;
  float wash = smoothstep(0.35, 0.75, fbm(p * uWashS));
  float pools = smoothstep(0.55, 0.85, fbm(p * uWashS * 0.5 + 9.0));
  vec2 r = mat2(0.80, 0.60, -0.60, 0.80) * p;
  float streak = vn(vec2(r.x * uStreakS, r.y * uStreakS * 9.0));
  streak = smoothstep(0.62, 0.95, streak) * smoothstep(0.3, 0.7, fbm(r * 0.2 + 3.0));
  vec3 col = mix(uInk, uWash, wash);
  col = mix(col, uTint, pools * uTintAmt);
  col += uWash * streak * uStreak;
  vec3 d = texture2D(uDetail, vUv * uRepeat).rgb;
  float dl = dot(d, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(1.0, 0.45 + 1.4 * dl, uDetailW);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Builds the ink-wash ground material for a map; `detail` is the map's own ground texture. */
export function createInkGroundMaterial(mapId, detail) {
  const P = INK_GROUND[mapId] || INK_GROUND.map1;
  const rep = detail && detail.repeat ? detail.repeat.clone() : new THREE.Vector2(1, 1);
  if (detail) { detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.needsUpdate = true; }
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uDetail: { value: null }, uRepeat: { value: rep },
      uDetailW: { value: detail ? INK_GROUND.detail : 0 }, uWashS: { value: INK_GROUND.washScale },
      uStreakS: { value: INK_GROUND.streakScale }, uStreak: { value: INK_GROUND.streak }, uTintAmt: { value: INK_GROUND.tintAmt },
      uInk: { value: new THREE.Vector3().fromArray(P.ink) }, uWash: { value: new THREE.Vector3().fromArray(P.wash) },
      uTint: { value: new THREE.Vector3().fromArray(P.tint) }
    }]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true
  });
  mat.uniforms.uDetail.value = detail || null;
  return mat;
}
