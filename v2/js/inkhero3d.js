/* v2/js/inkhero3d.js — v0.47 주인공 전용 **3D 관절 뼈대 + 수묵 툰 셰이더 + 동양 수묵 텍스처** 캐릭터.

   v0.44까지 주인공은 손그림 포즈 카드(빌보드)였다. v0.45는 주인공만 진짜 3D 뼈대로 세운다
   (원귀·보스는 v0.44 그대로).

   1) 뼈대 — 골반 → 척추 → 가슴 → 목/머리, 좌우 어깨 → 위팔 → 아래팔 → 손목 → 장검,
      좌우 고관절 → 허벅지 → 종아리 → 발목, 그리고 도포 자락 2마디 · 두건 끈.
      모든 뼈는 THREE.Bone 이고, 부위 메시는 뼈의 로컬 좌표에 붙는다.
   2) 수묵 툰 — 3단 붓 계조 gradientMap(깊은 먹 → 스며든 먹 → 한지빛)을 그대로 쓰는 툰 셰이더.
      **왜 MeshToonMaterial 이 아니라 같은 램프의 전용 셰이더인가**: 무대에는 주인공을 따라오는
      등불 점광원(강도 30, 감쇠 1.7)이 있어, 표준 툰 재질은 검은 옷이 등불 쪽에서 타 버리고
      반대쪽은 순검정이 된다(실측: 흑의가 화면 160). 그래서 툰 계조 계산은 그대로 두되
      광원을 장면 주광(달빛)·보조광·한지 앰비언트로 한정해, 어떤 장에서도 '먹'의 자리에 앉게 했다.
      그 위에 붓 번짐 세로 계조 + 마른 붓 그레인을 더한다.
   3) 외곽선 — 노멀을 밀어 만든 인버티드 헐(BackSide) 먹선.
   4) 동작 — 12키 이상의 키프레임을 AnimationClip 으로 만들고 AnimationMixer 로 재생한다.
      idle(호흡) / walk(발딛기) / slash(일섬) / hit(피격) 4종 + 상태 전환 crossFadeTo(0.10~0.18s).
   5) 방향 — group.scale.x = -1 을 쓰지 않는다. 이동·공격 방향으로 rotation.y 를 slerp 해서
      8방향 어디로 가도 몸이 돌아 걸어가고 벤다.
   6) v0.47 텍스처 — 부위마다 아틀라스 칸(zone)을 굽고(inktex3d.js), 프래그먼트가 uv 로 한지 섬유·
      먹 붓질·칼날 하몬을 곱한다. 색은 그대로 uColor(버텍스)가 내고 텍스처는 '결'만 얹는다.
      ?notex=1 이면 아틀라스를 만들지 않아 v0.46과 픽셀 단위로 같다. */
import * as THREE from 'three';
import { HERO } from './inkmodels3d.js';
import { artTex, bakeBody, makeBones, SKIN_VERT, clothStep } from './inkbody3d.js';
import { applyThemeToInkUniforms } from './modules/actTheme3d.js';
import * as TEX from './inktex3d.js';
import {
  heroGlbEnabled, preloadHeroGlb, makeHeroGlb,
  tickHeroGlb, triggerHeroGlbBurst, setHeroGlbOpacity, setHeroGlbTint, applyHeroGlbCloak, applyHeroGlbSwordTrail
} from './glbhero.js?v=v164';
import {
  hd2dEnabled, preloadHd2dAll, makeHd2dHero, tickHd2d,
  triggerHd2dPose, setHd2dOpacity, setHd2dTint, applyHd2dCloak, makeHd2dGhost
} from './hd2dSprite.js?v=v164';
let HERO_CAM = null;

export const HERO_H = 2.45;          /* 기존 주인공(파츠 리그 m=2.45)과 같은 키 — 그림자·HUD 기준이 맞는다 */
const WALK_SPEED = 1.7;              /* 걷기 위상의 기준 속도(m/s) */
const OUTLINE_T = (function () {
  /* ?holo=0.03 — QA에서 먹선 두께를 화면으로 맞출 때만 쓴다. */
  try {
    const q = new URLSearchParams(location.search);
    const v = parseFloat(q.get('holo'));
    if (isFinite(v) && v > 0) return Math.min(0.09, v);
    if (q.has('nooutline')) return 0;
  } catch (e) {}
  return 0.026;
})();
/* 광량(선형). 3단 계조와 함께 먹의 자리를 정한다 — ?inkk= 로 QA 조정. */
const LIGHT = (function () {
  const L = { amb: 0.28, key: 1.12, fill: 0.38, rim: 0.30, wash: 0.15 };
  try {
    const q = new URLSearchParams(location.search);
    ['amb', 'key', 'fill', 'rim', 'wash'].forEach(function (k) {
      const v = parseFloat(q.get('ink' + k));
      if (isFinite(v) && v >= 0) L[k] = v;
    });
  } catch (e) {}
  return L;
})();

/* ---------------------------------------------------------------- 먹의 값
   albedo 는 선형 색이다. 광량(위 LIGHT)과 곱해진 값이 화면에서 '먹'의 계조가 된다.
   흑의(黑衣)는 화면 60~70, 눈 안대는 190~215, 장검 날은 175~195 를 목표로 잡았다. */
let _grad = null;
/** 3단 붓 계조: x축 = dotNL(-1..1)을 0..1로 옮긴 값. 마른 붓처럼 칸 경계에 살짝 흔들림. */
function gradMap() {
  if (_grad) return _grad;
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = 1;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, 1);
  const stops = [[0.00, 0.26], [0.38, 0.29], [0.45, 0.58], [0.65, 0.63], [0.72, 1.00], [1.00, 1.00]];
  const val = function (x) {
    if (x <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1], b = stops[i];
      if (x <= b[0]) {
        const t = (x - a[0]) / Math.max(1e-6, b[0] - a[0]);
        const s = t * t * (3 - 2 * t);
        return a[1] + (b[1] - a[1]) * s;
      }
    }
    return stops[stops.length - 1][1];
  };
  let seed = 20261119;
  const rnd = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N;
    const edge = Math.abs(x - 0.42) < 0.055 || Math.abs(x - 0.69) < 0.055;
    const v = Math.max(0, Math.min(1, val(x) + (edge ? (rnd() - 0.5) * 0.07 : 0)));
    const b = Math.round(v * 255);
    img.data[i * 4] = b; img.data[i * 4 + 1] = b; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  _grad = t;
  return t;
}

/* ---------------------------------------------------------------- 수묵 툰 셰이더 */
const FRAG = /* glsl */`
uniform sampler2D uRamp;
uniform vec3 uKeyDir, uKeyCol, uFillDir, uFillCol, uAmbCol, uRimCol, uMistCol;
uniform float uRim, uWash, uGrain;
uniform float uMistAmt, uSpecAmt;
uniform vec3 uCloakTint, uCloakEmissive;
uniform float uCloakMix;
uniform sampler2D uTex;
uniform sampler2D uArt;
uniform float uTexAmt;
varying vec2 vTuv;
varying float vZone;
vec3 inkTexAtlas() {
  if (vZone >= 7.5) {
    float cell = floor(vZone + 0.5) - 8.0;
    vec2 tile = vec2(mod(cell, 4.0), 3.0 - floor(cell / 4.0));
    return texture2D(uArt, (tile + clamp(vTuv, 0.004, 0.996)) * 0.25).rgb * 2.0;
  }
  float col = mod(vZone, 2.0);
  float row = floor(vZone * 0.5);
  vec2 f = vec2(clamp(fract(vTuv.x), 0.008, 0.992), clamp(fract(vTuv.y), 0.012, 0.988));
  vec3 c = texture2D(uTex, vec2((col + f.x) * 0.5, (row + f.y) * 0.25)).rgb;
  /* 0.75 = '아무 결도 아닌 바탕'. 이 점을 1.0으로 두고 명암을 1.9배 벌린다
     (검은 옷의 albedo 0.04 위에서도 먹획과 한지빛 마모가 읽히게). */
  return max(vec3(0.0), 1.0 + (c - 0.75) * 1.9);
}
varying vec3 vAlb;
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
varying float vH;
float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float k = texture2D(uRamp, vec2(clamp(dot(N, uKeyDir) * 0.5 + 0.5, 0.0, 1.0), 0.5)).r;
  float f = texture2D(uRamp, vec2(clamp(dot(N, uFillDir) * 0.5 + 0.5, 0.0, 1.0), 0.5)).r;
  vec3 light = uAmbCol + uKeyCol * k + uFillCol * f;
  /* 붓 번짐: 위(어깨)는 한지빛으로 살짝 들고 아래(자락)는 먹이 고인다. */
  float wash = mix(1.0 + uWash, 1.0 - uWash * 0.55, vH);
  /* 마른 붓 그레인 — 넓은 얼룩과 잔 결 두 겹. 플라스틱 면을 종이로 바꾼다. */
  float grain = 1.0 + uGrain * ((vnoise(vW * 7.0) - 0.5) * 0.7 + (vnoise(vW * 23.0) - 0.5) * 0.5);
  /* v0.77 도포 틴트 마스크: 피부·검날·붉은 허리띠는 원본 색을 보존하고 어두운 도포 천에만 치장 색상을 입힌다. */
  float albLum = dot(vAlb, vec3(0.299, 0.587, 0.114));
  float albSat = max(vAlb.r, max(vAlb.g, vAlb.b)) - min(vAlb.r, min(vAlb.g, vAlb.b));
  float clothMask = smoothstep(0.32, 0.14, albLum) * smoothstep(0.18, 0.06, albSat);
  vec3 baseAlb = mix(vAlb, mix(uCloakTint * 0.62, uCloakTint, clamp(vH, 0.0, 1.0)), clamp(uCloakMix, 0.0, 0.92) * clothMask);
  vec3 col = baseAlb * light * wash * grain;
  /* v0.47 동양 수묵 텍스처 — 한지 섬유·먹 붓질·비늘·부적 같은 '결'만 1.0 근처로 곱한다.
     색은 버텍스가 내고(uColor), 텍스처는 종이와 붓의 질감만 얹는다(?notex=1 이면 uTexAmt 0). */
  col *= mix(vec3(1.0), inkTexAtlas(), uTexAmt);
  /* 붓끝 먹 고임: 실루엣 가장자리로 갈수록 먹이 진해진다(먹그림의 가장자리 농도). */
  float edge = pow(1.0 - clamp(dot(N, normalize(vV)), 0.0, 1.0), 2.0);
  col *= mix(1.0, 0.80, edge);
  /* v0.50 상용화 표현: 달빛 하프벡터 미세 광택(칼날·기와·석등 모서리) + 1~4막 한지 림 역광 + 바닥 먹안개 그라데이션 */
  vec3 V = normalize(vV);
  vec3 H = normalize(uKeyDir + V);
  float spec = pow(max(dot(N, H), 0.0), 28.0) * k * uSpecAmt;
  col += uRimCol * spec;
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.8);
  col += uRimCol * fres * uRim;
  col += uCloakEmissive * (0.18 + 0.82 * fres) * (0.22 + 0.78 * clothMask);
  float groundMist = smoothstep(2.6, -0.35, vW.y) * uMistAmt;
  col = mix(col, uMistCol, clamp(groundMist * 0.52, 0.0, 0.55));
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

function inkUniforms() {
  return {
    uRamp: { value: gradMap() },
    uKeyDir: { value: new THREE.Vector3(-0.45, 0.78, 0.44).normalize() },
    uKeyCol: { value: new THREE.Color(0.86, 0.83, 0.76).multiplyScalar(LIGHT.key) },
    uFillDir: { value: new THREE.Vector3(0.55, 0.42, -0.72).normalize() },
    uFillCol: { value: new THREE.Color(0.62, 0.68, 0.78).multiplyScalar(LIGHT.fill) },
    uAmbCol: { value: new THREE.Color(0.52, 0.48, 0.42).multiplyScalar(LIGHT.amb) },
    uRimCol: { value: new THREE.Color(0xffe4ad) },
    uRim: { value: LIGHT.rim },
    uWash: { value: LIGHT.wash },
    uGrain: { value: 0.16 },
    uMistCol: { value: new THREE.Color(0x241f1a) },
    uMistAmt: { value: 0.34 },
    uSpecAmt: { value: 0.18 },
    uCloakTint: { value: new THREE.Color(0xffffff) },
    uCloakEmissive: { value: new THREE.Color(0x000000) },
    uCloakMix: { value: 0.0 },
    /* v0.47 텍스처 아틀라스 — 전 재질이 한 장을 공유한다(샘플러 1개, 드로우콜 그대로). */
    uArt: { value: artTex() },
    uTex: { value: TEX.atlas() },
    uTexAmt: { value: TEX.amount() }
  };
}
function inkMat(opt) {
  opt = opt || {};
  const u = inkUniforms();
  const m = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: SKIN_VERT, fragmentShader: FRAG,
    side: opt.side || THREE.FrontSide
  });
  m.userData.inkUniforms = u;
  m.userData.hero3dMat = true;
  return m;
}
function outlineMat() {
  const m = new THREE.MeshBasicMaterial({ color: 0x0b0a09, side: THREE.BackSide });
  m.userData.hero3dMat = true;
  return m;
}

/* ---------------------------------------------------------------- 형상 도구 */
let _shadowTex = null;
function shadowTex() {
  if (_shadowTex) return _shadowTex;
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  rg.addColorStop(0, 'rgba(12,10,8,0.62)');
  rg.addColorStop(0.55, 'rgba(12,10,8,0.34)');
  rg.addColorStop(1, 'rgba(12,10,8,0)');
  g.fillStyle = rg;
  g.beginPath(); g.ellipse(N / 2, N / 2, N / 2, N / 2, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  _shadowTex = t;
  return _shadowTex;
}

/* ---------------------------------------------------------------- 동작(클립) */
let heroBody, heroClips;

export function build(opt) {
  opt = opt || {};
  const root = new THREE.Group();
  root.name = 'hero3d-root';
  const rig = makeBones(HERO.defs, 'h3d_');
  const bones = rig.bones;
  root.add(rig.root);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(rig.list);
  const baked = heroBody || (heroBody = bakeBody(HERO, 0));
  const bodyMat = inkMat({ side: THREE.DoubleSide });
  bodyMat.uniforms.uHeight = { value: HERO.h };
  const outMat = outlineMat();
  const body = new THREE.SkinnedMesh(baked.geo, bodyMat);
  root.add(body);
  body.bind(skeleton);
  body.castShadow = true;
  body.frustumCulled = false;
  body.userData.hero3dBody = true;
  const meshes = [body];
  if (OUTLINE_T > 0) {
    const hull = new THREE.SkinnedMesh(baked.hull, outMat);
    root.add(hull);
    hull.bind(skeleton);
    hull.frustumCulled = false;
    hull.userData.hero3dHull = true;
  }

  /* 접지 그림자 — 바닥 평면에 밀착된 부드러운 수묵 접지 그림자(떠 보임 방지) */
  let shadow = null;
  if (opt.shadow !== false) {
    const sg = new THREE.PlaneGeometry(1.55, 1.55);
    sg.rotateX(-Math.PI / 2);
    const sm = new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.86 });
    shadow = new THREE.Mesh(sg, sm);
    shadow.position.set(0, 0.024, 0);
    shadow.renderOrder = 1;
    root.add(shadow);
  }

  const mixer = new THREE.AnimationMixer(root);
  const clips = heroClips || (heroClips = HERO.clips(HERO, 'h3d_'));
  const actions = {};
  Object.keys(clips).forEach(function (k) {
    const a = mixer.clipAction(clips[k]);
    if (k === 'slash' || k === 'hit') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    actions[k] = a;
  });
  actions.idle.play();
  actions.idle.setEffectiveWeight(1);

  const H = {
    kind: 'hero3d', root: root, bones: bones, mixer: mixer, actions: actions, clips: clips,
    base: 'idle', burst: null, speed: 0, yaw: 0, yawTarget: 0,
    px: 0, pz: 0, first: true, lean: 0, t: Math.random() * 4,
    cloth: {}, freeze: false, meshes: meshes, mats: [bodyMat, outMat],
    shadow: shadow, opacity: 1, tint: [1, 1, 1], phase: 'idle', lights: null,
    uniforms: [bodyMat.userData.inkUniforms],
    glb: null, procMeshes: []
  };
  root.children.forEach(function (ch) {
    if (ch !== shadow && (ch.isMesh || ch.isBone)) H.procMeshes.push(ch);
  });

  function attachGlbHero() {
    if (H.glb || H.hd2d || !heroGlbEnabled()) return;
    const G = makeHeroGlb(HERO_H);
    if (!G) return;
    H.glb = G;
    for (let i = 0; i < H.procMeshes.length; i++) H.procMeshes[i].visible = false;
    root.add(G.fit);
    root.userData.poseSource = 'glb_hero';
    if (H.opacity < 0.999) setHeroGlbOpacity(G, H.opacity);
    if (H.lastCloakProf) applyHeroGlbCloak(G, H.lastCloakProf, H.lastForgeLv || 0);
    setHeroGlbTint(G, H.tint[0], H.tint[1], H.tint[2]);
  }
  if (hd2dEnabled()) {
    preloadHd2dAll();
    const U = makeHd2dHero(HERO_H);
    if (U) {
      H.hd2d = U;
      for (let i = 0; i < H.procMeshes.length; i++) H.procMeshes[i].visible = false;
      root.add(U.holder);
      root.userData.poseSource = 'hd2d_hero';
    }
  } else if (heroGlbEnabled()) {
    const pGlb = preloadHeroGlb();
    if (pGlb && pGlb.then) pGlb.then(attachGlbHero);
  }

  const finished = function (e) {
    if (e.action !== actions.slash && e.action !== actions.hit) return;
    const back = actions[H.base] || actions.idle;
    H.burst = null;
    back.enabled = true;
    back.setEffectiveWeight(1);
    back.play();
    e.action.crossFadeTo(back, 0.14, false);
  };
  mixer.addEventListener('finished', finished);

  root.userData.hero3d = H;
  root.userData.worldH = HERO_H;
  root.userData.poseSource = H.hd2d ? 'hd2d_hero' : 'hero3d';
  return root;
}

/* ---------------------------------------------------------------- 잔상(대시) */
export function buildGhost(src) {
  if (!src || !src.userData || !src.userData.hero3d) return null;
  const H = src.userData.hero3d;
  if (H.hd2d) return makeHd2dGhost(H.hd2d, src, HERO_CAM);
  const sourceBody = H.meshes[0];
  const rig = makeBones(HERO.defs, 'h3d_');
  for (const name in rig.bones) {
    const bone = rig.bones[name], original = H.bones[name];
    bone.position.copy(original.position);
    bone.quaternion.copy(original.quaternion);
    bone.scale.copy(original.scale);
  }
  const g = new THREE.Group();
  g.position.copy(src.position);
  g.quaternion.copy(src.quaternion);
  g.scale.copy(src.scale);
  const mat = new THREE.MeshBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(sourceBody.geometry, mat);
  mesh.frustumCulled = false;
  mesh.bind(new THREE.Skeleton(rig.list, sourceBody.skeleton.boneInverses), sourceBody.bindMatrix);
  g.add(rig.root, mesh);
  g.userData = { sharedGeom: true, rig: { kind: 'ghost' }, hero3d: H, sprite: mesh, worldH: HERO_H };
  return g;
}

/* ---------------------------------------------------------------- 상태 전환 */
function crossFade(H, fromName, toName, dur) {
  const from = H.actions[fromName], to = H.actions[toName];
  if (!from || !to) return;
  to.enabled = true;
  to.setEffectiveWeight(1);
  to.setEffectiveTimeScale(1);
  to.play();
  from.crossFadeTo(to, dur, false);
}
function startBurst(H, name, fadeIn) {
  const a = H.actions[name], from = H.actions[H.burst || H.base];
  if (!a) return;
  a.reset();
  a.setEffectiveTimeScale(1);
  a.setEffectiveWeight(1);
  a.enabled = true;
  a.play();
  if (from && from !== a) from.crossFadeTo(a, fadeIn, false);
  H.burst = name;
}

/* ---------------------------------------------------------------- 장면 광원 따라가기 */
const _v1 = new THREE.Vector3();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
function bindLights(H, group) {
  if (H.lights) return H.lights;
  let scene = group.parent;
  while (scene && !scene.isScene) scene = scene.parent;
  if (!scene) return null;
  const L = { amb: null, hemi: null, dirs: [] };
  scene.traverse(function (o) {
    if (o.isAmbientLight && !L.amb) L.amb = o;
    else if (o.isHemisphereLight && !L.hemi) L.hemi = o;
    else if (o.isDirectionalLight) L.dirs.push(o);
  });
  H.lights = L;
  return L;
}
/** 장면의 주광(달빛)·보조광·한지 앰비언트를 셰이더 uniform 으로 옮긴다. */
/* 한지 바탕광 — 무대 조명의 세기가 장마다 크게 달라서, 먹의 계조를 지키려면 광량은 여기서 정한다.
   (장면 광원은 방향과 색조만 빌려 온다.) */
const PAPER_AMB = new THREE.Color(1.00, 0.955, 0.88);
function syncLights(H, group) {
  const L = bindLights(H, group);
  if (!L) return;
  const U = H.uniforms;
  const moon = L.dirs[0], fill = L.dirs[1];
  let kx = -0.45, ky = 0.78, kz = 0.44;
  let fx = 0.55, fy = 0.42, fz = -0.72;
  if (moon) {
    _v1.copy(moon.position);
    if (moon.target) _v1.sub(moon.target.position);
    if (_v1.lengthSq() > 1e-6) _v1.normalize(); else _v1.set(-0.45, 0.78, 0.44).normalize();
    kx = _v1.x; ky = _v1.y; kz = _v1.z;
  }
  if (fill) {
    _v1.copy(fill.position);
    if (fill.target) _v1.sub(fill.target.position);
    if (_v1.lengthSq() > 1e-6) _v1.normalize(); else _v1.set(0.55, 0.42, -0.72).normalize();
    fx = _v1.x; fy = _v1.y; fz = _v1.z;
  }
  /* 주광 색조: 장면 달빛 색을 50%만 섞는다(피의 달에서도 흑의가 빨갛게 타지 않게). */
  let kr = 0.92, kg = 0.90, kb = 0.86;
  if (moon) {
    _c1.copy(moon.color);
    const m = Math.max(1e-4, _c1.r, _c1.g, _c1.b);
    kr = 0.5 + 0.5 * _c1.r / m; kg = 0.5 + 0.5 * _c1.g / m; kb = 0.5 + 0.5 * _c1.b / m;
  }
  let fr = 0.62, fg = 0.70, fb = 0.82;
  if (fill) {
    _c2.copy(fill.color);
    const m = Math.max(1e-4, _c2.r, _c2.g, _c2.b);
    fr = _c2.r / m; fg = _c2.g / m; fb = _c2.b / m;
  }
  for (let i = 0; i < U.length; i++) {
    const u = U[i];
    u.uKeyDir.value.set(kx, ky, kz).normalize();
    u.uFillDir.value.set(fx, fy, fz).normalize();
    u.uKeyCol.value.setRGB(kr * LIGHT.key, kg * LIGHT.key, kb * LIGHT.key);
    u.uFillCol.value.setRGB(fr * LIGHT.fill, fg * LIGHT.fill, fb * LIGHT.fill);
    u.uAmbCol.value.setRGB(PAPER_AMB.r * LIGHT.amb, PAPER_AMB.g * LIGHT.amb, PAPER_AMB.b * LIGHT.amb);
  }
}

/* ---------------------------------------------------------------- 매 프레임 */
export function tick(group, kind, state, dt, vx, vz) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return false;
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.1) dt = 0.1;
  const st = state || 'idle';

  /* 이동 속도·방향은 '놓인 위치의 차분'에서 잰다(게임은 대시 때만 vx·vz를 준다). */
  const gx = group.position.x, gz = group.position.z;
  if (H.first) { H.px = gx; H.pz = gz; H.first = false; }
  const dx = gx - H.px, dz = gz - H.pz;
  H.px = gx; H.pz = gz;
  const rawSp = Math.sqrt(dx * dx + dz * dz) / dt;
  const sp = Math.min(rawSp, 26);
  H.speed += (sp - H.speed) * (-Math.expm1(-dt * 12));
  H.phase = sp > 0.5 ? 'walk' : 'idle';

  /* 방향 — 8방향 어디로 가든 몸이 돌아간다(좌우 반전 없음). */
  let dirX = 0, dirZ = 0;
  if (vx != null && vz != null && (Math.abs(vx) + Math.abs(vz)) > 1e-4) { dirX = vx; dirZ = vz; }
  else if (sp > 0.35) { dirX = dx; dirZ = dz; }
  if (Math.abs(dirX) + Math.abs(dirZ) > 1e-5) H.yawTarget = Math.atan2(dirX, dirZ);
  const rate = (st === 'dash' || H.burst === 'slash') ? 24 : 11;
  let d = H.yawTarget - H.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  H.yaw += d * (1 - Math.exp(-rate * dt));
  group.rotation.y = H.yaw;

  syncLights(H, group);
  if (H.freeze) { applyCloth(H, dt, 0, 0, 0); return true; }

  /* 기본 이동 동작: 걷기 / 서기 — 문턱에 히스테리시스를 둬 깜빡이지 않게. */
  const wantWalk = H.base === 'walk' ? (H.speed > 0.30) : (H.speed > 0.55);
  const want = wantWalk ? 'walk' : 'idle';
  if (!H.burst && want !== H.base) {
    crossFade(H, H.base, want, 0.16);
    H.base = want;
  }
  if (H.actions.walk) H.actions.walk.setEffectiveTimeScale(Math.max(0.55, Math.min(2.4, H.speed / WALK_SPEED)));

  /* v0.48 무게감 — 일섬(유일한 이동) 자세를 클립 위에 절차적으로 얹는다.
     ① 상체 전경: 돌진 중 0.30rad(약 17°)까지 눕는다(종전 0.16 은 서 있는 듯 보였다).
     ② 회전 비틀림: 몸이 도는 각속도에 비례해 가슴을 반대로 비튼다(무협의 허리 비틀기).
     ③ 검 뒤로 젖힘: 오른팔·검을 진행 반대쪽으로 끌어 잔상과 함께 '베고 지나가는' 실루엣.
     ④ 출발 웅크림: 돌진 시작 0.06초 동안 골반을 살짝 낮춰 예비동작을 만든다. */
  const isDash = st === 'dash';
  if (isDash && !H.wasDash) { H.dashT = 0; H.crouchV = 0.18; H.squash = -0.14; H.squashV = 2.6; }
  if (!isDash && H.wasDash) { H.squash = 0.12; H.squashV = -2.2; } /* 착지 감쇠 스쿼시 (game-feel) */
  H.wasDash = isDash;
  if (isDash) H.dashT = (H.dashT || 0) + dt;
  H.crouchV = Math.max(0, (H.crouchV || 0) - dt * 3.2);
  /* 감쇠 스쿼시-스트레치 스프링 (면적 보존: Y 늘면 XZ 축소) */
  H.squash = H.squash || 0; H.squashV = H.squashV || 0;
  H.squashV += (-H.squash * 190 - H.squashV * 19) * dt;
  H.squash += H.squashV * dt;
  if (Math.abs(H.squash) < 0.001 && Math.abs(H.squashV) < 0.01) { H.squash = 0; H.squashV = 0; }
  const sqY = 1 + H.squash;
  const sqXZ = 1 / Math.sqrt(Math.max(0.75, sqY));
  if (H.meshes[0]) H.meshes[0].scale.set(sqXZ, sqY, sqXZ);
  const leanT = (isDash ? 0.34 : 0) + Math.min(0.14, H.speed * 0.016);
  H.lean += (leanT - H.lean) * (-Math.expm1(-dt * 11));
  /* 각속도(rad/s) — 부드럽게 재서 비틀림에 쓴다 */
  H.yawRate = (H.yawRate || 0) * 0.85 + ((H.yawTarget - H.yaw) * 6) * 0.15;
  const twist = Math.max(-0.34, Math.min(0.34, (H.yawRate || 0) * 0.06));

  H.mixer.update(dt);
  if (H.lean > 0.001 && H.bones.spine) H.bones.spine.rotateX(H.lean * 0.62);
  if (H.lean > 0.001 && H.bones.chest) H.bones.chest.rotateX(H.lean * 0.50);
  if (Math.abs(twist) > 0.002 && H.bones.chest) H.bones.chest.rotateY(twist * 0.55);
  if (Math.abs(twist) > 0.002 && H.bones.spine) H.bones.spine.rotateY(twist * 0.30);
  if (H.crouchV > 0.001 && H.bones.pelvis) H.bones.pelvis.position.y -= H.crouchV * 0.35;
  /* ③ 검 뒤로 — 돌진 중 오른팔을 진행 반대쪽으로 끌고, 칼끝을 아래로 눕힌다(잔상과 겹쳐 궤적이 길어진다). */
  const armTrailT = isDash ? 0.34 : 0;
  H.armTrail = (H.armTrail || 0) + (armTrailT - (H.armTrail || 0)) * (-Math.expm1(-dt * 12));
  if (H.armTrail > 0.004 && H.bones.upperarmR) {
    H.bones.upperarmR.rotateX(-H.armTrail * 0.9);
    H.bones.upperarmR.rotateZ(-H.armTrail * 0.35);
  }
  if (H.armTrail > 0.004 && H.bones.weapon) H.bones.weapon.rotateX(-H.armTrail * 0.55);

  H.t += dt;
  if (H.hd2d) tickHd2d(H.hd2d, group, HERO_CAM, { vx: dx / Math.max(dt, 1e-4), speed: sp, walking: H.base === 'walk', squash: H.squash }, dt);
  if (H.glb) tickHeroGlb(H.glb, H, dt);
  applyCloth(H, dt, dx / Math.max(dt, 1e-4), dz / Math.max(dt, 1e-4), sp);
  tickHeroCosmeticRig(group, H.t);
  return true;
}

/* 도포 자락·두건 끈: 2차 지연 스프링(프레임률 무관). */
function applyCloth(H, dt, vxSpeed, vzSpeed, sp) {
  clothStep(H, HERO.cloth, dt, vxSpeed, vzSpeed);
}

/* ---------------------------------------------------------------- v0.46 공용 먹 도구
   몬스터 3D 뼈대(v2/js/inkmonsters3d.js)가 주인공과 **같은** 계조·광원·먹선 규칙을 쓰도록
   셰이더 문자열과 형상 도구를 그대로 내보낸다. 톤이 갈라지지 않게 하는 것이 이 export 의 목적이다. */
export const INK3D = { LIGHT, FRAG, inkUniforms, outlineMat, applyThemeToInkUniforms };

export function kick(group, k) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return;
  startBurst(H, 'hit', 0.05);
  if (H.hd2d) triggerHd2dPose(H.hd2d, 'hit', 0.22);
  if (H.glb) triggerHeroGlbBurst(H.glb, 'hit');
}
export function slashPose(group, k, shape) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return;
  H.squash = shape === 'vee' ? 0.14 : (shape === 'vline' ? -0.07 : 0.09);
  H.squashV = shape === 'vee' ? -2.6 : -1.9;
  startBurst(H, 'slash', 0.06);
  if (H.hd2d) triggerHd2dPose(H.hd2d, 'slash', 0.28);
  if (H.glb) triggerHeroGlbBurst(H.glb, 'slash', shape);
}
export function block(group) {
  const H = group && group.userData && group.userData.h3d;
  if (H && H.glb) triggerHeroGlbBurst(H.glb, 'block');
}
export function comboStep(group) {
  const H = group && group.userData && group.userData.h3d;
  return (H && H.glb && H.glb.lastComboStep) || 1;
}
export function setOpacity(group, o) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return;
  H.opacity = o;
  if (group.userData.rig && group.userData.rig.kind === 'ghost') {
    group.userData.sprite.material.opacity = o;
    return;
  }
  if (H.hd2d) setHd2dOpacity(H.hd2d, o);
  if (H.glb) setHeroGlbOpacity(H.glb, o);
  for (let i = 0; i < H.meshes.length; i++) {
    const m = H.meshes[i].material;
    if (!m) continue;
    if (m.transparent !== (o < 0.999)) { m.transparent = o < 0.999; m.needsUpdate = true; }
    m.opacity = o;
  }
}
export function setTint(group, r, g, b) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return;
  H.tint = [r, g, b];
  if (H.hd2d) setHd2dTint(H.hd2d, r, g, b);
  if (H.glb) setHeroGlbTint(H.glb, r, g, b);
  for (let i = 0; i < H.uniforms.length; i++) {
    if (H.uniforms[i].uEnv) H.uniforms[i].uEnv.value.setRGB(r, g, b);
  }
}
export function setOrder(group, base) { return true; }
export function setAuraColor(group, hex, op) { return true; }
export function ready() { return true; }

export function info(group) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return null;
  const w = {};
  Object.keys(H.actions).forEach(function (k) {
    const a = H.actions[k];
    w[k] = { w: +a.getEffectiveWeight().toFixed(3), t: +a.time.toFixed(3), run: a.isRunning(), on: a.enabled };
  });
  return {
    mode: H.glb ? 'glb3d' : '3d', glb: !!H.glb, glbTris: H.glb ? H.glb.tris : 0,
    bones: Object.keys(H.bones).length, meshes: H.meshes.length,
    clips: Object.keys(H.clips), base: H.base, burst: H.burst,
    yawDeg: +(H.yaw * 180 / Math.PI).toFixed(1), speed: +H.speed.toFixed(2),
    mixerTime: +H.mixer.time.toFixed(2), actions: w,
    outline: OUTLINE_T, shadow: !!H.shadow, light: LIGHT
  };
}

/** QA: 클립을 특정 시각에 고정한다. o = { clip:'slash', t:0.14, yaw:45, freeze:1 } */
export function pin(group, o) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return null;
  o = o || {};
  H.freeze = !!o.freeze;
  if (o.yaw != null) {
    H.yaw = o.yaw * Math.PI / 180;
    H.yawTarget = H.yaw;
    group.rotation.y = H.yaw;
  }
  syncLights(H, group);
  if (o.clip) {
    Object.keys(H.actions).forEach(function (k) {
      const a = H.actions[k];
      a.stop();
      a.setEffectiveWeight(0);
      a.enabled = false;
    });
    const a = H.actions[o.clip];
    if (!a) return null;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    a.paused = true;
    a.time = o.t || 0;
    H.burst = (o.clip === 'slash' || o.clip === 'hit') ? o.clip : null;
    H.base = (o.clip === 'walk') ? 'walk' : 'idle';
    H.mixer.update(0);
    H.mixer.update(0.0001);
  }
  return info(group);
}

/** QA: n스텝 × dt 로 강제 진행하며 뼈 각도·위치를 기록한다(헤드리스 rAF 지연 우회). */
export function step(group, o) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return null;
  o = o || {};
  const n = o.n || 60, dt = o.dt || 1 / 60;
  const st = o.state || 'idle';
  const walk = o.walk || 0;
  const vx = o.vx == null ? 0 : o.vx, vz = o.vz == null ? 0 : o.vz;
  const x0 = group.position.x, z0 = group.position.z;
  H.freeze = false;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (walk) group.position.x = x0 + walk * (i + 1);
    tick(group, 'hero', st, dt, vx, vz);
    const b = H.bones;
    out.push({
      t: +((i + 1) * dt).toFixed(3),
      base: H.base, burst: H.burst, sp: +H.speed.toFixed(2),
      yaw: +(H.yaw * 180 / Math.PI).toFixed(1),
      thL: +b.thighL.rotation.x.toFixed(3), thR: +b.thighR.rotation.x.toFixed(3),
      shL: +b.shinL.rotation.x.toFixed(3), armR: +b.upperarmR.rotation.x.toFixed(3),
      pelY: +b.pelvis.position.y.toFixed(4),
      wR: +(H.actions.walk.getEffectiveWeight()).toFixed(3), wI: +(H.actions.idle.getEffectiveWeight()).toFixed(3),
      wS: +(H.actions.slash.getEffectiveWeight()).toFixed(3), wH: +(H.actions.hit.getEffectiveWeight()).toFixed(3)
    });
  }
  group.position.x = x0; group.position.z = z0;
  return out;
}

/** QA: 뼈·메시의 월드 바운딩 — 관절 분리·바닥 뚫림 검사. */
export function bounds(group) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return null;
  const v = new THREE.Vector3();
  const bones = {};
  let minY = 1e9, maxY = -1e9;
  Object.keys(H.bones).forEach(function (k) {
    H.bones[k].getWorldPosition(v);
    bones[k] = [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  });
  const box = new THREE.Box3();
  let meshMinY = 1e9, meshMaxY = -1e9;
  for (let i = 0; i < H.meshes.length; i++) {
    H.meshes[i].geometry.computeBoundingBox();
    box.copy(H.meshes[i].geometry.boundingBox).applyMatrix4(H.meshes[i].matrixWorld);
    if (box.min.y < meshMinY) meshMinY = box.min.y;
    if (box.max.y > meshMaxY) meshMaxY = box.max.y;
  }
  return { boneMinY: +minY.toFixed(3), boneMaxY: +maxY.toFixed(3), meshMinY: +meshMinY.toFixed(3), meshMaxY: +meshMaxY.toFixed(3), bones: bones };
}


/**
 * v0.70 치장(도포) + 무구 벼림 단계를 3D 영웅 메시의 수묵 셰이더 유니폼에 실시간 적용한다.
 * 능력치 변화 없음 — 순수 시각 효과.
 */
const CLOAK_SHADER_PROFILES = {
  ink:            { tint: 0xffffff, mix: 0.00, emissive: 0x000000, rimCol: 0xffe4ad, rim: 0.42, spec: 0.18 },
  snow_sage:      { tint: 0xeef9ff, mix: 0.82, emissive: 0x1d6878, rimCol: 0x8ef4ff, rim: 1.25, spec: 0.42 },
  crimson_guard:  { tint: 0xc21e1a, mix: 0.80, emissive: 0x540d0a, rimCol: 0xff6a45, rim: 1.40, spec: 0.48 },
  gilded_eclipse: { tint: 0x2a1f0e, mix: 0.68, emissive: 0x6b4c0e, rimCol: 0xffe066, rim: 1.75, spec: 0.72 }
};

function disposeCosmeticRig(group) {
  const old = group && group.userData && group.userData.cosmeticRig;
  if (!old) return;
  if (old.parent) old.parent.remove(old);
  old.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
      else o.material.dispose();
    }
  });
  group.userData.cosmeticRig = null;
}

function buildHeroCosmeticRig(cloakId, forgeLv) {
  const flv = Math.max(0, Math.min(3, forgeLv | 0));
  if (cloakId === 'ink' && flv <= 0) return null;
  const rig = new THREE.Group();
  rig.name = 'heroCosmeticRig';
  rig.userData.cloakId = cloakId;
  rig.userData.forgeLv = flv;
  const orbiters = [];
  let halo = null, floorRing = null, floorRing2 = null;

  const mkRing = function (rIn, rOut, color, op, y) {
    const geo = new THREE.RingGeometry(rIn, rOut, 40);
    const mat = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: op,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.y = y || 0.05;
    mesh.renderOrder = 4;
    rig.add(mesh);
    return mesh;
  };

  if (cloakId === 'snow_sage') {
    floorRing = mkRing(0.58, 0.78, 0x7ef2ff, 0.42, 0.05);
    floorRing2 = mkRing(0.84, 0.92, 0xd4fcff, 0.28, 0.06);
    const shardGeo = new THREE.OctahedronGeometry(0.085, 0);
    const shardMat = new THREE.MeshBasicMaterial({
      color: 0xbef8ff, transparent: true, opacity: 0.88,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(shardGeo, shardMat);
      m.scale.set(0.65, 1.45, 0.35);
      m.renderOrder = 9;
      rig.add(m);
      orbiters.push({ mesh: m, a0: (i / 6) * Math.PI * 2, r: 0.68 + (i % 2) * 0.16, y0: 0.55 + (i % 3) * 0.36, spd: 1.55, bob: 0.18 });
    }
  } else if (cloakId === 'crimson_guard') {
    floorRing = mkRing(0.60, 0.84, 0xff422e, 0.48, 0.05);
    floorRing2 = mkRing(0.88, 0.97, 0xffb454, 0.32, 0.06);
    halo = new THREE.Group();
    halo.position.set(0, 1.48, -0.26);
    const moonDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 32),
      new THREE.MeshBasicMaterial({ color: 0xb81614, transparent: true, opacity: 0.36, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const moonRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.032, 10, 42),
      new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.add(moonDisc); halo.add(moonRim);
    halo.renderOrder = 9;
    rig.add(halo);
    const emberGeo = new THREE.OctahedronGeometry(0.07, 0);
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xff7042, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(emberGeo, emberMat);
      m.scale.set(0.6, 1.6, 0.6);
      m.renderOrder = 9;
      rig.add(m);
      orbiters.push({ mesh: m, a0: (i / 8) * Math.PI * 2, r: 0.62 + (i % 2) * 0.18, y0: 0.35 + (i % 4) * 0.32, spd: 2.05, bob: 0.25, rise: true });
    }
  } else if (cloakId === 'gilded_eclipse') {
    floorRing = mkRing(0.62, 0.88, 0xffcf48, 0.56, 0.05);
    floorRing2 = mkRing(0.94, 1.06, 0xfff0a8, 0.38, 0.06);
    halo = new THREE.Group();
    halo.position.set(0, 1.52, -0.28);
    const eclipseCore = new THREE.Mesh(
      new THREE.CircleGeometry(0.44, 36),
      new THREE.MeshBasicMaterial({ color: 0x0a0704, transparent: true, opacity: 0.68, side: THREE.DoubleSide, depthWrite: false })
    );
    const outerGold = new THREE.Mesh(
      new THREE.TorusGeometry(0.50, 0.042, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd858, transparent: true, opacity: 0.96, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const innerGold = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.018, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xfff2b2, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.add(eclipseCore); halo.add(outerGold); halo.add(innerGold);
    const finialGeo = new THREE.OctahedronGeometry(0.075, 0);
    const finialMat = new THREE.MeshBasicMaterial({ color: 0xffe888, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2;
      const fin = new THREE.Mesh(finialGeo, finialMat);
      fin.position.set(Math.cos(ang) * 0.62, Math.sin(ang) * 0.62, 0);
      fin.scale.set(0.65, 1.4, 0.5);
      halo.add(fin);
    }
    rig.add(halo);
    const leafGeo = new THREE.PlaneGeometry(0.11, 0.22);
    const leafMat = new THREE.MeshBasicMaterial({ color: 0xffdf70, transparent: true, opacity: 0.92, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(leafGeo, leafMat);
      m.renderOrder = 9;
      rig.add(m);
      orbiters.push({ mesh: m, a0: (i / 10) * Math.PI * 2, r: 0.72 + (i % 3) * 0.14, y0: 0.42 + (i % 4) * 0.34, spd: 1.85, bob: 0.22, spin: true });
    }
  } else if (flv > 0) {
    /* 기본 도포라도 벼림 단계가 있으면 은은한 금빛 발밑 파문 표시 */
    floorRing = mkRing(0.55, 0.66 + flv * 0.04, 0xf2c864, 0.18 + flv * 0.09, 0.05);
  }

  rig.userData.anim = { halo: halo, floorRing: floorRing, floorRing2: floorRing2, orbiters: orbiters };
  return rig;
}

function tickHeroCosmeticRig(group, t) {
  const rig = group && group.userData && group.userData.cosmeticRig;
  if (!rig || !rig.userData.anim) return;
  const A = rig.userData.anim;
  if (A.floorRing) {
    const s = 1 + Math.sin(t * 2.8) * 0.06;
    A.floorRing.scale.set(s, s, 1);
    A.floorRing.rotation.z = t * 0.55;
  }
  if (A.floorRing2) {
    const s2 = 1 + Math.cos(t * 2.2) * 0.05;
    A.floorRing2.scale.set(s2, s2, 1);
    A.floorRing2.rotation.z = -t * 0.42;
  }
  if (A.halo) {
    A.halo.rotation.z = t * 0.65;
    A.halo.position.y = 1.48 + Math.sin(t * 2.4) * 0.05;
  }
  for (let i = 0; i < A.orbiters.length; i++) {
    const o = A.orbiters[i];
    const ang = o.a0 + t * o.spd;
    o.mesh.position.set(
      Math.cos(ang) * o.r,
      o.rise ? (0.2 + ((o.y0 + t * 0.55) % 1.45)) : (o.y0 + Math.sin(t * 2.6 + o.a0) * o.bob),
      Math.sin(ang) * o.r
    );
    o.mesh.rotation.y = -ang;
    if (o.spin) o.mesh.rotation.z = t * 2.2 + o.a0;
  }
}

/**
 * v0.71 치장(도포) + 무구 벼림 단계를 3D 영웅 메시의 수묵 셰이더와 전용 3D 후광·오라·파티클 리그에 실시간 적용한다.
 * 능력치 변화 없음 — 순수 시각 효과.
 */
export function applyHeroCloak3D(group, cloak, forgeLv) {
  if (!group || !cloak) return false;
  const cloakId = cloak.id || 'ink';
  const flv = Math.max(0, Math.min(3, forgeLv | 0));
  const prof = CLOAK_SHADER_PROFILES[cloakId] || CLOAK_SHADER_PROFILES.ink;
  const pal = cloak.palette || {};
  let updated = 0;
  group.traverse(function (o) {
    if (!o || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      const u = m && m.userData && m.userData.inkUniforms;
      if (!u) continue;
      if (u.uKeyCol && u.uKeyCol.value && pal.keyCol != null) u.uKeyCol.value.setHex(pal.keyCol).multiplyScalar(LIGHT.key);
      if (u.uFillCol && u.uFillCol.value && pal.fillCol != null) u.uFillCol.value.setHex(pal.fillCol).multiplyScalar(LIGHT.fill);
      if (u.uAmbCol && u.uAmbCol.value && pal.ambCol != null) u.uAmbCol.value.setHex(pal.ambCol).multiplyScalar(LIGHT.amb);
      if (u.uRimCol && u.uRimCol.value) u.uRimCol.value.setHex(prof.rimCol);
      if (u.uRim) u.uRim.value = prof.rim + flv * 0.12;
      if (u.uSpecAmt) u.uSpecAmt.value = prof.spec + flv * 0.06;
      if (u.uMistCol && u.uMistCol.value && pal.mistCol != null) u.uMistCol.value.setHex(pal.mistCol);
      if (u.uCloakTint && u.uCloakTint.value) u.uCloakTint.value.setHex(prof.tint);
      if (u.uCloakEmissive && u.uCloakEmissive.value) u.uCloakEmissive.value.setHex(prof.emissive);
      if (u.uCloakMix) u.uCloakMix.value = prof.mix;
      updated++;
    }
  });
  const H = group.userData && group.userData.hero3d;
  if (H) {
    H.lastCloakProf = prof;
    H.lastForgeLv = flv;
    if (H.hd2d) { applyHd2dCloak(H.hd2d, prof); updated++; }
    if (H.glb) { applyHeroGlbCloak(H.glb, prof, flv); updated++; }
  }
  const curRig = group.userData && group.userData.cosmeticRig;
  if (!curRig || curRig.userData.cloakId !== cloakId || curRig.userData.forgeLv !== flv) {
    disposeCosmeticRig(group);
    const nextRig = buildHeroCosmeticRig(cloakId, flv);
    if (nextRig) {
      group.add(nextRig);
      group.userData.cosmeticRig = nextRig;
    }
  }
  return updated > 0;
}

export function setCamera(c) { HERO_CAM = c; }

export function applySwordTrail(group, swordHex, coreHex, hotHex) {
  const H = group && group.userData && group.userData.h3d;
  if (H && H.glb) applyHeroGlbSwordTrail(H.glb, swordHex, coreHex, hotHex);
}
