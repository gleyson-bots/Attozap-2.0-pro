# Planos comerciais ATTOZAP 2.0 Pro

A matriz abaixo é a fonte comercial usada pelo desktop rc.12, pelo serviço de quotas e pelo KeyGen.

| Plano | Contas WhatsApp | Saídas/dia | Destinatários/campanha | Inícios de campanha/dia | Perfis de aquecimento | Aquecimento/dia | IA/dia | Recursos |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| **Plus** | 1 | 250 | 1.000 | 2 | 1 | 40 | 50 | WebChat, Contact Sender, Campanhas, Delivery Center, Aquecimento, Contatos e Templates |
| **Pro** | 3 | 1.500 | 10.000 | 10 | 3 | 150 | 300 | Plus + grupos, IA, agendamentos, filtros, Auto Reply e relatórios |
| **Ultra** | 10 | 5.000 | 50.000 | 30 | 10 | 500 | 1.000 | Todos os recursos do aplicativo |
| **Enterprise** | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Todos os recursos do aplicativo |

As quotas diárias são agregadas por licença e por data local. Mensagens do WebChat, campanhas, respostas automáticas e mídia consomem a quota comum de saída. O Enterprise usa `null` no payload assinado para representar ilimitado; não é utilizado um número artificialmente alto.

A chave privada permanece fora do aplicativo e deve ser selecionada localmente pelo KeyGen. O desktop verifica a assinatura Ed25519, a validade, o fingerprint opcional, os recursos e as quotas antes de permitir operações protegidas.
