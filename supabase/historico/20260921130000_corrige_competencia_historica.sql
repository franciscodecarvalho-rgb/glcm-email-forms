-- Base histórica: aceita anos reais nas competências MM/AAAA e AAAA-MM.
-- A versão anterior exigia ano iniciado por zero e convertia todas as competências atuais em NULL.

BEGIN;

CREATE OR REPLACE FUNCTION public.competencia_para_data(_valor text)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _valor IS NULL THEN NULL
    WHEN btrim(_valor) ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
         AND substr(btrim(_valor), 4, 4) <> '0000'
      THEN make_date(substr(btrim(_valor), 4, 4)::int, substr(btrim(_valor), 1, 2)::int, 1)
    WHEN btrim(_valor) ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
         AND substr(btrim(_valor), 1, 4) <> '0000'
      THEN make_date(substr(btrim(_valor), 1, 4)::int, substr(btrim(_valor), 6, 2)::int, 1)
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.competencia_para_data(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.competencia_para_data(text) TO service_role;

COMMIT;
