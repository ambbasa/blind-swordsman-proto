// fx-ink · bloomSetup.js — UnrealBloomPass for v2 (three.js r170, addons vendored from three@0.170.0 in ./vendor/three-r170-addons, MIT).
// HDR-only bloom: threshold 1.0, so ordinary sprites/tiles (<= 1.0) never glow; only things drawn brighter than 1 do:
// slash core (inkSlashMaterial uCoreGain 1.6), sonar ring (sonarRing.js gain 1.15), additive glows that stack > 1.
// The DOM layers (marks, HUD, gesture ink, fog divs) are outside WebGL -> never bloomed, marks stay crisp.
//
//   import { setupBloom, AutoQuality } from '../../assets/v2/fx-ink/code/bloomSetup.js';
//   three.bloom = setupBloom(renderer, scene, camera, { quality: 'high' });      // in makeWorld(), after the camera exists
//   loop: three.bloom.render(rawDt)   (instead of three.renderer.render(three.scene, three.camera))
//   resize: three.bloom.setSize(w, h)  (next to renderer.setSize)
//   auto: const aq = new AutoQuality({ onChange: (q) => three.bloom.setQuality(q) });  loop: aq.tick(realDt)
import * as THREE from 'three';
import { EffectComposer } from './vendor/three-r170-addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three-r170-addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three-r170-addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three-r170-addons/postprocessing/OutputPass.js';

export const BLOOM_PRESETS = {
  //       bloom buffer = view * res ; MSAA samples on the HDR scene target (WebGL2; 0 = off. samples 4 cost x3 frame time in the SW-GL test,
  //       on a desktop GPU you may pass override:{samples:4} to keep the build's antialias:true look) ; strength / radius / HDR threshold
  high: { res: 0.5, samples: 0, strength: 0.6, radius: 0.45, threshold: 1.0 },
  low: { res: 0.25, samples: 0, strength: 0.5, radius: 0.3, threshold: 1.0 },
  off: null,   // plain renderer.render — use on very weak devices (slash core then uses uCoreGain 1.2)
};

export function setupBloom(renderer, scene, camera, { quality = 'high', override = null } = {}) {
  const size = renderer.getSize(new THREE.Vector2()); let q = quality;
  const preset = (k) => (BLOOM_PRESETS[k] && override ? Object.assign({}, BLOOM_PRESETS[k], override) : BLOOM_PRESETS[k]); let P = preset(q);
  let composer = null, bloom = null, rt = null;
  function build() {
    dispose();
    if (!P) return;
    const pr = renderer.getPixelRatio();
    rt = new THREE.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr), { type: THREE.HalfFloatType, samples: P.samples });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x * P.res * 2, size.y * P.res * 2), P.strength, P.radius, P.threshold);
    const base = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => base(Math.max(2, w * P.res * 2), Math.max(2, h * P.res * 2));   // UnrealBloomPass halves internally
    composer.addPass(bloom);
    composer.addPass(new OutputPass());   // linear HDR -> renderer.outputColorSpace (sRGB) with renderer.toneMapping (NoToneMapping in v2)
    composer.setSize(size.x, size.y);
  }
  function dispose() { if (composer) { composer.passes.forEach((p) => p.dispose && p.dispose()); composer.dispose(); } composer = null; bloom = null; rt = null; }
  build();
  return {
    get quality() { return q; }, get composer() { return composer; }, get bloomPass() { return bloom; },
    render(dt) { if (composer) composer.render(dt); else renderer.render(scene, camera); },
    setSize(w, h) { size.set(w, h); if (composer) composer.setSize(w, h); },
    setQuality(nq) { if (nq === q || !(nq in BLOOM_PRESETS)) return; q = nq; P = preset(q); build(); },
    setStrength(s) { if (bloom) bloom.strength = s; },   // e.g. combo burst: 1.4 for 0.3 s, then back
    dispose,
  };
}

/** Drops quality once when the rolling fps is low; never raises it again within a run. */
export class AutoQuality {
  constructor({ onChange, start = 'high', lowFps = 40, low1 = 20, holdSec = 3, windowSec = 2 } = {}) {
    Object.assign(this, { onChange, q: start, lowFps, low1, holdSec, windowSec }); this.buf = []; this.bad = 0;
  }
  tick(realDt) {
    if (this.q === 'off' || !(realDt > 0) || realDt > 1) return this.q;
    this.buf.push(realDt); let sum = 0; for (let i = this.buf.length - 1; i >= 0; i--) { sum += this.buf[i]; if (sum > this.windowSec) { this.buf.splice(0, i); break; } }
    const avg = this.buf.length / Math.max(1e-3, this.buf.reduce((a, b) => a + b, 0)); const worst = 1 / Math.max(...this.buf);
    this.bad = (avg < this.lowFps || worst < this.low1) ? this.bad + realDt : 0;
    if (this.bad > this.holdSec) { this.q = this.q === 'high' ? 'low' : 'off'; this.bad = 0; this.buf = []; if (this.onChange) this.onChange(this.q); }
    return this.q;
  }
}
