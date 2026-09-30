# STATE

## SDD Status

SPEC-001 + SPEC-002 IMPLEMENTED LOCALLY; SPEC-003 IMPLEMENTED LOCALLY

## Current State

Aplicação web React/Vite autenticada, integrada ao Supabase, com cadastro e fluxo de
casos, upload, extração de dados pessoais/contracheques, revisão, cálculos e geração
de documentos. O estado funcional foi descrito a partir do código e das migrations
locais; o ambiente remoto não foi consultado.

## Active Spec

SPEC-003 — identificação de contracheques retificados BASF (implementada localmente;
migration, Edge Function e frontend aguardam publicação)

## Next Spec

NONE

## Known Issues

- working tree já estava sujo antes do retrofit, com alterações em implementação e
  `estrutura-joins-temas.html` não rastreado;
- `npm run lint` falha com erros legados; lint seletivo das áreas alteradas ainda
  aponta usos preexistentes de `any` na Edge Function;
- `arquivos.processado` é usado pela implementação, mas não aparece nas migrations
  nem nos tipos locais;
- o schema e o deploy remotos não foram verificados;
- a documentação legada em `context/` não cobre todas as Edge Functions.

## Open Decisions

- qual será a próxima mudança real a especificar;
- como resolver e validar a divergência de `arquivos.processado`;
- política desejada de isolamento/RLS;
- escopo e prioridade da correção de lint;
- fonte de verdade para o ambiente publicado e seu processo de validação.

## Unknowns

- estado efetivo do banco, buckets, policies e funções no Supabase remoto;
- commit efetivamente publicado no Lovable e sincronização com o GitHub;
- regras de negócio completas para cálculos, tipos de ação e documentos;
- perfis de usuário, requisitos de auditoria, retenção e níveis de serviço;
- histórico anterior ao marco zero.

## Last Verified

Worktree isolada verificada em 2026-09-29. `npm run test` passou (272 testes);
`npm run build` passou; `npm run lint` continua falhando pelos problemas legados
registrados acima. A SPEC-003 foi validada com teste da marca BASF `R` e teste de
agregação que confirma substituição do recibo original pela versão retificada na
mesma competência, sem descartar valores de outras empresas. Migration, Edge Function
e frontend ainda precisam ser publicados; casos antigos precisam ser reprocessados.
