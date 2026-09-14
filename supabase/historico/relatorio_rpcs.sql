-- =====================================================================
-- Funções de agregação a aplicar SOMENTE na base histórica
-- (projeto pcquefluiltrvwjpndvw). NÃO aplicar no banco do aplicativo.
--
-- Devem ser criadas com o mesmo nome e a mesma assinatura das funções já
-- existentes no banco do aplicativo, para que a tela de Relatórios use o
-- mesmo contrato nas duas fontes.
--
-- ATENÇÃO — premissas de esquema a validar antes de aplicar:
--   funcionarios(id, nome, cpf, empresa_id)
--   empresas(id, nome)
--   contracheques(id, funcionario_id, empresa_id, competencia)
--   itens_contracheque(id, contracheque_id, codigo, descricao, valor, tipo)
-- Se algum nome de coluna divergir, ajuste APENAS as referências abaixo.
-- `competencia` é tratada como texto MM/AAAA; se for date, troque a
-- expressão comp_data por `c.competencia` e o filtro por comparação direta.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.normalizar_termo_tema(p_valor text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(lower(coalesce(p_valor, '')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.relatorio_itens_filtrados(
  p_temas jsonb DEFAULT '[]'::jsonb,
  p_codigos text[] DEFAULT NULL,
  p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL,
  p_ate text DEFAULT NULL
) RETURNS TABLE (
  item_id uuid, contracheque_id uuid, caso_id uuid,
  pessoa_id text, pessoa_nome text, pessoa_cpf text, empresa text,
  competencia text, codigo text, descricao text, tipo text,
  valor numeric, temas text[]
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH t AS (
    SELECT e->>'tema' AS tema,
           ARRAY(SELECT public.normalizar_termo_tema(x) FROM jsonb_array_elements_text(e->'termos') x) AS termos
    FROM jsonb_array_elements(COALESCE(p_temas, '[]'::jsonb)) e
  ),
  base AS (
    SELECT i.id AS item_id, i.contracheque_id, NULL::uuid AS caso_id,
           f.id::text AS pessoa_id, f.nome AS pessoa_nome, f.cpf AS pessoa_cpf,
           COALESCE(NULLIF(btrim(em.nome), ''), '(sem empresa)') AS empresa,
           c.competencia::text AS competencia, i.codigo, i.descricao, i.tipo, i.valor,
           public.normalizar_termo_tema(i.descricao) AS descricao_norm,
           CASE WHEN c.competencia::text ~ '^[0-9]{2}/[0-9]{4}$'
                THEN to_date(c.competencia::text, 'MM/YYYY') END AS comp_data
    FROM public.itens_contracheque i
    JOIN public.contracheques c ON c.id = i.contracheque_id
    LEFT JOIN public.funcionarios f ON f.id = c.funcionario_id
    LEFT JOIN public.empresas em ON em.id = c.empresa_id
  )
  SELECT b.item_id, b.contracheque_id, b.caso_id, b.pessoa_id, b.pessoa_nome, b.pessoa_cpf,
         b.empresa, b.competencia, b.codigo, b.descricao, b.tipo, b.valor,
         COALESCE((SELECT array_agg(t.tema ORDER BY t.tema) FROM t
                   WHERE EXISTS (SELECT 1 FROM unnest(t.termos) u
                                 WHERE u <> '' AND position(u IN b.descricao_norm) > 0)), '{}'::text[])
  FROM base b
  WHERE (p_codigos IS NULL OR b.codigo = ANY(p_codigos))
    AND (p_empresas IS NULL OR b.empresa = ANY(p_empresas))
    AND (p_de IS NULL OR (b.comp_data IS NOT NULL AND b.comp_data >= to_date(p_de, 'MM/YYYY')))
    AND (p_ate IS NULL OR (b.comp_data IS NOT NULL AND b.comp_data <= to_date(p_ate, 'MM/YYYY')))
    AND ((SELECT count(*) FROM t) = 0
         OR EXISTS (SELECT 1 FROM t WHERE EXISTS (
              SELECT 1 FROM unnest(t.termos) u WHERE u <> '' AND position(u IN b.descricao_norm) > 0)));
$$;

CREATE OR REPLACE FUNCTION public.relatorio_total_geral(
  p_temas jsonb DEFAULT '[]'::jsonb, p_codigos text[] DEFAULT NULL, p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL, p_ate text DEFAULT NULL
) RETURNS TABLE (itens bigint, pessoas bigint, empresas bigint, proventos numeric, descontos numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT count(DISTINCT f.item_id), count(DISTINCT f.pessoa_id), count(DISTINCT f.empresa),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0)
  FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_totais_tema(
  p_temas jsonb DEFAULT '[]'::jsonb, p_codigos text[] DEFAULT NULL, p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL, p_ate text DEFAULT NULL
) RETURNS TABLE (tema text, itens bigint, proventos numeric, descontos numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT tema, count(DISTINCT f.item_id),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0),
         COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0)
  FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f
  CROSS JOIN LATERAL unnest(CASE WHEN cardinality(f.temas) = 0 THEN ARRAY['(sem tema)']::text[] ELSE f.temas END) AS tema
  GROUP BY tema ORDER BY tema;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_por_pessoa(
  p_temas jsonb DEFAULT '[]'::jsonb, p_codigos text[] DEFAULT NULL, p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL, p_ate text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (pessoa_id text, pessoa_nome text, pessoa_cpf text,
                 itens bigint, proventos numeric, descontos numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH agg AS (
    SELECT f.pessoa_id, max(f.pessoa_nome) AS pessoa_nome, max(f.pessoa_cpf) AS pessoa_cpf,
           count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f
    GROUP BY f.pessoa_id
  )
  SELECT a.pessoa_id, a.pessoa_nome, a.pessoa_cpf, a.itens, a.proventos, a.descontos, count(*) OVER ()
  FROM agg a ORDER BY a.proventos DESC, a.pessoa_nome NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.relatorio_por_empresa(
  p_temas jsonb DEFAULT '[]'::jsonb, p_codigos text[] DEFAULT NULL, p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL, p_ate text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (empresa_id text, empresa_nome text, pessoas bigint,
                 itens bigint, proventos numeric, descontos numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH agg AS (
    SELECT f.empresa AS empresa_id, f.empresa AS empresa_nome,
           count(DISTINCT f.pessoa_id) AS pessoas, count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f
    GROUP BY f.empresa
  )
  SELECT a.empresa_id, a.empresa_nome, a.pessoas, a.itens, a.proventos, a.descontos, count(*) OVER ()
  FROM agg a ORDER BY a.proventos DESC, a.empresa_nome
  LIMIT GREATEST(COALESCE(p_limit, 50), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.relatorio_lancamentos_pessoa(
  p_pessoa_id text, p_temas jsonb DEFAULT '[]'::jsonb, p_codigos text[] DEFAULT NULL,
  p_empresas text[] DEFAULT NULL, p_de text DEFAULT NULL, p_ate text DEFAULT NULL,
  p_limit integer DEFAULT 200, p_offset integer DEFAULT 0
) RETURNS TABLE (competencia text, codigo text, descricao text, tipo text,
                 valor numeric, empresa text, caso_id uuid, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT f.competencia, f.codigo, f.descricao, f.tipo, f.valor, f.empresa, f.caso_id, count(*) OVER ()
  FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f
  WHERE f.pessoa_id IS NOT DISTINCT FROM p_pessoa_id
  ORDER BY CASE WHEN f.competencia ~ '^[0-9]{2}/[0-9]{4}$' THEN to_date(f.competencia, 'MM/YYYY') END NULLS LAST,
           f.codigo, f.descricao
  LIMIT GREATEST(COALESCE(p_limit, 200), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.relatorio_rubricas(
  p_temas jsonb DEFAULT '[]'::jsonb, p_codigos text[] DEFAULT NULL, p_empresas text[] DEFAULT NULL,
  p_de text DEFAULT NULL, p_ate text DEFAULT NULL, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0
) RETURNS TABLE (codigo text, descricao text, tipo text, empresa text,
                 itens bigint, proventos numeric, descontos numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH agg AS (
    SELECT f.codigo, f.descricao, f.tipo, f.empresa, count(DISTINCT f.item_id) AS itens,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0) AS proventos,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0) AS descontos
    FROM public.relatorio_itens_filtrados(p_temas, p_codigos, p_empresas, p_de, p_ate) f
    GROUP BY f.codigo, f.descricao, f.tipo, f.empresa
  )
  SELECT a.codigo, a.descricao, a.tipo, a.empresa, a.itens, a.proventos, a.descontos, count(*) OVER ()
  FROM agg a ORDER BY a.itens DESC, a.descricao
  LIMIT GREATEST(COALESCE(p_limit, 200), 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- Índices sugeridos para a base histórica (>1,5 milhão de itens):
-- CREATE INDEX IF NOT EXISTS idx_itens_contracheque_contracheque ON public.itens_contracheque (contracheque_id);
-- CREATE INDEX IF NOT EXISTS idx_itens_contracheque_codigo ON public.itens_contracheque (codigo);
-- CREATE INDEX IF NOT EXISTS idx_itens_contracheque_descricao_norm
--   ON public.itens_contracheque (public.normalizar_termo_tema(descricao) text_pattern_ops);
