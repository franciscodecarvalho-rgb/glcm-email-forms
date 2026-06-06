import { describe, it, expect } from "vitest";
import { contrachequesLegadoParaMotor } from "./contracheques-legado";
import { calcularIrSobreHra } from "./calcular-ir-hra";

describe("contrachequesLegadoParaMotor", () => {
  it("mapeia label/valor_hra/valor_ahra para competências com rubricas HRA", () => {
    const out = contrachequesLegadoParaMotor([
      { label: "01/2024", valor_hra: 1000, valor_ahra: 200 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].competencia).toBe("01/2024");
    expect(out[0].itens).toHaveLength(2);
    expect(out[0].itens.every((i) => i.tipo === "provento")).toBe(true);
  });

  it("omite rubricas zeradas e tolera entrada nula", () => {
    expect(contrachequesLegadoParaMotor(null)).toEqual([]);
    const out = contrachequesLegadoParaMotor([{ label: "02/2024", valor_hra: 500, valor_ahra: 0 }]);
    expect(out[0].itens).toHaveLength(1);
  });

  it("alimenta o motor: total = (HRA + AHRA) * 27,5%", () => {
    const r = calcularIrSobreHra(
      contrachequesLegadoParaMotor([
        { label: "01/2024", valor_hra: 1000, valor_ahra: 200 },
        { label: "02/2024", valor_hra: 800, valor_ahra: 0 },
      ]),
    );
    // (1200 + 800) * 0,275 = 550
    expect(r.totalHistorico).toBeCloseTo(550, 2);
  });
});
