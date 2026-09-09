// Testa `parseRecibosDaPagina` da Edge Function process-contracheques-pdf
// carregando o trecho real do arquivo (sem duplicar a lógica).
// Cenário: uma página física da Companhia Brasileira de Estireno (unigel) com
// DOIS recibos — fim de Janeiro/2023 no topo e início de Fevereiro/2023embaixo.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type TextItem = { str: string; x: number; y: number; width: number; height: number };
type Rubrica = { codigo: string; descricao: string; referencia: number | null; valor: number; tipo: string; familia_hra: string | null };
type Contra = { competencia: string | null; modelo_origem: string; total_proventos: number | null; total_descontos: number | null; liquido: number | null; itens: Rubrica[] };

function carregarParser() {
  const fonte = readFileSync(
    resolve(process.cwd(), "supabase/functions/process-contracheques-pdf/index.ts"),
    "utf8",
  );
  const linhasFonte = fonte.split("\n");
  const constantes = linhasFonte
    .filter((l) => /^(const (CODIGO|VALOR|MESES|norm|moeda))/.test(l))
    .join("\n");
  const inicio = fonte.indexOf("function expandir(");
  const fim = fonte.indexOf("// ---------------- consolidação incremental");
  if (inicio < 0 || fim <= inicio) throw new Error("Trecho do parser não localizado");
  const js = ts.transpileModule(`${constantes}\n${fonte.slice(inicio, fim)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(`${js}; return parseRecibosDaPagina;`)() as (
    itens: TextItem[],
    largura: number,
  ) => Contra[];
}

const parseRecibosDaPagina = carregarParser();

const LARGURA = 595;
let y = 800;
function linha(pares: Array<[string, number, number?]>): TextItem[] {
  const atual = y;
  y -= 14;
  return pares.map(([str, x, width]) => ({ str, x, y: atual, width: width ?? str.length * 5, height: 8 }));
}

function cabecalhoRecibo(mes: string): TextItem[] {
  return [
    ...linha([["COMPANHIA BRASILEIRA DE ESTIRENO", 40, 180], ["Recibo de Pagamento de", 360, 110]]),
    ...linha([[`${mes} Mensal`, 360, 80]]),
    ...linha([["Cód.", 30, 20], ["Descrição", 80, 45], ["Referência", 300, 48], ["Vencimentos", 400, 55], ["Descontos", 500, 48]]),
  ];
}

function rubrica(codigo: string, descricao: string, valor: string, coluna = 400): TextItem[] {
  return linha([[codigo, 30, 18], [descricao, 80, 120], [valor, coluna, 40]]);
}

function paginaComDoisRecibos(): TextItem[] {
  y = 800;
  return [
    // Recibo 1 — final de Janeiro/2023 (traz os totais e fecha).
    ...cabecalhoRecibo("Janeiro/2023"),
    ...rubrica("015", "Hrs Repouso Alimentacao", "1.009,30"),
    ...rubrica("023", "Vlr Adicional HRA S Hextra", "240,92"),
    ...linha([["Total Vencimentos", 380, 80], ["7.560,43", 470, 40]]),
    ...linha([["Total Descontos", 380, 70], ["4.358,68", 470, 40]]),
    ...rubrica("423", "Seguro de Vida", "5,30", 500),
    // Recibo 2 — início de Fevereiro/2023 na mesma página física.
    ...cabecalhoRecibo("Fevereiro/2023"),
    ...rubrica("015", "Hrs Repouso Alimentacao", "1.111,11"),
    ...rubrica("023", "Vlr Adicional HRA S Hextra", "222,22"),
    ...linha([["CONTINUA...", 30, 60]]),
  ];
}

describe("parseRecibosDaPagina — dois recibos na mesma página (Estireno/Unigel)", () => {
  const recibos = parseRecibosDaPagina(paginaComDoisRecibos(), LARGURA);

  it("separa os dois recibos e preserva as competências consecutivas", () => {
    expect(recibos).toHaveLength(2);
    expect(recibos.map((r) => r.competencia)).toEqual(["01/2023", "02/2023"]);
    expect(recibos.every((r) => r.modelo_origem === "unigel")).toBe(true);
  });

  it("mantém 015 como hra e 023 como adicional HRA em cada recibo, só em proventos", () => {
    for (const recibo of recibos) {
      const hra = recibo.itens.find((i) => i.codigo === "015");
      const adicional = recibo.itens.find((i) => i.codigo === "023");
      expect(hra?.familia_hra).toBe("hra");
      expect(hra?.tipo).toBe("provento");
      expect(adicional?.familia_hra).toBe("adicional_hra");
      expect(adicional?.tipo).toBe("provento");
    }
    expect(recibos[0].itens.find((i) => i.codigo === "015")?.valor).toBe(1009.3);
    expect(recibos[1].itens.find((i) => i.codigo === "015")?.valor).toBe(1111.11);
    expect(recibos[1].itens.find((i) => i.codigo === "023")?.valor).toBe(222.22);
  });

  it("não classifica desconto como HRA e não mistura rubricas entre os recibos", () => {
    const desconto = recibos[0].itens.find((i) => i.codigo === "423");
    expect(desconto?.familia_hra).toBeNull();
    expect(desconto?.tipo).toBe("desconto");
    expect(recibos[1].itens.some((i) => i.codigo === "423")).toBe(false);
    expect(recibos[0].itens.every((i) => i.valor !== 1111.11)).toBe(true);
  });

  it("lê os totais do recibo fechado sem contaminar o recibo seguinte", () => {
    expect(recibos[0].total_proventos).toBe(7560.43);
    expect(recibos[0].total_descontos).toBe(4358.68);
    expect(recibos[1].total_proventos).toBeNull();
  });
});

describe("parseRecibosDaPagina — páginas com um único recibo não regridem", () => {
  function paginaSimples(empresa: string, codigo: string, descricao: string): TextItem[] {
    y = 800;
    return [
      ...linha([[empresa, 40, 180], ["Recibo de Pagamento de", 360, 110]]),
      ...linha([["Março/2024 Mensal", 360, 80]]),
      ...linha([["Cód.", 30, 20], ["Descrição", 80, 45], ["Referência", 300, 48], ["Vencimentos", 400, 55], ["Descontos", 500, 48]]),
      ...rubrica(codigo, descricao, "1.401,02"),
    ];
  }

  it("Petrobras, Braskem e Tronox continuam com um recibo por página", () => {
    for (const [empresa, codigo, descricao, esperado] of [
      ["PETROLEO BRASILEIRO SA", "1062", "Adicional HRA", "hra"],
      ["BRASKEM SA", "1004", "Hora Repouso Alimentação", "hra"],
      ["TRONOX", "0350", "HORAS REPOUSO ALIMENTACAO", "hra"],
    ] as const) {
      const recibos = parseRecibosDaPagina(paginaSimples(empresa, codigo, descricao), LARGURA);
      expect(recibos).toHaveLength(1);
      expect(recibos[0].competencia).toBe("03/2024");
      expect(recibos[0].itens[0]?.familia_hra).toBe(esperado);
    }
  });
});
