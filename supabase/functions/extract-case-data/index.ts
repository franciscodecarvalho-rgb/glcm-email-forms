// Extrai dados dos arquivos do caso usando Lovable AI (Gemini com visão)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um assistente jurídico que extrai dados de documentos brasileiros (RG, CPF, comprovante de residência e contracheques).
Para cada documento de identidade ou comprovante: extraia nome, CPF, RG e endereço completo.
Para cada contracheque: identifique TODAS as linhas que contenham os códigos "HRA" ou "AHRA" e some os respectivos valores numéricos por contracheque.
Retorne sempre via tool call.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let casoId = "";
  try {
    const body = await req.json();
    casoId = body.caso_id;
    if (!casoId) throw new Error("caso_id obrigatório");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const { data: arquivos, error: aErr } = await supabase
      .from("arquivos")
      .select("*")
      .eq("caso_id", casoId);
    if (aErr) throw aErr;
    if (!arquivos || arquivos.length === 0) throw new Error("Nenhum arquivo no caso");

    // Monta conteúdo multimodal: cada imagem/PDF como image_url base64
    const content: any[] = [
      { type: "text", text: "Analise os documentos a seguir e extraia os dados estruturados via tool call." },
    ];

    for (const arq of arquivos) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("casos-arquivos")
        .download(arq.storage_path);
      if (dlErr || !blob) continue;
      const buf = new Uint8Array(await blob.arrayBuffer());
      let b64 = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        b64 += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      b64 = btoa(b64);
      const mime = arq.mime_type || "image/jpeg";
      content.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${b64}` },
      });
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "registrar_dados_caso",
          description: "Registra os dados extraídos dos documentos do caso jurídico.",
          parameters: {
            type: "object",
            properties: {
              nome_cliente: { type: "string", description: "Nome completo do cliente" },
              cpf: { type: "string" },
              rg: { type: "string" },
              endereco: {
                type: "object",
                properties: {
                  logradouro: { type: "string" },
                  numero: { type: "string" },
                  bairro: { type: "string" },
                  cidade: { type: "string" },
                  estado: { type: "string" },
                  cep: { type: "string" },
                },
              },
              contracheques: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Identificação ex: 'Contracheque 01/2024'" },
                    valor_hra: { type: "number", description: "Soma dos valores de linhas com código HRA" },
                    valor_ahra: { type: "number", description: "Soma dos valores de linhas com código AHRA" },
                  },
                  required: ["label", "valor_hra", "valor_ahra"],
                },
              },
            },
            required: ["contracheques"],
            additionalProperties: false,
          },
        },
      },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "registrar_dados_caso" } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI error", aiResp.status, txt);
      if (aiResp.status === 429) throw new Error("Limite de uso de IA excedido. Tente novamente em alguns minutos.");
      if (aiResp.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Falha na IA (${aiResp.status})`);
    }

    const aiJson = await aiResp.json();
    const call = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("IA não retornou dados estruturados");
    const extracted = JSON.parse(call.function.arguments);

    const contras = (extracted.contracheques ?? []).map((c: any, i: number) => ({
      id: crypto.randomUUID(),
      label: c.label || `Contracheque ${i + 1}`,
      valor_hra: Number(c.valor_hra) || 0,
      valor_ahra: Number(c.valor_ahra) || 0,
    }));

    await supabase
      .from("casos")
      .update({
        status: "aguardando_confirmacao",
        nome_cliente: extracted.nome_cliente ?? null,
        cpf: extracted.cpf ?? null,
        rg: extracted.rg ?? null,
        endereco: extracted.endereco ?? null,
        contracheques: contras,
        erro_processamento: null,
      })
      .eq("id", casoId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    console.error("extract-case-data error:", msg);
    if (casoId) {
      await supabase.from("casos").update({ erro_processamento: msg }).eq("id", casoId);
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
