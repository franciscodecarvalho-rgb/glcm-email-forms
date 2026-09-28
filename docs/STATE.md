# STATE

## SDD Status

SPEC-001 + SPEC-002 IMPLEMENTED LOCALLY

## Current State

Aplicação web React/Vite autenticada, integrada ao Supabase, com cadastro e fluxo de
casos, upload, extração de dados pessoais/contracheques, revisão, cálculos e geração
de documentos. O estado funcional foi descrito a partir do código e das migrations
locais; o ambiente remoto não foi consultado.

## Active Spec

SPEC-002 — OCR local para contracheques digitalizados (concluída localmente;
publicação pendente)

## Next Spec

NONE

## Known Issues

- working tree já estava sujo antes do retrofit, com alterações em implementação e
  `estrutura-joins-temas.html` não rastreado;
- `npm run lint` falha com 230 erros e 23 avisos no estado validado;
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

Working tree local verificado em 2026-09-28. `npm run test` passou (175 testes);
`npm run build` passou; `npm run lint` continua falhando pelos problemas legados
registrados acima. A inspeção dos PDFs de referência confirmou os perfis legíveis e
as páginas sem camada de texto que seguem para o fallback autorizado.
