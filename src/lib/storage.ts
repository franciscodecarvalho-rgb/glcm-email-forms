// Sanitiza nomes de arquivo para uso como CHAVE do Supabase Storage.
// O Storage rejeita emojis e vários caracteres não-ASCII com "Invalid key".
// O nome ORIGINAL é preservado em arquivos.nome; só a chave é sanitizada.

export function safeStorageName(nome: string | null | undefined): string {
  const base = (nome ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // remove acentos
    .replace(/[^\w.\- ]+/g, "") // remove emojis e símbolos não suportados
    .replace(/\s+/g, "_") // espaços -> _
    .replace(/_+/g, "_") // colapsa _
    .replace(/^[_-]+|[_-]+$/g, ""); // tira _/- das pontas (mantém ponto da extensão)
  return base || "arquivo";
}
