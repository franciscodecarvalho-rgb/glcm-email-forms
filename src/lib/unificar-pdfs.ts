import type { TextItemPdf } from "@/lib/parse-contracheque-pdf";
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
  // Passa uma cópia para o pdf.js: ele transfere/detacha o buffer original
  // (byteLength vira 0), o que corromperia os bytes usados depois no merge.
  const copia = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes).slice();
  const doc = await getDocument({ data: copia }).promise;
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

// Páginas por lote físico: mantém cada invocação da Edge Function com custo
// limitado (o PDF consolidado inteiro nunca é processado numa só chamada).
export const TAMANHO_LOTE_PAGINAS = 5;

export type LotePdf = { ordem: number; pagina_inicio: number; pagina_fim: number; file: File };

// Normaliza, descriptografa e ordena por competência os PDFs de origem.
async function prepararArquivos(arquivos: File[]): Promise<ArquivoPreparado[]> {
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

      // Normaliza o PDF antes de extrair e copiar as páginas para contornar
      // erros de estrutura interna (PDFDict undefined) em PDFs descriptografados.
      bytes = await origem.save();

      let competencia: string | null = null;
      try {
        competencia = competenciaDoArquivo(await extrairItensPorPagina(bytes));
      } catch {
        competencia = null;
      }
      preparados.push({ bytes, competencia });
    }

    return ordenarPorCompetencia(preparados);
  } finally {
    await descriptografador?.destroy();
  }
}

async function montarUnificado(ordenados: ArquivoPreparado[]): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const destino = await PDFDocument.create();
  for (const { bytes } of ordenados) {
    const origem = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const paginas = await destino.copyPages(origem, origem.getPageIndices());
    paginas.forEach((pagina) => destino.addPage(pagina));
  }
  return await destino.save();
}

function arquivoUnificado(bytes: Uint8Array): File {
  return new File([bytes as BlobPart], "contracheques-unificados.pdf", { type: "application/pdf" });
}

export async function unificarPdfs(arquivos: File[]): Promise<File> {
  return arquivoUnificado(await montarUnificado(await prepararArquivos(arquivos)));
}

// Divide o PDF unificado em intervalos de no máximo `tamanhoLote` páginas.
export function planejarIntervalos(
  totalPaginas: number,
  tamanhoLote = TAMANHO_LOTE_PAGINAS,
): Array<{ ordem: number; pagina_inicio: number; pagina_fim: number }> {
  const intervalos: Array<{ ordem: number; pagina_inicio: number; pagina_fim: number }> = [];
  let ordem = 0;
  for (let inicio = 1; inicio <= totalPaginas; inicio += tamanhoLote) {
    intervalos.push({
      ordem: ordem++,
      pagina_inicio: inicio,
      pagina_fim: Math.min(inicio + tamanhoLote - 1, totalPaginas),
    });
  }
  return intervalos;
}

/**
 * Gera o PDF unificado e também os PDFs físicos de lote (máx. 5 páginas cada),
 * já com `ordem`, `pagina_inicio` e `pagina_fim`.
 */
export async function unificarPdfsEmLotes(
  arquivos: File[],
  tamanhoLote = TAMANHO_LOTE_PAGINAS,
): Promise<{ unificado: File; lotes: LotePdf[] }> {
  const { PDFDocument } = await import("pdf-lib");
  const bytesUnificado = await montarUnificado(await prepararArquivos(arquivos));

  const origem = await PDFDocument.load(bytesUnificado, { ignoreEncryption: true });
  const total = origem.getPageCount();

  const lotes: LotePdf[] = [];
  for (const intervalo of planejarIntervalos(total, tamanhoLote)) {
    const destino = await PDFDocument.create();
    const indices: number[] = [];
    for (let p = intervalo.pagina_inicio; p <= intervalo.pagina_fim; p++) indices.push(p - 1);
    const paginas = await destino.copyPages(origem, indices);
    paginas.forEach((pagina) => destino.addPage(pagina));
    const bytes = await destino.save();
    const nome = `contracheques-lote-${String(intervalo.ordem + 1).padStart(3, "0")}.pdf`;
    lotes.push({ ...intervalo, file: new File([bytes as BlobPart], nome, { type: "application/pdf" }) });
  }

  return { unificado: arquivoUnificado(bytesUnificado), lotes };
}

