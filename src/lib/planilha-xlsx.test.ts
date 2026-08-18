import { describe, expect, it } from "vitest";
import { montarArquivosPlanilhaXlsx, ordenarPorCompetencia } from "./planilha-xlsx";

const entrada = [
  { competencia: "03/2024", hra: 100, ahra: 50 },
  { competencia: "01/2023", hra: 200, ahra: 0 },
  { competencia: "12/2023", hra: 300, ahra: 25 },
  { competencia: "Contracheque 9", hra: 10, ahra: 0 },
];

const sheetDe = (linhas: { competencia: string; hra: number; ahra: number }[]) =>
  montarArquivosPlanilhaXlsx("FULANO", linhas)["xl/worksheets/sheet1.xml"];

describe("ordenação por competência", () => {
  it("ordena MM/AAAA em ordem cronológica crescente", () => {
    expect(ordenarPorCompetencia(entrada).map((l) => l.competencia)).toEqual([
      "01/2023",
      "12/2023",
      "03/2024",
      "Contracheque 9",
    ]);
  });

  it("rótulos fora do padrão vão ao fim preservando a ordem relativa", () => {
    expect(
      ordenarPorCompetencia([
        { competencia: "Contracheque 2", hra: 1, ahra: 0 },
        { competencia: "05/2024", hra: 1, ahra: 0 },
        { competencia: "Contracheque 1", hra: 1, ahra: 0 },
      ]).map((l) => l.competencia),
    ).toEqual(["05/2024", "Contracheque 2", "Contracheque 1"]);
  });
});

describe("planilha xlsx", () => {
  const sheet = sheetDe(entrada);

  it("lista as competências em ordem cronológica", () => {
    const ordem = [
      ...sheet.matchAll(/<c r="A(\d+)" t="inlineStr"><is><t xml:space="preserve">([^<]+)<\/t><\/is><\/c>/g),
    ]
      .filter((m) => Number(m[1]) >= 3)
      .map((m) => m[2]);
    expect(ordem).toEqual(["01/2023", "12/2023", "03/2024", "Contracheque 9"]);
  });

  it("não contém a coluna SUBTOTAL", () => {
    expect(sheet).not.toContain("SUBTOTAL");
    expect(sheet).not.toMatch(/SUM\(D\d+:D\d+\)/);
  });

  it("tem o cabeçalho P.A., HRA, AHRA, ALÍQ. IR, VALOR (HISTÓRICO)", () => {
    const cabecalho = [
      ...sheet.matchAll(/<c r="([A-E])2" t="inlineStr" s="1"><is><t xml:space="preserve">([^<]+)<\/t><\/is><\/c>/g),
    ].map((m) => `${m[1]}=${m[2]}`);
    expect(cabecalho).toEqual(["A=P. A.", "B=HRA", "C=AHRA", "D=ALÍQ. IR", "E=VALOR (HISTÓRICO)"]);
  });

  it("calcula o VALOR (HISTÓRICO) diretamente de HRA+AHRA na coluna E", () => {
    expect(sheet.match(/<c r="E\d+" s="2"><f>ROUND\(\(B\d+\+C\d+\)\*0\.275,2\)<\/f>/g)).toHaveLength(4);
    // 01/2023: 200 * 0,275 = 55,00 em cache
    expect(sheet).toContain(
      '<c r="E3" s="2"><f>ROUND((B3+C3)*0.275,2)</f><v>55.00</v></c>',
    );
  });

  it("totaliza B, C e E na linha TOTAL", () => {
    expect(sheet).toMatch(/SUM\(B3:B6\)/);
    expect(sheet).toMatch(/SUM\(C3:C6\)/);
    expect(sheet).toMatch(/SUM\(E3:E6\)/);
    expect(sheet).toContain(
      '<c r="D7" t="inlineStr" s="1"><is><t xml:space="preserve">VALOR (HISTÓRICO)</t></is></c>',
    );
  });

  it("entrada vazia não gera linha TOTAL", () => {
    expect(sheetDe([])).not.toContain("TOTAL");
  });

  it("mantém a estrutura do pacote xlsx", () => {
    expect(Object.keys(montarArquivosPlanilhaXlsx("FULANO", entrada)).sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/worksheets/sheet1.xml",
        "xl/workbook.xml",
      ].sort(),
    );
  });
});
