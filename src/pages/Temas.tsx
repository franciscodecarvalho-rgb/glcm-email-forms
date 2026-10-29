import { useCallback, useEffect, useRef, useState } from "react";
import { Database, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
import { formatarMoeda } from "@/lib/relatorios";
import {
  buscarRubricasDataLake,
  deduplicarTermos,
  excluirTemaMotor,
  normalizarTermo,
  salvarTemaMotor,
  type RubricaDataLake,
} from "@/lib/temas";

type Termo = { id: string; termo: string };
type Tema = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
  tema_termos: Termo[];
};

export const RUBRICAS_POR_PAGINA = 50;

const TIPO_LABEL: Record<string, string> = {
  provento: "Provento",
  desconto: "Desconto",
  informativo: "Informativo",
};

export default function Temas() {
  const [temas, setTemas] = useState<Tema[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const [editorAberto, setEditorAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Tema | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [termos, setTermos] = useState<string[]>([]);
  const [novoTermo, setNovoTermo] = useState("");

  const [temaParaExcluir, setTemaParaExcluir] = useState<Tema | null>(null);

  const [temaRubricas, setTemaRubricas] = useState<Tema | null>(null);
  const [rubricas, setRubricas] = useState<RubricaDataLake[]>([]);
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
      await salvarTemaMotor({
        nome: nomeLimpo,
        termos: listaTermos,
        descricao: descricao.trim() || null,
        ativo,
        temaId: emEdicao?.id ?? null,
      });

      toast.success(emEdicao ? "Tema atualizado com sucesso" : "Tema criado com sucesso");
      setEditorAberto(false);
      await carregar();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar o tema";
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!temaParaExcluir) return;
    setExcluindo(true);
    try {
      await excluirTemaMotor(temaParaExcluir.id);
      toast.success(`Tema "${temaParaExcluir.nome}" excluído`);
      setTemaParaExcluir(null);
      await carregar();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao excluir o tema";
      toast.error(msg);
    } finally {
      setExcluindo(false);
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

  // Busca rubricas correspondentes diretamente no DataLake 2.0 (241.678 rubricas)
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

    try {
      const { dados, total } = await buscarRubricasDataLake(
        termosTema,
        RUBRICAS_POR_PAGINA,
        pagina * RUBRICAS_POR_PAGINA,
      );
      if (requisicao !== requisicaoRubricas.current) return;
      setBuscandoRubricas(false);
      setRubricas(dados);
      setRubricasTotal(total);
    } catch (e: unknown) {
      if (requisicao !== requisicaoRubricas.current) return;
      setBuscandoRubricas(false);
      setRubricas([]);
      setRubricasTotal(0);
      setErroRubricas(e instanceof Error ? e.message : "Não foi possível consultar as rubricas no DataLake 2.0.");
    }
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
            <h1 className="text-2xl font-bold tracking-tight">Temas Jurídicos</h1>
            <p className="text-sm text-muted-foreground">
              Cada tema reúne rubricas pelos termos que você cadastra. Uma rubrica entra no tema
              quando a descrição contém qualquer um dos termos, sem diferenciar maiúsculas de
              minúsculas nem espaços repetidos. Os temas cadastrados ficam disponíveis para filtragem analítica no DataLake 2.0.
            </p>
          </div>
          <Button onClick={abrirNovo}>
            <Plus className="mr-2 h-4 w-4" />Novo tema
          </Button>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tema</TableHead>
                <TableHead>Termos de inclusão</TableHead>
                <TableHead className="w-[120px]">Situação</TableHead>
                <TableHead className="w-[280px] text-right">Ações</TableHead>
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
                          onCheckedChange={(v) => alternarAtivo(tema, v)}
                          aria-label={`Ativar ou inativar ${tema.nome}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {tema.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => verRubricas(tema)} title="Ver rubricas correspondentes no DataLake 2.0">
                        <Search className="mr-1 h-4 w-4" />Rubricas
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicao(tema)} title="Editar tema">
                        <Tag className="mr-1 h-4 w-4" />Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTemaParaExcluir(tema)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Excluir tema"
                      >
                        <Trash2 className="mr-1 h-4 w-4" />Excluir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
      <Dialog open={editorAberto} onOpenChange={setEditorAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{emEdicao ? "Editar tema" : "Novo tema"}</DialogTitle>
            <DialogDescription>
              Cadastre os termos que devem aparecer na descrição da rubrica. Vários termos são
              aceitos: basta que a descrição contenha um deles para ser capturada no DataLake 2.0.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tema-nome">Nome do Tema</Label>
              <Input
                id="tema-nome"
                placeholder="Ex.: Adicional de Periculosidade"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tema-descricao">Descrição (opcional)</Label>
              <Textarea
                id="tema-descricao"
                placeholder="Explicação da tese jurídica ou notas de enquadramento..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="tema-ativo" checked={ativo} onCheckedChange={setAtivo} />
              <Label htmlFor="tema-ativo">Tema ativo (disponível para filtros)</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tema-termo">Termos de inclusão (palavras-chave)</Label>
              <div className="flex gap-2">
                <Input
                  id="tema-termo"
                  value={novoTermo}
                  placeholder="Ex.: periculosidade"
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
              <p className="text-[11px] text-muted-foreground">
                Dica: Digite o termo e pressione Enter ou clique em Adicionar.
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {termos.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Nenhum termo adicionado. Informe ao menos um.</span>
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
              {salvando ? "Salvando…" : emEdicao ? "Atualizar Tema" : "Salvar Tema"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      <Dialog open={!!temaParaExcluir} onOpenChange={(o) => !o && setTemaParaExcluir(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Confirmar exclusão de tema</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o tema <strong>"{temaParaExcluir?.nome}"</strong> e todos os seus termos associados? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setTemaParaExcluir(null)} disabled={excluindo}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarExclusao} disabled={excluindo}>
              {excluindo ? "Excluindo…" : "Excluir Definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE PRÉ-VISUALIZAÇÃO DE RUBRICAS NO DATALAKE 2.0 */}
      <Dialog open={!!temaRubricas} onOpenChange={(o) => !o && setTemaRubricas(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <span>Rubricas correspondentes — {temaRubricas?.nome}</span>
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 flex items-center gap-1">
                    <Database className="h-3 w-3" /> DataLake 2.0
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Rubricas localizadas na base histórica do DataLake 2.0 cuja descrição contém algum termo do tema.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {buscandoRubricas ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <div className="animate-spin inline-block h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
              <p>Consultando DataLake 2.0 (2,15M registros)...</p>
            </div>
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
            <div className="py-10 text-center text-muted-foreground space-y-2">
              <p>Nenhuma rubrica correspondente no DataLake 2.0 para os termos cadastrados.</p>
              <p className="text-xs">Verifique os termos de inclusão cadastrados no tema.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[110px]">Tipo</TableHead>
                      <TableHead className="w-[180px]">Empresa / Modelo</TableHead>
                      <TableHead className="w-[100px] text-right">Lançamentos</TableHead>
                      <TableHead className="w-[120px] text-right">Proventos</TableHead>
                      <TableHead className="w-[120px] text-right">Descontos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rubricas.map((r, i) => (
                      <TableRow key={`${r.codigo ?? ""}-${r.descricao ?? ""}-${r.tipo ?? ""}-${r.empresa ?? ""}-${i}`}>
                        <TableCell className="font-mono text-xs">{r.codigo || "—"}</TableCell>
                        <TableCell className="font-medium text-xs">{r.descricao || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.tipo ? (
                            <Badge variant={r.tipo === "provento" ? "default" : r.tipo === "desconto" ? "secondary" : "outline"} className="text-[10px]">
                              {TIPO_LABEL[r.tipo] ?? r.tipo}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]" title={r.empresa || ""}>
                          {r.empresa || "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {Number(r.itens ?? r.ocorrencias ?? 0).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono text-emerald-700">
                          {r.proventos != null ? formatarMoeda(r.proventos) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono text-rose-700">
                          {r.descontos != null ? formatarMoeda(r.descontos) : "—"}
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
                  } de ${rubricasTotal} rubricas distintas encontradas`}
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
