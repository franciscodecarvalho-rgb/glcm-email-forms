import { useState } from "react";
import { AlertTriangle, Download, Package, ArrowLeft, FileText, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { CasoData } from "@/pages/Caso";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PECA_LABELS } from "@/lib/status";
import { montarVariaveisCaso } from "@/lib/caso-variaveis";
import { toast } from "sonner";

type Doc = { tipo: string; storage_path: string; nome: string; avisos?: string[] };

export function TelaDownload({ caso }: { caso: CasoData }) {
  const nav = useNavigate();
  const [regerando, setRegerando] = useState(false);

  // Regera as peças (após corrigir dados, atualizar template ou deploy novo).
  // A tela atualiza sozinha via realtime quando documentos_gerados muda.
  const regerar = async () => {
    setRegerando(true);
    const { data, error } = await supabase.functions.invoke("generate-documents", {
      body: { caso_id: caso.id },
    });
    setRegerando(false);
    if (error || (data as any)?.error) toast.error((data as any)?.error ?? "Falha ao regerar");
    else toast.success("Documentos regerados");
  };
  const docs: Doc[] = Array.isArray(caso.documentos_gerados) ? (caso.documentos_gerados as any) : [];
  const labelOf = (tipo: string) => PECA_LABELS[tipo] ?? tipo;

  // Variáveis do caso sem valor: saem em branco em todas as peças que as usam.
  // ENDERECO_PFN é sempre revisão manual — não é "vazia", fica fora da lista.
  const variaveisVazias = Object.entries(montarVariaveisCaso(caso as any))
    .filter(([k, v]) => k !== "ENDERECO_PFN" && !String(v).trim())
    .map(([k]) => k);

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

      {variaveisVazias.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-4 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium">Variáveis sem valor neste caso</span> (saem em branco nas
              peças que as usam): {variaveisVazias.join(", ")}. Preencha na tela de confirmação e
              clique em "Gerar novamente".
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {docs.length === 0 && (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">Nenhum documento gerado.</div>
        )}
        {docs.map((d) => (
          <div key={d.tipo} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
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
            {d.avisos && d.avisos.length > 0 && (
              <ul className="mt-2 space-y-1 border-t pt-2">
                {d.avisos.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={() => nav("/")}><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={regerar} disabled={regerando}>
            <RefreshCw className={`mr-2 h-4 w-4 ${regerando ? "animate-spin" : ""}`} />
            {regerando ? "Regerando…" : "Gerar novamente"}
          </Button>
          {docs.length > 0 && (
            <Button onClick={downloadAll}><Package className="mr-2 h-4 w-4" />Baixar Todos (ZIP)</Button>
          )}
        </div>
      </div>
    </div>
  );
}
