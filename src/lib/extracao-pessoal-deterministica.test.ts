import { describe, expect, it } from "vitest";
import { dadosPessoaisSuficientes, extrairDadosPessoaisDeterministicos, normalizarCpfValido } from "./extracao-pessoal-deterministica";

describe("extração pessoal determinística", () => {
  it("aceita CPF válido associado ao titular sem exigir IA", () => {
    const dados = extrairDadosPessoaisDeterministicos("CARTEIRA DE IDENTIDADE\nNOME: MARIA APARECIDA DA SILVA\nCPF: 529.982.247-25\nRG: 12.345.678-9");
    expect(dadosPessoaisSuficientes(dados)).toBe(true);
    expect(dados.cpf).toBe("52998224725");
  });
  it("rejeita CPF matematicamente inválido e exige fallback", () => {
    const dados = extrairDadosPessoaisDeterministicos("NOME: MARIA APARECIDA DA SILVA\nCPF: 111.111.111-11");
    expect(normalizarCpfValido("111.111.111-11")).toBeNull();
    expect(dadosPessoaisSuficientes(dados)).toBe(false);
  });
  it("aceita endereço apenas em comprovante", () => {
    const dados = extrairDadosPessoaisDeterministicos("COMPROVANTE DE RESIDÊNCIA\nRua das Flores, 10\n22000-000\nCPF: 529.982.247-25\nNOME: MARIA APARECIDA DA SILVA");
    expect(dados.endereco?.cep).toBe("22000-000");
    expect(dadosPessoaisSuficientes(dados)).toBe(true);
  });
});
