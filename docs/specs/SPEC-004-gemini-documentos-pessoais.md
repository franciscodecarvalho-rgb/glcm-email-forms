# SPEC-004 — Gemini para documentos pessoais e revisão manual

## Objetivo

Usar Gemini para ler todos os PDFs enviados como documentos pessoais, salvar
somente dados extraídos com segurança e conduzir para revisão manual quando a
extração falhar ou ficar incompleta.

## Escopo

- Aplicar o fluxo à CNH, RG, CIN, CPF, comprovante de residência e documento
  pessoal ainda não classificado.
- Manter a extração dos contracheques determinística; nenhum contracheque pode
  ser enviado ao Gemini por esta política.
- Preservar os PDFs originais no Storage e seus metadados em `arquivos`, inclusive
  quando a chamada do Gemini falhar ou não retornar dados utilizáveis.
- Salvar dados extraídos no caso sem substituir valores existentes por campos
  vazios ou CPF inválido.
- Abrir a tela editável de confirmação quando nome, CPF válido ou logradouro não
  forem extraídos, ou quando algum lote não puder ser processado. RG é opcional
  quando há CPF válido. Mostrar ao
  usuário que os arquivos originais permanecem anexados.
- Aplicar a mesma política ao fluxo de reprocessamento `extract-case-data`.

## Critérios de aceitação

1. Todos os tipos de documentos pessoais passam pelo Gemini no fluxo de upload.
2. A resposta estruturada identifica o tipo e pode fornecer nome, CPF, RG,
   qualificação e campos do endereço sem inferir conteúdo ausente. Para CNH,
   Gemini recebe o PDF como arquivo multimodal (não como imagem) e deve procurar
   visualmente o campo CPF, inclusive em PDFs sem camada de texto.
3. CPF só é salvo quando completo e validado; valores ausentes não apagam dados
   já registrados.
   Um CPF válido atende ao requisito de identificação; a ausência de RG não
   bloqueia confirmação ou conclusão do caso.
4. Timeout, erro do gateway e resposta sem dados úteis não descartam o PDF e
   conduzem o caso à confirmação manual.
5. Extração parcial conserva os campos válidos, sinaliza revisão e deixa os
   campos editáveis.
6. Contracheques permanecem fora da IA generativa e mantêm seu parser e regras
   de empresa existentes.
7. Testes cobrem política de roteamento, mesclagem, resposta vazia e revisão
   manual por falta de endereço.

## Fora do escopo

- mudanças em tabelas, RLS, buckets ou políticas de acesso (a função de validação
  da importação deve continuar versionada por migration);
- reprocessamento automático de casos já concluídos;
- extração generativa de contracheques;
- publicar ou alterar dados de produção diretamente.

## Estado

Implementação local base validada anteriormente. Na correção de 30/09/2026, 297
testes, build, TypeScript e bundling sintático da Edge Function passaram. Ainda
falta validar a chamada real ao Gemini, aplicar a migration que torna RG opcional
e publicar pelo fluxo `docs/RELEASE-PROCESS.md`.
