# Worklog

## 2026-11-21 — Planilha Oxiteno reconciliada pela leitura vetorial

- A planilha antiga da Oxiteno tinha 25 linhas e não correspondia ao PDF de
  validação atual. Ela foi preservada como histórico e não foi sobrescrita.
- A nova planilha foi gerada no layout homologado `TEMA 306` com 36
  competências calculáveis, de 11/2022 a 11/2025. A leitura usou a variante
  vetorial ADP quando disponível e manteve o fallback textual nas páginas da
  variante compatível.
- O resultado confere com a homologação: HRA de R$ 25.023,67, AHRA de
  R$ 50,75 e valor histórico de R$ 6.894,95. Em 11/2025, `3331 — HRA-Dif.
  Dissídio` permanece em AHRA; `HRA sem IR` não compõe a base.
- O XLSX foi recalculado, renderizado e reimportado para verificação. A
  conferência final não encontrou erros de fórmula, a linha 11/2025 contém
  AHRA de R$ 50,75 e o arquivo exportado é um ZIP íntegro. O teste real de
  `oxiteno-spec.test.ts` passou com 8 testes.
- A auditoria dos artefatos encontrou versões antigas de Moeve, Franque e
  Oxiteno na raiz da pasta de validação. Elas foram movidas, sem exclusão,
  para `Validação Glcm/Historico`; a raiz agora contém somente as quatro
  planilhas de validação atuais.

## 2026-11-21 — Separação do lote Franque por empregador

- A pendência do PDF misto foi tratada sem alterar o arquivo original: as cópias
  BASF e TRONOX já existentes foram usadas como fontes independentes para a
  validação.
- Geradas duas planilhas no layout TEMA 306. BASF ficou com 47 competências,
  HRA total de R$ 72.353,20 e histórico de R$ 19.897,09. TRONOX ficou com 10
  competências, HRA total de R$ 10.207,36 e histórico de R$ 2.807,00.
- As duas planilhas foram recalculadas, renderizadas e exportadas. O conteúdo
  visual foi conferido, não houve erro de fórmula e os dois arquivos foram
  validados como ZIPs íntegros.
- A planilha antiga agregada não foi sobrescrita. O PDF original continua
  inelegível para um caso de empresa única; os artefatos separados são os
  válidos para homologação.

## 2026-11-21 — Planilha Moeve para validação das 69 competências

- Gerada uma nova planilha no layout homologado `TEMA 306`, sem criar colunas ou
  alterar a estrutura existente. O arquivo contém as 69 competências do PDF
  Moeve, de 01/2020 a 09/2025, com HRA visível, AHRA igual a zero, alíquota de
  27,5% e fórmula de valor histórico.
- O total histórico calculado é R$ 28.875,33 e o total bruto de HRA é
  R$ 105.000,66. A extração foi conferida pelo parser validado e a planilha foi
  recalculada, renderizada, exportada e verificada como ZIP válido, sem erros de
  fórmula.
- As 14 divergências entre rubricas visíveis e totais impressos permanecem
  pendentes na fonte, conforme SPEC-007. Nenhum valor foi inventado ou ajustado
  para forçar a conciliação.

## 2026-11-20 — Fonte mista no arquivo de Franque

- A leitura da pasta de validação encontrou um terceiro PDF além de Moeve e
  Oxiteno: `contracheques-unificados-4362- Franque.pdf`.
- O arquivo tem 95 páginas e mistura TRONOX nas páginas 1–9, 11 e 14 com BASF
  nas páginas identificadas restantes. A planilha de 56 linhas soma rubricas
  HRA dos dois empregadores em determinadas competências, por exemplo
  10/2022 e 09/2025.
- A fonte foi marcada como pendente, pois a regra atual exige uma empresa por
  caso. Em cópias temporárias separadas, o parser reconheceu 10 rubricas HRA em
  11 competências TRONOX e 52 rubricas HRA em 47 competências BASF, sem
  divergências financeiras. O cabeçalho BASF fragmentado passou a ser
  reconhecido pelos limites impressos, com teste de regressão. Nenhum valor foi
  somado entre empresas no parser.
- Após a correção, a suíte completa passou com 355 testes e 4 testes opcionais
  ignorados; o build, o typecheck e o lint seletivo também passaram. Os dois
  scripts temporários usados na auditoria foram removidos.
- A auditoria detalhada da Moeve confirmou que 12 das 14 pendências são
  duplicações no total impresso de uma rubrica que já aparece na tabela. Em
  01/2020 faltam duas linhas na fonte e em 01/2022 os totais de proventos e
  descontos não estão impressos. A regra permanece preservar as linhas visíveis
  e bloquear a conciliação, sem fabricar valores.
- A separação temporária do PDF Franque encontrou recibos BASF/TRONOX fechados
  com a mesma competência. O parser foi ajustado para não absorver o próximo
  recibo quando o total de proventos já fecha o bloco, mesmo sem desconto.
  No reteste real: TRONOX 11 recibos e BASF 78 recibos, 47 competências BASF,
  52 HRA e zero divergências financeiras.
- A auditoria real foi incorporada a `src/lib/franque-spec.test.ts` e executada
  com o PDF de validação: o teste passou em 2,5 s. Sem a variável
  `GLCM_FRANQUE_PDF`, ele permanece opcional para a suíte padrão.

## 2026-11-20 — Controle Petrobras e conferência independente da Moeve

- A primeira comparação dos 60 PDFs Petrobras com `cfe70a4` reproduziu
  a versão anterior e mostrou cinco divergências em recibos paginados.
  O parser agora usa a matrícula, a competência e a sequência de
  folhas impressa para agrupar. O reconhecimento inclui a folha final
  apenas com líquido e rubricas idênticas impressas em linhas distintas.
  Em 06/2023, a `062B` foi reclassificada como desconto.
- O teste do Supabase local processou as 78 páginas em 16 lotes.
  Foram gravados 60 recibos e 1.684 rubricas, com conciliação dos três
  totais em todos os recibos e nenhuma chamada de IA.
- A verificação posicional independente da Moeve com MuPDF conferiu
  códigos, naturezas, valores e totais impressos de todas as 69
  competências. Confirmou as 14 diferenças entre a soma das linhas e
  os totais do PDF. A SPEC-007 lista os períodos, páginas e valores
  que exigem documentação complementar.
- A compilação e o typecheck passaram. A suíte passou com 355 testes,
  incluindo o PDF original de Moeve e a
  comparação da camada textual do PDF Oxiteno. O lint seletivo passou.

## 2026-11-20 — Continuação e conciliação da Moeve

- Os dois parsers recuperaram as 69 competências do PDF de 35 páginas.
  O recorte inclui a tabela que antecede o primeiro Aviso de Crédito
  da página e a liga ao recibo aberto na página anterior. A ordenação
  reúne as folhas conectadas para a troca de lote.
- O extrator separa rubricas P/D do líquido, guarda os totais impressos
  em fragmentos anteriores e concilia o rodapé ao terminar o recibo.
  A leitura de 01/2021 fecha com os totais no fim da página 6 e o
  líquido na página 7. O total histórico de HRA reproduz R$ 28.875,33.
- A Edge Function local preservou um cabeçalho isolado no primeiro
  lote, gravou dois recibos após o segundo e confirmou reenvio
  idempotente, sem IA. O teste com a página 1 do PDF real devolveu
  pendência de 01/2020, sem gravar o recibo divergente. O teste do
  arquivo completo aponta 14 pendências de conciliação nos dois parsers.

## 2026-11-20 — Conciliação Oxiteno no cadastro local (SPEC-007)

- A Edge Function lê os códigos, valores e divisórias impressos da
  variante ADP vetorial após confirmar o empregador. A coluna QTDE.
  fica separada e o marcador BASE/OUTROS mantém as rubricas informativas.
  Descrições truncadas só são recuperadas com código e contorno
  idênticos ao rótulo verificado no PDF.
- Os oito lotes gravaram 39 competências distintas com 1.013 rubricas,
  sem chamadas de IA. Códigos, tipos, valores e totais conferiram com
  a auditoria. A planilha gerada a partir do banco reproduziu as 36
  linhas e o valor histórico de R$ 6.894,95 no layout TEMA 306.
- A suíte padrão passou com 350 testes e três verificações opcionais
  de PDFs reais ficaram fora desse comando. A compilação passou.
  O piloto ainda depende dos controles de regressão externos à ADP.

- O controle Moeve encontrou os 69 cabeçalhos no PDF. Quatro
  competências perdem a parte da tabela que continua no topo da página
  seguinte, antes do próximo aviso. O protótipo preservou as 69 sem
  duplicar cabeçalhos. A filtragem dos códigos P/D eliminou a entrada
  indevida de `Valor Líquido` como desconto e isolou 15 divergências de
  conciliação. O teste do extrator em uso segue com 65 competências.

## 2026-11-20 — Validação de desempenho e diagnóstico Oxiteno (SPEC-007)

- Em 30 pares por cenário, o p95 digitalizado passou de 4.493,8 a
  4.635,6 ms (+3,2%) e o misto de 3.841,8 a 3.876,0 ms (+0,9%). Os três
  cenários sintéticos da importação local ficaram dentro do limite de +5%.
- O PDF Oxiteno tem 39 referências válidas, mas 26 páginas divergem
  quando a extração usa a camada de texto invisível. A página 4 imprime
  `0502` com `1,34`, embora o texto extraído traga `134`.
- A leitura experimental dos valores e códigos pelos contornos visíveis
  conciliou 38 páginas. A página 2 já fecha com o texto. A extração
  existente fornece uma descrição para 977 de 983 linhas vetoriais.
  Nas seis restantes, o código e os contornos da descrição coincidem
  com linhas legíveis em outras páginas do mesmo PDF. A integração e
  a conferência ponta a ponta em Oxiteno ainda estão pendentes.
- A planilha de revisão e o Excel Oxiteno agora usam a mesma regra.
  `HRA sem IR` fica fora da base e a `3331` em provento entra em AHRA,
  inclusive para registros legados. O teste usa os dois valores de
  11/2025 e também cobre um mês que tem apenas HRA sem IR.

## 2026-11-20 — Conciliação das 48 competências de Mataripe (SPEC-007)

- Completados os oito PDFs restantes e substituídas as cinco leituras
  retestadas. A auditoria consolidada tem 48 competências distintas,
  48 conjuntos de totais conciliados e zero pendências.
- O recorte sem ampliação confirmou a `5501` de 08/2026. A mudança
  só preserva o valor original se a releitura da célula concordar.
  As rubricas divergentes de 01/2024 e 02/2024 também foram confirmadas
  contra a imagem dos PDFs.
- Regenerada a planilha com 46 competências e 47 fórmulas. A nova
  amostragem de desempenho em PDFs digitalizado e misto foi iniciada
  com 30 pares por cenário no ambiente isolado.

## 2026-11-19 — Homologação de Mataripe por OCR (SPEC-007)

- A linha de base offline encontrou as 48 referências. Só 4 folhas fecharam
  com os totais impressos. As variantes offline reconciliaram 46 folhas.
  As duas folhas restantes fecharam isoladamente no navegador após a
  releitura do rodapé e, em 03/2026, do corpo em resolução maior.
- A amostra de 04/2025 demonstrou fusão de códigos e descrições, troca de
  dígitos por letras e linhas financeiras omitidas pelo OCR. A releitura
  por faixas recuperou as linhas e reconciliou os totais nessa amostra.
- Implementada a releitura local sob demanda e a checagem explícita de
  linhas com código ou valor ilegível. A amostra 04/2025 fechou no navegador e
  as 29 rubricas coincidiram com a leitura independente.
- A primeira rodada no navegador reconheceu as 48 referências. Em 31 folhas
  os totais fecharam, 15 ficaram pendentes por código ilegível e duas por
  divergência em proventos. As 17 foram selecionadas para reteste com a leitura
  mais recente. Quando há rodapé impresso, a validação exige os três totais.
- O reteste reconciliou 12 das 17 pendências. Considerando as duas rodadas,
  43 das 48 competências fecharam. As cinco pendências incluem uma divisória
  falsa entre vencimentos e descontos (06/2023) e códigos inteiros omitidos
  nas outras folhas. O parser restringe a divisória à faixa física de Mataripe.
  O PDF de 06/2023 fechou no navegador depois dessa correção. Nos demais
  PDFs, a imagem confirmou as rubricas ausentes, inclusive a `3011`.
  O OCR unia algarismos à descrição ou perdia a pontuação do valor.
  A releitura recorta o código usando o valor como âncora, inclusive
  quando falta a pontuação, e tenta um recorte ligeiramente deslocado.
  O reteste das quatro folhas após esse ajuste manteve as quatro pendências.
  A comparação entre a imagem e a camada OCR isolou números sem pontuação,
  códigos unidos ao texto e, em 09/2025, um valor completo com dígito errado.
  A releitura alinhada pelas células conciliou 10/2023 e levou a cobertura a
  45/48. A comparação das etapas mostrou que a triagem embaralhava os totais
  quando o OCR dividia o rodapé em linhas. A triagem passou a agrupar pelos
  quadros impressos. Em 03/2024 e 06/2024, a reprodução com leituras reais
  recuperou um rodapé completo sem alterar as rubricas. O reteste no
  navegador também confirmou essas duas folhas. Em 09/2025, um recorte
  isolado do líquido reproduziu o valor impresso. As rodadas acumuladas
  conciliam 48 de 48 competências. A execução completa na versão final
  foi retomada em grupos de oito arquivos, com gravação parcial de evidências.
- O benchmark textual em builds locais completou 30 pares com p95 de
  3.339,5 ms no fluxo atual e 3.640,0 ms no piloto, alta de 9,0%. O piloto
  passou a reutilizar o estado retornado pelo planejamento dos lotes. A
  recuperação após falha continua consultando o estado no servidor.
  Na nova medição textual, em 30 pares, o p95 passou de 8.395,2 ms
  a 7.146,6 ms (−14,9%) e foram suprimidas 30 consultas antes do lote.
  Um teste com a perda da resposta após a gravação confirmou retomada
  por consulta e persistência de um único recibo. Falta medir PDF
  digitalizado e misto.
- A planilha de Mataripe tem 46 linhas. Novembro e dezembro de 2022 não
  têm HRA ou AHRA no papel. A rubrica `3557` vai para AHRA, inclusive nos
  três registros com a classificação anterior. Conferidos o modelo
  TEMA 306, as 47 fórmulas e o total calculado pela planilha.
- A diferença da `1301` em 12/2025 foi confirmada no original e corrigida por
  releitura da célula. Em 08/2024, o PDF confirmou a extração do navegador
  para a `1330`; a leitura offline divergente estava incorreta. Em 07/2026,
  o PDF confirmou os códigos `1300` e `1330` do navegador. Em 01/2024,
  confirmou o valor da `8201` na releitura. O piloto passou a conferir valores
  na coluna direita de `BASE/OUTROS` diretamente na imagem. Se as leituras
  não confirmarem um valor, o lote fica pendente. A revalidação apontou
  duas leituras de resolução menor com o mesmo dígito errado na `5511`
  de 01/2024 e deixou a `8100` pendente. Os dois valores foram conferidos
  no PDF. Quando há discordância, só se substitui a quantia se os dois
  recortes ampliados concordarem. O reteste com um segundo alinhamento
  confirmou os valores das rubricas `5511`, `8100` e `8201` de 01/2024.
  Os recortes também preservaram o valor correto da `1330` de 08/2024
  e da `1301` de 12/2025. Na comparação independente do lote foi
  confirmada uma troca de dígito nas rubricas informativas `8000` e
  `8002` de 02/2024, ainda em reteste.
- O Supabase local confirmou gravação, retomada idempotente e bloqueio de
  empresa incompatível em PDF sintético. O ambiente isolado precisou de
  um ajuste na cópia de uma migration histórica e de grants locais para
  reproduzir o acesso às tabelas. As migrations versionadas anteriores
  permaneceram como estavam.
- A suíte passou com 345 testes em 40 arquivos. Três testes de PDFs reais,
  dependentes de configuração, ficaram ignorados nessa execução.

## 2026-11-19 — Piloto de empresa declarada nos contracheques (SPEC-007)

- Cadastro manual com empresa homologada, conferência do cabeçalho e perfis
  isolados de Oxiteno e Mataripe. O piloto inicia desligado.
- Registro provisório com empresa imutável e conclusão transacional de lotes.
  A revisão bloqueia divergências de empresa, cobertura e totais.
- Amostra real de Mataripe: o perfil corrigiu a natureza da `0502` na leitura
  por OCR. A diferença de totais ainda exige revisão.
- Comparação local com `cfe70a4`: o PDF disponível da Oxiteno tem as mesmas 26
  pendências em 39 páginas. O controle Moeve apresenta 65 recibos em ambos os
  códigos. A homologação e a medição ponta a ponta continuam pendentes.

## 2026-11-18 — Agente de fallback para contracheques (SPEC-006)

- Baseline preservado na branch local `backup/contracheque-ai-before-agent-2026-11-18`,
  SHA `db122253e13c2abbd31d63394b8f60a622955906`, descrito em
  `docs/ai/BASELINE-EXTRATOR-CONTRACHEQUES-2026-11-18.md`.
- O fallback recebeu papel especializado, instruções contra inferência e contexto
  aprovado de Acelen, Dow, Ecolab, Moeve e Oxiteno.
- Adicionada memória temporária por arquivo, com modelo, competência e hash da
  assinatura (sem expor valores), usada apenas para continuidade/deduplicação.
- Divergência entre soma das rubricas e totais impressos aciona uma releitura. Se a
  divergência persistir, o lote fica em erro para revisão, sem persistir esse
  resultado como concluído. O líquido impresso é preservado.
- A validação funcional alinhou Moeve entre páginas/lotes até o rodapé completo,
  adicionou conferência contra totais impressos e bloqueio de persistência em caso de
  divergência. Em Oxiteno, a classificação usa a divisória vertical da própria página,
  conserva limites ilegíveis como erro, reconhece totais com colchetes e classifica
  `3331` como AHRA e `HRA sem IR` fora da base da planilha.
- A suíte completa passou: 38 arquivos, 320 testes aprovados e 2 cenários de PDF real
  ignorados porque `GLCM_MOEVE_PDF` e `GLCM_OXITENO_PDF` não estão configurados.
- `npm run build`, `npx tsc --noEmit` e compilação sintática da Edge Function passaram.
- Nenhuma mudança de schema, layout, provedor ou publicação remota.
- Nenhum deploy remoto realizado.

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

### Release — 2026-09-30

- Commit `b6633ee8b0a211e8248ce72e5029e5cd1161bb51` enviado para `origin/main`;
  Lovable reconhece o mesmo SHA. A pasta `.omx/` foi preservada fora do commit.
- O deploy de produção foi retido: o projeto configurado no checkout e no `.env`
  é `kaopnizsbkzxqdzmocwa`, mas a conexão Supabase disponível não tem permissão
  nele. O projeto acessível `pcquefluiltrvwjpndvw` não corresponde ao ref configurado
  e não contém as Edge Functions chamadas por esta aplicação.
- Não foi aplicada a migration, nem implantadas as Edge Functions ou a publicação
  Lovable, para evitar alterar/publicar contra um backend diferente ou incompatível.
  Retomar após restabelecer acesso ao projeto `kaopnizsbkzxqdzmocwa` e validar a
  migration e os deploys de `process-documentos-pessoais-pdf` e `extract-case-data`.

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
