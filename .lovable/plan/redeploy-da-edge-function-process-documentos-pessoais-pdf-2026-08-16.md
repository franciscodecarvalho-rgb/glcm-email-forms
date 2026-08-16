# Redeploy da Edge Function `process-documentos-pessoais-pdf`

## Objetivo
Publicar novamente, sem qualquer alteração de código, a Edge Function `process-documentos-pessoais-pdf` no estado do commit `266f4c0`.

## Escopo
- Deploy apenas de `process-documentos-pessoais-pdf`.
- Preservar `verify_jwt = false` já definido em `supabase/config.toml` (a função valida o usuário internamente via `auth.getUser`).
- Nenhum arquivo editado, nenhuma migration aplicada, nenhuma outra função tocada, nenhum dado alterado.

## Passos
1. Confirmar que a árvore do sandbox corresponde ao commit `266f4c0` e está limpa.
2. Executar o deploy somente dessa função no projeto Supabase conectado.
3. Reportar status do deploy e confirmar que a configuração de JWT foi preservada.

## Fora do escopo
Correções de parser, mudanças de prompt/modelo de IA, banco, RLS, frontend e demais Edge Functions.
