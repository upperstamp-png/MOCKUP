-- ============================================================================
-- KING SPORTS FRANCHISING — MIGRATION: DOIS PERFIS (franqueado | admin) + AGENDA
-- Consolida RBAC em exatamente dois perfis operacionais e cria portal.schedule_events
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CONSOLIDAÇÃO DE PERFIS DE ACESSO (STRICTLY TWO ROLES: franqueado, admin)
-- ----------------------------------------------------------------------------
INSERT INTO portal.roles_permissions (role_slug, name, description, scope, permissions)
VALUES
  (
    'franqueado',
    'Franqueado',
    'Acesso completo à operação da unidade franqueada (CRM, Agenda, Tarefas, Orçamentos, Studio 3D, Pedidos, Financeiro, SAC, Documentos e Treinamentos).',
    'unit',
    '["unit:read","unit:manage_users","crm:read","crm:write","catalog:read","quotes:read","quotes:write","quotes:approve_discount","arts:read","arts:write","arts:approve","arts:review_internal","orders:read","orders:create","finance:read","finance:write","finance:reconcile","finance:reverse","tickets:read","tickets:write","documents:read","documents:write","training:read","training:write","sandbox:access","exports:read","tasks:read","tasks:write","agenda:read","agenda:write"]'::jsonb
  ),
  (
    'admin',
    'Admin',
    'Administrador geral da plataforma e franqueadora (governança de unidades, catálogo, regras comerciais, PCP fábrica e auditoria).',
    'network',
    '["unit:read","unit:manage_users","network:admin","network:units_read","crm:read","crm:write","catalog:read","catalog:write","quotes:read","quotes:write","quotes:approve_discount","arts:read","arts:write","arts:approve","arts:review_internal","orders:read","orders:create","orders:override_release","production:advance_stage","logistics:manage","finance:read","finance:write","finance:reconcile","finance:reverse","tickets:read","tickets:write","tickets:internal_notes","documents:read","documents:write","documents:approve","training:read","training:write","sandbox:access","sandbox:review","exports:read","tasks:read","tasks:write","agenda:read","agenda:write"]'::jsonb
  )
ON CONFLICT (role_slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  permissions = EXCLUDED.permissions,
  updated_at = NOW();

-- Migra vínculos existentes para os dois perfis oficiais antes de remover perfis legados
UPDATE portal.unit_memberships
SET role_slug = 'franqueado',
    updated_at = NOW()
WHERE role_slug IN ('franqueado_gestor', 'vendedor', 'designer', 'financeiro_unidade');

UPDATE portal.unit_memberships
SET role_slug = 'admin',
    updated_at = NOW()
WHERE role_slug IN ('suporte_franqueadora', 'producao_fabrica', 'admin_rede');

-- Atualiza default e registros existentes de visible_roles em portal.documents
ALTER TABLE portal.documents
  ALTER COLUMN visible_roles SET DEFAULT '["franqueado","admin"]'::jsonb;

UPDATE portal.documents
SET visible_roles = CASE
  WHEN visible_roles ?| ARRAY['franqueado_gestor', 'vendedor', 'designer', 'financeiro_unidade', 'franqueado']
    THEN '["franqueado","admin"]'::jsonb
  ELSE '["admin"]'::jsonb
END
WHERE visible_roles IS DISTINCT FROM (
  CASE
    WHEN visible_roles ?| ARRAY['franqueado_gestor', 'vendedor', 'designer', 'financeiro_unidade', 'franqueado']
      THEN '["franqueado","admin"]'::jsonb
    ELSE '["admin"]'::jsonb
  END
);

-- Remove perfis legados mantendo estritamente franqueado e admin
DELETE FROM portal.roles_permissions
WHERE role_slug NOT IN ('franqueado', 'admin');

-- Atualiza funções auxiliares de RLS para refletir o perfil único 'admin'
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
      AND um.role_slug = 'admin'
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
      AND um.role_slug = 'admin'
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
      AND um.role_slug = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. AGENDA ESTILO GOOGLE CALENDAR (portal.schedule_events)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.schedule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('entrega', 'reuniao', 'follow_up', 'outro')),
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location TEXT,
  meeting_url TEXT,
  customer_id UUID REFERENCES portal.customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES portal.orders(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'canceled')),
  color_tag TEXT NOT NULL DEFAULT 'blue' CHECK (color_tag IN ('blue', 'cyan', 'emerald', 'amber', 'slate')),
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_portal_schedule_events_unit_start
  ON portal.schedule_events (unit_id, is_sandbox, start_at);

CREATE INDEX IF NOT EXISTS idx_portal_schedule_events_unit_type_status
  ON portal.schedule_events (unit_id, event_type, status);

DROP TRIGGER IF EXISTS trg_portal_schedule_events_updated_at ON portal.schedule_events;
CREATE TRIGGER trg_portal_schedule_events_updated_at
  BEFORE UPDATE ON portal.schedule_events
  FOR EACH ROW EXECUTE FUNCTION portal.set_updated_at();

ALTER TABLE portal.schedule_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedule_events_unit_select ON portal.schedule_events;
CREATE POLICY schedule_events_unit_select ON portal.schedule_events
  FOR SELECT TO authenticated
  USING (portal.current_user_has_unit(unit_id));

DROP POLICY IF EXISTS schedule_events_unit_write ON portal.schedule_events;
CREATE POLICY schedule_events_unit_write ON portal.schedule_events
  FOR ALL TO authenticated
  USING (portal.current_user_has_unit(unit_id))
  WITH CHECK (portal.current_user_has_unit(unit_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON portal.schedule_events TO authenticated;
GRANT ALL ON portal.schedule_events TO service_role;
