-- ============================================================================
-- KING SPORTS FRANCHISING — PORTAL DO FRANQUEADO (SCHEMA DEDICADO: portal)
-- Migração incremental não-destrutiva: mantém o CRM de Expansão em public.* intacto.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS portal;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION portal.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. PERFIS DE ACESSO E PERMISSÕES (RBAC SERVIDOR + BANCO)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.roles_permissions (
  role_slug TEXT PRIMARY KEY CHECK (role_slug ~ '^[a-z0-9_]+$'),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('unit', 'factory', 'network')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO portal.roles_permissions (role_slug, name, description, scope, permissions)
VALUES
  (
    'franqueado_gestor',
    'Franqueado Gestor',
    'Gestão completa da própria unidade (CRM, Orçamentos, Artes, Pedidos, Financeiro, SAC, Equipe local). Não acessa administração da rede nem avança etapas fabris.',
    'unit',
    '["unit:read","unit:manage_users","crm:read","crm:write","catalog:read","quotes:read","quotes:write","quotes:approve_discount","arts:read","arts:write","arts:approve","orders:read","orders:create","finance:read","finance:write","tickets:read","tickets:write","documents:read","documents:write","training:read","training:write","sandbox:access","exports:read","tasks:read","tasks:write"]'::jsonb
  ),
  (
    'vendedor',
    'Vendedor da Unidade',
    'Carteira de clientes, oportunidades, atividades, orçamentos e acompanhamento de pedidos dentro do limite comercial.',
    'unit',
    '["unit:read","crm:read","crm:write","catalog:read","quotes:read","quotes:write","arts:read","arts:write","orders:read","orders:create","tickets:read","tickets:write","documents:read","training:read","training:write","sandbox:access","tasks:read","tasks:write"]'::jsonb
  ),
  (
    'designer',
    'Designer',
    'Projetos de arte, briefing, versionamento, revisão interna, Mockup Studio e arquivos autorizados.',
    'unit',
    '["unit:read","catalog:read","arts:read","arts:write","arts:review_internal","orders:read","documents:read","training:read","training:write","sandbox:access","exports:read","tasks:read","tasks:write"]'::jsonb
  ),
  (
    'financeiro_unidade',
    'Financeiro da Unidade',
    'Contas a receber, baixas, estornos, despesas, fluxo de caixa e relatórios financeiros da unidade.',
    'unit',
    '["unit:read","catalog:read","quotes:read","orders:read","finance:read","finance:write","finance:reconcile","finance:reverse","tickets:read","tickets:write","documents:read","training:read","exports:read","tasks:read","tasks:write"]'::jsonb
  ),
  (
    'suporte_franqueadora',
    'Suporte da Franqueadora',
    'Atendimento de chamados SAC, notas internas, habilitação documental e acompanhamento de unidades.',
    'network',
    '["unit:read","network:units_read","crm:read","catalog:read","quotes:read","arts:read","orders:read","tickets:read","tickets:write","tickets:internal_notes","documents:read","documents:write","documents:approve","training:read","sandbox:review","tasks:read","tasks:write"]'::jsonb
  ),
  (
    'producao_fabrica',
    'Produção da Fábrica (PCP SP)',
    'Aceite fabril, verificação de capacidade, avanço das etapas industriais e registro de expedição/entrega.',
    'factory',
    '["unit:read","network:units_read","catalog:read","arts:read","arts:review_internal","orders:read","orders:override_release","production:advance_stage","logistics:manage","tickets:read","tickets:write","tickets:internal_notes","documents:read"]'::jsonb
  ),
  (
    'admin_rede',
    'Administrador da Rede',
    'Configurações globais da rede, regras comerciais das unidades, catálogo, tabelas de preço e auditoria geral.',
    'network',
    '["unit:read","unit:manage_users","network:admin","network:units_read","crm:read","crm:write","catalog:read","catalog:write","quotes:read","quotes:write","quotes:approve_discount","arts:read","arts:write","arts:approve","arts:review_internal","orders:read","orders:create","orders:override_release","production:advance_stage","logistics:manage","finance:read","finance:write","finance:reconcile","finance:reverse","tickets:read","tickets:write","tickets:internal_notes","documents:read","documents:write","documents:approve","training:read","training:write","sandbox:access","sandbox:review","exports:read","tasks:read","tasks:write"]'::jsonb
  )
ON CONFLICT (role_slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  permissions = EXCLUDED.permissions;

-- ----------------------------------------------------------------------------
-- 2. UNIDADES, CONFIGURAÇÕES COMERCIAIS E USUÁRIOS / VÍNCULOS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  trade_name TEXT,
  legal_name TEXT,
  cnpj VARCHAR(20),
  city TEXT NOT NULL,
  state CHAR(2) NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  unit_type TEXT NOT NULL DEFAULT 'franchise' CHECK (unit_type IN ('franchise', 'headquarters')),
  operational_status TEXT NOT NULL DEFAULT 'onboarding' CHECK (operational_status IN ('onboarding', 'pending_approval', 'active', 'restricted', 'suspended')),
  training_completed BOOLEAN NOT NULL DEFAULT FALSE,
  banca_approved BOOLEAN NOT NULL DEFAULT FALSE,
  implantation_approved BOOLEAN NOT NULL DEFAULT FALSE,
  implantation_notes TEXT,
  initial_franchise_fee_cents BIGINT NOT NULL DEFAULT 2000000 CHECK (initial_franchise_fee_cents >= 0),
  initial_fee_status TEXT NOT NULL DEFAULT 'contract_defined' CHECK (initial_fee_status IN ('pending', 'contract_defined', 'paid', 'installments')),
  max_devices INTEGER NOT NULL DEFAULT 5 CHECK (max_devices > 0),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.unit_commercial_configs (
  unit_id UUID PRIMARY KEY REFERENCES portal.units(id) ON DELETE CASCADE,
  config_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (config_status IN ('not_configured', 'pending_approval', 'approved')),
  commercial_modality TEXT NOT NULL DEFAULT 'pending_definition' CHECK (commercial_modality IN ('pending_definition', 'revenda', 'intermediacao')),
  royalty_bps INTEGER CHECK (royalty_bps IS NULL OR (royalty_bps >= 0 AND royalty_bps <= 10000)),
  marketing_fund_bps INTEGER CHECK (marketing_fund_bps IS NULL OR (marketing_fund_bps >= 0 AND marketing_fund_bps <= 10000)),
  factory_transfer_bps INTEGER CHECK (factory_transfer_bps IS NULL OR (factory_transfer_bps >= 0 AND factory_transfer_bps <= 10000)),
  default_price_list_code TEXT,
  max_discount_bps INTEGER NOT NULL DEFAULT 500 CHECK (max_discount_bps >= 0 AND max_discount_bps <= 5000),
  territory_rule_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (territory_rule_status IN ('not_configured', 'pending_contract_definition', 'configured_non_exclusive', 'configured_priority')),
  territory_notes TEXT,
  default_lead_time_min_days INTEGER CHECK (default_lead_time_min_days IS NULL OR default_lead_time_min_days > 0),
  default_lead_time_max_days INTEGER CHECK (default_lead_time_max_days IS NULL OR default_lead_time_max_days >= COALESCE(default_lead_time_min_days, 1)),
  production_release_rules JSONB NOT NULL DEFAULT '{"require_complete_data":true,"require_approved_art":true,"require_approved_grade":true,"require_financial_condition":true,"require_required_documents":true,"require_factory_acceptance":true}'::jsonb,
  payment_gateway_provider TEXT NOT NULL DEFAULT 'none' CHECK (payment_gateway_provider IN ('none', 'asaas', 'external')),
  payment_gateway_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (payment_gateway_status IN ('not_configured', 'sandbox', 'active')),
  nfe_emitter_provider TEXT NOT NULL DEFAULT 'none',
  nfe_emitter_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (nfe_emitter_status IN ('not_configured', 'external_manual', 'sandbox', 'active')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  default_unit_id UUID REFERENCES portal.units(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_profiles_email ON portal.profiles (LOWER(email));

CREATE TABLE IF NOT EXISTS portal.unit_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES portal.profiles(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  role_slug TEXT NOT NULL REFERENCES portal.roles_permissions(role_slug) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_memberships_user ON portal.unit_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS idx_portal_memberships_unit ON portal.unit_memberships (unit_id, status);

CREATE TABLE IF NOT EXISTS portal.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES portal.profiles(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, user_id, fingerprint_hash)
);

CREATE TABLE IF NOT EXISTS portal.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES portal.profiles(id) ON DELETE CASCADE,
  device_id UUID REFERENCES portal.user_devices(id) ON DELETE SET NULL,
  device_label TEXT NOT NULL DEFAULT 'Navegador Web',
  ip_address TEXT,
  user_agent TEXT,
  session_token_hash TEXT NOT NULL UNIQUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_unit ON portal.active_sessions (unit_id, last_seen_at DESC);

-- ----------------------------------------------------------------------------
-- 3. CRM DO FRANQUEADO (CLIENTES COMPRADORES DE UNIFORMES)
-- Separado integralmente do CRM de Expansão em public.leads/public.opportunities
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document_number TEXT,
  customer_type TEXT NOT NULL DEFAULT 'time' CHECK (customer_type IN ('time', 'escolinha', 'academia', 'empresa', 'organizador_eventos', 'atletica', 'outro')),
  segment TEXT,
  city TEXT,
  state CHAR(2),
  zip_code TEXT,
  address_line TEXT,
  origin TEXT,
  owner_user_id UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_customers_unit ON portal.customers (unit_id, is_sandbox, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_customers_name ON portal.customers (unit_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_portal_customers_doc ON portal.customers (unit_id, document_number) WHERE document_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS portal.customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES portal.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role_title TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_contacts_customer ON portal.customer_contacts (customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_contacts_unit ON portal.customer_contacts (unit_id);

CREATE TABLE IF NOT EXISTS portal.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES portal.customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'novo' CHECK (stage IN ('novo', 'contato_iniciado', 'qualificacao', 'orcamento', 'negociacao', 'ganho', 'perdido')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  segment TEXT,
  city TEXT,
  state CHAR(2),
  origin TEXT,
  estimated_value_cents BIGINT CHECK (estimated_value_cents IS NULL OR estimated_value_cents >= 0),
  products_of_interest JSONB NOT NULL DEFAULT '[]'::jsonb,
  event_date DATE,
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  owner_user_id UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  loss_reason TEXT,
  reopen_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_opp_lost_reason CHECK (stage <> 'perdido' OR (loss_reason IS NOT NULL AND char_length(trim(loss_reason)) >= 3))
);

CREATE INDEX IF NOT EXISTS idx_portal_opps_unit ON portal.opportunities (unit_id, is_sandbox, status, stage);
CREATE INDEX IF NOT EXISTS idx_portal_opps_customer ON portal.opportunities (customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_opps_followup ON portal.opportunities (unit_id, next_action_at) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS portal.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES portal.customers(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES portal.opportunities(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('note', 'call', 'whatsapp', 'meeting', 'email', 'stage_change', 'reopen', 'quote_created', 'system')),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_activities_opp ON portal.crm_activities (opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_activities_cust ON portal.crm_activities (customer_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. CATÁLOGO COMPARTILHADO, TABELAS DE PREÇOS E ORÇAMENTOS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(48) NOT NULL UNIQUE,
  slug VARCHAR(80) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  modeling TEXT NOT NULL,
  fabric TEXT NOT NULL,
  fabric_composition TEXT NOT NULL,
  size_chart JSONB NOT NULL DEFAULT '{}'::jsonb,
  available_personalizations JSONB NOT NULL DEFAULT '[]'::jsonb,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  moq INTEGER CHECK (moq IS NULL OR moq > 0),
  indicative_lead_time_min_days INTEGER,
  indicative_lead_time_max_days INTEGER,
  availability_status TEXT NOT NULL DEFAULT 'available' CHECK (availability_status IN ('available', 'made_to_order', 'paused', 'legal_review')),
  legal_review_note TEXT,
  studio_model_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES portal.products(id) ON DELETE CASCADE,
  variant_sku VARCHAR(64) NOT NULL UNIQUE,
  size_code TEXT NOT NULL,
  cut_type TEXT NOT NULL DEFAULT 'unissex',
  finish_option TEXT,
  extra_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (extra_price_cents >= 0),
  extra_cost_cents BIGINT CHECK (extra_cost_cents IS NULL OR extra_cost_cents >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_variants_product ON portal.product_variants (product_id);

CREATE TABLE IF NOT EXISTS portal.price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(48) NOT NULL,
  name TEXT NOT NULL,
  version_code VARCHAR(32) NOT NULL,
  profile_scope TEXT NOT NULL DEFAULT 'standard' CHECK (profile_scope IN ('standard', 'comercial', 'designer', 'custom')),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code, version_code)
);

CREATE TABLE IF NOT EXISTS portal.price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES portal.price_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES portal.products(id) ON DELETE CASCADE,
  supply_price_cents BIGINT CHECK (supply_price_cents IS NULL OR supply_price_cents >= 0),
  suggested_sale_price_cents BIGINT CHECK (suggested_sale_price_cents IS NULL OR suggested_sale_price_cents >= 0),
  unit_cost_cents BIGINT CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0),
  additional_costs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (price_list_id, product_id)
);

CREATE TABLE IF NOT EXISTS portal.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(32) NOT NULL,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES portal.customers(id) ON DELETE RESTRICT,
  opportunity_id UUID REFERENCES portal.opportunities(id) ON DELETE SET NULL,
  price_list_id UUID REFERENCES portal.price_lists(id) ON DELETE SET NULL,
  price_list_version_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired', 'converted')),
  subtotal_cents BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  personalization_total_cents BIGINT NOT NULL DEFAULT 0 CHECK (personalization_total_cents >= 0),
  additional_services_cents BIGINT NOT NULL DEFAULT 0 CHECK (additional_services_cents >= 0),
  shipping_cents BIGINT NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  discount_cents BIGINT NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  known_cost_cents BIGINT,
  estimated_contribution_cents BIGINT,
  margin_on_sale_pct NUMERIC(7,2),
  markup_pct NUMERIC(7,2),
  estimation_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (estimation_status IN ('complete', 'incomplete')),
  payment_terms TEXT,
  valid_until DATE,
  estimated_delivery_days INTEGER,
  terms_text TEXT,
  notes TEXT,
  share_token TEXT UNIQUE,
  share_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by_name TEXT,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, quote_number)
);

CREATE INDEX IF NOT EXISTS idx_portal_quotes_unit ON portal.quotes (unit_id, is_sandbox, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_quotes_opp ON portal.quotes (opportunity_id);

CREATE TABLE IF NOT EXISTS portal.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES portal.quotes(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  product_id UUID REFERENCES portal.products(id) ON DELETE SET NULL,
  product_sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_sale_price_cents BIGINT NOT NULL CHECK (unit_sale_price_cents >= 0),
  unit_supply_cost_cents BIGINT CHECK (unit_supply_cost_cents IS NULL OR unit_supply_cost_cents >= 0),
  personalization_summary TEXT,
  personalization_cents BIGINT NOT NULL DEFAULT 0 CHECK (personalization_cents >= 0),
  line_total_cents BIGINT NOT NULL CHECK (line_total_cents >= 0),
  price_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_quote_items_quote ON portal.quote_items (quote_id);

-- ----------------------------------------------------------------------------
-- 5. STUDIO DE ARTES, VERSIONAMENTO IMUTÁVEL E APROVAÇÕES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.art_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES portal.customers(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES portal.opportunities(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES portal.quotes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  briefing TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'briefing_pendente' CHECK (status IN ('briefing_pendente', 'em_criacao', 'revisao_interna', 'enviado_ao_cliente', 'ajustes', 'aprovado')),
  assignee_user_id UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  current_version_id UUID,
  approved_version_id UUID,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_art_projects_unit ON portal.art_projects (unit_id, is_sandbox, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS portal.art_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  art_project_id UUID NOT NULL REFERENCES portal.art_projects(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('mockup_ilustrativo', 'arte_revisao', 'arquivo_producao_rip')),
  storage_bucket TEXT,
  storage_path TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  preview_summary TEXT,
  layer_state JSONB,
  notes TEXT,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (art_project_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_portal_art_versions_project ON portal.art_versions (art_project_id, version_number DESC);

DO $$ BEGIN
  ALTER TABLE portal.art_projects
    ADD CONSTRAINT fk_art_current_version FOREIGN KEY (current_version_id) REFERENCES portal.art_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE portal.art_projects
    ADD CONSTRAINT fk_art_approved_version FOREIGN KEY (approved_version_id) REFERENCES portal.art_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS portal.art_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  art_project_id UUID NOT NULL REFERENCES portal.art_projects(id) ON DELETE CASCADE,
  art_version_id UUID REFERENCES portal.art_versions(id) ON DELETE SET NULL,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  comment_type TEXT NOT NULL DEFAULT 'comment' CHECK (comment_type IN ('comment', 'revision_request', 'internal_review')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('art_version', 'order_grade', 'quote', 'document_version')),
  entity_id UUID NOT NULL,
  art_project_id UUID REFERENCES portal.art_projects(id) ON DELETE CASCADE,
  art_version_id UUID REFERENCES portal.art_versions(id) ON DELETE RESTRICT,
  approved_by_name TEXT NOT NULL,
  approved_by_contact TEXT,
  identification_method TEXT NOT NULL,
  acceptance_evidence TEXT NOT NULL,
  legal_disclaimer TEXT NOT NULL DEFAULT 'Aceite eletrônico operacional registrado com carimbo de data/hora vinculado especificamente à versão indicada. Não equivale a assinatura digital certificada ICP-Brasil.',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'revoked')),
  superseded_by_version_id UUID REFERENCES portal.art_versions(id) ON DELETE SET NULL,
  superseded_at TIMESTAMPTZ,
  recorded_by_user_id UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_approvals_entity ON portal.approvals (unit_id, entity_type, entity_id, status);
CREATE INDEX IF NOT EXISTS idx_portal_approvals_art_ver ON portal.approvals (art_version_id, status);

-- ----------------------------------------------------------------------------
-- 6. PEDIDOS, GRADE, PERSONALIZAÇÕES, PRODUÇÃO E EXPEDIÇÃO/ENTREGA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(32) NOT NULL,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES portal.customers(id) ON DELETE RESTRICT,
  opportunity_id UUID REFERENCES portal.opportunities(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES portal.quotes(id) ON DELETE SET NULL,
  art_project_id UUID REFERENCES portal.art_projects(id) ON DELETE RESTRICT,
  approved_art_version_id UUID REFERENCES portal.art_versions(id) ON DELETE RESTRICT,
  commercial_status TEXT NOT NULL DEFAULT 'draft' CHECK (commercial_status IN ('draft', 'confirmed', 'canceled')),
  financial_status TEXT NOT NULL DEFAULT 'pending' CHECK (financial_status IN ('pending', 'partial', 'settled', 'overdue', 'refunded')),
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'art_approved', 'grade_approved', 'all_approved', 'revision_required')),
  production_status TEXT NOT NULL DEFAULT 'not_released' CHECK (production_status IN ('not_released', 'blocked', 'queued_pcp', 'sublimation', 'cutting', 'embroidery_tpu', 'sewing', 'quality_check', 'finished')),
  logistics_status TEXT NOT NULL DEFAULT 'pending' CHECK (logistics_status IN ('pending', 'ready_to_dispatch', 'dispatched', 'in_transit', 'delivered', 'issue_reported')),
  grade_approved BOOLEAN NOT NULL DEFAULT FALSE,
  grade_approved_by TEXT,
  grade_approved_at TIMESTAMPTZ,
  factory_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  factory_capacity_ok BOOLEAN NOT NULL DEFAULT FALSE,
  factory_accepted_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  factory_accepted_at TIMESTAMPTZ,
  production_released BOOLEAN NOT NULL DEFAULT FALSE,
  production_released_at TIMESTAMPTZ,
  release_block_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  release_override_reason TEXT,
  release_override_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  commercial_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  subtotal_cents BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  shipping_cents BIGINT NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  discount_cents BIGINT NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  delivery_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  shipping_method TEXT,
  event_date DATE,
  estimated_delivery_date DATE,
  sla_started_at TIMESTAMPTZ,
  canceled_reason TEXT,
  canceled_at TIMESTAMPTZ,
  notes TEXT,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_portal_orders_unit ON portal.orders (unit_id, is_sandbox, commercial_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_orders_delivery ON portal.orders (unit_id, estimated_delivery_date) WHERE commercial_status <> 'canceled';

CREATE TABLE IF NOT EXISTS portal.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES portal.orders(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  product_id UUID REFERENCES portal.products(id) ON DELETE SET NULL,
  product_sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  size_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  unit_cost_cents BIGINT CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0),
  line_total_cents BIGINT NOT NULL CHECK (line_total_cents >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.order_personalizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES portal.orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES portal.order_items(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  size_code TEXT NOT NULL,
  player_name TEXT,
  player_number TEXT,
  shield_or_sponsor_notes TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.production_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES portal.orders(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  stage_code TEXT NOT NULL CHECK (stage_code IN ('not_released', 'blocked', 'queued_pcp', 'sublimation', 'cutting', 'embroidery_tpu', 'sewing', 'quality_check', 'finished', 'forecast_updated', 'release_override')),
  status_label TEXT NOT NULL,
  notes TEXT,
  old_forecast_date DATE,
  new_forecast_date DATE,
  recorded_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_prod_events_order ON portal.production_events (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS portal.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES portal.orders(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  carrier_name TEXT,
  tracking_code TEXT,
  shipping_cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (shipping_cost_cents >= 0),
  status TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'dispatched', 'in_transit', 'delivered', 'delayed', 'returned')),
  dispatched_at TIMESTAMPTZ,
  estimated_delivery_date DATE,
  delivered_at TIMESTAMPTZ,
  receiver_name TEXT,
  delivery_notes TEXT,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_shipments_order ON portal.shipments (order_id);

-- ----------------------------------------------------------------------------
-- 7. FINANCEIRO (RECEBÍVEIS, PARCELAS, TRANSAÇÕES IDEMPOTENTES, DESPESAS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  order_id UUID REFERENCES portal.orders(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES portal.customers(id) ON DELETE RESTRICT,
  installment_number INTEGER NOT NULL DEFAULT 1 CHECK (installment_number >= 1),
  total_installments INTEGER NOT NULL DEFAULT 1 CHECK (total_installments >= installment_number),
  description TEXT NOT NULL,
  due_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (paid_cents >= 0 AND paid_cents <= amount_cents),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'canceled', 'reversed')),
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_receivables_unit ON portal.receivables (unit_id, is_sandbox, status, due_date);
CREATE INDEX IF NOT EXISTS idx_portal_receivables_order ON portal.receivables (order_id);

CREATE TABLE IF NOT EXISTS portal.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  receivable_id UUID NOT NULL REFERENCES portal.receivables(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES portal.orders(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('payment', 'reversal')),
  reversed_transaction_id UUID REFERENCES portal.payment_transactions(id) ON DELETE RESTRICT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix', 'boleto', 'cartao_link_externo', 'transferencia', 'dinheiro')),
  confirmation_status TEXT NOT NULL DEFAULT 'pending_validation' CHECK (confirmation_status IN ('pending_validation', 'confirmed', 'rejected', 'reversed')),
  gateway_provider TEXT NOT NULL DEFAULT 'manual',
  external_reference TEXT,
  proof_storage_path TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  validated_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_pay_tx_receivable ON portal.payment_transactions (receivable_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS portal.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  order_id UUID REFERENCES portal.orders(id) ON DELETE SET NULL,
  expense_category TEXT NOT NULL CHECK (expense_category IN ('pagamento_fabrica', 'frete', 'servico_adicional', 'taxa_rede', 'despesa_operacional', 'retrabalho')),
  description TEXT NOT NULL,
  vendor_name TEXT,
  due_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (paid_cents >= 0 AND paid_cents <= amount_cents),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'canceled')),
  config_basis TEXT NOT NULL DEFAULT 'manual' CHECK (config_basis IN ('manual', 'approved_rule', 'not_applicable')),
  notes TEXT,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_expenses_unit ON portal.expenses (unit_id, is_sandbox, status, due_date);

-- ----------------------------------------------------------------------------
-- 8. SAC / CHAMADOS, COFRE JURÍDICO, UNIVERSIDADE, SANDBOX, TAREFAS & NOTIFICAÇÕES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number VARCHAR(32) NOT NULL,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  order_id UUID REFERENCES portal.orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES portal.customers(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('Produto', 'Arte', 'Produção', 'Entrega', 'Financeiro', 'Sistema', 'Documentação')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_unit', 'resolved', 'closed')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  assignee_user_id UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  sla_due_at TIMESTAMPTZ,
  resolution_summary TEXT,
  rework_cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (rework_cost_cents >= 0),
  resolved_at TIMESTAMPTZ,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_portal_tickets_unit ON portal.support_tickets (unit_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS portal.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES portal.support_tickets(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES portal.units(id) ON DELETE CASCADE, -- NULL = documento compartilhado da rede
  customer_id UUID REFERENCES portal.customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES portal.orders(id) ON DELETE SET NULL,
  doc_category TEXT NOT NULL CHECK (doc_category IN ('franquia', 'unidade', 'contrato', 'termo_cliente', 'aprovacao', 'autorizacao', 'manual', 'comprovante')),
  requirement_level TEXT NOT NULL DEFAULT 'optional' CHECK (requirement_level IN ('mandatory_onboarding', 'mandatory_order_production', 'reference', 'optional')),
  title TEXT NOT NULL,
  description TEXT,
  current_classification TEXT NOT NULL DEFAULT 'modelo' CHECK (current_classification IN ('modelo', 'minuta', 'aprovado', 'assinado')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'in_review', 'approved', 'signed', 'expired', 'rejected')),
  owner_user_id UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  valid_until DATE,
  visible_roles JSONB NOT NULL DEFAULT '["franqueado_gestor","vendedor","designer","financeiro_unidade","suporte_franqueadora","producao_fabrica","admin_rede"]'::jsonb,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_docs_unit ON portal.documents (unit_id, status, doc_category);

CREATE TABLE IF NOT EXISTS portal.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES portal.documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  classification TEXT NOT NULL CHECK (classification IN ('modelo', 'minuta', 'aprovado', 'assinado')),
  storage_bucket TEXT,
  storage_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  external_url TEXT,
  evidence_notes TEXT,
  accepted_by_name TEXT,
  accepted_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number)
);

CREATE TABLE IF NOT EXISTS portal.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  sector_order INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  format_label TEXT,
  deliverable_summary TEXT,
  validation_criteria TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES portal.courses(id) ON DELETE CASCADE,
  lesson_order INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  summary TEXT,
  video_url TEXT NOT NULL,
  materials JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_minutes INTEGER NOT NULL DEFAULT 10,
  quiz_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_lessons_course ON portal.lessons (course_id, lesson_order);

CREATE TABLE IF NOT EXISTS portal.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES portal.profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES portal.courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('enrolled', 'in_progress', 'completed')),
  score_pct NUMERIC(5,2),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, user_id, course_id)
);

CREATE TABLE IF NOT EXISTS portal.lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES portal.profiles(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES portal.lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  resume_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (resume_position_seconds >= 0),
  quiz_score_pct NUMERIC(5,2),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS portal.banca_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES portal.profiles(id) ON DELETE CASCADE,
  case_title TEXT NOT NULL,
  exercise_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  submission_notes TEXT,
  video_storage_path TEXT,
  video_file_name TEXT,
  sales_score NUMERIC(4,2),
  art_score NUMERIC(4,2),
  compliance_ok BOOLEAN,
  final_score NUMERIC(4,2),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'retry_required')),
  evaluator_user_id UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  evaluator_notes TEXT,
  evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('contato', 'reuniao', 'follow_up', 'vencimento', 'aprovacao_esperada', 'entrega', 'implantacao')),
  title TEXT NOT NULL,
  description TEXT,
  customer_id UUID REFERENCES portal.customers(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES portal.opportunities(id) ON DELETE SET NULL,
  order_id UUID REFERENCES portal.orders(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'canceled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  completed_at TIMESTAMPTZ,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_tasks_unit_due ON portal.tasks (unit_id, is_sandbox, status, due_at);

CREATE TABLE IF NOT EXISTS portal.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES portal.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  entity_type TEXT,
  entity_id TEXT,
  dedupe_key TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_notif_dedupe_unread
  ON portal.notifications (user_id, unit_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_portal_notif_user_created ON portal.notifications (user_id, unit_id, created_at DESC);

CREATE TABLE IF NOT EXISTS portal.notification_preferences (
  user_id UUID NOT NULL REFERENCES portal.profiles(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES portal.units(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  muted_event_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, unit_id)
);

CREATE TABLE IF NOT EXISTS portal.integration_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES portal.units(id) ON DELETE CASCADE,
  integration_name TEXT NOT NULL CHECK (integration_name IN ('asaas_payments', 'nfe_emitter', 'whatsapp_api', 'email_smtp')),
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not_configured', 'blocked_test_mode', 'queued', 'sent', 'failed')),
  detail_message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'geral' CHECK (category IN ('geral', 'operacional', 'treinamento', 'comercial', 'compliance')),
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES portal.units(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES portal.profiles(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_audit_unit ON portal.audit_logs (unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_audit_entity ON portal.audit_logs (entity_type, entity_id);

-- Triggers automáticos de updated_at em portal.*
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'roles_permissions', 'units', 'unit_commercial_configs', 'profiles',
      'unit_memberships', 'customers', 'customer_contacts', 'opportunities',
      'products', 'price_lists', 'quotes', 'art_projects', 'orders',
      'shipments', 'receivables', 'expenses', 'support_tickets',
      'documents', 'courses', 'lessons', 'enrollments', 'lesson_progress',
      'banca_evaluations', 'tasks', 'notification_preferences'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_portal_%I_updated_at ON portal.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_portal_%I_updated_at BEFORE UPDATE ON portal.%I FOR EACH ROW EXECUTE FUNCTION portal.set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;
