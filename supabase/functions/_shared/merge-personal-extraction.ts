type Endereco = Record<string, unknown> | null | undefined;
type DadosPessoais = Record<string, unknown> | null | undefined;

function primeiroTexto(...valores: unknown[]): string | null {
  return valores.find((valor): valor is string => typeof valor === "string" && valor.trim().length > 0)?.trim() ?? null;
}

export function mesclarEnderecos(deterministico: Endereco, ia: Endereco): Record<string, string> | null {
  const campos = ["logradouro", "numero", "bairro", "cidade", "estado", "cep"];
  const endereco: Record<string, string> = {};

  for (const campo of campos) {
    const valor = primeiroTexto(ia?.[campo], deterministico?.[campo]);
    if (valor) endereco[campo] = valor;
  }

  return Object.keys(endereco).length ? endereco : null;
}

/** Combina a leitura do Gemini com o texto PDF, sem perder campos já localizados. */
export function mesclarLeituraDocumentoPessoal(
  deterministico: DadosPessoais,
  ia: DadosPessoais,
  normalizarCpf: (valor: unknown) => string | null,
): Record<string, unknown> {
  const texto = (campo: string, alias?: string) =>
    primeiroTexto(ia?.[campo], alias ? ia?.[alias] : null, deterministico?.[campo], alias ? deterministico?.[alias] : null);

  const nome = texto("nome", "nome_cliente");
  const tiposAceitos = new Set(["comprovante_residencia", "cnh", "cin", "rg", "cpf", "documento_pessoal", "outro"]);
  const tipoIa = primeiroTexto(ia?.tipo_documento);
  const tipoDeterministico = primeiroTexto(deterministico?.tipo_documento);
  const endereco = mesclarEnderecos(
    (deterministico?.endereco as Endereco) ?? null,
    (ia?.endereco as Endereco) ?? null,
  );

  return {
    ...deterministico,
    ...ia,
    tipo_documento: tipoIa && tiposAceitos.has(tipoIa)
      ? tipoIa
      : tipoDeterministico && tiposAceitos.has(tipoDeterministico)
        ? tipoDeterministico
        : "outro",
    nome: nome ?? "",
    nome_cliente: nome ?? "",
    cpf: normalizarCpf(ia?.cpf) ?? normalizarCpf(deterministico?.cpf) ?? "",
    rg: texto("rg") ?? "",
    nacionalidade: texto("nacionalidade") ?? "",
    estado_civil: texto("estado_civil") ?? "",
    profissao: texto("profissao") ?? "",
    endereco: endereco ?? {},
  };
}
