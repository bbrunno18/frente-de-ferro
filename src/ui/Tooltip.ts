/** Dica flutuante (nome/estatísticas) usada pelo mouse sobre o mapa e sobre os botões da barra lateral. */
class TooltipEl {
  private el: HTMLDivElement | null = null;
  private ensure() {
    if (!this.el) { this.el = document.createElement('div'); this.el.className = 'tip hidden'; document.body.append(this.el); }
    return this.el;
  }
  show(html: string, x: number, y: number, side: 'auto' | 'left' = 'auto') {
    const el = this.ensure();
    el.innerHTML = html;
    el.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    let px = x + 16, py = y + 18;
    if (side === 'left') { px = x - r.width - 12; py = y - r.height / 2; }
    px = Math.max(6, Math.min(window.innerWidth - r.width - 6, px));
    py = Math.max(6, Math.min(window.innerHeight - r.height - 6, py));
    el.style.left = `${px}px`; el.style.top = `${py}px`;
  }
  hide() { this.el?.classList.add('hidden'); }
  destroy() { this.el?.remove(); this.el = null; }
}
export const tooltip = new TooltipEl();
