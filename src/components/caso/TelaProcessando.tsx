import { useEffect, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, Circle } from "lucide-react";
import type { CasoData } from "@/pages/Caso";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const fmtTempo = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function TelaProcessando({ caso }: { caso: CasoData }) {
  const [arquivos, setArquivos] = useState<any[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const isError = !!caso.erro_processamento;

  // Busca arquivos e faz polling do progresso (coluna processado) enquanto analisa.
  useEffect(() => {
    let ativo = true;
    const buscar = () =>
      supabase
        .from("arquivos")
        .select("*")
        .eq("caso_id", caso.id)
        .then(({ data }) => {
          if (ativo) setArquivos(data ?? []);
        });
    buscar();
    if (isError) return () => { ativo = false; };
    const t = setInterval(buscar, 2500);
    return () => {
      ativo = false;
      clearInterval(t);
    };
  }, [caso.id, isError]);

  // Cronômetro de "tempo processando".
  useEffect(() => {
    if (isError) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isError]);

  const retry = async () => {
    setRetrying(true);
    setSegundos(0);
    await supabase.from("casos").update({ status: "em_analise", erro_processamento: null }).eq("id", caso.id);
    const { error } = await supabase.functions.invoke("extract-case-data", { body: { caso_id: caso.id } });
    setRetrying(false);
    if (error) toast.error("Falha ao reprocessar");
  };

  const total = arquivos.length;
  const processados = arquivos.filter((a) => a.processado).length;
  const pct = total ? Math.round((processados / total) * 100) : 0;

  return (
    <div className="rounded-lg border bg-card p-8">
      <div className="mb-6 text-center">
        {isError ? (
          <>
            <p className="text-lg font-semibold text-destructive">Erro no processamento</p>
            <p className="mt-1 text-sm text-muted-foreground">{caso.erro_processamento}</p>
            <Button className="mt-4" onClick={retry} disabled={retrying}>
              <RefreshCw className="mr-2 h-4 w-4" />{retrying ? "Reprocessando…" : "Tentar novamente"}
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
            <p className="text-lg font-medium">Analisando documentos com IA…</p>
            <p className="mt-1 text-sm text-muted-foreground">Extraindo dados pessoais e contracheques.</p>

            <div className="mx-auto mt-5 max-w-sm">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.max(pct, 3)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">{processados} de {total}</span> processados ({pct}%) · há{" "}
                <span className="font-mono">{fmtTempo(segundos)}</span>
              </p>
            </div>
          </>
        )}
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold">Arquivos ({total})</h3>
        <ul className="space-y-1 text-sm">
          {arquivos.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded border bg-muted/40 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                {a.processado ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-status-concluido" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                )}
                <span className="truncate">{a.nome}</span>
              </span>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">{a.mime_type ?? ""}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
