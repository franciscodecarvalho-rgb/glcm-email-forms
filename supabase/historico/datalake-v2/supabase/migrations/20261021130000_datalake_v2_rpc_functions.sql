-- =====================================================================
-- Migration V2 Final: RPCs com Filtragem Indexada GIN Trigram LATERAL
-- Destino: Supabase Histórico (pcquefluiltrvwjpndvw)
-- =====================================================================

begin;

DROP FUNCTION IF EXISTS public.relatorio_v2_itens_filtrados(jsonb,jsonb,text[],text,text);
DROP FUNCTION IF EXISTS public.relatorio_v2_total_geral(jsonb,jsonb,text[],text,text);
DROP FUNCTION IF EXISTS public.relatorio_v2_totais_tema(jsonb,jsonb,text[],text,text);
DROP FUNCTION IF EXISTS public.relatorio_v2_por_pessoa(jsonb,jsonb,text[],text,text,integer,integer);
DROP FUNCTION IF EXISTS public.relatorio_v2_resumo_pessoas(jsonb,jsonb,text[],text,text,integer,integer);
DROP FUNCTION IF EXISTS public.relatorio_v2_por_empresa(jsonb,jsonb,text[],text,text,integer,integer);
DROP FUNCTION IF EXISTS public.relatorio_v2_lancamentos_pessoa(text,jsonb,jsonb,text[],text,text,integer,integer);
DROP FUNCTION IF EXISTS public.relatorio_v2_rubricas(jsonb,jsonb,text[],text,text,integer,integer);
DROP FUNCTION IF EXISTS public.relatorio_v2_opcoes_empresa(text,integer,integer);

-- 1. relatorio_v2_opcoes_empresa
CREATE OR REPLACE FUNCTION public.relatorio_v2_opcoes_empresa(
  p_busca text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  empresa_id text,
  nome text,
  count bigint
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, datalake_v2
SET statement_timeout = '60s' AS $$
  SELECT
    e.id::text AS empresa_id,
    e.nome,
    COUNT(v.id)::bigint AS count
  FROM datalake_v2.empresas e
  LEFT JOIN datalake_v2.vinculos v ON v.empresa_id = e.id
  WHERE (p_busca IS NULL OR btrim(p_busca) = '' OR e.nome ILIKE '%' || public.escapar_like_literal(p_busca) || '%')
  GROUP BY e.id, e.nome
  ORDER BY count DESC, e.nome ASC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- 2. relatorio_v2_lancamentos_pessoa
CREATE OR REPLACE FUNCTION public.relatorio_v2_lancamentos_pessoa(
  p_pessoa_id text,
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  item_id uuid,
  contracheque_id uuid,
  competencia text,
  comp_data date,
  empresa text,
  codigo text,
  descricao text,
  tipo text,
  valor numeric,
  temas text[]
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, datalake_v2
SET statement_timeout = '60s' AS $$
  WITH pessoa_alvo AS (
    SELECT id AS pessoa_id
    FROM datalake_v2.pessoas
    WHERE (
      (p_pessoa_id LIKE 'registro:%' AND id::text = substring(p_pessoa_id from 10))
      OR (p_pessoa_id LIKE 'cpf:%' AND cpf = substring(p_pessoa_id from 5))
      OR id::text = p_pessoa_id
    )
    LIMIT 1
  ),
  t AS (
    SELECT e->>'tema' AS tema,
           ARRAY(SELECT public.normalizar_termo_tema(x) FROM jsonb_array_elements_text(e->'termos') x) AS termos
    FROM jsonb_array_elements(COALESCE(p_temas, '[]'::jsonb)) e
  ),
  t_termos_todos AS (
    SELECT DISTINCT u AS termo FROM t, unnest(t.termos) u WHERE u <> ''
  ),
  r AS (
    SELECT e->>'codigo' AS codigo, e->>'descricao' AS descricao,
           e->>'tipo' AS tipo, e->>'empresa' AS empresa
    FROM jsonb_array_elements(COALESCE(p_rubricas, '[]'::jsonb)) e
  )
  SELECT
    i.id AS item_id,
    c.id AS contracheque_id,
    c.competencia::text AS competencia,
    c.competencia AS comp_data,
    COALESCE(NULLIF(btrim(e.nome), ''), '(sem empresa/modelo)') AS empresa,
    rub.codigo,
    rub.descricao,
    rub.tipo,
    (i.valor_centavos / 100.0)::numeric(12,2) AS valor,
    ARRAY(
      SELECT t.tema FROM t
      WHERE EXISTS (
        SELECT 1 FROM unnest(t.termos) u
        WHERE u <> '' AND rub.descricao_normalizada LIKE '%' || public.escapar_like_literal(u) || '%' ESCAPE E'\\'
      )
    ) AS temas
  FROM pessoa_alvo pa
  JOIN datalake_v2.vinculos v ON v.pessoa_id = pa.pessoa_id
  JOIN datalake_v2.contracheques c ON c.vinculo_id = v.id
  JOIN datalake_v2.empresas e ON e.id = v.empresa_id
  JOIN datalake_v2.itens_contracheque i ON i.contracheque_id = c.id
  JOIN datalake_v2.rubricas rub ON rub.id = i.rubrica_id
  WHERE i.valor_centavos > 0
    AND rub.tipo IN ('provento', 'desconto')
    AND (p_empresas IS NULL OR array_length(p_empresas, 1) IS NULL OR e.id::text = ANY(p_empresas) OR e.nome = ANY(p_empresas))
    AND (public.competencia_para_data(p_de) IS NULL OR c.competencia >= public.competencia_para_data(p_de))
    AND (public.competencia_para_data(p_ate) IS NULL OR c.competencia <= public.competencia_para_data(p_ate))
    AND (
      NOT EXISTS (SELECT 1 FROM t_termos_todos)
      OR EXISTS (
        SELECT 1 FROM t_termos_todos tt
        WHERE rub.descricao_normalizada LIKE '%' || public.escapar_like_literal(tt.termo) || '%' ESCAPE E'\\'
      )
    )
    AND (
      (SELECT count(*) FROM r) = 0
      OR EXISTS (
        SELECT 1 FROM r
        WHERE r.codigo IS NOT DISTINCT FROM rub.codigo
          AND r.descricao IS NOT DISTINCT FROM rub.descricao
          AND r.tipo IS NOT DISTINCT FROM rub.tipo
      )
    )
  ORDER BY c.competencia DESC, rub.descricao ASC
  LIMIT GREATEST(COALESCE(p_limit, 500), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- 3. relatorio_v2_resumo_pessoas (RETORNA EXATAMENTE TABLE (resumo jsonb, linhas jsonb))
CREATE OR REPLACE FUNCTION public.relatorio_v2_resumo_pessoas(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  resumo jsonb,
  linhas jsonb
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, datalake_v2
SET statement_timeout = '60s' AS $$
  WITH t AS (
    SELECT e->>'tema' AS tema,
           ARRAY(SELECT public.normalizar_termo_tema(x) FROM jsonb_array_elements_text(e->'termos') x) AS termos
    FROM jsonb_array_elements(COALESCE(p_temas, '[]'::jsonb)) e
  ),
  t_termos_todos AS (
    SELECT DISTINCT u AS termo FROM t, unnest(t.termos) u WHERE u <> ''
  ),
  r AS (
    SELECT e->>'codigo' AS codigo, e->>'descricao' AS descricao,
           e->>'tipo' AS tipo, e->>'empresa' AS empresa
    FROM jsonb_array_elements(COALESCE(p_rubricas, '[]'::jsonb)) e
  ),
  -- FILTRAGEM PRECOCE INDEXADA GIN (CROSS JOIN LATERAL)
  rubricas_por_tema AS (
    SELECT DISTINCT ON (rub.id) rub.id, rub.tipo
    FROM t_termos_todos tt
    CROSS JOIN LATERAL (
      SELECT r_in.id, r_in.tipo
      FROM datalake_v2.rubricas r_in
      WHERE r_in.tipo IN ('provento', 'desconto')
        AND r_in.descricao_normalizada LIKE '%' || public.escapar_like_literal(tt.termo) || '%' ESCAPE E'\\'
    ) rub
  ),
  rubricas_sem_tema AS (
    SELECT r_in.id, r_in.tipo
    FROM datalake_v2.rubricas r_in
    WHERE r_in.tipo IN ('provento', 'desconto')
      AND NOT EXISTS (SELECT 1 FROM t_termos_todos)
  ),
  rubricas_candidatas AS (
    SELECT * FROM rubricas_por_tema
    UNION ALL
    SELECT * FROM rubricas_sem_tema
  ),
  rubricas_alvo AS MATERIALIZED (
    SELECT rc.id, rc.tipo
    FROM rubricas_candidatas rc
    WHERE (SELECT count(*) FROM r) = 0
       OR EXISTS (
         SELECT 1 FROM r
         JOIN datalake_v2.rubricas rk ON rk.id = rc.id
         WHERE r.codigo IS NOT DISTINCT FROM rk.codigo
           AND r.descricao IS NOT DISTINCT FROM rk.descricao
           AND r.tipo IS NOT DISTINCT FROM rk.tipo
       )
  ),
  itens_f AS (
    SELECT
      v.pessoa_id,
      e.nome AS empresa,
      c.competencia AS comp_data,
      i.id AS item_id,
      (i.valor_centavos / 100.0)::numeric(12,2) AS valor,
      ra.tipo
    FROM rubricas_alvo ra
    JOIN datalake_v2.itens_contracheque i ON i.rubrica_id = ra.id
    JOIN datalake_v2.contracheques c ON c.id = i.contracheque_id
    JOIN datalake_v2.vinculos v ON v.id = c.vinculo_id
    JOIN datalake_v2.empresas e ON e.id = v.empresa_id
    WHERE i.valor_centavos > 0
      AND (p_empresas IS NULL OR array_length(p_empresas, 1) IS NULL OR e.id::text = ANY(p_empresas) OR e.nome = ANY(p_empresas))
      AND (public.competencia_para_data(p_de) IS NULL OR c.competencia >= public.competencia_para_data(p_de))
      AND (public.competencia_para_data(p_ate) IS NULL OR c.competencia <= public.competencia_para_data(p_ate))
  ),
  agg AS (
    SELECT
      f.pessoa_id,
      COALESCE(min(NULLIF(btrim(f.empresa), '')), '(sem empresa/modelo)') AS empresa,
      count(DISTINCT f.comp_data) AS competencias,
      0::bigint AS casos,
      count(DISTINCT f.item_id) AS itens,
      COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0)::numeric(12,2) AS proventos,
      COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0)::numeric(12,2) AS descontos
    FROM itens_f f
    GROUP BY f.pessoa_id
  ),
  pagina AS (
    SELECT
      CASE WHEN public.cpf_valido(p.cpf) THEN 'cpf:' || public.normalizar_cpf_digitos(p.cpf) ELSE 'registro:' || p.id::text END AS pessoa_id,
      CASE WHEN public.cpf_valido(p.cpf) THEN 'cpf' ELSE 'caso_sem_cpf' END AS pessoa_identificacao,
      p.nome AS pessoa_nome,
      CASE WHEN public.cpf_valido(p.cpf) THEN public.normalizar_cpf_digitos(p.cpf) END AS pessoa_cpf,
      a.empresa,
      a.competencias,
      ARRAY(SELECT t.tema FROM t) AS temas,
      a.casos,
      a.itens,
      a.proventos,
      a.descontos,
      count(*) OVER () AS total_linhas
    FROM agg a
    JOIN datalake_v2.pessoas p ON p.id = a.pessoa_id
    ORDER BY a.proventos DESC, p.nome NULLS LAST
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT
    (
      SELECT jsonb_build_object(
        'itens', count(DISTINCT f.item_id),
        'pessoas', count(DISTINCT f.pessoa_id),
        'pessoas_sem_cpf', count(DISTINCT f.pessoa_id) FILTER (WHERE p.cpf IS NULL OR NOT public.cpf_valido(p.cpf)),
        'casos', 0,
        'empresas', count(DISTINCT f.empresa),
        'proventos', COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0),
        'descontos', COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0)
      )
      FROM itens_f f
      JOIN datalake_v2.pessoas p ON p.id = f.pessoa_id
    ) AS resumo,
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(pg)) FROM pagina pg),
      '[]'::jsonb
    ) AS linhas;
$$;

-- 4. relatorio_v2_total_geral
CREATE OR REPLACE FUNCTION public.relatorio_v2_total_geral(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL
) RETURNS TABLE (
  total_proventos numeric,
  total_descontos numeric,
  total_liquido numeric,
  total_itens bigint,
  total_pessoas bigint,
  total_contracheques bigint,
  total_empresas bigint
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, datalake_v2
SET statement_timeout = '60s' AS $$
  WITH r AS (
    SELECT * FROM public.relatorio_v2_resumo_pessoas(p_temas, p_rubricas, p_empresas, p_de, p_ate, 1, 0)
  )
  SELECT
    COALESCE((r.resumo->>'proventos')::numeric, 0) AS total_proventos,
    COALESCE((r.resumo->>'descontos')::numeric, 0) AS total_descontos,
    (COALESCE((r.resumo->>'proventos')::numeric, 0) - COALESCE((r.resumo->>'descontos')::numeric, 0)) AS total_liquido,
    COALESCE((r.resumo->>'itens')::bigint, 0) AS total_itens,
    COALESCE((r.resumo->>'pessoas')::bigint, 0) AS total_pessoas,
    0::bigint AS total_contracheques,
    COALESCE((r.resumo->>'empresas')::bigint, 0) AS total_empresas
  FROM r;
$$;

-- 5. relatorio_v2_totais_tema
CREATE OR REPLACE FUNCTION public.relatorio_v2_totais_tema(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL
) RETURNS TABLE (
  tema text,
  total_proventos numeric,
  total_descontos numeric,
  total_liquido numeric,
  total_itens bigint,
  total_pessoas bigint,
  total_contracheques bigint,
  total_empresas bigint
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, datalake_v2
SET statement_timeout = '60s' AS $$
  WITH temas_parsed AS (
    SELECT e->>'tema' AS tema,
           ARRAY(SELECT public.normalizar_termo_tema(x) FROM jsonb_array_elements_text(e->'termos') x) AS termos
    FROM jsonb_array_elements(COALESCE(p_temas, '[]'::jsonb)) e
  )
  SELECT
    tp.tema,
    COALESCE(g.total_proventos, 0)::numeric AS total_proventos,
    COALESCE(g.total_descontos, 0)::numeric AS total_descontos,
    COALESCE(g.total_liquido, 0)::numeric AS total_liquido,
    COALESCE(g.total_itens, 0)::bigint AS total_itens,
    COALESCE(g.total_pessoas, 0)::bigint AS total_pessoas,
    0::bigint AS total_contracheques,
    COALESCE(g.total_empresas, 0)::bigint AS total_empresas
  FROM temas_parsed tp
  CROSS JOIN LATERAL (
    SELECT * FROM public.relatorio_v2_total_geral(
      jsonb_build_array(jsonb_build_object('tema', tp.tema, 'termos', to_jsonb(tp.termos))),
      p_rubricas,
      p_empresas,
      p_de,
      p_ate
    )
  ) g;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.relatorio_v2_opcoes_empresa TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_v2_lancamentos_pessoa TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_v2_resumo_pessoas TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_v2_total_geral TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_v2_totais_tema TO service_role;

commit;
