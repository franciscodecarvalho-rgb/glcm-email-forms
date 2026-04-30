// Webhook público para N8N — recebe multipart/form-data com arquivos
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-message-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const ACCEPTED_EXT = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return json({ sucesso: false, mensagem: "Método não permitido" }, 405);

  try {
    // 1) Autenticação por secret
    const expected = Deno.env.get("N8N_WEBHOOK_SECRET");
    if (!expected) {
      return json(
        { sucesso: false, mensagem: "Webhook não configurado (secret ausente)" },
        500,
      );
    }
    const provided = req.headers.get("x-webhook-secret");
    if (!provided || provided !== expected) {
      return json({ sucesso: false, mensagem: "Não autorizado" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 2) Idempotência via x-message-id
    const messageId = req.headers.get("x-message-id");
    if (messageId) {
      const { data: existing } = await supabase
        .from("casos")
        .select("id")
        .eq("message_id", messageId)
        .maybeSingle();
      if (existing) {
        return json({
          sucesso: true,
          caso_id: existing.id,
          mensagem: "Caso já processado (idempotente)",
          duplicado: true,
        });
      }
    }

    // 3) Parse multipart
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ sucesso: false, mensagem: "multipart/form-data inválido" }, 400);
    }

    const nomeCliente = (form.get("nome_cliente") as string | null) || null;

    const files: File[] = [];
    for (const [, v] of form.entries()) {
      if (v instanceof File) files.push(v);
    }

    // 4) Validações
    if (files.length === 0)
      return json({ sucesso: false, mensagem: "Nenhum arquivo anexado" }, 400);
    if (files.length > MAX_FILES)
      return json(
        { sucesso: false, mensagem: `Máximo de ${MAX_FILES} arquivos por requisição` },
        400,
      );

    let totalBytes = 0;
    for (const f of files) {
      const ext = "." + (f.name.split(".").pop() || "").toLowerCase();
      const okType =
        ACCEPTED_MIME.includes(f.type.toLowerCase()) || ACCEPTED_EXT.includes(ext);
      if (!okType) {
        return json(
          {
            sucesso: false,
            mensagem: `Tipo não aceito: ${f.name} (${f.type || ext})`,
          },
          400,
        );
      }
      if (f.size > MAX_FILE_BYTES) {
        return json(
          { sucesso: false, mensagem: `Arquivo excede ${MAX_FILE_BYTES} bytes: ${f.name}` },
          400,
        );
      }
      totalBytes += f.size;
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return json(
        { sucesso: false, mensagem: `Tamanho total excede ${MAX_TOTAL_BYTES} bytes` },
        400,
      );
    }

    // 5) Cria caso
    const { data: caso, error } = await supabase
      .from("casos")
      .insert({
        status: "novo",
        origem: "n8n",
        nome_cliente: nomeCliente,
        message_id: messageId,
      })
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

    await supabase.from("casos").update({ status: "em_analise" }).eq("id", caso.id);
    supabase.functions
      .invoke("extract-case-data", { body: { caso_id: caso.id } })
      .catch(() => {});

    return json({
      sucesso: true,
      caso_id: caso.id,
      mensagem: "Caso criado com sucesso",
      arquivos: files.length,
    });
  } catch (e) {
    console.error("webhook-n8n error:", e);
    return json(
      { sucesso: false, mensagem: e instanceof Error ? e.message : "Erro interno" },
      500,
    );
  }
});
