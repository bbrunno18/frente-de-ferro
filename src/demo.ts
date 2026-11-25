/** Build de demonstração: `vite build --mode demo` gera um único HTML com 2 missões. */
export const DEMO = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_DEMO === '1';
export const DEMO_IDS = ['m1', 'm3'];
