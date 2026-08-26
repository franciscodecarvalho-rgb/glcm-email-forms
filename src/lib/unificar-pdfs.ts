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

// Competência (MM/AAAA) de cada página individualmente. Um mesmo arquivo pode
// conter contracheques de competências diferentes (ex.: BASF costuma agrupar
// o adiantamento quinzenal e o recibo integral de um mês com o adiantamento
// do mês seguinte no mesmo PDF); tratar o arquivo inteiro pela competência da
// primeira página arrastaria as páginas do mês seguinte para a posição errada.
export function competenciasPorPagina(paginas: TextItemPdf[][]): (string | null)[] {
  return paginas.map((pagina) => {
    const largura = Math.max(...pagina.map((i) => i.x + i.width), 595);
    return parsePaginaContracheque(pagina, largura).competencia;
  });
}

export type BlocoPaginas = { paginaInicio: number; paginaFim: number; competencia: string | null };

// Agrupa páginas consecutivas da mesma competência em um bloco só; uma página
// sem competência reconhecida (ex.: continuação de um contracheque) é tratada
// como parte do bloco anterior, preservando a leitura de contracheques que
// ocupam mais de uma página física.
export function agruparPaginasPorCompetencia(competencias: (string | null)[]): BlocoPaginas[] {
  const blocos: BlocoPaginas[] = [];
  competencias.forEach((competencia, indice) => {
    const numeroPagina = indice + 1;
    const anterior = blocos[blocos.length - 1];
    if (anterior && (competencia == null || competencia === anterior.competencia)) {
      anterior.paginaFim = numeroPagina;
    } else {
      blocos.push({ paginaInicio: numeroPagina, paginaFim: numeroPagina, competencia });
    }
  });
  return blocos;
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

type ArquivoPreparado = { bytes: ArrayBuffer | Uint8Array; blocos: BlocoPaginas[] };
type UnidadePreparada = BlocoPaginas & { arquivoIndice: number };

// Páginas por lote físico: mantém cada invocação da Edge Function com custo
// limitado (o PDF consolidado inteiro nunca é processado numa só chamada).
export const TAMANHO_LOTE_PAGINAS = 5;

export type LotePdf = { ordem: number; pagina_inicio: number; pagina_fim: number; file: File };

// Normaliza e descriptografa os PDFs de origem, calculando a competência de
// cada página (ver `agruparPaginasPorCompetencia`). Não ordena aqui: a ordem
// depende dos blocos de todos os arquivos juntos (ver `ordenarUnidades`).
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

      const totalPaginasArquivo = origem.getPageCount();
      let blocos: BlocoPaginas[] = totalPaginasArquivo
        ? [{ paginaInicio: 1, paginaFim: totalPaginasArquivo, competencia: null }]
        : [];
      try {
        const competencias = competenciasPorPagina(await extrairItensPorPagina(bytes));
        // Só confia no agrupamento por página quando a extração via pdf.js
        // enxergou o mesmo número de páginas que o pdf-lib (fonte real da
        // cópia); caso contrário mantém o bloco único acima para não perder
        // páginas que a extração não conseguiu enumerar.
        if (competencias.length === totalPaginasArquivo) {
          blocos = agruparPaginasPorCompetencia(competencias);
        }
      } catch {
        // mantém o bloco único de competência nula calculado acima
      }
      preparados.push({ bytes, blocos });
    }

    return preparados;
  } finally {
    await descriptografador?.destroy();
  }
}

// Ordena os blocos de páginas de todos os arquivos juntos por competência,
// não os arquivos inteiros: um arquivo pode ter páginas de mais de um mês.
function ordenarUnidades(preparados: ArquivoPreparado[]): UnidadePreparada[] {
  const unidades: UnidadePreparada[] = preparados.flatMap((preparado, arquivoIndice) =>
    preparado.blocos.map((bloco) => ({ ...bloco, arquivoIndice })),
  );
  return ordenarPorCompetencia(unidades);
}

async function montarUnificado(preparados: ArquivoPreparado[]): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const destino = await PDFDocument.create();
  for (const unidade of ordenarUnidades(preparados)) {
    const origem = await PDFDocument.load(preparados[unidade.arquivoIndice].bytes, { ignoreEncryption: true });
    const indices = Array.from(
      { length: unidade.paginaFim - unidade.paginaInicio + 1 },
      (_, i) => unidade.paginaInicio - 1 + i,
    );
    const paginas = await destino.copyPages(origem, indices);
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

