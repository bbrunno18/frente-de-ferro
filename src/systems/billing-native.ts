/**
 * Compra real nas lojas (Google Play Billing e Apple In-App Purchase) via cordova-plugin-purchase (MIT).
 * Produto único, não consumível: "Edição Completa". Cadastre nas duas lojas com o MESMO id: frente_de_ferro_completo.
 * Registra `window.FFRBilling`, que o restante do jogo (Purchases.ts) já usa. No navegador não faz nada.
 * Sem servidor próprio de validação: a compra é concedida quando a loja aprova (adequado para desbloqueio único).
 */
import { Capacitor } from '@capacitor/core';
import { Purchases } from './Purchases';

export const PRODUCT_ID = 'frente_de_ferro_completo';
type Tx = { finish(): void; products: { id: string }[] };
type CP = {
  store: {
    register(p: unknown[]): void; initialize(p: string[]): Promise<unknown>; restorePurchases(): Promise<unknown>; owned(id: string): boolean;
    get(id: string, platform?: string): { getOffer(): { order(): Promise<unknown> } | undefined; pricing?: { price: string } } | undefined;
    when(): { approved(cb: (t: Tx) => void): ReturnType<CP['store']['when']>; productUpdated(cb: () => void): ReturnType<CP['store']['when']> };
    error(cb: (e: unknown) => void): void;
  };
  ProductType: { NON_CONSUMABLE: string }; Platform: { APPLE_APPSTORE: string; GOOGLE_PLAY: string };
};

let price: string | null = null;
export const storePrice = () => price;

export function initBilling() {
  if (!Capacitor.isNativePlatform()) return;
  const start = () => {
    const C = (window as unknown as { CdvPurchase?: CP }).CdvPurchase; if (!C) return;
    const { store, ProductType, Platform } = C;
    const platform = Capacitor.getPlatform() === 'ios' ? Platform.APPLE_APPSTORE : Platform.GOOGLE_PLAY;
    let pending: ((ok: boolean) => void) | null = null;
    store.register([{ id: PRODUCT_ID, type: ProductType.NON_CONSUMABLE, platform }]);
    store.when()
      .approved(t => { if (t.products.some(p => p.id === PRODUCT_ID)) { Purchases.grant(); pending?.(true); pending = null; } t.finish(); })
      .productUpdated(() => { const p = store.get(PRODUCT_ID, platform); if (p?.pricing?.price) price = p.pricing.price; if (store.owned(PRODUCT_ID)) Purchases.grant(); });
    store.error(() => { pending?.(false); pending = null; });
    void store.initialize([platform]);
    (window as unknown as { FFRBilling: unknown }).FFRBilling = {
      buy: () => new Promise<boolean>(res => {
        const offer = store.get(PRODUCT_ID, platform)?.getOffer();
        if (!offer) { res(false); return; }
        pending = res;
        void offer.order().then(err => { if (err) { pending = null; res(false); } });
      }),
      restore: async () => { await store.restorePurchases(); const ok = store.owned(PRODUCT_ID); if (ok) Purchases.grant(); return ok; },
    };
  };
  if ((window as unknown as { CdvPurchase?: unknown }).CdvPurchase) start(); else document.addEventListener('deviceready', start, { once: true });
}
