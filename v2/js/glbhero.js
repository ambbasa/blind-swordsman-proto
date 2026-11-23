/* v2/js/glbhero.js — 시안 B(하데스풍 주홍 먹선 검객) 3D GLB 로더·셰이더 보정·4클립 상태 머신
   - 기본 ON (`?hero=proc` 쿼리로 구형 프로시저럴 3D 폴백 가능)
   - `Hero_Body` (1024px WebP PBR), `Hero_Outline` (수묵 먹선), `Hero_Sword` + `Hero_Sword_Outline`
   - 4종 애니메이션(idle / walk / slash / hit) + 치장 도포/무기 틴트·투명도·스쿼시 연동 */
import * as THREE from 'three';
import { makeRig, tickPose } from './glbpose.js?v=v0792';
import { isExternalAnimGlb, mapGlbActions } from './glbAnimMap.js?v=v081';

const URL_GLB = new URL('../assets/models/hero.glb?v=v081', import.meta.url).href;
let pending = null;
let source = null;
let cloneSkinned = null;
let enabled = true;
try {
  const q = new URLSearchParams(location.search);
  if (q.get('hero') === 'proc' || q.get('hero') === '0') enabled = false;
} catch (e) {}

export function heroGlbEnabled() { return enabled; }
export function heroGlbReady() { return !!source; }

export function preloadHeroGlb() {
  if (!enabled) return null;
  if (source) return Promise.resolve(source);
  if (pending) return pending;
  pending = Promise.all([
    import('../vendor/addons/loaders/GLTFLoader.js'),
    import('../vendor/addons/utils/SkeletonUtils.js')
  ]).then(function (m) {
    cloneSkinned = m[1].clone;
    const loader = new m[0].GLTFLoader();
    return loader.loadAsync(URL_GLB).then(function (gltf) {
      source = gltf;
      return gltf;
    });
  }).catch(function (e) {
    console.warn('[심안] hero.glb?v=v081', e);
    pending = null;
    return null;
  });
  return pending;
}

export function makeHeroGlb(height) {
  if (!source || !cloneSkinned) return null;
  const scene = cloneSkinned(source.scene);
  const bodyMeshes = [];
  const outlineMeshes = [];
  const swordMeshes = [];
  const allMeshes = [];
  let tris = 0;

  scene.traverse(function (o) {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    const isOutline = /outline/i.test(o.name);
    const isSword = /sword/i.test(o.name);

    if (isOutline) {
      /* 블렌더에서 이미 와인딩을 뒤집은 인버티드 헐 -> 순수 먹색 무광 단면 재질 */
      o.material = new THREE.MeshBasicMaterial({
        color: 0x09090d,
        side: THREE.FrontSide,
        depthWrite: true
      });
      outlineMeshes.push(o);
    } else {
      const srcMat = Array.isArray(o.material) ? o.material[0] : o.material;
      const mat = srcMat ? srcMat.clone() : new THREE.MeshStandardMaterial({ color: 0xffffff });
      if (isSword) {
        mat.metalness = Math.max(0.75, mat.metalness || 0);
        mat.roughness = Math.min(0.28, mat.roughness || 0.22);
        if (mat.color) {
          mat.emissive = mat.color.clone().multiplyScalar(0.32);
          mat.emissiveIntensity = 1.0;
        }
        swordMeshes.push(o);
      } else {
        /* 무대 위 등불 점광원(강도 30)에 검은 머리와 흑의가 하얗게 타지 않도록
           확산 반사는 32%로 억제하고, 하데스풍 1024px 페인팅 텍스처 색감을 자체 발광으로 선명히 유지 */
        mat.roughness = 0.92;
        mat.metalness = 0.0;
        if (mat.color) mat.color.setHex(0x545250);
        if (mat.map) {
          mat.emissiveMap = mat.map;
          mat.emissive = new THREE.Color(0xffffff);
          mat.emissiveIntensity = 0.78;
        }
        bodyMeshes.push(o);
      }
      mat.userData.baseColor = mat.color ? mat.color.clone() : new THREE.Color(0xffffff);
      mat.userData.baseEmissive = mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000);
      mat.userData.baseEmissiveInt = mat.emissiveIntensity != null ? mat.emissiveIntensity : 0.46;
      o.material = mat;
    }
    allMeshes.push(o);
  });

  /* 발바닥 y=0 접지 + 정확히 HERO_H(2.45m)로 정규화 */
  scene.updateMatrixWorld(true);
  const measureTarget = bodyMeshes[0] || scene;
  const box = new THREE.Box3().setFromObject(measureTarget);
  const size = box.getSize(new THREE.Vector3());
  const fit = new THREE.Group();
  const k = (height || 2.45) / Math.max(1e-4, size.y);
  scene.scale.setScalar(k);
  scene.position.set(
    -(box.min.x + box.max.x) * 0.5 * k,
    -box.min.y * k,
    -(box.min.z + box.max.z) * 0.5 * k
  );
  fit.add(scene);

  /* v0.80 — Mesh2Motion/Mixamo 외부 모션 GLB 자동 감지: 외부 모션은 원본 애니메이션 그대로 재생 */
  const externalAnim = isExternalAnimGlb(scene, source.animations);
  const rig = externalAnim ? null : makeRig(scene);
  if (rig) rig.species = 'hero';

  const mixer = new THREE.AnimationMixer(scene);
  const actions = mapGlbActions(mixer, source.animations, 'hero');
  if (actions.idle) {
    actions.idle.play();
    actions.idle.setEffectiveWeight(1);
  }

  return {
    fit: fit,
    scene: scene,
    mixer: mixer,
    actions: actions,
    rig: rig,
    bodyMeshes: bodyMeshes,
    outlineMeshes: outlineMeshes,
    swordMeshes: swordMeshes,
    allMeshes: allMeshes,
    cur: 'idle',
    prevBurst: null,
    lockT: 0,
    tris: Math.round(tris),
    cloakTint: new THREE.Color(0xffffff),
    cloakEmissive: new THREE.Color(0x000000),
    cloakMix: 0
  };
}

function playOnly(G, name, fade, timeScale) {
  const to = G.actions[name];
  if (!to) return false;
  Object.keys(G.actions).forEach(function (k) {
    if (G.actions[k] !== to) G.actions[k].fadeOut(fade);
  });
  to.reset();
  to.enabled = true;
  to.setEffectiveTimeScale(timeScale || 1);
  to.setEffectiveWeight(1);
  to.fadeIn(fade);
  to.play();
  G.cur = name;
  return true;
}

export function triggerHeroGlbBurst(G, name) {
  if (!G || !G.actions[name]) return;
  const ts = name === 'slash' ? 1.55 : 1.25;
  playOnly(G, name, 0.04, ts);
  const dur = G.actions[name].getClip().duration / ts;
  G.lockT = Math.max(0.18, dur - 0.06);
}

export function tickHeroGlb(G, H, dt) {
  if (!G) return;
  G.lockT = Math.max(0, (G.lockT || 0) - dt);

  if (H.burst === 'slash' && G.prevBurst !== 'slash') {
    triggerHeroGlbBurst(G, 'slash');
  } else if (H.burst === 'hit' && G.prevBurst !== 'hit') {
    triggerHeroGlbBurst(G, 'hit');
  }
  G.prevBurst = H.burst;

  if (G.lockT <= 0 && !H.burst) {
    const want = H.base === 'walk' ? 'walk' : 'idle';
    if (want !== G.cur && G.actions[want]) {
      playOnly(G, want, 0.14, 1);
    }
  }
  if (G.actions.walk && G.cur === 'walk') {
    const spd = Math.max(0.75, Math.min(2.3, (H.speed || 1.7) / 1.7));
    G.actions.walk.setEffectiveTimeScale(spd);
  }

  /* 게임필 스쿼시·스트레치 연동 */
  const sqY = 1 + (H.squash || 0);
  const sqXZ = 1 / Math.sqrt(Math.max(0.75, sqY));
  G.fit.scale.set(sqXZ, sqY, sqXZ);

  G.mixer.update(dt);
  /* 클립 위에 절차 자세를 얹는다(내장 클립의 골반·발목 키가 정지해 있어 다리가 미끄러웠다). */
  if (G.rig) {
    const st = H.burst === 'slash' ? 'attack'
      : (H.burst === 'hit' ? 'hit' : (H.base === 'walk' ? 'walk' : 'idle'));
    tickPose(G.rig, dt, st, H.speed || 0);
  }
}

export function setHeroGlbOpacity(G, o) {
  if (!G) return;
  for (let i = 0; i < G.allMeshes.length; i++) {
    const m = G.allMeshes[i].material;
    if (!m) continue;
    const needT = o < 0.999;
    if (m.transparent !== needT) { m.transparent = needT; m.needsUpdate = true; }
    m.opacity = o;
  }
}

export function setHeroGlbTint(G, r, g, b) {
  if (!G) return;
  for (let i = 0; i < G.bodyMeshes.length; i++) {
    const m = G.bodyMeshes[i].material;
    if (!m || !m.userData.baseColor) continue;
    const bc = m.userData.baseColor;
    const cm = G.cloakMix || 0;
    const tr = (bc.r * (1 - cm * 0.35) + G.cloakTint.r * cm * 0.35) * r;
    const tg = (bc.g * (1 - cm * 0.35) + G.cloakTint.g * cm * 0.35) * g;
    const tb = (bc.b * (1 - cm * 0.35) + G.cloakTint.b * cm * 0.35) * b;
    m.color.setRGB(tr, tg, tb);
  }
}

export function applyHeroGlbCloak(G, prof, forgeLv) {
  if (!G || !prof) return;
  G.cloakTint.setHex(prof.tint != null ? prof.tint : 0xffffff);
  G.cloakEmissive.setHex(prof.emissive != null ? prof.emissive : 0x000000);
  G.cloakMix = prof.mix || 0;
  const flv = Math.max(0, Math.min(3, forgeLv | 0));
  for (let i = 0; i < G.bodyMeshes.length; i++) {
    const m = G.bodyMeshes[i].material;
    if (!m) continue;
    m.emissiveIntensity = (m.userData.baseEmissiveInt || 0.46) + flv * 0.04;
  }
  for (let i = 0; i < G.swordMeshes.length; i++) {
    const m = G.swordMeshes[i].material;
    if (!m || !m.userData.baseEmissive) continue;
    m.emissive.copy(m.userData.baseEmissive);
    if (flv > 0) m.emissive.lerp(new THREE.Color(prof.rimCol || 0xffe4ad), flv * 0.16);
  }
  setHeroGlbTint(G, 1, 1, 1);
}
