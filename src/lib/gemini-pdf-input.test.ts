import { describe, expect, it } from "vitest";
import { partePdfParaGemini } from "../../supabase/functions/_shared/gemini-pdf-input";

describe("partePdfParaGemini", () => {
  it("envia o PDF como arquivo PDF multimodal, não como URL de imagem", () => {
    const conteudo = partePdfParaGemini("cnh.pdf", "data:application/pdf;base64,JVBERi0x");

    expect(conteudo).toEqual([
      { type: "text", text: "Leia visualmente este documento PDF: cnh.pdf" },
      {
        type: "file",
        file: {
          filename: "cnh.pdf",
          file_data: "data:application/pdf;base64,JVBERi0x",
        },
      },
    ]);
    expect(conteudo.some((parte) => parte.type === "image_url")).toBe(false);
  });
});
