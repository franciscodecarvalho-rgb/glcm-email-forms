import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { unificarPdfs } from "./unificar-pdfs";

const qpdfMocks = vi.hoisted(() => ({
  createQpdfRunner: vi.fn(),
  destroy: vi.fn(),
  runOne: vi.fn(),
}));

vi.mock("qpdf-run", () => ({
  createQpdfRunner: qpdfMocks.createQpdfRunner,
}));

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

  it("descriptografa a origem antes de copiar suas páginas", async () => {
    const arquivo = await criarPdf(1, "criptografado.pdf");
    const carregarPdf = PDFDocument.load.bind(PDFDocument);
    let primeiraLeitura = true;
    const loadSpy = vi
      .spyOn(PDFDocument, "load")
      .mockImplementation(async (pdf, opcoes) => {
        const documento = await carregarPdf(pdf, opcoes);
        if (primeiraLeitura && opcoes?.ignoreEncryption) {
          primeiraLeitura = false;
          documento.isEncrypted = true;
        }
        return documento;
      });
    qpdfMocks.runOne.mockImplementation(async ({ input }) => new Uint8Array(input as ArrayBuffer));
    qpdfMocks.createQpdfRunner.mockResolvedValue({
      run: vi.fn(),
      runOne: qpdfMocks.runOne,
      destroy: qpdfMocks.destroy,
    });

    await unificarPdfs([arquivo]);

    expect(loadSpy).toHaveBeenCalledWith(expect.any(ArrayBuffer), { ignoreEncryption: true });
    expect(qpdfMocks.runOne).toHaveBeenCalledWith(
      expect.objectContaining({ args: ["--password=", "--decrypt", "--", "entrada-0.pdf", "saida-0.pdf"] }),
    );
    expect(qpdfMocks.destroy).toHaveBeenCalledOnce();
    loadSpy.mockRestore();
  });
});
