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
import * as TEX from './inktex3d.js';

export const HERO_H = 2.45;          /* 기존 주인공(파츠 리그 m=2.45)과 같은 키 — 그림자·HUD 기준이 맞는다 */
const WALK_SPEED = 1.7;              /* 걷기 위상의 기준 속도(m/s) */
const WALK_DUR = 0.72;               /* 12키 한 주기(초) */
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
  const L = { amb: 0.20, key: 1.05, fill: 0.30, rim: 0.18, wash: 0.16 };
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
const COL = {
  coat: 0x4a4a4c,        /* 검은 무사복 상의 */
  coatLo: 0x3e3e41,      /* 자락 아래 — 먹이 고인 쪽 */
  pants: 0x434346,
  hood: 0x36363a,        /* 두건 */
  belt: 0x4a4238,        /* 허리띠 */
  band: 0x9c968a,        /* 눈 안대 — 한지 회색 띠 */
  skin: 0x7a6a5c,        /* 손·아래얼굴 */
  blade: 0x8f9598,       /* 은빛/강철빛 (녹색 금지) */
  bladeEdge: 0xb0b6b8,
  guard: 0x574c3e,
  grip: 0x3d3830,
  ink: 0x28282a
};

/* ---------------------------------------------------------------- 3단 붓 계조 */
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
  vH = clamp(wp.y / 2.45, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
uniform sampler2D uRamp;
uniform vec3 uKeyDir, uKeyCol, uFillDir, uFillCol, uAmbCol, uRimCol;
uniform float uRim, uWash, uGrain;
uniform sampler2D uTex;
uniform float uTexAmt;
varying vec2 vTuv;
varying float vZone;
vec3 inkTexAtlas() {
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
  vec3 col = vAlb * light * wash * grain;
  /* v0.47 동양 수묵 텍스처 — 한지 섬유·먹 붓질·비늘·부적 같은 '결'만 1.0 근처로 곱한다.
     색은 버텍스가 내고(uColor), 텍스처는 종이와 붓의 질감만 얹는다(?notex=1 이면 uTexAmt 0). */
  col *= mix(vec3(1.0), inkTexAtlas(), uTexAmt);
  /* 붓끝 먹 고임: 실루엣 가장자리로 갈수록 먹이 진해진다(먹그림의 가장자리 농도). */
  float edge = pow(1.0 - clamp(dot(N, normalize(vV)), 0.0, 1.0), 2.0);
  col *= mix(1.0, 0.80, edge);
  /* 한지 역광 가장자리 — 검은 옷이 배경에서 떨어져 보이게 아주 얇게. */
  float fres = pow(1.0 - clamp(dot(N, normalize(vV)), 0.0, 1.0), 4.0);
  col += uRimCol * fres * uRim;
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
    uRimCol: { value: new THREE.Color(1.0, 0.93, 0.80) },
    uRim: { value: LIGHT.rim },
    uWash: { value: LIGHT.wash },
    uGrain: { value: 0.16 },
    /* v0.47 텍스처 아틀라스 — 전 재질이 한 장을 공유한다(샘플러 1개, 드로우콜 그대로). */
    uTex: { value: TEX.atlas() },
    uTexAmt: { value: TEX.amount() }
  };
}
function inkMat(opt) {
  opt = opt || {};
  const u = inkUniforms();
  const m = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: VERT, fragmentShader: FRAG,
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
const V2 = THREE.Vector2;
/** 프로필 [[r,y],...] 을 돌려 곡면을 만든다(아래 → 위). scale/pos 로 타원 단면·배치. */
function lathe(profile, seg, sx, sz, py) {
  const pts = profile.map(function (p) { return new V2(Math.max(0.0008, p[0]), p[1]); });
  const geo = new THREE.LatheGeometry(pts, seg || 16);
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(0, py || 0, 0), new THREE.Quaternion(), new THREE.Vector3(sx || 1, 1, sz || sx || 1));
  geo.applyMatrix4(m);
  return geo;
}
/** 마디: 위(y=0)에서 아래(y=-len)로 가늘어지는 곡면. 양 끝은 살짝 둥글게 닫는다. */
function limbGeo(rTop, rBot, len, seg) {
  const prof = [
    [0, -len - 0.012], [rBot * 0.5, -len - 0.007], [rBot, -len + 0.004],
    [rBot + (rTop - rBot) * 0.34, -len * 0.66],
    [rBot + (rTop - rBot) * 0.70, -len * 0.33],
    [rTop, -0.006], [rTop * 0.80, 0.004], [0, 0.009]
  ];
  return lathe(prof, seg || 14);
}
function ballGeo(r, sx, sy, sz) {
  const g = new THREE.SphereGeometry(r, 14, 9);
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(sx || 1, sy || 1, sz || 1));
  g.applyMatrix4(m);
  g.computeVertexNormals();
  return g;
}
function ringGeo(r, tube, seg) {
  return new THREE.TorusGeometry(r, tube, 5, seg || 18);
}
/** 도포 자락: 위(0)에서 아래(-h)로 내려오는 천 조각. */
function ribbonGeo(wTop, wBot, h, rows, bulge, wave) {
  const g = new THREE.PlaneGeometry(1, 1, 3, rows || 4);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5;
    const v = pos.getY(i) + 0.5;
    const w = wTop + (wBot - wTop) * (1 - v);
    const x = (u - 0.5) * w;
    const y = -h * (1 - v);
    const z = (bulge || 0) * (1 - v) * (1 - v) + Math.sin(u * Math.PI) * (wave || 0.012) * (1 - v) * (1 - v);
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
/** 환도(조선 장검) — 살짝 휜 날. x=폭, y=길이, z=두께. */
function bladeGeo() {
  const s = new THREE.Shape();
  const L = 0.90;
  s.moveTo(-0.004, 0);
  s.lineTo(0.032, 0.018);
  s.quadraticCurveTo(0.036, 0.30, 0.028, 0.62);
  s.quadraticCurveTo(0.021, 0.81, 0.0, L);
  s.quadraticCurveTo(-0.011, 0.79, -0.013, 0.57);
  s.quadraticCurveTo(-0.014, 0.30, -0.006, 0.02);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -0.007);
  return g;
}

function mat4(pos, rot, scale) {
  const q = new THREE.Quaternion();
  if (rot) q.setFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'XYZ'));
  const s = scale || [1, 1, 1];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0), q,
    new THREE.Vector3(s[0], s[1], s[2])
  );
}
function P(geo, color, opt) {
  opt = opt || {};
  return { geo: geo, color: color, m: mat4(opt.pos, opt.rot, opt.scale), zone: opt.zone };
}

/* v0.47 — 부위 색으로 아틀라스 칸을 고른다: 칼날은 하몬, 안대·살갗은 한지, 나머지는 옷감. */
const HERO_ZONE = (function () {
  return function (c) {
    if (c === 0x8f9598 || c === 0xb0b6b8) return TEX.Z.BLADE;
    if (c === 0x9c968a || c === 0x7a6a5c) return TEX.Z.PAPER;
    if (c === 0x574c3e) return TEX.Z.GOLD;
    return TEX.Z.CLOTH;
  };
})();

/* ---------------------------------------------------------------- 병합·외곽선 */
function mergeParts(list) {
  let total = 0;
  const bufs = [];
  for (let i = 0; i < list.length; i++) {
    let g = list[i].geo;
    if (g.index) g = g.toNonIndexed();
    else g = g.clone();
    const mode = TEX.uvModeFor(g);
    if (list[i].m) g.applyMatrix4(list[i].m);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
    if (!pos || !nrm) continue;
    /* v0.47 — 부위마다 결의 방향(plate/cyl)과 밀도를 정한 UV 를 굽는다. */
    bufs.push({ pos: pos, nrm: nrm, col: new THREE.Color(list[i].color), uv: TEX.makeUV(g, mode),
      zone: list[i].zone != null ? list[i].zone : HERO_ZONE(list[i].color) });
    total += pos.count;
  }
  const P3 = new Float32Array(total * 3), N3 = new Float32Array(total * 3), C3 = new Float32Array(total * 3);
  const U2 = new Float32Array(total * 2), Z1 = new Float32Array(total);
  let o = 0;
  for (let i = 0; i < bufs.length; i++) {
    const b = bufs[i], n = b.pos.count;
    const pa = b.pos.array, na = b.nrm.array, c = b.col, ua = b.uv;
    for (let k = 0; k < n; k++) {
      const p3 = (o + k) * 3;
      P3[p3] = pa[k * 3]; P3[p3 + 1] = pa[k * 3 + 1]; P3[p3 + 2] = pa[k * 3 + 2];
      N3[p3] = na[k * 3]; N3[p3 + 1] = na[k * 3 + 1]; N3[p3 + 2] = na[k * 3 + 2];
      C3[p3] = c.r; C3[p3 + 1] = c.g; C3[p3 + 2] = c.b;
      U2[(o + k) * 2] = ua[k * 2]; U2[(o + k) * 2 + 1] = ua[k * 2 + 1];
      Z1[o + k] = b.zone;
    }
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P3, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N3, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C3, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
  geo.setAttribute('zone', new THREE.BufferAttribute(Z1, 1));
  geo.computeBoundingSphere();
  return geo;
}
/** 노멀을 t만큼 밀어 만든 인버티드 헐 — 얇은 먹선. */
function hullGeo(src, t) {
  const g = src.clone();
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
/* 부위별 먹선 두께 — 칼날처럼 얇은 메시는 두꺼운 헐이 앞뒤로 뚫고 나와 점선처럼 보인다. */
const HULL_T = { weapon: 0.005, handL: 0.012, handR: 0.012, forearmL: 0.018, forearmR: 0.018, head: 0.022 };
function hullThick(bone) { return HULL_T[bone] != null ? HULL_T[bone] * (OUTLINE_T / 0.026) : OUTLINE_T; }

/* 먹선(헐)을 두는 뼈 — 실루엣이 배경에 닿는 큰 부위만. 작은 부위는 몸 자체가 어두워 선이 보이지 않는다. */
const HULL_BONES = {
  pelvis: 1, spine: 1, chest: 1, head: 1, weapon: 1,
  upperarmL: 1, upperarmR: 1, forearmL: 1, forearmR: 1,
  thighL: 1, thighR: 1, shinL: 1, shinR: 1
};
/* 달빛 그림자를 드리울 뼈 — 몸통·머리·다리만으로 실루엣이 충분하다(드로우콜 절약). */
const SHADOW_BONES = { chest: 1, head: 1, pelvis: 1, thighL: 1, thighR: 1, shinL: 1, shinR: 1 };

/* ---------------------------------------------------------------- 뼈대 정의 */
/* [이름, 부모, 로컬 위치] — 모델은 +Z 를 바라본다. 오른팔은 -X 쪽(칼을 든 손). */
const BONES = [
  ['pelvis', null, [0, 1.30, 0]],
  ['spine', 'pelvis', [0, 0.18, 0]],
  ['chest', 'spine', [0, 0.34, 0]],
  ['neck', 'chest', [0, 0.22, 0]],
  ['head', 'neck', [0, 0.09, 0]],
  ['shoulderL', 'chest', [0.135, 0.155, 0]],
  ['upperarmL', 'shoulderL', [0.06, -0.005, 0]],
  ['forearmL', 'upperarmL', [0, -0.335, 0]],
  ['handL', 'forearmL', [0, -0.305, 0]],
  ['shoulderR', 'chest', [-0.135, 0.155, 0]],
  ['upperarmR', 'shoulderR', [-0.06, -0.005, 0]],
  ['forearmR', 'upperarmR', [0, -0.335, 0]],
  ['handR', 'forearmR', [0, -0.305, 0]],
  ['weapon', 'handR', [0, -0.055, 0]],
  ['thighL', 'pelvis', [0.105, -0.045, 0]],
  ['shinL', 'thighL', [0, -0.60, 0]],
  ['footL', 'shinL', [0, -0.57, 0]],
  ['thighR', 'pelvis', [-0.105, -0.045, 0]],
  ['shinR', 'thighR', [0, -0.60, 0]],
  ['footR', 'shinR', [0, -0.57, 0]],
  ['sashF', 'pelvis', [0, -0.02, 0.095]],
  ['sashF2', 'sashF', [0, -0.30, 0.010]],
  ['sashB', 'pelvis', [0, -0.02, -0.105]],
  ['sashB2', 'sashB', [0, -0.32, -0.012]],
  ['sashL', 'pelvis', [0.128, -0.01, 0.005]],
  ['sashR', 'pelvis', [-0.128, -0.01, 0.005]],
  ['tailL', 'head', [0.05, 0.185, -0.105]],
  ['tailR', 'head', [-0.05, 0.185, -0.105]]
];
const BONE_NAMES = BONES.map(function (b) { return b[0]; });
const CLOTH_BONES = { sashF: 1, sashF2: 1, sashB: 1, sashB2: 1, sashL: 1, sashR: 1, tailL: 1, tailR: 1 };

/* ---------------------------------------------------------------- 부위 형상 */
function buildParts() {
  const out = {};
  const add = function (bone, p) { (out[bone] || (out[bone] = [])).push(p); };

  /* 골반·허리·가슴 — 매끄러운 곡면(라세) 세 마디로 이어 붙인 상체 */
  add('pelvis', P(lathe([[0, -0.155], [0.088, -0.142], [0.124, -0.088], [0.138, -0.018], [0.134, 0.058], [0.114, 0.108], [0, 0.128]], 16, 1.0, 0.82), COL.coat));
  add('pelvis', P(ringGeo(0.146, 0.019, 18), COL.belt, { pos: [0, 0.042, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.84] }));
  add('pelvis', P(new THREE.SphereGeometry(0.030, 10, 7), COL.belt, { pos: [0.032, 0.028, 0.122], scale: [1, 0.9, 0.7] }));
  add('spine', P(lathe([[0, -0.215], [0.098, -0.198], [0.124, -0.12], [0.132, -0.005], [0.141, 0.098], [0.15, 0.176], [0, 0.198]], 16, 1.0, 0.80), COL.coat));
  add('chest', P(lathe([[0, -0.235], [0.110, -0.216], [0.146, -0.14], [0.166, -0.028], [0.178, 0.072], [0.156, 0.14], [0.110, 0.192], [0.066, 0.226], [0, 0.24]], 18, 1.06, 0.80), COL.coat));
  add('chest', P(ringGeo(0.060, 0.018, 14), COL.hood, { pos: [0, 0.210, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.86] }));
  /* 한지빛 목안감 — 검은 옷더미 속에 밝은 선이 하나 있어야 사람으로 읽힌다(참고 그림의 안깗과 같은 역할). */
  add('chest', P(ringGeo(0.050, 0.012, 14), COL.band, { pos: [0, 0.212, 0.006], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.84] }));
  /* 깃(옷깃) — 가슴을 가로지르는 한 줄. 검은 옷에 결을 준다. */
  add('chest', P(new THREE.BoxGeometry(0.016, 0.28, 0.012), COL.band, { pos: [0.040, 0.050, 0.128], rot: [0.06, 0, 0.22] }));

  /* 머리 — 두건·눈 안대·아래얼굴 (몸에 비해 조금 크게: 작은 화면에서 표정 대신 실루엣이 먼저 읽힌다) */
  const HS = [1.07, 1.07, 1.07];
  add('head', P(lathe([[0, -0.048], [0.032, -0.030], [0.058, 0.0], [0.080, 0.048], [0.096, 0.100], [0.105, 0.148], [0.103, 0.200], [0.086, 0.250], [0.052, 0.286], [0, 0.302]], 16, 1.0, 0.94), COL.skin, { scale: HS }));
  add('head', P(lathe([[0.108, 0.190], [0.107, 0.230], [0.095, 0.266], [0.070, 0.294], [0.038, 0.312], [0, 0.318]], 16, 1.0, 0.96), COL.hood, { scale: HS }));
  add('head', P(new THREE.CylinderGeometry(0.109, 0.111, 0.044, 16, 1, true), COL.band, { pos: [0, 0.145, 0], scale: [HS[0], HS[1], HS[2] * 0.95] }));
  add('head', P(new THREE.SphereGeometry(0.022, 8, 6), COL.band, { pos: [0, 0.145, -0.102], scale: [1.07, 1.07, 0.86] }));
  add('head', P(new THREE.SphereGeometry(0.021, 8, 6), COL.hood, { pos: [0, 0.222, -0.098], scale: [1.07, 1.07, 0.86] }));
  add('head', P(new THREE.ConeGeometry(0.015, 0.045, 8), COL.skin, { pos: [0, 0.080, 0.108], rot: [Math.PI / 2, 0, 0], scale: HS }));
  add('head', P(new THREE.BoxGeometry(0.038, 0.007, 0.009), COL.hood, { pos: [0, 0.026, 0.100], scale: [1.07, 1, 1] }));

  /* 팔 — 어깨·팔꿈치 구, 소매 단면이 손목으로 좁아진다 */
  ['L', 'R'].forEach(function (s) {
    add('upperarm' + s, P(ballGeo(0.062, 1, 0.94, 0.94), COL.coat, { pos: [0, -0.010, 0] }));
    add('upperarm' + s, P(limbGeo(0.072, 0.058, 0.325), COL.coat));
    add('upperarm' + s, P(ringGeo(0.059, 0.009, 12), COL.coatLo, { pos: [0, -0.316, 0], rot: [Math.PI / 2, 0, 0] }));
    add('forearm' + s, P(ballGeo(0.050, 1, 0.96, 0.96), COL.coat, { pos: [0, -0.004, 0] }));
    add('forearm' + s, P(limbGeo(0.058, 0.042, 0.29), COL.coat));
    /* 주먹과 소매 끝 — 손목 뼈는 남기되(장검 부모) 형상은 아래팔에 합쳤다(작은 화면에선 손목 회전이 보이지 않는다). */
    add('forearm' + s, P(new THREE.CylinderGeometry(0.038, 0.038, 0.028, 10, 1, true), COL.coatLo, { pos: [0, -0.298, 0] }));
    add('forearm' + s, P(ballGeo(0.044, 1.0, 1.16, 0.92), COL.skin, { pos: [0, -0.344, 0.004] }));
    /* 다리 */
    add('thigh' + s, P(ballGeo(0.092, 1, 0.96, 1), COL.pants, { pos: [0, -0.005, 0] }));
    add('thigh' + s, P(limbGeo(0.100, 0.075, 0.585), COL.pants));
    add('shin' + s, P(ballGeo(0.068, 1, 0.98, 1), COL.pants, { pos: [0, -0.004, 0] }));
    add('shin' + s, P(limbGeo(0.076, 0.054, 0.50), COL.pants));
    add('shin' + s, P(new THREE.CylinderGeometry(0.060, 0.056, 0.115, 12, 1, true), COL.hood, { pos: [0, -0.505, 0] }));
    /* 장화 */
    add('foot' + s, P(ballGeo(0.060, 1.02, 0.66, 1.9), COL.hood, { pos: [0, -0.050, 0.045] }));
    add('foot' + s, P(ballGeo(0.053, 1.0, 0.22, 2.0), COL.ink, { pos: [0, -0.074, 0.05] }));
  });

  /* 장검 — 은빛 환도. 손(handR) 축에서 뽑힌다. 날의 결은 외곽선(헐)과 툰 계조가 맡는다. */
  add('weapon', P(bladeGeo(), COL.blade, { pos: [0, 0.012, 0] }));
  add('weapon', P(ringGeo(0.040, 0.008, 14), COL.guard, { pos: [0, 0.0, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.5] }));
  add('weapon', P(new THREE.CylinderGeometry(0.016, 0.018, 0.19, 10), COL.grip, { pos: [0, -0.104, 0] }));
  add('weapon', P(new THREE.SphereGeometry(0.021, 8, 6), COL.guard, { pos: [0, -0.20, 0], scale: [1, 0.7, 1] }));

  /* 도포 자락 — 앞·뒤는 두 마디, 옆은 한 마디 */
  add('sashF', P(ribbonGeo(0.27, 0.29, 0.31, 4, 0.016, 0.014), COL.coat, { pos: [0, 0, 0.088] }));
  add('sashF2', P(ribbonGeo(0.29, 0.30, 0.27, 4, 0.016, 0.016), COL.coatLo, { pos: [0, 0, 0.010] }));
  add('sashB', P(ribbonGeo(0.29, 0.31, 0.32, 4, -0.018, 0.012), COL.coat, { pos: [0, 0, -0.090] }));
  add('sashB2', P(ribbonGeo(0.31, 0.32, 0.28, 4, -0.018, 0.014), COL.coatLo, { pos: [0, 0, -0.012] }));
  add('sashL', P(ribbonGeo(0.13, 0.17, 0.44, 4, 0.008, 0.010), COL.coat, { pos: [0, 0, 0], rot: [0, Math.PI / 2, 0.05] }));
  add('sashR', P(ribbonGeo(0.13, 0.17, 0.44, 4, -0.008, 0.010), COL.coat, { pos: [0, 0, 0], rot: [0, Math.PI / 2, -0.05] }));
  add('tailL', P(ribbonGeo(0.034, 0.044, 0.11, 3, 0.006, 0.006), COL.band, { pos: [0, 0, 0] }));
  add('tailR', P(ribbonGeo(0.034, 0.044, 0.11, 3, -0.006, 0.006), COL.band, { pos: [0, 0, 0] }));
  return out;
}

/* ---------------------------------------------------------------- 접지 그림자 */
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
const DEFAULT = {
  pelvis: [0, 0, 0], spine: [0.03, 0, 0], chest: [0.03, 0, 0], neck: [0.03, 0, 0], head: [-0.05, 0, 0],
  shoulderL: [0, 0, 0.05], shoulderR: [0, 0, -0.05],
  upperarmL: [0.04, 0, 0.12], upperarmR: [0.02, 0, -0.14],
  forearmL: [-0.18, 0, 0.03], forearmR: [-0.22, 0, -0.03],
  handL: [0, 0, 0], handR: [0.10, 0, 0], weapon: [2.62, 0, 0.16],
  thighL: [-0.02, 0, 0.02], thighR: [-0.02, 0, -0.02],
  shinL: [0.05, 0, 0], shinR: [0.05, 0, 0],
  footL: [-0.02, 0, 0], footR: [-0.02, 0, 0]
};
const REST_PELVIS = [0, 1.30, 0];
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
function poseOf(over) {
  const p = {};
  for (let i = 0; i < BONE_NAMES.length; i++) {
    const n = BONE_NAMES[i];
    if (CLOTH_BONES[n]) continue;
    p[n] = (over && over[n]) || DEFAULT[n] || [0, 0, 0];
  }
  return p;
}
function makeClip(name, dur, keys) {
  const names = Object.keys(DEFAULT);
  const tracks = [];
  const times = keys.map(function (k) { return k.t; });
  names.forEach(function (bn) {
    const vals = [];
    keys.forEach(function (k) {
      const e = (k.pose && k.pose[bn]) || DEFAULT[bn];
      _q.setFromEuler(_e.set(e[0], e[1], e[2], 'XYZ'));
      vals.push(_q.x, _q.y, _q.z, _q.w);
    });
    tracks.push(new THREE.QuaternionKeyframeTrack('h3d_' + bn + '.quaternion', times, vals));
  });
  const pos = [];
  keys.forEach(function (k) {
    const p = (k.pelvis) || REST_PELVIS;
    pos.push(p[0], p[1], p[2]);
  });
  tracks.push(new THREE.VectorKeyframeTrack('h3d_pelvis.position', times, pos));
  return new THREE.AnimationClip(name, dur, tracks);
}

/** idle — 무사의 호흡, 검을 비스듬히 내린 자세, 미세한 중심 이동. 4초 주기. */
function idleClip() {
  const K = [];
  const mk = function (t, o, py) {
    K.push({ t: t, pose: poseOf(o), pelvis: [0, 1.30 + (py || 0), 0] });
  };
  mk(0.00, { chest: [0.030, 0.010, 0], head: [-0.050, -0.05, 0], upperarmR: [0.02, 0, -0.140], forearmR: [-0.22, 0, -0.03] }, 0);
  mk(1.10, { chest: [0.055, -0.006, 0.006], spine: [0.038, 0, 0.004], head: [-0.020, 0.01, 0.004], upperarmR: [0.01, 0, -0.155], forearmR: [-0.26, 0, -0.04], upperarmL: [0.03, 0, 0.135], weapon: [2.60, 0.02, 0.17] }, 0.006);
  mk(2.20, { chest: [0.026, 0.012, -0.004], head: [-0.060, 0.05, -0.004], upperarmR: [0.03, 0, -0.130], forearmR: [-0.20, 0, -0.02], weapon: [2.64, -0.01, 0.15] }, -0.002);
  mk(3.20, { chest: [0.050, -0.008, 0.004], head: [-0.030, -0.02, 0], upperarmR: [0.01, 0, -0.148], forearmR: [-0.25, 0, -0.04] }, 0.005);
  mk(4.00, { chest: [0.030, 0.010, 0], head: [-0.050, -0.05, 0], upperarmR: [0.02, 0, -0.140], forearmR: [-0.22, 0, -0.03] }, 0);
  return makeClip('idle', 4.0, K);
}

/** walk — 12키 한 주기. 상체 전경·팔다리 교차·골반 바운스·발 디딤. */
function walkClip() {
  const N = 12, K = [];
  for (let i = 0; i <= N; i++) {
    const p = (i / N) * Math.PI * 2;
    const c = Math.cos(p), s = Math.sin(p);
    const kneeL = 0.10 + 0.62 * Math.max(0, Math.sin(p - 0.15));
    const kneeR = 0.10 + 0.62 * Math.max(0, Math.sin(p + Math.PI - 0.15));
    K.push({
      t: (i / N) * WALK_DUR,
      pelvis: [0.012 * s, 1.30 + 0.026 * Math.abs(s) - 0.014, 0],
      pose: {
        pelvis: [0.02, 0.10 * s, 0.03 * s],
        spine: [0.06, -0.05 * s, 0],
        chest: [0.10, -0.10 * s, -0.02 * s],
        neck: [0.02, 0.03 * s, 0], head: [-0.08, 0.05 * s, 0],
        shoulderL: [0, 0, 0.05], shoulderR: [0, 0, -0.05],
        upperarmL: [0.40 * c, 0, 0.12 + 0.03 * s], upperarmR: [-0.20 * c, 0, -0.14],
        forearmL: [-0.22 - 0.20 * Math.max(0, c), 0, 0.03],
        forearmR: [-0.24 - 0.10 * Math.max(0, -c), 0, -0.03],
        handL: [0, 0, 0], handR: [0.10, 0, 0], weapon: [2.58 + 0.06 * s, 0, 0.16],
        thighL: [-0.44 * c, 0, 0.02], thighR: [0.44 * c, 0, -0.02],
        shinL: [kneeL, 0, 0], shinR: [kneeR, 0, 0],
        footL: [-0.02 - 0.16 * Math.max(0, s), 0, 0], footR: [-0.02 - 0.16 * Math.max(0, -s), 0, 0]
      }
    });
  }
  return makeClip('walk', WALK_DUR, K);
}

/** slash — 일섬. 허리 비틀기 → 어깨·팔꿈치·손목 스냅 → 잔심. 0.30초. */
function slashClip() {
  const K = [];
  const mk = function (t, o, pz) { K.push({ t: t, pose: poseOf(o), pelvis: [0, 1.30, pz || 0] }); };
  mk(0.000, {
    pelvis: [0.02, -0.26, 0], spine: [-0.02, -0.20, 0], chest: [-0.04, -0.34, 0.03], neck: [0, 0.10, 0], head: [-0.02, -0.20, 0],
    upperarmR: [-0.70, 0.10, -0.62], forearmR: [-1.35, 0, -0.05], handR: [0.10, 0, -0.20], weapon: [2.95, 0.30, 0.25],
    upperarmL: [-0.25, 0, 0.26], forearmL: [-0.55, 0, 0.05],
    thighL: [-0.10, 0, 0.05], thighR: [0.06, 0, -0.06], shinL: [0.30, 0, 0], shinR: [0.22, 0, 0]
  }, -0.04);
  mk(0.060, {
    pelvis: [0.03, -0.40, 0], spine: [-0.03, -0.31, 0], chest: [-0.05, -0.52, 0.05], neck: [0, 0.16, 0], head: [-0.03, -0.30, 0],
    upperarmR: [-0.86, 0.12, -0.72], forearmR: [-1.50, 0, -0.05], handR: [0.10, 0, -0.24], weapon: [3.05, 0.34, 0.28],
    upperarmL: [-0.30, 0, 0.30], forearmL: [-0.62, 0, 0.05],
    thighL: [-0.12, 0, 0.06], thighR: [0.08, 0, -0.07], shinL: [0.34, 0, 0], shinR: [0.24, 0, 0]
  }, -0.05);
  mk(0.130, {
    pelvis: [0.04, 0.16, -0.02], spine: [0.08, 0.22, 0], chest: [0.13, 0.40, -0.05], neck: [0.02, 0.12, 0], head: [-0.04, 0.22, 0],
    upperarmR: [-1.62, -0.16, -0.05], forearmR: [-0.28, 0, 0], handR: [0.10, 0, 0.06], weapon: [3.45, -0.14, 0.02],
    upperarmL: [-0.10, 0, 0.18], forearmL: [-0.40, 0, 0.04],
    thighL: [-0.06, 0, 0.05], thighR: [0.02, 0, -0.05], shinL: [0.22, 0, 0], shinR: [0.16, 0, 0]
  }, 0.02);
  mk(0.185, {
    pelvis: [0.05, 0.30, -0.04], spine: [0.12, 0.32, 0], chest: [0.19, 0.64, -0.07], neck: [0.03, 0.14, 0], head: [-0.02, 0.36, 0],
    upperarmR: [-1.52, -0.20, 0.26], forearmR: [-0.18, 0, 0], handR: [0.10, 0, 0.10], weapon: [3.02, -0.26, -0.10],
    upperarmL: [0.18, 0, 0.30], forearmL: [-0.30, 0, 0.04],
    thighL: [-0.18, 0, 0.06], thighR: [0.12, 0, -0.06], shinL: [0.26, 0, 0], shinR: [0.18, 0, 0]
  }, 0.05);
  mk(0.235, {
    pelvis: [0.04, 0.34, -0.03], spine: [0.10, 0.34, 0], chest: [0.15, 0.70, -0.06], neck: [0.03, 0.16, 0], head: [0.00, 0.40, 0],
    upperarmR: [-1.28, -0.16, 0.50], forearmR: [-0.34, 0, 0], handR: [0.10, 0, 0.12], weapon: [2.95, -0.30, -0.14],
    upperarmL: [0.22, 0, 0.34], forearmL: [-0.36, 0, 0.04],
    thighL: [-0.16, 0, 0.06], thighR: [0.10, 0, -0.06], shinL: [0.24, 0, 0], shinR: [0.16, 0, 0]
  }, 0.04);
  mk(0.300, {
    pelvis: [0.02, 0.14, -0.01], spine: [0.06, 0.14, 0], chest: [0.08, 0.28, -0.02], neck: [0.03, 0.06, 0], head: [-0.03, 0.16, 0],
    upperarmR: [-0.82, -0.05, 0.18], forearmR: [-0.48, 0, -0.01], handR: [0.10, 0, 0.04], weapon: [2.72, -0.12, -0.04],
    upperarmL: [0.10, 0, 0.20], forearmL: [-0.30, 0, 0.03],
    thighL: [-0.10, 0, 0.04], thighR: [0.06, 0, -0.04], shinL: [0.18, 0, 0], shinR: [0.14, 0, 0]
  }, 0.02);
  return makeClip('slash', 0.30, K);
}

/** hit — 상체 젖혀짐 + 방어 자세 반동 후 빠른 복귀. 0.26초. */
function hitClip() {
  const K = [];
  const mk = function (t, o, pz) { K.push({ t: t, pose: poseOf(o), pelvis: [0, 1.30, pz || 0] }); };
  mk(0.000, {}, 0);
  mk(0.050, {
    pelvis: [-0.06, 0.05, 0.03], spine: [-0.18, 0.06, 0.05], chest: [-0.26, 0.10, 0.07], neck: [-0.10, 0, 0], head: [-0.30, 0.08, 0.04],
    upperarmR: [0.34, 0, -0.42], forearmR: [-0.62, 0, -0.05], handR: [0.20, 0, -0.10], weapon: [2.80, 0, 0.24],
    upperarmL: [0.30, 0, 0.40], forearmL: [-0.52, 0, 0.06],
    thighL: [0.10, 0, 0.03], thighR: [0.12, 0, -0.03], shinL: [0.22, 0, 0], shinR: [0.26, 0, 0]
  }, 0.055);
  mk(0.130, {
    pelvis: [-0.02, 0.02, 0.01], spine: [-0.06, 0.02, 0.02], chest: [-0.08, 0.04, 0.02], head: [-0.14, 0.02, 0.01],
    upperarmR: [0.16, 0, -0.24], forearmR: [-0.40, 0, -0.04], weapon: [2.72, 0, 0.20],
    upperarmL: [0.14, 0, 0.20], forearmL: [-0.34, 0, 0.04],
    thighL: [0.04, 0, 0.02], thighR: [0.04, 0, -0.02]
  }, 0.02);
  mk(0.260, {}, 0);
  return makeClip('hit', 0.26, K);
}

/* ---------------------------------------------------------------- 조립 */
export function build(opt) {
  opt = opt || {};
  const root = new THREE.Group();
  root.name = 'hero3d-root';
  const bones = {};
  for (let i = 0; i < BONES.length; i++) {
    const spec = BONES[i];
    const b = new THREE.Bone();
    b.name = 'h3d_' + spec[0];
    b.position.set(spec[2][0], spec[2][1], spec[2][2]);
    bones[spec[0]] = b;
    if (spec[1]) bones[spec[1]].add(b);
    else root.add(b);
  }

  const bodyMat = inkMat();
  const clothMat = inkMat({ side: THREE.DoubleSide });
  const outMat = outlineMat();
  const parts = buildParts();
  const meshes = [];
  Object.keys(parts).forEach(function (bn) {
    const bone = bones[bn];
    if (!bone) return;
    const geo = mergeParts(parts[bn]);
    const cloth = !!CLOTH_BONES[bn];
    const mesh = new THREE.Mesh(geo, cloth ? clothMat : bodyMat);
    mesh.castShadow = !!SHADOW_BONES[bn];
    mesh.frustumCulled = false;
    mesh.userData.hero3dBody = true;
    bone.add(mesh);
    meshes.push(mesh);
    if (!cloth && OUTLINE_T > 0 && HULL_BONES[bn]) {
      const hull = new THREE.Mesh(hullGeo(geo, hullThick(bn)), outMat);
      hull.frustumCulled = false;
      hull.userData.hero3dHull = true;
      bone.add(hull);
    }
  });

  /* 접지 그림자 — 달빛 그림자와 별개로 발밑에 먹 그림자를 깐다. */
  let shadow = null;
  if (opt.shadow !== false) {
    const sm = new THREE.SpriteMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.9 });
    shadow = new THREE.Sprite(sm);
    shadow.scale.set(1.5, 1.5, 1);
    shadow.position.set(0, 0.03, 0);
    shadow.renderOrder = 1;
    root.add(shadow);
  }

  const mixer = new THREE.AnimationMixer(root);
  const clips = { idle: idleClip(), walk: walkClip(), slash: slashClip(), hit: hitClip() };
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
    cloth: {}, freeze: false, meshes: meshes, mats: [bodyMat, clothMat, outMat],
    shadow: shadow, opacity: 1, tint: [1, 1, 1], phase: 'idle', lights: null,
    uniforms: [bodyMat.userData.inkUniforms, clothMat.userData.inkUniforms]
  };

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
  root.userData.poseSource = 'hero3d';
  return root;
}

/* ---------------------------------------------------------------- 잔상(대시) */
export function buildGhost(src) {
  if (!src || !src.userData || !src.userData.hero3d) return null;
  /* Object3D.clone 은 userData 를 JSON 으로 직렬화한다 — mixer·뼈대가 든 hero3d 는 순환 참조라
     복제하는 동안만 잠시 빼 둔다. */
  const saved = src.userData;
  let g = null;
  src.userData = {};
  try { g = src.clone(true); } finally { src.userData = saved; }
  if (!g) return null;
  const mat = new THREE.MeshBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide });
  g.traverse(function (o) {
    if (o.isSprite) { o.visible = false; return; }
    if (o.userData && o.userData.hero3dHull) { o.visible = false; return; }
    if (o.isMesh) o.material = mat;
  });
  g.userData = { sharedGeom: true, rig: { kind: 'ghost' }, hero3d: src.userData.hero3d, sprite: null, worldH: HERO_H };
  g.traverse(function (o) { if (o.isMesh && !g.userData.sprite) g.userData.sprite = o; });
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
  H.speed += (sp - H.speed) * Math.min(1, dt * 12);
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
  if (isDash && !H.wasDash) { H.dashT = 0; H.crouchV = 0.16; }
  H.wasDash = isDash;
  if (isDash) H.dashT = (H.dashT || 0) + dt;
  H.crouchV = Math.max(0, (H.crouchV || 0) - dt * 3.2);
  const leanT = (isDash ? 0.30 : 0) + Math.min(0.12, H.speed * 0.014);
  H.lean += (leanT - H.lean) * Math.min(1, dt * 11);
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
  H.armTrail = (H.armTrail || 0) + (armTrailT - (H.armTrail || 0)) * Math.min(1, dt * 12);
  if (H.armTrail > 0.004 && H.bones.upperarmR) {
    H.bones.upperarmR.rotateX(-H.armTrail * 0.9);
    H.bones.upperarmR.rotateZ(-H.armTrail * 0.35);
  }
  if (H.armTrail > 0.004 && H.bones.weapon) H.bones.weapon.rotateX(-H.armTrail * 0.55);

  H.t += dt;
  applyCloth(H, dt, dx / Math.max(dt, 1e-4), dz / Math.max(dt, 1e-4), sp);
  return true;
}

/* 도포 자락·두건 끈: 2차 지연 스프링(프레임률 무관). */
function spring(st, key, target, dt, k, damp) {
  const s = st[key] || (st[key] = { v: 0, x: target });
  s.v += ((target - s.x) * k - s.v * damp) * dt;
  s.x += s.v * dt;
  return s.x;
}
function applyCloth(H, dt, vxSpeed, vzSpeed, sp) {
  if (!H.bones.sashF) return;
  const B = H.bones;
  const breath = Math.sin(H.t * 1.6) * 0.02;
  const blow = Math.min(0.55, sp * 0.05);
  const front = -(0.055 + blow * 0.8 + breath);
  const back = 0.06 + blow * 1.0 + breath;
  const aF = spring(H.cloth, 'f', front, dt, 42, 9.5);
  const aB = spring(H.cloth, 'b', back, dt, 38, 9.0);
  const aF2 = spring(H.cloth, 'f2', aF * 0.9 - 0.03, dt, 30, 8.0);
  const aB2 = spring(H.cloth, 'b2', aB * 0.95 + 0.05, dt, 28, 7.6);
  B.sashF.rotation.set(aF, 0, Math.sin(H.t * 1.9) * 0.02);
  B.sashF2.rotation.set(aF2, 0, Math.sin(H.t * 1.9 + 0.5) * 0.03);
  B.sashB.rotation.set(aB, 0, Math.sin(H.t * 1.6 + 0.8) * 0.025);
  B.sashB2.rotation.set(aB2, 0, Math.sin(H.t * 1.6 + 1.2) * 0.035);
  const sL = spring(H.cloth, 'l', 0.05 + blow * 0.55, dt, 32, 8.4);
  const sR = spring(H.cloth, 'r', 0.05 + blow * 0.55, dt, 32, 8.4);
  B.sashL.rotation.set(sL, 0, 0.10 + Math.sin(H.t * 1.7) * 0.04);
  B.sashR.rotation.set(sR, 0, -0.10 - Math.sin(H.t * 1.7 + 0.9) * 0.04);
  const tl = spring(H.cloth, 'tl', 0.16 * blow + Math.sin(H.t * 2.3) * 0.05 + 0.10, dt, 30, 7.0);
  const tr = spring(H.cloth, 'tr', 0.16 * blow + Math.sin(H.t * 2.3 + 1.1) * 0.05 + 0.10, dt, 30, 7.0);
  B.tailL.rotation.set(tl, 0, 0.16);
  B.tailR.rotation.set(tr, 0, -0.16);
}

/* ---------------------------------------------------------------- v0.46 공용 먹 도구
   몬스터 3D 뼈대(v2/js/inkmonsters3d.js)가 주인공과 **같은** 계조·광원·먹선 규칙을 쓰도록
   셰이더 문자열과 형상 도구를 그대로 내보낸다. 톤이 갈라지지 않게 하는 것이 이 export 의 목적이다. */
export const INK3D = {
  LIGHT: LIGHT, FRAG: FRAG, OUTLINE_T: OUTLINE_T,
  gradMap: gradMap, inkUniforms: inkUniforms, inkMat: inkMat, outlineMat: outlineMat,
  bindLights: bindLights, syncLights: syncLights,
  lathe: lathe, limbGeo: limbGeo, ballGeo: ballGeo, ringGeo: ringGeo, ribbonGeo: ribbonGeo,
  bladeGeo: bladeGeo, mergeParts: mergeParts, hullGeo: hullGeo, mat4: mat4, P: P, shadowTex: shadowTex
};

/* ---------------------------------------------------------------- 외부 훅 */
export function kick(group, k) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return;
  startBurst(H, 'hit', 0.05);
}
export function slashPose(group, k) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return;
  startBurst(H, 'slash', 0.07);
}
export function setOpacity(group, o) {
  const H = group && group.userData && group.userData.hero3d;
  if (!H) return;
  H.opacity = o;
  if (group.userData.rig && group.userData.rig.kind === 'ghost') {
    group.traverse(function (m) { if (m.isMesh && m.material) m.material.opacity = o; });
    return;
  }
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
    mode: '3d', bones: BONE_NAMES.length, meshes: H.meshes.length,
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
