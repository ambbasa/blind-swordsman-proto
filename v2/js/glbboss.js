import * as THREE from 'three';

const MODEL_URLS = {
  boss:   new URL('../assets/models/boss.glb?v=v0782', import.meta.url).href,
  minion: new URL('../assets/models/minion.glb?v=v0782', import.meta.url).href,
  heavy:  new URL('../assets/models/heavy.glb?v=v0782', import.meta.url).href,
  stone:  new URL('../assets/models/stone.glb?v=v0782', import.meta.url).href
};
const URL_BASIS = new URL('../vendor/addons/libs/basis/', import.meta.url).href;
const sources = {};
const pendings = {};
let loaderPromise = null;
let cloneSkinned = null;
let flagOn = true;
try {
  const q = new URLSearchParams(location.search);
  if (q.get('monsters') === 'proc' || q.get('boss') === 'proc' || q.get('monsters') === '0') flagOn = false;
} catch (e) {}

function ensureLoader(renderer) {
  if (loaderPromise) return loaderPromise;
  loaderPromise = Promise.all([
    import('../vendor/addons/loaders/GLTFLoader.js'),
    import('../vendor/addons/loaders/KTX2Loader.js'),
    import('../vendor/addons/libs/meshopt_decoder.module.js'),
    import('../vendor/addons/utils/SkeletonUtils.js')
  ]).then(function (m) {
    cloneSkinned = m[3].clone;
    const loader = new m[0].GLTFLoader().setMeshoptDecoder(m[2].MeshoptDecoder);
    if (renderer) {
      const ktx2 = new m[1].KTX2Loader().setTranscoderPath(URL_BASIS).detectSupport(renderer);
      loader.setKTX2Loader(ktx2);
    }
    return loader;
  }).catch(function (e) { loaderPromise = null; throw e; });
  return loaderPromise;
}

export function preloadMonsterGlb(species, renderer) {
  if (!flagOn || !MODEL_URLS[species]) return null;
  if (pendings[species]) return pendings[species];
  pendings[species] = ensureLoader(renderer).then(function (loader) {
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

export function preloadBossGlb(renderer) {
  if (!flagOn) return null;
  Object.keys(MODEL_URLS).forEach(function (sp) { preloadMonsterGlb(sp, renderer); });
  return pendings.boss || null;
}
export function bossGlbReady(species) {
  const sp = species || 'boss';
  if (!flagOn || !MODEL_URLS[sp]) return null;
  return pendings[sp] || preloadMonsterGlb(sp, null);
}

export function makeBossGlb(height, species) {
  const sp = species || 'boss';
  const gltf = sources[sp];
  if (!gltf || !cloneSkinned) return null;
  const scene = cloneSkinned(gltf.scene);
  let body = null, outline = null, tris = 0, ktx2 = false;
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
      if (mat.map && mat.map.isCompressedTexture) ktx2 = true;
      /* 무대 등불 스포트라이트에 하데스풍 텍스처 색감이 하얗게 날아가지 않도록 보정 */
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
  const mixer = new THREE.AnimationMixer(scene);
  const actions = {};
  (gltf.animations || []).forEach(function (c) { actions[c.name] = mixer.clipAction(c); });
  if (!actions.attack && actions.slash) actions.attack = actions.slash;
  ['hit', 'attack', 'slash', 'cast', 'death'].forEach(function (k) {
    if (actions[k]) { actions[k].setLoop(THREE.LoopOnce, 1); actions[k].clampWhenFinished = true; }
  });
  if (actions.idle) actions.idle.play();
  return {
    root: holder, body: body, outline: outline, bodyMeshes: bodyMeshes, outlineMeshes: outlineMeshes,
    mixer: mixer, actions: actions, cur: 'idle', lockT: 0, prevBurst: null,
    mats: bodyMeshes.concat(outlineMeshes).map(function (m) { return m.material; }),
    tris: Math.round(tris), ktx2: ktx2,
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
}
