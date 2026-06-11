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
  { id: "peticao", label: "Petição Inicial" },
  { id: "contrato", label: "Contrato" },
  { id: "procuracao_glcm", label: "Procuração — GLCM" },
  { id: "procuracao_polkowski", label: "Procuração — Polkowski" },
  { id: "termo_lgpd_glcm", label: "Termo LGPD — GLCM" },
  { id: "termo_lgpd_polkowski", label: "Termo LGPD — Polkowski" },
  { id: "termo_renuncia", label: "Termo de Renúncia" },
] as const;

export type TemplateTipo = (typeof TEMPLATE_TIPOS)[number]["id"];

/** Rótulos das peças geradas (templates + planilha gerada). */
export const PECA_LABELS: Record<string, string> = {
  ...Object.fromEntries(TEMPLATE_TIPOS.map((t) => [t.id, t.label])),
  planilha: "Planilha de Cálculo (Excel)",
};
