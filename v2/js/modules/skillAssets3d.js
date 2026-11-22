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
   5) 16-평면 절단 현무암 바위 팩토리 (lightning-energy-skill-vfx/assets/storm-energy.mjs 이식)
   ============================================================================ */
const _fracturedRockCache = new Map();

/**
 * 정육면체를 ~16개의 무작위 절단 평면으로 깎아 날카로운 단면과 평면 절리를 가진
 * 실제 파쇄 바위 BufferGeometry를 생성한다 (storm-energy.mjs fracturedRock 직이식).
 */
export function createFracturedRockGeo(seed = 91, squashY = 0.76) {
  const key = `${seed}_${squashY.toFixed(2)}`;
  if (_fracturedRockCache.has(key)) return _fracturedRockCache.get(key).clone();
  let s = (seed >>> 0) || 1;
  const r2 = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const V3 = THREE.Vector3;
  const UP = new V3(0, 1, 0), X = new V3(1, 0, 0), _a = new V3(), _b = new V3();
  const C = [-1, 1];
  let faces = [];
  for (let ax = 0; ax < 3; ax++) for (const sg of C) {
    const n = new V3(); n.setComponent(ax, sg);
    const u = new V3(), w = new V3(); u.setComponent((ax + 1) % 3, 1); w.crossVectors(n, u);
    faces.push({
      n,
      v: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
        n.clone().add(u.clone().multiplyScalar(a)).add(w.clone().multiplyScalar(b))
      ),
    });
  }
  const cuts = 14 + Math.floor(r2() * 6);
  for (let k = 0; k < cuts; k++) {
    const n = new V3(r2() * 2 - 1, (r2() * 2 - 1) * 0.8, r2() * 2 - 1).normalize();
    const d = 0.52 + r2() * 0.38;
    const out = [], cap = [];
    for (const F of faces) {
      const res = [];
      for (let i = 0; i < F.v.length; i++) {
        const a = F.v[i], b = F.v[(i + 1) % F.v.length], da = a.dot(n) - d, db = b.dot(n) - d;
        if (da <= 0) res.push(a);
        if ((da <= 0) !== (db <= 0)) {
          const p = a.clone().lerp(b, da / (da - db));
          res.push(p); cap.push(p);
        }
      }
      if (res.length >= 3) out.push({ n: F.n, v: res });
    }
    if (cap.length >= 3) {
      const c = cap.reduce((acc, p) => acc.add(p), new V3()).divideScalar(cap.length);
      const u = new V3().crossVectors(n, Math.abs(n.y) < 0.9 ? UP : X).normalize();
      const w = new V3().crossVectors(n, u);
      const pts = [];
      for (const p of cap) if (!pts.some((q) => q.distanceToSquared(p) < 1e-8)) pts.push(p);
      pts.sort((p, q) => Math.atan2(_a.subVectors(p, c).dot(w), _a.dot(u)) - Math.atan2(_b.subVectors(q, c).dot(w), _b.dot(u)));
      if (pts.length >= 3) out.push({ n, v: pts });
    }
    faces = out;
  }
  const pos = [], nrm = [];
  for (const F of faces) {
    for (let i = 1; i < F.v.length - 1; i++) {
      for (const p of [F.v[0], F.v[i], F.v[i + 1]]) {
        pos.push(p.x, p.y * squashY, p.z);
        nrm.push(F.n.x, F.n.y / squashY, F.n.z);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nv = new THREE.Float32BufferAttribute(nrm, 3);
  for (let i = 0; i < nv.count; i++) {
    _a.fromBufferAttribute(nv, i).normalize();
    nv.setXYZ(i, _a.x, _a.y, _a.z);
  }
  g.setAttribute('normal', nv);
  g.computeBoundingSphere();
  _fracturedRockCache.set(key, g);
  return g.clone();
}

/* ============================================================================
   6) 3D Kasumidera 스타일 동양 건축·자연 랜드마크 빌더
   ============================================================================ */

/**
 * 캠버 아치 목교 (3d-kasumidera-ultra-realism/bridge.jpg: 휜 상판·이중 주홍 난간·청동 보주(Giboshi) 기둥머리·돌 교대)
 */
export function buildArchedBridge3D(opts = {}) {
  const length = opts.length || 7.6;
  const width = opts.width || 2.3;
  const archH = opts.archH || 0.92;
  const group = new THREE.Group();
  group.name = 'kasumidera-arched-bridge';

  const woodMat = new THREE.MeshStandardMaterial({ color: opts.woodHex || 0x5c3e26, roughness: 0.86, metalness: 0.04 });
  const lacquerMat = new THREE.MeshStandardMaterial({ color: opts.railHex || 0x9e2a20, roughness: 0.50, metalness: 0.14 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: opts.stoneHex || 0x5c5850, roughness: 0.92, metalness: 0.02 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xc29e4a, roughness: 0.34, metalness: 0.74 });
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

  /* Kasumidera bridge.jpg 청동 보주(Giboshi) LatheGeometry 기둥머리 */
  const giboshiPts = [
    new THREE.Vector2(0.085, 0.0),
    new THREE.Vector2(0.105, 0.04),
    new THREE.Vector2(0.082, 0.08),
    new THREE.Vector2(0.115, 0.14),
    new THREE.Vector2(0.095, 0.21),
    new THREE.Vector2(0.038, 0.27),
    new THREE.Vector2(0.0, 0.32),
  ];
  const postGeo = new THREE.BoxGeometry(0.13, 0.96, 0.13);
  const finialGeo = new THREE.LatheGeometry(giboshiPts, 10);
  disposables.push(postGeo, finialGeo);
  const postCount = 5;
  for (const zSide of [-1, 1]) {
    const z = zSide * (width * 0.48);
    const ribPts = [];
    const railTopPts = [];
    const railMidPts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const x = (u - 0.5) * length;
      const y = 0.20 + Math.sin(u * Math.PI) * archH;
      ribPts.push(new THREE.Vector3(x, y - 0.14, z * 0.86));
      railTopPts.push(new THREE.Vector3(x, y + 0.86, z));
      railMidPts.push(new THREE.Vector3(x, y + 0.48, z));
    }
    const ribGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPts), 16, 0.12, 6, false);
    const railTopGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railTopPts), 16, 0.068, 6, false);
    const railMidGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railMidPts), 16, 0.045, 6, false);
    disposables.push(ribGeo, railTopGeo, railMidGeo);
    group.add(new THREE.Mesh(ribGeo, woodMat));
    group.add(new THREE.Mesh(railTopGeo, lacquerMat));
    group.add(new THREE.Mesh(railMidGeo, lacquerMat));

    for (let j = 0; j < postCount; j++) {
      const u = j / (postCount - 1);
      const x = (u - 0.5) * length * 0.92;
      const y = 0.24 + Math.sin(u * Math.PI) * archH;
      const post = new THREE.Mesh(postGeo, lacquerMat);
      post.position.set(x, y + 0.44, z);
      group.add(post);
      const fin = new THREE.Mesh(finialGeo, bronzeMat);
      fin.position.set(x, y + 0.90, z);
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

  /* Kasumidera gate.jpg 처진 금줄(Shimenawa) + 한지 종이 지전(Shide) */
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xb09058, roughness: 0.94, metalness: 0.02 });
  const shideMat = new THREE.MeshStandardMaterial({ color: 0xede0c2, roughness: 0.9, side: THREE.DoubleSide });
  disposables.push(ropeMat, shideMat);
  const ropePts = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    const rx = (u - 0.5) * (span * 0.92);
    const ry = height - 0.92 - Math.sin(u * Math.PI) * 0.52;
    ropePts.push(new THREE.Vector3(rx, ry, 0.14));
  }
  const ropeGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts), 14, 0.065, 6, false);
  const shideGeo = new THREE.PlaneGeometry(0.16, 0.34);
  disposables.push(ropeGeo, shideGeo);
  group.add(new THREE.Mesh(ropeGeo, ropeMat));
  for (const su of [0.26, 0.5, 0.74]) {
    const sx = (su - 0.5) * (span * 0.92);
    const sy = height - 0.96 - Math.sin(su * Math.PI) * 0.52;
    const sh = new THREE.Mesh(shideGeo, shideMat);
    sh.position.set(sx, sy - 0.16, 0.17);
    sh.rotation.z = (su - 0.5) * 0.28;
    group.add(sh);
  }

  group.userData.disposables = disposables;
  return group;
}

/**
 * 8) 파쇄 현무암 바위 군락 (lightning-energy-skill-vfx 16-평면 절단 현무암 바위 직이식)
 */
export function buildFracturedBasaltRocks3D(rng, opts = {}) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: opts.rockHex || 0x6b645c,
    roughness: 0.86,
    metalness: 0.08,
    emissive: new THREE.Color(opts.rockHex || 0x6b645c).multiplyScalar(0.18),
    flatShading: true,
  });
  const disposables = [mat];
  const count = opts.count || 3;
  const seeds = [91, 57, 23, 137, 211];
  for (let i = 0; i < count; i++) {
    const r = (i === 0 ? 0.98 : 0.52 + rng() * 0.34) * (opts.scale || 1.0);
    const g = createFracturedRockGeo(seeds[(i + Math.floor(rng() * 5)) % seeds.length], 0.72 + (rng() - 0.5) * 0.16);
    disposables.push(g);
    const m = new THREE.Mesh(g, mat);
    const a = i * 2.1 + rng() * 0.6;
    const dist = i === 0 ? 0 : 0.88 + rng() * 0.48;
    m.scale.set(r * (0.95 + rng() * 0.25), r * (0.88 + rng() * 0.32), r * (0.9 + rng() * 0.22));
    m.position.set(Math.cos(a) * dist, r * 0.38, Math.sin(a) * dist);
    m.rotation.set((rng() - 0.5) * 0.32, rng() * 6.28, (rng() - 0.5) * 0.32);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  group.userData.disposables = disposables;
  return group;
}


/**
 * 9) 16-평면 절단 층상 현무암 암봉 (storm-energy.mjs + Kasumidera cliff.jpg)
 */
export function buildFracturedCragMonolith3D(rng, opts = {}) {
  const group = new THREE.Group();
  const h = opts.height || (3.6 + rng() * 1.8);
  const mat = new THREE.MeshStandardMaterial({
    color: opts.rockHex || 0x5c5368,
    roughness: 0.86,
    metalness: 0.10,
    emissive: new THREE.Color(opts.rockHex || 0x5c5368).multiplyScalar(0.18),
    flatShading: true,
  });
  const disposables = [mat];
  const seeds = [91, 57, 23, 137, 211];
  const tilt = (rng() - 0.5) * 0.22;
  const yaw = rng() * 6.28;
  const specs = [
    { y: h * 0.22, sx: 1.45, sy: h * 0.34, sz: 1.25, ox: 0, oz: 0, sIdx: 0 },
    { y: h * 0.54, sx: 1.02, sy: h * 0.36, sz: 0.90, ox: tilt * 0.42, oz: -tilt * 0.28, sIdx: 1 },
    { y: h * 0.82, sx: 0.62, sy: h * 0.28, sz: 0.56, ox: tilt * 0.82, oz: -tilt * 0.50, sIdx: 2 },
  ];
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    const g = createFracturedRockGeo(seeds[(sp.sIdx + Math.floor(rng() * 5)) % seeds.length], 1.15);
    disposables.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(sp.ox, sp.y, sp.oz);
    m.scale.set(sp.sx, sp.sy, sp.sz);
    m.rotation.set(0, yaw + i * 1.15, tilt * (0.5 + i * 0.4));
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  group.userData.disposables = disposables;
  return group;
}

/**
 * 10) 카스미데라 누각·성문 (3d-kasumidera-ultra-realism eaves.jpg + 3d-paper-material 역광 창호)
 */
export function buildKasumideraGatehouse3D(opts = {}) {
  const isFortress = !!opts.fortress;
  const w = opts.w || 5.4, d = opts.d || 3.4, baseH = 0.46, wallH = 2.65;
  const group = new THREE.Group();
  group.name = isFortress ? 'kasumidera-fortress-gate' : 'kasumidera-gatehouse';

  const stoneMat = new THREE.MeshStandardMaterial({ color: opts.stoneHex || 0x7d766b, roughness: 0.90, metalness: 0.04, emissive: 0x1a1814, emissiveIntensity: 0.35 });
  const woodMat = new THREE.MeshStandardMaterial({ color: opts.woodHex || 0x7a573e, roughness: 0.82, metalness: 0.06, emissive: 0x1d140e, emissiveIntensity: 0.30 });
  const redMat = new THREE.MeshStandardMaterial({ color: opts.lacquerHex || 0xb53428, roughness: 0.50, metalness: 0.12, emissive: 0x2a0c08, emissiveIntensity: 0.45 });
  const tileMat = new THREE.MeshStandardMaterial({ color: opts.tileHex || 0x4b5360, roughness: 0.68, metalness: 0.16, emissive: 0x141820, emissiveIntensity: 0.40 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xe0b858, roughness: 0.32, metalness: 0.72, emissive: 0x3b2c0c, emissiveIntensity: 0.45 });
  const paperMat = new THREE.MeshStandardMaterial({
    map: getPaperGrainTex(),
    color: 0xfff0d0,
    emissive: new THREE.Color(opts.glowHex || 0xffb856),
    emissiveIntensity: 1.45,
    roughness: 0.84,
  });
  paperMat.userData.cardSkip = true;
  const disposables = [stoneMat, woodMat, redMat, tileMat, goldMat, paperMat];

  const baseGeo = new THREE.BoxGeometry(w + 1.1, baseH, d + 1.0);
  const stepGeo = new THREE.BoxGeometry(2.2, baseH * 0.55, 0.7);
  const colGeo = new THREE.CylinderGeometry(0.16, 0.20, wallH, 10);
  const footGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.26, 8);
  const beamGeo = new THREE.BoxGeometry(w + 0.6, 0.24, 0.26);
  const wallGeo = new THREE.BoxGeometry(w - 0.5, wallH - 0.1, d - 0.6);
  disposables.push(baseGeo, stepGeo, colGeo, footGeo, beamGeo, wallGeo);

  const base = new THREE.Mesh(baseGeo, stoneMat); base.position.y = baseH * 0.5; base.receiveShadow = true; group.add(base);
  const step = new THREE.Mesh(stepGeo, stoneMat); step.position.set(0, baseH * 0.28, d * 0.5 + 0.65); group.add(step);
  const core = new THREE.Mesh(wallGeo, isFortress ? stoneMat : woodMat); core.position.set(0, baseH + wallH * 0.5, -0.1); core.castShadow = true; group.add(core);

  for (const sx of [-w * 0.44, 0, w * 0.44]) {
    for (const sz of [-d * 0.42, d * 0.42]) {
      if (sx === 0 && sz > 0) continue;
      const ft = new THREE.Mesh(footGeo, stoneMat); ft.position.set(sx, baseH + 0.13, sz); group.add(ft);
      const col = new THREE.Mesh(colGeo, redMat); col.position.set(sx, baseH + wallH * 0.5, sz); col.castShadow = true; group.add(col);
    }
  }
  const frontBeam = new THREE.Mesh(beamGeo, redMat); frontBeam.position.set(0, baseH + wallH + 0.08, d * 0.42); group.add(frontBeam);
  const backBeam = new THREE.Mesh(beamGeo, woodMat); backBeam.position.set(0, baseH + wallH + 0.08, -d * 0.42); group.add(backBeam);

  if (isFortress) {
    const doorGeo = new THREE.BoxGeometry(2.6, wallH * 0.84, 0.16);
    const ringGeo = new THREE.TorusGeometry(0.14, 0.03, 6, 14);
    disposables.push(doorGeo, ringGeo);
    const door = new THREE.Mesh(doorGeo, redMat); door.position.set(0, baseH + wallH * 0.44, d * 0.34); group.add(door);
    for (const s of [-0.48, 0.48]) {
      const rg = new THREE.Mesh(ringGeo, goldMat); rg.position.set(s, baseH + wallH * 0.44, d * 0.44); group.add(rg);
    }
  } else {
    const paneGeo = new THREE.BoxGeometry(1.45, wallH * 0.62, 0.06);
    const mullGeo = new THREE.BoxGeometry(0.055, wallH * 0.64, 0.09);
    disposables.push(paneGeo, mullGeo);
    for (const sx of [-w * 0.25, w * 0.25]) {
      const pane = new THREE.Mesh(paneGeo, paperMat); pane.position.set(sx, baseH + wallH * 0.50, d * 0.34); group.add(pane);
      for (let m = -1; m <= 1; m++) {
        const ml = new THREE.Mesh(mullGeo, woodMat); ml.position.set(sx + m * 0.36, baseH + wallH * 0.50, d * 0.36); group.add(ml);
      }
    }
  }

  const eaveY = baseH + wallH + 0.14, ridgeY = eaveY + 1.18;
  const halfD = d * 0.5 + 1.05, roofW = w + 1.85;
  const slope = Math.hypot(halfD, ridgeY - eaveY);
  const ang = Math.atan2(ridgeY - eaveY, halfD);
  const roofGeo = new THREE.BoxGeometry(roofW, 0.18, slope);
  const ribGeo = new THREE.BoxGeometry(0.12, 0.10, slope * 1.02);
  const ridgeGeo = new THREE.BoxGeometry(roofW + 0.25, 0.30, 0.36);
  const chimiGeo = new THREE.ConeGeometry(0.22, 0.52, 4);
  disposables.push(roofGeo, ribGeo, ridgeGeo, chimiGeo);
  for (const s of [-1, 1]) {
    const sl = new THREE.Mesh(roofGeo, tileMat);
    sl.position.set(0, (eaveY + ridgeY) * 0.5, s * halfD * 0.5);
    sl.rotation.x = s * ang;
    sl.castShadow = true;
    group.add(sl);
    for (let r = -3; r <= 3; r++) {
      const rb = new THREE.Mesh(ribGeo, tileMat);
      rb.position.set(r * (roofW / 7.5), (eaveY + ridgeY) * 0.5 + 0.11, s * halfD * 0.5);
      rb.rotation.x = s * ang;
      group.add(rb);
    }
  }
  const ridge = new THREE.Mesh(ridgeGeo, tileMat); ridge.position.set(0, ridgeY + 0.08, 0); group.add(ridge);
  for (const s of [-1, 1]) {
    const ch = new THREE.Mesh(chimiGeo, goldMat); ch.position.set(s * (roofW * 0.5 + 0.06), ridgeY + 0.34, 0); group.add(ch);
  }

  group.userData.disposables = disposables;
  return group;
}

/**
 * 11) 카스미데라 4층 사찰 목탑 (3d-kasumidera-ultra-realism gate.jpg / eaves.jpg)
 */
export function buildKasumideraPagoda3D(opts = {}) {
  const scale = opts.scale || 1.0;
  const group = new THREE.Group();
  group.name = 'kasumidera-pagoda';

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a756c, roughness: 0.90, metalness: 0.04, emissive: 0x181714, emissiveIntensity: 0.35 });
  const redMat = new THREE.MeshStandardMaterial({ color: opts.lacquerHex || 0xb53428, roughness: 0.48, metalness: 0.14, emissive: 0x280c08, emissiveIntensity: 0.42 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4130, roughness: 0.84, metalness: 0.05, emissive: 0x140e0a, emissiveIntensity: 0.25 });
  const tileMat = new THREE.MeshStandardMaterial({ color: opts.tileHex || 0x4c5664, roughness: 0.66, metalness: 0.18, emissive: 0x141a22, emissiveIntensity: 0.40 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xdfb858, roughness: 0.32, metalness: 0.76, emissive: 0x3b2c0c, emissiveIntensity: 0.45 });
  const paperMat = new THREE.MeshStandardMaterial({
    map: getPaperGrainTex(),
    color: 0xfff2d8,
    emissive: new THREE.Color(opts.glowHex || 0x86f0ca),
    emissiveIntensity: 1.45,
    roughness: 0.84,
  });
  paperMat.userData.cardSkip = true;
  const disposables = [stoneMat, redMat, woodMat, tileMat, bronzeMat, paperMat];

  const base1 = new THREE.BoxGeometry(4.2, 0.46, 4.2);
  const base2 = new THREE.BoxGeometry(3.4, 0.22, 3.4);
  disposables.push(base1, base2);
  const b1 = new THREE.Mesh(base1, stoneMat); b1.position.y = 0.23; b1.receiveShadow = true; group.add(b1);
  const b2 = new THREE.Mesh(base2, stoneMat); b2.position.y = 0.56; group.add(b2);

  let curY = 0.67;
  for (let i = 0; i < 4; i++) {
    const k = 1 - i * 0.18;
    const bw = 2.35 * k, fh = (i === 0 ? 1.50 : 1.10) * (0.94 + 0.06 * k);
    const ew = bw + 1.55 * (0.86 + 0.14 * k);

    const coreG = new THREE.BoxGeometry(bw * 0.86, fh, bw * 0.86);
    const paneG = new THREE.BoxGeometry(bw * 0.58, fh * 0.56, bw * 0.90);
    const paneG2 = new THREE.BoxGeometry(bw * 0.90, fh * 0.56, bw * 0.58);
    const colG = new THREE.CylinderGeometry(0.09 * k + 0.03, 0.10 * k + 0.04, fh, 8);
    const railG = new THREE.BoxGeometry(bw + 0.36, 0.09, 0.09);
    const eaveG = new THREE.BoxGeometry(ew, 0.14, ew);
    const roofG = new THREE.ConeGeometry(ew * 0.72, 0.62, 4);
    roofG.rotateY(Math.PI / 4);
    disposables.push(coreG, paneG, paneG2, colG, railG, eaveG, roofG);

    const core = new THREE.Mesh(coreG, woodMat); core.position.y = curY + fh * 0.5; core.castShadow = true; group.add(core);
    const p1 = new THREE.Mesh(paneG, paperMat); p1.position.y = curY + fh * 0.52; group.add(p1);
    const p2 = new THREE.Mesh(paneG2, paperMat); p2.position.y = curY + fh * 0.52; group.add(p2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const col = new THREE.Mesh(colG, redMat); col.position.set(sx * bw * 0.45, curY + fh * 0.5, sz * bw * 0.45); group.add(col);
    }
    for (const s of [-1, 1]) {
      const r1 = new THREE.Mesh(railG, redMat); r1.position.set(0, curY + 0.34, s * (bw * 0.5 + 0.16)); group.add(r1);
      const r2 = new THREE.Mesh(railG, redMat); r2.position.set(s * (bw * 0.5 + 0.16), curY + 0.34, 0); r2.rotation.y = Math.PI / 2; group.add(r2);
    }
    const ry = curY + fh;
    const eave = new THREE.Mesh(eaveG, tileMat); eave.position.y = ry + 0.08; eave.castShadow = true; group.add(eave);
    const roof = new THREE.Mesh(roofG, tileMat); roof.position.y = ry + 0.45; roof.castShadow = true; group.add(roof);
    curY = ry + 0.52;
  }

  const spireG = new THREE.CylinderGeometry(0.04, 0.07, 1.9, 8);
  const ringG = new THREE.TorusGeometry(0.22, 0.032, 6, 14);
  ringG.rotateX(Math.PI / 2);
  const orbG = new THREE.SphereGeometry(0.11, 8, 6);
  disposables.push(spireG, ringG, orbG);
  const spire = new THREE.Mesh(spireG, bronzeMat); spire.position.y = curY + 0.92; group.add(spire);
  for (let r = 0; r < 5; r++) {
    const rg = new THREE.Mesh(ringG, bronzeMat);
    rg.position.y = curY + 0.42 + r * 0.24;
    rg.scale.setScalar(1 - r * 0.11);
    group.add(rg);
  }
  const orb = new THREE.Mesh(orbG, bronzeMat); orb.position.y = curY + 1.92; group.add(orb);

  group.scale.setScalar(scale);
  group.userData.disposables = disposables;
  return group;
}

/**
 * 12) 카스미데라 사당·정자 (3d-kasumidera-ultra-realism — 돌계단·주홍 기둥·역광 한지 감실·팔작 기와)
 */
export function buildKasumideraPavilion3D(opts = {}) {
  const w = opts.w || 3.1, d = opts.d || 2.6, baseH = 0.46, h = 2.25;
  const group = new THREE.Group();
  group.name = 'kasumidera-pavilion';

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7d766b, roughness: 0.90, metalness: 0.04, emissive: 0x1a1814, emissiveIntensity: 0.35 });
  const redMat = new THREE.MeshStandardMaterial({ color: opts.lacquerHex || 0xb53428, roughness: 0.48, metalness: 0.12, emissive: 0x280c08, emissiveIntensity: 0.42 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4b34, roughness: 0.84, metalness: 0.05, emissive: 0x160f0a, emissiveIntensity: 0.28 });
  const tileMat = new THREE.MeshStandardMaterial({ color: opts.tileHex || 0x4c5460, roughness: 0.68, metalness: 0.16, emissive: 0x141820, emissiveIntensity: 0.40 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xdfb858, roughness: 0.34, metalness: 0.72, emissive: 0x3b2c0c, emissiveIntensity: 0.45 });
  const paperMat = new THREE.MeshStandardMaterial({
    map: getPaperGrainTex(),
    color: 0xfff0d4,
    emissive: new THREE.Color(opts.glowHex || 0xffb856),
    emissiveIntensity: 1.45,
    roughness: 0.84,
  });
  paperMat.userData.cardSkip = true;
  const disposables = [stoneMat, redMat, woodMat, tileMat, goldMat, paperMat];

  const baseG = new THREE.BoxGeometry(w + 0.9, baseH, d + 0.9);
  const stepG = new THREE.BoxGeometry(1.4, baseH * 0.65, 0.52);
  const colG = new THREE.CylinderGeometry(0.11, 0.13, h, 8);
  const altarG = new THREE.BoxGeometry(w * 0.68, h * 0.88, d * 0.60);
  const paneG = new THREE.BoxGeometry(w * 0.48, h * 0.56, 0.06);
  const eaveG = new THREE.BoxGeometry(w + 1.55, 0.16, d + 1.55);
  const roofG = new THREE.ConeGeometry(Math.max(w, d) * 0.96, 1.05, 4);
  roofG.rotateY(Math.PI / 4);
  const finG = new THREE.SphereGeometry(0.14, 8, 6);
  disposables.push(baseG, stepG, colG, altarG, paneG, eaveG, roofG, finG);

  const base = new THREE.Mesh(baseG, stoneMat); base.position.y = baseH * 0.5; base.receiveShadow = true; group.add(base);
  const step = new THREE.Mesh(stepG, stoneMat); step.position.set(0, baseH * 0.32, d * 0.5 + 0.55); group.add(step);
  const altar = new THREE.Mesh(altarG, woodMat); altar.position.set(0, baseH + h * 0.44, -0.10); altar.castShadow = true; group.add(altar);
  const pane = new THREE.Mesh(paneG, paperMat); pane.position.set(0, baseH + h * 0.48, d * 0.22); group.add(pane);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const col = new THREE.Mesh(colG, redMat); col.position.set(sx * w * 0.44, baseH + h * 0.5, sz * d * 0.44); col.castShadow = true; group.add(col);
  }
  const eave = new THREE.Mesh(eaveG, tileMat); eave.position.y = baseH + h + 0.08; eave.castShadow = true; group.add(eave);
  const roof = new THREE.Mesh(roofG, tileMat); roof.position.y = baseH + h + 0.62; roof.castShadow = true; group.add(roof);
  const fin = new THREE.Mesh(finG, goldMat); fin.position.y = baseH + h + 1.18; group.add(fin);

  group.userData.disposables = disposables;
  return group;
}

/**
 * 13) 3d-cloth-material 직조 천막 저잣거리 좌판 (곡선 현수선 드리핑 천막 + 옹기 항아리 + 역광 초롱불)
 */
export function buildDrapedClothStall3D(opts = {}) {
  const group = new THREE.Group();
  group.name = 'cloth-draped-market-stall';

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4c34, roughness: 0.86, metalness: 0.04, emissive: 0x160f0a, emissiveIntensity: 0.28 });
  const clothMat = new THREE.MeshStandardMaterial({
    color: opts.clothHex || 0xb57242,
    normalMap: getClothWeaveNormal() || null,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.86,
    metalness: 0.0,
    emissive: new THREE.Color(opts.clothHex || 0xb57242).multiplyScalar(0.18),
    side: THREE.DoubleSide,
  });
  const clayMat = new THREE.MeshStandardMaterial({ color: 0x4a3b32, roughness: 0.44, metalness: 0.16 });
  const lanternMat = new THREE.MeshStandardMaterial({
    map: getPaperGrainTex(),
    color: 0xfff0d4,
    emissive: new THREE.Color(0xffaa44),
    emissiveIntensity: 1.85,
    roughness: 0.82,
  });
  lanternMat.userData.cardSkip = true;
  const disposables = [woodMat, clothMat, clayMat, lanternMat];

  const topG = new THREE.BoxGeometry(2.1, 0.10, 1.05);
  const legG = new THREE.CylinderGeometry(0.055, 0.07, 2.30, 7);
  const poleG = new THREE.CylinderGeometry(0.04, 0.04, 2.55, 7);
  poleG.rotateZ(Math.PI / 2);
  disposables.push(topG, legG, poleG);

  const tbl = new THREE.Mesh(topG, woodMat); tbl.position.set(0, 0.78, 0); tbl.castShadow = true; group.add(tbl);
  for (const sx of [-0.95, 0.95]) for (const sz of [-0.52, 0.52]) {
    const ph = sz < 0 ? 2.38 : 2.06;
    const leg = new THREE.Mesh(legG, woodMat);
    leg.scale.y = ph / 2.30;
    leg.position.set(sx, ph * 0.5, sz);
    group.add(leg);
  }
  const pBack = new THREE.Mesh(poleG, woodMat); pBack.position.set(0, 2.34, -0.52); group.add(pBack);
  const pFront = new THREE.Mesh(poleG, woodMat); pFront.position.set(0, 2.04, 0.52); group.add(pFront);

  const canopyG = new THREE.PlaneGeometry(2.55, 1.58, 8, 6);
  const cp = canopyG.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i);
    const u = (y / 1.58) + 0.5;
    const sag = Math.sin(u * Math.PI) * 0.22 + Math.cos(x * 3.8) * 0.035;
    const zPos = -0.68 + u * 1.48;
    const yPos = 2.40 - u * 0.38 - sag;
    cp.setXYZ(i, x, yPos, zPos);
  }
  canopyG.computeVertexNormals();
  disposables.push(canopyG);
  const canopy = new THREE.Mesh(canopyG, clothMat);
  canopy.castShadow = true;
  group.add(canopy);

  const jarPts = [
    new THREE.Vector2(0.0, 0.0), new THREE.Vector2(0.11, 0.02),
    new THREE.Vector2(0.18, 0.16), new THREE.Vector2(0.15, 0.30),
    new THREE.Vector2(0.09, 0.36), new THREE.Vector2(0.11, 0.39),
  ];
  const jarG = new THREE.LatheGeometry(jarPts, 10);
  const lanG = new THREE.CylinderGeometry(0.12, 0.11, 0.30, 8);
  disposables.push(jarG, lanG);
  const jar = new THREE.Mesh(jarG, clayMat); jar.position.set(-0.48, 0.83, 0.05); group.add(jar);
  const jar2 = new THREE.Mesh(jarG, clayMat); jar2.scale.setScalar(0.75); jar2.position.set(-0.14, 0.83, -0.14); group.add(jar2);
  const lan = new THREE.Mesh(lanG, lanternMat); lan.position.set(0.92, 1.80, 0.58); group.add(lan);

  group.userData.disposables = disposables;
  return group;
}

/**
 * 14) 석재 성벽 + 여장 + 직조 군기 (3d-kasumidera-ultra-realism + 3d-cloth-material)
 */
export function buildStoneFortressWall3D(opts = {}) {
  const len = opts.len || 5.6, h = opts.h || 2.5;
  const group = new THREE.Group();
  group.name = 'kasumidera-fortress-wall';

  const stoneMat = new THREE.MeshStandardMaterial({ color: opts.stoneHex || 0x7a7368, roughness: 0.90, metalness: 0.04, emissive: 0x181612, emissiveIntensity: 0.35 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x4e4b4d, roughness: 0.84, metalness: 0.08, emissive: 0x121214, emissiveIntensity: 0.32 });
  const clothMat = new THREE.MeshStandardMaterial({
    color: opts.bannerHex || 0xb53226,
    normalMap: getClothWeaveNormal() || null,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.85,
    emissive: new THREE.Color(opts.bannerHex || 0xb53226).multiplyScalar(0.22),
    side: THREE.DoubleSide,
  });
  const disposables = [stoneMat, capMat, clothMat];

  const bodyG = new THREE.BoxGeometry(len, h, 0.95);
  const trimG = new THREE.BoxGeometry(len + 0.16, 0.18, 1.06);
  const merlonG = new THREE.BoxGeometry(0.88, 0.48, 0.98);
  const banG = new THREE.PlaneGeometry(0.72, 1.45);
  disposables.push(bodyG, trimG, merlonG, banG);

  const body = new THREE.Mesh(bodyG, stoneMat); body.position.y = h * 0.5; body.castShadow = true; body.receiveShadow = true; group.add(body);
  const trim = new THREE.Mesh(trimG, capMat); trim.position.y = h + 0.06; group.add(trim);
  const count = Math.max(3, Math.round(len / 1.4));
  for (let i = 0; i < count; i++) {
    const x = -len * 0.5 + (len * (i + 0.5)) / count;
    const m = new THREE.Mesh(merlonG, stoneMat);
    m.position.set(x, h + 0.34, 0);
    group.add(m);
  }
  const banner = new THREE.Mesh(banG, clothMat);
  banner.position.set(0, h * 0.58, 0.52);
  group.add(banner);

  group.userData.disposables = disposables;
  return group;
}

/**
 * 15) 16-평면 절단 현무암 월석 비석 + 빛나는 봉인륜 (4장·16장 구형 회색 상자 비석 완전 대체)
 */
export function buildKasumideraMoonStele3D(opts = {}) {
  const group = new THREE.Group();
  group.name = 'kasumidera-moon-stele';

  const rockMat = new THREE.MeshStandardMaterial({ color: opts.rockHex || 0x5d5266, roughness: 0.84, metalness: 0.12, emissive: 0x18141e, emissiveIntensity: 0.42, flatShading: true });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x766e72, roughness: 0.90, metalness: 0.06, emissive: 0x161418, emissiveIntensity: 0.35 });
  const glowHex = opts.glowHex || 0xff5242;
  const bandMat = new THREE.MeshBasicMaterial({ color: glowHex, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false });
  bandMat.userData.cardSkip = true;
  const disposables = [rockMat, baseMat, bandMat];

  const baseG = new THREE.CylinderGeometry(0.78, 0.96, 0.34, 8);
  const steleG = createFracturedRockGeo(opts.seed || 137, 2.25);
  const haloG = new THREE.TorusGeometry(0.56, 0.036, 6, 24);
  disposables.push(baseG, steleG, haloG);

  const base = new THREE.Mesh(baseG, baseMat); base.position.y = 0.17; group.add(base);
  const stele = new THREE.Mesh(steleG, rockMat);
  stele.scale.set(0.52, 0.68, 0.42);
  stele.position.y = 1.65;
  stele.castShadow = true;
  group.add(stele);
  const halo = new THREE.Mesh(haloG, bandMat);
  halo.position.y = 3.25;
  group.add(halo);

  group.userData.spinHalo = halo;
  group.userData.disposables = disposables;
  return group;
}


/**
 * 16) 무너진 성채 석재 잔해 (2장 구형 흰 원기둥·2D 스티커 대체: 16-평면 파쇄 화강암 + 부서진 기와 + 깨진 주춧돌)
 */
export function buildRuinedMasonry3D(rng, opts = {}) {
  const group = new THREE.Group();
  group.name = 'kasumidera-ruined-masonry';

  const stoneMat = new THREE.MeshStandardMaterial({ color: opts.stoneHex || 0x7a7366, roughness: 0.90, metalness: 0.05, emissive: 0x181612, emissiveIntensity: 0.32, flatShading: true });
  const tileMat = new THREE.MeshStandardMaterial({ color: 0x454d58, roughness: 0.72, metalness: 0.14, emissive: 0x12151a, emissiveIntensity: 0.35 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x62442d, roughness: 0.88, metalness: 0.04 });
  const disposables = [stoneMat, tileMat, woodMat];

  const seeds = [91, 57, 23, 137];
  const gMain = createFracturedRockGeo(seeds[Math.floor(rng() * seeds.length)], 0.82);
  const gSub = createFracturedRockGeo(seeds[Math.floor(rng() * seeds.length)], 0.56);
  const beamG = new THREE.BoxGeometry(1.45, 0.16, 0.18);
  const roofG = new THREE.BoxGeometry(1.15, 0.10, 0.75);
  disposables.push(gMain, gSub, beamG, roofG);

  const main = new THREE.Mesh(gMain, stoneMat);
  main.scale.set(0.85, 0.72, 0.78);
  main.position.set(0, 0.42, 0);
  main.rotation.set(0.15, rng() * 6.28, -0.18);
  main.castShadow = true; main.receiveShadow = true;
  group.add(main);

  const sub = new THREE.Mesh(gSub, stoneMat);
  sub.scale.set(0.65, 0.45, 0.58);
  sub.position.set(0.75, 0.22, 0.32);
  sub.rotation.set(-0.1, rng() * 6.28, 0.22);
  group.add(sub);

  const beam = new THREE.Mesh(beamG, woodMat);
  beam.position.set(-0.35, 0.24, 0.42);
  beam.rotation.set(0.12, rng() * 3.14, -0.24);
  group.add(beam);

  const roof = new THREE.Mesh(roofG, tileMat);
  roof.position.set(0.28, 0.26, -0.45);
  roof.rotation.set(0.32, rng() * 3.14, 0.18);
  group.add(roof);

  group.userData.disposables = disposables;
  return group;
}

/* ============================================================================
 * v0.67 스킬 기반 고퀄리티 지형지물 5종
 * (3d-kasumidera-ultra-realism · 3d-metal-material · forest-floor-specimen · 3d-falling-leaves · 3d-sky-rays)
 * ============================================================================ */

const INCENSE_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const INCENSE_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uCol;
varying vec2 vUv;
void main() {
  float x = (vUv.x - 0.5) * 2.0;
  float sway = sin(vUv.y * 5.2 - uTime * 1.9) * 0.24 * vUv.y;
  float width = mix(0.22, 0.85, vUv.y);
  float core = 1.0 - smoothstep(0.0, width, abs(x - sway));
  float wisp = 0.65 + 0.35 * sin(vUv.y * 11.0 - uTime * 3.1 + x * 4.0);
  float vFade = smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  float a = core * wisp * vFade * 0.46;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uCol, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SKYRAY_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const SKYRAY_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float edge = pow(abs(dot(normalize(vNormal), normalize(vViewDir))), 1.45);
  float vertical = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.62, 1.0, vUv.y));
  float shimmer = 0.78 + 0.22 * sin(vUv.x * 18.84 + uTime * 0.85 + vUv.y * 3.2);
  float alpha = edge * vertical * shimmer * uOpacity;
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(uColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** 1) 청동 향로 + 국소 향연 플룸 (3d-kasumidera-ultra-realism + 3d-metal-material) */
export function buildBronzeCenser3D(opts = {}) {
  const group = new THREE.Group();
  const disposables = [];
  const scale = opts.scale || 1.0;
  const smokeCol = opts.smokeHex || 0xe8dcc4;
  const emberHex = opts.emberHex || 0xff6e3a;

  const bronzeMat = new THREE.MeshStandardMaterial({
    color: opts.bronzeHex || 0x7d6b47,
    metalness: 0.86, roughness: 0.34,
    emissive: 0x1c1810, emissiveIntensity: 0.25
  });
  const patinaMat = new THREE.MeshStandardMaterial({
    color: 0x3b594e, metalness: 0.62, roughness: 0.56
  });
  const emberMat = new THREE.MeshStandardMaterial({
    color: emberHex, emissive: emberHex, emissiveIntensity: 1.5, roughness: 0.3
  });
  disposables.push(bronzeMat, patinaMat, emberMat);

  const bowlPts = [
    new THREE.Vector2(0.02, 0.42), new THREE.Vector2(0.32, 0.44),
    new THREE.Vector2(0.46, 0.62), new THREE.Vector2(0.44, 0.88),
    new THREE.Vector2(0.50, 0.96), new THREE.Vector2(0.36, 0.96),
    new THREE.Vector2(0.34, 0.82)
  ];
  const bowlG = new THREE.LatheGeometry(bowlPts, 14);
  const legG = new THREE.CylinderGeometry(0.055, 0.04, 0.52, 6);
  const baseG = new THREE.CylinderGeometry(0.44, 0.52, 0.14, 8);
  const emberG = new THREE.CylinderGeometry(0.30, 0.26, 0.08, 10);
  const plumeG = new THREE.PlaneGeometry(0.95, 2.85, 1, 8);
  plumeG.translate(0, 1.42, 0);
  const plumeMat = new THREE.ShaderMaterial({
    vertexShader: INCENSE_VERT, fragmentShader: INCENSE_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(smokeCol) } }
  });
  disposables.push(bowlG, legG, baseG, emberG, plumeG, plumeMat);

  const base = new THREE.Mesh(baseG, patinaMat); base.position.y = 0.07; group.add(base);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(legG, bronzeMat);
    leg.position.set(Math.cos(a) * 0.24, 0.32, Math.sin(a) * 0.24);
    leg.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
    group.add(leg);
  }
  group.add(new THREE.Mesh(bowlG, bronzeMat));
  const emb = new THREE.Mesh(emberG, emberMat); emb.position.y = 0.88; group.add(emb);

  const p1 = new THREE.Mesh(plumeG, plumeMat); p1.position.y = 0.92; p1.renderOrder = 4; group.add(p1);
  const p2 = new THREE.Mesh(plumeG, plumeMat); p2.position.y = 0.92; p2.rotation.y = Math.PI * 0.5; p2.renderOrder = 4; group.add(p2);

  group.scale.setScalar(scale);
  group.userData.disposables = disposables;
  group.userData.shaderMat = plumeMat;
  return group;
}

/** 2) 이끼 낀 닳은 조선 석계단 · 기단석 (3d-kasumidera-ultra-realism) */
export function buildMossyStoneSteps3D(opts = {}) {
  const group = new THREE.Group();
  const disposables = [];
  const w = opts.width || 2.8;
  const stoneMat = new THREE.MeshStandardMaterial({ color: opts.stoneHex || 0x5c5952, roughness: 0.92, metalness: 0.04 });
  const mossMat = new THREE.MeshStandardMaterial({ color: opts.mossHex || 0x3b573b, roughness: 0.96, metalness: 0.0 });
  disposables.push(stoneMat, mossMat);

  for (let i = 0; i < 3; i++) {
    const sw = w - i * 0.22;
    const stepG = new THREE.BoxGeometry(sw, 0.22, 0.56);
    disposables.push(stepG);
    const m = new THREE.Mesh(stepG, stoneMat);
    m.position.set(0, 0.11 + i * 0.20, -i * 0.46);
    m.receiveShadow = true;
    group.add(m);
    if (i < 2) {
      const mG = new THREE.BoxGeometry(sw * 0.34, 0.04, 0.18);
      disposables.push(mG);
      const ms = new THREE.Mesh(mG, mossMat);
      ms.position.set((i % 2 === 0 ? -1 : 1) * sw * 0.26, 0.23 + i * 0.20, -i * 0.46 + 0.12);
      group.add(ms);
    }
  }
  group.userData.disposables = disposables;
  return group;
}

/** 3) 3D 고사리 · 이끼 수풀 군락 (forest-floor-specimen) */
export function buildForestFloorFerns3D(rng, opts = {}) {
  const group = new THREE.Group();
  const disposables = [];
  const count = opts.count || 7;
  const frondMat = new THREE.MeshStandardMaterial({
    color: opts.leafHex || 0x3f6e49, roughness: 0.78, metalness: 0.02, side: THREE.DoubleSide
  });
  const mossMat = new THREE.MeshStandardMaterial({ color: opts.mossHex || 0x2d4a32, roughness: 0.95 });
  const cushionG = new THREE.SphereGeometry(0.46, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const frondG = new THREE.PlaneGeometry(0.24, 0.95, 1, 4);
  const fp = frondG.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i) + 0.475;
    const t = y / 0.95;
    fp.setX(i, fp.getX(i) * (1.0 - t * 0.72));
    fp.setY(i, y);
    fp.setZ(i, Math.sin(t * Math.PI * 0.85) * 0.28 + t * t * 0.22);
  }
  frondG.computeVertexNormals();
  disposables.push(frondMat, mossMat, cushionG, frondG);

  const cush = new THREE.Mesh(cushionG, mossMat); cush.scale.set(1.1, 0.32, 1.1); group.add(cush);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    const f = new THREE.Mesh(frondG, frondMat);
    f.rotation.set(0.45 + rng() * 0.35, a, (rng() - 0.5) * 0.2);
    f.scale.setScalar(0.78 + rng() * 0.42);
    group.add(f);
  }
  group.scale.setScalar(opts.scale || 1.0);
  group.userData.disposables = disposables;
  return group;
}

/** 4) 3D 회전·팔랑 낙엽/댓잎 InstancedMesh (3d-falling-leaves) — 단일 드로우콜 */
export function createFallingLeaves3D(rng, opts = {}) {
  const count = opts.count || 64;
  const leafShape = opts.shape || 'bamboo'; // 'bamboo' | 'autumn' | 'ash'
  const w = leafShape === 'bamboo' ? 0.11 : (leafShape === 'ash' ? 0.13 : 0.20);
  const h = leafShape === 'bamboo' ? 0.44 : (leafShape === 'ash' ? 0.16 : 0.26);
  const geo = new THREE.PlaneGeometry(w, h, 1, 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / (h * 0.5);
    pos.setX(i, pos.getX(i) * Math.max(0.18, 1.0 - Math.abs(y) * 0.72));
    pos.setZ(i, (1.0 - y * y) * 0.04);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: opts.colorHex || 0x6fd4a2,
    emissive: opts.emissiveHex || 0x163826,
    emissiveIntensity: 0.32,
    roughness: 0.65, metalness: 0.04, side: THREE.DoubleSide
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'falling-leaves-3d';
  mesh.frustumCulled = false;

  const states = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const palette = opts.palette || [0x5ec796, 0x7be0b0, 0x459e74, 0x93ebb8];
  for (let i = 0; i < count; i++) {
    const st = {
      x: (rng() - 0.5) * 28,
      y: rng() * 9.5 + 0.5,
      z: (rng() - 0.5) * 28,
      vy: 0.85 + rng() * 0.95,
      vx: 0.55 + rng() * 0.65,
      phase: rng() * 6.28,
      spinX: (rng() - 0.5) * 2.8,
      spinY: (rng() - 0.5) * 2.4,
      spinZ: (rng() - 0.5) * 2.2,
      scale: 0.75 + rng() * 0.6
    };
    states.push(st);
    col.setHex(palette[i % palette.length]);
    mesh.setColorAt(i, col);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  let t = 0;
  return {
    mesh,
    update(dt) {
      const d = Math.min(0.05, Number(dt || 0.016));
      t += d;
      const gust = Math.sin(t * 0.65) * 0.45 + 0.55;
      for (let i = 0; i < count; i++) {
        const s = states[i];
        s.y -= s.vy * d;
        s.x += (s.vx * gust + Math.sin(t * 2.2 + s.phase) * 0.55) * d;
        s.z += Math.cos(t * 1.7 + s.phase) * 0.35 * d;
        if (s.y < 0.12) { s.y = 9.4; s.x = ((s.x + 14) % 28) - 14; }
        if (s.x > 14.5) s.x = -14.5;
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(t * s.spinX + s.phase, t * s.spinY, t * s.spinZ + Math.sin(t * 2.6 + s.phase) * 0.7);
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); }
  };
}

/** 5) 볼류메트릭 빛줄기(달빛·햇살 기둥) (3d-sky-rays + threejs-shaders) */
export function createSkyRays3D(opts = {}) {
  const group = new THREE.Group();
  group.name = 'sky-rays-3d';
  const count = opts.count || 3;
  const geo = new THREE.CylinderGeometry(0.85, 2.35, 13.5, 12, 1, true);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKYRAY_VERT, fragmentShader: SKYRAY_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(opts.colorHex || 0xffe4b5) },
      uOpacity: { value: opts.opacity != null ? opts.opacity : 0.14 }
    }
  });
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.55;
    const r = 8.4 + (i % 2) * 2.2;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(a) * r, 5.8, Math.sin(a) * r);
    m.rotation.set(0.22, 0, -0.28);
    m.renderOrder = 3;
    group.add(m);
  }
  return {
    group,
    update(dt) { mat.uniforms.uTime.value += Math.min(0.05, Number(dt || 0.016)); },
    dispose() { geo.dispose(); mat.dispose(); }
  };
}
