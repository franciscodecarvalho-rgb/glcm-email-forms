CREATE OR REPLACE FUNCTION public.relatorio_opcoes_empresa(
  p_busca text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE (empresa_id text, empresa_rotulo text, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH op AS (
    SELECT COALESCE(NULLIF(btrim(c.modelo_origem), ''), '(sem empresa/modelo)') AS empresa_id
    FROM public.contracheques c
    GROUP BY 1
  ),
  filtrado AS (
    SELECT o.empresa_id
    FROM op o
    WHERE public.normalizar_termo_tema(COALESCE(p_busca, '')) = ''
       OR strpos(public.normalizar_termo_tema(o.empresa_id),
                 public.normalizar_termo_tema(p_busca)) > 0
  )
  SELECT f.empresa_id, f.empresa_id AS empresa_rotulo, count(*) OVER () AS total_linhas
  FROM filtrado f
  ORDER BY f.empresa_id
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.relatorio_opcoes_empresa(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.relatorio_opcoes_empresa(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.relatorio_opcoes_empresa(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_opcoes_empresa(text, integer, integer) TO service_role;