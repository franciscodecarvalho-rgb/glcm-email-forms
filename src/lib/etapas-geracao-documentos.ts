import { selecionarPecas } from "./modelos-documentos";

export type EtapaGeracaoDocumentos =
  | "docx"
  | "planilha_calculo"
  | "planilha_contrib_extra"
  | "planilha_banco_horas"
  | "pdf_unificado"
  | "finalizar";

export type PassoGeracaoDocumentos = {
  etapa: EtapaGeracaoDocumentos;
  template_tipo?: string;
};

/**
 * Cada passo vira uma requisição independente à Edge Function. Não usar
 * Promise.all: DOCX/XLSX consomem CPU e memória, e paralelismo provoca 546.
 */
export function criarEtapasGeracaoDocumentos(
  tipoAcao: string,
  escritorios: string[],
): PassoGeracaoDocumentos[] {
  return [
    ...selecionarPecas(tipoAcao, escritorios).map((peca) => ({
      etapa: "docx" as const,
      template_tipo: peca.templateTipo,
    })),
    { etapa: "planilha_calculo" },
    { etapa: "planilha_contrib_extra" },
    { etapa: "planilha_banco_horas" },
    { etapa: "pdf_unificado" },
    { etapa: "finalizar" },
  ];
}
