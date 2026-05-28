import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, GitMerge, RotateCcw, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  casoId: string;
  status: string;
  mescladoEm: string | null;
  mescladoAt: string | null;
  possivelDuplicataDe: string | null;
  clienteRecorrenteRef: string | null;
  casosMesclados?: { id: string; mesclado_at: string | null }[];
  onChange?: () => void;
};

const JANELA_MS = 7 * 24 * 60 * 60 * 1000;
const STATUS_FINAIS = ["concluido", "cancelado"];

export function BlocoDuplicata(p: Props) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  const callMerge = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("merge-casos", { body });
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message);
      toast.success(msg);
      p.onChange?.();
    } catch (e: any) {
      toast.error(e.message ?? "Falha");
    } finally {
      setBusy(false);
    }
  };

  // Caso é uma duplicata sugerida
  if (p.possivelDuplicataDe) {
    return (
      <div className="mb-4 rounded-lg border border-orange-300 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/40">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-orange-600 dark:text-orange-300" />
          <div className="flex-1">
            <p className="font-medium">Possível duplicata detectada</p>
            <p className="text-sm text-muted-foreground">
              Este caso pode ser o mesmo cliente do caso{" "}
              <button
                className="font-mono underline"
                onClick={() => nav(`/casos/${p.possivelDuplicataDe}`)}
              >
                #{p.possivelDuplicataDe!.slice(0, 8)}
              </button>.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => callMerge(
                  { acao: "mesclar", caso_id: p.casoId, alvo_id: p.possivelDuplicataDe },
                  "Casos mesclados",
                ).then(() => nav(`/casos/${p.possivelDuplicataDe}`))}
              >
                <GitMerge className="mr-1 h-4 w-4" />Mesclar
              </Button>
              <Button
                size="sm" variant="outline" disabled={busy}
                onClick={() => callMerge(
                  { acao: "manter_separado", caso_id: p.casoId },
                  "Mantido separado",
                )}
              >
                Manter separado
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Cliente recorrente
  if (p.clienteRecorrenteRef) {
    return (
      <div className="mb-4 rounded-lg border border-blue-300 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/40">
        <div className="flex items-start gap-3">
          <UserCheck className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-300" />
          <div>
            <p className="font-medium">Cliente recorrente</p>
            <p className="text-sm text-muted-foreground">
              Já existe um caso anterior concluído deste cliente:{" "}
              <button
                className="font-mono underline"
                onClick={() => nav(`/casos/${p.clienteRecorrenteRef}`)}
              >
                #{p.clienteRecorrenteRef!.slice(0, 8)}
              </button>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Recebeu mescla(s) — mostra opção de desfazer
  const mesclados = (p.casosMesclados ?? []).filter((c) => {
    if (!c.mesclado_at) return false;
    return Date.now() - new Date(c.mesclado_at).getTime() < JANELA_MS;
  });
  const podeDesfazer = !STATUS_FINAIS.includes(p.status) && mesclados.length > 0;
  if (podeDesfazer) {
    return (
      <div className="mb-4 rounded-lg border border-purple-300 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950/40">
        <div className="flex items-start gap-3">
          <GitMerge className="mt-0.5 h-5 w-5 text-purple-600 dark:text-purple-300" />
          <div className="flex-1">
            <p className="font-medium">Este caso recebeu {mesclados.length} mesclagem(ns) automática(s)</p>
            <p className="text-sm text-muted-foreground">
              Você pode desfazer dentro de 7 dias.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {mesclados.map((m) => (
                <Button
                  key={m.id} size="sm" variant="outline" disabled={busy}
                  onClick={() => callMerge(
                    { acao: "desfazer", caso_id: p.casoId, alvo_id: m.id },
                    "Mesclagem desfeita",
                  )}
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  Desfazer #{m.id.slice(0, 8)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
