import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { detectarModelo, type TextItemPdf } from "@/lib/parse-contracheque-pdf";
import type { LeituraVetorialOxiteno } from "../../supabase/functions/process-contracheques-pdf/oxiteno-vetorial";
import {
  conferirCabecalhoContracheque, empresaContrachequeHomologada,
  promptPerfilContracheque, type EmpresaContracheque,
} from "@/lib/perfis-contracheque";

const edge = readFileSync("supabase/functions/process-contracheques-pdf/index.ts", "utf8").replace(/\r\n/g, "\n");
const semImports = edge.replace(/^import .*;\r?\n/gm, "").split("Deno.serve(")[0];
const js = ts.transpileModule(semImports, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

type Recibo = {
  competencia: string | null;
  modelo_origem: string;
  total_proventos: number | null;
  total_descontos: number | null;
  liquido: number | null;
  itens: { codigo: string; descricao: string; tipo: string; familia_hra: string | null; valor: number }[];
};
type ContextoIa = { empresa: EmpresaContracheque; totalPaginas: number; primeiraPagina: number; chamadas: number };
const carregarEdge = (fetchFake: typeof globalThis.fetch = globalThis.fetch) =>
  new Function("fetch", js + "\nreturn { extracaoDeterministicaPiloto, parsePagina, validarFechamentoPiloto, extrairComIa };")(fetchFake) as {
    extracaoDeterministicaPiloto: (paginas: TextItemPdf[][], empresa: EmpresaContracheque, inicio: number,
      entrada: Recibo | null, ultimo: boolean, leiturasOxiteno?: ReadonlyMap<number, LeituraVetorialOxiteno>) =>
      { fechados: Recibo[]; aberto: Recibo | null; usarIa: boolean };
    parsePagina: (itens: TextItemPdf[], largura: number) => Recibo;
    validarFechamentoPiloto: (recibo: Recibo, empresa: EmpresaContracheque) => void;
    extrairComIa: (bytes: Uint8Array, nome: string, key: string, memoria: [], revisao: undefined, piloto: ContextoIa) => Promise<Recibo[]>;
  };
const { extracaoDeterministicaPiloto: extrair, parsePagina, validarFechamentoPiloto } = carregarEdge();

const item = (str: string, x: number, y: number, width = 75): TextItemPdf => ({ str, x, y, width, height: 9 });
function pagina(empresa: string, ...mais: TextItemPdf[]): TextItemPdf[] {
  return [
    item("04/02/2026", 10, 790), item("Demonstrativo de Pagamento", 150, 770),
    item(empresa, 34, 736), item("REFERÊNCIA", 410, 704), item("30/NOVEMBRO/2023", 390, 690),
    item("CONTA", 160, 640), item("QTDE.", 330, 640), item("VENCIMENTOS", 418, 640), item("DESCONTOS", 522, 640),
    item("3331", 34, 625, 20), item("HRA-Dif. Dissídio", 62, 625), item("|", 460, 625, 2), item("50,75", 446, 625, 30),
    ...mais,
  ];
}
const oxiteno = "OXITENO S A INDÚSTRIA E COMÉRCIO";
const mataripe = "REFINARIA DE MATARIPE S.A.";

describe("Piloto de contracheques por empresa", () => {
  it("mantém o catálogo e as regras espelhados na função publicada", () => {
    const canon = readFileSync("src/lib/perfis-contracheque.ts", "utf8").replace(/\r\n/g, "\n")
      .split("\n").slice(1).join("\n").trimEnd().replace(/^export /gm, "");
    const espelho = edge.split("// INÍCIO ESPELHO PERFIS CONTRACHEQUE\n")[1]?.split("\n// FIM ESPELHO PERFIS CONTRACHEQUE")[0];
    expect(espelho).toBe(canon);
    expect(empresaContrachequeHomologada("dow")).toBe(false);
    expect(empresaContrachequeHomologada("__proto__")).toBe(false);
  });

  it("usa a referência e trata BASE/OUTROS em Mataripe sem exportar a regra Oxiteno", () => {
    const [recibo] = extrair([pagina(mataripe,
      item("3557", 34, 611, 20), item("DIF. AHRA ACT", 62, 611), item("25,00", 440, 611),
      item("-----BASE/OUTROS-----", 62, 600), item("5501", 34, 585, 20),
      item("Base IR", 62, 585), item("105,44", 535, 585, 30),
    )], "acelen", 1, null, true).fechados;
    expect(recibo.competencia).toBe("11/2023");
    expect(recibo.itens).toEqual([
      expect.objectContaining({ codigo: "3331", tipo: "provento", familia_hra: "dif_ahra" }),
      expect.objectContaining({ codigo: "3557", tipo: "provento", familia_hra: "ahra" }),
      expect.objectContaining({ codigo: "5501", tipo: "informativo" }),
    ]);
    expect(recibo.total_proventos).toBeNull();
  });

  it("usa a leitura visual da Oxiteno somente com o empregador confirmado no PDF", () => {
    const visual: LeituraVetorialOxiteno = {
      itens: [{ codigo: "3331", descricao: "HRA-Dif. Dissídio", referencia: null, valor: 51.75, tipo: "provento" }],
      total_proventos: 51.75, total_descontos: 0, liquido: 51.75,
    };
    const leituras = new Map([[0, visual]]);
    const [recibo] = extrair([pagina(oxiteno)], "oxiteno", 1, null, true, leituras).fechados;
    expect(recibo).toMatchObject({ competencia: "11/2023", modelo_origem: "oxiteno", liquido: 51.75 });
    expect(recibo.itens[0]).toMatchObject({ codigo: "3331", valor: 51.75, familia_hra: "ahra" });
    expect(() => validarFechamentoPiloto(recibo, "oxiteno")).not.toThrow();
    expect(() => extrair([pagina(mataripe)], "oxiteno", 1, null, true, leituras)).toThrow(/Empresa incompatível/);
    expect(() => extrair([pagina("")], "oxiteno", 1, null, true, leituras)).toThrow(/Revisão necessária/);
  });

  it("lê os três quadros do rodapé de Mataripe mesmo quando o líquido fica em outra linha", () => {
    const itens = pagina(mataripe, item("T O T A I S", 36, 598), item("50,75", 249, 591),
      item("0,00", 391, 591), item("50,75", 521, 584));
    const [recibo] = extrair([itens], "acelen", 1, null, true).fechados;
    expect([recibo.total_proventos, recibo.total_descontos, recibo.liquido]).toEqual([50.75, 0, 50.75]);
    expect(() => validarFechamentoPiloto(recibo, "acelen")).not.toThrow();
  });

  it("deixa em revisão quando o rodapé impresso perde o líquido", () => {
    const itens = pagina(mataripe, item("T O T A I S", 36, 598), item("50,75", 249, 591),
      item("0,00", 391, 591), item("50:75", 521, 591));
    const [recibo] = extrair([itens], "acelen", 1, null, true).fechados;
    expect(recibo.liquido).toBeNull();
    expect(() => validarFechamentoPiloto(recibo, "acelen")).toThrow(/totais impressos não estão completamente legíveis/);
  });

  it("bloqueia o fechamento de Mataripe quando a releitura de um informativo é inconclusiva", () => {
    const itens = pagina(mataripe, item("BASE/OUTROS", 65, 597), item("5501", 34, 583, 20),
      item("Base IR", 62, 583), item("1.000,00?", 518, 583, 30),
      item("T O T A I S", 36, 569), item("50,75", 249, 561),
      item("0,00", 391, 561), item("50,75", 521, 561));
    const [recibo] = extrair([itens], "acelen", 1, null, true).fechados;
    expect(recibo.itens.map((rubrica) => rubrica.codigo)).toEqual(["3331"]);
    expect(() => validarFechamentoPiloto(recibo, "acelen")).toThrow(/rubricas com valor ilegível/);
  });

  it("mantém o valor alinhado à direita na faixa de vencimentos de Mataripe", () => {
    const itens = pagina(mataripe, item("|", 425, 610, 2))
      .filter((i) => i.str !== "|" || i.x !== 460)
      .map((i) => i.str === "VENCIMENTOS" ? { ...i, x: 397 }
        : i.str === "DESCONTOS" ? { ...i, x: 498 }
        : i.str === "50,75" ? { ...i, x: 451 } : i);
    const [recibo] = extrair([itens], "acelen", 1, null, true).fechados;
    expect(parsePagina(itens, 595).itens[0].tipo).toBe("desconto");
    expect(recibo.itens[0].tipo).toBe("provento");
  });

  it("separa código numérico colado à fração da descrição em Mataripe", () => {
    const itens = pagina(mataripe, item("05911/3", 34, 605, 33), item("Adic. Const.", 71, 605), item("80,00", 455, 605));
    const [recibo] = extrair([itens], "acelen", 1, null, true).fechados;
    expect(recibo.itens[1]).toMatchObject({ codigo: "0591", descricao: "1/3 Adic. Const.", valor: 80 });
    expect(() => validarFechamentoPiloto(recibo, "acelen")).not.toThrow();
  });

  it("sinaliza o código ilegível de uma rubrica com valor, em vez de adotar a primeira palavra", () => {
    const itens = pagina(mataripe, item("3ON", 34, 601, 20), item("ATN", 60, 601), item("7,80", 455, 601));
    const [recibo] = extrair([itens], "acelen", 1, null, true).fechados;
    expect(recibo.itens.map((rubrica) => rubrica.codigo)).toEqual(["3331"]);
    expect(() => validarFechamentoPiloto(recibo, "acelen")).toThrow(/código de rubrica ilegível/);
  });

  it("recupera a referência ADP pela posição impressa quando o OCR perde o rótulo", () => {
    const semRotulo = pagina(mataripe, item("6.000,00/MES", 300, 690),
      item("DATA DE PAGAMENTO: 01/12/2023", 40, 678),
    ).filter((i) => i.str !== "REFERÊNCIA");
    const [recibo] = extrair([semRotulo], "acelen", 1, null, true).fechados;
    expect(recibo.competencia).toBe("11/2023");
    const semReferencia = semRotulo.filter((i) => i.str !== "30/NOVEMBRO/2023");
    expect(() => extrair([semReferencia], "acelen", 1, null, true)).toThrow(/referência ilegível/);
  });

  it("confirma CNPJ homologado com nome ilegível e corrige a classificação antes genérica", () => {
    const itens = pagina("62.545.686/0019-82");
    expect(conferirCabecalhoContracheque(itens, "oxiteno", detectarModelo)).toBe("confirmada");
    expect(parsePagina(itens, 595).modelo_origem).toBe("generico");
    expect(extrair([itens], "oxiteno", 1, null, true).fechados[0].itens[0])
      .toMatchObject({ codigo: "3331", tipo: "provento", familia_hra: "ahra" });
  });

  it("rejeita empresa diferente mesmo depois de um recibo em conformidade", () => {
    expect(() => extrair([pagina(oxiteno), pagina(mataripe)], "oxiteno", 6, null, true))
      .toThrow(/Empresa incompatível na página 7/);
    expect(() => extrair([pagina(oxiteno, item("Aviso de Crédito", 120, 400),
      item("PETROBRAS", 100, 370), item("VENCIMENTOS", 420, 350), item("DESCONTOS", 520, 350),
    )], "oxiteno", 6, null, true)).toThrow(/Empresa incompatível/);
  });

  it("envia à IA só o lote sem dados estruturados e sinaliza página sem cobertura em lote misto", () => {
    expect(extrair([[]], "oxiteno", 1, null, true).usarIa).toBe(true);
    expect(() => extrair([pagina(oxiteno), []], "oxiteno", 1, null, true)).toThrow(/página 2/);
    expect(() => extrair([pagina("")], "oxiteno", 1, null, true)).toThrow(/Revisão necessária/);
  });

  it("retoma continuação explícita e não une recibos fechados pela competência", () => {
    const primeiroLote = extrair([pagina(oxiteno, item("CONTINUA...", 50, 550))], "oxiteno", 1, null, false);
    expect(primeiroLote.fechados).toHaveLength(0);
    const continuacao = pagina("", item("CONTINUAÇÃO", 75, 725)).filter((i) => !i.str.startsWith("Demonstrativo"));
    const segundoLote = extrair([continuacao, pagina(oxiteno)], "oxiteno", 2, primeiroLote.aberto, true);
    expect(segundoLote.fechados.map((recibo) => recibo.competencia)).toEqual(["11/2023", "11/2023"]);
    expect(segundoLote.aberto).toBeNull();
    expect(() => extrair([pagina(oxiteno, item("CONTINUA...", 50, 550))], "oxiteno", 1, null, true)).toThrow(/recibo em continuação/);
  });

  it("isola a instrução da IA e mantém o limite de uma releitura de totais", async () => {
    expect(promptPerfilContracheque("acelen")).not.toMatch(/3331|Oxiteno/i);
    const feedback: Record<string, unknown>[] = [];
    const recibo = {
      competencia: "11/2023", modelo_origem: "oxiteno", empregador_impresso: oxiteno, paginas: [1],
      total_proventos: 50.75, total_descontos: 0, liquido: 50.75, retificado: false,
      itens: [{ codigo: "3331", descricao: "HRA-Dif. Dissídio", referencia: null, valor: 60, tipo: "provento" }],
    };
    const { extrairComIa } = carregarEdge(async (_url, init) => {
      feedback.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ contracheques: [recibo] }) } }] } }],
      }));
    });
    const contexto: ContextoIa = { empresa: "oxiteno", totalPaginas: 1, primeiraPagina: 6, chamadas: 0 };
    await expect(extrairComIa(new Uint8Array(), "teste", "teste", [], undefined, contexto)).rejects.toThrow(/divergência/);
    expect(contexto.chamadas).toBe(2);
    expect(feedback).toHaveLength(2);
    contexto.totalPaginas = 2;
    await expect(extrairComIa(new Uint8Array(), "teste", "teste", [], undefined, contexto)).rejects.toThrow(/página 7/);
    recibo.empregador_impresso = mataripe;
    await expect(extrairComIa(new Uint8Array(), "teste", "teste", [], undefined, contexto)).rejects.toThrow(/Empresa incompatível/);
  });

  it.skipIf(!process.env.GLCM_OXITENO_PDF)("confere o PDF completo Oxiteno e compara o custo do parser", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await getDocument({
      data: new Uint8Array(readFileSync(process.env.GLCM_OXITENO_PDF!)), useSystemFonts: true,
    }).promise;
    try {
      const paginas: TextItemPdf[][] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        paginas.push(content.items.flatMap((x) =>
          "str" in x ? [item(x.str, x.transform[4], x.transform[5], x.width)] : [],
        ));
        page.cleanup();
      }
      expect(paginas).toHaveLength(39);
      const paginasLegiveis: TextItemPdf[][] = [];
      const pendentes: number[] = [];
      const pendentesAtuais: number[] = [];
      paginas.forEach((itens, i) => {
        const [recibo] = extrair([itens], "oxiteno", i + 1, null, true).fechados;
        const atual = parsePagina(itens, 595);
        expect(recibo.competencia).toBe(atual.competencia);
        expect(recibo.itens).toEqual(atual.itens);
        try { validarFechamentoPiloto(atual, "oxiteno"); }
        catch { pendentesAtuais.push(i + 1); }
        try { validarFechamentoPiloto(recibo, "oxiteno"); }
        catch { pendentes.push(i + 1); return; }
        paginasLegiveis.push(itens);
      });
      expect(pendentes).toContain(10);
      expect(pendentes).toEqual(pendentesAtuais);
      if (process.env.GLCM_MEDIR_PARSER === "1") {
        const duracoes = { atual: [] as number[], piloto: [] as number[] };
        const medir = (tipo: keyof typeof duracoes) => {
          const inicio = performance.now();
          paginasLegiveis.forEach((itens, i) => validarFechamentoPiloto(tipo === "atual"
            ? parsePagina(itens, 595)
            : extrair([itens], "oxiteno", i + 1, null, true).fechados[0], "oxiteno"));
          duracoes[tipo].push(performance.now() - inicio);
        };
        for (let i = 0; i < 5; i++) { medir("atual"); medir("piloto"); }
        duracoes.atual.length = duracoes.piloto.length = 0;
        for (let i = 0; i < 30; i++) {
          const ordem = i % 2 ? ["piloto", "atual"] as const : ["atual", "piloto"] as const;
          ordem.forEach(medir);
        }
        const stats = (xs: number[]) => {
          const ordenados = [...xs].sort((a, b) => a - b);
          return { medianaMs: Math.round((ordenados[14] + ordenados[15]) / 2), p95Ms: Math.round(ordenados[28]) };
        };
        console.info("Parser local", {
          pags: paginasLegiveis.length, paginasPendentes: pendentes.length, repeticoes: 30,
          atual: stats(duracoes.atual), piloto: stats(duracoes.piloto),
        });
      }
    } finally {
      await pdf.destroy();
    }
  }, 30_000);
});
