import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeStorageName } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const TIPOS_ACAO = [
  { id: "ir_sobre_hra", label: "IR sobre HRA (Tema 306)" },
  { id: "horas_extras", label: "Horas Extras" },
  { id: "supressao_folgas", label: "Supressão de Folgas" },
  { id: "contribuicao_extraordinaria", label: "Contribuição extraordinária" },
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

  const toggleEscritorio = (id: string) =>
    setEscritorios((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));

  const submit = async () => {
    if (contracheques.length === 0) {
      toast.error("Anexe ao menos um contracheque");
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
    const arquivos = [
      ...contracheques.map((file) => ({ file, tipo: "contracheque" })),
      ...comprovantesPessoais.map((file) => ({ file, tipo: "informacoes_pessoais" })),
    ];
    const limite = Number(limiteViabilidade);
    if (!Number.isFinite(limite) || limite < 0) {
      toast.error("Informe um limite de viabilidade válido");
      return;
    }
    setLoading(true);
    try {
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

      for (const { file: f, tipo } of arquivos) {
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
      }

      if (contracheques.length > 0) {
        const { data: processamento, error: processamentoError } = await supabase.functions.invoke(
          "process-contracheques-pdf",
          { body: { caso_id: caso.id } },
        );
        if (processamentoError) throw processamentoError;
        if (processamento?.revisao?.length) {
          toast.warning(`${processamento.revisao.length} contracheque(s) precisam de revisão manual`);
        }
      }

      const { data: pessoais, error: pessoaisError } = await supabase.functions.invoke("process-documentos-pessoais-pdf", {
        body: { caso_id: caso.id },
      });
      if (pessoaisError) throw pessoaisError;
      if (pessoais?.revisao?.length) {
        toast.warning(`${pessoais.revisao.length} documento(s) pessoal(is) precisam de revisão manual`);
      }

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
                  onChange={(e) => setContracheques(Array.from(e.target.files ?? []))}
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

          <Button className="w-full" onClick={submit} disabled={loading}>
            {loading ? "Enviando…" : "Criar caso e processar"}
          </Button>
        </div>
      </main>
    </div>
  );
}
