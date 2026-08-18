// Construtor da planilha de cálculo (.xlsx com fórmulas vivas, sem template).
// Fonte canônica testada; a Edge Function generate-documents mantém uma cópia
// inline (deploy de arquivo único). Ao alterar aqui, sincronizar a cópia.

export type LinhaPlanilha = { competencia: string; hra: number; ahra: number };

// Competência normalizada como MM/AAAA; rótulos fora desse padrão (ex.: legado
// "Contracheque 1") vão para o fim, preservando a ordem relativa.
function chaveCompetencia(competencia: string): [number, number] | null {
  const m = competencia.match(/(0[1-9]|1[0-2])\/(20\d{2})/);
  return m ? [Number(m[2]), Number(m[1])] : null;
}

export function ordenarPorCompetencia(linhas: LinhaPlanilha[]): LinhaPlanilha[] {
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

export function montarArquivosPlanilhaXlsx(nomeCliente: string, linhas: LinhaPlanilha[]): Record<string, string> {
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
