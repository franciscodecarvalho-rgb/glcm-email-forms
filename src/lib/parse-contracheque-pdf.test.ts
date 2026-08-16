import { describe, expect, it } from "vitest";
import {
  consolidarPaginasContracheque,
  moedaBrasileiraParaNumero,
  parsePaginaContracheque,
  type ContrachequePdf,
  type TextItemPdf,
} from "./parse-contracheque-pdf";

const item = (str: string, x: number, y: number): TextItemPdf => ({ str, x, y, width: str.length * 5, height: 10 });

describe("parsePaginaContracheque", () => {
  it("usa colunas para classificar códigos numéricos e alfanuméricos", () => {
    const resultado = parsePaginaContracheque([
      item("BASF", 20, 500), item("Junho", 300, 480), item("2026", 350, 480),
      item("Rubrica", 20, 450), item("Qtde.", 110, 450), item("Descrição", 180, 450),
      item("Proventos", 580, 450), item("Descontos", 700, 450),
      item("3A15", 20, 420), item("3,96", 110, 420), item("Redução", 180, 420),
      item("Hora", 230, 420), item("Noturna", 270, 420), item("712,12", 590, 420),
      item("/B02", 20, 400), item("Desconto", 180, 400), item("Adto", 230, 400),
      item("Quinzenal", 270, 400), item("5.900,43", 710, 400),
      item("TOTAIS", 300, 100), item("22.660,07", 590, 100), item("13.511,25", 710, 100),
      item("Valor", 600, 80), item("Líquido", 650, 80), item("9.148,82", 710, 80),
    ], 842);

    expect(resultado.modeloOrigem).toBe("basf");
    expect(resultado.competencia).toBe("06/2026");
    expect(resultado.itens).toEqual([
      { codigo: "3A15", descricao: "Redução Hora Noturna", referencia: 3.96, valor: 712.12, tipo: "provento" },
      { codigo: "/B02", descricao: "Desconto Adto Quinzenal", referencia: null, valor: 5900.43, tipo: "desconto" },
    ]);
    expect(resultado.totalProventos).toBe(22660.07);
    expect(resultado.totalDescontos).toBe(13511.25);
    expect(resultado.liquido).toBe(9148.82);
  });

  it("separa as seções de valor do layout Petrobras", () => {
    const resultado = parsePaginaContracheque([
      item("PETROBRAS", 20, 500), item("Mês/Ano", 400, 490), item("01/2026", 500, 490),
      item("Código", 40, 450), item("Descrição", 100, 450), item("Quantidade", 380, 450), item("Valor", 520, 450),
      item("1513", 50, 420), item("Banco", 100, 420), item("de", 140, 420), item("Horas", 160, 420),
      item("17,79", 390, 420), item("4.668,46", 530, 420),
      item("Total", 380, 400), item("de", 410, 400), item("Proventos", 430, 400), item("43.368,08", 530, 400),
      item("0927", 50, 380), item("Imposto", 100, 380), item("de", 150, 380), item("Renda", 170, 380),
      item("27,5", 390, 380), item("6.813,52", 530, 380),
      item("Total", 380, 360), item("de", 410, 360), item("Descontos", 430, 360), item("33.977,34", 530, 360),
      item("Total", 400, 340), item("Líquido", 440, 340), item("9.390,74", 530, 340),
    ], 595);
    expect(resultado.itens.map((i) => i.tipo)).toEqual(["provento", "desconto"]);
    expect(resultado.itens[0].codigo).toBe("1513");
    expect(resultado.totalProventos).toBe(43368.08);
    expect(resultado.totalDescontos).toBe(33977.34);
    expect(resultado.liquido).toBe(9390.74);
  });

  it("trata vencimentos, descontos e informativos do layout Unigel", () => {
    const resultado = parsePaginaContracheque([
      item("UNIGEL", 20, 500), item("SETEMBRO/2025", 400, 500),
      item("DESCRIÇÃO", 100, 450), item("QTDE.", 350, 450), item("VENCIMENTOS", 500, 450),
      item("H43", 40, 420), item("Hrs", 100, 420), item("Repouso", 140, 420),
      item("Alimentação", 200, 420), item("2.585,51", 510, 420),
      item("TOTAL", 350, 390), item("VENCIMENTOS", 400, 390), item("17.696,64", 510, 390),
      item("DESCRIÇÃO", 100, 370), item("QTDE.", 350, 370), item("DESCONTOS", 500, 370),
      item("B15", 40, 340), item("Co-Participação", 100, 340), item("48,40", 510, 340),
      item("TOTAL", 350, 310), item("DESCONTOS", 400, 310), item("10.444,44", 510, 310),
      item("TOTAL", 350, 290), item("LÍQUIDO", 400, 290), item("7.252,20", 510, 290),
      item("CUSTO", 300, 270), item("EMPRESA-INFORMATIVO", 350, 270),
      item("651", 40, 240), item("FGTS", 100, 240), item("Normal", 140, 240),
      item("Depósito", 180, 240), item("1.288,16", 510, 240),
    ], 595);

    expect(resultado.modeloOrigem).toBe("unigel");
    expect(resultado.competencia).toBe("09/2025");
    expect(resultado.itens.map((i) => i.tipo)).toEqual(["provento", "desconto", "informativo"]);
    expect(resultado.totalProventos).toBe(17696.64);
    expect(resultado.totalDescontos).toBe(10444.44);
    expect(resultado.liquido).toBe(7252.2);
  });

  it("extrai rubricas sem código do layout Elekeiroz", () => {
    const resultado = parsePaginaContracheque([
      item("ELEKEIROZ", 20, 500), item("Referência", 300, 490), item("abr/2026", 380, 490),
      item("Descrição", 40, 450), item("Qtde", 300, 450), item("Provento", 450, 450), item("Desconto", 560, 450),
      item("HORAS", 40, 420), item("EXTRAS", 90, 420), item("100%", 150, 420),
      item("2", 310, 420), item("161,24", 460, 420),
      item("INSS", 40, 400), item("MÊS", 90, 400), item("98,81", 570, 400),
    ], 620);

    expect(resultado.modeloOrigem).toBe("elekeiroz");
    expect(resultado.competencia).toBe("04/2026");
    expect(resultado.itens).toEqual([
      { codigo: "", descricao: "HORAS EXTRAS 100%", referencia: 2, valor: 161.24, tipo: "provento" },
      { codigo: "", descricao: "INSS MÊS", referencia: null, valor: 98.81, tipo: "desconto" },
    ]);
  });

  it("processa somente a metade esquerda do layout duplicado Termo Bahia", () => {
    const resultado = parsePaginaContracheque([
      item("TERMOBAHIA", 20, 500), item("MÊS/ANO", 230, 500), item("07/2026", 300, 500),
      item("CÓD.", 20, 450), item("DESCRIÇÃO", 70, 450), item("REFERÊNCIA", 230, 450),
      item("VENCIMENTOS", 330, 450), item("DESCONTOS", 450, 450),
      item("001", 20, 420), item("Salário", 70, 420), item("Básico", 120, 420),
      item("168,00", 240, 420), item("6.231,92", 340, 420),
      item("001", 620, 420), item("Salário", 670, 420), item("6.231,92", 940, 420),
      item("TOTAL", 300, 100), item("DE", 335, 100), item("VENCIMENTOS", 350, 100),
      item("6.231,92", 440, 100), item("TOTAL", 470, 100), item("DE", 500, 100),
      item("DESCONTOS", 520, 100), item("0,00", 580, 100),
    ], 1200);

    expect(resultado.modeloOrigem).toBe("termo_bahia");
    expect(resultado.itens).toHaveLength(1);
    expect(resultado.itens[0].valor).toBe(6231.92);
  });
});

describe("consolidarPaginasContracheque", () => {
  it("une continuação e remove contracheque repetido", () => {
    const base: ContrachequePdf = {
      competencia: "07/2025", modeloOrigem: "termomacae",
      totalProventos: null, totalDescontos: null, liquido: null,
      itens: [{ codigo: "001", descricao: "Horas Normais", referencia: 84, valor: 3016.48, tipo: "provento" }],
    };
    const fim: ContrachequePdf = {
      competencia: "07/2025", modeloOrigem: "termomacae",
      totalProventos: 36633.77, totalDescontos: 27237.12, liquido: 9396.65,
      itens: [{ codigo: "3374", descricao: "Pecúlio PP2", referencia: null, valor: 98.57, tipo: "desconto" }],
    };
    const resultado = consolidarPaginasContracheque([base, fim, base, fim]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].itens).toHaveLength(2);
  });

  it("consolida as páginas do modelo Elekeiroz mesmo com subtotal calculado", () => {
    const pagina1: ContrachequePdf = {
      competencia: "04/2026", modeloOrigem: "elekeiroz",
      totalProventos: 22435.26, totalDescontos: 4081.92, liquido: 18353.34,
      itens: [{ codigo: "", descricao: "SALÁRIO", referencia: 12, valor: 1539.52, tipo: "provento" }],
    };
    const pagina2: ContrachequePdf = {
      competencia: "04/2026", modeloOrigem: "elekeiroz",
      totalProventos: 22435.26, totalDescontos: 15019.27, liquido: 7415.99,
      itens: [{ codigo: "", descricao: "MENSALIDADE SINDICAL", referencia: null, valor: 57.73, tipo: "desconto" }],
    };

    const resultado = consolidarPaginasContracheque([pagina1, pagina2]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].itens).toHaveLength(2);
    expect(resultado[0].totalDescontos).toBe(15019.27);
    expect(resultado[0].liquido).toBe(7415.99);
  });
});

describe("moedaBrasileiraParaNumero", () => {
  it("converte moeda brasileira com ou sem R$", () => {
    expect(moedaBrasileiraParaNumero("R$ 15.250,75")).toBe(15250.75);
  });
});
