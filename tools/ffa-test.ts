// Teste headless de 3–4 jogadores: FFA e equipes, mapa 96×96, eliminação e vitória por aliança.
import { World } from '../src/systems/World';
import { AI } from '../src/systems/AI';
import { MAP_W, Slot, Team, TEAMS, defaultSlots, Faction } from '../src/config';

const mode = process.argv[2] || 'ffa';          // ffa | 2v2 | 3
const minutes = Number(process.argv[3] || 25);
const facs: Faction[] = ['solar', 'ferro', 'boreal', 'viboras'];
const n = mode === '3' ? 3 : 4;
const al = mode === '2v2' ? [0, 1, 0, 1] : [0, 1, 2, 3];
const slots: Slot[] = TEAMS.map(t => t < n ? { active: true, type: 'ai', faction: facs[t], alliance: al[t], difficulty: 'normal' } : { active: false, type: 'empty', faction: 'solar', alliance: t });
const w = new World({ mapId: 'planicie', difficulty: 'normal', faction: 'solar', slots, mapSize: 96, startCredits: 3000 });
w.ais.push(new AI(w, 0)); // slot 0 também é IA neste teste (sem humano)
console.log(`mapa ${w.mapSize} (MAP_W=${MAP_W}) times ativos=${w.active.join(',')} ais=${w.ais.length}`);
for (const t of w.active) console.log(`base T${t}:`, w.buildings(t).map(b => `${b.kind}@${b.tx},${b.ty}`).join(' '), '| units', w.units(t).length);
// isEnemy
for (const a of w.active) for (const b of w.active) if (a < b) console.log(`isEnemy(${a},${b})=${w.isEnemy(a, b)}`);
const dt = 0.05; let next = 0; const t0 = Date.now(); const out = new Set<Team>();
while (w.time < minutes * 60 && w.winner === null) {
  w.update(dt); w.fx.length = 0; w.messages.length = 0; w.sounds.length = 0;
  for (const t of w.active) if (w.teams[t].out && !out.has(t)) { out.add(t); console.log(`  t=${Math.floor(w.time)}s T${t} ELIMINADO`); }
  if (w.time >= next) { next += 120; console.log(`t=${Math.floor(w.time)}s ` + w.active.map(t => `T${t}[b${w.buildings(t).length} u${w.units(t).length} cr${Math.floor(w.teams[t].credits)}]`).join(' ')); }
}
console.log(`fim t=${Math.floor(w.time)}s vencedor=${w.winner} aliança=${w.winner === null ? '-' : w.allianceOf(w.winner)} vivos=${w.alive().join(',')} (cpu ${Date.now() - t0}ms)`);
// 2 jogadores clássico continua igual
const c = new World({ mapId: 'planicie', difficulty: 'normal', faction: 'solar' });
console.log(`clássico: mapa ${c.mapSize} MAP_W=${MAP_W} ativos=${c.active.join(',')} enemy(0,1)=${c.isEnemy(0, 1)} ais=${c.ais.length}`);
void defaultSlots;
