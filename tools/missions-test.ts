/** Fumaça de cada missão: monta o cenário, roda 90 s de simulação e confere se nada quebra. */
import { World } from '../src/systems/World';
import { MISSIONS, MissionRunner } from '../src/campaign/missions';
import { AI } from '../src/systems/AI';
for (const ms of MISSIONS) {
  const w = new World({ mapId: ms.mapId, difficulty: ms.difficulty, faction: ms.faction, enemyFaction: ms.enemy, vsAI: ms.ai, bare: ms.bare, customWin: ms.custom, startCredits: ms.credits, enemyCredits: ms.enemyCredits });
  ms.setup(w); w.updatePower(); w.updateFog();
  const r = new MissionRunner(ms, w), ai = null as AI | null;
  const u0 = w.entities.filter(e => e.team === 0).length, u1 = w.entities.filter(e => e.team === 1).length;
  let err = '';
  try { for (let i = 0; i < 1800; i++) { w.update(0.05); ai?.update(0.05); r.update(0.05); if (r.state !== 'run') break; } } catch (e) { err = String(e); }
  console.log(`${ms.id.padEnd(4)} n${String(ms.n).padStart(2)} ${ms.camp ?? 'solar'} ${ms.title.padEnd(26)} jog=${u0} ini=${u1} estado=${r.state} ${r.reason} ${err}`);
}
