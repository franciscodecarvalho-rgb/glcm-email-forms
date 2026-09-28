/**
 * Testes de comportamento da tela de Temas.
 *
 * Cobrem o contrato com o servidor após a revisão: busca de rubricas por RPC
 * (paginação estável, total informado, erro distinto de vazio, descarte de
 * resposta antiga) e gravação atômica do tema por RPC única.
 *
 * Limite declarado: a semântica SQL (normalização, DISTINCT, rollback) é
 * garantida no banco e validada por consulta direta; aqui validamos apenas o
 * uso correto dessas funções pela interface.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Temas, { RUBRICAS_POR_PAGINA } from "./Temas";

const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => ({ isAdmin: true }) }));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TEMAS = [
  {
    id: "t1",
    nome: "Banco de Horas",
    descricao: null,
    ativo: true,
    created_at: "2026-01-01",
    tema_termos: [{ id: "x1", termo: "banco de horas" }],
  },
  {
    id: "t2",
    nome: "Confinamento",
    descricao: null,
    ativo: true,
    created_at: "2026-01-01",
    tema_termos: [{ id: "x2", termo: "confinamento" }],
  },
];

function linha(descricao: string, total: number) {
  return {
    codigo: "1513",
    descricao,
    tipo: "provento",
    empresa: "petrobras",
    ocorrencias: 3,
    total_linhas: total,
  };
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  from.mockImplementation(() => ({
    select: () => ({ order: () => Promise.resolve({ data: TEMAS, error: null }) }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }));
});

async function abrirRubricas(tema = "Banco de Horas") {
  render(<Temas />);
  await screen.findByText(tema);
  const linhaTema = screen.getByText(tema).closest("tr")!;
  fireEvent.click(within(linhaTema).getByRole("button", { name: /Rubricas/i }));
}

function within(el: HTMLElement) {
  return {
    getByRole: (role: string, opts: { name: RegExp }) =>
      Array.from(el.querySelectorAll("button")).find((b) =>
        opts.name.test(b.textContent ?? ""),
      ) as HTMLElement,
  };
}

describe("Temas — rubricas correspondentes", () => {
  it("consulta a RPC paginada e informa o total de rubricas distintas", async () => {
    rpc.mockResolvedValue({ data: [linha("Banco de Horas", 120)], error: null });
    await abrirRubricas();

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("temas_rubricas_correspondentes", {
      p_termos: ["banco de horas"],
      p_limit: RUBRICAS_POR_PAGINA,
      p_offset: 0,
    });
    expect(await screen.findByText(/de 120 rubricas distintas/)).toBeTruthy();
  });

  it("avança a paginação usando offset estável", async () => {
    rpc.mockResolvedValue({ data: [linha("Banco de Horas", 120)], error: null });
    await abrirRubricas();
    const proxima = await screen.findByRole("button", { name: "Próxima" });
    fireEvent.click(proxima);

    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith("temas_rubricas_correspondentes", {
        p_termos: ["banco de horas"],
        p_limit: RUBRICAS_POR_PAGINA,
        p_offset: RUBRICAS_POR_PAGINA,
      }),
    );
  });

  it("mostra erro distinto do estado vazio", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "falhou" } });
    await abrirRubricas();
    expect(
      await screen.findByText("Não foi possível consultar as rubricas correspondentes."),
    ).toBeTruthy();
    expect(screen.queryByText("Nenhuma rubrica correspondente.")).toBeNull();
  });

  it("mostra estado vazio sem mensagem de erro", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await abrirRubricas();
    expect(await screen.findByText("Nenhuma rubrica correspondente.")).toBeTruthy();
  });

  it("descarta a resposta antiga ao trocar de tema rapidamente", async () => {
    let resolverAntiga: (v: unknown) => void = () => {};
    rpc
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolverAntiga = resolve; }),
      )
      .mockResolvedValue({ data: [linha("Confinamento Offshore", 1)], error: null });

    render(<Temas />);
    await screen.findByText("Banco de Horas");
    fireEvent.click(
      within(screen.getByText("Banco de Horas").closest("tr")!).getByRole("button", {
        name: /Rubricas/i,
      }),
    );
    fireEvent.click(
      within(screen.getByText("Confinamento").closest("tr")!).getByRole("button", {
        name: /Rubricas/i,
      }),
    );

    expect(await screen.findByText("Confinamento Offshore")).toBeTruthy();
    resolverAntiga({ data: [linha("Banco de Horas", 999)], error: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/de 999 rubricas distintas/)).toBeNull();
    expect(screen.getByText("Confinamento Offshore")).toBeTruthy();
  });
});

describe("Temas — gravação atômica", () => {
  it("salva tema e termos em uma única chamada transacional", async () => {
    rpc.mockResolvedValue({ data: "t1", error: null });
    render(<Temas />);
    await screen.findByText("Banco de Horas");
    fireEvent.click(
      within(screen.getByText("Banco de Horas").closest("tr")!).getByRole("button", {
        name: /Editar/i,
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const chamadas = rpc.mock.calls.filter((c) => c[0] === "salvar_tema");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0][1]).toMatchObject({
      p_nome: "Banco de Horas",
      p_termos: ["banco de horas"],
      p_tema_id: "t1",
    });
    // Nenhuma escrita direta em tabelas de tema fora da transação do servidor.
    expect(from.mock.calls.filter((c) => c[0] === "tema_termos")).toHaveLength(0);
  });
});
