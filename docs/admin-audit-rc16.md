# ATTOZAP 2.0 Pro rc.16 — auditoria da branch `admin`

## Resultado executivo

A branch `admin` foi criada a partir do fluxo corrigido de renovação rc.16 e recebeu um ciclo de auditoria focado no desktop local. O commit publicado é `5acc75c`, com as correções de realtime do WebChat, stickers, envio sem bloqueio desnecessário, atualização de identidade PN/LID e consolidação visual do compositor.

O par Ed25519 foi mantido. A chave pública continua com SHA-256 `7bff2dca7b4bc7bb2ce235e1c27e4e9ee2edc2cd1c3e08d64084cff63fdcd0b7`. A chave privada não foi adicionada ao commit nem ao artefacto seguro do GitHub; permanece apenas no pacote confidencial do operador.

## Correções do WebChat

O pipeline de entrada agora emite a mensagem assim que o evento do WhatsApp é persistido, sem esperar pelo download da mídia, pela foto de perfil ou pela resolução completa de PN/LID. Quando a identidade é resolvida, o processo emite uma atualização granular para a mesma mensagem e para a mesma conversa. Quando o download termina, outra atualização substitui o placeholder pelo ficheiro local. Essa separação reduz o tempo até a mensagem aparecer e evita reloads completos.

A atualização da lista de conversas passou a ser agrupada em segundo plano. Isso evita várias consultas SQLite concorrentes quando chegam mensagens em sequência e reduz re-renderizações bruscas no renderer.

O envio para conversas que já possuem identidade confirmada reutiliza a identidade PN/LID persistida em `chat_cache` e `wa_identities`, evitando uma consulta de rede antes de cada mensagem. Para um número novo, a confirmação pelo WhatsApp continua obrigatória; o sistema não cria um JID fictício nem permite um envio fantasma.

Stickers WebP passaram a ter dimensões e área próprias no renderer. Enquanto o ficheiro não está disponível, o balão mostra `A carregar figurinha…` em vez de parecer vazio. A mesma estratégia foi aplicada a imagem, vídeo, áudio e documento. Falhas de download passam a apresentar uma mensagem clara no balão.

O compositor foi consolidado com altura elástica, largura mínima controlada, botão de envio estável e breakpoints para desktop, tablet e mobile. A folha global recebeu regras específicas para evitar elementos comprimidos e para manter o estado de gravação visível.

## Auditoria de contratos e build

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Aprovado |
| `npm run ipc:check` | Aprovado: 110 canais, 110 handlers únicos |
| `npm run delivery:check` | Aprovado |
| `npm run build` | Aprovado |
| `git diff --check` | Aprovado |
| Bundle principal rc.16 | Recompilado |
| KeyGen rc.16 | Mantido compatível com a mesma chave pública |
| Chave privada em Git | Não incluída |
| ZIP seguro publicado | Sem chave privada |

A auditoria estática também percorreu as páginas do renderer e as folhas CSS em busca de larguras rígidas, `nowrap` excessivo, breakpoints duplicados, listeners de mensagens, bridges IPC e padrões de renderização de mídia. A validação contra um WhatsApp real depende de sessão, rede e eventos Baileys ativos no Windows; por isso, o pacote deve ser testado com uma conta conectada, uma mensagem recebida, uma figurinha WebP e um envio para conversa existente e para número novo.

## Publicação e segurança

A branch remota `admin` foi publicada no repositório privado `gleyson-bots/Attozap-2.0-pro`. O commit contém apenas código e estilos. O ZIP seguro destinado ao GitHub inclui o WASender, o KeyGen, a chave pública e este conjunto de instruções. O ZIP confidencial do operador inclui adicionalmente `license-private.pem`, mas não deve ser enviado a repositórios, releases ou clientes.

Para atualizar o Windows, substitua o WASender pelo executável rc.16 final e mantenha o KeyGen rc.16 do pacote compatível. Não apague a pasta de dados do Electron se quiser preservar sessões, contas, campanhas e histórico do WhatsApp.

## Limitações conhecidas e prevenção de regressões

A entrega não altera a versão comercial, o par de chaves ou o contrato de licença. O caminho crítico de um número novo continua mais lento por desenho, pois exige confirmação real do WhatsApp. O caminho de uma conversa já validada foi otimizado para não repetir essa consulta.

A próxima validação recomendada é executar uma matriz manual no Windows com quatro casos: mensagem de texto recebida, figurinha recebida, envio de texto numa conversa existente e abertura de conversa por número novo. Deve-se observar também a reconciliação de ACK, a ausência de mensagens duplicadas e a manutenção do QR/session state.
