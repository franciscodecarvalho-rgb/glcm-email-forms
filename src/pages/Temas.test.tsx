/**
 * Testes de comportamento da tela de Temas com o Motor de Cadastro
 * e integração com DataLake 2.0.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Temas, { RUBRICAS_POR_PAGINA } from "./Temas";

const from = vi.fn();
const buscarRubricasDataLake = vi.fn();
const salvarTemaMotor = vi.fn();
const excluirTemaMotor = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock("@/lib/temas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/temas")>();
  return {
    ...actual,
    buscarRubricasDataLake: (...args: unknown[]) => buscarRubricasDataLake(...args),
    salvarTemaMotor: (...args: unknown[]) => salvarTemaMotor(...args),
    excluirTemaMotor: (...args: unknown[]) => excluirTemaMotor(...args),
  };
});

vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TEMAS = [
  {
    id: "t1",
    nome: "Banco de Horas",
    descricao: "Compensação de jornada",
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
    empresa: "PETRÓLEO BRASILEIRO S.A.",
    itens: 15,
    proventos: 45000.5,
    descontos: 0,
    total_linhas: total,
  };
}

beforeEach(() => {
  from.mockReset();
  buscarRubricasDataLake.mockReset();
  salvarTemaMotor.mockReset();
  excluirTemaMotor.mockReset();

  from.mockImplementation(() => ({
    select: () => ({ order: () => Promise.resolve({ data: TEMAS, error: null }) }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }));
});

function within(el: HTMLElement) {
  return {
    getByRole: (role: string, opts: { name: RegExp }) =>
      Array.from(el.querySelectorAll("button")).find((b) =>
        opts.name.test(b.textContent ?? ""),
      ) as HTMLElement,
  };
}

async function abrirRubricas(tema = "Banco de Horas") {
  render(<Temas />);
  await screen.findByText(tema);
  const linhaTema = screen.getByText(tema).closest("tr")!;
  fireEvent.click(within(linhaTema).getByRole("button", { name: /Rubricas/i }));
}

describe("Temas — rubricas no DataLake 2.0", () => {
  it("consulta as rubricas no DataLake 2.0 paginada e informa o total de rubricas", async () => {
    buscarRubricasDataLake.mockResolvedValue({ dados: [linha("Banco de Horas 50%", 120)], total: 120 });
    await abrirRubricas();

    await waitFor(() => expect(buscarRubricasDataLake).toHaveBeenCalled());
    expect(buscarRubricasDataLake).toHaveBeenCalledWith(
      ["banco de horas"],
      RUBRICAS_POR_PAGINA,
      0,
    );
    expect(await screen.findByText(/de 120 rubricas distintas/)).toBeTruthy();
    expect(await screen.findByText("DataLake 2.0")).toBeTruthy();
  });

  it("avança a paginação usando offset de 50 no DataLake 2.0", async () => {
    buscarRubricasDataLake.mockResolvedValue({ dados: [linha("Banco de Horas 50%", 120)], total: 120 });
    await abrirRubricas();
    const proxima = await screen.findByRole("button", { name: "Próxima" });
    fireEvent.click(proxima);

    await waitFor(() =>
      expect(buscarRubricasDataLake).toHaveBeenLastCalledWith(
        ["banco de horas"],
        RUBRICAS_POR_PAGINA,
        RUBRICAS_POR_PAGINA,
      ),
    );
  });

  it("mostra erro amigável quando a consulta ao DataLake 2.0 falhar", async () => {
    buscarRubricasDataLake.mockRejectedValue(new Error("Falha na ponte histórica"));
    await abrirRubricas();
    expect(
      await screen.findByText("Falha na ponte histórica"),
    ).toBeTruthy();
  });

  it("mostra estado vazio com orientação quando nenhuma rubrica for encontrada", async () => {
    buscarRubricasDataLake.mockResolvedValue({ dados: [], total: 0 });
    await abrirRubricas();
    expect(await screen.findByText("Nenhuma rubrica correspondente no DataLake 2.0 para os termos cadastrados.")).toBeTruthy();
  });
});

describe("Temas — motor de gravação e exclusão", () => {
  it("salva edição do tema chamando salvarTemaMotor", async () => {
    salvarTemaMotor.mockResolvedValue("t1");
    render(<Temas />);
    await screen.findByText("Banco de Horas");
    fireEvent.click(
      within(screen.getByText("Banco de Horas").closest("tr")!).getByRole("button", {
        name: /Editar/i,
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Atualizar Tema" }));

    await waitFor(() => expect(salvarTemaMotor).toHaveBeenCalled());
    expect(salvarTemaMotor).toHaveBeenCalledWith({
      nome: "Banco de Horas",
      termos: ["banco de horas"],
      descricao: "Compensação de jornada",
      ativo: true,
      temaId: "t1",
    });
  });

  it("permite criar novo tema com adição de termos", async () => {
    salvarTemaMotor.mockResolvedValue("t3");
    render(<Temas />);
    fireEvent.click(screen.getByRole("button", { name: /Novo tema/i }));

    const inputNome = screen.getByLabelText(/Nome do Tema/i);
    fireEvent.change(inputNome, { target: { value: "Periculosidade" } });

    const inputTermo = screen.getByPlaceholderText(/Ex.: periculosidade/i);
    fireEvent.change(inputTermo, { target: { value: "periculosidade" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByText("periculosidade")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Salvar Tema" }));

    await waitFor(() => expect(salvarTemaMotor).toHaveBeenCalled());
    expect(salvarTemaMotor).toHaveBeenCalledWith({
      nome: "Periculosidade",
      termos: ["periculosidade"],
      descricao: null,
      ativo: true,
      temaId: null,
    });
  });

  it("abre modal de confirmação e exclui tema chamando excluirTemaMotor", async () => {
    excluirTemaMotor.mockResolvedValue(undefined);
    render(<Temas />);
    await screen.findByText("Banco de Horas");
    fireEvent.click(
      within(screen.getByText("Banco de Horas").closest("tr")!).getByRole("button", {
        name: /Excluir/i,
      }),
    );

    expect(await screen.findByText(/Confirmar exclusão de tema/i)).toBeTruthy();
    expect(screen.getByText(/Tem certeza que deseja excluir o tema/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Excluir Definitivamente" }));

    await waitFor(() => expect(excluirTemaMotor).toHaveBeenCalledWith("t1"));
  });
});
