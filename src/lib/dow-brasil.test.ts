import { describe, expect, it } from "vitest";
import { parsePaginaContracheque, type TextItemPdf } from "./parse-contracheque-pdf";
import { classificarRubrica } from "./hra-catalog";

const item = (str: string, x: number, y: number): TextItemPdf => ({
  str,
  x,
  y,
  width: str.length * 5,
  height: 10,
});

describe("Modelo Dow Brasil", () => {
  it("classifica rubrica 3219 como HRA no catalogo hra-catalog", () => {
    const res = classificarRubrica("3219", "HORA REPOUSO ALIMENTACAO");
    expect(res).not.toBeNull();
    expect(res?.familia).toBe("hra");
  });

  it("classifica rubrica 3239 como HRA no catalogo hra-catalog", () => {
    const res = classificarRubrica("3239", "PERICULOSIDADE SOBRE HRA");
    expect(res).not.toBeNull();
    expect(res?.familia).toBe("hra");
  });

  it("faz o parsing deterministico completo de uma pagina do modelo Dow Brasil", () => {
    const itens: TextItemPdf[] = [
      // Cabecalho
      item("DOW BRASIL IND E COM DE PROD QUIMICOS LTDA", 50, 800),
      item("REFERÊNCIA", 400, 780),
      item("31/AGOSTO/2026", 400, 770),
      item("FILIPE JESUS DOS SANTOS", 100, 750),
      item("1119354", 50, 750),
      item("Técnico de Operações I", 250, 750),

      // Cabecalho das colunas
      item("CÓDIGO", 30, 700),
      item("DESCRIÇÃO", 100, 700),
      item("REFERÊNCIA", 280, 700),
      item("VENCIMENTOS", 380, 700),
      item("DESCONTOS", 480, 700),

      // Proventos
      item("0010", 30, 680),
      item("Salário Base", 100, 680),
      item("168,00", 280, 680),
      item("6.576,68", 380, 680),

      item("3219", 30, 660),
      item("HORA REPOUSO ALIMENTACAO", 100, 660),
      item("14,00", 280, 660),
      item("2.137,42", 380, 660),

      // Descontos
      item("2821", 30, 640),
      item("Adiant Quinzenal", 100, 640),
      item("3.419,87", 480, 640),

      item("5500", 30, 620),
      item("IR Retido", 100, 620),
      item("3.302,94", 480, 620),

      // Separador BASE/OUTROS e informativos
      item("---- -----BASE/OUTROS----- ----", 150, 600),
      item("5501", 30, 580),
      item("Base IR", 100, 580),
      item("15.228,73", 480, 580),

      item("8000", 30, 560),
      item("Salario Contribuicao", 100, 560),
      item("16.105,68", 480, 560),

      item("9921", 30, 540),
      item("Base FGTS", 100, 540),
      item("16.105,68", 480, 540),

      // Totais espaçados
      item("T O T A I S", 50, 500),
      item("8.714,10", 380, 490),
      item("6.722,81", 480, 490),
      item("1.991,29", 540, 490),
    ];

    const resultado = parsePaginaContracheque(itens, 595);

    expect(resultado.modeloOrigem).toBe("dow");
    expect(resultado.competencia).toBe("08/2026");

    // Verifica que 3219 foi capturada como provento
    const rubricaHra = resultado.itens.find((i) => i.codigo === "3219");
    expect(rubricaHra).toBeDefined();
    expect(rubricaHra?.tipo).toBe("provento");
    expect(rubricaHra?.valor).toBe(2137.42);

    // Verifica que rubricas da secao BASE/OUTROS foram classificadas como informativo
    const baseIr = resultado.itens.find((i) => i.codigo === "5501");
    expect(baseIr).toBeDefined();
    expect(baseIr?.tipo).toBe("informativo");

    const salarioContr = resultado.itens.find((i) => i.codigo === "8000");
    expect(salarioContr).toBeDefined();
    expect(salarioContr?.tipo).toBe("informativo");

    // Totais
    expect(resultado.totalProventos).toBe(8714.10);
    expect(resultado.totalDescontos).toBe(6722.81);
    expect(resultado.liquido).toBe(1991.29);
  });
});
