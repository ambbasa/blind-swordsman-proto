/* v2/js/modules/trainingDrills.js
 * v1.08: 무늬 수련장 내 저스트 패링 + 보스 6대 기믹(도넛·소크·삼연격·혈사슬·붉은시선·부채꼴) 인터랙티브 드릴.
 */

export const GIMMICK_DRILLS = Object.freeze([
  { id: 'parry',  name: '완벽 막기', color: '#5FE8C2', tip: '옥빛 링이 안쪽 원에 닿는 순간(0.18초) 화면을 탭하세요.' },
  { id: 'donut',  name: '도넛 결계', color: '#4DD4FF', tip: '청록 안전지대의 혼령을 탭/일섬해 주홍 폭발을 피하세요.' },
  { id: 'soak',   name: '결계 기둥', color: '#F2B84B', tip: '빛나는 호박빛 기둥 혼령 2곳을 시간 안에 차례로 밟으세요.' },
  { id: 'rhythm', name: '삼연격',    color: '#5FE8C2', tip: '세 박자 수축 링에 맞춰 연속 3회 탭해 완벽 막기하세요.' },
  { id: 'tether', name: '혈사슬',    color: '#FF4D3D', tip: '보스와 이어진 붉은 사슬을 끊으려면 외곽 청록 혼령을 탭하세요.' },
  { id: 'gaze',   name: '붉은 시선', color: '#FF4D3D', tip: '보스 정면 시선 부채꼴을 피해 등 뒤 청록 혼령으로 이동하세요.' },
  { id: 'pizza',  name: '부채꼴',    color: '#4DD4FF', tip: '6조각 중 붉은 위험 구역을 피해 청록 안전 칸 혼령으로 일섬하세요.' }
]);

export function getDrillDef(id) {
  for (let i = 0; i < GIMMICK_DRILLS.length; i++) {
    if (GIMMICK_DRILLS[i].id === id) return GIMMICK_DRILLS[i];
  }
  return GIMMICK_DRILLS[0];
}

export function createDrillState(kind) {
  const st = {
    kind: kind || 'parry',
    t: 0,
    dur: 1.5,
    streak: 0,
    best: 0,
    msg: '',
    msgOk: true,
    flash: 0,
    heroX: 0.5,
    heroY: 0.78,
    safeInside: true,
    safeAngle: 0,
    gazeAngle: Math.PI * 0.5,
    beatIdx: 0,
    beatOk: 0,
    beats: [0.85, 0.72, 0.65],
    targets: []
  };
  resetDrillRound(st);
  return st;
}

export function resetDrillRound(st) {
  st.t = 0;
  st.flash = 0;
  st.heroX = 0.5;
  st.heroY = 0.78;
  st.targets = [];
  if (st.kind === 'parry') {
    st.dur = 1.25 + Math.random() * 0.7;
  } else if (st.kind === 'donut') {
    st.dur = 2.6;
    st.safeInside = Math.random() < 0.5;
    const ang = Math.random() * Math.PI * 2;
    const rSafe = st.safeInside ? 0.14 : 0.36;
    const rBad = st.safeInside ? 0.36 : 0.14;
    st.targets = [
      { x: 0.5 + Math.cos(ang) * rSafe, y: 0.5 + Math.sin(ang) * rSafe * 0.85, ok: true, done: false, label: '안전' },
      { x: 0.5 - Math.cos(ang) * rBad,  y: 0.5 - Math.sin(ang) * rBad * 0.85,  ok: false, done: false, label: '위험' }
    ];
  } else if (st.kind === 'soak') {
    st.dur = 3.2;
    const a1 = Math.random() * Math.PI * 2;
    const a2 = a1 + Math.PI * (0.7 + Math.random() * 0.6);
    st.targets = [
      { x: 0.5 + Math.cos(a1) * 0.30, y: 0.5 + Math.sin(a1) * 0.28, ok: true, done: false, label: '기둥1' },
      { x: 0.5 + Math.cos(a2) * 0.30, y: 0.5 + Math.sin(a2) * 0.28, ok: true, done: false, label: '기둥2' }
    ];
  } else if (st.kind === 'rhythm') {
    st.beatIdx = 0;
    st.beatOk = 0;
    st.beats = [0.95, 0.78, 0.68];
    st.dur = st.beats[0];
  } else if (st.kind === 'tether') {
    st.dur = 2.5;
    st.heroX = 0.5;
    st.heroY = 0.64;
    const ang = -Math.PI * 0.25 + Math.random() * Math.PI * 1.5;
    st.targets = [
      { x: 0.5 + Math.cos(ang) * 0.37, y: 0.5 + Math.sin(ang) * 0.34, ok: true, done: false, label: '절단' },
      { x: 0.5 - Math.cos(ang) * 0.14, y: 0.5 - Math.sin(ang) * 0.14, ok: false, done: false, label: '근접' }
    ];
  } else if (st.kind === 'gaze') {
    st.dur = 2.2;
    const dirs = [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5];
    st.gazeAngle = dirs[Math.floor(Math.random() * dirs.length)];
    const back = st.gazeAngle + Math.PI;
    st.targets = [
      { x: 0.5 + Math.cos(back) * 0.33, y: 0.5 + Math.sin(back) * 0.30, ok: true, done: false, label: '배후' },
      { x: 0.5 + Math.cos(st.gazeAngle) * 0.30, y: 0.5 + Math.sin(st.gazeAngle) * 0.28, ok: false, done: false, label: '시선' }
    ];
  } else if (st.kind === 'pizza') {
    st.dur = 2.6;
    const safeSlice = Math.floor(Math.random() * 6);
    st.safeAngle = (safeSlice + 0.5) * (Math.PI / 3);
    const badAngle = st.safeAngle + Math.PI;
    st.targets = [
      { x: 0.5 + Math.cos(st.safeAngle) * 0.32, y: 0.5 + Math.sin(st.safeAngle) * 0.30, ok: true, done: false, label: '안전' },
      { x: 0.5 + Math.cos(badAngle) * 0.32, y: 0.5 + Math.sin(badAngle) * 0.30, ok: false, done: false, label: '위험' }
    ];
  }
}

export function stepDrill(st, dt) {
  st.t += dt;
  if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 2.5);
  const rem = st.dur - st.t;
  if (st.kind === 'parry') {
    if (rem <= -0.16) {
      st.streak = 0;
      st.msg = '놓침 — 옥빛 링이 닿을 때 탭하세요';
      st.msgOk = false;
      resetDrillRound(st);
      return 'miss';
    }
  } else if (st.kind === 'rhythm') {
    if (rem <= -0.14) {
      st.streak = 0;
      st.msg = '박자 놓침 (' + (st.beatIdx + 1) + '/3) — 다시 도전';
      st.msgOk = false;
      resetDrillRound(st);
      return 'miss';
    }
  } else {
    if (rem <= 0) {
      st.streak = 0;
      st.msg = '시간 초과 — 청록/호박빛 혼령을 빠르게 탭하세요';
      st.msgOk = false;
      resetDrillRound(st);
      return 'miss';
    }
  }
  return null;
}

export function handleDrillInput(st, nx, ny) {
  const rem = st.dur - st.t;
  if (st.kind === 'parry') {
    const ms = Math.round(Math.abs(rem) * 1000);
    if (rem <= 0.18 && rem >= -0.04) {
      st.streak++;
      if (st.streak > st.best) st.best = st.streak;
      st.msg = '완벽 막기! ' + ms + 'ms · 연속 ' + st.streak + '회';
      st.msgOk = true;
      st.flash = 1;
      resetDrillRound(st);
      return 'just';
    }
    st.streak = 0;
    st.msg = rem > 0.18 && rem <= 0.45 ? ('조금 빠름 (' + ms + 'ms 남음)') : '타이밍 어긋남 — 링이 모일 때 탭';
    st.msgOk = false;
    resetDrillRound(st);
    return 'fail';
  }

  if (st.kind === 'rhythm') {
    const ms = Math.round(Math.abs(rem) * 1000);
    if (rem <= 0.22 && rem >= -0.06) {
      st.beatOk++;
      st.beatIdx++;
      st.flash = 1;
      if (st.beatIdx >= st.beats.length) {
        st.streak++;
        if (st.streak > st.best) st.best = st.streak;
        st.msg = '삼연격 완파! 연속 ' + st.streak + '회';
        st.msgOk = true;
        resetDrillRound(st);
        return 'just';
      }
      st.t = 0;
      st.dur = st.beats[st.beatIdx];
      st.msg = (st.beatOk) + '/3 완벽 막기! (' + ms + 'ms)';
      st.msgOk = true;
      return 'just';
    }
    st.streak = 0;
    st.msg = '박자 어긋남 (' + (st.beatIdx + 1) + '/3) — 다시 시작';
    st.msgOk = false;
    resetDrillRound(st);
    return 'fail';
  }

  /* 공간 기믹(donut, soak, tether, gaze, pizza): 가장 가까운 혼령 선택 판정 */
  let bestT = null;
  let bestD = 99;
  for (let i = 0; i < st.targets.length; i++) {
    const tg = st.targets[i];
    if (tg.done) continue;
    const d = Math.hypot(nx - tg.x, ny - tg.y);
    if (d < bestD) { bestD = d; bestT = tg; }
  }
  if (!bestT || bestD > 0.24) {
    st.msg = '혼령 원을 직접 탭하거나 그어 일섬하세요';
    st.msgOk = false;
    return 'miss_tap';
  }
  st.heroX = bestT.x;
  st.heroY = bestT.y;
  if (!bestT.ok) {
    st.streak = 0;
    st.msg = '위험 구역 피격! 청록/호박빛 안전 혼령을 고르세요';
    st.msgOk = false;
    resetDrillRound(st);
    return 'fail';
  }
  bestT.done = true;
  st.flash = 1;
  const allDone = st.targets.every(function (tg) { return !tg.ok || tg.done; });
  if (allDone) {
    st.streak++;
    if (st.streak > st.best) st.best = st.streak;
    st.msg = getDrillDef(st.kind).name + ' 파훼 성공! 연속 ' + st.streak + '회';
    st.msgOk = true;
    resetDrillRound(st);
    return 'just';
  }
  st.msg = '1번째 기둥 흡수! 남은 기둥으로 일섬하세요';
  st.msgOk = true;
  return 'step';
}

export function drawDrillCanvas(ctx, W, H, st) {
  const cx = W * 0.5, cy = H * 0.52;
  const minS = Math.min(W, H);
  const rem = st.dur - st.t;
  const frac = Math.max(0, Math.min(1, st.t / Math.max(0.01, st.dur)));

  if (st.kind === 'parry' || st.kind === 'rhythm') {
    const win = st.kind === 'rhythm' ? 0.22 : 0.18;
    const tele = st.kind === 'rhythm' ? 0.52 : 0.38;
    const inJust = rem <= win && rem >= -0.06;
    ctx.save();
    if (rem <= tele && rem > -0.16) {
      const rf = Math.max(0, Math.min(1, rem / tele));
      const innerR = 30, outerR = 30 + 62 * rf;
      ctx.strokeStyle = inJust ? 'rgba(136,255,224,0.95)' : 'rgba(255,212,118,0.78)';
      ctx.lineWidth = inJust ? 4 : 2.2;
      ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = inJust ? 'rgba(255,246,196,0.9)' : 'rgba(255,212,118,0.34)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = inJust ? '#9effe4' : '#f2d9a0';
      ctx.fillText(inJust ? '지금 막기!' : (st.kind === 'rhythm' ? ((st.beatIdx + 1) + '/3 예고') : '예고 중...'), cx, cy + 4);
    } else {
      ctx.strokeStyle = 'rgba(226,188,116,0.28)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(240,230,206,0.65)';
      ctx.fillText(st.kind === 'rhythm' ? ('삼연격 ' + (st.beatIdx + 1) + '/3 대기...') : '곧 공격이 옵니다...', cx, cy + 4);
    }
    ctx.restore();
  } else {
    ctx.save();
    /* 기믹별 바닥 예고 영역 */
    if (st.kind === 'donut') {
      const rIn = minS * 0.22, rOut = minS * 0.44;
      ctx.fillStyle = st.safeInside ? 'rgba(255,77,61,0.26)' : 'rgba(77,212,255,0.18)';
      ctx.beginPath(); ctx.arc(cx, cy, rOut, 0, Math.PI * 2); ctx.arc(cx, cy, rIn, 0, Math.PI * 2, true); ctx.fill();
      ctx.fillStyle = st.safeInside ? 'rgba(77,212,255,0.20)' : 'rgba(255,77,61,0.30)';
      ctx.beginPath(); ctx.arc(cx, cy, rIn, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4DD4FF'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, rIn, 0, Math.PI * 2); ctx.stroke();
    } else if (st.kind === 'gaze') {
      const rCone = minS * 0.44;
      ctx.fillStyle = 'rgba(255,77,61,0.32)';
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rCone, st.gazeAngle - 0.85, st.gazeAngle + 0.85);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#FF4D3D'; ctx.lineWidth = 2; ctx.stroke();
    } else if (st.kind === 'pizza') {
      const rP = minS * 0.44;
      for (let i = 0; i < 6; i++) {
        const a0 = i * (Math.PI / 3);
        const a1 = a0 + Math.PI / 3;
        const mid = (a0 + a1) * 0.5;
        const isSafe = Math.abs(Math.atan2(Math.sin(mid - st.safeAngle), Math.cos(mid - st.safeAngle))) < 0.25;
        ctx.fillStyle = isSafe ? 'rgba(77,212,255,0.24)' : 'rgba(255,77,61,0.28)';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rP, a0, a1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = isSafe ? '#4DD4FF' : 'rgba(255,77,61,0.65)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    } else if (st.kind === 'tether') {
      ctx.strokeStyle = '#FF4D3D'; ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(st.heroX * W, st.heroY * H); ctx.stroke();
      ctx.setLineDash([]);
    }

    /* 보스 코어 */
    ctx.fillStyle = '#d93829';
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
    ctx.font = '700 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff3e0';
    ctx.fillText('보스', cx, cy + 3);

    /* 혼령 타겟 */
    for (let i = 0; i < st.targets.length; i++) {
      const tg = st.targets[i];
      if (tg.done) continue;
      const tx = tg.x * W, ty = tg.y * H;
      const col = st.kind === 'soak' ? '#F2B84B' : (tg.ok ? '#4DD4FF' : '#FF4D3D');
      ctx.strokeStyle = col; ctx.lineWidth = tg.ok ? 2.8 : 1.6;
      ctx.beginPath(); ctx.arc(tx, ty, tg.ok ? 20 : 16, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = tg.ok ? 'rgba(77,212,255,0.18)' : 'rgba(255,77,61,0.14)';
      ctx.fill();
      ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col;
      ctx.fillText(tg.label, tx, ty + 4);
    }

    /* 남은 시간 바 */
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(24, H - 18, W - 48, 6);
    ctx.fillStyle = frac > 0.72 ? '#FF4D3D' : '#5FE8C2';
    ctx.fillRect(24, H - 18, (W - 48) * (1 - frac), 6);
    ctx.restore();
  }

  if (st.msg) {
    ctx.save();
    ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = st.msgOk ? '#8ef5d4' : '#f0a288';
    ctx.fillText(st.msg, cx, 22);
    ctx.restore();
  }
}
