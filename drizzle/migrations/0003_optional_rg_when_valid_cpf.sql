-- A valid CPF is sufficient for identity validation; RG is optional.
-- Replace the manual-import promotion validator without changing other rules.
CREATE OR REPLACE FUNCTION public.validar_promocao_importacao_manual()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.origem = 'manual' THEN
      NEW.importacao_concluida := false;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.importacao_concluida IS DISTINCT FROM OLD.importacao_concluida
     AND NEW.importacao_concluida THEN
    IF nullif(btrim(NEW.nome_cliente), '') IS NULL
       OR nullif(btrim(NEW.endereco ->> 'logradouro'), '') IS NULL THEN
      RAISE EXCEPTION 'Importação incompleta: informe nome e logradouro.'
        USING ERRCODE = '23514';
    END IF;

    IF NOT public.cpf_valido(NEW.cpf) THEN
      RAISE EXCEPTION 'Importação incompleta: informe um CPF válido.'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.arquivos
      WHERE caso_id = NEW.id AND tipo = 'informacoes_pessoais'
    ) OR NOT EXISTS (
      SELECT 1 FROM public.arquivos
      WHERE caso_id = NEW.id AND tipo = 'contracheque'
    ) THEN
      RAISE EXCEPTION 'Importação incompleta: comprovantes pessoais e contracheques precisam estar anexados.'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.contracheques c
      JOIN public.itens_contracheque i ON i.contracheque_id = c.id
      WHERE c.caso_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Importação incompleta: nenhuma rubrica de contracheque foi validada.'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.lotes_contracheques
      WHERE caso_id = NEW.id
    ) OR EXISTS (
      SELECT 1 FROM public.lotes_contracheques
      WHERE caso_id = NEW.id AND status <> 'concluido'
    ) THEN
      RAISE EXCEPTION 'Importação incompleta: ainda há lotes de contracheques pendentes.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
