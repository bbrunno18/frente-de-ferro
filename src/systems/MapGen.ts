import { MAP_W, MAP_H, setMapSize } from '../config';

export interface MapData {
  terrain: Uint8Array;       // 0 livre, 1 rocha, 2 água
  crystal: Float32Array;     // quantidade atual por tile
  crystalMax: Uint16Array;   // >0 => tile de campo de cristal (regenera)
}

/** Centros de base por tamanho de mapa. Índice = time: 0 inferior-esquerdo, 1 superior-direito, 2 superior-esquerdo, 3 inferior-direito. */
export const BASE_CENTERS: Record<number, [number, number][]> = {
  64: [[11, 52], [52, 11]],
  96: [[12, 83], [83, 12], [12, 12], [83, 83]],
};
export const BASE_CENTER = BASE_CENTERS[64];
/** [x, y, raio] — 64×64: 5 campos (2 nas bases). 96×96: 8 campos (4 nas bases + 4 disputados em anel no centro). */
const FIELDS_BY_SIZE: Record<number, [number, number, number][]> = {
  64: [[17, 53, 3.2], [46, 10, 3.2], [32, 32, 3.6], [13, 27, 3], [50, 36, 3]],
  96: [[18, 84, 3.2], [77, 11, 3.2], [18, 11, 3.2], [77, 84, 3.2], [34, 48, 3.2], [62, 48, 3.2], [48, 34, 3.2], [48, 62, 3.2]],
};
export const fieldsFor = (size: number) => FIELDS_BY_SIZE[size] ?? FIELDS_BY_SIZE[64];

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function connected(terrain: Uint8Array, from: [number, number], targets: [number, number][]): boolean {
  const seen = new Uint8Array(MAP_W * MAP_H);
  const q: number[] = [from[1] * MAP_W + from[0]];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % MAP_W, y = (c / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const i = ny * MAP_W + nx;
      if (seen[i] || terrain[i]) continue;
      seen[i] = 1; q.push(i);
    }
  }
  return targets.every(([x, y]) => seen[y * MAP_W + x]);
}

/** `active` = times que terão base (para garantir conectividade entre todas). Padrão 64×64 com 2 bases = comportamento original. */
export function generateMap(seed: number, rocks: number, water = 0.4, size = 64, active: number[] = [0, 1]): MapData {
  setMapSize(size);
  const BASE_CENTER = BASE_CENTERS[size] ?? BASE_CENTERS[64], FIELDS = fieldsFor(size);
  const bases = active.map(t => BASE_CENTER[t]).filter(Boolean);
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = mulberry32(seed * 977 + attempt * 31);
    const terrain = new Uint8Array(MAP_W * MAP_H);
    for (let i = 0; i < rocks; i++) {
      const cx = 2 + rng() * (MAP_W - 4), cy = 2 + rng() * (MAP_H - 4);
      const r = 1.2 + rng() * 2.2;
      const type = r > 2.2 && rng() < water ? 2 : 1;
      if (BASE_CENTER.some(([bx, by]) => Math.hypot(cx - bx, cy - by) < 11 + r)) continue;
      if (FIELDS.some(([fx, fy, fr]) => Math.hypot(cx - fx, cy - fy) < fr + r + 2)) continue;
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
        for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
          if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
          if (Math.hypot(x - cx, y - cy) + rng() * 0.8 < r) terrain[y * MAP_W + x] = type;
        }
      }
    }
    for (let x = 0; x < MAP_W; x++) { terrain[x] = 1; terrain[(MAP_H - 1) * MAP_W + x] = 1; }
    for (let y = 0; y < MAP_H; y++) { terrain[y * MAP_W] = 1; terrain[y * MAP_W + MAP_W - 1] = 1; }

    const crystal = new Float32Array(MAP_W * MAP_H);
    const crystalMax = new Uint16Array(MAP_W * MAP_H);
    for (const [fx, fy, fr] of FIELDS) {
      for (let y = Math.floor(fy - fr - 1); y <= fy + fr + 1; y++) {
        for (let x = Math.floor(fx - fr - 1); x <= fx + fr + 1; x++) {
          if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
          if (Math.hypot(x - fx, y - fy) + rng() * 0.7 > fr) continue;
          const i = y * MAP_W + x;
          if (terrain[i]) continue;
          crystalMax[i] = 300;
          crystal[i] = 200 + rng() * 100;
        }
      }
    }
    const targets: [number, number][] = [...bases.slice(1), ...FIELDS.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number])];
    if (connected(terrain, bases[0] ?? BASE_CENTER[0], targets)) return { terrain, crystal, crystalMax };
  }
  // fallback: mapa limpo
  const terrain = new Uint8Array(MAP_W * MAP_H);
  for (let x = 0; x < MAP_W; x++) { terrain[x] = 1; terrain[(MAP_H - 1) * MAP_W + x] = 1; }
  for (let y = 0; y < MAP_H; y++) { terrain[y * MAP_W] = 1; terrain[y * MAP_W + MAP_W - 1] = 1; }
  const crystal = new Float32Array(MAP_W * MAP_H);
  const crystalMax = new Uint16Array(MAP_W * MAP_H);
  for (const [fx, fy] of FIELDS) {
    for (let y = fy - 2; y <= fy + 2; y++) for (let x = fx - 2; x <= fx + 2; x++) {
      const i = Math.round(y) * MAP_W + Math.round(x); crystalMax[i] = 300; crystal[i] = 250;
    }
  }
  return { terrain, crystal, crystalMax };
}
