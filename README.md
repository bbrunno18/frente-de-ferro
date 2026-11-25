# Frente de Ferro — RTS mobile

RTS de escaramuça com universo 100% original: **Vanguarda Solar** (blindados pesados, energia limpa) × **Sindicato Ferro** (velocidade e artilharia).
Stack: Vite + TypeScript + Phaser 3 + Capacitor (Android/iOS). Todos os gráficos e sons são gerados por código.

## Rodar no navegador / celular (Wi-Fi local)
```bash
npm install
npm run dev          # = vite --host ; abra o endereço "Network" no celular
```
Para testar o PWA instalável pelo celular é preciso HTTPS (`npm run build && npm run preview`
atrás de um túnel HTTPS) — o jogo em si funciona normalmente por HTTP na rede local.

## Gerar o APK de teste (Android)
Requisitos: Node 20+, Android Studio (com SDK e JDK 17+ que ele já instala).
```bash
npm install
npm run build:mobile     # vite build + npx cap sync
npm run open:android     # abre o projeto no Android Studio
```
No Android Studio: aguarde o *Gradle Sync* → menu **Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)**.
O arquivo sai em `android/app/build/outputs/apk/debug/app-debug.apk` (clique em *locate* no aviso).
Instale com `adb install -r app-debug.apk` ou copiando o arquivo para o aparelho.
Via terminal (sem abrir o Studio): `cd android && ./gradlew assembleDebug`.

Para a **Google Play**: *Build ▸ Generate Signed Bundle / APK ▸ Android App Bundle (.aab)* com sua keystore.

## iOS
Requer macOS + Xcode: `npm run build:mobile && npm run open:ios`, configure o Team em *Signing & Capabilities* e rode no aparelho/Archive.

## Validar a lógica sem navegador
`npm run sim -- normal 12` simula IA × IA (dificuldade, minutos, mapa) e imprime economia/exército.

## Controles
| Ação | Gesto |
|---|---|
| Selecionar / ordenar mover-atacar | Toque simples |
| Caixa de seleção | Botão **▭ Caixa** + arrastar, ou segurar e arrastar |
| Selecionar todo o exército | Botão **⚔ Exército** |
| Mover câmera | Arrastar (1 dedo), 2 dedos (com zoom em pinça) ou tocar/arrastar no minimapa |
| Posicionar construção | Toque no mapa para mover o gabarito; toque no prédio ou em **✔ Construir** |
| Desktop | Arrastar = caixa · botão direito = ordem · roda = zoom · setas/WASD = câmera |

## Estrutura
`src/entities` (Entity) · `src/systems` (World, AI, Pathfinding, MapGen, InputController, Storage) · `src/ui` (Sidebar, Minimap, Menu, Hud, sprites) · `src/scenes` (Boot, Game) · `src/audio` (Sfx — Web Audio) · `android/` e `ios/` (projetos Capacitor já configurados para paisagem + tela cheia).
