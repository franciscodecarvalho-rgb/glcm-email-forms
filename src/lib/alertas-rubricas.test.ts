import { describe, expect, it } from "vitest";
import { CODIGOS_ALERTA, encontrarRubricasAlerta, encontrarRubricasSemIr } from "./alertas-rubricas";

const cc = (competencia: string, itens: { codigo?: string | null; descricao?: string | null; referencia?: number | null; valor?: number | null }[]) => ({
  id: `cc-${competencia}`,
  competencia,
  itens_contracheque: itens.map((i, idx) => ({ id: `${competencia}-${idx}`, ...i })),
});

describe("encontrarRubricasAlerta", () => {
  it("retorna vazio quando não há contracheques", () => {
    expect(encontrarRubricasAlerta(null)).toEqual([]);
    expect(encontrarRubricasAlerta([])).toEqual([]);
  });

  it("ignora códigos fora da lista de alerta", () => {
    expect(
      encontrarRubricasAlerta([cc("01/2024", [{ codigo: "1010" }, { codigo: "9999" }])]),
    ).toEqual([]);
  });

  it("encontra os três códigos monitorados, na ordem da lista", () => {
    const alertas = encontrarRubricasAlerta([
      cc("01/2024", [
        { codigo: "6050", descricao: "BANCO DE HORAS COMPENSACAO" },
        { codigo: "1059", descricao: "ADICIONAL PERICULOSIDADE" },
      ]),
      cc("02/2024", [{ codigo: "1513", descricao: "BANCO DE HORAS" }]),
    ]);
    expect(alertas.map((a) => a.codigo)).toEqual(["1059", "1513", "6050"]);
  });

  it("agrupa ocorrências da mesma rubrica e consolida quantidade e valor", () => {
    const alertas = encontrarRubricasAlerta([
      cc("01/2024", [{ codigo: "1513", descricao: "BANCO DE HORAS", referencia: 3, valor: 15000.5 }]),
      cc("02/2024", [
        { codigo: "1513", referencia: 5, valor: -43947.31 },
        { codigo: "1513", descricao: "OUTRA", referencia: 0, valor: 0 },
      ]),
    ]);
    expect(alertas).toEqual([
      { codigo: "1513", descricao: "BANCO DE HORAS", quantidadeTotal: 8, valorTotal: 58947.81 },
    ]);
  });

  it("tolera código com espaço e item sem código", () => {
    const alertas = encontrarRubricasAlerta([
      cc("03/2024", [{ codigo: " 1059 " }, { codigo: null }, { descricao: "sem codigo" }]),
    ]);
    expect(alertas.map((a) => a.codigo)).toEqual(["1059"]);
  });

  it("aceita lista de códigos customizada", () => {
    const alertas = encontrarRubricasAlerta(
      [cc("01/2024", [{ codigo: "1059" }, { codigo: "7777" }])],
      ["7777"],
    );
    expect(alertas.map((a) => a.codigo)).toEqual(["7777"]);
  });

  it("a lista padrão é 1059, 1513, 6050", () => {
    expect(CODIGOS_ALERTA).toEqual(["1059", "1513", "6050"]);
  });
});

describe("encontrarRubricasSemIr", () => {
  it("retorna vazio quando não há rubricas HRA Sem IR", () => {
    expect(encontrarRubricasSemIr(null)).toEqual({ linhas: [], total: 0 });
    expect(
      encontrarRubricasSemIr([cc("01/2024", [{ codigo: "0001", descricao: "Salário Básico", valor: 1000 }])]),
    ).toEqual({ linhas: [], total: 0 });
  });

  it("ignora rubricas HRA normais (com IR retido)", () => {
    expect(
      encontrarRubricasSemIr([cc("01/2024", [{ codigo: "1062", descricao: "Adicional HRA", valor: 500 }])]),
    ).toEqual({ linhas: [], total: 0 });
  });

  it("lista as linhas HRA/AHRA marcadas Sem IR e soma o total", () => {
    const resultado = encontrarRubricasSemIr([
      cc("01/2024", [
        { codigo: "3100", descricao: "AHRA (Sem/IR)", valor: -300 },
        { codigo: "1062", descricao: "Adicional HRA", valor: 500 },
      ]),
      cc("02/2024", [{ codigo: "1104", descricao: "HRA Dec.Jud. Seg. s/IRRF", valor: 120 }]),
    ]);
    expect(resultado.linhas).toEqual([
      { competencia: "01/2024", codigo: "3100", descricao: "AHRA (Sem/IR)", valor: 300 },
      { competencia: "02/2024", codigo: "1104", descricao: "HRA Dec.Jud. Seg. s/IRRF", valor: 120 },
    ]);
    expect(resultado.total).toBe(420);
  });
});
