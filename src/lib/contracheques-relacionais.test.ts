import { describe, expect, it } from "vitest";
import { contrachequesRelacionaisParaRevisao } from "./contracheques-relacionais";

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
