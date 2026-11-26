import {
  DEFS, KINDS, CATEGORIES, Kind, Category, Team, Faction, Difficulty, DIFFS, FACTIONS, MAPS, TILE, MAP_W, MAP_H,
  HARVEST_CAP, HARVEST_RATE, UNLOAD_RATE, PROJ_SPEED, ProjectileKind, Armor, MAX_TECH, VET_NAMES,
} from '../config';
import { Entity } from '../entities/Entity';
import { findPath, Pt } from './Pathfinding';
import { generateMap, MapData } from './MapGen';
import { AI } from './AI';

export interface QueueItem { kind: Kind; progress: number; notified?: boolean }
export interface TeamState {
  faction: Faction;
  credits: number;
  power: number;
  usage: number;
  low: boolean;
  speedMul: number;
  incomeMul: number;
  queues: Record<Category, QueueItem[]>;
  kills: number;
  built: number;
  sp: number;      // recarga do superpoder (s)
  rally: Pt | null;
}
/** Superpoder: recarga em segundos; exige Central de Radar. */
export const SP_CD = 150;
export const SP_START = 60;
export const SP_RADIUS = 5.5; // tiles
export interface Strike { t: number; x: number; y: number; dmg: number; r: number; team: Team; big: boolean }
export interface Projectile {
  x: number; y: number; target: Entity | null; raw: number; vs: Record<Armor, number>;
  speed: number; kind: ProjectileKind; team: Team; angle: number; owner: Entity | null; splash: number;
}
export type Fx =
  | { t: 'boom'; x: number; y: number; s: number }
  | { t: 'muzzle'; x: number; y: number; a: number; k: ProjectileKind | 'flame' }
  | { t: 'hit'; x: number; y: number }
  | { t: 'rank'; x: number; y: number; v: number };
export type SoundId = 'alert' | 'lowpower' | 'ready' | 'wave' | 'rank';
export interface TeamMsg { team: Team; text: string }
export interface TeamSound { team: Team; s: SoundId; k?: Kind }

export type Cmd =
  | { c: 'prod'; k: Kind }
  | { c: 'cancel'; k: Kind }
  | { c: 'place'; k: Kind; x: number; y: number }
  | { c: 'move' | 'amove'; ids: number[]; x: number; y: number }
  | { c: 'atk'; ids: number[]; t: number }
  | { c: 'stop' | 'sell' | 'up' | 'rep'; ids: number[] }
  | { c: 'sp'; x: number; y: number }
  | { c: 'rally'; x: number; y: number }
  | { c: 'patrol'; ids: number[]; x: number; y: number }
  | { c: 'hold' | 'unload'; ids: number[] }
  | { c: 'capture' | 'board'; ids: number[]; t: number }
  | { c: 'wall'; pts: [number, number][] };

export interface Snapshot {
  tm: number;
  w: Team | null;
  t: { c: number; p: number; u: number; l: boolean; k: number; sp?: number; q: Record<Category, [Kind, number][]> }[];
  e: number[][];
  p: number[][];
  fx: Fx[];
  m: TeamMsg[];
  s: TeamSound[];
}

export interface WorldOpts {
  mapId: string;
  difficulty: Difficulty;
  faction: Faction;
  enemyFaction?: Faction;
  vsAI?: boolean;
  bare?: boolean;          // missões: não cria as bases padrão
  customWin?: boolean;     // missões: a vitória/derrota é decidida pelo script
  startCredits?: number;
  enemyCredits?: number;
  mirror?: boolean;
  viewTeam?: Team;
  seed?: number;
  noSuper?: boolean;
  noFog?: boolean;
}

const N = MAP_W * MAP_H;
const clampTile = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(v)));
const angDiff = (a: number, b: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const r1 = (v: number) => Math.round(v * 10) / 10;

export class World {
  terrain: Uint8Array;
  crystal: Float32Array;
  crystalMax: Uint16Array;
  occ = new Uint8Array(N);
  entities: Entity[] = [];
  projectiles: Projectile[] = [];
  teams: TeamState[];
  /** Nível de evolução por tipo: melhorar um equipamento melhora todos do mesmo tipo (e os futuros). */
  kindTech: Partial<Record<Kind, number>>[] = [{}, {}];
  time = 0;
  fx: Fx[] = [];
  messages: TeamMsg[] = [];
  sounds: TeamSound[] = [];
  explored = new Uint8Array(N);
  visible = new Uint8Array(N);
  winner: Team | null = null;
  customWin = false;
  harvested = [0, 0];
  ais: AI[] = [];
  crystalRev = 0;
  difficulty: Difficulty;
  viewTeam: Team;
  mirror: boolean;
  private fogT = 0;
  private regenT = 0;
  private checkT = 0;
  lastAlert: ({ x: number; y: number } | null)[] = [null, null];
  private lastWarn = [-99, -99];
  private lastLow = [false, false];

  constructor(opts: WorldOpts) {
    Entity.next = 1;
    this.difficulty = opts.difficulty;
    this.viewTeam = opts.viewTeam ?? 0;
    this.mirror = !!opts.mirror;
    const map = MAPS.find(m => m.id === opts.mapId) ?? MAPS[0];
    const md: MapData = generateMap(opts.seed ?? map.seed, map.rocks, map.water ?? 0.4);
    this.customWin = !!opts.customWin; this.noFog = !!opts.noFog; this.noSuper = !!opts.noSuper;
    this.terrain = md.terrain; this.crystal = md.crystal; this.crystalMax = md.crystalMax;
    const enemy: Faction = opts.enemyFaction ?? (opts.faction === 'solar' ? 'ferro' : 'solar');
    const vsAI = opts.vsAI !== false;
    const d = DIFFS[opts.difficulty];
    const mk = (f: Faction, speedMul: number, incomeMul: number, cr: number): TeamState => ({
      faction: f, credits: cr, power: 0, usage: 0, low: false, speedMul, incomeMul,
      queues: { structure: [], infantry: [], vehicle: [], air: [] }, kills: 0, built: 0, sp: SP_START, rally: null,
    });
    this.teams = [mk(opts.faction, 1, FACTIONS[opts.faction].inc, opts.startCredits ?? 2000), mk(enemy, vsAI ? d.speed : 1, (vsAI ? d.income : 1) * FACTIONS[enemy].inc, opts.enemyCredits ?? 2000)];
    if (!this.mirror && !opts.bare) {
      this.defaultLayout(0); this.defaultLayout(1);
      if (vsAI) this.ais.push(new AI(this, 1));
    }
    this.updatePower();
    this.updateFog();
  }

  // ---------- helpers ----------
  idx(tx: number, ty: number) { return ty * MAP_W + tx; }
  blocked = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    const i = ty * MAP_W + tx;
    return this.terrain[i] !== 0 || this.occ[i] !== 0;
  };
  strikes: Strike[] = [];
  repairLock = new Map<number, number>();
  msg(text: string, team: Team) { this.messages.push({ team, text }); }
  sound(s: SoundId, team: Team, k?: Kind) { this.sounds.push({ team, s, k }); }
  buildings(team: Team): Entity[] { return this.entities.filter(e => e.team === team && e.building && e.alive); }
  units(team: Team): Entity[] { return this.entities.filter(e => e.team === team && !e.building && e.alive); }
  hasBuilding(team: Team, k: Kind) { return this.entities.some(e => e.team === team && e.kind === k && e.alive); }
  byIds(team: Team, ids: number[]): Entity[] {
    const set = new Set(ids);
    return this.entities.filter(e => set.has(e.id) && e.team === team && e.alive);
  }

  canHit(a: Entity, t: Entity): boolean {
    const tg = a.def.targets;
    if (a.def.damage <= 0) return false;
    return tg === 'both' || (tg === 'air' ? t.def.armor === 'air' : t.def.armor !== 'air');
  }

  distTo(e: Entity, t: Entity): number {
    if (t.building) {
      const x0 = t.tx * TILE, y0 = t.ty * TILE, x1 = x0 + t.def.w * TILE, y1 = y0 + t.def.h * TILE;
      const dx = Math.max(x0 - e.x, 0, e.x - x1), dy = Math.max(y0 - e.y, 0, e.y - y1);
      return Math.hypot(dx, dy);
    }
    return Math.hypot(e.x - t.x, e.y - t.y);
  }

  /** Base inicial padrão (centro, gerador, refinaria, colheitadeira e 2 fuzileiros). */
  defaultLayout(team: Team) {
    const layout: [Kind, number, number][] = [['conyard', 7, 50], ['power', 11, 50], ['refinery', 7, 54]];
    for (const [k, tx, ty] of layout) {
      const def = DEFS[k];
      const x = team === 0 ? tx : MAP_W - tx - def.w;
      const y = team === 0 ? ty : MAP_H - ty - def.h;
      const b = this.addBuilding(team, k, x, y);
      if (k === 'refinery') this.spawnNear(team, 'harvester', b);
    }
    const cy = this.entities.find(e => e.team === team && e.kind === 'conyard')!;
    for (let i = 0; i < 2; i++) this.spawnNear(team, 'rifle', cy);
    this.updatePower(); this.updateFog();
  }

  /** Procura (em espiral) um local livre para um prédio perto de (tx, ty). */
  spotFor(kind: Kind, tx: number, ty: number): Pt | null {
    const d = DEFS[kind];
    for (let r = 0; r <= 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = tx + dx, y = ty + dy;
      let ok = x > 1 && y > 1 && x + d.w < MAP_W - 1 && y + d.h < MAP_H - 1;
      for (let j = y - 1; ok && j < y + d.h + 1; j++) for (let i = x - 1; ok && i < x + d.w + 1; i++) {
        const k = this.idx(i, j);
        if (this.terrain[k] !== 0 || this.occ[k] !== 0 || this.crystalMax[k] > 0) ok = false;
      }
      if (ok) return { x, y };
    }
    return null;
  }

  /** Cria um prédio por script (missões) perto de (tx, ty). */
  buildAt(team: Team, kind: Kind, tx: number, ty: number): Entity | null {
    const sp = this.spotFor(kind, tx, ty);
    return sp ? this.addBuilding(team, kind, sp.x, sp.y) : null;
  }

  /** Cria uma unidade por script perto do tile (tx, ty). */
  unitAt(team: Team, kind: Kind, tx: number, ty: number): Entity | null {
    const air = DEFS[kind].armor === 'air';
    for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = tx + dx, y = ty + dy;
      if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
      if (!air && this.blocked(x, y)) continue;
      if (this.entities.some(u => !u.building && u.alive && Math.floor(u.x / TILE) === x && Math.floor(u.y / TILE) === y)) continue;
      const u = this.born(new Entity(kind, team, (x + 0.5) * TILE, (y + 0.5) * TILE, this.teams[team].faction));
      this.entities.push(u);
      return u;
    }
    return null;
  }

  addBuilding(team: Team, kind: Kind, tx: number, ty: number): Entity {
    const def = DEFS[kind];
    const e = this.born(new Entity(kind, team, (tx + def.w / 2) * TILE, (ty + def.h / 2) * TILE, this.teams[team].faction));
    e.tx = tx; e.ty = ty;
    for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) this.occ[this.idx(x, y)] = 1;
    this.entities.push(e);
    return e;
  }

  spawnNear(team: Team, kind: Kind, b: Entity): Entity | null {
    const def = b.def;
    const gx = b.tx + Math.floor(def.w / 2), gy = b.ty + def.h;
    const air = DEFS[kind].armor === 'air';
    const free = (x: number, y: number) => (air ? x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1 : !this.blocked(x, y)) && !this.entities.some(
      u => !u.building && Math.floor(u.x / TILE) === x && Math.floor(u.y / TILE) === y);
    let best: Pt | null = null, bd = Infinity;
    for (let r = 0; r <= 6 && !best; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = gx + dx, y = gy + dy;
        if (!free(x, y)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { x, y }; }
      }
    }
    if (!best) return null;
    const u = this.born(new Entity(kind, team, (best.x + 0.5) * TILE, (best.y + 0.5) * TILE, this.teams[team].faction));
    this.entities.push(u);
    return u;
  }

  // ---------- produção / energia / evolução ----------
  canBuild(team: Team, kind: Kind): boolean {
    const d = DEFS[kind];
    if (d.cost <= 0) return false;
    if (d.only && d.only !== this.teams[team].faction) return false;
    return d.req.every(r => this.hasBuilding(team, r));
  }

  prodError(team: Team, kind: Kind): string | undefined {
    const d = DEFS[kind];
    const t = this.teams[team];
    const q = t.queues[d.category];
    if (!this.canBuild(team, kind)) return 'Requisito não atendido';
    if (d.category === 'structure' && q.length > 0) return 'Já há uma construção em andamento';
    if (q.length >= 5) return 'Fila cheia';
    if (t.credits < d.cost) return 'Créditos insuficientes';
    return undefined;
  }

  startProduction(team: Team, kind: Kind): { ok: boolean; msg?: string } {
    const err = this.prodError(team, kind);
    if (err) return { ok: false, msg: err };
    const d = DEFS[kind];
    this.teams[team].credits -= d.cost;
    this.teams[team].queues[d.category].push({ kind, progress: 0 });
    return { ok: true };
  }

  cancelProduction(team: Team, kind: Kind) {
    const d = DEFS[kind];
    const q = this.teams[team].queues[d.category];
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i].kind === kind) { q.splice(i, 1); this.teams[team].credits += d.cost; return; }
    }
  }

  /** Entidade nova já nasce com a evolução do seu tipo. */
  private born(e: Entity): Entity {
    const t = this.kindTech[e.team][e.kind];
    if (t && t > e.tech) { e.tech = t; e.recalc(false); }
    return e;
  }

  upgradeCost(e: Entity): number {
    const base = e.def.cost > 0 ? e.def.cost : 1000;
    return Math.round(base * 0.6 * e.tech);
  }

  upgradeError(team: Team, e: Entity): string | undefined {
    if (!e.alive || e.team !== team) return 'Alvo inválido';
    if (e.tech >= MAX_TECH) return `${e.def.name}: nível máximo`;
    if (e.tech >= 2 && !this.hasBuilding(team, 'lab')) return 'O Nível 3 requer um Laboratório Tecnológico';
    if (this.teams[team].credits < this.upgradeCost(e)) return 'Créditos insuficientes';
    return undefined;
  }

  upgrade(team: Team, e: Entity): { ok: boolean; msg?: string } {
    const err = this.upgradeError(team, e);
    if (err) return { ok: false, msg: err };
    this.teams[team].credits -= this.upgradeCost(e);
    const nt = e.tech + 1;
    this.kindTech[team][e.kind] = nt;
    let first = true;
    for (const u of this.entities) {
      if (!u.alive || u.team !== team || u.kind !== e.kind || u.tech >= nt) continue;
      u.tech = nt; u.recalc(true);
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.2);
      if (first || u === e) { this.fx.push({ t: 'rank', x: u.x, y: u.y, v: u.tech }); first = false; }
    }
    if (e.building) this.updatePower();
    return { ok: true };
  }

  updatePower() {
    for (const team of [0, 1] as Team[]) {
      const t = this.teams[team];
      const mul = FACTIONS[t.faction].powerMul;
      let p = 0, u = 0;
      for (const e of this.entities) {
        if (e.team !== team || !e.building || !e.alive) continue;
        if (e.def.power > 0) p += e.def.power * mul * (1 + 0.25 * (e.tech - 1)); else u -= e.def.power;
      }
      t.power = Math.round(p); t.usage = u; t.low = u > p;
      if (t.low && !this.lastLow[team]) { this.msg('⚠ Energia baixa! Construa ou evolua um Gerador.', team); this.sound('lowpower', team); }
      this.lastLow[team] = t.low;
    }
  }

  private prodMul(team: Team, cat: Category): number {
    const kind: Kind = cat === 'structure' ? 'conyard' : cat === 'infantry' ? 'barracks' : cat === 'vehicle' ? 'factory' : 'helipad';
    let tech = 1;
    for (const e of this.entities) if (e.team === team && e.kind === kind && e.alive) tech = Math.max(tech, e.tech);
    return 1 + 0.25 * (tech - 1);
  }

  private production(dt: number) {
    for (const team of [0, 1] as Team[]) {
      const t = this.teams[team];
      for (const cat of CATEGORIES) {
        const head = t.queues[cat][0];
        if (!head) continue;
        const d = DEFS[head.kind];
        const rate = (1 / d.buildTime) * (t.low ? 0.5 : 1) * t.speedMul * this.prodMul(team, cat);
        head.progress = Math.min(1, head.progress + rate * dt);
        if (cat === 'structure') {
          if (head.progress >= 1 && !head.notified) {
            head.notified = true;
            this.msg(`${d.name} pronto — toque no mapa para posicionar`, team); this.sound('ready', team, head.kind);
          }
          continue;
        }
        if (head.progress < 1) continue;
        const prod = this.entities.find(e => e.team === team && e.alive && e.kind === d.producer);
        if (!prod) continue;
        const nu = this.spawnNear(team, head.kind, prod);
        if (nu) {
          if (t.rally && nu.kind !== 'harvester' && nu.def.damage > 0) { nu.order = { t: 'amove', x: t.rally.x, y: t.rally.y }; nu.needPath = true; }
          t.queues[cat].shift(); t.built++;
          this.sound('ready', team, nu.kind);
        }
      }
    }
  }

  canPlace(team: Team, kind: Kind, tx: number, ty: number, margin = 0): boolean {
    const d = DEFS[kind];
    for (let y = ty - margin; y < ty + d.h + margin; y++) {
      for (let x = tx - margin; x < tx + d.w + margin; x++) {
        const inside = x >= tx && x < tx + d.w && y >= ty && y < ty + d.h;
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) { if (inside) return false; continue; }
        const i = this.idx(x, y);
        if (inside) {
          if (this.terrain[i] !== 0 || this.occ[i] !== 0 || this.crystalMax[i] > 0) return false;
        } else if (this.occ[i] !== 0) return false;
      }
    }
    for (const u of this.entities) {
      if (u.building || !u.alive || u.def.armor === 'air') continue;
      const ux = Math.floor(u.x / TILE), uy = Math.floor(u.y / TILE);
      if (ux >= tx && ux < tx + d.w && uy >= ty && uy < ty + d.h) return false;
    }
    for (const b of this.entities) {
      if (b.team !== team || !b.building || !b.alive) continue;
      const gx = Math.max(b.tx - (tx + d.w), tx - (b.tx + b.def.w), 0);
      const gy = Math.max(b.ty - (ty + d.h), ty - (b.ty + b.def.h), 0);
      if (Math.max(gx, gy) <= 6) return true;
    }
    return false;
  }

  placeBuilding(team: Team, kind: Kind, tx: number, ty: number, margin = 0): Entity | null {
    const q = this.teams[team].queues.structure;
    const head = q[0];
    if (!head || head.kind !== kind || head.progress < 1) return null;
    if (!this.canPlace(team, kind, tx, ty, margin)) return null;
    const e = this.addBuilding(team, kind, tx, ty);
    q.shift();
    this.teams[team].built++;
    if (kind === 'refinery') this.spawnNear(team, 'harvester', e);
    this.updatePower();
    return e;
  }

  /** casa livre para um trecho de muro (sem checar distância da base) — usado na prévia */
  wallTileFree(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    const i = this.idx(tx, ty);
    if (this.terrain[i] !== 0 || this.occ[i] !== 0 || this.crystalMax[i] > 0) return false;
    for (const u of this.entities) if (!u.building && u.alive && u.def.armor !== 'air' && Math.floor(u.x / TILE) === tx && Math.floor(u.y / TILE) === ty) return false;
    return true;
  }

  /** Muro desenhado de uma vez: cada trecho é cobrado e erguido na hora, em ordem, para que um trecho novo
   *  sirva de apoio ao seguinte (a linha pode se afastar da base). Para quando o dinheiro acaba. */
  buildWallLine(team: Team, pts: [number, number][]): string | undefined {
    if (!this.canBuild(team, 'wall')) return 'Requisito não atendido';
    const t = this.teams[team], cost = DEFS.wall.cost;
    let ok = 0, poor = false;
    for (const [tx, ty] of pts.slice(0, 40)) {
      if (t.credits < cost) { poor = true; break; }
      if (!this.canPlace(team, 'wall', tx, ty, 0)) continue;
      t.credits -= cost; this.addBuilding(team, 'wall', tx, ty); t.built++; ok++;
    }
    if (ok) this.updatePower();
    if (!ok) return poor ? 'Créditos insuficientes' : 'Local inválido: perto da base e em terreno livre';
    if (poor) return `Créditos acabaram: ${ok} trecho(s) de muro construído(s)`;
    return undefined;
  }

  findPlacement(team: Team, kind: Kind, margin = 1): Pt | null {
    const cy = this.entities.find(e => e.team === team && e.kind === 'conyard' && e.alive) ?? this.buildings(team)[0];
    if (!cy) return null;
    const d = DEFS[kind];
    let best: Pt | null = null, bd = Infinity;
    for (let ty = cy.ty - 9; ty <= cy.ty + 9; ty++) for (let tx = cy.tx - 9; tx <= cy.tx + 9; tx++) {
      if (!this.canPlace(team, kind, tx, ty, kind === 'wall' ? 0 : margin)) continue;
      const dist = Math.hypot(tx + d.w / 2 - cy.x / TILE, ty + d.h / 2 - cy.y / TILE);
      if (dist < 3.5) continue;
      if (dist < bd) { bd = dist; best = { x: tx, y: ty }; }
    }
    return best;
  }

  sellBuilding(team: Team, e: Entity): boolean {
    if (!e.alive || !e.building || e.team !== team || e.kind === 'conyard') return false;
    const base = e.def.cost;
    this.teams[team].credits += Math.floor(base * 0.5 * (1 + 0.5 * (e.tech - 1)));
    e.alive = false;
    for (let y = e.ty; y < e.ty + e.def.h; y++) for (let x = e.tx; x < e.tx + e.def.w; x++) this.occ[this.idx(x, y)] = 0;
    this.fx.push({ t: 'boom', x: e.x, y: e.y, s: 0.8 });
    this.updatePower();
    return true;
  }

  // ---------- ordens / comandos ----------
  stopUnits(units: Entity[]) {
    for (const u of units) {
      if (u.building) continue;
      u.order = { t: 'idle' }; u.path = []; u.auto = null; u.needPath = false;
      if (u.kind === 'harvester') u.hs = 'idle';
    }
  }
  orderMove(units: Entity[], x: number, y: number) {
    const n = units.length;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    units.forEach((u, i) => {
      const cx = (i % cols) - (cols - 1) / 2, cy = Math.floor(i / cols) - (rows - 1) / 2;
      u.order = { t: 'move', x: Math.max(16, Math.min(MAP_W * TILE - 16, x + cx * 28)), y: Math.max(16, Math.min(MAP_H * TILE - 16, y + cy * 28)) };
      u.needPath = true; u.auto = null; u.path = [];
    });
  }
  orderAMove(units: Entity[], x: number, y: number) {
    for (const u of units) {
      if (u.def.damage <= 0) continue;
      u.order = { t: 'amove', x, y }; u.needPath = true; u.auto = null; u.path = [];
    }
  }
  orderAttack(units: Entity[], target: Entity) {
    for (const u of units) {
      if (u.def.damage <= 0 || u.building || !this.canHit(u, target)) continue;
      u.order = { t: 'attack', target }; u.path = []; u.repath = 0; u.auto = null;
    }
  }

  /** Executa um comando de um jogador (local, IA remota ou amigo online). Retorna uma mensagem de erro, se houver. */
  applyCommand(team: Team, c: Cmd): string | undefined {
    switch (c.c) {
      case 'prod': { const r = this.startProduction(team, c.k); return r.ok ? undefined : r.msg; }
      case 'cancel': this.cancelProduction(team, c.k); return;
      case 'place': return this.placeBuilding(team, c.k, c.x, c.y) ? undefined : 'Local inválido';
      case 'wall': return this.buildWallLine(team, c.pts);
      case 'move': this.orderMove(this.byIds(team, c.ids).filter(e => !e.building), c.x, c.y); return;
      case 'amove': this.orderAMove(this.byIds(team, c.ids).filter(e => !e.building), c.x, c.y); return;
      case 'atk': {
        const t = this.entities.find(e => e.id === c.t && e.alive && e.team !== team);
        const us = this.byIds(team, c.ids).filter(e => !e.building);
        if (t) {
          this.orderAttack(us, t);
          const eng = us.filter(u => u.kind === 'engineer');
          if (t.building && t.kind !== 'wall' && eng.length) { for (const u of eng) { u.order = { t: 'capture', target: t }; u.path = []; u.repath = 0; u.auto = null; } }
          this.orderMove(us.filter(u => u.def.damage <= 0 && u.kind !== 'engineer'), t.x, t.y);
        }
        return;
      }
      case 'patrol': for (const u of this.byIds(team, c.ids).filter(e => !e.building && e.def.damage > 0)) { u.order = { t: 'patrol', x: c.x, y: c.y, ox: u.x, oy: u.y }; u.needPath = true; u.auto = null; u.path = []; } return;
      case 'hold': for (const u of this.byIds(team, c.ids).filter(e => !e.building && e.def.damage > 0)) { u.order = { t: 'hold' }; u.path = []; u.auto = null; u.needPath = false; } return;
      case 'capture': {
        const t = this.entities.find(e => e.id === c.t && e.alive && e.team !== team && e.building && e.kind !== 'wall');
        if (!t) return 'Só é possível capturar construções inimigas';
        for (const u of this.byIds(team, c.ids).filter(e => e.kind === 'engineer')) { u.order = { t: 'capture', target: t }; u.path = []; u.repath = 0; u.auto = null; }
        return;
      }
      case 'board': {
        const t = this.entities.find(e => e.id === c.t && e.alive && e.team === team && e.kind === 'apc');
        if (!t) return;
        for (const u of this.byIds(team, c.ids).filter(e => e.def.category === 'infantry')) { u.order = { t: 'board', target: t }; u.path = []; u.repath = 0; u.auto = null; }
        return;
      }
      case 'unload': for (const a of this.byIds(team, c.ids).filter(e => e.kind === 'apc')) this.unload(a); return;
      case 'stop': this.stopUnits(this.byIds(team, c.ids)); return;
      case 'sell': for (const e of this.byIds(team, c.ids)) this.sellBuilding(team, e); return;
      case 'rep': return this.repair(team, this.byIds(team, c.ids).filter(e => e.building));
      case 'sp': return this.superpower(team, c.x, c.y);
      case 'rally': this.teams[team].rally = { x: c.x, y: c.y }; return;
      case 'up': {
        let err: string | undefined;
        for (const e of this.byIds(team, c.ids)) { const r = this.upgrade(team, e); if (!r.ok) err = r.msg; }
        return err;
      }
    }
  }

  /** desembarca todos os soldados de um transporte */
  unload(a: Entity) {
    if (!a.riders.length) return;
    a.riders.forEach((r, i) => {
      const ang = (i / Math.max(1, a.riders.length)) * 6.2832 + 0.6, d = a.radius + 12;
      const nu = new Entity(r.k, a.team, a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d, a.faction);
      nu.tech = r.tech; nu.vet = r.vet; nu.kills = r.kills; nu.recalc(false); nu.hp = Math.min(nu.maxHp, r.hp);
      this.entities.push(nu);
    });
    a.riders = []; a.cargo = 0;
    this.fx.push({ t: 'rank', x: a.x, y: a.y, v: 1 });
  }

  /** ordens que envolvem um alvo especial: capturar construção (engenheiro) e embarcar em transporte */
  private serviceOrder(e: Entity, dt: number) {
    const o = e.order; if (o.t !== 'capture' && o.t !== 'board') return;
    const tg = o.target;
    if (!tg.alive || (o.t === 'capture' && tg.team === e.team)) { e.order = { t: 'idle' }; e.path = []; return; }
    const dd = Math.hypot(tg.x - e.x, tg.y - e.y), reach = e.radius + tg.radius + (e.path.length === 0 && e.repath > 0 ? 40 : 22);
    if (dd <= reach) {
      if (o.t === 'capture') {
        tg.team = e.team; tg.faction = e.faction; tg.recalc(true);
        for (const u of this.entities) { if (u.auto === tg) u.auto = null; if (u.order.t === 'attack' && u.order.target === tg && u.team === e.team) u.order = { t: 'idle' }; }
        this.fx.push({ t: 'boom', x: tg.x, y: tg.y, s: 1.1 }); this.fx.push({ t: 'rank', x: tg.x, y: tg.y, v: 3 });
        this.msg(`${tg.def.name} capturado!`, e.team);
        e.alive = false; this.updatePower(); this.updateFog();
      } else if (tg.riders.length < 5) {
        tg.riders.push({ k: e.kind, hp: e.hp, kills: e.kills, tech: e.tech, vet: e.vet }); tg.cargo = tg.riders.length;
        e.alive = false;
      } else e.order = { t: 'idle' };
      return;
    }
    if (e.repath <= 0 || e.path.length === 0) { e.repath = 0.6; e.path = this.pathTo(e, tg.x, tg.y) ?? []; }
    this.follow(e, dt);
  }

  /** Reparo instantâneo: +35% de vida por 12% do custo (cada prédio, 4 s de intervalo). */
  repair(team: Team, bs: Entity[]): string | undefined {
    let err: string | undefined, did = 0;
    for (const b of bs) {
      if (b.hp >= b.maxHp - 1) { err = 'Construção já está com a vida cheia'; continue; }
      if ((this.repairLock.get(b.id) ?? 0) > this.time) { err = 'Reparo em recarga'; continue; }
      const cost = Math.max(20, Math.round((b.def.cost || 1000) * 0.12));
      if (this.teams[team].credits < cost) { err = 'Créditos insuficientes'; continue; }
      this.teams[team].credits -= cost;
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.35);
      this.repairLock.set(b.id, this.time + 4); did++;
      this.fx.push({ t: 'rank', x: b.x, y: b.y, v: 1 });
    }
    return did ? undefined : err;
  }

  superpower(team: Team, x: number, y: number): string | undefined {
    const t = this.teams[team];
    if (this.noSuper) return 'Superpoderes desligados nesta partida';
    if (!this.hasBuilding(team, 'radar')) return 'O superpoder requer uma Central de Radar';
    if (t.sp > 0) return `Superpoder recarregando (${Math.ceil(t.sp)}s)`;
    t.sp = SP_CD;
    const solar = FACTIONS[t.faction].power === 'pulse';
    if (solar) {
      // Pulso Solar: feixe orbital que castiga a área por ~3 s
      for (let i = 0; i < 6; i++) this.strikes.push({ t: i * 0.5, x, y, dmg: 90, r: SP_RADIUS * TILE, team, big: true });
    } else {
      // Barragem de Artilharia: 14 obuses espalhados
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * SP_RADIUS * TILE;
        this.strikes.push({ t: 0.6 + i * 0.3, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, dmg: 110, r: 2.6 * TILE, team, big: false });
      }
    }
    this.msg(solar ? '☀ Pulso Solar lançado!' : '💥 Barragem de Artilharia iniciada!', team);
    this.sound('wave', team);
    return;
  }

  private updateStrikes(dt: number) {
    if (!this.strikes.length) return;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const k = this.strikes[i];
      k.t -= dt;
      if (k.t > 0) continue;
      this.strikes.splice(i, 1);
      this.fx.push({ t: 'boom', x: k.x, y: k.y, s: k.big ? 2.2 : 1.6 });
      for (const e of this.entities.slice()) {
        if (!e.alive || e.team === k.team) continue;
        const d = Math.hypot(e.x - k.x, e.y - k.y);
        if (d < k.r + (e.building ? 20 : 0)) this.damage(e, k.dmg * (1 - 0.5 * d / (k.r + 20)) * (e.building ? 0.55 : 1), k.team, null);
      }
    }
  }

  entityAt(x: number, y: number, canSee: (e: Entity) => boolean): Entity | null {
    let best: Entity | null = null, bd = Infinity;
    for (const e of this.entities) {
      if (!e.alive || !canSee(e)) continue;
      if (e.building) {
        const x0 = e.tx * TILE, y0 = e.ty * TILE;
        if (x >= x0 && x <= x0 + e.def.w * TILE && y >= y0 && y <= y0 + e.def.h * TILE && bd > 1e8) { best = e; bd = 1e9; }
      } else {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d <= e.radius + 8 && d < bd) { best = e; bd = d; }
      }
    }
    return best;
  }

  // ---------- pathing ----------
  pathTo(e: Entity, gx: number, gy: number, exact = false): Pt[] | null {
    if (e.def.armor === 'air') return [{ x: Math.max(16, Math.min(MAP_W * TILE - 16, gx)), y: Math.max(16, Math.min(MAP_H * TILE - 16, gy)) }];
    const sx = clampTile(e.x / TILE, MAP_W), sy = clampTile(e.y / TILE, MAP_H);
    const tx = clampTile(gx / TILE, MAP_W), ty = clampTile(gy / TILE, MAP_H);
    const p = findPath(sx, sy, tx, ty, this.blocked);
    if (!p) return null;
    const out = p.map(t => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE }));
    if (exact && out.length) {
      const l = p[p.length - 1];
      if (l.x === tx && l.y === ty) out[out.length - 1] = { x: gx, y: gy };
    }
    return out;
  }

  private follow(e: Entity, dt: number) {
    if (!e.path.length) return;
    const w = e.path[0];
    const dx = w.x - e.x, dy = w.y - e.y;
    const d = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    const turn = e.def.category === 'infantry' ? 12 : 6;
    const diff = angDiff(e.angle, want);
    const step = turn * dt;
    e.angle += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    const slow = Math.abs(diff) > 1.4 && e.def.category !== 'infantry' && e.def.armor !== 'air';
    const sp = e.speed * dt * (slow ? 0.35 : 1);
    if (d <= sp) { e.x = w.x; e.y = w.y; e.path.shift(); }
    else { e.x += (dx / d) * sp; e.y += (dy / d) * sp; }
  }

  private faceTo(e: Entity, t: Entity, dt: number) {
    const want = Math.atan2(t.y - e.y, t.x - e.x);
    const diff = angDiff(e.angle, want);
    const step = 10 * dt;
    e.angle += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
  }

  nearestEnemy(e: Entity, maxDist: number): Entity | null {
    let best: Entity | null = null, bd = maxDist;
    for (const o of this.entities) {
      if (!o.alive || o.team === e.team || !this.canHit(e, o)) continue;
      const d = this.distTo(e, o);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  private fire(e: Entity, t: Entity) {
    const d = e.def;
    e.cooldown = d.cooldown;
    const a = Math.atan2(t.y - e.y, t.x - e.x);
    this.projectiles.push({
      x: e.x + Math.cos(a) * (e.radius * 0.6), y: e.y + Math.sin(a) * (e.radius * 0.6),
      target: t, raw: d.damage * e.dmgMul, vs: d.vs, speed: PROJ_SPEED[d.projectile], kind: d.projectile,
      team: e.team, angle: a, owner: e, splash: d.splash,
    });
    this.fx.push({ t: 'muzzle', x: e.x + Math.cos(a) * e.radius, y: e.y + Math.sin(a) * e.radius, a, k: e.kind === 'flamer' ? 'flame' : d.projectile });
  }

  damage(t: Entity, amount: number, from: Team, owner: Entity | null) {
    if (!t.alive) return;
    t.hp -= amount;
    if (from !== t.team) this.lastAlert[t.team] = { x: t.x, y: t.y };
    if (from !== t.team && this.time - this.lastWarn[t.team] > 12) {
      this.lastWarn[t.team] = this.time; this.msg('⚠ Base sob ataque!', t.team); this.sound('alert', t.team);
    }
    if (t.hp <= 0) this.destroy(t, from, owner);
  }

  private destroy(t: Entity, from: Team, owner: Entity | null) {
    t.alive = false;
    this.teams[from].kills++;
    if (owner && owner.alive && !owner.building) {
      owner.kills++;
      const nv = owner.vetFromKills();
      if (nv > owner.vet) {
        owner.vet = nv; owner.recalc(true);
        owner.hp = Math.min(owner.maxHp, owner.hp + owner.maxHp * 0.25);
        this.fx.push({ t: 'rank', x: owner.x, y: owner.y, v: nv });
        this.msg(`${owner.def.name} promovido a ${VET_NAMES[nv - 1]}!`, owner.team); this.sound('rank', owner.team);
      }
    }
    if (t.building) {
      for (let y = t.ty; y < t.ty + t.def.h; y++) for (let x = t.tx; x < t.tx + t.def.w; x++) this.occ[this.idx(x, y)] = 0;
      this.fx.push({ t: 'boom', x: t.x, y: t.y, s: 2.4 });
      for (let i = 0; i < 3; i++) this.fx.push({ t: 'boom', x: t.x + (Math.random() - 0.5) * t.def.w * TILE, y: t.y + (Math.random() - 0.5) * t.def.h * TILE, s: 1.2 });
      this.updatePower();
    } else {
      this.fx.push({ t: 'boom', x: t.x, y: t.y, s: t.def.category === 'vehicle' || t.def.category === 'air' ? 1.5 : 0.7 });
    }
  }

  // ---------- IA das unidades ----------
  private unitThink(e: Entity, dt: number) {
    e.cooldown -= dt; e.scan -= dt; e.repath -= dt;
    if (e.kind === 'harvester') { this.harvesterThink(e, dt); return; }
    if (e.order.t === 'capture' || e.order.t === 'board') { this.serviceOrder(e, dt); return; }
    if (e.def.damage <= 0) { const o0 = e.order; if (o0.t === 'move') { if (e.needPath) { e.needPath = false; const p = this.pathTo(e, o0.x, o0.y, true); if (!p) { e.order = { t: 'idle' }; return; } e.path = p; } this.follow(e, dt); if (e.path.length === 0) e.order = { t: 'idle' }; } return; }
    const range = e.range * TILE;
    let tgt: Entity | null = null;
    const o = e.order;
    if (o.t === 'attack') {
      if (!o.target.alive) { e.order = { t: 'idle' }; e.path = []; } else tgt = o.target;
    }
    if (o.t !== 'attack') {
      if (e.auto && (!e.auto.alive || this.distTo(e, e.auto) > range + (o.t === 'move' ? 0 : 2.5 * TILE))) e.auto = null;
      if (!e.auto && e.scan <= 0) {
        e.scan = 0.25 + Math.random() * 0.15;
        const r = o.t === 'idle' ? range + 1.5 * TILE : o.t === 'amove' || o.t === 'patrol' ? range + 2.5 * TILE : range;
        e.auto = this.nearestEnemy(e, r);
      }
      tgt = e.auto;
    }
    if (tgt) {
      const dist = this.distTo(e, tgt);
      if (dist <= range) {
        if (o.t === 'move') { if (e.cooldown <= 0) this.fire(e, tgt); }
        else {
          e.path = [];
          this.faceTo(e, tgt, dt);
          const want = Math.atan2(tgt.y - e.y, tgt.x - e.x);
          if (e.cooldown <= 0 && Math.abs(angDiff(e.angle, want)) < 0.5) this.fire(e, tgt);
          return;
        }
      } else if (o.t === 'hold') {
        return;
      } else if (o.t !== 'move') {
        if (e.repath <= 0 || e.path.length === 0) { e.repath = 0.6; e.path = this.pathTo(e, tgt.x, tgt.y) ?? []; }
        this.follow(e, dt);
        return;
      }
    }
    if (o.t === 'patrol') {
      if (e.needPath) { e.needPath = false; const p = this.pathTo(e, o.x, o.y, true); if (!p) { e.order = { t: 'idle' }; e.path = []; return; } e.path = p; }
      this.follow(e, dt);
      if (e.path.length === 0) { e.order = { t: 'patrol', x: o.ox, y: o.oy, ox: o.x, oy: o.y }; e.needPath = true; }
      return;
    }
    if (o.t === 'move' || o.t === 'amove') {
      if (e.needPath) {
        e.needPath = false;
        const p = this.pathTo(e, o.x, o.y, true);
        if (!p) { e.order = { t: 'idle' }; e.path = []; return; }
        e.path = p;
      }
      const far = Math.hypot(e.x - o.x, e.y - o.y) > TILE * 1.5;
      if (e.path.length === 0 && o.t === 'amove' && far && e.repath <= 0) {
        e.repath = 1;
        e.path = this.pathTo(e, o.x, o.y) ?? [];
      }
      this.follow(e, dt);
      if (e.path.length === 0 && (!far || o.t === 'move')) e.order = { t: 'idle' };
      else if (e.path.length === 0 && o.t === 'amove' && e.repath > 0.9) e.order = { t: 'idle' };
    }
  }

  nearestRefinery(e: Entity): Entity | null {
    let best: Entity | null = null, bd = Infinity;
    for (const b of this.entities) {
      if (b.team !== e.team || b.kind !== 'refinery' || !b.alive) continue;
      const d = Math.hypot(b.x - e.x, b.y - e.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  private nearestCrystal(e: Entity): number {
    const claims = new Map<number, number>();
    for (const o of this.entities) if (o.kind === 'harvester' && o !== e && o.alive && o.hTile >= 0 && (o.hs === 'toCrystal' || o.hs === 'harvest')) claims.set(o.hTile, (claims.get(o.hTile) ?? 0) + 1);
    let best = -1, bd = Infinity;
    for (let i = 0; i < N; i++) {
      if (this.crystal[i] < 15 || this.occ[i] !== 0) continue;
      if ((e.bad.get(i) ?? 0) > this.time) continue;
      const cx = (i % MAP_W + 0.5) * TILE, cy = ((i / MAP_W | 0) + 0.5) * TILE;
      const d = Math.hypot(cx - e.x, cy - e.y) + (claims.get(i) ?? 0) * 60;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  private harvesterThink(e: Entity, dt: number) {
    const o = e.order;
    if (o.t === 'move') {
      if (e.needPath) {
        e.needPath = false;
        const p = this.pathTo(e, o.x, o.y, true);
        if (!p) { e.order = { t: 'idle' }; return; }
        e.path = p;
      }
      this.follow(e, dt);
      if (e.path.length === 0) { e.order = { t: 'idle' }; e.hs = 'idle'; }
      return;
    }
    switch (e.hs) {
      case 'idle':
        if (!this.nearestRefinery(e)) return;
        e.hs = e.cargo >= HARVEST_CAP * 0.9 ? 'toRef' : 'seek';
        break;
      case 'seek': {
        if (e.cargo >= HARVEST_CAP - 1) { e.hs = 'toRef'; e.path = []; break; }
        if (e.repath > 0) break;
        const ti = this.nearestCrystal(e);
        if (ti < 0) { if (e.cargo > 20) e.hs = 'toRef'; e.repath = 1.5; break; }
        const p = this.pathTo(e, (ti % MAP_W + 0.5) * TILE, ((ti / MAP_W | 0) + 0.5) * TILE);
        if (!p) { e.bad.set(ti, this.time + 25); e.repath = 0.2; break; }
        e.path = p; e.hTile = ti; e.hs = 'toCrystal';
        break;
      }
      case 'toCrystal': {
        this.follow(e, dt);
        const cx = (e.hTile % MAP_W + 0.5) * TILE, cy = ((e.hTile / MAP_W | 0) + 0.5) * TILE;
        if (this.crystal[e.hTile] < 5) { e.hs = 'seek'; e.path = []; break; }
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (d < TILE * 0.6 || e.path.length === 0) {
          if (d < TILE * 1.1) { e.hs = 'harvest'; e.path = []; } else { e.hs = 'seek'; e.repath = 0.3; }
        }
        break;
      }
      case 'harvest': {
        const amt = this.crystal[e.hTile];
        if (amt <= 0) { e.hs = 'seek'; break; }
        const take = Math.min(HARVEST_RATE * dt, amt, HARVEST_CAP - e.cargo);
        this.crystal[e.hTile] -= take; e.cargo += take; this.crystalRev++;
        if (e.cargo >= HARVEST_CAP - 0.5) e.hs = 'toRef';
        else if (this.crystal[e.hTile] <= 0.5) { this.crystal[e.hTile] = 0; e.hs = 'seek'; }
        break;
      }
      case 'toRef': {
        const ref = this.nearestRefinery(e);
        if (!ref) { e.hs = 'idle'; break; }
        if (this.distTo(e, ref) <= TILE * 1.2) { e.hs = 'unload'; e.path = []; break; }
        if (e.path.length === 0 && e.repath <= 0) { e.repath = 1; e.path = this.pathTo(e, ref.x, ref.y) ?? []; }
        this.follow(e, dt);
        break;
      }
      case 'unload': {
        const ref = this.nearestRefinery(e);
        if (!ref || this.distTo(e, ref) > TILE * 2) { e.hs = 'toRef'; break; }
        const t = this.teams[e.team];
        const give = Math.min(UNLOAD_RATE * dt, e.cargo);
        e.cargo -= give; const gain = give * t.incomeMul * (1 + 0.1 * (ref.tech - 1)); t.credits += gain; this.harvested[e.team] += gain;
        if (e.cargo <= 0.01) { e.cargo = 0; e.hs = 'seek'; }
        break;
      }
    }
  }

  private turretThink(e: Entity, dt: number) {
    e.cooldown -= dt; e.scan -= dt;
    const range = e.range * TILE;
    if (e.auto && (!e.auto.alive || this.distTo(e, e.auto) > range)) e.auto = null;
    if (!e.auto && e.scan <= 0) { e.scan = 0.25; e.auto = this.nearestEnemy(e, range); }
    if (e.auto) {
      this.faceTo(e, e.auto, dt);
      if (e.cooldown <= 0) this.fire(e, e.auto);
    }
  }

  private separate() {
    const us = this.entities.filter(u => !u.building && u.alive && u.def.armor !== 'air');
    for (let i = 0; i < us.length; i++) {
      for (let j = i + 1; j < us.length; j++) {
        const a = us[i], b = us[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = (a.radius + b.radius) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 0.0001) continue;
        const d = Math.sqrt(d2), push = (min - d) * 0.25;
        const nx = dx / d, ny = dy / d;
        this.nudge(a, -nx * push, -ny * push);
        this.nudge(b, nx * push, ny * push);
      }
    }
  }
  private nudge(u: Entity, dx: number, dy: number) {
    const nx = u.x + dx, ny = u.y + dy;
    if (!this.blocked(Math.floor(nx / TILE), Math.floor(ny / TILE))) { u.x = nx; u.y = ny; }
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const t = p.target;
      if (!t || !t.alive) { this.projectiles.splice(i, 1); this.fx.push({ t: 'hit', x: p.x, y: p.y }); continue; }
      const dx = t.x - p.x, dy = t.y - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      const reach = t.building ? Math.max(t.def.w, t.def.h) * 10 : t.radius * 0.6;
      p.angle = Math.atan2(dy, dx);
      if (d <= step + reach) {
        this.projectiles.splice(i, 1);
        this.damage(t, p.raw * p.vs[t.def.armor], p.team, p.owner);
        if (p.splash > 0) {
          for (const o of this.entities.slice()) {
            if (!o.alive || o === t || o.team === p.team) continue;
            if ((o.def.armor === 'air') !== (t.def.armor === 'air')) continue;
            const dd = this.distTo({ x: t.x, y: t.y } as Entity, o);
            if (dd < p.splash) this.damage(o, p.raw * p.vs[o.def.armor] * 0.6 * (1 - dd / p.splash), p.team, p.owner);
          }
        }
        this.fx.push(p.kind === 'rocket' || p.kind === 'shell' ? { t: 'boom', x: t.x, y: t.y, s: p.splash > 30 ? 1 : 0.65 } : { t: 'hit', x: t.x, y: t.y });
      } else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
    }
  }

  noFog = false;
  noSuper = false;
  updateFog() {
    if (this.noFog) { this.visible.fill(1); this.explored.fill(1); return; }
    this.visible.fill(0);
    for (const e of this.entities) {
      if (e.team !== this.viewTeam || !e.alive) continue;
      const r = e.sight;
      const cx = e.x / TILE, cy = e.y / TILE;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(MAP_W - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(MAP_H - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) {
          const i = y * MAP_W + x; this.visible[i] = 1; this.explored[i] = 1;
        }
      }
    }
  }

  isVisible(e: Entity): boolean {
    if (e.team === this.viewTeam) return true;
    const i = clampTile(e.y / TILE, MAP_H) * MAP_W + clampTile(e.x / TILE, MAP_W);
    return e.building ? this.explored[i] === 1 : this.visible[i] === 1;
  }

  // ---------- loop (host / solo) ----------
  update(dt: number) {
    if (this.mirror || this.winner !== null) return;
    this.time += dt;
    this.updatePower();
    this.production(dt);
    this.regenT += dt;
    if (this.regenT >= 0.5) {
      this.regenT = 0;
      for (let i = 0; i < N; i++) {
        const m = this.crystalMax[i];
        if (m > 0 && this.crystal[i] < m && this.occ[i] === 0) this.crystal[i] = Math.min(m, this.crystal[i] + 0.35);
      }
      this.crystalRev++;
    }
    for (const t of this.teams) if (t.sp > 0) t.sp = Math.max(0, t.sp - dt);
    this.updateStrikes(dt);
    for (const ai of this.ais) ai.update(dt);
    for (const e of this.entities.slice()) {
      if (!e.alive) continue;
      if (e.building) { if (e.def.damage > 0) this.turretThink(e, dt); }
      else this.unitThink(e, dt);
    }
    this.separate();
    this.updateProjectiles(dt);
    if (this.entities.some(e => !e.alive)) this.entities = this.entities.filter(e => e.alive);
    this.fogT += dt;
    if (this.fogT >= 0.2) { this.fogT = 0; this.updateFog(); }
    this.checkT += dt;
    if (this.checkT >= 1 && this.time > 3 && !this.customWin) {
      this.checkT = 0;
      const b0 = this.buildings(0).length, b1 = this.buildings(1).length;
      if (b1 === 0) this.winner = 0; else if (b0 === 0) this.winner = 1;
    }
  }

  // ---------- rede: snapshot (host) e espelho (guest) ----------
  serialize(): Snapshot {
    const q = (t: TeamState) => {
      const o = {} as Record<Category, [Kind, number][]>;
      for (const c of CATEGORIES) o[c] = t.queues[c].map(i => [i.kind, Math.round(i.progress * 100) / 100]);
      return o;
    };
    return {
      tm: this.time, w: this.winner,
      t: this.teams.map(t => ({ c: Math.floor(t.credits), p: t.power, u: t.usage, l: t.low, k: t.kills, sp: Math.round(t.sp), q: q(t) })),
      e: this.entities.filter(e => e.alive).map(e => [
        e.id, KINDS.indexOf(e.kind), e.team, Math.round(e.x), Math.round(e.y), Math.round(e.angle * 100) / 100,
        Math.round(e.hp), e.tech, e.vet, e.kills, e.tx, e.ty, Math.round(e.cargo)]),
      p: this.projectiles.map(p => [Math.round(p.x), Math.round(p.y), Math.round(p.angle * 100) / 100, ['bullet', 'rocket', 'shell', 'laser'].indexOf(p.kind)]),
      fx: [], m: [], s: [],
    };
  }

  crystalSnap(): number[] {
    const out: number[] = [];
    for (let i = 0; i < N; i++) if (this.crystalMax[i] > 0) out.push(i, Math.round(this.crystal[i]));
    return out;
  }
  applyCrystal(a: number[]) {
    for (let k = 0; k < a.length; k += 2) this.crystal[a[k]] = a[k + 1];
    this.crystalRev++;
  }

  applySnapshot(s: Snapshot) {
    this.time = s.tm; this.winner = s.w;
    s.t.forEach((ts, i) => {
      const t = this.teams[i];
      t.credits = ts.c; t.power = ts.p; t.usage = ts.u; t.kills = ts.k; t.sp = ts.sp ?? 0;
      if (ts.l && !t.low && i === this.viewTeam) this.sound('lowpower', this.viewTeam);
      t.low = ts.l;
      for (const c of CATEGORIES) t.queues[c] = ts.q[c].map(([kind, progress]) => ({ kind, progress }));
    });
    const byId = new Map<number, Entity>(this.entities.map(e => [e.id, e]));
    const seen = new Set<number>();
    for (const r of s.e) {
      const [id, ki, team, x, y, ang, hp, tech, vet, kills, tx, ty, cargo] = r;
      seen.add(id);
      let e = byId.get(id);
      if (!e) {
        e = new Entity(KINDS[ki], team as Team, x, y, this.teams[team].faction);
        e.id = id; e.tx = tx; e.ty = ty;
        this.entities.push(e);
      }
      if (e.tech !== tech || e.vet !== vet) { e.tech = tech; e.vet = vet; e.recalc(false); }
      e.kills = kills; e.hp = hp; e.cargo = cargo;
      e.nx = x; e.ny = y; e.na = ang;
      if (e.building) { e.x = x; e.y = y; e.angle = ang; }
    }
    for (const e of this.entities) if (!seen.has(e.id)) e.alive = false;
    this.entities = this.entities.filter(e => seen.has(e.id));
    this.occ.fill(0);
    for (const e of this.entities) if (e.building) for (let y = e.ty; y < e.ty + e.def.h; y++) for (let x = e.tx; x < e.tx + e.def.w; x++) this.occ[this.idx(x, y)] = 1;
    const pk: ProjectileKind[] = ['bullet', 'rocket', 'shell', 'laser'];
    this.projectiles = s.p.map(([x, y, a, k]) => ({ x, y, angle: a, kind: pk[k], target: null, raw: 0, vs: DEFS.rifle.vs, speed: 0, team: 0 as Team, owner: null, splash: 0 }));
    for (const f of s.fx) this.fx.push(f);
    for (const m of s.m) this.messages.push(m);
    for (const x of s.s) this.sounds.push(x);
  }

  mirrorTick(dt: number) {
    const k = Math.min(1, dt * 12);
    for (const e of this.entities) {
      if (e.building) continue;
      e.x += (e.nx - e.x) * k; e.y += (e.ny - e.y) * k;
      e.angle += angDiff(e.angle, e.na) * k;
    }
    for (const p of this.projectiles) { const v = PROJ_SPEED[p.kind] * dt; p.x += Math.cos(p.angle) * v; p.y += Math.sin(p.angle) * v; }
    this.fogT += dt;
    if (this.fogT >= 0.2) { this.fogT = 0; this.updateFog(); }
  }
}
