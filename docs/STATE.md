# STATE

## SDD Status

SPEC-001 + SPEC-002 IMPLEMENTED; SPEC-003 BASF RETIFICAÇÃO EM PRODUÇÃO PARCIAL

## Current State

Aplicação web React/Vite autenticada, integrada ao Supabase, com cadastro e fluxo de
casos, upload, extração de dados pessoais/contracheques, revisão, cálculos e geração
de documentos. A migration e a Edge Function da SPEC-003 foram confirmadas pelo
Lovable; publicação do frontend ainda requer confirmação.

## Active Spec

Restaurar a extração por IA exclusivamente para comprovantes de residência, sem
alterar a extração determinística de contracheques nem encaminhar documentos de
identidade ao Gemini.

## Next Spec

NONE

## Known Issues

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

Base desta alteração: `d264400` (`main` e `origin/main`). O fluxo padrão de criação
chama `process-documentos-pessoais-pdf`; o retry legado usa `extract-case-data`.
`npm run test` passou (281 testes) e `npm run build` passou, com avisos existentes
de Browserslist desatualizado e bundle acima de 500 kB. Lint global falha com 240
erros e 23 avisos legados; ESLint do novo helper/teste passou, mas os arquivos Edge
Functions ainda reportam erros legados. A validação local das Edge Functions não
iniciou porque o Docker Desktop está indisponível.
Commit, push e confirmação do Lovable desta alteração ainda pendentes.
