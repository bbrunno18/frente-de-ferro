# Google Play — Formulário "Segurança dos dados" (rascunho de respostas)
Responda conforme a versão que você publicar. Revise a cada novo SDK (anúncios, analytics, compras).

| Pergunta | Resposta sugerida (versão atual, sem anúncios) |
|---|---|
| O app coleta ou compartilha dados do usuário? | **Sim** — apenas dados de rede transitórios para o modo online (se você hospedar o servidor) |
| Tipos de dados | **Identificadores do dispositivo ou outros** → endereço IP (processado de forma efêmera para conectar partidas) |
| Finalidade | Funcionalidade do app |
| Dados compartilhados com terceiros? | Não (servidor próprio). Se usar o servidor público do PeerJS/STUN do Google, declare como compartilhamento de IP |
| Dados criptografados em trânsito? | Sim (WSS/HTTPS e DTLS do WebRTC) |
| O usuário pode pedir exclusão? | Sim — nada é guardado no servidor; dados locais somem ao limpar/desinstalar |
| Política de privacidade (URL) | **obrigatório** — publique `politica-de-privacidade.md` em uma URL |
| Público-alvo | 13+ (ou 16+; evite "crianças" para não cair no programa Families) |
| Anúncios? | Não (marque Sim e liste o SDK se adicionar) |
| Contém compras no app? | Não |

## Se adicionar anúncios depois
Declarar: ID de publicidade, dados de uso do app e diagnósticos; finalidade Publicidade; compartilhamento com a rede de anúncios; implementar consentimento (UMP/CMP) onde necessário.
