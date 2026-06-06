import { describe, it, expect } from "vitest";
import { calcularIrSobreHra, type CompetenciaInput } from "./calcular-ir-hra";

// Descrições reais das rubricas (com a coluna a que pertencem na planilha).
const ADIC = "Adicional HRA";
const EVENTUAL = "Adic HRA Eventual";
const DOBRA = "AHRA/Dobra de Turno";
const DIF = "Dif AHRA Dobra";

const provento = (descricao: string, valor: number) =>
  ({ descricao, valor, tipo: "provento" as const });

describe("calcularIrSobreHra — caso Ruan (planilha PDF)", () => {
  // Meses retirados da planilha real (DOC. 06) — valores conferem com a coluna
  // "VALOR (HISTÓRICO)" exibida no PDF.
  const meses: CompetenciaInput[] = [
    { competencia: "2021-01", itens: [provento(ADIC, 1612.88), provento(DOBRA, 53.76)] },
    { competencia: "2025-04", itens: [provento(ADIC, 2406.03), provento(DOBRA, 240.6), provento(DIF, 1605.08)] },
    { competencia: "2025-07", itens: [provento(ADIC, 2406.03), provento(DOBRA, 561.4), provento(DIF, 712.02)] },
  ];

  it("reproduz o IR mensal de cada competência", () => {
    const r = calcularIrSobreHra(meses);
    expect(r.linhas[0].irMes).toBeCloseTo(458.33, 2); // jan/21
    expect(r.linhas[1].irMes).toBeCloseTo(1169.22, 2); // abr/25 (com Dif)
    expect(r.linhas[2].irMes).toBeCloseTo(1011.85, 2); // jul/25 (com Dif)
  });

  it("usa alíquota fixa de 27,5%", () => {
    expect(calcularIrSobreHra(meses).aliquota).toBe(0.275);
  });
});

describe("calcularIrSobreHra — caso Leonardo (o bug das colunas)", () => {
  // 6 primeiros meses da planilha .xlsx real do Leonardo.
  // Colunas: [Adicional HRA, Adic HRA Eventual, AHRA Dobra, Dif AHRA Dobra].
  // A planilha manual ESQUECEU a coluna "Adic HRA Eventual" na soma e
  // subestimou o pedido. O motor soma TODAS as famílias HRA.
  const linhas: Array<[number, number, number, number]> = [
    [0, 2903.56, 131.98, 0],
    [0, 3959.41, 0, 0],
    [0, 3959.41, 395.94, 0],
    [3959.41, 3959.41, 0, 0],
    [3959.41, 0, 0, 0],
    [1319.8, 0, 0, 0],
  ];

  // R5 usa uma variante de OCR de propósito ("Tumo"), para provar que a
  // tolerância de OCR contribui para o total correto.
  const dobraDescDe = (i: number) => (i === 2 ? "AHRA/Dobra de Tumo" : DOBRA);

  const competencias: CompetenciaInput[] = linhas.map(([a, e, d, f], i) => {
    const itens = [];
    if (a) itens.push(provento(ADIC, a));
    if (e) itens.push(provento(EVENTUAL, e));
    if (d) itens.push(provento(dobraDescDe(i), d));
    if (f) itens.push(provento(DIF, f));
    return { competencia: `2023-0${i + 1}`, itens };
  });

  it("inclui a coluna 'Adic HRA Eventual' na base (não comete o bug)", () => {
    const r = calcularIrSobreHra(competencias);
    // Correto = (soma de TODAS as 4 colunas) * 27,5%
    expect(r.totalHistorico).toBeCloseTo(6750.79, 2);
    // O valor ERRADO da planilha manual (ignorando Eventual) seria 2685.80.
    expect(r.totalHistorico).not.toBeCloseTo(2685.8, 2);
  });
});

describe("calcularIrSobreHra — exclusões", () => {
  it("ignora descontos, rubricas não-HRA e variantes Sem IR", () => {
    const competencias: CompetenciaInput[] = [
      {
        competencia: "2024-01",
        itens: [
          provento(ADIC, 1000), // conta
          provento("Salário Básico", 5000), // não é HRA
          { descricao: "Desc. Adicional HRA", valor: 200, tipo: "desconto" }, // desconto
          provento("AHRA (Sem/IR)", 300), // Sem IR
          { descricao: "INSS", valor: 400, tipo: "desconto" },
        ],
      },
    ];
    const r = calcularIrSobreHra(competencias);
    expect(r.linhas[0].baseHra).toBeCloseTo(1000, 2);
    expect(r.totalHistorico).toBeCloseTo(275, 2); // 1000 * 0.275
  });

  it("retorna total zero quando não há rubrica HRA", () => {
    const r = calcularIrSobreHra([
      { competencia: "2024-02", itens: [provento("Salário Básico", 5000)] },
    ]);
    expect(r.totalHistorico).toBe(0);
  });
});
