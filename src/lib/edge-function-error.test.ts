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
      "HTTP 500: Falha ao baixar contracheques-unificados.pdf",
    );
  });

  it("inclui a etapa informada pela função para facilitar a correção", async () => {
    const resposta = new Response(
      JSON.stringify({ error: "Bucket indisponível", etapa: "gerar planilha de cálculo" }),
      { status: 500 },
    );
    await expect(mensagemErroFuncao(new FunctionsHttpError(resposta))).resolves.toBe(
      "HTTP 500: Bucket indisponível (gerar planilha de cálculo)",
    );
  });

  it("lê mensagens de erro da plataforma, como o limite 546", async () => {
    const resposta = new Response(
      JSON.stringify({
        code: "WORKER_RESOURCE_LIMIT",
        message: "Function failed due to not having enough compute resources",
      }),
      { status: 546 },
    );
    await expect(mensagemErroFuncao(new FunctionsHttpError(resposta))).resolves.toBe(
      "HTTP 546: WORKER_RESOURCE_LIMIT: Function failed due to not having enough compute resources",
    );
  });

  it("mostra o corpo texto quando a resposta não é JSON válido", async () => {
    const resposta = new Response("não é json", { status: 500 });
    const erro = new FunctionsHttpError(resposta);
    await expect(mensagemErroFuncao(erro)).resolves.toBe("HTTP 500: não é json");
  });

  it("funciona com erro compatível estruturalmente, mesmo sem instanceof", async () => {
    const resposta = new Response(
      JSON.stringify({ code: "WORKER_RESOURCE_LIMIT", message: "Sem recursos" }),
      { status: 546, statusText: "Resource Limit" },
    );
    await expect(mensagemErroFuncao({ context: resposta })).resolves.toBe(
      "HTTP 546 Resource Limit: WORKER_RESOURCE_LIMIT: Sem recursos",
    );
  });

  it("usa a mensagem de um Error comum (ex.: falha de rede)", async () => {
    await expect(mensagemErroFuncao(new Error("falha de rede"))).resolves.toBe("falha de rede");
  });

  it("usa o fallback quando o valor não é um Error", async () => {
    await expect(mensagemErroFuncao("x", "erro padrão")).resolves.toBe("erro padrão");
  });
});
