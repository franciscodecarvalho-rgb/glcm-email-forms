import { describe, expect, it } from "vitest";
import {
  chaveLinha,
  competenciaValida,
  consolidarTotais,
  juntarLinhas,
  montarTemasPayload,
  normalizarCompetenciaFiltro,
  periodoCoerente,
  rotuloEmpresa,
  rotuloPessoa,
  TOTAIS_ZERADOS,
  type ResultadoFonte,
} from "./relatorios";

describe("filtros de período", () => {
  it("aceita apenas MM/AAAA", () => {
    expect(competenciaValida("01/2023")).toBe(true);
    expect(competenciaValida("13/2023")).toBe(false);
    expect(competenciaValida("1/2023")).toBe(false);
    expect(competenciaValida("2023-01")).toBe(false);
    expect(competenciaValida(null)).toBe(false);
  });

  it("normaliza vazio e inválido para null", () => {
    expect(normalizarCompetenciaFiltro("  ")).toBeNull();
    expect(normalizarCompetenciaFiltro("99/2023")).toBeNull();
    expect(normalizarCompetenciaFiltro(" 02/2024 ")).toBe("02/2024");
  });

  it("valida ordem do período", () => {
    expect(periodoCoerente("01/2023", "12/2023")).toBe(true);
    expect(periodoCoerente("12/2023", "01/2023")).toBe(false);
    expect(periodoCoerente(null, "01/2023")).toBe(true);
  });
});

describe("temas como fonte única dos termos", () => {
  const temas = [
    { nome: "Banco de Horas", termos: ["  Banco   DE Horas ", "banco de horas"] },
    { nome: "Confinamento", termos: ["Confinamento"] },
    { nome: "PPSP", termos: ["PPSP"] },
    { nome: "Vazio", termos: ["   "] },
  ];

  it("normaliza, deduplica e descarta temas sem termo", () => {
    expect(montarTemasPayload(temas, [])).toEqual([
      { tema: "Banco de Horas", termos: ["banco de horas"] },
      { tema: "Confinamento", termos: ["confinamento"] },
      { tema: "PPSP", termos: ["ppsp"] },
    ]);
  });

  it("respeita a seleção do filtro", () => {
    expect(montarTemasPayload(temas, ["PPSP"])).toEqual([{ tema: "PPSP", termos: ["ppsp"] }]);
  });
});

describe("segregação de fontes", () => {
  const casos = { itens: 10, pessoas: 3, empresas: 2, proventos: 100, descontos: 20 };
  const historico = { itens: 40, pessoas: 9, empresas: 5, proventos: 400, descontos: 50 };

  it("apresenta subtotais e alerta de sobreposição quando as duas fontes têm dados", () => {
    const r = consolidarTotais([
      { origem: "casos", estado: "ok", totais: casos },
      { origem: "historico", estado: "ok", totais: historico },
    ]);
    expect(r.somaSimples.itens).toBe(50);
    expect(r.somaSimples.proventos).toBe(500);
    expect(r.sobreposicaoNaoValidada).toBe(true);
    expect(r.parcial).toBe(false);
    expect(r.subtotais).toHaveLength(2);
  });

  it("marca estado parcial e ignora fonte indisponível na soma", () => {
    const r = consolidarTotais([
      { origem: "casos", estado: "ok", totais: casos },
      { origem: "historico", estado: "indisponivel", totais: { ...TOTAIS_ZERADOS } },
    ]);
    expect(r.parcial).toBe(true);
    expect(r.somaSimples.itens).toBe(10);
    expect(r.sobreposicaoNaoValidada).toBe(false);
  });

  it("não agrupa pessoas nem empresas entre bases", () => {
    expect(chaveLinha("casos", "abc")).not.toBe(chaveLinha("historico", "abc"));
    const fontes: ResultadoFonte<{ pessoa_id: string; pessoa_nome: string }>[] = [
      { origem: "casos", estado: "ok", dados: [{ pessoa_id: "1", pessoa_nome: "Maria" }] },
      { origem: "historico", estado: "ok", dados: [{ pessoa_id: "1", pessoa_nome: "Maria" }] },
      { origem: "historico", estado: "erro", dados: [{ pessoa_id: "9", pessoa_nome: "Ana" }] },
    ];
    const linhas = juntarLinhas(fontes);
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.origem)).toEqual(["casos", "historico"]);
  });
});

describe("rótulos de valores ausentes", () => {
  it("usa categoria explícita para empresa e pessoa sem nome", () => {
    expect(rotuloEmpresa(null)).toBe("(sem empresa)");
    expect(rotuloEmpresa("  ")).toBe("(sem empresa)");
    expect(rotuloEmpresa("Acelen")).toBe("Acelen");
    expect(rotuloPessoa(null)).toBe("(sem nome informado)");
  });
});
