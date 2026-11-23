/* v2/js/glbAnimMap.js — v0.80 Mesh2Motion / Mixamo / 외부 모션 GLB 자동 클립 매핑 & 리그 감지
   - Mesh2Motion(https://mesh2motion.org)에서 내보낸 다중 애니메이션 GLB를
     별도 리네이밍이나 Blender 재작업 없이 `v2/assets/models/`에 덮어쓰기만 하면 즉시 재생되도록 지원
   - 외부 모션 GLB가 감지되면 절차 자세 오버라이드(glbpose)를 자동 비활성화해 원본 모션을 100% 보존 */
import * as THREE from 'three';

const PROC_NAMES = { idle: 1, walk: 1, slash: 1, hit: 1 };

/**
 * Mesh2Motion / Mixamo 등 외부 리깅·애니메이션 GLB인지 판별한다.
 * (기존 postprocess_glb.py 출력은 본 이름이 정확히 hips/upperArm_R/thigh_L 등이고 클립이 소문자 idle/walk/slash/hit 4종)
 */
export function isExternalAnimGlb(scene, animations) {
  const anims = animations || [];
  let hasExternalName = false;
  for (let i = 0; i < anims.length; i++) {
    const nm = (anims[i] && anims[i].name) || '';
    if (nm && !PROC_NAMES[nm]) { hasExternalName = true; break; }
  }
  let hasExternalBone = false;
  let hasProcArm = false;
  if (scene && scene.traverse) {
    scene.traverse(function (o) {
      if (!o || !o.isBone) return;
      const n = o.name || '';
      if (/^(mixamorig|DEF-|ORG-|MCH-|LeftUpLeg|RightUpLeg|LeftArm|RightArm|Hips|Spine1|UpperArm_L)/i.test(n)) {
        hasExternalBone = true;
      }
      if (n === 'upperArm_R' || n === 'upperArm_L') hasProcArm = true;
    });
  }
  if (hasExternalBone && !hasProcArm) return true;
  if (hasExternalName && anims.length > 0) return true;
  return false;
}

function pickBestClip(anims, patterns) {
  for (let p = 0; p < patterns.length; p++) {
    const rx = patterns[p];
    for (let i = 0; i < anims.length; i++) {
      const n = (anims[i] && anims[i].name) || '';
      if (rx.test(n)) return anims[i];
    }
  }
  return null;
}

/**
 * GLB 내장 애니메이션 클립들을 심안 표준 슬롯(idle, walk, slash, attack, hit, cast, death)에 자동 매핑한다.
 */
export function mapGlbActions(mixer, animations, species) {
  const anims = animations || [];
  const actions = {};
  const byClip = new Map();

  function getAction(clip) {
    if (!clip) return null;
    if (byClip.has(clip)) return byClip.get(clip);
    const act = mixer.clipAction(clip);
    byClip.set(clip, act);
    return act;
  }

  /* 1) 정확히 일치하는 기존 이름 우선 등록 */
  for (let i = 0; i < anims.length; i++) {
    const c = anims[i];
    if (!c || !c.name) continue;
    const act = getAction(c);
    actions[c.name] = act;
    const low = c.name.toLowerCase();
    if (!actions[low]) actions[low] = act;
  }

  const fastRunner = (species === 'hero' || species === 'minion');

  /* 2) Mesh2Motion / Quaternius / Mixamo 이름 패턴 자동 매핑 */
  if (!actions.idle) {
    const c = pickBestClip(anims, [
      /^(idle|combat_idle|sword_idle|fighting_idle|zombie_idle)/i,
      /idle|breath|stand/i
    ]);
    if (c) actions.idle = getAction(c);
  }
  if (!actions.walk) {
    const c = pickBestClip(anims, fastRunner ? [
      /^(run|running|sprint|sword_run|zombie_run|jog)/i,
      /run|sprint|jog/i,
      /walk|march|strafe|move/i
    ] : [
      /^(walk|walking|heavy_walk|march|zombie_walk|mutant_walk)/i,
      /walk|march|stomp/i,
      /run|charge|sprint/i
    ]);
    if (c) actions.walk = getAction(c);
  }
  if (!actions.slash) {
    const c = pickBestClip(anims, [
      /slash|sword_attack|sword_swing|cleave|cut/i,
      /attack|strike|swing|swipe|punch|jab|kick/i
    ]);
    if (c) actions.slash = getAction(c);
  }
  if (!actions.attack) {
    actions.attack = actions.slash || getAction(pickBestClip(anims, [
      /attack|slash|strike|swing|swipe|punch|slam|cleave|bite/i
    ]));
  }
  if (!actions.hit) {
    const c = pickBestClip(anims, [
      /hit|impact|damage|hurt|stagger|recoil|knock|react/i
    ]);
    if (c) actions.hit = getAction(c);
  }
  if (!actions.cast) {
    const c = pickBestClip(anims, [
      /cast|spell|roar|chant|shout|taunt|magic/i
    ]);
    if (c) actions.cast = getAction(c);
  }
  if (!actions.death) {
    const c = pickBestClip(anims, [
      /death|die|dying|fall|defeat/i
    ]);
    if (c) actions.death = getAction(c);
  }

  /* 3) 최소 1개 클립이라도 있으면 idle 폴백 보장 */
  if (!actions.idle && anims.length > 0) {
    actions.idle = getAction(anims[0]);
  }

  /* 4) 단발 액션(공격·피격·시전·사망)은 LoopOnce 고정 */
  ['slash', 'attack', 'hit', 'cast', 'death'].forEach(function (k) {
    if (actions[k]) {
      actions[k].setLoop(THREE.LoopOnce, 1);
      actions[k].clampWhenFinished = true;
    }
  });

  return actions;
}
