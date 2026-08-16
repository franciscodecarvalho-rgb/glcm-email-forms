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

// Peças com template .docx; a planilha é gerada à parte (xlsx, sem template).
const PECAS_BASE = ["peticao", "contrato", "termo_renuncia"];
const PECAS_GLCM = ["procuracao_glcm", "termo_lgpd_glcm"];
const PECAS_POLKOWSKI = ["procuracao_polkowski", "termo_lgpd_polkowski"];

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
    EMAIL_CLIENTE: "",
    TELEFONE_CLIENTE: "",
  };
}

// ---------------- planilha xlsx (espelho de _shared/planilha-xlsx.ts) ----------------
type LinhaPlanilha = { competencia: string; hra: number; ahra: number };

const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const numCell = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const tx = (ref: string, t: string, estilo = 0) =>
  `<c r="${ref}" t="inlineStr"${estilo ? ` s="${estilo}"` : ""}><is><t xml:space="preserve">${escXml(t)}</t></is></c>`;
const nm = (ref: string, v: number, estilo = 0) =>
  `<c r="${ref}"${estilo ? ` s="${estilo}"` : ""}><v>${numCell(v)}</v></c>`;
const fx = (ref: string, formula: string, cache: number, estilo = 0) =>
  `<c r="${ref}"${estilo ? ` s="${estilo}"` : ""}><f>${escXml(formula)}</f><v>${numCell(cache)}</v></c>`;

function montarArquivosPlanilhaXlsx(nomeCliente: string, linhas: LinhaPlanilha[]): Record<string, string> {
  const rows: string[] = [];
  rows.push(
    `<row r="1"><c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">${escXml(`PLANILHA — ${nomeCliente} — IR SOBRE HRA`)}</t></is></c></row>`,
  );
  rows.push(
    `<row r="2">${["P. A.", "HRA", "AHRA", "SUBTOTAL", "ALÍQ. IR", "VALOR (HISTÓRICO)"]
      .map((t, i) => tx(`${"ABCDEF"[i]}2`, t, 1))
      .join("")}</row>`,
  );

  let r = 3;
  for (const l of linhas) {
    const sub = l.hra + l.ahra;
    rows.push(
      `<row r="${r}">` +
        tx(`A${r}`, l.competencia) +
        nm(`B${r}`, l.hra, 2) +
        nm(`C${r}`, l.ahra, 2) +
        fx(`D${r}`, `B${r}+C${r}`, sub, 2) +
        tx(`E${r}`, "27,50%") +
        fx(`F${r}`, `ROUND(D${r}*0.275,2)`, Math.round(sub * 0.275 * 100) / 100, 2) +
        `</row>`,
    );
    r++;
  }

  const primeira = 3;
  const ultima = r - 1;
  if (linhas.length > 0) {
    rows.push(
      `<row r="${r}">` +
        tx(`A${r}`, "TOTAL", 1) +
        fx(`B${r}`, `SUM(B${primeira}:B${ultima})`, linhas.reduce((s, l) => s + l.hra, 0), 3) +
        fx(`C${r}`, `SUM(C${primeira}:C${ultima})`, linhas.reduce((s, l) => s + l.ahra, 0), 3) +
        fx(`D${r}`, `SUM(D${primeira}:D${ultima})`, linhas.reduce((s, l) => s + l.hra + l.ahra, 0), 3) +
        tx(`E${r}`, "VALOR (HISTÓRICO)", 1) +
        fx(
          `F${r}`,
          `SUM(F${primeira}:F${ultima})`,
          linhas.reduce((s, l) => s + Math.round((l.hra + l.ahra) * 0.275 * 100) / 100, 0),
          3,
        ) +
        `</row>`,
    );
  }

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="6" width="16" customWidth="1"/></cols>
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

// ---------------- função principal ----------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { caso_id } = await req.json();
    if (!caso_id) throw new Error("caso_id obrigatório");

    const { data: caso, error: cErr } = await supabase
      .from("casos")
      .select("*")
      .eq("id", caso_id)
      .single();
    if (cErr || !caso) throw new Error("Caso não encontrado");

    const escritorios: string[] = Array.isArray(caso.escritorios) ? caso.escritorios : [];
    const tipos = [...PECAS_BASE];
    if (escritorios.length === 0 || escritorios.includes("glcm")) tipos.push(...PECAS_GLCM);
    if (escritorios.length === 0 || escritorios.includes("polkowski")) tipos.push(...PECAS_POLKOWSKI);

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
    const casoComValor = { ...caso, valor_causa: caso.valor_causa ?? totalCalculado };
    const data: Record<string, unknown> = { ...montarVariaveisCaso(casoComValor), linhas };

    const faltantes = tipos.filter((t) => !templates.some((tp: any) => tp.tipo === t));
    const generated: { tipo: string; storage_path: string; nome: string }[] = [];

    for (const tpl of templates) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("templates")
        .download(tpl.storage_path);
      if (dlErr || !blob) {
        console.error("Falha ao baixar template", tpl.tipo, dlErr);
        faltantes.push(tpl.tipo);
        continue;
      }
      const buf = new Uint8Array(await blob.arrayBuffer());
      const zip = new PizZip(buf);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{", end: "}" },
        // Variável desconhecida vira string vazia — NUNCA "undefined" numa peça.
        nullGetter: () => "",
      });
      doc.render(data);
      const out: Uint8Array = doc.getZip().generate({ type: "uint8array" });

      const safeName = `${tpl.tipo}-${(caso.numero_pasta || caso.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_")}.docx`;
      const path = `${caso.id}/${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("casos-documentos")
        .upload(path, out, {
          upsert: true,
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
      if (upErr) throw upErr;
      generated.push({ tipo: tpl.tipo, storage_path: path, nome: safeName });
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
      const nomePl = `planilha-${(caso.numero_pasta || caso.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;
      const pathPl = `${caso.id}/${nomePl}`;
      const { error: upPlErr } = await supabase.storage
        .from("casos-documentos")
        .upload(pathPl, outPl, {
          upsert: true,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      if (upPlErr) throw upPlErr;
      generated.push({ tipo: "planilha", storage_path: pathPl, nome: nomePl });
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
