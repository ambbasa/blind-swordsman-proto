/* 공중의 3D 입자: 흩날리는 먹 티끌·대나무 잎·반딧불·등불 불티.
   모두 인스턴스 1드로우콜, 위치는 정점 셰이더에서 시간으로 계산해 CPU 부담이 없다. */
import * as THREE from 'three';
import { moteTexture, emberTexture, leafTexture } from './inkbake.js';

const VERT = /* glsl */`
attribute vec3 aSeed;
attribute float aSize;
uniform float uTime, uMode, uSizeK, uRotK, uFade;
uniform vec3 uCenter, uBox;
uniform vec2 uSpeed;
varying vec2 vUv; varying float vA; varying float vSeed;
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
varying vec2 vUv; varying float vA; varying float vSeed;
void main(){
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA;
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
      uniforms: {
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
      },
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
varying vec2 vUv; varying float vA;
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
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += (uv - 0.5) * aSize * uSizeK * (0.6 + aSeed.z * 0.8);
  gl_Position = projectionMatrix * mv;
}`;

const EMBER_FRAG = /* glsl */`
uniform sampler2D map; uniform vec3 uColor;
varying vec2 vUv; varying float vA;
void main(){
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA;
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
      uniforms: {
        map: { value: emberTexture() }, uTime: { value: 0 },
        uSizeK: { value: o.size || 0.11 }, uColor: { value: new THREE.Color(o.color || 0xff8a3a) }
      },
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

export class StageAtmosphere {
  constructor(scene, stageId, map) {
    this.fields = [];
    const rnd = Math.random;
    const add = function (f) { this.fields.push(f); }.bind(this);
    const mk = function (o) { return new DriftField(scene, o); };
    if (stageId === 3) {
      add(mk({ count: 150, texture: leafTexture(), mode: 0, box: [34, 18, 34], size: 0.22, fall: 0.32, drift: 0.5, color: 0xcfe0c4, opacity: 0.75, rot: 1.4 }));
      add(mk({ count: 90, texture: moteTexture(), mode: 0, box: [30, 16, 30], size: 0.05, fall: 0.16, color: 0x9fb6a4, opacity: 0.4, rot: 0.5 }));
      add(mk({ count: 54, texture: moteTexture(), mode: 1, box: [26, 7, 26], size: 0.09, color: 0x7dffb0, opacity: 0.85, additive: true, rot: 0 }));
    } else if (stageId === 2) {
      add(mk({ count: 170, texture: moteTexture(), mode: 0, box: [32, 18, 32], size: 0.055, fall: 0.28, color: 0xbfcbe0, opacity: 0.42, rot: 0.6 }));
      add(mk({ count: 70, texture: moteTexture(), mode: 0, box: [30, 16, 30], size: 0.03, fall: 0.5, color: 0xdde6f5, opacity: 0.3, rot: 0.8 }));
    } else {
      add(mk({ count: 200, texture: moteTexture(), mode: 0, box: [32, 18, 32], size: 0.05, fall: 0.34, color: stageId === 4 ? 0xd8a898 : 0xc8c2b4, opacity: 0.4, rot: 0.7 }));
      add(mk({ count: 26, texture: moteTexture(), mode: 0, box: [28, 12, 28], size: 0.16, fall: 0.12, color: stageId === 4 ? 0x6a4038 : 0x8a8478, opacity: 0.16, rot: 1.2 }));
    }
    /* 등불 불티 */
    const emitters = [];
    (map.firePits || []).forEach(function (p) { emitters.push(p); });
    (map.braziers || []).forEach(function (p) { emitters.push(p); });
    if (map.pools) {
      map.pools.slice(0, 6).forEach(function (p) { emitters.push({ x: p.x, y: 1.2, z: p.z }); });
    }
    if (emitters.length) add(new EmberField(scene, emitters, { per: stageId === 4 ? 38 : 26, size: 0.1, color: stageId === 4 ? 0xff5a32 : 0xff9a42 }));
    this.center = new THREE.Vector3(0, 6, 0);
  }
  setCenter(x, y, z) {
    this.center.set(x, y, z);
    this.fields.forEach(function (f) { if (f.setCenter) f.setCenter(x, y, z); });
  }
  update(dt) { this.fields.forEach(function (f) { f.update(dt); }); }
  dispose() { this.fields.forEach(function (f) { f.dispose(); }); this.fields = []; }
}
