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
import {
  getClothWeaveNormal,
  buildArchedBridge3D,
  buildTalismanGateLine3D,
  buildGnarledDeadTree3D,
  buildCarvedLantern3D,
  buildKasumideraTorii3D,
  buildFracturedBasaltRocks3D
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
  function createBloodstone3D(x, z, r = 2.6) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const cryMat = new THREE.MeshStandardMaterial({ color: 0x8a151c, emissive: 0xd82428, emissiveIntensity: 1.05, roughness: 0.22, metalness: 0.30 });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a45, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false });
    const { geo: pGeo, mat: pMat } = makeShaderPool(Math.max(1.8, r * 0.95), 0x260508, 0x781018, 0xff5a45, 0);
    track(pGeo, pMat); track(null, cryMat); track(null, ringMat);
    shaderMats.push(pMat);
    const pool = new THREE.Mesh(pGeo, pMat); pool.position.y = 0.045; pool.renderOrder = 1; g.add(pool);
    const b1 = new THREE.Mesh(bsBaseGeo, bsStoneMat); b1.position.y = 0.13; g.add(b1);
    const b2 = new THREE.Mesh(bsStepGeo, bsStoneMat); b2.position.y = 0.35; g.add(b2);
    const mainC = new THREE.Mesh(bsMainGeo, cryMat); mainC.position.y = 1.28; g.add(mainC);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const sc = new THREE.Mesh(bsSideGeo, cryMat);
      sc.position.set(Math.cos(a) * 0.34, 0.85, Math.sin(a) * 0.34);
      sc.rotation.set(Math.sin(a) * 0.32, a, -Math.cos(a) * 0.32);
      g.add(sc);
    }
    const orbRing = new THREE.Mesh(bsRingGeo, ringMat); orbRing.position.y = 1.25; orbRing.rotation.x = Math.PI * 0.38; g.add(orbRing);
    spinNodes.push(orbRing);
    g.userData = { cryMat, ringMat, pool, orbRing, active: true };
    group.add(g);
    return g;
  }

  /* 8장: 조선식 단청 종각 + LatheGeometry 청동 범종 */
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
    const base = new THREE.Mesh(bfBaseGeo, bfStoneMat); base.position.y = 0.14; g.add(base);
    [[-0.86, -0.86], [0.86, -0.86], [-0.86, 0.86], [0.86, 0.86]].forEach(([px, pz]) => {
      const pt = new THREE.Mesh(bfPostGeo, bfWoodMat); pt.position.set(px, 1.48, pz); g.add(pt);
    });
    const bm = new THREE.Mesh(bfBeamGeo, bfWoodMat); bm.position.y = 2.66; g.add(bm);
    const roof = new THREE.Mesh(bfRoofGeo, bfTileMat); roof.position.y = 3.16; roof.rotation.y = Math.PI / 4; g.add(roof);
    const pivot = new THREE.Group(); pivot.position.y = 2.62;
    const bell = new THREE.Mesh(bfBellGeo, bfBronzeMat); bell.position.y = -0.95; pivot.add(bell);
    pivot.userData = { swing: 0.06, phase: rng() * 6.28 };
    g.add(pivot); bellPivots.push(pivot);
    g.userData = { pivot, nextAmb: 1.5 + rng() * 3.0 };
    group.add(g);
    return g;
  }

  /* ===================== 테마별 3D 기물 (전면 InstancedMesh 배칭) ===================== */
  if (k === 'none') {
    const postGeo = new THREE.CylinderGeometry(0.085, 0.11, 2.35, 6);
    const beamGeo = new THREE.BoxGeometry(2.1, 0.12, 0.14);
    const roofGeo = new THREE.BoxGeometry(2.3, 0.08, 1.45);
    const crateGeo = new THREE.BoxGeometry(0.65, 0.52, 0.65);
    const charMat = makePbr(0x2a211c, 0.92, 0.04);
    const awningMat = makePbr(0x634d3d, 0.88, 0.02, {
      side: THREE.DoubleSide,
      normalMap: getClothWeaveNormal() || null,
      normalScale: new THREE.Vector2(1.1, 1.1)
    });
    const crateMat = makePbr(0x453528, 0.86, 0.04);
    track(postGeo, null); track(beamGeo, null); track(roofGeo, null); track(crateGeo, null);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.35, d = 10.2 + (i % 2) * 1.8;
      const sx = Math.cos(a) * d, sz = Math.sin(a) * d;
      if (!canPlace(sx, sz, 4.4, 9.5)) continue;
      const ry = -a + (rng() - 0.5) * 0.35, cosR = Math.cos(ry), sinR = Math.sin(ry);
      const loc = (lx, lz) => [sx + lx * cosR - lz * sinR, sz + lx * sinR + lz * cosR];
      [[-0.9, -0.55], [0.9, -0.55], [-0.9, 0.55], [0.9, 0.55]].forEach(([px, pz]) => {
        const [wx, wz] = loc(px, pz);
        queueInst('post', postGeo, charMat, wx, 1.15, wz, 0, ry, 0);
      });
      queueInst('beam', beamGeo, charMat, sx, 2.25, sz, 0, ry, 0);
      queueInst('roof', roofGeo, awningMat, sx, 2.35, sz, 0.22, ry, (rng() - 0.5) * 0.14);
      const [cx, cz] = loc(0.45, 0.2);
      queueInst('crate', crateGeo, crateMat, cx, 0.26, cz, 0, ry + rng(), 0);
      addContactShadow(sx, sz, 1.85);
      if (i % 2 === 0) queueStoneLantern(Math.cos(a + 0.26) * (d - 1.3), Math.sin(a + 0.26) * (d - 1.3), 0xffa652, 0.88);
    }
    addParticles(130, 0xff9252, 0.14, 0.78, 'rise');
    addParticles(100, 0xc9bfb0, 0.12, 0.52, 'drift');
  } else if (k === 'bamboo') {
    /* 대나무 숲: 기존 240 draw calls → 4 draw calls (InstancedMesh + per-instance 청죽 색조 변주) */
    const stalkGeo = new THREE.CylinderGeometry(0.055, 0.08, 5.2, 7); stalkGeo.translate(0, 2.6, 0);
    const nodeGeo = new THREE.TorusGeometry(0.074, 0.014, 5, 10); nodeGeo.rotateX(Math.PI / 2);
    const bladeGeo = new THREE.BoxGeometry(0.095, 0.014, 0.72); bladeGeo.translate(0, 0, 0.36);
    const stalkMat = makePbr(0x467f64, 0.58, 0.08);
    const nodeMat = makePbr(0x284e3d, 0.72, 0.05);
    const leafMat = makePbr(0x529473, 0.62, 0.05);
    track(stalkGeo, null); track(nodeGeo, null); track(bladeGeo, null);
    const tints = [0x3d7259, 0x498468, 0x528f70, 0x35644e];
    for (let c = 0; c < 6; c++) {
      const ang = (c / 6) * Math.PI * 2 + 0.25, d = 9.2 + (c % 2) * 2.2, cx = Math.cos(ang) * d, cz = Math.sin(ang) * d;
      addContactShadow(cx, cz, 2.0);
      for (let j = 0; j < 4; j++) {
        const bx = cx + (rng() - 0.5) * 1.5, bz = cz + (rng() - 0.5) * 1.5;
        const leanX = (rng() - 0.5) * 0.08, leanZ = (rng() - 0.5) * 0.08, scY = 0.88 + rng() * 0.26;
        const tCol = tints[(c + j) % tints.length];
        queueInst('bStalk', stalkGeo, stalkMat, bx, 0, bz, leanX, 0, leanZ, 1, scY, 1, tCol);
        for (let h = 1.0; h <= 4.4; h += 1.1) {
          queueInst('bNode', nodeGeo, nodeMat, bx + leanZ * h * 0.4, h * scY, bz + leanX * h * 0.4, leanX, 0, leanZ);
        }
        for (let b = 0; b < 5; b++) {
          const hy = (3.1 + b * 0.42) * scY;
          queueInst('bLeaf', bladeGeo, leafMat, bx, hy, bz, -0.28 + (rng() - 0.5) * 0.2, b * 1.25 + rng() * 0.6, (rng() - 0.5) * 0.3, 1, 1, 1, tCol);
        }
      }
    }
    addParticles(125, 0x7ee0b4, 0.15, 0.74, 'fall');
  } else if (k === 'rubble') {
    const colGeo = new THREE.CylinderGeometry(0.32, 0.42, 2.2, 7);
    const slabGeo = new THREE.BoxGeometry(1.5, 0.28, 0.9);
    const tileGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.95, 6, 1, false, 0, Math.PI);
    const stoneMat = makePbr(0x635d52, 0.90, 0.06);
    const darkStoneMat = makePbr(0x42403b, 0.92, 0.05);
    const tileMat = makePbr(0x31353c, 0.72, 0.12, { side: THREE.DoubleSide });
    track(colGeo, null); track(slabGeo, null); track(tileGeo, null);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.25, d = 9.4 + (i % 2) * 2.1;
      const rx = Math.cos(a) * d, rz = Math.sin(a) * d;
      if (!canPlace(rx, rz, 4.2, 8.8)) continue;
      queueInst('rCol', colGeo, stoneMat, rx, 0.85, rz, 0, rng() * 6.28, (rng() - 0.5) * 0.42, 1, 0.55 + rng() * 0.65, 1);
      queueInst('rSlab', slabGeo, darkStoneMat, rx + 0.6, 0.14, rz + 0.3, 0.15, rng() * 3, -0.18);
      for (let t = 0; t < 3; t++) {
        queueInst('rTile', tileGeo, tileMat, rx - 0.35 + t * 0.35, 0.18 + t * 0.08, rz - 0.25 + rng() * 0.4, Math.PI / 2 + (rng() - 0.5) * 0.4, rng() * 3, 0);
      }
      addContactShadow(rx, rz, 1.55);
    }
    addParticles(130, 0xd8ccb8, 0.13, 0.58, 'drift');
  } else if (k === 'blood') {
    if (stageNo === 13) {
      const colGeo = new THREE.CylinderGeometry(0.24, 0.28, 4.8, 8);
      const capGeo = new THREE.BoxGeometry(0.76, 0.26, 0.76);
      const beamGeo = new THREE.BoxGeometry(0.22, 0.26, 5.4);
      const brazierGeo = new THREE.CylinderGeometry(0.32, 0.18, 0.34, 8);
      const lacqMat = makePbr(0x691616, 0.42, 0.18);
      const darkMat = makePbr(0x281a1c, 0.86, 0.10);
      const emberMat = makePbr(0xff4c38, 0.25, 0.10, { emissive: 0xff3b28, emissiveIntensity: 1.5 });
      track(colGeo, null); track(capGeo, null); track(beamGeo, null); track(brazierGeo, null);
      for (const side of [-1, 1]) {
        for (let i = -2; i <= 2; i += 2) {
          const px = side * 12.4, pz = i * 5.2;
          queueInst('cCol', colGeo, lacqMat, px, 2.4, pz);
          queueInst('cCap', capGeo, darkMat, px, 4.78, pz);
          queueInst('cCap', capGeo, darkMat, px, 0.13, pz);
          queueInst('cBraz', brazierGeo, emberMat, px - side * 0.65, 3.25, pz);
          addContactShadow(px, pz, 1.25);
          addCollider(px, pz, 0.72);
        }
      }
      addParticles(140, 0xff4a3a, 0.16, 0.80, 'rise');
      addParticles(80, 0x8f1a24, 0.22, 0.42, 'drift');
    } else {
      addParticles(120, 0xff5842, 0.15, 0.76, 'rise');
    }
  } else if (k === 'snow') {
    const pillarGeo = new THREE.CylinderGeometry(0.28, 0.38, 2.4, 6);
    const snowCapGeo = new THREE.SphereGeometry(0.42, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const pillarMat = makePbr(0x8898a4, 0.84, 0.08);
    const snowMat = makePbr(0xf0f7fc, 0.68, 0.04);
    track(pillarGeo, null); track(snowCapGeo, null);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.45, d = 11.4;
      const sx = Math.cos(a) * d, sz = Math.sin(a) * d;
      if (!canPlace(sx, sz, 4.4, 10.2)) continue;
      const { geo, mat } = makeShaderPool(2.8 + rng() * 0.7, 0x7b8c98, 0xcad6df, 0xffffff, 1); track(geo, mat); shaderMats.push(mat);
      const p = new THREE.Mesh(geo, mat); p.position.set(sx, 0.04, sz); p.renderOrder = 1; group.add(p);
      const gx = Math.cos(a) * (d + 1.8), gz = Math.sin(a) * (d + 1.8);
      queueInst('sPil', pillarGeo, pillarMat, gx, 1.15, gz);
      queueInst('sCap', snowCapGeo, snowMat, gx, 2.32, gz);
      addContactShadow(gx, gz, 1.15);
      addCollider(gx, gz, 0.72);
    }
    addParticles(180, 0xf2f8ff, 0.17, 0.85, 'fall');
    addParticles(80, 0xc8e4f8, 0.12, 0.55, 'drift');
  } else if (k === 'root') {
    const rootMat = makePbr(0x3a2b1e, 0.92, 0.03);
    const archCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.8, -0.1, 0), new THREE.Vector3(-0.6, 0.58, 0.28), new THREE.Vector3(0.6, 0.42, -0.22), new THREE.Vector3(1.9, -0.1, 0.1)]);
    const archGeo = new THREE.TubeGeometry(archCurve, 14, 0.15, 6, false);
    track(archGeo, null);
    /* v0.64: 구형 직선 그루터기/가지 제거, 자연 굴곡 뿌리 5개만 외곽에 여백 배치 */
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.35, d = 11.4 + (i % 2) * 1.4;
      const rx = Math.cos(a) * d, rz = Math.sin(a) * d;
      if (!canPlace(rx, rz, 4.4, 10.4)) continue;
      queueInst('rArch', archGeo, rootMat, rx, 0, rz, 0, rng() * Math.PI, 0, 0.9 + rng() * 0.22, 0.9 + rng() * 0.25, 1);
      addContactShadow(rx, rz, 1.5);
    }
    addParticles(120, 0xcfa968, 0.15, 0.70, 'fall');
    addParticles(70, 0x8fd694, 0.12, 0.52, 'drift');
  } else if (k === 'bell') {
    addParticles(110, 0xf6db9c, 0.15, 0.70, 'rise');
  } else if (k === 'water') {
    const rcfg = opts.riverCfg || {};
    const centerFn = rcfg.centerFn || ((u) => 5.5 * Math.sin(u * 0.085) + 2.0 * Math.sin(u * 0.021 + 1.3));
    const widthFn = rcfg.widthFn || ((u) => 2.1 + 0.7 * Math.sin(u * 0.13 + 0.6));
    const angle = Number(rcfg.angle || 0), offset = Number(rcfg.offset || 0);
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const toWorld = (lx, lz) => [lx * cosA - lz * sinA, lx * sinA + lz * cosA];

    if (stageNo === 14) {
      const pileGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.9, 6);
      const plankGeo = new THREE.BoxGeometry(1.85, 0.1, 0.42);
      const rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
      const woodMat = makePbr(0x3a2d26, 0.88, 0.05);
      const rockMat = makePbr(0x252a36, 0.85, 0.10);
      track(pileGeo, null); track(plankGeo, null); track(rockGeo, null);
      for (let i = 0; i < 10; i++) {
        const lx = -14 + i * 3.1, side = i % 2 === 0 ? 1 : -1;
        if (Math.abs(lx - (-4.2)) < 2.4) continue; /* v0.62: 아치 다리 상판 관통 방지 */
        const lz = centerFn(lx) + offset + side * (widthFn(lx) + 1.05);
        const [wx, wz] = toWorld(lx, lz);
        queueInst('wPile', pileGeo, woodMat, wx, 0.8, wz);
        addContactShadow(wx, wz, 0.9);
        if (i % 3 === 0) {
          queueInst('wPlank', plankGeo, woodMat, wx, 0.25, wz, 0, angle + (rng() - 0.5) * 0.3, 0);
          queueStoneLantern(wx + side * 0.9, wz + side * 0.9, 0x8ee8ff, 0.9);
        } else {
          queueInst('wRock', rockGeo, rockMat, wx, 0.22, wz, 0, rng() * 3, 0, 1.2, 0.65, 1.0);
        }
      }
      addParticles(140, 0x99d8ff, 0.16, 0.78, 'rise');
      addParticles(90, 0xa892e8, 0.14, 0.55, 'drift');
    } else {
      const stakeGeo = new THREE.CylinderGeometry(0.06, 0.12, 1.65, 5);
      const boneMat = makePbr(0xdcd1ba, 0.76, 0.05);
      const ribCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.6, -0.55), new THREE.Vector3(0, 2.55, -1.45)]);
      const ribGeo = new THREE.TubeGeometry(ribCurve, 12, 0.13, 6, false);
      track(stakeGeo, null); track(ribGeo, null);
      for (let i = 0; i < 10; i++) {
        const lx = -13 + i * 2.9, side = i % 2 === 0 ? 1 : -1;
        if (Math.abs(lx - (-6.2)) < 2.4) continue; /* v0.62: 아치 다리 상판 관통 방지 */
        const lz = centerFn(lx) + offset + side * (widthFn(lx) + 0.95);
        const [wx, wz] = toWorld(lx, lz);
        if (i % 2 === 0) {
          queueInst('wRib', ribGeo, boneMat, wx, 0, wz, 0, angle + (side < 0 ? Math.PI : 0) + (rng() - 0.5) * 0.25, 0);
          addContactShadow(wx, wz, 1.15);
        } else {
          queueInst('wStake', stakeGeo, boneMat, wx, 0.72, wz, (rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3);
        }
      }
      addParticles(130, 0x9ef0e0, 0.16, 0.75, 'rise');
    }
  } else if (k === 'fog' || k === 'moon' || k === 'wall') {
    const colA = k === 'moon' ? 0x3b1014 : k === 'wall' ? 0x261d19 : 0x1a2624;
    const colB = k === 'moon' ? 0x7d1f24 : k === 'wall' ? 0x574233 : 0x45635e;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, { geo, mat } = makeShaderPool(5.4, colA, colB, 0xd9ceb8, 2); track(geo, mat); shaderMats.push(mat);
      const m = new THREE.Mesh(geo, mat); m.position.set(Math.cos(a) * 7.2, 0.14 + i * 0.02, Math.sin(a) * 7.2); m.renderOrder = 2; group.add(m);
    }
    if (k === 'wall') {
      /* v0.64: 화로 4기만 외곽에 깔끔하게 배치 + 충돌 등록 */
      const brazGeo = new THREE.CylinderGeometry(0.45, 0.28, 0.55, 8);
      const coalGeo = new THREE.SphereGeometry(0.36, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const ironMat = makePbr(0x27262b, 0.45, 0.72);
      const coalMat = makePbr(0xff6230, 0.30, 0.05, { emissive: 0xff4818, emissiveIntensity: 1.55 });
      track(brazGeo, null); track(coalGeo, null);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.78, r = 12.2;
        const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
        if (!canPlace(bx, bz, 4.4, 11.0)) continue;
        queueInst('wBraz', brazGeo, ironMat, bx, 0.55, bz);
        queueInst('wCoal', coalGeo, coalMat, bx, 0.80, bz);
        addContactShadow(bx, bz, 1.0);
        addCollider(bx, bz, 0.72);
      }
      addParticles(130, 0xff8048, 0.15, 0.80, 'rise');
    } else if (k === 'moon') {
      const steleGeo = new THREE.BoxGeometry(0.75, 2.8, 0.32);
      const baseGeo = new THREE.BoxGeometry(1.25, 0.35, 0.85);
      const sealGeo = new THREE.TorusGeometry(0.55, 0.035, 6, 24);
      const stoneMat = makePbr(0x362a2c, 0.86, 0.08);
      const sealMat = new THREE.MeshBasicMaterial({ color: stageNo === 16 ? 0xffd27a : 0xff4c42, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
      track(steleGeo, null); track(baseGeo, null); track(sealGeo, sealMat);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.78, r = 12.4;
        const mx = Math.cos(a) * r, mz = Math.sin(a) * r;
        if (!canPlace(mx, mz, 4.6, 11.0)) continue;
        const ry = -a + Math.PI / 2;
        queueInst('mBase', baseGeo, stoneMat, mx, 0.17, mz, 0, ry, 0);
        queueInst('mStele', steleGeo, stoneMat, mx, 1.65, mz, 0, ry, 0);
        addContactShadow(mx, mz, 1.35);
        addCollider(mx, mz, 0.85);
        const sl = new THREE.Mesh(sealGeo, sealMat); sl.position.set(mx, 3.45, mz); sl.rotation.y = ry; group.add(sl); spinNodes.push(sl);
      }
      addParticles(130, stageNo === 16 ? 0xffcf78 : 0xff6252, 0.16, 0.76, 'rise');
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

    /* 2) 바람에 나부끼는 주홍·먹색 진영 깃발 (3d-cloth-material — InstancedMesh 2드로우콜) */
    const poleGeo = new THREE.CylinderGeometry(0.045, 0.062, 3.6, 6);
    const poleMat = makePbr(0x3a2a20, 0.88, 0.08);
    const finialGeo = new THREE.SphereGeometry(0.085, 8, 6);
    const finialMat = makePbr(0xb8944a, 0.42, 0.58);
    const flagGeo = new THREE.PlaneGeometry(1.18, 0.82, 10, 4);
    flagGeo.translate(0.59, 0, 0);
    const flagDye = [0xb52b22, 0xb52b22, 0x2a6e5e, 0xc23026, 0x6b3a8a][actIdx] || 0xb52b22;
    const flagMat = new THREE.ShaderMaterial({
      vertexShader: CLOTH_FLAG_VERT, fragmentShader: CLOTH_FLAG_FRAG,
      transparent: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uDyeCol: { value: new THREE.Color(flagDye) },
        uTrimCol: { value: new THREE.Color(0xe6c278) },
        uLightCol: { value: new THREE.Color(0xffe6b8) },
        uWfHero: WF.uWfHero, uWfRange: WF.uWfRange, uWfAmt: WF.uWfAmt, uWfColor: WF.uWfColor, uWfDirK: WF.uWfDirK,
      },
    });
    shaderMats.push(flagMat);
    track(poleGeo, null); track(finialGeo, null); track(flagGeo, flagMat);
    const flagCount = 3;
    for (let i = 0; i < flagCount; i++) {
      const a = (i / flagCount) * Math.PI * 2 + 0.62 + (stageNo % 3) * 0.20;
      const r = 14.4;
      const fx = Math.cos(a) * r, fz = Math.sin(a) * r;
      if (!canPlace(fx, fz, 4.2, 13.0)) continue;
      const ry = -a + Math.PI * 0.35;
      queueInst('v60FlagPole', poleGeo, poleMat, fx, 1.8, fz, 0, ry, 0.05);
      queueInst('v60FlagFin', finialGeo, finialMat, fx - Math.sin(0.05) * 3.6, 3.62, fz, 0, ry, 0);
      queueInst('v60FlagCloth', flagGeo, flagMat, fx - 0.12, 3.02, fz, 0, ry, 0);
      addContactShadow(fx, fz, 0.9);
      addCollider(fx, fz, 0.45);
    }

    /* 3) 바람에 흔들리는 고목 단풍 · 수묵 소나무 군락 (3d-kasumidera-ultra-realism — 굽은 가지 + 다중 붓잎 군락) */
    const trunkGeo = new THREE.CylinderGeometry(0.085, 0.22, 2.7, 7);
    const branchGeo = new THREE.CylinderGeometry(0.032, 0.082, 1.35, 6);
    const trunkMat = makePbr(0x332419, 0.94, 0.03);
    /* 불규칙하게 다듬은 붓잎 뭉치 지오메트리(매끈한 플라스틱 공 제거) */
    const canopyGeo = new THREE.DodecahedronGeometry(0.54, 1);
    const cp = canopyGeo.attributes.position;
    for (let vi = 0; vi < cp.count; vi++) {
      const vx = cp.getX(vi), vy = cp.getY(vi), vz = cp.getZ(vi);
      const jitter = 0.84 + 0.28 * Math.abs(Math.sin(vx * 7.3 + vy * 11.1 + vz * 5.7));
      cp.setXYZ(vi, vx * jitter * 1.18, vy * jitter * 0.62, vz * jitter * 1.12);
    }
    canopyGeo.computeVertexNormals();
    const canopyPal = [
      null,
      { base: 0x993a28, shadow: 0x3b1812, tints: [0xffffff, 0xe8b08a, 0xd48e72, 0xf2c68c] }, // 1막: 차분한 석채 단풍·황토
      { base: 0x2d5446, shadow: 0x122620, tints: [0xffffff, 0xc6e2d6, 0xa8cbbd, 0xdfe8d2] }, // 2막: 수묵 소나무·비취 잎
      { base: 0x872b24, shadow: 0x301012, tints: [0xffffff, 0xde9c84, 0xc27a6c, 0xe8b48a] }, // 3막: 혈월 고목 단풍
      { base: 0x4b5c72, shadow: 0x1e2433, tints: [0xffffff, 0xd4dfec, 0xb8c6d8, 0xe6edf5] }  // 4막: 설산·심연 한송
    ][actIdx];
    const canopyMat = new THREE.ShaderMaterial({
      vertexShader: FOLIAGE_VERT, fragmentShader: FOLIAGE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uBaseCol: { value: new THREE.Color(canopyPal.base) },
        uShadowCol: { value: new THREE.Color(canopyPal.shadow) },
        uKeyDir: { value: new THREE.Vector3(-0.45, 0.82, 0.36).normalize() },
        uWfHero: WF.uWfHero, uWfRange: WF.uWfRange, uWfAmt: WF.uWfAmt, uWfColor: WF.uWfColor, uWfDirK: WF.uWfDirK,
      },
    });
    shaderMats.push(canopyMat);
    track(trunkGeo, null); track(branchGeo, null); track(canopyGeo, canopyMat);
    /* v0.64: 야외/자연 스테이지에만 3그루 외곽 단풍·소나무 배치 (석탑·고목·암봉 무대 과밀 방지) */
    const treeCount = [1, 2, 3, 4, 6, 8, 10, 14].includes(stageNo) ? 3 : 0;
    for (let i = 0; i < treeCount; i++) {
      const a = (i / Math.max(1, treeCount)) * Math.PI * 2 + 1.05 + (stageNo % 5) * 0.18;
      const r = 15.2 + (i % 2) * 1.1;
      const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
      if (!canPlace(tx, tz, 4.8, 14.0)) continue;
      const sc = 0.88 + rng() * 0.30;
      const yaw = rng() * Math.PI * 2;
      const lean = (rng() - 0.5) * 0.22;
      queueInst('v60TreeTrunk', trunkGeo, trunkMat, tx, 1.32 * sc, tz, lean, yaw, lean * 0.7, sc, sc, sc);
      addContactShadow(tx, tz, 1.95 * sc);
      addCollider(tx, tz, 0.85 * sc);
      /* 뻗어 나가는 굽은 가지 3개 + 각 가지 끝에 겹쳐 찍은 붓잎 뭉치 3개(총 9뭉치) */
      for (let b = 0; b < 3; b++) {
        const ba = yaw + b * 2.15 + (rng() - 0.5) * 0.45;
        const bx = tx + Math.cos(ba) * 0.52 * sc;
        const bz = tz + Math.sin(ba) * 0.52 * sc;
        const by = (2.15 + b * 0.22) * sc;
        queueInst('v60TreeBranch', branchGeo, trunkMat, bx, by, bz, Math.sin(ba) * 0.68, ba, -Math.cos(ba) * 0.68, sc, sc, sc);
        const tipX = tx + Math.cos(ba) * 0.98 * sc;
        const tipZ = tz + Math.sin(ba) * 0.98 * sc;
        const tipY = (2.68 + b * 0.24) * sc;
        for (let k = 0; k < 3; k++) {
          const ka = ba + (k - 1) * 1.1;
          const ox = tipX + Math.cos(ka) * 0.46 * sc;
          const oz = tipZ + Math.sin(ka) * 0.46 * sc;
          const oy = tipY + (k === 1 ? 0.28 : -0.04) * sc;
          const cs = (0.72 + (k === 1 ? 0.24 : 0.08) + rng() * 0.16) * sc;
          queueInst('v60TreeLeaf', canopyGeo, canopyMat, ox, oy, oz, 0, rng() * 6.28, 0, cs * 1.25, cs * 0.85, cs * 1.15, canopyPal.tints[(i + b + k) % canopyPal.tints.length]);
        }
      }
    }

    /* 4) 부유 한지 풍등 (3d-paper-material — 조선 풍등 Lathe 실루엣 + 호박빛 역광 + 은은한 후광) */
    const lPts = [
      new THREE.Vector2(0.14, -0.34),
      new THREE.Vector2(0.24, -0.18),
      new THREE.Vector2(0.30, 0.06),
      new THREE.Vector2(0.26, 0.26),
      new THREE.Vector2(0.14, 0.38),
      new THREE.Vector2(0.01, 0.42),
    ];
    const lBodyGeo = new THREE.LatheGeometry(lPts, 12);
    const lRingGeo = new THREE.TorusGeometry(0.14, 0.018, 6, 12); lRingGeo.rotateX(Math.PI / 2);
    const lRingMat = makePbr(0x3a2416, 0.80, 0.12);
    const lPaperMat = new THREE.ShaderMaterial({
      vertexShader: MIST_VERT, fragmentShader: HANJI_LANTERN_FRAG,
      transparent: false,
      uniforms: {
        uTime: { value: 0 },
        uPaperCol: { value: new THREE.Color(actIdx === 4 ? 0xa288ff : actIdx === 2 ? 0x7ae6c2 : 0xff8c38) },
        uCoreCol: { value: new THREE.Color(0xfff0be) },
      },
    });
    lPaperMat.userData.cardSkip = true;
    /* 풍등 주변 은은한 호박빛 후광 스프라이트 */
    let lHaloTex = null;
    if (typeof document !== 'undefined') {
      const hc = document.createElement('canvas'); hc.width = hc.height = 64;
      const hctx = hc.getContext('2d');
      const hg = hctx.createRadialGradient(32, 32, 2, 32, 32, 31);
      hg.addColorStop(0, 'rgba(255,220,130,0.65)');
      hg.addColorStop(0.45, 'rgba(255,148,58,0.24)');
      hg.addColorStop(1, 'rgba(255,120,40,0)');
      hctx.fillStyle = hg; hctx.fillRect(0, 0, 64, 64);
      lHaloTex = new THREE.CanvasTexture(hc);
    }
    const lHaloMat = new THREE.SpriteMaterial({
      map: lHaloTex, color: actIdx === 4 ? 0xb49cff : actIdx === 2 ? 0x8ef2d4 : 0xffa64d,
      transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    shaderMats.push(lPaperMat);
    track(lBodyGeo, lPaperMat); track(lRingGeo, null); track(lHaloTex, lHaloMat);
    const lanternCount = 3;
    for (let i = 0; i < lanternCount; i++) {
      const lg = new THREE.Group();
      const body = new THREE.Mesh(lBodyGeo, lPaperMat);
      const botRing = new THREE.Mesh(lRingGeo, lRingMat); botRing.position.y = -0.34;
      const halo = new THREE.Sprite(lHaloMat); halo.scale.set(1.65, 1.65, 1); halo.position.y = -0.06;
      lg.add(body, botRing, halo);
      const orbitR = 13.5 + i * 2.2;
      const baseAngle = (i / lanternCount) * Math.PI * 2 + stageNo * 0.9;
      const baseY = 5.4 + (i % 3) * 1.1;
      lg.position.set(Math.cos(baseAngle) * orbitR, baseY, Math.sin(baseAngle) * orbitR);
      lg.userData = { orbitR, baseAngle, baseY, speed: 0.048 + i * 0.012, phase: i * 1.9 };
      group.add(lg);
      floatLanterns.push(lg);
    }

    /* 5) v0.64 정돈된 스킬 3D 랜드마크 배치 (inkarena 기물과 자동 이격 + 실제 충돌체 등록) */
    const talismanGlow = [0xff9a44, 0xffa64d, 0x7ef2cc, 0xff6248, 0xc29aff][actIdx] || 0xff9a44;
    const registerLandmark = (node, x, z, shadowR = 1.6, colR = 0) => {
      node.position.set(x, 0, z);
      try { paintCard(node, 'prop'); } catch (e) {}
      group.add(node);
      if (node.userData && node.userData.disposables) {
        node.userData.disposables.forEach((d) => disposables.push(d));
      }
      if (shadowR > 0) addContactShadow(x, z, shadowR);
      if (colR > 0) addCollider(x, z, colR);
    };

    /* 5-a) 좌상단 여백에 한지 부적 금줄 문 1기만 정갈하게 배치 (기둥 양쪽만 충돌 등록해 아치 아래는 통과) */
    {
      const ta = Math.PI * 1.12, tr = 13.4;
      const tx = Math.cos(ta) * tr, tz = Math.sin(ta) * tr;
      if (canPlace(tx, tz, 4.4, 12.0)) {
        const span = 3.8;
        const rotY = -ta + Math.PI * 0.5;
        const gateLine = buildTalismanGateLine3D({ span, height: 2.9, glowHex: talismanGlow });
        gateLine.rotation.y = rotY;
        registerLandmark(gateLine, tx, tz, 2.0, 0);
        if (gateLine.userData && gateLine.userData.swayTalismans) {
          gateLine.userData.swayTalismans.forEach((tm) => swayNodes.push(tm));
        }
        for (const s of [-1, 1]) {
          addCollider(tx + Math.cos(rotY) * s * (span * 0.5), tz - Math.sin(rotY) * s * (span * 0.5), 0.45);
        }
      }
    }

    /* 5-b) 물길(10·14장) 및 4장: 캠버 아치 주홍 목교 1기 (통행 가능, 교각 기둥만 외곽 정리) */
    if (k === 'water' || stageNo === 4 || stageNo === 10 || stageNo === 14) {
      const rcfg = opts.riverCfg || {};
      const hasRiver = (k === 'water' || stageNo === 10 || stageNo === 14);
      let bx = 8.4, bz = -9.6, rotY = Math.PI * 0.25, bLen = 7.4;
      if (hasRiver) {
        const centerFn = rcfg.centerFn || ((u) => 5.5 * Math.sin(u * 0.085) + 2.0 * Math.sin(u * 0.021 + 1.3));
        const widthFn = rcfg.widthFn || ((u) => 2.1 + 0.7 * Math.sin(u * 0.13 + 0.6));
        const ang = Number(rcfg.angle || 0), off = Number(rcfg.offset || 0);
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        const lx = stageNo === 14 ? -4.2 : -6.2;
        const lz = centerFn(lx) + off;
        bx = lx * cosA - lz * sinA;
        bz = lx * sinA + lz * cosA;
        const dzdlx = centerFn(lx + 0.5) - centerFn(lx - 0.5);
        const tx = cosA - dzdlx * sinA;
        const tz = sinA + dzdlx * cosA;
        const nx = -tz, nz = tx;
        rotY = Math.atan2(-nz, nx);
        bLen = Math.max(7.2, widthFn(lx) * 2.85);
      }
      const bridge = buildArchedBridge3D({
        length: bLen, width: 2.3, archH: 0.96,
        railHex: stageNo === 14 ? 0x623b84 : 0xa62a20
      });
      bridge.rotation.y = rotY;
      registerLandmark(bridge, bx, bz, 3.6, 0);
      placedPts.push({ x: bx, z: bz, r: 4.5 });
    }

    /* 5-c) 7장 고목 골: 자연 굴곡 굽은 고목 7그루를 넓은 여백으로 원형 배치 + 줄기 충돌 */
    if (k === 'root' || stageNo === 7) {
      for (let di = 0; di < 7; di++) {
        const da = (di / 7) * Math.PI * 2 + 0.35;
        const dr = 13.6 + (di % 2) * 1.6;
        const dx = Math.cos(da) * dr, dz = Math.sin(da) * dr;
        if (!canPlace(dx, dz, 4.6, 12.2)) continue;
        const dtNode = buildGnarledDeadTree3D(rng, 0.95 + rng() * 0.35, 0x3b2c20);
        dtNode.rotation.y = rng() * Math.PI * 2;
        registerLandmark(dtNode, dx, dz, 1.85, 0.85);
      }
    }

    /* 5-d) 성소·성채 스테이지 우상단 여백: 금줄 곡선 산문(Torii) 1기 (좌우 기둥만 충돌 등록) */
    if ([2, 5, 6, 8, 9, 11, 13, 15, 16].includes(stageNo)) {
      const toriiWood = [0x8f241c, 0x8f241c, 0x3a4d44, 0x8c1e1e, 0x3c2c52][actIdx] || 0x8f241c;
      const ga = Math.PI * 1.44, gr = 14.0;
      const gx = Math.cos(ga) * gr, gz = Math.sin(ga) * gr;
      if (canPlace(gx, gz, 4.8, 12.6)) {
        const span = 4.5;
        const rotY = -ga + Math.PI * 0.5;
        const torii = buildKasumideraTorii3D({ span, height: 4.0, woodHex: toriiWood });
        torii.rotation.y = rotY;
        registerLandmark(torii, gx, gz, 2.6, 0);
        for (const s of [-1, 1]) {
          addCollider(gx + Math.cos(rotY) * s * (span * 0.44), gz - Math.sin(rotY) * s * (span * 0.44), 0.52);
        }
      }
    }

    /* 5-e) 조각 한지 석등 2기 (전투 구역 바깥 시선 유도 포인트 + 충돌 등록) */
    if ([1, 2, 4, 5, 6, 8, 9, 11, 13, 15, 16].includes(stageNo)) {
      const lAngles = [Math.PI * 0.82, Math.PI * 1.72];
      for (let li = 0; li < lAngles.length; li++) {
        const la = lAngles[li], lr = 12.6;
        const lx = Math.cos(la) * lr, lz = Math.sin(la) * lr;
        if (!canPlace(lx, lz, 4.0, 11.4)) continue;
        const lantern = buildCarvedLantern3D({ glowHex: talismanGlow, scale: 0.96 });
        registerLandmark(lantern, lx, lz, 1.15, 0.72);
      }
    }

    /* 5-f) 16-평면 파쇄 현무암 바위 군락 2곳 (과밀 방지 + 충돌 등록) */
    if ([2, 9, 12, 13, 15, 16].includes(stageNo)) {
      const rHex = actIdx === 4 ? 0x2f293c : actIdx === 3 ? 0x3a2325 : 0x45413b;
      const rAngles = [Math.PI * 0.16, Math.PI * 0.66];
      for (let ri = 0; ri < rAngles.length; ri++) {
        const ra = rAngles[ri], rr = 13.6;
        const rx = Math.cos(ra) * rr, rz = Math.sin(ra) * rr;
        if (!canPlace(rx, rz, 4.6, 12.2)) continue;
        const rocks = buildFracturedBasaltRocks3D(rng, { rockHex: rHex, count: 3, scale: 0.96 + rng() * 0.2 });
        registerLandmark(rocks, rx, rz, 1.9, 1.40);
      }
    }
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

  scene.add(group);
  let elapsed = 0;

  return {
    group,
    kind: k,
    colliders,
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
      scene.remove(group);
      for (let i = 0; i < activeWaves.length; i++) {
        activeWaves[i].dMat.dispose(); activeWaves[i].tMat1.dispose(); activeWaves[i].tMat2.dispose();
      }
      activeWaves.length = 0;
      dynamicPatchMap.clear();
      for (let i = 0; i < disposables.length; i++) if (disposables[i] && disposables[i].dispose) disposables[i].dispose();
    },
  };
}
