
WITH t AS (
  SELECT e->>'tema' AS tema,
         ARRAY(SELECT public.normalizar_termo_tema(x) FROM jsonb_array_elements_text(e->'termos') x) AS termos
  FROM jsonb_array_elements('[{"tema": "Banco de Horas", "termos": ["banco de horas"]}]'::jsonb) e
),
t_termos_todos AS (
  SELECT DISTINCT u AS termo FROM t, unnest(t.termos) u WHERE u <> ''
),
rubricas_por_tema AS (
  SELECT DISTINCT ON (r.id) r.id, r.tipo
  FROM t_termos_todos tt
  CROSS JOIN LATERAL (
    SELECT rub.id, rub.tipo
    FROM datalake_v2.rubricas rub
    WHERE rub.tipo IN ('provento', 'desconto')
      AND rub.descricao_normalizada LIKE '%' || public.escapar_like_literal(tt.termo) || '%' ESCAPE E'\\'
  ) r
),
itens_f AS (
  SELECT
    v.pessoa_id,
    c.competencia AS comp_data,
    i.id AS item_id,
    (i.valor_centavos / 100.0)::numeric(12,2) AS valor,
    ra.tipo
  FROM rubricas_por_tema ra
  JOIN datalake_v2.itens_contracheque i ON i.rubrica_id = ra.id
  JOIN datalake_v2.contracheques c ON c.id = i.contracheque_id
  JOIN datalake_v2.vinculos v ON v.id = c.vinculo_id
  WHERE i.valor_centavos > 0
),
agg AS (
  SELECT
    f.pessoa_id,
    count(DISTINCT f.comp_data) AS competencias,
    count(DISTINCT f.item_id) AS itens,
    COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'provento'), 0)::numeric(12,2) AS proventos,
    COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'desconto'), 0)::numeric(12,2) AS descontos
  FROM itens_f f
  GROUP BY f.pessoa_id
)
SELECT p.id, p.nome, a.competencias, a.itens, a.proventos, a.descontos
FROM agg a
JOIN datalake_v2.pessoas p ON p.id = a.pessoa_id
WHERE p.nome ILIKE '%abel gomes%'
LIMIT 5;
