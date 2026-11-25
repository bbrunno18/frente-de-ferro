import { MAP_W, MAP_H } from '../config';

export interface Pt { x: number; y: number }

class Heap {
  f: number[] = [];
  i: number[] = [];
  get size() { return this.f.length; }
  push(f: number, i: number) {
    const F = this.f, I = this.i;
    let n = F.length;
    F.push(f); I.push(i);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (F[p] <= f) break;
      F[n] = F[p]; I[n] = I[p]; n = p;
    }
    F[n] = f; I[n] = i;
  }
  pop(): number {
    const F = this.f, I = this.i;
    const top = I[0];
    const lf = F.pop()!, li = I.pop()!;
    const len = F.length;
    if (len > 0) {
      let n = 0;
      for (;;) {
        let c = n * 2 + 1;
        if (c >= len) break;
        if (c + 1 < len && F[c + 1] < F[c]) c++;
        if (F[c] >= lf) break;
        F[n] = F[c]; I[n] = I[c]; n = c;
      }
      F[n] = lf; I[n] = li;
    }
    return top;
  }
}

export type BlockedFn = (x: number, y: number) => boolean;

export function nearestFree(gx: number, gy: number, blocked: BlockedFn, maxR: number, sx: number, sy: number): Pt | null {
  let best: Pt | null = null;
  let bd = Infinity;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = gx + dx, y = gy + dy;
        if (blocked(x, y)) continue;
        const d = dx * dx + dy * dy + 0.05 * ((x - sx) ** 2 + (y - sy) ** 2);
        if (d < bd) { bd = d; best = { x, y }; }
      }
    }
    if (best) return best;
  }
  return null;
}

const N = MAP_W * MAP_H;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
];

/** A* 8-direcional. Retorna lista de tiles (sem o inicial) ou null se inalcançável. */
export function findPath(sx: number, sy: number, gx: number, gy: number, blocked: BlockedFn): Pt[] | null {
  if (sx === gx && sy === gy) return [];
  if (blocked(gx, gy)) {
    const g = nearestFree(gx, gy, blocked, 8, sx, sy);
    if (!g) return null;
    gx = g.x; gy = g.y;
    if (sx === gx && sy === gy) return [];
  }
  const g = new Float32Array(N).fill(Infinity);
  const parent = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new Heap();
  const s = sy * MAP_W + sx;
  const goal = gy * MAP_W + gx;
  g[s] = 0;
  heap.push(0, s);
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return dx + dy + (1.4142 - 2) * Math.min(dx, dy);
  };
  let found = false;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) { found = true; break; }
    const cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
    for (const [dx, dy, c] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (blocked(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (blocked(cx + dx, cy) || blocked(cx, cy + dy))) continue;
      const ni = ny * MAP_W + nx;
      if (closed[ni]) continue;
      const ng = g[cur] + c;
      if (ng < g[ni]) {
        g[ni] = ng; parent[ni] = cur;
        heap.push(ng + h(nx, ny), ni);
      }
    }
  }
  if (!found) return null;
  const out: Pt[] = [];
  let c = goal;
  while (c !== s && c >= 0) {
    out.push({ x: c % MAP_W, y: (c / MAP_W) | 0 });
    c = parent[c];
  }
  out.reverse();
  return out;
}
