<div align="center">

# ⚔️ Frente de Ferro

### Estratégia em tempo real para o celular. Partidas curtas, guerra de verdade.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)
![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)
![iOS](https://img.shields.io/badge/iOS-000000?style=for-the-badge&logo=apple&logoColor=white)

</div>

## 🎮 O jogo

**Frente de Ferro** é um RTS (estratégia em tempo real) de bases feito para o toque. Você constrói a base, coleta Cristal de Cobalto, treina tropas e destrói as construções do inimigo. Cada partida dura de 10 a 20 minutos.

Tudo é original: universo, facções, história, gráficos e sons (os gráficos e sons são gerados por código).

## 🛡️ Duas facções, dois jeitos de vencer

| | **Vanguarda Solar** | **Sindicato Ferro** |
|---|---|---|
| Estilo | Blindados, energia e defesa | Velocidade, artilharia e pressão |
| Vantagem | Mais blindagem e mais energia | Mais velocidade e alcance |
| Tropa exclusiva | Tanque Prisma | Artilharia Pesada |
| Superpoder | **Pulso Solar**, um feixe orbital em área | **Barragem de Artilharia**, uma chuva de obuses |

## ✨ O que você encontra no jogo

- 🗺️ **Campanha com missões**, começando por um tutorial guiado ("Primeiro Contato").
- 🤖 **Escaramuça contra IA**, com dificuldades diferentes e mapas gerados automaticamente.
- 🌐 **Partidas online** entre jogadores.
- 🏗️ **Economia e energia de verdade.** Sem energia, a produção cai pela metade e o radar desliga.
- 🌳 **Árvore de tecnologia**, evolução de tropas em 3 níveis e veterania por abates.
- 📖 **História com peso moral:** *quem poderia ter evitado a guerra?*
- 🏆 **Conquistas** e efeitos sonoros gerados por código.
- 📱 **Feito para o toque:** caixa de seleção, seleção do exército inteiro, zoom em pinça e minimapa. No computador, usa mouse e teclado.
- 🚫 **Sem anúncios.**

## 💰 Modelo de negócio

Baixar é grátis. As primeiras missões, a escaramuça e o online são gratuitos. A **Edição Completa** é uma compra única dentro do app e libera o restante da campanha e os conteúdos futuros.

O mesmo código gera **dois apps**:

| Versão | Para quê |
|---|---|
| **Completo** (`br.com.frentedeferro.rts`) | Google Play e App Store, com compra pela loja do aparelho e "Restaurar compras" |
| **Demo** (`br.com.frentedeferro.demo`) | Teste fechado, TestFlight e envio a amigos |

## 🧱 Tecnologia

TypeScript, Vite, Three.js, PeerJS (partidas online), Capacitor 7 (Android e iOS) e `cordova-plugin-purchase` (compra no app).

## 🚀 Como rodar

```bash
npm install
npm run dev            # abra o endereço "Network" no celular (mesmo Wi-Fi)
```

Outros comandos úteis:

```bash
npm run build:mobile   # compila e sincroniza com Android e iOS
npm run open:android   # abre no Android Studio
npm run open:ios       # abre no Xcode (precisa de macOS)
npm run sim -- normal 12   # simula IA contra IA e mostra economia e exército
npm run test:missions
npm run test:balance
```

## 🕹️ Controles

| Ação | Celular | Computador |
|---|---|---|
| Selecionar e ordenar | Toque | Clique e botão direito |
| Caixa de seleção | Botão **▭ Caixa** e arrastar | Arrastar |
| Selecionar todo o exército | Botão **⚔ Exército** | Botão **⚔ Exército** |
| Mover a câmera | Arrastar, 2 dedos ou minimapa | Setas, WASD ou borda da tela |
| Zoom | Pinça | Roda do mouse |

## 📚 Documentação do projeto

- [`docs/GDD.md`](docs/GDD.md): design do jogo (facções, mecânicas, economia)
- [`docs/HISTORIA.md`](docs/HISTORIA.md): a origem da guerra
- [`docs/APP.md`](docs/APP.md): como gerar os apps para iPhone, iPad e Android
- [`docs/DESENVOLVIMENTO.md`](docs/DESENVOLVIMENTO.md): guia técnico de desenvolvimento

---

## 🤝 Quer um sistema assim para o seu negócio?

Este projeto faz parte do portfólio da **BR Intelligence**: sistemas sob medida, agentes de IA que atendem no WhatsApp e sites feitos para vender. O foco são empresas e clínicas que querem atender melhor, perder menos clientes e ganhar tempo.

- 💬 **Fale agora com o nosso agente de IA no WhatsApp:** [wa.me/556193541717](https://wa.me/556193541717?text=Ol%C3%A1!%20Vim%20pelo%20seu%20GitHub%20e%20quero%20saber%20mais%20sobre%20os%20seus%20sistemas.)
- ✉️ **E-mail:** [bbrunno18@yahoo.com.br](mailto:bbrunno18@yahoo.com.br)
- 🌐 **Site:** https://br-intelligence.vercel.app
- 💼 **Mais projetos:** https://github.com/bbrunno18
- 📍 **Brasília/DF**, com atendimento para todo o Brasil

> Tem uma ideia, um processo manual que cansa ou um atendimento que perde cliente? Chame o agente no WhatsApp e vamos transformar isso em sistema.

<sub>Criado por **Brunno Almeida** · BR Intelligence</sub>
