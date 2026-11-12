export type OndaExpansao = "1" | "2" | "3";

export interface TeseExpansao {
  id: string;
  onda: OndaExpansao;
  ondaLabel: string;
  area: string;
  areaColor: string;
  titulo: string;
  precedente: string;
  aptosHeadline: string;
  aptosSub: string;
  motivo: string;
  baseContracheques: string;
  formulaCalc: string;
  valorMinM: number;
  valorMaxM: number;
  honorariosStr: string;
  docComplementar: string;
}

export interface ClienteAmostra {
  nome: string;
  cpf: string;
  matricula: string;
  empresa: string;
  periodo: string;
  base: string;
  potencial: string;
  motivo: string;
}

export interface FaixaAnuenio {
  rotulo: string;
  criterio: string;
  historico: string;
  ativos: string;
  destaque?: boolean;
}

export interface FaixaConsignado {
  rotulo: string;
  valor: string;
  classe: string;
}

export interface SinalAcessorio {
  titulo: string;
  totalPessoas: string;
  valor: string;
  descricao: string;
}

export interface NichoComplementar {
  grupo: string;
  cadastros: string;
  contracheques: string;
  proventos: string;
  oportunidade: string;
}

export interface TeseBarrada {
  tese: string;
  reviravolta: string;
  diretriz: string;
  acaoBadge: string;
  badgeClasse: string;
}

export const NOVAS_TESES: TeseExpansao[] = [
  {
    id: "tese1",
    onda: "1",
    ondaLabel: "Onda 1 · Monetização Imediata",
    area: "Tributária",
    areaColor: "border-blue-200 bg-blue-50 text-blue-800",
    titulo: "1. Restituição de IRPF sobre Juros de Mora e Precatórios (Tema 808 STF)",
    precedente: "RE 855.091 / Tema 808 STF (Tese Vinculante)",
    aptosHeadline: "1.012 clientes ativos · 1.214 com Execução JF",
    aptosSub: "1.163 clientes no histórico completo · 986 com declaração de IR no dossiê",
    motivo:
      "Sofreram retenção recorrente de imposto retido na fonte na alíquota de 27,5%. Todo cliente que recebeu alvará, acordo trabalhista, liquidação ou RPV nos últimos 5 anos teve o imposto retido sobre a parcela de juros moratórios (que tem natureza indenizatória isenta). No acervo do escritório, 1.214 clientes já possuem dossiês de Execução/Cumprimento de Sentença ou RPV na Justiça Federal.",
    baseContracheques:
      "Imposto de Renda retido nos últimos 5 anos: R$ 216.602.120,37 em 1.012 clientes (mediana R$ 183.952,11/cliente). Subgrupo de liquidações levantadas: 44 lotes somando R$ 7.423.729,28 (média de R$ 168.721,12 por recebimento).",
    formulaCalc:
      "Núcleo de liquidações apuradas: R$ 7,42M × 20% a 30% (juros) × 27,5% (IRRF) = R$ 408 mil a R$ 612 mil (R$ 17,7k–R$ 26,6k/recebimento). Aplicando o mesmo tíquete em apenas 10% a 15% dos 1.012 pagantes de IRRF ativos (101–152 clientes com recebimento via RPV/DIRPF): R$ 1,79M a R$ 4,05M.",
    valorMinM: 1.79,
    valorMaxM: 4.05,
    honorariosStr: "R$ 538 mil a R$ 1,21 milhão",
    docComplementar: "Informe de Rendimentos (RRA) / DIRPF ou Alvará Judicial dos últimos 5 anos.",
  },
  {
    id: "tese2",
    onda: "1",
    ondaLabel: "Onda 1 · Monetização Imediata",
    area: "Previdenciária + Trabalhista",
    areaColor: "border-emerald-200 bg-emerald-50 text-emerald-800",
    titulo: "2. Aposentadoria Especial Pós-ADI 6.309/STF + Retificação de PPP",
    precedente: "ADI 6.309/STF (Jun/2026 — Fim da Idade Mínima) + Tema 555 STF (Ruído)",
    aptosHeadline: "939 clientes ativos (301 já maduros ≥ 25a)",
    aptosSub: "760 Petrobras + 187 Braskem (8 em ambas) · 1.084 no histórico",
    motivo:
      "Recebem adicional de Periculosidade habitual (30%) nos contracheques. A ADI 6.309 derrubou a idade mínima de 55/58/60 anos, liberando a concessão ou revisão para operadores expostos a benzeno/hidrocarbonetos (avaliação qualitativa LINACH) ou ruído. Pelo tempo de casa apurado via gratificação por antiguidade, 301 deles já somam 25 anos ou mais (tempo integral) e 467 somam 20 anos ou mais (conversão 1,4x pré-Reforma).",
    baseContracheques:
      "Periculosidade paga em 5 anos: R$ 74.278.862,27 (mediana R$ 80.782,15). Remuneração mensal bruta apurada dos 939 clientes: mediana de R$ 28.770,02/mês (média R$ 31.789,54/mês), enquadrando 100% no teto máximo do INSS.",
    formulaCalc:
      "Tíquete conservador por ação (atrasados de 12–24 meses até teto INSS + ajuste de RMI vitalícia e eventual ação trabalhista prévia de retificação de PPP): R$ 50 mil a R$ 95 mil iniciais. Conversão de 10% a 25% do núcleo maduro de 301 clientes (30–75 ações): R$ 1,50M a R$ 7,13M imediatos.",
    valorMinM: 1.5,
    valorMaxM: 7.13,
    honorariosStr: "R$ 450 mil a R$ 2,14 milhões (+ mensalidades)",
    docComplementar: "PPP + LTCAT (para comprovar exposição a benzeno/solventes ou ruído acima de 85 dB).",
  },
  {
    id: "tese3",
    onda: "1",
    ondaLabel: "Onda 1 · Monetização Imediata",
    area: "Tributária / Alta Renda",
    areaColor: "border-blue-200 bg-blue-50 text-blue-800",
    titulo: "3. Combo Alta Renda & Aposentados (Súmula 627 Moléstia Grave + Súmula 556 + Tema 1.214)",
    precedente: "Súmula 627 STJ + Súmula 556 STJ (1989–1995) + Tema 1.214 STF (ITCMD VGBL/PGBL)",
    aptosHeadline: "809 seniores alta renda + 140 pré-1995",
    aptosSub: "731 pagam previdência complementar com desconto de IR · 223 no histórico na janela 1989–1995",
    motivo:
      "Público sênior (com alto tempo de casa ou previdência complementar Petros/Odeprev com retenção relevante de imposto em 5 anos) concentrado na faixa máxima de 27,5%. Possui 3 frentes de alto tíquete: (a) isenção e devolução de 5 anos de IRPF para aposentados/pensionistas com moléstia grave (mesmo sem sintomas atuais); (b) bitributação de aportes de 1989–1995 (140 ativos / 223 no histórico); e (c) restituição de ITCMD estadual sobre VGBL/PGBL em inventários.",
    baseContracheques:
      "Os 809 clientes seniores somam R$ 210.231.619,63 retidos em IRRF em 5 anos, com mediana de R$ 220.790,90/cliente (~R$ 44.158/ano). As contribuições para Previdência Privada somam R$ 100,60M (996 ativos).",
    formulaCalc:
      "Cada caso de Súmula 627 recupera integralmente a mediana de 5 anos de IRRF (R$ 220.790,90). Incidência conservadora de 5% a 8% no grupo sênior (40–65 casos) = R$ 8,83M a R$ 14,35M. Somando R$ 0,70M a R$ 1,50M estimados na Súmula 556 (140 elegíveis pré-1995) + Tema 1.214: R$ 9,53M a R$ 15,85M.",
    valorMinM: 9.53,
    valorMaxM: 15.85,
    honorariosStr: "R$ 2,86 milhões a R$ 4,76 milhões",
    docComplementar: "Laudo médico diagnóstico (Súm. 627), ficha financeira 1989–1995 (Súm. 556) ou DARE de inventário.",
  },
  {
    id: "tese4",
    onda: "1",
    ondaLabel: "Onda 1 · Monetização Imediata",
    area: "Bancária / PASEP",
    areaColor: "border-indigo-200 bg-indigo-50 text-indigo-800",
    titulo: "4. Revisão e Indenização de Contas do PASEP (Temas 1.150 e 1.300 STJ)",
    precedente: "Tema 1.150 STJ (10 anos) + Tema 1.300 STJ (Set/2025 — Ônus da Prova)",
    aptosHeadline: "119 Petrobras (≥ 38% Anuênio · pré-Out/1988)",
    aptosSub: "43 ainda ativos pós-2021 · 127 se considerar ≥ 35%",
    motivo:
      "Apenas empregados públicos/servidores admitidos antes de Outubro/1988 tiveram conta individual do PASEP com direito a cobrar desfalques e expurgos contra o Banco do Brasil. O indicador de antiguidade igual ou superior a 38% (38+ anos de vínculo em 2026) identifica automaticamente 119 elegíveis na Petrobras sem precisar pedir a carteira de trabalho previamente.",
    baseContracheques:
      "Os empregados com gratificação de antiguidade igual ou superior a 35% pagam média de R$ 337.358,51 de IRRF em 5 anos, evidenciando salários de topo de carreira desde a década de 1980 (base histórica alta de depósitos PASEP).",
    formulaCalc:
      "Diferenças periciais apuradas sobre microfichas do BB na faixa salarial de estatais/Judiciário pré-1988 giram entre R$ 35 mil e R$ 80 mil por cliente. Considerando viabilidade após perícia prévia em 40% a 60% dos 119 mapeados (48–71 ações): R$ 1,68M a R$ 5,68M.",
    valorMinM: 1.68,
    valorMaxM: 5.68,
    honorariosStr: "R$ 504 mil a R$ 1,70 milhão",
    docComplementar: "Extratos microfilmados da conta PASEP (obtidos no Banco do Brasil) e perícia prévia (Tema 1.300).",
  },
  {
    id: "tese5",
    onda: "2",
    ondaLabel: "Onda 2 · Nichos Já Captados",
    area: "Saúde Suplementar / Previdenciária",
    areaColor: "border-cyan-200 bg-cyan-50 text-cyan-800",
    titulo: "5. Saúde Complementar AMS — Revisão de Sobrecusto, Equacionamento e Dependentes (0980, 0994, 1149)",
    precedente: "TJBA / TRT-5 / TST · Preservação do Plano + Ilegalidade de Equacionamento Extraordinário sem Paridade (Tema 1060 STJ)",
    aptosHeadline: "832 a 986 clientes c/ desconto de saúde",
    aptosSub: "704 sofrem Equacionamento de Custeio (1149) · 109 com dependentes em rubrica extraordinária",
    motivo:
      "A assistência médica corporativa gerou descontos compulsórios em mais de 800 titulares, alcançando R$ 27,2 milhões retidos em 5 anos. Há sólida jurisprudência coibindo o repasse unilateral do deficit atuarial do plano aos beneficiários quando a patrocinadora descumpre a proporção de paridade de custeio (rubrica 1149) e cobrando agregados em rubricas extraordinárias (0994).",
    baseContracheques:
      "R$ 27.231.477,65 descontados em folha nos últimos 5 anos (assistência médica geral: R$ 21,13M; dependentes em cota extra: R$ 1,77M; equacionamento extraordinário de custeio: R$ 610 mil). Mediana de R$ 31.625,02 por titular.",
    formulaCalc:
      "Restituição das retenções de equacionamento de custeio e contribuição extraordinária dos últimos 5 anos (média de R$ 2.800 a R$ 5.200 por titular) em 120 a 170 beneficiários com maiores descontos: R$ 336 mil a R$ 884 mil (conservador: R$ 0,34M a R$ 0,85M).",
    valorMinM: 0.34,
    valorMaxM: 0.85,
    honorariosStr: "R$ 102 mil a R$ 255 mil",
    docComplementar: "Extrato de utilização coparticipativa do plano de saúde e termo de adesão.",
  },
  {
    id: "tese6",
    onda: "2",
    ondaLabel: "Onda 2 · Nichos Já Captados",
    area: "Trabalhista / Falimentar",
    areaColor: "border-orange-200 bg-orange-50 text-orange-800",
    titulo: "6. Recuperação Judicial Unigel / Proquigel (Habilitação & Liquidação TRT-5)",
    precedente: "Processo de Recuperação Judicial (SP) + 675 Publicações Ativas no TRT-5",
    aptosHeadline: "91 dossiês Proquigel Candeias (36 CPFs auditados)",
    aptosSub: "617+ contracheques até 01/2026 · Movimentações processuais recentes",
    motivo:
      "A Proquigel (Grupo Unigel) está em Recuperação Judicial ativa na 2ª Vara de Falências de SP e acumula 675 publicações recentes no TRT-5 (Candeias/Camaçari). Sem liquidação rápida de certidão de crédito e habilitação prioritária na Classe I (trabalhista, até 150 salários mínimos), o trabalhador corre risco de deságio ou perda de prazo de habilitação.",
    baseContracheques:
      "Proventos históricos auditados da Proquigel no acervo complementar: R$ 5.018.610,23 em 617 contracheques (média de R$ 8.133,89 por contracheque).",
    formulaCalc:
      "Crédito trabalhista típico (verbas rescisórias, turno, periculosidade ou diferenças de salário) estimado entre R$ 35 mil e R$ 75 mil por trabalhador (dentro do teto privilegiado Classe I) sobre parcela conservadora de 18 a 20 habilitações prioritárias dos 91 dossiês: R$ 630 mil a R$ 1,50 milhão em proteção patrimonial imediata.",
    valorMinM: 0.63,
    valorMaxM: 1.5,
    honorariosStr: "R$ 189 mil a R$ 450 mil",
    docComplementar: "Consulta de processos ativos por CPF no TRT-5 + emissão de Certidão de Crédito Trabalhista.",
  },
  {
    id: "tese7",
    onda: "2",
    ondaLabel: "Onda 2 · Nichos Já Captados",
    area: "Trabalhista Especializada",
    areaColor: "border-emerald-200 bg-emerald-50 text-emerald-800",
    titulo: "7. Jornada Específica & Transferência Fora do Banco de Horas (0384, 0528/1629, 0412)",
    precedente: "Art. 66 CLT / OJ 355 SDI-1 (Interjornada 11h) + Art. 469 §3º CLT (Transferência)",
    aptosHeadline: "447 Interjornada · 943 Troca Turno · 127 Transf.",
    aptosSub: "Histórico: 473 com intervalo reduzido · 1.123 com troca de turno · 239 com adicional de transferência",
    motivo:
      "A auditoria matemática nos contracheques já descartou adicional noturno sobre periculosidade (pois já é pago corretamente na folha). O ganho real fora do portfólio tradicional está em 3 frentes: (1) horas suprimidas do intervalo de 11h em dobras operacionais (447 recebem rubrica 0384); (2) excedente não pago na troca de turno acima do teto de 10 min (943 recebem 0528/1629); e (3) Adicional de Transferência Provisória (127 ativos / 239 no histórico).",
    baseContracheques:
      "Em 5 anos: Intervalo interjornada suprimido (0384) = R$ 13.502.157,25 (mediana R$ 27.080,53); Troca de Turno (0528/1507/1629) = R$ 33.350.826,92 (mediana R$ 30.085,65); Transferência (0412/0457) = R$ 599.163,27 (histórico R$ 1,01M). Soma de interjornada e troca de turno = R$ 46,85M.",
    formulaCalc:
      "Aplicando captura conservadora de apenas 10% a 15% de horas não quitadas sobre os R$ 46,85M já pagos em intervalo interjornada e troca de turno, acrescida de 35% de reflexos (13º salário, férias e FGTS): R$ 46,85M × (10% a 15%) × 1,35 = R$ 6,33M a R$ 9,49M.",
    valorMinM: 6.33,
    valorMaxM: 9.49,
    honorariosStr: "R$ 1,90 milhão a R$ 2,85 milhões",
    docComplementar: "Espelhos de ponto e registros de acesso à unidade (para troca > 10 min e dobras) e aditivo de transferência.",
  },
  {
    id: "tese8",
    onda: "3",
    ondaLabel: "Onda 3 · Consumo & Defesa Patrimonial",
    area: "Consumidor / Bancário",
    areaColor: "border-purple-200 bg-purple-50 text-purple-800",
    titulo: "8. Revisional de Consignado (Petros/PrevPri/Santander) & Limite de Margem 30%",
    precedente: "Código de Defesa do Consumidor (TJBA / TJRJ) + Limite 30% Líquido + Tema 27 STJ (Taxa Média Bacen)",
    aptosHeadline: "400 clientes acima de 30% (613 c/ consignado)",
    aptosSub: "340 superam 35% · 522 comprometem mais de 40% (Consignado + Previdência + Saúde)",
    motivo:
      "Cruzamento mês a mês provou que 400 clientes ativos ultrapassaram a trava jurisprudencial de 30% da renda líquida disponível apenas com empréstimos consignados em folha. Os tribunais estaduais (TJBA e TJRJ) aplicam as normas protetivas do consumidor para limitar descontos ao mínimo existencial, revisar taxas de juros destoantes da média Bacen e afastar cobrança casada de seguro prestamista.",
    baseContracheques:
      "R$ 38.734.313,03 descontados em consignados em 5 anos (entidade fechada 0888: R$ 28,97M; previdência privada 2225: R$ 2,77M; instituição financeira 2202: R$ 2,12M; mediana R$ 41.697,66). Excedente matemático direto apurado acima de 30%: R$ 3.074.666,94 (e R$ 1.590.806,62 acima de 35%).",
    formulaCalc:
      "1ª Camada (Excesso direto acima da margem de 30% já apurado nos contracheques dos 400 clientes): R$ 3,07M. 2ª Camada (Restituição de encargos contratuais acima da média Bacen e seguros vinculados de 10% a 15% sobre R$ 38,73M): +R$ 3,87M a R$ 5,81M. Total estimado: R$ 6,95M a R$ 8,88M.",
    valorMinM: 6.95,
    valorMaxM: 8.88,
    honorariosStr: "R$ 2,09 milhões a R$ 2,66 milhões",
    docComplementar: "Contratos de empréstimo e extrato financeiro das entidades consignatárias (para apurar CET, taxa e encargos).",
  },
];

export const AMOSTRAS_CLIENTES: Record<string, ClienteAmostra[]> = {
  tese1: [
    {
      nome: "Magno Antonio Bemfica de Oliveira",
      cpf: "260.256.278-51",
      matricula: "0741722",
      empresa: "Petrobras",
      periodo: "01/2021 a 09/2026 (103 contracheques)",
      base: "IRRF retido (5 anos): R$ 1.002.852,20",
      potencial: "R$ 55.156,87 a R$ 82.735,31",
      motivo: "Ação de repetição de indébito de IRPF em fase de Execução (Justiça Federal)",
    },
    {
      nome: "Everson Silvano Braciak",
      cpf: "060.665.079-23",
      matricula: "2496010",
      empresa: "Petrobras",
      periodo: "01/2021 a 08/2026 (124 contracheques)",
      base: "IRRF retido (5 anos): R$ 912.792,35",
      potencial: "R$ 50.203,58 a R$ 75.305,37",
      motivo: "Cumprimento de Sentença tributária em curso no Juízo Federal",
    },
    {
      nome: "Luis Henrique Fernandes",
      cpf: "338.759.198-58",
      matricula: "2492789",
      empresa: "Petrobras",
      periodo: "01/2021 a 06/2025 (72 contracheques)",
      base: "IRRF retido (5 anos): R$ 784.406,56",
      potencial: "R$ 43.142,36 a R$ 64.713,54",
      motivo: "Cumprimento de Sentença de Restituição Tributária na Justiça Federal",
    },
    {
      nome: "Arlen Wanderson Landim Ferreira",
      cpf: "049.790.484-55",
      matricula: "2414542",
      empresa: "Petrobras",
      periodo: "01/2021 a 11/2025 (45 contracheques)",
      base: "IRRF retido (5 anos): R$ 755.563,68",
      potencial: "R$ 41.556,00 a R$ 62.334,00",
      motivo: "Execução de Sentença — Repetição de Tributo em Juízo Federal",
    },
    {
      nome: "Evanio Belarmino Magalhaes",
      cpf: "030.442.417-07",
      matricula: "1387863",
      empresa: "Petrobras",
      periodo: "01/2021 a 05/2026 (141 contracheques)",
      base: "IRRF retido (5 anos): R$ 748.106,92",
      potencial: "R$ 41.145,88 a R$ 61.718,82",
      motivo: "Cumprimento de Sentença e Dossiê Fiscal na Justiça Federal",
    },
  ],
  tese2: [
    {
      nome: "Luiz Fernando Fogia",
      cpf: "002.600.647-26",
      matricula: "9618812",
      empresa: "Petrobras",
      periodo: "01/2021 a 08/2026 (71 contracheques)",
      base: "Periculosidade (5 anos): R$ 265.255,24 · Antiguidade: 26,6%",
      potencial: "R$ 60.000 a R$ 95.000 (+ RMI)",
      motivo: "Periculosidade habitual 30% contínua · Tempo de atividade especial ≥ 25 anos",
    },
    {
      nome: "Andre Henrique Lemos de Freitas",
      cpf: "539.269.270-20",
      matricula: "5324265",
      empresa: "Petrobras",
      periodo: "01/2021 a 11/2025 (62 contracheques)",
      base: "Periculosidade (5 anos): R$ 190.522,20 · Antiguidade: 38,2%",
      potencial: "R$ 60.000 a R$ 95.000 (+ RMI)",
      motivo: "Mais de 38 anos de vínculo operacional exposto · Remuneração no teto previdenciário",
    },
    {
      nome: "Paulo Henrique Correa Magalhaes",
      cpf: "020.671.257-02",
      matricula: "1381361",
      empresa: "Petrobras",
      periodo: "01/2021 a 08/2026 (121 contracheques)",
      base: "Periculosidade (5 anos): R$ 180.104,25 · Antiguidade: 28,2%",
      potencial: "R$ 60.000 a R$ 95.000 (+ RMI)",
      motivo: "Mais de 28 anos com adicional de risco contínuo em área operacional",
    },
    {
      nome: "Ivanildo Antonio Soares Correia",
      cpf: "455.955.004-25",
      matricula: "1729880",
      empresa: "Petrobras",
      periodo: "01/2021 a 11/2025 (56 contracheques)",
      base: "Periculosidade (5 anos): R$ 177.092,27 · Antiguidade: 36,6%",
      potencial: "R$ 60.000 a R$ 95.000 (+ RMI)",
      motivo: "Mais de 36 anos de carreira industrial · Enquadramento direto no julgamento da ADI 6.309",
    },
    {
      nome: "Daniel Aparecido da Silva Norberto",
      cpf: "062.159.998-06",
      matricula: "7654305",
      empresa: "Petrobras",
      periodo: "01/2021 a 12/2025 (60 contracheques)",
      base: "Periculosidade (5 anos): R$ 169.526,00 · Antiguidade: 45,0%",
      potencial: "R$ 60.000 a R$ 95.000 (+ RMI)",
      motivo: "45 anos de vínculo operacional contínuo · Direito adquirido e revisão de PPP",
    },
  ],
  tese3: [
    {
      nome: "Rodrigo Cardoso Alves",
      cpf: "094.880.707-57",
      matricula: "222862",
      empresa: "Petrobras",
      periodo: "01/2021 a 11/2025 (75 contracheques)",
      base: "IRRF (5 anos): R$ 734.452,06 · Previdência Privada: R$ 337.399,47",
      potencial: "Até R$ 734.452,06 (Súmula 627)",
      motivo: "Perfil sênior alta renda (28,2% de tempo de casa) com execução federal em andamento",
    },
    {
      nome: "Silvio Garcia Coelho",
      cpf: "017.138.529-26",
      matricula: "9707452",
      empresa: "Petrobras",
      periodo: "01/2021 a 09/2026 (154 contracheques)",
      base: "IRRF (5 anos): R$ 720.479,83 · Previdência Privada: R$ 375.930,69",
      potencial: "Até R$ 720.479,83 (Súmula 627)",
      motivo: "Aportes elevados de previdência complementar (R$ 375,9 mil) e imposto de renda no topo",
    },
    {
      nome: "Bruno Cortes Carneiro",
      cpf: "795.067.045-20",
      matricula: "333920",
      empresa: "Petrobras",
      periodo: "01/2021 a 09/2026 (98 contracheques)",
      base: "IRRF (5 anos): R$ 719.949,43 · Previdência Privada: R$ 286.668,80",
      potencial: "Até R$ 719.949,43 (Súmula 627)",
      motivo: "Sênior (29,1% antiguidade) com retenção média anual de imposto acima de R$ 140 mil",
    },
    {
      nome: "Pedro Henrique Dias da Silva",
      cpf: "052.332.387-56",
      matricula: "9849128",
      empresa: "Petrobras",
      periodo: "01/2021 a 05/2026 (126 contracheques)",
      base: "IRRF (5 anos): R$ 622.445,36 · Previdência Privada: R$ 234.466,80",
      potencial: "Até R$ 622.445,36 (Súmula 627)",
      motivo: "Retenção contínua na alíquota de 27,5% e desconto de previdência complementar",
    },
    {
      nome: "Mauro Rodrigues de Souza",
      cpf: "017.008.007-28",
      matricula: "9714375",
      empresa: "Petrobras",
      periodo: "01/2021 a 05/2026 (98 contracheques)",
      base: "IRRF (5 anos): R$ 622.168,61 · Previdência Privada: R$ 312.973,86",
      potencial: "Até R$ 622.168,61 (Súmula 627)",
      motivo: "Imposto retido superior a R$ 620 mil no período de 5 anos com execução judicial ativa",
    },
  ],
  tese4: [
    {
      nome: "Andre Henrique Lemos de Freitas",
      cpf: "539.269.270-20",
      matricula: "5324265",
      empresa: "Petrobras",
      periodo: "01/2021 a 11/2025 (62 contracheques)",
      base: "Antiguidade apurada: 38,2% (admissão pré-Out/1988) · IRRF: R$ 627.602,76",
      potencial: "R$ 45.000 a R$ 80.000",
      motivo: "Percentual de antiguidade (38,2%) comprova admissão antes de Outubro/1988 (PASEP)",
    },
    {
      nome: "Daniel Aparecido da Silva Norberto",
      cpf: "062.159.998-06",
      matricula: "7654305",
      empresa: "Petrobras",
      periodo: "01/2021 a 12/2025 (60 contracheques)",
      base: "Antiguidade apurada: 45,0% (admissão pré-Out/1988) · IRRF: R$ 618.967,92",
      potencial: "R$ 45.000 a R$ 80.000",
      motivo: "Percentual de antiguidade (45,0%) reflete 45 anos de vínculo contínuo (máxima base histórica)",
    },
    {
      nome: "Nilson de Oliveira Freitas",
      cpf: "315.102.805-53",
      matricula: "1872819",
      empresa: "Petrobras",
      periodo: "01/2021 a 01/2026 (71 contracheques)",
      base: "Antiguidade apurada: 45,0% (admissão pré-Out/1988) · IRRF: R$ 598.291,11",
      potencial: "R$ 45.000 a R$ 80.000",
      motivo: "Percentual de antiguidade (45,0%) comprova vínculo anterior à promulgação da Constituição de 1988",
    },
    {
      nome: "Ricardo Lopes Matriciano",
      cpf: "961.149.167-00",
      matricula: "5169642",
      empresa: "Petrobras",
      periodo: "01/2021 a 09/2025 (60 contracheques)",
      base: "Antiguidade apurada: 45,0% (admissão pré-Out/1988) · IRRF: R$ 577.708,93",
      potencial: "R$ 45.000 a R$ 80.000",
      motivo: "Vínculo contínuo com titularidade de conta individual PASEP administrada pelo Banco do Brasil",
    },
    {
      nome: "Jose Rodrigues de Andrade",
      cpf: "223.804.423-04",
      matricula: "1721439",
      empresa: "Petrobras",
      periodo: "01/2021 a 09/2025 (47 contracheques)",
      base: "Antiguidade apurada: 45,0% (admissão pré-Out/1988) · IRRF: R$ 553.874,64",
      potencial: "R$ 45.000 a R$ 80.000",
      motivo: "Enquadramento direto nos precedentes repetitivos dos Temas 1.150 e 1.300 do STJ",
    },
  ],
  tese5: [
    {
      nome: "Rogerio Rodrigues da Silva",
      cpf: "767.515.627-72",
      matricula: "7003938",
      empresa: "Petrobras",
      periodo: "01/2021 a 11/2025 (61 contracheques)",
      base: "Assistência Médica geral (5 anos): R$ 162.058,84 · Retenções extraordinárias: R$ 82.793,34",
      potencial: "R$ 37.257,00 a R$ 66.234,67",
      motivo: "Maior montante de custeio extraordinário de saúde e cobrança de dependente em folha",
    },
    {
      nome: "Ricardo Lopes Matriciano",
      cpf: "961.149.167-00",
      matricula: "5169642",
      empresa: "Petrobras",
      periodo: "01/2021 a 09/2025 (60 contracheques)",
      base: "Assistência Médica geral (5 anos): R$ 85.700,98 · Retenções extraordinárias: R$ 15.383,87",
      potencial: "R$ 6.922,74 a R$ 12.307,10",
      motivo: "Cobranças reiteradas de participação suplementar e parcelas extraordinárias de custeio",
    },
    {
      nome: "Claudio Eduardo Rocha da Silva",
      cpf: "825.736.385-53",
      matricula: "333980",
      empresa: "Petrobras",
      periodo: "01/2021 a 02/2026 (62 contracheques)",
      base: "Assistência Médica geral (5 anos): R$ 59.709,81 · Retenções extraordinárias: R$ 20.262,99",
      potencial: "R$ 9.118,35 a R$ 16.210,39",
      motivo: "Cobrança mensal em rubrica de custeio extraordinário e dependente em cota segregada",
    },
    {
      nome: "Beroaldo Vieira Guimaraes",
      cpf: "777.148.654-15",
      matricula: "2475535",
      empresa: "Petrobras",
      periodo: "01/2021 a 05/2026 (77 contracheques)",
      base: "Assistência Médica geral (5 anos): R$ 51.318,85 · Retenções extraordinárias: R$ 1.225,82",
      potencial: "R$ 4.105,51 a R$ 7.697,83",
      motivo: "Descontos contínuos de participação do titular e parcela de equacionamento de saúde",
    },
    {
      nome: "Victor da Silva Felix",
      cpf: "103.339.697-40",
      matricula: "9781302",
      empresa: "Petrobras",
      periodo: "01/2021 a 07/2025 (106 contracheques)",
      base: "Assistência Médica geral (5 anos): R$ 39.785,05 · Retenções extraordinárias: R$ 5.287,70",
      potencial: "R$ 2.800,00 a R$ 4.480,00",
      motivo: "Histórico com cobrança sucessiva em rubrica de equacionamento extraordinário de assistência médica",
    },
  ],
  tese6: [
    {
      nome: "Edmilson Santos Oliveira",
      cpf: "684.339.135-49",
      matricula: "9720517",
      empresa: "Proquigel / Petrobras",
      periodo: "01/2021 a 12/2024 (53 contracheques)",
      base: "Convenção Coletiva Proquigel no dossiê · IRRF 5 anos: R$ 133.857,30",
      potencial: "R$ 45.000 a R$ 75.000 (Classe I)",
      motivo: "Vinculado ao polo químico de Candeias com 53 contracheques conciliados",
    },
    {
      nome: "Bruno Santana Belchior",
      cpf: "030.429.645-74",
      matricula: "Polo Candeias",
      empresa: "Proquigel Química S/A",
      periodo: "Polo Petroquímico de Candeias (Dossiê Ativo)",
      base: "Convenção Coletiva e Execução TRT-5 / TRF-1",
      potencial: "R$ 35.000 a R$ 75.000",
      motivo: "Cumprimento de sentença contra Proquigel em tramitação no TRT-5",
    },
    {
      nome: "Claudio Meirelles da Silva",
      cpf: "544.757.595-87",
      matricula: "Polo Candeias",
      empresa: "Proquigel Química S/A",
      periodo: "Polo Petroquímico de Candeias (Dossiê Ativo)",
      base: "Convenção Coletiva e Execução TRT-5 / TRF-1",
      potencial: "R$ 35.000 a R$ 75.000",
      motivo: "Execução trabalhista em curso contra Proquigel no TRT-5",
    },
    {
      nome: "Emidio Reis de Santana Cruz Neto",
      cpf: "019.452.855-32",
      matricula: "Polo Candeias",
      empresa: "Proquigel Química S/A",
      periodo: "Polo Petroquímico de Candeias (Dossiê Ativo)",
      base: "Convenção Coletiva e Execução TRT-5 / TRF-1",
      potencial: "R$ 35.000 a R$ 75.000",
      motivo: "Cumprimento de decisão trabalhista contra Proquigel",
    },
    {
      nome: "Adenilto de Souza Pires",
      cpf: "824.665.135-87",
      matricula: "Polo Candeias",
      empresa: "Proquigel Química S/A",
      periodo: "Polo Petroquímico de Candeias (Dossiê Ativo)",
      base: "Convenção Coletiva e Execução TRT-5 / TRF-1",
      potencial: "R$ 35.000 a R$ 75.000",
      motivo: "Dossiê Proquigel Candeias com declaração fiscal e vínculo operacional comprovados",
    },
  ],
  tese7: [
    {
      nome: "Lincoln Moura de Oliveira",
      cpf: "018.537.213-95",
      matricula: "9862728",
      empresa: "Petrobras",
      periodo: "01/2021 a 03/2026 (114 contracheques)",
      base: "Intervalo 11h: R$ 92.174,76 · Troca de Turno: R$ 161.018,28 · Transferência: R$ 3.367,86",
      potencial: "R$ 34.181,06 a R$ 51.271,59",
      motivo: "Recebimento conjunto de intervalo interjornada suprimido, troca de turno e transferência",
    },
    {
      nome: "Magno Antonio Bemfica de Oliveira",
      cpf: "260.256.278-51",
      matricula: "0741722",
      empresa: "Petrobras",
      periodo: "01/2021 a 09/2026 (103 contracheques)",
      base: "Intervalo 11h: R$ 107.331,07 · Troca de Turno: R$ 76.434,57",
      potencial: "R$ 24.808,36 a R$ 37.212,54",
      motivo: "Supressão habitual de intervalo de 11h em dobras e horas suplementares de passagem de turno",
    },
    {
      nome: "Clovis Matheus",
      cpf: "139.408.238-05",
      matricula: "5827225",
      empresa: "Petrobras",
      periodo: "01/2021 a 08/2025 (67 contracheques)",
      base: "Intervalo 11h: R$ 61.664,82 · Troca de Turno: R$ 119.373,98",
      potencial: "R$ 24.440,24 a R$ 36.660,36",
      motivo: "Elevada recorrência em rubricas de troca de turno operacional e interjornada reduzida",
    },
    {
      nome: "Andre Henrique Lemos de Freitas",
      cpf: "539.269.270-20",
      matricula: "5324265",
      empresa: "Petrobras",
      periodo: "01/2021 a 11/2025 (62 contracheques)",
      base: "Intervalo 11h: R$ 120.938,06 · Troca de Turno: R$ 53.878,73",
      potencial: "R$ 23.600,27 a R$ 35.400,40",
      motivo: "Maior montante pago de intervalo interjornada (mais de R$ 120 mil em 5 anos)",
    },
    {
      nome: "Mauro Rodrigues de Souza",
      cpf: "017.008.007-28",
      matricula: "9714375",
      empresa: "Petrobras",
      periodo: "01/2021 a 05/2026 (98 contracheques)",
      base: "Intervalo 11h: R$ 85.612,93 · Troca de Turno: R$ 79.270,21 · Transferência: R$ 407,71",
      potencial: "R$ 22.259,22 a R$ 33.388,84",
      motivo: "Cumulação comprovada de interjornada reduzida, troca de turno e adicional de transferência",
    },
  ],
  tese8: [
    {
      nome: "Paulo Henrique Correa Magalhaes",
      cpf: "020.671.257-02",
      matricula: "1381361",
      empresa: "Petrobras",
      periodo: "01/2021 a 08/2026 (121 contracheques)",
      base: "Consignado (5 anos): R$ 393.004,00 · Excesso acima de 30%: R$ 146.874,30 (58 meses)",
      potencial: "R$ 146.874,30 a R$ 194.034,78",
      motivo: "Comprometimento financeiro acima de 30% da renda líquida em 58 meses",
    },
    {
      nome: "Willians Messias do Espirito Santo",
      cpf: "295.489.748-19",
      matricula: "00007782",
      empresa: "Braskem",
      periodo: "01/2021 a 09/2025 (85 contracheques)",
      base: "Consignado (5 anos): R$ 171.043,67 · Excesso acima de 30%: R$ 79.258,38 (27 meses)",
      potencial: "R$ 79.258,38 a R$ 99.783,62",
      motivo: "Empréstimo bancário em folha ultrapassou a margem legal de 30% em 27 competências",
    },
    {
      nome: "Tiago dos Santos Batista",
      cpf: "053.533.617-92",
      matricula: "9735908",
      empresa: "Petrobras",
      periodo: "01/2021 a 05/2025 (74 contracheques)",
      base: "Consignado (5 anos): R$ 183.452,30 · Excesso acima de 30%: R$ 60.173,03 (40 meses)",
      potencial: "R$ 60.173,03 a R$ 82.187,31",
      motivo: "Superação recorrente da trava legal de 30% em 40 competências mensais",
    },
    {
      nome: "Marcio Ribeiro Trindade",
      cpf: "023.013.987-65",
      matricula: "9777270",
      empresa: "Petrobras",
      periodo: "01/2021 a 07/2026 (72 contracheques)",
      base: "Consignado (5 anos): R$ 231.459,20 · Excesso acima de 30%: R$ 54.635,93 (51 meses)",
      potencial: "R$ 54.635,93 a R$ 82.411,03",
      motivo: "Margem de consignado comprometida além de 30% em 51 competências",
    },
    {
      nome: "Allan Freire Figueiredo do Carmo",
      cpf: "091.052.797-04",
      matricula: "9763609",
      empresa: "Petrobras",
      periodo: "01/2021 a 04/2026 (87 contracheques)",
      base: "Consignado (5 anos): R$ 259.756,70 · Excesso acima de 30%: R$ 44.493,57 (38 meses)",
      potencial: "R$ 44.493,57 a R$ 75.664,37",
      motivo: "Empréstimo de entidade consignatária acima de 30% da renda líquida em 38 meses",
    },
  ],
};

export const FAIXAS_ANUENIO: FaixaAnuenio[] = [
  {
    rotulo: "≥ 38%",
    criterio: "Admissão pré-Out/1988 (PASEP Temas 1.150 e 1.300 STJ)",
    historico: "119 clientes no histórico",
    ativos: "43 ativos pós-2021",
    destaque: true,
  },
  {
    rotulo: "≥ 30%",
    criterio: "Janela 1989–1995 (Bitributação Súmula 556 STJ)",
    historico: "137 clientes no histórico",
    ativos: "59 ativos pós-2021",
  },
  {
    rotulo: "≥ 25%",
    criterio: "25+ anos de vínculo (Aposentadoria Especial ADI 6.309 STF)",
    historico: "216 clientes no histórico",
    ativos: "176 ativos pós-2021",
    destaque: true,
  },
  {
    rotulo: "≥ 20%",
    criterio: "Conversão pré-Reforma (Fator 1,4x atividade especial)",
    historico: "382 clientes no histórico",
    ativos: "409 ativos pós-2021",
  },
];

export const FAIXAS_CONSIGNADO: FaixaConsignado[] = [
  {
    rotulo: "Ultrapassaram 30% da renda líquida",
    valor: "400 clientes · R$ 3,07M em excesso apurado",
    classe: "text-emerald-700",
  },
  {
    rotulo: "Ultrapassaram 35% da renda líquida",
    valor: "340 clientes · R$ 1,59M em excesso apurado",
    classe: "text-amber-700",
  },
  {
    rotulo: "Comprometimento > 40% composto",
    valor: "522 clientes (Consignado + Previdência + Saúde)",
    classe: "text-destructive",
  },
];

export const SINAIS_ACESSORIOS: SinalAcessorio[] = [
  {
    titulo: "Abono Pecuniário de Férias (0405/MC40)",
    totalPessoas: "498 clientes aptos",
    valor: "R$ 11.822.918,30 pagos em 5 anos (mediana R$ 17.339,71)",
    descricao:
      "Contracheques reais já costumam segregar férias e abono. Utilizar como conferência no Informe de Rendimentos para verificar se o lançamento fiscal foi feito como rendimento isento e não tributável.",
  },
  {
    titulo: "Contribuição Assistencial pré-09/2023 (Tema 935)",
    totalPessoas: "482 clientes aptos",
    valor: "R$ 331.727,94 antes de set/2023 (~R$ 688/cliente)",
    descricao:
      "De um total de 645 ativos (R$ 744,3 mil), as contribuições descontadas antes de setembro de 2023 são restituíveis como pedido cumulado em ações trabalhistas em andamento.",
  },
];

export const NICHOS_COMPLEMENTARES: NichoComplementar[] = [
  {
    grupo: "Ações em Fase de Execução (Justiça Federal)",
    cadastros: "941 a 1.214",
    contracheques: "791+ dossiês",
    proventos: "R$ 28.832.613,77",
    oportunidade:
      "Prova material do Tema 808 STF: precatórios e requisições de pequeno valor com retenção de imposto de renda sobre juros de mora para pedido imediato de restituição.",
  },
  {
    grupo: "Liquidações e Alvarás Homologados",
    cadastros: "44+ lotes",
    contracheques: "44 lotes",
    proventos: "R$ 7.423.729,28",
    oportunidade:
      "Média de R$ 168,7 mil por recebimento judicial apurado com imposto retido na fonte restituível via repetição tributária.",
  },
  {
    grupo: "Proquigel Química S/A (Unigel Candeias)",
    cadastros: "91 pastas",
    contracheques: "617+ contracheques",
    proventos: "R$ 5.018.610,23",
    oportunidade:
      "Habilitação e salvaguarda prioritária de créditos trabalhistas na Recuperação Judicial (Classe I — trabalhista até 150 salários mínimos).",
  },
  {
    grupo: "Vopak Brasil S/A",
    cadastros: "42 cadastros",
    contracheques: "702 contracheques",
    proventos: "R$ 7.861.886,22",
    oportunidade:
      "Foco em periculosidade operacional, horas extras e intervalo interjornada (sem risco de tese superada de cais portuário privado).",
  },
  {
    grupo: "Termomacaé S/A & Tronox Pigmentos",
    cadastros: "19 + 18 cadastros",
    contracheques: "249 + 227 contracheques",
    proventos: "R$ 12.705.856,59",
    oportunidade:
      "Aposentadoria Especial (ADI 6.309 + PPP agentes nocivos ruído e químicos), Tema 808 IRPF e revisão de margem de consignado.",
  },
];

export const RADAR_VERMELHO: TeseBarrada[] = [
  {
    tese: "RMNR (Exclusão de adicionais da fórmula de complemento)",
    reviravolta: "Trânsito em julgado no STF (RE 1251927) e superação formal do Tema 13 pelo TST.",
    diretriz: "Não ajuizar novas ações. Conduzir apenas cumprimento de coisa julgada anterior.",
    acaoBadge: "Não Distribuir",
    badgeClasse: "border-red-200 bg-red-50 text-red-700",
  },
  {
    tese: "FGTS (Correção monetária TR vs. IPCA retroativa)",
    reviravolta: "O STF modulou os efeitos na ADI 5090 apenas para o futuro (a partir de junho/2024).",
    diretriz: "Não captar. Inexistência de saldo retroativo a recuperar dos últimos anos.",
    acaoBadge: "Não Distribuir",
    badgeClasse: "border-red-200 bg-red-50 text-red-700",
  },
  {
    tese: "7ª e 8ª Horas em Turno Ininterrupto de 8h & Deslocamento Interno",
    reviravolta: "O TST cancelou as Súmulas 423 e 429 com base no Tema 1046 do STF (prevalência do negociado).",
    diretriz: "Vedada tese genérica de turno de 8h quando houver norma coletiva. Atuar apenas em horas além da 8ª.",
    acaoBadge: "Não Distribuir",
    badgeClasse: "border-red-200 bg-red-50 text-red-700",
  },
  {
    tese: "Repouso Semanal Remunerado de Petroleiros a 20% (vs. 16,67%)",
    reviravolta: "O TST pacificou em recurso repetitivo (Tema 160) o percentual legal de 16,67% (1/6).",
    diretriz: "Ajustar cálculos para o teto de 16,67%, que já é o percentual praticado regularmente na folha.",
    acaoBadge: "Ajustar Parâmetro",
    badgeClasse: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    tese: "Adicional Noturno sobre Periculosidade & Risco Portuário Privado",
    reviravolta:
      "A conferência em contracheques comprovou que a base de cálculo já integra 30% no adicional noturno; jurisprudência veda risco portuário em terminais privados.",
    diretriz: "Evitar custo inútil com perícia nesses itens e focar em intervalo interjornada e troca de turno.",
    acaoBadge: "Não Distribuir",
    badgeClasse: "border-red-200 bg-red-50 text-red-700",
  },
  {
    tese: "Anulação Integral de Contribuição Extraordinária Petros na Justiça do Trabalho",
    reviravolta:
      "O TST fixou a incompetência da Justiça do Trabalho para o pleito geral e a jurisprudência preserva o custeio de planos fechados.",
    diretriz: "Focar na dedução fiscal de imposto de renda (Tema 1224) e na trava de margem de 30%.",
    acaoBadge: "Ajustar Foco",
    badgeClasse: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    tese: "Imposto de Renda sobre 1/3 Constitucional de Férias Gozadas",
    reviravolta: "O STJ consolidou no Tema 881 a incidência de imposto sobre férias gozadas (isenção restrita a indenizadas).",
    diretriz: "Pleitear restituição exclusivamente sobre férias e licenças não gozadas convertidas em dinheiro.",
    acaoBadge: "Não Distribuir",
    badgeClasse: "border-red-200 bg-red-50 text-red-700",
  },
];
