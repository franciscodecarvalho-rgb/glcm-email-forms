ALTER TABLE public.casos
  ADD COLUMN IF NOT EXISTS tipo_acao       text  NOT NULL DEFAULT 'ir_sobre_hra',
  ADD COLUMN IF NOT EXISTS escritorios     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS honorarios_pct  numeric,
  ADD COLUMN IF NOT EXISTS qualificacao    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS empregadores    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS valor_causa     numeric;
