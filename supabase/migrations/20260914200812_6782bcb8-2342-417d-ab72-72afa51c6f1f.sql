-- Identidade de pessoa: CPF válido (módulo 11) normalizado
CREATE OR REPLACE FUNCTION public.normalizar_cpf_digitos(_cpf text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(regexp_replace(COALESCE(_cpf, ''), '\D', '', 'g'), '')
$$;

CREATE OR REPLACE FUNCTION public.cpf_valido(_cpf text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  d text := public.normalizar_cpf_digitos(_cpf);
  soma integer;
  resto integer;
  i integer;
BEGIN
  IF d IS NULL OR length(d) <> 11 THEN RETURN false; END IF;
  IF d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  soma := 0;
  FOR i IN 1..9 LOOP
    soma := soma + substr(d, i, 1)::int * (11 - i);
  END LOOP;
  resto := (soma * 10) % 11;
  IF resto = 10 THEN resto := 0; END IF;
  IF resto <> substr(d, 10, 1)::int THEN RETURN false; END IF;
  soma := 0;
  FOR i IN 1..10 LOOP
    soma := soma + substr(d, i, 1)::int * (12 - i);
  END LOOP;
  resto := (soma * 10) % 11;
  IF resto = 10 THEN resto := 0; END IF;
  RETURN resto = substr(d, 11, 1)::int;
END;
$$;

-- Competência: aceita MM/AAAA e AAAA-MM (mês válido). Nunca lança erro.
CREATE OR REPLACE FUNCTION public.competencia_para_data(_valor text)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _valor IS NULL THEN NULL
    WHEN btrim(_valor) ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
      THEN make_date(substr(btrim(_valor), 4, 4)::int, substr(btrim(_valor), 1, 2)::int, 1)
    WHEN btrim(_valor) ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      THEN make_date(substr(btrim(_valor), 1, 4)::int, substr(btrim(_valor), 6, 2)::int, 1)
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.normalizar_cpf_digitos(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cpf_valido(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.competencia_para_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalizar_cpf_digitos(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cpf_valido(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.competencia_para_data(text) TO authenticated, service_role;

-- Substitui as funções de relatório (assinaturas mudam: p_codigos -> p_rubricas)
DROP FUNCTION IF EXISTS public.relatorio_lancamentos_pessoa(text, jsonb, text[], text[], text, text, integer, integer);
DROP FUNCTION IF EXISTS public.relatorio_rubricas(jsonb, text[], text[], text, text, integer, integer);
DROP FUNCTION IF EXISTS public.relatorio_por_empresa(jsonb, text[], text[], text, text, integer, integer);
DROP FUNCTION IF EXISTS public.relatorio_por_pessoa(jsonb, text[], text[], text, text, integer, integer);
DROP FUNCTION IF EXISTS public.relatorio_total_geral(jsonb, text[], text[], text, text);
DROP FUNCTION IF EXISTS public.relatorio_totais_tema(jsonb, text[], text[], text, text);
DROP FUNCTION IF EXISTS public.relatorio_itens_filtrados(jsonb, text[], text[], text, text);

CREATE FUNCTION public.relatorio_itens_filtrados(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL
) RETURNS TABLE (
  item_id uuid,
  contracheque_id uuid,
  caso_id uuid,
  pessoa_id text,
  pessoa_identificacao text,
  pessoa_nome text,
  pessoa_cpf text,
  empresa text,
  competencia text,
  comp_data date,
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
  r AS (
    SELECT e->>'codigo' AS codigo, e->>'descricao' AS descricao,
           e->>'tipo' AS tipo, e->>'empresa' AS empresa
    FROM jsonb_array_elements(COALESCE(p_rubricas, '[]'::jsonb)) e
  ),
  base AS (
    SELECT i.id AS item_id, i.contracheque_id, c.caso_id,
           CASE WHEN public.cpf_valido(cs.cpf)
                THEN 'cpf:' || public.normalizar_cpf_digitos(cs.cpf)
                ELSE 'caso:' || c.caso_id::text END AS pessoa_id,
           CASE WHEN public.cpf_valido(cs.cpf) THEN 'cpf' ELSE 'caso_sem_cpf' END AS pessoa_identificacao,
           cs.nome_cliente AS pessoa_nome,
           CASE WHEN public.cpf_valido(cs.cpf) THEN public.normalizar_cpf_digitos(cs.cpf) ELSE NULL END AS pessoa_cpf,
           COALESCE(NULLIF(btrim(c.modelo_origem), ''), '(sem empresa/modelo)') AS empresa,
           c.competencia, public.competencia_para_data(c.competencia) AS comp_data,
           i.codigo, i.descricao, i.tipo, i.valor,
           public.normalizar_termo_tema(i.descricao) AS descricao_norm
    FROM public.itens_contracheque i
    JOIN public.contracheques c ON c.id = i.contracheque_id
    LEFT JOIN public.casos cs ON cs.id = c.caso_id
  )
  SELECT b.item_id, b.contracheque_id, b.caso_id, b.pessoa_id, b.pessoa_identificacao,
         b.pessoa_nome, b.pessoa_cpf, b.empresa, b.competencia, b.comp_data,
         b.codigo, b.descricao, b.tipo, b.valor,
         COALESCE((
           SELECT array_agg(t.tema ORDER BY t.tema) FROM t
           WHERE EXISTS (SELECT 1 FROM unnest(t.termos) u WHERE u <> '' AND position(u IN b.descricao_norm) > 0)
         ), '{}'::text[])
  FROM base b
  WHERE ((SELECT count(*) FROM r) = 0
         OR EXISTS (
           SELECT 1 FROM r
           WHERE r.codigo IS NOT DISTINCT FROM b.codigo
             AND r.descricao IS NOT DISTINCT FROM b.descricao
             AND r.tipo IS NOT DISTINCT FROM b.tipo
             AND r.empresa IS NOT DISTINCT FROM b.empresa))
    AND (p_empresas IS NULL OR array_length(p_empresas, 1) IS NULL OR b.empresa = ANY(p_empresas))
    AND (public.competencia_para_data(p_de) IS NULL
         OR (b.comp_data IS NOT NULL AND b.comp_data >= public.competencia_para_data(p_de)))
    AND (public.competencia_para_data(p_ate) IS NULL
         OR (b.comp_data IS NOT NULL AND b.comp_data <= public.competencia_para_data(p_ate)))
    AND ((SELECT count(*) FROM t) = 0
         OR EXISTS (SELECT 1 FROM t WHERE EXISTS (
              SELECT 1 FROM unnest(t.termos) u WHERE u <> '' AND position(u IN b.descricao_norm) > 0)));
$$;

CREATE FUNCTION public.relatorio_totais_tema(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL
) RETURNS TABLE (tema text, itens bigint, proventos numeric, descontos numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT tema,
         count(DISTINCT f.item_id),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0)
  FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate) f
  CROSS JOIN LATERAL unnest(CASE WHEN cardinality(f.temas) = 0 THEN ARRAY['(sem tema)']::text[] ELSE f.temas END) AS tema
  GROUP BY tema
  ORDER BY tema;
$$;

CREATE FUNCTION public.relatorio_total_geral(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL
) RETURNS TABLE (itens bigint, pessoas bigint, pessoas_sem_cpf bigint, casos bigint, empresas bigint, proventos numeric, descontos numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT count(DISTINCT f.item_id),
         count(DISTINCT f.pessoa_id),
         count(DISTINCT f.pessoa_id) FILTER (WHERE f.pessoa_identificacao = 'caso_sem_cpf'),
         count(DISTINCT f.caso_id),
         count(DISTINCT f.empresa),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0)
  FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate) f;
$$;

CREATE FUNCTION public.relatorio_por_pessoa(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (pessoa_id text, pessoa_identificacao text, pessoa_nome text, pessoa_cpf text,
                 casos bigint, itens bigint, proventos numeric, descontos numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH agg AS (
    SELECT f.pessoa_id,
           min(f.pessoa_identificacao) AS pessoa_identificacao,
           min(f.pessoa_nome) AS pessoa_nome,
           min(f.pessoa_cpf) AS pessoa_cpf,
           count(DISTINCT f.caso_id) AS casos,
           count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate) f
    GROUP BY f.pessoa_id
  )
  SELECT a.pessoa_id, a.pessoa_identificacao, a.pessoa_nome, a.pessoa_cpf, a.casos, a.itens,
         a.proventos, a.descontos, count(*) OVER () AS total_linhas
  FROM agg a
  ORDER BY a.proventos DESC, a.pessoa_nome NULLS LAST, a.pessoa_id
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE FUNCTION public.relatorio_por_empresa(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (empresa_id text, empresa_nome text, pessoas bigint, itens bigint,
                 proventos numeric, descontos numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH agg AS (
    SELECT f.empresa AS empresa_id, f.empresa AS empresa_nome,
           count(DISTINCT f.pessoa_id) AS pessoas,
           count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate) f
    GROUP BY f.empresa
  )
  SELECT a.empresa_id, a.empresa_nome, a.pessoas, a.itens, a.proventos, a.descontos,
         count(*) OVER () AS total_linhas
  FROM agg a
  ORDER BY a.proventos DESC, a.empresa_nome, a.empresa_id
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE FUNCTION public.relatorio_rubricas(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (codigo text, descricao text, tipo text, empresa text, itens bigint,
                 proventos numeric, descontos numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH agg AS (
    SELECT f.codigo, f.descricao, f.tipo, f.empresa,
           count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate) f
    GROUP BY f.codigo, f.descricao, f.tipo, f.empresa
  )
  SELECT a.codigo, a.descricao, a.tipo, a.empresa, a.itens, a.proventos, a.descontos,
         count(*) OVER () AS total_linhas
  FROM agg a
  ORDER BY a.itens DESC, a.descricao NULLS LAST, a.codigo NULLS LAST, a.tipo NULLS LAST, a.empresa
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE FUNCTION public.relatorio_lancamentos_pessoa(
  p_pessoa_id text, p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 200, p_offset integer DEFAULT 0
) RETURNS TABLE (item_id uuid, competencia text, codigo text, descricao text, tipo text,
                 valor numeric, empresa text, caso_id uuid, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT f.item_id, f.competencia, f.codigo, f.descricao, f.tipo, f.valor, f.empresa, f.caso_id,
         count(*) OVER () AS total_linhas
  FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate) f
  WHERE f.pessoa_id = p_pessoa_id
  ORDER BY f.comp_data NULLS LAST, f.codigo NULLS LAST, f.descricao NULLS LAST, f.item_id
  LIMIT GREATEST(COALESCE(p_limit, 200), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.relatorio_itens_filtrados(jsonb, jsonb, text[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_totais_tema(jsonb, jsonb, text[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_total_geral(jsonb, jsonb, text[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_por_pessoa(jsonb, jsonb, text[], text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_por_empresa(jsonb, jsonb, text[], text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_rubricas(jsonb, jsonb, text[], text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relatorio_lancamentos_pessoa(text, jsonb, jsonb, text[], text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_itens_filtrados(jsonb, jsonb, text[], text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_totais_tema(jsonb, jsonb, text[], text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_total_geral(jsonb, jsonb, text[], text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_por_pessoa(jsonb, jsonb, text[], text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_por_empresa(jsonb, jsonb, text[], text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_rubricas(jsonb, jsonb, text[], text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_lancamentos_pessoa(text, jsonb, jsonb, text[], text, text, integer, integer) TO authenticated, service_role;