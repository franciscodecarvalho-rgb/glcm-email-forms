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

export type PecaSelecionada = { templateTipo: string; tipoSaida: string };

// Fonte canônica testada; a Edge Function generate-documents mantém uma cópia
// inline (deploy de arquivo único). Ao alterar aqui, sincronizar a cópia.
export function selecionarPecas(tipoAcao: string, escritorios: string[]): PecaSelecionada[] {
  const configuracao = configuracaoDocumentos(tipoAcao);
  if (!configuracao) throw new Error(`Tipo de ação sem modelos configurados: ${tipoAcao || "não informado"}`);

  const pecas: PecaSelecionada[] = [
    { templateTipo: configuracao.peticao, tipoSaida: "peticao" },
    { templateTipo: configuracao.contrato, tipoSaida: "contrato" },
    // Declaração de Pobreza somente nas ações trabalhistas
    // (horas_extras e supressao_folgas); não entra nas tributárias.
    ...(configuracao.natureza === "trabalhista"
      ? [{ templateTipo: "declaracao_pobreza", tipoSaida: "declaracao_pobreza" }]
      : []),
    // Termo de renúncia existente e já validado: identificador preservado.
    { templateTipo: "termo_renuncia", tipoSaida: "termo_renuncia" },
  ];

  if (escritorios.length === 0 || escritorios.includes("glcm")) {
    pecas.push(
      { templateTipo: tipoProcuracao(configuracao.natureza, "glcm"), tipoSaida: "procuracao_glcm" },
      { templateTipo: "termo_lgpd_glcm", tipoSaida: "termo_lgpd_glcm" },
    );
  }
  if (escritorios.length === 0 || escritorios.includes("polkowski")) {
    pecas.push(
      { templateTipo: tipoProcuracao(configuracao.natureza, "polkowski"), tipoSaida: "procuracao_polkowski" },
      { templateTipo: "termo_lgpd_polkowski", tipoSaida: "termo_lgpd_polkowski" },
    );
  }
  return pecas;
}
