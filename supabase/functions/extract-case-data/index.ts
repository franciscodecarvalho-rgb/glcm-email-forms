// Extrai dados dos arquivos do caso usando Lovable AI (Gemini com visão).
//
// Arquitetura FAN-OUT com POOL (v4): no máximo MAX_CONCORRENTES lotes ao
// mesmo tempo — disparar todos de uma vez (v3) derrubava o gateway de IA.
// - dispatcher (body {caso_id}): garante o plano de lotes (5 arquivos cada),
//   devolve erro/órfãos para a fila e dispara só os primeiros MAX_CONCORRENTES
//   workers. Retorna 202.
// - worker (body {caso_id, lote_id}): processa SÓ o seu lote (1 chamada de IA),
//   salva o resultado, ENCADEIA o próximo lote pendente (claim atômico) e, se a
//   fila acabou e ele for o último, finaliza o caso.
// - progress (body {caso_id, progress}): devolve o estado dos lotes para a tela
//   de progresso via service role (o front não depende de RLS para enxergar).
//
// Por que fan-out: processar todos os lotes numa invocação única em background
// estoura o wall-clock do Edge Runtime (~400s) SEM passar pelo catch — o caso
// ficava "Em Análise" para sempre, sem erro. Com 1 invocação por lote, cada uma
// cabe folgada no orçamento.
// - Falha custa 1 lote: "Reprocessar pendentes" refaz só pendente/erro/órfão.
// - Worker morto deixa o lote 'processando' órfão: o retry o reivindica por
//   idade (atualizado_em > 10 min).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 5 (e não 10): corpo da chamada menor, resposta da IA mais rápida, menos chance
// de o modelo pular linhas nos últimos documentos, e mais paralelismo no fan-out.
const TAMANHO_LOTE = 5;
const STALE_MS = 10 * 60 * 1000; // 'processando' sem update há 10 min = worker morto

// Pool: lotes de IA simultâneos. 14 chamadas paralelas (caso de 66 arquivos)
// derrubavam o gateway; 4 mantém paralelismo com folga de rate limit.
const MAX_CONCORRENTES = 4;
const TIMEOUT_IA_MS = 180_000; // fetch da IA sem timeout vira lote órfão silencioso
const TIMEOUT_DOWNLOAD_MS = 60_000;

// Pro (não Flash): no teste A/B o Flash subcontou rubricas HRA (-22%).
const MODELO = "google/gemini-2.5-pro";

const SYSTEM_PROMPT = `Você é um assistente jurídico que extrai dados de documentos brasileiros (RG, CNH, CPF, comprovante de residência e contracheques) para uma ação de restituição de IR sobre HRA.

DADOS PESSOAIS (do RG/CNH/CPF e do comprovante): nome completo, CPF, RG e endereço completo. Se constar, capture também nacionalidade, estado civil e profissão (em geral NÃO constam nesses documentos — deixe em branco se não aparecerem).

EMPREGADOR(ES): do cabeçalho dos contracheques, capture a razão social e o CNPJ de cada empresa empregadora (deduplique).

CONTRACHEQUES — para CADA contracheque:
1. TRANSCREVA TODAS as linhas da folha em itens[]: código, descrição, valor e tipo ("provento" ou "desconto") — salário, adicionais, HRA, INSS, IR, empréstimos, planos, TUDO, na ordem em que aparecem. Não pule linha nenhuma.
2. Capture também: salario_base, total_proventos, total_descontos, liquido e matricula do funcionário (quando visíveis).
3. Rubricas HRA (a parte mais importante do cálculo): identifique TODAS as linhas de PROVENTO cuja DESCRIÇÃO indique Hora de Repouso e Alimentação, em qualquer variação ou erro de OCR. NÃO se baseie no código numérico — baseie-se na descrição conter "HRA"/"AHRA". Exemplos que CONTAM: "Adicional HRA", "Adic HRA Eventual", "AHRA", "AHRA/Dobra de Turno", "Dif AHRA Dobra", "Dif Adicional HRA", "HRA", e grafias com ruído ("AdiconalHRA", "Dobra de Tumo", "Adicionál HRA"). EXCLUA da soma: linhas de DESCONTO (ex: "Desc. Adicional HRA") e variantes "Sem IR"/"s/IRRF"/"SEM IRRF" (sem retenção). Some: valor_hra = rubricas "Adicional HRA"; valor_ahra = demais rubricas HRA/AHRA (AHRA, Dobra de Turno, diferenças, HRA avulso).
4. Use a competência (mês/ano) como label e informe em "arquivo" o nome do arquivo indicado no texto imediatamente antes de cada documento.

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
                arquivo: { type: "string", description: "Nome do arquivo de origem (texto antes do documento)" },
                matricula: { type: "string", description: "Matrícula do funcionário no cabeçalho do contracheque" },
                salario_base: { type: "number" },
                total_proventos: { type: "number" },
                total_descontos: { type: "number" },
                liquido: { type: "number" },
                valor_hra: { type: "number", description: "Soma das rubricas de PROVENTO 'Adicional HRA' (pela descrição, não pelo código). Exclui descontos e variantes 'Sem IR'." },
                valor_ahra: { type: "number", description: "Soma das demais rubricas HRA/AHRA de PROVENTO (AHRA, Dobra de Turno, Dif AHRA/Dobra, HRA avulso). Exclui descontos e variantes 'Sem IR'." },
                itens: {
                  type: "array",
                  description: "TODAS as linhas da folha, na ordem (proventos e descontos).",
                  items: {
                    type: "object",
                    properties: {
                      codigo: { type: "string" },
                      descricao: { type: "string" },
                      valor: { type: "number" },
                      tipo: { type: "string", description: "'provento' ou 'desconto'" },
                    },
                    required: ["descricao", "valor"],
                  },
                },
              },
              required: ["label", "valor_hra", "valor_ahra", "itens"],
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

    // Modo progress: estado dos lotes para a UI (service role ignora RLS).
    if (body.progress) {
      const { data } = await supabase
        .from("lotes_extracao")
        .select("id, ordem, arquivo_ids, status, erro, atualizado_em")
        .eq("caso_id", casoId)
        .order("ordem");
      return new Response(JSON.stringify({ lotes: data ?? [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    // Modo worker: processa UM lote em background e devolve 202 já.
    if (body.lote_id) {
      // @ts-ignore EdgeRuntime global
      EdgeRuntime.waitUntil(
        trabalharLote(supabase, casoId, body.lote_id, LOVABLE_API_KEY).catch(async (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Erro";
          console.error(`worker lote ${body.lote_id} error:`, msg);
          await supabase
            .from("lotes_extracao")
            .update({ status: "erro", erro: msg, atualizado_em: new Date().toISOString() })
            .eq("id", body.lote_id);
        }),
      );
      return new Response(JSON.stringify({ ok: true, status: "worker" }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo dispatcher: garante o plano e dispara um worker por lote pendente.
    // @ts-ignore EdgeRuntime global
    EdgeRuntime.waitUntil(
      despachar(supabase, casoId).catch(async (e: unknown) => {
        const msg = e instanceof Error ? e.message : "Erro";
        console.error("dispatcher error:", msg);
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const agoraIso = () => new Date().toISOString();

// ---------------- dispatcher ----------------
async function despachar(supabase: any, casoId: string) {
  // Limpa o claim de finalização de execuções anteriores (permite re-finalizar).
  await supabase.from("finalizacoes_extracao").delete().eq("caso_id", casoId);

  const { data: arquivos, error: aErr } = await supabase
    .from("arquivos")
    .select("id")
    .eq("caso_id", casoId);
  if (aErr) throw aErr;
  if (!arquivos || arquivos.length === 0) throw new Error("Nenhum arquivo no caso");

  let { data: lotes } = await supabase
    .from("lotes_extracao")
    .select("*")
    .eq("caso_id", casoId)
    .order("ordem");

  // Replaneja com o tamanho atual se NADA foi concluído ainda (planos antigos
  // eram de 10 arquivos por lote; o que já deu certo nunca é descartado).
  const nadaConcluido = (lotes ?? []).every((l: any) => l.status !== "concluido");
  const planoGrande = (lotes ?? []).some((l: any) => (l.arquivo_ids?.length ?? 0) > TAMANHO_LOTE);
  if ((lotes ?? []).length > 0 && nadaConcluido && planoGrande) {
    await supabase.from("lotes_extracao").delete().eq("caso_id", casoId);
    lotes = [];
  }

  if (!lotes || lotes.length === 0) {
    const grupos = chunk(arquivos, TAMANHO_LOTE);
    const inserts = grupos.map((g, i) => ({
      caso_id: casoId,
      ordem: i,
      arquivo_ids: g.map((a: any) => a.id),
      status: "pendente",
    }));
    const { data: criados, error: insErr } = await supabase
      .from("lotes_extracao")
      .insert(inserts)
      .select("*");
    if (insErr) throw insErr;
    lotes = (criados ?? []).sort((a: any, b: any) => a.ordem - b.ordem);
    await supabase.from("arquivos").update({ processado: false }).eq("caso_id", casoId);
  }

  // Alvos: pendente, erro, ou 'processando' órfão (worker morreu sem atualizar).
  const agora = Date.now();
  const alvos = (lotes ?? []).filter(
    (l: any) =>
      l.status === "pendente" ||
      l.status === "erro" ||
      (l.status === "processando" && agora - new Date(l.atualizado_em).getTime() > STALE_MS),
  );

  if (alvos.length === 0) {
    // Nada a despachar: ou tudo concluiu (finaliza agora) ou há workers vivos.
    await verificarConclusao(supabase, casoId);
    return;
  }

  // Devolve erro/órfãos para a fila: quem processa cada lote é decidido pelo
  // claim atômico (abaixo), imune a retry simultâneo.
  const naoPendentes = alvos.filter((l: any) => l.status !== "pendente").map((l: any) => l.id);
  if (naoPendentes.length > 0) {
    await supabase
      .from("lotes_extracao")
      .update({ status: "pendente", erro: null, atualizado_em: agoraIso() })
      .in("id", naoPendentes);
  }

  // Pool: dispara só os primeiros MAX_CONCORRENTES workers; cada worker encadeia
  // o próximo lote pendente ao terminar o seu.
  let disparados = 0;
  for (let i = 0; i < MAX_CONCORRENTES; i++) {
    const lote = await claimProximoLote(supabase, casoId);
    if (!lote) break;
    await dispararWorker(supabase, casoId, lote);
    disparados++;
  }
  console.log(
    `dispatcher: ${disparados} worker(s) iniciais para ${alvos.length} lote(s) a fazer (pool=${MAX_CONCORRENTES})`,
  );
}

// Claim atômico do próximo lote pendente (ordem crescente): o eq(status,
// 'pendente') garante que cada lote sai da fila UMA vez, mesmo em corrida
// entre workers/dispatcher.
async function claimProximoLote(supabase: any, casoId: string): Promise<any | null> {
  const { data: candidatos } = await supabase
    .from("lotes_extracao")
    .select("id, ordem")
    .eq("caso_id", casoId)
    .eq("status", "pendente")
    .order("ordem")
    .limit(MAX_CONCORRENTES);
  for (const cand of candidatos ?? []) {
    const { data: claimed } = await supabase
      .from("lotes_extracao")
      .update({ status: "processando", erro: null, atualizado_em: agoraIso() })
      .eq("id", cand.id)
      .eq("status", "pendente")
      .select("id, ordem");
    if ((claimed ?? []).length > 0) return claimed[0];
  }
  return null;
}

// Invoca esta própria função para um lote já claimado. Falha de disparo marca
// o lote como erro (nunca silencioso) — "Reprocessar pendentes" o recupera.
async function dispararWorker(supabase: any, casoId: string, lote: any) {
  const base = Deno.env.get("SUPABASE_URL")!;
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const r = await fetch(`${base}/functions/v1/extract-case-data`, {
      method: "POST",
      headers: { Authorization: `Bearer ${srk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ caso_id: casoId, lote_id: lote.id }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await r.text();
  } catch (e) {
    const msg = `disparo falhou: ${e instanceof Error ? e.message : e}`;
    console.error(`lote ${lote.ordem}:`, msg);
    await supabase
      .from("lotes_extracao")
      .update({ status: "erro", erro: msg, atualizado_em: agoraIso() })
      .eq("id", lote.id);
  }
}

// ---------------- worker (1 lote por invocação) ----------------
async function trabalharLote(supabase: any, casoId: string, loteId: string, LOVABLE_API_KEY: string) {
  const { data: lote, error: lErr } = await supabase
    .from("lotes_extracao")
    .select("*")
    .eq("id", loteId)
    .single();
  if (lErr || !lote) throw new Error(`lote ${loteId} não encontrado`);

  const { data: arqs, error: aErr } = await supabase
    .from("arquivos")
    .select("*")
    .in("id", lote.arquivo_ids);
  if (aErr) throw aErr;

  const t0 = Date.now();
  try {
    const resultado = await processarLote(supabase, arqs ?? [], LOVABLE_API_KEY);
    await supabase
      .from("lotes_extracao")
      .update({ status: "concluido", resultado, erro: null, atualizado_em: agoraIso() })
      .eq("id", loteId);
    await supabase.from("arquivos").update({ processado: true }).in("id", lote.arquivo_ids);
    console.log(`lote ordem=${lote.ordem} concluido duracao_ms=${Date.now() - t0} arquivos=${lote.arquivo_ids.length}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`lote ordem=${lote.ordem} falhou duracao_ms=${Date.now() - t0}:`, msg);
    await supabase
      .from("lotes_extracao")
      .update({ status: "erro", erro: msg, atualizado_em: agoraIso() })
      .eq("id", loteId);
  }

  // Encadeia o próximo lote pendente (mantém o pool cheio); depois verifica se
  // o caso terminou — se ainda há lote em andamento, verificarConclusao só retorna.
  const proximo = await claimProximoLote(supabase, casoId);
  if (proximo) await dispararWorker(supabase, casoId, proximo);
  await verificarConclusao(supabase, casoId);
}

// Chamada por todo worker ao terminar: o último finaliza o caso. O claim por
// PK em finalizacoes_extracao garante UM finalizador mesmo em empate.
async function verificarConclusao(supabase: any, casoId: string) {
  const { data: lotes } = await supabase
    .from("lotes_extracao")
    .select("*")
    .eq("caso_id", casoId)
    .order("ordem");
  if (!lotes || lotes.length === 0) return;
  if (lotes.some((l: any) => l.status === "pendente" || l.status === "processando")) return;

  const comErro = lotes.filter((l: any) => l.status !== "concluido");
  if (comErro.length > 0) {
    const motivo = comErro.find((l: any) => l.erro)?.erro ?? "";
    await supabase
      .from("casos")
      .update({
        erro_processamento:
          `${comErro.length} de ${lotes.length} lote(s) falharam` +
          (motivo ? ` — ${motivo.slice(0, 220)}` : "") +
          `. Clique em "Reprocessar pendentes" — o que já deu certo é mantido.`,
      })
      .eq("id", casoId);
    return;
  }

  let venceu = true;
  const { data: claim, error: cErr } = await supabase
    .from("finalizacoes_extracao")
    .upsert({ caso_id: casoId }, { onConflict: "caso_id", ignoreDuplicates: true })
    .select();
  // Tabela ausente (migration não aplicada): segue sem claim — a finalização é
  // idempotente e o risco de empate exato é pequeno.
  if (!cErr) venceu = (claim ?? []).length > 0;
  if (!venceu) return;

  try {
    await finalizarCaso(supabase, casoId, lotes);
  } catch (e) {
    // Erro de finalização é do CASO, não do lote — e libera o claim p/ retry.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("finalizarCaso:", msg);
    await supabase.from("finalizacoes_extracao").delete().eq("caso_id", casoId);
    await supabase.from("casos").update({ erro_processamento: msg }).eq("id", casoId);
  }
}

// ---------------- validação cruzada (barata, sem IA) ----------------
// Sinaliza contracheque suspeito para revisão humana em vez de aceitar em
// silêncio. Não bloqueia: o fluxo já passa pela tela de confirmação.

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// "07/2024", "jul/2024", "2024-07" etc. → "07/2024" (ou null se irreconhecível).
function normalizarCompetencia(label: string): string | null {
  const s = String(label ?? "");
  let m = s.match(/\b(0?[1-9]|1[0-2])\s*\/\s*((?:19|20)\d{2})\b/);
  if (m) return `${m[1].padStart(2, "0")}/${m[2]}`;
  m = s.match(/\b((?:19|20)\d{2})\s*-\s*(0?[1-9]|1[0-2])\b/);
  if (m) return `${m[2].padStart(2, "0")}/${m[1]}`;
  return null;
}

// Flags de um contracheque: checksum de totais + nome do arquivo (padrão
// "matricula-AAAAMM-...") vs dados extraídos.
function validarContracheque(c: any): string[] {
  const flags: string[] = [];
  const itens = Array.isArray(c.itens) ? c.itens : [];
  const ehDesconto = (it: any) => String(it?.tipo ?? "").toLowerCase().startsWith("desc");

  // Checksum: a soma das linhas transcritas deve bater com o total declarado na
  // própria folha. Divergência = provável linha pulada ou valor errado.
  const somaProventos = itens.filter((it: any) => !ehDesconto(it)).reduce((s: number, it: any) => s + (Number(it.valor) || 0), 0);
  const somaDescontos = itens.filter(ehDesconto).reduce((s: number, it: any) => s + (Number(it.valor) || 0), 0);
  const totProv = numOuNull(c.total_proventos);
  const totDesc = numOuNull(c.total_descontos);
  if (itens.length > 0 && totProv != null && Math.abs(somaProventos - totProv) > 0.05) {
    flags.push(`Soma dos proventos transcritos (${fmtBRL(somaProventos)}) difere do total declarado na folha (${fmtBRL(totProv)})`);
  }
  if (itens.length > 0 && totDesc != null && Math.abs(somaDescontos - totDesc) > 0.05) {
    flags.push(`Soma dos descontos transcritos (${fmtBRL(somaDescontos)}) difere do total declarado na folha (${fmtBRL(totDesc)})`);
  }

  // Nome do arquivo no padrão "matricula-AAAAMM-...": fonte independente para
  // conferir competência e matrícula extraídas.
  const nomeArq = String(c.arquivo ?? "");
  const mArq = nomeArq.match(/^(\d{4,})-((?:19|20)\d{2})(0[1-9]|1[0-2])\b/);
  if (mArq) {
    const compArquivo = `${mArq[3]}/${mArq[2]}`;
    const compExtraida = normalizarCompetencia(c.label);
    if (compExtraida && compExtraida !== compArquivo) {
      flags.push(`Competência extraída (${compExtraida}) difere da do nome do arquivo (${compArquivo})`);
    }
    const matExtraida = String(c.matricula ?? "").replace(/\D/g, "");
    if (matExtraida && matExtraida !== mArq[1]) {
      flags.push(`Matrícula extraída (${matExtraida}) difere da do nome do arquivo (${mArq[1]})`);
    }
  }
  return flags;
}

// Tudo concluído: mescla os resultados salvos e finaliza o caso.
async function finalizarCaso(supabase: any, casoId: string, lotes: any[]) {
  const dados = mesclarResultados(lotes.map((l: any) => l.resultado).filter(Boolean));

  // Competências repetidas no caso (pode ser legítimo: 13º/férias/ajuste do
  // mesmo mês — por isso é aviso de revisão, não erro).
  const porCompetencia = new Map<string, number>();
  for (const c of dados.contracheques ?? []) {
    const comp = normalizarCompetencia(c.label);
    if (comp) porCompetencia.set(comp, (porCompetencia.get(comp) ?? 0) + 1);
  }

  const contras = (dados.contracheques ?? []).map((c: any, i: number) => {
    const flags = validarContracheque(c);
    const comp = normalizarCompetencia(c.label);
    if (comp && (porCompetencia.get(comp) ?? 0) > 1) {
      flags.push(`Competência ${comp} aparece em mais de um contracheque (confira se é 13º/férias/ajuste)`);
    }
    return {
      id: crypto.randomUUID(),
      label: c.label || `Contracheque ${i + 1}`,
      valor_hra: Number(c.valor_hra) || 0,
      valor_ahra: Number(c.valor_ahra) || 0,
      ...(flags.length > 0 ? { flags } : {}),
    };
  });

  // Guarda: muitos arquivos e 0 contracheques = algo errado; não salvar R$ 0.
  const { count: totalArquivos } = await supabase
    .from("arquivos")
    .select("id", { count: "exact", head: true })
    .eq("caso_id", casoId);
  if ((totalArquivos ?? 0) >= 5 && contras.length === 0) {
    throw new Error(
      `Extração retornou 0 contracheques para ${totalArquivos} arquivos — provável falha. Clique em "Tentar novamente".`,
    );
  }

  // Persistência granular: TODA rubrica de TODO contracheque nas tabelas
  // contracheques/itens_contracheque (decisão: o banco guarda tudo estruturado).
  await persistirGranular(supabase, casoId, dados.contracheques ?? []);

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
  console.log(`caso ${casoId} finalizado: ${contras.length} contracheques`);
}

// Erro sem retry: repetir não muda o resultado (créditos, autenticação).
function erroFatal(msg: string): Error {
  const e = new Error(msg) as Error & { semRetry?: boolean };
  e.semRetry = true;
  return e;
}

// Baixa um arquivo do Storage como parte image_url (com 1 retry). O download do
// SDK não aceita AbortSignal — o race impede o worker de pendurar para sempre.
async function baixarParte(supabase: any, arq: any): Promise<any | null> {
  for (let t = 0; t < 2; t++) {
    const { data: blob, error } = await Promise.race([
      supabase.storage.from("casos-arquivos").download(arq.storage_path),
      sleep(TIMEOUT_DOWNLOAD_MS).then(() => ({ data: null, error: new Error("timeout no download") })),
    ]);
    if (!error && blob) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      let b64 = "";
      const ch = 0x8000;
      for (let i = 0; i < buf.length; i += ch) b64 += String.fromCharCode(...buf.subarray(i, i + ch));
      b64 = btoa(b64);
      const mime = arq.mime_type || "image/jpeg";
      return { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } };
    }
    await sleep(400);
  }
  return null;
}

// Processa um lote numa chamada à IA, com até 3 tentativas. LANÇA erro em falha
// persistente (nunca retorna vazio em silêncio).
async function processarLote(supabase: any, lote: any[], LOVABLE_API_KEY: string): Promise<any> {
  let ultimoErro = "desconhecido";
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const content: any[] = [
        { type: "text", text: "Analise os documentos a seguir e extraia os dados estruturados via tool call." },
      ];
      const partes = await Promise.all(lote.map((arq: any) => baixarParte(supabase, arq)));
      let baixados = 0;
      partes.forEach((p, i) => {
        if (!p) return;
        // Nome do arquivo antes de cada documento (rastreabilidade: campo "arquivo").
        content.push({ type: "text", text: `Arquivo: ${lote[i].nome ?? ""}` });
        content.push(p);
        baixados++;
      });
      if (baixados < lote.length) {
        throw new Error(`só ${baixados}/${lote.length} arquivos do lote baixaram`);
      }

      const t0 = Date.now();
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODELO,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content },
          ],
          tools: TOOLS,
          tool_choice: { type: "function", function: { name: "registrar_dados_caso" } },
        }),
        signal: AbortSignal.timeout(TIMEOUT_IA_MS),
      });
      if (aiResp.status === 402) {
        throw erroFatal("Créditos de IA esgotados. Adicione créditos no workspace Lovable.");
      }
      if (aiResp.status === 401 || aiResp.status === 403) {
        const txt = await aiResp.text().catch(() => "");
        throw erroFatal(
          `Gateway de IA recusou a autenticação (${aiResp.status}). Verifique a LOVABLE_API_KEY nos ` +
            `Secrets do Supabase — um redeploy das funções pelo Lovable re-provisiona a chave. ` +
            `Detalhe: ${txt.slice(0, 120)}`,
        );
      }
      if (!aiResp.ok) {
        const txt = await aiResp.text().catch(() => "");
        throw new Error(`IA ${aiResp.status}: ${txt.slice(0, 160)}`);
      }
      const aiJson = await aiResp.json();
      const call = aiJson.choices?.[0]?.message?.tool_calls?.[0];
      if (!call) throw new Error("IA não retornou tool call");
      console.log(`ia ok tentativa=${tentativa} duracao_ms=${Date.now() - t0} arquivos=${lote.length}`);
      return JSON.parse(call.function.arguments);
    } catch (e) {
      if ((e as { semRetry?: boolean })?.semRetry) throw e;
      ultimoErro = e instanceof Error ? e.message : String(e);
      console.error(`processarLote tentativa=${tentativa}:`, ultimoErro);
      // Rate limit/indisponibilidade do gateway: espera longa com jitter para as
      // tentativas não colidirem entre workers do pool.
      const rateLimit = /IA (429|503)/.test(ultimoErro);
      const espera = (rateLimit ? 15_000 * tentativa : 800 * tentativa) + Math.random() * 1000;
      await sleep(espera);
    }
  }
  throw new Error(`Lote falhou após 3 tentativas: ${ultimoErro}`);
}

// ---------------- persistência granular (espelho de src/lib/hra-catalog.ts) ----------------
// Classifica a família HRA pela DESCRIÇÃO (tolerante a OCR). Mantido inline:
// Edge Functions deste projeto são arquivo único (deploy não maneja _shared).
function normalizarDesc(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function classificarFamiliaHra(descricao: string): string | null {
  const n = normalizarDesc(descricao);
  if (!/hra/.test(n)) return null;
  if (/\bdif/.test(n) || /\bdi\b/.test(n)) return "dif_ahra";
  if (/dobra/.test(n)) return "ahra_dobra";
  if (/adic/.test(n)) return "adicional_hra";
  if (/ahra/.test(n)) return "ahra";
  return "hra";
}

const numOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Grava a folha completa: 1 linha por contracheque + 1 linha por rubrica.
// Idempotente (delete + insert) para suportar reprocessamento.
async function persistirGranular(supabase: any, casoId: string, contracheques: any[]) {
  await supabase.from("contracheques").delete().eq("caso_id", casoId);
  if (!contracheques.length) return;

  const rows = contracheques.map((c: any) => ({
    caso_id: casoId,
    competencia: c.label ?? null,
    salario_base: numOuNull(c.salario_base),
    total_proventos: numOuNull(c.total_proventos),
    total_descontos: numOuNull(c.total_descontos),
    liquido: numOuNull(c.liquido),
    arquivo_origem: c.arquivo ?? null,
  }));
  const { data: inseridos, error: insErr } = await supabase
    .from("contracheques")
    .insert(rows)
    .select("id");
  if (insErr) throw insErr;

  const itens: any[] = [];
  contracheques.forEach((c: any, i: number) => {
    const lista = Array.isArray(c.itens) ? c.itens : [];
    for (const it of lista) {
      itens.push({
        contracheque_id: inseridos[i].id,
        codigo: it.codigo ?? null,
        descricao: it.descricao ?? "",
        valor: Number(it.valor) || 0,
        tipo: String(it.tipo ?? "").toLowerCase().startsWith("desc") ? "desconto" : "provento",
        familia_hra: classificarFamiliaHra(it.descricao ?? ""),
      });
    }
  });
  for (let i = 0; i < itens.length; i += 400) {
    const { error: itErr } = await supabase.from("itens_contracheque").insert(itens.slice(i, i + 400));
    if (itErr) throw itErr;
  }
  console.log(`granular: ${rows.length} contracheques, ${itens.length} itens`);
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
