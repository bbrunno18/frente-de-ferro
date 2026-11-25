import { Storage } from './Storage';
import type { Mission } from '../campaign/missions';
import { DEMO, DEMO_IDS } from '../demo';

/** Missões grátis; da seguinte em diante é preciso a Edição Completa. */
export const FREE_MISSIONS = 4;
export const PRICE_LABEL = 'R$ 9,90';

type Billing = { buy(): Promise<boolean>; restore(): Promise<boolean> };
const ENV = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const native = () => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
/** Na loja, o app Android/iOS registra `window.FFRBilling` (plugin de compras). Veja store/guia-compras.md. */
const provider = () => (window as unknown as { FFRBilling?: Billing }).FFRBilling;

export const Purchases = {
  owned: () => Storage.data.full,
  isLocked: (m: Mission) => DEMO ? !DEMO_IDS.includes(m.id) : m.n > FREE_MISSIONS && !m.free && !Storage.data.full,
  /** Modo de teste: sem cobrança real (apenas web/protótipo). Desligue no build de produção com VITE_DEV_BILLING=0. */
  simulated: () => !native() && ENV.VITE_DEV_BILLING !== '0',
  async buy(): Promise<{ ok: boolean; msg?: string }> {
    const p = provider();
    if (p) { try { const ok = await p.buy(); if (ok) this.grant(); return { ok }; } catch { return { ok: false, msg: 'A compra não foi concluída.' }; } }
    if (this.simulated()) { this.grant(); return { ok: true }; }
    return { ok: false, msg: 'Compra indisponível nesta versão. Atualize o aplicativo.' };
  },
  async restore(): Promise<{ ok: boolean; msg?: string }> {
    const p = provider();
    if (p) { try { const ok = await p.restore(); if (ok) this.grant(); return { ok, msg: ok ? undefined : 'Nenhuma compra encontrada nesta conta.' }; } catch { return { ok: false, msg: 'Não foi possível restaurar agora.' }; } }
    if (Storage.data.full) return { ok: true };
    return { ok: false, msg: 'Nenhuma compra encontrada nesta conta.' };
  },
  grant() { Storage.data.full = true; Storage.save(); },
};
