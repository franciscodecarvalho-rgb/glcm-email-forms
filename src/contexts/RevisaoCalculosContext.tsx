import { createContext, useContext, useState, type ReactNode } from "react";

export type RevisaoCalculosState = {
  captador: string;
  oab: string;
  email: string;
  telefone: string;
  ufComarca: string;
};

export type RevisaoCalculosErrors = Partial<Record<keyof RevisaoCalculosState, string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;

export function validarRevisaoCalculos(state: RevisaoCalculosState): RevisaoCalculosErrors {
  const erros: RevisaoCalculosErrors = {};
  if (!state.captador.trim()) erros.captador = "Informe o captador.";
  if (!state.oab.trim()) erros.oab = "Informe a OAB do advogado.";
  if (!state.email.trim()) erros.email = "Informe o e-mail do cliente.";
  else if (!EMAIL_REGEX.test(state.email.trim())) erros.email = "E-mail inválido.";
  if (state.telefone.trim() && !PHONE_REGEX.test(state.telefone.trim())) erros.telefone = "Telefone inválido.";
  if (!state.ufComarca.trim()) erros.ufComarca = "Informe a UF da comarca.";
  return erros;
}

export function revisaoCalculosValida(state: RevisaoCalculosState): boolean {
  return Object.keys(validarRevisaoCalculos(state)).length === 0;
}

type RevisaoCalculosContextValue = {
  state: RevisaoCalculosState;
  errors: RevisaoCalculosErrors;
  setField: <K extends keyof RevisaoCalculosState>(field: K, value: RevisaoCalculosState[K]) => void;
};

const RevisaoCalculosContext = createContext<RevisaoCalculosContextValue | null>(null);

export function RevisaoCalculosProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RevisaoCalculosState>({
    captador: "",
    oab: "",
    email: "",
    telefone: "",
    ufComarca: "",
  });

  const errors = validarRevisaoCalculos(state);

  const setField = <K extends keyof RevisaoCalculosState>(field: K, value: RevisaoCalculosState[K]) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <RevisaoCalculosContext.Provider value={{ state, errors, setField }}>
      {children}
    </RevisaoCalculosContext.Provider>
  );
}

export function useRevisaoCalculos() {
  const ctx = useContext(RevisaoCalculosContext);
  if (!ctx) throw new Error("useRevisaoCalculos deve ser usado dentro de RevisaoCalculosProvider");
  return ctx;
}
