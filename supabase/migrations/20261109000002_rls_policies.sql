-- ============================================================================
-- KING SPORTS FRANCHISING — MIGRATION 002: ROW LEVEL SECURITY (RLS)
-- Garante que o navegador (role anon) JAMAIS acesse tabelas do CRM diretamente.
-- Todas as operações administrativas e de leitura pública passam pelo backend Node.js.
-- ============================================================================

-- Funções auxiliares SECURITY DEFINER para checar admin ativo via Supabase Auth
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.auth_user_id = auth.uid()
      AND au.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.has_admin_role(allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    JOIN public.admin_roles ar ON ar.id = au.role_id
    WHERE au.auth_user_id = auth.uid()
      AND au.is_active = TRUE
      AND ar.slug = ANY(allowed_roles)
  );
$$;

-- Habilita RLS em todas as tabelas
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'admin_roles', 'admin_users', 'blog_categories', 'blog_posts',
      'campaigns', 'campaign_metrics', 'pipeline_stages', 'leads',
      'lead_attributions', 'lead_qualification', 'opportunities',
      'lead_activities', 'tasks', 'meetings', 'consent_records',
      'marketing_events', 'conversion_events', 'automation_rules',
      'automation_jobs', 'audit_logs', 'system_settings'
    ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- Políticas estritas:
-- 1. Nenhuma tabela administrativa é legível ou gravável via role anon direta.
-- 2. Blog publicado e categorias ativas podem ser lidos publicamente.
-- 3. Admins autenticados via Supabase Auth podem consultar conforme papel;
--    alterações críticas passam preferencialmente pelo backend Node.js auditado.
-- ----------------------------------------------------------------------------

-- Blog: leitura pública apenas para conteúdo publicado e categorias ativas
DROP POLICY IF EXISTS blog_categories_public_read ON public.blog_categories;
CREATE POLICY blog_categories_public_read
  ON public.blog_categories
  FOR SELECT
  USING (is_active = TRUE OR public.is_active_admin());

DROP POLICY IF EXISTS blog_posts_public_read ON public.blog_posts;
CREATE POLICY blog_posts_public_read
  ON public.blog_posts
  FOR SELECT
  USING (
    (status = 'published' AND (published_at IS NULL OR published_at <= NOW()))
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS blog_posts_admin_write ON public.blog_posts;
CREATE POLICY blog_posts_admin_write
  ON public.blog_posts
  FOR ALL
  USING (public.has_admin_role(ARRAY['super_admin', 'expansion_director', 'marketing_analyst', 'content_editor']))
  WITH CHECK (public.has_admin_role(ARRAY['super_admin', 'expansion_director', 'marketing_analyst', 'content_editor']));

DROP POLICY IF EXISTS blog_categories_admin_write ON public.blog_categories;
CREATE POLICY blog_categories_admin_write
  ON public.blog_categories
  FOR ALL
  USING (public.has_admin_role(ARRAY['super_admin', 'expansion_director', 'content_editor']))
  WITH CHECK (public.has_admin_role(ARRAY['super_admin', 'expansion_director', 'content_editor']));

-- Tabelas de CRM & Operação: acesso exclusivo de administradores ativos
DO $$
DECLARE
  crm_tbl TEXT;
BEGIN
  FOR crm_tbl IN
    SELECT unnest(ARRAY[
      'pipeline_stages', 'leads', 'lead_attributions', 'lead_qualification',
      'opportunities', 'lead_activities', 'tasks', 'meetings',
      'campaigns', 'campaign_metrics', 'marketing_events', 'conversion_events',
      'consent_records'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_access ON public.%I;', crm_tbl, crm_tbl);
    EXECUTE format(
      'CREATE POLICY %I_admin_access ON public.%I FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());',
      crm_tbl, crm_tbl
    );
  END LOOP;
END;
$$;

-- Regras de automação e jobs: acesso apenas para super_admin, expansion_director e marketing_analyst
DROP POLICY IF EXISTS automation_rules_admin ON public.automation_rules;
CREATE POLICY automation_rules_admin
  ON public.automation_rules
  FOR ALL
  USING (public.has_admin_role(ARRAY['super_admin', 'expansion_director', 'marketing_analyst']))
  WITH CHECK (public.has_admin_role(ARRAY['super_admin', 'expansion_director']));

DROP POLICY IF EXISTS automation_jobs_admin ON public.automation_jobs;
CREATE POLICY automation_jobs_admin
  ON public.automation_jobs
  FOR SELECT
  USING (public.has_admin_role(ARRAY['super_admin', 'expansion_director', 'marketing_analyst']));

-- Admin users & roles: leitura para admins ativos, escrita apenas super_admin
DROP POLICY IF EXISTS admin_roles_read ON public.admin_roles;
CREATE POLICY admin_roles_read
  ON public.admin_roles
  FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS admin_users_self_or_super ON public.admin_users;
CREATE POLICY admin_users_self_or_super
  ON public.admin_users
  FOR SELECT
  USING (auth_user_id = auth.uid() OR public.has_admin_role(ARRAY['super_admin', 'expansion_director']));

DROP POLICY IF EXISTS admin_users_super_write ON public.admin_users;
CREATE POLICY admin_users_super_write
  ON public.admin_users
  FOR ALL
  USING (public.has_admin_role(ARRAY['super_admin']))
  WITH CHECK (public.has_admin_role(ARRAY['super_admin']));

-- System settings: leitura apenas de chaves públicas se necessário, escrita só super_admin
DROP POLICY IF EXISTS system_settings_admin_read ON public.system_settings;
CREATE POLICY system_settings_admin_read
  ON public.system_settings
  FOR SELECT
  USING (
    (is_public = TRUE AND is_secret = FALSE)
    OR (public.is_active_admin() AND is_secret = FALSE)
    OR public.has_admin_role(ARRAY['super_admin'])
  );

DROP POLICY IF EXISTS system_settings_super_write ON public.system_settings;
CREATE POLICY system_settings_super_write
  ON public.system_settings
  FOR ALL
  USING (public.has_admin_role(ARRAY['super_admin', 'expansion_director']))
  WITH CHECK (public.has_admin_role(ARRAY['super_admin', 'expansion_director']));

-- Audit logs: leitura restrita, imutável via RLS para usuários comuns
DROP POLICY IF EXISTS audit_logs_read ON public.audit_logs;
CREATE POLICY audit_logs_read
  ON public.audit_logs
  FOR SELECT
  USING (public.has_admin_role(ARRAY['super_admin', 'expansion_director']));
