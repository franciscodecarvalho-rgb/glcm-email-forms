// Webhook público para N8N — recebe multipart/form-data com arquivos
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const form = await req.formData();
    const nomeCliente = (form.get("nome_cliente") as string | null) || null;

    // Aceita campos "files" (vários) ou qualquer File anexado
    const files: File[] = [];
    for (const [, v] of form.entries()) {
      if (v instanceof File) files.push(v);
    }
    if (files.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum arquivo anexado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: caso, error } = await supabase
      .from("casos")
      .insert({ status: "novo", origem: "n8n", nome_cliente: nomeCliente })
      .select()
      .single();
    if (error) throw error;

    for (const f of files) {
      const path = `${caso.id}/${crypto.randomUUID()}-${f.name}`;
      const buf = new Uint8Array(await f.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from("casos-arquivos")
        .upload(path, buf, { contentType: f.type || "application/octet-stream" });
      if (upErr) throw upErr;
      await supabase.from("arquivos").insert({
        caso_id: caso.id,
        nome: f.name,
        storage_path: path,
        mime_type: f.type,
      });
    }

    // Dispara extração assíncrona
    await supabase.from("casos").update({ status: "em_analise" }).eq("id", caso.id);
    supabase.functions.invoke("extract-case-data", { body: { caso_id: caso.id } }).catch(() => {});

    return new Response(JSON.stringify({ caso_id: caso.id, files: files.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("webhook-n8n error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
