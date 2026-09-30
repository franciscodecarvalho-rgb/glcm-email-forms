import { describe, expect, it } from "vitest";
import { documentoPessoalUsaIa, temDadosPessoaisUtilizaveis } from "../../supabase/functions/_shared/personal-extraction-policy";

describe("política de IA para documentos pessoais", () => {
  it.each(["comprovante_residencia", "cnh", "rg", "cin", "cpf", "outro"])(
    "encaminha %s à IA",
    (tipo) => expect(documentoPessoalUsaIa(tipo)).toBe(true),
  );

  it("nunca encaminha contracheques à IA de documentos pessoais", () => {
    expect(documentoPessoalUsaIa("contracheque")).toBe(false);
  });

  it("considera útil uma extração parcial de nome, documento ou endereço", () => {
    expect(temDadosPessoaisUtilizaveis({ nome: "ANA MARIA" })).toBe(true);
    expect(temDadosPessoaisUtilizaveis({ rg: "1234567" })).toBe(true);
    expect(temDadosPessoaisUtilizaveis({ endereco: { cep: "41750-240" } })).toBe(true);
  });

  it("não considera resposta vazia como extração concluída", () => {
    expect(temDadosPessoaisUtilizaveis({ nome: "", cpf: "", rg: "", endereco: {} })).toBe(false);
  });
});
