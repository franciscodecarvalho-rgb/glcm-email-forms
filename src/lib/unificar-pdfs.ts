export type { TextItemPdf } from "@/lib/parse-contracheque-pdf";
import { parsePaginaContracheque } from "@/lib/parse-contracheque-pdf";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

function lerArquivo(arquivo: File): Promise<ArrayBuffer> {
  if (typeof arquivo.arrayBuffer === "function") return arquivo.arrayBuffer();
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result as ArrayBuffer);
    leitor.onerror = () => reject(leitor.error ?? new Error("Falha ao ler PDF"));
    leitor.readAsArrayBuffer(arquivo);
  });
}

type QpdfRunner = Awaited<ReturnType<typeof import("qpdf-run")["createQpdfRunner"]>>;

async function criarDescriptografador(): Promise<QpdfRunner> {
  const { createQpdfRunner } = await import("qpdf-run");
  return createQpdfRunner({
    workerUrl: "/qpdf/worker.js",
    qpdfJsUrl: "/qpdf/qpdf.js",
    wasmUrl: "/qpdf/qpdf.wasm",
    timeoutMs: 120_000,
  });
}

async function descriptografarPdf(
  runner: QpdfRunner,
  bytes: ArrayBuffer,
  indice: number,
): Promise<Uint8Array> {
  const entrada = `entrada-${indice}.pdf`;
  const saida = `saida-${indice}.pdf`;
  return runner.runOne({
    input: bytes,
    inputName: entrada,
    outputName: saida,
    args: ["--password=", "--decrypt", "--", entrada, saida],
  });
}

// Extrai o texto posicional de cada página com pdf.js, na mesma forma usada
// pelas Edge Functions (str + coordenadas), para que o parser posicional dos
// contracheques possa identificar a competência do arquivo.
async function extrairItensPorPagina(bytes: ArrayBuffer | Uint8Array): Promise<TextItemPdf[][]> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await getDocument({ data: bytes }).promise;
  try {
    const paginas: TextItemPdf[][] = [];
    for (let numero = 1; numero <= doc.numPages; numero++) {
      const pagina = await doc.getPage(numero);
      const conteudo = await pagina.getTextContent();
      paginas.push(conteudo.items.flatMap((item) => {
        if (!("str" in item) || !("transform" in item)) return [];
        return [{
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        }];
      }));
      pagina.cleanup();
    }
    return paginas;
  } finally {
    await doc.destroy();
  }
}

// Competência (MM/AAAA) do primeiro contracheque reconhecido nas páginas.
export function competenciaDoArquivo(paginas: TextItemPdf[][]): string | null {
  for (const pagina of paginas) {
    const largura = Math.max(...pagina.map((i) => i.x + i.width), 595);
    const contra = parsePaginaContracheque(pagina, largura);
    if (contra.competencia) return contra.competencia;
  }
  return null;
}

function chaveCompetencia(competencia: string | null): [number, number] | null {
  const m = competencia?.match(/(0[1-9]|1[0-2])\/(20\d{2})/);
  return m ? [Number(m[2]), Number(m[1])] : null;
}

// Ordena por competência crescente (ano, mês); arquivos sem competência
// reconhecida vão para o fim preservando a ordem relativa.
export function ordenarPorCompetencia<T extends { competencia: string | null }>(itens: T[]): T[] {
  return itens
    .map((item, indice) => ({ item, indice, chave: chaveCompetencia(item.competencia) }))
    .sort((a, b) => {
      if (a.chave && b.chave) return a.chave[0] - b.chave[0] || a.chave[1] - b.chave[1];
      if (a.chave) return -1;
      if (b.chave) return 1;
      return a.indice - b.indice;
    })
    .map(({ item }) => item);
}

type ArquivoPreparado = { bytes: ArrayBuffer | Uint8Array; competencia: string | null };

export async function unificarPdfs(arquivos: File[]): Promise<File> {
  if (arquivos.length === 0) throw new Error("Nenhum contracheque foi selecionado");

  const { PDFDocument } = await import("pdf-lib");
  let descriptografador: QpdfRunner | null = null;
  const preparados: ArquivoPreparado[] = [];

  try {
    for (const [indice, arquivo] of arquivos.entries()) {
      let bytes: ArrayBuffer | Uint8Array = await lerArquivo(arquivo);
      let origem = await PDFDocument.load(bytes, { ignoreEncryption: true });

      if (origem.isEncrypted) {
        descriptografador ??= await criarDescriptografador();
        bytes = await descriptografarPdf(descriptografador, bytes as ArrayBuffer, indice);
        origem = await PDFDocument.load(bytes);
      }

      let competencia: string | null = null;
      try {
        competencia = competenciaDoArquivo(await extrairItensPorPagina(bytes));
      } catch {
        competencia = null;
      }
      preparados.push({ bytes, competencia });
    }

    const ordenados = ordenarPorCompetencia(preparados);

    const destino = await PDFDocument.create();
    for (const { bytes } of ordenados) {
      const origem = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const paginas = await destino.copyPages(origem, origem.getPageIndices());
      paginas.forEach((pagina) => destino.addPage(pagina));
    }

    const bytes = await destino.save();
    return new File([bytes as BlobPart], "contracheques-unificados.pdf", { type: "application/pdf" });
  } finally {
    await descriptografador?.destroy();
  }
}
