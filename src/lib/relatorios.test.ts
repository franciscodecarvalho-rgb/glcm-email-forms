import { describe, expect, it } from "vitest";
import {
  chaveLinha,
  chaveCompetencia,
  chaveRubrica,
  competenciaValida,
  cpfValido,
  identidadePessoa,
  montarRubricasPayload,
  rotuloIdentificacao,
  rotuloRubrica,
  consolidarTotais,
  chaveEmpresa,
  empresasPorOrigem,
  juntarLinhas,
  montarTemasPayload,
  normalizarCompetenciaFiltro,
  periodoCoerente,
  rotuloEmpresaModelo,
  rotuloPessoa,
  temProximaPagina,
  totalLinhas,
  TOTAIS_ZERADOS,
  type ResultadoFonte,
} from "./relatorios";

describe("filtros de período", () => {
  it("aceita apenas MM/AAAA", () => {
    expect(competenciaValida("01/2023")).toBe(true);
    expect(competenciaValida("13/2023")).toBe(false);
    expect(competenciaValida("1/2023")).toBe(false);
    expect(competenciaValida("2023-01")).toBe(true);
    expect(competenciaValida("2023-13")).toBe(false);
    expect(competenciaValida("0000-01")).toBe(false);
    expect(competenciaValida("31/03/2023")).toBe(false);
    expect(competenciaValida(null)).toBe(false);
  });

  it("normaliza vazio e inválido para null", () => {
    expect(normalizarCompetenciaFiltro("  ")).toBeNull();
    expect(normalizarCompetenciaFiltro("99/2023")).toBeNull();
    expect(normalizarCompetenciaFiltro(" 02/2024 ")).toBe("02/2024");
  });

  it("valida ordem do período", () => {
    expect(periodoCoerente("01/2023", "12/2023")).toBe(true);
    expect(periodoCoerente("12/2023", "01/2023")).toBe(false);
    expect(periodoCoerente(null, "01/2023")).toBe(true);
  });
});

describe("empresas e paginação", () => {
  const casos = { origem: "casos" as const, id: "unigel", rotulo: "unigel" };
  const historico = { origem: "historico" as const, id: "unigel", rotulo: "Unigel S.A." };

  it("mantém o identificador qualificado pela origem", () => {
    expect(chaveEmpresa(casos)).not.toBe(chaveEmpresa(historico));
    expect(empresasPorOrigem([casos, historico], "casos")).toEqual(["unigel"]);
    expect(empresasPorOrigem([casos, historico], "historico")).toEqual(["unigel"]);
  });

  it("usa total_linhas para impedir páginas sem resultado", () => {
    expect(totalLinhas([{ total_linhas: "26" }])).toBe(26);
    expect(totalLinhas([])).toBe(0);
    expect(temProximaPagina(0, 25, [25, 26])).toBe(true);
    expect(temProximaPagina(1, 25, [25, 26])).toBe(false);
  });
});

describe("temas como fonte única dos termos", () => {
  const temas = [
    { nome: "Banco de Horas", termos: ["  Banco   DE Horas ", "banco de horas"] },
    { nome: "Confinamento", termos: ["Confinamento"] },
    { nome: "PPSP", termos: ["PPSP"] },
    { nome: "Vazio", termos: ["   "] },
  ];

  it("normaliza, deduplica e descarta temas sem termo", () => {
    expect(montarTemasPayload(temas, [])).toEqual([
      { tema: "Banco de Horas", termos: ["banco de horas"] },
      { tema: "Confinamento", termos: ["confinamento"] },
      { tema: "PPSP", termos: ["ppsp"] },
    ]);
  });

  it("respeita a seleção do filtro", () => {
    expect(montarTemasPayload(temas, ["PPSP"])).toEqual([{ tema: "PPSP", termos: ["ppsp"] }]);
  });
});

describe("segregação de fontes", () => {
  const casos = { itens: 10, pessoas: 3, empresas: 2, proventos: 100, descontos: 20 };
  const historico = { itens: 40, pessoas: 9, empresas: 5, proventos: 400, descontos: 50 };

  it("apresenta subtotais e alerta de sobreposição quando as duas fontes têm dados", () => {
    const r = consolidarTotais([
      { origem: "casos", estado: "ok", totais: casos },
      { origem: "historico", estado: "ok", totais: historico },
    ]);
    expect(r.somaSimples.itens).toBe(50);
    expect(r.somaSimples.proventos).toBe(500);
    expect(r.sobreposicaoNaoValidada).toBe(true);
    expect(r.parcial).toBe(false);
    expect(r.subtotais).toHaveLength(2);
  });

  it("marca estado parcial e ignora fonte indisponível na soma", () => {
    const r = consolidarTotais([
      { origem: "casos", estado: "ok", totais: casos },
      { origem: "historico", estado: "indisponivel", totais: { ...TOTAIS_ZERADOS } },
    ]);
    expect(r.parcial).toBe(true);
    expect(r.somaSimples.itens).toBe(10);
    expect(r.sobreposicaoNaoValidada).toBe(false);
  });

  it("não agrupa pessoas nem empresas entre bases", () => {
    expect(chaveLinha("casos", "abc")).not.toBe(chaveLinha("historico", "abc"));
    const fontes: ResultadoFonte<{ pessoa_id: string; pessoa_nome: string }>[] = [
      { origem: "casos", estado: "ok", dados: [{ pessoa_id: "1", pessoa_nome: "Maria" }] },
      { origem: "historico", estado: "ok", dados: [{ pessoa_id: "1", pessoa_nome: "Maria" }] },
      { origem: "historico", estado: "erro", dados: [{ pessoa_id: "9", pessoa_nome: "Ana" }] },
    ];
    const linhas = juntarLinhas(fontes);
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.origem)).toEqual(["casos", "historico"]);
  });
});

describe("rótulos de valores ausentes", () => {
  it("usa categoria explícita para empresa e pessoa sem nome", () => {
    expect(rotuloEmpresaModelo(null)).toBe("(sem empresa/modelo)");
    expect(rotuloEmpresaModelo("  ")).toBe("(sem empresa/modelo)");
    expect(rotuloEmpresaModelo("Acelen")).toBe("Acelen");
    expect(rotuloPessoa(null)).toBe("(sem nome informado)");
  });
});

describe("identidade de pessoa por CPF válido", () => {
  it("valida CPF pelo módulo 11 e rejeita máscara inválida ou dígitos repetidos", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("123")).toBe(false);
    expect(cpfValido(null)).toBe(false);
  });

  it("une dois casos do mesmo CPF em uma única pessoa, ignorando a máscara", () => {
    const a = identidadePessoa("529.982.247-25", "caso-1");
    const b = identidadePessoa("52998224725", "caso-2");
    expect(a.pessoaId).toBe(b.pessoaId);
    expect(a.identificacao).toBe("cpf");
  });

  it("sem CPF validado, identifica pelo registro e marca explicitamente", () => {
    const a = identidadePessoa(null, "caso-1");
    const b = identidadePessoa("111.111.111-11", "caso-2");
    expect(a.pessoaId).toBe("caso:caso-1");
    expect(b.pessoaId).toBe("caso:caso-2");
    expect(a.identificacao).toBe("caso_sem_cpf");
    expect(rotuloIdentificacao(a.identificacao)).toMatch(/Sem CPF validado/);
  });

  it("nunca unifica pessoas entre origens: a chave de linha é qualificada", () => {
    const id = identidadePessoa("529.982.247-25", "caso-1").pessoaId;
    expect(chaveLinha("casos", id)).not.toBe(chaveLinha("historico", id));
  });
});

describe("seleção de rubrica pela combinação exata", () => {
  const a = { codigo: "015", descricao: "Hrs Repouso Alimentacao", tipo: "provento", empresa: "unigel" };
  const b = { codigo: "015", descricao: "Outra rubrica", tipo: "provento", empresa: "unigel" };
  const c = { codigo: "015", descricao: "Hrs Repouso Alimentacao", tipo: "desconto", empresa: "unigel" };
  const semCodigo = { codigo: null, descricao: "Sem código", tipo: "provento", empresa: null };

  it("distingue mesmo código com descrição, tipo ou empresa/modelo diferentes", () => {
    expect(chaveRubrica(a)).not.toBe(chaveRubrica(b));
    expect(chaveRubrica(a)).not.toBe(chaveRubrica(c));
    expect(chaveRubrica(a)).not.toBe(chaveRubrica({ ...a, empresa: "basf" }));
  });

  it("preserva o código original e aceita código nulo", () => {
    const payload = montarRubricasPayload([a, a, semCodigo]);
    expect(payload).toEqual([a, semCodigo]);
    expect(payload[0].codigo).toBe("015");
    expect(payload[1].codigo).toBeNull();
  });

  it("descreve a rubrica com o rótulo empresa/modelo", () => {
    expect(rotuloRubrica(semCodigo)).toBe("(sem código) · Sem código · provento · (sem empresa/modelo)");
  });
});

describe("competência aceita MM/AAAA e AAAA-MM", () => {
  it("normaliza AAAA-MM para MM/AAAA e rejeita mês inválido", () => {
    expect(normalizarCompetenciaFiltro("2023-04")).toBe("04/2023");
    expect(normalizarCompetenciaFiltro("2023-00")).toBeNull();
    expect(normalizarCompetenciaFiltro("contracheques-unificados.pdf")).toBeNull();
  });

  it("compara períodos entre formatos diferentes", () => {
    expect(chaveCompetencia("2023-04")).toBe("202304");
    expect(periodoCoerente("2023-04", "12/2023")).toBe(true);
    expect(periodoCoerente("12/2023", "2023-04")).toBe(false);
  });
});
