import { FunctionsHttpError } from "@supabase/supabase-js";

// FunctionsHttpError.message é sempre o texto genérico "Edge Function returned
// a non-2xx status code" — o motivo específico (download, limite de recursos,
// gravação etc.) só existe no corpo JSON da resposta, em error.context (a
// Response do fetch, que só pode ser lida uma vez).
/** Lê a mensagem real de um erro de supabase.functions.invoke, com fallback. */
export async function mensagemErroFuncao(
  error: unknown,
  fallback = "Falha ao executar a função",
): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const corpo = await error.context.json();
      if (typeof corpo?.error === "string" && corpo.error) return corpo.error;
    } catch {
      // corpo não é JSON válido; cai no retorno abaixo
    }
  }
  return error instanceof Error ? error.message : fallback;
}
