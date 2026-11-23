/* 공중의 3D 입자: 흩날리는 먹 티끌·대나무 잎·반딧불·등불 불티.
   모두 인스턴스 1드로우콜, 위치는 정점 셰이더에서 시간으로 계산해 CPU 부담이 없다. */
import * as THREE from 'three';
import { moteTexture, emberTexture, leafTexture } from './inkbake.js';
import { WF } from './cardstock.js';
import { color as palColor, hex as palHex } from './palette.js';

/* v0.39: 입자도 월드 안개를 따른다 — 영웅에서 먼 티끌은 먹에 잠긴다(재질 패치 대신 셰이더 안에서). */
const FADE_GLSL = /* glsl */`
uniform vec3 uWfHero;
uniform vec4 uWfRange;
uniform vec4 uWfAmt;
float airFade( vec3 p ) {
  if ( uWfAmt.w < 0.5 ) return 0.0;
  float d = length( p.xz - uWfHero.xz );
  float near = smoothstep( uWfRange.x, uWfRange.y, d ) * uWfAmt.x;
  float far = smoothstep( uWfRange.y, max( uWfRange.z, uWfRange.y + 0.1 ), d ) * max( 0.0, uWfAmt.y - uWfAmt.x );
  return clamp( near + far, 0.0, 1.0 );
}
`;
const MOTE_JADE = palHex('moteJade'), MOTE_COLD = palHex('moteCold'), BLOOD = palHex('vermilionHot');
function fadeUniforms() { return { uWfHero: WF.uWfHero, uWfRange: WF.uWfRange, uWfAmt: WF.uWfAmt }; }

const VERT = /* glsl */`
attribute vec3 aSeed;
attribute float aSize;
uniform float uTime, uMode, uSizeK, uRotK, uFade;
uniform vec3 uCenter, uBox;
uniform vec2 uSpeed;
varying vec2 vUv; varying float vA; varying float vSeed; varying vec3 vW;
vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
void main(){
  vUv = uv; vSeed = aSeed.x;
  vec3 p = aSeed * uBox;
  if (uMode < 0.5) {
    p.y -= uTime * uSpeed.x * (0.6 + aSeed.y * 0.9);
    p.x += sin(uTime * 0.55 + aSeed.x * 22.0) * 0.55 + uTime * 0.22;
    p.z += cos(uTime * 0.47 + aSeed.z * 19.0) * 0.55;
  } else if (uMode < 1.5) {
    p.x += sin(uTime * 0.9 + aSeed.x * 30.0) * 0.9;
    p.z += cos(uTime * 0.7 + aSeed.z * 24.0) * 0.9;
    p.y += sin(uTime * 1.5 + aSeed.y * 18.0) * 0.35;
  }
  /* 영웅 주변 상자로 감싼다 */
  vec3 rel = p - uCenter;
  rel = mod(rel + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 world = uCenter + rel;
  vW = world;
  vA = uFade * (1.0 - smoothstep(0.62, 1.0, length(rel.xz) / (uBox.x * 0.5)));
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float a = (aSeed.z - 0.5) * 6.2832 + uTime * uRotK * (0.3 + aSeed.y);
  vec2 q = rot2(uv - 0.5, a) * aSize * uSizeK * (0.7 + aSeed.y * 0.7);
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
  if (aSize <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */`
uniform sampler2D map; uniform vec3 uColor; uniform float uAdd;
varying vec2 vUv; varying float vA; varying float vSeed; varying vec3 vW;
${FADE_GLSL}
void main(){
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA * (1.0 - 0.88 * airFade(vW));
  if (a < 0.01) discard;
  vec3 c = t.rgb * uColor;
  if (uAdd > 0.5) gl_FragColor = vec4(c * (0.35 + 0.9 * t.a) * a, a);
  else gl_FragColor = vec4(c, a);
}`;

function geoFor(count, box) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  const seed = new Float32Array(count * 3), size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    seed[i * 3] = Math.random();
    seed[i * 3 + 1] = Math.random();
    seed[i * 3 + 2] = Math.random();
    size[i] = 1;
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
  g.instanceCount = count;
  g.userData = { base: base, count: count, box: box };
  return g;
}

export class DriftField {
  constructor(scene, o) {
    o = o || {};
    this.scene = scene;
    this.count = o.count || 200;
    this.box = new THREE.Vector3(o.box ? o.box[0] : 30, o.box ? o.box[1] : 16, o.box ? o.box[2] : 30);
    this.geo = geoFor(this.count, this.box);
    this.mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({
        map: { value: o.texture || moteTexture() },
        uTime: { value: 0 },
        uMode: { value: o.mode != null ? o.mode : 0 },
        uCenter: { value: new THREE.Vector3(0, this.box.y * 0.5 - 2, 0) },
        uBox: { value: this.box },
        uSpeed: { value: new THREE.Vector2(o.fall || 0.5, o.drift || 0.3) },
        uSizeK: { value: o.size || 0.08 },
        uRotK: { value: o.rot != null ? o.rot : 0.4 },
        uFade: { value: o.opacity != null ? o.opacity : 0.5 },
        uColor: { value: new THREE.Color(o.color || 0xbfc4bc) },
        uAdd: { value: o.additive ? 1 : 0 }
      }, fadeUniforms()),
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.renderOrder != null ? o.renderOrder : 6;
    scene.add(this.mesh);
  }
  setCenter(x, y, z) { this.mat.uniforms.uCenter.value.set(x, y, z); }
  update(dt) { this.mat.uniforms.uTime.value += dt; }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); this.geo.userData.base.dispose(); this.mat.dispose(); }
}

const EMBER_VERT = /* glsl */`
attribute vec3 aEmitter;
attribute vec3 aSeed;
attribute float aSize;
uniform float uTime; uniform float uSizeK; uniform vec3 uColor;
varying vec2 vUv; varying float vA; varying vec3 vW;
void main(){
  vUv = uv;
  float sp = 0.35 + aSeed.y * 0.75;
  float life = 2.2 + aSeed.z * 2.4;
  float ph = fract((uTime + aSeed.x * life) / life);
  float rise = 0.15 + ph * (2.0 + aSeed.y * 1.8);
  vec3 p = aEmitter + vec3(
    sin(ph * 9.0 + aSeed.x * 25.0) * 0.42 * (0.3 + ph),
    rise,
    cos(ph * 7.0 + aSeed.z * 21.0) * 0.42 * (0.3 + ph));
  vA = (1.0 - ph) * (0.35 + 0.65 * smoothstep(0.0, 0.18, ph)) * 0.9;
  vW = p;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += (uv - 0.5) * aSize * uSizeK * (0.6 + aSeed.z * 0.8);
  gl_Position = projectionMatrix * mv;
}`;

const EMBER_FRAG = /* glsl */`
uniform sampler2D map; uniform vec3 uColor;
varying vec2 vUv; varying float vA; varying vec3 vW;
${FADE_GLSL}
void main(){
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA * (1.0 - 0.85 * airFade(vW));
  if (a < 0.01) discard;
  gl_FragColor = vec4(t.rgb * uColor * (0.5 + 1.5 * t.a) * a, a);
}`;

export class EmberField {
  constructor(scene, emitters, o) {
    o = o || {};
    this.scene = scene;
    const per = o.per || 34;
    const n = Math.max(1, emitters.length * per);
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    const em = new Float32Array(n * 3), seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const e = emitters[Math.floor(i / per)] || { x: 0, y: 0.4, z: 0 };
      em[i * 3] = e.x; em[i * 3 + 1] = e.y; em[i * 3 + 2] = e.z;
      seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random();
    }
    g.setAttribute('aEmitter', new THREE.InstancedBufferAttribute(em, 3));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1));
    g.instanceCount = n;
    this.geo = g; this.base = base; this.n = n;
    this.mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({
        map: { value: emberTexture() }, uTime: { value: 0 },
        uSizeK: { value: o.size || 0.11 }, uColor: { value: new THREE.Color(o.color || 0xff8a3a) }
      }, fadeUniforms()),
      vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
  }
  update(dt) { this.mat.uniforms.uTime.value += dt; }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); this.base.dispose(); this.mat.dispose(); }
}

/* ---------- v0.43: 갓레이(사선 빛줄기) ----------
   sky-rays 기법을 우리 방식으로: 화면 공간에서 기울어진 부드러운 빛기둥 몇 장.
   · 텍스처는 캔버스로 한 장만 굽는다(에셋 없음, 64×256).
   · 큰 평면 몇 장 = 드로우콜 1(인스턴스) · 알파 합성만 하므로 모바일 비용이 낮다.
   · 시간에 따라 아주 느리게 흔들리고 숨 쉬며, 카메라를 따라온다. */
let _shaftTex = null;
function shaftTexture() {
  if (_shaftTex) return _shaftTex;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 256;
  const c2 = cv.getContext('2d');
  const gx = c2.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)');
  gx.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gx.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  gx.addColorStop(0.65, 'rgba(255,255,255,0.55)');
  gx.addColorStop(1, 'rgba(255,255,255,0)');
  c2.fillStyle = gx;
  c2.fillRect(0, 0, 64, 256);
  const gy = c2.createLinearGradient(0, 0, 0, 256);
  gy.addColorStop(0, 'rgba(0,0,0,0)');
  gy.addColorStop(0.25, 'rgba(0,0,0,0.0)');
  gy.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  gy.addColorStop(1, 'rgba(0,0,0,1)');
  c2.globalCompositeOperation = 'destination-out';
  c2.fillStyle = gy;
  c2.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  _shaftTex = t;
  return t;
}

const RAY_VERT = /* glsl */`
attribute vec3 aSeed;
uniform float uTime; uniform vec3 uCenter; uniform vec2 uBox; uniform float uW, uL, uTilt;
varying vec2 vUv; varying float vA;
void main(){
  vUv = uv;
  /* 화면 공간에 세운 빛기둥: 중심에서 좌우로 흔들리며 아주 느리게 움직인다. */
  float ph = uTime * 0.045 + aSeed.x * 6.2832;
  vec3 p = vec3(uCenter.x + sin(ph) * uBox.x * 0.42 + (aSeed.y - 0.5) * uBox.x * 0.9,
                uCenter.y + uBox.y * 0.35,
                uCenter.z + cos(ph * 0.8) * uBox.y * 0.42 + (aSeed.z - 0.5) * uBox.y * 0.9);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float c = cos(uTilt), s2 = sin(uTilt);
  vec2 q = vec2(c * (position.x * uW) - s2 * (position.y * uL),
                s2 * (position.x * uW) + c * (position.y * uL));
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
  vA = (0.55 + 0.45 * sin(ph * 1.7 + 1.3)) * (0.45 + 0.55 * aSeed.y);
}`;

const RAY_FRAG = /* glsl */`
uniform sampler2D map; uniform vec3 uColor; uniform float uAlpha;
varying vec2 vUv; varying float vA;
void main(){
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

export class RayField {
  constructor(scene, o) {
    o = o || {};
    this.scene = scene;
    const n = o.count || 5;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) seed[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));
    g.instanceCount = n;
    this.geo = g; this.base = base;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: shaftTexture() },
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3(0, 4, 0) },
        uBox: { value: new THREE.Vector2(o.box ? o.box[0] : 16, o.box ? o.box[1] : 12) },
        uW: { value: o.width || 4.2 }, uL: { value: o.length || 26 },
        uTilt: { value: o.tilt != null ? o.tilt : 0.42 },
        uColor: { value: new THREE.Color(o.color || 0xfff0d2) },
        uAlpha: { value: o.alpha != null ? o.alpha : 0.085 }
      },
      vertexShader: RAY_VERT, fragmentShader: RAY_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6.5;
    scene.add(this.mesh);
  }
  setCenter(x, y, z) { this.mat.uniforms.uCenter.value.set(x, y, z); }
  update(dt) { this.mat.uniforms.uTime.value += dt; }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); this.base.dispose(); this.mat.dispose(); }
}

/* v1.01 3d-falling-leaves: 1드로우콜 InstancedMesh 3D 입체 텀블링 낙엽 (곡면 양면 잎 + 연동 횡이동 + 제로 GC) */
const _leafDummy = new THREE.Object3D();
function makeCurvedLeafGeo() {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array([
    0.0,  0.00, -0.18,
   -0.06, 0.02, -0.04,
    0.06, 0.02, -0.04,
   -0.05, 0.01,  0.09,
    0.05, 0.01,  0.09,
    0.0, -0.02,  0.22
  ]);
  const idx = [0,1,2, 1,3,2, 2,3,4, 3,5,4];
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

class FallingLeaves3D {
  constructor(scene, { count = 42, color = 0x8eb88a, box = [28, 13, 28], scale = 1.0 } = {}) {
    this.scene = scene;
    this.count = count;
    this.box = box;
    this.time = 0;
    this.cx = 0; this.cy = 6; this.cz = 0;
    this.geo = makeCurvedLeafGeo();
    this.mat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.72,
      metalness: 0.0,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.seeds = [];
    for (let i = 0; i < count; i++) {
      const s = (i * 0.6180339887) % 1;
      const s2 = ((i * 1.3247179572) % 1);
      const s3 = ((i * 2.2055694304) % 1);
      this.seeds.push({
        x0: (s - 0.5) * box[0],
        y0: s2 * box[1],
        z0: (s3 - 0.5) * box[2],
        sc: scale * (0.72 + 0.58 * ((i * 0.37) % 1)),
        phase: s * Math.PI * 2,
        omega: 1.5 + 1.4 * s2,
        rollRate: 0.6 + 0.9 * s3,
        fall: 0.55 + 0.55 * s,
        slip: 0.55 + 0.65 * s2,
        dirA: s3 * Math.PI * 2
      });
    }
    scene.add(this.mesh);
    this.update(0);
  }
  setCenter(x, y, z) { this.cx = x; this.cy = y; this.cz = z; }
  update(dt) {
    this.time += Math.min(0.05, dt || 0);
    const t = this.time;
    const bx = this.box[0], by = this.box[1], bz = this.box[2];
    const windX = Math.sin(t * 0.38) * 0.55;
    const windZ = Math.cos(t * 0.27) * 0.35;
    for (let i = 0; i < this.count; i++) {
      const p = this.seeds[i];
      const angle = p.phase + p.omega * t;
      const sideOffset = -(p.slip / p.omega) * Math.cos(angle);
      const lx = p.x0 + Math.cos(p.dirA) * sideOffset + windX * t;
      const lz = p.z0 + Math.sin(p.dirA) * sideOffset + windZ * t;
      const ly = p.y0 - p.fall * t;
      const wx = this.cx + ((((lx % bx) + bx) % bx) - bx * 0.5);
      const wy = Math.max(0.25, ((ly % by) + by) % by);
      const wz = this.cz + ((((lz % bz) + bz) % bz) - bz * 0.5);
      _leafDummy.position.set(wx, wy, wz);
      _leafDummy.rotation.set(angle, p.dirA + p.rollRate * t, Math.sin(angle * 0.7) * 0.85);
      _leafDummy.scale.setScalar(p.sc);
      _leafDummy.updateMatrix();
      this.mesh.setMatrixAt(i, _leafDummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

export class StageAtmosphere {  constructor(scene, stageId) {
    this.fields = [];
    const actNo = Math.max(1, Math.min(4, Math.ceil(Math.max(1, Number(stageId || 1)) / 3)));
    const add = function (f) { this.fields.push(f); }.bind(this);
    const mk = function (o) { return new DriftField(scene, o); };
    const mote = function (o) { return mk(Object.assign({ texture: moteTexture(), mode: 0 }, o)); };
    /* v0.97 막(Act 1~4)별 전장 대기 파티클 차별화: 1막 대나무 낙엽, 2막 설산 눈송이, 3막 홍련 불티, 4막 금월 금가루 */
    if (actNo === 1) {
      add(new FallingLeaves3D(scene, { count: 44, color: stageId === 3 ? 0x82b886 : 0xc8a468, box: [26, 13, 26], scale: 1.05 }));
      add(mk({ count: 95, texture: leafTexture(), mode: 0, box: [34, 18, 34], size: 0.20, fall: 0.32, drift: 0.56, color: stageId === 3 ? 0xcfe0c4 : 0xdcc89a, opacity: 0.65, rot: 1.45 }));
      add(mote({ count: 110, box: [30, 16, 30], size: 0.055, fall: 0.18, drift: 0.42, color: 0xe6d4a8, opacity: 0.44, rot: 0.5 }));
      add(mk({ count: 48, texture: moteTexture(), mode: 1, box: [26, 7, 26], size: 0.085, color: MOTE_JADE, opacity: 0.82, additive: true, rot: 0 }));
    } else if (actNo === 2) {
      add(mote({ count: 240, box: [32, 18, 32], size: 0.115, fall: 0.82, drift: 0.78, color: 0xf0f6ff, opacity: 0.72, rot: 0.45 }));
      add(mote({ count: 150, box: [30, 16, 30], size: 0.048, fall: 1.25, drift: 0.95, color: 0xd8e8fa, opacity: 0.48, rot: 0.65 }));
      add(mk({ count: 42, texture: moteTexture(), mode: 1, box: [26, 8, 26], size: 0.08, color: MOTE_COLD, opacity: 0.76, additive: true, rot: 0 }));
    } else if (actNo === 3) {
      add(mk({ count: 95, texture: moteTexture(), mode: 1, box: [28, 10, 28], size: 0.085, color: 0xff6238, opacity: 0.88, additive: true, rot: 0 }));
      add(mote({ count: 210, box: [32, 18, 32], size: 0.062, fall: 0.25, drift: 0.55, color: 0x9a7874, opacity: 0.48, rot: 0.95 }));
      add(new FallingLeaves3D(scene, { count: 36, color: 0xc24838, box: [26, 13, 26], scale: 0.95 }));
      add(mk({ count: 45, texture: leafTexture(), mode: 0, box: [32, 16, 32], size: 0.17, fall: 0.34, drift: 0.62, color: 0xc26a58, opacity: 0.52, rot: 1.5 }));
    } else {
      add(mk({ count: 120, texture: moteTexture(), mode: 1, box: [28, 11, 28], size: 0.092, color: 0xffe08a, opacity: 0.90, additive: true, rot: 0 }));
      add(mote({ count: 165, box: [32, 18, 32], size: 0.058, fall: 0.20, drift: 0.52, color: 0xc8b2f0, opacity: 0.46, rot: 0.8 }));
      add(mk({ count: 45, texture: moteTexture(), mode: 1, box: [26, 8, 26], size: 0.075, color: 0xc29aff, opacity: 0.72, additive: true, rot: 0 }));
    }
    /* v0.97 막별 사선 빛줄기(갓레이) */
    try {
      const rayCol = actNo === 4 ? 0xf4d284 : (actNo === 3 ? 0xff8c66 : (actNo === 2 ? 0xd8ecff : 0xfff0d0));
      this.rays = new RayField(scene, { count: 5, color: rayCol, alpha: actNo === 2 ? 0.08 : 0.095, width: 3.6, length: 26, tilt: 0.42 });
      this.fields.push(this.rays);
    } catch (e) { this.rays = null; }
    /* v0.43: 한지 먼지 — 모든 장에 아주 옅은 따뜻한 티끌을 한 겹 더한다. */
    add(mote({ count: 90, box: [30, 14, 30], size: 0.045, fall: 0.10, drift: 0.35, color: stageId >= 9 ? 0xd9a288 : 0xe8dcc0, opacity: 0.30, rot: 0.6 }));
    /* 등불 불티: the chunk world hands its bonfires over with setEmitters on every rebuild. */
    this.scene = scene;
    this.ember = null;
    this.emberOpt = { per: stageId === 4 ? 38 : 26, size: 0.1, color: stageId === 4 || stageId >= 9 ? 0xff5a32 : 0xff9a42 };
    this.center = new THREE.Vector3(0, 6, 0);
  }
  setCenter(x, y, z) {
    this.center.set(x, y, z);
    this.fields.forEach(function (f) { if (f.setCenter) f.setCenter(x, y, z); });
  }
  /** Replaces the ember emitters (world points {x, y, z}); called when the chunk window moves. */
  setEmitters(list) {
    if (this.ember) { this.fields.splice(this.fields.indexOf(this.ember), 1); this.ember.dispose(); this.ember = null; }
    if (!list || !list.length) return;
    this.ember = new EmberField(this.scene, list, this.emberOpt);
    this.fields.push(this.ember);
  }
  update(dt) { this.fields.forEach(function (f) { f.update(dt); }); }
  dispose() { this.fields.forEach(function (f) { f.dispose(); }); this.fields = []; this.ember = null; }
}
