ALTER TABLE public.casos ADD COLUMN IF NOT EXISTS message_id text;
CREATE UNIQUE INDEX IF NOT EXISTS casos_message_id_key ON public.casos(message_id) WHERE message_id IS NOT NULL;