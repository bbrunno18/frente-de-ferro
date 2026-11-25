import { DEFS, Kind, STRUCTURES, INFANTRY, VEHICLES, AIRCRAFT, Category, FACTIONS, Team } from '../config';
import { icon } from './sprites';
import { Minimap } from './Minimap';
import { tooltip } from './Tooltip';
import type { World } from '../systems/World';

export interface SidebarHandlers {
  onItem(kind: Kind): void;
  onCancel(kind: Kind): void;
  onNav(wx: number, wy: number): void;
  onToggleBox(): boolean;
  onSelectAll(): void;
  onClear(): void;
  onAMove(): boolean;
  onSell(): void;
  onStop(): void;
  onRepair(): void;
  onRally(): boolean;
  onSuper(): boolean;
  onPatrol(): boolean;
  onHold(): void;
  onUnload(): void;
  onMenu(): void;
}

interface ItemRef {
  kind: Kind; el: HTMLButtonElement; shade: HTMLDivElement; tag: HTMLSpanElement; badge: HTMLSpanElement; x: HTMLSpanElement;
}
type TabId = 'structure' | 'infantry' | 'vehicle' | 'air';
const TABS: { id: TabId; label: string; ico: string; kinds: Kind[] }[] = [
  { id: 'structure', label: 'Base', ico: '🏗', kinds: STRUCTURES },
  { id: 'infantry', label: 'Infantaria', ico: '🪖', kinds: INFANTRY },
  { id: 'vehicle', label: 'Veículos', ico: '🛞', kinds: VEHICLES },
  { id: 'air', label: 'Aéreo', ico: '🚁', kinds: AIRCRAFT },
];

const stat = (k: string, v: string) => `<div class="ts"><span>${k}</span><b>${v}</b></div>`;
export function describe(kind: Kind): string {
  const d = DEFS[kind];
  const rows: string[] = [];
  rows.push(stat('Custo', `◆ ${d.cost}`));
  rows.push(stat('Vida', String(d.hp)));
  if (d.damage > 0) {
    rows.push(stat('Dano', `${d.damage}${d.splash ? ' (área)' : ''}`));
    rows.push(stat('Alcance', `${d.range} tiles`));
    rows.push(stat('Alvos', d.targets === 'air' ? 'só aéreos' : d.targets === 'ground' ? 'só terrestres' : 'terra e ar'));
  }
  if (d.damage > 0) {
    const N: Record<string, string> = { inf: 'Infantaria', veh: 'Veículos', bld: 'Construções', air: 'Aéreos' };
    const ok = (Object.keys(d.vs) as (keyof typeof d.vs)[]).filter(k => d.vs[k] >= 1.2 && (k !== 'air' || d.targets !== 'ground')).map(k => N[k]);
    const bad = (Object.keys(d.vs) as (keyof typeof d.vs)[]).filter(k => d.vs[k] <= 0.5 && (k !== 'air' || d.targets !== 'ground')).map(k => N[k]);
    if (ok.length) rows.push(`<div class="tg">▲ Forte contra: ${ok.join(', ')}</div>`);
    if (bad.length) rows.push(`<div class="tb">▼ Fraco contra: ${bad.join(', ')}</div>`);
  }
  if (!d.building) rows.push(stat('Velocidade', `${Math.round(d.speed)}`));
  if (d.power) rows.push(stat('Energia', `${d.power > 0 ? '+' : ''}${d.power}`));
  return `<div class="tn">${d.name}</div><div class="td">${d.desc}</div>${rows.join('')}`;
}

export class Sidebar {
  private credits!: HTMLElement;
  private powerFill!: HTMLElement;
  private powerText!: HTMLElement;
  private items: ItemRef[] = [];
  private tabBtns = new Map<TabId, HTMLButtonElement>();
  private lists = new Map<TabId, HTMLElement>();
  private shownCr = 0;
  minimap: Minimap;

  constructor(private root: HTMLElement, private world: World, private me: Team, private h: SidebarHandlers) {
    root.innerHTML = '';
    const f = world.teams[me].faction, P = FACTIONS[f];
    root.style.setProperty('--fac', P.main);
    root.style.setProperty('--fac2', P.accent);
    root.innerHTML = `
      <div class="sb-top">
        <div class="emblem" title="${P.name}"><span></span></div>
        <div class="credits"><span class="coin">◆</span><span id="sb-cr">0</span></div>
        <button id="sb-menu" class="mini" title="Pausa">☰</button>
      </div>
      <div class="radar-row">
        <div class="power" title="Energia"><div class="power-fill" id="sb-pf"></div></div>
        <div class="radar-slot"></div>
      </div>
      <div class="power-text" id="sb-pt"></div>
      <div class="tabs"></div>
      <div class="lists"></div>
      <div class="actions">
        <button id="sb-box" title="Caixa de seleção">▭<i>Caixa</i></button>
        <button id="sb-all" title="Selecionar todo o exército">⚔<i>Exército</i></button>
        <button id="sb-clear" title="Limpar seleção">✖<i>Limpar</i></button>
        <button id="sb-amove" title="Atacar-mover: toque no destino">⚑<i>Atacar</i></button>
        <button id="sb-stop" title="Parar">■<i>Parar</i></button>
        <button id="sb-sell" title="Vender construção selecionada (50%)">$<i>Vender</i></button>
        <button id="sb-rep" title="Reparar construção selecionada (custa 12% do valor)">🔧<i>Reparar</i></button>
        <button id="sb-rally" title="Ponto de reunião: novas tropas vão para lá">📍<i>Reunião</i></button>
        <button id="sb-patrol" title="Patrulhar: toque no destino, as tropas vão e voltam atacando">↔<i>Patrulha</i></button>
        <button id="sb-hold" title="Guardar posição: não persegue, só atira no que chega perto">🛡<i>Guardar</i></button>
        <button id="sb-unload" title="Descer: desembarca os soldados do transporte selecionado">⬇<i>Descer</i></button>
        <button id="sb-sp" class="sp" title="Superpoder (exige Central de Radar)">${FACTIONS[f].power === 'pulse' ? '☀' : '💥'}<i>Poder</i></button>
      </div>`;
    this.credits = root.querySelector('#sb-cr')!;
    this.powerFill = root.querySelector('#sb-pf')!;
    this.powerText = root.querySelector('#sb-pt')!;
    this.minimap = new Minimap(world, me, h.onNav);
    root.querySelector('.radar-slot')!.append(this.minimap.canvas);
    root.querySelector('#sb-menu')!.addEventListener('click', () => h.onMenu());
    const box = root.querySelector('#sb-box') as HTMLButtonElement;
    box.addEventListener('click', () => { box.classList.toggle('on', h.onToggleBox()); });
    root.querySelector('#sb-all')!.addEventListener('click', () => h.onSelectAll());
    root.querySelector('#sb-clear')!.addEventListener('click', () => h.onClear());
    const am = root.querySelector('#sb-amove') as HTMLButtonElement;
    am.addEventListener('click', () => { am.classList.toggle('on', h.onAMove()); });
    root.querySelector('#sb-stop')!.addEventListener('click', () => h.onStop());
    root.querySelector('#sb-sell')!.addEventListener('click', () => h.onSell());
    root.querySelector('#sb-rep')!.addEventListener('click', () => h.onRepair());
    const ra = root.querySelector('#sb-rally') as HTMLButtonElement;
    ra.addEventListener('click', () => { ra.classList.toggle('on', h.onRally()); });
    const pat = root.querySelector('#sb-patrol') as HTMLButtonElement;
    pat.addEventListener('click', () => { pat.classList.toggle('on', h.onPatrol()); });
    root.querySelector('#sb-hold')!.addEventListener('click', () => h.onHold());
    root.querySelector('#sb-unload')!.addEventListener('click', () => h.onUnload());
    const spb = root.querySelector('#sb-sp') as HTMLButtonElement;
    spb.addEventListener('click', () => { spb.classList.toggle('on', h.onSuper()); });

    const tabsEl = root.querySelector('.tabs')!, listsEl = root.querySelector('.lists')!;
    for (const t of TABS) {
      const b = document.createElement('button');
      b.innerHTML = `<span>${t.ico}</span><i>${t.label}</i>`; b.title = t.label;
      b.addEventListener('click', () => this.setTab(t.id));
      tabsEl.append(b); this.tabBtns.set(t.id, b);
      const list = document.createElement('div'); list.className = 'items';
      listsEl.append(list); this.lists.set(t.id, list);
      for (const kind of t.kinds) {
        const d = DEFS[kind];
        if (d.only && d.only !== f) continue;
        const el = document.createElement('button');
        el.className = 'item';
        const ic = icon(kind, f, 76, 56); ic.className = 'icon';
        el.append(ic);
        const shade = document.createElement('div'); shade.className = 'shade'; el.append(shade);
        const tag = document.createElement('span'); tag.className = 'tag'; el.append(tag);
        const badge = document.createElement('span'); badge.className = 'badge'; el.append(badge);
        const x = document.createElement('span'); x.className = 'cancel'; x.textContent = '✖'; el.append(x);
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = d.name; el.append(nm);
        const cost = document.createElement('span'); cost.className = 'cost'; cost.textContent = `◆ ${d.cost}`; el.append(cost);
        el.addEventListener('click', () => h.onItem(kind));
        x.addEventListener('click', ev => { ev.stopPropagation(); h.onCancel(kind); });
        el.addEventListener('pointerenter', ev => {
          if (ev.pointerType === 'touch') return;
          const miss = d.req.filter(r => !world.hasBuilding(me, r)).map(r => DEFS[r].name);
          const r = el.getBoundingClientRect();
          tooltip.show(describe(kind) + (miss.length ? `<div class="tr">Requer: ${miss.join(', ')}</div>` : ''), r.left, r.top + r.height / 2, 'left');
        });
        el.addEventListener('pointerleave', () => tooltip.hide());
        list.append(el);
        this.items.push({ kind, el, shade, tag, badge, x });
      }
    }
    this.setTab('structure');
  }

  private setTab(id: TabId) {
    for (const [k, b] of this.tabBtns) b.classList.toggle('active', k === id);
    for (const [k, l] of this.lists) l.classList.toggle('hidden', k !== id);
  }

  /** Faz pulsar o item (e a aba) indicado — usado no tutorial. */
  highlight(kind: Kind | null) {
    for (const it of this.items) it.el.classList.toggle('hl', it.kind === kind);
    TABS.forEach(t => this.tabBtns.get(t.id)?.classList.toggle('hl', !!kind && t.kinds.includes(kind)));
  }
  setMode(rally: boolean, sp: boolean, patrol = false) { this.root.querySelector('#sb-rally')?.classList.toggle('on', rally); this.root.querySelector('#sb-sp')?.classList.toggle('on', sp); this.root.querySelector('#sb-patrol')?.classList.toggle('on', patrol); }
  setAMove(on: boolean) { this.root.querySelector('#sb-amove')?.classList.toggle('on', on); }

  update(cam: { x: number; y: number; w: number; h: number }) {
    const w = this.world, t = w.teams[this.me];
    this.shownCr += (t.credits - this.shownCr) * 0.35;
    if (Math.abs(t.credits - this.shownCr) < 1) this.shownCr = t.credits;
    this.credits.textContent = String(Math.floor(this.shownCr));
    const mx = Math.max(t.power, t.usage, 1);
    this.powerFill.style.height = `${Math.min(100, (t.power / mx) * 100)}%`;
    this.powerFill.classList.toggle('low', t.low);
    this.powerText.textContent = t.low ? `⚡ ${t.power}/${t.usage} — BAIXA` : `⚡ ${t.power} / ${t.usage}`;
    this.powerText.classList.toggle('low', t.low);
    const spb = this.root.querySelector('#sb-sp') as HTMLElement | null;
    if (spb) {
      const hasRadar = w.hasBuilding(this.me, 'radar'), i = spb.querySelector('i')!;
      const txt = !hasRadar ? 'Radar' : t.sp > 0 ? `${Math.ceil(t.sp)}s` : 'PRONTO';
      if (i.textContent !== txt) i.textContent = txt;
      spb.classList.toggle('ready', hasRadar && t.sp <= 0);
      spb.classList.toggle('off', !hasRadar || t.sp > 0);
    }
    for (const it of this.items) {
      const d = DEFS[it.kind];
      const cat: Category = d.category;
      const q = t.queues[cat];
      const head = q[0];
      const avail = w.canBuild(this.me, it.kind);
      const mine = q.filter(i => i.kind === it.kind).length;
      const active = head && head.kind === it.kind;
      const ready = d.building && active && head.progress >= 1;
      it.el.classList.toggle('locked', !avail);
      it.el.classList.toggle('poor', avail && t.credits < d.cost);
      it.el.classList.toggle('busy', d.building && it.kind !== 'wall' && !!head && !active);
      it.el.classList.toggle('ready', !!ready);
      it.shade.style.height = active && !ready ? `${(1 - head.progress) * 100}%` : '0%';
      it.tag.textContent = ready ? 'PRONTO' : active ? `${Math.floor(head.progress * 100)}%` : !avail ? '🔒' : '';
      it.badge.textContent = !d.building && mine > 0 ? String(mine) : '';
      it.x.style.display = mine > 0 ? 'block' : 'none';
    }
    this.minimap.draw(cam);
  }

  destroy() { tooltip.hide(); this.root.innerHTML = ''; }
}
