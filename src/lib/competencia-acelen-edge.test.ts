// Guarda do espelho: executa a função normalizarCompetenciaAcelen copiada
// inline na PRÓPRIA Edge Function process-contracheques-pdf (não o módulo
// src/lib/competencia-acelen.ts), garantindo que as duas fontes não divirjam.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { normalizarCompetenciaAcelen as normalizarSrc } from "./competencia-acelen";

function carregarNormalizadorDaEdge(): typeof normalizarSrc {
  const fonte = readFileSync(
    resolve(process.cwd(), "supabase/functions/process-contracheques-pdf/index.ts"),
    "utf8",
  );
  const inicio = fonte.indexOf("function ehCompetenciaCanonica");
  const fim = fonte.indexOf("function familia(");
  if (inicio < 0 || fim < 0 || fim <= inicio) {
    throw new Error("Trecho normalizarCompetenciaAcelen não localizado na Edge Function");
  }
  const js = ts.transpileModule(fonte.slice(inicio, fim), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  // MESES e norm são dependências declaradas no topo da Edge Function.
  const MESES: Record<string, string> = {
    janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
    julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
  };
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return new Function(
    "MESES", "norm",
    `${js}; return normalizarCompetenciaAcelen;`,
  )(MESES, norm) as typeof normalizarSrc;
}

const normalizarEdge = carregarNormalizadorDaEdge();

describe("guarda do normalizador Acelen na Edge Function process-contracheques-pdf", () => {
  it("normaliza DD/MM/AAAA, AAAA-MM-DD, DD/MÊS/AAAA e cabeçalho Recibo de Pagamento", () => {
    expect(normalizarEdge("31/03/2023")).toBe("03/2023");
    expect(normalizarEdge("2024-04-30")).toBe("04/2024");
    expect(normalizarEdge("28/FEVEREIRO/2023")).toBe("02/2023");
    expect(normalizarEdge("Recibo de Pagamento de MARÇO/2023")).toBe("03/2023");
    expect(normalizarEdge("05/2023")).toBe("05/2023");
  });

  it("devolve null para formatos inválidos — nunca inventa competência", () => {
    expect(normalizarEdge(null)).toBeNull();
    expect(normalizarEdge("")).toBeNull();
    expect(normalizarEdge("contracheques-unificados.pdf")).toBeNull();
    expect(normalizarEdge("13/2023")).toBeNull();
    expect(normalizarEdge("31/13/2023")).toBeNull();
  });

  it("saída idêntica à fonte canônica src/lib/competencia-acelen.ts", () => {
    const casos = [
      "31/03/2023",
      "2024-04-30",
      "28/FEVEREIRO/2023",
      "Recibo de Pagamento de MARÇO/2023",
      "05/2023",
      null,
      "",
      "arquivo.pdf",
    ];
    for (const caso of casos) {
      expect(normalizarEdge(caso)).toBe(normalizarSrc(caso));
    }
  });
});
