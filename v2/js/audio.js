/* Original Web Audio synthesis for 심안 v2.
 * No third-party samples. See docs/SOUND.md.
 * v0.39: 소리가 나가는 길을 공용 오디오 버스(audiobus.js)로 옮겼다 — 보이스 슬롯·토큰버킷·
 *        밀도 덕킹·방 초기반사·소프트니 리미터. 합성 자체(방울·베기·타격·대금)는 그대로다. */
import { createAudioBus } from './audiobus.js';
export function createAudio() {
  let ctx = null, master = null, bgmGain = null, sfxGain = null, bus = null;
  let bgmOn = false, bossMode = false, bgmAct = 1, bossPhase = 1, timer = 0, nextBeat = 0, beatI = 0, melodyI = 0;
  let muted = true, quiet = true;
  let busInfo = null;

  /* 한국 전통 계면조/평조 5음계 (D4 E4 F4 G4 A4 C5 D5 E5 F5 G5 A5) */
  const PENTA = [293.66, 329.63, 349.23, 392.00, 440.00, 523.25, 587.33, 659.25];
  const JING_PARTIALS = [1, 1.49, 2.02, 2.67, 3.18, 4.11, 5.24];
  const JING_GAINS = [0.22, 0.12, 0.09, 0.06, 0.045, 0.03, 0.02];
  /* Shaman's rattle (무당방울): a few shakes, each a cluster of tiny brass bells clinking a few ms apart.
     The cluster's centre pitch differs per shape so the ear can tell them apart. */
  const BELL = { shakes: [0, 0.15, 0.31], shakeGain: [1, 0.72, 0.48], bellsPerShake: 6, spreadSec: 0.045,
    ratios: [1, 2.42, 3.93], gains: [1, 0.45, 0.2], decay: [0.22, 0.12, 0.07], peak: 0.06, pitchSpread: 0.35,
    clink: 0.035, reverbSec: 1.4, reverbMix: 0.28 };
  const BELL_PITCH = { hline: 2600, vline: 2950, vee: 3350, bolt: 3800 };

  const samples = new Map();
  async function loadSample(context, name) {
    try {
      const response = await fetch(new URL('../assets/ink-edition/' + name + '.wav', import.meta.url));
      if (response.ok) samples.set(name, await context.decodeAudioData(await response.arrayBuffer()));
    } catch { /* The synth voice remains available offline. */ }
  }
  function sample(name, dest, time, rate, volume) {
    const buffer = samples.get(name);
    if (!buffer) return false;
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain); gain.connect(dest);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(time);
    return true;
  }
  function ac() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    for (const name of ['silk', 'wood', 'blade']) loadSample(ctx, name);
    /* 버스가 마스터·리미터·방을 모두 들고 있다. master 는 버스의 마스터 게인 별칭. */
    bus = createAudioBus(ctx, { maxVoices: 8, rate: 30, burst: 9, duck: 0.42, room: 0.6, wet: 0.22 });
    busInfo = bus;
    master = bus.master;
    master.gain.value = muted ? 0 : 0.7;
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(bus.input);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.22;
    bgmGain.connect(bus.input);
    return ctx;
  }

  /* 한 소리 = 보이스 슬롯 하나. 상한·레이트리밋·밀도 덕킹을 모두 여기서 통과한다. */
  function voice(level, dur) {
    if (!bus) return sfxGain;
    return bus.voice(level == null ? 0.8 : level, ctx.currentTime, dur || 0.25);
  }

  function resume() {
    const c = ac();
    if (c && c.state === 'suspended') c.resume();
    return c;
  }

  function setQuiet(mute, noDelay) {
    muted = !!mute;
    quiet = !!mute || !!noDelay;
    if (bus) bus.setMuted(muted, 0.7); else if (master) master.gain.value = muted ? 0 : 0.7;
    if (quiet && bgmOn) stopBgm();
  }

  function env(g, t0, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function noiseBuf(dur) {
    const c = ac();
    const n = Math.max(1, Math.floor((c.sampleRate * dur) | 0));
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function noise(t0, dur, type, freq, q, gain, dest) {
    const c = ac();
    const src = c.createBufferSource();
    src.buffer = noiseBuf(Math.max(dur, 0.05));
    const f = c.createBiquadFilter();
    f.type = type || 'highpass';
    f.frequency.setValueAtTime(freq, t0);
    f.Q.value = q || 0.7;
    const g = c.createGain();
    env(g, t0, 0.008, dur, gain);
    src.connect(f); f.connect(g); g.connect(dest || sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  function tone(t0, freq, dur, peak, type, dest, slide) {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
    env(g, t0, 0.01, dur, peak);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  let lastPans = [];

  function bell(pan, shape, vol) {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime + 0.005;
    const f0 = BELL_PITCH[shape] || 3000;
    const V = voice(0.85, BELL.reverbSec * 0.5); if (!V) return;
    const out = c.createGain();
    /* §9.4 묵은 방울: 방울 소리를 50% 크게(vol) */
    out.gain.value = vol == null ? 1 : Math.max(0, Math.min(2.5, vol));
    if (c.createStereoPanner) {
      const panN = c.createStereoPanner();
      panN.pan.setValueAtTime(pan == null ? 0 : Math.max(-1, Math.min(1, pan)), t0);
      out.connect(panN); panN.connect(V);
    } else {
      out.connect(V);
    }
    BELL.shakes.forEach(function (st, si) {
      const sg = BELL.shakeGain[si];
      for (let b = 0; b < BELL.bellsPerShake; b++) {
        const tb = t0 + st + Math.random() * BELL.spreadSec;
        const f = f0 * (1 + (Math.random() - 0.5) * BELL.pitchSpread);
        BELL.ratios.forEach(function (r, i) {
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(f * r, tb);
          const peak = BELL.peak * sg * BELL.gains[i] * (0.6 + Math.random() * 0.4);
          const dec = BELL.decay[i] * (0.8 + Math.random() * 0.5);
          g.gain.setValueAtTime(0.0001, tb);
          g.gain.linearRampToValueAtTime(peak, tb + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0001, tb + dec);
          o.connect(g); g.connect(out);
          o.start(tb); o.stop(tb + dec + 0.02);
        });
      }
      noise(t0 + st, 0.02, 'bandpass', 6500, 2.5, BELL.clink * sg, out);
    });
  }

  function setLastPans(list) { lastPans = (list || []).slice(); }

  /* 회수된 혼령의 요령: 한 번만 짧게 젖혀진 소리. */
  function bellCut(pan, shape) {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime + 0.003;
    const f0 = BELL_PITCH[shape] || 3000;
    const V = voice(0.7, 0.2); if (!V) return;
    const out = c.createGain();
    out.gain.value = 0.8;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.setValueAtTime(pan == null ? 0 : Math.max(-1, Math.min(1, pan)), t0);
      out.connect(p); p.connect(V);
    } else out.connect(V);
    for (let b = 0; b < 4; b++) {
      const tb = t0 + Math.random() * 0.03;
      const f = f0 * (1 + (Math.random() - 0.5) * BELL.pitchSpread);
      BELL.ratios.slice(0, 2).forEach(function (r, i) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f * r, tb);
        g.gain.setValueAtTime(0.0001, tb);
        g.gain.linearRampToValueAtTime(BELL.peak * 0.55 * BELL.gains[i], tb + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, tb + BELL.decay[i] * 0.7);
        o.connect(g); g.connect(out);
        o.start(tb); o.stop(tb + 0.2);
      });
    }
    noise(t0, 0.02, 'bandpass', 6000, 2.4, BELL.clink * 0.6, out);
  }

  /* 패링 실패: 허공을 가른 짧은 바람 소리. high=true면 칼이 튕긴 쇳소리(더 높고 짧게). */
  function whiff(high) {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(high ? 0.6 : 0.7, 0.12); if (!V) return;
    if (high) {
      noise(t0, 0.05, 'highpass', 2600, 1.1, 0.13, V);
      tone(t0, 1180, 0.05, 0.045, 'triangle', V, 760);
      tone(t0, 2360, 0.03, 0.03, 'sine', V, 1900);
      return;
    }
    noise(t0, 0.09, 'highpass', 900, 0.7, 0.16, V);
    tone(t0, 620, 0.08, 0.05, 'sine', V, 300);
  }

  /* 자석 수집: 개수만큼 올라가는 청동 음계('딩딩딩'). */
  function pickup(n) {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const cnt = Math.max(1, Math.min(8, n || 1));
    const scale = [784, 880, 988, 1175, 1319, 1568, 1760, 1976];
    const V = voice(0.55, cnt * 0.055 + 0.14); if (!V) return;
    for (let i = 0; i < cnt; i++) {
      const tb = t0 + i * 0.055;
      const f = scale[i % scale.length];
      tone(tb, f, 0.12, 0.07, 'sine', V);
      tone(tb, f * 2.01, 0.08, 0.03, 'sine', V);
    }
  }

  function drum() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(0.9, 0.3); if (!V) return;
    tone(t0, 72, 0.22, 0.38, 'sine', V, 36);
    noise(t0, 0.1, 'lowpass', 420, 0.7, 0.22, V);
  }

  /* 칼날 층: 발도 쇳소리 + 칼바람 + 저음 풍압 (획 길이·연타 콤보에 맞춰 음높이 미세 상승). */
  function slash(lenRatio, combo, step) {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const isFin = (step === 3);
    const V = voice(isFin ? 1.15 : 1.0, isFin ? 0.24 : 0.18); if (!V) return;
    const stepShift = step === 3 ? 2.2 : (step === 2 ? 1.0 : 0);
    const cShift = Math.min(8, Math.max(0, combo || 0)) * 0.25 + stepShift;
    const k = Math.pow(2, ((lenRatio == null ? 1 : clamp01(lenRatio) * 2) + cShift) / 12);
    if (isFin) {
      tone(t0, 128, 0.18, 0.16, 'sine', V, 54);
      tone(t0 + 0.01, 2480 * k, 0.12, 0.055, 'triangle', V, 1620 * k);
    }
    const hasBlade = sample('blade', V, t0, k, 0.42);
    /* 맑은 발도 쇠울림 레이어 */
    tone(t0, 1780 * k, 0.075, 0.055, 'triangle', V, 1120 * k);
    tone(t0 + 0.005, 3120 * k, 0.055, 0.032, 'sine', V, 2340 * k);
    /* 저음 칼바람 풍압 */
    tone(t0, 210 * k, 0.11, 0.09, 'sine', V, 95);
    if (!hasBlade) {
      noise(t0, 0.11, 'highpass', 1800 * k, 0.8, 0.26, V);
      noise(t0, 0.08, 'bandpass', 4200 * k, 2.4, 0.15, V);
    } else {
      noise(t0 + 0.01, 0.07, 'bandpass', 3600 * k, 1.8, 0.09, V);
    }
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* 살 층: 묵직한 타격 + 대나무 스냅 + 콤보 연동 5음계 편경(옥종) 공명음. */
  function hit(perfect, combo) {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(1.0, 0.24); if (!V) return;
    if (!sample('wood', V, t0, perfect ? 1.14 : 0.96, 0.58)) tone(t0, 92, 0.16, 0.32, 'sine', V, 44);
    tone(t0, 168, 0.11, 0.14, 'triangle', V, 74);
    noise(t0, 0.085, 'lowpass', 950, 0.65, 0.20, V);
    /* 연타 콤보가 쌓이면 맑은 동양 편경(옥종) 5음계가 단계별로 울림 */
    const step = Math.max(0, Math.min(PENTA.length - 1, (combo || 0) % PENTA.length));
    if (perfect || (combo && combo >= 2)) {
      const f = PENTA[step] * 2;
      tone(t0 + 0.004, f, 0.14, perfect ? 0.065 : 0.04, 'sine', V, f * 0.995);
      tone(t0 + 0.006, f * 2.74, 0.08, perfect ? 0.028 : 0.016, 'sine', V);
    }
    if (perfect) {
      noise(t0, 0.05, 'bandpass', 3400, 2.0, 0.08, V);
    }
  }

  function deflect() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const v = voice(0.85, 0.18); if (!v) return;
    const t = c.currentTime;
    tone(t, 1420, 0.12, 0.12, 'triangle', v, 860);
    tone(t, 2680, 0.10, 0.06, 'sine', v, 2120);
    noise(t, 0.04, 'highpass', 3000, 1.1, 0.11, v);
  }
  function breakCue() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const v = voice(1.0, 0.45); if (!v) return;
    const t = c.currentTime;
    tone(t, 118, 0.20, 0.24, 'sine', v, 52);
    noise(t, 0.09, 'bandpass', 1250, 0.75, 0.24, v);
    tone(t + 0.03, 587, 0.28, 0.12, 'triangle', v, 392);
    tone(t + 0.06, 880, 0.26, 0.08, 'sine', v, 659);
  }
  function explode() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(1.0, 0.44); if (!V) return;
    tone(t0, 68, 0.36, 0.40, 'sine', V, 28);
    tone(t0, 136, 0.24, 0.16, 'triangle', V, 46);
    noise(t0, 0.30, 'lowpass', 720, 0.55, 0.28, V);
    noise(t0 + 0.02, 0.20, 'bandpass', 1500, 1.2, 0.13, V);
  }

  /* 칼집 패링: 6배음 쇠 맞부딪힘 + 묵직한 타격 + 맑은 공명 */
  function parry() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(1.0, 0.34); if (!V) return;
    tone(t0, 115, 0.10, 0.20, 'sine', V, 58);
    [980, 1520, 2240, 3190, 4420].forEach(function (f, i) {
      tone(t0, f, 0.24 - i * 0.03, 0.095 / (i * 0.55 + 1), i < 2 ? 'triangle' : 'sine', V, f * 0.96);
    });
    noise(t0, 0.055, 'highpass', 2800, 1.1, 0.18, V);
    bell();
  }

  /* v0.97 저스트 패링(완벽 막기): 예리한 칼날 격돌 + 맑은 옥종 공명 + 깊은 충격 저음 */
  function justParry() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(1.0, 0.92); if (!V) return;
    tone(t0, 96, 0.16, 0.30, 'sine', V, 40);
    [1380, 2160, 3280, 4890].forEach(function (f, i) {
      tone(t0, f, 0.22 - i * 0.025, 0.11 / (i * 0.5 + 1), i < 2 ? 'triangle' : 'sine', V, f * 0.97);
    });
    noise(t0, 0.048, 'highpass', 3200, 1.2, 0.22, V);
    /* 옥종 공명 (D5 + D6 + A6 + 미세 맥놀이) */
    tone(t0 + 0.015, 587.33, 0.85, 0.16, 'sine', V, 584.5);
    tone(t0 + 0.018, 589.60, 0.80, 0.10, 'sine', V, 586.8);
    tone(t0 + 0.022, 1174.66, 0.68, 0.095, 'sine', V, 1170.0);
    tone(t0 + 0.026, 1762.00, 0.48, 0.052, 'triangle', V, 1756.0);
    bell();
  }

  /* 한국 징(Jing): 7개 비정수 금속 배음 + 느린 맥놀이 + 장엄한 잔향 */
  function gong() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(1.0, 1.85); if (!V) return;
    const f0 = 146.83; /* D3 — 깊고 웅장한 대징 */
    for (let i = 0; i < JING_PARTIALS.length; i++) {
      const dur = 1.75 - i * 0.18;
      tone(t0, f0 * JING_PARTIALS[i], dur, JING_GAINS[i], i % 2 ? 'triangle' : 'sine', V, f0 * JING_PARTIALS[i] * 0.985);
    }
    /* 징 특유의 느린 맥놀이(약간 어긋난 쌍배음) */
    tone(t0 + 0.01, f0 * 1.012, 1.65, 0.14, 'sine', V, f0 * 0.995);
    noise(t0, 0.06, 'bandpass', 880, 1.4, 0.15, V);
  }

  /* v0.50: ReferenceError(perfect) 수정 + 아쟁 상승 글리산도 + 심장박동 대북 기모으기 */
  function charge(dur) {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const d = Math.max(0.25, Math.min(3.5, dur || 1.2));
    const t0 = c.currentTime;
    const V = voice(0.8, d + 0.15); if (!V) return;
    tone(t0, 82, d, 0.12, 'sawtooth', V, 220);
    tone(t0, 164, d, 0.07, 'triangle', V, 440);
    noise(t0, d * 0.85, 'bandpass', 720, 1.8, 0.06, V);
    /* 차오르는 대북 심장박동 */
    const beats = Math.max(2, Math.min(5, Math.floor(d / 0.42)));
    for (let i = 0; i < beats; i++) {
      const tb = t0 + (i / beats) * d * 0.85;
      tone(tb, 76 + i * 10, 0.16, 0.14 + i * 0.03, 'sine', V, 38);
    }
  }

  /* v0.50 보스 전용 국악 사운드 5종 */
  function kkwaeng(t0, vol, dest) {
    const out = dest || bgmGain;
    if (!out) return;
    const k = vol == null ? 1 : vol;
    [880, 1340, 2120, 3190].forEach(function (f, i) {
      tone(t0, f, 0.18 - i * 0.025, (0.045 * k) / (i * 0.5 + 1), i === 0 ? 'triangle' : 'sine', out, f * 0.97);
    });
    noise(t0, 0.04, 'bandpass', 3600, 1.6, 0.05 * k, out);
  }

  function bossSpawn() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(1.0, 1.9); if (!V) return;
    gong();
    /* 장엄한 대북 3연타 + 낮은 아쟁 포효 */
    tone(t0, 62, 0.45, 0.38, 'sine', V, 30);
    tone(t0 + 0.22, 68, 0.35, 0.28, 'sine', V, 34);
    tone(t0 + 0.42, 58, 0.65, 0.42, 'sine', V, 26);
    tone(t0 + 0.05, 110, 1.2, 0.11, 'sawtooth', V, 82);
  }

  function bossSlam() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(1.0, 0.62); if (!V) return;
    tone(t0, 64, 0.48, 0.46, 'sine', V, 24);
    tone(t0, 138, 0.26, 0.20, 'triangle', V, 44);
    noise(t0, 0.34, 'lowpass', 620, 0.55, 0.32, V);
    noise(t0 + 0.015, 0.14, 'bandpass', 1900, 1.3, 0.15, V);
    kkwaeng(t0, 0.9, V);
  }

  function bossCharge() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(0.95, 0.42); if (!V) return;
    kkwaeng(t0, 1.1, V);
    noise(t0 + 0.02, 0.32, 'bandpass', 1450, 0.9, 0.22, V);
    tone(t0, 280, 0.28, 0.14, 'sawtooth', V, 92);
  }

  function bossVolley() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(0.9, 0.36); if (!V) return;
    for (let i = 0; i < 4; i++) {
      const tb = t0 + i * 0.045;
      noise(tb, 0.07, 'highpass', 2400 + i * 350, 1.2, 0.12, V);
      tone(tb, 980 + i * 180, 0.08, 0.055, 'triangle', V, 520);
    }
  }

  function bossBreak() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    const V = voice(1.0, 1.1); if (!V) return;
    gong();
    [1174.66, 880, 659.25, 587.33].forEach(function (f, i) {
      tone(t0 + i * 0.065, f, 0.36, 0.09, 'sine', V, f * 0.99);
    });
  }

  /* ---------- 풍성한 한국 전통 BGM 편성 (대북·장구·꽹과리·가야금·대금·아쟁 드론) ---------- */
  function buk(t0, heavy) {
    if (!bgmGain) return;
    tone(t0, heavy ? 68 : 92, heavy ? 0.24 : 0.12, heavy ? 0.30 : 0.14, 'sine', bgmGain, heavy ? 34 : 56);
    noise(t0, heavy ? 0.09 : 0.05, 'lowpass', heavy ? 380 : 680, 0.7, heavy ? 0.16 : 0.07, bgmGain);
  }

  function janggu(t0, accent) {
    if (!bgmGain) return;
    const k = accent ? 1.35 : 1.0;
    noise(t0, 0.045, 'bandpass', accent ? 2200 : 1750, 2.2, 0.075 * k, bgmGain);
    tone(t0, accent ? 260 : 215, 0.055, 0.055 * k, 'triangle', bgmGain, 135);
  }

  /* 가야금 산조 뜯기: 명주실 현 배음 + 미세 농현(vibrato) */
  function gayageum(t0, freq, dur, vol) {
    if (!bgmGain) return;
    const c = ac(); if (!c) return;
    const v = vol == null ? 0.095 : vol;
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    const g = c.createGain(), f = c.createBiquadFilter();
    o1.type = 'triangle'; o2.type = 'sine';
    o1.frequency.setValueAtTime(freq, t0);
    o2.frequency.setValueAtTime(freq * 2.005, t0);
    /* 농현: 음이 울린 직후 자연스럽게 떨림 */
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 4.6;
    lg.gain.setValueAtTime(0.0001, t0);
    lg.gain.linearRampToValueAtTime(freq * 0.011, t0 + Math.min(0.28, dur * 0.45));
    lfo.connect(lg); lg.connect(o1.frequency);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.min(4800, freq * 6.5), t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(320, freq * 1.4), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(bgmGain);
    o1.start(t0); o1.stop(t0 + dur + 0.03);
    o2.start(t0); o2.stop(t0 + dur + 0.03);
    lfo.start(t0); lfo.stop(t0 + dur + 0.03);
  }

  /* 아쟁/거문고 저음 드론: 밤의 폐허와 보스전의 묵직한 바닥 울림 */
  function ajaengDrone(t0, freq, dur, vol) {
    if (!bgmGain) return;
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t0);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 2.4, t0);
    f.frequency.linearRampToValueAtTime(freq * 3.8, t0 + dur * 0.5);
    f.frequency.linearRampToValueAtTime(freq * 2.0, t0 + dur);
    f.Q.value = 1.6;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol || 0.065, t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f); f.connect(g); g.connect(bgmGain);
    o.start(t0); o.stop(t0 + dur + 0.04);
  }

  function daegeum(t0, freq, dur) {
    if (!bgmGain) return;
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), o2 = c.createOscillator();
    const g = c.createGain(), g2 = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sine'; o2.type = 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    o2.frequency.setValueAtTime(freq * 2, t0);
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 5.4;
    lg.gain.value = freq * 0.010;
    lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'bandpass';
    f.frequency.value = freq * 1.45;
    f.Q.value = 2.1;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.115, t0 + 0.07);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g2.gain.value = 0.22;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(bgmGain);
    /* 대금 숨결(청 울림) */
    noise(t0, Math.min(0.12, dur * 0.25), 'bandpass', freq * 3.1, 1.8, 0.032, bgmGain);
    noise(t0, dur * 0.9, 'bandpass', freq * 2.2, 1.1, 0.024, bgmGain);
    o.start(t0); o.stop(t0 + dur + 0.03);
    o2.start(t0); o2.stop(t0 + dur + 0.03);
    lfo.start(t0); lfo.stop(t0 + dur + 0.03);
  }

  /* A/B 2악절 32스텝 계면조(D-F-G-A-C) 선율 + 가야금 반주 */
  const GY_SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22]; /* D 계면조 반음 */
  const PHRASE_A = [3, 4, 5, 4, 3, 2, 0, 2, 3, 5, 6, 5, 4, 3, 2, 0];
  const PHRASE_B = [5, 6, 7, 6, 5, 4, 3, 4, 5, 3, 2, 3, 4, 2, 0, 0];
  const BOSS_ARP = [0, 3, 4, 5, 4, 3, 1, 0];
  /* v0.99 막(Act 1~4)별 국악 BGM 음계·템포·악기 변주 */
  const ACT_BGM = {
    1: { baseHz: 293.66, droneHz: 73.42, bpmMul: 1.00, chime: false, extraDrum: false }, /* 1막 D 계면조: 잔잔한 가야금·대금 */
    2: { baseHz: 329.63, droneHz: 82.41, bpmMul: 0.96, chime: true,  extraDrum: false }, /* 2막 E 청아조: 설산 대금·옥종 여운 */
    3: { baseHz: 277.18, droneHz: 69.30, bpmMul: 1.07, chime: false, extraDrum: true  }, /* 3막 C# 혈월조: 아쟁·장구 긴박 */
    4: { baseHz: 261.63, droneHz: 65.41, bpmMul: 1.11, chime: true,  extraDrum: true  }  /* 4막 C 나락조: 대북·징·웅장 드론 */
  };
  function actBgm() { return ACT_BGM[bgmAct] || ACT_BGM[1]; }

  function gyFreq(deg, oct) {
    const semi = GY_SCALE[((deg | 0) + GY_SCALE.length * 4) % GY_SCALE.length] + (oct || 0) * 12;
    return actBgm().baseHz * Math.pow(2, semi / 12);
  }

  function setBossMode(on) {
    bossMode = !!on;
    if (!bossMode) bossPhase = 1;
  }
  function setAct(n) {
    bgmAct = Math.max(1, Math.min(4, (n | 0) || 1));
  }
  function setBossPhase(p) {
    bossPhase = Math.max(1, Math.min(3, (p | 0) || 1));
  }

  function scheduleBeat(t0, i, bpm) {
    const per = 60 / (bpm || 100);
    const barBeat = i % 8;
    const isHeavy = (i % 4) === 0 || (i % 4) === 2;
    const ab = actBgm();

    /* 1) 저음 아쟁/거문고 드론 (8박마다 깊은 호흡, 3~4막·보스전 강화) */
    if (barBeat === 0) {
      const root = bossMode && ((i >> 3) % 2 === 1) ? ab.droneHz * 1.0595 : ab.droneHz;
      const dVol = bossMode ? (0.085 + (bossPhase - 1) * 0.015) : (bgmAct >= 3 ? 0.068 : 0.055);
      ajaengDrone(t0, root, per * 7.8, dVol);
      ajaengDrone(t0 + 0.03, root * 1.5, per * 7.2, dVol * 0.54);
    }

    /* 2) 타악: 막별 리듬 + 보스 페이즈(1/2/3)별 점층 강화 */
    buk(t0, (i % 4) === 0);
    if (bossMode) {
      if ((i % 2) === 1) buk(t0 + per * 0.5, bossPhase >= 3);
      janggu(t0 + per * 0.25, (i % 4) === 1);
      janggu(t0 + per * 0.75, (i % 4) === 3);
      if (bossPhase >= 2 && (i % 2) === 0) janggu(t0 + per * 0.5, true);
      if ((i % 4) === 0 || (i % 8) === 6 || (bossPhase >= 3 && (i % 4) === 2)) {
        kkwaeng(t0, (i % 8) === 0 ? 0.90 : 0.58, bgmGain);
      }
    } else {
      if ((i % 4) === 2 || (ab.extraDrum && (i % 4) === 3)) buk(t0 + 0.02, bgmAct === 4 && (i % 8) === 0);
      if (!isHeavy) janggu(t0, false);
      if ((i % 4) === 1 || (i % 4) === 3) janggu(t0 + per * 0.5, (i % 4) === 3);
      if (ab.chime && (i % 8) === 4 && bgmGain) {
        const cf = gyFreq(5, 1);
        tone(t0 + 0.02, cf, 0.75, 0.032, 'sine', bgmGain, cf * 0.996);
        tone(t0 + 0.024, cf * 2, 0.45, 0.014, 'sine', bgmGain);
      }
    }

    /* 3) 가야금 산조 반주 (매 박 부드러운 뜯기, 보스전엔 긴박한 8분음표 아르페지오) */
    if (bossMode) {
      const a0 = BOSS_ARP[i % BOSS_ARP.length];
      const a1 = BOSS_ARP[(i + 2) % BOSS_ARP.length];
      gayageum(t0, gyFreq(a0, 0), per * 0.85, 0.095);
      gayageum(t0 + per * 0.5, gyFreq(a1, 1), per * 0.65, 0.07);
    } else if (i % 2 === 0 || i % 4 === 3) {
      const phrase = ((i >> 4) % 2 === 0) ? PHRASE_A : PHRASE_B;
      const deg = phrase[(i >> 1) % phrase.length];
      gayageum(t0 + 0.01, gyFreq(deg, -1), per * 1.7, 0.085);
      if (i % 4 === 0) gayageum(t0 + per * 0.35, gyFreq(deg + 2, 0), per * 1.1, 0.055);
    }

    /* 4) 대금 선율 (2박마다 A/B 32스텝 서정/비장 선율) */
    if (i % 2 === 0) {
      const phrase = ((melodyI >> 4) % 2 === 0) ? PHRASE_A : PHRASE_B;
      const deg = phrase[melodyI % phrase.length];
      melodyI++;
      const f = gyFreq(deg, bossMode ? 1 : 0);
      if (i % 8 === 0 || !sample('silk', bgmGain, t0 + 0.02, f / 220, 0.36)) {
        daegeum(t0 + 0.02, f, per * (isHeavy ? 1.75 : 1.2));
      }
    }
  }

  function startBgm() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    bgmOn = true;
    beatI = 0; melodyI = 0;
    nextBeat = c.currentTime + 0.05;
  }

  function stopBgm() {
    bgmOn = false;
  }

  function tick(bpm) {
    if (!bgmOn || quiet) return;
    const c = ac(); if (!c) return;
    const phaseMul = bossMode ? (bossPhase >= 3 ? 1.30 : (bossPhase === 2 ? 1.24 : 1.18)) : actBgm().bpmMul;
    bpm = (bpm || 100) * phaseMul;
    const per = 60 / bpm;
    const t = c.currentTime;
    /* schedule a little ahead */
    while (nextBeat < t + 0.12) {
      scheduleBeat(nextBeat, beatI, bpm);
      beatI++;
      nextBeat += per;
    }
  }

  /* ---------- 종이 소리 (v0.40 5단계, Papertrails audio/paper.js 응용) ----------
     샘플 없이 합성한다: 크래클 그레인(0.1~1.5ms 노이즈 버스트를 1~6kHz 카드 몸통 공명 3개에 통과)
     + 온셋 스냅 + 바람 같은 브러시 베드. 접힘은 짧고 밝게, 찢김은 길고 거칠게, 으깸은 낮게.
     버스의 보이스 슬롯·리미터·방을 그대로 지나므로 과밀해도 잡음 밭이 되지 않는다. */
  const CARD_RES = [1180, 2650, 4700];
  function crackle(t0, count, spread, peak, out) {
    const c = ac(); if (!c) return;
    for (let i = 0; i < count; i++) {
      const tb = t0 + Math.random() * spread;
      const dur = 0.004 + Math.random() * 0.016;
      const res = CARD_RES[i % CARD_RES.length] * (0.82 + Math.random() * 0.42);
      noise(tb, dur, 'bandpass', res, 1.8 + Math.random() * 2.2, peak * (0.5 + Math.random() * 0.8), out);
    }
  }
  /** 종이를 펼칠 때(부적·카드·결계): 스냅 → 짧은 브러시 → 잔크래클. strength 0~1. */
  function paperFold(strength) {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const s = strength == null ? 0.7 : Math.max(0.05, Math.min(1.4, strength));
    const t0 = c.currentTime + 0.004;
    const V = voice(0.45 + 0.4 * s, 0.22); if (!V) return;
    noise(t0, 0.02, 'highpass', 3200, 0.8, 0.10 * s, V);            /* 온셋 스냅 */
    noise(t0 + 0.004, 0.10 + 0.05 * s, 'bandpass', 2400, 0.9, 0.11 * s, V); /* 브러시 베드 */
    crackle(t0 + 0.006, 4 + Math.round(5 * s), 0.10, 0.05 * s, V);
    tone(t0, 210, 0.06, 0.03 * s, 'sine', V, 150);                  /* 종이가 눌리며 나는 낮은 몸통 */
  }
  /** 종이를 찢을 때(항아리 파손): 길고 거친 노이즈 + 중간에 끊기는 리프. */
  function paperTear(strength) {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const s = strength == null ? 0.8 : Math.max(0.05, Math.min(1.4, strength));
    const t0 = c.currentTime + 0.003;
    const V = voice(0.6 + 0.4 * s, 0.34); if (!V) return;
    for (let i = 0; i < 3; i++) {
      const tb = t0 + i * (0.05 + Math.random() * 0.04);
      noise(tb, 0.10 + Math.random() * 0.06, 'highpass', 1800 + Math.random() * 1400, 0.7, 0.10 * s, V);
    }
    crackle(t0, 8 + Math.round(8 * s), 0.22, 0.06 * s, V);
  }
  /** 종이를 으깰 때(묵항아리): 뭉툭한 저음 + 듬성한 크래클. */
  function paperCrush(strength) {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const s = strength == null ? 0.9 : Math.max(0.05, Math.min(1.4, strength));
    const t0 = c.currentTime + 0.003;
    const V = voice(0.55 + 0.35 * s, 0.3); if (!V) return;
    tone(t0, 120, 0.16, 0.14 * s, 'sine', V, 62);
    noise(t0, 0.16, 'lowpass', 1100, 0.6, 0.12 * s, V);
    crackle(t0 + 0.01, 6 + Math.round(6 * s), 0.20, 0.05 * s, V);
  }

  return {
    setQuiet: setQuiet,
    resume: resume,
    bell: bell,
    bellCut: bellCut,
    whiff: whiff,
    pickup: pickup,
    slash: slash,
    hit: hit,
    heavySweep: function () {
      if (quiet) return;
      const c = resume(); if (!c) return;
      const t0 = c.currentTime;
      const V = voice(0.95, 0.28); if (!V) return;
      tone(t0, 175, 0.22, 0.16, 'sawtooth', V, 68);
      tone(t0 + 0.02, 820, 0.16, 0.05, 'triangle', V, 410);
      noise(t0, 0.22, 'bandpass', 680, 1.4, 0.22, V);
    },
    heavySlam: function () {
      if (quiet) return;
      const c = resume(); if (!c) return;
      const t0 = c.currentTime;
      const V = voice(1.0, 0.36); if (!V) return;
      tone(t0, 88, 0.28, 0.34, 'sine', V, 32);
      tone(t0, 145, 0.14, 0.16, 'triangle', V, 52);
      noise(t0, 0.18, 'lowpass', 520, 0.8, 0.28, V);
      noise(t0 + 0.01, 0.09, 'bandpass', 1650, 1.8, 0.10, V);
    },
    deflect: deflect,
    breakCue: breakCue,
    explode: explode,
    parry: parry,
    justParry: justParry,
    drum: drum,
    gong: gong,
    bossSpawn: bossSpawn,
    bossSlam: bossSlam,
    bossCharge: bossCharge,
    bossVolley: bossVolley,
    bossBreak: bossBreak,
    setBossMode: setBossMode,
    setAct: setAct,
    setBossPhase: setBossPhase,
    paperFold: paperFold,
    paperTear: paperTear,
    paperCrush: paperCrush,
    charge: charge,
    setLastPans: setLastPans,
    lastPans: function () { return lastPans.slice(); },
    startBgm: startBgm,
    stopBgm: stopBgm,
    tick: tick,
    info: function () {
      const b = busInfo ? busInfo.snapshot() : null;
      return {
        synth: true,
        bpm: bossMode ? 118 : 100,
        bossMode: bossMode,
        kinds: ['slash', 'hit', 'explode', 'bell', 'bellCut', 'whiff', 'pickup', 'drum', 'gong', 'justParry', 'bossSpawn', 'bossSlam', 'bossCharge', 'bossVolley', 'bossBreak', 'paperFold', 'paperTear', 'paperCrush', 'bgm-gayageum-daegeum-ajaeng-janggu'],
        muted: muted,
        bgmOn: bgmOn,
        source: 'original-webaudio',
        bus: b,
        lastPans: lastPans.slice()
      };
    }
  };
}
