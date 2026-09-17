import { describe, expect, it } from "vitest";
import { criarEtapasGeracaoDocumentos } from "./etapas-geracao-documentos";

describe("criarEtapasGeracaoDocumentos", () => {
  it("separa cada DOCX e os artefatos pesados em chamadas sequenciais", () => {
    const etapas = criarEtapasGeracaoDocumentos("ir_sobre_hra", ["glcm"]);

    expect(etapas.filter((etapa) => etapa.etapa === "docx")).toHaveLength(5);
    expect(etapas.at(-1)).toEqual({ etapa: "finalizar" });
    expect(etapas.slice(-4)).toEqual([
      { etapa: "planilha_contrib_extra" },
      { etapa: "planilha_banco_horas" },
      { etapa: "pdf_unificado" },
      { etapa: "finalizar" },
    ]);
  });
});
