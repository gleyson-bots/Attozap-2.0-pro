# ATTOZAP 2.0 Pro

Rebuild moderno do ATTOZAP/WASender, criado do zero com arquitetura desacoplada e foco em produto desktop profissional.

## Stack inicial

- Electron 43 + TypeScript
- React 19 + Vite 8
- Baileys 7.0.0-rc13 atrás de um `MessagingProvider`
- SQLite com `better-sqlite3`, WAL, foreign keys e busy timeout
- Licenciamento assinado com Ed25519
- UI enterprise responsiva com tema dark/light

## Executar

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## O que já existe na fundação

- Shell desktop endurecido (`contextIsolation`, sandbox, sem Node no renderer)
- Dashboard operacional
- Central de licenças
- Control Center administrativo
- Command palette
- Design system responsivo
- SQLite local preparado para auditoria, licenças e instâncias
- Contrato de provider de mensageria
- Adapter inicial Baileys 7
- Emissão/validação offline de licenças Ed25519
- Fingerprint opcional de dispositivo

## Princípio de arquitetura

A base antiga é usada como catálogo funcional, não como código para port direto. UI, banco, licenciamento e transporte WhatsApp ficam separados para que uma troca de provider não obrigue a reescrever o produto.

Veja [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Próximos módulos

1. Identity, RBAC e tenants
2. Session Manager multi-instância
3. Inbox e persistência de mensagens
4. Contatos/CRM
5. Campanhas e filas
6. Automações e agendamentos
7. Grupos e ferramentas de importação/exportação
8. License Authority online + revogação/lease
9. Billing e planos
10. Telemetria, logs e atualização automática do desktop

> A chave privada da autoridade de licenças nunca deve ser distribuída junto do desktop.
