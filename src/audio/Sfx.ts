// Sintetizador de efeitos sonoros via Web Audio API — sem arquivos externos.
type Wave = OscillatorType;

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.7;
  muted = false;
  private last: Record<string, number> = {};

  /** Deve ser chamado dentro de um gesto do usuário (toque/clique). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.apply();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Contexto e saída mestre (usados pela trilha musical). */
  private amb: { stop: () => void } | null = null;
  /** Som ambiente: vento (ruído filtrado com ondulação lenta) e zumbido grave de cristais. */
  ambience(on: boolean, desert = false) {
    this.amb?.stop(); this.amb = null;
    const b = this.bus; if (!on || !b) return;
    const { ctx, out } = b;
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let l = 0; for (let i = 0; i < len; i++) { l = l * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = l * 6; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = desert ? 520 : 380; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.0;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.11; lg.gain.value = desert ? 0.07 : 0.045; lfo.connect(lg); lg.connect(g.gain);
    const base = ctx.createConstantSource(); base.offset.value = desert ? 0.09 : 0.06; base.connect(g.gain);
    src.connect(bp); bp.connect(g); g.connect(out);
    const hum = ctx.createOscillator(), hg = ctx.createGain(); hum.type = 'sine'; hum.frequency.value = 58; hg.gain.value = 0.012; hum.connect(hg); hg.connect(out);
    src.start(); lfo.start(); base.start(); hum.start();
    this.amb = { stop: () => { try { g.gain.cancelScheduledValues(0); src.stop(); lfo.stop(); base.stop(); hum.stop(); } catch { /* já parado */ } } };
  }
  /** app em segundo plano: silencia tudo sem perder o estado */
  suspend() { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume(); }
  get bus(): { ctx: AudioContext; out: GainNode } | null { return this.ctx && this.master ? { ctx: this.ctx, out: this.master } : null; }

  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); this.apply(); }
  setMuted(m: boolean) { this.muted = m; this.apply(); }
  private apply() { if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.5; }

  private ok(key: string, gap: number): boolean {
    const now = performance.now();
    if (now - (this.last[key] ?? 0) < gap) return false;
    this.last[key] = now;
    return !!this.ctx && !!this.master && !this.muted && this.volume > 0;
  }

  private tone(freq: number, dur: number, type: Wave, vol: number, slideTo?: number, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, from: number, to: number, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master!);
    s.start(t);
  }

  shoot(kind: 'bullet' | 'rocket' | 'shell' | 'laser' | 'flame') {
    if (kind === 'flame') kind = 'rocket';
    if (!this.ok('shoot' + kind, 70)) return;
    switch (kind) {
      case 'bullet': this.noise(0.07, 0.35, 5000, 800); this.tone(520, 0.05, 'square', 0.06, 200); break;
      case 'rocket': this.noise(0.28, 0.35, 2500, 300); this.tone(200, 0.25, 'sawtooth', 0.08, 90); break;
      case 'shell': this.noise(0.18, 0.55, 1800, 120); this.tone(110, 0.2, 'square', 0.18, 50); break;
      case 'laser': this.tone(1400, 0.16, 'sawtooth', 0.09, 300); break;
    }
  }
  boom(size: number) {
    if (!this.ok('boom', 45)) return;
    const d = 0.3 + size * 0.3;
    this.noise(d, Math.min(0.95, 0.4 + size * 0.2), 2200, 60);
    this.tone(95, d, 'sine', 0.34, 28);
    if (size >= 1) { this.tone(52, d * 1.3, 'sine', 0.4, 24); this.noise(0.22, 0.3, 6000, 900, 0.05); }
    if (size >= 2) { this.noise(1.1, 0.35, 700, 50, 0.12); this.tone(40, 1.0, 'sawtooth', 0.12, 25, 0.1); }
  }
  /** estalo metálico curto de impacto */
  hit() { if (this.ok('hit', 55)) { this.noise(0.05, 0.22, 7000, 1500); this.tone(1900, 0.03, 'square', 0.05, 900); } }
  /** sequência de abates: sobe de tom conforme o número */
  streak(n: number) {
    if (!this.ok('streak', 300)) return;
    const base = 330 + Math.min(n, 8) * 45;
    this.tone(base, 0.12, 'square', 0.2); this.tone(base * 1.25, 0.12, 'square', 0.2, undefined, 0.1);
    this.tone(base * 1.5, 0.25, 'sawtooth', 0.22, base * 1.8, 0.2); this.noise(0.4, 0.3, 3000, 200, 0.2);
  }
  objective() { if (this.ok('obj', 400)) { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.22, undefined, i * 0.07)); this.tone(130, 0.5, 'sawtooth', 0.12, 65, 0); } }
  /** batida de abertura de missão */
  slam() { if (this.ok('slam', 800)) { this.noise(0.5, 0.5, 1800, 60); this.tone(70, 0.7, 'sine', 0.5, 22); this.tone(196, 0.5, 'sawtooth', 0.12, 98, 0.1); } }
  select() { if (this.ok('select', 40)) this.tone(660, 0.07, 'triangle', 0.18, 880); }
  order() { if (this.ok('order', 40)) { this.tone(440, 0.06, 'square', 0.1); this.tone(587, 0.07, 'square', 0.1, undefined, 0.06); } }
  click() { if (this.ok('click', 30)) this.tone(300, 0.05, 'square', 0.12, 500); }
  error() { if (this.ok('error', 200)) this.tone(160, 0.18, 'sawtooth', 0.15, 110); }
  ready() { if (this.ok('ready', 300)) { this.tone(523, 0.1, 'triangle', 0.2); this.tone(659, 0.1, 'triangle', 0.2, undefined, 0.1); this.tone(784, 0.18, 'triangle', 0.2, undefined, 0.2); } }
  alert() {
    if (!this.ok('alert', 5000)) return;
    for (let i = 0; i < 3; i++) { this.tone(880, 0.14, 'square', 0.16, undefined, i * 0.3); this.tone(660, 0.14, 'square', 0.16, undefined, i * 0.3 + 0.15); }
  }
  lowPower() { if (this.ok('low', 5000)) { this.tone(440, 0.25, 'sawtooth', 0.15, 220); this.tone(330, 0.35, 'sawtooth', 0.15, 110, 0.28); } }
  wave() { if (this.ok('wave', 3000)) { this.tone(196, 0.5, 'sawtooth', 0.2, 147); this.tone(147, 0.7, 'sawtooth', 0.2, 98, 0.5); } }
  rank() { if (this.ok('rank', 400)) { this.tone(784, 0.1, 'triangle', 0.22); this.tone(988, 0.1, 'triangle', 0.22, undefined, 0.09); this.tone(1319, 0.22, 'triangle', 0.22, undefined, 0.18); } }
  upgrade() { if (this.ok('upg', 300)) { this.tone(392, 0.08, 'square', 0.14, 523); this.tone(659, 0.16, 'triangle', 0.2, 880, 0.08); } }
  /** bip de rádio antes do locutor: dois tons curtos e um chiado */
  radio() {
    const b = this.bus; if (!b || this.muted) return;
    const { ctx, out } = b, t = ctx.currentTime;
    for (const [f, d] of [[1400, 0], [1900, 0.06]] as const) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.05, t + d); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05); o.connect(g); g.connect(out); o.start(t + d); o.stop(t + d + 0.06); }
    const n = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate), dd = n.getChannelData(0); for (let i = 0; i < dd.length; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / dd.length);
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = n; bp.type = 'bandpass'; bp.frequency.value = 2200; g.gain.value = 0.05; src.connect(bp); bp.connect(g); g.connect(out); src.start(t + 0.1);
  }
  win() { if (this.ctx && !this.muted) [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.25, undefined, i * 0.18)); }
  lose() { if (this.ctx && !this.muted) [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.2, undefined, i * 0.25)); }
}

export const sfx = new SfxEngine();
