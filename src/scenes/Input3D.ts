import type { GameView } from './GameView';

type Mode = 'none' | 'pending' | 'pan' | 'box' | 'multi' | 'wall';
interface P { x: number; y: number; touch: boolean }

/**
 * Gestos (toque): toque simples = selecionar/ordenar; segurar e arrastar (ou botão Caixa) = caixa de seleção;
 * 1 dedo arrastando = mover câmera; 2 dedos = mover + pinça de zoom.
 * Mouse: arrastar = caixa, botão direito = ordem, roda = zoom, botão do meio = mover câmera, WASD/setas, bordas da tela.
 */
export class Input3D {
  private ptrs = new Map<number, P>();
  private mode: Mode = 'none';
  private sx = 0; private sy = 0; private lx = 0; private ly = 0; private t0 = 0;
  private lock = false;
  private midX = 0; private midY = 0; private dist0 = 1; private d0 = 1;
  private mid = false;
  boxToggle = false;
  keys = new Set<string>();
  mouse = { x: -1, y: -1, inside: false, touch: false };
  private off: (() => void)[] = [];

  constructor(private v: GameView, private el: HTMLElement) {
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, target: HTMLElement | Window | Document = el, opt?: AddEventListenerOptions) => {
      target.addEventListener(t, f as EventListener, opt);
      this.off.push(() => target.removeEventListener(t, f as EventListener, opt));
    };
    on('pointerdown', e => this.down(e));
    on('pointermove', e => this.move(e));
    on('pointerup', e => this.up(e));
    on('pointercancel', e => this.up(e));
    on('pointerleave', () => { this.mouse.inside = false; v.onLeave(); });
    on('wheel', e => { e.preventDefault(); v.zoomBy(e.deltaY > 0 ? 1.1 : 0.9); }, el, { passive: false });
    on('contextmenu', e => e.preventDefault());
    on('keydown', e => this.key(e, true), window);
    on('keyup', e => this.key(e, false), window);
  }

  destroy() { this.off.forEach(f => f()); this.off = []; }

  private pos(e: PointerEvent) { const r = this.el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  private touches(): P[] { return [...this.ptrs.values()].filter(p => p.touch); }

  private key(e: KeyboardEvent, down: boolean) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (down) { this.keys.add(k); this.v.onKey(k, e); } else this.keys.delete(k);
  }

  private down(e: PointerEvent) {
    // toques em botões e painéis sobre o mapa (pausa, cartões, avisos) não podem virar comando nem capturar o ponteiro
    const tg = e.target as HTMLElement | null;
    if (tg && tg !== this.el && tg.closest && tg.closest('button, .panel, input, select, label, a')) return;
    this.v.unlockAudio();
    const p = this.pos(e), touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    this.el.setPointerCapture(e.pointerId);
    this.ptrs.set(e.pointerId, { x: p.x, y: p.y, touch });
    this.mouse.touch = touch;
    if (!touch && e.button === 2) { this.v.onRight(p.x, p.y); return; }
    if (!touch && e.button === 1) { this.mid = true; this.mode = 'pan'; this.lx = p.x; this.ly = p.y; e.preventDefault(); return; }
    const t = this.touches();
    if (t.length >= 2) {
      this.mode = 'multi'; this.lock = true; this.v.box = null;
      this.midX = (t[0].x + t[1].x) / 2; this.midY = (t[0].y + t[1].y) / 2;
      this.dist0 = Math.max(10, Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y)); this.d0 = this.v.camDist;
      return;
    }
    if (this.lock) return;
    this.mode = 'pending';
    this.sx = this.lx = p.x; this.sy = this.ly = p.y; this.t0 = performance.now();
  }

  private move(e: PointerEvent) {
    const p = this.pos(e), touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const rec = this.ptrs.get(e.pointerId);
    this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.inside = true; this.mouse.touch = touch;
    if (rec) { rec.x = p.x; rec.y = p.y; }
    if (this.mode === 'multi') {
      const t = this.touches();
      if (t.length < 2) return;
      const mx = (t[0].x + t[1].x) / 2, my = (t[0].y + t[1].y) / 2;
      this.v.grabPan(this.midX, this.midY, mx, my);
      this.midX = mx; this.midY = my;
      this.v.setDist(this.d0 * this.dist0 / Math.max(10, Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y)));
      return;
    }
    if (!rec) { if (!touch) this.v.onHover(p.x, p.y, e.clientX, e.clientY); return; }
    if (this.mode === 'pending') {
      const moved = Math.hypot(p.x - this.sx, p.y - this.sy);
      if (moved > (touch ? 10 : 6)) {
        const placing = this.v.placing !== null;
        if (this.v.wallMode) this.mode = 'wall';
        else if (!touch) this.mode = placing ? 'pan' : 'box';
        else if (!placing && (this.boxToggle || performance.now() - this.t0 > 320)) this.mode = 'box';
        else this.mode = 'pan';
      }
    }
    if (this.mode === 'pan') this.v.grabPan(this.lx, this.ly, p.x, p.y);
    else if (this.mode === 'box') this.v.box = { x0: this.sx, y0: this.sy, x1: p.x, y1: p.y };
    else if (this.mode === 'wall') this.v.onWallDrag(this.sx, this.sy, p.x, p.y);
    this.lx = p.x; this.ly = p.y;
    if (!touch) this.v.onHover(p.x, p.y, e.clientX, e.clientY);
  }

  private up(e: PointerEvent) {
    const p = this.pos(e), rec = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    if (!rec) return;
    if (this.mid) { this.mid = false; this.mode = 'none'; return; }
    if (this.mode === 'multi' || this.lock) { /* gesto de 2 dedos não gera toque */ }
    else if (this.mode === 'pending') this.v.onTap(p.x, p.y, rec.touch);
    else if (this.mode === 'wall') this.v.onWallEnd();
    else if (this.mode === 'box' && this.v.box) { const b = this.v.box; this.v.box = null; this.v.onBox(b.x0, b.y0, b.x1, b.y1); }
    this.mode = 'none';
    if (this.lock && this.touches().length === 0) this.lock = false;
  }
}
