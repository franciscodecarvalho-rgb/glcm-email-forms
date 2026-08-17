import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { unificarPdfs } from "./unificar-pdfs";

async function criarPdf(paginas: number, nome: string) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) pdf.addPage();
  return new File([await pdf.save()], nome, { type: "application/pdf" });
}

function lerArquivo(arquivo: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result as ArrayBuffer);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsArrayBuffer(arquivo);
  });
}

describe("unificarPdfs", () => {
  it("reúne todas as páginas dos arquivos na ordem selecionada", async () => {
    const unificado = await unificarPdfs([
      await criarPdf(2, "primeiro.pdf"),
      await criarPdf(3, "segundo.pdf"),
    ]);

    const resultado = await PDFDocument.load(await lerArquivo(unificado));
    expect(unificado.name).toBe("contracheques-unificados.pdf");
    expect(resultado.getPageCount()).toBe(5);
  });

  it("recusa uma seleção vazia", async () => {
    await expect(unificarPdfs([])).rejects.toThrow("Nenhum contracheque");
  });

  it("carrega PDFs de origem ignorando a marcação de criptografia", async () => {
    const carregarPdf = PDFDocument.load.bind(PDFDocument);
    const loadSpy = vi
      .spyOn(PDFDocument, "load")
      .mockImplementation((pdf, opcoes) => carregarPdf(pdf, opcoes));

    await unificarPdfs([await criarPdf(1, "criptografado.pdf")]);

    expect(loadSpy).toHaveBeenCalledWith(expect.any(ArrayBuffer), { ignoreEncryption: true });
    loadSpy.mockRestore();
  });
});
