import { DEFS, Def, Kind, Team, Faction, FACTIONS, VET_KILLS } from '../config';

export type Order =
  | { t: 'idle' }
  | { t: 'move'; x: number; y: number }
  | { t: 'amove'; x: number; y: number }
  | { t: 'attack'; target: Entity }
  | { t: 'patrol'; x: number; y: number; ox: number; oy: number }
  | { t: 'hold' }
  | { t: 'capture'; target: Entity }
  | { t: 'board'; target: Entity };

export interface Rider { k: Kind; hp: number; kills: number; tech: number; vet: number }

export type HState = 'idle' | 'seek' | 'toCrystal' | 'harvest' | 'toRef' | 'unload';

export class Entity {
  static next = 1;
  id = Entity.next++;
  def: Def;
  alive = true;
  hp = 1;
  maxHp = 1;
  speed = 0;     // px/s
  range = 0;     // tiles
  sight = 0;     // tiles
  dmgMul = 1;
  tech = 1;      // evolução paga (1..3)
  vet = 1;       // veterania por abates (1..3)
  kills = 0;
  angle = 0;
  tx = 0; ty = 0;
  path: { x: number; y: number }[] = [];
  needPath = false;
  order: Order = { t: 'idle' };
  auto: Entity | null = null;
  cooldown = 0;
  scan = Math.random() * 0.3;
  repath = 0;
  cargo = 0;
  /** soldados dentro de um transporte */
  riders: Rider[] = [];
  hs: HState = 'idle';
  hTile = -1;
  bad = new Map<number, number>();
  // alvo de interpolação (cliente online)
  nx = 0; ny = 0; na = 0;

  constructor(public kind: Kind, public team: Team, public x: number, public y: number, public faction: Faction) {
    this.def = DEFS[kind];
    this.nx = x; this.ny = y;
    this.recalc(false);
  }

  get building(): boolean { return this.def.building; }
  get radius(): number { return this.def.building ? Math.max(this.def.w, this.def.h) * 16 : this.def.radius; }
  get level(): number { return this.tech; }

  /** Recalcula atributos a partir de facção + evolução (tech) + veterania (vet). */
  recalc(keepRatio = true) {
    const f = FACTIONS[this.faction], d = this.def;
    const tier = 1 + 0.25 * (this.tech - 1) + 0.25 * (this.vet - 1);
    const inf = d.category === 'infantry';
    const base = d.hp * (inf ? 1 : f.hpMul);
    const max = Math.round(base * tier);
    this.hp = keepRatio && this.maxHp > 0 ? (this.hp / this.maxHp) * max : max;
    this.maxHp = max;
    this.speed = d.speed * f.speedMul * (1 + 0.05 * (this.tech - 1));
    this.range = d.range * (inf && d.kind !== 'rocket' ? 1 : d.building ? 1 : f.rangeMul) * (1 + 0.04 * (this.tech + this.vet - 2));
    this.dmgMul = 1 + 0.2 * (this.tech - 1) + 0.2 * (this.vet - 1);
    this.sight = d.sight * (d.kind === 'radar' ? 1 + 0.15 * (this.tech - 1) : 1);
  }

  vetFromKills(): number {
    let v = 1;
    for (let i = 1; i < VET_KILLS.length; i++) if (this.kills >= VET_KILLS[i]) v = i + 1;
    return v;
  }
}
