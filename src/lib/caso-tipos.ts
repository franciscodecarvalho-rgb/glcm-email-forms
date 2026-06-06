// Tipos compartilhados do domínio do caso (qualificação, empregador, endereço).
// Espelham as colunas jsonb adicionadas à tabela casos.

export type Qualificacao = {
  nacionalidade?: string | null;
  estado_civil?: string | null;
  profissao?: string | null;
};

export type Empregador = {
  razao_social?: string | null;
  cnpj?: string | null;
};

export type EnderecoCaso = {
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
};

export type EscritorioId = "glcm" | "polkowski";

export type Escritorio = {
  id: EscritorioId;
  nome: string;
};

/** Escritórios parceiros (dados fixos das peças do caso real). */
export const ESCRITORIOS: Record<EscritorioId, Escritorio> = {
  glcm: { id: "glcm", nome: "Garcia Landeiro, Carvalho Moraes Advogados Associados" },
  polkowski: { id: "polkowski", nome: "Polkowski Sociedade Individual de Advocacia" },
};
