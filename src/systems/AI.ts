import { DEFS, DIFFS, Kind, Team, TILE, MAP_W, MAP_H } from '../config';
import type { World } from './World';
import type { Entity } from '../entities/Entity';

/** IA do time inimigo. Sem cronômetro de ataque: ataca quando o exército pronto atinge um tamanho. */
export class AI {
  private t = 0;
  private attacks = 0;
  private upT = 0;
  private lastTarget: Entity | null = null;

  constructor(private w: World, private team: Team) {}

  private count(k: Kind) { return this.w.entities.filter(e => e.team === this.team && e.kind === k && e.alive).length; }
  private get ts() { return this.w.teams[this.team]; }
  private army(): Entity[] {
    return this.w.units(this.team).filter(u => u.def.damage > 0);
  }

  update(dt: number) {
    const d = DIFFS[this.w.difficulty];
    this.t += dt;
    if (this.t < d.think) return;
    this.t = 0;
    if (!this.w.hasBuilding(this.team, 'conyard') && this.w.buildings(this.team).length === 0) return;

    const harvs = this.count('harvester');
    const wantHarv = this.count('refinery') >= 2 ? 3 : 2;
    const saving = this.count('factory') > 0 && harvs < wantHarv;
    // sem nenhum Extrator e sem dinheiro: vende uma defesa ou construção secundária para não entrar em colapso
    if (harvs === 0 && this.count('refinery') > 0 && this.count('factory') > 0 && this.ts.credits < DEFS.harvester.cost) {
      const sell = this.w.buildings(this.team).find(b => ['wall', 'bunker', 'turret', 'aa', 'cannon', 'helipad', 'lab'].includes(b.kind));
      if (sell) this.w.sellBuilding(this.team, sell);
    }
    this.economy(saving);
    this.buildStructures(saving);
    this.trainUnits(saving, wantHarv, harvs);
    this.upgrades();
    this.useSuper();
    this.attackLogic(d.need + d.growth * this.attacks, d.frac);
    if (this.w.difficulty !== 'easy') { this.retreat(); this.raid(); this.engineers(); }
  }

  private home(): Entity | null { return this.w.entities.find(e => e.team === this.team && e.alive && e.kind === 'conyard') ?? this.w.buildings(this.team)[0] ?? null; }
  private retreated = new Set<number>();
  /** recua veículos muito feridos para perto da base, onde as defesas ajudam (uma vez por unidade) */
  private retreat() {
    const h = this.home(); if (!h) return;
    const hurt = this.army().filter(u => u.def.category === 'vehicle' && u.hp < u.maxHp * 0.28 && !this.retreated.has(u.id) && this.w.distTo(u, h) > 10 * TILE);
    if (!hurt.length) return;
    for (const u of hurt) this.retreated.add(u.id);
    this.w.orderMove(hurt, h.x + (Math.random() - 0.5) * 120, h.y + (Math.random() - 0.5) * 120);
  }
  private raidT = 0;
  /** incursão: 2 a 3 unidades rápidas caçam os Extratores do jogador */
  private raid() {
    this.raidT += 1; if (this.raidT < 25) return;
    const fast = this.army().filter(u => (u.kind === 'buggy' || u.kind === 'raider' || u.kind === 'heli' || u.kind === 'jet') && u.order.t === 'idle');
    const foeH = this.w.entities.filter(e => e.alive && e.team !== this.team && e.kind === 'harvester');
    if (fast.length < 2 || !foeH.length) return;
    this.raidT = 0;
    const sq = fast.slice(0, 3), c = sq[0];
    const tgt = foeH.reduce((b, e) => (Math.hypot(e.x - c.x, e.y - c.y) < Math.hypot(b.x - c.x, b.y - c.y) ? e : b));
    this.w.orderAttack(sq, tgt);
  }
  private engT = 0;
  /** engenheiros: treina um quando há dinheiro e manda capturar a construção do jogador mais próxima da frente,
   *  de preferência dentro de um Transporte Blindado; desembarca quando chega perto */
  private engineers() {
    const w = this.w, ts = this.ts;
    this.engT += 1;
    if (this.engT > 20 && ts.credits > 420 && w.canBuild(this.team, 'engineer') && this.count('engineer') < 2) { this.engT = 0; w.startProduction(this.team, 'engineer'); }
    if (this.engT > 12 && ts.credits > 700 && w.canBuild(this.team, 'apc') && this.count('apc') < 1 && this.count('engineer') > 0) w.startProduction(this.team, 'apc');
    const foeB = w.entities.filter(e => e.alive && e.team !== this.team && e.building && e.kind !== 'wall' && e.kind !== 'conyard');
    if (!foeB.length) return;
    const engs = w.entities.filter(e => e.alive && e.team === this.team && e.kind === 'engineer' && e.order.t === 'idle');
    const apc = w.entities.find(e => e.alive && e.team === this.team && e.kind === 'apc');
    const near = (u: Entity) => foeB.reduce((b, e) => (Math.hypot(e.x - u.x, e.y - u.y) < Math.hypot(b.x - u.x, b.y - u.y) ? e : b));
    if (apc && apc.riders.length) {
      const t = near(apc);
      if (Math.hypot(t.x - apc.x, t.y - apc.y) < 5 * TILE) w.unload(apc);
      else if (apc.order.t === 'idle') w.orderMove([apc], t.x, t.y);
    }
    for (const e of engs) {
      const t = near(e), far = Math.hypot(t.x - e.x, t.y - e.y) > 10 * TILE;
      if (apc && far && apc.riders.length < 3 && apc.order.t === 'idle') w.applyCommand(this.team, { c: 'board', ids: [e.id], t: apc.id });
      else w.applyCommand(this.team, { c: 'capture', ids: [e.id], t: t.id });
    }
  }

  /** Usa o superpoder sobre o maior aglomerado de tropas ou construções do jogador (Normal/Difícil). */
  private useSuper() {
    if (this.w.difficulty === 'easy' || this.ts.sp > 0 || !this.w.hasBuilding(this.team, 'radar')) return;
    const foes = this.w.entities.filter(e => e.alive && e.team !== this.team && !e.building || (e.alive && e.team !== this.team && e.building));
    let best: Entity | null = null, bs = 0;
    for (const f of foes) {
      let sc = 0;
      for (const o of foes) if (Math.hypot(o.x - f.x, o.y - f.y) < 5 * TILE) sc += o.building ? 1.5 : 1;
      if (sc > bs) { bs = sc; best = f; }
    }
    if (best && bs >= 5) this.w.superpower(this.team, best.x, best.y);
  }

  private economy(_saving: boolean) {
    const ts = this.ts;
    const q = ts.queues.structure[0];
    if (q && q.progress >= 1) {
      const p = this.w.findPlacement(this.team, q.kind);
      if (p) this.w.placeBuilding(this.team, q.kind, p.x, p.y, 0);
    }
  }

  private buildStructures(saving: boolean) {
    const ts = this.ts, w = this.w;
    if (ts.queues.structure.length) return;
    const order: Kind[] = [];
    if (ts.low || ts.usage + 40 > ts.power) order.push('power');
    if (this.count('refinery') < 1) order.push('refinery');
    if (this.count('barracks') < 1) order.push('barracks');
    if (this.count('factory') < 1) order.push('factory');
    if (this.count('radar') < 1) order.push('radar');
    if (this.count('refinery') < 2) order.push('refinery');
    if (this.count('turret') < 2) order.push('turret');
    if (this.count('power') < 3) order.push('power');
    if (this.count('barracks') < 2) order.push('barracks');
    if (this.count('aa') < 1 && this.humanHasAir()) order.push('aa');
    if (this.count('factory') < 2) order.push('factory');
    if (this.count('lab') < 1) order.push('lab');
    if (this.count('helipad') < 1) order.push('helipad');
    if (this.count('bunker') < 2) order.push('bunker');
    if (this.count('cannon') < 1 && this.count('turret') >= 2) order.push('cannon');
    if (this.count('turret') < 5) order.push('turret');
    if (this.count('power') < 5) order.push('power');
    for (const k of order) {
      if (saving && !(k === 'power' && ts.low)) continue; // guardando para o Extrator: só gera energia se faltar de fato
      if (!w.canBuild(this.team, k)) continue;
      if (ts.credits < DEFS[k].cost) continue;
      if (!w.findPlacement(this.team, k)) continue;
      w.startProduction(this.team, k);
      return;
    }
  }

  private humanHasAir(): boolean {
    return this.w.entities.some(e => e.team !== this.team && e.alive && e.def.armor === 'air');
  }

  private trainUnits(saving: boolean, wantHarv: number, harvs: number) {
    const ts = this.ts, w = this.w;
    const queued = (k: Kind) => ts.queues[DEFS[k].category].filter(i => i.kind === k).length;
    if (w.hasBuilding(this.team, 'factory') && harvs + queued('harvester') < wantHarv && ts.credits >= DEFS.harvester.cost) {
      w.startProduction(this.team, 'harvester');
      return;
    }
    const f = ts.faction;
    const fPick: Kind[] = f === 'ferro' ? ['tank', 'artillery', 'buggy', 'tank'] : f === 'solar' ? ['tank', 'prism', 'tank', 'buggy'] : f === 'viboras' ? ['raider', 'tank', 'raider', 'buggy'] : ['tank', 'cryo', 'tank', 'buggy'];
    const veh = fPick[Math.floor(Math.random() * fPick.length)];
    const inf: Kind[] = ['rifle', 'rocket', 'rifle', 'sniper', 'flamer', 'rocket'];
    const inf1 = inf[Math.floor(Math.random() * inf.length)];
    const tryProd = (k: Kind) => {
      if (!w.canBuild(this.team, k)) return false;
      if (ts.queues[DEFS[k].category].length >= 2) return false;
      if (ts.credits < DEFS[k].cost + 100) return false;
      return w.startProduction(this.team, k).ok;
    };
    if (this.humanHasAir() && (tryProd('flak') || tryProd('rocket'))) return;
    if (!saving) tryProd(inf1);
    if (!saving && !tryProd(veh)) tryProd('tank'); // guardando para o Extrator: não gasta em blindados
    if (this.army().length > 6 && !saving) tryProd(Math.random() < 0.5 ? 'heli' : Math.random() < 0.6 ? 'jet' : 'bomber');
    if (this.army().length > 4 && Math.random() < 0.25) tryProd('mlrs');
  }

  private upgrades() {
    this.upT += 1;
    if (this.upT < 8) return;
    this.upT = 0;
    const ts = this.ts;
    if (ts.credits < 900) return;
    const cands = this.w.entities.filter(e => e.team === this.team && e.alive && e.tech < 2 && (e.kind === 'power' || e.kind === 'refinery' || e.kind === 'tank' || e.kind === 'factory' || e.kind === 'barracks'));
    if (cands.length) this.w.upgrade(this.team, cands[Math.floor(Math.random() * cands.length)]);
  }

  private pickTarget(): Entity | null {
    const foes = this.w.entities.filter(e => e.team !== this.team && e.alive);
    if (!foes.length) return null;
    const mine = this.army();
    const cx = mine.reduce((s, u) => s + u.x, 0) / Math.max(1, mine.length);
    const cy = mine.reduce((s, u) => s + u.y, 0) / Math.max(1, mine.length);
    const pri = (e: Entity) => (e.kind === 'harvester' ? 0.6 : e.kind === 'refinery' ? 0.8 : e.def.damage > 0 && e.building ? 1.3 : 1);
    let best: Entity | null = null, bs = Infinity;
    for (const e of foes) {
      const s = Math.hypot(e.x - cx, e.y - cy) * pri(e);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  private attackLogic(need: number, frac: number) {
    const army = this.army();
    const idle = army.filter(u => u.order.t === 'idle' && u.def.armor !== 'air' || (u.def.armor === 'air' && u.order.t === 'idle'));
    if (idle.length >= need) {
      const tgt = this.pickTarget();
      if (!tgt) return;
      const n = Math.max(need, Math.floor(idle.length * frac));
      const sq = idle.slice(0, n);
      this.w.orderAMove(sq, Math.max(16, Math.min(MAP_W * TILE - 16, tgt.x)), Math.max(16, Math.min(MAP_H * TILE - 16, tgt.y)));
      this.attacks++;
      this.lastTarget = tgt;
      const foe = (1 - this.team) as Team;
      this.w.msg('⚠ Tropas inimigas avançando!', foe);
      this.w.sound('wave', foe);
    }
    // reforços: quem ficou ocioso longe da base junta-se ao ataque em andamento
    if (this.lastTarget && this.lastTarget.alive) {
      const lazy = army.filter(u => u.order.t === 'idle' && this.w.distTo(u, this.lastTarget!) > 12 * TILE);
      if (lazy.length >= 3) this.w.orderAMove(lazy, this.lastTarget.x, this.lastTarget.y);
    }
  }
}
