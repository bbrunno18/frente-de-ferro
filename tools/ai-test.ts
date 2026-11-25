/** IA contra IA em dificuldade Normal: conta capturas, incursões e recuos para conferir as novas táticas. */
import { World } from '../src/systems/World';
import { AI } from '../src/systems/AI';
let caps = 0, engs = 0, apcs = 0, maxE = 0, maxA = 0, rad = 0;
for (let r = 0; r < 3; r++) {
  const w = new World({ mapId: 'planicie', difficulty: 'normal', faction: 'ferro', enemyFaction: 'solar', vsAI: true });
  w.ais.push(new AI(w, 0));
  let t = 0;
  for (; t < 900 && w.winner === null; t += 0.05) {
    w.update(0.05);
    maxE = Math.max(maxE, w.entities.filter(e => e.kind === 'engineer').length); maxA = Math.max(maxA, w.entities.filter(e => e.kind === 'apc').length); if (w.hasBuilding(0, 'radar') || w.hasBuilding(1, 'radar')) rad++;
    for (const m of w.messages.splice(0)) if (/capturad/.test(m.text)) caps++;
  }
  engs += w.teams[0].built; apcs += w.entities.filter(e => e.kind === 'apc').length;
  console.log(`partida ${r + 1}: ${Math.round(t)}s vencedor=${w.winner} unidades=${w.entities.filter(e => !e.building).length}`);
}
console.log('capturas por engenheiros:', caps, 'máx. engenheiros:', maxE, 'máx. transportes:', maxA, 'ticks com radar:', rad);
