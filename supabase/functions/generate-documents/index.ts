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

function montarVariaveisCaso(caso: any, hoje: Date = new Date()): Record<string, string> {
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
const nm = (ref: string, v: number, estilo = 0) =>
  `<c r="${ref}"${estilo ? ` s="${estilo}"` : ""}><v>${numCell(v)}</v></c>`;
const fx = (ref: string, formula: string, cache: number, estilo = 0) =>
  `<c r="${ref}"${estilo ? ` s="${estilo}"` : ""}><f>${escXml(formula)}</f><v>${numCell(cache)}</v></c>`;

function montarArquivosPlanilhaXlsx(nomeCliente: string, linhas: LinhaPlanilha[]): Record<string, string> {
  // Solicitação validada: linhas em ordem cronológica crescente e sem a coluna
  // SUBTOTAL; VALOR (HISTÓRICO) passa a referenciar HRA+AHRA diretamente.
  const ordenadas = ordenarPorCompetencia(linhas);
  const rows: string[] = [];
  rows.push(
    `<row r="1"><c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">${escXml(`PLANILHA — ${nomeCliente} — IR SOBRE HRA`)}</t></is></c></row>`,
  );
  rows.push(
    `<row r="2">${["P. A.", "HRA", "AHRA", "ALÍQ. IR", "VALOR (HISTÓRICO)"]
      .map((t, i) => tx(`${"ABCDE"[i]}2`, t, 1))
      .join("")}</row>`,
  );

  let r = 3;
  for (const l of ordenadas) {
    const sub = l.hra + l.ahra;
    rows.push(
      `<row r="${r}">` +
        tx(`A${r}`, l.competencia) +
        nm(`B${r}`, l.hra, 2) +
        nm(`C${r}`, l.ahra, 2) +
        tx(`D${r}`, "27,50%") +
        fx(`E${r}`, `ROUND((B${r}+C${r})*0.275,2)`, Math.round(sub * 0.275 * 100) / 100, 2) +
        `</row>`,
    );
    r++;
  }

  const primeira = 3;
  const ultima = r - 1;
  if (ordenadas.length > 0) {
    rows.push(
      `<row r="${r}">` +
        tx(`A${r}`, "TOTAL", 1) +
        fx(`B${r}`, `SUM(B${primeira}:B${ultima})`, ordenadas.reduce((s, l) => s + l.hra, 0), 3) +
        fx(`C${r}`, `SUM(C${primeira}:C${ultima})`, ordenadas.reduce((s, l) => s + l.ahra, 0), 3) +
        tx(`D${r}`, "VALOR (HISTÓRICO)", 1) +
        fx(
          `E${r}`,
          `SUM(E${primeira}:E${ultima})`,
          ordenadas.reduce((s, l) => s + Math.round((l.hra + l.ahra) * 0.275 * 100) / 100, 0),
          3,
        ) +
        `</row>`,
    );
  }

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="5" width="16" customWidth="1"/></cols>
<sheetData>${rows.join("")}</sheetData>
</worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
</styleSheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="IR sobre HRA" sheetId="1" r:id="rId1"/></sheets>
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

// ---------------- planilha de códigos monitorados (1513/6050) ----------------
// Mesma estrutura da planilha IR/HRA; gerada somente quando há ocorrências
// desses códigos nas rubricas relacionais do caso.
const CODIGOS_PLANILHA = ["1513", "6050"] as const;

type LinhaPlanilhaCodigos = { competencia: string; total1513: number; total6050: number };
type ContrachequeParaCodigos = { id: string; competencia?: string | null };
type ItemParaCodigos = {
  contracheque_id?: string | null;
  codigo?: string | null;
  valor?: number | null;
};

function agregarCodigosPorCompetencia(
  contracheques: ContrachequeParaCodigos[] | null | undefined,
  itens: ItemParaCodigos[] | null | undefined,
): LinhaPlanilhaCodigos[] {
  const competenciaPorId = new Map(
    (contracheques ?? []).map((c) => [c.id, c.competencia ?? ""]),
  );
  const porCompetencia = new Map<string, LinhaPlanilhaCodigos>();

  for (const item of itens ?? []) {
    const codigo = (item.codigo ?? "").trim();
    if (codigo !== CODIGOS_PLANILHA[0] && codigo !== CODIGOS_PLANILHA[1]) continue;
    const competencia = competenciaPorId.get(item.contracheque_id ?? "") ?? "";
    const linha = porCompetencia.get(competencia) ?? { competencia, total1513: 0, total6050: 0 };
    if (codigo === CODIGOS_PLANILHA[0]) linha.total1513 += Number(item.valor) || 0;
    else linha.total6050 += Number(item.valor) || 0;
    porCompetencia.set(competencia, linha);
  }

  return ordenarPorCompetencia([...porCompetencia.values()]);
}

function montarArquivosPlanilhaCodigosXlsx(
  nomeCliente: string,
  linhas: LinhaPlanilhaCodigos[],
): Record<string, string> {
  const ordenadas = ordenarPorCompetencia(linhas);
  const rows: string[] = [];
  rows.push(
    `<row r="1"><c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">${escXml(`PLANILHA — ${nomeCliente} — CÓDIGOS 1513/6050`)}</t></is></c></row>`,
  );
  rows.push(
    `<row r="2">${["P. A.", "1513", "6050", "TOTAL"]
      .map((t, i) => tx(`${"ABCD"[i]}2`, t, 1))
      .join("")}</row>`,
  );

  let r = 3;
  for (const l of ordenadas) {
    rows.push(
      `<row r="${r}">` +
        tx(`A${r}`, l.competencia) +
        nm(`B${r}`, l.total1513, 2) +
        nm(`C${r}`, l.total6050, 2) +
        fx(`D${r}`, `B${r}+C${r}`, l.total1513 + l.total6050, 2) +
        `</row>`,
    );
    r++;
  }

  const primeira = 3;
  const ultima = r - 1;
  if (ordenadas.length > 0) {
    rows.push(
      `<row r="${r}">` +
        tx(`A${r}`, "TOTAL", 1) +
        fx(`B${r}`, `SUM(B${primeira}:B${ultima})`, ordenadas.reduce((s, l) => s + l.total1513, 0), 3) +
        fx(`C${r}`, `SUM(C${primeira}:C${ultima})`, ordenadas.reduce((s, l) => s + l.total6050, 0), 3) +
        fx(
          `D${r}`,
          `SUM(D${primeira}:D${ultima})`,
          ordenadas.reduce((s, l) => s + l.total1513 + l.total6050, 0),
          3,
        ) +
        `</row>`,
    );
  }

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="4" width="16" customWidth="1"/></cols>
<sheetData>${rows.join("")}</sheetData>
</worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
</styleSheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Códigos 1513-6050" sheetId="1" r:id="rId1"/></sheets>
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
    if (!telefone_cliente?.trim()) throw new Error("telefone_cliente obrigatório");
    if (!/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(telefone_cliente.trim())) throw new Error("telefone_cliente inválido");
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

    const contras: any[] = Array.isArray(caso.contracheques) ? caso.contracheques : [];
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
      telefone_cliente: telefone_cliente.trim(),
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

    // Planilha de códigos 1513/6050: somente quando houver ocorrências nas
    // rubricas relacionais extraídas dos contracheques do caso.
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
            .select("contracheque_id, codigo, valor")
            .in("contracheque_id", idsContracheques)
            .in("codigo", [...CODIGOS_PLANILHA])
        : { data: [], error: null };
      if (itErr) throw itErr;

      const linhasCodigos = agregarCodigosPorCompetencia(contrachequesRows, itensRows);
      if (linhasCodigos.length > 0) {
        const partesCod = montarArquivosPlanilhaCodigosXlsx(caso.nome_cliente ?? "", linhasCodigos);
        const zipCod = new PizZip();
        for (const [caminho, conteudo] of Object.entries(partesCod)) zipCod.file(caminho, conteudo);
        const outCod: Uint8Array = zipCod.generate({ type: "uint8array" });
        const nomeCod = `planilha-codigos-1513-6050-${(caso.numero_pasta || caso.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;
        const pathCod = `${caso.id}/${nomeCod}`;
        const { error: upCodErr } = await supabase.storage
          .from("casos-documentos")
          .upload(pathCod, outCod, {
            upsert: true,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
        if (upCodErr) throw upCodErr;
        generated.push({ tipo: "planilha_codigos", storage_path: pathCod, nome: nomeCod });
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
