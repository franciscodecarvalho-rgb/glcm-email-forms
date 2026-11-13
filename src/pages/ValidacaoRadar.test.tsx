import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ValidacaoRadar from "./ValidacaoRadar";
import { AppHeader } from "@/components/AppHeader";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { email: "equipe@glcm.app" }, signOut: vi.fn() }),
}));

vi.mock("@/hooks/useIsAdmin", () => ({
  useIsAdmin: () => ({ isAdmin: true }),
}));

describe("ValidacaoRadar", () => {
  it("exibe o link Validação Radar imediatamente ao lado de Painel 2.0 e antes de Validação Teses no AppHeader", () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link").map((el) => ({
      text: el.textContent?.trim(),
      href: el.getAttribute("href"),
    }));

    const idxPainel20 = links.findIndex((l) => l.href === "/RelatoriosV2");
    const idxRadar = links.findIndex((l) => l.href === "/ValidacaoRadar");
    const idxTeses = links.findIndex((l) => l.href === "/ValidacaoTeses");

    expect(idxPainel20).toBeGreaterThan(-1);
    expect(idxRadar).toBe(idxPainel20 + 1);
    expect(idxTeses).toBe(idxRadar + 1);
    expect(links[idxRadar].text).toBe("Validação Radar");
    expect(links[idxTeses].text).toBe("Validação Teses");
  });

  it("renderiza métricas reconciliadas do DataLake 2.0 e os dois processos auditados", () => {
    render(
      <MemoryRouter>
        <ValidacaoRadar />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Validação Radar" })).toBeInTheDocument();
    expect(screen.getAllByText("104.285").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("0000970-88.2025.5.05.0121").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("0101440-81.2025.5.01.0043")).toBeInTheDocument();
    expect(screen.getByText("R$ 60.762,09")).toBeInTheDocument();
    expect(screen.getByText("R$ 165.400,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 61.364,87")).toBeInTheDocument();
    expect(screen.getByText("R$ 178.900,00")).toBeInTheDocument();
    expect(screen.getByText(/R\$ 122,1k ajuizado vs\. R\$ 344,3k direito apurado/i)).toBeInTheDocument();
    expect(screen.getByText("R$ 1.963.328.066,28")).toBeInTheDocument();
    expect(screen.getByText("R$ 333.106.578,24")).toBeInTheDocument();
    expect(screen.queryByText(/peticao_horas_extras\.docx/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/datalake-normalizado\.sqlite/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nós sabemos exatamente o que o escritório precisa/i)).not.toBeInTheDocument();
  });

  it("alterna o simulador estratégico entre os temas e atualiza precedente, turmas e evidencias", () => {
    render(
      <MemoryRouter>
        <ValidacaoRadar />
      </MemoryRouter>,
    );

    expect(screen.getByText("0100360-54.2021.5.01.0033")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1. Banco de Horas (Petrobras & Braskem)" })).toBeInTheDocument();

    // Inspeciona evidências documentais de Sergipe (TRT20) demonstrando bloqueio
    const trt20Btn = screen.getByText("TRT20 (SE) · Jurisdição Bloqueada");
    fireEvent.click(trt20Btn);
    expect(screen.getByText(/🔴 JURISDIÇÃO BLOQUEADA \(NÃO AJUIZAR\)/i)).toBeInTheDocument();
    expect(screen.getByText("0000259-21.2024.5.20.0001")).toBeInTheDocument();
    expect(screen.getAllByText("Improcedente").length).toBeGreaterThanOrEqual(4);

    fireEvent.click(screen.getByRole("button", { name: /2\. Confinamento & Folgas/i }));
    expect(screen.getByText("0100482-12.2022.5.01.0482")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. Confinamento & Supressão de Folgas" })).toBeInTheDocument();
    expect(screen.getByText("TRT5 (BA) · 3ª Turma")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /3\. PPSP Petros/i }));
    expect(screen.getAllByText("0000412-88.2023.5.05.0014").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: /4\. HRA/i }));
    expect(screen.getAllByText("1028471-55.2024.4.01.3300").length).toBeGreaterThanOrEqual(1);
  });
});
