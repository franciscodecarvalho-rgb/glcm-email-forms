# SPEC-007 — Empresa declarada na extração de contracheques

## Problema

A leitura automática pode reconhecer o leiaute errado quando o cabeçalho está
degradado. Isso pode mudar a classificação de uma rubrica ou deixar uma
competência de fora. A soma dos totais, sozinha, não detecta esse tipo de erro.

## Contrato do piloto

- O cadastro manual exige uma empresa do catálogo quando
  `VITE_PILOTO_EMPRESA_CONTRACHEQUE=true`. O piloto inclui Oxiteno e Refinaria
  de Mataripe, ambas da família ADP. Com a opção desligada, o formulário atual
  permanece disponível. Casos anteriores e outros canais não exigem o campo.
- O cadastro grava `casos.empresa_contracheque_declarada` no registro provisório.
  A seleção fica bloqueada após a criação e o banco impede sua troca. Para
  corrigir a seleção ou trocar os contracheques após esse ponto, iniciar outra
  importação provisória. A origem extraída do recibo segue separada.
- O navegador reutiliza os itens da leitura que já faz para ordenar as
  competências. Quando identifica outra empresa, informa o arquivo e a página
  original antes do envio. A função confere novamente o cabeçalho no PDF
  recebido e usa nome normalizado ou CNPJ cadastrado como evidência.
- Recibos sem identidade comprovada em lotes com dados locais vão para revisão.
  Para herdar a identidade, é necessário existir recibo aberto por marcador
  explícito e haver referência compatível ou marcador de continuação na folha
  sem novo cabeçalho. Recibos separados continuam separados mesmo quando têm
  a mesma competência.
- No piloto, o parser usa o campo REFERÊNCIA para a competência dos perfis ADP,
  preserva totais impressos e confere proventos, descontos e líquido quando
  disponíveis. Se os dados não sustentarem competência ou classificação, o
  lote fica pendente. Uma rubrica da família HRA/AHRA continua subordinada ao
  perfil da empresa e às regras da SPEC-001.
- No piloto de Mataripe, o OCR básico já íntegro é usado na primeira tentativa.
  Quando faltarem códigos legíveis ou os totais não fecharem, o navegador pode
  tentar uma imagem de maior resolução e reler faixas, células ou o rodapé.
  Só usa o novo candidato com identidade e valores confirmados na triagem.
  Se o código ou o valor de uma rubrica continuar ilegível, o servidor
  sinaliza a revisão. A sessão de OCR é reutilizada entre os PDFs de Mataripe
  do mesmo envio. Durante a releitura, os valores da coluna direita de
  `BASE/OUTROS` também são conferidos por célula na imagem. Leitura
  inconclusiva mantém a folha pendente, mesmo que os totais fechem.
  Essa seção continua fora da reconciliação financeira.
- Somente o lote inteiro sem dados estruturados pode usar a IA. O fallback
  recebe regras comuns, da família ADP e da empresa esperada. Exige
  transcrição de identidade e cobertura de páginas para cada recibo. A
  validação rejeita empresa incompatível, identidade ilegível e páginas
  omitidas. Divergência de totais continua com no máximo uma releitura.
- O plano dos lotes é registrado de forma idempotente. A transação de
  conclusão grava recibos, rubricas e estado do lote juntos. A confirmação
  segue bloqueada enquanto houver lote em erro ou pendente. As funções de
  gravação ficam restritas à service role.

## Ativação e validação

1. Aplicar a migration `20261119122851_empresa_declarada_piloto_contracheques.sql`
   antes de disponibilizar a Edge Function atualizada. Habilitar
   `VITE_PILOTO_EMPRESA_CONTRACHEQUE=true` apenas no ambiente do piloto. A
   opção é de build e inicia desligada.
2. Comparar o fluxo atual e o piloto com os mesmos PDFs textuais, digitalizados
   e mistos. Rodar Mataripe e Oxiteno ponta a ponta, com os controles Moeve e
   Petrobras. Cobrir escolha incorreta, empregadores misturados, página sem
   identidade, continuação, retomada e divergência de totais.
3. No navegador, usar a medição `glcm:contracheques:ate-ultimo-lote` para
   comparar a latência de ponta a ponta até a extração. A Edge Function
   registra tempo do parser, gravação e chamadas de IA por lote concluído do
   piloto. Os registros de desempenho não incluem dados da folha.
4. Homologar a expansão com pelo menos uma melhora demonstrada em PDF real,
   sem modificar os resultados válidos nem aumentar mais de 5% o p95 dos
   cenários saudáveis. Confirmar o catálogo completo antes de ativar em produção.

## Evidência local

- Em um PDF digitalizado de Mataripe, a rubrica `0502` ficava em descontos no
  parse anterior. O perfil a reconhece em vencimentos pela faixa da tabela,
  e recupera a referência pela posição impressa quando o OCR perde o rótulo.
  A amostra permaneceu em revisão por divergência de totais.
- A auditoria offline dos 48 PDFs de Mataripe reconheceu 48 referências na
  configuração anterior de OCR. Só 4 folhas reconciliaram com os totais nessa
  mesma execução. Pelo menos uma variante offline fechou as contas em 46 dos
  48 PDFs. As duas folhas restantes fecharam em testes individuais no
  navegador. Em 07/2026 foi preciso reler o rodapé, e em 03/2026 foi preciso
  também reler o corpo em resolução maior.
- A primeira rodada no navegador reconheceu as 48 referências de Mataripe.
  A conciliação subiu de 31 para 43 folhas após retestar as 17 pendências.
  A divergência da `1301` em 12/2025 foi confirmada no PDF e corrigida por
  releitura da sua célula em `BASE/OUTROS`. O PDF também confirmou a
  `1330` de 08/2024 e os códigos `1300` e `1330` de 07/2026 do navegador.
  O parser corrigiu a divisória de 06/2023 limitando os separadores lidos pelo
  OCR à faixa comprovada do leiaute de Mataripe. Essa folha fechou no navegador.
  A triagem passou a usar os quadros físicos do rodapé. Os retestes no
  navegador conciliaram 10/2023, 03/2024 e 06/2024. Em 09/2025, o recorte
  isolado do líquido leu o mesmo valor que a imagem original. A união das
  rodadas finais contém 48 competências distintas e conciliadas, de 11/2022
  a 10/2026. O reteste confirmou `5511`, `8100` e `8201` de 01/2024,
  `8000` e `8002` de 02/2024 e `5501` de 08/2026. Para esta última
  rubrica, o recorte em tamanho nativo confirmou o valor da folha.
  A comparação com 41 leituras independentes mostrou duas diferenças,
  em 08/2024 e 07/2026, nas quais a imagem corroborou o navegador.
- A planilha gerada com as 48 competências das rodadas tem 46 linhas. Os
  PDFs de 11/2022 e 12/2022 não contêm HRA ou AHRA. A rubrica `3557` é AHRA
  em vencimentos de Mataripe, inclusive nos registros anteriores. Foram
  conferidos os casos de 01/2024, 11/2024 e 12/2025 na imagem. O leiaute
  TEMA 306, as fórmulas das 46 competências e a soma dos valores mensais
  da planilha foram verificados. A pasta continha os PDFs como referência.
- O cadastro textual em builds locais completou 30 pares. O p95 foi de
  3.339,5 ms no fluxo atual e 3.640,0 ms no piloto (+9,0%). O piloto passou
  a reutilizar o estado do lote retornado pelo planejamento. Em caso de
  falha após o envio, continua acompanhando o estado no servidor.
  O reteste em builds locais completou outros 30 pares. O p95 textual foi
  de 8.395,2 ms no fluxo atual e 7.146,6 ms no piloto (−14,9%). O fluxo
  atual consultou o estado 30 vezes e o piloto zero vezes no caminho
  normal. Uma perda simulada da resposta após a gravação foi recuperada
  por consulta do lote, com um único recibo persistido. O cadastro de
  PDFs sintéticos digitalizado e misto persistiu os valores esperados
  com o piloto ligado e desligado. Em 30 pares por cenário, os p95
  digitalizado e misto foram de 4.493,8 para 4.635,6 ms (+3,2%) e de
  3.841,8 para 3.876,0 ms (+0,9%), respectivamente. Os três cenários
  sintéticos passaram pelo limite de +5%.
- Em 04/2025, o PDF preparado no navegador reconciliou os totais. As 29
  rubricas tiveram os mesmos códigos, naturezas e valores de uma leitura
  independente. O Supabase local confirmou gravação, continuação sem novo
  cabeçalho entre dois lotes, bloqueio de lote fora de ordem e retomada
  sem duplicação. PDFs sintéticos com empresas misturadas ou empregador
  ilegível ficaram em revisão, sem recibos persistidos. A confirmação
  rejeitou os lotes pendentes e o banco impediu a troca de empresa
  após a criação.
- No cenário reproduzido de cabeçalho legível apenas pelo CNPJ, a rubrica
  `3331` da Oxiteno passa pelo perfil correto. O parse anterior era genérico.
- O PDF da Oxiteno tem 39 páginas. A camada invisível de texto deixou
  26 páginas com divergência de totais. Na página 4, por exemplo, a
  rubrica `0502` é `1,34` na folha e `134` na camada de texto. A leitura
  dos contornos visíveis agora faz parte do extrator da variante ADP
  vetorial, após confirmar a Oxiteno no cabeçalho. A leitura usa as
  divisórias repetidas na página, separa a coluna QTDE., identifica
  BASE/OUTROS pelo contorno e exige uma única conciliação dos três
  valores impressos. Para descrições truncadas, a correção exige
  coincidência do código e do contorno do rótulo confirmado no PDF.
  A página 2, de outra variante, segue pela camada de texto.
- No cadastro local com o PDF completo da Oxiteno, oito lotes
  concluíram 39 competências distintas com 1.013 rubricas conciliadas
  e zero chamadas de IA. A geração a partir dos recibos persistidos
  reproduziu as 36 linhas do TEMA 306 e R$ 6.894,95 de valor histórico.
  Em 11/2025, a parcela calculável foi de R$ 50,75 em AHRA. As três
  competências sem parcela calculável foram 10/2025, 12/2025 e 01/2026.
  Uma execução local do PDF completo levou 37,6 s até o último lote.
- A planilha relacional da Oxiteno exclui `HRA sem IR` e classifica `3331`
  em AHRA, inclusive para rubricas legadas com outra classificação.
- O controle Moeve tem 69 competências impressas em 35 páginas. Os
  cabeçalhos de 03/2020, 03/2023, 05/2024 e 03/2025 abrem no fim de
  uma página. As rubricas e o rodapé ficam no início da seguinte,
  antes do próximo Aviso de Crédito. Os dois parsers agora recuperam
  as 69 competências e classificam as 69 rubricas `P003` em proventos.
  O valor histórico reproduz R$ 28.875,33. O teste local confirmou
  retomada do cabeçalho sozinho, dois recibos gravados e reenvio sem
  duplicação. O PDF disponível tem 14 pendências de conciliação
  sinalizadas nos dois parsers. Uma conferência independente por
  coordenadas com MuPDF obteve os mesmos códigos, naturezas, valores e
  totais impressos nas 69 competências e confirmou as 14 pendências.
  Em 01/2020 faltam os valores da primeira linha visível. Em 05/2020,
  os proventos e descontos visíveis somam R$ 8.581,45 e R$ 5.444,72,
  frente a R$ 9.239,79 e R$ 5.458,72 impressos.
  A função local reteve o lote de 01/2020 para revisão.
- Nos 60 PDFs Petrobras, a comparação inicial com `cfe70a4` mostrou
  saída idêntica e cinco divergências financeiras anteriores ao piloto.
  A correção vinculou as folhas pelo número impresso, matrícula e
  competência, preservou descontos e leu o líquido do quadro final.
  Em 02/2026, três rubricas com código e valor iguais estavam em linhas
  distintas e passaram a compor novamente os totais. Em 06/2023, a
  `062B` passou a ser desconto conforme a página impressa. No
  Supabase local, as 78 páginas foram processadas em 16 lotes, com
  60 recibos, 1.684 rubricas, três totais conciliados por recibo e
  nenhuma chamada de IA. Os arquivos criptografados foram normalizados
  localmente com MuPDF para esse teste de processamento.
- O arquivo `contracheques-unificados-4362- Franque.pdf`, disponível na pasta de
  validação, não é uma fonte de uma única empresa. Ele tem 95 páginas e mistura
  comprovantes da TRONOX PIGMENTOS DO BRASIL S.A. nas páginas 1–9, 11 e 14 com
  recibos da BASF S.A. nas demais páginas identificadas. A planilha antiga
  tinha 56 competências e agregava valores dos dois empregadores em alguns
  meses, como 10/2022 (`846,87 + 289,28 = 1.136,15`) e 09/2025
  (`1.793,79 + 1.884,38 = 3.678,17`). O arquivo original continua inelegível
  como uma empresa única, mas a pendência de separação foi resolvida para a
  validação: foram criadas cópias por empregador e duas planilhas no layout
  TEMA 306, sem somar empresas.
- A planilha BASF contém 47 competências com HRA, total de HRA de R$ 72.353,20
  e valor histórico de R$ 19.897,09. A planilha TRONOX contém 10 competências
  com HRA, total de HRA de R$ 10.207,36 e valor histórico de R$ 2.807,00.
  O parser reconheceu 11 recibos TRONOX e 78 recibos BASF, com zero divergência
  financeira nos dois grupos. As páginas 86, 88, 90 e 94 não têm competência
  reconhecida nem rubrica `3A20` e permanecem corretamente fora das planilhas.
  A regra de fechamento pelo total de proventos evita unir, por competência
  repetida, um adiantamento a um recibo mensal. A conferência está reproduzida
  no teste opcional `franque-spec.test.ts`, ativado com `GLCM_FRANQUE_PDF`.
- A medição isolada do parser não substitui o p95 do cadastro completo.
  A homologação depende de comparar uploads, OCR, banco, IA e conclusão no
  ambiente de teste, com as planilhas de referência do mesmo conjunto de PDFs.

### Pendências na fonte Moeve

Os valores abaixo representam o total impresso menos a soma das
rubricas visíveis, em reais. As páginas são contadas a partir de 1 no
PDF original da pasta de validação.

| Competência | Páginas | Diferença de proventos | Diferença de descontos |
| --- | --- | ---: | ---: |
| 01/2020 | 1 | 3.761,41 | 671,11 |
| 05/2020 | 2, 3 | 658,34 | 14,00 |
| 03/2021 | 7, 8 | 0,00 | 607,12 |
| 01/2022 | 12, 13 | não impresso | não impresso |
| 03/2022 | 13, 14 | 0,00 | 55,00 |
| 07/2022 | 15, 16 | 0,00 | 55,50 |
| 11/2022 | 17, 18 | 0,00 | 62,50 |
| 05/2023 | 20, 21 | 0,00 | 81,09 |
| 09/2023 | 22, 23 | 1.013,64 | 81,09 |
| 01/2024 | 24, 25 | 1.555,17 | 498,98 |
| 07/2024 | 27, 28 | 2.169,09 | 22,79 |
| 11/2024 | 29, 30 | 102,00 | 4.857,23 |
| 05/2025 | 32, 33 | 500,00 | 97,14 |
| 09/2025 | 34, 35 | 701,06 | 4.857,23 |

A composição das pendências foi conferida contra as rubricas visíveis. Em
01/2020, a tabela não traz as duas linhas que explicam as diferenças: o valor
de Salário Base do rodapé (R$ 3.761,41) e o INSS (R$ 671,11). Em 01/2022,
os totais de proventos e descontos não estão impressos; somente o líquido é
legível, portanto não há base para uma conciliação financeira completa.

Nas outras 12 competências, cada diferença coincide exatamente com uma
rubrica visível já extraída: `P122`/`D206` em 05/2020, `D564` em 03/2021,
`D264` em 03/2022, 07/2022 e 11/2022, `D140` em 05/2023, `P213` e `D140`
em 09/2023, `P004` e `D110` em 01/2024, `P098` e `D206` em 07/2024,
`P080` e `D118` em 11/2024, `P348` e `D140` em 05/2025 e `P080` e `D118`
em 09/2025. Isso caracteriza duplicação no total impresso da fonte, não
omissão ou erro de leitura do parser.

Regra de homologação: manter cada rubrica visível uma única vez, preservar os
totais impressos e deixar a competência pendente de revisão quando a fonte
não fecha. Não criar rubricas sintéticas nem alterar valores para forçar a
igualdade matemática.
