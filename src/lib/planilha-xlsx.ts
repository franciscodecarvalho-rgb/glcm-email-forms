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

export function ordenarPorCompetencia<T extends { competencia: string }>(linhas: T[]): T[] {
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
  // Layout TEMA 306 (HRA): aba "TEMA 306", título mesclado A1:E1, grade com
  // bordas e totais destacados. Fórmulas inalteradas (E = ROUND((B+C)*0.275,2)).
  // Nota: os formatos de número no XML usam ponto decimal/vírgula de milhar
  // (padrão OOXML); o Excel pt-BR exibe 1.943,53 e 27,50%.
  const ordenadas = ordenarPorCompetencia(linhas);
  const rows: string[] = [];
  rows.push(
    `<row r="1">` +
      tx("A1", `PLANILHA — ${nomeCliente} — TEMA 306 (HRA)`, 1) +
      `<c r="B1" s="2"/><c r="C1" s="2"/><c r="D1" s="2"/><c r="E1" s="3"/>` +
      `</row>`,
  );
  rows.push(
    `<row r="2" ht="18" customHeight="1">${["P. A.", "HRA", "AHRA", "ALÍQ. IR", "VALOR (HISTÓRICO)"]
      .map((t, i) => tx(`${"ABCDE"[i]}2`, t, 4))
      .join("")}</row>`,
  );

  let r = 3;
  for (const l of ordenadas) {
    const sub = l.hra + l.ahra;
    rows.push(
      `<row r="${r}">` +
        tx(`A${r}`, l.competencia, 5) +
        nm(`B${r}`, l.hra, 6) +
        nm(`C${r}`, l.ahra, 6) +
        `<c r="D${r}" s="7"><v>0.275</v></c>` +
        fx(`E${r}`, `ROUND((B${r}+C${r})*0.275,2)`, Math.round(sub * 0.275 * 100) / 100, 6) +
        `</row>`,
    );
    r++;
  }

  const primeira = 3;
  const ultima = r - 1;
  if (ordenadas.length > 0) {
    rows.push(
      `<row r="${r}">` +
        tx(`A${r}`, "TOTAL", 8) +
        fx(`B${r}`, `SUM(B${primeira}:B${ultima})`, ordenadas.reduce((s, l) => s + l.hra, 0), 9) +
        fx(`C${r}`, `SUM(C${primeira}:C${ultima})`, ordenadas.reduce((s, l) => s + l.ahra, 0), 9) +
        tx(`D${r}`, "VALOR (HISTÓRICO)", 10) +
        fx(
          `E${r}`,
          `SUM(E${primeira}:E${ultima})`,
          ordenadas.reduce((s, l) => s + Math.round((l.hra + l.ahra) * 0.275 * 100) / 100, 0),
          9,
        ) +
        `</row>`,
    );
  }

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="15" customWidth="1"/><col min="2" max="4" width="18" customWidth="1"/><col min="5" max="5" width="22" customWidth="1"/></cols>
<sheetData>${rows.join("")}</sheetData>
<mergeCells count="1"><mergeCell ref="A1:E1"/></mergeCells>
</worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/></numFmts>
<fonts count="4"><font><sz val="10"/><color rgb="FF000000"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FF000000"/><name val="Arial"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2B5B84"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="6"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border><border><left style="thick"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thick"><color indexed="64"/></top><bottom style="thick"><color indexed="64"/></bottom><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thick"><color indexed="64"/></top><bottom style="thick"><color indexed="64"/></bottom><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thick"><color indexed="64"/></right><top style="thick"><color indexed="64"/></top><bottom style="thick"><color indexed="64"/></bottom><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thick"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="4" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="5" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="164" fontId="3" fillId="4" borderId="5" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="5" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
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

// ---------------- planilha de códigos monitorados (1513/6050) ----------------
// Mesma estrutura da planilha IR/HRA; gerada somente quando há ocorrências
// desses códigos nas rubricas relacionais do caso.
export const CODIGOS_PLANILHA = ["1513", "6050"] as const;

export type LinhaPlanilhaCodigos = { competencia: string; total1513: number; total6050: number };
export type ContrachequeParaCodigos = { id: string; competencia?: string | null };
export type ItemParaCodigos = {
  contracheque_id?: string | null;
  codigo?: string | null;
  valor?: number | null;
};

export function agregarCodigosPorCompetencia(
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

export function montarArquivosPlanilhaCodigosXlsx(
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
