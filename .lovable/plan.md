# Diagnóstico: `Failed to send a request to the Edge Function`

## Evidência dos logs (somente leitura)

**`process-contracheques-pdf`** — único registro recente:

- Horário: `2026-08-16T14:24:44Z` (UTC)
- Nível: `ERROR` / tipo de evento: `BootFailure`
- Mensagem técnica:
  `worker boot error: Uncaught SyntaxError: The requested module 'npm:unpdf@1.4.0' does not provide an export named 'extractTextItems' at .../process-contracheques-pdf/index.ts:2:10`
- Sem timeout, sem `WORKER_RESOURCE_LIMIT`, sem `IDLE_TIMEOUT`. Falha ocorre **antes** de qualquer execução: o worker não sobe.

**`pre-extract-cpf`** — `No logs found`. Nenhuma invocação registrada no período.

Nenhum dado pessoal, nome de arquivo ou chave aparece nos logs consultados.

## Qual função falhou

`process-contracheques-pdf`. Como o boot falha, a plataforma nunca devolve uma resposta HTTP da função (não há 4xx/5xx da aplicação); o cliente `supabase.functions.invoke` traduz isso exatamente como `Failed to send a request to the Edge Function`. A ausência de comprovante/documento pessoal não é a causa — o erro é independente do conteúdo enviado.

## Causa raiz confirmada

`supabase/functions/process-contracheques-pdf/index.ts` linha 2 importa `extractTextItems` de `npm:unpdf@1.4.0`. Consulta ao pacote publicado (`unpdf@1.4.0`, `dist/index.d.mts`) mostra que os exports são `extractText`, `getDocumentProxy`, `extractImages`, `extractLinks`, `getMeta`, `renderPageAsImage`, `configureUnPDF`, `definePDFJSModule`, `getResolvedPDFJS`, `resolvePDFJSImport`. **`extractTextItems` não existe nessa versão.**

`extractText` retorna strings por página, não itens com coordenadas `x/y/width/height` — e todo o parser (`linhas`, `parsePagina`) depende dessas coordenadas.

## Limitação declarada

Não há logs de `pre-extract-cpf` para correlacionar; não é possível afirmar pelos logs se ela foi acionada nesse teste. Também não há logs de invocação bem-sucedida de `process-contracheques-pdf` — só o boot error.

## Correção proposta (não executada)

Alterar somente `supabase/functions/process-contracheques-pdf/index.ts`: obter os itens de texto com coordenadas via pdf.js diretamente, que já vem com o `unpdf`, mantendo `getDocumentProxy` e todo o parser intacto.

```text
para cada página do PDFDocumentProxy:
  page.getTextContent() -> items
  mapear cada item para { str, x: transform[4], y: transform[5], width, height }
```

Isso remove o import inexistente e preserva o formato `TextItem` já esperado por `parsePagina`. Depois: redeploy da função e novo teste com os mesmos PDFs.

Nenhum arquivo foi editado, nenhum deploy foi feito e nada no banco foi alterado neste diagnóstico.
