/* v2/js/inkmodels3d.js — v0.49 원화 기준 3D 캐릭터 5종(주인공·원귀·거한·석인·보스)의 뼈대·몸·동작 정의.

   치수는 전부 2D 원화(v2/assets/diorama/poses/*_idle.png)에서 미터 단위로 잰 값이다
   (x = 중심선 기준 좌우, y = 발바닥 기준 높이. 원화 한 장의 키 = manifest 의 m).
   색은 원화에서 뽑은 대표색, 무늬·얼굴은 원화에서 구운 아틀라스(inkbody3d.js AZ)다.

   한 종의 spec:
     { key, h, pelvisY, hullT, defs:[[뼈, 부모, 로컬 위치]], cloth:{뼈: 스프링}, base:{뼈: [rx,ry,rz]},
       walk:{보폭…}, walkDur, parts(variant) → 파츠 목록, clips(spec, prefix) → {이름: AnimationClip},
       upright:{bone, clips} (선택 — 세워 드는 지팡이) }
   모델은 +Z 를 본다. 왼쪽(L)이 +X. 회전은 라디안 XYZ 오일러: 팔·다리 rotX 음수 = 앞으로. */
import * as THREE from 'three';
import * as TEX from './inktex3d.js';
import { AZ, tube, loft, rigid, ball, rock, skirtWeights, walkPose, clipFromFn, clipFromKeys } from './inkbody3d.js';

const PI = Math.PI;
const Z = TEX.Z;

/* ---------------------------------------------------------------- 공용 부위 */
/** 좌우 팔·다리처럼 한 줄기를 따라 내려가는 통. rows 의 x 는 side 를 곱해 좌우 대칭으로 놓는다. */
function limb(side, x, rows, chain, o) {
  return tube(rows, Object.assign({ chain: chain, cx: side * x }, o));
}
/** 머리 정면에 원화 얼굴을 한 번 붙이는 곡면(호). hw = 얼굴 반폭. */
function faceDecal(bone, rows, hw, y0, y1, zone, color, o) {
  const p = o || {};
  const rings = rows.map(function (r) {
    return { y: r[0], rx: r[1], rzF: r[2] == null ? r[1] : r[2], rzB: r[2] == null ? r[1] : r[2], x: 0, z: r[3] || 0 };
  });
  const w = {}; w[bone] = 1;
  const pad = hw * 0.04;
  const L = loft(rings, { seg: p.seg || 8, arc: p.arc || [-0.44 * PI, 0.44 * PI], uvRect: [-hw - pad, hw + pad, y0, y1], wfn: function () { return w; } });
  return { geo: L.geo, skin: L.skin, color: color, zone: zone, nh: 1, uvKeep: true };
}
/** 발(짚신·장화): 발목 뼈 로컬. 앞으로 긴 타원체 + 밑창. */
function footParts(out, s, top, sole, sc, zone) {
  const k = sc || 1;
  out.push(rigid('foot' + s, ball(0.062 * k, 1.0, 0.62, 1.95), top, { pos: [0, -0.048 * k, 0.05 * k], zone: zone }));
  out.push(rigid('foot' + s, ball(0.058 * k, 1.04, 0.22, 2.05), sole, { pos: [0, -0.078 * k, 0.055 * k], nh: 1 }));
}
/** 상투: 머리 꼭대기의 작은 묶음. */
function topknot(out, y, z, r, col) {
  out.push(rigid('head', ball(r * 0.62, 1, 0.8, 1), col, { pos: [0, y - r * 0.9, z], nh: 1 }));
  out.push(rigid('head', ball(r, 1, 1.05, 1), col, { pos: [0, y, z] }));
}
function animBonesOf(spec) {
  return spec.defs.map(function (d) { return d[0]; }).filter(function (n) { return !spec.cloth[n]; });
}
function withAnim(spec) { return Object.assign({}, spec, { animBones: animBonesOf(spec) }); }
/** 자세 덮어쓰기: base 위에 over 를 얹은 키. */
function K(t, p, o) { return Object.assign({ t: t, p: p || {} }, o || {}); }

/* ================================================================ 주인공 — 눈 가린 검객
   검은 도포(허리 아래로 퍼지는 자락), 새끼줄 허리띠, 넓은 소매 끝의 팔 감개, 검은 눈가리개와 상투, 환도. */
const HERO_COL = {
  cloth: 0x5d5a50, clothLo: 0x4b473f, collar: 0x8a857b, rope: 0x7a6238, bracer: 0x45413a,
  skin: 0x967b55, hair: 0x2a2723, band: 0x1e1c19, boot: 0x3f3b35, sole: 0x24221f,
  blade: 0xb4b6b0, guard: 0x4a4034, grip: 0x2c2823, face: 0x9f8c73
};
export const HERO = {
  key: 'hero', h: 2.45, pelvisY: 1.20, hullT: 0.020,
  defs: [
    ['pelvis', null, [0, 1.20, 0]],
    ['spine', 'pelvis', [0, 0.22, 0]],
    ['chest', 'spine', [0, 0.24, 0]],
    ['neck', 'chest', [0, 0.27, 0]],
    ['head', 'neck', [0, 0.06, 0]],
    ['shoulderL', 'chest', [0.17, 0.21, 0]],
    ['upperarmL', 'shoulderL', [0.075, -0.01, 0]],
    ['forearmL', 'upperarmL', [0, -0.33, 0]],
    ['handL', 'forearmL', [0, -0.30, 0]],
    ['shoulderR', 'chest', [-0.17, 0.21, 0]],
    ['upperarmR', 'shoulderR', [-0.075, -0.01, 0]],
    ['forearmR', 'upperarmR', [0, -0.33, 0]],
    ['handR', 'forearmR', [0, -0.30, 0]],
    ['weapon', 'handR', [0, -0.10, 0.01]],
    ['thighL', 'pelvis', [0.10, -0.06, 0]],
    ['shinL', 'thighL', [0, -0.53, 0]],
    ['footL', 'shinL', [0, -0.50, 0]],
    ['thighR', 'pelvis', [-0.10, -0.06, 0]],
    ['shinR', 'thighR', [0, -0.53, 0]],
    ['footR', 'shinR', [0, -0.50, 0]],
    ['skirt', 'pelvis', [0, 0.22, 0]],
    ['rope', 'pelvis', [0.075, 0.23, 0.135]],
    ['tailL', 'head', [0.035, 0.15, -0.115]],
    ['tailR', 'head', [-0.03, 0.14, -0.118]]
  ],
  cloth: {
    skirt: { g: 0.085, k: 46, d: 7.5, sw: 0.012, max: 0.5 },
    rope: { g: 0.16, k: 30, d: 5.5, rx: 0.02, sw: 0.035, ph: 1.3, max: 0.9 },
    tailL: { g: 0.20, k: 26, d: 5.0, rx: 0.55, rz: 0.22, sw: 0.07, ph: 0.4, max: 1.4 },
    tailR: { g: 0.20, k: 22, d: 4.6, rx: 0.42, rz: -0.10, sw: 0.07, ph: 2.1, max: 1.4 }
  },
  base: {
    pelvis: [0, 0, 0], spine: [0.03, 0, 0], chest: [0.03, 0, 0], neck: [0.03, 0, 0], head: [-0.05, 0, 0],
    shoulderL: [0, 0, 0.04], shoulderR: [0, 0, -0.04],
    upperarmL: [0.04, 0, 0.13], upperarmR: [0.02, 0, -0.16],
    forearmL: [-0.20, 0, 0.03], forearmR: [-0.24, 0, -0.03],
    handL: [0, 0, 0], handR: [0.10, 0, 0], weapon: [2.60, 0, 0.14],
    thighL: [-0.02, 0, 0.03], thighR: [-0.02, 0, -0.03],
    shinL: [0.05, 0, 0], shinR: [0.05, 0, 0],
    footL: [-0.03, 0, 0], footR: [-0.03, 0, 0]
  },
  walk: { stride: 1.36, duty: 0.60, lift: 0.13, stanceW: 0.10, bob: 0.034, sway: 0.022, yaw: 0.13, roll: 0.035, lean: 0.10, heel: 0.30, toe: 0.55, arm: 0.34 },
  walkDur: 0.74,
  parts: function () {
    const C = HERO_COL;
    const out = [];
    const torso = [['pelvis', 0], ['spine', 1.42], ['chest', 1.66], ['neck', 1.93]];
    /* 몸통 — 허리띠에서 잘록하고 가슴·어깨로 벌어진다. */
    out.push(tube([[1.00, 0.150, 0.115, 0.125], [1.14, 0.185, 0.135, 0.140], [1.30, 0.190, 0.135, 0.130], [1.44, 0.182, 0.128, 0.120],
      [1.60, 0.212, 0.145, 0.125], [1.74, 0.238, 0.150, 0.132], [1.84, 0.232, 0.138, 0.130], [1.905, 0.165, 0.110, 0.110], [1.945, 0.085, 0.080, 0.082]],
      { chain: torso, seg: 14, capA: true, color: C.cloth, zone: AZ.heroCloth }));
    /* 안깃(회색 목깃) — 검은 옷 속의 밝은 한 줄. */
    out.push(tube([[1.885, 0.118, 0.100, 0.098], [1.93, 0.096, 0.088, 0.088], [1.965, 0.084, 0.080, 0.080]], { chain: [['chest', 0], ['neck', 1.93]], seg: 12, color: C.collar, zone: Z.PAPER, nh: 1 }));
    out.push(rigid('chest', new THREE.BoxGeometry(0.030, 0.30, 0.012), C.collar, { pos: [0.035, 0.085, 0.142], rot: [0.10, 0, 0.42], zone: Z.PAPER, nh: 1 }));
    /* 새끼줄 허리띠 + 매듭 + 늘어진 두 가닥 */
    out.push(tube([[1.425, 0.196, 0.142, 0.132], [1.455, 0.202, 0.148, 0.137], [1.485, 0.196, 0.142, 0.132]], { chain: [['pelvis', 0], ['spine', 1.42]], blend: 0.03, seg: 14, color: C.rope, zone: Z.SASH, nh: 1 }));
    out.push(rigid('rope', ball(0.030, 1.1, 0.9, 0.8), C.rope, { pos: [0, 0.0, 0.012], zone: Z.SASH, nh: 1 }));
    out.push(rigid('rope', new THREE.CylinderGeometry(0.011, 0.013, 0.34, 6), C.rope, { pos: [-0.014, -0.18, 0.012], rot: [0.03, 0, -0.03], zone: Z.SASH, nh: 1 }));
    out.push(rigid('rope', new THREE.CylinderGeometry(0.011, 0.013, 0.27, 6), C.rope, { pos: [0.016, -0.15, 0.014], rot: [0.03, 0, 0.05], zone: Z.SASH, nh: 1 }));
    /* 도포 자락 — 허리에서 무릎 아래까지 종 모양으로 퍼지고 주름이 진다. */
    out.push(tube([[1.445, 0.192, 0.138, 0.128], [1.30, 0.232, 0.176, 0.168, 0, 0, 0.012], [1.08, 0.286, 0.226, 0.214, 0, 0, 0.032],
      [0.84, 0.330, 0.268, 0.254, 0, 0, 0.050], [0.62, 0.360, 0.296, 0.280, 0, 0, 0.064], [0.50, 0.372, 0.308, 0.290, 0, 0, 0.072]],
      { seg: 22, pleats: 8, color: C.cloth, zone: AZ.heroCloth, wfn: skirtWeights(1.44, 0.50, { leg: 0.66 }) }));
    ['L', 'R'].forEach(function (s) {
      const sd = s === 'L' ? 1 : -1;
      const arm = [['upperarm' + s, 1.86], ['forearm' + s, 1.53], ['hand' + s, 1.23]];
      /* 넓은 소매 — 어깨에서 팔꿈치까지 부풀고 손목에서 조인다. */
      out.push(limb(sd, 0.245, [[1.925, 0.030], [1.895, 0.078], [1.80, 0.100], [1.64, 0.106], [1.50, 0.102], [1.38, 0.098], [1.31, 0.080], [1.285, 0.056]],
        arm, { seg: 10, capA: true, color: C.cloth, zone: AZ.heroCloth }));
      /* 팔 감개 + 손 */
      out.push(limb(sd, 0.245, [[1.30, 0.052], [1.24, 0.047], [1.21, 0.043]], arm, { seg: 8, color: C.bracer, zone: Z.CLOTH, nh: 1 }));
      out.push(limb(sd, 0.245, [[1.215, 0.038, 0.034], [1.16, 0.047, 0.036], [1.09, 0.042, 0.032], [1.055, 0.020, 0.018]], arm, { seg: 8, capB: true, color: C.skin, zone: Z.PAPER, ht: 0.6 }));
      const leg = [['thigh' + s, 1.14], ['shin' + s, 0.61], ['foot' + s, 0.11]];
      /* 바지(자락 속) → 무릎 아래에서 장화 속으로 */
      out.push(limb(sd, 0.10, [[1.15, 0.105], [0.90, 0.100], [0.63, 0.090], [0.50, 0.094], [0.43, 0.082]], leg, { seg: 10, color: C.clothLo, zone: Z.CLOTH }));
      out.push(limb(sd, 0.10, [[0.455, 0.080], [0.33, 0.070], [0.17, 0.062], [0.09, 0.064]], leg, { seg: 10, color: C.boot, zone: Z.CLOTH }));
      footParts(out, s, C.boot, C.sole, 1.0, Z.CLOTH);
    });
    /* 목·머리 */
    const neck = [['neck', 0], ['head', 1.99]];
    out.push(tube([[1.92, 0.060], [2.00, 0.056]], { chain: neck, blend: 0.03, seg: 8, color: C.skin, zone: Z.PAPER, nh: 1 }));
    const HR = [[1.962, 0.040, 0.052, 0.036], [1.99, 0.074, 0.086, 0.070], [2.04, 0.096, 0.102, 0.094], [2.11, 0.110, 0.110, 0.114],
      [2.18, 0.114, 0.112, 0.120], [2.24, 0.106, 0.102, 0.112], [2.285, 0.078, 0.076, 0.084], [2.305, 0.036, 0.036, 0.040]];
    out.push(tube(HR, { chain: [['head', 0]], seg: 12, capA: true, capB: true, cz: 0.012, color: C.skin, zone: Z.PAPER }));
    /* 머리카락 — 뒤통수와 정수리를 덮는다. */
    out.push(tube([[2.02, 0.090, 0.094, 0.094], [2.10, 0.116, 0.116, 0.121], [2.18, 0.121, 0.118, 0.127], [2.245, 0.112, 0.108, 0.119], [2.292, 0.084, 0.082, 0.090], [2.315, 0.040, 0.040, 0.044]],
      { chain: [['head', 0]], seg: 12, arc: [0.46 * PI, 1.54 * PI], cz: 0.012, color: C.hair, zone: Z.CLOTH, nh: 1 }));
    out.push(tube([[2.20, 0.118, 0.115, 0.124], [2.25, 0.110, 0.106, 0.116], [2.292, 0.082, 0.080, 0.088], [2.314, 0.038, 0.038, 0.042]],
      { chain: [['head', 0]], seg: 12, capB: true, cz: 0.012, color: C.hair, zone: Z.CLOTH, nh: 1 }));
    /* 눈가리개 — 머리를 한 바퀴 감은 검은 띠 */
    out.push(tube([[2.105, 0.116, 0.115, 0.120], [2.14, 0.119, 0.117, 0.124], [2.175, 0.119, 0.116, 0.125]], { chain: [['head', 0]], seg: 12, cz: 0.012, color: C.band, zone: Z.CLOTH, nh: 1 }));
    /* 원화 얼굴(눈가리개·코·입·앞머리) */
    out.push(faceDecal('head', [[1.965, 0.046, 0.058, 0.012], [1.99, 0.078, 0.090, 0.012], [2.04, 0.100, 0.106, 0.012], [2.11, 0.114, 0.114, 0.012], [2.18, 0.118, 0.116, 0.012], [2.245, 0.110, 0.106, 0.012]],
      0.112, 1.96, 2.25, AZ.heroFace, C.face));
    topknot(out, 0.375, -0.02, 0.050, C.hair);
    /* 눈가리개 끈 — 뒤로 날리는 두 가닥(스프링 뼈) */
    ['L', 'R'].forEach(function (s, i) {
      const g = new THREE.PlaneGeometry(0.085 - i * 0.02, 0.52 - i * 0.14, 1, 4);
      g.translate(0, -(0.26 - i * 0.07), 0);
      out.push(rigid('tail' + s, g, i ? C.band : 0xcfb98e, { rot: [0, 0.4 - i * 0.8, i ? -0.42 : 0.67], nh: 1 }));
    });
    /* 환도 — 가늘고 곧은 날, 둥근 코등이, 검은 자루. 날은 뼈 +Y 로 뻗는다. */
    const blade = loft([{ y: 0.02, rx: 0.021, rzF: 0.006, rzB: 0.006, x: 0 }, { y: 0.45, rx: 0.020, rzF: 0.006, rzB: 0.006, x: 0.004 },
      { y: 0.80, rx: 0.017, rzF: 0.005, rzB: 0.005, x: 0.012 }, { y: 0.93, rx: 0.010, rzF: 0.004, rzB: 0.004, x: 0.020 }, { y: 0.985, rx: 0.002, rzF: 0.002, rzB: 0.002, x: 0.027 }],
      { seg: 6, capA: true, capB: true });
    out.push(rigid('weapon', blade.geo, C.blade, { zone: Z.BLADE, ht: 0.22, uvKeep: true }));
    out.push(rigid('weapon', new THREE.CylinderGeometry(0.040, 0.040, 0.012, 12), C.guard, { pos: [0, 0.012, 0], zone: Z.GOLD, ht: 0.3 }));
    out.push(rigid('weapon', new THREE.CylinderGeometry(0.017, 0.019, 0.20, 8), C.grip, { pos: [0, -0.095, 0], nh: 1 }));
    out.push(rigid('weapon', ball(0.022, 1, 0.7, 1), C.guard, { pos: [0, -0.20, 0], zone: Z.GOLD, nh: 1 }));
    return out;
  },
  clips: function (spec, prefix) {
    const S = withAnim(spec);
    const W = spec.walk;
    /* idle — 무사의 호흡. 가슴이 차오르며 어깨가 뜨고, 칼끝이 반 박자 늦게 따라온다. */
    const idle = clipFromKeys(S, prefix, 'idle', [
      K(0.0, { chest: [0.030, 0.010, 0], head: [-0.050, -0.05, 0] }),
      K(1.1, { spine: [0.040, 0, 0.004], chest: [0.058, -0.006, 0.006], shoulderL: [0, 0, 0.065], shoulderR: [0, 0, -0.065], head: [-0.022, 0.01, 0.004],
        upperarmR: [0.01, 0, -0.175], forearmR: [-0.28, 0, -0.04], upperarmL: [0.03, 0, 0.145], weapon: [2.58, 0.02, 0.15] }, { py: 0.006 }),
      K(2.2, { chest: [0.026, 0.012, -0.004], head: [-0.060, 0.05, -0.004], upperarmR: [0.03, 0, -0.150], forearmR: [-0.22, 0, -0.02], weapon: [2.63, -0.01, 0.13] }, { py: -0.003 }),
      K(3.2, { spine: [0.036, 0, -0.003], chest: [0.052, -0.008, 0.004], shoulderL: [0, 0, 0.060], shoulderR: [0, 0, -0.060], head: [-0.030, -0.02, 0],
        upperarmR: [0.01, 0, -0.168], forearmR: [-0.27, 0, -0.04] }, { py: 0.005 }),
      K(4.0, { chest: [0.030, 0.010, 0], head: [-0.050, -0.05, 0] })
    ], { spline: true, fps: 20 });
    /* walk — 발을 먼저 놓고 다리를 푼 걸음(IK). 칼 든 팔은 덜 흔들고, 상체는 살짝 앞으로. */
    const walk = clipFromFn(S, prefix, 'walk', spec.walkDur, 24, function (u) {
      const k = walkPose(S, u, W), p = k.p, c = Math.cos(u * PI * 2), s = Math.sin(u * PI * 2);
      p.upperarmR = [0.02 - 0.16 * c, 0, -0.17];
      p.forearmR = [-0.26 - 0.08 * Math.max(0, c), 0, -0.03];
      p.weapon = [2.56 + 0.07 * s, 0, 0.14];
      p.handR = [0.10, 0, 0];
      p.shoulderL = [0, -0.05 * c, 0.04]; p.shoulderR = [0, -0.05 * c, -0.04];
      return k;
    });
    /* slash — 일섬. 허리를 감았다(예비) 한 번에 풀고(스냅), 지나친 칼끝을 잡아 세운다(잔심). */
    const slash = clipFromKeys(S, prefix, 'slash', [
      K(0.000, { pelvis: [0.02, -0.26, 0], spine: [-0.02, -0.20, 0], chest: [-0.04, -0.34, 0.03], neck: [0, 0.10, 0], head: [-0.02, -0.20, 0],
        upperarmR: [-0.70, 0.10, -0.62], forearmR: [-1.35, 0, -0.05], handR: [0.10, 0, -0.20], weapon: [2.95, 0.30, 0.25],
        upperarmL: [-0.25, 0, 0.26], forearmL: [-0.55, 0, 0.05], thighL: [-0.10, 0, 0.05], thighR: [0.06, 0, -0.06], shinL: [0.30, 0, 0], shinR: [0.22, 0, 0] }, { pz: -0.04, py: -0.03 }),
      K(0.060, { pelvis: [0.03, -0.42, 0], spine: [-0.03, -0.32, 0], chest: [-0.05, -0.54, 0.05], neck: [0, 0.16, 0], head: [-0.03, -0.30, 0],
        upperarmR: [-0.88, 0.12, -0.74], forearmR: [-1.52, 0, -0.05], handR: [0.10, 0, -0.24], weapon: [3.06, 0.34, 0.28],
        upperarmL: [-0.30, 0, 0.30], forearmL: [-0.62, 0, 0.05], thighL: [-0.12, 0, 0.06], thighR: [0.08, 0, -0.07], shinL: [0.36, 0, 0], shinR: [0.26, 0, 0] }, { pz: -0.05, py: -0.045, e: 'out' }),
      K(0.130, { pelvis: [0.04, 0.16, -0.02], spine: [0.08, 0.22, 0], chest: [0.13, 0.40, -0.05], neck: [0.02, 0.12, 0], head: [-0.04, 0.22, 0],
        upperarmR: [-1.62, -0.16, -0.05], forearmR: [-0.28, 0, 0], handR: [0.10, 0, 0.06], weapon: [3.45, -0.14, 0.02],
        upperarmL: [-0.10, 0, 0.18], forearmL: [-0.40, 0, 0.04], thighL: [-0.06, 0, 0.05], thighR: [0.02, 0, -0.05], shinL: [0.22, 0, 0], shinR: [0.16, 0, 0] }, { pz: 0.02, py: -0.02, e: 'in' }),
      K(0.185, { pelvis: [0.05, 0.32, -0.04], spine: [0.12, 0.34, 0], chest: [0.19, 0.68, -0.07], neck: [0.03, 0.14, 0], head: [-0.02, 0.36, 0],
        upperarmR: [-1.52, -0.20, 0.30], forearmR: [-0.16, 0, 0], handR: [0.10, 0, 0.10], weapon: [3.00, -0.28, -0.10],
        upperarmL: [0.18, 0, 0.30], forearmL: [-0.30, 0, 0.04], thighL: [-0.18, 0, 0.06], thighR: [0.12, 0, -0.06], shinL: [0.26, 0, 0], shinR: [0.18, 0, 0] }, { pz: 0.05, py: -0.03, e: 'snap' }),
      K(0.235, { pelvis: [0.04, 0.34, -0.03], spine: [0.10, 0.34, 0], chest: [0.15, 0.70, -0.06], neck: [0.03, 0.16, 0], head: [0.00, 0.40, 0],
        upperarmR: [-1.28, -0.16, 0.50], forearmR: [-0.34, 0, 0], handR: [0.10, 0, 0.12], weapon: [2.95, -0.30, -0.14],
        upperarmL: [0.22, 0, 0.34], forearmL: [-0.36, 0, 0.04], thighL: [-0.16, 0, 0.06], thighR: [0.10, 0, -0.06], shinL: [0.24, 0, 0], shinR: [0.16, 0, 0] }, { pz: 0.04, py: -0.02, e: 'out' }),
      K(0.300, { pelvis: [0.02, 0.14, -0.01], spine: [0.06, 0.14, 0], chest: [0.08, 0.28, -0.02], neck: [0.03, 0.06, 0], head: [-0.03, 0.16, 0],
        upperarmR: [-0.82, -0.05, 0.18], forearmR: [-0.48, 0, -0.01], handR: [0.10, 0, 0.04], weapon: [2.72, -0.12, -0.04],
        upperarmL: [0.10, 0, 0.20], forearmL: [-0.30, 0, 0.03], thighL: [-0.10, 0, 0.04], thighR: [0.06, 0, -0.04], shinL: [0.18, 0, 0], shinR: [0.14, 0, 0] }, { pz: 0.02 })
    ]);
    /* hit — 상체가 젖혀졌다 방어 자세로 되튄다. */
    const hit = clipFromKeys(S, prefix, 'hit', [
      K(0.000, {}),
      K(0.050, { pelvis: [-0.06, 0.05, 0.03], spine: [-0.18, 0.06, 0.05], chest: [-0.26, 0.10, 0.07], neck: [-0.10, 0, 0], head: [-0.30, 0.08, 0.04],
        upperarmR: [0.34, 0, -0.42], forearmR: [-0.62, 0, -0.05], handR: [0.20, 0, -0.10], weapon: [2.80, 0, 0.24],
        upperarmL: [0.30, 0, 0.40], forearmL: [-0.52, 0, 0.06], thighL: [0.10, 0, 0.03], thighR: [0.12, 0, -0.03], shinL: [0.22, 0, 0], shinR: [0.26, 0, 0] }, { pz: -0.055, py: -0.02, e: 'snap' }),
      K(0.130, { pelvis: [-0.02, 0.02, 0.01], spine: [-0.06, 0.02, 0.02], chest: [-0.08, 0.04, 0.02], head: [-0.14, 0.02, 0.01],
        upperarmR: [0.16, 0, -0.24], forearmR: [-0.40, 0, -0.04], weapon: [2.72, 0, 0.20], upperarmL: [0.14, 0, 0.20], forearmL: [-0.34, 0, 0.04],
        thighL: [0.04, 0, 0.02], thighR: [0.04, 0, -0.02] }, { pz: -0.02 }),
      K(0.260, {})
    ]);
    return { idle: idle, walk: walk, slash: slash, hit: hit };
  }
};

/* ================================================================ 원귀 — 조선 좀비
   해진 청회색 삼베옷(소매는 팔꿈치에서 찢기고 자락은 너덜너덜), 새끼줄 허리띠, 맨 팔뚝·정강이, 짚신,
   이마의 누런 띠, 구부정한 등과 축 늘어진 손. 한쪽 다리를 끈다. */
const MIN_COL = {
  robe: 0x575144, robeLo: 0x48483f, skin: 0x7e705b, skinLo: 0x6a5f4e, hair: 0x1d1915, band: 0x8a7a5c,
  rope: 0x6b5a3c, sandal: 0x74654f, sole: 0x3a3226, face: 0x716451, nail: 0x3a2f28, collar: 0x736753
};
export const MINION = {
  key: 'minion', h: 2.4, pelvisY: 1.14, hullT: 0.026,
  defs: [
    ['pelvis', null, [0, 1.14, 0]],
    ['spine', 'pelvis', [0, 0.21, 0]],
    ['chest', 'spine', [0, 0.25, 0]],
    ['neck', 'chest', [0, 0.27, 0]],
    ['head', 'neck', [0, 0.07, 0]],
    ['shoulderL', 'chest', [0.165, 0.20, 0]],
    ['upperarmL', 'shoulderL', [0.075, -0.01, 0]],
    ['forearmL', 'upperarmL', [0, -0.32, 0]],
    ['handL', 'forearmL', [0, -0.30, 0]],
    ['shoulderR', 'chest', [-0.165, 0.20, 0]],
    ['upperarmR', 'shoulderR', [-0.075, -0.01, 0]],
    ['forearmR', 'upperarmR', [0, -0.32, 0]],
    ['handR', 'forearmR', [0, -0.30, 0]],
    ['thighL', 'pelvis', [0.10, -0.06, 0]],
    ['shinL', 'thighL', [0, -0.50, 0]],
    ['footL', 'shinL', [0, -0.47, 0]],
    ['thighR', 'pelvis', [-0.10, -0.06, 0]],
    ['shinR', 'thighR', [0, -0.50, 0]],
    ['footR', 'shinR', [0, -0.47, 0]],
    ['skirt', 'pelvis', [0, 0.20, 0]],
    ['rope', 'pelvis', [0.0, 0.21, 0.135]]
  ],
  cloth: {
    skirt: { g: 0.11, k: 34, d: 6.0, sw: 0.02, max: 0.55 },
    rope: { g: 0.2, k: 26, d: 4.6, sw: 0.05, ph: 0.7, max: 0.9 }
  },
  base: {
    pelvis: [0.02, 0, 0], spine: [0.15, 0, 0.02], chest: [0.21, 0, 0.03], neck: [0.20, 0, 0], head: [-0.16, 0.10, 0.10],
    shoulderL: [0.05, 0, 0.02], shoulderR: [0.05, 0, -0.02],
    upperarmL: [-0.20, 0, 0.10], upperarmR: [-0.34, 0, -0.10],
    forearmL: [-0.34, 0, 0.03], forearmR: [-0.52, 0, -0.03],
    handL: [0.34, 0, 0], handR: [0.40, 0, 0],
    thighL: [-0.16, 0, 0.03], thighR: [-0.10, 0, -0.04],
    shinL: [0.30, 0, 0], shinR: [0.22, 0, 0],
    footL: [-0.14, 0, 0], footR: [-0.12, 0, 0]
  },
  walk: { stride: 0.92, duty: 0.66, lift: 0.085, stanceW: 0.125, bob: 0.030, sway: 0.050, yaw: 0.10, roll: 0.075, lean: 0.14, crouch: 0.035, heel: 0.12, toe: 0.42, arm: 0.10, limp: 0.75 },
  walkDur: 1.16,
  parts: function () {
    const C = MIN_COL;
    const out = [];
    const torso = [['pelvis', 0], ['spine', 1.35], ['chest', 1.60], ['neck', 1.87]];
    out.push(tube([[0.94, 0.140, 0.108, 0.118], [1.08, 0.172, 0.125, 0.132], [1.24, 0.178, 0.128, 0.124], [1.37, 0.170, 0.122, 0.116],
      [1.53, 0.196, 0.134, 0.128], [1.67, 0.212, 0.134, 0.136], [1.77, 0.204, 0.124, 0.130], [1.835, 0.140, 0.100, 0.106], [1.875, 0.070, 0.066, 0.068]],
      { chain: torso, seg: 12, capA: true, color: C.robe, zone: AZ.minionCloth }));
    out.push(rigid('chest', new THREE.BoxGeometry(0.026, 0.28, 0.012), C.collar, { pos: [0.032, 0.07, 0.128], rot: [0.10, 0, 0.40], zone: Z.PAPER, nh: 1 }));
    /* 새끼줄 + 늘어진 가닥 */
    out.push(tube([[1.35, 0.182, 0.134, 0.127], [1.38, 0.188, 0.140, 0.132], [1.41, 0.182, 0.134, 0.127]], { chain: [['pelvis', 0], ['spine', 1.35]], blend: 0.03, seg: 12, color: C.rope, zone: Z.SASH, nh: 1 }));
    out.push(rigid('rope', ball(0.028, 1.1, 0.9, 0.8), C.rope, { pos: [0, 0.02, 0.008], zone: Z.SASH, nh: 1 }));
    out.push(rigid('rope', new THREE.CylinderGeometry(0.010, 0.012, 0.36, 6), C.rope, { pos: [-0.014, -0.17, 0.010], rot: [0.03, 0, -0.03], zone: Z.SASH, nh: 1 }));
    out.push(rigid('rope', new THREE.CylinderGeometry(0.010, 0.012, 0.30, 6), C.rope, { pos: [0.016, -0.14, 0.012], rot: [0.03, 0, 0.05], zone: Z.SASH, nh: 1 }));
    /* 해진 자락 — 밑단이 들쭉날쭉 찢겼다. */
    out.push(tube([[1.37, 0.180, 0.132, 0.126], [1.20, 0.212, 0.164, 0.158, 0, 0, 0.016], [0.98, 0.244, 0.196, 0.188, 0, 0, 0.036],
      [0.78, 0.262, 0.214, 0.204, 0, 0, 0.050], [0.64, 0.270, 0.222, 0.210, 0, 0, 0.060, 0.20]],
      { seg: 22, pleats: 7, color: C.robe, zone: AZ.minionCloth, wfn: skirtWeights(1.36, 0.64, { leg: 0.62 }) }));
    ['L', 'R'].forEach(function (s) {
      const sd = s === 'L' ? 1 : -1;
      const arm = [['upperarm' + s, 1.79], ['forearm' + s, 1.47], ['hand' + s, 1.17]];
      /* 팔꿈치에서 찢긴 소매 */
      out.push(limb(sd, 0.24, [[1.845, 0.028], [1.815, 0.072], [1.72, 0.090], [1.58, 0.096], [1.46, 0.102], [1.40, 0.106, null, null, 0, 0, 0, 0.11]],
        arm, { seg: 12, capA: true, color: C.robe, zone: AZ.minionCloth }));
      /* 맨 팔뚝 — 앙상하다 */
      out.push(limb(sd, 0.24, [[1.56, 0.044], [1.47, 0.047], [1.33, 0.040], [1.19, 0.032]], arm, { seg: 8, color: C.skin, zone: Z.PAPER }));
      /* 축 늘어진 손 + 갈퀴 손가락 */
      out.push(limb(sd, 0.24, [[1.195, 0.031, 0.027], [1.13, 0.044, 0.028], [1.07, 0.040, 0.024], [1.04, 0.022, 0.016]], arm, { seg: 8, capB: true, color: C.skin, zone: Z.PAPER, ht: 0.6 }));
      [-0.026, -0.009, 0.009, 0.026].forEach(function (dx, j) {
        out.push(rigid('hand' + s, new THREE.ConeGeometry(0.0095, 0.105, 5), j % 2 ? C.skinLo : C.skin, { pos: [dx, -0.185 - (j === 1 || j === 2 ? 0.012 : 0), 0.012], rot: [PI + 0.16, 0, dx * 3], nh: 1 }));
      });
      const leg = [['thigh' + s, 1.08], ['shin' + s, 0.58], ['foot' + s, 0.11]];
      out.push(limb(sd, 0.10, [[1.09, 0.088], [0.84, 0.076], [0.60, 0.060], [0.44, 0.062], [0.24, 0.046], [0.10, 0.042]], leg, { seg: 8, color: C.skin, zone: Z.PAPER }));
      footParts(out, s, C.skin, C.sandal, 1.08, Z.PAPER);
      /* 짚신 끈 */
      out.push(rigid('foot' + s, new THREE.TorusGeometry(0.047, 0.010, 4, 10), C.sandal, { pos: [0, 0.0, 0.0], rot: [PI / 2, 0, 0], nh: 1 }));
      out.push(rigid('foot' + s, new THREE.TorusGeometry(0.058, 0.010, 4, 10, PI), C.sandal, { pos: [0, -0.055, 0.085], rot: [0, 0, 0], scale: [1, 0.72, 1], nh: 1 }));
    });
    const neck = [['neck', 0], ['head', 1.94]];
    out.push(tube([[1.85, 0.058], [1.95, 0.052]], { chain: neck, blend: 0.03, seg: 8, color: C.skin, zone: Z.PAPER, nh: 1 }));
    /* 광대가 꺼진 긴 머리 */
    out.push(tube([[1.905, 0.036, 0.050, 0.034], [1.94, 0.066, 0.082, 0.066], [1.99, 0.086, 0.098, 0.090], [2.06, 0.104, 0.106, 0.112],
      [2.14, 0.110, 0.108, 0.118], [2.20, 0.102, 0.098, 0.110], [2.245, 0.074, 0.072, 0.080], [2.265, 0.034, 0.034, 0.038]],
      { chain: [['head', 0]], seg: 12, capA: true, capB: true, cz: 0.012, color: C.skin, zone: Z.PAPER }));
    out.push(tube([[1.98, 0.082, 0.090, 0.092], [2.06, 0.110, 0.112, 0.119], [2.14, 0.117, 0.114, 0.125], [2.205, 0.108, 0.104, 0.117], [2.25, 0.080, 0.078, 0.086], [2.272, 0.038, 0.038, 0.042]],
      { chain: [['head', 0]], seg: 12, arc: [0.44 * PI, 1.56 * PI], cz: 0.012, color: C.hair, zone: Z.CLOTH, nh: 1 }));
    out.push(tube([[2.165, 0.114, 0.111, 0.122], [2.21, 0.106, 0.102, 0.114], [2.25, 0.078, 0.076, 0.084], [2.270, 0.036, 0.036, 0.040]],
      { chain: [['head', 0]], seg: 12, capB: true, cz: 0.012, color: C.hair, zone: Z.CLOTH, nh: 1 }));
    /* 이마 띠 */
    out.push(tube([[2.085, 0.112, 0.112, 0.118], [2.125, 0.116, 0.114, 0.122], [2.165, 0.115, 0.112, 0.122]], { chain: [['head', 0]], seg: 12, cz: 0.012, color: C.band, zone: Z.PAPER, nh: 1 }));
    out.push(faceDecal('head', [[1.91, 0.042, 0.056, 0.012], [1.94, 0.070, 0.086, 0.012], [1.99, 0.090, 0.102, 0.012], [2.06, 0.108, 0.110, 0.012], [2.14, 0.114, 0.112, 0.012], [2.20, 0.106, 0.102, 0.012]],
      0.108, 1.905, 2.205, AZ.minionFace, C.face));
    topknot(out, 0.395, -0.03, 0.052, C.hair);
    return out;
  },
  clips: function (spec, prefix) {
    const S = withAnim(spec);
    const W = spec.walk;
    /* idle — 무게가 한쪽 다리에서 다른 쪽으로 천천히 넘어가고, 머리가 툭 떨어졌다 든다. */
    const idle = clipFromKeys(S, prefix, 'idle', [
      K(0.0, {}),
      K(1.2, { pelvis: [0.02, 0.03, 0.035], spine: [0.19, 0, -0.02], chest: [0.26, -0.03, 0.0], head: [-0.06, -0.04, -0.06], upperarmL: [-0.14, 0, 0.13], upperarmR: [-0.40, 0, -0.08], forearmR: [-0.44, 0, -0.03] }, { py: -0.018, px: 0.02 }),
      K(2.4, { pelvis: [0.02, -0.02, -0.03], spine: [0.13, 0, 0.04], chest: [0.19, 0.03, 0.05], head: [-0.22, 0.14, 0.14], upperarmL: [-0.26, 0, 0.08], upperarmR: [-0.30, 0, -0.13], forearmL: [-0.42, 0, 0.03] }, { py: 0.006, px: -0.015 }),
      K(3.3, { spine: [0.17, 0, 0.0], chest: [0.24, 0.0, 0.02], head: [-0.10, 0.04, 0.04] }, { py: -0.010 }),
      K(4.2, {})
    ], { spline: true, fps: 20 });
    /* walk — 왼발로 딛고 오른발을 끈다. 디딜 때마다 상체가 앞으로 쏠렸다 돌아온다. */
    const walk = clipFromFn(S, prefix, 'walk', spec.walkDur, 28, function (u) {
      const k = walkPose(S, u, W), p = k.p, c = Math.cos(u * PI * 2), s = Math.sin(u * PI * 2);
      const lurch = Math.pow(Math.max(0, Math.cos((u - 0.08) * PI * 2)), 2);
      p.spine = [0.15 + 0.07 * lurch, p.spine[1], p.spine[2] + 0.02];
      p.chest = [0.21 + 0.09 * lurch, p.chest[1], p.chest[2] + 0.03];
      p.neck = [0.20, p.neck[1], 0];
      p.head = [-0.16 + 0.10 * Math.sin((u - 0.16) * PI * 2), 0.10 + p.head[1], 0.10 + 0.05 * s];
      p.upperarmL = [-0.24 + 0.12 * c, 0, 0.10]; p.upperarmR = [-0.36 - 0.08 * c, 0, -0.10];
      p.forearmL = [-0.36 - 0.10 * Math.sin((u - 0.1) * PI * 2), 0, 0.03]; p.forearmR = [-0.52 + 0.08 * Math.sin((u - 0.1) * PI * 2), 0, -0.03];
      p.handL = [0.34 + 0.14 * Math.sin((u - 0.22) * PI * 2), 0, 0]; p.handR = [0.40 - 0.12 * Math.sin((u - 0.22) * PI * 2), 0, 0];
      return k;
    });
    /* attack — 몸을 뒤로 빼며 팔을 들었다가(예비) 덮치듯 할퀸다. */
    const attack = clipFromKeys(S, prefix, 'attack', [
      K(0.00, {}),
      K(0.16, { pelvis: [-0.04, 0, 0], spine: [0.02, 0, 0], chest: [-0.06, 0, 0], head: [-0.30, 0, 0], upperarmL: [-1.50, 0, 0.36], upperarmR: [-1.62, 0, -0.34],
        forearmL: [-1.10, 0, 0.04], forearmR: [-1.20, 0, -0.04], handL: [-0.30, 0, 0], handR: [-0.30, 0, 0] }, { pz: -0.05, py: 0.01, e: 'out' }),
      K(0.26, { pelvis: [0.12, 0, 0], spine: [0.30, 0, 0], chest: [0.40, 0, 0], head: [-0.10, 0, 0], upperarmL: [-1.36, 0, 0.06], upperarmR: [-1.30, 0, -0.08],
        forearmL: [-0.12, 0, 0.02], forearmR: [-0.16, 0, -0.02], handL: [0.55, 0, 0], handR: [0.55, 0, 0], thighL: [-0.42, 0, 0.03], shinL: [0.40, 0, 0], thighR: [0.14, 0, -0.04] }, { pz: 0.10, py: -0.06, e: 'snap' }),
      K(0.38, { pelvis: [0.10, 0, 0], spine: [0.27, 0, 0], chest: [0.36, 0, 0], upperarmL: [-0.98, 0, 0.08], upperarmR: [-0.92, 0, -0.10],
        forearmL: [-0.20, 0, 0.02], forearmR: [-0.26, 0, -0.02], handL: [0.6, 0, 0], handR: [0.6, 0, 0], thighL: [-0.36, 0, 0.03], shinL: [0.36, 0, 0] }, { pz: 0.08, py: -0.05, e: 'out' }),
      K(0.60, {})
    ]);
    /* hit — 상체가 꺾이고 팔이 풀려 뒤따라온다. */
    const hit = clipFromKeys(S, prefix, 'hit', [
      K(0.00, {}),
      K(0.07, { pelvis: [-0.08, 0.10, 0], spine: [-0.14, 0.08, 0.06], chest: [-0.22, 0.12, 0.08], neck: [-0.10, 0, 0], head: [-0.42, 0.14, 0.10],
        upperarmL: [0.34, 0, 0.34], upperarmR: [0.26, 0, -0.36], forearmL: [-0.20, 0, 0.04], forearmR: [-0.24, 0, -0.04] }, { pz: -0.06, py: 0.015, e: 'snap' }),
      K(0.20, { spine: [0.20, 0.04, 0.02], chest: [0.30, 0.06, 0.03], head: [0.02, 0.05, 0.04], upperarmL: [-0.46, 0, 0.14], upperarmR: [-0.52, 0, -0.14] }, { pz: -0.02, py: -0.02 }),
      K(0.44, {})
    ]);
    return { idle: idle, walk: walk, attack: attack, hit: hit };
  }
};

/* ================================================================ 거한 — 몽둥이를 멘 장정
   웃통을 벗은 거대한 상체, 열어젖힌 삼베 조끼, 굵은 허리띠와 짚 치마, 부푼 바지, 손목 감개, 짚신,
   어깨에 걸친 통나무 몽둥이. 발을 디딜 때마다 온몸이 가라앉는다. */
const HEV_COL = {
  skin: 0xcaa87e, skinLo: 0xa98a64, torso: 0xbd9e77, vest: 0x7e6c4f, belt: 0x6a5539, rope: 0x9a8258, straw: 0xa1835b,
  pants: 0x423827, bracer: 0x554630, hair: 0x2c2419, face: 0x9f8462, sandal: 0x897150, sole: 0x4a3c28, wood: 0x776245, woodLo: 0x5b4a33
};
export const CLUB_IMPACT_TIME = 0.36;
export const HEAVY = {
  key: 'heavy', h: 3.0, pelvisY: 1.40, hullT: 0.030,
  defs: [
    ['pelvis', null, [0, 1.40, 0]],
    ['spine', 'pelvis', [0, 0.27, 0]],
    ['chest', 'spine', [0, 0.33, 0]],
    ['neck', 'chest', [0, 0.36, 0]],
    ['head', 'neck', [0, 0.05, 0]],
    ['shoulderL', 'chest', [0.37, 0.24, 0]],
    ['upperarmL', 'shoulderL', [0.13, -0.02, 0]],
    ['forearmL', 'upperarmL', [0, -0.44, 0]],
    ['handL', 'forearmL', [0, -0.40, 0]],
    ['shoulderR', 'chest', [-0.37, 0.24, 0]],
    ['upperarmR', 'shoulderR', [-0.13, -0.02, 0]],
    ['forearmR', 'upperarmR', [0, -0.44, 0]],
    ['handR', 'forearmR', [0, -0.40, 0]],
    ['weapon', 'handR', [0, -0.12, 0.02]],
    ['thighL', 'pelvis', [0.20, -0.08, 0]],
    ['shinL', 'thighL', [0, -0.62, 0]],
    ['footL', 'shinL', [0, -0.56, 0]],
    ['thighR', 'pelvis', [-0.20, -0.08, 0]],
    ['shinR', 'thighR', [0, -0.62, 0]],
    ['footR', 'shinR', [0, -0.56, 0]],
    ['skirt', 'pelvis', [0, 0.14, 0]]
  ],
  cloth: { skirt: { g: 0.07, k: 40, d: 7.0, sw: 0.012, max: 0.4 } },
  base: {
    pelvis: [0, 0, 0], spine: [0.02, 0, 0], chest: [0.02, 0, 0], neck: [0.06, 0, 0], head: [-0.04, 0.10, 0],
    shoulderL: [0, 0, 0.03], shoulderR: [0, 0, 0.10],
    upperarmL: [0.04, 0, 0.22], upperarmR: [-0.62, 0.20, -0.52],
    forearmL: [-0.30, 0, 0.04], forearmR: [-2.02, 0, 0.10],
    handL: [0.10, 0, 0], handR: [0.10, 0, 0], weapon: [1.44, 0.30, -0.10],
    thighL: [-0.05, 0, 0.09], thighR: [-0.02, 0, -0.09],
    shinL: [0.10, 0, 0], shinR: [0.06, 0, 0],
    footL: [-0.05, 0, 0.0], footR: [-0.04, 0, 0.0]
  },
  walk: { stride: 1.50, duty: 0.64, lift: 0.14, stanceW: 0.24, bob: 0.055, sway: 0.060, yaw: 0.12, roll: 0.055, lean: 0.06, crouch: 0.03, heel: 0.22, toe: 0.40, arm: 0.26 },
  walkDur: 1.20,
  parts: function () {
    const C = HEV_COL;
    const out = [];
    const torso = [['pelvis', 0], ['spine', 1.67], ['chest', 2.00], ['neck', 2.36]];
    const TR = [[1.16, 0.240, 0.190, 0.200], [1.32, 0.320, 0.245, 0.245], [1.50, 0.362, 0.292, 0.250], [1.70, 0.372, 0.292, 0.242],
      [1.90, 0.418, 0.284, 0.252], [2.10, 0.468, 0.272, 0.262], [2.24, 0.448, 0.226, 0.246], [2.32, 0.270, 0.176, 0.196], [2.375, 0.132, 0.122, 0.124]];
    out.push(tube(TR, { chain: torso, seg: 16, capA: true, color: C.skin, zone: AZ.heavySkin }));
    /* 원화 가슴·배(근육 결) */
    const TD = TR.filter(function (r) { return r[0] >= 1.70 && r[0] <= 2.32; }).map(function (r) {
      return { y: r[0], rx: r[1] + 0.006, rzF: r[2] + 0.006, rzB: r[2] + 0.006, x: 0, z: 0, w: null };
    });
    const tdl = loft(TD, { seg: 10, arc: [-0.33 * PI, 0.33 * PI], uvRect: [-0.40, 0.40, 1.70, 2.34],
      wfn: function (r) { return r.y < 1.93 ? { spine: 0.5 + (1.93 - r.y) * 2, chest: 0.5 - (1.93 - r.y) * 2 } : (r.y > 2.07 ? { chest: 1 } : { spine: (2.07 - r.y) * 3.5, chest: 1 - (2.07 - r.y) * 3.5 }); } });
    out.push({ geo: tdl.geo, skin: tdl.skin, color: C.torso, zone: AZ.heavyTorso, nh: 1, uvKeep: true });
    /* 열어젖힌 조끼 — 등과 옆구리만 덮는다. */
    out.push(tube([[1.60, 0.392, 0.310, 0.262], [1.80, 0.418, 0.304, 0.270], [2.00, 0.468, 0.296, 0.280], [2.16, 0.486, 0.270, 0.282], [2.27, 0.440, 0.230, 0.262]],
      { chain: torso, seg: 16, arc: [0.30 * PI, 1.70 * PI], color: C.vest, zone: AZ.heavyStraw }));
    /* 허리띠 + 매듭 */
    out.push(tube([[1.47, 0.372, 0.300, 0.258], [1.53, 0.384, 0.310, 0.266], [1.60, 0.380, 0.304, 0.260]], { chain: [['pelvis', 0], ['spine', 1.67]], seg: 16, color: C.belt, zone: Z.SASH }));
    out.push(rigid('pelvis', ball(0.062, 1.2, 0.9, 0.7), C.rope, { pos: [0.02, 0.13, 0.305], zone: Z.SASH, nh: 1 }));
    out.push(rigid('skirt', new THREE.CylinderGeometry(0.020, 0.026, 0.40, 6), C.rope, { pos: [-0.02, -0.26, 0.335], rot: [0.05, 0, -0.04], zone: Z.SASH, nh: 1 }));
    out.push(rigid('skirt', new THREE.CylinderGeometry(0.020, 0.026, 0.33, 6), C.rope, { pos: [0.05, -0.22, 0.335], rot: [0.05, 0, 0.06], zone: Z.SASH, nh: 1 }));
    /* 짚 치마 — 올이 풀려 들쭉날쭉하다. */
    out.push(tube([[1.50, 0.376, 0.300, 0.262], [1.34, 0.420, 0.350, 0.320, 0, 0, 0.020], [1.14, 0.456, 0.384, 0.360, 0, 0, 0.034], [0.98, 0.474, 0.398, 0.376, 0, 0, 0.042, 0.24]],
      { seg: 28, pleats: 14, color: C.straw, zone: AZ.heavyStraw, wfn: skirtWeights(1.50, 0.98, { leg: 0.5 }) }));
    ['L', 'R'].forEach(function (s) {
      const sd = s === 'L' ? 1 : -1;
      const arm = [['upperarm' + s, 2.22], ['forearm' + s, 1.78], ['hand' + s, 1.38]];
      /* 맨팔 — 어깨 삼각근에서 부풀고 팔꿈치에서 조였다 전완에서 다시 굵다. */
      out.push(limb(sd, 0.50, [[2.335, 0.050], [2.30, 0.130], [2.22, 0.168], [2.08, 0.178], [1.92, 0.160], [1.79, 0.126], [1.67, 0.140], [1.52, 0.114], [1.41, 0.088]],
        arm, { seg: 12, capA: true, color: C.skin, zone: AZ.heavySkin }));
      out.push(limb(sd, 0.50, [[1.62, 0.146], [1.53, 0.128], [1.44, 0.104]], arm, { seg: 12, color: C.bracer, zone: Z.CLOTH, nh: 1 }));
      /* 주먹 */
      out.push(limb(sd, 0.50, [[1.42, 0.086, 0.078], [1.34, 0.118, 0.098], [1.24, 0.112, 0.094], [1.17, 0.070, 0.060]], arm, { seg: 10, capB: true, color: C.skin, zone: AZ.heavySkin }));
      const leg = [['thigh' + s, 1.32], ['shin' + s, 0.70], ['foot' + s, 0.14]];
      /* 부푼 바지 → 무릎 아래에서 묶는다 */
      out.push(limb(sd, 0.20, [[1.34, 0.200], [1.06, 0.222], [0.80, 0.208], [0.68, 0.158], [0.63, 0.128]], leg, { seg: 12, color: C.pants, zone: AZ.heavyPants }));
      out.push(limb(sd, 0.20, [[0.66, 0.118], [0.50, 0.124], [0.30, 0.092], [0.13, 0.080]], leg, { seg: 10, color: C.skin, zone: AZ.heavySkin }));
      footParts(out, s, C.skin, C.sandal, 1.75, AZ.heavySkin);
      out.push(rigid('foot' + s, new THREE.TorusGeometry(0.084, 0.016, 4, 10), C.sandal, { pos: [0, 0.01, 0.0], rot: [PI / 2, 0, 0], nh: 1 }));
      out.push(rigid('foot' + s, new THREE.TorusGeometry(0.102, 0.016, 4, 10, PI), C.sandal, { pos: [0, -0.095, 0.15], scale: [1, 0.72, 1], nh: 1 }));
    });
    /* 굵은 목·머리 */
    out.push(tube([[2.30, 0.130, 0.120, 0.130], [2.42, 0.118, 0.110, 0.118]], { chain: [['neck', 0], ['head', 2.41]], blend: 0.03, seg: 10, color: C.skin, zone: AZ.heavySkin, nh: 1 }));
    out.push(tube([[2.37, 0.060, 0.076, 0.056], [2.41, 0.104, 0.118, 0.100], [2.47, 0.128, 0.134, 0.128], [2.55, 0.140, 0.138, 0.146],
      [2.63, 0.140, 0.136, 0.150], [2.70, 0.126, 0.122, 0.136], [2.745, 0.090, 0.088, 0.098], [2.765, 0.040, 0.040, 0.046]],
      { chain: [['head', 0]], seg: 12, capA: true, capB: true, cz: 0.015, color: C.skin, zone: AZ.heavySkin }));
    out.push(tube([[2.46, 0.126, 0.130, 0.134], [2.55, 0.147, 0.142, 0.154], [2.63, 0.147, 0.142, 0.158], [2.705, 0.132, 0.128, 0.143], [2.75, 0.096, 0.094, 0.104], [2.772, 0.046, 0.046, 0.052]],
      { chain: [['head', 0]], seg: 12, arc: [0.42 * PI, 1.58 * PI], cz: 0.015, color: C.hair, zone: Z.CLOTH, nh: 1 }));
    out.push(tube([[2.66, 0.142, 0.138, 0.153], [2.71, 0.130, 0.126, 0.140], [2.752, 0.094, 0.092, 0.102], [2.772, 0.044, 0.044, 0.050]],
      { chain: [['head', 0]], seg: 12, capB: true, cz: 0.015, color: C.hair, zone: Z.CLOTH, nh: 1 }));
    out.push(faceDecal('head', [[2.375, 0.066, 0.082, 0.015], [2.41, 0.108, 0.122, 0.015], [2.47, 0.132, 0.138, 0.015], [2.55, 0.144, 0.142, 0.015], [2.63, 0.144, 0.140, 0.015], [2.70, 0.130, 0.126, 0.015]],
      0.140, 2.375, 2.705, AZ.heavyFace, C.face));
    topknot(out, 0.46, -0.03, 0.062, C.hair);
    /* 몽둥이 — 손잡이에서 굵어지는 통나무. 뼈 +Y 로 뻗는다. */
    const club = loft([{ y: -0.30, rx: 0.058, rzF: 0.058, rzB: 0.058 }, { y: -0.24, rx: 0.072, rzF: 0.072, rzB: 0.072 }, { y: -0.16, rx: 0.052, rzF: 0.052, rzB: 0.052 },
      { y: 0.30, rx: 0.066, rzF: 0.066, rzB: 0.066 }, { y: 0.80, rx: 0.105, rzF: 0.100, rzB: 0.100 }, { y: 1.20, rx: 0.150, rzF: 0.142, rzB: 0.142 },
      { y: 1.48, rx: 0.168, rzF: 0.160, rzB: 0.160 }, { y: 1.60, rx: 0.150, rzF: 0.144, rzB: 0.144 }, { y: 1.66, rx: 0.080, rzF: 0.078, rzB: 0.078 }],
      { seg: 10, capA: true, capB: true, tile: 0.4 });
    out.push(rigid('weapon', club.geo, C.wood, { zone: AZ.wood, uvKeep: true }));
    [[0.11, 0.95, 0.05], [-0.12, 1.18, 0.06], [0.06, 1.36, -0.13], [-0.05, 1.05, -0.11], [0.14, 1.50, 0.02], [-0.13, 1.44, -0.06]].forEach(function (k, i) {
      out.push(rigid('weapon', rock(0.040, i + 3, 1, 0.8, 1, 0.12), C.woodLo, { pos: k, nh: 1 }));
    });
    return out;
  },
  clips: function (spec, prefix) {
    const S = withAnim(spec);
    const W = spec.walk;
    /* idle — 큰 숨. 가슴이 벌어지며 몽둥이가 어깨 위에서 조금 들린다. */
    const idle = clipFromKeys(S, prefix, 'idle', [
      K(0.0, {}),
      K(1.5, { spine: [0.00, 0, 0], chest: [0.06, 0.02, 0], shoulderL: [0, 0, 0.07], shoulderR: [0, 0, 0.06], head: [-0.07, 0.06, 0], upperarmL: [0.04, 0, 0.26], forearmR: [-1.98, 0, 0.10] }, { py: 0.012 }),
      K(3.0, { spine: [0.04, 0, 0], chest: [0.00, -0.02, 0], head: [-0.02, 0.14, 0], upperarmL: [0.06, 0, 0.20], forearmL: [-0.36, 0, 0.04] }, { py: -0.010 }),
      K(4.4, {})
    ], { spline: true, fps: 20 });
    /* walk — 성큼성큼. 디딘 쪽으로 몸이 쏠리고 왼팔이 크게 흔들린다. 몽둥이는 어깨에서 출렁인다. */
    const walk = clipFromFn(S, prefix, 'walk', spec.walkDur, 28, function (u) {
      const k = walkPose(S, u, W), p = k.p, c = Math.cos(u * PI * 2);
      const thud = Math.cos((u - W.duty / 2) * PI * 4);
      p.upperarmR = [-0.62, 0.20, -0.52];
      p.forearmR = [-2.02 + 0.05 * thud, 0, 0.10];
      p.weapon = [spec.base.weapon[0] - 0.06 * thud, 0.30, -0.10];
      p.upperarmL = [0.04 + 0.34 * c, 0, 0.22]; p.forearmL = [-0.30 - 0.22 * Math.max(0, -c), 0, 0.04];
      p.head = [p.head[0] - 0.03 * thud, 0.10 + p.head[1], p.head[2]];
      p.shoulderR = [0, 0, 0.10]; p.shoulderL = [0, 0, 0.03];
      return k;
    });
    /* attack — 몽둥이를 머리 뒤로 넘겼다(예비) 온몸으로 내리찍고, 박힌 몽둥이를 끌어 올린다. */
    const attack = clipFromKeys(S, prefix, 'attack', [
      K(0.00, {}),
      K(0.24, { pelvis: [-0.06, -0.16, 0], spine: [-0.12, -0.12, 0], chest: [-0.20, -0.20, 0], head: [0.10, 0.20, 0], upperarmR: [-2.55, 0.10, -0.40], forearmR: [-1.30, 0, 0.05],
        weapon: [-1.10, 0.10, -0.10], upperarmL: [-0.50, 0, 0.40], forearmL: [-0.70, 0, 0.04], thighL: [-0.20, 0, 0.09], shinL: [0.26, 0, 0] }, { py: 0.02, pz: -0.05, e: 'out' }),
      K(CLUB_IMPACT_TIME, { pelvis: [0.14, 0.12, 0], spine: [0.26, 0.10, 0], chest: [0.36, 0.20, 0], head: [-0.20, -0.06, 0], upperarmR: [-1.05, -0.10, -0.12], forearmR: [-0.30, 0, 0],
        weapon: [-2.60, 0.0, 0.0], upperarmL: [0.40, 0, 0.36], forearmL: [-0.40, 0, 0.04], thighL: [-0.50, 0, 0.09], shinL: [0.62, 0, 0], thighR: [0.20, 0, -0.09], shinR: [0.30, 0, 0] }, { py: -0.16, pz: 0.12, e: 'snap' }),
      K(0.50, { pelvis: [0.12, 0.12, 0], spine: [0.22, 0.10, 0], chest: [0.30, 0.18, 0], head: [-0.16, -0.04, 0], upperarmR: [-0.92, -0.10, -0.12], forearmR: [-0.36, 0, 0],
        weapon: [-2.50, 0.0, 0.0], upperarmL: [0.34, 0, 0.34], forearmL: [-0.40, 0, 0.04], thighL: [-0.46, 0, 0.09], shinL: [0.56, 0, 0], thighR: [0.18, 0, -0.09], shinR: [0.26, 0, 0] }, { py: -0.13, pz: 0.11, e: 'out' }),
      K(0.86, {})
    ]);
    const hit = clipFromKeys(S, prefix, 'hit', [
      K(0.00, {}),
      K(0.08, { pelvis: [-0.05, 0.08, 0], spine: [-0.12, 0.06, 0.04], chest: [-0.18, 0.10, 0.05], head: [-0.26, 0.16, 0.05], upperarmL: [0.30, 0, 0.46], forearmL: [-0.50, 0, 0.04], forearmR: [-1.86, 0, 0.10] }, { pz: -0.05, e: 'snap' }),
      K(0.24, { spine: [0.06, 0.02, 0.01], chest: [0.08, 0.03, 0.01], head: [-0.02, 0.10, 0.01] }, { pz: -0.02, py: -0.02 }),
      K(0.50, {})
    ]);
    return { idle: idle, walk: walk, attack: attack, hit: hit };
  }
};

/* ================================================================ 석인 — 이끼 낀 돌 거인
   바위 덩어리를 쌓아 올린 몸. 고릴라처럼 굽은 등, 땅에 닿는 굵은 팔과 주먹, 짧은 다리, 이마가 튀어나온
   네모난 얼굴. 관절마다 바위가 따로 놀며 묵직하게 걷는다. */
const STN_COL = { rock: 0xb0a385, rockLo: 0x8f8468, dark: 0x564f37, moss: 0x70682c, mossHi: 0x8a8436, face: 0x9d9173 };
export const STONE = {
  key: 'stone', h: 2.6, pelvisY: 1.00, hullT: 0.030,
  defs: [
    ['pelvis', null, [0, 1.00, 0]],
    ['spine', 'pelvis', [0, 0.30, 0.02]],
    ['chest', 'spine', [0, 0.42, 0.04]],
    ['neck', 'chest', [0, 0.26, 0.20]],
    ['head', 'neck', [0, 0.04, 0.04]],
    ['shoulderL', 'chest', [0.54, 0.22, 0]],
    ['upperarmL', 'shoulderL', [0.22, -0.02, 0]],
    ['forearmL', 'upperarmL', [0, -0.70, 0]],
    ['handL', 'forearmL', [0, -0.62, 0]],
    ['shoulderR', 'chest', [-0.54, 0.22, 0]],
    ['upperarmR', 'shoulderR', [-0.22, -0.02, 0]],
    ['forearmR', 'upperarmR', [0, -0.70, 0]],
    ['handR', 'forearmR', [0, -0.62, 0]],
    ['thighL', 'pelvis', [0.30, -0.10, 0]],
    ['shinL', 'thighL', [0, -0.42, 0]],
    ['footL', 'shinL', [0, -0.36, 0]],
    ['thighR', 'pelvis', [-0.30, -0.10, 0]],
    ['shinR', 'thighR', [0, -0.42, 0]],
    ['footR', 'shinR', [0, -0.36, 0]]
  ],
  cloth: {},
  base: {
    pelvis: [0.06, 0, 0], spine: [0.20, 0, 0], chest: [0.18, 0, 0], neck: [-0.10, 0, 0], head: [-0.22, 0, 0],
    shoulderL: [0, 0, 0.06], shoulderR: [0, 0, -0.06],
    upperarmL: [-0.42, 0, 0.16], upperarmR: [-0.42, 0, -0.16],
    forearmL: [-0.10, 0, -0.06], forearmR: [-0.10, 0, 0.06],
    handL: [0.06, 0, 0], handR: [0.06, 0, 0],
    thighL: [-0.34, 0, 0.10], thighR: [-0.34, 0, -0.10],
    shinL: [0.46, 0, 0], shinR: [0.46, 0, 0],
    footL: [-0.18, 0, 0], footR: [-0.18, 0, 0]
  },
  walk: { stride: 1.05, duty: 0.68, lift: 0.12, stanceW: 0.34, bob: 0.045, sway: 0.085, yaw: 0.14, roll: 0.075, lean: 0.08, crouch: 0.07, heel: 0.10, toe: 0.20, arm: 0.30 },
  walkDur: 1.50,
  parts: function () {
    const C = STN_COL;
    const out = [];
    let seed = 1;
    /* 바위 한 덩어리. 큰 덩어리는 밝은 돌, 틈을 메우는 작은 덩어리는 어두운 돌. */
    const R = function (bone, r, pos, sc, col, nh) {
      const s = sc || [1, 1, 1];
      out.push(rigid(bone, rock(r, seed++, s[0], s[1], s[2], 0.16), col == null ? C.rock : col,
        { pos: pos, zone: AZ.stoneRock, nh: nh, rot: [seed * 0.7, seed * 1.3, seed * 0.4] }));
    };
    /* 이끼 — 윗면에 얹힌 납작한 덩어리. */
    const M = function (bone, r, pos, sc) {
      const s = sc || [1.2, 0.45, 1.1];
      out.push(rigid(bone, rock(r, seed++, s[0], s[1], s[2], 0.22), (seed % 2) ? C.moss : C.mossHi, { pos: pos, zone: Z.CLOTH, nh: 1 }));
    };
    /* 골반·허리 */
    R('pelvis', 0.34, [0, -0.02, 0], [1.25, 0.82, 1.0]);
    R('pelvis', 0.20, [0.24, -0.16, 0.10], null, C.rockLo);
    R('pelvis', 0.20, [-0.24, -0.16, 0.10], null, C.rockLo);
    R('spine', 0.36, [0, 0.16, 0.0], [1.22, 0.86, 1.0], C.rockLo);
    R('spine', 0.22, [0.0, 0.10, 0.26], [1.3, 0.9, 0.7], C.dark);
    /* 가슴 — 가장 큰 덩어리 + 가슴판 둘 + 등 혹 */
    R('chest', 0.50, [0, 0.14, -0.04], [1.32, 0.92, 0.98], C.rockLo);
    R('chest', 0.30, [0.26, 0.10, 0.30], [1.05, 1.0, 0.72]);
    R('chest', 0.30, [-0.26, 0.10, 0.30], [1.05, 1.0, 0.72]);
    R('chest', 0.42, [0, 0.40, -0.26], [1.45, 0.72, 0.95]);
    M('chest', 0.34, [0.0, 0.66, -0.26], [1.6, 0.42, 1.0]);
    M('chest', 0.22, [0.34, 0.50, -0.02]);
    M('chest', 0.20, [-0.36, 0.52, -0.06]);
    /* 머리 — 네모난 돌 얼굴 */
    R('head', 0.27, [0, 0.10, 0.02], [0.88, 1.12, 0.86]);
    R('head', 0.12, [0, 0.20, 0.20], [1.7, 0.5, 0.6], C.rockLo, 1);
    M('head', 0.20, [0, 0.36, -0.04], [1.25, 0.42, 1.15]);
    const fd = loft([{ y: -0.19, rx: 0.19, rzF: 0.19, rzB: 0.19 }, { y: -0.04, rx: 0.235, rzF: 0.235, rzB: 0.235 }, { y: 0.12, rx: 0.25, rzF: 0.25, rzB: 0.25 },
      { y: 0.27, rx: 0.24, rzF: 0.24, rzB: 0.24 }, { y: 0.39, rx: 0.19, rzF: 0.19, rzB: 0.19 }],
      { seg: 8, arc: [-0.40 * PI, 0.40 * PI], uvRect: [-0.25, 0.25, -0.20, 0.40] });
    out.push(rigid('head', fd.geo, C.face, { pos: [0, 0.0, 0.01], zone: AZ.stoneFace, nh: 1, uvKeep: true }));
    ['L', 'R'].forEach(function (s) {
      const sd = s === 'L' ? 1 : -1;
      /* 어깨 — 커다란 둥근 바위 + 이끼 */
      R('upperarm' + s, 0.36, [0, 0.02, 0], [1.05, 0.95, 1.05]);
      M('upperarm' + s, 0.26, [0, 0.30, -0.02], [1.2, 0.42, 1.2]);
      R('upperarm' + s, 0.28, [sd * 0.02, -0.36, 0.0], [1.0, 1.1, 1.0], C.rockLo);
      R('upperarm' + s, 0.17, [0, -0.62, 0.04], null, C.dark);
      /* 전완 — 손목으로 갈수록 굵어진다 */
      R('forearm' + s, 0.28, [0, -0.14, 0], [1.0, 1.05, 1.0]);
      R('forearm' + s, 0.32, [0, -0.44, 0.02], [1.05, 1.0, 1.05], C.rockLo);
      M('forearm' + s, 0.18, [sd * 0.18, -0.20, -0.10], [0.5, 1.2, 1.0]);
      /* 주먹 — 땅을 짚는 큰 덩어리 + 손가락 마디 */
      R('hand' + s, 0.33, [0, -0.20, 0.02], [1.08, 0.92, 1.05]);
      [-0.19, -0.06, 0.07, 0.19].forEach(function (dx) { R('hand' + s, 0.11, [dx, -0.40, 0.20], [1, 1.1, 1.1], C.rockLo, 1); });
      /* 다리 */
      R('thigh' + s, 0.27, [0, -0.16, 0.02], [1.05, 1.15, 1.05]);
      R('shin' + s, 0.24, [0, -0.14, 0], [1.05, 1.15, 1.05], C.rockLo);
      R('shin' + s, 0.15, [0, 0.02, 0.10], null, C.dark, 1);
      R('foot' + s, 0.21, [0, -0.02, 0.08], [1.15, 0.52, 1.55]);
      [-0.13, 0, 0.13].forEach(function (dx) { R('foot' + s, 0.075, [dx, -0.05, 0.37], [1, 0.8, 1.3], C.rockLo, 1); });
    });
    return out;
  },
  clips: function (spec, prefix) {
    const S = withAnim(spec);
    const W = spec.walk;
    const idle = clipFromKeys(S, prefix, 'idle', [
      K(0.0, {}),
      K(1.7, { spine: [0.23, 0, 0.015], chest: [0.22, 0.02, 0.01], head: [-0.16, 0.10, 0], upperarmL: [-0.46, 0, 0.19], upperarmR: [-0.38, 0, -0.14] }, { py: -0.022 }),
      K(3.4, { spine: [0.18, 0, -0.015], chest: [0.16, -0.02, -0.01], head: [-0.26, -0.10, 0], upperarmL: [-0.38, 0, 0.14], upperarmR: [-0.46, 0, -0.19] }, { py: 0.008 }),
      K(5.0, {})
    ], { spline: true, fps: 20 });
    /* walk — 주먹으로 땅을 짚듯 팔이 크게 앞뒤로 간다. 디딜 때 몸 전체가 쿵 내려앉는다. */
    const walk = clipFromFn(S, prefix, 'walk', spec.walkDur, 28, function (u) {
      const k = walkPose(S, u, W), p = k.p, c = Math.cos(u * PI * 2);
      const thud = Math.cos((u - W.duty / 2) * PI * 4);
      p.spine = [0.20 + 0.03 * thud, p.spine[1], p.spine[2]];
      p.chest = [0.18 + 0.04 * thud, p.chest[1], p.chest[2]];
      p.neck = [-0.10, p.neck[1], 0];
      p.head = [-0.22 - 0.05 * thud, p.head[1], p.head[2]];
      p.upperarmL = [-0.42 + 0.34 * c, 0, 0.16]; p.upperarmR = [-0.42 - 0.34 * c, 0, -0.16];
      p.forearmL = [-0.10 - 0.16 * Math.max(0, -c), 0, -0.06]; p.forearmR = [-0.10 - 0.16 * Math.max(0, c), 0, 0.06];
      return k;
    });
    /* attack — 두 주먹을 머리 위로 치켜들었다 땅을 내리친다. */
    const attack = clipFromKeys(S, prefix, 'attack', [
      K(0.00, {}),
      K(0.30, { pelvis: [-0.06, 0, 0], spine: [-0.04, 0, 0], chest: [-0.16, 0, 0], head: [0.10, 0, 0], upperarmL: [-2.50, 0, 0.30], upperarmR: [-2.50, 0, -0.30],
        forearmL: [-0.70, 0, -0.10], forearmR: [-0.70, 0, 0.10] }, { py: 0.05, pz: -0.04, e: 'out' }),
      K(0.42, { pelvis: [0.18, 0, 0], spine: [0.40, 0, 0], chest: [0.42, 0, 0], head: [-0.40, 0, 0], upperarmL: [-0.92, 0, 0.10], upperarmR: [-0.92, 0, -0.10],
        forearmL: [-0.10, 0, -0.04], forearmR: [-0.10, 0, 0.04], thighL: [-0.62, 0, 0.10], thighR: [-0.62, 0, -0.10], shinL: [0.86, 0, 0], shinR: [0.86, 0, 0], footL: [-0.30, 0, 0], footR: [-0.30, 0, 0] }, { py: -0.17, pz: 0.08, e: 'snap' }),
      K(0.60, { pelvis: [0.16, 0, 0], spine: [0.36, 0, 0], chest: [0.38, 0, 0], head: [-0.36, 0, 0], upperarmL: [-0.86, 0, 0.10], upperarmR: [-0.86, 0, -0.10],
        thighL: [-0.58, 0, 0.10], thighR: [-0.58, 0, -0.10], shinL: [0.80, 0, 0], shinR: [0.80, 0, 0], footL: [-0.28, 0, 0], footR: [-0.28, 0, 0] }, { py: -0.15, pz: 0.07, e: 'out' }),
      K(1.00, {})
    ]);
    const hit = clipFromKeys(S, prefix, 'hit', [
      K(0.00, {}),
      K(0.09, { spine: [0.08, 0.06, 0.03], chest: [0.02, 0.10, 0.04], head: [-0.40, 0.12, 0.05], upperarmL: [-0.10, 0, 0.32], upperarmR: [-0.14, 0, -0.30] }, { pz: -0.04, e: 'snap' }),
      K(0.28, { spine: [0.24, 0.02, 0.01], chest: [0.22, 0.03, 0.01], head: [-0.18, 0.04, 0] }, { py: -0.03 }),
      K(0.56, {})
    ]);
    return { idle: idle, walk: walk, attack: attack, hit: hit };
  }
};

/* ================================================================ 보스 — 붉은 관복의 주술사
   바닥까지 끌리는 붉은 겉옷(금박 단)과 검은 속옷, 종처럼 벌어진 소매, 뿔 달린 귀면 가면과 높은 관,
   등 뒤로 늘어진 긴 머리, 고리 달린 긴 지팡이. 지팡이를 세워 짚고 미끄러지듯 걷는다. */
const BOSS_VAR = [
  { robe: 0x612918, trim: 0x8e612e, inner: 0x3b2c1d },       /* 원화 그대로 — 주홍 */
  { robe: 0x27364a, trim: 0x8f8a78, inner: 0x23262c },       /* 쪽빛·은 */
  { robe: 0x2f4030, trim: 0x8a6a36, inner: 0x262a22 },       /* 청록·청동 */
  { robe: 0x45264a, trim: 0x9a7a40, inner: 0x2a2230 }        /* 자주·금 */
];
const BOSS_COL = { mask: 0x4c3c2e, skin: 0x3d3022, hat: 0x4a3420, hair: 0x2a1812, staff: 0x6d4d21, iron: 0x3a3229, shoe: 0x2a2018, gold: 0x9a6831, horn: 0x2c241c, gem: 0x9c6b2a };
export const BOSS = {
  key: 'boss', h: 6.2, pelvisY: 2.90, hullT: 0.050,
  defs: [
    ['pelvis', null, [0, 2.90, 0]],
    ['spine', 'pelvis', [0, 0.50, 0]],
    ['chest', 'spine', [0, 0.60, 0]],
    ['neck', 'chest', [0, 0.56, 0]],
    ['head', 'neck', [0, 0.10, 0]],
    ['shoulderL', 'chest', [0.38, 0.42, 0]],
    ['upperarmL', 'shoulderL', [0.16, -0.02, 0]],
    ['forearmL', 'upperarmL', [0, -0.85, 0]],
    ['handL', 'forearmL', [0, -0.78, 0]],
    ['shoulderR', 'chest', [-0.38, 0.42, 0]],
    ['upperarmR', 'shoulderR', [-0.16, -0.02, 0]],
    ['forearmR', 'upperarmR', [0, -0.85, 0]],
    ['handR', 'forearmR', [0, -0.78, 0]],
    ['weapon', 'handR', [0, -0.16, 0.06]],
    ['thighL', 'pelvis', [0.20, -0.12, 0]],
    ['shinL', 'thighL', [0, -1.30, 0]],
    ['footL', 'shinL', [0, -1.28, 0]],
    ['thighR', 'pelvis', [-0.20, -0.12, 0]],
    ['shinR', 'thighR', [0, -1.30, 0]],
    ['footR', 'shinR', [0, -1.28, 0]],
    ['skirt', 'pelvis', [0, 0.40, 0]],
    ['hair', 'head', [0, -0.05, -0.20]]
  ],
  cloth: {
    skirt: { g: 0.045, k: 20, d: 5.0, sw: 0.010, max: 0.34 },
    hair: { g: 0.09, k: 16, d: 4.0, rx: 0.04, sw: 0.03, ph: 1.1, max: 0.7 }
  },
  base: {
    pelvis: [0, 0, 0], spine: [0.03, 0, 0], chest: [0.04, 0, 0], neck: [0.04, 0, 0], head: [-0.02, 0, 0],
    shoulderL: [0, 0, 0.04], shoulderR: [0, 0, -0.04],
    upperarmL: [-0.42, -0.20, 0.16], upperarmR: [-0.52, 0.10, -0.34],
    forearmL: [-1.20, -1.05, 0.0], forearmR: [-0.86, 0, 0],
    handL: [0, 0, 0], handR: [0, 0, 0], weapon: [1.38, 0, 0.34],
    thighL: [-0.02, 0, 0.03], thighR: [-0.02, 0, -0.03],
    shinL: [0.05, 0, 0], shinR: [0.05, 0, 0],
    footL: [-0.03, 0, 0], footR: [-0.03, 0, 0]
  },
  walk: { stride: 2.5, duty: 0.66, lift: 0.16, stanceW: 0.22, bob: 0.035, sway: 0.045, yaw: 0.07, roll: 0.025, lean: 0.03, heel: 0.16, toe: 0.36, arm: 0.0 },
  walkDur: 1.80,
  /* 지팡이를 세워 짚는 동작(가중치 합만큼 곧게 선다). */
  upright: { bone: 'weapon', clips: ['idle', 'walk', 'hit'] },
  parts: function (variant) {
    const C = BOSS_COL, V = BOSS_VAR[((variant | 0) + 4) % 4];
    const out = [];
    const torso = [['pelvis', 0], ['spine', 3.40], ['chest', 4.00], ['neck', 4.56]];
    const TR = [[2.50, 0.360, 0.280, 0.300], [2.90, 0.420, 0.310, 0.310], [3.30, 0.420, 0.300, 0.290], [3.70, 0.470, 0.310, 0.300],
      [4.10, 0.530, 0.310, 0.310], [4.36, 0.500, 0.270, 0.290], [4.50, 0.260, 0.200, 0.210], [4.58, 0.150, 0.140, 0.140]];
    /* 검은 속옷(앞섶으로 드러난다) */
    out.push(tube(TR, { chain: torso, seg: 16, capA: true, color: V.inner, zone: AZ.bossInner, tile: 0.9 }));
    /* 붉은 겉옷 — 앞이 트여 있다. 가장자리에 금박 단. */
    const OR = TR.filter(function (r) { return r[0] >= 3.3 && r[0] <= 4.5; }).map(function (r) { return [r[0], r[1] + 0.035, r[2] + 0.035, r[3] + 0.035]; });
    out.push(tube(OR, { chain: torso, seg: 18, arc: [0.15 * PI, 1.85 * PI], color: V.robe, zone: AZ.bossRobe, tile: 0.9 }));
    [[0.07 * PI, 0.17 * PI], [-0.17 * PI, -0.07 * PI]].forEach(function (a) {
      out.push(tube(OR.map(function (r) { return [r[0], r[1] + 0.012, r[2] + 0.012, r[3] + 0.012]; }), { chain: torso, seg: 2, arc: a, color: V.trim, zone: AZ.bossTrim, tile: 0.5, nh: 1 }));
    });
    /* 허리 장식 띠 */
    out.push(tube([[3.22, 0.445, 0.330, 0.310], [3.32, 0.452, 0.336, 0.316], [3.42, 0.445, 0.330, 0.310]], { chain: [['pelvis', 0], ['spine', 3.40]], seg: 16, arc: [-0.2 * PI, 0.2 * PI], color: V.trim, zone: AZ.bossTrim, nh: 1 }));
    /* 속옷 자락(통) + 겉옷 자락(앞이 벌어진 큰 종) + 금박 밑단 */
    // Split riding coat: the knees, shins and the negative space between them stay visible.
    const hemWeights = skirtWeights(3.3,1.95,{leg:.65,clothK:.3});
    for(const arc of [[.22*PI,.85*PI],[1.15*PI,1.78*PI]]) {
      out.push(tube([[3.34,.46,.34,.34],[2.85,.49,.36,.38],[2.32,.52,.39,.40],[1.95,.50,.38,.39]],
        {seg:10,arc,color:V.robe,zone:AZ.bossRobe,tile:.8,wfn:hemWeights}));
    }
    ['L', 'R'].forEach(function (s) {
      const sd = s === 'L' ? 1 : -1;
      const arm = [['upperarm' + s, 4.40], ['forearm' + s, 3.55], ['hand' + s, 2.77]];
      /* 종 모양 소매 — 손목으로 갈수록 넓게 벌어진다. */
      out.push(limb(sd, 0.54, [[4.53, 0.060], [4.47, 0.190], [4.25, 0.235], [3.85, 0.262], [3.55, 0.19], [3.20, 0.16], [2.92, 0.13], [2.84, 0.12]],
        arm, { seg: 12, capA: true, color: V.robe, zone: AZ.bossRobe, tile: 0.9, blend: 0.14 }));
      out.push(limb(sd, 0.54, [[2.86, 0.133], [2.72, 0.126]], arm, { seg: 12, color: V.trim, zone: AZ.bossTrim, tile: 0.5 }));
      /* 손 */
      out.push(limb(sd, 0.54, [[2.90, 0.075], [2.78, 0.080, 0.062], [2.64, 0.092, 0.060], [2.52, 0.070, 0.048], [2.46, 0.030, 0.024]], arm, { seg: 8, capB: true, color: C.skin, zone: Z.PAPER }));
      const leg = [['thigh' + s, 2.78], ['shin' + s, 1.48], ['foot' + s, 0.20]];
      out.push(limb(sd, 0.20, [[2.80, 0.200], [2.10, 0.180], [1.48, 0.150], [0.70, 0.125], [0.20, 0.110]], leg, { seg: 8, color: V.inner, zone: Z.CLOTH, nh: 1, blend: 0.14 }));
      footParts(out, s, C.shoe, C.shoe, 2.6, Z.CLOTH);
    });
    /* 목·귀면 가면 */
    out.push(tube([[4.50, 0.130], [4.68, 0.120]], { chain: [['neck', 0], ['head', 4.66]], blend: 0.05, seg: 8, color: C.skin, zone: Z.PAPER, nh: 1 }));
    out.push(tube([[4.42, 0.070, 0.100, 0.070], [4.50, 0.150, 0.180, 0.150], [4.62, 0.205, 0.220, 0.205], [4.78, 0.238, 0.240, 0.240], [4.94, 0.248, 0.242, 0.252],
      [5.06, 0.232, 0.224, 0.240], [5.14, 0.176, 0.170, 0.184], [5.18, 0.080, 0.080, 0.086]],
      { chain: [['head', 0]], seg: 14, capA: true, capB: true, cz: 0.02, color: C.mask, zone: Z.IRON }));
    out.push(faceDecal('head', [[4.43, 0.082, 0.112, 0.02], [4.50, 0.158, 0.188, 0.02], [4.62, 0.213, 0.228, 0.02], [4.78, 0.246, 0.248, 0.02], [4.94, 0.256, 0.250, 0.02], [5.06, 0.240, 0.232, 0.02], [5.12, 0.200, 0.194, 0.02]],
      0.248, 4.42, 5.12, AZ.bossMask, C.mask));
    /* 뿔 */
    [1, -1].forEach(function (sd) {
      out.push(rigid('head', new THREE.ConeGeometry(0.060, 0.42, 6), C.horn, { pos: [sd * 0.20, 0.50, 0.10], rot: [0.10, 0, -sd * 0.42], ht: 0.6 }));
    });
    /* 높은 관 + 금 띠 + 양옆 드림 */
    out.push(tube([[5.10, 0.190, 0.160, 0.170], [5.30, 0.200, 0.170, 0.180], [5.52, 0.212, 0.180, 0.190], [5.58, 0.150, 0.130, 0.140]],
      { chain: [['head', 0]], seg: 10, sq: 0.7, capB: true, color: C.hat, zone: Z.IRON }));
    out.push(tube([[5.16, 0.198, 0.168, 0.178], [5.24, 0.204, 0.174, 0.184]], { chain: [['head', 0]], seg: 10, sq: 0.7, color: C.gold, zone: Z.GOLD, nh: 1 }));
    out.push(rigid('head', new THREE.BoxGeometry(0.50, 0.03, 0.03), C.iron, { pos: [0, 0.80, 0.0], nh: 1 }));
    [1, -1].forEach(function (sd) {
      out.push(rigid('head', new THREE.CylinderGeometry(0.012, 0.012, 0.46, 5), C.gold, { pos: [sd * 0.27, 0.57, 0.0], zone: Z.GOLD, nh: 1 }));
      out.push(rigid('head', ball(0.028, 1, 1.6, 1), C.gem, { pos: [sd * 0.27, 0.32, 0.0], zone: Z.GOLD, nh: 1 }));
    });
    /* 긴 머리 — 뒤통수에서 등 가운데까지 늘어진다(스프링 뼈). */
    out.push(tube([[5.10, 0.230, 0.200, 0.250], [4.80, 0.265, 0.200, 0.275], [4.40, 0.300, 0.180, 0.300], [3.90, 0.330, 0.170, 0.330, 0, 0, 0.03], [3.45, 0.300, 0.160, 0.340, 0, 0, 0.05, 0.30]],
      { chain: [['head', 5.10], ['hair', 4.50]], blend: 0.22, seg: 14, pleats: 11, arc: [0.50 * PI, 1.50 * PI], cz: 0.02, color: C.hair, zone: Z.CLOTH }));
    /* 지팡이 — 긴 자루, 꼭대기의 큰 고리와 구슬, 양끝 창날, 고리에 달린 드림. 뼈 +Y 가 위. */
    const pole = loft([{ y: -3.30, rx: 0.012, rzF: 0.012, rzB: 0.012 }, { y: -3.05, rx: 0.060, rzF: 0.060, rzB: 0.060 }, { y: -2.90, rx: 0.042, rzF: 0.042, rzB: 0.042 },
      { y: 1.30, rx: 0.045, rzF: 0.045, rzB: 0.045 }, { y: 1.42, rx: 0.075, rzF: 0.075, rzB: 0.075 }, { y: 1.52, rx: 0.045, rzF: 0.045, rzB: 0.045 }],
      { seg: 6, capA: true, capB: true, tile: 0.6 });
    out.push(rigid('weapon', pole.geo, C.staff, { zone: AZ.wood, uvKeep: true, ht: 0.6 }));
    out.push(rigid('weapon', new THREE.TorusGeometry(0.36, 0.034, 5, 20), C.iron, { pos: [0, 1.92, 0], zone: Z.IRON, ht: 0.6 }));
    out.push(rigid('weapon', ball(0.13, 1, 1, 1), C.gem, { pos: [0, 1.92, 0], zone: Z.GOLD, ht: 0.6 }));
    out.push(rigid('weapon', new THREE.ConeGeometry(0.055, 0.50, 6), C.iron, { pos: [0, 2.54, 0], zone: Z.IRON, ht: 0.5 }));
    [1, -1].forEach(function (sd) {
      out.push(rigid('weapon', new THREE.ConeGeometry(0.030, 0.18, 5), C.iron, { pos: [sd * 0.10, 2.36, 0], rot: [0, 0, -sd * 0.7], zone: Z.IRON, nh: 1 }));
      out.push(rigid('weapon', new THREE.CylinderGeometry(0.010, 0.010, 0.34, 5), C.gold, { pos: [sd * 0.36, 1.66, 0], zone: Z.GOLD, nh: 1 }));
      out.push(rigid('weapon', ball(0.036, 1, 2.2, 1), V.robe, { pos: [sd * 0.36, 1.42, 0], nh: 1 }));
    });
    return out;
  },
  clips: function (spec, prefix) {
    const S = withAnim(spec);
    const W = spec.walk;
    /* idle — 지팡이를 짚고 선 채 느린 숨. 머리가 천천히 좌우를 훑는다. */
    const idle = clipFromKeys(S, prefix, 'idle', [
      K(0.0, {}),
      K(1.6, { spine: [0.05, 0, 0.006], chest: [0.08, -0.03, 0.010], shoulderL: [0, 0, 0.07], shoulderR: [0, 0, -0.07], head: [-0.04, 0.12, 0], upperarmR: [-0.56, 0.10, -0.36], forearmL: [-1.24, -1.05, 0] }, { py: -0.020 }),
      K(3.2, { spine: [0.02, 0, -0.006], chest: [0.02, 0.03, -0.010], head: [0.00, -0.14, 0], upperarmR: [-0.48, 0.10, -0.32], forearmL: [-1.16, -1.05, 0] }, { py: 0.010 }),
      K(4.8, {})
    ], { spline: true, fps: 20 });
    /* walk — 미끄러지듯 느린 걸음. 지팡이는 곧게 선 채 발걸음마다 땅을 짚는다. */
    const walk = clipFromFn(S, prefix, 'walk', spec.walkDur, 28, function (u) {
      const k = walkPose(S, u, W), p = k.p, c = Math.cos(u * PI * 2);
      p.upperarmL = [-0.42, -0.20, 0.16]; p.forearmL = [-1.20, -1.05, 0.0];
      p.upperarmR = [-0.52 - 0.14 * c, 0.10, -0.34]; p.forearmR = [-0.86 + 0.10 * c, 0, 0];
      p.weapon = [1.38, 0, 0.34];
      p.head = [-0.02, p.head[1] * 0.5, 0];
      return k;
    });
    /* wind — 예비. 지팡이를 머리 위로 치켜들고 몸을 뒤로 감은 채 굳는다(예고). */
    const windPose = { pelvis: [-0.04, -0.26, 0], spine: [-0.12, -0.22, 0], chest: [-0.18, -0.36, 0.05], head: [0.06, 0.30, 0], upperarmR: [-2.60, 0, -0.46], forearmR: [-0.70, 0, -0.05],
      weapon: [0.50, 0.20, 0.10], upperarmL: [-1.90, 0.30, 0.40], forearmL: [-1.00, -0.30, 0], thighL: [-0.16, 0, 0.03], shinL: [0.20, 0, 0] };
    const wind = clipFromKeys(S, prefix, 'wind', [
      K(0.00, {}),
      K(0.22, { pelvis: [0.05, 0.08, 0], spine: [0.10, 0.06, 0], chest: [0.12, 0.08, 0], upperarmR: [-0.90, 0.10, -0.40], forearmR: [-1.10, 0, 0], weapon: [1.10, 0, 0.3] }, { py: -0.08, e: 'out' }),
      K(0.70, windPose, { py: 0.06, pz: -0.10, e: 'back' }),
      K(0.95, Object.assign({}, windPose, { chest: [-0.20, -0.38, 0.05], upperarmR: [-2.66, 0, -0.48] }), { py: 0.07, pz: -0.11 })
    ]);
    /* strike — 내리찍기. 허리가 먼저 풀리고 지팡이가 뒤따라 땅을 친다. */
    const strike = clipFromKeys(S, prefix, 'strike', [
      K(0.00, windPose, { py: 0.07, pz: -0.11 }),
      K(0.12, { pelvis: [0.12, 0.14, 0], spine: [0.20, 0.16, 0], chest: [0.30, 0.28, -0.04], neck: [0.06, 0.08, 0], head: [-0.10, -0.10, 0], upperarmR: [-1.30, -0.10, -0.14], forearmR: [-0.20, 0, 0],
        weapon: [1.96, 0, 0.0], upperarmL: [-0.90, 0.10, 0.30], forearmL: [-0.50, -0.20, 0], thighL: [-0.46, 0, 0.03], shinL: [0.56, 0, 0], thighR: [0.16, 0, -0.03], shinR: [0.24, 0, 0] }, { py: -0.30, pz: 0.22, e: 'in' }),
      K(0.20, { pelvis: [0.16, 0.18, 0], spine: [0.26, 0.20, 0], chest: [0.38, 0.36, -0.05], head: [-0.16, -0.14, 0], upperarmR: [-0.86, -0.14, 0.04], forearmR: [-0.12, 0, 0],
        weapon: [2.40, 0, 0.0], upperarmL: [-0.50, 0.10, 0.30], forearmL: [-0.40, -0.20, 0], thighL: [-0.54, 0, 0.03], shinL: [0.66, 0, 0], thighR: [0.20, 0, -0.03], shinR: [0.30, 0, 0] }, { py: -0.40, pz: 0.28, e: 'snap' }),
      K(0.36, { pelvis: [0.12, 0.14, 0], spine: [0.20, 0.16, 0], chest: [0.30, 0.28, -0.03], head: [-0.12, -0.10, 0], upperarmR: [-0.96, -0.10, 0.04], forearmR: [-0.26, 0, 0],
        weapon: [2.20, 0, 0.0], upperarmL: [-0.46, 0.10, 0.28], forearmL: [-0.60, -0.40, 0], thighL: [-0.46, 0, 0.03], shinL: [0.56, 0, 0], thighR: [0.16, 0, -0.03], shinR: [0.24, 0, 0] }, { py: -0.32, pz: 0.24, e: 'out' }),
      K(0.70, {})
    ]);
    const hit = clipFromKeys(S, prefix, 'hit', [
      K(0.00, {}),
      K(0.09, { pelvis: [-0.07, 0.10, 0.03], spine: [-0.18, 0.08, 0.06], chest: [-0.26, 0.12, 0.08], neck: [-0.08, 0, 0], head: [-0.30, 0.12, 0.06], upperarmL: [-0.10, -0.10, 0.44], forearmL: [-0.70, -0.50, 0],
        upperarmR: [-0.30, 0.10, -0.50], forearmR: [-0.70, 0, 0] }, { pz: -0.10, py: 0.02, e: 'snap' }),
      K(0.28, { spine: [0.08, 0.03, 0.02], chest: [0.12, 0.05, 0.02], head: [-0.06, 0.04, 0.02] }, { pz: -0.03, py: -0.04 }),
      K(0.64, {})
    ]);
    return { idle: idle, walk: walk, wind: wind, strike: strike, hit: hit };
  }
};

export const SPECS = { hero: HERO, minion: MINION, heavy: HEAVY, stone: STONE, boss: BOSS };
