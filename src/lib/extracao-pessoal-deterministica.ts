export type TipoDocumentoPessoal = "cnh" | "rg" | "cin" | "cpf" | "comprovante_residencia" | "outro";

export type DadosPessoaisDeterministicos = {
  tipo_documento: TipoDocumentoPessoal;
  nome: string | null;
  cpf: string | null;
  rg: string | null;
  endereco: Record<string, string> | null;
};

const normalizar = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

export function normalizarCpfValido(valor: unknown): string | null {
  const cpf = String(valor ?? "").replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return null;
  const digito = (base: string, peso: number) => {
    const soma = [...base].reduce((total, n, indice) => total + Number(n) * (peso - indice), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9), 10) === Number(cpf[9]) && digito(cpf.slice(0, 10), 11) === Number(cpf[10]) ? cpf : null;
}

export function classificarDocumentoPessoal(texto: string): TipoDocumentoPessoal {
  const t = normalizar(texto);
  if (/CARTEIRA NACIONAL DE HABILITACAO|PERMISSAO PARA DIRIGIR/.test(t)) return "cnh";
  if (/CARTEIRA DE IDENTIDADE NACIONAL|\bCIN\b/.test(t)) return "cin";
  if (/REGISTRO GERAL|CARTEIRA DE IDENTIDADE|\bIDENTIDADE\b/.test(t)) return "rg";
  if (/COMPROVANTE DE RESIDENCIA|CONTA DE (LUZ|AGUA|ENERGIA|TELEFONE)|FATURA/.test(t)) return "comprovante_residencia";
  if (/CADASTRO DE PESSOAS FISICAS|\bCPF\b/.test(t)) return "cpf";
  return "outro";
}

function nomeAssociado(texto: string): string | null {
  const linhas = texto.split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean);
  for (const linha of linhas) {
    const match = linha.match(/(?:NOME(?:\s+COMPLETO)?|NOME DO TITULAR)\s*[:\-]?\s*([A-ZÀ-Ú][A-ZÀ-Ú' ]{5,})/i);
    if (match) return match[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

function rgAssociado(texto: string): string | null {
  const match = texto.match(/(?:\bRG\b|REGISTRO GERAL|IDENTIDADE|\bCIN\b)\s*(?:N[Oº°.]*)?\s*[:\-]?\s*([A-Z0-9.\-]{5,20})/i);
  return match?.[1]?.trim() || null;
}

function enderecoDoComprovante(texto: string, tipo: TipoDocumentoPessoal): Record<string, string> | null {
  if (tipo !== "comprovante_residencia") return null;
  const cep = texto.match(/\b(\d{5}-?\d{3})\b/)?.[1];
  const linha = texto.split(/\r?\n/).map((v) => v.trim()).find((v) => /\b(RUA|AV(?:ENIDA)?|ALAMEDA|TRAVESSA|ESTRADA|RODOVIA)\b/i.test(v));
  if (!linha && !cep) return null;
  return { ...(linha ? { logradouro: linha } : {}), ...(cep ? { cep } : {}) };
}

export function extrairDadosPessoaisDeterministicos(texto: string): DadosPessoaisDeterministicos {
  const tipo_documento = classificarDocumentoPessoal(texto);
  const candidato = texto.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0] ?? null;
  return {
    tipo_documento,
    nome: nomeAssociado(texto),
    cpf: normalizarCpfValido(candidato),
    rg: rgAssociado(texto),
    endereco: enderecoDoComprovante(texto, tipo_documento),
  };
}

export function dadosPessoaisSuficientes(dados: DadosPessoaisDeterministicos): boolean {
  if (dados.tipo_documento === "comprovante_residencia") return !!dados.endereco;
  if (!dados.cpf) return false;
  return Boolean(dados.nome || dados.rg);
}
