import { describe, expect, it } from "vitest";
import {
  contrachequesRelacionaisParaRevisao,
  montarContrachequesRelacionais,
} from "./contracheques-relacionais";

describe("montarContrachequesRelacionais", () => {
  it("associa a cada contracheque somente as rubricas persistidas com sua chave", () => {
    expect(montarContrachequesRelacionais(
      [{ id: "contra-1" }, { id: "contra-2" }],
      [
        { id: "item-2", contracheque_id: "contra-2", descricao: "IRRF", valor: 20 },
        { id: "item-1", contracheque_id: "contra-1", descricao: "Salário", valor: 100 },
      ],
    )).toEqual([
      {
        id: "contra-1",
        itens_contracheque: [{ id: "item-1", contracheque_id: "contra-1", descricao: "Salário", valor: 100 }],
      },
      {
        id: "contra-2",
        itens_contracheque: [{ id: "item-2", contracheque_id: "contra-2", descricao: "IRRF", valor: 20 }],
      },
    ]);
  });
});

describe("contrachequesRelacionaisParaRevisao", () => {
  it("converte rubricas HRA e AHRA das tabelas relacionais para a tela de revisão", () => {
    expect(contrachequesRelacionaisParaRevisao([{
      id: "contra-1",
      competencia: "03/2026",
      arquivo_origem: "folha.pdf",
      itens_contracheque: [
        { codigo: "023", descricao: "Vlr Adicional HRA S Hextra", familia_hra: "adicional_hra", valor: 100 },
        { familia_hra: "hra", valor: 50 },
        { familia_hra: "ahra_dobra", valor: 25 },
        { familia_hra: null, valor: 900 },
      ],
    }])).toEqual([{
      id: "contra-1",
      label: "03/2026",
      valor_hra: 50,
      valor_ahra: 125,
    }]);
  });

  it("exclui descontos HRA/AHRA da base, sem reduzir o total", () => {
    expect(contrachequesRelacionaisParaRevisao([{
      id: "contra-3",
      competencia: "04/2026",
      itens_contracheque: [
        { familia_hra: "adicional_hra", valor: 500, tipo: "provento" },
        { familia_hra: "adicional_hra", valor: 120, tipo: "desconto" },
        { familia_hra: "ahra_dobra", valor: 80, tipo: "provento" },
        { familia_hra: "ahra_dobra", valor: 30, tipo: "desconto" },
      ],
    }])).toEqual([{
      id: "contra-3",
      label: "04/2026",
      valor_hra: 0,
      valor_ahra: 580,
    }]);
  });

  it("omite a competência que só tem desconto HRA (caso 5522, 03/2021)", () => {
    expect(contrachequesRelacionaisParaRevisao([{
      id: "contra-5522",
      competencia: "03/2021",
      itens_contracheque: [
        { codigo: "1004", familia_hra: "hra", valor: 949.02, tipo: "desconto" },
      ],
    }])).toEqual([]);
  });

  it("omite o contracheque quando nenhuma rubrica HRA foi localizada", () => {
    expect(contrachequesRelacionaisParaRevisao([{
      id: "contra-2",
      competencia: null,
      arquivo_origem: "modelo.pdf",
      itens_contracheque: [],
    }])).toEqual([]);
  });

  it("mantém a competência com HRA ou AHRA positivo", () => {
    expect(contrachequesRelacionaisParaRevisao([
      {
        id: "contra-so-hra",
        competencia: "05/2026",
        itens_contracheque: [{ familia_hra: "hra", valor: 10, tipo: "provento" }],
      },
      {
        id: "contra-so-ahra",
        competencia: "06/2026",
        itens_contracheque: [{ familia_hra: "ahra_dobra", valor: 7, tipo: "provento" }],
      },
    ])).toEqual([
      { id: "contra-so-hra", label: "05/2026", valor_hra: 10, valor_ahra: 0 },
      { id: "contra-so-ahra", label: "06/2026", valor_hra: 0, valor_ahra: 7 },
    ]);
  });
  it("soma a família \"ahra\" (Petrobras) na coluna AHRA", () => {
    expect(contrachequesRelacionaisParaRevisao([{
      id: "contra-pb",
      competencia: "07/2024",
      itens_contracheque: [
        { familia_hra: "ahra", valor: 300, tipo: "provento" },
        { familia_hra: "ahra", valor: 100, tipo: "desconto" },
        { familia_hra: "hra", valor: 50, tipo: "provento" },
      ],
    }])).toEqual([{ id: "contra-pb", label: "07/2024", valor_hra: 50, valor_ahra: 300 }]);
  });
});

describe("consolidação de competências duplicadas", () => {
  it("soma HRA e AHRA de contracheques da mesma competência em uma única linha", () => {
    expect(contrachequesRelacionaisParaRevisao([
      {
        id: "contra-a",
        competencia: "09/2024",
        itens_contracheque: [
          { familia_hra: "hra", valor: 484.2 },
          { familia_hra: "ahra_dobra", valor: 10 },
        ],
      },
      {
        id: "contra-b",
        competencia: "09/2024",
        itens_contracheque: [
          { familia_hra: "hra", valor: 463.36 },
          { familia_hra: "ahra_dobra", valor: 5 },
        ],
      },
      {
        id: "contra-c",
        competencia: null,
        arquivo_origem: "avulso.pdf",
        itens_contracheque: [{ familia_hra: "hra", valor: 100 }],
      },
    ])).toEqual([
      { id: "contra-a", label: "09/2024", valor_hra: 947.56, valor_ahra: 15 },
      { id: "contra-c", label: "avulso.pdf", valor_hra: 100, valor_ahra: 0 },
    ]);
  });
});
