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

export async function unificarPdfs(arquivos: File[]): Promise<File> {
  if (arquivos.length === 0) throw new Error("Nenhum contracheque foi selecionado");

  const { PDFDocument } = await import("pdf-lib");
  const destino = await PDFDocument.create();
  let descriptografador: QpdfRunner | null = null;

  try {
    for (const [indice, arquivo] of arquivos.entries()) {
      let bytes: ArrayBuffer | Uint8Array = await lerArquivo(arquivo);
      let origem = await PDFDocument.load(bytes, { ignoreEncryption: true });

      if (origem.isEncrypted) {
        descriptografador ??= await criarDescriptografador();
        bytes = await descriptografarPdf(descriptografador, bytes as ArrayBuffer, indice);
        origem = await PDFDocument.load(bytes);
      }

      const paginas = await destino.copyPages(origem, origem.getPageIndices());
      paginas.forEach((pagina) => destino.addPage(pagina));
    }
  } finally {
    await descriptografador?.destroy();
  }

  const bytes = await destino.save();
  return new File([bytes], "contracheques-unificados.pdf", { type: "application/pdf" });
}
