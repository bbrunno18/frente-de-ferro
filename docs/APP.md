# Frente de Ferro — apps para iPhone, iPad, Android e tablets

O projeto gera **dois apps** a partir do mesmo código:

| Versão | Nome na tela | ID do app | Para quê |
|---|---|---|---|
| Completo | Frente de Ferro | `br.com.frentedeferro.rts` | Lojas (Google Play e App Store). Grátis para baixar; a Edição Completa é liberada por compra no app (`frente_de_ferro_completo`). |
| Demo | Frente de Ferro Demo | `br.com.frentedeferro.demo` | Teste fechado no Google Play, TestFlight no iPhone, e enviar a amigos. **Não vai para a App Store pública** (regra 2.2 da Apple: demos ficam no TestFlight). |

O que já está pronto no app:
- Ícone e tela de abertura próprios (escudo militar; a demo tem a faixa "DEMO").
- Tela cheia, tela sempre acesa, barra de status escondida.
- Celular: sempre deitado. Tablet (iPad e Android): gira livre, com layout próprio em pé e deitado.
- Botão Voltar do Android: pausa o jogo / fecha janelas; dois toques saem.
- Ao sair do app ou receber ligação, o jogo pausa e o som para.
- Vibração em explosões grandes e superpoderes (desliga junto com "tremor de tela").
- Compra no app pela loja do aparelho (Google Play Billing / StoreKit), com "Restaurar compras".

---

## 1. Preparar o computador (uma vez)

- **Node.js 22** — https://nodejs.org
- **Android:** Android Studio (qualquer sistema).
- **iPhone/iPad:** um **Mac** com Xcode e CocoaPods (`sudo gem install cocoapods`).

Na pasta do projeto:

```bash
npm install
```

## 2. Gerar o app

| Comando | Faz |
|---|---|
| `npm run android:full` | Prepara o jogo completo e abre no Android Studio |
| `npm run android:demo` | Prepara a demo e abre no Android Studio |
| `npm run ios:full` | Prepara o jogo completo e abre no Xcode |
| `npm run ios:demo` | Prepara a demo e abre no Xcode |

Cada comando compila o jogo, troca ID, nome, ícone e tela de abertura e sincroniza os plugins. Para trocar de versão é só rodar o outro comando.

A versão do app vem do `"version"` do `package.json` (ex.: 1.0.0 → código 10000). Aumente-a a cada envio para as lojas.

### Testar no aparelho
- **Android:** ligue o celular/tablet no USB com "Depuração USB" ativa e clique ▶ no Android Studio.
- **iPhone/iPad:** no Xcode, em *Signing & Capabilities*, escolha seu time (Apple ID) e clique ▶ com o aparelho conectado.

## 3. Google Play

1. Crie a conta em https://play.google.com/console (taxa única de US$ 25).
   Contas **pessoais novas** precisam de um teste fechado com **12 testadores por 14 dias** antes de publicar; contas de **organização** (CNPJ) não.
2. Crie o app "Frente de Ferro" com o pacote `br.com.frentedeferro.rts`.
3. **Gerar o arquivo da loja (.aab):** no Android Studio, *Build → Generate Signed App Bundle*. Crie uma chave (guarde o arquivo e as senhas, sem elas não dá para atualizar o app).
4. Envie o .aab em *Testes → Teste fechado*, adicione os e-mails dos testadores.
5. **Produto da compra:** *Monetizar → Produtos no app → Criar*: ID `frente_de_ferro_completo`, tipo único (não consumível), preço (ex.: R$ 19,90). Ative.
6. Preencha ficha, classificação, Segurança dos dados e política de privacidade — os textos estão em `store/`.
7. A demo pode ser outro app (`br.com.frentedeferro.demo`) só em teste fechado/interno, para enviar o link a amigos.

## 4. App Store (iPhone e iPad)

1. Conta Apple Developer (US$ 99/ano) — https://developer.apple.com.
2. Em https://appstoreconnect.apple.com crie o app com o Bundle ID `br.com.frentedeferro.rts`.
3. **Compra no app:** *Monetização → Compras dentro do app → Não consumível*, ID `frente_de_ferro_completo`.
4. Assine o contrato "Apps pagos" e preencha os dados bancários (sem isso a compra não funciona).
5. No Xcode: *Product → Archive → Distribute App → App Store Connect*.
6. Primeiro vai para o **TestFlight** (teste com até 10.000 pessoas por link). Depois, *Enviar para revisão*.
7. A **demo** usa o Bundle ID `br.com.frentedeferro.demo` e fica **só no TestFlight**.
8. Nas notas para o revisor, explique que as missões 1–2 de cada campanha são grátis e o resto libera com a compra.

## 5. Gerar os apps na nuvem (sem Mac)

O arquivo `.github/workflows/apps.yml` compila tudo no GitHub:
1. Suba o projeto para um repositório no GitHub.
2. Aba **Actions → Apps → Run workflow**.
3. Ao terminar, baixe `android-full` e `android-demo` (APK para instalar direto, AAB para a loja).
4. O passo de iOS confirma que o projeto compila. Para enviar à Apple ainda é preciso assinar no Xcode (ou configurar o fastlane com o certificado).

Para o Android sair já assinado para a loja, crie em *Settings → Secrets → Actions*:
`ANDROID_KEYSTORE_BASE64` (o arquivo da chave em base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

### Criar a chave de assinatura (uma vez)
No seu computador, com Java instalado: `bash scripts/gerar-chave.sh`. Ele cria a chave em `~/frente-de-ferro-chave/` e mostra os 4 segredos para cadastrar no GitHub. **Guarde a chave e a senha em mais de um lugar.**

## 6. Trocar ícone e tela de abertura

As imagens ficam em `assets-app/full/` e `assets-app/demo/`:
- `icon-only.png` (1024×1024), `icon-foreground.png` e `icon-background.png` (ícone adaptativo do Android);
- `splash.png` e `splash-dark.png` (2732×2732, o centro aparece em qualquer tela).

Troque os arquivos e rode o comando da seção 2 de novo.

## 7. Checklist antes de enviar

- [ ] Aumentou a `version` no `package.json`
- [ ] Testou num celular e num tablet, deitado e em pé (tablet)
- [ ] Testou compra e "Restaurar compras" com conta de teste da loja
- [ ] Testou sair do app no meio da partida e voltar
- [ ] Capturas de tela: celular e tablet (Google Play pede tablet de 7" e 10" para aparecer bem em tablets; a Apple pede iPad 13")
