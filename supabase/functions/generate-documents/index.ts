// Gera os 4 documentos DOCX a partir dos templates usando docxtemplater
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import PizZip from "npm:pizzip@3.2.0";
import Docxtemplater from "npm:docxtemplater@3.68.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

    const { data: templates, error: tErr } = await supabase.from("templates").select("*");
    if (tErr) throw tErr;
    if (!templates || templates.length === 0) {
      throw new Error("Nenhum template configurado. Acesse /templates para enviar os modelos .docx.");
    }

    const e = caso.endereco ?? {};
    const enderecoCompleto = [e.logradouro, e.numero, e.bairro, e.cidade, e.estado, e.cep]
      .filter(Boolean)
      .join(", ");
    const contras: any[] = caso.contracheques ?? [];
    const totHra = contras.reduce((a, c) => a + Number(c.valor_hra || 0), 0);
    const totAhra = contras.reduce((a, c) => a + Number(c.valor_ahra || 0), 0);
    const totGeral = totHra + totAhra;

    const data = {
      NOME_CLIENTE: caso.nome_cliente ?? "",
      CPF: caso.cpf ?? "",
      RG: caso.rg ?? "",
      ENDERECO_COMPLETO: enderecoCompleto,
      LOGRADOURO: e.logradouro ?? "",
      NUMERO: e.numero ?? "",
      BAIRRO: e.bairro ?? "",
      CIDADE: e.cidade ?? "",
      ESTADO: e.estado ?? "",
      CEP: e.cep ?? "",
      TOTAL_HRA: fmtBRL(totHra),
      TOTAL_AHRA: fmtBRL(totAhra),
      TOTAL_GERAL: fmtBRL(totGeral),
      NUMERO_PASTA: caso.numero_pasta ?? "",
      DATA_ATUAL: new Date().toLocaleDateString("pt-BR"),
    };

    const generated: { tipo: string; storage_path: string; nome: string }[] = [];

    for (const tpl of templates) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("templates")
        .download(tpl.storage_path);
      if (dlErr || !blob) {
        console.error("Falha ao baixar template", tpl.tipo, dlErr);
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

    if (generated.length === 0) throw new Error("Nenhum documento foi gerado.");

    await supabase
      .from("casos")
      .update({ documentos_gerados: generated, status: "concluido" })
      .eq("id", caso_id);

    return new Response(JSON.stringify({ ok: true, generated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    console.error("generate-documents error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
