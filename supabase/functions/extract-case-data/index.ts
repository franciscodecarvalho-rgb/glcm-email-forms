// Extrai dados dos arquivos do caso usando Lovable AI (Gemini com visão).
// Processa em LOTES: cada lote vira uma chamada à IA e, ao terminar, marca os
// arquivos do lote como processado=true — isso alimenta a barra de progresso e
// os checks por arquivo na tela, além de deixar cada chamada menor (mais rápido
// e confiável, sem estourar limites).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TAMANHO_LOTE = 8;

const SYSTEM_PROMPT = `Você é um assistente jurídico que extrai dados de documentos brasileiros (RG, CNH, CPF, comprovante de residência e contracheques) para uma ação de restituição de IR sobre HRA.

DADOS PESSOAIS (do RG/CNH/CPF e do comprovante): nome completo, CPF, RG e endereço completo. Se constar, capture também nacionalidade, estado civil e profissão (em geral NÃO constam nesses documentos — deixe em branco se não aparecerem).

EMPREGADOR(ES): do cabeçalho dos contracheques, capture a razão social e o CNPJ de cada empresa empregadora (deduplique).

CONTRACHEQUES — rubricas HRA (a parte mais importante): para CADA contracheque, identifique TODAS as linhas de PROVENTO cuja DESCRIÇÃO indique Hora de Repouso e Alimentação, em qualquer variação ou erro de OCR. NÃO se baseie no código numérico — baseie-se na descrição conter "HRA"/"AHRA". Exemplos que CONTAM: "Adicional HRA", "Adic HRA Eventual", "AHRA", "AHRA/Dobra de Turno", "Dif AHRA Dobra", "Dif Adicional HRA", "HRA", e grafias com ruído ("AdiconalHRA", "Dobra de Tumo", "Adicionál HRA").
EXCLUA: linhas de DESCONTO (ex: "Desc. Adicional HRA") e variantes marcadas como "Sem IR", "s/IRRF" ou "SEM IRRF" (não houve retenção nessas).
Para cada contracheque, some: valor_hra = soma das rubricas do tipo "Adicional HRA"; valor_ahra = soma das demais rubricas HRA/AHRA (AHRA, Dobra de Turno, diferenças, HRA avulso). Use a competência (mês/ano) como identificação.

Alguns documentos enviados podem não ser contracheques (ex: identidade, comprovante) — ignore-os para a lista de contracheques. Retorne SEMPRE via tool call.`;

const TOOLS = [
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
          qualificacao: {
            type: "object",
            description: "Qualificação do cliente, se constar (geralmente ausente nos documentos).",
            properties: {
              nacionalidade: { type: "string" },
              estado_civil: { type: "string" },
              profissao: { type: "string" },
            },
          },
          empregadores: {
            type: "array",
            description: "Empresas empregadoras, do cabeçalho dos contracheques (deduplicadas).",
            items: {
              type: "object",
              properties: {
                razao_social: { type: "string" },
                cnpj: { type: "string" },
              },
            },
          },
          contracheques: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Competência (mês/ano), ex: '07/2024'" },
                valor_hra: { type: "number", description: "Soma das rubricas de PROVENTO 'Adicional HRA' (pela descrição, não pelo código). Exclui descontos e variantes 'Sem IR'." },
                valor_ahra: { type: "number", description: "Soma das demais rubricas HRA/AHRA de PROVENTO (AHRA, Dobra de Turno, Dif AHRA/Dobra, HRA avulso). Exclui descontos e variantes 'Sem IR'." },
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

    // Processa em background (foge do limite de CPU). O cliente acompanha pelo status
    // do caso e pela coluna arquivos.processado.
    // @ts-ignore EdgeRuntime global
    EdgeRuntime.waitUntil(
      processarCaso(supabase, casoId, LOVABLE_API_KEY).catch(async (e: unknown) => {
        const msg = e instanceof Error ? e.message : "Erro";
        console.error("extract-case-data bg error:", msg);
        await supabase.from("casos").update({ erro_processamento: msg }).eq("id", casoId);
      }),
    );

    return new Response(JSON.stringify({ ok: true, status: "processing" }), {
      status: 202,
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

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function processarCaso(supabase: any, casoId: string, LOVABLE_API_KEY: string) {
  console.time("total");
  const { data: arquivos, error: aErr } = await supabase
    .from("arquivos")
    .select("*")
    .eq("caso_id", casoId);
  if (aErr) throw aErr;
  if (!arquivos || arquivos.length === 0) throw new Error("Nenhum arquivo no caso");

  // Zera o progresso (importante em reprocessamento).
  await supabase.from("arquivos").update({ processado: false }).eq("caso_id", casoId);

  const lotes = chunk(arquivos, TAMANHO_LOTE);
  const resultados: any[] = [];

  for (let i = 0; i < lotes.length; i++) {
    const lote = lotes[i];
    console.time(`lote-${i}`);
    const parcial = await processarLote(supabase, lote, LOVABLE_API_KEY);
    if (parcial) resultados.push(parcial);
    // Marca os arquivos deste lote como processados (alimenta a barra/checks).
    await supabase
      .from("arquivos")
      .update({ processado: true })
      .in("id", lote.map((a: any) => a.id));
    console.timeEnd(`lote-${i}`);
  }

  const dados = mesclarResultados(resultados);

  const contras = (dados.contracheques ?? []).map((c: any, i: number) => ({
    id: crypto.randomUUID(),
    label: c.label || `Contracheque ${i + 1}`,
    valor_hra: Number(c.valor_hra) || 0,
    valor_ahra: Number(c.valor_ahra) || 0,
  }));

  await supabase
    .from("casos")
    .update({
      status: "aguardando_confirmacao",
      nome_cliente: dados.nome_cliente ?? null,
      cpf: dados.cpf ?? null,
      rg: dados.rg ?? null,
      endereco: dados.endereco ?? null,
      qualificacao: dados.qualificacao ?? null,
      empregadores: dados.empregadores ?? [],
      contracheques: contras,
      erro_processamento: null,
    })
    .eq("id", casoId);
  console.timeEnd("total");
}

// Processa um lote de arquivos numa única chamada à IA.
async function processarLote(supabase: any, lote: any[], LOVABLE_API_KEY: string): Promise<any | null> {
  const content: any[] = [
    { type: "text", text: "Analise os documentos a seguir e extraia os dados estruturados via tool call." },
  ];

  const parts = await Promise.all(
    lote.map(async (arq: any) => {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("casos-arquivos")
        .download(arq.storage_path);
      if (dlErr || !blob) return null;
      const buf = new Uint8Array(await blob.arrayBuffer());
      let b64 = "";
      const ch = 0x8000;
      for (let i = 0; i < buf.length; i += ch) {
        b64 += String.fromCharCode(...buf.subarray(i, i + ch));
      }
      b64 = btoa(b64);
      const mime = arq.mime_type || "image/jpeg";
      return { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } };
    }),
  );
  for (const p of parts) if (p) content.push(p);
  if (content.length === 1) return null; // nenhum arquivo baixado

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Pro (não Flash): o Flash subcontou rubricas HRA no teste A/B (-22%).
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      tools: TOOLS,
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
  if (!call) return null;
  try {
    return JSON.parse(call.function.arguments);
  } catch {
    return null;
  }
}

// Junta os resultados parciais dos lotes num único conjunto.
function mesclarResultados(resultados: any[]): any {
  const primeiroTexto = (k: string) => {
    for (const r of resultados) {
      const v = r?.[k];
      if (v != null && String(v).trim() !== "") return v;
    }
    return null;
  };
  const primeiroObjeto = (k: string) => {
    for (const r of resultados) {
      const o = r?.[k];
      if (o && typeof o === "object" && Object.values(o).some((v) => v != null && String(v).trim() !== "")) {
        return o;
      }
    }
    return null;
  };

  const empregsBrutos = resultados.flatMap((r) => (Array.isArray(r?.empregadores) ? r.empregadores : []));
  const vistos = new Set<string>();
  const empregadores: any[] = [];
  for (const e of empregsBrutos) {
    const cnpj = (e?.cnpj ?? "").replace(/\D/g, "");
    const chave = cnpj || (e?.razao_social ?? "").trim().toLowerCase();
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    empregadores.push(e);
  }

  const contracheques = resultados.flatMap((r) => (Array.isArray(r?.contracheques) ? r.contracheques : []));

  return {
    nome_cliente: primeiroTexto("nome_cliente"),
    cpf: primeiroTexto("cpf"),
    rg: primeiroTexto("rg"),
    endereco: primeiroObjeto("endereco"),
    qualificacao: primeiroObjeto("qualificacao"),
    empregadores,
    contracheques,
  };
}
