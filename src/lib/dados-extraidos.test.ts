import { describe, expect, it } from "vitest";
import { dadosEsperadosForamExtraidos } from "./dados-extraidos";
import { cpfValido } from "./cpf";

const casoBase = {
  nome_cliente: "Cliente Teste",
  cpf: "52998224725",
  rg: "1234567",
  endereco: { logradouro: "Rua de Teste, 10" },
  contracheques_extraidos: [{ id: "contra-1", itens_contracheque: [{ id: "item-1" }] }],
};

describe("dadosEsperadosForamExtraidos", () => {
  it("considera completo quando identificação e rubricas foram persistidas", () => {
    expect(dadosEsperadosForamExtraidos(casoBase as never)).toBe(true);
  });

  it.each(["nome_cliente", "cpf"])("exige o campo %s", (campo) => {
    expect(dadosEsperadosForamExtraidos({ ...casoBase, [campo]: null } as never)).toBe(false);
  });

  it("não exige RG quando existe um CPF válido", () => {
    expect(dadosEsperadosForamExtraidos({ ...casoBase, rg: null } as never)).toBe(true);
  });

  it("continua exigindo CPF válido mesmo quando há RG", () => {
    expect(dadosEsperadosForamExtraidos({ ...casoBase, cpf: null, rg: "1234567" } as never)).toBe(false);
  });

  it("exige ao menos uma rubrica persistida", () => {
    expect(dadosEsperadosForamExtraidos({
      ...casoBase,
      contracheques_extraidos: [{ id: "contra-1", itens_contracheque: [] }],
    } as never)).toBe(false);
  });

  it("abre a confirmação manual quando o endereço não foi extraído", () => {
    expect(dadosEsperadosForamExtraidos({ ...casoBase, endereco: null } as never)).toBe(false);
    expect(dadosEsperadosForamExtraidos({ ...casoBase, endereco: { logradouro: " " } } as never)).toBe(false);
  });
});

describe("cpfValido", () => {
  it("valida CPFs com dígitos verificadores corretos, com ou sem pontuação", () => {
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-25")).toBe(true);
  });

  it.each([null, "", "12345678901", "11111111111", "52998224724"])(
    "rejeita CPF inválido: %s",
    (cpf) => expect(cpfValido(cpf)).toBe(false),
  );
});
