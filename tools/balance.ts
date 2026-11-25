/**
 * Balanceamento automático: batalhas de MESMO CUSTO entre cada par de unidades, no simulador real do jogo.
 * Inspirado na análise de custo-eficiência (lei de Lanchester / "Template Analyzer" do 0 A.D.).
 * Pontuação de A contra B: (valor restante de A − valor restante de B) / orçamento, de −1 (perde tudo) a +1.
 * Uso: npx tsx tools/balance.ts [orçamento]
 */
import { World } from '../src/systems/World';
import { Entity } from '../src/entities/Entity';
import { DEFS, Kind, TILE } from '../src/config';

const UNITS: Kind[] = ['rifle', 'rocket', 'flamer', 'sniper', 'commando', 'buggy', 'flak', 'tank', 'mlrs', 'artillery', 'prism', 'cryo', 'raider', 'heli', 'jet', 'bomber'];
const BUDGET = Number(process.argv[2] ?? 3000);

function battle(a: Kind, b: Kind, flip: boolean): number {
  const w = new World({ mapId: 'planicie', difficulty: 'normal', faction: 'ferro', enemyFaction: 'ferro', vsAI: false, bare: true, customWin: true, startCredits: 0, enemyCredits: 0 });
  const ya = 28 * TILE, xa = (flip ? 40 : 22) * TILE, xb = (flip ? 22 : 40) * TILE;
  const army = (k: Kind, team: 0 | 1, x: number) => {
    const n = Math.max(1, Math.round(BUDGET / DEFS[k].cost)), out: Entity[] = [];
    for (let i = 0; i < n; i++) { const e = new Entity(k, team, x + ((i % 4) - 1.5) * 26, ya + (Math.floor(i / 4) - 1.5) * 26, 'ferro'); w.entities.push(e); out.push(e); }
    return out;
  };
  const A = army(a, 0, xa), B = army(b, 1, xb);
  w.applyCommand(0, { c: 'amove', ids: A.map(e => e.id), x: xb, y: ya });
  w.applyCommand(1, { c: 'amove', ids: B.map(e => e.id), x: xa, y: ya });
  for (let t = 0; t < 1800; t++) { w.update(0.05); if (!A.some(e => e.alive) || !B.some(e => e.alive)) break; }
  const val = (L: Entity[]) => L.filter(e => e.alive).reduce((s, e) => s + (e.hp / e.maxHp) * e.def.cost, 0);
  const va = val(A) / (A.length * DEFS[a].cost), vb = val(B) / (B.length * DEFS[b].cost);
  return va - vb;
}

const M: Record<string, Record<string, number>> = {};
for (const a of UNITS) M[a] = {};
for (let i = 0; i < UNITS.length; i++) for (let j = i + 1; j < UNITS.length; j++) {
  const a = UNITS[i], b = UNITS[j];
  const s = (battle(a, b, false) + battle(a, b, true)) / 2;
  M[a][b] = s; M[b][a] = -s;
}
const pad = (s: string, n = 7) => s.padStart(n);
console.log(pad('', 10) + UNITS.map(u => pad(u.slice(0, 6))).join(''));
const rows = UNITS.map(a => {
  const vals = UNITS.filter(b => b !== a).map(b => M[a][b]);
  // só conta confrontos que de fato aconteceram (unidade que não alcança o alvo empata em 0)
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const beats = vals.filter(v => v > 0.35).length, loses = vals.filter(v => v < -0.35).length;
  console.log(pad(a, 10) + UNITS.map(b => pad(b === a ? '·' : (M[a][b] >= 0 ? '+' : '') + M[a][b].toFixed(2))).join(''));
  return { a, avg, beats, loses };
});
console.log('\nunidade      média  vence  perde');
for (const r of rows.sort((x, y) => y.avg - x.avg)) console.log(`${r.a.padEnd(10)} ${(r.avg >= 0 ? '+' : '') + r.avg.toFixed(2)}   ${String(r.beats).padStart(3)}   ${String(r.loses).padStart(3)}`);
