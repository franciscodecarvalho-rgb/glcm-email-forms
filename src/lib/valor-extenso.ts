// Valor monetário por extenso (pt-BR), para a variável [VALOR POR EXTENSO] da
// petição. Suporta valores até centenas de milhões, com centavos.

const UNIDADES = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
];
const DEZ_A_DEZENOVE = [
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa",
];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

/** Extenso de um número de 0 a 999. */
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

/** Extenso de um inteiro não-negativo (até 999.999.999). */
export function extensoInteiro(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const centena = n % 1000;

  const segs: { valor: number; texto: string }[] = [];
  if (milhoes > 0) {
    segs.push({ valor: milhoes, texto: milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões` });
  }
  if (milhares > 0) {
    segs.push({ valor: milhares, texto: milhares === 1 ? "mil" : `${ate999(milhares)} mil` });
  }
  if (centena > 0) {
    segs.push({ valor: centena, texto: ate999(centena) });
  }

  if (segs.length === 1) return segs[0].texto;

  const ult = segs.length - 1;
  const cabeca = segs.slice(0, ult).map((s) => s.texto).join(", ");
  // "e" antes do último grupo quando ele for < 100 ou múltiplo exato de 100.
  const ultimoValor = segs[ult].valor % 1000;
  const conector = ultimoValor < 100 || ultimoValor % 100 === 0 ? " e " : ", ";
  return cabeca + conector + segs[ult].texto;
}

/** Valor em reais por extenso, ex: "trinta e seis mil, seiscentos e cinquenta reais e oitenta e um centavos". */
export function valorPorExtenso(valor: number): string {
  let reais = Math.floor(valor + 1e-9);
  let centavos = Math.round((valor - reais) * 100);
  if (centavos >= 100) {
    reais += Math.floor(centavos / 100);
    centavos = centavos % 100;
  }

  if (reais === 0 && centavos === 0) return "zero reais";

  const partes: string[] = [];
  if (reais > 0) {
    partes.push(`${extensoInteiro(reais)} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) {
    partes.push(`${extensoInteiro(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  }
  return partes.join(" e ");
}
