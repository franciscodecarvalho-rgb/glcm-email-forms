import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getDocumentProxy } from "npm:unpdf@1.4.0";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TextItem = { str: string; x: number; y: number; width: number; height: number };
type Tipo = "provento" | "desconto" | "informativo";
type Contra = {
  competencia: string | null;
  modelo_origem: string;
  total_proventos: number | null;
  total_descontos: number | null;
  liquido: number | null;
  itens: { codigo: string; descricao: string; referencia: number | null; valor: number; tipo: Tipo; familia_hra: string | null }[];
};
type Linha = { y: number; itens: TextItem[]; texto: string };

const CODIGO = /^\/?[A-Z0-9]{3,6}$/i;
const VALOR = /^-?(?:R\$)?\s*\d{1,3}(?:\.\d{3})*,\d{2}$|^-?(?:R\$)?\s*\d+,\d{2}$/i;
const MESES: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const moeda = (s: string) => Number(s.replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".")) || 0;

async function extrairItensPorPagina(pdf: Awaited<ReturnType<typeof getDocumentProxy>>) {
  const paginas: TextItem[][] = [];
  for (let numero = 1; numero <= pdf.numPages; numero++) {
    const pagina = await pdf.getPage(numero);
    const conteudo = await pagina.getTextContent();
    paginas.push(conteudo.items.flatMap((item) => {
      if (!("str" in item) || !("transform" in item)) return [];
      return [{
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
      }];
    }));
    pagina.cleanup();
  }
  return paginas;
}

function expandir(itens: TextItem[]) {
  return itens.flatMap((item) => {
    const partes = item.str.trim().split(/\s+/);
    if (partes.length <= 1) return [item];
    const total = partes.reduce((s, p) => s + p.length, 0) + partes.length - 1;
    let x = item.x;
    return partes.map((str) => {
      const width = item.width * str.length / total;
      const novo = { ...item, str, x, width };
      x += width + item.width / total;
      return novo;
    });
  });
}

function linhas(itens: TextItem[]): Linha[] {
  const out: Linha[] = [];
  for (const item of expandir(itens).sort((a, b) => b.y - a.y || a.x - b.x)) {
    if (!item.str.trim()) continue;
    const linha = out.find((l) => Math.abs(l.y - item.y) <= Math.max(2.5, item.height * 0.35));
    if (linha) linha.itens.push(item);
    else out.push({ y: item.y, itens: [item], texto: "" });
  }
  return out.sort((a, b) => b.y - a.y).map((l) => {
    l.itens.sort((a, b) => a.x - b.x);
    l.texto = l.itens.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
    return l;
  });
}

function modelo(texto: string) {
  const n = norm(texto);
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

function competencia(texto: string) {
  const n = norm(texto);
  const m = n.match(/(?:mes\/ano|competencia|referencia)?\s*[:-]?\s*(0[1-9]|1[0-2])\s*[/.-]\s*(20\d{2})/i);
  if (m) return `${m[1]}/${m[2]}`;
  for (const [nome, numero] of Object.entries(MESES)) {
    const separado = n.match(new RegExp(`\\b${nome}[/.-](20\\d{2})\\b`));
    if (separado) return `${numero}/${separado[1]}`;
    const a = n.match(new RegExp(`\\b${nome}\\s+(20\\d{2})\\b`));
    if (a) return `${numero}/${a[1]}`;
    const b = n.match(new RegExp(`\\d{1,2}[/-]${nome}[/-](20\\d{2})`));
    if (b) return `${numero}/${b[1]}`;
  }
  return null;
}

function familia(descricao: string) {
  const n = norm(descricao);
  if (!/hra/.test(n)) return null;
  if (/\bdif/.test(n) || /\bdi\b/.test(n)) return "dif_ahra";
  if (/dobra/.test(n)) return "ahra_dobra";
  if (/adic/.test(n)) return "adicional_hra";
  return /ahra/.test(n) ? "ahra" : "hra";
}

function parsePagina(itens: TextItem[], largura: number): Contra {
  const modeloPagina = modelo(itens.map((i) => i.str).join(" "));
  const larguraLeitura = modeloPagina === "termo_bahia" ? largura / 2 : largura;
  const itensLeitura = modeloPagina === "termo_bahia" ? itens.filter((i) => i.x < larguraLeitura) : itens;
  const ls = linhas(itensLeitura);
  const texto = ls.map((l) => l.texto).join("\n");
  const modelo_origem = modelo(texto);
  const header = ls.find((l) => {
    const n = norm(l.texto);
    return (/descricao/.test(n) && /provent|venciment|valor/.test(n)) || (/venciment/.test(n) && /descont/.test(n));
  });
  const x = (r: RegExp) => header?.itens.find((i) => r.test(norm(i.str)))?.x ?? null;
  const xdesc = x(/descricao/);
  const xp = x(/provent|venciment|valor/);
  const xd = x(/descont/);
  const xr = x(/referencia|quant|qtde/);
  let secao: Tipo = "provento";
  let info = false;
  let total_proventos: number | null = null;
  let total_descontos: number | null = null;
  let liquido: number | null = null;
  const rubricas: Contra["itens"] = [];
  const valores = (l: Linha) => l.itens.filter((i) => VALOR.test(i.str.trim()));

  for (const l of ls) {
    const n = norm(l.texto);
    const vs = valores(l);
    if (/base\s*\/\s*outros|custo\s+empresa.*informativo/.test(n)) info = true;
    if (/total(?:\s+de)?\s+(?:proventos|vencimentos)/.test(n)) {
      total_proventos = vs[0] ? moeda(vs[0].str) : null;
      secao = "desconto";
      continue;
    }
    if (/total(?:\s+de)?\s+descontos/.test(n)) {
      total_descontos = vs[0] ? moeda(vs[0].str) : null;
      continue;
    }
    if (/\btotais?\b/.test(n) && vs.length >= 2) {
      total_proventos ??= moeda(vs[0].str);
      total_descontos ??= moeda(vs[1].str);
      liquido ??= vs[2] ? moeda(vs[2].str) : null;
    }
    if (/valor\s+liquido|liquido\s+creditado|total\s+liquido/.test(n) && vs.length) {
      liquido = moeda(vs[vs.length - 1].str);
    }
    const cod = modelo_origem === "elekeiroz"
      ? undefined
      : l.itens.find((i) => i.x < larguraLeitura * 0.22 && CODIGO.test(i.str.trim()));
    if (!cod && modelo_origem !== "elekeiroz") continue;
    const candidatos = vs.filter((i) => i.x > larguraLeitura * 0.28);
    if (!candidatos.length) continue;
    const vi = candidatos[candidatos.length - 1];
    const inicio = xdesc ?? (cod ? cod.x + cod.width : 0);
    const limite = [xr, xp, xd, larguraLeitura * 0.82]
      .filter((v): v is number => v != null && v > inicio)
      .sort((a, b) => a - b)[0];
    const descricao = l.itens
      .filter((i) => i.x >= inicio - larguraLeitura * 0.01 && i.x < limite && i.str !== "|")
      .map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
    if (!descricao) continue;
    const fimRef = [xdesc, xp, xd, larguraLeitura]
      .filter((v): v is number => v != null && xr != null && v > xr)
      .sort((a, b) => a - b)[0] ?? larguraLeitura;
    const ri = xr == null ? null : l.itens.find((i) => i.x >= xr - larguraLeitura * 0.025 && i.x < fimRef);
    const rs = ri?.str.trim() ?? "";
    const referencia = /^\d+(?:[.,]\d+)?$/.test(rs)
      ? (rs.includes(",") ? Number(rs.replace(/\./g, "").replace(",", ".")) : Number(rs))
      : null;
    const tipo: Tipo = info
      ? "informativo"
      : modelo_origem === "petrobras" || modelo_origem === "unigel"
        ? secao
        : modelo_origem === "elekeiroz"
          ? (vi.x >= larguraLeitura * 0.78 ? "desconto" : "provento")
          : (xd != null && Math.abs(vi.x - xd) < Math.abs(vi.x - (xp ?? 0)) ? "desconto" : "provento");
    rubricas.push({
      codigo: cod?.str.trim().toUpperCase() ?? "",
      descricao,
      referencia,
      valor: Math.abs(moeda(vi.str)),
      tipo,
      familia_hra: familia(descricao),
    });
  }
  if (!/\bcontinua\b/.test(norm(texto))) {
    total_proventos ??= rubricas.filter((i) => i.tipo === "provento").reduce((s, i) => s + i.valor, 0) || null;
    total_descontos ??= rubricas.filter((i) => i.tipo === "desconto").reduce((s, i) => s + i.valor, 0) || null;
    liquido ??= total_proventos != null && total_descontos != null ? total_proventos - total_descontos : null;
  }
  return { competencia: competencia(texto), modelo_origem, total_proventos, total_descontos, liquido, itens: rubricas };
}

function consolidar(paginas: Contra[]) {
  const out: Contra[] = [];
  let atual: Contra | null = null;
  for (const p of paginas) {
    if (!p.itens.length && p.total_proventos == null) continue;
    const continuaElekeiroz = atual?.modelo_origem === "elekeiroz" && p.modelo_origem === "elekeiroz" && atual.competencia === p.competencia;
    const novaCompetencia = atual?.competencia != null && p.competencia != null && atual.competencia !== p.competencia;
    const novoModelo = atual?.modelo_origem !== "generico" && p.modelo_origem !== "generico" && atual?.modelo_origem !== p.modelo_origem;
    if (!atual || novaCompetencia || novoModelo || (!continuaElekeiroz && atual.total_proventos != null && atual.total_descontos != null)) {
      atual = { ...p, itens: [...p.itens] };
      out.push(atual);
    } else {
      atual.itens.push(...p.itens);
      if (p.total_proventos != null) atual.total_proventos = p.total_proventos;
      if (p.total_descontos != null) atual.total_descontos = p.total_descontos;
      if (p.liquido != null) atual.liquido = p.liquido;
    }
  }
  for (const contra of out) {
    const rubricasVistas = new Set<string>();
    contra.itens = contra.itens.filter((item) => {
      const chave = `${item.codigo}|${norm(item.descricao)}|${item.referencia}|${item.valor}|${item.tipo}`;
      if (rubricasVistas.has(chave)) return false;
      rubricasVistas.add(chave);
      return true;
    });
  }
  return out;
}

function competenciaDoArquivo(paginas: TextItem[][]): string | null {
  for (const pagina of paginas) {
    const largura = Math.max(...pagina.map((i) => i.x + i.width), 595);
    const contra = parsePagina(pagina, largura);
    if (contra.competencia) return contra.competencia;
  }
  return null;
}

function chaveCompetencia(competencia: string | null): string {
  if (!competencia) return "9999/99";
  const [mes, ano] = competencia.split("/");
  return `${ano}/${mes}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authError } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (authError || !user) return json({ error: "Não autenticado" }, 401);

    const { caso_id } = await req.json();
    if (!caso_id) return json({ error: "caso_id obrigatório" }, 400);

    const { data: arquivos, error } = await supabase
      .from("arquivos")
      .select("nome, storage_path, mime_type")
      .eq("caso_id", caso_id)
      .eq("tipo", "contracheque");
    if (error) throw error;
    if (!arquivos?.length) return json({ error: "Nenhum contracheque encontrado para o caso" }, 400);

    type Entrada = { nome: string; storage_path: string; competencia: string | null; bytes: Uint8Array };
    const entradas: Entrada[] = [];

    for (const arq of arquivos) {
      if (arq.mime_type !== "application/pdf") continue;
      const { data: blob, error: de } = await supabase.storage.from("casos-arquivos").download(arq.storage_path);
      if (de || !blob) throw de ?? new Error(`Falha ao baixar ${arq.nome}`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
      const paginas = await extrairItensPorPagina(pdf);
      const competencia = competenciaDoArquivo(paginas);
      entradas.push({ nome: arq.nome, storage_path: arq.storage_path, competencia, bytes });
    }

    if (!entradas.length) return json({ error: "Nenhum contracheque em PDF encontrado" }, 400);

    entradas.sort((a, b) => chaveCompetencia(a.competencia).localeCompare(chaveCompetencia(b.competencia)));

    const destino = await PDFDocument.create();
    for (const entrada of entradas) {
      const origem = await PDFDocument.load(entrada.bytes, { ignoreEncryption: true });
      const paginas = await destino.copyPages(origem, origem.getPageIndices());
      paginas.forEach((pagina) => destino.addPage(pagina));
    }

    const bytesUnificado = await destino.save();
    const nome = "contracheques-unificados.pdf";
    const storagePath = `${caso_id}/${crypto.randomUUID()}-${nome}`;
    const { error: upErr } = await supabase.storage.from("casos-arquivos").upload(storagePath, bytesUnificado, {
      contentType: "application/pdf",
    });
    if (upErr) throw upErr;

    const { error: insertErr } = await supabase.from("arquivos").insert({
      caso_id,
      nome,
      tipo: "contracheque",
      storage_path: storagePath,
      mime_type: "application/pdf",
    });
    if (insertErr) throw insertErr;

    return json({ ok: true, nome, storage_path: storagePath });
  } catch (e) {
    const detalhe = e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) };
    console.error("unificar-contracheques-ordenados error", detalhe);
    return json({ error: e instanceof Error ? e.message : "Erro ao unificar contracheques" }, 500);
  }
});
