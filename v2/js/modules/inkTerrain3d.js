/**
 * v2/js/modules/inkTerrain3d.js
 * 심안(SIMAN) v0.57.1 — 전 스테이지(1~16장) 대나무숲 기준 고밀도 3D 입체 기물 + 3D 음파 셰이더 환경 엔진
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
}
`;

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

  const track = (g, m) => { if (g) disposables.push(g); if (m) disposables.push(m); };
  const addParticles = (cnt, col, sz, op, mode) => {
    const p = makeParticleField(rng, cnt, col, sz, op, mode);
    track(p.geo, p.mat);
    group.add(p.pts);
    particles.push(p.pts);
  };

  function addStoneLantern(parent, x, z, glowHex, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    const stoneM = new THREE.MeshLambertMaterial({ color: 0x52524c });
    const glowM = new THREE.MeshStandardMaterial({ color: glowHex, emissive: glowHex, emissiveIntensity: 1.35, roughness: 0.25 });
    const baseG = new THREE.CylinderGeometry(0.32, 0.42, 0.3, 6);
    const colG = new THREE.CylinderGeometry(0.14, 0.18, 1.0, 6);
    const coreG = new THREE.CylinderGeometry(0.19, 0.19, 0.34, 6);
    const capG = new THREE.ConeGeometry(0.56, 0.34, 6);
    track(baseG, stoneM); track(colG, null); track(coreG, glowM); track(capG, null);
    const b = new THREE.Mesh(baseG, stoneM); b.position.y = 0.15; g.add(b);
    const c = new THREE.Mesh(colG, stoneM); c.position.y = 0.78; g.add(c);
    const cr = new THREE.Mesh(coreG, glowM); cr.position.y = 1.44; g.add(cr);
    const cp = new THREE.Mesh(capG, stoneM); cp.position.y = 1.76; g.add(cp);
    parent.add(g);
    return g;
  }

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
      vertexShader: WAVE_DOME_VERT,
      fragmentShader: WAVE_DOME_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xe6b552) },
        uCoreCol: { value: new THREE.Color(0xfff4cf) },
      },
    });
    const dome = new THREE.Mesh(domeGeo, dMat);
    dome.renderOrder = 5;
    wg.add(dome);

    const tMat1 = new THREE.MeshBasicMaterial({ color: 0xffe49e, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const tMat2 = new THREE.MeshBasicMaterial({ color: 0x8ef2d4, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring1 = new THREE.Mesh(torusGeo, tMat1);
    ring1.position.y = 0.22;
    ring1.renderOrder = 6;
    const ring2 = new THREE.Mesh(torusGeo, tMat2);
    ring2.position.y = 0.55;
    ring2.renderOrder = 6;
    wg.add(ring1);
    wg.add(ring2);

    group.add(wg);
    activeWaves.push({ group: wg, dome, ring1, ring2, dMat, tMat1, tMat2, age: 0, dur, maxR });
  }

  const bsBaseGeo = k === 'blood' ? new THREE.CylinderGeometry(0.85, 1.15, 0.26, 6) : null;
  const bsStepGeo = k === 'blood' ? new THREE.CylinderGeometry(0.58, 0.78, 0.22, 6) : null;
  const bsMainGeo = k === 'blood' ? new THREE.ConeGeometry(0.38, 1.85, 5) : null;
  const bsSideGeo = k === 'blood' ? new THREE.ConeGeometry(0.20, 1.05, 5) : null;
  const bsRingGeo = k === 'blood' ? new THREE.TorusGeometry(0.76, 0.032, 6, 24) : null;
  const bsStoneMat = k === 'blood' ? new THREE.MeshLambertMaterial({ color: 0x2a2426 }) : null;
  if (k === 'blood') {
    track(bsBaseGeo, bsStoneMat); track(bsStepGeo, null); track(bsMainGeo, null); track(bsSideGeo, null); track(bsRingGeo, null);
  }
  function createBloodstone3D(x, z, r = 2.6) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const cryMat = new THREE.MeshStandardMaterial({
      color: 0x7c141a, emissive: 0xd82428, emissiveIntensity: 0.95, roughness: 0.28, metalness: 0.25
    });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a45, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
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
    const orbRing = new THREE.Mesh(bsRingGeo, ringMat);
    orbRing.position.y = 1.25;
    orbRing.rotation.x = Math.PI * 0.38;
    g.add(orbRing);
    spinNodes.push(orbRing);

    g.userData = { cryMat, ringMat, pool, orbRing, active: true };
    group.add(g);
    return g;
  }

  const bfBaseGeo = k === 'bell' ? new THREE.BoxGeometry(2.3, 0.28, 2.3) : null;
  const bfPostGeo = k === 'bell' ? new THREE.CylinderGeometry(0.085, 0.105, 2.55, 7) : null;
  const bfBeamGeo = k === 'bell' ? new THREE.BoxGeometry(2.1, 0.16, 0.18) : null;
  const bfRoofGeo = k === 'bell' ? new THREE.ConeGeometry(1.95, 0.82, 4) : null;
  const bfBellGeo = k === 'bell' ? new THREE.CylinderGeometry(0.28, 0.56, 1.08, 14) : null;
  const bfCapGeo = k === 'bell' ? new THREE.SphereGeometry(0.29, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2) : null;
  const bfStoneMat = k === 'bell' ? new THREE.MeshLambertMaterial({ color: 0x4b4a46 }) : null;
  const bfWoodMat = k === 'bell' ? new THREE.MeshLambertMaterial({ color: 0x5c231a }) : null;
  const bfTileMat = k === 'bell' ? new THREE.MeshLambertMaterial({ color: 0x22262b }) : null;
  const bfBronzeMat = k === 'bell' ? new THREE.MeshStandardMaterial({ color: 0x9c824c, emissive: 0x3b2a0c, emissiveIntensity: 0.35, metalness: 0.72, roughness: 0.28 }) : null;
  if (k === 'bell') {
    track(bfBaseGeo, bfStoneMat); track(bfPostGeo, bfWoodMat); track(bfBeamGeo, null);
    track(bfRoofGeo, bfTileMat); track(bfBellGeo, bfBronzeMat); track(bfCapGeo, null);
  }
  function createBelfry3D(x, z, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const base = new THREE.Mesh(bfBaseGeo, bfStoneMat); base.position.y = 0.14; g.add(base);
    [[-0.86, -0.86], [0.86, -0.86], [-0.86, 0.86], [0.86, 0.86]].forEach(([px, pz]) => {
      const pt = new THREE.Mesh(bfPostGeo, bfWoodMat); pt.position.set(px, 1.48, pz); g.add(pt);
    });
    const bm = new THREE.Mesh(bfBeamGeo, bfWoodMat); bm.position.y = 2.66; g.add(bm);
    const roof = new THREE.Mesh(bfRoofGeo, bfTileMat); roof.position.y = 3.16; roof.rotation.y = Math.PI / 4; g.add(roof);

    const pivot = new THREE.Group();
    pivot.position.y = 2.62;
    const bell = new THREE.Mesh(bfBellGeo, bfBronzeMat); bell.position.y = -0.92; pivot.add(bell);
    const cap = new THREE.Mesh(bfCapGeo, bfBronzeMat); cap.position.y = -0.38; pivot.add(cap);
    pivot.userData = { swing: 0.06, phase: rng() * 6.28 };
    g.add(pivot);
    bellPivots.push(pivot);

    g.userData = { pivot, nextAmb: 1.5 + rng() * 3.0 };
    group.add(g);
    return g;
  }

  if (k === 'none') {
    const postGeo = new THREE.CylinderGeometry(0.085, 0.11, 2.35, 6);
    const beamGeo = new THREE.BoxGeometry(2.1, 0.12, 0.14);
    const roofGeo = new THREE.BoxGeometry(2.3, 0.08, 1.45);
    const crateGeo = new THREE.BoxGeometry(0.65, 0.52, 0.65);
    const charMat = new THREE.MeshLambertMaterial({ color: 0x261f1b });
    const awningMat = new THREE.MeshLambertMaterial({ color: 0x5c4738, side: THREE.DoubleSide });
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x3f3126 });
    track(postGeo, charMat); track(beamGeo, null); track(roofGeo, awningMat); track(crateGeo, crateMat);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.35, d = 7.8 + rng() * 3.8;
      const st = new THREE.Group();
      st.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      st.rotation.y = -a + (rng() - 0.5) * 0.4;
      [[-0.9, -0.55], [0.9, -0.55], [-0.9, 0.55], [0.9, 0.55]].forEach(([px, pz]) => {
        const p = new THREE.Mesh(postGeo, charMat); p.position.set(px, 1.15, pz); st.add(p);
      });
      const bm = new THREE.Mesh(beamGeo, charMat); bm.position.set(0, 2.25, 0); st.add(bm);
      const rf = new THREE.Mesh(roofGeo, awningMat); rf.position.set(0, 2.35, 0); rf.rotation.x = 0.22; rf.rotation.z = (rng() - 0.5) * 0.18; st.add(rf);
      const cr = new THREE.Mesh(crateGeo, crateMat); cr.position.set(0.45, 0.26, 0.2); cr.rotation.y = rng(); st.add(cr);
      group.add(st);
      if (i % 2 === 0) addStoneLantern(group, Math.cos(a + 0.26) * (d - 1.2), Math.sin(a + 0.26) * (d - 1.2), 0xffa652, 0.85);
    }
    addParticles(130, 0xff9252, 0.14, 0.78, 'rise');
    addParticles(100, 0xc9bfb0, 0.12, 0.52, 'drift');
  } else if (k === 'bamboo') {
    const stalkGeo = new THREE.CylinderGeometry(0.055, 0.08, 5.2, 7); stalkGeo.translate(0, 2.6, 0);
    const nodeGeo = new THREE.TorusGeometry(0.072, 0.014, 5, 10); nodeGeo.rotateX(Math.PI / 2);
    const bladeGeo = new THREE.BoxGeometry(0.09, 0.012, 0.68); bladeGeo.translate(0, 0, 0.34);
    const stalkMat = new THREE.MeshLambertMaterial({ color: 0x3f735b });
    const nodeMat = new THREE.MeshLambertMaterial({ color: 0x264a3a });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x4c8a6b });
    track(stalkGeo, stalkMat); track(nodeGeo, nodeMat); track(bladeGeo, leafMat);
    for (let c = 0; c < 6; c++) {
      const ang = (c / 6) * Math.PI * 2 + 0.25, d = 6.6 + rng() * 4.8, cx = Math.cos(ang) * d, cz = Math.sin(ang) * d;
      for (let j = 0; j < 4; j++) {
        const pv = new THREE.Group();
        pv.position.set(cx + (rng() - 0.5) * 1.5, 0, cz + (rng() - 0.5) * 1.5);
        pv.add(new THREE.Mesh(stalkGeo, stalkMat));
        for (let h = 1.0; h <= 4.4; h += 1.1) {
          const nd = new THREE.Mesh(nodeGeo, nodeMat); nd.position.y = h; pv.add(nd);
        }
        for (let b = 0; b < 5; b++) {
          const lf = new THREE.Mesh(bladeGeo, leafMat);
          lf.position.y = 3.1 + b * 0.42;
          lf.rotation.set(-0.28 + (rng() - 0.5) * 0.2, b * 1.25 + rng() * 0.6, (rng() - 0.5) * 0.3);
          pv.add(lf);
        }
        pv.userData.phase = rng() * 6.28;
        group.add(pv);
        swayNodes.push(pv);
      }
    }
    addParticles(125, 0x7ee0b4, 0.15, 0.74, 'fall');
  } else if (k === 'rubble') {
    const colGeo = new THREE.CylinderGeometry(0.32, 0.42, 2.2, 7);
    const slabGeo = new THREE.BoxGeometry(1.5, 0.28, 0.9);
    const tileGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.95, 6, 1, false, 0, Math.PI);
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x5c574d });
    const darkStoneMat = new THREE.MeshLambertMaterial({ color: 0x3d3b37 });
    const tileMat = new THREE.MeshLambertMaterial({ color: 0x2d3036, side: THREE.DoubleSide });
    track(colGeo, stoneMat); track(slabGeo, darkStoneMat); track(tileGeo, tileMat);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2, d = 6.2 + rng() * 5.2;
      const g = new THREE.Group(); g.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); g.rotation.y = rng() * 6.28;
      const c = new THREE.Mesh(colGeo, stoneMat); c.position.y = 0.85; c.scale.y = 0.55 + rng() * 0.65; c.rotation.z = (rng() - 0.5) * 0.45; g.add(c);
      const s = new THREE.Mesh(slabGeo, darkStoneMat); s.position.set(0.65, 0.14, 0.35); s.rotation.set(0.15, rng(), -0.18); g.add(s);
      for (let t = 0; t < 3; t++) {
        const tl = new THREE.Mesh(tileGeo, tileMat);
        tl.position.set(-0.4 + t * 0.35, 0.18 + t * 0.08, -0.3 + rng() * 0.5);
        tl.rotation.set(Math.PI / 2 + (rng() - 0.5) * 0.4, rng() * 3, 0);
        g.add(tl);
      }
      group.add(g);
    }
    addParticles(130, 0xd8ccb8, 0.13, 0.58, 'drift');
  } else if (k === 'blood') {
    if (stageNo === 13) {
      const colGeo = new THREE.CylinderGeometry(0.24, 0.28, 4.8, 8);
      const capGeo = new THREE.BoxGeometry(0.76, 0.26, 0.76);
      const beamGeo = new THREE.BoxGeometry(0.22, 0.26, 5.4);
      const brazierGeo = new THREE.CylinderGeometry(0.32, 0.18, 0.34, 8);
      const lacqMat = new THREE.MeshLambertMaterial({ color: 0x5c1414 });
      const darkMat = new THREE.MeshLambertMaterial({ color: 0x241819 });
      const emberMat = new THREE.MeshStandardMaterial({ color: 0xff4c38, emissive: 0xff3b28, emissiveIntensity: 1.4 });
      track(colGeo, lacqMat); track(capGeo, darkMat); track(beamGeo, null); track(brazierGeo, emberMat);
      for (const side of [-1, 1]) {
        for (let i = -2; i <= 2; i++) {
          const px = side * 9.8, pz = i * 5.2;
          const p = new THREE.Group(); p.position.set(px, 0, pz);
          const cl = new THREE.Mesh(colGeo, lacqMat); cl.position.y = 2.4; p.add(cl);
          const cp = new THREE.Mesh(capGeo, darkMat); cp.position.y = 4.78; p.add(cp);
          const bs = new THREE.Mesh(capGeo, darkMat); bs.position.y = 0.13; p.add(bs);
          if (i < 2) {
            const bm = new THREE.Mesh(beamGeo, darkMat); bm.position.set(0, 4.55, 2.6); p.add(bm);
          }
          const br = new THREE.Mesh(brazierGeo, emberMat); br.position.set(-side * 0.65, 3.25, 0); p.add(br);
          group.add(p);
        }
      }
      addParticles(150, 0xff4a3a, 0.16, 0.82, 'rise');
      addParticles(90, 0x8f1a24, 0.22, 0.45, 'drift');
    } else {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        addStoneLantern(group, Math.cos(a) * 10.2, Math.sin(a) * 10.2, 0xff4538, 1.05);
      }
      addParticles(130, 0xff5842, 0.15, 0.78, 'rise');
    }
  } else if (k === 'snow') {
    const pillarGeo = new THREE.CylinderGeometry(0.28, 0.38, 2.4, 6);
    const snowCapGeo = new THREE.SphereGeometry(0.42, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x82919c });
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xeef5fa });
    track(pillarGeo, pillarMat); track(snowCapGeo, snowMat);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng() * 0.35, d = 4.2 + rng() * 7.8;
      const { geo, mat } = makeShaderPool(2.8 + rng() * 1.1, 0x7b8c98, 0xcad6df, 0xffffff, 1); track(geo, mat); shaderMats.push(mat);
      const p = new THREE.Mesh(geo, mat); p.position.set(Math.cos(a) * d, 0.04, Math.sin(a) * d); p.renderOrder = 1; group.add(p);
      if (i < 5) {
        const gx = Math.cos(a) * (d + 2.2), gz = Math.sin(a) * (d + 2.2);
        const st = new THREE.Mesh(pillarGeo, pillarMat); st.position.set(gx, 1.15, gz); group.add(st);
        const cap = new THREE.Mesh(snowCapGeo, snowMat); cap.position.set(gx, 2.32, gz); group.add(cap);
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      addStoneLantern(group, Math.cos(a) * 9.6, Math.sin(a) * 9.6, 0xbce6ff, 1.0);
    }
    addParticles(200, 0xf2f8ff, 0.17, 0.88, 'fall');
    addParticles(90, 0xc8e4f8, 0.12, 0.58, 'drift');
  } else if (k === 'root') {
    const rootMat = new THREE.MeshLambertMaterial({ color: 0x36281c });
    const mossMat = new THREE.MeshLambertMaterial({ color: 0x3b4f34 });
    const stumpGeo = new THREE.CylinderGeometry(0.45, 0.78, 1.35, 7);
    const branchGeo = new THREE.CylinderGeometry(0.08, 0.22, 2.6, 6);
    track(stumpGeo, rootMat); track(branchGeo, mossMat);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng() * 0.25, d = 5.0 + rng() * 6.5;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.8, -0.1, 0),
        new THREE.Vector3(-0.6, 0.45 + rng() * 0.3, 0.3),
        new THREE.Vector3(0.6, 0.3 + rng() * 0.25, -0.25),
        new THREE.Vector3(1.9, -0.1, 0.12)
      ]);
      const rGeo = new THREE.TubeGeometry(curve, 16, 0.15, 6, false); track(rGeo, null);
      const m = new THREE.Mesh(rGeo, rootMat); m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); m.rotation.y = rng() * Math.PI; group.add(m);
      if (i % 2 === 0) {
        const sx = Math.cos(a) * (d + 1.5), sz = Math.sin(a) * (d + 1.5);
        const st = new THREE.Mesh(stumpGeo, rootMat); st.position.set(sx, 0.65, sz); group.add(st);
        const br = new THREE.Mesh(branchGeo, rootMat); br.position.set(sx + 0.35, 1.9, sz); br.rotation.set(0.35, a, -0.45); group.add(br);
      }
    }
    addParticles(130, 0xcfa968, 0.15, 0.72, 'fall');
    addParticles(80, 0x8fd694, 0.12, 0.55, 'drift');
  } else if (k === 'bell') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.35;
      addStoneLantern(group, Math.cos(a) * 10.6, Math.sin(a) * 10.6, 0xffd27a, 1.0);
    }
    addParticles(120, 0xf6db9c, 0.15, 0.72, 'rise');
  } else if (k === 'water') {
    const rcfg = opts.riverCfg || {};
    const centerFn = rcfg.centerFn || ((u) => 5.5 * Math.sin(u * 0.085) + 2.0 * Math.sin(u * 0.021 + 1.3));
    const widthFn = rcfg.widthFn || ((u) => 2.1 + 0.7 * Math.sin(u * 0.13 + 0.6));
    const angle = Number(rcfg.angle || 0);
    const offset = Number(rcfg.offset || 0);
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const toWorld = (lx, lz) => [lx * cosA - lz * sinA, lx * sinA + lz * cosA];

    if (stageNo === 14) {
      const pileGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.9, 6);
      const plankGeo = new THREE.BoxGeometry(1.85, 0.1, 0.42);
      const rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
      const woodMat = new THREE.MeshLambertMaterial({ color: 0x382c26 });
      const rockMat = new THREE.MeshLambertMaterial({ color: 0x222630 });
      track(pileGeo, woodMat); track(plankGeo, null); track(rockGeo, rockMat);
      for (let i = 0; i < 10; i++) {
        const lx = -14 + i * 3.1;
        const side = i % 2 === 0 ? 1 : -1;
        const lz = centerFn(lx) + offset + side * (widthFn(lx) + 0.95);
        const [wx, wz] = toWorld(lx, lz);
        const pile = new THREE.Mesh(pileGeo, woodMat); pile.position.set(wx, 0.8, wz); group.add(pile);
        if (i % 3 === 0) {
          const pl = new THREE.Mesh(plankGeo, woodMat); pl.position.set(wx, 0.25, wz); pl.rotation.y = angle + (rng() - 0.5) * 0.3; group.add(pl);
          addStoneLantern(group, wx + side * 0.8, wz + side * 0.8, 0x8ee8ff, 0.9);
        } else {
          const rk = new THREE.Mesh(rockGeo, rockMat); rk.position.set(wx, 0.22, wz); rk.scale.set(1.2, 0.65, 1.0); group.add(rk);
        }
      }
      addParticles(140, 0x99d8ff, 0.16, 0.78, 'rise');
      addParticles(90, 0xa892e8, 0.14, 0.55, 'drift');
    } else {
      const stakeGeo = new THREE.CylinderGeometry(0.06, 0.12, 1.65, 5);
      const boneMat = new THREE.MeshLambertMaterial({ color: 0xd8cdb6 });
      track(stakeGeo, boneMat);
      for (let i = 0; i < 10; i++) {
        const lx = -13 + i * 2.9;
        const side = i % 2 === 0 ? 1 : -1;
        const lz = centerFn(lx) + offset + side * (widthFn(lx) + 0.85);
        const [wx, wz] = toWorld(lx, lz);
        if (i % 2 === 0) {
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 1.6, -side * 0.55),
            new THREE.Vector3(0, 2.55, -side * 1.45)
          ]);
          const ribGeo = new THREE.TubeGeometry(curve, 12, 0.13, 6, false); track(ribGeo, null);
          const rib = new THREE.Mesh(ribGeo, boneMat);
          rib.position.set(wx, 0, wz);
          rib.rotation.y = angle + (rng() - 0.5) * 0.25;
          group.add(rib);
        } else {
          const st = new THREE.Mesh(stakeGeo, boneMat);
          st.position.set(wx, 0.72, wz);
          st.rotation.set((rng() - 0.5) * 0.32, rng() * 6.28, (rng() - 0.5) * 0.32);
          group.add(st);
        }
      }
      addParticles(130, 0x9ef0e0, 0.16, 0.75, 'rise');
    }
  } else if (k === 'fog' || k === 'moon' || k === 'wall') {
    const colA = k === 'moon' ? 0x3b1014 : k === 'wall' ? 0x261d19 : 0x1a2624;
    const colB = k === 'moon' ? 0x7d1f24 : k === 'wall' ? 0x574233 : 0x45635e;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, { geo, mat } = makeShaderPool(5.4, colA, colB, 0xd9ceb8, 2); track(geo, mat); shaderMats.push(mat);
      const m = new THREE.Mesh(geo, mat); m.position.set(Math.cos(a) * 6.8, 0.14 + i * 0.02, Math.sin(a) * 6.8); m.renderOrder = 2; group.add(m);
    }
    if (k === 'wall') {
      const poleGeo = new THREE.CylinderGeometry(0.06, 0.085, 3.8, 6);
      const flagGeo = new THREE.PlaneGeometry(0.95, 1.55);
      const brazGeo = new THREE.CylinderGeometry(0.45, 0.28, 0.55, 8);
      const coalGeo = new THREE.SphereGeometry(0.36, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const poleMat = new THREE.MeshLambertMaterial({ color: 0x362a24 });
      const flagMat = new THREE.MeshLambertMaterial({ color: stageNo === 15 ? 0x261d24 : 0x8f1d18, side: THREE.DoubleSide });
      const ironMat = new THREE.MeshLambertMaterial({ color: 0x252428 });
      const coalMat = new THREE.MeshStandardMaterial({ color: 0xff6230, emissive: 0xff4818, emissiveIntensity: 1.5 });
      track(poleGeo, poleMat); track(flagGeo, flagMat); track(brazGeo, ironMat); track(coalGeo, coalMat);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.5, r = 9.4;
        const pv = new THREE.Group(); pv.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        const pl = new THREE.Mesh(poleGeo, poleMat); pl.position.y = 1.9; pv.add(pl);
        const fl = new THREE.Mesh(flagGeo, flagMat); fl.position.set(0.5, 2.95, 0); pv.add(fl);
        pv.userData.phase = i * 1.4; group.add(pv); swayNodes.push(pv);
        const br = new THREE.Group(); br.position.set(Math.cos(a + 0.25) * (r - 1.4), 0, Math.sin(a + 0.25) * (r - 1.4));
        const bm = new THREE.Mesh(brazGeo, ironMat); bm.position.y = 0.55; br.add(bm);
        const cm = new THREE.Mesh(coalGeo, coalMat); cm.position.y = 0.8; br.add(cm);
        group.add(br);
      }
      addParticles(150, 0xff8048, 0.15, 0.82, 'rise');
    } else if (k === 'moon') {
      const steleGeo = new THREE.BoxGeometry(0.75, 2.8, 0.32);
      const baseGeo = new THREE.BoxGeometry(1.25, 0.35, 0.85);
      const sealGeo = new THREE.TorusGeometry(0.55, 0.035, 6, 24);
      const stoneMat = new THREE.MeshLambertMaterial({ color: 0x312628 });
      const sealMat = new THREE.MeshBasicMaterial({ color: stageNo === 16 ? 0xffd27a : 0xff4c42, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false });
      track(steleGeo, stoneMat); track(baseGeo, null); track(sealGeo, sealMat);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3, r = 9.2 + (i % 2) * 1.4;
        const g = new THREE.Group(); g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); g.rotation.y = -a + Math.PI / 2;
        const bs = new THREE.Mesh(baseGeo, stoneMat); bs.position.y = 0.17; g.add(bs);
        const st = new THREE.Mesh(steleGeo, stoneMat); st.position.y = 1.65; g.add(st);
        const sl = new THREE.Mesh(sealGeo, sealMat); sl.position.y = 3.45; g.add(sl); spinNodes.push(sl);
        group.add(g);
      }
      addParticles(140, stageNo === 16 ? 0xffcf78 : 0xff6252, 0.16, 0.78, 'rise');
    } else {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4, r = 8.4 + (i % 2) * 2.0;
        addStoneLantern(group, Math.cos(a) * r, Math.sin(a) * r, 0x7ef2d4, i % 2 === 0 ? 1.25 : 0.92);
      }
      addParticles(140, 0x84f2d6, 0.15, 0.76, 'drift');
    }
  }

  scene.add(group);
  let elapsed = 0;

  return {
    group,
    kind: k,
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
            node.userData.cryMat.emissiveIntensity = wantActive ? 0.95 : 0.06;
            node.userData.cryMat.color.setHex(wantActive ? 0x7c141a : 0x262226);
            node.userData.ringMat.opacity = wantActive ? 0.75 : 0.12;
            node.userData.pool.visible = wantActive;
          }
        }
      }
      dynamicPatchMap.forEach((node, key) => {
        if (!seen.has(key)) node.visible = false;
      });
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
