// Construtor das variáveis de template a partir de um caso.
// Produz um mapa estável (chaves tipo NOME_CLIENTE) que a geração de documentos
// usa para preencher as 8 peças. Função pura e testável.

import { valorPorExtenso, extensoInteiro } from "./valor-extenso";
import type { EnderecoCaso, Qualificacao, EscritorioId } from "./caso-tipos";

export type CasoParaDocumento = {
  nome_cliente?: string | null;
  cpf?: string | null;
  rg?: string | null;
  endereco?: EnderecoCaso | null;
  qualificacao?: Qualificacao | null;
  numero_pasta?: string | null;
  numero_contrato?: string | null;
  honorarios_pct?: number | null;
  valor_causa?: number | null;
  escritorios?: EscritorioId[] | null;
};

/** Local fixo da assinatura das peças (sede do escritório). */
const LOCAL_ASSINATURA = "Salvador/BA";

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Monta o endereço completo do cliente no estilo das peças. */
export function montarEnderecoCompleto(e?: EnderecoCaso | null): string {
  if (!e) return "";
  const cidadeUf = [e.cidade, e.estado].filter(Boolean).join("/");
  return [
    e.logradouro,
    e.numero ? `nº ${e.numero}` : null,
    e.bairro,
    cidadeUf || null,
    e.cep ? `CEP ${e.cep}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Monta o mapa de variáveis do caso para os templates.
 * @param hoje injeta a data (para testes determinísticos).
 */
export function montarVariaveisCaso(
  caso: CasoParaDocumento,
  hoje: Date = new Date(),
): Record<string, string> {
  const e = caso.endereco ?? {};
  const q = caso.qualificacao ?? {};
  const valor = Number(caso.valor_causa) || 0;
  const cidadeUf = [e.cidade, e.estado].filter(Boolean).join("/");

  return {
    NOME_CLIENTE: caso.nome_cliente ?? "",
    CPF: caso.cpf ?? "",
    RG: caso.rg ?? "",
    NACIONALIDADE: q.nacionalidade?.trim() || "brasileiro(a)",
    ESTADO_CIVIL: q.estado_civil ?? "",
    PROFISSAO: q.profissao ?? "",
    ENDERECO_COMPLETO: montarEnderecoCompleto(e),
    CIDADE_UF: cidadeUf, // cidade/UF do cliente (vara e foro da petição)
    CEP: e.cep ?? "",
    LOCAL_ASSINATURA, // local fixo da assinatura (sede do escritório)
    DATA: fmtData(hoje),
    NUMERO_PASTA: caso.numero_pasta ?? "",
    NUMERO_CONTRATO: caso.numero_contrato ?? "",
    HONORARIOS_PCT: caso.honorarios_pct != null ? String(caso.honorarios_pct) : "",
    HONORARIOS_EXTENSO: caso.honorarios_pct != null ? extensoInteiro(Math.round(Number(caso.honorarios_pct))) : "",
    VALOR_CAUSA: fmtBRL(valor),
    VALOR_CAUSA_EXTENSO: valorPorExtenso(valor),
    ANO: String(hoje.getFullYear()),
    // Endereço da PFN varia por comarca — fica para revisão manual na peça.
    ENDERECO_PFN: "[preencher endereço da PFN da comarca]",
    EMAIL_CLIENTE: "",
    TELEFONE_CLIENTE: "",
  };
}
