import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { consolidarPaginasContracheque, parsePaginasContracheque, validarContrachequeMoeve, type ContrachequePdf, type TextItemPdf } from "./parse-contracheque-pdf";

type ContraEdge = {
  competencia: string | null; modelo_origem: string; total_proventos: number | null;
  total_descontos: number | null; liquido: number | null;
  itens: Array<{ codigo: string; descricao: string; referencia: number | null; valor: number; tipo: string; familia_hra: string | null }>;
  identidade_moeve?: string | null; rodape_completo_moeve?: boolean;
  cnpj_moeve?: string | null; matricula_moeve?: string | null;
  rotulos_bases_moeve?: boolean; valores_bases_moeve?: boolean; paginas_origem_moeve?: number[];
};

function carregarEdge() {
  const fonte = readFileSync(resolve(process.cwd(), "supabase/functions/process-contracheques-pdf/index.ts"), "utf8");
  const constantes = fonte.split("\n").filter((linha) => /^(const (CODIGO|VALOR|MESES|norm|moeda))/.test(linha)).join("\n");
  const inicio = fonte.indexOf("function expandir(");
  const fim = fonte.indexOf("async function persistirContra(");
  if (inicio < 0 || fim <= inicio) throw new Error("Parser da Edge Function não localizado");
  const js = ts.transpileModule(`${constantes}\n${fonte.slice(inicio, fim)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(`${js}; return { parsePaginas, consolidarLote, validarContraMoeve };`)() as {
    parsePaginas: (itens: TextItemPdf[], largura: number, pagina?: number) => ContraEdge[];
    consolidarLote: (paginas: ContraEdge[], entrada: ContraEdge | null) => { fechados: ContraEdge[]; aberto: ContraEdge | null };
    validarContraMoeve: (contra: ContraEdge) => void;
  };
}

const edge = carregarEdge();

describe("SPEC-001 — Moeve", () => {
  it("mantém o contracheque entre lotes até o rodapé completo", () => {
    const inicial: ContrachequePdf = {
      competencia: "05/2020", modeloOrigem: "moeve", totalProventos: null, totalDescontos: null, liquido: null,
      identidadeMoeve: "13.546.106/0001-37|1064", paginasOrigemMoeve: [2],
      rodapeCompletoMoeve: false, rotulosBasesMoeve: false, valoresBasesMoeve: false,
      itens: [{ codigo: "P003", descricao: "H. R. A.", referencia: 32.5, valor: 100, tipo: "provento" }],
    };
    const fim: ContrachequePdf = {
      ...inicial, totalProventos: 100, totalDescontos: 10, liquido: 90, paginasOrigemMoeve: [3],
      rodapeCompletoMoeve: true, rotulosBasesMoeve: true, valoresBasesMoeve: true,
      itens: [{ codigo: "D206", descricao: "DESCONTO", referencia: null, valor: 10, tipo: "desconto" }],
    };
    const [front] = consolidarPaginasContracheque([inicial, fim]);
    expect(front.paginasOrigemMoeve).toEqual([2, 3]);
    expect(front.itens).toHaveLength(2);
    expect(() => validarContrachequeMoeve(front)).not.toThrow();
    const cabecalhoRepetido = { ...fim, itens: [] };
    expect(consolidarPaginasContracheque([inicial, fim, cabecalhoRepetido])).toHaveLength(1);
    expect(() => consolidarPaginasContracheque([inicial, fim, fim])).toThrow(/novos dados após fechamento/);

    const converter = (contra: ContrachequePdf): ContraEdge => ({
      competencia: contra.competencia, modelo_origem: contra.modeloOrigem,
      total_proventos: contra.totalProventos, total_descontos: contra.totalDescontos, liquido: contra.liquido,
      identidade_moeve: contra.identidadeMoeve, rodape_completo_moeve: contra.rodapeCompletoMoeve,
      rotulos_bases_moeve: contra.rotulosBasesMoeve, valores_bases_moeve: contra.valoresBasesMoeve,
      paginas_origem_moeve: contra.paginasOrigemMoeve,
      itens: contra.itens.map((item) => ({ ...item, familia_hra: item.codigo === "P003" ? "hra" : null })),
    });
    const primeiro = edge.consolidarLote([converter(inicial)], null);
    const segundo = edge.consolidarLote([converter(fim)], primeiro.aberto);
    expect(primeiro.fechados).toHaveLength(0);
    expect(segundo.aberto?.paginas_origem_moeve).toEqual([2, 3]);
    expect(segundo.aberto?.itens).toHaveLength(2);
    expect(() => edge.validarContraMoeve(segundo.aberto!)).not.toThrow();
    expect(edge.consolidarLote([converter(cabecalhoRepetido)], segundo.aberto).aberto?.itens).toHaveLength(2);
    expect(() => edge.consolidarLote([converter(fim)], segundo.aberto)).toThrow(/novos dados após fechamento/);

    const empresa = { ...inicial, identidadeMoeve: null, cnpjMoeve: "13.546.106/0001-37", matriculaMoeve: null };
    const colaborador = { ...fim, identidadeMoeve: null, cnpjMoeve: null, matriculaMoeve: "1064" };
    expect(consolidarPaginasContracheque([empresa, colaborador])[0].identidadeMoeve).toBe("13.546.106/0001-37|1064");
    expect(edge.consolidarLote([{
      ...converter(empresa), identidade_moeve: null, cnpj_moeve: empresa.cnpjMoeve, matricula_moeve: null,
    }, {
      ...converter(colaborador), identidade_moeve: null, cnpj_moeve: null, matricula_moeve: colaborador.matriculaMoeve,
    }], null).aberto?.identidade_moeve).toBe("13.546.106/0001-37|1064");
  });

  it("sinaliza divergência com competência e páginas", () => {
    const contra: ContrachequePdf = {
      competencia: "01/2022", modeloOrigem: "moeve", totalProventos: 100, totalDescontos: 10, liquido: 90,
      identidadeMoeve: "13.546.106/0001-37|1064", paginasOrigemMoeve: [12, 13], rodapeCompletoMoeve: true,
      itens: [{ codigo: "P003", descricao: "H. R. A.", referencia: 32.5, valor: 80, tipo: "provento" }],
    };
    expect(() => validarContrachequeMoeve(contra)).toThrow(/01\/2022 \(páginas 12, 13\).*proventos diverge/);
    expect(() => edge.validarContraMoeve({
      competencia: contra.competencia, modelo_origem: "moeve", total_proventos: 100,
      total_descontos: 10, liquido: 90, identidade_moeve: contra.identidadeMoeve,
      paginas_origem_moeve: [12, 13], rodape_completo_moeve: true,
      itens: [{ ...contra.itens[0], familia_hra: "hra" }],
    })).toThrow(/01\/2022 \(páginas 12, 13\).*proventos diverge/);
  });

  it.skipIf(!process.env.GLCM_MOEVE_PDF)("reconcilia o PDF real nos dois parsers", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await getDocument({ data: new Uint8Array(readFileSync(process.env.GLCM_MOEVE_PDF!)), useSystemFonts: true }).promise;
    const front: ContrachequePdf[] = [];
    const backend: ContraEdge[] = [];
    for (let numero = 1; numero <= pdf.numPages; numero++) {
      const pagina = await pdf.getPage(numero);
      const conteudo = await pagina.getTextContent();
      const itens: TextItemPdf[] = conteudo.items.flatMap((item) => "str" in item && "transform" in item
        ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height }]
        : []);
      const largura = Math.max(...itens.map((item) => item.x + item.width), 595);
      front.push(...parsePaginasContracheque(itens, largura, numero));
      backend.push(...edge.parsePaginas(itens, largura, numero));
    }
    const frontConsolidados = consolidarPaginasContracheque(front);
    const edgeConsolidados: ContraEdge[] = [];
    let aberto: ContraEdge | null = null;
    for (let inicio = 1; inicio <= pdf.numPages; inicio += 5) {
      const lote = backend.filter((contra) => (contra.paginas_origem_moeve?.[0] ?? 0) >= inicio
        && (contra.paginas_origem_moeve?.[0] ?? 0) < inicio + 5);
      const resultado = edge.consolidarLote(lote, aberto);
      edgeConsolidados.push(...resultado.fechados);
      aberto = resultado.aberto;
    }
    if (aberto) edgeConsolidados.push(aberto);
    for (const recibos of [frontConsolidados, edgeConsolidados]) {
      const competencias = recibos.map((contra) => contra.competencia);
      const hra = recibos.flatMap((contra) => contra.itens.filter((rubrica) => rubrica.codigo === "P003"));
      expect(recibos).toHaveLength(69);
      expect(new Set(competencias).size).toBe(69);
      expect(competencias[0]).toBe("01/2020");
      expect(competencias.at(-1)).toBe("09/2025");
      expect(hra).toHaveLength(69);
      expect(Math.round(hra.reduce((soma, rubrica) => soma + rubrica.valor, 0) * 100) / 100).toBe(105000.66);
      expect(hra.reduce((soma, rubrica) => soma + Math.round(rubrica.valor * 0.275 * 100), 0) / 100).toBe(28875.33);
      const marco = recibos.find((contra) => contra.competencia === "03/2024");
      expect(marco?.itens.find((rubrica) => rubrica.codigo === "P003")?.descricao).toBe("H. R. A.");
      const maio = recibos.find((contra) => contra.competencia === "05/2020");
      expect("paginasOrigemMoeve" in maio! ? maio?.paginasOrigemMoeve : maio?.paginas_origem_moeve).toEqual([2, 3]);
    }
    const pendenciasFront = frontConsolidados.flatMap((contra) => {
      try { validarContrachequeMoeve(contra); return []; } catch { return [contra.competencia]; }
    });
    const pendenciasEdge = edgeConsolidados.flatMap((contra) => {
      try { edge.validarContraMoeve(contra); return []; } catch { return [contra.competencia]; }
    });
    expect(pendenciasFront).toEqual(pendenciasEdge);
    expect(pendenciasFront).toEqual([
      "01/2020", "05/2020", "03/2021", "01/2022", "03/2022", "07/2022", "11/2022",
      "05/2023", "09/2023", "01/2024", "07/2024", "11/2024", "05/2025", "09/2025",
    ]);
    await pdf.destroy();
  }, 120_000);
});
