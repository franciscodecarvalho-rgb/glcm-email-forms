CREATE OR REPLACE FUNCTION public.competencia_para_data(_valor text)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _valor IS NULL THEN NULL
    WHEN btrim(_valor) ~ '^(0[1-9]|1[0-2])/(0[1-9][0-9]{3})$'
      THEN make_date(substr(btrim(_valor), 4, 4)::int, substr(btrim(_valor), 1, 2)::int, 1)
    WHEN btrim(_valor) ~ '^(0[1-9][0-9]{3})-(0[1-9]|1[0-2])$'
      THEN make_date(substr(btrim(_valor), 1, 4)::int, substr(btrim(_valor), 6, 2)::int, 1)
    ELSE NULL
  END
$$;
