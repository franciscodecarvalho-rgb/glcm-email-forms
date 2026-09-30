import { cpfValido } from "@/lib/cpf";

type CasoParaValidacao = {
  nome_cliente?: string | null;
  cpf?: string | null;
  rg?: string | null;
  endereco?: unknown;
  contracheques_extraidos?: Array<{
    itens_contracheque?: unknown[] | null;
  }> | null;
};

export function dadosFaltantesParaCaso(caso: CasoParaValidacao): string[] {
  const endereco = caso.endereco && typeof caso.endereco === "object"
    ? caso.endereco as Record<string, unknown>
    : {};
  const faltantes: string[] = [];

  if (!caso.nome_cliente?.trim()) faltantes.push("nome completo");
  if (!cpfValido(caso.cpf)) faltantes.push("CPF válido");
  if (!caso.rg?.trim()) faltantes.push("RG");
  if (typeof endereco.logradouro !== "string" || !endereco.logradouro.trim()) {
    faltantes.push("logradouro do comprovante");
  }
  if (!(caso.contracheques_extraidos ?? []).some(
    (contracheque) => (contracheque.itens_contracheque ?? []).length > 0,
  )) {
    faltantes.push("rubricas extraídas dos contracheques");
  }

  return faltantes;
}

export function dadosEsperadosForamExtraidos(caso: CasoParaValidacao): boolean {
  return dadosFaltantesParaCaso(caso).length === 0;
}
