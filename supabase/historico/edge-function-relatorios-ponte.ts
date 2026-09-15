// =====================================================================
// Edge Function a instalar NO PROJETO HISTÓRICO (pcquefluiltrvwjpndvw),
// com o nome `relatorios-ponte`. NÃO é implantada pelo aplicativo.
//
// Objetivo: permitir que o app leia agregados da base histórica sem que
// nenhuma chave de serviço histórica precise ser entregue ao app.
//   * a chave de serviço usada aqui é a SUPABASE_SERVICE_ROLE_KEY padrão
//     DO PRÓPRIO projeto histórico e nunca sai do backend;
//   * o token do usuário é validado CONTRA O AUTH DO APP, chamando
//     GET {APP_SUPABASE_URL}/auth/v1/user com a chave publishable pública
//     do app — o JWT jamais é apenas decodificado;
//   * a autorização é reconferida lendo `user_roles` no banco do app com o
//     token do próprio usuário (respeitando as políticas de acesso do app).
//
// Configuração exigida (secrets do projeto histórico):
//   APP_SUPABASE_URL              = https://<ref-do-app>.supabase.co
//   APP_SUPABASE_PUBLISHABLE_KEY  = chave publishable/anon pública do app
//   (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem por padrão)
//
// Configuração exigida no app: secret HISTORICO_PONTE_URL apontando para
//   https://pcquefluiltrvwjpndvw.supabase.co/functions/v1/relatorios-ponte
// e HISTORICO_PONTE_ANON_KEY com a chave publishable do projeto histórico.
//
// Contrato (POST, JSON):
//   entrada: { acao, temas, rubricas, empresas, de, ate, limit, offset, pessoa_id }
//     acao ∈ total_geral | totais_tema | por_pessoa | por_empresa | rubricas | lancamentos
//   saída 200: { disponivel: true, dados: [...] }
//           ou { disponivel: false, motivo: string }
//   saída 401: { error: "Unauthorized" }
// As funções SQL chamadas são as de supabase/historico/relatorio_rpcs.sql.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ACOES: Record<string, string> = {
  total_geral: "relatorio_total_geral",
  totais_tema: "relatorio_totais_tema",
  por_pessoa: "relatorio_por_pessoa",
  por_empresa: "relatorio_por_empresa",
  lancamentos: "relatorio_lancamentos_pessoa",
  rubricas: "relatorio_rubricas",
  opcoes_empresa: "relatorio_opcoes_empresa",
};

const texto = (v: unknown) => (typeof v === "string" ? v : null);

function sanitizarTemas(valor: unknown) {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const tema = texto(o.tema) ?? "";
      const termos = Array.isArray(o.termos)
        ? o.termos.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase().replace(/\s+/g, " ").trim()).filter(Boolean)
        : [];
      return { tema, termos };
    })
    .filter((t) => t.tema !== "" && t.termos.length > 0);
}

function sanitizarRubricas(valor: unknown) {
  if (!Array.isArray(valor)) return [];
  const vistas = new Set<string>();
  const saida: { codigo: string | null; descricao: string | null; tipo: string | null; empresa: string | null }[] = [];
  for (const r of valor) {
    const o = (r ?? {}) as Record<string, unknown>;
    const item = { codigo: texto(o.codigo), descricao: texto(o.descricao), tipo: texto(o.tipo), empresa: texto(o.empresa) };
    const k = JSON.stringify(item);
    if (!vistas.has(k)) {
      vistas.add(k);
      saida.push(item);
    }
  }
  return saida;
}

function sanitizarLista(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  const lista = valor.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  return lista.length > 0 ? lista : null;
}

/** Aceita MM/AAAA e AAAA-MM com mês válido; qualquer outro valor vira null. */
function sanitizarCompetencia(valor: unknown): string | null {
  const v = (texto(valor) ?? "").trim();
  const br = /^(\d{2})\/(\d{4})$/.exec(v);
  const iso = /^(\d{4})-(\d{2})$/.exec(v);
  const mes = br ? Number(br[1]) : iso ? Number(iso[2]) : Number.NaN;
  const ano = br ? br[2] : iso ? iso[1] : "";
  if (!Number.isFinite(mes) || mes < 1 || mes > 12 || Number(ano) < 1) return null;
  return `${String(mes).padStart(2, "0")}/${ano}`;
}

function inteiro(valor: unknown, padrao: number, maximo: number): number {
  const n = typeof valor === "number" ? Math.floor(valor) : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return padrao;
  return Math.min(n, maximo);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const APP_URL = Deno.env.get("APP_SUPABASE_URL");
    const APP_KEY = Deno.env.get("APP_SUPABASE_PUBLISHABLE_KEY");
    if (!APP_URL || !APP_KEY) return json({ disponivel: false, motivo: "Ponte histórica sem configuração do aplicativo." });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    // Validação real do token contra o Auth do aplicativo (nunca decodificar o JWT).
    const appUser = createClient(APP_URL, APP_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await appUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    // Autorização: o usuário precisa ter papel registrado no aplicativo.
    const { data: papeis, error: papeisErr } = await appUser
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (papeisErr) return json({ disponivel: false, motivo: `Não foi possível conferir a autorização: ${papeisErr.message}` });
    if (!papeis || papeis.length === 0) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const acao = texto(body?.acao) ?? "";
    const rpc = ACOES[acao];
    if (!rpc) return json({ error: "Ação inválida" }, 400);

    const params: Record<string, unknown> = {
      p_temas: sanitizarTemas(body?.temas),
      p_rubricas: sanitizarRubricas(body?.rubricas),
      p_empresas: sanitizarLista(body?.empresas),
      p_de: sanitizarCompetencia(body?.de),
      p_ate: sanitizarCompetencia(body?.ate),
    };
    if (acao === "opcoes_empresa") {
      params.p_busca = texto(body?.busca);
      params.p_limit = inteiro(body?.limit, 50, 500);
      params.p_offset = inteiro(body?.offset, 0, 1_000_000);
      delete params.p_temas;
      delete params.p_rubricas;
      delete params.p_empresas;
      delete params.p_de;
      delete params.p_ate;
    } else if (acao !== "total_geral" && acao !== "totais_tema") {
      params.p_limit = inteiro(body?.limit, 50, 500);
      params.p_offset = inteiro(body?.offset, 0, 1_000_000);
    }
    if (acao === "lancamentos") {
      const pessoa = (texto(body?.pessoa_id) ?? "").trim();
      if (!pessoa) return json({ error: "pessoa_id obrigatório" }, 400);
      params.p_pessoa_id = pessoa;
      params.p_limit = inteiro(body?.limit, 200, 1000);
    }

    const local = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const { data, error } = await local.rpc(rpc, params);
    if (error) return json({ disponivel: false, motivo: `A base histórica respondeu com erro: ${error.message}` });

    return json({ disponivel: true, dados: data ?? [] });
  } catch (e) {
    return json({ disponivel: false, motivo: (e as Error).message });
  }
});
