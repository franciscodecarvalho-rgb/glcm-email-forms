import { describe, expect, it } from "vitest";
import { configuracaoDocumentos, selecionarPecas, tipoProcuracao } from "./modelos-documentos";

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

describe("seleção de peças por tipo de ação", () => {
  const tiposDe = (tipo: string, escritorios: string[] = []) =>
    selecionarPecas(tipo, escritorios).map((p) => p.templateTipo);

  it("inclui declaração de pobreza apenas nas ações trabalhistas", () => {
    expect(tiposDe("horas_extras")).toContain("declaracao_pobreza");
    expect(tiposDe("supressao_folgas")).toContain("declaracao_pobreza");
    expect(tiposDe("ir_sobre_hra")).not.toContain("declaracao_pobreza");
    expect(tiposDe("contribuicao_extraordinaria")).not.toContain("declaracao_pobreza");
    expect(tiposDe("tema_324")).not.toContain("declaracao_pobreza");
  });

  it("preserva a ordem das peças nas trabalhistas", () => {
    expect(tiposDe("horas_extras", ["glcm"])).toEqual([
      "peticao_horas_extras",
      "contrato_trabalhista",
      "declaracao_pobreza",
      "termo_renuncia",
      "procuracao_trabalhista_glcm",
      "termo_lgpd_glcm",
    ]);
  });

  it("sem escritórios informados, gera as peças dos dois", () => {
    expect(tiposDe("ir_sobre_hra")).toEqual([
      "peticao_ir_sobre_hra",
      "contrato_tributario",
      "termo_renuncia",
      "procuracao_tributaria_glcm",
      "termo_lgpd_glcm",
      "procuracao_tributaria_polkowski",
      "termo_lgpd_polkowski",
    ]);
  });

  it("restringe as peças ao escritório informado", () => {
    expect(tiposDe("supressao_folgas", ["polkowski"])).toEqual([
      "peticao_supressao_folgas",
      "contrato_supressao_folgas",
      "declaracao_pobreza",
      "termo_renuncia",
      "procuracao_trabalhista_polkowski",
      "termo_lgpd_polkowski",
    ]);
  });

  it("tipo desconhecido lança erro em vez de inventar configuração", () => {
    expect(() => selecionarPecas("desconhecido", [])).toThrow("Tipo de ação sem modelos configurados");
  });
});
