import { describe, expect, it } from "vitest";
import {
  agregarBancoHorasPorCompetencia,
  agregarContribExtraPorCompetencia,
  montarArquivosPlanilhaBancoHorasXlsx,
  montarArquivosPlanilhaContribExtraXlsx,
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

  it("mergeCells vem DEPOIS do sheetData (ordem exigida pelo schema OOXML)", () => {
    expect(sheet.indexOf("<sheetData>")).toBeLessThan(sheet.indexOf("<mergeCells"));
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

  it("estilos incluem numFmt 164 (#,##0.00) e 165 (0.00%)", () => {
    const styles = montarArquivosPlanilhaXlsx("FULANO", entrada)["xl/styles.xml"];
    expect(styles).toContain('formatCode="#,##0.00"');
    expect(styles).toContain('formatCode="0.00%"');
  });

  it("escapa o caractere & no nome do cliente (não gera XML inválido)", () => {
    const sheet = montarArquivosPlanilhaXlsx("MARIA & JOSÉ LTDA", entrada)["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("MARIA &amp; JOSÉ LTDA");
    expect(sheet).not.toMatch(/MARIA & JOSÉ/);
  });

  it("exclui linhas com HRA e AHRA zerados", () => {
    const comNula = [
      { competencia: "01/2023", hra: 200, ahra: 0 },
      { competencia: "06/2023", hra: 0, ahra: 0 },
      { competencia: "03/2024", hra: 0, ahra: 0 },
      { competencia: "12/2023", hra: 300, ahra: 25.5 },
    ];
    const s = montarArquivosPlanilhaXlsx("FULANO", comNula)["xl/worksheets/sheet1.xml"];
    expect(s).not.toContain("06/2023");
    expect(s).not.toContain("03/2024");
    expect(s).toContain("01/2023");
    expect(s).toContain("12/2023");
    // total considera apenas as linhas não nulas (E3 e E4)
    expect(s).toMatch(/SUM\(E3:E4\)/);
  });
});

describe("agregação Banco de Horas (1513)", () => {
  const contracheques = [
    { id: "a", competencia: "03/2024" },
    { id: "b", competencia: "01/2024" },
  ];

  it("soma quantidade/valor do 1513 e a base de cálculo por competência", () => {
    const linhas = agregarBancoHorasPorCompetencia(contracheques, [
      { contracheque_id: "a", codigo: "1513", valor: 100, referencia: 10 },
      { contracheque_id: "a", codigo: "0001", valor: 1500 },
      { contracheque_id: "b", codigo: "1513", valor: 200, referencia: 52 },
      { contracheque_id: "a", codigo: "1513", valor: 50, referencia: 2 },
      { contracheque_id: "b", codigo: "0201", valor: 300 },
    ]);
    expect(linhas).toEqual([
      {
        competencia: "01/2024",
        quantidade: 52,
        valor: 200,
        base: { "0001": 0, "0201": 300, "1061": 0, "1062": 0, "1059": 0, "0192": 0, "0015": 0 },
      },
      {
        competencia: "03/2024",
        quantidade: 12,
        valor: 150,
        base: { "0001": 1500, "0201": 0, "1061": 0, "1062": 0, "1059": 0, "0192": 0, "0015": 0 },
      },
    ]);
  });

  it("ignora outros códigos e itens sem contracheque conhecido", () => {
    const linhas = agregarBancoHorasPorCompetencia(contracheques, [
      { contracheque_id: "a", codigo: "6050", valor: 999 },
      { contracheque_id: "inexistente", codigo: "1513", valor: 10 },
      { contracheque_id: "b", codigo: null, valor: 5 },
    ]);
    expect(linhas).toEqual([]);
  });

  it("retorna vazio quando não há ocorrências", () => {
    expect(agregarBancoHorasPorCompetencia(contracheques, [])).toEqual([]);
    expect(agregarBancoHorasPorCompetencia(null, null)).toEqual([]);
  });
});

describe("planilha Banco de Horas (1513)", () => {
  const arquivos = montarArquivosPlanilhaBancoHorasXlsx("FULANO", [
    {
      competencia: "03/2024",
      quantidade: 10,
      valor: 1500,
      base: { "0001": 2000, "0201": 100, "1061": 0, "1062": 0, "1059": 0, "0192": 0, "0015": 0 },
    },
    {
      competencia: "01/2024",
      quantidade: 52,
      valor: 200,
      base: { "0001": 0, "0201": 0, "1061": 0, "1062": 0, "1059": 0, "0192": 0, "0015": 0 },
    },
  ]);
  const dados = arquivos["xl/worksheets/sheet3.xml"];
  const calculo = arquivos["xl/worksheets/sheet2.xml"];

  it("aba DADOS: cabeçalho Código, Descrição, Quantidade, Valor", () => {
    const cabecalho = [
      ...dados.matchAll(/<c r="([A-D])1" s="124" t="inlineStr"><is><t xml:space="preserve">([^<]+)<\/t><\/is><\/c>/g),
    ].map((m) => `${m[1]}=${m[2]}`);
    expect(cabecalho).toEqual(["A=Código", "B=Descrição", "C=Quantidade", "D=Valor"]);
  });

  it("aba DADOS: lista competências em ordem cronológica com código 1513, quantidade e valor", () => {
    // 01/2024 (qtd 52) vem antes de 03/2024 (qtd 10), sem coluna de competência
    expect(dados.indexOf('<c r="C2" s="125"><v>52.00</v></c>')).toBeLessThan(
      dados.indexOf('<c r="C3" s="125"><v>10.00</v></c>'),
    );
    expect(dados).toContain('<c r="A2" s="124"><v>1513</v></c>');
    expect(dados).toContain('<c r="D2" s="126"><v>200.00</v></c>');
    expect(dados).toContain('<c r="A3" s="124"><v>1513</v></c>');
    expect(dados).toContain('<c r="D3" s="127"><v>1500.00</v></c>');
  });

  it("aba DADOS: linha Total soma quantidade e valor", () => {
    expect(dados).toMatch(/<c r="B4" s="128" t="inlineStr">/);
    expect(dados).toMatch(/SUM\(C2:C3\)/);
    expect(dados).toMatch(/SUM\(D2:D3\)/);
  });

  it("aba CÁLCULO: tem cabeçalhos PERÍODO, BASE DE CÁLCULO e REFLEXOS", () => {
    expect(calculo).toContain("PERÍODO");
    expect(calculo).toContain("BASE DE CÁLCULO");
    expect(calculo).toContain("Banco de Horas (1513)");
    expect(calculo).toContain("REFLEXOS HORAS EXTRAS");
    expect(calculo).toContain("Salário Base (0001)");
    expect(calculo).toContain("RSR Devido");
    expect(calculo).toContain("FGTS 8%");
  });

  it("aba CÁLCULO: período lê DADOS e calcula reflexos", () => {
    // linha 14 = 01/2024 (valor 200): q=40, r13=20, ferias=26.67, fgts=22.93, grat=13.33
    expect(calculo).toContain('<c r="L14" s="77"><f>DADOS!C2</f><v>52.00</v></c>');
    expect(calculo).toContain('<c r="M14" s="84"><f>DADOS!D2</f><v>200.00</v></c>');
    expect(calculo).toContain('<c r="O14" s="76"><f>M14*0.2</f><v>40.00</v></c>');
    expect(calculo).toContain('<c r="Q14" s="76"><f>O14-P14</f><v>40.00</v></c>');
    expect(calculo).toContain('<c r="R14" s="76"><f>(M14+Q14)/12</f><v>20.00</v></c>');
    expect(calculo).toContain('<c r="S14" s="76"><f>(M14+Q14)/12/3*4</f><v>26.67</v></c>');
    expect(calculo).toContain('<c r="T14" s="76"><f>((M14+Q14+R14+S14))*0.08</f><v>22.93</v></c>');
    expect(calculo).toContain('<c r="U14" s="76"><f>(M14+Q14)/12/3*2</f><v>13.33</v></c>');
    // total = Q+R+S+T+U (soma dos reflexos), sem duplicar RSR
    expect(calculo).toContain('<c r="V14" s="76"><f>SUM(Q14:U14)</f><v>122.93</v></c>');
    expect(calculo).toContain('<c r="W14" s="76"><v>122.93</v></c>');
    expect(calculo).toContain('<c r="Y14" s="76"><f>W14*X14</f><v>122.93</v></c>');
    expect(calculo).toContain('<c r="Z14" s="79"><f>(Q14+R14)*X14</f><v>60.00</v></c>');
    expect(calculo).toContain('<c r="B15" s="75"><v>2000.00</v></c>');
  });

  it("aba CÁLCULO: linha TOTAL e seção IRRF presentes", () => {
    expect(calculo).toContain("TOTAL");
    expect(calculo).toContain("APURAÇÃO DO IMPOSTO DE RENDA RETIDO NA FONTE");
    expect(calculo).toContain("DÉBITO TOTAL");
  });

  it("workbook tem três abas Resumo, CÁLCULO e DADOS (ordem do modelo)", () => {
    expect(arquivos["xl/workbook.xml"]).toContain('name="Resumo da Condenação"');
    expect(arquivos["xl/workbook.xml"]).toContain('name="CÁLCULO"');
    expect(arquivos["xl/workbook.xml"]).toContain('name="DADOS"');
  });

  it("aba Resumo da Condenação: cabeçalho e referências ao CÁLCULO", () => {
    const resumo = arquivos["xl/worksheets/sheet1.xml"];
    expect(resumo).toContain("DEMONSTRATIVO DE CÁLCULO");
    expect(resumo).toContain("Descrição");
    expect(resumo).toContain("Valor Base");
    expect(resumo).toContain("Valor Total Devido");
    // linha de subtotais do CÁLCULO = 15 + n = 17 (2 períodos)
    expect(resumo).toContain("CÁLCULO!Q17");
    expect(resumo).toContain("CÁLCULO!R17");
    expect(resumo).toContain("CÁLCULO!S17");
    expect(resumo).toContain("CÁLCULO!T17");
    expect(resumo).toContain("CÁLCULO!U17");
    expect(resumo).toContain("INSS RECDA");
    expect(resumo).toContain("CUSTAS");
    expect(resumo).toContain("TOTAL DEVIDO");
    expect(resumo).toMatch(/F13\+F16\+F14\+F15/);
  });
});
describe("planilha IR sobre Contribuição Extraordinária", () => {
  const contracheques = [
    { id: "a", competencia: "03/2024" },
    { id: "b", competencia: "01/2024" },
  ];
  const itens = [
    { contracheque_id: "a", valor: -100.5, familia_hra: "contrib_extra" },
    { contracheque_id: "a", valor: 50, familia_hra: "contrib_extra" },
    { contracheque_id: "a", valor: 900, familia_hra: "hra" },
    { contracheque_id: "b", valor: -200, familia_hra: "contrib_extra" },
    { contracheque_id: "b", valor: 10, familia_hra: null },
  ];

  it("agrega por competência usando valor absoluto e ordem cronológica", () => {
    expect(agregarContribExtraPorCompetencia(contracheques, itens)).toEqual([
      { competencia: "01/2024", valor: 200 },
      { competencia: "03/2024", valor: 150.5 },
    ]);
  });

  it("monta a planilha em B:E com aba Plan1, título mesclado e IR de 27,5%", () => {
    const arquivos = montarArquivosPlanilhaContribExtraXlsx(
      "FULANO",
      agregarContribExtraPorCompetencia(contracheques, itens),
    );
    const sheet = arquivos["xl/worksheets/sheet1.xml"];
    expect(arquivos["xl/workbook.xml"]).toContain('name="Plan1"');
    expect(sheet).toContain("PLANILHA — FULANO — IR SOBRE CONTRIBUIÇÃO EXTRAORDINÁRIA");
    expect(sheet).toContain('<mergeCell ref="B1:E1"/>');
    expect(sheet).toContain("CONTR. EXTRAORDINÁRIA");
    expect(sheet).toContain("ROUND(C3*0.275,2)");
    expect(sheet).toContain("SUM(E3:E4)");
    expect(sheet).toContain('<c r="B3" t="inlineStr" s="6"><is><t xml:space="preserve">01/2024');
  });
});
