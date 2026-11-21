/* 일섬 검기: 바닥 궤적 위에 세운 3D 먹 리본 아크.
   같은 먹 셰이더(inkSlashMaterial)를 쓰되 정점을 호로 휘어 세워, 돌진 궤적이
   화면 안에서 입체적으로 치솟는다. */
import * as THREE from 'three';
import { createInkSlashMaterial } from '../../assets/v2/fx-ink/code/inkSlashMaterial.js';
import { getActTheme3D } from './modules/actTheme3d.js';

export function createSlashArc({ from, to, height = 1.55, width = 0.62, elem = null, coreGain = 1.8, life = 0.6, seed, actNo = null }) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.max(0.2, Math.hypot(dx, dz));
  const ux = dx / len, uz = dz / len;
  const nx = -uz, nz = ux;
  const N = 28;
  const pos = new Float32Array((N + 1) * 2 * 3);
  const uv = new Float32Array((N + 1) * 2 * 2);
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const cx = from.x + dx * t, cz = from.z + dz * t;
    const arc = Math.pow(Math.sin(Math.PI * t), 0.82);
    const relief = elem === 'ice' ? Math.abs(Math.sin(4 * Math.PI * t)) * 0.28 :
      elem === 'lightning' ? Math.sin(9 * Math.PI * t) * 0.22 :
      elem === 'fire' ? Math.sin(3 * Math.PI * t) * 0.24 : 0;
    const h = arc * relief + 0.16 + height * arc * (0.76 + 0.24 * Math.sin(Math.PI * Math.min(1, t * 1.1)));
    /* v0.60 부드러운 유선형 베기 호 + 끝단 날카로운 붓끝 테이퍼 */
    const sweep = Math.sin(Math.PI * t) * 0.42;
    const lean = arc * 0.38;
    const taper = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.94 + 0.03)), 0.72);
    const w = width * (0.14 + 1.08 * taper);
    const bx = cx + lean * 0.707 + nx * sweep, bz = cz + lean * 0.707 + nz * sweep;
    const i6 = i * 6, i4 = i * 4;
    pos[i6] = bx - nx * w * 0.5; pos[i6 + 1] = h; pos[i6 + 2] = bz - nz * w * 0.5;
    pos[i6 + 3] = bx + nx * w * 0.5; pos[i6 + 4] = h; pos[i6 + 5] = bz + nz * w * 0.5;
    uv[i4] = 0; uv[i4 + 1] = t;
    uv[i4 + 2] = 1; uv[i4 + 3] = t;
    if (i < N) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const actTheme = (!elem && actNo != null) ? getActTheme3D(actNo) : null;
  const material = createInkSlashMaterial({ elem: elem, color: actTheme ? actTheme.slashCore : undefined, aspect: len / Math.max(0.2, width), coreGain: coreGain, seed: seed != null ? seed : Math.random() * 100 });
  if (actTheme && material.uniforms && material.uniforms.uHot && material.uniforms.uHot.value) {
    material.uniforms.uHot.value.set(actTheme.slashHot);
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  let t = 0;
  return {
    mesh: mesh, material: material,
    update(dt) {
      t += dt;
      material.uniforms.uTime.value += dt;
      material.uniforms.uProgress.value = Math.min(1, t / life);
      return t < life;
    },
    dispose() { material.dispose(); geo.dispose(); }
  };
}
