// Variáveis de template para geração de documentos (versão Deno).
// ESPELHO de src/lib/valor-extenso.ts + src/lib/caso-variaveis.ts — os testes
// vivem no frontend (vitest); se mudar a regra lá, replicar aqui.

const UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 10) partes.push(UNIDADES[resto]);
    else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u === 0 ? DEZENAS[d] : `${DEZENAS[d]} e ${UNIDADES[u]}`);
    }
  }
  return partes.join(" e ");
}

export function extensoInteiro(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const centena = n % 1000;

  const segs: { valor: number; texto: string }[] = [];
  if (milhoes > 0) segs.push({ valor: milhoes, texto: milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões` });
  if (milhares > 0) segs.push({ valor: milhares, texto: milhares === 1 ? "mil" : `${ate999(milhares)} mil` });
  if (centena > 0) segs.push({ valor: centena, texto: ate999(centena) });

  if (segs.length === 1) return segs[0].texto;
  const ult = segs.length - 1;
  const cabeca = segs.slice(0, ult).map((s) => s.texto).join(", ");
  const ultimoValor = segs[ult].valor % 1000;
  const conector = ultimoValor < 100 || ultimoValor % 100 === 0 ? " e " : ", ";
  return cabeca + conector + segs[ult].texto;
}

export function valorPorExtenso(valor: number): string {
  let reais = Math.floor(valor + 1e-9);
  let centavos = Math.round((valor - reais) * 100);
  if (centavos >= 100) {
    reais += Math.floor(centavos / 100);
    centavos = centavos % 100;
  }
  if (reais === 0 && centavos === 0) return "zero reais";
  const partes: string[] = [];
  if (reais > 0) partes.push(`${extensoInteiro(reais)} ${reais === 1 ? "real" : "reais"}`);
  if (centavos > 0) partes.push(`${extensoInteiro(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return partes.join(" e ");
}

export const fmtBRL = (n: number): string =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtData(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function montarEnderecoCompleto(e: any): string {
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

/** Monta o mapa de variáveis dos templates a partir da linha de casos. */
export function montarVariaveisCaso(caso: any, hoje: Date = new Date()): Record<string, string> {
  const e = caso.endereco ?? {};
  const q = caso.qualificacao ?? {};
  const valor = Number(caso.valor_causa) || 0;
  const cidadeUf = [e.cidade, e.estado].filter(Boolean).join("/");

  return {
    NOME_CLIENTE: caso.nome_cliente ?? "",
    CPF: caso.cpf ?? "",
    RG: caso.rg ?? "",
    NACIONALIDADE: (q.nacionalidade ?? "").trim() || "brasileiro(a)",
    ESTADO_CIVIL: q.estado_civil ?? "",
    PROFISSAO: q.profissao ?? "",
    ENDERECO_COMPLETO: montarEnderecoCompleto(e),
    CIDADE_UF: cidadeUf,
    CEP: e.cep ?? "",
    LOCAL_ASSINATURA: "Salvador/BA",
    DATA: fmtData(hoje),
    NUMERO_PASTA: caso.numero_pasta ?? "",
    NUMERO_CONTRATO: caso.numero_contrato ?? "",
    HONORARIOS_PCT: caso.honorarios_pct != null ? String(caso.honorarios_pct) : "",
    HONORARIOS_EXTENSO: caso.honorarios_pct != null ? extensoInteiro(Math.round(Number(caso.honorarios_pct))) : "",
    VALOR_CAUSA: fmtBRL(valor),
    VALOR_CAUSA_EXTENSO: valorPorExtenso(valor),
    ANO: String(hoje.getFullYear()),
    ENDERECO_PFN: "[preencher endereço da PFN da comarca]",
    EMAIL_CLIENTE: "",
    TELEFONE_CLIENTE: "",
  };
}
