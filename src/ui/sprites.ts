import { modelIcon } from './models';
import { DEFS, FACTIONS, Faction, Kind, MAP_W, MAP_H, TILE } from '../config';

type Ctx = CanvasRenderingContext2D;
/** Fator de super-amostragem: sprites são desenhados em 2x e exibidos a 0,5x para ficarem nítidos em telas HD. */
export const SS = 2;
const mk = (w: number, h: number, ss = SS) => {
  const c = document.createElement('canvas'); c.width = Math.ceil(w * ss); c.height = Math.ceil(h * ss);
  const x = c.getContext('2d')!; x.scale(ss, ss); x.imageSmoothingQuality = 'high';
  return c;
};

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
const lin = (c: Ctx, y0: number, y1: number, a: string, b: string) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
function fillRR(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, stroke = '#0a0e13', shine = true) {
  rr(c, x, y, w, h, r); c.fillStyle = fill; c.fill(); c.lineWidth = 1.2; c.strokeStyle = stroke; c.stroke();
  if (shine && w > 6 && h > 6) { c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = 1; rr(c, x + 1, y + 1, w - 2, h - 2, Math.max(1, r - 1)); c.stroke(); }
}
function circle(c: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient, stroke = '#0a0e13') {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); c.lineWidth = 1.2; c.strokeStyle = stroke; c.stroke();
}
function ball(c: Ctx, x: number, y: number, r: number, col: string, hi: string) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, hi); g.addColorStop(1, col);
  circle(c, x, y, r, g);
}
function plate(c: Ctx, w: number, h: number) {
  c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
  fillRR(c, 2, 2, w - 5, h - 5, 6, lin(c, 0, h, '#6a7684', '#363e49'));
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1;
  for (let x = 12; x < w - 8; x += 16) { c.beginPath(); c.moveTo(x, 4); c.lineTo(x, h - 6); c.stroke(); }
  for (const [x, y] of [[6, 6], [w - 9, 6], [6, h - 9], [w - 9, h - 9]]) { circle(c, x, y, 1.4, '#9aa5b1', '#2a3038'); }
}
function trim(c: Ctx, w: number, h: number, col: string) {
  c.fillStyle = col; c.fillRect(9, 5, w - 18, 3); c.fillRect(9, h - 9, w - 18, 3);
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(9, 5, w - 18, 1);
}
function crystal(c: Ctx, x: number, y: number, s: number) {
  c.fillStyle = '#1a7fb8'; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.6, y + s * 0.5); c.lineTo(x - s * 0.6, y + s * 0.5); c.closePath(); c.fill();
  c.fillStyle = '#7fe6ff'; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.2, y); c.lineTo(x - s * 0.5, y + s * 0.4); c.closePath(); c.fill();
}

function drawBuilding(kind: Kind, f: Faction): HTMLCanvasElement {
  const d = DEFS[kind], P = FACTIONS[f];
  const w = d.w * TILE, h = d.h * TILE;
  const cv = mk(w, h), c = cv.getContext('2d')!;
  if (kind === 'wall') {
    c.save(); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 3; c.shadowOffsetY = 1.5;
    fillRR(c, 2, 2, w - 4, h - 4, 4, lin(c, 0, h, '#8a95a2', '#4a525d'));
    c.restore();
    c.fillStyle = P.main; c.fillRect(5, 13, w - 10, 6);
    c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(5, 13, w - 10, 1.5);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.moveTo(w / 2, 3); c.lineTo(w / 2, 12); c.moveTo(w / 2, 20); c.lineTo(w / 2, h - 3); c.stroke();
    return cv;
  }
  if (kind === 'turret' || kind === 'aa') {
    // torres giram: base fixa desenhada no mesmo sprite (rotaciona junto — visual simples e limpo)
    c.save(); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
    ball(c, 16, 16, 13.5, '#3a434e', '#7d8a98'); c.restore();
    circle(c, 16, 16, 9, lin(c, 6, 26, P.main, P.dark));
    if (kind === 'turret') {
      fillRR(c, 14, 12.5, 19, 7, 2, lin(c, 12, 20, '#4a5560', '#1b2128'));
      c.fillStyle = P.accent; c.fillRect(30, 14.5, 3, 3);
      ball(c, 14, 16, 5, P.light, '#ffffff');
    } else {
      for (const dy of [-4.5, 1.5]) fillRR(c, 12, 14 + dy, 20, 3.6, 1.5, lin(c, 10, 20, '#5a6572', '#232a32'));
      fillRR(c, 25, 7.8, 7, 3.2, 1, '#cfd6dd'); fillRR(c, 25, 21, 7, 3.2, 1, '#cfd6dd');
      ball(c, 13, 16, 4.6, P.accent, '#ffffff');
    }
    return cv;
  }
  plate(c, w, h); trim(c, w, h, P.main);
  switch (kind) {
    case 'conyard': {
      ball(c, w / 2, h / 2, 27, '#262e38', '#5b6877');
      const g = c.createRadialGradient(w / 2 - 7, h / 2 - 7, 2, w / 2, h / 2, 22);
      g.addColorStop(0, P.light); g.addColorStop(1, P.main);
      circle(c, w / 2, h / 2, 21, g);
      circle(c, w / 2, h / 2, 12, lin(c, h / 2 - 12, h / 2 + 12, '#10151b', '#2c3541'));
      ball(c, w / 2, h / 2, 6, P.accent, '#ffffff');
      for (const [x, y] of [[13, 18], [w - 25, 18], [13, h - 29], [w - 25, h - 29]]) fillRR(c, x, y, 12, 12, 2, lin(c, y, y + 12, P.main, P.dark));
      c.strokeStyle = '#0d1116'; c.lineWidth = 3; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w - 13, 16); c.stroke();
      circle(c, w - 13, 16, 3, P.accent);
      break;
    }
    case 'power': {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const x = 8 + i * 24, y = 11 + j * 25;
        fillRR(c, x, y, 22, 19, 2, lin(c, y, y + 19, '#1d4d8c', '#0c2748'));
        c.strokeStyle = 'rgba(120,190,255,.7)'; c.lineWidth = 0.8; c.beginPath();
        c.moveTo(x + 7.3, y); c.lineTo(x + 7.3, y + 19); c.moveTo(x + 14.6, y); c.lineTo(x + 14.6, y + 19); c.moveTo(x, y + 9.5); c.lineTo(x + 22, y + 9.5); c.stroke();
      }
      c.shadowColor = P.accent; c.shadowBlur = 6; c.fillStyle = P.accent;
      c.beginPath(); c.moveTo(35, 9); c.lineTo(26, 33); c.lineTo(33, 33); c.lineTo(29, 56); c.lineTo(43, 27); c.lineTo(35, 27); c.lineTo(41, 9); c.closePath(); c.fill();
      c.shadowBlur = 0;
      break;
    }
    case 'refinery': {
      for (const x of [24, 58]) { ball(c, x, 26, 16, '#586370', '#aab4c0'); ball(c, x, 26, 9, '#7d8996', '#d3dae2'); }
      fillRR(c, 40, 41, 52, 15, 3, lin(c, 41, 56, '#2c343e', '#12171d'));
      for (let i = 0; i < 4; i++) crystal(c, 50 + i * 11, 49, 5.5);
      fillRR(c, 76, 12, 15, 24, 3, lin(c, 12, 36, P.main, P.dark));
      c.fillStyle = P.accent; c.fillRect(79, 16, 9, 3);
      break;
    }
    case 'barracks': {
      for (let i = 0; i < 4; i++) fillRR(c, 8, 13 + i * 9, w - 16, 8, 2, i % 2 ? '#4a535f' : '#3a424c', '#10151a', false);
      fillRR(c, w / 2 - 9, h - 27, 18, 18, 3, lin(c, h - 27, h - 9, '#0b0e12', '#262e37'));
      c.fillStyle = '#2a3038'; c.fillRect(w - 16, 6, 2, 22);
      c.fillStyle = P.main; c.beginPath(); c.moveTo(w - 14, 7); c.lineTo(w - 4, 11); c.lineTo(w - 14, 15); c.closePath(); c.fill();
      break;
    }
    case 'factory': {
      for (let i = 0; i < 6; i++) fillRR(c, 9 + i * 13, 11, 12, 25, 2, i % 2 ? '#4a535f' : '#3a424c', '#10151a', false);
      fillRR(c, 16, h - 29, w - 40, 22, 3, lin(c, h - 29, h - 7, '#0b0e12', '#2a323c'));
      c.fillStyle = P.main; for (let i = 0; i < 5; i++) c.fillRect(20 + i * 9, h - 25, 5, 13);
      fillRR(c, w - 23, 9, 13, 24, 3, lin(c, 9, 33, '#59636f', '#2a3038'));
      c.fillStyle = '#ff8a3d'; c.fillRect(w - 20, 11, 7, 2);
      break;
    }
    case 'radar': {
      circle(c, w / 2, h / 2 + 3, 20, lin(c, 10, 52, '#2b333d', '#12171d'));
      c.save(); c.translate(w / 2, h / 2 + 3);
      c.fillStyle = lin(c, -16, 16, '#d7dee6', '#6c7784'); c.beginPath(); c.ellipse(0, 0, 17, 9, -0.5, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#0a0e13'; c.lineWidth = 1.2; c.stroke();
      c.strokeStyle = P.accent; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 0); c.lineTo(11, -14); c.stroke();
      ball(c, 11, -14, 2.8, P.accent, '#ffffff');
      c.restore();
      c.strokeStyle = 'rgba(120,230,255,.35)'; c.lineWidth = 1; c.beginPath(); c.arc(w / 2, h / 2 + 3, 25, -2.4, -0.7); c.stroke();
      break;
    }
    case 'lab': {
      fillRR(c, 9, 12, w - 18, h - 24, 4, lin(c, 12, h - 12, '#2c4b66', '#12212f'));
      for (let i = 0; i < 3; i++) { const x = 14 + i * 15; fillRR(c, x, 16, 11, 22, 5, lin(c, 16, 38, 'rgba(120,230,255,.9)', 'rgba(30,110,170,.9)'), '#0a0e13', false); }
      c.fillStyle = 'rgba(180,250,255,.65)'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(19.5 + i * 15, 33 - i * 3, 2.2, 0, 7); c.fill(); }
      ball(c, w - 14, 14, 4, P.accent, '#ffffff');
      c.fillStyle = P.light; c.fillRect(14, h - 17, w - 28, 3);
      break;
    }
    case 'helipad': {
      fillRR(c, 6, 6, w - 12, h - 12, 5, lin(c, 6, h - 6, '#3b434d', '#1b2026'), '#0a0e13', false);
      circle(c, w / 2, h / 2, 21, 'rgba(0,0,0,0)', P.main);
      c.strokeStyle = '#f2f5f8'; c.lineWidth = 3.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(w / 2 - 8, h / 2 - 11); c.lineTo(w / 2 - 8, h / 2 + 11); c.moveTo(w / 2 + 8, h / 2 - 11); c.lineTo(w / 2 + 8, h / 2 + 11); c.moveTo(w / 2 - 8, h / 2); c.lineTo(w / 2 + 8, h / 2); c.stroke();
      c.fillStyle = P.accent; for (const [x, y] of [[9, 9], [w - 11, 9], [9, h - 11], [w - 11, h - 11]]) c.fillRect(x, y, 2.5, 2.5);
      break;
    }
    default: break;
  }
  return cv;
}

function drawUnit(kind: Kind, f: Faction): HTMLCanvasElement {
  const P = FACTIONS[f];
  const size = ({ tank: 42, harvester: 46, prism: 46, artillery: 48, buggy: 30, heli: 54 } as Partial<Record<Kind, number>>)[kind] ?? 24;
  const cv = mk(size, size), c = cv.getContext('2d')!;
  const m = size / 2;
  c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 3; c.shadowOffsetY = 1.5;
  switch (kind) {
    case 'rifle': {
      fillRR(c, m, m - 1.6, 11, 3.2, 1, '#15191e', '#000', false);
      ball(c, m - 1, m, 7, P.main, P.light);
      circle(c, m + 1, m, 3.4, '#d9b896');
      break;
    }
    case 'rocket': {
      fillRR(c, m - 9, m - 3.4, 20, 6.8, 2.5, lin(c, m - 3, m + 3, '#6d7885', '#2f363f'));
      c.fillStyle = P.accent; c.beginPath(); c.arc(m + 11, m, 2.6, 0, 7); c.fill();
      ball(c, m - 2, m, 7, P.main, P.light);
      circle(c, m, m, 3.2, '#d9b896');
      break;
    }
    case 'sniper': {
      fillRR(c, m - 4, m - 1.4, 17, 2.8, 1, '#12161b', '#000', false);
      c.fillStyle = P.accent; c.fillRect(m + 3, m - 3.4, 4, 2);
      ball(c, m - 2, m, 6.6, P.dark, P.main);
      circle(c, m, m, 3, '#d9b896');
      break;
    }
    case 'buggy': {
      for (const [x, y] of [[4, 4], [20, 4], [4, 21], [20, 21]]) fillRR(c, x, y, 7, 5, 1.5, '#12161b', '#000', false);
      fillRR(c, 5, 8, 21, 14, 4, lin(c, 8, 22, P.light, P.main));
      fillRR(c, 15, 10, 8, 10, 2, '#1d252e');
      c.fillStyle = P.dark; c.fillRect(7, 10, 5, 10);
      fillRR(c, 20, 13.2, 11, 3, 1, '#20262d', '#000', false);
      circle(c, 17, 15, 2.2, P.accent);
      break;
    }
    case 'tank': {
      fillRR(c, 4, 4, 34, 9, 3, '#171c22'); fillRR(c, 4, 29, 34, 9, 3, '#171c22');
      c.fillStyle = '#39434f'; for (let i = 0; i < 7; i++) { c.fillRect(7 + i * 4.6, 5.5, 2, 6); c.fillRect(7 + i * 4.6, 30.5, 2, 6); }
      fillRR(c, 6, 10, 30, 22, 5, lin(c, 10, 32, P.main, P.dark));
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(8, 12, 26, 2);
      fillRR(c, 15, 14, 15, 14, 5, lin(c, 14, 28, P.light, P.main));
      fillRR(c, 27, 19, 16, 4.2, 1.5, lin(c, 19, 23, '#4b5663', '#1c222a'));
      ball(c, 22, 21, 3.4, P.accent, '#ffffff');
      break;
    }
    case 'artillery': {
      fillRR(c, 4, 5, 40, 9, 3, '#171c22'); fillRR(c, 4, 34, 40, 9, 3, '#171c22');
      fillRR(c, 6, 12, 32, 24, 5, lin(c, 12, 36, P.main, P.dark));
      fillRR(c, 13, 15, 17, 18, 4, lin(c, 15, 33, P.light, P.main));
      fillRR(c, 24, 21, 24, 6, 2, lin(c, 21, 27, '#566170', '#1c222a'));
      fillRR(c, 42, 19.4, 6, 9.2, 2, '#10151a');
      ball(c, 22, 24, 4, P.accent, '#ffffff');
      break;
    }
    case 'prism': {
      fillRR(c, 4, 4, 38, 10, 3, '#171c22'); fillRR(c, 4, 32, 38, 10, 3, '#171c22');
      fillRR(c, 6, 10, 34, 26, 6, lin(c, 10, 36, P.light, P.dark));
      fillRR(c, 14, 14, 18, 18, 6, lin(c, 14, 32, P.main, P.dark));
      c.save(); c.shadowColor = '#7fe6ff'; c.shadowBlur = 8;
      c.fillStyle = '#e8fbff'; c.beginPath(); c.moveTo(26, 23); c.lineTo(42, 19.6); c.lineTo(42, 26.4); c.closePath(); c.fill();
      c.restore();
      ball(c, 23, 23, 5, '#4ac6ff', '#ffffff');
      c.strokeStyle = P.accent; c.lineWidth = 1; c.beginPath(); c.arc(23, 23, 8.5, 0, 6.3); c.stroke();
      break;
    }
    case 'harvester': {
      fillRR(c, 6, 5, 32, 36, 6, lin(c, 5, 41, '#3a444f', '#1a2027'));
      fillRR(c, 8, 7, 26, 32, 5, lin(c, 7, 39, P.main, P.dark));
      fillRR(c, 10, 11, 15, 24, 3, lin(c, 11, 35, '#10151a', '#232b34'));
      for (let i = 0; i < 3; i++) crystal(c, 14 + i * 4.2, 30 - i, 4.4);
      fillRR(c, 33, 9, 13, 28, 3, lin(c, 9, 37, '#aab4c0', '#5a6572'));
      c.fillStyle = '#12161b'; for (let i = 0; i < 4; i++) c.fillRect(37, 12 + i * 6.4, 7, 2);
      ball(c, 13, 8, 3, P.accent, '#ffffff');
      break;
    }
    case 'heli': {
      fillRR(c, m - 3, m - 3.2, m + 4, 6.4, 3, lin(c, m - 3, m + 3, P.main, P.dark));
      fillRR(c, m - 20, m - 1.6, 20, 3.2, 1.5, lin(c, m - 2, m + 2, P.dark, '#0e1216'));
      fillRR(c, m - 24, m - 4.4, 5, 8.8, 2, '#262d36');
      fillRR(c, m - 9, m - 6.4, 20, 12.8, 5.5, lin(c, m - 6, m + 6, P.light, P.main));
      fillRR(c, m + 3, m - 4, 9, 8, 3.5, lin(c, m - 4, m + 4, '#bff3ff', '#2f7aa0'));
      fillRR(c, m - 4, m - 11, 10, 3.2, 1.5, '#2a3038'); fillRR(c, m - 4, m + 7.8, 10, 3.2, 1.5, '#2a3038');
      fillRR(c, m + 12, m - 1.2, 8, 2.4, 1, '#15191e', '#000', false);
      circle(c, m - 1, m, 2, '#10151a');
      break;
    }
    default: break;
  }
  c.restore();
  return cv;
}

/** Rotor do helicóptero (textura separada, girada a cada quadro). */
export function rotorSprite(): HTMLCanvasElement {
  const cv = mk(54, 54), c = cv.getContext('2d')!;
  c.translate(27, 27);
  c.fillStyle = 'rgba(210,220,230,0.18)'; c.beginPath(); c.arc(0, 0, 24, 0, 7); c.fill();
  c.strokeStyle = 'rgba(20,24,30,0.85)'; c.lineWidth = 2.6; c.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 24, Math.sin(a) * 24); c.stroke(); }
  circle(c, 0, 0, 3.2, '#9aa5b1');
  return cv;
}

const cache = new Map<string, HTMLCanvasElement>();
export function sprite(kind: Kind, f: Faction): HTMLCanvasElement {
  const key = `${kind}_${f}`;
  let cv = cache.get(key);
  if (!cv) { cv = DEFS[kind].building ? drawBuilding(kind, f) : drawUnit(kind, f); cache.set(key, cv); }
  return cv;
}

/** Ícone para os botões da sidebar. */
export function icon(kind: Kind, f: Faction, w = 72, h = 54): HTMLCanvasElement {
  const m3 = modelIcon(kind, f, w, h);
  if (m3) return m3;
  const R = 2;
  const cv = mk(w, h, R), c = cv.getContext('2d')!;
  const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, '#26394f'); g.addColorStop(1, '#0c131c');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1;
  for (let x = 0; x < w; x += 12) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = 0; y < h; y += 12) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  const s = sprite(kind, f);
  const sw = s.width / SS, sh = s.height / SS;
  const k = Math.min((w - 8) / sw, (h - 8) / sh, 2.4);
  const dw = sw * k, dh = sh * k;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.save(); c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
  c.drawImage(s, (w - dw) / 2, (h - dh) / 2, dw, dh);
  c.restore();
  return cv;
}

/** Textura de terreno pré-renderizada (um canvas do tamanho do mundo). */
export interface Pt2 { x: number; y: number }
/** Estrada principal entre as bases (curva suave) em pixels de mundo. */
export function roadPoints(bases: Pt2[]): Pt2[] {
  if (bases.length < 2) return [];
  const a = bases[0], b = bases[1], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const c1 = { x: a.x + dx * 0.3 + nx * 190, y: a.y + dy * 0.3 + ny * 190 }, c2 = { x: a.x + dx * 0.7 - nx * 190, y: a.y + dy * 0.7 - ny * 190 };
  const out: Pt2[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80, u = 1 - t;
    out.push({ x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y });
  }
  return out;
}


/** trilhas de esteira/pneu: pares de sulcos curvos entre as bases e os campos de cristal */
function ruts(c: CanvasRenderingContext2D, bases: Pt2[], crystalMax: Uint16Array, mode: 'color' | 'bump', biome: 'grass' | 'desert') {
  const hash = (x: number, y: number, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  const trips: [Pt2, Pt2][] = [];
  for (const b of bases) {
    const near: { d: number; x: number; y: number }[] = [];
    for (let i = 0; i < crystalMax.length; i++) if (crystalMax[i] > 0) {
      const x = ((i % MAP_W) + 0.5) * TILE, y = (Math.floor(i / MAP_W) + 0.5) * TILE, d = Math.hypot(x - b.x, y - b.y);
      if (d > 170) near.push({ d, x, y });
    }
    near.sort((a, b2) => a.d - b2.d);
    for (const k of [0, Math.floor(near.length * 0.4), Math.floor(near.length * 0.75)]) if (near[k]) trips.push([b, near[k]]);
  }
  if (bases.length > 1) trips.push([bases[0], { x: (bases[0].x + bases[1].x) / 2 + 120, y: (bases[0].y + bases[1].y) / 2 - 90 }]);
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  trips.forEach(([a, z], n) => {
    const dx = z.x - a.x, dy = z.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, bow = (hash(n, 3, 8) - 0.5) * 140;
    const cx = (a.x + z.x) / 2 + nx * bow, cy = (a.y + z.y) / 2 + ny * bow;
    for (const off of [-5, 5]) {
      for (let pass = 0; pass < 2; pass++) {
        c.beginPath(); c.moveTo(a.x + nx * off, a.y + ny * off); c.quadraticCurveTo(cx + nx * off, cy + ny * off, z.x + nx * off, z.y + ny * off);
        if (mode === 'color') {
          c.setLineDash(pass ? [14, 9, 4, 12] : []);
          c.strokeStyle = pass ? (biome === 'grass' ? 'rgba(40,28,14,0.40)' : 'rgba(54,36,18,0.38)') : (biome === 'grass' ? 'rgba(92,70,40,0.30)' : 'rgba(80,56,30,0.26)');
          c.lineWidth = pass ? 3 : 7;
        } else { c.setLineDash(pass ? [14, 9, 4, 12] : []); c.strokeStyle = pass ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.35)'; c.lineWidth = pass ? 3 : 8; }
        c.stroke();
      }
    }
  });
  c.restore();
}

/** mapa de relevo (altura em tons de cinza): ruído suave, pedras altas, água baixa, sulcos de esteira */
export function drawTerrainBump(terrain: Uint8Array, crystalMax: Uint16Array, biome: 'grass' | 'desert' = 'desert', bases: Pt2[] = []): HTMLCanvasElement {
  const cv = mk(MAP_W * TILE, MAP_H * TILE, 0.5), c = cv.getContext('2d')!;
  const hash = (x: number, y: number, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  c.fillStyle = '#808080'; c.fillRect(0, 0, MAP_W * TILE, MAP_H * TILE);
  for (let k = 0; k < 900; k++) {
    const x = hash(k, 1, 11) * MAP_W * TILE, y = hash(k, 2, 11) * MAP_H * TILE, r = 18 + hash(k, 3, 11) * 70, v = hash(k, 4, 11) > 0.5 ? 255 : 0;
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${v},${v},${v},0.16)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const t = terrain[y * MAP_W + x]; if (t === 0) continue;
    c.fillStyle = t === 1 ? 'rgba(235,235,235,0.55)' : 'rgba(30,30,30,0.7)';
    c.beginPath(); c.arc((x + 0.5) * TILE, (y + 0.5) * TILE, TILE * 0.62, 0, 7); c.fill();
  }
  ruts(c, bases, crystalMax, 'bump', biome);
  c.fillStyle = '#808080';
  for (const b of bases) { const g = c.createRadialGradient(b.x, b.y, 60, b.x, b.y, 230); g.addColorStop(0, 'rgba(128,128,128,1)'); g.addColorStop(1, 'rgba(128,128,128,0)'); c.fillStyle = g; c.fillRect(b.x - 240, b.y - 240, 480, 480); }
  return cv;
}

export function drawTerrain(terrain: Uint8Array, crystalMax: Uint16Array, biome: 'grass' | 'desert' = 'desert', bases: Pt2[] = []): HTMLCanvasElement {
  const cv = mk(MAP_W * TILE, MAP_H * TILE, 1), c = cv.getContext('2d')!;
  const hash = (x: number, y: number, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? 1 : terrain[y * MAP_W + x]);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const i = y * MAP_W + x, h = hash(x, y), px = x * TILE, py = y * TILE, t = terrain[i];
    if (t === 0) {
      const sand = crystalMax[i] > 0;
      if (sand) {
        c.fillStyle = `rgb(${96 + h * 16},${88 + h * 14},${60 + h * 12})`; c.fillRect(px, py, TILE, TILE);
        for (let k = 0; k < 7; k++) { c.fillStyle = `rgba(${hash(x, y, k) > 0.5 ? '255,240,200' : '60,50,30'},0.10)`; c.fillRect(px + hash(x, y, k + 9) * 28, py + hash(x, y, k + 19) * 28, 2 + hash(x, y, k) * 3, 2); }
      } else if (biome === 'grass') {
        const lush = hash(Math.floor(x / 2), Math.floor(y / 2), 9);
        c.fillStyle = `rgb(${80 + h * 8 + lush * 16},${94 + h * 8 + lush * 12},${56 + h * 6 + lush * 6})`; c.fillRect(px, py, TILE, TILE);
        for (let k = 0; k < 16; k++) {
          const gx = px + hash(x, y, k + 50) * 31, gy = py + hash(x, y, k + 60) * 31, bright = hash(x, y, k + 70);
          c.strokeStyle = bright > 0.5 ? 'rgba(150,150,96,0.45)' : 'rgba(38,46,26,0.45)'; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + (bright - 0.5) * 3, gy - 3.5 - bright * 3); c.stroke();
        }
        if (hash(x, y, 91) > 0.997) { const fx = px + hash(x, y, 92) * 28 + 2, fy = py + hash(x, y, 93) * 28 + 2; c.fillStyle = ['#b8a868', '#c8c4b0', '#9a8a70'][Math.floor(hash(x, y, 94) * 3)]; c.fillRect(fx, fy, 2.4, 2.4); }
      } else {
        const warm = hash(Math.floor(x / 3), Math.floor(y / 3), 5);
        c.fillStyle = `rgb(${142 + h * 5 + warm * 10},${118 + h * 4 + warm * 8},${82 + h * 3 + warm * 6})`; c.fillRect(px, py, TILE, TILE);
        // rachaduras do solo ressecado
        c.strokeStyle = 'rgba(60,42,24,0.32)'; c.lineWidth = 1;
        if (h > 0.45) {
          c.beginPath(); let cx0 = px + hash(x, y, 1) * 30, cy0 = py + hash(x, y, 2) * 30; c.moveTo(cx0, cy0);
          for (let k = 0; k < 4; k++) { cx0 += (hash(x, y, k + 10) - 0.5) * 16; cy0 += (hash(x, y, k + 20) - 0.3) * 12; c.lineTo(cx0, cy0); }
          c.stroke();
        }
        for (let k = 0; k < 10; k++) { c.fillStyle = hash(x, y, k) > 0.5 ? 'rgba(255,238,200,0.10)' : 'rgba(70,48,26,0.14)'; c.fillRect(px + hash(x, y, k + 31) * 30, py + hash(x, y, k + 41) * 30, 2 + hash(x, y, k) * 4, 1.5 + hash(x, y, k + 3) * 2); }
        if (hash(x, y, 77) > 0.86) { const gx = px + hash(x, y, 8) * 26 + 3, gy = py + hash(x, y, 9) * 26 + 4; c.strokeStyle = 'rgba(96,132,58,0.8)'; c.lineWidth = 1.4; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + k * 2, gy - 5 - (2 - Math.abs(k))); c.stroke(); } }
      }
    } else if (t === 1) {
      c.fillStyle = biome === 'grass' ? `rgb(${78 + h * 8},${86 + h * 8},${60 + h * 6})` : `rgb(${112 + h * 10},${96 + h * 8},${72 + h * 8})`; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(px + 17, py + 20, 15, 11, 0.3, 0, 7); c.fill();
      for (let k = 0; k < 6; k++) { c.fillStyle = 'rgba(150,150,150,0.35)'; c.fillRect(px + hash(x, y, k) * 28, py + hash(x, y, k + 7) * 28, 2, 2); }
    } else {
      c.fillStyle = lin(c, py, py + TILE, `rgb(${36 + h * 6},${60 + h * 8},${66 + h * 8})`, `rgb(${26 + h * 6},${46 + h * 6},${52 + h * 6})`); c.fillRect(px, py, TILE, TILE);
      c.strokeStyle = 'rgba(170,190,190,0.18)'; c.lineWidth = 1;
      for (let k = 0; k < 2; k++) { const o = k * 14 + h * 6; c.beginPath(); c.moveTo(px + 3, py + 8 + o); c.quadraticCurveTo(px + 13, py + 2 + o, px + 29, py + 8 + o); c.stroke(); }
      c.fillStyle = 'rgba(150,140,110,0.35)';
      if (at(x - 1, y) !== 2) c.fillRect(px, py, 3, TILE);
      if (at(x + 1, y) !== 2) c.fillRect(px + TILE - 3, py, 3, TILE);
      if (at(x, y - 1) !== 2) c.fillRect(px, py, TILE, 3);
      if (at(x, y + 1) !== 2) c.fillRect(px, py + TILE - 3, TILE, 3);
    }
  }
  // mistura suave entre tipos de solo (grama/areia/terra): borra o mosaico de tiles sem perder todo o detalhe
  c.save(); c.globalAlpha = 0.5; c.filter = 'blur(5px)'; c.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, MAP_W * TILE, MAP_H * TILE); c.restore();
  // variação de cor em escala larga: manchas suaves (sem blocos quadrados)
  for (let k = 0; k < 520; k++) {
    const x = hash(k, 1, 5) * MAP_W * TILE, y = hash(k, 2, 5) * MAP_H * TILE, r = 70 + hash(k, 3, 5) * 190, v = hash(k, 4, 5);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const col = biome === 'grass' ? (v > 0.5 ? '170,160,110' : v > 0.2 ? '36,40,26' : '120,96,64') : (v > 0.5 ? '255,236,196' : v > 0.2 ? '70,46,22' : '120,130,70');
    g.addColorStop(0, `rgba(${col},${v > 0.5 ? 0.10 : 0.13})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // cicatrizes de guerra: crateras de bombardeio e terra queimada (longe das bases)
  for (let k = 0; k < 70; k++) {
    const x = hash(k, 7, 41) * MAP_W * TILE, y = hash(k, 8, 41) * MAP_H * TILE;
    if (bases.some(b => Math.hypot(b.x - x, b.y - y) < 260)) continue;
    const r = k % 5 === 0 ? 26 + hash(k, 9, 41) * 30 : 7 + hash(k, 9, 41) * 14;
    const g = c.createRadialGradient(x, y, 0, x, y, r * 2.4); g.addColorStop(0, 'rgba(24,20,16,0.5)'); g.addColorStop(0.45, 'rgba(36,30,22,0.25)'); g.addColorStop(1, 'rgba(36,30,22,0)');
    c.fillStyle = g; c.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    const g2 = c.createRadialGradient(x, y, r * 0.2, x, y, r); g2.addColorStop(0, 'rgba(18,15,12,0.85)'); g2.addColorStop(0.7, 'rgba(48,40,30,0.6)'); g2.addColorStop(0.92, 'rgba(150,135,110,0.35)'); g2.addColorStop(1, 'rgba(150,135,110,0)');
    c.fillStyle = g2; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  ruts(c, bases, crystalMax, 'color', biome);
  // plataformas de concreto sob as bases e estrada principal
  const pts = roadPoints(bases);
  c.save();
  for (const b of bases) {
    const g = c.createRadialGradient(b.x, b.y, 40, b.x, b.y, 230);
    g.addColorStop(0, 'rgba(84,83,78,0.9)'); g.addColorStop(0.7, 'rgba(78,77,72,0.72)'); g.addColorStop(1, 'rgba(78,77,72,0)');
    c.fillStyle = g; c.fillRect(b.x - 240, b.y - 240, 480, 480);
    for (let k = 0; k < 9; k++) { const ox = b.x + (hash(k, 1, 31) - 0.5) * 300, oy = b.y + (hash(k, 2, 31) - 0.5) * 300, r = 10 + hash(k, 3, 31) * 26, gg = c.createRadialGradient(ox, oy, 0, ox, oy, r); gg.addColorStop(0, k % 3 ? 'rgba(20,18,14,0.38)' : 'rgba(10,10,10,0.5)'); gg.addColorStop(1, 'rgba(20,18,14,0)'); c.fillStyle = gg; c.fillRect(ox - r, oy - r, r * 2, r * 2); }
    c.strokeStyle = 'rgba(0,0,0,0.05)'; c.lineWidth = 1;
    for (let k = -7; k <= 7; k++) { c.beginPath(); c.moveTo(b.x + k * 32, b.y - 220); c.lineTo(b.x + k * 32, b.y + 220); c.moveTo(b.x - 220, b.y + k * 32); c.lineTo(b.x + 220, b.y + k * 32); c.stroke(); }
  }
  if (pts.length) {
    const path = () => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); };
    c.lineCap = 'round'; c.lineJoin = 'round';
    // acostamento de terra e cascalho, com borda irregular
    path(); c.strokeStyle = biome === 'grass' ? 'rgba(98,84,60,0.55)' : 'rgba(104,86,60,0.5)'; c.lineWidth = 62; c.stroke();
    path(); c.strokeStyle = 'rgba(70,62,50,0.6)'; c.lineWidth = 48; c.stroke();
    for (let k = 0; k < pts.length * 3; k++) {
      const p = pts[Math.floor(hash(k, 1, 61) * pts.length)], q = pts[Math.min(pts.length - 1, Math.floor(hash(k, 1, 61) * pts.length) + 1)];
      const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, side = hash(k, 2, 61) > 0.5 ? 1 : -1, off = side * (21 + hash(k, 3, 61) * 12);
      c.fillStyle = `rgba(${hash(k, 4, 61) > 0.5 ? '120,110,92' : '58,52,44'},0.55)`; c.fillRect(p.x + nx * off + hash(k, 5, 61) * dx, p.y + ny * off + hash(k, 5, 61) * dy, 2 + hash(k, 6, 61) * 3, 2 + hash(k, 7, 61) * 2);
    }
    // asfalto gasto
    path(); c.strokeStyle = '#3a3c3d'; c.lineWidth = 40; c.stroke();
    path(); c.strokeStyle = '#444646'; c.lineWidth = 30; c.stroke();
    // remendos, rachaduras e buracos
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k]; if (hash(k, 9, 62) > 0.55) continue;
      const ox = (hash(k, 1, 62) - 0.5) * 26, oy = (hash(k, 2, 62) - 0.5) * 26;
      if (hash(k, 3, 62) > 0.6) { c.fillStyle = 'rgba(26,26,26,0.65)'; c.beginPath(); c.ellipse(p.x + ox, p.y + oy, 3 + hash(k, 4, 62) * 5, 2 + hash(k, 5, 62) * 3, hash(k, 6, 62) * 3, 0, 7); c.fill(); c.strokeStyle = 'rgba(120,110,95,0.35)'; c.lineWidth = 1; c.stroke(); }
      else if (hash(k, 3, 62) > 0.3) { c.fillStyle = 'rgba(52,54,55,0.8)'; c.fillRect(p.x + ox - 6, p.y + oy - 4, 10 + hash(k, 7, 62) * 8, 7); }
      c.strokeStyle = 'rgba(20,20,20,0.55)'; c.lineWidth = 0.9; c.beginPath(); let cx = p.x + ox, cy = p.y + oy; c.moveTo(cx, cy);
      for (let j = 0; j < 5; j++) { cx += (hash(k, j, 63) - 0.5) * 12; cy += (hash(k, j + 9, 63) - 0.5) * 12; c.lineTo(cx, cy); } c.stroke();
    }
    // faixa central desbotada e falhada; terra e areia invadindo as bordas
    c.setLineDash([14, 16]); path(); c.strokeStyle = 'rgba(190,160,70,0.42)'; c.lineWidth = 2.2; c.stroke(); c.setLineDash([]);
    c.setLineDash([30, 22, 8, 40]); path(); c.strokeStyle = biome === 'grass' ? 'rgba(96,84,60,0.45)' : 'rgba(130,108,74,0.45)'; c.lineWidth = 44; c.globalCompositeOperation = 'source-atop'; c.stroke(); c.globalCompositeOperation = 'source-over'; c.setLineDash([]);
    path(); c.strokeStyle = 'rgba(22,22,22,0.22)'; c.lineWidth = 3; c.setLineDash([2, 5]); c.stroke(); c.setLineDash([]);
  }
  // manchas de óleo e terra rachada espalhadas pelo campo
  for (let k = 0; k < 90; k++) {
    const x = hash(k, 3, 71) * MAP_W * TILE, y = hash(k, 4, 71) * MAP_H * TILE, r = 6 + hash(k, 5, 71) * 16;
    if (k % 3 === 0) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(14,12,10,0.5)'); g.addColorStop(1, 'rgba(14,12,10,0)'); c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * (0.5 + hash(k, 6, 71) * 0.5), hash(k, 7, 71) * 3, 0, 7); c.fill(); }
    else { c.strokeStyle = 'rgba(40,32,22,0.28)'; c.lineWidth = 1; for (let j = 0; j < 4; j++) { c.beginPath(); let cx = x, cy = y; c.moveTo(cx, cy); for (let n = 0; n < 4; n++) { cx += (hash(k, j * 9 + n, 72) - 0.5) * 22; cy += (hash(k, j * 9 + n + 4, 72) - 0.5) * 22; c.lineTo(cx, cy); } c.stroke(); } }
  }
  c.restore();
  return cv;
}
