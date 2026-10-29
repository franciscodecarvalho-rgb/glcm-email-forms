-- =====================================================================
-- Migration: Motor de Cadastro e Gestão de Temas
-- Permite aos usuários autenticados da banca criar, atualizar e excluir
-- temas com seus respectivos termos para consulta e filtro no DataLake 2.0.
-- Aplicação: Banco principal do sistema GLCM (kaopnizsbkzxqdzmocwa / Lovable)
-- =====================================================================

-- 1. Função de normalização de termos para busca e unicidade
CREATE OR REPLACE FUNCTION public.normalizar_termo_tema(_termo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(lower(coalesce(_termo, '')), '\s+', ' ', 'g'))
$$;

-- 2. Função utilitária para updated_at automático
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. Garantir existência da tabela public.temas
CREATE TABLE IF NOT EXISTS public.temas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS temas_nome_normalizado_uidx
  ON public.temas (public.normalizar_termo_tema(nome));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.temas TO authenticated;
GRANT ALL ON public.temas TO service_role;
ALTER TABLE public.temas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_temas_updated_at'
  ) THEN
    CREATE TRIGGER trg_temas_updated_at
      BEFORE UPDATE ON public.temas
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 4. Garantir existência da tabela public.tema_termos
CREATE TABLE IF NOT EXISTS public.tema_termos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tema_id uuid NOT NULL REFERENCES public.temas(id) ON DELETE CASCADE,
  termo text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tema_termos_tema_termo_uidx
  ON public.tema_termos (tema_id, public.normalizar_termo_tema(termo));
CREATE INDEX IF NOT EXISTS tema_termos_tema_id_idx ON public.tema_termos (tema_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tema_termos TO authenticated;
GRANT ALL ON public.tema_termos TO service_role;
ALTER TABLE public.tema_termos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tema_termos_updated_at'
  ) THEN
    CREATE TRIGGER trg_tema_termos_updated_at
      BEFORE UPDATE ON public.tema_termos
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 5. Função atômica para salvar ou atualizar tema (SECURITY DEFINER, sem trava de admin)
CREATE OR REPLACE FUNCTION public.salvar_tema(
  p_nome text,
  p_termos text[],
  p_descricao text DEFAULT NULL,
  p_ativo boolean DEFAULT true,
  p_tema_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nome text := btrim(regexp_replace(COALESCE(p_nome, ''), '\s+', ' ', 'g'));
  v_termos text[];
  v_id uuid := p_tema_id;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF v_nome = '' THEN
    RAISE EXCEPTION 'Informe o nome do tema';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), '{}'::text[]) INTO v_termos
  FROM (
    SELECT btrim(regexp_replace(t, '\s+', ' ', 'g')) AS x
    FROM unnest(COALESCE(p_termos, '{}'::text[])) t
  ) s
  WHERE s.x <> '';

  IF array_length(v_termos, 1) IS NULL THEN
    RAISE EXCEPTION 'Informe ao menos um termo de inclusão';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.temas (nome, descricao, ativo, created_by)
    VALUES (v_nome, NULLIF(btrim(COALESCE(p_descricao, '')), ''), COALESCE(p_ativo, true), v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.temas
       SET nome = v_nome,
           descricao = NULLIF(btrim(COALESCE(p_descricao, '')), ''),
           ativo = COALESCE(p_ativo, true),
           updated_at = now()
     WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tema não encontrado ou sem permissão de alteração';
    END IF;
  END IF;

  DELETE FROM public.tema_termos tt
   WHERE tt.tema_id = v_id
     AND NOT EXISTS (
       SELECT 1 FROM unnest(v_termos) n
       WHERE public.normalizar_termo_tema(n) = public.normalizar_termo_tema(tt.termo)
     );

  INSERT INTO public.tema_termos (tema_id, termo, created_by)
  SELECT v_id, n, v_uid
  FROM unnest(v_termos) n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tema_termos tt
    WHERE tt.tema_id = v_id
      AND public.normalizar_termo_tema(tt.termo) = public.normalizar_termo_tema(n)
  );

  RETURN v_id;
END;
$$;

-- 6. Função para excluir tema e termos associados
CREATE OR REPLACE FUNCTION public.excluir_tema(
  p_tema_id uuid
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF p_tema_id IS NULL THEN
    RAISE EXCEPTION 'ID do tema é obrigatório';
  END IF;

  DELETE FROM public.tema_termos WHERE tema_id = p_tema_id;
  DELETE FROM public.temas WHERE id = p_tema_id;

  RETURN true;
END;
$$;

-- 7. Atualização das permissões RLS para usuários autenticados da banca
DROP POLICY IF EXISTS "admins insert temas" ON public.temas;
DROP POLICY IF EXISTS "admins update temas" ON public.temas;
DROP POLICY IF EXISTS "admins delete temas" ON public.temas;
DROP POLICY IF EXISTS "auth insert temas" ON public.temas;
DROP POLICY IF EXISTS "auth update temas" ON public.temas;
DROP POLICY IF EXISTS "auth delete temas" ON public.temas;
DROP POLICY IF EXISTS "auth read temas" ON public.temas;

CREATE POLICY "auth read temas" ON public.temas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert temas" ON public.temas
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update temas" ON public.temas
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete temas" ON public.temas
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "admins insert tema_termos" ON public.tema_termos;
DROP POLICY IF EXISTS "admins update tema_termos" ON public.tema_termos;
DROP POLICY IF EXISTS "admins delete tema_termos" ON public.tema_termos;
DROP POLICY IF EXISTS "auth insert tema_termos" ON public.tema_termos;
DROP POLICY IF EXISTS "auth update tema_termos" ON public.tema_termos;
DROP POLICY IF EXISTS "auth delete tema_termos" ON public.tema_termos;
DROP POLICY IF EXISTS "auth read tema_termos" ON public.tema_termos;

CREATE POLICY "auth read tema_termos" ON public.tema_termos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert tema_termos" ON public.tema_termos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update tema_termos" ON public.tema_termos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete tema_termos" ON public.tema_termos
  FOR DELETE TO authenticated USING (true);

-- 8. Permissões de execução para RPCs
REVOKE ALL ON FUNCTION public.salvar_tema(text, text[], text, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.excluir_tema(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.salvar_tema(text, text[], text, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.excluir_tema(uuid) TO authenticated, service_role;
