import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { validarTemplateDocx, variaveisCanonicas } from "./validar-template";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function docx(documentXml: string, headerXml?: string): Uint8Array {
  const zip = new PizZip();
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document ${W}><w:body>${documentXml}</w:body></w:document>`);
  if (headerXml) {
    zip.file("word/header1.xml", `<?xml version="1.0"?><w:hdr ${W}>${headerXml}</w:hdr>`);
  }
  return zip.generate({ type: "uint8array" });
}

const p = (...runs: string[]) =>
  `<w:p>${runs.map((r) => `<w:r><w:t>${r}</w:t></w:r>`).join("")}</w:p>`;

describe("validarTemplateDocx", () => {
  it("reconhece variáveis canônicas no corpo e no cabeçalho", () => {
    const bytes = docx(p("Cliente: {NOME_CLIENTE}, CPF {CPF}"), p("Emitido em {DATA}"));
    const v = validarTemplateDocx(bytes);
    expect(v.reconhecidas).toEqual(["CPF", "DATA", "NOME_CLIENTE"]);
    expect(v.desconhecidas).toEqual([]);
    expect(v.colchetes).toEqual([]);
  });

  it("acusa tag desconhecida (erro de digitação sumiria em silêncio na geração)", () => {
    const v = validarTemplateDocx(docx(p("{NOME_CLEINTE}")));
    expect(v.desconhecidas).toEqual(["NOME_CLEINTE"]);
    expect(v.reconhecidas).toEqual([]);
  });

  it("detecta [colchete] não convertido mesmo quebrado em runs pelo Word", () => {
    const v = validarTemplateDocx(docx(p("[NOME COMPL", "ETO DO CLIENTE]")));
    expect(v.colchetes).toEqual(["[NOME COMPLETO DO CLIENTE]"]);
  });

  it("aceita a sintaxe de loop do docxtemplater", () => {
    const v = validarTemplateDocx(docx(p("{#linhas}{VALOR_CAUSA}{/linhas}")));
    expect(v.desconhecidas).toEqual([]);
    expect(v.reconhecidas).toContain("VALOR_CAUSA");
  });

  it("lista canônica contém as variáveis das 8 peças", () => {
    const c = variaveisCanonicas();
    for (const k of ["NOME_CLIENTE", "CPF", "ENDERECO_COMPLETO", "VALOR_CAUSA_EXTENSO", "HONORARIOS_PCT", "NUMERO_CONTRATO"]) {
      expect(c.has(k)).toBe(true);
    }
  });
});
