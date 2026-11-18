import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { contrachequesRelacionaisParaRevisao } from "./contracheques-relacionais";
import { parsePaginaContracheque, type TextItemPdf } from "./parse-contracheque-pdf";

type RubricaEdge = { codigo: string; descricao: string; referencia: number | null; valor: number; tipo: string; familia_hra: string | null };
type ContraEdge = { competencia: string | null; modelo_origem: string; total_proventos: number | null; total_descontos: number | null; liquido: number | null; itens: RubricaEdge[] };

function carregarParserEdge() {
  const fonte = readFileSync(resolve(process.cwd(), "supabase/functions/process-contracheques-pdf/index.ts"), "utf8");
  const constantes = fonte.split("\n").filter((linha) => /^(const (CODIGO|VALOR|MESES|norm|moeda))/.test(linha)).join("\n");
  const inicio = fonte.indexOf("function expandir(");
  const fim = fonte.indexOf("// ---------------- consolidação incremental");
  const inicioPersistencia = fonte.indexOf("async function persistirContra(");
  const inicioValidadorMoeve = fonte.indexOf("function validarContraMoeve(");
  const fimPersistencia = fonte.indexOf("// Recorta só as páginas", inicioPersistencia);
  if (inicio < 0 || fim <= inicio) throw new Error("Parser da Edge Function não localizado");
  if (inicioPersistencia < 0 || fimPersistencia <= inicioPersistencia) throw new Error("Persistência da Edge Function não localizada");
  const js = ts.transpileModule(`${constantes}\n${fonte.slice(inicio, fim)}\n${fonte.slice(inicioValidadorMoeve, inicioPersistencia)}\n${fonte.slice(inicioPersistencia, fimPersistencia)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(`${js}; return { parsePagina, validarContraOxiteno, persistirContra };`)() as {
    parsePagina: (itens: TextItemPdf[], largura: number) => ContraEdge;
    validarContraOxiteno: (contra: ContraEdge) => void;
    persistirContra: (db: { from: () => never }, casoId: string, contra: ContraEdge, arquivoNome: string) => Promise<void>;
  };
}

const { parsePagina: parsePaginaEdge, validarContraOxiteno, persistirContra } = carregarParserEdge();
const item = (str: string, x: number, y: number, width = str.length * 2.5): TextItemPdf =>
  ({ str, x, y, width, height: 8 });

function paginaOxiteno(codigo: string, descricao: string, valor: string, separador = 458.5): TextItemPdf[] {
  const tituloProventos = separador === 449.2 ? 367.5 : 376;
  const tituloDescontos = separador === 449.2 ? 472.1 : 485;
  const inicioValor = separador === 449.2 ? 418.4 : 431.5;
  return [
    item("OXITENO S A INDUSTRIA E COMERCIO", 38, 790, 165),
    item("30/NOVEMBRO/2023", 390, 755, 95),
    item("CONTA", 155, 700), item("QTDE.", 313, 700),
    item("VENCIMENTOS", tituloProventos, 700, 32),
    item("DESCONTOS", tituloDescontos, 700, 28),
    item("0010", 38.5, 690, 10), item("Salário Base", 57.5, 690, 30),
    item("|", 301, 690, 1.4), item("180,00", 320, 690, 15),
    item("|", 353.5, 690, 1.4), item("2.021,00", inicioValor, 690, 20),
    item("|", separador, 690, 1.4),
    item(codigo, 38.5, 680, codigo.length * 2.4),
    ...(descricao ? [item(descricao, 57.5, 680, descricao.length * 2.4)] : []),
    item("|", 301, 680, 1.4), item("|", 353.5, 680, 1.4),
    item(valor, inicioValor, 680, separador - inicioValor - 12), item("|", separador, 680, 1.4),
    item("5560", 38.5, 660, 9), item("INSS", 57.5, 660, 10),
    item("|", 301, 660, 1.4), item("|", 353.5, 660, 1.4),
    item("|", separador, 660, 1.4), item("296,92", separador + 65, 660, 15),
    item("BASE/OUTROS", 120, 640, 65),
    item("5501", 38.5, 620, 9), item("Base IR", 57.5, 620, 30),
    item("|", 301, 620, 1.4), item("|", 353.5, 620, 1.4),
    item("|", separador, 620, 1.4), item("1.686,81", separador + 60, 620, 20),
  ];
}

describe("SPEC-001 — Oxiteno", () => {
  it.each([458.5, 449.2])("usa a divisória da própria página (%s) para classificar HRA", (separador) => {
    const itens = paginaOxiteno("3051", "HRA", "283,16", separador);
    const frontend = parsePaginaContracheque(itens, 595);
    const edge = parsePaginaEdge(itens, 595);
    for (const contra of [frontend, edge]) {
      expect(contra.competencia).toBe("11/2023");
      expect(contra.itens.find((rubrica) => rubrica.codigo === "3051")).toMatchObject({
        descricao: "HRA", valor: 283.16, tipo: "provento",
      });
      expect(contra.itens.find((rubrica) => rubrica.codigo === "5560")?.tipo).toBe("desconto");
      expect(contra.itens.find((rubrica) => rubrica.codigo === "5501")?.tipo).toBe("informativo");
      expect(contra.itens.find((rubrica) => rubrica.codigo === "0010")?.referencia).toBe(180);
    }
  });

  it("separa código e descrição unidos em 3051HRA", () => {
    const itens = paginaOxiteno("3051HRA", "", "656,83");
    for (const contra of [parsePaginaContracheque(itens, 595), parsePaginaEdge(itens, 595)]) {
      expect(contra.itens.find((rubrica) => rubrica.codigo === "3051")).toMatchObject({
        descricao: "HRA", valor: 656.83, tipo: "provento",
      });
    }
  });

  it("sinaliza limites ilegíveis e reconhece BASE/OUTROS pelo primeiro item informativo", () => {
    const semDivisorias = paginaOxiteno("3051", "HRA", "283,16").filter((i) => i.str !== "|");
    expect(() => parsePaginaContracheque(semDivisorias, 595)).toThrow(/limites financeiros ilegíveis/);
    expect(() => parsePaginaEdge(semDivisorias, 595)).toThrow(/limites financeiros ilegíveis/);

    const marcadorIlegivel = paginaOxiteno("3051", "HRA", "283,16").filter((i) => i.str !== "BASE/OUTROS");
    for (const contra of [parsePaginaContracheque(marcadorIlegivel, 595), parsePaginaEdge(marcadorIlegivel, 595)]) {
      expect(contra.itens.find((rubrica) => rubrica.codigo === "5501")?.tipo).toBe("informativo");
    }
  });

  it("lê totais impressos mesmo com colchete e deslocamento vertical", () => {
    const itens = [
      ...paginaOxiteno("3051", "HRA", "283,16"),
      item("TOTAIS", 75, 605, 35),
      item("2.304,16]", 272, 598, 30), item("296,92]", 406, 598, 25), item("2.007,24", 521, 598, 28),
    ];
    const frontend = parsePaginaContracheque(itens, 595);
    const edge = parsePaginaEdge(itens, 595);
    expect([frontend.totalProventos, frontend.totalDescontos, frontend.liquido]).toEqual([2304.16, 296.92, 2007.24]);
    expect([edge.total_proventos, edge.total_descontos, edge.liquido]).toEqual([2304.16, 296.92, 2007.24]);
  });

  it("leva 3331 a AHRA e exclui somente HRA sem IR da base", () => {
    const itens = paginaOxiteno("3331", "HRA-Dif. Dissídio", "50,75");
    const edge = parsePaginaEdge(itens, 595);
    expect(edge.itens.find((rubrica) => rubrica.codigo === "3331")).toMatchObject({
      tipo: "provento", familia_hra: "ahra", valor: 50.75,
    });
    const linhas = contrachequesRelacionaisParaRevisao([
      { id: "nov", modelo_origem: "oxiteno", competencia: "11/2025", itens_contracheque: [
        { codigo: "3320", descricao: "HRA sem IR", tipo: "provento", familia_hra: "hra", valor: 563.05 },
        { codigo: "3331", descricao: "HRA-Dif. Dissídio", tipo: "provento", familia_hra: "ahra", valor: 50.75 },
      ] },
      { id: "dez", modelo_origem: "oxiteno", competencia: "12/2025", itens_contracheque: [
        { codigo: "3320", descricao: "HRA sem IR", tipo: "provento", familia_hra: "hra", valor: 844.57 },
      ] },
      { id: "jan", modelo_origem: "oxiteno", competencia: "01/2024", itens_contracheque: [
        { codigo: "3320", descricao: "HRA IR", tipo: "provento", familia_hra: "hra", valor: 707.91 },
      ] },
    ]);
    expect(linhas).toEqual([
      { id: "nov", label: "11/2025", valor_hra: 0, valor_ahra: 50.75 },
      { id: "jan", label: "01/2024", valor_hra: 707.91, valor_ahra: 0 },
    ]);
  });

  it("bloqueia persistência quando proventos extraídos excedem o total impresso", async () => {
    const contra = parsePaginaEdge(paginaOxiteno("3051", "HRA", "675,55"), 595);
    expect(() => validarContraOxiteno({ ...contra, total_proventos: 2694.55 })).toThrow(/Conferir o valor na imagem do PDF/);
    const db = { from: () => { throw new Error("insert não deveria ser chamado"); } };
    await expect(persistirContra(db, "caso", { ...contra, total_proventos: 2694.55 }, "arquivo.pdf"))
      .rejects.toThrow(/Conferir o valor na imagem do PDF/);
  });

  it.skipIf(!process.env.GLCM_OXITENO_PDF)("reconcilia o PDF de validação completo nos dois parsers", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = new Uint8Array(readFileSync(process.env.GLCM_OXITENO_PDF!));
    const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    const contracheques = [];
    const pendentes = [];
    expect(pdf.numPages).toBe(39);
    for (let pagina = 1; pagina <= pdf.numPages; pagina++) {
      const page = await pdf.getPage(pagina);
      const content = await page.getTextContent();
      const itens: TextItemPdf[] = content.items.flatMap((i) =>
        "str" in i && "transform" in i
          ? [{ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width, height: i.height }]
          : [],
      );
      const frontend = parsePaginaContracheque(itens, page.view[2]);
      const edge = parsePaginaEdge(itens, page.view[2]);
      try { validarContraOxiteno(edge); } catch { pendentes.push(pagina); }
      expect(frontend.competencia, `página ${pagina}`).toBeTruthy();
      expect(edge.competencia, `página ${pagina}`).toBe(frontend.competencia);
      const hraFrontend = frontend.itens.filter((i) => /HRA/.test(i.descricao));
      const hraEdge = edge.itens.filter((i) => /HRA/.test(i.descricao));
      expect(hraEdge.map((i) => [i.codigo, i.valor, i.tipo]), `página ${pagina}`).toEqual(
        hraFrontend.map((i) => [i.codigo, i.valor, i.tipo]),
      );
      contracheques.push({
        id: String(pagina), modelo_origem: "oxiteno", competencia: edge.competencia,
        itens_contracheque: edge.itens,
      });
      page.cleanup();
    }
    const linhas = contrachequesRelacionaisParaRevisao(contracheques);
    expect(new Set(contracheques.map((i) => i.competencia)).size).toBe(39);
    expect(linhas).toHaveLength(36);
    expect(pendentes).toEqual([10]); // 08/2023: texto 675,55; imagem validada 673,55.
    expect(linhas.reduce((s, i) => s + i.valor_hra + i.valor_ahra, 0).toFixed(2)).toBe("25074.42");
  }, 20000);
});
