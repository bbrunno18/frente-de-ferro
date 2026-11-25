import { World } from '../src/systems/World';
import { Entity } from '../src/entities/Entity';
const w = new World({ mapId: 'planicie', difficulty: 'easy', faction: 'boreal', enemyFaction: 'viboras', vsAI: false });
const me = w.entities.find(e => e.team === 0 && e.kind === 'conyard')!, en = w.entities.find(e => e.team === 1 && e.kind === 'refinery' || e.team === 1 && e.kind === 'power')!;
const mk = (k: any, team: 0 | 1, x: number, y: number) => { const e = new Entity(k, team, x, y, w.teams[team].faction); w.entities.push(e); return e; };
// 1) captura
const eng = mk('engineer', 0, en.x - 60, en.y);
console.log('antes', en.kind, 'team', en.team, 'fac', en.faction);
w.applyCommand(0, { c: 'capture', ids: [eng.id], t: en.id });
for (let i = 0; i < 600; i++) w.update(0.05);
console.log('depois team', en.team, 'fac', en.faction, 'eng vivo', eng.alive);
// 2) transporte
const apc = mk('apc', 0, me.x + 80, me.y + 80), r1 = mk('rifle', 0, apc.x + 40, apc.y), r2 = mk('rocket', 0, apc.x + 40, apc.y + 20);
w.applyCommand(0, { c: 'board', ids: [r1.id, r2.id], t: apc.id });
for (let i = 0; i < 300; i++) w.update(0.05);
console.log('embarcados', apc.riders.length, 'cargo', apc.cargo, 'r1 vivo', r1.alive);
w.applyCommand(0, { c: 'unload', ids: [apc.id] }); console.log('apos descer', apc.riders.length, 'soldados', w.entities.filter(e => e.team === 0 && (e.kind === 'rifle' || e.kind === 'rocket')).length);
// 3) patrulha e guarda
const t = mk('tank', 0, me.x + 120, me.y);
w.applyCommand(0, { c: 'patrol', ids: [t.id], x: t.x + 200, y: t.y });
for (let i = 0; i < 400; i++) w.update(0.05);
console.log('patrulha', t.order.t, Math.round(t.x));
w.applyCommand(0, { c: 'hold', ids: [t.id] }); w.update(0.05); console.log('hold', t.order.t);
// 4) novas unidades exclusivas
console.log('cryo ok', w.canBuild(0, 'cryo'), 'raider p/ boreal', w.canBuild(0, 'raider'));
