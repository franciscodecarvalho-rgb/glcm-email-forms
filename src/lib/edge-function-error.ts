type CorpoErro = Record<string, unknown>;

type ContextoFuncao = {
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  clone?: () => ContextoFuncao;
};

const MENSAGEM_GENERICA = "Edge Function returned a non-2xx status code";

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const resultado = valor.trim();
  return resultado || null;
}

function analisarCorpo(payload: unknown): { mensagem: string | null; codigo: string | null; etapa: string | null } {
  if (typeof payload === "string") {
    const bruto = texto(payload);
    if (!bruto) return { mensagem: null, codigo: null, etapa: null };
    try {
      return analisarCorpo(JSON.parse(bruto));
    } catch {
      return { mensagem: bruto, codigo: null, etapa: null };
    }
  }

  if (!payload || typeof payload !== "object") {
    return { mensagem: null, codigo: null, etapa: null };
  }

  const objeto = payload as CorpoErro;
  const codigo = texto(objeto.code) ?? texto(objeto.codigo) ?? texto(objeto.error_code);
  const etapa = texto(objeto.etapa) ?? texto(objeto.stage);

  for (const chave of ["error", "erro", "message", "msg", "details", "detail"]) {
    const valor = objeto[chave];
    const encontrado = analisarCorpo(valor);
    if (encontrado.mensagem || encontrado.codigo) {
      return {
        mensagem: encontrado.mensagem,
        codigo: encontrado.codigo ?? codigo,
        etapa: encontrado.etapa ?? etapa,
      };
    }
  }

  return { mensagem: null, codigo, etapa };
}

function contextoDoErro(error: unknown): ContextoFuncao | null {
  if (!error || typeof error !== "object") return null;
  const contexto = (error as { context?: unknown }).context;
  return contexto && typeof contexto === "object" ? contexto as ContextoFuncao : null;
}

async function lerCorpo(contexto: ContextoFuncao): Promise<unknown> {
  // A Response só pode ser consumida uma vez. Quando clone() existe, usamos
  // uma cópia independente para cada tentativa de leitura.
  if (typeof contexto.json === "function") {
    try {
      const fonte = typeof contexto.clone === "function" ? contexto.clone() : contexto;
      return await fonte.json?.();
    } catch {
      // Alguns erros do relay retornam texto puro ou uma resposta sem corpo.
    }
  }
  if (typeof contexto.text === "function") {
    try {
      const fonte = typeof contexto.clone === "function" ? contexto.clone() : contexto;
      return await fonte.text?.();
    } catch {
      // O status HTTP ainda será mostrado abaixo.
    }
  }
  return null;
}

/** Lê o diagnóstico real de um erro de supabase.functions.invoke. */
export async function mensagemErroFuncao(
  error: unknown,
  fallback = "Falha ao executar a função",
): Promise<string> {
  const contexto = contextoDoErro(error);
  let detalhes = { mensagem: null as string | null, codigo: null as string | null, etapa: null as string | null };

  if (contexto) {
    detalhes = analisarCorpo(await lerCorpo(contexto));
  }

  const mensagem = detalhes.mensagem;
  const codigo = detalhes.codigo;
  const etapa = detalhes.etapa ? ` (${detalhes.etapa})` : "";
  const textoReal = [codigo, mensagem].filter(Boolean).join(": ");
  const status = typeof contexto?.status === "number" ? contexto.status : null;
  const statusText = texto(contexto?.statusText);
  const http = status === null ? "" : `HTTP ${status}${statusText ? ` ${statusText}` : ""}`;

  if (textoReal) return [http, `${textoReal}${etapa}`].filter(Boolean).join(": ");
  if (http) return `${http}: a Edge Function não retornou detalhes adicionais`;

  const mensagemDoErro = error instanceof Error ? texto(error.message) : null;
  if (mensagemDoErro && mensagemDoErro !== MENSAGEM_GENERICA) return mensagemDoErro;
  return fallback;
}
