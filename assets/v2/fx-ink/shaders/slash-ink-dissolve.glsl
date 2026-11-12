// fx-ink reference: slash ink ribbon dissolve (three.js MeshBasicMaterial.onBeforeCompile patch, r170)
// uniforms: dMask = slash/slash-dissolve-mask.png (linear, no mip needed). Drive material.opacity 1 -> 0 over the slash life.
//   mat.onBeforeCompile = (sh) => {
//     sh.uniforms.dMask = { value: dissolveTex };
//     sh.fragmentShader = 'uniform sampler2D dMask;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', CHUNK);
//   };
//   mat.customProgramCacheKey = () => 'fxink-dissolve';
// CHUNK:
#include <alphamap_fragment>
float th  = 1.0 - clamp(opacity * 1.18, 0.0, 1.0);   // dissolve threshold rises as opacity falls
float dmk = texture2D(dMask, vMapUv).r;               // mask: dark = dries first (tail), light = last (press point)
if (dmk < th) discard;
diffuseColor.a = texture2D(map, vMapUv).a * smoothstep(th, th + 0.08, dmk);   // soft dry edge, ink stays opaque until it dries
