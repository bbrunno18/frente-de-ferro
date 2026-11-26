import { DIFFS, FACTIONS, MAPS, TILE, Difficulty, Faction, Kind, MatchOpts, Slot, TEAMS, TEAM_COLORS, ALLIANCE_NAMES, MapSize, Team, setMapSize } from '../config';
import { generateMap, BASE_CENTERS } from '../systems/MapGen';
import { drawTerrain } from './sprites';
import { Storage } from '../systems/Storage';
import { sfx } from '../audio/Sfx';
import { NetSession, NetMsg, MAX_PEERS } from '../systems/Net';
import { modelIcon } from './models';
import { music } from '../audio/Music';
import { MISSIONS, Mission, missionOpts, CAMPS, campOf, Camp } from '../campaign/missions';
import { DEMO, DEMO_IDS } from '../demo';
import { ACH, Achievements } from '../systems/Achievements';
import { LORE, BLAMES } from '../campaign/lore';
import { Purchases, PRICE_LABEL, FREE_MISSIONS } from '../systems/Purchases';
import { storePrice } from '../systems/billing-native';

const HERO: Record<Faction, Kind> = { solar: 'prism', ferro: 'artillery', boreal: 'tank', viboras: 'buggy' };
const prevCache = new Map<string, HTMLCanvasElement>();
/** configuração da prévia: tamanho do mapa e times ativos (atualizada a cada render do menu) */
let prevSize: MapSize = 64; let prevTeams: Team[] = [0, 1];
/** prévia real do mapa: o próprio terreno gerado, com bases (na cor de cada time) e campos de cristal */
function drawPreview(cv: HTMLCanvasElement, id: string) {
  const size = prevSize, teams = prevTeams, key = `${id}:${size}:${teams.join('')}`;
  let src = prevCache.get(key);
  if (!src) {
    const m = MAPS.find(x => x.id === id); if (!m) return;
    const md = generateMap(m.seed, m.rocks, m.water ?? 0.4, size, teams);
    const centers = size === 96 ? BASE_CENTERS[96] : BASE_CENTERS[64];
    const bases = teams.map(t => ({ t, x: (centers[t][0] + 0.5) * TILE, y: (centers[t][1] + 0.5) * TILE }));
    src = document.createElement('canvas'); src.width = 320; src.height = 320;
    const c = src.getContext('2d')!;
    c.drawImage(drawTerrain(md.terrain, md.crystalMax, m.biome, bases), 0, 0, 320, 320);
    const k = 320 / (size * TILE), r = size === 96 ? 1.8 : 2.6;
    for (let i = 0; i < md.terrain.length; i++) {
      const x = ((i % size) + 0.5) * TILE * k, y = (Math.floor(i / size) + 0.5) * TILE * k;
      if (md.terrain[i] === 1) { c.fillStyle = 'rgba(40,40,44,.85)'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
      else if (md.crystalMax[i] > 0) { c.fillStyle = 'rgba(90,220,255,.9)'; c.fillRect(x - 1, y - 1, 2.2, 2.2); }
    }
    bases.forEach(b => { c.fillStyle = TEAM_COLORS[b.t].main; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.fillRect(b.x * k - 5, b.y * k - 5, 10, 10); c.strokeRect(b.x * k - 5, b.y * k - 5, 10, 10); });
    const g = c.createRadialGradient(160, 160, 90, 160, 160, 230); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); c.fillStyle = g; c.fillRect(0, 0, 320, 320);
    setMapSize(64); // a prévia não deve deixar o tamanho global alterado
    prevCache.set(key, src);
  }
  const x = cv.getContext('2d')!;
  if (size === 96) { // mapa grande: quadrado inteiro, centralizado
    x.clearRect(0, 0, cv.width, cv.height);
    const h = cv.height, w = h; x.drawImage(src, 0, 0, 320, 320, (cv.width - w) / 2, 0, w, h);
  } else x.drawImage(src, 0, 40, 320, 240, 0, 0, cv.width, cv.height); // diagonal entre as bases
}

/** Tela inicial: Escaramuça, dificuldade da IA, facção, mapa e configurações de áudio. */
export class Menu {
  private el: HTMLElement;
  private net: NetSession | null = null;
  private camp: Camp = 'solar';

  constructor(private parent: HTMLElement, private onPlay: (o: Omit<MatchOpts, 'onExit'>) => void) {
    this.el = document.createElement('div');
    this.el.id = 'menu';
    parent.append(this.el);
    this.render();
    // navegadores só liberam áudio após um gesto: o primeiro toque no menu inicia a trilha
    this.el.addEventListener('pointerdown', () => { sfx.unlock(); if (!this.el.classList.contains('hidden')) music.play('menu'); });
    const code = new URLSearchParams(location.search).get('sala');
    if (code) setTimeout(() => this.lobby('join', code), 50);
  }

  show() { this.el.classList.remove('hidden'); this.render(); music.play('menu'); }
  hide() { this.el.classList.add('hidden'); }

  private render() {
    const s = Storage.data;
    const wins = s.wins, maps = MAPS, facs = Object.keys(FACTIONS) as Faction[];
    const DIFF_ICO: Record<Difficulty, string> = { easy: '★', normal: '★★', hard: '★★★' };
    const diffBtns = (Object.keys(DIFFS) as Difficulty[]).map(d =>
      `<button data-diff="${d}" class="seg ${s.difficulty === d ? 'on' : ''}"><b>${DIFFS[d].label}</b><i>${DIFF_ICO[d]}</i></button>`).join('');
    const bar = (label: string, v: number) => `<div class="fb"><span>${label}</span><em><u style="width:${Math.max(12, Math.min(100, Math.round(v / 1.4 * 100)))}%"></u></em></div>`;
    const facBtns = facs.map(f => { const F = FACTIONS[f]; return `
      <button data-fac="${f}" class="wfac ${s.faction === f ? 'on' : ''}" style="--c:${F.main};--a:${F.accent}">
        <span class="wfico" data-ico="${f}"></span>
        <span class="wfbody"><b class="fname">${F.name}</b><small>${F.role}</small>
          <span class="fbars">${bar('Blindagem', F.hpMul)}${bar('Velocidade', F.speedMul)}${bar('Alcance', F.rangeMul)}${bar('Energia', F.powerMul * F.inc)}</span>
          <em class="fperk">${F.perk}</em><em class="fexcl">${F.excl}</em></span>
      </button>`; }).join('');
    const enemyBtns = (['auto', ...facs] as const).map(f =>
      `<button data-enemy="${f}" class="chip ${s.enemy === f ? 'on' : ''}" ${f === 'auto' ? '' : `style="--c:${FACTIONS[f].main}"`}>${f === 'auto' ? '🎲 Aleatório' : `<i></i>${FACTIONS[f].name}`}</button>`).join('');
    const mapCards = maps.map(m => {
      const locked = wins < m.unlockWins;
      return `<button data-map="${m.id}" class="wmap ${s.mapId === m.id ? 'on' : ''} ${locked ? 'locked' : ''}" ${locked ? 'disabled' : ''}>
        <canvas data-prev="${m.id}" width="160" height="100"></canvas>
        <b>${m.name}</b><small>${locked ? `🔒 ${m.unlockWins} vitória${m.unlockWins > 1 ? 's' : ''}` : m.biome === 'grass' ? 'Campo' : 'Deserto'}</small></button>`;
    }).join('');
    const map = maps.find(m => m.id === s.mapId) ?? maps[0];
    // ---- jogadores / alianças / tamanho do mapa
    const np = Math.max(2, Math.min(4, s.players || 2));
    const al = (i: number) => s.alliances?.[i] ?? i;
    const facOpts = (cur: string) => (['auto', ...facs] as const).map(f => `<option value="${f}" ${cur === f ? 'selected' : ''}>${f === 'auto' ? '🎲 Aleatório' : FACTIONS[f].name}</option>`).join('');
    const slotRows = Array.from({ length: np }, (_, i) => {
      const who = i === 0 ? `<span class="sl-name">Você · ${FACTIONS[s.faction].name}</span>`
        : `<span class="sl-name">IA ${i}</span><select data-sfac="${i}">${facOpts(i === 1 ? s.enemy : (s.slotFac?.[i - 2] ?? 'auto'))}</select>`;
      return `<div class="slot-row" style="--c:${TEAM_COLORS[i].main}"><i></i>${who}<span class="als">${ALLIANCE_NAMES.map((a, k) => `<button data-al="${i}:${k}" class="chip tiny ${al(i) === k ? 'on' : ''}">${a}</button>`).join('')}</span></div>`;
    }).join('');
    const alSet = new Set(Array.from({ length: np }, (_, i) => al(i)));
    const bigMap = np >= 3 || s.mapSize === 96;
    const playersBlock = `<h4>Jogadores</h4>
      <div class="chips">${[2, 3, 4].map(n => `<button data-np="${n}" class="chip ${np === n ? 'on' : ''}">${n} Jogadores</button>`).join('')}</div>
      <div class="slots">${slotRows}</div>
      <div class="chips">${np === 4 ? '<button data-preset="2v2" class="chip">Equipes 2 contra 2</button>' : ''}${np >= 3 ? '<button data-preset="ffa" class="chip">Todos contra todos</button>' : ''}</div>
      <small class="hint">Mesma letra = aliados. Letras diferentes = inimigos.</small>
      ${alSet.size < 2 ? '<p class="hint warn">⚠ Escolha ao menos duas alianças diferentes.</p>' : ''}
      <h4>Tamanho do mapa</h4>
      <div class="chips"><button data-msz="64" class="chip ${!bigMap ? 'on' : ''}" ${np >= 3 ? 'disabled' : ''}>Normal 64×64</button><button data-msz="96" class="chip ${bigMap ? 'on' : ''}">Grande 96×96</button></div>`;
    const MOODTXT: Record<string, string> = { planicie: 'Fim de manhã · céu aberto', crateras: 'Nublado · luz rasante', rio: 'Úmido · neblina baixa', dunas: 'Tarde dourada · calor', canions: 'Pôr do sol · sombras longas' };
    this.el.innerHTML = `
      <div class="bf-bg"><div class="bf-glow"></div><div class="bf-city"></div><div class="bf-smoke"></div>${Array.from({ length: 16 }, (_, i) => `<span class="ember" style="--i:${i}"></span>`).join('')}<div class="bf-grain"></div></div>
      <div class="war-wrap">
        <header class="war-head">
          <div class="war-brand"><div class="war-kicker">⚠ ESTADO DE GUERRA · ANO 34</div><div class="logo"><span>FRENTE DE</span><b>FERRO</b></div></div>
          <div class="war-sub">${FACTIONS[s.faction].name} <i>×</i> ${s.enemy === 'auto' ? 'Inimigo aleatório' : FACTIONS[s.enemy].name}</div>
        </header>
        <div class="war-cols">
          <section class="wpanel">
            <h3><i>01</i>Escolha seu exército</h3>
            <div class="wfacs">${facBtns}</div>
            <h4>Exército inimigo</h4>
            <div class="chips">${enemyBtns}</div>
          </section>
          <section class="wpanel">
            <h3><i>02</i>Configure a partida</h3>
            <h4>Dificuldade da IA</h4>
            <div class="segs">${diffBtns}</div>
            <h4>Regras da partida</h4>
            <div class="rules">
              <div><small>Créditos iniciais</small><div class="chips">${[2000, 5000, 10000].map(v => `<button data-cr="${v}" class="chip ${s.startCredits === v ? 'on' : ''}">◆ ${v.toLocaleString('pt-BR')}</button>`).join('')}</div></div>
              <div><small>Velocidade</small><div class="chips">${([[0.75, 'Lenta'], [1, 'Normal'], [1.35, 'Rápida']] as const).map(([v, l]) => `<button data-spd="${v}" class="chip ${(s.gameSpeed || 1) === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
              <div><small>Superpoderes</small><div class="chips"><button data-sup="1" class="chip ${s.supers !== false ? 'on' : ''}">Ligados</button><button data-sup="0" class="chip ${s.supers === false ? 'on' : ''}">Desligados</button></div></div>
              <div><small>Névoa de guerra</small><div class="chips"><button data-fog="1" class="chip ${s.fogOn !== false ? 'on' : ''}">Ligada</button><button data-fog="0" class="chip ${s.fogOn === false ? 'on' : ''}">Mapa revelado</button></div></div>
            </div>
            ${playersBlock}
            <h4>Teatro de operações</h4>
            <div class="wmaps">${mapCards}</div>
            <div class="wintel"><canvas data-prev="${map.id}" data-big="1" width="260" height="160"></canvas>
              <div><small>LEITURA TÁTICA</small><b>${map.name}</b><p>${map.desc}</p>
              <div class="tags"><span>${MOODTXT[map.id] ?? ''}</span><span>${map.rocks > 80 ? 'Terreno fechado' : map.rocks > 50 ? 'Obstáculos médios' : 'Terreno aberto'}</span>${map.water ? '<span>Água / pontes</span>' : ''}</div></div></div>
            <div class="menu-actions">
              <button id="m-camp" class="big camp">🎖 Campanha <small>${Object.values(s.campaign).filter(v => v > 0).length}/${DEMO ? DEMO_IDS.length : MISSIONS.length}</small></button>
              <button id="m-play" class="big go" ${alSet.size < 2 ? 'disabled' : ''}>▶ Jogar Escaramuça</button>
              ${DEMO ? '' : '<button id="m-online" class="big alt">🌐 Jogar Online (até 4)</button>'}
              <button id="m-ach" class="big alt">🏅 Conquistas <small>${ACH.filter(a => Achievements.has(a.id)).length}/${ACH.length}</small></button>
              <button id="m-audio">🔊 Configurações</button>
            </div>
          </section>
        </div>
        <div class="stats">Vitórias <b>${s.wins}</b> · Derrotas <b>${s.losses}</b> · Fácil ${s.winsByDiff.easy} / Normal ${s.winsByDiff.normal} / Difícil ${s.winsByDiff.hard}</div>
      </div>
      <div class="audio-modal hidden" id="m-audiomodal">
        <div class="panel">
          <h2>Áudio</h2>
          <label class="vol">Volume <input id="m-vol" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}"></label>
          <label class="vol">Música <input id="m-mus" type="range" min="0" max="100" value="${Math.round(s.musicVolume * 100)}"></label>
          <label class="vol">Idioma <select id="m-lang">${(['auto', 'pt', 'en'] as const).map(l => `<option value="${l}" ${s.lang === l ? 'selected' : ''}>${{ auto: 'Auto', pt: 'Português', en: 'English' }[l]}</option>`).join('')}</select></label>
          <label class="vol">Gráficos
            <select id="m-qual">${(['auto', 'low', 'med', 'high'] as const).map(q => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${{ auto: 'Automático', low: 'Baixo (economiza bateria)', med: 'Médio', high: 'Alto (bloom e sombras)' }[q]}</option>`).join('')}</select></label>
          <label class="vol"><input id="m-mute" type="checkbox" ${s.muted ? 'checked' : ''}> Silenciar tudo</label>
          <div class="btns"><button id="m-test">Testar som</button><button id="m-close">Fechar</button></div>
        </div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => this.el.querySelector(sel) as T;
    // ilustrações 3D (renderizadas dos próprios modelos do jogo) e prévias reais dos mapas
    prevSize = bigMap ? 96 : 64; prevTeams = TEAMS.slice(0, np);
    requestAnimationFrame(() => {
      this.el.querySelectorAll<HTMLElement>('[data-ico]').forEach(el => {
        const f = el.dataset.ico as Faction;
        const a = modelIcon('conyard', f, 130, 90, { bg: false }), b = modelIcon(HERO[f], f, 130, 90, { bg: false, rot: 0.5 });
        if (a) el.append(a); if (b) el.append(b);
      });
      const cvs = Array.from(this.el.querySelectorAll<HTMLCanvasElement>('canvas[data-prev]'));
      cvs.forEach((cv, i) => setTimeout(() => { if (cv.isConnected) drawPreview(cv, cv.dataset.prev!); }, 30 + i * 40));
    });
    const pick = (sel: string, f: (b: HTMLButtonElement) => void) => this.el.querySelectorAll<HTMLButtonElement>(sel).forEach(b => b.addEventListener('click', () => { sfx.unlock(); sfx.click(); f(b); Storage.save(); this.render(); }));
    pick('[data-cr]', b => { s.startCredits = Number(b.dataset.cr); });
    pick('[data-spd]', b => { s.gameSpeed = Number(b.dataset.spd); });
    pick('[data-sup]', b => { s.supers = b.dataset.sup === '1'; });
    pick('[data-np]', b => { s.players = Number(b.dataset.np); if (s.players >= 3) s.mapSize = 96; });
    pick('[data-msz]', b => { s.mapSize = Number(b.dataset.msz) as 64 | 96; });
    pick('[data-al]', b => { const [i, k] = b.dataset.al!.split(':').map(Number); s.alliances = [...(s.alliances ?? [0, 1, 2, 3])]; s.alliances[i] = k; });
    pick('[data-preset]', b => { s.alliances = b.dataset.preset === '2v2' ? [0, 1, 0, 1] : [0, 1, 2, 3]; });
    this.el.querySelectorAll<HTMLSelectElement>('[data-sfac]').forEach(sel => sel.addEventListener('change', () => {
      const i = Number(sel.dataset.sfac), v = sel.value as 'auto' | Faction;
      if (i === 1) s.enemy = v; else { s.slotFac = [...(s.slotFac ?? ['auto', 'auto'])]; s.slotFac[i - 2] = v; }
      sfx.click(); Storage.save(); this.render();
    }));
    pick('[data-fog]', b => { s.fogOn = b.dataset.fog === '1'; });
    this.el.querySelectorAll<HTMLButtonElement>('[data-enemy]').forEach(b => b.addEventListener('click', () => { sfx.unlock(); sfx.click(); s.enemy = b.dataset.enemy as typeof s.enemy; Storage.save(); this.render(); }));
    this.el.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach(b => b.addEventListener('click', () => { sfx.unlock(); sfx.click(); s.difficulty = b.dataset.diff as Difficulty; Storage.save(); this.render(); }));
    this.el.querySelectorAll<HTMLButtonElement>('[data-fac]').forEach(b => b.addEventListener('click', () => { sfx.unlock(); sfx.click(); s.faction = b.dataset.fac as Faction; Storage.save(); this.render(); }));
    this.el.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(b => b.addEventListener('click', () => { sfx.unlock(); sfx.click(); s.mapId = b.dataset.map!; Storage.save(); this.render(); }));
    q('#m-play').addEventListener('click', () => {
      sfx.unlock(); sfx.ready();
      const pool = (Object.keys(FACTIONS) as Faction[]).filter(f => f !== s.faction);
      const rnd = (l: Faction[]) => l[Math.floor(Math.random() * l.length)];
      const enemyFaction = s.enemy === 'auto' ? rnd(pool) : s.enemy;
      const slots: Slot[] = TEAMS.map(t => t >= np
        ? { active: false, type: 'empty', faction: 'solar', alliance: t }
        : t === 0 ? { active: true, type: 'human', faction: s.faction, alliance: al(0) }
        : { active: true, type: 'ai', difficulty: s.difficulty, alliance: al(t),
            faction: t === 1 ? enemyFaction : ((s.slotFac?.[t - 2] ?? 'auto') === 'auto' ? rnd(Object.keys(FACTIONS) as Faction[]) : s.slotFac[t - 2] as Faction) });
      if (new Set(slots.filter(x => x.active).map(x => x.alliance)).size < 2) return;
      this.onPlay({ difficulty: s.difficulty, faction: s.faction, enemyFaction, mapId: s.mapId, role: 'solo', credits: s.startCredits || 2000, noSuper: s.supers === false, noFog: s.fogOn === false,
        slots, mapSize: (np >= 3 ? 96 : s.mapSize === 96 ? 96 : 64) as MapSize });
    });
    q('#m-camp').addEventListener('click', () => { sfx.unlock(); sfx.click(); this.openCampaign(); });
    q('#m-ach').addEventListener('click', () => { sfx.unlock(); sfx.click(); this.openAch(); });
    q('#m-online')?.addEventListener('click', () => { sfx.unlock(); sfx.click(); this.lobby('menu'); });
    const modal = q('#m-audiomodal');
    q('#m-audio').addEventListener('click', () => { sfx.unlock(); modal.classList.remove('hidden'); });
    q<HTMLInputElement>('#m-mus').addEventListener('input', e => { s.musicVolume = Number((e.target as HTMLInputElement).value) / 100; music.setVolume(s.musicVolume); Storage.save(); });
    q<HTMLSelectElement>('#m-lang').addEventListener('change', e => { s.lang = (e.target as HTMLSelectElement).value as typeof s.lang; Storage.save(); setTimeout(() => location.reload(), 150); });
    q<HTMLSelectElement>('#m-qual').addEventListener('change', e => { s.quality = (e.target as HTMLSelectElement).value as typeof s.quality; Storage.save(); });
    q('#m-close').addEventListener('click', () => modal.classList.add('hidden'));
    q<HTMLInputElement>('#m-vol').addEventListener('input', e => { s.volume = Number((e.target as HTMLInputElement).value) / 100; sfx.setVolume(s.volume); Storage.save(); });
    q<HTMLInputElement>('#m-mute').addEventListener('change', e => { s.muted = (e.target as HTMLInputElement).checked; sfx.setMuted(s.muted); music.setVolume(s.muted ? 0 : s.musicVolume); Storage.save(); });
    q('#m-test').addEventListener('click', () => { sfx.unlock(); sfx.shoot('rocket'); setTimeout(() => sfx.boom(1.5), 250); setTimeout(() => sfx.alert(), 700); });
  }

  // ---------- Campanha ----------
  openCampaign() {
    this.el.querySelector('.camp-wrap')?.remove();
    const s = Storage.data;
    const wrap = document.createElement('div');
    wrap.className = 'audio-modal camp-wrap';
    let camp: Camp = this.camp;
    const poolOf = (c: Camp) => DEMO ? MISSIONS.filter(m => DEMO_IDS.includes(m.id)) : MISSIONS.filter(m => campOf(m) === c);
    let pool = poolOf(camp);
    const unlocked = (m: Mission) => { const i = pool.indexOf(m); return i === 0 || (s.campaign[pool[i - 1].id] ?? 0) > 0; };
    const close = () => wrap.remove();
    const list = () => {
      pool = poolOf(camp); const C = CAMPS.find(x => x.id === camp)!;
      const tabs = DEMO ? '' : `<div class="ctabs">${CAMPS.map(x => { const n = poolOf(x.id), d = n.filter(m => (s.campaign[m.id] ?? 0) > 0).length; return `<button data-camp="${x.id}" class="${x.id === camp ? 'on' : ''}" style="--c:${FACTIONS[x.id].main}"><i></i>${x.name}<small>${d}/${n.length}</small></button>`; }).join('')}</div>`;
      wrap.innerHTML = `<div class="panel camp"><h2>Campanha · ${C.name}</h2>${tabs}
        <div class="camp-sub">${DEMO ? 'DEMO: 2 missões para você testar.' : `${pool.length} missões contra: ${C.enemy}.`} Termine rápido para ganhar até 3 estrelas.${DEMO ? '' : Purchases.owned() ? ' · 💎 Edição Completa' : ` · Grátis: missões 1–${FREE_MISSIONS} e a 1ª de cada campanha extra`}</div>
        <div class="mgrid">${pool.map(m => {
          const st = s.campaign[m.id] ?? 0, pay = Purchases.isLocked(m), lock = !pay && !unlocked(m);
          return `<button class="mcard ${lock ? 'locked' : ''} ${pay ? 'paid' : ''} ${st ? 'done' : ''}" data-m="${m.id}" ${lock ? 'disabled' : ''}>
            <span class="mn">${pay ? '💎' : lock ? '🔒' : m.n}</span><b>${m.title}</b><i>${m.sub}</i><span class="st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span></button>`;
        }).join('')}</div>
        <div class="btns"><button id="cp-close">Voltar</button><button id="cp-lore">📜 A Origem da Guerra</button></div></div>`;
      wrap.querySelectorAll<HTMLButtonElement>('[data-camp]').forEach(b => b.addEventListener('click', () => { sfx.click(); camp = this.camp = b.dataset.camp as Camp; list(); }));
      wrap.querySelector('#cp-lore')!.addEventListener('click', () => { sfx.click(); this.openLore(() => list()); });
      wrap.querySelector('#cp-close')!.addEventListener('click', () => { sfx.click(); close(); });
      wrap.querySelectorAll<HTMLButtonElement>('[data-m]').forEach(b => b.addEventListener('click', () => { sfx.click(); { const m = MISSIONS.find(x => x.id === b.dataset.m)!; if (Purchases.isLocked(m)) this.openPaywall(() => list()); else brief(m); } }));
    };
    const brief = (m: Mission) => {
      wrap.innerHTML = `<div class="panel camp brief"><h2>Missão ${m.n} · ${m.title}</h2>
        <div class="camp-sub">${m.sub} · IA ${m.ai ? 'ativa' : 'roteirizada'} · ${m.difficulty === 'easy' ? 'Fácil' : m.difficulty === 'normal' ? 'Normal' : 'Difícil'}</div>
        <p class="bf">${m.briefing}</p>
        <div class="obj-h">Objetivos</div>
        <ul class="obj">${m.objectives.map(o => `<li>◻ ${o.text}</li>`).join('')}</ul>
        <div class="btns"><button id="cp-back">Voltar</button><button id="cp-go" class="go">▶ Iniciar missão</button></div></div>`;
      wrap.querySelector('#cp-back')!.addEventListener('click', () => { sfx.click(); list(); });
      wrap.querySelector('#cp-go')!.addEventListener('click', () => { sfx.unlock(); sfx.ready(); close(); this.onPlay(missionOpts(m)); });
    };
    list();
    this.el.append(wrap);
    if (!Storage.data.prologue) this.openLore(() => { /* volta à lista */ });
  }

  // ---------- Conquistas e recordes ----------
  openAch() {
    this.el.querySelector('.ach-wrap')?.remove();
    const w = document.createElement('div'); w.className = 'audio-modal ach-wrap';
    const st = Storage.data.stats ?? {}, fmt = (v: number) => `${Math.floor(v / 60)}m${String(v % 60).padStart(2, '0')}s`;
    const recs = MAPS.flatMap(m => (['easy', 'normal', 'hard'] as Difficulty[]).map(d => ({ m: m.name, d: DIFFS[d].label, v: st[`best_${m.id}_${d}`] }))).filter(r => r.v);
    w.innerHTML = `<div class="panel camp"><h2>Conquistas</h2>
      <div class="achs">${ACH.map(a => { const ok = Achievements.has(a.id), p = a.stat && a.goal ? `${Math.min(a.goal, Achievements.stat(a.stat))}/${a.goal}` : ''; return `<div class="ach ${ok ? 'ok' : ''}"><span>${ok ? '🏅' : '🔒'}</span><b>${a.name}</b><i>${a.desc}${p && !ok ? ` · ${p}` : ''}</i></div>`; }).join('')}</div>
      <h3 class="rec-h">Recordes de vitória</h3>
      <div class="recs">${recs.length ? recs.map(r => `<div><b>${r.m}</b><i>${r.d}</i><span>${fmt(r.v!)}</span></div>`).join('') : '<p>Vença escaramuças para registrar seus melhores tempos.</p>'}</div>
      <div class="btns"><button id="ach-close">Voltar</button></div></div>`;
    w.querySelector('#ach-close')!.addEventListener('click', () => { sfx.click(); w.remove(); this.render(); });
    this.el.append(w);
  }

  // ---------- Prólogo: a origem da guerra ----------
  openLore(done?: () => void) {
    this.el.querySelector('.lore-wrap')?.remove();
    const w = document.createElement('div');
    w.className = 'audio-modal lore-wrap';
    this.el.append(w);
    let i = 0;
    const end = () => { Storage.data.prologue = true; Storage.save(); w.remove(); done?.(); };
    const show = () => {
      if (i >= LORE.length) {
        w.innerHTML = `<div class="panel lore end"><h2>Quem poderia ter evitado?</h2><ul class="blames">${BLAMES.map(b => `<li>${b}</li>`).join('')}</ul>
          <p class="lore-final">A guerra não começou com um tiro. Começou com cada aviso ignorado.</p>
          <div class="btns"><button id="lo-back">Voltar</button><button id="lo-go" class="go">Entrar na campanha</button></div></div>`;
        w.querySelector('#lo-back')!.addEventListener('click', () => { sfx.click(); i = LORE.length - 1; show(); });
        w.querySelector('#lo-go')!.addEventListener('click', () => { sfx.ready(); end(); });
        return;
      }
      const c = LORE[i];
      w.innerHTML = `<div class="panel lore ${c.mood}"><div class="lore-yr">${c.year}</div><h2>${c.title}</h2><p class="lore-tx">${c.text}</p>
        <div class="lore-dots">${LORE.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
        <div class="btns"><button id="lo-skip">Pular</button><button id="lo-next" class="go">${i === LORE.length - 1 ? 'Fim ▶' : 'Continuar ▶'}</button></div></div>`;
      w.querySelector('#lo-skip')!.addEventListener('click', () => { sfx.click(); end(); });
      w.querySelector('#lo-next')!.addEventListener('click', () => { sfx.click(); i++; show(); });
    };
    show();
  }

  // ---------- Fim da demo ----------
  openDemoEnd() {
    this.el.querySelector('.demo-end')?.remove();
    const s = Storage.data, w = document.createElement('div');
    w.className = 'audio-modal demo-end';
    const rows = DEMO_IDS.map(id => { const m = MISSIONS.find(x => x.id === id)!; const st = s.campaign[id] ?? 0; return `${m.title}: ${'★'.repeat(st)}${'☆'.repeat(3 - st)}`; });
    const report = `Demo Frente de Ferro — ${rows.join(' | ')} | Tela ${innerWidth}x${innerHeight} | ${navigator.userAgent.includes('Mobile') ? 'celular' : 'computador'}`;
    w.innerHTML = `<div class="panel pay"><div class="pay-gem">🏁</div><h2>Fim da demo</h2>
      <div class="camp-sub">Obrigado por testar o Frente de Ferro!</div>
      <ul class="pay-list">${rows.map(r => `<li>${r}</li>`).join('')}
        <li>🎖 O jogo completo terá 8+ missões, superpoderes, online 1x1 e novas campanhas.</li></ul>
      <div class="pay-msg">Conte ao Brunno: o que foi divertido? O que travou ou confundiu?</div>
      <div class="btns"><button id="de-copy">📋 Copiar meu resultado</button><button id="de-again">↻ Jogar de novo</button><button id="de-close" class="go">Fechar</button></div></div>`;
    this.el.append(w);
    const copy = w.querySelector('#de-copy') as HTMLElement;
    copy.addEventListener('click', async () => { sfx.click(); try { await navigator.clipboard.writeText(report); copy.textContent = '✔ Copiado! Cole no WhatsApp'; } catch { window.prompt('Copie e envie ao Brunno:', report); } });
    w.querySelector('#de-again')!.addEventListener('click', () => { sfx.click(); for (const id of DEMO_IDS) delete s.campaign[id]; Storage.save(); w.remove(); this.openCampaign(); });
    w.querySelector('#de-close')!.addEventListener('click', () => { sfx.click(); w.remove(); });
  }

  // ---------- Edição Completa ----------
  openPaywall(done?: () => void) {
    if (DEMO) { this.openDemoEnd(); return; }
    this.el.querySelector('.pay-wrap')?.remove();
    const w = document.createElement('div');
    w.className = 'audio-modal pay-wrap';
    w.innerHTML = `<div class="panel pay"><div class="pay-gem">💎</div><h2>Edição Completa</h2>
      <div class="camp-sub">Compra única · sem anúncios · sem assinatura</div>
      <ul class="pay-list">
        <li>🎖 <b>Campanha completa</b>: missões ${FREE_MISSIONS + 1} a ${MISSIONS.length} com batalhas maiores</li>
        <li>🔥 Todos os próximos capítulos e missões, sem pagar de novo</li>
        <li>⭐ Recompensas de 3 estrelas em todas as fases</li>
        <li>📱 Vale no seu aparelho; restaure em outro com 1 toque</li>
      </ul>
      <div class="pay-price">${storePrice() ?? PRICE_LABEL}</div>
      <div class="pay-msg" id="pay-msg">${Purchases.simulated() ? 'Modo de teste: nenhuma cobrança real.' : ''}</div>
      <div class="btns"><button id="pay-no">Agora não</button><button id="pay-restore">Restaurar compra</button><button id="pay-buy" class="go">Desbloquear · ${storePrice() ?? PRICE_LABEL}</button></div></div>`;
    this.el.append(w);
    const msg = w.querySelector('#pay-msg') as HTMLElement;
    const ok = () => { sfx.objective(); msg.textContent = '✔ Edição Completa desbloqueada!'; setTimeout(() => { w.remove(); done?.(); }, 900); };
    w.querySelector('#pay-no')!.addEventListener('click', () => { sfx.click(); w.remove(); });
    w.querySelector('#pay-buy')!.addEventListener('click', async () => { sfx.click(); msg.textContent = 'Processando…'; const r = await Purchases.buy(); if (r.ok) ok(); else msg.textContent = r.msg ?? ''; });
    w.querySelector('#pay-restore')!.addEventListener('click', async () => { sfx.click(); const r = await Purchases.restore(); if (r.ok) ok(); else msg.textContent = r.msg ?? ''; });
  }

  // ---------- Lobby online (host + até 3 amigos) ----------
  private lobby(mode: 'menu' | 'join', code = '') {
    this.net?.close(); this.net = null;
    const s = Storage.data;
    const facs = Object.keys(FACTIONS) as Faction[];
    const wrap = document.createElement('div');
    wrap.className = 'audio-modal lobby';
    wrap.innerHTML = `<div class="panel lob">
      <h2>Partida Online · até 4 jogadores</h2>
      <div id="lb-body"></div>
      <div class="btns"><button id="lb-close">Fechar</button></div></div>`;
    this.el.append(wrap);
    const body = wrap.querySelector('#lb-body') as HTMLElement;
    const close = () => { this.net?.close(); this.net = null; wrap.remove(); };
    (wrap.querySelector('#lb-close') as HTMLElement).onclick = close;

    // estado da sala (o host é a fonte da verdade; o convidado só espelha)
    const emptySlot = (i: number): Slot => ({ active: false, type: 'empty', faction: facs[i % facs.length], alliance: i, difficulty: s.difficulty });
    let slots: Slot[] = TEAMS.map(emptySlot);
    slots[0] = { active: true, type: 'human', faction: s.faction, alliance: 0 };
    let mapId = s.mapId, mapSize: MapSize = 64, you: Team = 0, isHost = false;
    let stNote = '';

    /** linhas dos 4 slots; `editable(i)` diz se o jogador local pode mexer em facção/aliança daquele slot */
    const rows = () => slots.map((sl, i) => {
      const mine = i === you, canEdit = isHost ? (sl.type !== 'human' || i === 0) && sl.active : mine;
      const label = !sl.active ? 'Vaga aberta' : sl.type === 'ai' ? `IA ${i}` : i === 0 ? 'Anfitrião' : `Amigo ${i}`;
      const fac = canEdit
        ? `<select data-lf="${i}">${facs.map(f => `<option value="${f}" ${sl.faction === f ? 'selected' : ''}>${FACTIONS[f].name}</option>`).join('')}</select>`
        : sl.active ? `<span class="sl-fac">${FACTIONS[sl.faction].name}</span>` : '';
      const als = sl.active ? ALLIANCE_NAMES.map((a, k) => `<button data-la="${i}:${k}" class="chip tiny ${sl.alliance === k ? 'on' : ''}" ${canEdit ? '' : 'disabled'}>${a}</button>`).join('') : '';
      const type = isHost && i > 0 && sl.type !== 'human'
        ? `<button data-lt="${i}" class="chip tiny">${sl.active ? '✖ Remover IA' : '＋ Adicionar IA'}</button>` : '';
      return `<div class="slot-row ${mine ? 'me' : ''}" style="--c:${TEAM_COLORS[i].main}"><i></i><span class="sl-name">${label}${mine ? ' (você)' : ''}</span>${fac}<span class="als">${als}</span>${type}</div>`;
    }).join('');

    const actives = () => slots.filter(x => x.active);
    const valid = () => actives().length >= 2 && new Set(actives().map(x => x.alliance)).size >= 2;

    const broadcast = () => {
      const net = this.net; if (!net || !isHost) return;
      for (const pid of net.peerIds()) {
        const t = slots.findIndex(x => x.peerId === pid) as Team;
        if (t >= 0) net.sendTo(pid, { t: 'lobby', slots, you: t, mapId, mapSize: actives().length >= 3 ? 96 : mapSize });
      }
    };

    const bindRoom = () => {
      body.querySelectorAll<HTMLSelectElement>('[data-lf]').forEach(el => el.onchange = () => {
        const i = Number(el.dataset.lf); sfx.click();
        slots[i].faction = el.value as Faction;
        if (isHost) { if (i === 0) { s.faction = slots[0].faction; Storage.save(); } broadcast(); } else this.net?.send({ t: 'pick', faction: slots[i].faction, alliance: slots[i].alliance });
        drawRoom();
      });
      body.querySelectorAll<HTMLButtonElement>('[data-la]').forEach(el => el.onclick = () => {
        const [i, k] = el.dataset.la!.split(':').map(Number); sfx.click();
        slots[i].alliance = k;
        if (isHost) broadcast(); else this.net?.send({ t: 'pick', faction: slots[i].faction, alliance: k });
        drawRoom();
      });
      body.querySelectorAll<HTMLButtonElement>('[data-lt]').forEach(el => el.onclick = () => {
        const i = Number(el.dataset.lt); sfx.click();
        if (slots[i].active) slots[i] = emptySlot(i); else slots[i] = { active: true, type: 'ai', faction: facs[(i + 1) % facs.length], alliance: i, difficulty: s.difficulty };
        broadcast(); drawRoom();
      });
      body.querySelectorAll<HTMLButtonElement>('[data-lmap]').forEach(el => el.onclick = () => { sfx.click(); mapId = el.dataset.lmap!; s.mapId = mapId; Storage.save(); broadcast(); drawRoom(); });
      body.querySelectorAll<HTMLButtonElement>('[data-lsz]').forEach(el => el.onclick = () => { sfx.click(); mapSize = Number(el.dataset.lsz) as MapSize; broadcast(); drawRoom(); });
      (body.querySelector('#lb-start') as HTMLElement | null)?.addEventListener('click', startMatch);
    };

    const drawRoom = () => {
      const net = this.net!;
      const big = actives().length >= 3 || mapSize === 96;
      const mapName = (MAPS.find(m => m.id === mapId) ?? MAPS[0]).name;
      const link = isHost ? net.inviteLink() : '';
      body.innerHTML = `
        ${isHost ? `<p class="hint">Código da sala</p><div class="code">${net.code}</div>
          <div class="menu-actions"><button id="lb-share" class="big">📤 Enviar convite</button><button id="lb-copy">📋 Copiar link</button></div>` : `<p class="hint">Sala <b>${net.code}</b> · escolha sua facção e aliança.</p>`}
        <div class="slots">${rows()}</div>
        <small class="hint">Mesma letra = aliados. Letras diferentes = inimigos.</small>
        ${isHost ? `<h4>Mapa</h4><div class="chips">${MAPS.map(m => `<button data-lmap="${m.id}" class="chip ${m.id === mapId ? 'on' : ''}" ${Storage.data.wins < m.unlockWins ? 'disabled' : ''}>${m.name}</button>`).join('')}</div>
          <div class="chips"><button data-lsz="64" class="chip ${!big ? 'on' : ''}" ${actives().length >= 3 ? 'disabled' : ''}>Normal 64×64</button><button data-lsz="96" class="chip ${big ? 'on' : ''}">Grande 96×96</button></div>`
        : `<p class="hint">Mapa: <b>${mapName}</b> · ${big ? 'Grande 96×96' : 'Normal 64×64'}</p>`}
        <p class="hint" id="lb-st">${stNote || (isHost ? (valid() ? '✔ Pronto para iniciar.' : '⏳ Aguardando amigos (ou adicione IAs) e pelo menos duas alianças diferentes.') : '⏳ Aguardando o anfitrião iniciar…')}</p>
        ${isHost ? `<div class="menu-actions"><button id="lb-start" class="big go" ${valid() ? '' : 'disabled'}>▶ Iniciar Partida</button></div>` : ''}`;
      if (isHost) {
        (body.querySelector('#lb-copy') as HTMLElement).onclick = async () => {
          try { await navigator.clipboard.writeText(link); (body.querySelector('#lb-st') as HTMLElement).textContent = '✔ Link copiado! Cole no WhatsApp ou onde preferir.'; }
          catch { window.prompt('Copie o link do convite:', link); }
        };
        (body.querySelector('#lb-share') as HTMLElement).onclick = async () => {
          const text = `Venha jogar Frente de Ferro comigo! Código da sala: ${net.code}\n${link}`;
          const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
          if (nav.share) { try { await nav.share({ title: 'Frente de Ferro', text, url: link }); return; } catch { /* cancelado */ } }
          window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
        };
      }
      bindRoom();
    };

    const startMatch = () => {
      const net = this.net; if (!net || !isHost || !valid()) return;
      const size: MapSize = actives().length >= 3 ? 96 : mapSize;
      for (const pid of net.peerIds()) {
        const t = slots.findIndex(x => x.peerId === pid) as Team;
        if (t >= 0) net.sendTo(pid, { t: 'start', mapId, mapSize: size, slots, you: t });
      }
      wrap.remove(); this.hide();
      this.onPlay({ difficulty: s.difficulty, faction: slots[0].faction, mapId, role: 'host', net, slots, mapSize: size, myTeam: 0 });
    };

    const showChoice = () => {
      body.innerHTML = `<p class="hint">Crie uma sala e convide até 3 amigos, ou entre com o código que recebeu.</p>
        <div class="menu-actions"><button id="lb-create" class="big">✉ Criar sala e convidar</button></div>
        <div class="row"><label>Tenho um código</label>
          <div class="join"><input id="lb-code" maxlength="5" placeholder="ABCDE" autocapitalize="characters"><button id="lb-join">Entrar</button></div></div>`;
      (body.querySelector('#lb-create') as HTMLElement).onclick = createRoom;
      (body.querySelector('#lb-join') as HTMLElement).onclick = () => joinRoom((body.querySelector('#lb-code') as HTMLInputElement).value);
    };

    const createRoom = async () => {
      const net = new NetSession(); this.net = net; isHost = true; you = 0;
      body.innerHTML = '<p class="hint">Criando sala…</p>';
      try {
        await net.host();
        // quem entra ocupa a primeira vaga livre (ou a de uma IA); quem sai libera a vaga
        net.onPeer = (pid, what) => {
          if (what === 'join') {
            const i = slots.findIndex((x, k) => k > 0 && x.type !== 'human');
            if (i < 0 || net.peerIds().length > MAX_PEERS) return;
            const used = new Set(actives().map(x => x.faction));
            slots[i] = { active: true, type: 'human', peerId: pid, faction: facs.find(f => !used.has(f)) ?? facs[i % facs.length], alliance: i };
          } else {
            const i = slots.findIndex(x => x.peerId === pid);
            if (i > 0) slots[i] = emptySlot(i);
          }
          broadcast(); drawRoom();
        };
        net.onMsg = (m, from) => {
          if (m.t === 'pick') {
            const i = slots.findIndex(x => x.peerId === from);
            if (i > 0 && facs.includes(m.faction)) { slots[i].faction = m.faction; slots[i].alliance = Math.max(0, Math.min(3, m.alliance | 0)); broadcast(); drawRoom(); }
          }
        };
        net.onStatus = st => { if (st === 'error') { stNote = '⚠ Erro de conexão: ' + net.error; drawRoom(); } };
        drawRoom();
      } catch {
        body.innerHTML = `<p class="hint">⚠ Não foi possível criar a sala (${net.error || 'sem conexão'}).</p><div class="menu-actions"><button id="lb-back">Voltar</button></div>`;
        (body.querySelector('#lb-back') as HTMLElement).onclick = showChoice;
      }
    };

    const joinRoom = async (raw: string) => {
      const c = raw.trim().toUpperCase();
      if (c.length < 4) return;
      const net = new NetSession(); this.net = net; isHost = false;
      body.innerHTML = `<p class="hint">Entrando na sala <b>${c}</b>…</p>`;
      net.onMsg = (m: NetMsg) => {
        if (m.t === 'lobby') { slots = m.slots; you = m.you; mapId = m.mapId; mapSize = m.mapSize; drawRoom(); }
        else if (m.t === 'full') { stNote = ''; body.innerHTML = '<p class="hint">⚠ Sala cheia.</p><div class="menu-actions"><button id="lb-back">Voltar</button></div>'; (body.querySelector('#lb-back') as HTMLElement).onclick = showChoice; }
        else if (m.t === 'start') {
          wrap.remove(); this.hide();
          this.onPlay({ difficulty: s.difficulty, faction: m.slots[m.you].faction, mapId: m.mapId, role: 'guest', net, slots: m.slots, mapSize: m.mapSize, myTeam: m.you });
        } else if (m.t === 'bye') { stNote = '⚠ O anfitrião fechou a sala.'; drawRoom(); }
      };
      try {
        await net.join(c);
        body.innerHTML = '<p class="hint">✔ Conectado! Carregando a sala…</p>';
      } catch {
        body.innerHTML = `<p class="hint">⚠ ${net.error}</p><div class="menu-actions"><button id="lb-back">Voltar</button></div>`;
        (body.querySelector('#lb-back') as HTMLElement).onclick = showChoice;
      }
    };

    if (mode === 'join' && code) joinRoom(code); else showChoice();
  }
}
