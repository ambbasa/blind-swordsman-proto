/* v2/js/glbprops.js — v1.45 정적 3D 지형지물(GLB) 프리로드·인스턴스 배치 */
import * as THREE from 'three';
import { mulberry } from './inkbake.js';

const PROP_URLS = {
  shrine:       new URL('../assets/models/props/shrine.glb?v=v146', import.meta.url).href,
  rock_cluster: new URL('../assets/models/props/rock_cluster.glb?v=v146', import.meta.url).href,
  lantern:      new URL('../assets/models/props/lantern.glb?v=v146', import.meta.url).href,
  pine_tree:    new URL('../assets/models/props/pine_tree.glb?v=v146', import.meta.url).href
};

const ACT_TINTS = {
  1: { col: 0xd8dfd4, em: 0x221c14, emInt: 0.25 },
  2: { col: 0xcfe2f5, em: 0x122233, emInt: 0.25 },
  3: { col: 0xdfc2c0, em: 0x381210, emInt: 0.35 },
  4: { col: 0xc2ccd6, em: 0x18222c, emInt: 0.28 }
};

/* 막별 외곽 배치 프리셋: 구형 절벽/사당을 대체해 신규 4종 GLB만으로 아레나 외곽을 통일감 있게 구성 */
const ACT_PRESETS = {
  1: { shrine: 3, pine_tree: 8, lantern: 6, rock_cluster: 9 },
  2: { shrine: 3, pine_tree: 6, lantern: 6, rock_cluster: 10 },
  3: { shrine: 3, pine_tree: 5, lantern: 6, rock_cluster: 10 },
  4: { shrine: 3, pine_tree: 6, lantern: 6, rock_cluster: 10 }
};

const sources = {};
const pendings = {};
let loaderPromise = null;
let flagOn = true;

try {
  const q = new URLSearchParams(location.search);
  if (q.get('props') === '0' || q.get('props') === 'proc') flagOn = false;
} catch (_) {}

export function glbPropsEnabled() {
  return flagOn;
}

function ensureLoader() {
  if (loaderPromise) return loaderPromise;
  loaderPromise = import('../vendor/addons/loaders/GLTFLoader.js')
    .then(function (m) { return new m.GLTFLoader(); })
    .catch(function (e) { loaderPromise = null; throw e; });
  return loaderPromise;
}

function extractPropAsset(gltf) {
  let picked = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(function (o) {
    if (!picked && o.isMesh && o.geometry) picked = o;
  });
  if (!picked) return null;
  const geo = picked.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const minY = geo.boundingBox ? geo.boundingBox.min.y : 0;
  return { geometry: geo, material: picked.material, minY: minY };
}

export function preloadPropGlb(key) {
  if (!flagOn || !PROP_URLS[key]) return null;
  if (pendings[key]) return pendings[key];
  pendings[key] = ensureLoader().then(function (loader) {
    return loader.loadAsync(PROP_URLS[key]).then(function (gltf) {
      const asset = extractPropAsset(gltf);
      if (asset) sources[key] = asset;
      return asset;
    });
  }).catch(function (e) {
    console.warn('[심안] 지형지물 GLB 로드 실패:', key, e);
    pendings[key] = null;
    return null;
  });
  return pendings[key];
}

export function preloadArenaProps() {
  if (!flagOn) return Promise.resolve([]);
  return Promise.all(Object.keys(PROP_URLS).map(preloadPropGlb));
}

function buildPlacements(opts) {
  const actNo = opts.actNo || 1;
  const arenaR = opts.arenaRadius || 22.0;
  const stageId = opts.stageId || 1;
  const rnd = mulberry(((opts.seed || 20261120) ^ (stageId * 4999) ^ (actNo * 131)) >>> 0);
  const preset = ACT_PRESETS[actNo] || ACT_PRESETS[1];
  const byType = { shrine: [], pine_tree: [], lantern: [], rock_cluster: [] };
  const placed = [];

  /* 카메라(+x, +z) 기준 정면 상단(-x, -z: -135deg)이 중앙 배경 초점 */
  const backAngle = -Math.PI * 0.75;
  function tryAdd(type, ang, rMin, rMax, scaleMin, scaleMax, minSep) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = ang + (attempt === 0 ? 0 : (rnd() - 0.5) * 0.38);
      const r = rMin + rnd() * (rMax - rMin);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      let ok = true;
      for (let i = 0; i < placed.length; i++) {
        const p = placed[i];
        if (Math.hypot(x - p.x, z - p.z) < Math.max(minSep, p.sep)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const s = scaleMin + rnd() * (scaleMax - scaleMin);
      const ry = type === 'shrine'
        ? Math.atan2(-x, -z) + (rnd() - 0.5) * 0.18
        : rnd() * Math.PI * 2;
      const item = { x: x, z: z, s: s, ry: ry, sep: minSep };
      placed.push(item);
      byType[type].push(item);
      return true;
    }
    return false;
  }

  /* 1) 사당(shrine): 중앙 상단 메인 사당 1채(대형) + 좌우 대칭 2채 */
  const shrineSlots = [
    { off: 0.0,   rMin: arenaR - 1.2, rMax: arenaR - 0.4, sMin: 1.12, sMax: 1.22 },
    { off: -0.68, rMin: arenaR - 1.0, rMax: arenaR + 0.6, sMin: 0.92, sMax: 1.04 },
    { off: 0.68,  rMin: arenaR - 1.0, rMax: arenaR + 0.6, sMin: 0.92, sMax: 1.04 }
  ];
  const shrineCount = Math.min(shrineSlots.length, preset.shrine || 0);
  for (let i = 0; i < shrineCount; i++) {
    const sl = shrineSlots[i];
    tryAdd('shrine', backAngle + sl.off + (rnd() - 0.5) * 0.08, sl.rMin, sl.rMax, sl.sMin, sl.sMax, 5.4);
  }

  /* 2) 소나무(pine_tree): 사당 뒤·좌우 외곽 링 */
  const pineCount = preset.pine_tree || 0;
  for (let i = 0; i < pineCount; i++) {
    const span = Math.PI * 1.65;
    const ang = backAngle - span * 0.5 + (pineCount > 1 ? (i / (pineCount - 1)) * span : 0);
    tryAdd('pine_tree', ang + (rnd() - 0.5) * 0.18, arenaR + 0.4, arenaR + 2.6, 0.95, 1.28, 4.2);
  }

  /* 3) 석등(lantern): 전장 안쪽 둘레 및 사당 앞 좌우 균등 배치 */
  const lanternCount = preset.lantern || 0;
  for (let i = 0; i < lanternCount; i++) {
    const ang = backAngle + 0.28 + (i / Math.max(1, lanternCount)) * Math.PI * 2 + (rnd() - 0.5) * 0.20;
    tryAdd('lantern', ang, arenaR - 3.2, arenaR - 1.2, 0.92, 1.12, 3.2);
  }

  /* 4) 바위군(rock_cluster): 구형 외곽 절벽 링을 대체하는 자연스러운 외곽 바위 테두리 */
  const rockCount = preset.rock_cluster || 0;
  for (let i = 0; i < rockCount; i++) {
    const ang = backAngle + 0.16 + (i / Math.max(1, rockCount)) * Math.PI * 2 + (rnd() - 0.5) * 0.22;
    tryAdd('rock_cluster', ang, arenaR + 0.6, arenaR + 3.2, 1.05, 1.48, 3.8);
  }

  return byType;
}

function createPropMaterial(baseMat, type, actNo) {
  const tint = ACT_TINTS[actNo] || ACT_TINTS[1];
  const mat = baseMat ? baseMat.clone() : new THREE.MeshStandardMaterial({ color: 0x888888 });
  mat.fog = true;
  if (mat.color) mat.color.multiply(new THREE.Color(tint.col));
  if (type === 'lantern') {
    mat.emissive = new THREE.Color(tint.em);
    mat.emissiveIntensity = tint.emInt;
  }
  mat.roughness = Math.max(0.65, mat.roughness != null ? mat.roughness : 0.85);
  mat.metalness = Math.min(0.15, mat.metalness != null ? mat.metalness : 0.05);
  mat.userData.cardProfile = 'paper';
  return mat;
}

export function attachGlbArenaProps(parentGroup, opts) {
  if (!flagOn || !parentGroup) return null;
  opts = opts || {};
  const actNo = opts.actNo || 1;
  const placements = buildPlacements(opts);
  const container = new THREE.Group();
  container.name = 'arena-glb-props';
  parentGroup.add(container);

  const dummy = new THREE.Object3D();
  const created = [];

  function mountType(type, asset) {
    if (!asset || !container.parent || parentGroup.userData._disposed) return;
    const list = placements[type];
    if (!list || !list.length) return;
    const mat = createPropMaterial(asset.material, type, actNo);
    const mesh = new THREE.InstancedMesh(asset.geometry, mat, list.length);
    mesh.name = 'glb-prop-' + type;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      dummy.position.set(p.x, -asset.minY * p.s - 0.03, p.z);
      dummy.rotation.set(0, p.ry, 0);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    container.add(mesh);
    created.push({ mesh: mesh, mat: mat });
  }

  preloadArenaProps().then(function () {
    if (!container.parent || parentGroup.userData._disposed) return;
    Object.keys(PROP_URLS).forEach(function (type) {
      if (sources[type]) mountType(type, sources[type]);
    });
  }).catch(function () {});

  return {
    group: container,
    dispose: function () {
      parentGroup.userData._disposed = true;
      for (let i = 0; i < created.length; i++) {
        if (created[i].mat && created[i].mat.dispose) created[i].mat.dispose();
        if (created[i].mesh && created[i].mesh.dispose) created[i].mesh.dispose();
      }
      created.length = 0;
    }
  };
}
