-- =====================================================================
-- Funções de agregação e índices a aplicar SOMENTE na base histórica
-- (projeto pcquefluiltrvwjpndvw). NÃO aplicar no banco do aplicativo.
--
-- Otimizações aplicadas nesta versão:
--   1. Filtragem precoce de itens (Early Filtering): avalia termos de temas
--      e rubricas diretamente em itens_contracheque ANTES de realizar JOINs
--      e ANTES de executar funções de CPF, reduzindo milhões de linhas a apenas
--      as rubricas candidatas.
--   2. Índices de alta performance (incluindo GIN trigram para busca textual).
--   3. SET statement_timeout = '60s' para acomodar consultas massivas de agregação.
--   4. Deduplicação canônica para evitar duplicações cartesianas.
--
-- Premissas de esquema da base histórica:
--   funcionarios(id, nome, cpf)
--   empresas(id, nome)
--   contracheques(id, funcionario_id, empresa_id, competencia)
--   itens_contracheque(id, contracheque_id, codigo, descricao, valor, tipo)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Índices recomendados para acelerar a base histórica
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_itens_contracheque_contracheque_id
  ON public.itens_contracheque (contracheque_id);

CREATE INDEX IF NOT EXISTS idx_contracheques_funcionario_id
  ON public.contracheques (funcionario_id);

CREATE INDEX IF NOT EXISTS idx_contracheques_empresa_id
  ON public.contracheques (empresa_id);

CREATE INDEX IF NOT EXISTS idx_itens_contracheque_tipo_valor
  ON public.itens_contracheque (tipo, valor);

CREATE INDEX IF NOT EXISTS idx_itens_contracheque_descricao_trgm
  ON public.itens_contracheque USING gin (descricao gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 1. Funções utilitárias auxiliares (PARALLEL SAFE)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalizar_termo_tema(p_valor text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(lower(coalesce(p_valor, '')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.normalizar_cpf_digitos(_cpf text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NULLIF(regexp_replace(COALESCE(_cpf, ''), '\D', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.cpf_valido(_cpf text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  d text := public.normalizar_cpf_digitos(_cpf);
  soma integer; resto integer; i integer;
BEGIN
  IF d IS NULL OR length(d) <> 11 THEN RETURN false; END IF;
  IF d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  soma := 0;
  FOR i IN 1..9 LOOP soma := soma + substr(d, i, 1)::int * (11 - i); END LOOP;
  resto := (soma * 10) % 11; IF resto = 10 THEN resto := 0; END IF;
  IF resto <> substr(d, 10, 1)::int THEN RETURN false; END IF;
  soma := 0;
  FOR i IN 1..10 LOOP soma := soma + substr(d, i, 1)::int * (12 - i); END LOOP;
  resto := (soma * 10) % 11; IF resto = 10 THEN resto := 0; END IF;
  RETURN resto = substr(d, 11, 1)::int;
END;
$$;

CREATE OR REPLACE FUNCTION public.competencia_para_data(_valor text)
RETURNS date LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN _valor IS NULL THEN NULL
    -- Ano 0000 é rejeitado explicitamente: make_date(0, ...) lança erro.
    WHEN btrim(_valor) ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
         AND substr(btrim(_valor), 4, 4) <> '0000'
      THEN make_date(substr(btrim(_valor), 4, 4)::int, substr(btrim(_valor), 1, 2)::int, 1)
    WHEN btrim(_valor) ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
         AND substr(btrim(_valor), 1, 4) <> '0000'
      THEN make_date(substr(btrim(_valor), 1, 4)::int, substr(btrim(_valor), 6, 2)::int, 1)
    ELSE NULL
  END;
$$;

-- ---------------------------------------------------------------------
-- 2. Função base: relatorio_itens_filtrados com filtragem precoce
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.relatorio_itens_filtrados(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL
) RETURNS TABLE (
  item_id uuid, contracheque_id uuid, caso_id uuid,
  pessoa_id text, pessoa_identificacao text, pessoa_nome text, pessoa_cpf text,
  empresa_id text, empresa text, competencia text, comp_data date,
  codigo text, descricao text, tipo text, valor numeric, temas text[]
) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s' AS $$
  WITH t AS (
    SELECT e->>'tema' AS tema,
           ARRAY(SELECT public.normalizar_termo_tema(x) FROM jsonb_array_elements_text(e->'termos') x) AS termos
    FROM jsonb_array_elements(COALESCE(p_temas, '[]'::jsonb)) e
  ),
  t_termos_todos AS (
    SELECT DISTINCT u AS termo
    FROM t, unnest(t.termos) u
    WHERE u <> ''
  ),
  r AS (
    SELECT e->>'codigo' AS codigo, e->>'descricao' AS descricao,
           e->>'tipo' AS tipo, e->>'empresa' AS empresa
    FROM jsonb_array_elements(COALESCE(p_rubricas, '[]'::jsonb)) e
  ),
  -- 1. FILTRAGEM PRECOCE: reduz o universo de itens_contracheque antes de qualquer JOIN
  itens_candidatos AS (
    SELECT i.id AS item_id,
           i.contracheque_id,
           i.codigo,
           i.descricao,
           i.tipo,
           i.valor,
           public.normalizar_termo_tema(i.descricao) AS descricao_norm
    FROM public.itens_contracheque i
    WHERE i.valor > 0
      AND i.tipo IN ('provento', 'desconto')
      AND (
        (SELECT count(*) FROM t) = 0
        OR EXISTS (
          SELECT 1 FROM t_termos_todos tt
          WHERE position(tt.termo IN public.normalizar_termo_tema(i.descricao)) > 0
        )
      )
      AND (
        (SELECT count(*) FROM r) = 0
        OR EXISTS (
          SELECT 1 FROM r
          WHERE r.codigo IS NOT DISTINCT FROM i.codigo
            AND r.descricao IS NOT DISTINCT FROM i.descricao
            AND r.tipo IS NOT DISTINCT FROM i.tipo
        )
      )
  ),
  -- 2. JOIN com contracheques apenas para os itens sobreviventes
  itens_com_contracheque AS (
    SELECT ic.item_id,
           ic.contracheque_id,
           ic.codigo,
           ic.descricao,
           ic.tipo,
           ic.valor,
           ic.descricao_norm,
           c.funcionario_id,
           c.empresa_id,
           c.competencia::text AS competencia,
           public.competencia_para_data(c.competencia::text) AS comp_data
    FROM itens_candidatos ic
    JOIN public.contracheques c ON c.id = ic.contracheque_id
    WHERE (p_empresas IS NULL OR array_length(p_empresas, 1) IS NULL OR c.empresa_id::text = ANY(p_empresas))
      AND (public.competencia_para_data(p_de) IS NULL
           OR (public.competencia_para_data(c.competencia::text) IS NOT NULL AND public.competencia_para_data(c.competencia::text) >= public.competencia_para_data(p_de)))
      AND (public.competencia_para_data(p_ate) IS NULL
           OR (public.competencia_para_data(c.competencia::text) IS NOT NULL AND public.competencia_para_data(c.competencia::text) <= public.competencia_para_data(p_ate)))
  ),
  -- 3. JOIN com funcionarios e empresas + deduplicação canônica
  base_bruta AS (
    SELECT ic.item_id,
           ic.contracheque_id,
           NULL::uuid AS caso_id,
           CASE WHEN public.cpf_valido(f.cpf)
                THEN 'cpf:' || public.normalizar_cpf_digitos(f.cpf)
                ELSE 'registro:' || COALESCE(f.id::text, 'sem-funcionario') END AS pessoa_id,
           CASE WHEN public.cpf_valido(f.cpf) THEN 'cpf' ELSE 'caso_sem_cpf' END AS pessoa_identificacao,
           f.nome AS pessoa_nome,
           CASE WHEN public.cpf_valido(f.cpf) THEN public.normalizar_cpf_digitos(f.cpf) END AS pessoa_cpf,
           COALESCE(ic.empresa_id::text, '(sem empresa/modelo)') AS empresa_id,
           COALESCE(NULLIF(btrim(em.nome), ''), '(sem empresa/modelo)') AS empresa,
           ic.competencia,
           ic.comp_data,
           ic.codigo,
           ic.descricao,
           ic.tipo,
           ic.valor,
           ic.descricao_norm,
           ROW_NUMBER() OVER (
             PARTITION BY
               CASE WHEN public.cpf_valido(f.cpf)
                    THEN 'cpf:' || public.normalizar_cpf_digitos(f.cpf)
                    ELSE 'registro:' || COALESCE(f.id::text, 'sem-funcionario') END,
               ic.competencia,
               COALESCE(ic.codigo, ''),
               ic.tipo,
               ic.descricao_norm
             ORDER BY ic.item_id
           ) AS rn
    FROM itens_com_contracheque ic
    LEFT JOIN public.funcionarios f ON f.id = ic.funcionario_id
    LEFT JOIN public.empresas em ON em.id = ic.empresa_id
    WHERE ((SELECT count(*) FROM r) = 0
           OR EXISTS (
             SELECT 1 FROM r
             WHERE r.codigo IS NOT DISTINCT FROM ic.codigo
               AND r.descricao IS NOT DISTINCT FROM ic.descricao
               AND r.tipo IS NOT DISTINCT FROM ic.tipo
               AND r.empresa IS NOT DISTINCT FROM COALESCE(ic.empresa_id::text, '(sem empresa/modelo)')
           ))
  ),
  base AS (
    SELECT * FROM base_bruta WHERE rn = 1
  )
  SELECT b.item_id, b.contracheque_id, b.caso_id, b.pessoa_id, b.pessoa_identificacao,
         b.pessoa_nome, b.pessoa_cpf, b.empresa_id, b.empresa, b.competencia, b.comp_data,
         b.codigo, b.descricao, b.tipo, b.valor,
         COALESCE((
           SELECT array_agg(t.tema ORDER BY t.tema) FROM t
           WHERE EXISTS (SELECT 1 FROM unnest(t.termos) u WHERE u <> '' AND position(u IN b.descricao_norm) > 0)
         ), '{}'::text[])
  FROM base b;
$$;

-- ---------------------------------------------------------------------
-- 3. Funções agregadoras de relatório
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.relatorio_totais_tema(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL
) RETURNS TABLE (tema text, itens bigint, proventos numeric, descontos numeric)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s' AS $$
  SELECT tema, count(DISTINCT f.item_id),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0)
  FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate) f
  CROSS JOIN LATERAL unnest(CASE WHEN cardinality(f.temas) = 0 THEN ARRAY['(sem tema)']::text[] ELSE f.temas END) AS tema
  GROUP BY tema ORDER BY tema;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_total_geral(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL
) RETURNS TABLE (itens bigint, pessoas bigint, pessoas_sem_cpf bigint, casos bigint,
                 empresas bigint, proventos numeric, descontos numeric)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s' AS $$
  SELECT count(DISTINCT f.item_id),
         count(DISTINCT f.pessoa_id),
         count(DISTINCT f.pessoa_id) FILTER (WHERE f.pessoa_identificacao = 'caso_sem_cpf'),
         0::bigint,
         count(DISTINCT f.empresa_id),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0)
  FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate) f;
$$;

DROP FUNCTION IF EXISTS public.relatorio_por_pessoa(jsonb, jsonb, text[], text, text, integer, integer);

CREATE FUNCTION public.relatorio_por_pessoa(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (pessoa_id text, pessoa_identificacao text, pessoa_nome text, pessoa_cpf text,
                 empresa text, competencias bigint, temas text[],
                 casos bigint, itens bigint, proventos numeric, descontos numeric, total_linhas bigint)
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

CREATE OR REPLACE FUNCTION public.relatorio_por_empresa(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (empresa_id text, empresa_nome text, pessoas bigint, itens bigint,
                 proventos numeric, descontos numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s' AS $$
  WITH agg AS (
    SELECT f.empresa_id, max(f.empresa) AS empresa_nome,
           count(DISTINCT f.pessoa_id) AS pessoas,
           count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate) f
    GROUP BY f.empresa_id
  )
  SELECT a.empresa_id, a.empresa_nome, a.pessoas, a.itens, a.proventos, a.descontos,
         count(*) OVER () AS total_linhas
  FROM agg a
  ORDER BY a.proventos DESC, a.empresa_nome, a.empresa_id
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.relatorio_rubricas(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (codigo text, descricao text, tipo text, empresa_id text, empresa text, itens bigint,
                 proventos numeric, descontos numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s' AS $$
  WITH agg AS (
    SELECT f.codigo, f.descricao, f.tipo, f.empresa_id, f.empresa,
           count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate) f
    GROUP BY f.codigo, f.descricao, f.tipo, f.empresa_id, f.empresa
  )
  SELECT a.codigo, a.descricao, a.tipo, a.empresa_id, a.empresa, a.itens, a.proventos, a.descontos,
         count(*) OVER () AS total_linhas
  FROM agg a
  ORDER BY a.itens DESC, a.descricao NULLS LAST, a.codigo NULLS LAST, a.tipo NULLS LAST, a.empresa_id
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.relatorio_lancamentos_pessoa(
  p_pessoa_id text, p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 200, p_offset integer DEFAULT 0
) RETURNS TABLE (item_id uuid, competencia text, codigo text, descricao text, tipo text,
                 valor numeric, empresa text, caso_id uuid, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s' AS $$
  SELECT f.item_id, f.competencia, f.codigo, f.descricao, f.tipo, f.valor, f.empresa, f.caso_id,
         count(*) OVER () AS total_linhas
  FROM public.relatorio_itens_filtrados(p_temas, p_rubricas, p_empresas, p_de, p_ate) f
  WHERE f.pessoa_id = p_pessoa_id
  ORDER BY f.comp_data NULLS LAST, f.codigo NULLS LAST, f.descricao NULLS LAST, f.item_id
  LIMIT GREATEST(COALESCE(p_limit, 200), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.relatorio_opcoes_empresa(
  p_busca text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (empresa_id text, empresa_rotulo text, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s' AS $$
  WITH opcoes AS (
    SELECT COALESCE(c.empresa_id::text, '(sem empresa/modelo)') AS empresa_id,
           COALESCE(NULLIF(btrim(e.nome), ''), '(sem empresa/modelo)') AS empresa_rotulo
    FROM public.contracheques c
    LEFT JOIN public.empresas e ON e.id = c.empresa_id
    GROUP BY 1, 2
  ), filtradas AS (
    SELECT * FROM opcoes
    WHERE public.normalizar_termo_tema(COALESCE(p_busca, '')) = ''
       OR position(public.normalizar_termo_tema(p_busca) IN public.normalizar_termo_tema(empresa_rotulo)) > 0
  )
  SELECT empresa_id, empresa_rotulo, count(*) OVER ()
  FROM filtradas
  ORDER BY empresa_rotulo, empresa_id
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------
-- 4. Permissões de execução (apenas service_role)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.relatorio_itens_filtrados(jsonb, jsonb, text[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relatorio_totais_tema(jsonb, jsonb, text[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relatorio_total_geral(jsonb, jsonb, text[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relatorio_por_pessoa(jsonb, jsonb, text[], text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relatorio_por_empresa(jsonb, jsonb, text[], text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relatorio_rubricas(jsonb, jsonb, text[], text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relatorio_lancamentos_pessoa(text, jsonb, jsonb, text[], text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relatorio_opcoes_empresa(text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.relatorio_itens_filtrados(jsonb, jsonb, text[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_totais_tema(jsonb, jsonb, text[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_total_geral(jsonb, jsonb, text[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_por_pessoa(jsonb, jsonb, text[], text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_por_empresa(jsonb, jsonb, text[], text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_rubricas(jsonb, jsonb, text[], text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_lancamentos_pessoa(text, jsonb, jsonb, text[], text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_opcoes_empresa(text, integer, integer) TO service_role;
