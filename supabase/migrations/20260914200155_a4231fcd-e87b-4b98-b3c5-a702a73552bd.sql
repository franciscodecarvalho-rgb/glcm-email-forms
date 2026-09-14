CREATE OR REPLACE FUNCTION public.temas_rubricas_correspondentes(
  p_termos text[],
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  codigo text,
  descricao text,
  tipo text,
  empresa text,
  ocorrencias bigint,
  total_linhas bigint
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH termos AS (
    SELECT DISTINCT public.normalizar_termo_tema(t) AS termo
    FROM unnest(COALESCE(p_termos, '{}'::text[])) t
    WHERE public.normalizar_termo_tema(t) <> ''
  ),
  agg AS (
    SELECT i.codigo,
           i.descricao,
           i.tipo,
           COALESCE(NULLIF(btrim(c.modelo_origem), ''), '(sem empresa)') AS empresa,
           count(*) AS ocorrencias
    FROM public.itens_contracheque i
    JOIN public.contracheques c ON c.id = i.contracheque_id
    WHERE EXISTS (
      SELECT 1 FROM termos t
      WHERE strpos(public.normalizar_termo_tema(i.descricao), t.termo) > 0
    )
    GROUP BY i.codigo, i.descricao, i.tipo, COALESCE(NULLIF(btrim(c.modelo_origem), ''), '(sem empresa)')
  )
  SELECT a.codigo, a.descricao, a.tipo, a.empresa, a.ocorrencias, count(*) OVER () AS total_linhas
  FROM agg a
  ORDER BY a.descricao NULLS LAST, a.codigo NULLS LAST, a.tipo NULLS LAST, a.empresa
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.salvar_tema(
  p_nome text,
  p_termos text[],
  p_descricao text DEFAULT NULL,
  p_ativo boolean DEFAULT true,
  p_tema_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_nome text := btrim(regexp_replace(COALESCE(p_nome, ''), '\s+', ' ', 'g'));
  v_termos text[];
  v_id uuid := p_tema_id;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem manter temas';
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
           ativo = COALESCE(p_ativo, true)
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

REVOKE ALL ON FUNCTION public.temas_rubricas_correspondentes(text[], integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salvar_tema(text, text[], text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.temas_rubricas_correspondentes(text[], integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_tema(text, text[], text, boolean, uuid) TO authenticated, service_role;

-- Seed reprodutível e idempotente dos temas iniciais
WITH novos(nome, termo) AS (
  VALUES ('Banco de Horas', 'banco de horas'),
         ('Confinamento', 'confinamento'),
         ('PPSP', 'ppsp')
)
INSERT INTO public.temas (nome, ativo)
SELECT n.nome, true FROM novos n
WHERE NOT EXISTS (
  SELECT 1 FROM public.temas t
  WHERE public.normalizar_termo_tema(t.nome) = public.normalizar_termo_tema(n.nome)
);

WITH novos(nome, termo) AS (
  VALUES ('Banco de Horas', 'banco de horas'),
         ('Confinamento', 'confinamento'),
         ('PPSP', 'ppsp')
)
INSERT INTO public.tema_termos (tema_id, termo)
SELECT t.id, n.termo
FROM novos n
JOIN public.temas t
  ON public.normalizar_termo_tema(t.nome) = public.normalizar_termo_tema(n.nome)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tema_termos tt
  WHERE tt.tema_id = t.id
    AND public.normalizar_termo_tema(tt.termo) = public.normalizar_termo_tema(n.termo)
);