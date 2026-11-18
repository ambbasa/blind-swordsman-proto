/* v2/js/inkentities3d.js — Papertrails 한지 컷아웃·스탠디 스타일 기반 심안(SIMAN) 전 캐릭터·귀물·보스·혼령·아이템 3D 에셋 팩토리. */
import * as THREE from 'three';
import { createHanjiMaterial } from './inkhanji_mat.js';

function sh(m) { m.castShadow = true; m.receiveShadow = true; return m; }

export function buildHero3D({ skinColor = 0x16161a, accentColor = 0x5eead4 } = {}) {
  const g = new THREE.Group();
  const robe = sh(new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.35, 8), createHanjiMaterial({ color: skinColor, transTint: accentColor, transStrength: 0.25 })));
  robe.position.y = 0.68;
  const head = sh(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), createHanjiMaterial({ color: 0x262422 })));
  head.position.y = 1.44;
  const kasa = sh(new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.22, 10), createHanjiMaterial({ color: 0x4b4232, transTint: 0xd6c7a9, transStrength: 0.35 })));
  kasa.position.y = 1.56;
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.06, 1.15),
    createHanjiMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 1.35, transTint: accentColor, transStrength: 0.6 })
  );
  blade.position.set(0.32, 0.92, 0.38);
  blade.rotation.y = -0.25;
  g.add(robe, head, kasa, blade);
  return g;
}

export function buildZombie3D(variant = 'zombie') {
  const g = new THREE.Group();
  const cfg = {
    zombie: { scale: 1.0, col: 0x2c302c, rim: 0x6ee7b7 },
    brute:  { scale: 1.28, col: 0x2b2121, rim: 0xef4444 },
    stone:  { scale: 1.45, col: 0x3b3d42, rim: 0x94a3b8 },
    elite:  { scale: 1.18, col: 0x241f18, rim: 0xe8c04a }
  }[variant] || { scale: 1.0, col: 0x2c302c, rim: 0x6ee7b7 };

  const body = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 1.18, 7), createHanjiMaterial({ color: cfg.col, transTint: cfg.rim, transStrength: 0.3 })));
  body.position.y = 0.59;
  const head = sh(new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), createHanjiMaterial({ color: cfg.col })));
  head.position.y = 1.3;
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.06), createHanjiMaterial({ color: cfg.rim, emissive: cfg.rim, emissiveIntensity: 1.4 }));
  eyes.position.set(0, 1.32, 0.17);
  g.add(body, head, eyes);
  if (variant === 'elite') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 20), createHanjiMaterial({ color: 0xe8c04a, emissive: 0xe8c04a, emissiveIntensity: 1.3 }));
    halo.rotation.x = Math.PI * 0.5; halo.position.y = 0.08; g.add(halo);
  }
  g.scale.setScalar(cfg.scale);
  return g;
}

export function buildBoss3D({ headType = 'horns', weaponType = 'sword', accent = 0xef4444 } = {}) {
  const g = new THREE.Group();
  const cloak = sh(new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.2, 9), createHanjiMaterial({ color: 0x161417, transTint: accent, transStrength: 0.35 })));
  cloak.position.y = 1.1;
  const head = sh(new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), createHanjiMaterial({ color: 0x221e22 })));
  head.position.y = 2.35;
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.08), createHanjiMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.7 }));
  eyes.position.set(0, 2.38, 0.28);
  g.add(cloak, head, eyes);

  const ornamentMat = createHanjiMaterial({ color: 0x3b2f26, emissive: accent, emissiveIntensity: 0.5, transTint: accent, transStrength: 0.45 });
  if (headType === 'horns') {
    for (const sx of [-0.22, 0.22]) {
      const horn = sh(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 5), ornamentMat));
      horn.position.set(sx, 2.75, 0); horn.rotation.z = sx > 0 ? -0.35 : 0.35; g.add(horn);
    }
  } else if (headType === 'kasa') {
    const hat = sh(new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.32, 10), ornamentMat)); hat.position.y = 2.62; g.add(hat);
  } else if (headType === 'crown') {
    const crown = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.28, 6), createHanjiMaterial({ color: 0xeab308, emissive: 0xeab308, emissiveIntensity: 0.8 })));
    crown.position.y = 2.72; g.add(crown);
  } else if (headType === 'veil') {
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), createHanjiMaterial({ color: 0x2d1f2d, transparent: true, opacity: 0.85, transTint: accent, transStrength: 0.6 }));
    veil.position.set(0, 2.05, 0.32); g.add(veil);
  }

  const wLen = weaponType === 'spear' ? 2.4 : weaponType === 'staff' ? 2.1 : 1.7;
  const weapon = sh(new THREE.Mesh(new THREE.BoxGeometry(0.08, wLen, 0.08), createHanjiMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.35 })));
  weapon.position.set(0.72, 1.45, 0.25); weapon.rotation.z = -0.22;
  g.add(weapon);
  return g;
}

export function buildSpirit3D(color = 0x5eead4) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), createHanjiMaterial({ color, emissive: color, emissiveIntensity: 1.55, transTint: color, transStrength: 0.7 }));
  core.position.y = 1.05;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.025, 6, 24), createHanjiMaterial({ color, emissive: color, emissiveIntensity: 1.2 }));
  ring.rotation.x = Math.PI * 0.5; ring.position.y = 1.05;
  g.add(core, ring);
  return g;
}

export function buildItem3D(kind = 'coin') {
  const palette = {
    coin: 0xeab308, heal: 0x34d399, 'dash-plus': 0x5eead4, 'one-bell': 0xfde047,
    'elem-fire': 0xf97316, 'elem-ice': 0x38bdf8, 'elem-poison': 0xa855f7, 'xp-orb': 0x60a5fa
  };
  const col = palette[kind] || 0xeab308;
  const mat = createHanjiMaterial({ color: col, emissive: col, emissiveIntensity: 1.35, transTint: col, transStrength: 0.6 });
  if (kind === 'coin') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 12), mat);
    m.rotation.x = Math.PI * 0.5; m.position.y = 0.45; return m;
  }
  if (kind === 'one-bell') {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 8), mat);
    m.position.y = 0.5; return m;
  }
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat);
  m.position.y = 0.48;
  return m;
}
