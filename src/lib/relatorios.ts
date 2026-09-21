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

/**
 * Rubrica selecionada para filtro: o código isolado é ambíguo (o mesmo código
 * aparece com descrições, tipos e empresas/modelos diferentes, além de códigos
 * nulos). A seleção é sempre a combinação exata, com o código original.
 */
export type RubricaSelecionada = {
  codigo: string | null;
  descricao: string | null;
  tipo: string | null;
  empresa: string | null;
};

/** Empresa/modelo selecionada com o identificador estável da própria fonte. */
export type EmpresaSelecionada = {
  origem: OrigemRelatorio;
  id: string;
  rotulo: string;
};

export type FiltrosRelatorio = {
  temas: string[];
  rubricas: RubricaSelecionada[];
  empresas: EmpresaSelecionada[];
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
  rubricas: [],
  empresas: [],
  de: null,
  ate: null,
  origem: "casos",
};

export const ROTULO_ORIGEM: Record<OrigemRelatorio, string> = {
  casos: "Casos do aplicativo",
  historico: "Base histórica",
};

/**
 * Chave de competência: aceita MM/AAAA e AAAA-MM, exigindo mês entre 01 e 12.
 * Qualquer outro conteúdo é irreconhecível e retorna null — nunca é convertido
 * à força em data, e uma competência irreconhecível não entra em intervalo.
 */
export function chaveCompetencia(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  let ano: string;
  let mes: string;
  const br = /^(\d{2})\/(\d{4})$/.exec(v);
  const iso = /^(\d{4})-(\d{2})$/.exec(v);
  if (br) {
    mes = br[1];
    ano = br[2];
  } else if (iso) {
    ano = iso[1];
    mes = iso[2];
  } else {
    return null;
  }
  const m = Number(mes);
  if (m < 1 || m > 12 || Number(ano) < 1) return null;
  return `${ano}${mes}`;
}

/** Competência aceita nos formatos MM/AAAA e AAAA-MM, com mês válido. */
export function competenciaValida(valor: string | null | undefined): boolean {
  return chaveCompetencia(valor) !== null;
}

/** Normaliza o campo de período para MM/AAAA; vazio ou inválido vira null. */
export function normalizarCompetenciaFiltro(valor: string | null | undefined): string | null {
  const chave = chaveCompetencia(valor);
  if (!chave) return null;
  return `${chave.slice(4, 6)}/${chave.slice(0, 4)}`;
}

/** Período coerente: início não pode ser posterior ao fim. */
export function periodoCoerente(de: string | null, ate: string | null): boolean {
  const a = chaveCompetencia(de);
  const b = chaveCompetencia(ate);
  if (!a || !b) return true;
  return a <= b;
}

/** Dígitos do CPF, sem máscara. */
export function cpfDigitos(valor: string | null | undefined): string | null {
  const d = (valor ?? "").replace(/\D/g, "");
  return d === "" ? null : d;
}

/** Validação de CPF por módulo 11 (mesma regra aplicada no banco). */
export function cpfValido(valor: string | null | undefined): boolean {
  const d = cpfDigitos(valor);
  if (!d || d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/**
 * Identidade da pessoa DENTRO de uma origem: CPF válido quando houver; caso
 * contrário, o identificador do registro, explicitamente sem CPF validado.
 * Dois casos do mesmo CPF são uma pessoa só; origens distintas nunca são
 * unificadas (a chave é sempre qualificada pela origem na tela).
 */
export function identidadePessoa(
  cpf: string | null | undefined,
  idRegistro: string | null | undefined,
): { pessoaId: string; identificacao: "cpf" | "caso_sem_cpf" } {
  if (cpfValido(cpf)) return { pessoaId: `cpf:${cpfDigitos(cpf)}`, identificacao: "cpf" };
  return { pessoaId: `caso:${idRegistro ?? "(sem identificador)"}`, identificacao: "caso_sem_cpf" };
}

export function rotuloIdentificacao(valor: string | null | undefined): string {
  return valor === "cpf" ? "CPF validado" : "Sem CPF validado — identificada pelo registro";
}

/** Chave estável de uma rubrica: combinação exata, com o código original. */
export function chaveRubrica(r: RubricaSelecionada): string {
  return JSON.stringify([r.codigo ?? null, r.descricao ?? null, r.tipo ?? null, r.empresa ?? null]);
}

/** Payload de rubricas: combinações exatas, sem duplicatas. */
export function montarRubricasPayload(rubricas: RubricaSelecionada[]): RubricaSelecionada[] {
  const vistas = new Set<string>();
  const saida: RubricaSelecionada[] = [];
  for (const r of rubricas) {
    const item: RubricaSelecionada = {
      codigo: r.codigo ?? null,
      descricao: r.descricao ?? null,
      tipo: r.tipo ?? null,
      empresa: r.empresa ?? null,
    };
    const k = chaveRubrica(item);
    if (vistas.has(k)) continue;
    vistas.add(k);
    saida.push(item);
  }
  return saida;
}

export function rotuloRubrica(r: RubricaSelecionada): string {
  const partes = [r.codigo ?? "(sem código)", r.descricao ?? "(sem descrição)", r.tipo ?? "(sem tipo)", rotuloEmpresaModelo(r.empresa)];
  return partes.join(" · ");
}

/** Chave que não permite confundir empresas/modelos de fontes diferentes. */
export function chaveEmpresa(empresa: EmpresaSelecionada): string {
  return `${empresa.origem}:${empresa.id}`;
}

/** Valores do filtro destinados apenas à fonte consultada. */
export function empresasPorOrigem(empresas: EmpresaSelecionada[], origem: OrigemRelatorio): string[] | null {
  const valores = Array.from(new Set(empresas.filter((empresa) => empresa.origem === origem).map((empresa) => empresa.id)));
  return valores.length > 0 ? valores : null;
}

export function rotuloEmpresaSelecionada(empresa: EmpresaSelecionada): string {
  return `${ROTULO_ORIGEM[empresa.origem]}: ${rotuloEmpresaModelo(empresa.rotulo)}`;
}

/** A primeira linha da resposta traz o total da paginação retornado pelo banco. */
export function totalLinhas(linhas: Array<Record<string, unknown>>): number {
  const total = linhas[0]?.total_linhas;
  const numero = typeof total === "number" ? total : Number(total ?? 0);
  return Number.isSafeInteger(numero) && numero >= 0 ? numero : 0;
}

/** Há próxima página se pelo menos uma origem tiver linhas além do deslocamento atual. */
export function temProximaPagina(pagina: number, tamanhoPagina: number, totaisPorFonte: number[]): boolean {
  return totaisPorFonte.some((total) => total > (pagina + 1) * tamanhoPagina);
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

/**
 * Empresa/modelo: nos casos do aplicativo o valor vem do modelo de leitura do
 * contracheque, que não é prova de pessoa jurídica. Por isso o rótulo é
 * "empresa/modelo" e nunca se inventa nome de empresa.
 */
export function rotuloEmpresaModelo(valor: string | null | undefined): string {
  const v = (valor ?? "").trim();
  return v === "" ? "(sem empresa/modelo)" : v;
}

/** @deprecated use rotuloEmpresaModelo */
export const rotuloEmpresa = rotuloEmpresaModelo;

export function rotuloPessoa(nome: string | null | undefined): string {
  const v = (nome ?? "").trim();
  return v === "" ? "(sem nome informado)" : v;
}

export function formatarMoeda(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const LIMITE_VIABILIDADE_PADRAO = 15000;

export function acaoViavel(saldoLiquido: number, limite = LIMITE_VIABILIDADE_PADRAO): boolean {
  return saldoLiquido >= limite;
}

export type MetricasGestao = {
  clientesElegiveis: number;
  acoesViaveis: number;
  percentualViaveis: number;
  lastroMedioMeses: number;
  empresaPredominante: string;
  empresaPredominanteQtd: number;
};

export function calcularMetricasGestao(
  linhasPessoa: Array<{
    pessoa_cpf?: string | null;
    empresa?: string | null;
    competencias?: number | null;
    proventos?: number | null;
    descontos?: number | null;
  }>,
  totalPessoasGeral?: number,
): MetricasGestao {
  const total = totalPessoasGeral ?? linhasPessoa.length;
  if (total === 0 || linhasPessoa.length === 0) {
    return {
      clientesElegiveis: total,
      acoesViaveis: 0,
      percentualViaveis: 0,
      lastroMedioMeses: 0,
      empresaPredominante: "—",
      empresaPredominanteQtd: 0,
    };
  }

  let viaveis = 0;
  let somaMeses = 0;
  let totalComMeses = 0;
  const contagemEmpresas = new Map<string, number>();

  for (const l of linhasPessoa) {
    const proventos = Number(l.proventos ?? 0);
    const descontos = Number(l.descontos ?? 0);
    const saldo = proventos - descontos;
    if (saldo >= LIMITE_VIABILIDADE_PADRAO) {
      viaveis++;
    }
    const meses = Number(l.competencias ?? 0);
    if (meses > 0) {
      somaMeses += meses;
      totalComMeses++;
    }
    const emp = rotuloEmpresaModelo(l.empresa);
    contagemEmpresas.set(emp, (contagemEmpresas.get(emp) ?? 0) + 1);
  }

  let empresaMax = "—";
  let qtdMax = 0;
  for (const [emp, qtd] of contagemEmpresas.entries()) {
    if (qtd > qtdMax && emp !== "(sem empresa/modelo)") {
      empresaMax = emp;
      qtdMax = qtd;
    }
  }
  if (empresaMax === "—" && contagemEmpresas.size > 0) {
    const first = contagemEmpresas.entries().next().value;
    if (first) {
      empresaMax = first[0];
      qtdMax = first[1];
    }
  }

  const percentual = linhasPessoa.length > 0 ? Math.round((viaveis / linhasPessoa.length) * 100) : 0;
  const lastroMedio = totalComMeses > 0 ? Math.round(somaMeses / totalComMeses) : 0;

  return {
    clientesElegiveis: total,
    acoesViaveis: viaveis,
    percentualViaveis: percentual,
    lastroMedioMeses: lastroMedio,
    empresaPredominante: empresaMax,
    empresaPredominanteQtd: qtdMax,
  };
}

/**
 * Deduplicação canônica de lançamentos (holerites/rubricas):
 * Garante que lançamentos duplicados por reprocessamento de OCR, múltiplos contracheques
 * da mesma competência ou duplicidades cartesianas sejam colapsados em um único registro canônico.
 * Partição canônica: competência + código + tipo + descrição normalizada.
 */
export function deduplicarLancamentos<T extends Record<string, unknown>>(itens: T[]): T[] {
  const vistos = new Map<string, T>();

  for (const item of itens) {
    const comp = chaveCompetencia(String(item.competencia ?? "")) ?? String(item.competencia ?? "").trim();
    const cod = String(item.codigo ?? "").trim().toLowerCase();
    const tipo = String(item.tipo ?? "").trim().toLowerCase();
    const desc = String(item.descricao ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const chave = `${comp}|${cod}|${tipo}|${desc}`;

    if (!vistos.has(chave)) {
      // A competência é apresentada no padrão único do relatório, independente
      // de a fonte persistir o mês como AAAA-MM ou MM/AAAA.
      const competencia = normalizarCompetenciaFiltro(String(item.competencia ?? ""));
      vistos.set(chave, competencia ? ({ ...item, competencia } as T) : item);
    }
  }

  return Array.from(vistos.values()).sort((a, b) => {
    const competenciaA = chaveCompetencia(String(a.competencia ?? ""));
    const competenciaB = chaveCompetencia(String(b.competencia ?? ""));
    if (competenciaA && competenciaB) return competenciaA.localeCompare(competenciaB);
    if (competenciaA) return -1;
    if (competenciaB) return 1;
    return 0;
  });
}

/**
 * Deduplica registros de pessoas/clientes na listagem pelo identificador canônico.
 */
export function deduplicarPessoas<T extends Record<string, unknown>>(pessoas: T[]): T[] {
  const vistos = new Set<string>();
  const saida: T[] = [];

  for (const p of pessoas) {
    const id = String(p.pessoa_id ?? p.caso_id ?? p.pessoa_cpf ?? "").trim();
    if (!id || !vistos.has(id)) {
      if (id) vistos.add(id);
      saida.push(p);
    }
  }

  return saida;
}
