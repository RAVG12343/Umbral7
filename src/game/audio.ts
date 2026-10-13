/** Procedural Web Audio. Unlocks only inside a user gesture. */

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private volume = 0.85;
  private voices = 0;

  unlock() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      const ctx = new AC({ latencyHint: "interactive" });
      this.ctx = ctx;
      const master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 8;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      const muffle = ctx.createBiquadFilter();
      muffle.type = "lowpass";
      muffle.frequency.value = 17000;
      const sfx = ctx.createGain();
      sfx.connect(muffle);
      muffle.connect(master);
      master.connect(comp);
      comp.connect(ctx.destination);
      this.master = master;
      this.sfx = sfx;
      this.muffle = muffle;
      this.applyVolume();
      this.bake();
      this.startRain();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  private applyVolume() {
    if (!this.ctx || !this.master) return;
    const g = this.volume * this.volume;
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.03);
  }

  setMuffle(freq: number) {
    if (!this.ctx || !this.muffle) return;
    this.muffle.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.08);
  }

  setRain(amount: number) {
    if (!this.ctx || !this.rainGain) return;
    this.rainGain.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.2);
  }

  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener;
    const now = ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(x, now);
      L.positionY.setValueAtTime(y, now);
      L.positionZ.setValueAtTime(z, now);
      L.forwardX.setValueAtTime(fx, now);
      L.forwardY.setValueAtTime(fy, now);
      L.forwardZ.setValueAtTime(fz, now);
      L.upX.setValueAtTime(ux, now);
      L.upY.setValueAtTime(uy, now);
      L.upZ.setValueAtTime(uz, now);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  gun(kind: "rifle" | "shotgun") {
    this.playBuf(kind, 1, 0.96 + Math.random() * 0.06);
  }

  dry() {
    this.playBuf("dry", 0.5, 1);
  }

  jam() {
    this.playBuf("dry", 0.7, 0.8);
  }

  mech() {
    this.playBuf("mech", 0.45, 0.85 + Math.random() * 0.3);
  }

  step(x: number, y: number, z: number, occluded: boolean, gain = 0.35) {
    this.playAt("step", x, y, z, occluded, gain, 0.9 + Math.random() * 0.2);
  }

  groan(kind: "walker" | "runner" | "tank" | "stalker", x: number, y: number, z: number, occluded: boolean) {
    if (!this.ctx || !this.sfx || this.voices > 10) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = kind === "stalker" ? "highpass" : "bandpass";
    const base = kind === "tank" ? 62 : kind === "runner" ? 140 : kind === "stalker" ? 220 : 95;
    osc.type = kind === "stalker" ? "sine" : "sawtooth";
    osc.frequency.value = base * (0.92 + Math.random() * 0.16);
    filter.frequency.value = kind === "stalker" ? 500 : 280;
    filter.Q.value = 4;
    const dur = kind === "stalker" ? 0.9 : 0.55;
    const now = ctx.currentTime;
    const peak = (kind === "stalker" ? 0.08 : 0.16) * (occluded ? 0.28 : 1);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    const out = this.space(x, y, z, occluded);
    osc.connect(filter);
    filter.connect(g);
    g.connect(out.input);
    out.output.connect(this.sfx);
    osc.start(now);
    osc.stop(now + dur + 0.02);
    this.track(osc, out.output);
  }

  impact(mat: string, x: number, y: number, z: number) {
    const key = mat === "glass" ? "glass" : mat === "wood" || mat === "plank" ? "wood" : mat === "flesh" ? "flesh" : "hard";
    this.playAt(key, x, y, z, false, key === "flesh" ? 0.4 : 0.55, 0.85 + Math.random() * 0.3);
  }

  heart() {
    this.playBuf("heart", 0.45, 1);
  }

  breath() {
    this.playBuf("breath", 0.22, 0.8 + Math.random() * 0.3);
  }

  localStep(gain: number) {
    this.playBuf("step", gain, 0.92 + Math.random() * 0.16);
  }

  private space(x: number, y: number, z: number, occluded: boolean) {
    const ctx = this.ctx!;
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = 1.6;
    p.maxDistance = 42;
    p.rolloffFactor = occluded ? 2.2 : 1.25;
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    if (!occluded) return { input: p as AudioNode, output: p as AudioNode };
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.connect(p);
    return { input: filter as AudioNode, output: p as AudioNode };
  }

  private playAt(name: string, x: number, y: number, z: number, occluded: boolean, gain: number, rate: number) {
    if (!this.ctx || !this.sfx || this.voices > 16) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain * (occluded ? 0.32 : 1);
    const out = this.space(x, y, z, occluded);
    src.connect(g);
    g.connect(out.input);
    out.output.connect(this.sfx);
    src.start();
    this.track(src, out.output);
  }

  private playBuf(name: string, gain: number, rate: number) {
    if (!this.ctx || !this.sfx || this.voices > 18) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.sfx);
    src.start();
    this.track(src, g);
  }

  private track(src: AudioBufferSourceNode | OscillatorNode, node: AudioNode) {
    this.voices++;
    src.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      try {
        node.disconnect();
        src.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  private startRain() {
    const ctx = this.ctx;
    const buf = this.buffers.get("rain");
    if (!ctx || !buf || !this.sfx) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfx);
    src.start();
    this.rainGain = g;
  }

  private bake() {
    const ctx = this.ctx;
    if (!ctx) return;
    const rate = ctx.sampleRate;
    const noise = (dur: number, shape: (t: number, n: number) => number) => {
      const len = Math.max(1, Math.floor(rate * dur));
      const buffer = ctx.createBuffer(1, len, rate);
      const d = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = shape(i / rate, Math.random() * 2 - 1);
      return buffer;
    };
    this.buffers.set(
      "rifle",
      noise(0.16, (t, n) => (n * 0.75 + Math.sin(2 * Math.PI * 110 * t) * 0.7) * Math.exp(-t * 26)),
    );
    this.buffers.set(
      "shotgun",
      noise(0.28, (t, n) => (n * 0.9 + Math.sin(2 * Math.PI * 70 * t) * 0.85) * Math.exp(-t * 12)),
    );
    this.buffers.set(
      "dry",
      noise(0.05, (t, n) => n * Math.exp(-t * 80) * 0.6 + Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 90) * 0.3),
    );
    this.buffers.set(
      "mech",
      noise(0.07, (t, n) => (n * 0.4 + Math.sin(2 * Math.PI * 420 * t) * 0.5) * Math.exp(-t * 40)),
    );
    this.buffers.set(
      "step",
      noise(0.08, (t, n) => n * Math.exp(-t * 46) * 0.8),
    );
    this.buffers.set(
      "flesh",
      noise(0.09, (t, n) => (n * 0.3 + Math.sin(2 * Math.PI * 180 * t) * 0.6) * Math.exp(-t * 30)),
    );
    this.buffers.set(
      "hard",
      noise(0.07, (t, n) => n * Math.exp(-t * 50) * 0.7),
    );
    this.buffers.set(
      "wood",
      noise(0.09, (t, n) => (n * 0.5 + Math.sin(2 * Math.PI * 240 * t) * 0.3) * Math.exp(-t * 28)),
    );
    this.buffers.set(
      "glass",
      noise(0.18, (t, n) => n * (Math.random() > 0.82 ? 1 : 0.15) * Math.exp(-t * 10)),
    );
    this.buffers.set(
      "heart",
      noise(0.22, (t) => {
        const a = Math.exp(-Math.pow((t - 0.02) * 40, 2));
        const b = Math.exp(-Math.pow((t - 0.12) * 36, 2)) * 0.7;
        return Math.sin(2 * Math.PI * 58 * t) * (a + b);
      }),
    );
    this.buffers.set(
      "breath",
      noise(0.45, (t, n) => n * Math.sin(Math.PI * Math.min(1, t / 0.45)) * 0.7),
    );
    this.buffers.set(
      "rain",
      noise(1.2, (_t, n) => n * 0.35),
    );
  }
}
