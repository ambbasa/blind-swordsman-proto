/* Original Web Audio synthesis for 맹인 검객 일섬 v2.
 * No third-party samples. See docs/SOUND.md. */
export function createAudio() {
  let ctx = null, master = null, bgmGain = null, sfxGain = null;
  let bgmOn = false, timer = 0, nextBeat = 0, beatI = 0, melodyI = 0;
  let muted = true, quiet = true;

  const PENTA = [262, 294, 330, 392, 440, 523, 587, 659]; /* C D E G A, daegeum-ish range later shifted */
  const BELL_PARTIALS = [523, 1046, 1480, 1960, 2350];

  function ac() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(master);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.22;
    bgmGain.connect(master);
    return ctx;
  }

  function resume() {
    const c = ac();
    if (c && c.state === 'suspended') c.resume();
    return c;
  }

  function setQuiet(mute, noDelay) {
    muted = !!mute;
    quiet = !!mute || !!noDelay;
    if (master) master.gain.value = muted ? 0 : 0.7;
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

  function bell() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    BELL_PARTIALS.forEach(function (f, i) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * (1 + (Math.random() - 0.5) * 0.004), t0);
      const peak = (i === 0 ? 0.22 : 0.12 / (i + 1));
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7 + i * 0.15);
      o.connect(g); g.connect(sfxGain);
      o.start(t0); o.stop(t0 + 1.2);
    });
    /* wooden clapper click */
    noise(t0, 0.03, 'highpass', 2000, 0.5, 0.08);
  }

  function slash() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    /* 샤악 — airy blade */
    noise(t0, 0.11, 'highpass', 1800, 0.8, 0.28);
    noise(t0, 0.08, 'bandpass', 4200, 2.4, 0.16);
    tone(t0, 1400, 0.09, 0.07, 'triangle', sfxGain, 420);
  }

  function hit() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    tone(t0, 90, 0.16, 0.32, 'sine', sfxGain, 45);
    tone(t0, 180, 0.1, 0.12, 'triangle', sfxGain, 80);
    noise(t0, 0.09, 'lowpass', 900, 0.6, 0.2);
  }

  function explode() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    tone(t0, 70, 0.32, 0.38, 'sine', sfxGain, 32);
    tone(t0, 140, 0.22, 0.16, 'square', sfxGain, 50);
    noise(t0, 0.28, 'lowpass', 700, 0.5, 0.28);
    noise(t0 + 0.02, 0.18, 'bandpass', 1400, 1.2, 0.12);
  }

  function parry() {
    if (quiet) return;
    const c = resume(); if (!c) return;
    const t0 = c.currentTime;
    tone(t0, 720, 0.12, 0.16, 'triangle', sfxGain, 240);
    noise(t0, 0.06, 'highpass', 2500, 1, 0.18);
    bell();
  }

  function buk(t0, heavy) {
    if (!bgmGain) return;
    tone(t0, heavy ? 72 : 96, heavy ? 0.18 : 0.1, heavy ? 0.28 : 0.12, 'sine', bgmGain, heavy ? 38 : 60);
    noise(t0, heavy ? 0.08 : 0.05, 'lowpass', heavy ? 400 : 700, 0.7, heavy ? 0.16 : 0.07, bgmGain);
  }

  function janggu(t0) {
    noise(t0, 0.04, 'bandpass', 1800, 2.2, 0.07, bgmGain);
    tone(t0, 220, 0.05, 0.05, 'triangle', bgmGain, 140);
  }

  function daegeum(t0, freq, dur) {
    if (!bgmGain) return;
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    /* gentle vibrato */
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 5.2;
    lg.gain.value = freq * 0.008;
    lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'bandpass';
    f.frequency.value = freq * 1.4;
    f.Q.value = 2.5;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f); f.connect(g); g.connect(bgmGain);
    /* breath */
    noise(t0, dur * 0.9, 'bandpass', freq * 2.2, 1.1, 0.025, bgmGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
    lfo.start(t0); lfo.stop(t0 + dur + 0.02);
  }

  const PHRASE = [4, 5, 7, 5, 4, 2, 0, 2, 4, 4, 5, 7, 9, 7, 5, 4];

  function scheduleBeat(t0, i, bpm) {
    const heavy = (i % 4) === 0 || (i % 4) === 2;
    buk(t0, (i % 4) === 0);
    if ((i % 4) === 2) buk(t0 + 0.02, false);
    if (!heavy) janggu(t0);
    /* light 8th on the 'and' of 2 and 4 */
    if ((i % 4) === 1 || (i % 4) === 3) janggu(t0 + (60 / bpm) * 0.5 * 0.15);
    if (i % 2 === 0) {
      const note = PHRASE[melodyI % PHRASE.length];
      melodyI++;
      const freq = 392 * Math.pow(2, note / 12); /* G4 base, pentatonic steps stored as semitone-ish scale degrees */
      const map = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
      const f = 349.23 * Math.pow(2, (map[note] || 0) / 12); /* F4 */
      daegeum(t0 + 0.02, f, (60 / bpm) * (heavy ? 1.6 : 1.15));
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
    bpm = bpm || 100;
    const per = 60 / bpm;
    const t = c.currentTime;
    /* schedule a little ahead */
    while (nextBeat < t + 0.12) {
      scheduleBeat(nextBeat, beatI, bpm);
      beatI++;
      nextBeat += per;
    }
  }

  return {
    setQuiet: setQuiet,
    resume: resume,
    bell: bell,
    slash: slash,
    hit: hit,
    explode: explode,
    parry: parry,
    startBgm: startBgm,
    stopBgm: stopBgm,
    tick: tick,
    info: function () {
      return {
        synth: true,
        bpm: 100,
        kinds: ['slash', 'hit', 'explode', 'bell', 'bgm-daegeum-buk'],
        muted: muted,
        bgmOn: bgmOn,
        source: 'original-webaudio'
      };
    }
  };
}
