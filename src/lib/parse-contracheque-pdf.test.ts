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

  it("usa o mês/ano do campo Pagamento Referente (BASF) e ignora a data de admissão", () => {
    // Layout BASF: a data de admissão (04.11.2013) contém "11.2013", que não pode
    // ser confundida com a competência real "Abril 2021" do campo Pagamento Referente.
    const resultado = parsePaginaContracheque([
      item("BASF", 20, 500), item("Funcionário", 20, 470), item("37031684", 120, 470),
      item("Senhor", 160, 470), item("JACSON", 200, 470), item("DA", 240, 470),
      item("ANUNCIACAO", 260, 470), item("NUNES", 300, 470),
      item("Cargo", 20, 450), item("Admissão", 400, 450), item("04.11.2013", 460, 450),
      item("Pagamento", 20, 430), item("Referente", 80, 430), item("a", 130, 430),
      item("Salario/Bolsa", 350, 430),
      item("S-CP/SPAO2", 20, 410), item("BR100730", 120, 410), item("033", 200, 410),
      item("Abril", 300, 410), item("2021", 330, 410), item("5.644,19", 380, 410),
      item("Rubrica", 20, 380), item("Qtde.", 110, 380), item("Descrição", 180, 380),
      item("Proventos", 580, 380), item("Descontos", 700, 380),
      item("3A20", 20, 360), item("180,00", 110, 360), item("Adicional", 180, 360),
      item("de", 220, 360), item("periculos.", 240, 360), item("1.693,26", 590, 360),
    ], 842);

    expect(resultado.competencia).toBe("04/2021");
  });

  it("usa a Data de Crédito do rodapé (BASF) mesmo quando Pagamento Referente está truncado", () => {
    // 13º salário: "Pagamento Referente a: R Novembro 202" (ano truncado no PDF),
    // mas o rodapé tem "Data de Crédito | 30.11.2021" -> competência 11/2021.
    const resultado = parsePaginaContracheque([
      item("BASF", 20, 500), item("Funcionário", 20, 470), item("37031684", 120, 470),
      item("JACSON", 200, 470), item("DA", 240, 470), item("ANUNCIACAO", 260, 470), item("NUNES", 300, 470),
      item("Admissão", 400, 450), item("04.11.2013", 460, 450),
      item("Pagamento", 20, 430), item("Referente", 80, 430), item("a", 130, 430), item("Salario/Bolsa", 350, 430),
      item("S-CP/SPAO5", 20, 410), item("BR100730", 120, 410), item("033", 200, 410),
      item("R Novembro", 300, 410), item("202", 330, 410), item("6.232,31", 380, 410),
      item("Rubrica", 20, 380), item("Qtde.", 110, 380), item("Descrição", 180, 380),
      item("Proventos", 580, 380), item("Descontos", 700, 380),
      item("3A20", 20, 360), item("180,00", 110, 360), item("Adicional", 180, 360),
      item("de", 220, 360), item("periculos.", 240, 360), item("1.693,26", 590, 360),
      // rodapé
      item("Data de", 20, 100), item("Crédito", 60, 100),
      item("Saldo", 200, 100), item("Devedor", 230, 100), item("Valor", 300, 100), item("Líquido", 330, 100),
      item("30.11.2021", 60, 80), item("5.873,95", 330, 80),
    ], 842);

    expect(resultado.competencia).toBe("11/2021");
  });

  it("ignora dados cadastrais e preserva descrições completas no layout PROQUIGEL/Unigel", () => {
    const resultado = parsePaginaContracheque([
      item("PROQUIGEL", 20, 560), item("QUIMICA", 90, 560), item("Competência", 400, 560), item("4/2026", 480, 560),
      // dados cadastrais acima do cabeçalho (não podem virar rubricas)
      item("1234", 40, 530), item("JOSE", 100, 530), item("DA", 150, 530), item("SILVA", 180, 530),
      item("CBO", 400, 530), item("8.401,00", 510, 530),
      item("CÓD.", 40, 450), item("DESCRIÇÃO", 180, 450), item("QTDE.", 350, 450), item("VENCIMENTOS", 500, 450),
      item("015", 40, 420), item("Hrs", 70, 420), item("Repouso", 100, 420), item("Alimentacao", 150, 420),
      item("30,00", 350, 420), item("2.585,51", 510, 420),
      item("023", 40, 400), item("Vlr", 70, 400), item("Adicional", 100, 400), item("HRA", 150, 400),
      item("S", 175, 400), item("Hextra", 195, 400), item("463,36", 510, 400),
      item("TOTAL", 350, 380), item("VENCIMENTOS", 400, 380), item("3.048,87", 510, 380),
    ], 595);

    expect(resultado.modeloOrigem).toBe("unigel");
    expect(resultado.competencia).toBe("04/2026");
    expect(resultado.itens).toEqual([
      { codigo: "015", descricao: "Hrs Repouso Alimentacao", referencia: 30, valor: 2585.51, tipo: "provento" },
      { codigo: "023", descricao: "Vlr Adicional HRA S Hextra", referencia: null, valor: 463.36, tipo: "provento" },
    ]);
  });

  it("reconhece o modelo ITF e extrai competência Mês/Ano", () => {
    const resultado = parsePaginaContracheque([
      item("ITF", 20, 500), item("CHEMICAL", 60, 500), item("LTDA", 110, 500),
      item("CNPJ", 20, 470), item("03.928.294/0001-04", 80, 470),
      item("Matrícula", 20, 450), item("Nome", 120, 450),
      item("00473", 20, 430), item("TAUAN", 120, 430), item("DA", 150, 430), item("SILVA", 180, 430),
      item("Competência", 20, 410), item("Junho/2024", 120, 410),
      item("Código", 20, 380), item("Discrição", 120, 380), item("Ref", 250, 380), item("Provento", 350, 380), item("Desconto", 450, 380),
      item("1002", 20, 360), item("HRA", 60, 360), item("-", 80, 360), item("Hora", 100, 360),
      item("Repouso", 130, 360), item("Alimentação", 170, 360), item("256,67", 360, 360),
      item("2095", 20, 340), item("I.N.S.S.", 100, 340), item("9,00", 260, 340), item("152,99", 460, 340),
    ], 595);

    expect(resultado.modeloOrigem).toBe("itf");
    expect(resultado.competencia).toBe("06/2024");
    expect(resultado.itens.some((i) => i.codigo === "1002" && i.valor === 256.67)).toBe(true);
  });

  it("reconhece o modelo Tronox e preserva descrições completas", () => {
    const resultado = parsePaginaContracheque([
      item("DEMONSTRATIVO", 20, 500), item("DE", 100, 500), item("PAGAMENTO", 120, 500), item("MENSAL", 180, 500),
      item("TRONOX", 20, 470), item("PIGMENTOS", 60, 470), item("DO", 100, 470), item("BRASIL", 130, 470),
      item("Matrícula", 20, 450), item("Nome", 120, 450),
      item("04915", 20, 430), item("ANTONIO", 120, 430), item("CELESTINO", 150, 430),
      item("Competência", 20, 410), item("Maio/2026", 120, 410),
      item("Código", 20, 380), item("Descrição", 120, 380), item("Referência", 260, 380), item("Provento", 350, 380), item("Desconto", 440, 380),
      item("0603", 20, 360), item("HORAS", 60, 360), item("REPOUSO", 90, 360), item("ALIMENTACAO", 130, 360), item("2.273,48", 360, 360),
      item("0004", 20, 340), item("IRRF", 90, 340), item("27,50", 270, 340), item("3.027,80", 450, 340),
    ], 595);

    expect(resultado.modeloOrigem).toBe("tronox");
    expect(resultado.competencia).toBe("05/2026");
    expect(resultado.itens.some((i) => i.codigo === "0603" && i.descricao === "HORAS REPOUSO ALIMENTACAO" && i.valor === 2273.48)).toBe(true);
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
