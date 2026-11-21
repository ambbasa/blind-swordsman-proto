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
  float swell = sin(pos.x * 0.85 - uTime * 2.1 + pos.z * 0.4) * 0.035 + cos(pos.x * 1.9 - uTime * 3.4 - pos.z * 1.1) * 0.018;
  pos.y += swell * edgeMask;
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vViewDir = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uDeepCol, uShallowCol, uFoamCol, uMoonCol, uLightDir;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 31.7); a *= 0.5; }
  return v;
}
void main() {
  float centerDist = abs(vUv.y - 0.5) * 2.0;
  vec2 flow1 = vec2(vWorldPos.x * 0.42 - uTime * 0.62, vWorldPos.z * 0.65 + uTime * 0.08);
  vec2 flow2 = vec2(vWorldPos.x * 0.88 - uTime * 1.05, vWorldPos.z * 1.15 - uTime * 0.14);
  float n1 = fbm(flow1), n2 = fbm(flow2 + n1 * 0.65), wave = mix(n1, n2, 0.55);
  float shoreNoise = (n1 - 0.5) * 0.22;
  float edgeAlpha = 1.0 - smoothstep(0.68 + shoreNoise, 1.0, centerDist);
  if (edgeAlpha < 0.02) discard;
  float eps = 0.08;
  float nx = fbm(flow1 + vec2(eps, 0.0)) - fbm(flow1 - vec2(eps, 0.0));
  float nz = fbm(flow2 + vec2(0.0, eps)) - fbm(flow2 - vec2(0.0, eps));
  vec3 N = normalize(vec3(-nx * 1.85, 1.0, -nz * 1.85));
  vec3 V = normalize(vViewDir), L = normalize(uLightDir), H = normalize(L + V);
  float depth = smoothstep(0.95, 0.18, centerDist);
  vec3 col = mix(uShallowCol, uDeepCol, depth);
  float rippleBand = smoothstep(0.56, 0.78, wave);
  col = mix(col, uShallowCol * 1.45, rippleBand * 0.32);
  col += uMoonCol * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0) * 0.26;
  col += uMoonCol * pow(max(dot(N, H), 0.0), 42.0) * (0.55 + 0.45 * rippleBand);
  float foamBand = smoothstep(0.60, 0.82, centerDist + shoreNoise * 0.8) * (1.0 - smoothstep(0.84, 0.99, centerDist + shoreNoise * 0.6));
  col = mix(col, uFoamCol, clamp(foamBand * smoothstep(0.38, 0.72, n2) * 0.78, 0.0, 0.85));
  gl_FragColor = vec4(col, clamp(edgeAlpha * (0.82 + 0.16 * depth), 0.0, 0.96));
}
`;

export function createInkRiver3D(scene, opts = {}) {
  const centerFn = opts.centerFn || ((x) => 5.5 * Math.sin(x * 0.085) + 2.0 * Math.sin(x * 0.021 + 1.3));
  const widthFn = opts.widthFn || ((x) => 2.1 + 0.7 * Math.sin(x * 0.13 + 0.6));
  const segX = opts.segX || 120, segZ = opts.segZ || 6, halfSpan = opts.halfSpan || 44;
  const pos = new Float32Array((segX + 1) * (segZ + 1) * 3);
  const uv = new Float32Array((segX + 1) * (segZ + 1) * 2);
  const idx = [];
  for (let ix = 0; ix <= segX; ix++) {
    const u = ix / segX, x = -halfSpan + u * (halfSpan * 2), cz = centerFn(x), hw = widthFn(x) * 1.18;
    for (let iz = 0; iz <= segZ; iz++) {
      const v = iz / segZ, vi = ix * (segZ + 1) + iz;
      pos[vi * 3] = x; pos[vi * 3 + 1] = 0.055; pos[vi * 3 + 2] = cz + (v - 0.5) * 2.0 * hw;
      uv[vi * 2] = u * 8.0; uv[vi * 2 + 1] = v;
    }
  }
  for (let ix = 0; ix < segX; ix++) for (let iz = 0; iz < segZ; iz++) {
    const a = ix * (segZ + 1) + iz, b = (ix + 1) * (segZ + 1) + iz;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uDeepCol: { value: new THREE.Color(0x0b1a1f) }, uShallowCol: { value: new THREE.Color(0x2d484b) },
      uFoamCol: { value: new THREE.Color(0xd9ceb8) }, uMoonCol: { value: new THREE.Color(0xf0dec2) },
      uLightDir: { value: new THREE.Vector3(-0.42, 0.78, 0.46).normalize() }
    }
  });
  mat.userData.cardProfile = 'ground';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ink-river-3d'; mesh.renderOrder = 2; mesh.frustumCulled = false;
  if (scene && typeof scene.add === 'function') scene.add(mesh);
  return {
    mesh, material: mat,
    update(dt) { mat.uniforms.uTime.value += Math.min(0.05, Number(dt || 0.016)); },
    dispose() { if (scene && typeof scene.remove === 'function') scene.remove(mesh); geo.dispose(); mat.dispose(); }
  };
}
