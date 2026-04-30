import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { CasoData } from "@/pages/Caso";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function TelaProcessando({ caso }: { caso: CasoData }) {
  const [arquivos, setArquivos] = useState<any[]>([]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    supabase.from("arquivos").select("*").eq("caso_id", caso.id).then(({ data }) => setArquivos(data ?? []));
  }, [caso.id]);

  const retry = async () => {
    setRetrying(true);
    await supabase.from("casos").update({ status: "em_analise", erro_processamento: null }).eq("id", caso.id);
    const { error } = await supabase.functions.invoke("extract-case-data", { body: { caso_id: caso.id } });
    setRetrying(false);
    if (error) toast.error("Falha ao reprocessar");
  };

  const isError = !!caso.erro_processamento;

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
          </>
        )}
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold">Arquivos enviados ({arquivos.length})</h3>
        <ul className="space-y-1 text-sm">
          {arquivos.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded border bg-muted/40 px-3 py-2">
              <span className="truncate">{a.nome}</span>
              <span className="text-xs text-muted-foreground">{a.mime_type ?? ""}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
