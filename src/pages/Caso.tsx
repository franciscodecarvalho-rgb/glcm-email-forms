import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { TelaConfirmacao } from "@/components/caso/TelaConfirmacao";
import { TelaCalculos } from "@/components/caso/TelaCalculos";
import { TelaDownload } from "@/components/caso/TelaDownload";
import { TelaProcessando } from "@/components/caso/TelaProcessando";
import { BlocoDuplicata } from "@/components/caso/BlocoDuplicata";
import { toast } from "sonner";

export type CasoData = {
  id: string;
  status: string;
  nome_cliente: string | null;
  cpf: string | null;
  rg: string | null;
  endereco: any;
  contracheques: any;
  numero_pasta: string | null;
  documentos_gerados: any;
  erro_processamento: string | null;
  mesclado_em: string | null;
  mesclado_at: string | null;
  possivel_duplicata_de: string | null;
  cliente_recorrente_ref: string | null;
};

export default function Caso() {
  const { id } = useParams();
  const nav = useNavigate();
  const [caso, setCaso] = useState<CasoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchOne = async () => {
      const { data, error } = await supabase.from("casos").select("*").eq("id", id).maybeSingle();
      if (error || !data) { toast.error("Caso não encontrado"); nav("/"); return; }
      setCaso(data as CasoData);
      setLoading(false);
    };
    fetchOne();
    const ch = supabase
      .channel(`caso-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "casos", filter: `id=eq.${id}` },
        (p) => setCaso(p.new as CasoData))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, nav]);

  if (loading || !caso) {
    return (
      <div className="min-h-screen bg-muted/30">
        <AppHeader />
        <main className="container py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />Carregando caso…
        </main>
      </div>
    );
  }

  const cancelar = async () => {
    await supabase.from("casos").update({ status: "cancelado" }).eq("id", caso.id);
    toast.success("Caso cancelado");
    nav("/");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <main className="container max-w-4xl py-8">
        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => nav("/")}><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Button>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">{caso.id.slice(0, 8)}</span>
            <StatusBadge status={caso.status} />
          </div>
        </div>

        {(caso.status === "novo" || caso.status === "em_analise") && <TelaProcessando caso={caso} />}
        {caso.status === "aguardando_confirmacao" && <TelaConfirmacao caso={caso} onCancel={cancelar} />}
        {caso.status === "aguardando_pasta" && <TelaCalculos caso={caso} onCancel={cancelar} />}
        {caso.status === "concluido" && <TelaDownload caso={caso} />}
        {caso.status === "cancelado" && (
          <div className="rounded-lg border bg-card p-8 text-center">
            <p className="text-lg font-medium">Este caso foi cancelado.</p>
            <p className="mt-1 text-sm text-muted-foreground">Crie um novo caso para reprocessar os documentos.</p>
          </div>
        )}
      </main>
    </div>
  );
}
