export type ItemContrachequeRelacional = {
  valor?: number | null;
  familia_hra?: string | null;
};

export type ContrachequeRelacional = {
  id: string;
  competencia?: string | null;
  arquivo_origem?: string | null;
  itens_contracheque?: ItemContrachequeRelacional[] | null;
};

export type ContrachequeRevisao = {
  id: string;
  label: string;
  valor_hra: number;
  valor_ahra: number;
};

export function contrachequesRelacionaisParaRevisao(
  contracheques: ContrachequeRelacional[] | null | undefined,
): ContrachequeRevisao[] {
  return (contracheques ?? []).map((contracheque, index) => {
    const itens = contracheque.itens_contracheque ?? [];
    const valorAhra = itens
      .filter((item) => item.familia_hra === "ahra_dobra")
      .reduce((total, item) => total + Math.abs(Number(item.valor) || 0), 0);
    const valorHra = itens
      .filter((item) => item.familia_hra && item.familia_hra !== "ahra_dobra")
      .reduce((total, item) => total + Math.abs(Number(item.valor) || 0), 0);

    return {
      id: contracheque.id,
      label: contracheque.competencia || contracheque.arquivo_origem || `Contracheque ${index + 1}`,
      valor_hra: valorHra,
      valor_ahra: valorAhra,
    };
  });
}
