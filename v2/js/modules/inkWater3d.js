/**
 * v2/js/modules/inkWater3d.js
 * 심안(SIMAN) v0.57 — 10장 '뼈의 강' · 14장 '망각의 나루' 스테이지별 커스텀 GLSL 프로시저럴 강물 셰이더
 * - angle · offset · centerFn · widthFn 지원으로 두 강 스테이지의 위치·흐름 방향·곡선·수색을 완전히 차별화
 * - 다중 옥타브 FBM 유속 파문 · 법선 섭동 · 프레넬 달빛 반사 · 붓번짐 강변 물거품
 */
import * as THREE from 'three';

const WATER_VERT = /* glsl */`
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;

void main() {
  vUv = uv;
  vec3 pos = position;
  float edgeMask = sin(clamp(uv.y, 0.0, 1.0) * 3.14159265);
  float swell = sin(uv.x * 3.4 - uTime * 2.2 + uv.y * 2.4) * 0.036
              + cos(uv.x * 7.2 - uTime * 3.5 - uv.y * 4.1) * 0.018;
  pos.y += swell * edgeMask;
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vViewDir = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform float uFlowDir;
uniform vec3 uDeepCol;
uniform vec3 uShallowCol;
uniform vec3 uFoamCol;
uniform vec3 uMoonCol;
uniform vec3 uLightDir;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  float centerDist = abs(vUv.y - 0.5) * 2.0;

  /* 강 길이 방향(vUv.x)을 따라 흐르는 2겹 교차 유속 좌표 — 회전된 강에서도 유속이 정확히 일치 */
  vec2 flow1 = vec2(vUv.x * 2.4 - uTime * 0.68 * uFlowDir, vUv.y * 3.8 + uTime * 0.09);
  vec2 flow2 = vec2(vUv.x * 5.1 - uTime * 1.15 * uFlowDir, vUv.y * 6.5 - uTime * 0.15);

  float n1 = fbm(flow1);
  float n2 = fbm(flow2 + n1 * 0.65);
  float wave = mix(n1, n2, 0.55);

  float shoreNoise = (n1 - 0.5) * 0.22;
  float edgeAlpha = 1.0 - smoothstep(0.68 + shoreNoise, 1.0, centerDist);
  if (edgeAlpha < 0.02) discard;

  float eps = 0.07;
  float nx = fbm(flow1 + vec2(eps, 0.0)) - fbm(flow1 - vec2(eps, 0.0));
  float nz = fbm(flow2 + vec2(0.0, eps)) - fbm(flow2 - vec2(0.0, eps));
  vec3 N = normalize(vec3(-nx * 1.9, 1.0, -nz * 1.9));
  vec3 V = normalize(vViewDir);
  vec3 L = normalize(uLightDir);
  vec3 H = normalize(L + V);

  float depth = smoothstep(0.95, 0.18, centerDist);
  vec3 col = mix(uShallowCol, uDeepCol, depth);

  float rippleBand = smoothstep(0.55, 0.78, wave);
  col = mix(col, uShallowCol * 1.48, rippleBand * 0.34);

  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += uMoonCol * fresnel * 0.28;

  float spec = pow(max(dot(N, H), 0.0), 40.0);
  col += uMoonCol * spec * (0.55 + 0.45 * rippleBand);

  float foamBand = smoothstep(0.60, 0.82, centerDist + shoreNoise * 0.8) * (1.0 - smoothstep(0.84, 0.99, centerDist + shoreNoise * 0.6));
  float foamBreak = smoothstep(0.36, 0.72, n2);
  col = mix(col, uFoamCol, clamp(foamBand * foamBreak * 0.80, 0.0, 0.86));

  float alpha = clamp(edgeAlpha * (0.84 + 0.15 * depth), 0.0, 0.96);
  gl_FragColor = vec4(col, alpha);
}
`;

export function createInkRiver3D(scene, opts = {}) {
  const centerFn = opts.centerFn || ((u) => 5.5 * Math.sin(u * 0.085) + 2.0 * Math.sin(u * 0.021 + 1.3));
  const widthFn = opts.widthFn || ((u) => 2.1 + 0.7 * Math.sin(u * 0.13 + 0.6));
  const angle = Number(opts.angle || 0);
  const offset = Number(opts.offset || 0);
  const flowDir = Number(opts.flowDir || 1);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const segX = opts.segX || 120;
  const segZ = opts.segZ || 6;
  const halfSpan = opts.halfSpan || 46;

  const vertCount = (segX + 1) * (segZ + 1);
  const pos = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);
  const idx = [];

  for (let ix = 0; ix <= segX; ix++) {
    const uNorm = ix / segX;
    const lx = -halfSpan + uNorm * (halfSpan * 2);
    const cz = centerFn(lx) + offset;
    const hw = widthFn(lx) * 1.18;
    for (let iz = 0; iz <= segZ; iz++) {
      const vNorm = iz / segZ;
      const lz = cz + (vNorm - 0.5) * 2.0 * hw;
      const wx = lx * cosA - lz * sinA;
      const wz = lx * sinA + lz * cosA;
      const vi = ix * (segZ + 1) + iz;
      pos[vi * 3] = wx;
      pos[vi * 3 + 1] = 0.055;
      pos[vi * 3 + 2] = wz;
      uv[vi * 2] = uNorm * 10.0;
      uv[vi * 2 + 1] = vNorm;
    }
  }

  for (let ix = 0; ix < segX; ix++) {
    for (let iz = 0; iz < segZ; iz++) {
      const a = ix * (segZ + 1) + iz;
      const b = (ix + 1) * (segZ + 1) + iz;
      const c = a + 1;
      const d = b + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uFlowDir: { value: flowDir },
      uDeepCol: { value: new THREE.Color(opts.deepCol ?? 0x0b1a1f) },
      uShallowCol: { value: new THREE.Color(opts.shallowCol ?? 0x2d484b) },
      uFoamCol: { value: new THREE.Color(opts.foamCol ?? 0xd9ceb8) },
      uMoonCol: { value: new THREE.Color(opts.moonCol ?? 0xf0dec2) },
      uLightDir: { value: new THREE.Vector3(-0.42, 0.78, 0.46).normalize() },
    },
  });
  mat.userData.cardProfile = 'ground';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ink-river-3d';
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  if (scene && typeof scene.add === 'function') scene.add(mesh);

  return {
    mesh,
    material: mat,
    update(dt) {
      mat.uniforms.uTime.value += Math.min(0.05, Number(dt || 0.016));
    },
    dispose() {
      if (scene && typeof scene.remove === 'function') scene.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}
