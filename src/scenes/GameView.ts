import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  MAPS, DEFS, Kind, MatchOpts, TEAM_COLORS, TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, COMBAT, FACTIONS, DIFFS, MAX_TECH, VET_NAMES, Team, Role,
} from '../config';
import { World, Cmd, Fx, TeamMsg, TeamSound } from '../systems/World';
import { Entity } from '../entities/Entity';
import { Input3D } from './Input3D';
import { Sidebar } from '../ui/Sidebar';
import { Hud } from '../ui/Hud';
import { tooltip } from '../ui/Tooltip';
import { drawTerrain, drawTerrainBump, roadPoints } from '../ui/sprites';
import { buildModel, dispose, mat, setGlbEnabled } from '../ui/models';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sfx, type Spatial } from '../audio/Sfx';
import { Storage } from '../systems/Storage';
import { music } from '../audio/Music';
import { voice } from '../audio/Voice';
import { Achievements } from '../systems/Achievements';
import { haptic } from '../native';
import { DEMO } from '../demo';
import { Purchases } from '../systems/Purchases';
import { SP_RADIUS } from '../systems/World';
import { MissionRunner, nextMission } from '../campaign/missions';
import type { NetMsg } from '../systems/Net';

interface Rec { tsx?: number; tsz?: number; e?: Entity; fx?: number; fz?: number; hd?: number; bank?: number; ph?: number; tm: number; fc: string; g: THREE.Group; t0: number; lx: number; ly: number; dust: number; h: number; head?: THREE.Object3D; spin?: THREE.Object3D; spinSpeed: number; spinObj?: THREE.Object3D; axis: 'x' | 'y' | 'z'; legs?: THREE.Object3D[]; barrel?: THREE.Object3D; barrelX: number; kick: number; phase: number; moving: number }
interface Part { g: number; s: THREE.Sprite; life: number; max: number; vx: number; vy: number; vz: number; s0: number; s1: number; a0: number; add: boolean; spin: number; active: boolean }

const PITCH = 0.92; // ~53°
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function glowTex(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.45)'): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(0.4, mid); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function smokeTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 9; i++) {
    const px = 32 + rnd(-10, 10), py = 32 + rnd(-10, 10), r = rnd(12, 22), g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function starTex(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 40;
  const x = c.getContext('2d')!;
  x.font = 'bold 30px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 5; x.strokeStyle = '#2a1a00'; x.fillStyle = '#ffd54a';
  const s = '★'.repeat(n); x.strokeText(s, 64, 21); x.fillText(s, 64, 21);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class GameView {
  world!: World;
  me: Team = 0;
  role: Role = 'solo';
  placing: Kind | null = null;
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  selection: Entity[] = [];
  camDist = 760;

  private renderer!: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private scene = new THREE.Scene();
  private cam!: THREE.PerspectiveCamera;
  private sun!: THREE.DirectionalLight;
  private ov!: HTMLCanvasElement;
  private octx!: CanvasRenderingContext2D;
  private input!: Input3D;
  private hintDesel = false;
  private partMax = 420;
  private ctxLost = false;
  private perf = { t: 0, n: 0, sum: 0, step: 0 };
  /** Qualidade automática: no modo "Automático", mede o FPS real do aparelho e alivia a carga em etapas
   *  (bloom → sombras → resolução → partículas) até a partida ficar fluida. Nunca volta a pesar sozinho. */
  private autoQuality(frame: number) {
    if (Storage.data.quality !== 'auto' || this.paused || frame <= 0 || frame > 1) return;
    const P = this.perf; P.t += frame; P.n++; P.sum += frame;
    if (this.clock < 6 || P.t < 4) return;
    const fps = P.n / P.sum; P.t = 0; P.n = 0; P.sum = 0;
    if (fps >= 40 || P.step >= 4) return;
    P.step++;
    if (P.step === 1 && this.composer) { this.composer = null; this.bloom = null; this.renderer.domElement.style.filter = 'saturate(.84) contrast(1.24) brightness(1.04)'; this.renderer.toneMappingExposure = 1.06; }
    else if (P.step <= 2) { this.sun.castShadow = false; P.step = 2; }
    else if (P.step === 3) { this.dpr = Math.max(1, this.dpr * 0.75); this.renderer.setPixelRatio(this.dpr); this.resize(); }
    else { this.partMax = 160; if (this.dust) this.dust.visible = false; }
    this.hud.toast('Gráficos ajustados automaticamente para manter a fluidez', 2200);
  }
  private spPrev = 0;
  wallMode = false;
  private wallPts: [number, number][] = [];
  private wallBar!: HTMLButtonElement;
  private deselBtn!: HTMLButtonElement;
  private deselN = -1;
  private sidebar!: Sidebar;
  private hud!: Hud;
  private ro?: ResizeObserver;
  private vg?: HTMLElement;
  private raf = 0;
  private lastT = 0;
  private q: 'low' | 'med' | 'high' = 'high';
  private W = 1; private H = 1; private dpr = 1;
  private target = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ents = new Map<number, Rec>();
  private fogTex!: THREE.CanvasTexture;
  private fogCtx!: CanvasRenderingContext2D;
  private crystalInst!: THREE.InstancedMesh;
  private crystalPool!: THREE.InstancedMesh;
  private crystalLights: THREE.PointLight[] = [];
  private crystalGlow!: THREE.Points;
  private crystalRev = -1;
  private exploredN = -1;
  private ghost: THREE.Group | null = null;
  private ghostKind: Kind | null = null;
  private ghostT = { x: 0, y: 0 };
  private marks: { x: number; y: number; t: number }[] = [];
  private amove = false;
  private tgt: 'rally' | 'sp' | 'patrol' | null = null;
  private hoverG: { x: number; y: number } | null = null;
  private lastTap = { t: 0, id: -1 };
  private inspect: Entity | null = null;
  private groups: Entity[][] = [];
  private lastGroupKey = { k: '', t: 0 };
  private runner: MissionRunner | null = null;
  private mEl: HTMLElement | null = null;
  private mT = 0;
  private startTarget = new THREE.Vector3();
  private clock = 0;
  private uiT = 0;
  private fogT = 0;
  private shake = 0;
  private flashA = 0;
  private flashEl!: HTMLElement;
  private dangerA = 0;
  private dangerEl!: HTMLElement;
  private bannerHost!: HTMLElement;
  private texChip!: THREE.CanvasTexture;
  private lights: { l: THREE.PointLight; t: number }[] = [];
  private combat = 0;
  private lastKills = -1; private streak = 0; private streakT = 0;
  private lastEnemyB = -1;
  private myHp = 0; private atkBannerT = 0; private hpT = 0;
  private lastDone = 0;
  private smokeT = 0;
  private wrecks: { x: number; z: number }[] = [];
  private dust: THREE.Points | null = null;
  private paused = false;
  private over = false;
  private centered = false;
  private cleaned = false;
  private left = false;
  // partículas / projéteis
  private parts: Part[] = [];
  private texGlow = glowTex();
  private texSmoke = smokeTex();
  private texRing!: THREE.CanvasTexture;
  private starCache = new Map<number, THREE.CanvasTexture>();
  private projPool = new Map<string, THREE.Mesh[]>();
  private decals: { m: THREE.Mesh; t: number }[] = [];
  // rede
  private snapT = 0;
  private crystalSendT = 0;
  private lastCrystalRev = -1;
  private outFx: Fx[] = [];
  private outMsg: TeamMsg[] = [];
  private outSnd: TeamSound[] = [];

  constructor(private opts: MatchOpts, private host: HTMLElement) {
    (window as unknown as { __ffr: GameView }).__ffr = this;
    this.role = opts.role;
    this.me = opts.myTeam ?? (this.role === 'guest' ? 1 : 0);
    const o = opts;
    const ms = o.mission;
    this.world = ms
      ? new World({ mapId: ms.mapId, difficulty: ms.difficulty, faction: ms.faction, enemyFaction: ms.enemy, vsAI: ms.ai, bare: ms.bare, customWin: ms.custom, startCredits: ms.credits, enemyCredits: ms.enemyCredits })
      : this.role === 'guest'
      ? new World({ mapId: o.mapId, difficulty: o.difficulty, faction: o.enemyFaction ?? 'ferro', enemyFaction: o.faction, vsAI: false, mirror: true, viewTeam: this.me, slots: o.slots, mapSize: o.mapSize })
      : new World({ mapId: o.mapId, difficulty: o.difficulty, faction: o.faction, enemyFaction: o.enemyFaction, vsAI: this.role === 'solo' || (this.role === 'host' && !!o.slots), startCredits: o.credits, enemyCredits: o.credits, noSuper: o.noSuper, noFog: o.noFog, slots: o.slots, mapSize: o.mapSize });
    if (ms) { ms.setup(this.world); this.world.updatePower(); this.world.updateFog(); this.runner = new MissionRunner(ms, this.world); }
    const q = Storage.data.quality, coarse0 = matchMedia('(pointer: coarse)').matches;
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4; // GB aproximados; aparelhos fracos começam no modo leve
    this.q = q === 'auto' ? (coarse0 ? (mem <= 3 ? 'low' : 'med') : 'high') : q;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.q === 'high' ? 2 : this.q === 'med' ? 1.5 : 1);
    // Celular: limita os pixels desenhados (~1,3 milhão) para não estourar a memória de vídeo
    if (coarse0) this.dpr = Math.max(0.75, Math.min(this.dpr, Math.sqrt(1.3e6 / Math.max(1, innerWidth * innerHeight))));
    music.play('battle'); sfx.ambience(true, (MAPS.find(m => m.id === this.opts.mapId)?.biome ?? 'grass') === 'desert');
    this.initRenderer();
    this.initScene();
    const w = this.world, me = this.me;
    const base = w.entities.find(e => e.team === me && e.kind === 'conyard');
    if (base) { { const cn = w.corner(me); this.target.set(base.x + (cn.fx ? -90 : 90), 0, base.y + (cn.fy ? 50 : -50)); } this.centered = true; }
    else this.target.set(WORLD_W / 2, 0, WORLD_H / 2);
    this.startTarget.copy(this.target);
    setGlbEnabled(this.q !== 'low');
    Achievements.onUnlock(t => { this.banner(t, 'gold'); sfx.objective(); });
    this.input = new Input3D(this, this.host);
    this.deselBtn = document.createElement('button'); this.deselBtn.className = 'desel hidden';
    this.deselBtn.addEventListener('click', ev => { ev.stopPropagation(); this.clearSelection(); });
    this.host.append(this.deselBtn);
    this.wallBar = document.createElement('button'); this.wallBar.className = 'wallbar hidden';
    this.wallBar.innerHTML = '🧱 Modo muro: arraste o dedo para desenhar · <b>✖ Sair</b>';
    this.wallBar.addEventListener('click', ev => { ev.stopPropagation(); this.endWallMode(); });
    this.host.append(this.wallBar);
    this.initUi();
    this.setupNet();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.host);
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(t => this.frame(t));
    if (import.meta.env.DEV) (window as unknown as { __gv: GameView }).__gv = this; // depuração local
  }

  // ---------- inicialização ----------
  private initRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: this.q !== 'low', powerPreference: this.q === 'low' ? 'low-power' : 'high-performance' });
    r.setPixelRatio(this.dpr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.06;
    r.shadowMap.enabled = this.q !== 'low'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    this.host.append(r.domElement);
    // Se o celular perder o gráfico 3D (pouca memória de vídeo), tenta se recuperar no modo leve em vez de ficar tela branca
    r.domElement.addEventListener('webglcontextlost', ev => { ev.preventDefault(); this.ctxLost = true; });
    r.domElement.addEventListener('webglcontextrestored', () => {
      this.ctxLost = false; this.sun.castShadow = false; r.shadowMap.enabled = false; r.shadowMap.needsUpdate = true;
      this.composer = null; this.bloom = null; r.domElement.style.filter = ''; this.dpr = Math.min(this.dpr, 1); r.setPixelRatio(this.dpr); this.resize();
      this.hud.toast('Gráficos reduzidos para economizar memória', 2600);
    });
    if (this.q !== 'low') r.domElement.style.filter = 'saturate(.84) contrast(1.24) brightness(1.04)';
    this.renderer = r;
    this.cam = new THREE.PerspectiveCamera(38, 1, 20, 6000);
    this.ov = document.createElement('canvas');
    this.ov.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    this.host.append(this.ov);
    this.octx = this.ov.getContext('2d')!;
    const vg = document.createElement('div');
    vg.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 46%,rgba(0,0,0,0) 55%,rgba(8,6,2,.42) 100%)';
    this.host.append(vg); this.vg = vg;
    const mk = (css: string) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;' + css; this.host.append(d); return d; };
    this.flashEl = mk('background:radial-gradient(ellipse at 50% 50%,rgba(255,236,190,.9),rgba(255,140,40,.35) 60%,rgba(255,120,30,0) 100%);mix-blend-mode:screen');
    this.dangerEl = mk('background:radial-gradient(ellipse at 50% 50%,rgba(255,0,0,0) 45%,rgba(220,20,20,.55) 100%)');
    this.bannerHost = document.createElement('div'); this.bannerHost.className = 'banners'; this.host.append(this.bannerHost);
    const cc = document.createElement('canvas'); cc.width = cc.height = 16; const cx = cc.getContext('2d')!;
    cx.fillStyle = '#3a3128'; cx.fillRect(0, 0, 16, 16); cx.fillStyle = '#7a5a36'; cx.fillRect(2, 2, 8, 8); cx.fillStyle = '#c9822c'; cx.fillRect(10, 10, 4, 4);
    this.texChip = new THREE.CanvasTexture(cc); this.texChip.colorSpace = THREE.SRGBColorSpace; this.texChip.magFilter = THREE.NearestFilter;
    if (this.q !== 'low') for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xff9a3c, 0, 320, 1.6); l.position.set(0, 30, 0); this.scene.add(l); this.lights.push({ l, t: 0 }); }
    if (this.q !== 'low' && !matchMedia('(pointer: coarse)').matches) {
      try {
        const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: this.q === 'high' ? 4 : 0 });
        const cp = new EffectComposer(r, rt);
        cp.addPass(new RenderPass(this.scene, this.cam));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(this.q === 'high' ? 512 : 256, this.q === 'high' ? 512 : 256), this.q === 'high' ? 0.55 : 0.42, 0.7, 0.8);
        cp.addPass(this.bloom); cp.addPass(new OutputPass());
        cp.addPass(new ShaderPass({
          uniforms: { tDiffuse: { value: null } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
            void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
              vec3 g = mix(vec3(l), c.rgb, 0.62);                       // dessatura 38%
              g = mix(g * vec3(0.9, 0.98, 1.06), g * vec3(1.08, 1.0, 0.88), smoothstep(0.15, 0.85, l)); // sombras frias, luzes quentes
              g = pow(max(g, 0.0), vec3(1.1));                              // meios-tons mais escuros
              g = (g - 0.5) * 1.16 + 0.5;                                // contraste
              float v = smoothstep(0.88, 0.32, length(vUv - 0.5));        // vinheta
              float n = fract(sin(dot(floor(vUv * vec2(960.0, 540.0)), vec2(12.9898, 78.233))) * 43758.5453);
              g += (n - 0.5) * 0.035;                                      // granulação de filme
              gl_FragColor = vec4(g * mix(0.72, 1.0, v), c.a); }`,
        }));
        this.composer = cp; r.domElement.style.filter = ''; r.toneMappingExposure = 0.98;
      } catch { this.composer = null; }
    }
  }

  private initScene() {
    const sc = this.scene, w = this.world;
    const biome = MAPS.find(m => m.id === this.opts.mapId)?.biome ?? 'grass';
    const grass = biome === 'grass';
    // clima/hora do dia por mapa
    const MOOD: Record<string, { haze: string; sun: number; sunI: number; hemi: number }> = {
      planicie: { haze: '#9fa3a0', sun: 0xffc890, sunI: 4.0, hemi: 0.55 },   // fim de tarde, sol baixo e quente
      crateras: { haze: '#8f8a80', sun: 0xffc488, sunI: 3.6, hemi: 0.55 },   // poeira de bombardeio
      rio: { haze: '#8e9aa0', sun: 0xffd2a0, sunI: 3.5, hemi: 0.62 },        // úmido, sombras azuladas
      dunas: { haze: '#b8a07e', sun: 0xffbf78, sunI: 4.1, hemi: 0.52 },      // tarde dourada
      canions: { haze: '#a9806a', sun: 0xff9250, sunI: 3.8, hemi: 0.48 },    // pôr do sol alaranjado
    };
    const mood = MOOD[this.opts.mapId] ?? MOOD.planicie, haze = mood.haze;
    const bases0 = w.entities.filter(e => e.kind === 'conyard').sort((a, b) => a.team - b.team).map(e => ({ x: e.x, y: e.y }));
    const road = roadPoints(bases0);
    sc.background = new THREE.Color(haze);
    sc.fog = new THREE.FogExp2(haze, 0.00032); // névoa sutil que engole o horizonte
    sc.add(new THREE.HemisphereLight(0xd6c2a4, grass ? 0x3c3b2c : 0x4a3e2e, mood.hemi * 1.2)); // céu frio x chão quente
    if (this.q !== 'low') {
      try {
        const pm = new THREE.PMREMGenerator(this.renderer);
        sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        sc.environmentIntensity = 0.42; pm.dispose();
      } catch { /* sem reflexos */ }
    }
    const sun = new THREE.DirectionalLight(mood.sun, mood.sunI);
    const coarse = matchMedia('(pointer: coarse)').matches;
    sun.castShadow = this.q !== 'low'; { const ms = this.q === 'high' && !coarse ? 2048 : coarse ? 512 : 1024; sun.shadow.mapSize.set(ms, ms); }
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.shadow.radius = this.q === 'high' ? 1.4 : 1.2;
    sc.add(sun, sun.target);
    this.sun = sun;

    // terreno
    const tt = new THREE.CanvasTexture(drawTerrain(w.terrain, w.crystalMax, biome, bases0));
    tt.colorSpace = THREE.SRGBColorSpace; tt.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    let bump: THREE.CanvasTexture | null = null;
    if (this.q !== 'low') { bump = new THREE.CanvasTexture(drawTerrainBump(w.terrain, w.crystalMax, biome, bases0)); bump.anisotropy = 4; }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), new THREE.MeshStandardMaterial({ map: tt, roughness: 0.96, metalness: 0, bumpMap: bump, bumpScale: 2.2 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(WORLD_W / 2, 0, WORLD_H / 2); ground.receiveShadow = true;
    sc.add(ground);
    this.initTracks();
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W * 6, WORLD_H * 6), new THREE.MeshStandardMaterial({ color: grass ? '#4a4f36' : '#7a6a4e', roughness: 1 }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.set(WORLD_W / 2, -1.2, WORLD_H / 2); sc.add(skirt);

    // rochas e água
    const rocks: THREE.Matrix4[] = [], rockCol: THREE.Color[] = [], waters: THREE.Matrix4[] = [];
    const fort: THREE.Matrix4[][] = [[], [], [], [], []];
    const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const t = w.terrain[y * MAP_W + x], cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE;
      if (t === 1 && hash(x * 1.7, y * 2.3) > 0.55) {
        // obstáculo de guerra no lugar das pedras: ouriços antitanque, sacos de areia, arame, tambores ou barreiras
        const kind = Math.floor(hash(y * 3.1, x * 0.7) * 5), rot = hash(x, y * 5) * 6.28;
        fort[kind].push(new THREE.Matrix4().compose(new THREE.Vector3(cx + rnd(-3, 3), 0, cz + rnd(-3, 3)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(1, 1, 1).multiplyScalar(rnd(0.85, 1.15))));
        const s = rnd(5, 8); rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(cx + rnd(-12, 12), s * 0.3, cz + rnd(-12, 12)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd(0, 6), 0)), new THREE.Vector3(s, s * 0.6, s)));
        const l = rnd(0.5, 0.75); rockCol.push(new THREE.Color(l * 1.04, l, l * 0.94));
      } else if (t === 1) {
        const n = 2 + Math.floor(hash(x, y) * 2);
        for (let k = 0; k < n; k++) {
          const s = k === 0 ? rnd(11, 15) : rnd(5, 9), sy = s * rnd(0.45, 0.85);
          const m = new THREE.Matrix4().compose(
            new THREE.Vector3(cx + (k ? rnd(-10, 10) : rnd(-3, 3)), sy * 0.35, cz + (k ? rnd(-10, 10) : rnd(-3, 3))),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(-0.3, 0.3), rnd(0, 6.28), rnd(-0.3, 0.3))),
            new THREE.Vector3(s, sy, s * rnd(0.8, 1.15)));
          rocks.push(m); const l = rnd(0.55, 0.85); rockCol.push(new THREE.Color(l * 1.04, l, l * 0.94));
        }
      } else if (t === 2) waters.push(new THREE.Matrix4().makeTranslation(cx, 0.6, cz));
    }
    {
      const mg = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)).map(g => { if (g.getAttribute('uv')) g.deleteAttribute('uv'); return g; }), false)!;
      const B = (w2: number, h2: number, d2: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => new THREE.BoxGeometry(w2, h2, d2).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
      // ouriço tcheco: 3 vigas cruzadas em ângulo, 3 por casa
      const hog = (ox: number, oz: number, r: number) => [B(22, 2, 2, 0, 0, 0, 0, 0, 0.62), B(22, 2, 2, 0, 0, 0, 0, Math.PI / 2, 0.62).rotateX(0.0), B(2, 2, 22, 0, 0, 0, 0.62, 0, 0)].map(g => g.rotateY(r).translate(ox, 8, oz));
      const hogG = mg([...hog(-8, -6, 0.3), ...hog(7, -3, 1.2), ...hog(-2, 8, 2.1)]);
      // sacos de areia em "U" com duas camadas
      const bags: THREE.BufferGeometry[] = [];
      for (let l = 0; l < 3; l++) for (let i = 0; i < 7; i++) { const a = -1.3 + i * 0.43, r2 = 14; bags.push(new THREE.SphereGeometry(3, 7, 5).scale(1.5, 0.6, 1).rotateY(-a).translate(Math.cos(a) * r2 + (l % 2) * 0.8, 1.7 + l * 3, Math.sin(a) * r2)); }
      const bagG = mg(bags);
      // arame farpado: estacas e espiras
      const wire: THREE.BufferGeometry[] = [];
      for (let i = -2; i <= 2; i++) wire.push(B(1, 9, 1, i * 7, 4.5, 0, 0, 0, i % 2 ? 0.15 : -0.15));
      for (let i = 0; i < 12; i++) wire.push(new THREE.TorusGeometry(3.6, 0.22, 3, 10).rotateY(Math.PI / 2 + 0.25).translate(-15 + i * 2.7, 4, 0));
      const wireG = mg(wire);
      // tambores de óleo: de pé e deitados
      const drums: THREE.BufferGeometry[] = [];
      for (const [x2, z2] of [[-5, -4], [0, -5], [-2, 1], [4, -1]]) drums.push(new THREE.CylinderGeometry(3, 3, 8, 10).translate(x2, 4, z2));
      drums.push(new THREE.CylinderGeometry(3, 3, 8, 10).rotateZ(Math.PI / 2).rotateY(0.7).translate(8, 3, 8), new THREE.CylinderGeometry(3, 3, 8, 10).rotateZ(Math.PI / 2).translate(-8, 3, 9));
      drums.push(B(9, 7, 9, 10, 3.5, -8, 0, 0.3), B(7, 6, 7, 10, 10, -8, 0, 0.9));
      const drumG = mg(drums);
      // barreiras de concreto (tipo "New Jersey") em linha
      const bar: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i++) bar.push(B(14, 4, 7, -15 + i * 15, 2, 0, 0, i === 2 ? 0.35 : 0), B(14, 6, 3.6, -15 + i * 15, 7, 0, 0, i === 2 ? 0.35 : 0));
      const barG = mg(bar);
      const fm = [
        new THREE.MeshStandardMaterial({ color: '#4a3d33', roughness: 0.75, metalness: 0.55 }),
        new THREE.MeshStandardMaterial({ color: '#7b6c50', roughness: 1, metalness: 0, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: '#3d3b38', roughness: 0.6, metalness: 0.7 }),
        new THREE.MeshStandardMaterial({ color: '#4c5236', roughness: 0.8, metalness: 0.35 }),
        new THREE.MeshStandardMaterial({ color: '#86837a', roughness: 0.95, metalness: 0.02 }),
      ];
      [hogG, bagG, wireG, drumG, barG].forEach((g, k) => {
        if (!fort[k].length) return;
        const im = new THREE.InstancedMesh(g, fm[k], fort[k].length); fort[k].forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = this.q !== 'low'; im.receiveShadow = true; sc.add(im);
      });
    }
    if (rocks.length) {
      const rg = new THREE.DodecahedronGeometry(1, 0); { const pa = rg.getAttribute('position'); for (let i = 0; i < pa.count; i++) { const v = Math.sin(pa.getX(i) * 12.9 + pa.getZ(i) * 7.3) * 0.18; pa.setY(i, pa.getY(i) * (1 + v)); pa.setX(i, pa.getX(i) * (1 - v * 0.6)); } rg.computeVertexNormals(); }
      const im = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: '#4f4a42', roughness: 1, metalness: 0, envMapIntensity: 0.15, flatShading: true }), rocks.length);
      rocks.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, rockCol[i]); });
      im.castShadow = true; im.receiveShadow = true; sc.add(im);
    }
    if (waters.length) {
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2c444c', roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.85 }), waters.length);
      waters.forEach((m, i) => im.setMatrixAt(i, m)); im.receiveShadow = true; sc.add(im);
    }

    // vegetação seca e pedras pequenas (instanciadas, longe das bases)
    {
      const bases = w.entities.filter(e => e.kind === 'conyard').map(e => ({ x: e.x / TILE, y: e.y / TILE }));
      const cacti: THREE.Matrix4[] = [], shrubs: THREE.Matrix4[] = [], pebbles: THREE.Matrix4[] = [];
      for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
        const i = y * MAP_W + x;
        if (w.terrain[i] !== 0 || w.crystalMax[i] > 0) continue;
        if (bases.some(b => Math.hypot(b.x - x, b.y - y) < 14)) continue;
        if (road.some(r => Math.hypot(r.x - (x + 0.5) * TILE, r.y - (y + 0.5) * TILE) < 56)) continue;
        const h1 = hash(x * 3.1, y * 1.7), h2 = hash(y * 5.3, x * 2.9);
        const px = (x + 0.2 + h2 * 0.6) * TILE, pz = (y + 0.2 + h1 * 0.6) * TILE;
        if (grass) {
          const clump = hash(Math.floor(x / 5), Math.floor(y / 5)) > 0.55;
          if (clump && h1 > 0.7) { const sc = 0.8 + h2 * 0.9; cacti.push(new THREE.Matrix4().compose(new THREE.Vector3(px, 0, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h2 * 6, 0)), new THREE.Vector3(sc, sc, sc))); }
          else if (h1 > 0.9) { const sc = 4 + h2 * 5; shrubs.push(new THREE.Matrix4().compose(new THREE.Vector3(px, sc * 0.4, pz), new THREE.Quaternion(), new THREE.Vector3(sc, sc * 0.7, sc))); }
          else if (h1 < 0.03) { const sc = 1.5 + h2 * 2.5; pebbles.push(new THREE.Matrix4().compose(new THREE.Vector3(px, sc * 0.3, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(h1 * 40, h2 * 6, 0)), new THREE.Vector3(sc, sc * 0.7, sc))); }
        } else if (h1 > 0.955) { const sc = 0.8 + h2 * 0.7; cacti.push(new THREE.Matrix4().compose(new THREE.Vector3(px, 0, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h2 * 6, 0)), new THREE.Vector3(sc, sc, sc))); }
        else if (h1 > 0.9) { const sc = 4 + h2 * 5; shrubs.push(new THREE.Matrix4().compose(new THREE.Vector3(px, sc * 0.35, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h2 * 6, 0)), new THREE.Vector3(sc, sc * 0.6, sc * 0.9))); }
        else if (h1 < 0.04) { const sc = 1.5 + h2 * 2.5; pebbles.push(new THREE.Matrix4().compose(new THREE.Vector3(px, sc * 0.3, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(h1 * 40, h2 * 6, 0)), new THREE.Vector3(sc, sc * 0.7, sc))); }
      }
      const inst = (geo: THREE.BufferGeometry, m: THREE.Material, list: THREE.Matrix4[], shadow = true) => {
        if (!list.length) return; const im = new THREE.InstancedMesh(geo, m, list.length);
        list.forEach((mm, k) => im.setMatrixAt(k, mm)); im.castShadow = shadow; im.receiveShadow = true; sc.add(im);
      };
      const treeG = mergeGeometries([
        new THREE.CylinderGeometry(1.4, 2, 9, 6).translate(0, 4.5, 0),
        new THREE.IcosahedronGeometry(8, 0).scale(1, 1.05, 1).translate(0, 14, 0),
        new THREE.IcosahedronGeometry(5.6, 0).translate(3.6, 20, 1.4),
      ].map(g => (g.index ? g.toNonIndexed() : g)).map(g => { g.deleteAttribute('uv'); return g; }), false)!;
      const cg = mergeGeometries([
        new THREE.CylinderGeometry(1.6, 2, 15, 7).translate(0, 7.5, 0),
        new THREE.CylinderGeometry(1.1, 1.3, 6, 6).rotateZ(Math.PI / 2).translate(-3.2, 8, 0), new THREE.CylinderGeometry(1, 1.1, 5, 6).translate(-5.4, 10.5, 0),
        new THREE.CylinderGeometry(1.1, 1.3, 5, 6).rotateZ(Math.PI / 2).translate(3, 5.5, 0), new THREE.CylinderGeometry(1, 1.1, 4.5, 6).translate(5, 7.8, 0),
      ].map(g => g.index ? g.toNonIndexed() : g), false)!;
      if (grass) {
        const tm = new THREE.MeshStandardMaterial({ color: '#7d8f58', roughness: 0.95, flatShading: true });
        const im = new THREE.InstancedMesh(treeG, tm, cacti.length || 1);
        const cols = ['#5e7244', '#6b7c48', '#52663c', '#78814e', '#86704a'];
        cacti.forEach((m2, k) => { im.setMatrixAt(k, m2); im.setColorAt(k, new THREE.Color(cols[Math.floor(hash(k * 1.3, 7) * (k % 17 === 0 ? 5 : 4))])); });
        im.count = cacti.length; im.castShadow = true; im.receiveShadow = true; sc.add(im);
        inst(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#41502f', roughness: 1, flatShading: true }), shrubs);
      } else {
        inst(cg, new THREE.MeshStandardMaterial({ color: '#4c5e3a', roughness: 0.9, flatShading: true }), cacti);
        inst(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#6e6244', roughness: 1, flatShading: true }), shrubs);
      }
      inst(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#7b7466', roughness: 1, flatShading: true }), pebbles);
    }

    // cicatrizes da guerra: destroços, torres de mineração caídas, pilares quebrados e postes de energia
    {
      const rust = mat('#5a4636', { rough: 0.95, metal: 0.4 }), dark = mat('#2a2622', { rough: 1 }), steel = mat('#6b7078', { rough: 0.7, metal: 0.5 });
      const mg = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)).map(g => { g.deleteAttribute('uv'); return g; }), false)!;
      const box = (w2: number, h2: number, d2: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => new THREE.BoxGeometry(w2, h2, d2).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
      const wreckG = mg([box(16, 5, 24, 0, 3, 0, 0.1, 0, 0.12), box(11, 4, 12, 1, 7, -2, 0, 0.3, 0.2), new THREE.CylinderGeometry(1.2, 1.2, 15, 6).rotateZ(1.2).rotateY(0.4).translate(6, 8, 4), box(3, 6, 20, -10, 2, 2, 0.2, 0, 0.5)]);
      const derrickG = mg([box(2, 34, 2, -6, 17, -6, 0, 0, 0.1), box(2, 34, 2, 6, 17, -6, 0, 0, -0.12), box(2, 30, 2, 0, 15, 6, 0.1, 0, 0), box(18, 2, 2, 0, 20, -6), box(14, 2, 2, 0, 30, 0, 0, 0.8, 0), new THREE.CylinderGeometry(6, 6, 3, 8).translate(0, 5, 0)]);
      const pillarG = mg([box(8, 20, 8, 0, 10, 0, 0, 0.3, 0.06), box(7, 7, 7, 8, 3.5, 6, 0.2, 0.5, 0.3), box(5, 4, 9, -8, 2, 5, 0.3, 0.9, 0.1)]);
      const pylonG = mg([box(1.6, 40, 1.6, 0, 20, 0, 0, 0, 0.25), box(16, 1.4, 1.4, 6, 32, 0, 0, 0, 0.25), new THREE.CylinderGeometry(0.3, 0.3, 28, 4).rotateZ(1.5).translate(24, 20, 0)]);
      const spots: { g: THREE.BufferGeometry; m: THREE.Material; list: THREE.Matrix4[] }[] = [
        { g: wreckG, m: rust, list: [] }, { g: derrickG, m: steel, list: [] }, { g: pillarG, m: dark, list: [] }, { g: pylonG, m: steel, list: [] }];
      const bs = w.entities.filter(e => e.kind === 'conyard').map(e => ({ x: e.x, y: e.y }));
      let n = 0;
      for (let y = 6; y < MAP_H - 6 && n < 46; y += 3) for (let x = 6; x < MAP_W - 6 && n < 46; x += 3) {
        const h = hash(x * 7.7, y * 3.3);
        if (h < 0.915) continue;
        let free = true;
        for (let j = -1; j <= 1 && free; j++) for (let i = -1; i <= 1; i++) { const k = (y + j) * MAP_W + (x + i); if (w.terrain[k] !== 0 || w.crystalMax[k] > 0) { free = false; break; } }
        const px = (x + 0.5) * TILE, pz = (y + 0.5) * TILE;
        if (!free || bs.some(b => Math.hypot(b.x - px, b.y - pz) < 22 * TILE) === false && false) continue;
        if (bs.some(b => Math.hypot(b.x - px, b.y - pz) < 12 * TILE)) continue;
        if (road.some(r => Math.hypot(r.x - px, r.y - pz) < 34)) continue;
        const t = Math.floor(hash(y * 1.9, x * 2.3) * 4), sc = 0.75 + hash(x, y * 9) * 0.5;
        spots[t].list.push(new THREE.Matrix4().compose(new THREE.Vector3(px, 0, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hash(x, y) * 6.28, 0)), new THREE.Vector3(sc, sc, sc)));
        if (t === 0) this.wrecks.push({ x: px, z: pz });
        n++;
      }
      for (const sp of spots) if (sp.list.length) { const im = new THREE.InstancedMesh(sp.g, sp.m, sp.list.length); sp.list.forEach((m2, k) => im.setMatrixAt(k, m2)); im.castShadow = true; im.receiveShadow = true; sc.add(im); }
      // poeira e partículas flutuando no ar
      const N2 = this.q === 'low' ? 0 : 140, pos = new Float32Array(N2 * 3);
      for (let i = 0; i < N2; i++) { pos[i * 3] = Math.random() * WORLD_W; pos[i * 3 + 1] = 8 + Math.random() * 50; pos[i * 3 + 2] = Math.random() * WORLD_H; }
      if (N2) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.dust = new THREE.Points(g, new THREE.PointsMaterial({ map: this.texGlow, color: grass ? 0xfff6d0 : 0xffe0a0, size: 7, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.dust.frustumCulled = false; sc.add(this.dust);
      }
    }

    // cristais (instanciados) + brilho
    const cg: THREE.BufferGeometry[] = [];
    [[0, 0, 0, 1, 0], [0.42, -0.25, 0.1, 0.62, 0.5], [-0.36, -0.35, -0.2, 0.55, -0.55], [0.05, -0.45, -0.42, 0.45, 0.35], [-0.2, -0.5, 0.38, 0.4, -0.3]].forEach(([x, y, z, h, tilt], k) => {
      const shaft = new THREE.CylinderGeometry(0.26, 0.34, 1.5 * h, 6).translate(0, 0.75 * h, 0), tip = new THREE.ConeGeometry(0.26, 0.55 * h, 6).translate(0, 1.5 * h + 0.27 * h, 0);
      const one = mergeGeometries([shaft.toNonIndexed(), tip.toNonIndexed()].map(g => { g.deleteAttribute('uv'); return g; }), false)!;
      const pa = one.getAttribute('position');
      for (let i = 0; i < pa.count; i++) { const j = Math.sin(i * 7.31 + k * 3.7) * 0.06; pa.setXYZ(i, pa.getX(i) * (1 + j * 2), pa.getY(i), pa.getZ(i) * (1 - j * 2)); }
      one.rotateZ(tilt * 0.55).rotateX(tilt * 0.3).translate(x, y - 0.9, z); one.computeVertexNormals(); cg.push(one);
    });
    const cMat = new THREE.MeshStandardMaterial({ color: '#2a8fb0', emissive: '#1784c0', emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86, flatShading: true, envMapIntensity: 1.6 });
    cMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.45 + 1.6 * pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);'); };
    this.crystalInst = new THREE.InstancedMesh(mergeGeometries(cg, false)!, cMat, 2400);
    this.crystalPool = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.texGlow, color: 0x2a9ad0, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), 1200);
    this.crystalPool.count = 0; this.crystalPool.renderOrder = 2; sc.add(this.crystalPool);
    if (this.q === 'high') for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0x3aa8e0, 0, 260, 1.8); l.position.set(-999, 18, -999); sc.add(l); this.crystalLights.push(l); }
    this.crystalInst.castShadow = true; this.crystalInst.count = 0; sc.add(this.crystalInst);
    this.crystalGlow = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ map: this.texGlow, color: 0x3a8cb8, size: 34, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    sc.add(this.crystalGlow);

    // névoa de guerra suave
    const fc = document.createElement('canvas'); fc.width = MAP_W; fc.height = MAP_H;
    this.fogCtx = fc.getContext('2d')!;
    this.fogTex = new THREE.CanvasTexture(fc); this.fogTex.minFilter = THREE.LinearFilter; this.fogTex.magFilter = THREE.LinearFilter; this.fogTex.generateMipmaps = false;
    const fog = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), new THREE.MeshBasicMaterial({ map: this.fogTex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    fog.rotation.x = -Math.PI / 2; fog.position.set(WORLD_W / 2, 3, WORLD_H / 2); fog.renderOrder = 5; sc.add(fog);
    this.drawFog();

    const rc = document.createElement('canvas'); rc.width = rc.height = 64;
    const rx = rc.getContext('2d')!; rx.strokeStyle = '#fff'; rx.lineWidth = 5; rx.beginPath(); rx.arc(32, 32, 26, 0, 7); rx.stroke();
    this.texRing = new THREE.CanvasTexture(rc); this.texRing.colorSpace = THREE.SRGBColorSpace;
  }

  private initUi() {
    const w = this.world, me = this.me, o = this.opts;
    const sbRoot = document.getElementById('sidebar')!;
    this.sidebar = new Sidebar(sbRoot, w, me, {
      onItem: k => this.onItem(k),
      onCancel: k => { this.cmd({ c: 'cancel', k }); if (this.placing === k) this.cancelPlacement(); sfx.click(); },
      onNav: (x, y) => this.centerOn(x, y),
      onToggleBox: () => { this.input.boxToggle = !this.input.boxToggle; sfx.click(); return this.input.boxToggle; },
      onSelectAll: () => this.selectArmy(),
      onClear: () => { this.selection = []; this.inspect = null; sfx.click(); },
      onAMove: () => this.toggleAMove(),
      onStop: () => { this.cmd({ c: 'stop', ids: this.selIds() }); sfx.order(); },
      onSell: () => this.sellSelected(),
      onRepair: () => this.repairSelected(),
      onRally: () => this.toggleTgt('rally'),
      onSuper: () => this.toggleTgt('sp'),
      onPatrol: () => this.toggleTgt('patrol'),
      onHold: () => this.holdSelected(),
      onUnload: () => this.unloadSelected(),
      onMenu: () => this.pause(),
    });
    if (this.world.noSuper) sbRoot.querySelector('#sb-sp')?.remove();
    this.hud = new Hud(this.host, () => this.confirmPlacement(), () => this.cancelPlacement(), () => this.upgradeSelected(), () => this.sellSelected());
    if (o.mission) {
      this.mEl = document.createElement('div'); this.mEl.className = 'mission'; this.host.append(this.mEl);
      setTimeout(() => { this.banner(`MISSÃO ${o.mission!.n}`, 'gold big'); this.banner(o.mission!.title.toUpperCase(), 'gold'); sfx.slam(); }, 350);
      this.renderMission();
    } else if (this.role === 'solo') {
      this.hud.toast(`${FACTIONS[o.faction].name} — destrua o ${FACTIONS[w.teams[1].faction].name}!`, 4000);
      this.hud.toast(`IA ${DIFFS[o.difficulty].label}: ataca quando reunir tropas — não há cronômetro. Fique atento!`, 5000);
    } else this.hud.toast('Partida online 1x1 — destrua a base do seu amigo!', 4500);
    if (!o.mission) this.hud.toast('Clique numa construção/unidade para evoluir ★ · Atalhos: A atacar, S parar, U evoluir, H base, Espaço alerta', 6500);
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.W = Math.max(2, r.width); this.H = Math.max(2, r.height);
    this.renderer.setSize(this.W, this.H, false);
    this.composer?.setPixelRatio(this.dpr); this.composer?.setSize(this.W, this.H);
    this.cam.aspect = this.W / this.H; this.cam.updateProjectionMatrix();
    this.ov.width = Math.round(this.W * this.dpr); this.ov.height = Math.round(this.H * this.dpr);
    this.octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ---------- câmera ----------
  private applyCam() {
    this.target.x = Math.max(60, Math.min(WORLD_W - 60, this.target.x));
    this.target.z = Math.max(60, Math.min(WORLD_H - 60, this.target.z));
    let d = this.camDist;
    const asp = this.W / Math.max(1, this.H), kf = asp < 1.5 ? Math.min(1.9, Math.sqrt(1.5 / asp)) : 1; // telas estreitas (retrato) afastam a câmera
    d *= kf;
    const sk = Storage.data.shake === false ? 0 : this.shake, jx = sk > 0.01 ? (Math.random() - 0.5) * sk * 9 : 0, jz = sk > 0.01 ? (Math.random() - 0.5) * sk * 9 : 0;
    this.cam.position.set(this.target.x + jx, d * Math.sin(PITCH) + jz * 0.6, this.target.z + d * Math.cos(PITCH) + jz);
    this.cam.lookAt(this.target.x, 0, this.target.z);
    this.cam.updateMatrixWorld();
    const s = Math.max(320, Math.min(900, d * 0.95));
    const sh = this.sun.shadow.camera;
    if (Math.abs(sh.right - s) > 8) { sh.left = -s; sh.right = s; sh.top = s; sh.bottom = -s; sh.near = 10; sh.far = 2400; sh.updateProjectionMatrix(); }
    this.sun.target.position.set(this.target.x, 0, this.target.z);
    this.sun.position.set(this.target.x - 680, 430, this.target.z + 380);
  }
  setDist(d: number) { this.camDist = Math.max(230, Math.min(1150, d)); }
  zoomBy(f: number) { this.setDist(this.camDist * f); }
  centerOn(x: number, y: number) { this.target.set(x, 0, y + 70); }
  ground(sx: number, sy: number): { x: number; y: number } | null {
    this.ray.setFromCamera(new THREE.Vector2((sx / this.W) * 2 - 1, -(sy / this.H) * 2 + 1), this.cam);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, p) ? { x: p.x, y: p.z } : null;
  }
  grabPan(px: number, py: number, nx: number, ny: number) {
    this.applyCam();
    const a = this.ground(px, py), b = this.ground(nx, ny);
    if (a && b) { this.target.x += a.x - b.x; this.target.z += a.y - b.y; }
  }
  private proj(x: number, y: number, z: number): { x: number; y: number; ok: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.cam);
    return { x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H, ok: v.z < 1 };
  }
  private viewRect() {
    const pts = [[0, 0], [this.W, 0], [0, this.H], [this.W, this.H]].map(([x, y]) => this.ground(x, y)).filter(Boolean) as { x: number; y: number }[];
    if (!pts.length) return { x: 0, y: 0, w: 1, h: 1 };
    const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  private ambOn = false;
  unlockAudio() { sfx.unlock(); if (!this.ambOn && sfx.bus) { this.ambOn = true; sfx.ambience(true, (MAPS.find(m => m.id === this.opts.mapId)?.biome ?? 'grass') === 'desert'); } }

  // ---------- rede ----------
  private setupNet() {
    const net = this.opts.net;
    if (!net || this.role === 'solo') return;
    net.onMsg = (m: NetMsg, from?: string) => {
      if (m.t === 'cmd' && this.role === 'host') {
        // o time é decidido pelo host a partir de quem enviou (o convidado não pode comandar outro time)
        const team = this.world.active.find(t => this.world.slots[t].peerId === from);
        if (team === undefined || this.world.teams[team].out) return;
        const err = this.world.applyCommand(team, m.c);
        if (err) this.world.msg(err, team);
      } else if (m.t === 'snap' && this.role === 'guest') {
        this.world.applySnapshot(m.s);
        if (!this.centered) {
          const base = this.world.entities.find(e => e.team === this.me && e.kind === 'conyard');
          if (base) { const cn = this.world.corner(this.me); this.target.set(base.x + (cn.fx ? -90 : 90), 0, base.y + (cn.fy ? 50 : -50)); this.centered = true; }
        }
      } else if (m.t === 'crystal' && this.role === 'guest') this.world.applyCrystal(m.a);
      else if (m.t === 'bye' && this.role === 'guest') this.opponentLeft();
    };
    // host: um amigo saiu => ele se rende (perde as construções); a partida segue para os demais
    net.onPeer = (peerId, what) => {
      if (what !== 'leave' || this.role !== 'host' || this.over) return;
      const team = this.world.active.find(t => this.world.slots[t].peerId === peerId);
      if (team === undefined) return;
      this.world.surrender(team);
      this.hud.toast(`${TEAM_COLORS[team].name} saiu da partida`, 2600);
    };
    // convidado: a conexão com o host caiu => a partida acabou
    net.onStatus = st => { if (this.role === 'guest' && (st === 'closed' || st === 'error')) this.opponentLeft(); };
    if (this.role === 'host') net.send({ t: 'crystal', a: this.world.crystalSnap() });
  }
  private opponentLeft() {
    if (this.over || this.left) return;
    this.left = true; this.over = true; sfx.win();
    this.hud.showPanel('Conexão encerrada', this.role === 'guest' ? 'O anfitrião saiu da partida.' : 'Seu amigo saiu da partida. Você vence por abandono!', [{ label: '⟲ Menu principal', fn: () => this.exit() }]);
  }
  private cmd(c: Cmd) {
    if (this.role === 'guest') { this.opts.net?.send({ t: 'cmd', c }); return; }
    const err = this.world.applyCommand(0, c);
    if (err) { this.hud.toast(err, 1800); sfx.error(); if (/Créditos/.test(err)) voice.say('funds'); }
  }
  private selIds(): number[] { return this.selection.filter(e => e.alive && e.team === this.me).map(e => e.id); }
  private movers(): Entity[] { return this.selection.filter(e => e.alive && !e.building && e.team === this.me); }

  // ---------- construção / UI ----------
  private onItem(kind: Kind) {
    const w = this.world, d = DEFS[kind];
    sfx.unlock();
    if (kind === 'wall') {
      if (this.wallMode) { this.endWallMode(); return; }
      if (!w.canBuild(this.me, 'wall')) { this.hud.toast('Requisito não atendido', 1800); sfx.error(); return; }
      this.cancelPlacement(); this.tgt = null; this.amove = false; this.sidebar.setAMove(false); this.sidebar.setMode(false, false);
      this.wallMode = true; this.wallBar.classList.remove('hidden'); sfx.click();
      this.hud.toast(`Arraste para desenhar o muro (◆ ${DEFS.wall.cost} por trecho). Toque para um trecho só.`, 3200);
      return;
    }
    if (d.building) {
      const head = w.teams[this.me].queues.structure[0];
      if (head && head.kind === kind && head.progress >= 1) { this.beginPlacement(kind); return; }
    }
    const err = w.prodError(this.me, kind);
    if (err) { this.hud.toast(err, 1800); sfx.error(); if (/Créditos/.test(err)) voice.say('funds'); return; }
    this.cmd({ c: 'prod', k: kind }); sfx.click();
  }
  private beginPlacement(kind: Kind) {
    const spot = this.world.findPlacement(this.me, kind);
    if (!spot) { this.hud.toast('Sem espaço disponível perto da base', 2000); sfx.error(); return; }
    this.placing = kind; this.ghostT = { x: spot.x, y: spot.y };
    const px = (spot.x + DEFS[kind].w / 2) * TILE, py = (spot.y + DEFS[kind].h / 2) * TILE;
    const p = this.proj(px, 0, py);
    if (!p.ok || p.x < 0 || p.y < 0 || p.x > this.W || p.y > this.H) this.centerOn(px, py);
    this.hud.toast('Toque no mapa para mover; toque no prédio (ou ✔) para construir', 3000);
  }
  private cancelPlacement() { this.placing = null; this.hud.hidePlacement(); this.dropGhost(); }
  private dropGhost() { if (this.ghost) { this.scene.remove(this.ghost); dispose(this.ghost); this.ghost = null; this.ghostKind = null; } }
  private placeValid(): boolean {
    if (!this.placing) return false;
    const d = DEFS[this.placing], { x, y } = this.ghostT;
    for (let j = y; j < y + d.h; j++) for (let i = x; i < x + d.w; i++) {
      if (i < 0 || j < 0 || i >= MAP_W || j >= MAP_H || !this.world.explored[j * MAP_W + i]) return false;
    }
    return this.world.canPlace(this.me, this.placing, x, y, 0);
  }
  private confirmPlacement() {
    if (!this.placing) return;
    if (!this.placeValid()) { this.hud.toast('Local inválido: perto da base e em terreno livre', 1800); sfx.error(); return; }
    this.cmd({ c: 'place', k: this.placing, x: this.ghostT.x, y: this.ghostT.y });
    sfx.place(); this.cancelPlacement();
  }
  private setGhost(wx: number, wy: number) {
    if (!this.placing) return;
    const d = DEFS[this.placing];
    this.ghostT = { x: Math.round(wx / TILE - d.w / 2), y: Math.round(wy / TILE - d.h / 2) };
  }

  private canSee = (e: Entity) => this.world.isVisible(e);

  /** Seleção por raio 3D (modelos) com apoio do ponto no chão (unidades pequenas). */
  private pick(sx: number, sy: number): Entity | null {
    this.ray.setFromCamera(new THREE.Vector2((sx / this.W) * 2 - 1, -(sy / this.H) * 2 + 1), this.cam);
    const objs: THREE.Object3D[] = [];
    for (const [id, r] of this.ents) if (r.g.visible) { r.g.userData.eid = id; objs.push(r.g); }
    const hits = this.ray.intersectObjects(objs, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.eid === undefined) o = o.parent;
      if (o) { const e = this.world.entities.find(x => x.id === o!.userData.eid && x.alive); if (e) return e; }
    }
    const g = this.ground(sx, sy);
    return g ? this.world.entityAt(g.x, g.y, this.canSee) : null;
  }

  // ---------- entrada ----------
  onHover(sx: number, sy: number, cx: number, cy: number) {
    this.hoverG = this.tgt ? this.ground(sx, sy) : null;
    if (this.placing) { const g = this.ground(sx, sy); if (g) this.setGhost(g.x, g.y); tooltip.hide(); return; }
    const e = this.pick(sx, sy);
    if (!e) { tooltip.hide(); return; }
    const mine = e.team === this.me;
    const stars = '★'.repeat(e.tech) + '<u>' + '★'.repeat(MAX_TECH - e.tech) + '</u>';
    const rank = !e.building && e.vet > 1 ? `<span class="tv">${VET_NAMES[e.vet - 1]}</span>` : '';
    tooltip.show(`<div class="tn ${mine ? 'ally' : 'foe'}">${e.def.name}</div>
      <div class="ts"><span>${mine ? 'Aliado' : 'Inimigo'} · ${FACTIONS[e.faction].name}</span><b class="stars">${stars}</b></div>
      <div class="ts"><span>Vida</span><b>${Math.ceil(e.hp)}/${e.maxHp}</b></div>${rank}${!e.building && mine ? `<div class="ts"><span>Abates</span><b>${e.kills}</b></div>` : ''}`, cx, cy);
  }
  onLeave() { tooltip.hide(); }

  onTap(sx: number, sy: number, touch: boolean) {
    tooltip.hide();
    const g = this.ground(sx, sy);
    if (!g) return;
    if (this.wallMode) { this.cmd({ c: 'wall', pts: [[Math.floor(g.x / TILE), Math.floor(g.y / TILE)]] }); sfx.click(); return; }
    if (this.placing) {
      const d = DEFS[this.placing];
      const inside = g.x >= this.ghostT.x * TILE && g.x <= (this.ghostT.x + d.w) * TILE && g.y >= this.ghostT.y * TILE && g.y <= (this.ghostT.y + d.h) * TILE;
      this.setGhost(g.x, g.y);
      if (!touch || inside) this.confirmPlacement();
      return;
    }
    if (this.tgt) {
      const m = this.tgt; this.tgt = null; this.sidebar.setMode(false, false);
      if (m === 'patrol') { const ids = this.movers().filter(u => u.def.damage > 0).map(u => u.id); if (ids.length) { this.cmd({ c: 'patrol', ids, x: g.x, y: g.y }); sfx.order(); this.hud.toast('Patrulhando: as tropas vão e voltam atacando', 1600); } this.marks.push({ x: g.x, y: g.y, t: 0 }); return; }
      this.cmd(m === 'sp' ? { c: 'sp', x: g.x, y: g.y } : { c: 'rally', x: g.x, y: g.y });
      this.marks.push({ x: g.x, y: g.y, t: 0 }); sfx.order();
      if (m === 'sp') { haptic(true); voice.say('splaunch'); Achievements.unlock('super'); this.shake = Math.min(3.4, this.shake + 0.6); this.banner(FACTIONS[this.world.teams[this.me].faction].power === 'pulse' ? '☀ PULSO ORBITAL' : '💥 BARRAGEM DE ARTILHARIA', 'gold big'); sfx.slam(); }
      return;
    }
    const hit = this.pick(sx, sy);
    const movers = this.movers();
    if (this.amove && movers.length) {
      this.cmd({ c: 'amove', ids: movers.map(m => m.id), x: g.x, y: g.y }); this.marks.push({ x: g.x, y: g.y, t: 0 });
      this.amove = false; this.sidebar.setAMove(false); sfx.order(); return;
    }
    if (hit && hit.team === this.me && hit.kind === 'apc' && movers.some(m => m.def.category === 'infantry')) {
      this.cmd({ c: 'board', ids: movers.filter(m => m.def.category === 'infantry').map(m => m.id), t: hit.id }); sfx.order(); this.marks.push({ x: hit.x, y: hit.y, t: 0 }); return;
    }
    if (hit && hit.team === this.me) {
      const now = performance.now();
      this.inspect = null;
      if (!touch && this.input.keys.has('shift') && !hit.building) {
        // Shift+clique: adiciona ou tira a unidade da seleção
        const has = this.selection.includes(hit);
        this.selection = has ? this.selection.filter(x => x !== hit) : [...this.selection.filter(x => !x.building), hit];
        sfx.select(); this.lastTap = { t: now, id: hit.id }; return;
      }
      if (!hit.building && this.lastTap.id === hit.id && now - this.lastTap.t < 380) {
        this.selection = this.world.units(this.me).filter(u => u.kind === hit.kind && this.onScreen(u.x, u.y));
        this.hud.toast(`${this.selection.length}× ${hit.def.name}`, 1200);
      } else if (this.selection.length === 1 && this.selection[0] === hit) {
        // tocar de novo na unidade (ou construção) já marcada desmarca
        this.clearSelection(); this.lastTap = { t: now, id: -1 }; return;
      } else this.selection = [hit];
      this.lastTap = { t: now, id: hit.id };
      sfx.select(); this.ack('sel'); this.runner?.note('select'); return;
    }
    if (!touch && !hit && movers.length) {
      // mouse: clique esquerdo no chão desmarca; mover/atacar é com o botão direito
      this.clearSelection();
      if (!this.hintDesel) { this.hintDesel = true; this.hud.toast('Clique direito para mover ou atacar · clique esquerdo no chão desmarca', 3200); }
      return;
    }
    if (movers.length) {
      if (hit && this.world.isEnemy(this.me, hit.team)) { this.cmd({ c: 'atk', ids: movers.map(m => m.id), t: hit.id }); this.marks.push({ x: hit.x, y: hit.y, t: 0 }); }
      else { this.cmd({ c: 'move', ids: movers.map(m => m.id), x: g.x, y: g.y }); this.marks.push({ x: g.x, y: g.y, t: 0 }); }
      sfx.order(); this.ack(hit && this.world.isEnemy(this.me, hit.team) ? 'atk' : 'move'); this.runner?.note(hit && this.world.isEnemy(this.me, hit.team) ? 'attack' : 'move');
    } else if (hit) { this.inspect = hit; this.selection = []; sfx.select(); }
    else { this.selection = []; this.inspect = null; }
  }

  onRight(sx: number, sy: number) {
    if (this.wallMode) { this.endWallMode(); return; }
    if (this.tgt) { this.tgt = null; this.sidebar.setMode(false, false); return; }
    if (this.placing) { this.cancelPlacement(); return; }
    if (this.amove) { this.amove = false; this.sidebar.setAMove(false); return; }
    const movers = this.movers();
    if (!movers.length) return;
    const g = this.ground(sx, sy); if (!g) return;
    const hit = this.pick(sx, sy), ids = movers.map(m => m.id);
    if (hit && hit.team === this.me && hit.kind === 'apc' && movers.some(m => m.def.category === 'infantry')) this.cmd({ c: 'board', ids: movers.filter(m => m.def.category === 'infantry').map(m => m.id), t: hit.id });
    else if (hit && this.world.isEnemy(this.me, hit.team)) this.cmd({ c: 'atk', ids, t: hit.id }); else this.cmd({ c: 'move', ids, x: g.x, y: g.y });
    this.marks.push({ x: g.x, y: g.y, t: 0 });
    sfx.order(); this.ack(hit && this.world.isEnemy(this.me, hit.team) ? 'atk' : 'move'); this.runner?.note(hit && this.world.isEnemy(this.me, hit.team) ? 'attack' : 'move');
  }

  onBox(x0: number, y0: number, x1: number, y1: number) {
    const minx = Math.min(x0, x1), maxx = Math.max(x0, x1), miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
    const own = this.world.entities.filter(e => {
      if (!e.alive || e.team !== this.me) return false;
      const p = this.proj(e.x, 8, e.y);
      return p.ok && p.x >= minx && p.x <= maxx && p.y >= miny && p.y <= maxy;
    });
    const units = own.filter(e => !e.building);
    this.selection = units.length ? units : own.filter(e => e.building).slice(0, 1);
    this.inspect = null;
    if (this.selection.length) { sfx.select(); this.ack('sel'); this.runner?.note('select'); }
  }

  endWallMode() { this.wallMode = false; this.wallPts = []; this.wallBar.classList.add('hidden'); }
  /** linha de casas entre dois pontos, sem buracos na diagonal (cada passo anda só em X ou só em Y) */
  private wallLine(sx0: number, sy0: number, sx1: number, sy1: number): [number, number][] {
    const a = this.ground(sx0, sy0), b = this.ground(sx1, sy1); if (!a || !b) return [];
    let x = Math.floor(a.x / TILE), y = Math.floor(a.y / TILE);
    const x1 = Math.floor(b.x / TILE), y1 = Math.floor(b.y / TILE), dx = Math.abs(x1 - x), dy = Math.abs(y1 - y), sxs = x < x1 ? 1 : -1, sys = y < y1 ? 1 : -1;
    const out: [number, number][] = [[x, y]]; let err = dx - dy;
    while ((x !== x1 || y !== y1) && out.length < 40) {
      if (2 * err > -dy && (x !== x1)) { err -= dy; x += sxs; } else { err += dx; y += sys; }
      out.push([x, y]);
    }
    return out;
  }
  onWallDrag(sx0: number, sy0: number, sx1: number, sy1: number) { this.wallPts = this.wallLine(sx0, sy0, sx1, sy1); }
  onWallEnd() {
    const pts = this.wallPts; this.wallPts = [];
    if (pts.length) { this.cmd({ c: 'wall', pts }); sfx.click(); this.runner?.note('build'); if (this.world.entities.filter(e => e.team === this.me && e.alive && e.kind === 'wall').length >= 30) Achievements.unlock('wall'); }
  }
  /** prévia: verde = será erguido, vermelho = bloqueado ou sem dinheiro */
  private wallPreview(): boolean[] {
    const w = this.world, me = this.me, own = w.buildings(me), ok: boolean[] = [];
    let money = w.teams[me].credits; const near: [number, number][] = [];
    for (const [tx, ty] of this.wallPts) {
      const explored = tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && w.explored[ty * MAP_W + tx];
      const close = own.some(b => Math.max(b.tx - (tx + 1), tx - (b.tx + b.def.w), 0) <= 6 && Math.max(b.ty - (ty + 1), ty - (b.ty + b.def.h), 0) <= 6) || near.some(([x, y]) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 7);
      const v = !!explored && close && w.wallTileFree(tx, ty) && money >= DEFS.wall.cost;
      if (v) { money -= DEFS.wall.cost; near.push([tx, ty]); }
      ok.push(v);
    }
    return ok;
  }
  /** resposta falada da tropa selecionada */
  private ack(kind: 'sel' | 'move' | 'atk') {
    const u = this.selection.find(e => e.alive && !e.building && e.team === this.me); if (!u) return;
    if (kind !== 'sel') { voice.say(kind); return; }
    voice.say(u.def.category === 'infantry' ? 'selInf' : u.def.category === 'air' ? 'selAir' : 'selVeh');
  }
  private clearSelection() { this.selection = []; this.inspect = null; sfx.click(); }

  private onScreen(x: number, y: number) { const p = this.proj(x, 0, y); return p.ok && p.x > 0 && p.y > 0 && p.x < this.W && p.y < this.H; }

  onKey(k: string, e: KeyboardEvent) {
    if (this.over) return;
    if (/^[1-9]$/.test(k)) {
      const i = Number(k) - 1;
      if (e.ctrlKey || e.metaKey) { this.groups[i] = this.selection.filter(x => x.alive && x.team === this.me); this.hud.toast(`Grupo ${k}: ${this.groups[i].length} selecionado(s)`, 1200); e.preventDefault(); return; }
      const grp = (this.groups[i] ?? []).filter(x => x.alive);
      if (grp.length) {
        this.selection = grp; this.inspect = null; sfx.select();
        const now = performance.now();
        if (this.lastGroupKey.k === k && now - this.lastGroupKey.t < 400) this.centerOn(grp[0].x, grp[0].y);
        this.lastGroupKey = { k, t: now };
      }
      return;
    }
    if (e.ctrlKey || e.metaKey) { if (k === 'a') { e.preventDefault(); this.selectArmy(); } return; }
    if (k === 'a') this.sidebar.setAMove(this.toggleAMove());
    else if (k === 's') { this.cmd({ c: 'stop', ids: this.selIds() }); sfx.order(); }
    else if (k === 'u') this.upgradeSelected();
    else if (k === 'delete' || k === 'backspace') this.sellSelected();
    else if (k === 'r') this.repairSelected();
    else if (k === 'p') this.sidebar.setMode(false, false, this.toggleTgt('patrol'));
    else if (k === 'g') this.holdSelected();
    else if (k === 'l') this.unloadSelected();
    else if (k === 'e') this.selectSameType();
    else if (k === 'q') this.sidebar.setMode(false, this.toggleTgt('sp'));
    else if (k === 'h') { const b = this.world.entities.find(x => x.team === this.me && x.kind === 'conyard' && x.alive); if (b) this.centerOn(b.x, b.y); }
    else if (k === ' ') { const a = this.world.lastAlert[this.me]; if (a) this.centerOn(a.x, a.y); e.preventDefault(); }
    else if (k === 'escape') { this.endWallMode(); this.tgt = null; this.sidebar.setMode(false, false); this.cancelPlacement(); this.amove = false; this.sidebar.setAMove(false); this.selection = []; this.inspect = null; }
  }

  private toggleTgt(m: 'rally' | 'sp' | 'patrol'): boolean {
    sfx.click();
    if (this.tgt === m) { this.tgt = null; this.sidebar.setMode(false, false); return false; }
    if (m === 'sp') {
      const t = this.world.teams[this.me];
      if (!this.world.hasBuilding(this.me, 'radar')) { this.hud.toast('O superpoder requer uma Central de Radar', 2200); sfx.error(); this.sidebar.setMode(false, false); return false; }
      if (t.sp > 0) { this.hud.toast(`Superpoder recarregando: ${Math.ceil(t.sp)}s`, 1800); sfx.error(); this.sidebar.setMode(false, false); return false; }
      this.hud.toast(FACTIONS[t.faction].power === 'pulse' ? 'Toque no alvo do Pulso Orbital' : 'Toque no alvo da Barragem de Artilharia', 2400);
    } else if (m === 'patrol') {
      if (!this.movers().some(u => u.def.damage > 0)) { this.hud.toast('Selecione tropas armadas para patrulhar', 2000); sfx.error(); this.sidebar.setMode(false, false); return false; }
      this.hud.toast('Toque no destino: a patrulha vai e volta atacando', 2400);
    } else this.hud.toast('Toque no mapa: ponto de reunião das novas tropas', 2400);
    this.tgt = m; this.amove = false; this.sidebar.setAMove(false);
    this.sidebar.setMode(m === 'rally', m === 'sp', m === 'patrol');
    return true;
  }
  private holdSelected() {
    const ids = this.movers().filter(u => u.def.damage > 0).map(u => u.id);
    if (!ids.length) { this.hud.toast('Selecione tropas armadas', 1600); sfx.error(); return; }
    this.cmd({ c: 'hold', ids }); sfx.order(); this.hud.toast('Guardando posição: só atiram no que chega perto', 1800);
  }
  private unloadSelected() {
    const ids = this.movers().filter(u => u.kind === 'apc').map(u => u.id);
    if (!ids.length) { this.hud.toast('Selecione um Transporte Blindado', 1800); sfx.error(); return; }
    this.cmd({ c: 'unload', ids }); sfx.order();
  }
  private selectSameType() {
    const f = this.selection.find(e => e.alive && !e.building && e.team === this.me);
    if (!f) { sfx.error(); return; }
    this.selection = this.world.units(this.me).filter(u => u.kind === f.kind && this.onScreen(u.x, u.y));
    sfx.select(); this.hud.toast(`${this.selection.length}× ${f.def.name}`, 1200);
  }
  private repairSelected() {
    const bs = this.selection.filter(e => e.alive && e.building && e.team === this.me);
    if (!bs.length) { this.hud.toast('Selecione uma construção para reparar', 2000); sfx.error(); return; }
    this.cmd({ c: 'rep', ids: bs.map(b => b.id) }); sfx.ready();
  }

  private toggleAMove(): boolean {
    this.amove = !this.amove; sfx.click();
    if (this.amove) this.hud.toast('Toque no destino: as tropas atacam tudo pelo caminho', 2200);
    return this.amove;
  }

  private sellSelected() {
    const bs = this.selection.filter(e => e.alive && e.building && e.kind !== 'conyard' && e.team === this.me);
    if (!bs.length) { this.hud.toast('Selecione uma construção (exceto o Centro de Comando)', 2000); sfx.error(); return; }
    const total = bs.reduce((s, b) => s + Math.floor(b.def.cost * 0.5 * (1 + 0.5 * (b.tech - 1))), 0);
    this.cmd({ c: 'sell', ids: bs.map(b => b.id) });
    this.selection = this.selection.filter(e => !bs.includes(e));
    this.hud.toast(`Vendido: +${total} créditos`, 1800); sfx.sell();
  }
  private upgradable(): Entity[] {
    const lab = this.world.hasBuilding(this.me, 'lab');
    const seen = new Set<string>(); // uma por tipo: a evolução vale para todos do mesmo tipo
    return this.selection.filter(e => {
      if (!e.alive || e.team !== this.me || e.tech >= MAX_TECH || (e.tech >= 2 && !lab)) return false;
      const k = e.kind + e.tech; if (seen.has(k)) return false; seen.add(k); return true;
    });
  }
  private upgradeSelected() {
    const list = this.upgradable();
    if (!list.length) { if (this.selection.length) { this.hud.toast(this.selection.some(e => e.tech === 2) ? 'O Nível 3 requer um Laboratório Tecnológico' : 'Nível máximo', 2200); sfx.error(); } return; }
    let budget = this.world.teams[this.me].credits; const ids: number[] = [];
    for (const e of list) { const c = this.world.upgradeCost(e); if (budget >= c) { budget -= c; ids.push(e.id); } }
    if (!ids.length) { this.hud.toast('Créditos insuficientes', 1800); sfx.error(); return; }
    this.cmd({ c: 'up', ids }); sfx.upgrade(); this.runner?.note('upgrade');
    this.hud.toast('Evolução aplicada a todos do mesmo tipo', 1800);
  }
  private selectArmy() {
    const army = this.world.units(this.me).filter(u => COMBAT.includes(u.kind));
    this.selection = army; this.inspect = null; sfx.unlock();
    if (army.length) { sfx.select(); this.hud.toast(`${army.length} unidades de combate selecionadas`, 1500); }
    else { sfx.error(); this.hud.toast('Nenhuma tropa de combate', 1500); }
  }

  private refreshInfo() {
    const w = this.world;
    const sel = this.selection.filter(e => e.alive);
    const n = sel.length + (this.inspect && !sel.length ? 1 : 0);
    if (n !== this.deselN) { this.deselN = n; this.deselBtn.classList.toggle('hidden', n === 0); this.deselBtn.textContent = `✖ Desmarcar${sel.length > 1 ? ` (${sel.length})` : ''}`; }
    if (this.inspect && !this.inspect.alive) this.inspect = null;
    { const mine = sel.filter(e => e.team === this.me), ck = mine.map(e => e.kind).join();
      if (ck !== this.ctxKey) { this.ctxKey = ck; this.sidebar.setContext({ units: mine.filter(e => !e.building).length, buildings: mine.filter(e => e.building).length, producer: mine.some(e => e.kind === 'barracks' || e.kind === 'factory' || e.kind === 'helipad' || e.kind === 'conyard'), transport: mine.some(e => e.kind === 'apc') }); } }
    if (!sel.length && !this.inspect) { this.hud.setInfo(null); return; }
    if (this.inspect && !sel.length) {
      const e = this.inspect;
      this.hud.setInfo({ title: e.def.name, stars: e.tech, maxStars: MAX_TECH, rank: !e.building && e.vet > 1 ? VET_NAMES[e.vet - 1] : '', hp: e.hp, maxHp: e.maxHp, sub: 'Inimigo', upLabel: '', canUp: false, upNote: '', canSell: false, enemy: true });
      return;
    }
    const lab = w.hasBuilding(this.me, 'lab'), cr = w.teams[this.me].credits;
    const ups = this.upgradable(), total = ups.reduce((s, e) => s + w.upgradeCost(e), 0);
    const canSell = sel.some(e => e.building && e.kind !== 'conyard');
    if (sel.length === 1) {
      const e = sel[0], max = e.tech >= MAX_TECH, needLab = e.tech === 2 && !lab, cost = w.upgradeCost(e);
      this.hud.setInfo({
        title: e.def.name, stars: e.tech, maxStars: MAX_TECH, rank: !e.building ? VET_NAMES[e.vet - 1] : '', hp: e.hp, maxHp: e.maxHp,
        sub: !e.building ? `${e.kills} abates` : '',
        upLabel: max ? 'Nível máximo' : `⬆ Evoluir todos ★${e.tech + 1} · ◆${cost}`,
        canUp: !max && !needLab && cr >= cost, upNote: needLab ? 'Nível 3 exige Laboratório' : !e.building && !max && e.vet < 3 ? 'Mais abates = promoção automática' : '',
        canSell, enemy: false,
      });
    } else {
      const hp = sel.reduce((s, e) => s + e.hp, 0), mhp = sel.reduce((s, e) => s + e.maxHp, 0);
      this.hud.setInfo({
        title: `${sel.length} unidades`, stars: 0, maxStars: 0, rank: '', hp, maxHp: mhp, sub: '',
        upLabel: ups.length ? `⬆ Evoluir ${ups.length} ${ups.length > 1 ? 'tipos' : 'tipo'} · ◆${total}` : 'Nada a evoluir', canUp: ups.length > 0 && cr >= Math.min(...ups.map(e => w.upgradeCost(e))),
        upNote: '', canSell, enemy: false,
      });
    }
  }

  private renderMission() {
    const r = this.runner, m = this.opts.mission;
    if (!r || !m || !this.mEl) return;
    const c = r.c, cur = r.current(), rows = m.objectives.map(o => {
      const done = c.done.has(o.id), active = !done && (!m.sequential || cur === o);
      if (m.sequential && !done && !active) return '';
      const pr = !done && o.prog ? ` <em>${o.prog(c)}</em>` : '';
      return `<li class="${done ? 'ok' : active ? 'cur' : ''}"><i>${done ? '✔' : '◻'}</i><span>${o.text}${pr}</span></li>`;
    }).join('');
    const tm = m.timer?.(c);
    const html = `<div class="mh"><b>Missão ${m.n}</b> · ${m.title}</div>${tm ? `<div class="mtm">⏱ ${tm}</div>` : ''}<ul>${rows}</ul>${m.sequential && cur?.tip ? `<div class="mtip">💡 ${cur.tip}</div>` : ''}`;
    if (html !== this.mEl.dataset.h) { this.mEl.innerHTML = html; this.mEl.dataset.h = html; }
    if (c.done.size > this.lastDone) { if (this.lastDone > 0 || c.done.size > 0) { const last = [...c.done].pop(); const o = m.objectives.find(x => x.id === last); if (o) { this.banner('✔ ' + o.text, 'ok'); sfx.objective(); } } }
    this.lastDone = c.done.size;
    this.sidebar.highlight(m.sequential ? cur?.hl ?? null : null);
  }

  // ---------- pausa / fim ----------
  /** chamado pelo app nativo (botão Voltar, app em segundo plano) */
  get isPaused() { return this.paused; }
  pauseFromOS() { if (!this.paused && !this.over) this.pause(); }
  togglePause() { if (this.over) return; if (this.paused) { this.paused = false; this.hud.hidePanel(); } else this.pause(); }
  private pause() {
    if (this.role === 'solo') this.paused = true;
    this.hud.showPanel(this.role === 'solo' ? 'Pausado' : 'Menu', this.role === 'solo' ? 'A partida está em pausa.' : 'A partida online continua em andamento.', [
      { label: '▶ Continuar', fn: () => { this.paused = false; this.hud.hidePanel(); } },
      { label: '⚙ Opções', fn: () => this.options() },
      { label: '⟲ Sair da partida', cls: 'danger', fn: () => this.exit() },
    ]);
  }
  /** opções dentro da partida: cada botão alterna o valor e redesenha o painel */
  private options() {
    const s = Storage.data, save = () => { Storage.save(); this.options(); };
    const SP: [number, string][] = [[0.75, 'Lenta'], [1, 'Normal'], [1.35, 'Rápida'], [1.7, 'Muito rápida']];
    const HB: Record<string, string> = { hurt: 'Só danificados', always: 'Sempre', sel: 'Só seleção' };
    const cur = SP.find(x => x[0] === (s.gameSpeed || 1)) ?? SP[1];
    const btns: { label: string; cls?: string; fn: () => void }[] = [];
    if (this.role === 'solo') btns.push({ label: `⏱ Velocidade: ${cur[1]}`, fn: () => { s.gameSpeed = SP[(SP.indexOf(cur) + 1) % SP.length][0]; save(); } });
    btns.push(
      { label: `❤ Barras de vida: ${HB[s.hpBars] ?? HB.hurt}`, fn: () => { s.hpBars = s.hpBars === 'hurt' ? 'always' : s.hpBars === 'always' ? 'sel' : 'hurt'; save(); } },
      { label: `🧩 Modelos detalhados (teste): ${s.detailModels === false ? 'Desligados' : 'Ligados'} (vale para novas unidades)`, fn: () => { s.detailModels = s.detailModels === false; save(); } },
      { label: `🎙 Locutor e vozes: ${s.voice === false ? 'Desligado' : 'Ligado'}`, fn: () => { s.voice = s.voice === false; save(); } },
      { label: `💥 Tremor de tela: ${s.shake === false ? 'Desligado' : 'Ligado'}`, fn: () => { s.shake = s.shake === false; save(); } },
      { label: `🔊 Som: ${s.muted ? 'Mudo' : 'Ligado'}`, fn: () => { s.muted = !s.muted; sfx.setMuted(s.muted); music.setVolume(s.muted ? 0 : s.musicVolume); save(); } },
      { label: `🖥 Gráficos: ${{ auto: 'Automático', low: 'Baixo', med: 'Médio', high: 'Alto' }[s.quality]} (vale na próxima partida)`, fn: () => { const Q = ['auto', 'low', 'med', 'high'] as const; s.quality = Q[(Q.indexOf(s.quality) + 1) % Q.length]; save(); } },
      { label: '◀ Voltar', fn: () => this.pause() },
    );
    this.hud.showPanel('Opções', 'Ajustes valem imediatamente, exceto os gráficos.<br><small>Atalhos: P patrulha · G guardar · L descer · E selecionar iguais · Q poder · R reparar · Ctrl+1–9 grupos</small>', btns);
  }
  private exit() { this.opts.onExit(); }
  private finish() {
    this.over = true;
    const win = this.world.winner !== null && this.world.isAlly(this.me, this.world.winner);
    voice.say(win ? 'win' : 'lose');
    if (this.role === 'solo' && !this.opts.mission) { Storage.recordResult(win, this.opts.difficulty); Achievements.skirmishEnd(win, this.world.teams[this.me].faction, this.opts.difficulty, this.opts.mapId, this.world.time, this.world.teams[this.me].kills); }
    else Achievements.add('kills', this.world.teams[this.me].kills);
    if (win) sfx.win(); else sfx.lose();
    const t = Math.floor(this.world.time), k = this.world.teams[this.me].kills;
    const ms = this.opts.mission;
    if (ms && this.runner) {
      const stars = win ? this.runner.stars() : 0, nx = nextMission(ms);
      if (win) { Storage.completeMission(ms.id, stars); Achievements.campaign(); }
      const why = win ? (nx ? 'Missão cumprida! A próxima já está liberada.' : `Campanha concluída! ${FACTIONS[ms.faction].name} venceu a guerra.`) : (this.runner.reason || 'A missão falhou.');
      const btns = [] as { label: string; cls?: string; fn: () => void }[];
      if (win && nx && this.opts.onNext) btns.push({ label: Purchases.isLocked(nx) ? `🔓 Desbloquear: ${nx.title}` : `▶ Próxima: ${nx.title}`, fn: () => this.opts.onNext!(nx) });
      if (win && !nx && DEMO) btns.push({ label: '🏁 Concluir demo', fn: () => this.exit() });
      if (!win) btns.push({ label: '↻ Tentar de novo', fn: () => this.opts.onNext?.(ms) });
      btns.push({ label: '☰ Campanha', fn: () => this.exit() });
      this.hud.showPanel(win ? 'MISSÃO CUMPRIDA' : 'MISSÃO FALHOU', `${why}<br>${win ? '★'.repeat(stars) + '☆'.repeat(3 - stars) + ' · ' : ''}Tempo: ${Math.floor(t / 60)}m${String(t % 60).padStart(2, '0')}s · Baixas causadas: ${k}`, btns);
      return;
    }
    this.hud.showPanel(win ? 'VITÓRIA!' : 'DERROTA', `${win ? 'Todas as construções inimigas foram destruídas.' : 'Sua base foi destruída.'}<br>Tempo: ${Math.floor(t / 60)}m${String(t % 60).padStart(2, '0')}s · Baixas causadas: ${k}`, [
      { label: '⟲ Menu principal', fn: () => this.exit() },
    ]);
  }

  destroy() {
    if (this.cleaned) return;
    this.cleaned = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.input.destroy();
    tooltip.hide();
    try { this.opts.net?.close(); } catch { /* ignore */ }
    this.sidebar.destroy(); this.hud.destroy(); this.mEl?.remove(); music.stop(); sfx.ambience(false);
    for (const r of this.ents.values()) dispose(r.g);
    this.composer?.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); this.ov.remove(); this.vg?.remove();
  }

  // ---------- laço principal ----------
  private frame(t: number) {
    if (this.cleaned) return;
    this.raf = requestAnimationFrame(n => this.frame(n));
    const raw = (t - this.lastT) / 1000, dt = Math.min(raw, 0.05);
    this.lastT = t;
    this.clock += dt;
    this.autoQuality(raw);
    this.update(dt);
    this.applyCam();
    if (this.ctxLost) return;
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.cam);
    this.drawOverlay(dt);
  }

  private update(dt: number) {
    const w = this.world;
    this.keyPan(dt);
    if (this.role === 'guest') w.mirrorTick(dt);
    const sdt = this.role === 'solo' ? dt * (Storage.data.gameSpeed || 1) : dt;
    if (this.role === 'guest') { /* espelho */ }
    else if (!this.paused && !this.over) w.update(sdt);
    if (this.runner && !this.paused && !this.over) {
      this.runner.update(sdt);
      if (!this.runner.c.ev.has('pan') && Math.hypot(this.target.x - this.startTarget.x, this.target.z - this.startTarget.z) > 120) this.runner.note('pan');
    }
    this.mT += dt; if (this.mEl && this.mT > 0.25) { this.mT = 0; this.renderMission(); }
    if (this.role === 'host') this.netHost(dt);
    this.syncEntities(dt);
    this.processFx();
    this.updateProjectiles();
    this.updateParts(dt);
    this.juice(dt);
    this.updateHusks(dt); this.updateScorches(dt); this.updateTracks(dt);
    if (this.crystalRev !== w.crystalRev) { this.crystalRev = w.crystalRev; this.rebuildCrystals(); }
    (this.crystalGlow.material as THREE.PointsMaterial).opacity = 0.18 + 0.08 * Math.sin(this.clock * 2.4);
    this.fogT += dt;
    if (this.fogT > 0.2) { this.fogT = 0; this.drawFog(); }
    for (const m of w.messages.splice(0)) { if (m.team === this.me) this.hud.toast(m.text); else if (this.role === 'host') this.outMsg.push(m); }
    for (const s of w.sounds.splice(0)) {
      if (s.team !== this.me) { if (this.role === 'host') this.outSnd.push(s); continue; }
      if (s.s === 'alert') sfx.alert(); else if (s.s === 'lowpower') sfx.lowPower(); else if (s.s === 'ready') sfx.ready(); else if (s.s === 'rank') sfx.rank(); else sfx.wave();
      if (s.s === 'rank' && w.entities.some(e => e.team === this.me && e.alive && e.vet >= 3)) Achievements.unlock('elite');
      if (s.s === 'ready' && s.k) { const d = DEFS[s.k]; voice.say(d.building ? 'built' : d.category === 'infantry' ? 'inf' : d.category === 'air' ? 'air' : 'veh'); }
      else voice.say(s.s === 'alert' ? 'attack' : s.s);
    }
    { const sp = w.teams[this.me].sp; if (this.spPrev > 0 && sp <= 0 && !w.noSuper && w.hasBuilding(this.me, 'radar')) voice.say('spready'); this.spPrev = sp; }
    this.selection = this.selection.filter(e => e.alive);
    this.uiT += dt;
    if (this.uiT > 0.1) {
      this.uiT = 0;
      this.sidebar.update(this.viewRect());
      this.refreshInfo();
      if (this.placing) this.hud.showPlacement(DEFS[this.placing].name, this.placeValid());
    }
    if (w.winner !== null && !this.over) this.finish();
  }

  private keyPan(dt: number) {
    const k = this.input.keys, sp = this.camDist * 1.3 * dt;
    let dx = 0, dz = 0;
    if (k.has('arrowleft') || k.has('a') && false) dx -= 1;
    if (k.has('arrowright')) dx += 1;
    if (k.has('arrowup')) dz -= 1;
    if (k.has('arrowdown')) dz += 1;
    if (k.has('w')) dz -= 1; if (k.has('d')) dx += 1;
    const m = this.input.mouse;
    if (!m.touch && m.inside && !this.box) {
      const e = 8;
      if (m.x >= 0 && m.x < e) dx -= 1; else if (m.x > this.W - e) dx += 1;
      if (m.y >= 0 && m.y < e) dz -= 1; else if (m.y > this.H - e) dz += 1;
    }
    if (dx || dz) { this.target.x += dx * sp; this.target.z += dz * sp * 1.2; }
  }

  private netHost(dt: number) {
    const net = this.opts.net;
    if (!net) return;
    const w = this.world;
    for (const f of w.fx) { if (this.outFx.length < 80) this.outFx.push(f); }
    this.snapT += dt; this.crystalSendT += dt;
    if (this.snapT >= 0.1) {
      this.snapT = 0;
      const s = w.serialize();
      s.fx = this.outFx.splice(0); s.m = this.outMsg.splice(0); s.s = this.outSnd.splice(0);
      net.send({ t: 'snap', s });
    }
    if (this.crystalSendT >= 1.5) {
      this.crystalSendT = 0;
      if (this.lastCrystalRev !== w.crystalRev) { this.lastCrystalRev = w.crystalRev; net.send({ t: 'crystal', a: w.crystalSnap() }); }
    }
  }

  /** voo de aviões: nunca param no ar. Circulam em volta da posição lógica (patrulha) e fecham a curva
   *  em passadas de ataque, com inclinação nas curvas (comportamento de "seek" a um ponto em órbita). */
  private fly(e: Entity, r: Rec, dt: number) {
    const bomber = e.kind === 'bomber', R = bomber ? 85 : 60, spd = bomber ? 95 : 165, alt = bomber ? 74 : 58;
    if (r.fx === undefined) { r.fx = e.x; r.fz = e.y; r.hd = e.angle; r.bank = 0; r.ph = Math.random() * 6.28; }
    const fighting = !!e.auto || e.order.t === 'attack', rad = fighting ? R * 0.55 : R;
    r.ph! += (spd / rad) * dt * 0.9;
    const cx = e.x + Math.cos(r.ph!) * rad, cz = e.y + Math.sin(r.ph!) * rad;
    let d = Math.atan2(cz - r.fz!, cx - r.fx!) - r.hd!;
    while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832;
    const maxT = (bomber ? 1.3 : 2.5) * dt, turn = Math.max(-maxT, Math.min(maxT, d));
    r.hd! += turn;
    const v = spd * (Math.hypot(e.x - r.fx!, e.y - r.fz!) > R * 2.5 ? 1.4 : 1);
    r.fx! += Math.cos(r.hd!) * v * dt; r.fz! += Math.sin(r.hd!) * v * dt;
    const bankT = Math.max(-0.75, Math.min(0.75, (turn / Math.max(dt, 1e-3)) * 0.4));
    r.bank! += (bankT - r.bank!) * Math.min(1, dt * 4);
    r.g.rotation.order = 'YXZ'; r.g.rotation.set(r.bank!, -r.hd!, 0);
    r.g.position.set(r.fx!, alt + Math.sin(this.clock * 1.3 + e.id) * 2, r.fz!);
    if (this.q !== 'low' && Math.random() < dt * 14) this.emit('smoke', r.fx! - Math.cos(r.hd!) * (bomber ? 30 : 20), alt, r.fz! - Math.sin(r.hd!) * (bomber ? 30 : 20), { s0: 3, s1: 9, life: 0.7, a: 0.28, color: 0xd8d4cc });
  }

  // ---- marcas de esteira dinâmicas: veículos deixam rastro no chão, que desbota com o tempo ----
  private trackCtx: CanvasRenderingContext2D | null = null;
  private trackTex: THREE.CanvasTexture | null = null;
  private trackT = 0; private trackFade = 0; private trackDirty = false;
  private initTracks() {
    if (this.q === 'low') return;
    const cv = document.createElement('canvas'); cv.width = cv.height = 1024; this.trackCtx = cv.getContext('2d')!;
    this.trackTex = new THREE.CanvasTexture(cv); this.trackTex.colorSpace = THREE.SRGBColorSpace;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), new THREE.MeshBasicMaterial({ map: this.trackTex, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    pl.rotation.x = -Math.PI / 2; pl.position.set(WORLD_W / 2, 0.3, WORLD_H / 2); pl.renderOrder = 0; this.scene.add(pl);
  }
  private stampTrack(e: Entity, r: Rec) {
    const c = this.trackCtx; if (!c) return;
    if (r.tsx === undefined) { r.tsx = e.x; r.tsz = e.y; return; }
    if (Math.hypot(e.x - r.tsx, e.y - r.tsz!) < 7) return;
    r.tsx = e.x; r.tsz = e.y;
    const k = 1024 / WORLD_W, half = e.radius * 0.6, wheels = e.kind === 'buggy' || e.kind === 'raider' || e.kind === 'mlrs' || e.kind === 'harvester';
    c.save(); c.translate(e.x * k, e.y * k); c.rotate(e.angle); c.fillStyle = wheels ? 'rgba(34,28,20,0.16)' : 'rgba(30,24,16,0.24)';
    for (const sd of [-1, 1]) { c.fillRect(-3.5 * k, (sd * half - (wheels ? 1 : 2)) * k, 7 * k, (wheels ? 2 : 4) * k); if (!wheels) { c.fillStyle = 'rgba(18,14,10,0.18)'; c.fillRect(-1 * k, (sd * half - 2) * k, 1.4 * k, 4 * k); c.fillStyle = 'rgba(30,24,16,0.24)'; } }
    c.restore(); this.trackDirty = true;
  }
  private updateTracks(dt: number) {
    const c = this.trackCtx; if (!c || !this.trackTex) return;
    this.trackFade += dt;
    if (this.trackFade > 6) { this.trackFade = 0; c.globalCompositeOperation = 'destination-out'; c.fillStyle = 'rgba(0,0,0,0.07)'; c.fillRect(0, 0, 1024, 1024); c.globalCompositeOperation = 'source-over'; this.trackDirty = true; }
    this.trackT += dt;
    if (this.trackDirty && this.trackT > 0.4) { this.trackT = 0; this.trackDirty = false; this.trackTex.needsUpdate = true; }
  }

  private husks: { g: THREE.Group; t: number; life: number; big: boolean; x: number; z: number; inf?: number }[] = [];
  /** soldado abatido: cai de lado, fica alguns segundos e afunda no chão */
  private makeBody(g: THREE.Group) {
    g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = false; });
    this.husks.push({ g, t: 0, life: this.q === 'low' ? 4 : 9, big: false, x: g.position.x, z: g.position.z, inf: Math.random() < 0.5 ? 1 : -1 });
    if (this.husks.length > (this.q === 'low' ? 10 : 40)) { const o = this.husks.shift()!; this.scene.remove(o.g); dispose(o.g); }
  }
  private charMat = new THREE.MeshStandardMaterial({ color: '#4a433b', roughness: 0.92, metalness: 0.35, emissive: '#3a1404', emissiveIntensity: 0.25 });
  /** o que foi destruído não some: vira carcaça queimada (veículo) ou escombros (prédio), com fogo e fumaça */
  private makeHusk(g: THREE.Group, building: boolean) {
    g.traverse(o => {
      const m = o as THREE.Mesh;
      if ((o as THREE.LineSegments).isLineSegments) { o.visible = false; return; }
      if (m.isMesh) { const mt = m.material as THREE.MeshStandardMaterial; if (mt.transparent || (mt.emissiveIntensity ?? 0) > 0.3) m.visible = false; else m.material = this.charMat; m.castShadow = false; }
    });
    if (building) { g.scale.y = 0.32; g.rotation.z = rnd(-0.05, 0.05); }
    else { g.rotation.z = rnd(-0.08, 0.08); g.rotation.x = rnd(-0.06, 0.06); g.position.y = 0; }
    const life = this.q === 'low' ? 14 : building ? 45 : 30;
    this.husks.push({ g, t: 0, life, big: building, x: g.position.x, z: g.position.z });
    if (this.husks.length > (this.q === 'low' ? 10 : 28)) { const o = this.husks.shift()!; this.scene.remove(o.g); dispose(o.g); }
  }
  private updateHusks(dt: number) {
    for (let i = this.husks.length - 1; i >= 0; i--) {
      const h = this.husks[i]; h.t += dt;
      if (h.inf) {
        const k = Math.min(1, h.t / 0.35); h.g.rotation.x = h.inf * k * k * 1.45; h.g.position.y = Math.max(0, 2.5 * (1 - k)) + (h.t > h.life - 2 ? -(h.t - h.life + 2) * 3 : 0);
        if (h.t > h.life) { this.scene.remove(h.g); dispose(h.g); this.husks.splice(i, 1); }
        continue;
      }
      const fire = h.t < h.life * 0.45, near = this.nearCam(h.x, h.z);
      if (near && Math.random() < dt * (fire ? 6 : 2.5)) this.emit('smoke', h.x + rnd(-8, 8), 12, h.z + rnd(-8, 8), { vx: rnd(-4, 4), vy: rnd(14, 26), vz: rnd(-4, 4), s0: 10, s1: h.big ? 46 : 30, life: 2.4, a: 0.42, color: 0x2a2622 });
      if (near && fire && Math.random() < dt * (h.big ? 9 : 5)) this.emit('fire', h.x + rnd(-10, 10), 6 + rnd(0, 6), h.z + rnd(-10, 10), { vy: rnd(10, 22), s0: 9, s1: 3, life: 0.45, a: 0.9, color: Math.random() < 0.5 ? 0xff8a2a : 0xffc060 });
      if (h.t > h.life - 4) h.g.position.y -= dt * (h.big ? 5 : 3);
      if (h.t > h.life) { this.scene.remove(h.g); dispose(h.g); this.husks.splice(i, 1); }
    }
  }

  // ---- 3) marcas de explosão no chão (decalques reaproveitados) ----
  private scorches: { m: THREE.Mesh; t: number }[] = [];
  private scorchTex: THREE.CanvasTexture | null = null;
  private scorch(x: number, z: number, s: number) {
    if (!this.scorchTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
      const r = g.createRadialGradient(64, 64, 4, 64, 64, 62); r.addColorStop(0, 'rgba(8,6,4,0.95)'); r.addColorStop(0.45, 'rgba(22,18,14,0.75)'); r.addColorStop(0.8, 'rgba(40,34,26,0.25)'); r.addColorStop(1, 'rgba(40,34,26,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, l = 30 + Math.random() * 30; g.strokeStyle = 'rgba(10,8,6,0.18)'; g.lineWidth = 3 + Math.random() * 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); g.stroke(); }
      this.scorchTex = new THREE.CanvasTexture(c);
    }
    const max = this.q === 'low' ? 24 : 70;
    let o = this.scorches.length < max ? null : this.scorches.shift()!;
    if (!o) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false })); m.renderOrder = 1; this.scene.add(m); o = { m, t: 0 }; }
    const sz = 22 + s * 30; o.m.scale.set(sz, 1, sz); o.m.rotation.y = rnd(0, 6.28); o.m.position.set(x, 0.45, z); o.t = 0;
    (o.m.material as THREE.MeshBasicMaterial).opacity = 0.85; this.scorches.push(o);
  }
  private updateScorches(dt: number) { for (const o of this.scorches) { o.t += dt; (o.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 0.85 - o.t / 120); } }

  // ---------- entidades 3D ----------
  /** marca de time no chão (anel luminoso) e estandarte nos prédios: só quando 3+ times ou facções repetidas */
  private get teamMarks(): boolean {
    const a = this.world.active; if (a.length > 2) return true;
    return new Set(a.map(t => this.world.teams[t].faction)).size < a.length;
  }
  private addTeamMark(g: THREE.Group, e: Entity) {
    const col = TEAM_COLORS[e.team]?.main; if (!col) return;
    const bb = new THREE.Box3().setFromObject(g), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const rad = e.building ? Math.max(sz.x, sz.z) * 0.5 : Math.max(sz.x, sz.z) * 0.5 + 2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(rad, rad + (e.building ? 1.6 : 1.1), 28), mat(col, { emissive: col, ei: 0.45, grain: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, 0.7, c.z); ring.userData.teamMark = true; g.add(ring);
    if (e.building) { // estandarte no canto do telhado
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 6), mat('#222', { grain: false }));
      const flag = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 0.8), mat(col, { emissive: col, ei: 0.5, grain: false }));
      pole.position.set(bb.max.x - 3, bb.max.y + 7, bb.min.z + 3); flag.position.set(bb.max.x + 1.5, bb.max.y + 11, bb.min.z + 3);
      g.add(pole, flag);
    }
  }

  private syncEntities(dt: number) {
    const w = this.world, seen = new Set<number>();
    this.engAcc = [0, 0, 0];
    for (const e of w.entities) {
      if (!e.alive) continue;
      seen.add(e.id);
      let r = this.ents.get(e.id);
      if (r && (r.tm !== e.team || r.fc !== e.faction)) { this.scene.remove(r.g); dispose(r.g); this.ents.delete(e.id); r = undefined; if (e.building) { this.banner(e.team === this.me ? 'CONSTRUÇÃO CAPTURADA' : 'CONSTRUÇÃO PERDIDA', e.team === this.me ? 'gold' : 'red'); sfx.objective(); voice.say(e.team === this.me ? 'captured' : 'bldlost'); if (e.team === this.me) Achievements.unlock('capture'); } }
      if (!r) {
        const g = buildModel(e.kind, e.faction, this.q !== 'low');
        g.userData.eid = e.id;
        if (this.teamMarks) this.addTeamMark(g, e);
        r = { g, t0: this.clock, lx: e.x, ly: e.y, dust: 0, h: g.userData.h ?? 20, head: g.userData.head, spin: g.userData.spin, spinSpeed: g.userData.spinSpeed ?? 0, spinObj: g.userData.spinObj, axis: g.userData.spinAxis ?? 'y', legs: g.userData.legs, barrel: g.userData.barrel, barrelX: g.userData.barrel ? g.userData.barrel.position.x : 0, kick: 0, phase: Math.random() * 6, moving: 0, tm: e.team, fc: e.faction, e };
        this.scene.add(g); this.ents.set(e.id, r);
        if (e.building && this.clock > 2) { for (let i = 0; i < 6; i++) this.puff(e.x + rnd(-e.def.w * 14, e.def.w * 14), 3, e.y + rnd(-e.def.h * 14, e.def.h * 14), 0xb7a98a); }
      }
      const vis = w.isVisible(e);
      r.g.visible = vis;
      if (!vis) { r.lx = e.x; r.ly = e.y; continue; }
      const air = e.def.armor === 'air';
      r.g.position.set(e.x, air ? 42 + Math.sin(this.clock * 2 + e.id) * 1.6 : 0, e.y);
      if (r.head) r.head.rotation.y = -e.angle;
      else if (!e.building) r.g.rotation.y = -e.angle;
      if (e.kind === 'jet' || e.kind === 'bomber') this.fly(e, r, dt);
      if (e.building) { const k = Math.min(1, (this.clock - r.t0) / 0.7); r.g.scale.y = this.clock - r.t0 < 0.7 && this.clock > 2 ? Math.max(0.05, k * (2 - k)) : 1; }
      if (r.spin) r.spin.rotation.y += dt * r.spinSpeed * (air ? 1 : 1);
      if (r.spinObj) r.spinObj.rotation[r.axis] += dt * (r.axis === 'y' ? 2 : r.moving > 0.5 || e.cargo < 300 ? 5 : 0);
      // movimento: poeira, pernas, balanço e recuo
      const mv = Math.hypot(e.x - r.lx, e.y - r.ly) / Math.max(dt, 0.001);
      r.moving += ((mv > 14 ? 1 : 0) - r.moving) * Math.min(1, dt * 8);
      if (!e.building && r.moving > 0.4 && e.team >= 0 && this.nearCam(e.x, e.y)) { if (e.def.category === 'vehicle') this.engAcc[0]++; else if (air) { if (e.kind === 'jet' || e.kind === 'bomber') this.engAcc[2]++; else this.engAcc[1]++; } }
      if (!e.building && !air && e.def.category === 'vehicle' && r.moving > 0.4) this.stampTrack(e, r);
      if (!e.building && !air) {
        r.phase += dt * Math.min(mv, 70) * 0.22;
        if (r.legs) {
          const sw = Math.sin(r.phase * 2.2) * 0.75 * r.moving;
          r.legs[0].rotation.z = sw; r.legs[1].rotation.z = -sw;
          r.g.position.y = Math.abs(Math.sin(r.phase * 2.2)) * 1.1 * r.moving;
        } else if (e.def.category === 'vehicle') {
          r.g.rotation.z = Math.sin(this.clock * 9 + e.id) * 0.012 * r.moving;
          r.g.position.y = Math.abs(Math.sin(r.phase * 1.3)) * 0.5 * r.moving;
        }
        r.dust -= dt;
        if (mv > 22 && r.dust <= 0 && e.def.category === 'vehicle' && this.nearCam(e.x, e.y)) { r.dust = 0.12; this.puff(e.x - Math.cos(e.angle) * 16, 2, e.y - Math.sin(e.angle) * 16, 0xa89c80, 0.55); }
      }
      if (air) { r.g.rotation.z = THREE.MathUtils.lerp(r.g.rotation.z, mv > 20 ? -0.14 : 0, 0.08); r.g.rotation.x = Math.sin(this.clock * 1.7 + e.id) * 0.02; }
      if (r.barrel) { r.kick = Math.max(0, r.kick - dt * 5); r.barrel.position.x = r.barrelX - r.kick * (e.kind === 'artillery' ? 7 : 4); }
      else if (r.legs) {
        // infantaria: recuo do tiro (inclina para trás) e postura agachada ao disparar parada
        r.kick = Math.max(0, r.kick - dt * 6);
        r.g.rotation.z = r.kick * 0.28 + (r.moving < 0.3 && e.cooldown > 0 ? 0.05 : 0);
        if (r.moving < 0.3) r.g.position.y = -r.kick * 0.8;
      }
      r.lx = e.x; r.ly = e.y;
    }
    for (const [id, r] of this.ents) if (!seen.has(id)) {
      const d = r.e, dead = d && d.hp <= 0 && r.g.visible && d.def.armor !== 'air' && (d.building || d.def.category === 'vehicle') && d.kind !== 'wall';
      if (d && d.hp <= 0 && r.g.visible && d.def.category === 'infantry') { this.makeBody(r.g); sfx.die(this.spat(d.x, d.y)); if (d.team === this.me) voice.say('lost'); }
      else if (dead) { this.makeHusk(r.g, d!.building); if (d!.team === this.me) voice.say(d!.building ? 'bldlost' : 'lost'); } else { this.scene.remove(r.g); dispose(r.g); }
      this.ents.delete(id);
    }
    if (this.dust) {
      const a = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        a.setX(i, a.getX(i) + dt * 9); a.setY(i, a.getY(i) + Math.sin(this.clock * 0.6 + i) * dt * 2);
        if (a.getX(i) > WORLD_W) a.setX(i, 0);
      }
      a.needsUpdate = true;
    }
    // fumaça em construções danificadas
    this.smokeT += dt;
    if (this.smokeT > 0.28) {
      this.smokeT = 0;
      for (const wk of this.wrecks) if (Math.random() < 0.35 && this.nearCam(wk.x, wk.z) && this.q !== 'low') this.emit('smoke', wk.x + rnd(-4, 4), 12, wk.z + rnd(-4, 4), { vy: rnd(10, 18), vx: rnd(2, 7), s0: 5, s1: 18, life: 2.4, a: 0.3, color: 0x2e2a26 });
      for (const e of w.entities) {
        if (e.alive && !e.building && e.def.category === 'vehicle' && e.hp < e.maxHp * 0.5 && w.isVisible(e) && this.nearCam(e.x, e.y)) {
          this.emit('smoke', e.x + rnd(-4, 4), 14, e.y + rnd(-4, 4), { vx: rnd(-3, 3), vy: rnd(16, 26), vz: rnd(-3, 3), s0: 6, s1: 22, life: 1.6, a: 0.5, color: 0x1e1b18 });
          if (e.hp < e.maxHp * 0.22) this.emit('fire', e.x + rnd(-4, 4), 12, e.y + rnd(-4, 4), { vy: rnd(8, 14), s0: 7, s1: 2, life: 0.35, a: 0.9, color: 0xff7a24 });
          continue;
        }
        if (!e.alive || !e.building || e.hp > e.maxHp * 0.45 || !w.isVisible(e) || !this.nearCam(e.x, e.y)) continue;
        const x = e.x + rnd(-e.def.w * 11, e.def.w * 11), z = e.y + rnd(-e.def.h * 11, e.def.h * 11), crit = e.hp < e.maxHp * 0.22;
        this.emit('smoke', x, 18, z, { vy: rnd(14, 24), vx: rnd(-3, 5), s0: 7, s1: 24, life: 1.8, a: 0.55, color: crit ? 0x1c120c : 0x3a3a3a });
        if (crit) this.emit('fire', x, 14, z, { vy: rnd(8, 16), s0: 9, s1: 3, life: 0.5, a: 0.9, color: 0xff8a2a });
      }
    }
  }
  /** Panorama (esquerda/direita) e volume pela posição na tela: o som de longe é mais baixo. */
  private spat(x: number, y: number): Spatial {
    const dx = x - this.target.x, dist = Math.hypot(dx, y - this.target.z);
    return { pan: Math.max(-1, Math.min(1, dx / (this.camDist * 1.1))), gain: Math.max(0.25, Math.min(1, 1.15 - dist / (this.camDist * 1.7))) };
  }
  private ctxKey = '\u0000';
  private engT = 0; private engH = 0; private engJ = 0; private engAcc = [0, 0, 0];
  private nearCam(x: number, y: number) { return Math.hypot(x - this.target.x, y - this.target.z) < this.camDist * 1.6; }

  // ---------- cristais / névoa ----------
  private rebuildCrystals() {
    const w = this.world, m = new THREE.Matrix4(), pos: number[] = [];
    let n = 0;
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < MAP_W * MAP_H && n < 2380; i++) {
      const a = w.crystal[i];
      if (a < 10 || !w.explored[i]) continue;
      const x = (i % MAP_W) * TILE, y = Math.floor(i / MAP_W) * TILE, f = Math.min(1, a / 300), k = f > 0.6 ? 3 : f > 0.25 ? 2 : 1;
      for (let j = 0; j < k; j++) {
        const hx = Math.sin(i * 12.9 + j * 78.2) * 0.5 + 0.5, hy = Math.sin(i * 39.3 + j * 11.1) * 0.5 + 0.5, hz = Math.sin(i * 7.7 + j * 3.1) * 0.5 + 0.5;
        const s = 3.2 + f * 3.6 + hz * 1.5;
        p.set(x + 6 + hx * (TILE - 12), s, y + 6 + hy * (TILE - 12));
        q.setFromEuler(new THREE.Euler((hz - 0.5) * 0.5, hx * 6, (hy - 0.5) * 0.5));
        sc.set(s * 0.9, s * 1.05, s * 0.9);
        m.compose(p, q, sc); this.crystalInst.setMatrixAt(n++, m);
      }
      pos.push(x + TILE / 2, 6, y + TILE / 2);
    }
    this.crystalInst.count = n; this.crystalInst.instanceMatrix.needsUpdate = true;
    // brilho no chão sob cada casa de cristal e luzes pontuais nos maiores campos
    let g2 = 0; const cells = new Map<number, { x: number; y: number; n: number }>();
    for (let k = 0; k < pos.length && g2 < 1200; k += 3) {
      m.compose(p.set(pos[k], 0.6, pos[k + 2]), q.identity(), sc.set(TILE * 1.9, 1, TILE * 1.9)); this.crystalPool.setMatrixAt(g2++, m);
      const key = Math.floor(pos[k] / 320) * 100 + Math.floor(pos[k + 2] / 320), c = cells.get(key) ?? { x: 0, y: 0, n: 0 }; c.x += pos[k]; c.y += pos[k + 2]; c.n++; cells.set(key, c);
    }
    this.crystalPool.count = g2; this.crystalPool.instanceMatrix.needsUpdate = true;
    [...cells.values()].sort((a2, b2) => b2.n - a2.n).forEach((c, i) => { const l = this.crystalLights[i]; if (l) { l.position.set(c.x / c.n, 22, c.y / c.n); l.intensity = Math.min(1, c.n / 8) * 7; } });
    this.crystalGlow.geometry.dispose();
    this.crystalGlow.geometry = new THREE.BufferGeometry();
    this.crystalGlow.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }

  private drawFog() {
    const w = this.world, ctx = this.fogCtx;
    const img = ctx.createImageData(MAP_W, MAP_H);
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      img.data[i * 4] = 9; img.data[i * 4 + 1] = 8; img.data[i * 4 + 2] = 6;
      img.data[i * 4 + 3] = w.visible[i] ? 0 : w.explored[i] ? 120 : 255;
    }
    ctx.putImageData(img, 0, 0);
    this.fogTex.needsUpdate = true;
    let ex = 0; for (let i = 0; i < MAP_W * MAP_H; i++) ex += w.explored[i];
    if (ex !== this.exploredN) { this.exploredN = ex; this.crystalRev = -1; }
  }

  // ---------- efeitos ----------
  private processFx() {
    const w = this.world;
    for (const f of w.fx.splice(0)) {
      const near = this.nearCam(f.x, f.y);
      if (f.t === 'rank') { this.rankFx(f.x, f.y, f.v); if (near) sfx.rank(); continue; }
      if (!near) continue;
      if (f.t === 'boom') { sfx.boom(f.s, this.spat(f.x, f.y)); this.explosion(f.x, f.y, f.s); this.combat = Math.min(1, this.combat + 0.18 + f.s * 0.08); }
      else if (f.t === 'muzzle') { this.kickNear(f.x, f.y); sfx.shoot(f.k, this.spat(f.x, f.y)); this.muzzle(f.x, f.y, f.a, f.k); this.combat = Math.min(1, this.combat + 0.012); }
      else { sfx.hit(this.spat(f.x, f.y)); this.hitSparks(f.x, f.y); this.combat = Math.min(1, this.combat + 0.03); }
    }
  }

  private kickNear(x: number, y: number) {
    let best: Rec | null = null, bd = 34 * 34;
    for (const [id, r] of this.ents) {
      if (!r.barrel && !r.legs) continue;
      const dx = r.g.position.x - x, dz = r.g.position.z - y, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = r; void id; }
    }
    if (best) best.kick = 1;
  }

  private emit(kind: 'fire' | 'smoke' | 'ring' | 'star', x: number, y: number, z: number, o: { vx?: number; vy?: number; vz?: number; s0?: number; s1?: number; life?: number; a?: number; color?: number; spin?: number; tex?: THREE.Texture; g?: number } = {}) {
    let p = this.parts.find(q => !q.active);
    if (!p) {
      if (this.parts.length >= this.partMax) return;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.visible = false; this.scene.add(s);
      p = { g: 0, s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, a0: 1, add: true, spin: 0, active: false };
      this.parts.push(p);
    }
    const m = p.s.material as THREE.SpriteMaterial;
    const add = kind === 'fire' || kind === 'ring';
    m.map = o.tex ?? (kind === 'smoke' ? this.texSmoke : kind === 'ring' ? this.texRing : this.texGlow);
    m.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.color.set(o.color ?? 0xffffff); m.needsUpdate = true;
    Object.assign(p, { g: o.g ?? 0, life: 0, max: o.life ?? 1, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, s0: o.s0 ?? 8, s1: o.s1 ?? 8, a0: o.a ?? 1, add, spin: o.spin ?? 0, active: true });
    p.s.position.set(x, y, z); p.s.visible = true; m.opacity = p.a0; p.s.scale.setScalar(p.s0);
    m.rotation = Math.random() * 6;
  }
  private puff(x: number, y: number, z: number, color = 0xa89c80, a = 0.5) {
    this.emit('smoke', x, y, z, { vx: rnd(-6, 6), vy: rnd(5, 12), vz: rnd(-6, 6), s0: 6, s1: 18, life: 0.9, a, color });
  }
  private updateParts(dt: number) {
    for (const p of this.parts) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.max) { p.active = false; p.s.visible = false; continue; }
      const k = p.life / p.max, m = p.s.material as THREE.SpriteMaterial;
      if (p.g) { p.vy -= p.g * dt; if (p.s.position.y < 1 && p.vy < 0) { p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; p.s.position.y = 1; } }
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * k);
      m.opacity = p.a0 * (1 - k) * (p.add ? 1 : Math.min(1, k * 8));
      m.rotation += p.spin * dt;
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]; d.t += dt;
      (d.m.material as THREE.MeshBasicMaterial).opacity = 0.42 * Math.max(0, 1 - d.t / 18);
      if (d.t > 18) { this.scene.remove(d.m); d.m.geometry.dispose(); (d.m.material as THREE.Material).dispose(); this.decals.splice(i, 1); }
    }
  }
  private explosion(x: number, y: number, s: number) {
    if (s >= 1.4 && this.nearCam(x, y)) haptic(s >= 2.2);
    if (s >= 0.6) this.scorch(x, y, s);
    this.emit('fire', x, 10, y, { s0: 16 * s, s1: 54 * s, life: 0.3, a: 1, color: 0xfff1a8 });
    for (let i = 0; i < 6 + s * 3; i++) this.emit('fire', x + rnd(-8, 8) * s, 8 + rnd(0, 12) * s, y + rnd(-8, 8) * s, { vx: rnd(-26, 26) * s, vy: rnd(12, 50) * s, vz: rnd(-26, 26) * s, s0: 18 * s, s1: 38 * s, life: rnd(0.35, 0.75), a: 0.95, color: i % 3 === 0 ? 0xff4a1a : i % 2 ? 0xff7a2a : 0xffb347 });
    for (let i = 0; i < 5 + s * 2; i++) this.emit('smoke', x + rnd(-10, 10), 10 + rnd(0, 10), y + rnd(-10, 10), { vx: rnd(-16, 16), vy: rnd(14, 38), vz: rnd(-16, 16), s0: 14 * s, s1: 46 * s, life: rnd(1.2, 2.4), a: 0.65, color: 0x242424 });
    // faíscas com gravidade
    for (let i = 0; i < 10 + s * 5; i++) { const a = rnd(0, 6.28), v = rnd(50, 150) * Math.min(1.8, s); this.emit('fire', x, 10, y, { vx: Math.cos(a) * v, vy: rnd(50, 140), vz: Math.sin(a) * v, s0: 4, s1: 1.2, life: rnd(0.4, 0.9), a: 1, color: 0xffc766, g: 260 }); }
    // destroços
    if (s >= 0.9) for (let i = 0; i < 5 + s * 4; i++) { const a = rnd(0, 6.28), v = rnd(40, 110) * Math.min(1.6, s); this.emit('star', x, 12, y, { vx: Math.cos(a) * v, vy: rnd(70, 170), vz: Math.sin(a) * v, s0: rnd(4, 8), s1: rnd(3, 6), life: rnd(0.9, 1.6), a: 1, tex: this.texChip, g: 300, spin: rnd(-8, 8) }); }
    this.emit('ring', x, 2, y, { s0: 10 * s, s1: 90 * s, life: 0.45, a: 0.8, color: 0xffd9a0 });
    if (s >= 1.4) this.emit('ring', x, 2, y, { s0: 6 * s, s1: 130 * s, life: 0.7, a: 0.5, color: 0xff9a50 });
    // tremor e luz proporcionais à distância da câmera
    const k = Math.max(0, 1 - Math.hypot(x - this.target.x, y - this.target.z) / (this.camDist * 1.1));
    this.shake = Math.min(3.2, this.shake + s * 0.45 * k);
    if (s >= 1.4 && k > 0.2) this.flashA = Math.min(0.55, this.flashA + 0.12 * s * k);
    const L = this.lights.find(l => l.t <= 0) ?? this.lights[0];
    if (L) { L.l.position.set(x, 38, y); L.l.intensity = 5 + s * 3; L.t = 0.35; }
    if (this.decals.length < 40) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(10 * s, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
      m.position.set(x, 0.5, y); m.renderOrder = 1; this.scene.add(m); this.decals.push({ m, t: 0 });
    }
  }
  private hitSparks(x: number, y: number) {
    this.emit('fire', x, 12, y, { s0: 9, s1: 2, life: 0.1, a: 1, color: 0xffffff });
    for (let i = 0; i < 4; i++) { const a = rnd(0, 6.28), v = rnd(30, 90); this.emit('fire', x, 12, y, { vx: Math.cos(a) * v, vy: rnd(20, 70), vz: Math.sin(a) * v, s0: 3, s1: 1, life: rnd(0.2, 0.4), a: 1, color: 0xffe08a, g: 200 }); }
  }
  private muzzle(x: number, y: number, ang: number, k: string) {
    if (k === 'flame') {
      for (let i = 0; i < 5; i++) { const d = 6 + i * 9; this.emit('fire', x + Math.cos(ang) * d + rnd(-3, 3), 9 + i * 0.6, y + Math.sin(ang) * d + rnd(-3, 3), { vy: 6, s0: 6 + i * 3, s1: 12 + i * 4, life: 0.3 + i * 0.05, a: 0.9, color: i < 2 ? 0xffd27a : 0xff6a1a }); }
      this.puff(x + Math.cos(ang) * 40, 14, y + Math.sin(ang) * 40, 0x3a332c, 0.4); return;
    }
    const c = k === 'laser' ? 0x66e0ff : 0xffd37a;
    this.emit('fire', x, 13, y, { s0: k === 'laser' ? 14 : 12, s1: 3, life: 0.1, a: 1, color: c });
    this.emit('fire', x + Math.cos(ang) * 9, 13, y + Math.sin(ang) * 9, { s0: 8, s1: 2, life: 0.08, a: 1, color: 0xffffff });
    if (k === 'shell' || k === 'rocket') this.puff(x, 12, y, 0xbdb4a0, 0.45);
  }
  /** Flash de tela, brilho de explosões, anúncios de abates e música reativa. */
  private juice(dt: number) {
    const w = this.world, me = this.me;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 3); this.applyCam(); }
    if (this.flashA > 0.004) { this.flashA = Math.max(0, this.flashA - dt * 2.2); this.flashEl.style.opacity = String(this.flashA); } else if (this.flashEl.style.opacity !== '0') this.flashEl.style.opacity = '0';
    if (this.dangerA > 0.004) { this.dangerA = Math.max(0, this.dangerA - dt * 0.9); this.dangerEl.style.opacity = String(this.dangerA); } else if (this.dangerEl.style.opacity !== '0') this.dangerEl.style.opacity = '0';
    for (const L of this.lights) { if (L.t > 0) { L.t -= dt; L.l.intensity *= Math.pow(0.0008, dt); if (L.t <= 0) L.l.intensity = 0; } }
    this.combat = Math.max(0, this.combat - dt * 0.14);
    music.setIntensity(this.paused || this.over ? 0 : this.combat);
    this.engT = this.engAcc[0]; this.engH = this.engAcc[1]; this.engJ = this.engAcc[2];
    if (this.paused || this.over) sfx.quiet(); else sfx.mix(this.engT, this.engH, this.engJ, this.combat);
    if (this.over) return;
    // sequência de abates
    const kills = w.teams[me].kills;
    if (this.lastKills < 0) this.lastKills = kills;
    if (kills > this.lastKills) { this.streak += kills - this.lastKills; this.streakT = 4; this.lastKills = kills; this.streakFx(this.streak); }
    if (this.streakT > 0) { this.streakT -= dt; if (this.streakT <= 0) this.streak = 0; }
    // estrutura inimiga destruída
    const eb = w.active.reduce<number>((n, t) => n + (w.isEnemy(me, t) ? w.buildings(t).length : 0), 0);
    if (this.lastEnemyB < 0) this.lastEnemyB = eb;
    if (eb < this.lastEnemyB && this.lastEnemyB > 0) { this.banner('ESTRUTURA INIMIGA DESTRUÍDA', 'gold'); sfx.streak(4); this.shake = Math.min(3.4, this.shake + 1); this.flashA = Math.min(0.6, this.flashA + 0.25); }
    this.lastEnemyB = eb;
    // base sob ataque
    this.hpT += dt; this.atkBannerT -= dt;
    if (this.hpT > 0.3) {
      this.hpT = 0;
      let hp = 0; for (const b of w.buildings(me)) hp += b.hp;
      if (this.myHp > 0 && hp < this.myHp - 4) { this.dangerA = Math.min(0.9, this.dangerA + 0.35); if (this.atkBannerT <= 0) { this.atkBannerT = 9; this.banner('⚠ BASE SOB ATAQUE!', 'red'); } }
      this.myHp = hp;
    }
  }
  private streakFx(n: number) {
    const t = n === 2 ? 'DUPLA ELIMINAÇÃO' : n === 3 ? 'TRIPLA ELIMINAÇÃO!' : n === 4 ? 'QUÁDRUPLA ELIMINAÇÃO!' : n === 5 ? 'SEQUÊNCIA IMPARÁVEL!' : n === 7 ? 'MASSACRE!' : n === 10 ? 'LENDÁRIO!' : n > 10 && n % 5 === 0 ? `${n} ABATES!` : '';
    if (n >= 2) sfx.streak(n);
    if (t) { this.banner(t, n >= 5 ? 'gold big' : 'gold'); this.flashA = Math.min(0.5, this.flashA + 0.1); }
  }
  /** Faixa de anúncio animada no centro da tela. */
  banner(text: string, cls = 'gold') {
    const d = document.createElement('div');
    d.className = 'banner ' + cls; d.textContent = text;
    this.bannerHost.append(d);
    while (this.bannerHost.children.length > 3) this.bannerHost.firstElementChild?.remove();
    setTimeout(() => d.remove(), 2100);
  }
  private rankFx(x: number, y: number, v: number) {
    let t = this.starCache.get(v); if (!t) { t = starTex(v); this.starCache.set(v, t); }
    this.emit('star', x, 40, y, { vy: 22, s0: 40 + v * 6, s1: 46 + v * 6, life: 1.3, a: 1, tex: t });
    this.emit('ring', x, 3, y, { s0: 12, s1: 80, life: 0.7, a: 0.9, color: 0xffd54a });
  }

  private updateProjectiles() {
    const used = new Map<string, number>();
    for (const p of this.world.projectiles) {
      const key = p.kind;
      let pool = this.projPool.get(key); if (!pool) { pool = []; this.projPool.set(key, pool); }
      const i = used.get(key) ?? 0; used.set(key, i + 1);
      let m = pool[i];
      if (!m) {
        const mk = (g: THREE.BufferGeometry, color: number, ei = 2) => { const mt = new THREE.MeshBasicMaterial({ color }); if (this.composer) mt.color.multiplyScalar(ei); return new THREE.Mesh(g, mt); };
        m = key === 'laser' ? mk(new THREE.BoxGeometry(34, 1.8, 1.8), 0xa8f1ff)
          : key === 'bullet' ? mk(new THREE.BoxGeometry(11, 1.1, 1.1), 0xffe28a)
          : key === 'rocket' ? mk(new THREE.CylinderGeometry(1.5, 1.5, 11, 6).rotateZ(Math.PI / 2), 0xe6e9ee)
          : mk(new THREE.SphereGeometry(2.8, 8, 6), 0xffc266);
        this.scene.add(m); pool.push(m);
      }
      m.visible = true;
      m.position.set(p.x, 13, p.y); m.rotation.y = -p.angle;
      if (key === 'laser') this.emit('fire', p.x - Math.cos(p.angle) * 14, 13, p.y - Math.sin(p.angle) * 14, { s0: 7, s1: 2, life: 0.16, a: 0.8, color: 0x4fc8ff });
      else if (key === 'bullet' && Math.random() < 0.7) this.emit('fire', p.x - Math.cos(p.angle) * 6, 13, p.y - Math.sin(p.angle) * 6, { s0: 3.5, s1: 1, life: 0.12, a: 0.7, color: 0xffb040 });
      else if (key !== 'rocket' && key !== 'bullet' && Math.random() < 0.7) this.emit('fire', p.x, 13, p.y, { s0: 8, s1: 2, life: 0.2, a: 0.8, color: 0xff7a22 });
      if (key === 'rocket' && Math.random() < 0.6) this.emit('smoke', p.x, 13, p.y, { s0: 4, s1: 10, life: 0.5, a: 0.5, color: 0xdddddd });
      if (key === 'rocket' && Math.random() < 0.5) this.emit('fire', p.x - Math.cos(p.angle) * 6, 13, p.y - Math.sin(p.angle) * 6, { s0: 6, s1: 2, life: 0.12, a: 1, color: 0xff9a3a });
    }
    for (const [k, pool] of this.projPool) for (let i = used.get(k) ?? 0; i < pool.length; i++) pool[i].visible = false;
  }

  // ---------- sobreposição 2D (barras, seleção, caixa, marcas) ----------
  private ringPoly(cx: number, cz: number, r: number, n = 24): { x: number; y: number }[] {
    const o: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832, p = this.proj(cx + Math.cos(a) * r, 0.5, cz + Math.sin(a) * r); o.push(p); }
    return o;
  }
  private poly(pts: { x: number; y: number }[], stroke: string, w = 2, fill?: string) {
    const c = this.octx; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    c.lineWidth = w; c.strokeStyle = stroke; c.stroke();
  }
  private brackets(pts: { x: number; y: number }[], col: string) {
    const c = this.octx; c.fillStyle = 'rgba(124,252,154,.07)'; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill();
    c.strokeStyle = col; c.lineWidth = 3; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4], d = pts[(i + 3) % 4];
      c.beginPath(); c.moveTo(a.x + (d.x - a.x) * 0.28, a.y + (d.y - a.y) * 0.28); c.lineTo(a.x, a.y); c.lineTo(a.x + (b.x - a.x) * 0.28, a.y + (b.y - a.y) * 0.28); c.stroke();
    }
    c.lineCap = 'butt';
  }
  private rectPoly(x0: number, z0: number, x1: number, z1: number) {
    return [this.proj(x0, 0.5, z0), this.proj(x1, 0.5, z0), this.proj(x1, 0.5, z1), this.proj(x0, 0.5, z1)];
  }

  private drawOverlay(dt: number) {
    const c = this.octx, w = this.world, me = this.me;
    c.clearRect(0, 0, this.W, this.H);
    c.lineJoin = 'round';
    // fantasma de construção
    if (this.placing) {
      if (this.ghostKind !== this.placing) {
        this.dropGhost();
        const g = buildModel(this.placing, w.teams[me].faction);
        g.traverse(o => { if ((o as THREE.Line).isLine) o.visible = false; const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.material = (m.material as THREE.MeshStandardMaterial).clone(); (m.material as THREE.MeshStandardMaterial).transparent = true; (m.material as THREE.MeshStandardMaterial).opacity = 0.55; } });
        this.scene.add(g); this.ghost = g; this.ghostKind = this.placing;
      }
      const d = DEFS[this.placing], ok = this.placeValid();
      this.ghost!.position.set((this.ghostT.x + d.w / 2) * TILE, 0, (this.ghostT.y + d.h / 2) * TILE);
      this.poly(this.rectPoly(this.ghostT.x * TILE, this.ghostT.y * TILE, (this.ghostT.x + d.w) * TILE, (this.ghostT.y + d.h) * TILE), ok ? '#2ecc71' : '#e74c3c', 2.5, ok ? 'rgba(46,204,113,.22)' : 'rgba(231,76,60,.25)');
      if (d.range > 0) this.poly(this.ringPoly((this.ghostT.x + d.w / 2) * TILE, (this.ghostT.y + d.h / 2) * TILE, d.range * TILE, 40), 'rgba(102,224,255,.7)', 1.2);
    }
    if (this.wallMode && this.wallPts.length) {
      const ok = this.wallPreview(); let n = 0;
      this.wallPts.forEach(([tx, ty], i) => { if (ok[i]) n++; this.poly(this.rectPoly(tx * TILE + 1, ty * TILE + 1, (tx + 1) * TILE - 1, (ty + 1) * TILE - 1), ok[i] ? '#2ecc71' : '#e74c3c', 2, ok[i] ? 'rgba(46,204,113,.28)' : 'rgba(231,76,60,.28)'); });
      const [lx, ly] = this.wallPts[this.wallPts.length - 1], p = this.proj((lx + 0.5) * TILE, 20, (ly + 0.5) * TILE);
      if (p.ok) { const c = this.octx, txt = `${n} trecho(s) · ◆ ${n * DEFS.wall.cost}`; c.font = '800 13px system-ui'; const tw = c.measureText(txt).width; c.fillStyle = 'rgba(0,0,0,.75)'; c.fillRect(p.x - tw / 2 - 6, p.y - 30, tw + 12, 20); c.fillStyle = '#f2e8c8'; c.fillText(txt, p.x - tw / 2, p.y - 15); }
    }
    for (const e of w.entities) {
      if (!e.alive || !w.isVisible(e)) continue;
      const r = this.ents.get(e.id); if (!r) continue;
      const sel = this.selection.includes(e) || this.inspect === e, mine = e.team === me, tcol = TEAM_COLORS[e.team];
      if (sel) {
        const col = mine ? '#7cfc9a' : tcol.light;
        if (e.building) this.brackets(this.rectPoly(e.tx * TILE - 1, e.ty * TILE - 1, (e.tx + e.def.w) * TILE + 1, (e.ty + e.def.h) * TILE + 1), col);
        else { const pulse = 0.55 + 0.45 * Math.sin(this.clock * 5); this.poly(this.ringPoly(r.fx ?? e.x, r.fz ?? e.y, e.radius + 4), col, 2.4, mine ? 'rgba(124,252,154,.10)' : tcol.main + '33'); this.poly(this.ringPoly(r.fx ?? e.x, r.fz ?? e.y, e.radius + 7 + pulse * 1.5), mine ? `rgba(124,252,154,${0.25 * pulse})` : `rgba(255,107,94,${0.25 * pulse})`, 1.2); }
      }
      const hurt = e.hp < e.maxHp, hb = Storage.data.hpBars, showBar = hb === 'always' ? (e.building ? hurt || sel : true) : hb === 'sel' ? sel : sel || hurt;
      if (showBar || e.tech > 1 || (!e.building && e.vet > 1)) {
        const air = e.def.armor === 'air';
        const p = this.proj(r.fx ?? e.x, (air ? (r.fx !== undefined ? 62 : 42) : 0) + r.h + 8, r.fz ?? e.y);
        if (!p.ok || p.x < -40 || p.y < -20 || p.x > this.W + 40 || p.y > this.H + 20) continue;
        const bw = e.building ? Math.max(34, e.def.w * 24) : Math.max(24, e.radius * 2.1), bx = p.x - bw / 2, by = p.y - 6, f = e.hp / e.maxHp;
        if (showBar) {
          c.fillStyle = 'rgba(0,0,0,.78)'; c.fillRect(bx - 1.5, by - 1.5, bw + 3, 7);
          c.fillStyle = tcol.main; c.fillRect(bx - 1.5, by - 4, bw + 3, 2.5); // faixa na cor do slot
          c.fillStyle = f > 0.5 ? '#4cd964' : f > 0.25 ? '#ffcc00' : '#ff3b30'; c.fillRect(bx, by, bw * f, 4);
          if (sel && e.kind === 'harvester' && mine) { c.fillStyle = '#3fb8ff'; c.fillRect(bx, by + 6, bw * (e.cargo / 300), 2.5); }
        }
        for (let k = 1; k < e.tech; k++) { const px = bx + 4 + (k - 1) * 9, py = by - 5; c.fillStyle = '#7fe6ff'; c.beginPath(); c.moveTo(px, py - 4); c.lineTo(px + 3.5, py); c.lineTo(px, py + 4); c.lineTo(px - 3.5, py); c.closePath(); c.fill(); }
        if (!e.building) for (let k = 1; k < e.vet; k++) {
          const cx = bx + bw - 5 - (k - 1) * 8, cy = by - 5; c.strokeStyle = '#ffd54a'; c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(cx - 3.5, cy + 2.5); c.lineTo(cx, cy - 1); c.lineTo(cx + 3.5, cy + 2.5); c.stroke();
        }
      }
    }
    this.marks = this.marks.filter(m => (m.t += dt) < 0.6);
    if (this.tgt === 'sp' && this.hoverG) this.poly(this.ringPoly(this.hoverG.x, this.hoverG.y, SP_RADIUS * TILE), 'rgba(255,200,80,.95)', 3);
    const rl = this.world.teams[this.me].rally;
    if (rl) { this.poly(this.ringPoly(rl.x, rl.y, 9), 'rgba(124,252,154,.7)', 2); this.poly(this.ringPoly(rl.x, rl.y, 3), 'rgba(124,252,154,.9)', 3); }
    for (const m of this.marks) this.poly(this.ringPoly(m.x, m.y, 6 + m.t * 34), `rgba(124,252,154,${1 - m.t / 0.6})`, 2);
    if (this.box) {
      const b = this.box;
      c.fillStyle = 'rgba(124,252,154,.12)'; c.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      c.strokeStyle = '#7cfc9a'; c.lineWidth = 1.5; c.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
  }
}
