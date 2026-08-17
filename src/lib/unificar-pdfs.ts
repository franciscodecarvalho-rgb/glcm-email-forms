function lerArquivo(arquivo: File): Promise<ArrayBuffer> {
  if (typeof arquivo.arrayBuffer === "function") return arquivo.arrayBuffer();
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result as ArrayBuffer);
    leitor.onerror = () => reject(leitor.error ?? new Error("Falha ao ler PDF"));
    leitor.readAsArrayBuffer(arquivo);
  });
}

export async function unificarPdfs(arquivos: File[]): Promise<File> {
  if (arquivos.length === 0) throw new Error("Nenhum contracheque foi selecionado");

  const { PDFDocument } = await import("pdf-lib");
  const destino = await PDFDocument.create();
  for (const arquivo of arquivos) {
    const origem = await PDFDocument.load(await lerArquivo(arquivo), { ignoreEncryption: true });
    const paginas = await destino.copyPages(origem, origem.getPageIndices());
    paginas.forEach((pagina) => destino.addPage(pagina));
  }

  const bytes = await destino.save();
  return new File([bytes], "contracheques-unificados.pdf", { type: "application/pdf" });
}
