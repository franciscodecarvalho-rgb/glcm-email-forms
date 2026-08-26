import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeStorageName } from "@/lib/storage";
import { unificarPdfsEmLotes } from "@/lib/unificar-pdfs";
import { mensagemErroFuncao } from "@/lib/edge-function-error";
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
    setEtapa("Unificando contracheques");
    try {
      const { unificado: contrachequeUnificado, lotes: lotesPdf } = await unificarPdfsEmLotes(contracheques);
      const arquivos = [
        { file: contrachequeUnificado, tipo: "contracheque" },
        ...comprovantesPessoais.map((file) => ({ file, tipo: "informacoes_pessoais" })),
      ];
      setProgresso(15);
      setEtapa("Criando caso");
      const { data: caso, error } = await supabase
        .from("casos")
        .insert({
          status: "novo",
          origem: "manual",
          nome_cliente: nomeCliente || null,
          tipo_acao: tipoAcao,
          escritorios,
          honorarios_pct: honorarios ? Number(honorarios) : null,
          limite_viabilidade: limite,
          numero_pasta: numeroPasta || null,
        })
        .select()
        .single();
      if (error) throw error;

      for (let indice = 0; indice < arquivos.length; indice++) {
        const { file: f, tipo } = arquivos[indice];
        setEtapa(`Enviando arquivos (${indice + 1}/${arquivos.length})`);
        const path = `${caso.id}/${crypto.randomUUID()}-${safeStorageName(f.name)}`;
        const { error: upErr } = await supabase.storage.from("casos-arquivos").upload(path, f, {
          contentType: f.type || "application/octet-stream",
        });
        if (upErr) throw upErr;
        await supabase.from("arquivos").insert({
          caso_id: caso.id,
          nome: f.name,
          tipo,
          storage_path: path,
          mime_type: f.type,
        });
        setProgresso(20 + Math.round(((indice + 1) / arquivos.length) * 25));
      }

      // Lotes físicos: um PDF por lote no Storage (sem registros em `arquivos`).
      const lotesComPath = [];
      for (let indice = 0; indice < lotesPdf.length; indice++) {
        const lote = lotesPdf[indice];
        setEtapa(`Enviando lotes de contracheques (${indice + 1}/${lotesPdf.length})`);
        const path = `${caso.id}/contracheques-lotes/${lote.file.name}`;
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

      setEtapa("Planejando lotes de contracheques");
      const { data: plano, error: planoError } = await supabase.functions.invoke(
        "process-contracheques-pdf",
        { body: { caso_id: caso.id, acao: "planejar_lotes", lotes: lotesComPath } },
      );
      if (planoError) {
        throw new Error(await mensagemErroFuncao(planoError, "Falha ao planejar lotes de contracheques"));
      }

      const lotesPlanejados: Array<{ id: string }> = plano?.lotes ?? [];
      for (let indice = 0; indice < lotesPlanejados.length; indice++) {
        setEtapa(`Extraindo contracheques (lote ${indice + 1}/${lotesPlanejados.length})`);
        const { error: loteError } = await supabase.functions.invoke("process-contracheques-pdf", {
          body: { caso_id: caso.id, acao: "processar_lote", lote_id: lotesPlanejados[indice].id },
        });
        if (loteError) {
          throw new Error(await mensagemErroFuncao(loteError, `Falha ao extrair o lote ${indice + 1}`));
        }
        setProgresso(55 + Math.round(((indice + 1) / lotesPlanejados.length) * 25));
      }


      setEtapa("Extraindo dados pessoais");
      setProgresso(85);
      const { data: pessoais, error: pessoaisError } = await supabase.functions.invoke("process-documentos-pessoais-pdf", {
        body: { caso_id: caso.id },
      });
      if (pessoaisError) {
        throw new Error(await mensagemErroFuncao(pessoaisError, "Falha ao extrair dados pessoais"));
      }
      if (pessoais?.revisao?.length) {
        toast.warning(`${pessoais.revisao.length} documento(s) pessoal(is) precisam de revisão manual`);
      }

      setEtapa("Processamento concluído");
      setProgresso(100);
      toast.success("Caso criado e documentos processados");
      nav(`/casos/${caso.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao criar caso");
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
              <Label htmlFor="pasta">Número da pasta</Label>
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
