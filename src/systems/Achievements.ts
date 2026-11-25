import { Storage } from './Storage';
import { MISSIONS, campOf, Camp } from '../campaign/missions';
import type { Faction } from '../config';

/**
 * Conquistas e recordes locais. Ficam salvos no aparelho e têm um gancho para Google Play Games / Game Center:
 * se o app nativo registrar `window.FFRGames = { unlock(id), submit(board, value) }`, cada conquista e recorde
 * também é enviado para a loja (os ids aqui devem ser cadastrados lá com os mesmos nomes).
 */
export interface AchDef { id: string; name: string; desc: string; goal?: number; stat?: string }
export const ACH: AchDef[] = [
  { id: 'first_win', name: 'Primeira Vitória', desc: 'Vença uma escaramuça.' },
  { id: 'hard_win', name: 'Sem Piedade', desc: 'Vença uma escaramuça no Difícil.' },
  { id: 'all_factions', name: 'Mercenário', desc: 'Vença com os 4 exércitos.', goal: 4, stat: 'facwins' },
  { id: 'blitz', name: 'Blitzkrieg', desc: 'Vença uma escaramuça em menos de 8 minutos.' },
  { id: 'camp_solar', name: 'Sol Nascente', desc: 'Conclua a campanha da Vanguarda Solar.' },
  { id: 'camp_ferro', name: 'Punho de Ferro', desc: 'Conclua a campanha do Sindicato Ferro.' },
  { id: 'camp_boreal', name: 'Inverno Chegou', desc: 'Conclua a campanha da Guarda Boreal.' },
  { id: 'camp_viboras', name: 'Veneno', desc: 'Conclua a campanha do Cartel Víbora.' },
  { id: 'stars', name: 'Perfeccionista', desc: 'Ganhe 3 estrelas em 10 missões.', goal: 10, stat: 'stars3' },
  { id: 'capture', name: 'Mãos Leves', desc: 'Capture uma construção inimiga com um Engenheiro.' },
  { id: 'super', name: 'Fim do Mundo', desc: 'Use o superpoder do seu exército.' },
  { id: 'elite', name: 'Veterano de Guerra', desc: 'Promova uma unidade a Elite.' },
  { id: 'wall', name: 'Grande Muralha', desc: 'Tenha 30 trechos de muro numa partida.' },
  { id: 'kills', name: 'Máquina de Guerra', desc: 'Some 250 abates no total.', goal: 250, stat: 'kills' },
];

type Toast = (text: string) => void;
let toast: Toast = () => { /* definido pela partida */ };
const games = () => (window as unknown as { FFRGames?: { unlock(id: string): void; submit(b: string, v: number): void } }).FFRGames;

export const Achievements = {
  onUnlock(fn: Toast) { toast = fn; },
  has: (id: string) => !!Storage.data.ach?.[id],
  unlock(id: string) {
    const s = Storage.data; s.ach ??= {};
    if (s.ach[id]) return;
    s.ach[id] = Date.now(); Storage.save();
    const d = ACH.find(a => a.id === id); if (d) toast(`🏅 Conquista: ${d.name}`);
    try { games()?.unlock(id); } catch { /* sem serviço nativo */ }
  },
  stat(key: string) { return Storage.data.stats?.[key] ?? 0; },
  add(key: string, v = 1) { const s = Storage.data; s.stats ??= {}; s.stats[key] = (s.stats[key] ?? 0) + v; Storage.save(); },
  /** fim de escaramuça: vitórias, exércitos usados, tempo e recorde por mapa/dificuldade */
  skirmishEnd(win: boolean, faction: Faction, diff: string, mapId: string, secs: number, kills: number) {
    this.add('kills', kills);
    if (this.stat('kills') >= 250) this.unlock('kills');
    if (!win) return;
    this.unlock('first_win');
    if (diff === 'hard') this.unlock('hard_win');
    if (secs < 480) this.unlock('blitz');
    const s = Storage.data; s.stats ??= {};
    if (!s.stats['fw_' + faction]) { s.stats['fw_' + faction] = 1; this.add('facwins'); }
    if (this.stat('facwins') >= 4) this.unlock('all_factions');
    const key = `best_${mapId}_${diff}`, prev = s.stats[key];
    if (!prev || secs < prev) { s.stats[key] = Math.round(secs); Storage.save(); try { games()?.submit(key, Math.round(secs)); } catch { /* sem serviço nativo */ } }
  },
  /** após cada missão: campanhas completas e contagem de 3 estrelas */
  campaign() {
    const c = Storage.data.campaign;
    for (const camp of ['solar', 'ferro', 'boreal', 'viboras'] as Camp[]) {
      const ms = MISSIONS.filter(m => campOf(m) === camp);
      if (ms.length && ms.every(m => (c[m.id] ?? 0) > 0)) this.unlock('camp_' + camp);
    }
    const s3 = MISSIONS.filter(m => (c[m.id] ?? 0) >= 3).length;
    Storage.data.stats ??= {}; Storage.data.stats.stars3 = s3; Storage.save();
    if (s3 >= 10) this.unlock('stars');
  },
};
