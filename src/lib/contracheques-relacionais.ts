export type ItemContrachequeRelacional = {
  id?: string;
  contracheque_id?: string;
  codigo?: string | null;
  descricao?: string | null;
  referencia?: number | null;
  valor?: number | null;
  tipo?: string | null;
  familia_hra?: string | null;
};

export type ContrachequeRelacional = {
  id: string;
  competencia?: string | null;
  total_proventos?: number | null;
  total_descontos?: number | null;
  liquido?: number | null;
  arquivo_origem?: string | null;
  modelo_origem?: string | null;
  itens_contracheque?: ItemContrachequeRelacional[] | null;
};

export type ContrachequeRevisao = {
  id: string;
  label: string;
  valor_hra: number;
  valor_ahra: number;
};

export function montarContrachequesRelacionais(
  contracheques: ContrachequeRelacional[] | null | undefined,
  itens: ItemContrachequeRelacional[] | null | undefined,
): ContrachequeRelacional[] {
  return (contracheques ?? []).map((contracheque) => ({
    ...contracheque,
    itens_contracheque: (itens ?? []).filter(
      (item) => item.contracheque_id === contracheque.id,
    ),
  }));
}

// Descontos nunca compõem a base HRA/AHRA (nem como valor negativo):
// somente proventos entram no cálculo.
function ehProventoHra(item: ItemContrachequeRelacional): boolean {
  return (item.tipo ?? "provento") === "provento";
}

function ehFamiliaAhra(item: ItemContrachequeRelacional): boolean {
  return item.familia_hra === "ahra_dobra" || item.familia_hra === "adicional_hra";
}

function valorProvento(item: ItemContrachequeRelacional): number {
  return Math.abs(Number(item.valor) || 0);
}

export function contrachequesRelacionaisParaRevisao(
  contracheques: ContrachequeRelacional[] | null | undefined,
): ContrachequeRevisao[] {
  const linhas = (contracheques ?? []).map((contracheque, index) => {
    const itens = contracheque.itens_contracheque ?? [];
    const valorAhra = itens
      .filter((item) => ehFamiliaAhra(item) && ehProventoHra(item))
      .reduce((total, item) => total + valorProvento(item), 0);
    const valorHra = itens
      .filter((item) => item.familia_hra && !ehFamiliaAhra(item) && ehProventoHra(item))
      .reduce((total, item) => total + valorProvento(item), 0);

    return {
      competencia: contracheque.competencia || null,
      linha: {
        id: contracheque.id,
        label: contracheque.competencia || contracheque.arquivo_origem || `Contracheque ${index + 1}`,
        valor_hra: valorHra,
        valor_ahra: valorAhra,
      },
    };
  });

  // Consolida linhas da mesma competência (uma linha por competência),
  // preservando a ordem de primeira ocorrência. Sem competência = linha própria.
  const consolidado: ContrachequeRevisao[] = [];
  const porCompetencia = new Map<string, ContrachequeRevisao>();
  for (const { competencia, linha } of linhas) {
    if (!competencia) {
      consolidado.push(linha);
      continue;
    }
    const existente = porCompetencia.get(competencia);
    if (existente) {
      existente.valor_hra += linha.valor_hra;
      existente.valor_ahra += linha.valor_ahra;
      continue;
    }
    porCompetencia.set(competencia, linha);
    consolidado.push(linha);
  }
  // Competências sem HRA/AHRA calculável (após excluir descontos) não geram linha.
  return consolidado.filter((linha) => linha.valor_hra > 0 || linha.valor_ahra > 0);
}

