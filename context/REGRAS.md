# REGRAS.md — Regras vigentes do GLCM (cartão condensado)

Lido no início de cada tarefa. O histórico completo, com origem e justificativa
de cada regra, vive em `context/MEMORY-ARCHIVE.md`. Regra nova confirmada:
registrar no arquivo histórico e refletir aqui em uma linha.

## Preferências de Nodley

- Executar só o solicitado; não concordar sem evidências; validar antes de afirmar.
- Separar implementação / proposta / hipótese; sugerir melhor aplicação sem implementar sem autorização.
- Preservar fora do escopo: estrutura, banco, layout, fluxos.

## Stack e fluxo

- React + Vite + TypeScript + Tailwind + shadcn/Radix; Supabase (PostgreSQL, Auth, Storage, Edge Functions).
- Deploy = push na `main` + **Publish no Lovable** (inclui Edge Functions); casos `concluido` nunca regeram — validar em caso novo ou via "Regerar documentos".
- CLI Supabase instalada; o token atual só acessa `pcquefluiltrvwjpndvw` — produção é `kaopnizsbkzxqdzmocwa`.
- `casos` é a entidade central; arquivos físicos no Storage, metadados na tabela `arquivos`.
- O fluxo termina em `concluido` após a geração dos documentos.

## Tipos de ação (`casos.tipo_acao`)

- `ir_sobre_hra`, `contribuicao_extraordinaria`, `tema_324` → tributárias; `horas_extras`, `supressao_folgas` → trabalhistas.
- Petição específica por tipo; contrato: tributário HRA, trabalhista Reflexo HE, `contrato_contribuicao_extraordinaria`, `contrato_supressao_folgas`.
- Procuração e Termo LGPD por natureza + escritório (glcm/polkowski; vazio = ambos).
- Declaração de Pobreza **somente nas trabalhistas**; Termo de Renúncia em todas.
- Upload separado em `contracheque` e `informacoes_pessoais` (≥1 arquivo em cada grupo).

## Extração

- Contracheques PDF: **determinística**, texto+coordenadas com `PDFPageProxy.getTextContent()` (`unpdf` não exporta `extractTextItems`); IA só como último recurso, individual, quando não há camada de texto.
- Persistir em `contracheques` + `itens_contracheque`; o JSON legado de `casos.contracheques` não é evidência de extração.
- Leitura posicional por colunas; códigos numéricos, alfanuméricos ou iniciados por `/`; páginas continuadas consolidadas por competência, sem duplicar.
- Acelen: `BASE / OUTROS` informativo. Petrobras: natureza pela seção. Elekeiroz: aceita rubrica sem código. Termo Bahia: só metade esquerda. Unigel: bloco `CUSTO EMPRESA-INFORMATIVO` fora dos totais.
- Documentos pessoais (CNH/RG/CIN): extraídos pela **IA** integrada ao Lovable (OCR local reprovado); sem texto ou não reconhecido → revisão manual; teste isolado em modo diagnóstico, sem persistir.
- Confirmação: identificação + ≥1 rubrica gravadas → tela somente leitura; caso contrário → correção manual.

## Upload e unificação

- Vários PDFs por caso, qualquer número de páginas; seleções sucessivas acumulam.
- Unificar em `contracheques-unificados.pdf` **na ordem escolhida**, antes do upload (`casos-arquivos`), exibindo progresso.
- PDF criptografado: detectar com `ignoreEncryption: true`, descriptografar com QPDF/WASM e só então copiar as páginas.
- A geração anexa esse PDF como peça `contracheques_unificados` (copiado para `casos-documentos`).

## Documentos gerados

- Templates `.docx` (tabela `templates`) renderizados com docxtemplater `{VAR}`; variável desconhecida vira `""`.
- `{NUMERO_CONTRATO}` = `{NUMERO_PASTA}` = `casos.numero_pasta`; qualificação, endereço, local `Salvador/BA`, data e nome na assinatura vêm do caso.
- Modelos originais: MERGEFIELDs (o texto de exemplo é cache de merge), aviso no cabeçalho com `⚠️`, listas nativas do Word — preservar na conversão (`•` literal em fonte Symbol vira `□` fora do Word).
- Planilha IR/HRA `.xlsx`: competências cronológicas (MM/AAAA; rótulos fora do padrão ao fim), sem coluna SUBTOTAL, `VALOR = ROUND((B+C)*0.275,2)`.
- Planilha códigos 1513/6050 (`planilha_codigos`): só quando houver ocorrências em `itens_contracheque`; mesma estrutura (`P.A. | 1513 | 6050 | TOTAL`).
- Alerta de rubricas 1059/1513/6050 na página do caso, em todos os status.

## Banco e divergências

- `arquivos.processado` é usada no código mas não consta nas migrations/tipos — comparar antes de mudar.
- O banco publicado pode divergir do esquema versionado (edições diretas na nuvem).
- Não alterar migrations antigas; destrutivas, backfills e RLS só com autorização explícita.

## Fontes canônicas, operação e integrações

- `src/lib/modelos-documentos.ts` (`selecionarPecas`) e `src/lib/planilha-xlsx.ts` são canônicos; a Edge `generate-documents` mantém cópias inline; a guarda `espelho-edge-function.test.ts` falha se divergirem.
- Legal One: etapa **manual** enquanto não houver API. Limite de viabilidade é por caso (valor inicial R$ 15.000,00).
- Integrações **não implementadas**: Google Drive, Legal One, ZapSign, WhatsApp, viabilidade automática — não apresentar como prontas.
