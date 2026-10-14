/**
 * Tiny synthesized sound engine. Every effect is generated with WebAudio so the
 * game ships without any audio assets.
 */

export type Sfx =
  | 'swing'
  | 'heavySwing'
  | 'hit'
  | 'heavyHit'
  | 'crit'
  | 'dash'
  | 'hurt'
  | 'enemyDie'
  | 'cast'
  | 'pickup'
  | 'boon'
  | 'gold'
  | 'door'
  | 'shoot'
  | 'explode'
  | 'lightning'
  | 'telegraph'
  | 'spawn'
  | 'deny'
  | 'select'
  | 'roar'
  | 'deflect'
  | 'death'
  | 'heal'
  | 'armorBreak'
  | 'bow'
  | 'clear';

export type Mood = 'silent' | 'title' | 'hub' | 'explore' | 'combat' | 'boss';

const SCALE = [0, 3, 5, 7, 10, 12, 15]; // minor pentatonic-ish

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlayed = new Map<Sfx, number>();
  private _volume = 0.7;
  private _music = 0.5;
  private _muted = false;
  private mood: Mood = 'silent';
  private musicNodes: AudioNode[] = [];
  private nextNoteTime = 0;
  private step = 0;
  private schedTimer: number | null = null;
  private root = 45; // A2

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    const m = this.mood;
    this.mood = 'silent';
    this.setMood(m);
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  get volume(): number {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = v;
    this.applyVolumes();
  }
  get musicVolume(): number {
    return this._music;
  }
  set musicVolume(v: number) {
    this._music = v;
    this.applyVolumes();
  }
  get muted(): boolean {
    return this._muted;
  }
  set muted(m: boolean) {
    this._muted = m;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.master || !this.sfxBus || !this.musicBus) return;
    this.master.gain.value = this._muted ? 0 : 1;
    this.sfxBus.gain.value = this._volume * 0.8;
    this.musicBus.gain.value = this._music * 0.35;
  }

  private noise(t: number, dur: number, opts: { freq: number; q?: number; type?: BiquadFilterType; gain: number; sweepTo?: number }): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(
    t: number,
    dur: number,
    opts: { freq: number; to?: number; type?: OscillatorType; gain: number; attack?: number; dest?: AudioNode },
  ): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t + dur);
    const g = c.createGain();
    const a = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(opts.dest ?? this.sfxBus!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: Sfx, intensity = 1): void {
    if (!this.ctx || this._muted) return;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < 0.035) return;
    this.lastPlayed.set(name, now);
    const t = now + 0.005;
    const k = Math.min(1.5, intensity);
    const r = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    switch (name) {
      case 'swing':
        this.noise(t, 0.12, { freq: r(1800, 2600), sweepTo: 700, q: 1.2, gain: 0.25 * k });
        break;
      case 'heavySwing':
        this.noise(t, 0.22, { freq: 1200, sweepTo: 300, q: 1, gain: 0.35 * k });
        this.tone(t, 0.2, { freq: 120, to: 60, type: 'triangle', gain: 0.2 });
        break;
      case 'bow':
        this.tone(t, 0.12, { freq: r(700, 800), to: 300, type: 'triangle', gain: 0.18 });
        this.noise(t, 0.08, { freq: 3000, q: 2, gain: 0.12 });
        break;
      case 'hit':
        this.tone(t, 0.09, { freq: r(180, 230), to: 70, type: 'square', gain: 0.18 * k });
        this.noise(t, 0.06, { freq: 2500, q: 0.8, gain: 0.25 * k });
        break;
      case 'heavyHit':
        this.tone(t, 0.18, { freq: 140, to: 40, type: 'square', gain: 0.25 });
        this.noise(t, 0.15, { freq: 900, q: 0.7, gain: 0.35 });
        break;
      case 'crit':
        this.tone(t, 0.15, { freq: 1600, to: 900, type: 'triangle', gain: 0.18 });
        this.tone(t, 0.12, { freq: 160, to: 50, type: 'square', gain: 0.22 });
        this.noise(t, 0.1, { freq: 4000, q: 1, gain: 0.25 });
        break;
      case 'dash':
        this.noise(t, 0.16, { freq: 600, sweepTo: 2400, q: 0.9, gain: 0.22 });
        break;
      case 'hurt':
        this.tone(t, 0.25, { freq: 220, to: 80, type: 'sawtooth', gain: 0.22 });
        this.noise(t, 0.2, { freq: 500, q: 0.5, gain: 0.3 });
        break;
      case 'enemyDie':
        this.noise(t, 0.3, { freq: 700, sweepTo: 150, q: 0.8, gain: 0.3 });
        this.tone(t, 0.25, { freq: 300, to: 60, type: 'triangle', gain: 0.15 });
        break;
      case 'cast':
        this.tone(t, 0.25, { freq: 400, to: 1400, type: 'triangle', gain: 0.15 });
        this.noise(t, 0.2, { freq: 2000, sweepTo: 5000, q: 2, gain: 0.12 });
        break;
      case 'pickup':
        this.tone(t, 0.12, { freq: 880, type: 'triangle', gain: 0.15 });
        this.tone(t + 0.07, 0.18, { freq: 1320, type: 'triangle', gain: 0.15 });
        break;
      case 'boon': {
        const base = 440;
        [0, 4, 7, 12].forEach((s, i) =>
          this.tone(t + i * 0.06, 0.9, { freq: base * 2 ** (s / 12), type: 'sine', gain: 0.12, attack: 0.02 }),
        );
        this.noise(t, 0.6, { freq: 6000, q: 3, gain: 0.05 });
        break;
      }
      case 'gold':
        this.tone(t, 0.08, { freq: 2100, type: 'square', gain: 0.06 });
        this.tone(t + 0.05, 0.12, { freq: 2800, type: 'square', gain: 0.05 });
        break;
      case 'door':
        this.noise(t, 0.8, { freq: 200, q: 0.6, type: 'lowpass', gain: 0.35 });
        this.tone(t, 0.9, { freq: 80, to: 50, type: 'sawtooth', gain: 0.08 });
        break;
      case 'shoot':
        this.tone(t, 0.12, { freq: r(500, 600), to: 200, type: 'square', gain: 0.06 });
        break;
      case 'explode':
        this.noise(t, 0.6, { freq: 400, sweepTo: 60, type: 'lowpass', q: 0.7, gain: 0.5 });
        this.tone(t, 0.4, { freq: 90, to: 30, type: 'sine', gain: 0.35 });
        break;
      case 'lightning':
        this.noise(t, 0.25, { freq: 5000, q: 0.5, type: 'highpass', gain: 0.25 });
        this.tone(t, 0.2, { freq: 1200, to: 200, type: 'sawtooth', gain: 0.08 });
        break;
      case 'telegraph':
        this.tone(t, 0.25, { freq: 330, to: 520, type: 'triangle', gain: 0.05 });
        break;
      case 'spawn':
        this.tone(t, 0.4, { freq: 120, to: 400, type: 'sine', gain: 0.1 });
        this.noise(t, 0.4, { freq: 800, sweepTo: 3000, q: 4, gain: 0.06 });
        break;
      case 'deny':
        this.tone(t, 0.12, { freq: 180, type: 'square', gain: 0.08 });
        this.tone(t + 0.1, 0.15, { freq: 140, type: 'square', gain: 0.08 });
        break;
      case 'select':
        this.tone(t, 0.06, { freq: 1000, type: 'triangle', gain: 0.08 });
        break;
      case 'roar':
        this.noise(t, 1.2, { freq: 300, sweepTo: 120, q: 1.5, gain: 0.5 });
        this.tone(t, 1.1, { freq: 90, to: 55, type: 'sawtooth', gain: 0.2, attack: 0.1 });
        break;
      case 'deflect':
        this.tone(t, 0.25, { freq: 2400, to: 1800, type: 'triangle', gain: 0.15 });
        break;
      case 'death':
        this.tone(t, 1.6, { freq: 220, to: 40, type: 'sawtooth', gain: 0.25, attack: 0.02 });
        this.noise(t, 1.2, { freq: 400, sweepTo: 80, type: 'lowpass', gain: 0.4 });
        break;
      case 'heal':
        [0, 7, 12].forEach((s, i) =>
          this.tone(t + i * 0.08, 0.4, { freq: 523 * 2 ** (s / 12), type: 'sine', gain: 0.12 }),
        );
        break;
      case 'armorBreak':
        this.noise(t, 0.4, { freq: 3000, sweepTo: 600, q: 1, gain: 0.35 });
        this.tone(t, 0.3, { freq: 600, to: 120, type: 'square', gain: 0.12 });
        break;
      case 'clear':
        [0, 3, 7, 12, 15].forEach((s, i) =>
          this.tone(t + i * 0.09, 0.8, { freq: 293 * 2 ** (s / 12), type: 'triangle', gain: 0.09, attack: 0.01 }),
        );
        break;
    }
  }

  // ---------------------------------------------------------------- music

  setMood(m: Mood): void {
    if (m === this.mood) return;
    this.mood = m;
    if (!this.ctx) return;
    this.stopMusic();
    if (m === 'silent') return;
    this.startDrone();
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.schedTimer = window.setInterval(() => this.schedule(), 50);
  }

  private stopMusic(): void {
    if (this.schedTimer !== null) clearInterval(this.schedTimer);
    this.schedTimer = null;
    const c = this.ctx;
    for (const n of this.musicNodes) {
      try {
        if (n instanceof GainNode && c) {
          n.gain.cancelScheduledValues(c.currentTime);
          n.gain.setTargetAtTime(0, c.currentTime, 0.3);
        }
        if (n instanceof OscillatorNode) n.stop((c?.currentTime ?? 0) + 1.5);
      } catch {
        /* node already stopped */
      }
    }
    this.musicNodes = [];
  }

  private startDrone(): void {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(this.mood === 'title' ? 0.5 : 0.35, c.currentTime, 1.5);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = this.mood === 'boss' ? 700 : 420;
    filt.Q.value = 2;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filt.frequency);
    lfo.start();
    const freqs = [this.root, this.root + 7, this.root + 12].map((n) => 440 * 2 ** ((n - 69) / 12));
    const oscs = freqs.flatMap((f, i) =>
      [-6, 6].map((det) => {
        const o = c.createOscillator();
        o.type = i === 0 ? 'sawtooth' : 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(filt);
        o.start();
        return o;
      }),
    );
    filt.connect(g).connect(this.musicBus!);
    this.musicNodes.push(g, lfo, ...oscs);
  }

  private schedule(): void {
    const c = this.ctx;
    if (!c) return;
    const bpm = this.mood === 'boss' ? 132 : this.mood === 'combat' ? 116 : 84;
    const stepDur = 60 / bpm / 2;
    while (this.nextNoteTime < c.currentTime + 0.2) {
      this.playStep(this.nextNoteTime, this.step, stepDur);
      this.nextNoteTime += stepDur;
      this.step++;
    }
  }

  private playStep(t: number, step: number, stepDur: number): void {
    const c = this.ctx!;
    const bus = this.musicBus!;
    const bar = Math.floor(step / 16) % 4;
    const chordShift = [0, -4, -2, -5][bar];
    const s = step % 16;
    const fighting = this.mood === 'combat' || this.mood === 'boss';
    // Plucked arpeggio
    const pattern = fighting ? [0, 2, 4, 2, 5, 4, 2, 1] : [0, -1, 2, -1, 4, -1, 2, -1];
    const idx = pattern[s % pattern.length];
    if (idx >= 0 && (fighting || Math.random() < 0.75)) {
      const note = this.root + 12 + chordShift + SCALE[idx % SCALE.length];
      const f = 440 * 2 ** ((note - 69) / 12);
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(fighting ? 0.22 : 0.16, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 3);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + stepDur * 3 + 0.05);
    }
    if (fighting) {
      // Kick on quarters, snare-ish noise on backbeats.
      if (s % 4 === 0) {
        const o = c.createOscillator();
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        const g = c.createGain();
        g.gain.setValueAtTime(0.6, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(t + 0.25);
      }
      if (s % 8 === 4 || (this.mood === 'boss' && s % 8 === 7)) {
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = c.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 1500;
        const g = c.createGain();
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        src.connect(f).connect(g).connect(bus);
        src.start(t, Math.random() * 0.5, 0.15);
      }
      // Bass on the downbeat of each half-bar.
      if (s % 8 === 0) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 440 * 2 ** ((this.root - 12 + chordShift - 69) / 12);
        const filt = c.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 300;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 7);
        o.connect(filt).connect(g).connect(bus);
        o.start(t);
        o.stop(t + stepDur * 7 + 0.05);
      }
    }
  }
}

export const audio = new AudioEngine();
