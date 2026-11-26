import { MAP_W, MAP_H, TILE, WORLD_W, WORLD_H, TEAM_COLORS, Team } from '../config';
import type { World } from '../systems/World';

const S_BASE = 3; // pixels por tile no canvas interno (64×64 → 192 px); o mapa 96 usa 2 px/tile → 192 px também
export class Minimap {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private dragging = false;
  private S = 3;

  constructor(private world: World, private me: Team, private onNav: (wx: number, wy: number) => void) {
    this.canvas = document.createElement('canvas');
    this.S = MAP_W > 64 ? 2 : S_BASE; // mantém o minimapa com o mesmo tamanho na tela
    this.canvas.width = MAP_W * this.S; this.canvas.height = MAP_H * this.S;
    this.canvas.className = 'minimap';
    this.ctx = this.canvas.getContext('2d')!;
    this.off = document.createElement('canvas');
    this.off.width = MAP_W; this.off.height = MAP_H;
    this.offCtx = this.off.getContext('2d')!;
    this.img = this.offCtx.createImageData(MAP_W, MAP_H);
    const nav = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const ny = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      if (!this.world.teams[this.me].low) this.onNav(nx * WORLD_W, ny * WORLD_H);
    };
    this.canvas.addEventListener('pointerdown', e => { this.dragging = true; this.canvas.setPointerCapture(e.pointerId); nav(e); });
    this.canvas.addEventListener('pointermove', e => { if (this.dragging) nav(e); });
    const end = () => { this.dragging = false; };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  draw(cam: { x: number; y: number; w: number; h: number }) {
    const w = this.world, c = this.ctx, S = this.S;
    const W = this.canvas.width, H = this.canvas.height;
    if (w.teams[this.me].low) {
      // radar offline: estática
      const id = c.createImageData(W, H);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 70; id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 255; }
      c.putImageData(id, 0, 0);
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, H / 2 - 12, W, 24);
      c.fillStyle = '#ff6b5e'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center'; c.fillText('RADAR OFFLINE', W / 2, H / 2 + 5);
      return;
    }
    const d = this.img.data;
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      let r = 0, g = 0, b = 0;
      if (w.explored[i]) {
        const t = w.terrain[i];
        if (t === 1) { r = 90; g = 94; b = 102; }
        else if (t === 2) { r = 28; g = 80; b = 130; }
        else if (w.crystal[i] > 20) { r = 60; g = 200; b = 255; }
        else if (w.crystalMax[i] > 0) { r = 100; g = 94; b = 70; }
        else { r = 38; g = 70; b = 44; }
        if (!w.visible[i]) { r *= 0.55; g *= 0.55; b *= 0.55; }
      }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
    this.offCtx.putImageData(this.img, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.off, 0, 0, W, H);
    for (const e of w.entities) {
      if (!e.alive || !w.isVisible(e)) continue;
      const mine = e.team === this.me, tc = TEAM_COLORS[e.team];
      c.fillStyle = tc.main;
      if (e.building) { c.fillRect(e.tx * S, e.ty * S, e.def.w * S, e.def.h * S); c.strokeStyle = mine ? 'rgba(255,255,255,.7)' : tc.light; c.lineWidth = 1; c.strokeRect(e.tx * S + 0.5, e.ty * S + 0.5, e.def.w * S - 1, e.def.h * S - 1); }
      else c.fillRect(Math.floor(e.x / TILE) * S - 1, Math.floor(e.y / TILE) * S - 1, 4, 4);
    }
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.5;
    c.strokeRect(cam.x / WORLD_W * W, cam.y / WORLD_H * H, cam.w / WORLD_W * W, cam.h / WORLD_H * H);
  }
}
