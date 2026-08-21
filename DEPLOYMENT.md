# Publicação do portal ATTOZAP na Vercel

## Arquitetura incluída

O portal usa **React + Vite** no frontend, uma função **Express/tRPC** em `api/[...path].ts`, **MySQL/TiDB** através de Drizzle e armazenamento S3 compatível para instaladores. A autenticação é própria: cada utilizador entra com email e palavra-passe; a sessão é assinada e entregue num cookie HTTP-only. Não há redirecionamento OAuth nem dependência de login externo.

## Variáveis de ambiente

Cadastre estas variáveis em **Vercel → Settings → Environment Variables**, nos ambientes de produção e pré-produção. Nunca as coloque num commit.

| Variável | Finalidade |
| --- | --- |
| `DATABASE_URL` | Ligação MySQL/TiDB usada pelo Drizzle. |
| `JWT_SECRET` | Segredo aleatório longo usado para assinar sessões e cifrar as credenciais de IA. |
| `INITIAL_ADMIN_EMAIL` | Email que recebe papel `admin` quando se regista pela primeira vez. |
| `S3_BUCKET` | Bucket que armazena versões do aplicativo. |
| `S3_REGION` | Região do fornecedor S3 ou `auto` para R2. |
| `S3_ENDPOINT` | Endpoint S3 compatível, se aplicável. |
| `S3_ACCESS_KEY_ID` | Chave de acesso do bucket com permissão limitada. |
| `S3_SECRET_ACCESS_KEY` | Segredo da chave de acesso do bucket. |
| `S3_PUBLIC_BASE_URL` | Base pública/CDN opcional; se estiver vazia, os downloads usam URL assinada. |

> Gere `JWT_SECRET` com pelo menos 32 caracteres aleatórios e mantenha-o estável. Alterá-lo invalida sessões e impede a leitura de chaves de IA já cifradas.

## Procedimento de publicação

1. Importe o repositório no painel da Vercel e selecione a branch do portal.
2. Confirme o gestor de pacotes `pnpm`. O projeto executa `pnpm build` e publica `dist/public`.
3. Crie as variáveis indicadas acima, ligando um MySQL/TiDB acessível à Vercel e um bucket S3 compatível.
4. Antes do primeiro deploy de produção, aplique as migrations Drizzle na mesma base de dados. Reveja sempre o SQL gerado antes de o executar.
5. Faça o deploy e visite `/api/health`; a resposta esperada é `{ "status": "ok" }`.
6. Registe o email definido em `INITIAL_ADMIN_EMAIL`, crie a palavra-passe e entre no portal. Esse utilizador recebe o papel administrativo.
7. Publique uma versão de teste e valide a elegibilidade de download, a emissão/renovação de licença e o acesso por papel.

## Validação pós-publicação

| Fluxo | Resultado esperado |
| --- | --- |
| Registo e entrada | A sessão persiste apenas no cookie HTTP-only e não usa tokens no navegador. |
| Área do cliente | Cada utilizador vê apenas licenças, renovação, downloads e contas WhatsApp próprias. |
| Administração | Apenas utilizadores com `role = admin` podem emitir, renovar ou suspender licenças, gerir papéis e publicar versões. |
| Agentes de IA | A chave é cifrada no servidor, nunca regressa ao cliente e pode ser removida. |
| Downloads | Ficheiros autorizados usam armazenamento S3 e regras de plano no servidor. |

## Evolução do schema

Para qualquer alteração de dados, atualize `drizzle/schema.ts`, execute `pnpm drizzle-kit generate`, reveja a migration SQL, aplique-a uma vez na base de dados e execute `pnpm check`, `pnpm test -- --run` e `pnpm build` antes de publicar.
