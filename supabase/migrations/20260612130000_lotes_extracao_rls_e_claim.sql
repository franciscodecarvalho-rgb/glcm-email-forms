-- lotes_extracao: a tabela já existe na nuvem (foi criada fora do repo), mas
-- SEM policy de leitura — por isso a tela de progresso ficava em "0 de 0 lotes".
-- IF NOT EXISTS cobre ambientes novos; as policies corrigem a visibilidade.
CREATE TABLE IF NOT EXISTS public.lotes_extracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id uuid NOT NULL REFERENCES public.casos(id) ON DELETE CASCADE,
  ordem integer NOT NULL,
  arquivo_ids uuid[] NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  resultado jsonb,
  erro text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lotes_extracao_caso ON public.lotes_extracao (caso_id);

ALTER TABLE public.lotes_extracao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read lotes_extracao" ON public.lotes_extracao;
CREATE POLICY "auth read lotes_extracao" ON public.lotes_extracao
  FOR SELECT TO authenticated USING (true);

-- Claim atômico de finalização do fan-out: com 1 worker por lote, dois podem
-- terminar ao mesmo tempo; o primeiro INSERT (PK) ganha e finaliza o caso.
-- Só a service role escreve aqui (sem policies = RLS nega anon/authenticated).
CREATE TABLE IF NOT EXISTS public.finalizacoes_extracao (
  caso_id uuid PRIMARY KEY REFERENCES public.casos(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finalizacoes_extracao ENABLE ROW LEVEL SECURITY;
