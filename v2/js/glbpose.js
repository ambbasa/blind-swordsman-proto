/* v2/js/glbpose.js — v0.79.2 GLB 리그 절차 자세 레이어 (대기·걷기·공격·피격)

   5종 GLB(hero/minion/heavy/stone/boss)는 Hunyuan3D 단일 메쉬 + 표준 17본 리그를 쓰지만,
   내장 클립(idle/walk/slash/hit)의 키가 골반·발목에서 거의 정지해 있어(hips 2키, foot 2키)
   걷기가 미끄러지고 대기가 꼿꼿했다. 이 모듈은 mixer.update 이후 **본 쿼터니언을 다시 써서**
   모델 축 기준 관절 각도를 얹는다.

   · 축 규칙(실측 캘리브레이션): 리그 정면 = +Z.
       rx > 0  — 위로 뻗은 뼈(척추·가슴·목·머리)는 앞으로 숙이고,
                 아래로 뻗은 뼈(허벅지·정강이·위팔·아래팔)은 뒤로 젖힌다.
       ry > 0  — 몸을 왼쪽으로 튼다.
       rz > 0  — 위로 뻗은 뼈는 오른쪽(-X)으로 기울고, 오른팔은 몸쪽(안쪽), 왼팔은 바깥쪽.
                 즉 팔 벌리기 = 왼팔 +rz / 오른팔 -rz.
   · 로컬 변환: bone.quaternion = (P0⁻¹ · R · P0) · q0  (P0 = 부모의 rest 월드 쿼터니언, q0 = rest 로컬)
   · 접지: 자세를 적용한 뒤 두 발바닥의 월드 y 를 해석적 FK 로 재서 가장 낮은 발이 지면(y=0)에
     닿도록 골반 높이를 보정한다 — 무릎을 굽혀도 발이 뜨지 않는다.
   · 전이: 상태가 바뀌면 이전 자세에서 0.16초(공격·피격은 0.07초) 동안 섞는다.
*/
import * as THREE from 'three';

const DEG = Math.PI / 180;

const BONE_KEYS = {
  hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head',
  armL: 'upperArm_L', foreL: 'forearm_L', handL: 'hand_L',
  armR: 'upperArm_R', foreR: 'forearm_R', handR: 'hand_R',
  thighL: 'thigh_L', shinL: 'shin_L', footL: 'foot_L',
  thighR: 'thigh_R', shinR: 'shin_R', footR: 'foot_R'
};
const KEYS = Object.keys(BONE_KEYS);

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _w = new THREE.Vector3();

/* ---------------------------------------------------------------- 리그 수집 */
export function makeRig(root) {
  root.updateMatrixWorld(true);
  const bones = {};
  root.traverse(function (o) {
    if (!o.isBone || bones.__done) return;
    for (let i = 0; i < KEYS.length; i++) {
      if (BONE_KEYS[KEYS[i]] === o.name) { if (!bones[KEYS[i]]) bones[KEYS[i]] = o; break; }
    }
  });
  if (!bones.hips || !bones.spine) return null;
  const M = {}, Minv = {}, q0 = {};
  for (let i = 0; i < KEYS.length; i++) {
    const b = bones[KEYS[i]];
    if (!b) continue;
    b.parent.getWorldQuaternion(_q);
    M[KEYS[i]] = _q.clone();
    Minv[KEYS[i]] = _q.clone().invert();
    q0[KEYS[i]] = b.quaternion.clone();
  }
  /* 골반 부모(아마튜어)의 월드 행렬 — 접지 FK 의 시작점. GLB 씬 스케일까지 포함한다. */
  bones.hips.parent.updateWorldMatrix(true, false);
  const parentWorld = bones.hips.parent.matrixWorld.clone();
  const hipsPos = bones.hips.position.clone();
  /* 발바닥 접지점 — rest 자세에서 발목 바로 아래(y=0) 지면 점을 발뼈 로컬 좌표로 옮겨 둔다.
     자세가 바뀌면 이 점이 발과 함께 움직이므로 발이 뜨고 파묻히는지 정확히 잰다. */
  const sole = {};
  for (let i = 0; i < 2; i++) {
    const s = i ? 'R' : 'L';
    const f = bones['foot' + s];
    if (f) {
      f.updateWorldMatrix(true, false);
      f.getWorldPosition(_w);
      const inv = new THREE.Matrix4().copy(f.matrixWorld).invert();
      sole[s] = new THREE.Vector3(_w.x, 0, _w.z).applyMatrix4(inv);
    } else sole[s] = new THREE.Vector3(0, -0.1, 0);
  }
  const scale = bones.hips.parent.getWorldScale(new THREE.Vector3()).y || 1;
  return {
    root: root, bones: bones, M: M, Minv: Minv, q0: q0,
    parentWorld: parentWorld, hipsPos: hipsPos, sole: sole, scale: scale,
    pose: null, from: null, blendT: 0, blendDur: 0.16,
    state: 'idle', t: Math.random() * 6, phase: Math.random() * 6.28,
    aT: 0, hT: 0, cT: 0, attackU: 0, speed: 0
  };
}

/* ---------------------------------------------------------------- 자세 자료 구조 */
function blank() {
  const o = { hipsPos: [0, 0, 0], ground: true };
  for (let i = 0; i < KEYS.length; i++) o[KEYS[i]] = [0, 0, 0];
  return o;
}
function put(dst, src) {
  if (!src) return dst;
  for (const k in src) {
    if (k === 'hipsPos') dst.hipsPos = src.hipsPos.slice();
    else if (k === 'ground') dst.ground = src.ground;
    else if (dst[k] && src[k]) { dst[k][0] = src[k][0]; dst[k][1] = src[k][1]; dst[k][2] = src[k][2]; }
  }
  return dst;
}
function add(dst, k, x, y, z) {
  const a = dst[k];
  if (!a) return;
  a[0] += x || 0; a[1] += y || 0; a[2] += z || 0;
}
/* 발목을 지면과 수평으로 — 허벅지·정강이 누적 회전을 상쇄한다. k<1 이면 살짝 들린 발끝. */
function levelFoot(P, s, k) {
  const f = P['foot' + s];
  f[0] = -(P['thigh' + s][0] + P['shin' + s][0]) * (k == null ? 0.92 : k);
  return f;
}
function lerpPose(a, b, k) {
  const o = blank();
  o.ground = b.ground;
  for (let i = 0; i <= KEYS.length; i++) {
    const key = i < KEYS.length ? KEYS[i] : 'hipsPos';
    const p = a[key], q = b[key];
    o[key][0] = p[0] + (q[0] - p[0]) * k;
    o[key][1] = p[1] + (q[1] - p[1]) * k;
    o[key][2] = p[2] + (q[2] - p[2]) * k;
  }
  return o;
}
function smooth(x) { return x * x * (3 - 2 * x); }

/* 키프레임 표: [[t, {부위:[x,y,z]...}], ...] 를 이어 붙인다. */
function timeline(list, u) {
  if (u <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    if (u <= list[i][0]) {
      const a = list[i - 1], b = list[i];
      const k = smooth(Math.max(0, Math.min(1, (u - a[0]) / Math.max(1e-5, b[0] - a[0]))));
      const o = {};
      for (const key in b[1]) {
        const p = a[1][key] || [0, 0, 0], q = b[1][key];
        o[key] = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
      }
      for (const key in a[1]) if (!b[1][key]) o[key] = a[1][key];
      return o;
    }
  }
  return list[list.length - 1][1];
}

/* ---------------------------------------------------------------- 주인공 */
/* 무사 대기 — 오른발 뒤·무릎 굽힌 낮은 자세, 검이 앞을 겨눈 중단세 */
const HERO_IDLE = {
  hips: [0, -4, 0], spine: [14, -7, 1], chest: [9, -6, 0], neck: [-6, 7, 0], head: [-4, 6, 0],
  armR: [-40, 8, -10], foreR: [-40, 0, 4], handR: [42, 0, 0],
  armL: [-20, 0, 12], foreL: [-52, 0, 0], handL: [0, 0, 0],
  thighL: [-18, 0, 4], shinL: [34, 0, 0], footL: [-15, 0, 0],
  thighR: [11, 0, -5], shinR: [21, 0, 0], footR: [-29, 0, 0]
};

function heroPose(st, u) {
  const P = blank();
  if (st === 'walk') {
    const p = u * Math.PI * 2;
    const s = Math.sin(p), c = Math.cos(p);
    put(P, HERO_IDLE);
    P.spine[0] += 6; P.chest[0] += 4;
    /* 다리 교차 — 앞으로 나가는 다리 -34°, 뒤로 가는 다리 +26° */
    P.thighL[0] = -14 - 20 * s;
    P.thighR[0] = 9 + 19 * s;
    P.shinL[0] = 22 + 22 * Math.max(0, -s) + 6 * Math.max(0, s);
    P.shinR[0] = 16 + 24 * Math.max(0, s) + 6 * Math.max(0, -s);
    levelFoot(P, 'L', 0.86);
    levelFoot(P, 'R', 0.86);
    /* 팔 — 검을 뒤로 뺀 채 몸통과 반대로 흔든다 */
    P.armR[0] = -34 - 18 * s;
    P.armR[2] = -12;
    P.foreR[0] = -44;
    P.handR[0] = 38;
    P.armL[0] = -18 + 28 * s;
    P.foreL[0] = -58 - 12 * s;
    /* 상체 바운스·좌우 흔들림 */
    add(P, 'hips', 0, 0, -2.6 * c);
    add(P, 'chest', 0, 3 * c, 0);
    add(P, 'head', 0, -2.4 * c, 0);
    add(P, 'hipsPos', 0, 0.012 * Math.max(0, Math.abs(s) - 0.4), 0);
    return P;
  }
  if (st === 'attack') {
    /* 일섬 — 오른어깨 뒤로 젖힘 → 몸통 회전 → 큰 대각 베기 → 팔로우 스루 → 복귀 */
    const k = timeline([
      [0.00, HERO_IDLE],
      [0.18, {   /* 예비: 몸을 오른쪽으로 비틀고 검을 머리 뒤 오른쪽으로 */
        hips: [0, -26, 0], spine: [2, -24, -4], chest: [0, -22, -5], neck: [4, 24, 0], head: [4, 22, 0],
        armR: [-118, 16, -34], foreR: [-54, 0, 8], handR: [8, 0, 14],
        armL: [-42, 0, 22], foreL: [-70, 0, 0], handL: [0, 0, 0],
        thighL: [-26, 0, 5], shinL: [44, 0, 0], footL: [-16, 0, 0],
        thighR: [18, 0, -7], shinR: [30, 0, 0], footR: [-40, 0, 0]
      }],
      [0.34, {   /* 타격: 몸통이 왼쪽으로 돌며 검을 사선으로 내리긋는다 */
        hips: [8, 20, 0], spine: [22, 20, 0], chest: [17, 24, 3], neck: [-6, -14, 0], head: [-4, -12, 0],
        armR: [-104, -6, 4], foreR: [-20, 0, 0], handR: [26, 0, -4],
        armL: [16, 0, 16], foreL: [-40, 0, 0], handL: [0, 0, 0],
        thighL: [-26, 0, 4], shinL: [38, 0, 0], footL: [-10, 0, 0],
        thighR: [18, 0, -5], shinR: [26, 0, 0], footR: [-34, 0, 0]
      }],
      [0.52, {   /* 팔로우 스루: 몸통이 더 돌고 팔은 왼쪽 아래로 흘러간다 */
        hips: [6, 28, 0], spine: [26, 24, 1], chest: [21, 28, 4], neck: [-8, -18, 0], head: [-6, -16, 0],
        armR: [-72, -18, 26], foreR: [-34, 0, 0], handR: [24, 0, 0],
        armL: [26, 0, 20], foreL: [-46, 0, 0], handL: [0, 0, 0],
        thighL: [-28, 0, 4], shinL: [40, 0, 0], footL: [-8, 0, 0],
        thighR: [19, 0, -5], shinR: [28, 0, 0], footR: [-36, 0, 0]
      }],
      [0.76, {   /* 복귀 */
        hips: [1, 6, 0], spine: [15, 2, 1], chest: [10, 3, 0], neck: [-6, 2, 0], head: [-4, 2, 0],
        armR: [-44, 6, -8], foreR: [-44, 0, 4], handR: [38, 0, 0],
        armL: [-20, 0, 14], foreL: [-58, 0, 0], handL: [0, 0, 0],
        thighL: [-26, 0, 5], shinL: [42, 0, 0], footL: [-14, 0, 0],
        thighR: [17, 0, -7], shinR: [28, 0, 0], footR: [-38, 0, 0]
      }],
      [1.00, HERO_IDLE]
    ], u);
    put(P, k);
    return P;
  }
  if (st === 'hit') {
    const k = Math.sin(Math.min(1, u) * Math.PI);
    put(P, HERO_IDLE);
    add(P, 'spine', -16 * k, 9 * k, 0);
    add(P, 'chest', -11 * k, 6 * k, 0);
    add(P, 'head', -14 * k, 0, 0);
    add(P, 'thighL', -8 * k, 0, 0);
    add(P, 'thighR', 7 * k, 0, 0);
    return P;
  }
  /* idle — 호흡·미세한 무게 이동 */
  put(P, HERO_IDLE);
  const b = Math.sin(u * Math.PI * 2);
  const b2 = Math.sin(u * Math.PI * 4 + 0.6);
  add(P, 'spine', b * 1.8, 0, b2 * 0.9);
  add(P, 'chest', b * 2.2, 0, b2 * 0.7);
  add(P, 'head', -b * 1.8, b * 0.8, 0);
  add(P, 'armR', b * 2.4, 0, 0);
  add(P, 'foreR', b * 2.0, 0, 0);
  add(P, 'armL', b * 1.8, 0, 0);
  add(P, 'hipsPos', 0, b * 0.006, 0);
  return P;
}

/* ---------------------------------------------------------------- 원귀(조선 좀비) */
const MINION_IDLE = {
  hips: [6, -5, 3], spine: [22, 4, -5], chest: [15, 7, -4], neck: [12, -7, 2], head: [16, -9, 5],
  armR: [-72, 0, -12], foreR: [-46, 0, 0], handR: [-16, 0, 0],
  armL: [-66, 0, 14], foreL: [-40, 0, 0], handL: [-14, 0, 0],
  thighL: [-18, 0, 4], shinL: [34, 0, 0], footL: [-15, 0, 0],
  thighR: [12, 0, -4], shinR: [26, 0, 0], footR: [-34, 0, 0]
};

function minionPose(st, u) {
  const P = blank();
  if (st === 'walk') {
    const p = u * Math.PI * 2;
    const s = Math.sin(p), c = Math.cos(p);
    put(P, MINION_IDLE);
    /* 비틀거리는 보행 — 한쪽 어깨가 처지고 몸이 좌우로 크게 흔들린다 */
    add(P, 'hips', 0, 0, 7 * s);
    add(P, 'spine', 0, 4 * c, 6 * s);
    add(P, 'chest', 0, 5 * c, 5 * s);
    add(P, 'head', 3 * c, 0, -6 * s);
    P.thighL[0] = -18 - 30 * s;
    P.thighR[0] = 12 + 26 * s;
    P.shinL[0] = 30 + 26 * Math.max(0, -s);
    P.shinR[0] = 24 + 30 * Math.max(0, s);
    levelFoot(P, 'L', 0.8);
    levelFoot(P, 'R', 0.8);
    P.armR[0] = -66 + 16 * s;
    P.armL[0] = -62 - 16 * s;
    P.foreR[0] = -48 - 10 * s;
    P.foreL[0] = -42 + 10 * s;
    add(P, 'hipsPos', 0, 0.01 * Math.max(0, Math.abs(s) - 0.5), 0);
    return P;
  }
  if (st === 'attack') {
    const k = timeline([
      [0.00, MINION_IDLE],
      [0.20, {   /* 예비: 양팔을 번쩍 들고 상체를 뒤로 젖힌다 */
        hips: [-8, 0, 0], spine: [-8, 0, 0], chest: [-5, 0, 0], neck: [18, 0, 0], head: [20, 0, 0],
        armR: [-172, 0, -20], foreR: [-12, 0, 0], handR: [-20, 0, 0],
        armL: [-168, 0, 22], foreL: [-14, 0, 0], handL: [-18, 0, 0],
        thighL: [-14, 0, 4], shinL: [24, 0, 0], footL: [-10, 0, 0],
        thighR: [10, 0, -4], shinR: [20, 0, 0], footR: [-28, 0, 0]
      }],
      [0.34, {   /* 덮치기 직전 — 상체가 앞으로 쏠리며 팔이 내려온다 */
        hips: [6, 0, 0], spine: [20, 0, 0], chest: [14, 0, 0], neck: [-12, 0, 0], head: [-10, 0, 0],
        armR: [-56, 0, -14], foreR: [-20, 0, 0], handR: [-30, 0, 0],
        armL: [-52, 0, 16], foreL: [-22, 0, 0], handL: [-28, 0, 0],
        thighL: [-22, 0, 4], shinL: [34, 0, 0], footL: [-10, 0, 0],
        thighR: [12, 0, -4], shinR: [18, 0, 0], footR: [-26, 0, 0]
      }],
      [0.46, {   /* 내리찍은 뒤 웅크림 */
        hips: [8, 0, 0], spine: [22, 0, 0], chest: [15, 0, 0], neck: [-14, 0, 0], head: [-12, 0, 0],
        armR: [-26, 0, -8], foreR: [-34, 0, 0], handR: [-34, 0, 0],
        armL: [-22, 0, 10], foreL: [-36, 0, 0], handL: [-32, 0, 0],
        thighL: [-24, 0, 4], shinL: [38, 0, 0], footL: [-8, 0, 0],
        thighR: [12, 0, -4], shinR: [16, 0, 0], footR: [-26, 0, 0]
      }],
      [0.72, {   /* 천천히 일어나며 팔을 앞으로 다시 뻗는다 */
        hips: [4, -2, 2], spine: [14, 2, -3], chest: [10, 5, -3], neck: [4, -4, 0], head: [9, -6, 3],
        armR: [-54, 0, -12], foreR: [-42, 0, 0], handR: [-22, 0, 0],
        armL: [-50, 0, 14], foreL: [-38, 0, 0], handL: [-18, 0, 0],
        thighL: [-22, 0, 4], shinL: [38, 0, 0], footL: [-12, 0, 0],
        thighR: [14, 0, -4], shinR: [28, 0, 0], footR: [-34, 0, 0]
      }],
      [1.00, MINION_IDLE]
    ], u);
    put(P, k);
    return P;
  }
  if (st === 'hit') {
    const k = Math.sin(Math.min(1, u) * Math.PI);
    put(P, MINION_IDLE);
    add(P, 'spine', -20 * k, 0, 7 * k);
    add(P, 'chest', -13 * k, 0, 5 * k);
    add(P, 'head', -18 * k, 0, 0);
    add(P, 'armR', 14 * k, 0, 0);
    add(P, 'armL', 12 * k, 0, 0);
    return P;
  }
  put(P, MINION_IDLE);
  const b = Math.sin(u * Math.PI * 2);
  add(P, 'spine', b * 2.6, b * 2, 0);
  add(P, 'chest', b * 3.2, b * 2.6, 0);
  add(P, 'head', -b * 3.2, -b * 2, b * 2);
  add(P, 'armR', b * 3.4, 0, b * 1.6);
  add(P, 'armL', -b * 3.4, 0, -b * 1.6);
  add(P, 'hips', 0, 0, b * 1.8);
  return P;
}

/* ---------------------------------------------------------------- 거구(장정) */
const HEAVY_IDLE = {
  hips: [3, 0, 0], spine: [11, 0, -1], chest: [9, 0, -1], neck: [-7, 0, 0], head: [-5, 0, 0],
  armR: [-18, 0, -24], foreR: [-30, 0, 0], handR: [-6, 0, 0],
  armL: [-18, 0, 24], foreL: [-30, 0, 0], handL: [-6, 0, 0],
  thighL: [-14, 0, 8], shinL: [26, 0, 0], footL: [-12, 0, 0],
  thighR: [10, 0, -8], shinR: [22, 0, 0], footR: [-30, 0, 0]
};

function heavyPose(st, u) {
  const P = blank();
  if (st === 'walk') {
    const p = u * Math.PI * 2;
    const s = Math.sin(p), c = Math.cos(p);
    put(P, HEAVY_IDLE);
    add(P, 'hips', 0, 0, 5.5 * s);
    add(P, 'spine', 0, -3 * c, 4 * s);
    add(P, 'chest', 0, 4.5 * c, 3.5 * s);
    add(P, 'head', 0, -2 * c, -3.4 * s);
    P.thighL[0] = -14 - 22 * s;
    P.thighR[0] = 10 + 20 * s;
    P.shinL[0] = 24 + 20 * Math.max(0, -s);
    P.shinR[0] = 20 + 24 * Math.max(0, s);
    levelFoot(P, 'L', 0.84);
    levelFoot(P, 'R', 0.84);
    P.armR[0] = -16 + 14 * s;
    P.armL[0] = -16 - 14 * s;
    P.armR[2] = -24 - 5 * Math.abs(s);
    P.armL[2] = 24 + 5 * Math.abs(s);
    add(P, 'hipsPos', 0, 0.012 * Math.max(0, Math.abs(s) - 0.5), 0);
    return P;
  }
  if (st === 'attack') {
    const k = timeline([
      [0.00, HEAVY_IDLE],
      [0.22, {   /* 예비: 팔을 옆으로 크게 벌려 뒤로 젖힌다 */
        hips: [-5, 0, 0], spine: [-10, 0, 0], chest: [-7, 0, 0], neck: [14, 0, 0], head: [16, 0, 0],
        armR: [-78, 0, -48], foreR: [-32, 0, 0], handR: [-10, 0, 0],
        armL: [-78, 0, 48], foreL: [-32, 0, 0], handL: [-10, 0, 0],
        thighL: [-12, 0, 8], shinL: [22, 0, 0], footL: [-10, 0, 0],
        thighR: [8, 0, -8], shinR: [18, 0, 0], footR: [-24, 0, 0]
      }],
      [0.38, {   /* 내려치기 — 상체가 크게 앞으로, 두 팔이 앞 아래로 */
        hips: [6, 0, 0], spine: [18, 0, 0], chest: [13, 0, 0], neck: [-11, 0, 0], head: [-9, 0, 0],
        armR: [-34, 0, -22], foreR: [-16, 0, 0], handR: [-18, 0, 0],
        armL: [-34, 0, 22], foreL: [-16, 0, 0], handL: [-18, 0, 0],
        thighL: [-20, 0, 8], shinL: [32, 0, 0], footL: [-10, 0, 0],
        thighR: [12, 0, -8], shinR: [16, 0, 0], footR: [-26, 0, 0]
      }],
      [0.52, {
        hips: [7, 0, 0], spine: [20, 0, 0], chest: [14, 0, 0], neck: [-12, 0, 0], head: [-10, 0, 0],
        armR: [-30, 0, -18], foreR: [-26, 0, 0], handR: [-20, 0, 0],
        armL: [-30, 0, 18], foreL: [-26, 0, 0], handL: [-20, 0, 0],
        thighL: [-22, 0, 8], shinL: [36, 0, 0], footL: [-8, 0, 0],
        thighR: [13, 0, -8], shinR: [18, 0, 0], footR: [-28, 0, 0]
      }],
      [0.78, {
        hips: [5, 0, 0], spine: [15, 0, -1], chest: [12, 0, -1], neck: [-9, 0, 0], head: [-7, 0, 0],
        armR: [-20, 0, -25], foreR: [-30, 0, 0], handR: [-8, 0, 0],
        armL: [-20, 0, 25], foreL: [-30, 0, 0], handL: [-8, 0, 0],
        thighL: [-16, 0, 8], shinL: [28, 0, 0], footL: [-12, 0, 0],
        thighR: [11, 0, -8], shinR: [24, 0, 0], footR: [-32, 0, 0]
      }],
      [1.00, HEAVY_IDLE]
    ], u);
    put(P, k);
    return P;
  }
  if (st === 'hit') {
    const k = Math.sin(Math.min(1, u) * Math.PI);
    put(P, HEAVY_IDLE);
    add(P, 'spine', -13 * k, 0, 5 * k);
    add(P, 'chest', -9 * k, 0, 3.5 * k);
    add(P, 'head', -11 * k, 0, 0);
    return P;
  }
  put(P, HEAVY_IDLE);
  const b = Math.sin(u * Math.PI * 2);
  add(P, 'spine', b * 1.8, 0, 0);
  add(P, 'chest', b * 2.2, 0, 0);
  add(P, 'head', -b * 1.6, 0, 0);
  add(P, 'armR', b * 2.2, 0, -b * 1.6);
  add(P, 'armL', b * 2.2, 0, b * 1.6);
  add(P, 'hips', 0, 0, b * 0.9);
  return P;
}

/* ---------------------------------------------------------------- 석인(돌덩이) */
const STONE_IDLE = {
  hips: [3, 0, 0], spine: [7, 0, 0], chest: [6, 0, 0], neck: [-3, 0, 0], head: [-2, 0, 0],
  armR: [-12, 0, -28], foreR: [-18, 0, 0], handR: [0, 0, 0],
  armL: [-12, 0, 28], foreL: [-18, 0, 0], handL: [0, 0, 0],
  thighL: [-12, 0, 10], shinL: [22, 0, 0], footL: [-10, 0, 0],
  thighR: [8, 0, -10], shinR: [18, 0, 0], footR: [-24, 0, 0]
};

function stonePose(st, u) {
  const P = blank();
  if (st === 'walk') {
    const p = u * Math.PI * 2;
    const s = Math.sin(p), c = Math.cos(p);
    put(P, STONE_IDLE);
    add(P, 'hips', 0, 0, 3.6 * s);
    add(P, 'spine', 0, 0, 2.6 * s);
    add(P, 'chest', 0, 2.4 * c, 2.4 * s);
    add(P, 'head', 0, 0, -2.4 * s);
    P.thighL[0] = -12 - 20 * s;
    P.thighR[0] = 10 + 18 * s;
    P.shinL[0] = 22 + 18 * Math.max(0, -s);
    P.shinR[0] = 18 + 20 * Math.max(0, s);
    levelFoot(P, 'L', 0.86);
    levelFoot(P, 'R', 0.86);
    P.armR[0] = -12 + 10 * s;
    P.armL[0] = -12 - 10 * s;
    add(P, 'hipsPos', 0, 0.01 * Math.max(0, Math.abs(s) - 0.5), 0);
    return P;
  }
  if (st === 'attack') {
    const k = timeline([
      [0.00, STONE_IDLE],
      [0.24, {   /* 팔을 위로 치켜든다 */
        hips: [-4, 0, 0], spine: [-6, 0, 0], chest: [-3, 0, 0], neck: [10, 0, 0], head: [10, 0, 0],
        armR: [-156, 0, -28], foreR: [-20, 0, 0], handR: [-8, 0, 0],
        armL: [-156, 0, 28], foreL: [-20, 0, 0], handL: [-8, 0, 0],
        thighL: [-12, 0, 10], shinL: [22, 0, 0], footL: [-10, 0, 0],
        thighR: [8, 0, -10], shinR: [18, 0, 0], footR: [-24, 0, 0]
      }],
      [0.40, {   /* 내리찍기 */
        hips: [5, 0, 0], spine: [17, 0, 0], chest: [12, 0, 0], neck: [-10, 0, 0], head: [-8, 0, 0],
        armR: [-8, 0, -20], foreR: [-14, 0, 0], handR: [-16, 0, 0],
        armL: [-8, 0, 20], foreL: [-14, 0, 0], handL: [-16, 0, 0],
        thighL: [-18, 0, 10], shinL: [30, 0, 0], footL: [-10, 0, 0],
        thighR: [12, 0, -10], shinR: [16, 0, 0], footR: [-26, 0, 0]
      }],
      [0.56, {
        hips: [6, 0, 0], spine: [19, 0, 0], chest: [13, 0, 0], neck: [-11, 0, 0], head: [-9, 0, 0],
        armR: [-32, 0, -16], foreR: [-22, 0, 0], handR: [-18, 0, 0],
        armL: [-32, 0, 16], foreL: [-22, 0, 0], handL: [-18, 0, 0],
        thighL: [-20, 0, 10], shinL: [34, 0, 0], footL: [-10, 0, 0],
        thighR: [13, 0, -10], shinR: [18, 0, 0], footR: [-28, 0, 0]
      }],
      [0.80, {
        hips: [5, 0, 0], spine: [11, 0, 0], chest: [9, 0, 0], neck: [-5, 0, 0], head: [-4, 0, 0],
        armR: [-14, 0, -28], foreR: [-18, 0, 0], handR: [0, 0, 0],
        armL: [-14, 0, 28], foreL: [-18, 0, 0], handL: [0, 0, 0],
        thighL: [-14, 0, 10], shinL: [24, 0, 0], footL: [-10, 0, 0],
        thighR: [10, 0, -10], shinR: [20, 0, 0], footR: [-26, 0, 0]
      }],
      [1.00, STONE_IDLE]
    ], u);
    put(P, k);
    return P;
  }
  if (st === 'hit') {
    const k = Math.sin(Math.min(1, u) * Math.PI);
    put(P, STONE_IDLE);
    add(P, 'spine', -9 * k, 0, 2.4 * k);
    add(P, 'chest', -6 * k, 0, 0);
    add(P, 'head', -9 * k, 0, 0);
    return P;
  }
  put(P, STONE_IDLE);
  const b = Math.sin(u * Math.PI * 2);
  add(P, 'spine', b * 1.3, 0, 0);
  add(P, 'chest', b * 1.7, 0, 0);
  add(P, 'head', -b * 1.1, 0, 0);
  add(P, 'armR', b * 1.3, 0, 0);
  add(P, 'armL', b * 1.3, 0, 0);
  return P;
}

/* ---------------------------------------------------------------- 보스 */
const BOSS_IDLE = {
  hips: [3, 0, 0], spine: [7, 0, -1], chest: [8, 0, -1], neck: [-5, 0, 0], head: [-3, 0, 0],
  armR: [-16, 0, -26], foreR: [-34, 0, 0], handR: [-8, 0, 0],
  armL: [-16, 0, 26], foreL: [-34, 0, 0], handL: [-8, 0, 0],
  thighL: [-14, 0, 7], shinL: [26, 0, 0], footL: [-12, 0, 0],
  thighR: [10, 0, -7], shinR: [22, 0, 0], footR: [-30, 0, 0]
};

function bossPose(st, u) {
  const P = blank();
  if (st === 'walk') {
    const p = u * Math.PI * 2;
    const s = Math.sin(p), c = Math.cos(p);
    put(P, BOSS_IDLE);
    add(P, 'hips', 0, 0, 4.5 * s);
    add(P, 'spine', 0, -2 * c, 3.2 * s);
    add(P, 'chest', 0, 3.2 * c, 2.8 * s);
    add(P, 'head', 0, -2 * c, -2.2 * s);
    P.thighL[0] = -16 - 24 * s;
    P.thighR[0] = 12 + 22 * s;
    P.shinL[0] = 26 + 22 * Math.max(0, -s);
    P.shinR[0] = 22 + 24 * Math.max(0, s);
    levelFoot(P, 'L', 0.84);
    levelFoot(P, 'R', 0.84);
    P.armR[0] = -14 + 11 * s;
    P.armL[0] = -14 - 11 * s;
    add(P, 'hipsPos', 0, 0.012 * Math.max(0, Math.abs(s) - 0.5), 0);
    return P;
  }
  if (st === 'attack') {
    const k = timeline([
      [0.00, BOSS_IDLE],
      [0.30, {   /* 예비: 양손을 높이 들고 몸을 뒤로 젖힌다 */
        hips: [-8, 0, 0], spine: [-12, 0, 0], chest: [-9, 0, 0], neck: [16, 0, 0], head: [18, 0, 0],
        armR: [-164, 0, -30], foreR: [-16, 0, 0], handR: [-10, 0, 0],
        armL: [-164, 0, 30], foreL: [-16, 0, 0], handL: [-10, 0, 0],
        thighL: [-12, 0, 7], shinL: [22, 0, 0], footL: [-10, 0, 0],
        thighR: [8, 0, -7], shinR: [18, 0, 0], footR: [-24, 0, 0]
      }],
      [0.46, {   /* 내리찍기 */
        hips: [7, 0, 0], spine: [20, 0, 0], chest: [14, 0, 0], neck: [-12, 0, 0], head: [-10, 0, 0],
        armR: [-46, 0, -22], foreR: [-14, 0, 0], handR: [-20, 0, 0],
        armL: [-46, 0, 22], foreL: [-14, 0, 0], handL: [-20, 0, 0],
        thighL: [-20, 0, 7], shinL: [32, 0, 0], footL: [-10, 0, 0],
        thighR: [12, 0, -7], shinR: [16, 0, 0], footR: [-26, 0, 0]
      }],
      [0.60, {   /* 여파 — 몸을 낮게 깔고 팔을 앞으로 뻗은 채 */
        hips: [8, 0, 0], spine: [22, 0, 0], chest: [15, 0, 0], neck: [-13, 0, 0], head: [-11, 0, 0],
        armR: [-34, 0, -18], foreR: [-24, 0, 0], handR: [-22, 0, 0],
        armL: [-34, 0, 18], foreL: [-24, 0, 0], handL: [-22, 0, 0],
        thighL: [-22, 0, 7], shinL: [36, 0, 0], footL: [-8, 0, 0],
        thighR: [13, 0, -7], shinR: [18, 0, 0], footR: [-28, 0, 0]
      }],
      [0.84, {
        hips: [5, 0, 0], spine: [12, 0, -1], chest: [11, 0, -1], neck: [-7, 0, 0], head: [-5, 0, 0],
        armR: [-18, 0, -26], foreR: [-34, 0, 0], handR: [-8, 0, 0],
        armL: [-18, 0, 26], foreL: [-34, 0, 0], handL: [-8, 0, 0],
        thighL: [-16, 0, 7], shinL: [28, 0, 0], footL: [-12, 0, 0],
        thighR: [12, 0, -7], shinR: [24, 0, 0], footR: [-32, 0, 0]
      }],
      [1.00, BOSS_IDLE]
    ], u);
    put(P, k);
    return P;
  }
  if (st === 'cast') {
    const k = timeline([
      [0.00, BOSS_IDLE],
      [0.35, {
        hips: [-4, 10, 0], spine: [-6, 14, 2], chest: [-4, 16, 3], neck: [10, -10, 0], head: [12, -8, 0],
        armR: [-120, 20, -34], foreR: [-40, 0, 0], handR: [-14, 0, 0],
        armL: [-62, 0, 46], foreL: [-50, 0, 0], handL: [-12, 0, 0],
        thighL: [-14, 0, 7], shinL: [26, 0, 0], footL: [-12, 0, 0],
        thighR: [10, 0, -7], shinR: [22, 0, 0], footR: [-30, 0, 0]
      }],
      [0.70, {
        hips: [-2, 4, 0], spine: [-2, 6, 1], chest: [0, 8, 1], neck: [6, -4, 0], head: [8, -4, 0],
        armR: [-76, 8, -30], foreR: [-50, 0, 0], handR: [-10, 0, 0],
        armL: [-42, 0, 38], foreL: [-44, 0, 0], handL: [-10, 0, 0],
        thighL: [-14, 0, 7], shinL: [26, 0, 0], footL: [-12, 0, 0],
        thighR: [10, 0, -7], shinR: [22, 0, 0], footR: [-30, 0, 0]
      }],
      [1.00, BOSS_IDLE]
    ], u);
    put(P, k);
    return P;
  }
  if (st === 'hit' || st === 'death') {
    const k = Math.sin(Math.min(1, u) * Math.PI);
    put(P, BOSS_IDLE);
    add(P, 'spine', -11 * k, 0, 4.5 * k);
    add(P, 'chest', -8 * k, 0, 3 * k);
    add(P, 'head', -11 * k, 0, 0);
    if (st === 'death') {
      add(P, 'spine', 22 * k, 0, 0);
      add(P, 'chest', 15 * k, 0, 0);
      add(P, 'thighL', -20 * k, 0, 0);
      add(P, 'thighR', -16 * k, 0, 0);
      add(P, 'shinL', 30 * k, 0, 0);
      add(P, 'shinR', 26 * k, 0, 0);
      levelFoot(P, 'L', 0.6); levelFoot(P, 'R', 0.6);
    }
    return P;
  }
  put(P, BOSS_IDLE);
  const b = Math.sin(u * Math.PI * 2);
  add(P, 'spine', b * 1.5, 0, 0);
  add(P, 'chest', b * 2.0, 0, 0);
  add(P, 'head', -b * 1.7, 0, b * 0.7);
  add(P, 'armR', b * 2.0, 0, 0);
  add(P, 'armL', b * 2.0, 0, 0);
  return P;
}

const GEN = { hero: heroPose, minion: minionPose, heavy: heavyPose, stone: stonePose, boss: bossPose };

/* 공격 1회 길이(초) — 상태 전이와 무관하게 이 시간으로 u 를 만든다. */
const ATK_DUR = { hero: 0.58, minion: 0.62, heavy: 0.72, stone: 0.62, boss: 0.86 };
const HIT_DUR = { hero: 0.26, minion: 0.30, heavy: 0.32, stone: 0.30, boss: 0.40 };
const STRIDE = { hero: 1.35, minion: 1.05, heavy: 1.45, stone: 1.15, boss: 1.6 };

/* ---------------------------------------------------------------- 적용 */
function applyBone(rig, key, x, y, z) {
  const b = rig.bones[key];
  if (!b) return;
  _e.set(x * DEG, y * DEG, z * DEG, 'YXZ');
  _q.setFromEuler(_e);
  /* local = (P0⁻¹ · R · P0) · q0 */
  _q2.copy(rig.Minv[key]).multiply(_q).multiply(rig.M[key]).multiply(rig.q0[key]);
  b.quaternion.copy(_q2);
}

/* 해석적 FK 로 발바닥 월드 y 를 잰다(골반 위치 포함) — 발이 뜨거나 파묻히지 않게. */
function footSoleY(rig, side, hipsY, hipsQ) {
  const chain = ['thigh' + side, 'shin' + side, 'foot' + side];
  _m.copy(rig.parentWorld);
  _m2.compose(_p.set(rig.bones.hips.position.x, hipsY, rig.bones.hips.position.z), hipsQ, _one);
  _m.multiply(_m2);
  for (let i = 0; i < chain.length; i++) {
    const b = rig.bones[chain[i]];
    if (!b) return 0;
    _m2.compose(b.position, b.quaternion, _one);
    _m.multiply(_m2);
  }
  _w.copy(rig.sole[side]).applyMatrix4(_m);
  return _w.y;
}

const _hq = new THREE.Quaternion();
export function applyPose(rig, P) {
  if (!rig || !P) return;
  for (let i = 0; i < KEYS.length; i++) {
    const k = KEYS[i];
    if (k === 'hips') continue;
    const v = P[k];
    if (v) applyBone(rig, k, v[0], v[1], v[2]);
  }
  const hp = rig.hipsPos;
  let hx = hp.x + (P.hipsPos ? P.hipsPos[0] : 0);
  let hipsY = hp.y + (P.hipsPos ? P.hipsPos[1] : 0);
  let hz = hp.z + (P.hipsPos ? P.hipsPos[2] : 0);
  if (P.hips) {
    _e.set(P.hips[0] * DEG, P.hips[1] * DEG, P.hips[2] * DEG, 'YXZ');
    _q.setFromEuler(_e);
    _hq.copy(rig.Minv.hips).multiply(_q).multiply(rig.M.hips).multiply(rig.q0.hips);
  } else _hq.copy(rig.q0.hips);
  rig.bones.hips.quaternion.copy(_hq);
  rig.bones.hips.position.set(hx, hipsY, hz);
  if (P.ground !== false) {
    const yL = footSoleY(rig, 'L', hipsY, _hq);
    const yR = footSoleY(rig, 'R', hipsY, _hq);
    const low = Math.min(yL, yR);
    hipsY -= low / (rig.scale || 1);
    rig.bones.hips.position.y = hipsY;
  }
  rig.pose = P;
}

/* ---------------------------------------------------------------- 애니메이터 */
/**
 * 한 프레임 갱신. st: 'idle' | 'walk' | 'attack' | 'hit' | 'cast' | 'death'
 * speed: 월드 m/s.
 */
export function tickPose(rig, dt, st, speed) {
  if (!rig) return null;
  const sp = Math.max(0, speed || 0);
  rig.speed = sp;
  rig.t += dt;
  if (st !== rig.state) {
    rig.from = rig.pose ? clonePose(rig.pose) : null;
    rig.blendT = (st === 'attack' || st === 'hit') ? 0.07 : 0.16;
    rig.blendDur = rig.blendT;
    if (st === 'attack') rig.aT = 0;
    if (st === 'hit') rig.hT = 0;
    if (st === 'cast' || st === 'death') rig.cT = 0;
    rig.state = st;
  }
  if (st === 'attack') rig.aT += dt;
  if (st === 'hit') rig.hT += dt;

  const species = rig.species;
  let P;
  if (st === 'attack') {
    const dur = ATK_DUR[species] || 0.6;
    rig.attackU = Math.min(1, rig.aT / dur);
    P = GEN[species](st, rig.attackU);
  } else if (st === 'hit') {
    rig.hitU = Math.min(1, rig.hT / (HIT_DUR[species] || 0.3));
    P = GEN[species](st, rig.hitU);
  } else if (st === 'walk') {
    const stride = STRIDE[species] || 1.3;
    const rate = Math.max(0.45, Math.min(2.2, sp / stride));
    rig.phase += dt * rate;
    rig.phase -= Math.floor(rig.phase);
    P = GEN[species](st, rig.phase);
  } else if (st === 'cast') {
    rig.cT = (rig.cT || 0) + dt;
    P = GEN[species](st, Math.min(1, rig.cT / 1.1));
  } else if (st === 'death') {
    rig.cT = (rig.cT || 0) + dt;
    P = GEN[species](st, Math.min(1, rig.cT / 0.8));
  } else {
    P = GEN[species]('idle', ((rig.t * 0.42) % 1 + 1) % 1);
  }

  let out = P;
  if (rig.blendT > 0 && rig.from) {
    rig.blendT -= dt;
    const k = 1 - Math.max(0, rig.blendT) / rig.blendDur;
    out = lerpPose(rig.from, P, smooth(Math.min(1, k)));
  } else rig.from = null;

  applyPose(rig, out);
  return { st: st, u: rig.attackU || 0, phase: rig.phase, speed: sp };
}

function clonePose(P) {
  const o = blank();
  o.ground = P.ground;
  for (let i = 0; i <= KEYS.length; i++) {
    const k = i < KEYS.length ? KEYS[i] : 'hipsPos';
    o[k] = [P[k][0], P[k][1], P[k][2]];
  }
  return o;
}

/* QA — 특정 상태의 특정 시점 자세를 바로 적용한다(스크린샷 비교용). */
export function posePreview(rig, st, u) {
  if (!rig) return null;
  const P = GEN[rig.species](st, Math.max(0, Math.min(1, u == null ? 0 : u)));
  rig.from = null; rig.blendT = 0;
  rig.state = st;
  applyPose(rig, P);
  return poseInfo(rig);
}

export function poseInfo(rig) {
  if (!rig) return null;
  const P = rig.pose || blank();
  const out = { species: rig.species, st: rig.state, u: +(rig.attackU || 0).toFixed(2), phase: +(rig.phase || 0).toFixed(2) };
  for (let i = 0; i < KEYS.length; i++) {
    const k = KEYS[i];
    out[k] = P[k] ? P[k].map(function (v) { return Math.round(v); }) : null;
  }
  return out;
}

export const _BONE_KEYS = BONE_KEYS;
export { blank as makePose };
