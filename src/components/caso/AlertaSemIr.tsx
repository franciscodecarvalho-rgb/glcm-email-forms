import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { RubricasSemIr } from "@/lib/alertas-rubricas";

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Sinaliza rubricas HRA/AHRA marcadas "Sem IR/IRRF" encontradas nos contracheques. */
export function AlertaSemIr({ dados }: { dados: RubricasSemIr }) {
  if (dados.linhas.length === 0) return null;

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Rubricas HRA/AHRA "Sem IR/IRRF" nos contracheques</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc pl-5">
          {dados.linhas.map((linha, i) => (
            <li key={i}>
              <span className="font-medium">{linha.codigo ?? "—"}</span>
              {linha.descricao ? ` — ${linha.descricao}` : ""}
              {linha.competencia ? ` (${linha.competencia})` : ""}
              <div className="ml-4 text-sm">Valor: {fmt(linha.valor)}</div>
            </li>
          ))}
        </ul>
        <div className="mt-2 text-sm font-medium">Total: {fmt(dados.total)}</div>
      </AlertDescription>
    </Alert>
  );
}
