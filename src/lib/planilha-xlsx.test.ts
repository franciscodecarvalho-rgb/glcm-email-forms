import { describe, expect, it } from "vitest";
import {
  agregarCodigosPorCompetencia,
  montarArquivosPlanilhaCodigosXlsx,
  montarArquivosPlanilhaXlsx,
  ordenarPorCompetencia,
} from "./planilha-xlsx";

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

  it("nome da aba é TEMA 306", () => {
    const arquivos = montarArquivosPlanilhaXlsx("FULANO", entrada);
    expect(arquivos["xl/workbook.xml"]).toContain('name="TEMA 306"');
  });

  it("título na linha 1 mescla A1:E1", () => {
    expect(sheet).toContain('<mergeCells count="1"><mergeCell ref="A1:E1"/></mergeCells>');
    expect(sheet).toContain('PLANILHA — FULANO — TEMA 306 (HRA)');
  });

  it("linha 1 tem altura 30 e estilo 4 (título)", () => {
    expect(sheet).toContain('<row r="1" ht="30" customHeight="1">');
    expect(sheet).toContain('s="4"');
  });

  it("linha 2 tem altura 18 e cabeçalhos com estilo 5", () => {
    expect(sheet).toContain('<row r="2" ht="18" customHeight="1">');
    const cabecalho = [
      ...sheet.matchAll(/<c r="([A-E])2" t="inlineStr" s="5"><is><t xml:space="preserve">([^<]+)<\/t><\/is><\/c>/g),
    ].map((m) => `${m[1]}=${m[2]}`);
    expect(cabecalho).toEqual(["A=P. A.", "B=HRA", "C=AHRA", "D=ALÍQ. IR", "E=VALOR (HISTÓRICO)"]);
  });

  it("não contém a coluna SUBTOTAL", () => {
    expect(sheet).not.toContain("SUBTOTAL");
    expect(sheet).not.toMatch(/SUM\(D\d+:D\d+\)/);
  });

  it("tem o cabeçalho P.A., HRA, AHRA, ALÍQ. IR, VALOR (HISTÓRICO)", () => {
    const cabecalho = [
      ...sheet.matchAll(/<c r="([A-E])2" t="inlineStr" s="5"><is><t xml:space="preserve">([^<]+)<\/t><\/is><\/c>/g),
    ].map((m) => `${m[1]}=${m[2]}`);
    expect(cabecalho).toEqual(["A=P. A.", "B=HRA", "C=AHRA", "D=ALÍQ. IR", "E=VALOR (HISTÓRICO)"]);
  });

  it("lista as competências em ordem cronológica", () => {
    const ordem = [
      ...sheet.matchAll(/<c r="A(\d+)" t="inlineStr" s="6"><is><t xml:space="preserve">([^<]+)<\/t><\/is><\/c>/g),
    ]
      .filter((m) => Number(m[1]) >= 3)
      .map((m) => m[2]);
    expect(ordem).toEqual(["01/2023", "12/2023", "03/2024", "Contracheque 9"]);
  });

  it("corpo: coluna A (P.A.) com estilo 6 (centralizado)", () => {
    expect(sheet.match(/<c r="A\d+" t="inlineStr" s="6"/g)).toHaveLength(4);
  });

  it("corpo: colunas B e C (HRA, AHRA) com estilo 7 (número direito)", () => {
    expect(sheet.match(/<c r="B\d+" s="7"/g)).toHaveLength(4);
    expect(sheet.match(/<c r="C\d+" s="7"/g)).toHaveLength(4);
  });

  it("corpo: coluna D (ALÍQ. IR) com estilo 8 (porcentagem) e valor 0.275", () => {
    expect(sheet.match(/<c r="D\d+" s="8"><v>0\.275<\/v><\/c>/g)).toHaveLength(4);
  });

  it("corpo: coluna E (VALOR HISTÓRICO) com estilo 7 e fórmula ROUND((B+C)*0.275,2)", () => {
    expect(sheet.match(/<c r="E\d+" s="7"><f>ROUND\(\(B\d+\+C\d+\)\*0\.275,2\)<\/f>/g)).toHaveLength(4);
    // 01/2023: 200 * 0,275 = 55,00 em cache
    expect(sheet).toContain(
      '<c r="E3" s="7"><f>ROUND((B3+C3)*0.275,2)</f><v>55.00</v></c>',
    );
  });

  it("totaliza apenas E na linha TOTAL (A, B, C vazios, D com texto, E com fórmula)", () => {
    expect(sheet).toMatch(/SUM\(E3:E6\)/);
    expect(sheet).toContain(
      '<c r="D7" t="inlineStr" s="9"><is><t xml:space="preserve">VALOR (HISTÓRICO)</t></is></c>',
    );
    // A, B, C vazios na linha TOTAL
    expect(sheet).toContain('<c r="A7" s="9"/>');
    expect(sheet).toContain('<c r="B7" s="9"/>');
    expect(sheet).toContain('<c r="C7" s="9"/>');
    // E com estilo 10 (bold + currency + gray bg)
    expect(sheet).toMatch(/<c r="E7" s="10"><f>SUM\(E3:E6\)<\/f>/);
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

  it("larguras das colunas: A=15, B=18, C=18, D=18, E=22", () => {
    expect(sheet).toContain('<col min="1" max="1" width="15" customWidth="1"/>');
    expect(sheet).toContain('<col min="2" max="2" width="18" customWidth="1"/>');
    expect(sheet).toContain('<col min="3" max="3" width="18" customWidth="1"/>');
    expect(sheet).toContain('<col min="4" max="4" width="18" customWidth="1"/>');
    expect(sheet).toContain('<col min="5" max="5" width="22" customWidth="1"/>');
  });

  it("estilos incluem numFmt 164 (#,##0.00) e 165 (0,00%)", () => {
    const styles = montarArquivosPlanilhaXlsx("FULANO", entrada)["xl/styles.xml"];
    expect(styles).toContain('formatCode="#,##0.00"');
    expect(styles).toContain('formatCode="0,00%"');
  });

  it("escapa o caractere & no nome do cliente (não gera XML inválido)", () => {
    const sheet = montarArquivosPlanilhaXlsx("MARIA & JOSÉ LTDA", entrada)["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("MARIA &amp; JOSÉ LTDA");
    expect(sheet).not.toMatch(/MARIA & JOSÉ/);
  });
});

describe("agregação dos códigos 1513/6050", () => {
  const contracheques = [
    { id: "a", competencia: "03/2024" },
    { id: "b", competencia: "01/2024" },
  ];

  it("soma os valores por código e competência, em ordem cronológica", () => {
    const linhas = agregarCodigosPorCompetencia(contracheques, [
      { contracheque_id: "a", codigo: "1513", valor: 100 },
      { contracheque_id: "a", codigo: "6050", valor: 25.5 },
      { contracheque_id: "b", codigo: "1513", valor: 200 },
      { contracheque_id: "a", codigo: "1513", valor: 50 },
    ]);
    expect(linhas).toEqual([
      { competencia: "01/2024", total1513: 200, total6050: 0 },
      { competencia: "03/2024", total1513: 150, total6050: 25.5 },
    ]);
  });

  it("ignora outros códigos e itens sem contracheque conhecido", () => {
    const linhas = agregarCodigosPorCompetencia(contracheques, [
      { contracheque_id: "a", codigo: "1059", valor: 999 },
      { contracheque_id: "inexistente", codigo: "1513", valor: 10 },
      { contracheque_id: "b", codigo: null, valor: 5 },
    ]);
    expect(linhas).toEqual([{ competencia: "", total1513: 10, total6050: 0 }]);
  });

  it("retorna vazio quando não há ocorrências", () => {
    expect(agregarCodigosPorCompetencia(contracheques, [])).toEqual([]);
    expect(agregarCodigosPorCompetencia(null, null)).toEqual([]);
  });
});

describe("planilha de códigos 1513/6050", () => {
  const sheet = montarArquivosPlanilhaCodigosXlsx("FULANO", [
    { competencia: "03/2024", total1513: 150, total6050: 25.5 },
    { competencia: "01/2024", total1513: 200, total6050: 0 },
  ])["xl/worksheets/sheet1.xml"];

  it("tem o cabeçalho P.A., 1513, 6050, TOTAL", () => {
    const cabecalho = [
      ...sheet.matchAll(/<c r="([A-D])2" t="inlineStr" s="1"><is><t xml:space="preserve">([^<]+)<\/t><\/is><\/c>/g),
    ].map((m) => `${m[1]}=${m[2]}`);
    expect(cabecalho).toEqual(["A=P. A.", "B=1513", "C=6050", "D=TOTAL"]);
  });

  it("lista competências em ordem cronológica com total por linha", () => {
    expect(sheet.indexOf("01/2024")).toBeLessThan(sheet.indexOf("03/2024"));
    expect(sheet).toContain('<c r="D4" s="2"><f>B4+C4</f><v>175.50</v></c>');
  });

  it("totaliza as três colunas na linha TOTAL", () => {
    expect(sheet).toMatch(/SUM\(B3:B4\)/);
    expect(sheet).toMatch(/SUM\(C3:C4\)/);
    expect(sheet).toMatch(/SUM\(D3:D4\)/);
  });

  it("nomeia a aba e o título para os códigos", () => {
    const arquivos = montarArquivosPlanilhaCodigosXlsx("FULANO", []);
    expect(arquivos["xl/workbook.xml"]).toContain('name="Códigos 1513-6050"');
    expect(arquivos["xl/worksheets/sheet1.xml"]).toContain("PLANILHA — FULANO — CÓDIGOS 1513/6050");
  });
});