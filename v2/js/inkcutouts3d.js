/* v2/js/inkcutouts3d.js — Papertrails 팝업/컷아웃 기법 기반 조선 3막(장터·성문·대나무 골) 3D 프롭 풀세트. */
import * as THREE from 'three';
import { createHanjiMaterial } from './inkhanji_mat.js';

export function makeStagePalette(act = 1) {
  if (act === 2) {
    return {
      stone: createHanjiMaterial({ color: 0x3b3d42, transTint: 0x6b7280, transStrength: 0.12 }),
      wood: createHanjiMaterial({ color: 0x2f241d, transTint: 0x92400e, transStrength: 0.16 }),
      roof: createHanjiMaterial({ color: 0x1e2024, transTint: 0x4b5563, transStrength: 0.1 }),
      banner: createHanjiMaterial({ color: 0x991b1b, transTint: 0xef4444, transStrength: 0.42 }),
      paperGlow: createHanjiMaterial({ color: 0xfef3c7, emissive: 0xf59e0b, emissiveIntensity: 1.4, transTint: 0xfbbf24, transStrength: 0.55 })
    };
  }
  if (act === 3) {
    return {
      stone: createHanjiMaterial({ color: 0x2d3331, transTint: 0x34d399, transStrength: 0.14 }),
      wood: createHanjiMaterial({ color: 0x26211a, transTint: 0x78350f, transStrength: 0.15 }),
      bamboo: createHanjiMaterial({ color: 0x1f3a2e, transTint: 0x5eead4, transStrength: 0.34 }),
      leaf: createHanjiMaterial({ color: 0x244636, transTint: 0x6ee7b7, transStrength: 0.48 }),
      ribbon: createHanjiMaterial({ color: 0xb91c1c, transTint: 0xfca5a5, transStrength: 0.45 }),
      paperGlow: createHanjiMaterial({ color: 0xd1fae5, emissive: 0x34d399, emissiveIntensity: 1.25, transTint: 0x5eead4, transStrength: 0.5 })
    };
  }
  return {
    stone: createHanjiMaterial({ color: 0x3a3733, transTint: 0xa8a29e, transStrength: 0.14 }),
    wood: createHanjiMaterial({ color: 0x34281f, transTint: 0xb45309, transStrength: 0.18 }),
    roof: createHanjiMaterial({ color: 0x232220, transTint: 0x78716c, transStrength: 0.12 }),
    thatch: createHanjiMaterial({ color: 0x6e624d, transTint: 0xd6c7a9, transStrength: 0.28 }),
    banner: createHanjiMaterial({ color: 0x1e3a5f, transTint: 0x60a5fa, transStrength: 0.36 }),
    paperGlow: createHanjiMaterial({ color: 0xfef3c7, emissive: 0xfbbf24, emissiveIntensity: 1.45, transTint: 0xfde68a, transStrength: 0.6 })
  };
}

function shadow(m) { m.castShadow = true; m.receiveShadow = true; return m; }

export function buildChogaHut(pal) {
  const g = new THREE.Group();
  const wall = shadow(new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.6), pal.stone)); wall.position.y = 0.9;
  const roof = shadow(new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.35, 4), pal.thatch || pal.roof)); roof.position.y = 2.35; roof.rotation.y = Math.PI * 0.25;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.15), pal.paperGlow); door.position.set(0, 0.68, 1.31);
  g.add(wall, roof, door); return g;
}

export function buildStoneLantern(pal) {
  const g = new THREE.Group();
  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.35, 6), pal.stone)); base.position.y = 0.175;
  const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.95, 6), pal.stone)); post.position.y = 0.82;
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), pal.paperGlow); core.position.y = 1.45;
  const cap = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.32, 6), pal.stone)); cap.position.y = 1.78;
  g.add(base, post, core, cap); return g;
}

export function buildSsariFence(pal) {
  const g = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    const stake = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.15, 5), pal.wood));
    stake.position.set(i * 0.38, 0.57, (i % 2) * 0.04); stake.rotation.z = (i % 2 === 0 ? 0.04 : -0.04); g.add(stake);
  }
  const rail = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.06), pal.wood)); rail.position.y = 0.72; g.add(rail);
  return g;
}

export function buildPalaceGate(pal) {
  const g = new THREE.Group();
  for (const sx of [-1.8, 1.8]) {
    const col = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 3.2, 8), pal.wood)); col.position.set(sx, 1.6, 0);
    const plinth = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), pal.stone)); plinth.position.set(sx, 0.3, 0);
    g.add(col, plinth);
  }
  const beam = shadow(new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.45, 0.65), pal.wood)); beam.position.y = 3.0;
  const roof = shadow(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.38, 1.6), pal.roof || pal.stone)); roof.position.y = 3.45;
  g.add(beam, roof); return g;
}

export function buildBambooGrove(pal) {
  const g = new THREE.Group();
  for (const [ox, oz, h] of [[-0.3, -0.2, 4.2], [0.25, 0.15, 4.8], [-0.05, 0.35, 3.6]]) {
    const stalk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 6), pal.bamboo || pal.wood));
    stalk.position.set(ox, h * 0.5, oz); stalk.rotation.z = ox * 0.08;
    const canopy = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.2, 5), pal.leaf || pal.bamboo));
    canopy.position.set(ox, h - 0.35, oz); g.add(stalk, canopy);
  }
  return g;
}

export function buildJangseung(pal) {
  const g = new THREE.Group();
  const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 2.3, 7), pal.wood)); body.position.y = 1.15;
  const hat = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.38, 7), pal.wood)); hat.position.y = 2.38;
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.08), pal.paperGlow); eyes.position.set(0, 1.82, 0.24);
  g.add(body, hat, eyes); return g;
}

export function buildSeonangdang(pal) {
  const g = new THREE.Group();
  let y = 0.2;
  for (const r of [0.85, 0.62, 0.4, 0.22]) {
    const rock = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), pal.stone));
    rock.scale.y = 0.58; rock.position.y = y; y += r * 0.55; g.add(rock);
  }
  const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 5), pal.wood)); pole.position.set(0.25, 1.1, 0);
  const rib = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.22), pal.ribbon || pal.banner); rib.position.set(0.55, 1.85, 0);
  g.add(pole, rib); return g;
}

export function buildBanner(pal) {
  const g = new THREE.Group();
  const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.8, 5), pal.wood)); pole.position.y = 1.4;
  const cloth = shadow(new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.45), pal.banner)); cloth.position.set(0.38, 1.95, 0);
  g.add(pole, cloth); return g;
}

export function buildCutoutProp(type, act = 1) {
  const pal = makeStagePalette(act);
  const map = { choga: buildChogaHut, lantern: buildStoneLantern, fence: buildSsariFence, gate: buildPalaceGate, bamboo: buildBambooGrove, jangseung: buildJangseung, seonangdang: buildSeonangdang, banner: buildBanner };
  return (map[type] || buildStoneLantern)(pal);
}
