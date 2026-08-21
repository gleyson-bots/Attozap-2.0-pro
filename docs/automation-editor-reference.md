# Referência de arquitetura do editor visual

## Decisão de licenciamento

O código do **n8n** não será copiado nem incorporado no ATTOZAP. A sua licença Sustainable Use permite uso interno e não comercial gratuito, mas restringe a distribuição comercial de um produto cujo valor derive substancialmente da sua funcionalidade. O ATTOZAP adotará apenas padrões de interação independentes, como canvas, ligações, paleta, propriedades e histórico de execuções.

Como base técnica permitida, o editor pode adotar a biblioteca **React Flow** (`@xyflow/react`), distribuída sob licença MIT. A biblioteca disponibiliza elementos típicos de um editor de nós, incluindo arrastar, zoom, pan, seleção múltipla, criação/remoção de elementos, minimapa e controlos. A integração será encapsulada numa camada de adaptação que preserva o formato e o runtime local atual dos workflows.

## Contrato de compatibilidade

O formato persistido pelo runtime continua a ser a fonte de verdade. O editor converte apenas entre esse formato e a representação visual do canvas, sem alterar as tabelas, gatilhos ou nós já suportados. Workflows existentes devem continuar a abrir, guardar e executar sem migração destrutiva.

## Camada de adaptação do canvas

Cada `WorkflowNode` será exposto como um nó React Flow com a mesma `id`, `type`, `label`, `config` e posição `x`/`y`. Cada `WorkflowEdge` será exposta como uma ligação com a mesma origem, destino e condição opcional. Ao mover um nó no canvas, apenas `x` e `y` serão atualizados no workflow; ao criar ou remover uma ligação, apenas a lista de arestas será atualizada.

O editor preservará as semânticas atuais do runtime: uma ligação sem condição é o caminho normal; a saída de um nó de condição pode ser marcada como **Verdadeiro** ou **Falso**; ciclos e nós desligados serão mostrados como erros de validação antes de guardar ou executar. A opção de reconstruir ligações lineares continuará disponível para workflows simples, mas não sobrescreverá ramificações existentes sem confirmação.

## Fontes consultadas

- https://docs.n8n.io/privacy-and-security/sustainable-use-license/
- https://reactflow.dev/
