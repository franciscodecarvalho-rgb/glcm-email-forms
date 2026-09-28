// Regressão: página física com DOIS recibos (Unigel/Companhia Brasileira de
// Estireno) + folha complementar. Agosto/2023 começa com CONTINUA... e é
// completado pela folha seguinte de mesma competência; Setembro/2023 permanece
// separado. Nenhuma competência pode ser inferida como "mês seguinte".
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

// Página física com dois recibos: Agosto/2023 (com CONTINUA...) no topo e
// Setembro/2023 embaixo.
function paginaDupla(): TextItem[] {
  y = 800;
  return [
    ...cabecalhoRecibo("Agosto/2023"),
    ...rubrica("015", "Hrs Repouso Alimentacao", "219,69"),
    ...rubrica("023", "Vlr Adicional HRA S Hextra", "73,44"),
    ...linha([["CONTINUA...", 30, 60]]),
    ...cabecalhoRecibo("Setembro/2023"),
    ...rubrica("023", "Vlr Adicional HRA S Hextra", "11,60"),
    ...totais(),
  ];
}

// Folha complementar de Agosto/2023, sem CONTINUA..., que fecha o recibo.
function folhaComplementarAgosto(): TextItem[] {
  y = 800;
  return [
    ...cabecalhoRecibo("Agosto/2023"),
    ...totais(),
  ];
}

const soma = (c: Contra, familia: string) =>
  c.itens.filter((i) => i.familia_hra === familia && i.tipo === "provento").reduce((s, i) => s + i.valor, 0);

describe("Unigel — dois recibos por página + folha complementar de Agosto/2023", () => {
  // Ordem visual real do PDF: agosto (topo, CONTINUA), complemento de agosto,
  // e por fim setembro.
  const daPagina = parseRecibosDaPagina(paginaDupla(), LARGURA);
  const complemento = parseRecibosDaPagina(folhaComplementarAgosto(), LARGURA);
  const sequencia = [daPagina[0], ...complemento, daPagina[1]];
  const { fechados, aberto } = consolidarLote(sequencia, null);
  const recibos = aberto ? [...fechados, aberto] : fechados;

  it("separa os dois recibos da mesma página física", () => {
    expect(daPagina).toHaveLength(2);
    expect(daPagina.map((r) => r.competencia)).toEqual(["08/2023", "09/2023"]);
  });

  it("agosto absorve apenas a folha complementar de mesma competência", () => {
    expect(recibos.map((r) => r.competencia)).toEqual(["08/2023", "09/2023"]);
  });

  it("agosto tem HRA 219,69 e AHRA 73,44", () => {
    expect(soma(recibos[0], "hra")).toBe(219.69);
    expect(soma(recibos[0], "adicional_hra")).toBe(73.44);
  });

  it("setembro fica separado e só com 11,60 em adicional_hra", () => {
    expect(soma(recibos[1], "adicional_hra")).toBe(11.6);
    expect(soma(recibos[1], "hra")).toBe(0);
    // nunca soma cruzada entre competências
    expect(soma(recibos[0], "adicional_hra")).not.toBe(85.04);
  });

  it("competência ilegível permanece null, nunca inferida como mês seguinte", () => {
    y = 800;
    const semCabecalho = [
      ...linha([["COMPANHIA BRASILEIRA DE ESTIRENO", 40, 180], ["Recibo de Pagamento de", 360, 110]]),
      ...linha([["Cód.", 30, 20], ["Descrição", 80, 45], ["Referência", 300, 48], ["Vencimentos", 400, 55], ["Descontos", 500, 48]]),
      ...rubrica("015", "Hrs Repouso Alimentacao", "500,00"),
      ...cabecalhoRecibo("Outubro/2023"),
      ...rubrica("015", "Hrs Repouso Alimentacao", "600,00"),
    ];
    y = 800;
    const comSegundoIlegivel = [
      ...cabecalhoRecibo("Outubro/2023"),
      ...rubrica("015", "Hrs Repouso Alimentacao", "600,00"),
      ...linha([["COMPANHIA BRASILEIRA DE ESTIRENO", 40, 180], ["Recibo de Pagamento de", 360, 110]]),
      ...linha([["Cód.", 30, 20], ["Descrição", 80, 45], ["Referência", 300, 48], ["Vencimentos", 400, 55], ["Descontos", 500, 48]]),
      ...rubrica("015", "Hrs Repouso Alimentacao", "500,00"),
    ];
    expect(parseRecibosDaPagina(semCabecalho, LARGURA)[0].competencia).toBeNull();
    const r = parseRecibosDaPagina(comSegundoIlegivel, LARGURA);
    expect(r[0].competencia).toBe("10/2023");
    expect(r[1].competencia).toBeNull();
  });
});
