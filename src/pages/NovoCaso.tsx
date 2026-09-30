import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeStorageName } from "@/lib/storage";
import { unificarPdfsEmLotes } from "@/lib/unificar-pdfs";
import { mensagemErroFuncao } from "@/lib/edge-function-error";
import { dadosFaltantesParaCaso } from "@/lib/dados-extraidos";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const TIPOS_ACAO = [
  { id: "ir_sobre_hra", label: "IR sobre HRA (Tema 306)" },
  { id: "horas_extras", label: "Horas Extras" },
  { id: "supressao_folgas", label: "Supressão de Folgas" },
  { id: "contribuicao_extraordinaria", label: "Contribuição extraordinária" },
  { id: "tema_324", label: "Tema 324" },
];
const ESCRITORIOS_OPCOES = [
  { id: "glcm", label: "GLCM" },
  { id: "polkowski", label: "Polkowski" },
];

type StatusLote = { id: string; status: string; erro: string | null };
const INTERVALO_POLLING_LOTE_MS = 2_000;
const LIMITE_POLLING_LOTE_MS = 120_000;

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function erroRetornadoNoPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const objeto = payload as Record<string, unknown>;
  const valor = objeto.error ?? objeto.erro;
  if (typeof valor === "string" && valor.trim()) return valor.trim();
  if (valor && typeof valor === "object") {
    const aninhado = valor as Record<string, unknown>;
    if (typeof aninhado.message === "string" && aninhado.message.trim()) return aninhado.message.trim();
  }
  return null;
}

async function consultarStatusLote(casoId: string, loteId: string): Promise<StatusLote> {
  const { data, error } = await supabase.functions.invoke("process-contracheques-pdf", {
    body: { caso_id: casoId, progress: true },
  });
  if (error) {
    throw new Error(await mensagemErroFuncao(error, "Falha ao consultar o processamento do lote"));
  }
  const erroPayload = erroRetornadoNoPayload(data);
  if (erroPayload) throw new Error(erroPayload);
  const lote = (data?.lotes as StatusLote[] | undefined)?.find((item) => item.id === loteId);
  if (!lote) throw new Error("Status do lote não encontrado");
  return lote;
}

async function aguardarConclusaoLote(casoId: string, loteId: string): Promise<void> {
  const limite = Date.now() + LIMITE_POLLING_LOTE_MS;
  let ultimoErroConsulta: unknown = null;

  while (Date.now() < limite) {
    let lote: StatusLote | null = null;
    try {
      lote = await consultarStatusLote(casoId, loteId);
      ultimoErroConsulta = null;
    } catch (error) {
      ultimoErroConsulta = error;
    }
    if (lote?.status === "concluido") return;
    if (lote?.status === "erro") throw new Error(lote.erro || "Falha ao processar o lote");
    if (lote && lote.status !== "processando") throw new Error(`Lote em estado inesperado: ${lote.status}`);
    await esperar(INTERVALO_POLLING_LOTE_MS);
  }

  if (ultimoErroConsulta) {
    throw new Error(await mensagemErroFuncao(ultimoErroConsulta, "Não foi possível consultar o processamento do lote"));
  }
  throw new Error("O lote continua em processamento após o tempo limite de acompanhamento");
}

async function processarLoteComRetomada(casoId: string, loteId: string): Promise<void> {
  const statusAtual = await consultarStatusLote(casoId, loteId);
  if (statusAtual.status === "concluido") return;
  if (statusAtual.status === "processando") {
    await aguardarConclusaoLote(casoId, loteId);
    return;
  }
  const { data, error } = await supabase.functions.invoke("process-contracheques-pdf", {
    body: { caso_id: casoId, acao: "processar_lote", lote_id: loteId },
  });
  const erroPayload = erroRetornadoNoPayload(data);
  if (erroPayload) throw new Error(erroPayload);
  if (!error) {
    if (data?.em_processamento) await aguardarConclusaoLote(casoId, loteId);
    return;
  }

  // A conexão pode fechar antes da resposta embora a função continue e conclua
  // no backend. Nunca redispara: acompanha exclusivamente o estado persistido.
  try {
    await aguardarConclusaoLote(casoId, loteId);
  } catch (statusError) {
    if (statusError instanceof Error && statusError.message !== "O lote continua em processamento após o tempo limite de acompanhamento") {
      throw statusError;
    }
    throw new Error(await mensagemErroFuncao(error, "Falha de rede ao processar o lote"));
  }
}

export default function NovoCaso() {
  const nav = useNavigate();
  const [contracheques, setContracheques] = useState<File[]>([]);
  const [comprovantesPessoais, setComprovantesPessoais] = useState<File[]>([]);
  const [nomeCliente, setNomeCliente] = useState("");
  const [tipoAcao, setTipoAcao] = useState("ir_sobre_hra");
  const [escritorios, setEscritorios] = useState<string[]>(["glcm", "polkowski"]);
  const [honorarios, setHonorarios] = useState("20");
  const [limiteViabilidade, setLimiteViabilidade] = useState("15000");
  const [numeroPasta, setNumeroPasta] = useState("");
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [etapa, setEtapa] = useState("");
  const etapaRef = useRef("");
  const importacaoIdRef = useRef<string | null>(null);

  const atualizarEtapa = (valor: string) => {
    etapaRef.current = valor;
    setEtapa(valor);
  };

  const toggleEscritorio = (id: string) =>
    setEscritorios((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));

  const adicionarContracheques = (novos: File[]) => {
    setContracheques((atuais) => {
      const arquivos = [...atuais, ...novos];
      return arquivos.filter((arquivo, indice) =>
        arquivos.findIndex((item) =>
          item.name === arquivo.name && item.size === arquivo.size && item.lastModified === arquivo.lastModified
        ) === indice
      );
    });
  };

  const submit = async () => {
    if (contracheques.length === 0) {
      toast.error("Anexe ao menos um contracheque");
      return;
    }
    if (contracheques.some((file) => file.type !== "application/pdf")) {
      toast.error("Os contracheques devem estar no formato PDF");
      return;
    }
    if (comprovantesPessoais.length === 0) {
      toast.error("Anexe ao menos um documento pessoal");
      return;
    }
    if (comprovantesPessoais.some((file) => file.type !== "application/pdf")) {
      toast.error("Os documentos pessoais devem estar no formato PDF");
      return;
    }
    const limite = Number(limiteViabilidade);
    if (!Number.isFinite(limite) || limite < 0) {
      toast.error("Informe um limite de viabilidade válido");
      return;
    }
    setLoading(true);
    setProgresso(5);
    atualizarEtapa("Unificando contracheques");
    try {
      const { unificado: contrachequeUnificado, lotes: lotesPdf } = await unificarPdfsEmLotes(
        contracheques,
        undefined,
        ({ pagina, totalPaginas, confianca }) => {
          atualizarEtapa(`OCR local: página ${pagina}/${totalPaginas} (${Math.round(confianca)}% confiança)`);
          setProgresso(Math.min(15, 5 + Math.round((pagina / totalPaginas) * 10)));
        },
      );
      const arquivos = [
        { file: contrachequeUnificado, tipo: "contracheque" },
        ...comprovantesPessoais.map((file) => ({ file, tipo: "informacoes_pessoais" })),
      ];
      setProgresso(15);
      atualizarEtapa("Preparando importação provisória");
      let casoId = importacaoIdRef.current;
      if (!casoId) {
        const { data: caso, error } = await supabase
          .from("casos")
          .insert({
            status: "novo",
            origem: "manual",
            importacao_concluida: false,
            nome_cliente: nomeCliente || null,
            tipo_acao: tipoAcao,
            escritorios,
            honorarios_pct: honorarios ? Number(honorarios) : null,
            limite_viabilidade: limite,
            numero_pasta: numeroPasta || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        casoId = caso.id;
        importacaoIdRef.current = casoId;
      }

      // Mantém os mesmos caminhos se houver falha de rede e o usuário retomar.
      // O upsert evita duplicar objetos que já foram enviados na tentativa anterior.
      const { error: casoAtualizacaoError } = await supabase
        .from("casos")
        .update({
          nome_cliente: nomeCliente || null,
          tipo_acao: tipoAcao,
          escritorios,
          honorarios_pct: honorarios ? Number(honorarios) : null,
          limite_viabilidade: limite,
          numero_pasta: numeroPasta || null,
        })
        .eq("id", casoId);
      if (casoAtualizacaoError) throw casoAtualizacaoError;

      for (let indice = 0; indice < arquivos.length; indice++) {
        const { file: f, tipo } = arquivos[indice];
        atualizarEtapa(`Enviando arquivos (${indice + 1}/${arquivos.length})`);
        const path = `${casoId}/importacao/${tipo}-${indice}-${safeStorageName(f.name)}`;
        const { error: upErr } = await supabase.storage.from("casos-arquivos").upload(path, f, {
          upsert: true,
          contentType: f.type || "application/octet-stream",
        });
        if (upErr) throw upErr;
        const { data: metadadoExistente, error: consultaMetadadoError } = await supabase
          .from("arquivos")
          .select("id")
          .eq("caso_id", casoId)
          .eq("storage_path", path)
          .maybeSingle();
        if (consultaMetadadoError) throw consultaMetadadoError;
        if (!metadadoExistente) {
          const { error: metadadoError } = await supabase.from("arquivos").insert({
            caso_id: casoId,
            nome: f.name,
            tipo,
            storage_path: path,
            mime_type: f.type,
          });
          if (metadadoError) throw metadadoError;
        }
        setProgresso(20 + Math.round(((indice + 1) / arquivos.length) * 25));
      }

      // Lotes físicos: um PDF por lote no Storage (sem registros em `arquivos`).
      const lotesComPath = [];
      for (let indice = 0; indice < lotesPdf.length; indice++) {
        const lote = lotesPdf[indice];
        atualizarEtapa(`Enviando lotes de contracheques (${indice + 1}/${lotesPdf.length})`);
        const path = `${casoId}/contracheques-lotes/${lote.file.name}`;
        const { error: upErr } = await supabase.storage
          .from("casos-arquivos")
          .upload(path, lote.file, { contentType: "application/pdf", upsert: true });
        if (upErr) throw upErr;
        lotesComPath.push({
          ordem: lote.ordem,
          pagina_inicio: lote.pagina_inicio,
          pagina_fim: lote.pagina_fim,
          storage_path: path,
        });
        setProgresso(45 + Math.round(((indice + 1) / lotesPdf.length) * 10));
      }

      atualizarEtapa("Planejando lotes de contracheques");
      const { data: plano, error: planoError } = await supabase.functions.invoke(
        "process-contracheques-pdf",
        { body: { caso_id: casoId, acao: "planejar_lotes", lotes: lotesComPath } },
      );
      if (planoError) {
        throw new Error(await mensagemErroFuncao(planoError, "Falha ao planejar lotes de contracheques"));
      }
      const erroPlano = erroRetornadoNoPayload(plano);
      if (erroPlano) throw new Error(erroPlano);

      const lotesPlanejados: Array<{ id: string }> = plano?.lotes ?? [];
      for (let indice = 0; indice < lotesPlanejados.length; indice++) {
        atualizarEtapa(`Extraindo contracheques (lote ${indice + 1}/${lotesPlanejados.length})`);
        await processarLoteComRetomada(casoId, lotesPlanejados[indice].id);
        setProgresso(55 + Math.round(((indice + 1) / lotesPlanejados.length) * 25));
      }


      atualizarEtapa("Extraindo dados pessoais com Gemini");
      setProgresso(85);
      const { data: pessoais, error: pessoaisError } = await supabase.functions.invoke("process-documentos-pessoais-pdf", {
        body: { caso_id: casoId },
      });
      if (pessoaisError) {
        throw new Error(await mensagemErroFuncao(pessoaisError, "Falha ao extrair dados pessoais"));
      }
      const erroPessoais = erroRetornadoNoPayload(pessoais);
      if (erroPessoais) throw new Error(erroPessoais);
      if (pessoais?.revisao?.length) {
        toast.warning(`${pessoais.revisao.length} documento(s) pessoal(is) precisam de revisão manual`);
      }

      atualizarEtapa("Validando dados e etapas da importação");
      const { data: dadosCaso, error: validacaoError } = await supabase
        .from("casos")
        .select("nome_cliente, cpf, rg, endereco, contracheques_extraidos:contracheques(itens_contracheque(id))")
        .eq("id", casoId)
        .single();
      if (validacaoError) throw validacaoError;
      const dadosFaltantes = dadosFaltantesParaCaso(dadosCaso);
      if (dadosFaltantes.includes("rubricas extraídas dos contracheques")) {
        throw new Error("Nenhuma rubrica foi persistida. Confira os PDFs e tente importar novamente.");
      }

      const { error: revisaoError } = await supabase
        .from("casos")
        .update({
          status: "aguardando_confirmacao",
          erro_processamento: dadosFaltantes.length ? `Preencha na confirmação: ${dadosFaltantes.join(", ")}` : null,
        })
        .eq("id", casoId);
      if (revisaoError) throw revisaoError;

      atualizarEtapa("Importação concluída");
      setProgresso(100);
      importacaoIdRef.current = null;
      toast.success(dadosFaltantes.length
        ? "Extração concluída; revise os dados antes de concluir a importação"
        : "Extração concluída; confirme os dados para concluir a importação");
      nav(`/casos/${casoId}`);
    } catch (e: unknown) {
      const erro = e && typeof e === "object" ? e as Record<string, unknown> : {};
      const mensagemOriginal = e instanceof Error
        ? e.message
        : typeof erro.message === "string"
          ? erro.message
          : typeof erro.error === "string"
            ? erro.error
            : "Falha inesperada na importação";
      const mensagem = /^failed to fetch$/i.test(mensagemOriginal.trim())
        ? "Falha de rede: o servidor não retornou resposta. Os arquivos enviados até aqui foram preservados; tente novamente."
        : mensagemOriginal;
      const etapaAtual = etapaRef.current || "Importação";
      toast.error(`${etapaAtual}: ${mensagem}`, { duration: 15000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <main className="container max-w-2xl py-8">
        <Button variant="ghost" size="sm" onClick={() => nav(-1)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
        <h1 className="mt-4 text-2xl font-bold">Novo Caso</h1>
        <p className="mb-6 text-sm text-muted-foreground">Anexe os documentos do cliente para extração automática.</p>

        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome do cliente (opcional)</Label>
            <Input id="nome" value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} placeholder="Será preenchido automaticamente" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de ação</Label>
              <Select value={tipoAcao} onValueChange={setTipoAcao}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_ACAO.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pasta">Número do Contrato</Label>
              <Input id="pasta" value={numeroPasta} onChange={(e) => setNumeroPasta(e.target.value)} placeholder="ex: 2026/0123" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hon">Honorários (%)</Label>
              <Input id="hon" type="number" min="0" max="100" value={honorarios} onChange={(e) => setHonorarios(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="limite-viabilidade">Limite de viabilidade (R$)</Label>
              <Input
                id="limite-viabilidade"
                type="number"
                min="0"
                step="0.01"
                value={limiteViabilidade}
                onChange={(e) => setLimiteViabilidade(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Escritórios</Label>
              <div className="flex items-center gap-4 pt-2">
                {ESCRITORIOS_OPCOES.map((es) => (
                  <label key={es.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={escritorios.includes(es.id)} onCheckedChange={() => toggleEscritorio(es.id)} />
                    {es.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Contracheques *</Label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/50 p-8 text-center hover:bg-muted">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">Selecionar contracheques</span>
                <span className="text-xs text-muted-foreground">PDF</span>
                <input
                  type="file"
                  multiple
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    adicionarContracheques(Array.from(e.target.files ?? []));
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {contracheques.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {contracheques.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded border bg-muted/40 px-3 py-2">
                      <span className="min-w-0 truncate">{f.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <Label>Comprovantes de informações pessoais *</Label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/50 p-8 text-center hover:bg-muted">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">Selecionar comprovantes</span>
                <span className="text-xs text-muted-foreground">CNH, RG ou CIN — PDF</span>
                <input
                  type="file"
                  multiple
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setComprovantesPessoais(Array.from(e.target.files ?? []))}
                />
              </label>
              {comprovantesPessoais.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {comprovantesPessoais.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded border bg-muted/40 px-3 py-2">
                      <span className="min-w-0 truncate">{f.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {loading && (
            <div className="space-y-2" aria-live="polite">
              <div className="flex justify-between text-sm">
                <span>{etapa}</span>
                <span>{progresso}%</span>
              </div>
              <Progress value={progresso} aria-label={`${etapa}: ${progresso}%`} />
            </div>
          )}

          <Button className="w-full" onClick={submit} disabled={loading}>
            {loading ? "Processando…" : "Criar caso e processar"}
          </Button>
        </div>
      </main>
    </div>
  );
}
