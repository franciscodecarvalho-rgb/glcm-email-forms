# SPEC-002 — OCR local para contracheques digitalizados

## Objetivo

Permitir a leitura de páginas de contracheque sem camada de texto usando
ferramentas gratuitas executadas no navegador, antes do envio para o
processamento existente.

## Escopo

- manter a extração textual determinística como primeira opção;
- detectar somente páginas sem texto extraível;
- renderizar a página com PDF.js e reconhecer português com Tesseract.js;
- inserir uma camada textual invisível no PDF, preservando a imagem original e
  as coordenadas necessárias ao parser atual;
- reutilizar um worker OCR por arquivo e informar página, confiança e quantidade
  de itens na interface;
- preservar o PDF original se o OCR local falhar, permitindo o fallback já
  existente da Edge Function.

O OCR é genérico como infraestrutura, mas não altera regras de rubricas ou
classificações por empresa. Qualquer mudança de extração continua restrita ao
perfil da empresa correspondente.

## Critérios de aceitação

1. PDFs que já possuem texto não passam pelo OCR.
2. Páginas sem texto recebem camada OCR antes da divisão em lotes.
3. O parser atual consegue consumir os itens OCR com coordenadas PDF.
4. Falha de carregamento de worker, canvas ou idioma não interrompe a criação
   do caso nem descarta o PDF original.
5. O processamento continua local; o conteúdo do contracheque não é enviado a
   um serviço externo de OCR.
6. O fluxo mantém cobertura de testes, build e lint dos arquivos novos.

## Fora do escopo

- Google Vision, Document AI ou qualquer OCR pago;
- substituir o fallback de IA já existente na Edge Function;
- reconhecer automaticamente uma nova rubrica HRA para qualquer empresa;
- persistir uma nova coluna de auditoria no banco.

## Dependências e riscos

O pacote Tesseract.js é carregado sob demanda. Seus assets de worker, WASM e
idioma podem ser baixados pelo navegador a partir da distribuição pública do
pacote; se a rede estiver bloqueada, o PDF original permanece disponível para
o fallback existente. A operação é gratuita, mas ainda depende desses assets
na primeira execução.

## Implementação e validação

Implementada localmente em `src/lib/ocr-pdf.ts` e integrada à preparação dos
PDFs em `src/lib/unificar-pdfs.ts`. A suíte local passou com 175 testes e o
build de produção passou. O lint específico dos arquivos do OCR passou; o
lint completo ainda possui problemas legados, incluindo um `any` preexistente
em `src/pages/NovoCaso.tsx`.
