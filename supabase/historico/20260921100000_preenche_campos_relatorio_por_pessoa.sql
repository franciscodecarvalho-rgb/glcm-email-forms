-- Base histórica: inclui os campos necessários à visão "Por cliente" no resultado inicial.
-- A mudança é idempotente pelo DROP/CREATE exigido pela alteração do tipo de retorno.

BEGIN;

DROP FUNCTION IF EXISTS public.relatorio_por_pessoa(jsonb, jsonb, text[], text, text, integer, integer);

CREATE FUNCTION public.relatorio_por_pessoa(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (
  pessoa_id text, pessoa_identificacao text, pessoa_nome text, pessoa_cpf text,
  empresa text, competencias bigint, temas text[],
  casos bigint, itens bigint, proventos numeric, descontos numeric, total_linhas bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s' AS $$
  WITH filtrados AS (
    SELECT * FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate)
  ),
  temas_pessoa AS (
    SELECT f.pessoa_id, array_agg(DISTINCT t.tema ORDER BY t.tema) AS temas
    FROM filtrados f
    CROSS JOIN LATERAL unnest(f.temas) AS t(tema)
    WHERE t.tema IS NOT NULL AND t.tema <> ''
    GROUP BY f.pessoa_id
  ),
  agg AS (
    SELECT f.pessoa_id,
           min(f.pessoa_identificacao) AS pessoa_identificacao,
           min(f.pessoa_nome) AS pessoa_nome,
           min(f.pessoa_cpf) AS pessoa_cpf,
           COALESCE(min(NULLIF(f.empresa, '(sem empresa/modelo)')), '(sem empresa/modelo)') AS empresa,
           count(DISTINCT f.comp_data) AS competencias,
           0::bigint AS casos,
           count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM filtrados f
    GROUP BY f.pessoa_id
  )
  SELECT a.pessoa_id, a.pessoa_identificacao, a.pessoa_nome, a.pessoa_cpf,
         a.empresa, a.competencias, COALESCE(tp.temas, '{}'::text[]) AS temas,
         a.casos, a.itens, a.proventos, a.descontos, count(*) OVER () AS total_linhas
  FROM agg a
  LEFT JOIN temas_pessoa tp ON tp.pessoa_id = a.pessoa_id
  ORDER BY a.proventos DESC, a.pessoa_nome NULLS LAST, a.pessoa_id
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.relatorio_por_pessoa(jsonb, jsonb, text[], text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_por_pessoa(jsonb, jsonb, text[], text, text, integer, integer)
  TO service_role;

COMMIT;
