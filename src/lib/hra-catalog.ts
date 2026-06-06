// Catálogo e classificação de rubricas HRA/AHRA.
//
// Derivado da análise do banco real de contracheques (ecossistema Petrobras):
// HRA/AHRA aparecem na DESCRIÇÃO da rubrica (não no código numérico), com muito
// ruído de OCR ("AdiconalHRA", "AHRA/Dobra de Tumo", "AMHRANDOta de Tumo"...).
//
// Decisão do escritório: contam TODAS as variantes HRA/AHRA (proventos) como
// base do cálculo de IR; excluem-se apenas as marcadas "Sem IR / s/IRRF"
// (essas já não tiveram retenção, então não há o que restituir).

export type FamiliaHra =
  | "adicional_hra"
  | "ahra_dobra"
  | "dif_ahra"
  | "ahra"
  | "hra";

export type ClassificacaoRubrica = {
  /** Família para agrupar colunas na planilha; null = não é rubrica HRA/AHRA. */
  familia: FamiliaHra | null;
  /** true = variante "Sem IR/IRRF" (sem retenção → fora da base de cálculo). */
  semIr: boolean;
};

/** Normaliza para casamento robusto: remove acentos, baixa caixa, pontuação → espaço. */
function normalizar(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Detecta marcação "Sem IR" / "s/IRRF" / "sem IRRF" na descrição. */
function ehSemIr(descricao: string): boolean {
  const n = normalizar(descricao);
  return /\bsem\s*ir(rf)?\b/.test(n) || /\bs\s*irrf\b/.test(n) || /\bs\s*ir\b/.test(n);
}

/**
 * Classifica uma rubrica pelo código/descrição.
 * A base do cálculo só depende de `familia !== null` (sub-família é só para
 * agrupar colunas na planilha), então pequenas imprecisões de sub-família não
 * afetam o valor calculado.
 */
export function classificarRubrica(
  codigo: string | null | undefined,
  descricao: string,
): ClassificacaoRubrica {
  const n = normalizar(descricao);

  // Precisa conter "hra" (cobre também "ahra") em qualquer ponto — pega o OCR.
  if (!/hra/.test(n)) return { familia: null, semIr: false };

  const semIr = ehSemIr(descricao);

  let familia: FamiliaHra;
  if (/\bdif/.test(n) || /\bdi\b/.test(n)) {
    familia = "dif_ahra"; // "Dif AHRA Dobra", "Dif Adicional HRA", "DI AHRA Dobra"
  } else if (/dobra/.test(n)) {
    familia = "ahra_dobra"; // "AHRA/Dobra de Turno" (e variantes de OCR)
  } else if (/adic/.test(n)) {
    familia = "adicional_hra"; // "Adicional HRA", "Adic HRA Eventual"
  } else if (/ahra/.test(n)) {
    familia = "ahra"; // "AHRA" avulso
  } else {
    familia = "hra"; // "HRA" avulso
  }
  return { familia, semIr };
}

/**
 * A rubrica entra na base de cálculo do IR sobre HRA?
 * Regra: precisa ser PROVENTO, ser de família HRA, e não ser "Sem IR".
 */
export function contaNoCalculoHra(item: {
  codigo?: string | null;
  descricao: string;
  tipo: string;
}): boolean {
  if (item.tipo !== "provento") return false;
  const c = classificarRubrica(item.codigo, item.descricao);
  return c.familia !== null && !c.semIr;
}
