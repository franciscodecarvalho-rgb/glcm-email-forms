import React, { useMemo, useState } from "react";
import {
  Download,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldAlert,
  Users,
  Scale,
  FileSpreadsheet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AMOSTRAS_CLIENTES,
  FAIXAS_ANUENIO,
  FAIXAS_CONSIGNADO,
  NICHOS_COMPLEMENTARES,
  NOVAS_TESES,
  OndaExpansao,
  RADAR_VERMELHO,
  SINAIS_ACESSORIOS,
  TeseExpansao,
} from "@/data/radarExpansaoData";

export function RadarExpansaoView() {
  const [ondaAtiva, setOndaAtiva] = useState<"todas" | OndaExpansao>("todas");
  const [amostrasAbertas, setAmostrasAbertas] = useState<Record<string, boolean>>({});

  const toggleAmostra = (id: string) => {
    setAmostrasAbertas((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const todasAmostrasAbertas = useMemo(() => {
    return NOVAS_TESES.every((t) => amostrasAbertas[t.id]);
  }, [amostrasAbertas]);

  const toggleTodasAmostras = () => {
    const novoEstado = !todasAmostrasAbertas;
    const proximo: Record<string, boolean> = {};
    NOVAS_TESES.forEach((t) => {
      proximo[t.id] = novoEstado;
    });
    setAmostrasAbertas(proximo);
  };

  const exportarCsvAmostra = (tese: TeseExpansao) => {
    const lista = AMOSTRAS_CLIENTES[tese.id] || [];
    if (!lista.length) return;

    const cabecalho = [
      "Tese",
      "Nome",
      "CPF",
      "Matricula",
      "Empresa",
      "Periodo",
      "Base_Apurada",
      "Potencial_Individual",
      "Criterio_Objetivo",
    ];

    const linhas = lista.map((c) => [
      `"${tese.titulo.replace(/"/g, '""')}"`,
      `"${c.nome.replace(/"/g, '""')}"`,
      `"${c.cpf}"`,
      `"${c.matricula}"`,
      `"${c.empresa.replace(/"/g, '""')}"`,
      `"${c.periodo.replace(/"/g, '""')}"`,
      `"${c.base.replace(/"/g, '""')}"`,
      `"${c.potencial.replace(/"/g, '""')}"`,
      `"${c.motivo.replace(/"/g, '""')}"`,
    ]);

    const conteudo = "\uFEFF" + [cabecalho.join(";"), ...linhas.map((l) => l.join(";"))].join("\r\n");
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Amostra_Acervo_${tese.id}_5_Clientes.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportarTodasAmostrasCsv = () => {
    const cabecalho = [
      "Tese_ID",
      "Tese_Titulo",
      "Nome",
      "CPF",
      "Matricula",
      "Empresa",
      "Periodo",
      "Base_Apurada",
      "Potencial_Individual",
      "Criterio_Objetivo",
    ];

    const linhas: string[] = [];
    NOVAS_TESES.forEach((tese) => {
      const lista = AMOSTRAS_CLIENTES[tese.id] || [];
      lista.forEach((c) => {
        linhas.push(
          [
            `"${tese.id}"`,
            `"${tese.titulo.replace(/"/g, '""')}"`,
            `"${c.nome.replace(/"/g, '""')}"`,
            `"${c.cpf}"`,
            `"${c.matricula}"`,
            `"${c.empresa.replace(/"/g, '""')}"`,
            `"${c.periodo.replace(/"/g, '""')}"`,
            `"${c.base.replace(/"/g, '""')}"`,
            `"${c.potencial.replace(/"/g, '""')}"`,
            `"${c.motivo.replace(/"/g, '""')}"`,
          ].join(";")
        );
      });
    });

    const conteudo = "\uFEFF" + [cabecalho.join(";"), ...linhas].join("\r\n");
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Amostra_Completa_40_Clientes_8_Teses.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tesesFiltradas = useMemo(() => {
    if (ondaAtiva === "todas") return NOVAS_TESES;
    return NOVAS_TESES.filter((t) => t.onda === ondaAtiva);
  }, [ondaAtiva]);

  return (
    <div className="space-y-8">
      {/* 4 CARDS DE INDICADORES PRINCIPAIS */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Base Pronta &amp; Auditada
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">1.022</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Clientes ativos nos últimos 5 anos (1.163 no histórico consolidado).
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Novas Teses Fora do Radar
            </CardTitle>
            <Sparkles className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">8 Teses + 5 Indicadores</div>
            <p className="mt-1 text-xs text-muted-foreground">
              3 ondas de monetização imediata, nichos captados e consumo.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Potencial Mapeado
            </CardTitle>
            <Scale className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">R$ 28,75M – R$ 53,43M</div>
            <p className="mt-1 text-xs font-medium text-emerald-700">
              Honorários contratuais (30%): R$ 8,63M a R$ 16,03M.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Radar de Risco
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-red-700">7 Teses Barradas</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Blindagem contra precedentes superados pelos tribunais (2024–2026).
            </p>
          </CardContent>
        </Card>
      </section>

      {/* FILTRO DE ONDAS E AÇÕES DAS AMOSTRAS */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Catálogo das 8 Novas Teses com Amostras Auditadas
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cada card possui auditoria quantitativa, fundamentação jurídica e gaveta com 5 clientes reais da base.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTodasAmostras}
            className="h-8 gap-1.5 text-xs bg-background"
          >
            <Users className="h-3.5 w-3.5 text-primary" />
            {todasAmostrasAbertas ? "Recolher Amostras" : "Ver Todas Amostras (40)"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportarTodasAmostrasCsv}
            className="h-8 gap-1.5 text-xs bg-background"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600" />
            Exportar 40 Casos (CSV)
          </Button>

          <div className="inline-flex rounded-lg border bg-muted p-1">
            <button
              type="button"
              onClick={() => setOndaAtiva("todas")}
              className={`rounded-md px-3 py-1.5 text-xs transition-all ${
                ondaAtiva === "todas"
                  ? "bg-background font-semibold text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground font-medium"
              }`}
            >
              Todas (8)
            </button>
            <button
              type="button"
              onClick={() => setOndaAtiva("1")}
              className={`rounded-md px-3 py-1.5 text-xs transition-all ${
                ondaAtiva === "1"
                  ? "bg-background font-semibold text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground font-medium"
              }`}
            >
              Onda 1 · Monetização (4)
            </button>
            <button
              type="button"
              onClick={() => setOndaAtiva("2")}
              className={`rounded-md px-3 py-1.5 text-xs transition-all ${
                ondaAtiva === "2"
                  ? "bg-background font-semibold text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground font-medium"
              }`}
            >
              Onda 2 · Nichos (3)
            </button>
            <button
              type="button"
              onClick={() => setOndaAtiva("3")}
              className={`rounded-md px-3 py-1.5 text-xs transition-all ${
                ondaAtiva === "3"
                  ? "bg-background font-semibold text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground font-medium"
              }`}
            >
              Onda 3 · Consumo (1)
            </button>
          </div>
        </div>
      </div>

      {/* LISTA DAS 8 TESES COM GAVETAS DE 5 CLIENTES */}
      <div className="space-y-4">
        {tesesFiltradas.map((tese) => {
          const aberta = !!amostrasAbertas[tese.id];
          const amostras = AMOSTRAS_CLIENTES[tese.id] || [];

          return (
            <Card
              key={tese.id}
              className="border border-border/60 hover:border-border transition-all duration-200 overflow-hidden shadow-xs"
            >
              {/* CABEÇALHO DO CARD */}
              <div className="border-b bg-muted/20 px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {tese.ondaLabel}
                    </span>
                    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${tese.areaColor}`}>
                      {tese.area}
                    </span>
                    <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {tese.precedente}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-foreground tracking-tight">
                    {tese.titulo}
                  </h3>
                </div>

                {/* BOTÕES DE AÇÃO DA TESE */}
                <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAmostra(tese.id)}
                    className="h-8 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/5 bg-background"
                  >
                    <Users className="h-3.5 w-3.5" />
                    {aberta ? "Recolher Amostra" : "Ver 5 Clientes"}
                    {aberta ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportarCsvAmostra(tese)}
                    className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Download className="h-3 w-3 text-emerald-600" />
                    CSV
                  </Button>
                </div>
              </div>

              {/* CONTEÚDO EM 3 COLUNAS */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                {/* Coluna 1 */}
                <div className="space-y-2 border-r-0 md:border-r md:pr-6 border-border/40">
                  <div className="flex items-center justify-between font-semibold text-foreground">
                    <span>Público Apto na Base</span>
                    <Badge variant="outline" className="text-[10px] bg-background">
                      {tese.id.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2.5 space-y-1">
                    <div className="font-semibold text-foreground text-xs">{tese.aptosHeadline}</div>
                    <div className="text-[11px] text-muted-foreground">{tese.aptosSub}</div>
                  </div>
                  <p className="text-muted-foreground leading-relaxed text-[11px]">
                    {tese.motivo}
                  </p>
                </div>

                {/* Coluna 2 */}
                <div className="space-y-2 border-r-0 md:border-r md:pr-6 border-border/40">
                  <span className="font-semibold text-foreground">Base em Contracheques &amp; Cálculo</span>
                  <div className="rounded-md border bg-muted/30 p-2.5 text-[11px] leading-relaxed text-foreground">
                    {tese.baseContracheques}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <strong>Metodologia de Estimativa:</strong> {tese.formulaCalc}
                  </p>
                  <div className="rounded border border-primary/20 bg-primary/5 p-2 text-[11px] text-primary">
                    <strong>Documentação de instrução:</strong> {tese.docComplementar}
                  </div>
                </div>

                {/* Coluna 3 */}
                <div className="space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="font-semibold text-foreground">Potencial Financeiro Mapeado</span>
                    <div className="rounded-md border bg-emerald-50/50 p-3 space-y-1">
                      <div className="text-lg font-bold text-emerald-800">
                        R$ {tese.valorMinM.toFixed(2).replace(".", ",")}M a R$ {tese.valorMaxM.toFixed(2).replace(".", ",")}M
                      </div>
                      <div className="text-xs font-semibold text-emerald-900">
                        Honorários (30%): {tese.honorariosStr}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleAmostra(tese.id)}
                      className="w-full justify-between text-xs h-8 bg-background"
                    >
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        Amostra Estática (5 Casos Reais)
                      </span>
                      {aberta ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => exportarCsvAmostra(tese)}
                      className="w-full justify-start text-[11px] h-7 text-muted-foreground hover:text-foreground"
                    >
                      <Download className="h-3 w-3 mr-1.5 text-emerald-600" />
                      Baixar 5 casos em planilha (CSV)
                    </Button>
                  </div>
                </div>
              </div>

              {/* GAVETA EXPANSÍVEL: 5 CLIENTES REAIS AUDITADOS */}
              {aberta ? (
                <div className="border-t bg-muted/10 p-5 space-y-3 transition-all animate-in fade-in-50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        Amostra de 5 Clientes Auditados na Base ({tese.titulo.split(".")[1]?.split("(")[0]?.trim() || tese.id})
                      </span>
                      <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-800">
                        CPFs Validados
                      </Badge>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportarCsvAmostra(tese)}
                      className="h-7 gap-1 text-[11px] bg-background self-start sm:self-auto"
                    >
                      <Download className="h-3 w-3 text-emerald-600" />
                      Exportar Amostra (CSV)
                    </Button>
                  </div>

                  <div className="rounded-lg border bg-background overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 text-[11px]">
                            <TableHead className="py-2 px-3 font-semibold">Cliente &amp; Documento</TableHead>
                            <TableHead className="py-2 px-3 font-semibold">Empresa &amp; Período Auditado</TableHead>
                            <TableHead className="py-2 px-3 font-semibold">Base Apurada em Folha</TableHead>
                            <TableHead className="py-2 px-3 font-semibold">Potencial Estimado</TableHead>
                            <TableHead className="py-2 px-3 font-semibold">Critério Objetivo de Enquadramento</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {amostras.map((c, idx) => (
                            <TableRow key={idx} className="hover:bg-muted/30 text-xs">
                              <TableCell className="py-2.5 px-3 font-medium">
                                <div className="font-semibold text-foreground">{c.nome}</div>
                                <div className="font-mono text-[11px] text-muted-foreground">
                                  CPF: {c.cpf} · Matr.: {c.matricula}
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 px-3">
                                <div className="font-medium text-foreground">{c.empresa}</div>
                                <div className="text-[11px] text-muted-foreground">{c.periodo}</div>
                              </TableCell>
                              <TableCell className="py-2.5 px-3 font-mono text-[11px] font-semibold text-foreground">
                                {c.base}
                              </TableCell>
                              <TableCell className="py-2.5 px-3 font-semibold text-emerald-700">
                                {c.potencial}
                              </TableCell>
                              <TableCell className="py-2.5 px-3 text-[11px] text-muted-foreground max-w-xs">
                                {c.motivo}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {/* SEÇÃO 3: DADOS ADICIONAIS DESCOBERTOS NA BASE */}
      <section className="rounded-xl border border-border/60 bg-card p-6 shadow-sm space-y-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Dados Adicionais Descobertos na Base
            </h2>
            <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary text-[11px]">
              5 Pacotes Inéditos
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            Cruzamentos matemáticos extraídos diretamente dos contracheques que destravam triagem instantânea sem depender de novos documentos iniciais do cliente, além de nichos já cadastrados fora do eixo Petrobras/Braskem.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Bloco 1: Antiguidade */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">1. Filtro Automático por Antiguidade</span>
              <Badge variant="outline" className="text-[10px] bg-background">Triagem em Folha</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              A apuração mensal da gratificação por tempo de serviço mede diretamente os anos de vínculo de cada profissional:
            </p>
            <div className="space-y-2 text-xs">
              {FAIXAS_ANUENIO.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded border bg-card px-3 py-2">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-foreground">{f.rotulo}</div>
                    <div className="text-[10px] text-muted-foreground">{f.criterio}</div>
                  </div>
                  <div className="text-right font-mono font-bold text-xs">
                    <span className={f.destaque ? "text-primary" : "text-foreground"}>
                      {f.historico}
                    </span>
                    <div className="text-[10px] text-muted-foreground">{f.ativos}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bloco 2: Consignado */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">2. Termômetro Mensal de Consignado</span>
              <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-800">
                R$ 3,07M Excesso
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Medição mês a mês do comprometimento da renda líquida disponível antes do empréstimo (de R$ 38,73M descontados):
            </p>
            <div className="space-y-2 text-xs">
              {FAIXAS_CONSIGNADO.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded border bg-card px-3 py-2">
                  <span className="font-medium text-foreground">{f.rotulo}</span>
                  <span className={`font-mono font-bold text-xs ${f.classe}`}>{f.valor}</span>
                </div>
              ))}
              <div className="rounded border border-emerald-200 bg-emerald-50/50 p-2.5 text-[11px] text-emerald-900 leading-relaxed">
                Entidade fechada 0888 concentra <strong>R$ 28,97M</strong> (481 ativos); previdência privada 2225 soma <strong>R$ 2,77M</strong> (106 ativos); instituição financeira 2202 soma <strong>R$ 2,12M</strong> (56 ativos).
              </div>
            </div>
          </div>

          {/* Bloco 3: Sinais Acessórios */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">3. Sinais Acessórios de Triagem</span>
              <Badge variant="outline" className="text-[10px] border-amber-200 bg-amber-50 text-amber-800">
                Pedido Secundário
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Dois achados volumosos em folha que agregam na conferência fiscal ou como pedido cumulado em ações trabalhistas:
            </p>
            <div className="space-y-2.5 text-xs">
              {SINAIS_ACESSORIOS.map((s, i) => (
                <div key={i} className="rounded border bg-card p-3 space-y-1">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-foreground">{s.titulo}</span>
                    <span className="font-mono text-primary text-[11px]">{s.totalPessoas}</span>
                  </div>
                  <div className="font-mono text-[11px] font-semibold text-foreground">{s.valor}</div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{s.descricao}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabela de Nichos Complementares */}
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/30 px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-foreground">
                4. Nichos Complementares já Presentes na Carteira (Fora do Eixo Central)
              </span>
              <p className="text-[11px] text-muted-foreground">
                Clientes com contracheques já conciliados aguardando unificação de modelos e estratégias específicas.
              </p>
            </div>
            <Badge variant="outline" className="text-[11px] border-primary/20 bg-primary/10 text-primary">
              Carteira em Acervo
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 text-[11px]">
                  <TableHead className="py-2.5 px-4 font-semibold">Grupo / Órgão</TableHead>
                  <TableHead className="py-2.5 px-4 font-semibold text-right">Cadastros</TableHead>
                  <TableHead className="py-2.5 px-4 font-semibold text-right">Contracheques</TableHead>
                  <TableHead className="py-2.5 px-4 font-semibold text-right">Proventos Levantados</TableHead>
                  <TableHead className="py-2.5 px-4 font-semibold">Oportunidade Jurídica Vinculada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {NICHOS_COMPLEMENTARES.map((n, i) => (
                  <TableRow key={i} className="hover:bg-muted/30 text-xs">
                    <TableCell className="py-2.5 px-4 font-medium text-foreground">{n.grupo}</TableCell>
                    <TableCell className="py-2.5 px-4 text-right font-mono font-semibold">{n.cadastros}</TableCell>
                    <TableCell className="py-2.5 px-4 text-right font-mono">{n.contracheques}</TableCell>
                    <TableCell className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-700">
                      {n.proventos}
                    </TableCell>
                    <TableCell className="py-2.5 px-4 text-muted-foreground text-[11px] max-w-md">
                      {n.oportunidade}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      {/* SEÇÃO 4: RADAR VERMELHO (TESES SUPERADAS) */}
      <section className="rounded-xl border border-red-200 bg-card shadow-sm overflow-hidden">
        <div className="border-b border-red-200 bg-red-50/50 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-red-600" />
              <h2 className="text-base font-semibold text-red-950">
                Radar Vermelho — 7 Teses Superadas que a GLCM Deve Evitar (2024–2026)
              </h2>
            </div>
            <p className="text-xs text-red-800 mt-0.5">
              Blindagem contra risco de sucumbência, devolução de honorários ou desperdício de esforço operacional sobre temas já pacificados contra o trabalhador.
            </p>
          </div>
          <Badge variant="outline" className="border-red-300 bg-white text-red-700 text-[11px] self-start sm:self-auto">
            Evitar Novas Distribuições
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 text-[11px]">
                <TableHead className="py-3 px-5 font-semibold">Tese Tentadora (Evitar)</TableHead>
                <TableHead className="py-3 px-5 font-semibold">Reviravolta Vinculante (2024–2026)</TableHead>
                <TableHead className="py-3 px-5 font-semibold">Diretriz Prática para o Escritório</TableHead>
                <TableHead className="py-3 px-5 font-semibold text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RADAR_VERMELHO.map((r, i) => (
                <TableRow key={i} className="hover:bg-muted/30 text-xs">
                  <TableCell className="py-3 px-5 font-semibold text-foreground">{r.tese}</TableCell>
                  <TableCell className="py-3 px-5 text-muted-foreground text-[11px]">{r.reviravolta}</TableCell>
                  <TableCell className="py-3 px-5 text-muted-foreground text-[11px]">{r.diretriz}</TableCell>
                  <TableCell className="py-3 px-5 text-center">
                    <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${r.badgeClasse}`}>
                      {r.acaoBadge}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
