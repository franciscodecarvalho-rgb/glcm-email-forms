CREATE TABLE IF NOT EXISTS public.contracheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id uuid NOT NULL REFERENCES public.casos(id) ON DELETE CASCADE,
  competencia text,
  salario_base numeric,
  total_proventos numeric,
  total_descontos numeric,
  liquido numeric,
  arquivo_origem text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracheques_caso_id ON public.contracheques(caso_id);

CREATE TABLE IF NOT EXISTS public.itens_contracheque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contracheque_id uuid NOT NULL REFERENCES public.contracheques(id) ON DELETE CASCADE,
  codigo text,
  descricao text,
  valor numeric,
  tipo text,
  familia_hra text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itens_contracheque_contracheque_id ON public.itens_contracheque(contracheque_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracheques TO authenticated;
GRANT ALL ON public.contracheques TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.itens_contracheque TO authenticated;
GRANT ALL ON public.itens_contracheque TO service_role;

ALTER TABLE public.contracheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_contracheque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read contracheques"   ON public.contracheques FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert contracheques" ON public.contracheques FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update contracheques" ON public.contracheques FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete contracheques" ON public.contracheques FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth read itens_contracheque"   ON public.itens_contracheque FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert itens_contracheque" ON public.itens_contracheque FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update itens_contracheque" ON public.itens_contracheque FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete itens_contracheque" ON public.itens_contracheque FOR DELETE TO authenticated USING (true);