-- ============================================================================
-- KING SPORTS — MIGRATION: RLS, PERMISSÕES POR UNIDADE E STORAGE PRIVADO (portal)
-- ============================================================================

GRANT USAGE ON SCHEMA portal TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA portal TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA portal TO authenticated;
REVOKE ALL ON SCHEMA portal FROM anon;

-- Funções auxiliares de autorização baseadas em auth.uid() real
CREATE OR REPLACE FUNCTION portal.current_user_is_network_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portal, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM portal.unit_memberships um
    JOIN portal.profiles p ON p.id = um.user_id
    WHERE um.user_id = auth.uid()
      AND um.status = 'active'
      AND p.is_active = TRUE
      AND um.role_slug = 'admin_rede'
  );
$$;

CREATE OR REPLACE FUNCTION portal.current_user_is_network_support()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portal, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM portal.unit_memberships um
    JOIN portal.profiles p ON p.id = um.user_id
    WHERE um.user_id = auth.uid()
      AND um.status = 'active'
      AND p.is_active = TRUE
      AND um.role_slug IN ('admin_rede', 'suporte_franqueadora')
  );
$$;

CREATE OR REPLACE FUNCTION portal.current_user_is_factory()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portal, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM portal.unit_memberships um
    JOIN portal.profiles p ON p.id = um.user_id
    WHERE um.user_id = auth.uid()
      AND um.status = 'active'
      AND p.is_active = TRUE
      AND um.role_slug IN ('admin_rede', 'producao_fabrica')
  );
$$;

CREATE OR REPLACE FUNCTION portal.current_user_has_unit(target_unit_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portal, public
AS $$
  SELECT
    portal.current_user_is_network_admin()
    OR portal.current_user_is_network_support()
    OR portal.current_user_is_factory()
    OR EXISTS (
      SELECT 1
      FROM portal.unit_memberships um
      JOIN portal.profiles p ON p.id = um.user_id
      WHERE um.user_id = auth.uid()
        AND um.unit_id = target_unit_id
        AND um.status = 'active'
        AND p.is_active = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION portal.current_user_has_unit_only(target_unit_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portal, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM portal.unit_memberships um
    JOIN portal.profiles p ON p.id = um.user_id
    WHERE um.user_id = auth.uid()
      AND um.unit_id = target_unit_id
      AND um.status = 'active'
      AND p.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION portal.current_user_has_permission(target_unit_id UUID, perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portal, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM portal.unit_memberships um
    JOIN portal.profiles p ON p.id = um.user_id
    JOIN portal.roles_permissions rp ON rp.role_slug = um.role_slug
    WHERE um.user_id = auth.uid()
      AND um.status = 'active'
      AND p.is_active = TRUE
      AND (
        um.unit_id = target_unit_id
        OR rp.scope IN ('network', 'factory')
      )
      AND rp.permissions ? perm
  );
$$;

-- Habilita RLS em todas as tabelas do schema portal
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'portal'
  LOOP
    EXECUTE format('ALTER TABLE portal.%I ENABLE ROW LEVEL SECURITY;', tbl);
  END LOOP;
END;
$$;

-- 1. Roles e Permissões (somente usuários autenticados lêem; admin_rede edita)
DROP POLICY IF EXISTS roles_permissions_read ON portal.roles_permissions;
CREATE POLICY roles_permissions_read ON portal.roles_permissions
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS roles_permissions_admin_write ON portal.roles_permissions;
CREATE POLICY roles_permissions_admin_write ON portal.roles_permissions
  FOR ALL TO authenticated
  USING (portal.current_user_is_network_admin())
  WITH CHECK (portal.current_user_is_network_admin());

-- 2. Unidades e Config Comerciais
DROP POLICY IF EXISTS units_select ON portal.units;
CREATE POLICY units_select ON portal.units
  FOR SELECT TO authenticated
  USING (portal.current_user_has_unit(id));

DROP POLICY IF EXISTS units_admin_write ON portal.units;
CREATE POLICY units_admin_write ON portal.units
  FOR ALL TO authenticated
  USING (portal.current_user_is_network_admin())
  WITH CHECK (portal.current_user_is_network_admin());

DROP POLICY IF EXISTS unit_configs_select ON portal.unit_commercial_configs;
CREATE POLICY unit_configs_select ON portal.unit_commercial_configs
  FOR SELECT TO authenticated
  USING (portal.current_user_has_unit(unit_id));

DROP POLICY IF EXISTS unit_configs_admin_write ON portal.unit_commercial_configs;
CREATE POLICY unit_configs_admin_write ON portal.unit_commercial_configs
  FOR ALL TO authenticated
  USING (portal.current_user_is_network_admin())
  WITH CHECK (portal.current_user_is_network_admin());

-- 3. Perfis & Vínculos de Unidade
DROP POLICY IF EXISTS profiles_select ON portal.profiles;
CREATE POLICY profiles_select ON portal.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR portal.current_user_is_network_admin()
    OR portal.current_user_is_network_support()
    OR EXISTS (
      SELECT 1
      FROM portal.unit_memberships me
      JOIN portal.unit_memberships peer ON peer.unit_id = me.unit_id
      WHERE me.user_id = auth.uid()
        AND me.status = 'active'
        AND peer.user_id = profiles.id
        AND peer.status = 'active'
    )
  );

DROP POLICY IF EXISTS memberships_select ON portal.unit_memberships;
CREATE POLICY memberships_select ON portal.unit_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR portal.current_user_has_permission(unit_id, 'unit:manage_users')
    OR portal.current_user_is_network_support()
  );

-- 4. Catálogo Compartilhado, Tabelas de Preço, Cursos e Comunicados
DO $$
DECLARE
  shared_tbl TEXT;
BEGIN
  FOR shared_tbl IN
    SELECT unnest(ARRAY['products', 'product_variants', 'price_lists', 'price_list_items', 'courses', 'lessons', 'announcements'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON portal.%I;', shared_tbl, shared_tbl);
    EXECUTE format('CREATE POLICY %I_read ON portal.%I FOR SELECT TO authenticated USING (TRUE);', shared_tbl, shared_tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_write ON portal.%I;', shared_tbl, shared_tbl);
    EXECUTE format(
      'CREATE POLICY %I_admin_write ON portal.%I FOR ALL TO authenticated USING (portal.current_user_is_network_admin()) WITH CHECK (portal.current_user_is_network_admin());',
      shared_tbl, shared_tbl
    );
  END LOOP;
END;
$$;

-- 5. Dados Privados da Unidade com Isolamento Estrito (unit_id)
DO $$
DECLARE
  unit_tbl TEXT;
BEGIN
  FOR unit_tbl IN
    SELECT unnest(ARRAY[
      'user_devices', 'active_sessions',
      'customers', 'customer_contacts', 'opportunities', 'crm_activities',
      'quotes', 'quote_items',
      'art_projects', 'art_versions', 'art_comments', 'approvals',
      'orders', 'order_items', 'order_personalizations', 'production_events', 'shipments',
      'receivables', 'payment_transactions', 'expenses',
      'support_tickets', 'enrollments', 'lesson_progress', 'banca_evaluations',
      'tasks', 'integration_attempts', 'audit_logs'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_unit_select ON portal.%I;', unit_tbl, unit_tbl);
    EXECUTE format(
      'CREATE POLICY %I_unit_select ON portal.%I FOR SELECT TO authenticated USING (portal.current_user_has_unit(unit_id));',
      unit_tbl, unit_tbl
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_unit_write ON portal.%I;', unit_tbl, unit_tbl);
    EXECUTE format(
      'CREATE POLICY %I_unit_write ON portal.%I FOR ALL TO authenticated USING (portal.current_user_has_unit(unit_id)) WITH CHECK (portal.current_user_has_unit(unit_id));',
      unit_tbl, unit_tbl
    );
  END LOOP;
END;
$$;

-- 6. Support Messages: oculta notas internas (is_internal = TRUE) para perfis da unidade!
DROP POLICY IF EXISTS support_messages_select ON portal.support_messages;
CREATE POLICY support_messages_select ON portal.support_messages
  FOR SELECT TO authenticated
  USING (
    portal.current_user_has_unit(unit_id)
    AND (
      is_internal = FALSE
      OR portal.current_user_is_network_support()
      OR portal.current_user_is_factory()
    )
  );

DROP POLICY IF EXISTS support_messages_insert ON portal.support_messages;
CREATE POLICY support_messages_insert ON portal.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    portal.current_user_has_unit(unit_id)
    AND (
      is_internal = FALSE
      OR portal.current_user_is_network_support()
      OR portal.current_user_is_factory()
    )
  );

-- 7. Documentos & Versões (suporta unit_id IS NULL compartilhado OU unit_id específico)
DROP POLICY IF EXISTS documents_select ON portal.documents;
CREATE POLICY documents_select ON portal.documents
  FOR SELECT TO authenticated
  USING (unit_id IS NULL OR portal.current_user_has_unit(unit_id));

DROP POLICY IF EXISTS documents_write ON portal.documents;
CREATE POLICY documents_write ON portal.documents
  FOR ALL TO authenticated
  USING (
    (unit_id IS NULL AND portal.current_user_is_network_admin())
    OR (unit_id IS NOT NULL AND portal.current_user_has_unit(unit_id))
  )
  WITH CHECK (
    (unit_id IS NULL AND portal.current_user_is_network_admin())
    OR (unit_id IS NOT NULL AND portal.current_user_has_unit(unit_id))
  );

DROP POLICY IF EXISTS doc_versions_select ON portal.document_versions;
CREATE POLICY doc_versions_select ON portal.document_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM portal.documents d
      WHERE d.id = document_versions.document_id
        AND (d.unit_id IS NULL OR portal.current_user_has_unit(d.unit_id))
    )
  );

DROP POLICY IF EXISTS doc_versions_insert ON portal.document_versions;
CREATE POLICY doc_versions_insert ON portal.document_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portal.documents d
      WHERE d.id = document_versions.document_id
        AND ((d.unit_id IS NULL AND portal.current_user_is_network_admin()) OR (d.unit_id IS NOT NULL AND portal.current_user_has_unit(d.unit_id)))
    )
  );

-- 8. Notificações & Preferências: apenas do próprio usuário na unidade
DROP POLICY IF EXISTS notifications_self ON portal.notifications;
CREATE POLICY notifications_self ON portal.notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND portal.current_user_has_unit(unit_id))
  WITH CHECK (user_id = auth.uid() AND portal.current_user_has_unit(unit_id));

DROP POLICY IF EXISTS notif_prefs_self ON portal.notification_preferences;
CREATE POLICY notif_prefs_self ON portal.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND portal.current_user_has_unit(unit_id))
  WITH CHECK (user_id = auth.uid() AND portal.current_user_has_unit(unit_id));

-- 9. Buckets Privados no Supabase Storage (acesso via URL assinada gerada após validação no backend)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('portal-art-files', 'portal-art-files', FALSE, 52428800, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf']),
  ('portal-documents', 'portal-documents', FALSE, 26214400, ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('portal-ticket-attachments', 'portal-ticket-attachments', FALSE, 26214400, ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'video/mp4']),
  ('portal-receipts', 'portal-receipts', FALSE, 15728640, ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('portal-sandbox', 'portal-sandbox', FALSE, 104857600, ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS strict unit folder isolation: {unit_id}/...
DROP POLICY IF EXISTS portal_storage_select ON storage.objects;
CREATE POLICY portal_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('portal-art-files', 'portal-documents', 'portal-ticket-attachments', 'portal-receipts', 'portal-sandbox')
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND portal.current_user_has_unit(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS portal_storage_insert ON storage.objects;
CREATE POLICY portal_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('portal-art-files', 'portal-documents', 'portal-ticket-attachments', 'portal-receipts', 'portal-sandbox')
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND portal.current_user_has_unit(((storage.foldername(name))[1])::uuid)
  );
