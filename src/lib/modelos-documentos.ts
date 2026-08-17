export type TipoAcao =
  | "ir_sobre_hra"
  | "contribuicao_extraordinaria"
  | "horas_extras"
  | "supressao_folgas"
  | "tema_324";

export type NaturezaAcao = "tributaria" | "trabalhista";

type ConfiguracaoDocumentos = {
  natureza: NaturezaAcao;
  peticao: string;
  contrato: string;
};

export const DOCUMENTOS_POR_TIPO_ACAO: Record<TipoAcao, ConfiguracaoDocumentos> = {
  ir_sobre_hra: {
    natureza: "tributaria",
    peticao: "peticao_ir_sobre_hra",
    contrato: "contrato_tributario",
  },
  contribuicao_extraordinaria: {
    natureza: "tributaria",
    peticao: "peticao_contribuicao_extraordinaria",
    contrato: "contrato_contribuicao_extraordinaria",
  },
  tema_324: {
    natureza: "tributaria",
    peticao: "peticao_tema_324",
    contrato: "contrato_tributario",
  },
  horas_extras: {
    natureza: "trabalhista",
    peticao: "peticao_horas_extras",
    contrato: "contrato_trabalhista",
  },
  supressao_folgas: {
    natureza: "trabalhista",
    peticao: "peticao_supressao_folgas",
    contrato: "contrato_supressao_folgas",
  },
};

export function configuracaoDocumentos(tipoAcao: string): ConfiguracaoDocumentos | null {
  return DOCUMENTOS_POR_TIPO_ACAO[tipoAcao as TipoAcao] ?? null;
}

export function tipoProcuracao(natureza: NaturezaAcao, escritorio: "glcm" | "polkowski"): string {
  return `procuracao_${natureza}_${escritorio}`;
}
