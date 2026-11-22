import * as THREE from 'three';

const URL_GLB = new URL('../assets/models/boss.glb', import.meta.url).href;
const URL_BASIS = new URL('../vendor/addons/libs/basis/', import.meta.url).href;
const ALBEDO_K = 0.5, EMISSIVE_K = 0.3;
let pending = null, source = null, cloneSkinned = null;
let flagOn = false;
try { flagOn = new URLSearchParams(location.search).get('boss') === 'glb'; } catch (e) {}

export function preloadBossGlb(renderer) {
  if (pending || !renderer || !flagOn) return pending;
  pending = Promise.all([
    import('../vendor/addons/loaders/GLTFLoader.js'),
    import('../vendor/addons/loaders/KTX2Loader.js'),
    import('../vendor/addons/libs/meshopt_decoder.module.js'),
    import('../vendor/addons/utils/SkeletonUtils.js')
  ]).then(function (m) {
    cloneSkinned = m[3].clone;
    const ktx2 = new m[1].KTX2Loader().setTranscoderPath(URL_BASIS).detectSupport(renderer);
    const loader = new m[0].GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(m[2].MeshoptDecoder);
    return loader.loadAsync(URL_GLB).then(function (gltf) {
      source = gltf;
      ktx2.dispose();
      return gltf;
    });
  }).catch(function (e) { pending = null; throw e; });
  return pending;
}
export function bossGlbReady() { return pending; }

export function makeBossGlb(height) {
  const gltf = source;
  if (!gltf) return null;
  const scene = cloneSkinned(gltf.scene);
  let body = null, outline = null, tris = 0, ktx2 = false;
  scene.traverse(function (o) {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.material = o.material.clone();
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    if (o.material.map && o.material.map.isCompressedTexture) ktx2 = true;
    if (/outline/i.test(o.name)) outline = o; else body = o;
  });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body);
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
  gltf.animations.forEach(function (c) { actions[c.name] = mixer.clipAction(c); });
  ['hit', 'attack', 'cast', 'death'].forEach(function (k) { if (actions[k]) { actions[k].setLoop(THREE.LoopOnce, 1); actions[k].clampWhenFinished = true; } });
  if (actions.idle) actions.idle.play();
  return {
    root: holder, body: body, outline: outline, mixer: mixer, actions: actions, cur: 'idle', lockT: 0, prevBurst: null,
    mats: [body, outline].filter(Boolean).map(function (m) { return m.material; }),
    tris: Math.round(tris), ktx2: ktx2,
    bbox: [+size.x.toFixed(3), +size.y.toFixed(3), +size.z.toFixed(3)], fitScale: +k.toFixed(3)
  };
}

export function hookBossGlb(G, H) {
  const base = new THREE.Color();
  G.mats.forEach(function (m, i) {
    const mesh = i === 0 ? G.body : G.outline;
    const col = m.color.clone().multiplyScalar(ALBEDO_K), em = m.emissive.clone().multiplyScalar(EMISSIVE_K);
    mesh.onBeforeRender = function () {
      m.color.setRGB(col.r * H.tint[0], col.g * H.tint[1], col.b * H.tint[2]);
      base.copy(em);
      m.emissive.copy(H.rimCol).multiplyScalar(Math.max(0, H.rimOp - 0.20) * 0.28).add(base);
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
  G.lockT = G.actions[name].getClip().duration - (from || 0) - 0.12;
}

export function tickBossGlb(G, H, dt) {
  const enter = function (b) { return H.burst === b && G.prevBurst !== b; };
  if (H.st === 'boss:sealing' && G.actions.death) {
    if (G.cur !== 'death') once(G, 'death');
  } else if (H.glbKick || enter('hit') || enter('kneel')) once(G, 'hit');
  else if (enter('strike') && G.actions.attack) once(G, 'attack', 0.3);
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
