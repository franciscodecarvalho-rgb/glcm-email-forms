import { describe, expect, it } from "vitest";
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
});
