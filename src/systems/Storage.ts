import { Preferences } from '@capacitor/preferences';
import type { Difficulty, Faction } from '../config';

export interface SaveData {
  volume: number;
  muted: boolean;
  difficulty: Difficulty;
  faction: Faction;
  mapId: string;
  wins: number;
  losses: number;
  winsByDiff: Record<Difficulty, number>;
  musicVolume: number;
  full: boolean; // Edição Completa (compra única)
  prologue: boolean;
  gameSpeed: number;
  lang: 'auto' | 'pt' | 'en';
  quality: 'auto' | 'low' | 'med' | 'high';
  enemy: 'auto' | 'solar' | 'ferro' | 'boreal' | 'viboras';
  startCredits: number; supers: boolean; fogOn: boolean; hpBars: 'hurt' | 'always' | 'sel'; shake: boolean; detailModels: boolean; voice: boolean; ach: Record<string, number>; stats: Record<string, number>;
  campaign: Record<string, number>; // id da missão -> estrelas (0 = não concluída)
}

const KEY = 'frente-de-ferro-save-v1';
const DEFAULT: SaveData = {
  volume: 0.7, muted: false, difficulty: 'normal', faction: 'solar', mapId: 'planicie',
  wins: 0, losses: 0, winsByDiff: { easy: 0, normal: 0, hard: 0 },
  musicVolume: 0.5, full: false, prologue: false, gameSpeed: 1, lang: 'auto', quality: 'auto', enemy: 'auto', startCredits: 2000, supers: true, fogOn: true, hpBars: 'hurt', shake: true, detailModels: true, voice: true, ach: {}, stats: {}, campaign: {},
};

/** Persistência via Capacitor Preferences (nativo) com fallback automático para localStorage (web). */
class StorageImpl {
  data: SaveData = { ...DEFAULT, winsByDiff: { ...DEFAULT.winsByDiff } };

  async load() {
    try {
      const { value } = await Preferences.get({ key: KEY });
      if (value) { const j = JSON.parse(value); this.data = { ...DEFAULT, ...j, winsByDiff: { ...DEFAULT.winsByDiff, ...(j.winsByDiff ?? {}) }, campaign: { ...(j.campaign ?? {}) } }; }
    } catch {
      try {
        const v = localStorage.getItem(KEY);
        if (v) this.data = { ...DEFAULT, ...JSON.parse(v) };
      } catch { /* ignora */ }
    }
  }

  save() {
    const v = JSON.stringify(this.data);
    Preferences.set({ key: KEY, value: v }).catch(() => {
      try { localStorage.setItem(KEY, v); } catch { /* ignora */ }
    });
  }

  completeMission(id: string, stars: number) {
    this.data.campaign[id] = Math.max(this.data.campaign[id] ?? 0, stars);
    this.save();
  }

  recordResult(win: boolean, diff: Difficulty) {
    if (win) { this.data.wins++; this.data.winsByDiff[diff]++; } else this.data.losses++;
    this.save();
  }
}

export const Storage = new StorageImpl();
