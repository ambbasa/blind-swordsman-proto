/* v2/js/inkchars3d.js — v0.38 파츠 관절 리그(주인공·원혼·보스).
   비단 병풍 디오라마 파츠 PNG(inkcharart.js)를 관절별 메시로 세우고, 매 프레임 dt 기반
   사인 + 감쇠 스프링으로 몸통 호흡·기울기·걷기 바운스·띠 펄럭임·칼팔 휘두름·피격 반동을 만든다.
   - 프레임 시트 교체(8fps)가 아니라 매 프레임 연속 변형이라 60fps 에서 미끄러지듯 움직인다.
   - 파츠는 카메라를 바라보는 빌보드 메시다. Sprite 와 달리 음수 스케일이 실제로 좌우 반전되므로
     group.scale.x = ±1 로 좌우를 뒤집는다(기존 시트 스프라이트의 반전이 먹지 않던 문제도 함께 해결).
   - 텍스처가 없으면 null 을 돌려주고 art.js 가 기존 코드 드로잉으로 폴백한다. */
import * as THREE from 'three';
import { manifest, texOf, rigReady } from './inkcharart.js';

let CAM = null;
export function setCamera(c) { CAM = c; }
export function ready() { return rigReady(); }
export function manifestOf(name) { return (rigReady() && manifest[name]) || null; }

/* 종류별 움직임 상수 — 걷기 기준 속도, 바운스(m), 앞기울기(rad) */
const MOTION = {
  hero:   { walk: 1.7, bob: 0.085, lean: 0.13, sway: 0.011, legs: 1, sash: 1, arm: 1 },
  minion: { walk: 1.15, bob: 0.07, lean: 0.11, sway: 0.020, legs: 0, sash: 0 },
  heavy:  { walk: 1.0, bob: 0.075, lean: 0.09, sway: 0.014, legs: 1, sash: 0 },
  boss:   { walk: 1.2, bob: 0.12, lean: 0.05, sway: 0.018, legs: 0, sash: 0 }
};

const BOSS_WEAPON = ['boss_weapon_sword', 'boss_weapon_spear', 'boss_weapon_staff', 'boss_weapon_sword'];
/* 보스 무기는 손 축에서 몸 바깥·뒤로 비껴 세운다 — 검신이 가슴을 가로지르지 않게. */
const BOSS_TOOL = { off: [0.35, -0.15], rot: -0.16, z: -0.05, scale: 0.95 };

function planeMesh(part, tex, opt) {
  opt = opt || {};
  const w = part.w, h = part.h;
  const geo = new THREE.PlaneGeometry(w, h, 1, 1);
  /* 텍스처 안 피벗(c: 아래에서부터 정규화)을 메시 원점으로 옮긴다 → 관절 중심 회전. */
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
  if (opt.color) mat.color.setHex(opt.color);
  return m;
}

function jointOf(M, kind) {
  const J = M.joints || {};
  if (kind === 'legs') return J.hip || [0, 0, 0];
  if (kind === 'body') return J.hip || J.waist || [0, 0, 0];
  if (kind === 'head') return J.neck || [0, 0, 0];
  return [0, 0, 0];
}

/**
 * 파츠 리그를 만든다. 없으면 null(폴백).
 * opt: { scale, bossVar, order, face, aura(opacity), tint(0xrrggbb), tool: 'hero_sash'|'hero_arm_sword' }
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
  const rig = {
    name: name, fig: M, t: (opt.t0 != null ? opt.t0 : (name.length * 1.7 + 0.4)), phase: Math.random() * 6.28,
    speed: 0, lean: 0, face: opt.face || 1, px: 0, pz: 0, first: true,
    sashA: 0, sashV: 0, recoil: 0, recoilV: 0, arm: 0, k: k,
    parts: {}, order: opt.order != null ? opt.order : (name === 'hero' ? 8 : 2), base: opt.order != null ? opt.order : (name === 'hero' ? 8 : 2)
  };
  const ORDER = { legs: -0.04, body: 0, head: 0.03 };
  M.parts.forEach(function (p) {
    const tex = texOf(p.f);
    if (!tex) return;
    const m = planeMesh(p, tex, { depthTest: false, opacity: opt.opacity != null ? opt.opacity : 1, add: !!opt.add });
    const j = jointOf(M, p.kind);
    m.position.set(j[0], j[1], 0);
    m.renderOrder = rig.base + (ORDER[p.kind] || 0);
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
      am.renderOrder = rig.base - 0.06;
      if (opt.auraColor) am.material.color.setHex(opt.auraColor);
      root.add(am);
      rig.aura = am;
    }
  }
  /* 손에 든 파츠(띠·칼팔·보스 무기) */
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
    m.renderOrder = rig.base + orderOff;
    root.add(m);
    return m;
  }
  const wants = opt.tools != null ? opt.tools : (name === 'hero' ? ['sash', 'arm'] : (name === 'boss' ? ['weapon'] : []));
  if (wants.indexOf('sash') >= 0) { rig.sash = addTool('hero_sash', 'waist', -0.02, -0.02); }
  if (wants.indexOf('arm') >= 0) {
    rig.armMesh = addTool('hero_arm_sword', 'shoulder', 0.03, 0.05);
    if (rig.armMesh) rig.armMesh.visible = false;
  }
  if (wants.indexOf('weapon') >= 0) {
    const wv = opt.bossVar != null ? opt.bossVar : 0;
    rig.weaponName = BOSS_WEAPON[wv % BOSS_WEAPON.length];
    rig.weapon = addTool(rig.weaponName, 'hand', 0.02, 0.05);
  }
  group.userData.rig = rig;
  group.userData.worldH = M.m * k;
  group.userData.parts = [rig.parts.legs, rig.parts.body, rig.parts.head, rig.sash, rig.armMesh, rig.weapon].filter(Boolean);
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
/* 프리멀티플라이 PNG + material.premultipliedAlpha 로 그린다(밉맵 축소 시 사각 안개 방지). */

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
  const ORDER = { legs: -0.04, body: 0, head: 0.03 };
  Object.keys(rig.parts).forEach(function (kind) {
    const m = rig.parts[kind];
    if (m) m.renderOrder = base + (ORDER[kind] || 0);
  });
  if (rig.sash) rig.sash.renderOrder = base - 0.02;
  if (rig.armMesh) rig.armMesh.renderOrder = base + 0.05;
  if (rig.weapon) rig.weapon.renderOrder = base + 0.05;
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

  /* 좌우 반전: 화면 x 는 vx - vz 를 따른다(카메라가 +x+z 에서 본다). */
  const fd = (vx || 0) - (vz || 0);
  if (Math.abs(fd) > 0.05) rig.face = fd < 0 ? -1 : 1;
  group.scale.x = rig.face;

  if (!frozen) rig.phase += dt * (0.9 + rig.speed * 3.4);

  /* --- 스프링: 피격 반동 --- */
  rig.recoilV += (-rig.recoil * 130 - rig.recoilV * 13) * dt;
  rig.recoil += rig.recoilV * dt;

  /* --- 앞기울기(속도 추종) --- */
  const dashOn = state === 'dash';
  const leanT = walk * C.lean + (dashOn ? 0.19 : 0);
  rig.lean += (leanT - rig.lean) * Math.min(1, dt * 9);

  /* --- 호흡 --- */
  const breath = Math.sin(t * 1.45) * 0.6 + Math.sin(t * 0.63 + 1.7) * 0.4;
  const breathAmp = frozen ? 0 : 1;

  /* --- 걷기 바운스 --- */
  const bob = frozen ? 0 : Math.abs(Math.sin(rig.phase)) * C.bob * walk + Math.sin(t * 1.1) * 0.006 * breathAmp;
  root.position.y = bob;

  const q = CAM ? CAM.quaternion : null;
  function place(m, visAng, sx, sy, px, py) {
    if (!m) return;
    if (q) m.quaternion.copy(q);
    m.rotateZ(visAng);
    m.scale.set(sx || 1, sy || 1, 1);
    if (px != null) m.position.x = px;
    if (py != null) m.position.y = py;
  }

  /* 몸통: 히프(또는 허리) 축으로 앞기울기 + 좌우 흔들 + 피격 반동 */
  const sway = Math.sin(rig.phase * 0.5) * C.sway * walk + Math.sin(t * 0.9) * 0.004 * breathAmp;
  const bodyAng = -rig.lean + sway + rig.recoil * 0.55;
  rig.dbg = { ang: bodyAng, bob: bob, lean: rig.lean };
  const squash = 1 + breath * 0.006 * breathAmp - bob * 0.35;
  const jb = jointOf(M, 'body');
  place(rig.parts.body, bodyAng, 1 / Math.sqrt(squash), squash,
        jb[0] + rig.recoil * 0.06, jb[1]);

  /* 머리: 목 축 — 몸 기울기를 절반만 따라가고, 숨쉴 때 살짝 끄덕인다 */
  if (rig.parts.head) {
    const jh = jointOf(M, 'head');
    const headAng = -rig.lean * 0.45 - rig.recoil * 0.8 + Math.sin(t * 1.25) * 0.012 * breathAmp;
    rig.dbg.headAng = headAng;
    /* 목 위치를 몸통 회전에 맞춰 함께 옮긴다(관절이 붙어 있게) */
    const rx = jh[0] - jb[0], ry = jh[1] - jb[1];
    const ca = Math.cos(bodyAng), sa = Math.sin(bodyAng);
    place(rig.parts.head, bodyAng + headAng, 1, 1,
          jb[0] + rx * ca - ry * sa + rig.recoil * 0.05, jb[1] + rx * sa + ry * ca);
  }

  /* 다리: 히프 축 — 걸음마다 조금씩 앞뒤로 */
  if (rig.parts.legs) {
    const jl = jointOf(M, 'legs');
    const legAng = frozen ? 0 : Math.sin(rig.phase) * 0.05 * walk * C.legs;
    place(rig.parts.legs, legAng, 1, 1, jl[0], jl[1]);
  }

  /* 허리띠 자락: 스프링으로 뒤로 늘어지며 펄럭인다 */
  if (rig.sash) {
    const jw = (M.joints || {}).waist || [0, 0, 0];
    const target = -(0.30 * walk + 0.55 * rig.lean) - 0.10 * Math.sin(t * 2.15) - rig.recoil * 0.5;
    rig.sashV += (target - rig.sashA) * 60 * dt - rig.sashV * 7.5 * dt;
    rig.sashA += rig.sashV * dt;
    place(rig.sash, rig.sashA, 1, 1 + Math.sin(t * 1.8) * 0.03, jw[0], jw[1]);
  }

  /* 칼팔: 대시 동안에만 나타나 어깨에서 크게 휘두른다 */
  if (rig.armMesh) {
    const on = dashOn ? 1 : 0;
    rig.arm += (on - rig.arm) * Math.min(1, dt * (on ? 16 : 7));
    rig.arm = Math.max(0, Math.min(1, rig.arm));
    rig.armMesh.visible = rig.arm > 0.02;
    if (rig.armMesh.visible) {
      const js = (M.joints || {}).shoulder || [0, 0, 0];
      const swing = rig.arm * 0.85 - 0.35;
      place(rig.armMesh, swing, 1, 1, js[0], js[1]);
      rig.armMesh.material.opacity = Math.min(1, rig.arm * 1.6);
    }
  }

  /* 보스 무기: 손 축에서 느리게 흔들리고, 걸을 때 뒤로 끌린다 */
  if (rig.weapon) {
    const jh2 = (M.joints || {}).hand || [0, 0, 0];
    const wv = BOSS_TOOL.rot + Math.sin(t * 0.9) * 0.045 + Math.sin(t * 0.37 + 2.1) * 0.025 - rig.lean * 0.6 + rig.recoil * 0.4;
    const ws = BOSS_TOOL.scale;
    place(rig.weapon, wv, ws, ws, jh2[0] + BOSS_TOOL.off[0], jh2[1] + BOSS_TOOL.off[1]);
  }

  /* 아우라·그림자 빌보드 — 몸통 기울기를 함께 따라가야 테가 몸에서 떨어져 보이지 않는다 */
  if (rig.aura) {
    if (q) rig.aura.quaternion.copy(q);
    rig.aura.rotateZ(bodyAng * 0.8);
    const as = 1 + breath * 0.008 * breathAmp;
    rig.aura.scale.set(as, as, 1);
  }
  return true;
}
