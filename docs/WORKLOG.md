# Worklog

## 2026-09-30 — Gemini lê CPF da CNH; RG opcional com CPF válido

- A CNH escaneada era enviada no Chat Completions como `image_url` contendo
  `application/pdf`, não como entrada de arquivo PDF. Ajustado para a parte
  multimodal `file` com nome, MIME/Base64 preservados e instrução explícita para
  ler o campo CPF visualmente, inclusive sem camada de texto; a correção vale no
  upload de novo caso e no retry legado `extract-case-data`.
- A confirmação do caso agora exige nome, CPF válido, logradouro e rubricas;
  RG continua disponível para extração/edição, mas não bloqueia o caso quando há
  CPF válido. A mesma regra foi aplicada à finalização de reprocessamento e à
  trigger SQL, preservando os demais requisitos de importação.
- Adicionados testes de regressão para a forma de envio do PDF e para CPF válido
  sem RG, além de CPF ausente/inválido com RG.
- Validação: 297 testes passaram; `npm run build`, `npx tsc --noEmit` e bundling
  sintático da Edge Function passaram. ESLint seletivo falha por violações legadas
  (incluindo `any` preexistente), sem achados nos novos trechos.
- Limite: não foi possível invocar o Gemini real (credencial/gateway não disponível),
  executar Deno (CLI ausente) ou testar/aplicar a migration em banco local/remoto.
  Migration, função Edge e deploy ainda não chegaram à produção.

## 2026-09-30 — Reconciliação pós-Lovable

- Regra adicionada ao contrato do projeto e ao checklist de release: verificar os SHAs
  local, remoto, reconhecido pelo Lovable e publicado antes e depois de cada etapa do
  Lovable que possa sincronizar commits.
- Se o remoto avançar, inspecionar commits/diff antes de sincronizar; usar somente
  fast-forward quando seguro, preservando alterações locais e sem reset ou force-push.
- O deploy só pode ser declarado concluído quando houver evidência do SHA publicado e
  os SHAs relevantes estiverem alinhados; divergências inesperadas mantêm a demanda
  pendente e devem ser comunicadas.
- Atualizados `AGENTS.md`, `docs/RELEASE-PROCESS.md`, `MEMORY.md` e o espelho
  `.claude/CLAUDE.md`.

## 2026-09-30 — Importação de casos só após validação

- A causa do alerta genérico na tela de upload incluía uso de `etapa` capturado
  por closure, que podia estar vazio/desatualizado no `catch`.
- O upload manual agora mantém um mesmo registro provisório durante retries,
  usa caminhos estáveis no Storage, habilita upsert e verifica erros ao gravar
  metadados.
- Uma importação provisória não entra no Dashboard até a confirmação final.
- A confirmação manual e a confirmação dos dados extraídos promovem a importação;
  antes disso o banco valida campos de identificação/endereço, comprovantes,
  rubricas extraídas e todos os lotes concluídos.
- Erros de confirmação mostram o detalhe retornado pelo banco.
- Backfill oculta importações manuais antigas que ainda estão no status inicial.
- Testes: `npm test -- --run` — 295 passaram. `npm run build` — passou com avisos
  já existentes sobre Browserslist e tamanho de bundle. ESLint seletivo mostrou
  somente erros `no-explicit-any` preexistentes em linhas antigas.
- Limite de validação: sem banco Supabase local/remoto disponível para aplicar e
  testar a migration; ainda requer aplicação do schema e publicação pelo Lovable.
