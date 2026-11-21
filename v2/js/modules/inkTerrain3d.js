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
  if (uMode < 0.5) col += uRimCol * smoothstep(0.62, 0.82, n2) * (0.7 + 0.3 * sin(uTime * 3.2 + r * 5.0)) * 0.85;
  else if (uMode < 1.5) col += uRimCol * pow(smoothstep(0.68, 0.92, noise(vWp.xz * 4.5 + uTime * 0.35)), 3.0) * 0.9;
  else edge *= smoothstep(0.2, 0.78, n1) * 0.65;
  gl_FragColor = vec4(col, clamp(edge * 0.88, 0.0, 0.92));
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
function seeded(seed) { let s = (seed | 0) || 1337; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function createInkTerrain3D(scene, kind, opts = {}) {
  if (!scene || !kind || kind === 'none' || kind === 'water') return null;
  const group = new THREE.Group(); group.name = 'ink-terrain-3d-' + kind;
  const rng = seeded((opts.stageNo || 1) * 97 + kind.length * 31);
  const disposables = [], shaderMats = [], swayNodes = []; let snowPoints = null;
  const track = (g, m) => { if (g) disposables.push(g); if (m) disposables.push(m); };

  if (kind === 'blood') {
    const rockGeo = new THREE.ConeGeometry(0.42, 1.55, 5);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5c1116, emissive: 0x8f181c, emissiveIntensity: 0.55, roughness: 0.45, metalness: 0.15 });
    track(rockGeo, rockMat);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.35, d = 5.8 + rng() * 5.2, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const c = new THREE.Mesh(rockGeo, rockMat); c.position.set(x, 0.72, z); c.rotation.set((rng() - 0.5) * 0.25, rng() * 6.28, (rng() - 0.5) * 0.25); group.add(c);
      const { geo, mat } = makeShaderPool(2.4 + rng() * 0.7, 0x2a060a, 0x6b0f16, 0xff5a45, 0); track(geo, mat); shaderMats.push(mat);
      const pool = new THREE.Mesh(geo, mat); pool.position.set(x, 0.045, z); pool.renderOrder = 1; group.add(pool);
    }
  } else if (kind === 'snow') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng() * 0.4, d = 3.5 + rng() * 8.5;
      const { geo, mat } = makeShaderPool(2.8 + rng() * 1.1, 0x7b8c98, 0xcad6df, 0xffffff, 1); track(geo, mat); shaderMats.push(mat);
      const p = new THREE.Mesh(geo, mat); p.position.set(Math.cos(a) * d, 0.04, Math.sin(a) * d); p.renderOrder = 1; group.add(p);
    }
    const count = 160, pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { pos[i * 3] = (rng() - 0.5) * 28; pos[i * 3 + 1] = rng() * 9 + 0.5; pos[i * 3 + 2] = (rng() - 0.5) * 28; }
    const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sMat = new THREE.PointsMaterial({ color: 0xeaf4ff, size: 0.15, transparent: true, opacity: 0.8 }); track(sGeo, sMat);
    snowPoints = new THREE.Points(sGeo, sMat); group.add(snowPoints);
  } else if (kind === 'bamboo') {
    const stalkGeo = new THREE.CylinderGeometry(0.065, 0.09, 4.6, 6); stalkGeo.translate(0, 2.3, 0);
    const stalkMat = new THREE.MeshLambertMaterial({ color: 0x3b6b57 }), leafGeo = new THREE.ConeGeometry(0.55, 0.9, 5), leafMat = new THREE.MeshLambertMaterial({ color: 0x274d3e });
    track(stalkGeo, stalkMat); track(leafGeo, leafMat);
    for (let c = 0; c < 6; c++) {
      const ang = (c / 6) * Math.PI * 2 + 0.2, d = 6.2 + rng() * 5.0, cx = Math.cos(ang) * d, cz = Math.sin(ang) * d;
      for (let j = 0; j < 4; j++) {
        const pv = new THREE.Group(); pv.position.set(cx + (rng() - 0.5) * 1.4, 0, cz + (rng() - 0.5) * 1.4);
        const s = new THREE.Mesh(stalkGeo, stalkMat), lf = new THREE.Mesh(leafGeo, leafMat); lf.position.y = 4.3;
        pv.add(s); pv.add(lf); pv.userData.phase = rng() * 6.28; group.add(pv); swayNodes.push(pv);
      }
    }
  } else if (kind === 'root') {
    const rootMat = new THREE.MeshLambertMaterial({ color: 0x34281e }); track(null, rootMat);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng() * 0.3, d = 4.2 + rng() * 6.8;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.4, -0.1, 0), new THREE.Vector3(-0.5, 0.32 + rng() * 0.25, 0.25), new THREE.Vector3(0.5, 0.22 + rng() * 0.2, -0.22), new THREE.Vector3(1.5, -0.1, 0.1)]);
      const rGeo = new THREE.TubeGeometry(curve, 14, 0.14, 6, false); track(rGeo, null);
      const m = new THREE.Mesh(rGeo, rootMat); m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); m.rotation.y = rng() * Math.PI; group.add(m);
    }
  } else if (kind === 'rubble') {
    const stoneGeo = new THREE.DodecahedronGeometry(0.45, 0), stoneMat = new THREE.MeshLambertMaterial({ color: 0x5c554a }); track(stoneGeo, stoneMat);
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2, d = 3.6 + rng() * 8.2, m = new THREE.Mesh(stoneGeo, stoneMat);
      m.position.set(Math.cos(a) * d, 0.18, Math.sin(a) * d); m.scale.set(0.8 + rng() * 1.1, 0.35 + rng() * 0.45, 0.8 + rng() * 0.9); m.rotation.set(rng() * 2, rng() * 6.28, rng() * 2); group.add(m);
    }
  } else if (kind === 'bell') {
    const bellGeo = new THREE.CylinderGeometry(0.32, 0.52, 0.95, 12), bellMat = new THREE.MeshStandardMaterial({ color: 0x7a653c, metalness: 0.65, roughness: 0.35 }); track(bellGeo, bellMat);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5, m = new THREE.Mesh(bellGeo, bellMat); m.position.set(Math.cos(a) * 7.2, 0.55, Math.sin(a) * 7.2); group.add(m); }
  } else if (kind === 'fog' || kind === 'moon' || kind === 'wall') {
    const colA = kind === 'moon' ? 0x3b1014 : kind === 'wall' ? 0x261d19 : 0x1a2624, colB = kind === 'moon' ? 0x7d1f24 : kind === 'wall' ? 0x574233 : 0x45635e;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, { geo, mat } = makeShaderPool(5.2, colA, colB, 0xd9ceb8, 2); track(geo, mat); shaderMats.push(mat);
      const m = new THREE.Mesh(geo, mat); m.position.set(Math.cos(a) * 6.8, 0.14 + i * 0.02, Math.sin(a) * 6.8); m.renderOrder = 2; group.add(m);
    }
  }
  scene.add(group); let elapsed = 0;
  return {
    group, kind,
    update(dt) {
      const d = Math.min(0.05, Number(dt || 0.016)); elapsed += d;
      for (let i = 0; i < shaderMats.length; i++) shaderMats[i].uniforms.uTime.value = elapsed;
      for (let i = 0; i < swayNodes.length; i++) swayNodes[i].rotation.z = Math.sin(elapsed * 1.6 + swayNodes[i].userData.phase) * 0.055;
      if (snowPoints) {
        const arr = snowPoints.geometry.attributes.position.array;
        for (let i = 0; i < arr.length; i += 3) { arr[i] += d * 0.7; arr[i + 1] -= d * 1.9; if (arr[i + 1] < 0.1) { arr[i + 1] = 9.0; arr[i] = ((arr[i] + 14) % 28) - 14; } }
        snowPoints.geometry.attributes.position.needsUpdate = true;
      }
    },
    dispose() { scene.remove(group); for (let i = 0; i < disposables.length; i++) if (disposables[i] && disposables[i].dispose) disposables[i].dispose(); }
  };
}
