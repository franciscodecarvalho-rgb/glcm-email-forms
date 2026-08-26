import { describe, it, expect } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { mensagemErroFuncao } from "./edge-function-error";

describe("mensagemErroFuncao", () => {
  it("lê a mensagem real do corpo JSON da function (não o texto genérico non-2xx)", async () => {
    const resposta = new Response(
      JSON.stringify({ error: "Falha ao baixar contracheques-unificados.pdf" }),
      { status: 500 },
    );
    const erro = new FunctionsHttpError(resposta);
    await expect(mensagemErroFuncao(erro)).resolves.toBe(
      "Falha ao baixar contracheques-unificados.pdf",
    );
  });

  it("cai para a mensagem do erro quando o corpo não é JSON válido", async () => {
    const resposta = new Response("não é json", { status: 500 });
    const erro = new FunctionsHttpError(resposta);
    await expect(mensagemErroFuncao(erro)).resolves.toBe(erro.message);
  });

  it("usa a mensagem de um Error comum (ex.: falha de rede)", async () => {
    await expect(mensagemErroFuncao(new Error("falha de rede"))).resolves.toBe("falha de rede");
  });

  it("usa o fallback quando o valor não é um Error", async () => {
    await expect(mensagemErroFuncao("x", "erro padrão")).resolves.toBe("erro padrão");
  });
});
