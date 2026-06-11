/* Super Nico World — procedural audio engine (Web Audio API).
   All music and SFX are synthesized at runtime; no audio files needed. */

const AudioEngine = (() => {
  let ctx = null;
  let master, musicBus, sfxBus, delaySend;
  let muted = false;
  let musicTimer = null;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createDynamicsCompressor();
    master.threshold.value = -18;
    master.ratio.value = 6;
    master.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.5;
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(master);

    // A feedback delay gives the dry synth voices a sense of space.
    const delay = ctx.createDelay(0.6);
    delay.delayTime.value = 0.27;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(master);
    delaySend = delay;
  }

  function resume() {
    init();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.disconnect();
    if (!muted && master) master.connect(ctx.destination);
    return muted;
  }

  /* ---------- voice helpers ---------- */

  function tone({ freq, type = 'square', dur = 0.15, vol = 0.2, when = 0,
                  slide = 0, attack = 0.004, bus = null, detune = 0, send = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    osc.detune.value = detune;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(bus || sfxBus);
    if (send > 0 && delaySend) {
      const sg = ctx.createGain();
      sg.gain.value = send;
      g.connect(sg).connect(delaySend);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.2, when = 0, freq = 1200, q = 1, bus = null }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(bus || sfxBus);
    src.start(t0);
  }

  /* ---------- sound effects ---------- */

  const sfx = {
    jump()    { tone({ freq: 330, slide: 420, type: 'square', dur: 0.22, vol: 0.16, send: 0.1 }); },
    stomp()   { tone({ freq: 220, slide: -160, type: 'triangle', dur: 0.18, vol: 0.3 });
                noise({ dur: 0.12, vol: 0.18, freq: 500, q: 0.8 }); },
    coin()    { tone({ freq: 988, type: 'square', dur: 0.08, vol: 0.14, send: 0.25 });
                tone({ freq: 1319, type: 'square', dur: 0.32, vol: 0.14, when: 0.08, send: 0.25 }); },
    powerup() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) =>
                  tone({ freq: f, type: 'square', dur: 0.12, vol: 0.13, when: i * 0.07, send: 0.2 })); },
    hurt()    { tone({ freq: 440, slide: -330, type: 'sawtooth', dur: 0.35, vol: 0.2 });
                noise({ dur: 0.25, vol: 0.12, freq: 300 }); },
    bump()    { tone({ freq: 110, slide: -40, type: 'triangle', dur: 0.1, vol: 0.25 }); },
    break_()  { noise({ dur: 0.3, vol: 0.3, freq: 900, q: 0.6 });
                tone({ freq: 180, slide: -120, type: 'triangle', dur: 0.2, vol: 0.2 }); },
    die()     { [494, 466, 440, 415, 392, 330, 262, 196].forEach((f, i) =>
                  tone({ freq: f, type: 'square', dur: 0.16, vol: 0.15, when: 0.1 + i * 0.13 })); },
    win()     { [523, 587, 659, 784, 880, 1047, 1175, 1319].forEach((f, i) =>
                  tone({ freq: f, type: 'square', dur: 0.22, vol: 0.14, when: i * 0.12, send: 0.3 })); },
    kick()    { tone({ freq: 600, slide: 300, type: 'square', dur: 0.1, vol: 0.18 }); },
    oneup()   { [659, 784, 1319, 1047, 1175, 1568].forEach((f, i) =>
                  tone({ freq: f, type: 'square', dur: 0.14, vol: 0.14, when: i * 0.09, send: 0.3 })); },
  };

  /* ---------- music sequencer ----------
     A bright overworld loop: melody + harmony + bass + drums, 16th-note grid. */

  const N = { C4:262, D4:294, E4:330, F4:349, G4:392, A4:440, B4:494,
              C5:523, D5:587, E5:659, F5:698, G5:784, A5:880, B5:988, C6:1047,
              G3:196, A3:220, B3:247, C3:131, D3:147, E3:165, F3:175,
              G2:98, A2:110, C2:65, D2:73, E2:82, F2:87 };

  // 4 bars of 16 sixteenth-notes. 0 = rest.
  const melody = [
    N.E5,0,N.E5,0, 0,N.E5,0,N.C5, N.E5,0,N.G5,0, 0,0,N.G4,0,
    N.C5,0,0,N.G4, 0,0,N.E4,0,  0,N.A4,0,N.B4, 0,N.A4,N.A4,0,
    N.G4,N.E5,0,N.G5, N.A5,0,N.F5,N.G5, 0,N.E5,0,N.C5, N.D5,N.B4,0,0,
    N.C5,0,N.G4,0, N.E4,0,N.A4,0, N.B4,0,N.A4,0, N.G4,0,0,0,
  ];
  const bass = [
    N.C3,0,0,0, N.G2,0,0,0, N.C3,0,0,0, N.G2,0,N.E3,0,
    N.A2,0,0,0, N.E3,0,0,0, N.F2,0,N.F3,0, N.G2,0,0,0,
    N.C3,0,N.E3,0, N.F3,0,N.D3,0, N.G2,0,N.B3,0, N.G3,0,N.D3,0,
    N.C3,0,N.G2,0, N.A2,0,N.F2,0, N.G2,0,N.G2,0, N.C3,0,0,0,
  ];
  const TEMPO = 168;           // bpm
  const STEP = 60 / TEMPO / 4; // one sixteenth note

  let step = 0;
  let nextTime = 0;

  function scheduleMusic() {
    if (!ctx || muted) return;
    while (nextTime < ctx.currentTime + 0.25) {
      const i = step % melody.length;
      const m = melody[i];
      const b = bass[i];
      const when = nextTime - ctx.currentTime;
      if (m) {
        tone({ freq: m, type: 'square', dur: STEP * 1.8, vol: 0.075, when, bus: musicBus, send: 0.12 });
        tone({ freq: m / 2, type: 'triangle', dur: STEP * 1.8, vol: 0.05, when, bus: musicBus, detune: 4 });
      }
      if (b) tone({ freq: b, type: 'triangle', dur: STEP * 3, vol: 0.16, when, bus: musicBus });
      if (i % 4 === 0) noise({ dur: 0.05, vol: 0.05, freq: 7000, q: 1.5, when, bus: musicBus }); // hat
      if (i % 8 === 4) noise({ dur: 0.09, vol: 0.08, freq: 2200, q: 0.9, when, bus: musicBus }); // snare
      nextTime += STEP;
      step++;
    }
  }

  function startMusic() {
    resume();
    if (musicTimer) return;
    step = 0;
    nextTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 80);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  return { resume, toggleMute, sfx, startMusic, stopMusic };
})();
