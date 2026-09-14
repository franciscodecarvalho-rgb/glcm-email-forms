import { describe, expect, it } from "vitest";
import {
  deduplicarTermos,
  descricaoCorrespondeAosTermos,
  escaparCuringas,
  montarFiltroDescricao,
  normalizarTermo,
  termosEquivalentes,
} from "./temas";

describe("normalizarTermo", () => {
  it("ignora caixa e espaços repetidos", () => {
    expect(normalizarTermo("  Banco   DE  Horas ")).toBe("banco de horas");
    expect(normalizarTermo(null)).toBe("");
  });

  it("considera equivalentes termos com caixa/espaços diferentes", () => {
    expect(termosEquivalentes("PPSP", " ppsp ")).toBe(true);
    expect(termosEquivalentes("Confinamento", "Confinamento Extra")).toBe(false);
  });
});

describe("deduplicarTermos", () => {
  it("remove equivalentes e vazios preservando a ordem", () => {
    expect(deduplicarTermos(["Banco de Horas", "  banco   de horas ", "", "PPSP"])).toEqual([
      "Banco de Horas",
      "PPSP",
    ]);
  });
});

describe("escaparCuringas", () => {
  it("trata curingas como caractere literal", () => {
    expect(escaparCuringas("100%_hra")).toBe("100\\%\\_hra");
    expect(escaparCuringas("a\\b")).toBe("a\\\\b");
  });
});

describe("descricaoCorrespondeAosTermos", () => {
  const termos = ["banco de horas", "confinamento", "ppsp"];

  it("aceita correspondência literal ignorando caixa e espaços", () => {
    expect(descricaoCorrespondeAosTermos("BANCO  DE HORAS - CREDITO", termos)).toBe(true);
    expect(descricaoCorrespondeAosTermos("Adicional de Confinamento", termos)).toBe(true);
    expect(descricaoCorrespondeAosTermos("PPSP-R NORMAL", termos)).toBe(true);
  });

  it("rejeita descrições sem nenhum termo", () => {
    expect(descricaoCorrespondeAosTermos("Hora Repouso Alimentacao", termos)).toBe(false);
    expect(descricaoCorrespondeAosTermos(null, termos)).toBe(false);
    expect(descricaoCorrespondeAosTermos("Confinamento", [])).toBe(false);
  });

  it("não trata curinga digitado como coringa", () => {
    expect(descricaoCorrespondeAosTermos("banco de horas", ["banco%horas"])).toBe(false);
  });
});

describe("montarFiltroDescricao", () => {
  it("combina os termos por OU, com curingas escapados", () => {
    expect(montarFiltroDescricao(["Banco de Horas", "PPSP"])).toBe(
      'descricao.ilike."*banco de horas*",descricao.ilike."*ppsp*"',
    );
  });

  it("escapa curingas do usuário", () => {
    expect(montarFiltroDescricao(["100%"])).toBe('descricao.ilike."*100\\%*"');
  });

  it("retorna nulo quando não há termos", () => {
    expect(montarFiltroDescricao([])).toBeNull();
    expect(montarFiltroDescricao(["   "])).toBeNull();
  });
});
