import { describe, expect, it } from "vitest";
import { dadosEsperadosForamExtraidos } from "./dados-extraidos";

const casoBase = {
  nome_cliente: "Cliente Teste",
  cpf: "12345678901",
  rg: "1234567",
  contracheques_extraidos: [{ id: "contra-1", itens_contracheque: [{ id: "item-1" }] }],
};

describe("dadosEsperadosForamExtraidos", () => {
  it("considera completo quando identificação e rubricas foram persistidas", () => {
    expect(dadosEsperadosForamExtraidos(casoBase as never)).toBe(true);
  });

  it.each(["nome_cliente", "cpf", "rg"])("exige o campo %s", (campo) => {
    expect(dadosEsperadosForamExtraidos({ ...casoBase, [campo]: null } as never)).toBe(false);
  });

  it("exige ao menos uma rubrica persistida", () => {
    expect(dadosEsperadosForamExtraidos({
      ...casoBase,
      contracheques_extraidos: [{ id: "contra-1", itens_contracheque: [] }],
    } as never)).toBe(false);
  });
});
