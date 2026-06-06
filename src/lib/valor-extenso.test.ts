import { describe, it, expect } from "vitest";
import { extensoInteiro, valorPorExtenso } from "./valor-extenso";

describe("extensoInteiro", () => {
  it("números pequenos", () => {
    expect(extensoInteiro(0)).toBe("zero");
    expect(extensoInteiro(1)).toBe("um");
    expect(extensoInteiro(15)).toBe("quinze");
    expect(extensoInteiro(21)).toBe("vinte e um");
    expect(extensoInteiro(100)).toBe("cem");
    expect(extensoInteiro(101)).toBe("cento e um");
    expect(extensoInteiro(250)).toBe("duzentos e cinquenta");
  });

  it("milhares", () => {
    expect(extensoInteiro(1000)).toBe("mil");
    expect(extensoInteiro(2050)).toBe("dois mil e cinquenta");
    expect(extensoInteiro(1100)).toBe("mil e cem");
    expect(extensoInteiro(36650)).toBe("trinta e seis mil, seiscentos e cinquenta");
  });

  it("milhões", () => {
    expect(extensoInteiro(1_000_000)).toBe("um milhão");
    expect(extensoInteiro(1_000_500)).toBe("um milhão e quinhentos");
  });
});

describe("valorPorExtenso", () => {
  it("reais e centavos", () => {
    expect(valorPorExtenso(0)).toBe("zero reais");
    expect(valorPorExtenso(1)).toBe("um real");
    expect(valorPorExtenso(0.81)).toBe("oitenta e um centavos");
    expect(valorPorExtenso(100)).toBe("cem reais");
    expect(valorPorExtenso(1.5)).toBe("um real e cinquenta centavos");
  });

  it("reproduz o valor da causa do caso Ruan", () => {
    expect(valorPorExtenso(36650.81)).toBe(
      "trinta e seis mil, seiscentos e cinquenta reais e oitenta e um centavos",
    );
  });

  it("trata arredondamento de centavos", () => {
    // 1.999 -> 2,00
    expect(valorPorExtenso(1.999)).toBe("dois reais");
  });
});
