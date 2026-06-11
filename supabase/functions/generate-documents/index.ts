// Gera as peças DOCX do caso a partir dos templates ({VAR}, docxtemplater).
//
// Peças por escritório: peticao, contrato, termo_renuncia e planilha sempre;
// procuracao_glcm/termo_lgpd_glcm só se o caso inclui GLCM; idem Polkowski.
// A planilha usa loop {#linhas} com uma linha por competência.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import PizZip from "npm:pizzip@3.2.0";
import Docxtemplater from "npm:docxtemplater@3.68.6";
import { montarVariaveisCaso, fmtBRL } from "../_shared/variaveis.ts";
import { montarArquivosPlanilhaXlsx } from "../_shared/planilha-xlsx.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALIQUOTA = 0.275;

// Peças geradas sempre / por escritório. A planilha NÃO usa template:
// é gerada como .xlsx com fórmulas vivas (ver _shared/planilha-xlsx.ts).
const PECAS_BASE = ["peticao", "contrato", "termo_renuncia"];
const PECAS_GLCM = ["procuracao_glcm", "termo_lgpd_glcm"];
const PECAS_POLKOWSKI = ["procuracao_polkowski", "termo_lgpd_polkowski"];

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

    // Quais peças este caso recebe (conforme escritórios selecionados).
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

    // Dados: variáveis do caso + linhas da planilha (uma por competência).
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
    // valor_causa salvo na revisão; recalcula como fallback.
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

    // Planilha de cálculo: .xlsx gerado com fórmulas (sem template).
    {
      const linhasXlsx = contras.map((c: any) => ({
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
