// Regra GERAL de consolidação do modelo Companhia Brasileira de Estireno (unigel),
// carregando o trecho real da Edge Function process-contracheques-pdf.
// Canônica: o recibo atual só absorve a folha seguinte quando ELE traz
// "CONTINUA..." E a competência seguinte é exatamente igual. Competência
// diferente (ou nula) fecha o recibo e inicia outro.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type TextItem = { str: string; x: number; y: number; width: number; height: number };
type Rubrica = { codigo: string; descricao: string; referencia: number | null; valor: number; tipo: string; familia_hra: string | null };
type Contra = {
  competencia: string | null; modelo_origem: string; total_proventos: number | null;
  total_descontos: number | null; liquido: number | null; itens: Rubrica[]; continua?: boolean;
};

function carregarParser() {
  const fonte = readFileSync(
    resolve(process.cwd(), "supabase/functions/process-contracheques-pdf/index.ts"),
    "utf8",
  );
  const constantes = fonte
    .split("\n")
    .filter((l) => /^(const (CODIGO|VALOR|MESES|norm|moeda))/.test(l))
    .join("\n");
  const inicio = fonte.indexOf("function expandir(");
  const fim = fonte.indexOf("// Grava um contracheque fechado");
  if (inicio < 0 || fim <= inicio) throw new Error("Trecho do parser/consolidador não localizado");
  const js = ts.transpileModule(`${constantes}\n${fonte.slice(inicio, fim)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(`${js}; return { parseRecibosDaPagina, consolidarLote };`)() as {
    parseRecibosDaPagina: (itens: TextItem[], largura: number) => Contra[];
    consolidarLote: (paginas: Contra[], entrada: Contra | null) => { fechados: Contra[]; aberto: Contra | null };
  };
}

const { parseRecibosDaPagina, consolidarLote } = carregarParser();

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

const totais = () => [
  ...linha([["Total Vencimentos", 380, 80], ["7.560,43", 470, 40]]),
  ...linha([["Total Descontos", 380, 70], ["4.358,68", 470, 40]]),
];

// Uma folha física com um único recibo. `continua` marca "CONTINUA..." no rodapé.
function folha(mes: string, hra: string, ahra: string, continua: boolean): TextItem[] {
  y = 800;
  return [
    ...cabecalhoRecibo(mes),
    ...rubrica("015", "Hrs Repouso Alimentacao", hra),
    ...rubrica("023", "Vlr Adicional HRA S Hextra", ahra),
    ...(continua ? linha([["CONTINUA...", 30, 60]]) : totais()),
  ];
}

function paginas(...folhas: TextItem[][]): Contra[] {
  return folhas.flatMap((itens) => parseRecibosDaPagina(itens, LARGURA));
}

function consolidar(...folhas: TextItem[][]): Contra[] {
  const { fechados, aberto } = consolidarLote(paginas(...folhas), null);
  return aberto ? [...fechados, aberto] : fechados;
}

const soma = (c: Contra, familia: string) =>
  c.itens.filter((i) => i.familia_hra === familia && i.tipo === "provento").reduce((s, i) => s + i.valor, 0);

describe("consolidação Unigel — regra geral CONTINUA... + mesma competência", () => {
  it("recibo de uma folha, sem CONTINUA, fecha sozinho", () => {
    const recibos = consolidar(folha("Janeiro/2023", "1.000,00", "100,00", false));
    expect(recibos).toHaveLength(1);
    expect(recibos[0].competencia).toBe("01/2023");
    expect(soma(recibos[0], "hra")).toBe(1000);
    expect(soma(recibos[0], "adicional_hra")).toBe(100);
  });

  it("duas folhas da mesma competência com CONTINUA formam um recibo só", () => {
    const recibos = consolidar(
      folha("Janeiro/2023", "1.000,00", "100,00", true),
      folha("Janeiro/2023", "200,00", "20,00", false),
    );
    expect(recibos).toHaveLength(1);
    expect(recibos[0].competencia).toBe("01/2023");
    expect(soma(recibos[0], "hra")).toBe(1200);
    expect(soma(recibos[0], "adicional_hra")).toBe(120);
  });

  it("três folhas encadeadas da mesma competência, cada continuidade marcada", () => {
    const recibos = consolidar(
      folha("Março/2023", "1.000,00", "100,00", true),
      folha("Março/2023", "200,00", "20,00", true),
      folha("Março/2023", "30,00", "3,00", false),
    );
    expect(recibos).toHaveLength(1);
    expect(recibos[0].competencia).toBe("03/2023");
    expect(soma(recibos[0], "hra")).toBe(1230);
    expect(soma(recibos[0], "adicional_hra")).toBe(123);
  });

  it("CONTINUA seguido de competência diferente fecha e inicia outro recibo", () => {
    const recibos = consolidar(
      folha("Janeiro/2023", "1.000,00", "349,86", true),
      folha("Fevereiro/2023", "1.111,11", "272,78", false),
    );
    expect(recibos.map((r) => r.competencia)).toEqual(["01/2023", "02/2023"]);
    expect(soma(recibos[0], "adicional_hra")).toBe(349.86);
    expect(soma(recibos[1], "adicional_hra")).toBe(272.78);
    // nunca soma cruzada entre competências
    expect(soma(recibos[0], "adicional_hra")).not.toBe(622.64);
  });

  it("sem CONTINUA, a folha seguinte de mesma competência não é absorvida", () => {
    const recibos = consolidar(
      folha("Abril/2023", "1.000,00", "100,00", false),
      folha("Abril/2023", "200,00", "20,00", false),
    );
    expect(recibos).toHaveLength(2);
    expect(recibos.map((r) => soma(r, "hra"))).toEqual([1000, 200]);
  });

  it("sequência mista: página com dois recibos entre folhas continuadas", () => {
    y = 800;
    const paginaDupla = [
      ...cabecalhoRecibo("Junho/2023"),
      ...rubrica("015", "Hrs Repouso Alimentacao", "500,00"),
      ...totais(),
      ...cabecalhoRecibo("Julho/2023"),
      ...rubrica("015", "Hrs Repouso Alimentacao", "900,00"),
      ...rubrica("023", "Vlr Adicional HRA S Hextra", "90,00"),
      ...linha([["CONTINUA...", 30, 60]]),
    ];
    const recibos = consolidar(
      folha("Maio/2023", "1.000,00", "100,00", true),
      folha("Maio/2023", "50,00", "5,00", false),
      paginaDupla,
      folha("Julho/2023", "100,00", "10,00", false),
    );
    expect(recibos.map((r) => r.competencia)).toEqual(["05/2023", "06/2023", "07/2023"]);
    expect(soma(recibos[0], "hra")).toBe(1050);
    expect(soma(recibos[1], "hra")).toBe(500);
    expect(soma(recibos[2], "hra")).toBe(1000);
    expect(soma(recibos[2], "adicional_hra")).toBe(100);
  });

  it("competência nula não é absorvida silenciosamente no recibo anterior", () => {
    y = 800;
    const semCabecalho = [
      ...linha([["Cód.", 30, 20], ["Descrição", 80, 45], ["Referência", 300, 48], ["Vencimentos", 400, 55], ["Descontos", 500, 48]]),
      ...rubrica("015", "Hrs Repouso Alimentacao", "777,00"),
    ];
    const recibos = consolidar(folha("Agosto/2023", "1.000,00", "100,00", true), semCabecalho);
    expect(recibos).toHaveLength(2);
    expect(recibos[0].competencia).toBe("08/2023");
    expect(soma(recibos[0], "hra")).toBe(1000);
    expect(recibos[1].competencia).toBeNull();
  });

  it("descontos ficam fora das somas HRA/AHRA", () => {
    y = 800;
    const comDesconto = [
      ...cabecalhoRecibo("Setembro/2023"),
      ...rubrica("015", "Hrs Repouso Alimentacao", "800,00"),
      ...rubrica("015", "Hrs Repouso Alimentacao", "99,00", 500),
      ...totais(),
    ];
    const recibos = consolidar(comDesconto);
    expect(soma(recibos[0], "hra")).toBe(800);
    expect(recibos[0].itens.find((i) => i.valor === 99)?.tipo).toBe("desconto");
    expect(recibos[0].itens.find((i) => i.valor === 99)?.familia_hra).toBeNull();
  });
});
