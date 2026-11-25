import { initDevice } from './device';
import { DEMO, DEMO_IDS } from './demo';
import { Purchases } from './systems/Purchases';
import './style.css';
import { Capacitor } from '@capacitor/core';
import { setupNative } from './native';
import { initBilling } from './systems/billing-native';
import { MatchOpts } from './config';
import { GameView } from './scenes/GameView';
import { Menu } from './ui/Menu';
import { music } from './audio/Music';
import { initI18n } from './i18n';
import { preloadModels } from './ui/models';
import { missionOpts } from './campaign/missions';
import { Storage } from './systems/Storage';
import { sfx } from './audio/Sfx';

let game: GameView | null = null;
let menu: Menu;

function startMatch(o: Omit<MatchOpts, 'onExit'>) {
  menu.hide();
  document.getElementById('app')!.classList.add('playing');
  // tela cheia no navegador (no app nativo o Capacitor já cuida disso)
  if (!Capacitor.isNativePlatform()) document.documentElement.requestFullscreen?.().catch(() => undefined);
  const opts: MatchOpts = {
    ...o,
    onExit: () => {
      const g = game; game = null;
      setTimeout(() => { g?.destroy(); document.getElementById('app')!.classList.remove('playing'); menu.show(); if (DEMO && DEMO_IDS.every(id => (Storage.data.campaign[id] ?? 0) > 0) && o.mission) menu.openDemoEnd(); else if (o.mission) menu.openCampaign(); }, 0);
    },
    onNext: m => {
      const g = game; game = null;
      setTimeout(() => {
        g?.destroy();
        if (Purchases.isLocked(m)) { document.getElementById('app')!.classList.remove('playing'); menu.show(); menu.openCampaign(); menu.openPaywall(() => { document.querySelector(".camp-wrap")?.remove(); startMatch(missionOpts(m)); }); return; }
        startMatch(missionOpts(m));
      }, 0);
    },
  };
  game = new GameView(opts, document.getElementById('game')!);
}

async function boot() {
  initDevice();
  await Storage.load();
  initI18n(Storage.data.lang);
  await preloadModels(); // modelos .glb (se falhar, o jogo usa os procedurais)
  sfx.setVolume(Storage.data.volume);
  music.setVolume(Storage.data.muted ? 0 : Storage.data.musicVolume);
  sfx.setMuted(Storage.data.muted);
  menu = new Menu(document.getElementById('app')!, startMatch);
  if (!DEMO) initBilling();
  await setupNative({
    game: () => game,
    closeTop: () => { const all = document.querySelectorAll('.audio-modal:not(.hidden)'), m = all[all.length - 1]; if (m) { if (m.id === 'm-audiomodal') m.classList.add('hidden'); else m.remove(); return true; } return false; },
    toast: t => { const d = document.createElement('div'); d.className = 'os-toast'; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), 1900); },
  });
  // bloqueia gestos de zoom/menu do navegador
  for (const ev of ['gesturestart', 'gesturechange', 'contextmenu']) document.addEventListener(ev, e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  if (!DEMO && import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
}

void boot();
