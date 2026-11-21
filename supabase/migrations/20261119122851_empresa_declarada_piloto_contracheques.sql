-- A seleção é declarada pelo usuário e não é a origem extraída das rubricas.
ALTER TABLE public.casos
  ADD COLUMN empresa_contracheque_declarada text,
  ADD CONSTRAINT casos_empresa_contracheque_piloto_check CHECK (
    empresa_contracheque_declarada IS NULL
    OR (origem = 'manual' AND empresa_contracheque_declarada IN ('acelen', 'oxiteno'))
  );

CREATE FUNCTION public.proteger_empresa_contracheque_declarada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.empresa_contracheque_declarada IS DISTINCT FROM OLD.empresa_contracheque_declarada THEN
    RAISE EXCEPTION 'Para trocar a empresa, inicie uma nova importação.'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.empresa_contracheque_declarada IS NOT NULL
    AND NEW.importacao_concluida AND NOT OLD.importacao_concluida THEN
    IF EXISTS (
      SELECT 1 FROM public.contracheques
      WHERE caso_id = NEW.id AND (
        modelo_origem IS DISTINCT FROM NEW.empresa_contracheque_declarada OR competencia IS NULL
      )
    ) OR NOT EXISTS (
      SELECT 1 FROM public.lotes_contracheques
      WHERE caso_id = NEW.id AND storage_path IS NOT NULL
    ) OR EXISTS (
      SELECT 1 FROM public.lotes_contracheques
      WHERE caso_id = NEW.id AND (status <> 'concluido' OR storage_path IS NULL)
    ) THEN
      RAISE EXCEPTION 'Importação com empresa incompatível ou lote pendente.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proteger_empresa_contracheque_declarada
  BEFORE UPDATE ON public.casos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_empresa_contracheque_declarada();

-- Retomadas concorrentes recebem um único plano por importação provisória.
CREATE FUNCTION public.planejar_lotes_contracheque_piloto(
  p_caso uuid,
  p_arquivo uuid,
  p_lotes jsonb
)
RETURNS SETOF public.lotes_contracheques
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.casos c
  WHERE c.id = p_caso AND c.empresa_contracheque_declarada IS NOT NULL
    AND NOT c.importacao_concluida
  FOR UPDATE OF c;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.arquivos a
    WHERE a.id = p_arquivo AND a.caso_id = p_caso AND a.tipo = 'contracheque'
  ) THEN
    RAISE EXCEPTION 'Arquivo de contracheques ou importação provisória inválida.';
  END IF;

  RETURN QUERY
    SELECT l.* FROM public.lotes_contracheques l
    WHERE l.caso_id = p_caso AND l.storage_path IS NOT NULL
    ORDER BY l.ordem;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
    INSERT INTO public.lotes_contracheques (
      caso_id, arquivo_id, ordem, pagina_inicio, pagina_fim, status, storage_path
    )
    SELECT p_caso, p_arquivo, l.ordem, l.pagina_inicio, l.pagina_fim, 'pendente', l.storage_path
    FROM jsonb_to_recordset(p_lotes) AS l(ordem integer, pagina_inicio integer, pagina_fim integer, storage_path text)
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.planejar_lotes_contracheque_piloto(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planejar_lotes_contracheque_piloto(uuid, uuid, jsonb)
  TO service_role;

-- Um lote pode fechar recibos iniciados no lote anterior. Rubricas, recibos e
-- estado de saída são confirmados juntos, inclusive após perda de conexão.
CREATE FUNCTION public.concluir_lote_contracheque_piloto(
  p_caso uuid,
  p_lote uuid,
  p_arquivo text,
  p_recibos jsonb,
  p_estado jsonb,
  p_usou_ia boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  empresa text;
  recibo jsonb;
  recibo_id uuid;
  gravados integer := 0;
BEGIN
  SELECT c.empresa_contracheque_declarada INTO STRICT empresa
  FROM public.casos c
  JOIN public.lotes_contracheques l ON l.caso_id = c.id
  WHERE c.id = p_caso AND l.id = p_lote AND l.status = 'processando'
    AND l.storage_path IS NOT NULL AND NOT c.importacao_concluida
  FOR UPDATE OF l;

  IF empresa IS NULL OR (p_estado IS NOT NULL AND p_estado ->> 'modelo_origem' IS DISTINCT FROM empresa) THEN
    RAISE EXCEPTION 'Perfil do lote incompatível com a empresa declarada.';
  END IF;

  FOR recibo IN SELECT value FROM jsonb_array_elements(p_recibos)
  LOOP
    IF recibo ->> 'modelo_origem' IS DISTINCT FROM empresa
      OR COALESCE(recibo ->> 'competencia', '') !~ '^(0[1-9]|1[0-2])/20[0-9]{2}$'
      OR COALESCE(jsonb_array_length(recibo -> 'itens'), 0) = 0 THEN
      RAISE EXCEPTION 'Recibo sem competência, rubricas ou empresa compatível.';
    END IF;

    INSERT INTO public.contracheques (
      caso_id, competencia, modelo_origem, total_proventos, total_descontos,
      liquido, arquivo_origem, retificado
    ) VALUES (
      p_caso, recibo ->> 'competencia', empresa,
      (recibo ->> 'total_proventos')::numeric, (recibo ->> 'total_descontos')::numeric,
      (recibo ->> 'liquido')::numeric, p_arquivo, false
    ) RETURNING id INTO recibo_id;

    INSERT INTO public.itens_contracheque (contracheque_id, codigo, descricao, referencia, valor, tipo, familia_hra)
    SELECT recibo_id, i.codigo, i.descricao, i.referencia, i.valor, i.tipo, i.familia_hra
    FROM jsonb_to_recordset(recibo -> 'itens') AS i(
      codigo text, descricao text, referencia numeric, valor numeric, tipo text, familia_hra text
    );
    gravados := gravados + 1;
  END LOOP;

  UPDATE public.lotes_contracheques SET
    status = 'concluido', estado_saida = p_estado,
    ia_status = CASE WHEN p_usou_ia THEN 'concluido' ELSE NULL END,
    erro = NULL, atualizado_em = now()
  WHERE id = p_lote;

  RETURN gravados;
END;
$$;

REVOKE ALL ON FUNCTION public.concluir_lote_contracheque_piloto(uuid, uuid, text, jsonb, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.concluir_lote_contracheque_piloto(uuid, uuid, text, jsonb, jsonb, boolean)
  TO service_role;
