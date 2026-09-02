export type CasoStatus =
  | "novo"
  | "em_analise"
  | "aguardando_confirmacao"
  | "aguardando_pasta"
  | "concluido"
  | "cancelado";

export const STATUS_LABEL: Record<CasoStatus, string> = {
  novo: "Novo",
  em_analise: "Em Análise",
  aguardando_confirmacao: "Aguardando Confirmação",
  aguardando_pasta: "Aguardando Nº da Pasta",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const STATUS_CLASS: Record<CasoStatus, string> = {
  novo: "bg-status-novo text-status-novo-foreground",
  em_analise: "bg-status-analise text-status-analise-foreground",
  aguardando_confirmacao: "bg-status-confirm text-status-confirm-foreground",
  aguardando_pasta: "bg-status-pasta text-status-pasta-foreground",
  concluido: "bg-status-concluido text-status-concluido-foreground",
  cancelado: "bg-status-cancelado text-status-cancelado-foreground",
};

export const STATUS_ORDER: CasoStatus[] = [
  "novo",
  "em_analise",
  "aguardando_confirmacao",
  "aguardando_pasta",
  "concluido",
  "cancelado",
];

// Tipos com template .docx (upload na página Templates). A planilha de
// cálculo NÃO entra aqui: é gerada como .xlsx com fórmulas, sem template.
export const TEMPLATE_TIPOS = [
  { id: "peticao_ir_sobre_hra", label: "Petição — IR sobre HRA (Tema 306)" },
  { id: "peticao_contribuicao_extraordinaria", label: "Petição — Contribuição Extraordinária" },
  { id: "peticao_horas_extras", label: "Petição — Horas Extras" },
  { id: "peticao_supressao_folgas", label: "Petição — Supressão de Folgas" },
  { id: "peticao_tema_324", label: "Petição — Tema 324" },
  { id: "contrato_tributario", label: "Contrato — Tributário (modelo HRA)" },
  { id: "contrato_trabalhista", label: "Contrato — Trabalhista (modelo Reflexo de Hora Extra)" },
  { id: "contrato_contribuicao_extraordinaria", label: "Contrato — Contribuição Extraordinária" },
  { id: "contrato_supressao_folgas", label: "Contrato — Supressão de Folgas" },
  { id: "procuracao_tributaria_glcm", label: "Procuração Tributária — GLCM" },
  { id: "procuracao_tributaria_polkowski", label: "Procuração Tributária — Polkowski" },
  { id: "procuracao_trabalhista_glcm", label: "Procuração Trabalhista — GLCM" },
  { id: "procuracao_trabalhista_polkowski", label: "Procuração Trabalhista — Polkowski" },
  { id: "declaracao_pobreza", label: "Declaração de Pobreza" },
  // Estes três identificadores já estão validados em produção. Não alterar.
  { id: "termo_lgpd_glcm", label: "Termo LGPD — GLCM" },
  { id: "termo_lgpd_polkowski", label: "Termo LGPD — Polkowski" },
  { id: "termo_renuncia", label: "Termo de Renúncia" },
] as const;

export type TemplateTipo = (typeof TEMPLATE_TIPOS)[number]["id"];

/** Rótulos das peças geradas (templates + planilha gerada). */
export const PECA_LABELS: Record<string, string> = {
  ...Object.fromEntries(TEMPLATE_TIPOS.map((t) => [t.id, t.label])),
  peticao: "Petição Inicial",
  contrato: "Contrato",
  procuracao_glcm: "Procuração — GLCM",
  procuracao_polkowski: "Procuração — Polkowski",
  declaracao_pobreza: "Declaração de Pobreza",
  planilha: "Planilha de Cálculo (Excel)",
  planilha_codigos: "Planilha — Códigos 1513 (Excel)",
  planilha_contrib_extra: "Planilha — Contribuição Extraordinária (Excel)",
  contracheques_unificados: "Contracheques Unificados (PDF)",
};
