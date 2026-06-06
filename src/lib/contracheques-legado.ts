// Adaptador: contracheques no formato jsonb antigo (casos.contracheques) para a
// entrada do motor de cálculo.
//
// Formato antigo: [{ label, valor_hra, valor_ahra }] — valores já somados por
// período. Mapeamos cada período para uma competência com duas rubricas-HRA
// ("Adicional HRA" e "AHRA/Dobra de Turno"), que o motor reconhece e soma.
//
// Quando a extração popular as tabelas novas (contracheques/itens_contracheque),
// basta trocar a fonte por um adaptador equivalente — a tela não muda.

import type { CompetenciaInput } from "./calcular-ir-hra";

export type ContrachequeLegado = {
  label?: string | null;
  valor_hra?: number | null;
  valor_ahra?: number | null;
};

export function contrachequesLegadoParaMotor(
  contras: ContrachequeLegado[] | null | undefined,
): CompetenciaInput[] {
  return (contras ?? []).map((c, i) => {
    const hra = Number(c?.valor_hra) || 0;
    const ahra = Number(c?.valor_ahra) || 0;
    const itens = [];
    if (hra) itens.push({ descricao: "Adicional HRA", valor: hra, tipo: "provento" as const });
    if (ahra) itens.push({ descricao: "AHRA/Dobra de Turno", valor: ahra, tipo: "provento" as const });
    return { competencia: c?.label || `Contracheque ${i + 1}`, itens };
  });
}
