/* v2/js/glbhero.js — v0.83 시안 B(하데스풍 주홍 먹선 검객) 3D GLB 로더·3연타 검술 콤보·회피·피격 상태 머신 */
import * as THREE from 'three';
import { applyForgedMetal } from './modules/metalStudioEnv.js';
import { makeRig, tickPose } from './glbpose.js?v=v173';
import { isExternalAnimGlb, mapGlbActions } from './glbAnimMap.js?v=v173';
import { createWeaponTrail, setTrailStyle, flashWeaponGlint, updateWeaponTrail } from './weaponTrail.js?v=v173';

const URL_GLB = new URL('../assets/models/hero.glb?v=v173', import.meta.url).href;
let pending = null;
let source = null;
let cloneSkinned = null;
let enabled = true;
let showOutline = false;
try {
  const q = new URLSearchParams(location.search);
  if (q.get('hero') === 'proc' || q.get('hero') === '0') enabled = false;
  if (q.get('outline') === '1') showOutline = true;
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
    console.warn('[심안] hero.glb?v=v173', e);
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
    const isHead = /head/i.test(o.name);

    if (isOutline) {
      o.material = new THREE.MeshBasicMaterial({
        color: 0x050709,
        side: THREE.FrontSide,
        depthWrite: true
      });
      o.visible = showOutline;
      outlineMeshes.push(o);
    } else {
      const srcMat = Array.isArray(o.material) ? o.material[0] : o.material;
      let mat = srcMat ? srcMat.clone() : new THREE.MeshStandardMaterial({ color: 0xffffff });
      if (isSword) {
        const isEmberCore = /ember|core/i.test(o.name) || (srcMat && /(ember|jade)core/i.test(srcMat.name || ''));
        if (isEmberCore) {
          const isJadeCore = srcMat && /jade/i.test(srcMat.name || '');
          /* 장도 중앙 발광 균열 코어 (비취 백옥 / 홍련 백홍) */
          mat.metalness = 0.0;
          mat.roughness = 0.14;
          mat.color.setHex(isJadeCore ? 0xeafff8 : 0xfff0f4);
          mat.emissive = new THREE.Color(isJadeCore ? 0x4ef5c8 : 0xff4264);
          mat.emissiveIntensity = 1.40;
        } else {
          /* v1.00 3d-metal-material: 진성 도체 강철 F0 + PMREM HDR 반사 자동 바인딩 */
          const isJadeBlade = srcMat && /jade/i.test(srcMat.name || '');
          const isCrimsonBlade = srcMat && /crimson/i.test(srcMat.name || '');
          mat.metalness = (isJadeBlade || isCrimsonBlade) ? 0.78 : 1.0;
          mat.roughness = 0.24;
          if (!isJadeBlade && !isCrimsonBlade) mat.color.setRGB(0.56, 0.57, 0.58, THREE.LinearSRGBColorSpace);
          mat.emissive = new THREE.Color(isJadeBlade ? 0x0f5446 : (isCrimsonBlade ? 0x5c0c1c : 0x1e2028));
          mat.emissiveIntensity = (isJadeBlade || isCrimsonBlade) ? 0.44 : 0.35;
          o.onBeforeRender = function (r) {
            if (!mat.envMap && r) applyForgedMetal(mat, r, { roughness: 0.24, envMapIntensity: 0.92 });
          };
        }
        o.castShadow = true;
        swordMeshes.push(o);
      } else {
        /* v1.01 3d-cloth-material: Hero_Body는 MeshPhysicalMaterial 직물 sheen(무명/비단 광택) 적용 */
        let targetMat = mat;
        if (!isHead) {
          const phys = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            map: mat.map || null,
            normalMap: null,
            roughnessMap: mat.roughnessMap || null,
            roughness: 0.94,
            metalness: 0.0,
            sheen: 0.04,
            sheenRoughness: 0.92,
            sheenColor: new THREE.Color(0x88847c)
          });
          if (phys.map) {
            phys.map.anisotropy = 4;
            phys.map.minFilter = THREE.LinearMipmapLinearFilter;
            phys.map.generateMipmaps = true;
            phys.emissiveMap = phys.map;
            phys.emissive = new THREE.Color(0xffffff);
            phys.emissiveIntensity = 0.14;
          }
          phys.customProgramCacheKey = function () { return 'hero-ember-hardrim-v172'; };
          mat.dispose();
          targetMat = phys;
        } else {
          targetMat.roughness = 0.94;
          targetMat.metalness = 0.0;
          targetMat.roughnessMap = null;
          targetMat.metalnessMap = null;
          if (targetMat.color) targetMat.color.setHex(0xffffff);
          if (targetMat.map) {
            targetMat.emissiveMap = targetMat.map;
            targetMat.emissive = new THREE.Color(0xfff6ea);
            targetMat.emissiveIntensity = 0.14;
          }
          targetMat.customProgramCacheKey = function () { return 'hero-head-ember-hardrim-v163'; };
        }
        mat = targetMat;
        /* v1.63 엠버 앤 블레이드식 무선 + 2단 하드 툰 색면 + 순백 그래픽 하드 림라이트 */
        mat.userData.uCloakTint = { value: new THREE.Color(0xffffff) };
        mat.userData.uCloakMix = { value: 0.0 };
        mat.userData.uToonRimCol = { value: new THREE.Color(isHead ? 0xffffff : 0xf2f8ff) };
        mat.userData.uToonRimPow = { value: isHead ? 0.62 : 0.72 };
        mat.onBeforeCompile = function (shader) {
          shader.uniforms.uCloakTint = mat.userData.uCloakTint;
          shader.uniforms.uCloakMix = mat.userData.uCloakMix;
          shader.uniforms.uToonRimCol = mat.userData.uToonRimCol;
          shader.uniforms.uToonRimPow = mat.userData.uToonRimPow;
          shader.fragmentShader = "uniform vec3 uCloakTint;\nuniform float uCloakMix;\nuniform vec3 uToonRimCol;\nuniform float uToonRimPow;\n" + shader.fragmentShader;
          if (!isHead) {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <emissivemap_fragment>",
              "#include <emissivemap_fragment>\n" +
              "if (uCloakMix > 0.001) {\n" +
              "  float cLum = dot(totalEmissiveRadiance, vec3(0.299, 0.587, 0.114));\n" +
              "  float isSkin = step(0.18, cLum) * step(totalEmissiveRadiance.g * 1.07, totalEmissiveRadiance.r) * step(totalEmissiveRadiance.b * 1.12, totalEmissiveRadiance.g);\n" +
              "  float isCloth = (1.0 - isSkin) * smoothstep(0.03, 0.12, cLum);\n" +
              "  vec3 tinted = mix(totalEmissiveRadiance, totalEmissiveRadiance * uCloakTint * 1.35 + uCloakTint * 0.14 * cLum, uCloakMix * isCloth);\n" +
              "  totalEmissiveRadiance = tinted;\n" +
              "}"
            );
          }
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <dithering_fragment>",
            "vec3 vn = normalize(vNormal);\n" +
            "vec3 vv = normalize(vViewPosition);\n" +
            "vec3 keyDir = normalize(vec3(-0.55, 0.65, 0.52));\n" +
            "float ndl = dot(vn, keyDir);\n" +
            "float ndlFw = max(0.09, fwidth(ndl) * 1.45);\n" +
            "float toonBand = smoothstep(-ndlFw, ndlFw, ndl);\n" +
            "vec3 coolShadow = vec3(0.76, 0.80, 0.90);\n" +
            "vec3 litTint = vec3(1.04, 1.02, 0.99);\n" +
            "gl_FragColor.rgb *= mix(coolShadow, litTint, toonBand);\n" +
            "float fres = 1.0 - clamp(abs(dot(vn, vv)), 0.0, 1.0);\n" +
            "float rimSide = smoothstep(-0.10, 0.35, dot(vn, normalize(vec3(-0.82, 0.45, 0.25))));\n" +
            "float fresFw = max(0.07, fwidth(fres) * 1.80);\n" +
            "float hardRim = smoothstep(0.62 - fresFw, 0.62 + fresFw, fres) * rimSide;\n" +
            "gl_FragColor.rgb = mix(gl_FragColor.rgb, uToonRimCol, hardRim * uToonRimPow);\n" +
            "gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(0.96));\n" +
            "#include <dithering_fragment>"
          );
        };
        o.castShadow = true;
        bodyMeshes.push(o);
      }
      mat.userData.baseColor = mat.color ? mat.color.clone() : new THREE.Color(0xffffff);
      mat.userData.baseEmissive = mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000);
      mat.userData.baseEmissiveInt = mat.emissiveIntensity != null ? mat.emissiveIntensity : 0.46;
      o.material = mat;
    }
    allMeshes.push(o);
  });

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

  const externalAnim = isExternalAnimGlb(scene, source.animations);
  const rig = externalAnim ? null : makeRig(scene);
  if (rig) rig.species = 'hero';

  const mixer = new THREE.AnimationMixer(scene);
  const actions = mapGlbActions(mixer, source.animations, 'hero');
  if (actions.idle) {
    actions.idle.play();
    actions.idle.setEffectiveWeight(1);
  }

  let handR = null;
  scene.traverse(function (o) { if (o.isBone && o.name === 'hand_r') handR = o; });
  const trail = handR ? createWeaponTrail(fit, handR, {
    baseLocal: new THREE.Vector3(0, 0.12, 0.0),
    tipLocal: new THREE.Vector3(0, 1.05, 0.0),
    color: 0xf4f8ff,
    tailColor: 0x5be8c4,
    glintScale: 0.95
  }) : null;

  return {
    fit: fit,
    scene: scene,
    trail: trail,
    mixer: mixer,
    actions: actions,
    rig: rig,
    bodyMeshes: bodyMeshes,
    outlineMeshes: outlineMeshes,
    swordMeshes: swordMeshes,
    allMeshes: allMeshes,
    cur: 'idle',
    prevBurst: null,
    prevDash: false,
    comboIdx: 0,
    comboTimer: 0,
    lastComboStep: 1,
    lockT: 0,
    tris: Math.round(tris),
    cloakTint: new THREE.Color(0xffffff),
    cloakEmissive: new THREE.Color(0x000000),
    cloakMix: 0,
    trailCoreHex: null,
    trailHotHex: null,
    swordGlowHex: null
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

export function triggerHeroGlbBurst(G, name, shape) {
  if (!G) return;
  let clipKey = name;
  let ts = 1.25;
  if (name === 'slash') {
    const seq = ['slash', 'slash2', 'slash3'].filter(function (k) { return !!G.actions[k]; });
    if (!seq.length) return;
    /* v1.38 무늬별 전용 공격 모션 매핑: —(횡베기) · ㅣ(관통베기) · V(도약 내려찍기) · Z(초고속 연쇄베기) */
    if (shape === 'hline' && G.actions.slash) {
      clipKey = 'slash'; ts = 1.45; G.lastComboStep = 1;
    } else if (shape === 'vline' && G.actions.slash2) {
      clipKey = 'slash2'; ts = 1.85; G.lastComboStep = 2;
    } else if (shape === 'vee' && G.actions.slash3) {
      clipKey = 'slash3'; ts = 2.65; G.lastComboStep = 3;
    } else if (shape === 'bolt') {
      clipKey = ((G.comboIdx & 1) && G.actions.slash2) ? 'slash2' : (G.actions.slash ? 'slash' : seq[0]);
      ts = 2.45; G.lastComboStep = clipKey === 'slash2' ? 2 : 1;
    } else {
      const idx = (G.comboTimer > 0) ? (G.comboIdx % seq.length) : 0;
      clipKey = seq[idx];
      G.lastComboStep = idx + 1;
      ts = clipKey === 'slash3' ? 2.55 : (clipKey === 'slash2' ? 1.45 : 1.25);
    }
    G.comboIdx = (G.comboIdx + 1) % seq.length;
    G.comboTimer = 1.15;
    if (G.trail) {
      if (G.trailCoreHex != null && G.trailHotHex != null) {
        if (clipKey === 'slash3') setTrailStyle(G.trail, 0xfff4c8, G.trailCoreHex);
        else setTrailStyle(G.trail, G.trailHotHex, G.trailCoreHex);
      } else if (shape === 'vee') {
        setTrailStyle(G.trail, 0xffe8ff, 0xc07eff);
      } else if (shape === 'vline') {
        setTrailStyle(G.trail, 0xffe4b8, 0xff5a42);
      } else if (shape === 'bolt') {
        setTrailStyle(G.trail, 0xfffbe0, 0xffd25a);
      } else if (shape === 'hline') {
        setTrailStyle(G.trail, 0xd8fff4, 0x48e0b8);
      } else {
        if (clipKey === 'slash3') setTrailStyle(G.trail, 0xffe49a, 0xe84838);
        else if (clipKey === 'slash2') setTrailStyle(G.trail, 0xd8fff4, 0x3ec8a8);
        else setTrailStyle(G.trail, 0xf6f8ff, 0x7cb8ff);
      }
    }
  } else if (name === 'dodge') {
    if (!G.actions.dodge) return;
    ts = 3.1;
  } else if (name === 'block') {
    if (!G.actions.block) return;
    ts = 1.75;
    if (G.trail) flashWeaponGlint(G.trail, 0xfff0a8, 0.24);
  } else if (!G.actions[name]) {
    return;
  }
  playOnly(G, clipKey, 0.04, ts);
  const dur = G.actions[clipKey].getClip().duration / ts;
  G.lockT = Math.max(0.18, dur - 0.05);
}

export function tickHeroGlb(G, H, dt) {
  if (!G) return;
  G.lockT = Math.max(0, (G.lockT || 0) - dt);
  G.comboTimer = Math.max(0, (G.comboTimer || 0) - dt);

  const isDash = !!H.wasDash;
  if (H.burst === 'slash' && G.prevBurst !== 'slash') {
    triggerHeroGlbBurst(G, 'slash');
  } else if (H.burst === 'hit' && G.prevBurst !== 'hit') {
    triggerHeroGlbBurst(G, 'hit');
  } else if (isDash && !G.prevDash && G.actions.dodge) {
    triggerHeroGlbBurst(G, 'dodge');
  }
  G.prevBurst = H.burst;
  G.prevDash = isDash;

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

  const sqY = 1 + (H.squash || 0);
  const sqXZ = 1 / Math.sqrt(Math.max(0.75, sqY));
  G.fit.scale.set(sqXZ, sqY, sqXZ);

  G.mixer.update(dt);
  if (G.trail) {
    const slashing = G.lockT > 0.03 && (G.cur === 'slash' || G.cur === 'slash2' || G.cur === 'slash3');
    updateWeaponTrail(G.trail, dt, slashing);
  }
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
    if (m.transparent !== needT) { m.transparent = needT; }
    m.opacity = o;
  }
}

export function setHeroGlbTint(G, r, g, b) {
  if (!G) return;
  for (let i = 0; i < G.bodyMeshes.length; i++) {
    const m = G.bodyMeshes[i].material;
    if (!m || !m.userData.baseColor) continue;
    const bc = m.userData.baseColor;
    m.color.setRGB(bc.r * r, bc.g * g, bc.b * b);
    if (m.userData.uCloakTint) m.userData.uCloakTint.value.copy(G.cloakTint);
    if (m.userData.uCloakMix) m.userData.uCloakMix.value = G.cloakMix || 0;
      /* v1.01 3d-cloth-material: 도포별 직물(무명/설산비단/진홍비단/금사비단) sheen 차별화 */
      if (m.isMeshPhysicalMaterial) {
        const cid = G.cloakId || 'ink';
        if (cid === 'gilded_eclipse') { m.roughness = 0.42; m.sheen = 0.78; m.sheenRoughness = 0.26; m.sheenColor.setHex(0xd8b45c); }
        else if (cid === 'crimson_guard') { m.roughness = 0.48; m.sheen = 0.68; m.sheenRoughness = 0.28; m.sheenColor.setHex(0xc86454); }
        else if (cid === 'snow_sage') { m.roughness = 0.54; m.sheen = 0.62; m.sheenRoughness = 0.30; m.sheenColor.setHex(0x98d6ea); }
        else { m.roughness = 0.86; m.sheen = 0.55; m.sheenRoughness = 0.56; m.sheenColor.setHex(0x827d72); }
      }
  }
}

export function applyHeroGlbCloak(G, prof, forgeLv) {
  if (!G || !prof) return;
  G.cloakTint.setHex(prof.tint != null ? prof.tint : 0xffffff);
  G.cloakEmissive.setHex(prof.emissive != null ? prof.emissive : 0x000000);
  G.cloakMix = prof.mix || 0;
  G.cloakId = prof.id || 'ink';
  const flv = Math.max(0, Math.min(3, forgeLv | 0));
  for (let i = 0; i < G.bodyMeshes.length; i++) {
    const m = G.bodyMeshes[i].material;
    if (!m) continue;
    m.emissiveIntensity = (m.userData.baseEmissiveInt || 0.12) + flv * 0.015;
  }
  for (let i = 0; i < G.swordMeshes.length; i++) {
    const m = G.swordMeshes[i].material;
    if (!m || !m.userData.baseEmissive) continue;
    m.emissive.copy(m.userData.baseEmissive);
    if (flv > 0) m.emissive.lerp(new THREE.Color(prof.rimCol || 0xffe4ad), flv * 0.16);
  }
  setHeroGlbTint(G, 1, 1, 1);
}

export function applyHeroGlbSwordTrail(G, swordHex, coreHex, hotHex) {
  if (!G) return;
  G.swordGlowHex = swordHex != null ? swordHex : null;
  G.trailCoreHex = coreHex != null ? coreHex : null;
  G.trailHotHex = hotHex != null ? hotHex : null;
  if (G.trail && coreHex != null && hotHex != null) setTrailStyle(G.trail, hotHex, coreHex);
  for (let i = 0; i < (G.swordMeshes || []).length; i++) {
    const m = G.swordMeshes[i].material;
    if (!m || !m.userData.baseEmissive) continue;
    m.emissive.copy(m.userData.baseEmissive);
    if (swordHex != null) {
      m.emissive.lerp(new THREE.Color(swordHex), 0.52);
      m.emissiveIntensity = 1.15;
    }
  }
}
