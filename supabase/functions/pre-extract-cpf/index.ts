// Pré-extração leve: detecta apenas CPF + nome do titular para matching de duplicatas.
// Usa Gemini 2.5 Flash Lite (barato e rápido). Depois roda lógica de matching e seta flags.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIMILARIDADE_THRESHOLD = 0.90;
const STATUS_ATIVOS = ["novo", "em_analise", "aguardando_confirmacao", "aguardando_pasta"];

const SYSTEM_PROMPT = `Você analisa documentos brasileiros (RG, CPF, comprovante, contracheque).
Sua ÚNICA tarefa: identificar o CPF e o nome completo do titular principal.
- CPF: 11 dígitos, apenas números, sem pontuação. Se não tiver certeza, retorne null.
- Nome: completo, como aparece no documento de identidade. Se múltiplos nomes, escolha o titular do RG/CPF (não dependentes, não emissor).
- Em caso de dúvida, prefira null a chutar.
Retorne SEMPRE via tool call registrar_cpf_nome.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------- Normalização e similaridade ----------------

function normalizarCpf(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  if (d.length !== 11) return null;
  if (/^(\d)\1{10}$/.test(d)) return null;
  // Validação módulo-11
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i]) * (factor - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  if (calc(d.slice(0, 9), 10) !== parseInt(d[9])) return null;
  if (calc(d.slice(0, 10), 11) !== parseInt(d[10])) return null;
  return d;
}

function normalizarNome(s: string | null | undefined): string {
  if (!s) return "";
  const stop = new Set(["de", "da", "do", "dos", "das", "e"]);
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !stop.has(t))
    .join(" ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function ratio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function similaridadeNome(a: string, b: string): number {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // Subset: um nome contém todos os tokens do outro
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const menor = ta.size <= tb.size ? ta : tb;
  const maior = ta.size <= tb.size ? tb : ta;
  let contidos = 0;
  for (const t of menor) if (maior.has(t)) contidos++;
  if (contidos === menor.size && menor.size >= 2) return 0.95;
  // Token set ratio
  const inter = [...ta].filter((t) => tb.has(t));
  const r1 = ratio(na, nb);
  const r2 = inter.length / Math.max(ta.size, tb.size);
  return Math.max(r1, r2);
}

// ---------------- Edge function ----------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { caso_id } = await req.json();
    if (!caso_id) return json({ error: "caso_id obrigatório" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    console.log(`[pre-extract-cpf] iniciando caso=${caso_id}`);

    const { data: arquivos, error: aErr } = await supabase
      .from("arquivos").select("*").eq("caso_id", caso_id);
    if (aErr) throw aErr;
    if (!arquivos || arquivos.length === 0) {
      console.log(`[pre-extract-cpf] sem arquivos, isolado`);
      return json({ acao: "isolado", motivo: "sem_arquivos" });
    }

    // Monta conteúdo multimodal (download + encode em paralelo)
    const content: any[] = [
      { type: "text", text: "Identifique CPF e nome do titular nos documentos a seguir." },
    ];
    console.time("[pre-extract-cpf] download+encode");
    const parts = await Promise.all(
      arquivos.map(async (arq: any) => {
        const mime = arq.mime_type || "image/jpeg";
        // PDFs não são suportados como image_url pelo Gemini Flash Lite; pula
        if (mime === "application/pdf") return null;
        const { data: blob, error: dlErr } = await supabase.storage
          .from("casos-arquivos").download(arq.storage_path);
        if (dlErr || !blob) { console.warn(`[pre-extract-cpf] falha download ${arq.storage_path}`); return null; }
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
        const b64 = btoa(bin);
        return { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } };
      }),
    );
    for (const p of parts) if (p) content.push(p);
    console.timeEnd("[pre-extract-cpf] download+encode");

    if (content.length === 1) {
      console.log(`[pre-extract-cpf] sem imagens utilizáveis (só PDFs?), isolado`);
      return json({ acao: "isolado", motivo: "sem_imagens" });
    }

    const tools = [{
      type: "function",
      function: {
        name: "registrar_cpf_nome",
        description: "Registra o CPF (só dígitos) e o nome completo do titular principal.",
        parameters: {
          type: "object",
          properties: {
            cpf: { type: ["string", "null"], description: "CPF com 11 dígitos, só números, ou null" },
            nome: { type: ["string", "null"], description: "Nome completo do titular, ou null" },
          },
          required: ["cpf", "nome"],
        },
      },
    }];

    console.time("[pre-extract-cpf] ai-call");
    const aiAbort = new AbortController();
    const aiTimer = setTimeout(() => aiAbort.abort(), 90_000);
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: aiAbort.signal,
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "registrar_cpf_nome" } },
      }),
    }).finally(() => clearTimeout(aiTimer));
    console.timeEnd("[pre-extract-cpf] ai-call");

    if (!aiResp.ok) {
      const txt = await aiResp.text().catch(() => "");
      throw new Error(`Lovable AI ${aiResp.status}: ${txt}`);
    }
    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI não retornou tool_call");
    const args = JSON.parse(toolCall.function.arguments);
    const cpf = normalizarCpf(args.cpf);
    const nome = (args.nome ?? "").toString().trim() || null;

    console.log(`[pre-extract-cpf] extraído cpf=${cpf ? cpf.slice(0, 3) + "***" : "null"} nome=${nome ? "ok" : "null"}`);

    // Persiste pré-extração
    await supabase.from("casos").update({
      cpf_pre_extraido: cpf,
      nome_pre_extraido: nome,
    }).eq("id", caso_id);

    if (!cpf) {
      console.log(`[pre-extract-cpf] sem CPF válido, isolado`);
      return json({ acao: "isolado", motivo: "cpf_ausente" });
    }

    // Busca candidatos com mesmo CPF
    const { data: candidatos } = await supabase
      .from("casos")
      .select("id, status, nome_cliente, nome_pre_extraido, cpf, cpf_pre_extraido, created_at")
      .or(`cpf.eq.${cpf},cpf_pre_extraido.eq.${cpf}`)
      .neq("id", caso_id)
      .order("created_at", { ascending: false });

    const list = (candidatos ?? []).filter((c) => c.status !== "cancelado");
    if (list.length === 0) {
      console.log(`[pre-extract-cpf] CPF único, isolado`);
      return json({ acao: "isolado", motivo: "cpf_unico" });
    }

    // Prioridade: ativos primeiro
    const ativos = list.filter((c) => STATUS_ATIVOS.includes(c.status));
    const concluidos = list.filter((c) => c.status === "concluido");

    // 1) Tenta mescla automática com ativos
    for (const cand of ativos) {
      const nomeCand = cand.nome_cliente || cand.nome_pre_extraido || "";
      const sim = nome && nomeCand ? similaridadeNome(nome, nomeCand) : 0;
      if (sim >= SIMILARIDADE_THRESHOLD) {
        console.log(`[pre-extract-cpf] MESCLA AUTO em ${cand.id} (sim=${sim.toFixed(2)})`);
        // Move arquivos
        await supabase.from("arquivos")
          .update({ caso_id: cand.id, caso_id_origem: caso_id })
          .eq("caso_id", caso_id);
        // Marca caso novo como mesclado
        await supabase.from("casos").update({
          mesclado_em: cand.id,
          mesclado_at: new Date().toISOString(),
          status: "cancelado",
        }).eq("id", caso_id);
        return json({ acao: "mesclado_auto", ref_id: cand.id });
      }
    }

    // 2) Se houve ativo mas sim < threshold (ou nome ausente), sugere
    if (ativos.length > 0) {
      const cand = ativos[0];
      console.log(`[pre-extract-cpf] SUGERE duplicata de ${cand.id}`);
      await supabase.from("casos").update({
        possivel_duplicata_de: cand.id,
      }).eq("id", caso_id);
      return json({ acao: "sugerido", ref_id: cand.id });
    }

    // 3) Cliente recorrente (só concluídos)
    if (concluidos.length > 0) {
      const cand = concluidos[0];
      console.log(`[pre-extract-cpf] cliente recorrente de ${cand.id}`);
      await supabase.from("casos").update({
        cliente_recorrente_ref: cand.id,
      }).eq("id", caso_id);
      return json({ acao: "recorrente", ref_id: cand.id });
    }

    return json({ acao: "isolado" });
  } catch (e) {
    console.error("[pre-extract-cpf] erro:", e);
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
