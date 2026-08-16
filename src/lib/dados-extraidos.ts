import type { CasoData } from "@/pages/Caso";

export function dadosEsperadosForamExtraidos(caso: CasoData): boolean {
  const identificacaoCompleta = Boolean(
    caso.nome_cliente?.trim() && caso.cpf?.trim() && caso.rg?.trim(),
  );
  const contrachequeCompleto = (caso.contracheques_extraidos ?? []).some(
    (contracheque) => (contracheque.itens_contracheque ?? []).length > 0,
  );

  return identificacaoCompleta && contrachequeCompleto;
}
