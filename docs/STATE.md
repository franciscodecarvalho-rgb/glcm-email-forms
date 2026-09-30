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
- a migration `20260930115916_harden_authenticated_data_access.sql` foi criada
  para substituir políticas tautológicas por verificação de papel e restringir
  mutações administrativas/de workers; ainda não foi aplicada ao banco publicado;
- os alertas de Storage por ausência de vínculo a proprietário permanecem
  intencionais enquanto a regra for leitura compartilhada dos casos por todos os
  usuários autenticados;
- a documentação legada em `context/` não cobre todas as Edge Functions.

## Open Decisions

- qual será a próxima mudança real a especificar;
- como resolver e validar a divergência de `arquivos.processado`;
- se a política de acesso compartilhado aos arquivos de todos os casos deve mudar;
- escopo e prioridade da correção de lint;
- fonte de verdade para o ambiente publicado e seu processo de validação.

## Unknowns

- estado efetivo do banco, buckets, policies e funções no Supabase remoto;
- confirmação do deploy do frontend para o commit mais recente;
- regras de negócio completas para cálculos, tipos de ação e documentos;
- perfis de usuário, requisitos de auditoria, retenção e níveis de serviço;
- histórico anterior ao marco zero.

## Last Verified

Na correção local de 30/09/2026 do fluxo de documentos pessoais, os comprovantes
reconhecidos continuam sendo enviados obrigatoriamente ao Gemini; o prompt agora
solicita todos os dados pessoais e campos de endereço visíveis, e a resposta é
mesclada com a leitura determinística sem descartar campos que a IA não retornou.
A gravação também preserva valores anteriores quando a nova leitura não fornece
um campo válido. Validação local: 284 testes passaram, build passou com avisos
preexistentes de Browserslist/chunk e o parser TypeScript do esbuild aceitou a
Edge Function. Deno não está instalado; não foi feito teste com chamada real ao
gateway nem deploy remoto nesta validação.

Base do checkout antes desta correção: `a8fbcd6` (`main` sincronizada com
`origin/main`). O fluxo padrão de criação chama
`process-documentos-pessoais-pdf`; o retry legado usa `extract-case-data`.
`npm run test -- --run` passou (281 testes) e `npm run build` passou, com avisos
existentes de Browserslist desatualizado e bundle acima de 500 kB. O lint global
tem erros legados conhecidos.

Para a revisão de segurança de 2026-09-30, foi consultado o schema do projeto
Lovable associado à aplicação: 7 usuários cadastrados (1 admin e 6 users) e as
políticas das tabelas/buckets analisados. A migration foi revisada, mas ainda não
aplicada; não houve alteração remota. `supabase db lint --local` não pôde conectar
porque o banco local/Docker não estava disponível. ESLint seletivo aponta 12
ocorrências `no-explicit-any` preexistentes nos arquivos afetados; o diff não
introduziu novas ocorrências. Esta correção local ainda aguarda confirmação do
fluxo de release previsto no `context/DEPLOY.md`.
