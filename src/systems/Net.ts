import Peer, { DataConnection, PeerOptions } from 'peerjs';
import type { Cmd, Snapshot } from './World';
import type { Faction, Difficulty, Slot, Team, MapSize } from '../config';

export type NetMsg =
  | { t: 'hello'; name: string }
  /** host → todos: estado da sala (4 slots). `you` = slot de quem recebe. */
  | { t: 'lobby'; slots: Slot[]; you: Team; mapId: string; mapSize: MapSize }
  /** convidado → host: escolhe a própria facção e aliança */
  | { t: 'pick'; faction: Faction; alliance: number }
  /** host → cada convidado: inicia a partida (cada um recebe o seu `you`) */
  | { t: 'start'; mapId: string; mapSize: MapSize; slots: Slot[]; you: Team; credits?: number; noSuper?: boolean; noFog?: boolean }
  | { t: 'full' }
  | { t: 'cmd'; c: Cmd }
  | { t: 'snap'; s: Snapshot }
  | { t: 'crystal'; a: number[] }
  | { t: 'bye' };

export type NetStatus = 'idle' | 'opening' | 'waiting' | 'connected' | 'closed' | 'error';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeCode = (): string => {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
};
const idOf = (code: string) => `ffr-${code.toUpperCase()}`;

/**
 * Servidor de sinalização e TURN. Produção: defina no build (.env)
 *   VITE_PEER_HOST, VITE_PEER_PORT, VITE_PEER_SECURE=1, VITE_TURN_URL, VITE_TURN_USER, VITE_TURN_PASS
 * Sem isso usa o servidor público do PeerJS (só para testes). Testes locais: ?ph=host&pp=porta&ps=1.
 */
const ENV = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
function peerOptions(): PeerOptions {
  const q = new URLSearchParams(location.search);
  const ice: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
  if (ENV.VITE_TURN_URL) ice.push({ urls: ENV.VITE_TURN_URL.split(','), username: ENV.VITE_TURN_USER, credential: ENV.VITE_TURN_PASS });
  const o: PeerOptions = { debug: 0, config: { iceServers: ice } };
  const host = q.get('ph') ?? ENV.VITE_PEER_HOST;
  if (host) {
    o.host = host; o.port = Number(q.get('pp') || ENV.VITE_PEER_PORT || 9000);
    o.secure = q.has('ps') ? q.get('ps') === '1' : ENV.VITE_PEER_SECURE === '1'; o.path = ENV.VITE_PEER_PATH || '/';
  }
  return o;
}

/** Máximo de convidados conectados ao host (sala de 4 vagas = host + 3). */
export const MAX_PEERS = 3;

export class NetSession {
  status: NetStatus = 'idle';
  code = '';
  error = '';
  isHost = false;
  peer: Peer | null = null;
  /** convidado: a conexão com o host */
  conn: DataConnection | null = null;
  /** host: convidados conectados (peerId → conexão) */
  conns = new Map<string, DataConnection>();
  onStatus: (s: NetStatus) => void = () => {};
  /** `from` = peerId do remetente (só no host) */
  onMsg: (m: NetMsg, from?: string) => void = () => {};
  /** host: um convidado entrou ('join') ou saiu ('leave') */
  onPeer: (peerId: string, what: 'join' | 'leave') => void = () => {};

  private set(s: NetStatus, err = '') { this.status = s; this.error = err; this.onStatus(s); }
  peerIds(): string[] { return [...this.conns.keys()]; }

  host(): Promise<string> {
    this.isHost = true;
    this.set('opening');
    return new Promise((res, rej) => {
      const tryOpen = (n: number) => {
        const code = makeCode();
        const p = new Peer(idOf(code), peerOptions());
        this.peer = p;
        p.on('open', () => {
          this.code = code; this.set('waiting'); res(code);
        });
        p.on('connection', c => {
          if (this.conns.size >= MAX_PEERS) { c.on('open', () => { try { c.send({ t: 'full' } as NetMsg); } catch { /* ignore */ } setTimeout(() => c.close(), 300); }); return; }
          this.bindHost(c);
        });
        p.on('error', (e: { type?: string }) => {
          if (e.type === 'unavailable-id' && n < 4) { p.destroy(); tryOpen(n + 1); return; }
          this.set('error', e.type || 'erro de rede'); rej(e);
        });
        p.on('disconnected', () => { if (this.status === 'waiting' || this.status === 'connected') { try { p.reconnect(); } catch { /* ignore */ } } });
      };
      tryOpen(0);
    });
  }

  join(code: string): Promise<void> {
    this.isHost = false;
    this.code = code.toUpperCase().trim();
    this.set('opening');
    return new Promise((res, rej) => {
      const p = new Peer(peerOptions());
      this.peer = p;
      const fail = (m: string) => { this.set('error', m); rej(new Error(m)); };
      const timer = setTimeout(() => fail('Tempo esgotado: não foi possível conectar à sala.'), 15000);
      p.on('open', () => {
        const c = p.connect(idOf(this.code), { reliable: true });
        this.bind(c, () => { clearTimeout(timer); res(); });
      });
      p.on('error', (e: { type?: string }) => {
        clearTimeout(timer);
        fail(e.type === 'peer-unavailable' ? 'Sala não encontrada. Confira o código.' : (e.type || 'erro de rede'));
      });
    });
  }

  /** host: conexão de um convidado */
  private bindHost(c: DataConnection) {
    c.on('open', () => {
      this.conns.set(c.peer, c);
      this.set('connected');
      this.onPeer(c.peer, 'join');
    });
    c.on('data', d => this.onMsg(d as NetMsg, c.peer));
    const gone = () => { if (this.conns.delete(c.peer)) { this.onPeer(c.peer, 'leave'); if (this.conns.size === 0 && this.status === 'connected') this.set('waiting'); } };
    c.on('close', gone); c.on('error', gone);
  }

  /** convidado: conexão com o host */
  private bind(c: DataConnection, opened?: () => void) {
    this.conn = c;
    c.on('open', () => { this.set('connected'); opened?.(); });
    c.on('data', d => this.onMsg(d as NetMsg));
    c.on('close', () => { if (this.status !== 'closed') this.set('closed'); });
    c.on('error', () => { if (this.status !== 'closed') this.set('closed'); });
  }

  /** host: envia a TODOS os convidados; convidado: envia ao host */
  send(m: NetMsg) {
    if (this.isHost) { for (const c of this.conns.values()) if (c.open) { try { c.send(m); } catch { /* ignore */ } } return; }
    if (this.conn && this.conn.open) { try { this.conn.send(m); } catch { /* ignore */ } }
  }
  /** host: envia a um convidado específico */
  sendTo(peerId: string, m: NetMsg) {
    const c = this.conns.get(peerId);
    if (c && c.open) { try { c.send(m); } catch { /* ignore */ } }
  }

  close() {
    this.send({ t: 'bye' });
    this.status = 'closed';
    for (const c of this.conns.values()) { try { c.close(); } catch { /* ignore */ } }
    this.conns.clear();
    try { this.conn?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.conn = null; this.peer = null;
  }

  inviteLink(): string {
    const u = new URL(location.href);
    u.search = ''; u.hash = '';
    const q = new URLSearchParams(location.search);
    for (const k of ['ph', 'pp', 'ps']) if (q.get(k)) u.searchParams.set(k, q.get(k)!);
    u.searchParams.set('sala', this.code);
    return u.toString();
  }
}

export type { Difficulty };
