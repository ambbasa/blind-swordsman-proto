/**
 * v2/js/modules/inkTerrain3d.js
 * 심안(SIMAN) v0.56 — 전 스테이지(1~16장) 테마별 3D 입체 기물 + 고유 파티클/셰이더 환경 엔진
 * - 대나무 버섯형 원뿔 제거 → 마디 링 + 칼날형 댓잎 가지 + 흩날리는 청죽 댓잎 파티클
 * - 모든 맵(none·rubble·bamboo·moon·fog·snow·root·bell·blood·water·wall)에 고유 3D 사물과 대기 특수효과 부여
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

function seeded(seed) {
  let s = (seed | 0) || 1337;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeParticleField(rng, count, colorHex, size, opacity, mode) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rng() - 0.5) * 28;
    pos[i * 3 + 1] = rng() * 8.5 + 0.3;
    pos[i * 3 + 2] = (rng() - 0.5) * 28;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: colorHex, size, transparent: true, opacity, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.userData.mode = mode; // 'fall' | 'rise' | 'drift'
  return { pts, geo, mat };
}

export function createInkTerrain3D(scene, kind, opts = {}) {
  if (!scene) return null;
  const k = kind || 'none';
  const group = new THREE.Group();
  group.name = 'ink-terrain-3d-' + k;
  const rng = seeded((opts.stageNo || 1) * 97 + k.length * 31);
  const disposables = [], shaderMats = [], swayNodes = [], particles = [], pulseRings = [];
  const track = (g, m) => { if (g) disposables.push(g); if (m) disposables.push(m); };
  const addParticles = (cnt, col, sz, op, mode) => {
    const p = makeParticleField(rng, cnt, col, sz, op, mode);
    track(p.geo, p.mat);
    group.add(p.pts);
    particles.push(p.pts);
  };

  if (k === 'none') {
    // 1장 잿빛 장터: 불탄 목재 기둥·무너진 좌판 + 피어오르는 잿가루·불씨
    const postGeo = new THREE.CylinderGeometry(0.11, 0.14, 2.2, 6);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x26201c });
    const plankGeo = new THREE.BoxGeometry(1.5, 0.1, 0.45);
    const plankMat = new THREE.MeshLambertMaterial({ color: 0x3b3027 });
    track(postGeo, postMat); track(plankGeo, plankMat);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4, d = 7.4 + rng() * 3.8;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(Math.cos(a) * d, 0.9, Math.sin(a) * d);
      post.rotation.set((rng() - 0.5) * 0.25, rng() * 6.28, (rng() - 0.5) * 0.28);
      group.add(post);
      const pl = new THREE.Mesh(plankGeo, plankMat);
      pl.position.set(Math.cos(a) * d + 0.5, 0.08, Math.sin(a) * d + 0.3);
      pl.rotation.y = rng() * 6.28;
      group.add(pl);
    }
    addParticles(110, 0xff9252, 0.13, 0.72, 'rise');
    addParticles(80, 0xc9bfb0, 0.11, 0.48, 'drift');
  } else if (k === 'bamboo') {
    // 3장 대숲: 버섯형 원뿔 완전 제거! 마디 링 + 칼날형 댓잎 가지 + 흩날리는 청죽 댓잎 파티클
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
    addParticles(120, 0x7ee0b4, 0.15, 0.72, 'fall');
  } else if (k === 'blood') {
    const rockGeo = new THREE.ConeGeometry(0.42, 1.65, 5);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5c1116, emissive: 0x8f181c, emissiveIntensity: 0.58, roughness: 0.42 });
    track(rockGeo, rockMat);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.35, d = 5.8 + rng() * 5.2, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const c = new THREE.Mesh(rockGeo, rockMat); c.position.set(x, 0.78, z); c.rotation.set((rng() - 0.5) * 0.25, rng() * 6.28, (rng() - 0.5) * 0.25); group.add(c);
      const { geo, mat } = makeShaderPool(2.5 + rng() * 0.7, 0x2a060a, 0x6b0f16, 0xff5a45, 0); track(geo, mat); shaderMats.push(mat);
      const pool = new THREE.Mesh(geo, mat); pool.position.set(x, 0.045, z); pool.renderOrder = 1; group.add(pool);
    }
    addParticles(110, 0xff5842, 0.14, 0.75, 'rise');
  } else if (k === 'snow') {
    const pillarGeo = new THREE.CylinderGeometry(0.28, 0.36, 1.8, 6);
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0xaab7c2 });
    track(pillarGeo, pillarMat);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng() * 0.4, d = 3.5 + rng() * 8.5;
      const { geo, mat } = makeShaderPool(2.8 + rng() * 1.1, 0x7b8c98, 0xcad6df, 0xffffff, 1); track(geo, mat); shaderMats.push(mat);
      const p = new THREE.Mesh(geo, mat); p.position.set(Math.cos(a) * d, 0.04, Math.sin(a) * d); p.renderOrder = 1; group.add(p);
      if (i < 4) {
        const st = new THREE.Mesh(pillarGeo, pillarMat); st.position.set(Math.cos(a) * (d + 1.8), 0.85, Math.sin(a) * (d + 1.8)); group.add(st);
      }
    }
    addParticles(180, 0xeef6ff, 0.16, 0.85, 'fall');
  } else if (k === 'root') {
    const rootMat = new THREE.MeshLambertMaterial({ color: 0x36291e });
    const stumpGeo = new THREE.CylinderGeometry(0.45, 0.72, 1.1, 7);
    track(stumpGeo, rootMat);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng() * 0.3, d = 4.4 + rng() * 6.8;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.5, -0.1, 0), new THREE.Vector3(-0.5, 0.36 + rng() * 0.25, 0.25), new THREE.Vector3(0.5, 0.24 + rng() * 0.2, -0.22), new THREE.Vector3(1.6, -0.1, 0.1)]);
      const rGeo = new THREE.TubeGeometry(curve, 14, 0.14, 6, false); track(rGeo, null);
      const m = new THREE.Mesh(rGeo, rootMat); m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); m.rotation.y = rng() * Math.PI; group.add(m);
      if (i % 2 === 0) { const st = new THREE.Mesh(stumpGeo, rootMat); st.position.set(Math.cos(a) * (d + 1.4), 0.5, Math.sin(a) * (d + 1.4)); group.add(st); }
    }
    addParticles(100, 0xc6a972, 0.14, 0.65, 'drift');
  } else if (k === 'rubble') {
    const stoneGeo = new THREE.DodecahedronGeometry(0.45, 0), stoneMat = new THREE.MeshLambertMaterial({ color: 0x5c554a });
    const tileGeo = new THREE.BoxGeometry(0.95, 0.12, 0.55), tileMat = new THREE.MeshLambertMaterial({ color: 0x3b393c });
    track(stoneGeo, stoneMat); track(tileGeo, tileMat);
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2, d = 3.8 + rng() * 8.2, m = new THREE.Mesh(i % 3 === 0 ? tileGeo : stoneGeo, i % 3 === 0 ? tileMat : stoneMat);
      m.position.set(Math.cos(a) * d, 0.18, Math.sin(a) * d); m.scale.set(0.8 + rng() * 1.1, 0.4 + rng() * 0.5, 0.8 + rng() * 0.9); m.rotation.set(rng() * 1.4, rng() * 6.28, rng() * 1.4); group.add(m);
    }
    addParticles(100, 0xd4c8b4, 0.12, 0.55, 'drift');
  } else if (k === 'bell') {
    const bellGeo = new THREE.CylinderGeometry(0.32, 0.54, 1.0, 12), bellMat = new THREE.MeshStandardMaterial({ color: 0x8a7244, metalness: 0.65, roughness: 0.32 });
    const beamGeo = new THREE.BoxGeometry(1.7, 0.16, 0.16), postGeo = new THREE.CylinderGeometry(0.09, 0.11, 2.2, 6), woodMat = new THREE.MeshLambertMaterial({ color: 0x4a261c });
    const ringGeo = new THREE.RingGeometry(0.9, 1.12, 24); ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xe8c47a, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    track(bellGeo, bellMat); track(beamGeo, woodMat); track(postGeo, null); track(ringGeo, ringMat);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5, x = Math.cos(a) * 7.2, z = Math.sin(a) * 7.2;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -a;
      const b = new THREE.Mesh(bellGeo, bellMat); b.position.y = 1.05; g.add(b);
      const bm = new THREE.Mesh(beamGeo, woodMat); bm.position.y = 2.05; g.add(bm);
      [-0.7, 0.7].forEach((px) => { const pt = new THREE.Mesh(postGeo, woodMat); pt.position.set(px, 1.05, 0); g.add(pt); });
      const rg = new THREE.Mesh(ringGeo, ringMat); rg.position.y = 0.06; rg.userData.phase = i * 2.1; g.add(rg); pulseRings.push(rg);
      group.add(g);
    }
    addParticles(90, 0xf2d698, 0.14, 0.65, 'rise');
  } else if (k === 'water') {
    // 10장·14장 뼈의 강: 강물 셰이더(inkWater3d)와 함께 강변 뼈 말뚝 + 수면 혼불 파티클
    const stakeGeo = new THREE.CylinderGeometry(0.06, 0.11, 1.5, 5), stakeMat = new THREE.MeshLambertMaterial({ color: 0xcfc4ad });
    track(stakeGeo, stakeMat);
    for (let i = 0; i < 10; i++) {
      const x = -12 + i * 2.7, z = (5.5 * Math.sin(x * 0.085) + 2.0 * Math.sin(x * 0.021 + 1.3)) + (i % 2 ? 2.9 : -2.9);
      const st = new THREE.Mesh(stakeGeo, stakeMat); st.position.set(x, 0.65, z); st.rotation.set((rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3); group.add(st);
    }
    addParticles(110, 0x9ef0e0, 0.15, 0.7, 'rise');
  } else if (k === 'fog' || k === 'moon' || k === 'wall') {
    const colA = k === 'moon' ? 0x3b1014 : k === 'wall' ? 0x261d19 : 0x1a2624;
    const colB = k === 'moon' ? 0x7d1f24 : k === 'wall' ? 0x574233 : 0x45635e;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, { geo, mat } = makeShaderPool(5.2, colA, colB, 0xd9ceb8, 2); track(geo, mat); shaderMats.push(mat);
      const m = new THREE.Mesh(geo, mat); m.position.set(Math.cos(a) * 6.8, 0.14 + i * 0.02, Math.sin(a) * 6.8); m.renderOrder = 2; group.add(m);
    }
    if (k === 'wall') {
      const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), flagGeo = new THREE.PlaneGeometry(0.85, 1.35);
      const poleMat = new THREE.MeshLambertMaterial({ color: 0x362a24 }), flagMat = new THREE.MeshLambertMaterial({ color: 0x8f1d18, side: THREE.DoubleSide });
      track(poleGeo, poleMat); track(flagGeo, flagMat);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.7, pv = new THREE.Group();
        pv.position.set(Math.cos(a) * 9.5, 0, Math.sin(a) * 9.5);
        const pl = new THREE.Mesh(poleGeo, poleMat); pl.position.y = 1.7; pv.add(pl);
        const fl = new THREE.Mesh(flagGeo, flagMat); fl.position.set(0.45, 2.7, 0); pv.add(fl);
        pv.userData.phase = i * 1.5; group.add(pv); swayNodes.push(pv);
      }
      addParticles(120, 0xff8048, 0.14, 0.78, 'rise');
    } else if (k === 'moon') {
      addParticles(120, 0xff6252, 0.15, 0.75, 'rise');
    } else {
      addParticles(110, 0x84f2d6, 0.14, 0.72, 'drift');
    }
  }

  scene.add(group);
  let elapsed = 0;

  return {
    group,
    kind: k,
    update(dt) {
      const d = Math.min(0.05, Number(dt || 0.016));
      elapsed += d;
      for (let i = 0; i < shaderMats.length; i++) shaderMats[i].uniforms.uTime.value = elapsed;
      for (let i = 0; i < swayNodes.length; i++) swayNodes[i].rotation.z = Math.sin(elapsed * 1.6 + swayNodes[i].userData.phase) * 0.055;
      for (let i = 0; i < pulseRings.length; i++) {
        const rg = pulseRings[i], p = (elapsed * 0.65 + rg.userData.phase) % 1;
        rg.scale.setScalar(1 + p * 2.6);
      }
      for (let pi = 0; pi < particles.length; pi++) {
        const pt = particles[pi], mode = pt.userData.mode, arr = pt.geometry.attributes.position.array;
        for (let i = 0; i < arr.length; i += 3) {
          if (mode === 'fall') {
            arr[i] += d * 0.75; arr[i + 1] -= d * 1.65;
            if (arr[i + 1] < 0.1) { arr[i + 1] = 8.6; arr[i] = ((arr[i] + 14) % 28) - 14; }
          } else if (mode === 'rise') {
            arr[i] += Math.sin(elapsed + i) * d * 0.25; arr[i + 1] += d * 0.95;
            if (arr[i + 1] > 8.6) arr[i + 1] = 0.2;
          } else {
            arr[i] += d * 0.55; arr[i + 1] += Math.sin(elapsed * 1.4 + i) * d * 0.22;
            if (arr[i] > 14) arr[i] = -14;
          }
        }
        pt.geometry.attributes.position.needsUpdate = true;
      }
    },
    dispose() {
      scene.remove(group);
      for (let i = 0; i < disposables.length; i++) if (disposables[i] && disposables[i].dispose) disposables[i].dispose();
    },
  };
}
