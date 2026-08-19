// Exclusão em lote: remove TODOS os casos com status "cancelado" de uma só vez,
// junto com os arquivos físicos dos buckets casos-arquivos e casos-documentos.
//
// A exclusão individual (Dashboard.tsx) permanece intacta; esta função é o
// endpoint em massa. Os filhos relacionais (arquivos, lotes_extracao,
// finalizacoes_extracao, contracheques e itens_contracheque) são removidos
// pelo ON DELETE CASCADE das migrations; o Storage não tem cascade e é
// limpo explicitamente aqui.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STATUS_ALVO = "cancelado";
const BUCKETS = ["casos-arquivos", "casos-documentos"];
const LOTE_DELETE = 100; // ids por instrução DELETE
const LOTE_STORAGE = 1000; // limite por chamada de list/remove do Storage

type SupabaseAdmin = ReturnType<typeof createClient>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Arquivos ficam achatados em "{caso.id}/{nome}" (NovoCaso.tsx e
// generate-documents); lista paginada + remoção em lote por bucket.
// Casos mesclados (status cancelado + mesclado_em) tiveram suas linhas de
// `arquivos` transferidas ao caso alvo pelo merge-casos, mas o storage_path
// físico continua com o id do caso mesclado: objetos ainda referenciados por
// linhas sobreviventes de `arquivos` são preservados.
async function removerArquivosDoCaso(supabase: SupabaseAdmin, casoId: string): Promise<number> {
  const { data: refs, error: refErr } = await supabase
    .from("arquivos")
    .select("storage_path")
    .like("storage_path", `${casoId}/%`);
  if (refErr) throw refErr;
  const manter = new Set((refs ?? []).map((r) => r.storage_path as string));

  let removidos = 0;
  for (const bucket of BUCKETS) {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(casoId, { limit: LOTE_STORAGE, offset });
      if (error) throw new Error(`${bucket}/${casoId}: ${error.message}`);
      if (!data || data.length === 0) break;
      const paths = data
        .map((o) => `${casoId}/${o.name}`)
        .filter((p) => !manter.has(p));
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from(bucket).remove(paths);
        if (rmErr) throw new Error(`${bucket}/${casoId}: ${rmErr.message}`);
        removidos += paths.length;
      }
      if (data.length < LOTE_STORAGE) break;
      offset += LOTE_STORAGE;
    }
  }
  return removidos;
}

async function excluirCasosCancelados(
  supabase: SupabaseAdmin,
): Promise<{ excluidos: number; arquivos_storage_removidos: number; avisos_storage: string[] }> {
  const { data: casos, error } = await supabase
    .from("casos")
    .select("id")
    .eq("status", STATUS_ALVO);
  if (error) throw error;

  const ids = (casos ?? []).map((c) => c.id as string);
  if (ids.length === 0) return { excluidos: 0, arquivos_storage_removidos: 0, avisos_storage: [] };

  // 1) Linhas primeiro: cada DELETE é uma instrução única (atômica) e o CASCADE
  //    remove os filhos. Se o Storage falhar depois, sobra órfão — mesmo modo de
  //    falha da exclusão individual atual, sem deixar linha apontando para
  //    arquivo já removido.
  let excluidos = 0;
  for (let i = 0; i < ids.length; i += LOTE_DELETE) {
    const { data, error: delErr } = await supabase
      .from("casos")
      .delete()
      .in("id", ids.slice(i, i + LOTE_DELETE))
      .select("id");
    if (delErr) throw delErr;
    excluidos += data?.length ?? 0;
  }

  // 2) Arquivos físicos: falha aqui não reverte a exclusão; os ids com problema
  //    voltam em avisos_storage para limpeza posterior.
  let arquivosRemovidos = 0;
  const avisos: string[] = [];
  for (const id of ids) {
    try {
      arquivosRemovidos += await removerArquivosDoCaso(supabase, id);
    } catch (e) {
      console.error("[excluir-casos-cancelados] storage:", e instanceof Error ? e.message : e);
      avisos.push(id);
    }
  }

  return { excluidos, arquivos_storage_removidos: arquivosRemovidos, avisos_storage: avisos };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    // Mesma permissão da exclusão individual vigente (policy "auth delete casos"):
    // qualquer usuário autenticado. Padrão das demais funções do projeto.
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      auth.replace(/^Bearer\s+/i, ""),
    );
    if (authError || !user) return json({ error: "Não autenticado" }, 401);

    console.log(`[excluir-casos-cancelados] solicitado por ${user.id}`);
    const resultado = await excluirCasosCancelados(supabase);
    console.log(`[excluir-casos-cancelados] ${resultado.excluidos} casos excluídos`);

    return json({
      ok: true,
      excluidos: resultado.excluidos,
      arquivos_storage_removidos: resultado.arquivos_storage_removidos,
      ...(resultado.avisos_storage.length > 0 ? { avisos_storage: resultado.avisos_storage } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    console.error("[excluir-casos-cancelados] error:", msg);
    return json({ error: msg }, 500);
  }
});
