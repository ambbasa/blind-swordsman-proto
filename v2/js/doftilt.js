/* v2/js/doftilt.js — v0.40 4단계: 틸트시프트 심도(미니어처 매크로 촬영 룩).
   refs/papertrails/src/render/post.js 의 '초점 밴드 + 반해상도 보케'를 우리 체인에 맞춰 옮겼다.
   - 장면 색은 이미 한지/수묵 후처리(inkwash)를 지난 뒤다. 그래서 이 패스는 **맨 마지막**에 놓고
     색을 다시 만지지 않는다(먹선까지 같이 흐려져야 '종이 디오라마를 접사로 찍은' 느낌이 난다).
   - 깊이 버퍼로 초점 밴드(주인공이 서 있는 거리)에서 멀수록 흐려진다. 반해상도 RT 에서 한 번만
     균일 보케로 번지게 하고, 원해상도에서 CoC 로 섞는다 → 모바일에서도 탭 수가 일정하다.
   - 품질 레더(QL_LEVELS) 연동: setLevel(0..4). 3단계 이하(저사양)에서는 자동으로 꺼진다.
   프레임 할당 0: RT·쿼드·유니폼을 한 번 만들고 매 프레임 재사용한다. */
import * as THREE from 'three';
import { ShaderPass } from '../../assets/v2/fx-ink/code/vendor/three-r170-addons/postprocessing/ShaderPass.js';

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/* 반해상도 보케: 황금각 나선 16탭. 반경은 '반해상도 픽셀' 기준. */
const BLUR_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main(){
  float r = uRadius;
  vec4 sum = texture2D(tSrc, vUv) * 0.14;
  float wsum = 0.14;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float a = fi * 2.39996323;                 /* 황금각 */
    float d = sqrt((fi + 0.5) / 16.0) * r;     /* 디스크 균등 분포 */
    vec2 o = vec2(cos(a), sin(a)) * d * uTexel;
    float w = 1.0 - 0.55 * (d / max(1.0, r));
    sum += texture2D(tSrc, vUv + o) * w;
    wsum += w;
  }
  gl_FragColor = sum / wsum;
}`;

const MIX_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tBlur;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear, uFar;
uniform float uFocus;      /* 초점 거리(뷰 z, m) */
uniform float uBand;       /* 초점 밴드 반폭(m) */
uniform float uSoft;       /* 밴드 → 최대 흐림까지(m) */
uniform float uAmt;        /* 전체 세기 0..1 */
uniform float uHasDepth;
uniform float uDepthScale; /* >0 이면 tDepth 가 선형 깊이 캐시(R 채널, 미터/uDepthScale) */
varying vec2 vUv;

float linDepth(vec2 uv) {
  if (uDepthScale > 0.0) return texture2D(tDepth, uv).r * uDepthScale;
  float z = texture2D(tDepth, uv).x;
  if (z >= 0.99999) return uFar;
  float ndc = z * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / max(1e-4, (uFar + uNear - ndc * (uFar - uNear)));
}

void main(){
  vec3 sharp = texture2D(tDiffuse, vUv).rgb;
  if (uAmt < 0.002 || uHasDepth < 0.5) { gl_FragColor = vec4(sharp, 1.0); return; }
  vec3 blur = texture2D(tBlur, vUv).rgb;
  float d = linDepth(vUv);
  float coc = smoothstep(uBand, uBand + uSoft, abs(d - uFocus));
  /* 아주 먼 배경(하늘·병풍)은 최대 흐림 — 디오라마의 '배경 판'이 물러나 보이게 */
  coc = max(coc, smoothstep(uFocus + uBand + 8.0, uFocus + uBand + 26.0, d) * 0.6);
  /* 상한 0.78 — 화면 끝의 원귀·혼령도 형태가 읽혀야 한다(심안 조준 가시성 규칙). */
  coc = clamp(coc * uAmt, 0.0, 0.78);
  gl_FragColor = vec4(mix(sharp, blur, coc), 1.0);
}`;

/**
 * 틸트시프트 패스를 만든다. opts: { amount, band, soft, maxRadius, level }
 * 반환 pass: .enabled .setFocus(m) .setLevel(0..4) .setSize(w,h) .render(...)
 */
export function createTiltShiftPass(opts) {
  const O = opts || {};
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tBlur: { value: null }, tDepth: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 200 },
      uFocus: { value: 14 }, uBand: { value: O.band != null ? O.band : 4.2 },
      uSoft: { value: O.soft != null ? O.soft : 9.0 }, uAmt: { value: 0 },
      uHasDepth: { value: 0 }, uDepthScale: { value: 0 }
    },
    vertexShader: VERT,
    fragmentShader: MIX_FRAG
  });

  const rt = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    type: THREE.UnsignedByteType
  });
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uRadius: { value: 2.6 } },
    vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false
  });
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat);
  quad.frustumCulled = false;
  quadScene.add(quad);

  let amount = O.amount != null ? O.amount : 0.85;
  let levelOn = 2;
  pass.setFocus = function (meters) {
    pass.uniforms.uFocus.value = Math.max(0.5, meters || 14);
  };
  /* 품질 레더: 0=high. 3단계 이하(저사양·모바일 방어)에서는 끈다. */
  pass.setLevel = function (level) {
    pass.levelOn = level;
    pass.uniforms.uAmt.value = level > levelOn ? 0 : (level <= 0 ? amount : amount * 0.86);
  };
  pass.setQualityBudget = function (v) { amount = Math.max(0, Math.min(1, v)); };
  pass.debugInfo = function () {
    return {
      rt: [rt.width, rt.height], res: [pass.uniforms.uRes.value.x, pass.uniforms.uRes.value.y],
      focus: +pass.uniforms.uFocus.value.toFixed(2), amt: +pass.uniforms.uAmt.value.toFixed(3),
      hasDepth: pass.uniforms.uHasDepth.value, near: pass.uniforms.uNear.value, far: pass.uniforms.uFar.value,
      band: pass.uniforms.uBand.value, soft: pass.uniforms.uSoft.value, radius: blurMat.uniforms.uRadius.value
    };
  };
  pass.setAmount = function (v) { pass.uniforms.uAmt.value = Math.max(0, Math.min(1, v)); };

  let cam = null;
  const baseRender = pass.render.bind(pass);
  pass.render = function (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const u = pass.uniforms;
    let depthTex = null;
    if (pass.depthTex) {
      /* 체인 뒤에서는 readBuffer 의 깊이가 이미 비어 있다(앞선 패스들이 핑퐁으로 바꿔 버린다).
         그래서 RenderPass 직후에 createDepthCapture 가 선형 깊이를 별도 RT 에 떠 두고 그것을 쓴다. */
      depthTex = pass.depthTex;
      u.uDepthScale.value = pass.depthScale;
    } else {
      depthTex = readBuffer ? readBuffer.depthTexture : null;
      if (depthTex && writeBuffer && writeBuffer.depthTexture === depthTex) depthTex = null;
      u.uDepthScale.value = 0;
    }
    u.tDepth.value = depthTex || null;
    u.uHasDepth.value = depthTex ? 1 : 0;
    if (depthTex && cam) { u.uNear.value = cam.near; u.uFar.value = cam.far; }
    const on = u.uAmt.value > 0.002 && depthTex;
    if (on) {
      const prev = renderer.getRenderTarget();
      blurMat.uniforms.tSrc.value = readBuffer.texture;
      renderer.setRenderTarget(rt);
      renderer.clear(true, false, false);
      renderer.render(quadScene, quadCam);
      renderer.setRenderTarget(prev);
      u.tBlur.value = rt.texture;
    }
    baseRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  };
  /* 패스가 스스로 깊이를 못 읽는 경우가 있으므로 카메라를 묶어 둔다(초점·near/far 계산용). */
  pass.setCamera = function (c) { cam = c || null; if (cam) { pass.uniforms.uNear.value = cam.near; pass.uniforms.uFar.value = cam.far; } };
  const baseSize = pass.setSize.bind(pass);
  pass.setSize = function (w, h) {
    baseSize(w, h);
    pass.uniforms.uRes.value.set(Math.max(1, w), Math.max(1, h));
    const hw = Math.max(2, Math.round(w / 2)), hh = Math.max(2, Math.round(h / 2));
    rt.setSize(hw, hh);
    blurMat.uniforms.uTexel.value.set(1 / hw, 1 / hh);
  };
  pass.uniforms.uAmt.value = 0;
  pass.setBackground = function (color) { /* 예약 */ };
  return pass;
}

/** 선형 깊이를 따로 떠 두는 패스 — 체인 뒤에서도 DoF 가 쓸 수 있게 한다.
 *  EffectComposer 는 ShaderPass 마다 rt 를 핑퐁하므로, 맨 뒤 패스의 readBuffer 깊이는 이미 장면 깊이가 아니다.
 *  RenderPass 바로 뒤(needsSwap=false)에 붙여 장면 깊이를 반해상도 RT 에 굽는다. */
const DEPTH_FRAG = /* glsl */`
uniform sampler2D tDepth;
uniform float uNear, uFar, uScale;
varying vec2 vUv;
void main(){
  float z = texture2D(tDepth, vUv).x;
  float d;
  if (z >= 0.99999) d = uScale;
  else { float ndc = z * 2.0 - 1.0; d = (2.0 * uNear * uFar) / max(1e-4, (uFar + uNear - ndc * (uFar - uNear))); }
  gl_FragColor = vec4(clamp(d / uScale, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

export function createDepthCapture(dofPass, opts) {
  const O = opts || {};
  const scale = O.scale != null ? O.scale : 70;   /* 70m 까지 · half float 면 1cm 이하 오차 */
  const rt = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat, type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 200 }, uScale: { value: scale } },
    vertexShader: VERT, fragmentShader: DEPTH_FRAG, depthTest: false, depthWrite: false
  });
  const qs = new THREE.Scene();
  const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  qs.add(quad);
  let cam = null;
  const pass = {
    enabled: true, needsSwap: false, needsDepth: false, clear: false, renderToScreen: false,
    setCamera: function (c) { cam = c || null; },
    setSize: function (w, h) { rt.setSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2))); },
    dispose: function () { rt.dispose(); mat.dispose(); },
    render: function (renderer, writeBuffer, readBuffer) {
      if (!dofPass) return;
      const depth = readBuffer ? readBuffer.depthTexture : null;
      if (!depth || !pass.enabled) { dofPass.depthTex = null; return; }
      mat.uniforms.tDepth.value = depth;
      if (cam) { mat.uniforms.uNear.value = cam.near; mat.uniforms.uFar.value = cam.far; }
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.clear(true, false, false);
      renderer.render(qs, qc);
      renderer.setRenderTarget(prev);
      dofPass.depthTex = rt.texture;
      dofPass.depthScale = scale;
    }
  };
  return pass;
}

/** 카메라 앞 주인공의 뷰 z(초점 거리)를 잰다. 프레임 할당 없이 계산. */const _v = new THREE.Vector3();
export function focusDistance(camera, x, y, z) {
  if (!camera) return 14;
  camera.updateMatrixWorld();
  _v.set(x || 0, y || 0, z || 0).applyMatrix4(camera.matrixWorldInverse);
  return Math.max(0.5, -_v.z);
}
