/* v2/js/inkchars3d.js — v0.41 종이 인형 '관절 + 다중 프레임' 리그(주인공·원귀·장정·돌덩이·보스).

   v0.40(파츠 하나 = 정지 그림 한 장)에서 두 가지를 더했다.
   1) **관절 세분화**: 위팔/아래팔(팔꿈치) · 허벅지/정강이(무릎) · 자락 두 마디(자락 중간).
      회전축이 어깨·팔꿈치·허리·무릎·자락 중간에 생겨, 얇은 팔·다리가 막대처럼 돌지 않는다.
   2) **동작 프레임**: 파츠 PNG 는 동작별 그림 여러 장을 가로로 이은 스트립이다(manifest `nf`).
      런타임은 UV 오프셋(uFo/uFo2)과 섞기 값(uMix)만 바꿔 두 프레임을 **연속으로 섞는다** —
      텍스처 교체·재링크 없이 걷기·돌진·베기·피격에 맞춰 종이 그림이 늘었다 줄었다 접힌다.

   · 모든 각은 임계 감쇠 스프링으로 적분(프레임률 무관, 60fps 에서 미끄러지듯).
   · 부모→자식 사슬: 몸통(허리) → 머리·어깨·팔꿈치·자락, 다리는 허리 회전의 60%만.
   · 텍스처가 하나라도 없으면 null → art.js 가 기존 코드 드로잉으로 폴백. */
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
const BOSS_TOOL = { off: [0.35, -0.15], rot: -0.16, z: -0.05, scale: 0.95 };

/* ---------- 프레임 스트립 재질: 한 장의 텍스처에서 두 프레임을 UV 로 골라 섞는다 ---------- */
function frameMaterial(part, tex, opt) {
  opt = opt || {};
  const nf = Math.max(1, part.nf || 1);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: opt.depthTest === false ? false : true,
    alphaTest: opt.alphaTest != null ? opt.alphaTest : 0.04, side: THREE.DoubleSide,
    blending: opt.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    premultipliedAlpha: !opt.add,
    opacity: opt.opacity != null ? opt.opacity : 1, fog: true
  });
  if (opt.color) mat.color.setHex(opt.color);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  const u = {
    uFs: { value: new THREE.Vector2(1 / nf, 1) },
    uFo: { value: new THREE.Vector2(0, 0) },
    uFo2: { value: new THREE.Vector2(nf > 1 ? 1 / nf : 0, 0) },
    uMix: { value: 0 },
    uInset: { value: 0.0035 }
  };
  mat.userData.frameU = u;
  mat.userData.nf = nf;
  mat.onBeforeCompile = function (sh) {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uFs;\nuniform vec2 uFo;\nuniform vec2 uFo2;\nuniform float uMix;\nuniform float uInset;')
      .replace('#include <map_fragment>', [
        'vec2 inkUv = vec2(uFo.x + uInset + vMapUv.x * (uFs.x - uInset * 2.0), vMapUv.y);',
        'vec4 inkA = texture2D(map, inkUv);',
        '#ifdef INK_FRAME_BLEND',
        'vec2 inkUv2 = vec2(uFo2.x + uInset + vMapUv.x * (uFs.x - uInset * 2.0), vMapUv.y);',
        'vec4 inkB = texture2D(map, inkUv2);',
        'vec4 sampledDiffuseColor = mix(inkA, inkB, uMix);',
        '#else',
        'vec4 sampledDiffuseColor = inkA;',
        '#endif',
        'diffuseColor *= sampledDiffuseColor;'
      ].join('\n'));
  };
  if (nf > 1) mat.defines = Object.assign({}, mat.defines, { INK_FRAME_BLEND: 1 });
  mat.customProgramCacheKey = function () { return 'inkframe' + nf + (opt.add ? 'a' : ''); };
  return mat;
}

function planeMesh(part, tex, opt) {
  opt = opt || {};
  const w = part.w, h = part.h;
  const geo = new THREE.PlaneGeometry(w, h, 1, 1);
  geo.translate((0.5 - part.c[0]) * w, (0.5 - part.c[1]) * h, 0);
  const mat = frameMaterial(part, tex, opt);
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.userData.part = part;
  mat.userData.cardUpK = 1 / Math.max(0.05, h);
  mat.userData.cardUpC = part.c ? part.c[1] : 0.5;
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
/* 프레임 오실레이터: 0..nf-1 을 연속으로 오가며 두 프레임을 섞는다({a,b,mix}). */
function frameBlend(mat, v) {
  const u = mat && mat.userData && mat.userData.frameU;
  if (!u) return;
  const nf = mat.userData.nf || 1;
  if (nf <= 1) return;
  if (v < 0) v = 0;
  if (v > nf - 1.0001) v = nf - 1.0001;
  const a = Math.floor(v);
  const f = v - a;
  u.uFo.value.x = a / nf;
  u.uFo2.value.x = (a + 1) / nf;
  u.uMix.value = f;
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
    parts: {}, st: {}, dashBlend: 0, slash: 0, hit: 0, bossAct: 0, frameOf: {}
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

/** 피격 반동 — 맞은 순간 프레임도 접힌 자세로 튄다. */
export function kick(group, strength) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  const s = strength == null ? 1 : strength;
  rig.recoilV += 5.2 * s;
  rig.hit = Math.min(1.4, rig.hit + 0.85 * s);
}

/** 베기 시작 — 대시/일섬 순간에 팔·몸통 프레임이 베는 자세로 빠르게 넘어간다. */
export function slashPose(group, k) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  rig.slash = Math.min(1.4, rig.slash + (k == null ? 0.9 : k));
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

/** 한 프레임 포즈. state: idle/dash/walk/frozen/burning/poisoned/boss:<상태>, vx·vz: 향하는 방향(월드). */
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
  const st = (state || '') + '';
  /* 보스 상태(게임이 'boss:walk' 처럼 넘긴다) → 기모으기/강공 프레임 */
  let bossWind = 0, bossStrike = 0;
  if (st.indexOf('boss:') === 0) {
    const bs = st.slice(5);
    if (bs === 'wind' || bs === 'telegraph' || bs === 'cast' || bs === 'seal' || bs === 'sealing') bossWind = 1;
    if (bs === 'charge' || bs === 'strike' || bs === 'shuffle' || bs === 'groggy' || bs === 'stun') bossStrike = 1;
  }

  /* 이동 속도(게임이 placeGroup 으로 옮긴 위치 차분) — 걷기 위상의 근거 */
  const gx = group.position.x, gz = group.position.z;
  if (rig.first) { rig.px = gx; rig.pz = gz; rig.first = false; }
  const dx = gx - rig.px, dz = gz - rig.pz;
  rig.px = gx; rig.pz = gz;
  const spRaw = Math.sqrt(dx * dx + dz * dz) / dt;
  rig.speed += (Math.min(spRaw, 14) - rig.speed) * Math.min(1, dt * 9);
  rig.t += dt;
  const t = rig.t;
  const frozen = st === 'frozen';
  const walk = frozen ? 0 : Math.min(1, rig.speed / C.walk);
  const dashOn = st === 'dash';
  rig.dashBlend = spring(rig.st, 'dash', dashOn ? 1 : 0, dt, 90, 16);
  /* 베기·피격 자세 시계 */
  rig.slash = Math.max(0, rig.slash - dt * 3.4);
  rig.hit = Math.max(0, rig.hit - dt * 5.0);
  const slash = Math.min(1, rig.slash);
  const hit = Math.min(1, rig.hit);

  /* 좌우 반전: 화면 x 는 vx - vz 를 따른다(카메라가 +x+z 에서 본다). */
  const fd = (vx || 0) - (vz || 0);
  if (Math.abs(fd) > 0.05) rig.face = fd < 0 ? -1 : 1;
  group.scale.x = rig.face;

  if (!frozen) rig.phase += dt * (0.9 + rig.speed * 3.2);

  /* --- 스프링: 피격 반동 --- */
  rig.recoilV += (-rig.recoil * 130 - rig.recoilV * 13) * dt;
  rig.recoil += rig.recoilV * dt;

  /* --- 앞기울기·호흡 --- */
  const lean = spring(rig.st, 'lean', walk * C.lean + rig.dashBlend * 0.19 + slash * 0.10
    + bossWind * 0.085 - bossStrike * 0.06, dt, 60, 11);
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
  /* 몸통 프레임: 베기(젖힘) · 피격(눌림) · 호흡 */
  if (rig.parts.body) {
    const nf = (rig.parts.body.userData.part.nf || 1);
    let v = 1.0;
    if (nf > 1) {
      v = 1.0 + Math.sin(t * 1.15) * 0.22 * bAmp;
      v += slash * (1.1 + 0.9 * Math.sin(Math.min(1, slash) * 3.14));
      v -= hit * 0.9;
      v += bossWind * 1.15 + bossStrike * 0.75;
      v += walk * 0.18 * Math.sin(rig.phase);
    }
    frameBlend(rig.parts.body.material, v);
  }
  rid(rig, 'body');

  /* --- 머리: 목 피벗, 몸통 회전의 절반 + 끄덕임 --- */
  if (rig.parts.head) {
    const np = chain([hipX, hip[1]], bodyAng, neck);
    const headAng = -lean * 0.45 - rig.recoil * 0.8 + Math.sin(t * 1.25) * 0.010 * bAmp
      + Math.sin(rig.phase * 0.5 + 0.6) * 0.012 * walk - slash * 0.18 + hit * 0.22;
    setPart(rig.parts.head, bodyAng + headAng, np[0], np[1]);
    const nfh = rig.parts.head.userData.part.nf || 1;
    if (nfh > 1) frameBlend(rig.parts.head.material, 0.8 + Math.sin(t * 0.75) * 0.55 + slash * 1.2 - hit * 0.7 + bossWind * 1.4 - bossStrike * 0.9);
  }

  /* --- 팔: 소매 한 장(주인공·원귀) 또는 위팔·아래팔 두 마디(맨팔) --- */
  function armPart(side, jn, tag) {
    const one = rig.parts['arm_' + tag];
    const up = rig.parts['arm_' + tag + '_up'];
    const lo = rig.parts['arm_' + tag + '_lo'];
    if (!one && !up && !lo) return;
    const sh = J[jn] || [hip[0] + side * M.m * 0.18, neck[1] - M.m * 0.06];
    const ph = rig.phase + (side > 0 ? 0 : Math.PI);
    const swing = Math.sin(ph) * C.arm * walk * 0.55 + Math.sin(t * 1.1 + side) * 0.02 * bAmp;
    const dashA = rig.dashBlend * (side > 0 ? 1.05 : -0.45);
    const slashA = side > 0 ? slash * 1.35 : -slash * 0.35;
    const shAngle = -lean * 0.6 + swing * (side > 0 ? 1 : 0.8) + dashA + slashA
      + rig.recoil * 0.3 * side + hit * (side > 0 ? 0.5 : -0.3);
    const p = chain([hipX, hip[1]], bodyAng, sh);
    if (one) {
      /* 소매는 어깨에서 통째로 흔들리고, 프레임이 옷자락 출렁임을 맡는다. */
      setPart(one, bodyAng + shAngle * 0.78, p[0], p[1]);
      const nf = one.userData.part.nf || 1;
      if (nf > 1) {
        let v = 1.0 + Math.sin(ph + 0.4) * 0.85 * walk;
        v += slash * (side > 0 ? 1.4 : 0.5) + rig.dashBlend * 0.7 - hit * 0.7;
        frameBlend(one.material, v);
      }
      rid(rig, 'arm_' + tag);
      return;
    }
    setPart(up, bodyAng + shAngle, p[0], p[1]);
    const el = J['elbow_' + tag];
    if (lo && el) {
      const d2 = rot2(el[0] - sh[0], el[1] - sh[1], shAngle);
      const elPos = [p[0] + d2[0], p[1] + d2[1]];
      const bendT = -(0.12 + walk * 0.16 + Math.max(0, Math.sin(ph)) * 0.10);
      const bend = spring(rig.st, 'elbow_' + tag, bendT, dt, 70, 10);
      setPart(lo, bodyAng + shAngle + bend, elPos[0], elPos[1]);
      const nf = lo.userData.part.nf || 1;
      if (nf > 1) {
        let v = 1.0 + Math.sin(ph + 0.5) * 0.55 * walk;
        v += slash * (side > 0 ? 1.5 : 0.6);
        v -= hit * 0.8;
        frameBlend(lo.material, v);
      }
    } else if (up) {
      const nf = up.userData.part.nf || 1;
      if (nf > 1) frameBlend(up.material, 1.0 + Math.sin(ph) * 0.5 * walk + slash);
    }
    rid(rig, 'arm_' + tag);
  }
  armPart(1, 'shoulder_r', 'r');
  armPart(-1, 'shoulder_l', 'l');

  /* --- 다리: 한 마디(부츠) 또는 허벅지·정강이 두 마디(맨다리) --- */
  function legPart(side, tag) {
    const one = rig.parts['leg_' + tag];
    const up = rig.parts['leg_' + tag + '_up'];
    const lo = rig.parts['leg_' + tag + '_lo'];
    if (!one && !up && !lo) return;
    const ph = rig.phase + (side > 0 ? 0 : Math.PI);
    const root0 = one || up;
    const hipP = root0.userData.pivot || [hip[0] + side * M.m * 0.05, hip[1]];
    const p = chain([hipX, hip[1]], bodyAng * 0.6, hipP);
    const swing = Math.sin(ph) * C.leg * walk + Math.sin(t * 1.2 + side * 1.7) * 0.008 * bAmp;
    setPart(root0, bodyAng * 0.6 + swing, p[0], p[1]);
    if (one) {
      const nf = one.userData.part.nf || 1;
      if (nf > 1) frameBlend(one.material, 0.9 + Math.sin(ph + 1.4) * 0.8 * walk + rig.dashBlend * 0.9 + slash * 0.3);
      rid(rig, 'leg_' + tag);
      return;
    }
    if (lo) {
      const kn = J['knee_' + tag];
      const ang = kn ? [kn[0] - hipP[0], kn[1] - hipP[1]] : [0, 0];
      const d2 = rot2(ang[0], ang[1], swing);
      const knPos = [p[0] + d2[0], p[1] + d2[1]];
      const bendT = Math.max(0, Math.sin(ph + 1.2)) * 0.55 * walk + rig.dashBlend * 0.45
        + Math.max(0, -Math.sin(ph)) * 0.10;
      const bend = spring(rig.st, 'knee_' + tag, bendT, dt, 80, 11);
      setPart(lo, bodyAng * 0.6 + swing - bend, knPos[0], knPos[1]);
      const nf = lo.userData.part.nf || 1;
      if (nf > 1) frameBlend(lo.material, 0.9 + Math.sin(ph + 1.4) * 0.75 * walk + rig.dashBlend * 0.9 + slash * 0.3);
    }
    rid(rig, 'leg_' + tag);
  }
  legPart(1, 'r');
  legPart(-1, 'l');


  /* --- 자락: 두 마디(허리 → 중간)로 늘어지며 펄럭인다 --- */
  function clothPair(ka, kb, amp, lag) {
    const a = rig.parts[ka], b = rig.parts[kb];
    if (!a && !b) return;
    const pv = a ? (a.userData.pivot || hip) : hip;
    const tgt = -(C.cloth * walk + 0.5 * lean) * amp - 0.07 * Math.sin(t * 2.1 + lag)
      - rig.recoil * 0.4 * amp - rig.dashBlend * 0.25 * amp;
    const angA = spring(rig.st, ka, tgt, dt, 70, 9.5);
    const p0 = chain([hipX, hip[1]], bodyAng, pv);
    setPart(a, bodyAng + angA, p0[0], p0[1], 1 + Math.abs(angA) * 0.05, 1 - Math.abs(angA) * 0.03);
    if (b) {
      const mid = b.userData.pivot || pv;
      const d = rot2(mid[0] - pv[0], mid[1] - pv[1], angA);
      const p1 = [p0[0] + d[0], p0[1] + d[1]];
      const angB = spring(rig.st, kb, angA * 0.75 + tgt * 0.55, dt, 58, 9.0);
      setPart(b, bodyAng + angB, p1[0], p1[1], 1 + Math.abs(angB) * 0.06, 1 - Math.abs(angB) * 0.04);
      const nf = b.userData.part.nf || 1;
      if (nf > 1) frameBlend(b.material, 1.0 + Math.sin(t * 1.9 + lag) * 0.7 + Math.abs(angB) * 1.2 * (nf - 1) / 1.2);
    }
    const nfa = a ? (a.userData.part.nf || 1) : 1;
    if (a && nfa > 1) frameBlend(a.material, 1.0 + Math.sin(t * 1.6 + lag + 0.7) * 0.6 + Math.abs(angA) * 1.0 * (nfa - 1));
    rid(rig, ka);
  }
  clothPair('cloak_f_a', 'cloak_f_b', 1.0, 0);
  clothPair('cloak_b_a', 'cloak_b_b', 1.25, 1.3);
  clothPair('skirt_a', 'skirt_b', 0.7, 0.4);
  clothPair('cape_a', 'cape_b', 0.85, 0.8);

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
    const a = Math.sin(t * 1.3 + 0.4) * 0.018 + slash * 0.05;
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
      const swing = rig.arm * 0.85 - 0.35 + slash * 0.5;
      setPart(rig.armMesh, bodyAng + swing, p[0], p[1]);
      rig.armMesh.material.opacity = Math.min(1, rig.arm * 1.6);
    }
  }

  /* --- 보스 무기: 손 축에서 느리게 흔들리고, 걸을 때 뒤로 끌린다 --- */
  if (rig.weapon) {
    const hd = J.hand_r || [hip[0] + M.m * 0.2, hip[1]];
    const wv = BOSS_TOOL.rot + Math.sin(t * 0.9) * 0.045 + Math.sin(t * 0.37 + 2.1) * 0.025
      - lean * 0.6 + rig.recoil * 0.4 + slash * 0.8;
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

function rid(rig, key) {
  if (!rig.frameOf) rig.frameOf = {};
  rig.frameOf[key] = 1;
}
function vib(rig, key) { return 0; }
