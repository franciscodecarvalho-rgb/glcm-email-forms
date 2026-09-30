import { describe, expect, it } from "vitest";
import { documentoPessoalUsaIa } from "../../supabase/functions/_shared/personal-extraction-policy";

describe("roteamento da extração de documentos pessoais", () => {
  it("reserva IA para comprovantes de residência", () => {
    expect(documentoPessoalUsaIa("comprovante_residencia")).toBe(true);
  });

  it.each(["cnh", "rg", "cin", "cpf", "contracheque", "outro"])(
    "não envia %s à IA",
    (tipoDocumento) => {
      expect(documentoPessoalUsaIa(tipoDocumento)).toBe(false);
    },
  );
});
