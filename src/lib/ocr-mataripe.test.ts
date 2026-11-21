import { describe, expect, it } from "vitest";
import { conferirValoresInformativosMataripe, leituraMataripeReconcilia, mesclarNumerosOcrMataripe, recuperarTotaisMataripe, relerCelulasOcrMataripe, relerTotaisOcrMataripe } from "./ocr-mataripe";

const item = (str: string, x: number, y: number, width = 18) => ({
  str, x, y, width, height: 8, confianca: 90,
});

const folha = [
  item("VENCIMENTOS", 400, 700), item("DESCONTOS", 490, 700),
  item("3008", 38, 670), item("AHRA", 57, 670), item("100,00", 431, 670),
  item("5500", 38, 650), item("IR", 56, 650), item("20,00", 535, 650),
  item("BASE/OUTROS", 80, 630), item("5501", 38, 610), item("BASE IR", 60, 610), item("777,00", 520, 610),
  item("T O T A I S", 70, 580),
  item("100,00]", 250, 570), item("20,00]", 385, 570), item("80,00", 505, 570),
];

describe("Releitura local de Mataripe", () => {
  it("evita nova leitura quando rubricas e totais estão íntegros", () => {
    expect(leituraMataripeReconcilia(folha, 595)).toBe(true);
  });

  it("não considera uma soma suficiente se uma rubrica tem o código ilegível", () => {
    const comErro = folha.map((atual) => atual.str === "3008" ? { ...atual, str: "3O08" } : atual);
    expect(leituraMataripeReconcilia(comErro, 595)).toBe(false);
  });

  it("rejeita valor informativo incompleto mesmo quando os totais da folha fecham", () => {
    const comErro = folha.map((atual) => atual.str === "777,00" ? { ...atual, str: "777,0" } : atual);
    expect(leituraMataripeReconcilia(comErro, 595)).toBe(false);
  });

  it("rejeita leituras com soma ou líquido divergente", () => {
    const comErro = folha.map((atual) => atual.str === "80,00" ? { ...atual, str: "81,00" } : atual);
    expect(leituraMataripeReconcilia(comErro, 595)).toBe(false);
    const semProvento = folha.filter((atual) => atual.str !== "100,00");
    expect(leituraMataripeReconcilia(semProvento, 595)).toBe(false);
  });

  it("confirma a célula após BASE/OUTROS e sinaliza leituras discordantes", async () => {
    const criarCanvas = (width: number, height: number) => ({
      width, height, getContext: () => ({ fillRect: () => {}, drawImage: () => {} }),
    }) as unknown as OffscreenCanvas;
    const renderizar = async (escala: number) => criarCanvas(595 * escala, 842 * escala);
    const tela = await renderizar(2);
    const lerBases = (leituras: string[]) => conferirValoresInformativosMataripe(
      folha, tela, 2, renderizar, criarCanvas, async () => [item(leituras.shift()!, 7, 0)],
    );

    const corrigida = await lerBases(Array.from({ length: 7 }, () => "177,00"));
    expect(corrigida.find((atual) => atual.x === 520)?.str).toBe("177,00");
    expect(leituraMataripeReconcilia(corrigida, 595)).toBe(true);
    const controvertida = await lerBases(["177,00", "177,00", "777,00"]);
    expect(controvertida).toBe(folha);
    const deslocada = await lerBases(["177,00", "177,00", "177,00", "777,00", "777,00"]);
    expect(deslocada).toBe(folha);
    const nativo = await lerBases(["177,00", "277,00", "377,00", "277,00", "377,00", "277,00", "377,00", "777,00"]);
    expect(nativo).toBe(folha);
    const inconclusiva = await lerBases(["177,00", "277,00", "377,00", "277,00", "377,00", "277,00", "377,00", "277,00"]);
    expect(leituraMataripeReconcilia(inconclusiva, 595)).toBe(false);
  });

  it("amplia somente as células numéricas ilegíveis que têm uma linha localizada", async () => {
    const incompleta = folha.filter((atual) => atual.str !== "3008").map((atual) => {
      if (atual.str === "20,00") return { ...atual, str: "20,0" };
      return atual;
    });
    const dimensoes = { width: 1190, height: 1684 } as OffscreenCanvas;
    const criarCanvas = (width: number, height: number) => ({
      width, height, getContext: () => ({ fillRect: () => {}, drawImage: () => {} }),
    }) as unknown as OffscreenCanvas;
    const reconhecimentos = ["3008,", "20,00"];
    const corrigida = await relerCelulasOcrMataripe(dimensoes, incompleta, 2, criarCanvas,
      async () => [item(reconhecimentos.shift()!, 7, 0, 17)]);
    expect(reconhecimentos).toHaveLength(0);
    expect(leituraMataripeReconcilia(corrigida, 595)).toBe(true);
  });

  it("concilia os totais pelos quadros quando o OCR divide o rodapé em linhas", () => {
    const rodapeDividido = folha.map((atual) => atual.str === "20,00]"
      ? { ...atual, y: atual.y + 5 }
      : atual);
    expect(leituraMataripeReconcilia(rodapeDividido, 595)).toBe(true);

    const ilegivel = folha.map((atual) => atual.str === "80,00" ? { ...atual, str: "8000" } : atual);
    expect(leituraMataripeReconcilia(recuperarTotaisMataripe(ilegivel, rodapeDividido, 595), 595)).toBe(true);
  });

  it("recupera os três totais impressos de outra leitura completa da mesma página", () => {
    const comTotaisIncorretos = folha.map((atual) => atual.str === "100,00]" ? { ...atual, str: "108,00]" } : atual);
    const recuperada = recuperarTotaisMataripe(comTotaisIncorretos, folha, 595);
    expect(leituraMataripeReconcilia(recuperada, 595)).toBe(true);
    const semLiquido = folha.filter((atual) => atual.str !== "80,00");
    expect(recuperarTotaisMataripe(comTotaisIncorretos, semLiquido, 595)).toBe(comTotaisIncorretos);
  });

  it("substitui o rodapé só quando os três campos são relidos da imagem", async () => {
    const folhaComTotalIncorreto = folha.map((atual) => atual.str === "100,00]" ? { ...atual, str: "108,00]" } : atual);
    const dimensoes = { width: 1190, height: 1684 } as OffscreenCanvas;
    const criarCanvas = (width: number, height: number) => ({
      width, height, getContext: () => ({ fillRect: () => {}, drawImage: () => {} }),
    }) as unknown as OffscreenCanvas;
    const reconhecimentos = ["100,00", "20,00", "80,00"];
    const corrigida = await relerTotaisOcrMataripe(dimensoes, folhaComTotalIncorreto, 2, criarCanvas,
      async () => [item(reconhecimentos.shift()!, 7, 0)]);
    expect(reconhecimentos).toHaveLength(0);
    expect(leituraMataripeReconcilia(corrigida, 595)).toBe(true);
    expect(corrigida).toContainEqual(folha.find((atual) => atual.str === "3008"));

    const parcial = await relerTotaisOcrMataripe(dimensoes, folhaComTotalIncorreto, 2, criarCanvas, async () => []);
    expect(parcial).toBe(folhaComTotalIncorreto);
  });

  it("relê só o campo ilegível quando os outros dois quadros conferem", async () => {
    const incompleta = folha.map((atual) => atual.str === "80,00" ? { ...atual, str: "8000" } : atual);
    const criarCanvas = (width: number, height: number) => ({
      width, height, getContext: () => ({ fillRect: () => {}, drawImage: () => {} }),
    }) as unknown as OffscreenCanvas;
    let chamadas = 0;
    const corrigida = await relerTotaisOcrMataripe(criarCanvas(1190, 1684), incompleta, 2, criarCanvas, async () => {
      chamadas++;
      return [item("80,00", 7, 0)];
    });

    expect(chamadas).toBe(1);
    expect(leituraMataripeReconcilia(corrigida, 595)).toBe(true);
  });

  it("preserva a descrição do código corrigido e deixa as outras células intactas", () => {
    const originais = [
      item("300B", 38, 655, 16), item("AHRA", 55, 655), item("7,00", 430, 655),
      item("05911/3", 38, 635, 29), item("Adic.", 72, 635),
      item("1.040,O4", 423, 635), item("9,00", 531, 634),
    ];
    const saida = mesclarNumerosOcrMataripe(originais, [
      { campo: "codigo", item: item("3008", 38, 655, 16) },
      { campo: "codigo", item: item("0591", 38, 635, 16) },
      { campo: "provento", item: item("1.040,04", 423, 634) },
    ], 595);
    expect(saida.map((atual) => atual.str)).toEqual(expect.arrayContaining([
      "3008", "AHRA", "7,00", "0591", "1/3", "Adic.", "1.040,04", "9,00",
    ]));
    expect(saida.map((atual) => atual.str)).not.toContain("300B");
    expect(saida.map((atual) => atual.str)).not.toContain("1.040,O4");
  });
});
