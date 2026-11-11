/* Sprite animation: frame timing, action blend, facing.
 * All frame/dir/action counts are read from an atlas sheet object.
 * When an 8-dir sheet arrives, set one or more of:
 *   dirs | dirCount | directions, dirOrder, layout, fileByDir
 * No game-code change is required — this module already understands those keys.
 * layout: 'frames-x' (default, 1 dir)
 *         'frames-x-dirs-y' (columns = frames, rows = dirs, row 0 at the top)
 *         'dirs-x-frames-y'
 *         'fileByDir'
 */
export const DEFAULT_DIR_ORDER = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se'];

export function dirCount(sheet) {
  if (!sheet) return 1;
  if (typeof sheet.dirs === 'number' && sheet.dirs > 0) return sheet.dirs;
  if (typeof sheet.dirCount === 'number' && sheet.dirCount > 0) return sheet.dirCount;
  if (typeof sheet.directions === 'number' && sheet.directions > 0) return sheet.directions;
  if (Array.isArray(sheet.dirOrder) && sheet.dirOrder.length) return sheet.dirOrder.length;
  if (sheet.fileByDir && typeof sheet.fileByDir === 'object') {
    const n = Object.keys(sheet.fileByDir).length;
    if (n) return n;
  }
  return 1;
}

export function dirOrder(sheet) {
  if (sheet && Array.isArray(sheet.dirOrder) && sheet.dirOrder.length) return sheet.dirOrder.slice();
  const n = dirCount(sheet);
  if (n <= 1) return ['e'];
  if (n === 4) return ['e', 'n', 'w', 's'];
  return DEFAULT_DIR_ORDER.slice(0, n);
}

export function layoutOf(sheet) {
  if (sheet && (sheet.layout || sheet.sheetLayout)) return sheet.layout || sheet.sheetLayout;
  if (dirCount(sheet) > 1 && sheet && sheet.fileByDir) return 'fileByDir';
  if (dirCount(sheet) > 1) return 'frames-x-dirs-y';
  return 'frames-x';
}

export function frameCount(sheet) {
  if (!sheet) return 1;
  if (typeof sheet.count === 'number' && sheet.count > 0) return sheet.count;
  if (Array.isArray(sheet.order) && sheet.order.length) return sheet.order.length;
  return 1;
}

export function actionsOf(sheet) {
  if (sheet && sheet.states && typeof sheet.states === 'object') return Object.keys(sheet.states);
  if (sheet && Array.isArray(sheet.order)) return ['idle'];
  return ['idle'];
}

export function fileForDir(sheet, dirIndex) {
  if (!sheet) return null;
  const order = dirOrder(sheet);
  const n = order.length;
  const d = n ? ((dirIndex % n) + n) % n : 0;
  const name = order[d] || order[0];
  if (sheet.fileByDir && name && sheet.fileByDir[name]) return sheet.fileByDir[name];
  return sheet.file || null;
}

/* Three.js Sprite texture UV. flipY is assumed true (default). Row 0 of a sheet is the top. */
export function frameUV(sheet, frameIndex, dirIndex) {
  const n = frameCount(sheet);
  const f = ((frameIndex % n) + n) % n;
  const dirs = dirCount(sheet);
  const d = dirs <= 1 ? 0 : ((dirIndex % dirs) + dirs) % dirs;
  const lay = layoutOf(sheet);
  if (dirs <= 1 || lay === 'frames-x' || lay === 'fileByDir') {
    return { repeatX: 1 / n, repeatY: 1, offsetX: f / n, offsetY: 0, frame: f, dir: d };
  }
  if (lay === 'dirs-x-frames-y') {
    return { repeatX: 1 / dirs, repeatY: 1 / n, offsetX: d / dirs, offsetY: 1 - (f + 1) / n, frame: f, dir: d };
  }
  return { repeatX: 1 / n, repeatY: 1 / dirs, offsetX: f / n, offsetY: 1 - (d + 1) / dirs, frame: f, dir: d };
}

/* Movement vector (world XZ: +X east, +Z south) → dir index.
 * 8-dir: atan2(-z, x) so 0 = east, 90° = north (−Z).
 * 1-dir: index stays 0 and `flip` is set for westward motion.
 * Hysteresis keeps the current sector until the angle is clearly past the boundary
 * so the sprite does not flicker when the vector sits on an edge. */
export function chooseDir(vx, vz, prev, opts) {
  opts = opts || {};
  const order = opts.dirOrder || DEFAULT_DIR_ORDER;
  const n = order.length;
  const dead = opts.deadzone != null ? opts.deadzone : 0.05;
  const speed = Math.hypot(vx, vz);
  if (n <= 1) {
    const flip = flip1(vx, prev && prev.flip, opts);
    return { index: 0, name: order[0] || 'e', flip: flip };
  }
  if (speed < dead && prev && prev.index != null) {
    return { index: prev.index, name: order[prev.index], flip: false };
  }
  let ang = Math.atan2(-vz, vx);
  if (ang < 0) ang += Math.PI * 2;
  const step = (Math.PI * 2) / n;
  const hyst = opts.hysteresis != null ? opts.hysteresis : step * 0.22;
  if (prev && prev.index != null && prev.index >= 0 && prev.index < n) {
    const center = prev.index * step;
    let d = ang - center;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= step / 2 + hyst) {
      return { index: prev.index, name: order[prev.index], flip: false };
    }
  }
  let idx = Math.round(ang / step) % n;
  if (idx < 0) idx += n;
  return { index: idx, name: order[idx], flip: false };
}

function flip1(vx, prevFlip, opts) {
  const h = (opts && opts.flipHysteresis) != null ? opts.flipHysteresis : 0.08;
  if (prevFlip === true) return vx <= h;
  if (prevFlip === false) return vx < -h;
  return vx < 0;
}

export function createController(sheet, opts) {
  opts = opts || {};
  const states = (sheet && sheet.states) || { idle: [0] };
  const fpsBy = (sheet && sheet.fpsByState) || {};
  const defaultFps = (sheet && typeof sheet.fps === 'number') ? sheet.fps : 8;
  const blendDur = opts.blend != null ? opts.blend : 0.1;
  const firstState = actionsOf(sheet)[0] || 'idle';
  const ctrl = {
    sheet: sheet,
    state: firstState,
    cursor: 0,
    frame: 0,
    accum: 0,
    dir: 0,
    flip: false,
    blend: 0,
    blendFrom: null
  };
  const seq0 = states[ctrl.state] || [0];
  ctrl.frame = seq0[0] || 0;

  ctrl.setState = function (name) {
    if (!states[name] || name === ctrl.state) return ctrl;
    ctrl.blendFrom = { state: ctrl.state, frame: ctrl.frame, cursor: ctrl.cursor, dir: ctrl.dir, flip: ctrl.flip };
    ctrl.blend = blendDur;
    ctrl.state = name;
    ctrl.cursor = 0;
    ctrl.accum = 0;
    const seq = states[name];
    ctrl.frame = seq[0] || 0;
    return ctrl;
  };

  ctrl.setDir = function (vx, vz) {
    const order = dirOrder(sheet);
    const r = chooseDir(vx, vz, { index: ctrl.dir, flip: ctrl.flip }, {
      dirOrder: dirCount(sheet) <= 1 ? ['e'] : order,
      hysteresis: opts.hysteresis,
      flipHysteresis: opts.flipHysteresis,
      deadzone: opts.deadzone
    });
    if (dirCount(sheet) <= 1) {
      ctrl.dir = 0;
      ctrl.flip = r.flip;
    } else {
      ctrl.dir = r.index;
      ctrl.flip = false;
    }
    return { dir: ctrl.dir, flip: ctrl.flip, name: dirOrder(sheet)[ctrl.dir] };
  };

  ctrl.tick = function (dt) {
    if (dt < 0) dt = 0;
    const seq = states[ctrl.state] || [0];
    const fps = fpsBy[ctrl.state] != null ? fpsBy[ctrl.state] : defaultFps;
    const prevCursor = ctrl.cursor;
    const prevFrame = ctrl.frame;
    const loop = sheet.loop !== false;
    if (fps > 0 && seq.length > 1) {
      ctrl.accum += dt;
      const step = 1 / fps;
      /* Advance at most one frame per tick so a hitch cannot skip or reverse. */
      if (ctrl.accum >= step) {
        ctrl.accum -= step;
        if (ctrl.accum >= step) ctrl.accum = step * 0.999;
        if (!loop && ctrl.cursor >= seq.length - 1) {
          ctrl.cursor = seq.length - 1;
        } else {
          ctrl.cursor = (ctrl.cursor + 1) % seq.length;
        }
        ctrl.frame = seq[ctrl.cursor];
      }
    } else {
      ctrl.frame = seq[ctrl.cursor] || seq[0] || 0;
    }
    if (ctrl.blend > 0) {
      ctrl.blend -= dt;
      if (ctrl.blend <= 0) { ctrl.blend = 0; ctrl.blendFrom = null; }
    }
    const cursorDelta = ctrl.cursor - prevCursor;
    const wrapped = prevCursor === seq.length - 1 && ctrl.cursor === 0;
    return {
      frame: ctrl.frame,
      prevFrame: prevFrame,
      cursor: ctrl.cursor,
      prevCursor: prevCursor,
      cursorDelta: wrapped ? 1 - seq.length : cursorDelta,
      jumped: !wrapped && Math.abs(cursorDelta) > 1,
      reversed: !wrapped && cursorDelta < 0,
      state: ctrl.state,
      dir: ctrl.dir,
      flip: ctrl.flip,
      blend: ctrl.blend,
      blendFrom: ctrl.blendFrom,
      uv: frameUV(sheet, ctrl.frame, ctrl.dir),
      file: fileForDir(sheet, ctrl.dir)
    };
  };

  ctrl.uv = function () { return frameUV(sheet, ctrl.frame, ctrl.dir); };
  return ctrl;
}

const Anim = {
  DEFAULT_DIR_ORDER, dirCount, dirOrder, layoutOf, frameCount, actionsOf,
  fileForDir, frameUV, chooseDir, createController
};
export default Anim;
