import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Database,
  FileText,
  Landmark,
  PenLine,
  Printer,
  Radar,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { AppHeader } from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TemaChave = "banco_horas" | "confinamento" | "ppsp" | "hra";
type RiscoNivel = "Mínimo" | "Baixo" | "Médio" | "Alto";

export type DecisaoEvidencia = {
  id: string;
  data: string;
  processo: string;
  tribunalTurma: string;
  desfecho: "Procedente" | "Parcial" | "Improcedente";
  fundamento: string;
};

export type TurmaItem = {
  nome: string;
  taxa: string;
  classe: string;
  pos: string;
  risco: RiscoNivel;
  statusGlcm?: "PRIORITARIO" | "ATIVO" | "MODERADO" | "BLOQUEADO";
  bloqueioMensagem?: string;
  ultimasDecisoes: DecisaoEvidencia[];
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
    rodapeLabel: "Acolhimento TRT5 (Bahia):",
    rodapeValor: "84% de Êxito · TRT20 (SE): Bloqueado",
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
        statusGlcm: "PRIORITARIO",
        ultimasDecisoes: [
          {
            id: "bh-ba2-1",
            data: "20/03/2026",
            processo: "0000970-88.2025.5.05.0121",
            tribunalTurma: "TRT-5 · VT Candeias",
            desfecho: "Procedente",
            fundamento: "Caso Jorge Luis Gois: Nulidade de banco de horas (rubrica 1513) e reflexos integrais em RSR, Férias e FGTS (R$ 60.762,09).",
          },
          {
            id: "bh-ba2-2",
            data: "14/01/2026",
            processo: "0000589-30.2023.5.05.0031",
            tribunalTurma: "TRT-5 · 4ª Turma",
            desfecho: "Procedente",
            fundamento: "Súmula 85, IV do TST: Descaracterização do acordo de compensação tácito por extrapolação contínua da jornada de 8h/12h.",
          },
          {
            id: "bh-ba2-3",
            data: "10/11/2025",
            processo: "0000324-42.2023.5.05.0161",
            tribunalTurma: "TRT-5 · 2ª Turma",
            desfecho: "Procedente",
            fundamento: "Caso Edson Santos Sena: Invalidade da compensação tácita e deferimento de reflexos em férias, 13º e repouso.",
          },
          {
            id: "bh-ba2-4",
            data: "25/08/2025",
            processo: "0000788-37.2021.5.05.0161",
            tribunalTurma: "TRT-5 · 2ª Turma",
            desfecho: "Procedente",
            fundamento: "Caso Jorge Eduardo de Góis: Condenação em reflexos e repercussões salariais de horas extraordinárias na Petrobras.",
          },
          {
            id: "bh-ba2-5",
            data: "15/04/2025",
            processo: "0000412-19.2023.5.05.0018",
            tribunalTurma: "TRT-5 · 4ª Turma",
            desfecho: "Parcial",
            fundamento: "Extrapolação habitual comprovada em perícia contábil; deferido adicional de 50% sobre saldo não compensado.",
          },
        ],
      },
      {
        nome: "TRT5 (BA) · 4ª Turma",
        taxa: "79,5%",
        classe: "text-emerald-700",
        pos: "Exige perícia contábil nos controles de saldo e rubrica 1513",
        risco: "Baixo",
        statusGlcm: "PRIORITARIO",
        ultimasDecisoes: [
          {
            id: "bh-ba4-1",
            data: "05/02/2026",
            processo: "0000108-92.2024.5.05.0024",
            tribunalTurma: "TRT-5 · 4ª Turma",
            desfecho: "Procedente",
            fundamento: "Perícia contábil comprova crédito de horas sem compensação no quadrimestre; condenação com reflexos em RSR.",
          },
          {
            id: "bh-ba4-2",
            data: "19/11/2025",
            processo: "0000844-15.2023.5.05.0122",
            tribunalTurma: "TRT-5 · 4ª Turma",
            desfecho: "Procedente",
            fundamento: "Nulidade do sistema informal de compensação; pagamento de horas excedentes à 8ª diária na refinaria.",
          },
          {
            id: "bh-ba4-3",
            data: "08/09/2025",
            processo: "0000632-41.2023.5.05.0006",
            tribunalTurma: "TRT-5 · 4ª Turma",
            desfecho: "Parcial",
            fundamento: "Acolhido demonstrativo de diferenças apresentado na réplica; deferido adicional sobre as horas quitadas.",
          },
          {
            id: "bh-ba4-4",
            data: "22/05/2025",
            processo: "0000311-70.2022.5.05.0039",
            tribunalTurma: "TRT-5 · 4ª Turma",
            desfecho: "Procedente",
            fundamento: "Inobservância das regras de descanso interjornada cumulada com banco de horas descaracterizado.",
          },
          {
            id: "bh-ba4-5",
            data: "10/02/2025",
            processo: "0000955-83.2022.5.05.0131",
            tribunalTurma: "TRT-5 · 4ª Turma",
            desfecho: "Parcial",
            fundamento: "Limitação da condenação ao adicional de horas extras nas horas efetivamente compensadas em folga.",
          },
        ],
      },
      {
        nome: "TRT1 (RJ) · 6ª Turma",
        taxa: "66,0%",
        classe: "text-amber-700",
        pos: "Acolhe compensação se houver ACT homologado; exige demonstrativo minucioso",
        risco: "Médio",
        statusGlcm: "ATIVO",
        ultimasDecisoes: [
          {
            id: "bh-rj6-1",
            data: "02/03/2026",
            processo: "0100360-54.2021.5.01.0033",
            tribunalTurma: "TRT-1 · 33ª VT Rio",
            desfecho: "Procedente",
            fundamento: "Trânsito em julgado declarando nulidade da quitação em ACT Transpetro/Petrobras e recálculo SRB.",
          },
          {
            id: "bh-rj6-2",
            data: "26/08/2026",
            processo: "0101440-81.2025.5.01.0043",
            tribunalTurma: "TRT-1 · 9ª Turma",
            desfecho: "Procedente",
            fundamento: "Caso Hélio Fernandes: provimento do recurso obreiro em Banco de Horas e contribuições Petros.",
          },
          {
            id: "bh-rj6-3",
            data: "14/02/2026",
            processo: "0100482-12.2022.5.01.0482",
            tribunalTurma: "TRT-1 · 2ª Turma Macaé",
            desfecho: "Procedente",
            fundamento: "Extrapolação de jornada em plataforma; condenação em reflexos e horas à disposição.",
          },
          {
            id: "bh-rj6-4",
            data: "11/12/2025",
            processo: "0100721-34.2023.5.01.0481",
            tribunalTurma: "TRT-1 · 6ª Turma",
            desfecho: "Parcial",
            fundamento: "Adicional de 50% deferido para horas compensadas fora do limite estipulado no ACT.",
          },
          {
            id: "bh-rj6-5",
            data: "19/06/2025",
            processo: "0100115-89.2022.5.01.0012",
            tribunalTurma: "TRT-1 · 6ª Turma",
            desfecho: "Improcedente",
            fundamento: "Ausência de apontamento específico de diferenças entre o saldo do banco e os contracheques.",
          },
        ],
      },
      {
        nome: "TRT2 (SP) · 8ª Turma",
        taxa: "73,4%",
        classe: "text-emerald-700",
        pos: "Súmula 85/TST aplicada com rigor contra a Petrobras",
        risco: "Baixo",
        statusGlcm: "MODERADO",
        ultimasDecisoes: [
          {
            id: "bh-sp8-1",
            data: "27/02/2026",
            processo: "1000412-55.2023.5.02.0441",
            tribunalTurma: "TRT-2 · 8ª Turma (Santos)",
            desfecho: "Procedente",
            fundamento: "Súmula 85 do TST: Prestação habitual de horas extras descaracteriza o acordo de compensação tácito.",
          },
          {
            id: "bh-sp8-2",
            data: "03/12/2025",
            processo: "1001089-40.2022.5.02.0443",
            tribunalTurma: "TRT-2 · 8ª Turma (Santos)",
            desfecho: "Procedente",
            fundamento: "Terminal de Santos: irregularidade nos fechamentos de banco de horas com reflexos deferidos.",
          },
          {
            id: "bh-sp8-3",
            data: "18/08/2025",
            processo: "1000722-19.2023.5.02.0251",
            tribunalTurma: "TRT-2 · 8ª Turma (Cubatão)",
            desfecho: "Parcial",
            fundamento: "Acolhida a prescrição quinquenal, mantida condenação ao adicional de horas extras residual.",
          },
          {
            id: "bh-sp8-4",
            data: "05/03/2025",
            processo: "1001450-80.2022.5.02.0442",
            tribunalTurma: "TRT-2 · 8ª Turma (Santos)",
            desfecho: "Procedente",
            fundamento: "Inobservância dos requisitos normativos para compensação; deferimento de reflexos na rescisão contratual.",
          },
          {
            id: "bh-sp8-5",
            data: "12/11/2024",
            processo: "1000318-72.2023.5.02.0252",
            tribunalTurma: "TRT-2 · 8ª Turma (Cubatão)",
            desfecho: "Improcedente",
            fundamento: "Comprovação de quitação regular e folgas compensatórias gozadas na vigência do ACT.",
          },
        ],
      },
      {
        nome: "TRT20 (SE) · Jurisdição Bloqueada",
        taxa: "10,0%",
        classe: "text-destructive font-bold",
        pos: "Jurisprudência hostil consolidada pró-ACT Petrobras (Tema 1046 STF). Diretriz GLCM: Não ajuizar.",
        risco: "Alto",
        statusGlcm: "BLOQUEADO",
        bloqueioMensagem:
          "Bloqueio Operacional: Em razão da virada jurisprudencial no TRT20 (validade irrestrita de ACT sob o Tema 1046 do STF), evidenciada pelas 4 improcedências consecutivas abaixo, a diretoria da GLCM determinou a suspensão definitiva de novas ações de banco de horas nesta praça. Foco direcionado ao TRT5 (Bahia) e TRT1 (Rio).",
        ultimasDecisoes: [
          {
            id: "bh-se-1",
            data: "12/03/2026",
            processo: "0000259-21.2024.5.20.0001",
            tribunalTurma: "TRT-20 · 1ª Turma",
            desfecho: "Improcedente",
            fundamento: "Tema 1046 STF: Validade do regime de compensação previsto em ACT Petrobras; mantida improcedência integral das horas extras.",
          },
          {
            id: "bh-se-2",
            data: "18/11/2025",
            processo: "0000415-09.2024.5.20.0002",
            tribunalTurma: "TRT-20 · 2ª Turma",
            desfecho: "Improcedente",
            fundamento: "Cláusula coletiva de compensação validada; ausência de prova pericial de vício formal no controle de ponto.",
          },
          {
            id: "bh-se-3",
            data: "04/09/2025",
            processo: "0000624-76.2023.5.20.0002",
            tribunalTurma: "TRT-20 · 1ª Turma",
            desfecho: "Improcedente",
            fundamento: "Inexistência de nulidade no acordo tácito ante o instrumento coletivo; recurso obreiro desprovido.",
          },
          {
            id: "bh-se-4",
            data: "28/05/2025",
            processo: "0000812-43.2022.5.20.0003",
            tribunalTurma: "TRT-20 · 2ª Turma",
            desfecho: "Improcedente",
            fundamento: "Sentença da VT de Carmópolis confirmada; quitação válida do saldo de horas mediante contracheques e ACT.",
          },
          {
            id: "bh-se-5",
            data: "14/11/2024",
            processo: "0000142-65.2023.5.20.0001",
            tribunalTurma: "TRT-20 · 1ª Turma",
            desfecho: "Parcial",
            fundamento: "Indeferidas horas extras integrais; deferidas apenas diferenças reflexas residuais incontroversas sobre RSR.",
          },
        ],
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
        statusGlcm: "PRIORITARIO",
        ultimasDecisoes: [
          {
            id: "cf-ba3-1",
            data: "18/02/2026",
            processo: "0000720-33.2024.5.05.0122",
            tribunalTurma: "TRT-5 · 3ª Turma",
            desfecho: "Procedente",
            fundamento: "Condenação da Petrobras ao pagamento em dobro dos dias de folga suprimidos por atraso no desembarque.",
          },
          {
            id: "cf-ba3-2",
            data: "10/12/2025",
            processo: "0000344-90.2023.5.05.0007",
            tribunalTurma: "TRT-5 · 3ª Turma",
            desfecho: "Procedente",
            fundamento: "Aplicação da NR-37 e Art. 7º, XXII da CF: indisponibilidade do direito ao repouso biológico do petroleiro.",
          },
          {
            id: "cf-ba3-3",
            data: "24/09/2025",
            processo: "0000918-12.2023.5.05.0028",
            tribunalTurma: "TRT-5 · 3ª Turma",
            desfecho: "Procedente",
            fundamento: "Dano Existencial cumulado arbitrado em R$ 40.000,00 ante o confinamento offshore por 21 dias contínuos.",
          },
          {
            id: "cf-ba3-4",
            data: "06/05/2025",
            processo: "0000512-44.2022.5.05.0161",
            tribunalTurma: "TRT-5 · 3ª Turma",
            desfecho: "Parcial",
            fundamento: "Dobra de folgas deferida com base nos relatórios de frequência de bordo da PBIO.",
          },
          {
            id: "cf-ba3-5",
            data: "15/01/2025",
            processo: "0000219-87.2023.5.05.0019",
            tribunalTurma: "TRT-5 · 3ª Turma",
            desfecho: "Procedente",
            fundamento: "Ineficácia de cláusula de ACT que estabelecia quitação genérica sem discriminar os dias embarcados.",
          },
        ],
      },
      {
        nome: "TRT1 (RJ) · 1ª Turma",
        taxa: "74,2%",
        classe: "text-emerald-700",
        pos: "Inaplicabilidade de ACT quando há extrapolação de 14 dias",
        risco: "Baixo",
        statusGlcm: "ATIVO",
        ultimasDecisoes: [
          {
            id: "cf-rj1-1",
            data: "14/02/2026",
            processo: "0100482-12.2022.5.01.0482",
            tribunalTurma: "TRT-1 · 2ª Turma (Macaé)",
            desfecho: "Procedente",
            fundamento: "Acórdão unânime condenando Petrobras à dobra de folgas e Dano Existencial por extrapolação contínua da escala.",
          },
          {
            id: "cf-rj1-2",
            data: "26/08/2026",
            processo: "0101440-81.2025.5.01.0043",
            tribunalTurma: "TRT-1 · 9ª Turma",
            desfecho: "Procedente",
            fundamento: "Caso Hélio Fernandes: condenação em reflexos e horas em heliponto anteriores ao embarque em Macaé.",
          },
          {
            id: "cf-rj1-3",
            data: "19/11/2025",
            processo: "0100890-41.2023.5.01.0483",
            tribunalTurma: "TRT-1 · 1ª Turma",
            desfecho: "Procedente",
            fundamento: "Atraso no desembarque decorrente de condições meteorológicas não afasta a obrigação de pagar a dobra das folgas.",
          },
          {
            id: "cf-rj1-4",
            data: "08/07/2025",
            processo: "0100315-77.2022.5.01.0481",
            tribunalTurma: "TRT-1 · 1ª Turma",
            desfecho: "Parcial",
            fundamento: "Pagamento simples dos dias acrescido do adicional de 100% de horas extraordinárias.",
          },
          {
            id: "cf-rj1-5",
            data: "12/03/2025",
            processo: "0100650-20.2023.5.01.0482",
            tribunalTurma: "TRT-1 · 1ª Turma",
            desfecho: "Improcedente",
            fundamento: "Petrobras comprovou concessão de folga compensatória em terra imediatamente após o desembarque com base no ACT.",
          },
        ],
      },
      {
        nome: "TRT2 (SP) · 4ª Turma",
        taxa: "62,1%",
        classe: "text-amber-700",
        pos: "Limita condenação apenas aos dias comprovados em escala",
        risco: "Médio",
        statusGlcm: "MODERADO",
        ultimasDecisoes: [
          {
            id: "cf-sp4-1",
            data: "15/01/2026",
            processo: "1000892-11.2023.5.02.0441",
            tribunalTurma: "TRT-2 · 4ª Turma (Santos)",
            desfecho: "Procedente",
            fundamento: "Extrapolação de turno de 12h em terminal marítimo da Transpetro com condenação em dobra de folgas.",
          },
          {
            id: "cf-sp4-2",
            data: "22/10/2025",
            processo: "1000418-33.2022.5.02.0444",
            tribunalTurma: "TRT-2 · 4ª Turma",
            desfecho: "Parcial",
            fundamento: "Limitação da condenação apenas aos dias com escala registrada de forma irregular nos espelhos de ponto.",
          },
          {
            id: "cf-sp4-3",
            data: "14/06/2025",
            processo: "1001205-70.2023.5.02.0253",
            tribunalTurma: "TRT-2 · 4ª Turma",
            desfecho: "Parcial",
            fundamento: "Deferido o adicional de 100% sem cumulação com dano moral autônomo.",
          },
          {
            id: "cf-sp4-4",
            data: "20/02/2025",
            processo: "1000550-92.2022.5.02.0443",
            tribunalTurma: "TRT-2 · 4ª Turma",
            desfecho: "Improcedente",
            fundamento: "Acolhida a validade do acordo coletivo quanto ao regime de folga flexível em terminal de Cubatão.",
          },
          {
            id: "cf-sp4-5",
            data: "18/10/2024",
            processo: "1000188-44.2023.5.02.0442",
            tribunalTurma: "TRT-2 · 4ª Turma",
            desfecho: "Procedente",
            fundamento: "Regime de 14x14 descumprido; pagamento de diferenças com reflexos em RSR e 13º salário.",
          },
        ],
      },
      {
        nome: "TRT20 (SE) · Jurisdição Bloqueada",
        taxa: "12,5%",
        classe: "text-destructive font-bold",
        pos: "Acolhimento de quitação ampla em ACT de escala offshore. Diretriz GLCM: Não ajuizar.",
        risco: "Alto",
        statusGlcm: "BLOQUEADO",
        bloqueioMensagem:
          "Bloqueio Operacional: Turma Única do TRT20 passou a validar a quitação geral de folgas em ACTs da Petrobras, gerando improcedências em série. Foco transferido integralmente para TRT5 (Bahia) e TRT1 (Rio).",
        ultimasDecisoes: [
          {
            id: "cf-se-1",
            data: "26/02/2026",
            processo: "0000318-40.2024.5.20.0001",
            tribunalTurma: "TRT-20 · Turma Única",
            desfecho: "Improcedente",
            fundamento: "Validade da cláusula de ACT que prevê quitação pecuniária de folgas suprimidas; aplicação do Tema 1046 STF.",
          },
          {
            id: "cf-se-2",
            data: "12/11/2025",
            processo: "0000522-81.2023.5.20.0002",
            tribunalTurma: "TRT-20 · Turma Única",
            desfecho: "Improcedente",
            fundamento: "Atraso no helicóptero compensado financeiramente em rubrica específica; pedido de dobra indeferido.",
          },
          {
            id: "cf-se-3",
            data: "19/08/2025",
            processo: "0000780-15.2023.5.20.0003",
            tribunalTurma: "TRT-20 · Turma Única",
            desfecho: "Improcedente",
            fundamento: "Indeferido dano existencial por ausência de prova de prejuízo direto às relações sociais do trabalhador.",
          },
          {
            id: "cf-se-4",
            data: "05/04/2025",
            processo: "0000190-62.2023.5.20.0001",
            tribunalTurma: "TRT-20 · Turma Única",
            desfecho: "Improcedente",
            fundamento: "Sentença mantida por seus próprios fundamentos; improcedência de dobra de folgas offshore.",
          },
          {
            id: "cf-se-5",
            data: "28/11/2024",
            processo: "0000640-90.2022.5.20.0002",
            tribunalTurma: "TRT-20 · Turma Única",
            desfecho: "Parcial",
            fundamento: "Condenação restrita a 2 dias isolados de extrapolação sem pagamento em contracheque.",
          },
        ],
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
        statusGlcm: "PRIORITARIO",
        ultimasDecisoes: [
          {
            id: "pp-ba1-1",
            data: "18/12/2025",
            processo: "0000412-88.2023.5.05.0014",
            tribunalTurma: "TRT-5 · 1ª Turma",
            desfecho: "Procedente",
            fundamento: "Tutela de urgência confirmada para limitar o desconto do equacionamento PED ao teto de 10% da folha de proventos.",
          },
          {
            id: "pp-ba1-2",
            data: "05/11/2025",
            processo: "0000819-50.2023.5.05.0009",
            tribunalTurma: "TRT-5 · 1ª Turma",
            desfecho: "Procedente",
            fundamento: "Violação da paridade estrita de custeio entre patrocinadora Petrobras e participantes assistidos (LC 108/2001).",
          },
          {
            id: "pp-ba1-3",
            data: "14/08/2025",
            processo: "0000305-12.2022.5.05.0022",
            tribunalTurma: "TRT-5 · 1ª Turma",
            desfecho: "Parcial",
            fundamento: "Suspensão temporária da cobrança extraordinária condicionada a depósito em juízo da fração controvertida.",
          },
          {
            id: "pp-ba1-4",
            data: "20/03/2025",
            processo: "0000670-34.2023.5.05.0011",
            tribunalTurma: "TRT-5 · 1ª Turma",
            desfecho: "Procedente",
            fundamento: "Competência material da Justiça do Trabalho reconhecida por se tratar de obrigação derivada do contrato de trabalho.",
          },
          {
            id: "pp-ba1-5",
            data: "10/12/2024",
            processo: "0000155-70.2022.5.05.0035",
            tribunalTurma: "TRT-5 · 1ª Turma",
            desfecho: "Improcedente",
            fundamento: "Extinção sem resolução do mérito por ausência de documento essencial comprovando a repactuação do plano.",
          },
        ],
      },
      {
        nome: "TRT1 (RJ) · 5ª Turma",
        taxa: "54,0%",
        classe: "text-amber-700",
        pos: "Divergência entre competência trabalhista e cível comum",
        risco: "Alto",
        statusGlcm: "MODERADO",
        ultimasDecisoes: [
          {
            id: "pp-rj5-1",
            data: "20/01/2026",
            processo: "0100812-30.2023.5.01.0025",
            tribunalTurma: "TRT-1 · 5ª Turma",
            desfecho: "Procedente",
            fundamento: "Liminar deferida para redução da alíquota extraordinária do PPSP sobre os proventos de aposentadoria.",
          },
          {
            id: "pp-rj5-2",
            data: "14/10/2025",
            processo: "0100519-70.2022.5.01.0018",
            tribunalTurma: "TRT-1 · 5ª Turma",
            desfecho: "Parcial",
            fundamento: "Limitação dos descontos a 15% sobre o salário líquido até julgamento definitivo de mérito atuarial.",
          },
          {
            id: "pp-rj5-3",
            data: "29/05/2025",
            processo: "0100234-88.2023.5.01.0004",
            tribunalTurma: "TRT-1 · 5ª Turma",
            desfecho: "Improcedente",
            fundamento: "Declinação de competência em favor da Justiça Comum Estadual (Tema 190 do STF).",
          },
          {
            id: "pp-rj5-4",
            data: "11/02/2025",
            processo: "0100910-14.2022.5.01.0041",
            tribunalTurma: "TRT-1 · 5ª Turma",
            desfecho: "Procedente",
            fundamento: "Solidariedade passiva da Petrobras mantida ante o dever contratual de cobrir os déficits decorrentes de acordos.",
          },
          {
            id: "pp-rj5-5",
            data: "05/09/2024",
            processo: "0100445-66.2022.5.01.0039",
            tribunalTurma: "TRT-1 · 5ª Turma",
            desfecho: "Improcedente",
            fundamento: "Legalidade da cobrança extraordinária autorizada pela PREVIC para solvência dos planos Petros.",
          },
        ],
      },
      {
        nome: "TRT2 (SP) · 2ª Turma",
        taxa: "61,0%",
        classe: "text-amber-700",
        pos: "Exige comprovação da violação da paridade de custeio",
        risco: "Médio",
        statusGlcm: "MODERADO",
        ultimasDecisoes: [
          {
            id: "pp-sp2-1",
            data: "10/02/2026",
            processo: "1000620-15.2023.5.02.0441",
            tribunalTurma: "TRT-2 · 2ª Turma (Santos)",
            desfecho: "Procedente",
            fundamento: "Comprovação de desproporção atuarial no plano repactuado; suspensão de descontos excessivos.",
          },
          {
            id: "pp-sp2-2",
            data: "18/11/2025",
            processo: "1001150-88.2022.5.02.0251",
            tribunalTurma: "TRT-2 · 2ª Turma",
            desfecho: "Procedente",
            fundamento: "Tutela antecipada recursal para impedir superendividamento do participante aposentado.",
          },
          {
            id: "pp-sp2-3",
            data: "04/06/2025",
            processo: "1000418-50.2023.5.02.0442",
            tribunalTurma: "TRT-2 · 2ª Turma",
            desfecho: "Parcial",
            fundamento: "Limitação da responsabilidade da Petros e Petrobras ao teto regulamentar do plano.",
          },
          {
            id: "pp-sp2-4",
            data: "12/03/2025",
            processo: "1000890-70.2022.5.02.0444",
            tribunalTurma: "TRT-2 · 2ª Turma",
            desfecho: "Improcedente",
            fundamento: "Perícia atuarial concluiu pela higidez formal da aprovação do plano de equacionamento.",
          },
          {
            id: "pp-sp2-5",
            data: "20/10/2024",
            processo: "1000205-33.2023.5.02.0253",
            tribunalTurma: "TRT-2 · 2ª Turma",
            desfecho: "Procedente",
            fundamento: "Reconhecida a natureza alimentar da suplementação de aposentadoria; desconto limitado.",
          },
        ],
      },
      {
        nome: "TRT20 (SE) · 2ª Turma",
        taxa: "68,4%",
        classe: "text-emerald-700",
        pos: "Liminar para suspensão de desconto sobre verba alimentar",
        risco: "Médio",
        statusGlcm: "ATIVO",
        ultimasDecisoes: [
          {
            id: "pp-se2-1",
            data: "05/03/2026",
            processo: "0000188-70.2024.5.20.0001",
            tribunalTurma: "TRT-20 · 2ª Turma",
            desfecho: "Procedente",
            fundamento: "Concessão de tutela inibitória limitando os descontos de equacionamento a 10% do líquido na FAFEN.",
          },
          {
            id: "pp-se2-2",
            data: "14/11/2025",
            processo: "0000450-22.2023.5.20.0002",
            tribunalTurma: "TRT-20 · 2ª Turma",
            desfecho: "Procedente",
            fundamento: "Obrigação da patrocinadora Petrobras de aportar paridade financeira imediata no fundo de pensão.",
          },
          {
            id: "pp-se2-3",
            data: "22/07/2025",
            processo: "0000712-80.2022.5.20.0003",
            tribunalTurma: "TRT-20 · 2ª Turma",
            desfecho: "Parcial",
            fundamento: "Suspensão temporária do desconto extraordinário mantido apenas o custeio ordinário de Petros.",
          },
          {
            id: "pp-se2-4",
            data: "15/02/2025",
            processo: "0000305-60.2023.5.20.0001",
            tribunalTurma: "TRT-20 · 2ª Turma",
            desfecho: "Improcedente",
            fundamento: "Falta de comprovação de adesão ao plano Petros não-repactuado; recurso improvido.",
          },
          {
            id: "pp-se2-5",
            data: "18/09/2024",
            processo: "0000590-44.2022.5.20.0002",
            tribunalTurma: "TRT-20 · 2ª Turma",
            desfecho: "Procedente",
            fundamento: "Tutela de urgência confirmada para afastar risco de superendividamento de assistido idoso.",
          },
        ],
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
        statusGlcm: "PRIORITARIO",
        ultimasDecisoes: [
          {
            id: "hra-trf1-1",
            data: "10/02/2026",
            processo: "1028471-55.2024.4.01.3300",
            tribunalTurma: "TRF-1 · Turma Recursal da Bahia",
            desfecho: "Procedente",
            fundamento: "Tema 306 STJ: Natureza indenizatória da hora de repouso e alimentação (HRA); restituição integral do IRRF.",
          },
          {
            id: "hra-trf1-2",
            data: "18/11/2025",
            processo: "1019230-40.2023.4.01.3300",
            tribunalTurma: "TRF-1 · 15ª Vara Federal de Salvador",
            desfecho: "Procedente",
            fundamento: "Condenação da União à repetição do indébito tributário dos últimos 5 anos atualizados pela Taxa SELIC.",
          },
          {
            id: "hra-trf1-3",
            data: "04/08/2025",
            processo: "1008115-72.2023.4.01.3304",
            tribunalTurma: "TRF-1 · Vara Federal de Feira de Santana",
            desfecho: "Procedente",
            fundamento: "Inaplicabilidade de incidência de imposto sobre ressarcimento alimentar pago aos petroleiros em turno.",
          },
          {
            id: "hra-trf1-4",
            data: "15/03/2025",
            processo: "1034105-80.2022.4.01.3300",
            tribunalTurma: "TRF-1 · Turma Recursal da Bahia",
            desfecho: "Procedente",
            fundamento: "Trânsito em julgado e expedição de Requisição de Pequeno Valor (RPV) em favor do autor.",
          },
          {
            id: "hra-trf1-5",
            data: "12/10/2024",
            processo: "1015670-22.2023.4.01.3300",
            tribunalTurma: "TRF-1 · 2ª Vara Federal de Salvador",
            desfecho: "Parcial",
            fundamento: "Acolhimento da prescrição quinquenal, mantida a procedência dos últimos 60 meses retroativos.",
          },
        ],
      },
      {
        nome: "TRF2 · Juizados Federais Rio",
        taxa: "89,5%",
        classe: "text-emerald-700",
        pos: "Restituição integral dos últimos 5 anos respeitada",
        risco: "Mínimo",
        statusGlcm: "PRIORITARIO",
        ultimasDecisoes: [
          {
            id: "hra-trf2-1",
            data: "24/01/2026",
            processo: "5008120-44.2023.4.02.5101",
            tribunalTurma: "TRF-2 · 3ª Turma Recursal do Rio",
            desfecho: "Procedente",
            fundamento: "Indébito tributário reconhecido com determinação de devolução dos valores retidos de petroleiro embarcado.",
          },
          {
            id: "hra-trf2-2",
            data: "05/11/2025",
            processo: "5014300-80.2023.4.02.5106",
            tribunalTurma: "TRF-2 · Vara Federal de Macaé",
            desfecho: "Procedente",
            fundamento: "HRA na Bacia de Campos: não caracterização de acréscimo patrimonial; Súmula 125 do STJ.",
          },
          {
            id: "hra-trf2-3",
            data: "18/06/2025",
            processo: "5002190-15.2022.4.02.5101",
            tribunalTurma: "TRF-2 · 1ª Turma Recursal",
            desfecho: "Procedente",
            fundamento: "Condenação da Fazenda Nacional ao ressarcimento das parcelas retidas nos contracheques de Transpetro.",
          },
          {
            id: "hra-trf2-4",
            data: "22/02/2025",
            processo: "5009450-70.2022.4.02.5106",
            tribunalTurma: "TRF-2 · Vara Federal de Macaé",
            desfecho: "Procedente",
            fundamento: "Correção monetária estrita pela Taxa SELIC a partir de cada retenção mensal indevida.",
          },
          {
            id: "hra-trf2-5",
            data: "19/09/2024",
            processo: "5003310-90.2023.4.02.5101",
            tribunalTurma: "TRF-2 · 2ª Turma Recursal",
            desfecho: "Parcial",
            fundamento: "Procedência do pedido com exclusão apenas de competências não documentadas na DIRPF juntada.",
          },
        ],
      },
      {
        nome: "TRF3 · Varas e Turmas SP",
        taxa: "87,2%",
        classe: "text-emerald-700",
        pos: "Precedente sumulado no STJ acolhido em bloco",
        risco: "Mínimo",
        statusGlcm: "ATIVO",
        ultimasDecisoes: [
          {
            id: "hra-trf3-1",
            data: "15/02/2026",
            processo: "5001240-33.2023.4.03.6104",
            tribunalTurma: "TRF-3 · Juizado Federal de Santos",
            desfecho: "Procedente",
            fundamento: "Verba HRA sem natureza de contraprestação ao trabalho; isenção de IRPF plenamente acolhida.",
          },
          {
            id: "hra-trf3-2",
            data: "28/10/2025",
            processo: "5004180-77.2022.4.03.6100",
            tribunalTurma: "TRF-3 · Turma Recursal de SP",
            desfecho: "Procedente",
            fundamento: "Aplicação consolidada da jurisprudência do STJ em favor de trabalhadores de refinarias em SP.",
          },
          {
            id: "hra-trf3-3",
            data: "10/05/2025",
            processo: "5000890-50.2023.4.03.6104",
            tribunalTurma: "TRF-3 · Juizado Federal de Santos",
            desfecho: "Procedente",
            fundamento: "Devolução de valores com expedição de precatório/RPV contra a União Federal.",
          },
          {
            id: "hra-trf3-4",
            data: "14/01/2025",
            processo: "5002305-18.2022.4.03.6100",
            tribunalTurma: "TRF-3 · Turma Recursal de SP",
            desfecho: "Procedente",
            fundamento: "Afastamento de tributação incidente sobre intervalo de repouso suprimido convertido em indenização.",
          },
          {
            id: "hra-trf3-5",
            data: "05/11/2024",
            processo: "5001920-80.2023.4.03.6104",
            tribunalTurma: "TRF-3 · Juizado Federal de Santos",
            desfecho: "Parcial",
            fundamento: "Procedência limitada ao período em que comprovada a retenção da rubrica específica nos contracheques.",
          },
        ],
      },
      {
        nome: "TRF5 · Turma Recursal SE/AL",
        taxa: "93,4%",
        classe: "text-emerald-700",
        pos: "Deferimento célere com execução direta via RPV",
        risco: "Mínimo",
        statusGlcm: "PRIORITARIO",
        ultimasDecisoes: [
          {
            id: "hra-trf5-1",
            data: "04/03/2026",
            processo: "0801240-50.2024.4.05.8500",
            tribunalTurma: "TRF-5 · Turma Recursal de Sergipe",
            desfecho: "Procedente",
            fundamento: "TRF da 5ª Região reconhece natureza indenizatória do HRA de petroleiros da FAFEN/Sergipe; RPV deferida.",
          },
          {
            id: "hra-trf5-2",
            data: "19/11/2025",
            processo: "0803510-12.2023.4.05.8500",
            tribunalTurma: "TRF-5 · 2ª Vara Federal de Aracaju",
            desfecho: "Procedente",
            fundamento: "Condenação da União Federal à repetição integral dos 5 anos retroativos de IRRF retido indevidamente.",
          },
          {
            id: "hra-trf5-3",
            data: "25/06/2025",
            processo: "0800890-33.2023.4.05.8500",
            tribunalTurma: "TRF-5 · Turma Recursal de Sergipe",
            desfecho: "Procedente",
            fundamento: "Súmula da Turma Recursal reafirmando a não tributação da hora de alimentação não usufruída.",
          },
          {
            id: "hra-trf5-4",
            data: "14/02/2025",
            processo: "0802115-80.2022.4.05.8500",
            tribunalTurma: "TRF-5 · 3ª Vara Federal de Aracaju",
            desfecho: "Procedente",
            fundamento: "Execução concluída com pagamento tempestivo de Requisição de Pequeno Valor em favor do trabalhador.",
          },
          {
            id: "hra-trf5-5",
            data: "28/09/2024",
            processo: "0801750-60.2023.4.05.8500",
            tribunalTurma: "TRF-5 · Turma Recursal de Sergipe",
            desfecho: "Procedente",
            fundamento: "Honorários advocatícios e juros moratórios calculados estritamente na forma do manual de cálculos da JF.",
          },
        ],
      },
    ],
    paradigma:
      '"O pagamento da hora de repouso e alimentação (HRA) suprimida ostenta natureza eminentemente indenizatória, visando a reparar o desgaste biológico do trabalhador, sendo descabida a incidência do Imposto de Renda Retido na Fonte (Súmula 125 do STJ e jurisprudência vinculante da TNU)."',
    decisao: {
      data: "10/02/2026",
      processo: "1028471-55.2024.4.01.3300",
      orgao: "TRF-1 · Juizado Especial Federal Cível da Bahia (Salvador)",
      reu: "União Federal (Fazenda Nacional)",
      teor: "Sentença com trânsito em julgado julgando totalmente procedente o pedido de repetição de indébito de IRPF sobre a rubrica 1004 (HRA), determinando a expedição de RPV para restituição dos valores indevidamente descontados nos últimos 60 meses, acrescidos de SELIC.",
      extra:
        "Cruzamento com Folha: R$ 33,26 milhões descontados sob a rubrica 5500 (IR Retido) sobre base HRA na carteira, com 820 petroleiros ativos elegíveis.",
    },
  },
};

const RESUMO_DATALAKE_V2 = [
  {
    titulo: "Base Geral Integrada",
    tag: "Total Geral",
    tagClass: "border-primary/20 bg-primary/10 text-primary",
    pessoas: "1.252 pessoas",
    valor: "104.285 contracheques",
    valorClass: "text-primary",
    historico: "Período: 2021 a 2026 (5 anos completos)",
  },
  {
    titulo: "Volume Financeiro Bruto",
    tag: "Folha Total",
    tagClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    pessoas: "Proventos:",
    valor: "R$ 2,31 bilhões",
    valorClass: "text-emerald-700",
    historico: "Descontos acumulados: R$ 1,56 bilhão",
  },
  {
    titulo: "Banco de Horas (1513)",
    tag: "Horas Extras",
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
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 text-[11px] font-semibold">
        Risco {risco}
      </Badge>
    );
  }
  if (risco === "Médio") {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 text-[11px] font-semibold">
        Risco {risco}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[11px] font-semibold">
      Risco {risco}
    </Badge>
  );
}

export default function ValidacaoRadar() {
  const [temaAtivo, setTemaAtivo] = useState<TemaChave>("banco_horas");
  const [turmaSelecionadaNome, setTurmaSelecionadaNome] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const tema = DADOS_TEMAS[temaAtivo];
  const turmaAtiva = tema.turmas.find((t) => t.nome === turmaSelecionadaNome) || tema.turmas[0];

  const handleMudarTema = (novaChave: TemaChave) => {
    setTemaAtivo(novaChave);
    setTurmaSelecionadaNome(null);
  };

  const handleCopiarProcesso = (processo: string, id: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(processo);
    }
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 2000);
  };

  const pieData = [
    { name: "Procedência", value: tema.procedencia, color: "#059669" },
    { name: "Parcial", value: tema.parcial, color: "#d97706" },
    { name: "Improcedência", value: tema.improcedencia, color: "#dc2626" },
  ];

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader />

      <main className="container max-w-7xl py-8 space-y-6">
        {/* CABEÇALHO DA PÁGINA */}
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
            <Button variant="outline" size="sm" asChild className="h-9 text-xs gap-1.5 bg-background">
              <Link to="/ValidacaoTeses">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Validação Teses (8 Teses)
              </Link>
            </Button>
            <div className="inline-flex shrink-0 rounded-lg border bg-muted p-1">
              <a
                href="#casos-reais"
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                Casos Reais
              </a>
              <a
                href="#simulador"
                className="rounded-md px-3 py-1.5 text-xs font-semibold bg-card text-foreground shadow-sm"
              >
                Simulador
              </a>
              <a
                href="#datalake-v2"
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                Datalake 2.0
              </a>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="h-9 text-xs gap-1.5 bg-card shadow-sm"
            >
              <Printer className="h-3.5 w-3.5 text-muted-foreground" />
              Imprimir
            </Button>
          </div>
        </div>

        {/* 4 CARDS RESUMO DO RADAR */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Casos Piloto Auditados</span>
                <Landmark className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-foreground">2 Processos PJe</div>
              <p className="mt-1 text-xs text-muted-foreground">Candeias (TRT5) e Rio de Janeiro (TRT1)</p>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between text-xs font-medium text-emerald-800">
                <span>Incremento Forense Mapeado</span>
                <TrendingUp className="h-4 w-4 text-emerald-700" />
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-emerald-950 font-mono">+182% a +192%</div>
              <p className="mt-1 text-xs text-emerald-800">R$ 122,1k ajuizado vs. R$ 344,3k direito apurado</p>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Jurisdições Rastreadas</span>
                <Building2 className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-foreground">4 TRTs + TST</div>
              <p className="mt-1 text-xs text-muted-foreground">TRT5 (BA), TRT1 (RJ), TRT2 (SP), TRT20 (SE)</p>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Datalake 2.0 Reconciliado</span>
                <Database className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-foreground font-mono">104.285</div>
              <p className="mt-1 text-xs text-muted-foreground">Contracheques limpos sem duplicação</p>
            </CardContent>
          </Card>
        </div>

        {/* SEÇÃO 1: CASOS AUDITADOS PJE */}
        <section id="casos-reais" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-4 pt-5 border-b">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary text-xs font-bold">
                      1
                    </span>
                    Casos Piloto: O Que a GLCM Ajuizou vs. O Que os Tribunais Deferem
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Confronto direto entre os laudos de liquidação do PJe e os precedentes dos tribunais regionais
                  </p>
                </div>
                <Badge variant="outline" className="text-xs font-medium self-start md:self-auto">
                  Auditoria de Iniciais
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* CASO JORGE GOIS */}
                <Card className="border shadow-none bg-card flex flex-col justify-between">
                  <div>
                    <div className="border-b bg-muted/20 px-4 py-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[11px] font-semibold">
                            Tema 1 · Banco de Horas
                          </Badge>
                          <span className="text-[11px] font-mono text-muted-foreground">TRT5 (Candeias)</span>
                        </div>
                        <h3 className="font-bold text-foreground text-sm mt-1">Jorge Luis de Oliveira Gois</h3>
                      </div>
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-semibold">
                        Ação Ativa
                      </Badge>
                    </div>

                    <div className="p-4 space-y-3 text-xs">
                      <div className="flex items-center justify-between text-muted-foreground border-b pb-2">
                        <span>Processo PJe:</span>
                        <strong className="font-mono text-primary">0000970-88.2025.5.05.0121</strong>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground border-b pb-2">
                        <span>Parte Ré:</span>
                        <span className="font-medium text-foreground">PBIO / Petrobras Biocombustível</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground border-b pb-2">
                        <span>Base de Horas Extras Paga:</span>
                        <span className="font-mono font-medium text-foreground">R$ 82.405,32 (1513 / 6050)</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="rounded-md border bg-muted/30 p-3">
                          <span className="text-[11px] font-medium text-muted-foreground block">
                            Liquidado na Inicial
                          </span>
                          <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                            R$ 60.762,09
                          </span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">
                            Apenas reflexos residuais
                          </span>
                        </div>
                        <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
                          <span className="text-[11px] font-medium text-emerald-800 block">
                            Potencial Integral
                          </span>
                          <span className="text-base font-bold font-mono text-emerald-950 mt-0.5 block">
                            R$ 165.400,00
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-700 mt-0.5 block">
                            +R$ 104,6k (+172%)
                          </span>
                        </div>
                      </div>

                      <div className="rounded-md border bg-muted/20 p-3 space-y-1 text-[11px]">
                        <span className="font-semibold text-foreground block">Oportunidades de Aditamento:</span>
                        <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                          <li>Nulidade do acordo de compensação tácito (Súmula 85, IV do TST);</li>
                          <li>Reflexos na Multa de 40% do FGTS (demissão voluntária / PIDV);</li>
                          <li>Retificação atuarial definitiva no benefício da Fundação Petros.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* CASO HELIO FONTE */}
                <Card className="border shadow-none bg-card flex flex-col justify-between">
                  <div>
                    <div className="border-b bg-muted/20 px-4 py-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[11px] font-semibold">
                            Tema 2 · Confinamento
                          </Badge>
                          <span className="text-[11px] font-mono text-muted-foreground">TRT1 (Rio)</span>
                        </div>
                        <h3 className="font-bold text-foreground text-sm mt-1">Hélio Fernandes Dias Fonte</h3>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-semibold">
                        Acórdão Favorável
                      </Badge>
                    </div>

                    <div className="p-4 space-y-3 text-xs">
                      <div className="flex items-center justify-between text-muted-foreground border-b pb-2">
                        <span>Processo PJe:</span>
                        <strong className="font-mono text-primary">0101440-81.2025.5.01.0043</strong>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground border-b pb-2">
                        <span>Parte Ré:</span>
                        <span className="font-medium text-foreground">Petróleo Brasileiro S.A. – PETROBRAS</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground border-b pb-2">
                        <span>Objeto da Ação:</span>
                        <span className="font-medium text-foreground">Supressão de Folgas (Lei 5.811/72)</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="rounded-md border bg-muted/30 p-3">
                          <span className="text-[11px] font-medium text-muted-foreground block">
                            Liquidado na Inicial
                          </span>
                          <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                            R$ 61.364,87
                          </span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">
                            Folgas patrimoniais simples
                          </span>
                        </div>
                        <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
                          <span className="text-[11px] font-medium text-emerald-800 block">
                            Potencial Integral
                          </span>
                          <span className="text-base font-bold font-mono text-emerald-950 mt-0.5 block">
                            R$ 178.900,00
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-700 mt-0.5 block">
                            +R$ 117,5k (+192%)
                          </span>
                        </div>
                      </div>

                      <div className="rounded-md border bg-muted/20 p-3 space-y-1 text-[11px]">
                        <span className="font-semibold text-foreground block">Oportunidades de Aditamento:</span>
                        <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                          <li>Cumulação autônoma de Dano Moral Existencial (+R$ 40k a R$ 60k);</li>
                          <li>Horas de apresentação prévia e espera em aeroporto/heliponto (Art. 4º CLT);</li>
                          <li>Integração reflexa no Salário Real de Benefício (SRB) na Petros.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* SEÇÃO 2: PONTOS CEGOS COMPETITIVOS */}
        <section className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-4 pt-5 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary text-xs font-bold">
                      2
                    </span>
                    Pontos Cegos Competitivos: Pedidos Vencedores nos Tribunais Omitidos nas Iniciais
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Comparativo extraído de petições iniciais e acórdãos recentes em Macaé (TRT1), Santos (TRT2), Sergipe (TRT20) e Salvador (TRT5).
                  </p>
                </div>
                <Badge variant="outline" className="text-xs font-medium self-start sm:self-auto">
                  3 Oportunidades Mapeadas
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {PONTOS_CEGOS.map((item) => (
                  <Card key={item.titulo} className="border shadow-none bg-card flex flex-col justify-between">
                    <CardHeader className="pb-3 pt-4 border-b bg-muted/10">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className={`text-[10px] font-bold ${item.badgeClass}`}>
                          {item.badge}
                        </Badge>
                        <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          {item.ganho}
                        </span>
                      </div>
                      <CardTitle className="text-sm font-bold text-foreground mt-2">{item.titulo}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3 text-xs flex-1 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                            Como a GLCM Pede Hoje:
                          </span>
                          <p className="text-muted-foreground mt-0.5 leading-relaxed">{item.atual}</p>
                        </div>
                        <div className="pt-2 border-t">
                          <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                            Como os Escritórios Vencedores Pedem:
                          </span>
                          <p className="text-foreground font-medium mt-0.5 leading-relaxed">{item.vencedor}</p>
                        </div>
                      </div>
                      <div className="pt-3 border-t flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">{item.rodapeLabel}</span>
                        <strong className="text-primary font-semibold">{item.rodapeValor}</strong>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* SEÇÃO 3: SIMULADOR ESTRATÉGICO & DISPOSIÇÃO JURISPRUDENCIAL */}
        <section id="simulador" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-4 pt-5 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary text-xs font-bold">
                      3
                    </span>
                    Simulador Estratégico: Matriz de Êxito por Tema e Jurisdição
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Selecione o tema para recalibrar as turmas regionais e inspecionar os 5 últimos julgados comprobatórios
                  </p>
                </div>

                <div className="inline-flex rounded-lg border bg-muted p-1 gap-1 flex-wrap">
                  {(Object.keys(DADOS_TEMAS) as TemaChave[]).map((chave) => {
                    const t = DADOS_TEMAS[chave];
                    const ativo = temaAtivo === chave;
                    return (
                      <Button
                        key={chave}
                        variant={ativo ? "default" : "ghost"}
                        size="sm"
                        onClick={() => handleMudarTema(chave)}
                        className={`h-8 text-xs font-semibold ${
                          ativo ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="shadow-sm flex flex-col justify-between">
              <CardHeader className="border-b bg-muted/20 pb-4 pt-5">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="border-primary/20 bg-primary/10 text-primary text-[11px] font-semibold">
                    {tema.tag}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">TRT5 · TRT1 · TRT2 · TRT20</span>
                </div>
                <h3 className="text-lg font-bold text-foreground mt-3">{tema.titulo}</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{tema.descricao}</p>
              </CardHeader>

              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Distribuição Média de Julgados
                  </span>
                  <span className="text-xs font-bold text-emerald-700 font-mono">
                    {tema.procedencia}% Procedência
                  </span>
                </div>

                <div className="h-44 w-full flex items-center justify-center">
                  <PieChart width={220} height={170}>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry) => (
                        <Cell key={`cell-${entry.name}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => [`${v.toFixed(1)}%`, "Proporção"]}
                      contentStyle={{ backgroundColor: "#ffffff", borderRadius: "6px", fontSize: "11px" }}
                    />
                  </PieChart>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs border-t pt-3">
                  <div className="rounded border bg-emerald-50/50 p-2">
                    <span className="text-[10px] text-emerald-800 font-medium block">Procedente</span>
                    <strong className="text-emerald-950 font-mono text-sm">{tema.procedencia}%</strong>
                  </div>
                  <div className="rounded border bg-amber-50/50 p-2">
                    <span className="text-[10px] text-amber-800 font-medium block">Parcial</span>
                    <strong className="text-amber-950 font-mono text-sm">{tema.parcial}%</strong>
                  </div>
                  <div className="rounded border bg-red-50/50 p-2">
                    <span className="text-[10px] text-red-800 font-medium block">Improcedente</span>
                    <strong className="text-red-950 font-mono text-sm">{tema.improcedencia}%</strong>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
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
                    <p className="text-xs text-muted-foreground">Clique em qualquer tribunal para inspecionar os 5 últimos julgados comprobatórios</p>
                  </div>
                  <span className="rounded border bg-secondary px-2.5 py-0.5 text-[11px] font-mono font-medium text-secondary-foreground">
                    Evidências Auditáveis
                  </span>
                </div>

                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs font-semibold">Órgão Julgador</TableHead>
                      <TableHead className="text-xs font-semibold">Taxa de Êxito</TableHead>
                      <TableHead className="text-xs font-semibold">Posicionamento Dominante</TableHead>
                      <TableHead className="text-xs font-semibold">Risco</TableHead>
                      <TableHead className="text-right text-xs font-semibold">Evidências</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tema.turmas.map((t) => {
                      const isAtiva = turmaAtiva.nome === t.nome;
                      return (
                        <TableRow
                          key={t.nome}
                          onClick={() => setTurmaSelecionadaNome(t.nome)}
                          className={`cursor-pointer transition-colors ${
                            isAtiva ? "bg-primary/5 font-medium border-l-2 border-l-primary" : "hover:bg-muted/40"
                          }`}
                        >
                          <TableCell className="font-medium text-foreground">
                            <div className="flex items-center gap-1.5">
                              {t.statusGlcm === "BLOQUEADO" ? (
                                <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0" />
                              ) : t.statusGlcm === "PRIORITARIO" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              ) : null}
                              <span>{t.nome}</span>
                            </div>
                          </TableCell>
                          <TableCell className={`font-mono font-bold ${t.classe}`}>{t.taxa}</TableCell>
                          <TableCell className="text-muted-foreground">{t.pos}</TableCell>
                          <TableCell>
                            <RiscoBadge risco={t.risco} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant={isAtiva ? "default" : "outline"}
                              size="sm"
                              className="h-7 text-[11px] px-2.5 gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTurmaSelecionadaNome(t.nome);
                              }}
                            >
                              <FileText className="h-3 w-3" />
                              <span>{isAtiva ? "Vendo 5" : "5 Julgados"}</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* PAINEL DE EVIDÊNCIAS DOCUMENTAIS (5 ÚLTIMOS JULGADOS) */}
              <div className="border-t bg-muted/15 p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-2 w-2 rounded-full bg-primary" />
                      <h5 className="text-xs font-bold text-foreground uppercase tracking-wide">
                        Evidências Documentais — 5 Últimos Julgados Analisados em {turmaAtiva.nome}
                      </h5>
                      {turmaAtiva.statusGlcm === "BLOQUEADO" ? (
                        <Badge variant="destructive" className="text-[10px] font-bold">
                          🔴 JURISDIÇÃO BLOQUEADA (NÃO AJUIZAR)
                        </Badge>
                      ) : turmaAtiva.statusGlcm === "PRIORITARIO" ? (
                        <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                          🟢 PRIORITÁRIO PARA AJUIZAMENTO
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] font-semibold">
                          Acórdãos DEJT com Data e Processo
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Base de acórdãos recentes demonstrando o lastro probatório da taxa calculada de {turmaAtiva.taxa}.
                    </p>
                  </div>
                </div>

                {turmaAtiva.bloqueioMensagem && (
                  <div className="rounded-md border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-900 flex items-start gap-2.5 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="leading-relaxed text-red-900 dark:text-red-200">
                      <strong className="font-bold text-red-950 dark:text-red-100">
                        Diretriz Estratégica da Diretoria GLCM:
                      </strong>{" "}
                      <span>{turmaAtiva.bloqueioMensagem}</span>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto rounded-md border bg-card">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="w-24 text-[11px] font-semibold">Data DEJT</TableHead>
                        <TableHead className="w-56 text-[11px] font-semibold">Processo (CNJ)</TableHead>
                        <TableHead className="w-28 text-[11px] font-semibold">Desfecho</TableHead>
                        <TableHead className="w-40 text-[11px] font-semibold">Órgão Julgador</TableHead>
                        <TableHead className="text-[11px] font-semibold">Tese &amp; Fundamento Jurídico</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {turmaAtiva.ultimasDecisoes.map((dec) => (
                        <TableRow key={dec.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono font-medium text-foreground text-[11px] whitespace-nowrap">
                            {dec.data}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] font-semibold text-primary whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span>{dec.processo}</span>
                              <button
                                type="button"
                                title="Copiar número do processo"
                                onClick={() => handleCopiarProcesso(dec.processo, dec.id)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                              >
                                {copiadoId === dec.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </TableCell>
                          <TableCell>
                            {dec.desfecho === "Procedente" ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-semibold">
                                Procedente
                              </Badge>
                            ) : dec.desfecho === "Parcial" ? (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-semibold">
                                Parcial
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px] font-semibold">
                                Improcedente
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-[11px] whitespace-nowrap">
                            {dec.tribunalTurma}
                          </TableCell>
                          <TableCell className="text-slate-700 leading-relaxed text-[11px]">
                            {dec.fundamento}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
                        <span className="text-muted-foreground">Juízo / Órgão:</span>{" "}
                        <strong>{tema.decisao.orgao}</strong>
                      </span>
                      <span className="text-muted-foreground">&bull;</span>
                      <span>
                        <span className="text-muted-foreground">Parte Ré:</span>{" "}
                        <strong>{tema.decisao.reu}</strong>
                      </span>
                    </div>
                    <p className="text-muted-foreground leading-relaxed pt-1">{tema.decisao.teor}</p>
                    <div className="rounded bg-white/70 p-2.5 text-[11px] text-emerald-900 border border-emerald-200/60 leading-relaxed">
                      {tema.decisao.extra}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* SEÇÃO 4: RESUMO GERAL DO DATALAKE 2.0 RECONCILIADO */}
        <section id="datalake-v2" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-4 pt-5 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary text-xs font-bold">
                      4
                    </span>
                    DataLake 2.0 Reconciliado: Consolidação Canônica por Empresa
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Processamento estritamente deduplicado eliminando contagens repetitivas da extração histórica
                  </p>
                </div>
                <Badge variant="outline" className="text-xs font-medium self-start sm:self-auto">
                  Auditado sem Duplicações
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {RESUMO_DATALAKE_V2.map((card) => (
                  <div key={card.titulo} className="rounded-lg border bg-card p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-muted-foreground">{card.titulo}</span>
                      <Badge variant="outline" className={`text-[10px] font-semibold ${card.tagClass}`}>
                        {card.tag}
                      </Badge>
                    </div>
                    <div className="text-xl font-bold font-mono text-foreground">{card.valor}</div>
                    <div className="text-xs text-muted-foreground">{card.pessoas}</div>
                    <div className="text-[11px] text-muted-foreground pt-2 border-t leading-tight">
                      {card.historico}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border bg-card overflow-hidden">
                <div className="border-b bg-muted/20 px-4 py-3">
                  <h4 className="font-semibold text-foreground text-xs uppercase tracking-wide">
                    Detalhamento Canônico por Grupo Empresarial
                  </h4>
                </div>

                <div className="overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="font-semibold">Grupo / Empresa</TableHead>
                        <TableHead className="text-center font-semibold">Contracheques Limpos</TableHead>
                        <TableHead className="text-center font-semibold">Pessoas Mapeadas</TableHead>
                        <TableHead className="text-right font-semibold">Total Proventos Brutos</TableHead>
                        <TableHead className="text-right font-semibold">Total Descontos Folha</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {GRUPOS_DATALAKE_V2.map((g) => (
                        <TableRow key={g.nome} className="hover:bg-muted/20">
                          <TableCell className="font-medium text-foreground py-3">
                            <div className="font-bold">{g.nome}</div>
                            {g.detalhe && <div className="text-[11px] text-muted-foreground">{g.detalhe}</div>}
                          </TableCell>
                          <TableCell className="text-center font-mono font-semibold py-3">
                            {g.contracheques}
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <span className="font-mono font-bold text-foreground">{g.pessoas}</span>{" "}
                            <span
                              className={`text-[11px] ${
                                g.ativosHighlight ? "font-bold text-emerald-700" : "text-muted-foreground"
                              }`}
                            >
                              {g.ativos5Anos}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-foreground py-3">
                            {g.proventos}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground py-3">
                            {g.descontos}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="bg-muted/50 font-bold border-t">
                      <TableRow>
                        <TableCell className="py-3">Consolidado Total (Reconciliado)</TableCell>
                        <TableCell className="text-center font-mono py-3">104.285</TableCell>
                        <TableCell className="text-center font-mono py-3">1.252 pessoas (1.060 ativas)</TableCell>
                        <TableCell className="text-right font-mono text-emerald-800 py-3">
                          R$ 2.312.269.575,20
                        </TableCell>
                        <TableCell className="text-right font-mono text-foreground py-3">
                          R$ 1.568.316.187,66
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t bg-card py-6 text-center text-xs text-muted-foreground">
        Sistema Jurídico · GLCM Advocacia · Módulo Radar de Precedentes &amp; DataLake 2.0
      </footer>
    </div>
  );
}
