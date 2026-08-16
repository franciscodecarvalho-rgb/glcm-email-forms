import { useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import type { CasoData } from "@/pages/Caso";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContrachequesExtraidos } from "@/components/caso/ContrachequesExtraidos";
import { toast } from "sonner";

type Contra = { id: string; label: string; valor_hra: number; valor_ahra: number };
type Empreg = { id: string; razao_social: string; cnpj: string };

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
  const [contras] = useState<Contra[]>(init);
  const q0 = caso.qualificacao ?? {};
  const [qual, setQual] = useState({
    nacionalidade: q0.nacionalidade ?? "brasileiro",
    estado_civil: q0.estado_civil ?? "",
    profissao: q0.profissao ?? "",
  });
  const [empregs, setEmpregs] = useState<Empreg[]>(
    Array.isArray(caso.empregadores)
      ? caso.empregadores.map((em: any) => ({
          id: crypto.randomUUID(),
          razao_social: em?.razao_social ?? "",
          cnpj: em?.cnpj ?? "",
        }))
      : [],
  );
  const [saving, setSaving] = useState(false);
  const contrachequesExtraidos = caso.contracheques_extraidos ?? [];

  const addEmp = () => setEmpregs((p) => [...p, { id: crypto.randomUUID(), razao_social: "", cnpj: "" }]);
  const updEmp = (id: string, patch: Partial<Empreg>) =>
    setEmpregs((p) => p.map((em) => (em.id === id ? { ...em, ...patch } : em)));
  const removeEmp = (id: string) => setEmpregs((p) => p.filter((em) => em.id !== id));

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
        qualificacao: qual,
        empregadores: empregs.map((em) => ({ razao_social: em.razao_social, cnpj: em.cnpj })),
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
        <p className="text-sm text-muted-foreground">Revise os dados extraídos dos documentos e ajuste o que for necessário.</p>
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
        <h2 className="font-semibold">Qualificação</h2>
        <p className="text-xs text-muted-foreground">Estado civil e profissão não vêm dos documentos — preencha manualmente.</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2"><Label>Nacionalidade</Label><Input value={qual.nacionalidade} onChange={(e) => setQual({ ...qual, nacionalidade: e.target.value })} /></div>
          <div className="space-y-2"><Label>Estado civil</Label><Input value={qual.estado_civil} onChange={(e) => setQual({ ...qual, estado_civil: e.target.value })} placeholder="ex: solteiro(a)" /></div>
          <div className="space-y-2"><Label>Profissão</Label><Input value={qual.profissao} onChange={(e) => setQual({ ...qual, profissao: e.target.value })} placeholder="ex: industriário" /></div>
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
          <h2 className="font-semibold">Empregador(es)</h2>
          <Button variant="outline" size="sm" onClick={addEmp}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
        </div>
        {empregs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum empregador. Adicione a(s) reclamada(s).</p>}
        <div className="space-y-3">
          {empregs.map((em) => (
            <div key={em.id} className="grid grid-cols-1 gap-3 rounded border bg-muted/30 p-3 md:grid-cols-12">
              <div className="space-y-1 md:col-span-7"><Label className="text-xs">Razão social</Label><Input value={em.razao_social} onChange={(e) => updEmp(em.id, { razao_social: e.target.value })} /></div>
              <div className="space-y-1 md:col-span-4"><Label className="text-xs">CNPJ</Label><Input value={em.cnpj} onChange={(e) => updEmp(em.id, { cnpj: e.target.value })} /></div>
              <div className="flex items-end md:col-span-1"><Button variant="ghost" size="icon" onClick={() => removeEmp(em.id)}><Trash2 className="h-4 w-4" /></Button></div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-6">
        <h2 className="font-semibold">Contracheques extraídos</h2>
        <ContrachequesExtraidos contracheques={contrachequesExtraidos} />
      </section>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onCancel}><X className="mr-2 h-4 w-4" />Cancelar Caso</Button>
        <Button onClick={confirmar} disabled={saving}><Check className="mr-2 h-4 w-4" />{saving ? "Salvando…" : "Confirmar e Avançar"}</Button>
      </div>
    </div>
  );
}
