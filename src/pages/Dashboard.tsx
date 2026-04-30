import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, FolderOpen, X, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CasoStatus, STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Caso = {
  id: string;
  created_at: string;
  status: string;
  origem: string;
  nome_cliente: string | null;
};

export default function Dashboard() {
  const [casos, setCasos] = useState<Caso[]>([]);
  const [filter, setFilter] = useState<"all" | CasoStatus>("all");
  const nav = useNavigate();

  useEffect(() => {
    let ignore = false;
    supabase
      .from("casos")
      .select("id, created_at, status, origem, nome_cliente")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error("Erro ao carregar casos");
        if (!ignore && data) setCasos(data as Caso[]);
      });

    const ch = supabase
      .channel("casos-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "casos" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const novo = payload.new as Caso;
          setCasos((prev) => [novo, ...prev.filter((c) => c.id !== novo.id)]);
          if (novo.origem === "n8n") {
            toast.message("Novo caso recebido por email", {
              description: "Deseja abrir agora?",
              action: { label: "Abrir", onClick: () => nav(`/casos/${novo.id}`) },
            });
          }
        } else if (payload.eventType === "UPDATE") {
          const upd = payload.new as Caso;
          setCasos((prev) => prev.map((c) => (c.id === upd.id ? { ...c, ...upd } : c)));
        } else if (payload.eventType === "DELETE") {
          setCasos((prev) => prev.filter((c) => c.id !== (payload.old as any).id));
        }
      })
      .subscribe();

    return () => { ignore = true; supabase.removeChannel(ch); };
  }, [nav]);

  const cancelar = async (id: string) => {
    const { error } = await supabase.from("casos").update({ status: "cancelado" }).eq("id", id);
    if (error) toast.error("Falha ao cancelar"); else toast.success("Caso cancelado");
  };

  const filtered = filter === "all" ? casos : casos.filter((c) => c.status === filter);

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <main className="container py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Casos</h1>
            <p className="text-sm text-muted-foreground">Gerencie todos os processos abertos no escritório.</p>
          </div>
          <Button asChild>
            <Link to="/casos/novo"><Plus className="mr-2 h-4 w-4" />Novo Caso</Link>
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} caso(s)</span>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">ID</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhum caso encontrado.</TableCell></TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => nav(`/casos/${c.id}`)}>
                  <TableCell className="font-mono text-xs">{c.id.slice(0, 8)}</TableCell>
                  <TableCell>{format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                  <TableCell>{c.nome_cliente ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><span className="text-xs uppercase tracking-wide text-muted-foreground">{c.origem}</span></TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => nav(`/casos/${c.id}`)}>
                      <FolderOpen className="mr-1 h-4 w-4" />Abrir
                    </Button>
                    {c.status !== "cancelado" && c.status !== "concluido" && (
                      <Button variant="ghost" size="sm" onClick={() => cancelar(c.id)}>
                        <X className="mr-1 h-4 w-4" />Cancelar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
