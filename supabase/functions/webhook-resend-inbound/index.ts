// Webhook da Resend Inbound — recebe emails enviados para documentos@glcm.app
// Cria um caso (status=novo, origem=email), baixa anexos via API Resend e armazena.
// NÃO dispara extract-case-data — usuário abre manualmente no dashboard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
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

const RESEND_API = "https://api.resend.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Validação da assinatura padrão svix usada pela Resend
// Secret: "whsec_<BASE64>"; header svix-signature: "v1,<BASE64> v1,<BASE64>..."
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
    const expected = bytesToBase64(new Uint8Array(sigBuf));
    const sigs = svixSignature
      .split(" ")
      .map((s) => s.split(",")[1])
      .filter(Boolean);
    return sigs.includes(expected);
  } catch (e) {
    console.error("[webhook-resend-inbound] svix verify error:", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return json({ success: false, error: "Método não permitido" }, 405);

  try {
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!webhookSecret || !resendApiKey) {
      console.error("[webhook-resend-inbound] secrets ausentes");
      return json({ success: false, error: "Webhook não configurado" }, 500);
    }

    const rawBody = await req.text();

    // 1) Assinatura svix
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn("[webhook-resend-inbound] headers svix ausentes");
      return json({ success: false, error: "Headers de assinatura ausentes" }, 401);
    }
    const valid = await verifySvixSignature(
      webhookSecret, svixId, svixTimestamp, svixSignature, rawBody,
    );
    if (!valid) {
      console.warn("[webhook-resend-inbound] assinatura inválida");
      return json({ success: false, error: "Assinatura inválida" }, 401);
    }

    const payload = JSON.parse(rawBody);
    const data = payload.data ?? payload;
    const emailId: string | undefined = data.email_id ?? data.id;
    if (!emailId) {
      return json({ success: false, error: "email_id ausente no payload" }, 400);
    }
    console.log(`[webhook-resend-inbound] recebido email_id=${emailId} de ${data.from}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 2) Idempotência
    const { data: existing } = await supabase
      .from("casos").select("id").eq("message_id", emailId).maybeSingle();
    if (existing) {
      console.log(`[webhook-resend-inbound] duplicado, caso ${existing.id}`);
      return json({ success: true, caso_id: existing.id, duplicado: true });
    }

    // 3) Validação de anexos (metadados)
    const attachments: Array<{
      filename: string;
      content_type?: string;
      content_id?: string;
    }> = data.attachments ?? [];

    if (attachments.length === 0) {
      return json({ success: false, error: "Email sem anexos" }, 400);
    }
    if (attachments.length > MAX_FILES) {
      return json({ success: false, error: `Máximo de ${MAX_FILES} anexos` }, 400);
    }
    for (const a of attachments) {
      const ext = "." + (a.filename?.split(".").pop() || "").toLowerCase();
      const mime = (a.content_type || "").toLowerCase();
      if (!ACCEPTED_MIME.includes(mime) && !ACCEPTED_EXT.includes(ext)) {
        return json({ success: false, error: `Tipo não aceito: ${a.filename}` }, 400);
      }
      if (!a.content_id) {
        return json({ success: false, error: `Anexo sem content_id: ${a.filename}` }, 400);
      }
    }

    // 4) Cria caso
    const { data: caso, error: casoErr } = await supabase.from("casos").insert({
      status: "novo",
      origem: "email",
      message_id: emailId,
      nome_cliente: null,
    }).select().single();
    if (casoErr) throw casoErr;
    console.log(`[webhook-resend-inbound] caso criado ${caso.id}`);

    // 5) Baixa cada anexo via API Resend e faz upload
    let totalBytes = 0;
    let uploaded = 0;
    for (const a of attachments) {
      const url = `${RESEND_API}/emails/${emailId}/attachments/${a.content_id}`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${resendApiKey}` },
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Falha download anexo ${a.filename} [${r.status}]: ${txt}`);
      }
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.byteLength > MAX_FILE_BYTES) {
        throw new Error(`Anexo excede 10MB: ${a.filename}`);
      }
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error("Tamanho total excede 50MB");
      }

      const mime = a.content_type || "application/octet-stream";
      const path = `${caso.id}/${crypto.randomUUID()}-${a.filename}`;
      const { error: upErr } = await supabase.storage
        .from("casos-arquivos")
        .upload(path, bytes, { contentType: mime });
      if (upErr) throw upErr;
      const { error: arqErr } = await supabase.from("arquivos").insert({
        caso_id: caso.id,
        nome: a.filename,
        storage_path: path,
        mime_type: mime,
      });
      if (arqErr) throw arqErr;
      uploaded++;
      console.log(`[webhook-resend-inbound] anexo ${uploaded}/${attachments.length} ok: ${a.filename}`);
    }

    console.log(`[webhook-resend-inbound] concluído caso=${caso.id} arquivos=${uploaded}`);

    // Dispara pré-extração de CPF/nome (fire-and-forget)
    supabase.functions.invoke("pre-extract-cpf", { body: { caso_id: caso.id } })
      .catch((err) => console.error("[webhook-resend-inbound] falha invoke pre-extract-cpf:", err));

    return json({ success: true, caso_id: caso.id, arquivos: uploaded });
  } catch (e) {
    console.error("[webhook-resend-inbound] erro:", e);
    return json(
      { success: false, error: e instanceof Error ? e.message : "Erro interno" },
      500,
    );
  }
});
