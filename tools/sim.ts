// Simulação headless IA x IA para validar economia, produção, combate e vitória.
import { World } from '../src/systems/World';
import { AI } from '../src/systems/AI';
import type { Difficulty } from '../src/config';

const diff = (process.argv[2] as Difficulty) || 'normal';
const minutes = Number(process.argv[3] || 12);
const w = new World({ mapId: process.argv[4] || 'planicie', difficulty: diff, faction: 'solar' });
w.ais.push(new AI(w, 0));
const dt = 0.05;
let nextLog = 0;
const t0 = Date.now();
while (w.time < minutes * 60 && w.winner === null) {
  w.update(dt);
  w.fx.length = 0; w.messages.length = 0; w.sounds.length = 0;
  if (w.time >= nextLog) {
    nextLog += 60;
    const s = (t: 0 | 1) => {
      const es = w.entities.filter(e => e.team === t);
      const b = es.filter(e => e.building).length, u = es.filter(e => !e.building).length;
      const h = es.filter(e => e.kind === 'harvester').length;
      return `cr=${Math.floor(w.teams[t].credits)} bld=${b} units=${u} harv=${h} pw=${w.teams[t].power}/${w.teams[t].usage}`;
    };
    console.log(`t=${Math.floor(w.time)}s  P0[${s(0)}]  P1[${s(1)}]`);
  }
}
console.log(`fim t=${Math.floor(w.time)}s vencedor=${w.winner} (cpu ${Date.now() - t0}ms)`);
