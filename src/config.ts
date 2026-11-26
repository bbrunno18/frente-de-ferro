export const TILE = 32;
/** Tamanho do mapa em tiles. São "live bindings": `setMapSize` (chamado pelo World ao nascer) altera todos os importadores. */
export const MAP_SIZES = [64, 96] as const;
export type MapSize = typeof MAP_SIZES[number];
export let MAP_W = 64;
export let MAP_H = 64;
export let WORLD_W = MAP_W * TILE;
export let WORLD_H = MAP_H * TILE;
export function setMapSize(n: number) { MAP_W = n; MAP_H = n; WORLD_W = n * TILE; WORLD_H = n * TILE; }

/** 0..3 = slots da partida. Só 0 e 1 existem no modo clássico (campanha, 1v1). */
export type Team = 0 | 1 | 2 | 3;
export const MAX_TEAMS = 4;
export const TEAMS: Team[] = [0, 1, 2, 3];
export type SlotType = 'human' | 'ai' | 'empty';
export interface Slot { active: boolean; type: SlotType; faction: Faction; alliance: number; difficulty?: Difficulty; peerId?: string; name?: string }
/** Cores de identificação por slot (minimapa, barras de vida, anéis de seleção). */
export const TEAM_COLORS: { name: string; main: string; light: string; accent: string }[] = [
  { name: 'Azul', main: '#3a7bd5', light: '#8fb8f0', accent: '#e8c25a' },
  { name: 'Vermelho', main: '#d24b3c', light: '#f0958a', accent: '#f2d9d4' },
  { name: 'Verde', main: '#1fae7a', light: '#7fe0b8', accent: '#d8f5e8' },
  { name: 'Roxo', main: '#8a5cc6', light: '#c4a6ec', accent: '#f08a3c' },
];
export const ALLIANCE_NAMES = ['A', 'B', 'C', 'D'];
/** Slots padrão: 2 jogadores (cada um na sua aliança). */
export function defaultSlots(f0: Faction, f1: Faction, d: Difficulty = 'normal'): Slot[] {
  const f2: Faction[] = ['viboras', 'boreal'];
  return [
    { active: true, type: 'human', faction: f0, alliance: 0 },
    { active: true, type: 'ai', faction: f1, alliance: 1, difficulty: d },
    { active: false, type: 'empty', faction: f2[0], alliance: 2, difficulty: d },
    { active: false, type: 'empty', faction: f2[1], alliance: 3, difficulty: d },
  ];
}
export type Armor = 'inf' | 'veh' | 'bld' | 'air';
export type Faction = 'solar' | 'ferro' | 'boreal' | 'viboras';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Category = 'structure' | 'infantry' | 'vehicle' | 'air';
export type ProjectileKind = 'bullet' | 'rocket' | 'shell' | 'laser';
export type Targets = 'ground' | 'air' | 'both';
export type Kind =
  | 'conyard' | 'power' | 'refinery' | 'barracks' | 'factory' | 'turret' | 'aa' | 'radar' | 'lab' | 'helipad' | 'wall'
  | 'rifle' | 'rocket' | 'sniper' | 'buggy' | 'tank' | 'artillery' | 'prism' | 'heli' | 'harvester'
  | 'engineer' | 'apc' | 'cryo' | 'raider'
  | 'bunker' | 'cannon' | 'flamer' | 'commando' | 'flak' | 'mlrs' | 'jet' | 'bomber';

export const KINDS: Kind[] = [
  'conyard', 'power', 'refinery', 'barracks', 'factory', 'turret', 'aa', 'radar', 'lab', 'helipad', 'wall',
  'rifle', 'rocket', 'sniper', 'buggy', 'tank', 'artillery', 'prism', 'heli', 'harvester',
  'engineer', 'apc', 'cryo', 'raider',
  'bunker', 'cannon', 'flamer', 'commando', 'flak', 'mlrs', 'jet', 'bomber',
];
export const CATEGORIES: Category[] = ['structure', 'infantry', 'vehicle', 'air'];

export interface Def {
  kind: Kind;
  name: string;
  desc: string;
  building: boolean;
  w: number; h: number;
  cost: number;
  buildTime: number;
  hp: number;
  power: number;
  req: Kind[];
  category: Category;
  producer?: Kind;
  only?: Faction;
  armor: Armor;
  speed: number;
  sight: number;
  range: number;
  damage: number;
  cooldown: number;
  vs: Record<Armor, number>;
  projectile: ProjectileKind;
  targets: Targets;
  splash: number;
  radius: number;
}

const V = (inf: number, veh: number, bld: number, air = 0): Record<Armor, number> => ({ inf, veh, bld, air });
const B = {
  w: 1, h: 1, cost: 0, buildTime: 1, power: 0, req: [] as Kind[], speed: 0, sight: 5, range: 0, damage: 0, cooldown: 1,
  vs: V(1, 1, 1, 0), projectile: 'bullet' as ProjectileKind, targets: 'ground' as Targets, splash: 0, radius: 0,
};
type DefIn = Partial<Def> & Pick<Def, 'kind' | 'name' | 'desc' | 'building' | 'category' | 'armor' | 'hp'>;
const def = (d: DefIn): Def => ({ ...B, ...d });

export const DEFS: Record<Kind, Def> = {
  conyard: def({ kind: 'conyard', name: 'Centro de Comando', desc: 'Núcleo da base: constrói as demais estruturas. Não pode ser vendido.', building: true, category: 'structure', armor: 'bld', hp: 1500, w: 3, h: 3, sight: 8 }),
  power: def({ kind: 'power', name: 'Gerador', desc: 'Gera energia (+100). Sem energia a produção cai pela metade e o radar desliga.', building: true, category: 'structure', armor: 'bld', hp: 500, w: 2, h: 2, cost: 300, buildTime: 8, power: 100, req: ['conyard'], sight: 4 }),
  refinery: def({ kind: 'refinery', name: 'Refinaria', desc: 'Converte Cristal de Cobalto em créditos. Vem com 1 Extrator grátis.', building: true, category: 'structure', armor: 'bld', hp: 800, w: 3, h: 2, cost: 600, buildTime: 14, power: -30, req: ['power'], sight: 5 }),
  barracks: def({ kind: 'barracks', name: 'Quartel', desc: 'Treina infantaria: fuzileiros, lança-foguetes e atiradores de elite.', building: true, category: 'structure', armor: 'bld', hp: 600, w: 2, h: 2, cost: 400, buildTime: 10, power: -20, req: ['power'], sight: 5 }),
  factory: def({ kind: 'factory', name: 'Fábrica de Blindados', desc: 'Produz veículos: Extratores, jipes, tanques e artilharia.', building: true, category: 'structure', armor: 'bld', hp: 1000, w: 3, h: 2, cost: 800, buildTime: 16, power: -30, req: ['refinery'], sight: 5 }),
  turret: def({ kind: 'turret', name: 'Torre Laser', desc: 'Defesa fixa de laser contra alvos terrestres.', building: true, category: 'structure', armor: 'bld', hp: 450, cost: 350, buildTime: 9, power: -15, req: ['barracks'], sight: 8, range: 6.5, damage: 20, cooldown: 0.8, projectile: 'laser', vs: V(1, 0.9, 1, 0) }),
  aa: def({ kind: 'aa', name: 'Torre Antiaérea', desc: 'Mísseis antiaéreos: só atinge aeronaves, com grande eficácia.', building: true, category: 'structure', armor: 'bld', hp: 380, cost: 400, buildTime: 10, power: -15, req: ['radar'], sight: 8, range: 7.5, damage: 16, cooldown: 0.45, projectile: 'rocket', targets: 'air', vs: V(0, 0, 0, 2) }),
  radar: def({ kind: 'radar', name: 'Central de Radar', desc: 'Amplia muito a visão do mapa e libera tecnologia avançada.', building: true, category: 'structure', armor: 'bld', hp: 500, w: 2, h: 2, cost: 500, buildTime: 12, power: -40, req: ['barracks'], sight: 14 }),
  lab: def({ kind: 'lab', name: 'Laboratório Tecnológico', desc: 'Libera unidades de elite e a evolução para o Nível 3.', building: true, category: 'structure', armor: 'bld', hp: 700, w: 2, h: 2, cost: 900, buildTime: 18, power: -50, req: ['factory', 'radar'], sight: 5 }),
  helipad: def({ kind: 'helipad', name: 'Heliporto', desc: 'Produz aeronaves de ataque.', building: true, category: 'structure', armor: 'bld', hp: 600, w: 2, h: 2, cost: 700, buildTime: 14, power: -30, req: ['factory', 'radar'], sight: 5 }),
  wall: def({ kind: 'wall', name: 'Muro Reforçado', desc: 'Bloqueia a passagem inimiga. Barato e resistente.', building: true, category: 'structure', armor: 'bld', hp: 450, cost: 60, buildTime: 2, req: ['barracks'], sight: 2 }),

  rifle: def({ kind: 'rifle', name: 'Infantaria', desc: 'Soldado básico, barato e eficaz contra outra infantaria.', building: false, category: 'infantry', armor: 'inf', hp: 60, cost: 100, buildTime: 5, producer: 'barracks', req: ['barracks'], speed: 76, sight: 6, range: 4, damage: 6, cooldown: 0.5, radius: 8, targets: 'both', vs: V(1, 0.35, 0.4, 0.6) }),
  rocket: def({ kind: 'rocket', name: 'Lança-Foguetes', desc: 'Anti-blindado e antiaéreo. Frágil contra infantaria.', building: false, category: 'infantry', armor: 'inf', hp: 50, cost: 200, buildTime: 8, producer: 'barracks', req: ['barracks'], speed: 66, sight: 6.5, range: 6, damage: 32, cooldown: 1.6, radius: 8, projectile: 'rocket', targets: 'both', splash: 22, vs: V(0.4, 2, 0.8, 1.5) }),
  sniper: def({ kind: 'sniper', name: 'Atirador de Elite', desc: 'Alcance enorme e dano alto contra infantaria. Muito frágil.', building: false, category: 'infantry', armor: 'inf', hp: 60, cost: 300, buildTime: 9, producer: 'barracks', req: ['barracks', 'radar'], speed: 62, sight: 8, range: 8.5, damage: 48, cooldown: 1.7, radius: 8, vs: V(1.6, 0.3, 0.3, 0) }),
  buggy: def({ kind: 'buggy', name: 'Jipe Batedor', desc: 'Veículo rápido de reconhecimento com metralhadora. Ótimo para flanquear.', building: false, category: 'vehicle', armor: 'veh', hp: 130, cost: 350, buildTime: 7, producer: 'factory', req: ['factory'], speed: 125, sight: 8, range: 4.5, damage: 7, cooldown: 0.35, radius: 11, targets: 'both', vs: V(1.1, 0.3, 0.3, 0.5) }),
  tank: def({ kind: 'tank', name: 'Tanque Pesado', desc: 'Espinha dorsal do exército: resistente e forte contra tudo no solo.', building: false, category: 'vehicle', armor: 'veh', hp: 320, cost: 600, buildTime: 14, producer: 'factory', req: ['factory'], speed: 70, sight: 6.5, range: 5.5, damage: 28, cooldown: 1.1, radius: 13, projectile: 'shell', splash: 28, vs: V(0.8, 1, 1, 0) }),
  artillery: def({ kind: 'artillery', name: 'Artilharia Pesada', desc: 'Exclusiva do Sindicato Ferro. Bombardeio de longo alcance com dano em área.', building: false, category: 'vehicle', armor: 'veh', hp: 140, cost: 850, buildTime: 16, producer: 'factory', req: ['factory', 'radar'], only: 'ferro', speed: 45, sight: 7, range: 10, damage: 55, cooldown: 3, radius: 14, projectile: 'shell', splash: 46, vs: V(1.2, 1, 1.4, 0) }),
  prism: def({ kind: 'prism', name: 'Tanque Prisma', desc: 'Exclusivo da Vanguarda Solar. Blindagem pesada e feixe solar devastador.', building: false, category: 'vehicle', armor: 'veh', hp: 520, cost: 1100, buildTime: 20, producer: 'factory', req: ['factory', 'lab'], only: 'solar', speed: 55, sight: 7, range: 6.5, damage: 48, cooldown: 1.3, radius: 15, projectile: 'laser', vs: V(0.8, 1.2, 1.2, 0) }),
  heli: def({ kind: 'heli', name: 'Helicóptero de Ataque', desc: 'Aeronave veloz que ignora o terreno. Só tropas antiaéreas e fuzileiros o atingem.', building: false, category: 'air', armor: 'air', hp: 180, cost: 900, buildTime: 16, producer: 'helipad', req: ['helipad'], speed: 110, sight: 8, range: 5, damage: 14, cooldown: 0.5, radius: 13, targets: 'both', vs: V(1.2, 0.8, 0.6, 1) }),
  engineer: def({ kind: 'engineer', name: 'Engenheiro', desc: 'Desarmado. Ordene-o a atacar uma construção inimiga para CAPTURÁ-LA (ele é consumido). Frágil: escolte-o.', building: false, category: 'infantry', armor: 'inf', hp: 45, cost: 350, buildTime: 9, producer: 'barracks', req: ['barracks', 'radar'], speed: 70, sight: 5, radius: 8, targets: 'ground', vs: V(0, 0, 0, 0) }),
  apc: def({ kind: 'apc', name: 'Transporte Blindado', desc: 'Leva até 5 soldados. Toque no transporte com infantaria selecionada para embarcar; use Descer para desembarcar. Desarmado.', building: false, category: 'vehicle', armor: 'veh', hp: 280, cost: 500, buildTime: 10, producer: 'factory', req: ['factory'], speed: 105, sight: 6, radius: 13, targets: 'ground', vs: V(0, 0, 0, 0) }),
  cryo: def({ kind: 'cryo', name: 'Tanque Criogênico', desc: 'Exclusivo da Guarda Boreal. Casco de gelo reforçado e feixe congelante de curto alcance, devastador contra infantaria e veículos.', building: false, category: 'vehicle', armor: 'veh', hp: 620, cost: 1150, buildTime: 19, producer: 'factory', req: ['factory', 'lab'], only: 'boreal', speed: 52, sight: 6.5, range: 5, damage: 32, cooldown: 0.9, radius: 15, projectile: 'laser', vs: V(1.4, 1.1, 0.9, 0) }),
  raider: def({ kind: 'raider', name: 'Vespa Veloz', desc: 'Exclusiva do Cartel Víbora. Buggy de ataque muito rápido com mísseis anti-blindado e antiaéreos. Frágil.', building: false, category: 'vehicle', armor: 'veh', hp: 170, cost: 650, buildTime: 11, producer: 'factory', req: ['factory', 'radar'], only: 'viboras', speed: 150, sight: 8, range: 6, damage: 30, cooldown: 0.9, radius: 11, projectile: 'rocket', targets: 'both', splash: 14, vs: V(0.5, 1.8, 0.9, 1.05) }),
  bunker: def({ kind: 'bunker', name: 'Casamata', desc: 'Abrigo de concreto com metralhadora pesada. Ótimo contra infantaria, fraco contra blindados.', building: true, category: 'structure', armor: 'bld', hp: 650, cost: 300, buildTime: 7, req: ['barracks'], sight: 7, range: 5, damage: 9, cooldown: 0.3, vs: V(1.5, 0.3, 0.4, 0) }),
  cannon: def({ kind: 'cannon', name: 'Obuseiro Fixo', desc: 'Canhão pesado de longo alcance com dano em área. Protege a base contra blindados e artilharia.', building: true, category: 'structure', armor: 'bld', hp: 600, cost: 800, buildTime: 14, power: -30, req: ['radar'], sight: 10, range: 11, damage: 60, cooldown: 3.2, projectile: 'shell', splash: 40, vs: V(1, 1.1, 1.2, 0) }),
  flamer: def({ kind: 'flamer', name: 'Lança-Chamas', desc: 'Curto alcance e fogo em área: limpa trincheiras de infantaria e castiga construções.', building: false, category: 'infantry', armor: 'inf', hp: 110, cost: 250, buildTime: 7, producer: 'barracks', req: ['barracks'], speed: 66, sight: 5.5, range: 3.3, damage: 18, cooldown: 0.45, radius: 8, splash: 24, vs: V(1.8, 0.4, 1.4, 0) }),
  commando: def({ kind: 'commando', name: 'Comando', desc: 'Soldado de elite: elimina infantaria com poucos disparos e derruba construções rápido. Caro e lento para treinar.', building: false, category: 'infantry', armor: 'inf', hp: 230, cost: 1000, buildTime: 18, producer: 'barracks', req: ['barracks', 'lab'], speed: 82, sight: 8, range: 6.5, damage: 40, cooldown: 0.6, radius: 8, targets: 'both', vs: V(3, 0.5, 2.5, 0.5) }),
  flak: def({ kind: 'flak', name: 'Blindado Antiaéreo', desc: 'Canhões automáticos de tiro rápido que só atingem aeronaves. Acompanhe o exército para cobrir o céu.', building: false, category: 'vehicle', armor: 'veh', hp: 260, cost: 600, buildTime: 11, producer: 'factory', req: ['factory'], speed: 80, sight: 9, range: 8, damage: 14, cooldown: 0.3, radius: 13, targets: 'air', vs: V(0, 0, 0, 2.2) }),
  mlrs: def({ kind: 'mlrs', name: 'Lança-Mísseis', desc: 'Caminhão com bateria de foguetes de longo alcance. Arrasa construções e tropas agrupadas, mas é frágil.', building: false, category: 'vehicle', armor: 'veh', hp: 240, cost: 800, buildTime: 14, producer: 'factory', req: ['factory', 'radar'], speed: 58, sight: 7, range: 9.5, damage: 40, cooldown: 2.1, radius: 14, projectile: 'rocket', splash: 30, vs: V(1.1, 1, 1.5, 0) }),
  jet: def({ kind: 'jet', name: 'Caça de Ataque', desc: 'Jato muito rápido com mísseis guiados. Caça blindados e outras aeronaves.', building: false, category: 'air', armor: 'air', hp: 140, cost: 1200, buildTime: 18, producer: 'helipad', req: ['helipad', 'radar'], speed: 190, sight: 9, range: 6, damage: 33, cooldown: 1.4, radius: 14, projectile: 'rocket', splash: 12, targets: 'both', vs: V(0.35, 1.5, 0.8, 1.4) }),
  bomber: def({ kind: 'bomber', name: 'Bombardeiro', desc: 'Aeronave pesada que despeja bombas em área. Devastador contra bases; indefeso contra caças e antiaéreos.', building: false, category: 'air', armor: 'air', hp: 420, cost: 1600, buildTime: 26, producer: 'helipad', req: ['helipad', 'lab'], speed: 85, sight: 8, range: 3, damage: 120, cooldown: 3.5, radius: 18, projectile: 'shell', splash: 60, vs: V(0.45, 0.6, 2.4, 0) }),
  harvester: def({ kind: 'harvester', name: 'Extrator', desc: 'Coleta Cristal de Cobalto sozinho e leva à Refinaria.', building: false, category: 'vehicle', armor: 'veh', hp: 300, cost: 700, buildTime: 15, producer: 'factory', req: ['factory'], speed: 50, sight: 5, radius: 15 }),
};

export const STRUCTURES: Kind[] = ['power', 'refinery', 'barracks', 'factory', 'radar', 'turret', 'bunker', 'aa', 'cannon', 'wall', 'lab', 'helipad'];
export const INFANTRY: Kind[] = ['rifle', 'rocket', 'flamer', 'sniper', 'engineer', 'commando'];
export const VEHICLES: Kind[] = ['harvester', 'buggy', 'apc', 'flak', 'tank', 'mlrs', 'artillery', 'prism', 'cryo', 'raider'];
export const AIRCRAFT: Kind[] = ['heli', 'jet', 'bomber'];
export const COMBAT: Kind[] = ['rifle', 'rocket', 'sniper', 'buggy', 'tank', 'artillery', 'prism', 'heli', 'cryo', 'raider', 'flamer', 'commando', 'flak', 'mlrs', 'jet', 'bomber'];

export const HARVEST_CAP = 300;
export const HARVEST_RATE = 30;
export const UNLOAD_RATE = 100;
export const MAX_TECH = 3;
export const VET_KILLS = [0, 2, 5]; // abates para nível de veterania 1, 2, 3
export const VET_NAMES = ['Recruta', 'Veterano', 'Elite'];
export const PROJ_SPEED: Record<ProjectileKind, number> = { bullet: 520, rocket: 260, shell: 380, laser: 1100 };

export interface FactionDef {
  id: Faction; name: string; tagline: string;
  hpMul: number; speedMul: number; rangeMul: number; powerMul: number;
  /** multiplicador de ganho de cristal */ inc: number;
  /** superpoder: pulso orbital ou barragem de artilharia */ power: 'pulse' | 'barrage';
  role: string; perk: string; excl: string;
  main: string; light: string; dark: string; accent: string;
}
export const FACTIONS: Record<Faction, FactionDef> = {
  solar: {
    id: 'solar', name: 'Vanguarda Solar', tagline: 'Blindados pesados e energia limpa: +20% blindagem, +30% energia, Tanque Prisma exclusivo.',
    hpMul: 1.2, speedMul: 0.92, rangeMul: 1, powerMul: 1.3, inc: 1, power: 'pulse', role: 'RESISTÊNCIA · ENERGIA', perk: '+20% blindagem · +30% energia', excl: 'Exclusiva · Tanque Prisma · Pulso Solar',
    main: '#b8974e', light: '#d6c59a', dark: '#5a4a2c', accent: '#4fb0d8',
  },
  ferro: {
    id: 'ferro', name: 'Sindicato Ferro', tagline: 'Velocidade e artilharia: +20% velocidade e alcance, Artilharia Pesada exclusiva.',
    hpMul: 0.9, speedMul: 1.2, rangeMul: 1.2, powerMul: 1, inc: 1, power: 'barrage', role: 'MOBILIDADE · ALCANCE', perk: '+20% velocidade · +20% alcance', excl: 'Exclusiva · Artilharia Pesada · Barragem',
    main: '#9a3d30', light: '#c2867a', dark: '#3c1a16', accent: '#c9d1d9',
  },
  boreal: {
    id: 'boreal', name: 'Guarda Boreal', tagline: 'Fortaleza do norte gelado: +35% blindagem e +10% energia, porém lenta.',
    hpMul: 1.35, speedMul: 0.85, rangeMul: 1.05, powerMul: 1.1, inc: 1, power: 'pulse', role: 'FORTALEZA · DEFESA', perk: '+35% blindagem · −15% velocidade', excl: 'Pulso Orbital · unidades quase indestrutíveis',
    main: '#a3adb5', light: '#d4d9dd', dark: '#3a434c', accent: '#e07a3a',
  },
  viboras: {
    id: 'viboras', name: 'Cartel Víbora', tagline: 'Mercenários do deserto: +25% ganho de cristal, rápidos e frágeis.',
    hpMul: 0.85, speedMul: 1.1, rangeMul: 1.1, powerMul: 1, inc: 1.25, power: 'barrage', role: 'ECONOMIA · EMBOSCADA', perk: '+25% cristal · +10% velocidade e alcance', excl: 'Barragem · mais dinheiro para gastar',
    main: '#6b5a84', light: '#a898bd', dark: '#2a2236', accent: '#8fd16a',
  },
};

/** A IA ataca quando o exército pronto atinge um tamanho — sem cronômetro. */
export interface DiffDef { label: string; need: number; growth: number; frac: number; speed: number; income: number; think: number }
export const DIFFS: Record<Difficulty, DiffDef> = {
  easy: { label: 'Fácil', need: 9, growth: 2, frac: 0.7, speed: 0.75, income: 0.75, think: 2 },
  normal: { label: 'Normal', need: 7, growth: 2, frac: 0.85, speed: 1, income: 1, think: 1 },
  hard: { label: 'Difícil', need: 6, growth: 2, frac: 1, speed: 1.25, income: 1.25, think: 0.7 },
};

export interface MapDef { id: string; name: string; seed: number; rocks: number; unlockWins: number; desc: string; biome: 'grass' | 'desert'; water?: number }
export const MAPS: MapDef[] = [
  { id: 'planicie', name: 'Vale Verde', seed: 11, rocks: 40, unlockWins: 0, biome: 'grass', desc: 'Campos verdes com estrada central, ideal para começar.' },
  { id: 'crateras', name: 'Crateras de Ferro', seed: 23, rocks: 75, unlockWins: 1, biome: 'desert', desc: 'Obstáculos densos e rotas estreitas.' },
  { id: 'rio', name: 'Rio das Garças', seed: 51, rocks: 95, unlockWins: 2, biome: 'grass', water: 0.85, desc: 'Lagos e pontes naturais: o controle do centro decide.' },
  { id: 'dunas', name: 'Mar de Dunas', seed: 64, rocks: 60, unlockWins: 4, biome: 'desert', water: 0, desc: 'Deserto aberto com poucos abrigos: movimento rápido vence.' },
  { id: 'canions', name: 'Cânions do Sul', seed: 37, rocks: 110, unlockWins: 3, biome: 'desert', desc: 'Labirinto de rochas: defesa vale ouro.' },
];

export type Role = 'solo' | 'host' | 'guest';
export interface MatchOpts {
  difficulty: Difficulty;
  faction: Faction;          // facção do jogador local
  enemyFaction?: Faction;    // exército inimigo (escolhido no menu ou online)
  credits?: number; noSuper?: boolean; noFog?: boolean;
  mapId: string;
  role: Role;
  /** 4 slots (ativos ou não). Ausente = partida clássica de 2 jogadores. */
  slots?: Slot[];
  /** 64 (padrão) ou 96; com 3–4 jogadores o mapa é sempre 96. */
  mapSize?: MapSize;
  /** time controlado por este aparelho (online: o do convidado) */
  myTeam?: Team;
  mission?: import('./campaign/missions').Mission;
  onNext?: (m: import('./campaign/missions').Mission) => void;
  net?: import('./systems/Net').NetSession;
  onExit: () => void;
}
