import { Download, Package, ArrowLeft, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { CasoData } from "@/pages/Caso";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PECA_LABELS } from "@/lib/status";
import { toast } from "sonner";

type Doc = { tipo: string; storage_path: string; nome: string };

export function TelaDownload({ caso }: { caso: CasoData }) {
  const nav = useNavigate();
  const docs: Doc[] = Array.isArray(caso.documentos_gerados) ? (caso.documentos_gerados as any) : [];
  const labelOf = (tipo: string) => PECA_LABELS[tipo] ?? tipo;

  const downloadOne = async (d: Doc) => {
    const { data, error } = await supabase.storage.from("casos-documentos").download(d.storage_path);
    if (error || !data) { toast.error("Falha ao baixar"); return; }
    saveAs(data, d.nome);
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    for (const d of docs) {
      const { data } = await supabase.storage.from("casos-documentos").download(d.storage_path);
      if (data) zip.file(d.nome, data);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `caso-${caso.id.slice(0, 8)}.zip`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Documentos gerados</h1>
        <p className="text-sm text-muted-foreground">Faça o download individual ou em ZIP.</p>
      </div>

      <div className="space-y-2">
        {docs.length === 0 && (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">Nenhum documento gerado.</div>
        )}
        {docs.map((d) => (
          <div key={d.tipo} className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <div className="font-medium">{labelOf(d.tipo)}</div>
                <div className="text-xs text-muted-foreground">{d.nome}</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => downloadOne(d)}>
              <Download className="mr-2 h-4 w-4" />Baixar
            </Button>
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => nav("/")}><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Button>
        {docs.length > 0 && (
          <Button onClick={downloadAll}><Package className="mr-2 h-4 w-4" />Baixar Todos (ZIP)</Button>
        )}
      </div>
    </div>
  );
}
