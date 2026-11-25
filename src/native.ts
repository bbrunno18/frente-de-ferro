import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { Storage } from './systems/Storage';
import { sfx } from './audio/Sfx';

/**
 * Integração com o aparelho (iPhone, iPad, Android, tablets). Tudo aqui é ignorado no navegador.
 * - Celular: trava deitado (o RTS fica muito apertado em pé). Tablet: qualquer orientação.
 * - Botão Voltar do Android: pausa/retoma a partida; no menu, fecha a janela aberta; "Voltar" duas vezes sai.
 * - App em segundo plano: pausa a partida e silencia o som.
 * - Vibração leve em explosões grandes e no superpoder (segue a opção "Tremor de tela").
 */
export const isNative = () => Capacitor.isNativePlatform();

interface Hooks { game(): { togglePause(): void; pauseFromOS(): void } | null; closeTop(): boolean; toast(t: string): void }

export async function setupNative(h: Hooks) {
  if (!isNative()) return;
  const tablet = Math.min(screen.width, screen.height) >= 600;
  try { if (tablet) await ScreenOrientation.unlock(); else await ScreenOrientation.lock({ orientation: 'landscape' }); } catch { /* sem suporte */ }
  try { await StatusBar.hide(); } catch { /* sem barra */ }
  let lastBack = 0;
  App.addListener('backButton', () => {
    const g = h.game();
    if (g) { g.togglePause(); return; }
    if (h.closeTop()) return;
    const now = Date.now();
    if (now - lastBack < 2000) void App.exitApp(); else { lastBack = now; h.toast('Toque em Voltar de novo para sair'); }
  });
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) { h.game()?.pauseFromOS(); sfx.suspend(); } else sfx.resume();
  });
}

export function haptic(strong = false) {
  if (!isNative() || Storage.data.shake === false) return;
  void Haptics.impact({ style: strong ? ImpactStyle.Heavy : ImpactStyle.Light }).catch(() => undefined);
}
