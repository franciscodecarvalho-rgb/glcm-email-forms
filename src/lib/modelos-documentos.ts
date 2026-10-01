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

/**
 * Nome de exibição/download dos arquivos gerados.
 *
 * Padrão (Nodley, 01/10/2026): "Tipo de Documento — Nome cliente — Tipo ação",
 * replicando o padrão já usado pela Planilha de Cálculo. O tipo usa
 * capitalização natural e espaço (não travessão) internamente, porque o
 * travessão " — " separa os três componentes do nome.
 *
 * A planilha principal (`planilha`) e a complementar (`planilha_contrib_extra`)
 * NÃO passam por aqui: seus nomes já seguem o padrão e são montados inline na
 * geração (a complementar tem rótulo de ação fixo, independente do tipo_acao).
 */
export const NOME_ARQUIVO_TIPO: Record<string, string> = {
  peticao: "Petição Inicial",
  contrato: "Contrato",
  termo_renuncia: "Termo de Renúncia",
  declaracao_pobreza: "Declaração de Pobreza",
  procuracao_glcm: "Procuração GLCM",
  procuracao_polkowski: "Procuração Polkowski",
  termo_lgpd_glcm: "Termo LGPD GLCM",
  termo_lgpd_polkowski: "Termo LGPD Polkowski",
  planilha_codigos: "Planilha Códigos 1513",
  contracheques_unificados: "Contracheques Unificados",
};

/** Rótulo da ação (3º termo) seguindo o comportamento atual da planilha. */
export function rotuloAcaoArquivo(tipoAcao: string): string {
  return tipoAcao === "contribuicao_extraordinaria"
    ? "IR SOBRE CONTRIBUIÇÃO EXTRAORDINÁRIA"
    : "IR SOBRE HRA";
}

/** Monta "Tipo — Cliente — Ação.ext" para download. */
export function nomeArquivoGerado(
  tipoSaida: string,
  nomeCliente: string | null | undefined,
  tipoAcao: string,
  extensao: string,
): string {
  const tipo = NOME_ARQUIVO_TIPO[tipoSaida] ?? tipoSaida;
  const cliente = nomeCliente ?? "";
  return `${tipo} — ${cliente} — ${rotuloAcaoArquivo(tipoAcao)}.${extensao}`;
}
