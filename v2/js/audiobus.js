/* v2/js/audiobus.js — 『심안』 v0.39 공용 오디오 버스.
   v0.29 의 "0.25초 안 6개" 상한을 대체한다. 합성 자체(방울·베기·타격·BGM)는 audio.js 그대로 두고,
   소리가 나가는 길만 표준 믹스 구조로 바꾼다.

     소스들 → input ┬ dry ─────────────────────────┐
                    └ 컨볼버(작은 방 초기반사) → wet ┴→ 컴프레서 → 소프트니 리미터 → 마스터 → 스피커

   - 보이스 슬롯: 이벤트 하나 = 슬롯 하나. 슬롯이 차면 '지금 가장 조용한 소리'를 20ms 로 걷어낸다(voice stealing).
   - 토큰버킷: 초당 30개(버스트 9). 과밀 프레임에서 소리가 사방으로 튀지 않게.
   - 밀도 덕킹: 이미 울리는 소리가 많을수록 새 소리를 눌러 겹침이 잡음 밭이 되지 않게.
   - 초기반사: 7탭 임펄스(8~61ms) + 짧은 꼬리 — 방 안에서 종이를 다루는 느낌.
   - 리미터: 무릎 0.6 소프트니 커브. 여러 소리가 겹쳐도 찢어지지 않는다.
   프레임 할당 0: 슬롯·버퍼는 한 번 만들고 재사용한다. */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 무릎 0.6 의 소프트니 리미터 커브(입력 -1..1 → 출력 -1..1, 절대 넘지 않는다). */
export function makeLimiterCurve(n) {
  const N = n || 2048;
  const c = new Float32Array(N);
  const t = 0.6;
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a < t ? a : t + (1 - t) * Math.tanh((a - t) / (1 - t));
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/** 작은 방의 초기반사 + 짧은 꼬리(모노 IR, 컨볼버가 스테레오로 펼친다). */
export function makeRoomIR(ctx, sec, damp) {
  const sr = ctx.sampleRate;
  const T = sec || 0.6;
  const n = Math.max(64, Math.floor(sr * T));
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const taps = [0.0075, 0.0121, 0.0168, 0.0213, 0.0272, 0.0338, 0.0419]; /* 8~42ms */
  const gain = [0.62, 0.5, 0.42, 0.36, 0.3, 0.24, 0.18];
  const k = damp != null ? damp : 0.34;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - u, 3.2) * 0.16 * k;
  }
  for (let t = 0; t < taps.length; t++) {
    const i0 = Math.floor(taps[t] * sr);
    for (let j = 0; j < 24 && i0 + j < n; j++) d[i0 + j] += (Math.random() * 2 - 1) * gain[t] * (1 - j / 24);
  }
  /* 한 번 더 부드럽게(고주파를 덜어 '작은 방'으로) */
  let lp = 0;
  for (let i = 0; i < n; i++) { lp += (d[i] - lp) * 0.45; d[i] = lp; }
  return buf;
}

/**
 * 버스를 만든다. 반환값의 voice()/allow() 가 audio.js 의 모든 효과음 앞단이다.
 * opts: { maxVoices, rate, burst, duck, room, wet }
 */
export function createAudioBus(ctx, opts) {
  const O = opts || {};
  const maxVoices = O.maxVoices || 8;
  const rate = O.rate || 30;
  const burst = O.burst || 9;
  const wetAmt = O.wet != null ? O.wet : 0.22;

  const input = ctx.createGain();
  input.gain.value = 1;

  const dry = ctx.createGain();
  dry.gain.value = 1;
  const wet = ctx.createGain();
  wet.gain.value = wetAmt;
  const conv = ctx.createConvolver();
  conv.normalize = false;
  try { conv.buffer = makeRoomIR(ctx, O.room || 0.6); } catch (e) { /* 컨볼버를 못 만들면 dry 만 */ }

  const sum = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 18;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  const pre = ctx.createGain();
  pre.gain.value = 1 / 2.2;            /* 리미터 앞 헤드룸 */
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeLimiterCurve();
  shaper.oversample = '2x';
  const ceiling = ctx.createGain();
  ceiling.gain.value = 0.94;
  const master = ctx.createGain();
  master.gain.value = 0.7;

  input.connect(dry);
  dry.connect(sum);
  if (conv.buffer) {
    input.connect(conv);
    conv.connect(wet);
    wet.connect(sum);
  }
  sum.connect(comp);
  comp.connect(pre);
  pre.connect(shaper);
  shaper.connect(ceiling);
  ceiling.connect(master);
  master.connect(ctx.destination);

  /* ---- 보이스 슬롯 ---- */
  const slots = [];
  for (let i = 0; i < maxVoices; i++) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(input);
    slots.push({ gain: g, level: 0, end: -1, busy: false, id: 0 });
  }
  let slotId = 0;

  /* ---- 토큰버킷 ---- */
  let tokens = burst;
  let tokenT = -1;

  const stats = { played: 0, dropped: 0, stolen: 0, limited: 0, peak: 0 };

  /** 조용한(곧 끝나는) 슬롯의 추정 레벨. */
  function levelAt(s, t) {
    if (!s.busy) return 0;
    const left = s.end - t;
    return left <= 0 ? 0 : s.level * Math.min(1, left * 6);
  }

  function freeAt(t) {
    for (let i = 0; i < slots.length; i++) if (!slots[i].busy || slots[i].end <= t) return slots[i];
    return null;
  }

  /**
   * 새 소리 하나를 받을 슬롯. rate/토큰/보이스 상한을 모두 통과해야 null 이 아닌 gain 을 준다.
   * level 은 이 이벤트의 대략적 피크(0~1). 겹칠수록 스스로 작아진다(밀도 덕킹).
   */
  function voice(level, when, durSec) {
    const t = when != null ? when : ctx.currentTime;
    if (tokenT >= 0) tokens = Math.min(burst, tokens + (t - tokenT) * rate);
    tokenT = t;
    if (tokens < 1) { stats.limited++; stats.dropped++; return null; }
    let active = 0;
    for (let i = 0; i < slots.length; i++) if (slots[i].busy && slots[i].end > t) active++;
    const density = clamp(active / maxVoices, 0, 1);
    const want = level * (1 - (O.duck != null ? O.duck : 0.42) * density);
    if (want < 0.0015) { stats.dropped++; return null; }
    let s = freeAt(t);
    if (!s) {
      /* 보이스 상한: 지금 가장 조용한 소리를 20ms 로 걷어낸다 */
      let quiet = slots[0], ql = Infinity;
      for (let i = 0; i < slots.length; i++) {
        const l = levelAt(slots[i], t);
        if (l < ql) { ql = l; quiet = slots[i]; }
      }
      if (ql > want) { stats.dropped++; return null; }
      const g = quiet.gain.gain;
      try { g.cancelScheduledValues(t); g.setTargetAtTime(0, Math.max(t, ctx.currentTime), 0.008); } catch (e) {}
      quiet.busy = false;
      quiet.end = t + 0.03;
      stats.stolen++;
      s = quiet;
    }
    tokens -= 1;
    s.busy = true;
    s.id = ++slotId;
    s.level = want;
    s.end = t + Math.max(0.03, durSec || 0.2);
    const g = s.gain.gain;
    try { g.cancelScheduledValues(t); g.setValueAtTime(want > 0 ? want : 0.0001, Math.max(t, ctx.currentTime)); } catch (e) { g.value = want; }
    stats.played++;
    if (active + 1 > stats.peak) stats.peak = active + 1;
    return s.gain;
  }

  /** 같은 슬롯을 여러 오실레이터가 함께 쓸 때 끝나는 시각을 늘려 잡는다. */
  function extendSlot(gain, untilSec) {
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].gain === gain) { slots[i].end = Math.max(slots[i].end, untilSec); return; }
    }
  }

  function setMuted(m, level) {
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(m ? 0 : (level != null ? level : 0.7), t, 0.02);
    } catch (e) { master.gain.value = m ? 0 : (level != null ? level : 0.7); }
  }

  function dispose() {
    try { input.disconnect(); master.disconnect(); } catch (e) {}
  }

  return { input, master, dry, wet, conv, voice, extendSlot, setMuted, stats, dispose, snapshot };

  function snapshot() {
    return {
      played: stats.played, dropped: stats.dropped, stolen: stats.stolen, limited: stats.limited, peak: stats.peak,
      master: +master.gain.value.toFixed(3), ceiling: +ceiling.gain.value.toFixed(3), tokens: +tokens.toFixed(2),
      state: ctx.state, time: +ctx.currentTime.toFixed(2), voices: slots.filter(function (s) { return s.busy && s.end > ctx.currentTime; }).length
    };
  }
}
