# Validação visual — landing pública

## 21 de agosto de 2026

A landing foi verificada em **1280 × 720** e **375 × 812**. A composição apresenta navegação fixa, hero com pré-visualização do produto, secções de produto, recursos, planos, atualizações, FAQ e suporte. No modo móvel, a navegação é condensada num menu e as grelhas passam para uma coluna, preservando legibilidade e acesso às ações principais.

A identidade aplicada segue uma direção de **command center verde-escuro**, com o símbolo ATTOZAP reaproveitado da branch `landing`, a hierarquia de estado operacional e CTAs de destaque reservados ao verde-mint. Não foram usados depoimentos, avaliações ou outros conteúdos de utilizador fabricados.

## Áreas autenticadas

As rotas `/painel`, `/licenca`, `/downloads`, `/agentes` e `/admin` foram verificadas visualmente após o reinício do ambiente. A área de cliente apresenta um estado vazio consistente quando ainda não existe uma licença, e o configurador de agentes apresenta o catálogo de contas, a ação de cadastro e um estado orientado para a seleção de conta. A área administrativa apresenta métricas, emissão de licença e publicação de versões para o utilizador com papel administrativo.

As ações administrativas continuam protegidas no servidor; ocultar a navegação no cliente não é o único controlo de acesso.

## Verificação final das áreas autenticadas

Após a estabilização das consultas, as páginas foram verificadas em desktop com uma conta administrativa. A administração expõe emissão, suspensão e renovação de licenças, controlo de papel, edição dos planos e publicação de versões, com uma hierarquia visual coerente e sem sobreposição. A página de agentes apresenta um estado vazio orientado para o cadastro da primeira conta WhatsApp e não mostra chaves de API. A página de licença apresenta um estado vazio claro quando não há licença associada.

Foi acrescentado o atalho **Renovações** à navegação, que direciona para a secção de renovação da licença. As consultas críticas possuem agora um estado explícito de falha com ação de repetição, além de carregamento, vazio e notificações de confirmação.

## Responsividade

As áreas de administração, agentes e licença foram também verificadas em **375 × 812**. Os formulários passam para uma coluna, os controlos permanecem acionáveis e os conteúdos longos dos planos são acomodados sem corte horizontal. A navegação compacta mostra o contexto da secção ativa. O build de produção foi concluído com sucesso; o bundler reportou apenas um aviso de tamanho de chunk, sem erro de compilação.
