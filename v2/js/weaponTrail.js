/* v2/js/weaponTrail.js — v0.85 실시간 3D 검날 리본 궤적(Weapon Trail) + 무기 끝 패링 전조 섬광(Glint)
   - Zero-GC 사전 할당 링버퍼(14세그먼트), Three.js r170 네이티브 BufferGeometry
   - 주인공 환도(1·2·3타 색변화) / 보스 언월도(횡베기·내려찍기) / 중갑 철퇴에 공용 적용 */
import * as THREE from 'three';

const SEGMENTS = 14;
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _invM = new THREE.Matrix4();

function makeGlintTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0.0, 'rgba(255,252,235,1)');
  g.addColorStop(0.22, 'rgba(255,220,130,0.92)');
  g.addColorStop(0.55, 'rgba(255,96,64,0.35)');
  g.addColorStop(1.0, 'rgba(255,60,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  /* 십자 별빛 */
  ctx.strokeStyle = 'rgba(255,250,225,0.95)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(4, 32); ctx.lineTo(60, 32);
  ctx.moveTo(32, 4); ctx.lineTo(32, 60);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

let sharedGlintTex = null;

/**
 * @param {THREE.Object3D} rootParent  트레일 메시가 붙을 상위 루트(예: fit 또는 holder)
 * @param {THREE.Object3D} anchorBone  추적할 손 본(hand_r)
 * @param {object} opts { baseLocal, tipLocal, color, opacity }
 */
export function createWeaponTrail(rootParent, anchorBone, opts) {
  if (!rootParent || !anchorBone) return null;
  const o = opts || {};
  const baseL = (o.baseLocal || new THREE.Vector3(0, 0.15, 0)).clone();
  const tipL = (o.tipLocal || new THREE.Vector3(0, 1.05, 0)).clone();

  const vertCount = (SEGMENTS + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 4);
  const indices = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geo.setIndex(indices);

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: o.opacity != null ? o.opacity : 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 18;
  rootParent.add(mesh);

  /* 패링 전조 섬광 스프라이트 */
  if (!sharedGlintTex) sharedGlintTex = makeGlintTexture();
  const glintMat = new THREE.SpriteMaterial({
    map: sharedGlintTex,
    color: o.glintColor != null ? o.glintColor : 0xffd27a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const glint = new THREE.Sprite(glintMat);
  glint.visible = false;
  glint.renderOrder = 22;
  rootParent.add(glint);

  const ring = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    ring.push({ a: new THREE.Vector3(), b: new THREE.Vector3(), life: 0 });
  }

  return {
    rootParent: rootParent,
    anchorBone: anchorBone,
    baseL: baseL,
    tipL: tipL,
    mesh: mesh,
    geo: geo,
    mat: mat,
    glint: glint,
    glintMat: glintMat,
    ring: ring,
    head: 0,
    active: false,
    color: new THREE.Color(o.color != null ? o.color : 0xeaf6ff),
    tailColor: new THREE.Color(o.tailColor != null ? o.tailColor : 0x5be8c4),
    glintT: 0,
    glintDur: 0.22,
    glintScale: o.glintScale || 1.15
  };
}

export function setTrailStyle(T, headHex, tailHex) {
  if (!T) return;
  if (headHex != null) T.color.setHex(headHex);
  if (tailHex != null) T.tailColor.setHex(tailHex);
}

export function flashWeaponGlint(T, hex, dur) {
  if (!T) return;
  if (hex != null) T.glintMat.color.setHex(hex);
  T.glintDur = dur || 0.24;
  T.glintT = T.glintDur;
  T.glint.visible = true;
}

export function updateWeaponTrail(T, dt, emitting) {
  if (!T) return;
  T.rootParent.updateMatrixWorld(true);
  _invM.copy(T.rootParent.matrixWorld).invert();

  _vA.copy(T.baseL).applyMatrix4(T.anchorBone.matrixWorld).applyMatrix4(_invM);
  _vB.copy(T.tipL).applyMatrix4(T.anchorBone.matrixWorld).applyMatrix4(_invM);

  /* 1) 패링 전조 섬광 업데이트 */
  if (T.glintT > 0) {
    T.glintT = Math.max(0, T.glintT - dt);
    const k = T.glintT / Math.max(0.01, T.glintDur);
    const pulse = Math.sin(k * Math.PI);
    T.glint.position.copy(_vB);
    const sc = T.glintScale * (0.45 + 0.95 * pulse);
    T.glint.scale.set(sc, sc, 1);
    T.glintMat.opacity = Math.min(1, pulse * 1.25);
    T.glint.visible = T.glintT > 0.001;
  } else if (T.glint.visible) {
    T.glint.visible = false;
  }

  /* 2) 리본 링버퍼 시프트 & 감쇠 */
  let anyAlive = false;
  for (let i = SEGMENTS; i > 0; i--) {
    const prev = T.ring[i - 1];
    const cur = T.ring[i];
    cur.a.copy(prev.a);
    cur.b.copy(prev.b);
    cur.life = Math.max(0, prev.life - dt * 6.8);
    if (cur.life > 0.01) anyAlive = true;
  }
  if (emitting) {
    T.ring[0].a.copy(_vA);
    T.ring[0].b.copy(_vB);
    T.ring[0].life = 1.0;
    anyAlive = true;
  } else {
    T.ring[0].a.copy(_vA);
    T.ring[0].b.copy(_vB);
    T.ring[0].life = Math.max(0, T.ring[0].life - dt * 9.5);
    if (T.ring[0].life > 0.01) anyAlive = true;
  }

  T.mesh.visible = anyAlive;
  if (!anyAlive) return;

  const pos = T.geo.attributes.position.array;
  const col = T.geo.attributes.color.array;
  for (let i = 0; i <= SEGMENTS; i++) {
    const r = T.ring[i];
    const f = 1 - i / SEGMENTS;
    const alpha = Math.max(0, Math.min(1, r.life * f * f));
    const cr = T.tailColor.r + (T.color.r - T.tailColor.r) * f;
    const cg = T.tailColor.g + (T.color.g - T.tailColor.g) * f;
    const cb = T.tailColor.b + (T.color.b - T.tailColor.b) * f;

    const pIdx = i * 6;
    pos[pIdx]     = r.a.x; pos[pIdx + 1] = r.a.y; pos[pIdx + 2] = r.a.z;
    pos[pIdx + 3] = r.b.x; pos[pIdx + 4] = r.b.y; pos[pIdx + 5] = r.b.z;

    const cIdx = i * 8;
    col[cIdx]     = cr; col[cIdx + 1] = cg; col[cIdx + 2] = cb; col[cIdx + 3] = alpha * 0.35;
    col[cIdx + 4] = cr; col[cIdx + 5] = cg; col[cIdx + 6] = cb; col[cIdx + 7] = alpha;
  }
  T.geo.attributes.position.needsUpdate = true;
  T.geo.attributes.color.needsUpdate = true;
}
