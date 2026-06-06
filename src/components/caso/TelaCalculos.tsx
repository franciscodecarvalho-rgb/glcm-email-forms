import { useState, useMemo } from "react";
import { ArrowLeft, FileCheck, X } from "lucide-react";
import type { CasoData } from "@/pages/Caso";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { calcularIrSobreHra } from "@/lib/calcular-ir-hra";
import { contrachequesLegadoParaMotor } from "@/lib/contracheques-legado";

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function TelaCalculos({ caso, onCancel }: { caso: CasoData; onCancel: () => void }) {
  const [pasta, setPasta] = useState(caso.numero_pasta ?? "");
  const [generating, setGenerating] = useState(false);

  const contras = (caso.contracheques as any[]) ?? [];
  const totHra = useMemo(() => contras.reduce((a, c) => a + Number(c.valor_hra || 0), 0), [contras]);
  const totAhra = useMemo(() => contras.reduce((a, c) => a + Number(c.valor_ahra || 0), 0), [contras]);
  const totGeral = totHra + totAhra;

  // Motor de cálculo: IR a restituir (27,5%) sobre as rubricas HRA.
  const calculo = useMemo(
    () => calcularIrSobreHra(contrachequesLegadoParaMotor(contras)),
    [contras],
  );
  const valorCausa = calculo.totalHistorico;

  const voltar = async () => {
    await supabase.from("casos").update({ status: "aguardando_confirmacao" }).eq("id", caso.id);
  };

  const gerar = async () => {
    if (!pasta.trim()) { toast.error("Informe o número da pasta"); return; }
    setGenerating(true);
    const { error: updErr } = await supabase
      .from("casos")
      .update({ numero_pasta: pasta, valor_causa: valorCausa })
      .eq("id", caso.id);
    if (updErr) { setGenerating(false); toast.error("Erro ao salvar"); return; }
    const { error } = await supabase.functions.invoke("generate-documents", { body: { caso_id: caso.id } });
    setGenerating(false);
    if (error) toast.error("Erro ao gerar documentos"); else toast.success("Documentos gerados");
  };

  const e = caso.endereco ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Revisão dos Cálculos</h1>
        <p className="text-sm text-muted-foreground">Confira os totais e informe o número da pasta para gerar os documentos.</p>
      </div>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-3 font-semibold">Cliente</h2>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div><span className="text-muted-foreground">Nome: </span>{caso.nome_cliente}</div>
          <div><span className="text-muted-foreground">CPF: </span>{caso.cpf}</div>
          <div><span className="text-muted-foreground">RG: </span>{caso.rg}</div>
          <div className="md:col-span-2"><span className="text-muted-foreground">Endereço: </span>
            {[e.logradouro, e.numero, e.bairro, e.cidade, e.estado, e.cep].filter(Boolean).join(", ")}
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-3 font-semibold">Contracheques</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Identificação</TableHead>
              <TableHead className="text-right">HRA</TableHead>
              <TableHead className="text-right">AHRA</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">IR (27,5%)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contras.map((c: any, idx: number) => (
              <TableRow key={c.id}>
                <TableCell>{c.label}</TableCell>
                <TableCell className="text-right">{fmt(Number(c.valor_hra || 0))}</TableCell>
                <TableCell className="text-right">{fmt(Number(c.valor_ahra || 0))}</TableCell>
                <TableCell className="text-right font-medium">{fmt(Number(c.valor_hra || 0) + Number(c.valor_ahra || 0))}</TableCell>
                <TableCell className="text-right">{fmt(calculo.linhas[idx]?.irMes ?? 0)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell>Totais</TableCell>
              <TableCell className="text-right">{fmt(totHra)}</TableCell>
              <TableCell className="text-right">{fmt(totAhra)}</TableCell>
              <TableCell className="text-right text-base">{fmt(totGeral)}</TableCell>
              <TableCell className="text-right text-base">{fmt(valorCausa)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      <section className="rounded-lg border bg-primary/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Valor da causa — IR a restituir</h2>
            <p className="text-sm text-muted-foreground">
              IR (27,5%) sobre as rubricas HRA de todas as competências, antes da correção pela Selic.
            </p>
          </div>
          <span className="text-2xl font-bold">{fmt(valorCausa)}</span>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <Label htmlFor="pasta" className="text-sm font-semibold">Número da Pasta *</Label>
        <Input id="pasta" className="mt-2 max-w-sm" value={pasta} onChange={(e) => setPasta(e.target.value)} placeholder="ex: 2026/0123" />
      </section>

      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={voltar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}><X className="mr-2 h-4 w-4" />Cancelar Caso</Button>
          <Button onClick={gerar} disabled={generating}><FileCheck className="mr-2 h-4 w-4" />{generating ? "Gerando…" : "Gerar Documentos"}</Button>
        </div>
      </div>
    </div>
  );
}
