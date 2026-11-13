/* Atlas-driven art. Reads ../assets/v2/atlas.json (or window.ART_V2_ATLAS / GP_V2_ATLAS).
 * Never writes into assets/v2. Sizes, anchors, bell centers, flameOffset, palette come from the atlas. */
import * as Anim from './anim.js';
import { createInkGroundMaterial } from './inkground.js';
import { drawInkBossSheet } from './inkboss.js';
import { drawHeroSheets, drawZombieSheets, drawSpiritSheet } from './inkchars.js';

const BASE = '../assets/v2/';
const ITEM_KEY = {
  ice: 'elem-ice', fire: 'elem-fire', poison: 'elem-poison', bell: 'one-bell',
  'elem-ice': 'elem-ice', 'elem-fire': 'elem-fire', 'elem-poison': 'elem-poison', 'one-bell': 'one-bell',
  dashplus: 'dash-plus', 'dash-plus': 'dash-plus', heal: 'heal', coin: 'coin', xp: 'xp-orb', 'xp-orb': 'xp-orb'
};
const SHAPE_MARK = { vline: 'I', hline: 'H', vee: 'V', circle: 'O' };

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
  /* Spirits are ring markers: scaled up with the zoomed-out camera so they and their bells keep their screen size. */
  const SPIRIT_VIEW_SCALE = 2;
  const bossH = (atlas.bossAnim && atlas.bossAnim.cell && atlas.bossAnim.cell[1])
    ? atlas.bossAnim.cell[1] / pxPerMeter
    : heroH * 1.7;

  const need = [];
  function want(url, opt) { if (url && need.indexOf(url) < 0) { need.push({ url: url, opt: opt || {} }); sharedUrls.push(url); } }
  function sheetFile(s) { return s && (s.file || s.file1x); }
  /* Prefer @1x for large 8-dir action sheets so headless SW GL stays interactive. */
  function animFile(s) { return s && (s.file1x || s.file); }
  want('img/hang-bell.png', { noBase: true });
  ['hline', 'vline', 'vee', 'bolt', 'plain'].forEach(function (k) {
    want('bells/bell-' + k + '@2x.png');
  });
  if (atlas.marks && atlas.marks.files) Object.keys(atlas.marks.files).forEach(function (k) { want(atlas.marks.files[k]); });
  if (atlas.marks && atlas.marks.seals) Object.keys(atlas.marks.seals).forEach(function (k) { want(atlas.marks.seals[k]); });
  if (atlas.items) Object.keys(atlas.items).forEach(function (k) { want(atlas.items[k].file); });
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
  ['map1', 'map2', 'map3'].forEach(function (id) { want('fx-ink/atmo/torch-glow-' + id + '.png'); });
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
      rim.material.color.setHex(on ? 0xc8281e : 0x3ec8c0);
      rim.material.opacity = on ? 0.7 : 0.42;
    }
    group.userData.teleOn = !!on;
  }
  function syncRim(group) {
    const spr = group && group.userData && group.userData.sprite;
    const rim = group && group.userData && group.userData.rim;
    if (!spr || !rim || !spr.material) return;
    if (rim.material && spr.material.map) rim.material.map = spr.material.map;
    const k = 1.12;
    const sx = Math.abs(spr.scale.x), sy = Math.abs(spr.scale.y);
    const sign = spr.scale.x < 0 ? -1 : 1;
    rim.scale.set(sign * sx * k, sy * k, 1);
    if (spr.center) rim.center.copy(spr.center);
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
    function bake(r) {
      const t = new THREE.CanvasTexture(r.canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      r.sheet.tex = t;
      return r.sheet;
    }
    const h = drawHeroSheets(), z = drawZombieSheets();
    inkCharPack = {
      hero: { actions: { idle: bake(h.idle), dash: bake(h.dash) }, afterimage: bake(h.afterimage) },
      zombie: { actions: { walk: bake(z.walk), frozen: bake(z.frozen), burning: bake(z.burning), poisoned: bake(z.poisoned) } },
      spirit: bake(drawSpiritSheet())
    };
    return inkCharPack;
  }
  let inkBossPack = null;
  function inkBoss() {
    if (!inkBossPack) {
      const r = drawInkBossSheet();
      const t = new THREE.CanvasTexture(r.canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      inkBossPack = { tex: t, sheet: r.sheet, eyes: r.eyes };
    }
    return inkBossPack;
  }
  function packTex(sheet) {
    if (sheet && sheet.tex) return sheet.tex;
    return tex(animFile(sheet)) || tex(sheetFile(sheet));
  }
  function bellTexUrl(shape) {
    const k = shape || 'plain';
    return 'bells/bell-' + k + '@2x.png';
  }
  function getHangBellTex(shape) {
    return (shape && tex(bellTexUrl(shape))) || tex(bellTexUrl('plain')) || tex('img/hang-bell.png');
  }
  function applyBellMap(bell, shape) {
    if (!bell || !bell.material) return;
    const t = getHangBellTex(shape);
    if (!t) return;
    if (bell.material.map !== t) {
      bell.material.map = t;
      bell.material.needsUpdate = true;
    }
    bell.userData = bell.userData || {};
    bell.userData.bellTex = shape ? bellTexUrl(shape) : 'img/hang-bell.png';
    bell.userData.bellShape = shape || 'plain';
  }
  function attachHangingBell(group, bodySheet, worldH, isBoss, opts) {
    if (isBoss) return;
    opts = opts || {};
    const attachPx = [((bodySheet && bodySheet.anchor && bodySheet.anchor[0]) || 128), 118];
    if (bodySheet && worldH) {
      try {
        const markPx = [attachPx[0] + 26, 122];
        group.userData.bellLocal = localFromPx(bodySheet, worldH, markPx);
        group.userData.bellRestLocal = localFromPx(bodySheet, worldH, [attachPx[0], 142]);
      } catch (err) {}
    }
    if (!group.userData.bellLocal) group.userData.bellLocal = { x: 0, y: (worldH || 1.6) * 0.95 };
    const shape = opts.shape || group.userData.markShape || null;
    const texBell = getHangBellTex(shape);
    if (!texBell) return;
    const attach = localFromPx(bodySheet, worldH, attachPx);
    const pivot = new THREE.Group();
    pivot.position.set(attach.x, attach.y, 0.04);
    const bh = opts.bellH != null ? opts.bellH : worldH * 0.27 * (opts.bellScale || 1);
    const bw = bh * (190 / 376);
    /* cy:1 = hang from the top (same as hang-bell.png). alphaTest 0.02 keeps the soft blue aura. */
    const bell = imgSprite(texBell, bw, bh, { cx: 0.5, cy: 1, alphaTest: 0.02 });
    bell.material.depthTest = false;
    bell.renderOrder = 4;
    applyBellMap(bell, shape);
    pivot.add(bell);
    group.add(pivot);
    group.userData.bellHang = {
      pivot: pivot, bell: bell, t: Math.random() * 4,
      phase: Math.random() * Math.PI * 2,
      amp: 0.18 + Math.random() * 0.04,
      period: 1.45 + Math.random() * 0.3
    };
    group.userData.bellH = bh;
    group.userData.bellW = bw;
    group.userData.bellAttachY = attach.y;
    /* Bottom of the hanging bell (floor/contact point on the rim). */
    group.userData.bellFootY = attach.y - bh;
    group.userData.bellLocal = { x: attach.x, y: attach.y - bh };
    group.userData.bellRestLocal = { x: attach.x, y: attach.y - bh };
    group.userData.markShape = shape;
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
  function makeChar(kind, shape) {
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
      if (kind === 'hero') addShadow(group, 1.5);
    } else if (kind === 'zombie') {
      const pack = inkChars().zombie;
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
      addRim(group, 0x3ec8c0, 1.12);
      addTelegraph(group, H);
    } else if (kind === 'spirit' || kind === 'boss') {
      const isBoss = kind === 'boss';
      const spiritSheet = !isBoss && inkChars().spirit;
      const ib = isBoss ? inkBoss() : null;
      const bossSheet = ib && ib.sheet;
      const bodySheet = bossSheet || spiritSheet;
      const spiritBodyK = isBoss ? 1 : 0.7 * SPIRIT_VIEW_SCALE;
      const H = isBoss ? bossH * 1.5 : spiritSheet.worldH * spiritBodyK;
      group.userData.bodyScale = spiritBodyK;
      group.userData.bodyH = H;
      const spr = sheetSprite(bodySheet, ib ? ib.tex : bodySheet.tex, H, { depthTest: false, renderOrder: 2 });
      group.add(spr);
      group.userData.sprite = spr;
      group.userData.worldH = H;
      if (spiritSheet) {
        group.userData.anim = Anim.createController(spiritSheet, { blend: 0 });
        group.userData.noFlip = true;
        attachHangingBell(group, spiritSheet, H, false, { bellH: spiritH * 0.27 * 2.5 * SPIRIT_VIEW_SCALE, shape: shape });
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
        if (!isBoss) { g.material.color.setRGB(0.45, 1.7, 1.15); g.material.opacity = 0.5; }
        else g.material.color.setRGB(1.7, 0.22, 0.14);
      }
      if (!isBoss && spr.material && spr.material.color) spr.material.color.setRGB(0.75, 1.45, 1.15);
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
    } else if (itemK && atlas.items && atlas.items[itemK]) {
      const it = atlas.items[itemK];
      const src = tex(it.file);
      const css = 0.9;
      const spr = imgSprite(src, css, css, { cy: 0.5 });
      group.add(spr);
      group.userData.sprite = spr;
    } else {
      const spr = imgSprite(tex((atlas.items && atlas.items['xp-orb'] || {}).file), 0.85, 0.85, { cy: 0.5 });
      group.add(spr);
      group.userData.sprite = spr;
    }
    return group;
  }

  function setStatus(group, elem) {
    if (group && group.userData) group.userData.statusElem = elem || null;
  }

  function applyFlip(spr, flip) {
    if (!spr) return;
    const ax = Math.abs(spr.scale.x);
    spr.scale.x = flip ? -ax : ax;
  }

  function tickChar(group, kind, state, dt, vx, vz) {
    if (!group) return;
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
      if (group.userData.rim) syncRim(group);
    }
    const hang = group.userData && group.userData.bellHang;
    if (hang && hang.bell) {
      hang.t = (hang.t || 0) + dt;
      const ang = hang.amp * Math.sin((hang.t / hang.period) * Math.PI * 2 + hang.phase);
      hang.bell.material.rotation = ang;
    }
    if (group.userData.aura && group.userData.aura.visible) {
      group.userData.aura.material.rotation = (group.userData.aura.material.rotation || 0) - (20 * Math.PI / 180) * dt;
    }
  }

  function setSpiritShape(group, shape) {
    if (!group || !group.userData) return;
    group.userData.markShape = shape;
    const hang = group.userData.bellHang;
    if (hang && hang.bell) applyBellMap(hang.bell, shape);
  }
  function setBellAim(group, on) {
    const hang = group && group.userData && group.userData.bellHang;
    if (!hang || !hang.bell || !hang.bell.material || !hang.bell.material.color) return;
    if (on) hang.bell.material.color.setRGB(1.25, 1.1, 0.8);
    else hang.bell.material.color.setRGB(1, 1, 1);
  }
  function setAura(group, on) {
    if (!group || !group.userData || !group.userData.aura) return;
    group.userData.aura.visible = !!on;
    group.userData.aura.material.opacity = on ? 0.85 : 0;
  }

  function makeProp(name, def) {
    def = def || (atlas.props && atlas.props[name]);
    if (!def || !def.file) return null;
    /* File may not be in the shared cache (map props load on demand). Caller should acquire first. */
    const src = tex(def.file);
    if (!src) return null;
    const sz = def.size || [src.image.width, src.image.height];
    const H = sz[1] * unit;
    const W = sz[0] * unit;
    const spr = imgSprite(src, W, H, { cy: 0, alphaTest: 0.1 });
    const anc = def.anchor || [sz[0] / 2, sz[1] - 10];
    spr.center.set(anc[0] / sz[0], 1 - anc[1] / sz[1]);
    const g = new THREE.Group();
    g.add(spr);
    g.userData.prop = def;
    g.userData.sprite = spr;
    if (def.flameOffset && torchGlowTex()) {
      const glo = imgSprite(torchGlowTex(), 2.4, 2.4, { cy: 0.5, add: true, opacity: 0.7 });
      glo.position.set(def.flameOffset[0] * unit, -def.flameOffset[1] * unit, 0.01);
      g.add(glo);
      g.userData.glow = glo;
      g.userData.flameWorld = { x: def.flameOffset[0] * unit, y: -def.flameOffset[1] * unit };
    }
    return g;
  }

  function tilePath(ref) {
    if (!ref) return null;
    if (typeof ref === 'string' && ref.indexOf('tiles.') === 0) {
      const k = ref.slice(6);
      const t = atlas.tiles && atlas.tiles[k];
      return t && (t.texture512 || t.texture);
    }
    if (typeof ref === 'object' && (ref.texture512 || ref.texture)) return ref.texture512 || ref.texture;
    if (typeof ref === 'string' && ref.indexOf('.png') >= 0) return ref;
    return null;
  }
  function fogAlpha(map) {
    const s = (map && map.fog) || '';
    const m = s.match(/(\.\d+)\s*[-–~]\s*(\.\d+)/);
    if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2;
    return 0.45;
  }

  async function composeGround(baseUrl, patchUrl) {
    const [base, patch] = await Promise.all([acquire(baseUrl, { repeat: true }), patchUrl ? acquire(patchUrl, { repeat: true }) : Promise.resolve(null)]);
    if (!patch || !base || !base.image || !patch.image) return { tex: base, urls: patchUrl ? [baseUrl, patchUrl] : [baseUrl] };
    const S = 512;
    const { c, g } = canvas(S, S);
    try { g.drawImage(base.image, 0, 0, S, S); } catch (e) { return { tex: base, urls: [baseUrl, patchUrl] }; }
    const patches = [
      [0.18, 0.22, 0.28], [0.62, 0.18, 0.24], [0.78, 0.55, 0.26],
      [0.30, 0.70, 0.30], [0.52, 0.48, 0.18], [0.10, 0.50, 0.20]
    ];
    patches.forEach(function (p) {
      const cx = p[0] * S, cy = p[1] * S, r = p[2] * S;
      g.save();
      const grd = g.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
      grd.addColorStop(0, 'rgba(0,0,0,0.95)');
      grd.addColorStop(0.7, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.beginPath(); g.arc(cx, cy, r, 0, 7); g.clip();
      g.globalAlpha = 1;
      g.drawImage(patch.image, 0, 0, S, S);
      g.restore();
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.repeat.set(30, 30);
    t.needsUpdate = true;
    return { tex: t, urls: [baseUrl, patchUrl], composed: t };
  }

  const MAP_LAYOUT = {
    map1: [
      ['choga-hut', 12, -8], ['choga-hut', -16, -14],
      ['palace-wall', 16, -16], ['palace-wall', -18, 6],
      ['ssari-fence', -8, -4], ['ssari-fence', 7, 9], ['ssari-fence', -3, 11],
      ['reeds', 6, -6], ['reeds', -11, 9],
      ['vegetable-patch', -12, 2],
      ['torch', -7, 7], ['torch', 10, -3],
      ['stone-lantern', 9, 4], ['stone-lantern', -6, -10],
      ['boulder', 2, 13], ['boulder', -14, -17]
    ],
    map2: [
      ['map2-gate', 0, -22],
      ['map2-wall', -12, -16], ['map2-wall', 12, -16],
      ['map2-banner', -8, -8], ['map2-banner', 10, -10],
      ['map2-rubble', 8, 6], ['map2-rubble', -10, 8], ['map2-rubble', 2, 14],
      ['map2-barricade', -4, 4], ['map2-barricade', 6, 2],
      ['map2-haetae', -6, -12], ['map2-haetae', 6, -12]
    ],
    map3: [
      ['map3-bamboo', -14, -8], ['map3-bamboo', 14, -6], ['map3-bamboo', -10, 12], ['map3-bamboo', 12, 10],
      ['map3-jangseung', -6, 4],
      ['map3-seonangdang', 8, -10],
      ['map3-bridge', 0, -16],
      ['map3-rock', -8, -4], ['map3-rock', 10, 6],
      ['map3-cairn', 4, 8]
    ]
  };

  function propDef(map, name) {
    if (map.props && !Array.isArray(map.props) && map.props[name]) return map.props[name];
    return atlas.props && atlas.props[name];
  }

  async function applyMap(scene, mapId, prev) {
    if (prev && prev.dispose) prev.dispose();
    const id = (atlas.maps && atlas.maps[mapId]) ? mapId : 'map1';
    currentMapId = id;
    const M = atlas.maps[id];
    const urls = [];
    const group = new THREE.Group();
    group.name = 'map-' + id;
    const suggested = M.suggestedGround || {};
    const tiles = M.tiles || {};
    let baseUrl, patchUrl;
    if (id === 'map1') {
      baseUrl = tilePath(tiles.courtyard || 'tiles.courtyard');
    } else {
      const baseKey = suggested.base && tiles[suggested.base] ? suggested.base : Object.keys(tiles)[0];
      const patchKey = suggested.patches && tiles[suggested.patches] ? suggested.patches : null;
      baseUrl = tilePath(tiles[baseKey]);
      patchUrl = patchKey ? tilePath(tiles[patchKey]) : null;
    }
    const groundPack = await composeGround(baseUrl, patchUrl);
    urls.push.apply(urls, groundPack.urls);
    if (groundPack.tex && groundPack.tex.repeat && !groundPack.composed) groundPack.tex.repeat.set(30, 30);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120, 1, 1),
      createInkGroundMaterial(id, groundPack.tex)
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);

    const bgUrl = M.bgJpg || M.bg;
    if (bgUrl) {
      const bgTex = await acquire(bgUrl);
      urls.push(bgUrl);
      if (bgTex) {
        const bg = new THREE.Mesh(
          new THREE.PlaneGeometry(80, 45),
          new THREE.MeshBasicMaterial({ map: bgTex, fog: true })
        );
        bg.position.set(0, 18, -46);
        group.add(bg);
      }
    }

    const fa = fogAlpha(M);
    const fogs = [];
    const f0 = tex((atlas.fog && atlas.fog['fog-0'] || {}).file);
    if (f0) {
      const t = cloneTex(f0);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(4, 2);
      const fog = new THREE.Mesh(
        new THREE.PlaneGeometry(80, 16),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: fa, depthWrite: false })
      );
      fog.position.set(0, 5, -8);
      fog.userData.fogScroll = 8;
      group.add(fog);
      fogs.push(fog);
    }

    const layout = MAP_LAYOUT[id] || MAP_LAYOUT.map1;
    const lights = [];
    for (let i = 0; i < layout.length; i++) {
      const name = layout[i][0], x = layout[i][1], z = layout[i][2];
      const def = propDef(M, name);
      if (!def) continue;
      await acquire(def.file);
      urls.push(def.file);
      const prop = makeProp(name, def);
      if (!prop) continue;
      if (name === 'map2-wall' && x > 0) prop.scale.x = -1;
      prop.position.set(x, 0, z);
      group.add(prop);
      if (def.flameOffset && prop.userData.flameWorld) {
        const light = new THREE.PointLight(hexColor(pal.ember || pal.torch, 0xff8a3a), 2.6, 16, 1.6);
        light.position.set(x, prop.userData.flameWorld.y, z);
        group.add(light);
        lights.push({ light: light, glow: prop.userData.glow, base: 2.6 });
      }
    }

    scene.add(group);
    function dispose() {
      scene.remove(group);
      group.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const arr = Array.isArray(o.material) ? o.material : [o.material];
          arr.forEach(function (m) { if (m && m.dispose) m.dispose(); });
        }
      });
      if (groundPack.composed) groundPack.composed.dispose();
      const seen = {};
      urls.forEach(function (u) {
        if (sharedUrls.indexOf(u) >= 0) return;
        if (seen[u]) return;
        seen[u] = 1;
        release(u);
      });
    }
    return { id: id, name: M.name, key: M.key, group: group, lights: lights, fogs: fogs, dispose: dispose, fogAlpha: fa };
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
    makeChar: makeChar, makeProp: makeProp, tickChar: tickChar,
    setSpiritShape: setSpiritShape, setBellAim: setBellAim, getHangBellTex: getHangBellTex, bellTexUrl: bellTexUrl, setStatus: setStatus, setAura: setAura, setTelegraph: setTelegraph,
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
      marks: atlas.marks && atlas.marks.files,
      seals: atlas.marks && atlas.marks.seals,
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
