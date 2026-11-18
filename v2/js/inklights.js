/* v2/js/inklights.js — Three.js r170 동적 점광원 풀 & 3D 지면 시야안개·소나 셰이더 모듈. */
import * as THREE from 'three';

export class InkLightPool {
  constructor(scene, { maxLights = 6, distance = 14, decay = 2 } = {}) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    for (let i = 0; i < maxLights; i++) {
      const light = new THREE.PointLight(0xffffff, 0, distance, decay);
      light.castShadow = false;
      light.visible = false;
      scene.add(light);
      this.pool.push({ light, life: 0, maxLife: 1, peak: 0 });
    }
  }

  burst(x, y, z, { color = 0x5eead4, intensity = 4.5, duration = 0.28, distance = 14 } = {}) {
    let slot = this.pool.find((s) => s.life <= 0);
    if (!slot) slot = this.pool.reduce((a, b) => (a.life < b.life ? a : b));
    slot.light.color.setHex(color);
    slot.light.distance = distance;
    slot.light.position.set(x, y, z);
    slot.light.intensity = intensity;
    slot.light.visible = true;
    slot.peak = intensity;
    slot.life = duration;
    slot.maxLife = Math.max(0.01, duration);
    if (!this.active.includes(slot)) this.active.push(slot);
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.life -= dt;
      if (s.life <= 0) {
        s.life = 0;
        s.light.intensity = 0;
        s.light.visible = false;
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

export function createWorldInkUniforms() {
  return {
    uHeroPos: { value: new THREE.Vector3(0, 0, 0) },
    uSightRadius: { value: 11.5 },
    uFogHeight: { value: 2.2 },
    uSonarOrigin: { value: new THREE.Vector3(0, 0, 0) },
    uSonarRadius: { value: 0.0 },
    uSonarWidth: { value: 1.4 },
    uSonarAlpha: { value: 0.0 },
    uSonarColor: { value: new THREE.Color(0x5eead4) }
  };
}

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
        uniform vec3 uHeroPos;
        uniform float uSightRadius;
        uniform float uFogHeight;
        uniform vec3 uSonarOrigin;
        uniform float uSonarRadius;
        uniform float uSonarWidth;
        uniform float uSonarAlpha;
        uniform vec3 uSonarColor;`)
      .replace('#include <dithering_fragment>', `
        float dHero = length(vInkWorldPos.xz - uHeroPos.xz);
        float sightMask = smoothstep(uSightRadius * 0.72, uSightRadius * 1.25, dHero);
        float heightFade = 1.0 - smoothstep(0.0, uFogHeight, max(0.0, vInkWorldPos.y));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.015, 0.014, 0.016), sightMask * (0.45 + 0.45 * heightFade));
        if (uSonarAlpha > 0.001) {
          float dSonar = abs(length(vInkWorldPos.xz - uSonarOrigin.xz) - uSonarRadius);
          float ring = 1.0 - smoothstep(0.0, uSonarWidth, dSonar);
          gl_FragColor.rgb += uSonarColor * ring * uSonarAlpha * 1.35;
        }
        #include <dithering_fragment>`);
  };
  material.needsUpdate = true;
}
