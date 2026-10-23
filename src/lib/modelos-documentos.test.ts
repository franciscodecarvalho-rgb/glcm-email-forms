import { describe, expect, it } from "vitest";
import { configuracaoDocumentos, nomeArquivoGerado, rotuloAcaoArquivo, selecionarPecas, tipoProcuracao } from "./modelos-documentos";

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

describe("nomenclatura dos arquivos gerados", () => {
  it("rótulo de ação segue o comportamento atual da planilha", () => {
    expect(rotuloAcaoArquivo("ir_sobre_hra")).toBe("IR SOBRE HRA");
    expect(rotuloAcaoArquivo("horas_extras")).toBe("IR SOBRE HRA");
    expect(rotuloAcaoArquivo("supressao_folgas")).toBe("IR SOBRE HRA");
    expect(rotuloAcaoArquivo("tema_324")).toBe("IR SOBRE HRA");
    expect(rotuloAcaoArquivo("contribuicao_extraordinaria")).toBe("IR SOBRE CONTRIBUIÇÃO EXTRAORDINÁRIA");
  });

  it("monta o nome no padrão Tipo — Cliente — Ação.ext", () => {
    expect(
      nomeArquivoGerado("procuracao_polkowski", "DANIEL RICARDO SIMOES DE MENEZES", "ir_sobre_hra", "docx"),
    ).toBe("Procuração Polkowski — DANIEL RICARDO SIMOES DE MENEZES — IR SOBRE HRA.docx");
    expect(nomeArquivoGerado("peticao", "FULANO", "ir_sobre_hra", "docx"))
      .toBe("Petição Inicial — FULANO — IR SOBRE HRA.docx");
    expect(nomeArquivoGerado("termo_lgpd_glcm", "FULANO", "ir_sobre_hra", "docx"))
      .toBe("Termo LGPD GLCM — FULANO — IR SOBRE HRA.docx");
    expect(nomeArquivoGerado("contracheques_unificados", "FULANO", "ir_sobre_hra", "pdf"))
      .toBe("Contracheques Unificados — FULANO — IR SOBRE HRA.pdf");
    expect(nomeArquivoGerado("planilha_codigos", "FULANO", "contribuicao_extraordinaria", "xlsx"))
      .toBe("Planilha Códigos 1513 — FULANO — IR SOBRE CONTRIBUIÇÃO EXTRAORDINÁRIA.xlsx");
  });

  it("cliente nulo não quebra o nome", () => {
    expect(nomeArquivoGerado("contrato", null, "ir_sobre_hra", "docx"))
      .toBe("Contrato —  — IR SOBRE HRA.docx");
  });

  it("tipo de saída desconhecido usa o próprio identificador", () => {
    expect(nomeArquivoGerado("algo_novo", "FULANO", "ir_sobre_hra", "docx"))
      .toBe("algo_novo — FULANO — IR SOBRE HRA.docx");
  });
});
