// Regra do CPF no GLCM: a persistência usa somente os 11 dígitos (sem
// pontuação), preservando a detecção de duplicidade do pre-extract-cpf, que
// compara dígitos; a exibição e os documentos usam o formato XXX.XXX.XXX-XX.
// CPF mascarado (ex.: "215.***.***-*0", comum em comprovantes de banco/telefone)
// ou parcial não é válido: normaliza para null e o caso segue para confirmação
// manual em vez de levar o valor mascarado às peças.

/** Devolve os 11 dígitos do CPF, ou null quando o valor não é um CPF completo. */
export function normalizarCpf(valor: string | null | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.length === 11 ? digitos : null;
}

/** Valida os dígitos verificadores do CPF, além de exigir 11 dígitos. */
export function cpfValido(valor: string | null | undefined): boolean {
  const cpf = normalizarCpf(valor);
  if (!cpf || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDigito = (base: string, pesoInicial: number) => {
    const soma = [...base].reduce(
      (total, digito, indice) => total + Number(digito) * (pesoInicial - indice),
      0,
    );
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(cpf.slice(0, 9), 10) === Number(cpf[9])
    && calcularDigito(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

/** Formata para XXX.XXX.XXX-XX; devolve o original quando não é CPF completo. */
export function formatarCpf(valor: string | null | undefined): string {
  const digitos = normalizarCpf(valor);
  if (!digitos) return (valor ?? "").trim();
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}
