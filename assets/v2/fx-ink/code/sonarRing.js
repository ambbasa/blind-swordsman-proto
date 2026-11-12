// fx-ink · sonarRing.js — stronger 심안 파동 ring (BRIEF 다음 수정 4). Two parts, use either or both:
//  A) drawSonarRing2D(ctx, w, h, wave, opt): drop-in for the ring block at the end of game.js drawSightFog() (2D canvas #sightFog).
//     Same geometry as now (centre w*0.5, h*0.58, r = min(w,h)*(0.18 + 0.7*(1-wave))) but: bright paper core 4.5 px (was 2.5 px @ .55),
//     dark ink halo both sides (separates it from the dark ground), jade outer glow band, brush-broken segments (ink look, not a vector circle).
//  B) createSonarRingMesh(): world-space ground ring around the hero, HDR jade/paper (gain 1.15) -> bloomSetup.js makes it glow.
//     update(wave, hero) each frame; it reveals the floor under the fog because it is drawn in the 3D scene.
import * as THREE from 'three';

export const SONAR_BEFORE = { core: 'rgba(237,227,207,0.55*wave)', coreWidth: 2.5, inner: 'rgba(30,24,18,0.35*wave) 6px' };
export const SONAR_PARAMS = {
  coreColor: [246, 238, 219], coreAlpha: 0.95, coreWidth: 4.5,        // css px (x devicePixelRatio handled by the caller's transform)
  haloColor: [6, 5, 4], haloAlpha: 0.6, haloWidth: 12,                 // dark ink band under the core (both sides)
  glowColor: [46, 230, 166], glowAlpha: 0.20, glowWidth: 8, glowOffset: 6,   // jade band just outside
  innerRatio: 0.72, innerAlpha: 0.45, innerWidth: 2,                    // thin second ring (paper) instead of the old dark 6 px one
  segments: 48, gap: 0.16, seed: 7,
};
function hash(i, s) { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }

export function drawSonarRing2D(ctx, w, h, wave, opt = {}) {
  if (!(wave > 0.02)) return;
  const P = Object.assign({}, SONAR_PARAMS, opt); const cx = opt.cx != null ? opt.cx : w * 0.5, cy = opt.cy != null ? opt.cy : h * 0.58;
  const r = opt.r != null ? opt.r : Math.min(w, h) * (0.18 + 0.7 * (1 - wave)); const k = Math.min(1, wave * 1.25);
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
  ctx.save(); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = rgba(P.haloColor, P.haloAlpha * k); ctx.lineWidth = P.haloWidth; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r + P.glowOffset, 0, Math.PI * 2); ctx.strokeStyle = rgba(P.glowColor, P.glowAlpha * k); ctx.lineWidth = P.glowWidth; ctx.stroke();
  const n = P.segments, step = Math.PI * 2 / n, rot = (1 - wave) * 0.6;    // brush-broken paper core, slowly rotating as it expands
  for (let i = 0; i < n; i++) {
    if (hash(i, P.seed) < P.gap) continue;
    const a0 = rot + i * step, a1 = a0 + step * (0.75 + 0.35 * hash(i + 3, P.seed));
    ctx.beginPath(); ctx.arc(cx, cy, r + (hash(i + 9, P.seed) - 0.5) * 2, a0, a1);
    ctx.strokeStyle = rgba(P.coreColor, P.coreAlpha * k * (0.75 + 0.25 * hash(i + 5, P.seed))); ctx.lineWidth = P.coreWidth * (0.7 + 0.5 * hash(i + 7, P.seed)); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, r * P.innerRatio, 0, Math.PI * 2); ctx.strokeStyle = rgba(P.coreColor, P.innerAlpha * k); ctx.lineWidth = P.innerWidth; ctx.stroke();
  ctx.restore();
}

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
uniform float uR, uWidth, uK, uGain, uTime; uniform vec3 uCore, uGlow; varying vec2 vUv;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n1(float x){ float i = floor(x), f = fract(x); f = f*f*(3.-2.*f); return mix(h21(vec2(i, 1.7)), h21(vec2(i + 1., 1.7)), f); }
void main(){
  vec2 p = (vUv - 0.5) * 2.0; float d = length(p); float ang = atan(p.y, p.x);
  float brush = 0.65 + 0.35 * n1(ang * 9.0 + uTime * 0.5); float gap = step(0.18, n1(ang * 5.0 + 3.0));
  float core = exp(-pow((d - uR) / (uWidth * brush), 2.0)) * gap;
  float glow = exp(-pow((d - uR - uWidth * 2.0) / (uWidth * 2.0), 2.0)) * 0.18;
  float halo = exp(-pow((d - uR) / (uWidth * 3.2), 2.0)) * 0.55;      // dark ink band (occludes)
  float a = halo * uK;
  vec3 col = (uCore * core * 1.0 + uGlow * glow) * uK * uGain;        // HDR: > 1 blooms
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;
export function createSonarRingMesh({ maxRadius = 9, gain = 1.15, core = '#F6EEDB', glow = '#2EE6A6' } = {}) {
  const mat = new THREE.ShaderMaterial({ uniforms: { uR: { value: 0.2 }, uWidth: { value: 0.02 }, uK: { value: 0 }, uGain: { value: gain }, uTime: { value: 0 },
    uCore: { value: new THREE.Color(core) }, uGlow: { value: new THREE.Color(glow) } }, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true });
  const geo = new THREE.PlaneGeometry(maxRadius * 2, maxRadius * 2); const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.06; mesh.renderOrder = 3; mesh.visible = false; mesh.frustumCulled = false;
  return {
    mesh,
    update(wave, hero, dt = 0.016) {   // wave: 1 -> 0 (S.sightWave), hero: {x,z}
      mesh.visible = wave > 0.02; if (!mesh.visible) return;
      const t = 1 - wave; mat.uniforms.uR.value = 0.12 + 0.86 * t; mat.uniforms.uWidth.value = 0.004 + 0.003 * (1 - t);
      mat.uniforms.uK.value = Math.min(1, wave * 1.4); mat.uniforms.uTime.value += dt; mesh.position.x = hero.x; mesh.position.z = hero.z;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
