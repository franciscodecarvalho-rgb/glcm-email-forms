/**
 * Regra de composição do MVP de Temas:
 * um tema é definido por um ou mais termos de inclusão. Uma rubrica corresponde
 * ao tema quando a descrição contém, literalmente, qualquer um dos termos
 * (combinação por OU). A comparação ignora maiúsculas/minúsculas e trata
 * sequências de espaços como um único espaço. Curingas digitados pelo usuário
 * são escapados e valem como caractere literal.
 */

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
