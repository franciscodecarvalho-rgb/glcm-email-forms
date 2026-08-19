import { describe, expect, it } from "vitest";
import { formatarCpf, normalizarCpf } from "./cpf";

describe("normalizarCpf", () => {
  it("mantém 11 dígitos e remove pontuação", () => {
    expect(normalizarCpf("05953833784")).toBe("05953833784");
    expect(normalizarCpf("059.538.337-84")).toBe("05953833784");
  });

  it("rejeita mascarado, parcial e vazio", () => {
    expect(normalizarCpf("215.***.***-*0")).toBeNull();
    expect(normalizarCpf("123")).toBeNull();
    expect(normalizarCpf("")).toBeNull();
    expect(normalizarCpf(null)).toBeNull();
    expect(normalizarCpf(undefined)).toBeNull();
  });
});

describe("formatarCpf", () => {
  it("formata 11 dígitos e é idempotente", () => {
    expect(formatarCpf("05953833784")).toBe("059.538.337-84");
    expect(formatarCpf("059.538.337-84")).toBe("059.538.337-84");
  });

  it("devolve o original quando não é CPF completo", () => {
    expect(formatarCpf("215.***.***-*0")).toBe("215.***.***-*0");
    expect(formatarCpf(null)).toBe("");
  });
});
