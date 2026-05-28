
ALTER TABLE public.casos
  ADD COLUMN mesclado_em uuid NULL REFERENCES public.casos(id) ON DELETE SET NULL,
  ADD COLUMN possivel_duplicata_de uuid NULL REFERENCES public.casos(id) ON DELETE SET NULL,
  ADD COLUMN cliente_recorrente_ref uuid NULL REFERENCES public.casos(id) ON DELETE SET NULL,
  ADD COLUMN mesclado_at timestamptz NULL,
  ADD COLUMN cpf_pre_extraido text NULL,
  ADD COLUMN nome_pre_extraido text NULL;

CREATE INDEX idx_casos_cpf_pre_extraido ON public.casos(cpf_pre_extraido);
CREATE INDEX idx_casos_mesclado_em ON public.casos(mesclado_em);

ALTER TABLE public.arquivos ADD COLUMN caso_id_origem uuid NULL;
CREATE INDEX idx_arquivos_caso_id_origem ON public.arquivos(caso_id_origem);
