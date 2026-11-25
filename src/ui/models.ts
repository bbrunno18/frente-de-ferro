import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEFS, FACTIONS, Faction, Kind, TILE } from '../config';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Storage } from '../systems/Storage';
import tankUrl from '../assets/models/tank.glb?url';
import tank2Url from '../assets/models/tank2.glb?url';
import tank3Url from '../assets/models/tank3.glb?url';
import tank4Url from '../assets/models/tank4.glb?url';

// ---------- modelos prontos (GLB) com reserva procedural ----------
/** Cada unidade pode ter um modelo .glb (comprimido com gltf-transform/meshopt). Se o arquivo faltar,
 *  falhar ao carregar ou a opção "Modelos detalhados" estiver desligada, usa o modelo procedural abaixo.
 *  len = comprimento final em px do mundo; yaw = giro para a frente apontar para +X. Licenças: src/assets/models/LICENSES.md */
interface GlbSpec { url: string; len: number; yaw: number }
const GLB: Partial<Record<Kind, GlbSpec>> = {
  tank: { url: tankUrl, len: 44, yaw: Math.PI },
  artillery: { url: tank2Url, len: 50, yaw: Math.PI },
  prism: { url: tank3Url, len: 50, yaw: Math.PI },
  cryo: { url: tank4Url, len: 54, yaw: Math.PI },
};
const glbTmpl = new Map<Kind, THREE.Group>();
let glbOn = true;
/** o modo gráfico Baixo usa sempre os modelos procedurais (menos vértices no celular) */
export function setGlbEnabled(on: boolean) { glbOn = on; }
export const glbLoaded = (k: Kind) => glbTmpl.has(k);

export async function preloadModels(ms = 5000): Promise<void> {
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  const jobs = (Object.keys(GLB) as Kind[]).map(k => L.loadAsync(GLB[k]!.url).then(g => { glbTmpl.set(k, normalizeGlb(g.scene, GLB[k]!)); }).catch(err => console.warn('modelo', k, 'indisponível, usando procedural', err)));
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, ms))]);
}

/** achata a cena do GLB em malhas estáticas (esteiras com esqueleto viram malha comum), gira, escala e assenta no chão */
function normalizeGlb(src: THREE.Object3D, sp: GlbSpec): THREE.Group {
  src.updateMatrixWorld(true);
  const inner = new THREE.Group();
  src.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    // a compressão (meshopt/quantização) guarda posições como inteiros normalizados: converte para float antes de transformar
    for (const name of Object.keys(g.attributes)) {
      if (name === 'skinIndex' || name === 'skinWeight') continue;
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      if (a.array instanceof Float32Array && !(a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) continue;
      const n = a.count, k = a.itemSize, arr = new Float32Array(n * k);
      for (let i = 0; i < n; i++) { arr[i * k] = a.getX(i); if (k > 1) arr[i * k + 1] = a.getY(i); if (k > 2) arr[i * k + 2] = a.getZ(i); if (k > 3) arr[i * k + 3] = a.getW(i); }
      g.setAttribute(name, new THREE.BufferAttribute(arr, k));
    }
    const sk = m as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) {
      // assa a pose do esqueleto na própria malha: cada vértice vai para onde os ossos o colocam
      sk.skeleton.update();
      const pos = g.getAttribute('position') as THREE.BufferAttribute, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); sk.applyBoneTransform(i, v); pos.setXYZ(i, v.x, v.y, v.z); }
      g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
      g.applyMatrix4(m.matrixWorld);
      g.computeVertexNormals();
    } else g.applyMatrix4(m.matrixWorld);
    const mesh = new THREE.Mesh(g, m.material); mesh.name = m.name || o.parent?.name || ''; mesh.userData.shared = true;
    inner.add(mesh);
  });
  inner.rotation.y = sp.yaw; inner.updateMatrixWorld(true);
  let bb = new THREE.Box3().setFromObject(inner);
  const sz = bb.getSize(new THREE.Vector3());
  inner.scale.setScalar(sp.len / Math.max(sz.x, sz.z)); inner.updateMatrixWorld(true);
  bb = new THREE.Box3().setFromObject(inner);
  const c = bb.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -bb.min.y, -c.z);
  const out = new THREE.Group(); out.add(inner); return out;
}

const tintCache = new Map<string, THREE.Material>();
/** pinta o modelo com a paleta militar da facção, pelo nome do material (Main, Main_Dark, Main_Light, Main_Details) */
function tintMat(src: THREE.Material, f: Faction): THREE.Material {
  const key = src.uuid + f; const hit = tintCache.get(key); if (hit) return hit;
  const P = FACTIONS[f], m = (src as THREE.MeshStandardMaterial).clone(), nm = src.name.toLowerCase();
  // corpo: tinta militar neutra; "Main_Light" (faixas, escotilhas): cor da facção; detalhes e esteiras: aço escuro
  const col = nm === 'main' ? body(f, 0.18) : nm.includes('dark') ? new THREE.Color(BODY[f]).multiplyScalar(0.5).getStyle() : nm.includes('light') ? mil(P.main, 0.15) : nm.includes('wheel') ? '#24231f' : '#3a3936';
  if (m.color) m.color.set(col);
  (m as THREE.MeshStandardMaterial).vertexColors = false;
  if ('roughness' in m) { const ms = m as THREE.MeshStandardMaterial; ms.roughness = nm.includes('detail') || nm.includes('wheel') ? 0.55 : 0.62; ms.metalness = nm.includes('detail') || nm.includes('wheel') ? 0.85 : 0.6; ms.envMapIntensity = 0.9; weather(ms, 1.2); }
  tintCache.set(key, m); return m;
}

function glbModel(kind: Kind, f: Faction): THREE.Group | null {
  if (!glbOn || Storage.data.detailModels === false) return null;
  const t = glbTmpl.get(kind); if (!t) return null;
  const g = t.clone(true);
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(x => tintMat(x, f)) : tintMat(m.material, f); });
  const bb = new THREE.Box3().setFromObject(g);
  const c = palette(f);
  g.add(sph(1.3, c.accent, bb.min.x + 4, bb.max.y * 0.72, 0)); // farol da facção, identificação rápida em campo
  g.userData.h = Math.round(bb.max.y); g.userData.glb = true;
  return g;
}

/** Modelos 3D procedurais (sem arquivos externos). Frente do modelo = +X; origem no centro, base em y=0. */

// ---------- texturas ----------
let grainTex: THREE.CanvasTexture | null = null;
function grain(): THREE.CanvasTexture {
  if (grainTex) return grainTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, 128, 128);
  const img = x.getImageData(0, 0, 128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 34; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  x.putImageData(img, 0, 0);
  x.strokeStyle = 'rgba(0,0,0,0.30)'; x.lineWidth = 2; x.strokeRect(2, 2, 124, 124);
  x.strokeStyle = 'rgba(255,255,255,0.20)'; x.lineWidth = 1; x.strokeRect(4.5, 4.5, 119, 119);
  x.fillStyle = 'rgba(0,0,0,0.26)';
  for (const [px, py] of [[10, 10], [118, 10], [10, 118], [118, 118], [64, 10], [64, 118]]) { x.beginPath(); x.arc(px, py, 1.7, 0, 7); x.fill(); }
  x.strokeStyle = 'rgba(0,0,0,0.11)'; x.lineWidth = 1;
  for (let i = 0; i < 7; i++) { x.beginPath(); const sx = Math.random() * 128, sy = Math.random() * 128; x.moveTo(sx, sy); x.lineTo(sx + Math.random() * 34 - 17, sy + Math.random() * 34 - 17); x.stroke(); }
  const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, 'rgba(60,48,30,0.12)'); g.addColorStop(1, 'rgba(50,38,20,0.42)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 22; i++) { const sx = Math.random() * 128, sy = Math.random() * 60; const gg = x.createLinearGradient(0, sy, 0, sy + 30 + Math.random() * 50); gg.addColorStop(0, 'rgba(40,30,20,0.22)'); gg.addColorStop(1, 'rgba(40,30,20,0)'); x.fillStyle = gg; x.fillRect(sx, sy, 1 + Math.random() * 2, 80); }
  for (let i = 0; i < 9; i++) { const rx = Math.random() * 128, ry = Math.random() * 128, rr = 2 + Math.random() * 7; const rg = x.createRadialGradient(rx, ry, 0, rx, ry, rr); rg.addColorStop(0, 'rgba(110,60,25,0.38)'); rg.addColorStop(1, 'rgba(110,60,25,0)'); x.fillStyle = rg; x.fillRect(rx - rr, ry - rr, rr * 2, rr * 2); }
  for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 6, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; grainTex = t; return t;
}

let wearTex: THREE.CanvasTexture | null = null;
/** mapa de rugosidade procedural: arranhões, manchas e desgaste nas quinas (verde = rugosidade) */
function wear(): THREE.CanvasTexture {
  if (wearTex) return wearTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#b0b0b0'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) { const g = x.createRadialGradient(0, 0, 1, 0, 0, 8 + Math.random() * 22); const v = Math.random() < 0.5 ? 255 : 90; g.addColorStop(0, `rgba(${v},${v},${v},0.32)`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.translate(Math.random() * 128, Math.random() * 128); x.fillStyle = g; x.fillRect(-30, -30, 60, 60); x.restore(); }
  x.lineWidth = 1;
  for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,40,40'},0.25)`; x.beginPath(); const sx = Math.random() * 128, sy = Math.random() * 128; x.moveTo(sx, sy); x.lineTo(sx + Math.random() * 26 - 13, sy + Math.random() * 6 - 3); x.stroke(); }
  x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 3; x.strokeRect(1, 1, 126, 126);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; wearTex = t; return t;
}

const emblemCache = new Map<Faction, THREE.CanvasTexture>();
function emblem(f: Faction): THREE.CanvasTexture {
  const hit = emblemCache.get(f); if (hit) return hit;
  const P = FACTIONS[f], c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!; x.translate(64, 64);
  x.fillStyle = P.accent; x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 6;
  if (f === 'solar') {
    for (let i = 0; i < 12; i++) { x.save(); x.rotate((i / 12) * 6.2832); x.beginPath(); x.moveTo(-6, -34); x.lineTo(0, -58); x.lineTo(6, -34); x.closePath(); x.stroke(); x.fill(); x.restore(); }
    x.beginPath(); x.arc(0, 0, 28, 0, 7); x.stroke(); x.fill();
    x.fillStyle = P.dark; x.beginPath(); x.arc(0, 0, 14, 0, 7); x.fill();
  } else if (f === 'boreal') {
    for (let i = 0; i < 6; i++) { x.save(); x.rotate((i / 6) * 6.2832); x.beginPath(); x.moveTo(-5, -8); x.lineTo(-5, -50); x.lineTo(0, -60); x.lineTo(5, -50); x.lineTo(5, -8); x.closePath(); x.stroke(); x.fill(); x.restore(); }
    x.beginPath(); x.arc(0, 0, 18, 0, 7); x.stroke(); x.fill(); x.fillStyle = P.dark; x.beginPath(); x.arc(0, 0, 8, 0, 7); x.fill();
  } else if (f === 'viboras') {
    x.beginPath(); x.moveTo(0, -58); x.lineTo(46, 0); x.lineTo(0, 58); x.lineTo(-46, 0); x.closePath(); x.stroke(); x.fill();
    x.fillStyle = P.dark; x.beginPath(); x.moveTo(-24, -6); x.quadraticCurveTo(0, -30, 24, -6); x.quadraticCurveTo(0, 8, -24, -6); x.fill();
    x.fillStyle = P.main; x.fillRect(-3, 6, 6, 30);
  } else {
    for (let i = 0; i < 8; i++) { x.save(); x.rotate((i / 8) * 6.2832); x.beginPath(); x.rect(-9, -56, 18, 22); x.stroke(); x.fill(); x.restore(); }
    x.beginPath(); x.arc(0, 0, 40, 0, 7); x.stroke(); x.fill();
    x.fillStyle = P.dark; x.beginPath(); x.arc(0, 0, 20, 0, 7); x.fill();
    x.fillStyle = P.accent; x.fillRect(-4, -34, 8, 68); x.fillRect(-34, -4, 68, 8);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; emblemCache.set(f, t); return t;
}


/** Desgaste procedural no shader (sem texturas): lama e poeira nas partes baixas e esteiras, manchas de fuligem,
 *  riscos de metal exposto e rugosidade maior onde há sujeira. Usa a posição no mundo, então funciona em qualquer modelo. */
export function weather<T extends THREE.MeshStandardMaterial>(m: T, amt = 1): T {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
float wH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float wN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wH(i), wH(i + vec3(1,0,0)), f.x), mix(wH(i + vec3(0,1,0)), wH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wH(i + vec3(0,0,1)), wH(i + vec3(1,0,1)), f.x), mix(wH(i + vec3(0,1,1)), wH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float wn = wN(vWPos * 0.32) * 0.6 + wN(vWPos * 1.4) * 0.4;
float wDirt = smoothstep(10.0, 0.5, vWPos.y) * (0.4 + 0.6 * wn) * ${amt.toFixed(2)};
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.29, 0.24, 0.18), wDirt * 0.65);
diffuseColor.rgb *= 0.78 + 0.34 * wn;
float wScr = step(0.93, wN(vWPos * vec3(2.6, 0.35, 2.6))) * (1.0 - wDirt);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.54, 0.5), wScr * 0.45 * ${amt.toFixed(2)});`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + wDirt * 0.3 - wScr * 0.25, 0.0, 1.0);');
  };
  m.customProgramCacheKey = () => 'weather' + amt;
  return m;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string | number, o: { metal?: number; rough?: number; emissive?: string | number; ei?: number; opacity?: number; grain?: boolean } = {}): THREE.MeshStandardMaterial {
  const useGrain = o.grain ?? (!o.emissive && (o.opacity ?? 1) >= 1);
  const key = `${color}|${o.metal ?? 0.3}|${o.rough ?? 0.6}|${o.emissive ?? ''}|${o.ei ?? 0}|${o.opacity ?? 1}|${useGrain ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, metalness: o.metal ?? 0.3, roughness: o.rough ?? 0.6,
      emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 0,
      transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1,
      map: useGrain ? grain() : null,
      roughnessMap: useGrain && (o.metal ?? 0.3) >= 0.3 ? wear() : null,
      bumpMap: useGrain ? wear() : null, bumpScale: 0.6,
      envMapIntensity: 0.55 + (o.metal ?? 0.3) * 0.9,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    if (!o.emissive && (o.opacity ?? 1) >= 1) weather(m);
    matCache.set(key, m);
  }
  return m;
}

type M = THREE.Material;
const box = (w: number, h: number, d: number, m: M, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); return o;
};
const cyl = (rt: number, rb: number, h: number, m: M, x = 0, y = 0, z = 0, seg = 14) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y + h / 2, z); return o;
};
const sph = (r: number, m: M, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, half = false) => {
  const o = new THREE.Mesh(half ? new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(r, 16, 12), m);
  o.position.set(x, y, z); o.scale.set(sx, sy, sz); return o;
};
const cone = (r: number, h: number, m: M, x = 0, y = 0, z = 0, seg = 5) => {
  const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m); o.position.set(x, y + h / 2, z); return o;
};
const prism = (w: number, h: number, d: number, m: M, x = 0, y = 0, z = 0) => {
  const g = new THREE.CylinderGeometry(1, 1, w, 3);
  const o = new THREE.Mesh(g, m);
  o.rotation.z = Math.PI / 2; o.rotation.x = Math.PI / 2;
  o.scale.set(d / 1.74, 1, h / 1.5);
  o.position.set(x, y + h / 2, z);
  return o;
};
/** cano ao longo de +X, começando em x=0 (r1 = ponta, r2 = culatra) */
const barrel = (r1: number, r2: number, len: number, m: M) => {
  const g = new THREE.CylinderGeometry(r1, r2, len, 10).rotateZ(-Math.PI / 2).translate(len / 2, 0, 0);
  return new THREE.Mesh(g, m);
};
/** cilindro deitado com eixo em Z, centro em (x,y,z) */
const roll = (r: number, len: number, m: M, x: number, y: number, z: number, seg = 12) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2), m); o.position.set(x, y, z); return o;
};
const decal = (f: Faction, size: number, x: number, y: number, z: number, ry = 0, rx = 0) => {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: emblem(f), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: 0xa8a8a0, opacity: 0.85 }));
  o.position.set(x, y, z); o.rotation.set(rx, ry, 0); return o;
};

function padTexture(P: { main: string }): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#2b323b'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 2;
  for (let i = 1; i < 8; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 256); x.moveTo(0, i * 32); x.lineTo(256, i * 32); x.stroke(); }
  x.strokeStyle = P.main; x.lineWidth = 8; x.beginPath(); x.arc(128, 128, 100, 0, 7); x.stroke();
  x.strokeStyle = '#f2f5f8'; x.lineWidth = 16; x.lineCap = 'round';
  x.beginPath(); x.moveTo(98, 78); x.lineTo(98, 178); x.moveTo(158, 78); x.lineTo(158, 178); x.moveTo(98, 128); x.lineTo(158, 128); x.stroke();
  x.fillStyle = '#ffcc33';
  for (let i = 0; i < 16; i++) { x.fillRect(i * 16 + 2, 2, 8, 6); x.fillRect(i * 16 + 2, 248, 8, 6); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export interface ModelInfo { height: number; air: boolean }

/** puxa a cor da facção para tons militares: dessatura e mistura com verde-oliva/cinza */
function mil(hex: string, k: number): string {
  const c = new THREE.Color(hex), hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl); c.setHSL(hsl.h, hsl.s * (1 - k * 0.75), hsl.l * (1 - k * 0.15));
  c.lerp(new THREE.Color('#57574a'), k * 0.35);
  return '#' + c.getHexString();
}
/** tinta de corpo militar por facção (neutra); a cor da facção fica nos detalhes */
const BODY: Record<Faction, string> = { solar: '#857a5c', ferro: '#4d4c47', boreal: '#8a8f91', viboras: '#555046' };
function body(f: Faction, k = 0.3): string { return '#' + new THREE.Color(BODY[f]).lerp(new THREE.Color(mil(FACTIONS[f].main, 0.45)), k).getHexString(); }
function palette(f: Faction) {
  const P = FACTIONS[f];
  return {
    main: mat(body(f), { metal: 0.55, rough: 0.6 }),
    light: mat(mil(P.main, 0.2), { metal: 0.45, rough: 0.6 }),
    dark: mat(new THREE.Color(BODY[f]).multiplyScalar(0.55).getStyle(), { metal: 0.65, rough: 0.62 }),
    accent: mat(P.accent, { metal: 0.2, rough: 0.35, emissive: P.accent, ei: 1.15 }),
    steel: mat('#62666a', { metal: 0.85, rough: 0.45 }),
    steelD: mat('#35383b', { metal: 0.8, rough: 0.55 }),
    black: mat('#14181d', { metal: 0.5, rough: 0.7 }),
    concrete: mat('#7a7a72', { metal: 0.05, rough: 0.95 }),
    sand: mat('#857456', { metal: 0, rough: 1 }),
    hazard: mat('#9c8636', { metal: 0.25, rough: 0.75 }),
    lit: mat('#ffe9a8', { metal: 0, rough: 0.4, emissive: '#ffc94d', ei: 2.2 }),
    red: mat('#ff4a3a', { metal: 0, rough: 0.4, emissive: '#ff2a1a', ei: 2.4 }),
    glass: mat('#5f7c88', { metal: 0.85, rough: 0.12, emissive: '#1d5566', ei: 0.35, opacity: 0.85 }),
    crystal: mat('#58d6ff', { metal: 0.3, rough: 0.2, emissive: '#2ab8ff', ei: 2.0 }),
    skin: mat('#a88a6c', { metal: 0, rough: 0.85 }),
    solar: mat('#1e3450', { metal: 0.85, rough: 0.28, emissive: '#0a1a33', ei: 0.35, grain: false }),
    P,
  };
}

/** janelas iluminadas em fileira: face +Z/-Z (axis 'z') ou +X/-X (axis 'x') */
function windows(g: THREE.Group, c: ReturnType<typeof palette>, n: number, span: number, y: number, face: number, axis: 'x' | 'z', w = 4.5, h = 3.6) {
  for (let i = 0; i < n; i++) {
    const p = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
    g.add(axis === 'z' ? box(w, h, 0.8, c.lit, p, y, face) : box(0.8, h, w, c.lit, face, y, p));
  }
}

function buildStructure(kind: Kind, f: Faction): THREE.Group {
  const d = DEFS[kind], g = new THREE.Group();
  const W = d.w * TILE, D = d.h * TILE, c = palette(f);
  if (kind === 'wall') {
    g.add(box(TILE - 3, 14, TILE - 3, c.concrete, 0, 0, 0), box(TILE - 1, 3, TILE - 1, c.main, 0, 14, 0), box(TILE - 6, 2, 3, c.steelD, 0, 17, 0));
    g.add(box(TILE - 2, 1.4, 2, c.hazard, 0, 5, (TILE - 3) / 2), box(TILE - 2, 1.4, 2, c.hazard, 0, 5, -(TILE - 3) / 2));
    g.userData.h = 18; return g;
  }
  if (kind === 'bunker') {
    g.add(cyl(14, 16, 4, c.concrete, 0, 0, 0, 6), cyl(12.5, 14, 8, c.concrete, 0, 4, 0, 6), cyl(13.2, 13.2, 1.2, c.black, 0, 7.5, 0, 6), cyl(9, 12.5, 3, c.dark, 0, 12, 0, 6));
    for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28; g.add(box(6, 3.4, 3.2, c.sand, Math.cos(a) * 17, 0, Math.sin(a) * 17).rotateY(-a + Math.PI / 2)); }
    const head = new THREE.Group(); head.position.y = 15;
    head.add(box(7, 4, 7, c.steelD, 0, 0, 0), box(4, 1.2, 8, c.dark, -2, 4, 0));
    const bar = new THREE.Group(); bar.position.set(3, 2.2, 0); bar.add(barrel(0.9, 1.3, 15, c.black), box(4, 2.4, 3, c.steel, 2, -1.2, 0)); head.add(bar);
    g.add(head); g.userData.head = head; g.userData.barrel = bar; g.userData.h = 22; return g;
  }
  if (kind === 'cannon') {
    g.add(cyl(14, 16, 5, c.concrete, 0, 0, 0, 10), cyl(11, 12, 3, c.steelD, 0, 5, 0, 12), box(TILE - 2, 1.2, 2, c.hazard, 0, 1, TILE / 2 - 2));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + 0.78; g.add(box(4, 6, 4, c.dark, Math.cos(a) * 14, 0, Math.sin(a) * 14)); }
    const head = new THREE.Group(); head.position.y = 9;
    head.add(box(16, 10, 16, c.main, -2, 0, 0), box(10, 2, 14, c.dark, -4, 10, 0), box(5, 6, 17, c.steelD, -11, 2, 0), sph(1.3, c.red, -8, 12.6, 5));
    const bar = new THREE.Group(); bar.position.set(5, 6, 0); bar.rotation.z = 0.22;
    bar.add(barrel(2.6, 3.4, 34, c.steelD), cyl(4, 4, 4, c.black, 30, -2, 0, 10).rotateZ(Math.PI / 2), cyl(4.2, 4.2, 10, c.steel, 4, -2, 0, 10).rotateZ(Math.PI / 2));
    (bar.children[1] as THREE.Object3D).position.set(32, 0, 0); (bar.children[2] as THREE.Object3D).position.set(5, 0, 0);
    head.add(bar); g.add(head); g.userData.head = head; g.userData.barrel = bar; g.userData.h = 30; return g;
  }
  if (kind === 'turret' || kind === 'aa') {
    g.add(cyl(13, 15, 6, c.steelD, 0, 0, 0, 12), cyl(10, 11, 3, c.concrete, 0, 6, 0, 12));
    for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28 + 0.4; g.add(box(7, 4, 3.5, c.sand, Math.cos(a) * 15.5, 0, Math.sin(a) * 15.5).rotateY(-a + Math.PI / 2)); }
    const head = new THREE.Group(); head.position.y = 9;
    head.add(box(18, 8, 16, c.main, 0, 0, 0), sph(5, c.light, -2, 8, 0, 1, 0.8, 1), box(6, 2, 10, c.dark, -8, 8, 0), sph(1.4, c.red, -9, 10.8, 4));
    const bar = new THREE.Group();
    if (kind === 'turret') {
      bar.position.set(9, 4, 0);
      bar.add(barrel(2.1, 2.7, 24, c.black), cyl(3.2, 3.2, 4, c.steelD, 14, -2, 0, 8).rotateZ(Math.PI / 2), sph(2.6, c.accent, 25, 0, 0));
      (bar.children[1] as THREE.Object3D).position.set(15, 0, 0);
    } else {
      bar.position.set(8, 3, 0);
      for (const z of [-5, 5]) { bar.add(box(20, 4, 4, c.steel, 0, 0, z)); const t = cone(2.2, 6, c.accent, 0, 0, 0).rotateZ(-Math.PI / 2); t.position.set(23, 2, z); bar.add(t); }
    }
    head.add(bar);
    g.add(head); g.userData.head = head; g.userData.barrel = bar; g.userData.h = 26; return g;
  }
  g.add(box(W - 2, 3, D - 2, c.steelD, 0, 0, 0), box(W - 4, 1.2, 3, c.hazard, 0, 3, D / 2 - 4), box(W - 4, 1.2, 3, c.hazard, 0, 3, -D / 2 + 4));
  // detalhes de base militar: sacos de areia nos cantos da frente, holofote e antena no fundo
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) for (let l = 0; l < 2; l++) g.add(sph(2.5, c.sand, sx * (W / 2 - 3 - i * 4.6) + (l ? sx * 2.3 : 0), 1.6 + l * 2.6, D / 2 + 3, 1.25, 0.6, 1));
  g.add(cyl(0.7, 0.9, 22, c.steelD, -W / 2 + 3, 0, -D / 2 + 3, 6), box(4, 2.6, 3, c.dark, -W / 2 + 3, 22, -D / 2 + 3), box(0.6, 1.8, 2.4, c.lit, -W / 2 + 5.2, 22.4, -D / 2 + 3));
  g.add(cyl(0.3, 0.3, 26, c.black, W / 2 - 4, 3, -D / 2 + 4, 4));
  switch (kind) {
    case 'conyard': {
      g.add(box(W - 16, 20, D - 16, c.steel, 0, 3, 0), box(W - 22, 3, D - 22, c.main, 0, 23, 0));
      const bw = (W - 16) / 2, bd = (D - 16) / 2;
      windows(g, c, 5, W - 36, 12, bd + 0.3, 'z'); windows(g, c, 5, W - 36, 12, -bd - 0.3, 'z');
      windows(g, c, 5, D - 36, 12, bw + 0.3, 'x'); windows(g, c, 5, D - 36, 12, -bw - 0.3, 'x');
      g.add(decal(f, 17, 0, 14, bd + 0.9), decal(f, 17, bw + 0.9, 14, 0, Math.PI / 2));
      g.add(cyl(26, 28, 6, c.steelD, 0, 26, 0, 20), sph(20, c.light, 0, 32, 0, 1, 0.8, 1, true));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(21, 1.1, 6, 28), c.accent); ring.rotation.x = Math.PI / 2; ring.position.y = 33; g.add(ring);
      g.add(sph(6, c.accent, 0, 48, 0));
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = x * (W / 2 - 10), pz = z * (D / 2 - 10);
        g.add(cyl(6, 7, 34, c.dark, px, 3, pz, 10), cone(7, 8, c.main, px, 37, pz, 10), cyl(6.4, 6.4, 2, c.hazard, px, 12, pz, 10), sph(1.5, c.red, px, 46.5, pz));
      }
      for (let i = 0; i < 3; i++) g.add(box(7, 3, 7, c.steelD, -16 + i * 10, 26, -(D / 2 - 22)), box(5, 1, 5, c.black, -16 + i * 10, 29, -(D / 2 - 22)));
      g.add(cyl(0.9, 0.9, 28, c.black, 24, 26, -22, 6), sph(2, c.red, 24, 55, -22));
      g.userData.h = 56; break;
    }
    case 'power': {
      g.add(box(W - 20, 10, D - 20, c.steel, 0, 3, 0));
      windows(g, c, 3, W - 40, 6, (D - 20) / 2 + 0.3, 'z', 3.4, 2.4);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const p = box(22, 1.6, 20, c.solar, x * 15, 0, z * 15); p.position.y = 17; p.rotation.z = -x * 0.38; g.add(p);
        const fr = box(23, 0.8, 21, c.steelD, x * 15, 0, z * 15); fr.position.y = 16.4; fr.rotation.z = -x * 0.38; g.add(fr);
        g.add(cyl(1.4, 1.4, 10, c.steelD, x * 15, 8, z * 15, 6));
      }
      g.add(cyl(4, 5, 28, c.steel, 0, 3, 0, 10), cyl(5.2, 5.2, 2, c.hazard, 0, 12, 0, 10), new THREE.Mesh(new THREE.OctahedronGeometry(6), c.accent).translateY(36));
      for (const z of [-1, 1]) g.add(box(8, 8, 6, c.dark, W / 2 - 12, 3, z * 18), box(6, 1.2, 0.8, c.lit, W / 2 - 12, 8, z * 18 + 3.2));
      g.userData.h = 44; break;
    }
    case 'refinery': {
      g.add(box(52, 20, 38, c.steel, 16, 3, 4), box(54, 3, 40, c.main, 16, 23, 4));
      windows(g, c, 4, 36, 14, 4 + 19.3, 'z', 4, 3); windows(g, c, 4, 36, 14, 4 - 19.3, 'z', 4, 3);
      g.add(decal(f, 14, 16, 24.4, 4, 0, -Math.PI / 2));
      for (const z of [-17, 17]) g.add(cyl(13, 13, 28, c.concrete, -28, 3, z, 18), sph(13, c.steel, -28, 31, z, 1, 0.45, 1, true), cyl(13.3, 13.3, 2.4, c.hazard, -28, 10, z, 18), cyl(13.3, 13.3, 2.4, c.hazard, -28, 22, z, 18));
      g.add(roll(2, 34, c.steelD, -28, 36, 0, 8), roll(1.4, 24, c.steel, -10, 8, 8, 8));
      g.add(cyl(3.2, 3.8, 38, c.dark, 34, 23, -10, 10), sph(2, c.red, 34, 62, -10), box(40, 4, 10, c.steelD, -4, 3, -24));
      for (let i = 0; i < 4; i++) g.add(cone(4 + (i % 2), 11 + (i % 3) * 3, c.crystal, 6 + i * 11, 0, 27, 5));
      g.userData.h = 44; break;
    }
    case 'barracks': {
      g.add(box(W - 12, 15, D - 22, c.steel, 0, 3, 0), prism(W - 10, 12, D - 14, c.main, 0, 18, 0));
      const fz = (D - 22) / 2;
      g.add(box(14, 13, 3, c.black, 0, 3, fz + 0.5), box(18, 1.6, 3.6, c.hazard, 0, 16, fz + 0.5));
      windows(g, c, 2, 34, 10, fz + 0.3, 'z', 5, 4); windows(g, c, 2, 40, 10, -fz - 0.3, 'z', 5, 4);
      g.add(decal(f, 12, -(W - 12) / 2 + 12, 13, fz + 0.9));
      for (let i = 0; i < 4; i++) g.add(cyl(2.6, 2.6, 8, c.sand, -14 + i * 9, 0, fz + 7, 8).rotateZ(Math.PI / 2));
      g.add(cyl(0.8, 0.8, 34, c.black, W / 2 - 8, 3, -D / 2 + 8, 6), box(11, 6, 0.8, c.main, W / 2 - 3, 29, -D / 2 + 8), sph(1.2, c.red, W / 2 - 8, 37.5, -D / 2 + 8));
      g.userData.h = 34; break;
    }
    case 'factory': {
      g.add(box(W - 10, 22, D - 14, c.steel, 0, 3, 0));
      for (let i = 0; i < 3; i++) g.add(prism(24, 8, D - 14, c.dark, -28 + i * 28, 25, 0), box(22, 0.8, D - 18, c.glass, -28 + i * 28, 28.6, 0));
      g.add(box(3, 17, D - 28, c.black, W / 2 - 4, 3, 0), box(3, 4, D - 22, c.main, W / 2 - 4, 20, 0));
      for (let i = 0; i < 4; i++) g.add(box(1, 17, 1, c.steelD, W / 2 - 2, 3, -(D - 28) / 2 + i * (D - 28) / 3));
      for (const z of [-14, 14]) g.add(cyl(3, 3.6, 24, c.steelD, -W / 2 + 12, 25, z, 8), cyl(3.4, 3.4, 2, c.hazard, -W / 2 + 12, 40, z, 8), sph(2, c.red, -W / 2 + 12, 51, z));
      windows(g, c, 4, W - 40, 14, (D - 14) / 2 + 0.3, 'z', 6, 3); windows(g, c, 4, W - 40, 14, -(D - 14) / 2 - 0.3, 'z', 6, 3);
      g.add(decal(f, 13, 0, 24.6, 0, 0, -Math.PI / 2).translateX(-W / 2 + 22));
      g.add(box(2, 2, D - 20, c.accent, W / 2 - 3, 24, 0));
      const arm = box(30, 2, 2, c.hazard, -2, 0, 0); arm.position.set(-14, 48, D / 2 - 10); g.add(arm, box(2, 14, 2, c.hazard, -28, 36, D / 2 - 10));
      g.userData.h = 52; break;
    }
    case 'radar': {
      g.add(box(W - 22, 10, D - 22, c.steel, 0, 3, 0), cyl(4, 5, 16, c.steelD, 0, 13, 0, 8), cyl(7, 8, 2, c.hazard, 0, 12, 0, 12));
      windows(g, c, 2, 18, 7, (D - 22) / 2 + 0.3, 'z', 4, 3);
      const spin = new THREE.Group(); spin.position.y = 31;
      const dish = sph(17, c.light, 0, 0, 0, 1, 0.5, 1, true); dish.rotation.z = -0.9; spin.add(dish);
      const rod = cyl(0.9, 0.9, 18, c.black, 6, 0, 0, 6); rod.rotation.z = -0.9; rod.position.set(7, 8, 0); spin.add(rod, sph(2.4, c.red, 12, 16, 0));
      g.add(spin); g.userData.spin = spin; g.userData.spinSpeed = 1.3;
      g.add(cyl(0.5, 0.5, 20, c.black, -W / 2 + 14, 3, D / 2 - 14, 5), sph(1.2, c.red, -W / 2 + 14, 24, D / 2 - 14));
      g.userData.h = 50; break;
    }
    case 'lab': {
      g.add(box(W - 14, 16, D - 14, mat('#2d4a63', { metal: 0.5, rough: 0.4 }), 0, 3, 0), box(W - 18, 2.5, D - 18, c.main, 0, 19, 0));
      windows(g, c, 4, W - 34, 11, (D - 14) / 2 + 0.3, 'z', 4, 3.4); windows(g, c, 4, D - 34, 11, (W - 14) / 2 + 0.3, 'x', 4, 3.4);
      g.add(sph(16, c.glass, 0, 21.5, 0, 1, 0.9, 1, true));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(16.5, 1, 6, 24), c.steelD); ring.rotation.x = Math.PI / 2; ring.position.y = 21.8; g.add(ring);
      for (let i = -1; i <= 1; i++) g.add(cyl(2.6, 2.6, 18, c.crystal, i * 7, 21.5, 0, 8));
      g.add(decal(f, 11, 0, 11, -(D - 14) / 2 - 0.9, Math.PI));
      g.add(sph(4, c.red, W / 2 - 10, 26, -D / 2 + 10), cyl(1, 1, 14, c.black, W / 2 - 10, 19, -D / 2 + 10, 6));
      g.userData.h = 40; break;
    }
    case 'helipad': {
      g.add(box(W - 8, 2, D - 8, c.concrete, 0, 3, 0));
      const top = new THREE.Mesh(new THREE.PlaneGeometry(W - 12, D - 12), new THREE.MeshStandardMaterial({ map: padTexture(c.P), roughness: 0.8 }));
      top.rotation.x = -Math.PI / 2; top.position.y = 5.2; g.add(top);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(1.4, 1.4, 5, c.accent, x * (W / 2 - 6), 3, z * (D / 2 - 6), 6));
      g.add(cyl(0.6, 0.6, 18, c.black, W / 2 - 4, 3, 0, 5), sph(1.4, c.red, W / 2 - 4, 21.5, 0));
      g.userData.h = 12; break;
    }
    default: break;
  }
  return g;
}

function buildUnit(kind: Kind, f: Faction): THREE.Group {
  const g = new THREE.Group(), c = palette(f);
  const tracks = (L: number, Wd: number) => {
    for (const z of [-Wd / 2, Wd / 2]) {
      g.add(box(L, 8, 6, c.black, 0, 0, z), box(L + 2, 1.6, 7, c.steelD, 0, 8, z));
      for (let i = -2; i <= 2; i++) g.add(roll(3.4, 6.4, c.steelD, i * (L / 5), 4, z, 8));
      g.add(roll(4.2, 6.4, c.steel, L / 2 - 1, 4.4, z, 10), roll(4.2, 6.4, c.steel, -L / 2 + 1, 4.4, z, 10));
    }
  };
  switch (kind) {
    case 'rifle': case 'rocket': case 'sniper': case 'engineer': case 'flamer': case 'commando': {
      const body = kind === 'sniper' || kind === 'commando' ? c.dark : c.main;
      const legs: THREE.Group[] = [];
      for (const z of [-1.8, 1.8]) { const lg = new THREE.Group(); lg.position.set(0, 6, z); lg.add(cyl(1.6, 1.8, 6, c.black, 0, -6, 0, 6), box(4, 1.6, 3, c.black, 1, -6, 0)); g.add(lg); legs.push(lg); }
      g.userData.legs = legs;
      g.add(box(5.5, 7.5, 8, body, 0, 6, 0), box(1.2, 7.6, 8.2, c.black, 0, 6, 0).translateX(1.5), sph(3.2, c.skin, 0.5, 16.2, 0), sph(3.5, c.dark, 0.3, 16.8, 0, 1, 0.8, 1, true));
      g.add(box(1.4, 1.6, 4.4, c.glass, 3.1, 15.6, 0), box(3, 6, 5.5, c.dark, -3.6, 6.5, 0));
      for (const z of [-4.6, 4.6]) g.add(cyl(1.3, 1.3, 6, body, 0, 7, z, 6));
      if (kind === 'rifle') g.add(box(13, 2, 2, c.black, 6, 11, 2), box(4, 2.6, 1.8, c.steelD, 3, 9, 2));
      if (kind === 'rocket') { const t = cyl(2.4, 2.4, 17, c.steel, -1, 0, 0, 8).rotateZ(Math.PI / 2); t.position.set(2, 14, -3); g.add(t, sph(2.6, c.accent, 11, 14, -3), cyl(3, 3, 1.5, c.black, -6.5, 12.2, -3, 8).rotateZ(Math.PI / 2)); }
      if (kind === 'flamer') { for (const z of [-1.9, 1.9]) g.add(cyl(1.9, 1.9, 9, c.steelD, -4.8, 4, z, 8), sph(1.9, c.steelD, -4.8, 13, z)); g.add(box(12, 1.8, 1.8, c.black, 6, 10, 2), cyl(1.2, 1.4, 2, c.red, 12.5, 10, 2, 6).rotateZ(Math.PI / 2), box(1.4, 6, 1.4, c.black, -2, 6, 2.5)); }
      if (kind === 'commando') g.add(box(15, 2, 2, c.black, 7, 11, 2), box(5, 3, 2, c.steelD, 3, 9.6, 2), box(3, 1.6, 1.6, c.steel, 13, 12.4, 2), sph(3.6, c.black, 0.3, 17.2, 0, 1, 0.55, 1, true), box(1.2, 8, 9, c.black, 0.2, 7, 0).rotateY(0.6), box(1, 1, 7, c.red, 3.5, 17.6, 0));
      if (kind === 'engineer') g.add(sph(3.9, c.hazard, 0.3, 17, 0, 1, 0.7, 1, true), box(7, 1.4, 1.6, c.hazard, 3, 15.8, 0), box(5, 4, 7, c.hazard, 5, 3, 0), box(1.5, 1.6, 8, c.black, 5, 7, 0));
      if (kind === 'sniper') g.add(box(22, 1.6, 1.6, c.black, 10, 11, 2), box(5, 2.4, 2.4, c.steelD, 6, 12.8, 2), sph(1.5, c.accent, 14, 12.6, 2), box(1, 8, 9, c.dark, -3.4, 4, 0));
      g.userData.h = 20; break;
    }
    case 'apc': {
      tracks(38, 24); g.add(box(36, 9, 22, c.main, 0, 5, 0), box(26, 6, 20, c.light, -3, 14, 0), box(8, 5, 18, c.glass, 12, 14, 0), box(30, 1.4, 22, c.dark, -3, 20, 0), box(8, 1.2, 8, c.hazard, -6, 21, 0));
      for (const z of [-1, 1]) g.add(box(26, 1.2, 1.4, c.accent, -3, 12, z * 11.2));
      g.add(sph(1.6, c.lit, 18, 9, -8), sph(1.6, c.lit, 18, 9, 8), decal(f, 6, -6, 21.5, 0, 0, -Math.PI / 2));
      g.userData.h = 24; break;
    }
    case 'cryo': {
      tracks(40, 28); g.add(box(38, 10, 25, c.main, 0, 5, 0), box(34, 2, 21, c.dark, -1, 15, 0), box(8, 3, 29, c.glass, 16, 6, 0));
      const t = new THREE.Group(); t.position.y = 17;
      t.add(box(20, 9, 17, c.light, -2, 0, 0), sph(5.5, c.glass, -3, 12, 0), sph(2, c.accent, -3, 18, 0), box(6, 2, 18, c.dark, -10, 3, 0));
      t.add(decal(f, 7, 2, 9.1, 0, 0, -Math.PI / 2));
      const bar = new THREE.Group(); bar.position.set(8, 5, 0);
      for (const z of [-3, 3]) bar.add(barrel(1.6, 2.2, 18, c.steel).translateZ(z));
      bar.add(sph(3, c.crystal, 18, 0, 0));
      t.add(bar); g.add(t); g.userData.barrel = bar; g.userData.h = 30; break;
    }
    case 'raider': {
      g.add(box(30, 5, 16, c.main, 0, 4, 0), box(9, 5, 13, c.dark, -6, 9, 0), box(9, 5, 11, c.glass, 7, 9, 0), box(10, 1, 16.6, c.accent, 9, 6, 0));
      for (const [x, z] of [[-9, -10], [9, -10], [-9, 10], [9, 10]]) { g.add(roll(5.2, 4.6, c.black, x, 5.2, z, 12), roll(2.6, 5, c.steel, x, 5.2, z, 8)); }
      const t = new THREE.Group(); t.position.set(-4, 14, 0);
      for (const z of [-3, 3]) t.add(box(14, 3, 3.6, c.steelD, 2, 2, z), cyl(1.6, 1.6, 2, c.red, 10, 2.4, z, 6).rotateZ(Math.PI / 2));
      g.add(t); g.userData.h = 22; break;
    }
    case 'buggy': {
      g.add(box(26, 5, 15, c.main, 0, 4, 0), box(10, 4, 12, c.dark, -5, 9, 0), box(8, 5, 11, c.glass, 6, 9, 0), box(8, 1, 15.6, c.hazard, 8, 6, 0));
      for (const [x, z] of [[-8, -9], [8, -9], [-8, 9], [8, 9]]) { g.add(roll(4.6, 4, c.black, x, 4.6, z, 12), roll(2.2, 4.4, c.steel, x, 4.6, z, 8)); }
      for (const z of [-6, 6]) g.add(cyl(0.9, 0.9, 11, c.steel, -6, 9, z, 5));
      g.add(box(2, 1.6, 13, c.steel, -6, 20, 0), box(11, 3, 3, c.black, -8, 14, 0), roll(3.6, 3, c.black, -15, 8, 0, 10));
      for (const z of [-5, 5]) g.add(sph(1.8, c.lit, 13, 6, z));
      g.userData.h = 20; break;
    }
    case 'tank': {
      tracks(36, 24); g.add(box(34, 9, 22, c.main, 0, 5, 0), box(30, 2, 18, c.dark, -1, 14, 0), box(32, 5, 2, c.dark, 0, 5, 12.5), box(32, 5, 2, c.dark, 0, 5, -12.5));
      g.add(box(6, 2, 14, c.steelD, -16, 12, 0), sph(1.4, c.lit, 17, 11, -7), sph(1.4, c.lit, 17, 11, 7));
      const t = new THREE.Group(); t.position.y = 16;
      t.add(box(17, 8, 15, c.light, -1, 0, 0), box(10, 1.6, 12, c.dark, -1, 8, 0), sph(3, c.accent, -3, 9.5, 0), roll(2.4, 2, c.steelD, -4, 9, 4.4, 8), cyl(0.5, 0.5, 18, c.black, -9, 8, -5, 4));
      t.add(decal(f, 7, -1, 8.9, 0, 0, -Math.PI / 2));
      const bar = new THREE.Group(); bar.position.set(7, 4.5, 0);
      bar.add(barrel(2, 2.5, 22, c.steelD), cyl(3, 3, 4, c.black, 20, -2, 0, 8).rotateZ(Math.PI / 2)); (bar.children[1] as THREE.Object3D).position.set(21, 0, 0);
      t.add(bar);
      g.add(t); g.userData.barrel = bar; g.userData.h = 28; break;
    }
    case 'artillery': {
      tracks(42, 26); g.add(box(40, 9, 24, c.main, 0, 5, 0), box(16, 5, 24, c.dark, -12, 14, 0), box(8, 1.4, 26, c.hazard, 14, 5, 0));
      for (const z of [-1, 1]) g.add(box(8, 3, 3, c.steelD, -22, 4, z * 11), cyl(1.6, 1.6, 7, c.steelD, -24, 2, z * 11, 6));
      const t = new THREE.Group(); t.position.set(-2, 14, 0);
      t.add(box(20, 9, 17, c.light, 0, 0, 0), box(10, 1.6, 12, c.dark, -2, 9, 0), sph(2.2, c.red, -6, 11.5, 5));
      const bar = new THREE.Group(); bar.position.set(8, 11, 0); bar.rotation.z = 0.3;
      bar.add(barrel(2.8, 3.4, 36, c.steelD), cyl(4, 4, 3, c.black, 34, -2, 0, 10).rotateZ(Math.PI / 2), cyl(4.4, 4.4, 8, c.steel, 6, -2, 0, 10).rotateZ(Math.PI / 2));
      (bar.children[1] as THREE.Object3D).position.set(35, 0, 0); (bar.children[2] as THREE.Object3D).position.set(10, 0, 0);
      t.add(bar);
      g.add(t); g.userData.barrel = bar; g.userData.h = 32; break;
    }
    case 'prism': {
      tracks(40, 28); g.add(box(38, 10, 24, c.light, 0, 5, 0), box(32, 3, 20, c.dark, 0, 15, 0), box(30, 1, 26, c.accent, 0, 9, 0));
      const t = new THREE.Group(); t.position.y = 18;
      t.add(sph(10, c.main, 0, 0, 0, 1.2, 0.8, 1, true));
      const em = cyl(2, 3.2, 16, c.glass, 0, 0, 0, 8).rotateZ(Math.PI / 2); em.position.set(15, 5, 0);
      const bar = new THREE.Group(); bar.position.set(0, 0, 0); bar.add(em, sph(3.6, c.crystal, 24, 5, 0), roll(4.4, 2, c.steelD, 9, 5, 0, 10).rotateZ(0)); t.add(bar);
      const sp = new THREE.Group(); sp.position.set(-4, 14, 0); const cr = new THREE.Mesh(new THREE.OctahedronGeometry(6), c.crystal); cr.scale.y = 1.6; sp.add(cr); t.add(sp);
      g.userData.spinObj = sp; g.add(t); g.userData.h = 34; break;
    }
    case 'harvester': {
      tracks(40, 28); g.add(box(38, 11, 26, c.main, 0, 5, 0), box(13, 11, 22, c.dark, 12, 16, 0), box(6, 6, 18, c.glass, 17, 20, 0), box(9, 1.2, 24, c.hazard, 12, 27, 0));
      g.add(box(26, 1, 24, c.steelD, -8, 15.6, 0), box(1, 7, 24, c.steelD, -21, 16, 0), box(1, 7, 24, c.steelD, 5, 16, 0));
      const dr = new THREE.Group(); dr.position.set(-8, 24, 0);
      dr.add(roll(8, 22, c.steel, 0, 0, 0, 14));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 6.2832;
        for (const z of [-7, 7]) { const b = box(3, 11, 1.4, c.steelD, 0, -5.5, z); const pv = new THREE.Group(); pv.rotation.z = a; b.position.y += 0; pv.add(b); b.position.set(0, 9.5, z); pv.children[0].rotation.set(0, 0, 0); dr.add(pv); }
      }
      g.add(dr); g.userData.spinObj = dr; g.userData.spinAxis = 'z';
      for (let i = 0; i < 5; i++) g.add(cone(3, 8 + (i % 3) * 2, c.crystal, -14 + i * 4, 28, -6 + (i % 3) * 6, 5));
      g.add(box(7, 4, 28, c.steelD, 22, 2, 0), sph(2, c.lit, 20, 26, -9), sph(2, c.lit, 20, 26, 9));
      g.userData.h = 36; break;
    }
    case 'flak': {
      tracks(34, 22); g.add(box(32, 9, 20, c.main, 0, 5, 0), box(28, 2, 17, c.dark, -1, 14, 0), sph(1.4, c.lit, 16, 10, -7), sph(1.4, c.lit, 16, 10, 7));
      const t = new THREE.Group(); t.position.y = 16;
      t.add(box(14, 8, 14, c.light, -1, 0, 0), cyl(4, 4, 1, c.steel, -8, 10, 0, 10), box(1, 6, 8, c.steelD, -8, 10, 0), decal(f, 6, -1, 8.1, 0, 0, -Math.PI / 2));
      const bar = new THREE.Group(); bar.position.set(5, 5, 0); bar.rotation.z = 0.55;
      for (const z of [-4, 4]) bar.add(barrel(1, 1.4, 20, c.black).translateZ(z), box(6, 3, 2.4, c.steelD, 2, 0, z));
      t.add(bar); g.add(t); g.userData.head = undefined; g.userData.barrel = bar; g.userData.h = 30; break;
    }
    case 'mlrs': {
      for (const x of [-12, 0, 12]) for (const z of [-10, 10]) g.add(roll(4.6, 4, c.black, x, 4.6, z, 12), roll(2, 4.4, c.steel, x, 4.6, z, 8));
      g.add(box(40, 4, 18, c.dark, 0, 5, 0), box(11, 11, 18, c.main, 14, 8, 0), box(2, 5, 15, c.glass, 19.8, 12, 0), sph(1.4, c.lit, 20, 9, -6), sph(1.4, c.lit, 20, 9, 6));
      const pod = new THREE.Group(); pod.position.set(-6, 14, 0); pod.rotation.z = 0.35;
      pod.add(box(22, 9, 16, c.main, 0, 0, 0), box(0.6, 9.4, 16.4, c.black, 11, 0, 0));
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) pod.add(cyl(1.3, 1.3, 1, c.black, 11.4, 1.5 + i * 2.8, -5.4 + j * 3.6, 6).rotateZ(Math.PI / 2));
      g.add(pod); g.userData.barrel = pod; g.userData.h = 26; break;
    }
    case 'jet': {
      g.add(cyl(3, 4.2, 34, c.main, 0, -17, 0, 10).rotateZ(-Math.PI / 2), cone(3, 9, c.dark, 0, 0, 0, 10).rotateZ(-Math.PI / 2));
      (g.children[g.children.length - 1] as THREE.Object3D).position.set(21, 0, 0);
      g.add(sph(3, c.glass, 8, 3, 0, 2.2, 0.9, 0.9));
      for (const z of [-1, 1]) { g.add(box(14, 1, 18, c.main, -2, -0.5, z * 11).rotateY(z * 0.35), box(7, 0.8, 6, c.dark, -15, 0, z * 5).rotateY(z * 0.3), box(6, 8, 0.8, c.dark, -15, 1, z * 3.2).rotateX(z * 0.25)); g.add(box(8, 1.6, 1.6, c.steel, 0, -2, z * 13), cone(0.9, 2, c.red, 4.6, -2.8, z * 13, 6).rotateZ(-Math.PI / 2)); }
      g.add(sph(2.6, c.lit, -17.5, 0, 0, 0.5, 1, 1), decal(f, 6, -4, 0.8, 12, 0, -Math.PI / 2));
      g.userData.h = 14; break;
    }
    case 'bomber': {
      g.add(cyl(5, 6, 50, c.main, 0, -25, 0, 12).rotateZ(-Math.PI / 2), sph(5, c.dark, 25, 0, 0, 1.6, 1, 1), sph(3.4, c.glass, 27, 2.4, 0, 1.6, 0.8, 1));
      for (const z of [-1, 1]) {
        g.add(box(16, 1.4, 34, c.main, 0, 0, z * 20), box(9, 1, 9, c.dark, -22, 1, z * 7), box(8, 10, 1, c.dark, -22, 1, z * 0.2));
        for (const zz of [12, 24]) g.add(cyl(2.6, 2.6, 11, c.steelD, 2, -7.3, z * zz, 10).rotateZ(-Math.PI / 2), sph(1.8, c.lit, -4, -1.8, z * zz));
      }
      g.add(decal(f, 10, -2, 1.5, 22, 0, -Math.PI / 2), decal(f, 10, -2, 1.5, -22, 0, -Math.PI / 2));
      g.userData.h = 18; break;
    }
    case 'heli': {
      g.add(sph(10, c.main, 0, 0, 0, 1.7, 0.85, 1), box(24, 3, 3, c.dark, -20, -1.5, 0), box(2, 9, 8, c.main, -31, -1, 0), sph(1.2, c.red, -32, 8, 0), box(10, 1, 21, c.dark, -2, 7, 0).translateY(-3));
      g.add(sph(6, c.glass, 6, 1.5, 0, 1.2, 0.9, 0.95), cyl(1.1, 1.1, 5, c.black, 0, 7, 0, 6), decal(f, 7, -4, 0.5, 8.6));
      for (const z of [-7, 7]) { g.add(box(24, 1.2, 1.2, c.steelD, 0, -9, z), box(1.2, 8, 1.2, c.steelD, -6, -9, z), box(1.2, 8, 1.2, c.steelD, 6, -9, z)); }
      for (const z of [-6, 6]) g.add(box(12, 2.4, 2.4, c.steel, 8, -3, z), cyl(1.1, 1.1, 5, c.accent, 14.5, -3.2, z, 6).rotateZ(Math.PI / 2));
      const tr = new THREE.Group(); tr.position.set(-31, 3, 5); tr.add(box(0.6, 9, 1.6, c.black, 0, -4.5, 0), box(0.6, 1.6, 9, c.black, 0, -0.8, 0)); g.add(tr);
      const rotor = new THREE.Group(); rotor.position.y = 10;
      rotor.add(box(52, 0.6, 3.4, c.black, 0, 0, 0), box(3.4, 0.6, 52, c.black, 0, 0, 0), cyl(2.4, 2.4, 2, c.steel, 0, -1, 0, 8));
      g.add(rotor); g.userData.spin = rotor; g.userData.spinSpeed = 28;
      g.userData.h = 22; break;
    }
    default: break;
  }
  return g;
}

// ---------- otimização: funde malhas por material e desenha contornos ----------
const edgeMats = new Map<THREE.Material, THREE.LineBasicMaterial>();
function edgeMat(m: THREE.MeshStandardMaterial): THREE.LineBasicMaterial {
  let e = edgeMats.get(m);
  if (!e) { e = new THREE.LineBasicMaterial({ color: m.color.clone().multiplyScalar(0.28), transparent: true, opacity: 0.8 }); edgeMats.set(m, e); }
  return e;
}
function optimize(root: THREE.Object3D) {
  const groups: THREE.Object3D[] = [];
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) return; groups.push(o); });
  for (const grp of groups) {
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const rm: THREE.Object3D[] = [];
    for (const ch of grp.children) {
      const m = ch as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) continue;
      m.updateMatrix();
      let geo = m.geometry.clone();
      if (geo.index) geo = geo.toNonIndexed();
      geo.applyMatrix4(m.matrix);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
      let list = byMat.get(m.material); if (!list) { list = []; byMat.set(m.material, list); }
      list.push(geo); rm.push(ch);
    }
    for (const ch of rm) { grp.remove(ch); (ch as THREE.Mesh).geometry.dispose(); }
    for (const [mt, list] of byMat) {
      const merged = mergeGeometries(list, false);
      for (const l of list) l.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mt); grp.add(mesh);
      const sm = mt as THREE.MeshStandardMaterial;
      if (sm.isMeshStandardMaterial && !sm.transparent && sm.emissiveIntensity < 0.3) {
        const ln = new THREE.LineSegments(new THREE.EdgesGeometry(merged, 32), edgeMat(sm));
        ln.raycast = () => { /* contornos não participam da seleção */ };
        grp.add(ln);
      }
    }
  }
}

let aoTex: THREE.CanvasTexture | null = null;
let aoMat: THREE.MeshBasicMaterial | null = null;
/** sombra de contato suave sob a peça (oclusão ambiente barata, sem custo por quadro) */
function aoBlob(w: number, d: number, strength: number): THREE.Mesh {
  if (!aoTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 4, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    aoTex = new THREE.CanvasTexture(c);
    aoMat = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), aoMat!.clone());
  (m.material as THREE.MeshBasicMaterial).opacity = strength;
  m.rotation.x = -Math.PI / 2; m.position.y = 0.35; m.renderOrder = 1;
  return m;
}

export function buildModel(kind: Kind, f: Faction, ao = false): THREE.Group {
  const glb = DEFS[kind].building ? null : glbModel(kind, f);
  const g = glb ?? (DEFS[kind].building ? buildStructure(kind, f) : buildUnit(kind, f));
  if (!glb) optimize(g);
  if (ao && DEFS[kind].armor !== 'air') {
    const bb = new THREE.Box3().setFromObject(g), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const b = aoBlob(sz.x * 1.55 + 6, sz.z * 1.55 + 6, DEFS[kind].building ? 0.62 : 0.5);
    b.position.x = c.x; b.position.z = c.z; g.add(b);
  }
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { const mt = m.material as THREE.Material; o.castShadow = !mt.transparent; o.receiveShadow = true; }
  });
  g.userData.kind = kind;
  return g;
}

export function dispose(g: THREE.Object3D) {
  g.traverse(o => { const m = o as THREE.Mesh; if (m.geometry && !m.userData.shared) m.geometry.dispose(); });
}

// ---------- Ícones 3D para a barra lateral ----------
let iconR: THREE.WebGLRenderer | null = null;
let iconScene: THREE.Scene | null = null;
let iconCam: THREE.PerspectiveCamera | null = null;
const iconCache = new Map<string, HTMLCanvasElement>();
export function modelIcon(kind: Kind, f: Faction, w: number, h: number, opts: { bg?: boolean; rot?: number } = {}): HTMLCanvasElement | null {
  const bgOn = opts.bg ?? true;
  const key = `${kind}|${f}|${w}|${h}|${bgOn ? 1 : 0}|${opts.rot ?? ''}|${glbLoaded(kind) && glbOn && Storage.data.detailModels !== false ? 'g' : 'p'}`;
  const hit = iconCache.get(key);
  if (hit) { const c = document.createElement('canvas'); c.width = hit.width; c.height = hit.height; c.getContext('2d')!.drawImage(hit, 0, 0); return c; }
  try {
    const R = 2;
    if (!iconR) {
      iconR = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      iconR.outputColorSpace = THREE.SRGBColorSpace; iconR.toneMapping = THREE.ACESFilmicToneMapping; iconR.toneMappingExposure = 1.05;
      iconScene = new THREE.Scene();
      iconScene.add(new THREE.HemisphereLight(0xcfe6ff, 0x2a3320, 1.1));
      const dl = new THREE.DirectionalLight(0xfff0d8, 2.6); dl.position.set(-60, 120, 80); iconScene.add(dl);
      iconCam = new THREE.PerspectiveCamera(30, 1, 1, 2000);
    }
    iconR.setSize(w * R, h * R, false);
    iconCam!.aspect = w / h; iconCam!.updateProjectionMatrix();
    const m = buildModel(kind, f);
    m.rotation.y = opts.rot ?? (DEFS[kind].building ? 0 : 0.4); m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m), size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
    const rad = Math.max(size.x, size.z * 1.1, size.y * 1.4);
    const dist = rad * 2.6;
    iconCam!.position.set(ctr.x - dist * 0.55, ctr.y + dist * 0.62, ctr.z + dist * 0.75);
    iconCam!.lookAt(ctr.x, ctr.y - size.y * 0.1, ctr.z);
    iconScene!.add(m);
    iconR.render(iconScene!, iconCam!);
    iconScene!.remove(m); dispose(m);
    const out = document.createElement('canvas'); out.width = w * R; out.height = h * R;
    const x = out.getContext('2d')!;
    if (bgOn) {
      const g = x.createRadialGradient(out.width / 2, out.height / 2, 4, out.width / 2, out.height / 2, out.width * 0.7);
      g.addColorStop(0, '#3c3d37'); g.addColorStop(1, '#10110e');
      x.fillStyle = g; x.fillRect(0, 0, out.width, out.height);
    }
    x.drawImage(iconR.domElement, 0, 0);
    iconCache.set(key, out);
    const c2 = document.createElement('canvas'); c2.width = out.width; c2.height = out.height; c2.getContext('2d')!.drawImage(out, 0, 0);
    return c2;
  } catch { return null; }
}
