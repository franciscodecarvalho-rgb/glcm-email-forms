// Pós-processamento da extração de contracheques.
//
// Recebe o payload estruturado (o que a IA devolve por contracheque) e normaliza
// em linhas prontas para inserir em `contracheques` + `itens_contracheque`,
// classificando a família HRA de cada rubrica via o catálogo (determinístico).
//
// Função PURA: não fala com Supabase nem IA. A Edge Function de extração fica
// como uma casca fina em volta disto — toda a lógica de negócio é testável aqui.

import { classificarRubrica } from "./hra-catalog";

export type ItemExtraido = {
  codigo?: string | null;
  descricao: string;
  valor: number;
  tipo?: string | null; // "provento" | "desconto" (default: provento)
};

export type ContrachequeExtraido = {
  competencia?: string | null;
  salario_base?: number | null;
  total_proventos?: number | null;
  total_descontos?: number | null;
  liquido?: number | null;
  arquivo_origem?: string | null;
  itens?: ItemExtraido[] | null;
};

export type ItemProcessado = {
  codigo: string | null;
  descricao: string;
  valor: number;
  tipo: "provento" | "desconto";
  familia_hra: string | null;
};

export type ContrachequeProcessado = {
  competencia: string | null;
  salario_base: number | null;
  total_proventos: number | null;
  total_descontos: number | null;
  liquido: number | null;
  arquivo_origem: string | null;
  itens: ItemProcessado[];
};

function normalizarTipo(tipo: string | null | undefined): "provento" | "desconto" {
  return (tipo ?? "").toLowerCase().startsWith("desc") ? "desconto" : "provento";
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Normaliza e classifica os contracheques extraídos. */
export function processarContracheques(
  extraidos: ContrachequeExtraido[] | null | undefined,
): ContrachequeProcessado[] {
  return (extraidos ?? []).map((c) => ({
    competencia: c.competencia ?? null,
    salario_base: num(c.salario_base),
    total_proventos: num(c.total_proventos),
    total_descontos: num(c.total_descontos),
    liquido: num(c.liquido),
    arquivo_origem: c.arquivo_origem ?? null,
    itens: (c.itens ?? []).map((i) => ({
      codigo: i.codigo ?? null,
      descricao: i.descricao ?? "",
      valor: num(i.valor) ?? 0,
      tipo: normalizarTipo(i.tipo),
      familia_hra: classificarRubrica(i.codigo, i.descricao ?? "").familia,
    })),
  }));
}

/** Empregadores distintos não são extraídos por rubrica; helper utilitário para
 *  deduplicar uma lista de empregadores (razão social/CNPJ) já extraída. */
export function deduplicarEmpregadores(
  empregadores: Array<{ razao_social?: string | null; cnpj?: string | null }>,
): Array<{ razao_social: string | null; cnpj: string | null }> {
  const vistos = new Set<string>();
  const out: Array<{ razao_social: string | null; cnpj: string | null }> = [];
  for (const e of empregadores ?? []) {
    const cnpjDigitos = (e?.cnpj ?? "").replace(/\D/g, "");
    const chave = cnpjDigitos || (e?.razao_social ?? "").trim().toLowerCase();
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ razao_social: e?.razao_social ?? null, cnpj: e?.cnpj ?? null });
  }
  return out;
}
