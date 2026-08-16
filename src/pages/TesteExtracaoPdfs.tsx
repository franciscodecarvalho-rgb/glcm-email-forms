import { useState } from "react";
import { ArrowLeft, FileSearch, Loader2, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ResultadoTeste = {
  ok: boolean;
  diagnostico?: { arquivo?: string; linhas_texto?: number; tipo_documento?: string; motivo?: string | null };
  dados?: Record<string, unknown> | null;
  campos_ausentes?: string[];
  error?: string;
};

const rotulo = (chave: string) => chave.replaceAll("_", " ");
const valor = (conteudo: unknown) => Array.isArray(conteudo) ? conteudo.join("; ") : String(conteudo ?? "—");

export default function TesteExtracaoPdfs() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoTeste | null>(null);
  const [processando, setProcessando] = useState(false);

  const testar = async () => {
    if (!arquivo) return;
    setProcessando(true);
    setResultado(null);
    const form = new FormData();
    form.append("arquivo", arquivo);
    const { data, error } = await supabase.functions.invoke("process-documentos-pessoais-pdf", { body: form });
    setProcessando(false);
    if (error) {
      toast.error("Falha ao executar o teste de extração");
      setResultado({ ok: false, error: error.message });
      return;
    }
    setResultado(data as ResultadoTeste);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <main className="container max-w-4xl py-8">
        <Button variant="ghost" size="sm" asChild><Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Link></Button>
        <div className="mt-4">
          <h1 className="text-2xl font-bold">Teste de extração de dados pessoais</h1>
          <p className="text-sm text-muted-foreground">O PDF é processado em memória. Este teste não cria caso nem grava dados ou arquivos.</p>
        </div>

        <section className="mt-6 space-y-4 rounded-lg border bg-card p-6">
          <Label>CNH, RG ou CIN em PDF</Label>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/50 p-8 text-center hover:bg-muted">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">{arquivo?.name ?? "Selecionar documento pessoal"}</span>
            <span className="text-xs text-muted-foreground">PDF de até 10 MB</span>
            <input type="file" accept="application/pdf" className="hidden" onChange={(event) => {
              setArquivo(event.target.files?.[0] ?? null);
              setResultado(null);
            }} />
          </label>
          <Button className="w-full" disabled={!arquivo || processando} onClick={testar}>
            {processando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
            {processando ? "Extraindo…" : "Testar extração"}
          </Button>
        </section>

        {resultado && (
          <section className="mt-6 space-y-5 rounded-lg border bg-card p-6">
            <div>
              <h2 className="font-semibold">Diagnóstico</h2>
              <p className={resultado.ok ? "text-sm text-green-700" : "text-sm text-destructive"}>
                {resultado.ok ? "Todos os dados pessoais esperados foram extraídos." : "O documento precisa de ajuste no extrator."}
              </p>
            </div>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div><dt className="text-muted-foreground">Modelo reconhecido</dt><dd>{resultado.diagnostico?.tipo_documento ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Linhas de texto</dt><dd>{resultado.diagnostico?.linhas_texto ?? 0}</dd></div>
              <div><dt className="text-muted-foreground">Motivo</dt><dd>{resultado.diagnostico?.motivo ?? resultado.error ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Campos ausentes</dt><dd>{resultado.campos_ausentes?.join(", ") || "Nenhum"}</dd></div>
            </dl>
            <div>
              <h2 className="mb-3 font-semibold">Dados extraídos</h2>
              {resultado.dados ? (
                <dl className="grid gap-3 text-sm md:grid-cols-2">
                  {Object.entries(resultado.dados).map(([chave, conteudo]) => (
                    <div key={chave} className="rounded border bg-muted/30 p-3">
                      <dt className="capitalize text-muted-foreground">{rotulo(chave)}</dt>
                      <dd className="break-words font-medium">{valor(conteudo)}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="text-sm text-muted-foreground">Nenhum dado foi extraído.</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
