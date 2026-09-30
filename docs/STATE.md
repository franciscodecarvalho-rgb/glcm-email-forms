# STATE

## SDD Status

SPEC-001 + SPEC-002 IMPLEMENTED; SPEC-003 BASF RETIFICAÇÃO EM PRODUÇÃO PARCIAL

## Current State

Aplicação web React/Vite autenticada, integrada ao Supabase, com cadastro e fluxo de
casos, upload, extração de dados pessoais/contracheques, revisão, cálculos e geração
de documentos. A migration e a Edge Function da SPEC-003 foram confirmadas pelo
Lovable; publicação do frontend ainda requer confirmação.

## Active Spec

Reconciliação local/Git — refinamento da extração de endereço linearizado; testes
e build validados, commit e publicação em andamento.

## Next Spec

NONE

## Known Issues

- `estrutura-joins-temas.html` permanece não rastreado e fora do release atual;
- um stash de segurança preserva o estado local anterior à sincronização com
  `origin/main`;
- `npm run lint` falha com erros legados; lint seletivo das áreas alteradas ainda
  aponta usos preexistentes de `any` na Edge Function;
- `arquivos.processado` é usado pela implementação, mas não aparece nas migrations
  nem nos tipos locais;
- políticas, buckets e demais partes do schema remoto não foram verificadas;
- a documentação legada em `context/` não cobre todas as Edge Functions.

## Open Decisions

- qual será a próxima mudança real a especificar;
- como resolver e validar a divergência de `arquivos.processado`;
- política desejada de isolamento/RLS;
- escopo e prioridade da correção de lint;
- fonte de verdade para o ambiente publicado e seu processo de validação.

## Unknowns

- estado efetivo do banco, buckets, policies e funções no Supabase remoto;
- confirmação do deploy do frontend para o commit mais recente;
- regras de negócio completas para cálculos, tipos de ação e documentos;
- perfis de usuário, requisitos de auditoria, retenção e níveis de serviço;
- histórico anterior ao marco zero.

## Last Verified

Checkout local sincronizado com `origin/main` até `35cc96c`; o commit de reconciliação
está em `main`. `npm run test` passou (274 testes),
`npm run build` passou e o lint seletivo dos arquivos TypeScript alterados passou.
`npm run lint` global falha com 245 erros e 23 avisos legados, incluindo
`.tmp-main-deploy`. Push realizado; confirmação do Lovable para o commit enviado ainda
pendente.
O arquivo HTML não rastreado e o stash de segurança foram preservados.
