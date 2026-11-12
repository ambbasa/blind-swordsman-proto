// fx-ink reference: all ink particles in ONE THREE.Points draw call (ShaderMaterial, transparent, depthWrite:false, normal blend)
// attributes: position(vec3) aSize(float, metres) aFrame(float 0..31 on the 8x4 sheet) aRot(float rad) aAlpha(float)
// uniforms: map = particles/ink-particles.png, uScale = renderer height(px) * 0.6 (≈ perspective size factor; tune so 0.3 m ≈ 10-14 css px on phone)
// ---- vertex
attribute float aSize, aFrame, aRot, aAlpha; varying float vF, vR, vA; uniform float uScale;
void main() { vF = aFrame; vR = aRot; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }
// ---- fragment
uniform sampler2D map; varying float vF, vR, vA;
void main() { vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1.) discard;
  float col = mod(vF, 8.0), row = floor(vF / 8.0);
  vec4 t = texture2D(map, vec2((col + p.x) / 8.0, 1.0 - (row + p.y) / 4.0)); t.a *= vA; if (t.a < 0.02) discard;
  gl_FragColor = t;
#include <colorspace_fragment>
}
