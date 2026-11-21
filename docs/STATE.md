# STATE

## SDD Status

SPEC-001 + SPEC-002 IMPLEMENTED; SPEC-003 BASF RETIFICAÇÃO EM PRODUÇÃO PARCIAL;
SPEC-004 + SPEC-005 IMPLEMENTED LOCALLY, RELEASE PENDING;
SPEC-006 IMPLEMENTED LOCALLY, RELEASE PENDING

## Current State

Aplicação web React/Vite autenticada, integrada ao Supabase, com cadastro e fluxo de
casos, upload, extração de dados pessoais/contracheques, revisão, cálculos e geração
de documentos. A migration e a Edge Function da SPEC-003 foram confirmadas pelo
Lovable; publicação do frontend ainda requer confirmação.

## Active Spec

SPEC-007 — catálogo de empresas no cadastro manual, perfil de extração por
empresa e homologação do piloto de contracheques ADP. Mataripe e
Oxiteno conciliadas nos conjuntos locais. Petrobras concluída no teste
de 60 PDFs. Moeve tem as 69 competências recuperadas; a auditoria confirmou
que as 14 pendências são da própria fonte (12 totais que duplicam rubricas,
01/2020 com linhas ausentes e 01/2022 sem totais impressos), não um erro de
leitura do parser. O PDF de Franque mistura TRONOX e BASF e não é elegível para o piloto
de empresa única sem separação ou regra de agregação aprovada. A separação por
empregador foi concluída para a validação e produziu duas planilhas independentes:
47 competências BASF e 10 competências TRONOX, sem divergências financeiras
após a correção do fechamento por líquido/proventos. A SPEC-006
documenta o fallback de IA. A planilha Oxiteno foi regenerada pela leitura
vetorial homologada com 36 competências, AHRA de R$ 50,75 em 11/2025 e valor
histórico de R$ 6.894,95; o arquivo antigo de 25 linhas permanece preservado
como histórico, fora da validação atual. As versões antigas da pasta de
validação foram preservadas na subpasta `Historico`, evitando que sejam
confundidas com os quatro artefatos atuais.

## Next Spec

NONE

## Known Issues

- um stash de segurança preserva o estado local anterior à sincronização com
  `origin/main`;
- `npm run lint` falha com erros legados; lint seletivo também aponta usos
  preexistentes de `any` em `TelaConfirmacao.tsx` e `Caso.tsx`;
- `arquivos.processado` é usado pela implementação, mas não aparece nas migrations
  nem nos tipos locais;
- importações manuais iniciadas ficam como registros técnicos provisórios até a
  confirmação final; a trigger e a nova coluna ainda dependem da migration no
  banco remoto;
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

Em 29/10/2026, correção localizada de tipagem: o cliente de Temas declara o
contrato de `excluir_tema` já versionado na migration, sem editar tipos gerados;
a função de exclusão de casos cancelados usa o tipo explícito do cliente para
evitar inferência de schema `never`. Nenhuma lógica, migration ou RLS alterada;
nenhuma função ou frontend publicado nesta correção.

Na correção local de 30/09/2026, o fluxo manual só promove o registro a Caso após
a confirmação. PDFs pessoais passam pelo Gemini; a
leitura determinística complementa os dados sem substituir valores válidos por
respostas vazias. Falha ou resposta inutilizável conserva os arquivos anexados e
abre confirmação manual; após a confirmação, o erro de processamento é limpo.
Contracheques continuam fora do Gemini. A família AHRA Birla Carbon também
reconhece `Adic.Rep.Aliment.s/Fer` somente como provento e nesse modelo.

Validação local: 295 testes passaram; `npm run build` passou com avisos
preexistentes de Browserslist/chunk. Lint seletivo continua mostrando `any`
preexistentes em componentes afetados e não apontou erros nos novos trechos.
Não foi possível executar a migration contra banco local/remoto nesta sessão;
nenhum deploy remoto foi realizado.

Correção local seguinte: documentos pessoais são enviados ao modelo Gemini como
arquivo PDF no formato multimodal `file` do Chat Completions, em vez de `image_url`;
a instrução pede leitura visual explícita do CPF na CNH. A correção cobre o fluxo
de novo caso e o retry legado. CPF válido passa a bastar para identificação,
deixando RG opcional no frontend, nas duas Edge Functions e na trigger via migration
nova. Testes locais desta alteração e publicação ainda
pendentes; não presumir que a migration ou Edge Function estejam ativas em produção.

Base desta correção: `4a082b6` (`main` alinhada a `origin/main` antes das edições).
Verificação local: 297 testes passaram, `npm run build`, `npx tsc --noEmit` e
bundling sintático da Edge Function passaram. Não foi possível executar Deno ou
chamar o gateway Gemini real. Commit `b6633ee8b0a211e8248ce72e5029e5cd1161bb51`
está em `origin/main` e é reconhecido pelo Lovable.

Deploy retido até recuperar acesso ao Supabase `kaopnizsbkzxqdzmocwa` (ref
configurado no app). A conexão atual só tem acesso a `pcquefluiltrvwjpndvw`, que
não corresponde ao backend configurado e não contém as Edge Functions usadas pelo
fluxo. Migration e Edge Functions não foram aplicadas/publicadas; não declarar o
deploy concluído. ESLint seletivo reporta violações legadas nos arquivos grandes
tocados (incluindo `any` existente), sem ocorrências nos novos trechos.

Base do checkout antes desta correção: `fcb0fbb` (`main` sincronizada com
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

SPEC-007 implementada localmente em 2026-11-19. O piloto de Oxiteno e Mataripe
está desligado por padrão. A ativação em teste e as condições de expansão
estão na [SPEC-007](specs/SPEC-007-empresa-declarada-na-extracao.md).

SPEC-006 foi implementada localmente em 2026-11-18: fallback de IA com contexto
especializado, memória efêmera por arquivo (modelo, competência e hash, sem valores)
e até uma releitura quando as somas não conferem com os totais impressos. Divergência
persistente deixa o lote em erro para revisão, preservando os totais do PDF. A suíte
completa passou: 38 arquivos, 320 testes aprovados e 2 cenários de PDF real ignorados
por falta das variáveis `GLCM_MOEVE_PDF` e `GLCM_OXITENO_PDF`. `npm run build`,
`npx tsc --noEmit` e bundling sintático da Edge Function passaram. Nenhum deploy
remoto realizado.
