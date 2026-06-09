# Acelerar extração de documentos

Alterar apenas `supabase/functions/extract-case-data/index.ts`. Sem mudanças de schema, UI, hooks ou outras functions.

## Mudanças

1. **Trocar modelo** de `google/gemini-2.5-pro` para `google/gemini-2.5-flash`.
   - ~3-5× mais rápido, mesma API (tool calling), qualidade suficiente para OCR de RG/CNH/holerite.

2. **Paralelizar download + base64** dos arquivos.
   - Hoje: `for` sequencial baixando 1 arquivo por vez.
   - Novo: `Promise.all(arquivos.map(...))` baixa e codifica todos em paralelo, depois monta `content`.

3. **Logs de tempo** com `console.time`/`timeEnd` em: `download+encode`, `ai-call`, `total`.
   - Permite medir o ganho real e diagnosticar futuros lentidão via `edge_function_logs`.

## O que NÃO muda

- Background com `EdgeRuntime.waitUntil` + resposta 202 (já implementado).
- `TelaProcessando` e polling do cliente.
- Schema do tool call, system prompt, escrita no banco.
- `pre-extract-cpf` continua usando `gemini-2.5-flash-lite`.

## Fallback considerado (não incluído agora)

Se `flash` perder qualidade em algum caso real, adicionar retry automático com `gemini-2.5-pro` quando o tool call vier vazio/inválido. Faço isso só se aparecer regressão.
