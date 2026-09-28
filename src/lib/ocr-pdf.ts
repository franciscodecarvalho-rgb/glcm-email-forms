import type { TextItemPdf } from "./parse-contracheque-pdf";
import type { PDFPageProxy } from "pdfjs-dist";
import type Tesseract from "tesseract.js";

export const OCR_RENDER_SCALE = 2;
export const OCR_MIN_CONFIDENCE = 45;

export type OcrProgress = {
  pagina: number;
  totalPaginas: number;
  confianca: number;
  itens: number;
};

export type OcrPageResult = {
  itens: Array<TextItemPdf & { confianca: number }>;
  texto: string;
  confianca: number;
};

export type OcrSessao = {
  reconhecerPagina: (pagina: PDFPageProxy) => Promise<OcrPageResult>;
  encerrar: () => Promise<void>;
};

type Bbox = { x0: number; y0: number; x1: number; y1: number };
type OcrWord = { text?: string; confidence?: number; bbox?: Bbox };
type OcrPage = Pick<Tesseract.Page, "confidence" | "text"> & {
  blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: OcrWord[] }> }> }>;
};

export function palavrasOcrParaItens(
  page: OcrPage,
  larguraPixels: number,
  alturaPixels: number,
  escala = OCR_RENDER_SCALE,
): Array<TextItemPdf & { confianca: number }> {
  const palavras = page.blocks?.flatMap((bloco) =>
    bloco.paragraphs?.flatMap((paragrafo) =>
      paragrafo.lines?.flatMap((linha) => linha.words ?? []) ?? [],
    ) ?? [],
  ) ?? [];

  return palavras.flatMap((palavra) => {
    const texto = palavra.text?.trim() ?? "";
    const bbox = palavra.bbox;
    if (!texto || !bbox) return [];

    const confianca = Number.isFinite(Number(palavra.confidence)) ? Number(palavra.confidence) : 0;
    const x = bbox.x0 / escala;
    const y = (alturaPixels - (bbox.y0 + bbox.y1) / 2) / escala;
    const width = Math.max((bbox.x1 - bbox.x0) / escala, 1);
    const height = Math.max((bbox.y1 - bbox.y0) / escala, 1);

    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > larguraPixels / escala) return [];
    return [{ str: texto, x, y, width, height, confianca }];
  });
}

function criarCanvas(largura: number, altura: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(largura, altura);
  if (typeof document === "undefined") throw new Error("OCR requer um ambiente com Canvas");
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  return canvas;
}

async function criarWorker(onProgress?: (status: string, progresso: number) => void) {
  const { createWorker } = await import("tesseract.js");
  return createWorker("por", 1, {
    logger: (mensagem: { status?: string; progress?: number }) => {
      onProgress?.(mensagem.status ?? "OCR", mensagem.progress ?? 0);
    },
  });
}

export async function ocrPaginaPdf(
  pagina: PDFPageProxy,
  onProgress?: (status: string, progresso: number) => void,
): Promise<OcrPageResult> {
  const sessao = await criarSessaoOcr(onProgress);
  try {
    return await sessao.reconhecerPagina(pagina);
  } finally {
    await sessao.encerrar();
  }
}

export async function criarSessaoOcr(
  onProgress?: (status: string, progresso: number) => void,
): Promise<OcrSessao> {
  const worker = await criarWorker(onProgress);
  await worker.setParameters({
    tessedit_pageseg_mode: "3",
    preserve_interword_spaces: "1",
    user_defined_dpi: "200",
  });

  return {
    async reconhecerPagina(pagina: PDFPageProxy) {
      const viewport = pagina.getViewport({ scale: OCR_RENDER_SCALE });
      const canvas = criarCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const contexto = canvas.getContext("2d");
      if (!contexto) throw new Error("Não foi possível criar o contexto Canvas para OCR");
      await pagina.render({ canvasContext: contexto, viewport }).promise;
      const resultado = await worker.recognize(canvas, {}, { blocks: true });
      const itens = palavrasOcrParaItens(resultado.data, viewport.width, viewport.height, OCR_RENDER_SCALE);
      const confianca = Number.isFinite(Number(resultado.data.confidence)) ? Number(resultado.data.confidence) : 0;
      return {
        itens,
        texto: resultado.data.text?.trim() ?? itens.map((item) => item.str).join(" "),
        confianca,
      };
    },
    encerrar: () => worker.terminate().then(() => undefined),
  };
}
