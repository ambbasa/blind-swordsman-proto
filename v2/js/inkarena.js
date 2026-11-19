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
import { INK3D } from './inkhero3d.js';
import { mulberry } from './inkbake.js';

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
const VERT = /* glsl */`
attribute vec3 color;
attribute float zone;
varying vec3 vAlb;
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
varying float vH;
varying vec2 vTuv;
varying float vZone;
void main() {
  vAlb = color;
  vTuv = uv;
  vZone = zone;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  vH = clamp(wp.y / 5.5, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

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
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: INK3D.FRAG, side: opt.side || THREE.FrontSide });
  m.userData.inkUniforms = u;
  m.userData.arenaMat = true;
  return m;
}

/* ---------------------------------------------------------------- 색 팔레트
   색은 '화면에 보이는 색'이 아니라 셰이더의 albedo(선형)다. 수묵화의 먹은 화면에서 0.15~0.3,
   한지벽은 0.6~0.7 이 되도록 선형값을 낮게 잡았다(첫 시안은 hex 를 그대로 써서 돌·기와가
   회색 판때기로 떴다). */
const PAL = {
  1: { wood: 0x241d17, woodDark: 0x1c1611, plaster: 0xa89a80, tile: 0x151517, stone: 0x2a2a26, pine: 0x10160f, bamboo: 0x18210f, cloth: 0x6d6050, glow: 0xffc06a },
  2: { wood: 0x282219, woodDark: 0x191512, plaster: 0x9d9a8e, tile: 0x181a1d, stone: 0x343634, pine: 0x131d18, bamboo: 0x1c2519, cloth: 0x5e6156, glow: 0xffc778 },
  3: { wood: 0x2a241a, woodDark: 0x1a1510, plaster: 0xa49b80, tile: 0x1a1c17, stone: 0x37382f, pine: 0x142014, bamboo: 0x1f2c15, cloth: 0x6a6250, glow: 0xffc46a },
  4: { wood: 0x2e221b, woodDark: 0x1c1410, plaster: 0xa6947f, tile: 0x1c1819, stone: 0x38312d, pine: 0x161d12, bamboo: 0x1e2614, cloth: 0x6b5a4b, glow: 0xffb066 },
  5: { wood: 0x26241e, woodDark: 0x161614, plaster: 0x9aa2a4, tile: 0x171a1e, stone: 0x323736, pine: 0x141f1c, bamboo: 0x1a251d, cloth: 0x565d5c, glow: 0xffc98a },
  6: { wood: 0x282620, woodDark: 0x181816, plaster: 0xa2a8ab, tile: 0x181a1e, stone: 0x353a3d, pine: 0x15211e, bamboo: 0x1b261f, cloth: 0x585f5e, glow: 0xffcf95 },
  7: { wood: 0x25241d, woodDark: 0x161613, plaster: 0x99a192, tile: 0x171a17, stone: 0x333830, pine: 0x131f17, bamboo: 0x1a2719, cloth: 0x545d51, glow: 0xffc47e },
  8: { wood: 0x262223, woodDark: 0x171517, plaster: 0x9e989f, tile: 0x17171b, stone: 0x343235, pine: 0x141c1c, bamboo: 0x1b221e, cloth: 0x56545a, glow: 0xf6c08c },
  9: { wood: 0x2b1f19, woodDark: 0x18110e, plaster: 0xa08a74, tile: 0x1c1416, stone: 0x38302c, pine: 0x191a13, bamboo: 0x24200f, cloth: 0x674b3c, glow: 0xff9a55 },
  10: { wood: 0x2d221b, woodDark: 0x1a130f, plaster: 0xa89480, tile: 0x1c1715, stone: 0x3a302b, pine: 0x191a12, bamboo: 0x242214, cloth: 0x675245, glow: 0xffb062 },
  11: { wood: 0x2b1d19, woodDark: 0x18100e, plaster: 0x9f857a, tile: 0x1d1315, stone: 0x382a27, pine: 0x191810, bamboo: 0x241d12, cloth: 0x654a40, glow: 0xff8f52 },
  12: { wood: 0x2c1b18, woodDark: 0x180e0e, plaster: 0x9c7b76, tile: 0x1e1113, stone: 0x372725, pine: 0x1a170f, bamboo: 0x231c11, cloth: 0x63433c, glow: 0xff8a48 }
};

/* zone 번호 — inktex3d 아틀라스 칸 */
const ZONE = { WOOD: TEX.Z.SASH, DARK: TEX.Z.CLOTH, PLASTER: TEX.Z.PAPER, TILE: TEX.Z.IRON, STONE: TEX.Z.ROCK, LEAF: TEX.Z.PAPER, CLOTH: TEX.Z.CLOTH, GOLD: TEX.Z.GOLD };

/* ---------------------------------------------------------------- 합치기 도구 */
function makeBuilder() {
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
    list.push({ geo: geo, m: _m.clone(), color: color, zone: zone });
  }
  return {
    body: body, glow: glow,
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
    const uv = TEX.makeUV(g, mode);
    bufs.push({ pos: pos, nrm: nrm, uv: uv, col: new THREE.Color(list[i].color), zone: list[i].zone || 0 });
    total += pos.count;
    g.dispose();
  }
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  const U = new Float32Array(total * 2), Z = new Float32Array(total);
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
    }
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
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
    B.add(G.box, c.tile, ZONE.TILE, T(s * cx0, ridgeY + 0.02 - cy0, 0, slopeLen, 0.17, halfD * 2, 0, s * ang));
    /* 기와 골 5줄 — 처마에서 용마루까지 */
    for (let k = 0; k < 5; k++) {
      const lz = -halfD + 0.35 + k * (halfD * 2 - 0.7) / 4;
      B.add(G.box, c.tile, ZONE.TILE, T(s * cx0, ridgeY + 0.02 - cy0 + 0.10, lz, slopeLen, 0.10, 0.13, 0, s * ang));
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
  const seed = Math.floor(rnd() * 97);
  const g = rockGeo(seed, rnd() < 0.5 ? 2 : 1);
  B.add(g, c.stone, ZONE.STONE, { x: x, y: 0.22 * s, z: z, sx: 1.05 * s, sy: 0.66 * s, sz: 0.95 * s, ry: rnd() * 6.28, rz: (rnd() - 0.5) * 0.12 });
  g.dispose();
  if (rnd() < 0.55) {
    B.add(G.sphereLo, c.pine, ZONE.LEAF, { x: x + (rnd() - 0.5) * 0.5, y: 0.55 * s, z: z + (rnd() - 0.5) * 0.5, sx: 0.55 * s, sy: 0.14 * s, sz: 0.48 * s });
  }
}

/* ---------------------------------------------------------------- 기물: 석등 */
function lantern(B, x, z, ry, c) {
  const T = function (lx, ly, lz, sx, sy, sz) {
    const cos = Math.cos(ry), sin = Math.sin(ry);
    return { x: x + lx * cos + lz * sin, y: ly, z: z - lx * sin + lz * cos, ry: ry, sx: sx, sy: sy, sz: sz };
  };
  B.add(G.box, c.stone, ZONE.STONE, T(0, 0.13, 0, 0.86, 0.26, 0.86));
  B.add(G.cyl, c.stone, ZONE.STONE, T(0, 0.72, 0, 0.34, 0.95, 0.34));
  B.add(G.box, c.stone, ZONE.STONE, T(0, 1.26, 0, 0.62, 0.12, 0.62));
  B.add(G.box, c.stone, ZONE.STONE, T(0, 1.46, 0, 0.56, 0.5, 0.56));
  /* 네 면 창호 불빛 */
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    B.lit(G.plane, c.glow, { x: x + Math.cos(a + ry) * 0.285, y: 1.46, z: z - Math.sin(a + ry) * 0.285, ry: ry - a + Math.PI / 2, sx: 0.3, sy: 0.32, sz: 1 });
  }
  B.add(G.cone4, c.stone, ZONE.STONE, T(0, 1.86, 0, 0.98, 0.36, 0.98));
  B.add(G.sphereLo, c.stone, ZONE.STONE, T(0, 2.1, 0, 0.2, 0.26, 0.2));
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

function bridge(B, x, z, ry, len, c) {
  const n = Math.round(len / 0.42);
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (len * (i + 0.5)) / n;
    B.add(G.box, c.wood, ZONE.WOOD, { x: x + t * Math.cos(ry), y: 0.42, z: z - t * Math.sin(ry), sx: len / n - 0.035, sy: 0.1, sz: 1.9, ry: ry });
  }
  for (const s of [-1, 1]) {
    railing(B, x + Math.cos(ry + Math.PI / 2) * s * 0.95, z - Math.sin(ry + Math.PI / 2) * s * 0.95, ry, len, c);
  }
  /* 물 위로 놓인 다리 기둥 */
  for (const t of [-len * 0.32, len * 0.32]) {
    for (const s of [-1, 1]) {
      B.add(G.cyl, c.woodDark, ZONE.WOOD, {
        x: x + t * Math.cos(ry) + Math.cos(ry + Math.PI / 2) * s * 0.8,
        y: 0.1, z: z - t * Math.sin(ry) - Math.sin(ry + Math.PI / 2) * s * 0.8,
        sx: 0.16, sy: 0.8, sz: 0.16
      });
    }
  }
}

function stall(B, x, z, ry, c) {
  const T = function (lx, ly, lz, sx, sy, sz, rx, rz) {
    const cos = Math.cos(ry), sin = Math.sin(ry);
    return { x: x + lx * cos + lz * sin, y: ly, z: z - lx * sin + lz * cos, ry: ry, rx: rx || 0, rz: rz || 0, sx: sx, sy: sy, sz: sz };
  };
  /* 좌판 */
  B.add(G.box, c.wood, ZONE.WOOD, T(0, 0.78, 0, 1.9, 0.1, 0.95));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.add(G.box, c.woodDark, ZONE.WOOD, T(sx * 0.82, 0.39, sz * 0.4, 0.09, 0.78, 0.09));
  }
  /* 기둥 4 + 천막 */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.add(G.cyl, c.woodDark, ZONE.WOOD, T(sx * 0.95, 1.12, sz * 0.52, 0.1, 2.24, 0.1));
  }
  B.add(G.box, c.cloth, ZONE.LEAF, T(0, 2.2, 0, 2.3, 0.07, 1.4, 0, 0.09));
  /* 천막 자락 */
  B.add(G.box, c.cloth, ZONE.LEAF, T(0, 2.0, 0.68, 2.1, 0.4, 0.04));
  /* 좌판 위 물건 — 말린 약초 단·항아리 */
  B.add(G.cyl, c.woodDark, ZONE.WOOD, T(-0.45, 0.9, 0.1, 0.22, 0.2, 0.22));
  B.add(G.box, c.plaster, ZONE.PLASTER, T(0.35, 0.9, -0.05, 0.4, 0.18, 0.32));
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
  B.add(G.box, c.woodDark, ZONE.WOOD, T(0, 1.55, 0, 3.4, 3.0, 0.12));
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
function farTrees(B, rnd, c) {
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (rnd() - 0.5) * 0.14;
    const r = 33 + rnd() * 7;
    const h = 5.5 + rnd() * 3.0;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    B.add(G.cyl6, c.woodDark, ZONE.WOOD, { x: x, y: h * 0.28, z: z, sx: 0.26, sy: h * 0.6, sz: 0.26, rz: (rnd() - 0.5) * 0.16 });
    for (let k = 0; k < 3; k++) {
      const w = (2.0 - k * 0.5) * (0.8 + rnd() * 0.4);
      B.add(G.sphereLo, c.pine, ZONE.LEAF, {
        x: x + (rnd() - 0.5) * 0.8, y: h * (0.5 + k * 0.18), z: z + (rnd() - 0.5) * 0.8,
        sx: w, sy: 0.42, sz: w * 0.9, ry: rnd() * 6.28
      });
    }
  }
}

/* ---------------------------------------------------------------- 아레나 조립 */
export function buildArena(opts) {
  opts = opts || {};
  const stageId = opts.stageId || 1;
  const act = stageId <= 4 ? 1 : (stageId <= 8 ? 2 : 3);
  const c = PAL[stageId] || PAL[1];
  const rnd = mulberry((opts.seed || ARENA.SEED) ^ (stageId * 7919));
  const B = makeBuilder();
  const props = [];   /* {x,z,r} — 절차 배치가 겹치지 않게 */
  const spots = [];   /* QA·조명용: 큰 기물 위치 */

  const occupied = function (x, z, r) {
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (Math.hypot(x - p.x, z - p.z) < r + p.r) return true;
    }
    return false;
  };
  const place = function (x, z, r) { props.push({ x: x, z: z, r: r }); spots.push({ x: x, z: z, r: r }); };

  const ring = function (a0, a1, r0, r1) {
    for (let k = 0; k < 40; k++) {
      const a = a0 + rnd() * (a1 - a0);
      const r = r0 + rnd() * (r1 - r0);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      return { x: x, z: z, a: a, r: r };
    }
    return { x: Math.cos(a0) * r0, z: Math.sin(a0) * r0, a: a0, r: r0 };
  };

  /* --- 1) 바깥 건축 띠: 카메라 반대쪽(-x,-z)에 누각·정자, 양옆에 성벽/숲 --- */
  const backA = Math.PI * 1.25;   /* 화면 위쪽 */
  const houses = stageId % 3 === 2 ? 1 : 2;
  for (let i = 0; i < houses; i++) {
    const a = backA + (i - (houses - 1) / 2) * 0.78 + (rnd() - 0.5) * 0.16;
    const r = ARENA.RIM + 3.4 + rnd() * 1.8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (occupied(x, z, 4.6)) continue;
    house(B, x, z, -a + Math.PI / 2, { c: c, w: 5.0 + rnd() * 1.4, d: 3.9 + rnd() * 0.8 });
    place(x, z, 4.2);
  }
  /* 정자 하나 — 화면 왼쪽 언덕 */
  {
    const a = backA - 1.25 + rnd() * 0.3, r = ARENA.RIM + 2.8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!occupied(x, z, 3.2)) { pavilion(B, x, z, -a + Math.PI / 2, c); place(x, z, 3.0); }
  }
  /* 장터 좌판 (1·4막) — 바깥 띠에 두 채 */
  if (act === 1) {
    for (let i = 0; i < 2; i++) {
      const a = backA + (i ? 1 : -1) * (0.95 + rnd() * 0.4), r = ARENA.RIM + 2.0;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (occupied(x, z, 2.6)) continue;
      stall(B, x, z, -a + Math.PI / 2 + (rnd() - 0.5) * 0.4, c); place(x, z, 2.4);
    }
  }
  /* 성벽 (2·5·6·8막) */
  if (stageId === 2 || stageId === 5 || stageId === 6 || stageId === 8) {
    for (let i = 0; i < 3; i++) {
      const a = backA + (i - 1) * 0.85, r = ARENA.RIM + 3.0;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (occupied(x, z, 3.4)) continue;
      wallRun(B, x, z, -a + Math.PI / 2, 5.4 + rnd() * 2.2, c); place(x, z, 3.2);
    }
    const a = backA - 0.05, r = ARENA.RIM + 2.4;
    gate(B, Math.cos(a) * r, Math.sin(a) * r, -a + Math.PI / 2, c);
    place(Math.cos(a) * r, Math.sin(a) * r, 4.0);
  }

  /* --- 2) 소나무·대나무: 바깥 띠를 따라 --- */
  const nPine = 6 + (stageId <= 4 ? 1 : 2);
  for (let i = 0; i < nPine; i++) {
    const a = backA + Math.PI * 0.62 * ((i / (nPine - 1)) * 2 - 1) + (rnd() - 0.5) * 0.2;
    const r = ARENA.RIM + 0.4 - rnd() * 3.4;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (occupied(x, z, 2.4)) continue;
    pine(B, x, z, rnd, c, 0.9 + rnd() * 0.45);
    place(x, z, 2.0);
  }
  const nBam = stageId === 3 || stageId === 7 ? 4 : 2;
  for (let i = 0; i < nBam; i++) {
    const side = i % 2 ? 1 : -1;
    const a = backA + side * (1.35 + rnd() * 0.5);
    const r = ARENA.RIM - 2.4 - rnd() * 1.6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (occupied(x, z, 2.6)) continue;
    bambooGrove(B, x, z, rnd, c, 6 + Math.round(rnd() * 3));
    place(x, z, 2.2);
  }

  /* --- 3) 플레이 공간 안쪽: 작은 바위·석등·난간 (시야를 막지 않는 것만) --- */
  for (let i = 0; i < 11; i++) {
    const a = rnd() * Math.PI * 2, r = 5.0 + Math.pow(rnd(), 0.7) * (ARENA.R - 2.0);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (occupied(x, z, 1.4)) continue;
    rock(B, x, z, rnd, c, 0.6 + rnd() * 0.7);
    place(x, z, 1.1);
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * 2 * (i / 4) + 0.5 + rnd() * 0.2, r = 8.5 + rnd() * 6.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (occupied(x, z, 1.6)) continue;
    lantern(B, x, z, rnd() * 6.28, c); place(x, z, 1.2);
  }
  /* 안쪽 큰 바위 3 — 실루엣 기준점 */
  for (let i = 0; i < 3; i++) {
    const a = backA + (i - 1) * 0.75 + rnd() * 0.2, r = 15.0 + rnd() * 2.4;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (occupied(x, z, 2.0)) continue;
    rock(B, x, z, rnd, c, 1.5 + rnd() * 0.8); place(x, z, 1.8);
  }

  /* --- 4) 경계 띠: 난간 + 다리 — 플레이 반경 바로 밖 --- */
  {
    const a0 = backA + 1.05;
    railing(B, Math.cos(a0) * (ARENA.R + 1.2), Math.sin(a0) * (ARENA.R + 1.2), -a0 + Math.PI / 2, 9.0, c);
    const a1 = backA - 1.05;
    railing(B, Math.cos(a1) * (ARENA.R + 1.2), Math.sin(a1) * (ARENA.R + 1.2), -a1 + Math.PI / 2, 8.0, c);
    const a2 = backA + Math.PI * 0.42;
    bridge(B, Math.cos(a2) * (ARENA.R + 1.6), Math.sin(a2) * (ARENA.R + 1.6), -a2 + Math.PI / 2, 6.0, c);
  }

  /* --- 5) 절벽 띠 + 원경 나무 띠: 무대 밖을 그림으로 닫는다 --- */
  cliffRing(B, rnd, c);

  /* --- 6) 합치기 --- */
  const bodyGeo = merge(B.body);
  const bodyMat = propMat();
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true; body.receiveShadow = false;
  body.frustumCulled = false;
  body.name = 'arena-body';
  body.userData.arenaBody = true;

  const outT = 0.030;
  const hullMat = INK3D.outlineMat();
  hullMat.side = THREE.BackSide;
  const hullMesh = new THREE.Mesh(hull(bodyGeo, outT), hullMat);
  hullMesh.frustumCulled = false;
  hullMesh.castShadow = false; hullMesh.receiveShadow = false;
  hullMesh.name = 'arena-ink';

  const glowGeo = B.glow.length ? merge(B.glow) : null;
  let glowMesh = null;
  if (glowGeo) {
    const gm = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, fog: true, side: THREE.DoubleSide });
    gm.userData.cardProfile = 'paper';
    glowMesh = new THREE.Mesh(glowGeo, gm);
    glowMesh.frustumCulled = false;
    glowMesh.name = 'arena-glow';
  }

  const group = new THREE.Group();
  group.name = 'arena-' + stageId;
  group.add(body); group.add(hullMesh);
  if (glowMesh) group.add(glowMesh);

  const tri = bodyGeo.getAttribute('position').count / 3;

  return {
    group: group, body: body, hull: hullMesh, glow: glowMesh,
    props: props, spots: spots, bounds: { x: 0, z: 0, r: ARENA.R },
    materials: [bodyMat, hullMat].concat(glowMesh ? [glowMesh.material] : []),
    stats: { props: B.body.length + B.glow.length, tri: Math.round(tri + tri), bodies: B.body.length, glow: B.glow.length },
    lightSpots: spots.filter(function (s) { return s.r > 3; }).slice(0, 8)
  };
}

/* 아레나 경계 정보 — game.js 가 클램프에 쓴다. */
export function arenaBounds() { return { x: 0, z: 0, r: ARENA.R }; }
