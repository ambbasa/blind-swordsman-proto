/* 일섬 검기: 바닥 궤적 위에 세운 3D 먹 리본 아크.
   같은 먹 셰이더(inkSlashMaterial)를 쓰되 정점을 호로 휘어 세워, 돌진 궤적이
   화면 안에서 입체적으로 치솟는다.
   v0.72: 8슬롯 오브젝트 풀링(Zero-GC 재사용) 적용 — 연속 일섬 시 BufferGeometry/ShaderMaterial 생성·파괴 스파이크 제거. */
import * as THREE from 'three';
import { createInkSlashMaterial } from '../../assets/v2/fx-ink/code/inkSlashMaterial.js';
import { getActTheme3D } from './modules/actTheme3d.js';

const SEG_N = 24;
const POOL_CAP = 8;
const _arcPool = [];
const _sharedIdx = (function () {
  const idx = [];
  for (let i = 0; i < SEG_N; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return idx;
})();
const _sharedUv = (function () {
  const uv = new Float32Array((SEG_N + 1) * 2 * 2);
  for (let i = 0; i <= SEG_N; i++) {
    const t = i / SEG_N, i4 = i * 4;
    uv[i4] = 0; uv[i4 + 1] = t;
    uv[i4 + 2] = 1; uv[i4 + 3] = t;
  }
  return uv;
})();

function acquireArcSlot() {
  for (let i = 0; i < _arcPool.length; i++) {
    if (!_arcPool[i].inUse) {
      _arcPool[i].inUse = true;
      return _arcPool[i];
    }
  }
  if (_arcPool.length < POOL_CAP) {
    const pos = new Float32Array((SEG_N + 1) * 2 * 3);
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(_sharedUv, 2));
    geo.setIndex(_sharedIdx);
    const material = createInkSlashMaterial({ elem: null, aspect: 4, coreGain: 1.5, seed: 1 });
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = 6;
    mesh.frustumCulled = false;
    const slot = { inUse: true, pos, posAttr, geo, material, mesh };
    _arcPool.push(slot);
    return slot;
  }
  /* 풀이 꽉 찬 경우 가장 오래된 슬롯 재활용 */
  const oldest = _arcPool[0];
  oldest.inUse = true;
  return oldest;
}

const ELEM_CORE = { ice: 0x92ebff, fire: 0xff7038, poison: 0xc27aff, lightning: 0x86c4ff };
const ELEM_HOT  = { ice: 0xe8fbff, fire: 0xffe49c, poison: 0xf2d8ff, lightning: 0xf4f9ff };

export function createSlashArc({ from, to, height = 1.55, width = 0.62, elem = null, coreGain = 1.8, life = 0.6, seed, actNo = null, trailColor = null, trailHot = null, forgeLv = 0 }) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.max(0.2, Math.hypot(dx, dz));
  const ux = dx / len, uz = dz / len;
  const nx = -uz, nz = ux;
  const slot = acquireArcSlot();
  const pos = slot.pos;

  for (let i = 0; i <= SEG_N; i++) {
    const t = i / SEG_N;
    const cx = from.x + dx * t, cz = from.z + dz * t;
    const arc = Math.pow(Math.sin(Math.PI * t), 0.82);
    const relief = elem === 'ice' ? Math.abs(Math.sin(4 * Math.PI * t)) * 0.28 :
      elem === 'lightning' ? Math.sin(9 * Math.PI * t) * 0.22 :
      elem === 'fire' ? Math.sin(3 * Math.PI * t) * 0.24 : 0;
    const h = arc * relief + 0.16 + height * arc * (0.76 + 0.24 * Math.sin(Math.PI * Math.min(1, t * 1.1)));
    const sweep = Math.sin(Math.PI * t) * 0.42;
    const lean = arc * 0.38;
    const taper = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.94 + 0.03)), 0.72);
    const w = width * (0.14 + 1.08 * taper);
    const bx = cx + lean * 0.707 + nx * sweep, bz = cz + lean * 0.707 + nz * sweep;
    const i6 = i * 6;
    pos[i6]     = bx - nx * w * 0.5; pos[i6 + 1] = h; pos[i6 + 2] = bz - nz * w * 0.5;
    pos[i6 + 3] = bx + nx * w * 0.5; pos[i6 + 4] = h; pos[i6 + 5] = bz + nz * w * 0.5;
  }
  slot.posAttr.needsUpdate = true;

  const actTheme = (!elem && actNo != null) ? getActTheme3D(actNo) : null;
  const resolvedColor = elem ? (ELEM_CORE[elem] || 0xf4e8d2)
    : (trailColor != null ? trailColor : (actTheme ? actTheme.slashCore : 0xf4e8d2));
  const resolvedHot = elem ? (ELEM_HOT[elem] || 0xfff8e6)
    : (trailHot != null ? trailHot : (actTheme ? actTheme.slashHot : 0xfff8e6));
  const resolvedGain = coreGain * (1 + Math.max(0, Math.min(3, forgeLv | 0)) * 0.14);

  const u = slot.material.uniforms;
  if (u) {
    if (u.uCoreColor && u.uCoreColor.value) u.uCoreColor.value.set(resolvedColor);
    if (u.uHot && u.uHot.value) u.uHot.value.set(resolvedHot);
    if (u.uAspect) u.uAspect.value = len / Math.max(0.2, width);
    if (u.uCoreGain) u.uCoreGain.value = resolvedGain;
    if (u.uSeed) u.uSeed.value = seed != null ? seed : Math.random() * 100;
    if (u.uTime) u.uTime.value = 0;
    if (u.uProgress) u.uProgress.value = 0;
  }
  slot.mesh.visible = true;

  let t = 0;
  return {
    mesh: slot.mesh,
    material: slot.material,
    update(dt) {
      t += dt;
      if (u && u.uTime) u.uTime.value += dt;
      if (u && u.uProgress) u.uProgress.value = Math.min(1, t / life);
      return t < life;
    },
    dispose() {
      slot.mesh.visible = false;
      slot.inUse = false;
    }
  };
}
