/**
 * v2/js/bossFx.js
 * 심안(SIMAN) v0.50 — 보스 전용 수묵·주홍·금박 스킬 이펙트 엔진 (주인공 일섬/참 동급 퀄리티).
 *
 * 담당 연출:
 * - 내려찍기(slamTele/slam): 회전 주홍 부적 진법 → 8갈래 지면 균열·이중 먹파동·「轟」 낙관
 * - 돌진(telegraph/charge/mimic): 테이퍼 수묵 경고 궤적·화살 펄스 → 돌진 중 주홍·먹 리본 잔상
 * - 기모으기(kiai): 12갈래 먹·금빛 소용돌이 기류 → 폭발「喝」 / 패링 성공「破」 파동
 * - 부적 탄막(volley): 부채꼴 붓광선 예고 → 날아가는 부적 꼬리 리본 + 금빛 패링 후광
 * - 다중 장판(hazards): 회전 주홍 진법 링 + 카운트다운 호 + 폭발 먹균열
 * - 영창(chant)·분신/은신(clones/veil)·기세 붕괴(groggy): 회전 만다라·먹연기·「崩」 충격파
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

export class BossFx {
  constructor() {
    this.events = [];
    this.chargeTrail = [];
  }

  clear() {
    this.events.length = 0;
    this.chargeTrail.length = 0;
  }

  pushChargePoint(x, z, color) {
    this.chargeTrail.push({ x, z, t: 0, dur: 0.42, color: color || 'crimson' });
    if (this.chargeTrail.length > 26) this.chargeTrail.shift();
  }

  triggerSlamImpact(x, z, r) {
    this.events.push({ kind: 'slam', x, z, r: r || 3.0, t: 0, dur: 0.85, seed: Math.random() * 6.28 });
    this.events.push({ kind: 'kanji', text: '轟', x, z, y: 1.5, color: [232, 74, 52], rim: [255, 210, 130], t: 0, dur: 0.72 });
  }

  triggerKiaiBurst(x, z, parried) {
    this.events.push({
      kind: 'wave', x, z, r: parried ? 5.5 : 8.5,
      color: parried ? [246, 206, 92] : [224, 68, 48],
      t: 0, dur: 0.65
    });
    this.events.push({
      kind: 'kanji', text: parried ? '破' : '喝', x, z, y: 1.8,
      color: parried ? [255, 224, 118] : [238, 84, 60],
      rim: parried ? [255, 250, 220] : [24, 14, 12],
      t: 0, dur: 0.75
    });
  }

  triggerHazardBlast(x, z, r) {
    this.events.push({ kind: 'slam', x, z, r: r || 2.5, t: 0, dur: 0.65, seed: Math.random() * 6.28, minor: true });
  }

  triggerGroggyBreak(x, z) {
    this.events.push({ kind: 'wave', x, z, r: 5.2, color: [244, 204, 96], t: 0, dur: 0.72 });
    this.events.push({ kind: 'kanji', text: '崩', x, z, y: 2.0, color: [248, 212, 102], rim: [20, 14, 10], t: 0, dur: 0.82 });
  }

  triggerSmokeBurst(x, z, jade) {
    this.events.push({ kind: 'smoke', x, z, r: 2.4, jade: !!jade, t: 0, dur: 0.55, seed: Math.random() * 6.28 });
  }

  /* 내려찍기 예고: 회전 주홍 부적 진법 + 수렴 먹불꽃 */
  drawSlamTele(ctx, project, x, z, R, f, t) {
    const u = clamp(f, 0, 1);
    ctx.save();
    /* 내부 채워지는 먹·주홍 워시 */
    groundPoly(ctx, project, x, z, Math.max(0.25, R * u), 36, t * 0.6);
    ctx.fillStyle = 'rgba(186,34,24,' + (0.14 + 0.24 * u).toFixed(3) + ')';
    ctx.fill();

    /* 바깥 먹 테두리 + 주홍 진법 이중 링 */
    groundPoly(ctx, project, x, z, R, 42, 0);
    ctx.strokeStyle = 'rgba(16,10,10,0.68)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(244,82,56,' + (0.65 + 0.35 * u).toFixed(3) + ')';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    /* 안쪽 역회전 점선 진법 고리 */
    ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -t * 36;
    groundPoly(ctx, project, x, z, R * 0.78, 36, -t * 0.5);
    ctx.strokeStyle = 'rgba(255,196,112,' + (0.45 + 0.4 * u).toFixed(3) + ')';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.setLineDash([]);

    /* 8방위 수렴 부적 눈금 + 솟구치는 주홍 기운 */
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.85;
      const p0 = project(x + Math.cos(a) * R * 0.86, z + Math.sin(a) * R * 0.86, 0.04);
      const p1 = project(x + Math.cos(a) * R * 1.04, z + Math.sin(a) * R * 1.04, 0.04);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = i % 2 ? 'rgba(255,214,126,0.78)' : 'rgba(236,68,46,0.92)';
      ctx.lineWidth = i % 2 ? 1.8 : 2.6;
      ctx.stroke();

      /* 수렴하는 불씨 */
      const spR = R * (1.05 - 0.85 * ((u + i * 0.125) % 1));
      const sp = project(x + Math.cos(a) * spR, z + Math.sin(a) * spR, 0.08 + u * 0.45);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 2.2 + u * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,204,116,0.78)';
      ctx.fill();
    }
    ctx.restore();
  }

  /* 돌진 예고: 테이퍼 수묵 주홍 레인 + 전진 화살 펄스 */
  drawChargeTele(ctx, project, bx, bz, ax, az, f, t) {
    const dx = ax - bx, dz = az - bz, L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    const len = Math.max(7.5, Math.min(13.5, L + 3.2));
    const hw = 0.88;
    const u = clamp(f, 0, 1);

    const c0 = project(bx + nx * hw * 0.7, bz + nz * hw * 0.7, 0.05);
    const c1 = project(bx - nx * hw * 0.7, bz - nz * hw * 0.7, 0.05);
    const c2 = project(bx + ux * len - nx * hw * 1.05, bz + uz * len - nz * hw * 1.05, 0.05);
    const c3 = project(bx + ux * len + nx * hw * 1.05, bz + uz * len + nz * hw * 1.05, 0.05);

    ctx.save();
    /* 먹 바탕 띠 + 주홍 채움 */
    ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.closePath();
    ctx.fillStyle = 'rgba(186,30,22,' + (0.15 + 0.24 * u).toFixed(3) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(246,84,58,' + (0.55 + 0.4 * u).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();

    /* 중앙 진홍 붓선 + 전진 화살표 3개 */
    const pStart = project(bx, bz, 0.06);
    const pEnd = project(bx + ux * len * (0.35 + 0.65 * u), bz + uz * len * (0.35 + 0.65 * u), 0.06);
    ctx.beginPath(); ctx.moveTo(pStart.x, pStart.y); ctx.lineTo(pEnd.x, pEnd.y);
    ctx.strokeStyle = 'rgba(255,212,138,' + (0.55 + 0.4 * u).toFixed(3) + ')';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.stroke();

    for (let k = 0; k < 3; k++) {
      const s = ((t * 2.4 + k / 3) % 1) * len;
      const tip = project(bx + ux * (s + 0.6), bz + uz * (s + 0.6), 0.06);
      const lft = project(bx + ux * s + nx * 0.55, bz + uz * s + nz * 0.55, 0.06);
      const rgt = project(bx + ux * s - nx * 0.55, bz + uz * s - nz * 0.55, 0.06);
      ctx.beginPath(); ctx.moveTo(lft.x, lft.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(rgt.x, rgt.y);
      ctx.strokeStyle = 'rgba(255,220,148,' + (0.4 + 0.5 * u).toFixed(3) + ')';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 기모으기(kiai): 12갈래 먹·금빛 기류 소용돌이 + 패링 창 공명 고리 */
  drawKiaiVortex(ctx, project, bx, bz, f, open, t) {
    const u = clamp(f, 0, 1);
    const center = project(bx, bz, 1.0);
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2 + t * 2.8;
      const rad0 = (3.4 - 1.8 * u) * (0.8 + 0.25 * (i % 3));
      const rad1 = Math.max(0.35, rad0 - 1.35);
      const p0 = project(bx + Math.cos(a0) * rad0, bz + Math.sin(a0) * rad0, 0.25 + (i % 3) * 0.35);
      const p1 = project(bx + Math.cos(a0 + 0.45) * rad1, bz + Math.sin(a0 + 0.45) * rad1, 0.9);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo((p0.x + center.x) * 0.5, (p0.y + center.y) * 0.5 - 12, p1.x, p1.y);
      ctx.strokeStyle = open
        ? 'rgba(255,226,118,' + (0.55 + 0.4 * Math.sin(t * 20 + i)).toFixed(3) + ')'
        : (i % 2 ? 'rgba(232,188,78,0.52)' : 'rgba(20,14,12,0.55)');
      ctx.lineWidth = open ? 2.8 : 2.0;
      ctx.stroke();
    }
    groundPoly(ctx, project, bx, bz, Math.max(0.6, 3.0 - 1.5 * u), 36, t);
    ctx.strokeStyle = open ? 'rgba(255,238,150,0.95)' : 'rgba(232,192,74,' + (0.4 + 0.5 * u).toFixed(3) + ')';
    ctx.lineWidth = open ? 4.5 : 2.4;
    ctx.stroke();
    ctx.restore();
  }

  /* 부적 탄막 예고: 부채꼴 수묵 광선 */
  drawVolleyTele(ctx, project, bx, bz, aimA, n, spread, f, t) {
    const u = clamp(f, 0, 1);
    const bp = project(bx, bz, 0.75);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const a = aimA + (n > 1 ? (i / (n - 1) - 0.5) : 0) * spread * 2;
      const e = project(bx + Math.cos(a) * (3 + 7.5 * u), bz + Math.sin(a) * (3 + 7.5 * u), 0.45);
      ctx.beginPath(); ctx.moveTo(bp.x, bp.y); ctx.lineTo(e.x, e.y);
      ctx.strokeStyle = 'rgba(18,10,10,0.5)';
      ctx.lineWidth = 4.6;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(236,72,48,' + (0.35 + 0.55 * u).toFixed(3) + ')';
      ctx.lineWidth = 2.0;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(e.x, e.y, 2.5 + 2 * u, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,204,116,' + (0.6 + 0.35 * Math.sin(t * 18 + i)).toFixed(3) + ')';
      ctx.fill();
    }
    ctx.restore();
  }

  /* 영창(chant): 회전 수묵 만다라 진법 */
  drawChantMandala(ctx, project, bx, bz, f, t) {
    const u = clamp(f, 0, 1);
    const R = 2.4 + 0.4 * Math.sin(t * 4);
    ctx.save();
    groundPoly(ctx, project, bx, bz, R, 40, t * 0.5);
    ctx.strokeStyle = 'rgba(16,12,12,0.55)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(92,232,196,' + (0.55 + 0.35 * u).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
    /* 내접 사각 진법 2겹 (8각별) */
    for (let s = 0; s < 2; s++) {
      groundPoly(ctx, project, bx, bz, R * 0.82, 4, t * (s ? -0.9 : 0.9) + s * (Math.PI / 4));
      ctx.strokeStyle = s ? 'rgba(232,192,74,0.62)' : 'rgba(236,84,58,0.62)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 다중 장판: 평면 빨간 원 대신 회전 수묵 진법 고리 */
  drawHazards(ctx, project, hazards, t) {
    if (!hazards || !hazards.length) return;
    ctx.save();
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (!h || h.done || h.dead) continue;
      const u = clamp(h.t / Math.max(0.01, h.delay), 0, 1);
      groundPoly(ctx, project, h.x, h.z, h.r, 32, 0);
      ctx.strokeStyle = 'rgba(16,10,10,0.58)';
      ctx.lineWidth = 3.8;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(244,82,54,' + (0.55 + 0.4 * u).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();

      /* 안쪽 차오르는 고리 */
      groundPoly(ctx, project, h.x, h.z, Math.max(0.2, h.r * u), 28, t * 0.9 + i);
      ctx.fillStyle = 'rgba(204,40,28,' + (0.10 + 0.18 * u).toFixed(3) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,198,112,' + (0.45 + 0.4 * u).toFixed(3) + ')';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 비행 부적 탄환: 붓 꼬리 리본 + 금빛 패링 후광 */
  drawShots(ctx, project, shots, t) {
    if (!shots || !shots.length) return;
    ctx.save();
    for (let i = 0; i < shots.length; i++) {
      const sh = shots[i];
      if (!sh) continue;
      const speed = Math.hypot(sh.vx || 0, sh.vz || 0) || 1;
      const ux = (sh.vx || 0) / speed, uz = (sh.vz || 0) / speed;
      const head = project(sh.x, sh.z, 0.78);
      const tail = project(sh.x - ux * 1.35, sh.z - uz * 1.35, 0.74);
      const isGold = !!sh.gold;
      const isReflect = !!sh.reflect;

      /* 테이퍼 불꽃/먹 꼬리 */
      const grad = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
      if (isReflect) {
        grad.addColorStop(0, 'rgba(116,244,206,0.95)');
        grad.addColorStop(1, 'rgba(116,244,206,0)');
      } else if (isGold) {
        grad.addColorStop(0, 'rgba(255,228,118,0.95)');
        grad.addColorStop(1, 'rgba(232,172,54,0)');
      } else {
        grad.addColorStop(0, 'rgba(244,88,58,0.88)');
        grad.addColorStop(0.55, 'rgba(34,14,14,0.45)');
        grad.addColorStop(1, 'rgba(18,12,12,0)');
      }
      ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(tail.x, tail.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = isGold || isReflect ? 6.5 : 4.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      /* 금빛 부적: 탭으로 되받을 수 있음을 알리는 맥동 금테 */
      if (isGold && !isReflect) {
        const pulse = 1 + 0.18 * Math.sin(t * 22 + i);
        ctx.beginPath(); ctx.arc(head.x, head.y, 11 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,232,128,0.92)';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* 매 프레임 잔상 리본 + 충격파 + 지면 균열 + 한자 낙관 갱신·렌더 */
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

    /* 2) 폭발·충격파·균열·낙관 이벤트 */
    const keep = [];
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      e.t += dt;
      const k = clamp(e.t / e.dur, 0, 1);
      ctx.save();
      if (e.kind === 'slam') {
        const u = easeOut(k), fade = 1 - k;
        /* 지면 방사 균열 붓선 */
        const branches = e.minor ? 6 : 8;
        for (let b = 0; b < branches; b++) {
          const a = e.seed + (b / branches) * Math.PI * 2;
          const midA = a + ((b % 2) ? 0.16 : -0.16);
          const p0 = project(e.x, e.z, 0.05);
          const pm = project(e.x + Math.cos(midA) * e.r * 0.52 * u, e.z + Math.sin(midA) * e.r * 0.52 * u, 0.05);
          const p1 = project(e.x + Math.cos(a) * e.r * 1.15 * u, e.z + Math.sin(a) * e.r * 1.15 * u, 0.05);
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(pm.x, pm.y); ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = 'rgba(16,10,10,' + (0.85 * fade).toFixed(3) + ')';
          ctx.lineWidth = (e.minor ? 4 : 6) * fade + 1;
          ctx.stroke();
          ctx.strokeStyle = 'rgba(246,92,58,' + (0.85 * fade).toFixed(3) + ')';
          ctx.lineWidth = (e.minor ? 1.8 : 2.6) * fade;
          ctx.stroke();
        }
        /* 이중 수묵 충격파 */
        groundPoly(ctx, project, e.x, e.z, Math.max(0.3, e.r * (0.35 + 1.05 * u)), 40, e.seed);
        ctx.strokeStyle = 'rgba(16,10,10,' + (0.72 * fade).toFixed(3) + ')';
        ctx.lineWidth = 8 * fade + 1;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,176,92,' + (0.9 * fade).toFixed(3) + ')';
        ctx.lineWidth = 3.2 * fade + 0.8;
        ctx.stroke();
      } else if (e.kind === 'wave') {
        const u = easeOut(k), fade = 1 - k;
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
  }
}
