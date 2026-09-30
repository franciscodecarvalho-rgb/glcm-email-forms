export function documentoPessoalUsaIa(tipoDocumento: string): boolean {
  return tipoDocumento !== "contracheque";
}

export function temDadosPessoaisUtilizaveis(dados: Record<string, unknown>): boolean {
  const texto = [dados.nome, dados.nome_cliente, dados.cpf, dados.rg]
    .some((valor) => typeof valor === "string" && valor.trim().length > 0);
  if (texto) return true;

  const endereco = dados.endereco;
  return Boolean(
    endereco &&
      typeof endereco === "object" &&
      Object.values(endereco).some((valor) => typeof valor === "string" && valor.trim().length > 0),
  );
}
