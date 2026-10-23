/** OpenAI-compatible Chat Completions represents PDF inputs as `file` parts. */
export function partePdfParaGemini(nome: string, dataUrl: string) {
  return [
    { type: "text", text: `Leia visualmente este documento PDF: ${nome}` },
    { type: "file", file: { filename: nome, file_data: dataUrl } },
  ];
}
