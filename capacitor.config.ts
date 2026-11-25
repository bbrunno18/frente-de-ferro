import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Duas versões do mesmo jogo, escolhidas pela variável APP_FLAVOR (use os scripts `npm run app:full` / `app:demo`):
 * - full: "Frente de Ferro" (br.com.frentedeferro.rts) — jogo completo, grátis para baixar, Edição Completa por compra no app.
 * - demo: "Frente de Ferro Demo" (br.com.frentedeferro.demo) — 2 missões, para TestFlight/teste fechado e envio a amigos.
 */
const demo = process.env.APP_FLAVOR === 'demo';
const config: CapacitorConfig = {
  appId: demo ? 'br.com.frentedeferro.demo' : 'br.com.frentedeferro.rts',
  appName: demo ? 'Frente de Ferro Demo' : 'Frente de Ferro',
  webDir: demo ? 'dist-demo' : 'dist',
  backgroundColor: '#121210',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
  ios: { contentInset: 'never', backgroundColor: '#121210', scrollEnabled: false },
  plugins: {
    StatusBar: { overlaysWebView: true, style: 'DARK' },
    SplashScreen: { launchShowDuration: 1200, backgroundColor: '#121210', showSpinner: false },
  },
};

export default config;
