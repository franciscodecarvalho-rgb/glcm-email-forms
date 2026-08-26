import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { RubricaAlertada } from "@/lib/alertas-rubricas";

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Sinaliza rubricas monitoradas e a família Petrobras de Contribuição Extraordinária. */
export function AlertaRubricas({ alertas }: { alertas: RubricaAlertada[] }) {
  if (alertas.length === 0) return null;

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Rubricas sinalizadas nos contracheques</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc pl-5">
          {alertas.map((alerta) => (
            <li key={alerta.codigo}>
              <span className="font-medium">{alerta.codigo}</span>
              {alerta.descricao ? ` — ${alerta.descricao}` : ""}
              <div className="ml-4 text-sm">
                <div>Quantidade Total: {alerta.quantidadeTotal}</div>
                <div>Valor Total R$: {fmt(alerta.valorTotal)}</div>
              </div>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
