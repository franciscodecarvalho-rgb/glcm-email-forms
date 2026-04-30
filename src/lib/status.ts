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

export const TEMPLATE_TIPOS = [
  { id: "peticao", label: "Petição Inicial" },
  { id: "contrato", label: "Contrato" },
  { id: "procuracao", label: "Procuração" },
  { id: "termo", label: "Termo" },
] as const;

export type TemplateTipo = (typeof TEMPLATE_TIPOS)[number]["id"];
