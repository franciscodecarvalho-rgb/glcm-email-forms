ALTER TABLE public.casos
  ADD COLUMN IF NOT EXISTS limite_viabilidade numeric NOT NULL DEFAULT 15000
  CHECK (limite_viabilidade >= 0);
