import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  chaveEmpresa,
  chaveRubrica,
  consolidarTotais,
  competenciaValida,
  empresasPorOrigem,
  FILTROS_INICIAIS,
  formatarMoeda,
  há: undefined,
  montarRubricasPayload,
  montarTemasPayload,
  normalizarCompetenciaFiltro,
  periodoCoerente,
  rotuloEmpresaModelo,
  rotuloEmpresaSelecionada,
  rotuloIdentificacao,
  rotuloPessoa,
  rotuloRubrica,
  ROTULO_ORIGEM,
  temProximaPagina,
  totalLinhas,
  TOTAIS_ZERADOS,
  type EmpresaSelecionada,
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

export const PAGINA = 25;
export const LANCAMENTOS_POR_PAGINA = 50;

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
  const [temasEstado, setTemasEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [rascunho, setRascunho] = useState<FiltrosRelatorio>({ ...FILTROS_INICIAIS });
  const [filtros, setFiltros] = useState<FiltrosRelatorio>({ ...FILTROS_INICIAIS });
  const [visao, setVisao] = useState<Visao>("tema");
  const [pagina, setPagina] = useState(0);
  const [carregando, setCarregando] = useState(false);

  const [buscaEmpresa, setBuscaEmpresa] = useState("");
  const [opcoesEmpresa, setOpcoesEmpresa] = useState<Fonte<EmpresaSelecionada>>({ estado: "ok", dados: [] });
  const [buscandoEmpresas, setBuscandoEmpresas] = useState(false);

  const [totais, setTotais] = useState<Record<OrigemRelatorio, Fonte<Record<string, unknown>>>>({
    casos: { estado: "ok", dados: [] },
    historico: { estado: "ok", dados: [] },
  });
  const [linhas, setLinhas] = useState<Record<OrigemRelatorio, Fonte<Linha>>>({
    casos: { estado: "ok", dados: [] },
    historico: { estado: "ok", dados: [] },
  });

  const [pessoaAberta, setPessoaAberta] = useState<{ id: string; nome: string; origem: OrigemRelatorio } | null>(null);
  const [lancamentos, setLancamentos] = useState<Fonte<Linha>>({ estado: "ok", dados: [] });
  const [paginaLancamentos, setPaginaLancamentos] = useState(0);
  const [carregandoLancamentos, setCarregandoLancamentos] = useState(false);

  /**
   * Descarte de respostas antigas: cada consulta recebe um número de série e
   * só grava o resultado se ainda for a consulta mais recente. Sem isso, trocar
   * de aba, de página ou de pessoa rapidamente pode exibir o resultado anterior.
   */
  const serieLista = useRef(0);
  const serieLancamentos = useRef(0);

  useEffect(() => {
    supabase
      .from("temas")
      .select("nome, ativo, tema_termos(termo)")
      .eq("ativo", true)
      .order("nome")
      .then(({ data, error }) => {
        if (error) {
          setTemasEstado("erro");
          toast.error("Não foi possível carregar os temas");
          return;
        }
        setTemasEstado("ok");
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
      p_empresas: empresasPorOrigem(filtros.empresas, "casos"),
      p_de: filtros.de,
      p_ate: filtros.ate,
    };
  }, [temas, filtros]);

  const corpoHistorico = useMemo(
    () => ({
      temas: payload.p_temas,
      rubricas: payload.p_rubricas,
      empresas: empresasPorOrigem(filtros.empresas, "historico"),
      de: payload.p_de,
      ate: payload.p_ate,
    }),
    [payload, filtros.empresas],
  );

  const usaCasos = filtros.origem !== "historico";
  const usaHistorico = filtros.origem !== "casos";

  const carregar = useCallback(async () => {
    if (temasEstado !== "ok") return;
    const serie = ++serieLista.current;
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

    if (serie !== serieLista.current) return;
    setTotais({ casos: tc, historico: th });
    setLinhas({ casos: lc, historico: lh });
    setCarregando(false);
  }, [temasEstado, payload, corpoHistorico, visao, pagina, usaCasos, usaHistorico]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const buscarEmpresas = useCallback(async () => {
    setBuscandoEmpresas(true);
    const [oc, oh] = await Promise.all([
      usaCasos
        ? consultarCasos<Record<string, unknown>>("relatorio_opcoes_empresa", {
            p_busca: buscaEmpresa.trim() || null,
            p_limit: 50,
            p_offset: 0,
          })
        : Promise.resolve({ estado: "ok" as const, dados: [] }),
      usaHistorico
        ? consultarHistorico<Record<string, unknown>>("opcoes_empresa", { busca: buscaEmpresa.trim() || null, limit: 50, offset: 0 })
        : Promise.resolve({ estado: "ok" as const, dados: [] }),
    ]);
    const opcoes: EmpresaSelecionada[] = [
      ...(oc.estado === "ok" ? oc.dados : []).map((o) => ({
        origem: "casos" as const,
        id: txt(o.empresa_id) ?? "",
        rotulo: rotuloEmpresaModelo(txt(o.empresa_rotulo) ?? txt(o.empresa_id)),
      })),
      ...(oh.estado === "ok" ? oh.dados : []).map((o) => ({
        origem: "historico" as const,
        id: txt(o.empresa_id) ?? "",
        rotulo: rotuloEmpresaModelo(txt(o.empresa_rotulo) ?? txt(o.empresa_id)),
      })),
    ];
    const estado: EstadoFonte = oc.estado !== "ok" ? oc.estado : oh.estado !== "ok" ? oh.estado : "ok";
    setOpcoesEmpresa({ estado, motivo: oc.motivo ?? oh.motivo, dados: opcoes });
    setBuscandoEmpresas(false);
  }, [buscaEmpresa, usaCasos, usaHistorico]);

  useEffect(() => {
    void buscarEmpresas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usaCasos, usaHistorico]);

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

  /** A próxima página só existe enquanto alguma fonte tiver mais linhas do que já foram percorridas. */
  const proximaDisponivel = useMemo(() => {
    if (visao === "tema") return false;
    const totaisFonte = [
      usaCasos && linhas.casos.estado === "ok" ? totalLinhas(linhas.casos.dados) : 0,
      usaHistorico && linhas.historico.estado === "ok" ? totalLinhas(linhas.historico.dados) : 0,
    ];
    return temProximaPagina(pagina, PAGINA, totaisFonte);
  }, [visao, linhas, pagina, usaCasos, usaHistorico]);

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
    setPagina(0);
    setFiltros({ ...rascunho, de, ate });
  };

  const limpar = () => {
    setRascunho({ ...FILTROS_INICIAIS });
    setBuscaEmpresa("");
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

  /** Empresa é sempre escolhida na lista vinda do servidor, pelo identificador da própria origem. */
  const alternarEmpresa = (e: EmpresaSelecionada) => {
    const k = chaveEmpresa(e);
    setRascunho((p) => ({
      ...p,
      empresas: p.empresas.some((x) => chaveEmpresa(x) === k)
        ? p.empresas.filter((x) => chaveEmpresa(x) !== k)
        : [...p.empresas, e],
    }));
  };

  const carregarLancamentos = useCallback(
    async (pessoa: { id: string; origem: OrigemRelatorio }, pag: number) => {
      const serie = ++serieLancamentos.current;
      setCarregandoLancamentos(true);
      const r =
        pessoa.origem === "casos"
          ? await consultarCasos<Linha>("relatorio_lancamentos_pessoa", {
              ...payload,
              p_pessoa_id: pessoa.id,
              p_limit: LANCAMENTOS_POR_PAGINA,
              p_offset: pag * LANCAMENTOS_POR_PAGINA,
            })
          : await consultarHistorico<Linha>("lancamentos", {
              ...corpoHistorico,
              pessoa_id: pessoa.id,
              limit: LANCAMENTOS_POR_PAGINA,
              offset: pag * LANCAMENTOS_POR_PAGINA,
            });
      if (serie !== serieLancamentos.current) return;
      setLancamentos(r);
      if (r.estado !== "ok") toast.error(r.motivo ?? "Não foi possível carregar os lançamentos");
      setCarregandoLancamentos(false);
    },
    [payload, corpoHistorico],
  );

  const abrirPessoa = async (id: string, nome: string, origem: OrigemRelatorio) => {
    setPessoaAberta({ id, nome, origem });
    setPaginaLancamentos(0);
    setLancamentos({ estado: "ok", dados: [] });
    await carregarLancamentos({ id, origem }, 0);
  };

  const irParaPaginaLancamentos = async (pag: number) => {
    if (!pessoaAberta) return;
    setPaginaLancamentos(pag);
    await carregarLancamentos(pessoaAberta, pag);
  };

  const alternarTema = (nome: string) => {
    setRascunho((p) => ({
      ...p,
      temas: p.temas.includes(nome) ? p.temas.filter((t) => t !== nome) : [...p.temas, nome],
    }));
  };

  const proximaLancamentos = temProximaPagina(paginaLancamentos, LANCAMENTOS_POR_PAGINA, [
    lancamentos.estado === "ok" ? totalLinhas(lancamentos.dados) : 0,
  ]);

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
                {temasEstado === "carregando" && <span className="text-sm text-muted-foreground">Carregando temas…</span>}
                {temasEstado === "erro" && (
                  <span className="text-sm text-destructive">
                    Não foi possível carregar os temas. Isto é uma falha de consulta, não ausência de cadastro.
                  </span>
                )}
                {temasEstado === "ok" && temas.length === 0 && (
                  <span className="text-sm text-muted-foreground">Nenhum tema ativo cadastrado.</span>
                )}
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

            <div>
              <Label className="mb-2 block" htmlFor="rel-busca-empresa">Empresa/modelo</Label>
              <div className="flex gap-2">
                <Input
                  id="rel-busca-empresa"
                  placeholder="Buscar empresa/modelo"
                  value={buscaEmpresa}
                  onChange={(e) => setBuscaEmpresa(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => void buscarEmpresas()} disabled={buscandoEmpresas}>
                  Buscar
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                A lista vem do servidor. Nos casos do aplicativo a opção é o modelo de leitura do contracheque; na base
                histórica é a empresa cadastrada, identificada pelo seu registro e não apenas pelo nome.
              </p>
              {rascunho.empresas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {rascunho.empresas.map((e) => (
                    <Button key={chaveEmpresa(e)} type="button" size="sm" variant="secondary" onClick={() => alternarEmpresa(e)}>
                      {rotuloEmpresaSelecionada(e)} ✕
                    </Button>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {buscandoEmpresas && <span className="text-sm text-muted-foreground">Buscando…</span>}
                {!buscandoEmpresas && opcoesEmpresa.estado !== "ok" && (
                  <span className="text-sm text-destructive">
                    Lista de empresas indisponível nesta consulta. {opcoesEmpresa.motivo ?? ""}
                  </span>
                )}
                {!buscandoEmpresas && opcoesEmpresa.estado === "ok" && opcoesEmpresa.dados.length === 0 && (
                  <span className="text-sm text-muted-foreground">Nenhuma opção encontrada para esta busca.</span>
                )}
                {!buscandoEmpresas &&
                  opcoesEmpresa.estado === "ok" &&
                  opcoesEmpresa.dados.map((o) => (
                    <Button
                      key={chaveEmpresa(o)}
                      type="button"
                      size="sm"
                      variant={rascunho.empresas.some((x) => chaveEmpresa(x) === chaveEmpresa(o)) ? "default" : "outline"}
                      onClick={() => alternarEmpresa(o)}
                    >
                      {rotuloEmpresaSelecionada(o)}
                    </Button>
                  ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
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
                  {s.estado !== "ok" && <Badge variant="destructive">sem resposta</Badge>}
                </CardTitle>
              </CardHeader>
              {/* Fonte sem resposta não exibe zero: zero seria lido como "não há dados". */}
              {s.estado !== "ok" ? (
                <CardContent className="text-sm text-muted-foreground">
                  {s.estado === "indisponivel"
                    ? "Consulta não realizada nesta fonte. Os valores não foram apurados e não são zero."
                    : "Falha ao consultar esta fonte. Os valores não foram apurados e não são zero."}
                </CardContent>
              ) : (
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Itens: </span>{s.totais.itens}</div>
                  <div><span className="text-muted-foreground">Pessoas: </span>{s.totais.pessoas}</div>
                  <div><span className="text-muted-foreground">Proventos: </span>{formatarMoeda(s.totais.proventos)}</div>
                  <div><span className="text-muted-foreground">Descontos: </span>{formatarMoeda(s.totais.descontos)}</div>
                </CardContent>
              )}
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
                    disabled={carregando || !proximaDisponivel}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog
          open={!!pessoaAberta}
          onOpenChange={(o) => {
            if (!o) {
              serieLancamentos.current++;
              setPessoaAberta(null);
              setLancamentos({ estado: "ok", dados: [] });
              setPaginaLancamentos(0);
            }
          }}
        >
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Lançamentos — {pessoaAberta?.nome}{" "}
                <Badge variant="outline">{pessoaAberta ? ROTULO_ORIGEM[pessoaAberta.origem] : ""}</Badge>
              </DialogTitle>
            </DialogHeader>
            {carregandoLancamentos ? (
              <p className="py-8 text-center text-muted-foreground">Carregando…</p>
            ) : lancamentos.estado !== "ok" ? (
              <p className="py-8 text-center text-destructive">
                Não foi possível carregar os lançamentos desta pessoa. {lancamentos.motivo ?? ""}
              </p>
            ) : lancamentos.dados.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Nenhum lançamento para os filtros aplicados.</p>
            ) : (
              <>
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
                    {lancamentos.dados.map((l, i) => (
                      <TableRow key={txt(l.item_id) ?? i}>
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
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm text-muted-foreground">
                    Página {paginaLancamentos + 1} de {Math.max(Math.ceil(totalLinhas(lancamentos.dados) / LANCAMENTOS_POR_PAGINA), 1)} —{" "}
                    {totalLinhas(lancamentos.dados)} lançamentos
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={paginaLancamentos === 0 || carregandoLancamentos}
                      onClick={() => void irParaPaginaLancamentos(Math.max(paginaLancamentos - 1, 0))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={carregandoLancamentos || !proximaLancamentos}
                      onClick={() => void irParaPaginaLancamentos(paginaLancamentos + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
