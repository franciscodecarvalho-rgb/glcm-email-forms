import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function NovoCaso() {
  const nav = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [nomeCliente, setNomeCliente] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (files.length === 0) {
      toast.error("Anexe ao menos um arquivo");
      return;
    }
    setLoading(true);
    try {
      const { data: caso, error } = await supabase
        .from("casos")
        .insert({ status: "novo", origem: "manual", nome_cliente: nomeCliente || null })
        .select()
        .single();
      if (error) throw error;

      for (const f of files) {
        const path = `${caso.id}/${crypto.randomUUID()}-${f.name}`;
        const { error: upErr } = await supabase.storage.from("casos-arquivos").upload(path, f, {
          contentType: f.type || "application/octet-stream",
        });
        if (upErr) throw upErr;
        await supabase.from("arquivos").insert({
          caso_id: caso.id,
          nome: f.name,
          storage_path: path,
          mime_type: f.type,
        });
      }

      // Pré-extração: detecta duplicatas/recorrentes antes de extrair tudo
      const { data: pre } = await supabase.functions.invoke("pre-extract-cpf", {
        body: { caso_id: caso.id },
      });

      if (pre?.acao === "mesclado_auto" && pre?.ref_id) {
        toast.success("Caso mesclado automaticamente com cliente existente");
        nav(`/casos/${pre.ref_id}`);
        return;
      }

      // Disparar extração completa
      await supabase.from("casos").update({ status: "em_analise" }).eq("id", caso.id);
      supabase.functions.invoke("extract-case-data", { body: { caso_id: caso.id } }).catch(() => {});

      toast.success("Caso criado, processando…");
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
        <p className="mb-6 text-sm text-muted-foreground">Anexe os documentos do cliente. A IA fará a extração automática.</p>

        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome do cliente (opcional)</Label>
            <Input id="nome" value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} placeholder="Será preenchido automaticamente" />
          </div>

          <div className="space-y-2">
            <Label>Arquivos (RG, CPF, comprovante de residência, contracheques)</Label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/50 p-8 text-center hover:bg-muted">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">Clique para selecionar arquivos</span>
              <span className="text-xs text-muted-foreground">PDF, JPG, PNG</span>
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </label>
            {files.length > 0 && (
              <ul className="space-y-1 text-sm">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between rounded border bg-muted/40 px-3 py-2">
                    <span className="truncate">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button className="w-full" onClick={submit} disabled={loading}>
            {loading ? "Enviando…" : "Criar caso e processar"}
          </Button>
        </div>
      </main>
    </div>
  );
}
