/**
 * Regras do relatório de temas (MVP confirmado):
 * - Os termos vêm exclusivamente do cadastro de Temas do banco do aplicativo e
 *   valem igualmente para as duas fontes de dados.
 * - As duas fontes (casos do app e histórico) NUNCA são fundidas por heurística:
 *   cada linha carrega sua origem e os totais são apresentados por origem.
 * - Um item só é contado uma vez por fonte (contagem por item distinto), mesmo
 *   quando corresponde a mais de um tema.
 * - Itens informativos não compõem valores.
 */

export type OrigemRelatorio = "casos" | "historico";
export type EscopoOrigem = "ambas" | OrigemRelatorio;

export type TemaComTermos = { nome: string; termos: string[] };

export type FiltrosRelatorio = {
  temas: string[];
  codigos: string[];
  empresas: string[];
  de: string | null;
  ate: string | null;
  origem: EscopoOrigem;
};

export type TotaisFonte = {
  itens: number;
  pessoas: number;
  empresas: number;
  proventos: number;
  descontos: number;
};

export type EstadoFonte = "ok" | "indisponivel" | "erro";

export type ResultadoFonte<T> = {
  origem: OrigemRelatorio;
  estado: EstadoFonte;
  motivo?: string;
  dados: T[];
};

export const FILTROS_INICIAIS: FiltrosRelatorio = {
  temas: [],
  codigos: [],
  empresas: [],
  de: null,
  ate: null,
  origem: "ambas",
};

export const ROTULO_ORIGEM: Record<OrigemRelatorio, string> = {
  casos: "Casos do aplicativo",
  historico: "Base histórica",
};

/** Competência aceita apenas no formato MM/AAAA. */
export function competenciaValida(valor: string | null | undefined): boolean {
  if (!valor) return false;
  const m = /^(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!m) return false;
  const mes = Number(m[1]);
  return mes >= 1 && mes <= 12;
}

/** Normaliza o campo de período: vazio vira null; inválido também vira null. */
export function normalizarCompetenciaFiltro(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  return competenciaValida(v) ? v : null;
}

/** Período coerente: início não pode ser posterior ao fim. */
export function periodoCoerente(de: string | null, ate: string | null): boolean {
  if (!de || !ate) return true;
  const chave = (v: string) => `${v.slice(3)}${v.slice(0, 2)}`;
  return chave(de) <= chave(ate);
}

/**
 * Monta o payload de temas enviado às funções de agregação:
 * apenas os temas selecionados, com seus termos normalizados e sem duplicatas.
 */
export function montarTemasPayload(
  temas: TemaComTermos[],
  selecionados: string[],
): { tema: string; termos: string[] }[] {
  const alvo = selecionados.length > 0 ? new Set(selecionados) : null;
  return temas
    .filter((t) => (alvo ? alvo.has(t.nome) : true))
    .map((t) => ({
      tema: t.nome,
      termos: Array.from(
        new Set(t.termos.map((x) => x.toLowerCase().replace(/\s+/g, " ").trim()).filter(Boolean)),
      ),
    }))
    .filter((t) => t.termos.length > 0);
}

export const TOTAIS_ZERADOS: TotaisFonte = {
  itens: 0,
  pessoas: 0,
  empresas: 0,
  proventos: 0,
  descontos: 0,
};

/**
 * Subtotais por origem. Não existe "total consolidado único": quando as duas
 * fontes trazem dados, a soma simples é sinalizada como sobreposição não
 * validada, porque a mesma pessoa pode existir nas duas bases.
 */
export function consolidarTotais(
  resultados: { origem: OrigemRelatorio; estado: EstadoFonte; totais: TotaisFonte }[],
): {
  subtotais: { origem: OrigemRelatorio; estado: EstadoFonte; totais: TotaisFonte }[];
  somaSimples: TotaisFonte;
  sobreposicaoNaoValidada: boolean;
  parcial: boolean;
} {
  const ok = resultados.filter((r) => r.estado === "ok");
  const somaSimples = ok.reduce<TotaisFonte>(
    (acc, r) => ({
      itens: acc.itens + r.totais.itens,
      pessoas: acc.pessoas + r.totais.pessoas,
      empresas: acc.empresas + r.totais.empresas,
      proventos: acc.proventos + r.totais.proventos,
      descontos: acc.descontos + r.totais.descontos,
    }),
    { ...TOTAIS_ZERADOS },
  );
  return {
    subtotais: resultados,
    somaSimples,
    sobreposicaoNaoValidada: ok.filter((r) => r.totais.itens > 0).length > 1,
    parcial: resultados.some((r) => r.estado !== "ok"),
  };
}

/** Chave de linha sempre qualificada pela origem: nunca agrupa entre bases. */
export function chaveLinha(origem: OrigemRelatorio, id: string | null | undefined): string {
  return `${origem}:${id ?? "(sem identificador)"}`;
}

/** Junta listas de fontes distintas preservando a origem de cada linha. */
export function juntarLinhas<T>(
  resultados: ResultadoFonte<T>[],
): (T & { origem: OrigemRelatorio })[] {
  return resultados
    .filter((r) => r.estado === "ok")
    .flatMap((r) => r.dados.map((d) => ({ ...d, origem: r.origem })));
}

export function rotuloEmpresa(valor: string | null | undefined): string {
  const v = (valor ?? "").trim();
  return v === "" ? "(sem empresa)" : v;
}

export function rotuloPessoa(nome: string | null | undefined): string {
  const v = (nome ?? "").trim();
  return v === "" ? "(sem nome informado)" : v;
}

export function formatarMoeda(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
