/**
 * Regra de composição do MVP de Temas:
 * um tema é definido por um ou mais termos de inclusão. Uma rubrica corresponde
 * ao tema quando a descrição contém, literalmente, qualquer um dos termos
 * (combinação por OU). A comparação ignora maiúsculas/minúsculas e trata
 * sequências de espaços como um único espaço. Curingas digitados pelo usuário
 * são escapados e valem como caractere literal.
 */
import { supabase } from "@/integrations/supabase/client";

export const HISTORICO_PONTE_URL = "https://pcquefluiltrvwjpndvw.supabase.co/functions/v1/relatorios-ponte";

export type RubricaDataLake = {
  codigo: string | null;
  descricao: string | null;
  tipo: string | null;
  empresa_id?: string | null;
  empresa: string | null;
  itens?: number | null;
  proventos?: number | null;
  descontos?: number | null;
  total_linhas?: number | null;
  ocorrencias?: number | null;
};

/** Normaliza um termo: minúsculas, espaços repetidos colapsados, sem bordas. */
export function normalizarTermo(valor: string | null | undefined): string {
  return (valor ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Dois termos são equivalentes quando suas formas normalizadas coincidem. */
export function termosEquivalentes(a: string, b: string): boolean {
  return normalizarTermo(a) === normalizarTermo(b);
}

/** Remove duplicatas (pela forma normalizada) preservando a ordem original. */
export function deduplicarTermos(termos: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const termo of termos) {
    const chave = normalizarTermo(termo);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(termo.replace(/\s+/g, " ").trim());
  }
  return saida;
}

/** Escapa curingas de LIKE para que sejam tratados como caractere literal. */
export function escaparCuringas(termo: string): string {
  return termo.replace(/([\\%_])/g, "\\$1");
}

/**
 * Verificação local da regra: a descrição contém literalmente algum dos termos.
 * Usada nos testes e como conferência do resultado vindo do banco.
 */
export function descricaoCorrespondeAosTermos(
  descricao: string | null | undefined,
  termos: string[],
): boolean {
  const alvo = normalizarTermo(descricao);
  if (!alvo) return false;
  return termos.some((termo) => {
    const t = normalizarTermo(termo);
    return t.length > 0 && alvo.includes(t);
  });
}

/**
 * Monta o filtro de busca por descrição (OU literal entre os termos)
 * no formato aceito pelo cliente do banco.
 */
export function montarFiltroDescricao(termos: string[]): string | null {
  const partes = deduplicarTermos(termos).map((termo) => {
    const valor = escaparCuringas(normalizarTermo(termo)).replace(/"/g, '\\"');
    return `descricao.ilike."*${valor}*"`;
  });
  return partes.length > 0 ? partes.join(",") : null;
}

/**
 * Gravação atômica de tema e termos via RPC do servidor.
 */
export async function salvarTemaMotor(params: {
  nome: string;
  termos: string[];
  descricao?: string | null;
  ativo?: boolean;
  temaId?: string | null;
}): Promise<string> {
  const nomeLimpo = params.nome.replace(/\s+/g, " ").trim();
  if (!nomeLimpo) throw new Error("Informe o nome do tema");
  const listaTermos = deduplicarTermos(params.termos);
  if (listaTermos.length === 0) throw new Error("Informe ao menos um termo de inclusão");

  const { data, error } = await supabase.rpc("salvar_tema", {
    p_nome: nomeLimpo,
    p_termos: listaTermos,
    p_descricao: params.descricao?.trim() || null,
    p_ativo: params.ativo ?? true,
    p_tema_id: params.temaId ?? null,
  });

  if (error) throw error;
  return data as string;
}

/**
 * Exclusão de tema e seus termos em cascata.
 */
export async function excluirTemaMotor(temaId: string): Promise<void> {
  if (!temaId) throw new Error("ID do tema é obrigatório");
  const { error } = await supabase.rpc("excluir_tema", {
    p_tema_id: temaId,
  });
  if (error) {
    // Fallback direto via tabela caso a nova RPC ainda esteja sendo propagada
    const { error: fallbackErr } = await supabase.from("temas").delete().eq("id", temaId);
    if (fallbackErr) throw fallbackErr;
  }
}

/**
 * Consulta rubricas correspondentes aos termos diretamente no DataLake 2.0 (pcquefluiltrvwjpndvw)
 * via Edge Function relatorios-ponte.
 */
export async function buscarRubricasDataLake(
  termos: string[],
  limit = 50,
  offset = 0,
): Promise<{ dados: RubricaDataLake[]; total: number }> {
  const { data: sessao, error: erroSessao } = await supabase.auth.getSession();
  if (erroSessao || !sessao.session?.access_token) {
    throw new Error("Não foi possível identificar a sessão do usuário.");
  }

  const termosLimpos = deduplicarTermos(termos);
  if (termosLimpos.length === 0) {
    return { dados: [], total: 0 };
  }

  const resposta = await fetch(HISTORICO_PONTE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessao.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      acao: "rubricas",
      versao: "v2",
      temas: [{ tema: "Consulta", termos: termosLimpos }],
      limit,
      offset,
    }),
  });

  const r = (await resposta.json().catch(() => null)) as {
    disponivel?: boolean;
    motivo?: string;
    dados?: RubricaDataLake[];
    error?: string;
  } | null;

  if (!resposta.ok) {
    throw new Error(r?.motivo ?? r?.error ?? `Erro ao conectar com DataLake 2.0 (${resposta.status})`);
  }

  if (!r?.disponivel) {
    throw new Error(r?.motivo ?? "Consulta de rubricas indisponível no DataLake 2.0");
  }

  const dados = r.dados ?? [];
  const total = Number(dados[0]?.total_linhas ?? 0);
  return { dados, total };
}
