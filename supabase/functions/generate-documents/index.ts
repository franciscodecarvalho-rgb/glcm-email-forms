// Gera as peças DOCX do caso a partir dos templates ({VAR}, docxtemplater)
// e a planilha de cálculo como .xlsx com fórmulas vivas.
//
// ARQUIVO ÚNICO de propósito: o deploy de Edge Functions aqui não lida bem com
// imports de pastas compartilhadas (_shared) — funções multi-arquivo ficaram
// na versão antiga em produção. Tudo que esta função precisa está inline.
// As regras de variáveis/extenso espelham src/lib (testes vivem no vitest).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import PizZip from "npm:pizzip@3.2.0";
import Docxtemplater from "npm:docxtemplater@3.68.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALIQUOTA = 0.275;

type NaturezaAcao = "tributaria" | "trabalhista";
type ConfiguracaoAcao = { natureza: NaturezaAcao; peticao: string; contrato: string };
type PecaSelecionada = { templateTipo: string; tipoSaida: string };

// Espelho de src/lib/modelos-documentos.ts (mapa e selecionarPecas). Mantido
// inline porque esta Edge Function é publicada como arquivo único no ambiente
// atual; ao alterar, sincronizar a fonte canônica.
const DOCUMENTOS_POR_TIPO_ACAO: Record<string, ConfiguracaoAcao> = {
  ir_sobre_hra: {
    natureza: "tributaria",
    peticao: "peticao_ir_sobre_hra",
    contrato: "contrato_tributario",
  },
  contribuicao_extraordinaria: {
    natureza: "tributaria",
    peticao: "peticao_contribuicao_extraordinaria",
    contrato: "contrato_contribuicao_extraordinaria",
  },
  tema_324: {
    natureza: "tributaria",
    peticao: "peticao_tema_324",
    contrato: "contrato_tributario",
  },
  horas_extras: {
    natureza: "trabalhista",
    peticao: "peticao_horas_extras",
    contrato: "contrato_trabalhista",
  },
  supressao_folgas: {
    natureza: "trabalhista",
    peticao: "peticao_supressao_folgas",
    contrato: "contrato_supressao_folgas",
  },
};

function selecionarPecas(tipoAcao: string, escritorios: string[]): PecaSelecionada[] {
  const configuracao = DOCUMENTOS_POR_TIPO_ACAO[tipoAcao];
  if (!configuracao) throw new Error(`Tipo de ação sem modelos configurados: ${tipoAcao || "não informado"}`);

  const pecas: PecaSelecionada[] = [
    { templateTipo: configuracao.peticao, tipoSaida: "peticao" },
    { templateTipo: configuracao.contrato, tipoSaida: "contrato" },
    // Declaração de Pobreza somente nas ações trabalhistas
    // (horas_extras e supressao_folgas); não entra nas tributárias.
    ...(configuracao.natureza === "trabalhista"
      ? [{ templateTipo: "declaracao_pobreza", tipoSaida: "declaracao_pobreza" }]
      : []),
    // Termo de renúncia existente e já validado: identificador preservado.
    { templateTipo: "termo_renuncia", tipoSaida: "termo_renuncia" },
  ];

  if (escritorios.length === 0 || escritorios.includes("glcm")) {
    pecas.push(
      { templateTipo: `procuracao_${configuracao.natureza}_glcm`, tipoSaida: "procuracao_glcm" },
      { templateTipo: "termo_lgpd_glcm", tipoSaida: "termo_lgpd_glcm" },
    );
  }
  if (escritorios.length === 0 || escritorios.includes("polkowski")) {
    pecas.push(
      { templateTipo: `procuracao_${configuracao.natureza}_polkowski`, tipoSaida: "procuracao_polkowski" },
      { templateTipo: "termo_lgpd_polkowski", tipoSaida: "termo_lgpd_polkowski" },
    );
  }
  return pecas;
}

function garantirMarcadorNumeroContrato(zip: PizZip): void {
  const arquivosXml = Object.keys(zip.files).filter((nome) =>
    /^word\/(?:document|header\d+)\.xml$/.test(nome)
  );

  if (arquivosXml.some((nome) => zip.file(nome)?.asText().includes("{NUMERO_CONTRATO}"))) {
    return;
  }

  for (const nome of arquivosXml) {
    const arquivo = zip.file(nome);
    if (!arquivo) continue;
    const xml = arquivo.asText();
    if (!xml.includes("CONTRATO:")) continue;

    zip.file(nome, xml.replace("CONTRATO:", "CONTRATO: {NUMERO_CONTRATO}"));
    return;
  }

  throw new Error("O template de contrato não contém o campo CONTRATO:");
}

// ---------------- valor por extenso (espelho de src/lib/valor-extenso.ts) ----------------
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

function extensoInteiro(n: number): string {
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

function valorPorExtenso(valor: number): string {
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

// ---------------- variáveis do caso (espelho de src/lib/caso-variaveis.ts) ----------------
const fmtBRL = (n: number): string =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtData(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function montarEnderecoCompleto(e: any): string {
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

// Espelho de src/lib/cpf.ts (formato de exibição/documentos; sincronizar com a fonte).
const formatarCpf = (valor: string | null | undefined): string => {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.length === 11
    ? `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
    : (valor ?? "").trim();
};

function montarVariaveisCaso(caso: any, hoje: Date = new Date()): Record<string, string> {
  const e = caso.endereco ?? {};
  const q = caso.qualificacao ?? {};
  const valor = Number(caso.valor_causa) || 0;
  const cidadeUf = [e.cidade, e.estado].filter(Boolean).join("/");

  return {
    NOME_CLIENTE: caso.nome_cliente ?? "",
    CPF: formatarCpf(caso.cpf),
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
    NUMERO_CONTRATO: caso.numero_pasta ?? "",
    HONORARIOS_PCT: caso.honorarios_pct != null ? String(caso.honorarios_pct) : "",
    HONORARIOS_EXTENSO: caso.honorarios_pct != null ? extensoInteiro(Math.round(Number(caso.honorarios_pct))) : "",
    VALOR_CAUSA: fmtBRL(valor),
    VALOR_CAUSA_EXTENSO: valorPorExtenso(valor),
    ANO: String(hoje.getFullYear()),
    ENDERECO_PFN: "[preencher endereço da PFN da comarca]",
    EMAIL_CLIENTE: caso.email_cliente ?? "",
    TELEFONE_CLIENTE: caso.telefone_cliente ?? "",
    CAPTADOR: caso.captador ?? "",
    OAB_CASO: caso.oab ?? "",
    UF_COMARCA: caso.uf_comarca ?? "",
  };
}

// ---------------- planilha xlsx (espelho de src/lib/planilha-xlsx.ts) ----------------
type LinhaPlanilha = { competencia: string; hra: number; ahra: number };

// Competência normalizada como MM/AAAA; rótulos fora desse padrão (ex.: legado
// "Contracheque 1") vão para o fim, preservando a ordem relativa.
function chaveCompetencia(competencia: string): [number, number] | null {
  const m = competencia.match(/(0[1-9]|1[0-2])\/(20\d{2})/);
  return m ? [Number(m[2]), Number(m[1])] : null;
}

function ordenarPorCompetencia<T extends { competencia: string }>(linhas: T[]): T[] {
  return linhas
    .map((linha, indice) => ({ linha, indice, chave: chaveCompetencia(linha.competencia) }))
    .sort((a, b) => {
      if (a.chave && b.chave) return a.chave[0] - b.chave[0] || a.chave[1] - b.chave[1];
      if (a.chave) return -1;
      if (b.chave) return 1;
      return a.indice - b.indice;
    })
    .map(({ linha }) => linha);
}

const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const numCell = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const tx = (ref: string, t: string, estilo = 0) =>
  `<c r="${ref}" t="inlineStr"${estilo ? ` s="${estilo}"` : ""}><is><t xml:space="preserve">${escXml(t)}</t></is></c>`;
const empty = (ref: string, estilo = 0) =>
  `<c r="${ref}"${estilo ? ` s="${estilo}"` : ""}/>`;
const nm = (ref: string, v: number, estilo = 0) =>
  `<c r="${ref}"${estilo ? ` s="${estilo}"` : ""}><v>${numCell(v)}</v></c>`;
const fx = (ref: string, formula: string, cache: number, estilo = 0) =>
  `<c r="${ref}"${estilo ? ` s="${estilo}"` : ""}><f>${escXml(formula)}</f><v>${numCell(cache)}</v></c>`;

function montarArquivosPlanilhaXlsx(nomeCliente: string, linhas: LinhaPlanilha[]): Record<string, string> {
  // Planilha não pode ser alimentada com linhas de valores zerados.
  const naoNulas = linhas.filter((l) => l.hra !== 0 || l.ahra !== 0);
  const ordenadas = ordenarPorCompetencia(naoNulas);
  const rows: string[] = [];
  rows.push(
    `<row r="1" ht="30" customHeight="1"><c r="A1" t="inlineStr" s="4"><is><t xml:space="preserve">${escXml(`PLANILHA — ${nomeCliente} — TEMA 306 (HRA)`)}</t></is></c></row>`,
  );
  rows.push(
    `<row r="2" ht="18" customHeight="1">${["P. A.", "HRA", "AHRA", "ALÍQ. IR", "VALOR (HISTÓRICO)"]
      .map((t, i) => tx(`${"ABCDE"[i]}2`, t, 5))
      .join("")}</row>`,
  );

  let r = 3;
  for (const l of ordenadas) {
    const sub = l.hra + l.ahra;
    rows.push(
      `<row r="${r}">` +
        tx(`A${r}`, l.competencia, 6) +
        nm(`B${r}`, l.hra, 7) +
        nm(`C${r}`, l.ahra, 7) +
        `<c r="D${r}" s="8"><v>0.275</v></c>` +
        fx(`E${r}`, `ROUND((B${r}+C${r})*0.275,2)`, Math.round(sub * 0.275 * 100) / 100, 7) +
        `</row>`,
    );
    r++;
  }

  const primeira = 3;
  const ultima = r - 1;
  if (ordenadas.length > 0) {
    rows.push(
      `<row r="${r}">` +
        empty(`A${r}`, 9) +
        empty(`B${r}`, 9) +
        empty(`C${r}`, 9) +
        tx(`D${r}`, "VALOR (HISTÓRICO)", 9) +
        fx(
          `E${r}`,
          `SUM(E${primeira}:E${ultima})`,
          ordenadas.reduce((s, l) => s + Math.round((l.hra + l.ahra) * 0.275 * 100) / 100, 0),
          10,
        ) +
        `</row>`,
    );
  }

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="15" customWidth="1"/><col min="2" max="2" width="18" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="18" customWidth="1"/><col min="5" max="5" width="22" customWidth="1"/></cols>
<sheetData>${rows.join("")}</sheetData>
<mergeCells count="1"><mergeCell ref="A1:E1"/></mergeCells>
</worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2">
<numFmt numFmtId="164" formatCode="#,##0.00"/>
<numFmt numFmtId="165" formatCode="0.00%"/>
</numFmts>
<fonts count="6">
<font><sz val="11"/><name val="Arial"/></font>
<font><b/><sz val="11"/><name val="Arial"/></font>
<font><b/><sz val="14"/><name val="Arial"/><color rgb="FFFFFFFF"/></font>
<font><b/><sz val="10"/><name val="Arial"/><color rgb="FFFFFFFF"/></font>
<font><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="10"/><name val="Arial"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2B5B84"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/></patternFill></fill>
</fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>
<border><left style="thick"><color auto="1"/></left><right style="thick"><color auto="1"/></right><top style="thick"><color auto="1"/></top><bottom style="thick"><color auto="1"/></bottom><diagonal/></border>
<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thick"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
  <alignment horizontal="center" vertical="center" wrapText="1"/>
</xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
  <alignment horizontal="center" vertical="center"/>
</xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
  <alignment horizontal="center" vertical="center"/>
</xf>
<xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
  <alignment horizontal="right" vertical="center"/>
</xf>
<xf numFmtId="165" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
  <alignment horizontal="right" vertical="center"/>
</xf>
<xf numFmtId="0" fontId="5" fillId="4" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
  <alignment horizontal="center" vertical="center"/>
</xf>
<xf numFmtId="164" fontId="5" fillId="4" borderId="3" xfId="0" applyFont="1" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1">
  <alignment horizontal="right" vertical="center"/>
</xf>
</cellXfs>
</styleSheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="TEMA 306" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  return {
    "[Content_Types].xml": contentTypes,
    "_rels/.rels": rels,
    "xl/workbook.xml": workbook,
    "xl/_rels/workbook.xml.rels": workbookRels,
    "xl/styles.xml": styles,
    "xl/worksheets/sheet1.xml": sheet,
  };
}

// ---------------- planilha Banco de Horas (1513) ----------------
// Espelho da fonte canônica src/lib/planilha-xlsx.ts (deploy de arquivo único).
const CODIGO_BANCO_HORAS = "1513";
const CODIGOS_BASE_CALCULO = ["0001", "0201", "1061", "1062", "1059", "0192", "0015"] as const;

type LinhaBancoHoras = {
  competencia: string;
  quantidade: number;
  valor: number;
  base: Record<string, number>;
};
type ContrachequeParaBancoHoras = { id: string; competencia?: string | null };
type ItemParaBancoHoras = {
  contracheque_id?: string | null;
  codigo?: string | null;
  valor?: number | null;
  referencia?: number | null;
};

function agregarBancoHorasPorCompetencia(
  contracheques: ContrachequeParaBancoHoras[] | null | undefined,
  itens: ItemParaBancoHoras[] | null | undefined,
): LinhaBancoHoras[] {
  const competenciaPorId = new Map(
    (contracheques ?? []).map((c) => [c.id, c.competencia ?? ""]),
  );
  const porCompetencia = new Map<string, LinhaBancoHoras>();

  for (const item of itens ?? []) {
    const codigo = (item.codigo ?? "").trim();
    const isBH = codigo === CODIGO_BANCO_HORAS;
    const isBase = (CODIGOS_BASE_CALCULO as readonly string[]).includes(codigo);
    if (!isBH && !isBase) continue;
    const competencia = competenciaPorId.get(item.contracheque_id ?? "") ?? "";
    if (!competencia) continue;
    const linha = porCompetencia.get(competencia) ?? {
      competencia,
      quantidade: 0,
      valor: 0,
      base: Object.fromEntries(CODIGOS_BASE_CALCULO.map((c) => [c, 0])),
    };
    if (isBH) {
      linha.quantidade += Number(item.referencia) || 0;
      linha.valor += Number(item.valor) || 0;
    } else if (codigo in linha.base) {
      linha.base[codigo] += Number(item.valor) || 0;
    }
    porCompetencia.set(competencia, linha);
  }

  return ordenarPorCompetencia([...porCompetencia.values()]);
}

function competenciaParaData(competencia: string): number {
  const m = competencia.match(/(0[1-9]|1[0-2])\/(20\d{2})/);
  if (!m) return 0;
  const mes = Number(m[1]);
  const ano = Number(m[2]);
  return Math.floor(Date.UTC(ano, mes - 1, 1) / 86400000) + 25569;
}

const ESTILOS_MODELO_1513 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x14ac" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac"><numFmts count="10"><numFmt numFmtId="44" formatCode="_-&quot;R$&quot;\ * #,##0.00_-;\-&quot;R$&quot;\ * #,##0.00_-;_-&quot;R$&quot;\ * &quot;-&quot;??_-;_-@_-"/><numFmt numFmtId="43" formatCode="_-* #,##0.00_-;\-* #,##0.00_-;_-* &quot;-&quot;??_-;_-@_-"/><numFmt numFmtId="165" formatCode="_(* #,##0.00_);_(* \(#,##0.00\);_(* &quot;-&quot;??_);_(@_)"/><numFmt numFmtId="166" formatCode="_(* #,##0.00_);_(* \(#,##0.00\);_(* \-??_);_(@_)"/><numFmt numFmtId="167" formatCode="_(* #\,##0\.00_);_(* \(#\,##0\.00\);_(* &quot;-&quot;??_);_(@_)"/><numFmt numFmtId="168" formatCode="00.00_)&quot;horas&quot;"/><numFmt numFmtId="169" formatCode="0.00000000000"/><numFmt numFmtId="170" formatCode="0.0%"/><numFmt numFmtId="174" formatCode="&quot;R$&quot;\ #,##0.00"/><numFmt numFmtId="175" formatCode="[$-416]mmm\-yy;@"/></numFmts><fonts count="38" x14ac:knownFonts="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><sz val="11"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><sz val="10"/><name val="Arial"/><family val="2"/></font><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color indexed="8"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color indexed="9"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color indexed="17"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color indexed="10"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color indexed="9"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color indexed="10"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color indexed="62"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color indexed="20"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color indexed="19"/><name val="Calibri"/><family val="2"/></font><font><sz val="10"/><name val="Courier"/><family val="3"/></font><font><b/><sz val="11"/><color indexed="63"/><name val="Calibri"/><family val="2"/></font><font><i/><sz val="11"/><color indexed="23"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="15"/><color indexed="62"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="13"/><color indexed="62"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color indexed="62"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="8"/><name val="Times New Roman"/><family val="1"/></font><font><b/><sz val="18"/><color indexed="62"/><name val="Cambria"/><family val="2"/></font><font><b/><sz val="11"/><color indexed="8"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><sz val="10"/><name val="Arial"/><family val="2"/></font><font><sz val="11"/><color rgb="FFFF0000"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><sz val="11"/><color theme="0"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><b/><sz val="11"/><color theme="0"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><sz val="12"/><color theme="1"/><name val="Arial Narrow"/><family val="2"/></font><font><sz val="10"/><color theme="1"/><name val="Arial Narrow"/><family val="2"/></font><font><b/><sz val="12"/><name val="Arial Narrow"/><family val="2"/></font><font><sz val="10"/><color theme="0"/><name val="Arial Narrow"/><family val="2"/></font><font><sz val="10"/><name val="Arial Narrow"/><family val="2"/></font><font><b/><sz val="10"/><name val="Arial Narrow"/><family val="2"/></font><font><b/><sz val="11"/><color theme="0"/><name val="Arial Narrow"/><family val="2"/></font><font><b/><sz val="10"/><color theme="0"/><name val="Arial Narrow"/><family val="2"/></font><font><sz val="11"/><color rgb="FFFF0000"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="39"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="44"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="44"/><bgColor indexed="42"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="29"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="29"/><bgColor indexed="45"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="26"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="26"/><bgColor indexed="43"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="47"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="31"/><bgColor indexed="27"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="27"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="42"/><bgColor indexed="44"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="43"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="43"/><bgColor indexed="26"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="45"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="45"/><bgColor indexed="46"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="53"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="25"/><bgColor indexed="23"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="51"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="50"/><bgColor indexed="19"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="9"/><bgColor indexed="26"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="55"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="55"/><bgColor indexed="23"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="56"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="48"/><bgColor indexed="62"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="54"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="54"/><bgColor indexed="23"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="49"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="49"/><bgColor indexed="40"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="10"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="10"/><bgColor indexed="60"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="46"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor indexed="46"/><bgColor indexed="45"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor theme="8" tint="0.79998168889431442"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor theme="0" tint="-0.249977111117893"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor theme="0" tint="-0.14999847407452621"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF01788C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="55"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border><border><left style="thin"><color indexed="23"/></left><right style="thin"><color indexed="23"/></right><top style="thin"><color indexed="23"/></top><bottom style="thin"><color indexed="23"/></bottom><diagonal/></border><border><left style="double"><color indexed="63"/></left><right style="double"><color indexed="63"/></right><top style="double"><color indexed="63"/></top><bottom style="double"><color indexed="63"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="double"><color indexed="10"/></bottom><diagonal/></border><border><left style="thin"><color indexed="22"/></left><right style="thin"><color indexed="22"/></right><top style="thin"><color indexed="22"/></top><bottom style="thin"><color indexed="22"/></bottom><diagonal/></border><border><left style="thin"><color indexed="63"/></left><right style="thin"><color indexed="63"/></right><top style="thin"><color indexed="63"/></top><bottom style="thin"><color indexed="63"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="thick"><color indexed="56"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="thick"><color indexed="48"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="thick"><color indexed="27"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="thick"><color indexed="42"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="medium"><color indexed="27"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="medium"><color indexed="42"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color indexed="56"/></top><bottom style="double"><color indexed="56"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color indexed="48"/></top><bottom style="double"><color indexed="48"/></bottom><diagonal/></border><border><left style="thin"><color rgb="FF01788C"/></left><right style="medium"><color theme="0"/></right><top style="thin"><color rgb="FF01788C"/></top><bottom style="thin"><color rgb="FF01788C"/></bottom><diagonal/></border><border><left style="medium"><color theme="0"/></left><right style="thin"><color rgb="FF01788C"/></right><top style="thin"><color rgb="FF01788C"/></top><bottom style="thin"><color rgb="FF01788C"/></bottom><diagonal/></border><border><left style="thin"><color rgb="FF01788C"/></left><right/><top/><bottom/><diagonal/></border><border><left/><right style="thin"><color rgb="FF01788C"/></right><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF01788C"/></left><right/><top/><bottom style="thin"><color rgb="FF01788C"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF01788C"/></bottom><diagonal/></border><border><left/><right style="thin"><color rgb="FF01788C"/></right><top/><bottom style="thin"><color rgb="FF01788C"/></bottom><diagonal/></border><border><left style="thin"><color rgb="FF01788C"/></left><right/><top style="thin"><color rgb="FF01788C"/></top><bottom style="thin"><color rgb="FF01788C"/></bottom><diagonal/></border><border><left/><right style="thin"><color rgb="FF01788C"/></right><top style="thin"><color rgb="FF01788C"/></top><bottom style="thin"><color rgb="FF01788C"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF01788C"/></top><bottom style="thin"><color rgb="FF01788C"/></bottom><diagonal/></border><border><left style="thick"><color theme="0"/></left><right style="thick"><color theme="0"/></right><top style="thick"><color theme="0"/></top><bottom style="thick"><color theme="0"/></bottom><diagonal/></border><border><left style="thin"><color theme="8" tint="-0.499984740745262"/></left><right/><top style="thin"><color theme="8" tint="-0.499984740745262"/></top><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color theme="8" tint="-0.499984740745262"/></top><bottom/><diagonal/></border><border><left/><right style="thin"><color theme="8" tint="-0.499984740745262"/></right><top style="thin"><color theme="8" tint="-0.499984740745262"/></top><bottom/><diagonal/></border><border><left style="thin"><color theme="8" tint="-0.499984740745262"/></left><right/><top/><bottom/><diagonal/></border><border><left/><right style="thin"><color theme="8" tint="-0.499984740745262"/></right><top/><bottom/><diagonal/></border><border><left style="thin"><color theme="8" tint="-0.499984740745262"/></left><right/><top/><bottom style="thin"><color theme="8" tint="-0.499984740745262"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color theme="8" tint="-0.499984740745262"/></bottom><diagonal/></border><border><left/><right style="thin"><color theme="8" tint="-0.499984740745262"/></right><top/><bottom style="thin"><color theme="8" tint="-0.499984740745262"/></bottom><diagonal/></border><border><left style="medium"><color theme="0"/></left><right/><top style="thin"><color rgb="FF01788C"/></top><bottom style="thin"><color rgb="FF01788C"/></bottom><diagonal/></border><border><left/><right style="medium"><color theme="0"/></right><top style="thin"><color rgb="FF01788C"/></top><bottom style="thin"><color rgb="FF01788C"/></bottom><diagonal/></border><border><left style="thin"><color theme="8" tint="-0.24994659260841701"/></left><right style="thick"><color theme="0"/></right><top style="thin"><color theme="8" tint="-0.24994659260841701"/></top><bottom style="thick"><color theme="0"/></bottom><diagonal/></border><border><left style="thick"><color theme="0"/></left><right style="thick"><color theme="0"/></right><top style="thin"><color theme="8" tint="-0.24994659260841701"/></top><bottom style="thick"><color theme="0"/></bottom><diagonal/></border><border><left style="thick"><color theme="0"/></left><right style="thin"><color theme="8" tint="-0.24994659260841701"/></right><top style="thin"><color theme="8" tint="-0.24994659260841701"/></top><bottom style="thick"><color theme="0"/></bottom><diagonal/></border><border><left style="thin"><color theme="8" tint="-0.24994659260841701"/></left><right style="thick"><color theme="0"/></right><top style="thick"><color theme="0"/></top><bottom style="thick"><color theme="0"/></bottom><diagonal/></border><border><left style="thick"><color theme="0"/></left><right style="thin"><color theme="8" tint="-0.24994659260841701"/></right><top style="thick"><color theme="0"/></top><bottom style="thick"><color theme="0"/></bottom><diagonal/></border><border><left style="thin"><color theme="8" tint="-0.24994659260841701"/></left><right/><top/><bottom/><diagonal/></border><border><left/><right style="thin"><color theme="8" tint="-0.24994659260841701"/></right><top/><bottom/><diagonal/></border><border><left style="thin"><color theme="8" tint="-0.24994659260841701"/></left><right/><top style="thin"><color theme="8" tint="-0.24994659260841701"/></top><bottom style="thin"><color theme="8" tint="-0.24994659260841701"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color theme="8" tint="-0.24994659260841701"/></top><bottom style="thin"><color theme="8" tint="-0.24994659260841701"/></bottom><diagonal/></border><border><left/><right style="thin"><color theme="8" tint="-0.24994659260841701"/></right><top style="thin"><color theme="8" tint="-0.24994659260841701"/></top><bottom style="thin"><color theme="8" tint="-0.24994659260841701"/></bottom><diagonal/></border><border><left style="thick"><color theme="0"/></left><right/><top style="thin"><color theme="8" tint="-0.24994659260841701"/></top><bottom style="thick"><color theme="0"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color theme="8" tint="-0.24994659260841701"/></top><bottom style="thick"><color theme="0"/></bottom><diagonal/></border><border><left/><right style="thick"><color theme="0"/></right><top style="thin"><color theme="8" tint="-0.24994659260841701"/></top><bottom style="thick"><color theme="0"/></bottom><diagonal/></border><border><left style="thin"><color theme="8" tint="-0.499984740745262"/></left><right/><top style="thin"><color theme="8" tint="-0.499984740745262"/></top><bottom style="thin"><color theme="8" tint="-0.499984740745262"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color theme="8" tint="-0.499984740745262"/></top><bottom style="thin"><color theme="8" tint="-0.499984740745262"/></bottom><diagonal/></border><border><left/><right style="thin"><color theme="8" tint="-0.499984740745262"/></right><top style="thin"><color theme="8" tint="-0.499984740745262"/></top><bottom style="thin"><color theme="8" tint="-0.499984740745262"/></bottom><diagonal/></border><border><left style="thin"><color theme="8" tint="-0.24994659260841701"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom/><diagonal/></border><border><left style="thin"><color theme="8" tint="-0.24994659260841701"/></left><right style="thin"><color indexed="64"/></right><top/><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders><cellStyleXfs count="402"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="3" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="3" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="3" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="3" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="3" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="3" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="4" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="6" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="8" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="9" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="9" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="9" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="9" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="9" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="9" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="10" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="12" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="8" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="12" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="6" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="14" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="16" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="12" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="7" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="6" fillId="8" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="12" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="18" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="20" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="15" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="16" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="12" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="5" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="6" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="8" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="8" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="8" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="8" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="8" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="8" fillId="11" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="8" fillId="12" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="9" fillId="21" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="9" fillId="21" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="9" fillId="21" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="9" fillId="21" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="9" fillId="21" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="9" fillId="21" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="9" fillId="22" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="10" fillId="23" borderId="3" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="10" fillId="23" borderId="3" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="10" fillId="23" borderId="3" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="10" fillId="23" borderId="3" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="10" fillId="23" borderId="3" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="10" fillId="23" borderId="3" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="10" fillId="24" borderId="3" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="11" fillId="0" borderId="4" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="25" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="25" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="25" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="25" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="25" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="25" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="26" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="17" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="18" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="19" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="20" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="27" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="27" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="27" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="27" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="27" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="27" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="28" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="29" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="29" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="29" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="29" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="29" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="29" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="30" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="31" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="31" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="31" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="31" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="31" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="31" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="7" fillId="32" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="12" fillId="13" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="12" fillId="13" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="12" fillId="13" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="12" fillId="13" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="12" fillId="13" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="12" fillId="13" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="12" fillId="14" borderId="2" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="13" fillId="33" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="13" fillId="33" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="13" fillId="33" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="13" fillId="33" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="13" fillId="33" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="13" fillId="33" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="13" fillId="34" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="44" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="14" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="14" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="14" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="14" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="14" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="14" fillId="13" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="14" fillId="14" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0"/><xf numFmtId="0" fontId="15" fillId="7" borderId="5" applyNumberFormat="0" applyFont="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="15" fillId="7" borderId="5" applyNumberFormat="0" applyFont="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="15" fillId="7" borderId="5" applyNumberFormat="0" applyFont="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="4" fillId="7" borderId="5" applyNumberFormat="0" applyFont="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="15" fillId="7" borderId="5" applyNumberFormat="0" applyFont="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="15" fillId="7" borderId="5" applyNumberFormat="0" applyFont="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="15" fillId="7" borderId="5" applyNumberFormat="0" applyFont="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="4" fillId="8" borderId="5" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="16" fillId="21" borderId="6" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="16" fillId="21" borderId="6" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="16" fillId="21" borderId="6" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="16" fillId="21" borderId="6" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="16" fillId="21" borderId="6" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="16" fillId="21" borderId="6" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="16" fillId="22" borderId="6" applyNumberFormat="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="166" fontId="4" fillId="0" borderId="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="11" fillId="0" borderId="0" applyNumberFormat="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="17" fillId="0" borderId="0" applyNumberFormat="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="18" fillId="0" borderId="7" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="18" fillId="0" borderId="7" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="18" fillId="0" borderId="7" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="18" fillId="0" borderId="7" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="18" fillId="0" borderId="7" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="18" fillId="0" borderId="7" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="18" fillId="0" borderId="8" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="19" fillId="0" borderId="9" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="19" fillId="0" borderId="9" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="19" fillId="0" borderId="9" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="19" fillId="0" borderId="9" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="19" fillId="0" borderId="9" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="19" fillId="0" borderId="9" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="19" fillId="0" borderId="10" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="20" fillId="0" borderId="11" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="20" fillId="0" borderId="11" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="20" fillId="0" borderId="11" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="20" fillId="0" borderId="11" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="20" fillId="0" borderId="11" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="20" fillId="0" borderId="11" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="20" fillId="0" borderId="12" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="20" fillId="0" borderId="0" applyNumberFormat="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="21" fillId="0" borderId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="22" fillId="0" borderId="0" applyNumberFormat="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="21" fillId="0" borderId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="21" fillId="0" borderId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="21" fillId="0" borderId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="21" fillId="0" borderId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="21" fillId="0" borderId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="21" fillId="0" borderId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="23" fillId="0" borderId="13" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="23" fillId="0" borderId="13" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="23" fillId="0" borderId="13" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="23" fillId="0" borderId="13" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="23" fillId="0" borderId="13" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="23" fillId="0" borderId="13" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="23" fillId="0" borderId="14" applyNumberFormat="0" applyFill="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="166" fontId="4" fillId="0" borderId="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="166" fontId="4" fillId="0" borderId="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="25" fillId="0" borderId="0"/><xf numFmtId="167" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="24" fillId="0" borderId="0"/><xf numFmtId="9" fontId="24" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="9" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="0" fontId="29" fillId="0" borderId="0"/><xf numFmtId="43" fontId="29" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="165" fontId="4" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/><xf numFmtId="44" fontId="24" fillId="0" borderId="0" applyFont="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/></cellStyleXfs><cellXfs count="129"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="4" fontId="2" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="14" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="4" fontId="2" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="27" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="14" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="2" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="170" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="46" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="14" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/><xf numFmtId="10" fontId="0" fillId="2" borderId="0" xfId="395" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="2" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/><xf numFmtId="10" fontId="0" fillId="2" borderId="0" xfId="395" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="26" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="26" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="30" fillId="0" borderId="0" xfId="398" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="32" fillId="0" borderId="0" xfId="398" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="17" fontId="30" fillId="0" borderId="0" xfId="398" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="17" fontId="32" fillId="0" borderId="0" xfId="398" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="35" fillId="38" borderId="15" xfId="398" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="35" fillId="38" borderId="16" xfId="398" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="33" fillId="0" borderId="17" xfId="398" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="43" fontId="33" fillId="0" borderId="0" xfId="398" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="43" fontId="33" fillId="0" borderId="18" xfId="398" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="4" fontId="30" fillId="0" borderId="0" xfId="398" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="43" fontId="30" fillId="0" borderId="0" xfId="398" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="33" fillId="0" borderId="19" xfId="398" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="43" fontId="33" fillId="0" borderId="20" xfId="399" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="33" fillId="0" borderId="20" xfId="398" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="43" fontId="33" fillId="0" borderId="21" xfId="399" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="4" fontId="32" fillId="0" borderId="0" xfId="398" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="2" fontId="32" fillId="0" borderId="0" xfId="398" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="34" fillId="0" borderId="22" xfId="398" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="30" fillId="0" borderId="0" xfId="398" applyFont="1"/><xf numFmtId="0" fontId="32" fillId="0" borderId="0" xfId="398" applyFont="1"/><xf numFmtId="0" fontId="34" fillId="0" borderId="24" xfId="398" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="43" fontId="34" fillId="0" borderId="23" xfId="398" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="30" fillId="0" borderId="0" xfId="398" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="32" fillId="0" borderId="0" xfId="398" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="27" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="2" fontId="2" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="36" fillId="38" borderId="25" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="37" borderId="25" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="17" fontId="3" fillId="2" borderId="26" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="17" fontId="3" fillId="2" borderId="27" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="4" fontId="1" fillId="2" borderId="28" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="17" fontId="3" fillId="2" borderId="29" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="17" fontId="3" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="9" fontId="3" fillId="2" borderId="0" xfId="395" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"/><xf numFmtId="4" fontId="1" fillId="2" borderId="30" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="17" fontId="3" fillId="2" borderId="31" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="17" fontId="3" fillId="2" borderId="32" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="4" fontId="1" fillId="2" borderId="33" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="14" fontId="2" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="31" fillId="2" borderId="0" xfId="398" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="2" fontId="33" fillId="0" borderId="17" xfId="398" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="43" fontId="33" fillId="2" borderId="0" xfId="398" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="43" fontId="33" fillId="2" borderId="20" xfId="399" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="17" fontId="33" fillId="0" borderId="22" xfId="398" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="43" fontId="33" fillId="0" borderId="23" xfId="399" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="34" fillId="0" borderId="19" xfId="398" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="43" fontId="34" fillId="0" borderId="21" xfId="399" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="9" fontId="33" fillId="0" borderId="24" xfId="395" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="17" fontId="33" fillId="0" borderId="24" xfId="398" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="174" fontId="30" fillId="0" borderId="0" xfId="398" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="4" fontId="1" fillId="36" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="36" fillId="38" borderId="37" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="36" borderId="37" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="2" fontId="2" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="2" fontId="2" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="168" fontId="5" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="169" fontId="2" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="2" fontId="2" fillId="2" borderId="42" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="17" fontId="3" fillId="2" borderId="43" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="17" fontId="3" fillId="2" borderId="44" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="4" fontId="1" fillId="2" borderId="44" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="4" fontId="1" fillId="2" borderId="45" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="168" fontId="37" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="26" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="4" fontId="27" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="10" fontId="27" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="10" fontId="28" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="4" fontId="28" fillId="0" borderId="29" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="17" fontId="3" fillId="2" borderId="49" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="17" fontId="3" fillId="2" borderId="50" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="4" fontId="1" fillId="2" borderId="51" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="175" fontId="2" fillId="2" borderId="41" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="31" fillId="2" borderId="0" xfId="398" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left"/></xf><xf numFmtId="14" fontId="31" fillId="2" borderId="0" xfId="398" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="2" fontId="27" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="2" fontId="26" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="4" fontId="27" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="31" fillId="0" borderId="0" xfId="398" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="35" fillId="38" borderId="34" xfId="398" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="35" fillId="38" borderId="24" xfId="398" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="35" fillId="38" borderId="35" xfId="398" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="34" fillId="0" borderId="0" xfId="398" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="35" borderId="52" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="35" borderId="53" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="4" fontId="1" fillId="2" borderId="49" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="4" fontId="1" fillId="2" borderId="50" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="4" fontId="1" fillId="2" borderId="51" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="36" fillId="38" borderId="37" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="36" fillId="38" borderId="25" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="35" borderId="37" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="35" borderId="25" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="36" fillId="38" borderId="38" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="36" fillId="38" borderId="40" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="36" fillId="38" borderId="36" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="36" fillId="38" borderId="39" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="36" fillId="38" borderId="46" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="36" fillId="38" borderId="47" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="36" fillId="38" borderId="48" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="54" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="54" xfId="0" applyBorder="1"/><xf numFmtId="44" fontId="2" fillId="0" borderId="54" xfId="401" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="44" fontId="0" fillId="0" borderId="54" xfId="401" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="54" xfId="0" applyFont="1" applyBorder="1"/></cellXfs><cellStyles count="402"><cellStyle name="20% - Ênfase1 2" xfId="5"/><cellStyle name="20% - Ênfase1 2 2" xfId="6"/><cellStyle name="20% - Ênfase1 2 3" xfId="7"/><cellStyle name="20% - Ênfase1 3" xfId="8"/><cellStyle name="20% - Ênfase1 3 2" xfId="9"/><cellStyle name="20% - Ênfase1 3 3" xfId="10"/><cellStyle name="20% - Ênfase1 4" xfId="11"/><cellStyle name="20% - Ênfase2 2" xfId="12"/><cellStyle name="20% - Ênfase2 2 2" xfId="13"/><cellStyle name="20% - Ênfase2 2 3" xfId="14"/><cellStyle name="20% - Ênfase2 3" xfId="15"/><cellStyle name="20% - Ênfase2 3 2" xfId="16"/><cellStyle name="20% - Ênfase2 3 3" xfId="17"/><cellStyle name="20% - Ênfase2 4" xfId="18"/><cellStyle name="20% - Ênfase3 2" xfId="19"/><cellStyle name="20% - Ênfase3 2 2" xfId="20"/><cellStyle name="20% - Ênfase3 2 3" xfId="21"/><cellStyle name="20% - Ênfase3 3" xfId="22"/><cellStyle name="20% - Ênfase3 3 2" xfId="23"/><cellStyle name="20% - Ênfase3 3 3" xfId="24"/><cellStyle name="20% - Ênfase3 4" xfId="25"/><cellStyle name="20% - Ênfase4 2" xfId="26"/><cellStyle name="20% - Ênfase4 2 2" xfId="27"/><cellStyle name="20% - Ênfase4 2 3" xfId="28"/><cellStyle name="20% - Ênfase4 3" xfId="29"/><cellStyle name="20% - Ênfase4 3 2" xfId="30"/><cellStyle name="20% - Ênfase4 3 3" xfId="31"/><cellStyle name="20% - Ênfase4 4" xfId="32"/><cellStyle name="20% - Ênfase5 2" xfId="33"/><cellStyle name="20% - Ênfase5 2 2" xfId="34"/><cellStyle name="20% - Ênfase5 2 3" xfId="35"/><cellStyle name="20% - Ênfase5 3" xfId="36"/><cellStyle name="20% - Ênfase5 3 2" xfId="37"/><cellStyle name="20% - Ênfase5 3 3" xfId="38"/><cellStyle name="20% - Ênfase5 4" xfId="39"/><cellStyle name="20% - Ênfase6 2" xfId="40"/><cellStyle name="20% - Ênfase6 2 2" xfId="41"/><cellStyle name="20% - Ênfase6 2 3" xfId="42"/><cellStyle name="20% - Ênfase6 3" xfId="43"/><cellStyle name="20% - Ênfase6 3 2" xfId="44"/><cellStyle name="20% - Ênfase6 3 3" xfId="45"/><cellStyle name="20% - Ênfase6 4" xfId="46"/><cellStyle name="40% - Ênfase1 2" xfId="47"/><cellStyle name="40% - Ênfase1 2 2" xfId="48"/><cellStyle name="40% - Ênfase1 2 3" xfId="49"/><cellStyle name="40% - Ênfase1 3" xfId="50"/><cellStyle name="40% - Ênfase1 3 2" xfId="51"/><cellStyle name="40% - Ênfase1 3 3" xfId="52"/><cellStyle name="40% - Ênfase1 4" xfId="53"/><cellStyle name="40% - Ênfase2 2" xfId="54"/><cellStyle name="40% - Ênfase2 2 2" xfId="55"/><cellStyle name="40% - Ênfase2 2 3" xfId="56"/><cellStyle name="40% - Ênfase2 3" xfId="57"/><cellStyle name="40% - Ênfase2 3 2" xfId="58"/><cellStyle name="40% - Ênfase2 3 3" xfId="59"/><cellStyle name="40% - Ênfase2 4" xfId="60"/><cellStyle name="40% - Ênfase3 2" xfId="61"/><cellStyle name="40% - Ênfase3 2 2" xfId="62"/><cellStyle name="40% - Ênfase3 2 3" xfId="63"/><cellStyle name="40% - Ênfase3 3" xfId="64"/><cellStyle name="40% - Ênfase3 3 2" xfId="65"/><cellStyle name="40% - Ênfase3 3 3" xfId="66"/><cellStyle name="40% - Ênfase3 4" xfId="67"/><cellStyle name="40% - Ênfase4 2" xfId="68"/><cellStyle name="40% - Ênfase4 2 2" xfId="69"/><cellStyle name="40% - Ênfase4 2 3" xfId="70"/><cellStyle name="40% - Ênfase4 3" xfId="71"/><cellStyle name="40% - Ênfase4 3 2" xfId="72"/><cellStyle name="40% - Ênfase4 3 3" xfId="73"/><cellStyle name="40% - Ênfase4 4" xfId="74"/><cellStyle name="40% - Ênfase5 2" xfId="75"/><cellStyle name="40% - Ênfase5 2 2" xfId="76"/><cellStyle name="40% - Ênfase5 2 3" xfId="77"/><cellStyle name="40% - Ênfase5 3" xfId="78"/><cellStyle name="40% - Ênfase5 3 2" xfId="79"/><cellStyle name="40% - Ênfase5 3 3" xfId="80"/><cellStyle name="40% - Ênfase5 4" xfId="81"/><cellStyle name="40% - Ênfase6 2" xfId="82"/><cellStyle name="40% - Ênfase6 2 2" xfId="83"/><cellStyle name="40% - Ênfase6 2 3" xfId="84"/><cellStyle name="40% - Ênfase6 3" xfId="85"/><cellStyle name="40% - Ênfase6 3 2" xfId="86"/><cellStyle name="40% - Ênfase6 3 3" xfId="87"/><cellStyle name="40% - Ênfase6 4" xfId="88"/><cellStyle name="60% - Ênfase1 2" xfId="89"/><cellStyle name="60% - Ênfase1 2 2" xfId="90"/><cellStyle name="60% - Ênfase1 2 3" xfId="91"/><cellStyle name="60% - Ênfase1 3" xfId="92"/><cellStyle name="60% - Ênfase1 3 2" xfId="93"/><cellStyle name="60% - Ênfase1 3 3" xfId="94"/><cellStyle name="60% - Ênfase1 4" xfId="95"/><cellStyle name="60% - Ênfase2 2" xfId="96"/><cellStyle name="60% - Ênfase2 2 2" xfId="97"/><cellStyle name="60% - Ênfase2 2 3" xfId="98"/><cellStyle name="60% - Ênfase2 3" xfId="99"/><cellStyle name="60% - Ênfase2 3 2" xfId="100"/><cellStyle name="60% - Ênfase2 3 3" xfId="101"/><cellStyle name="60% - Ênfase2 4" xfId="102"/><cellStyle name="60% - Ênfase3 2" xfId="103"/><cellStyle name="60% - Ênfase3 2 2" xfId="104"/><cellStyle name="60% - Ênfase3 2 3" xfId="105"/><cellStyle name="60% - Ênfase3 3" xfId="106"/><cellStyle name="60% - Ênfase3 3 2" xfId="107"/><cellStyle name="60% - Ênfase3 3 3" xfId="108"/><cellStyle name="60% - Ênfase3 4" xfId="109"/><cellStyle name="60% - Ênfase4 2" xfId="110"/><cellStyle name="60% - Ênfase4 2 2" xfId="111"/><cellStyle name="60% - Ênfase4 2 3" xfId="112"/><cellStyle name="60% - Ênfase4 3" xfId="113"/><cellStyle name="60% - Ênfase4 3 2" xfId="114"/><cellStyle name="60% - Ênfase4 3 3" xfId="115"/><cellStyle name="60% - Ênfase4 4" xfId="116"/><cellStyle name="60% - Ênfase5 2" xfId="117"/><cellStyle name="60% - Ênfase5 2 2" xfId="118"/><cellStyle name="60% - Ênfase5 2 3" xfId="119"/><cellStyle name="60% - Ênfase5 3" xfId="120"/><cellStyle name="60% - Ênfase5 3 2" xfId="121"/><cellStyle name="60% - Ênfase5 3 3" xfId="122"/><cellStyle name="60% - Ênfase5 4" xfId="123"/><cellStyle name="60% - Ênfase6 2" xfId="124"/><cellStyle name="60% - Ênfase6 2 2" xfId="125"/><cellStyle name="60% - Ênfase6 2 3" xfId="126"/><cellStyle name="60% - Ênfase6 3" xfId="127"/><cellStyle name="60% - Ênfase6 3 2" xfId="128"/><cellStyle name="60% - Ênfase6 3 3" xfId="129"/><cellStyle name="60% - Ênfase6 4" xfId="130"/><cellStyle name="Bom 2" xfId="131"/><cellStyle name="Bom 2 2" xfId="132"/><cellStyle name="Bom 2 3" xfId="133"/><cellStyle name="Bom 3" xfId="134"/><cellStyle name="Bom 3 2" xfId="135"/><cellStyle name="Bom 3 3" xfId="136"/><cellStyle name="Bom 4" xfId="137"/><cellStyle name="Cálculo 2" xfId="138"/><cellStyle name="Cálculo 2 2" xfId="139"/><cellStyle name="Cálculo 2 3" xfId="140"/><cellStyle name="Cálculo 3" xfId="141"/><cellStyle name="Cálculo 3 2" xfId="142"/><cellStyle name="Cálculo 3 3" xfId="143"/><cellStyle name="Cálculo 4" xfId="144"/><cellStyle name="Célula de Verificação 2" xfId="145"/><cellStyle name="Célula de Verificação 2 2" xfId="146"/><cellStyle name="Célula de Verificação 2 3" xfId="147"/><cellStyle name="Célula de Verificação 3" xfId="148"/><cellStyle name="Célula de Verificação 3 2" xfId="149"/><cellStyle name="Célula de Verificação 3 3" xfId="150"/><cellStyle name="Célula de Verificação 4" xfId="151"/><cellStyle name="Célula Vinculada 2" xfId="152"/><cellStyle name="Ênfase1 2" xfId="153"/><cellStyle name="Ênfase1 2 2" xfId="154"/><cellStyle name="Ênfase1 2 3" xfId="155"/><cellStyle name="Ênfase1 3" xfId="156"/><cellStyle name="Ênfase1 3 2" xfId="157"/><cellStyle name="Ênfase1 3 3" xfId="158"/><cellStyle name="Ênfase1 4" xfId="159"/><cellStyle name="Ênfase2 2" xfId="160"/><cellStyle name="Ênfase2 2 2" xfId="161"/><cellStyle name="Ênfase2 2 3" xfId="162"/><cellStyle name="Ênfase2 3" xfId="163"/><cellStyle name="Ênfase2 3 2" xfId="164"/><cellStyle name="Ênfase2 3 3" xfId="165"/><cellStyle name="Ênfase2 4" xfId="166"/><cellStyle name="Ênfase3 2" xfId="167"/><cellStyle name="Ênfase3 2 2" xfId="168"/><cellStyle name="Ênfase3 2 3" xfId="169"/><cellStyle name="Ênfase3 3" xfId="170"/><cellStyle name="Ênfase3 3 2" xfId="171"/><cellStyle name="Ênfase3 3 3" xfId="172"/><cellStyle name="Ênfase3 4" xfId="173"/><cellStyle name="Ênfase4 2" xfId="174"/><cellStyle name="Ênfase4 2 2" xfId="175"/><cellStyle name="Ênfase4 2 3" xfId="176"/><cellStyle name="Ênfase4 3" xfId="177"/><cellStyle name="Ênfase4 3 2" xfId="178"/><cellStyle name="Ênfase4 3 3" xfId="179"/><cellStyle name="Ênfase4 4" xfId="180"/><cellStyle name="Ênfase5 2" xfId="181"/><cellStyle name="Ênfase5 2 2" xfId="182"/><cellStyle name="Ênfase5 2 3" xfId="183"/><cellStyle name="Ênfase5 3" xfId="184"/><cellStyle name="Ênfase5 3 2" xfId="185"/><cellStyle name="Ênfase5 3 3" xfId="186"/><cellStyle name="Ênfase5 4" xfId="187"/><cellStyle name="Ênfase6 2" xfId="188"/><cellStyle name="Ênfase6 2 2" xfId="189"/><cellStyle name="Ênfase6 2 3" xfId="190"/><cellStyle name="Ênfase6 3" xfId="191"/><cellStyle name="Ênfase6 3 2" xfId="192"/><cellStyle name="Ênfase6 3 3" xfId="193"/><cellStyle name="Ênfase6 4" xfId="194"/><cellStyle name="Entrada 2" xfId="195"/><cellStyle name="Entrada 2 2" xfId="196"/><cellStyle name="Entrada 2 3" xfId="197"/><cellStyle name="Entrada 3" xfId="198"/><cellStyle name="Entrada 3 2" xfId="199"/><cellStyle name="Entrada 3 3" xfId="200"/><cellStyle name="Entrada 4" xfId="201"/><cellStyle name="Incorreto 2" xfId="202"/><cellStyle name="Incorreto 2 2" xfId="203"/><cellStyle name="Incorreto 2 3" xfId="204"/><cellStyle name="Incorreto 3" xfId="205"/><cellStyle name="Incorreto 3 2" xfId="206"/><cellStyle name="Incorreto 3 3" xfId="207"/><cellStyle name="Incorreto 4" xfId="208"/><cellStyle name="Moeda" xfId="401" builtinId="4"/><cellStyle name="Moeda 2" xfId="209"/><cellStyle name="Neutra 2" xfId="210"/><cellStyle name="Neutra 2 2" xfId="211"/><cellStyle name="Neutra 2 3" xfId="212"/><cellStyle name="Neutra 3" xfId="213"/><cellStyle name="Neutra 3 2" xfId="214"/><cellStyle name="Neutra 3 3" xfId="215"/><cellStyle name="Neutra 4" xfId="216"/><cellStyle name="Normal" xfId="0" builtinId="0"/><cellStyle name="Normal 10" xfId="394"/><cellStyle name="Normal 11" xfId="392"/><cellStyle name="Normal 12" xfId="398"/><cellStyle name="Normal 14" xfId="3"/><cellStyle name="Normal 2" xfId="217"/><cellStyle name="Normal 2 10" xfId="2"/><cellStyle name="Normal 2 11" xfId="218"/><cellStyle name="Normal 2 12" xfId="219"/><cellStyle name="Normal 2 13" xfId="220"/><cellStyle name="Normal 2 14" xfId="221"/><cellStyle name="Normal 2 15" xfId="222"/><cellStyle name="Normal 2 16" xfId="223"/><cellStyle name="Normal 2 17" xfId="224"/><cellStyle name="Normal 2 2" xfId="1"/><cellStyle name="Normal 2 2 2" xfId="225"/><cellStyle name="Normal 2 3" xfId="226"/><cellStyle name="Normal 2 4" xfId="227"/><cellStyle name="Normal 2 5" xfId="228"/><cellStyle name="Normal 2 6" xfId="229"/><cellStyle name="Normal 2 7" xfId="230"/><cellStyle name="Normal 2 7 2" xfId="231"/><cellStyle name="Normal 2 8" xfId="232"/><cellStyle name="Normal 2 8 2" xfId="233"/><cellStyle name="Normal 2 9" xfId="234"/><cellStyle name="Normal 20" xfId="235"/><cellStyle name="Normal 20 2" xfId="236"/><cellStyle name="Normal 3" xfId="237"/><cellStyle name="Normal 3 10" xfId="238"/><cellStyle name="Normal 3 11" xfId="239"/><cellStyle name="Normal 3 12" xfId="240"/><cellStyle name="Normal 3 13" xfId="241"/><cellStyle name="Normal 3 14" xfId="242"/><cellStyle name="Normal 3 15" xfId="243"/><cellStyle name="Normal 3 16" xfId="244"/><cellStyle name="Normal 3 17" xfId="245"/><cellStyle name="Normal 3 2" xfId="246"/><cellStyle name="Normal 3 2 2" xfId="247"/><cellStyle name="Normal 3 2 3" xfId="248"/><cellStyle name="Normal 3 2 4" xfId="249"/><cellStyle name="Normal 3 3" xfId="250"/><cellStyle name="Normal 3 3 2" xfId="251"/><cellStyle name="Normal 3 4" xfId="252"/><cellStyle name="Normal 3 5" xfId="253"/><cellStyle name="Normal 3 6" xfId="254"/><cellStyle name="Normal 3 7" xfId="255"/><cellStyle name="Normal 3 8" xfId="256"/><cellStyle name="Normal 3 9" xfId="257"/><cellStyle name="Normal 4" xfId="258"/><cellStyle name="Normal 4 10" xfId="259"/><cellStyle name="Normal 4 11" xfId="260"/><cellStyle name="Normal 4 12" xfId="261"/><cellStyle name="Normal 4 13" xfId="262"/><cellStyle name="Normal 4 14" xfId="263"/><cellStyle name="Normal 4 15" xfId="264"/><cellStyle name="Normal 4 16" xfId="265"/><cellStyle name="Normal 4 2" xfId="266"/><cellStyle name="Normal 4 3" xfId="267"/><cellStyle name="Normal 4 4" xfId="268"/><cellStyle name="Normal 4 5" xfId="269"/><cellStyle name="Normal 4 6" xfId="270"/><cellStyle name="Normal 4 7" xfId="271"/><cellStyle name="Normal 4 8" xfId="272"/><cellStyle name="Normal 4 9" xfId="273"/><cellStyle name="Normal 5" xfId="274"/><cellStyle name="Normal 5 10" xfId="275"/><cellStyle name="Normal 5 11" xfId="276"/><cellStyle name="Normal 5 12" xfId="277"/><cellStyle name="Normal 5 13" xfId="278"/><cellStyle name="Normal 5 14" xfId="279"/><cellStyle name="Normal 5 15" xfId="280"/><cellStyle name="Normal 5 16" xfId="281"/><cellStyle name="Normal 5 2" xfId="282"/><cellStyle name="Normal 5 3" xfId="283"/><cellStyle name="Normal 5 4" xfId="284"/><cellStyle name="Normal 5 5" xfId="285"/><cellStyle name="Normal 5 6" xfId="286"/><cellStyle name="Normal 5 7" xfId="287"/><cellStyle name="Normal 5 8" xfId="288"/><cellStyle name="Normal 5 9" xfId="289"/><cellStyle name="Normal 6" xfId="290"/><cellStyle name="Normal 6 10" xfId="291"/><cellStyle name="Normal 6 11" xfId="292"/><cellStyle name="Normal 6 12" xfId="293"/><cellStyle name="Normal 6 13" xfId="294"/><cellStyle name="Normal 6 14" xfId="295"/><cellStyle name="Normal 6 15" xfId="296"/><cellStyle name="Normal 6 16" xfId="297"/><cellStyle name="Normal 6 2" xfId="298"/><cellStyle name="Normal 6 3" xfId="299"/><cellStyle name="Normal 6 4" xfId="300"/><cellStyle name="Normal 6 5" xfId="301"/><cellStyle name="Normal 6 6" xfId="302"/><cellStyle name="Normal 6 7" xfId="303"/><cellStyle name="Normal 6 8" xfId="304"/><cellStyle name="Normal 6 9" xfId="305"/><cellStyle name="Normal 7" xfId="306"/><cellStyle name="Normal 8" xfId="307"/><cellStyle name="Normal 9" xfId="308"/><cellStyle name="Nota 2" xfId="309"/><cellStyle name="Nota 2 2" xfId="310"/><cellStyle name="Nota 2 3" xfId="311"/><cellStyle name="Nota 2 4" xfId="312"/><cellStyle name="Nota 3" xfId="313"/><cellStyle name="Nota 3 2" xfId="314"/><cellStyle name="Nota 3 3" xfId="315"/><cellStyle name="Nota 4" xfId="316"/><cellStyle name="Porcentagem" xfId="395" builtinId="5"/><cellStyle name="Porcentagem 10" xfId="317"/><cellStyle name="Porcentagem 10 2" xfId="318"/><cellStyle name="Porcentagem 11 2" xfId="397"/><cellStyle name="Porcentagem 2" xfId="4"/><cellStyle name="Porcentagem 2 2" xfId="319"/><cellStyle name="Porcentagem 2 2 2" xfId="320"/><cellStyle name="Porcentagem 2 3" xfId="321"/><cellStyle name="Porcentagem 2 3 2" xfId="322"/><cellStyle name="Porcentagem 2 3 2 2" xfId="323"/><cellStyle name="Porcentagem 2 4" xfId="324"/><cellStyle name="Porcentagem 2 4 2" xfId="325"/><cellStyle name="Porcentagem 2 5" xfId="326"/><cellStyle name="Porcentagem 3" xfId="327"/><cellStyle name="Saída 2" xfId="328"/><cellStyle name="Saída 2 2" xfId="329"/><cellStyle name="Saída 2 3" xfId="330"/><cellStyle name="Saída 3" xfId="331"/><cellStyle name="Saída 3 2" xfId="332"/><cellStyle name="Saída 3 3" xfId="333"/><cellStyle name="Saída 4" xfId="334"/><cellStyle name="Separador de milhares 10" xfId="335"/><cellStyle name="Separador de milhares 2" xfId="336"/><cellStyle name="Separador de milhares 2 2" xfId="337"/><cellStyle name="Separador de milhares 2 2 2" xfId="338"/><cellStyle name="Separador de milhares 2 3" xfId="339"/><cellStyle name="Separador de milhares 2 3 2" xfId="340"/><cellStyle name="Separador de milhares 2 3 2 2" xfId="341"/><cellStyle name="Separador de milhares 2 4" xfId="342"/><cellStyle name="Separador de milhares 2 4 2" xfId="343"/><cellStyle name="Separador de milhares 3" xfId="344"/><cellStyle name="Separador de milhares 3 2" xfId="345"/><cellStyle name="Separador de milhares 3 2 2" xfId="346"/><cellStyle name="Separador de milhares 3 2 3" xfId="347"/><cellStyle name="Separador de milhares 3 3" xfId="348"/><cellStyle name="Separador de milhares 3 3 2" xfId="349"/><cellStyle name="Separador de milhares 3 4" xfId="350"/><cellStyle name="Texto de Aviso 2" xfId="351"/><cellStyle name="Texto Explicativo 2" xfId="352"/><cellStyle name="Título 1 2" xfId="353"/><cellStyle name="Título 1 2 2" xfId="354"/><cellStyle name="Título 1 2 3" xfId="355"/><cellStyle name="Título 1 3" xfId="356"/><cellStyle name="Título 1 3 2" xfId="357"/><cellStyle name="Título 1 3 3" xfId="358"/><cellStyle name="Título 1 4" xfId="359"/><cellStyle name="Título 2 2" xfId="360"/><cellStyle name="Título 2 2 2" xfId="361"/><cellStyle name="Título 2 2 3" xfId="362"/><cellStyle name="Título 2 3" xfId="363"/><cellStyle name="Título 2 3 2" xfId="364"/><cellStyle name="Título 2 3 3" xfId="365"/><cellStyle name="Título 2 4" xfId="366"/><cellStyle name="Título 3 2" xfId="367"/><cellStyle name="Título 3 2 2" xfId="368"/><cellStyle name="Título 3 2 3" xfId="369"/><cellStyle name="Título 3 3" xfId="370"/><cellStyle name="Título 3 3 2" xfId="371"/><cellStyle name="Título 3 3 3" xfId="372"/><cellStyle name="Título 3 4" xfId="373"/><cellStyle name="Título 4 2" xfId="374"/><cellStyle name="Título 5" xfId="375"/><cellStyle name="Título 5 2" xfId="376"/><cellStyle name="Título 6" xfId="377"/><cellStyle name="Título 6 2" xfId="378"/><cellStyle name="Título 6 3" xfId="379"/><cellStyle name="Título 7" xfId="380"/><cellStyle name="Título 7 2" xfId="381"/><cellStyle name="Título 7 3" xfId="382"/><cellStyle name="Total 2" xfId="383"/><cellStyle name="Total 2 2" xfId="384"/><cellStyle name="Total 2 3" xfId="385"/><cellStyle name="Total 3" xfId="386"/><cellStyle name="Total 3 2" xfId="387"/><cellStyle name="Total 3 3" xfId="388"/><cellStyle name="Total 4" xfId="389"/><cellStyle name="Vírgula 10" xfId="400"/><cellStyle name="Vírgula 2" xfId="390"/><cellStyle name="Vírgula 3" xfId="393"/><cellStyle name="Vírgula 4" xfId="391"/><cellStyle name="Vírgula 6" xfId="399"/><cellStyle name="Vírgula 7" xfId="396"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/><colors><mruColors><color rgb="FF00FF00"/></mruColors></colors><extLst><ext uri="{EB79DEF2-80B8-43e5-95BD-54CBDDF9020C}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:slicerStyles defaultSlicerStyle="SlicerStyleLight1"/></ext><ext uri="{9260A510-F301-46a8-8635-F512D64BE5F5}" xmlns:x15="http://schemas.microsoft.com/office/spreadsheetml/2010/11/main"><x15:timelineStyles defaultTimelineStyle="TimeSlicerStyleLight1"/></ext></extLst></styleSheet>`;

// Célula com valor numérico + estilo do modelo (s = índice de cellXf).
const nmS = (ref: string, v: number, s: number) =>
  `<c r="${ref}" s="${s}"><v>${numCell(v)}</v></c>`;
// Célula com fórmula + cache + estilo do modelo.
const fxS = (ref: string, formula: string, cache: number, s: number) =>
  `<c r="${ref}" s="${s}"><f>${escXml(formula)}</f><v>${numCell(cache)}</v></c>`;

function montarArquivosPlanilhaBancoHorasXlsx(
  nomeCliente: string,
  linhas: LinhaBancoHoras[],
): Record<string, string> {
  const ordenadas = ordenarPorCompetencia(linhas);
  const n = ordenadas.length;
  const linhaTotal = 14 + n; // TOTAL após os períodos (14..13+n)
  const linhaSubtotais = 15 + n;

  const esc = escXml;

  // ---------------- aba DADOS (sheet3) ----------------
  const dadosCols = `<cols><col min="1" max="1" width="12.36328125" bestFit="1" customWidth="1"/><col min="2" max="2" width="14.7265625" bestFit="1" customWidth="1"/><col min="3" max="3" width="16.36328125" bestFit="1" customWidth="1"/><col min="4" max="4" width="13.36328125" bestFit="1" customWidth="1"/><col min="5" max="5" width="14.36328125" customWidth="1"/></cols>`;
  const dadosRows: string[] = [];
  dadosRows.push(
    `<row r="1">` +
      `<c r="A1" s="124" t="inlineStr"><is><t xml:space="preserve">Código</t></is></c>` +
      `<c r="B1" s="124" t="inlineStr"><is><t xml:space="preserve">Descrição</t></is></c>` +
      `<c r="C1" s="124" t="inlineStr"><is><t xml:space="preserve">Quantidade</t></is></c>` +
      `<c r="D1" s="124" t="inlineStr"><is><t xml:space="preserve">Valor</t></is></c>` +
      `</row>`,
  );
  ordenadas.forEach((l, i) => {
    const r = 2 + i;
    const sD = i === 0 ? 126 : 127; // modelo: primeiras linhas s126, demais s127
    dadosRows.push(
      `<row r="${r}">` +
        `<c r="A${r}" s="124"><v>${CODIGO_BANCO_HORAS}</v></c>` +
        `<c r="B${r}" s="124" t="inlineStr"><is><t xml:space="preserve">Banco de Horas</t></is></c>` +
        `<c r="C${r}" s="125"><v>${numCell(l.quantidade)}</v></c>` +
        `<c r="D${r}" s="${sD}"><v>${numCell(l.valor)}</v></c>` +
        `</row>`,
    );
  });
  const dPrimeira = 2;
  const dUltima = 1 + n;
  if (n > 0) {
    const r = 2 + n;
    dadosRows.push(
      `<row r="${r}">` +
        `<c r="B${r}" s="128" t="inlineStr"><is><t xml:space="preserve">Total</t></is></c>` +
        fxS(`C${r}`, `SUM(C${dPrimeira}:C${dUltima})`, ordenadas.reduce((s, l) => s + l.quantidade, 0), 125) +
        fxS(`D${r}`, `SUM(D${dPrimeira}:D${dUltima})`, ordenadas.reduce((s, l) => s + l.valor, 0), 127) +
        `</row>`,
    );
  }
  const dadosSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${dadosCols}
<sheetData>${dadosRows.join("")}</sheetData>
</worksheet>`;

  // ---------------- aba CÁLCULO (sheet2) ----------------
  const calcCols = `<cols><col min="1" max="1" width="15.90625" bestFit="1" customWidth="1"/><col min="2" max="10" width="14.90625" hidden="1" customWidth="1"/><col min="11" max="11" width="13" hidden="1" customWidth="1"/><col min="12" max="12" width="15.90625" customWidth="1"/><col min="13" max="13" width="16.08984375" hidden="1" customWidth="1"/><col min="14" max="16" width="16.08984375" customWidth="1"/><col min="17" max="17" width="18.90625" bestFit="1" customWidth="1"/><col min="18" max="18" width="15.90625" bestFit="1" customWidth="1"/><col min="19" max="19" width="18" bestFit="1" customWidth="1"/><col min="20" max="20" width="16.453125" bestFit="1" customWidth="1"/><col min="21" max="21" width="27.6328125" bestFit="1" customWidth="1"/><col min="22" max="22" width="4.54296875" hidden="1" customWidth="1"/><col min="23" max="23" width="9.26953125" bestFit="1" customWidth="1"/><col min="24" max="24" width="18.453125" customWidth="1"/><col min="25" max="25" width="20.6328125" customWidth="1"/><col min="26" max="26" width="17.453125" customWidth="1"/><col min="27" max="27" width="16.54296875" hidden="1" customWidth="1"/><col min="28" max="28" width="16.453125" customWidth="1"/><col min="29" max="29" width="17.6328125" customWidth="1"/><col min="30" max="30" width="16.6328125" customWidth="1"/><col min="31" max="31" width="15.6328125" customWidth="1"/><col min="32" max="32" width="14.90625" customWidth="1"/><col min="33" max="33" width="12.90625" customWidth="1"/><col min="34" max="34" width="9" customWidth="1"/><col min="35" max="35" width="10.54296875" style="5" bestFit="1" customWidth="1"/><col min="36" max="37" width="9.08984375" style="5"/><col min="38" max="38" width="18.6328125" style="5" customWidth="1"/><col min="39" max="175" width="9.08984375" style="5"/></cols>`;

  const calcRows: string[] = [];
  const t = (ref: string, texto: string, s: number) =>
    `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(texto)}</t></is></c>`;

  // Cabeçalho informativo (linhas 1-9), estilos do modelo
  calcRows.push(
    `<row r="1">` + t("A1", "N° PROCESSO", 59) + `<c r="B1" s="5"/><c r="C1" s="5"/><c r="D1" s="5"/><c r="E1" s="5"/><c r="F1" s="5"/><c r="G1" s="5"/><c r="H1" s="5"/><c r="I1" s="5"/><c r="J1" s="5"/><c r="K1" s="5"/><c r="L1" s="5"/><c r="M1" s="5"/><c r="N1" s="5"/><c r="O1" s="5"/><c r="P1" s="5"/><c r="Q1" s="5"/><c r="R1" s="5"/><c r="S1" s="5"/><c r="T1" s="5"/><c r="U1" s="5"/><c r="V1" s="5"/><c r="W1" s="5"/><c r="X1" s="5"/><c r="Y1" s="5"/><c r="Z1" s="5"/><c r="AA1" s="5"/></row>` +
    `<row r="2">` + t("A2", "RECLAMANTE:", 61) + `<c r="C2" s="6" t="inlineStr"><is><t xml:space="preserve">${esc(nomeCliente)}</t></is></c><c r="D2" s="6"/><c r="E2" s="6"/><c r="F2" s="6"/><c r="G2" s="5"/><c r="H2" s="5"/><c r="I2" s="5"/><c r="J2" s="5"/><c r="K2" s="5"/><c r="L2" s="5"/><c r="M2" s="5"/><c r="N2" s="5"/><c r="O2" s="5"/><c r="P2" s="5"/><c r="Q2" s="5"/><c r="R2" s="5"/><c r="S2" s="5"/><c r="T2" s="5"/><c r="U2" s="5"/><c r="V2" s="5"/><c r="W2" s="5"/><c r="X2" s="5"/><c r="Y2" s="5"/><c r="Z2" s="5"/><c r="AA2" s="5"/></row>` +
    `<row r="3">` + t("A3", "RECLAMADA:", 59) + `<c r="C3" s="6"/><c r="D3" s="6"/><c r="E3" s="6"/><c r="F3" s="6"/><c r="G3" s="5"/><c r="H3" s="5"/><c r="I3" s="5"/><c r="J3" s="5"/><c r="K3" s="5"/><c r="L3" s="96"/><c r="M3" s="5"/><c r="N3" s="5"/><c r="O3" s="5"/><c r="P3" s="5"/><c r="Q3" s="5"/><c r="R3" s="5"/><c r="S3" s="5"/><c r="T3" s="5"/><c r="U3" s="5"/><c r="V3" s="5"/><c r="W3" s="5"/><c r="X3" s="5"/><c r="Y3" s="5"/><c r="Z3" s="5"/><c r="AA3" s="5"/></row>` +
    `<row r="5">` + t("A5", "ADMISSÃO", 61) + `<c r="C5" s="60"/><c r="D5" s="60"/><c r="E5" s="60"/><c r="F5" s="60"/><c r="G5" s="11"/><c r="H5" s="11"/><c r="I5" s="11"/><c r="J5" s="5"/><c r="K5" s="5"/><c r="L5" s="98"/><c r="M5" s="5"/><c r="N5" s="5"/><c r="O5" s="5"/><c r="P5" s="5"/><c r="Q5" s="5"/><c r="R5" s="5"/><c r="S5" s="5"/><c r="T5" s="5"/><c r="U5" s="5"/><c r="V5" s="5"/><c r="W5" s="5"/><c r="X5" s="5"/><c r="Y5" s="5"/><c r="Z5" s="5"/><c r="AA5" s="5"/></row>` +
    `<row r="6">` + t("A6", "DEMISSÃO", 61) + `<c r="C6" s="60"/><c r="D6" s="60"/><c r="E6" s="60"/><c r="F6" s="60"/><c r="G6" s="12"/><c r="H6" s="13"/><c r="I6" s="11"/><c r="J6" s="12"/><c r="K6" s="11"/><c r="L6" s="98"/><c r="M6" s="5"/><c r="N6" s="5"/><c r="O6" s="5"/><c r="P6" s="5"/><c r="Q6" s="5"/><c r="R6" s="5"/><c r="S6" s="5"/><c r="T6" s="5"/><c r="U6" s="5"/><c r="V6" s="5"/><c r="W6" s="5"/><c r="X6" s="5"/><c r="Y6" s="5"/><c r="Z6" s="5"/><c r="AA6" s="5"/></row>` +
    `<row r="7">` + t("A7", "AJUIZAMENTO", 61) + `<c r="C7" s="60"/><c r="D7" s="60"/><c r="E7" s="60"/><c r="F7" s="60"/><c r="G7" s="11"/><c r="H7" s="11"/><c r="I7" s="11"/><c r="J7" s="5"/><c r="K7" s="5"/><c r="L7" s="98"/><c r="M7" s="5"/><c r="N7" s="5"/><c r="O7" s="5"/><c r="P7" s="5"/><c r="Q7" s="5"/><c r="R7" s="5"/><c r="S7" s="5"/><c r="T7" s="5"/><c r="U7" s="5"/><c r="V7" s="5"/><c r="W7" s="5"/><c r="X7" s="5"/><c r="Y7" s="5"/><c r="Z7" s="5"/><c r="AA7" s="5"/></row>` +
    `<row r="8">` + t("A8", "ATUALIZAÇÃO", 61) + `<c r="C8" s="60"/><c r="D8" s="60"/><c r="E8" s="60"/><c r="F8" s="60"/><c r="G8" s="11"/><c r="H8" s="11"/><c r="I8" s="11"/><c r="J8" s="5"/><c r="K8" s="5"/><c r="L8" s="98"/><c r="M8" s="5"/><c r="N8" s="5"/><c r="O8" s="5"/><c r="P8" s="5"/><c r="Q8" s="5"/><c r="R8" s="5"/><c r="S8" s="5"/><c r="T8" s="5"/><c r="U8" s="5"/><c r="V8" s="5"/><c r="W8" s="5"/><c r="X8" s="5"/><c r="Y8" s="5"/><c r="Z8" s="5"/><c r="AA8" s="5"/></row>` +
    `<row r="9">` + t("A9", "PRESCRIÇÃO:", 61) + t("B9", "0108/2018", 61) + `<c r="C9" s="15"/><c r="D9" s="15"/><c r="E9" s="15"/><c r="F9" s="15"/><c r="G9" s="16"/><c r="H9" s="14"/><c r="I9" s="17"/><c r="J9" s="11"/><c r="K9" s="11"/><c r="L9" s="11"/><c r="M9" s="5"/><c r="N9" s="5"/><c r="O9" s="5"/><c r="P9" s="5"/><c r="Q9" s="5"/><c r="R9" s="5"/><c r="S9" s="5"/><c r="T9" s="5"/><c r="U9" s="5"/><c r="V9" s="5"/><c r="W9" s="5"/><c r="X9" s="5"/><c r="Y9" s="5"/><c r="Z9" s="5"/><c r="AA9" s="5"/></row>` +
    `<row r="10"><c r="A10" s="61"/><c r="B10" s="61"/></row>` +
    `<row r="11">` + `<c r="A11" s="6"/>` + `<c r="C11" s="5"/><c r="D11" s="5"/><c r="E11" s="5"/><c r="F11" s="5"/><c r="G11" s="5"/><c r="H11" s="5"/><c r="I11" s="5"/><c r="J11" s="5"/><c r="K11" s="5"/><c r="L11" s="5"/><c r="M11" s="5"/><c r="N11" s="5"/><c r="O11" s="5"/><c r="P11" s="5"/><c r="Q11" s="5"/><c r="R11" s="5"/><c r="S11" s="5"/><c r="T11" s="5"/><c r="U11" s="5"/><c r="V11" s="5"/><c r="W11" s="5"/><c r="X11" s="5"/><c r="Y11" s="5"/><c r="Z11" s="5"/><c r="AA11" s="5"/></row>`,
  );

  // Cabeçalho da tabela (linhas 12-13), merges do modelo
  const cabec12 =
    t("A12", "PERÍODO", 119) +
    t("B12", "BASE DE CÁLCULO", 113) + `<c r="C12" s="113"/>` +
    `<c r="D12" s="113"/><c r="E12" s="113"/><c r="F12" s="113"/><c r="G12" s="113"/><c r="H12" s="113"/>` +
    `<c r="I12" s="113"/><c r="J12" s="113"/>` +
    `<c r="K12" s="113"/>` +
    t("L12", "Banco de Horas (1513)", 113) +
    t("M12", "Valor Banco de Horas (1513)", 74) +
    `<c r="N12" s="113"/>` +
    t("O12", "REFLEXOS HORAS EXTRAS", 121) +
    `<c r="P12" s="122"/>` + // PLR (dentro do merge O12:U12 no modelo)
    `<c r="Q12" s="121"/><c r="R12" s="121"/><c r="S12" s="121"/><c r="T12" s="121"/><c r="U12" s="121"/>` +
    `<c r="V12" s="113"/>` +
    t("W12", "Total", 113) +
    t("X12", "CORREÇÃO MONETÁRIA", 113) +
    t("Y12", "TOTAL CORRIGIDO", 113) +
    t("Z12", "BASE INSS E IRRF", 117) +
    t("AA12", "CONT. INSS", 108) +
    `<c r="AB12" s="10"/><c r="AC12" s="10"/><c r="AD12" s="10"/><c r="AE12" s="10"/><c r="AF12" s="10"/><c r="AG12" s="10"/><c r="AH12" s="5"/>`;
  const cabec13 =
    `<c r="A13" s="120"/>` +
    t("B13", "Salário Base (0001)", 47) +
    t("C13", "AP (0201)", 47) +
    t("D13", "ATN (1061)", 47) +
    t("E13", "HRA (1062)", 47) +
    t("F13", "ARC (1059)", 47) +
    t("G13", "Comple. RMNR (0192)", 47) +
    t("H13", "ATS (0015)", 47) +
    `<c r="I13" s="47"/><c r="J13" s="47"/><c r="K13" s="47"/>` +
    t("L13", "", 47) +
    t("M13", "", 47) +
    t("N13", "", 47) +
    t("O13", "RSR Devido", 47) +
    t("P13", "RSR Pago", 47) +
    t("Q13", "RSR", 47) +
    t("R13", "13°Salário 1/12", 47) +
    t("S13", "Férias + 1/3 1/12", 47) +
    t("T13", "FGTS 8%", 47) +
    t("U13", "Grat. Férias CCT 1/12", 47) +
    `<c r="V13" s="116"/><c r="W13" s="114"/><c r="X13" s="114"/><c r="Y13" s="114"/><c r="Z13" s="118"/><c r="AA13" s="109"/><c r="AB13" s="10"/><c r="AC13" s="10"/><c r="AD13" s="10"/><c r="AE13" s="10"/><c r="AF13" s="10"/><c r="AG13" s="10"/><c r="AH13" s="5"/>`;
  calcRows.push(`<row r="12">${cabec12}</row>`);
  calcRows.push(`<row r="13">${cabec13}</row>`);

  // Linhas de período (14..13+n), estilos do modelo
  ordenadas.forEach((l, i) => {
    const r = 14 + i;
    const dadosRow = 2 + i;
    const m = l.valor;
    const q = m * 0.2;
    const r13 = (m + q) / 12;
    const ferias = (m + q) / 12 / 3 * 4;
    const fgts = (m + q + r13 + ferias) * 0.08;
    const grat = (m + q) / 12 / 3 * 2;
    const total = q + r13 + ferias + fgts + grat;
    calcRows.push(
      `<row r="${r}">` +
        nmS(`A${r}`, competenciaParaData(l.competencia), 94) +
        nmS(`B${r}`, l.base[CODIGOS_BASE_CALCULO[0]] ?? 0, 75) +
        nmS(`C${r}`, l.base[CODIGOS_BASE_CALCULO[1]] ?? 0, 75) +
        nmS(`D${r}`, l.base[CODIGOS_BASE_CALCULO[2]] ?? 0, 75) +
        nmS(`E${r}`, l.base[CODIGOS_BASE_CALCULO[3]] ?? 0, 75) +
        nmS(`F${r}`, l.base[CODIGOS_BASE_CALCULO[4]] ?? 0, 75) +
        nmS(`G${r}`, l.base[CODIGOS_BASE_CALCULO[5]] ?? 0, 75) +
        nmS(`H${r}`, l.base[CODIGOS_BASE_CALCULO[6]] ?? 0, 75) +
        fxS(`I${r}`, `SUM(B${r}:H${r})`, Object.values(l.base).reduce((s, v) => s + v, 0), 75) +
        `<c r="J${r}" s="75"/><c r="K${r}" s="75"/>` +
        `<c r="L${r}" s="77"><f>DADOS!C${dadosRow}</f><v>${numCell(l.quantidade)}</v></c>` +
        `<c r="M${r}" s="84"><f>DADOS!D${dadosRow}</f><v>${numCell(m)}</v></c>` +
        `<c r="N${r}" s="75"/>` +
        fxS(`O${r}`, `M${r}*0.2`, q, 76) +
        `<c r="P${r}" s="86"><v>0</v></c>` +
        fxS(`Q${r}`, `O${r}-P${r}`, q, 76) +
        fxS(`R${r}`, `(M${r}+Q${r})/12`, r13, 76) +
        fxS(`S${r}`, `(M${r}+Q${r})/12/3*4`, ferias, 76) +
        fxS(`T${r}`, `((M${r}+Q${r}+R${r}+S${r}))*0.08`, fgts, 76) +
        fxS(`U${r}`, `(M${r}+Q${r})/12/3*2`, grat, 76) +
        fxS(`V${r}`, `SUM(Q${r}:U${r})`, total, 76) +
        `<c r="W${r}" s="76"><v>${numCell(total)}</v></c>` +
        `<c r="X${r}" s="78"><v>1</v></c>` +
        fxS(`Y${r}`, `W${r}*X${r}`, total, 76) +
        fxS(`Z${r}`, `(Q${r}+R${r})*X${r}`, q + r13, 79) +
        `<c r="AA${r}" s="46"><v>0</v></c>` +
        `</row>`,
    );
  });

  // Linha TOTAL (estilo do modelo: A s80, B s81, Z s83, AA s72)
  if (n > 0) {
    const totCorrigido = ordenadas.reduce((s, l) => s + (l.valor * 0.2 + (l.valor + l.valor * 0.2) / 12 + (l.valor + l.valor * 0.2) / 12 / 3 * 4 + (l.valor + l.valor * 0.2 + (l.valor + l.valor * 0.2) / 12 + (l.valor + l.valor * 0.2) / 12 / 3 * 4) * 0.08 + (l.valor + l.valor * 0.2) / 12 / 3 * 2), 0);
    calcRows.push(
      `<row r="${linhaTotal}">` +
        t(`A${linhaTotal}`, "TOTAL", 80) +
        fxS(`B${linhaTotal}`, `SUM(Y14:Y${13 + n})`, totCorrigido, 81) +
        `<c r="C${linhaTotal}" s="81"/><c r="D${linhaTotal}" s="81"/><c r="E${linhaTotal}" s="81"/><c r="F${linhaTotal}" s="81"/><c r="G${linhaTotal}" s="81"/><c r="H${linhaTotal}" s="81"/><c r="I${linhaTotal}" s="81"/><c r="J${linhaTotal}" s="81"/><c r="K${linhaTotal}" s="81"/>` +
        `<c r="L${linhaTotal}" s="81"/><c r="M${linhaTotal}" s="81"/><c r="N${linhaTotal}" s="81"/>` +
        `<c r="O${linhaTotal}" s="81"/><c r="P${linhaTotal}" s="81"/><c r="Q${linhaTotal}" s="81"/><c r="R${linhaTotal}" s="81"/><c r="S${linhaTotal}" s="81"/><c r="T${linhaTotal}" s="81"/><c r="U${linhaTotal}" s="81"/>` +
        `<c r="V${linhaTotal}" s="81"/><c r="W${linhaTotal}" s="81"/><c r="X${linhaTotal}" s="81"/>` +
        fxS(`Y${linhaTotal}`, `SUM(Y14:Y${13 + n})`, totCorrigido, 81) +
        fxS(`Z${linhaTotal}`, `SUM(Z14:Z${13 + n})`, ordenadas.reduce((s, l) => s + l.valor * 0.2 + (l.valor + l.valor * 0.2) / 12, 0), 83) +
        `<c r="AA${linhaTotal}" s="72"><f>SUM(AA14:AA${13 + n})</f><v>0</v></c>` +
        `<c r="AB${linhaTotal}" s="10"/><c r="AC${linhaTotal}" s="10"/><c r="AD${linhaTotal}" s="10"/><c r="AE${linhaTotal}" s="10"/><c r="AF${linhaTotal}" s="10"/><c r="AG${linhaTotal}" s="10"/><c r="AH${linhaTotal}" s="5"/>` +
        `</row>`,
    );
  }

  // Linha de subtotais (Q,R,S,T,U)
  if (n > 0) {
    const sr = linhaSubtotais;
    const totQ = ordenadas.reduce((s, l) => s + l.valor * 0.2, 0);
    const totR13 = ordenadas.reduce((s, l) => s + (l.valor + l.valor * 0.2) / 12, 0);
    const totFer = ordenadas.reduce((s, l) => s + (l.valor + l.valor * 0.2) / 12 / 3 * 4, 0);
    const totFgts = ordenadas.reduce((s, l) => s + (l.valor + l.valor * 0.2 + (l.valor + l.valor * 0.2) / 12 + (l.valor + l.valor * 0.2) / 12 / 3 * 4) * 0.08, 0);
    const totGrat = ordenadas.reduce((s, l) => s + (l.valor + l.valor * 0.2) / 12 / 3 * 2, 0);
    calcRows.push(
      `<row r="${sr}">` +
        fxS(`A${sr}`, `SUM(Q14:Q${13 + n})`, totQ, 5) +
        `<c r="B${sr}" s="5"/><c r="C${sr}" s="5"/><c r="D${sr}" s="5"/><c r="E${sr}" s="5"/><c r="F${sr}" s="5"/><c r="G${sr}" s="5"/><c r="H${sr}" s="5"/><c r="I${sr}" s="5"/><c r="J${sr}" s="5"/><c r="K${sr}" s="5"/><c r="L${sr}" s="5"/><c r="M${sr}" s="5"/><c r="N${sr}" s="5"/>` +
        `<c r="O${sr}" s="5"/>` +
        fxS(`P${sr}`, `SUM(P14:P${13 + n})`, 0, 100) +
        fxS(`Q${sr}`, `SUM(Q14:Q${13 + n})`, totQ, 100) +
        fxS(`R${sr}`, `SUM(R14:R${13 + n})`, totR13, 100) +
        fxS(`S${sr}`, `SUM(S14:S${13 + n})`, totFer, 100) +
        fxS(`T${sr}`, `SUM(T14:T${13 + n})`, totFgts, 100) +
        fxS(`U${sr}`, `SUM(U14:U${13 + n})`, totGrat, 100) +
        `<c r="V${sr}" s="19"/><c r="W${sr}" s="19"/><c r="X${sr}" s="6"/><c r="Y${sr}" s="5"/><c r="Z${sr}" s="5"/><c r="AA${sr}" s="5"/><c r="AB${sr}" s="10"/><c r="AC${sr}" s="10"/><c r="AD${sr}" s="10"/><c r="AE${sr}" s="10"/><c r="AF${sr}" s="10"/><c r="AG${sr}" s="10"/>` +
        `</row>`,
    );
  }

  // Seção IRRF (linhas fixas 26-46), estilos e refs do modelo (apontam para a linha TOTAL dinâmica)
  const YT = `Y${linhaTotal}`;
  const ZT = `Z${linhaTotal}`;
  const AAT = `AA${linhaTotal}`;
  calcRows.push(
    `<row r="26">` + t("A26", "APURAÇÃO DO IMPOSTO DE RENDA RETIDO NA FONTE", 19) + `<c r="H26" s="19"/><c r="I26" s="19"/><c r="J26" s="19"/><c r="K26" s="19"/><c r="L26" s="19"/><c r="M26" s="19"/><c r="N26" s="10"/><c r="O26" s="10"/><c r="P26" s="10"/><c r="Q26" s="10"/><c r="R26" s="10"/><c r="S26" s="10"/><c r="T26" s="19"/><c r="U26" s="5"/><c r="V26" s="5"/><c r="W26" s="5"/><c r="X26" s="5"/><c r="Y26" s="5"/><c r="Z26" s="5"/><c r="AB26" s="10"/><c r="AC26" s="10"/><c r="AD26" s="10"/><c r="AE26" s="10"/><c r="AF26" s="10"/><c r="AG26" s="10"/></row>` +
    `<row r="27">` + t("A27", "Tabela IRRF Vigente", 19) + t("H27", "Cálculos do IRRF - Lei 7.713/88 art.12-A", 19) + `<c r="O27" s="10"/><c r="P27" s="10"/><c r="Q27" s="10"/><c r="R27" s="10"/><c r="S27" s="10"/><c r="T27" s="19"/><c r="U27" s="5"/><c r="V27" s="5"/><c r="W27" s="5"/><c r="X27" s="5"/><c r="Y27" s="5"/><c r="Z27" s="5"/></row>` +
    `<row r="28">` + t("A28", "A Partir de", 19) + t("H28", "Até", 19) + t("I28", "Percentual", 19) + t("J28", "Dedução", 19) + t("K28", "A Partir de", 19) + `<c r="O28" s="10"/><c r="P28" s="10"/><c r="Q28" s="10"/><c r="R28" s="10"/><c r="S28" s="10"/><c r="T28" s="19"/><c r="U28" s="5"/><c r="V28" s="5"/><c r="W28" s="5"/><c r="X28" s="5"/><c r="Y28" s="5"/><c r="Z28" s="5"/></row>` +
    `<row r="29">` + `<c r="A29" s="19"><v>1903.98</v></c>` + t("I29", "isento", 19) + `<c r="J29" s="19"><f>O34*H29</f><v>0</v></c>` + t("P29", "isento", 10) + t("Q29", "TOTAIS", 10) + `<c r="V29" s="50"><f>${YT}</f><v>0</v></c><c r="Y29" s="55"><f>${YT}</f><v>0</v></c><c r="Z29" s="5"/><c r="AB29" s="10"/><c r="AC29" s="10"/><c r="AD29" s="10"/><c r="AE29" s="10"/><c r="AF29" s="10"/><c r="AG29" s="10"/></row>` +
    `<row r="30">` + `<c r="A30" s="19"><v>1903.99</v></c>` + `<c r="H30" s="19"><v>2826.65</v></c>` + `<c r="I30" s="19"><v>0.075</v></c>` + `<c r="J30" s="19"><v>142.8</v></c>` + `<c r="K30" s="19"><f>O29+0.01</f><v>0.01</v></c>` + `<c r="O30" s="10"><f>H30*O34</f><v>0</v></c>` + `<c r="P30" s="10"><v>0.075</v></c>` + `<c r="Q30" s="10"><f>J30*O34</f><v>0</v></c>` + t("T30", "SELIC %", 19) + `<c r="V30" s="53"><v>0</v></c><c r="X30" s="55"><v>0</v></c><c r="Y30" s="55"><f>Y29*X30</f><v>0</v></c><c r="Z30" s="5"/><c r="AB30" s="10"/><c r="AC30" s="10"/><c r="AD30" s="10"/><c r="AE30" s="10"/><c r="AF30" s="10"/><c r="AG30" s="10"/></row>` +
    `<row r="31">` + `<c r="A31" s="19"><v>2826.66</v></c>` + `<c r="H31" s="19"><v>3751.05</v></c>` + `<c r="I31" s="19"><v>0.15</v></c>` + `<c r="J31" s="19"><v>354.8</v></c>` + `<c r="K31" s="19"><f>O30+0.01</f><v>0.01</v></c>` + `<c r="O31" s="10"><f>H31*O34</f><v>0</v></c>` + `<c r="P31" s="10"><v>0.15</v></c>` + `<c r="Q31" s="10"><f>J31*O34</f><v>0</v></c>` + t("T31", "TOTAL BRUTO", 19) + `<c r="V31" s="53"><f>Y29+Y30</f><v>0</v></c><c r="Y31" s="55"><f>Y29+Y30</f><v>0</v></c><c r="Z31" s="5"/><c r="AB31" s="10"/><c r="AC31" s="10"/><c r="AD31" s="10"/><c r="AE31" s="10"/><c r="AF31" s="10"/><c r="AG31" s="10"/></row>` +
    `<row r="32">` + `<c r="A32" s="19"><v>3751.06</v></c>` + `<c r="H32" s="19"><v>4664.68</v></c>` + `<c r="I32" s="19"><v>0.225</v></c>` + `<c r="J32" s="19"><v>636.13</v></c>` + `<c r="K32" s="19"><f>O31+0.01</f><v>0.01</v></c>` + `<c r="O32" s="10"><f>H32*O34</f><v>0</v></c>` + `<c r="P32" s="10"><v>0.225</v></c>` + `<c r="Q32" s="10"><f>J32*O34</f><v>0</v></c>` + t("T32", "DEDUÇÃO CONTRIBUIÇÃO INSS", 19) + `<c r="V32" s="53"><f>${AAT}</f><v>0</v></c><c r="Y32" s="55"><f>${AAT}</f><v>0</v></c><c r="Z32" s="5"/><c r="AB32" s="10"/><c r="AC32" s="10"/><c r="AD32" s="10"/><c r="AE32" s="10"/><c r="AF32" s="10"/><c r="AG32" s="10"/></row>` +
    `<row r="33">` + `<c r="A33" s="19"><v>4664.69</v></c>` + `<c r="H33" s="19"><v>999999</v></c>` + `<c r="I33" s="19"><v>0.275</v></c>` + `<c r="J33" s="19"><v>869.36</v></c>` + `<c r="K33" s="19"><f>O32+0.01</f><v>0.01</v></c>` + `<c r="O33" s="10"><v>0.275</v></c>` + `<c r="Q33" s="10"><f>J33*O34</f><v>0</v></c>` + t("T33", "DEDUÇÃO CONTRIBUIÇÃO IRRF", 19) + `<c r="V33" s="53"><v>0</v></c><c r="Y33" s="55"><v>0</v></c><c r="Z33" s="5"/><c r="AB33" s="10"/><c r="AC33" s="10"/><c r="AD33" s="10"/><c r="AE33" s="10"/><c r="AF33" s="10"/><c r="AG33" s="10"/></row>` +
    `<row r="34">` + t("A34", "Qnt. Meses", 19) + `<c r="O34" s="10"><v>${n}</v></c>` + t("Q34", "TOTAL LÍQUIDO", 10) + `<c r="V34" s="57"><f>Y31-Y32-Y33</f><v>0</v></c><c r="Y34" s="55"><f>Y31-Y32-Y33</f><v>0</v></c><c r="Z34" s="5"/><c r="AB34" s="10"/><c r="AC34" s="10"/><c r="AD34" s="10"/><c r="AE34" s="10"/><c r="AF34" s="10"/><c r="AG34" s="10"/></row>` +
    `<row r="35">` + t("A35", "Base IRRF", 19) + `<c r="O35" s="102"><f>${ZT}</f><v>0</v></c>` + t("P35", "IRRF", 10) + fxS("Q35", `IF(O35<=1903.98,0,IF(O35<=2826.65,O35*0.075-142.8,IF(O35<=3751.05,O35*0.15-354.8,IF(O35<=4664.68,O35*0.225-636.13,O35*0.275-869.36))))`, 0, 10) + `<c r="T35" s="19"/><c r="U35" s="5"/><c r="V35" s="5"/><c r="W35" s="5"/><c r="X35" s="5"/><c r="Y35" s="5"/><c r="Z35" s="5"/></row>` +
    `<row r="36">` + t("A36", "DÉBITO RECLAMADA", 19) + `<c r="V36" s="111"/><c r="W36" s="111"/><c r="X36" s="111"/><c r="Y36" s="112"/><c r="Z36" s="5"/><c r="AB36" s="10"/><c r="AC36" s="10"/><c r="AD36" s="10"/><c r="AE36" s="10"/><c r="AF36" s="10"/><c r="AG36" s="10"/></row>` +
    `<row r="37">` + t("A37", "BASE INSS", 19) + `<c r="V37" s="9"><f>${ZT}</f><v>0</v></c><c r="Y37" s="55"><f>${ZT}</f><v>0</v></c><c r="Z37" s="5"/><c r="AB37" s="10"/><c r="AC37" s="10"/><c r="AD37" s="10"/><c r="AE37" s="10"/><c r="AF37" s="10"/><c r="AG37" s="10"/></row>` +
    `<row r="38">` + t("A38", "CONT.IRRF", 19) + `<c r="V38" s="9"><f>Y33</f><v>0</v></c><c r="Y38" s="55"><f>Y33</f><v>0</v></c><c r="Z38" s="5"/><c r="AB38" s="10"/><c r="AC38" s="10"/><c r="AD38" s="10"/><c r="AE38" s="10"/><c r="AF38" s="10"/><c r="AG38" s="10"/></row>` +
    `<row r="39">` + t("A39", "BASE IRRF", 19) + `<c r="V39" s="9"><f>Y37-Y32</f><v>0</v></c><c r="Y39" s="55"><f>Y37-Y32</f><v>0</v></c><c r="Z39" s="5"/><c r="AB39" s="10"/><c r="AC39" s="10"/><c r="AD39" s="10"/><c r="AE39" s="10"/><c r="AF39" s="10"/><c r="AG39" s="10"/></row>` +
    `<row r="40">` + t("A40", "CONT.INSS", 19) + `<c r="V40" s="9"><f>Y32</f><v>0</v></c><c r="Y40" s="55"><f>Y32</f><v>0</v></c><c r="Z40" s="5"/><c r="AB40" s="10"/><c r="AC40" s="10"/><c r="AD40" s="10"/><c r="AE40" s="10"/><c r="AF40" s="10"/><c r="AG40" s="10"/></row>` +
    `<row r="41">` + t("A41", "INSS RECDA", 19) + `<c r="V41" s="9"><v>0.23</v></c><c r="X41" s="9"><v>0.23</v></c><c r="Y41" s="55"><f>Y37*X41</f><v>0</v></c><c r="Z41" s="5"/><c r="AB41" s="10"/><c r="AC41" s="10"/><c r="AD41" s="10"/><c r="AE41" s="10"/><c r="AF41" s="10"/><c r="AG41" s="10"/></row>` +
    `<row r="42">` + t("A42", "CUSTAS", 19) + `<c r="V42" s="9"><v>0.02</v></c><c r="X42" s="9"><v>0.02</v></c><c r="Y42" s="55"><f>Y31*X42</f><v>0</v></c><c r="Z42" s="5"/><c r="AB42" s="10"/><c r="AC42" s="10"/><c r="AD42" s="10"/><c r="AE42" s="10"/><c r="AF42" s="10"/><c r="AG42" s="10"/></row>` +
    `<row r="43">` + t("A43", "CUSTAS PAGAS", 19) + `<c r="V43" s="9"><v>0</v></c><c r="Y43" s="55"><v>0</v></c><c r="Z43" s="5"/><c r="AB43" s="10"/><c r="AC43" s="10"/><c r="AD43" s="10"/><c r="AE43" s="10"/><c r="AF43" s="10"/><c r="AG43" s="10"/></row>` +
    `<row r="44">` + t("A44", "DIF. CUSTAS DEVIDAS", 19) + `<c r="V44" s="9"><f>Y42-Y43</f><v>0</v></c><c r="Y44" s="55"><f>Y42-Y43</f><v>0</v></c><c r="Z44" s="5"/><c r="AB44" s="10"/><c r="AC44" s="10"/><c r="AD44" s="10"/><c r="AE44" s="10"/><c r="AF44" s="10"/><c r="AG44" s="10"/></row>` +
    `<row r="45">` + t("A45", "HONORÁRIOS ASSISTENCIAIS", 19) + `<c r="V45" s="87"><v>0</v></c><c r="X45" s="87"><v>0.2</v></c><c r="Y45" s="55"><f>Y31*X45</f><v>0</v></c><c r="Z45" s="5"/><c r="AB45" s="10"/><c r="AC45" s="10"/><c r="AD45" s="10"/><c r="AE45" s="10"/><c r="AF45" s="10"/><c r="AG45" s="10"/></row>` +
    `<row r="46">` + t("A46", "DÉBITO TOTAL", 5) + `<c r="V46" s="92"/><c r="X46" s="92"><f>Y45+Y44+Y41+Y31</f><v>0</v></c><c r="Z46" s="5"/><c r="AB46" s="10"/><c r="AC46" s="10"/><c r="AD46" s="10"/><c r="AE46" s="10"/><c r="AF46" s="10"/><c r="AG46" s="10"/></row>`,
  );

  const calcMerges = `<mergeCells count="13"><mergeCell ref="A12:A13"/><mergeCell ref="K12:K13"/><mergeCell ref="X12:X13"/><mergeCell ref="L12:L13"/><mergeCell ref="N12:N13"/><mergeCell ref="B12:H12"/><mergeCell ref="O12:U12"/><mergeCell ref="AA12:AA13"/><mergeCell ref="U36:Y36"/><mergeCell ref="Y12:Y13"/><mergeCell ref="W12:W13"/><mergeCell ref="V12:V13"/><mergeCell ref="Z12:Z13"/></mergeCells>`;
  const calcSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${calcCols}
<sheetData>${calcRows.join("")}</sheetData>
${calcMerges}
</worksheet>`;

  // ---------------- aba Resumo da Condenação (sheet1) ----------------
  const resumoCols = `<cols><col min="1" max="1" width="2.6328125" style="21" customWidth="1"/><col min="2" max="2" width="29.36328125" style="21" customWidth="1"/><col min="3" max="3" width="19.453125" style="21" customWidth="1"/><col min="4" max="4" width="11.90625" style="21" hidden="1" customWidth="1"/><col min="5" max="5" width="13.36328125" style="21" customWidth="1"/><col min="6" max="6" width="19.08984375" style="21" customWidth="1"/><col min="7" max="7" width="16.90625" style="21" customWidth="1"/><col min="8" max="8" width="9.08984375" style="21"/><col min="9" max="9" width="11.36328125" style="21" customWidth="1"/><col min="10" max="10" width="12.54296875" style="21" customWidth="1"/><col min="11" max="11" width="9.08984375" style="21"/><col min="12" max="12" width="9.90625" style="22" bestFit="1" customWidth="1"/><col min="13" max="13" width="10.453125" style="22" bestFit="1" customWidth="1"/><col min="14" max="14" width="12.54296875" style="22" bestFit="1" customWidth="1"/><col min="15" max="15" width="11.90625" style="22" bestFit="1" customWidth="1"/><col min="16" max="16" width="9.08984375" style="22"/><col min="17" max="16384" width="9.08984375" style="21"/></cols>`;

  const resumoRows: string[] = [];
  const rt = (ref: string, texto: string, s: number) =>
    `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(texto)}</t></is></c>`;
  resumoRows.push(
    `<row r="1">` + `<c r="B1" s="103"/><c r="C1" s="103"/><c r="D1" s="103"/><c r="E1" s="103"/><c r="F1" s="103"/></row>` +
    `<row r="2">` + `<c r="B2" s="103" t="inlineStr"><is><t xml:space="preserve">DEMONSTRATIVO DE CÁLCULO</t></is></c><c r="C2" s="103"/><c r="D2" s="103"/><c r="E2" s="103"/><c r="F2" s="103"/></row>` +
    `<row r="3">` + `<c r="B3" s="107"/><c r="C3" s="107"/><c r="D3" s="107"/><c r="E3" s="107"/><c r="F3" s="107"/></row>` +
    `<row r="6">` + rt("B6", "Descrição", 25) + rt("C6", "Valor Base", 104) + `<c r="D6" s="105"/><c r="E6" s="105"/>` + rt("F6", "Valor Total Devido", 26) + `</row>`,
  );

  const reflexosResumo: [string, string, string][] = [
    ["CÁLCULO!Q13", `CÁLCULO!Q${linhaSubtotais}`, `CÁLCULO!Q${linhaSubtotais}`],
    ["CÁLCULO!R13", `CÁLCULO!R${linhaSubtotais}`, `CÁLCULO!R${linhaSubtotais}`],
    ["CÁLCULO!S13", `CÁLCULO!S${linhaSubtotais}`, `CÁLCULO!S${linhaSubtotais}`],
    ["CÁLCULO!T13", `CÁLCULO!T${linhaSubtotais}`, `CÁLCULO!T${linhaSubtotais}`],
    ["CÁLCULO!U13", `CÁLCULO!U${linhaSubtotais}`, `CÁLCULO!U${linhaSubtotais}`],
  ];
  reflexosResumo.forEach(([rotulo, valor, f], idx) => {
    const rr = 7 + idx;
    resumoRows.push(
      `<row r="${rr}">` +
        `<c r="B${rr}" s="27" t="str"><f>${rotulo}</f><v>${rotulo.split("!")[1].replace(/\d+$/, "")}</v></c>` +
        `<c r="C${rr}" s="28"><f>${valor}</f><v>0</v></c>` +
        `<c r="D${rr}" s="28"/>` +
        `<c r="E${rr}" s="63"><f>${f}</f><v>0</v></c>` +
        `<c r="F${rr}" s="63"><f>E${rr}</f><v>0</v></c>` +
        `</row>`,
    );
  });

  resumoRows.push(
    `<row r="12"><c r="B12" s="27"/><c r="C12" s="28"/><c r="D12" s="28"/><c r="E12" s="63"/><c r="F12" s="29"/></row>` +
    `<row r="13">` + rt("B13", "Total", 32) + `<c r="C13" s="33"><f>SUM(C7:C12)</f><v>0</v></c><c r="D13" s="34"/>` + `<c r="E13" s="34"><f>SUM(E7:E12)</f><v>0</v></c>` + `<c r="F13" s="34"><f>SUM(F7:F12)</f><v>0</v></c>` + `<c r="L13" s="36"/><c r="M13" s="36"/><c r="N13" s="36"/><c r="O13" s="37"/></row>` +
    `<row r="14">` + `<c r="B14" s="65" t="str"><f>CÁLCULO!U41</f><v>INSS RECDA</v></c>` + `<c r="C14" s="70"><f>CÁLCULO!X41</f><v>0.23</v></c>` + `<c r="D14" s="70"/><c r="E14" s="70"/>` + `<c r="F14" s="66"><f>CÁLCULO!Y41</f><v>0</v></c>` + `<c r="L14" s="36"/><c r="M14" s="36"/><c r="N14" s="36"/><c r="O14" s="37"/></row>` +
    `<row r="15">` + `<c r="B15" s="65" t="str"><f>CÁLCULO!U42</f><v>CUSTAS</v></c>` + `<c r="C15" s="70"><v>0.02</v></c>` + `<c r="D15" s="70"/><c r="E15" s="70"/>` + `<c r="F15" s="66"><f>CÁLCULO!Y42</f><v>0</v></c>` + `<c r="L15" s="40"/><c r="M15" s="40"/><c r="N15" s="40"/><c r="O15" s="40"/><c r="P15" s="40"/></row>` +
    `<row r="16"><c r="B16" s="67"/><c r="C16" s="34"/><c r="D16" s="34"/><c r="E16" s="34"/><c r="F16" s="68"/></row>` +
    `<row r="17">` + rt("B17", "TOTAL DEVIDO", 38) + `<c r="C17" s="41"/><c r="D17" s="41"/><c r="E17" s="41"/>` + `<c r="F17" s="41"><f>F13+F16+F14+F15</f><v>0</v></c>` + `</row>`,
  );

  const resumoMerges = `<mergeCells count="4"><mergeCell ref="B1:F1"/><mergeCell ref="B2:F2"/><mergeCell ref="C6:E6"/><mergeCell ref="B3:F3"/></mergeCells>`;
  const resumoSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${resumoCols}
<sheetData>${resumoRows.join("")}</sheetData>
${resumoMerges}
</worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Resumo da Condenação" sheetId="1" r:id="rId1"/><sheet name="CÁLCULO" sheetId="2" r:id="rId2"/><sheet name="DADOS" sheetId="3" r:id="rId3"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  return {
    "[Content_Types].xml": contentTypes,
    "_rels/.rels": rels,
    "xl/workbook.xml": workbook,
    "xl/_rels/workbook.xml.rels": workbookRels,
    "xl/styles.xml": ESTILOS_MODELO_1513,
    "xl/worksheets/sheet1.xml": resumoSheet,
    "xl/worksheets/sheet2.xml": calcSheet,
    "xl/worksheets/sheet3.xml": dadosSheet,
  };
}

// ---------------- contracheques relacionais -> JSON de geração ----------------
// Monta o array { label, valor_hra, valor_ahra } a partir das tabelas relacionais
// (contracheques + itens_contracheque), mesmo cálculo do frontend
// (src/lib/contracheques-relacionais.ts). Independe do JSON legado casos.contracheques,
// que o fluxo de upload (process-contracheques-pdf) não atualiza.
type ContrachequeRelacional = { id: string; competencia?: string | null; arquivo_origem?: string | null };
type ItemContrachequeRelacional = {
  contracheque_id?: string | null;
  valor?: number | null;
  tipo?: string | null;
  familia_hra?: string | null;
};

// PostgREST limita cada resposta a 1.000 linhas; casos com muitos contracheques
// perdem rubricas (inclusive HRA) sem paginação explícita.
const PAGINA_ITENS = 1000;

async function buscarItensContrachequePaginado(
  client: any,
  contrachequeIds: string[],
): Promise<ItemContrachequeRelacional[]> {
  if (!contrachequeIds.length) return [];
  const todos: ItemContrachequeRelacional[] = [];
  for (let inicio = 0; ; inicio += PAGINA_ITENS) {
    const { data, error } = await client
      .from("itens_contracheque")
      .select("contracheque_id, valor, tipo, familia_hra")
      .in("contracheque_id", contrachequeIds)
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA_ITENS - 1);
    if (error) throw error;
    const pagina = data ?? [];
    todos.push(...pagina);
    if (pagina.length < PAGINA_ITENS) break;
  }
  return todos;
}

// Descontos nunca compoem a base HRA/AHRA (nem como valor negativo).
function ehProventoHra(item: ItemContrachequeRelacional): boolean {
  return (item.tipo ?? "provento") === "provento";
}

function valorProvento(item: ItemContrachequeRelacional): number {
  return Math.abs(Number(item.valor) || 0);
}

function montarContrasRelacionais(
  contracheques: ContrachequeRelacional[] | null | undefined,
  itens: ItemContrachequeRelacional[] | null | undefined,
): Array<{ id: string; label: string; valor_hra: number; valor_ahra: number }> {
  const linhas = (contracheques ?? []).map((contracheque, index) => {
    const itensDoContra = (itens ?? []).filter(
      (item) => item.contracheque_id === contracheque.id,
    );
    const valorAhra = itensDoContra
      .filter((item) => item.familia_hra === "ahra_dobra" && ehProventoHra(item))
      .reduce((total, item) => total + valorProvento(item), 0);
    const valorHra = itensDoContra
      .filter((item) => item.familia_hra && item.familia_hra !== "ahra_dobra" && ehProventoHra(item))
      .reduce((total, item) => total + valorProvento(item), 0);
    return {
      competencia: contracheque.competencia || null,
      linha: {
        id: contracheque.id,
        label:
          contracheque.competencia ||
          contracheque.arquivo_origem ||
          `Contracheque ${index + 1}`,
        valor_hra: valorHra,
        valor_ahra: valorAhra,
      },
    };
  });

  // Uma linha por competência (soma HRA/AHRA); sem competência permanece individual.
  const consolidado: Array<{ id: string; label: string; valor_hra: number; valor_ahra: number }> = [];
  const porCompetencia = new Map<string, { id: string; label: string; valor_hra: number; valor_ahra: number }>();
  for (const { competencia, linha } of linhas) {
    if (!competencia) {
      consolidado.push(linha);
      continue;
    }
    const existente = porCompetencia.get(competencia);
    if (existente) {
      existente.valor_hra += linha.valor_hra;
      existente.valor_ahra += linha.valor_ahra;
      continue;
    }
    porCompetencia.set(competencia, linha);
    consolidado.push(linha);
  }
  // Competências sem HRA/AHRA calculável (após excluir descontos) não geram linha.
  return consolidado.filter((linha) => linha.valor_hra > 0 || linha.valor_ahra > 0);
}


// ---------------- função principal ----------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const {
      caso_id,
      captador,
      oab,
      email_cliente,
      telefone_cliente,
      uf_comarca,
    } = await req.json();
    if (!caso_id) throw new Error("caso_id obrigatório");
    if (!captador?.trim()) throw new Error("captador obrigatório");
    if (!oab?.trim()) throw new Error("oab obrigatório");
    if (!email_cliente?.trim()) throw new Error("email_cliente obrigatório");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email_cliente.trim())) throw new Error("email_cliente inválido");
    if (telefone_cliente?.trim() && !/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(telefone_cliente.trim())) {
      throw new Error("telefone_cliente inválido");
    }
    if (!uf_comarca?.trim()) throw new Error("uf_comarca obrigatório");

    const { data: caso, error: cErr } = await supabase
      .from("casos")
      .select("*")
      .eq("id", caso_id)
      .single();
    if (cErr || !caso) throw new Error("Caso não encontrado");

    const escritorios: string[] = Array.isArray(caso.escritorios) ? caso.escritorios : [];
    const pecas = selecionarPecas(caso.tipo_acao, escritorios);
    const tipos = pecas.map((peca) => peca.templateTipo);

    const { data: templates, error: tErr } = await supabase
      .from("templates")
      .select("*")
      .in("tipo", tipos);
    if (tErr) throw tErr;
    if (!templates || templates.length === 0) {
      throw new Error("Nenhum template configurado. Acesse /templates para enviar os modelos .docx.");
    }

    // Fonte de verdade: tabelas relacionais (contracheques + itens_contracheque).
    // O JSON legado casos.contracheques não é atualizado pelo fluxo de upload
    // (process-contracheques-pdf), então usar as tabelas relacionais evita a
    // planilha/petição saírem vazias. O JSON legado é apenas fallback.
    const { data: contrasRel, error: ccRelErr } = await supabase
      .from("contracheques")
      .select("id, competencia, arquivo_origem")
      .eq("caso_id", caso_id)
      .order("competencia");
    if (ccRelErr) throw ccRelErr;
    const idsContrasRel = (contrasRel ?? []).map((c: ContrachequeRelacional) => c.id);
    const itensRel = await buscarItensContrachequePaginado(supabase, idsContrasRel);

    const contrasRelacionais = montarContrasRelacionais(contrasRel, itensRel);
    const contras: Array<{ id: string; label: string; valor_hra: number; valor_ahra: number }> = contrasRelacionais.length
      ? contrasRelacionais
      : Array.isArray(caso.contracheques)
        ? (caso.contracheques as Array<{ id: string; label: string; valor_hra: number; valor_ahra: number }>)
        : [];
    const linhas = contras.map((c) => {
      const hra = Number(c.valor_hra) || 0;
      const ahra = Number(c.valor_ahra) || 0;
      return {
        competencia: c.label ?? "",
        hra: fmtBRL(hra),
        ahra: fmtBRL(ahra),
        subtotal: fmtBRL(hra + ahra),
        ir: fmtBRL((hra + ahra) * ALIQUOTA),
      };
    });
    const totalCalculado = contras.reduce(
      (s, c) => s + ((Number(c.valor_hra) || 0) + (Number(c.valor_ahra) || 0)) * ALIQUOTA,
      0,
    );
    const casoComValor = {
      ...caso,
      valor_causa: caso.valor_causa ?? totalCalculado,
      captador: captador.trim(),
      oab: oab.trim(),
      email_cliente: email_cliente.trim(),
      telefone_cliente: (telefone_cliente ?? "").trim(),
      uf_comarca: uf_comarca.trim(),
    };
    const data: Record<string, unknown> = { ...montarVariaveisCaso(casoComValor), linhas };

    const faltantes = tipos.filter((t) => !templates.some((tp: any) => tp.tipo === t));
    if (faltantes.length > 0) {
      throw new Error(`Templates obrigatórios ausentes: ${faltantes.join(", ")}`);
    }
    const generated: { tipo: string; storage_path: string; nome: string }[] = [];

    for (const tpl of templates) {
      const peca = pecas.find((item) => item.templateTipo === tpl.tipo);
      if (!peca) continue;
      const { data: blob, error: dlErr } = await supabase.storage
        .from("templates")
        .download(tpl.storage_path);
      if (dlErr || !blob) {
        console.error("Falha ao baixar template", tpl.tipo, dlErr);
        throw new Error(`Falha ao baixar o template obrigatório: ${tpl.tipo}`);
      }
      const buf = new Uint8Array(await blob.arrayBuffer());
      const zip = new PizZip(buf);
      if (peca.tipoSaida === "contrato") garantirMarcadorNumeroContrato(zip);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{", end: "}" },
        // Variável desconhecida vira string vazia — NUNCA "undefined" numa peça.
        nullGetter: () => "",
      });
      doc.render(data);
      const out: Uint8Array = doc.getZip().generate({ type: "uint8array" });

      const safeName = `${peca.tipoSaida}-${(caso.numero_pasta || caso.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_")}.docx`;
      const path = `${caso.id}/${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("casos-documentos")
        .upload(path, out, {
          upsert: true,
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
      if (upErr) throw upErr;
      generated.push({ tipo: peca.tipoSaida, storage_path: path, nome: safeName });
    }

    // Planilha de cálculo: .xlsx com fórmulas (sempre, sem template).
    {
      const linhasXlsx: LinhaPlanilha[] = contras.map((c: any) => ({
        competencia: c.label ?? "",
        hra: Number(c.valor_hra) || 0,
        ahra: Number(c.valor_ahra) || 0,
      }));
      const partes = montarArquivosPlanilhaXlsx(caso.nome_cliente ?? "", linhasXlsx);
      const zipPl = new PizZip();
      for (const [caminho, conteudo] of Object.entries(partes)) zipPl.file(caminho, conteudo);
      const outPl: Uint8Array = zipPl.generate({ type: "uint8array" });
      // Nome de exibição/download no padrão solicitado; a chave do Storage
      // permanece sanitizada (convenção de src/lib/storage.ts).
      const nomePl = `PLANILHA — ${caso.nome_cliente ?? ""} — IR SOBRE HRA.xlsx`;
      const chavePl = `planilha-${(caso.numero_pasta || caso.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;
      const pathPl = `${caso.id}/${chavePl}`;
      const { error: upPlErr } = await supabase.storage
        .from("casos-documentos")
        .upload(pathPl, outPl, {
          upsert: true,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      if (upPlErr) throw upPlErr;
      generated.push({ tipo: "planilha", storage_path: pathPl, nome: nomePl });
    }

    // Planilha Banco de Horas (1513): somente quando houver ocorrências do
    // código 1513 nas rubricas relacionais extraídas dos contracheques do caso.
    {
      const { data: contrachequesRows, error: ccErr } = await supabase
        .from("contracheques")
        .select("id, competencia")
        .eq("caso_id", caso_id);
      if (ccErr) throw ccErr;
      const idsContracheques = (contrachequesRows ?? []).map((row) => row.id);
      const { data: itensRows, error: itErr } = idsContracheques.length
        ? await supabase
            .from("itens_contracheque")
            .select("contracheque_id, codigo, valor, referencia")
            .in("contracheque_id", idsContracheques)
            .in("codigo", [CODIGO_BANCO_HORAS, ...CODIGOS_BASE_CALCULO])
        : { data: [], error: null };
      if (itErr) throw itErr;

      const linhasBH = agregarBancoHorasPorCompetencia(contrachequesRows, itensRows);
      if (linhasBH.length > 0) {
        const partesBH = montarArquivosPlanilhaBancoHorasXlsx(caso.nome_cliente ?? "", linhasBH);
        const zipBH = new PizZip();
        for (const [caminho, conteudo] of Object.entries(partesBH)) zipBH.file(caminho, conteudo);
        const outBH: Uint8Array = zipBH.generate({ type: "uint8array" });
        const nomeBH = `planilha-banco-horas-1513-${(caso.numero_pasta || caso.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;
        const pathBH = `${caso.id}/${nomeBH}`;
        const { error: upBHErr } = await supabase.storage
          .from("casos-documentos")
          .upload(pathBH, outBH, {
            upsert: true,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
        if (upBHErr) throw upBHErr;
        generated.push({ tipo: "planilha_codigos", storage_path: pathBH, nome: nomeBH });
      }
    }

    // PDF unificado de contracheques: anexa ao pacote o arquivo já unificado
    // na criação do caso (bucket casos-arquivos), copiando para casos-documentos.
    {
      const { data: arquivosUnificados, error: arqErr } = await supabase
        .from("arquivos")
        .select("storage_path")
        .eq("caso_id", caso_id)
        .eq("tipo", "contracheque")
        .eq("nome", "contracheques-unificados.pdf")
        .order("created_at", { ascending: false })
        .limit(1);
      if (arqErr) throw arqErr;

      const arquivoUnificado = arquivosUnificados?.[0];
      if (arquivoUnificado) {
        const { data: blob, error: dlErr } = await supabase.storage
          .from("casos-arquivos")
          .download(arquivoUnificado.storage_path);
        if (dlErr || !blob) throw new Error("Falha ao baixar o PDF unificado de contracheques");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const nomeUni = `contracheques-unificados-${(caso.numero_pasta || caso.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
        const pathUni = `${caso.id}/${nomeUni}`;
        const { error: upUniErr } = await supabase.storage
          .from("casos-documentos")
          .upload(pathUni, bytes, { upsert: true, contentType: "application/pdf" });
        if (upUniErr) throw upUniErr;
        generated.push({ tipo: "contracheques_unificados", storage_path: pathUni, nome: nomeUni });
      }
    }

    if (generated.length === 0) throw new Error("Nenhum documento foi gerado.");

    await supabase
      .from("casos")
      .update({ documentos_gerados: generated, status: "concluido" })
      .eq("id", caso_id);

    return new Response(
      JSON.stringify({ ok: true, generated, faltantes: [...new Set(faltantes)] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    console.error("generate-documents error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});