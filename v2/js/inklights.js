/* v2/js/inklights.js — Three.js r170 동적 점광원 풀 & 3D 지면 소나 셰이더 모듈.
   v0.39: 지면 전용 시야안개(uSightFog) 블록은 은퇴했다 — 같은 계산을 cardstock.js 의
   월드 공통 재질 패치가 지면·소품·캐릭터까지 한 규칙으로 나눠 맡는다(이중 안개 방지).
   여기에는 소나 링 하나만 남는다. */
import * as THREE from 'three';
import { color as palColor } from './palette.js';

/** Pool of short-lived point lights for slash/impact flashes.
 *  Lights stay `visible` for their whole life and are "off" at intensity 0: three.js bakes the number of
 *  visible lights into every lit material's program, so toggling visibility would relink every
 *  MeshStandardMaterial on each burst (frame hitches). Create the pool before any material prewarm. */
export class InkLightPool {
  constructor(scene, { maxLights = 4, distance = 14, decay = 2 } = {}) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    for (let i = 0; i < maxLights; i++) {
      const light = new THREE.PointLight(0xffffff, 0, distance, decay);
      light.castShadow = false;
      scene.add(light);
      this.pool.push({ light, life: 0, maxLife: 1, peak: 0 });
    }
  }

  /** Flashes one light at (x, y, z); steals the slot closest to expiring when all are busy. */
  burst(x, y, z, { color = 0, intensity = 4.5, duration = 0.28, distance = 14 } = {}) {
    if (!this.pool.length) return;
    let slot = this.pool.find((s) => s.life <= 0);
    if (!slot) slot = this.pool.reduce((a, b) => (a.life < b.life ? a : b));
    if (color && color.isColor) slot.light.color.copy(color);
    else if (color) slot.light.color.setHex(color);
    else slot.light.color.copy(palColor('jade'));
    slot.light.distance = distance;
    slot.light.position.set(x, y, z);
    slot.light.intensity = intensity;
    slot.peak = intensity;
    slot.life = duration;
    slot.maxLife = Math.max(0.01, duration);
    if (!this.active.includes(slot)) this.active.push(slot);
  }

  /** Fades active lights (quadratic falloff); call once per frame. */
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.life -= dt;
      if (s.life <= 0) {
        s.life = 0;
        s.light.intensity = 0;
        this.active.splice(i, 1);
      } else {
        const k = s.life / s.maxLife;
        s.light.intensity = s.peak * k * k;
      }
    }
  }

  dispose() {
    for (const s of this.pool) this.scene.remove(s.light);
    this.pool.length = 0;
    this.active.length = 0;
  }
}

/** Shared uniforms for attachGroundInkShader. All lengths are world units (metres). */
export function createWorldInkUniforms() {
  return {
    uHeroPos: { value: new THREE.Vector3(0, 0, 0) },
    uSonarOrigin: { value: new THREE.Vector3(0, 0, 0) },
    uSonarRadius: { value: 0.0 },
    uSonarWidth: { value: 0.4 },
    uSonarAlpha: { value: 0.0 },
    uSonarColor: { value: palColor('jade').clone() }
  };
}

/** Injects the ground-projected sonar ring into a lit material.
 *  Meant for ground materials only (userData.inkGround); idempotent per material. */
export function attachGroundInkShader(material, uniforms) {
  if (!material || material.userData._inkShaderAttached) return;
  material.userData._inkShaderAttached = true;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vInkWorldPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 inkWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          inkWp = instanceMatrix * inkWp;
        #endif
        inkWp = modelMatrix * inkWp;
        vInkWorldPos = inkWp.xyz;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vInkWorldPos;
        uniform vec3 uSonarOrigin;
        uniform float uSonarRadius;
        uniform float uSonarWidth;
        uniform float uSonarAlpha;
        uniform vec3 uSonarColor;`)
      .replace('#include <dithering_fragment>', `
        if (uSonarAlpha > 0.001) {
          float dSonar = abs(length(vInkWorldPos.xz - uSonarOrigin.xz) - uSonarRadius);
          float ring = 1.0 - smoothstep(0.0, uSonarWidth, dSonar);
          gl_FragColor.rgb += uSonarColor * ring * uSonarAlpha * 1.35;
        }
        #include <dithering_fragment>`);
  };
  /* Same injected source for every patched material, but keep patched/unpatched programs apart. */
  const prevKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => prevKey() + '|inkground1';
  material.needsUpdate = true;
}
