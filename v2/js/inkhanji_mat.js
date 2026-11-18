/* v2/js/inkhanji_mat.js — Papertrails 기법을 조선 수묵·한지 다크 판타지로 재해석한 에셋 머티리얼 & 물 셰이더 모듈. */
import * as THREE from 'three';

let _cachedFibreTex = null;

export function createHanjiFibreTexture(size = 256) {
  if (_cachedFibreTex) return _cachedFibreTex;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  let seed = 1337;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const nx = x / size, ny = y / size;
      const wave = Math.sin(nx * Math.PI * 8) * Math.cos(ny * Math.PI * 6) * 0.5 + 0.5;
      d[i] = Math.round(Math.max(0, Math.min(255, (0.45 + 0.35 * rand() + 0.2 * wave) * 255)));
      d[i + 1] = Math.round(Math.max(0, Math.min(255, (0.5 + 0.3 * Math.sin((nx + ny) * Math.PI * 4) + 0.2 * rand()) * 255)));
      d[i + 2] = Math.round(Math.max(0, Math.min(255, (0.5 + (rand() - 0.5) * 0.6) * 255)));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 0.7;
  for (let k = 0; k < 140; k++) {
    const sx = rand() * size, sy = rand() * size, ang = rand() * Math.PI * 2, len = 6 + rand() * 16;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + Math.cos(ang + 0.4) * len * 0.5, sy + Math.sin(ang + 0.4) * len * 0.5, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  _cachedFibreTex = tex;
  return tex;
}

export function createHanjiMaterial({
  color = 0xd8cfbe, emissive = 0x000000, emissiveIntensity = 1.0,
  transTint = 0xe8b86d, transStrength = 0.28, shadowLeak = 0.22,
  worldSpace = false, fibreScale = 0.22, side = THREE.DoubleSide,
  transparent = false, opacity = 1.0, alphaTest = 0.0
} = {}) {
  const mat = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity, side, transparent, opacity, alphaTest });
  const fibreTex = createHanjiFibreTexture();
  mat.userData._hanjiMat = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHanjiFibre = { value: fibreTex };
    shader.uniforms.uFibreScale = { value: fibreScale };
    shader.uniforms.uWorldFibre = { value: worldSpace ? 1.0 : 0.0 };
    shader.uniforms.uTransTint = { value: new THREE.Color(transTint) };
    shader.uniforms.uTransStrength = { value: transStrength };
    shader.uniforms.uShadowLeak = { value: shadowLeak };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vHanjiWPos;\nvarying vec3 vHanjiLPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vHanjiLPos = transformed;
        vec4 hw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          hw = instanceMatrix * hw;
        #endif
        hw = modelMatrix * hw;
        vHanjiWPos = hw.xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vHanjiWPos; varying vec3 vHanjiLPos;
        uniform sampler2D uHanjiFibre; uniform float uFibreScale; uniform float uWorldFibre;
        uniform vec3 uTransTint; uniform float uTransStrength; uniform float uShadowLeak;`)
      .replace('#include <dithering_fragment>', `
        vec2 fUv = mix(vHanjiLPos.xz + vHanjiLPos.xy * 0.5, vHanjiWPos.xz, uWorldFibre) * uFibreScale;
        vec3 fib = texture2D(uHanjiFibre, fUv).rgb;
        gl_FragColor.rgb *= (0.88 + (fib.r - 0.5) * 0.22) * (0.92 + (fib.g - 0.5) * 0.16);
        float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor.rgb += uTransTint * (1.0 - smoothstep(0.0, 0.65, lum)) * uShadowLeak * 0.18;
        gl_FragColor.rgb += uTransTint * smoothstep(0.35, 0.95, lum) * uTransStrength * 0.14;
        #include <dithering_fragment>`);
  };
  mat.customProgramCacheKey = () => `hanji_${worldSpace ? 'w' : 'l'}`;
  return mat;
}

export function attachInkWaterShader(material, { timeUniform = { value: 0 }, waterColor = 0x0e181c, rimColor = 0x8b7e66 } = {}) {
  if (!material || material.userData._inkWaterAttached) return timeUniform;
  material.userData._inkWaterAttached = true;
  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);
    shader.uniforms.uWaterTime = timeUniform;
    shader.uniforms.uWaterCol = { value: new THREE.Color(waterColor) };
    shader.uniforms.uWaterRim = { value: new THREE.Color(rimColor) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPosWater;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPosWater = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPosWater; uniform float uWaterTime; uniform vec3 uWaterCol; uniform vec3 uWaterRim;`)
      .replace('#include <dithering_fragment>', `
        float ripple = sin(vWPosWater.x * 2.4 + uWaterTime * 1.6) * cos(vWPosWater.z * 2.1 - uWaterTime * 1.3);
        float streak = smoothstep(0.55, 0.92, sin(vWPosWater.x * 5.0 + ripple * 2.0 + uWaterTime * 0.8));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(uWaterCol, uWaterRim, streak * 0.16), 0.82);
        #include <dithering_fragment>`);
  };
  material.needsUpdate = true;
  return timeUniform;
}
