// Teste de guarda do espelho: falha se as cópias inline da Edge Function
// generate-documents divergirem das fontes canônicas em src/lib.
// A comparação é funcional (mesma entrada, saída idêntica), não textual.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { selecionarPecas } from "./modelos-documentos";
import {
  agregarBancoHorasPorCompetencia,
  agregarContribExtraPorCompetencia,
  montarArquivosPlanilhaBancoHorasXlsx,
  montarArquivosPlanilhaContribExtraXlsx,
  montarArquivosPlanilhaXlsx,
  ordenarPorCompetencia,
} from "./planilha-xlsx";
import { contrachequesRelacionaisParaRevisao } from "./contracheques-relacionais";
import { PECA_LABELS } from "./status";

function carregarTrechoDaFuncao<T extends Record<string, unknown>>(
  inicioMarcador: string,
  fimMarcador: string,
  exportados: string[],
): T {
  const fonte = readFileSync(
    resolve(process.cwd(), "supabase/functions/generate-documents/index.ts"),
    "utf8",
  );
  const inicio = fonte.indexOf(inicioMarcador);
  const fim = fonte.indexOf(fimMarcador);
  if (inicio < 0 || fim < 0 || fim <= inicio) {
    throw new Error(`Marcadores do espelho não localizados na Edge Function: ${inicioMarcador}`);
  }
  const js = ts.transpileModule(fonte.slice(inicio, fim), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(`${js}; return { ${exportados.join(", ")} };`)() as T;
}

const edgePecas = carregarTrechoDaFuncao<{ selecionarPecas: typeof selecionarPecas }>(
  "const DOCUMENTOS_POR_TIPO_ACAO",
  "function garantirMarcadorNumeroContrato",
  ["selecionarPecas"],
);

const edgePlanilha = carregarTrechoDaFuncao<{
  ordenarPorCompetencia: typeof ordenarPorCompetencia;
  montarArquivosPlanilhaXlsx: typeof montarArquivosPlanilhaXlsx;
  agregarBancoHorasPorCompetencia: typeof agregarBancoHorasPorCompetencia;
  montarArquivosPlanilhaBancoHorasXlsx: typeof montarArquivosPlanilhaBancoHorasXlsx;
  agregarContribExtraPorCompetencia: typeof agregarContribExtraPorCompetencia;
  montarArquivosPlanilhaContribExtraXlsx: typeof montarArquivosPlanilhaContribExtraXlsx;
}>("type LinhaPlanilha", "// ---------------- função principal", [
  "ordenarPorCompetencia",
  "montarArquivosPlanilhaXlsx",
  "agregarBancoHorasPorCompetencia",
  "montarArquivosPlanilhaBancoHorasXlsx",
  "agregarContribExtraPorCompetencia",
  "montarArquivosPlanilhaContribExtraXlsx",
]);

const edgeCalculos = carregarTrechoDaFuncao<{
  montarContrasRelacionais: (
    contracheques: Array<{ id: string; competencia?: string | null; arquivo_origem?: string | null }>,
    itens: Array<{ contracheque_id?: string | null; valor?: number | null; tipo?: string | null; familia_hra?: string | null }>,
  ) => Array<{ id: string; label: string; valor_hra: number; valor_ahra: number }>;
}>("type ContrachequeRelacional = { id:", "// ---------------- função principal", ["montarContrasRelacionais"]);

describe("guarda do espelho src/lib ↔ generate-documents", () => {
  it("selecionarPecas: saída idêntica para todos os tipos e escritórios", () => {
    const tipos = [
      "ir_sobre_hra",
      "contribuicao_extraordinaria",
      "tema_324",
      "horas_extras",
      "supressao_folgas",
    ];
    const combos = [[], ["glcm"], ["polkowski"], ["glcm", "polkowski"]];
    for (const tipo of tipos) {
      for (const escritorios of combos) {
        expect(selecionarPecas(tipo, escritorios)).toEqual(
          edgePecas.selecionarPecas(tipo, escritorios),
        );
      }
    }
  });

  it("selecionarPecas: mensagem de erro idêntica para tipo desconhecido", () => {
    let erroEdge = "";
    try {
      edgePecas.selecionarPecas("desconhecido", []);
    } catch (e) {
      erroEdge = e instanceof Error ? e.message : "";
    }
    expect(erroEdge).not.toBe("");
    expect(() => selecionarPecas("desconhecido", [])).toThrow(erroEdge);
  });

  it("planilha: saída byte a byte idêntica", () => {
    const casos = [
      [],
      [{ competencia: "01/2024", hra: 100, ahra: 50 }],
      [
        { competencia: "03/2024", hra: 100.555, ahra: 50 },
        { competencia: "01/2023", hra: 200, ahra: 0 },
        { competencia: "12/2023", hra: 300, ahra: 25 },
        { competencia: "Contracheque 9", hra: 10, ahra: 0 },
        { competencia: "Contracheque 2", hra: 20, ahra: 0 },
      ],
      [{ competencia: "nome <com> & caracteres", hra: 1, ahra: 2 }],
    ];
    for (const linhas of casos) {
      expect(montarArquivosPlanilhaXlsx("FULANO <&>", linhas)).toEqual(
        edgePlanilha.montarArquivosPlanilhaXlsx("FULANO <&>", linhas),
      );
    }
    expect(ordenarPorCompetencia(casos[2])).toEqual(edgePlanilha.ordenarPorCompetencia(casos[2]));
  });

  it("planilha Banco de Horas (1513): agregação e saída idênticas", () => {
    const contracheques = [
      { id: "a", competencia: "03/2024" },
      { id: "b", competencia: "01/2024" },
    ];
    const itens = [
      { contracheque_id: "a", codigo: "1513", valor: 100.55, referencia: 10 },
      { contracheque_id: "a", codigo: "0001", valor: 1500 },
      { contracheque_id: "b", codigo: "1513", valor: 200, referencia: 52 },
      { contracheque_id: "a", codigo: "1059", valor: 999 },
      { contracheque_id: "a", codigo: "1513", valor: 50, referencia: 2 },
    ];
    const agregadoSrc = agregarBancoHorasPorCompetencia(contracheques, itens);
    const agregadoEdge = edgePlanilha.agregarBancoHorasPorCompetencia(contracheques, itens);
    expect(agregadoSrc).toEqual(agregadoEdge);
    expect(montarArquivosPlanilhaBancoHorasXlsx("FULANO <&>", agregadoSrc)).toEqual(
      edgePlanilha.montarArquivosPlanilhaBancoHorasXlsx("FULANO <&>", agregadoEdge),
    );
  });

  it("planilha Contribuição Extraordinária: agregação e saída idênticas", () => {
    const contracheques = [
      { id: "a", competencia: "03/2024" },
      { id: "b", competencia: "01/2024" },
    ];
    const itens = [
      { contracheque_id: "a", valor: -100.5, familia_hra: "contrib_extra" },
      { contracheque_id: "a", valor: 50, familia_hra: "contrib_extra" },
      { contracheque_id: "b", valor: -200, familia_hra: "contrib_extra" },
      { contracheque_id: "b", valor: 10, familia_hra: "hra" },
      { contracheque_id: "b", codigo: "6060", tipo: "desconto", valor: 30, descricao: "CONTRIB EXTRAORDINARIA PPSP-R" },
      { contracheque_id: "b", codigo: "6070", tipo: "desconto", valor: 20, descricao: "Contribuição Extra PPSP" },
      { contracheque_id: "b", codigo: "6050", tipo: "desconto", valor: 500, descricao: "CONTRIB EXTRAORDINARIA PPSP" },
    ];
    const src = agregarContribExtraPorCompetencia(contracheques, itens);
    const edge = edgePlanilha.agregarContribExtraPorCompetencia(contracheques, itens);
    expect(src).toEqual(edge);
    expect(montarArquivosPlanilhaContribExtraXlsx("FULANO <&>", src)).toEqual(
      edgePlanilha.montarArquivosPlanilhaContribExtraXlsx("FULANO <&>", edge),
    );
  });

  it("cálculos: adicional HRA em provento compõe AHRA, inclusive a rubrica 023", () => {
    const contracheques = [{ id: "a", competencia: "04/2026" }];
    const itens = [
      { contracheque_id: "a", valor: 100, tipo: "provento", familia_hra: "adicional_hra" },
      { contracheque_id: "a", valor: 50, tipo: "provento", familia_hra: "hra" },
    ];
    const fonte = contrachequesRelacionaisParaRevisao([{
      ...contracheques[0],
      itens_contracheque: itens,
    }]);
    expect(edgeCalculos.montarContrasRelacionais(contracheques, itens)).toEqual(fonte);
  });

  it("ir_sobre_hra gera planilha complementar de contribuição extraordinária só quando há rubricas", () => {
    const fonte = readFileSync(
      resolve(process.cwd(), "supabase/functions/generate-documents/index.ts"),
      "utf8",
    );
    expect(fonte).toContain('if (caso.tipo_acao === "ir_sobre_hra") {');
    expect(fonte).toContain("if (linhasCE.length > 0) {");
    expect(fonte).toContain('tipo: "planilha_contrib_extra"');
    // a ação exclusiva continua gerando apenas a planilha principal
    expect(fonte).toContain('const ehContribExtra = caso.tipo_acao === "contribuicao_extraordinaria";');
    expect(PECA_LABELS.planilha_contrib_extra).toBe("Planilha — Contribuição Extraordinária (Excel)");
  });
});
