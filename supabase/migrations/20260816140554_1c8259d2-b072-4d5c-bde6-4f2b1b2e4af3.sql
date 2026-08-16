DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casos_tipo_acao_valido_check'
      AND conrelid = 'public.casos'::regclass
  ) THEN
    ALTER TABLE public.casos
      ADD CONSTRAINT casos_tipo_acao_valido_check
      CHECK (
        tipo_acao IN (
          'ir_sobre_hra',
          'horas_extras',
          'supressao_folgas',
          'contribuicao_extraordinaria'
        )
      ) NOT VALID;
  END IF;
END
$$;