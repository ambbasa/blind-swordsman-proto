// ===== fx-ink 주입 미리보기 HARNESS v2 (designer, 11/12) — NOT game code =====
// measure.playwright.js routes v2/index.html and inserts <script type="module" src="/__fxink/harness-code.js"> BEFORE js/game.js.
// It only loads the standalone modules in assets/v2/fx-ink/code/ and hooks them from outside (game js files are untouched).
// Where the dev should call each module instead of these hooks: see assets/v2/fx-ink/README.md "개발자 연결".
import * as THREE from 'three';
import { createInkSlash, prewarmInkSlash } from '/assets/v2/fx-ink/code/inkSlashMaterial.js';
import { InkParticles } from '/assets/v2/fx-ink/code/inkParticles.js';
import { setupBloom } from '/assets/v2/fx-ink/code/bloomSetup.js';
import { drawSonarRing2D, createSonarRingMesh } from '/assets/v2/fx-ink/code/sonarRing.js';

const Q = window.__FXINK_LOW ? 'low' : 'high'; const B = '/assets/v2/fx-ink/';
const CFG = { quality: Q, fogLayers: Q === 'low' ? 1 : 2, rays: Q !== 'low', sonar: window.__FXINK_SONAR || '2d', /* '2d' drop-in (default) | '3d' HDR ground ring (option B): use ONE, not both */ bloom: window.__FXINK_NOBLOOM ? 'off' : Q };
const STAT = { frames: 0, slashes: 0, hits: 0, kills: 0, err: null };
let renderer = null, scene = null, camera = null, bloom = null, ink = null, ring = null, inside = false, last = performance.now();
const slashes = [];

// 1) renderer capture: r170 methods are own properties, but outputColorSpace is a prototype accessor -> set by makeWorld()
const desc = Object.getOwnPropertyDescriptor(THREE.WebGLRenderer.prototype, 'outputColorSpace');
Object.defineProperty(THREE.WebGLRenderer.prototype, 'outputColorSpace', { configurable: true, get: desc.get, set(v) { desc.set.call(this, v); if (!renderer) capture(this); } });
function capture(r) {
  renderer = r; const origRender = r.render; const origSize = r.setSize;
  r.render = function (sc, cam) {                       // game loop: three.renderer.render(scene, camera)
    if (inside) return origRender.call(this, sc, cam);  // passes inside the composer
    if (!scene) init(sc, cam);
    inside = true; try { tick(); bloom.render(); } catch (e) { STAT.err = String(e && e.stack || e).slice(0, 400); origRender.call(this, sc, cam); } finally { inside = false; }
  };
  r.setSize = function (w, h, u) { origSize.call(this, w, h, u); if (bloom) bloom.setSize(w, h); };
}
function init(sc, cam) {
  scene = sc; camera = cam;
  bloom = setupBloom(renderer, scene, camera, { quality: CFG.bloom, override: window.__FXINK_BLOOM_OVR || null });
  ink = new InkParticles(scene, { base: B, quality: Q });
  if (CFG.sonar === '3d') { ring = createSonarRingMesh(); scene.add(ring.mesh); }
  inside = true; try { prewarmInkSlash(renderer, scene, camera); } finally { inside = false; }
  const _add = scene.add; scene.add = function (...o) { o.forEach(onAdd); return _add.apply(this, o); };   // slash strip from makeSlash()
  if (CFG.sonar === '2d') setupSonar2D();
}
// 2) slash: game makeSlash() adds an additive PlaneGeometry(pathR*1.6, len) at y 0.08 -> hide it, add the shader slash instead
function onAdd(o) {
  try {
    if (!(o && o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry' && o.material && o.material.blending === THREE.AdditiveBlending)) return;
    const src = (o.material.map && o.material.map.image && (o.material.map.image.currentSrc || o.material.map.image.src)) || '';
    if (!(/slash/.test(src) || (!/fire-trail/.test(src) && o.position.y > 0.07 && o.position.y < 0.09))) return;
    o.visible = false;
    const len = o.geometry.parameters.height, wid = o.geometry.parameters.width; const th = -o.rotation.z, dx = Math.sin(th), dz = Math.cos(th);
    const from = { x: o.position.x - dx * len / 2, z: o.position.z - dz * len / 2 }, to = { x: o.position.x + dx * len / 2, z: o.position.z + dz * len / 2 };
    const st = window.GPv2 && GPv2.state; const elem = { fire: 'fire', ice: 'ice', poison: 'poison', lightning: 'lightning' }[st && st.dashElem] || 'jade';
    const s = createInkSlash({ from, to, width: wid * 1.2, elem, coreGain: CFG.bloom === 'off' ? 1.2 : 1.6 });
    scene.add(s.mesh); slashes.push(s); ink.slash(from, to); STAT.slashes++;
  } catch (e) { STAT.err = String(e && e.stack || e).slice(0, 400); }
}
// 3) particles: harness polls zombie hp via the public test API (dev: call ink.hit/kill inside hurtZombie/killZombie)
let prevZ = new Map();
function tick() {
  const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000) * (window.__FXINK_TS == null ? 1 : window.__FXINK_TS); last = now; STAT.frames++;
  const st = window.GPv2 && GPv2.state;
  if (st && st.zombies) {
    const d = st.lastDash && st.lastDash.segs && st.lastDash.segs[st.lastDash.segs.length - 1];
    const dir = d && d.to && d.from ? { x: d.to.x - d.from.x, z: d.to.z - d.from.z } : { x: 1, z: 0 };
    const cur = new Map(); st.zombies.forEach((z) => { if (z.alive) cur.set(z.id, { x: z.x, z: z.z, hp: z.hp }); });
    prevZ.forEach((z, id) => { const c = cur.get(id); if (!c) { ink.kill(z.x, z.z, dir.x, dir.z); STAT.kills++; } else if (c.hp < z.hp) { ink.hit(z.x, z.z, dir.x, dir.z); STAT.hits++; } });
    prevZ = cur;
  }
  for (let i = slashes.length - 1; i >= 0; i--) if (!slashes[i].update(dt)) { scene.remove(slashes[i].mesh); slashes[i].dispose(); slashes.splice(i, 1); }
  ink.update(dt);
  const wave = window.__FXINK_WAVE != null ? window.__FXINK_WAVE : ((st && st.sightWave) || 0);
  if (ring && st && st.hero) ring.update(wave, st.hero, dt);
  drawSonar2D(wave);
  atmo(st);
}
// 4) sonar 2D drop-in: own canvas right above #sightFog (dev: replace the ring block at the end of drawSightFog with drawSonarRing2D)
let sc2 = null;
function setupSonar2D() {
  sc2 = document.createElement('canvas'); sc2.id = 'fxinkSonar'; sc2.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
  const sf = document.getElementById('sightFog'); (sf && sf.parentNode || document.getElementById('app')).insertBefore(sc2, sf ? sf.nextSibling : null);
}
function drawSonar2D(wave) {
  if (!sc2) return; const r = (document.getElementById('app') || document.body).getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (sc2.width !== Math.floor(r.width * dpr) || sc2.height !== Math.floor(r.height * dpr)) { sc2.width = Math.floor(r.width * dpr); sc2.height = Math.floor(r.height * dpr); }
  const ctx = sc2.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); if (sc2._had) ctx.clearRect(0, 0, sc2.width, sc2.height); sc2._had = wave > 0.02;
  if (wave > 0.02) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawSonarRing2D(ctx, r.width, r.height, wave); }
}
// 5) atmosphere DOM layers (same as the first harness)
let atmoMap = null;
function atmo(s) {
  if (window.__FXINK_NOATMO) return; const id = (s && s.mapId) || 'map1'; if (id === atmoMap) return; atmoMap = id;
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
window.__fxink = { STAT, CFG, get bloom() { return bloom; }, get ink() { return ink; } };
console.log('[fx-ink] 주입 미리보기 harness v2', JSON.stringify(CFG));
