// Valida um template .docx no momento do upload: lista as {TAGS} encontradas
// (corpo, cabeçalhos e rodapés), compara com as variáveis canônicas do sistema
// e detecta [COLCHETES] não convertidos — inclusive quando o Word fatiou o
// texto em vários runs (por isso o texto é reconstituído por parágrafo antes
// da busca). Módulo puro e testável.

import PizZip from "pizzip";
import { montarVariaveisCaso } from "./caso-variaveis";

export type ValidacaoTemplate = {
  reconhecidas: string[];
  desconhecidas: string[];
  colchetes: string[];
};

// Tags aceitas além das variáveis do caso (sintaxe de loop do docxtemplater).
const TAGS_EXTRAS = new Set(["#linhas", "/linhas"]);

export function variaveisCanonicas(): Set<string> {
  return new Set(Object.keys(montarVariaveisCaso({})));
}

// Concatena os <w:t> de cada parágrafo: regex sobre o XML cru não enxerga um
// "[NOME DO CLIENTE]" que o Word quebrou em múltiplos runs.
function textoPorParagrafo(xml: string): string[] {
  return xml.split(/<\/w:p>/).map((p) =>
    (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
      .map((t) => t.replace(/<w:t[^>]*>|<\/w:t>/g, ""))
      .join(""),
  );
}

export function validarTemplateDocx(bytes: ArrayBuffer | Uint8Array): ValidacaoTemplate {
  const zip = new PizZip(bytes);
  const alvos = Object.keys(zip.files).filter((f) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/.test(f),
  );
  const paragrafos = alvos.flatMap((f) => textoPorParagrafo(zip.files[f].asText()));

  const tags = new Set<string>();
  const colchetes = new Set<string>();
  for (const p of paragrafos) {
    for (const m of p.matchAll(/\{([^{}\n]{1,60})\}/g)) tags.add(m[1].trim());
    for (const m of p.matchAll(/\[([^\][\n]{2,80})\]/g)) colchetes.add(`[${m[1].trim()}]`);
  }

  const canonicas = variaveisCanonicas();
  const reconhecidas: string[] = [];
  const desconhecidas: string[] = [];
  for (const t of tags) {
    if (canonicas.has(t) || TAGS_EXTRAS.has(t)) reconhecidas.push(t);
    else desconhecidas.push(t);
  }
  return {
    reconhecidas: reconhecidas.sort(),
    desconhecidas: desconhecidas.sort(),
    colchetes: [...colchetes].sort(),
  };
}
