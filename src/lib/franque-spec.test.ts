import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  consolidarPaginasContracheque,
  parsePaginasContracheque,
  type ContrachequePdf,
  type TextItemPdf,
} from "./parse-contracheque-pdf";

const PAGINAS_TRONOX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 14];
const PAGINAS_BASF = [10, 12, 13, ...Array.from({ length: 72 }, (_, indice) => indice + 15), 88, 90, 92, 93, 94];

function ehHra(item: ContrachequePdf["itens"][number]): boolean {
  return /\bhra\b|repouso|aliment|dif\.?\s*dissidio/i.test(item.descricao);
}

function divergenciasFinanceiras(recibos: ContrachequePdf[]): ContrachequePdf[] {
  return recibos.filter((recibo) => {
    const soma = (tipo: "provento" | "desconto") => recibo.itens
      .filter((item) => item.tipo === tipo)
      .reduce((total, item) => total + item.valor, 0);
    return (recibo.totalProventos != null && Math.abs(soma("provento") - recibo.totalProventos) > 0.05)
      || (recibo.totalDescontos != null && Math.abs(soma("desconto") - recibo.totalDescontos) > 0.05)
      || (recibo.totalProventos != null && recibo.totalDescontos != null && recibo.liquido != null
        && Math.abs(recibo.totalProventos - recibo.totalDescontos - recibo.liquido) > 0.05);
  });
}

type PdfDocument = Awaited<ReturnType<typeof getDocument>["promise"]>;

async function lerGrupo(pdf: PdfDocument, paginasEsperadas: number[]) {
  const paginas: ContrachequePdf[] = [];
  for (const numero of paginasEsperadas) {
    const pagina = await pdf.getPage(numero);
    const conteudo = await pagina.getTextContent();
    const itens: TextItemPdf[] = conteudo.items.flatMap((item) => "str" in item && "transform" in item
      ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height }]
      : []);
    const largura = Math.max(...itens.map((item) => item.x + item.width), 595);
    paginas.push(...parsePaginasContracheque(itens, largura, numero));
  }
  return consolidarPaginasContracheque(paginas);
}

describe("SPEC-007 — fonte Franque separada por empresa", () => {
  it.skipIf(!process.env.GLCM_FRANQUE_PDF)("mantém BASF e TRONOX separados e concilia os totais", async () => {
    const pdf = await getDocument({
      data: new Uint8Array(readFileSync(process.env.GLCM_FRANQUE_PDF!)),
      useSystemFonts: true,
    }).promise;
    try {
      const tronox = await lerGrupo(pdf, PAGINAS_TRONOX);
      const basf = await lerGrupo(pdf, PAGINAS_BASF);

      expect(tronox).toHaveLength(11);
      expect(new Set(tronox.map((recibo) => recibo.competencia)).size).toBe(11);
      expect(tronox.flatMap((recibo) => recibo.itens.filter(ehHra))).toHaveLength(10);
      expect(new Set(tronox.map((recibo) => recibo.modeloOrigem))).toEqual(new Set(["tronox"]));
      expect(divergenciasFinanceiras(tronox)).toHaveLength(0);

      expect(basf).toHaveLength(78);
      expect(new Set(basf.map((recibo) => recibo.competencia).filter(Boolean)).size).toBe(47);
      expect(basf.flatMap((recibo) => recibo.itens.filter(ehHra))).toHaveLength(52);
      expect(new Set(basf.map((recibo) => recibo.modeloOrigem))).toEqual(new Set(["basf"]));
      expect(divergenciasFinanceiras(basf)).toHaveLength(0);
    } finally {
      await pdf.destroy();
    }
  }, 120_000);
});
