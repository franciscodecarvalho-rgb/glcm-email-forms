import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const MODELO = "google/gemini-2.5-pro";
const PROMPT = `Extraia somente dados pessoais visíveis em documentos brasileiros (CNH, RG, CIN, CPF e comprovante de residência). Não invente nem complete dados ausentes; use strings vazias quando ilegíveis. O campo rg pode receber RG ou CIN, nunca o registro da CNH. Endereço só pode vir de comprovante de residência ou se estiver explicitamente impresso. Classifique tipo_documento como cnh, rg, cin, cpf, comprovante_residencia ou outro.`;
const TOOL = { type: "function", function: { name: "registrar_documento_pessoal", parameters: { type: "object", properties: {
  tipo_documento: { type: "string" }, nome: { type: "string" }, cpf: { type: "string" }, rg: { type: "string" },
  nacionalidade: { type: "string" }, estado_civil: { type: "string" }, profissao: { type: "string" },
  endereco: { type: "object", properties: { logradouro: { type: "string" }, numero: { type: "string" }, bairro: { type: "string" }, cidade: { type: "string" }, estado: { type: "string" }, cep: { type: "string" } } },
}, additionalProperties: false } } };

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function base64(bytes: Uint8Array) { let value = ""; for (let i = 0; i < bytes.length; i += 0x8000) value += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(value); }
async function extrairComIa(blob: Blob, nome: string, apiKey: string) {
  const dataUrl = `data:${blob.type || "application/pdf"};base64,${base64(new Uint8Array(await blob.arrayBuffer()))}`;
  const resposta = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
    model: MODELO, messages: [{ role: "system", content: PROMPT }, { role: "user", content: [{ type: "text", text: `Arquivo: ${nome}` }, { type: "image_url", image_url: { url: dataUrl } }] }],
    tools: [TOOL], tool_choice: { type: "function", function: { name: "registrar_documento_pessoal" } },
  }) });
  if (resposta.status === 402) throw new Error("Créditos de IA do Lovable esgotados");
  if (!resposta.ok) throw new Error(`IA ${resposta.status}: ${(await resposta.text()).slice(0, 180)}`);
  const payload = await resposta.json();
  const argumentos = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argumentos) throw new Error("A IA não retornou dados estruturados");
  return JSON.parse(argumentos) as Record<string, any>;
}
const primeiro = (docs: Array<Record<string, any>>, campo: string) => docs.map((d) => d[campo]).find((v) => typeof v === "string" && v.trim()) || null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authError } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (authError || !user) return json({ error: "Não autenticado" }, 401);
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const arquivo = (await req.formData()).get("arquivo");
      if (!(arquivo instanceof File)) return json({ error: "arquivo PDF obrigatório" }, 400);
      if (arquivo.type !== "application/pdf") return json({ error: "O arquivo deve ser PDF" }, 400);
      if (arquivo.size > 10 * 1024 * 1024) return json({ error: "O PDF excede o limite de 10 MB" }, 400);
      const dados = await extrairComIa(arquivo, arquivo.name, apiKey);
      const camposAusentes = [!dados.nome && "nome", !dados.cpf && "cpf", !dados.rg && "rg"].filter(Boolean);
      return json({ ok: camposAusentes.length === 0, diagnostico: { arquivo: arquivo.name, tipo_documento: dados.tipo_documento, linhas_texto: 0, motivo: camposAusentes.length ? "campos_ausentes" : null }, dados, campos_ausentes: camposAusentes });
    }

    const { caso_id } = await req.json();
    if (!caso_id) return json({ error: "caso_id obrigatório" }, 400);
    const { data: caso, error: casoError } = await supabase.from("casos").select("id,nome_cliente,qualificacao,endereco").eq("id", caso_id).single();
    if (casoError || !caso) return json({ error: "Caso não encontrado" }, 404);
    const { data: arquivos, error: arquivosError } = await supabase.from("arquivos").select("nome,storage_path,mime_type").eq("caso_id", caso_id).eq("tipo", "informacoes_pessoais");
    if (arquivosError) throw arquivosError;
    if (!arquivos?.length) return json({ error: "Nenhum documento pessoal no caso" }, 400);

    const documentos: Array<Record<string, any>> = [];
    const revisao: Array<{ arquivo: string; motivo: string }> = [];
    for (const arquivo of arquivos) {
      try {
        if (arquivo.mime_type !== "application/pdf") throw new Error("formato_nao_pdf");
        const { data: blob, error } = await supabase.storage.from("casos-arquivos").download(arquivo.storage_path);
        if (error || !blob) throw error ?? new Error("falha_no_download");
        documentos.push({ arquivo: arquivo.nome, ...await extrairComIa(blob, arquivo.nome, apiKey) });
      } catch (error) { revisao.push({ arquivo: arquivo.nome, motivo: error instanceof Error ? error.message : "falha_na_extracao" }); }
    }
    if (!documentos.length) {
      await supabase.from("casos").update({ erro_processamento: "Documento pessoal precisa de revisão manual", status: "aguardando_confirmacao" }).eq("id", caso_id);
      return json({ ok: false, documentos, revisao });
    }

    const endereco = documentos.map((d) => d.endereco).find((v) => v && Object.values(v).some(Boolean)) ?? caso.endereco;
    const q = caso.qualificacao && typeof caso.qualificacao === "object" ? caso.qualificacao : {};
    const qualificacao = { ...q, nacionalidade: primeiro(documentos, "nacionalidade") ?? q.nacionalidade ?? "brasileiro", estado_civil: primeiro(documentos, "estado_civil") ?? q.estado_civil ?? null, profissao: primeiro(documentos, "profissao") ?? q.profissao ?? null, documentos_pessoais: documentos };
    const nome = primeiro(documentos, "nome"), cpf = primeiro(documentos, "cpf"), rg = primeiro(documentos, "rg");
    const { error: updateError } = await supabase.from("casos").update({ nome_cliente: nome ?? caso.nome_cliente, nome_pre_extraido: nome, cpf, cpf_pre_extraido: cpf, rg, endereco, qualificacao, erro_processamento: revisao.length ? `${revisao.length} documento(s) pessoal(is) precisam de revisão` : null, status: "aguardando_confirmacao" }).eq("id", caso_id);
    if (updateError) throw updateError;
    return json({ ok: true, documentos, revisao });
  } catch (error) {
    console.error("process-documentos-pessoais-pdf error", error);
    return json({ error: error instanceof Error ? error.message : "Erro ao processar documentos pessoais" }, 500);
  }
});
