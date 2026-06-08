import { describe, it, expect } from "vitest";
import { safeStorageName } from "./storage";

describe("safeStorageName", () => {
  it("remove emoji e normaliza espaços (caso real do bug)", () => {
    expect(safeStorageName("Holerite 01_2022 🔷 .pdf")).toBe("Holerite_01_2022_.pdf");
  });

  it("remove acentos", () => {
    expect(safeStorageName("Comprovante de residência.pdf")).toBe("Comprovante_de_residencia.pdf");
  });

  it("preserva nomes já válidos", () => {
    expect(safeStorageName("09775798-202207-Contracheque.pdf")).toBe("09775798-202207-Contracheque.pdf");
  });

  it("faz fallback quando sobra vazio", () => {
    expect(safeStorageName("🔷🔷")).toBe("arquivo");
    expect(safeStorageName(null)).toBe("arquivo");
  });
});
