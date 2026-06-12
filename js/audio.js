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

  // All effects below are original synthesized designs (no resemblance to any
  // existing game's signature jingles).
  const sfx = {
    jump()    { tone({ freq: 300, slide: 360, type: 'triangle', dur: 0.2, vol: 0.18, send: 0.1 });
                tone({ freq: 600, slide: 720, type: 'sine', dur: 0.12, vol: 0.06 }); },
    stomp()   { tone({ freq: 180, slide: -120, type: 'sine', dur: 0.16, vol: 0.32 });
                noise({ dur: 0.1, vol: 0.16, freq: 420, q: 0.7 }); },
    // gem pickup: glassy crystalline chime (sine voices + sparkle)
    coin()    { tone({ freq: 1318, type: 'sine', dur: 0.1, vol: 0.16, send: 0.3 });
                tone({ freq: 1760, type: 'sine', dur: 0.28, vol: 0.13, when: 0.07, send: 0.3 });
                tone({ freq: 2637, type: 'sine', dur: 0.18, vol: 0.05, when: 0.07 });
                noise({ dur: 0.05, vol: 0.04, freq: 9000, q: 2, when: 0.02 }); },
    // power fruit: warm whole-tone bloom upward
    powerup() { [440, 554, 698, 880, 1109, 1397].forEach((f, i) =>
                  tone({ freq: f, type: 'triangle', dur: 0.13, vol: 0.13, when: i * 0.06, send: 0.2 })); },
    hurt()    { tone({ freq: 392, slide: -260, type: 'sawtooth', dur: 0.3, vol: 0.2 });
                noise({ dur: 0.22, vol: 0.12, freq: 280 }); },
    bump()    { tone({ freq: 120, slide: -40, type: 'triangle', dur: 0.1, vol: 0.25 }); },
    break_()  { noise({ dur: 0.3, vol: 0.3, freq: 850, q: 0.5 });
                tone({ freq: 170, slide: -110, type: 'triangle', dur: 0.2, vol: 0.2 }); },
    // defeat: a soft falling minor arpeggio with a low settle (original)
    die()     { [659, 523, 440, 330, 247].forEach((f, i) =>
                  tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.16, when: 0.1 + i * 0.18, send: 0.15 }));
                tone({ freq: 110, slide: -40, type: 'sine', dur: 0.5, vol: 0.18, when: 1.05 }); },
    // course clear: bright original rising fanfare
    win()     { [[523,0],[659,0.12],[784,0.24],[1047,0.36],[988,0.56],[1175,0.68],[1568,0.8]]
                  .forEach(([f, w]) => tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.15, when: w, send: 0.3 })); },
    kick()    { tone({ freq: 520, slide: 260, type: 'square', dur: 0.1, vol: 0.18 }); },
    // extra life: a quick lilting original up-flourish
    oneup()   { [587, 880, 784, 1175, 1568].forEach((f, i) =>
                  tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.14, when: i * 0.1, send: 0.3 })); },
  };

  /* ---------- music sequencer ----------
     A bright overworld loop: melody + harmony + bass + drums, 16th-note grid. */

  const N = { C4:262, D4:294, E4:330, F4:349, G4:392, A4:440, B4:494,
              C5:523, D5:587, E5:659, F5:698, G5:784, A5:880, B5:988, C6:1047,
              G3:196, A3:220, B3:247, C3:131, D3:147, E3:165, F3:175,
              G2:98, A2:110, C2:65, D2:73, E2:82, F2:87 };

  // Original "Nico World" overworld theme — an upbeat A-minor/C-major loop.
  // 4 bars of 16 sixteenth-notes. 0 = rest.
  const melody = [
    N.A4,0,N.C5,0, N.E5,0,N.D5,0, N.C5,0,N.E5,0, N.A5,0,0,0,
    N.G5,0,N.E5,0, N.C5,0,N.D5,0, N.E5,0,0,N.E5, N.D5,0,N.B4,0,
    N.C5,0,N.E5,0, N.G5,0,N.F5,0, N.E5,0,N.C5,0, N.D5,0,0,0,
    N.B4,0,N.D5,0, N.G4,0,N.B4,0, N.A4,0,0,N.C5, N.B4,0,N.A4,0,
  ];
  const bass = [
    N.A2,0,0,0, N.E3,0,0,0, N.A2,0,0,0, N.C3,0,N.E3,0,
    N.A2,0,0,0, N.E3,0,0,0, N.G2,0,0,0, N.D3,0,0,0,
    N.C3,0,0,0, N.G3,0,0,0, N.F2,0,0,0, N.C3,0,0,0,
    N.G2,0,0,0, N.D3,0,0,0, N.A2,0,0,0, N.E3,0,N.G2,0,
  ];
  const TEMPO = 158;           // bpm
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
