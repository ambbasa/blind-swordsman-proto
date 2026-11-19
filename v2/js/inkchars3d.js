/* v2/js/inkchars3d.js — v0.40 Papertrails 종이 인형 파츠 리그(주인공·원귀·장정·돌덩이·보스).
   v0.38(머리/몸통/다리 3밴드)을 **부위별 관절**로 세분화했다:
     head · torso · arm_l · arm_r · skirt · leg_l · leg_r · cloak_f · cloak_b · cape · veil · crown
   - 파츠마다 manifest 가 피벗(pos=월드 m, c=텍스처 UV)을 들고 있어, 회전축이 정확히 어깨·목·허리에 있다.
   - 매 프레임 dt 기반 **임계 감쇠 스프링**으로 관절 각을 적분한다 → 상태가 바뀌어도(정지↔걷기↔대시)
     각이 튀지 않고 60fps 에서 미끄러지듯 이어진다.
   - 부모→자식 사슬: 몸통(허리) → 머리·팔·도포 자락, 다리는 허리 회전을 60%만 따른다.
   - 텍스처가 하나라도 없으면 null 을 돌려주고 art.js 가 기존 코드 드로잉으로 폴백한다. */
import * as THREE from 'three';
import { manifest, texOf, rigReady } from './inkcharart.js';

let CAM = null;
export function setCamera(c) { CAM = c; }
export function ready() { return rigReady(); }
export function manifestOf(name) { return (rigReady() && manifest[name]) || null; }

/* 종류별 움직임 상수 — 걷기 기준 속도, 바운스(m), 앞기울기(rad), 팔·다리·자락 진폭 */
const MOTION = {
  hero:  { walk: 1.7, bob: 0.075, lean: 0.13, sway: 0.010, arm: 0.62, leg: 0.46, cloth: 0.30, breath: 1.0, float: 0 },
  minion:{ walk: 1.15, bob: 0.055, lean: 0.10, sway: 0.018, arm: 0.22, leg: 0.0, cloth: 0.34, breath: 0.8, float: 0.05 },
  heavy: { walk: 1.00, bob: 0.062, lean: 0.09, sway: 0.013, arm: 0.34, leg: 0.30, cloth: 0.24, breath: 1.2, float: 0 },
  stone: { walk: 0.85, bob: 0.050, lean: 0.07, sway: 0.009, arm: 0.26, leg: 0.30, cloth: 0.10, breath: 0.9, float: 0 },
  boss:  { walk: 1.20, bob: 0.105, lean: 0.05, sway: 0.016, arm: 0.26, leg: 0.0, cloth: 0.26, breath: 1.4, float: 0 }
};

const BOSS_WEAPON = ['boss_weapon_sword', 'boss_weapon_spear', 'boss_weapon_staff', 'boss_weapon_sword'];
/* 보스 무기는 손 축에서 몸 바깥·뒤로 비껴 세운다 — 검신이 가슴을 가로지르지 않게. */
const BOSS_TOOL = { off: [0.35, -0.15], rot: -0.16, z: -0.05, scale: 0.95 };

function planeMesh(part, tex, opt) {
  opt = opt || {};
  const w = part.w, h = part.h;
  const geo = new THREE.PlaneGeometry(w, h, 1, 1);
  geo.translate((0.5 - part.c[0]) * w, (0.5 - part.c[1]) * h, 0);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: opt.depthTest === false ? false : true,
    alphaTest: opt.alphaTest != null ? opt.alphaTest : 0.04, side: THREE.DoubleSide,
    blending: opt.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    premultipliedAlpha: !opt.add,
    opacity: opt.opacity != null ? opt.opacity : 1, fog: true
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.userData.part = part;
  mat.userData.cardUpK = 1 / Math.max(0.05, h);
  mat.userData.cardUpC = part.c ? part.c[1] : 0.5;
  if (opt.color) mat.color.setHex(opt.color);
  return m;
}

/* --- 사슬 계산 도우미: 부모 피벗 회전을 자식 피벗 위치에 적용 --- */
function rot2(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
function chain(pp, pa, cp) {
  const d = rot2(cp[0] - pp[0], cp[1] - pp[1], pa);
  return [pp[0] + d[0], pp[1] + d[1]];
}
/* 임계 감쇠 스프링(프레임률 무관): 목표로 부드럽게 수렴 */
function spring(st, key, target, dt, k, damp) {
  const s = st[key] || (st[key] = { v: 0, x: target });
  s.v += ((target - s.x) * k - s.v * damp) * dt;
  s.x += s.v * dt;
  return s.x;
}

/**
 * 파츠 리그를 만든다. 없으면 null(폴백).
 * opt: { scale, bossVar, order, face, aura(opacity), tint, tools }
 */
export function buildFigure(name, opt) {
  if (!rigReady()) return null;
  const M = manifest[name];
  if (!M) return null;
  opt = opt || {};
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);
  const k = opt.scale || 1;
  root.scale.set(k, k, 1);
  const base = opt.order != null ? opt.order : (name === 'hero' ? 8 : 2);
  const rig = {
    name: name, fig: M, t: (opt.t0 != null ? opt.t0 : (name.length * 1.7 + 0.4)), phase: Math.random() * 6.28,
    speed: 0, lean: 0, face: opt.face || 1, px: 0, pz: 0, first: true,
    recoil: 0, recoilV: 0, arm: 0, k: k, base: base,
    parts: {}, angles: {}, st: {}, dashBlend: 0
  };
  M.parts.forEach(function (p) {
    const tex = texOf(p.f);
    if (!tex) return;
    const m = planeMesh(p, tex, { depthTest: false, opacity: opt.opacity != null ? opt.opacity : 1, add: !!opt.add });
    m.position.set(p.pos[0], p.pos[1], 0);
    m.renderOrder = base + (p.order || 0) * 0.05;
    m.userData.kind = p.kind;
    m.userData.pivot = p.pos;
    root.add(m);
    rig.parts[p.kind] = m;
  });
  if (!rig.parts.body) return null;
  /* 아우라: 실루엣 발광(색은 런타임에 갈아 끼운다 — 정예 금테·돌진형 파랑 등) */
  if (M.aura && opt.aura !== false) {
    const at = texOf(M.aura.f);
    if (at) {
      const am = planeMesh(M.aura, at, { add: true, depthTest: false, alphaTest: 0.01, opacity: opt.auraOpacity != null ? opt.auraOpacity : 0.5 });
      am.position.set(M.aura.pos[0], M.aura.pos[1], -0.01);
      am.renderOrder = base - 0.06;
      if (opt.auraColor) am.material.color.setHex(opt.auraColor);
      root.add(am);
      rig.aura = am;
    }
  }
  /* 손에 든 파츠(칼팔·보스 무기) */
  const tools = (manifest.tools || {});
  function addTool(toolName, jointName, dz, orderOff) {
    const P = tools[toolName];
    if (!P) return null;
    const tex = texOf(P.f);
    if (!tex) return null;
    const m = planeMesh(P, tex, { depthTest: false, opacity: opt.opacity != null ? opt.opacity : 1, add: !!opt.add });
    const j = (M.joints || {})[jointName] || [0, 0, 0];
    m.position.set(j[0], j[1], dz || 0);
    if (toolName.indexOf('boss_weapon') === 0) {
      m.position.set(j[0] + BOSS_TOOL.off[0], j[1] + BOSS_TOOL.off[1], BOSS_TOOL.z);
    }
    m.renderOrder = base + orderOff;
    root.add(m);
    return m;
  }
  const wants = opt.tools != null ? opt.tools : (name === 'hero' ? ['sash', 'arm'] : (name === 'boss' ? ['weapon'] : []));
  if (wants.indexOf('sash') >= 0) { rig.sash = addTool('hero_sash', 'waist', -0.02, -0.02); }
  if (wants.indexOf('arm') >= 0) {
    rig.armMesh = addTool('hero_arm_sword', 'shoulder_r', 0.03, 0.26);
    if (rig.armMesh) rig.armMesh.visible = false;
  }
  if (wants.indexOf('weapon') >= 0) {
    const wv = opt.bossVar != null ? opt.bossVar : 0;
    rig.weaponName = BOSS_WEAPON[wv % BOSS_WEAPON.length];
    rig.weapon = addTool(rig.weaponName, 'hand_r', 0.02, 0.26);
  }
  group.userData.rig = rig;
  group.userData.worldH = M.m * k;
  group.userData.parts = Object.keys(rig.parts).map(function (kk) { return rig.parts[kk]; })
    .concat([rig.sash, rig.armMesh, rig.weapon]).filter(Boolean);
  group.userData.sprite = rig.parts.body;
  group.userData.poseSource = 'rig';
  return group;
}

export function kick(group, strength) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  const s = strength == null ? 1 : strength;
  rig.recoilV += 5.2 * s;
}

export function setOpacity(group, o) {
  const ps = group && group.userData && group.userData.parts;
  if (!ps) return;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] && ps[i].material) ps[i].material.opacity = o;
  }
}

export function setTint(group, r, g, b) {
  const ps = group && group.userData && group.userData.parts;
  if (!ps) return;
  for (let i = 0; i < ps.length; i++) {
    const m = ps[i];
    if (m && m.material && m.material.color) m.material.color.setRGB(r, g, b);
  }
}

export function setAuraColor(group, hex, opacity) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig || !rig.aura) return;
  rig.aura.material.color.setHex(hex);
  if (opacity != null) rig.aura.material.opacity = opacity;
}

export function setOrder(group, base) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  rig.base = base;
  Object.keys(rig.parts).forEach(function (kind) {
    const m = rig.parts[kind];
    if (m) m.renderOrder = base + (m.userData.part ? (m.userData.part.order || 0) * 0.05 : 0);
  });
  if (rig.sash) rig.sash.renderOrder = base - 0.02;
  if (rig.armMesh) rig.armMesh.renderOrder = base + 0.26;
  if (rig.weapon) rig.weapon.renderOrder = base + 0.26;
  if (rig.aura) rig.aura.renderOrder = base - 0.06;
}

/** 한 프레임 포즈. state: idle/dash/walk/frozen/burning/poisoned, vx·vz: 향하는 방향(월드). */
export function tickFigure(group, kind, state, dt, vx, vz) {
  const ud = group && group.userData;
  const rig = ud && ud.rig;
  if (!rig) return false;
  if (rig.freeze) return true;          /* QA: 포즈를 고정해 스크린샷을 찍는다 */
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.1) dt = 0.1;
  const M = rig.fig;
  const C = MOTION[rig.name] || MOTION.minion;
  const root = group.children[0];
  const J = M.joints || {};
  const hip = J.hip || J.waist || [0, 0, 0];
  const neck = J.neck || [hip[0], hip[1] + M.m * 0.5];

  /* 이동 속도(게임이 placeGroup 으로 옮긴 위치 차분) — 걷기 위상의 근거 */
  const gx = group.position.x, gz = group.position.z;
  if (rig.first) { rig.px = gx; rig.pz = gz; rig.first = false; }
  const dx = gx - rig.px, dz = gz - rig.pz;
  rig.px = gx; rig.pz = gz;
  const spRaw = Math.sqrt(dx * dx + dz * dz) / dt;
  rig.speed += (Math.min(spRaw, 14) - rig.speed) * Math.min(1, dt * 9);
  rig.t += dt;
  const t = rig.t;
  const frozen = state === 'frozen';
  const walk = frozen ? 0 : Math.min(1, rig.speed / C.walk);
  const dashOn = state === 'dash';
  rig.dashBlend = spring(rig.st, 'dash', dashOn ? 1 : 0, dt, 90, 16);

  /* 좌우 반전: 화면 x 는 vx - vz 를 따른다(카메라가 +x+z 에서 본다). */
  const fd = (vx || 0) - (vz || 0);
  if (Math.abs(fd) > 0.05) rig.face = fd < 0 ? -1 : 1;
  group.scale.x = rig.face;

  if (!frozen) rig.phase += dt * (0.9 + rig.speed * 3.2);

  /* --- 스프링: 피격 반동 --- */
  rig.recoilV += (-rig.recoil * 130 - rig.recoilV * 13) * dt;
  rig.recoil += rig.recoilV * dt;

  /* --- 앞기울기·호흡 --- */
  const lean = spring(rig.st, 'lean', walk * C.lean + rig.dashBlend * 0.19, dt, 60, 11);
  rig.lean = lean;
  const breath = Math.sin(t * 1.45) * 0.6 + Math.sin(t * 0.63 + 1.7) * 0.4;
  const bAmp = frozen ? 0 : C.breath;
  const bob = frozen ? 0 : Math.abs(Math.sin(rig.phase)) * C.bob * walk
    + Math.sin(t * 1.1) * 0.0045 * bAmp
    + Math.sin(t * 0.47) * C.float * (0.6 + 0.4 * breath);
  root.position.y = bob - rig.dashBlend * 0.02;

  const q = CAM ? CAM.quaternion : null;
  function setPart(m, ang, px, py, sx, sy) {
    if (!m) return;
    if (q) m.quaternion.copy(q);
    m.rotateZ(ang);
    if (sx != null) m.scale.set(sx, sy == null ? sx : sy, 1);
    m.position.x = px;
    m.position.y = py;
  }

  /* --- 몸통: 허리 피벗 --- */
  const sway = Math.sin(rig.phase * 0.5) * C.sway * walk + Math.sin(t * 0.9) * 0.0035 * bAmp;
  const bodyAng = -lean + sway + rig.recoil * 0.55;
  const squash = 1 + breath * 0.0055 * bAmp - bob * 0.30;
  const hipX = hip[0] + rig.recoil * 0.06;
  setPart(rig.parts.body, bodyAng, hipX, hip[1], 1 / Math.sqrt(squash), squash);
  rig.dbg = { ang: bodyAng, bob: bob, lean: lean, dash: rig.dashBlend };

  /* --- 머리: 목 피벗, 몸통 회전의 절반 + 끄덕임 --- */
  if (rig.parts.head) {
    const np = chain([hipX, hip[1]], bodyAng, neck);
    const headAng = -lean * 0.45 - rig.recoil * 0.8 + Math.sin(t * 1.25) * 0.010 * bAmp
      + Math.sin(rig.phase * 0.5 + 0.6) * 0.012 * walk;
    setPart(rig.parts.head, bodyAng + headAng, np[0], np[1]);
    rig.dbg.headAng = headAng;
  }

  /* --- 팔: 어깨 피벗, 걷기 반대 위상 + 대시 휘두름 --- */
  function armPart(kind, side, jn) {
    const m = rig.parts[kind];
    if (!m) return;
    const sh = J[jn] || [hip[0] + side * M.m * 0.18, neck[1] - M.m * 0.06];
    const swing = Math.sin(rig.phase + (side > 0 ? 0 : Math.PI)) * C.arm * walk * 0.55
      + Math.sin(t * 1.1 + side) * 0.02 * bAmp;
    const dashA = rig.dashBlend * (side > 0 ? 1.05 : -0.45);
    const ang = -lean * 0.6 + swing * (side > 0 ? 1 : 0.8) + dashA + rig.recoil * 0.3 * side;
    const p = chain([hipX, hip[1]], bodyAng, sh);
    setPart(m, bodyAng + ang, p[0], p[1]);
  }
  armPart('arm_r', 1, 'shoulder_r');
  armPart('arm_l', -1, 'shoulder_l');

  /* --- 다리: 걷기 교차, 허리 회전은 60%만 따른다 --- */
  function legPart(kind, side) {
    const m = rig.parts[kind];
    if (!m) return;
    const ph = rig.phase + (side > 0 ? 0 : Math.PI);
    const ang = Math.sin(ph) * C.leg * walk
      + Math.sin(t * 1.2 + side * 1.7) * 0.008 * bAmp
      + (frozen ? 0 : 0);
    const pv = m.userData.pivot || [hip[0] + side * M.m * 0.05, hip[1]];
    const p = chain([hipX, hip[1]], bodyAng * 0.6, pv);
    setPart(m, bodyAng * 0.6 + ang, p[0], p[1]);
  }
  legPart('leg_r', 1);
  legPart('leg_l', -1);

  /* --- 도포 자락: 스프링으로 뒤로 늘어지며 펄럭인다 --- */
  function clothPart(kind, k, lag) {
    const m = rig.parts[kind];
    if (!m) return;
    const tgt = -(C.cloth * walk + 0.5 * lean) * k - 0.07 * Math.sin(t * 2.1 + lag)
      - rig.recoil * 0.4 * k - rig.dashBlend * 0.25 * k;
    const a = spring(rig.st, kind, tgt, dt, 70, 9.5);
    const pv = m.userData.pivot || hip;
    const p = chain([hipX, hip[1]], bodyAng, pv);
    setPart(m, bodyAng + a, p[0], p[1], 1 + Math.abs(a) * 0.05, 1 - Math.abs(a) * 0.03);
  }
  clothPart('cloak_f', 1.0, 0);
  clothPart('cloak_b', 1.25, 1.3);
  clothPart('skirt', 0.7, 0.4);
  clothPart('cape', 0.85, 0.8);

  /* --- 베일·연기·관: 머리를 따라 조금 늦게 흔들린다 --- */
  if (rig.parts.veil) {
    const pv = rig.parts.veil.userData.pivot || neck;
    const np = chain([hipX, hip[1]], bodyAng, pv);
    const a = Math.sin(t * 0.9) * 0.03 + Math.sin(t * 1.7 + 1.1) * 0.015;
    setPart(rig.parts.veil, bodyAng + a, np[0], np[1]);
  }
  if (rig.parts.crown) {
    const pv = rig.parts.crown.userData.pivot || neck;
    const np = chain([hipX, hip[1]], bodyAng, pv);
    const a = Math.sin(t * 1.3 + 0.4) * 0.018;
    setPart(rig.parts.crown, bodyAng + a, np[0], np[1]);
  }

  /* --- 칼팔: 대시 동안에만 나타나 어깨에서 크게 휘두른다 --- */
  if (rig.armMesh) {
    const on = dashOn ? 1 : 0;
    rig.arm += (on - rig.arm) * Math.min(1, dt * (on ? 16 : 7));
    rig.arm = Math.max(0, Math.min(1, rig.arm));
    rig.armMesh.visible = rig.arm > 0.02;
    if (rig.armMesh.visible) {
      const sh = J.shoulder_r || [hip[0] + M.m * 0.2, neck[1] - M.m * 0.05];
      const p = chain([hipX, hip[1]], bodyAng, sh);
      const swing = rig.arm * 0.85 - 0.35;
      setPart(rig.armMesh, bodyAng + swing, p[0], p[1]);
      rig.armMesh.material.opacity = Math.min(1, rig.arm * 1.6);
    }
  }

  /* --- 보스 무기: 손 축에서 느리게 흔들리고, 걸을 때 뒤로 끌린다 --- */
  if (rig.weapon) {
    const hd = J.hand_r || [hip[0] + M.m * 0.2, hip[1]];
    const wv = BOSS_TOOL.rot + Math.sin(t * 0.9) * 0.045 + Math.sin(t * 0.37 + 2.1) * 0.025
      - lean * 0.6 + rig.recoil * 0.4;
    const ws = BOSS_TOOL.scale;
    const p = chain([hipX, hip[1]], bodyAng, [hd[0] + BOSS_TOOL.off[0], hd[1] + BOSS_TOOL.off[1]]);
    setPart(rig.weapon, bodyAng + wv, p[0], p[1], ws);
  }

  /* --- 아우라: 몸통 기울기를 함께 따라가야 테가 몸에서 떨어져 보이지 않는다 --- */
  if (rig.aura) {
    if (q) rig.aura.quaternion.copy(q);
    rig.aura.rotateZ(bodyAng * 0.8);
    const as = 1 + breath * 0.008 * bAmp;
    rig.aura.scale.set(as, as, 1);
  }
  return true;
}
