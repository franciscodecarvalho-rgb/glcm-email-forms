import { describe, expect, it } from "vitest";
import { ehCompetenciaCanonica, normalizarCompetenciaAcelen } from "./competencia-acelen";
import { contrachequesRelacionaisParaRevisao, pendenciasCompetenciaAcelen } from "./contracheques-relacionais";

describe("normalizarCompetenciaAcelen", () => {
  it("converte os formatos brutos da extração/IA para MM/AAAA", () => {
    expect(normalizarCompetenciaAcelen("31/03/2023")).toBe("03/2023");
    expect(normalizarCompetenciaAcelen("2024-04-30")).toBe("04/2024");
    expect(normalizarCompetenciaAcelen("28/FEVEREIRO/2023")).toBe("02/2023");
    expect(normalizarCompetenciaAcelen("Recibo de Pagamento de MARÇO/2023")).toBe("03/2023");
    expect(normalizarCompetenciaAcelen("05/2023")).toBe("05/2023");
  });

  it("não inventa competência quando o valor é ilegível ou nulo", () => {
    expect(normalizarCompetenciaAcelen(null)).toBeNull();
    expect(normalizarCompetenciaAcelen("")).toBeNull();
    expect(normalizarCompetenciaAcelen("contracheques-unificados.pdf")).toBeNull();
    expect(ehCompetenciaCanonica("31/03/2023")).toBe(false);
    expect(ehCompetenciaCanonica("03/2023")).toBe(true);
  });
});

describe("revisão/planilha com contracheques Acelen", () => {
  it("consolida duas rubricas Acelen da mesma competência canônica", () => {
    expect(contrachequesRelacionaisParaRevisao([
      {
        id: "a1",
        competencia: "31/03/2023",
        modelo_origem: "acelen",
        arquivo_origem: "contracheques-unificados.pdf",
        itens_contracheque: [{ familia_hra: "hra", valor: 100, tipo: "provento" }],
      },
      {
        id: "a2",
        competencia: "03/2023",
        modelo_origem: "acelen",
        arquivo_origem: "contracheques-unificados.pdf",
        itens_contracheque: [{ familia_hra: "ahra", valor: 40, tipo: "provento" }],
      },
    ])).toEqual([{ id: "a1", label: "03/2023", valor_hra: 100, valor_ahra: 40 }]);
  });

  it("não gera linha HRA/AHRA rotulada pelo arquivo quando a competência Acelen é inválida", () => {
    const contras = [{
      id: "a3",
      competencia: null,
      modelo_origem: "acelen",
      arquivo_origem: "contracheques-unificados.pdf",
      itens_contracheque: [{ familia_hra: "hra", valor: 250, tipo: "provento" }],
    }];
    expect(contrachequesRelacionaisParaRevisao(contras)).toEqual([]);
    expect(pendenciasCompetenciaAcelen(contras)).toEqual([{
      id: "a3",
      arquivo_origem: "contracheques-unificados.pdf",
      motivo: "Contracheque Acelen com rubrica HRA/AHRA e competência ilegível: revisão técnica necessária.",
    }]);
  });

  it("preserva o comportamento dos demais modelos com competência bruta", () => {
    expect(contrachequesRelacionaisParaRevisao([{
      id: "u1",
      competencia: null,
      modelo_origem: "unigel",
      arquivo_origem: "folha.pdf",
      itens_contracheque: [{ familia_hra: "hra", valor: 10, tipo: "provento" }],
    }])).toEqual([{ id: "u1", label: "folha.pdf", valor_hra: 10, valor_ahra: 0 }]);
  });
});
