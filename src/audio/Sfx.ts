// Motor de efeitos sonoros — Web Audio API, sem arquivos externos.
// Os sons de guerra (explosões, tiros, motores) são sintetizados UMA vez em buffers estéreo/mono (camadas de
// "estrondo" grave + corpo de ruído filtrado + estalo + destroços) e tocados com variação de tom, panorama e
// distância. Tudo passa por reverberação (eco de campo aberto) e um compressor para ter peso sem estourar.
type Wave = OscillatorType;
export interface Spatial { pan?: number; gain?: number }
export interface AudioBus { ctx: AudioContext; out: GainNode; rev: GainNode }

/** MIXAGEM — ajuste aqui o volume relativo de cada categoria (1 = normal). O volume geral fica no menu (sfx.setVolume). */
export const MIX = { war: 1, ui: 1, alarm: 1, engine: 1, fanfare: 1 };

const TAU = Math.PI * 2;
const rnd = Math.random;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Cria um buffer, preenche e normaliza o pico. */
function mkBuf(ctx: BaseAudioContext, ch: number, dur: number, fill: (d: Float32Array[], n: number, sr: number) => void, peak = 0.9, extra = 0): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * dur), tot = n + extra;
  const raw: Float32Array[] = []; for (let c = 0; c < ch; c++) raw.push(new Float32Array(tot));
  fill(raw, tot, sr);
  const b = ctx.createBuffer(ch, n, sr);
  let m = 0;
  for (let c = 0; c < ch; c++) {
    const d = b.getChannelData(c), r = raw[c];
    for (let i = 0; i < n; i++) d[i] = r[i];
    if (extra) for (let j = 0; j < extra; j++) { const a = j / extra; d[j] = r[j] * a + r[n + j] * (1 - a); } // costura do loop
    for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > m) m = v; }
  }
  if (m > 0) { const k = peak / m; for (let c = 0; c < ch; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= k; } }
  return b;
}

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private revIn: GainNode | null = null;
  volume = 0.7;
  muted = false;
  private last: Record<string, number> = {};
  private bufs: Record<string, AudioBuffer[]> = {};
  private noiseBuf: AudioBuffer | null = null;
  private active = 0;
  private loops: Record<'tank' | 'heli' | 'jet' | 'war', { src: AudioBufferSourceNode; g: GainNode } | undefined> = { tank: undefined, heli: undefined, jet: undefined, war: undefined };
  private mixT = 0;
  private ext: Record<string, AudioBuffer[]> = {};
  private pending: Record<string, string | string[]> | null = null;

  /** Deve ser chamado dentro de um gesto do usuário (toque/clique). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.setup(this.ctx);
      this.apply();
      if (this.pending) { const m = this.pending; this.pending = null; void this.loadFiles(m); }
      if (this.pending) { const m = this.pending; this.pending = null; void this.loadFiles(m); }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  /** Monta a cadeia: tudo → master → compressor → saída, com um envio para a reverberação. */
  private setup(ctx: AudioContext) {
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    // reverberação: resposta ao impulso sintética (cauda escura de ~2,2 s)
    const conv = ctx.createConvolver();
    const n = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n; lp += ((rnd() * 2 - 1) - lp) * (0.55 - 0.45 * t); d[i] = lp * Math.pow(1 - t, 3.2) * 1.6; } }
    conv.buffer = ir;
    const revIn = ctx.createGain(); revIn.gain.value = 1;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    revIn.connect(conv); conv.connect(wet); wet.connect(master);
    this.master = master; this.revIn = revIn;
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;
    this.noiseBuf = nb;
    // síntese pesada fora do gesto de toque, em fatias, para não travar o celular
    const jobs: Array<() => void> = [
      () => this.genBooms(ctx), () => this.genShots(ctx), () => this.genLoops(ctx),
    ];
    const run = () => { const j = jobs.shift(); if (j) { j(); setTimeout(run, 30); } };
    setTimeout(run, 30);
  }

  /** Para testes: executa a geração de buffers de forma síncrona. */
  prepareNow() { if (!this.ctx) return; this.genBooms(this.ctx); this.genShots(this.ctx); this.genLoops(this.ctx); }

  // ---------- síntese dos buffers ----------
  private genBooms(ctx: BaseAudioContext) {
    const f0 = [110, 92, 78, 62], kd = [5, 3.6, 2.6, 1.9], nd = [4, 3, 2.2, 1.6], cs = [9, 7, 5, 4], dur = [0.9, 1.5, 2.2, 3.0];
    for (let s = 0; s < 4; s++) {
      this.bufs['boom' + s] = [0, 1, 2].map(() => mkBuf(ctx, 2, dur[s], (d, n, sr) => {
        const sc = 44100 / sr;
        for (let c = 0; c < 2; c++) {
          let lp = 0, lp2 = 0, ph = 0, deb = 0;
          for (let i = 0; i < n; i++) {
            const t = i / sr, w = rnd() * 2 - 1;
            ph += (28 + (f0[s] - 28) * Math.exp(-t * 7)) / sr;
            const thump = Math.sin(TAU * ph) * Math.exp(-t * kd[s]);
            const cf = 0.02 + 0.5 * Math.exp(-t * cs[s]); lp += (w - lp) * cf; lp2 += (lp - lp2) * Math.min(1, cf * 1.5);
            const body = lp2 * Math.exp(-t * nd[s]) * 3.2;
            const crack = t < 0.03 ? w * (1 - t / 0.03) : 0;
            if (t > 0.08 && rnd() < 0.0012 * sc * Math.exp(-t * 1.2)) deb += (rnd() * 2 - 1) * 0.8;
            deb *= 0.6;
            const rumble = s >= 2 ? Math.sin(TAU * 34 * t) * Math.exp(-t * 1.1) * 0.5 : 0;
            d[c][i] = Math.tanh((thump + body * 0.9 + crack * 0.7 + deb * 0.5 + rumble) * 1.3);
          }
        }
      }));
    }
  }

  private genShots(ctx: BaseAudioContext) {
    // fuzil / metralhadora: estalo seco + eco curto
    this.bufs.bullet = [0, 1, 2, 3].map(() => mkBuf(ctx, 1, 0.28, (d, n, sr) => {
      let lp = 0, lp2 = 0, ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1; lp += (w - lp) * 0.4; lp2 += (w - lp2) * 0.1; ph += 170 / sr;
        d[0][i] = (w - lp) * Math.exp(-t * 110) + lp2 * Math.exp(-t * 16) * 0.55 + Math.sin(TAU * ph) * Math.exp(-t * 45) * 0.45;
      }
    }, 0.8));
    // canhão de tanque: pancada grave + estalo + metal ressoando + eco
    this.bufs.shell = [0, 1, 2].map(() => mkBuf(ctx, 1, 1.2, (d, n, sr) => {
      let ph = 0, lp = 0, lp2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1; ph += (40 + 110 * Math.exp(-t * 18)) / sr;
        lp += (w - lp) * 0.5; lp2 += (w - lp2) * (0.05 + 0.3 * Math.exp(-t * 8));
        d[0][i] = Math.tanh((Math.sin(TAU * ph) * Math.exp(-t * 7) + lp * Math.exp(-t * 38) * 0.9 + lp2 * Math.exp(-t * 3.2) * 1.4 + Math.sin(TAU * 640 * t) * Math.exp(-t * 16) * 0.06) * 1.2);
      }
    }, 0.9));
    // foguete: ignição + rugido que sobe e some
    this.bufs.rocket = [0, 1].map(() => mkBuf(ctx, 1, 1.4, (d, n, sr) => {
      let lp = 0, hp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1, c = 0.05 + 0.35 * (1 - Math.exp(-t * 2.5));
        lp += (w - lp) * c; hp += (w - hp) * 0.3;
        const env = (t < 0.04 ? t / 0.04 : Math.exp(-(t - 0.04) * 2.4));
        d[0][i] = lp * env * 1.6 + (w - hp) * env * 0.25 + w * Math.exp(-t * 60) * 0.7 + Math.sin(TAU * 90 * t) * env * 0.3;
      }
    }, 0.85));
    // laser: varredura descendente com harmônico
    this.bufs.laser = [0, 1].map(k => mkBuf(ctx, 1, 0.4, (d, n, sr) => {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr; ph += ((k ? 2600 : 2200) * Math.exp(-t * 5.5) + 300) / sr;
        const env = Math.exp(-t * 8) * (t < 0.004 ? t / 0.004 : 1);
        d[0][i] = (Math.sin(TAU * ph) * 0.6 + Math.sin(2 * TAU * ph) * 0.2) * env + (rnd() * 2 - 1) * Math.exp(-t * 30) * 0.2;
      }
    }, 0.7));
    // lança-chamas: rugido crepitante
    this.bufs.flame = [0, 1].map(() => mkBuf(ctx, 1, 0.6, (d, n, sr) => {
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1; lp += (w - lp) * 0.22;
        d[0][i] = lp * (0.55 + 0.45 * rnd()) * Math.min(1, t / 0.06) * Math.exp(-t * 3.5) * 2 + Math.sin(TAU * 70 * t) * Math.exp(-t * 4) * 0.25;
      }
    }, 0.8));
    // impacto metálico
    this.bufs.hit = [0, 1, 2].map(() => mkBuf(ctx, 1, 0.24, (d, n, sr) => {
      const f = 1200 + rnd() * 600, dk = 30 + rnd() * 30;
      for (let i = 0; i < n; i++) {
        const t = i / sr, e = Math.exp(-t * dk);
        d[0][i] = (Math.sin(TAU * f * t) + Math.sin(TAU * f * 1.59 * t) * 0.6 + Math.sin(TAU * f * 2.14 * t) * 0.4) * e * 0.4 + (rnd() * 2 - 1) * Math.exp(-t * 140) * 0.6;
      }
    }, 0.6));
    // grito curto de soldado (ruído formantado): morte de infantaria
    this.bufs.die = [0, 1, 2].map(() => mkBuf(ctx, 1, 0.5, (d, n, sr) => {
      let ph = 0, b1 = 0, b2 = 0; const f = 220 + rnd() * 120;
      for (let i = 0; i < n; i++) {
        const t = i / sr; ph += (f * (1 - t * 0.5)) / sr;
        const src = ((ph % 1) * 2 - 1) * 0.6 + (rnd() * 2 - 1) * 0.15;
        b1 += (src - b1) * 0.12; b2 += (b1 - b2) * 0.12;
        d[0][i] = (b1 - b2) * 5 * Math.min(1, t / 0.03) * Math.exp(-t * 5);
      }
    }, 0.5));
  }

  private genLoops(ctx: BaseAudioContext) {
    // tanque: motor diesel grave (harmônicos de 26 Hz com batida) + lagartas batendo
    this.bufs.tank = [mkBuf(ctx, 1, 2, (d, n, sr) => {
      const ph = Array.from({ length: 13 }, () => rnd() * TAU); let lp = 0, cl = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr; let s = 0;
        for (let k = 1; k <= 12; k++) s += Math.sin(TAU * k * 26 * t + ph[k]) / Math.pow(k, 0.85);
        s *= 0.75 + 0.25 * Math.sin(TAU * 13 * t);
        const w = rnd() * 2 - 1; lp += (w - lp) * 0.08;
        const p = (t * 9) % 1; cl += ((rnd() * 2 - 1) * Math.exp(-p * 60) - cl) * 0.4;
        d[0][i] = s * 0.5 + lp * 0.9 + cl * 0.5;
      }
    }, 0.8, 1500)];
    // helicóptero: pás batendo a 16 Hz + turbina
    this.bufs.heli = [mkBuf(ctx, 1, 1, (d, n, sr) => {
      let lp = 0, bed = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, p = (t * 16) % 1, w = rnd() * 2 - 1;
        lp += (w - lp) * 0.15; bed += (w - bed) * 0.05;
        d[0][i] = lp * Math.exp(-p * 14) * 1.4 + Math.sin(TAU * 75 * t) * Math.exp(-p * 10) * 0.5 + Math.sin(TAU * 2400 * t) * 0.025 + bed * 0.5;
      }
    }, 0.8, 1200)];
    // jato: sopro de turbina
    this.bufs.jet = [mkBuf(ctx, 1, 1, (d, n, sr) => {
      let lp = 0, hp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1; lp += (w - lp) * 0.2; hp += (w - hp) * 0.6;
        d[0][i] = lp * 0.9 + (w - hp) * 0.25 + Math.sin(TAU * 520 * t) * 0.05 + Math.sin(TAU * 1040 * t) * 0.025;
      }
    }, 0.7, 1200)];
    // frente de batalha distante: estrondos e rajadas ao longe
    this.bufs.war = [mkBuf(ctx, 1, 6, (d, n, sr) => {
      let lp = 0; const hits: number[] = Array.from({ length: 11 }, () => rnd() * (n / sr - 1));
      let tail = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1; lp += (w - lp) * 0.02;
        let thud = 0; for (const h of hits) { const dt = t - h; if (dt > 0 && dt < 1.2) thud += Math.sin(TAU * (48 - dt * 14) * dt) * Math.exp(-dt * 4.5) * 0.9; }
        if (rnd() < 0.0004) tail += (rnd() * 2 - 1) * 0.8; tail *= 0.7;
        d[0][i] = lp * 2.4 + thud + tail * 0.35;
      }
    }, 0.7, 4000)];
    // inicia os laços silenciosos
    const out = this.master!;
    for (const k of ['tank', 'heli', 'jet', 'war'] as const) {
      const src = ctx.createBufferSource(); src.buffer = this.ext[k]?.[0] ?? this.bufs[k][0]; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(out); if (k !== 'war') { const s = ctx.createGain(); s.gain.value = 0.12; g.connect(s); s.connect(this.revIn!); }
      src.start(); this.loops[k] = { src, g };
    }
  }

  // ---------- reprodução ----------
  private ok(key: string, gap: number): boolean {
    const now = performance.now();
    if (now - (this.last[key] ?? 0) < gap) return false;
    this.last[key] = now;
    return !!this.ctx && !!this.master && !this.muted && this.volume > 0;
  }

  /** Toca um buffer com variação de tom, volume, panorama e quantidade de eco. */
  private play(b: AudioBuffer | undefined, vol: number, o: Spatial = {}, rate = 1, wet = 0.2) {
    if (!b || !this.ctx || !this.master || this.active > 26) return;
    const c = this.ctx, src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = rate * (0.94 + rnd() * 0.12);
    const g = c.createGain(); g.gain.value = vol * (o.gain ?? 1);
    let tail: AudioNode = g;
    src.connect(g);
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); g.connect(p); tail = p; }
    tail.connect(this.master);
    if (wet > 0 && this.revIn) { const w = c.createGain(); w.gain.value = wet * (0.4 + 0.6 * (1 - Math.min(1, (o.gain ?? 1) * 0.5))); tail.connect(w); w.connect(this.revIn); }
    this.active++; src.onended = () => { this.active--; src.disconnect(); };
    src.start();
  }
  private pick(k: string): AudioBuffer | undefined { const a = this.ext[k]?.length ? this.ext[k] : this.bufs[k]; return a ? a[Math.floor(rnd() * a.length)] : undefined; }
  /** Se existir um arquivo gravado para este som, toca-o e devolve true (o som sintético é então pulado). */
  private file(k: string, vol: number, o?: Spatial, wet = 0.2): boolean {
    const b = this.ext[k]?.length ? this.pick(k) : undefined; if (!b) return false; this.play(b, vol, o, 1, wet); return true;
  }
  /**
   * Troca sons sintetizados por arquivos gravados (.ogg/.mp3/.wav). Pode chamar antes do primeiro toque: fica na fila.
   * Nomes: click select order error ready place sell alert lowPower wave rank upgrade radio win lose streak objective slam
   *        boom0 boom1 boom2 boom3 bullet shell rocket laser flame hit die  |  laços: tank heli jet war
   * Aceita um arquivo ou uma lista (sorteia entre eles para não repetir). Ex.: sfx.loadFiles({ boom3: ['audio/b1.ogg','audio/b2.ogg'] })
   */
  async loadFiles(map: Record<string, string | string[]>) {
    const ctx = this.ctx; if (!ctx) { this.pending = { ...(this.pending ?? {}), ...map }; return; }
    for (const [k, v] of Object.entries(map)) {
      const bufs: AudioBuffer[] = [];
      for (const url of Array.isArray(v) ? v : [v]) {
        try { const r = await fetch(url); bufs.push(await ctx.decodeAudioData(await r.arrayBuffer())); } catch { /* arquivo ausente: mantém o som sintético */ }
      }
      if (!bufs.length) continue;
      this.ext[k] = bufs;
      const l = (this.loops as Record<string, { src: AudioBufferSourceNode; g: GainNode } | undefined>)[k];
      if (l) { try { l.src.stop(); } catch { /* já parado */ } const n = ctx.createBufferSource(); n.buffer = bufs[0]; n.loop = true; n.connect(l.g); n.start(); l.src = n; }
    }
  }

  /** Contexto e saída mestre (usados pela trilha musical). */
  private amb: { stop: () => void } | null = null;
  /** Som ambiente: vento (ruído filtrado com ondulação lenta) e zumbido grave. */
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
    src.start(); lfo.start(); base.start();
    this.amb = { stop: () => { try { src.stop(); lfo.stop(); base.stop(); } catch { /* já parado */ } } };
  }
  /** app em segundo plano: silencia tudo sem perder o estado */
  suspend() { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume(); }
  get bus(): AudioBus | null { return this.ctx && this.master && this.revIn ? { ctx: this.ctx, out: this.master, rev: this.revIn } : null; }

  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); this.apply(); }
  setMuted(m: boolean) { this.muted = m; this.apply(); }
  private apply() { if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.7; }

  /** Motores e frente de batalha ao fundo: chamado todo quadro com o que está perto da câmera. */
  mix(tanks: number, helis: number, jets: number, combat: number) {
    const c = this.ctx; if (!c || this.muted) return;
    const now = performance.now(); if (now - this.mixT < 150) return; this.mixT = now;
    const set = (k: 'tank' | 'heli' | 'jet' | 'war', g: number, rate = 1) => {
      const l = this.loops[k]; if (!l) return;
      l.g.gain.setTargetAtTime(g, c.currentTime, 0.35); l.src.playbackRate.setTargetAtTime(rate, c.currentTime, 0.4);
    };
    set('tank', MIX.engine * Math.min(0.55, 0.12 * Math.sqrt(tanks)) * (tanks ? 1 : 0), 0.92 + Math.min(0.2, tanks * 0.015));
    set('heli', MIX.engine * Math.min(0.5, 0.2 * Math.sqrt(helis)) * (helis ? 1 : 0), 1 + Math.min(0.1, helis * 0.02));
    set('jet', MIX.engine * Math.min(0.4, 0.15 * Math.sqrt(jets)) * (jets ? 1 : 0), 0.95 + Math.min(0.15, jets * 0.03));
    set('war', 0.45 * clamp(combat, 0, 1));
  }
  /** Silencia os motores (fim de partida / pausa). */
  quiet() { this.mix(0, 0, 0, 0); this.mixT = 0; }

  // ---------- sintetizadores diretos (UI, alertas, fanfarras) ----------
  private env(t: number, dur: number, vol: number, atk = 0.006): GainNode {
    const c = this.ctx!, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }
  private tone(freq: number, dur: number, type: Wave, vol: number, slideTo?: number, delay = 0, wet = 0, cut = 0) {
    const c = this.ctx!, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.env(t, dur, vol); let n: AudioNode = o;
    if (cut) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; o.connect(f); n = f; }
    n.connect(g); g.connect(this.master!);
    if (wet > 0 && this.revIn) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.revIn); }
    o.start(t); o.stop(t + dur + 0.03);
  }
  /** pulso de ruído filtrado (clique, chiado de rádio, batida) */
  private burst(dur: number, vol: number, hp: number, lp: number, delay = 0, wet = 0) {
    const c = this.ctx!, t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
    const g = this.env(t, dur, vol, 0.002); s.connect(h); h.connect(l); l.connect(g); g.connect(this.master!);
    if (wet > 0 && this.revIn) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.revIn); }
    s.start(t, rnd() * 1.5, dur + 0.05);
  }
  /** metal (sawtooth duplo levemente desafinado + filtro que abre): fanfarras e buzinas */
  private brass(freq: number, dur: number, vol: number, delay = 0, wet = 0.5) {
    const c = this.ctx!, t = c.currentTime + delay, f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.12); f.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.07); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const dt of [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = dt; o.connect(f); o.start(t); o.stop(t + dur + 0.05); }
    f.connect(g); g.connect(this.master!);
    if (this.revIn) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.revIn); }
  }
  /** batida de tambor grave */
  private drum(delay = 0, vol = 0.5, f = 95) {
    const c = this.ctx!, t = c.currentTime + delay, o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.25);
    const g = this.env(t, 0.5, vol, 0.004); o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + 0.55);
    if (this.revIn) { const w = c.createGain(); w.gain.value = 0.4; g.connect(w); w.connect(this.revIn); }
    this.burst(0.06, vol * 0.35, 200, 1800, delay);
  }

  /** metal batido: FM inarmônico (moduladores a 1,41× e 2,76×) — soa como chapa/trava de aço, não como bip */
  private clank(freq: number, dur: number, vol: number, delay = 0, wet = 0.15) {
    const c = this.ctx!, t = c.currentTime + delay;
    const car = c.createOscillator(), m1 = c.createOscillator(), m2 = c.createOscillator(), g1 = c.createGain(), g2 = c.createGain();
    car.frequency.value = freq; m1.frequency.value = freq * 1.414; m2.frequency.value = freq * 2.76;
    g1.gain.setValueAtTime(freq * 2.2, t); g1.gain.exponentialRampToValueAtTime(1, t + dur * 0.6);
    g2.gain.setValueAtTime(freq * 0.9, t); g2.gain.exponentialRampToValueAtTime(1, t + dur * 0.35);
    m1.connect(g1); g1.connect(car.frequency); m2.connect(g2); g2.connect(car.frequency);
    const g = this.env(t, dur, vol * MIX.ui, 0.001); car.connect(g); g.connect(this.master!);
    if (wet > 0 && this.revIn) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.revIn); }
    for (const o of [car, m1, m2]) { o.start(t); o.stop(t + dur + 0.03); }
  }
  /** chiado de walkie-talkie: ruído em faixa estreita + estalo ao soltar o botão */
  private squelch(delay = 0, vol = 0.2, dur = 0.1) {
    const c = this.ctx!, t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700 + rnd() * 500; bp.Q.value = 0.9;
    const g = this.env(t, dur, vol * MIX.ui, 0.004); s.connect(bp); bp.connect(g); g.connect(this.master!); s.start(t, rnd() * 1.5, dur + 0.05);
    this.burst(0.015, vol * 0.9 * MIX.ui, 2500, 8000, delay + dur * 0.85);
  }
  /** zumbido de servo/hidráulica subindo: serra filtrada com tremor de motor */
  private servo(f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay, o = c.createOscillator(), f = c.createBiquadFilter(), g = this.env(t, dur, vol * MIX.ui, 0.05);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 2;
    const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 26; lg.gain.value = vol * 0.4; l.connect(lg); lg.connect(g.gain);
    o.connect(f); f.connect(g); g.connect(this.master!); o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
  }

  // ---------- combate ----------
  shoot(kind: 'bullet' | 'rocket' | 'shell' | 'laser' | 'flame', o?: Spatial) {
    if (!this.ok('shoot' + kind, kind === 'bullet' ? 45 : 70)) return;
    switch (kind) {
      case 'bullet': this.play(this.pick('bullet'), 1.1 * MIX.war, o, 1, 0.25); break;
      case 'shell': this.play(this.pick('shell'), 0.9 * MIX.war, o, 1, 0.5); break;
      case 'rocket': this.play(this.pick('rocket'), 0.7 * MIX.war, o, 1, 0.4); break;
      case 'laser': this.play(this.pick('laser'), 1.0 * MIX.war, o, 1, 0.3); break;
      case 'flame': this.play(this.pick('flame'), 0.6 * MIX.war, o, 1, 0.1); break;
    }
  }
  boom(size: number, o?: Spatial) {
    if (!this.ok('boom', 45)) return;
    const s = size < 0.8 ? 0 : size < 1.4 ? 1 : size < 2.2 ? 2 : 3;
    this.play(this.pick('boom' + s), [0.55, 0.75, 0.95, 1.1][s] * MIX.war, o, 1, [0.3, 0.4, 0.5, 0.6][s]);
    if (s >= 2 && this.ok('boomthump', 120)) this.play(this.pick('boom0'), 0.4, o, 0.5, 0.2);
  }
  /** estalo metálico de impacto */
  hit(o?: Spatial) { if (this.ok('hit', 40)) this.play(this.pick('hit'), 1.0 * MIX.war, o, 1, 0.15); }
  /** soldado cai */
  die(o?: Spatial) { if (this.ok('die', 140)) this.play(this.pick('die'), 0.9 * MIX.war, o, 1, 0.15); }
  /** sequência de abates: metais subindo de tom com tambor */
  streak(n: number) {
    if (!this.ok('streak', 300) || this.file('streak', 0.9)) return;
    const base = 196 * Math.pow(2, Math.min(n, 8) / 12 * 1.5);
    this.drum(0, 0.5); this.brass(base, 0.35, 0.2, 0.05); this.brass(base * 1.25, 0.35, 0.2, 0.13); this.brass(base * 1.5, 0.6, 0.24, 0.22);
    this.burst(0.5, 0.25, 800, 6000, 0.2, 0.4);
  }
  objective() {
    if (!this.ok('obj', 400) || this.file('objective', 0.9)) return;
    this.drum(0, 0.45, 110); [392, 494, 587].forEach((f, i) => this.brass(f, 0.28, 0.2, 0.05 + i * 0.12)); this.brass(784, 0.7, 0.24, 0.42);
  }
  /** batida de abertura de missão: explosão enorme + tambor + metal grave */
  slam() { if (this.ok('slam', 800) && !this.file('slam', 1)) { this.play(this.pick('boom3'), 0.85, undefined, 1, 0.6); this.drum(0.02, 0.7, 70); this.brass(98, 1.1, 0.22, 0.05, 0.7); } }

  // ---------- interface ---------- (nada de bips: transientes de ruído + metal batido + rádio)
  /** clique: trava mecânica — estalo seco + pancada surda + metal curto */
  click() { if (!this.ok('click', 30) || this.file('click', 0.8)) return; this.burst(0.012, 0.5 * MIX.ui, 2500, 9000); this.tone(210, 0.07, 'sine', 0.5 * MIX.ui, 110); this.clank(780, 0.07, 0.1); }
  /** seleção de unidade: chiado de rádio + trava de fivela */
  select() { if (!this.ok('select', 40) || this.file('select', 0.8)) return; this.squelch(0, 0.16, 0.07); this.tone(150, 0.08, 'sine', 0.35 * MIX.ui, 95, 0.02); this.clank(520, 0.12, 0.12, 0.03, 0.1); }
  /** ordem recebida: rádio + duas travas ("afirmativo") */
  order() { if (!this.ok('order', 40) || this.file('order', 0.8)) return; this.squelch(0, 0.18, 0.06); this.tone(130, 0.07, 'sine', 0.35 * MIX.ui, 90, 0.04); this.clank(430, 0.1, 0.14, 0.05); this.clank(330, 0.14, 0.14, 0.13, 0.1); }
  /** negado: pancada grave + zumbido abafado */
  error() { if (!this.ok('error', 200) || this.file('error', 0.8)) return; this.tone(120, 0.25, 'sine', 0.5 * MIX.ui, 70); this.tone(150, 0.26, 'sawtooth', 0.2 * MIX.ui, 95, 0, 0, 500); this.clank(180, 0.2, 0.2, 0.02); }
  /** pronto: carimbo tático + sino de aço */
  ready() {
    if (!this.ok('ready', 300) || this.file('ready', 0.8)) return;
    this.squelch(0, 0.1, 0.05); this.tone(130, 0.14, 'sine', 0.5 * MIX.ui, 80, 0.06); this.burst(0.05, 0.3 * MIX.ui, 300, 3000, 0.06); this.clank(1175, 0.35, 0.12, 0.07, 0.35); this.clank(1568, 0.4, 0.08, 0.17, 0.4);
  }
  /** construção posicionada: pancada de concreto/aço sendo assentado + chiado hidráulico */
  place() {
    if (!this.ok('place', 120) || this.file('place', 0.8)) return;
    this.play(this.pick('boom0'), 0.35 * MIX.ui, undefined, 0.7, 0.2); this.burst(0.2, 0.22 * MIX.ui, 200, 1500); this.tone(110, 0.2, 'sine', 0.3 * MIX.ui, 60); this.clank(260, 0.3, 0.18, 0.08, 0.25); this.burst(0.25, 0.08 * MIX.ui, 2500, 9000, 0.15);
  }
  /** venda: moedas de metal */
  sell() { if (!this.ok('sell', 200) || this.file('sell', 0.8)) return; [2093, 2637, 3136].forEach((f, i) => this.clank(f, 0.16, 0.09, i * 0.06, 0.25)); this.tone(120, 0.1, 'sine', 0.25 * MIX.ui, 80); }
  /** sirene de ataque à base: dois ciclos de buzina militar */
  alert() {
    if (!this.ok('alert', 5000) || this.file('alert', 0.9)) return;
    for (let i = 0; i < 3; i++) { this.tone(660, 0.3, 'sawtooth', 0.16 * MIX.alarm, 940, i * 0.62, 0.5, 1100); this.tone(940, 0.3, 'sawtooth', 0.16 * MIX.alarm, 660, i * 0.62 + 0.31, 0.5, 1100); }
    this.drum(0, 0.4);
  }
  lowPower() { if (this.ok('low', 5000) && !this.file('lowPower', 0.9)) { this.tone(440, 0.3, 'sawtooth', 0.13, 220, 0, 0.2, 1500); this.tone(330, 0.4, 'sawtooth', 0.13, 110, 0.32, 0.2, 1500); this.burst(0.5, 0.06, 300, 3000, 0.3); } }
  /** nova onda inimiga: corneta de guerra grave */
  wave() { if (this.ok('wave', 3000) && !this.file('wave', 0.9)) { this.brass(98, 0.9, 0.24, 0, 0.7); this.brass(147, 1.0, 0.2, 0.55, 0.7); this.drum(0, 0.55, 80); this.drum(0.55, 0.5, 80); } }
  rank() { if (this.ok('rank', 400) && !this.file('rank', 0.8)) { this.drum(0, 0.3, 110); [392, 494, 587].forEach((f, i) => this.brass(f, 0.3, 0.12, i * 0.1, 0.5)); this.burst(0.2, 0.08, 4000, 9000, 0.15, 0.3); } }
  /** evolução: zumbido de servo subindo + brilho */
  upgrade() { if (this.ok('upg', 300) && !this.file('upgrade', 0.8)) { this.servo(110, 420, 0.4, 0.16); this.burst(0.3, 0.1 * MIX.ui, 1000, 4000); this.clank(600, 0.3, 0.14, 0.38, 0.3); this.brass(392, 0.5, 0.1, 0.4, 0.5); } }
  /** rádio antes do locutor */
  radio() {
    if (!this.ctx || this.muted) return;
    if (this.file('radio', 0.8)) return;
    this.squelch(0, 0.1, 0.06); this.squelch(0.12, 0.08, 0.05);
  }
  /** vitória: fanfarra de metais com tambores */
  win() {
    if (!this.ctx || this.muted || this.file('win', 1)) return;
    this.drum(0, 0.6, 85);
    [[294, 0], [392, 0.18], [494, 0.36], [587, 0.54]].forEach(([f, d]) => { this.brass(f, 0.4, 0.2, d); this.brass(f / 2, 0.4, 0.14, d); });
    [587, 740, 880].forEach(f => this.brass(f, 1.8, 0.22, 0.8)); this.brass(147, 1.8, 0.2, 0.8); this.drum(0.8, 0.7, 70); this.burst(1.6, 0.18, 4000, 9000, 0.8, 0.5);
  }
  /** derrota: metais graves caindo + estrondo */
  lose() {
    if (!this.ctx || this.muted || this.file('lose', 1)) return;
    [196, 185, 175, 147].forEach((f, i) => this.brass(f, 0.7, 0.2, i * 0.45, 0.8));
    this.drum(0, 0.6, 60); this.drum(0.9, 0.6, 55); this.play(this.pick('boom2'), 0.6, undefined, 0.8, 0.6);
  }
}

export const sfx = new SfxEngine();
