-- Base histórica: busca indexada por descrição normalizada e carga única da visão Por cliente.
-- Reduz varreduras repetidas das rubricas financeiras no carregamento inicial.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_itens_relatorio_descricao_norm_trgm
  ON public.itens_contracheque
  USING gin (public.normalizar_termo_tema(descricao) gin_trgm_ops)
  WHERE valor > 0 AND tipo IN ('provento', 'desconto');

CREATE OR REPLACE FUNCTION public.escapar_like_literal(_valor text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT replace(
    replace(
      replace(coalesce(_valor, ''), chr(92), chr(92) || chr(92)),
      '%', chr(92) || '%'
    ),
    '_', chr(92) || '_'
  );
$$;

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
  -- 1. FILTRAGEM PRECOCE COM GIN: cada termo conduz uma busca indexada.
  -- DISTINCT ON preserva um item que corresponda a mais de um termo.
  itens_por_tema AS (
    SELECT DISTINCT ON (i.id)
           i.id AS item_id,
           i.contracheque_id,
           i.codigo,
           i.descricao,
           i.tipo,
           i.valor,
           public.normalizar_termo_tema(i.descricao) AS descricao_norm
    FROM t_termos_todos tt
    CROSS JOIN LATERAL (
      SELECT i.id, i.contracheque_id, i.codigo, i.descricao, i.tipo, i.valor
      FROM public.itens_contracheque i
      WHERE i.valor > 0
        AND i.tipo IN ('provento', 'desconto')
        AND public.normalizar_termo_tema(i.descricao) LIKE
          '%' || public.escapar_like_literal(tt.termo) || '%' ESCAPE E'\\'
        AND (
          (SELECT count(*) FROM r) = 0
          OR EXISTS (
            SELECT 1 FROM r
            WHERE r.codigo IS NOT DISTINCT FROM i.codigo
              AND r.descricao IS NOT DISTINCT FROM i.descricao
              AND r.tipo IS NOT DISTINCT FROM i.tipo
          )
        )
    ) i
    ORDER BY i.id
  ),
  itens_sem_tema AS (
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
      AND NOT EXISTS (SELECT 1 FROM t)
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
  itens_candidatos AS (
    SELECT * FROM itens_por_tema
    UNION ALL
    SELECT * FROM itens_sem_tema
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

CREATE OR REPLACE FUNCTION public.relatorio_resumo_pessoas(
  p_temas jsonb DEFAULT '[]'::jsonb, p_rubricas jsonb DEFAULT '[]'::jsonb,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (resumo jsonb, linhas jsonb)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s' AS $$
  WITH filtrados AS MATERIALIZED (
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
  ),
  pagina AS (
    SELECT a.pessoa_id, a.pessoa_identificacao, a.pessoa_nome, a.pessoa_cpf,
           a.empresa, a.competencias, COALESCE(tp.temas, '{}'::text[]) AS temas,
           a.casos, a.itens, a.proventos, a.descontos, count(*) OVER () AS total_linhas
    FROM agg a
    LEFT JOIN temas_pessoa tp ON tp.pessoa_id = a.pessoa_id
    ORDER BY a.proventos DESC, a.pessoa_nome NULLS LAST, a.pessoa_id
    LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT
    (
      SELECT jsonb_build_object(
        'itens', count(DISTINCT f.item_id),
        'pessoas', count(DISTINCT f.pessoa_id),
        'pessoas_sem_cpf', count(DISTINCT f.pessoa_id) FILTER (WHERE f.pessoa_identificacao = 'caso_sem_cpf'),
        'casos', 0,
        'empresas', count(DISTINCT f.empresa_id),
        'proventos', COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0),
        'descontos', COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0)
      )
      FROM filtrados f
    ),
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.proventos DESC, p.pessoa_nome NULLS LAST, p.pessoa_id)
        FROM pagina p
      ),
      '[]'::jsonb
    );
$$;

REVOKE ALL ON FUNCTION public.escapar_like_literal(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relatorio_itens_filtrados(jsonb, jsonb, text[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relatorio_resumo_pessoas(jsonb, jsonb, text[], text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escapar_like_literal(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_itens_filtrados(jsonb, jsonb, text[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.relatorio_resumo_pessoas(jsonb, jsonb, text[], text, text, integer, integer) TO service_role;

COMMIT;