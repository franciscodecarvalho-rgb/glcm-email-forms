import { describe, expect, it } from "vitest";
import { mesclarLeituraComprovante } from "../../supabase/functions/_shared/merge-personal-extraction";

const cpfValido = (value: unknown) => value === "529.982.247-25" || value === "52998224725"
  ? "52998224725"
  : null;

describe("mesclagem da leitura de comprovantes", () => {
  it("preserva nome e CPF do texto quando Gemini só retorna endereço", () => {
    const dados = mesclarLeituraComprovante(
      { tipo_documento: "comprovante_residencia", nome: "MARIA APARECIDA", cpf: "529.982.247-25", endereco: { cep: "41750-240" } },
      { tipo_documento: "comprovante_residencia", nome: "", cpf: "", rg: "", endereco: { logradouro: "AV OCTAVIO MANGABEIRA", numero: "3551 AP-621", bairro: "ARMACAO", cidade: "SALVADOR", estado: "BA" } },
      cpfValido,
    );

    expect(dados.nome).toBe("MARIA APARECIDA");
    expect(dados.cpf).toBe("52998224725");
    expect(dados.endereco).toEqual({
      logradouro: "AV OCTAVIO MANGABEIRA",
      numero: "3551 AP-621",
      bairro: "ARMACAO",
      cidade: "SALVADOR",
      estado: "BA",
      cep: "41750-240",
    });
  });

  it("prioriza campos legíveis pelo Gemini e rejeita CPF inválido antes do fallback", () => {
    const dados = mesclarLeituraComprovante(
      { nome: "NOME DO TEXTO", cpf: "111.111.111-11", rg: null, endereco: { cidade: "SALVADOR", cep: "41750-240" } },
      { nome: "NOME DO TITULAR", cpf: "529.982.247-25", endereco: { cidade: "LAURO DE FREITAS" } },
      cpfValido,
    );

    expect(dados.nome).toBe("NOME DO TITULAR");
    expect(dados.cpf).toBe("52998224725");
    expect(dados.endereco).toEqual({ cidade: "LAURO DE FREITAS", cep: "41750-240" });
  });

  it("não inventa dados pessoais ausentes e ainda preserva o endereço determinístico", () => {
    const dados = mesclarLeituraComprovante(
      { nome: null, cpf: null, rg: null, endereco: { logradouro: "RUA DAS FLORES, 10", cep: "22000-000" } },
      { nome: "", cpf: "", rg: "", endereco: {} },
      cpfValido,
    );

    expect(dados.nome).toBe("");
    expect(dados.cpf).toBe("");
    expect(dados.endereco).toEqual({ logradouro: "RUA DAS FLORES, 10", cep: "22000-000" });
  });
});
