-- Preserve shared visibility for every active application account while
-- removing direct access to mutations that belong to administrators/workers.
-- This migration does not change document extraction functions or their flow.

-- Cases remain visible and editable by the authenticated team. Deletion is
-- reserved for admins because it cascades into case data.
DROP POLICY IF EXISTS "auth read casos" ON public.casos;
CREATE POLICY "auth read casos" ON public.casos
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'user'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "auth insert casos" ON public.casos;
CREATE POLICY "auth insert casos" ON public.casos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'user'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "auth update casos" ON public.casos;
CREATE POLICY "auth update casos" ON public.casos
  FOR UPDATE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'user'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'user'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "auth delete casos" ON public.casos;
CREATE POLICY "admin delete casos" ON public.casos
  FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- File metadata can be created by the case upload flow; only admins may
-- rewrite or remove metadata.
DROP POLICY IF EXISTS "auth read arquivos" ON public.arquivos;
CREATE POLICY "auth read arquivos" ON public.arquivos
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'user'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "auth insert arquivos" ON public.arquivos;
CREATE POLICY "auth insert arquivos" ON public.arquivos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'user'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "auth update arquivos" ON public.arquivos;
CREATE POLICY "admin update arquivos" ON public.arquivos
  FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "auth delete arquivos" ON public.arquivos;
CREATE POLICY "admin delete arquivos" ON public.arquivos
  FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- Structured payslip data and extraction batches are written by the backend
-- using service_role; authenticated clients retain read-only access.
DROP POLICY IF EXISTS "auth read contracheques" ON public.contracheques;
CREATE POLICY "auth read contracheques" ON public.contracheques
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'user'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS "auth insert contracheques" ON public.contracheques;
DROP POLICY IF EXISTS "auth update contracheques" ON public.contracheques;
DROP POLICY IF EXISTS "auth delete contracheques" ON public.contracheques;
REVOKE INSERT, UPDATE, DELETE ON public.contracheques FROM authenticated;

DROP POLICY IF EXISTS "auth read itens_contracheque" ON public.itens_contracheque;
CREATE POLICY "auth read itens_contracheque" ON public.itens_contracheque
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'user'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS "auth insert itens_contracheque" ON public.itens_contracheque;
DROP POLICY IF EXISTS "auth update itens_contracheque" ON public.itens_contracheque;
DROP POLICY IF EXISTS "auth delete itens_contracheque" ON public.itens_contracheque;
REVOKE INSERT, UPDATE, DELETE ON public.itens_contracheque FROM authenticated;

DROP POLICY IF EXISTS "auth read lotes_extracao" ON public.lotes_extracao;
CREATE POLICY "auth read lotes_extracao" ON public.lotes_extracao
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'user'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS "auth insert lotes_extracao" ON public.lotes_extracao;
DROP POLICY IF EXISTS "auth update lotes_extracao" ON public.lotes_extracao;
DROP POLICY IF EXISTS "auth delete lotes_extracao" ON public.lotes_extracao;
REVOKE INSERT, UPDATE, DELETE ON public.lotes_extracao FROM authenticated;

DROP POLICY IF EXISTS "auth read lotes_contracheques" ON public.lotes_contracheques;
CREATE POLICY "auth read lotes_contracheques" ON public.lotes_contracheques
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'user'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

-- All authenticated team members can read templates for document generation;
-- changing or deleting a template is an administrative action.
DROP POLICY IF EXISTS "auth read templates" ON public.templates;
CREATE POLICY "auth read templates" ON public.templates
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'user'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS "auth insert templates" ON public.templates;
CREATE POLICY "admin insert templates" ON public.templates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
DROP POLICY IF EXISTS "auth update templates" ON public.templates;
CREATE POLICY "admin update templates" ON public.templates
  FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
DROP POLICY IF EXISTS "auth delete templates" ON public.templates;
CREATE POLICY "admin delete templates" ON public.templates
  FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- Storage remains shared across the authenticated team, as required for cases.
-- Upload/upsert to these buckets is part of current case/document generation.
-- Delete is admin-only; generated-file and template uploads remain available to
-- the current authenticated workflow.
DROP POLICY IF EXISTS "auth read casos-arquivos" ON storage.objects;
CREATE POLICY "auth read casos-arquivos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'casos-arquivos'
    AND (
      public.has_role((SELECT auth.uid()), 'user'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    )
  );
DROP POLICY IF EXISTS "auth write casos-arquivos" ON storage.objects;
CREATE POLICY "auth write casos-arquivos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'casos-arquivos'
    AND (
      public.has_role((SELECT auth.uid()), 'user'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    )
  );
DROP POLICY IF EXISTS "auth update casos-arquivos" ON storage.objects;
CREATE POLICY "auth update casos-arquivos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'casos-arquivos'
    AND (
      public.has_role((SELECT auth.uid()), 'user'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'casos-arquivos'
    AND (
      public.has_role((SELECT auth.uid()), 'user'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    )
  );
DROP POLICY IF EXISTS "auth delete casos-arquivos" ON storage.objects;
CREATE POLICY "admin delete casos-arquivos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'casos-arquivos'
    AND public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "auth read casos-documentos" ON storage.objects;
CREATE POLICY "auth read casos-documentos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'casos-documentos'
    AND (
      public.has_role((SELECT auth.uid()), 'user'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    )
  );
DROP POLICY IF EXISTS "auth write casos-documentos" ON storage.objects;
CREATE POLICY "auth write casos-documentos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'casos-documentos'
    AND (
      public.has_role((SELECT auth.uid()), 'user'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    )
  );
DROP POLICY IF EXISTS "auth update casos-documentos" ON storage.objects;
CREATE POLICY "auth update casos-documentos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'casos-documentos'
    AND (
      public.has_role((SELECT auth.uid()), 'user'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'casos-documentos'
    AND (
      public.has_role((SELECT auth.uid()), 'user'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    )
  );
DROP POLICY IF EXISTS "auth delete casos-documentos" ON storage.objects;
CREATE POLICY "admin delete casos-documentos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'casos-documentos'
    AND public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "auth read templates" ON storage.objects;
CREATE POLICY "auth read templates" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'templates'
    AND (
      public.has_role((SELECT auth.uid()), 'user'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    )
  );
DROP POLICY IF EXISTS "auth write templates" ON storage.objects;
CREATE POLICY "admin write templates" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'templates'
    AND public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS "auth update templates" ON storage.objects;
CREATE POLICY "admin update templates" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'templates'
    AND public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'templates'
    AND public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS "auth delete templates" ON storage.objects;
CREATE POLICY "admin delete templates" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'templates'
    AND public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );
