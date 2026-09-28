import { describe, expect, it } from "vitest";
import { palavrasOcrParaItens } from "./ocr-pdf";

describe("OCR de PDF", () => {
  it("converte palavras OCR para coordenadas do PDF", () => {
    const itens = palavrasOcrParaItens(
      {
        confidence: 91,
        text: "3008",
        blocks: [{ paragraphs: [{ lines: [{ words: [{ text: "3008", confidence: 96, bbox: { x0: 20, y0: 40, x1: 100, y1: 60 } }] }] }] }],
      },
      400,
      200,
      2,
    );

    expect(itens).toEqual([
      { str: "3008", x: 10, y: 75, width: 40, height: 10, confianca: 96 },
    ]);
  });

  it("ignora palavras vazias ou sem caixa delimitadora", () => {
    const itens = palavrasOcrParaItens({
      text: "",
      confidence: 0,
      blocks: [{ paragraphs: [{ lines: [{ words: [
        { text: "", confidence: 90, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
        { text: "sem-caixa", confidence: 90 },
      ] }] }] }],
    }, 100, 100);

    expect(itens).toEqual([]);
  });
});
