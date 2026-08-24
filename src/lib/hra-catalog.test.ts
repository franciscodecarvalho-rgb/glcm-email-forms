import { describe, it, expect } from "vitest";
import { classificarRubrica, contaNoCalculoHra } from "./hra-catalog";

describe("classificarRubrica", () => {
  it("classifica as famílias HRA principais", () => {
    expect(classificarRubrica("1062", "Adicional HRA").familia).toBe("adicional_hra");
    expect(classificarRubrica("0207", "Adic HRA Eventual").familia).toBe("adicional_hra");
    expect(classificarRubrica("0208", "AHRA/Dobra de Turno").familia).toBe("ahra_dobra");
    expect(classificarRubrica("4208", "Dif AHRA Dobra").familia).toBe("dif_ahra");
    expect(classificarRubrica("3008", "AHRA").familia).toBe("ahra");
    expect(classificarRubrica("0077", "HRA").familia).toBe("hra");
  });

  it("tolera ruído de OCR", () => {
    expect(classificarRubrica("0208", "AHRA/Dobra de Tumo").familia).toBe("ahra_dobra");
    expect(classificarRubrica("1062", "AdiconalHRA").familia).toBe("adicional_hra");
    expect(classificarRubrica("1062", "Adicionál HRA").familia).toBe("adicional_hra");
    expect(classificarRubrica("0208", "AMHRANDOta de Tumo").familia).not.toBeNull();
  });

  it("marca variantes 'Sem IR' para exclusão", () => {
    expect(classificarRubrica("3100", "AHRA (Sem/IR)").semIr).toBe(true);
    expect(classificarRubrica("3379", "AHRA-SEM IRRF").semIr).toBe(true);
    expect(classificarRubrica("1104", "HRA Dec.Jud. Seg. s/IRRF").semIr).toBe(true);
    expect(classificarRubrica("1062", "Adicional HRA").semIr).toBe(false);
  });

  it("não confunde 'S Hextra' (sobre hora extra) com 'Sem IR'", () => {
    expect(classificarRubrica("023", "Vlr Adicional HRA S Hextra").semIr).toBe(false);
  });

  it("retorna null para rubricas que não são HRA", () => {
    expect(classificarRubrica("0001", "Salário Básico").familia).toBeNull();
    expect(classificarRubrica("0985", "Petros II Contr Regular").familia).toBeNull();
    expect(classificarRubrica(null, "INSS").familia).toBeNull();
  });

  it("reconhece os códigos confirmados mesmo sem 'hra' na descrição", () => {
    expect(classificarRubrica("1062", "Verba 1062").familia).not.toBeNull();
    expect(classificarRubrica("0208", "Verba 0208").familia).not.toBeNull();
    expect(classificarRubrica("4208", "Verba 4208").familia).not.toBeNull();
    expect(classificarRubrica("062A", "Verba 062A").familia).not.toBeNull();
    expect(classificarRubrica("2208", "Verba 2208").familia).not.toBeNull();
  });
});

describe("contaNoCalculoHra", () => {
  it("inclui proventos HRA normais", () => {
    expect(contaNoCalculoHra({ descricao: "Adicional HRA", tipo: "provento" })).toBe(true);
    expect(contaNoCalculoHra({ descricao: "Adic HRA Eventual", tipo: "provento" })).toBe(true);
  });

  it("exclui descontos, mesmo de HRA", () => {
    expect(contaNoCalculoHra({ descricao: "Desc. Adicional HRA", tipo: "desconto" })).toBe(false);
    expect(contaNoCalculoHra({ descricao: "Desc. AHRA Dobra", tipo: "desconto" })).toBe(false);
  });

  it("exclui variantes Sem IR e rubricas não-HRA", () => {
    expect(contaNoCalculoHra({ descricao: "AHRA (Sem/IR)", tipo: "provento" })).toBe(false);
    expect(contaNoCalculoHra({ descricao: "Salário Básico", tipo: "provento" })).toBe(false);
  });
});
