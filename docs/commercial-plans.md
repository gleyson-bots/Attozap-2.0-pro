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

## Subscrição mensal e chaves de renovação

A licença assinada identifica o cliente, o plano, os recursos e a máquina. Para planos com modalidade `subscription`, ela não concede acesso indefinido: o aplicativo exige também um token assinado de renovação mensal.

O KeyGen emite esse token separadamente, com um `renewalId` de uso único, o `licenseId` ao qual pertence, o plano, o fingerprint opcional e a quantidade de dias contratados. O padrão comercial é de **30 dias**, embora a autoridade possa emitir entre 1 e 366 dias.

O ATTOZAP guarda localmente a data de início, a data de expiração, o último `renewalId` e o histórico de tokens usados. Ao atingir a data final, as operações protegidas ficam bloqueadas e o gate inicial pede apenas a chave de renovação; a licença original não precisa ser colada novamente. Uma nova renovação acrescenta dias ao período atual quando ainda ativo ou inicia um novo período a partir do momento da aplicação quando já expirado.

Licenças antigas sem o campo `billingMode` continuam a ser tratadas como perpétuas para preservar compatibilidade. A chave privada permanece exclusivamente no KeyGen ou na autoridade emissora e nunca é distribuída com o executável desktop.
