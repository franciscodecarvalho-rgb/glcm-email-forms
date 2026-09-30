# Worklog

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
