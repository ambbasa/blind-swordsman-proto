/**
 * v2/js/bossFx.js
 * 심안(SIMAN) v0.52 — 보스 전용 수묵·주홍·금박 스킬 이펙트 & 원글랜스 타이밍 가독성 엔진.
 *
 * 커스텀 수묵 에셋(v2/assets/boss-fx/) + 2D 붓글씨 레이어 결합:
 * - boss-mandala.webp  : 내려찍기·장판·영창·기모으기 회전 진법 데칼
 * - boss-impact.webp   : 내려찍기·장판 폭발 지면 균열 크레이터
 * - boss-talisman.webp : 비행 살부적 투사체 (일반 주홍 / 패링 가능 금빛)
 * - boss-wave.webp     : 언월 횡참·2페이즈 돌진 마무리 초승달 검기 파동
 *
 * 가독성 & 타이밍 시스템:
 * - drawSkillBanner    : 상단 통합 스킬명 + 대응 배지(회피/받아치기/파훼) + 정밀 타이밍 바
 * - 수렴 타이밍 링     : 모든 예고 장판·돌진·횡참에 f→1.0 백금 타이밍 선 + 마지막 0.22초 섬광
 * - spawnDamageNumber  : 보스 HP 타격 시 일반 / 약점(빈틈 ×1.3) 플로팅 데미지 팝업
 */

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function easeOut(k) { return 1 - (1 - k) * (1 - k); }

function groundPoly(ctx, project, cx, cz, R, segs, rot) {
  const n = segs || 36, r0 = rot || 0;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = r0 + (i / n) * Math.PI * 2;
    const p = project(cx + Math.cos(a) * R, cz + Math.sin(a) * R, 0.04);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

function loadSprite(url) {
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  return img;
}

function spriteReady(img) {
  return !!(img && img.complete && img.naturalWidth > 0);
}

/* 화면 투영 기준 바닥 원형 에셋 그리기 (원근 압축비 자동 계산) */
function drawGroundSprite(ctx, project, img, cx, cz, R, rot, alpha, composite) {
  if (!spriteReady(img)) return false;
  const c = project(cx, cz, 0.04);
  const px = project(cx + R, cz, 0.04);
  const pz = project(cx, cz + R, 0.04);
  const rx = Math.hypot(px.x - c.x, px.y - c.y);
  const ry = Math.hypot(pz.x - c.x, pz.y - c.y);
  const radX = Math.max(8, (rx + ry) * 0.56);
  const radY = Math.max(5, radX * 0.56);
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  if (composite && composite !== 'source-over') ctx.globalCompositeOperation = composite;
  ctx.translate(c.x, c.y);
  ctx.scale(1, radY / radX);
  ctx.rotate(rot || 0);
  ctx.drawImage(img, -radX, -radX, radX * 2, radX * 2);
  ctx.restore();
  return true;
}

const BANNER_STYLE = {
  dodge:  { tag: '회피',     accent: '#f05a42', bg: 'rgba(54,16,14,0.88)',  border: 'rgba(244,96,70,0.92)',  hint: '일섬으로 벗어나라' },
  parry:  { tag: '받아치기', accent: '#f6d268', bg: 'rgba(46,34,12,0.90)',  border: 'rgba(248,212,102,0.95)', hint: '금빛 구간에서 화면 탭!' },
  break:  { tag: '파훼',     accent: '#5ce8c4', bg: 'rgba(12,38,34,0.88)',  border: 'rgba(92,232,196,0.92)',  hint: '뜬 무늬를 그려 끊어라' },
  seal:   { tag: '봉인',     accent: '#ffd872', bg: 'rgba(44,30,10,0.92)',  border: 'rgba(255,222,120,0.98)', hint: '별(★)을 그려 마무리!' }
};

/* v0.53: 직선 피자 조각 대신 손붓으로 쓸어낸 동양 수묵 초승달 횡참 3D 바닥 텍스처 생성 */
function makeSweepBrushTex(THREE) {
  if (typeof document === 'undefined') return null;
  const sz = 512, c = document.createElement('canvas');
  c.width = sz; c.height = sz;
  const ctx = c.getContext('2d');
  const cx = sz * 0.5, cy = sz * 0.5, R = sz * 0.45;
  const half = 1.05; /* ~120도 호, +X 방향 중심 */

  /* 1) 바깥쪽 칼날 호로 갈수록 짙어지고 안쪽은 투명하게 번지는 수묵·주홍 워시 (직선 모서리 없음!) */
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, -half, half, false);
  ctx.arc(cx, cy, R * 0.28, half, -half, true);
  ctx.closePath();
  const rg = ctx.createRadialGradient(cx, cy, R * 0.25, cx, cy, R);
  rg.addColorStop(0.0, 'rgba(180,34,24,0.0)');
  rg.addColorStop(0.45, 'rgba(176,34,26,0.14)');
  rg.addColorStop(0.82, 'rgba(196,42,30,0.34)');
  rg.addColorStop(0.95, 'rgba(232,68,44,0.58)');
  rg.addColorStop(1.0, 'rgba(232,68,44,0.0)');
  ctx.fillStyle = rg;
  ctx.fill();

  /* 2) 갈필(건필) 먹붓 호선 6겹 — 자연스럽게 양 끝이 가늘어지는 동양 수묵 초승달 */
  const steps = 48;
  for (let b = 0; b < 6; b++) {
    const rFrac = 0.54 + b * 0.082;
    const isInk = b % 2 === 0;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const a0 = -half * 0.96 + t0 * half * 1.92;
      const a1 = -half * 0.96 + t1 * half * 1.92;
      const env = Math.sin(((t0 + t1) * 0.5) * Math.PI); /* 양 끝 테이퍼 */
      const jitter = Math.sin(i * 1.9 + b * 2.7) * 5;
      const rad0 = R * rFrac + jitter;
      const rad1 = R * rFrac + Math.sin((i + 1) * 1.9 + b * 2.7) * 5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * rad0, cy + Math.sin(a0) * rad0);
      ctx.lineTo(cx + Math.cos(a1) * rad1, cy + Math.sin(a1) * rad1);
      ctx.lineCap = 'round';
      ctx.lineWidth = (isInk ? 9 : 5.5) * (0.25 + 0.95 * env);
      ctx.strokeStyle = isInk
        ? ('rgba(22,12,12,' + (0.48 * env).toFixed(3) + ')')
        : ('rgba(246,88,56,' + (0.68 * env).toFixed(3) + ')');
      ctx.stroke();
    }
  }

  /* 3) 외곽 날카로운 주홍·먹 초승달 날(끝단으로 갈수록 자연 소멸) */
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const a0 = -half + t0 * half * 2;
    const a1 = -half + t1 * half * 2;
    const env = Math.sin(((t0 + t1) * 0.5) * Math.PI);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * R * 0.96, cy + Math.sin(a0) * R * 0.96);
    ctx.lineTo(cx + Math.cos(a1) * R * 0.96, cy + Math.sin(a1) * R * 0.96);
    ctx.lineWidth = 11 * env + 1;
    ctx.strokeStyle = 'rgba(255,152,96,' + (0.72 * env).toFixed(3) + ')';
    ctx.stroke();
  }
  ctx.restore();

  const tx = new THREE.CanvasTexture(c);
  if ('colorSpace' in tx && THREE.SRGBColorSpace) tx.colorSpace = THREE.SRGBColorSpace;
  tx.needsUpdate = true;
  return tx;
}

export class BossFx {
  constructor() {
    this.events = [];
    this.chargeTrail = [];
    this.dmgNums = [];
    this.ground3d = null;
    this.sprites = {
      mandala:  loadSprite('assets/boss-fx/boss-mandala.webp'),
      impact:   loadSprite('assets/boss-fx/boss-impact.webp'),
      talisman: loadSprite('assets/boss-fx/boss-talisman.webp'),
      wave:     loadSprite('assets/boss-fx/boss-wave.webp')
    };
  }

  /* v0.52.1: 보스 마법진·균열 크레이터를 Three.js 실제 바닥(y=0.055, depthTest=true)에 배치해
     주인공·보스 3D 모델이 항상 마법진 위로 선명히 렌더링되도록(절대 가리지 않도록) 보장한다. */
  attachScene(THREE, scene) {
    if (!THREE || !scene || this.ground3d) return;
    const loader = new THREE.TextureLoader();
    const loadTex = function (url) {
      const tx = loader.load(url);
      if ('colorSpace' in tx && THREE.SRGBColorSpace) tx.colorSpace = THREE.SRGBColorSpace;
      return tx;
    };
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    const mandalaTex = loadTex('assets/boss-fx/boss-mandala.webp');
    const impactTex = loadTex('assets/boss-fx/boss-impact.webp');
    const sweepTex = makeSweepBrushTex(THREE);

    const makePlane = function (tex, y) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0,
        depthWrite: false, depthTest: true, side: THREE.DoubleSide
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 2;
      scene.add(m);
      return m;
    };

    const bossMandala = makePlane(mandalaTex, 0.056);
    const sweepMesh = makePlane(sweepTex, 0.054);
    const hazardPool = [];
    for (let i = 0; i < 6; i++) hazardPool.push(makePlane(mandalaTex, 0.052));
    const impactPool = [];
    for (let i = 0; i < 6; i++) impactPool.push({ mesh: makePlane(impactTex, 0.060), active: false, x: 0, z: 0, r: 3, t: 0, dur: 1.2, seed: 0 });

    this.ground3d = { bossMandala, sweepMesh, hazardPool, impactPool };
  }

  spawnImpact3D(x, z, r, dur) {
    const g = this.ground3d;
    if (!g) return;
    let slot = g.impactPool.find(function (s) { return !s.active; });
    if (!slot) slot = g.impactPool.reduce(function (a, b) { return a.t > b.t ? a : b; });
    slot.active = true;
    slot.x = x; slot.z = z; slot.r = r || 3.0;
    slot.t = 0; slot.dur = dur || 1.25;
    slot.seed = Math.random() * 6.28;
    slot.mesh.visible = true;
    slot.mesh.position.set(x, 0.060, z);
    slot.mesh.rotation.y = slot.seed;
  }

  syncGround3D(boss, hazards, t, dt, slamR) {
    const g = this.ground3d;
    if (!g) return;
    /* 1) 보스 메인 마법진 (내려찍기·영창·기모으기·부적 난사) — 바닥에 깔려 주인공/보스를 절대 가리지 않음 */
    const bm = g.bossMandala;
    const sw = g.sweepMesh;
    if (boss && boss.alive && !boss.hidden) {
      let show = false, bx = boss.x, bz = boss.z, R = 2.6, rot = (t || 0) * 0.65, op = 0.72;
      if (boss.state === 'slamTele' && boss.slam) {
        const u = clamp((boss.stateT || 0) / Math.max(0.01, boss.slam.tele), 0, 1);
        show = true; bx = boss.slam.x; bz = boss.slam.z;
        R = (slamR || 3.2) * 1.04; rot = (t || 0) * 0.85; op = 0.48 + 0.44 * u;
      } else if (boss.state === 'chant' && boss.chant) {
        show = true; bx = boss.x; bz = boss.z;
        R = 2.7 + 0.25 * Math.sin((t || 0) * 4); rot = (t || 0) * 0.55; op = 0.78;
      } else if (boss.state === 'kiai' && boss.kiai) {
        const u = clamp((boss.stateT || 0) / Math.max(0.01, boss.kiai.t), 0, 1);
        show = true; bx = boss.x; bz = boss.z;
        R = 3.2 - 0.8 * u; rot = -(t || 0) * 1.15; op = 0.55 + 0.35 * u;
      } else if (boss.state === 'volleyTele') {
        const u = clamp((boss.stateT || 0) / Math.max(0.01, boss.volleyTele || 0.8), 0, 1);
        show = true; bx = boss.x; bz = boss.z;
        R = 2.35 + 0.35 * u; rot = (t || 0) * 1.1; op = 0.45 + 0.42 * u;
      }
      bm.visible = show;
      if (show) {
        bm.position.set(bx, 0.056, bz);
        bm.scale.set(R, 1, R);
        bm.rotation.y = rot;
        bm.material.opacity = op;
      }
      /* 1.5) v0.53 언월 횡참 수묵 초승달 3D 바닥 데칼 (주인공/보스 아래) */
      if (sw) {
        if (boss.state === 'sweepTele' && boss.sweep) {
          const u = clamp((boss.stateT || 0) / Math.max(0.01, boss.sweep.tele), 0, 1);
          const sr = (boss.sweep.range || 6.0) * 1.08;
          sw.visible = true;
          sw.position.set(boss.x, 0.054, boss.z);
          sw.scale.set(sr, 1, sr);
          /* PlaneGeometry rotateX(-PI/2)는 캔버스 +X가 월드 +X, 캔버스 +Y가 월드 +Z -> rotation.y = -aimA */
          sw.rotation.y = -(boss.sweep.aimA || 0);
          sw.material.opacity = 0.50 + 0.46 * u;
        } else {
          sw.visible = false;
        }
      }
    } else {
      bm.visible = false;
      if (sw) sw.visible = false;
    }

    /* 2) 다중 장판 마법진 풀 */
    const activeH = (hazards || []).filter(function (h) { return h && !h.done && !h.dead; });
    for (let i = 0; i < g.hazardPool.length; i++) {
      const m = g.hazardPool[i];
      const h = activeH[i];
      if (!h) { m.visible = false; continue; }
      const u = clamp(h.t / Math.max(0.01, h.delay), 0, 1);
      m.visible = true;
      m.position.set(h.x, 0.052, h.z);
      m.scale.set(h.r * 1.02, 1, h.r * 1.02);
      m.rotation.y = (t || 0) * 0.8 + i;
      m.material.opacity = 0.42 + 0.46 * u;
    }

    /* 3) 지면 균열 크레이터 풀 */
    for (let i = 0; i < g.impactPool.length; i++) {
      const s = g.impactPool[i];
      if (!s.active) { s.mesh.visible = false; continue; }
      s.t += dt || 0;
      const k = clamp(s.t / s.dur, 0, 1);
      if (k >= 1) { s.active = false; s.mesh.visible = false; continue; }
      const u = easeOut(Math.min(1, k * 1.4));
      const sc = s.r * (0.85 + 0.35 * u);
      s.mesh.scale.set(sc, 1, sc);
      s.mesh.material.opacity = (1 - k) * 0.92;
    }
  }

  clear() {
    this.events.length = 0;
    this.chargeTrail.length = 0;
    this.dmgNums.length = 0;
    if (this.ground3d) {
      this.ground3d.bossMandala.visible = false;
      if (this.ground3d.sweepMesh) this.ground3d.sweepMesh.visible = false;
      this.ground3d.hazardPool.forEach(function (m) { m.visible = false; });
      this.ground3d.impactPool.forEach(function (s) { s.active = false; s.mesh.visible = false; });
    }
  }

  pushChargePoint(x, z, color) {
    this.chargeTrail.push({ x, z, t: 0, dur: 0.44, color: color || 'crimson' });
    if (this.chargeTrail.length > 28) this.chargeTrail.shift();
  }

  spawnDamageNumber(x, z, amount, isWeak) {
    const val = Math.max(0.1, Number(amount) || 0);
    const txt = val >= 10 ? String(Math.round(val)) : (val.toFixed(1).replace(/\.0$/, ''));
    this.dmgNums.push({
      x: x + (Math.random() - 0.5) * 0.7,
      z: z + (Math.random() - 0.5) * 0.5,
      y: 2.2 + Math.random() * 0.4,
      text: '-' + txt + (isWeak ? ' 약점!' : ''),
      weak: !!isWeak,
      t: 0,
      dur: isWeak ? 0.92 : 0.72
    });
    if (this.dmgNums.length > 18) this.dmgNums.shift();
  }

  triggerSlamImpact(x, z, r) {
    this.spawnImpact3D(x, z, r || 3.0, 1.35);
    this.events.push({ kind: 'slam', x, z, r: r || 3.0, t: 0, dur: 1.05, seed: Math.random() * 6.28 });
    this.events.push({ kind: 'kanji', text: '轟', x, z, y: 1.6, color: [236, 78, 54], rim: [255, 218, 136], t: 0, dur: 0.78 });
  }

  triggerSweepBurst(x, z, aimA, range) {
    this.events.push({ kind: 'sweep', x, z, ang: aimA || 0, r: range || 5.8, t: 0, dur: 0.58 });
    this.events.push({ kind: 'kanji', text: '斬', x, z, y: 1.7, color: [244, 84, 58], rim: [255, 224, 148], t: 0, dur: 0.68 });
  }

  triggerKiaiBurst(x, z, parried) {
    this.events.push({
      kind: 'wave', x, z, r: parried ? 5.8 : 8.8,
      color: parried ? [246, 206, 92] : [224, 68, 48],
      t: 0, dur: 0.68
    });
    this.events.push({
      kind: 'kanji', text: parried ? '破' : '喝', x, z, y: 1.9,
      color: parried ? [255, 228, 122] : [238, 84, 60],
      rim: parried ? [255, 250, 220] : [24, 14, 12],
      t: 0, dur: 0.78
    });
  }

  triggerHazardBlast(x, z, r) {
    this.spawnImpact3D(x, z, r || 2.5, 0.95);
    this.events.push({ kind: 'slam', x, z, r: r || 2.5, t: 0, dur: 0.85, seed: Math.random() * 6.28, minor: true });
  }

  triggerGroggyBreak(x, z) {
    this.events.push({ kind: 'wave', x, z, r: 5.5, color: [244, 204, 96], t: 0, dur: 0.74 });
    this.events.push({ kind: 'kanji', text: '崩', x, z, y: 2.1, color: [248, 212, 102], rim: [20, 14, 10], t: 0, dur: 0.84 });
  }

  triggerSmokeBurst(x, z, jade) {
    this.events.push({ kind: 'smoke', x, z, r: 2.4, jade: !!jade, t: 0, dur: 0.55, seed: Math.random() * 6.28 });
  }

  /* =====================================================================
   * v0.52 통합 원글랜스 스킬 예고 & 타이밍 배너 (상단 보스 HP 바 바로 아래)
   * info: { mode: 'dodge'|'parry'|'break'|'seal', name, hint, f, sweetStart, sweetOpen, urgent }
   * ===================================================================== */
  drawSkillBanner(ctx, r, info, t) {
    if (!info) return;
    const S = BANNER_STYLE[info.mode] || BANNER_STYLE.dodge;
    const f = clamp(info.f || 0, 0, 1);
    const sweet = info.sweetStart != null ? clamp(info.sweetStart, 0, 0.95) : 0.78;
    const isNow = !!info.sweetOpen || (info.mode === 'dodge' && f >= sweet);
    const pulse = 0.5 + 0.5 * Math.sin((t || 0) * 26);

    const w = Math.min(312, r.width - 28);
    const h = 42;
    const x = (r.width - w) * 0.5;
    const y = 76;

    ctx.save();
    /* 배경 패널 (한지 먹프레임 + 반응 순간 밝은 금/주홍 맥동) */
    ctx.fillStyle = isNow
      ? (info.mode === 'parry' ? 'rgba(96,68,14,0.95)' : 'rgba(92,20,16,0.95)')
      : S.bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
    else ctx.rect(x, y, w, h);
    ctx.fill();

    ctx.strokeStyle = isNow ? ('rgba(255,244,196,' + (0.75 + 0.25 * pulse).toFixed(3) + ')') : S.border;
    ctx.lineWidth = isNow ? 2.5 : 1.5;
    ctx.stroke();

    /* 왼쪽 대응 배지 ([회피] / [받아치기] / [파훼] / [봉인]) */
    const bw = 62;
    ctx.fillStyle = S.accent;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x + 6, y + 6, bw, 20, 4);
    else ctx.rect(x + 6, y + 6, bw, 20);
    ctx.fill();
    ctx.font = '700 11.5px "InkSerif", serif';
    ctx.fillStyle = '#140f0c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(S.tag, x + 6 + bw * 0.5, y + 16);

    /* 중앙 스킬명 + 오른쪽 즉시 행동 문구 */
    ctx.textAlign = 'left';
    ctx.font = '700 13px "InkSerif", serif';
    ctx.fillStyle = '#f6ebd4';
    ctx.fillText(info.name || '', x + bw + 14, y + 16);

    ctx.textAlign = 'right';
    ctx.font = isNow ? '700 12.5px "InkSerif", serif' : '600 11px sans-serif';
    ctx.fillStyle = isNow ? '#fff2b0' : 'rgba(244,232,206,0.88)';
    const rightTxt = isNow
      ? (info.mode === 'parry' ? '★ 지금 탭! ★' : (info.mode === 'dodge' ? '지금 회피!' : (info.hint || S.hint)))
      : (info.hint || S.hint);
    ctx.fillText(rightTxt, x + w - 9, y + 16);

    /* 하단 정밀 타이밍 게이지 바 */
    const bx = x + 6, by = y + 31, barW = w - 12, barH = 6;
    ctx.fillStyle = 'rgba(10,8,8,0.72)';
    ctx.fillRect(bx, by, barW, barH);

    /* 반응 스위트스팟(금빛 패링 창 / 직전 회피 창) 구간 표시 */
    if (info.mode === 'parry' || info.mode === 'dodge') {
      const sx = bx + barW * sweet;
      const sw = barW * (1 - sweet);
      ctx.fillStyle = info.mode === 'parry'
        ? ('rgba(255,222,102,' + (isNow ? 0.92 : 0.45).toFixed(3) + ')')
        : ('rgba(255,146,112,' + (isNow ? 0.85 : 0.35).toFixed(3) + ')');
      ctx.fillRect(sx, by, sw, barH);
    }

    /* 진행 채움 */
    ctx.fillStyle = isNow ? '#fff4be' : S.accent;
    ctx.fillRect(bx, by, barW * f, barH);

    /* 현재 타이밍 커서(흰 세로 눈금) */
    const cx = bx + barW * f;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 1.5, by - 2, 3, barH + 4);
    ctx.restore();
  }

  /* 내려찍기 예고: 3D 바닥 마법진(주인공 아래) + 2D는 얇은 경계선·수렴 백금 타이밍 링만 그려 캐릭터 가림 0% */
  drawSlamTele(ctx, project, x, z, R, f, t) {
    const u = clamp(f, 0, 1);
    const urgent = u >= 0.78;
    ctx.save();
    /* 1) 아주 옅은 내부 경고 워시 (캐릭터 시인성 유지) */
    groundPoly(ctx, project, x, z, Math.max(0.25, R * u), 36, t * 0.5);
    ctx.fillStyle = urgent
      ? 'rgba(232,58,38,' + (0.11 + 0.08 * Math.sin(t * 36)).toFixed(3) + ')'
      : 'rgba(186,34,24,' + (0.04 + 0.06 * u).toFixed(3) + ')';
    ctx.fill();

    /* 2) 고정 외곽 위험 경계선 */
    groundPoly(ctx, project, x, z, R, 42, 0);
    ctx.strokeStyle = 'rgba(14,9,9,0.72)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = urgent ? 'rgba(255,238,180,0.98)' : ('rgba(246,84,56,' + (0.72 + 0.28 * u).toFixed(3) + ')');
    ctx.lineWidth = urgent ? 3.0 : 2.3;
    ctx.stroke();

    /* 3) 수렴 백금 타이밍 링 (f → 1.0) */
    groundPoly(ctx, project, x, z, Math.max(0.18, R * u), 38, -t * 0.4);
    ctx.strokeStyle = urgent ? 'rgba(255,252,232,0.98)' : 'rgba(255,214,132,0.88)';
    ctx.lineWidth = urgent ? 2.8 : 2.0;
    ctx.stroke();
    ctx.restore();
  }

  /* 돌진/흉내 예고: 테이퍼 수묵 주홍 레인 + 전진 백금 타이밍 스윕 바 */
  drawChargeTele(ctx, project, bx, bz, ax, az, f, t) {
    const dx = ax - bx, dz = az - bz, L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    const len = Math.max(7.5, Math.min(13.5, L + 3.2));
    const hw = 0.92;
    const u = clamp(f, 0, 1);
    const urgent = u >= 0.78;

    const c0 = project(bx + nx * hw * 0.75, bz + nz * hw * 0.75, 0.05);
    const c1 = project(bx - nx * hw * 0.75, bz - nz * hw * 0.75, 0.05);
    const c2 = project(bx + ux * len - nx * hw * 1.05, bz + uz * len - nz * hw * 1.05, 0.05);
    const c3 = project(bx + ux * len + nx * hw * 1.05, bz + uz * len + nz * hw * 1.05, 0.05);

    ctx.save();
    /* 고정 위험 레인 외곽 (바닥 틴트는 옅게 유지해 주인공 실루엣을 가리지 않음) */
    ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.closePath();
    ctx.fillStyle = urgent ? 'rgba(220,44,30,0.16)' : ('rgba(186,30,22,' + (0.06 + 0.08 * u).toFixed(3) + ')');
    ctx.fill();
    ctx.strokeStyle = 'rgba(16,10,10,0.72)';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = urgent ? 'rgba(255,240,186,0.96)' : ('rgba(246,84,58,' + (0.65 + 0.35 * u).toFixed(3) + ')');
    ctx.lineWidth = urgent ? 2.8 : 2.1;
    ctx.stroke();

    /* 타이밍에 맞춰 차오르는 전진 채움 바 (끝에 도달하면 돌진 발사!) */
    const fillL = len * u;
    const f2 = project(bx + ux * fillL - nx * hw * (0.75 + 0.3 * u), bz + uz * fillL - nz * hw * (0.75 + 0.3 * u), 0.06);
    const f3 = project(bx + ux * fillL + nx * hw * (0.75 + 0.3 * u), bz + uz * fillL + nz * hw * (0.75 + 0.3 * u), 0.06);
    ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(f2.x, f2.y); ctx.lineTo(f3.x, f3.y); ctx.closePath();
    ctx.fillStyle = urgent ? 'rgba(255,212,138,0.36)' : 'rgba(236,68,46,0.22)';
    ctx.fill();

    /* 선단 백금 타이밍 선 */
    ctx.beginPath(); ctx.moveTo(f2.x, f2.y); ctx.lineTo(f3.x, f3.y);
    ctx.strokeStyle = urgent ? '#fff8d4' : 'rgba(255,218,142,0.92)';
    ctx.lineWidth = urgent ? 4.2 : 2.8;
    ctx.stroke();

    /* 방향 화살 3개 */
    for (let k = 0; k < 3; k++) {
      const s = ((t * 2.4 + k / 3) % 1) * len;
      const tip = project(bx + ux * (s + 0.65), bz + uz * (s + 0.65), 0.06);
      const lft = project(bx + ux * s + nx * 0.56, bz + uz * s + nz * 0.56, 0.06);
      const rgt = project(bx + ux * s - nx * 0.56, bz + uz * s - nz * 0.56, 0.06);
      ctx.beginPath(); ctx.moveTo(lft.x, lft.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(rgt.x, rgt.y);
      ctx.strokeStyle = urgent ? 'rgba(255,244,196,0.95)' : ('rgba(255,220,148,' + (0.45 + 0.45 * u).toFixed(3) + ')');
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* v0.53: 언월 횡참(sweepTele) — 직선 피자 조각 제거!
     3D 바닥의 수묵 초승달 붓결(sweepMesh) 위에, 수렴하는 가느다란 백금 초승달 칼날 호선만 그려낸다. */
  drawSweepTele(ctx, project, bx, bz, aimA, arcSpan, range, f, t) {
    const u = clamp(f, 0, 1);
    const urgent = u >= 0.78;
    const half = (arcSpan || 2.1) * 0.5;
    const R = range || 6.0;
    const segs = 26;

    ctx.save();
    ctx.lineCap = 'round';
    /* 1) 바깥쪽 칼날 끝 경계 — 양 끝이 자연스럽게 가늘어지는 초승달 붓선 (직선 옆면 없음!) */
    for (let i = 0; i < segs; i++) {
      const k0 = i / segs, k1 = (i + 1) / segs;
      const a0 = aimA - half + k0 * half * 2;
      const a1 = aimA - half + k1 * half * 2;
      const env = Math.sin(((k0 + k1) * 0.5) * Math.PI);
      const p0 = project(bx + Math.cos(a0) * R, bz + Math.sin(a0) * R, 0.06);
      const p1 = project(bx + Math.cos(a1) * R, bz + Math.sin(a1) * R, 0.06);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = 'rgba(18,10,10,' + (0.62 * env).toFixed(3) + ')';
      ctx.lineWidth = 6.5 * env + 0.8;
      ctx.stroke();
      ctx.strokeStyle = urgent
        ? ('rgba(255,244,196,' + (0.98 * env).toFixed(3) + ')')
        : ('rgba(244,86,58,' + (0.86 * env).toFixed(3) + ')');
      ctx.lineWidth = (urgent ? 3.8 : 2.6) * env + 0.5;
      ctx.stroke();
    }

    /* 2) 안쪽에서 바깥 칼날로 차오르는 수렴 백금 타이밍 초승달 호 (f → 1.0) */
    const rNow = R * (0.30 + 0.70 * u);
    for (let i = 0; i < segs; i++) {
      const k0 = i / segs, k1 = (i + 1) / segs;
      const a0 = aimA - half * 0.96 + k0 * half * 1.92;
      const a1 = aimA - half * 0.96 + k1 * half * 1.92;
      const env = Math.sin(((k0 + k1) * 0.5) * Math.PI);
      const p0 = project(bx + Math.cos(a0) * rNow, bz + Math.sin(a0) * rNow, 0.08);
      const p1 = project(bx + Math.cos(a1) * rNow, bz + Math.sin(a1) * rNow, 0.08);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = urgent
        ? ('rgba(255,252,224,' + (0.98 * env).toFixed(3) + ')')
        : ('rgba(255,214,132,' + (0.88 * env).toFixed(3) + ')');
      ctx.lineWidth = (urgent ? 4.4 : 2.8) * env + 0.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 기모으기(kiai): 3D 바닥 만다라(주인공 아래) + 2D 12갈래 소용돌이 + 수렴 패링 고리 + '지금 탭!' 주인공 링 */
  drawKiaiVortex(ctx, project, bx, bz, f, open, t, heroPos) {
    const u = clamp(f, 0, 1);
    const center = project(bx, bz, 1.0);
    ctx.save();

    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2 + t * 2.8;
      const rad0 = (3.6 - 1.9 * u) * (0.8 + 0.25 * (i % 3));
      const rad1 = Math.max(0.35, rad0 - 1.35);
      const p0 = project(bx + Math.cos(a0) * rad0, bz + Math.sin(a0) * rad0, 0.25 + (i % 3) * 0.35);
      const p1 = project(bx + Math.cos(a0 + 0.45) * rad1, bz + Math.sin(a0 + 0.45) * rad1, 0.9);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo((p0.x + center.x) * 0.5, (p0.y + center.y) * 0.5 - 12, p1.x, p1.y);
      ctx.strokeStyle = open
        ? 'rgba(255,232,126,' + (0.65 + 0.35 * Math.sin(t * 24 + i)).toFixed(3) + ')'
        : (i % 2 ? 'rgba(232,188,78,0.55)' : 'rgba(20,14,12,0.58)');
      ctx.lineWidth = open ? 3.0 : 2.0;
      ctx.stroke();
    }

    /* 안쪽 고정 금빛 패링 타겟 링 + 수렴하는 바깥 링 */
    groundPoly(ctx, project, bx, bz, 1.35, 36, 0);
    ctx.strokeStyle = open ? 'rgba(255,244,172,0.98)' : 'rgba(232,192,74,0.65)';
    ctx.lineWidth = open ? 4.8 : 2.4;
    ctx.stroke();

    groundPoly(ctx, project, bx, bz, Math.max(1.35, 3.6 - 2.25 * u), 36, t);
    ctx.strokeStyle = open ? '#ffffff' : 'rgba(255,212,118,0.88)';
    ctx.lineWidth = open ? 3.2 : 2.2;
    ctx.stroke();

    /* 패링 창이 열린 순간 — 주인공 주위에도 금빛 공명 링 + '지금 탭!' 즉시 표시 */
    if (open && heroPos) {
      const hp = project(heroPos.x, heroPos.z, 1.6);
      const pulse = 0.5 + 0.5 * Math.sin(t * 28);
      groundPoly(ctx, project, heroPos.x, heroPos.z, 1.65 + 0.25 * pulse, 32, t * 2);
      ctx.strokeStyle = 'rgba(255,232,118,' + (0.7 + 0.3 * pulse).toFixed(3) + ')';
      ctx.lineWidth = 4.2;
      ctx.stroke();

      ctx.font = '700 18px "InkSerif", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(14,10,8,0.92)';
      ctx.strokeText('破 · 지금 탭!', hp.x, hp.y - 26);
      ctx.fillStyle = '#ffe580';
      ctx.fillText('破 · 지금 탭!', hp.x, hp.y - 26);
    }
    ctx.restore();
  }

  /* v0.53: 부적 탄막 예고 — 딱딱한 직선 레이저 제거!
     보스 주위에 부유하며 바깥을 조준하는 살부적 편대(boss-talisman.webp) + 짧은 갈필 먹연기 궤적 + 금빛 패링 예고 */
  drawVolleyTele(ctx, project, bx, bz, aimA, n, spread, f, t, goldMap) {
    const u = clamp(f, 0, 1);
    const urgent = u >= 0.78;
    const img = this.sprites.talisman;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const a = aimA + (n > 1 ? (i / (n - 1) - 0.5) : 0) * spread * 2;
      const isGold = !!(goldMap && goldMap[i]);
      const cosA = Math.cos(a), sinA = Math.sin(a);
      const nx = -sinA, nz = cosA;

      /* 1) 부적이 날아갈 방향을 암시하는 옅은 갈필 먹연기·주홍 꼬리 (딱딱한 직선 대신 부드러운 곡선 + 점차 소멸) */
      const startR = 1.35 + 0.35 * u;
      const endR = startR + 2.4 + 3.4 * u;
      const midR = (startR + endR) * 0.52;
      const sway = Math.sin(t * 9 + i * 1.4) * 0.24;
      const p0 = project(bx + cosA * startR, bz + sinA * startR, 0.72);
      const pm = project(bx + cosA * midR + nx * sway, bz + sinA * midR + nz * sway, 0.55);
      const p1 = project(bx + cosA * endR, bz + sinA * endR, 0.28);

      const g = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      if (isGold) {
        g.addColorStop(0, urgent ? 'rgba(255,244,172,0.92)' : 'rgba(255,216,104,0.78)');
        g.addColorStop(0.65, 'rgba(232,172,54,0.30)');
        g.addColorStop(1, 'rgba(232,172,54,0)');
      } else {
        g.addColorStop(0, urgent ? 'rgba(255,176,120,0.85)' : 'rgba(220,56,38,0.68)');
        g.addColorStop(0.6, 'rgba(30,14,12,0.28)');
        g.addColorStop(1, 'rgba(18,10,10,0)');
      }
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(pm.x, pm.y, p1.x, p1.y);
      ctx.strokeStyle = g;
      ctx.lineWidth = (isGold ? 4.2 : 3.2) * (0.7 + 0.5 * u);
      ctx.lineCap = 'round';
      ctx.stroke();

      /* 2) 발사 직전 공중에 정렬되어 떠 있는 살부적 에셋 (보스 주위 반원 편대) */
      const hoverR = 1.45 + 0.55 * easeOut(u);
      const hoverY = 0.85 + 0.35 * u + Math.sin(t * 10 + i) * 0.08;
      const tp = project(bx + cosA * hoverR, bz + sinA * hoverR, hoverY);
      const tip = project(bx + cosA * (hoverR + 1.0), bz + sinA * (hoverR + 1.0), hoverY);
      const scrAng = Math.atan2(tip.y - tp.y, tip.x - tp.x);

      if (isGold) {
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 13 + 3 * Math.sin(t * 22 + i), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,232,126,' + (0.65 + 0.35 * u).toFixed(3) + ')';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
      if (spriteReady(img)) {
        const sz = (isGold ? 28 : 22) * (0.75 + 0.35 * u);
        ctx.save();
        ctx.translate(tp.x, tp.y);
        ctx.rotate(scrAng + Math.PI * 0.5);
        ctx.globalAlpha = 0.6 + 0.4 * u;
        ctx.drawImage(img, -sz * 0.5, -sz * 0.5, sz, sz);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /* =====================================================================
   * v0.53 시선 고정대(주인공 바로 아래 · 엄지 위, 화면 64~70%) 전용 반응 HUD
   * 1) drawKiaiFocalGauge : 기모으기 대형 타이밍 게이지 + 금빛 스위트스팟
   * 2) drawGestureFocalDock : 영창(3무늬) · 합 겨루기 · 봉인(★) 대형 제스처 도크
   * ===================================================================== */
  drawKiaiFocalGauge(ctx, r, hs, f, g0, open, lock, t) {
    const u = clamp(f || 0, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin((t || 0) * 28);
    const w = Math.min(256, r.width - 56);
    const h = 48;
    const x = (r.width - w) * 0.5;
    const y = clamp((hs ? hs.y : r.height * 0.5) + 64, r.height * 0.58, r.height * 0.72);

    ctx.save();
    ctx.fillStyle = open && !lock ? 'rgba(92,64,12,0.94)' : 'rgba(22,16,14,0.88)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 10);
    else ctx.rect(x, y, w, h);
    ctx.fill();

    ctx.strokeStyle = open && !lock
      ? ('rgba(255,244,176,' + (0.75 + 0.25 * pulse).toFixed(3) + ')')
      : 'rgba(232,192,74,0.75)';
    ctx.lineWidth = open && !lock ? 2.6 : 1.6;
    ctx.stroke();

    /* 상단 안내 라벨 */
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = open && !lock ? '700 14px "InkSerif", serif' : '700 12.5px "InkSerif", serif';
    ctx.fillStyle = lock ? '#b2a89e' : (open ? '#fff2aa' : '#f4e6c8');
    const title = lock ? '기물 뒤로 피하라' : (open ? '★ 지금 화면 탭! (받아치기) ★' : '기합 폭발 — 금빛 칸에서 화면 탭!');
    ctx.fillText(title, r.width * 0.5, y + 15);

    /* 하단 굵고 선명한 타이밍 바 */
    const bx = x + 12, by = y + 29, barW = w - 24, barH = 11;
    ctx.fillStyle = 'rgba(10,8,8,0.82)';
    ctx.fillRect(bx, by, barW, barH);

    /* 금빛 패링 스위트스팟 영역 */
    const sx = bx + barW * clamp(g0 || 0.7, 0, 0.95);
    const sw = barW * (1 - clamp(g0 || 0.7, 0, 0.95));
    ctx.fillStyle = lock ? 'rgba(120,112,104,0.45)' : (open ? '#ffe47a' : 'rgba(246,204,88,0.58)');
    ctx.fillRect(sx, by, sw, barH);
    ctx.strokeStyle = 'rgba(255,246,200,0.85)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(sx, by, sw, barH);

    /* 차오르는 게이지 */
    ctx.fillStyle = lock ? '#8f8780' : (open ? '#ffffff' : '#e0583e');
    ctx.fillRect(bx, by + 2, barW * u, barH - 4);

    /* 흰색 타이밍 바늘 */
    const cx = bx + barW * u;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 2, by - 3, 4, barH + 6);
    ctx.restore();
  }

  drawGestureFocalDock(ctx, r, hs, want, t, brushMarkFn) {
    if (!want || !want.seq || !want.seq.length) return;
    const n = want.seq.length;
    const isSeal = want.kind === 'seal';
    const isClash = want.kind === 'clash';
    const accent = isSeal ? '#ffd86b' : (isClash ? '#f6d268' : '#5ce8c4');
    const gap = 64;
    const dockW = Math.max(206, n * gap + 56);
    const dockH = 88;
    const x = (r.width - dockW) * 0.5;
    const y = clamp((hs ? hs.y : r.height * 0.5) + 56, r.height * 0.56, r.height * 0.69);
    const pulse = 0.5 + 0.5 * Math.sin((t || 0) * 14);

    ctx.save();
    /* 반투명 옻칠 한지 도크 배경 (주인공 바로 아래, 엄지 그리기 영역 바로 위) */
    ctx.fillStyle = 'rgba(14,12,12,0.84)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, dockW, dockH, 12);
    else ctx.rect(x, y, dockW, dockH);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    /* 상단 짧은 행동 헤더 */
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 12.5px "InkSerif", serif';
    ctx.fillStyle = '#f6ebd4';
    ctx.fillText(want.title || '순서대로 그려 끊어라', r.width * 0.5, y + 14);

    /* 제스처 원형 메달 (큼직하고 현재 차례 강조 + 화살표) */
    const cy = y + 48;
    const x0 = r.width * 0.5 - (n - 1) * gap * 0.5;
    for (let i = 0; i < n; i++) {
      const sh = want.seq[i];
      const px = x0 + i * gap;
      const done = i < (want.i || 0);
      const cur = i === (want.i || 0);
      const rad = cur ? 23 + 1.5 * pulse : 18;

      /* 다음 순서 화살표 */
      if (i < n - 1) {
        ctx.font = '700 14px sans-serif';
        ctx.fillStyle = done ? 'rgba(130,120,108,0.5)' : 'rgba(244,232,206,0.65)';
        ctx.fillText('›', px + gap * 0.5, cy);
      }

      ctx.beginPath();
      ctx.arc(px, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = done ? 'rgba(42,38,34,0.82)' : (cur ? 'rgba(24,38,34,0.95)' : 'rgba(16,14,16,0.78)');
      ctx.fill();
      ctx.lineWidth = cur ? 3.2 : 1.5;
      ctx.strokeStyle = done ? 'rgba(110,100,88,0.65)' : (cur ? accent : 'rgba(220,210,190,0.45)');
      ctx.stroke();

      /* 현재 그릴 무늬 외곽 맥동 고리 */
      if (cur) {
        ctx.beginPath();
        ctx.arc(px, cy, rad + 4 + 2 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = isSeal || isClash
          ? ('rgba(255,224,118,' + (0.4 + 0.45 * pulse).toFixed(3) + ')')
          : ('rgba(92,232,196,' + (0.4 + 0.45 * pulse).toFixed(3) + ')');
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      ctx.fillStyle = done ? 'rgba(120,110,98,0.8)' : (cur ? '#fff8df' : accent);
      ctx.strokeStyle = ctx.fillStyle;
      if (done) {
        ctx.font = '700 16px sans-serif';
        ctx.fillText('✓', px, cy + 1);
      } else if (sh === 'star') {
        ctx.beginPath();
        ctx.moveTo(px, cy - 13);
        ctx.lineTo(px + 8, cy + 11);
        ctx.lineTo(px - 13, cy - 4);
        ctx.lineTo(px + 13, cy - 4);
        ctx.lineTo(px - 8, cy + 11);
        ctx.closePath();
        ctx.lineWidth = 2.4;
        ctx.stroke();
      } else if (brushMarkFn) {
        brushMarkFn(ctx, sh, px, cy, cur ? 11.5 : 9);
      }
    }

    /* 하단 남은 시간 바 */
    const frac = clamp(want.frac != null ? want.frac : 1, 0, 1);
    const bx = x + 14, by = y + dockH - 11, barW = dockW - 28;
    ctx.fillStyle = 'rgba(10,8,8,0.75)';
    ctx.fillRect(bx, by, barW, 5);
    ctx.fillStyle = frac < 0.28 ? '#f05a42' : accent;
    ctx.fillRect(bx, by, barW * frac, 5);
    ctx.restore();
  }

  /* 영창(chant): 3D 바닥 만다라(boss-mandala.webp)만 사용해 보스 주위 인위적 2D 원형 테두리 제거 */
  drawChantMandala() {}

  /* 다중 장판: 3D 바닥 만다라(주인공 아래) + 2D 외곽 위험선·수렴 백금 타이밍 링 */
  drawHazards(ctx, project, hazards, t) {
    if (!hazards || !hazards.length) return;
    ctx.save();
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (!h || h.done || h.dead) continue;
      const u = clamp(h.t / Math.max(0.01, h.delay), 0, 1);
      const urgent = u >= 0.78;
      groundPoly(ctx, project, h.x, h.z, h.r, 32, 0);
      ctx.strokeStyle = 'rgba(16,10,10,0.62)';
      ctx.lineWidth = 3.8;
      ctx.stroke();
      ctx.strokeStyle = urgent ? 'rgba(255,240,186,0.96)' : ('rgba(244,82,54,' + (0.6 + 0.38 * u).toFixed(3) + ')');
      ctx.lineWidth = urgent ? 2.6 : 2.0;
      ctx.stroke();

      groundPoly(ctx, project, h.x, h.z, Math.max(0.2, h.r * u), 28, t * 0.9 + i);
      ctx.fillStyle = urgent ? 'rgba(232,54,36,0.12)' : ('rgba(204,40,28,' + (0.04 + 0.06 * u).toFixed(3) + ')');
      ctx.fill();
      ctx.strokeStyle = urgent ? '#fff8d4' : 'rgba(255,208,126,0.85)';
      ctx.lineWidth = urgent ? 2.4 : 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 비행 부적·검기 파동 투사체: 커스텀 스프라이트 + 꼬리 리본 + 금빛 패링 안내 */
  drawShots(ctx, project, shots, t, heroPos) {
    if (!shots || !shots.length) return;
    ctx.save();
    for (let i = 0; i < shots.length; i++) {
      const sh = shots[i];
      if (!sh) continue;
      const speed = Math.hypot(sh.vx || 0, sh.vz || 0) || 1;
      const ux = (sh.vx || 0) / speed, uz = (sh.vz || 0) / speed;
      const head = project(sh.x, sh.z, 0.82);
      const tail = project(sh.x - ux * (sh.isWave ? 2.0 : 1.45), sh.z - uz * (sh.isWave ? 2.0 : 1.45), 0.76);
      const ang = Math.atan2(head.y - tail.y, head.x - tail.x);
      const isGold = !!sh.gold;
      const isReflect = !!sh.reflect;

      /* 꼬리 리본 */
      const grad = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
      if (isReflect) {
        grad.addColorStop(0, 'rgba(116,244,206,0.95)');
        grad.addColorStop(1, 'rgba(116,244,206,0)');
      } else if (isGold) {
        grad.addColorStop(0, 'rgba(255,228,118,0.96)');
        grad.addColorStop(1, 'rgba(232,172,54,0)');
      } else {
        grad.addColorStop(0, 'rgba(244,88,58,0.90)');
        grad.addColorStop(0.55, 'rgba(34,14,14,0.48)');
        grad.addColorStop(1, 'rgba(18,12,12,0)');
      }
      ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(tail.x, tail.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = sh.isWave ? 12 : (isGold || isReflect ? 7.0 : 4.8);
      ctx.lineCap = 'round';
      ctx.stroke();

      /* 커스텀 수묵 에셋 투사체 렌더링 (언월 검기 파동 or 살부적) */
      const img = sh.isWave ? this.sprites.wave : this.sprites.talisman;
      if (spriteReady(img)) {
        const sz = sh.isWave ? 74 : (isGold ? 36 : 28);
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(sh.isWave ? ang : (ang + Math.PI * 0.5));
        ctx.drawImage(img, -sz * 0.5, -sz * 0.5, sz, sz);
        ctx.restore();
      }

      /* 금빛 패링 가능 부적: 맥동 금테 + 주인공 근접 시 '탭!' 즉시 표시 */
      if (isGold && !isReflect) {
        const pulse = 1 + 0.18 * Math.sin(t * 22 + i);
        ctx.beginPath(); ctx.arc(head.x, head.y, 15 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,232,128,0.96)';
        ctx.lineWidth = 2.6;
        ctx.stroke();
        if (heroPos && Math.hypot(sh.x - heroPos.x, sh.z - heroPos.z) < 5.5) {
          ctx.font = '700 12px "InkSerif", serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,12,8,0.9)';
          ctx.strokeText('탭!', head.x, head.y - 22);
          ctx.fillStyle = '#ffe580';
          ctx.fillText('탭!', head.x, head.y - 22);
        }
      }
    }
    ctx.restore();
  }

  /* 매 프레임 잔상 리본 + 충격파 + 커스텀 크레이터 + 검기 + 플로팅 데미지 + 낙관 갱신·렌더 */
  draw(ctx, project, dt) {
    /* 1) 돌진 리본 궤적 */
    if (this.chargeTrail.length) {
      const keepT = [];
      for (let i = 0; i < this.chargeTrail.length; i++) {
        const pt = this.chargeTrail[i];
        pt.t += dt;
        if (pt.t < pt.dur) keepT.push(pt);
      }
      this.chargeTrail = keepT;
      if (keepT.length >= 2) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < keepT.length; i++) {
          const a = keepT[i - 1], b = keepT[i];
          const k = 1 - b.t / b.dur;
          const p0 = project(a.x, a.z, 0.75), p1 = project(b.x, b.z, 0.75);
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = 'rgba(18,10,10,' + (0.65 * k).toFixed(3) + ')';
          ctx.lineWidth = 14 * k + 2;
          ctx.stroke();
          ctx.strokeStyle = 'rgba(236,68,46,' + (0.82 * k).toFixed(3) + ')';
          ctx.lineWidth = 6 * k + 1;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    /* 2) 폭발·충격파·커스텀 크레이터·횡참 검기·낙관 이벤트 */
    const keep = [];
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      e.t += dt;
      const k = clamp(e.t / e.dur, 0, 1);
      ctx.save();
      if (e.kind === 'slam') {
        const u = easeOut(Math.min(1, k * 1.4)), fade = 1 - k;
        /* 지면 균열 크레이터는 3D 바닥(spawnImpact3D)에 깔리고, 2D는 얇은 외곽 충격파만 표시 */
        groundPoly(ctx, project, e.x, e.z, Math.max(0.3, e.r * (0.35 + 1.05 * u)), 40, e.seed);
        ctx.strokeStyle = 'rgba(16,10,10,' + (0.62 * fade).toFixed(3) + ')';
        ctx.lineWidth = 6 * fade + 1;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,176,92,' + (0.85 * fade).toFixed(3) + ')';
        ctx.lineWidth = 2.6 * fade + 0.8;
        ctx.stroke();
      } else if (e.kind === 'sweep') {
        const u = easeOut(k), fade = 1 - k;
        const distNow = e.r * (0.25 + 0.75 * u);
        const p = project(e.x + Math.cos(e.ang) * distNow, e.z + Math.sin(e.ang) * distNow, 0.85);
        const p0 = project(e.x, e.z, 0.85);
        const scrAng = Math.atan2(p.y - p0.y, p.x - p0.x);
        if (spriteReady(this.sprites.wave)) {
          const sz = (110 + 95 * u);
          ctx.translate(p.x, p.y);
          ctx.rotate(scrAng);
          ctx.globalAlpha = fade;
          ctx.drawImage(this.sprites.wave, -sz * 0.5, -sz * 0.5, sz, sz);
        } else {
          groundPoly(ctx, project, e.x, e.z, distNow, 28, e.ang);
          ctx.strokeStyle = 'rgba(246,84,56,' + (0.85 * fade).toFixed(3) + ')';
          ctx.lineWidth = 9 * fade;
          ctx.stroke();
        }
      } else if (e.kind === 'wave') {
        for (let rIdx = 0; rIdx < 2; rIdx++) {
          const rk = clamp((e.t - rIdx * 0.08) / e.dur, 0, 1);
          if (rk <= 0) continue;
          const ru = easeOut(rk), rf = 1 - rk;
          groundPoly(ctx, project, e.x, e.z, Math.max(0.4, e.r * ru), 44, rIdx * 0.4);
          ctx.strokeStyle = 'rgba(' + e.color.join(',') + ',' + (0.9 * rf).toFixed(3) + ')';
          ctx.lineWidth = (7 - rIdx * 2) * rf + 1.2;
          ctx.stroke();
        }
      } else if (e.kind === 'smoke') {
        const u = easeOut(k), fade = 1 - k;
        for (let s = 0; s < 7; s++) {
          const a = e.seed + (s / 7) * Math.PI * 2;
          const p = project(e.x + Math.cos(a) * e.r * u * 0.8, e.z + Math.sin(a) * e.r * u * 0.8, 0.3 + u * 1.4);
          const rr = (14 + (s % 3) * 6) * (0.6 + 0.8 * u);
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
          ctx.fillStyle = e.jade
            ? 'rgba(72,216,176,' + (0.28 * fade).toFixed(3) + ')'
            : 'rgba(18,14,14,' + (0.55 * fade).toFixed(3) + ')';
          ctx.fill();
        }
      } else if (e.kind === 'kanji') {
        const u = easeOut(k);
        const alpha = k < 0.16 ? (k / 0.16) : (1 - Math.max(0, (k - 0.55) / 0.45));
        const p = project(e.x, e.z, e.y + 0.8 * u);
        const sz = Math.round(44 + 16 * (1 - u));
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '700 ' + sz + 'px "InkBrush", serif';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(' + e.rim.join(',') + ',' + (0.9 * alpha).toFixed(3) + ')';
        ctx.strokeText(e.text, p.x, p.y);
        ctx.fillStyle = 'rgba(' + e.color.join(',') + ',' + (0.95 * alpha).toFixed(3) + ')';
        ctx.fillText(e.text, p.x, p.y);
      }
      ctx.restore();
      if (k < 1) keep.push(e);
    }
    this.events = keep;

    /* 3) 보스 플로팅 데미지 숫자 */
    if (this.dmgNums.length) {
      const keepD = [];
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < this.dmgNums.length; i++) {
        const d = this.dmgNums[i];
        d.t += dt;
        const k = clamp(d.t / d.dur, 0, 1);
        const u = easeOut(k);
        const alpha = k < 0.15 ? k / 0.15 : (1 - Math.max(0, (k - 0.5) / 0.5));
        const p = project(d.x, d.z, d.y + 1.35 * u);
        const sz = d.weak ? Math.round(20 + 6 * (1 - u)) : 16;
        ctx.font = '700 ' + sz + 'px "InkSerif", serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(14,10,8,' + (0.92 * alpha).toFixed(3) + ')';
        ctx.strokeText(d.text, p.x, p.y);
        ctx.fillStyle = d.weak
          ? ('rgba(255,226,112,' + alpha.toFixed(3) + ')')
          : ('rgba(248,236,214,' + alpha.toFixed(3) + ')');
        ctx.fillText(d.text, p.x, p.y);
        if (k < 1) keepD.push(d);
      }
      ctx.restore();
      this.dmgNums = keepD;
    }
  }
}
