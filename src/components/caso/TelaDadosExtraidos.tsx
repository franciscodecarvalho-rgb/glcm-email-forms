import { useState } from "react";
import { Check, X } from "lucide-react";
import type { CasoData } from "@/pages/Caso";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ContrachequesExtraidos } from "@/components/caso/ContrachequesExtraidos";
import { toast } from "sonner";
import { formatarCpf } from "@/lib/cpf";

export function TelaDadosExtraidos({ caso, onCancel }: { caso: CasoData; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const endereco = caso.endereco ?? {};
  const qualificacao = caso.qualificacao ?? {};
  const enderecoCompleto = [
    endereco.logradouro,
    endereco.numero,
    endereco.bairro,
    endereco.cidade,
    endereco.estado,
    endereco.cep,
  ].filter(Boolean).join(", ");

  const avancar = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("casos")
      .update({
        contracheques: caso.contracheques,
        status: "aguardando_pasta",
      })
      .eq("id", caso.id);
    setSaving(false);
    if (error) toast.error("Erro ao avançar");
    else toast.success("Dados extraídos confirmados");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dados extraídos dos PDFs</h1>
        <p className="text-sm text-muted-foreground">Informações processadas e inseridas no banco de dados.</p>
      </div>

      <section className="space-y-4 rounded-lg border bg-card p-6">
        <h2 className="font-semibold">Dados pessoais extraídos</h2>
        <dl className="grid gap-4 text-sm md:grid-cols-2">
          <div className="md:col-span-2"><dt className="text-muted-foreground">Nome completo</dt><dd className="font-medium">{caso.nome_cliente}</dd></div>
          <div><dt className="text-muted-foreground">CPF</dt><dd className="font-medium">{formatarCpf(caso.cpf)}</dd></div>
          <div><dt className="text-muted-foreground">RG</dt><dd className="font-medium">{caso.rg}</dd></div>
          {qualificacao.nacionalidade && <div><dt className="text-muted-foreground">Nacionalidade</dt><dd className="font-medium">{qualificacao.nacionalidade}</dd></div>}
          {enderecoCompleto && <div className="md:col-span-2"><dt className="text-muted-foreground">Endereço</dt><dd className="font-medium">{enderecoCompleto}</dd></div>}
        </dl>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-6">
        <h2 className="font-semibold">Contracheques extraídos</h2>
        <ContrachequesExtraidos contracheques={caso.contracheques_extraidos ?? []} />
      </section>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onCancel}><X className="mr-2 h-4 w-4" />Cancelar Caso</Button>
        <Button onClick={avancar} disabled={saving}><Check className="mr-2 h-4 w-4" />{saving ? "Avançando…" : "Confirmar e Avançar"}</Button>
      </div>
    </div>
  );
}
