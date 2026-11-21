/**
 * v2/js/modules/skillAssets3d.js
 * 심안(SIMAN) v0.61 — 설치된 스킬 에셋·셰이더·3D 지형지물 이식 라이브러리
 *
 * 이식 출처:
 *  1) lightning-energy-skill-vfx: Poly Haven CC0 1K 스캔 바닥 PBR (dry_ground_nor / arm / diff)
 *  2) 3d-cloth-material: 평직·능직 실 교차(interlacement) 노멀맵 절차 베이크
 *  3) 3d-paper-material: 찢긴 가장자리(deckle tear) + 한지 섬유질 + 주홍 부적 먹번짐 텍스처
 *  4) 3d-kasumidera-ultra-realism: 캠버 아치 목교(교각·난간·청동 기둥머리), 처마 서까래 범종각,
 *     금줄 한지 부적 줄, 자연 굴곡 고목(고목 골) 3D 모델 팩토리
 */
import * as THREE from 'three';

const ASSETS_BASE = new URL('../../assets/skills-pbr/', import.meta.url).href;

let _groundPbr = null;
let _paperGrain = null;
let _weaveNormal = null;
let _talismanTex = null;

/** 1) Poly Haven CC0 1K 스캔 바닥 PBR 세트 (lightning-energy-skill-vfx 이식) */
export function getSkillGroundPbr() {
  if (_groundPbr) return _groundPbr;
  const loader = new THREE.TextureLoader();
  const loadTile = (file, isSRGB) => {
    const t = loader.load(ASSETS_BASE + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(9, 9);
    t.anisotropy = 4;
    t.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.userData.shared = true;
    return t;
  };
  _groundPbr = {
    diff: loadTile('dry_ground_diff.jpg', true),
    normal: loadTile('dry_ground_nor.jpg', false),
    arm: loadTile('dry_ground_arm.jpg', false),
  };
  return _groundPbr;
}

/** 2) 스캔 종이 그레인 텍스처 (relight-painted-surfaces 이식) */
export function getPaperGrainTex() {
  if (_paperGrain) return _paperGrain;
  const t = new THREE.TextureLoader().load(ASSETS_BASE + 'paper-grain.png');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  t.colorSpace = THREE.NoColorSpace;
  t.userData.shared = true;
  _paperGrain = t;
  return _paperGrain;
}

/**
 * 지면 MeshStandardMaterial에 Poly Haven CC0 1K 스캔 노멀맵 + ARM 러프니스/AO를 입힌다.
 * 기존 스테이지별 수묵 페인팅 알베도(terrain-N.webp)는 100% 보존하면서,
 * 달빛·등불·심안 광원 아래에서 실제 갈라진 돌·흙의 입체 요철과 젖은 광택 대비를 살린다.
 */
export function enhanceGroundWithScannedPbr(groundMat, stageId) {
  if (!groundMat) return;
  const pbr = getSkillGroundPbr();
  const isStone = ![1, 3, 6, 7, 10, 14].includes(stageId);
  const scale = isStone ? 1.45 : 1.05;
  groundMat.normalMap = pbr.normal;
  groundMat.normalScale = new THREE.Vector2(scale, scale);
  groundMat.roughnessMap = pbr.arm;
  groundMat.roughness = isStone ? 0.90 : 0.96;
  groundMat.metalness = 0.04;
  /* bumpMap 대신 고해상도 1K 스캔 노멀맵 사용 (2x2 dFdx 블록 노이즈 제거 — lightning-energy-skill-vfx 규칙) */
  groundMat.bumpMap = null;
  groundMat.needsUpdate = true;
}

/** 3) 평직 직조 노멀맵 베이크 (3d-cloth-material 규칙: 노이즈 대신 실제 경사/위사 교차 높이→법선) */
export function getClothWeaveNormal() {
  if (_weaveNormal) return _weaveNormal;
  if (typeof document === 'undefined') return null;
  const N = 128;
  const h = new Float32Array(N * N);
  const threads = 16; /* 16올 타일 (짝수 배수로 시임 없음) */
  const cell = N / threads;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const gx = x / cell, gy = y / cell;
      const ix = Math.floor(gx), iy = Math.floor(gy);
      const fx = gx - ix - 0.5, fy = gy - iy - 0.5;
      const warpTop = ((ix + iy) & 1) === 0;
      const wProfile = Math.max(0, 1 - (fx * fx) / 0.21);
      const fProfile = Math.max(0, 1 - (fy * fy) / 0.21);
      /* 실 꼬임(spun yarn twist) 미세 추가 */
      const twist = 0.08 * Math.sin((warpTop ? gy : gx) * Math.PI * 4.0);
      const val = warpTop
        ? (0.45 + 0.55 * wProfile + twist) * (0.72 + 0.28 * Math.cos(fy * Math.PI))
        : (0.45 + 0.55 * fProfile + twist) * (0.72 + 0.28 * Math.cos(fx * Math.PI));
      h[y * N + x] = val;
    }
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  const strength = 2.6;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const hL = h[y * N + ((x - 1 + N) % N)];
      const hR = h[y * N + ((x + 1) % N)];
      const hD = h[((y - 1 + N) % N) * N + x];
      const hU = h[((y + 1) % N) * N + x];
      let nx = (hL - hR) * strength;
      let ny = (hD - hU) * strength;
      let nz = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const o = (y * N + x) * 4;
      img.data[o] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.NoColorSpace;
  tex.userData.shared = true;
  _weaveNormal = tex;
  return tex;
}

/** 4) 찢긴 가장자리 + 한지 섬유질 + 주홍 부적 먹번짐 텍스처 (3d-paper-material 이식) */
export function getHanjiTalismanTex() {
  if (_talismanTex) return _talismanTex;
  if (typeof document === 'undefined') return null;
  const W = 128, H = 256;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);

  /* 네 변의 독립적인 찢긴 선(deckle tearLine) */
  let s = 918273;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  g.beginPath();
  const padX = 12, padY = 12;
  g.moveTo(padX, padY);
  for (let x = padX; x <= W - padX; x += 6) g.lineTo(x, padY + (rnd() - 0.5) * 6);
  for (let y = padY; y <= H - padY; y += 8) g.lineTo(W - padX + (rnd() - 0.5) * 7, y);
  for (let x = W - padX; x >= padX; x -= 6) g.lineTo(x, H - padY + (rnd() - 0.5) * 9);
  for (let y = H - padY; y >= padY; y -= 8) g.lineTo(padX + (rnd() - 0.5) * 7, y);
  g.closePath();

  /* 한지 바탕(aged washi) + 가장자리 토스팅 */
  const bg = g.createRadialGradient(W * 0.5, H * 0.48, 12, W * 0.5, H * 0.5, H * 0.55);
  bg.addColorStop(0, '#f4e6be');
  bg.addColorStop(0.75, '#e2cb92');
  bg.addColorStop(1, '#b89458');
  g.fillStyle = bg;
  g.fill();

  /* 한지 닥나무 섬유 가닥 + 찢긴 가장자리 보풀(fray fibres) */
  g.save();
  g.strokeStyle = 'rgba(255,248,228,0.45)';
  g.lineWidth = 0.8;
  for (let i = 0; i < 110; i++) {
    const x = padX - 4 + rnd() * (W - padX * 2 + 8);
    const y = padY - 4 + rnd() * (H - padY * 2 + 8);
    const len = 6 + rnd() * 14, ang = rnd() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }
  g.restore();

  /* 주홍 부적 테두리 & 먹번짐 부적 획 (ink wicking halo + core) */
  g.save();
  g.strokeStyle = 'rgba(196, 36, 24, 0.35)';
  g.lineWidth = 7;
  g.strokeRect(22, 24, W - 44, H - 48);
  g.strokeStyle = '#b82218';
  g.lineWidth = 3;
  g.strokeRect(22, 24, W - 44, H - 48);
  /* 부적 중앙 기호 획 */
  g.lineCap = 'round'; g.lineJoin = 'round';
  const drawGlyph = (lw, col) => {
    g.strokeStyle = col; g.lineWidth = lw;
    g.beginPath();
    g.moveTo(W * 0.32, 54); g.lineTo(W * 0.68, 54);
    g.moveTo(W * 0.50, 42); g.lineTo(W * 0.50, 206);
    g.moveTo(W * 0.30, 96); g.quadraticCurveTo(W * 0.50, 82, W * 0.70, 98);
    g.moveTo(W * 0.34, 134); g.lineTo(W * 0.66, 126);
    g.lineTo(W * 0.36, 166); g.lineTo(W * 0.68, 162);
    g.moveTo(W * 0.36, 198); g.quadraticCurveTo(W * 0.50, 186, W * 0.64, 198);
    g.stroke();
  };
  drawGlyph(10, 'rgba(198, 42, 26, 0.28)');
  drawGlyph(4.5, '#a81e16');
  g.restore();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.shared = true;
  _talismanTex = tex;
  return tex;
}

/* ============================================================================
   5) 3D Kasumidera 스타일 동양 건축·자연 랜드마크 빌더
   ============================================================================ */

/**
 * 캠버 아치 목교 (3d-kasumidera-ultra-realism: 휜 상판·개별 판자·주홍 난간·청동 기둥머리·돌 교대)
 */
export function buildArchedBridge3D(opts = {}) {
  const length = opts.length || 7.6;
  const width = opts.width || 2.3;
  const archH = opts.archH || 0.92;
  const group = new THREE.Group();
  group.name = 'kasumidera-arched-bridge';

  const woodMat = new THREE.MeshStandardMaterial({ color: opts.woodHex || 0x5c3e26, roughness: 0.86, metalness: 0.04 });
  const lacquerMat = new THREE.MeshStandardMaterial({ color: opts.railHex || 0x9e2a20, roughness: 0.52, metalness: 0.12 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: opts.stoneHex || 0x5c5850, roughness: 0.92, metalness: 0.02 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xb8964c, roughness: 0.38, metalness: 0.65 });
  const disposables = [woodMat, lacquerMat, stoneMat, bronzeMat];

  /* 양쪽 돌 교대(Stone Seats) */
  const seatGeo = new THREE.BoxGeometry(1.15, 0.55, width + 0.45);
  disposables.push(seatGeo);
  for (const side of [-1, 1]) {
    const seat = new THREE.Mesh(seatGeo, stoneMat);
    seat.position.set(side * (length * 0.47), 0.18, 0);
    seat.receiveShadow = true;
    group.add(seat);
  }

  /* 캠버 곡선을 따라 깔리는 개별 편백 나무 판자(15장) */
  const plankCount = 15;
  const plankGeo = new THREE.BoxGeometry(length / plankCount * 0.92, 0.11, width);
  disposables.push(plankGeo);
  for (let i = 0; i < plankCount; i++) {
    const u = (i + 0.5) / plankCount;
    const x = (u - 0.5) * length;
    const s = Math.sin(u * Math.PI);
    const y = 0.24 + s * archH;
    const slope = Math.cos(u * Math.PI) * (archH * Math.PI / length);
    const p = new THREE.Mesh(plankGeo, woodMat);
    p.position.set(x, y, 0);
    p.rotation.z = Math.atan(slope);
    p.castShadow = true; p.receiveShadow = true;
    group.add(p);
  }

  /* 양쪽 휜 목재 아치 들보(Arch Ribs) + 주홍 난간(Vermilion Rails) + 청동 기둥머리 */
  const postGeo = new THREE.BoxGeometry(0.13, 0.96, 0.13);
  const finialGeo = new THREE.SphereGeometry(0.095, 8, 6);
  disposables.push(postGeo, finialGeo);
  const postCount = 5;
  for (const zSide of [-1, 1]) {
    const z = zSide * (width * 0.48);
    const ribPts = [];
    const railPts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const x = (u - 0.5) * length;
      const y = 0.20 + Math.sin(u * Math.PI) * archH;
      ribPts.push(new THREE.Vector3(x, y - 0.12, z * 0.88));
      railPts.push(new THREE.Vector3(x, y + 0.86, z));
    }
    const ribGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPts), 16, 0.11, 6, false);
    const railGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 16, 0.065, 6, false);
    disposables.push(ribGeo, railGeo);
    group.add(new THREE.Mesh(ribGeo, woodMat));
    group.add(new THREE.Mesh(railGeo, lacquerMat));

    for (let j = 0; j < postCount; j++) {
      const u = j / (postCount - 1);
      const x = (u - 0.5) * length * 0.92;
      const y = 0.24 + Math.sin(u * Math.PI) * archH;
      const post = new THREE.Mesh(postGeo, lacquerMat);
      post.position.set(x, y + 0.44, z);
      group.add(post);
      const fin = new THREE.Mesh(finialGeo, bronzeMat);
      fin.position.set(x, y + 0.98, z);
      group.add(fin);
    }
  }

  group.userData.disposables = disposables;
  return group;
}

/**
 * 금줄과 찢긴 한지 부적이 바람에 나부끼는 3D 성소 입구 (3d-paper-material + 3d-kasumidera-ultra-realism)
 */
export function buildTalismanGateLine3D(opts = {}) {
  const span = opts.span || 4.4;
  const height = opts.height || 3.1;
  const group = new THREE.Group();
  group.name = 'hanji-talisman-line';

  const woodMat = new THREE.MeshStandardMaterial({ color: opts.woodHex || 0x45241c, roughness: 0.84, metalness: 0.06 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xb8965c, roughness: 0.92, metalness: 0.02 });
  const talismanMat = new THREE.MeshStandardMaterial({
    map: getHanjiTalismanTex(),
    transparent: true, alphaTest: 0.15, side: THREE.DoubleSide,
    roughness: 0.88, metalness: 0.0,
    emissive: new THREE.Color(opts.glowHex || 0xff9a44),
    emissiveIntensity: 0.42,
  });
  const disposables = [woodMat, ropeMat, talismanMat];

  /* 양쪽 나무 기둥 + 상단 횡목 */
  const postGeo = new THREE.CylinderGeometry(0.11, 0.14, height, 8);
  const capGeo = new THREE.BoxGeometry(span + 0.9, 0.16, 0.22);
  disposables.push(postGeo, capGeo);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, woodMat);
    p.position.set(side * span * 0.5, height * 0.5, 0);
    p.castShadow = true;
    group.add(p);
  }
  const beam = new THREE.Mesh(capGeo, woodMat);
  beam.position.set(0, height - 0.18, 0);
  group.add(beam);

  /* 처진 금줄 곡선 */
  const rPts = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    rPts.push(new THREE.Vector3((u - 0.5) * span, height - 0.34 - Math.sin(u * Math.PI) * 0.36, 0));
  }
  const ropeGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rPts), 14, 0.045, 6, false);
  disposables.push(ropeGeo);
  group.add(new THREE.Mesh(ropeGeo, ropeMat));

  /* 매달린 찢긴 한지 부적 5장 (바람 흔들림 피벗) */
  const tGeo = new THREE.PlaneGeometry(0.32, 0.62);
  tGeo.translate(0, -0.31, 0);
  disposables.push(tGeo);
  const swayList = [];
  for (let i = 0; i < 5; i++) {
    const u = (i + 1) / 6;
    const x = (u - 0.5) * span * 0.88;
    const y = height - 0.35 - Math.sin(u * Math.PI) * 0.34;
    const m = new THREE.Mesh(tGeo, talismanMat);
    m.position.set(x, y, 0.02);
    m.userData.phase = i * 1.15;
    group.add(m);
    swayList.push(m);
  }

  group.userData.swayTalismans = swayList;
  group.userData.disposables = disposables;
  return group;
}

/**
 * 자연 굴곡 고목 (TubeGeometry 굽은 줄기 + 뒤틀린 잔가지 — 7장 고목 골 막대기 나무 대체)
 */
export function buildGnarledDeadTree3D(rng, scale = 1.0, woodHex = 0x3b2c22) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: woodHex, roughness: 0.94, metalness: 0.02 });
  const disposables = [mat];

  const bendX = (rng() - 0.5) * 0.9;
  const bendZ = (rng() - 0.5) * 0.9;
  const h = 3.4 * scale;
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bendX * 0.35, h * 0.35, bendZ * 0.35),
    new THREE.Vector3(bendX * 0.85, h * 0.72, bendZ * 0.6),
    new THREE.Vector3(bendX * 1.15, h, bendZ * 0.95),
  ]);
  const trunkGeo = new THREE.TubeGeometry(trunkCurve, 10, 0.16 * scale, 7, false);
  disposables.push(trunkGeo);
  const trunk = new THREE.Mesh(trunkGeo, mat);
  trunk.castShadow = true;
  group.add(trunk);

  /* 뒤틀리며 뻗는 4개 잔가지 */
  for (let b = 0; b < 4; b++) {
    const t0 = 0.45 + b * 0.15;
    const origin = trunkCurve.getPoint(Math.min(0.95, t0));
    const a = b * 1.7 + rng() * 0.6;
    const len = (1.15 + rng() * 0.75) * scale;
    const mid = origin.clone().add(new THREE.Vector3(Math.cos(a) * len * 0.55, len * 0.38, Math.sin(a) * len * 0.55));
    const tip = mid.clone().add(new THREE.Vector3(Math.cos(a + 0.4) * len * 0.55, len * 0.18 + (rng() - 0.3) * 0.35, Math.sin(a + 0.4) * len * 0.55));
    const bGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([origin, mid, tip]), 6, 0.058 * scale, 5, false);
    disposables.push(bGeo);
    group.add(new THREE.Mesh(bGeo, mat));
  }

  group.userData.disposables = disposables;
  return group;
}

/**
 * 6) 조각 한지 석등 (3d-kasumidera-ultra-realism + 3d-paper-material — 육각 기단·역광 한지 화사창·처마 갓)
 */
export function buildCarvedLantern3D(opts = {}) {
  const scale = opts.scale || 1.0;
  const group = new THREE.Group();
  group.name = 'kasumidera-carved-lantern';

  const stoneMat = new THREE.MeshStandardMaterial({ color: opts.stoneHex || 0x5c5850, roughness: 0.92, metalness: 0.04 });
  const roofMat = new THREE.MeshStandardMaterial({ color: opts.roofHex || 0x3b3a38, roughness: 0.86, metalness: 0.08 });
  const glowHex = opts.glowHex || 0xffb85c;
  const paperMat = new THREE.MeshStandardMaterial({
    map: getPaperGrainTex(),
    color: 0xf6e8c8,
    emissive: new THREE.Color(glowHex),
    emissiveIntensity: 1.45,
    roughness: 0.88,
  });
  paperMat.userData.cardSkip = true;
  const disposables = [stoneMat, roofMat, paperMat];

  const baseGeo = new THREE.CylinderGeometry(0.42, 0.56, 0.34, 6);
  const shaftGeo = new THREE.CylinderGeometry(0.16, 0.21, 1.05, 6);
  const trayGeo = new THREE.CylinderGeometry(0.40, 0.22, 0.18, 6);
  const boxGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.44, 6);
  const ribGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.48, 5);
  const roofGeo = new THREE.ConeGeometry(0.62, 0.44, 6);
  const finialGeo = new THREE.SphereGeometry(0.09, 8, 6);
  disposables.push(baseGeo, shaftGeo, trayGeo, boxGeo, ribGeo, roofGeo, finialGeo);

  const base = new THREE.Mesh(baseGeo, stoneMat); base.position.y = 0.17; base.castShadow = true; group.add(base);
  const shaft = new THREE.Mesh(shaftGeo, stoneMat); shaft.position.y = 0.86; shaft.castShadow = true; group.add(shaft);
  const tray = new THREE.Mesh(trayGeo, stoneMat); tray.position.y = 1.45; group.add(tray);
  const fireBox = new THREE.Mesh(boxGeo, paperMat); fireBox.position.y = 1.74; group.add(fireBox);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rib = new THREE.Mesh(ribGeo, stoneMat);
    rib.position.set(Math.cos(a) * 0.25, 1.74, Math.sin(a) * 0.25);
    group.add(rib);
  }
  const roof = new THREE.Mesh(roofGeo, roofMat); roof.position.y = 2.18; roof.castShadow = true; group.add(roof);
  const fin = new THREE.Mesh(finialGeo, roofMat); fin.position.y = 2.44; group.add(fin);

  group.scale.setScalar(scale);
  group.userData.disposables = disposables;
  return group;
}

/**
 * 7) 곡선 처마 신사/홍살 산문 (3d-kasumidera-ultra-realism — 주춧돌·기둥·이중 횡목·곡선 상인방·금빛 현판)
 */
export function buildKasumideraTorii3D(opts = {}) {
  const span = opts.span || 4.8;
  const height = opts.height || 4.2;
  const group = new THREE.Group();
  group.name = 'kasumidera-sacred-gate';

  const woodMat = new THREE.MeshStandardMaterial({ color: opts.woodHex || 0x8f241c, roughness: 0.72, metalness: 0.08 });
  const capMat = new THREE.MeshStandardMaterial({ color: opts.capHex || 0x222024, roughness: 0.68, metalness: 0.16 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x454340, roughness: 0.94, metalness: 0.02 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4ad52, roughness: 0.36, metalness: 0.72 });
  const disposables = [woodMat, capMat, stoneMat, goldMat];

  const footGeo = new THREE.CylinderGeometry(0.24, 0.32, 0.48, 8);
  const colGeo = new THREE.CylinderGeometry(0.15, 0.19, height, 10);
  const subBeamGeo = new THREE.BoxGeometry(span + 1.4, 0.20, 0.22);
  const plaqueGeo = new THREE.BoxGeometry(0.54, 0.72, 0.12);
  disposables.push(footGeo, colGeo, subBeamGeo, plaqueGeo);

  for (const side of [-1, 1]) {
    const px = side * (span * 0.44);
    const ft = new THREE.Mesh(footGeo, stoneMat); ft.position.set(px, 0.24, 0); group.add(ft);
    const col = new THREE.Mesh(colGeo, woodMat);
    col.position.set(px, height * 0.5, 0);
    col.rotation.z = side * 0.045;
    col.castShadow = true;
    group.add(col);
  }
  const sub = new THREE.Mesh(subBeamGeo, woodMat);
  sub.position.set(0, height - 0.82, 0);
  group.add(sub);

  /* 곡선으로 끝단이 들린 상인방(Kasagi lintel) */
  const lPts = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    const x = (u - 0.5) * (span + 2.2);
    const curl = Math.pow(Math.abs(u - 0.5) * 2.0, 2.2) * 0.38;
    lPts.push(new THREE.Vector3(x, height + curl, 0));
  }
  const lintelGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lPts), 16, 0.16, 6, false);
  const capGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lPts.map((p) => new THREE.Vector3(p.x, p.y + 0.14, 0))), 16, 0.12, 6, false);
  disposables.push(lintelGeo, capGeo);
  group.add(new THREE.Mesh(lintelGeo, woodMat));
  group.add(new THREE.Mesh(capGeo, capMat));

  const plaque = new THREE.Mesh(plaqueGeo, capMat);
  plaque.position.set(0, height - 0.42, 0.06);
  group.add(plaque);
  const crestGeo = new THREE.TorusGeometry(0.14, 0.025, 6, 16);
  disposables.push(crestGeo);
  const crest = new THREE.Mesh(crestGeo, goldMat);
  crest.position.set(0, height - 0.42, 0.13);
  group.add(crest);

  group.userData.disposables = disposables;
  return group;
}

/**
 * 8) 파쇄 현무암 바위 군락 (lightning-energy-skill-vfx 다면 절단 현무암 바위)
 */
export function buildFracturedBasaltRocks3D(rng, opts = {}) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: opts.rockHex || 0x353338,
    roughness: 0.88,
    metalness: 0.08,
    flatShading: true,
  });
  const disposables = [mat];
  const count = opts.count || 3;
  for (let i = 0; i < count; i++) {
    const r = (i === 0 ? 0.92 : 0.48 + rng() * 0.32) * (opts.scale || 1.0);
    const g = new THREE.DodecahedronGeometry(r, 0);
    const p = g.attributes.position;
    for (let vi = 0; vi < p.count; vi++) {
      const vx = p.getX(vi), vy = p.getY(vi), vz = p.getZ(vi);
      const k = 0.78 + 0.36 * Math.abs(Math.sin(vx * 5.1 + vy * 7.3 + vz * 3.9 + i * 2.1));
      p.setXYZ(vi, vx * k, vy * k * 0.72, vz * k);
    }
    g.computeVertexNormals();
    disposables.push(g);
    const m = new THREE.Mesh(g, mat);
    const a = i * 2.1 + rng() * 0.6;
    const dist = i === 0 ? 0 : 0.85 + rng() * 0.45;
    m.position.set(Math.cos(a) * dist, r * 0.36, Math.sin(a) * dist);
    m.rotation.set((rng() - 0.5) * 0.4, rng() * 6.28, (rng() - 0.5) * 0.4);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  group.userData.disposables = disposables;
  return group;
}
