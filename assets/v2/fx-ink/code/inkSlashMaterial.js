// fx-ink · inkSlashMaterial.js — brush-ink slash trail shader for three.js r170 (v2 uses import map "three" -> v2/vendor/three.module.min.js)
// One mesh, one draw call: rough brush ink (dry-brush 비백 noise, bristle lanes, ragged hemp edge) that OCCLUDES,
// plus a jade/element blade-light core that ADDS (HDR > 1 -> picked up by bloomSetup.js, threshold 1.0).
// Premultiplied output + CustomBlending(ONE, ONE_MINUS_SRC_ALPHA): ink = normal-over, glow = additive, in the same pass.
//
//   import { createInkSlash } from '../../assets/v2/fx-ink/code/inkSlashMaterial.js';
//   const s = createInkSlash({ from, to, width: pathR() * 1.6 * 1.2, elem: S.dashElem });  scene.add(s.mesh);
//   each frame: if (!s.update(dt)) { scene.remove(s.mesh); s.dispose(); }
import * as THREE from 'three';

export const ELEM_COLORS = { jade: '#2EE6A6', fire: '#FF2E4A', lightning: '#FFC83A', poison: '#B04DFF', ice: '#8EE8FF' };   // BRIEF: 기본 비취, 화염 진홍, 번개 금, 독 자색, 얼음 옥빛
export const ELEM_HOT = { jade: '#E8FFF4', fire: '#FFE6E0', lightning: '#FFF8DC', poison: '#F4E6FF', ice: '#F4FDFF' };
export function elemKey(e) { return ELEM_COLORS[e] ? e : 'jade'; }   // S.dashElem null -> jade

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */`
uniform float uTime, uProgress, uSeed, uCoreGain, uInkAlpha, uAspect, uDry;
uniform vec3 uInk, uRim, uCoreColor, uHot;
varying vec2 vUv;
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + 1.0), f.x), f.y); }
void main() {
  float u = vUv.x * 2.0 - 1.0;          // across the stroke
  float v = 1.0 - vUv.y;                // 0 = press point (dash start), 1 = flying dry tail (dash end)
  // width profile: press blob -> full body -> slightly narrower tail, wobbling
  float w = 0.55 + 0.38 * smoothstep(0.0, 0.12, v) - 0.28 * smoothstep(0.25, 1.0, v) + 0.12 * exp(-pow((v - 0.06) / 0.05, 2.0));
  w += (n1(v * 5.0 + uSeed) - 0.5) * 0.12;
  float edge = (n2(vec2(v * uAspect * 7.0, u * 3.0) + uSeed) - 0.5) * 0.18;           // ragged hemp-brush edge
  float body = smoothstep(0.0, 0.06, w + edge - abs(u));
  // bristle lanes: each lane has its own ink load and runs dry at its own point (edges first) -> 비백 split tail
  float bu = (u / max(w, 0.05)) * 26.0 + uSeed * 7.0;
  float lane = floor(bu), fl = fract(bu);
  float load = 0.55 + 0.45 * h11(lane + uSeed);
  float run = 1.05 - abs(u) * mix(0.35, 0.7, h11(lane * 1.7 + 3.0)) - 0.25 * h11(lane * 2.3 + 9.0);
  float prof = mix(0.72, 1.0, smoothstep(0.5, 0.12, abs(fl - 0.5)));
  float dry = smoothstep(run, run - 0.10, v);
  float gaps = n1(v * uAspect * mix(5.0, 16.0, h11(lane + 5.0)) + lane * 13.1);
  float thr = 0.88 - 0.44 * smoothstep(0.15, 1.0, v) * uDry;                           // dry-brush gaps grow toward the tail
  float ink = clamp(load * prof * dry * smoothstep(thr + 0.02, thr - 0.02, gaps) * 1.25, 0.0, 1.0) * body;
  ink *= smoothstep(0.0, 0.012, v) * smoothstep(1.0, 0.98, v);
  // dissolve: ink dries from the tail back to the press point as uProgress -> 1
  float dmask = 0.62 * (1.0 - v) + 0.38 * n2(vec2(u * 3.0, v * uAspect * 4.0) + uSeed * 3.0);
  float th = smoothstep(0.25, 1.0, uProgress) * 1.05;
  float a = ink * uInkAlpha * smoothstep(th, th + 0.08, dmask);
  // blade light core (additive, HDR)
  float cw = 0.055 * w + 0.012;
  float taper = smoothstep(0.0, 0.05, v) * pow(1.0 - smoothstep(0.70, 1.0, v), 0.8);
  float streak = (0.45 + 0.55 * n2(vec2(u * 3.0, v * uAspect * 6.0 - uTime * 5.0))) * (0.55 + 0.45 * smoothstep(0.3, 0.7, n1(v * uAspect * 2.5 + uSeed * 5.0)));   // broken, brushy light, not a neon tube
  float core = exp(-pow(u / cw, 2.0)) * taper * streak;
  float hot = exp(-pow(u / (0.25 * cw), 2.0)) * taper;
  float halo = exp(-pow(u / (3.0 * cw), 2.0)) * taper * 0.16;
  float cfade = (1.0 - smoothstep(0.0, 0.45, uProgress)) * (uProgress < 0.06 ? 1.3 : 1.0);
  vec3 glow = (uCoreColor * (core * 0.8 + halo) + uHot * hot * 0.9) * cfade * uCoreGain * (0.35 + 0.65 * ink + 0.25 * body);   // light lives in the wet ink, breaks with the dry-brush gaps
  vec3 inkCol = uInk * (0.8 + 0.4 * (1.0 - load)) + uRim * 0.004 * prof;                 // ink must stay the darkest value on the ground (sheen ~0)
  gl_FragColor = vec4(inkCol * a + glow, a);
  #include <colorspace_fragment>
}`;

export function createInkSlashMaterial(opt = {}) {
  const e = elemKey(opt.elem);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uProgress: { value: 0 }, uSeed: { value: opt.seed != null ? opt.seed : Math.random() * 100 },
      uCoreGain: { value: opt.coreGain != null ? opt.coreGain : 1.6 },   // >1 = bloom picks it up (bloom threshold 1.0); 1.2 when bloom is off
      uInkAlpha: { value: opt.inkAlpha != null ? opt.inkAlpha : 0.95 }, uAspect: { value: opt.aspect || 4 }, uDry: { value: opt.dry != null ? opt.dry : 1 },
      uInk: { value: new THREE.Color('#0E0C0A') }, uRim: { value: new THREE.Color('#E9DFC8') },
      uCoreColor: { value: new THREE.Color(opt.color || ELEM_COLORS[e]) }, uHot: { value: new THREE.Color(ELEM_HOT[e]) },
    },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true,
  });
}

/** Ground slash from `from` to `to` ({x,z}). Returns { mesh, material, update(dt) -> stillAlive, dispose(), setElem(e) }.
 *  Orientation: rotation (-PI/2, 0, atan2(dx, dz)) -> local +Y points back to `from` (press end). (game.js makeSlash uses -atan2(dx,dz): mirrored on diagonals.) */
export function createInkSlash({ from, to, width = 2.6, elem = null, life = 0.55, y = 0.05, coreGain, seed, sharedGeometry } = {}) {
  const dx = to.x - from.x, dz = to.z - from.z, len = Math.max(0.2, Math.hypot(dx, dz));
  const geo = sharedGeometry || new THREE.PlaneGeometry(1, 1);
  const material = createInkSlashMaterial({ elem, aspect: len / width, coreGain, seed });
  const mesh = new THREE.Mesh(geo, material);
  mesh.scale.set(width, len, 1);
  mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, dz));
  mesh.position.set((from.x + to.x) / 2, y, (from.z + to.z) / 2);
  mesh.renderOrder = 5; mesh.frustumCulled = false;
  let t = 0;
  return {
    mesh, material,
    update(dt) { t += dt; material.uniforms.uTime.value += dt; material.uniforms.uProgress.value = Math.min(1, t / life); return t < life; },
    setElem(e) { const k = elemKey(e); material.uniforms.uCoreColor.value.set(ELEM_COLORS[k]); material.uniforms.uHot.value.set(ELEM_HOT[k]); },
    dispose() { material.dispose(); if (!sharedGeometry) geo.dispose(); },
  };
}

/** Optional: compile the program once at map load (avoids a hitch on the first slash). */
export function prewarmInkSlash(renderer, scene, camera) {
  const s = createInkSlash({ from: { x: 0, z: 0 }, to: { x: 0, z: 1 }, y: -50 });
  scene.add(s.mesh); try { renderer.compile(scene, camera); } catch (e) { /* older renderers */ } scene.remove(s.mesh); s.dispose();
}
