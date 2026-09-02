import { useState } from "react";
import { Download, Package, ArrowLeft, FileText, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { CasoData } from "@/pages/Caso";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PECA_LABELS } from "@/lib/status";
import { toast } from "sonner";
import { useRevisaoCalculos } from "@/contexts/RevisaoCalculosContext";

type Doc = { tipo: string; storage_path: string; nome: string };

export function TelaDownload({ caso }: { caso: CasoData }) {
  const nav = useNavigate();
  const [regerando, setRegerando] = useState(false);
  const { state, errors, setField } = useRevisaoCalculos();
  const formValido = Object.keys(errors).length === 0;

  // Regera as peças (após corrigir dados, atualizar template ou deploy novo).
  // A Edge Function exige os mesmos campos da revisão de cálculos.
  const regerar = async () => {
    if (!formValido) { toast.error("Preencha os dados obrigatórios para regerar"); return; }
    setRegerando(true);
    const { data, error } = await supabase.functions.invoke("generate-documents", {
      body: {
        caso_id: caso.id,
        captador: state.captador.trim(),
        oab: state.oab.trim(),
        email_cliente: state.email.trim(),
        telefone_cliente: state.telefone.trim(),
        uf_comarca: state.ufComarca.trim(),
        endereco_uniao: state.enderecoUniao.trim(),
      },
    });
    setRegerando(false);
    if (error || (data as any)?.error) toast.error((data as any)?.error ?? "Falha ao regerar");
    else toast.success("Documentos regerados");
  };
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

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <div>
          <h2 className="font-semibold">Dados para gerar novamente</h2>
          <p className="text-sm text-muted-foreground">Obrigatórios para regerar as peças.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="rg-captador" className="text-sm font-semibold">Captador *</Label>
            <Input id="rg-captador" className="mt-2" value={state.captador} onChange={(e) => setField("captador", e.target.value)} placeholder="ex: JSC" />
            {errors.captador && <p className="text-xs text-destructive mt-1">{errors.captador}</p>}
          </div>
          <div>
            <Label htmlFor="rg-oab" className="text-sm font-semibold">OAB do Advogado *</Label>
            <Input id="rg-oab" className="mt-2" value={state.oab} onChange={(e) => setField("oab", e.target.value)} placeholder="ex: BA123456" />
            {errors.oab && <p className="text-xs text-destructive mt-1">{errors.oab}</p>}
          </div>
          <div>
            <Label htmlFor="rg-email" className="text-sm font-semibold">E-mail do Cliente *</Label>
            <Input id="rg-email" type="email" className="mt-2" value={state.email} onChange={(e) => setField("email", e.target.value)} placeholder="cliente@email.com" />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
          </div>
          <div>
            <Label htmlFor="rg-telefone" className="text-sm font-semibold">Telefone do Cliente</Label>
            <Input id="rg-telefone" type="tel" className="mt-2" value={state.telefone} onChange={(e) => setField("telefone", e.target.value)} placeholder="(71) 99999-9999" />
            {errors.telefone && <p className="text-xs text-destructive mt-1">{errors.telefone}</p>}
          </div>
          <div>
            <Label htmlFor="rg-uf" className="text-sm font-semibold">UF da Comarca *</Label>
            <Input
              id="rg-uf"
              className="mt-2"
              value={state.ufComarca}
              onChange={(e) => setField("ufComarca", e.target.value)}
              placeholder="ex: Salvador/BA"
            />
            {errors.ufComarca && <p className="text-xs text-destructive mt-1">{errors.ufComarca}</p>}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="rg-endereco-uniao" className="text-sm font-semibold">Endereço União</Label>
            <Input
              id="rg-endereco-uniao"
              className="mt-2"
              value={state.enderecoUniao}
              onChange={(e) => setField("enderecoUniao", e.target.value)}
              placeholder="Endereço da União (opcional)"
            />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={() => nav("/")}><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={regerar} disabled={regerando || !formValido}>
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
