import { useState, useMemo } from "react";
import { ArrowLeft, FileCheck, X } from "lucide-react";
import type { CasoData } from "@/pages/Caso";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { calcularIrSobreHra } from "@/lib/calcular-ir-hra";
import { contrachequesLegadoParaMotor } from "@/lib/contracheques-legado";
import { useRevisaoCalculos, UF_MAP } from "@/contexts/RevisaoCalculosContext";

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function TelaCalculos({ caso, onCancel }: { caso: CasoData; onCancel: () => void }) {
  const { state, errors, setField } = useRevisaoCalculos();
  const [pasta, setPasta] = useState(caso.numero_pasta ?? "");
  const [generating, setGenerating] = useState(false);

  const contras = useMemo(() => (caso.contracheques as any[]) ?? [], [caso.contracheques]);
  const totHra = useMemo(() => contras.reduce((a, c) => a + Number(c.valor_hra || 0), 0), [contras]);
  const totAhra = useMemo(() => contras.reduce((a, c) => a + Number(c.valor_ahra || 0), 0), [contras]);
  const totGeral = totHra + totAhra;

  // Motor de cálculo: IR a restituir (27,5%) sobre as rubricas HRA.
  const calculo = useMemo(
    () => calcularIrSobreHra(contrachequesLegadoParaMotor(contras)),
    [contras],
  );
  const valorCausa = calculo.totalHistorico;

  const formValido = useMemo(() => {
    if (!pasta.trim()) return false;
    return Object.keys(errors).length === 0;
  }, [pasta, errors]);

  const voltar = async () => {
    await supabase.from("casos").update({ status: "aguardando_confirmacao" }).eq("id", caso.id);
  };

  const gerar = async () => {
    if (!pasta.trim()) { toast.error("Informe o número da pasta"); return; }
    if (!formValido) { toast.error("Preencha todos os campos obrigatórios"); return; }
    setGenerating(true);
    const { error: updErr } = await supabase
      .from("casos")
      .update({ numero_pasta: pasta, valor_causa: valorCausa })
      .eq("id", caso.id);
    if (updErr) { setGenerating(false); toast.error("Erro ao salvar"); return; }
    const { error } = await supabase.functions.invoke("generate-documents", {
      body: {
        caso_id: caso.id,
        captador: state.captador.trim(),
        oab: state.oab.trim(),
        email_cliente: state.email.trim(),
        telefone_cliente: state.telefone.trim(),
        uf_comarca: UF_MAP[state.ufComarca.trim()],
      },
    });
    setGenerating(false);
    if (error) toast.error("Erro ao gerar documentos"); else toast.success("Documentos gerados");
  };

  const e = caso.endereco ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Revisão dos Cálculos</h1>
        <p className="text-sm text-muted-foreground">Confira os totais e informe os dados abaixo para gerar os documentos.</p>
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

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Dados para geração dos documentos</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="pasta" className="text-sm font-semibold">Número da Pasta *</Label>
            <Input id="pasta" className="mt-2" value={pasta} onChange={(e) => setPasta(e.target.value)} placeholder="ex: 2026/0123" />
          </div>
          <div>
            <Label htmlFor="captador" className="text-sm font-semibold">Captador *</Label>
            <Input
              id="captador"
              className="mt-2"
              value={state.captador}
              onChange={(e) => setField("captador", e.target.value)}
              placeholder="ex: JSC"
            />
            {errors.captador && <p className="text-xs text-destructive mt-1">{errors.captador}</p>}
          </div>
          <div>
            <Label htmlFor="oab" className="text-sm font-semibold">OAB do Advogado *</Label>
            <Input
              id="oab"
              className="mt-2"
              value={state.oab}
              onChange={(e) => setField("oab", e.target.value)}
              placeholder="ex: BA123456"
            />
            {errors.oab && <p className="text-xs text-destructive mt-1">{errors.oab}</p>}
          </div>
          <div>
            <Label htmlFor="email" className="text-sm font-semibold">E-mail do Cliente *</Label>
            <Input
              id="email"
              type="email"
              className="mt-2"
              value={state.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="cliente@email.com"
            />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
          </div>
          <div>
            <Label htmlFor="telefone" className="text-sm font-semibold">Telefone do Cliente *</Label>
            <Input
              id="telefone"
              type="tel"
              className="mt-2"
              value={state.telefone}
              onChange={(e) => setField("telefone", e.target.value)}
              placeholder="(71) 99999-9999"
            />
            {errors.telefone && <p className="text-xs text-destructive mt-1">{errors.telefone}</p>}
          </div>
          <div>
            <Label htmlFor="uf-comarca" className="text-sm font-semibold">UF da Comarca *</Label>
            <Select value={state.ufComarca} onValueChange={(value) => setField("ufComarca", value)}>
              <SelectTrigger id="uf-comarca" className="mt-2">
                <SelectValue placeholder="Selecione a UF" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(UF_MAP).map((uf) => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.ufComarca && <p className="text-xs text-destructive mt-1">{errors.ufComarca}</p>}
          </div>
        </div>
      </section>

      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={voltar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}><X className="mr-2 h-4 w-4" />Cancelar Caso</Button>
          <Button onClick={gerar} disabled={generating || !formValido}><FileCheck className="mr-2 h-4 w-4" />{generating ? "Gerando…" : "Gerar Documentos"}</Button>
        </div>
      </div>
    </div>
  );
}
