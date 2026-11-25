import { sfx } from './Sfx';
import { Storage } from '../systems/Storage';
import { currentLang } from '../i18n';

/**
 * Locutor de campo e respostas das unidades, com a voz sintetizada do próprio aparelho (offline, sem custo).
 * Cada fala tem prioridade e intervalo mínimo para não virar falatório. Um bip de rádio antecede os avisos.
 * Para trocar por vozes gravadas (ex.: ElevenLabs), basta substituir `speak()` por um tocador de áudio.
 */
type Line = { pt: string[]; en: string[]; prio: number; cd: number; radio?: boolean };
const L: Record<string, Line> = {
  built: { pt: ['Construção concluída.'], en: ['Construction complete.'], prio: 2, cd: 2, radio: true },
  inf: { pt: ['Unidade pronta.'], en: ['Unit ready.'], prio: 1, cd: 4, radio: true },
  veh: { pt: ['Veículo pronto.'], en: ['Vehicle ready.'], prio: 1, cd: 4, radio: true },
  air: { pt: ['Aeronave pronta.'], en: ['Aircraft ready.'], prio: 1, cd: 4, radio: true },
  attack: { pt: ['Nossa base está sob ataque!', 'Base sob ataque!'], en: ['Our base is under attack!'], prio: 4, cd: 18, radio: true },
  lowpower: { pt: ['Energia baixa.'], en: ['Low power.'], prio: 3, cd: 20, radio: true },
  rank: { pt: ['Unidade promovida.'], en: ['Unit promoted.'], prio: 1, cd: 8, radio: true },
  wave: { pt: ['Forças inimigas se aproximando.'], en: ['Enemy forces approaching.'], prio: 3, cd: 10, radio: true },
  spready: { pt: ['Superpoder pronto.'], en: ['Superweapon ready.'], prio: 3, cd: 30, radio: true },
  splaunch: { pt: ['Ataque autorizado.'], en: ['Strike authorized.'], prio: 3, cd: 5, radio: true },
  lost: { pt: ['Unidade perdida.'], en: ['Unit lost.'], prio: 1, cd: 12, radio: true },
  bldlost: { pt: ['Construção perdida.'], en: ['Building lost.'], prio: 3, cd: 6, radio: true },
  captured: { pt: ['Construção capturada.'], en: ['Building captured.'], prio: 3, cd: 4, radio: true },
  funds: { pt: ['Créditos insuficientes.'], en: ['Insufficient funds.'], prio: 2, cd: 6, radio: true },
  win: { pt: ['Missão cumprida.', 'Vitória.'], en: ['Mission accomplished.'], prio: 5, cd: 1, radio: true },
  lose: { pt: ['Missão fracassada.'], en: ['Mission failed.'], prio: 5, cd: 1, radio: true },
  // respostas das tropas
  selInf: { pt: ['Às ordens!', 'Pronto, comandante!', 'Na escuta.', 'Fala, comandante.'], en: ['Yes, sir!', 'Ready, commander!', 'Standing by.'], prio: 0, cd: 1.4 },
  selVeh: { pt: ['Blindado em posição.', 'Motores ligados.', 'Aguardando ordens.'], en: ['Armor in position.', 'Engines running.', 'Awaiting orders.'], prio: 0, cd: 1.4 },
  selAir: { pt: ['Piloto na escuta.', 'Pronto para decolar.'], en: ['Pilot standing by.', 'Ready for takeoff.'], prio: 0, cd: 1.4 },
  move: { pt: ['Em movimento!', 'Entendido.', 'Positivo.', 'A caminho.'], en: ['Moving out!', 'Understood.', 'Affirmative.', 'On my way.'], prio: 0, cd: 1.2 },
  atk: { pt: ['Fogo à vontade!', 'Atacando!', 'Alvo confirmado.'], en: ['Open fire!', 'Attacking!', 'Target confirmed.'], prio: 0, cd: 1.2 },
};

class VoiceImpl {
  private last = new Map<string, number>();
  private busyUntil = 0;
  private curPrio = -1;
  private voice: SpeechSynthesisVoice | null = null;
  private ok = typeof window !== 'undefined' && 'speechSynthesis' in window;

  constructor() {
    if (this.ok) { const pick = () => this.pickVoice(); speechSynthesis.onvoiceschanged = pick; pick(); }
  }
  private pickVoice() {
    const lang = currentLang() === 'en' ? 'en' : 'pt';
    const vs = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(lang));
    // prefere vozes masculinas/graves e de português do Brasil quando houver
    this.voice = vs.find(v => /br/i.test(v.lang) && /(male|masculin|daniel|felipe|ricardo|reed|eddy|rocko)/i.test(v.name))
      ?? vs.find(v => /br|us/i.test(v.lang)) ?? vs[0] ?? null;
  }
  enabled() { return this.ok && Storage.data.voice !== false && !Storage.data.muted && sfx.volume > 0; }

  say(key: string) {
    const ln = L[key]; if (!ln || !this.enabled()) return;
    const now = performance.now() / 1000;
    if (now - (this.last.get(key) ?? -99) < ln.cd) return;
    const speaking = now < this.busyUntil;
    if (speaking && ln.prio <= this.curPrio) return; // não atropela fala mais importante
    if (speaking) speechSynthesis.cancel();
    this.last.set(key, now);
    const opts = currentLang() === 'en' ? ln.en : ln.pt, text = opts[Math.floor(Math.random() * opts.length)];
    if (ln.radio) sfx.radio();
    const u = new SpeechSynthesisUtterance(text);
    if (!this.voice) this.pickVoice();
    if (this.voice) u.voice = this.voice;
    u.lang = currentLang() === 'en' ? 'en-US' : 'pt-BR';
    u.rate = ln.prio === 0 ? 1.15 : 1.02; u.pitch = ln.prio === 0 ? 0.95 : 0.72;
    u.volume = Math.min(1, sfx.volume * (ln.prio === 0 ? 0.7 : 1));
    this.curPrio = ln.prio; this.busyUntil = now + 0.4 + text.length * 0.065;
    u.onend = () => { this.busyUntil = 0; this.curPrio = -1; };
    setTimeout(() => speechSynthesis.speak(u), ln.radio ? 140 : 0);
  }
}
export const voice = new VoiceImpl();
