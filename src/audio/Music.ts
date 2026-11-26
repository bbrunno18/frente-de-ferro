import { sfx } from './Sfx';

/**
 * Trilha procedural "orquestral" (sem arquivos de áudio), em Ré menor.
 * Batalha (104 bpm): tambores taiko, caixa marcial, cordas graves em ostinato, metais, coro e uma melodia heróica
 * de 8 compassos. As camadas entram conforme a INTENSIDADE do combate (0 → 1).
 * Menu (76 bpm): cordas, corne e melodia lenta, com tambor esparso.
 */
type Mood = 'menu' | 'battle';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// Progressões de 8 compassos: Dm | Bb | F | C | Dm | Gm | Bb | A
const ROOT = [38, 34, 41, 36, 38, 43, 34, 33];
const TRIAD = [[57, 62, 65], [58, 62, 65], [57, 60, 65], [55, 60, 64], [57, 62, 65], [58, 62, 67], [58, 62, 65], [57, 61, 64]];
// Melodia: [passo (semicolcheias), nota MIDI, duração em passos]
const MEL: Array<[number, number, number]> = [
  [0, 74, 6], [6, 72, 2], [8, 74, 4], [12, 77, 4],
  [16, 77, 6], [22, 74, 2], [24, 70, 4], [28, 74, 4],
  [32, 72, 6], [38, 69, 2], [40, 72, 4], [44, 77, 4],
  [48, 76, 8], [56, 74, 4], [60, 72, 4],
  [64, 74, 6], [70, 77, 2], [72, 81, 4], [76, 79, 4],
  [80, 77, 6], [86, 74, 2], [88, 70, 4], [92, 74, 4],
  [96, 77, 4], [100, 79, 4], [104, 81, 4], [108, 82, 4],
  [112, 81, 8], [120, 76, 4], [124, 73, 4],
];

interface Layer { inp: GainNode }

class MusicEngine {
  volume = 0.5;
  /** 0..1: sobe com o combate */
  intensity = 0;
  setIntensity(v: number) { this.intensity = this.intensity + (Math.max(0, Math.min(1, v)) - this.intensity) * 0.08; }
  private mood: Mood | null = null;
  private gain: GainNode | null = null;
  private timer = 0;
  private next = 0;
  private step = 0;
  private L: Record<'strings' | 'brass' | 'lead' | 'bass' | 'choir' | 'perc', Layer> | null = null;
  private noise: AudioBuffer | null = null;

  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(this.volume * 1.0, this.ctx.currentTime, 0.1); }
  private get ctx() { return sfx.bus?.ctx ?? null; }

  /** Camadas persistentes (um filtro por instrumento) para gastar poucos nós de áudio por nota. */
  private build() {
    const bus = sfx.bus!, c = bus.ctx, out = this.gain!;
    const layer = (cut: number, vol: number, send: number, q = 0.7): Layer => {
      const inp = c.createGain(), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = q; g.gain.value = vol;
      inp.connect(f); f.connect(g); g.connect(out);
      if (send > 0) { const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(bus.rev); }
      return { inp };
    };
    const choir = c.createGain(), g2 = c.createGain(); g2.gain.value = 0.9;
    for (const [fr, qq, gg] of [[800, 5, 1], [1150, 6, 0.6], [2800, 8, 0.25]] as const) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = qq; const g = c.createGain(); g.gain.value = gg; choir.connect(bp); bp.connect(g); g.connect(g2); }
    g2.connect(out); const cs = c.createGain(); cs.gain.value = 0.75; g2.connect(cs); cs.connect(bus.rev);
    this.L = { strings: layer(1900, 0.9, 0.35), brass: layer(2300, 0.9, 0.4, 1.1), lead: layer(2800, 0.9, 0.35), bass: layer(520, 1, 0.08), choir: { inp: choir }, perc: layer(9000, 1, 0.3) };
    if (!this.noise) { const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = nb; }
  }

  play(mood: Mood) {
    const bus = sfx.bus;
    if (!bus) return;
    if (this.mood === mood && this.timer) return;
    this.stop();
    this.mood = mood;
    this.gain = bus.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(bus.out);
    this.gain.gain.setTargetAtTime(this.volume * 1.0, bus.ctx.currentTime, 0.9);
    this.build();
    this.next = bus.ctx.currentTime + 0.1; this.step = 0;
    this.timer = window.setInterval(() => this.pump(), 120);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    const g = this.gain, c = this.ctx;
    if (g && c) { g.gain.setTargetAtTime(0, c.currentTime, 0.3); setTimeout(() => g.disconnect(), 1800); }
    this.gain = null; this.mood = null; this.L = null;
  }

  private get sp() { return 60 / (this.mood === 'battle' ? 104 : 76) / 4; } // duração de uma semicolcheia
  private pump() { this.prime((this.ctx?.currentTime ?? 0) + 0.45); }
  /** agenda notas até o instante `until` (usado também nos testes de renderização offline) */
  prime(until: number) { if (!this.mood || !this.L) return; while (this.next < until) { this.note(this.step, this.next, this.sp); this.next += this.sp; this.step++; } }

  // ---------- instrumentos ----------
  private voice(l: Layer, t: number, f: number, dur: number, type: OscillatorType, vol: number, atk: number, detune = 7, vib = 0) {
    const c = this.ctx!, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.setValueAtTime(vol, t + Math.max(atk, dur - 0.12)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    g.connect(l.inp);
    for (const dt of detune ? [-detune, detune] : [0]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = dt;
      if (vib) { const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.2; lg.gain.value = vib; lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.15); }
      o.connect(g); o.start(t); o.stop(t + dur + 0.15);
    }
  }
  private kick(t: number, vol: number, f = 100) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.22);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g); g.connect(this.L!.perc.inp); o.start(t); o.stop(t + 0.6);
    this.hiss(t, 0.05, vol * 0.5, 250, 1400);
  }
  private hiss(t: number, dur: number, vol: number, hp: number, lp: number) {
    const c = this.ctx!, s = c.createBufferSource(); s.buffer = this.noise;
    const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(h); h.connect(l); l.connect(g); g.connect(this.L!.perc.inp); s.start(t, Math.random() * 1.5, dur + 0.05);
  }
  private snare(t: number, vol: number) { this.hiss(t, 0.16, vol, 1500, 7500); this.hiss(t, 0.05, vol * 0.6, 4000, 9000); }
  private crash(t: number) { this.hiss(t, 2.4, 0.22, 4500, 12000); }

  private note(i: number, t: number, sp: number) {
    const mood = this.mood!, L = this.L!, I = this.intensity;
    const bar = Math.floor(i / 16) % 8, pos = i % 16, root = ROOT[bar], tri = TRIAD[bar], barDur = sp * 16;
    if (mood === 'menu') {
      if (pos === 0) { tri.forEach(n => this.voice(L.strings, t, NOTE(n), barDur, 'sawtooth', 0.045, 0.7, 8)); this.voice(L.bass, t, NOTE(root), barDur, 'sine', 0.2, 0.3, 0); }
      if (pos === 0 && bar % 2 === 0) this.kick(t, 0.3, 80);
      if (pos === 0 && bar === 0 && i % 128 === 0) this.crash(t);
      if (pos % 4 === 0 && i % 128 >= 64) this.voice(L.lead, t, NOTE(tri[(pos >> 2) % 3] + 12), sp * 3.6, 'sine', 0.06, 0.01, 0); // arpejo suave
      for (const [s, n, len] of MEL) if (s === i % 128 && i % 256 < 128) this.voice(L.brass, t, NOTE(n - 12), len * sp, 'sawtooth', 0.045, 0.12, 5, 14);
      return;
    }
    // ----- batalha -----
    // cordas sustentadas + baixo grave
    if (pos === 0) {
      tri.forEach(n => this.voice(L.strings, t, NOTE(n), barDur, 'sawtooth', 0.04 + I * 0.025, 0.25, 8));
      this.voice(L.bass, t, NOTE(root), barDur, 'sawtooth', 0.06, 0.05, 6);
    }
    // ostinato de cordas graves (colcheias; semicolcheias galopando na intensidade alta)
    const gallop = I > 0.7 && (pos % 4 === 3 || pos % 4 === 0), eighth = pos % 2 === 0;
    if (I > 0.08 && (eighth || gallop)) this.voice(L.bass, t, NOTE(root + (pos === 8 && bar % 2 ? 7 : 0)), sp * (eighth ? 1.7 : 0.9), 'sawtooth', 0.045 + I * 0.05, 0.008, 4);
    // tambores
    if (pos === 0) this.kick(t, 0.55 + I * 0.25, 92);
    if (pos === 8) this.kick(t, 0.45 + I * 0.25, 88);
    if (I > 0.35 && (pos === 6 || pos === 14)) this.kick(t, 0.3 + I * 0.2, 84);
    if (I > 0.7 && (pos === 3 || pos === 11)) this.kick(t, 0.28, 80);
    if (I > 0.28 && (pos === 4 || pos === 12)) this.snare(t, 0.09 + I * 0.1);
    if (I > 0.55 && pos % 2 === 1) this.hiss(t, 0.03, 0.04 + I * 0.03, 7000, 12000);
    if ((bar === 3 || bar === 7) && pos >= 12 && I > 0.45) this.snare(t, 0.08 + (pos - 12) * 0.03); // rufo de caixa
    if (pos === 0 && bar === 0) this.crash(t);
    // metais: acorde longo + estocadas
    if (I > 0.2 && pos === 0) tri.forEach(n => this.voice(L.brass, t, NOTE(n), barDur * 0.9, 'sawtooth', 0.03 + I * 0.04, 0.09, 6));
    if (I > 0.55 && (pos === 6 || pos === 10)) tri.forEach(n => this.voice(L.brass, t, NOTE(n + 12), sp * 1.6, 'sawtooth', 0.035, 0.02, 6));
    // melodia heróica
    if (I > 0.12) for (const [s, n, len] of MEL) {
      if (s !== i % 128) continue;
      const lead = I > 0.5 ? 0.06 + I * 0.03 : 0.04;
      this.voice(L.lead, t, NOTE(n), len * sp, 'sawtooth', lead, 0.05, 6, 12);
      if (I > 0.45) this.voice(L.brass, t, NOTE(n - 12), len * sp, 'sawtooth', 0.045 + I * 0.03, 0.07, 6, 8);
    }
    // coro ("ahh") em cima dos acordes quando a batalha esquenta
    if (I > 0.62 && pos === 0) { this.voice(L.choir, t, NOTE(tri[0] + 12), barDur, 'sawtooth', 0.05 + (I - 0.62) * 0.1, 0.5, 9, 18); this.voice(L.choir, t, NOTE(tri[2] + 12), barDur, 'sawtooth', 0.04, 0.5, 9, 18); }
  }
}

export const music = new MusicEngine();
