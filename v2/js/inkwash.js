/* 수묵 후처리: 장면을 먹·한지 단색조로 바꾸고 비취·진홍·금 같은 강조색만 남긴다. 윤곽 먹선, 붓 번짐, 한지 결을 더한다.
   v0.35+: 윤곽 먹선은 휘도(Luminance) 경계에 깊이(Depth) 경계를 더한 하이브리드 — 깊이는 enableDepth() 로 켠다. */
import * as THREE from 'three';
import { ShaderPass } from '../../assets/v2/fx-ink/code/vendor/three-r170-addons/postprocessing/ShaderPass.js';

/** Tuning values for the ink-wash pass; every number a designer would tune lives here. */
export const INKWASH = {
  /* v1.37 엠버 앤 블레이드 × 청묵 툰 룩: 저채도 슬레이트 청묵 바닥 + 3.5단 셀 밴딩 + 고대비 강조색 */
  ink: [0.008, 0.014, 0.018],
  wash: [0.052, 0.092, 0.104],
  paper: [0.24, 0.34, 0.36],
  toneGamma: 1.04,
  bands: 3.0,
  bandSoft: 0.22,
  accentSatLo: 0.17,
  accentSatHi: 0.35,
  accentBoost: 1.56,
  edge: 0.92,
  edgeLo: 0.042,
  edgeHi: 0.15,
  edgeDark: 0.18,
  depthEdge: 1.0, /* 깊이 경계 먹선 세기 (enableDepth 가 켜졌을 때만) */
  depthLo: 0.011,
  depthHi: 0.058,
  wobble: 0, /* screen warp blurred small figures; the ink look comes from tone, edges and grain */
  grain: 0.022,
  vignette: 0, /* one vignette only: the cinematic pass owns it */
  strength: 0.76
};

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uHasDepth, uNear, uFar;
uniform vec2 uRes; uniform float uTime;
uniform vec3 uInk, uWash, uPaper;
uniform float uEdgeDark, uGamma, uBands, uBandSoft, uSatLo, uSatHi, uBoost;
uniform float uEdge, uEdgeLo, uEdgeHi, uDepthEdge, uDepthLo, uDepthHi, uWobble, uGrain, uVig, uStrength;
/* v0.39 2단계: 월드 거리 fade-to-dark — 사물 재질이 놓친 픽셀(하늘·구멍·투명 너머)을 후처리에서 마저 잠근다. */
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uWfHero;
uniform vec4 uWfRange;
uniform vec4 uWfAmt;
uniform vec3 uWfColor;
uniform vec2 uHeroScreen;
uniform float uWfPost;
uniform vec3 uWfDirK;
varying vec2 vUv;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float L(vec2 uv){ return sqrt(max(luma(texture2D(tDiffuse, uv).rgb), 0.0)); }
float linearDepth(vec2 uv){
  float z = texture2D(tDepth, uv).x;
  float ndc = z * 2.0 - 1.0;
  float viewZ = (2.0 * uNear * uFar) / max(1e-4, (uFar + uNear - ndc * (uFar - uNear)));
  return clamp((viewZ - uNear) / max(1e-4, uFar - uNear), 0.0, 1.0);
}
/* 화면 픽셀의 월드 좌표(깊이 역투영)와 그 픽셀이 잠겨야 하는 정도.
   사물 재질(cardstock.js)이 같은 규칙으로 먼저 잠그므로, 여기서는 그 위에 얇게 한 겹만 더한다.
   밝고 선명한 것(혼령·등불·검기)은 '어둠이 표적을 삼키지 않는다' 규칙으로 남긴다. */
float wfKeep( vec3 col ) {
  /* 어둠이 삼키면 안 되는 것 = '빛나는 것'. 밝기만 본다(색이 진하다고 남기면 12장 혈석 같은
     붉은 소품이 안개를 통과해 버린다). */
  return smoothstep( 0.45, 0.85, luma( col ) );
}
vec3 wfApply( vec3 col, vec2 uv, float rawDepth ) {
  if ( uWfPost < 0.001 ) return col;
  float f;
  if ( uHasDepth > 0.5 ) {
    if ( rawDepth >= 0.99999 ) {
      /* 하늘·빈 곳: 거리 무한대로 보고 가장 짙게 */
      f = 1.0;
    } else {
      vec4 clip = vec4( uv * 2.0 - 1.0, rawDepth * 2.0 - 1.0, 1.0 );
      vec4 vp = uInvProj * clip;
      vp /= max( 1e-6, vp.w );
      vec3 wp = ( uCamWorld * vp ).xyz;
      vec2 rel = wp.xz - uWfHero.xz;
      vec2 fw = uWfDirK.xy;
      vec2 rt = vec2( fw.y, - fw.x );
      float d = length( vec2( dot( rel, rt ), dot( rel, fw ) * uWfDirK.z ) );
      float near = smoothstep( uWfRange.x, uWfRange.y, d ) * uWfAmt.x;
      float far = smoothstep( uWfRange.y, max( uWfRange.z, uWfRange.y + 0.1 ), d ) * max( 0.0, uWfAmt.y - uWfAmt.x );
      f = clamp( near + far, 0.0, 1.0 );
    }
  } else {
    /* 깊이 버퍼가 없는 품질: 영웅 화면 좌표에서의 거리로 대신한다. */
    vec2 dv = ( uv * uRes - uHeroScreen ) / max( 1.0, uRes.y );
    dv.x *= 0.78; dv.y *= 1.26;
    f = smoothstep( 0.16, 0.42, length( dv ) );
  }
  return mix( col, uWfColor, clamp( f * uWfPost * ( 1.0 - 0.70 * wfKeep( col ) ), 0.0, 1.0 ) );
}
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

  /* 윤곽 먹선: 떨리는 붓처럼 굵기와 위치를 흔든다. 휘도 경계 + (있으면) 깊이 경계 중 강한 쪽. */
  float w = 1.0 + 0.8 * vnoise(vUv * uRes / 18.0 + uTime * 0.05);
  vec2 o = px * w;
  float tl = L(uv + vec2(-o.x, o.y)), tc = L(uv + vec2(0, o.y)), tr = L(uv + o);
  float ml = L(uv + vec2(-o.x, 0)), mr = L(uv + vec2(o.x, 0));
  float bl = L(uv - o), bc = L(uv - vec2(0, o.y)), br = L(uv + vec2(o.x, -o.y));
  float gx = (tr + 2.0*mr + br) - (tl + 2.0*ml + bl);
  float gy = (tl + 2.0*tc + tr) - (bl + 2.0*bc + br);
  float eLum = smoothstep(uEdgeLo, uEdgeHi, length(vec2(gx, gy)));
  eLum *= smoothstep(uEdgeDark, uEdgeDark + 0.18, max(max(tc, bc), max(ml, mr)));

  float eDepth = 0.0;
  if (uHasDepth > 0.5) {
    float dc = linearDepth(uv);
    float ddx = abs(linearDepth(uv + vec2(o.x, 0.0)) - linearDepth(uv - vec2(o.x, 0.0)));
    float ddy = abs(linearDepth(uv + vec2(0.0, o.y)) - linearDepth(uv - vec2(0.0, o.y)));
    float distFade = 1.0 - smoothstep(0.45, 0.95, dc);
    eDepth = smoothstep(uDepthLo, uDepthHi, length(vec2(ddx, ddy))) * distFade * uDepthEdge;
  }

  float e = clamp(max(eLum * uEdge, eDepth), 0.0, 1.0);
  e *= 0.65 + 0.35 * vnoise(vUv * uRes / 6.0);
  col = mix(col, uInk, e * (1.0 - acc * 0.7));

  /* 한지 결과 번짐 얼룩 */
  float fiber = vnoise(vec2(vUv.x * uRes.x / 1.5, vUv.y * uRes.y / 40.0));
  float grain = (h21(floor(vUv * uRes)) - 0.5) * 0.6 + (fiber - 0.5) * 0.8;
  float stain = fbm(vUv * 3.0 + 11.0);
  col *= 1.0 + uGrain * grain;
  col = mix(col, col * vec3(0.84, 0.92, 0.94), smoothstep(0.55, 0.82, stain) * 0.24);

  vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vig = smoothstep(0.35, 0.95, length(d) + (fbm(vUv * 4.0) - 0.5) * 0.25);
  col = mix(col, uInk, vig * uVig);

  vec3 outc = mix(src, col, uStrength);
  outc = wfApply( outc, vUv, texture2D( tDepth, vUv ).x );
  gl_FragColor = vec4(max(outc, 0.0), 1.0);
}`;

/** Creates the ink-wash ShaderPass; call tick(dt) each frame and setSize(w, h) on resize.
 *  enableDepth(near, far) turns on depth-edge outlines; the composer's render targets must carry a
 *  depthTexture (setupBloom({ depth: true })). */
export function createInkWashPass(params) {
  const P = Object.assign({}, INKWASH, params || {});
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null }, uHasDepth: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 200 },
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uInk: { value: new THREE.Vector3().fromArray(P.ink) }, uWash: { value: new THREE.Vector3().fromArray(P.wash) },
      uPaper: { value: new THREE.Vector3().fromArray(P.paper) },
      uGamma: { value: P.toneGamma }, uBands: { value: P.bands }, uBandSoft: { value: P.bandSoft },
      uSatLo: { value: P.accentSatLo }, uSatHi: { value: P.accentSatHi }, uBoost: { value: P.accentBoost },
      uEdgeDark: { value: P.edgeDark }, uEdge: { value: P.edge }, uEdgeLo: { value: P.edgeLo }, uEdgeHi: { value: P.edgeHi },
      uDepthEdge: { value: P.depthEdge }, uDepthLo: { value: P.depthLo }, uDepthHi: { value: P.depthHi },
      uWobble: { value: P.wobble }, uGrain: { value: P.grain }, uVig: { value: P.vignette }, uStrength: { value: P.strength },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uWfHero: { value: new THREE.Vector3(0, 0, 0) }, uWfRange: { value: new THREE.Vector4(5.4, 7.3, 15.6, 0) },
      uWfAmt: { value: new THREE.Vector4(0.62, 0.80, 0, 1) }, uWfColor: { value: new THREE.Vector3(0.01, 0.009, 0.009) },
      uHeroScreen: { value: new THREE.Vector2(0, 0) }, uWfPost: { value: 0.40 },
      uWfDirK: { value: new THREE.Vector3(0, -1, 0.70) }
    },
    vertexShader: VERT,
    fragmentShader: FRAG
  });
  /* 깊이는 고정 텍스처로 묶지 않고 매 프레임 readBuffer 에서 읽는다.
     EffectComposer 는 rt1/rt2 를 핑퐁하고, 한 프레임의 swap 횟수가 홀수면 장면이 그려지는 버퍼가 프레임마다 바뀐다.
     RenderPass·UnrealBloomPass 는 swap 하지 않으므로 이 패스 시점의 readBuffer 가 곧 장면 색·깊이를 가진 버퍼다.
     writeBuffer 의 깊이를 샘플링하면 WebGL feedback loop(INVALID_OPERATION)로 그리기가 버려져 화면이 깨진다. */
  let depthOn = false;
  pass.enableDepth = function (near, far) {
    depthOn = true;
    pass.uniforms.uNear.value = near > 0 ? near : 0.1;
    pass.uniforms.uFar.value = far > 0 ? far : 200;
  };
  pass.disableDepth = function () { depthOn = false; };
  const baseRender = pass.render.bind(pass);
  /* 카메라·안개 목표는 game.js 가 한 번 묶어 두고, 프레임마다 여기서 행렬만 다시 읽는다(할당 없음). */
  let cam = null, wf = null;
  pass.setFadeSource = function (camera, shared) { cam = camera || null; wf = shared || null; };
  pass.render = function (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    let d = depthOn && readBuffer ? readBuffer.depthTexture : null;
    if (d && writeBuffer && writeBuffer.depthTexture === d) d = null;
    pass.uniforms.tDepth.value = d;
    pass.uniforms.uHasDepth.value = d ? 1 : 0;
    if (cam) {
      pass.uniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
      pass.uniforms.uCamWorld.value.copy(cam.matrixWorld);
    }
    if (wf) {
      pass.uniforms.uWfHero.value.copy(wf.uWfHero.value);
      pass.uniforms.uWfRange.value.copy(wf.uWfRange.value);
      pass.uniforms.uWfAmt.value.copy(wf.uWfAmt.value);
      if (wf.uWfDirK) pass.uniforms.uWfDirK.value.copy(wf.uWfDirK.value);
      const fc = wf.uWfColor.value;
      pass.uniforms.uWfColor.value.set(fc.r, fc.g, fc.b);
      if (wf.heroScreen) pass.uniforms.uHeroScreen.value.copy(wf.heroScreen);
      pass.uniforms.uWfPost.value = wf.post != null ? wf.post : 0.34;
    }
    baseRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  };
  pass.tick = function (dt) { pass.uniforms.uTime.value += dt || 0; };
  const baseSize = pass.setSize.bind(pass);
  pass.setSize = function (w, h) { baseSize(w, h); pass.uniforms.uRes.value.set(Math.max(1, w), Math.max(1, h)); };
  return pass;
}
