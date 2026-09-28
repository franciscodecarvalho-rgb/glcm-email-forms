-- Normalizador de termos: minúsculas, sem acentos de espaçamento duplicado
CREATE OR REPLACE FUNCTION public.normalizar_termo_tema(_termo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(lower(coalesce(_termo, '')), '\s+', ' ', 'g'))
$$;

CREATE TABLE public.temas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX temas_nome_normalizado_uidx
  ON public.temas (public.normalizar_termo_tema(nome));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.temas TO authenticated;
GRANT ALL ON public.temas TO service_role;

ALTER TABLE public.temas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read temas" ON public.temas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins insert temas" ON public.temas
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update temas" ON public.temas
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete temas" ON public.temas
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_temas_updated_at
  BEFORE UPDATE ON public.temas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tema_termos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tema_id uuid NOT NULL REFERENCES public.temas(id) ON DELETE CASCADE,
  termo text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tema_termos_tema_termo_uidx
  ON public.tema_termos (tema_id, public.normalizar_termo_tema(termo));
CREATE INDEX tema_termos_tema_id_idx ON public.tema_termos (tema_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tema_termos TO authenticated;
GRANT ALL ON public.tema_termos TO service_role;

ALTER TABLE public.tema_termos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read tema_termos" ON public.tema_termos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins insert tema_termos" ON public.tema_termos
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update tema_termos" ON public.tema_termos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete tema_termos" ON public.tema_termos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_tema_termos_updated_at
  BEFORE UPDATE ON public.tema_termos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();