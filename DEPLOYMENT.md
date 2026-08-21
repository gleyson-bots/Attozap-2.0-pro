# Publicação do portal ATTOZAP

## Estado validado

O portal foi validado localmente com as migrations aplicadas, `pnpm check`, `pnpm test -- --run` e `pnpm build`. A versão recuperável mais recente é **`6d4eb245`**.

## Alojamento integrado — recomendado

O projeto já está preparado para o alojamento integrado, com o banco MySQL/TiDB, OAuth e armazenamento de ficheiros configurados no ambiente do projeto. Para publicar, abra o projeto **ATTOZAP Portal** na interface de gestão e selecione **Publish**. Antes de tornar o endereço público, confirme o domínio e a visibilidade em **Settings**.

Após a publicação, valide os seguintes fluxos com uma conta normal e uma conta com papel `admin`:

| Fluxo | Resultado esperado |
| --- | --- |
| Login e área de cliente | A conta autenticada vê apenas as suas licenças, renovações e downloads elegíveis. |
| Administração | Apenas um utilizador com o papel `admin` abre a rota `/admin` e executa mutações administrativas. |
| Licença e renovação | Uma chave de renovação é aceite apenas uma vez e cria histórico. |
| Versões | Um ficheiro publicado no S3 fica visível somente aos planos permitidos. |
| Agentes de IA | A chave do provedor é configurada por conta WhatsApp, nunca é devolvida ao navegador e pode ser removida. |

> **Nota de segurança:** não coloque chaves de provedores de IA, chaves de licença ou segredos de OAuth no cliente, em commits ou em ficheiros públicos. O portal guarda credenciais de IA cifradas no servidor e armazena chaves de licença como hashes.

## Variáveis e dados

No alojamento integrado, as variáveis de infraestrutura são fornecidas automaticamente. Não é necessário copiar ficheiros `.env` nem publicar segredos manualmente. Para mudar uma variável do projeto, utilize a área segura de **Settings → Secrets**, em vez de a escrever no repositório.

As estruturas de dados já foram aplicadas via Drizzle. Em evolução futura do schema, siga sempre esta sequência:

1. Atualize `drizzle/schema.ts`.
2. Execute `pnpm drizzle-kit generate`.
3. Reveja o SQL gerado e aplique-o uma única vez na base de dados.
4. Execute `pnpm check`, `pnpm test -- --run` e `pnpm build`.

## Vercel — alternativa com adaptação necessária

O projeto atual é um serviço Node/Express gerido e validado no alojamento integrado. A publicação direta na Vercel **não deve ser tratada como uma troca de DNS**: exige adaptar o entrypoint Express à convenção de funções serverless da Vercel, configurar as rotas `/api/trpc` e `/api/oauth/callback`, disponibilizar um MySQL/TiDB externo acessível e recriar todas as variáveis de OAuth, JWT, armazenamento e análise nesse fornecedor.

Por esse motivo, recomenda-se publicar primeiro pelo alojamento integrado, que já suporta domínio personalizado e mantém as integrações configuradas. Se ainda for necessário migrar para a Vercel, faça essa adaptação num branch separado e valide login, tRPC, uploads S3 e chamadas de IA num ambiente de pré-produção antes de apontar o domínio de produção.
