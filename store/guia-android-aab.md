# Do código ao Google Play (Android)
1. **Conta:** Play Console US$ 25 (pagamento único). Contas pessoais novas exigem **teste fechado com 12 testadores por 14 dias** antes da produção; conta de organização (CNPJ + D-U-N-S) é isenta.
2. **Build web com servidor próprio:** `cp .env.example .env` (edite) → `npm run build && npx cap sync android`.
3. **Chave de assinatura (uma vez):**
   `keytool -genkey -v -keystore ffr-release.jks -alias ffr -keyalg RSA -keysize 2048 -validity 10000`
   **Guarde o .jks e as senhas em lugar seguro** (sem elas não há atualização). Use "Play App Signing".
4. **Gerar o AAB:** abra `android/` no Android Studio → *Build › Generate Signed Bundle* → AAB, ou
   `cd android && ./gradlew bundleRelease` (configure `signingConfigs` em `app/build.gradle`).
5. **Versão:** aumente `versionCode` e `versionName` em `android/app/build.gradle` a cada envio.
6. **targetSdk:** mantenha no nível exigido pelo Google (hoje, API 35+; confira em developer.android.com antes de enviar). O Capacitor atual já traz um valor recente em `android/variables.gradle`.
7. **Play Console:** envie o AAB na faixa de *Teste fechado* → preencha ficha (`ficha-da-loja.md`), Segurança dos dados (`data-safety-google-play.md`), Classificação (`classificacao-iarc.md`), política de privacidade (URL) e declaração de anúncios.
8. **Depois dos 14 dias:** solicite acesso à produção → publique com lançamento gradual (10–20%).
9. **Teste antes:** em aparelho real, com e sem Wi-Fi (o online 1×1 precisa do servidor `server/`).
