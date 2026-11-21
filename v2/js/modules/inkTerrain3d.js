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

  /* 최소 이격 거리 가드 (뭉침 방지 + 중앙 전투 구역 보호) */
  const placedPts = [];
  const canPlace = (x, z, minSep = 3.8, minR = 8.4) => {
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
    const awningMat = makePbr(0x634d3d, 0.88, 0.02, { side: THREE.DoubleSide });
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
        for (let i = -2; i <= 2; i++) {
          const px = side * 10.6, pz = i * 5.4;
          queueInst('cCol', colGeo, lacqMat, px, 2.4, pz);
          queueInst('cCap', capGeo, darkMat, px, 4.78, pz);
          queueInst('cCap', capGeo, darkMat, px, 0.13, pz);
          if (i < 2) queueInst('cBeam', beamGeo, darkMat, px, 4.55, pz + 2.7);
          queueInst('cBraz', brazierGeo, emberMat, px - side * 0.65, 3.25, pz);
          addContactShadow(px, pz, 1.25);
        }
      }
      addParticles(150, 0xff4a3a, 0.16, 0.82, 'rise');
      addParticles(90, 0x8f1a24, 0.22, 0.45, 'drift');
    } else {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        queueStoneLantern(Math.cos(a) * 10.6, Math.sin(a) * 10.6, 0xff4538, 1.05);
      }
      addParticles(130, 0xff5842, 0.15, 0.78, 'rise');
    }
  } else if (k === 'snow') {
    const pillarGeo = new THREE.CylinderGeometry(0.28, 0.38, 2.4, 6);
    const snowCapGeo = new THREE.SphereGeometry(0.42, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const pillarMat = makePbr(0x8898a4, 0.84, 0.08);
    const snowMat = makePbr(0xf0f7fc, 0.68, 0.04);
    track(pillarGeo, null); track(snowCapGeo, null);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2, d = 8.6 + (i % 2) * 2.2;
      const sx = Math.cos(a) * d, sz = Math.sin(a) * d;
      if (!canPlace(sx, sz, 4.0, 8.0)) continue;
      const { geo, mat } = makeShaderPool(2.8 + rng() * 0.9, 0x7b8c98, 0xcad6df, 0xffffff, 1); track(geo, mat); shaderMats.push(mat);
      const p = new THREE.Mesh(geo, mat); p.position.set(sx, 0.04, sz); p.renderOrder = 1; group.add(p);
      if (i < 5) {
        const gx = Math.cos(a) * (d + 2.0), gz = Math.sin(a) * (d + 2.0);
        queueInst('sPil', pillarGeo, pillarMat, gx, 1.15, gz);
        queueInst('sCap', snowCapGeo, snowMat, gx, 2.32, gz);
        addContactShadow(gx, gz, 1.15);
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      queueStoneLantern(Math.cos(a) * 10.2, Math.sin(a) * 10.2, 0xbce6ff, 1.0);
    }
    addParticles(200, 0xf2f8ff, 0.17, 0.88, 'fall');
    addParticles(90, 0xc8e4f8, 0.12, 0.58, 'drift');
  } else if (k === 'root') {
    const rootMat = makePbr(0x3a2b1e, 0.92, 0.03);
    const stumpGeo = new THREE.CylinderGeometry(0.45, 0.78, 1.35, 7);
    const branchGeo = new THREE.CylinderGeometry(0.08, 0.22, 2.6, 6);
    const archCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.8, -0.1, 0), new THREE.Vector3(-0.6, 0.58, 0.28), new THREE.Vector3(0.6, 0.42, -0.22), new THREE.Vector3(1.9, -0.1, 0.1)]);
    const archGeo = new THREE.TubeGeometry(archCurve, 14, 0.15, 6, false);
    track(stumpGeo, null); track(branchGeo, null); track(archGeo, null);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.15, d = 9.2 + (i % 2) * 2.0;
      const rx = Math.cos(a) * d, rz = Math.sin(a) * d;
      if (!canPlace(rx, rz, 4.0, 8.6)) continue;
      queueInst('rArch', archGeo, rootMat, rx, 0, rz, 0, rng() * Math.PI, 0, 0.9 + rng() * 0.25, 0.9 + rng() * 0.3, 1);
      addContactShadow(rx, rz, 1.6);
      if (i % 2 === 0) {
        const sx = Math.cos(a) * (d + 1.4), sz = Math.sin(a) * (d + 1.4);
        queueInst('rStump', stumpGeo, rootMat, sx, 0.65, sz);
        queueInst('rBranch', branchGeo, rootMat, sx + 0.35, 1.9, sz, 0.35, a, -0.45);
        addContactShadow(sx, sz, 1.35);
      }
    }
    addParticles(130, 0xcfa968, 0.15, 0.72, 'fall');
    addParticles(80, 0x8fd694, 0.12, 0.55, 'drift');
  } else if (k === 'bell') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.35;
      queueStoneLantern(Math.cos(a) * 10.8, Math.sin(a) * 10.8, 0xffd27a, 1.0);
    }
    addParticles(120, 0xf6db9c, 0.15, 0.72, 'rise');
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
      const poleGeo = new THREE.CylinderGeometry(0.06, 0.085, 3.8, 6);
      const flagGeo = new THREE.PlaneGeometry(0.95, 1.55);
      const brazGeo = new THREE.CylinderGeometry(0.45, 0.28, 0.55, 8);
      const coalGeo = new THREE.SphereGeometry(0.36, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const poleMat = makePbr(0x3a2d26, 0.85, 0.08);
      const flagMat = makePbr(stageNo === 15 ? 0x2a1f28 : 0x961e18, 0.82, 0.04, { side: THREE.DoubleSide });
      const ironMat = makePbr(0x27262b, 0.45, 0.72);
      const coalMat = makePbr(0xff6230, 0.30, 0.05, { emissive: 0xff4818, emissiveIntensity: 1.55 });
      track(poleGeo, null); track(flagGeo, null); track(brazGeo, null); track(coalGeo, null);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.5, r = 10.6;
        const fx = Math.cos(a) * r, fz = Math.sin(a) * r;
        if (!canPlace(fx, fz, 4.4, 9.6)) continue;
        const pv = new THREE.Group(); pv.position.set(fx, 0, fz);
        const pl = new THREE.Mesh(poleGeo, poleMat); pl.position.y = 1.9; pv.add(pl);
        const fl = new THREE.Mesh(flagGeo, flagMat); fl.position.set(0.5, 2.95, 0); pv.add(fl);
        pv.userData.phase = i * 1.4; group.add(pv); swayNodes.push(pv);
        addContactShadow(fx, fz, 1.1);
        const bx = Math.cos(a + 0.24) * (r - 1.3), bz = Math.sin(a + 0.24) * (r - 1.3);
        queueInst('wBraz', brazGeo, ironMat, bx, 0.55, bz);
        queueInst('wCoal', coalGeo, coalMat, bx, 0.80, bz);
        addContactShadow(bx, bz, 1.0);
      }
      addParticles(150, 0xff8048, 0.15, 0.82, 'rise');
    } else if (k === 'moon') {
      const steleGeo = new THREE.BoxGeometry(0.75, 2.8, 0.32);
      const baseGeo = new THREE.BoxGeometry(1.25, 0.35, 0.85);
      const sealGeo = new THREE.TorusGeometry(0.55, 0.035, 6, 24);
      const stoneMat = makePbr(0x362a2c, 0.86, 0.08);
      const sealMat = new THREE.MeshBasicMaterial({ color: stageNo === 16 ? 0xffd27a : 0xff4c42, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
      track(steleGeo, null); track(baseGeo, null); track(sealGeo, sealMat);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3, r = 10.4 + (i % 2) * 1.6;
        const mx = Math.cos(a) * r, mz = Math.sin(a) * r;
        if (!canPlace(mx, mz, 4.4, 9.6)) continue;
        const ry = -a + Math.PI / 2;
        queueInst('mBase', baseGeo, stoneMat, mx, 0.17, mz, 0, ry, 0);
        queueInst('mStele', steleGeo, stoneMat, mx, 1.65, mz, 0, ry, 0);
        addContactShadow(mx, mz, 1.35);
        const sl = new THREE.Mesh(sealGeo, sealMat); sl.position.set(mx, 3.45, mz); sl.rotation.y = ry; group.add(sl); spinNodes.push(sl);
      }
      addParticles(140, stageNo === 16 ? 0xffcf78 : 0xff6252, 0.16, 0.78, 'rise');
    } else {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4, r = 10.0 + (i % 2) * 1.8;
        const fx = Math.cos(a) * r, fz = Math.sin(a) * r;
        if (!canPlace(fx, fz, 4.2, 9.2)) continue;
        queueStoneLantern(fx, fz, 0x7ef2d4, i % 2 === 0 ? 1.22 : 0.92);
      }
      addParticles(140, 0x84f2d6, 0.15, 0.76, 'drift');
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
