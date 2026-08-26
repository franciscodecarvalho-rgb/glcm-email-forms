import { describe, expect, it, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  unificarPdfs,
  competenciaDoArquivo,
  ordenarPorCompetencia,
  type TextItemPdf,
  unificarPdfsEmLotes,
} from "./unificar-pdfs";

const qpdfMocks = vi.hoisted(() => ({
  createQpdfRunner: vi.fn(),
  destroy: vi.fn(),
  runOne: vi.fn(),
}));

const pdfjsMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock("qpdf-run", () => ({
  createQpdfRunner: qpdfMocks.createQpdfRunner,
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: pdfjsMocks.getDocument,
}));

async function criarPdf(paginas: number, nome: string, tamanho?: [number, number]) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) pdf.addPage(tamanho ?? [595.28, 841.89]);
  return new File([(await pdf.save()) as BlobPart], nome, { type: "application/pdf" });
}

function lerArquivo(arquivo: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result as ArrayBuffer);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsArrayBuffer(arquivo);
  });
}

function documentoFake(paginas: TextItemPdf[][]) {
  return {
    numPages: paginas.length,
    getPage: async (numero: number) => ({
      getTextContent: async () => ({
        items: paginas[numero - 1].map((i) => ({
          str: i.str,
          transform: [1, 0, 0, 1, i.x, i.y],
          width: i.width,
          height: i.height,
        })),
      }),
      cleanup: () => {},
    }),
    destroy: async () => {},
  };
}

function documentoVazio() {
  return { numPages: 0, getPage: async () => null, destroy: async () => {} };
}

function paginaComMesAno(competencia: string): TextItemPdf[] {
  return [
    { str: "Mês/Ano", x: 300, y: 490, width: 60, height: 10 },
    { str: competencia, x: 400, y: 490, width: 50, height: 10 },
  ];
}

describe("unificarPdfs", () => {
  beforeEach(() => {
    qpdfMocks.createQpdfRunner.mockReset();
    qpdfMocks.runOne.mockReset();
    qpdfMocks.destroy.mockReset();
    pdfjsMocks.getDocument.mockReset();
    pdfjsMocks.getDocument.mockImplementation(() => ({ promise: Promise.resolve(documentoVazio()) }));
  });

  it("reúne todas as páginas dos arquivos na ordem de competência", async () => {
    pdfjsMocks.getDocument
      .mockImplementationOnce(() => ({
        promise: Promise.resolve(documentoFake([paginaComMesAno("03/2026")])),
      }))
      .mockImplementationOnce(() => ({
        promise: Promise.resolve(documentoFake([paginaComMesAno("01/2026")])),
      }));

    const marco = await criarPdf(1, "marco.pdf", [200, 200]);
    const janeiro = await criarPdf(1, "janeiro.pdf", [100, 100]);

    const unificado = await unificarPdfs([marco, janeiro]);

    const resultado = await PDFDocument.load(await lerArquivo(unificado));
    expect(unificado.name).toBe("contracheques-unificados.pdf");
    expect(resultado.getPageCount()).toBe(2);
    const primeira = resultado.getPage(0).getSize();
    const segunda = resultado.getPage(1).getSize();
    expect(Math.round(primeira.width)).toBe(100);
    expect(Math.round(segunda.width)).toBe(200);
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

describe("competenciaDoArquivo", () => {
  it("extrai a competência da página com Mês/Ano", () => {
    expect(competenciaDoArquivo([paginaComMesAno("02/2025")])).toBe("02/2025");
  });

  it("retorna null quando nenhuma página tem competência", () => {
    expect(competenciaDoArquivo([[]])).toBeNull();
  });
});

describe("ordenarPorCompetencia", () => {
  it("ordena crescentemente por ano e mês", () => {
    const itens = [
      { competencia: "03/2025", id: "c" },
      { competencia: "01/2024", id: "a" },
      { competencia: "12/2024", id: "b" },
    ];
    expect(ordenarPorCompetencia(itens).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("mantém competências ausentes no fim preservando ordem relativa", () => {
    const itens = [
      { competencia: null, id: "x" },
      { competencia: "05/2026", id: "a" },
      { competencia: null, id: "y" },
      { competencia: "01/2026", id: "b" },
    ];
    expect(ordenarPorCompetencia(itens).map((i) => i.id)).toEqual(["b", "a", "x", "y"]);
  });
});

describe("unificarPdfsEmLotes", () => {
  beforeEach(() => {
    pdfjsMocks.getDocument.mockReset();
    pdfjsMocks.getDocument.mockImplementation(() => ({ promise: Promise.resolve(documentoVazio()) }));
  });

  it("divide 31 páginas em lotes de 15/15/1 sem perder páginas", async () => {
    const arquivo = await criarPdf(31, "contracheques.pdf");

    const { unificado, lotes } = await unificarPdfsEmLotes([arquivo]);

    const total = await PDFDocument.load(await lerArquivo(unificado));
    expect(total.getPageCount()).toBe(31);

    expect(lotes.map((l) => [l.ordem, l.pagina_inicio, l.pagina_fim])).toEqual([
      [0, 1, 15],
      [1, 16, 30],
      [2, 31, 31],
    ]);
    expect(lotes.map((l) => l.file.name)).toEqual([
      "contracheques-lote-001.pdf",
      "contracheques-lote-002.pdf",
      "contracheques-lote-003.pdf",
    ]);

    const contagens = [];
    for (const lote of lotes) {
      contagens.push((await PDFDocument.load(await lerArquivo(lote.file))).getPageCount());
    }
    expect(contagens).toEqual([15, 15, 1]);
    expect(contagens.reduce((a, b) => a + b, 0)).toBe(31);
  });
});
