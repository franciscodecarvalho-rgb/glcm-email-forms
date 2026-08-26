-- Marca, por lote de páginas, se e como o fallback de IA foi tentado. Sem
-- isso o fallback só sabia processar o arquivo inteiro numa única chamada
-- (não perde estado entre lotes); com a coluna, cada lote de páginas pode
-- ser enviado à IA separadamente e uma retomada sabe quais já foram feitos.
ALTER TABLE public.lotes_contracheques
  ADD COLUMN IF NOT EXISTS ia_status text;