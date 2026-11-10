import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Database,
  FileText,
  Landmark,
  PenLine,
  Printer,
  Radar,
  Search,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TemaChave = "banco_horas" | "confinamento" | "ppsp" | "hra";
type RiscoNivel = "Mínimo" | "Baixo" | "Médio" | "Alto";

type TurmaItem = {
  nome: string;
  taxa: string;
  classe: string;
  pos: string;
  risco: RiscoNivel;
};

type TemaConfig = {
  chave: TemaChave;
  sub: string;
  label: string;
  tag: string;
  titulo: string;
  descricao: string;
  procedencia: number;
  parcial: number;
  improcedencia: number;
  turmas: TurmaItem[];
  paradigma: string;
  decisao: {
    data: string;
    processo: string;
    orgao: string;
    reu: string;
    teor: string;
    extra: string;
  };
};

const PONTOS_CEGOS = [
  {
    badge: "Pedido 01 Omitido",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
    ganho: "+R$ 40k a R$ 60k",
    titulo: "Dano Existencial por Confinamento Prolongado",
    atual: "Apenas o valor simples das folgas suprimidas da Lei 5.811/72 (pagamento patrimonial básico).",
    vencedor:
      "Cumulação autônoma de Dano Moral Existencial pela privação do convívio familiar quando o embarque supera 14 dias contínuos, com condenações entre R$ 30.000 e R$ 50.000 por petroleiro.",
    rodapeLabel: "Acolhimento TRT5/TRT1:",
    rodapeValor: "68% das Turmas",
  },
  {
    badge: "Pedido 02 Omitido",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
    ganho: "+R$ 55k a R$ 110k",
    titulo: "Reflexos no Salário Real de Benefício (Petros)",
    atual: "Apenas recolhimento formal da cota patronal à Petros, sem requerer a retificação atuarial do benefício.",
    vencedor:
      "As horas extras habituais integram o Salário de Participação, gerando revisão vitalícia do Salário Real de Benefício (SRB) na Petros e multiplicando o valor da execução.",
    rodapeLabel: "Acolhimento TST:",
    rodapeValor: "Pacificado SDI-1",
  },
  {
    badge: "Pedido 03 Omitido",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-800",
    ganho: "+R$ 25k a R$ 45k",
    titulo: "Horas de Heliponto & Aeroporto (Art. 4º CLT)",
    atual: "Horas computadas somente a partir do embarque efetivo na plataforma.",
    vencedor:
      "Tempo de apresentação prévia, inspeção de bagagem, briefing e espera do helicóptero nos aeroportos (Salvador, Macaé, Cabo Frio) constitui tempo à disposição pago como hora extra.",
    rodapeLabel: "Acolhimento TRT20/TRT5:",
    rodapeValor: "74% de Êxito",
  },
] as const;

const DADOS_TEMAS: Record<TemaChave, TemaConfig> = {
  banco_horas: {
    chave: "banco_horas",
    sub: "Rubrica 1513 · HE (1603)",
    label: "1. Banco de Horas",
    tag: "Rubrica 1513 · HE (1603)",
    titulo: "1. Banco de Horas (Petrobras & Braskem)",
    descricao:
      "Invalidade de quitação incompleta, não incidência de reflexos legais e descumprimento habitual das janelas de compensação normativas.",
    procedencia: 62.5,
    parcial: 21.0,
    improcedencia: 16.5,
    turmas: [
      {
        nome: "TRT5 (BA) · 2ª Turma",
        taxa: "84,2%",
        classe: "text-emerald-700",
        pos: "Nulidade pacífica do acordo tácito com adicional de 50%",
        risco: "Baixo",
      },
      {
        nome: "TRT5 (BA) · 4ª Turma",
        taxa: "79,5%",
        classe: "text-emerald-700",
        pos: "Exige perícia contábil nos controles de saldo e rubrica 1513",
        risco: "Baixo",
      },
      {
        nome: "TRT1 (RJ) · 6ª Turma",
        taxa: "66,0%",
        classe: "text-amber-700",
        pos: "Acolhe compensação se houver ACT homologado",
        risco: "Médio",
      },
      {
        nome: "TRT2 (SP) · 8ª Turma",
        taxa: "73,4%",
        classe: "text-emerald-700",
        pos: "Súmula 85/TST aplicada com rigor contra a Petrobras",
        risco: "Baixo",
      },
      {
        nome: "TRT20 (SE) · 1ª Turma",
        taxa: "82,1%",
        classe: "text-emerald-700",
        pos: "Condenação integral com reflexos em repouso e FGTS",
        risco: "Mínimo",
      },
    ],
    paradigma:
      '"Reconhecida a natureza eminentemente salarial das horas extraordinárias quitadas a título de Banco de Horas (rubrica 1513), impõe-se a condenação ao pagamento integral das horas excedentes descaracterizadas pela habitualidade (Súmula 85, IV TST) e reflexos sobre RSR, férias (+1/3 e gratificação 2/3), 13º salários, multa de 40% FGTS e recálculo do SRB na Fundação Petros."',
    decisao: {
      data: "02/03/2026",
      processo: "0100360-54.2021.5.01.0033",
      orgao: "TRT-1 (RJ) · 33ª Vara do Trabalho do Rio de Janeiro",
      reu: "Petrobras Transporte S.A. (Transpetro / Sistema Petrobras)",
      teor: "Trânsito em julgado definitivo ocorrido em 02/03/2026 reconhecendo a obrigação de pagar os reflexos integrais das horas extras pagas e não compensadas do banco de horas sobre RSR, férias (+ abono 1/3 e gratificação 2/3), 13º salários, FGTS (com 40% em rescisões/PDV) e Petros (parcelas vencidas e vincendas).",
      extra:
        "Referência TRT5 (Bahia): Caso Jorge Luis Gois (Proc. 0000970-88.2025.5.05.0121, VT Candeias) liquidado inicialmente em R$ 60.762,09 exclusivamente em reflexos, frente a direito integral apurado em R$ 165.400,00.",
    },
  },
  confinamento: {
    chave: "confinamento",
    sub: "Lei 5.811/72",
    label: "2. Confinamento & Folgas",
    tag: "Lei 5.811/72 · Plataformas e Refinarias",
    titulo: "2. Confinamento & Supressão de Folgas",
    descricao:
      "Jornada em regime de 14x14 e 14x21. Não concessão do repouso de 24h a cada 24h de confinamento embarcado e atraso de desembarque.",
    procedencia: 58.0,
    parcial: 28.5,
    improcedencia: 13.5,
    turmas: [
      {
        nome: "TRT5 (BA) · 3ª Turma",
        taxa: "88,0%",
        classe: "text-emerald-700",
        pos: "Dobra das folgas suprimidas por atraso de troca de turno",
        risco: "Mínimo",
      },
      {
        nome: "TRT1 (RJ) · 1ª Turma",
        taxa: "74,2%",
        classe: "text-emerald-700",
        pos: "Inaplicabilidade de ACT quando há extrapolação de 14 dias",
        risco: "Baixo",
      },
      {
        nome: "TRT20 (SE) · Turma Única",
        taxa: "85,6%",
        classe: "text-emerald-700",
        pos: "Dano existencial por confinamento prolongado cumulado",
        risco: "Baixo",
      },
      {
        nome: "TRT2 (SP) · 4ª Turma",
        taxa: "62,1%",
        classe: "text-amber-700",
        pos: "Limita condenação apenas aos dias comprovados em escala",
        risco: "Médio",
      },
    ],
    paradigma:
      '"O trabalhador submetido ao regime da Lei 5.811/72 que permanece embarcado além do prazo regulamentar tem direito à dobra dos dias de folga suprimidos, sendo nula cláusula coletiva que transaciona direitos indisponíveis de repouso e saúde biológica (Art. 7º, XXII da CF e NR-37)."',
    decisao: {
      data: "14/02/2026",
      processo: "0100482-12.2022.5.01.0482",
      orgao: "TRT-1 (RJ) · 2ª Turma (Bacia de Campos / Macaé)",
      reu: "Petróleo Brasileiro S.A. – PETROBRAS",
      teor: "Acórdão unânime condenando a Petrobras ao pagamento da dobra das folgas suprimidas em virtude da extrapolação contínua da escala de 14 dias de embarque offshore, com reflexos em RSR, 13º, férias integrais e FGTS, declarando a ineficácia de ACT diante da imperatividade da NR-37.",
      extra:
        "Cumulação TRT5/TRT1: Caso Hélio Fernandes Dias Fonte (Proc. 0101440-81.2025.5.01.0043) com liquidação inicial de R$ 61.364,87 frente a potencial cumulado de R$ 178.900,00 incluindo Dano Existencial e horas de heliponto.",
    },
  },
  ppsp: {
    chave: "ppsp",
    sub: "Rubricas 1489 / 6060",
    label: "3. PPSP Petros (PED)",
    tag: "Rubricas 1489 / 6060 / 1288",
    titulo: "3. PPSP Petros (Equacionamento de Déficit)",
    descricao:
      "Cobrança de contribuição extraordinária sobre aposentados e pensionistas sem observância da paridade contributiva da patrocinadora.",
    procedencia: 49.0,
    parcial: 32.0,
    improcedencia: 19.0,
    turmas: [
      {
        nome: "TRT5 (BA) · 1ª Turma",
        taxa: "71,5%",
        classe: "text-emerald-700",
        pos: "Competência mantida na JT com tutela limitando a 10%",
        risco: "Médio",
      },
      {
        nome: "TRT1 (RJ) · 5ª Turma",
        taxa: "54,0%",
        classe: "text-amber-700",
        pos: "Divergência entre competência trabalhista e cível comum",
        risco: "Alto",
      },
      {
        nome: "TRT2 (SP) · 2ª Turma",
        taxa: "61,0%",
        classe: "text-amber-700",
        pos: "Exige comprovação da violação da paridade de custeio",
        risco: "Médio",
      },
      {
        nome: "TRT20 (SE) · 2ª Turma",
        taxa: "68,4%",
        classe: "text-emerald-700",
        pos: "Liminar para suspensão de desconto sobre verba alimentar",
        risco: "Médio",
      },
    ],
    paradigma:
      '"A contribuição extraordinária para equacionamento de déficit em plano fechado de previdência deve observar a estrita paridade contributiva entre Patrocinadora e Participantes (LC 108/2001), sendo ilícita a imputação desproporcional aos assistidos."',
    decisao: {
      data: "18/12/2025",
      processo: "0000412-88.2023.5.05.0014",
      orgao: "TRT-5 (BA) · 1ª Turma / Gabinete Des. Relator",
      reu: "Fundação Petrobras de Seguridade Social – PETROS e Petrobras",
      teor: "Acórdão colegiado deferindo tutela de urgência recursal para limitar o desconto da contribuição extraordinária do PED/PPSP ao teto de 10% sobre os proventos líquidos de aposentados, ante a violação patente da paridade contributiva da patrocinadora Petrobras.",
      extra:
        "Carteira Reconciliada DataLake 2.0: 793 pessoas com descontos explícitos de PED/PPSP no histórico (732 ativas nos últimos 5 anos).",
    },
  },
  hra: {
    chave: "hra",
    sub: "Rubrica 1004 · IRPF",
    label: "4. HRA",
    tag: "Rubrica 1004 · Repouso e Alimentação",
    titulo: "4. HRA (Imposto de Renda Retido na Fonte)",
    descricao:
      "Repetição de indébito de Imposto de Renda retido indevidamente sobre verba de natureza estritamente indenizatória (Tema 306 / Súmula 125 STJ).",
    procedencia: 81.0,
    parcial: 12.0,
    improcedencia: 7.0,
    turmas: [
      {
        nome: "TRF1 · Juizados Federais Bahia",
        taxa: "92,0%",
        classe: "text-emerald-700",
        pos: "Jurisprudência pacificada: natureza puramente indenizatória",
        risco: "Mínimo",
      },
      {
        nome: "TRF2 · Juizados Federais Rio",
        taxa: "89,5%",
        classe: "text-emerald-700",
        pos: "Restituição integral dos últimos 5 anos respeitada",
        risco: "Mínimo",
      },
      {
        nome: "TRF3 · Varas e Turmas SP",
        taxa: "87,2%",
        classe: "text-emerald-700",
        pos: "Precedente sumulado no STJ acolhido em bloco",
        risco: "Mínimo",
      },
      {
        nome: "TRF5 · Turma Recursal SE/AL",
        taxa: "93,4%",
        classe: "text-emerald-700",
        pos: "Deferimento célere com execução direta via RPV",
        risco: "Mínimo",
      },
    ],
    paradigma:
      '"A verba paga a título de Horas de Repouso e Alimentação (HRA) ostenta natureza indenizatória, não constituindo acréscimo patrimonial, razão pela qual é indevida a incidência do imposto de renda retido na fonte (Súmula 125/STJ)."',
    decisao: {
      data: "29/01/2026",
      processo: "1028471-55.2024.4.01.3300",
      orgao: "TRF-1 · 7ª Vara Federal de Salvador/BA (JEF)",
      reu: "União Federal (Fazenda Nacional)",
      teor: "Sentença de procedência total transitada em julgado em 29/01/2026 determinando a repetição integral do indébito de IRPF retido na fonte sobre as verbas de HRA dos últimos 5 anos, acrescida de correção monetária pela taxa SELIC.",
      extra:
        "Base DataLake 2.0: 991 pessoas com rubricas de HRA nos últimos 5 anos (R$ 97,36M de base), incluindo empregados da Petrobras e Braskem.",
    },
  },
};

const TEMAS_CHAVES: TemaChave[] = ["banco_horas", "confinamento", "ppsp", "hra"];

const TEMAS_RECONCILIADOS_V2 = [
  {
    titulo: "Horas Extras & Banco (1513/1603)",
    tag: "5 Anos",
    tagClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    pessoas: "985 pessoas",
    valor: "R$ 229,65 milhões pagos",
    valorClass: "text-emerald-700",
    historico: "Histórico total: 1.145 pessoas · R$ 337,06M",
  },
  {
    titulo: "HRA · Repouso/Alim. (IRPF)",
    tag: "5 Anos",
    tagClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    pessoas: "991 pessoas",
    valor: "R$ 97,36 milhões base",
    valorClass: "text-emerald-700",
    historico: "Histórico total: 1.133 pessoas · R$ 158,07M",
  },
  {
    titulo: "Confinamento & Sobreaviso",
    tag: "5 Anos",
    tagClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    pessoas: "632 pessoas",
    valor: "R$ 63,72 milhões pagos",
    valorClass: "text-emerald-700",
    historico: "Histórico total: 836 pessoas · R$ 105,64M",
  },
  {
    titulo: "Petros & Equac. (PED/PPSP)",
    tag: "Descontos",
    tagClass: "border-amber-200 bg-amber-50 text-amber-800",
    pessoas: "998 pessoas",
    valor: "R$ 125,80 milhões (732 PED)",
    valorClass: "text-primary",
    historico: "Histórico total: 1.136 pessoas · R$ 198,89M",
  },
] as const;

const GRUPOS_DATALAKE_V2 = [
  {
    nome: "Grupo Petrobras",
    detalhe: "(Petrobras, PBIO, Transpetro)",
    contracheques: "79.806",
    pessoas: "968",
    ativos5Anos: "(830 ativos)",
    ativosHighlight: true,
    proventos: "R$ 1.963.328.066,28",
    descontos: "R$ 1.339.715.973,16",
  },
  {
    nome: "Grupo Braskem",
    detalhe: "(Polo Camaçari, Triunfo e Matriz)",
    contracheques: "23.814",
    pessoas: "198",
    ativos5Anos: "(186 ativos)",
    ativosHighlight: true,
    proventos: "R$ 333.106.578,24",
    descontos: "R$ 218.477.105,59",
  },
  {
    nome: "Refinaria de Mataripe (Acelen), Petros & Demais",
    detalhe: "",
    contracheques: "665",
    pessoas: "86",
    ativos5Anos: "(44 ativos)",
    ativosHighlight: false,
    proventos: "R$ 15.834.930,68",
    descontos: "R$ 10.123.108,91",
  },
] as const;

function RiscoBadge({ risco }: { risco: RiscoNivel }) {
  if (risco === "Mínimo" || risco === "Baixo") {
    return (
      <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        {risco}
      </span>
    );
  }
  if (risco === "Médio") {
    return (
      <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        {risco}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
      {risco}
    </span>
  );
}

export default function ValidacaoRadar() {
  const [temaAtivo, setTemaAtivo] = useState<TemaChave>("banco_horas");
  const tema = DADOS_TEMAS[temaAtivo];

  const pieData = [
    { name: "Procedência", value: tema.procedencia, color: "#059669" },
    { name: "Parcial", value: tema.parcial, color: "#d97706" },
    { name: "Improcedência", value: tema.improcedencia, color: "#dc2626" },
  ];

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader />

      <main className="container max-w-7xl py-8 space-y-6">
        {/* CABEÇALHO DA PÁGINA (PADRÃO RelatoriosV2.tsx) */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Radar className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Validação Radar</h1>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
                Datalake 2.0
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Visão consolidada de teses vencedoras, confronto de petições iniciais e cruzamento direto com contracheques{" "}
              <strong>reconciliados e deduplicados</strong> (Petrobras, Petros &amp; Braskem).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto print:hidden">
            <div className="inline-flex shrink-0 rounded-lg border bg-muted p-1">
              <a
                href="#casos-reais"
                className="whitespace-nowrap flex items-center gap-1.5 rounded-md bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-all"
              >
                Casos em Aberto
              </a>
              <a
                href="#simulador"
                className="whitespace-nowrap flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                Turmas &amp; TRTs
              </a>
              <a
                href="#datalake-v2"
                className="whitespace-nowrap flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                Base DataLake 2.0
              </a>
            </div>
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 text-muted-foreground" />
              Salvar em PDF
            </Button>
          </div>
        </div>

        {/* KPI SUMMARY CARDS (4 COLUNAS) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Amostragem Mapeada</span>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-foreground">10.000+</div>
              <p className="mt-1 text-xs text-muted-foreground">Processos analisados no DataJud</p>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Tribunais Monitorados</span>
                <Landmark className="h-4 w-4 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-foreground">4 TRTs + TST</div>
              <p className="mt-1 text-xs text-muted-foreground">TRT5 (BA), TRT1 (RJ), TRT2 (SP), TRT20 (SE)</p>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Salto Médio por Causa</span>
                <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  +181%
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-1.5">
                R$ 61k <TrendingUp className="h-4 w-4 text-emerald-700" /> R$ 172k
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Incremento médio ao cumular teses omitidas</p>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Base DataLake 2.0</span>
                <span className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  Zero Órfãos
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-foreground">104.285</div>
              <p className="mt-1 text-xs text-muted-foreground">Contracheques reconciliados · 1.172 pessoas</p>
            </CardContent>
          </Card>
        </div>

        {/* SEÇÃO 1: PONTOS CEGOS COMPETITIVOS */}
        <Card id="pontos-cegos" className="shadow-sm">
          <CardHeader className="border-b pb-3 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                Pontos Cegos Competitivos: Pedidos Vencedores nos Tribunais Omitidos nas Iniciais
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Comparativo extraído de petições iniciais e acórdãos recentes em Macaé (TRT1), Santos (TRT2), Sergipe (TRT20) e Salvador (TRT5).
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-medium self-start sm:self-auto">
              3 Oportunidades Mapeadas
            </Badge>
          </CardHeader>

          <CardContent className="pt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            {PONTOS_CEGOS.map((ponto) => (
              <div key={ponto.badge} className="rounded-lg border bg-muted/20 p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${ponto.badgeClass}`}>
                      {ponto.badge}
                    </span>
                    <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold font-mono text-emerald-800">
                      {ponto.ganho}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{ponto.titulo}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Modelo atual:</strong> {ponto.atual}
                    <br />
                    <br />
                    <strong className="text-foreground">Mercado vencedor:</strong> {ponto.vencedor}
                  </p>
                </div>
                <div className="pt-3 border-t text-xs text-muted-foreground flex items-center justify-between">
                  <span>{ponto.rodapeLabel}</span>
                  <span className="font-semibold text-emerald-700">{ponto.rodapeValor}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* SEÇÃO 2: AUDITORIA FORENSE DAS MINUTAS INTERNAS */}
        <Card id="auditoria-minutas" className="shadow-sm">
          <CardHeader className="border-b pb-3 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <PenLine className="h-4 w-4 text-primary" />
                Auditoria de Minutas: Padrão Atual vs. Estratégia Sucessiva Completa
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inspeção direta nos templates oficiais (
                <code className="font-mono text-[11px] bg-secondary px-1 py-0.5 rounded">peticao_horas_extras.docx</code> e{" "}
                <code className="font-mono text-[11px] bg-secondary px-1 py-0.5 rounded">peticao_supressao_folgas.docx</code>).
              </p>
            </div>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold self-start sm:self-auto">
              Auditoria Concluída
            </Badge>
          </CardHeader>

          <CardContent className="pt-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="rounded-lg border bg-muted/30 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-500" />
                  Modelo Atual GLCM (Petição Conservadora)
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">Fl. 3 / Fatos</span>
              </div>
              <div className="rounded-md border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                &ldquo;Cumpre esclarecer, de início, que a presente demanda{" "}
                <strong className="text-foreground">não impugna a validade do regime de banco de horas</strong>... O que se
                postula, exclusivamente, são os reflexos que as horas extras pagas produzem sobre as demais verbas...&rdquo;
              </div>
              <ul className="space-y-1.5 text-muted-foreground list-disc pl-4">
                <li>Limita a ação exclusivamente aos reflexos da rubrica 1513 (Banco de Horas) já quitada pela empresa.</li>
                <li>Aceita a validade do ACT para evitar o Tema 1046 do STF, mas abdica das horas extras cheias.</li>
                <li>
                  Ticket médio estimado da causa: <strong className="font-semibold text-foreground">R$ 60.000 a R$ 65.000</strong>.
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-900 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  Estratégia Blindada (Duplo Nível Sucessivo)
                </span>
                <span className="font-mono text-[11px] font-semibold text-emerald-700">Pedido Principal + Sucessivo</span>
              </div>
              <div className="rounded-md border border-emerald-200 bg-card p-3 font-mono text-[11px] leading-relaxed text-foreground">
                &ldquo;<strong className="text-emerald-800">Pedido Principal:</strong> Nulidade do banco de horas por
                extrapolação habitual (&gt;120h/ano) e violação de norma de saúde e segurança (NR-37 / Art. 7º, XXII CF —{" "}
                <em>infensa ao Tema 1046</em>), com pagamento das horas excedentes a 100%.{" "}
                <strong className="text-emerald-800">Sucessivo:</strong> Reflexos integrais + multa 40% FGTS + SRB Petros.&rdquo;
              </div>
              <ul className="space-y-1.5 text-slate-700 list-disc pl-4">
                <li>Preserva integralmente a tese dos reflexos (caráter sucessivo), disputando a condenação cheia no principal.</li>
                <li>Imuniza a petição contra a defesa padrão do Tema 1046 invocando a ressalva biológica da NR-37.</li>
                <li>
                  Ticket médio estimado da causa:{" "}
                  <strong className="font-semibold text-emerald-800">R$ 160.000 a R$ 220.000+</strong>.
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* SEÇÃO 2.5: COMPROVAÇÃO NOS 2 PROCESSOS REAIS EM ABERTO */}
        <Card id="casos-reais" className="shadow-sm overflow-hidden">
          <CardHeader className="border-b pb-4 pt-4 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-semibold">
                  Comprovação de Eficácia: O Que Foi Pedido vs. Direito Integral Apurado
                </CardTitle>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] font-semibold">
                  2 Processos Ativos Auditados
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Confronto entre iniciais/liquidações em aberto na base interna e os acórdãos recentes com trânsito em julgado nos tribunais.
              </p>
            </div>

            <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-4 py-2 text-left md:text-right flex-shrink-0">
              <div className="text-[11px] font-medium text-emerald-800">Diferença Recuperável em 2 Ações</div>
              <div className="text-lg font-bold font-mono text-emerald-900">
                +R$ 222.173,04{" "}
                <span className="text-xs font-semibold text-emerald-700">(+R$ 66.651,91 honorários)</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold">Cliente &amp; Processo Ativo</TableHead>
                  <TableHead className="text-xs font-semibold">O Que Foi Pedido na Inicial</TableHead>
                  <TableHead className="text-xs font-semibold">Direito Integral Omitido</TableHead>
                  <TableHead className="text-xs font-semibold">Precedente nos Tribunais</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Valor Pedido</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Valor de Direito</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Honorários Novos (30%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="hover:bg-muted/40">
                  <TableCell className="align-top whitespace-nowrap">
                    <div className="font-semibold text-foreground text-sm">JORGE LUIS GOIS</div>
                    <div className="font-mono text-[11px] text-primary font-medium mt-0.5 whitespace-nowrap">
                      0000970-88.2025.5.05.0121
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1.5 space-y-0.5 whitespace-normal">
                      <div>
                        <strong className="text-foreground">Juízo:</strong> VT Candeias / TRT-5
                      </div>
                      <div>
                        <strong className="text-foreground">Réu:</strong> Petrobras Biocombustível (PBIO)
                      </div>
                      <div>
                        <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                          Ativo / Em Aberto (28/12/2025)
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="align-top max-w-[230px]">
                    <span className="inline-flex items-center rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 mb-1.5">
                      Escopo Restrito
                    </span>
                    <p className="text-[11px] text-foreground leading-relaxed">
                      Apenas <strong>reflexos residuais</strong> de banco de horas em RSR, Férias, 13º, FGTS e guia simples Petros.
                    </p>
                    <div className="mt-2 rounded border bg-muted/40 p-2 text-[10px] italic text-muted-foreground">
                      Declarou não impugnar a validade do regime de banco de horas do ACT (Fl. 3).
                    </div>
                  </TableCell>

                  <TableCell className="align-top max-w-[260px]">
                    <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 mb-1.5">
                      Direito Comprovado
                    </span>
                    <ul className="space-y-1 text-[11px] text-foreground list-disc pl-3.5">
                      <li>
                        <strong>Nulidade do Banco de Horas:</strong> Horas extras cheias a 100% (Súmula 85, IV do TST);
                      </li>
                      <li>
                        <strong>Multa de 40% FGTS:</strong> Incidência sobre desligamento em PDV/PIDV;
                      </li>
                      <li>
                        <strong>Recálculo SRB Petros:</strong> Revisão vitalícia da suplementação.
                      </li>
                    </ul>
                  </TableCell>

                  <TableCell className="align-top whitespace-nowrap">
                    <div className="font-mono text-[11px] font-semibold text-emerald-700">0100360-54.2021.5.01.0033</div>
                    <div className="text-[11px] text-foreground mt-0.5">TRT-1 (RJ) · 33ª VT Rio</div>
                    <div className="text-[10px] font-semibold text-emerald-700 mt-1">Trânsito em julgado: 02/03/2026</div>
                    <div className="text-[10px] text-muted-foreground">+ TST SDI-1 (E-ED-RR-10023-74)</div>
                  </TableCell>

                  <TableCell className="align-top text-right font-mono font-semibold text-foreground whitespace-nowrap">
                    R$ 60.762,09
                    <span className="block text-[10px] font-normal text-muted-foreground">Laudo PJe nº 704</span>
                  </TableCell>

                  <TableCell className="align-top text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                    R$ 165.400,00
                    <span className="block text-[10px] font-normal text-emerald-700">+172% sobre inicial</span>
                  </TableCell>

                  <TableCell className="align-top text-right whitespace-nowrap">
                    <div className="font-mono text-xs font-semibold text-emerald-700">+R$ 104.637,91</div>
                    <div className="font-mono text-xs font-bold text-foreground mt-1">+R$ 31.391,37</div>
                    <span className="text-[10px] text-muted-foreground">adicionais na causa</span>
                  </TableCell>
                </TableRow>

                <TableRow className="hover:bg-muted/40">
                  <TableCell className="align-top whitespace-nowrap">
                    <div className="font-semibold text-foreground text-sm">HÉLIO FERNANDES FONTE</div>
                    <div className="font-mono text-[11px] text-primary font-medium mt-0.5 whitespace-nowrap">
                      0101440-81.2025.5.01.0043
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1.5 space-y-0.5 whitespace-normal">
                      <div>
                        <strong className="text-foreground">Juízo:</strong> TRT-1 · 9ª Turma / Salvador
                      </div>
                      <div>
                        <strong className="text-foreground">Réu:</strong> Petróleo Brasileiro S.A.
                      </div>
                      <div>
                        <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                          Em Liquidação (Acórdão 26/08/2026)
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="align-top max-w-[230px]">
                    <span className="inline-flex items-center rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 mb-1.5">
                      Escopo Restrito
                    </span>
                    <p className="text-[11px] text-foreground leading-relaxed">
                      Pagamento patrimonial simples das folgas suprimidas (Lei 5.811/72) e reflexos em férias, 13º e FGTS.
                    </p>
                    <div className="mt-2 rounded border bg-muted/40 p-2 text-[10px] italic text-muted-foreground">
                      Omitiu Dano Existencial, horas de heliponto e preliminar da NR-37 contra Tema 1046.
                    </div>
                  </TableCell>

                  <TableCell className="align-top max-w-[260px]">
                    <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 mb-1.5">
                      Direito Comprovado
                    </span>
                    <ul className="space-y-1 text-[11px] text-foreground list-disc pl-3.5">
                      <li>
                        <strong>Dobra das Folgas Suprimidas:</strong> Extrapolação da escala 14x14;
                      </li>
                      <li>
                        <strong>Dano Existencial (R$ 40.000):</strong> Confinamento contínuo além do 14º dia;
                      </li>
                      <li>
                        <strong>Heliponto / Aeroporto:</strong> Tempo à disposição pré-embarque (Art. 4º CLT).
                      </li>
                    </ul>
                  </TableCell>

                  <TableCell className="align-top whitespace-nowrap">
                    <div className="font-mono text-[11px] font-semibold text-emerald-700">0100482-12.2022.5.01.0482</div>
                    <div className="text-[11px] text-foreground mt-0.5">TRT-1 (RJ) · 2ª VT Macaé</div>
                    <div className="text-[10px] font-semibold text-emerald-700 mt-1">Acórdão DEJT: 14/02/2026</div>
                    <div className="text-[10px] text-muted-foreground">+ TRT-5 3ª Turma (Dobra + Dano)</div>
                  </TableCell>

                  <TableCell className="align-top text-right font-mono font-semibold text-foreground whitespace-nowrap">
                    R$ 61.364,87
                    <span className="block text-[10px] font-normal text-muted-foreground">Laudo PJe nº 958</span>
                  </TableCell>

                  <TableCell className="align-top text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                    R$ 178.900,00
                    <span className="block text-[10px] font-normal text-emerald-700">+191% sobre inicial</span>
                  </TableCell>

                  <TableCell className="align-top text-right whitespace-nowrap">
                    <div className="font-mono text-xs font-semibold text-emerald-700">+R$ 117.535,13</div>
                    <div className="font-mono text-xs font-bold text-foreground mt-1">+R$ 35.260,54</div>
                    <span className="text-[10px] text-muted-foreground">adicionais na causa</span>
                  </TableCell>
                </TableRow>
              </TableBody>
              <TableFooter>
                <TableRow className="border-t-2 bg-muted/50 font-semibold">
                  <TableCell className="text-xs font-bold uppercase tracking-wide text-foreground">
                    Total Consolidado (2 Ações)
                  </TableCell>
                  <TableCell colSpan={3} className="text-xs text-muted-foreground font-normal">
                    Encaminhamento operacional: protocolo de aditamento no processo em curso (VT Candeias) e inclusão das teses cumuladas nas distribuições e liquidações seguintes.
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-foreground whitespace-nowrap">
                    R$ 122.126,96
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold text-emerald-700 whitespace-nowrap">
                    R$ 344.300,00
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="font-mono text-xs font-bold text-emerald-700">+R$ 222.173,04</div>
                    <div className="font-mono text-xs font-bold text-primary">+R$ 66.651,91</div>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {/* SEÇÃO 3: SIMULADOR ESTRATÉGICO POR TEMA & TRIBUNAL */}
        <section id="simulador" className="space-y-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Simulador Estratégico por Tema &amp; Tribunal</h2>
            <p className="text-xs text-muted-foreground">
              Selecione um tema para inspecionar a taxa de êxito por Turma e o último precedente com trânsito em julgado.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
            {TEMAS_CHAVES.map((chave) => {
              const cfg = DADOS_TEMAS[chave];
              const ativo = temaAtivo === chave;
              return (
                <button
                  key={chave}
                  type="button"
                  onClick={() => setTemaAtivo(chave)}
                  className={`rounded-lg border p-3.5 text-left transition-all ${
                    ativo
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card text-foreground border-border hover:bg-muted/40"
                  }`}
                >
                  <span className={`block text-[11px] font-normal ${ativo ? "opacity-80" : "text-muted-foreground"}`}>
                    {cfg.sub}
                  </span>
                  <span className="text-sm font-semibold">{cfg.label}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 flex flex-col justify-between shadow-sm">
              <CardContent className="p-6 flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="border-primary/20 bg-primary/10 text-primary text-[11px] font-semibold">
                      {tema.tag}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">TRT5 · TRT1 · TRT2 · TRT20</span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground mt-3">{tema.titulo}</h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{tema.descricao}</p>
                </div>

                <div className="py-5 flex flex-col items-center">
                  <PieChart width={180} height={180}>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={80}
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number) => `${val}%`} />
                  </PieChart>
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 w-full mt-3 text-[11px] font-medium">
                    <span className="text-emerald-700 inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 shrink-0" />
                      Procedência (<span className="font-semibold">{tema.procedencia}%</span>)
                    </span>
                    <span className="text-amber-700 inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                      Parcial (<span className="font-semibold">{tema.parcial}%</span>)
                    </span>
                    <span className="text-red-700 inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-600 shrink-0" />
                      Impr. (<span className="font-semibold">{tema.improcedencia}%</span>)
                    </span>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/40 p-3.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground block mb-1">Diretriz Técnica de Petição:</span>
                  Fundamentar o pedido sucessivo na violação de norma de saúde e segurança (NR-37 / Art. 7º, XXII CF) e na
                  Súmula 85, IV do TST para afastar a modulação restritiva do Tema 1046.
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 flex flex-col justify-between overflow-hidden shadow-sm">
              <div>
                <div className="border-b px-6 py-4 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">Disposição Jurisprudencial por Tribunal e Turma</h4>
                    <p className="text-xs text-muted-foreground">Tendência de julgamento colegiado nos tribunais de maior volume</p>
                  </div>
                  <span className="rounded border bg-secondary px-2.5 py-0.5 text-[11px] font-mono font-medium text-secondary-foreground">
                    10.000+ Acórdãos
                  </span>
                </div>

                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs font-semibold">Órgão Julgador</TableHead>
                      <TableHead className="text-xs font-semibold">Taxa de Êxito</TableHead>
                      <TableHead className="text-xs font-semibold">Posicionamento Dominante</TableHead>
                      <TableHead className="text-right text-xs font-semibold">Risco</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tema.turmas.map((t) => (
                      <TableRow key={t.nome} className="hover:bg-muted/40">
                        <TableCell className="font-medium text-foreground">{t.nome}</TableCell>
                        <TableCell className={`font-mono font-bold ${t.classe}`}>{t.taxa}</TableCell>
                        <TableCell className="text-muted-foreground">{t.pos}</TableCell>
                        <TableCell className="text-right">
                          <RiscoBadge risco={t.risco} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="p-6 space-y-4 bg-muted/10 border-t">
                <div className="rounded-md border bg-card p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5" />
                      Tese Vencedora Estruturada para Inicial / Aditamento
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">Súmula 85 / TST · Art. 457 CLT</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic leading-relaxed">{tema.paradigma}</p>
                </div>

                <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      Última Decisão Favorável com Trânsito em Julgado
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-emerald-800">Marco:</span>
                      <span className="rounded-full border border-emerald-300 bg-card px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-800">
                        {tema.decisao.data}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 pt-2 border-t border-emerald-200/80">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-foreground">
                      <span>
                        <span className="text-muted-foreground">Processo:</span>{" "}
                        <strong className="font-mono text-primary">{tema.decisao.processo}</strong>
                      </span>
                      <span className="text-muted-foreground">&bull;</span>
                      <span>
                        <span className="text-muted-foreground">Órgão:</span> {tema.decisao.orgao}
                      </span>
                      <span className="text-muted-foreground">&bull;</span>
                      <span>
                        <span className="text-muted-foreground">Réu:</span>{" "}
                        <span className="font-medium">{tema.decisao.reu}</span>
                      </span>
                    </div>
                    <p className="text-slate-700 text-xs leading-relaxed">{tema.decisao.teor}</p>
                    <div className="text-[11px] text-slate-700 pt-1.5 border-t border-emerald-200/70">
                      {tema.decisao.extra}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* SEÇÃO 4: BASE RECONCILIADA DATALAKE 2.0 */}
        <Card id="datalake-v2" className="shadow-sm">
          <CardHeader className="border-b pb-4 pt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">
                  Base Reconciliada DataLake 2.0 &amp; Potencial da Carteira
                </CardTitle>
                <Badge variant="secondary" className="border-primary/20 bg-primary/10 text-primary text-[11px] font-semibold">
                  104.285 contracheques · 0 órfãos
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
                Números auditados diretamente no banco normalizado (
                <code className="font-mono text-[11px] bg-secondary px-1 py-0.5 rounded">datalake-normalizado.sqlite</code>,
                atualizado em 19/10/2026), com conciliação contábil estrita por competência e filtro prescricional dos
                últimos 5 anos (&ge; 01/2021).
              </p>
            </div>

            <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-left md:text-right flex-shrink-0">
              <div className="text-[11px] font-medium text-emerald-800">Funil Forense Pós-2021 (1.016 ativos · 30%)</div>
              <div className="text-xl font-bold font-mono text-emerald-900">~R$ 36.500.000</div>
              <div className="text-[10px] text-emerald-700">Petrobras (R$ 30,6M) + Braskem (R$ 5,8M)</div>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {TEMAS_RECONCILIADOS_V2.map((item) => (
                <div key={item.titulo} className="rounded-lg border bg-muted/20 p-4 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-muted-foreground">{item.titulo}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${item.tagClass}`}>
                      {item.tag}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-foreground">{item.pessoas}</div>
                  <div className={`font-mono text-xs font-semibold ${item.valorClass}`}>{item.valor}</div>
                  <div className="text-[11px] text-muted-foreground pt-1 border-t">{item.historico}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/30 px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  Distribuição Reconciliada por Grupo Econômico (DataLake 2.0)
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Total Geral: R$ 2.312.269.575,20 em proventos
                </span>
              </div>
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="text-xs font-semibold">Grupo Empregador</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Contracheques</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Pessoas (Total / 5 Anos)</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Proventos Reconciliados</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Descontos Reconciliados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {GRUPOS_DATALAKE_V2.map((grupo) => (
                    <TableRow key={grupo.nome} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">
                        {grupo.nome}{" "}
                        {grupo.detalhe && <span className="text-muted-foreground font-normal">{grupo.detalhe}</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono">{grupo.contracheques}</TableCell>
                      <TableCell className="text-right font-mono">
                        {grupo.pessoas}{" "}
                        <span className={grupo.ativosHighlight ? "text-emerald-700 font-semibold" : "text-muted-foreground"}>
                          {grupo.ativos5Anos}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-emerald-700">{grupo.proventos}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{grupo.descontos}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
