
SELECT * FROM public.relatorio_v2_resumo_pessoas(
  p_temas := '[]'::jsonb,
  p_rubricas := '[]'::jsonb,
  p_empresas := NULL,
  p_de := NULL,
  p_ate := NULL,
  p_limit := 5,
  p_offset := 0
);
