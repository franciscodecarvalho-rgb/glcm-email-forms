import { describe, expect, it } from "vitest";
import { configuracaoDocumentos, tipoProcuracao } from "./modelos-documentos";

describe("seleção de modelos por tipo de ação", () => {
  it.each([
    ["ir_sobre_hra", "tributaria", "peticao_ir_sobre_hra", "contrato_tributario"],
    ["contribuicao_extraordinaria", "tributaria", "peticao_contribuicao_extraordinaria", "contrato_contribuicao_extraordinaria"],
    ["tema_324", "tributaria", "peticao_tema_324", "contrato_tributario"],
    ["horas_extras", "trabalhista", "peticao_horas_extras", "contrato_trabalhista"],
    ["supressao_folgas", "trabalhista", "peticao_supressao_folgas", "contrato_supressao_folgas"],
  ])("mapeia %s", (tipo, natureza, peticao, contrato) => {
    expect(configuracaoDocumentos(tipo)).toEqual({ natureza, peticao, contrato });
  });

  it("não inventa configuração para tipo desconhecido", () => {
    expect(configuracaoDocumentos("desconhecido")).toBeNull();
  });

  it("seleciona procuração por natureza e escritório", () => {
    expect(tipoProcuracao("tributaria", "glcm")).toBe("procuracao_tributaria_glcm");
    expect(tipoProcuracao("trabalhista", "polkowski")).toBe("procuracao_trabalhista_polkowski");
  });
});
