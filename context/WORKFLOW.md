# WORKFLOW.md — Fluxo operacional

## Estados implementados

```text
novo
  ↓
em_analise
  ↓
aguardando_confirmacao
  ↓
aguardando_pasta
  ↓
concluido
```

Estado alternativo: `cancelado`.

Não criar novos status sem mapear transições, interface, banco, automações e testes.

## Etapas e responsabilidades

| Etapa | Entrada | Execução | Persistência | Saída |
|---|---|---|---|---|
| Cadastro | Dados e arquivos | Criar caso | `casos`, `arquivos`, Storage | Caso `novo` |
| Pré-extração | Arquivos | CPF, nome e duplicidade | `casos` | Caso classificado |
| Extração | Caso e arquivos | Processar lotes com IA | `lotes_extracao`, `casos` | Dados consolidados |
| Contracheques | Resultado da IA | Estruturar holerites/rubricas | `contracheques`, `itens_contracheque` | Base de cálculo |
| Confirmação | Dados extraídos | Revisão humana | `casos` | Dados aprovados |
| Cálculos | Dados aprovados | Pasta e valor da causa | `casos` | Pronto para geração |
| Geração | Caso + templates | Gerar peças e planilha | Storage, `casos` | Documentos finais |
| Conclusão | Documentos | Disponibilizar download | `casos` | `concluido` |

## Invariantes

- Um caso não deve avançar sem os dados exigidos pela etapa seguinte.
- Reprocessamento não deve duplicar lotes, arquivos ou documentos.
- Consolidação de lotes deve ocorrer uma única vez por execução.
- Correção humana prevalece sobre dado inferido pela IA.
- Documento gerado deve corresponder ao caso e ao template selecionado.
- Falhas devem ser visíveis e recuperáveis, sem marcar conclusão indevida.

## Propostas ainda não implementadas

Assinatura, lembretes, Legal One, Drive e WhatsApp pertencem ao fluxo futuro.
Só incorporá-los ao fluxo oficial após implementação e validação.
