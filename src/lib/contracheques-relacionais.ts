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

// Desconto abate a base; provento soma. O valor persistido é sempre uma
// magnitude positiva, então o sinal vem só do campo `tipo`.
function valorComSinal(item: ItemContrachequeRelacional): number {
  const magnitude = Math.abs(Number(item.valor) || 0);
  return item.tipo === "desconto" ? -magnitude : magnitude;
}

export function contrachequesRelacionaisParaRevisao(
  contracheques: ContrachequeRelacional[] | null | undefined,
): ContrachequeRevisao[] {
  return (contracheques ?? []).map((contracheque, index) => {
    const itens = contracheque.itens_contracheque ?? [];
    const valorAhra = itens
      .filter((item) => item.familia_hra === "ahra_dobra")
      .reduce((total, item) => total + valorComSinal(item), 0);
    const valorHra = itens
      .filter((item) => item.familia_hra && item.familia_hra !== "ahra_dobra")
      .reduce((total, item) => total + valorComSinal(item), 0);

    return {
      id: contracheque.id,
      label: contracheque.competencia || contracheque.arquivo_origem || `Contracheque ${index + 1}`,
      valor_hra: valorHra,
      valor_ahra: valorAhra,
    };
  });
}
