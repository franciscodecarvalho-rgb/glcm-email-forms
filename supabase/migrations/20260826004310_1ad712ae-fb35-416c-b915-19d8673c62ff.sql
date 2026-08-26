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

GRANT SELECT ON public.lotes_contracheques TO authenticated;
GRANT ALL ON public.lotes_contracheques TO service_role;

CREATE INDEX IF NOT EXISTS idx_lotes_contracheques_caso ON public.lotes_contracheques (caso_id);
CREATE INDEX IF NOT EXISTS idx_lotes_contracheques_arquivo ON public.lotes_contracheques (arquivo_id);

ALTER TABLE public.lotes_contracheques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read lotes_contracheques" ON public.lotes_contracheques;
CREATE POLICY "auth read lotes_contracheques" ON public.lotes_contracheques
  FOR SELECT TO authenticated USING (true);