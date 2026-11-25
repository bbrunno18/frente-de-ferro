/** Elementos de HUD sobre a área do jogo: avisos, confirmação de construção, pausa e fim de partida. */
export class Hud {
  private toasts: HTMLElement;
  private placebar: HTMLElement;
  private overlay: HTMLElement;
  private root: HTMLElement;

  private info: HTMLElement;
  private infoKey = '';

  constructor(parent: HTMLElement, private onConfirm: () => void, private onCancel: () => void, private onUpgrade: () => void = () => {}, private onSell: () => void = () => {}) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.toasts = document.createElement('div'); this.toasts.className = 'toasts';
    this.placebar = document.createElement('div'); this.placebar.className = 'placebar hidden';
    this.placebar.innerHTML = '<span id="pl-name"></span><button class="ok">✔ Construir</button><button class="no">✖ Cancelar</button>';
    this.placebar.querySelector('.ok')!.addEventListener('click', () => this.onConfirm());
    this.placebar.querySelector('.no')!.addEventListener('click', () => this.onCancel());
    this.overlay = document.createElement('div'); this.overlay.className = 'overlay hidden';
    this.info = document.createElement('div'); this.info.className = 'info hidden';
    this.info.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b || (b as HTMLButtonElement).disabled) return;
      if (b.classList.contains('up')) this.onUpgrade(); else if (b.classList.contains('sl')) this.onSell();
    });
    this.root.append(this.toasts, this.placebar, this.info, this.overlay);
    parent.append(this.root);
  }

  toast(text: string, ms = 3000) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = text;
    this.toasts.append(d);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, ms);
  }

  showPlacement(name: string, valid: boolean) {
    this.placebar.classList.remove('hidden');
    this.placebar.querySelector('#pl-name')!.textContent = name;
    (this.placebar.querySelector('.ok') as HTMLButtonElement).disabled = !valid;
  }
  hidePlacement() { this.placebar.classList.add('hidden'); }

  showPanel(title: string, body: string, buttons: { label: string; cls?: string; fn: () => void }[]) {
    this.overlay.innerHTML = `<div class="panel"><h2>${title}</h2><p>${body}</p><div class="btns"></div></div>`;
    const host = this.overlay.querySelector('.btns')!;
    for (const b of buttons) {
      const el = document.createElement('button');
      el.textContent = b.label; if (b.cls) el.className = b.cls;
      el.addEventListener('click', b.fn);
      host.append(el);
    }
    this.overlay.classList.remove('hidden');
  }
  /** Cartão da seleção: nome, nível, veterania, vida e botões de evolução/venda. */
  setInfo(d: null | { title: string; stars: number; maxStars: number; rank: string; hp: number; maxHp: number; sub: string; upLabel: string; canUp: boolean; upNote: string; canSell: boolean; enemy: boolean }) {
    if (!d) { if (this.infoKey) { this.infoKey = ''; this.info.classList.add('hidden'); } return; }
    const key = JSON.stringify(d);
    if (key === this.infoKey) return;
    this.infoKey = key;
    const f = Math.max(0, Math.min(1, d.hp / d.maxHp));
    const stars = '★'.repeat(d.stars) + '<u>' + '★'.repeat(d.maxStars - d.stars) + '</u>';
    this.info.className = 'info' + (d.enemy ? ' enemy' : '');
    this.info.innerHTML = `<div class="ih"><b>${d.title}</b><span class="stars">${stars}</span></div>
      <div class="hpbar"><i style="width:${f * 100}%;background:${f > 0.5 ? '#4cd964' : f > 0.25 ? '#ffcc00' : '#ff3b30'}"></i></div>
      <div class="meta">${d.rank ? d.rank + ' · ' : ''}${Math.ceil(d.hp)}/${d.maxHp} PV${d.sub ? ' · ' + d.sub : ''}</div>
      ${d.enemy ? '' : `<div class="ib"><button class="up" ${d.canUp ? '' : 'disabled'}>${d.upLabel}</button>${d.canSell ? '<button class="sl">$ Vender</button>' : ''}</div>${d.upNote ? `<div class="note">${d.upNote}</div>` : ''}`}`;
  }

  hidePanel() { this.overlay.classList.add('hidden'); }

  destroy() { this.root.remove(); }
}
