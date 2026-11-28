/* v2/js/inkarena.js — v0.48 **고정 아레나** 무대: 3D 수묵 기물(누각·정자·소나무·대나무·바위·석등·난간·다리·절벽).

   왜 이 모듈이 필요한가 —
   v0.47까지 무대는 (cx,cz) 시드로 계속 새로 지어지는 3×3 청크 창이었고, 소품의 절반은
   `inkpaper.js` 로 오린 **2D 종이 카드**(pHouse/pPine/pBamboo/pLantern/pRock)를 세워 둔 빌보드였다.
   그래서 ① 주인공이 움직이면 맵이 끝없이 확장되고 ② 3D 뼈대 캐릭터 옆에서 기물만 납작한 그림자로
   떠 보였다(창현님 지적).

   v0.48은 무대를 **한 번만 짓는 고정 아레나**로 바꾼다.
   · 안쪽 반경 ARENA_R(19m)이 플레이 공간 — 주인공·몬스터·보스가 이 밖으로 나가지 않는다(경계 클램프).
   · 바깥 20~23m에 건축 띠(누각·정자·섬돌·난간·다리), 23m 밖은 절벽 링이 병풍처럼 감싼다.
   · 기물은 전부 **3D 메시 + 주인공과 같은 3단 붓 계조 수묵 툰 셰이더**(inkhero3d.INK3D.FRAG)로 짓고,
     노멀을 민 인버티드 헐(BackSide)로 먹 외곽선을 두른다. 결(한지 섬유·기와 비늘·바위 균열·천 주름)은
     `inktex3d.js` 아틀라스 칸(zone)으로 입힌다 — 색은 버텍스가, 결은 텍스처가.
   · 정적이므로 **종류별로 하나의 BufferGeometry 로 합쳐** 드로우콜을 3(몸통·먹선·등불)으로 묶는다.

   `?arena=0` — 비교용: v0.47 청크 무한맵으로 되돌린다.
*/
import * as THREE from 'three';
import * as TEX from './inktex3d.js';
import { SKIN_VERT } from './inkbody3d.js';
import { INK3D } from './inkhero3d.js?v=v182';
import { attachSlotModels } from './glbprops.js?v=v182';
import { LANDMARKS, STAGE_SCENERY, groundPoint } from './modules/stageScenery.js';
import { actFromStageId, getActTheme3D, applyThemeToInkUniforms } from './modules/actTheme3d.js';
import { mulberry } from './inkbake.js';
import { createFracturedRockGeo } from './modules/skillAssets3d.js';

export const ARENA = {
  R: 16.5,        /* 플레이 공간 반경 — 경계 클램프 */
  RIM: 20.0,      /* 건축 띠(플레이 밖) */
  CLIFF: 27,      /* 절벽 링 시작 */
  GROUND: 42,     /* 바닥 평면 반경(넉넉히) */
  SEED: 20261120
};

/* ---------------------------------------------------------------- 셰이더
   주인공 셰이더와 같은 3단 붓 계조·마른 붓 그레인·텍스처 아틀라스. 다른 점은 하나:
   vH(붓 번짐 높이)를 캐릭터 키(2.45m)가 아니라 기물 기준(5.5m)으로 나눈다. */
let joineryAtlas;
function joineryTexture() {
  if (!joineryAtlas) {
    joineryAtlas = new THREE.TextureLoader().load(new URL('../assets/ink-edition/joinery.webp', import.meta.url).href);
    joineryAtlas.anisotropy = 4;
  }
  return joineryAtlas;
}

function propMat(opt) {
  opt = opt || {};
  const u = INK3D.inkUniforms();
  /* 기물은 캐릭터보다 한 단계 밝게 — 밤 무대에서도 처마 밑 회벽이 먹덩이로 뭉개지지 않게.
     (그림자 맵을 받으면 지붕 그늘이 회벽을 삼켜 새까맣게 보였다 — 받지 않고 계조로만 간다) */
  u.uAmbCol.value.setRGB(0.52, 0.48, 0.42).multiplyScalar(0.24);
  u.uKeyCol.value.setRGB(0.86, 0.83, 0.76).multiplyScalar(1.00);
  u.uFillCol.value.setRGB(0.62, 0.68, 0.78).multiplyScalar(0.30);
  /* 큰 면(절벽·기와)은 결을 옅게 — 0.9로 두면 바위 밝은 얼룩이 1.5배로 증폭돼 회색 판때기가 됐다. */
  u.uTexAmt.value = Math.min(u.uTexAmt.value, 0.55);
  u.uArt.value = joineryTexture();
  u.uHeight = { value: 5.5 };

  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKIN_VERT, fragmentShader: INK3D.FRAG, side: opt.side || THREE.FrontSide });
  m.userData.inkUniforms = u;
  m.userData.arenaMat = true;
  return m;
}

/* ---------------------------------------------------------------- 색 팔레트
   색은 '화면에 보이는 색'이 아니라 셰이더의 albedo(선형)다. 수묵화의 먹은 화면에서 0.15~0.3,
   한지벽은 0.6~0.7 이 되도록 선형값을 낮게 잡았다(첫 시안은 hex 를 그대로 써서 돌·기와가
   회색 판때기로 떴다). */
const PAL = {
  1: { wood: 0x241d17, woodDark: 0x1c1611, plaster: 0xa89a80, tile: 0x151517, stone: 0x2a2a26, pine: 0x10160f, bamboo: 0x18210f, cloth: 0xac6a43, glow: 0xffc06a },
  2: { wood: 0x282219, woodDark: 0x191512, plaster: 0x9d9a8e, tile: 0x181a1d, stone: 0x343634, pine: 0x131d18, bamboo: 0x1c2519, cloth: 0x5e6156, glow: 0xffc778 },
  3: { wood: 0x2a241a, woodDark: 0x1a1510, plaster: 0xa49b80, tile: 0x1a1c17, stone: 0x37382f, pine: 0x142014, bamboo: 0x1f2c15, cloth: 0x6a6250, glow: 0xffc46a },
  4: { wood: 0x2e221b, woodDark: 0x1c1410, plaster: 0xa6947f, tile: 0x1c1819, stone: 0x38312d, pine: 0x161d12, bamboo: 0x1e2614, cloth: 0x6b5a4b, glow: 0xffb066 },
  5: { wood: 0x26241e, woodDark: 0x161614, plaster: 0x9aa2a4, tile: 0x171a1e, stone: 0x323736, pine: 0x141f1c, bamboo: 0x1a251d, cloth: 0x565d5c, glow: 0xffc98a },
  6: { wood: 0x282620, woodDark: 0x181816, plaster: 0xa2a8ab, tile: 0xbed2da, stone: 0x353a3d, pine: 0x15211e, bamboo: 0x1b261f, cloth: 0x585f5e, glow: 0xffcf95 },
  7: { wood: 0x25241d, woodDark: 0x161613, plaster: 0x99a192, tile: 0x171a17, stone: 0x333830, pine: 0x131f17, bamboo: 0x1a2719, cloth: 0x545d51, glow: 0xffc47e },
  8: { wood: 0x262223, woodDark: 0x171517, plaster: 0x9e989f, tile: 0x17171b, stone: 0x343235, pine: 0x141c1c, bamboo: 0x1b221e, cloth: 0x56545a, glow: 0xf6c08c },
  9: { wood: 0x2b1f19, woodDark: 0x18110e, plaster: 0xa08a74, tile: 0x1c1416, stone: 0x38302c, pine: 0x191a13, bamboo: 0x24200f, cloth: 0x674b3c, glow: 0xff9a55 },
  10: { wood: 0x2d221b, woodDark: 0x1a130f, plaster: 0xa89480, tile: 0x1c1715, stone: 0x3a302b, pine: 0x191a12, bamboo: 0x242214, cloth: 0x675245, glow: 0xffb062 },
  11: { wood: 0x2b1d19, woodDark: 0x18100e, plaster: 0x9f857a, tile: 0x1d1315, stone: 0x382a27, pine: 0x191810, bamboo: 0x241d12, cloth: 0x654a40, glow: 0xff8f52 },
  12: { wood: 0x2c1b18, woodDark: 0x180e0e, plaster: 0x9c7b76, tile: 0x1e1113, stone: 0x372725, pine: 0x1a170f, bamboo: 0x231c11, cloth: 0x63433c, glow: 0xff8a48 },
  13: { wood: 0x451212, woodDark: 0x1f0a0c, plaster: 0x8a6967, tile: 0x1c1014, stone: 0x2f1f22, pine: 0x1c1214, bamboo: 0x261414, cloth: 0x6b2224, glow: 0xff5442 },
  14: { wood: 0x25242e, woodDark: 0x14151f, plaster: 0x8b96a6, tile: 0x161a26, stone: 0x2c3240, pine: 0x141e26, bamboo: 0x1c2630, cloth: 0x465266, glow: 0x8fd8ff },
  15: { wood: 0x281e22, woodDark: 0x140f12, plaster: 0x8f8286, tile: 0x151218, stone: 0x2e2930, pine: 0x18151a, bamboo: 0x201c22, cloth: 0x5c2b2f, glow: 0xff7848 },
  16: { wood: 0x182328, woodDark: 0x10181c, plaster: 0x2a383e, tile: 0x131c20, stone: 0x1a262c, pine: 0x121e22, bamboo: 0x142226, cloth: 0x22343a, glow: 0x5be8c4 }
};

/* zone 번호 — inktex3d 아틀라스 칸 */
const ZONE = { WOOD: TEX.Z.SASH, DARK: TEX.Z.CLOTH, PLASTER: TEX.Z.PAPER, TILE: TEX.Z.IRON, STONE: TEX.Z.ROCK, LEAF: TEX.Z.PAPER, CLOTH: TEX.Z.CLOTH, GOLD: TEX.Z.GOLD };

/* ---------------------------------------------------------------- 합치기 도구 */
function makeBuilder(stageId, palette) {
  const root = new THREE.Bone();
  root.name = 'terrain';
  const bones = [root];
  let frame = null;
  function joint(name, parent, x, y, z) {
    const bone = new THREE.Bone();
    bone.name = name; bone.position.set(x,y,z); parent.add(bone);
    bones.push(bone); return bones.length - 1;
  }
  function beginStructure(name,x,z) {
    const base = joint(name + '-foot',root,x,0,z);
    const upper = joint(name + '-frame',bones[base],0,1,0);
    const crown = joint(name + '-crown',bones[upper],0,2,0);
    frame = {base,upper,crown};
    return bones[base];
  }
  function atlasCell(zone,color) {
    if (zone === 24) return 4;
    if (color === 0xcdbb98) return 11;
    if (color === 0x823c38) return 12;
    if (color === 0x292331) return 13;
    if (color === palette.bamboo) return 6;
    if (zone === ZONE.TILE) return stageId === 6 ? 9 : 0;
    if (color === palette.plaster) return 2;
    if (color === palette.cloth) return 5;
    if (zone === ZONE.WOOD) return stageId === 7 ? 7 : 1;
    if (zone === ZONE.STONE) return stageId === 5 ? 8 : stageId === 11 ? 10 : 3;
    return -1;
  }
  const body = [];   /* 수묵 툰 몸통 */
  const glow = [];   /* 스스로 빛나는 창호·등불 */
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();

  function put(list, geo, color, zone, tf) {
    tf = tf || {};
    /* YXZ: 요(집의 향)를 먼저 돌린 뒤 로컬 z 로 지붕 경사를 준다 — XYZ 로 두면
       회전 순서 때문에 지붕면이 엉뚱한 축으로 기울어 용마루 위에서 X자로 교차했다. */
    _e.set(tf.rx || 0, tf.ry || 0, tf.rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    _v.set(tf.x || 0, tf.y || 0, tf.z || 0);
    _s.set(tf.sx == null ? 1 : tf.sx, tf.sy == null ? 1 : tf.sy, tf.sz == null ? 1 : tf.sz);
    _m.compose(_v, _q, _s);
    const cell = list === body ? atlasCell(zone,color) : -1;
    const bone = !frame ? 0 : _v.y < 0.8 ? frame.base : _v.y < 3 ? frame.upper : frame.crown;
    list.push({geo, m:_m.clone(), color, bone, zone:cell < 0 ? zone : cell+8, painted:cell >= 0});
  }
  return {
    body, glow, root, bones, beginStructure, endStructure() { frame = null; },
    add: function (geo, color, zone, tf) { put(body, geo, color, zone, tf); },
    lit: function (geo, color, tf) { put(glow, geo, color, 0, tf); }
  };
}

/** 조각들을 하나의 BufferGeometry 로 굽는다(색·uv·zone 포함). */
function merge(list) {
  let total = 0;
  const bufs = [];
  for (let i = 0; i < list.length; i++) {
    let g = list[i].geo;
    g = g.index ? g.toNonIndexed() : g.clone();
    g.applyMatrix4(list[i].m);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
    if (!pos || !nrm) continue;
    const mode = (g.type === 'PlaneGeometry' || g.type === 'BoxGeometry') ? 'plane' : TEX.uvModeFor(g);
    const uv = list[i].painted && g.attributes.uv ? g.attributes.uv.array : TEX.makeUV(g, mode);
    bufs.push({ pos: pos, nrm: nrm, uv: uv, bone: list[i].bone, col: new THREE.Color(list[i].color).lerp(new THREE.Color(0xb1a592),list[i].painted ? 0.63 : 0), zone: list[i].zone || 0 });
    total += pos.count;
    g.dispose();
  }
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  const U = new Float32Array(total * 2), Z = new Float32Array(total);
  const joints = new Uint16Array(total*4), weights = new Float32Array(total*4);
  let o = 0;
  for (let i = 0; i < bufs.length; i++) {
    const b = bufs[i], n = b.pos.count;
    const pa = b.pos.array, na = b.nrm.array, ua = b.uv;
    for (let k = 0; k < n; k++) {
      const p3 = (o + k) * 3;
      P[p3] = pa[k * 3]; P[p3 + 1] = pa[k * 3 + 1]; P[p3 + 2] = pa[k * 3 + 2];
      N[p3] = na[k * 3]; N[p3 + 1] = na[k * 3 + 1]; N[p3 + 2] = na[k * 3 + 2];
      C[p3] = b.col.r; C[p3 + 1] = b.col.g; C[p3 + 2] = b.col.b;
      U[(o + k) * 2] = ua[k * 2]; U[(o + k) * 2 + 1] = ua[k * 2 + 1];
      Z[o + k] = b.zone;
      joints[(o+k)*4] = b.bone; weights[(o+k)*4] = 1;
    }
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(joints,4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(weights,4));
  geo.setAttribute('zone', new THREE.BufferAttribute(Z, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** 노멀을 밀어 만든 인버티드 헐(먹선). */
function hull(geo, t) {
  const g = geo.clone();
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
  const p = pos.array, n = nrm.array;
  for (let i = 0; i < p.length; i += 3) {
    p[i] += n[i] * t; p[i + 1] += n[i + 1] * t; p[i + 2] += n[i + 2] * t;
  }
  pos.needsUpdate = true;
  g.deleteAttribute('color');
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------- 지오메트리 캐시 */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1),
  cone4: new THREE.ConeGeometry(0.707, 1, 4, 1),
  cone6: new THREE.ConeGeometry(0.62, 1, 6, 1),
  torus: new THREE.TorusGeometry(0.5, 0.14, 5, 10),
  sphere: new THREE.SphereGeometry(0.5, 10, 7),
  sphereLo: new THREE.SphereGeometry(0.5, 8, 6),
  plane: new THREE.PlaneGeometry(1, 1)
};

/* ---------------------------------------------------------------- 기물: 기와집(누각)
   섬돌 위에 기둥 6개, 회벽, 팔작지붕(두 면), 기와 골 5줄, 처마, 창호 불빛. */
function house(B, x, z, ry, opt) {
  opt = opt || {};
  const w = opt.w || 5.4, d = opt.d || 4.2, base = 0.42, wallH = 2.35;
  const c = opt.c;
  const T = function (lx, ly, lz, sx, sy, sz, rx, rz) {
    const cos = Math.cos(ry), sin = Math.sin(ry);
    return { x: x + lx * cos + lz * sin, y: ly, z: z - lx * sin + lz * cos, ry: ry, rx: rx || 0, rz: rz || 0, sx: sx, sy: sy, sz: sz };
  };
  /* 섬돌 */
  B.add(G.box, c.stone, ZONE.STONE, T(0, base * 0.5, 0, w + 1.2, base, d + 1.2));
  B.add(G.box, c.stone, ZONE.STONE, T(0, base + 0.06, d * 0.5 + 0.55, 1.5, 0.12, 0.5));
  /* 기둥 6 */
  const px = [-w / 2 + 0.28, 0, w / 2 - 0.28], pz = [-d / 2 + 0.22, d / 2 - 0.22];
  for (let i = 0; i < px.length; i++) {
    for (let k = 0; k < pz.length; k++) {
      if (i === 1 && k === 1) continue;   /* 앞문 자리 */
      B.add(G.cyl, c.woodDark, ZONE.WOOD, T(px[i], base + wallH * 0.5, pz[k], 0.30, wallH, 0.30));
    }
  }
  /* 회벽: 뒤·좌·우 */
  B.add(G.box, c.plaster, ZONE.PLASTER, T(0, base + wallH * 0.5, -d / 2 + 0.16, w - 0.5, wallH - 0.1, 0.14));
  B.add(G.box, c.plaster, ZONE.PLASTER, T(-w / 2 + 0.16, base + wallH * 0.5, 0, 0.14, wallH - 0.1, d - 0.4));
  B.add(G.box, c.plaster, ZONE.PLASTER, T(w / 2 - 0.16, base + wallH * 0.5, 0, 0.14, wallH - 0.1, d - 0.4));
  /* 앞면: 문틀 좌우 + 상인방 */
  B.add(G.box, c.plaster, ZONE.PLASTER, T(-w * 0.30, base + wallH * 0.5, d / 2 - 0.16, w * 0.36, wallH - 0.1, 0.14));
  B.add(G.box, c.plaster, ZONE.PLASTER, T(w * 0.30, base + wallH * 0.5, d / 2 - 0.16, w * 0.36, wallH - 0.1, 0.14));
  /* 먹 창살 — 벽 위에 얇은 검은 살 3줄 */
  for (let i = -1; i <= 1; i++) {
    B.add(G.box, c.woodDark, ZONE.WOOD, T(-w * 0.30 + i * 0.42, base + wallH * 0.52, d / 2 - 0.06, 0.05, wallH * 0.34, 0.05));
    B.add(G.box, c.woodDark, ZONE.WOOD, T(w * 0.30 + i * 0.42, base + wallH * 0.52, d / 2 - 0.06, 0.05, wallH * 0.34, 0.05));
  }
  /* 들보·도리 */
  B.add(G.box, c.woodDark, ZONE.WOOD, T(0, base + wallH + 0.06, d / 2 - 0.16, w + 0.2, 0.22, 0.22));
  B.add(G.box, c.woodDark, ZONE.WOOD, T(0, base + wallH + 0.06, -d / 2 + 0.16, w + 0.2, 0.22, 0.22));
  /* 창호 불빛 — 두 짝 (수묵 톤을 깨지 않게 호박빛 하나) */
  B.lit(G.plane, c.glow, T(-w * 0.30, base + wallH * 0.55, d / 2 - 0.03, 0.86, 0.9, 1));
  B.lit(G.plane, c.glow, T(w * 0.30, base + wallH * 0.55, d / 2 - 0.03, 0.86, 0.9, 1));

  /* --- 지붕: 용마루 + 두 면 경사 + 기와 골 --- */
  const eaveY = base + wallH + 0.05;
  const ridgeY = eaveY + 1.05;
  const halfW = w / 2 + 1.05, halfD = d / 2 + 0.95;
  const slope = Math.hypot(halfW, ridgeY - eaveY);
  const ang = Math.atan2(ridgeY - eaveY, halfW);
  /* 두 경사면은 용마루 아래에서 살짝 끊고(0.96배) 용마루 먹 상자로 이음매를 덮는다.
     정확히 맞대면 상자 모서리가 용마루 위로 X자로 솟았다. */
  const slopeLen = slope * 0.96;
  const cx0 = Math.cos(ang) * slopeLen * 0.5, cy0 = Math.sin(ang) * slopeLen * 0.5;
  for (const s of [-1, 1]) {
    B.add(G.box, c.tile, ZONE.TILE, T(s * cx0, ridgeY + 0.02 - cy0, 0, slopeLen, 0.17, halfD * 2, 0, -s * ang));
    /* 기와 골 5줄 — 처마에서 용마루까지 */
    for (let k = 0; k < 5; k++) {
      const lz = -halfD + 0.35 + k * (halfD * 2 - 0.7) / 4;
      B.add(G.box, c.tile, ZONE.TILE, T(s * cx0, ridgeY + 0.02 - cy0 + 0.10, lz, slopeLen, 0.10, 0.13, 0, -s * ang));
    }
    /* 처마 끝 — 두꺼운 먹선 띠 */
    B.add(G.box, c.woodDark, ZONE.WOOD, T(s * (halfW - 0.18), eaveY - 0.04, 0, 0.2, 0.16, halfD * 2));
  }
  /* 처마 밑 어두운 다락 상자 — 지붕 두 면 사이의 빈 틈을 먹으로 막는다(삼각판은 벽에 검은 화살촉처럼 비쳤다). */
  B.add(G.box, c.woodDark, ZONE.WOOD, T(0, (eaveY + ridgeY) * 0.5 - 0.04, 0, w - 0.1, Math.max(0.3, ridgeY - eaveY - 0.1), d - 0.2));
  /* 용마루 */
  B.add(G.box, c.woodDark, ZONE.TILE, T(0, ridgeY + 0.08, 0, 0.42, 0.34, halfD * 2 + 0.2));
  /* 치미(장식) */
  B.add(G.cone4, c.woodDark, ZONE.TILE, T(0, ridgeY + 0.34, -halfD - 0.05, 0.34, 0.5, 0.34));
  B.add(G.cone4, c.woodDark, ZONE.TILE, T(0, ridgeY + 0.34, halfD + 0.05, 0.34, 0.5, 0.34));
}

/* ---------------------------------------------------------------- 기물: 정자(사모정) */
function pavilion(B, x, z, ry, c) {
  const w = 3.4, base = 0.5, h = 2.5;
  const T = function (lx, ly, lz, sx, sy, sz, rx, rz) {
    const cos = Math.cos(ry), sin = Math.sin(ry);
    return { x: x + lx * cos + lz * sin, y: ly, z: z - lx * sin + lz * cos, ry: ry, rx: rx || 0, rz: rz || 0, sx: sx, sy: sy, sz: sz };
  };
  B.add(G.box, c.stone, ZONE.STONE, T(0, base * 0.5, 0, w + 0.8, base, w + 0.8));
  B.add(G.box, c.wood, ZONE.WOOD, T(0, base + 0.08, 0, w + 0.2, 0.16, w + 0.2));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.add(G.cyl, c.woodDark, ZONE.WOOD, T(sx * w * 0.44, base + h * 0.5, sz * w * 0.44, 0.24, h, 0.24));
  }
  /* 사면 난간 */
  for (const s of [-1, 1]) {
    B.add(G.box, c.wood, ZONE.WOOD, T(0, base + 0.62, s * w * 0.46, w * 0.9, 0.1, 0.1));
    B.add(G.box, c.wood, ZONE.WOOD, T(s * w * 0.46, base + 0.62, 0, 0.1, 0.1, w * 0.9));
  }
  B.add(G.box, c.woodDark, ZONE.WOOD, T(0, base + h, 0, w * 0.96, 0.18, w * 0.96));
  /* 네 면 지붕 */
  const eaveY = base + h + 0.1, ridgeY = eaveY + 1.0, half = w / 2 + 0.9;
  const slope = Math.hypot(half, ridgeY - eaveY);
  const ang = Math.atan2(ridgeY - eaveY, half);
  for (const s of [-1, 1]) {
    B.add(G.box, c.tile, ZONE.TILE, T(s * half * 0.5, (eaveY + ridgeY) * 0.5, 0, slope, 0.15, half * 2, 0, s * ang));
    B.add(G.box, c.tile, ZONE.TILE, T(0, (eaveY + ridgeY) * 0.5, s * half * 0.5, half * 2, 0.15, slope, s * -ang, 0));
    B.add(G.box, c.tile, ZONE.TILE, T(s * half * 0.5, (eaveY + ridgeY) * 0.5, 0, slope, 0.15, half * 2, 0, s * ang));
  }
  B.add(G.cone4, c.woodDark, ZONE.TILE, T(0, ridgeY + 0.16, 0, 0.5, 0.4, 0.5));
  B.lit(G.plane, c.glow, T(0, base + h * 0.55, w * 0.47, 0.5, 0.6, 1));
}

/* ---------------------------------------------------------------- 기물: 소나무
   줄기 → 가지 → 솔잎 층. 층을 크게 3단으로 나누고 각 단에 5~7덩이를 겹쳐,
   46° 내려보는 카메라에서도 '판때기 우산'이 아니라 겹겹의 솔잎 덩어리로 읽히게 한다. */
function pine(B, x, z, rnd, c, s) {
  s = s || 1;
  const trunkH = (3.2 + rnd() * 1.4) * s;
  const lean = (rnd() - 0.5) * 0.42;
  let px = 0, pz = 0, py = 0;
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const segH = trunkH / segs;
    const r0 = (0.26 - i * 0.045) * s, r1 = (0.26 - (i + 1) * 0.045) * s;
    const dx = lean * (i + 1) * 0.18, dz = (rnd() - 0.5) * 0.14;
    const g = new THREE.CylinderGeometry(Math.max(0.03, r1), Math.max(0.045, r0), segH, 7, 1);
    B.add(g, c.woodDark, ZONE.WOOD, { x: x + px + dx * 0.5, y: py + segH * 0.5, z: z + pz + dz * 0.5, rz: -dx / segH, rx: dz / segH, sx: 1, sy: 1, sz: 1 });
    px += dx; pz += dz; py += segH;
    g.dispose();
  }
  const top = py;
  /* 3단 솔잎 층 — 아래로 갈수록 넓고 위로 갈수록 작다 */
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const ty = top * (0.52 + t * 0.19);
    const rad = (1.75 - t * 0.42) * s;
    const n = 6 + (t < 2 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const outer = i < n - 2;
      const a = (i / n) * Math.PI * 2 + t * 0.9 + rnd() * 0.35;
      const rr = outer ? rad * (0.6 + rnd() * 0.45) : rad * (0.12 + rnd() * 0.22);
      const w = (outer ? 1.1 : 1.25 - t * 0.18) * s * (0.82 + rnd() * 0.34);
      B.add(G.sphereLo, c.pine, ZONE.LEAF, {
        x: x + px + Math.cos(a) * rr, y: ty + (rnd() - 0.5) * 0.5 * s, z: z + pz + Math.sin(a) * rr,
        sx: w, sy: (0.4 + rnd() * 0.16) * s, sz: w * 0.92, ry: a, rz: (rnd() - 0.5) * 0.26
      });
    }
    /* 가지 — 층마다 2~3개, 솔잎 아래에서 뻗는다 */
    for (let i = 0; i < 2; i++) {
      const a = rnd() * Math.PI * 2;
      const len = rad * (0.75 + rnd() * 0.4);
      const bg = new THREE.CylinderGeometry(0.035 * s, 0.075 * s, len, 5, 1);
      B.add(bg, c.woodDark, ZONE.WOOD, { x: x + px + Math.cos(a) * len * 0.45, y: ty - 0.1, z: z + pz + Math.sin(a) * len * 0.45, rz: Math.PI / 2, ry: -a });
      bg.dispose();
    }
  }
  /* 꼭대기 솔잎 */
  for (let k = 0; k < 3; k++) {
    const w = (1.15 - k * 0.3) * s;
    B.add(G.sphereLo, c.pine, ZONE.LEAF, {
      x: x + px + (rnd() - 0.5) * 0.35 * s, y: top + 0.02 + k * 0.22, z: z + pz + (rnd() - 0.5) * 0.35 * s,
      sx: w, sy: 0.34 * s, sz: w * 0.9, ry: rnd() * 6.28
    });
  }
}

/* ---------------------------------------------------------------- 기물: 대나무 숲 */
function bambooGrove(B, x, z, rnd, c, n) {
  n = n || 7;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.6) * 1.9;
    const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
    const h = 4.6 + rnd() * 2.6;
    const rad = 0.055 + rnd() * 0.035;
    const lean = (rnd() - 0.5) * 0.14;
    B.add(G.cyl6, c.bamboo, ZONE.WOOD, { x: bx, y: h * 0.5, z: bz, sx: rad * 2, sy: h, sz: rad * 2, rz: lean, rx: (rnd() - 0.5) * 0.1 });
    /* 마디 3개 */
    for (let k = 1; k <= 3; k++) {
      B.add(G.cyl6, c.woodDark, ZONE.WOOD, { x: bx + lean * h * (k / 4) * 0.4, y: h * (k / 4), z: bz, sx: rad * 2.35, sy: 0.055, sz: rad * 2.35, rz: lean });
    }
    /* 잎 — 위쪽 3마디에 얇은 잎판 */
    for (let k = 0; k < 7; k++) {
      const ly = h * (0.62 + rnd() * 0.4);
      const la = rnd() * Math.PI * 2;
      B.add(G.box, c.bamboo, ZONE.LEAF, {
        x: bx + Math.cos(la) * (0.28 + rnd() * 0.5), y: ly, z: bz + Math.sin(la) * (0.28 + rnd() * 0.5),
        sx: 0.62 + rnd() * 0.55, sy: 0.045, sz: 0.12, ry: -la, rz: (rnd() - 0.5) * 0.7
      });
    }
  }
}

/* ---------------------------------------------------------------- 기물: 바위
   첫 시안은 이십면체 꼭짓점을 각각 무작위로 밀어(정점마다 다른 값) 면이 서로 꿰뚫려
   '구겨진 종이'가 됐다. 이제 **방향의 매끄러운 함수**로 밀어 진짜 바위 단면을 만든다. */
function rockGeo(seed, detail) {
  const g = new THREE.IcosahedronGeometry(1, detail == null ? 2 : detail);
  const p = g.getAttribute('position');
  const s1 = 3.1 + (seed % 7) * 0.37, s2 = 4.3 + (seed % 5) * 0.51, s3 = 3.7 + (seed % 3) * 0.83;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.17 * Math.sin(x * s1 + seed) + 0.13 * Math.sin(y * s2 + seed * 0.7) + 0.11 * Math.cos(z * s3 + seed * 1.3);
    p.setXYZ(i, x * k, y * k * 0.74, z * k);
  }
  g.computeVertexNormals();
  return g;
}
function rock(B, x, z, rnd, c, s) {
  s = s || 1;
  /* v0.63 lightning-energy-skill-vfx: 16-평면 절단 날카로운 현무암 바위 직이식 */
  const seeds = [91, 57, 23, 137, 211, 73];
  const g = createFracturedRockGeo(seeds[Math.floor(rnd() * seeds.length)], 0.72);
  B.add(g, c.stone, ZONE.STONE, { x: x, y: 0.24 * s, z: z, sx: 1.05 * s, sy: 0.78 * s, sz: 0.96 * s, ry: rnd() * 6.28, rz: (rnd() - 0.5) * 0.14 });
  g.dispose();
  if (rnd() < 0.45) {
    const g2 = createFracturedRockGeo(seeds[Math.floor(rnd() * seeds.length)], 0.65);
    B.add(g2, c.stone, ZONE.STONE, { x: x + (rnd() - 0.5) * 0.85 * s, y: 0.14 * s, z: z + (rnd() - 0.5) * 0.85 * s, sx: 0.52 * s, sy: 0.42 * s, sz: 0.48 * s, ry: rnd() * 6.28 });
    g2.dispose();
  }
}

/* ---------------------------------------------------------------- 기물: 석등 (v0.63 Kasumidera 육각 조각 석등) */
function lantern(B, x, z, ry, c) {
  const T = function (lx, ly, lz, sx, sy, sz, rx, rz) {
    const cos = Math.cos(ry), sin = Math.sin(ry);
    return { x: x + lx * cos + lz * sin, y: ly, z: z - lx * sin + lz * cos, ry: ry, rx: rx || 0, rz: rz || 0, sx: sx, sy: sy, sz: sz };
  };
  /* 2단 육각 기단 + 연화대 간주석 */
  B.add(G.cyl6, c.stone, ZONE.STONE, T(0, 0.10, 0, 1.02, 0.20, 1.02));
  B.add(G.cyl6, c.stone, ZONE.STONE, T(0, 0.26, 0, 0.76, 0.14, 0.76));
  B.add(G.cyl6, c.stone, ZONE.STONE, T(0, 0.76, 0, 0.34, 0.90, 0.34));
  /* 연꽃 중대석 */
  B.add(G.cyl6, c.stone, ZONE.STONE, T(0, 1.28, 0, 0.72, 0.15, 0.72));
  B.add(G.cyl6, c.woodDark, ZONE.STONE, T(0, 1.38, 0, 0.54, 0.08, 0.54));
  /* 화사석(6개 석재 창살 기둥 + 내부 역광 한지 등불) */
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + ry;
    B.add(G.cyl6, c.stone, ZONE.STONE, { x: x + Math.cos(a) * 0.25, y: 1.62, z: z - Math.sin(a) * 0.25, sx: 0.075, sy: 0.44, sz: 0.075 });
  }
  B.lit(G.cyl6, c.glow, T(0, 1.62, 0, 0.38, 0.38, 0.38));
  /* 넓은 육각 곡선 옥개석(2단 지붕) + 보주 */
  B.add(G.cyl6, c.tile || c.stone, ZONE.STONE, T(0, 1.90, 0, 1.18, 0.10, 1.18));
  B.add(G.cone6, c.tile || c.stone, ZONE.STONE, T(0, 2.12, 0, 1.16, 0.36, 1.16));
  B.add(G.sphereLo, c.stone, ZONE.STONE, T(0, 2.34, 0, 0.18, 0.24, 0.18));
}

/* ---------------------------------------------------------------- 기물: 난간·다리·좌판 */
function railing(B, x, z, ry, len, c) {
  const n = Math.max(2, Math.round(len / 1.7));
  const cos = Math.cos(ry), sin = Math.sin(ry);
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    B.add(G.box, c.woodDark, ZONE.WOOD, { x: x + t * cos, y: 0.62, z: z - t * sin, sx: 0.13, sy: 1.24, sz: 0.13, ry: ry });
  }
  for (const yy of [1.16, 0.74]) {
    B.add(G.box, c.wood, ZONE.WOOD, { x: x, y: yy, z: z, sx: len, sy: 0.08, sz: 0.09, ry: ry });
  }
}

/* v0.63 Kasumidera bridge.jpg: 캠버 아치 목교(휜 상판·하부 아치 들보·이중 주홍 난간·청동 보주 기둥머리·돌 교대) */
function bridge(B, x, z, ry, len, c) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const archH = 0.88, width = 2.1;
  const railCol = 0x823c38;
  const T = function (lx, ly, lz, sx, sy, sz, rx, rz) {
    return { x: x + lx * cos + lz * sin, y: ly, z: z - lx * sin + lz * cos, ry: ry, rx: rx || 0, rz: rz || 0, sx: sx, sy: sy, sz: sz };
  };
  /* 양쪽 돌 교대 */
  for (const s of [-1, 1]) {
    B.add(G.box, c.stone, ZONE.STONE, T(s * len * 0.48, 0.22, 0, 1.05, 0.48, width + 0.4));
  }
  /* 휜 아치 상판 + 하부 아치 들보 */
  const n = Math.max(10, Math.round(len / 0.52));
  const segLen = len / n;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const lx = (u - 0.5) * len;
    const ly = 0.24 + Math.sin(u * Math.PI) * archH;
    const slope = Math.atan(Math.cos(u * Math.PI) * (archH * Math.PI / len));
    B.add(G.box, c.wood, ZONE.WOOD, T(lx, ly, 0, segLen * 0.92, 0.10, width, 0, slope));
    for (const s of [-1, 1]) {
      B.add(G.box, c.woodDark, ZONE.WOOD, T(lx, ly - 0.14, s * (width * 0.40), segLen * 1.06, 0.16, 0.14, 0, slope));
      /* 상·중 이중 주홍 곡선 난간 */
      B.add(G.box, railCol, ZONE.WOOD, T(lx, ly + 0.82, s * (width * 0.48), segLen * 1.06, 0.09, 0.10, 0, slope));
      B.add(G.box, railCol, ZONE.WOOD, T(lx, ly + 0.46, s * (width * 0.48), segLen * 1.06, 0.06, 0.08, 0, slope));
    }
  }
  /* 난간 기둥 5쌍 + 청동 보주(Giboshi) 머리 */
  for (let j = 0; j < 5; j++) {
    const u = j / 4;
    const lx = (u - 0.5) * len * 0.90;
    const ly = 0.24 + Math.sin(u * Math.PI) * archH;
    for (const s of [-1, 1]) {
      B.add(G.box, railCol, ZONE.WOOD, T(lx, ly + 0.44, s * (width * 0.48), 0.13, 0.88, 0.13));
      B.add(G.cone6, c.woodDark, ZONE.GOLD, T(lx, ly + 0.98, s * (width * 0.48), 0.18, 0.24, 0.18));
    }
  }
}

/* v0.63 3d-cloth-material: 현수선 드리핑 천막 + 주름 자락 + 호롱불 저잣거리 좌판 */
function stall(B, x, z, ry, c, bare = false) {
  const T = function (lx, ly, lz, sx, sy, sz, rx, rz) {
    const cos = Math.cos(ry), sin = Math.sin(ry);
    return { x: x + lx * cos + lz * sin, y: ly, z: z - lx * sin + lz * cos, ry: ry, rx: rx || 0, rz: rz || 0, sx: sx, sy: sy, sz: sz };
  };
  /* 좌판 테이블 + 보강 횡목 */
  B.add(G.box, c.wood, ZONE.WOOD, T(0, 0.78, 0, 2.05, 0.10, 1.02));
  B.add(G.box, c.woodDark, ZONE.WOOD, T(0, 0.32, 0, 1.75, 0.07, 0.80));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.add(G.box, c.woodDark, ZONE.WOOD, T(sx * 0.86, 0.39, sz * 0.42, 0.10, 0.78, 0.10));
  }
  /* 좌판 위 물건 — 옹기 항아리 + 포목 묶음 */
  B.add(G.cyl, c.woodDark, ZONE.STONE, T(-0.52, 0.94, 0.08, 0.26, 0.26, 0.26));
  B.add(G.cyl, c.woodDark, ZONE.STONE, T(-0.20, 0.90, -0.12, 0.20, 0.18, 0.20));
  B.add(G.box, c.plaster, ZONE.PLASTER, T(0.42, 0.91, -0.04, 0.46, 0.16, 0.34, 0, 0.06));
  if (bare) return;
  /* 목재 기둥 4 + 횡목 들보 */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const ph = sz < 0 ? 2.42 : 2.10;
    B.add(G.cyl, c.woodDark, ZONE.WOOD, T(sx * 0.98, ph * 0.5, sz * 0.56, 0.10, ph, 0.10));
  }
  B.add(G.cyl, c.wood, ZONE.WOOD, T(0, 2.38, -0.56, 0.08, 2.42, 0.08, 0, Math.PI / 2));
  B.add(G.cyl, c.wood, ZONE.WOOD, T(0, 2.08, 0.56, 0.08, 2.42, 0.08, 0, Math.PI / 2));
  /* 3d-cloth-material 현수선(catenary) 처짐 직조 천막 5분할 드레이프 */
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const u0 = i / segs, u1 = (i + 1) / segs, um = (u0 + u1) * 0.5;
    const z0 = -0.68 + u0 * 1.40, z1 = -0.68 + u1 * 1.40, zm = (z0 + z1) * 0.5;
    const yAt = (u) => 2.44 - u * 0.38 - Math.sin(u * Math.PI) * 0.18;
    const y0 = yAt(u0), y1 = yAt(u1), ym = (y0 + y1) * 0.5;
    const pitch = Math.atan2(y1 - y0, z1 - z0);
    const len = Math.hypot(z1 - z0, y1 - y0) * 1.05;
    B.add(G.box, c.cloth, ZONE.CLOTH, T(0, ym, zm, 2.42, 0.045, len, -pitch, 0));
  }
  /* 앞면 주름진 천막 자락(scalloped pleats) */
  for (let p = -2; p <= 2; p++) {
    B.add(G.box, c.cloth, ZONE.CLOTH, T(p * 0.44, 1.90 + Math.abs(p) * 0.015, 0.72, 0.42, 0.34, 0.035, 0.14, 0));
  }
  /* 처마 끝에 매달린 한지 초롱불 */
  B.lit(G.cyl6, c.glow, T(0.92, 1.82, 0.62, 0.20, 0.28, 0.20));
  B.add(G.cyl6, c.woodDark, ZONE.WOOD, T(0.92, 1.98, 0.62, 0.23, 0.05, 0.23));
}

/* ---------------------------------------------------------------- 기물: 성벽·문 */
function wallRun(B, x, z, ry, len, c) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const h = 2.5;
  B.add(G.box, c.stone, ZONE.STONE, { x: x, y: h * 0.5, z: z, sx: len, sy: h, sz: 0.9, ry: ry });
  /* 여장(성가퀴) */
  const n = Math.max(2, Math.round(len / 1.3));
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (len * (i + 0.5)) / n;
    const big = i % 2 === 0;
    B.add(G.box, c.stone, ZONE.STONE, { x: x + t * cos, y: h + (big ? 0.25 : 0.16), z: z - t * sin, sx: len / n * 0.72, sy: big ? 0.5 : 0.32, sz: 0.94, ry: ry });
  }
  /* 이끼·먹 자국 — 벽에 붙은 얇은 판 */
  B.add(G.box, c.pine, ZONE.LEAF, { x: x + cos * 0.3, y: 0.7, z: z - sin * 0.3, sx: len * 0.5, sy: 0.3, sz: 0.06, ry: ry });
}

function gate(B, x, z, ry, c) {
  const T = function (lx, ly, lz, sx, sy, sz) {
    const cos = Math.cos(ry), sin = Math.sin(ry);
    return { x: x + lx * cos + lz * sin, y: ly, z: z - lx * sin + lz * cos, ry: ry, sx: sx, sy: sy, sz: sz };
  };
  for (const s of [-1, 1]) {
    B.add(G.box, c.stone, ZONE.STONE, T(s * 2.05, 2.1, 0, 0.85, 4.2, 0.95));
    B.add(G.box, c.stone, ZONE.STONE, T(s * 2.05, 0.25, 0, 1.15, 0.5, 1.25));
  }
  B.add(G.box, c.woodDark, ZONE.WOOD, T(0, 4.15, 0, 5.0, 0.5, 1.0));
  /* 문 상단 지붕 */
  B.add(G.box, c.tile, ZONE.TILE, T(0, 4.6, 0, 6.2, 0.22, 1.9, 0, 0.14));
  B.add(G.box, c.tile, ZONE.TILE, T(0, 4.6, 0, 6.2, 0.22, 1.9, 0, -0.14));
  /* 문짝 — 먹으로 닫힌 판 */
  B.add(G.box, c.woodDark, 24, T(0, 1.55, 0, 3.4, 3.0, 0.12));
  B.add(G.box, c.wood, ZONE.WOOD, T(0, 1.55, 0.07, 3.2, 0.08, 0.06));
  B.add(G.box, c.wood, ZONE.WOOD, T(0, 2.4, 0.07, 3.2, 0.08, 0.06));
}

/* ---------------------------------------------------------------- 절벽 링
   첫 시안은 큰 이십면체를 늘여 세웠는데, 화면에서는 구겨진 종이판처럼 보였다.
   v0.48 확정안: 안쪽 기슭(26m) → 마루(31m, 톱니 높이) → 바깥 기슭(40m)로 이어지는
   **지그재그 능선 띠** 하나 + 기슭 바위 몇 개. 병풍과 함께 무대 밖을 그림으로 닫는다. */
function cliffRing(B, rnd, c) {
  /* 1) 기슭 먹 띠 — 절벽 아래 어둠(경계선) */
  const N = 76, TAU2 = Math.PI * 2;
  const rIn = 24.6;
  const bp = [];
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU2, a1 = ((i + 1) / N) * TAU2;
    const x0 = Math.cos(a0) * (rIn - 2.2), z0 = Math.sin(a0) * (rIn - 2.2);
    const x1 = Math.cos(a1) * (rIn - 2.2), z1 = Math.sin(a1) * (rIn - 2.2);
    const x2 = Math.cos(a1) * rIn, z2 = Math.sin(a1) * rIn;
    const x3 = Math.cos(a0) * rIn, z3 = Math.sin(a0) * rIn;
    bp.push(x0, 0.02, z0, x3, 0.9, z3, x2, 0.9, z2);
    bp.push(x0, 0.02, z0, x2, 0.9, z2, x1, 0.02, z1);
  }
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  bgeo.computeVertexNormals();
  B.add(bgeo, c.woodDark, ZONE.STONE, { x: 0, y: 0, z: 0 });
  bgeo.dispose();

  /* 2) 바위 테두리 — 크기가 다른 바위를 겹쳐 세워 톱니 능선을 만든다(부드러운 언덕이 아니라 깨진 돌). */
  const NB = 54;
  for (let i = 0; i < NB; i++) {
    const a = (i / NB) * TAU2 + (rnd() - 0.5) * 0.05;
    const r = rIn + 0.6 + rnd() * 1.8;
    const w = 1.7 + rnd() * 2.2, h = 1.1 + rnd() * 1.7, d = 1.4 + rnd() * 1.6;
    const g = rockGeo(Math.floor(rnd() * 97), i % 2 === 0 ? 1 : 2);
    B.add(g, c.stone, ZONE.STONE, {
      x: Math.cos(a) * r, y: h * 0.35, z: Math.sin(a) * r,
      sx: w, sy: h, sz: d, ry: rnd() * 6.28, rz: (rnd() - 0.5) * 0.22
    });
    g.dispose();
    /* 큰 바위 뒤에 한 겹 더 — 실루엣이 겹쳐야 절벽으로 읽힌다 */
    if (i % 2 === 0) {
      const g2 = rockGeo(Math.floor(rnd() * 97), 1);
      B.add(g2, c.stone, ZONE.STONE, {
        x: Math.cos(a) * (r + 2.2), y: (h * 0.9) * 0.4, z: Math.sin(a) * (r + 2.2),
        sx: w * 1.25, sy: h * 1.7, sz: d * 1.2, ry: rnd() * 6.28
      });
      g2.dispose();
    }
  }
  /* 3) 솟은 바위 첨탑 3기 — 원경 실루엣의 기준점(참고작의 절벽 봉우리) */
  const spire = [[2.3, 1.1], [4.4, 0.7], [5.6, 0.95]];
  for (let i = 0; i < spire.length; i++) {
    const a = spire[i][0], r = rIn + 3.5 + rnd() * 1.5;
    const h = 5.2 + rnd() * 2.6;
    const g = rockGeo(Math.floor(rnd() * 97), 2);
    B.add(g, c.stone, ZONE.STONE, { x: Math.cos(a) * r, y: h * 0.42, z: Math.sin(a) * r, sx: 1.5 + rnd(), sy: h, sz: 1.6 + rnd(), ry: rnd() * 6.28 });
    g.dispose();
  }
}

/* ---------------------------------------------------------------- 원경 나무 띠
   절벽(25~28m) 뒤 32~40m에 낮은 수묵 실루엣을 세워 원경 파노라마와의 사이에 깊이를 만든다. */

/* ---------------------------------------------------------------- 아레나 조립 */
export function buildArena(opts) {
  opts = opts || {};
  const stageId = opts.stageId || 1;
  const c = PAL[stageId] || PAL[1];
  const rnd = mulberry((opts.seed || ARENA.SEED) ^ (stageId * 7919));
  const B = makeBuilder(stageId,c);
  const props = [];   /* {x,z,r} — 절차 배치가 겹치지 않게 */
  const spots = [];   /* QA·조명용: 큰 기물 위치 */

  // Stage coordinates: lateral offset and depth away from the fixed camera.
  // Keep tall silhouettes at the back and flanks, outside the gesture lane.
  const tree = (x,z) => pine(B,x,z,rnd,c,1.2);
  const grove = (x,z) => bambooGrove(B,x,z,rnd,c,9);
  const rubble = (x,z) => rock(B,x,z,rnd,c,1.4);
  const lamp = (x,z,r) => lantern(B,x,z,r,c);
  const door = (x,z,r) => gate(B,x,z,r,c);
  const wall = (x,z,r) => wallRun(B,x,z,r,6,c);
  const court = (x,z,r) => pavilion(B,x,z,r,c);
  const roof = (x,z,r) => house(B,x,z,r,{c, w:6, d:4});
  const market = (x,z,r) => stall(B,x,z,r,c);
  /* v0.63 Kasumidera gate.jpg/eaves.jpg: 다층 목조/석조 사찰 탑(기단·주홍 기둥·난간·역광 창호·곡선 기와 처마·청동 상륜부) */
  function pagoda(x,z,ry) {
    ry = ry || Math.PI / 4;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const T = (lx, ly, lz, sx, sy, sz, rx, rz) => ({
      x: x + lx * cos + lz * sin, y: ly, z: z - lx * sin + lz * cos, ry, rx: rx || 0, rz: rz || 0, sx, sy, sz
    });
    const redWood = 0x823c38;
    /* 2단 석재 기단 */
    B.add(G.box, c.stone, ZONE.STONE, T(0, 0.24, 0, 4.1, 0.48, 4.1));
    B.add(G.box, c.stone, ZONE.STONE, T(0, 0.56, 0, 3.4, 0.18, 3.4));
    let curY = 0.65;
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const k = 1 - i * 0.18;
      const bodyW = 2.35 * k;
      const floorH = (i === 0 ? 1.55 : 1.12) * (0.94 + 0.06 * k);
      const eaveW = bodyW + 1.55 * (0.85 + 0.15 * k);
      /* 중앙 코어 + 4면 역광 한지 창호 */
      B.add(G.box, c.woodDark, ZONE.WOOD, T(0, curY + floorH * 0.5, 0, bodyW * 0.86, floorH, bodyW * 0.86));
      for (const s of [-1, 1]) {
        B.lit(G.box, c.glow, T(0, curY + floorH * 0.52, s * (bodyW * 0.445), bodyW * 0.56, floorH * 0.60, 0.05));
        B.lit(G.box, c.glow, T(s * (bodyW * 0.445), curY + floorH * 0.52, 0, 0.05, floorH * 0.60, bodyW * 0.56));
      }
      /* 4모서리 주홍 기둥 + 난간 발코니 */
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B.add(G.cyl, redWood, ZONE.WOOD, T(sx * bodyW * 0.46, curY + floorH * 0.5, sz * bodyW * 0.46, 0.19 * k + 0.06, floorH, 0.19 * k + 0.06));
      }
      const railW = bodyW + 0.36;
      for (const s of [-1, 1]) {
        B.add(G.box, redWood, ZONE.WOOD, T(0, curY + 0.34, s * railW * 0.5, railW, 0.09, 0.09));
        B.add(G.box, redWood, ZONE.WOOD, T(s * railW * 0.5, curY + 0.34, 0, 0.09, 0.09, railW));
      }
      /* 처마 공포 들보 + 2단 플레어 기와 지붕(추녀 들림 실루엣) */
      const roofY = curY + floorH;
      B.add(G.box, c.woodDark, ZONE.WOOD, T(0, roofY + 0.06, 0, bodyW + 0.45, 0.16, bodyW + 0.45));
      B.add(G.box, c.tile || c.stone, ZONE.TILE, T(0, roofY + 0.20, 0, eaveW, 0.14, eaveW));
      const coneTf = T(0, roofY + 0.56, 0, eaveW * 0.96, 0.62, eaveW * 0.96);
      coneTf.ry = ry + Math.PI / 4;
      B.add(G.cone4, c.tile || c.stone, ZONE.TILE, coneTf);
      curY = roofY + 0.62;
    }
    /* 꼭대기 청동 상륜부(Sorin) 찰주 + 5겹 보륜 */
    B.add(G.cyl6, c.woodDark, ZONE.GOLD, T(0, curY + 0.85, 0, 0.11, 1.85, 0.11));
    for (let r = 0; r < 5; r++) {
      B.add(G.torus, c.woodDark, ZONE.GOLD, T(0, curY + 0.42 + r * 0.24, 0, 0.44 - r * 0.05, 0.44 - r * 0.05, 0.18, Math.PI / 2, 0));
    }
    B.add(G.sphereLo, c.woodDark, ZONE.GOLD, T(0, curY + 1.82, 0, 0.24, 0.28, 0.24));
  }
  function deadTree(x,z) {
    B.add(G.cyl6,c.woodDark,ZONE.WOOD,{x,z,y:2,sx:.8,sy:4.2,sz:.9,rz:.12});
    for(let j=0;j<6;j++) {
      const a=j*2.4;
      B.add(G.cyl6,c.wood,ZONE.WOOD,{x:x+Math.cos(a)*.7,z:z+Math.sin(a)*.7,y:2.5+j*.37,sx:.25,sy:2.5,sz:.26,ry:-a,rz:-.65});
    }
  }
  function ribs(x,z) {
    for(let j=0;j<5;j++) {
      const bone = new THREE.TorusGeometry(1.45-j*.1,.11,5,12,Math.PI*1.35);
      B.add(bone,0xcdbb98,ZONE.STONE,{x:x+j*.55,z,y:.23,ry:Math.PI/2,rz:-.4});
      bone.dispose();
    }
  }
  /* v0.63 Kasumidera eaves.jpg: 사당/소전각 (석재 기단·계단·주홍 기둥 4·역광 한지 창살문·이중 기와 처마·치미) */
  function shrine(x,z,ry) {
    ry = ry || Math.PI / 4;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const T = (lx, ly, lz, sx, sy, sz, rx, rz) => ({
      x: x + lx * cos + lz * sin, y: ly, z: z - lx * sin + lz * cos, ry, rx: rx || 0, rz: rz || 0, sx, sy, sz
    });
    const redWood = 0x823c38;
    const w = 2.7, d = 2.2, base = 0.46, h = 2.05;
    /* 석재 기단 + 앞 돌계단 */
    B.add(G.box, c.stone, ZONE.STONE, T(0, base * 0.5, 0, w + 0.9, base, d + 0.9));
    B.add(G.box, c.stone, ZONE.STONE, T(0, base * 0.35, d * 0.5 + 0.52, 1.35, base * 0.7, 0.48));
    /* 내부 어두운 감실 + 주홍 기둥 4 */
    B.add(G.box, c.woodDark, ZONE.WOOD, T(0, base + h * 0.5, -0.08, w * 0.82, h, d * 0.74));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      B.add(G.cyl, redWood, ZONE.WOOD, T(sx * w * 0.44, base + h * 0.5, sz * d * 0.42, 0.22, h, 0.22));
    }
    /* 앞면 역광 한지 신당 문 + 세로 창살 */
    B.lit(G.box, c.glow, T(0, base + h * 0.48, d * 0.33, 1.35, 1.25, 0.06));
    for (let m = -1; m <= 1; m++) {
      B.add(G.box, c.woodDark, ZONE.WOOD, T(m * 0.36, base + h * 0.48, d * 0.35, 0.055, 1.30, 0.055));
    }
    /* 들보·공포 + 맞배/팔작 기와 지붕 + 용마루·치미 */
    const eaveY = base + h + 0.06, ridgeY = eaveY + 0.92;
    B.add(G.box, redWood, ZONE.WOOD, T(0, eaveY, 0, w + 0.35, 0.20, d + 0.35));
    const halfD = d * 0.5 + 0.85, slope = Math.hypot(halfD, ridgeY - eaveY) * 0.97;
    const ang = Math.atan2(ridgeY - eaveY, halfD);
    const cz0 = Math.cos(ang) * slope * 0.5, cy0 = Math.sin(ang) * slope * 0.5;
    for (const s of [-1, 1]) {
      B.add(G.box, c.tile, ZONE.TILE, T(0, ridgeY + 0.02 - cy0, s * cz0, w + 1.55, 0.16, slope, s * ang, 0));
    }
    B.add(G.box, c.woodDark, ZONE.TILE, T(0, ridgeY + 0.08, 0, w + 1.75, 0.28, 0.34));
    for (const s of [-1, 1]) {
      B.add(G.cone4, c.woodDark, ZONE.TILE, T(s * (w * 0.5 + 0.84), ridgeY + 0.30, 0, 0.30, 0.44, 0.30));
    }
  }
  /* v0.63 lightning-energy-skill-vfx + Kasumidera cliff.jpg: 16-평면 절단 층상 현무암 암봉(구형 사각뿔 대체) */
  function spire(x,z) {
    const h = 3.1 + rnd() * 2.4;
    const seeds = [91, 57, 23, 137, 211];
    const gBase = createFracturedRockGeo(seeds[Math.floor(rnd() * seeds.length)], 1.05);
    const gMid = createFracturedRockGeo(seeds[Math.floor(rnd() * seeds.length)], 1.25);
    const gTop = createFracturedRockGeo(seeds[Math.floor(rnd() * seeds.length)], 1.35);
    const col = 0x292331;
    const yaw = rnd() * 6.28, tilt = (rnd() - 0.5) * 0.26;
    B.add(gBase, col, ZONE.STONE, { x, z, y: h * 0.20, sx: 1.45, sy: h * 0.34, sz: 1.25, ry: yaw, rz: tilt * 0.5 });
    B.add(gMid, col, ZONE.STONE, { x: x + tilt * 0.4, z: z - tilt * 0.3, y: h * 0.52, sx: 1.02, sy: h * 0.36, sz: 0.90, ry: yaw + 1.1, rz: tilt });
    B.add(gTop, col, ZONE.STONE, { x: x + tilt * 0.85, z: z - tilt * 0.55, y: h * 0.80, sx: 0.62, sy: h * 0.28, sz: 0.56, ry: yaw + 2.3, rz: tilt * 1.3 });
    gBase.dispose(); gMid.dispose(); gTop.dispose();
  }
  const plan = STAGE_SCENERY[stageId] || STAGE_SCENERY[1];
  // The signature stones use existing primitives and the same slot bone as the other proxies.
  function altarStone(x,z,yaw) {
    B.add(G.cyl6, c.stone, ZONE.STONE, { x, z, y:0.25, sx:3.5, sy:0.5, sz:3.2, ry:yaw });
    B.add(G.cyl6, c.tile, ZONE.TILE, { x, z, y:0.58, sx:2.8, sy:0.22, sz:2.6, ry:yaw });
    spire(x,z);
  }
  function sealStone(x,z,yaw) {
    B.add(G.box, c.stone, ZONE.STONE, { x, z, y:0.32, sx:3.1, sy:0.64, sz:1.7, ry:yaw });
    B.add(G.box, c.tile, ZONE.STONE, { x, z, y:2.35, sx:1.9, sy:3.8, sz:0.65, ry:yaw, rz:0.06 });
    const front = 0.38;
    B.lit(G.box, c.glow, { x:x+Math.sin(yaw)*front, z:z+Math.cos(yaw)*front, y:2.65,
      sx:0.09, sy:1.8, sz:0.08, ry:yaw, rz:0.06 });
  }
  const builders = { altarStone, sealStone, market, roof, door, wall, court, grove, tree, deadTree, shrine,
    rubble, lamp, pagoda, ribs, spire, bridge: (x,z,yaw) => bridge(B,x,z,yaw,5,c) };
  const radii = { altarStone: 1.75, sealStone: 1.55, market: 1.7, roof: 2.1, door: 1.8, wall: 1.8, court: 2,
    grove: 1.5, tree: 1.2, deadTree: 1.1, shrine: 1.5, rubble: 1,
    lamp: 0.6, pagoda: 1.9, ribs: 1.4, spire: 1.45, bridge: 1.65 };
  // v1.67: Place all 41 authored GLB landmarks with optional per-slot yaw/scale variation.
  const slots = plan.slots
    .filter(([key]) => LANDMARKS[key] && LANDMARKS[key].model)
    .map(([key, side, depth, yawDeg, scaleMul]) => {
      const spec = LANDMARKS[key];
      const proxy = spec.proxy || key;
      const { x, z } = groundPoint(side, depth);
      const yaw = Math.PI / 4 + ((yawDeg || 0) * Math.PI / 180);
      const sMul = scaleMul || 1;
      const bone = B.beginStructure(key + '-' + spots.length, x, z);
      B.endStructure();
      const cr = (radii[proxy] || 1.4) * Math.min(1.2, Math.max(0.75, sMul));
      const spot = { key, x, z, r: cr * 1.7, cr };
      props.push(spot); spots.push(spot);
      return { key, spec, bone, x, z, yaw, height: spec.height * sMul };
    });

  const bodyGeo = B.body.length ? merge(B.body) : null;
  const bodyMat = bodyGeo ? propMat() : null;
  let body = null, hullMat = null, hullMesh = null;
  if (bodyGeo) {
    body = new THREE.SkinnedMesh(bodyGeo, bodyMat);
    body.castShadow = true; body.receiveShadow = false;
    body.frustumCulled = false;
    body.name = 'arena-body';
    body.userData.arenaBody = true;

    const outT = 0.030;
    hullMat = INK3D.outlineMat();
    hullMat.side = THREE.BackSide;
    hullMesh = new THREE.SkinnedMesh(hull(bodyGeo, outT), hullMat);
    hullMesh.frustumCulled = false;
    hullMesh.castShadow = false; hullMesh.receiveShadow = false;
    hullMesh.name = 'arena-ink';
  }

  const glowGeo = B.glow.length ? merge(B.glow) : null;
  let glowMesh = null;
  if (glowGeo) {
    const gm = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, fog: true, side: THREE.DoubleSide });
    gm.userData.cardProfile = 'paper';
    glowMesh = new THREE.SkinnedMesh(glowGeo, gm);
    glowMesh.frustumCulled = false;
    glowMesh.name = 'arena-glow';
  }

  const group = new THREE.Group();
  group.name = 'arena-' + stageId;
  group.add(B.root);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(B.bones);
  for (const mesh of [body,hullMesh,glowMesh]) {
    if (mesh) mesh.bind(skeleton);
  }
  if (body) group.add(body);
  if (hullMesh) group.add(hullMesh);
  if (glowMesh) group.add(glowMesh);

  const tri = bodyGeo ? bodyGeo.getAttribute('position').count / 3 : 0;

  let activeTheme = getActTheme3D(actFromStageId(stageId));
  const lanternBaseCol = new THREE.Color(activeTheme.lanternHex);
  function applyActTheme(actNo) {
    activeTheme = bodyMat ? applyThemeToInkUniforms(bodyMat.uniforms, actNo) : getActTheme3D(actNo);
    lanternBaseCol.setHex(activeTheme.lanternHex);
    if (glowMesh && glowMesh.material && glowMesh.material.color) {
      glowMesh.material.color.copy(lanternBaseCol);
    }
    return activeTheme;
  }
  function tickTheme(elapsedSec) {
    if (!glowMesh || !glowMesh.material || !glowMesh.material.color) return;
    const t = Number(elapsedSec || 0);
    const flicker = 1.0 + activeTheme.lanternPulse * (0.65 * Math.sin(t * 3.1) + 0.35 * Math.sin(t * 7.4));
    glowMesh.material.color.copy(lanternBaseCol).multiplyScalar(flicker);
  }
  applyActTheme(actFromStageId(stageId));
  const glbProps = attachSlotModels(group, slots);

  return {
    group: group, body: body, hull: hullMesh, glow: glowMesh,
    props: props, spots: spots, bounds: { x: 0, z: 0, r: ARENA.R },
    materials: [bodyMat, hullMat].filter(Boolean).concat(glowMesh ? [glowMesh.material] : []),
    stats: { props: B.body.length + B.glow.length, tri: Math.round(tri + tri), bodies: B.body.length, glow: B.glow.length },
    lightSpots: spots.filter(function (s) { return s.r > 3; }).slice(0, 8),
    applyActTheme: applyActTheme,
    tickTheme: tickTheme,
    glbProps: glbProps
  };
}

/* 아레나 경계 정보 — game.js 가 클램프에 쓴다. */
export function arenaBounds() { return { x: 0, z: 0, r: ARENA.R }; }
