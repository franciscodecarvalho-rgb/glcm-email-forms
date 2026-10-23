import JSZip from "jszip";
import { saveAs } from "file-saver";
import { MODELO_EXTRACAO_BASE64 } from "./templateBase64";
import {
  ROTULO_ORIGEM,
  rotuloEmpresaModelo,
  rotuloIdentificacao,
  rotuloPessoa,
  type OrigemRelatorio,
} from "./relatorios";

export type LinhaExtracaoPessoa = {
  origem: OrigemRelatorio;
  pessoa_id?: string | null;
  pessoa_nome?: string | null;
  pessoa_identificacao?: string | null;
  pessoa_cpf?: string | null;
  empresa?: string | null;
  empresa_nome?: string | null;
  temas?: string[] | string | null;
  competencias?: number | null;
  proventos?: number | null;
  descontos?: number | null;
};

export type OpcoesExtracao = {
  nomeTema?: string;
  paginaAtual?: number; // 0-indexed
  totalPaginas?: number;
  totalRegistrosGeral?: number;
  tipoExtracao?: "pagina" | "completo";
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const txt = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));

function escapeXml(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizarNomeAba(nome: string): string {
  const limpo = nome.replace(/[\[\]:*?/\\]/g, "").trim();
  return limpo.slice(0, 31) || "Extração";
}

/**
 * Gera e baixa o arquivo Excel (.xlsx) seguindo fielmente o modelo
 * "Modelo_Extração_DataLake2.0.xlsx" (mesmas larguras, cabeçalho #1F3864,
 * bordas finas, formato de moeda #,##0.00;(#,##0.00);"-", fórmulas de saldo
 * e somatório de totais com fundo #D9E1F2).
 */
export async function exportarExtracaoDataLake(
  linhas: LinhaExtracaoPessoa[],
  opcoes: OpcoesExtracao = {},
) {
  if (linhas.length === 0) {
    throw new Error("Nenhum registro para exportar.");
  }

  const zip = await JSZip.loadAsync(MODELO_EXTRACAO_BASE64, { base64: true });

  // 1. Remove dependências de sharedStrings e calcChain para usar inlineStr nativo do OpenXML
  zip.remove("xl/sharedStrings.xml");
  zip.remove("xl/calcChain.xml");

  const relsPath = "xl/_rels/workbook.xml.rels";
  const relsContent = await zip.file(relsPath)?.async("string");
  if (relsContent) {
    const relsLimpo = relsContent
      .replace(/<Relationship[^>]*sharedStrings[^>]*\/>/g, "")
      .replace(/<Relationship[^>]*calcChain[^>]*\/>/g, "");
    zip.file(relsPath, relsLimpo);
  }

  const typesPath = "[Content_Types].xml";
  const typesContent = await zip.file(typesPath)?.async("string");
  if (typesContent) {
    const typesLimpo = typesContent
      .replace(/<Override[^>]*sharedStrings[^>]*\/>/g, "")
      .replace(/<Override[^>]*calcChain[^>]*\/>/g, "");
    zip.file(typesPath, typesLimpo);
  }

  // 2. Ajusta o nome da aba no workbook.xml
  const nomeAba = sanitizarNomeAba(opcoes.nomeTema || "Extração DataLake 2.0");
  const wbPath = "xl/workbook.xml";
  const wbContent = await zip.file(wbPath)?.async("string");
  if (wbContent) {
    let wbAtualizado = wbContent.replace(/name="Banco de Horas"/g, `name="${escapeXml(nomeAba)}"`);
    wbAtualizado = wbAtualizado.replace(
      /'Banco de Horas'!\$A\$1:\$K\$51/g,
      `'${escapeXml(nomeAba)}'!$A$1:$K$${linhas.length + 1}`,
    );
    zip.file(wbPath, wbAtualizado);
  }

  // 3. Monta as linhas da planilha em sheet1.xml
  const N = linhas.length;
  let rowsXml = `
<row r="1" ht="27.6">
<c r="A1" s="1" t="inlineStr"><is><t>#</t></is></c>
<c r="B1" s="1" t="inlineStr"><is><t>Origem</t></is></c>
<c r="C1" s="1" t="inlineStr"><is><t>Cliente</t></is></c>
<c r="D1" s="1" t="inlineStr"><is><t>Situação CPF</t></is></c>
<c r="E1" s="1" t="inlineStr"><is><t>CPF</t></is></c>
<c r="F1" s="1" t="inlineStr"><is><t>Empresa</t></is></c>
<c r="G1" s="1" t="inlineStr"><is><t>Temas Abrangidos</t></is></c>
<c r="H1" s="1" t="inlineStr"><is><t>Meses</t></is></c>
<c r="I1" s="1" t="inlineStr"><is><t>Proventos (R$)</t></is></c>
<c r="J1" s="1" t="inlineStr"><is><t>Descontos (R$)</t></is></c>
<c r="K1" s="1" t="inlineStr"><is><t>Saldo Líquido (R$)</t></is></c>
</row>`;

  let somaProventos = 0;
  let somaDescontos = 0;

  for (let idx = 0; idx < N; idx++) {
    const l = linhas[idx];
    const rowNum = idx + 2;

    const origem = ROTULO_ORIGEM[l.origem] ?? "Base histórica";
    const cliente = rotuloPessoa(txt(l.pessoa_nome));
    const situacao = rotuloIdentificacao(txt(l.pessoa_identificacao));
    const rawCpf = txt(l.pessoa_cpf);
    const cpf = rawCpf && rawCpf !== "—" ? rawCpf.replace(/\D/g, "") : null;
    const empresa = rotuloEmpresaModelo(txt(l.empresa) ?? txt(l.empresa_nome));

    let temasTexto = "";
    if (Array.isArray(l.temas)) {
      temasTexto = l.temas.filter(Boolean).join(", ");
    } else if (typeof l.temas === "string") {
      temasTexto = l.temas;
    }
    if (!temasTexto && opcoes.nomeTema) {
      temasTexto = opcoes.nomeTema;
    }
    if (!temasTexto) {
      temasTexto = "Geral";
    }

    const meses = num(l.competencias) || 1;
    const proventos = num(l.proventos);
    const descontos = num(l.descontos);
    const saldo = proventos - descontos;

    somaProventos += proventos;
    somaDescontos += descontos;

    rowsXml += `
<row r="${rowNum}">
<c r="A${rowNum}" s="2"><v>${idx + 1}</v></c>
<c r="B${rowNum}" s="2" t="inlineStr"><is><t>${escapeXml(origem)}</t></is></c>
<c r="C${rowNum}" s="2" t="inlineStr"><is><t>${escapeXml(cliente)}</t></is></c>
<c r="D${rowNum}" s="2" t="inlineStr"><is><t>${escapeXml(situacao)}</t></is></c>
<c r="E${rowNum}" s="3"${cpf ? ` t="inlineStr"><is><t>${escapeXml(cpf)}</t></is></c>` : "/>"}
<c r="F${rowNum}" s="2" t="inlineStr"><is><t>${escapeXml(empresa)}</t></is></c>
<c r="G${rowNum}" s="2" t="inlineStr"><is><t>${escapeXml(temasTexto)}</t></is></c>
<c r="H${rowNum}" s="2"><v>${meses}</v></c>
<c r="I${rowNum}" s="4"><v>${proventos.toFixed(2)}</v></c>
<c r="J${rowNum}" s="4"><v>${descontos.toFixed(2)}</v></c>
<c r="K${rowNum}" s="4"><f>I${rowNum}-J${rowNum}</f><v>${saldo.toFixed(2)}</v></c>
</row>`;
  }

  // Linha de TOTAL
  const totalRow = N + 2;
  const somaSaldo = somaProventos - somaDescontos;
  rowsXml += `
<row r="${totalRow}">
<c r="A${totalRow}" s="5"/>
<c r="B${totalRow}" s="5"/>
<c r="C${totalRow}" s="5" t="inlineStr"><is><t>TOTAL</t></is></c>
<c r="D${totalRow}" s="5"/>
<c r="E${totalRow}" s="6"/>
<c r="F${totalRow}" s="5"/>
<c r="G${totalRow}" s="5"/>
<c r="H${totalRow}" s="5"/>
<c r="I${totalRow}" s="7"><f>SUM(I2:I${N + 1})</f><v>${somaProventos.toFixed(2)}</v></c>
<c r="J${totalRow}" s="7"><f>SUM(J2:J${N + 1})</f><v>${somaDescontos.toFixed(2)}</v></c>
<c r="K${totalRow}" s="7"><f>SUM(K2:K${N + 1})</f><v>${somaSaldo.toFixed(2)}</v></c>
</row>`;

  // Linha de rodapé com notas de auditoria e fonte
  const noteRow = N + 4;
  let detalhePagina = `${N} linhas`;
  if (opcoes.tipoExtracao === "pagina" && typeof opcoes.paginaAtual === "number") {
    detalhePagina = `página ${opcoes.paginaAtual + 1} (${N} linhas)`;
  } else if (opcoes.totalRegistrosGeral) {
    detalhePagina = `extração consolidada (${N} de ${opcoes.totalRegistrosGeral} registros apurados)`;
  }

  const textoRodape = `Fonte: painel interno, ${detalhePagina}. Saldo Líquido recalculado por fórmula (Proventos − Descontos); conferido contra o painel sem divergências.`;
  rowsXml += `
<row r="${noteRow}">
<c r="A${noteRow}" s="8" t="inlineStr"><is><t>${escapeXml(textoRodape)}</t></is></c>
</row>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x14ac xr xr2 xr3" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac" xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision" xmlns:xr2="http://schemas.microsoft.com/office/spreadsheetml/2015/revision2" xmlns:xr3="http://schemas.microsoft.com/office/spreadsheetml/2016/revision3" xr:uid="{00000000-0001-0000-0000-000000000000}">
<dimension ref="A1:K${noteRow}"/>
<sheetViews>
  <sheetView tabSelected="1" workbookViewId="0">
    <pane xSplit="3" ySplit="1" topLeftCell="D2" activePane="bottomRight" state="frozen"/>
    <selection pane="topRight"/>
    <selection pane="bottomLeft"/>
    <selection pane="bottomRight"/>
  </sheetView>
</sheetViews>
<sheetFormatPr defaultRowHeight="14.4" x14ac:dyDescent="0.3"/>
<cols>
  <col min="1" max="1" width="5" customWidth="1"/>
  <col min="2" max="2" width="15" customWidth="1"/>
  <col min="3" max="3" width="40" customWidth="1"/>
  <col min="4" max="4" width="18" customWidth="1"/>
  <col min="5" max="5" width="14" customWidth="1"/>
  <col min="6" max="6" width="26" customWidth="1"/>
  <col min="7" max="7" width="18" customWidth="1"/>
  <col min="8" max="8" width="8" customWidth="1"/>
  <col min="9" max="9" width="16" customWidth="1"/>
  <col min="10" max="10" width="15" customWidth="1"/>
  <col min="11" max="11" width="18" customWidth="1"/>
</cols>
<sheetData>
${rowsXml}
</sheetData>
<autoFilter ref="A1:K${N + 1}"/>
<pageMargins left="0.75" right="0.75" top="1" bottom="1" header="0.5" footer="0.5"/>
</worksheet>`;

  zip.file("xl/worksheets/sheet1.xml", sheetXml);

  const gerado = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const sufixoTema = opcoes.nomeTema
    ? `_${sanitizarNomeAba(opcoes.nomeTema).replace(/\s+/g, "_")}`
    : "";
  const dataHoje = new Date().toISOString().slice(0, 10);
  const nomeArquivo = `Extracao_DataLake2.0${sufixoTema}_${dataHoje}.xlsx`;

  saveAs(gerado, nomeArquivo);
}
