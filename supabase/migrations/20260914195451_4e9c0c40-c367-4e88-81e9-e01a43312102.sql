CREATE OR REPLACE FUNCTION public.relatorio_itens_filtrados(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_codigos text[] DEFAULT NULL,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL
) RETURNS TABLE (
  item_id uuid,
  contracheque_id uuid,
  caso_id uuid,
  pessoa_nome text,
  pessoa_cpf text,
  empresa text,
  competencia text,
  codigo text,
  descricao text,
  tipo text,
  valor numeric,
  temas text[]
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH t AS (
    SELECT e->>'tema' AS tema,
           ARRAY(SELECT public.normalizar_termo_tema(x) FROM jsonb_array_elements_text(e->'termos') x) AS termos
    FROM jsonb_array_elements(COALESCE(p_temas, '[]'::jsonb)) e
  ),
  base AS (
    SELECT i.id AS item_id, i.contracheque_id, c.caso_id,
           cs.nome_cliente AS pessoa_nome, cs.cpf AS pessoa_cpf,
           COALESCE(NULLIF(btrim(c.modelo_origem), ''), '(sem empresa)') AS empresa,
           c.competencia, i.codigo, i.descricao, i.tipo, i.valor,
           public.normalizar_termo_tema(i.descricao) AS descricao_norm,
           CASE WHEN c.competencia ~ '^[0-9]{2}/[0-9]{4}$' THEN to_date(c.competencia, 'MM/YYYY') END AS comp_data
    FROM public.itens_contracheque i
    JOIN public.contracheques c ON c.id = i.contracheque_id
    LEFT JOIN public.casos cs ON cs.id = c.caso_id
  )
  SELECT b.item_id, b.contracheque_id, b.caso_id, b.pessoa_nome, b.pessoa_cpf, b.empresa,
         b.competencia, b.codigo, b.descricao, b.tipo, b.valor,
         COALESCE((
           SELECT array_agg(t.tema ORDER BY t.tema) FROM t
           WHERE EXISTS (SELECT 1 FROM unnest(t.termos) u WHERE u <> '' AND position(u IN b.descricao_norm) > 0)
         ), '{}'::text[])
  FROM base b
  WHERE (p_codigos IS NULL OR array_length(p_codigos, 1) IS NULL OR b.codigo = ANY(p_codigos))
    AND (p_empresas IS NULL OR array_length(p_empresas, 1) IS NULL OR b.empresa = ANY(p_empresas))
    AND (p_de IS NULL OR (b.comp_data IS NOT NULL AND b.comp_data >= to_date(p_de, 'MM/YYYY')))
    AND (p_ate IS NULL OR (b.comp_data IS NOT NULL AND b.comp_data <= to_date(p_ate, 'MM/YYYY')))
    AND ((SELECT count(*) FROM t) = 0
         OR EXISTS (SELECT 1 FROM t WHERE EXISTS (
              SELECT 1 FROM unnest(t.termos) u WHERE u <> '' AND position(u IN b.descricao_norm) > 0)));
$$;

CREATE OR REPLACE FUNCTION public.relatorio_totais_tema(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_codigos text[] DEFAULT NULL,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL
) RETURNS TABLE (tema text, itens bigint, proventos numeric, descontos numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT tema,
         count(DISTINCT f.item_id) AS itens,
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
  FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f
  CROSS JOIN LATERAL unnest(CASE WHEN cardinality(f.temas) = 0 THEN ARRAY['(sem tema)']::text[] ELSE f.temas END) AS tema
  GROUP BY tema
  ORDER BY tema;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_total_geral(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_codigos text[] DEFAULT NULL,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL
) RETURNS TABLE (itens bigint, pessoas bigint, empresas bigint, proventos numeric, descontos numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT count(DISTINCT f.item_id),
         count(DISTINCT f.caso_id),
         count(DISTINCT f.empresa),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0)
  FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_por_pessoa(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_codigos text[] DEFAULT NULL,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  pessoa_id text, pessoa_nome text, pessoa_cpf text,
  itens bigint, proventos numeric, descontos numeric, total_linhas bigint
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH agg AS (
    SELECT f.caso_id::text AS pessoa_id,
           max(f.pessoa_nome) AS pessoa_nome,
           max(f.pessoa_cpf) AS pessoa_cpf,
           count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f
    GROUP BY f.caso_id
  )
  SELECT a.pessoa_id, a.pessoa_nome, a.pessoa_cpf, a.itens, a.proventos, a.descontos,
         count(*) OVER () AS total_linhas
  FROM agg a
  ORDER BY a.proventos DESC, a.pessoa_nome NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.relatorio_por_empresa(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_codigos text[] DEFAULT NULL,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  empresa_id text, empresa_nome text, pessoas bigint,
  itens bigint, proventos numeric, descontos numeric, total_linhas bigint
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH agg AS (
    SELECT f.empresa AS empresa_id, f.empresa AS empresa_nome,
           count(DISTINCT f.caso_id) AS pessoas,
           count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f
    GROUP BY f.empresa
  )
  SELECT a.empresa_id, a.empresa_nome, a.pessoas, a.itens, a.proventos, a.descontos,
         count(*) OVER () AS total_linhas
  FROM agg a
  ORDER BY a.proventos DESC, a.empresa_nome
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.relatorio_lancamentos_pessoa(
  p_pessoa_id text,
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_codigos text[] DEFAULT NULL,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  competencia text, codigo text, descricao text, tipo text,
  valor numeric, empresa text, caso_id uuid, total_linhas bigint
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT f.competencia, f.codigo, f.descricao, f.tipo, f.valor, f.empresa, f.caso_id,
         count(*) OVER () AS total_linhas
  FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f
  WHERE f.caso_id::text IS NOT DISTINCT FROM p_pessoa_id
  ORDER BY CASE WHEN f.competencia ~ '^[0-9]{2}/[0-9]{4}$' THEN to_date(f.competencia, 'MM/YYYY') END NULLS LAST,
           f.codigo, f.descricao
  LIMIT GREATEST(COALESCE(p_limit, 200), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.relatorio_rubricas(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_codigos text[] DEFAULT NULL,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  codigo text, descricao text, tipo text, empresa text,
  itens bigint, proventos numeric, descontos numeric, total_linhas bigint
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH agg AS (
    SELECT f.codigo, f.descricao, f.tipo, f.empresa,
           count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f
    GROUP BY f.codigo, f.descricao, f.tipo, f.empresa
  )
  SELECT a.codigo, a.descricao, a.tipo, a.empresa, a.itens, a.proventos, a.descontos,
         count(*) OVER () AS total_linhas
  FROM agg a
  ORDER BY a.itens DESC, a.descricao
  LIMIT GREATEST(COALESCE(p_limit, 200), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.relatorio_itens_filtrados(jsonb, text[], text[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_totais_tema(jsonb, text[], text[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_total_geral(jsonb, text[], text[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_por_pessoa(jsonb, text[], text[], text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_por_empresa(jsonb, text[], text[], text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_lancamentos_pessoa(text, jsonb, text[], text[], text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_rubricas(jsonb, text[], text[], text, text, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.relatorio_itens_filtrados(jsonb, text[], text[], text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_totais_tema(jsonb, text[], text[], text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_total_geral(jsonb, text[], text[], text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_por_pessoa(jsonb, text[], text[], text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_por_empresa(jsonb, text[], text[], text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_lancamentos_pessoa(text, jsonb, text[], text[], text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_rubricas(jsonb, text[], text[], text, text, integer, integer) TO authenticated, service_role;