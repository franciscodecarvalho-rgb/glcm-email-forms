import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ValidacaoTeses from "./ValidacaoTeses";
import { AppHeader } from "@/components/AppHeader";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { email: "equipe@glcm.app" }, signOut: vi.fn() }),
}));

vi.mock("@/hooks/useIsAdmin", () => ({
  useIsAdmin: () => ({ isAdmin: true }),
}));

describe("ValidacaoTeses", () => {
  it("exibe o link Validação Teses no AppHeader imediatamente ao lado de Validação Radar", () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link").map((el) => ({
      text: el.textContent?.trim(),
      href: el.getAttribute("href"),
    }));

    const idxRadar = links.findIndex((l) => l.href === "/ValidacaoRadar");
    const idxTeses = links.findIndex((l) => l.href === "/ValidacaoTeses");

    expect(idxRadar).toBeGreaterThan(-1);
    expect(idxTeses).toBe(idxRadar + 1);
    expect(links[idxTeses].text).toBe("Validação Teses");
  });

  it("renderiza a página Validação Teses com os 4 KPIs, 8 teses, catálogo e 40 casos reais", () => {
    render(
      <MemoryRouter>
        <ValidacaoTeses />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Validação Teses" })).toBeInTheDocument();
    expect(screen.getByText("1.022")).toBeInTheDocument();
    expect(screen.getByText("8 Teses + 5 Indicadores")).toBeInTheDocument();
    expect(screen.getAllByText(/28,75M/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/7 Teses Barradas/i)).toBeInTheDocument();

    // Expande todas as amostras estáticas (8 x 5 = 40 casos reais)
    fireEvent.click(screen.getByRole("button", { name: /Ver Todas Amostras \(40\)/i }));
    expect(screen.getAllByText("Magno Antonio Bemfica de Oliveira").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Rogerio Rodrigues da Silva").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Paulo Henrique Correa Magalhaes").length).toBeGreaterThanOrEqual(1);

    // Valida presença do botão de exportação dos 40 casos
    expect(screen.getByRole("button", { name: /Exportar 40 Casos \(CSV\)/i })).toBeInTheDocument();

    // Valida ausência de termos proibidos ou nomes técnicos internos
    expect(screen.queryByText(/pollyanna/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/degusta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/datalake-normalizado\.sqlite/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/peticao_horas_extras\.docx/i)).not.toBeInTheDocument();
  }, 20000);
});
