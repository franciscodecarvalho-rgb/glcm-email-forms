export type TextItemPdf = { str: string; x: number; y: number; width: number; height: number };
export type TipoRubrica = "provento" | "desconto" | "informativo";
export type RubricaPdf = {
  codigo: string;
  descricao: string;
  referencia: number | null;
  valor: number;
  tipo: TipoRubrica;
};
export type ContrachequePdf = {
  competencia: string | null;
  modeloOrigem: string;
  totalProventos: number | null;
  totalDescontos: number | null;
  liquido: number | null;
  itens: RubricaPdf[];
};

type Linha = { y: number; itens: TextItemPdf[]; texto: string };
const CODIGO = /^\/?[A-Z0-9]{3,6}$/i;
const VALOR = /^-?(?:R\$)?\s*\d{1,3}(?:\.\d{3})*,\d{2}$|^-?(?:R\$)?\s*\d+,\d{2}$/i;
const MESES: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function moedaBrasileiraParaNumero(valor: string): number {
  const numero = Number(valor.replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

function linhasDaPagina(itens: TextItemPdf[]): Linha[] {
  const linhas: Linha[] = [];
  const expandidos = itens.flatMap((item) => {
    const partes = item.str.trim().split(/\s+/);
    if (partes.length <= 1) return [item];
    const totalCaracteres = partes.reduce((s, p) => s + p.length, 0) + partes.length - 1;
    let cursor = item.x;
    return partes.map((parte) => {
      const width = item.width * (parte.length / totalCaracteres);
      const novo = { ...item, str: parte, x: cursor, width };
      cursor += width + item.width / totalCaracteres;
      return novo;
    });
  });
  for (const item of expandidos.sort((a, b) => b.y - a.y || a.x - b.x)) {
    if (!item.str.trim()) continue;
    const linha = linhas.find((l) => Math.abs(l.y - item.y) <= Math.max(2.5, item.height * 0.35));
    if (linha) linha.itens.push(item);
    else linhas.push({ y: item.y, itens: [item], texto: "" });
  }
  return linhas
    .sort((a, b) => b.y - a.y)
    .map((linha) => {
      linha.itens.sort((a, b) => a.x - b.x);
      linha.texto = linha.itens.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      return linha;
    });
}

function detectarModelo(texto: string): string {
  const n = normalizar(texto);
  if (n.includes("companhia brasileira de estireno") || n.includes("unigel")) return "unigel";
  if (n.includes("elekeiroz")) return "elekeiroz";
  if (n.includes("termobahia") || n.includes("termo bahia")) return "termo_bahia";
  if (n.includes("petroleo brasileiro") || n.includes("petrobras")) return "petrobras";
  if (n.includes("termomacae")) return "termomacae";
  if (n.includes("braskem")) return "braskem";
  if (n.includes("basf")) return "basf";
  if (n.includes("refinaria de mataripe")) return "acelen";
  return "generico";
}

function extrairCompetencia(texto: string): string | null {  const n = normalizar(texto);
  // 1) Nome do mês (mais específico): "Abril 2021", "SETEMBRO/2025", "abr/2026".
  //    Aceita espaços entre letras (PDFs com texto fragmentado, ex.: "mar c o 2021").
  //    Evita pegar a data de admissão (DD.MM.AAAA) como competência.
  for (const [mes, numero] of Object.entries(MESES)) {
    const comEspacos = mes.replace(/(.)/g, "$1\\s*");
    const comSeparador = n.match(new RegExp(`\\b${comEspacos}[/.-](20\\d{2})\\b`));
    if (comSeparador) return `${numero}/${comSeparador[1]}`;
    const porNome = n.match(new RegExp(`\\b${comEspacos}\\s+(?:de\\s+)?(20\\d{2})\\b`));
    if (porNome) return `${numero}/${porNome[1]}`;
    const comDia = n.match(new RegExp(`\\d{1,2}[/-]${comEspacos}[/-](20\\d{2})`));
    if (comDia) return `${numero}/${comDia[1]}`;
  }
  // 2) MM/AAAA com prefixo explícito ("mes/ano", "competencia", "referencia",
  //    "referente", "pagamento referente"): evita capturar datas soltas como a
  //    de admissão (ex.: "04.11.2013" -> substring "11.2013").
  const comPrefixo = n.match(/(?:mes\s*\/\s*ano|competencia|referencia|referente|pagamento referente)[:\s-]*(0[1-9]|1[0-2])\s*[/]\s*(20\d{2})/i);
  if (comPrefixo) return `${comPrefixo[1]}/${comPrefixo[2]}`;
  // 3) MM/AAAA isolado (não precedido de dígito, evitando DD.MM.AAAA).
  const isolado = n.match(/(?<!\d)(?:0[1-9]|1[0-2])\s*[/]\s*(20\d{2})(?!\d)/);
  if (isolado) return `${isolado[0].slice(0, 2)}/${isolado[2]}`;
  return null;
}

// BASF: a competência confiável é a "Data de Crédito" do rodapé, que é o último
// dia do mês de referência (ex.: "Data de Crédito | 30.04.2021" -> 04/2021).
// Cobre inclusive recibos de 13º/adiantamento onde o campo "Pagamento Referente"
// vem com o ano truncado ("R Novembro 202").
function extrairCompetenciaBasf(linhas: Linha[]): string | null {
  for (let i = 0; i < linhas.length; i++) {
    const rotulo = normalizar(linhas[i].texto).replace(/\s+/g, "");
    if (!rotulo.includes("datadecredito")) continue;
    const valor = linhas[i + 1]?.texto ?? "";
    const m = valor.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
    if (m) return `${m[2].padStart(2, "0")}/${m[3]}`;
  }
  return null;
}

function itemMonetario(item: TextItemPdf): boolean {
  return VALOR.test(item.str.trim());
}

function numeroReferencia(item: TextItemPdf): number | null {
  const s = item.str.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(s)) return null;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s);
}

function valoresDaLinha(linha: Linha): TextItemPdf[] {
  return linha.itens.filter(itemMonetario);
}

function totalNaLinha(linha: Linha, posicao = 0): number | null {
  const valores = valoresDaLinha(linha);
  return valores[posicao] ? moedaBrasileiraParaNumero(valores[posicao].str) : null;
}

export function parsePaginaContracheque(itens: TextItemPdf[], largura: number): ContrachequePdf {
  const modeloPagina = detectarModelo(itens.map((i) => i.str).join(" "));
  const larguraLeitura = modeloPagina === "termo_bahia" ? largura / 2 : largura;
  const itensLeitura = modeloPagina === "termo_bahia"
    ? itens.filter((i) => i.x < larguraLeitura)
    : itens;
  const linhas = linhasDaPagina(itensLeitura);
  const texto = linhas.map((l) => l.texto).join("\n");
  const modeloOrigem = detectarModelo(texto);
  const competencia =
    modeloOrigem === "basf"
      ? extrairCompetenciaBasf(linhas) ?? extrairCompetencia(texto)
      : extrairCompetencia(texto);
  const cabecalho = linhas.find((l) => {
    const n = normalizar(l.texto);
    return (/descricao/.test(n) && /provent|venciment|valor/.test(n)) || (/venciment/.test(n) && /descont/.test(n));
  });
  const acharX = (padrao: RegExp) => cabecalho?.itens.find((i) => padrao.test(normalizar(i.str)))?.x ?? null;
  const xDescricao = acharX(/descricao/);
  const xProvento = acharX(/provent|venciment|valor/);
  const xDesconto = acharX(/descont/);
  const xReferencia = acharX(/referencia|quant|qtde/);
  let secao: TipoRubrica = "provento";
  let informativo = false;
  const rubricas: RubricaPdf[] = [];
  let totalProventos: number | null = null;
  let totalDescontos: number | null = null;
  let liquido: number | null = null;

  for (const linha of linhas) {
    const n = normalizar(linha.texto);
    if (/base\s*\/\s*outros|custo\s+empresa.*informativo/.test(n)) informativo = true;
    if (/total(?:\s+de)?\s+(?:proventos|vencimentos)/.test(n)) { totalProventos = totalNaLinha(linha); secao = "desconto"; continue; }
    if (/total(?:\s+de)?\s+descontos/.test(n)) { totalDescontos = totalNaLinha(linha); continue; }
    if (/\btotais?\b/.test(n)) {
      const vals = valoresDaLinha(linha).map((i) => moedaBrasileiraParaNumero(i.str));
      if (vals.length >= 2) { totalProventos ??= vals[0]; totalDescontos ??= vals[1]; liquido ??= vals[2] ?? null; }
    }
    if (/valor\s+liquido|liquido\s+creditado|total\s+liquido/.test(n)) {
      const vals = valoresDaLinha(linha);
      if (vals.length) liquido = moedaBrasileiraParaNumero(vals[vals.length - 1].str);
    }

    const codigoItem = modeloOrigem === "elekeiroz"
      ? undefined
      : linha.itens.find((i) => i.x < larguraLeitura * 0.22 && CODIGO.test(i.str.trim()));
    if (!codigoItem && modeloOrigem !== "elekeiroz") continue;
    const candidatos = valoresDaLinha(linha).filter((i) => i.x > larguraLeitura * 0.28);
    if (!candidatos.length) continue;
    const valorItem = candidatos[candidatos.length - 1];
    const inicioDescricao = xDescricao ?? (codigoItem ? codigoItem.x + codigoItem.width : 0);
    const limiteDescricao = [xReferencia, xProvento, xDesconto, larguraLeitura * 0.82]
      .filter((valor): valor is number => valor != null && valor > inicioDescricao)
      .sort((a, b) => a - b)[0];
    const descricao = linha.itens
      .filter((i) => i.x >= inicioDescricao - larguraLeitura * 0.01 && i.x < limiteDescricao && i.str !== "|")
      .map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
    if (!descricao) continue;
    const fimReferencia = [xDescricao, xProvento, xDesconto, larguraLeitura]
      .filter((valor): valor is number => valor != null && xReferencia != null && valor > xReferencia)
      .sort((a, b) => a - b)[0] ?? larguraLeitura;
    const refItem = xReferencia == null ? null : linha.itens.find((i) => i.x >= xReferencia - larguraLeitura * 0.025 && i.x < fimReferencia);
    let tipo: TipoRubrica;
    if (informativo) tipo = "informativo";
    else if (modeloOrigem === "petrobras" || modeloOrigem === "unigel") tipo = secao;
    else if (modeloOrigem === "elekeiroz") tipo = valorItem.x >= larguraLeitura * 0.78 ? "desconto" : "provento";
    else if (xDesconto != null && Math.abs(valorItem.x - xDesconto) < Math.abs(valorItem.x - (xProvento ?? 0))) tipo = "desconto";
    else tipo = "provento";
    rubricas.push({
      codigo: codigoItem?.str.trim().toUpperCase() ?? "", descricao,
      referencia: refItem ? numeroReferencia(refItem) : null,
      valor: Math.abs(moedaBrasileiraParaNumero(valorItem.str)), tipo,
    });
  }

  const proventosCalculados = rubricas.filter((i) => i.tipo === "provento").reduce((s, i) => s + i.valor, 0);
  const descontosCalculados = rubricas.filter((i) => i.tipo === "desconto").reduce((s, i) => s + i.valor, 0);
  const paginaContinua = /\bcontinua\b/.test(normalizar(texto));
  if (!paginaContinua) {
    totalProventos ??= proventosCalculados || null;
    totalDescontos ??= descontosCalculados || null;
    liquido ??= totalProventos != null && totalDescontos != null ? totalProventos - totalDescontos : null;
  }
  return { competencia, modeloOrigem, totalProventos, totalDescontos, liquido, itens: rubricas };
}

export function consolidarPaginasContracheque(paginas: ContrachequePdf[]): ContrachequePdf[] {
  const consolidados: ContrachequePdf[] = [];
  let atual: ContrachequePdf | null = null;
  for (const pagina of paginas) {
    if (!pagina.itens.length && pagina.totalProventos == null) continue;
    const continuaElekeiroz = atual?.modeloOrigem === "elekeiroz"
      && pagina.modeloOrigem === "elekeiroz"
      && atual.competencia === pagina.competencia;
    if (!atual || (!continuaElekeiroz && atual.totalProventos != null && atual.totalDescontos != null)) {
      atual = { ...pagina, itens: [...pagina.itens] };
      consolidados.push(atual);
    } else {
      atual.itens.push(...pagina.itens);
      if (pagina.totalProventos != null) atual.totalProventos = pagina.totalProventos;
      if (pagina.totalDescontos != null) atual.totalDescontos = pagina.totalDescontos;
      if (pagina.liquido != null) atual.liquido = pagina.liquido;
    }
  }
  const vistos = new Set<string>();
  return consolidados.filter((c) => {
    const chave = `${c.competencia}|${c.totalProventos}|${c.totalDescontos}|${c.itens.map((i) => `${i.codigo}:${i.valor}`).join(",")}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}
