-- lotes_contracheques: plano de processamento em lotes de páginas do PDF
-- unificado de contracheques (process-contracheques-pdf). Cada lote cobre um
-- intervalo de páginas de um arquivo; ao concluir, o lote grava seu resultado
-- (contracheques fechados já persistidos em `contracheques`/`itens_contracheque`
-- e, se houver, o contracheque ainda "aberto" que pode continuar no próximo
-- lote, em `estado_saida`). Isso permite reprocessar só os lotes pendentes/com
-- erro numa nova chamada, sem perder o que já foi gravado.
CREATE TABLE IF NOT EXISTS public.lotes_contracheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id uuid NOT NULL REFERENCES public.casos(id) ON DELETE CASCADE,
  arquivo_id uuid NOT NULL REFERENCES public.arquivos(id) ON DELETE CASCADE,
  ordem integer NOT NULL,
  pagina_inicio integer NOT NULL,
  pagina_fim integer NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  estado_saida jsonb,
  erro text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lotes_contracheques_caso ON public.lotes_contracheques (caso_id);
CREATE INDEX IF NOT EXISTS idx_lotes_contracheques_arquivo ON public.lotes_contracheques (arquivo_id);

ALTER TABLE public.lotes_contracheques ENABLE ROW LEVEL SECURITY;

-- Só a service role escreve (Edge Function); RLS nega insert/update/delete a
-- anon/authenticated por não haver policy para essas operações.
DROP POLICY IF EXISTS "auth read lotes_contracheques" ON public.lotes_contracheques;
CREATE POLICY "auth read lotes_contracheques" ON public.lotes_contracheques
  FOR SELECT TO authenticated USING (true);
