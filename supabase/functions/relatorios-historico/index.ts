// Edge function: relatorios-historico
// Ponte somente-leitura com a base histórica (fonte 2 do relatório de temas).
// A chamada exige usuário autenticado no aplicativo; a credencial da base
// histórica fica apenas no servidor (secrets) e nunca é devolvida ao navegador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ACOES: Record<string, string> = {
  total_geral: "relatorio_total_geral",
  totais_tema: "relatorio_totais_tema",
  por_pessoa: "relatorio_por_pessoa",
  por_empresa: "relatorio_por_empresa",
  lancamentos: "relatorio_lancamentos_pessoa",
  rubricas: "relatorio_rubricas",
};

function sanitizarTemas(valor: unknown): { tema: string; termos: string[] }[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((t) => {
      const obj = (t ?? {}) as Record<string, unknown>;
      const tema = typeof obj.tema === "string" ? obj.tema : "";
      const termos = Array.isArray(obj.termos)
        ? obj.termos
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.toLowerCase().replace(/\s+/g, " ").trim())
            .filter(Boolean)
        : [];
      return { tema, termos };
    })
    .filter((t) => t.tema !== "" && t.termos.length > 0);
}

function sanitizarRubricas(valor: unknown): { codigo: string | null; descricao: string | null; tipo: string | null; empresa: string | null }[] {
  if (!Array.isArray(valor)) return [];
  const txt = (v: unknown) => (typeof v === "string" ? v : null);
  const vistas = new Set<string>();
  const saida: { codigo: string | null; descricao: string | null; tipo: string | null; empresa: string | null }[] = [];
  for (const r of valor) {
    const o = (r ?? {}) as Record<string, unknown>;
    const item = { codigo: txt(o.codigo), descricao: txt(o.descricao), tipo: txt(o.tipo), empresa: txt(o.empresa) };
    const k = JSON.stringify(item);
    if (vistas.has(k)) continue;
    vistas.add(k);
    saida.push(item);
  }
  return saida;
}

function sanitizarLista(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  const lista = valor.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  return lista.length > 0 ? lista : null;
}

function sanitizarCompetencia(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  const br = /^(\d{2})\/(\d{4})$/.exec(v);
  const iso = /^(\d{4})-(\d{2})$/.exec(v);
  const mes = br ? Number(br[1]) : iso ? Number(iso[2]) : Number.NaN;
  const ano = br ? br[2] : iso ? iso[1] : "";
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) return null;
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing token" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    // Modo preferencial: ponte instalada no próprio projeto histórico
    // (supabase/historico/edge-function-relatorios-ponte.ts). Nenhuma chave de
    // serviço histórica precisa existir aqui; o token do usuário é repassado e
    // validado lá contra o Auth do aplicativo.
    const PONTE_URL = Deno.env.get("HISTORICO_PONTE_URL");
    const PONTE_KEY = Deno.env.get("HISTORICO_PONTE_ANON_KEY");
    if (PONTE_URL && PONTE_KEY) {
      const corpo = await req.text();
      const resp = await fetch(PONTE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          apikey: PONTE_KEY,
        },
        body: corpo || "{}",
      });
      const texto = await resp.text();
      if (!resp.ok) {
        return json({ disponivel: false, motivo: `A ponte histórica respondeu ${resp.status}.` }, 200);
      }
      return new Response(texto, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const HIST_URL = Deno.env.get("HISTORICO_SUPABASE_URL");
    const HIST_KEY = Deno.env.get("HISTORICO_SUPABASE_SERVICE_ROLE_KEY");
    if (!HIST_URL || !HIST_KEY) {
      return json(
        {
          disponivel: false,
          motivo:
            "A base histórica ainda não está configurada neste ambiente. Cadastre as credenciais de leitura em Configurações do Projeto → Secrets.",
        },
        200,
      );
    }

    const body = await req.json().catch(() => ({}));
    const acao = typeof body?.acao === "string" ? body.acao : "";
    const rpc = ACOES[acao];
    if (!rpc) return json({ error: "Ação inválida" }, 400);

    const params: Record<string, unknown> = {
      p_temas: sanitizarTemas(body?.temas),
      p_rubricas: sanitizarRubricas(body?.rubricas),
      p_empresas: sanitizarLista(body?.empresas),
      p_de: sanitizarCompetencia(body?.de),
      p_ate: sanitizarCompetencia(body?.ate),
    };
    if (acao !== "total_geral" && acao !== "totais_tema") {
      params.p_limit = inteiro(body?.limit, 50, 500);
      params.p_offset = inteiro(body?.offset, 0, 1_000_000);
    }
    if (acao === "lancamentos") {
      const pessoa = typeof body?.pessoa_id === "string" ? body.pessoa_id.trim() : "";
      if (!pessoa) return json({ error: "pessoa_id obrigatório" }, 400);
      params.p_pessoa_id = pessoa;
      params.p_limit = inteiro(body?.limit, 200, 1000);
    }

    const historico = createClient(HIST_URL, HIST_KEY, { auth: { persistSession: false } });
    const { data, error } = await historico.rpc(rpc, params);
    if (error) {
      return json(
        {
          disponivel: false,
          motivo: `A base histórica respondeu com erro: ${error.message}`,
        },
        200,
      );
    }

    return json({ disponivel: true, dados: data ?? [] });
  } catch (e) {
    return json({ disponivel: false, motivo: (e as Error).message }, 200);
  }
});
