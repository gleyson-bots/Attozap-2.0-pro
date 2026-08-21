# ATTOZAP Portal

Portal de licenças, downloads e agentes de IA do ATTOZAP. O frontend é React/Vite; a API é Express com tRPC numa função Vercel; a persistência usa MySQL/TiDB com Drizzle.

## Autenticação

O projeto tem autenticação própria por **email e palavra-passe**. As palavras-passe recebem hash scrypt no servidor e as sessões usam cookies HTTP-only, `Secure` em produção e `SameSite=Lax`.

Defina `INITIAL_ADMIN_EMAIL` no ambiente de produção antes do primeiro registo. A primeira conta criada com esse email recebe o papel `admin`.

## Desenvolvimento local

1. Instale Node.js 22+ e pnpm.
2. Crie variáveis locais para `DATABASE_URL`, `JWT_SECRET`, `INITIAL_ADMIN_EMAIL` e, se for publicar instaladores, as variáveis S3.
3. Instale dependências com `pnpm install`.
4. Aplique as migrations revistas na sua base de dados MySQL/TiDB.
5. Execute `pnpm dev` e aceda a `http://localhost:3000`.

## Qualidade

```bash
pnpm check
pnpm test -- --run
pnpm build
```

## Publicação

O repositório inclui `vercel.json` e a função `api/[...path].ts`. Importe a branch do portal na Vercel, cadastre as variáveis de ambiente e siga o procedimento de [DEPLOYMENT.md](./DEPLOYMENT.md). O endpoint `/api/health` deve responder com `{ "status": "ok" }` após o deploy.

## Segurança

Não envie ficheiros `.env`, credenciais de IA, segredos de sessão ou chaves S3 para o repositório. As chaves de provedores de IA são cifradas no servidor; os ficheiros de versão ficam no armazenamento S3 compatível.
