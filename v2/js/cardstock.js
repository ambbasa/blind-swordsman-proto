/* v2/js/cardstock.js — 『심안』 v0.39 공통 재질: 종이 물성 + 월드 시야안개(fade-to-dark).
   2·3단계의 한 몸통이다. 지면·소품·기물·병풍·캐릭터 파츠·혼령 빌보드가 모두 이 패치를 지나면
   "한 세트의 종이 규칙"을 공유한다.

   재질에 더하는 것 (전부 스톡 셰이더 청크 위에 얹는다 — three r170):
     1) 랩 라이팅   : 릿 재질의 명암 경계를 부드럽게(CARD_WRAP 상수). 플라스틱 하이라이트가 사라진다.
     2) 얇은 종이 역광: 표면이 빛 반대쪽을 향할수록 따뜻하게 비친다(uCardTrans). 빌보드(그림)는
                      노멀이 없으므로 '위쪽 은은한 역광 + 아래쪽 살짝 어두움'으로 제한한다.
     3) 시트별 톤   : 오브젝트 원점 해시로 ±uCardTone 만큼 알베도를 흔든다(같은 집·나무가 다 같은 색이 되지 않게).
     4) 월드 안개   : 영웅에서의 월드 거리로 먹색에 잠긴다. 높이가 있는 물체는 실루엣을 남긴다
                      (지면은 완전히 잠기고, 병풍·지붕·등불 기둥은 어둠 위로 떠 보인다).
   프레임 할당 0: 모든 값은 재질마다 한 번 만든 uniform 객체를 공유·갱신한다(매 프레임 new 없음).
   프로그램 수: 무늬(defines)로만 갈리므로 종류별 1개 — 재링크가 런 중에 일어나지 않는다. */
import * as THREE from 'three';

/** 모든 패치 재질이 공유하는 안개 uniform. game.js 가 매 프레임 한 번만 채운다. */
export const WF = {
  uWfHero: { value: new THREE.Vector3(0, 0, 0) },
  uWfRange: { value: new THREE.Vector4(5.4, 7.3, 15.6, 0) }, // inner, outer, far, pulse
  uWfAmt: { value: new THREE.Vector4(0.82, 0.96, 0, 1) },    // v0.49: 원 안은 선명한 한지, 원 밖은 짙은 먹안개 대비
  /* v0.43: 한지 톤 — 어둠이 아니라 '따뜻한 먹물'로 멀어진다(바탕이 밝아졌으므로). */
  uWfColor: { value: new THREE.Color(0.01, 0.009, 0.009) },
  /* 화면 위쪽(멀어지는) 방향 xz 와 앞뒤 압축 계수. 원근 카메라에서는 월드 원이 화면 타원보다
     위로 길게 투영되므로, 예전 2D 안개의 '화면 타원' 감성을 유지하려면 앞뒤 거리를 덜 잰다. */
  uWfDirK: { value: new THREE.Vector3(0, -1, 0.70) },
  uWfDbg: { value: 0 }
};

/** 재질 종류별 프로필.
 *  fade  : 안개에 잠기는 정도(0 = 면제 — 어둠이 표적을 삼키면 안 되는 것들)
 *  h     : 이 높이까지는 안개가 덜하다(실루엣 유지)
 *  tone  : 시트별 톤 흔들림(±)
 *  trans : 얇은 종이 역광 세기 */
export const PROFILE = {
  /* 기존 2D 안개(alpha 0.78)와 같은 짙음을 기준선으로 삼는다. */
  ground:   { fade: 1.00, h: 2.6, tone: 0.045, trans: 0.00, hFloor: 1.00 },
  prop:     { fade: 0.92, h: 3.4, tone: 0.060, trans: 0.14, hFloor: 0.88 },
  paper:    { fade: 0.92, h: 4.0, tone: 0.075, trans: 0.26, hFloor: 0.86 },
  /* 원경 병풍은 '안개 너머로 읽히던 배경'이라 잠금을 덜 한다(예전 상단 안개 걷기와 같은 몫). */
  backdrop: { fade: 0.42, h: 14.0, tone: 0.030, trans: 0.14, hFloor: 1.00 },
  /* v0.49: 주인공(거리 0)과 원 안 적은 100% 선명, 원 밖 적은 먹안개 실루엣으로 잠김 */
  figure:   { fade: 0.62, h: 1.4, tone: 0.035, trans: 0.12, hFloor: 0.68 },
  spirit:   { fade: 0.00, h: 1.0, tone: 0.020, trans: 0.09 },  // 혼령 — 조준 표적이므로 안개 면제
  item:     { fade: 0.35, h: 1.3, tone: 0.030, trans: 0.10, hFloor: 0.80 }
};

/* ---------------------------------------------------------------------------------------------
   랩 라이팅 — 릿 재질의 명암 경계를 부드럽게 만든다(플라스틱 하이라이트 같은 터미네이터 제거).
   three r170 조명 청크의 `dotNL` 한 줄을 "재질이 CARD_WRAP 을 정의했을 때만" 감싸도록 바꾼다.
   스톡 문자열이 다르면(버전 업그레이드) 경고만 남기고 그대로 둔다 — 안전 폴백. */
const DOTNL_STOCK = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tvec3 irradiance = dotNL * directLight.color;';
let _wrapInstalled = null;
function installWrapChunk() {
  if (_wrapInstalled !== null) return _wrapInstalled;
  _wrapInstalled = false;
  try {
    /* 확산항에만 랩을 더한다 — dotNL 자체를 바꾸면 스페큘러까지 넓어져 등불 아래가 하얗게 타 버린다. */
    const repl = DOTNL_STOCK + '\n#if defined( CARD_WRAP )\n\treflectedLight.directDiffuse += ( saturate( ( dotNL + CARD_WRAP ) / ( 1.0 + CARD_WRAP ) ) - dotNL ) * directLight.color * BRDF_Lambert( material.diffuseColor );\n#endif';
    let ok = 0;
    ['lights_physical_pars_fragment', 'lights_lambert_pars_fragment', 'lights_toon_pars_fragment'].forEach(function (k) {
      const src = THREE.ShaderChunk[k];
      if (typeof src !== 'string' || src.indexOf(DOTNL_STOCK) < 0) return;
      THREE.ShaderChunk[k] = src.replace(DOTNL_STOCK, repl);
      ok++;
    });
    _wrapInstalled = ok > 0;
    if (!ok && typeof console !== 'undefined') console.warn('[cardstock] 릿 청크 모양이 바뀌어 랩 라이팅을 건너뜁니다(스톡 유지)');
  } catch (e) {
    _wrapInstalled = false;
  }
  return _wrapInstalled;
}
installWrapChunk();

const _tintCache = new Map();
function tintColor(hex) {
  let c = _tintCache.get(hex);
  if (!c) { c = new THREE.Color(hex); _tintCache.set(hex, c); }
  return c;
}

const VERT_PARS = /* glsl */`
varying vec3 vCardW;
varying vec3 vCardN;
varying float vCardSheet;
varying float vCardUp;
uniform vec2 uCardUpK;
float cardHashV( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
`;

const VERT_MAIN = /* glsl */`
{
  vec4 cardP = vec4( transformed, 1.0 );
  vec3 cardO = modelMatrix[ 3 ].xyz;
  #ifdef USE_INSTANCING
    cardP = instanceMatrix * cardP;
    cardO += instanceMatrix[ 3 ].xyz;
  #endif
  cardP = modelMatrix * cardP;
  vCardW = cardP.xyz;
  #ifdef CARD_NORMAL
    vCardN = normalize( mat3( modelMatrix ) * objectNormal );
  #else
    vCardN = vec3( 0.0, 1.0, 0.0 );
  #endif
  vCardSheet = cardHashV( cardO.xz * 1.13 + cardO.y * 2.71 );
  vCardUp = clamp( position.y * uCardUpK.x + uCardUpK.y, 0.0, 1.0 );
}
`;

const FRAG_PARS = /* glsl */`
uniform vec3 uWfHero;
uniform vec4 uWfRange;
uniform vec4 uWfAmt;
uniform vec3 uWfColor;
uniform vec3 uWfPro;   /* x = 안개 세기, y = 실루엣 유지 높이, z = 높은 곳에서 남기는 세기 */
uniform vec3 uWfDirK;
uniform float uWfDbg;
uniform float uCardTone;
uniform float uCardTrans;
uniform vec3 uCardTint;
varying vec3 vCardW;
varying vec3 vCardN;
varying float vCardSheet;
varying float vCardUp;
/* 영웅에서의 월드 거리로 먹에 잠긴다. 높은 물체는 fade 를 1/4 로 줄여 실루엣을 남긴다. */
float cardFade( vec3 p ) {
  if ( uWfAmt.w < 0.5 || uWfPro.x < 0.01 ) return 0.0;
  vec2 rel = p.xz - uWfHero.xz;
  vec2 fw = uWfDirK.xy;
  vec2 rt = vec2( fw.y, - fw.x );
  float d = length( vec2( dot( rel, rt ), dot( rel, fw ) * uWfDirK.z ) );
  float near = smoothstep( uWfRange.x, uWfRange.y, d ) * uWfAmt.x;
  float far = smoothstep( uWfRange.y, max( uWfRange.z, uWfRange.y + 0.1 ), d ) * max( 0.0, uWfAmt.y - uWfAmt.x );
  float hgt = smoothstep( 0.25, max( 0.32, uWfPro.y ), max( 0.0, p.y ) );
  return clamp( near + far, 0.0, 1.0 ) * uWfPro.x * mix( 1.0, uWfPro.z, hgt );
}
`;

const FRAG_TONE = /* glsl */`
{
  float cardTv = ( vCardSheet - 0.5 ) * 2.0 * uCardTone;
  diffuseColor.rgb *= vec3( 1.0 + cardTv * 1.06, 1.0 + cardTv * 0.97, 1.0 + cardTv * 0.85 );
}
`;

const FRAG_LIGHT = /* glsl */`
{
  #ifdef CARD_NORMAL
    /* 얇은 종이는 뒤에서 비치면 따뜻하게 빛난다. 키광 방향(달빛) 반대를 향한 면이 그렇다. */
    float cardBl = clamp( -dot( normalize( vCardN ), vec3( -0.53, 0.82, 0.30 ) ), 0.0, 1.0 );
    outgoingLight += diffuseColor.rgb * uCardTrans * cardBl * uCardTint;
  #else
    /* 그림 빌보드: 노멀이 없으므로 위쪽 은은한 역광 + 아래쪽 살짝 어두움으로만 종이를 흉내낸다. */
    float cardGrad = smoothstep( 0.0, 1.0, vCardUp );
    outgoingLight *= mix( 0.90, 1.0, cardGrad );
    outgoingLight += diffuseColor.rgb * uCardTrans * smoothstep( 0.55, 1.0, vCardUp ) * uCardTint;
  #endif
}
`;

const FRAG_FADE = /* glsl */`
{
  if ( uWfDbg > 0.5 ) {
    /* 진단: R = 영웅에서의 거리/20m, G = 이 픽셀의 안개 세기 */
    gl_FragColor = vec4( clamp( length( vCardW.xz - uWfHero.xz ) / 20.0, 0.0, 1.0 ), cardFade( vCardW ), 0.0, 1.0 );
  } else {
    float cardF = cardFade( vCardW );
    if ( cardF > 0.001 ) gl_FragColor.rgb = mix( gl_FragColor.rgb, uWfColor, cardF );
  }
}
`;

function profileOf(kind) { return PROFILE[kind] || PROFILE.prop; }

function makeUniforms(kind, opt) {
  const P = profileOf(kind);
  const fade = opt && opt.fade != null ? opt.fade : P.fade;
  const h = opt && opt.height != null ? opt.height : P.h;
  return {
    uWfHero: WF.uWfHero, uWfRange: WF.uWfRange, uWfAmt: WF.uWfAmt, uWfColor: WF.uWfColor, uWfDbg: WF.uWfDbg, uWfDirK: WF.uWfDirK,
    uWfPro: { value: new THREE.Vector3(fade, h, opt && opt.hFloor != null ? opt.hFloor : (P.hFloor != null ? P.hFloor : 0.45)) },
    uCardTone: { value: opt && opt.tone != null ? opt.tone : P.tone },
    uCardTrans: { value: opt && opt.trans != null ? opt.trans : P.trans },
    uCardTint: { value: tintColor(opt && opt.tint ? opt.tint : '#ffb070') },
    uCardUpK: { value: new THREE.Vector2(opt && opt.upK != null ? opt.upK : 1, opt && opt.upC != null ? opt.upC : 0.5) }
  };
}

/** 재질 하나를 패치한다(이미 패치했으면 그대로). lit/basic/sprite 를 각각 알맞게 다룬다. */
function patchMaterial(mat, kind, opt) {
  if (!mat || mat.userData.cardKind) return false;
  if (mat.isShaderMaterial || mat.isRawShaderMaterial) return false;   // 손으로 쓴 셰이더는 건드리지 않는다
  const isSprite = !!(mat.isSpriteMaterial);
  const isLit = !!(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial);
  if (!isSprite && !isLit && !mat.isMeshBasicMaterial) return false;
  const u = makeUniforms(kind, opt);
  /* 오브젝트가 자기 카드 높이·피벗을 알려 주면 종이 그라데이션이 카드 전체에 고르게 걸린다. */
  if (mat.userData && mat.userData.cardUpK) {
    u.uCardUpK.value.set(mat.userData.cardUpK, mat.userData.cardUpC != null ? mat.userData.cardUpC : 0.5);
  }
  const defines = { CARD_WF: 1 };
  if (isLit) { defines.CARD_NORMAL = 1; defines.CARD_WRAP = '0.34'; }
  if (opt && opt.upK) { u.uCardUpK.value.set(opt.upK, opt.upC != null ? opt.upC : 0.5); }
  mat.defines = Object.assign({}, mat.defines, defines);
  const prevCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = function (shader, renderer) {
    if (prevCompile && prevCompile !== THREE.Material.prototype.onBeforeCompile) prevCompile(shader, renderer);
    Object.assign(shader.uniforms, u);
    if (isSprite) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <fog_vertex>', /* glsl */`
          vCardW = modelMatrix[ 3 ].xyz;
          vCardSheet = cardHashV( vCardW.xz * 1.13 + vCardW.y * 2.71 );
          vCardUp = clamp( position.y + 0.5, 0.0, 1.0 );
          vCardN = vec3( 0.0, 1.0, 0.0 );
          #include <fog_vertex>`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_TONE)
        .replace('#include <opaque_fragment>', FRAG_LIGHT + '\n\t#include <opaque_fragment>')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + FRAG_FADE);
    } else {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_TONE)
        .replace('#include <opaque_fragment>', FRAG_LIGHT + '\n\t#include <opaque_fragment>')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + FRAG_FADE);
    }
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.customProgramCacheKey = function () {
    return 'card|' + kind + '|' + (isSprite ? 's' : isLit ? 'l' : 'b') + '|' + (prevKey ? prevKey() : '');
  };
  mat.userData.cardKind = kind;
  mat.needsUpdate = true;
  return true;
}

let _painted = 0;
let _off = null;
function paintOne(mat, kind, opt) {
  if (!mat) return;
  if (Array.isArray(mat)) { mat.forEach(function (m) { paintOne(m, kind, opt); }); return; }
  /* 재질이 태어날 때 스스로 정한 프로필(예: 원경 병풍은 backdrop)이 있으면 그것을 따른다. */
  const k = (mat.userData && mat.userData.cardProfile) || kind;
  if (mat.userData && mat.userData.cardSkip) return;
  if (patchMaterial(mat, k, opt)) _painted++;
}

/** 루트 아래 모든 재질을 패치한다(이미 패치된 재질은 건너뛴다). kind = PROFILE 키. */
export function paint(root, kind, opt) {
  if (!root) return 0;
  if (_off === null) {
    try { _off = (typeof location !== 'undefined') && new URLSearchParams(location.search).has('nocard'); } catch (e) { _off = false; }
  }
  if (_off) return 0;   /* QA: ?nocard=1 — 패치 이전 상태와 A/B */
  if (root.isMaterial) { const before = _painted; paintOne(root, kind, opt); return _painted - before; }
  let before = _painted;
  if (root.traverse) root.traverse(function (o) { if (o.material) paintOne(o.material, kind, opt); });
  else if (root.material) paintOne(root.material, kind, opt);
  return _painted - before;
}

/** 매 프레임: 영웅 위치·링 반경·안개색. 할당 없음. */
export function updateFade(hero, ringRadius, pulse, sightRadius, fogHex, enabled, fwdX, fwdZ) {
  if (!hero) return;
  const R = Math.max(1.2, ringRadius || 6);
  if (fwdX != null && fwdZ != null) {
    const l = Math.hypot(fwdX, fwdZ) || 1;
    WF.uWfDirK.value.set(fwdX / l, fwdZ / l, WF.uWfDirK.value.z);
  }
  const range = WF.uWfRange.value;
  /* CFG.fogInner(0.86)/fogOuter(1.16) 을 그대로 쓰되, 월드 원이 화면 타원보다 넓게 보이는 만큼
     안쪽을 조금 당겨 예전 '밝은 못'의 크기를 맞춘다. */
  range.x = R * 0.80 * (1 - 0.07 * (pulse || 0));
  range.y = R * 1.08;
  range.z = Math.max(range.y + 0.5, (sightRadius || 12.5) * 1.25);
  range.w = pulse || 0;
  WF.uWfHero.value.set(hero.x, 0, hero.z);
  WF.uWfAmt.value.w = enabled === false ? 0 : 1;
  if (fogHex != null) {
    // CSS hex 이면 팔레트 규칙대로 장면 안 색으로 되돌린다(후처리를 통과한 뒤 그 색으로 보이게).
    if (typeof fogHex === 'string') {
      const c = _fogTone(fogHex);
      WF.uWfColor.value.setRGB(c[0], c[1], c[2]);
    } else if (fogHex.length >= 3) {
      // [r,g,b] 0~255 (스테이지 atmo.fogCol) — 후처리 앞이라 그대로 linear 로 눌러 넣는다
      WF.uWfColor.value.setRGB(Math.pow(fogHex[0] / 255, 2.2) * 0.9, Math.pow(fogHex[1] / 255, 2.2) * 0.9, Math.pow(fogHex[2] / 255, 2.2) * 0.9);
    }
  }
}

const _fogCache = new Map();
function _fogTone(hex) {
  let v = _fogCache.get(hex);
  if (!v) {
    const h = String(hex).replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    const lin = function (c) { return c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    v = [lin(r) * 0.9, lin(g) * 0.9, lin(b) * 0.9];
    _fogCache.set(hex, v);
  }
  return v;
}

export function stats() { return { painted: _painted, wrap: _wrapInstalled, kinds: Object.keys(PROFILE) }; }
