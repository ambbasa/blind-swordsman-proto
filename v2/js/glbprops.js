/* Shared, static GLB scenery. Layout and collision stay owned by the authored slot. */
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const sources = new Map();
const ramp = new THREE.DataTexture(new Uint8Array([80,80,80,255, 168,168,168,255, 245,245,245,255]), 3, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;

function loadModel(file) {
  if (!sources.has(file)) {
    const url = new URL('../assets/models/props/' + file + '?v=v173', import.meta.url);
    const promise = loader.loadAsync(url.href).then(({ scene }) => {
      const materials = new Map();
      function inkMaterial(source) {
        if (!materials.has(source)) {
          const mat = new THREE.MeshToonMaterial({
            map: source.map, color: source.color, vertexColors: source.vertexColors,
            gradientMap: ramp, transparent: source.transparent, opacity: source.opacity,
            alphaTest: source.alphaTest, side: source.side, emissive: source.emissive,
            emissiveMap: source.emissiveMap
          });
          materials.set(source, mat);
        }
        return materials.get(source);
      }
      scene.traverse(node => {
        if (!node.isMesh) return;
        node.material = Array.isArray(node.material) ? node.material.map(inkMaterial) : inkMaterial(node.material);
      });
      materials.forEach((_, original) => original.dispose());
      const bounds = new THREE.Box3().setFromObject(scene);
      const height = bounds.max.y - bounds.min.y;
      if (!(height > 0)) throw new Error('empty scenery model');
      return { scene, height, center: bounds.getCenter(new THREE.Vector3()), base: bounds.min.y };
    }).catch(error => {
      sources.delete(file);
      console.warn('[심안] 지형 대체 모델 대신 기존 기물 사용:', file, error);
      return null;
    });
    sources.set(file, promise);
  }
  return sources.get(file);
}

export function loadPropModel(file) {
  return loadModel(file);
}

export function attachSlotModels(group, slots) {
  let disposed = false;
  const procedural = ['0', 'proc'].includes(new URLSearchParams(location.search).get('props'));
  if (!procedural) for (const slot of slots) {
    if (!slot.spec?.model) continue;
    loadModel(slot.spec.model).then(asset => {
      if (!asset || disposed) return;
      const holder = new THREE.Group();
      holder.name = 'scenery-' + slot.key;
      holder.position.set(slot.x, slot.key === 'skyLantern' ? 2.6 : 0, slot.z);
      holder.rotation.y = slot.yaw;
      holder.scale.setScalar((slot.height || slot.spec.height) / asset.height);
      const model = asset.scene.clone();
      model.position.sub(new THREE.Vector3(asset.center.x, asset.base, asset.center.z));
      holder.add(model);
      group.add(holder);
      slot.bone.scale.setScalar(0.00001);
    });
  }
  return { dispose() { disposed = true; } };
}
