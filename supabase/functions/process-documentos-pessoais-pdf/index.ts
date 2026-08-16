import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFExcavator } from "npm:pdfexcavator@0.1.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TipoDocumento = "cnh_fisica" | "cnh_digital" | "rg_fisico" | "rg_digital" | "cin_fisica" | "cin_digital";
type Campo = string | string[] | null;
type DadosDocumento = Record<string, Campo> & { tipo_documento: TipoDocumento };
type Linha = { text: string; x0: number; y0: number; x1: number; y1: number; page: number };

const LABELS = [
  "nome", "nome completo", "nome e sobrenome", "cpf", "registro geral", "rg", "cin", "doc. identidade", "documento de identidade",
  "orgao emissor", "data de nascimento", "nascimento", "filiacao", "naturalidade", "nacionalidade",
  "data de emissao", "emissao", "validade", "categoria", "cat. hab.", "numero registro", "n registro",
  "primeira habilitacao", "1 habilitacao", "local", "observacoes", "permissao", "renach",
];

const normalize = (value: string) => value
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ").trim();

const normalizedLower = (value: string) => normalize(value).toLowerCase();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validarCpf(value: string | null): string | null {
  if (!value) return null;
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return null;
  const digito = (base: string, peso: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (peso - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
      digito(cpf.slice(0, 10), 11) === Number(cpf[10]) ? cpf : null;
}

function classificar(texto: string): TipoDocumento | null {
  const n = normalizedLower(texto);
  const digital = /qr[ -]?code|documento digital|versao digital|validar.*qr|assinatura digital/.test(n);
  if (/carteira nacional de habilitacao|carteira digital de transito|documento de habilitacao|permissao para dirigir|cat\.? hab|n[ºo°]? registro|\brenach\b/.test(n)) {
    return digital ? "cnh_digital" : "cnh_fisica";
  }
  if (/carteira de identidade nacional|documento nacional de identidade|\bcin\b/.test(n)) {
    return digital ? "cin_digital" : "cin_fisica";
  }
  if (/registro geral|carteira de identidade|secretaria.*seguranca publica|instituto.*identificacao/.test(n)) {
    return digital ? "rg_digital" : "rg_fisico";
  }
  return null;
}

function limparValor(value: string | null): string | null {
  if (!value) return null;
  const clean = value.replace(/^[:\-–—\s]+/, "").replace(/\s+/g, " ").trim();
  return clean || null;
}

function valorRotulo(linhas: Linha[], aliases: string[]): string | null {
  const aliasesNorm = aliases.map(normalizedLower);
  for (let i = 0; i < linhas.length; i++) {
    const original = linhas[i].text.trim();
    const atual = normalizedLower(original);
    for (const alias of aliasesNorm) {
      const inline = atual.match(new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:-]?\\s+(.+)$`, "i"));
      if (inline?.[1]) return limparValor(original.slice(original.toLowerCase().indexOf(inline[1].toLowerCase()))) ?? inline[1];
      if (atual === alias || atual.replace(/[:-]+$/, "").trim() === alias) {
        const mesmaFaixa = linhas.find((l, j) => j !== i && l.page === linhas[i].page &&
          Math.abs(l.y0 - linhas[i].y0) <= 8 && l.x0 > linhas[i].x1);
        if (mesmaFaixa) return limparValor(mesmaFaixa.text);
        for (let j = i + 1; j < Math.min(i + 4, linhas.length); j++) {
          if (!LABELS.includes(normalizedLower(linhas[j].text).replace(/[:-]+$/, "").trim())) {
            return limparValor(linhas[j].text);
          }
        }
      }
    }
  }
  return null;
}

function dataValida(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/\b(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})\b/);
  return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}` : null;
}

function extrair(linhas: Linha[], tipo: TipoDocumento): DadosDocumento {
  const texto = linhas.map((l) => l.text).join("\n");
  const cpfEncontrado = texto.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/)?.[0] ?? null;
  const rg = valorRotulo(linhas, ["RG", "REGISTRO GERAL", "DOC. IDENTIDADE", "DOCUMENTO DE IDENTIDADE"]);
  const cin = valorRotulo(linhas, ["CIN", "CARTEIRA DE IDENTIDADE NACIONAL"]);
  const filiacao = valorRotulo(linhas, ["FILIAÇÃO", "FILIACAO"]);
  const dados: DadosDocumento = {
    tipo_documento: tipo,
    nome: valorRotulo(linhas, ["NOME", "NOME COMPLETO", "NOME E SOBRENOME"]),
    cpf: validarCpf(cpfEncontrado ?? valorRotulo(linhas, ["CPF"])),
    rg: rg ? rg.replace(/^RG\s*[:-]?\s*/i, "").trim() : null,
    cin: cin ? cin.replace(/^CIN\s*[:-]?\s*/i, "").trim() : null,
    orgao_emissor: valorRotulo(linhas, ["ÓRGÃO EMISSOR", "ORGAO EMISSOR", "ÓRGÃO EXPEDIDOR", "ORGAO EXPEDIDOR"]),
    uf: valorRotulo(linhas, ["UF"]),
    data_nascimento: dataValida(valorRotulo(linhas, ["DATA DE NASCIMENTO", "NASCIMENTO", "DATA NASC."])),
    filiacao: filiacao ? [filiacao] : null,
    naturalidade: valorRotulo(linhas, ["NATURALIDADE"]),
    nacionalidade: valorRotulo(linhas, ["NACIONALIDADE"]),
    data_emissao: dataValida(valorRotulo(linhas, ["DATA DE EMISSÃO", "DATA EMISSÃO", "EMISSÃO"])),
    validade: dataValida(valorRotulo(linhas, ["VALIDADE", "VÁLIDA ATÉ", "VALIDA ATE"])),
  };
  if (tipo.startsWith("cnh_")) {
    dados.cnh = valorRotulo(linhas, ["Nº REGISTRO", "N REGISTRO", "REGISTRO", "CNH", "RENACH"]);
    dados.categoria = valorRotulo(linhas, ["CAT. HAB.", "CATEGORIA", "CAT HAB"]);
    dados.primeira_habilitacao = dataValida(valorRotulo(linhas, ["1ª HABILITAÇÃO", "1 HABILITACAO", "PRIMEIRA HABILITAÇÃO"]));
    dados.permissao = valorRotulo(linhas, ["PERMISSÃO", "PERMISSAO"]);
    dados.observacoes = valorRotulo(linhas, ["OBSERVAÇÕES", "OBSERVACOES"]);
    dados.local = valorRotulo(linhas, ["LOCAL"]);
  }
  return dados;
}

async function lerPdf(data: Uint8Array): Promise<Linha[]> {
  const pdf = await PDFExcavator.fromUint8Array(data, { unicodeNorm: "NFC", repair: true });
  try {
    if (pdf.pageCount > 20) throw new Error("Documento pessoal excede o limite de 20 páginas");
    const linhas: Linha[] = [];
    for (const page of pdf.pages) {
      const pageLines = await page.getTextLines(4);
      for (const line of pageLines) {
        if (line.text.trim()) linhas.push({
          text: line.text.trim(), x0: line.x0, y0: line.y0, x1: line.x1, y1: line.y1, page: page.pageNumber + 1,
        });
      }
    }
    return linhas.sort((a, b) => a.page - b.page || a.y0 - b.y0 || a.x0 - b.x0);
  } finally {
    await pdf.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authError } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (authError || !user) return json({ error: "Não autenticado" }, 401);

    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const arquivo = form.get("arquivo");
      if (!(arquivo instanceof File)) return json({ error: "arquivo PDF obrigatório" }, 400);
      if (arquivo.type !== "application/pdf") return json({ error: "O arquivo deve ser PDF" }, 400);
      if (arquivo.size > 10 * 1024 * 1024) return json({ error: "O PDF excede o limite de 10 MB" }, 400);

      const linhas = await lerPdf(new Uint8Array(await arquivo.arrayBuffer()));
      if (!linhas.length) {
        return json({
          ok: false,
          diagnostico: { arquivo: arquivo.name, linhas_texto: 0, motivo: "pdf_sem_camada_de_texto" },
          dados: null,
          campos_ausentes: ["nome", "cpf", "rg"],
        });
      }
      const tipo = classificar(linhas.map((linha) => linha.text).join("\n"));
      if (!tipo) {
        return json({
          ok: false,
          diagnostico: { arquivo: arquivo.name, linhas_texto: linhas.length, motivo: "tipo_nao_identificado" },
          dados: null,
          campos_ausentes: ["nome", "cpf", "rg"],
        });
      }
      const dados = extrair(linhas, tipo);
      const camposAusentes = [
        !dados.nome && "nome",
        !dados.cpf && "cpf",
        !(dados.rg || dados.cin || dados.cnh) && "rg",
      ].filter(Boolean);
      return json({
        ok: camposAusentes.length === 0,
        diagnostico: {
          arquivo: arquivo.name,
          linhas_texto: linhas.length,
          tipo_documento: tipo,
          motivo: camposAusentes.length ? "campos_obrigatorios_ausentes" : null,
        },
        dados,
        campos_ausentes: camposAusentes,
      });
    }

    const { caso_id } = await req.json();
    if (!caso_id) return json({ error: "caso_id obrigatório" }, 400);
    const { data: caso, error: casoError } = await supabase.from("casos")
      .select("id,nome_cliente,qualificacao").eq("id", caso_id).single();
    if (casoError || !caso) return json({ error: "Caso não encontrado" }, 404);

    const { data: arquivos, error: arquivosError } = await supabase.from("arquivos")
      .select("nome,storage_path,mime_type").eq("caso_id", caso_id).eq("tipo", "informacoes_pessoais");
    if (arquivosError) throw arquivosError;
    if (!arquivos?.length) return json({ error: "Nenhum documento pessoal no caso" }, 400);

    const documentos: Array<{ arquivo: string; dados: DadosDocumento }> = [];
    const revisao: Array<{ arquivo: string; motivo: string }> = [];
    for (const arquivo of arquivos) {
      if (arquivo.mime_type !== "application/pdf") {
        revisao.push({ arquivo: arquivo.nome, motivo: "formato_nao_pdf" });
        continue;
      }
      try {
        const { data: blob, error } = await supabase.storage.from("casos-arquivos").download(arquivo.storage_path);
        if (error || !blob) throw error ?? new Error("Falha no download");
        const linhas = await lerPdf(new Uint8Array(await blob.arrayBuffer()));
        if (!linhas.length) {
          revisao.push({ arquivo: arquivo.nome, motivo: "pdf_sem_camada_de_texto" });
          continue;
        }
        const tipo = classificar(linhas.map((l) => l.text).join("\n"));
        if (!tipo) {
          revisao.push({ arquivo: arquivo.nome, motivo: "tipo_nao_identificado" });
          continue;
        }
        const dados = extrair(linhas, tipo);
        const faltantes = [!dados.nome && "nome", !dados.cpf && "cpf", !(dados.rg || dados.cin || dados.cnh) && "rg"].filter(Boolean);
        documentos.push({ arquivo: arquivo.nome, dados });
        if (faltantes.length) {
          revisao.push({ arquivo: arquivo.nome, motivo: `campos_ausentes:${faltantes.join(",")}` });
        }
      } catch (error) {
        revisao.push({ arquivo: arquivo.nome, motivo: error instanceof Error ? error.message : "falha_na_extracao" });
      }
    }

    if (!documentos.length) {
      await supabase.from("casos").update({
        erro_processamento: "Documento pessoal precisa de revisão manual",
        status: "aguardando_confirmacao",
      }).eq("id", caso_id);
      return json({ ok: false, documentos: [], revisao });
    }

    const primeiro = documentos[0].dados;
    const cpf = documentos.map((d) => d.dados.cpf).find(Boolean) as string | undefined;
    const nome = documentos.map((d) => d.dados.nome).find(Boolean) as string | undefined;
    const identidade = documentos.map((d) => d.dados.rg ?? d.dados.cin ?? d.dados.cnh).find(Boolean) as string | undefined;
    const qualificacaoAtual = caso.qualificacao && typeof caso.qualificacao === "object" ? caso.qualificacao : {};
    const qualificacao = {
      ...qualificacaoAtual,
      nacionalidade: primeiro.nacionalidade ?? (qualificacaoAtual as Record<string, unknown>).nacionalidade ?? "brasileiro",
      documento_pessoal: primeiro,
      documentos_pessoais: documentos.map((d) => ({ arquivo: d.arquivo, ...d.dados })),
    };
    const { error: updateError } = await supabase.from("casos").update({
      nome_cliente: nome ?? caso.nome_cliente,
      nome_pre_extraido: nome ?? null,
      cpf: cpf ?? null,
      cpf_pre_extraido: cpf ?? null,
      rg: identidade ?? null,
      qualificacao,
      erro_processamento: revisao.length ? `${revisao.length} documento(s) pessoal(is) precisam de revisão` : null,
      status: "aguardando_confirmacao",
    }).eq("id", caso_id);
    if (updateError) throw updateError;

    return json({ ok: true, documentos, revisao });
  } catch (error) {
    console.error("process-documentos-pessoais-pdf error", error);
    return json({ error: error instanceof Error ? error.message : "Erro ao processar documentos pessoais" }, 500);
  }
});
