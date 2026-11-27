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
import { ShaderPass } from './vendor/three-r170-addons/postprocessing/ShaderPass.js';

const FXAA_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uInvRes: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uInvRes;',
    'varying vec2 vUv;',
    'float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }',
    'void main(){',
    '  vec4 cM = texture2D(tDiffuse, vUv);',
    '  vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uInvRes).rgb;',
    '  vec3 rgbNE = texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * uInvRes).rgb;',
    '  vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * uInvRes).rgb;',
    '  vec3 rgbSE = texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * uInvRes).rgb;',
    '  float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(cM.rgb);',
    '  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));',
    '  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));',
    '  if (lMax - lMin < max(0.0312, lMax * 0.0833)) { gl_FragColor = cM; return; }',
    '  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));',
    '  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);',
    '  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);',
    '  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uInvRes;',
    '  vec3 rgbA = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0/3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0/3.0 - 0.5)).rgb);',
    '  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tDiffuse, vUv + dir * -0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);',
    '  float lB = luma(rgbB);',
    '  gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, cM.a);',
    '}'
  ].join('\n'),
};

export const BLOOM_PRESETS = {
  //       bloom buffer = view * res ; MSAA samples on the HDR scene target (WebGL2; 0 = off. samples 4 cost x3 frame time in the SW-GL test,
  //       on a desktop GPU you may pass override:{samples:4} to keep the build's antialias:true look) ; strength / radius / HDR threshold
  // threshold 1.15: 달빛 받은 돌바닥·한지 톤(≈0.8~1.05)까지 번지면 화면이 뿌옇게 뭉개진다. 문턱을 올리고
  //   반경을 줄여 1.15를 넘는 검기 코어·소나 링·타격 섬광만 또렷한 궤적을 갖게 한다.
  high: { res: 0.5, samples: 0, strength: 0.85, radius: 0.33, threshold: 1.15 },
  low: { res: 0.25, samples: 0, strength: 0.7, radius: 0.26, threshold: 1.15 },
  off: null,   // no bloom pass; the post passes (ink wash, tone mapping) still run when given — plain render only without them
};

/** Builds the post chain. depth: true gives both composer targets a depthTexture (rt2 is a clone of rt1,
 *  so it gets its own) — a post pass must read it from its readBuffer, never a fixed target (see inkwash.js). */
export function setupBloom(renderer, scene, camera, { quality = 'high', override = null, post = null, depth = false, fxaa = false } = {}) {
  const size = renderer.getSize(new THREE.Vector2()); let q = quality;
  const preset = (k) => (BLOOM_PRESETS[k] && override ? Object.assign({}, BLOOM_PRESETS[k], override) : BLOOM_PRESETS[k]); let P = preset(q);
  let composer = null, bloom = null, rt = null, extra = [], fxaaPass = null;
  function build() {
    dispose();
    if (!P && !post) return;
    const pr = renderer.getPixelRatio();
    const rw = Math.max(1, size.x * pr), rh = Math.max(1, size.y * pr);
    rt = new THREE.WebGLRenderTarget(rw, rh, {
      type: THREE.HalfFloatType, samples: P ? P.samples : 0,
      depthTexture: depth ? new THREE.DepthTexture(rw, rh) : null
    });
    composer = new EffectComposer(renderer, rt);
    if (depth) {
      /* r170: RenderTarget.clone() 의 depthTexture.clone() 은 같은 Source 를 공유해 rt1·rt2 가 한 GPU 깊이 텍스처를 쓴다.
         그러면 어느 쪽 깊이를 샘플링해도 쓰는 버퍼에 붙어 있어 feedback loop 가 난다 — rt2 에 독립된 깊이 텍스처를 준다. */
      if (composer.renderTarget2.depthTexture) composer.renderTarget2.depthTexture.dispose();
      composer.renderTarget2.depthTexture = new THREE.DepthTexture(rw, rh);
    }
    composer.addPass(new RenderPass(scene, camera));
    if (P) {
      bloom = new UnrealBloomPass(new THREE.Vector2(size.x * P.res * 2, size.y * P.res * 2), P.strength, P.radius, P.threshold);
      const base = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => base(Math.max(2, w * P.res * 2), Math.max(2, h * P.res * 2));   // UnrealBloomPass halves internally
      composer.addPass(bloom);
    }
    extra = post ? post() : [];
    extra.forEach((p) => composer.addPass(p));
    composer.addPass(new OutputPass());   // linear HDR -> renderer.outputColorSpace (sRGB) with renderer.toneMapping (NoToneMapping in v2)
    if (fxaa) {
      fxaaPass = new ShaderPass(FXAA_SHADER);
      fxaaPass.uniforms.uInvRes.value.set(1 / rw, 1 / rh);
      composer.addPass(fxaaPass);
    }
    composer.setSize(size.x, size.y);
  }
  function dispose() { if (composer) { composer.passes.forEach((p) => p.dispose && p.dispose()); composer.dispose(); } composer = null; bloom = null; rt = null; extra = []; fxaaPass = null; }
  build();
  return {
    get quality() { return q; }, get composer() { return composer; }, get bloomPass() { return bloom; },
    render(dt) { extra.forEach((p) => p.tick && p.tick(dt)); if (composer) composer.render(dt); else renderer.render(scene, camera); },
    get post() { return extra; }, get hasDepth() { return !!(rt && rt.depthTexture); },
    setSize(w, h) {
      size.set(w, h);
      if (fxaaPass) {
        const pr = renderer.getPixelRatio();
        fxaaPass.uniforms.uInvRes.value.set(1 / Math.max(1, w * pr), 1 / Math.max(1, h * pr));
      }
      if (composer) composer.setSize(w, h);
    },
    /* Quality change without rebuilding the chain: a rebuild would create new pass materials and
       therefore relink ~10 shader programs on the very frame the frame rate was already bad.
       The presets differ only in buffer resolution and bloom strength/radius, so resize + retune. */
    setQuality(nq) {
      if (nq === q || !(nq in BLOOM_PRESETS)) return;
      q = nq; P = preset(q);
      if (!composer || !P || (!bloom && P)) { build(); return; }
      if (bloom) { bloom.strength = P.strength; bloom.radius = P.radius; bloom.threshold = P.threshold; }
      composer.setSize(size.x, size.y);   // the wrapped bloom.setSize applies P.res
    },
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
