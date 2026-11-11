/* Atlas-driven art. Reads ../assets/v2/atlas.json (or window.ART_V2_ATLAS / GP_V2_ATLAS).
 * Never writes into assets/v2. Sizes, anchors, bell centers, flameOffset, palette come from the atlas. */
import * as Anim from './anim.js';

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

  function loadOne(url, opt) {
    opt = opt || {};
    return new Promise(function (res) {
      const l = new THREE.TextureLoader();
      l.load(BASE + url, function (t) {
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

  const unit = metersPerTile(atlas) / 1024;
  const heroH = ((atlas.hero && atlas.hero.frame && atlas.hero.frame[1]) || 512) * unit;

  const need = [];
  function want(url, opt) { if (url && need.indexOf(url) < 0) { need.push({ url: url, opt: opt || {} }); sharedUrls.push(url); } }
  function sheetFile(s) { return s && (s.file || s.file1x); }
  want(sheetFile(atlas.hero));
  want(sheetFile(atlas['hero-afterimage']));
  want(sheetFile(atlas.zombie));
  want(sheetFile(atlas.spirit));
  want(sheetFile(atlas['spirit-wisp']));
  want(sheetFile(atlas.boss));
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
  if (el.flame) want(sheetFile(el.flame));
  if (el['zombie-frozen']) want(sheetFile(el['zombie-frozen']));
  if (el['zombie-burning']) want(sheetFile(el['zombie-burning']));
  if (el['zombie-poisoned']) want(sheetFile(el['zombie-poisoned']));
  if (el['fire-trail']) want(el['fire-trail'].file);
  if (el['ice-shatter']) want(sheetFile(el['ice-shatter']));
  if (el['poison-burst']) want(sheetFile(el['poison-burst']));
  if (el['poison-fog']) want(sheetFile(el['poison-fog']));
  if (el['slash-line'] && el['slash-line'].files) {
    Object.keys(el['slash-line'].files).forEach(function (k) { want(el['slash-line'].files[k]); });
  }
  want('fx/torch-glow.png');
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
      map: t, transparent: true, depthWrite: false, alphaTest: opt.alphaTest != null ? opt.alphaTest : 0.05,
      blending: opt.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      opacity: opt.opacity != null ? opt.opacity : 1
    });
    const s = new THREE.Sprite(mat);
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
  function localBell(sheet, worldH) {
    const fw = (sheet.frame && sheet.frame[0]) || 512;
    const fh = (sheet.frame && sheet.frame[1]) || 512;
    const anc = sheet.anchor || [fw / 2, fh];
    const bell = sheet.bellCenter || sheet.markCenter;
    if (!bell) return { x: 0, y: worldH * 0.7 };
    return { x: (bell[0] - anc[0]) * (worldH / fh), y: (anc[1] - bell[1]) * (worldH / fh) };
  }

  function makeChar(kind, shape) {
    const group = new THREE.Group();
    const itemK = ITEM_KEY[kind];
    if (kind === 'hero' || kind === 'afterimage') {
      const sheet = kind === 'afterimage' ? atlas['hero-afterimage'] : atlas.hero;
      const src = tex(sheetFile(sheet)) || tex(sheetFile(atlas.hero));
      const spr = sheetSprite(sheet, src, heroH, { add: kind === 'afterimage', opacity: kind === 'afterimage' ? 0.5 : 1 });
      group.add(spr);
      group.userData.sprite = spr;
      group.userData.anim = Anim.createController(sheet, { blend: 0.1 });
      if (kind === 'hero') addShadow(group, 1.5);
    } else if (kind === 'zombie') {
      const sheet = atlas.zombie;
      const spr = sheetSprite(sheet, tex(sheetFile(sheet)), heroH * 0.92);
      group.add(spr);
      group.userData.sprite = spr;
      group.userData.anim = Anim.createController(sheet, { blend: 0.08 });
      addShadow(group, 1.35);
      attachStatus(group);
    } else if (kind === 'spirit' || kind === 'boss') {
      const isBoss = kind === 'boss';
      const bodySheet = isBoss ? atlas.boss : (atlas['spirit-wisp'] || atlas.spirit);
      const H = isBoss ? heroH * 1.7 : heroH * 1.05;
      const spr = sheetSprite(bodySheet, tex(sheetFile(bodySheet)), H);
      group.add(spr);
      group.userData.sprite = spr;
      if (!isBoss && bodySheet && bodySheet.fps) group.userData.anim = Anim.createController({
        frame: bodySheet.frame, count: bodySheet.count, order: bodySheet.order, fps: bodySheet.fps,
        states: { idle: [0, 1, 2, 3] }, fpsByState: { idle: bodySheet.fps }, anchor: bodySheet.anchor
      }, { blend: 0 });
      const glow = tex('fx/spirit-glow.png');
      if (glow) {
        const g = imgSprite(glow, isBoss ? 3.6 : 2.6, isBoss ? 3.6 : 2.6, { cy: 0.45, add: true, opacity: 0.7 });
        g.position.y = isBoss ? 1.6 : 0.9;
        group.add(g);
        group.userData.glow = g;
      }
      const auraFile = atlas.onebell && atlas.onebell.aura && String(atlas.onebell.aura).split(' ')[0];
      if (auraFile && tex(auraFile)) {
        const au = imgSprite(tex(auraFile), isBoss ? 2.4 : 1.6, isBoss ? 1.1 : 0.72, { cy: 0.5, add: true, opacity: 0 });
        au.position.y = isBoss ? 1.5 : 0.95;
        au.visible = false;
        group.add(au);
        group.userData.aura = au;
      }
      const bellSheet = isBoss ? atlas.boss : (atlas.spirit || bodySheet);
      group.userData.bellLocal = localBell(bellSheet, H);
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

  function attachStatus(group) {
    const layers = {};
    [['ice', 'zombie-frozen', 0], ['fire', 'zombie-burning', 0], ['poison', 'zombie-poisoned', 0]].forEach(function (pair) {
      const sheet = el[pair[1]];
      if (!sheet) return;
      const spr = sheetSprite(sheet, tex(sheetFile(sheet)), heroH * 0.92);
      spr.visible = false;
      group.add(spr);
      layers[pair[0]] = { spr: spr, sheet: sheet, anim: Anim.createController(sheet, { blend: 0 }) };
    });
    if (el.flame && tex(sheetFile(el.flame))) {
      const fl = sheetSprite(el.flame, tex(sheetFile(el.flame)), 0.9, { add: true });
      fl.visible = false;
      fl.position.y = 0.3;
      group.add(fl);
      layers.flame = { spr: fl, sheet: el.flame, anim: Anim.createController({
        frame: el.flame.frame, count: el.flame.count, fps: el.flame.fps,
        states: { idle: [0, 1, 2, 3] }, fpsByState: { idle: el.flame.fps }, anchor: el.flame.anchor
      }, { blend: 0 }) };
    }
    if (el['poison-fog'] && tex(sheetFile(el['poison-fog']))) {
      const pf = sheetSprite(el['poison-fog'], tex(sheetFile(el['poison-fog'])), 1.2);
      pf.visible = false;
      pf.position.y = 0.15;
      group.add(pf);
      layers.fog = { spr: pf, sheet: el['poison-fog'], anim: Anim.createController({
        frame: el['poison-fog'].frame, count: el['poison-fog'].count, fps: el['poison-fog'].fps,
        states: { idle: [0, 1, 2] }, fpsByState: { idle: el['poison-fog'].fps }, anchor: el['poison-fog'].anchor
      }, { blend: 0 }) };
    }
    group.userData.statusLayers = layers;
  }

  function setStatus(group, elem) {
    const layers = group && group.userData && group.userData.statusLayers;
    if (!layers) return;
    Object.keys(layers).forEach(function (k) {
      const show = (elem === 'ice' && k === 'ice') || (elem === 'fire' && (k === 'fire' || k === 'flame')) || (elem === 'poison' && (k === 'poison' || k === 'fog'));
      layers[k].spr.visible = show;
    });
    if (group.userData.sprite) group.userData.sprite.visible = !elem;
    if (elem === 'ice' && layers.ice) layers.ice.anim.setState(Object.keys(layers.ice.sheet.states || { frozen: [0] })[0] || 'idle');
  }

  function tickStatus(group, dt, vx, vz) {
    const layers = group && group.userData && group.userData.statusLayers;
    if (!layers) return;
    Object.keys(layers).forEach(function (k) {
      const L = layers[k];
      if (!L.spr.visible || !L.anim) return;
      if (vx != null) L.anim.setDir(vx, vz);
      const st = L.anim.tick(dt);
      applyUV(L.spr.material.map, L.sheet, st.frame, st.dir);
      applyFlip(L.spr, st.flip);
    });
  }

  function applyFlip(spr, flip) {
    if (!spr) return;
    const ax = Math.abs(spr.scale.x);
    spr.scale.x = flip ? -ax : ax;
  }

  function tickChar(group, kind, state, dt, vx, vz) {
    if (!group) return;
    const spr = group.userData && group.userData.sprite;
    const anim = group.userData && group.userData.anim;
    if (anim) {
      if (state) anim.setState(state);
      if (vx != null && vz != null) anim.setDir(vx, vz);
      const st = anim.tick(dt);
      if (spr && spr.material && spr.material.map && anim.sheet) applyUV(spr.material.map, anim.sheet, st.frame, st.dir);
      applyFlip(spr, st.flip);
    }
    tickStatus(group, dt, vx, vz);
    if (group.userData.aura && group.userData.aura.visible) {
      group.userData.aura.material.rotation = (group.userData.aura.material.rotation || 0) - (20 * Math.PI / 180) * dt;
    }
  }

  function setSpiritShape(group, shape) {
    if (!group || !group.userData) return;
    group.userData.markShape = shape;
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
    if (def.flameOffset && tex('fx/torch-glow.png')) {
      const glo = imgSprite(tex('fx/torch-glow.png'), 2.4, 2.4, { cy: 0.5, add: true, opacity: 0.7 });
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
      new THREE.MeshBasicMaterial({ map: groundPack.tex, color: 0xffffff })
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
    night: hexColor(pal.night || pal.ground, 0x1e1c1a),
    makeChar: makeChar, makeProp: makeProp, tickChar: tickChar,
    setSpiritShape: setSpiritShape, setStatus: setStatus, setAura: setAura,
    applyMap: applyMap, slashTex: slashTex, playFx: playFx,
    trailTex: tex(el['fire-trail'] && el['fire-trail'].file),
    torchGlow: tex('fx/torch-glow.png'),
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
