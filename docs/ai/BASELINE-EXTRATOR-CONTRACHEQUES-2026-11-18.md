# Baseline do extrator de contracheques com IA

Este registro preserva o comportamento do extrator antes da introdução do agente especializado.

- **Referência Git local:** `backup/contracheque-ai-before-agent-2026-11-18`
- **SHA preservado:** `db122253e13c2abbd31d63394b8f60a622955906`
- **Modelo configurado:** `google/gemini-2.5-pro`
- **Prompt:** constante `PROMPT_IA`
- **Contrato de saída:** `TOOL_IA`, chamada estruturada `registrar_contracheques`
- **Adaptador:** `extrairComIa`
- **Arquivo de origem:** `supabase/functions/process-contracheques-pdf/index.ts`

## Comportamento preservado

O modelo recebe um prompt fixo e um PDF da página ou lote atual. Deve devolver contracheques e rubricas no esquema definido pela função. O fluxo chama a IA como fallback quando a leitura determinística/OCR não produz registros; a resposta é normalizada antes da persistência. Não há estado conversacional ou memória entre chamadas.

Para recuperar o código exato, consultar o arquivo acima no SHA preservado ou comparar a branch de backup com a implementação atual. Nenhum peso ou artefato interno do modelo hospedado é exportado por este snapshot; o que fica preservado é a configuração e o código de integração sob controle do projeto.
