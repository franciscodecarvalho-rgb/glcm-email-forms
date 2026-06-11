// Converte os modelos .docx do escritório (placeholders [RÓTULO], blocos
// "Opção A/B") em 8 templates prontos para o generate-documents (placeholders
// {VAR} do docxtemplater, um arquivo por peça/escritório).
//
// Uso:  node scripts/converter-templates.mjs <pasta-modelos> <pasta-saida>
// Valida cada template renderizando com dados de exemplo (caso Ruan).

import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const [, , SRC = "templates-fonte", OUT = "templates-convertidos"] = process.argv;
fs.mkdirSync(OUT, { recursive: true });

// ---------- substituições de placeholder (aplicadas no XML bruto) ----------
const MAPA = [
  ["[NOME COMPLETO DO CLIENTE]", "{NOME_CLIENTE}"],
  ["[NACIONALIDADE]", "{NACIONALIDADE}"],
  ["[ESTADO CIVIL]", "{ESTADO_CIVIL}"],
  ["[PROFISSÃO]", "{PROFISSAO}"],
  ["[CPF]", "{CPF}"],
  ["[ENDEREÇO COMPLETO, Nº, COMPLEMENTO, BAIRRO, CIDADE/UF, CEP]", "{ENDERECO_COMPLETO}"],
  ["[ENDEREÇO COMPLETO, Nº, COMPLEMENTO, BAIRRO, CEP, CIDADE/UF]", "{ENDERECO_COMPLETO}"],
  ["[ENDEREÇO DA PROCURADORIA DA FAZENDA NACIONAL DA COMARCA]", "{ENDERECO_PFN}"],
  ["[CIDADE/UF]", "{CIDADE_UF}"],
  ["[VALOR DA CAUSA]", "{VALOR_CAUSA}"],
  ["[VALOR POR EXTENSO]", "{VALOR_CAUSA_EXTENSO}"],
  ["[Nº DO CONTRATO]", "{NUMERO_CONTRATO}"],
  ["[CIDADE]", "{LOCAL_ASSINATURA}"],
  ["[DATA]", "{DATA}"],
  ["[ANO]", "{ANO}"],
  ["[E-MAIL]", "{EMAIL_CLIENTE}"],
  ["[TELEFONE]", "{TELEFONE_CLIENTE}"],
  // honorários: o modelo traz 15% fixo; vira variável
  ["15% (quinze por cento)", "{HONORARIOS_PCT}% ({HONORARIOS_EXTENSO} por cento)"],
];

// ---------- helpers de parágrafo ----------
const PARA_RE = /<w:p\b[\s\S]*?<\/w:p>/g;

function textoDoParagrafo(pXml) {
  const ts = [...pXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
  return ts
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

// Remove parágrafos por predicado sobre o texto (instruções, blocos A/B).
function filtrarParagrafos(xml, decidir) {
  const paras = [...xml.matchAll(PARA_RE)];
  let out = xml;
  // percorre de trás pra frente pra não invalidar índices
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i];
    const texto = textoDoParagrafo(p[0]);
    if (!decidir(texto, i)) {
      out = out.slice(0, p.index) + out.slice(p.index + p[0].length);
    }
  }
  return out;
}

// Decide quais parágrafos ficam segundo o bloco A/B escolhido.
function aplicarBloco(xml, manter /* 'A' | 'B' */, fimBlocoB /* regex */) {
  const paras = [...xml.matchAll(PARA_RE)].map((m) => ({ xml: m[0], texto: textoDoParagrafo(m[0]) }));
  const iA = paras.findIndex((p) => /OPÇÃO A/.test(p.texto));
  const iB = paras.findIndex((p) => /OPÇÃO B/.test(p.texto));
  let iFim = paras.findIndex((p, idx) => idx > iB && fimBlocoB.test(p.texto));
  if (iFim === -1) iFim = paras.length;
  if (iA === -1 || iB === -1) throw new Error("blocos OPÇÃO A/B não encontrados");

  return filtrarParagrafos(xml, (texto, i) => {
    if (i === iA || i === iB) return false; // marcadores saem sempre
    if (manter === "A" && i > iB && i < iFim) return false; // descarta bloco B
    if (manter === "B" && i > iA && i < iB) return false; // descarta bloco A
    return true;
  });
}

function aplicarMapa(xml) {
  let out = xml;
  for (const [de, para] of MAPA) out = out.split(de).join(para);
  return out;
}

function carregar(nome) {
  const zip = new PizZip(fs.readFileSync(path.join(SRC, nome)));
  return zip;
}

function salvar(zip, xml, destino) {
  zip.file("word/document.xml", xml);
  fs.writeFileSync(path.join(OUT, destino), zip.generate({ type: "nodebuffer" }));
}

// ---------- planilha: template gerado do zero (tabela com loop) ----------
function gerarPlanilhaTemplate() {
  const cell = (t, bold = false) =>
    `<w:tc><w:tcPr><w:tcW w:w="1700" w:type="dxa"/></w:tcPr><w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${t}</w:t></w:r></w:p></w:tc>`;
  const row = (cells) => `<w:tr>${cells.join("")}</w:tr>`;

  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">PLANILHA — {NOME_CLIENTE} — IR SOBRE HRA</w:t></w:r></w:p>
<w:p/>
<w:tbl>
<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>
${row([cell("P. A.", true), cell("HRA", true), cell("AHRA", true), cell("SUBTOTAL", true), cell("ALÍQ. IR", true), cell("VALOR (HISTÓRICO)", true)])}
${row([cell("{#linhas}{competencia}"), cell("{hra}"), cell("{ahra}"), cell("{subtotal}"), cell("27,50%"), cell("{ir}{/linhas}")])}
${row([cell("", false), cell("", false), cell("", false), cell("", false), cell("VALOR (HISTÓRICO)", true), cell("{VALOR_CAUSA}", true)])}
</w:tbl>
<w:p/>
<w:p><w:r><w:t xml:space="preserve">Observações: alíquota padrão de 27,50%. Valores históricos, antes da correção pela Selic.</w:t></w:r></w:p>
<w:sectPr/>
</w:body>
</w:document>`;

  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file("word/document.xml", doc);
  fs.writeFileSync(path.join(OUT, "planilha.docx"), zip.generate({ type: "nodebuffer" }));
}

// ---------- definição das 8 peças ----------
const INSTRUCOES = [
  /^Preencha os campos/i,
  /^Preencha os dados/i,
  /^Escolha o bloco/i,
  /^Modelo de petição/i,
  /^Modelo de planilha/i,
];
const ehInstrucao = (t) => INSTRUCOES.some((re) => re.test(t));

const PECAS = [
  { saida: "peticao.docx", fonte: "MODELO - Peticao Inicial (IR sobre HRA - Tema 306).docx" },
  { saida: "contrato.docx", fonte: "MODELO - Contrato de Prestacao de Servicos.docx" },
  { saida: "procuracao_glcm.docx", fonte: "MODELO - Procuracao.docx", bloco: "A", fim: /^PODERES/ },
  { saida: "procuracao_polkowski.docx", fonte: "MODELO - Procuracao.docx", bloco: "B", fim: /^PODERES/ },
  { saida: "termo_lgpd_glcm.docx", fonte: "MODELO - Termo de Consentimento LGPD.docx", bloco: "A", fim: /^\{?LOCAL|^\[CIDADE\]/ },
  { saida: "termo_lgpd_polkowski.docx", fonte: "MODELO - Termo de Consentimento LGPD.docx", bloco: "B", fim: /^\{?LOCAL|^\[CIDADE\]/ },
  { saida: "termo_renuncia.docx", fonte: "MODELO - Termo de Renuncia.docx" },
];

// ---------- dados de exemplo p/ validação (caso Ruan) ----------
const DADOS_TESTE = {
  NOME_CLIENTE: "RUAN VIEIRA D ECA",
  NACIONALIDADE: "brasileiro",
  ESTADO_CIVIL: "solteiro",
  PROFISSAO: "industriário",
  CPF: "059.538.337-84",
  RG: "214655763",
  ENDERECO_COMPLETO: "Rua Alvilandia, nº 120, Bangu, Rio de Janeiro/RJ, CEP 21860-340",
  ENDERECO_PFN: "[preencher endereço da PFN da comarca]",
  CIDADE_UF: "Rio de Janeiro/RJ",
  VALOR_CAUSA: "R$ 36.650,81",
  VALOR_CAUSA_EXTENSO: "trinta e seis mil, seiscentos e cinquenta reais e oitenta e um centavos",
  NUMERO_CONTRATO: "4199",
  LOCAL_ASSINATURA: "Salvador/BA",
  DATA: "18/04/2026",
  ANO: "2026",
  EMAIL_CLIENTE: "",
  TELEFONE_CLIENTE: "",
  HONORARIOS_PCT: "20",
  HONORARIOS_EXTENSO: "vinte",
  linhas: [
    { competencia: "01/2021", hra: "R$ 1.612,88", ahra: "R$ 53,76", subtotal: "R$ 1.666,64", ir: "R$ 458,33" },
    { competencia: "02/2021", hra: "R$ 1.612,88", ahra: "R$ 0,00", subtotal: "R$ 1.612,88", ir: "R$ 443,54" },
  ],
};

function validar(arquivo) {
  const zip = new PizZip(fs.readFileSync(path.join(OUT, arquivo)));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });
  doc.render(DADOS_TESTE);
  const texto = doc.getFullText();
  const sobras = texto.match(/\{[A-Z_#/]+\}/g);
  if (sobras) throw new Error(`placeholders não resolvidos: ${sobras.join(", ")}`);
  return texto.length;
}

// ---------- execução ----------
let ok = 0;
for (const peca of PECAS) {
  const zip = carregar(peca.fonte);
  let xml = zip.file("word/document.xml").asText();
  if (peca.bloco) xml = aplicarBloco(xml, peca.bloco, peca.fim);
  xml = filtrarParagrafos(xml, (t) => !ehInstrucao(t));
  xml = aplicarMapa(xml);
  salvar(zip, xml, peca.saida);
  const chars = validar(peca.saida);
  console.log(`✓ ${peca.saida}  (${chars} chars renderizados)`);
  ok++;
}
gerarPlanilhaTemplate();
const charsPl = validar("planilha.docx");
console.log(`✓ planilha.docx  (${charsPl} chars renderizados)`);
ok++;

console.log(`\n${ok}/8 templates gerados e validados em ${OUT}/`);
