import { useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import type { CasoData } from "@/pages/Caso";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Contra = { id: string; label: string; valor_hra: number; valor_ahra: number };

export function TelaConfirmacao({ caso, onCancel }: { caso: CasoData; onCancel: () => void }) {
  const [nome, setNome] = useState(caso.nome_cliente ?? "");
  const [cpf, setCpf] = useState(caso.cpf ?? "");
  const [rg, setRg] = useState(caso.rg ?? "");
  const e0 = caso.endereco ?? {};
  const [end, setEnd] = useState({
    logradouro: e0.logradouro ?? "",
    numero: e0.numero ?? "",
    bairro: e0.bairro ?? "",
    cidade: e0.cidade ?? "",
    estado: e0.estado ?? "",
    cep: e0.cep ?? "",
  });
  const init: Contra[] = Array.isArray(caso.contracheques) && caso.contracheques.length
    ? caso.contracheques.map((c: any, i: number) => ({
        id: c.id ?? crypto.randomUUID(),
        label: c.label ?? `Contracheque ${i + 1}`,
        valor_hra: Number(c.valor_hra) || 0,
        valor_ahra: Number(c.valor_ahra) || 0,
      }))
    : [];
  const [contras, setContras] = useState<Contra[]>(init);
  const [saving, setSaving] = useState(false);

  const upd = (id: string, patch: Partial<Contra>) =>
    setContras((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const add = () =>
    setContras((p) => [...p, { id: crypto.randomUUID(), label: `Contracheque ${p.length + 1}`, valor_hra: 0, valor_ahra: 0 }]);

  const remove = (id: string) => setContras((p) => p.filter((c) => c.id !== id));

  const confirmar = async () => {
    if (!nome || !cpf) { toast.error("Nome e CPF são obrigatórios"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("casos")
      .update({
        nome_cliente: nome,
        cpf,
        rg,
        endereco: end,
        contracheques: contras,
        status: "aguardando_pasta",
      })
      .eq("id", caso.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar"); else toast.success("Dados confirmados");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Confirmação dos Dados</h1>
        <p className="text-sm text-muted-foreground">Revise os dados extraídos pela IA e ajuste o que for necessário.</p>
      </div>

      <section className="space-y-4 rounded-lg border bg-card p-6">
        <h2 className="font-semibold">Dados pessoais</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><Label>Nome completo</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-2"><Label>CPF</Label><Input value={cpf} onChange={(e) => setCpf(e.target.value)} /></div>
          <div className="space-y-2"><Label>RG</Label><Input value={rg} onChange={(e) => setRg(e.target.value)} /></div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-6">
        <h2 className="font-semibold">Endereço</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <div className="space-y-2 md:col-span-4"><Label>Logradouro</Label><Input value={end.logradouro} onChange={(e) => setEnd({ ...end, logradouro: e.target.value })} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Número</Label><Input value={end.numero} onChange={(e) => setEnd({ ...end, numero: e.target.value })} /></div>
          <div className="space-y-2 md:col-span-3"><Label>Bairro</Label><Input value={end.bairro} onChange={(e) => setEnd({ ...end, bairro: e.target.value })} /></div>
          <div className="space-y-2 md:col-span-3"><Label>Cidade</Label><Input value={end.cidade} onChange={(e) => setEnd({ ...end, cidade: e.target.value })} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Estado</Label><Input value={end.estado} onChange={(e) => setEnd({ ...end, estado: e.target.value })} /></div>
          <div className="space-y-2 md:col-span-2"><Label>CEP</Label><Input value={end.cep} onChange={(e) => setEnd({ ...end, cep: e.target.value })} /></div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Contracheques (HRA / AHRA)</h2>
          <Button variant="outline" size="sm" onClick={add}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
        </div>
        {contras.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contracheque extraído. Adicione manualmente.</p>}
        <div className="space-y-3">
          {contras.map((c) => (
            <div key={c.id} className="grid grid-cols-1 gap-3 rounded border bg-muted/30 p-3 md:grid-cols-12">
              <div className="space-y-1 md:col-span-5"><Label className="text-xs">Identificação</Label><Input value={c.label} onChange={(e) => upd(c.id, { label: e.target.value })} /></div>
              <div className="space-y-1 md:col-span-3"><Label className="text-xs">Valor HRA</Label><Input type="number" step="0.01" value={c.valor_hra} onChange={(e) => upd(c.id, { valor_hra: Number(e.target.value) })} /></div>
              <div className="space-y-1 md:col-span-3"><Label className="text-xs">Valor AHRA</Label><Input type="number" step="0.01" value={c.valor_ahra} onChange={(e) => upd(c.id, { valor_ahra: Number(e.target.value) })} /></div>
              <div className="flex items-end md:col-span-1"><Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button></div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onCancel}><X className="mr-2 h-4 w-4" />Cancelar Caso</Button>
        <Button onClick={confirmar} disabled={saving}><Check className="mr-2 h-4 w-4" />{saving ? "Salvando…" : "Confirmar e Avançar"}</Button>
      </div>
    </div>
  );
}
