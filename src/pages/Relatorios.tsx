import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  Filter,
  Layers,
  Loader2,
  RotateCcw,
  Search,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  acaoViavel,
  calcularMetricasGestao,
  chaveEmpresa,
  chaveRubrica,
  consolidarTotais,
  competenciaValida,
  deduplicarLancamentos,
  deduplicarPessoas,
  empresasPorOrigem,
  FILTROS_INICIAIS,
  formatarMoeda,
  LIMITE_VIABILIDADE_PADRAO,
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

type Visao = "pessoa" | "tema" | "empresa" | "rubrica";

type Linha = Record<string, unknown> & { origem?: OrigemRelatorio };

type Fonte<T> = { estado: EstadoFonte; motivo?: string; dados: T[] };

export const PAGINA = 50;
export const LANCAMENTOS_POR_PAGINA = 50;

const rpc = supabase as unknown as {
  rpc: (
    nome: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

// A ponte histórica valida o token de sessão no Auth do aplicativo e confere o papel do usuário.
const HISTORICO_PONTE_URL = "https://pcquefluiltrvwjpndvw.supabase.co/functions/v1/relatorios-ponte";

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const txt = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));

async function consultarCasos<T>(nome: string, params: Record<string, unknown>): Promise<Fonte<T>> {
  const { data, error } = await rpc.rpc(nome, params);
  if (error) return { estado: "erro", motivo: error.message, dados: [] };
  return { estado: "ok", dados: (data ?? []) as T[] };
}

async function consultarHistorico<T>(acao: string, body: Record<string, unknown>): Promise<Fonte<T>> {
  const { data: sessao, error: erroSessao } = await supabase.auth.getSession();
  if (erroSessao || !sessao.session?.access_token) {
    return { estado: "erro", motivo: "Não foi possível identificar a sessão do usuário.", dados: [] };
  }

  let resposta: Response;
  try {
    resposta = await fetch(HISTORICO_PONTE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessao.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ acao, ...body }),
    });
  } catch {
    return { estado: "erro", motivo: "Não foi possível conectar à base histórica.", dados: [] };
  }

  const r = (await resposta.json().catch(() => null)) as {
    disponivel?: boolean;
    motivo?: string;
    dados?: T[];
    error?: string;
  } | null;
  if (!resposta.ok)
    return {
      estado: "erro",
      motivo: r?.motivo ?? r?.error ?? `Consulta histórica indisponível (${resposta.status}).`,
      dados: [],
    };
  if (!r?.disponivel) return { estado: "indisponivel", motivo: r?.motivo, dados: [] };
  return { estado: "ok", dados: r.dados ?? [] };
}

export default function Relatorios() {
  const [temas, setTemas] = useState<TemaComTermos[]>([]);
  const [temasEstado, setTemasEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [rascunho, setRascunho] = useState<FiltrosRelatorio>({ ...FILTROS_INICIAIS });
  const [filtros, setFiltros] = useState<FiltrosRelatorio>({ ...FILTROS_INICIAIS });
  const [visao, setVisao] = useState<Visao>("pessoa");
  const [pagina, setPagina] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [consultou, setConsultou] = useState(false);

  // Combobox popovers
  const [popoverTemasAberto, setPopoverTemasAberto] = useState(false);
  const [buscaTemaPopover, setBuscaTemaPopover] = useState("");
  const [popoverEmpresasAberto, setPopoverEmpresasAberto] = useState(false);
  const [buscaEmpresa, setBuscaEmpresa] = useState("");
  const [opcoesEmpresa, setOpcoesEmpresa] = useState<Fonte<EmpresaSelecionada>>({ estado: "ok", dados: [] });
  const [buscandoEmpresas, setBuscandoEmpresas] = useState(false);

  // Busca rápida na tabela de clientes
  const [buscaClienteLocal, setBuscaClienteLocal] = useState("");

  const [totais, setTotais] = useState<Record<OrigemRelatorio, Fonte<Record<string, unknown>>>>({
    casos: { estado: "ok", dados: [] },
    historico: { estado: "ok", dados: [] },
  });
  const [linhas, setLinhas] = useState<Record<OrigemRelatorio, Fonte<Linha>>>({
    casos: { estado: "ok", dados: [] },
    historico: { estado: "ok", dados: [] },
  });

  // Modal de detalhamento e totalização por tema
  const [pessoaAberta, setPessoaAberta] = useState<{
    id: string;
    nome: string;
    origem: OrigemRelatorio;
    temaDestaque?: string;
  } | null>(null);
  const [lancamentos, setLancamentos] = useState<Fonte<Linha>>({ estado: "ok", dados: [] });
  const [paginaLancamentos, setPaginaLancamentos] = useState(0);
  const [carregandoLancamentos, setCarregandoLancamentos] = useState(false);

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
      visao === "tema"
        ? "totais_tema"
        : visao === "pessoa"
          ? "por_pessoa"
          : visao === "empresa"
            ? "por_empresa"
            : "rubricas";
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
    const lcDedup: Fonte<Linha> = {
      ...lc,
      dados: visao === "pessoa" ? deduplicarPessoas(lc.dados) : lc.dados,
    };
    const lhDedup: Fonte<Linha> = {
      ...lh,
      dados: visao === "pessoa" ? deduplicarPessoas(lh.dados) : lh.dados,
    };
    setLinhas({ casos: lcDedup, historico: lhDedup });
    setCarregando(false);
  }, [temasEstado, payload, corpoHistorico, visao, pagina, usaCasos, usaHistorico]);

  useEffect(() => {
    if (!consultou) return;
    void carregar();
  }, [consultou, carregar]);

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
        ? consultarHistorico<Record<string, unknown>>("opcoes_empresa", {
            busca: buscaEmpresa.trim() || null,
            limit: 50,
            offset: 0,
          })
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
    if (popoverEmpresasAberto) {
      void buscarEmpresas();
    }
  }, [popoverEmpresasAberto, buscarEmpresas]);

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
    if (usaCasos && linhas.casos.estado === "ok")
      saida.push(...linhas.casos.dados.map((d) => ({ ...d, origem: "casos" as const })));
    if (usaHistorico && linhas.historico.estado === "ok")
      saida.push(...linhas.historico.dados.map((d) => ({ ...d, origem: "historico" as const })));
    return saida;
  }, [linhas, usaCasos, usaHistorico]);

  // Linhas filtradas localmente pela busca rápida do cliente
  const linhasFiltradasLocal = useMemo(() => {
    if (!buscaClienteLocal.trim()) return linhasVisiveis;
    const q = buscaClienteLocal.toLowerCase().trim();
    return linhasVisiveis.filter((l) => {
      const nome = rotuloPessoa(txt(l.pessoa_nome)).toLowerCase();
      const cpf = txt(l.pessoa_cpf)?.replace(/\D/g, "") ?? "";
      const emp = rotuloEmpresaModelo(txt(l.empresa) ?? txt(l.empresa_nome)).toLowerCase();
      return nome.includes(q) || cpf.includes(q) || emp.includes(q);
    });
  }, [linhasVisiveis, buscaClienteLocal]);

  // Cálculo das 4 métricas de gestão aprovadas por Ana e Nodley
  const metricasGestao = useMemo(() => {
    const dadosParaMetricas = (
      linhas.casos.dados.length > 0 ? linhas.casos.dados : linhas.historico.dados
    ) as Array<{
      pessoa_cpf?: string | null;
      empresa?: string | null;
      competencias?: number | null;
      proventos?: number | null;
      descontos?: number | null;
    }>;
    const totalPessoasBase = subtotais.somaSimples.pessoas;
    return calcularMetricasGestao(dadosParaMetricas, totalPessoasBase);
  }, [linhas, subtotais]);

  const proximaDisponivel = useMemo(() => {
    if (visao === "tema") return false;
    const totaisFonte = [
      usaCasos && linhas.casos.estado === "ok" ? totalLinhas(linhas.casos.dados) : 0,
      usaHistorico && linhas.historico.estado === "ok" ? totalLinhas(linhas.historico.dados) : 0,
    ];
    return temProximaPagina(pagina, PAGINA, totaisFonte);
  }, [visao, linhas, pagina, usaCasos, usaHistorico]);

  const avisos = useMemo(() => {
    if (!consultou) return [];
    const lista: string[] = [];
    const checar = (origem: OrigemRelatorio, f: Fonte<unknown>) => {
      if (f.estado === "indisponivel")
        lista.push(`${ROTULO_ORIGEM[origem]}: consulta não realizada. ${f.motivo ?? ""}`.trim());
      if (f.estado === "erro")
        lista.push(`${ROTULO_ORIGEM[origem]}: falha na consulta. ${f.motivo ?? ""}`.trim());
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
  }, [totais, linhas, usaCasos, usaHistorico, consultou]);

  const aplicar = () => {
    const de = normalizarCompetenciaFiltro(rascunho.de);
    const ate = normalizarCompetenciaFiltro(rascunho.ate);
    if (rascunho.de && !competenciaValida(rascunho.de))
      return toast.error("Período inicial deve estar no formato MM/AAAA");
    if (rascunho.ate && !competenciaValida(rascunho.ate))
      return toast.error("Período final deve estar no formato MM/AAAA");
    if (!periodoCoerente(de, ate))
      return toast.error("O período inicial não pode ser posterior ao final");
    setPagina(0);
    setFiltros({ ...rascunho, de, ate });
    setConsultou(true);
  };

  const limpar = () => {
    setRascunho({ ...FILTROS_INICIAIS });
    setBuscaEmpresa("");
    setBuscaClienteLocal("");
    setPagina(0);
    setFiltros({ ...FILTROS_INICIAIS });
    setConsultou(false);
    setTotais({
      casos: { estado: "ok", dados: [] },
      historico: { estado: "ok", dados: [] },
    });
    setLinhas({
      casos: { estado: "ok", dados: [] },
      historico: { estado: "ok", dados: [] },
    });
  };

  const alternarOrigemAba = (novaOrigem: OrigemRelatorio) => {
    setRascunho((p) => ({ ...p, origem: novaOrigem }));
  };

  const alternarRubrica = (r: RubricaSelecionada) => {
    const k = chaveRubrica(r);
    setRascunho((p) => ({
      ...p,
      rubricas: p.rubricas.some((x) => chaveRubrica(x) === k)
        ? p.rubricas.filter((x) => chaveRubrica(x) !== k)
        : [...p.rubricas, r],
    }));
  };

  const alternarEmpresa = (e: EmpresaSelecionada) => {
    const k = chaveEmpresa(e);
    setRascunho((p) => ({
      ...p,
      empresas: p.empresas.some((x) => chaveEmpresa(x) === k)
        ? p.empresas.filter((x) => chaveEmpresa(x) !== k)
        : [...p.empresas, e],
    }));
  };

  const alternarTema = (nome: string) => {
    setRascunho((p) => ({
      ...p,
      temas: p.temas.includes(nome) ? p.temas.filter((t) => t !== nome) : [...p.temas, nome],
    }));
  };

  const marcarTodosTemas = () => {
    setRascunho((p) => ({ ...p, temas: temas.map((t) => t.nome) }));
  };

  const limparTemas = () => {
    setRascunho((p) => ({ ...p, temas: [] }));
  };

  const temasFiltradosPopover = useMemo(() => {
    if (!buscaTemaPopover.trim()) return temas;
    const q = buscaTemaPopover.toLowerCase().trim();
    return temas.filter((t) => t.nome.toLowerCase().includes(q));
  }, [temas, buscaTemaPopover]);

  const carregarLancamentos = useCallback(
    async (pessoa: { id: string; origem: OrigemRelatorio }) => {
      const serie = ++serieLancamentos.current;
      setCarregandoLancamentos(true);
      const r =
        pessoa.origem === "casos"
          ? await consultarCasos<Linha>("relatorio_lancamentos_pessoa", {
              ...payload,
              p_pessoa_id: pessoa.id,
              p_limit: 500,
              p_offset: 0,
            })
          : await consultarHistorico<Linha>("lancamentos", {
              ...corpoHistorico,
              pessoa_id: pessoa.id,
              limit: 500,
              offset: 0,
            });
      if (serie !== serieLancamentos.current) return;

      // Deduplicação canônica imediata para eliminar repetições de holerites idênticos
      const dadosDedup = deduplicarLancamentos(r.dados);
      setLancamentos({
        ...r,
        dados: dadosDedup,
      });

      // Recalcula totais deduplicados e atualiza a linha correspondente na tabela principal
      if (dadosDedup.length > 0) {
        let dedupProventos = 0;
        let dedupDescontos = 0;
        const compsUnicas = new Set<string>();
        let empresaDetectada: string | null = null;

        for (const item of dadosDedup) {
          const v = num(item.valor);
          if (item.tipo === "provento") dedupProventos += v;
          if (item.tipo === "desconto") dedupDescontos += v;
          if (item.competencia) compsUnicas.add(String(item.competencia));
          if (item.empresa && !empresaDetectada) empresaDetectada = txt(item.empresa);
        }

        setLinhas((prev) => {
          const atualizarFonte = (fonte: Fonte<Linha>): Fonte<Linha> => ({
            ...fonte,
            dados: fonte.dados.map((linha) => {
              if (txt(linha.pessoa_id) === pessoa.id) {
                return {
                  ...linha,
                  proventos: dedupProventos,
                  descontos: dedupDescontos,
                  competencias: compsUnicas.size || 1,
                  empresa: linha.empresa ?? empresaDetectada,
                };
              }
              return linha;
            }),
          });
          return {
            casos: pessoa.origem === "casos" ? atualizarFonte(prev.casos) : prev.casos,
            historico: pessoa.origem === "historico" ? atualizarFonte(prev.historico) : prev.historico,
          };
        });
      }

      if (r.estado !== "ok") toast.error(r.motivo ?? "Não foi possível carregar os lançamentos");
      setCarregandoLancamentos(false);
    },
    [payload, corpoHistorico],
  );

  const abrirPessoa = async (
    id: string,
    nome: string,
    origem: OrigemRelatorio,
    temaDestaque?: string,
  ) => {
    setPessoaAberta({ id, nome, origem, temaDestaque });
    setPaginaLancamentos(0);
    setLancamentos({ estado: "ok", dados: [] });
    await carregarLancamentos({ id, origem });
  };

  const irParaPaginaLancamentos = (pag: number) => {
    setPaginaLancamentos(pag);
  };

  const lancamentosPaginados = useMemo(() => {
    const inicio = paginaLancamentos * LANCAMENTOS_POR_PAGINA;
    return lancamentos.dados.slice(inicio, inicio + LANCAMENTOS_POR_PAGINA);
  }, [lancamentos.dados, paginaLancamentos]);

  const proximaLancamentos = (paginaLancamentos + 1) * LANCAMENTOS_POR_PAGINA < lancamentos.dados.length;

  // Totalização do tema selecionado para o modal
  const resumoTemaDestaque = useMemo(() => {
    if (!pessoaAberta?.temaDestaque || lancamentos.dados.length === 0) return null;
    const temaAlvo = pessoaAberta.temaDestaque.toLowerCase();
    const termoTema = temas.find((t) => t.nome === pessoaAberta.temaDestaque)?.termos ?? [temaAlvo];

    const itensDoTema = lancamentos.dados.filter((l) => {
      const desc = txt(l.descricao)?.toLowerCase() ?? "";
      return termoTema.some((termo) => desc.includes(termo.toLowerCase().trim()));
    });

    const itens = itensDoTema.length > 0 ? itensDoTema : lancamentos.dados;
    let proventos = 0;
    let descontos = 0;
    const comps = new Set<string>();

    for (const item of itens) {
      const v = num(item.valor);
      if (item.tipo === "provento") proventos += v;
      if (item.tipo === "desconto") descontos += v;
      if (item.competencia) comps.add(String(item.competencia));
    }

    const saldo = proventos - descontos;
    const meses = comps.size || 1;
    const mediaMensal = saldo / meses;
    const viavel = acaoViavel(saldo);

    return {
      nomeTema: pessoaAberta.temaDestaque,
      saldo,
      proventos,
      descontos,
      meses,
      mediaMensal,
      viavel,
    };
  }, [pessoaAberta, lancamentos, temas]);

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader />
      <main className="container max-w-7xl py-8">
        {/* CABEÇALHO DA PÁGINA COM SELETOR DE ORIGEM (SHADCN TABS) */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Relatórios por tema</h1>
            <p className="text-sm text-muted-foreground">
              Visão consolidada de direitos dos clientes por teses jurídicas. Somente dados{" "}
              <strong>válidos e deduplicados</strong>.
            </p>
          </div>

          {/* SELETOR SEGMENTADO: CASOS DO APLICATIVO vs BASE HISTÓRICA */}
          <div className="inline-flex rounded-lg border bg-muted p-1">
            <button
              type="button"
              onClick={() => alternarOrigemAba("casos")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
                rascunho.origem === "casos"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>📁</span> Casos do aplicativo
            </button>
            <button
              type="button"
              onClick={() => alternarOrigemAba("historico")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
                rascunho.origem === "historico"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>🏛️</span> Base histórica
            </button>
          </div>
        </div>

        {/* 1. PAINEL DE FILTROS (OPÇÃO 1: COMBOBOX ESCALÁVEL PARA 300+ TEMAS) */}
        <Card className="mb-6 shadow-sm">
          <CardHeader className="border-b pb-3 pt-4">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" /> Filtros de Pesquisa
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {rascunho.origem === "casos" ? "Base ativa do aplicativo" : "Consulta da base histórica"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-4 md:grid-cols-3">
              {/* COMBOBOX OPÇÃO 1: TEMAS JURÍDICOS (MULTI-SELECT ESCALÁVEL 3 A 300+ TEMAS) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Temas Jurídicos</Label>
                <Popover open={popoverTemasAberto} onOpenChange={setPopoverTemasAberto}>
                  <PopoverTrigger asChild>
                    <div className="flex min-h-[40px] w-full cursor-pointer items-center justify-between rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent/5">
                      <div className="flex flex-wrap gap-1.5">
                        {rascunho.temas.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Todos os temas ativos</span>
                        ) : rascunho.temas.length <= 2 ? (
                          rascunho.temas.map((t) => (
                            <Badge key={t} variant="secondary" className="gap-1 py-0 text-xs">
                              {t}
                              <X
                                className="h-3 w-3 cursor-pointer hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  alternarTema(t);
                                }}
                              />
                            </Badge>
                          ))
                        ) : (
                          <>
                            <Badge variant="secondary" className="gap-1 py-0 text-xs">
                              {rascunho.temas[0]}
                              <X
                                className="h-3 w-3 cursor-pointer hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  alternarTema(rascunho.temas[0]);
                                }}
                              />
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              +{rascunho.temas.length - 1} selecionados
                            </Badge>
                          </>
                        )}
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-50" />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-3" align="start">
                    <div className="space-y-2">
                      <Input
                        placeholder="🔍 Buscar entre os temas..."
                        value={buscaTemaPopover}
                        onChange={(e) => setBuscaTemaPopover(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                        {temasFiltradosPopover.length === 0 ? (
                          <p className="py-4 text-center text-xs text-muted-foreground">Nenhum tema encontrado</p>
                        ) : (
                          temasFiltradosPopover.map((t) => {
                            const selecionado = rascunho.temas.includes(t.nome);
                            return (
                              <label
                                key={t.nome}
                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                              >
                                <Checkbox
                                  checked={selecionado}
                                  onCheckedChange={() => alternarTema(t.nome)}
                                  className="h-4 w-4"
                                />
                                <span className="flex-1 font-medium">{t.nome}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      <div className="flex items-center justify-between border-t pt-2 text-xs">
                        <button
                          type="button"
                          onClick={marcarTodosTemas}
                          className="font-medium text-primary hover:underline"
                        >
                          Selecionar todos
                        </button>
                        <button
                          type="button"
                          onClick={limparTemas}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* COMBOBOX EMPRESAS / EMPREGADOR */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Empresa / Empregador</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Buscar empresa/modelo..."
                    value={buscaEmpresa}
                    onChange={(e) => setBuscaEmpresa(e.target.value)}
                    className="h-10 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void buscarEmpresas()}
                    disabled={buscandoEmpresas}
                    className="h-10 text-xs shrink-0"
                  >
                    {buscandoEmpresas ? <Loader2 className="h-3 w-3 animate-spin" /> : "Buscar"}
                  </Button>
                </div>
              </div>

              {/* INTERVALO DE COMPETÊNCIAS MM/AAAA */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Período de Competências</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="MM/AAAA"
                    value={rascunho.de ?? ""}
                    onChange={(e) => setRascunho((p) => ({ ...p, de: e.target.value }))}
                    className="h-10 font-mono text-xs"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input
                    placeholder="MM/AAAA"
                    value={rascunho.ate ?? ""}
                    onChange={(e) => setRascunho((p) => ({ ...p, ate: e.target.value }))}
                    className="h-10 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* TAGS DE EMPRESAS SELECIONADAS */}
            {rascunho.empresas.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground mr-1">Empresas ativas:</span>
                {rascunho.empresas.map((e) => (
                  <Badge key={chaveEmpresa(e)} variant="secondary" className="gap-1 py-0 text-xs">
                    {rotuloEmpresaSelecionada(e)}
                    <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => alternarEmpresa(e)} />
                  </Badge>
                ))}
              </div>
            )}

            {/* BOTÕES DE AÇÃO */}
            <div className="flex items-center justify-between border-t pt-3">
              <div className="flex gap-2">
                <Button onClick={aplicar} disabled={carregando} size="sm">
                  {carregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Filtrar
                </Button>
                <Button variant="outline" onClick={limpar} disabled={carregando} size="sm">
                  <RotateCcw className="mr-2 h-4 w-4" /> Limpar
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">
                {filtros.temas.length === 0 ? "Todos os temas" : `${filtros.temas.length} temas selecionados`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* MENSAGENS E ALERTAS DE FONTE (APENAS QUANDO A FONTE ATIVA TEM PROBLEMA REAL) */}
        {avisos.length > 0 && (
          <div className="mb-6 space-y-2">
            {avisos.map((a) => (
              <div
                key={a}
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{a}</span>
              </div>
            ))}
          </div>
        )}

        {/* 2. CARDS DE GESTÃO APROVADOS POR ANA E NODLEY (FOCO EM VIABILIDADE & CARTEIRA) */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* CARD 1: CLIENTES ELEGÍVEIS */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Clientes Elegíveis</span>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {consultou ? metricasGestao.clientesElegiveis : "—"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {consultou ? "Identificados com CPF e dados válidos" : "Aguardando filtro"}
              </p>
            </CardContent>
          </Card>

          {/* CARD 2: AÇÕES VIÁVEIS (SUPERAM R$ 15.000,00) */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Ações Viáveis</span>
                {consultou && (
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">
                    {metricasGestao.percentualViaveis}% da Carteira
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {consultou ? `${metricasGestao.acoesViaveis} Clientes` : "—"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {consultou ? "Superam a linha de corte (R$ 15.000,00)" : "Clique em Filtrar para apurar"}
              </p>
            </CardContent>
          </Card>

          {/* CARD 3: LASTRO MÉDIO DE FOLHAS */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Lastro Médio de Folhas</span>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {consultou ? `${metricasGestao.lastroMedioMeses} meses` : "—"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {consultou ? "Média de holerites apurados por cliente" : "Aguardando filtro"}
              </p>
            </CardContent>
          </Card>

          {/* CARD 4: EMPRESA PREDOMINANTE */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Empresa Predominante</span>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="truncate text-2xl font-bold tracking-tight text-foreground">
                {consultou ? metricasGestao.empresaPredominante : "—"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {consultou
                  ? metricasGestao.empresaPredominanteQtd > 0
                    ? `${metricasGestao.empresaPredominanteQtd} dos ${metricasGestao.clientesElegiveis} clientes apurados`
                    : "Nenhuma empresa apurada"
                  : "Aguardando filtro"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 3. VISÃO PRINCIPAL DA TABELA: HIERARQUIA DE CLIENTE */}
        <Card className="shadow-sm">
          <CardHeader className="border-b pb-3 pt-4">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">
                  Clientes por Temas Jurídicos
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Clique sobre o cliente ou sobre um tema específico para totalizar a ação
                </p>
              </div>

              {/* ABAS SECUNDÁRIAS E BUSCA LOCAL */}
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  placeholder="Buscar por cliente, CPF ou empresa..."
                  value={buscaClienteLocal}
                  onChange={(e) => setBuscaClienteLocal(e.target.value)}
                  className="h-8 w-60 text-xs"
                />

                <Tabs
                  value={visao}
                  onValueChange={(v) => {
                    setVisao(v as Visao);
                    setPagina(0);
                  }}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="pessoa" className="text-xs px-2.5">
                      Por cliente
                    </TabsTrigger>
                    <TabsTrigger value="tema" className="text-xs px-2.5">
                      Por tema
                    </TabsTrigger>
                    <TabsTrigger value="empresa" className="text-xs px-2.5">
                      Por empresa
                    </TabsTrigger>
                    <TabsTrigger value="rubrica" className="text-xs px-2.5">
                      Por rubrica
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold">Origem</TableHead>
                    {visao === "pessoa" && (
                      <>
                        <TableHead className="text-xs font-semibold">Cliente</TableHead>
                        <TableHead className="text-xs font-semibold">CPF</TableHead>
                        <TableHead className="text-xs font-semibold">Empresa</TableHead>
                        <TableHead className="text-xs font-semibold">Temas Abrangidos</TableHead>
                        <TableHead className="text-center text-xs font-semibold">Meses</TableHead>
                      </>
                    )}
                    {visao === "tema" && <TableHead className="text-xs font-semibold">Tema</TableHead>}
                    {visao === "empresa" && (
                      <>
                        <TableHead className="text-xs font-semibold">Empresa/modelo</TableHead>
                        <TableHead className="text-xs font-semibold">Pessoas</TableHead>
                      </>
                    )}
                    {visao === "rubrica" && (
                      <>
                        <TableHead className="text-xs font-semibold">Código</TableHead>
                        <TableHead className="text-xs font-semibold">Descrição</TableHead>
                        <TableHead className="text-xs font-semibold">Tipo</TableHead>
                        <TableHead className="text-xs font-semibold">Empresa/modelo</TableHead>
                        <TableHead className="text-xs font-semibold">Filtro</TableHead>
                      </>
                    )}
                    <TableHead className="text-right text-xs font-semibold">Proventos</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Descontos</TableHead>
                    {visao === "pessoa" && (
                      <TableHead className="text-right text-xs font-semibold">Saldo Líquido</TableHead>
                    )}
                    <TableHead className="text-center text-xs font-semibold">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!consultou ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-16 text-center text-sm text-muted-foreground">
                        <Filter className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                        <p className="font-semibold text-foreground text-sm">Aguardando definição de filtros</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                          Selecione os temas jurídicos ou preencha os filtros desejados acima e clique em{" "}
                          <strong className="text-foreground font-medium">Filtrar</strong> para realizar a consulta consolidada.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : carregando ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
                        Carregando registros apurados…
                      </TableCell>
                    </TableRow>
                  ) : linhasFiltradasLocal.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                        Nenhum registro encontrado para os filtros e critérios informados.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {consultou &&
                    !carregando &&
                    linhasFiltradasLocal.map((l, i) => {
                      const saldoLiquido = num(l.proventos) - num(l.descontos);
                      const viavel = acaoViavel(saldoLiquido);
                      const temasLista = (Array.isArray(l.temas) ? l.temas : []) as string[];

                      return (
                        <TableRow
                          key={`${l.origem}-${i}-${txt(l.pessoa_id) ?? txt(l.tema) ?? txt(l.empresa_id) ?? txt(l.codigo)}`}
                          className={visao === "pessoa" ? "cursor-pointer hover:bg-muted/40 transition-colors" : undefined}
                          onClick={
                            visao === "pessoa"
                              ? () => abrirPessoa(txt(l.pessoa_id) ?? "", rotuloPessoa(txt(l.pessoa_nome)), l.origem)
                              : undefined
                          }
                        >
                          <TableCell>
                            <Badge variant="outline" className="text-[11px] font-normal">
                              {ROTULO_ORIGEM[l.origem]}
                            </Badge>
                          </TableCell>

                          {visao === "pessoa" && (
                            <>
                              <TableCell>
                                <div className="font-semibold text-foreground text-sm">
                                  {rotuloPessoa(txt(l.pessoa_nome))}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {rotuloIdentificacao(txt(l.pessoa_identificacao))}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-foreground">
                                {txt(l.pessoa_cpf) ?? "—"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs font-normal">
                                  {rotuloEmpresaModelo(txt(l.empresa))}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {temasLista.length === 0 && (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                  {temasLista.map((temaNome) => (
                                    <Badge
                                      key={temaNome}
                                      variant="outline"
                                      className="cursor-pointer border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100 transition-colors text-[11px]"
                                      title="Clique para totalizar esta ação especificamente"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        abrirPessoa(
                                          txt(l.pessoa_id) ?? "",
                                          rotuloPessoa(txt(l.pessoa_nome)),
                                          l.origem,
                                          temaNome,
                                        );
                                      }}
                                    >
                                      {temaNome} 🔍
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-center font-semibold text-xs">
                                {num(l.competencias) || 1}
                              </TableCell>
                            </>
                          )}

                          {visao === "tema" && (
                            <TableCell className="font-semibold text-foreground">{txt(l.tema)}</TableCell>
                          )}

                          {visao === "empresa" && (
                            <>
                              <TableCell className="font-medium text-foreground">
                                {rotuloEmpresaModelo(txt(l.empresa_nome))}
                              </TableCell>
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
                                      empresa: txt(l.empresa_id) ?? txt(l.empresa),
                                    })
                                  }
                                >
                                  Filtrar
                                </Button>
                              </TableCell>
                            </>
                          )}

                          <TableCell className="text-right font-mono font-medium text-emerald-600 text-xs">
                            {formatarMoeda(num(l.proventos))}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium text-destructive text-xs">
                            {formatarMoeda(num(l.descontos))}
                          </TableCell>

                          {visao === "pessoa" && (
                            <TableCell className="text-right font-mono font-bold text-foreground text-xs">
                              <span className={viavel ? "text-foreground" : "text-muted-foreground"}>
                                {formatarMoeda(saldoLiquido)}
                              </span>
                            </TableCell>
                          )}

                          <TableCell className="text-center">
                            {visao === "pessoa" ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-7 text-xs px-2.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirPessoa(txt(l.pessoa_id) ?? "", rotuloPessoa(txt(l.pessoa_nome)), l.origem);
                                }}
                              >
                                Ver Holerites
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">{num(l.itens)} itens</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>

            {/* CONTROLE DE PAGINAÇÃO */}
            {visao !== "tema" && (
              <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
                <span>
                  Página {pagina + 1} — exibindo até {PAGINA} linhas por fonte
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagina === 0 || carregando}
                    onClick={() => setPagina((p) => Math.max(p - 1, 0))}
                    className="h-8 text-xs"
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={carregando || !proximaDisponivel}
                    onClick={() => setPagina((p) => p + 1)}
                    className="h-8 text-xs"
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4. MODAL DIALOG: LANÇAMENTOS E TOTALIZAÇÃO DA AÇÃO POR CLIENTE */}
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
          <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between gap-2 pr-4">
                <div>
                  <DialogTitle className="text-lg font-bold text-foreground">
                    Detalhamento Canônico — {pessoaAberta?.nome}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Holerites e rubricas estruturadas extraídas dos contracheques originais
                  </DialogDescription>
                </div>
                {pessoaAberta && <Badge variant="outline">{ROTULO_ORIGEM[pessoaAberta.origem]}</Badge>}
              </div>
            </DialogHeader>

            {/* BANNER DE TOTALIZAÇÃO DO TEMA CLICADO (RESPOSTA DIRETA À PERGUNTA DE ANA) */}
            {resumoTemaDestaque && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mt-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-primary text-sm">
                        Totalização da Ação: {resumoTemaDestaque.nomeTema}
                      </span>
                      <Badge
                        variant={resumoTemaDestaque.viavel ? "default" : "secondary"}
                        className={resumoTemaDestaque.viavel ? "bg-emerald-600 text-white" : ""}
                      >
                        {resumoTemaDestaque.viavel ? "VIÁVEL (> R$ 15.000)" : "ABAIXO DO LIMITE"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Apurado em {resumoTemaDestaque.meses} competências · Média de{" "}
                      {formatarMoeda(resumoTemaDestaque.mediaMensal)}/mês
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <div className="text-xs text-muted-foreground">Valor Total do Tema</div>
                    <div className="text-xl font-bold font-mono text-foreground">
                      {formatarMoeda(resumoTemaDestaque.saldo)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {carregandoLancamentos ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
                Carregando lançamentos canônicos…
              </div>
            ) : lancamentos.estado !== "ok" ? (
              <p className="py-8 text-center text-destructive text-sm">
                Não foi possível carregar os lançamentos desta pessoa. {lancamentos.motivo ?? ""}
              </p>
            ) : lancamentos.dados.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                Nenhum lançamento registrado para os filtros aplicados.
              </p>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Competência</TableHead>
                        <TableHead className="text-xs">Código</TableHead>
                        <TableHead className="text-xs">Descrição</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-right text-xs">Valor</TableHead>
                        <TableHead className="text-center text-xs">Caso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lancamentosPaginados.map((l, i) => (
                        <TableRow key={txt(l.item_id) ?? i}>
                          <TableCell className="font-mono text-xs">{txt(l.competencia) ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{txt(l.codigo) ?? "—"}</TableCell>
                          <TableCell className="text-xs font-medium">{txt(l.descricao) ?? "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={l.tipo === "provento" ? "outline" : "secondary"}
                              className={`text-[10px] ${
                                l.tipo === "provento" ? "text-emerald-700 border-emerald-300" : "text-destructive"
                              }`}
                            >
                              {txt(l.tipo) ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {formatarMoeda(num(l.valor))}
                          </TableCell>
                          <TableCell className="text-center">
                            {txt(l.caso_id) ? (
                              <Link
                                className="text-xs text-primary underline hover:text-primary/80"
                                to={`/casos/${txt(l.caso_id)}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Abrir caso
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span>
                    Página {paginaLancamentos + 1} de{" "}
                    {Math.max(Math.ceil(lancamentos.dados.length / LANCAMENTOS_POR_PAGINA), 1)} —{" "}
                    {lancamentos.dados.length} lançamentos deduplicados apurados
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={paginaLancamentos === 0 || carregandoLancamentos}
                      onClick={() => irParaPaginaLancamentos(Math.max(paginaLancamentos - 1, 0))}
                      className="h-8 text-xs"
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={carregandoLancamentos || !proximaLancamentos}
                      onClick={() => irParaPaginaLancamentos(paginaLancamentos + 1)}
                      className="h-8 text-xs"
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
