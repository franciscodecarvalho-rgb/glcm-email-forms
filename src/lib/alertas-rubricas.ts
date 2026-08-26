// Sinalização de rubricas monitoradas nos contracheques do caso.
// Regra confirmada: alertar o usuário quando houver os códigos
// 1059, 1513 (solicitação da Ana; relatório e viabilidade removidos do escopo)
// e as contribuições extraordinárias PPSP 1489, 6050, 6060 e 6070.

import type { ContrachequeRelacional } from "./contracheques-relacionais";
import { classificarRubrica } from "./hra-catalog";

export const CODIGOS_ALERTA = ["1059", "1513", "1489", "6050", "6060", "6070"] as const;

export type RubricaAlertada = {
  codigo: string;
  descricao: string | null;
  quantidadeTotal: number;
  valorTotal: number;
};

export function encontrarRubricasAlerta(
  contracheques: ContrachequeRelacional[] | null | undefined,
  codigos: readonly string[] = CODIGOS_ALERTA,
): RubricaAlertada[] {
  const alvo = new Set(codigos.map((c) => c.trim()));
  const porCodigo = new Map<string, RubricaAlertada>();

  for (const contracheque of contracheques ?? []) {
    for (const item of contracheque.itens_contracheque ?? []) {
      const codigo = (item.codigo ?? "").trim();
      if (!alvo.has(codigo)) continue;
      const entrada = porCodigo.get(codigo) ?? {
        codigo,
        descricao: null,
        quantidadeTotal: 0,
        valorTotal: 0,
      };
      if (!entrada.descricao && item.descricao) entrada.descricao = item.descricao;
      entrada.quantidadeTotal += Number(item.referencia) || 0;
      entrada.valorTotal += Math.abs(Number(item.valor) || 0);
      porCodigo.set(codigo, entrada);
    }
  }

  return [...porCodigo.values()].sort(
    (a, b) => [...alvo].indexOf(a.codigo) - [...alvo].indexOf(b.codigo),
  );
}

export type LinhaSemIr = {
  competencia: string | null;
  codigo: string | null;
  descricao: string;
  valor: number;
};

export type RubricasSemIr = {
  linhas: LinhaSemIr[];
  total: number;
};

/**
 * Localiza rubricas HRA/AHRA marcadas "Sem IR/IRRF" (mesma classificação de
 * hra-catalog.ts) e retorna cada linha individual (competência, código,
 * descrição, valor) junto do total — essas verbas já não tiveram IR retido,
 * então não entram na base do cálculo, mas o escritório precisa vê-las.
 */
export function encontrarRubricasSemIr(
  contracheques: ContrachequeRelacional[] | null | undefined,
): RubricasSemIr {
  const linhas: LinhaSemIr[] = [];

  for (const contracheque of contracheques ?? []) {
    for (const item of contracheque.itens_contracheque ?? []) {
      const descricao = item.descricao ?? "";
      const classificacao = classificarRubrica(item.codigo, descricao);
      if (!classificacao.familia || !classificacao.semIr) continue;
      linhas.push({
        competencia: contracheque.competencia ?? null,
        codigo: (item.codigo ?? "").trim() || null,
        descricao,
        valor: Math.abs(Number(item.valor) || 0),
      });
    }
  }

  const total = linhas.reduce((soma, l) => soma + l.valor, 0);
  return { linhas, total };
}
