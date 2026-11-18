// Synthesised audio: no audio files, everything is WebAudio oscillators and
// filtered noise. Created lazily on the first user gesture (autoplay policy);
// every call is guarded so a missing/suspended AudioContext never throws.
export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.musicGain = null;
    this.muted = false; this.musicOn = false; this.sirenNodes = null;
    this.engineNodes = null; this._step = 0; this._nextNoteT = 0;
  }
  // Call from a user gesture (button click / first key). Safe to call often.
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    } catch { /* audio unavailable: the game stays silent */ }
  }
  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }
  _osc(type, freq, gain, when = 0, dur = 0.2, dest = null) {
    if (!this.ctx) return null;
    try {
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(dest || this.master);
      o.start(t); o.stop(t + dur + 0.05);
      return o;
    } catch { return null; }
  }
  _noise(dur, gain, filterFreq, type = 'lowpass', when = 0) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime + when;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur);
    } catch { /* ignore */ }
  }
  shoot() { this._noise(0.12, 0.5, 1800, 'highpass'); this._osc('square', 160, 0.25, 0, 0.08); }
  hit() { this._osc('sine', 880, 0.2, 0, 0.07); }
  dryFire() { this._osc('square', 1200, 0.08, 0, 0.03); }
  reload() { this._osc('square', 500, 0.12, 0, 0.05); this._osc('square', 700, 0.12, 0.12, 0.05); }
  pickup() { [523, 659, 784].forEach((f, i) => this._osc('sine', f, 0.18, i * 0.07, 0.18)); }
  missionDone() { [392, 523, 659, 784].forEach((f, i) => this._osc('triangle', f, 0.22, i * 0.09, 0.25)); }
  busted() { [330, 262, 196].forEach((f, i) => this._osc('sawtooth', f, 0.15, i * 0.16, 0.22)); }
  wasted() { [220, 175, 131].forEach((f, i) => this._osc('sawtooth', f, 0.18, i * 0.2, 0.3)); }
  click() { this._osc('sine', 660, 0.12, 0, 0.05); }
  skid() { this._noise(0.25, 0.12, 900, 'bandpass'); }
  crash() { this._noise(0.3, 0.4, 300); this._osc('sine', 70, 0.3, 0, 0.25); }
  // Engine hum: a low sawtooth whose pitch follows speed. Call every frame.
  engine(speed, top) {
    if (!this.ctx || this.muted) { this._stopEngine(); return; }
    try {
      if (!this.engineNodes) {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
        const g = this.ctx.createGain(); g.gain.value = 0.0;
        o.connect(f); f.connect(g); g.connect(this.master); o.start();
        this.engineNodes = { o, g };
      }
      const n = this.engineNodes;
      const frac = Math.min(1, Math.abs(speed) / Math.max(1, top));
      n.o.frequency.setTargetAtTime(55 + frac * 145, this.ctx.currentTime, 0.08);
      n.g.gain.setTargetAtTime(Math.abs(speed) > 0.5 ? 0.05 + frac * 0.05 : 0.0, this.ctx.currentTime, 0.1);
    } catch { /* ignore */ }
  }
  _stopEngine() {
    if (this.engineNodes) {
      try { this.engineNodes.o.stop(); } catch { /* ignore */ }
      this.engineNodes = null;
    }
  }
  // Two-tone police siren while any police are active.
  siren(on) {
    if (!this.ctx) return;
    try {
      if (on && !this.sirenNodes) {
        const o = this.ctx.createOscillator(); o.type = 'triangle';
        const g = this.ctx.createGain(); g.gain.value = 0.045;
        const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.8;
        const lg = this.ctx.createGain(); lg.gain.value = 260;
        lfo.connect(lg); lg.connect(o.frequency); o.frequency.value = 780;
        o.connect(g); g.connect(this.master); o.start(); lfo.start();
        this.sirenNodes = { o, lfo, g };
      } else if (!on && this.sirenNodes) {
        const n = this.sirenNodes; this.sirenNodes = null;
        try { n.o.stop(); n.lfo.stop(); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
  // 100 BPM A-minor groove: bass line + hats, scheduled a bar ahead.
  musicTick() {
    if (!this.ctx || this.muted || !this.musicOn) return;
    try {
      const spb = 60 / 100; // seconds per beat
      const bar = spb * 4;
      while (this._nextNoteT < this.ctx.currentTime + 0.3) {
        const t = Math.max(this._nextNoteT, this.ctx.currentTime);
        const step = this._step % 16;
        const bass = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 65.4, 0][step];
        if (bass) {
          const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = bass;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.9);
          o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + spb);
        }
        if (step % 4 === 2) { // off-beat hat
          const len = Math.floor(this.ctx.sampleRate * 0.03);
          const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
          const src = this.ctx.createBufferSource(); src.buffer = buf;
          const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
          const g = this.ctx.createGain(); g.gain.value = 0.12;
          src.connect(f); f.connect(g); g.connect(this.musicGain); src.start(t);
        }
        if (step === 0 || step === 8) { // sparse lead stab
          const o = this.ctx.createOscillator(); o.type = 'sine';
          o.frequency.value = step === 0 ? 440 : 523.25;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.8);
          o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + spb * 2);
        }
        this._step++;
        this._nextNoteT = t + bar / 16;
      }
    } catch { /* ignore */ }
  }
  startMusic() {
    this.ensure();
    if (!this.ctx) return;
    this.musicOn = true;
    this._nextNoteT = this.ctx.currentTime + 0.05;
    this._step = 0;
  }
}
