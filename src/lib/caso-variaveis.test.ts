import { describe, it, expect } from "vitest";
import { montarVariaveisCaso, montarEnderecoCompleto } from "./caso-variaveis";

describe("montarEnderecoCompleto", () => {
  it("monta no estilo das peças", () => {
    expect(
      montarEnderecoCompleto({
        logradouro: "Rua Alvilandia",
        numero: "120",
        bairro: "Bangu",
        cidade: "Rio de Janeiro",
        estado: "RJ",
        cep: "21860-340",
      }),
    ).toBe("Rua Alvilandia, nº 120, Bangu, Rio de Janeiro/RJ, CEP 21860-340");
  });

  it("tolera campos ausentes", () => {
    expect(montarEnderecoCompleto({ logradouro: "Rua X", cidade: "Salvador", estado: "BA" })).toBe(
      "Rua X, Salvador/BA",
    );
    expect(montarEnderecoCompleto(null)).toBe("");
  });
});

describe("montarVariaveisCaso", () => {
  const casoRuan = {
    nome_cliente: "RUAN VIEIRA D ECA",
    cpf: "059.538.337-84",
    rg: "214655763",
    endereco: {
      logradouro: "Rua Alvilandia",
      numero: "120",
      bairro: "Bangu",
      cidade: "Rio de Janeiro",
      estado: "RJ",
      cep: "21860-340",
    },
    qualificacao: { nacionalidade: "brasileiro", estado_civil: "solteiro", profissao: "industriário" },
    numero_pasta: "2026/0123",
    honorarios_pct: 20,
    valor_causa: 36650.81,
  };

  it("preenche as variáveis principais", () => {
    const v = montarVariaveisCaso(casoRuan, new Date(2026, 3, 18)); // 18/04/2026
    expect(v.NOME_CLIENTE).toBe("RUAN VIEIRA D ECA");
    expect(v.ESTADO_CIVIL).toBe("solteiro");
    expect(v.PROFISSAO).toBe("industriário");
    expect(v.CIDADE_UF).toBe("Rio de Janeiro/RJ");
    expect(v.DATA).toBe("18/04/2026");
    expect(v.HONORARIOS_PCT).toBe("20");
    expect(v.VALOR_CAUSA_EXTENSO).toBe(
      "trinta e seis mil, seiscentos e cinquenta reais e oitenta e um centavos",
    );
  });

  it("usa nacionalidade padrão e local de assinatura fixo", () => {
    const v = montarVariaveisCaso({ valor_causa: 0 }, new Date(2026, 0, 1));
    expect(v.NACIONALIDADE).toBe("brasileiro(a)");
    expect(v.LOCAL_ASSINATURA).toBe("Salvador/BA");
  });

  it("trata marcadores de ausência da IA como campo em branco", () => {
    const v = montarVariaveisCaso(
      {
        ...casoRuan,
        qualificacao: { nacionalidade: "Não informado", estado_civil: "Não consta", profissao: "NULL" },
      },
      new Date(2026, 0, 1),
    );
    expect(v.ESTADO_CIVIL).toBe("");
    expect(v.PROFISSAO).toBe("");
    expect(v.NACIONALIDADE).toBe("brasileiro(a)"); // cai no padrão
  });

  it("normaliza nacionalidade abreviada/país para o padrão, mas preserva gênero real", () => {
    const br = montarVariaveisCaso(
      { ...casoRuan, qualificacao: { nacionalidade: "BR" } },
      new Date(2026, 0, 1),
    );
    expect(br.NACIONALIDADE).toBe("brasileiro(a)");

    const feminino = montarVariaveisCaso(
      { ...casoRuan, qualificacao: { nacionalidade: "brasileira", estado_civil: "casada", profissao: "médica" } },
      new Date(2026, 0, 1),
    );
    expect(feminino.NACIONALIDADE).toBe("brasileira");
    expect(feminino.ESTADO_CIVIL).toBe("casada");
    expect(feminino.PROFISSAO).toBe("médica");
  });
});
