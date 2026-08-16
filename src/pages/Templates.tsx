import { useEffect, useState } from "react";
import { Upload, Check, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { TEMPLATE_TIPOS, TemplateTipo } from "@/lib/status";
import { validarTemplateDocx, type ValidacaoTemplate } from "@/lib/validar-template";
import { toast } from "sonner";

type TplRow = { tipo: string; nome: string; storage_path: string; updated_at: string };

export default function Templates() {
  const [rows, setRows] = useState<Record<string, TplRow>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [valids, setValids] = useState<Record<string, ValidacaoTemplate>>({});

  const load = async () => {
    const { data } = await supabase.from("templates").select("*");
    const map: Record<string, TplRow> = {};
    (data ?? []).forEach((r: any) => (map[r.tipo] = r));
    setRows(map);
  };

  useEffect(() => { load(); }, []);

  const upload = async (tipo: TemplateTipo, file: File) => {
    if (!file.name.endsWith(".docx")) {
      toast.error("Envie um arquivo .docx");
      return;
    }
    setBusy(tipo);
    try {
      // Validação informativa (não bloqueia): variáveis reconhecidas/desconhecidas
      // e [colchetes] que sobraram da conversão manual no Word.
      try {
        const v = validarTemplateDocx(await file.arrayBuffer());
        setValids((s) => ({ ...s, [tipo]: v }));
        if (v.desconhecidas.length > 0 || v.colchetes.length > 0) {
          toast.warning("Template salvo com avisos — confira abaixo do arquivo");
        }
      } catch {
        toast.warning("Não foi possível inspecionar o .docx (validação pulada)");
      }
      const path = `${tipo}.docx`;
      const { error: upErr } = await supabase.storage
        .from("templates")
        .upload(path, file, { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      if (upErr) throw upErr;
      const { error } = await supabase
        .from("templates")
        .upsert({ tipo, nome: file.name, storage_path: path }, { onConflict: "tipo" });
      if (error) throw error;
      toast.success("Template salvo");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha no upload");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <main className="container max-w-3xl py-8">
        <h1 className="text-2xl font-bold">Templates de Documentos</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Suba os modelos <code className="rounded bg-muted px-1">.docx</code> com placeholders no formato <code className="rounded bg-muted px-1">{`{NOME_CLIENTE}`}</code>, <code className="rounded bg-muted px-1">{`{CPF}`}</code>, etc. Como converter os modelos do escritório: veja <code className="rounded bg-muted px-1">docs/CONVERSAO_TEMPLATES.md</code>.
        </p>

        <div className="space-y-3">
          {TEMPLATE_TIPOS.map((t) => {
            const cur = rows[t.id];
            const v = valids[t.id];
            return (
              <div key={t.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{t.label}</div>
                    {cur ? (
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Check className="h-3 w-3 text-status-concluido" />
                        <span>{cur.nome}</span>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-destructive">Nenhum template enviado</div>
                    )}
                  </div>
                  <label className="cursor-pointer">
                    <Button variant="outline" size="sm" asChild disabled={busy === t.id}>
                      <span><Upload className="mr-2 h-4 w-4" />{busy === t.id ? "Enviando…" : cur ? "Substituir" : "Enviar"}</span>
                    </Button>
                    <input
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && upload(t.id, e.target.files[0])}
                    />
                  </label>
                </div>
                {v && (
                  <div className="mt-3 space-y-1 border-t pt-3 text-xs">
                    <div className="text-muted-foreground">
                      {v.reconhecidas.length} variável(is) reconhecida(s)
                      {v.reconhecidas.length > 0 && `: ${v.reconhecidas.join(", ")}`}
                    </div>
                    {v.desconhecidas.length > 0 && (
                      <div className="flex items-start gap-1.5 text-amber-700">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          Variáveis desconhecidas (sairão em branco no documento): {v.desconhecidas.map((d) => `{${d}}`).join(", ")}
                        </span>
                      </div>
                    )}
                    {v.colchetes.length > 0 && (
                      <div className="flex items-start gap-1.5 text-amber-700">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          [Colchetes] não convertidos (ficarão literais no documento): {v.colchetes.join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
