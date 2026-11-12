// ===== fx-ink INJECTED PREVIEW HARNESS (designer, 11/12) =====
// NOT game code. Loaded by measure.playwright.js into a copy of the build (page.addScriptTag, type=module).
// Shows how assets/v2/fx-ink/* plug in; the dev should port the marked parts into art.js / game.js (see fx-ink/README.md).
import * as THREE from 'three';
const B = window.__FXINK_BASE || '../assets/v2/fx-ink/'; const LOW = !!window.__FXINK_LOW;
const CFG = { maxParticles: LOW ? 60 : 160, perHit: LOW ? 6 : 14, perKill: LOW ? 9 : 22, maxDecals: LOW ? 10 : 24, maxBursts: LOW ? 3 : 6, bloom: !LOW, fogLayers: LOW ? 1 : 2, rays: !LOW };
const L = new THREE.TextureLoader(); const T = {};
function tex(p, opt) { if (T[p]) return T[p]; const t = L.load(B + p); t.colorSpace = THREE.SRGBColorSpace; if (opt && opt.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; T[p] = t; return t; }
let scene = null, camera = null; const STAT = { adds: 0, dressed: 0, planes: [] };
// r170 WebGLRenderer.render is an own property (not patchable on the prototype) -> catch the scene on its first add()
const _add = THREE.Object3D.prototype.add;
THREE.Object3D.prototype.add = function (...objs) {
  if (this.isScene && !scene) { scene = this; initParticles(); requestAnimationFrame(function loop() { requestAnimationFrame(loop); try { tick(); } catch (e) { STAT.err = String(e && e.stack || e).slice(0, 300); } }); }
  if (this === scene) objs.forEach(onSceneAdd);
  return _add.apply(this, objs);
};

// ---------- ① slash: ink ribbon (normal) + elemental core (additive) + bloom (additive) ----------
const ELEMK = { fire: 'fire', ice: 'ice', poison: 'poison', lightning: 'lightning' };
function inkMaterial() {
  const m = new THREE.MeshBasicMaterial({ map: tex('slash/slash-ink-ribbon-512.png'), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 1 });
  const dm = tex('slash/slash-dissolve-mask.png');
  m.onBeforeCompile = (sh) => {      // dissolve: ink dries from the tail as opacity falls (opacity is driven by game fadeFx)
    sh.uniforms.dMask = { value: dm };
    sh.fragmentShader = 'uniform sampler2D dMask;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>',
      '#include <alphamap_fragment>\n float th = 1.0 - clamp(opacity * 1.18, 0.0, 1.0);\n float dmk = texture2D(dMask, vMapUv).r;\n if (dmk < th) discard;\n diffuseColor.a = texture2D(map, vMapUv).a * smoothstep(th, th + 0.08, dmk);');
  };
  m.customProgramCacheKey = () => 'fxink-dissolve';
  return m;
}
function onSceneAdd(o) {
  STAT.adds++;
  try { if (o && o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry' && o.material && o.material.blending === THREE.AdditiveBlending && isSlash(o)) dressSlash(o); } catch (e) { console.warn('fxink', e); }
}
function isSlash(o) { const im = o.material.map && o.material.map.image; const src = (im && (im.currentSrc || im.src)) || ''; return /slash/.test(src) || (!/fire-trail/.test(src) && o.position.y > 0.07 && o.position.y < 0.09); }
const slashes = [];
const SLASH_LIFE = 0.55;   // longer than the game's 0.25s: ink lingers then dries (dissolve) from the tail
function dressSlash(o) { STAT.dressed++;
  const g = o.geometry; const len = g.parameters.height; const wid = g.parameters.width;
  const th = -o.rotation.z; const dx = Math.sin(th), dz = Math.cos(th);   // game's dash vector (from rotation) — see README note on its mirror
  o.visible = false;                                                       // hide the old additive strip; our group replaces it
  const st = window.GPv2 && GPv2.state; const elem = ELEMK[st && st.dashElem] || 'jade';
  const grp = new THREE.Group(); grp.position.copy(o.position); grp.position.y = 0.05;
  grp.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, dz));                  // press end at 'from', dry tail at 'to'
  const ink = new THREE.Mesh(new THREE.PlaneGeometry(wid * 1.2, len), inkMaterial()); ink.renderOrder = 5; grp.add(ink);
  const core = new THREE.Mesh(new THREE.PlaneGeometry(wid * 0.55, len), new THREE.MeshBasicMaterial({ map: tex('slash/slash-core-' + elem + '.png'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  core.position.z = 0.01; core.renderOrder = 6; grp.add(core);
  let bloom = null;
  if (CFG.bloom) { bloom = new THREE.Mesh(new THREE.PlaneGeometry(wid * 1.6, len * 1.05), new THREE.MeshBasicMaterial({ map: tex('slash/slash-bloom.png'), color: new THREE.Color(ELEMCOL[elem]), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); bloom.position.z = 0.005; bloom.renderOrder = 4; grp.add(bloom); }
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(wid * 0.9, wid * 0.9), new THREE.MeshBasicMaterial({ map: tex('slash/slash-press-splat.png'), transparent: true, depthWrite: false }));
  sp.position.set(0, -len / 2, -0.005); grp.add(sp);
  _add.call(scene, grp); slashes.push({ grp, ink, core, bloom, sp, t: 0 });
  const fx = o.position.x - dx * len / 2, fz = o.position.z - dz * len / 2;
  spray(fx + dx * len * 0.5, fz + dz * len * 0.5, dx, dz, CFG.perHit >> 1, 0);
}
function slashTick(dt) {
  for (let i = slashes.length - 1; i >= 0; i--) { const s = slashes[i]; s.t += dt; const u = s.t / SLASH_LIFE;
    s.ink.material.opacity = Math.max(0, 1 - Math.max(0, u - 0.25) / 0.75);                 // drives the dissolve threshold
    s.core.material.opacity = Math.max(0, 1 - u / 0.45) * (u < 0.06 ? 1.3 : 1);            // blade light flashes then fades fast
    if (s.bloom) s.bloom.material.opacity = 0.5 * Math.max(0, 1 - u / 0.35);
    s.sp.material.opacity = Math.max(0, 1 - Math.max(0, u - 0.4) / 0.6);
    if (u >= 1) { scene.remove(s.grp); s.grp.traverse((m) => { if (m.material) m.material.dispose(); if (m.geometry) m.geometry.dispose(); }); slashes.splice(i, 1); } }
}
const ELEMCOL = { jade: '#2EE6A6', fire: '#FF2E4A', lightning: '#FFC83A', poison: '#B04DFF', ice: '#8EE8FF' };

// ---------- ② ink particles (one Points draw call) + hit bursts + ground decals ----------
const P = { n: 0, pos: null, vel: null, life: null, max: null, size: null, frame: null, rot: null, spin: null, alpha: null, geo: null, pts: null };
function initParticles() {
  const N = CFG.maxParticles; P.pos = new Float32Array(N * 3); P.vel = new Float32Array(N * 3); P.life = new Float32Array(N); P.max = new Float32Array(N);
  P.size = new Float32Array(N); P.frame = new Float32Array(N); P.rot = new Float32Array(N); P.spin = new Float32Array(N); P.alpha = new Float32Array(N);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P.pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(P.size, 1));
  g.setAttribute('aFrame', new THREE.BufferAttribute(P.frame, 1)); g.setAttribute('aRot', new THREE.BufferAttribute(P.rot, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(P.alpha, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex('particles/ink-particles.png') }, uScale: { value: 400 } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute float aSize,aFrame,aRot,aAlpha; varying float vF,vR,vA; uniform float uScale; void main(){ vF=aFrame; vR=aRot; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/-mv.z; gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform sampler2D map; varying float vF,vR,vA; void main(){ vec2 p=gl_PointCoord-0.5; float c=cos(vR),s=sin(vR); p=vec2(c*p.x-s*p.y,s*p.x+c*p.y)+0.5; if(p.x<0.||p.x>1.||p.y<0.||p.y>1.) discard; float col=mod(vF,8.0), row=floor(vF/8.0); vec4 t=texture2D(map, vec2((col+p.x)/8.0, 1.0-(row+p.y)/4.0)); t.a*=vA; if(t.a<0.02) discard; gl_FragColor=t;\n#include <colorspace_fragment>\n}'
  });
  P.geo = g; P.pts = new THREE.Points(g, m); P.pts.frustumCulled = false; P.pts.renderOrder = 7; _add.call(scene, P.pts);
}
function spray(x, z, dx, dz, n, kind) {   // kind 0 = ink, 1 = crimson (zombie)
  STAT.spray = (STAT.spray || 0) + 1; if (!P.pts) { STAT.noPts = (STAT.noPts || 0) + 1; return; }
  for (let k = 0; k < n; k++) {
    let i = -1; for (let j = 0; j < CFG.maxParticles; j++) if (P.life[j] <= 0) { i = j; break; } if (i < 0) return;
    const a = Math.atan2(dz, dx) + (Math.random() - 0.5) * 1.8, sp = 2.5 + Math.random() * 4.5;
    P.pos.set([x, 0.6 + Math.random() * 0.8, z], i * 3); P.vel.set([Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp], i * 3);
    P.max[i] = P.life[i] = 0.35 + Math.random() * 0.3; P.size[i] = 0.18 + Math.random() * 0.22;
    P.frame[i] = (kind ? 16 : 0) + (Math.random() < 0.65 ? 0 : 8) + ((Math.random() * 8) | 0); P.rot[i] = -a; P.spin[i] = (Math.random() - 0.5) * 6; P.alpha[i] = 1;
  }
}
const bursts = [], decals = [];
function burst(x, z) {
  if (bursts.length >= CFG.maxBursts) return;
  const t = tex('particles/ink-hit-burst.png').clone(); t.needsUpdate = true; t.repeat.set(1 / 6, 1);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(1.35, 1.35, 1); s.position.set(x, 1.0, z); s.renderOrder = 7;
  _add.call(scene, s); bursts.push({ s, t: 0, life: 0.36 });
}
function decal(x, z, sz) {
  if (decals.length >= CFG.maxDecals) { const d = decals.shift(); scene.remove(d.m); d.m.material.dispose(); }
  const t = tex('particles/ink-decal-sheet.png').clone(); t.needsUpdate = true; t.repeat.set(1 / 6, 1 / 4); const row = (Math.random() * 4) | 0;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.9 }));
  m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28); m.position.set(x, 0.025, z); m.renderOrder = 1; _add.call(scene, m);
  decals.push({ m, t, row, age: 0 });
}
let prevZ = new Map(), last = performance.now();
function tick() {
  if (!scene) return;
  const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000) * (window.__FXINK_TS == null ? 1 : window.__FXINK_TS); last = now;
  // hit detection (harness only: polls the public test API; in game call fxInk.hit(z, dir) inside hurtZombie/killZombie)
  const st = window.GPv2 && GPv2.state;
  if (st && st.zombies) { const snap = { lastDash: st.lastDash, zombies: st.zombies.filter((z) => z.alive) };
    const cur = new Map(); const d = snap.lastDash && snap.lastDash.segs && snap.lastDash.segs[snap.lastDash.segs.length - 1];
    const dir = d && d.to && d.from ? { x: d.to.x - d.from.x, z: d.to.z - d.from.z } : { x: 1, z: 0 }; const dl = Math.hypot(dir.x, dir.z) || 1;
    snap.zombies.forEach((z) => cur.set(z.id, { id: z.id, x: z.x, z: z.z, hp: z.hp }));
    STAT.ticks = (STAT.ticks || 0) + 1; (STAT.tt = STAT.tt || []).push(Math.round(performance.now())); STAT.nz = cur.size; prevZ.forEach((z, id) => { const c = cur.get(id); if (c && c.hp < z.hp) STAT.hits = (STAT.hits || 0) + 1;
      if (!c) { spray(z.x, z.z, dir.x / dl, dir.z / dl, CFG.perKill, 1); burst(z.x, z.z); decal(z.x + dir.x / dl * 0.6, z.z + dir.z / dl * 0.6, 2.2); }
      else if (c.hp < z.hp) { spray(z.x, z.z, dir.x / dl, dir.z / dl, CFG.perHit, 1); burst(z.x, z.z); decal(z.x, z.z, 1.4); } });
    prevZ = cur;
  }
  for (let i = 0; i < CFG.maxParticles; i++) { if (P.life[i] <= 0) { P.alpha[i] = 0; continue; }
    P.life[i] -= dt; P.vel[i * 3 + 1] -= 14 * dt;
    P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt; P.rot[i] += P.spin[i] * dt;
    if (P.pos[i * 3 + 1] < 0.03) { P.pos[i * 3 + 1] = 0.03; P.vel[i * 3] *= 0.3; P.vel[i * 3 + 2] *= 0.3; P.vel[i * 3 + 1] = 0; if (Math.random() < 0.15 && decals.length < CFG.maxDecals) decal(P.pos[i * 3], P.pos[i * 3 + 2], 0.45); P.life[i] = Math.min(P.life[i], 0.08); }
    const u = P.life[i] / P.max[i]; P.alpha[i] = Math.min(1, u / 0.3); }
  ['position', 'aAlpha', 'aRot', 'aFrame', 'aSize'].forEach((k) => { P.geo.attributes[k].needsUpdate = true; });
  for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.t += dt; const f = Math.min(5, Math.floor(b.t / b.life * 6)); b.s.material.map.offset.x = f / 6; if (b.t >= b.life) { scene.remove(b.s); b.s.material.dispose(); bursts.splice(i, 1); } }
  for (let i = decals.length - 1; i >= 0; i--) { const d = decals[i]; d.age += dt;
    const st = d.age < 0.05 ? 0 : d.age < 0.12 ? 1 : d.age < 1.2 ? 2 : d.age < 2.0 ? 3 : d.age < 2.8 ? 4 : 5;   // spread .12s, hold 1.1s, soak 2.4s
    d.t.offset.set(st / 6, 1 - (d.row + 1) / 4); if (d.age > 3.4) { d.m.material.opacity = Math.max(0, 0.9 - (d.age - 3.4) * 1.5); if (d.m.material.opacity <= 0) { scene.remove(d.m); d.m.material.dispose(); decals.splice(i, 1); } } }
  slashTick(dt); STAT.live = { particles: Array.from(P.life).filter((x) => x > 0).length, bursts: bursts.length, decals: decals.length, slashes: slashes.length };
  atmoTick();
}

// ---------- ④ atmosphere: DOM layers between the 3D view (z0) and the gesture ink/marks (z4/z6) ----------
let atmoMap = null;
function atmoTick() {
  const s = window.GPv2 && GPv2.state; const id = (s && s.mapId) || 'map1';
  if (id === atmoMap) return; atmoMap = id;
  let root = document.getElementById('fxinkAtmo');
  if (!root) {
    const css = document.createElement('style'); css.textContent = `
#fxinkAtmo{position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden}
#fxinkAtmo .lay{position:absolute;left:0;width:200%;height:100%;background-repeat:repeat;will-change:transform}
#fxinkAtmo .edge{-webkit-mask-image:linear-gradient(#000 0%,rgba(0,0,0,.85) 14%,transparent 30%,transparent 68%,rgba(0,0,0,.85) 86%,#000 100%);mask-image:linear-gradient(#000 0%,rgba(0,0,0,.85) 14%,transparent 30%,transparent 68%,rgba(0,0,0,.85) 86%,#000 100%)}
#fxinkAtmo .a{top:0;animation:fxinkScroll 64s linear infinite;opacity:.95}
#fxinkAtmo .b{top:0;animation:fxinkScroll 41s linear infinite reverse;opacity:.75}
#fxinkAtmo .rays{position:absolute;inset:-10% -10% auto auto;width:90%;height:90%;background-size:cover;opacity:.5;animation:fxinkRays 9s ease-in-out infinite alternate;-webkit-mask-image:radial-gradient(ellipse at 20% 0%,#000 30%,transparent 75%)}
@keyframes fxinkScroll{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
@keyframes fxinkRays{from{opacity:.32;transform:translate3d(0,0,0)}to{opacity:.55;transform:translate3d(-2%,1%,0)}}`;
    document.head.appendChild(css); root = document.createElement('div'); root.id = 'fxinkAtmo';
    const app = document.getElementById('app'); app.insertBefore(root, document.getElementById('ink'));
  }
  const fs = (window.innerWidth < 600) ? '512px 256px' : '1024px 512px';
  root.innerHTML = (CFG.rays ? `<div class="rays" style="background-image:url(${B}atmo/moonrays-${id}.png)"></div>` : '') +
    `<div class="lay edge a" style="background-image:url(${B}atmo/fog-ink-${id}.png);background-size:${fs}"></div>` +
    (CFG.fogLayers > 1 ? `<div class="lay edge b" style="background-image:url(${B}atmo/fog-mist-${id}.png);background-size:${fs}"></div>` : '');
}
window.__fxink = { STAT, CFG, spray, burst, decal };
console.log('[fx-ink] injected preview harness active', JSON.stringify(CFG));
