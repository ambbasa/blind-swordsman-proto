/* v2/js/glbAnimMap.js — v0.83 Mesh2Motion / Mixamo / 외부 모션 GLB 자동 클립 매핑 & 리그 감지
   - 3연타 검술(slash / slash2 / slash3), 회피(dodge), 보스 강인도 경직(stagger), 사망(death)까지 자동 매핑
   - 외부 모션 GLB가 감지되면 절차 자세 오버라이드(glbpose)를 자동 비활성화해 원본 모션을 100% 보존 */
import * as THREE from 'three';

const PROC_NAMES = { idle: 1, walk: 1, slash: 1, hit: 1 };

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

  for (let i = 0; i < anims.length; i++) {
    const c = anims[i];
    if (!c || !c.name) continue;
    const act = getAction(c);
    actions[c.name] = act;
    const low = c.name.toLowerCase();
    if (!actions[low]) actions[low] = act;
  }

  const fastRunner = (species === 'hero' || species === 'minion');

  if (!actions.idle) {
    const c = pickBestClip(anims, [
      /^(m2m_idle|idle|combat_idle|sword_idle|fighting_idle|zombie_idle)$/i,
      /idle|breath|stand/i
    ]);
    if (c) actions.idle = getAction(c);
  }
  if (!actions.walk) {
    const c = pickBestClip(anims, fastRunner ? [
      /^(m2m_walk|run|running|sprint|sword_run|zombie_run|jog)$/i,
      /run|sprint|jog/i,
      /walk|march|strafe|move/i
    ] : [
      /^(m2m_walk|walk|walking|heavy_walk|march|zombie_walk|mutant_walk)$/i,
      /walk|march|stomp/i,
      /run|charge|sprint/i
    ]);
    if (c) actions.walk = getAction(c);
  }
  if (!actions.slash) {
    const c = pickBestClip(anims, [
      /^(m2m_slash|slash)$/i,
      /slash(?![23])|sword_attack|sword_swing|cleave|cut/i,
      /attack|strike|swing|swipe|punch|jab|kick/i
    ]);
    if (c) actions.slash = getAction(c);
  }
  if (!actions.slash2) {
    const c = pickBestClip(anims, [
      /slash2|regular[_-]?b/i
    ]);
    if (c) actions.slash2 = getAction(c);
  }
  if (!actions.slash3) {
    const c = pickBestClip(anims, [
      /slash3|regular[_-]?c/i
    ]);
    if (c) actions.slash3 = getAction(c);
  }
  if (!actions.dodge) {
    const c = pickBestClip(anims, [
      /dodge|roll|dash|evade/i
    ]);
    if (c) actions.dodge = getAction(c);
  }
  if (!actions.block) {
    const c = pickBestClip(anims, [
      /block|parry|guard/i
    ]);
    if (c) actions.block = getAction(c);
  }
  if (!actions.slam) {
    const c = pickBestClip(anims, [
      /slam|overhead/i
    ]);
    if (c) actions.slam = getAction(c);
  }
  if (!actions.attack) {
    actions.attack = actions.slash || getAction(pickBestClip(anims, [
      /attack|slash|strike|swing|swipe|punch|slam|cleave|bite/i
    ]));
  }
  if (!actions.hit) {
    const c = pickBestClip(anims, [
      /^(m2m_hit|hit)$/i,
      /hit|impact|damage|hurt|recoil|react/i
    ]);
    if (c) actions.hit = getAction(c);
  }
  if (!actions.stagger) {
    const c = pickBestClip(anims, [
      /stagger|knockback|kneel|stun/i
    ]);
    if (c) actions.stagger = getAction(c);
  }
  if (!actions.cast) {
    const c = pickBestClip(anims, [
      /cast|spell|roar|chant|shout|taunt|magic|burst/i
    ]);
    if (c) actions.cast = getAction(c);
  }
  if (!actions.death) {
    const c = pickBestClip(anims, [
      /death|die|dying|fall|defeat/i
    ]);
    if (c) actions.death = getAction(c);
  }

  if (!actions.idle && anims.length > 0) {
    actions.idle = getAction(anims[0]);
  }

  ['slash', 'slash2', 'slash3', 'dodge', 'block', 'slam', 'attack', 'hit', 'stagger', 'cast', 'death'].forEach(function (k) {
    if (actions[k]) {
      actions[k].setLoop(THREE.LoopOnce, 1);
      actions[k].clampWhenFinished = true;
    }
  });

  return actions;
}
