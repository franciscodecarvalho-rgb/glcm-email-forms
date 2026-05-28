// Ações manuais de mesclagem: mesclar, desfazer, manter_separado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STATUS_FINAIS = ["concluido", "cancelado"];
const JANELA_DESFAZER_MS = 7 * 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { acao, caso_id, alvo_id } = await req.json();
    if (!acao || !caso_id) return json({ error: "acao e caso_id obrigatórios" }, 400);

    if (acao === "mesclar") {
      // caso_id = caso novo (que vai sumir); alvo_id = caso original (recebe arquivos)
      if (!alvo_id) return json({ error: "alvo_id obrigatório" }, 400);
      console.log(`[merge-casos] mesclar ${caso_id} -> ${alvo_id}`);
      await supabase.from("arquivos")
        .update({ caso_id: alvo_id, caso_id_origem: caso_id })
        .eq("caso_id", caso_id);
      await supabase.from("casos").update({
        mesclado_em: alvo_id,
        mesclado_at: new Date().toISOString(),
        possivel_duplicata_de: null,
        status: "cancelado",
      }).eq("id", caso_id);
      return json({ ok: true });
    }

    if (acao === "manter_separado") {
      console.log(`[merge-casos] manter_separado ${caso_id}`);
      await supabase.from("casos").update({
        possivel_duplicata_de: null,
      }).eq("id", caso_id);
      return json({ ok: true });
    }

    if (acao === "desfazer") {
      // caso_id = caso original que recebeu a mescla. alvo_id = caso que foi mesclado (a restaurar)
      if (!alvo_id) return json({ error: "alvo_id obrigatório" }, 400);
      console.log(`[merge-casos] desfazer mescla ${alvo_id} de ${caso_id}`);

      const { data: original } = await supabase.from("casos")
        .select("status").eq("id", caso_id).maybeSingle();
      if (!original) return json({ error: "Caso original não encontrado" }, 404);
      if (STATUS_FINAIS.includes(original.status)) {
        return json({ error: "Caso original já está finalizado" }, 400);
      }

      const { data: mesclado } = await supabase.from("casos")
        .select("mesclado_em, mesclado_at").eq("id", alvo_id).maybeSingle();
      if (!mesclado || mesclado.mesclado_em !== caso_id) {
        return json({ error: "Caso alvo não foi mesclado neste original" }, 400);
      }
      if (!mesclado.mesclado_at ||
          Date.now() - new Date(mesclado.mesclado_at).getTime() > JANELA_DESFAZER_MS) {
        return json({ error: "Janela de 7 dias expirada" }, 400);
      }

      // Move arquivos de volta
      await supabase.from("arquivos")
        .update({ caso_id: alvo_id, caso_id_origem: null })
        .eq("caso_id_origem", alvo_id)
        .eq("caso_id", caso_id);

      // Restaura caso
      await supabase.from("casos").update({
        mesclado_em: null,
        mesclado_at: null,
        status: "novo",
      }).eq("id", alvo_id);

      return json({ ok: true });
    }

    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    console.error("[merge-casos] erro:", e);
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
