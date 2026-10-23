import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Item = { str: string; x: number; y: number; width: number; height: number };
type Contra = { modelo_origem: string; competencia: string | null; retificado?: boolean };

function carregarParserEdge() {
  const fonte = readFileSync(
    resolve(process.cwd(), "supabase/functions/process-contracheques-pdf/index.ts"),
    "utf8",
  );
  const constantes = fonte
    .split("\n")
    .filter((linha) => /^(const (CODIGO|VALOR|MESES|norm|moeda))/.test(linha))
    .join("\n");
  const inicio = fonte.indexOf("function expandir(");
  const fim = fonte.indexOf("// Grava um contracheque fechado");
  if (inicio < 0 || fim <= inicio) throw new Error("Parser de contracheques da Edge Function não localizado");
  const js = ts.transpileModule(`${constantes}\n${fonte.slice(inicio, fim)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(`${js}; return parsePagina;`)() as (itens: Item[], largura: number) => Contra;
}

const parsePagina = carregarParserEdge();
const item = (str: string, x: number, y: number): Item => ({ str, x, y, width: str.length * 5, height: 10 });

describe("marcação de retificação BASF na Edge Function", () => {
  it("marca apenas o campo Pagamento Referente iniciado por R", () => {
    const base = [
      item("BASF", 20, 500),
      item("Pagamento", 20, 430), item("Referente", 80, 430), item("a", 130, 430), item("Salario/Bolsa", 350, 430),
      item("S-CP/SPAO3", 20, 410), item("BR100730", 120, 410), item("R Setembro", 300, 410), item("202", 370, 410),
      item("Rubrica", 20, 380), item("Qtde.", 110, 380), item("Descrição", 180, 380),
      item("Proventos", 580, 380), item("Descontos", 700, 380),
      item("3A20", 20, 360), item("180,00", 110, 360), item("Adicional", 180, 360),
      item("de", 220, 360), item("periculos.", 240, 360), item("1.693,26", 590, 360),
      item("Data de", 20, 100), item("Crédito", 60, 100), item("30.09.2023", 60, 80),
    ];

    const retificado = parsePagina(base, 842);
    const original = parsePagina(base.map((linha) =>
      linha.str === "R Setembro" ? { ...linha, str: "Setembro" } : linha,
    ), 842);

    expect(retificado).toMatchObject({ modelo_origem: "basf", competencia: "09/2023", retificado: true });
    expect(original).toMatchObject({ modelo_origem: "basf", competencia: "09/2023" });
    expect(original).not.toHaveProperty("retificado");
  });
});
