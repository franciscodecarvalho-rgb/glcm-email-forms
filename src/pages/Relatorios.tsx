import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Filter, Loader2, RotateCcw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  chaveRubrica,
  consolidarTotais,
  competenciaValida,
  FILTROS_INICIAIS,
  formatarMoeda,
  montarRubricasPayload,
  montarTemasPayload,
  normalizarCompetenciaFiltro,
  periodoCoerente,
  rotuloEmpresaModelo,
  rotuloIdentificacao,
  rotuloPessoa,
  rotuloRubrica,
  ROTULO_ORIGEM,
  TOTAIS_ZERADOS,
  type EscopoOrigem,
  type EstadoFonte,
  type FiltrosRelatorio,
  type OrigemRelatorio,
  type RubricaSelecionada,
  type TemaComTermos,
  type TotaisFonte,
} from "@/lib/relatorios";

type Visao = "tema" | "pessoa" | "empresa" | "rubrica";

type Linha = Record<string, unknown> & { origem?: OrigemRelatorio };

type Fonte<T> = { estado: EstadoFonte; motivo?: string; dados: T[] };

const PAGINA = 25;

const rpc = supabase as unknown as {
  rpc: (
    nome: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const txt = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));

async function consultarCasos<T>(nome: string, params: Record<string, unknown>): Promise<Fonte<T>> {
  const { data, error } = await rpc.rpc(nome, params);
  if (error) return { estado: "erro", motivo: error.message, dados: [] };
  return { estado: "ok", dados: (data ?? []) as T[] };
}

async function consultarHistorico<T>(acao: string, body: Record<string, unknown>): Promise<Fonte<T>> {
  const { data, error } = await supabase.functions.invoke("relatorios-historico", {
    body: { acao, ...body },
  });
  if (error) return { estado: "erro", motivo: error.message, dados: [] };
  const r = data as { disponivel?: boolean; motivo?: string; dados?: T[] };
  if (!r?.disponivel) return { estado: "indisponivel", motivo: r?.motivo, dados: [] };
  return { estado: "ok", dados: r.dados ?? [] };
}

export default function Relatorios() {
  const [temas, setTemas] = useState<TemaComTermos[]>([]);
  const [rascunho, setRascunho] = useState<FiltrosRelatorio>({ ...FILTROS_INICIAIS });
  const [filtros, setFiltros] = useState<FiltrosRelatorio>({ ...FILTROS_INICIAIS });
  const [codigoTexto, setCodigoTexto] = useState("");
  const [empresaTexto, setEmpresaTexto] = useState("");
  const [visao, setVisao] = useState<Visao>("tema");
  const [pagina, setPagina] = useState(0);
  const [carregando, setCarregando] = useState(false);

  const [totais, setTotais] = useState<Record<OrigemRelatorio, Fonte<Record<string, unknown>>>>({
    casos: { estado: "ok", dados: [] },
    historico: { estado: "ok", dados: [] },
  });
  const [linhas, setLinhas] = useState<Record<OrigemRelatorio, Fonte<Linha>>>({
    casos: { estado: "ok", dados: [] },
    historico: { estado: "ok", dados: [] },
  });

  const [pessoaAberta, setPessoaAberta] = useState<{ id: string; nome: string; origem: OrigemRelatorio } | null>(null);
  const [lancamentos, setLancamentos] = useState<Linha[]>([]);
  const [carregandoLancamentos, setCarregandoLancamentos] = useState(false);

  useEffect(() => {
    supabase
      .from("temas")
      .select("nome, ativo, tema_termos(termo)")
      .eq("ativo", true)
      .order("nome")
      .then(({ data, error }) => {
        if (error) {
          toast.error("Não foi possível carregar os temas");
          return;
        }
        setTemas(
          (data ?? []).map((t) => ({
            nome: t.nome as string,
            termos: ((t.tema_termos ?? []) as { termo: string }[]).map((x) => x.termo),
          })),
        );
      });
  }, []);

  const payload = useMemo(() => {
    const temasPayload = montarTemasPayload(temas, filtros.temas);
    return {
      p_temas: temasPayload,
      p_rubricas: montarRubricasPayload(filtros.rubricas),
      p_empresas: filtros.empresas.length > 0 ? filtros.empresas : null,
      p_de: filtros.de,
      p_ate: filtros.ate,
    };
  }, [temas, filtros]);

  const corpoHistorico = useMemo(
    () => ({
      temas: payload.p_temas,
      rubricas: payload.p_rubricas,
      empresas: payload.p_empresas,
      de: payload.p_de,
      ate: payload.p_ate,
    }),
    [payload],
  );

  const usaCasos = filtros.origem !== "historico";
  const usaHistorico = filtros.origem !== "casos";

  const carregar = useCallback(async () => {
    if (temas.length === 0) return;
    setCarregando(true);

    const vazio: Fonte<never> = { estado: "ok", dados: [] };
    const rpcVisao =
      visao === "tema"
        ? "relatorio_totais_tema"
        : visao === "pessoa"
          ? "relatorio_por_pessoa"
          : visao === "empresa"
            ? "relatorio_por_empresa"
            : "relatorio_rubricas";
    const acaoVisao =
      visao === "tema" ? "totais_tema" : visao === "pessoa" ? "por_pessoa" : visao === "empresa" ? "por_empresa" : "rubricas";
    const paginacao = visao === "tema" ? {} : { p_limit: PAGINA, p_offset: pagina * PAGINA };
    const paginacaoHist = visao === "tema" ? {} : { limit: PAGINA, offset: pagina * PAGINA };

    const [tc, th, lc, lh] = await Promise.all([
      usaCasos ? consultarCasos<Record<string, unknown>>("relatorio_total_geral", payload) : Promise.resolve(vazio),
      usaHistorico ? consultarHistorico<Record<string, unknown>>("total_geral", corpoHistorico) : Promise.resolve(vazio),
      usaCasos ? consultarCasos<Linha>(rpcVisao, { ...payload, ...paginacao }) : Promise.resolve(vazio),
      usaHistorico ? consultarHistorico<Linha>(acaoVisao, { ...corpoHistorico, ...paginacaoHist }) : Promise.resolve(vazio),
    ]);

    setTotais({ casos: tc, historico: th });
    setLinhas({ casos: lc, historico: lh });
    setCarregando(false);
  }, [temas, payload, corpoHistorico, visao, pagina, usaCasos, usaHistorico]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const subtotais = useMemo(() => {
    const extrair = (f: Fonte<Record<string, unknown>>): TotaisFonte => {
      const r = f.dados[0];
      if (!r) return { ...TOTAIS_ZERADOS };
      return {
        itens: num(r.itens),
        pessoas: num(r.pessoas),
        empresas: num(r.empresas),
        proventos: num(r.proventos),
        descontos: num(r.descontos),
      };
    };
    const lista: { origem: OrigemRelatorio; estado: EstadoFonte; totais: TotaisFonte }[] = [];
    if (usaCasos) lista.push({ origem: "casos", estado: totais.casos.estado, totais: extrair(totais.casos) });
    if (usaHistorico) lista.push({ origem: "historico", estado: totais.historico.estado, totais: extrair(totais.historico) });
    return consolidarTotais(lista);
  }, [totais, usaCasos, usaHistorico]);

  const linhasVisiveis = useMemo(() => {
    const saida: (Linha & { origem: OrigemRelatorio })[] = [];
    if (usaCasos && linhas.casos.estado === "ok") saida.push(...linhas.casos.dados.map((d) => ({ ...d, origem: "casos" as const })));
    if (usaHistorico && linhas.historico.estado === "ok")
      saida.push(...linhas.historico.dados.map((d) => ({ ...d, origem: "historico" as const })));
    return saida;
  }, [linhas, usaCasos, usaHistorico]);

  const avisos = useMemo(() => {
    const lista: string[] = [];
    const checar = (origem: OrigemRelatorio, f: Fonte<unknown>) => {
      if (f.estado === "indisponivel")
        lista.push(`${ROTULO_ORIGEM[origem]}: consulta não realizada. ${f.motivo ?? ""}`.trim());
      if (f.estado === "erro") lista.push(`${ROTULO_ORIGEM[origem]}: falha na consulta. ${f.motivo ?? ""}`.trim());
    };
    if (usaCasos) {
      checar("casos", totais.casos);
      checar("casos", linhas.casos);
    }
    if (usaHistorico) {
      checar("historico", totais.historico);
      checar("historico", linhas.historico);
    }
    return Array.from(new Set(lista));
  }, [totais, linhas, usaCasos, usaHistorico]);

  const aplicar = () => {
    const de = normalizarCompetenciaFiltro(rascunho.de);
    const ate = normalizarCompetenciaFiltro(rascunho.ate);
    if (rascunho.de && !competenciaValida(rascunho.de)) return toast.error("Período inicial deve estar no formato MM/AAAA");
    if (rascunho.ate && !competenciaValida(rascunho.ate)) return toast.error("Período final deve estar no formato MM/AAAA");
    if (!periodoCoerente(de, ate)) return toast.error("O período inicial não pode ser posterior ao final");
    const empresas = empresaTexto.split(",").map((x) => x.trim()).filter(Boolean);
    setPagina(0);
    setFiltros({ ...rascunho, de, ate, empresas });
  };

  const limpar = () => {
    setRascunho({ ...FILTROS_INICIAIS });
    setEmpresaTexto("");
    setPagina(0);
    setFiltros({ ...FILTROS_INICIAIS });
  };

  /** Seleção de rubrica sempre pela combinação exata exibida na visão "Por rubrica". */
  const alternarRubrica = (r: RubricaSelecionada) => {
    const k = chaveRubrica(r);
    setRascunho((p) => ({
      ...p,
      rubricas: p.rubricas.some((x) => chaveRubrica(x) === k)
        ? p.rubricas.filter((x) => chaveRubrica(x) !== k)
        : [...p.rubricas, r],
    }));
  };

  const abrirPessoa = async (id: string, nome: string, origem: OrigemRelatorio) => {
    setPessoaAberta({ id, nome, origem });
    setCarregandoLancamentos(true);
    const r =
      origem === "casos"
        ? await consultarCasos<Linha>("relatorio_lancamentos_pessoa", { ...payload, p_pessoa_id: id, p_limit: 300, p_offset: 0 })
        : await consultarHistorico<Linha>("lancamentos", { ...corpoHistorico, pessoa_id: id, limit: 300, offset: 0 });
    setLancamentos(r.estado === "ok" ? r.dados : []);
    if (r.estado !== "ok") toast.error(r.motivo ?? "Não foi possível carregar os lançamentos");
    setCarregandoLancamentos(false);
  };

  const alternarTema = (nome: string) => {
    setRascunho((p) => ({
      ...p,
      temas: p.temas.includes(nome) ? p.temas.filter((t) => t !== nome) : [...p.temas, nome],
    }));
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <main className="container py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Relatórios por tema</h1>
          <p className="text-sm text-muted-foreground">
            Os termos vêm do cadastro de Temas e valem para as duas fontes. Cada fonte é somada separadamente.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4" /> Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">Temas</Label>
              <div className="flex flex-wrap gap-2">
                {temas.length === 0 && <span className="text-sm text-muted-foreground">Nenhum tema ativo cadastrado.</span>}
                {temas.map((t) => (
                  <Button
                    key={t.nome}
                    type="button"
                    size="sm"
                    variant={rascunho.temas.includes(t.nome) ? "default" : "outline"}
                    onClick={() => alternarTema(t.nome)}
                  >
                    {t.nome}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Sem seleção, todos os temas ativos são considerados.
              </p>
            </div>

            <div>
              <Label className="mb-2 block">Rubricas selecionadas</Label>
              {rascunho.rubricas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma rubrica selecionada. Na aba “Por rubrica”, clique em “Filtrar” na linha desejada: a seleção usa
                  a combinação exata de código, descrição, tipo e empresa/modelo, porque o mesmo código aparece em
                  rubricas diferentes.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {rascunho.rubricas.map((r) => (
                    <Button key={chaveRubrica(r)} type="button" size="sm" variant="secondary" onClick={() => alternarRubrica(r)}>
                      {rotuloRubrica(r)} ✕
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="rel-empresas">Empresa/modelo</Label>
                <Input id="rel-empresas" placeholder="Ex.: unigel, (sem empresa/modelo)" value={empresaTexto} onChange={(e) => setEmpresaTexto(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rel-de">Período inicial</Label>
                <Input id="rel-de" placeholder="MM/AAAA" value={rascunho.de ?? ""} onChange={(e) => setRascunho((p) => ({ ...p, de: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rel-ate">Período final</Label>
                <Input id="rel-ate" placeholder="MM/AAAA" value={rascunho.ate ?? ""} onChange={(e) => setRascunho((p) => ({ ...p, ate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Origem</Label>
                <Select value={rascunho.origem} onValueChange={(v) => setRascunho((p) => ({ ...p, origem: v as EscopoOrigem }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ambas">Ambas as fontes</SelectItem>
                    <SelectItem value="casos">Casos do aplicativo</SelectItem>
                    <SelectItem value="historico">Base histórica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={aplicar} disabled={carregando}>
                {carregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Aplicar filtros
              </Button>
              <Button variant="outline" onClick={limpar} disabled={carregando}>
                <RotateCcw className="mr-2 h-4 w-4" />Limpar
              </Button>
            </div>
          </CardContent>
        </Card>

        {avisos.length > 0 && (
          <div className="mb-6 space-y-2">
            {avisos.map((a) => (
              <div key={a} className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>{a} Os números abaixo são parciais e não representam o conjunto completo.</span>
              </div>
            ))}
          </div>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          {subtotais.subtotais.map((s) => (
            <Card key={s.origem}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{ROTULO_ORIGEM[s.origem]}</span>
                  {s.estado !== "ok" && <Badge variant="destructive">sem dados</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Itens: </span>{s.totais.itens}</div>
                <div><span className="text-muted-foreground">Pessoas: </span>{s.totais.pessoas}</div>
                <div><span className="text-muted-foreground">Proventos: </span>{formatarMoeda(s.totais.proventos)}</div>
                <div><span className="text-muted-foreground">Descontos: </span>{formatarMoeda(s.totais.descontos)}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {subtotais.sobreposicaoNaoValidada && (
          <div className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <strong>Soma simples das duas fontes:</strong> {formatarMoeda(subtotais.somaSimples.proventos)} em proventos e{" "}
            {formatarMoeda(subtotais.somaSimples.descontos)} em descontos. Este número é apenas a adição dos subtotais; a
            mesma pessoa pode existir nas duas bases e a sobreposição ainda não foi conferida, portanto não é um total único.
          </div>
        )}

        <Tabs value={visao} onValueChange={(v) => { setVisao(v as Visao); setPagina(0); }}>
          <TabsList>
            <TabsTrigger value="tema">Por tema</TabsTrigger>
            <TabsTrigger value="pessoa">Por pessoa</TabsTrigger>
            <TabsTrigger value="empresa">Por empresa</TabsTrigger>
            <TabsTrigger value="rubrica">Por rubrica</TabsTrigger>
          </TabsList>

          <TabsContent value={visao} className="mt-4">
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem</TableHead>
                    {visao === "tema" && <TableHead>Tema</TableHead>}
                    {visao === "pessoa" && (
                      <><TableHead>Pessoa</TableHead><TableHead>CPF</TableHead><TableHead>Identificação</TableHead><TableHead className="text-right">Casos</TableHead></>
                    )}
                    {visao === "empresa" && <><TableHead>Empresa/modelo</TableHead><TableHead>Pessoas</TableHead></>}
                    {visao === "rubrica" && (
                      <><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead>Tipo</TableHead><TableHead>Empresa/modelo</TableHead><TableHead>Filtro</TableHead></>
                    )}
                    <TableHead className="text-right">Itens</TableHead>
                    <TableHead className="text-right">Proventos</TableHead>
                    <TableHead className="text-right">Descontos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carregando && (
                    <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
                  )}
                  {!carregando && linhasVisiveis.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">Nenhum resultado para os filtros aplicados.</TableCell></TableRow>
                  )}
                  {!carregando && linhasVisiveis.map((l, i) => (
                    <TableRow
                      key={`${l.origem}-${i}-${txt(l.pessoa_id) ?? txt(l.tema) ?? txt(l.empresa_id) ?? txt(l.codigo)}`}
                      className={visao === "pessoa" ? "cursor-pointer" : undefined}
                      onClick={
                        visao === "pessoa"
                          ? () => abrirPessoa(txt(l.pessoa_id) ?? "", rotuloPessoa(txt(l.pessoa_nome)), l.origem)
                          : undefined
                      }
                    >
                      <TableCell><Badge variant="outline">{ROTULO_ORIGEM[l.origem]}</Badge></TableCell>
                      {visao === "tema" && <TableCell>{txt(l.tema)}</TableCell>}
                      {visao === "pessoa" && (
                        <>
                          <TableCell className="font-medium">{rotuloPessoa(txt(l.pessoa_nome))}</TableCell>
                          <TableCell>{txt(l.pessoa_cpf) ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {rotuloIdentificacao(txt(l.pessoa_identificacao))}
                          </TableCell>
                          <TableCell className="text-right">{num(l.casos)}</TableCell>
                        </>
                      )}
                      {visao === "empresa" && (
                        <>
                          <TableCell>{rotuloEmpresaModelo(txt(l.empresa_nome))}</TableCell>
                          <TableCell>{num(l.pessoas)}</TableCell>
                        </>
                      )}
                      {visao === "rubrica" && (
                        <>
                          <TableCell className="font-mono text-xs">{txt(l.codigo) ?? "—"}</TableCell>
                          <TableCell>{txt(l.descricao) ?? "—"}</TableCell>
                          <TableCell>{txt(l.tipo) ?? "—"}</TableCell>
                          <TableCell>{rotuloEmpresaModelo(txt(l.empresa))}</TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                alternarRubrica({
                                  codigo: txt(l.codigo),
                                  descricao: txt(l.descricao),
                                  tipo: txt(l.tipo),
                                  empresa: txt(l.empresa),
                                })
                              }
                            >
                              Filtrar
                            </Button>
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-right">{num(l.itens)}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(num(l.proventos))}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(num(l.descontos))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {visao !== "tema" && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Página {pagina + 1} — {PAGINA} linhas por fonte</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={pagina === 0 || carregando} onClick={() => setPagina((p) => Math.max(p - 1, 0))}>
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={carregando || linhasVisiveis.length === 0}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={!!pessoaAberta} onOpenChange={(o) => { if (!o) { setPessoaAberta(null); setLancamentos([]); } }}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Lançamentos — {pessoaAberta?.nome}{" "}
                <Badge variant="outline">{pessoaAberta ? ROTULO_ORIGEM[pessoaAberta.origem] : ""}</Badge>
              </DialogTitle>
            </DialogHeader>
            {carregandoLancamentos ? (
              <p className="py-8 text-center text-muted-foreground">Carregando…</p>
            ) : lancamentos.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Nenhum lançamento para os filtros aplicados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competência</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Caso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lancamentos.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{txt(l.competencia) ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{txt(l.codigo) ?? "—"}</TableCell>
                      <TableCell>{txt(l.descricao) ?? "—"}</TableCell>
                      <TableCell>{txt(l.tipo) ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(num(l.valor))}</TableCell>
                      <TableCell>
                        {txt(l.caso_id) ? (
                          <Link className="text-primary underline" to={`/casos/${txt(l.caso_id)}`} onClick={(e) => e.stopPropagation()}>
                            abrir
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
