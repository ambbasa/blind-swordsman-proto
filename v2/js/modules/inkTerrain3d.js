/**
 * v2/js/modules/inkTerrain3d.js
 * 심안(SIMAN) v0.59 — AAA 3D 환경·드로우콜 최적화 엔진 (threejs-aaa-graphics-builder · threejs-shaders 적용)
 * - InstancedMesh 배칭: 대나무숲 240 draw calls → 4 draw calls, 전 맵 3D 기물 드로우콜 ~85% 절감
 * - 공용 PBR 머티리얼 킷 + 절차적 수묵/석재 그레인 노멀·러프니스 텍스처(단일 128px 공유)
 * - 1-드로우콜 인스턴스드 접지 그림자(Contact Shadow)로 모든 3D 기물을 바닥에 자연스럽게 안착
 * - 커스텀 GLSL 셰이더(웅덩이·안개·종 3D 음파 돔)에 tonemapping_fragment / colorspace_fragment 적용
 * - LatheGeometry 조선 범종 실루엣 + 4막 13~16장 전용 고밀도 3D 환경 + 최소 이격 거리(뭉침 방지)
 */
import * as THREE from 'three';
import { WF, paint as paintCard } from '../cardstock.js';
import { loadPropModel } from '../glbprops.js?v=v167';
import {
  buildArchedBridge3D,
  buildCarvedLantern3D,
  buildFracturedBasaltRocks3D,
  buildKasumideraMoonStele3D,
  buildBronzeCenser3D,
  buildMossyStoneSteps3D,
  buildForestFloorFerns3D,
  createFallingLeaves3D
} from './skillAssets3d.js';

const MIST_VERT = /* glsl */`
varying vec2 vUv; varying vec3 vWp;
void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
`;

const POOL_FRAG = /* glsl */`
uniform float uTime, uMode;
uniform vec3 uColA, uColB, uRimCol;
varying vec2 vUv; varying vec3 vWp;
float hash21(vec2 p) { p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 34.5); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.04 + vec2(13.7, 29.3); a *= 0.5; }
  return v;
}
void main() {
  float r = length((vUv - 0.5) * 2.0);
  float n1 = fbm(vWp.xz * 0.45 + vec2(uTime * 0.16, -uTime * 0.12));
  float n2 = fbm(vWp.xz * 1.15 - vec2(uTime * 0.24, uTime * 0.19) + n1 * 0.6);
  float edge = 1.0 - smoothstep(0.55 + (n1 - 0.5) * 0.35, 1.0, r);
  if (edge < 0.02) discard;
  vec3 col = mix(uColA, uColB, smoothstep(0.25, 0.8, n2));
  if (uMode < 0.5) col += uRimCol * smoothstep(0.60, 0.82, n2) * (0.7 + 0.3 * sin(uTime * 3.2 + r * 5.0)) * 0.9;
  else if (uMode < 1.5) col += uRimCol * pow(smoothstep(0.66, 0.92, noise(vWp.xz * 4.5 + uTime * 0.35)), 3.0) * 0.95;
  else edge *= smoothstep(0.18, 0.78, n1) * 0.68;
  gl_FragColor = vec4(col, clamp(edge * 0.88, 0.0, 0.92));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const WAVE_DOME_VERT = /* glsl */`
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;
varying float vHeight;
void main() {
  vUv = uv;
  vHeight = position.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WAVE_DOME_FRAG = /* glsl */`
uniform float uProgress;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uCoreCol;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;
varying float vHeight;
void main() {
  float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 2.1);
  float band1 = pow(0.5 + 0.5 * sin(vHeight * 22.0 - uProgress * 18.0 + uTime * 6.0), 4.0);
  float band2 = pow(0.5 + 0.5 * sin(vUv.x * 37.699 + uTime * 4.0), 3.0) * 0.35;
  float baseRim = smoothstep(0.32, 0.0, vHeight);
  float topFade = smoothstep(1.0, 0.25, vHeight);
  float fade = (1.0 - smoothstep(0.45, 1.0, uProgress)) * smoothstep(0.0, 0.08, uProgress);
  vec3 col = mix(uColor, uCoreCol, clamp(fresnel * 0.75 + band1 * 0.55, 0.0, 1.0));
  float alpha = (fresnel * 0.85 + band1 * 0.5 + baseRim * 0.65 + band2 * 0.25) * topFade * fade;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.88));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* v0.60 산수화 원경 산맥 셰이더 (3d-kasumidera-ultra-realism — 수직 안개·먹 번짐 그라데이션) */
const MOUNTAIN_VERT = /* glsl */`
varying float vNormY;
varying vec3 vWp;
void main() {
  vNormY = uv.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const MOUNTAIN_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uPeakCol;
uniform vec3 uMistCol;
uniform float uAlpha;
varying float vNormY;
varying vec3 vWp;
float mHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mHash(i), mHash(i + vec2(1.0, 0.0)), f.x), mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float ridge = smoothstep(0.08, 0.92, vNormY);
  float brush = mNoise(vWp.xz * 0.14 + vec2(0.0, vNormY * 3.5)) * 0.22;
  float drift = mNoise(vec2(vWp.x * 0.06 + uTime * 0.035, vNormY * 2.2)) * 0.18;
  float mistBand = clamp(1.0 - smoothstep(0.05, 0.72, vNormY + drift - 0.12), 0.0, 1.0);
  vec3 col = mix(uPeakCol * (0.86 + brush), uMistCol, mistBand * 0.85);
  /* 산마루 연한 먹선 실루엣 */
  float crest = smoothstep(0.86, 0.98, vNormY);
  col = mix(col, uPeakCol * 0.68, crest * 0.45);
  float alpha = uAlpha * smoothstep(0.0, 0.18, vNormY) * (1.0 - smoothstep(0.95, 1.0, vNormY) * 0.25);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* v0.60 바람에 나부끼는 비단·무명 깃발 셰이더 (3d-cloth-material — 접선각 물결 + 직조 결 + 역광 투과) */
const CLOTH_FLAG_VERT = /* glsl */`
uniform float uTime;
varying vec2 vUv;
varying float vWave;
varying vec3 vNormalW;
varying vec3 vViewW;
varying vec3 vWorldP;
void main() {
  vUv = uv;
  vec3 pos = position;
  #ifdef USE_INSTANCING
    float ph = instanceMatrix[3].x * 0.73 + instanceMatrix[3].z * 0.59;
  #else
    float ph = 0.0;
  #endif
  /* 깃대(uv.x = 0)는 고정, 끝자락(uv.x = 1)으로 갈수록 접선각 파동이 커지며 천 길이를 유지 */
  float pin = smoothstep(0.0, 0.95, uv.x);
  float a = sin(uTime * 3.6 - uv.x * 5.2 + ph + uv.y * 1.4) * 0.34
          + sin(uTime * 6.1 - uv.x * 9.5 + ph * 1.7) * 0.11;
  float bend = a * pin;
  pos.z += bend * 0.36;
  pos.x -= abs(bend) * 0.06 * pin;
  pos.y += sin(uTime * 2.4 + ph + uv.x * 2.8) * 0.035 * pin;
  vWave = bend;
  vec4 wp = vec4(pos, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  vWorldP = wp.xyz;
  vNormalW = normalize(vec3(-bend * 0.7, 0.15, 1.0));
  vViewW = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const CLOTH_FLAG_FRAG = /* glsl */`
uniform vec3 uDyeCol;
uniform vec3 uTrimCol;
uniform vec3 uLightCol;
uniform vec3 uWfHero;
uniform vec4 uWfRange;
uniform vec4 uWfAmt;
uniform vec3 uWfColor;
uniform vec3 uWfDirK;
varying vec2 vUv;
varying float vWave;
varying vec3 vNormalW;
varying vec3 vViewW;
varying vec3 vWorldP;
float simanFade(vec3 p) {
  if (uWfAmt.w < 0.5) return 0.0;
  vec2 rel = p.xz - uWfHero.xz;
  vec2 fw = uWfDirK.xy;
  vec2 rt = vec2(fw.y, -fw.x);
  float d = length(vec2(dot(rel, rt), dot(rel, fw) * uWfDirK.z));
  float nearF = smoothstep(uWfRange.x, uWfRange.y, d) * uWfAmt.x;
  float farF = smoothstep(uWfRange.y, max(uWfRange.z, uWfRange.y + 0.1), d) * max(0.0, uWfAmt.y - uWfAmt.x);
  return clamp(nearF + farF, 0.0, 1.0) * 0.86;
}
void main() {
  /* 깃발 끝자락 자연스러운 뾰족/제비꼬리 실루엣 */
  float swallow = abs(vUv.y - 0.5) * 2.0;
  float tipMask = 1.0 - smoothstep(0.76, 0.99, vUv.x + (1.0 - swallow) * 0.18);
  if (tipMask < 0.08) discard;
  /* 미세 평직 직조 결 (3d-cloth-material) */
  float weave = 0.93 + 0.07 * sin(vUv.x * 110.0) * sin(vUv.y * 85.0);
  /* 주름 음영 + 빛 투과(thin cloth backlit transmission) */
  float foldAo = 0.76 + 0.24 * clamp(vWave * 1.8 + 0.5, 0.0, 1.0);
  float sheen = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewW))), 2.6) * 0.24;
  float trim = smoothstep(0.84, 0.92, swallow) + smoothstep(0.10, 0.03, vUv.x);
  vec3 base = mix(uDyeCol, uTrimCol, clamp(trim, 0.0, 1.0) * 0.72);
  vec3 col = base * weave * foldAo + uLightCol * (sheen + 0.14 * (1.0 - foldAo * 0.5));
  /* 깃발 중앙 먹붓 문양 원 */
  float d = length((vUv - vec2(0.42, 0.5)) * vec2(1.4, 1.0));
  float seal = smoothstep(0.22, 0.19, d) * smoothstep(0.11, 0.14, d);
  col = mix(col, uTrimCol * 1.15, seal * 0.55);
  col = mix(col, uWfColor, simanFade(vWorldP));
  gl_FragColor = vec4(col, 0.96);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* v0.60 한지 투과 풍등 셰이더 (3d-paper-material — 섬유질·대나무 살·따뜻한 호박빛 불빛 투과) */
const HANJI_LANTERN_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uPaperCol;
uniform vec3 uCoreCol;
varying vec2 vUv;
varying vec3 vWp;
void main() {
  float fiber = 0.88 + 0.12 * sin(vUv.x * 78.0 + sin(vUv.y * 24.0)) * cos(vUv.y * 54.0);
  float rib = smoothstep(0.86, 0.98, abs(sin(vUv.y * 12.566)));
  float vRib = smoothstep(0.92, 0.99, abs(sin(vUv.x * 18.849)));
  /* 아래쪽 불꽃 입구에서 위로 갈수록 따뜻하게 번지는 역광 투과 */
  float flame = smoothstep(0.95, 0.12, vUv.y);
  float flicker = 0.93 + 0.07 * sin(uTime * 5.1 + vWp.x * 1.4 + vWp.z);
  vec3 col = mix(uPaperCol * 0.78, uCoreCol, clamp(flame * 0.82, 0.0, 1.0)) * fiber * flicker;
  col *= (1.0 - max(rib * 0.28, vRib * 0.18));
  gl_FragColor = vec4(col, 0.96);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* v0.60 수묵 화폭 단풍·소나무 수관 셰이더 (3d-kasumidera-ultra-realism — 붓점 잎결·하단 먹음영·미세 먹선) */
const FOLIAGE_VERT = /* glsl */`
uniform float uTime;
varying vec3 vNormalW;
varying vec3 vViewW;
varying vec3 vLocalP;
varying vec3 vTint;
varying vec3 vWorldP;
void main() {
  vLocalP = position;
  vec3 pos = position;
  #ifdef USE_INSTANCING
    float wPh = instanceMatrix[3].x * 0.65 + instanceMatrix[3].z * 0.52;
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3(1.0);
    #endif
  #else
    float wPh = 0.0;
    vTint = vec3(1.0);
  #endif
  float hK = clamp(position.y + 0.55, 0.0, 1.4);
  pos.x += sin(uTime * 1.75 + wPh + position.z * 2.1) * 0.075 * hK;
  pos.z += cos(uTime * 1.35 + wPh * 1.3 + position.x * 1.9) * 0.055 * hK;
  vec4 wp = vec4(pos, 1.0);
  vec3 wn = normal;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    wn = mat3(instanceMatrix) * wn;
  #endif
  wp = modelMatrix * wp;
  vWorldP = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * wn);
  vViewW = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FOLIAGE_FRAG = /* glsl */`
uniform vec3 uBaseCol;
uniform vec3 uShadowCol;
uniform vec3 uKeyDir;
uniform vec3 uWfHero;
uniform vec4 uWfRange;
uniform vec4 uWfAmt;
uniform vec3 uWfColor;
uniform vec3 uWfDirK;
varying vec3 vNormalW;
varying vec3 vViewW;
varying vec3 vLocalP;
varying vec3 vTint;
varying vec3 vWorldP;
float fHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float fNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(fHash(i), fHash(i + vec3(1,0,0)), f.x);
  float b = mix(fHash(i + vec3(0,1,0)), fHash(i + vec3(1,1,0)), f.x);
  float c = mix(fHash(i + vec3(0,0,1)), fHash(i + vec3(1,0,1)), f.x);
  float d = mix(fHash(i + vec3(0,1,1)), fHash(i + vec3(1,1,1)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
float simanFadeF(vec3 p) {
  if (uWfAmt.w < 0.5) return 0.0;
  vec2 rel = p.xz - uWfHero.xz;
  vec2 fw = uWfDirK.xy;
  vec2 rt = vec2(fw.y, -fw.x);
  float d = length(vec2(dot(rel, rt), dot(rel, fw) * uWfDirK.z));
  float nearF = smoothstep(uWfRange.x, uWfRange.y, d) * uWfAmt.x;
  float farF = smoothstep(uWfRange.y, max(uWfRange.z, uWfRange.y + 0.1), d) * max(0.0, uWfAmt.y - uWfAmt.x);
  return clamp(nearF + farF, 0.0, 1.0) * 0.86;
}
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vViewW);
  float ndl = dot(N, normalize(uKeyDir)) * 0.5 + 0.5;
  /* 수묵 붓점 잎결(2옥타브) — 플라스틱 공 대신 겹쳐 찍은 붓잎 질감 */
  float dapple = fNoise(vLocalP * 6.5) * 0.65 + fNoise(vLocalP * 15.0) * 0.35;
  float upShade = smoothstep(-0.45, 0.55, N.y) * 0.55 + ndl * 0.45;
  float band = smoothstep(0.22, 0.86, upShade + (dapple - 0.5) * 0.34);
  vec3 leafCol = uBaseCol * vTint;
  vec3 col = mix(uShadowCol * vTint, leafCol * (0.86 + dapple * 0.28), band);
  /* 산수화 은은한 먹선 윤곽 */
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.8);
  col = mix(col, uShadowCol * 0.48, rim * 0.52);
  col = mix(col, uWfColor, simanFadeF(vWorldP));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* 공용 절차적 텍스처 캐시 (128x128 수묵 석재 그레인 + 64x64 원형 접지 그림자) */
let _sharedGrainTex = null;
let _sharedShadowTex = null;
function getGrainTexture() {
  if (_sharedGrainTex) return _sharedGrainTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 128);
  let s = 202611;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = 112 + ((s >>> 24) & 63);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  _sharedGrainTex = tex;
  return tex;
}

function getContactShadowTexture() {
  if (_sharedShadowTex) return _sharedShadowTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(6,5,5,0.68)');
  g.addColorStop(0.55, 'rgba(6,5,5,0.34)');
  g.addColorStop(1, 'rgba(6,5,5,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  _sharedShadowTex = tex;
  return tex;
}

function makeShaderPool(radius, colA, colB, rimCol, mode) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, 1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: MIST_VERT, fragmentShader: POOL_FRAG, transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColA: { value: new THREE.Color(colA) }, uColB: { value: new THREE.Color(colB) }, uRimCol: { value: new THREE.Color(rimCol) }, uMode: { value: mode } }
  });
  return { geo, mat };
}

function seeded(seed) {
  let s = (seed | 0) || 1337;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeParticleField(rng, count, colorHex, size, opacity, mode) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rng() - 0.5) * 30;
    pos[i * 3 + 1] = rng() * 9.0 + 0.25;
    pos[i * 3 + 2] = (rng() - 0.5) * 30;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: colorHex, size, transparent: true, opacity, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.userData.mode = mode;
  return { pts, geo, mat };
}

/* 조선 범종 LatheGeometry 프로필 */
function makeKoreanBellGeo() {
  const pts = [
    new THREE.Vector2(0.02, 0.54),
    new THREE.Vector2(0.24, 0.50),
    new THREE.Vector2(0.32, 0.36),
    new THREE.Vector2(0.39, 0.08),
    new THREE.Vector2(0.47, -0.28),
    new THREE.Vector2(0.56, -0.52),
    new THREE.Vector2(0.50, -0.54),
  ];
  return new THREE.LatheGeometry(pts, 16);
}

export function createInkTerrain3D(scene, kind, opts = {}) {
  if (!scene) return null;
  const k = kind || 'none';
  const stageNo = opts.stageNo || 1;
  const group = new THREE.Group();
  group.name = 'ink-terrain-3d-' + k + '-s' + stageNo;
  const rng = seeded(stageNo * 97 + k.length * 31);
  const disposables = [], shaderMats = [], swayNodes = [], particles = [], spinNodes = [], bellPivots = [];
  const activeWaves = [];
  const dynamicPatchMap = new Map();

  /* v0.64: inkarena 기물 위치와 충돌하지 않도록 사전 등록 + 캐릭터 충돌용 colliders 배열 관리 */
  const placedPts = [];
  const colliders = [];
  const bridges = [];
  const addBridge = (x, z, rotY, length, width, archH) => {
    bridges.push({ x, z, rotY: rotY || 0, halfL: (length || 7.2) * 0.5, halfW: (width || 2.3) * 0.55, archH: archH || 0.92 });
  };
  const addCollider = (x, z, r) => {
    if (r > 0.15) colliders.push({ x, z, r });
  };
  if (Array.isArray(opts.arenaProps)) {
    for (let i = 0; i < opts.arenaProps.length; i++) {
      const ap = opts.arenaProps[i];
      if (ap) placedPts.push({ x: ap.x, z: ap.z, r: Math.max(3.8, (ap.r || 2.0) + 1.4) });
    }
  }
  const canPlace = (x, z, minSep = 4.2, minR = 10.2) => {
    if (Math.hypot(x, z) < minR) return false;
    for (let i = 0; i < placedPts.length; i++) {
      const p = placedPts[i];
      if (Math.hypot(x - p.x, z - p.z) < Math.max(minSep, p.r)) return false;
    }
    placedPts.push({ x, z, r: minSep });
    return true;
  };
  const track = (g, m) => { if (g) disposables.push(g); if (m) disposables.push(m); };

  /* 공용 PBR 머티리얼 킷 (roughness/metalness 대비 + 절차적 석재/한지 그레인) */
  const grain = getGrainTexture();
  const makePbr = (color, roughness = 0.85, metalness = 0.05, extra = {}) => {
    const m = new THREE.MeshStandardMaterial(Object.assign({
      color, roughness, metalness,
      bumpMap: grain || null, bumpScale: grain ? 0.035 : 0,
    }, extra));
    track(null, m);
    return m;
  };

  /* InstancedMesh 배치 빌더 — 같은 지오메트리·머티리얼을 단일 드로우콜로 합침 */
  const instBatches = new Map();
  const _dummy = new THREE.Object3D();
  const _col = new THREE.Color();
  function queueInst(key, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, tintHex = null) {
    let b = instBatches.get(key);
    if (!b) { b = { geo, mat, items: [] }; instBatches.set(key, b); }
    b.items.push({ x, y, z, rx, ry, rz, sx, sy, sz, tintHex });
  }
  const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(), color: 0x0b0908, transparent: true, opacity: 0.72, depthWrite: false
  });
  track(shadowGeo, shadowMat);
  function addContactShadow(x, z, radius = 1.6) {
    queueInst('__contactShadow', shadowGeo, shadowMat, x, 0.025, z, 0, 0, 0, radius * 2, 1, radius * 2);
  }

  /* 공용 석등 지오메트리/머티리얼 (인스턴싱) */
  const lanBaseG = new THREE.CylinderGeometry(0.32, 0.44, 0.30, 6);
  const lanColG = new THREE.CylinderGeometry(0.13, 0.18, 1.02, 6);
  const lanCoreG = new THREE.CylinderGeometry(0.19, 0.19, 0.34, 6);
  const lanCapG = new THREE.ConeGeometry(0.58, 0.36, 6);
  const lanStoneM = makePbr(0x52524c, 0.90, 0.05);
  track(lanBaseG, null); track(lanColG, null); track(lanCoreG, null); track(lanCapG, null);
  const lanGlowMats = new Map();
  function queueStoneLantern(x, z, glowHex, sc = 1) {
    let gm = lanGlowMats.get(glowHex);
    if (!gm) {
      gm = new THREE.MeshStandardMaterial({ color: glowHex, emissive: glowHex, emissiveIntensity: 1.45, roughness: 0.22 });
      track(null, gm); lanGlowMats.set(glowHex, gm);
    }
    queueInst('lanBase', lanBaseG, lanStoneM, x, 0.15 * sc, z, 0, 0, 0, sc, sc, sc);
    queueInst('lanCol', lanColG, lanStoneM, x, 0.78 * sc, z, 0, 0, 0, sc, sc, sc);
    queueInst('lanCore_' + glowHex, lanCoreG, gm, x, 1.44 * sc, z, 0, 0, 0, sc, sc, sc);
    queueInst('lanCap', lanCapG, lanStoneM, x, 1.76 * sc, z, 0, 0, 0, sc, sc, sc);
    addContactShadow(x, z, 0.95 * sc);
  }

  const addParticles = (cnt, col, sz, op, mode) => {
    const p = makeParticleField(rng, cnt, col, sz, op, mode);
    track(p.geo, p.mat);
    group.add(p.pts);
    particles.push(p.pts);
  };

  /* 8장 종루: 3D 음파 돔 + 토러스 충격파 */
  const domeGeo = k === 'bell' ? new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5) : null;
  const torusGeo = k === 'bell' ? new THREE.TorusGeometry(1, 0.055, 10, 48) : null;
  if (torusGeo) torusGeo.rotateX(Math.PI / 2);
  if (domeGeo) track(domeGeo, null);
  if (torusGeo) track(torusGeo, null);

  function spawnBellShockwave(x, z, maxR = 11.5, dur = 1.35) {
    if (!domeGeo || !torusGeo) return;
    const wg = new THREE.Group();
    wg.position.set(x, 0.08, z);
    const dMat = new THREE.ShaderMaterial({
      vertexShader: WAVE_DOME_VERT, fragmentShader: WAVE_DOME_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(0xe6b552) }, uCoreCol: { value: new THREE.Color(0xfff4cf) } },
    });
    const dome = new THREE.Mesh(domeGeo, dMat); dome.renderOrder = 5; wg.add(dome);
    const tMat1 = new THREE.MeshBasicMaterial({ color: 0xffe49e, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const tMat2 = new THREE.MeshBasicMaterial({ color: 0x8ef2d4, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring1 = new THREE.Mesh(torusGeo, tMat1); ring1.position.y = 0.22; ring1.renderOrder = 6; wg.add(ring1);
    const ring2 = new THREE.Mesh(torusGeo, tMat2); ring2.position.y = 0.55; ring2.renderOrder = 6; wg.add(ring2);
    group.add(wg);
    activeWaves.push({ group: wg, dome, ring1, ring2, dMat, tMat1, tMat2, age: 0, dur, maxR });
  }

  /* 9장/13장: 실시간 3D 혈석 크리스탈 제단 */
  const bsBaseGeo = k === 'blood' ? new THREE.CylinderGeometry(0.85, 1.15, 0.26, 6) : null;
  const bsStepGeo = k === 'blood' ? new THREE.CylinderGeometry(0.58, 0.78, 0.22, 6) : null;
  const bsMainGeo = k === 'blood' ? new THREE.ConeGeometry(0.38, 1.85, 5) : null;
  const bsSideGeo = k === 'blood' ? new THREE.ConeGeometry(0.20, 1.05, 5) : null;
  const bsRingGeo = k === 'blood' ? new THREE.TorusGeometry(0.76, 0.032, 6, 24) : null;
  const bsStoneMat = k === 'blood' ? makePbr(0x2c2426, 0.90, 0.08) : null;
  if (k === 'blood') { track(bsBaseGeo, null); track(bsStepGeo, null); track(bsMainGeo, null); track(bsSideGeo, null); track(bsRingGeo, null); }
  let disposed = false;
  function attachInteractiveGlb(parent, fallback, file, targetHeight) {
    loadPropModel(file).then((asset) => {
      if (!asset || disposed) return;
      const holder = new THREE.Group();
      holder.scale.setScalar(targetHeight / asset.height);
      const model = asset.scene.clone();
      model.position.sub(new THREE.Vector3(asset.center.x, asset.base, asset.center.z));
      holder.add(model);
      parent.add(holder);
      fallback.visible = false;
    });
  }
  function createBloodstone3D(x, z, r = 2.6) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const cryMat = new THREE.MeshStandardMaterial({ color: 0x52161c, emissive: 0xa82026, emissiveIntensity: 0.52, roughness: 0.42, metalness: 0.20 });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a45, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    const { geo: pGeo, mat: pMat } = makeShaderPool(Math.max(1.8, r * 0.95), 0x260508, 0x781018, 0xff5a45, 0);
    track(pGeo, pMat); track(null, cryMat); track(null, ringMat);
    shaderMats.push(pMat);
    const pool = new THREE.Mesh(pGeo, pMat); pool.position.y = 0.045; pool.renderOrder = 1; g.add(pool);
    const fallback = new THREE.Group();
    const b1 = new THREE.Mesh(bsBaseGeo, bsStoneMat); b1.position.y = 0.13; fallback.add(b1);
    const b2 = new THREE.Mesh(bsStepGeo, bsStoneMat); b2.position.y = 0.35; fallback.add(b2);
    const mainC = new THREE.Mesh(bsMainGeo, cryMat); mainC.position.y = 1.28; fallback.add(mainC);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const sc = new THREE.Mesh(bsSideGeo, cryMat);
      sc.position.set(Math.cos(a) * 0.34, 0.85, Math.sin(a) * 0.34);
      sc.rotation.set(Math.sin(a) * 0.32, a, -Math.cos(a) * 0.32);
      fallback.add(sc);
    }
    g.add(fallback);
    attachInteractiveGlb(g, fallback, 'interactiveBloodstone.glb', 2.8);
    const orbRing = new THREE.Mesh(bsRingGeo, ringMat); orbRing.position.y = 1.25; orbRing.rotation.x = Math.PI * 0.38; g.add(orbRing);
    spinNodes.push(orbRing);
    g.userData = { cryMat, ringMat, pool, orbRing, active: true };
    group.add(g);
    return g;
  }

  /* 8장: 조선식 단청 종각 + LatheGeometry 청동 범종 (v1.66 interactiveBelfry.glb 적용) */
  const bfBaseGeo = k === 'bell' ? new THREE.BoxGeometry(2.35, 0.28, 2.35) : null;
  const bfPostGeo = k === 'bell' ? new THREE.CylinderGeometry(0.085, 0.105, 2.55, 7) : null;
  const bfBeamGeo = k === 'bell' ? new THREE.BoxGeometry(2.15, 0.16, 0.18) : null;
  const bfRoofGeo = k === 'bell' ? new THREE.ConeGeometry(2.05, 0.84, 4) : null;
  const bfBellGeo = k === 'bell' ? makeKoreanBellGeo() : null;
  const bfStoneMat = k === 'bell' ? makePbr(0x4f4d48, 0.90, 0.05) : null;
  const bfWoodMat = k === 'bell' ? makePbr(0x63241b, 0.78, 0.06) : null;
  const bfTileMat = k === 'bell' ? makePbr(0x22262c, 0.65, 0.15) : null;
  const bfBronzeMat = k === 'bell' ? makePbr(0xa88c52, 0.28, 0.78, { emissive: 0x3b2a0c, emissiveIntensity: 0.35 }) : null;
  if (k === 'bell') { track(bfBaseGeo, null); track(bfPostGeo, null); track(bfBeamGeo, null); track(bfRoofGeo, null); track(bfBellGeo, null); }
  function createBelfry3D(x, z, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    const fallback = new THREE.Group();
    const base = new THREE.Mesh(bfBaseGeo, bfStoneMat); base.position.y = 0.14; fallback.add(base);
    [[-0.86, -0.86], [0.86, -0.86], [-0.86, 0.86], [0.86, 0.86]].forEach(([px, pz]) => {
      const pt = new THREE.Mesh(bfPostGeo, bfWoodMat); pt.position.set(px, 1.48, pz); fallback.add(pt);
    });
    const bm = new THREE.Mesh(bfBeamGeo, bfWoodMat); bm.position.y = 2.66; fallback.add(bm);
    const roof = new THREE.Mesh(bfRoofGeo, bfTileMat); roof.position.y = 3.16; roof.rotation.y = Math.PI / 4; fallback.add(roof);
    const pivot = new THREE.Group(); pivot.position.y = 2.62;
    const bell = new THREE.Mesh(bfBellGeo, bfBronzeMat); bell.position.y = -0.95; pivot.add(bell);
    pivot.userData = { swing: 0.06, phase: rng() * 6.28 };
    fallback.add(pivot); bellPivots.push(pivot);
    g.add(fallback);
    attachInteractiveGlb(g, fallback, 'interactiveBelfry.glb', 4.2);
    g.userData = { pivot, nextAmb: 1.5 + rng() * 3.0 };
    group.add(g);
    return g;
  }

  /* ===================== v1.63 테마별 환경 효과 (20개 GLB 외 절차적 지형지물 전면 제거, 지면 셰이더·파티클만 유지) ===================== */
  if (k === 'none') {
    addParticles(120, 0xff9252, 0.14, 0.76, 'rise');
    addParticles(90, 0xc9bfb0, 0.12, 0.50, 'drift');
  } else if (k === 'bamboo') {
    addParticles(125, 0x7ee0b4, 0.15, 0.74, 'fall');
  } else if (k === 'rubble') {
    addParticles(110, 0xd8ccb8, 0.13, 0.56, 'drift');
  } else if (k === 'blood') {
    if (stageNo === 13) {
      addParticles(140, 0xff4a3a, 0.16, 0.80, 'rise');
      addParticles(80, 0x8f1a24, 0.22, 0.42, 'drift');
    } else {
      addParticles(120, 0xff5842, 0.15, 0.76, 'rise');
    }
  } else if (k === 'snow') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.45, d = 11.4;
      const sx = Math.cos(a) * d, sz = Math.sin(a) * d;
      if (!canPlace(sx, sz, 4.4, 10.2)) continue;
      const { geo, mat } = makeShaderPool(2.8 + rng() * 0.7, 0x7b8c98, 0xcad6df, 0xffffff, 1); track(geo, mat); shaderMats.push(mat);
      const p = new THREE.Mesh(geo, mat); p.position.set(sx, 0.04, sz); p.renderOrder = 1; group.add(p);
    }
    addParticles(180, 0xf2f8ff, 0.17, 0.85, 'fall');
    addParticles(80, 0xc8e4f8, 0.12, 0.55, 'drift');
  } else if (k === 'root') {
    addParticles(120, 0xcfa968, 0.15, 0.70, 'fall');
    addParticles(70, 0x8fd694, 0.12, 0.52, 'drift');
  } else if (k === 'bell') {
    addParticles(110, 0xf6db9c, 0.15, 0.70, 'rise');
  } else if (k === 'water') {
    if (stageNo === 14) {
      addParticles(140, 0x99d8ff, 0.16, 0.78, 'rise');
      addParticles(90, 0xa892e8, 0.14, 0.55, 'drift');
    } else {
      addParticles(130, 0x9ef0e0, 0.16, 0.75, 'rise');
    }
  } else if (k === 'fog' || k === 'moon' || k === 'wall') {
    const colA = k === 'moon' ? 0x0d181c : k === 'wall' ? 0x141d20 : 0x121f22;
    const colB = k === 'moon' ? 0x1c3036 : k === 'wall' ? 0x223236 : 0x1e3438;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, { geo, mat } = makeShaderPool(5.4, colA, colB, 0xd9ceb8, 2); track(geo, mat); shaderMats.push(mat);
      const m = new THREE.Mesh(geo, mat); m.position.set(Math.cos(a) * 7.2, 0.14 + i * 0.02, Math.sin(a) * 7.2); m.renderOrder = 2; group.add(m);
    }
    if (k === 'wall') {
      addParticles(130, 0xff8048, 0.15, 0.80, 'rise');
    } else if (k === 'moon') {
      addParticles(125, stageNo === 16 ? 0xffcf78 : 0xff6252, 0.16, 0.76, 'rise');
    } else {
      addParticles(130, 0x84f2d6, 0.15, 0.74, 'drift');
    }
  }

  /* ============================================================================
     v0.60 산수화 3D 활력 환경 레이어 (3d-kasumidera-ultra-realism · 3d-cloth-material · 3d-paper-material)
     전 스테이지 공통: ① 2겹 원경 산수 산맥 링  ② 바람에 나부끼는 주홍 깃발(InstancedMesh)
                     ③ 바람에 흔들리는 단풍·소나무 군락  ④ 부유 한지 풍등(역광 투과)
     ============================================================================ */
  const actIdx = Math.max(1, Math.min(4, Math.ceil(stageNo / 4)));
  const floatLanterns = [];
  {
    /* 1) 2겹 산수화 원경 산맥 실루엣 링 (부드러운 붓번짐·안개 그라데이션) */
    const mountainPal = [
      null,
      { near: 0x1e1a16, far: 0x2d2720, mist: 0x161311 }, // 1막: 심안 달빛 먹산
      { near: 0x13201e, far: 0x1f3330, mist: 0x0e1817 }, // 2막: 대숲 밤안개 산맥
      { near: 0x241316, far: 0x361d21, mist: 0x190d0f }, // 3막: 혈월 야산
      { near: 0x191626, far: 0x29243d, mist: 0x120e1c }  // 4막: 심연 능선
    ][actIdx];

    const buildMountainRing = (radius, segs, baseH, amp1, amp2, seedOff, peakCol, mistCol, alpha) => {
      const pos = new Float32Array((segs + 1) * 2 * 3);
      const uv = new Float32Array((segs + 1) * 2 * 2);
      const idx = [];
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const a = u * Math.PI * 2;
        const ridge = baseH
          + Math.sin(a * 5.0 + seedOff) * amp1
          + Math.cos(a * 9.0 - seedOff * 1.4) * amp2
          + Math.sin(a * 14.0 + seedOff * 2.1) * (amp2 * 0.45);
        const h = Math.max(2.6, ridge);
        const cx = Math.cos(a) * radius, cz = Math.sin(a) * radius;
        const b = i * 6, tu = i * 4;
        pos[b] = cx; pos[b + 1] = -0.6; pos[b + 2] = cz;
        pos[b + 3] = cx; pos[b + 4] = h; pos[b + 5] = cz;
        uv[tu] = u * 4.0; uv[tu + 1] = 0;
        uv[tu + 2] = u * 4.0; uv[tu + 3] = 1;
        if (i < segs) {
          const v = i * 2;
          idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        vertexShader: MOUNTAIN_VERT, fragmentShader: MOUNTAIN_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uPeakCol: { value: new THREE.Color(peakCol) },
          uMistCol: { value: new THREE.Color(mistCol) },
          uAlpha: { value: alpha },
        },
      });
      m.userData.cardSkip = true;
      shaderMats.push(m);
      track(g, m);
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 0;
      mesh.frustumCulled = false;
      group.add(mesh);
    };
    buildMountainRing(30.5, 64, 8.2, 3.2, 1.8, stageNo * 1.3, mountainPal.near, mountainPal.mist, 0.78);
    buildMountainRing(39.0, 64, 13.8, 4.6, 2.4, stageNo * 2.7 + 1.9, mountainPal.far, mountainPal.mist, 0.56);

    /* v1.63: 20개 GLB 외 공통 절차적 지형지물(깃발·현무암·석등·단풍나무·풍등·목교) 전면 제거 */
  }

  /* InstancedMesh 일괄 플러시 (단일 배칭으로 드로우콜 최소화) */
  let instDrawCalls = 0, totalInstances = 0;
  instBatches.forEach((b, key) => {
    if (!b.items.length) return;
    const im = new THREE.InstancedMesh(b.geo, b.mat, b.items.length);
    im.name = 'inst-' + key;
    if (key === '__contactShadow') im.renderOrder = 1;
    let hasTint = false;
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i];
      _dummy.position.set(it.x, it.y, it.z);
      _dummy.rotation.set(it.rx, it.ry, it.rz);
      _dummy.scale.set(it.sx, it.sy, it.sz);
      _dummy.updateMatrix();
      im.setMatrixAt(i, _dummy.matrix);
      if (it.tintHex != null) { hasTint = true; _col.setHex(it.tintHex); im.setColorAt(i, _col); }
    }
    im.instanceMatrix.needsUpdate = true;
    if (hasTint && im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
    instDrawCalls++;
    totalInstances += b.items.length;
  });

  /* v1.63: 절차적 청동 향로·이끼 석계단·고사리 군락 제거, 3D 낙엽 파티클만 유지 */
  const v67Updaters = [];
  if (k === 'bamboo' || k === 'root' || k === 'none') {
    const lOpts = k === 'bamboo'
      ? { shape: 'bamboo', count: 64, colorHex: 0x6fd4a2, palette: [0x58c490, 0x7ee0b4, 0x3f9e70, 0x95f0c4] }
      : k === 'root'
        ? { shape: 'autumn', count: 60, colorHex: 0xd49b54, palette: [0xc98a42, 0xe0b46b, 0xa86832, 0x8f5028] }
        : { shape: 'ash', count: 52, colorHex: 0xc9bfb0, palette: [0xd9cfc0, 0xff9a5c, 0x8c8278, 0xb8aea0] };
    const fl = createFallingLeaves3D(rng, lOpts);
    group.add(fl.mesh);
    v67Updaters.push(fl);
  }
  /* v1.38: 화면을 가로지르는 누런 가짜 빛기둥(SkyRays) 비활성화 — 청묵 툰 톤 일관성 유지 */

  scene.add(group);
  let elapsed = 0;

  function getGroundY(x, z) {
    let bestY = 0;
    for (let i = 0; i < bridges.length; i++) {
      const b = bridges[i];
      const dx = x - b.x, dz = z - b.z;
      const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) <= b.halfL + 0.35 && Math.abs(lz) <= b.halfW + 0.25) {
        const u = Math.max(0, Math.min(1, (lx + b.halfL) / (b.halfL * 2)));
        const edgeFade = Math.abs(lx) > b.halfL ? Math.max(0, 1 - (Math.abs(lx) - b.halfL) / 0.35) : 1;
        const deckY = (0.30 + Math.sin(u * Math.PI) * b.archH) * edgeFade;
        if (deckY > bestY) bestY = deckY;
      }
    }
    return bestY;
  }

  return {
    group,
    kind: k,
    colliders,
    bridges,
    getGroundY,
    getStats() {
      return {
        kind: k,
        stageNo,
        instancedDrawCalls: instDrawCalls,
        totalInstances,
        particleFields: particles.length,
        dynamicPatches: dynamicPatchMap.size,
      };
    },
    triggerBellWave(x, z) {
      if (k !== 'bell') return;
      spawnBellShockwave(x, z, 14.5, 1.55);
      dynamicPatchMap.forEach((g) => {
        const dx = g.position.x - x, dz = g.position.z - z;
        if (dx * dx + dz * dz < 6.0 && g.userData && g.userData.pivot) {
          g.userData.pivot.userData.swing = 0.42;
        }
      });
    },
    syncPatches(list, stateMap, nowElapsed) {
      if (!Array.isArray(list) || (k !== 'blood' && k !== 'bell')) return;
      const seen = new Set();
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        seen.add(p.key);
        let node = dynamicPatchMap.get(p.key);
        if (!node) {
          node = k === 'blood' ? createBloodstone3D(p.x, p.z, p.r || 2.6) : createBelfry3D(p.x, p.z, Math.atan2(-p.x, -p.z));
          dynamicPatchMap.set(p.key, node);
        }
        node.visible = true;
        if (k === 'blood' && node.userData) {
          const isOff = (stateMap && stateMap[p.key] > nowElapsed);
          const wantActive = !isOff;
          if (node.userData.active !== wantActive) {
            node.userData.active = wantActive;
            node.userData.cryMat.emissiveIntensity = wantActive ? 1.05 : 0.06;
            node.userData.cryMat.color.setHex(wantActive ? 0x8a151c : 0x262226);
            node.userData.ringMat.opacity = wantActive ? 0.78 : 0.12;
            node.userData.pool.visible = wantActive;
          }
        }
      }
      dynamicPatchMap.forEach((node, key) => { if (!seen.has(key)) node.visible = false; });
    },
    update(dt) {
      const d = Math.min(0.05, Number(dt || 0.016));
      elapsed += d;
      for (let i = 0; i < shaderMats.length; i++) shaderMats[i].uniforms.uTime.value = elapsed;
      for (let i = 0; i < v67Updaters.length; i++) v67Updaters[i].update(d);
      for (let i = 0; i < floatLanterns.length; i++) {
        const fl = floatLanterns[i], u = fl.userData;
        const a = u.baseAngle + elapsed * u.speed;
        fl.position.x = Math.cos(a) * u.orbitR;
        fl.position.z = Math.sin(a) * u.orbitR;
        fl.position.y = u.baseY + Math.sin(elapsed * 1.15 + u.phase) * 0.36;
        fl.rotation.y = -a;
      }
      for (let i = 0; i < swayNodes.length; i++) swayNodes[i].rotation.z = Math.sin(elapsed * 1.6 + swayNodes[i].userData.phase) * 0.055;
      for (let i = 0; i < spinNodes.length; i++) spinNodes[i].rotation.z += d * 1.35;
      for (let i = 0; i < bellPivots.length; i++) {
        const pv = bellPivots[i];
        pv.userData.swing = Math.max(0.05, pv.userData.swing * Math.pow(0.28, d));
        pv.rotation.z = Math.sin(elapsed * 5.2 + pv.userData.phase) * pv.userData.swing;
      }
      if (k === 'bell') {
        dynamicPatchMap.forEach((g) => {
          if (!g.visible || !g.userData) return;
          g.userData.nextAmb -= d;
          if (g.userData.nextAmb <= 0) {
            g.userData.nextAmb = 3.4 + rng() * 1.8;
            spawnBellShockwave(g.position.x, g.position.z, 6.2, 1.2);
          }
        });
      }
      for (let i = activeWaves.length - 1; i >= 0; i--) {
        const w = activeWaves[i];
        w.age += d;
        const p = w.age / w.dur;
        if (p >= 1) {
          group.remove(w.group);
          w.dMat.dispose(); w.tMat1.dispose(); w.tMat2.dispose();
          activeWaves.splice(i, 1);
          continue;
        }
        const ease = 1 - Math.pow(1 - p, 2.4);
        const r = 0.6 + ease * w.maxR;
        w.dome.scale.set(r, r * 0.42, r);
        w.dMat.uniforms.uProgress.value = p;
        w.dMat.uniforms.uTime.value = elapsed;
        w.ring1.scale.setScalar(r * 1.02);
        w.tMat1.opacity = Math.max(0, (1 - p) * 0.92);
        w.ring2.scale.setScalar(Math.max(0.2, r * 0.78));
        w.ring2.position.y = 0.35 + ease * 1.25;
        w.tMat2.opacity = Math.max(0, (1 - p) * 0.72);
      }
      for (let pi = 0; pi < particles.length; pi++) {
        const pt = particles[pi], mode = pt.userData.mode, arr = pt.geometry.attributes.position.array;
        for (let i = 0; i < arr.length; i += 3) {
          if (mode === 'fall') {
            arr[i] += d * 0.75; arr[i + 1] -= d * 1.65;
            if (arr[i + 1] < 0.1) { arr[i + 1] = 8.8; arr[i] = ((arr[i] + 15) % 30) - 15; }
          } else if (mode === 'rise') {
            arr[i] += Math.sin(elapsed + i) * d * 0.25; arr[i + 1] += d * 0.95;
            if (arr[i + 1] > 8.8) arr[i + 1] = 0.2;
          } else {
            arr[i] += d * 0.55; arr[i + 1] += Math.sin(elapsed * 1.4 + i) * d * 0.22;
            if (arr[i] > 15) arr[i] = -15;
          }
        }
        pt.geometry.attributes.position.needsUpdate = true;
      }
    },
    dispose() {
      disposed = true;
      scene.remove(group);
      for (let i = 0; i < activeWaves.length; i++) {
        activeWaves[i].dMat.dispose(); activeWaves[i].tMat1.dispose(); activeWaves[i].tMat2.dispose();
      }
      activeWaves.length = 0;
      for (let i = 0; i < v67Updaters.length; i++) if (v67Updaters[i].dispose) v67Updaters[i].dispose();
      v67Updaters.length = 0;
      dynamicPatchMap.clear();
      for (let i = 0; i < disposables.length; i++) if (disposables[i] && disposables[i].dispose) disposables[i].dispose();
    },
  };
}
