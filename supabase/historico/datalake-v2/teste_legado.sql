
SELECT * FROM public.relatorio_resumo_pessoas(
  p_temas := '[{"tema": "Banco de Horas", "termos": ["banco de horas"]}]'::jsonb,
  p_rubricas := '[]'::jsonb,
  p_empresas := NULL,
  p_de := NULL,
  p_ate := NULL,
  p_limit := 5,
  p_offset := 0
);
