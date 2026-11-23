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
    uSonarColor: { value: palColor('jade').clone() },
    /* v0.62 lightning-energy-skill-vfx: 스캔 바닥 균열 틈새 발열 글로우(번개·참·보스 강타 연동) */
    uCrackHeatPos: { value: new THREE.Vector3(0, 0, 0) },
    uCrackHeatRadius: { value: 3.5 },
    uCrackHeatAmt: { value: 0.0 },
    uCrackHeatCol: { value: new THREE.Color(0xff9838) },
    /* v0.97 전투 바닥 달빛·테마 프레넬 반사광(추가 드로우콜 없음) */
    uGroundSheenCol: { value: new THREE.Color(0xffebb8) },
    uGroundSheenAmt: { value: 0.20 }
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
        uniform vec3 uSonarColor;
        uniform vec3 uCrackHeatPos;
        uniform float uCrackHeatRadius;
        uniform float uCrackHeatAmt;
        uniform vec3 uCrackHeatCol;
        uniform vec3 uGroundSheenCol;
        uniform float uGroundSheenAmt;`)
      .replace('#include <dithering_fragment>', `
        if (uSonarAlpha > 0.001) {
          float dSonar = abs(length(vInkWorldPos.xz - uSonarOrigin.xz) - uSonarRadius);
          float ring = 1.0 - smoothstep(0.0, uSonarWidth, dSonar);
          gl_FragColor.rgb += uSonarColor * ring * uSonarAlpha * 1.35;
        }
        if (uCrackHeatAmt > 0.002) {
          float dHeat = length(vInkWorldPos.xz - uCrackHeatPos.xz);
          float hFall = 1.0 - smoothstep(0.15, max(0.5, uCrackHeatRadius), dHeat);
          if (hFall > 0.005) {
            /* 스캔 바닥 ARM 맵의 AO 채널(r)이 낮은 깊은 균열 틈새만 가늘게 달아오른다 */
            float crackMask = 0.55;
            #ifdef USE_ROUGHNESSMAP
              float aoVal = texture2D(roughnessMap, vRoughnessMapUv).r;
              crackMask = 1.0 - smoothstep(0.28, 0.52, aoVal);
            #endif
            float glow = hFall * hFall * (0.22 + 1.45 * crackMask) * uCrackHeatAmt;
            gl_FragColor.rgb += uCrackHeatCol * glow;
          }
        }
        if (uGroundSheenAmt > 0.002) {
          vec3 vDir = normalize(cameraPosition - vInkWorldPos);
          float fres = pow(1.0 - clamp(vDir.y, 0.0, 1.0), 2.6);
          float stoneVar = 0.65;
          #ifdef USE_ROUGHNESSMAP
            stoneVar = 1.0 - smoothstep(0.32, 0.88, texture2D(roughnessMap, vRoughnessMapUv).g);
          #endif
          float distFade = 1.0 - smoothstep(10.0, 34.0, length(vInkWorldPos.xz - cameraPosition.xz));
          gl_FragColor.rgb += uGroundSheenCol * fres * (0.35 + 0.65 * stoneVar) * distFade * uGroundSheenAmt;
        }
        #include <dithering_fragment>`);
  };
  /* Same injected source for every patched material, but keep patched/unpatched programs apart. */
  const prevKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => prevKey() + '|inkground1';
  material.needsUpdate = true;
}
