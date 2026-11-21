import { detectarModelo, type TextItemPdf } from "./parse-contracheque-pdf";
import { conferirCabecalhoContracheque, type EmpresaContracheque } from "./perfis-contracheque";
import { conferirValoresInformativosMataripe, leituraMataripeReconcilia, limparGradeOcrMataripe, recuperarTotaisMataripe, relerCelulasOcrMataripe, relerFaixasOcrMataripe, relerTotaisOcrMataripe } from "./ocr-mataripe";
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
  empresa?: EmpresaContracheque,
): Promise<OcrSessao> {
  const worker = await criarWorker(onProgress);
  await worker.setParameters({
    tessedit_pageseg_mode: "3" as unknown as import("tesseract.js").PSM,
    preserve_interword_spaces: "1",
    user_defined_dpi: "200",
  });

  const renderizar = async (pagina: PDFPageProxy, escala: number) => {
    const viewport = pagina.getViewport({ scale: escala });
    const canvas = criarCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const contexto = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!contexto) throw new Error("Não foi possível criar o contexto Canvas para OCR");
    await pagina.render({ canvasContext: contexto, viewport }).promise;
    return canvas;
  };

  const ler = async (canvas: HTMLCanvasElement | OffscreenCanvas, escala: number): Promise<OcrPageResult> => {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const itens = palavrasOcrParaItens(data, canvas.width, canvas.height, escala);
    return {
      itens,
      texto: data.text?.trim() ?? itens.map((item) => item.str).join(" "),
      confianca: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 0,
    };
  };

  const identidadeMataripe = (resultado: OcrPageResult) =>
    conferirCabecalhoContracheque(resultado.itens, "acelen", detectarModelo);
  const confereMataripe = (resultado: OcrPageResult, largura: number) =>
    resultado.confianca >= OCR_MIN_CONFIDENCE
    && identidadeMataripe(resultado) === "confirmada"
    && leituraMataripeReconcilia(resultado.itens, largura);

  return {
    async reconhecerPagina(pagina: PDFPageProxy) {
      const canvas = await renderizar(pagina, OCR_RENDER_SCALE);
      const inicial = await ler(canvas, OCR_RENDER_SCALE);
      if (empresa !== "acelen" || identidadeMataripe(inicial) === "divergente") return inicial;

      type CanvasOcr = Awaited<ReturnType<typeof renderizar>>;
      let telaTres: CanvasOcr | undefined;
      let telaQuatro: CanvasOcr | undefined;
      const renderizarMataripe = (escala: number) => {
        const existente = escala === 3 ? telaTres : telaQuatro;
        return existente ? Promise.resolve(existente) : renderizar(pagina, escala);
      };
      const conferirInformativos = async (resultado: OcrPageResult) => {
        await worker.setParameters({ tessedit_pageseg_mode: "7" as unknown as import("tesseract.js").PSM,
          tessedit_char_whitelist: "0123456789.,-" });
        try {
          const itens = await conferirValoresInformativosMataripe(
            resultado.itens, canvas, OCR_RENDER_SCALE, renderizarMataripe, criarCanvas,
            async (recorte, escala) => (await ler(recorte, escala)).itens,
          );
          return { ...resultado, itens };
        } finally {
          await worker.setParameters({ tessedit_pageseg_mode: "3" as unknown as import("tesseract.js").PSM,
            tessedit_char_whitelist: "" });
        }
      };

      const selecionarLeituraMataripe = async (): Promise<OcrPageResult> => {
        if (confereMataripe(inicial, canvas.width / OCR_RENDER_SCALE)) return inicial;
        try {
          const escala = 3;
          const alta = telaTres = await renderizar(pagina, escala);
          const largura = alta.width / escala;
          const preliminar = await ler(alta, escala);
          if (confereMataripe(preliminar, largura)) return preliminar;
          if (identidadeMataripe(preliminar) === "divergente") return inicial;

          limparGradeOcrMataripe(alta, escala);
          const corrigida = await ler(alta, escala);
          if (confereMataripe(corrigida, largura)) return corrigida;
          if (identidadeMataripe(corrigida) !== "confirmada") return inicial;

          const lerItens = async (recorte: HTMLCanvasElement | OffscreenCanvas, escalaRecorte: number) =>
            (await ler(recorte, escalaRecorte)).itens;
          await worker.setParameters({ tessedit_pageseg_mode: "6" as unknown as import("tesseract.js").PSM,
            tessedit_char_whitelist: "0123456789.,-" });
          try {
            const itens = await relerFaixasOcrMataripe(alta, corrigida.itens, escala, criarCanvas,
              (recorte) => lerItens(recorte, escala));
            const refinada = { ...corrigida, itens };
            if (confereMataripe(refinada, largura)) return refinada;
            await worker.setParameters({ tessedit_pageseg_mode: "7" as unknown as import("tesseract.js").PSM });
            const itensPorCelula = await relerCelulasOcrMataripe(alta, itens, escala, criarCanvas, lerItens);
            const porCelula = { ...corrigida, itens: itensPorCelula };
            if (confereMataripe(porCelula, largura)) return porCelula;
            for (const anterior of [inicial, preliminar, corrigida]) {
              if (identidadeMataripe(anterior) !== "confirmada") continue;
              const reutilizada = { ...porCelula, itens: recuperarTotaisMataripe(itensPorCelula, anterior.itens, largura) };
              if (confereMataripe(reutilizada, largura)) return reutilizada;
            }

            const escalaTotais = 4;
            telaQuatro = await renderizar(pagina, escalaTotais);
            const itensComTotais = await relerTotaisOcrMataripe(telaQuatro, itensPorCelula, escalaTotais, criarCanvas, lerItens);
            const comTotais = { ...corrigida, itens: itensComTotais };
            if (confereMataripe(comTotais, largura)) return comTotais;
            const totaisNaOutraEscala = await relerTotaisOcrMataripe(alta, itensPorCelula, escala, criarCanvas, lerItens);
            const outraEscala = { ...corrigida, itens: totaisNaOutraEscala };
            if (confereMataripe(outraEscala, largura)) return outraEscala;
          } finally {
            await worker.setParameters({ tessedit_pageseg_mode: "3" as unknown as import("tesseract.js").PSM,
              tessedit_char_whitelist: "" });
          }

          // Uma folha digitalizada pode exigir a resolução maior também no
          // corpo. Aproveita a mesma imagem que já foi criada para o rodapé.
          if (telaQuatro) {
            const ampliada = await ler(telaQuatro, 4);
            const larguraAmpliada = telaQuatro.width / 4;
            if (confereMataripe(ampliada, larguraAmpliada)) return ampliada;
            if (identidadeMataripe(ampliada) === "confirmada") {
              await worker.setParameters({ tessedit_pageseg_mode: "7" as unknown as import("tesseract.js").PSM,
                tessedit_char_whitelist: "0123456789.,-" });
              try {
                const itensAmpliados = await relerCelulasOcrMataripe(telaQuatro, ampliada.itens, 4, criarCanvas, lerItens);
                const candidata = { ...ampliada, itens: itensAmpliados };
                if (confereMataripe(candidata, larguraAmpliada)) return candidata;
                for (const anterior of [inicial, preliminar, corrigida]) {
                  if (identidadeMataripe(anterior) !== "confirmada") continue;
                  const reaproveitada = { ...candidata, itens: recuperarTotaisMataripe(itensAmpliados, anterior.itens, larguraAmpliada) };
                  if (confereMataripe(reaproveitada, larguraAmpliada)) return reaproveitada;
                }
              } finally {
                await worker.setParameters({ tessedit_pageseg_mode: "3" as unknown as import("tesseract.js").PSM,
                  tessedit_char_whitelist: "" });
              }
            }
          }
        } catch {
          // Preserva a primeira leitura se não houver outro candidato íntegro.
        }
        return inicial;
      };
      const selecionada = await selecionarLeituraMataripe();
      return confereMataripe(selecionada, canvas.width / OCR_RENDER_SCALE)
        ? conferirInformativos(selecionada)
        : selecionada;
    },
    encerrar: () => worker.terminate().then(() => undefined),
  };
}
