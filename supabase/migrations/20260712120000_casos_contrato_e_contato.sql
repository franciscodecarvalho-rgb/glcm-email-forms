-- Campos que os templates já usam mas o sistema não tinha onde preencher:
-- {NUMERO_CONTRATO}, {EMAIL_CLIENTE}, {TELEFONE_CLIENTE} saíam sempre em branco.
-- ATENÇÃO: aplicar manualmente no SQL Editor do Supabase (o sync repo→cloud de
-- migrations nunca foi comprovado neste projeto).
alter table public.casos add column if not exists numero_contrato text;
alter table public.casos add column if not exists email_cliente text;
alter table public.casos add column if not exists telefone_cliente text;
