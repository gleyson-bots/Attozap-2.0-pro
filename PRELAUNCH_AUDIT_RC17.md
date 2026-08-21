# Auditoria de pré-lançamento — ATTOZAP V2 RC.17

**Data:** 21 de agosto de 2026
**Escopo:** Aplicação desktop Electron, interface React, motor de automações locais, contratos IPC, entrega de mensagens, licenciamento e distribuição Windows portátil.

## Correção incluída

O editor **Visual Automations** passou a preservar a rolagem vertical da página fora do modo foco. A biblioteca de nós e o inspector também possuem rolagem independente, evitando que blocos abaixo da área visível fiquem inacessíveis em ecrãs compactos. O modo foco mantém o canvas sem rolagem externa para preservar a operação de arrastar, ligar e enquadrar nós.

O verificador `workflow:editor:check` agora protege explicitamente este comportamento contra regressões, além de validar os 11 tipos de nó, os ramos condicionais, a persistência de posições e as proteções dos nós Telegram e HTTP/HTTPS.

## Validações executadas

| Verificação | Resultado |
| --- | --- |
| TypeScript (`npm run typecheck`) | Aprovado |
| Contrato do editor (`npm run workflow:editor:check`) | Aprovado — 11 tipos de nó |
| Contrato IPC (`npm run ipc:check`) | Aprovado — 131 canais únicos |
| Contrato de entrega (`npm run delivery:check`) | Aprovado |
| Build de produção (`npm run build`) | Aprovado |
| Auditoria de dependências de produção (`npm audit --omit=dev --audit-level=high`) | 0 vulnerabilidades encontradas |
| Empacotamento portátil Windows (`npm run pack:portable`) | Aprovado |

## Controlo de segurança revisto

O nó HTTP/HTTPS restringe-se a URLs públicas, verifica DNS antes do pedido, bloqueia destinos privados/locais e redirecionamentos, limita o corpo a 8 KB e usa timeout de 12 segundos. O nó Telegram valida o formato do token e privilegia a variável de ambiente `ATTOZAP_TELEGRAM_BOT_TOKEN`. O motor de workflows, os envios automáticos, aquecimento, campanhas e agente de IA continuam sujeitos aos controlos de funcionalidades da licença.

## Artefacto de distribuição

| Ficheiro | Tamanho | SHA-256 |
| --- | ---: | --- |
| `ATTOZAP-WASender-Pro-2.0.0-rc.17-x64.exe` | 97 MB | `f3d5a7907b11560aa619df95407c769d6859fc909aa7fc9fa39325c2a7ecb19c` |

> A validação automatizada reduz o risco de regressões nos contratos críticos, mas não substitui o teste final num computador Windows representativo, com contas WhatsApp reais, token Telegram de teste e uma API HTTP pública de homologação.
