// Normalização de competência EXCLUSIVA do modelo "acelen"
// (Refinaria de Mataripe S.A.). Em PDFs escaneados a extração por IA devolve
// a competência em formatos brutos (31/03/2023, 2024-04-30, 28/FEVEREIRO/2023,
// "Recibo de Pagamento de MARÇO/2023"). Esta função converte tudo para MM/AAAA
// e devolve null quando não há competência legível — nunca inventa mês/ano.

const MESES_ACELEN: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ehCompetenciaCanonica(valor: unknown): valor is string {
  return typeof valor === "string" && /^(0[1-9]|1[0-2])\/20\d{2}$/.test(valor);
}

export function normalizarCompetenciaAcelen(bruta: unknown): string | null {
  if (typeof bruta !== "string" || !bruta.trim()) return null;
  const n = semAcento(bruta);

  // 1) Nome do mês: "MARÇO/2023", "28/FEVEREIRO/2023", "Recibo de Pagamento de Março de 2023".
  for (const [nome, numero] of Object.entries(MESES_ACELEN)) {
    const m = n.match(new RegExp(`(?:\\b\\d{1,2}\\s*[/.\\- ]\\s*)?\\b${nome}\\b\\s*(?:de\\s*)?[/.\\- ]\\s*(20\\d{2})\\b`));
    if (m) return `${numero}/${m[1]}`;
  }

  // 2) AAAA-MM-DD (ISO devolvido pela IA).
  const iso = n.match(/\b(20\d{2})-(0?[1-9]|1[0-2])-(\d{1,2})\b/);
  if (iso) return `${iso[2].padStart(2, "0")}/${iso[1]}`;

  // 3) DD/MM/AAAA (também com "." ou "-" como separador).
  const completa = n.match(/\b(\d{1,2})[/.-](0?[1-9]|1[0-2])[/.-](20\d{2})\b/);
  if (completa) return `${completa[2].padStart(2, "0")}/${completa[3]}`;

  // 4) MM/AAAA já canônico ou sem zero à esquerda.
  const curta = n.match(/(?<![\d/.-])(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})(?!\d)/);
  if (curta) return `${curta[1].padStart(2, "0")}/${curta[2]}`;

  return null;
}
