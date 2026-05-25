// Webhook da Resend Inbound — recebe emails enviados para documentos@glcm.app
// Cria um caso, baixa anexos para o bucket e dispara extract-case-data
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
];
const ACCEPTED_EXT = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Verifica assinatura svix (formato usado pela Resend)
// secret format: "whsec_BASE64SECRET"
async function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  body: string,
): Promise<boolean> {
  try {
    const secretBytes = Uint8Array.from(
      atob(secret.replace(/^whsec_/, "")),
      (c) => c.charCodeAt(0),
    );
    const toSign = `${svixId}.${svixTimestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
    // svixSignature pode ter múltiplos valores separados por espaço, formato "v1,BASE64"
    const sigs = svixSignature.split(" ").map((s) => s.split(",")[1]).filter(Boolean);
    return sigs.includes(expected);
  } catch (e) {
    console.error("svix verify error:", e);
    return false;
  }
}

function extractNameFromEmail(from: string): string | null {
  // Formato: "Nome <email@exemplo.com>" ou só "email@exemplo.com"
  const match = from.match(/^"?([^"<]+?)"?\s*<.+>$/);
  if (match) return match[1].trim();
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ sucesso: false, mensagem: "Método não permitido" }, 405);

  try {
    const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
    if (!secret) return json({ sucesso: false, mensagem: "Webhook não configurado" }, 500);

    const rawBody = await req.text();

    // Validação da assinatura svix
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return json({ sucesso: false, mensagem: "Headers de assinatura ausentes" }, 401);
    }
    const ok = await verifySvixSignature(secret, svixId, svixTimestamp, svixSignature, rawBody);
    if (!ok) return json({ sucesso: false, mensagem: "Assinatura inválida" }, 401);

    const payload = JSON.parse(rawBody);
    // Resend inbound payload: { type: "email.received", data: { from, subject, text, html, attachments, headers, ... } }
    const data = payload.data || payload;
    const messageId = data.message_id || data.headers?.["message-id"] || svixId;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Idempotência
    const { data: existing } = await supabase
      .from("casos").select("id").eq("message_id", messageId).maybeSingle();
    if (existing) {
      return json({ sucesso: true, caso_id: existing.id, duplicado: true });
    }

    const from = data.from || "";
    const nomeCliente = extractNameFromEmail(from);
    const attachments: Array<{ filename: string; content_type?: string; content?: string; content_url?: string }> =
      data.attachments || [];

    if (attachments.length === 0) return json({ sucesso: false, mensagem: "Email sem anexos" }, 400);
    if (attachments.length > MAX_FILES)
      return json({ sucesso: false, mensagem: `Máximo de ${MAX_FILES} anexos` }, 400);

    // Baixa todos os anexos primeiro (em memória) para validar tamanho total antes de criar o caso
    const downloaded: Array<{ name: string; mime: string; bytes: Uint8Array }> = [];
    let totalBytes = 0;
    for (const a of attachments) {
      let bytes: Uint8Array;
      if (a.content) {
        bytes = Uint8Array.from(atob(a.content), (c) => c.charCodeAt(0));
      } else if (a.content_url) {
        const r = await fetch(a.content_url);
        if (!r.ok) throw new Error(`Falha ao baixar anexo ${a.filename}`);
        bytes = new Uint8Array(await r.arrayBuffer());
      } else {
        return json({ sucesso: false, mensagem: `Anexo sem conteúdo: ${a.filename}` }, 400);
      }

      const ext = "." + (a.filename.split(".").pop() || "").toLowerCase();
      const mime = (a.content_type || "").toLowerCase();
      if (!ACCEPTED_MIME.includes(mime) && !ACCEPTED_EXT.includes(ext)) {
        return json({ sucesso: false, mensagem: `Tipo não aceito: ${a.filename}` }, 400);
      }
      if (bytes.byteLength > MAX_FILE_BYTES) {
        return json({ sucesso: false, mensagem: `Anexo excede 10MB: ${a.filename}` }, 400);
      }
      totalBytes += bytes.byteLength;
      downloaded.push({ name: a.filename, mime: a.content_type || "application/octet-stream", bytes });
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return json({ sucesso: false, mensagem: "Tamanho total excede 50MB" }, 400);
    }

    // Cria caso
    const { data: caso, error } = await supabase.from("casos").insert({
      status: "novo",
      origem: "email",
      nome_cliente: nomeCliente,
      message_id: messageId,
    }).select().single();
    if (error) throw error;

    for (const f of downloaded) {
      const path = `${caso.id}/${crypto.randomUUID()}-${f.name}`;
      const { error: upErr } = await supabase.storage
        .from("casos-arquivos")
        .upload(path, f.bytes, { contentType: f.mime });
      if (upErr) throw upErr;
      await supabase.from("arquivos").insert({
        caso_id: caso.id,
        nome: f.name,
        storage_path: path,
        mime_type: f.mime,
      });
    }

    await supabase.from("casos").update({ status: "em_analise" }).eq("id", caso.id);
    supabase.functions.invoke("extract-case-data", { body: { caso_id: caso.id } }).catch(() => {});

    return json({ sucesso: true, caso_id: caso.id, arquivos: downloaded.length });
  } catch (e) {
    console.error("resend-inbound error:", e);
    return json({ sucesso: false, mensagem: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
