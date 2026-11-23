import * as THREE from 'three';
import { makeRig, tickPose } from './glbpose.js?v=v0792';
import { isExternalAnimGlb, mapGlbActions } from './glbAnimMap.js?v=v081';

const MODEL_URLS = {
  boss:   new URL('../assets/models/boss.glb?v=v081', import.meta.url).href,
  minion: new URL('../assets/models/minion.glb?v=v081', import.meta.url).href,
  heavy:  new URL('../assets/models/heavy.glb?v=v081', import.meta.url).href,
  stone:  new URL('../assets/models/stone.glb?v=v081', import.meta.url).href
};
const sources = {};
const pendings = {};
let loaderPromise = null;
let cloneSkinned = null;
let flagOn = true;
try {
  const q = new URLSearchParams(location.search);
  if (q.get('monsters') === 'proc' || q.get('boss') === 'proc' || q.get('monsters') === '0') flagOn = false;
} catch (e) {}

function ensureLoader() {
  if (loaderPromise) return loaderPromise;
  loaderPromise = Promise.all([
    import('../vendor/addons/loaders/GLTFLoader.js'),
    import('../vendor/addons/utils/SkeletonUtils.js')
  ]).then(function (m) {
    cloneSkinned = m[1].clone;
    return new m[0].GLTFLoader();
  }).catch(function (e) { loaderPromise = null; throw e; });
  return loaderPromise;
}

export function preloadMonsterGlb(species) {
  if (!flagOn || !MODEL_URLS[species]) return null;
  if (pendings[species]) return pendings[species];
  pendings[species] = ensureLoader().then(function (loader) {
    return loader.loadAsync(MODEL_URLS[species]).then(function (gltf) {
      sources[species] = gltf;
      return gltf;
    });
  }).catch(function (e) {
    console.warn('[심안] 몬스터 GLB 로드 실패:', species, e);
    pendings[species] = null;
    return null;
  });
  return pendings[species];
}

export function preloadBossGlb() {
  if (!flagOn) return null;
  Object.keys(MODEL_URLS).forEach(function (sp) { preloadMonsterGlb(sp); });
  return pendings.boss || null;
}

export function bossGlbReady(species) {
  const sp = species || 'boss';
  if (!flagOn || !MODEL_URLS[sp]) return null;
  return pendings[sp] || preloadMonsterGlb(sp);
}

export function makeBossGlb(height, species) {
  const sp = species || 'boss';
  const gltf = sources[sp];
  if (!gltf || !cloneSkinned) return null;
  const scene = cloneSkinned(gltf.scene);
  let body = null, outline = null, tris = 0;
  const bodyMeshes = [];
  const outlineMeshes = [];
  scene.traverse(function (o) {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    if (/outline/i.test(o.name)) {
      o.material = new THREE.MeshBasicMaterial({
        color: 0x09090d,
        side: THREE.FrontSide,
        depthWrite: true
      });
      outline = o;
      outlineMeshes.push(o);
    } else {
      const srcMat = Array.isArray(o.material) ? o.material[0] : o.material;
      const mat = srcMat ? srcMat.clone() : new THREE.MeshStandardMaterial({ color: 0xffffff });
      mat.roughness = 0.92;
      mat.metalness = 0.0;
      if (mat.color) mat.color.setHex(0x585654);
      if (mat.map) {
        mat.emissiveMap = mat.map;
        mat.emissive = new THREE.Color(0xffffff);
        mat.emissiveIntensity = 0.78;
      }
      o.material = mat;
      if (!body) body = o;
      bodyMeshes.push(o);
    }
  });
  scene.updateMatrixWorld(true);
  const measureTarget = body || scene;
  const box = new THREE.Box3().setFromObject(measureTarget);
  const size = box.getSize(new THREE.Vector3());
  const fit = new THREE.Group();
  const k = height / Math.max(1e-4, size.y);
  scene.scale.setScalar(k);
  scene.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
  fit.add(scene);
  const holder = new THREE.Group();
  holder.add(fit);
  /* v0.80 — Mesh2Motion/Mixamo 외부 모션 GLB 자동 감지: 외부 모션은 원본 애니메이션 그대로 재생 */
  const externalAnim = isExternalAnimGlb(scene, gltf.animations);
  const rig = externalAnim ? null : makeRig(scene);
  if (rig) rig.species = sp;

  const mixer = new THREE.AnimationMixer(scene);
  const actions = mapGlbActions(mixer, gltf.animations, sp);
  if (actions.idle) actions.idle.play();
  return {
    root: holder, body: body, outline: outline, bodyMeshes: bodyMeshes, outlineMeshes: outlineMeshes,
    mixer: mixer, actions: actions, rig: rig, cur: 'idle', lockT: 0, prevBurst: null,
    mats: bodyMeshes.concat(outlineMeshes).map(function (m) { return m.material; }),
    tris: Math.round(tris), ktx2: false,
    bbox: [+size.x.toFixed(3), +size.y.toFixed(3), +size.z.toFixed(3)], fitScale: +k.toFixed(3)
  };
}

export function hookBossGlb(G, H) {
  const base = new THREE.Color();
  (G.bodyMeshes || []).forEach(function (mesh) {
    const m = mesh.material;
    const col = m.color.clone();
    const em = m.emissive ? m.emissive.clone() : new THREE.Color(0x000000);
    mesh.onBeforeRender = function () {
      m.color.setRGB(col.r * H.tint[0], col.g * H.tint[1], col.b * H.tint[2]);
      if (m.emissive) {
        base.copy(em);
        const rimBoost = Math.max(0, (H.rimOp || 0) - 0.25) * 0.28;
        if (rimBoost > 0.001 && H.rimCol) m.emissive.copy(H.rimCol).multiplyScalar(rimBoost).add(base);
        else m.emissive.copy(base);
      }
    };
  });
}

function playOnly(G, name, fade, from) {
  const to = G.actions[name];
  if (!to) return false;
  Object.keys(G.actions).forEach(function (k) { if (G.actions[k] !== to) G.actions[k].fadeOut(fade); });
  to.reset(); to.setEffectiveTimeScale(1); to.setEffectiveWeight(1); to.fadeIn(fade); to.play();
  if (from) to.time = from;
  G.cur = name;
  return true;
}

function once(G, name, from) {
  if (!playOnly(G, name, name === 'hit' || name === 'attack' ? 0.05 : 0.15, from)) return;
  G.lockT = Math.max(0.15, G.actions[name].getClip().duration - (from || 0) - 0.10);
}

export function tickBossGlb(G, H, dt) {
  const enter = function (b) { return H.burst === b && G.prevBurst !== b; };
  if (H.st === 'boss:sealing' && G.actions.death) {
    if (G.cur !== 'death') once(G, 'death');
  } else if (H.glbKick || enter('hit') || enter('kneel')) once(G, 'hit');
  else if ((enter('strike') || enter('attack') || enter('slash')) && G.actions.attack) once(G, 'attack', 0.15);
  else if (enter('wind') && G.actions.cast) once(G, 'cast');
  H.glbKick = false;
  G.prevBurst = H.burst;
  G.lockT = (G.lockT || 0) - dt;
  if (G.cur !== 'death' && G.lockT <= 0) {
    const want = (H.base === 'walk' || H.burst === 'charge') ? 'walk' : 'idle';
    if (want !== G.cur) playOnly(G, want, 0.18);
  }
  if (G.actions.walk && H.actions.walk) G.actions.walk.setEffectiveTimeScale(H.actions.walk.getEffectiveTimeScale());
  G.mixer.update(dt);
  /* 클립 위에 절차 자세를 얹는다 — 대기·걷기·공격·피격의 실제 관절 움직임은 여기서 만든다. */
  if (G.rig) {
    let st = 'idle';
    if (G.cur === 'attack') st = 'attack';
    else if (G.cur === 'hit') st = 'hit';
    else if (G.cur === 'cast') st = 'cast';
    else if (G.cur === 'death') st = 'death';
    else if (G.cur === 'walk' || H.base === 'walk' || H.burst === 'charge') st = 'walk';
    tickPose(G.rig, dt, st, H.speed || 0);
  }
}
