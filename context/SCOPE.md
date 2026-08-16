# SCOPE.md — Controle de escopo

## Regra de mudança mínima

Toda tarefa deve ser classificada antes da implementação:

| Classe | Permitido | Proibido sem autorização |
|---|---|---|
| Correção | Corrigir a causa do defeito | Refatorar módulos adjacentes |
| Visual | CSS, conteúdo e componente solicitado | Alterar regra de negócio ou banco |
| Funcional | Fluxo explicitamente solicitado | Criar recursos extras |
| Dados | Migration e contratos necessários | Alterar/apagar dados existentes |
| Análise | Inspecionar e explicar | Modificar código ou produção |

## Matriz obrigatória da tarefa

Antes de editar, preencher mentalmente ou no plano:

```text
Objetivo:
Entregável:
Incluído:
Excluído:
Arquivos afetados:
Comportamentos preservados:
Critérios de aceitação:
Testes:
Riscos:
```

## Requisitos

- **Explícito:** escrito por Nodley; deve ser implementado.
- **Implícito necessário:** indispensável para o explícito funcionar; implementar o mínimo.
- **Sugestão:** pode melhorar o projeto, mas não pertence ao pedido; não implementar.
- **Ambiguidade decisiva:** muda resultado, dados ou arquitetura; pedir direção.

## Limites de alteração

- Não editar arquivos fora da área diretamente afetada.
- Não alterar dependências sem necessidade comprovada.
- Não mudar contratos públicos silenciosamente.
- Não renomear tabelas, colunas, rotas ou status por estética.
- Não atualizar versões de bibliotecas durante tarefa não relacionada.
- Não corrigir problemas encontrados incidentalmente; registre-os como observação.
- Não executar deploy automaticamente.

## Revisão final de escopo

Antes da entrega, responder:

1. Cada arquivo alterado era necessário?
2. Cada linha alterada contribui para o pedido?
3. Alguma mudança foi feita apenas porque parecia melhor?
4. Algo fora do escopo mudou de comportamento?
5. Há uma sugestão misturada à implementação?

Se qualquer resposta indicar expansão, reduza o diff antes de entregar.
