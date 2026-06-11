import { useEffect, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import type { CasoData } from "@/pages/Caso";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const fmtTempo = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type Lote = {
  id: string;
  ordem: number;
  arquivo_ids: string[];
  status: "pendente" | "processando" | "concluido" | "erro";
  resultado: any;
  erro: string | null;
};

export function TelaProcessando({ caso }: { caso: CasoData }) {
  const [arquivos, setArquivos] = useState<any[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const isError = !!caso.erro_processamento;

  // Polling: arquivos + lotes (caixinhas) enquanto processa.
  useEffect(() => {
    let ativo = true;
    const buscar = async () => {
      const [{ data: arqs }, { data: lts }] = await Promise.all([
        supabase.from("arquivos").select("*").eq("caso_id", caso.id),
        (supabase as any).from("lotes_extracao").select("*").eq("caso_id", caso.id).order("ordem"),
      ]);
      if (!ativo) return;
      setArquivos(arqs ?? []);
      setLotes((lts ?? []) as Lote[]);
    };
    buscar();
    const t = setInterval(buscar, 2500);
    return () => {
      ativo = false;
      clearInterval(t);
    };
  }, [caso.id]);

  // Cronômetro.
  useEffect(() => {
    if (isError) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isError]);

  // "Tentar novamente" reprocessa SÓ os lotes pendentes/erro (a função resume).
  const retry = async () => {
    setRetrying(true);
    setSegundos(0);
    await supabase.from("casos").update({ status: "em_analise", erro_processamento: null }).eq("id", caso.id);
    const { error } = await supabase.functions.invoke("extract-case-data", { body: { caso_id: caso.id } });
    setRetrying(false);
    if (error) toast.error("Falha ao reprocessar");
  };

  const total = lotes.length;
  const concluidos = lotes.filter((l) => l.status === "concluido").length;
  const pct = total ? Math.round((concluidos / total) * 100) : 0;
  const nomeDe = (id: string) => arquivos.find((a) => a.id === id)?.nome ?? "";

  const statusLote = (l: Lote) => {
    switch (l.status) {
      case "concluido": {
        const n = Array.isArray(l.resultado?.contracheques) ? l.resultado.contracheques.length : 0;
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-status-concluido">
            <CheckCircle2 className="h-4 w-4" /> {n} contracheque(s)
          </span>
        );
      }
      case "processando":
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-primary">
            <Loader2 className="h-4 w-4 animate-spin" /> processando…
          </span>
        );
      case "erro":
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" /> falhou
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Circle className="h-4 w-4" /> aguardando
          </span>
        );
    }
  };

  return (
    <div className="rounded-lg border bg-card p-8">
      <div className="mb-6 text-center">
        {isError ? (
          <>
            <p className="text-lg font-semibold text-destructive">Erro no processamento</p>
            <p className="mt-1 text-sm text-muted-foreground">{caso.erro_processamento}</p>
            <Button className="mt-4" onClick={retry} disabled={retrying}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {retrying ? "Reprocessando…" : "Reprocessar pendentes"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Só os lotes que falharam serão refeitos — o que já deu certo é mantido.
            </p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
            <p className="text-lg font-medium">Analisando documentos com IA…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {arquivos.length} arquivo(s) em {total || "…"} lote(s) de até 10.
            </p>

            <div className="mx-auto mt-5 max-w-sm">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.max(pct, 3)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">{concluidos} de {total}</span> lotes concluídos ({pct}%) · há{" "}
                <span className="font-mono">{fmtTempo(segundos)}</span>
              </p>
            </div>
          </>
        )}
      </div>

      {lotes.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {lotes.map((l) => (
            <div
              key={l.id}
              className={`rounded-lg border p-3 ${
                l.status === "erro"
                  ? "border-destructive/40 bg-destructive/5"
                  : l.status === "concluido"
                    ? "bg-muted/30"
                    : "bg-card"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Lote {l.ordem + 1}</span>
                {statusLote(l)}
              </div>
              {l.status === "erro" && l.erro && (
                <p className="mb-2 truncate text-xs text-destructive" title={l.erro}>{l.erro}</p>
              )}
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {l.arquivo_ids.slice(0, 4).map((id) => (
                  <li key={id} className="truncate">{nomeDe(id)}</li>
                ))}
                {l.arquivo_ids.length > 4 && <li>… e mais {l.arquivo_ids.length - 4}</li>}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2">
          <h3 className="mb-2 text-sm font-semibold">Arquivos ({arquivos.length})</h3>
          <ul className="space-y-1 text-sm">
            {arquivos.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded border bg-muted/40 px-3 py-2">
                <span className="truncate">{a.nome}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{a.mime_type ?? ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
