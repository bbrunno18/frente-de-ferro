import { sfx } from './Sfx';

/** Trilha procedural (sem arquivos): pad + baixo + arpejo. Dois climas: calmo (menu) e batalha. */
type Mood = 'menu' | 'battle';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// progressões em graus (Am – F – C – G / Am – Am – F – E)
const PROG: Record<Mood, number[][]> = {
  menu: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
  battle: [[45, 52, 57], [45, 52, 57], [41, 48, 53], [40, 47, 52]],
};

class MusicEngine {
  volume = 0.5;
  /** 0..1: sobe com o combate; liga bateria e arpejos */
  intensity = 0;
  setIntensity(v: number) { this.intensity = this.intensity + (Math.max(0, Math.min(1, v)) - this.intensity) * 0.08; }
  private mood: Mood | null = null;
  private gain: GainNode | null = null;
  private timer = 0;
  private next = 0;
  private step = 0;

  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(this.volume * 0.55, this.ctx.currentTime, 0.1); }
  private get ctx() { return sfx.bus?.ctx ?? null; }

  play(mood: Mood) {
    const bus = sfx.bus;
    if (!bus) return;
    if (this.mood === mood && this.timer) return;
    this.stop();
    this.mood = mood;
    this.gain = bus.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(bus.out);
    this.gain.gain.setTargetAtTime(this.volume * 0.55, bus.ctx.currentTime, 0.8);
    this.next = bus.ctx.currentTime + 0.1; this.step = 0;
    this.timer = window.setInterval(() => this.pump(), 120);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    const g = this.gain, c = this.ctx;
    if (g && c) { g.gain.setTargetAtTime(0, c.currentTime, 0.25); setTimeout(() => g.disconnect(), 1500); }
    this.gain = null; this.mood = null;
  }

  private pump() {
    const c = this.ctx;
    if (!c || !this.mood) return;
    const bpm = this.mood === 'battle' ? 118 : 84, sp = 60 / bpm / 2; // colcheia
    while (this.next < c.currentTime + 0.4) { this.note(this.step, this.next, sp); this.next += sp; this.step++; }
  }

  private osc(t: number, f: number, dur: number, type: OscillatorType, vol: number, cut = 2400) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
    o.type = type; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.value = cut;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.gain!);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, vol: number, hp: number) {
    const c = this.ctx!, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.gain!); s.start(t);
  }

  private note(i: number, t: number, sp: number) {
    const mood = this.mood!, bar = Math.floor(i / 8) % 4, pos = i % 8, chord = PROG[mood][bar];
    const battle = mood === 'battle';
    if (pos === 0) chord.forEach(n => this.osc(t, NOTE(n + 12), sp * 8, 'sawtooth', battle ? 0.05 : 0.04, 900));
    if (battle) {
      const I = this.intensity;
      this.osc(t, NOTE(chord[0] - 12), sp * 0.9, 'square', 0.07 + I * 0.05, 500); // baixo pulsante
      if (pos % 4 === 0 && (I > 0.12 || pos === 0)) this.noise(t, 0.12, 0.12 + I * 0.1, 120); // bumbo
      if (pos % 4 === 2 && I > 0.3) this.noise(t, 0.08, 0.06 + I * 0.06, 5000); // caixa
      if (I > 0.55 && pos % 1 === 0) this.noise(t, 0.03, 0.04, 8000); // chimbal
      if (pos % 2 === 1 && I > 0.2) this.osc(t, NOTE(chord[(pos >> 1) % 3] + 24), sp, 'triangle', 0.03 + I * 0.04, 3000);
      if (I > 0.75 && pos % 2 === 0) this.osc(t, NOTE(chord[(pos >> 1) % 3] + 36), sp * 0.6, 'sawtooth', 0.025, 4200);
    } else {
      if (pos % 4 === 0) this.osc(t, NOTE(chord[0] - 12), sp * 3.5, 'sine', 0.12, 400);
      if (pos % 2 === 0) this.osc(t, NOTE(chord[(pos >> 1) % 3] + 12), sp * 1.8, 'triangle', 0.06, 2600);
    }
  }
}

export const music = new MusicEngine();
