
CREATE TABLE IF NOT EXISTS datalake_v2.contracheque_totais AS
SELECT
  c.id AS contracheque_id,
  c.vinculo_id,
  c.competencia,
  COUNT(i.id)::int AS itens_count,
  COALESCE(SUM(i.valor_centavos) FILTER (WHERE r.tipo = 'provento'), 0)::bigint AS proventos_centavos,
  COALESCE(SUM(i.valor_centavos) FILTER (WHERE r.tipo = 'desconto'), 0)::bigint AS descontos_centavos
FROM datalake_v2.contracheques c
LEFT JOIN datalake_v2.itens_contracheque i ON i.contracheque_id = c.id
LEFT JOIN datalake_v2.rubricas r ON r.id = i.rubrica_id
GROUP BY c.id, c.vinculo_id, c.competencia;

CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_cc_totais_pk ON datalake_v2.contracheque_totais(contracheque_id);
CREATE INDEX IF NOT EXISTS idx_v2_cc_totais_vinculo ON datalake_v2.contracheque_totais(vinculo_id, competencia);
