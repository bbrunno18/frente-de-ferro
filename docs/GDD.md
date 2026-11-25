# Frente de Ferro — GDD básico (Game Design Document)

Versão 0.2 · 25/11/2026 · Responsável: Brunno

## 1. Visão geral
- **Gênero:** RTS (estratégia em tempo real) de bases, para celular e web.
- **Plataformas:** Web/PWA, Android, iOS (Capacitor).
- **Público:** jogadores casuais e fãs de RTS clássico, 12+; sessões de 10–20 min.
- **Pilares:** (1) Fácil de aprender no toque. (2) Partidas curtas e explosivas. (3) Duas facções com identidade própria. (4) História simples com peso moral: "quem poderia ter evitado a guerra?".
- **Modelo de negócio:** missões 1–4, escaramuça e online grátis; **Edição Completa (R$ 9,90, compra única)** libera a campanha a partir da missão 5 e conteúdo futuro. Sem anúncios.

## 2. História (resumo; texto completo em `lore.ts` e no roteiro)
O Cristal de Cobalto dá energia limpa. A Companhia Ferro-Cobalto explora as minas além do limite; o Concílio de Aurora ignora o Relatório Arruda; o Tratado de Rio das Garças não é assinado; o campo de Meridiana colapsa e causa o Apagão. Um comboio e um bloqueio, um tiro sem autor conhecido: nascem a **Vanguarda Solar** e o **Sindicato Ferro**.

## 3. Facções
| | Vanguarda Solar | Sindicato Ferro |
|---|---|---|
| Estilo | Blindados, energia, defesa | Velocidade, artilharia, pressão |
| Bônus | +20% blindagem, +30% energia | +20% velocidade e alcance |
| Exclusivo | Tanque Prisma | Artilharia Pesada |
| Superpoder | **Pulso Solar** (feixe orbital ~3 s em área) | **Barragem de Artilharia** (14 obuses em área) |

## 4. Loop principal
Construir base → coletar Cristal → treinar e evoluir tropas → atacar/defender → vencer destruindo as construções inimigas.

## 5. Mecânicas
- **Economia:** Extratores coletam cristal (que regenera lentamente) e levam à Refinaria.
- **Energia:** Geradores; sem energia a produção cai pela metade e o radar desliga.
- **Tecnologia:** Centro → Gerador → Refinaria/Quartel → Fábrica/Radar → Laboratório/Heliporto.
- **Evolução:** upgrade pago (3 níveis) e veterania por abates (3 patentes).
- **Névoa de guerra** e minimapa.
- **Superpoder de facção:** requer Central de Radar; recarga 150 s (começa com 60 s); área de ~5,5 tiles; a IA (Normal/Difícil) também usa.
- **Reparo:** botão 🔧 (tecla R): +35% de vida por 12% do custo, recarga de 4 s por prédio.
- **Ponto de reunião:** 📍 define para onde vão as tropas novas.
- **Controles:** toque/mouse, caixa de seleção, grupos 1–9, atacar-mover (A), parar (S), evoluir (U), vender (Del), superpoder (Q).

## 6. Conteúdo
- **Unidades:** Infantaria, Lança-Foguetes, Atirador de Elite, Jipe, Tanque, Extrator, Artilharia (Ferro), Prisma (Solar), Helicóptero.
- **Construções:** Centro, Gerador, Refinaria, Quartel, Fábrica, Radar, Laboratório, Heliporto, Torre Laser, Torre Antiaérea, Muro.
- **Mapas (5):** Vale Verde, Crateras de Ferro, Rio das Garças, Mar de Dunas, Cânions do Sul; cada um com clima/hora do dia próprios; ruínas e destroços de guerra espalhados.
- **Campanha:** prólogo narrado + 8 missões (4 grátis). Planejadas: 12 missões (9–20) incluindo o lado do Sindicato.
- **Modos:** Campanha, Escaramuça (Fácil/Normal/Difícil), Online 1x1.

## 7. Interface
Barra lateral: créditos, energia, minimapa, abas de produção, ações (Caixa, Exército, Limpar, Atacar, Parar, Vender, Reparar, Reunião, Poder). Painel de missão e faixas animadas de eventos.

## 8. Arte e áudio
3D procedural (Three.js), estilo "low-poly metálico" com contornos; sol/sombras, bloom em qualidade alta. Música procedural dinâmica (sobe de intensidade com o combate), efeitos sintetizados e som ambiente de vento e zumbido de cristais.

## 9. Técnica
Vite + TypeScript + Capacitor; mundo em lógica pura (headless) com IA e simulação testável; online via PeerJS (host autoritativo); tradução PT/EN em tempo de execução. Compra simulada na web; billing real exige plugin da loja.

## 10. Riscos e próximos passos
1. Servidor online próprio (PeerJS + TURN) para produção.
2. Compra real (Google Play Billing / StoreKit) e testes com contas de teste.
3. Implementar missões 9–20 e campanha do Sindicato.
4. Balanceamento com testes de jogadores; telemetria opcional.
5. Narrativa em jogo: personagens, vozes de rádio, finais.
6. Trilha musical composta e modelos 3D refinados.
