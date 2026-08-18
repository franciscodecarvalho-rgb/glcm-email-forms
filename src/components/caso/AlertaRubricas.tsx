import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { RubricaAlertada } from "@/lib/alertas-rubricas";

/** Sinaliza rubricas monitoradas (1059, 1513, 6050) encontradas nos contracheques. */
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
              {alerta.competencias.length > 0 && (
                <span className="text-sm"> (competências: {alerta.competencias.join(", ")})</span>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
