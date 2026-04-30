
-- Casos
CREATE TABLE public.casos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'novo',
  origem TEXT NOT NULL DEFAULT 'manual',
  nome_cliente TEXT,
  cpf TEXT,
  rg TEXT,
  endereco JSONB,
  contracheques JSONB DEFAULT '[]'::jsonb,
  numero_pasta TEXT,
  documentos_gerados JSONB DEFAULT '[]'::jsonb,
  erro_processamento TEXT
);

CREATE INDEX idx_casos_status ON public.casos(status);
CREATE INDEX idx_casos_created_at ON public.casos(created_at DESC);

-- Arquivos
CREATE TABLE public.arquivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  caso_id UUID NOT NULL REFERENCES public.casos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT,
  storage_path TEXT NOT NULL,
  mime_type TEXT
);

CREATE INDEX idx_arquivos_caso_id ON public.arquivos(caso_id);

-- Templates
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  storage_path TEXT NOT NULL
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_casos_updated_at BEFORE UPDATE ON public.casos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_templates_updated_at BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.casos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read casos" ON public.casos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert casos" ON public.casos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update casos" ON public.casos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete casos" ON public.casos FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth read arquivos" ON public.arquivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert arquivos" ON public.arquivos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update arquivos" ON public.arquivos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete arquivos" ON public.arquivos FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth read templates" ON public.templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert templates" ON public.templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update templates" ON public.templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete templates" ON public.templates FOR DELETE TO authenticated USING (true);

-- Realtime
ALTER TABLE public.casos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.casos;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('casos-arquivos', 'casos-arquivos', false),
  ('casos-documentos', 'casos-documentos', false),
  ('templates', 'templates', false);

-- Storage policies (authenticated full access)
CREATE POLICY "auth read casos-arquivos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'casos-arquivos');
CREATE POLICY "auth write casos-arquivos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'casos-arquivos');
CREATE POLICY "auth update casos-arquivos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'casos-arquivos');
CREATE POLICY "auth delete casos-arquivos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'casos-arquivos');

CREATE POLICY "auth read casos-documentos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'casos-documentos');
CREATE POLICY "auth write casos-documentos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'casos-documentos');
CREATE POLICY "auth delete casos-documentos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'casos-documentos');

CREATE POLICY "auth read templates" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'templates');
CREATE POLICY "auth write templates" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'templates');
CREATE POLICY "auth update templates" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'templates');
CREATE POLICY "auth delete templates" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'templates');
