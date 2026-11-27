import * as THREE from 'three';
import { applyForgedMetal, getMetalStudioEnv } from './modules/metalStudioEnv.js';
import { makeRig, tickPose } from './glbpose.js?v=v170';
import { isExternalAnimGlb, mapGlbActions } from './glbAnimMap.js?v=v170';
import { createWeaponTrail, setTrailStyle, flashWeaponGlint, updateWeaponTrail, disposeWeaponTrail } from './weaponTrail.js?v=v170';

const MODEL_URLS = {
  boss:      new URL('../assets/models/boss.glb?v=v170', import.meta.url).href,
  boss_act2: new URL('../assets/models/boss_act2.glb?v=v170', import.meta.url).href,
  boss_act3: new URL('../assets/models/boss_act3.glb?v=v170', import.meta.url).href,
  boss_act4: new URL('../assets/models/boss_act4.glb?v=v170', import.meta.url).href,
  minion:    new URL('../assets/models/minion.glb?v=v170', import.meta.url).href,
  heavy:     new URL('../assets/models/heavy.glb?v=v170', import.meta.url).href,
  stone:     new URL('../assets/models/stone.glb?v=v170', import.meta.url).href
};
function isBossSp(sp) { return sp === 'boss' || sp === 'boss_act2' || sp === 'boss_act3' || sp === 'boss_act4'; }
const BOSS_WEAPON_FX = {
  boss:      { em: 0x3a1614, col: 0xffd27a, tail: 0xd92b24, glint: 0xff5a3c },
  boss_act2: { em: 0x163448, col: 0x9cf0ff, tail: 0x2a78b8, glint: 0x62d6ff },
  boss_act3: { em: 0x481010, col: 0xff8c66, tail: 0xc81818, glint: 0xff3a24 },
  boss_act4: { em: 0x3a2448, col: 0xffe07a, tail: 0x7a24c8, glint: 0xffcf54 }
};
const _impactWp = new THREE.Vector3();
const sources = {};
const boundsCache = {};
const pendings = {};
let loaderPromise = null;
let cloneSkinned = null;
let flagOn = true;
let showOutline = false;
try {
  const q = new URLSearchParams(location.search);
  if (q.get('monsters') === 'proc' || q.get('boss') === 'proc' || q.get('monsters') === '0') flagOn = false;
  if (q.get('outline') === '1') showOutline = true;
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
  const p1 = Promise.all([preloadMonsterGlb('minion'), preloadMonsterGlb('heavy')]);
  p1.then(function () {
    preloadMonsterGlb('stone');
    preloadMonsterGlb('boss');
  });
  return pendings.boss || p1;
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
    o.userData.sharedGeom = true;
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    if (/outline/i.test(o.name)) {
      o.material = new THREE.MeshBasicMaterial({
        color: 0x050709,
        side: THREE.FrontSide,
        depthWrite: true
      });
      o.visible = showOutline;
      outline = o;
      outlineMeshes.push(o);
    } else {
      const srcMat = Array.isArray(o.material) ? o.material[0] : o.material;
      const mat = srcMat ? srcMat.clone() : new THREE.MeshStandardMaterial({ color: 0xffffff });
      const isWeapon = /weapon/i.test(o.name);
      if (isWeapon) {
        /* v1.04 3d-metal-material: 1~4막 보스 전용 무기·중장 철퇴 진성 도체 강철 PBR + PMREM HDR 스튜디오 반사 */
        const bossSp = isBossSp(sp);
        const wfx = BOSS_WEAPON_FX[sp] || BOSS_WEAPON_FX.boss;
        mat.roughness = bossSp ? 0.22 : 0.30;
        mat.metalness = 1.0;
        mat.color.setRGB(0.56, 0.57, 0.58, THREE.LinearSRGBColorSpace);
        mat.emissive = new THREE.Color(bossSp ? wfx.em : 0x221a14);
        mat.emissiveIntensity = 0.30;
        o.userData._forgedWeapon = true;
        o.onBeforeRender = function (r) {
          if (!mat.envMap && r) applyForgedMetal(mat, r, { roughness: bossSp ? 0.22 : 0.30, envMapIntensity: 0.94 });
        };
      } else {
        /* v1.63 엠버 앤 블레이드식 무선 + 2단 하드 툰 색면 + 절제된 백은 그래픽 림 (주인공보다 약하게 유지) */
        const bossSp = isBossSp(sp);
        mat.roughness = 0.95;
        mat.metalness = 0.0;
        mat.roughnessMap = null;
        mat.metalnessMap = null;
        mat.envMap = null;
        mat.envMapIntensity = 0.0;
        if (mat.color) mat.color.setHex(0xffffff);
        if (mat.map) {
          mat.emissiveMap = mat.map;
          mat.emissive = new THREE.Color(0xfff6ea);
          mat.emissiveIntensity = 0.03;
        }
        const rimPow = bossSp ? 0.22 : 0.12;
        mat.customProgramCacheKey = function () { return bossSp ? 'boss-ember-hardrim-v163' : 'mob-ember-hardrim-v163'; };
        mat.onBeforeCompile = function (shader) {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <dithering_fragment>",
            "vec3 vn = normalize(vNormal);\n" +
            "vec3 vv = normalize(vViewPosition);\n" +
            "float ndl = dot(vn, normalize(vec3(-0.55, 0.65, 0.52)));\n" +
            "float toonBand = smoothstep(-0.08, 0.08, ndl);\n" +
            "gl_FragColor.rgb *= mix(vec3(0.74, 0.77, 0.85), vec3(0.98, 0.97, 0.95), toonBand);\n" +
            "float fres = 1.0 - clamp(abs(dot(vn, vv)), 0.0, 1.0);\n" +
            "float rimSide = smoothstep(-0.08, 0.38, dot(vn, normalize(vec3(-0.82, 0.45, 0.25))));\n" +
            "float hardRim = smoothstep(0.60, 0.69, fres) * rimSide;\n" +
            "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.86, 0.91, 0.96), hardRim * " + rimPow.toFixed(2) + ");\n" +
            "gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(0.95));\n" +
            "#include <dithering_fragment>"
          );
        };
      }
      o.material = mat;
      if (!body) body = o;
      o.castShadow = true;
      bodyMeshes.push(o);
    }
  });
  let bInfo = boundsCache[sp];
  if (!bInfo) {
    scene.updateMatrixWorld(true);
    const measureTarget = body || scene;
    const box = new THREE.Box3().setFromObject(measureTarget);
    bInfo = {
      cx: (box.min.x + box.max.x) * 0.5,
      minY: box.min.y,
      cz: (box.min.z + box.max.z) * 0.5,
      sizeX: box.max.x - box.min.x,
      sizeY: Math.max(1e-4, box.max.y - box.min.y),
      sizeZ: box.max.z - box.min.z
    };
    boundsCache[sp] = bInfo;
  }
  const fit = new THREE.Group();
  const k = height / bInfo.sizeY;
  scene.scale.setScalar(k);
  scene.position.set(-bInfo.cx * k, -bInfo.minY * k, -bInfo.cz * k);
  fit.add(scene);
  const holder = new THREE.Group();
  holder.add(fit);

  const externalAnim = isExternalAnimGlb(scene, gltf.animations);
  const rig = externalAnim ? null : makeRig(scene);
  if (rig) rig.species = sp;

  const mixer = new THREE.AnimationMixer(scene);
  const actions = mapGlbActions(mixer, gltf.animations, sp);
  if (actions.idle) actions.idle.play();
  let handR = null;
  scene.traverse(function (o) { if (o.isBone && o.name === 'hand_r') handR = o; });
  const isBossModel = isBossSp(sp);
  const isUnarmedBoss = (sp === 'boss_act2' || sp === 'boss_act3' || sp === 'boss_act4');
  const wfx = BOSS_WEAPON_FX[sp] || BOSS_WEAPON_FX.boss;
  const trail = (handR && (isBossModel || sp === 'heavy')) ? createWeaponTrail(holder, handR, {
    baseLocal: new THREE.Vector3(0, isUnarmedBoss ? 0.02 : (isBossModel ? 0.55 : 0.30), 0),
    tipLocal: new THREE.Vector3(0, isUnarmedBoss ? 0.28 : (isBossModel ? 1.65 : 1.20), 0),
    color: isBossModel ? wfx.col : 0xe8d5b8,
    tailColor: isBossModel ? wfx.tail : 0x7c5840,
    glintColor: isBossModel ? wfx.glint : 0xffc864,
    glintScale: isUnarmedBoss ? 0.72 : (isBossModel ? 1.45 : 1.05)
  }) : null;

  return {
    species: sp,
    root: holder,
    trail: trail,
    impactFired: false,
    atkElapsed: 0,
    phase: 1,
    phaseT: 0,
    weaponMeshes: bodyMeshes.filter(function (m) { return /weapon/i.test(m.name); }), body: body, outline: outline, bodyMeshes: bodyMeshes, outlineMeshes: outlineMeshes,
    mixer: mixer, actions: actions, rig: rig, cur: 'idle', lockT: 0, prevBurst: null, atkAlt: 0,
    mats: bodyMeshes.concat(outlineMeshes).map(function (m) { return m.material; }),
    tris: Math.round(tris), ktx2: false,
    bbox: [+bInfo.sizeX.toFixed(3), +bInfo.sizeY.toFixed(3), +bInfo.sizeZ.toFixed(3)], fitScale: +k.toFixed(3)
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
        const rimBoost = Math.max(0, (H.rimOp || 0) - 0.38) * 0.20;
        if (rimBoost > 0.001 && H.rimCol) m.emissive.copy(H.rimCol).multiplyScalar(rimBoost).add(base);
        else m.emissive.copy(base);
      }
    };
  });
}

function playOnly(G, name, fade, from, timeScale) {
  const to = G.actions[name];
  if (!to) return false;
  Object.keys(G.actions).forEach(function (k) { if (G.actions[k] !== to) G.actions[k].fadeOut(fade); });
  to.reset();
  to.enabled = true;
  to.setEffectiveTimeScale(timeScale || 1);
  to.setEffectiveWeight(1);
  to.fadeIn(fade);
  to.play();
  if (from) to.time = from;
  G.cur = name;
  return true;
}

function once(G, name, from, timeScale, maxLock) {
  const ts = timeScale || 1;
  if (!playOnly(G, name, name === 'hit' || name === 'attack' ? 0.05 : 0.14, from, ts)) return;
  const dur = (G.actions[name].getClip().duration - (from || 0)) / ts - 0.08;
  G.lockT = Math.max(0.14, maxLock != null ? Math.min(maxLock, dur) : dur);
}

export function tickBossGlb(G, H, dt) {
  const enter = function (b) { return H.burst === b && G.prevBurst !== b; };
  const isBoss = isBossSp(G.species);
  const isHeavyArmor = (isBoss || G.species === 'heavy' || G.species === 'stone');

  if ((H.st === 'boss:sealing' || H.st === 'dead') && G.actions.death) {
    if (G.cur !== 'death') once(G, 'death');
  } else if (enter('kneel')) {
    /* 보스 강인도 격파·무릎 꿇음 상태에서만 큰 경직(stagger) 재생 */
    once(G, G.actions.stagger ? 'stagger' : 'hit', 0, 1.0);
  } else if (H.glbKick || enter('hit')) {
    /* 보스·중갑·석상은 공격/시전 중 슈퍼아머로 캔슬되지 않고, 평타 피격 시에도 넘어지지 않고 짧은 상체 움찔만 재생 */
    const busyArmor = isHeavyArmor && G.lockT > 0.06 && (G.cur === 'attack' || G.cur === 'cast' || G.cur === 'stagger');
    if (!busyArmor && G.cur !== 'death') {
      if (isBoss) once(G, 'hit', 0, 1.65, 0.18);
      else if (isHeavyArmor) once(G, 'hit', 0, 1.40, 0.22);
      else once(G, 'hit', 0, 1.25);
    }
  } else if ((enter('strike') || enter('attack') || enter('slash')) && G.actions.attack) {
    const useSlam = isBoss && G.actions.slam && (H.st === 'boss:leap' || H.st === 'boss:slam' || ((G.atkAlt++) % 2 === 1));
    const pMul = (isBoss && (G.phase || 1) >= 3) ? 1.28 : (isBoss ? 1.15 : 1.10);
    once(G, useSlam ? 'slam' : 'attack', 0.10, pMul);
    G.impactFired = false;
    G.atkElapsed = 0;
    if (G.trail) flashWeaponGlint(G.trail, useSlam ? 0xff4830 : 0xffd27a, 0.28);
    if (typeof window !== 'undefined' && window.__simanOnWeaponSwing) window.__simanOnWeaponSwing(G.species, useSlam ? 'slam' : 'attack');
  } else if (enter('wind') && G.actions.cast) {
    once(G, 'cast', 0, 1.10);
    if (G.trail) flashWeaponGlint(G.trail, 0xff5a3c, 0.36);
  }

  H.glbKick = false;
  G.prevBurst = H.burst;
  G.lockT = (G.lockT || 0) - dt;
  if (G.cur !== 'death' && G.lockT <= 0) {
    const want = (H.base === 'walk' || H.burst === 'charge') ? 'walk' : 'idle';
    if (want !== G.cur) playOnly(G, want, 0.16);
  }
  if (G.actions.walk && H.actions.walk) G.actions.walk.setEffectiveTimeScale(H.actions.walk.getEffectiveTimeScale());
  G.mixer.update(dt);
  if (G.cur === 'attack' || G.cur === 'slam') {
    G.atkElapsed = (G.atkElapsed || 0) + dt;
    const hitT = G.cur === 'slam' ? 0.42 : (G.species === 'stone' ? 0.58 : 0.36);
    if (!G.impactFired && G.atkElapsed >= hitT) {
      G.impactFired = true;
      if (typeof window !== 'undefined' && window.__simanOnWeaponImpact) {
        const wp = _impactWp;
        G.root.getWorldPosition(wp);
        window.__simanOnWeaponImpact(G.species, G.cur, wp.x, wp.z);
      }
    }
  }
  if (isBoss && (G.phase || 1) >= 2) {
    G.phaseT = (G.phaseT || 0) + dt * ((G.phase || 1) >= 3 ? 6.5 : 4.2);
    const pulse = 0.5 + 0.5 * Math.sin(G.phaseT);
    const glowHex = (G.phase || 1) >= 3 ? 0xffaa38 : 0xff3b24;
    (G.weaponMeshes || []).forEach(function (wm) {
      const m = wm.material;
      if (m && m.emissive) {
        m.emissive.setHex(G.phaseAuraHex || glowHex);
        m.emissiveIntensity = ((G.phase || 1) >= 3 ? 0.55 : 0.32) + pulse * 0.42;
      }
    });
  }
  if (G.trail) {
    const swinging = G.lockT > 0.04 && (G.cur === 'attack' || G.cur === 'slam');
    updateWeaponTrail(G.trail, dt, swinging);
  }
  if (G.rig) {
    let st = 'idle';
    if (G.cur === 'attack') st = 'attack';
    else if (G.cur === 'hit' || G.cur === 'stagger') st = 'hit';
    else if (G.cur === 'cast') st = 'cast';
    else if (G.cur === 'death') st = 'death';
    else if (G.cur === 'walk' || H.base === 'walk' || H.burst === 'charge') st = 'walk';
    tickPose(G.rig, dt, st, H.speed || 0);
  }
}

export function triggerMonsterDeathGlb(G) {
  if (!G || !G.actions || !G.actions.death) return false;
  if (G.cur !== 'death') once(G, 'death', 0, 1.35);
  return true;
}

export function setBossPhaseGlb(G, phase, auraHex) {
  if (!G) return;
  G.phase = Math.max(1, phase | 0);
  if (auraHex != null) G.phaseAuraHex = auraHex;
  if (G.actions && G.actions.cast) once(G, 'cast', 0, 1.18);
  if (G.trail) {
    const tCol = auraHex != null ? auraHex : (G.phase >= 3 ? 0xfff2a6 : 0xffd27a);
    const tTail = auraHex != null ? auraHex : (G.phase >= 3 ? 0xff2818 : 0xe83220);
    if (G.phase >= 2) setTrailStyle(G.trail, tCol, tTail);
    flashWeaponGlint(G.trail, tCol, 0.48);
  }
}

const ACT_RIMS = [
  null,
  { hex: 0x62d6ff, int: 0.16 }, /* 2막: 설산 서리빛 */
  { hex: 0xff5a36, int: 0.22 }, /* 3막: 홍련 불씨 */
  { hex: 0xffcf54, int: 0.24 }  /* 4막: 금월 황금 림 */
];
export function applyMonsterActThemeGlb(G, actIdx) {
  if (!G) return;
  /* 2·3·4막 전용 보스 모델(boss_act2/3/4)은 이미 고유 2048px 텍스처를 가지므로 과도한 틴트를 생략 */
  if (G.species === 'boss_act2' || G.species === 'boss_act3' || G.species === 'boss_act4') return;
  const prof = ACT_RIMS[Math.max(0, Math.min(3, actIdx | 0))];
  if (!prof) return;
  const c = new THREE.Color(prof.hex);
  (G.bodyMeshes || []).forEach(function (mesh) {
    const m = mesh.material;
    if (m && m.color) m.color.lerp(c, 0.04);
  });
}
export function triggerBossIntroRoarGlb(G) {
  if (!G) return;
  if (G.actions && G.actions.cast) once(G, 'cast', 0, 1.08);
  if (G.trail) flashWeaponGlint(G.trail, 0xffd27a, 0.55);
}

export function disposeMonsterGlb(G) {
  if (!G) return;
  if (G.trail) {
    disposeWeaponTrail(G.trail);
    G.trail = null;
  }
  if (G.mixer && G.root) {
    G.mixer.stopAllAction();
    G.mixer.uncacheRoot(G.root);
  }
}
