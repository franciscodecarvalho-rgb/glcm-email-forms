ALTER TABLE public.contracheques
  ADD COLUMN IF NOT EXISTS modelo_origem text;

ALTER TABLE public.itens_contracheque
  ADD COLUMN IF NOT EXISTS referencia numeric;
