import { describe, it, expect } from "vitest";
import { processarContracheques, deduplicarEmpregadores } from "./processar-extracao";
import { calcularIrSobreHra } from "./calcular-ir-hra";

describe("processarContracheques", () => {
  it("classifica família HRA e normaliza tipos", () => {
    const out = processarContracheques([
      {
        competencia: "2024-07",
        liquido: 5000,
        arquivo_origem: "contracheque.pdf",
        itens: [
          { codigo: "1062", descricao: "Adicional HRA", valor: 2182.57, tipo: "provento" },
          { codigo: "0208", descricao: "AHRA/Dobra de Turno", valor: 436.5 },
          { codigo: "0001", descricao: "Salário Básico", valor: 8000, tipo: "provento" },
          { codigo: "0985", descricao: "Desc INSS", valor: 900, tipo: "desconto" },
        ],
      },
    ]);

    expect(out).toHaveLength(1);
    const itens = out[0].itens;
    expect(itens[0].familia_hra).toBe("adicional_hra");
    expect(itens[1].familia_hra).toBe("ahra_dobra");
    expect(itens[1].tipo).toBe("provento"); // default quando ausente
    expect(itens[2].familia_hra).toBeNull(); // salário não é HRA
    expect(itens[3].tipo).toBe("desconto");
  });

  it("tolera entrada vazia/nula", () => {
    expect(processarContracheques(null)).toEqual([]);
    expect(processarContracheques([{ competencia: "2024-01" }])[0].itens).toEqual([]);
  });

  it("alimenta o motor de cálculo (extração → IR)", () => {
    const proc = processarContracheques([
      {
        competencia: "2025-04",
        itens: [
          { descricao: "Adicional HRA", valor: 2406.03, tipo: "provento" },
          { descricao: "AHRA/Dobra de Turno", valor: 240.6, tipo: "provento" },
          { descricao: "Dif AHRA Dobra", valor: 1605.08, tipo: "provento" },
          { descricao: "Salário Básico", valor: 8000, tipo: "provento" },
        ],
      },
    ]);
    // mapeia o processado para a entrada do motor
    const r = calcularIrSobreHra(
      proc.map((c) => ({ competencia: c.competencia ?? "", itens: c.itens })),
    );
    // (2406.03 + 240.60 + 1605.08) * 0,275 = 1169.22 (igual à planilha do Ruan)
    expect(r.totalHistorico).toBeCloseTo(1169.22, 2);
  });
});

describe("deduplicarEmpregadores", () => {
  it("deduplica por CNPJ (ignorando pontuação) e nome", () => {
    const out = deduplicarEmpregadores([
      { razao_social: "BRASKEM S.A.", cnpj: "42.150.391/0001-00" },
      { razao_social: "BRASKEM SA", cnpj: "42150391000100" },
      { razao_social: "PETROS", cnpj: "00.117.993/0001-00" },
    ]);
    expect(out).toHaveLength(2);
  });
});
