CREATE OR REPLACE FUNCTION public.competencia_para_data(_valor text)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _valor IS NULL THEN NULL
    WHEN btrim(_valor) ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
         AND substr(btrim(_valor), 4, 4) <> '0000'
      THEN make_date(substr(btrim(_valor), 4, 4)::int, substr(btrim(_valor), 1, 2)::int, 1)
    WHEN btrim(_valor) ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
         AND substr(btrim(_valor), 1, 4) <> '0000'
      THEN make_date(substr(btrim(_valor), 1, 4)::int, substr(btrim(_valor), 6, 2)::int, 1)
    ELSE NULL
  END
$function$;