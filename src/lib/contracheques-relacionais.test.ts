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
        { familia_hra: "adicional_hra", valor: 100 },
        { familia_hra: "hra", valor: 50 },
        { familia_hra: "ahra_dobra", valor: 25 },
        { familia_hra: null, valor: 900 },
      ],
    }])).toEqual([{
      id: "contra-1",
      label: "03/2026",
      valor_hra: 150,
      valor_ahra: 25,
    }]);
  });

  it("mantém o contracheque visível quando nenhuma rubrica HRA foi localizada", () => {
    expect(contrachequesRelacionaisParaRevisao([{
      id: "contra-2",
      competencia: null,
      arquivo_origem: "modelo.pdf",
      itens_contracheque: [],
    }])).toEqual([{
      id: "contra-2",
      label: "modelo.pdf",
      valor_hra: 0,
      valor_ahra: 0,
    }]);
  });
});
