/**
 * Detecta o tipo de aparelho (celular, tablet ou computador) e a orientação,
 * e publica em <html data-dev data-orient data-short> + variável --vh, atualizando sozinho.
 */
export type Dev = 'phone' | 'tablet' | 'desktop';
export function initDevice() {
  const root = document.documentElement;
  const apply = () => {
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth), h = Math.round(vv?.height ?? window.innerHeight);
    const coarse = matchMedia('(pointer: coarse)').matches;
    const small = Math.min(w, h), big = Math.max(w, h);
    // celular: lado menor < 600px. tablet: toque com lado menor >= 600px. computador: ponteiro fino.
    const dev: Dev = coarse ? (small < 600 ? 'phone' : 'tablet') : (small < 500 && big < 900 ? 'phone' : 'desktop');
    const orient = h > w ? 'portrait' : 'landscape';
    root.dataset.dev = dev; root.dataset.orient = orient;
    root.dataset.short = h < 500 ? '1' : '0';
    root.style.setProperty('--vh', `${h * 0.01}px`);
    root.style.setProperty('--vw', `${w * 0.01}px`);
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 250));
  window.visualViewport?.addEventListener('resize', apply);
}
