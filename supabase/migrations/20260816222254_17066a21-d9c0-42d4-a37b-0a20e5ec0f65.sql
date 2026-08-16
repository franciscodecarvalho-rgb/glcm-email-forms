ALTER TABLE public.casos
  DROP CONSTRAINT IF EXISTS casos_tipo_acao_valido_check;

ALTER TABLE public.casos
  ADD CONSTRAINT casos_tipo_acao_valido_check
  CHECK (
    tipo_acao IN (
      'ir_sobre_hra',
      'horas_extras',
      'supressao_folgas',
      'contribuicao_extraordinaria',
      'tema_324'
    )
  );