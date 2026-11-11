// one-shape-bell post effect — dark ink-ground version (designer reference)
// World drains to monochrome ink, black ink closes in from the edges; vivid accents (wisp marks,
// red seals, slash / element colours) keep their colour so the "same shape" read pops.
precision mediump float;
uniform sampler2D uScene; uniform sampler2D uInk;   // fx/onebell-ink-N.png
uniform float uK;      // 0..1 strength
uniform float uTime;
varying vec2 vUv;
const vec3 PAPER = vec3(.929,.890,.812);
const vec3 INK   = vec3(.039,.035,.031);
void main(){
  vec3 c = texture2D(uScene, vUv).rgb;
  float l = dot(c, vec3(.299,.587,.114));
  float sat = max(c.r,max(c.g,c.b)) - min(c.r,min(c.g,c.b));
  vec3 mono = mix(INK, PAPER, smoothstep(.04,.9,l));
  float keep = smoothstep(.28,.55,sat);
  float r = length((vUv-.5)*vec2(1.,.75));
  vec3 g = mix(mono, c, keep);
  g = mix(g, INK, smoothstep(.3,.7,r)*.5);                  // ink pools at the edges
  vec2 uv = vUv + vec2(sin(uTime*1.7+vUv.y*9.)*.004, 0.);
  float ink = texture2D(uInk, uv).a;
  vec3 o = mix(c, g, uK);
  o = mix(o, INK, ink*uK);
  gl_FragColor = vec4(o,1.);
}
