import { Sparkles, Printer, Radar, FileSpreadsheet, ShieldAlert, SlidersHorizontal, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadarExpansaoView } from "@/components/radar/RadarExpansaoView";

export default function ValidacaoTeses() {
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader />

      <main className="container max-w-7xl py-8 space-y-6">
        {/* CABEÇALHO DA PÁGINA */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Validação Teses</h1>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
                Datalake 2.0
              </Badge>
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Expansão de Portfólio
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Radar estratégico de <strong>8 novas teses fora do portfólio atual</strong>, cruzamento com 1.022 clientes ativos e amostra auditada de 40 casos reais para deliberação da sociedade.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto print:hidden">
            <Button variant="outline" size="sm" asChild className="h-9 text-xs gap-1.5 bg-background">
              <Link to="/ValidacaoRadar">
                <Radar className="h-3.5 w-3.5 text-primary" />
                Validação Radar
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 text-muted-foreground" />
              Salvar em PDF
            </Button>
          </div>
        </div>

        {/* COMPONENTE PRINCIPAL DO RADAR DE EXPANSÃO */}
        <RadarExpansaoView />
      </main>

      <footer className="border-t bg-card py-5 text-center text-xs text-muted-foreground mt-12 print:hidden">
        Sistema Jurídico &middot; GLCM Advocacia &middot; Módulo Validação Teses &amp; Expansão de Portfólio
      </footer>
    </div>
  );
}

