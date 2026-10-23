ALTER TABLE public.contracheques
  ADD COLUMN IF NOT EXISTS retificado boolean NOT NULL DEFAULT false;
