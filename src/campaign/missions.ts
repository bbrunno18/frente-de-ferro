import { DEMO, DEMO_IDS } from '../demo';
import type { World } from '../systems/World';
import type { Difficulty, Faction, Kind, MatchOpts } from '../config';
import { TILE } from '../config';

/** Contexto avaliado pelas missões a cada instante. */
export interface Ctx { w: World; t: number; ev: Set<string>; done: Set<string>; flags: Record<string, number> }
export interface Objective {
  id: string;
  text: string;
  done: (c: Ctx) => boolean;
  /** progresso mostrado ao lado do texto, ex.: "1200/3500" */
  prog?: (c: Ctx) => string;
  /** dica didática (tutorial) */
  tip?: string;
  /** item da barra lateral que deve pulsar */
  hl?: Kind;
}
export type Camp = 'solar' | 'ferro' | 'boreal' | 'viboras';
export interface Mission {
  /** campanha (facção do jogador) */ camp?: Camp;
  /** liberada mesmo sem a Edição Completa (primeira missão de cada campanha extra) */ free?: boolean;
  id: string; n: number; title: string; sub: string; briefing: string;
  mapId: string; faction: Faction; enemy: Faction; difficulty: Difficulty;
  credits: number; enemyCredits?: number;
  /** IA inimiga ativa (comportamento de escaramuça) */
  ai: boolean;
  /** não cria as bases padrão; o setup monta o cenário */
  bare: boolean;
  /** vitória/derrota decididas pelos objetivos */
  custom: boolean;
  /** objetivos em sequência (tutorial) */
  sequential?: boolean;
  /** tempo de referência (s) para 3 estrelas */
  par: number;
  objectives: Objective[];
  setup: (w: World) => void;
  tick?: (c: Ctx, dt: number) => void;
  lose?: (c: Ctx) => string | null;
  timer?: (c: Ctx) => string | null;
}

export class MissionRunner {
  c: Ctx;
  state: 'run' | 'won' | 'lost' = 'run';
  reason = '';
  constructor(public m: Mission, public w: World) {
    this.c = { w, t: 0, ev: new Set(), done: new Set(), flags: {} };
  }
  note(e: string) { this.c.ev.add(e); }
  current(): Objective | undefined { return this.m.objectives.find(o => !this.c.done.has(o.id)); }
  update(dt: number) {
    if (this.state !== 'run') return;
    const c = this.c, m = this.m;
    c.t += dt;
    m.tick?.(c, dt);
    let all = true;
    for (const o of m.objectives) {
      if (c.done.has(o.id)) continue;
      if (o.done(c)) c.done.add(o.id);
      else { all = false; if (m.sequential) break; }
    }
    if (!m.custom) return;
    const lose = c.t > 3 ? m.lose?.(c) ?? (this.w.buildings(0).length === 0 ? 'Sua base foi destruída.' : null) : null;
    if (lose) { this.state = 'lost'; this.reason = lose; this.w.winner = 1; }
    else if (all) { this.state = 'won'; this.w.winner = 0; }
  }
  stars(): number {
    const t = this.c.t;
    return t <= this.m.par ? 3 : t <= this.m.par * 1.5 ? 2 : 1;
  }
}

export function missionOpts(m: Mission): Omit<MatchOpts, 'onExit'> {
  return { difficulty: m.difficulty, faction: m.faction, enemyFaction: m.enemy, mapId: m.mapId, role: 'solo', mission: m };
}

// ---------- utilidades de cenário ----------
const squad = (w: World, team: 0 | 1, kind: Kind, n: number, tx: number, ty: number) => {
  for (let i = 0; i < n; i++) w.unitAt(team, kind, tx + (i % 4), ty + Math.floor(i / 4));
};
const count = (w: World, team: 0 | 1, kind: Kind) => w.entities.filter(e => e.team === team && e.alive && e.kind === kind).length;
const alive = (w: World, team: 0 | 1) => w.entities.filter(e => e.team === team && e.alive).length;
const enemyBuildings = (w: World) => w.buildings(1).length;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

const base = { faction: 'solar' as Faction, enemy: 'ferro' as Faction, camp: 'solar' as Camp };
const fer = { faction: 'ferro' as Faction, enemy: 'solar' as Faction, camp: 'ferro' as Camp };
const bor = { faction: 'boreal' as Faction, enemy: 'viboras' as Faction, camp: 'boreal' as Camp };
const vib = { faction: 'viboras' as Faction, enemy: 'boreal' as Faction, camp: 'viboras' as Camp };
const has = (w: World, team: 0 | 1, kind: Kind) => w.entities.some(e => e.team === team && e.alive && e.kind === kind);

/** ondas de ataque contra a base do jogador: [tipo, quantidade][] por onda */
function waves(list: [Kind, number][][], first: number, gap: number, from: [number, number] = [52, 8]) {
  return {
    tick: (c: Ctx) => {
      const w = c.w, n = c.flags.wave ?? 0;
      if (n < list.length && c.t >= first + n * gap) {
        c.flags.wave = n + 1;
        const ids: number[] = []; let i = 0;
        for (const [k, q] of list[n]) for (let j = 0; j < q; j++) { const u = w.unitAt(1, k, from[0] + (i % 5), from[1] + Math.floor(i / 5)); if (u) ids.push(u.id); i++; }
        const cy = w.entities.find(e => e.team === 0 && e.kind === 'conyard') ?? w.buildings(0)[0];
        if (cy && ids.length) w.applyCommand(1, { c: 'amove', ids, x: cy.x, y: cy.y });
        w.msg(`Onda ${n + 1} de ${list.length} a caminho!`, 0); w.sound('wave', 0);
      }
    },
    timer: (c: Ctx) => ((c.flags.wave ?? 0) >= list.length ? 'Última onda!' : `Onda ${(c.flags.wave ?? 0) + 1}/${list.length} em ${fmt(first + (c.flags.wave ?? 0) * gap - c.t)}`),
    done: (c: Ctx) => (c.flags.wave ?? 0) >= list.length && alive(c.w, 1) === 0,
    prog: (c: Ctx) => `onda ${c.flags.wave ?? 0}/${list.length}`,
  };
}
/** fortaleza inimiga no canto nordeste */
const fortress = (w: World, kinds: Kind[], tx = 46, ty = 14) => { for (const k of kinds) w.buildAt(1, k, tx, ty); };


// ---------- as 8 missões ----------
export const MISSIONS: Mission[] = [
  {
    id: 'm1', n: 1, title: 'Primeiro Contato', sub: 'Tutorial', ...base, mapId: 'planicie', difficulty: 'easy',
    briefing: 'Comandante, bem-vindo à Vanguarda Solar. Nossa base na Planície Verde está montada, mas precisa crescer. Aprenda a mover a câmera, comandar tropas, construir e evoluir. Uma patrulha do Sindicato Ferro se aproxima: esteja pronto.',
    credits: 3500, ai: false, bare: true, custom: true, sequential: true, par: 600,
    setup: w => { w.defaultLayout(0); },
    objectives: [
      { id: 'pan', text: 'Mova a câmera', tip: 'PC: botão do meio, WASD, setas ou encoste o mouse na borda. Celular: arraste com dois dedos.', done: c => c.ev.has('pan') },
      { id: 'sel', text: 'Selecione um Fuzileiro', tip: 'Toque nele ou arraste uma caixa de seleção (botão Caixa no celular).', done: c => c.ev.has('select') },
      { id: 'mov', text: 'Mande-o andar até um ponto vazio', tip: 'PC: clique com o botão direito. Celular: toque no destino.', done: c => c.ev.has('move') },
      { id: 'pow', text: 'Construa um Gerador de Energia', hl: 'power', tip: 'Aba Base → Gerador. Quando chegar a 100%, toque no ícone de novo e posicione no mapa.', done: c => c.w.buildings(0).filter(b => b.kind === 'power').length >= 2 },
      { id: 'bar', text: 'Construa um Quartel', hl: 'barracks', tip: 'Quartéis liberam a infantaria. Posicione perto da base.', done: c => c.w.hasBuilding(0, 'barracks') },
      { id: 'inf', text: 'Treine 3 Fuzileiros', hl: 'rifle', prog: c => `${Math.min(3, Math.max(0, count(c.w, 0, 'rifle') - 2))}/3`, tip: 'Aba Infantaria → Fuzileiro. Toque várias vezes para enfileirar.', done: c => count(c.w, 0, 'rifle') >= 5 },
      { id: 'fac', text: 'Construa uma Fábrica de Blindados', hl: 'factory', tip: 'A fábrica libera veículos e tanques.', done: c => c.w.hasBuilding(0, 'factory') },
      { id: 'tnk', text: 'Treine um Tanque', hl: 'tank', tip: 'Aba Veículos → Tanque.', done: c => count(c.w, 0, 'tank') >= 1 },
      { id: 'upg', text: 'Evolua uma unidade ou construção ★', tip: 'Selecione o tanque (ou um prédio) e toque em Evoluir. Unidades também ganham patentes ao abater inimigos.', done: c => c.ev.has('upgrade') },
      { id: 'atk', text: 'Destrua a patrulha inimiga ao norte', tip: 'Selecione suas tropas (botão Exército) e toque nos inimigos para atacar. A tecla A ataca em movimento.', done: c => (c.flags.spawned ?? 0) > 0 && alive(c.w, 1) === 0 },
    ],
    tick: c => {
      if (c.done.has('upg') && !c.flags.spawned) {
        c.flags.spawned = 1;
        squad(c.w, 1, 'rifle', 3, 22, 38);
        c.w.msg('Alerta: patrulha inimiga a noroeste!', 0); c.w.sound('alert', 0);
      }
    },
  },
  {
    id: 'm2', n: 2, title: 'Cristais da Aurora', sub: 'Economia', ...base, mapId: 'planicie', difficulty: 'easy',
    briefing: 'Sem cristais não há exército. Os campos ao redor da base estão ricos, mas o Sindicato também os quer. Expanda a coleta e mantenha a base de pé.',
    credits: 1200, ai: true, bare: false, custom: true, par: 540,
    setup: () => { /* base padrão */ },
    objectives: [
      { id: 'col', text: 'Colete 3.500 créditos de cristal', prog: c => `${Math.floor(c.w.harvested[0])}/3500`, done: c => c.w.harvested[0] >= 3500 },
      { id: 'ref', text: 'Tenha 2 Refinarias', hl: 'refinery', done: c => c.w.buildings(0).filter(b => b.kind === 'refinery').length >= 2 },
    ],
  },
  {
    id: 'm3', n: 3, title: 'Posto Avançado', sub: 'Ataque', ...base, mapId: 'crateras', difficulty: 'normal',
    briefing: 'O Sindicato ergueu um posto avançado a nordeste para vigiar nosso território. Você tem um esquadrão blindado. Elimine o posto antes que chegue reforço.',
    credits: 800, ai: false, bare: true, custom: true, par: 420,
    setup: w => {
      w.defaultLayout(0);
      squad(w, 0, 'tank', 5, 13, 45); squad(w, 0, 'rocket', 4, 13, 48); squad(w, 0, 'rifle', 4, 17, 45);
      for (const k of ['power', 'power', 'radar', 'barracks', 'turret', 'turret', 'turret', 'turret'] as Kind[]) w.buildAt(1, k, 45 + (Math.random() * 0 | 0), 24);
      squad(w, 1, 'rifle', 6, 40, 28); squad(w, 1, 'rocket', 2, 41, 31); squad(w, 1, 'tank', 2, 44, 30);
    },
    objectives: [{ id: 'dst', text: 'Destrua o Posto Avançado do Sindicato', prog: c => `${enemyBuildings(c.w)} construções restantes`, done: c => enemyBuildings(c.w) === 0 }],
  },
  {
    id: 'm4', n: 4, title: 'A Barragem', sub: 'Defesa', ...base, mapId: 'planicie', difficulty: 'normal',
    briefing: 'Informações indicam seis ondas de assalto contra nossa base. Não há tempo para atacar: construa defesas, mantenha a economia e segure a linha.',
    credits: 3000, ai: false, bare: true, custom: true, par: 540,
    setup: w => { w.defaultLayout(0); w.buildAt(0, 'turret', 15, 46); w.buildAt(0, 'turret', 15, 52); },
    tick: (c, dt) => {
      const w = c.w, waves: [Kind, number][][] = [
        [['rifle', 4]], [['rifle', 4], ['buggy', 2]], [['tank', 3]],
        [['rifle', 6], ['rocket', 3], ['buggy', 2]], [['tank', 4], ['artillery', 2]], [['tank', 6], ['rocket', 4], ['artillery', 2]],
      ];
      const n = c.flags.wave ?? 0;
      const next = 60 + n * 75;
      if (n < waves.length && c.t >= next) {
        c.flags.wave = n + 1;
        const ids: number[] = [];
        let i = 0;
        for (const [k, q] of waves[n]) for (let j = 0; j < q; j++) { const u = w.unitAt(1, k, 52 + (i % 5), 8 + Math.floor(i / 5)); if (u) ids.push(u.id); i++; }
        const cy = w.entities.find(e => e.team === 0 && e.kind === 'conyard');
        if (cy && ids.length) w.applyCommand(1, { c: 'amove', ids, x: cy.x, y: cy.y });
        w.msg(`Onda ${n + 1} de ${waves.length} a caminho!`, 0); w.sound('wave', 0);
      }
      void dt;
    },
    lose: c => (c.w.hasBuilding(0, 'conyard') ? null : 'O Centro de Comando caiu.'),
    timer: c => ((c.flags.wave ?? 0) >= 6 ? 'Última onda!' : `Onda ${(c.flags.wave ?? 0) + 1}/6 em ${fmt(60 + (c.flags.wave ?? 0) * 75 - c.t)}`),
    objectives: [{ id: 'sur', text: 'Resista às 6 ondas inimigas', prog: c => `onda ${c.flags.wave ?? 0}/6`, done: c => (c.flags.wave ?? 0) >= 6 && alive(c.w, 1) === 0 }],
  },
  {
    id: 'm5', n: 5, title: 'Céus de Ferro', sub: 'Ar', ...base, mapId: 'rio', difficulty: 'normal',
    briefing: 'Nossa melhor chance é pelo ar. Quatro helicópteros e um heliporto estão à disposição. Derrube as usinas e a refinaria do Sindicato para sufocar a economia deles. Cuidado com as torres antiaéreas.',
    credits: 3000, ai: false, bare: true, custom: true, par: 480,
    setup: w => {
      w.defaultLayout(0); w.buildAt(0, 'helipad', 14, 45); w.buildAt(0, 'helipad', 14, 49);
      squad(w, 0, 'heli', 4, 12, 44);
      for (const k of ['power', 'power', 'refinery', 'barracks', 'aa', 'aa', 'aa', 'turret'] as Kind[]) w.buildAt(1, k, 47, 14);
      squad(w, 1, 'rifle', 6, 44, 18);
    },
    objectives: [
      { id: 'pow', text: 'Destrua as Usinas de Energia inimigas', done: c => !c.w.entities.some(e => e.team === 1 && e.alive && e.kind === 'power') },
      { id: 'ref', text: 'Destrua a Refinaria inimiga', done: c => !c.w.entities.some(e => e.team === 1 && e.alive && e.kind === 'refinery') },
    ],
  },
  {
    id: 'm6', n: 6, title: 'Guerra no Rio', sub: 'Escaramuça', ...base, mapId: 'rio', difficulty: 'normal',
    briefing: 'O Sindicato aproveita o terreno alagado. Domine as passagens e destrua a base inimiga com todos os recursos de que dispõe.',
    credits: 2000, ai: true, bare: false, custom: false, par: 900,
    setup: () => { /* escaramuça padrão */ },
    objectives: [{ id: 'win', text: 'Destrua todas as construções inimigas', done: c => c.w.winner === 0 }],
  },
  {
    id: 'm7', n: 7, title: 'Muralha de Aço', sub: 'Assalto', ...base, mapId: 'dunas', difficulty: 'hard',
    briefing: 'O quartel-general do Sindicato é uma fortaleza cheia de torres. Tanques Prisma têm alcance e poder para quebrar a muralha, mas precisam de cobertura. Planeje o ataque.',
    credits: 1500, ai: false, bare: true, custom: true, par: 600,
    setup: w => {
      w.defaultLayout(0); squad(w, 0, 'prism', 5, 13, 45); squad(w, 0, 'buggy', 3, 17, 45); squad(w, 0, 'rifle', 4, 13, 49);
      for (const k of ['conyard', 'power', 'power', 'barracks', 'factory', 'turret', 'turret', 'turret', 'turret', 'turret', 'aa', 'aa'] as Kind[]) w.buildAt(1, k, 46, 14);
      squad(w, 1, 'rifle', 8, 41, 22); squad(w, 1, 'tank', 3, 43, 20);
    },
    objectives: [{ id: 'dst', text: 'Destrua a Fortaleza inimiga', prog: c => `${enemyBuildings(c.w)} construções restantes`, done: c => enemyBuildings(c.w) === 0 }],
  },
  {
    id: 'm8', n: 8, title: 'Frente de Ferro', sub: 'Batalha final', ...base, mapId: 'canions', difficulty: 'hard',
    briefing: 'Última frente. O Sindicato lança tudo o que tem nos Cânions do Sul. Use economia, defesa e tecnologia: esta batalha decide a guerra.',
    credits: 3000, ai: true, bare: false, custom: false, par: 1200,
    setup: () => { /* escaramuça padrão */ },
    objectives: [{ id: 'win', text: 'Destrua todas as construções inimigas', done: c => c.w.winner === 0 }],
  },
  // ---------- Vanguarda Solar: missões 9 a 12 ----------
  {
    id: 'm9', n: 9, title: 'Operação Resgate', sub: 'Captura', ...base, mapId: 'crateras', difficulty: 'normal',
    briefing: 'O Sindicato tomou uma Central de Radar nossa nas Crateras de Ferro. Leve os Engenheiros no Transporte Blindado, escoltados pelos tanques, e recapture a central e a usina vizinha. Sem engenheiros, a operação fracassa.',
    credits: 1500, ai: false, bare: true, custom: true, par: 480,
    setup: w => {
      w.defaultLayout(0); squad(w, 0, 'engineer', 3, 14, 46); squad(w, 0, 'apc', 1, 16, 46); squad(w, 0, 'tank', 4, 13, 43); squad(w, 0, 'rifle', 4, 17, 43);
      fortress(w, ['radar', 'power', 'barracks', 'turret', 'bunker', 'bunker'], 40, 24);
      squad(w, 1, 'rifle', 6, 36, 27); squad(w, 1, 'flamer', 3, 38, 30); squad(w, 1, 'tank', 2, 41, 28);
    },
    objectives: [
      { id: 'rad', text: 'Capture a Central de Radar com um Engenheiro', hl: 'engineer', tip: 'Selecione o Engenheiro e toque na construção inimiga.', done: c => has(c.w, 0, 'radar') },
      { id: 'pow', text: 'Capture ou destrua a Usina inimiga', done: c => !has(c.w, 1, 'power') },
    ],
    lose: c => (!has(c.w, 0, 'engineer') && !has(c.w, 0, 'radar') && !c.w.entities.some(e => e.team === 0 && e.kind === 'apc' && e.riders.some(r => r.k === 'engineer')) ? 'Todos os engenheiros caíram.' : null),
  },
  {
    id: 'm10', n: 10, title: 'Tempestade de Aço', sub: 'Defesa aérea', ...base, mapId: 'planicie', difficulty: 'normal',
    briefing: 'O Sindicato montou uma frota aérea. Ondas de caças e bombardeiros vão castigar nossa base. Construa Torres Antiaéreas e Blindados Antiaéreos e resista.',
    credits: 4000, ai: false, bare: true, custom: true, par: 560,
    setup: w => { w.defaultLayout(0); w.buildAt(0, 'aa', 15, 46); },
    ...(() => { const wv = waves([[['heli', 2]], [['heli', 3], ['jet', 1]], [['jet', 3]], [['bomber', 2], ['heli', 2]], [['jet', 3], ['bomber', 2]], [['bomber', 3], ['jet', 4]]], 50, 70); return { tick: wv.tick, timer: wv.timer, objectives: [{ id: 'sur', text: 'Resista às 6 ondas aéreas', hl: 'aa' as Kind, prog: wv.prog, done: wv.done }] }; })(),
    lose: c => (c.w.hasBuilding(0, 'conyard') ? null : 'O Centro de Comando caiu.'),
  },
  {
    id: 'm11', n: 11, title: 'Comboio do Rio', sub: 'Escolta', ...base, mapId: 'rio', difficulty: 'normal',
    briefing: 'Quatro Transportes Blindados precisam levar suprimentos ao posto do nordeste, atravessando o Rio das Garças. O Sindicato preparou emboscadas: abra caminho com a escolta e depois mande os transportes. Pelo menos dois precisam chegar.',
    credits: 1500, ai: false, bare: true, custom: true, par: 420,
    setup: w => {
      w.defaultLayout(0); squad(w, 0, 'apc', 4, 15, 48); squad(w, 0, 'tank', 4, 15, 45); squad(w, 0, 'flak', 1, 19, 45); squad(w, 0, 'rocket', 4, 12, 45);
      w.buildAt(0, 'power', 50, 12);
      squad(w, 1, 'rocket', 4, 28, 36); squad(w, 1, 'tank', 3, 34, 30); squad(w, 1, 'rifle', 6, 40, 22); squad(w, 1, 'buggy', 3, 44, 20); w.buildAt(1, 'bunker', 36, 28);
    },
    objectives: [{ id: 'esc', text: 'Leve 2 Transportes ao posto do nordeste', tip: 'Limpe o caminho com os tanques antes de mandar os transportes: eles são desarmados.', prog: c => `${c.w.entities.filter(e => e.team === 0 && e.alive && e.kind === 'apc' && Math.hypot(e.x - 51 * 32, e.y - 14 * 32) < 160).length}/2 chegaram`, done: c => c.w.entities.filter(e => e.team === 0 && e.alive && e.kind === 'apc' && Math.hypot(e.x - 51 * 32, e.y - 14 * 32) < 160).length >= 2 }],
    lose: c => (c.w.entities.filter(e => e.team === 0 && e.alive && e.kind === 'apc').length < 2 ? 'O comboio foi destruído.' : null),
  },
  {
    id: 'm12', n: 12, title: 'Coração do Sindicato', sub: 'Batalha final', ...base, mapId: 'dunas', difficulty: 'hard',
    briefing: 'Encontramos a última fundição do Sindicato no Mar de Dunas. Eles têm mais dinheiro e mais fábricas. Construa uma economia forte, aguente o primeiro assalto e acabe com esta guerra.',
    credits: 3000, enemyCredits: 6000, ai: true, bare: false, custom: false, par: 1300,
    setup: () => { /* escaramuça padrão */ },
    objectives: [{ id: 'win', text: 'Destrua todas as construções inimigas', done: c => c.w.winner === 0 }],
  },

  // ---------- Sindicato Ferro: missões 13 a 16 ----------
  {
    id: 'f1', n: 13, free: true, title: 'A Fundição', sub: 'Economia', ...fer, mapId: 'crateras', difficulty: 'easy',
    briefing: 'Do lado do Sindicato, a guerra é uma questão de produção. Erga a Fundição, encha os cofres e prove que a Artilharia Pesada decide batalhas antes que a Vanguarda chegue.',
    credits: 2000, ai: true, bare: false, custom: true, par: 600,
    setup: () => { /* base padrão */ },
    objectives: [
      { id: 'col', text: 'Colete 3.000 créditos de cristal', prog: c => `${Math.floor(c.w.harvested[0])}/3000`, done: c => c.w.harvested[0] >= 3000 },
      { id: 'art', text: 'Tenha 2 Artilharias Pesadas', hl: 'artillery', prog: c => `${count(c.w, 0, 'artillery')}/2`, done: c => count(c.w, 0, 'artillery') >= 2 },
    ],
  },
  {
    id: 'f2', n: 14, title: 'Martelo e Bigorna', sub: 'Cerco', ...fer, mapId: 'canions', difficulty: 'normal',
    briefing: 'A Vanguarda fortificou um posto nos Cânions do Sul. Use o alcance da Artilharia para martelar as torres enquanto os tanques seguram a linha.',
    credits: 1000, ai: false, bare: true, custom: true, par: 480,
    setup: w => {
      w.defaultLayout(0); squad(w, 0, 'artillery', 4, 13, 44); squad(w, 0, 'tank', 4, 16, 44); squad(w, 0, 'rifle', 4, 13, 48);
      fortress(w, ['power', 'radar', 'barracks', 'turret', 'turret', 'cannon', 'bunker', 'bunker']);
      squad(w, 1, 'prism', 2, 42, 20); squad(w, 1, 'rifle', 6, 40, 24);
    },
    objectives: [{ id: 'dst', text: 'Destrua o posto da Vanguarda', prog: c => `${enemyBuildings(c.w)} construções restantes`, done: c => enemyBuildings(c.w) === 0 }],
  },
  {
    id: 'f3', n: 15, title: 'Noite dos Bombardeiros', sub: 'Ataque aéreo', ...fer, mapId: 'planicie', difficulty: 'normal',
    briefing: 'Os Tanques Prisma dependem de muita energia. Mande bombardeiros contra as Usinas da Vanguarda, com caças para limpar o céu. Sem energia, as defesas deles apagam.',
    credits: 2500, ai: false, bare: true, custom: true, par: 420,
    setup: w => {
      w.defaultLayout(0); w.buildAt(0, 'helipad', 14, 45); w.buildAt(0, 'radar', 17, 47); w.buildAt(0, 'lab', 18, 50);
      squad(w, 0, 'bomber', 3, 12, 43); squad(w, 0, 'jet', 3, 15, 43);
      fortress(w, ['power', 'power', 'power', 'refinery', 'aa', 'aa', 'turret', 'barracks']);
      squad(w, 1, 'rocket', 5, 43, 18);
    },
    objectives: [{ id: 'pow', text: 'Destrua as 3 Usinas da Vanguarda', prog: c => `${3 - count(c.w, 1, 'power')}/3`, done: c => !has(c.w, 1, 'power') }],
  },
  {
    id: 'f4', n: 16, title: 'Queda da Vanguarda', sub: 'Batalha final', ...fer, mapId: 'canions', difficulty: 'hard',
    briefing: 'A Vanguarda Solar recuou para o último bastião. É agora ou nunca: o Sindicato precisa vencer antes que o Pulso Solar seja reconstruído.',
    credits: 3000, enemyCredits: 5000, ai: true, bare: false, custom: false, par: 1300,
    setup: () => { /* escaramuça padrão */ },
    objectives: [{ id: 'win', text: 'Destrua todas as construções inimigas', done: c => c.w.winner === 0 }],
  },

  // ---------- Guarda Boreal: missões 17 e 18 ----------
  {
    id: 'b1', n: 17, free: true, title: 'Inverno Eterno', sub: 'Defesa', ...bor, mapId: 'rio', difficulty: 'normal',
    briefing: 'Os mercenários do Cartel Víbora querem as minas do norte. A Guarda Boreal não recua: use a blindagem pesada e os Tanques Criogênicos para segurar cinco ondas.',
    credits: 3500, ai: false, bare: true, custom: true, par: 520,
    setup: w => { w.defaultLayout(0); w.buildAt(0, 'bunker', 15, 46); w.buildAt(0, 'bunker', 16, 50); },
    ...(() => { const wv = waves([[['buggy', 3], ['rifle', 4]], [['raider', 3], ['rifle', 4]], [['tank', 3], ['flamer', 4]], [['raider', 4], ['mlrs', 2]], [['tank', 4], ['raider', 4], ['jet', 2]]], 55, 75); return { tick: wv.tick, timer: wv.timer, objectives: [{ id: 'sur', text: 'Resista às 5 ondas do Cartel', prog: wv.prog, done: wv.done }] }; })(),
    lose: c => (c.w.hasBuilding(0, 'conyard') ? null : 'O Centro de Comando caiu.'),
  },
  {
    id: 'b2', n: 18, title: 'Avalanche', sub: 'Assalto', ...bor, mapId: 'dunas', difficulty: 'hard',
    briefing: 'O Cartel se esconde num oásis fortificado. Avance devagar, como uma avalanche: os Tanques Criogênicos aguentam o fogo e esmagam as defesas.',
    credits: 1500, ai: false, bare: true, custom: true, par: 600,
    setup: w => {
      w.defaultLayout(0); squad(w, 0, 'cryo', 4, 13, 44); squad(w, 0, 'tank', 3, 17, 44); squad(w, 0, 'flak', 2, 13, 48); squad(w, 0, 'rocket', 4, 16, 48);
      fortress(w, ['conyard', 'power', 'power', 'refinery', 'factory', 'turret', 'turret', 'turret', 'bunker', 'aa']);
      squad(w, 1, 'raider', 4, 40, 22); squad(w, 1, 'rifle', 6, 43, 22); squad(w, 1, 'heli', 2, 46, 20);
    },
    objectives: [{ id: 'dst', text: 'Destrua o oásis do Cartel', prog: c => `${enemyBuildings(c.w)} construções restantes`, done: c => enemyBuildings(c.w) === 0 }],
  },

  // ---------- Cartel Víbora: missões 19 e 20 ----------
  {
    id: 'v1', n: 19, free: true, title: 'Contrabando', sub: 'Corrida econômica', ...vib, mapId: 'dunas', difficulty: 'normal',
    briefing: 'Para o Cartel, guerra é negócio. Junte 5.000 créditos de cristal em 10 minutos, antes que a Guarda Boreal feche as rotas. Proteja seus extratores.',
    credits: 2000, ai: true, bare: false, custom: true, par: 420,
    setup: () => { /* base padrão */ },
    timer: c => `Tempo: ${fmt(600 - c.t)}`,
    lose: c => (c.t > 600 ? 'O tempo acabou: as rotas foram fechadas.' : null),
    objectives: [{ id: 'col', text: 'Colete 5.000 créditos de cristal', prog: c => `${Math.floor(c.w.harvested[0])}/5000`, done: c => c.w.harvested[0] >= 5000 }],
  },
  {
    id: 'v2', n: 20, title: 'Picada da Víbora', sub: 'Incursão', ...vib, mapId: 'planicie', difficulty: 'hard',
    briefing: 'Ataque relâmpago: destrua os Extratores e a Refinaria da Guarda Boreal em 6 minutos, usando a velocidade das Vespas. Não pare para lutar com os tanques deles.',
    credits: 800, ai: false, bare: true, custom: true, par: 300,
    setup: w => {
      w.defaultLayout(0); squad(w, 0, 'raider', 6, 13, 44); squad(w, 0, 'buggy', 4, 17, 44);
      fortress(w, ['refinery', 'refinery', 'power', 'barracks', 'turret', 'bunker']);
      squad(w, 1, 'harvester', 3, 38, 18); squad(w, 1, 'tank', 3, 30, 30); squad(w, 1, 'cryo', 1, 44, 18);
    },
    timer: c => `Tempo: ${fmt(360 - c.t)}`,
    lose: c => (c.t > 360 ? 'A Guarda Boreal reagiu a tempo.' : null),
    objectives: [
      { id: 'har', text: 'Destrua os Extratores inimigos', prog: c => `${count(c.w, 1, 'harvester')} restantes`, done: c => !has(c.w, 1, 'harvester') },
      { id: 'ref', text: 'Destrua as Refinarias inimigas', done: c => !has(c.w, 1, 'refinery') },
    ],
  },
];


export const campOf = (m: Mission): Camp => m.camp ?? 'solar';
export const CAMPS: { id: Camp; name: string; enemy: string }[] = [
  { id: 'solar', name: 'Vanguarda Solar', enemy: 'Sindicato Ferro' }, { id: 'ferro', name: 'Sindicato Ferro', enemy: 'Vanguarda Solar' },
  { id: 'boreal', name: 'Guarda Boreal', enemy: 'Cartel Víbora' }, { id: 'viboras', name: 'Cartel Víbora', enemy: 'Guarda Boreal' },
];
/** próxima missão da mesma campanha */
export const nextMission = (m: Mission): Mission | undefined => {
  if (DEMO) return MISSIONS.filter(x => DEMO_IDS.includes(x.id))[DEMO_IDS.indexOf(m.id) + 1];
  const list = MISSIONS.filter(x => campOf(x) === campOf(m));
  return list[list.indexOf(m) + 1];
};
void TILE;
