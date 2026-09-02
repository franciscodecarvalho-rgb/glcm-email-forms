// Testa a função `familia` da Edge Function process-contracheques-pdf carregando
// o trecho real do arquivo (validação executável, sem duplicar a lógica).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function carregarFamilia() {
  const fonte = readFileSync(
    resolve(process.cwd(), "supabase/functions/process-contracheques-pdf/index.ts"),
    "utf8",
  );
  const norm = fonte.slice(fonte.indexOf("const norm ="));
  const normLinha = norm.slice(0, norm.indexOf("\n"));
  const inicio = fonte.indexOf("function familia(");
  const fim = fonte.indexOf("function parsePagina(");
  if (inicio < 0 || fim <= inicio) throw new Error("Trecho `familia` não localizado");
  const js = ts.transpileModule(`${normLinha}\n${fonte.slice(inicio, fim)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(`${js}; return familia;`)() as (
    codigo: string,
    descricao: string,
    modeloOrigem: string,
    tipo?: string,
  ) => string | null;
}

const familia = carregarFamilia();

describe("familia (Edge Function process-contracheques-pdf)", () => {
  it("classifica 1004 + Hora Repouso Alimentação como hra, mesmo sem modelo braskem", () => {
    expect(familia("1004", "Hora Repouso Alimentação", "")).toBe("hra");
    expect(familia("1004", "HORA DE REPOUSO E ALIMENTACAO", "desconhecido")).toBe("hra");
    expect(familia("1004", "Dif Hora Repouso Alimentação", "braskem")).toBe("hra");
  });
  it("não torna o código 1004 global para descrições diferentes", () => {
    expect(familia("1004", "Salário Básico", "")).toBeNull();
    expect(familia("1004", "Adicional Noturno", "braskem")).toBeNull();
  });

  it("classifica 015 como hra pelo par código + descrição, inclusive no modelo generico", () => {
    expect(familia("015", "Hrs Repouso e Alimentação", "unigel")).toBe("hra");
    expect(familia("015", "Horas de Repouso e Alimentacao", "unigel")).toBe("hra");
    expect(familia("015", "Hrs Repouso Alimentacao", "generico")).toBe("hra");
    expect(familia("015", "Hrs Repouso e Alimentação", "")).toBe("hra");
    expect(familia("015", "Salário Básico", "generico")).toBeNull();
    expect(familia("015", "Adicional Noturno", "unigel")).toBeNull();
  });

  it("preserva a regra BASF 3A20 e as regras por descrição", () => {
    expect(familia("3A20", "Verba 3A20", "basf")).toBe("hra");
    expect(familia("3A20", "Verba 3A20", "braskem")).toBeNull();
    expect(familia("1062", "Adicional HRA", "")).toBe("adicional_hra");
    expect(familia("023", "Vlr Adicional HRA S Hextra", "unigel")).toBe("adicional_hra");
    expect(familia("0208", "AHRA/Dobra de Turno", "")).toBe("ahra_dobra");
    expect(familia("4208", "Dif AHRA Dobra", "")).toBe("dif_ahra");
    expect(familia("0077", "HRA", "")).toBe("hra");
    expect(familia("0001", "Salário Básico", "")).toBeNull();
  });

});

describe("Petrobras — HRA/AHRA", () => {
  it("classifica Dif/DI AHRA como ahra", () => {
    expect(familia("4208", "Dif AHRA", "petrobras")).toBe("ahra");
    expect(familia("4208", "DI AHRA", "petrobras")).toBe("ahra");
  });

  it("classifica Adicional HRA (exato) como hra e mantém Adic HRA Eventual", () => {
    expect(familia("1062", "Adicional HRA", "petrobras")).toBe("hra");
    expect(familia("1063", "Adic HRA Eventual", "petrobras")).toBe("adicional_hra");
  });

  it("não altera outras empresas", () => {
    expect(familia("4208", "Dif AHRA Dobra", "")).toBe("dif_ahra");
    expect(familia("1062", "Adicional HRA", "")).toBe("adicional_hra");
    expect(familia("3A20", "Verba 3A20", "basf")).toBe("hra");
  });
});

describe("contribuição extraordinária PPSP (Petrobras)", () => {
  it("classifica 1489 e 6060/6070 pelo par código + nomenclatura PPSP somente como desconto", () => {
    expect(familia("1489", "Contrib Extra PPSP", "petrobras", "desconto")).toBe("contrib_extra");
    expect(familia("1489", "CONTRIB. EXTRA PPSP-R", "petrobras", "desconto")).toBe("contrib_extra");
    expect(familia("6060", "Contrib. Extraordinária PPSP-R", "petrobras", "desconto")).toBe("contrib_extra");
    expect(familia("6070", "CONTRIB EXTRAORDINARIA PPSP", "petrobras", "desconto")).toBe("contrib_extra");
    expect(familia("1489", "Contrib Extra PPSP", "petrobras", "provento")).toBeNull();
  });

  it("não classifica fora do modelo petrobras nem para descrições diferentes", () => {
    expect(familia("1489", "Contrib Extra PPSP", "braskem")).toBeNull();
    expect(familia("6050", "CONTRIB EXTRAORDINARIA PPSP", "")).toBeNull();
    expect(familia("6050", "Salário Básico", "petrobras")).toBeNull();
    expect(familia("1489", "Contribuição Sindical", "petrobras")).toBeNull();
    expect(familia("6050", "CONTRIB EXTRAORDINARIA PPSP", "petrobras")).toBeNull();
    expect(familia("6060", "Contrib Extra PPSP", "petrobras")).toBeNull();
  });
});
