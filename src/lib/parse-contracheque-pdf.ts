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
  retificado?: boolean;
  totalProventos: number | null;
  totalDescontos: number | null;
  liquido: number | null;
  itens: RubricaPdf[];
  identidadeMoeve?: string | null;
  cnpjMoeve?: string | null;
  matriculaMoeve?: string | null;
  rodapeCompletoMoeve?: boolean;
  rotulosBasesMoeve?: boolean;
  valoresBasesMoeve?: boolean;
  paginasOrigemMoeve?: number[];
  continuacaoSemCabecalhoMoeve?: boolean;
  folhasPetrobras?: FolhasPetrobras;
};

type Linha = { y: number; itens: TextItemPdf[]; texto: string };
type FolhasPetrobras = { inicio: number; ultima: number; total: number; matricula: string | null };
const CODIGO = /^\/?[A-Z0-9]{1,6}$/i;
const VALOR = /^-?(?:R\$)?\s*\d{1,3}(?:\.\d{3})*,\d{2}\]?$|^-?(?:R\$)?\s*\d+,\d{2}\]?$/i;
const MESES: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function moedaBrasileiraParaNumero(valor: string): number {
  const numero = Number(valor.replace(/[[\]]/g, "").replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

export function linhasDaPagina(itens: TextItemPdf[]): Linha[] {
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
    const linha = linhas.find((l) => Math.abs(l.y - item.y) <= Math.max(4.5, item.height * 0.5));
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

export function detectarModelo(texto: string): string {
  const n = normalizar(texto);
  if (n.includes("birla carbon")) return "birla_carbon";
  if (n.includes("cetrel")) return "cetrel";
  if (n.includes("deten quimica")) return "deten";
  if (n.includes("ecolab quimica")) return "ecolab";
  if (n.includes("moeve quimica")) return "moeve";
  if (n.includes("oxiteno")) return "oxiteno";
  if (n.includes("vopak brasil")) return "vopak";
  if (n.includes("companhia brasileira de estireno") || n.includes("unigel") || n.includes("proquigel")) return "unigel";
  if (n.includes("elekeiroz")) return "elekeiroz";
  if (n.includes("termobahia") || n.includes("termo bahia")) return "termo_bahia";
  if (n.includes("petroleo brasileiro") || n.includes("petrobras")) return "petrobras";
  if (n.includes("termomacae")) return "termomacae";
  if (n.includes("braskem")) return "braskem";
  if (n.includes("basf")) return "basf";
  if (n.includes("refinaria de mataripe")) return "acelen";
  if (n.includes("itf chemical")) return "itf";
  if (n.includes("tronox")) return "tronox";
  if (n.includes("dow brasil")) return "dow";
  return "generico";
}

function extrairCompetencia(texto: string): string | null {  const n = normalizar(texto);
  const referente = n.match(/referente\s+a\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(20\d{2})/);
  if (referente) return `${MESES[referente[1]]}/${referente[2]}`;
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
  const comPrefixo = n.match(/(?:mes\s*\/\s*ano|competencia|referencia|referente|pagamento referente)[:\s-]*(0?[1-9]|1[0-2])\s*[/]\s*(20\d{2})/i);
  if (comPrefixo) return `${comPrefixo[1].padStart(2, "0")}/${comPrefixo[2]}`;
  // 3) MM/AAAA isolado (não precedido de dígito ou separador de data, evitando DD/MM/AAAA e DD.MM.AAAA).
  const isolado = n.match(/(?<![\d/.-])(0?[1-9]|1[0-2])\s*[/]\s*(20\d{2})(?!\d)/);
  if (isolado) return `${isolado[1].padStart(2, "0")}/${isolado[2]}`;
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

function basfRetificado(linhas: Linha[]): boolean {
  const indicePagamento = linhas.findIndex((linha) =>
    /pagamento\s+referente\s+a/.test(normalizar(linha.texto)),
  );
  if (indicePagamento < 0) return false;
  const valor = normalizar(linhas[indicePagamento + 1]?.texto ?? "");
  return /\br\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/.test(valor);
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

type SegmentoColuna = { itens: TextItemPdf[]; inicio: number; fim: number; tipo: TipoRubrica };

function apenasNumero(item: TextItemPdf): boolean {
  return /^-?\d+(?:[.,]\d+)*$/.test(item.str.trim());
}

function rubricaDoSegmento(segmento: SegmentoColuna): RubricaPdf | null {
  const largura = segmento.fim - segmento.inicio;
  const codigoItem = segmento.itens.find(
    (item) => item.x < segmento.inicio + largura * 0.25 && CODIGO.test(item.str.trim()),
  );
  if (!codigoItem) return null;
  const candidatos = segmento.itens.filter(
    (item) => itemMonetario(item) && item.x > segmento.inicio + largura * 0.28,
  );
  if (!candidatos.length) return null;
  const valorItem = candidatos[candidatos.length - 1];
  const inicioDescricao = codigoItem.x + codigoItem.width;
  const faixa = segmento.itens.filter((item) => item.x >= inicioDescricao && item.x < valorItem.x && item.str !== "|");
  const descricao = faixa.filter((item) => !apenasNumero(item)).map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
  if (!descricao) return null;
  const numericos = faixa.filter(apenasNumero);
  const refItem = numericos[numericos.length - 1] ?? null;
  return {
    codigo: codigoItem.str.trim().toUpperCase(),
    descricao,
    referencia: refItem ? numeroReferencia(refItem) : null,
    valor: Math.abs(moedaBrasileiraParaNumero(valorItem.str)),
    tipo: segmento.tipo,
  };
}

function lerPaginacaoPetrobras(texto: string, itens: TextItemPdf[]): FolhasPetrobras | null {
  const paginacao = normalizar(texto).match(/\bpagina\s+(\d+)\s+de\s+(\d+)\b/);
  const numero = Number(paginacao?.[1]), total = Number(paginacao?.[2]);
  if (!(numero >= 1 && numero <= total && total > 1)) return null;
  const rotulo = itens.find((item) => normalizar(item.str.trim()) === "matricula");
  const matricula = rotulo && itens.find((item) => item.y < rotulo.y && item.y >= rotulo.y - 18
    && Math.abs(item.x - rotulo.x) < 12 && /^[\da-z-]{4,}$/i.test(item.str.trim()) && /\d/.test(item.str));
  return { inicio: numero, ultima: numero, total, matricula: matricula?.str.trim() ?? null };
}

function lerLiquidoPetrobras(itens: TextItemPdf[]): number | null {
  const rotulo = itens.find((item) => /valor\s+liquido\s+depositado/.test(normalizar(item.str)));
  if (!rotulo) return null;
  const encontrados = new Set(itens.filter((item) => item.x >= rotulo.x - 4 && item.y <= rotulo.y + 2 && item.y >= rotulo.y - 18
    && itemMonetario(item)).map((item) => moedaBrasileiraParaNumero(item.str)));
  return encontrados.size === 1 ? [...encontrados][0] : null;
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
  const retificado = modeloOrigem === "basf" && basfRetificado(linhas);
  const folhasPetrobras = modeloOrigem === "petrobras" ? lerPaginacaoPetrobras(texto, itensLeitura) : null;
  const cabecalho = linhas.find((l) => {
    const n = normalizar(l.texto);
    const compacto = n.replace(/\s+/g, "");
    return (/descricao/.test(compacto) && /provent|venciment|valor/.test(compacto))
      || (/venciment/.test(n) && /descont/.test(n))
      || (/rendiment/.test(n) && /descont/.test(n));
  });
  const acharX = (padrao: RegExp) => {
    const itensCabecalho = cabecalho?.itens ?? [];
    const individual = itensCabecalho.find((item) => padrao.test(normalizar(item.str)));
    if (individual) return individual.x;
    for (let inicio = 0; inicio < itensCabecalho.length; inicio++) {
      let combinado = "";
      for (let fim = inicio; fim < Math.min(itensCabecalho.length, inicio + 5); fim++) {
        if (itensCabecalho[fim].str === "|") break;
        combinado += normalizar(itensCabecalho[fim].str).replace(/\s+/g, "");
        if (padrao.test(combinado)) return itensCabecalho[inicio].x;
      }
    }
    return null;
  };
  const xDescricao = acharX(/descricao/);
  const xProvento = acharX(/provent|venciment|valor/);
  const xDesconto = acharX(/descont/);
  const xInformativo = acharX(/informativ|outros/);
  const xReferencia = acharX(/referencia|quant|qtde/);
  const colunasCodigo = (cabecalho?.itens ?? []).filter((item) => /^cod/.test(normalizar(item.str)));
  const duasColunas = colunasCodigo.length >= 2 && /rendiment/.test(normalizar(cabecalho?.texto ?? ""));
  const xCorte = duasColunas ? colunasCodigo[1].x : null;
  let secao: TipoRubrica = "provento";
  if (folhasPetrobras && folhasPetrobras.inicio > 1 && !/total de proventos/.test(normalizar(texto))
    && /total de descontos/.test(normalizar(texto))) secao = "desconto";
  let informativo = false;
  let tabelaEncerrada = false;
  const rubricas: RubricaPdf[] = [];
  let totalProventos: number | null = null;
  let totalDescontos: number | null = null;
  let liquido: number | null = null;

  let antesDoCabecalho = cabecalho != null;
  for (const linha of linhas) {
    if (antesDoCabecalho) {
      if (linha === cabecalho) antesDoCabecalho = false;
      continue;
    }
    if (tabelaEncerrada) continue;
    const n = normalizar(linha.texto);
    if (/base\s*\/\s*outros|custo\s+empresa.*informativo/.test(n)) informativo = true;
    if (/total(?:\s+de)?\s+(?:proventos|vencimentos)/.test(n)) {
      const valoresTotais = valoresDaLinha(linha);
      totalProventos = valoresTotais[0] ? moedaBrasileiraParaNumero(valoresTotais[0].str) : null;
      if (/total(?:\s+de)?\s+descontos/.test(n) && valoresTotais.length > 1) totalDescontos = moedaBrasileiraParaNumero(valoresTotais[valoresTotais.length - 1].str);
      secao = "desconto"; if (modeloOrigem === "birla_carbon") tabelaEncerrada = true; continue;
    }
    if (/total(?:\s+de)?\s+descontos/.test(n)) {
      totalDescontos = totalNaLinha(linha);
      if (folhasPetrobras) informativo = true;
      continue;
    }
    if (/\bt\s*o\s*t\s*a\s*i\s*s?\b|\btotais?\b/.test(n)) {
      let vals = valoresDaLinha(linha).map((i) => moedaBrasileiraParaNumero(i.str));
      if (vals.length < 2) {
        const proximaLinha = linhas[linhas.indexOf(linha) + 1];
        if (proximaLinha) {
          const proxVals = valoresDaLinha(proximaLinha).map((i) => moedaBrasileiraParaNumero(i.str));
          if (proxVals.length >= 2) vals = proxVals;
        }
      }
      if (vals.length >= 2) { totalProventos ??= vals[0]; totalDescontos ??= vals[1]; liquido ??= vals[2] ?? null; if (modeloOrigem === "birla_carbon") tabelaEncerrada = true; continue; }
    }
    if (/valor\s+liquido|liquido\s+creditado|total\s+liquido/.test(n)) {
      const vals = valoresDaLinha(linha);
      if (vals.length) liquido = moedaBrasileiraParaNumero(vals[vals.length - 1].str);
      if (modeloOrigem === "birla_carbon") tabelaEncerrada = true;
    }

    const permiteSemCodigo = modeloOrigem === "elekeiroz" || modeloOrigem === "birla_carbon";
    if (duasColunas && xCorte != null) {
      const segmentos: SegmentoColuna[] = [
        { itens: linha.itens.filter((item) => item.x < xCorte), inicio: 0, fim: xCorte, tipo: "provento" },
        { itens: linha.itens.filter((item) => item.x >= xCorte), inicio: xCorte, fim: larguraLeitura, tipo: "desconto" },
      ];
      for (const segmento of segmentos) {
        const rubrica = rubricaDoSegmento(segmento);
        if (rubrica) rubricas.push(informativo ? { ...rubrica, tipo: "informativo" } : rubrica);
      }
      continue;
    }

  const codigoItem = permiteSemCodigo
      ? undefined
      : linha.itens.find((i) => i.x < larguraLeitura * 0.22 && CODIGO.test(i.str.trim()))
        ?? (modeloOrigem === "oxiteno" ? linha.itens.find((i) => i.x < larguraLeitura * 0.22 && /^\d{4}\D/.test(i.str.trim())) : undefined);
    if (!codigoItem && !permiteSemCodigo) continue;
    const candidatos = valoresDaLinha(linha).filter((i) => i.x > larguraLeitura * 0.28);
    if (!candidatos.length) continue;
    const valoresNaoNulos = candidatos.filter((i) => Math.abs(moedaBrasileiraParaNumero(i.str)) > 0);
    const valorItem = valoresNaoNulos[valoresNaoNulos.length - 1] ?? candidatos[candidatos.length - 1];
    // Unigel/Proquigel e Tronox: o rótulo "DESCRIÇÃO" é centralizado sobre a coluna,
    // então a descrição precisa começar logo após o código da rubrica para não ser truncada.
    const codigoEmbutido = modeloOrigem === "oxiteno" && codigoItem ? codigoItem.str.trim().match(/^(\d{4})(.+)$/) : null;
    const inicioDescricao = codigoEmbutido && codigoItem
      ? codigoItem.x + codigoItem.width
      : (modeloOrigem === "unigel" || modeloOrigem === "tronox") && codigoItem
      ? codigoItem.x + codigoItem.width
      : xDescricao ?? (codigoItem ? codigoItem.x + codigoItem.width : 0);
    const limiteDescricao = [xReferencia, xProvento, xDesconto, larguraLeitura * 0.82]
      .filter((valor): valor is number => valor != null && valor > inicioDescricao)
      .sort((a, b) => a - b)[0];
    const descricao = `${codigoEmbutido?.[2] ?? ""} ${linha.itens
      .filter((i) => i.x >= inicioDescricao - larguraLeitura * 0.01 && i.x < limiteDescricao && i.str !== "|")
      .filter((i) => i !== codigoItem)
      .map((i) => i.str).join(" ").replace(/\s+/g, " ").trim()}`.trim();
    if (!descricao) continue;
    const fimReferencia = [xDescricao, xProvento, xDesconto, larguraLeitura]
      .filter((valor): valor is number => valor != null && xReferencia != null && valor > xReferencia)
      .sort((a, b) => a - b)[0] ?? larguraLeitura;
    const refItem = xReferencia == null ? null : linha.itens.find((i) => i.x >= xReferencia - larguraLeitura * 0.025 && i.x < fimReferencia && numeroReferencia(i) != null);
    // Unigel/Estireno: com as duas colunas no cabeçalho, a posição x do valor é
    // mais confiável que a seção corrente (que vira "desconto" após os totais).
    const porColuna: TipoRubrica | null =
      xDesconto != null && xProvento != null
        ? valorItem.x >= xDesconto - larguraLeitura * 0.05 ? "desconto" : "provento"
        : null;
    let tipo: TipoRubrica;
    const codNormalizado = codigoItem?.str.trim().toUpperCase() ?? "";
    if (
      informativo ||
      (["birla_carbon", "vopak"].includes(modeloOrigem) && xInformativo != null && valorItem.x >= xInformativo - larguraLeitura * 0.03) ||
      ((modeloOrigem === "acelen" || modeloOrigem === "dow") && (
        ["5501", "5561", "8000", "8002", "1271", "9921", "9920", "8010", "8100", "8101", "1300", "1330"].includes(codNormalizado) ||
        /\b(?:base\s+(?:ir|inss|fgts)|salario\s+contribuicao|cred\.\s*trabalhador|fgts\s+recmes|inss\s+empregador|rat)\b/.test(normalizar(descricao))
      ))
    ) tipo = "informativo";
    else if (modeloOrigem === "unigel") tipo = porColuna ?? secao;
    else if (modeloOrigem === "petrobras") tipo = secao;
    else if (modeloOrigem === "oxiteno") {
      const divisor = linhas.flatMap((l) => l.itens.filter((i) => i.str === "|" && xProvento != null && xDesconto != null && i.x > xProvento && i.x < xDesconto).map((i) => i.x)).sort((a,b)=>a-b)[Math.floor(linhas.flatMap((l) => l.itens.filter((i) => i.str === "|" && xProvento != null && xDesconto != null && i.x > xProvento && i.x < xDesconto).map((i) => i.x)).length/2)];
      if (divisor == null) throw new Error("OXITENO: limites financeiros ilegíveis; conferir divisórias da tabela.");
      tipo = valorItem.x < divisor ? "provento" : "desconto";
      if (codNormalizado === "5501" || /\bbase\s+(?:ir|inss|fgts)\b|salario\s+contribuicao/.test(normalizar(descricao))) informativo = true;
      if (informativo) tipo = "informativo";
    }
    else if (modeloOrigem === "elekeiroz") tipo = valorItem.x >= larguraLeitura * 0.78 ? "desconto" : "provento";
    else if (xDesconto != null && Math.abs(valorItem.x - xDesconto) < Math.abs(valorItem.x - (xProvento ?? 0))) tipo = "desconto";
    else tipo = "provento";
    rubricas.push({
      codigo: codigoEmbutido?.[1] ?? codNormalizado, descricao,
      referencia: refItem ? numeroReferencia(refItem) : null,
      valor: Math.abs(moedaBrasileiraParaNumero(valorItem.str)), tipo,
    });
  }

  const proventosCalculados = rubricas.filter((i) => i.tipo === "provento").reduce((s, i) => s + i.valor, 0);
  const descontosCalculados = rubricas.filter((i) => i.tipo === "desconto").reduce((s, i) => s + i.valor, 0);
  const paginaContinua = /\bcontinua\b/.test(normalizar(texto));
  if (folhasPetrobras) liquido = lerLiquidoPetrobras(itensLeitura);
  if (!paginaContinua && !folhasPetrobras) {
    totalProventos ??= proventosCalculados || null;
    totalDescontos ??= descontosCalculados || null;
    if (totalDescontos == null && ["birla_carbon", "cetrel", "vopak"].includes(modeloOrigem)) totalDescontos = descontosCalculados;
    liquido ??= totalProventos != null && totalDescontos != null ? totalProventos - totalDescontos : null;
  }
  return { competencia, modeloOrigem, ...(retificado ? { retificado: true } : {}), totalProventos, totalDescontos, liquido,
    itens: rubricas, ...(folhasPetrobras ? { folhasPetrobras } : {}) };
}

function parsePaginaDuasColunas(itens: TextItemPdf[], largura: number, moeve = false): ContrachequePdf {
  const linhas = linhasDaPagina(itens);
  const texto = linhas.map((linha) => linha.texto).join("\n");
  const modeloOrigem = moeve ? "moeve" : detectarModelo(texto);
  const retificado = modeloOrigem === "basf" && basfRetificado(linhas);
  const metade = largura * 0.45;
  const cabecalho = linhas.find((linha) => {
    const n = normalizar(linha.texto);
    return /descricao/.test(n) && /desconto/.test(n) && /valor/.test(n);
  });
  if (moeve && !cabecalho) {
    return { competencia: extrairCompetencia(texto), modeloOrigem, totalProventos: null, totalDescontos: null, liquido: null, itens: [] };
  }
  if (!cabecalho) return parsePaginaContracheque(itens, largura);

  const acharCabecalho = (padrao: RegExp, lado: "esquerdo" | "direito") => cabecalho.itens
    .filter((item) => lado === "esquerdo" ? item.x < metade : item.x >= metade)
    .find((item) => padrao.test(normalizar(item.str)))?.x ?? null;
  const xCodigoE = acharCabecalho(/^cod/, "esquerdo");
  const xDescricaoE = acharCabecalho(/descricao/, "esquerdo");
  const xReferenciaE = acharCabecalho(/^ref/, "esquerdo");
  const xValorE = acharCabecalho(/^valor$/, "esquerdo");
  const xCodigoD = acharCabecalho(/^(codigo|cod)/, "direito");
  const xDescricaoD = acharCabecalho(/desconto/, "direito");
  const refs = cabecalho.itens.filter((item) => /^ref$/.test(normalizar(item.str))).sort((a, b) => a.x - b.x);
  const valores = cabecalho.itens.filter((item) => /^valor$/.test(normalizar(item.str))).sort((a, b) => a.x - b.x);
  const xReferenciaD = refs[1]?.x ?? null;
  const xValorD = valores[1]?.x ?? null;
  if (xCodigoE == null || xDescricaoE == null || xReferenciaE == null || xValorE == null || xCodigoD == null || xDescricaoD == null || xReferenciaD == null || xValorD == null) {
    return parsePaginaContracheque(itens, largura);
  }

  const valorNaColuna = (linha: Linha, inicio: number, fim: number) => valoresDaLinha(linha)
    .filter((item) => item.x >= inicio - 20 && item.x < fim - 8)
    .sort((a, b) => a.x - b.x).pop();
  const textoNaColuna = (linha: Linha, inicio: number, fim: number) => linha.itens
    .filter((item) => item.x >= inicio - 8 && item.x < fim - 8 && !itemMonetario(item))
    .map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
  const referenciaNaColuna = (linha: Linha, inicio: number, fim: number) => {
    const item = linha.itens.find((candidato) => candidato.x >= inicio - 20 && candidato.x < fim - 8 && /^\d+(?:[.,]\d+)?$/.test(candidato.str.trim()));
    return item ? numeroReferencia(item) : null;
  };
  const rubricas: RubricaPdf[] = [];
  let totalProventos: number | null = null;
  let totalDescontos: number | null = null;
  let liquido: number | null = null;
  let linhaLiquido: Linha | null = null;
  let candidatoTotais: { linha: Linha; esquerda: TextItemPdf; direita: TextItemPdf } | null = null;

  for (const linha of linhas) {
    if (linha === cabecalho || (moeve && linha.y > cabecalho.y)) continue;
    const n = normalizar(linha.texto);
    const codigoE = linha.itens.find((item) => item.x < metade && item.x < xDescricaoE && (moeve ? /^P\d{3}$/i : CODIGO).test(item.str.trim()));
    const codigoD = linha.itens.find((item) => item.x >= metade && item.x < xDescricaoD && (moeve ? /^D\d{3}$/i : CODIGO).test(item.str.trim()));
    const valorE = valorNaColuna(linha, xValorE, xCodigoD);
    const valorD = valorNaColuna(linha, xValorD, largura + 1);
    if (codigoE && valorE) {
      const codigo = codigoE.str.trim().toUpperCase();
      const descricao = textoNaColuna(linha, xDescricaoE, xReferenciaE) || (moeve && codigo === "P003" ? "H. R. A." : "");
      rubricas.push({ codigo, descricao, referencia: referenciaNaColuna(linha, xReferenciaE, xValorE), valor: Math.abs(moedaBrasileiraParaNumero(valorE.str)), tipo: "provento" });
    }
    if (codigoD && valorD) rubricas.push({ codigo: codigoD.str.trim().toUpperCase(), descricao: textoNaColuna(linha, xDescricaoD, xReferenciaD), referencia: referenciaNaColuna(linha, xReferenciaD, xValorD), valor: Math.abs(moedaBrasileiraParaNumero(valorD.str)), tipo: "desconto" });
    const valoresDaLinhaAtual = valoresDaLinha(linha);
    if (/valor\s+liquido|liquido\s+creditado|total\s+liquido/.test(n) && valoresDaLinhaAtual.length) {
      liquido = moedaBrasileiraParaNumero(valoresDaLinhaAtual[valoresDaLinhaAtual.length - 1].str);
      linhaLiquido = linha;
    }
    if (/(?:totais?|total de)/.test(n) && valoresDaLinhaAtual.length >= 2) {
      totalProventos ??= moedaBrasileiraParaNumero(valoresDaLinhaAtual[0].str);
      totalDescontos ??= moedaBrasileiraParaNumero(valoresDaLinhaAtual[valoresDaLinhaAtual.length - 1].str);
    }
    if (!codigoE && !codigoD && valoresDaLinhaAtual.length >= 2 && (!linhaLiquido || linha.y > linhaLiquido.y)) {
      const esquerda = valorNaColuna(linha, xValorE, xCodigoD);
      const direita = valorNaColuna(linha, xValorD, largura + 1);
      if (esquerda && direita && (!candidatoTotais || (linhaLiquido && Math.abs(linha.y - linhaLiquido.y) < Math.abs(candidatoTotais.linha.y - linhaLiquido.y)))) candidatoTotais = { linha, esquerda, direita };
    }
  }
  if (moeve) {
    const rodape = lerRodapeMoeve(linhas, (linha) => valorNaColuna(linha, xValorE, xCodigoD),
      (linha) => valorNaColuna(linha, xValorD, largura + 1));
    return { competencia: extrairCompetencia(texto), modeloOrigem, ...rodape, itens: rubricas };
  }
  if (candidatoTotais) {
    totalProventos ??= moedaBrasileiraParaNumero(candidatoTotais.esquerda.str);
    totalDescontos ??= moedaBrasileiraParaNumero(candidatoTotais.direita.str);
  }
  totalProventos ??= rubricas.filter((item) => item.tipo === "provento").reduce((soma, item) => soma + item.valor, 0) || null;
  totalDescontos ??= rubricas.filter((item) => item.tipo === "desconto").reduce((soma, item) => soma + item.valor, 0) || null;
  liquido ??= totalProventos != null && totalDescontos != null ? totalProventos - totalDescontos : null;
  return { competencia: extrairCompetencia(texto), modeloOrigem, ...(retificado ? { retificado: true } : {}), totalProventos, totalDescontos, liquido, itens: rubricas };
}

function ehInicioDeContracheque(texto: string): boolean {
  const n = normalizar(texto);
  return n.includes("demonstrativo de pagamento") || n.includes("aviso de credito");
}

function lerRodapeMoeve(
  linhas: Linha[], proventos: (linha: Linha) => TextItemPdf | undefined, descontos: (linha: Linha) => TextItemPdf | undefined,
) {
  const linhaLiquido = linhas.find((linha) => /\bvalor\b.*\bliquido\b/.test(normalizar(linha.texto)) && descontos(linha));
  const linhaTotais = [...linhas].reverse().find((linha) => (!linhaLiquido || linha.y > linhaLiquido.y)
    && valoresDaLinha(linha).length === 2
    && !linha.itens.some((item) => /^[PD]\d{3}$/i.test(item.str.trim()))
    && proventos(linha) && descontos(linha));
  return {
    totalProventos: linhaTotais ? moedaBrasileiraParaNumero(proventos(linhaTotais)!.str) : null,
    totalDescontos: linhaTotais ? moedaBrasileiraParaNumero(descontos(linhaTotais)!.str) : null,
    liquido: linhaLiquido ? moedaBrasileiraParaNumero(descontos(linhaLiquido)!.str) : null,
  };
}

/**
 * Alguns emissores colocam dois ou mais contracheques completos na mesma
 * página. O parser tradicional continua responsável por cada bloco; esta
 * função só recorta os blocos físicos antes de delegar a leitura.
 */
function metadadosMoeve(itens: TextItemPdf[], pagina?: number) {
  const texto = normalizar(itens.map((item) => item.str).join(" ")).replace(/[^a-z0-9]+/g, " ");
  const cnpj = itens.map((item) => item.str).join(" ").match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/)?.[0] ?? null;
  const matricula = texto.match(/(?:colaborador|matricula)\s*[:#-]?\s*(\d{3,})/)?.[1] ?? null;
  const rotulos = ["salario base", "sal contri inss", "base cal fgts", "fgts do mes", "base cal irrf", "dep irrf"];
  const rotulosBasesMoeve = rotulos.every((rotulo) => texto.includes(normalizar(rotulo)));
  const linhas = linhasDaPagina(itens);
  const linhaBases = linhas.find((linha) => {
    const rotulo = normalizar(linha.texto).replace(/[^a-z0-9]+/g, " ");
    return rotulos.every((base) => rotulo.includes(base));
  });
  const valoresBasesMoeve = linhaBases != null && linhas.some((linha) => linha.y < linhaBases.y
    && linha.y >= linhaBases.y - 28 && valoresDaLinha(linha).length === rotulos.length);
  const rodapeCompletoMoeve = linhas.some((linha) => /\bvalor\b.*\bliquido\b/.test(normalizar(linha.texto))) && valoresBasesMoeve;
  return {
    cnpjMoeve: cnpj,
    matriculaMoeve: matricula,
    identidadeMoeve: cnpj || matricula ? `${cnpj ?? ""}|${matricula ?? ""}` : null,
    rotulosBasesMoeve,
    valoresBasesMoeve,
    rodapeCompletoMoeve,
    paginasOrigemMoeve: pagina == null ? [] : [pagina],
  };
}

export function parsePaginasContracheque(itens: TextItemPdf[], largura: number, pagina?: number): ContrachequePdf[] {
  const linhas = linhasDaPagina(itens);
  const inicios = linhas.filter((linha) => ehInicioDeContracheque(linha.texto));
  const modeloPagina = detectarModelo(itens.map((item) => item.str).join(" "));
  if (modeloPagina === "moeve" && inicios.length) {
    const partes: ContrachequePdf[] = inicios.map((inicio, indice) => {
      const proximo = inicios[indice + 1];
      const bloco = itens.filter((item) => item.y <= inicio.y + 4 && (!proximo || item.y > proximo.y + 4));
      return { ...parsePaginaDuasColunas(bloco, largura, true), ...metadadosMoeve(bloco, pagina) };
    });
    const topo = itens.filter((item) => item.y > inicios[0].y + 4);
    const continuacao = parsePaginaDuasColunas(topo, largura, true);
    if (continuacao.itens.length || continuacao.liquido != null) {
      partes.unshift({ ...continuacao, ...metadadosMoeve(topo, pagina), competencia: null, continuacaoSemCabecalhoMoeve: true });
    }
    return partes;
  }
  if (inicios.length <= 1 || !["deten", "moeve"].includes(modeloPagina)) {
    const resultado = parsePaginaContracheque(itens, largura);
    return resultado.modeloOrigem === "moeve" ? [{ ...resultado, ...metadadosMoeve(itens, pagina) }] : [resultado];
  }
  return inicios.map((inicio, indice) => {
    const proximo = inicios[indice + 1];
    const bloco = itens.filter((item) => item.y <= inicio.y + 4 && (!proximo || item.y > proximo.y + 4));
    const lido = parsePaginaDuasColunas(bloco, largura);
    const resultado = lido.modeloOrigem === "generico" ? { ...lido, modeloOrigem: modeloPagina } : lido;
    return resultado.modeloOrigem === "moeve" ? { ...resultado, ...metadadosMoeve(bloco, pagina) } : resultado;
  });
}

function combinarIdentidadeMoeve(...identidades: Array<string | null | undefined>): string | null {
  const partes = identidades.map((identidade) => (identidade ?? "").split("|"));
  const cnpj = partes.map((p) => p[0]).find(Boolean) ?? "";
  const matricula = partes.map((p) => p[1]).find(Boolean) ?? "";
  return cnpj || matricula ? `${cnpj}|${matricula}` : null;
}

function identidadeMoeveCompativel(a: ContrachequePdf, b: ContrachequePdf): boolean {
  const partes = (contra: ContrachequePdf) => {
    const [cnpjIdentidade, matriculaIdentidade] = (contra.identidadeMoeve ?? "|").split("|");
    return [contra.cnpjMoeve ?? cnpjIdentidade ?? "", contra.matriculaMoeve ?? matriculaIdentidade ?? ""];
  };
  const pa = partes(a), pb = partes(b);
  if (!pa.some(Boolean) || !pb.some(Boolean)) return false;
  return pa.every((valor, indice) => !valor || !pb[indice] || valor === pb[indice]);
}

export function validarContrachequeMoeve(contra: ContrachequePdf): void {
  if (contra.modeloOrigem !== "moeve") return;
  const prefixo = `${contra.competencia ?? "competência ilegível"} (páginas ${(contra.paginasOrigemMoeve ?? []).join(", ") || "não identificadas"})`;
  const proventos = contra.itens.filter((item) => item.tipo === "provento").reduce((soma, item) => soma + item.valor, 0);
  const descontos = contra.itens.filter((item) => item.tipo === "desconto").reduce((soma, item) => soma + item.valor, 0);
  if (contra.totalProventos != null && Math.abs(proventos - contra.totalProventos) > 0.05) throw new Error(`${prefixo}: proventos diverge do total impresso`);
  if (contra.totalDescontos != null && Math.abs(descontos - contra.totalDescontos) > 0.05) throw new Error(`${prefixo}: descontos diverge do total impresso`);
  if (contra.totalProventos != null && contra.totalDescontos != null && contra.liquido != null && Math.abs(contra.totalProventos - contra.totalDescontos - contra.liquido) > 0.05) throw new Error(`${prefixo}: líquido diverge dos totais impressos`);
  if (!contra.itens.length || contra.totalProventos == null || contra.totalDescontos == null || contra.liquido == null) {
    throw new Error(`${prefixo}: rubricas ou totais impressos incompletos`);
  }
}

export function consolidarPaginasContracheque(paginas: ContrachequePdf[]): ContrachequePdf[] {
  const consolidados: ContrachequePdf[] = [];
  let atual: ContrachequePdf | null = null;
  for (const pagina of paginas) {
    if (!pagina.itens.length && pagina.totalProventos == null && !pagina.folhasPetrobras
      && !(pagina.modeloOrigem === "moeve" && (pagina.liquido != null || (pagina.competencia && pagina.identidadeMoeve)))) continue;
    if (atual?.folhasPetrobras || pagina.folhasPetrobras) {
      const anterior = atual?.folhasPetrobras, proxima = pagina.folhasPetrobras;
      if (atual && anterior && proxima && atual.competencia && atual.competencia === pagina.competencia
        && anterior.total === proxima.total && anterior.ultima + 1 === proxima.inicio
        && anterior.matricula && anterior.matricula === proxima.matricula) {
        atual.itens.push(...pagina.itens);
        atual.totalProventos = pagina.totalProventos ?? atual.totalProventos;
        atual.totalDescontos = pagina.totalDescontos ?? atual.totalDescontos;
        atual.liquido = pagina.liquido ?? atual.liquido;
        atual.folhasPetrobras = { ...anterior, ultima: proxima.ultima };
      } else {
        atual = { ...pagina, itens: [...pagina.itens] };
        consolidados.push(atual);
      }
      continue;
    }
    if (atual?.modeloOrigem === "moeve" && pagina.modeloOrigem === "moeve") {
      const mesmaIdentidade = identidadeMoeveCompativel(atual, pagina);
      const ultimaPagina = atual.paginasOrigemMoeve?.at(-1);
      const primeiraPagina = pagina.paginasOrigemMoeve?.[0];
      const fimSemCabecalho = pagina.continuacaoSemCabecalhoMoeve && !atual.rodapeCompletoMoeve
        && atual.identidadeMoeve && atual.competencia && ultimaPagina != null && primeiraPagina === ultimaPagina + 1
        && (!pagina.identidadeMoeve || mesmaIdentidade);
      if (atual.rodapeCompletoMoeve && pagina.itens.length && mesmaIdentidade && atual.competencia === pagina.competencia) throw new Error(`${pagina.competencia ?? "competência ilegível"}: novos dados após fechamento do contracheque`);
      if (atual.rodapeCompletoMoeve && !pagina.itens.length && mesmaIdentidade && atual.competencia === pagina.competencia
        && ((!pagina.rodapeCompletoMoeve && pagina.totalProventos == null && pagina.totalDescontos == null && pagina.liquido == null)
          || (pagina.totalProventos === atual.totalProventos && pagina.totalDescontos === atual.totalDescontos && pagina.liquido === atual.liquido))) {
        atual.paginasOrigemMoeve = [...new Set([...(atual.paginasOrigemMoeve ?? []), ...(pagina.paginasOrigemMoeve ?? [])])];
        continue;
      }
      if (fimSemCabecalho || (!atual.rodapeCompletoMoeve && mesmaIdentidade && atual.competencia === pagina.competencia)) {
        atual = {
          ...atual,
          identidadeMoeve: combinarIdentidadeMoeve(atual.identidadeMoeve, pagina.identidadeMoeve, `${atual.cnpjMoeve ?? pagina.cnpjMoeve ?? ""}|${atual.matriculaMoeve ?? pagina.matriculaMoeve ?? ""}`),
          cnpjMoeve: atual.cnpjMoeve ?? pagina.cnpjMoeve,
          matriculaMoeve: atual.matriculaMoeve ?? pagina.matriculaMoeve,
          itens: [...atual.itens, ...pagina.itens],
          totalProventos: pagina.totalProventos ?? atual.totalProventos,
          totalDescontos: pagina.totalDescontos ?? atual.totalDescontos,
          liquido: pagina.liquido ?? atual.liquido,
          rodapeCompletoMoeve: pagina.rodapeCompletoMoeve ?? atual.rodapeCompletoMoeve,
          rotulosBasesMoeve: pagina.rotulosBasesMoeve ?? atual.rotulosBasesMoeve,
          valoresBasesMoeve: pagina.valoresBasesMoeve ?? atual.valoresBasesMoeve,
          paginasOrigemMoeve: [...new Set([...(atual.paginasOrigemMoeve ?? []), ...(pagina.paginasOrigemMoeve ?? [])])],
        };
        consolidados[consolidados.length - 1] = atual;
        continue;
      }
    }
    if (pagina.continuacaoSemCabecalhoMoeve) {
      throw new Error(`Moeve: continuação sem recibo anterior compatível (página ${pagina.paginasOrigemMoeve?.[0] ?? "ilegível"}).`);
    }
    if (pagina.modeloOrigem === "moeve" || atual?.modeloOrigem === "moeve") {
      atual = { ...pagina, itens: [...pagina.itens] };
      consolidados.push(atual);
      continue;
    }
    const continuaElekeiroz = atual?.modeloOrigem === "elekeiroz"
      && pagina.modeloOrigem === "elekeiroz"
      && atual.competencia === pagina.competencia;
    // Alguns recibos BASF/TRONOX sem descontos têm totalDescontos nulo, mas
    // possuem líquido impresso. O líquido encerra o bloco; não unir a próxima
    // página só porque a competência se repetiu.
    const fechamentoImpresso = atual != null && (
      (atual.totalProventos != null && atual.liquido != null)
      || (["basf", "tronox"].includes(atual.modeloOrigem) && atual.totalProventos != null)
    );
    if (!atual || (!continuaElekeiroz && fechamentoImpresso)) {
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
    if (c.folhasPetrobras && (c.folhasPetrobras.inicio !== 1 || c.folhasPetrobras.ultima !== c.folhasPetrobras.total)) return true;
    const chave = `${c.competencia}|${c.totalProventos}|${c.totalDescontos}|${c.itens.map((i) => `${i.codigo}:${i.valor}`).join(",")}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}
