import type { ContrachequeRelacional } from "@/lib/contracheques-relacionais";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ContrachequesExtraidos({ contracheques }: { contracheques: ContrachequeRelacional[] }) {
  if (contracheques.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum contracheque foi inserido no banco.</p>;
  }

  return (
    <div className="space-y-4">
      {contracheques.map((contracheque, index) => (
        <div key={contracheque.id} className="overflow-hidden rounded border">
          <div className="space-y-1 bg-muted/30 p-3 text-sm">
            <p className="font-medium">
              {contracheque.arquivo_origem || `Contracheque ${index + 1}`}
              {contracheque.competencia ? ` — ${contracheque.competencia}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Proventos: {moeda.format(Number(contracheque.total_proventos) || 0)} · Descontos: {moeda.format(Number(contracheque.total_descontos) || 0)} · Líquido: {moeda.format(Number(contracheque.liquido) || 0)}
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Família HRA</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(contracheque.itens_contracheque ?? []).map((item) => (
                  <TableRow key={item.id ?? `${contracheque.id}-${item.codigo}-${item.descricao}`}>
                    <TableCell>{item.codigo || "—"}</TableCell>
                    <TableCell>{item.descricao || "—"}</TableCell>
                    <TableCell>{item.referencia ?? "—"}</TableCell>
                    <TableCell>{item.tipo || "—"}</TableCell>
                    <TableCell>{item.familia_hra || "—"}</TableCell>
                    <TableCell className="text-right">{moeda.format(Number(item.valor) || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {(contracheque.itens_contracheque ?? []).length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Nenhuma rubrica foi inserida para este contracheque.</p>
          )}
        </div>
      ))}
    </div>
  );
}
