// Sinalização de rubricas monitoradas nos contracheques do caso.
// Regra confirmada: alertar o usuário quando houver os códigos
// 1059, 1513 ou 6050 (solicitação da Ana; relatório e viabilidade removidos do escopo).

import type { ContrachequeRelacional } from "./contracheques-relacionais";

export const CODIGOS_ALERTA = ["1059", "1513", "6050"] as const;

export type RubricaAlertada = {
  codigo: string;
  descricao: string | null;
  competencias: string[];
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
      const entrada = porCodigo.get(codigo) ?? { codigo, descricao: null, competencias: [] };
      if (!entrada.descricao && item.descricao) entrada.descricao = item.descricao;
      const competencia = contracheque.competencia;
      if (competencia && !entrada.competencias.includes(competencia)) {
        entrada.competencias.push(competencia);
      }
      porCodigo.set(codigo, entrada);
    }
  }

  return [...porCodigo.values()].sort(
    (a, b) => [...alvo].indexOf(a.codigo) - [...alvo].indexOf(b.codigo),
  );
}
