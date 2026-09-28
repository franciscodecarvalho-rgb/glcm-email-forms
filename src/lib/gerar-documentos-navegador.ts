import { supabase } from "@/integrations/supabase/client";
import { montarVariaveisCaso } from "./caso-variaveis";
import { selecionarPecas } from "./modelos-documentos";
import {
  agregarBancoHorasPorCompetencia,
  agregarContribExtraPorCompetencia,
  montarArquivosPlanilhaBancoHorasXlsx,
  montarArquivosPlanilhaContribExtraXlsx,
  montarArquivosPlanilhaXlsx,
} from "./planilha-xlsx";
import type { ContrachequeRelacional } from "./contracheques-relacionais";
import type { EnderecoCaso, Qualificacao } from "./caso-tipos";

type DocumentoGerado = { tipo: string; storage_path: string; nome: string };

export type CasoParaGeracaoNoNavegador = {
  id: string;
  tipo_acao: string;
  nome_cliente: string | null;
  cpf: string | null;
  rg: string | null;
  endereco: EnderecoCaso | null;
  qualificacao: Qualificacao | null;
  numero_pasta: string | null;
  valor_causa: number | null;
  escritorios: unknown;
  contracheques: Array<{ label?: string; valor_hra?: number; valor_ahra?: number }>;
  contracheques_extraidos: ContrachequeRelacional[];
  documentos_gerados: unknown;
};

export type DadosGeracaoNoNavegador = {
  captador: string;
  oab: string;
  email_cliente: string;
  telefone_cliente: string;
  uf_comarca: string;
  endereco_uniao: string;
  valor_causa: number;
};

const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function nomeSeguro(valor: string): string {
  return valor.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function combinarDocumentos(existentes: unknown, novos: DocumentoGerado[]): DocumentoGerado[] {
  const porTipo = new Map<string, DocumentoGerado>();
  if (Array.isArray(existentes)) {
    for (const documento of existentes) {
      if (
        documento
        && typeof documento === "object"
        && typeof (documento as DocumentoGerado).tipo === "string"
        && typeof (documento as DocumentoGerado).storage_path === "string"
        && typeof (documento as DocumentoGerado).nome === "string"
      ) {
        porTipo.set((documento as DocumentoGerado).tipo, documento as DocumentoGerado);
      }
    }
  }
  for (const documento of novos) porTipo.set(documento.tipo, documento);
  return [...porTipo.values()];
}

function garantirMarcadorNumeroContrato(zip: { files: Record<string, unknown>; file: (nome: string, conteudo?: string) => { asText: () => string } | null }): void {
  const arquivos = Object.keys(zip.files).filter((nome) => /^word\/(?:document|header\d+)\.xml$/.test(nome));
  if (arquivos.some((nome) => zip.file(nome)?.asText().includes("{NUMERO_CONTRATO}"))) return;
  for (const nome of arquivos) {
    const arquivo = zip.file(nome);
    if (!arquivo) continue;
    const xml = arquivo.asText();
    if (!xml.includes("CONTRATO:")) continue;
    zip.file(nome, xml.replace("CONTRATO:", "CONTRATO: {NUMERO_CONTRATO}"));
    return;
  }
  throw new Error("O template de contrato não contém o campo CONTRATO:");
}

async function carregarBibliotecasDocx() {
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
    import("pizzip"),
    import("docxtemplater"),
  ]);
  return { PizZip, Docxtemplater };
}

async function subirArquivo(path: string, conteudo: Blob | Uint8Array, contentType: string): Promise<void> {
  const { error } = await supabase.storage
    .from("casos-documentos")
    .upload(path, conteudo, { upsert: true, contentType });
  if (error) throw error;
}

/**
 * Gera o pacote no navegador autenticado. DOCX e ZIP são custosos para a Edge
 * Function e podem exceder o limite 546; Storage e RLS já autorizam este fluxo.
 */
export async function gerarDocumentosNoNavegador(
  caso: CasoParaGeracaoNoNavegador,
  dados: DadosGeracaoNoNavegador,
): Promise<DocumentoGerado[]> {
  const escritorios = Array.isArray(caso.escritorios)
    ? caso.escritorios.filter((escritorio): escritorio is string => typeof escritorio === "string")
    : [];
  const pecas = selecionarPecas(caso.tipo_acao, escritorios);
  const tipos = pecas.map((peca) => peca.templateTipo);
  const { data: templates, error: templatesErro } = await supabase
    .from("templates")
    .select("tipo, storage_path")
    .in("tipo", tipos);
  if (templatesErro) throw templatesErro;
  const porTipo = new Map((templates ?? []).map((template) => [template.tipo, template.storage_path]));
  const faltantes = tipos.filter((tipo) => !porTipo.has(tipo));
  if (faltantes.length) throw new Error(`Templates obrigatórios ausentes: ${faltantes.join(", ")}`);

  const linhas = (caso.contracheques ?? []).map((contra) => {
    const hra = Number(contra.valor_hra) || 0;
    const ahra = Number(contra.valor_ahra) || 0;
    return {
      competencia: contra.label ?? "",
      hra: hra.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      ahra: ahra.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      subtotal: (hra + ahra).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      ir: ((hra + ahra) * 0.275).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    };
  });
  const variaveis = {
    ...montarVariaveisCaso({
      nome_cliente: caso.nome_cliente,
      cpf: caso.cpf,
      rg: caso.rg,
      endereco: caso.endereco,
      qualificacao: caso.qualificacao,
      numero_pasta: caso.numero_pasta,
      valor_causa: dados.valor_causa,
      captador: dados.captador,
      oab: dados.oab,
      email_cliente: dados.email_cliente,
      telefone_cliente: dados.telefone_cliente,
      uf_comarca: dados.uf_comarca,
    }),
    "ENDEREÇO_UNIAO": dados.endereco_uniao,
    linhas,
  };
  const baseNome = nomeSeguro(caso.numero_pasta || caso.id.slice(0, 8));
  const gerados: DocumentoGerado[] = [];
  const { PizZip, Docxtemplater } = await carregarBibliotecasDocx();

  for (const peca of pecas) {
    const storagePath = porTipo.get(peca.templateTipo)!;
    const { data: modelo, error: downloadErro } = await supabase.storage.from("templates").download(storagePath);
    if (downloadErro || !modelo) throw new Error(`Falha ao baixar o template obrigatório: ${peca.templateTipo}`);
    const zip = new PizZip(new Uint8Array(await modelo.arrayBuffer()));
    if (peca.tipoSaida === "contrato") garantirMarcadorNumeroContrato(zip);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
      nullGetter: () => "",
    });
    doc.render(variaveis);
    const nome = `${peca.tipoSaida}-${baseNome}.docx`;
    const path = `${caso.id}/${nome}`;
    await subirArquivo(path, new Blob([doc.getZip().generate({ type: "uint8array" })], { type: MIME_DOCX }), MIME_DOCX);
    gerados.push({ tipo: peca.tipoSaida, storage_path: path, nome });
  }

  const criarXlsx = (partes: Record<string, string>) => {
    const zip = new PizZip();
    for (const [caminho, conteudo] of Object.entries(partes)) zip.file(caminho, conteudo);
    return new Blob([zip.generate({ type: "uint8array" })], { type: MIME_XLSX });
  };
  const linhasHra = (caso.contracheques ?? []).map((contra) => ({
    competencia: contra.label ?? "",
    hra: Number(contra.valor_hra) || 0,
    ahra: Number(contra.valor_ahra) || 0,
  }));
  const itens = (caso.contracheques_extraidos ?? []).flatMap((contra) => contra.itens_contracheque ?? []);
  const ehContribExtra = caso.tipo_acao === "contribuicao_extraordinaria";
  const principal = ehContribExtra
    ? montarArquivosPlanilhaContribExtraXlsx(caso.nome_cliente ?? "", agregarContribExtraPorCompetencia(caso.contracheques_extraidos, itens))
    : montarArquivosPlanilhaXlsx(caso.nome_cliente ?? "", linhasHra);
  const nomePrincipal = ehContribExtra
    ? `PLANILHA — ${caso.nome_cliente ?? ""} — IR SOBRE CONTRIBUIÇÃO EXTRAORDINÁRIA.xlsx`
    : `PLANILHA — ${caso.nome_cliente ?? ""} — IR SOBRE HRA.xlsx`;
  const pathPrincipal = `${caso.id}/planilha-${baseNome}.xlsx`;
  await subirArquivo(pathPrincipal, criarXlsx(principal), MIME_XLSX);
  gerados.push({ tipo: "planilha", storage_path: pathPrincipal, nome: nomePrincipal });

  if (caso.tipo_acao === "ir_sobre_hra") {
    const linhasCE = agregarContribExtraPorCompetencia(caso.contracheques_extraidos, itens);
    if (linhasCE.length) {
      const nome = `PLANILHA — ${caso.nome_cliente ?? ""} — IR SOBRE CONTRIBUIÇÃO EXTRAORDINÁRIA.xlsx`;
      const path = `${caso.id}/planilha-contrib-extra-${baseNome}.xlsx`;
      await subirArquivo(path, criarXlsx(montarArquivosPlanilhaContribExtraXlsx(caso.nome_cliente ?? "", linhasCE)), MIME_XLSX);
      gerados.push({ tipo: "planilha_contrib_extra", storage_path: path, nome });
    }
  }

  const linhasBancoHoras = agregarBancoHorasPorCompetencia(caso.contracheques_extraidos, itens);
  if (linhasBancoHoras.length) {
    const nome = `planilha-banco-horas-1513-${baseNome}.xlsx`;
    const path = `${caso.id}/${nome}`;
    await subirArquivo(path, criarXlsx(montarArquivosPlanilhaBancoHorasXlsx(caso.nome_cliente ?? "", linhasBancoHoras)), MIME_XLSX);
    gerados.push({ tipo: "planilha_codigos", storage_path: path, nome });
  }

  const { data: arquivoUnificado, error: arquivoErro } = await supabase
    .from("arquivos")
    .select("storage_path")
    .eq("caso_id", caso.id)
    .eq("tipo", "contracheque")
    .eq("nome", "contracheques-unificados.pdf")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (arquivoErro) throw arquivoErro;
  if (arquivoUnificado?.storage_path) {
    const { data: pdf, error: pdfErro } = await supabase.storage.from("casos-arquivos").download(arquivoUnificado.storage_path);
    if (pdfErro || !pdf) throw new Error("Falha ao baixar o PDF unificado de contracheques");
    const nome = `contracheques-unificados-${baseNome}.pdf`;
    const path = `${caso.id}/${nome}`;
    await subirArquivo(path, pdf, "application/pdf");
    gerados.push({ tipo: "contracheques_unificados", storage_path: path, nome });
  }

  const documentosGerados = combinarDocumentos(caso.documentos_gerados, gerados);
  const { error: casoErro } = await supabase
    .from("casos")
    .update({ documentos_gerados: documentosGerados, status: "concluido" })
    .eq("id", caso.id);
  if (casoErro) throw casoErro;
  return documentosGerados;
}
