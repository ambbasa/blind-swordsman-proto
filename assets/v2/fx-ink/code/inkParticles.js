// fx-ink · inkParticles.js — ink splash -> ground stain -> soak-in, for three.js r170. 3 draw calls total (drops, bursts, decals),
// each an InstancedBufferGeometry with a tiny shader (billboard or ground quad, sprite-sheet frame per instance).
// Textures (made by tools/fxink/gen_fx_ink.py): particles/ink-particles.png (8x4), ink-hit-burst.png (6x1), ink-decal-sheet.png (6x4).
//
//   import { InkParticles } from '../../assets/v2/fx-ink/code/inkParticles.js';
//   const ink = new InkParticles(three.scene, { base: '../assets/v2/fx-ink/', quality: 'high' });
//   hurtZombie -> ink.hit(z.x, z.z, dirX, dirZ, { crimson: true });  killZombie -> ink.kill(z.x, z.z, dirX, dirZ);
//   makeSlash  -> ink.slash(from, to);  loop -> ink.update(rawDt);  clearEntities / map change -> ink.clear();
import * as THREE from 'three';

export const INK_QUALITY = {
  high: { maxDrops: 160, maxBursts: 6, maxDecals: 24, perSlash: 7, perHit: 14, perKill: 22 },
  low: { maxDrops: 60, maxBursts: 3, maxDecals: 10, perSlash: 3, perHit: 6, perKill: 9 },
};
export const INK_PARAMS = {
  speed: [2.5, 7.0], spread: 1.8, up: [2, 5], startY: [0.6, 1.4], gravity: -14, life: [0.35, 0.65], size: [0.18, 0.40], spin: 3, dropShare: 0.65,
  burst: { life: 0.36, size: 1.35, y: 1.0 },
  decal: { stageTimes: [0, 0.05, 0.12, 1.2, 2.0, 2.8], fadeAt: 3.4, fadeDur: 0.6, opacity: 0.9, kill: 2.2, hit: 1.4, drop: 0.45, dropChance: 0.15, y: 0.025 },
};

const VERT = /* glsl */`
attribute vec3 iPos; attribute float iSize, iRot, iFrame, iAlpha;
uniform vec2 uGrid; uniform float uGround;
varying vec2 vUv; varying float vA;
void main() {
  float c = cos(iRot), s = sin(iRot); vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iSize;
  float col = mod(iFrame, uGrid.x), row = floor(iFrame / uGrid.x);
  vUv = vec2((col + uv.x) / uGrid.x, 1.0 - (row + 1.0 - uv.y) / uGrid.y); vA = iAlpha;
  if (uGround > 0.5) { gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos + vec3(q.x, 0.0, -q.y), 1.0); }
  else { vec4 mv = modelViewMatrix * vec4(iPos, 1.0); mv.xy += q; gl_Position = projectionMatrix * mv; }
  if (iSize <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // dead slot: off-screen
}`;
const FRAG = /* glsl */`
uniform sampler2D map; varying vec2 vUv; varying float vA;
void main() { vec4 t = texture2D(map, vUv); t.a *= vA; if (t.a < 0.01) discard; gl_FragColor = t;
  #include <colorspace_fragment>
}`;

class Batch {
  constructor(tex, grid, cap, ground, renderOrder) {
    const base = new THREE.PlaneGeometry(1, 1); const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('uv', base.getAttribute('uv'));
    this.cap = cap; this.pos = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.rot = new Float32Array(cap); this.frame = new Float32Array(cap); this.alpha = new Float32Array(cap);
    const add = (n, arr, k) => { const a = new THREE.InstancedBufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); return a; };
    this.attrs = [add('iPos', this.pos, 3), add('iSize', this.size, 1), add('iRot', this.rot, 1), add('iFrame', this.frame, 1), add('iAlpha', this.alpha, 1)];
    g.instanceCount = cap;
    this.mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, uGrid: { value: new THREE.Vector2(grid[0], grid[1]) }, uGround: { value: ground ? 1 : 0 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder; this.geo = g; this.base = base;
  }
  flush() { this.attrs.forEach((a) => { a.needsUpdate = true; }); }
  dispose() { this.geo.dispose(); this.base.dispose(); this.mat.dispose(); }
}
const rnd = (a, b) => a + Math.random() * (b - a);

export class InkParticles {
  constructor(scene, { base = '../assets/v2/fx-ink/', quality = 'high', loader } = {}) {
    this.scene = scene; this.Q = INK_QUALITY[quality] || INK_QUALITY.high; this.P = INK_PARAMS;
    const L = loader || new THREE.TextureLoader(); const tx = (p) => { const t = L.load(base + p); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const cap = INK_QUALITY.high;   // buffers sized for high; low just uses fewer slots
    this.drops = new Batch(tx('particles/ink-particles.png'), [8, 4], cap.maxDrops, false, 7);
    this.bursts = new Batch(tx('particles/ink-hit-burst.png'), [6, 1], cap.maxBursts, false, 7);
    this.decals = new Batch(tx('particles/ink-decal-sheet.png'), [6, 4], cap.maxDecals, true, 1);
    this.d = []; for (let i = 0; i < cap.maxDrops; i++) this.d.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, spin: 0 });
    this.b = []; for (let i = 0; i < cap.maxBursts; i++) this.b.push({ t: 0, life: 0 });
    this.k = []; for (let i = 0; i < cap.maxDecals; i++) this.k.push({ age: -1, row: 0, born: 0 });
    [this.drops, this.bursts, this.decals].forEach((b) => scene.add(b.mesh));
    this.clock = 0;
  }
  setQuality(q) { this.Q = INK_QUALITY[q] || this.Q; }
  _spray(x, z, dx, dz, n, crimson) {
    const P = this.P, D = this.drops; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (let k = 0; k < n; k++) {
      let i = -1; for (let j = 0; j < this.Q.maxDrops; j++) if (this.d[j].life <= 0) { i = j; break; } if (i < 0) return;
      const a = Math.atan2(dz, dx) + (Math.random() - 0.5) * P.spread, sp = rnd(P.speed[0], P.speed[1]); const s = this.d[i];
      s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp; s.vy = rnd(P.up[0], P.up[1]); s.max = s.life = rnd(P.life[0], P.life[1]); s.spin = (Math.random() - 0.5) * 2 * P.spin;
      D.pos.set([x, rnd(P.startY[0], P.startY[1]), z], i * 3); D.size[i] = rnd(P.size[0], P.size[1]); D.rot[i] = 0; D.alpha[i] = 1;
      D.frame[i] = (crimson ? 16 : 0) + (Math.random() < P.dropShare ? 0 : 8) + ((Math.random() * 8) | 0);
    }
  }
  _burst(x, z) {
    const B = this.bursts; let i = -1; for (let j = 0; j < this.Q.maxBursts; j++) if (this.b[j].life <= 0) { i = j; break; } if (i < 0) return;
    this.b[i].t = 0; this.b[i].life = this.P.burst.life; B.pos.set([x, this.P.burst.y, z], i * 3); B.size[i] = this.P.burst.size; B.rot[i] = Math.random() * 6.28; B.frame[i] = 0; B.alpha[i] = 1;
  }
  decal(x, z, size) {
    const K = this.decals, P = this.P.decal; let i = -1, oldest = 0, ob = Infinity;
    for (let j = 0; j < this.Q.maxDecals; j++) { if (this.k[j].age < 0) { i = j; break; } if (this.k[j].born < ob) { ob = this.k[j].born; oldest = j; } }
    if (i < 0) i = oldest;   // recycle the oldest
    this.k[i] = { age: 0, row: (Math.random() * 4) | 0, born: this.clock };
    K.pos.set([x, P.y, z], i * 3); K.size[i] = size; K.rot[i] = Math.random() * 6.28; K.alpha[i] = P.opacity; K.frame[i] = this.k[i].row * 6;
  }
  slash(from, to) { const mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2; this._spray(mx, mz, to.x - from.x, to.z - from.z, this.Q.perSlash, false); }
  hit(x, z, dx = 1, dz = 0, { crimson = true } = {}) { this._spray(x, z, dx, dz, this.Q.perHit, crimson); this._burst(x, z); this.decal(x, z, this.P.decal.hit); }
  kill(x, z, dx = 1, dz = 0, { crimson = true } = {}) { const l = Math.hypot(dx, dz) || 1; this._spray(x, z, dx, dz, this.Q.perKill, crimson); this._burst(x, z); this.decal(x + dx / l * 0.6, z + dz / l * 0.6, this.P.decal.kill); }
  update(dt) {
    this.clock += dt; const P = this.P, D = this.drops, K = this.decals, B = this.bursts;
    for (let i = 0; i < this.d.length; i++) { const s = this.d[i]; if (s.life <= 0) { D.size[i] = 0; continue; }
      s.life -= dt; s.vy += P.gravity * dt; const o = i * 3; D.pos[o] += s.vx * dt; D.pos[o + 1] += s.vy * dt; D.pos[o + 2] += s.vz * dt; D.rot[i] = -Math.atan2(s.vz, s.vx) + s.spin * (s.max - s.life);
      if (D.pos[o + 1] < 0.03) { D.pos[o + 1] = 0.03; s.vx *= 0.3; s.vz *= 0.3; s.vy = 0; if (Math.random() < P.decal.dropChance) this.decal(D.pos[o], D.pos[o + 2], P.decal.drop); s.life = Math.min(s.life, 0.08); }
      D.alpha[i] = Math.min(1, s.life / (0.3 * s.max)); if (s.life <= 0) D.size[i] = 0; }
    for (let i = 0; i < this.b.length; i++) { const s = this.b[i]; if (s.life <= 0) { B.size[i] = 0; continue; } s.t += dt; B.frame[i] = Math.min(5, Math.floor(s.t / s.life * 6)); if (s.t >= s.life) { s.life = 0; B.size[i] = 0; } }
    const st = P.decal.stageTimes;
    for (let i = 0; i < this.k.length; i++) { const s = this.k[i]; if (s.age < 0) { K.size[i] = 0; continue; } s.age += dt;
      let stage = 0; for (let j = 0; j < st.length; j++) if (s.age >= st[j]) stage = j; K.frame[i] = s.row * 6 + stage;
      if (s.age > P.decal.fadeAt) { K.alpha[i] = Math.max(0, P.decal.opacity * (1 - (s.age - P.decal.fadeAt) / P.decal.fadeDur)); if (K.alpha[i] <= 0) { s.age = -1; K.size[i] = 0; } } }
    D.flush(); B.flush(); K.flush();
  }
  clear() { this.d.forEach((s) => { s.life = 0; }); this.b.forEach((s) => { s.life = 0; }); this.k.forEach((s) => { s.age = -1; }); this.update(0); }
  dispose() { [this.drops, this.bursts, this.decals].forEach((b) => { this.scene.remove(b.mesh); b.dispose(); }); }
}
