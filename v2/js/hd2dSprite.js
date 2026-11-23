/* v2/js/hd2dSprite.js — v0.79 하데스풍 HD-2D 하이브리드 빌보드 스프라이트 엔진
   - 기본 ON (`?render=3d` 또는 `?hd2d=0` 쿼리로 3D GLB 비교 모드 즉시 전환)
   - 3D 전장·조명·안개·바닥 접지 그림자·3D 검기/셰이더 VFX 위에 고해상도 2D 하데스풍 전투 스프라이트 배치
   - 방향 전환 2.5D 페이퍼 플립, 호흡/발걸음 바운스, 속도 기울기, 스쿼시·스트레치, 공격/피격 포즈 전환 지원 */
import * as THREE from 'three';

const V = 'v0791';
const ASSETS = {
  hero:   { idle: 'hero_idle.webp',   slash: 'hero_slash.webp', hit: 'hero_hit.webp' },
  minion: { idle: 'minion_idle.webp', atk: 'minion_atk.webp' },
  heavy:  { idle: 'heavy_idle.webp',  atk: 'heavy_atk.webp' },
  stone:  { idle: 'stone_idle.webp',  atk: 'stone_atk.webp' },
  boss:   { idle: 'boss_idle.webp',   atk: 'boss_atk.webp' }
};

/* 캐릭터별 빌보드 시각 크기 보정 (무기 리치 및 탑다운 가독성 반영) */
const SCALE_MULT = {
  hero:   1.28,
  minion: 1.24,
  heavy:  1.30,
  stone:  1.28,
  boss:   1.18
};

let enabled = true;
try {
  const q = new URLSearchParams(location.search);
  const r = (q.get('render') || '').toLowerCase();
  if (r === '3d' || r === 'glb' || r === 'proc' || q.get('hd2d') === '0' || q.get('hero') === 'proc' || q.get('monsters') === 'proc') {
    enabled = false;
  }
} catch (e) {}

export function hd2dEnabled() { return enabled; }

const texLoader = new THREE.TextureLoader();
const texCache = {};
const sharedGeo = new THREE.PlaneGeometry(1, 1);
/* 발바닥(하단 중앙)을 원점 y=0으로 이동 — 바닥 그림자 및 지형 고도(다리 위 등)에 완벽 접지 */
sharedGeo.translate(0, 0.5, 0);

function getTex(filename) {
  if (!filename) return null;
  if (texCache[filename]) return texCache[filename];
  const url = new URL('../assets/hd2d/' + filename + '?v=' + V, import.meta.url).href;
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  texCache[filename] = t;
  return t;
}

export function preloadHd2dAll() {
  if (!enabled) return;
  Object.keys(ASSETS).forEach(function (sp) {
    const pack = ASSETS[sp];
    Object.keys(pack).forEach(function (k) { getTex(pack[k]); });
  });
}

function makeSpriteUnit(species, worldH) {
  const pack = ASSETS[species];
  if (!pack) return null;
  const textures = {};
  Object.keys(pack).forEach(function (k) { textures[k] = getTex(pack[k]); });

  const mat = new THREE.MeshBasicMaterial({
    map: textures.idle,
    transparent: true,
    alphaTest: 0.06,
    side: THREE.DoubleSide,
    depthWrite: true,
    color: new THREE.Color(0xffffff)
  });
  mat.userData.cardSkip = true;

  const mesh = new THREE.Mesh(sharedGeo, mat);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.renderOrder = species === 'hero' ? 6 : 4;

  const size = (worldH || 2.45) * (SCALE_MULT[species] || 1.24);
  const tiltPivot = new THREE.Group();
  /* 50도 탑다운 카메라를 향해 살짝 뒤로 눕혀서 세로 왜곡 방지 */
  tiltPivot.rotation.x = -0.36;
  tiltPivot.add(mesh);

  const holder = new THREE.Group();
  holder.name = 'hd2d_' + species;
  holder.add(tiltPivot);

  return {
    species: species,
    holder: holder,
    tiltPivot: tiltPivot,
    mesh: mesh,
    mat: mat,
    textures: textures,
    size: size,
    curPose: 'idle',
    facing: 1,
    facingDraw: 1,
    t: Math.random() * 6.28,
    walkPhase: 0,
    poseTimer: 0,
    hitFlash: 0,
    cloakTint: new THREE.Color(0xffffff),
    cloakMix: 0,
    opacity: 1,
    tint: [1, 1, 1]
  };
}

export function makeHd2dHero(height) {
  return makeSpriteUnit('hero', height || 2.45);
}

export function makeHd2dMonster(species, height) {
  return makeSpriteUnit(species, height || 2.4);
}

function setPose(U, pose) {
  const tex = U.textures[pose] || U.textures.idle;
  if (U.curPose !== pose && tex) {
    U.mat.map = tex;
    U.mat.needsUpdate = true;
    U.curPose = pose;
  }
}

export function triggerHd2dPose(U, pose, dur) {
  if (!U) return;
  if (pose === 'hit') {
    U.hitFlash = 0.14;
    if (U.textures.hit) {
      setPose(U, 'hit');
      U.poseTimer = Math.max(U.poseTimer, dur || 0.22);
    }
    return;
  }
  const key = U.textures[pose] ? pose : (U.textures.atk ? 'atk' : (U.textures.slash ? 'slash' : 'idle'));
  setPose(U, key);
  U.poseTimer = Math.max(U.poseTimer, dur || 0.26);
}

const _camDir = new THREE.Vector3();

function alignBillboard(U, parentGroup, cam) {
  let camYaw = 0;
  if (cam && typeof cam.getWorldDirection === 'function') {
    cam.getWorldDirection(_camDir);
    camYaw = Math.atan2(-_camDir.x, -_camDir.z);
  }
  const parentYaw = parentGroup ? parentGroup.rotation.y : 0;
  U.holder.rotation.y = camYaw - parentYaw;
}

export function tickHd2d(U, parentGroup, cam, opts, dt) {
  if (!U) return;
  const d = Math.min(0.05, Math.max(0.0001, dt || 0.016));
  U.t += d;
  if (U.poseTimer > 0) {
    U.poseTimer -= d;
    if (U.poseTimer <= 0) setPose(U, 'idle');
  }
  if (U.hitFlash > 0) U.hitFlash = Math.max(0, U.hitFlash - d);

  alignBillboard(U, parentGroup, cam);

  /* 이동 방향에 따른 좌우 반전 (스무스 2.5D 페이퍼 플립) */
  const vx = (opts && opts.vx) || 0;
  const speed = (opts && opts.speed) || 0;
  if (Math.abs(vx) > 0.12) {
    U.facing = vx >= 0 ? 1 : -1;
  }
  const flipK = 1 - Math.exp(-16 * d);
  U.facingDraw += (U.facing - U.facingDraw) * flipK;
  /* 정면 통과 순간 폭이 0으로 납작해지는 걸 최소화 */
  const flipX = Math.abs(U.facingDraw) < 0.18 ? (U.facing >= 0 ? 0.18 : -0.18) : U.facingDraw;

  const walking = !!(opts && opts.walking);
  let sx = 1, sy = 1, py = 0, rz = 0;

  if (U.curPose === 'slash' || U.curPose === 'atk') {
    sx = 1.13; sy = 0.94; py = 0.05;
    rz = -U.facing * 0.11;
  } else if (U.curPose === 'hit') {
    sx = 1.14; sy = 0.87;
    rz = U.facing * 0.13;
  } else if (walking) {
    U.walkPhase += d * Math.min(18, Math.max(8, 7 + speed * 2.4));
    const hop = Math.abs(Math.sin(U.walkPhase));
    py = hop * 0.15;
    sy = 0.95 + hop * 0.09;
    sx = 1.05 - hop * 0.06;
    rz = -U.facing * (0.075 + Math.sin(U.walkPhase) * 0.03);
  } else {
    const br = Math.sin(U.t * 3.1);
    sy = 1 + br * 0.026;
    sx = 1 - br * 0.015;
    rz = Math.sin(U.t * 1.55) * 0.014;
  }

  /* 게임필 스쿼시·스트레치 반영 */
  const sq = (opts && opts.squash) || 0;
  if (Math.abs(sq) > 0.001) {
    const sqY = 1 + sq;
    const sqX = 1 / Math.sqrt(Math.max(0.72, sqY));
    sx *= sqX;
    sy *= sqY;
  }

  U.mesh.scale.set(U.size * sx * flipX, U.size * sy, 1);
  U.mesh.position.set(0, py, 0);
  U.mesh.rotation.z = rz;

  /* 색상: 기본 틴트 + 치장 도포 색조 + 피격 화이트 플래시 */
  const tr = U.tint[0], tg = U.tint[1], tb = U.tint[2];
  const cm = U.cloakMix || 0;
  let r = tr * (1 - cm * 0.28) + U.cloakTint.r * cm * 0.28;
  let g = tg * (1 - cm * 0.28) + U.cloakTint.g * cm * 0.28;
  let b = tb * (1 - cm * 0.28) + U.cloakTint.b * cm * 0.28;
  if (U.hitFlash > 0) {
    const f = Math.min(1, U.hitFlash / 0.14);
    r = r + (2.0 - r) * f;
    g = g + (1.9 - g) * f;
    b = b + (1.8 - b) * f;
  }
  U.mat.color.setRGB(r, g, b);
}

export function setHd2dOpacity(U, o) {
  if (!U) return;
  U.opacity = o;
  U.mat.opacity = o;
  U.mat.depthWrite = o >= 0.92;
}

export function setHd2dTint(U, r, g, b) {
  if (!U) return;
  U.tint[0] = r; U.tint[1] = g; U.tint[2] = b;
}

export function applyHd2dCloak(U, prof) {
  if (!U || !prof) return;
  U.cloakTint.setHex(prof.tint != null ? prof.tint : 0xffffff);
  U.cloakMix = prof.mix || 0;
}

export function makeHd2dGhost(srcU, parentGroup, cam) {
  if (!srcU) return null;
  const gMat = new THREE.MeshBasicMaterial({
    map: srcU.textures.slash || srcU.textures.idle,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    side: THREE.DoubleSide,
    color: new THREE.Color(0x9be6d2)
  });
  gMat.userData.cardSkip = true;
  const mesh = new THREE.Mesh(sharedGeo, gMat);
  mesh.scale.copy(srcU.mesh.scale);
  mesh.rotation.copy(srcU.mesh.rotation);
  mesh.renderOrder = 5;

  const tilt = new THREE.Group();
  tilt.rotation.x = srcU.tiltPivot.rotation.x;
  tilt.add(mesh);

  const root = new THREE.Group();
  root.add(tilt);
  if (cam && typeof cam.getWorldDirection === 'function') {
    cam.getWorldDirection(_camDir);
    root.rotation.y = Math.atan2(-_camDir.x, -_camDir.z);
  }
  root.userData.rig = { kind: 'ghost' };
  root.userData.sprite = mesh;
  root.userData.dispose = function () { gMat.dispose(); };
  return root;
}
