
CREATE POLICY "auth update casos-documentos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'casos-documentos')
  WITH CHECK (bucket_id = 'casos-documentos');

CREATE POLICY "admins manage user_roles insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage user_roles update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage user_roles delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
