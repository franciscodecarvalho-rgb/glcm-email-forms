
WITH t AS (
  SELECT e->>'tema' AS tema,
         ARRAY(SELECT public.normalizar_termo_tema(x) FROM jsonb_array_elements_text(e->'termos') x) AS termos
  FROM jsonb_array_elements('[{"tema": "Banco de Horas", "termos": ["banco de horas"]}]'::jsonb) e
),
t_termos_todos AS (
  SELECT DISTINCT u AS termo FROM t, unnest(t.termos) u WHERE u <> ''
),
rubricas_alvo AS MATERIALIZED (
  SELECT rub.id, rub.tipo
  FROM datalake_v2.rubricas rub
  WHERE rub.tipo IN ('provento', 'desconto')
    AND EXISTS (
      SELECT 1 FROM t_termos_todos tt
      WHERE rub.descricao_normalizada LIKE '%' || public.escapar_like_literal(tt.termo) || '%' ESCAPE E'\\'
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
    ARRAY['Banco de Horas']::text[] AS temas,
    a.casos,
    a.itens,
    a.proventos,
    a.descontos,
    count(*) OVER () AS total_linhas
  FROM agg a
  JOIN datalake_v2.pessoas p ON p.id = a.pessoa_id
  ORDER BY a.proventos DESC, p.nome NULLS LAST
  LIMIT 5 OFFSET 0
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
