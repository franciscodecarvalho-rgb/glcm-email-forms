// Motor de cálculo: IR sobre HRA (Tema 306).
//
// Replica o método das planilhas do escritório (DOC. 06): por competência,
// soma TODAS as rubricas da família HRA (proventos) e aplica a alíquota fixa de
// 27,5%. O total histórico é a soma dos valores mensais (sem arredondar por mês),
// arredondado a 2 casas no fim — igual ao que o Excel faz com SUM.
//
// Diferença crucial vs. a planilha manual: aqui a base soma TODAS as rubricas
// HRA presentes (via classificarRubrica), então nunca "esquece" uma coluna —
// o erro que subestimou um caso real em ~9% (bug das colunas no Excel à mão).

import { contaNoCalculoHra } from "./hra-catalog";

/** Alíquota fixa do IRPF aplicada sobre a parcela HRA. */
export const ALIQUOTA_IR_HRA = 0.275;

export type ItemRubrica = {
  codigo?: string | null;
  descricao: string;
  valor: number;
  tipo: "provento" | "desconto";
};

export type CompetenciaInput = {
  /** Período de apuração, ex: "2024-07". */
  competencia: string;
  itens: ItemRubrica[];
};

export type LinhaCalculo = {
  competencia: string;
  /** Soma das rubricas HRA que contam na base. */
  baseHra: number;
  /** IR do mês = baseHra * alíquota (sem arredondar). */
  irMes: number;
};

export type ResultadoCalculo = {
  aliquota: number;
  linhas: LinhaCalculo[];
  /** Soma dos irMes, arredondada a 2 casas (valor histórico, antes da Selic). */
  totalHistorico: number;
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Calcula o IR sobre HRA a restituir, por competência e o total histórico.
 * @param competencias rubricas de cada contracheque, por competência.
 * @param aliquota alíquota aplicada (padrão 27,5%).
 */
export function calcularIrSobreHra(
  competencias: CompetenciaInput[],
  aliquota: number = ALIQUOTA_IR_HRA,
): ResultadoCalculo {
  const linhas: LinhaCalculo[] = competencias.map((c) => {
    const baseHra = c.itens
      .filter((i) => contaNoCalculoHra(i))
      .reduce((soma, i) => soma + (Number(i.valor) || 0), 0);
    return { competencia: c.competencia, baseHra, irMes: baseHra * aliquota };
  });

  const totalHistorico = round2(linhas.reduce((s, l) => s + l.irMes, 0));
  return { aliquota, linhas, totalHistorico };
}
