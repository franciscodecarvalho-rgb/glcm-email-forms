import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, Tag, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { deduplicarTermos, normalizarTermo } from "@/lib/temas";

type Termo = { id: string; termo: string };
type Tema = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
  tema_termos: Termo[];
};

type Rubrica = {
  codigo: string | null;
  descricao: string | null;
  tipo: string | null;
  empresa: string | null;
  ocorrencias: number | null;
  total_linhas: number | null;
};

export const RUBRICAS_POR_PAGINA = 50;

const TIPO_LABEL: Record<string, string> = {
  provento: "Provento",
  desconto: "Desconto",
  informativo: "Informativo",
};

export default function Temas() {
  
  const { isAdmin } = useIsAdmin();
  const [temas, setTemas] = useState<Tema[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [editorAberto, setEditorAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Tema | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [termos, setTermos] = useState<string[]>([]);
  const [novoTermo, setNovoTermo] = useState("");

  const [temaRubricas, setTemaRubricas] = useState<Tema | null>(null);
  const [rubricas, setRubricas] = useState<Rubrica[]>([]);
  const [rubricasTotal, setRubricasTotal] = useState(0);
  const [rubricasPagina, setRubricasPagina] = useState(0);
  const [buscandoRubricas, setBuscandoRubricas] = useState(false);
  const [erroRubricas, setErroRubricas] = useState<string | null>(null);
  const requisicaoRubricas = useRef(0);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("temas")
      .select("id, nome, descricao, ativo, created_at, tema_termos(id, termo)")
      .order("nome", { ascending: true });
    setCarregando(false);
    if (error) {
      toast.error("Erro ao carregar temas");
      return;
    }
    setTemas((data ?? []) as Tema[]);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrirNovo = () => {
    setEmEdicao(null);
    setNome("");
    setDescricao("");
    setAtivo(true);
    setTermos([]);
    setNovoTermo("");
    setEditorAberto(true);
  };

  const abrirEdicao = (tema: Tema) => {
    setEmEdicao(tema);
    setNome(tema.nome);
    setDescricao(tema.descricao ?? "");
    setAtivo(tema.ativo);
    setTermos(tema.tema_termos.map((t) => t.termo));
    setNovoTermo("");
    setEditorAberto(true);
  };

  const adicionarTermo = () => {
    const valor = novoTermo.replace(/\s+/g, " ").trim();
    if (!valor) return;
    if (termos.some((t) => normalizarTermo(t) === normalizarTermo(valor))) {
      toast.error("Este termo já está na lista");
      return;
    }
    setTermos((prev) => [...prev, valor]);
    setNovoTermo("");
  };

  const salvar = async () => {
    const nomeLimpo = nome.replace(/\s+/g, " ").trim();
    if (!nomeLimpo) return toast.error("Informe o nome do tema");
    const listaTermos = deduplicarTermos(termos);
    if (listaTermos.length === 0) return toast.error("Informe ao menos um termo de inclusão");

    setSalvando(true);
    try {
      // Gravação atômica no servidor: tema + termos em uma única transação.
      const { error } = await supabase.rpc("salvar_tema", {
        p_nome: nomeLimpo,
        p_termos: listaTermos,
        p_descricao: descricao.trim() || null,
        p_ativo: ativo,
        p_tema_id: emEdicao?.id ?? null,
      });
      if (error) throw error;

      toast.success(emEdicao ? "Tema atualizado" : "Tema criado");
      setEditorAberto(false);
      await carregar();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar o tema";
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (tema: Tema, valor: boolean) => {
    const { error } = await supabase.from("temas").update({ ativo: valor }).eq("id", tema.id);
    if (error) {
      toast.error("Não foi possível alterar a situação do tema");
      return;
    }
    setTemas((prev) => prev.map((t) => (t.id === tema.id ? { ...t, ativo: valor } : t)));
    toast.success(valor ? "Tema ativado" : "Tema inativado");
  };

  // Busca no servidor: comparação normalizada e literal, sem repetições,
  // com paginação estável. Respostas antigas são descartadas.
  const buscarRubricas = useCallback(async (tema: Tema, pagina: number) => {
    const requisicao = ++requisicaoRubricas.current;
    setBuscandoRubricas(true);
    setErroRubricas(null);
    const termosTema = deduplicarTermos(tema.tema_termos.map((t) => t.termo));
    if (termosTema.length === 0) {
      if (requisicao !== requisicaoRubricas.current) return;
      setRubricas([]);
      setRubricasTotal(0);
      setBuscandoRubricas(false);
      return;
    }
    const { data, error } = await supabase.rpc("temas_rubricas_correspondentes", {
      p_termos: termosTema,
      p_limit: RUBRICAS_POR_PAGINA,
      p_offset: pagina * RUBRICAS_POR_PAGINA,
    });
    if (requisicao !== requisicaoRubricas.current) return;
    setBuscandoRubricas(false);
    if (error) {
      setRubricas([]);
      setRubricasTotal(0);
      setErroRubricas("Não foi possível consultar as rubricas correspondentes.");
      return;
    }
    const linhas = (data ?? []) as Rubrica[];
    setRubricas(linhas);
    setRubricasTotal(Number(linhas[0]?.total_linhas ?? 0));
  }, []);

  const verRubricas = (tema: Tema) => {
    setTemaRubricas(tema);
    setRubricas([]);
    setRubricasTotal(0);
    setRubricasPagina(0);
    void buscarRubricas(tema, 0);
  };

  const irParaPagina = (pagina: number) => {
    if (!temaRubricas) return;
    setRubricasPagina(pagina);
    void buscarRubricas(temaRubricas, pagina);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <main className="container py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Temas</h1>
            <p className="text-sm text-muted-foreground">
              Cada tema reúne rubricas pelos termos que você cadastra. Uma rubrica entra no tema
              quando a descrição contém qualquer um dos termos, sem diferenciar maiúsculas de
              minúsculas nem espaços repetidos.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={abrirNovo}>
              <Plus className="mr-2 h-4 w-4" />Novo tema
            </Button>
          )}
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tema</TableHead>
                <TableHead>Termos de inclusão</TableHead>
                <TableHead className="w-[120px]">Situação</TableHead>
                <TableHead className="w-[220px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregando ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Carregando…</TableCell>
                </TableRow>
              ) : temas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum tema cadastrado.</TableCell>
                </TableRow>
              ) : (
                temas.map((tema) => (
                  <TableRow key={tema.id}>
                    <TableCell>
                      <div className="font-medium">{tema.nome}</div>
                      {tema.descricao && (
                        <div className="mt-1 text-xs text-muted-foreground">{tema.descricao}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {tema.tema_termos.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          tema.tema_termos.map((t) => (
                            <Badge key={t.id} variant="secondary">{t.termo}</Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={tema.ativo}
                          disabled={!isAdmin}
                          onCheckedChange={(v) => alternarAtivo(tema, v)}
                          aria-label={`Ativar ou inativar ${tema.nome}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {tema.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => verRubricas(tema)}>
                        <Search className="mr-1 h-4 w-4" />Rubricas
                      </Button>
                      {isAdmin && (
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicao(tema)}>
                          <Tag className="mr-1 h-4 w-4" />Editar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <Dialog open={editorAberto} onOpenChange={setEditorAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{emEdicao ? "Editar tema" : "Novo tema"}</DialogTitle>
            <DialogDescription>
              Cadastre os termos que devem aparecer na descrição da rubrica. Vários termos são
              aceitos: basta que a descrição contenha um deles.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tema-nome">Nome</Label>
              <Input id="tema-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tema-descricao">Descrição (opcional)</Label>
              <Textarea
                id="tema-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="tema-ativo" checked={ativo} onCheckedChange={setAtivo} />
              <Label htmlFor="tema-ativo">Tema ativo</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tema-termo">Termos de inclusão</Label>
              <div className="flex gap-2">
                <Input
                  id="tema-termo"
                  value={novoTermo}
                  placeholder="Ex.: banco de horas"
                  onChange={(e) => setNovoTermo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      adicionarTermo();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={adicionarTermo}>Adicionar</Button>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {termos.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Nenhum termo adicionado.</span>
                ) : (
                  termos.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      {t}
                      <button
                        type="button"
                        aria-label={`Remover termo ${t}`}
                        onClick={() => setTermos((prev) => prev.filter((x) => x !== t))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!temaRubricas} onOpenChange={(o) => !o && setTemaRubricas(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Rubricas correspondentes — {temaRubricas?.nome}</DialogTitle>
            <DialogDescription>
              Rubricas registradas nos contracheques do sistema cuja descrição contém algum termo
              do tema.
            </DialogDescription>
          </DialogHeader>
          {buscandoRubricas ? (
            <p className="py-8 text-center text-muted-foreground">Buscando…</p>
          ) : erroRubricas ? (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{erroRubricas}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => temaRubricas && buscarRubricas(temaRubricas, rubricasPagina)}
              >
                Tentar novamente
              </Button>
            </div>
          ) : rubricas.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Nenhuma rubrica correspondente.</p>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[120px]">Tipo</TableHead>
                      <TableHead className="w-[160px]">Empresa/modelo</TableHead>
                      <TableHead className="w-[110px] text-right">Lançamentos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rubricas.map((r, i) => (
                      <TableRow key={`${r.codigo ?? ""}-${r.descricao ?? ""}-${r.tipo ?? ""}-${r.empresa ?? ""}-${i}`}>
                        <TableCell className="font-mono text-xs">{r.codigo || "—"}</TableCell>
                        <TableCell>{r.descricao || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {r.tipo ? TIPO_LABEL[r.tipo] ?? r.tipo : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.empresa || "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {Number(r.ocorrencias ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {`Mostrando ${rubricasPagina * RUBRICAS_POR_PAGINA + 1}–${
                    rubricasPagina * RUBRICAS_POR_PAGINA + rubricas.length
                  } de ${rubricasTotal} rubricas distintas`}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={rubricasPagina === 0}
                    onClick={() => irParaPagina(rubricasPagina - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(rubricasPagina + 1) * RUBRICAS_POR_PAGINA >= rubricasTotal}
                    onClick={() => irParaPagina(rubricasPagina + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
