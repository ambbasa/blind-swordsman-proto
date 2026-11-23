import { paintDrop } from './fieldart.js';
/* Atlas-driven art. Reads ../assets/v2/atlas.json (or window.ART_V2_ATLAS / GP_V2_ATLAS).
 * Never writes into assets/v2. Sizes, anchors, bell centers, flameOffset, palette come from the atlas. */
import * as Anim from './anim.js';
import { buildStage3D } from './inkprops3d.js';
import { drawInkBossSheet } from './inkboss.js';
import { drawHeroSheets, drawZombieSheets, drawZombieVariantSheets, drawSpiritSheet } from './inkchars.js';
import { SPIRIT_GLYPH_PATHS, drawRattle, drawItem, drawSeal, drawUpgrade } from './inkicons.js';
import { loadPixelPack, PIXEL_LOOK } from './pixellook.js';
import { buildFigure, tickFigure, kick as rigKick, slashPose as rigSlash, setOpacity as rigOpacity, setTint as rigTint,
  setAuraColor as rigAuraColor, setOrder as rigOrder, setCamera as rigSetCamera, ready as rigReady,
  debugPose as rigDebugPose, actsOf as rigActsOf } from './inkchars3d.js';
/* v0.45: 주인공만 3D 관절 뼈대 + 수묵 툰 셰이더 캐릭터(inkhero3d.js)로 교체한다. */
import * as HERO3D from './inkhero3d.js?v=v080';
/* v0.46: 원귀·거한·돌덩이·보스도 주인공과 같은 3D 관절 뼈대(단일 SkinnedMesh)로 세운다. */
import * as MON3D from './inkmonsters3d.js?v=v080';
let QA_HERO2D = false;
try { QA_HERO2D = new URLSearchParams(location.search).has('hero2d'); } catch (e) {}
let QA_MON2D = false;
try { QA_MON2D = new URLSearchParams(location.search).has('mon2d'); } catch (e) {}

const BASE = '../assets/v2/';
let QA_NORIG = false;
try { QA_NORIG = new URLSearchParams(location.search).has('norig') || PIXEL_LOOK; } catch (e) {}
const ITEM_KEY = {
  ice: 'elem-ice', fire: 'elem-fire', poison: 'elem-poison', bell: 'one-bell',
  'elem-ice': 'elem-ice', 'elem-fire': 'elem-fire', 'elem-poison': 'elem-poison', 'one-bell': 'one-bell',
  dashplus: 'dash-plus', 'dash-plus': 'dash-plus', heal: 'heal', coin: 'coin', xp: 'xp-orb', 'xp-orb': 'xp-orb',
  /* 묵항아리 3종 픽업 */
  herb: 'herb', magnet: 'magnet', bang: 'bang',
  /* 정예 원귀의 부적 상자 */
  charm: 'charm'
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c: c, g: c.getContext('2d') };
}

export async function loadAtlas() {
  if (window.GP_V2_ATLAS) return window.GP_V2_ATLAS;
  if (window.ART_V2_ATLAS) return window.ART_V2_ATLAS;
  const res = await fetch(BASE + 'atlas.json');
  if (!res.ok) throw new Error('atlas.json ' + res.status);
  const j = await res.json();
  window.ART_V2_ATLAS = j;
  return j;
}

function metersPerTile(atlas) {
  const tiles = atlas.tiles || {};
  const t = tiles.courtyard || tiles[Object.keys(tiles)[0]];
  const w = t && t.worldSize;
  const m = typeof w === 'string' && w.match(/([0-9.]+)\s*x/);
  return m ? parseFloat(m[1]) : 4;
}

function hexColor(s, fb) {
  if (!s) return fb || 0x1e1c1a;
  return parseInt(String(s).replace('#', ''), 16);
}

export async function buildArt(THREE) {
  const atlas = await loadAtlas();
  /* 픽셀 룩 미리보기(?look=pixel): ink-studio 로 구운 시트. 없으면 코드 드로잉 시트를 그대로 쓴다. */
  const pixelPack = await loadPixelPack(BASE);
  const pal = atlas.palette || {};
  const cache = new Map();
  const sharedUrls = [];
  let currentMapId = 'map1';
  function torchGlowUrl(id) {
    return 'fx-ink/atmo/torch-glow-' + (id || currentMapId || 'map1') + '.png';
  }
  function torchGlowTex(id) {
    return tex(torchGlowUrl(id)) || tex('fx/torch-glow.png');
  }

  function loadOne(url, opt) {
    opt = opt || {};
    return new Promise(function (res) {
      const l = new THREE.TextureLoader();
      l.load(((opt && opt.noBase) ? url : (BASE + url)), function (t) {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
        t.needsUpdate = true;
        res(t);
      }, undefined, function () { res(null); });
    });
  }
  function acquire(url, opt) {
    if (!url) return Promise.resolve(null);
    const hit = cache.get(url);
    if (hit) {
      const p = hit.tex ? Promise.resolve(hit.tex) : hit.pending;
      hit.refs++;
      return p;
    }
    const rec = { tex: null, refs: 1, pending: loadOne(url, opt) };
    cache.set(url, rec);
    rec.pending.then(function (t) { rec.tex = t; rec.pending = null; });
    return rec.pending;
  }
  function release(url) {
    const hit = cache.get(url);
    if (!hit) return;
    hit.refs--;
    if (hit.refs <= 0) {
      if (hit.tex && hit.tex.dispose) hit.tex.dispose();
      cache.delete(url);
    }
  }
  function cloneTex(src) {
    if (!src) return null;
    const t = src.clone();
    t.needsUpdate = true;
    return t;
  }

  function parsePxPerMeter() {
    const sc = (atlas.heroAnim && atlas.heroAnim.scale) || (atlas.zombieAnim && atlas.zombieAnim.scale) || '';
    const m = String(sc).match(/([0-9.]+)\s*px/);
    return m ? parseFloat(m[1]) : 118.5;
  }
  const pxPerMeter = parsePxPerMeter();
  const unit = metersPerTile(atlas) / 1024;
  const heroH = (atlas.heroAnim && atlas.heroAnim.cell && atlas.heroAnim.cell[1])
    ? atlas.heroAnim.cell[1] / pxPerMeter
    : ((atlas.hero && atlas.hero.frame && atlas.hero.frame[1]) || 512) * unit;
  const zombieH = (atlas.zombieAnim && atlas.zombieAnim.cell && atlas.zombieAnim.cell[1])
    ? atlas.zombieAnim.cell[1] / pxPerMeter
    : heroH * 0.92;
  const spiritH = (atlas.spiritAnim && atlas.spiritAnim.cell && atlas.spiritAnim.cell[1])
    ? atlas.spiritAnim.cell[1] / pxPerMeter
    : heroH * 1.05;
  /* Spirits are small will-o'-wisps over zombies; the shape mark is baked into the orb, a rattle at the side. */
  /* Outline [scale, opacity] per kind, and the spirits' jade tint (HDR so they bloom). */
  const CHAR_OUTLINE = { hero: [1.07, 0.26], zombie: [1.1, 0.85], spirit: [1.12, 0.7] };
  /* 2막부터 주인공이 검은 무사복을 입어, 검은 실루엣 대신 한지빛 테두리를 둔다 — 어두운 바닥에서도 또렷하다. */
  const HERO_RIM = 0xa89a80;
  const SPIRIT_TINT = [0.65, 1.18, 0.98];
  const SPIRIT_VIEW_SCALE = 1.45;
  /* 0.26: the orb anchor box in world units (~57% of the orb's diameter). game.js measures the
     spirit's screen centre and foot point from it. */
  const SPIRIT_MARK_K = 0.26;
  const SPIRIT_RATTLE_K = 0.34;
  let rattleTexCache = null;
  function rattleTex() {
    if (!rattleTexCache) { rattleTexCache = new THREE.CanvasTexture(drawRattle()); rattleTexCache.colorSpace = THREE.SRGBColorSpace; }
    return rattleTexCache;
  }
  /* ------------------------------------------------------------------
     혼령 구슬에 직접 각인하는 먹획 — "영혼 빛에 스며든 먹획".
     혼령은 3D 스프라이트(구슬 중심 = 셀 px 128,128, 반지름 58)라서, 기호를
     2D HUD에 따로 얹으면 먹안개 위에 떠 보인다. 그래서 기호를 혼령 시트
     텍스처의 모든 프레임에 먹으로 구워 넣는다. 원근·안개·투명도·비취 색조·
     블룸이 혼령 본체와 똑같이 적용되고, 획은 구슬 빛에 승산(multiply)되어
     뾰족한 중심 없이 스며든다.
     ------------------------------------------------------------------ */
  const SPIRIT_ORB = { x: 128, y: 128, r: 58 };
  const SPIRIT_GLYPH_K = 0.75;   /* 축소된 구슬에서도 붓획을 읽을 수 있게 한다. */

  /* 프레임마다 마른 붓 결이 조금씩 달라지도록 고정 시드 난수를 쓴다. */
  function inkSeed(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }
  function resampleStroke(pts, n) {
    const seg = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      seg.push(d); total += d;
    }
    const out = [];
    for (let k = 0; k <= n; k++) {
      const want = total * k / n;
      let acc = 0;
      for (let i = 0; i < seg.length; i++) {
        if (acc + seg[i] >= want || i === seg.length - 1) {
          const t = seg[i] ? (want - acc) / seg[i] : 0;
          out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
          break;
        }
        acc += seg[i];
      }
    }
    return out;
  }
  /* 붓 획: 가운데가 굵고 양끝이 가는 압력 변화, 삐죽한 붓끝, 가장자리의 마른 붓 결. */
  function inkBrush(ctx, pts, w, colors, rnd) {
    const dense = resampleStroke(pts, 24);
    const passes = [
      { k: 1.20, c: colors.soft, j: w * 0.12, a: 0.5 },
      { k: 1.0, c: colors.core, j: w * 0.05, a: 1 },
      { k: 0.46, c: colors.deep, j: w * 0.02, a: 0.9 }
    ];
    passes.forEach(function (p) {
      const jitter = (rnd() - 0.5) * p.j;
      ctx.globalAlpha = p.a;
      for (let i = 0; i < dense.length - 1; i++) {
        const u = (i + 0.5) / (dense.length - 1);
        const prof = 0.5 + 0.66 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0.001, u))), 0.5);
        const a = dense[i], b = dense[i + 1];
        const nx = -(b[1] - a[1]), ny = (b[0] - a[0]);
        const nl = Math.hypot(nx, ny) || 1;
        const ox = nx / nl * jitter, oy = ny / nl * jitter;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(0.9, w * p.k * prof);
        ctx.strokeStyle = p.c;
        ctx.beginPath(); ctx.moveTo(a[0] + ox, a[1] + oy); ctx.lineTo(b[0] + ox, b[1] + oy); ctx.stroke();
      }
    });
    for (let i = 0; i < 10; i++) {
      const idx = Math.min(dense.length - 2, Math.floor(rnd() * (dense.length - 1)));
      const a = dense[idx];
      const ang = rnd() * Math.PI * 2, len = w * (0.15 + rnd() * 0.4);
      ctx.strokeStyle = colors.deep;
      ctx.lineWidth = Math.max(0.8, w * 0.12);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len);
      ctx.stroke();
    }
  }
  /* 획 굵기까지 포함한 기호 외곽이 정확히 box가 되도록 좌표를 편다. */
  function glyphInkBox(shape, cx, cy, box) {
    const path = SPIRIT_GLYPH_PATHS[shape];
    if (!path) return null;
    let mnx = 9, mxx = -9, mny = 9, mxy = -9;
    path.forEach(function (line) {
      line.forEach(function (q) {
        if (q[0] < mnx) mnx = q[0]; if (q[0] > mxx) mxx = q[0];
        if (q[1] < mny) mny = q[1]; if (q[1] > mxy) mxy = q[1];
      });
    });
    const ox = (mnx + mxx) * 0.5, oy = (mny + mxy) * 0.5;
    const w = box * 0.19;
    const half = Math.max(1, (box - w) * 0.5);
    return {
      width: w,
      lines: path.map(function (line) {
        return line.map(function (q) { return [cx + (q[0] - ox) * half, cy + (q[1] - oy) * half]; });
      })
    };
  }
  /* 영혼빛을 넓게 깔고, 먹을 반투명하게 승산해 획의 뾰족한 중심 없이 혼령 빛에 스며들게 한다. */
  function paintSpiritInk(ctx, shape, cx, cy, box, rnd) {
    const G = glyphInkBox(shape, cx, cy, box);
    if (!G) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    G.lines.forEach(function (p) {
      inkBrush(ctx, p, G.width, { soft: 'rgba(110,118,112,0.5)', core: 'rgba(27,37,32,0.96)', deep: 'rgba(16,23,21,1)' }, rnd);
    });
    ctx.restore();
  }
  const spiritInkCache = {};
  /* 혼령 시트의 모든 프레임 셀에 같은 자리(구슬 중심)로 먹을 각인한 텍스처. */
  function spiritInkTex(sheet, shape) {
    const src = sheet && sheet.tex && sheet.tex.image;
    if (!src || !SPIRIT_GLYPH_PATHS[shape]) return null;
    if (spiritInkCache[shape]) return spiritInkCache[shape];
    const cell = (sheet.frame && sheet.frame[0]) || 256;
    const frames = Math.max(1, sheet.count || Math.round(src.width / cell));
    /* 기기의 최대 텍스처(4096)를 넘지 않는 선에서 2배 슈퍼샘플. */
    const ss = Math.min(2, 4096 / src.width);
    const out = document.createElement('canvas');
    out.width = Math.round(src.width * ss); out.height = Math.round(src.height * ss);
    const g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, out.width, out.height);
    const box = SPIRIT_ORB.r * 2 * SPIRIT_GLYPH_K * ss;
    for (let f = 0; f < frames; f++) {
      paintSpiritInk(g, shape, (f * cell + SPIRIT_ORB.x) * ss, SPIRIT_ORB.y * ss, box, inkSeed(shape + '|' + f));
    }
    const t = new THREE.CanvasTexture(out);
    t.colorSpace = THREE.SRGBColorSpace;
    /* 밉맵으로 줄이면 22px 혼령에서 1~2px 획이 뭉개져 먹이 사라진다 → 선형 필터로 또렷하게 유지. */
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 1;
    spiritInkCache[shape] = t;
    return t;
  }
  function applySpiritInk(group, sheet, worldH, shape) {
    const spr = group && group.userData && group.userData.sprite;
    if (!spr || !spr.material || !sheet || !worldH) return;
    const baked = spiritInkTex(sheet, shape);
    if (!baked) return;
    const t = cloneTex(baked);
    applyUV(t, sheet, 0, 0);
    const prev = spr.material.map;
    spr.material.map = t;
    spr.material.needsUpdate = true;
    if (prev && prev !== t && prev.dispose) prev.dispose();
    group.userData.markSheet = sheet;
    group.userData.markWorldH = worldH;
  }
  /* 구슬 중심(cell px 128,128)에 먹획을 각인하고, 옆에 무당 방울을 매단다. */
  function attachSpiritMark(group, sheet, worldH, shape) {
    const c = localFromPx(sheet, worldH, [128, 128]);
    applySpiritInk(group, sheet, worldH, shape);
    const rh = worldH * SPIRIT_RATTLE_K;
    const rt = imgSprite(rattleTex(), rh * (96 / 168), rh, { cx: 0.5, cy: 1, alphaTest: 0.02 });
    rt.material.depthTest = false;
    rt.renderOrder = 4;
    const at = localFromPx(sheet, worldH, [214, 92]);
    rt.position.set(at.x, at.y, 0.04);
    group.add(rt);
    group.userData.rattle = { sprite: rt, t: Math.random() * 4, amp: 0.22, period: 1.3 + Math.random() * 0.3 };
    const size = worldH * SPIRIT_MARK_K;
    group.userData.bellH = size;
    group.userData.bellAttachY = c.y + size / 2;
    group.userData.bellFootY = c.y - size / 2;
    group.userData.bellLocal = { x: c.x, y: c.y };
    group.userData.markShape = shape;
  }
  const bossH = (atlas.bossAnim && atlas.bossAnim.cell && atlas.bossAnim.cell[1])
    ? atlas.bossAnim.cell[1] / pxPerMeter
    : heroH * 1.7;

  const need = [];
  function want(url, opt) { if (url && sharedUrls.indexOf(url) < 0) { need.push({ url: url, opt: opt || {} }); sharedUrls.push(url); } }
  function sheetFile(s) { return s && (s.file || s.file1x); }
  /* Prefer @1x for large 8-dir action sheets so headless SW GL stays interactive. */
  function animFile(s) { return s && (s.file1x || s.file); }
  if (atlas.fx) {
    if (atlas.fx['slash-line']) want(atlas.fx['slash-line'].file);
    if (atlas.fx['slash-arc-sheet']) want(atlas.fx['slash-arc-sheet'].file);
    if (atlas.fx['ink-stroke']) want(atlas.fx['ink-stroke'].file);
    if (atlas.fx['ink-stroke-lit']) want(atlas.fx['ink-stroke-lit'].file);
    if (atlas.fx['ink-dab']) want(atlas.fx['ink-dab'].file);
    if (atlas.fx['ink-splat']) want(atlas.fx['ink-splat'].file);
  }
  const el = atlas.elements || {};
  if (el['fire-trail']) want(el['fire-trail'].file);
  if (el['ice-shatter']) want(sheetFile(el['ice-shatter']));
  if (el['poison-burst']) want(sheetFile(el['poison-burst']));
  if (el['slash-line'] && el['slash-line'].files) {
    Object.keys(el['slash-line'].files).forEach(function (k) { want(el['slash-line'].files[k]); });
  }
  want('fx/torch-glow.png');
  ['map1', 'map2', 'map3', 'map5', 'map6', 'map7', 'map8', 'map9', 'map10', 'map11', 'map12'].forEach(function (id) { want('fx-ink/atmo/torch-glow-' + id + '.png'); });
  want('fx/spirit-glow.png');
  want('fx/shadow.png');
  if (atlas.fog) {
    if (atlas.fog['fog-0']) want(atlas.fog['fog-0'].file, { repeat: true });
    if (atlas.fog['fog-1']) want(atlas.fog['fog-1'].file, { repeat: true });
  }
  if (atlas.onebell) {
    (atlas.onebell.inkFrames || []).forEach(function (f) { want(f); });
    (atlas.onebell.paperFrames || []).forEach(function (f) { want(f); });
    if (atlas.onebell.burst) want(String(atlas.onebell.burst).split(' ')[0]);
    if (atlas.onebell.aura) want(String(atlas.onebell.aura).split(' ')[0]);
  }
  if (atlas.bg && atlas.bg.paper) want(String(atlas.bg.paper).split(' ')[0]);

  await Promise.all(need.map(function (n) { return acquire(n.url, n.opt); }));
  function tex(url) { const h = cache.get(url); return h && h.tex; }

  function applyUV(t, sheet, frame, dir) {
    const uv = Anim.frameUV(sheet, frame || 0, dir || 0);
    t.repeat.set(uv.repeatX, uv.repeatY);
    t.offset.set(uv.offsetX, uv.offsetY);
    return uv;
  }
  function sheetSprite(sheet, src, worldH, opt) {
    opt = opt || {};
    const t = cloneTex(src);
    applyUV(t, sheet, opt.frame || 0, opt.dir || 0);
    const mat = new THREE.SpriteMaterial({
      map: t, transparent: true, depthWrite: false, depthTest: opt.depthTest !== false,
      alphaTest: opt.alphaTest != null ? opt.alphaTest : 0.05,
      blending: opt.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      opacity: opt.opacity != null ? opt.opacity : 1
    });
    const s = new THREE.Sprite(mat);
    if (opt.renderOrder != null) s.renderOrder = opt.renderOrder;
    if (opt.depthTest === false) s.renderOrder = opt.renderOrder != null ? opt.renderOrder : 2;
    const fw = (sheet.frame && sheet.frame[0]) || (src && src.image && src.image.width) || 256;
    const fh = (sheet.frame && sheet.frame[1]) || (src && src.image && src.image.height) || 256;
    const H = worldH || fh * unit;
    s.scale.set(H * (fw / fh), H, 1);
    const anc = sheet.anchor || [fw / 2, fh];
    s.center.set(anc[0] / fw, 1 - anc[1] / fh);
    s.userData.sheet = sheet;
    return s;
  }
  function imgSprite(map, w, h, opt) {
    opt = opt || {};
    const mat = new THREE.SpriteMaterial({
      map: map, transparent: true, depthWrite: false, alphaTest: opt.alphaTest != null ? opt.alphaTest : 0.05,
      blending: opt.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      opacity: opt.opacity != null ? opt.opacity : 1
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(w, h, 1);
    s.center.set(opt.cx != null ? opt.cx : 0.5, opt.cy != null ? opt.cy : 0);
    return s;
  }
  function addShadow(group, width) {
    const shTex = tex('fx/shadow.png');
    if (!shTex) return;
    const sh = imgSprite(shTex, width || 1.4, (width || 1.4) * 96 / 256, { cy: 0.5, opacity: 0.65 });
    sh.position.y = 0.02;
    group.add(sh);
  }
  function addRim(group, hex, scale) {
    const spr = group.userData && group.userData.sprite;
    if (!spr || !spr.material) return;
    const mat = new THREE.SpriteMaterial({
      map: spr.material.map, color: hex || 0x3ec8c0,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, opacity: 0.42
    });
    const rim = new THREE.Sprite(mat);
    const sx = Math.abs(spr.scale.x), sy = Math.abs(spr.scale.y);
    const k = scale || 1.12;
    rim.scale.set(sx * k, sy * k, 1);
    rim.center.copy(spr.center);
    rim.renderOrder = 1;
    rim.position.z = -0.03;
    group.add(rim);
    group.userData.rim = rim;
    group.userData.rimHex = hex || 0x3ec8c0;
    group.userData.rimOp = mat.opacity;
  }
  function addTelegraph(group, worldH) {
    const glow = tex('fx/spirit-glow.png') || tex('fx/torch-glow.png');
    if (!glow) return;
    const eye = imgSprite(glow, 0.85, 0.55, { cy: 0.5, add: true, opacity: 0 });
    eye.position.y = (worldH || 2) * 0.78;
    eye.position.z = 0.04;
    eye.visible = false;
    eye.material.color = new THREE.Color(0xc8281e);
    eye.material.depthTest = false;
    eye.renderOrder = 5;
    group.add(eye);
    group.userData.tele = eye;
  }
  function setTelegraph(group, on) {
    if (!group || !group.userData) return;
    const tele = group.userData.tele;
    if (tele) {
      tele.visible = !!on;
      if (tele.material) tele.material.opacity = on ? 0.85 : 0;
    }
    const rim = group.userData.rim;
    if (rim && rim.material && rim.material.color) {
      /* Warning red only while close; otherwise the kind's own rim colour (elite gold, variant tints). */
      const ud = group.userData;
      const hex = on ? 0xc8281e : (ud.rimHex != null ? ud.rimHex : 0x3ec8c0);
      const op = on ? 0.7 : (ud.rimOp != null ? ud.rimOp : 0.42);
      /* v0.42 포즈 카드는 테두리 판의 투명도를 매 프레임 다시 계산하므로 리그 쪽으로 넘긴다. */
      if (group.userData.rig && group.userData.rig.kind === 'pose') rigAuraColor(group, hex, op);
      else { rim.material.color.setHex(hex); rim.material.opacity = op; }
    }
    group.userData.teleOn = !!on;
  }
  /* Rim glow and dark outline follow the body sprite's frame, facing and size. */
  function syncRim(group) {
    const spr = group && group.userData && group.userData.sprite;
    if (!spr || !spr.material) return;
    [[group.userData.rim, 1.12], [group.userData.outline, group.userData.outlineK || 1.1]].forEach(function (pair) {
      const o = pair[0];
      if (!o) return;
      if (o.material && spr.material.map) o.material.map = spr.material.map;
      const sx = Math.abs(spr.scale.x), sy = Math.abs(spr.scale.y);
      const sign = spr.scale.x < 0 ? -1 : 1;
      o.scale.set(sign * sx * pair[1], sy * pair[1], 1);
      if (spr.center) o.center.copy(spr.center);
      o.visible = spr.visible;
    });
  }
  /* A dark ink silhouette a little larger than the body, drawn behind it, so pale figures stand off the lit ground. */
  function addOutline(group, k, opacity, color) {
    const spr = group.userData && group.userData.sprite;
    if (!spr || !spr.material) return;
    const mat = new THREE.SpriteMaterial({
      map: spr.material.map, color: color == null ? 0x000000 : color, transparent: true, depthWrite: false, depthTest: false,
      opacity: opacity == null ? 0.85 : opacity, alphaTest: 0.05
    });
    const o = new THREE.Sprite(mat);
    o.center.copy(spr.center);
    o.renderOrder = 1;
    o.position.z = -0.02;
    group.add(o);
    group.userData.outline = o;
    group.userData.outlineK = k || 1.1;
    syncRim(group);
  }
  function localBell(sheet, worldH) {
    const fw = (sheet.frame && sheet.frame[0]) || 512;
    const fh = (sheet.frame && sheet.frame[1]) || 512;
    const anc = sheet.anchor || [fw / 2, fh];
    const bell = sheet.bellCenter || sheet.markCenter;
    if (!bell) return { x: 0, y: worldH * 0.7 };
    return { x: (bell[0] - anc[0]) * (worldH / fh), y: (anc[1] - bell[1]) * (worldH / fh) };
  }


  function localFromPx(sheet, worldH, px) {
    const fw = (sheet.frame && sheet.frame[0]) || (sheet.cell && sheet.cell[0]) || 256;
    const fh = (sheet.frame && sheet.frame[1]) || (sheet.cell && sheet.cell[1]) || 256;
    const anc = sheet.anchor || [fw / 2, fh];
    return { x: (px[0] - anc[0]) * (worldH / fh), y: (anc[1] - px[1]) * (worldH / fh) };
  }
  /* Code-drawn ink characters: each sheet carries its own canvas texture (sheet.tex). */
  let inkCharPack = null;
  function inkChars() {
    if (inkCharPack) return inkCharPack;
    function bake(r, pixelKey) {
      const px = pixelPack && pixelKey && pixelPack[pixelKey];
      if (px && px.frames === r.sheet.count && px.cell === r.sheet.frame[0]) {
        r.sheet.tex = px.tex;
        r.sheet.anchor = px.anchor.slice();
        r.sheet.pixel = true;
        return r.sheet;
      }
      const t = new THREE.CanvasTexture(r.canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      r.sheet.tex = t;
      return r.sheet;
    }
    const h = drawHeroSheets(), z = drawZombieSheets(), v = drawZombieVariantSheets();
    inkCharPack = {
      hero: { actions: { idle: bake(h.idle, 'hero-idle'), dash: bake(h.dash, 'hero-dash') }, afterimage: bake(h.afterimage, 'hero-after') },
      zombie: { actions: { walk: bake(z.walk), frozen: bake(z.frozen), burning: bake(z.burning), poisoned: bake(z.poisoned) } },
      brute: { actions: { walk: bake(v.brute) } },
      stone: { actions: { walk: bake(v.stone) } },
      spirit: bake(drawSpiritSheet(), 'spirit-idle')
    };
    return inkCharPack;
  }
  const ITEM_DRAW = { 'elem-ice': 'ice', 'elem-fire': 'fire', 'elem-poison': 'poison', 'one-bell': 'bell', 'dash-plus': 'dashplus', heal: 'heal', coin: 'coin', 'xp-orb': 'xp', herb: 'herb', magnet: 'magnet', bang: 'bang', charm: 'charm' };
  const inkItemCache = {};
  function inkItemTex(key) {
    if (!inkItemCache[key]) {
      const t = new THREE.CanvasTexture(drawItem(ITEM_DRAW[key] || 'xp'));
      t.colorSpace = THREE.SRGBColorSpace;
      paintDrop(t, ITEM_DRAW[key] || 'xp');
      inkItemCache[key] = t;
    }
    return inkItemCache[key];
  }
  const sealUrls = {};
  function sealUrl(shape) {
    if (!sealUrls[shape]) sealUrls[shape] = drawSeal(shape).toDataURL('image/png');
    return sealUrls[shape];
  }
  /* v0.23: 레벨업 카드 고유 아이콘(카드 UI용 data URL) */
  const itemIconUrls = {};
  function itemIconUrl(key) {
    if (!itemIconUrls[key]) itemIconUrls[key] = drawItem(ITEM_DRAW[key] || 'xp').toDataURL('image/png');
    return itemIconUrls[key];
  }
  const upIconUrls = {};
  function upIconUrl(id) {
    if (!upIconUrls[id]) upIconUrls[id] = drawUpgrade(id).toDataURL('image/png');
    return upIconUrls[id];
  }
  /* v0.45: 잔상(대시 고스트)은 지금 서 있는 주인공을 복제해 만든다 — 같은 뼈대 포즈를 그대로 쓴다. */
  let hero3dSrc = null;
  let inkBossPacks = {};  function clampVar(v) { const n = Math.round(+v || 0); return n < 0 ? 0 : n > 3 ? 3 : n; }
  /* §4.5 보스 개성: 장마다 다른 머리 장신구·무기로 시트를 하나씩 그린다(3막 색조는 재질 틴트).
     네 벌만 만들고 장은 그중 하나를 골라 쓴다 — 모바일 텍스처 메모리를 지킨다. */
  const BOSS_LOOK = [
    { head: 'horns', weapon: 'sword' },   /* 0 — 뿔 둘, 검 (1막 정점 4장) */
    { head: 'kasa', weapon: 'spear' },    /* 1 — 살갓, 장창 (2막 정점 8장) */
    { head: 'crown', weapon: 'staff' },   /* 2 — 관, 지팡이 (3막 정점 12장) */
    { head: 'veil', weapon: 'sword' }     /* 3 — 너저분한 수건, 검 (나머지 장) */
  ];
  function inkBoss(v) {
    const k = clampVar(v);
    if (!inkBossPacks[k]) {
      const r = drawInkBossSheet(BOSS_LOOK[k]);
      const t = new THREE.CanvasTexture(r.canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      inkBossPacks[k] = { tex: t, sheet: r.sheet, eyes: r.eyes };
    }
    return inkBossPacks[k];
  }
  function packTex(sheet) {
    if (sheet && sheet.tex) return sheet.tex;
    return tex(animFile(sheet)) || tex(sheetFile(sheet));
  }
  function swapAction(group, sheet, name) {
    if (!group || !sheet) return;
    const url = animFile(sheet) || sheetFile(sheet);
    const src = sheet.tex || tex(url);
    if (!src) {
      group.userData.pendingAction = name;
      acquire(url).then(function () {
        if (group.userData.pendingAction === name) swapAction(group, sheet, name);
      });
      return;
    }
    const spr = group.userData.sprite;
    if (!spr || !spr.material) return;
    const prev = spr.material.map;
    const t = cloneTex(src);
    const dir = (group.userData.anim && group.userData.anim.dir) || 0;
    applyUV(t, sheet, 0, dir);
    t.needsUpdate = true;
    spr.material.map = t;
    spr.material.opacity = 1;
    spr.visible = true;
    if (prev && prev !== src && prev !== t && prev.dispose) {
      setTimeout(function () { try { prev.dispose(); } catch (e) {} }, 0);
    }
    const worldH = group.userData.worldH;
    if (worldH) {
      const fw = (sheet.frame && sheet.frame[0]) || 256;
      const fh = (sheet.frame && sheet.frame[1]) || 256;
      const sign = spr.scale.x < 0 ? -1 : 1;
      spr.scale.set(sign * worldH * (fw / fh), worldH, 1);
      const anc = sheet.anchor || [fw / 2, fh];
      spr.center.set(anc[0] / fw, 1 - anc[1] / fh);
    }
    spr.userData.sheet = sheet;
    const keepDir = group.userData.anim ? group.userData.anim.dir : dir;
    const keepFlip = group.userData.anim ? group.userData.anim.flip : false;
    group.userData.anim = Anim.createController(sheet, { blend: 0.08 });
    group.userData.anim.dir = keepDir || 0;
    group.userData.anim.flip = keepFlip;
    group.userData.action = name;
    group.userData.pendingAction = null;
    if (group.userData.anim && sheet.states && sheet.states[name]) {
      group.userData.anim.setState(name);
      const st0 = group.userData.anim.tick(0);
      applyUV(t, sheet, st0.frame, st0.dir);
    }
  }
  /* v0.38: 파츠 관절 리그(비단 병풍 디오라마 PNG). 텍스처가 아직/영영 없으면 null → 아래 코드 드로잉으로 폴백. */
  function makeRigChar(kind, shape, opt) {
    if (QA_NORIG) return null;
    /* v0.45 주인공 3D 뼈대 — 벡터 이미지(포즈 카드) 없이 절차적으로 세운다. */
    if ((kind === 'hero' || kind === 'afterimage') && !QA_HERO2D) {
      try {
        const g = kind === 'afterimage' ? HERO3D.buildGhost(hero3dSrc) : HERO3D.build({ shadow: true });
        if (g) {
          if (kind === 'hero') hero3dSrc = g;
          return g;
        }
      } catch (e) {
        if (window.console && console.warn) console.warn('[심안] 3D 주인공 생성 실패 — 파츠 리그로 되돌립니다', e);
      }
    }
    if (kind === 'zombie' && !QA_MON2D) {
      /* v0.46: 좀비 종류별 3D 뼈대 — 마리당 몸통 1콜 + 먹선 1콜. 실패하면 아래 2D 포즈 카드로. */
      try {
        const sp = shape === 'stone' ? 'stone' : (shape === 'brute' ? 'heavy' : 'minion');
        const g = MON3D.build(sp, {});
        if (g) {
          /* 2D 리그와 같은 키(원귀 2.4m · 거한 3.0m · 돌덩이 2.6m) — 판정 반경·심안 링 비율 유지. */
          addShadow(g, sp === 'heavy' ? 1.7 : (sp === 'stone' ? 1.6 : 1.35));
          addTelegraph(g, g.userData.worldH);
          g.userData.rim = g.userData.mrim;
          g.userData.rimHex = 0x5fb8a0; g.userData.rimOp = 0.16;
          if (shape === 'elite') {
            g.userData.rim.material.color.setHex(0xE8C04A);
            g.userData.rim.material.opacity = 0.62;
            g.userData.rimHex = 0xE8C04A; g.userData.rimOp = 0.34;
            addHalo(g, g.userData.worldH);
          }
          return g;
        }
      } catch (e) {
        if (window.console && console.warn) console.warn('[심안] 3D 원귀 생성 실패 — 포즈 카드로 되돌립니다', e);
      }
    }
    if(kind==='boss' && !QA_MON2D){
      const height=HERO3D.HERO_H*1.48*(opt.bossScale||1);
      const g=MON3D.build('boss',{scale:height/6.2,variant:opt.bossVar,shadow:true});
      if(g){
        g.userData.noFlip=true; g.userData.isBoss=true;
        g.userData.bellLocal={x:0,y:height*.76};
        g.userData.rim=g.userData.mrim;
        return g;
      }
    }
    if (!rigReady()) return null;
    if (kind === 'hero' || kind === 'afterimage') {
      const after = kind === 'afterimage';
      const g = buildFigure('hero', {
        order: after ? 3 : 8, tools: after ? [] : ['sash', 'arm'],
        add: after, opacity: after ? 0.34 : 1, aura: !after, auraColor: 0xE7D7B2, auraOpacity: 0.06
      });
      if (!g) return null;
      if (!after) { addShadow(g, 1.45); g.userData.noFlip = true; }
      return g;
    }
    if (kind === 'zombie') {
      /* v0.40: 돌덩이(바위 괴물)도 종이 파츠 리그로 올렸다 — 손그림 시트만 남으면 무대에서 혼자 톤이 튄다. */
      const heavy = shape === 'brute';
      const figName = shape === 'stone' ? 'stone' : (heavy ? 'heavy' : 'minion');
      /* 기존 시트와 같은 키(원혼 2.4m · 장정 3.0m · 돌덩이 2.6m) — 판정 반경·심안 링과 비율이 맞아 있다. */
      const g = buildFigure(figName, { order: 2, scale: 1, auraColor: 0x54e0ba, auraOpacity: 0.26 });
      if (!g) return null;
      addShadow(g, heavy ? 1.7 : 1.35);
      addTelegraph(g, g.userData.worldH);
      /* 테두리(아우라)를 그대로 rim 슬롯에 물린다 — 정예 금테·변주 색 구분·예고 붉은 테가 그대로 동작. */
      if (g.userData.rig && g.userData.rig.aura) {
        g.userData.rim = g.userData.rig.aura;
        g.userData.rimHex = 0x5fb8a0; g.userData.rimOp = 0.12;
      }
      if (shape === 'elite' && g.userData.rim) {
        g.userData.rim.material.color.setHex(0xE8C04A);
        g.userData.rim.material.opacity = 0.62;
        g.userData.rimHex = 0xE8C04A; g.userData.rimOp = 0.34;
        addHalo(g, g.userData.worldH);
      }
      return g;
    }
    if (kind === 'boss') {
      const H = HERO3D.HERO_H * 1.48 * (opt.bossScale || 1);
      const g = buildFigure('boss', {
        order: 2, height: H, scale: H / 6.2, bossVar: opt.bossVar, auraColor: 0xf0552e, auraOpacity: 0.62
      });
      if (!g) return null;
      g.userData.noFlip = true;
      g.userData.isBoss = true;
      g.userData.bellLocal = { x: 0, y: H * 0.76 };
      if (g.userData.rig && g.userData.rig.aura) {
        g.userData.rim = g.userData.rig.aura;
        g.userData.rimHex = 0xF2E2C0; g.userData.rimOp = 0.40;
      }
      return g;
    }
    return null;
  }
  function makeChar(kind, shape, opt) {
    opt = opt || {};
    const rigged = makeRigChar(kind, shape, opt);
    if (rigged) return rigged;
    const group = new THREE.Group();
    const itemK = ITEM_KEY[kind];
    if (kind === 'hero' || kind === 'afterimage') {
      const pack = inkChars().hero;
      const after = kind === 'afterimage';
      const sheet = after ? pack.afterimage : pack.actions.idle;
      const spr = sheetSprite(sheet, sheet.tex, sheet.worldH, { add: after, opacity: after ? 0.5 : 1, depthTest: false, renderOrder: 2 });
      group.add(spr);
      group.userData.sprite = spr;
      group.userData.worldH = sheet.worldH;
      group.userData.animPack = pack;
      group.userData.action = after ? 'afterimage' : 'idle';
      group.userData.anim = Anim.createController(sheet, { blend: 0.1 });
      if (kind === 'hero') { addShadow(group, 1.5); addOutline(group, CHAR_OUTLINE.hero[0], CHAR_OUTLINE.hero[1], HERO_RIM); }
    } else if (kind === 'zombie') {
      const pack = inkChars()[shape === 'brute' || shape === 'stone' ? shape : 'zombie'];
      const sheet = pack.actions.walk;
      const H = sheet.worldH;
      const spr = sheetSprite(sheet, sheet.tex, H, { depthTest: false, renderOrder: 2 });
      group.add(spr);
      group.userData.sprite = spr;
      group.userData.worldH = H;
      group.userData.animPack = pack;
      group.userData.action = 'walk';
      group.userData.anim = Anim.createController(sheet, { blend: 0.08 });
      addShadow(group, 1.35);
      addOutline(group, CHAR_OUTLINE.zombie[0], CHAR_OUTLINE.zombie[1]);
      addRim(group, 0x3ec8c0, 1.12);
      /* 정예 원귀: 금빛 테 */
      if (shape === 'elite' && group.userData.rim && group.userData.rim.material) {
        group.userData.rim.material.color.setHex(0xE8C04A);
        group.userData.rim.material.opacity = 0.6;
        group.userData.rimHex = 0xE8C04A; group.userData.rimOp = 0.6;
      }
      addTelegraph(group, H);
    } else if (kind === 'spirit' || kind === 'boss') {
      const isBoss = kind === 'boss';
      const spiritSheet = !isBoss && inkChars().spirit;
      const ib = isBoss ? inkBoss(opt.bossVar) : null;
      const bossSheet = ib && ib.sheet;
      const bodySheet = bossSheet || spiritSheet;
      const spiritBodyK = isBoss ? 1 : 0.7 * SPIRIT_VIEW_SCALE;
      const bossK = isBoss ? (opt.bossScale || 1) : 1;
      const H = isBoss ? bossH * 1.5 * bossK : spiritSheet.worldH * spiritBodyK;
      group.userData.bodyScale = spiritBodyK;
      group.userData.bodyH = H;
      const spr = sheetSprite(bodySheet, ib ? ib.tex : bodySheet.tex, H, { depthTest: false, renderOrder: 2 });
      group.add(spr);
      group.userData.sprite = spr;
      group.userData.worldH = H;
      if (spiritSheet) {
        group.userData.anim = Anim.createController(spiritSheet, { blend: 0 });
        group.userData.noFlip = true;
        attachSpiritMark(group, spiritSheet, H, shape);
      } else if (bossSheet) {
        group.userData.anim = Anim.createController(bossSheet, { blend: 0 });
        group.userData.action = 'idle';
        group.userData.noFlip = true;
        group.userData.bellLocal = localFromPx(bossSheet, H, ib.eyes[0].map(function (v, i) { return i ? v : 256; }));
      }
      const glow = tex('fx/spirit-glow.png');
      if (glow) {
        const gs = isBoss ? H * 0.5 : 1.05 * SPIRIT_VIEW_SCALE;
        const g = imgSprite(glow, gs, gs, { cy: 0.5, add: true, opacity: isBoss ? 0.45 : 0.22 });
        g.position.y = isBoss ? group.userData.bellLocal.y : 0.55 * SPIRIT_VIEW_SCALE;
        g.material.depthTest = false;
        g.renderOrder = 1;
        group.add(g);
        group.userData.glow = g;
        /* 비취 혼령: HDR 색이라 블룸에 번진다. */
        if (!isBoss) { g.material.color.setRGB(0.45, 1.25, 0.98); }
        else g.material.color.setRGB(1.7, 0.22, 0.14);
      }
      if (!isBoss && spr.material && spr.material.color) spr.material.color.setRGB(SPIRIT_TINT[0], SPIRIT_TINT[1], SPIRIT_TINT[2]);
      if (!isBoss) addOutline(group, CHAR_OUTLINE.spirit[0], CHAR_OUTLINE.spirit[1]);
      else {
        /* v0.27 P1-6: 보스에 항상 켜지는 한지빛 윤곽광 — 붉은 12장 안개·화면 아래에서도 몸과 자세가 읽힌다. */
        addRim(group, 0xF2E2C0, 1.07);
        if (group.userData.rim && group.userData.rim.material) {
          group.userData.rim.material.opacity = 0.55;
          group.userData.rimOp = 0.55;
        }
      }
      const auraFile = atlas.onebell && atlas.onebell.aura && String(atlas.onebell.aura).split(' ')[0];
      if (auraFile && tex(auraFile)) {
        const ak = isBoss ? 1 : SPIRIT_VIEW_SCALE;
        const au = imgSprite(tex(auraFile), isBoss ? 2.4 : 1.6 * ak, isBoss ? 1.1 : 0.72 * ak, { cy: 0.5, add: true, opacity: 0 });
        au.position.y = isBoss ? 1.8 : 1.0 * ak;
        au.visible = false;
        au.material.depthTest = false;
        au.renderOrder = 3;
        group.add(au);
        group.userData.aura = au;
      }
      if (!group.userData.bellLocal) {
        const bellSheet = isBoss ? atlas.boss : (atlas.spirit || bodySheet);
        group.userData.bellLocal = localBell(bellSheet, H);
      }
      group.userData.markShape = shape || 'circle';
      group.userData.isBoss = isBoss;
    } else {
      const spr = imgSprite(inkItemTex(itemK || 'xp-orb'), 1.05, 1.05, { cy: 0.14 });
      group.add(spr);
      group.userData.sprite = spr;
    }
    return group;
  }

  const STATUS_TINT = { ice: [0.6, 0.85, 1.25], slow: [0.75, 0.9, 1.15], fire: [1.4, 0.7, 0.5], poison: [1.0, 0.6, 1.3] };
  function setStatus(group, elem) {
    if (!group || !group.userData) return;
    group.userData.statusElem = elem || null;
    /* Kinds without their own status sheets show the status as a tint. */
    const pack = group.userData.animPack;
    const mapped = { ice: 'frozen', fire: 'burning', poison: 'poisoned' }[elem];
    const spr = group.userData.sprite;
    const c = (elem && !(pack && pack.actions && pack.actions[mapped]) && STATUS_TINT[elem]) || [1, 1, 1];
    if (group.userData.rig) { rigTint(group, c[0], c[1], c[2]); return; }
    if (group.userData.m3d) { MON3D.setTint(group, c[0], c[1], c[2]); return; }
    if (!spr || !spr.material || !spr.material.color) return;
    spr.material.color.setRGB(c[0], c[1], c[2]);
  }

  function applyFlip(spr, flip) {
    if (!spr) return;
    const ax = Math.abs(spr.scale.x);
    spr.scale.x = flip ? -ax : ax;
  }

  /* 정예 황금 후광(파츠) — 종이 인형 머리 뒤에 금빛 종이 고리를 세운다. */
  function addHalo(group, worldH) {
    const H = worldH || 2.4;
    const geo = new THREE.TorusGeometry(H * 0.155, Math.max(0.012, H * 0.014), 6, 26);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xE8C04A, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.set(0, H * 0.90, -0.06);
    ring.rotation.x = -1.12;
    ring.renderOrder = 7;
    group.add(ring);
    group.userData.halo = ring;
  }
  function tickChar(group, kind, state, dt, vx, vz) {
    if (!group) return;
    const halo = group.userData && group.userData.halo;
    if (halo) { halo.rotation.z += (dt || 0) * 0.7; halo.material.opacity = 0.62 + 0.2 * Math.sin((group.userData.haloT = (group.userData.haloT || 0) + (dt || 0)) * 3.1); }
    if (group.userData && group.userData.m3d) { MON3D.tick(group, kind, state, dt, vx, vz); return; }
    if (group.userData && group.userData.rig && tickFigure(group, kind, state, dt, vx, vz)) return;
    if (group.userData && group.userData.hero3d) { HERO3D.tick(group, kind, state, dt, vx, vz); return; }
    const spr = group.userData && group.userData.sprite;
    const pack = group.userData && group.userData.animPack;
    let useState = state;
    if (kind === 'zombie' && group.userData && group.userData.statusElem) {
      const map = { ice: 'frozen', fire: 'burning', poison: 'poisoned' };
      const alt = map[group.userData.statusElem];
      if (alt && pack && pack.actions && pack.actions[alt]) useState = alt;
    }
    if (pack && pack.actions && useState && useState !== group.userData.action && pack.actions[useState]) {
      swapAction(group, pack.actions[useState], useState);
    }
    const anim = group.userData && group.userData.anim;
    if (anim) {
      if (useState && anim.sheet && anim.sheet.states && anim.sheet.states[useState]) anim.setState(useState);
      if (group.userData.rowLock != null) {
        anim.dir = group.userData.rowLock;
      } else if (kind === 'boss') {
        /* row is the action; do not aim with velocity */
      } else if (vx != null && vz != null) {
        /* One-row sheets face screen right; the camera sits on +x +z, so screen x follows vx - vz. */
        if (anim.sheet && anim.sheet.screenFlip) anim.setDir(vx - vz, 0);
        else anim.setDir(vx, vz);
      }
      const st = anim.tick(dt);
      if (spr && spr.material && spr.material.map && anim.sheet) applyUV(spr.material.map, anim.sheet, st.frame, st.dir);
      if (!group.userData.noFlip) applyFlip(spr, st.flip);
      else if (spr) applyFlip(spr, false);
      if ((group.userData.rim || group.userData.outline) &&
          !(group.userData.rig && group.userData.rig.kind === 'pose')) syncRim(group);
    }
    const rat = group.userData && group.userData.rattle;
    if (rat) {
      rat.t += dt;
      rat.sprite.material.rotation = rat.amp * Math.sin((rat.t / rat.period) * Math.PI * 2);
    }
    if (group.userData.aura && group.userData.aura.visible) {
      group.userData.aura.material.rotation = (group.userData.aura.material.rotation || 0) - (20 * Math.PI / 180) * dt;
    }
  }

  function setSpiritShape(group, shape) {
    if (!group || !group.userData) return;
    group.userData.markShape = shape;
    applySpiritInk(group, group.userData.markSheet, group.userData.markWorldH, shape);
  }
  function setAura(group, on) {
    if (!group || !group.userData || !group.userData.aura) return;
    group.userData.aura.visible = !!on;
    group.userData.aura.material.opacity = on ? 0.85 : 0;
  }

  /* 2.5D 입체 무대: 잉크 3D 소품·지형·조명을 스테이지별로 세운다.
     스테이지 4장은 1장과 같은 장터 땅을 쓰지만, 그을린 변형과 붉은 달로 구분한다. */
  async function applyMap(scene, mapId, prev, opts) {
    if (prev && prev.dispose) prev.dispose();
    const id = (atlas.maps && atlas.maps[mapId]) ? mapId : 'map1';
    currentMapId = id;
    const M = atlas.maps[id];
    const stageId = (opts && opts.stage) || 1;
    const w3 = buildStage3D(THREE, { mapId: id, stageId: stageId, chunked: opts && opts.chunked !== false });
    const group = w3.group;
    group.name = 'map-' + id + '-' + stageId;
    scene.add(group);
    return {
      id: id, name: M.name, key: M.key, group: group, lights: w3.lights || [], w3: w3,
      stageId: stageId, variant: id + ':' + stageId,
      update: function (dt, t) { w3.update(dt, t); },
      dispose: function () { w3.dispose(); }
    };
  }

  function slashTex(elem) {
    if (elem && el['slash-line'] && el['slash-line'].files && el['slash-line'].files[elem]) {
      return tex(el['slash-line'].files[elem]);
    }
    return tex(atlas.fx && atlas.fx['slash-line'] && atlas.fx['slash-line'].file);
  }

  function fxSheet(name) {
    return el[name] || (atlas.fx && atlas.fx[name]) || null;
  }
  function playFx(scene, name, x, z, worldH) {
    const sheet = fxSheet(name);
    if (!sheet) return null;
    const src = tex(sheetFile(sheet) || sheet.file);
    if (!src) return null;
    const spr = sheetSprite(sheet, src, worldH || 2.2, { add: true });
    const g = new THREE.Group();
    g.add(spr);
    g.position.set(x, 0.2, z);
    scene.add(g);
    const fps = sheet.fps || 16;
    const n = sheet.count || 1;
    return { mesh: g, spr: spr, sheet: sheet, t: 0, life: n / fps, max: n / fps, fps: fps, n: n, additive: true };
  }

  const inkStrokeUrl = atlas.fx && atlas.fx['ink-stroke'] && atlas.fx['ink-stroke'].file;
  const inkLitUrl = atlas.fx && atlas.fx['ink-stroke-lit'] && atlas.fx['ink-stroke-lit'].file;
  const inkDabUrl = atlas.fx && atlas.fx['ink-dab'] && atlas.fx['ink-dab'].file;
  const onebell = atlas.onebell || {};

  return {
    atlas: atlas, pal: pal, Anim: Anim, unit: unit, heroH: heroH,
    pxPerMeter: pxPerMeter, zombieH: zombieH, spiritH: spiritH, bossH: bossH,
    transitions: (atlas.tiles && atlas.tiles.transitions) || null,
    night: hexColor(pal.night || pal.ground, 0x1e1c1a),
    makeChar: makeChar, tickChar: tickChar, buildStage3D: buildStage3D,
    /* v0.38 파츠 리그 훅: 카메라·피격 반동·틴트·투명도·그리기 순서 */
    setCamera: function (cam, renderer) { rigSetCamera(cam); try { MON3D.setCamera(cam, renderer); if (HERO3D.setCamera) HERO3D.setCamera(cam); } catch (e) {} },
    /* v0.42 QA: 포즈 고정·동작 목록 */
    debugPose: function (g, a, f) { return rigDebugPose(g, a, f); },
    actsOf: function (n) { return rigActsOf(n); },
    kickChar: function (group, k) {
      if (group && group.userData && group.userData.hero3d) { HERO3D.kick(group, k); return; }
      if (group && group.userData && group.userData.m3d) { MON3D.kick(group, k); return; }
      rigKick(group, k);
    },
    slashChar: function (group, k) {
      if (group && group.userData && group.userData.hero3d) { HERO3D.slashPose(group, k); return; }
      if (group && group.userData && group.userData.m3d) { MON3D.slashPose(group, k); return; }
      rigSlash(group, k);
    },
    tintChar: function (group, r, g, b) {
      if (!group || !group.userData) return;
      if (group.userData.hero3d) { HERO3D.setTint(group, r, g, b); return; }
      if (group.userData.m3d) { MON3D.setTint(group, r, g, b); return; }
      if (group.userData.rig) { rigTint(group, r, g, b); return; }
      const spr = group.userData.sprite;
      if (spr && spr.material && spr.material.color) spr.material.color.setRGB(r, g, b);
    },
    setCharOpacity: function (group, o) {
      if (!group || !group.userData) return;
      if (group.userData.hero3d) { HERO3D.setOpacity(group, o); return; }
      if (group.userData.m3d) { MON3D.setOpacity(group, o); return; }
      if (group.userData.rig) { rigOpacity(group, o); return; }
      const spr = group.userData.sprite;
      if (spr && spr.material) spr.material.opacity = o;
    },
    setCharOrder: function (group, base) {
      if (!group || !group.userData) return;
      if (group.userData.hero3d) { HERO3D.setOrder(group, base); return; }
      if (group.userData.m3d) { MON3D.setOrder(group, base); return; }
      if (group.userData.rig) { rigOrder(group, base); return; }
      const spr = group.userData.sprite;
      if (spr) spr.renderOrder = base;
    },
    setAuraColor: function (group, hex, op) {
      if (group && group.userData && group.userData.hero3d) { HERO3D.setAuraColor(group, hex, op); return; }
      if (group && group.userData && group.userData.m3d) { MON3D.setAuraColor(group, hex, op); return; }
      rigAuraColor(group, hex, op);
    },
    rigInfo: function () { return { ready: rigReady(), hero3d: HERO3D.ready(), mon3d: MON3D.ready(), mon: MON3D.stats() }; },
    /* v0.45 QA: 3D 주인공 상태·고정·스텝·바운딩 */
    hero3d: HERO3D,
    /* v0.46 QA: 3D 몬스터 상태·고정 */
    mon3d: MON3D,
    /* QA: 지금까지 먹획을 구운 혼령 기호 목록(예열 검증용) */
    spiritInkShapes: function () { return Object.keys(spiritInkCache); },
    sealUrl: sealUrl, upIconUrl: upIconUrl, itemIconUrl: itemIconUrl, setSpiritShape: setSpiritShape, setStatus: setStatus, setAura: setAura, setTelegraph: setTelegraph,
    applyMap: applyMap, slashTex: slashTex, playFx: playFx,
    trailTex: tex(el['fire-trail'] && el['fire-trail'].file),
    torchGlow: tex('fx/torch-glow.png'),
    torchGlowUrl: torchGlowUrl,
    torchGlowTex: torchGlowTex,
    glowTex: tex('fx/spirit-glow.png'),
    shadowTex: tex('fx/shadow.png'),
    images: {
      inkStroke: tex(inkStrokeUrl),
      inkLit: tex(inkLitUrl),
      inkDab: tex(inkDabUrl),
      onebellInk: onebell.inkFrames || [],
      onebellPaper: onebell.paperFrames || [],
      onebellBurst: onebell.burst && String(onebell.burst).split(' ')[0],
      onebellAura: onebell.aura && String(onebell.aura).split(' ')[0],
      paper: atlas.bg && atlas.bg.paper && String(atlas.bg.paper).split(' ')[0]
    },
    BASE: BASE,
    used: { atlas: BASE + 'atlas.json' }
  };
}

export function probeAssets() { return Promise.resolve({}); }
