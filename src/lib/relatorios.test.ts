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
  acaoViavel,
  calcularMetricasGestao,
  deduplicarLancamentos,
  deduplicarPessoas,
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

  it("rejeita ano 0000 em ambos os formatos", () => {
    expect(normalizarCompetenciaFiltro("04/0000")).toBeNull();
    expect(normalizarCompetenciaFiltro("0000-04")).toBeNull();
    expect(chaveCompetencia("04/0000")).toBeNull();
    expect(chaveCompetencia("0000-04")).toBeNull();
  });

  it("compara períodos entre formatos diferentes", () => {
    expect(chaveCompetencia("2023-04")).toBe("202304");
    expect(periodoCoerente("2023-04", "12/2023")).toBe(true);
    expect(periodoCoerente("12/2023", "2023-04")).toBe(false);
  });
});

describe("métricas de gestão e viabilidade de ações", () => {
  it("avalia viabilidade contra o limite padrão de R$ 15.000", () => {
    expect(acaoViavel(15000)).toBe(true);
    expect(acaoViavel(330659.86)).toBe(true);
    expect(acaoViavel(14999.99)).toBe(false);
    expect(acaoViavel(0)).toBe(false);
    expect(acaoViavel(-500)).toBe(false);
  });

  it("calcula metricas de carteira, lastro e empresa predominante", () => {
    const clientes = [
      { pessoa_cpf: "21548912544", empresa: "Petrobras", competencias: 48, proventos: 369109.98, descontos: 38450.12 },
      { pessoa_cpf: "11488231500", empresa: "BASF", competencias: 36, proventos: 214800, descontos: 12100.5 },
      { pessoa_cpf: "33190281277", empresa: "Petrobras", competencias: 42, proventos: 14000, descontos: 0 },
    ];
    const metricas = calcularMetricasGestao(clientes, 3);
    expect(metricas.clientesElegiveis).toBe(3);
    expect(metricas.acoesViaveis).toBe(2); // cliente 1 e 2 superam 15k, cliente 3 tem 14k
    expect(metricas.percentualViaveis).toBe(67); // 2/3 = 67%
    expect(metricas.lastroMedioMeses).toBe(42); // (48+36+42)/3 = 42
    expect(metricas.empresaPredominante).toBe("Petrobras");
    expect(metricas.empresaPredominanteQtd).toBe(2);
  });

  it("trata lista vazia de clientes sem falhar", () => {
    const metricas = calcularMetricasGestao([], 0);
    expect(metricas.clientesElegiveis).toBe(0);
    expect(metricas.acoesViaveis).toBe(0);
    expect(metricas.percentualViaveis).toBe(0);
    expect(metricas.lastroMedioMeses).toBe(0);
    expect(metricas.empresaPredominante).toBe("—");
  });
});

describe("deduplicação canônica de lançamentos e pessoas", () => {
  it("elimina duplicidades de mesma competência, código, tipo e descrição", () => {
    const lancamentos = [
      // 8 duplicatas de 09/2021 (exatamente como visto no caso Edson Santos Sena)
      { id: "1", competencia: "09/2021", codigo: "1513", tipo: "provento", descricao: "Banco de Horas", valor: 3835.13 },
      { id: "2", competencia: "09/2021", codigo: "1513", tipo: "provento", descricao: "Banco de Horas", valor: 3835.13 },
      { id: "3", competencia: "09/2021", codigo: "1513", tipo: "provento", descricao: "Banco de Horas", valor: 3835.13 },
      { id: "4", competencia: "09/2021", codigo: "1513", tipo: "provento", descricao: "Banco de Horas", valor: 3835.13 },
      // 8 duplicatas de 10/2021
      { id: "5", competencia: "10/2021", codigo: "1513", tipo: "provento", descricao: "Banco de Horas", valor: 739.24 },
      { id: "6", competencia: "10/2021", codigo: "1513", tipo: "provento", descricao: "Banco de Horas", valor: 739.24 },
      // Outra rubrica diferente no mesmo mês (deve ser mantida)
      { id: "7", competencia: "10/2021", codigo: "1001", tipo: "provento", descricao: "Salário Base", valor: 5000 },
    ];

    const resultado = deduplicarLancamentos(lancamentos);

    expect(resultado).toHaveLength(3);
    expect(resultado[0].competencia).toBe("09/2021");
    expect(resultado[0].valor).toBe(3835.13);
    expect(resultado[1].competencia).toBe("10/2021");
    expect(resultado[1].codigo).toBe("1513");
    expect(resultado[1].valor).toBe(739.24);
    expect(resultado[2].codigo).toBe("1001");
  });

  it("normaliza competências ISO e ordena os lançamentos do mais antigo ao mais recente", () => {
    const resultado = deduplicarLancamentos([
      { id: "recente", competencia: "2025-01", codigo: "1513", tipo: "provento", descricao: "Banco de Horas" },
      { id: "antigo", competencia: "2021-12", codigo: "1513", tipo: "provento", descricao: "Banco de Horas" },
      { id: "intermediario", competencia: "11/2024", codigo: "1513", tipo: "provento", descricao: "Banco de Horas" },
      { id: "sem-competencia", competencia: "sem competência", codigo: "1513", tipo: "provento", descricao: "Banco de Horas" },
    ]);

    expect(resultado.map((l) => l.competencia)).toEqual(["12/2021", "11/2024", "01/2025", "sem competência"]);
  });

  it("deduplica pessoas pelo identificador único", () => {
    const pessoas = [
      { pessoa_id: "cpf:02334085502", pessoa_nome: "EDSON SANTOS SENA" },
      { pessoa_id: "cpf:02334085502", pessoa_nome: "EDSON SANTOS SENA" },
      { pessoa_id: "cpf:11122233344", pessoa_nome: "OUTRO CLIENTE" },
    ];

    const resultado = deduplicarPessoas(pessoas);
    expect(resultado).toHaveLength(2);
    expect(resultado[0].pessoa_id).toBe("cpf:02334085502");
    expect(resultado[1].pessoa_id).toBe("cpf:11122233344");
  });
});
