-- ============================================================================
-- KING SPORTS FRANCHISING — MIGRATION 001: INITIAL SCHEMA
-- PostgreSQL / Supabase
-- Normalizado com UUIDs, Foreign Keys, Constraints, Índices e Timestamps
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Função de atualização automática de updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. ADMIN ROLES & USERS (Vinculado ao Supabase Auth: auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]+$'),
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  role_id UUID NOT NULL REFERENCES public.admin_roles(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_admin_users_auth_uid ON public.admin_users (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users (role_id);

-- ----------------------------------------------------------------------------
-- 2. BLOG CATEGORIES & BLOG POSTS (Criados antes de leads para FK de origem)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  author_admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  excerpt TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  cover_image_alt TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  reading_time_minutes INTEGER NOT NULL DEFAULT 4 CHECK (reading_time_minutes >= 1),
  meta_title TEXT,
  meta_description TEXT,
  canonical_url TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image_url TEXT,
  schema_type TEXT NOT NULL DEFAULT 'Article' CHECK (schema_type IN ('Article', 'BlogPosting', 'NewsArticle')),
  cta_headline TEXT,
  cta_button_text TEXT,
  views_count INTEGER NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  leads_count INTEGER NOT NULL DEFAULT 0 CHECK (leads_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status_pub ON public.blog_posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON public.blog_posts (category_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_scheduled ON public.blog_posts (status, scheduled_for) WHERE status = 'scheduled';

-- ----------------------------------------------------------------------------
-- 3. CAMPAIGNS & CAMPAIGN METRICS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('meta_ads', 'google_ads', 'organic', 'blog', 'direct', 'referral', 'other')),
  external_campaign_id TEXT,
  external_account_id TEXT,
  name TEXT NOT NULL,
  utm_campaign TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended', 'draft')),
  daily_budget_cents BIGINT DEFAULT 0 CHECK (daily_budget_cents >= 0),
  target_cpl_cents BIGINT CHECK (target_cpl_cents IS NULL OR target_cpl_cents >= 0),
  target_cpql_cents BIGINT CHECK (target_cpql_cents IS NULL OR target_cpql_cents >= 0),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, external_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_platform ON public.campaigns (platform);
CREATE INDEX IF NOT EXISTS idx_campaigns_utm ON public.campaigns (LOWER(utm_campaign));

CREATE TABLE IF NOT EXISTS public.campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  impressions BIGINT NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  reach BIGINT NOT NULL DEFAULT 0 CHECK (reach >= 0),
  clicks BIGINT NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  visitors BIGINT NOT NULL DEFAULT 0 CHECK (visitors >= 0),
  spend_cents BIGINT NOT NULL DEFAULT 0 CHECK (spend_cents >= 0),
  platform_leads INTEGER NOT NULL DEFAULT 0 CHECK (platform_leads >= 0),
  platform_conversions INTEGER NOT NULL DEFAULT 0 CHECK (platform_conversions >= 0),
  sync_source TEXT NOT NULL DEFAULT 'manual' CHECK (sync_source IN ('manual', 'meta_api', 'google_ads_api', 'ga4_data_api')),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, metric_date, sync_source)
);

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_date ON public.campaign_metrics (metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_campaign_date ON public.campaign_metrics (campaign_id, metric_date DESC);

-- ----------------------------------------------------------------------------
-- 4. PIPELINE STAGES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#2563EB',
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  is_won BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  is_disqualified BOOLEAN NOT NULL DEFAULT FALSE,
  sla_hours INTEGER CHECK (sla_hours IS NULL OR sla_hours > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_order ON public.pipeline_stages (sort_order ASC);

-- ----------------------------------------------------------------------------
-- 5. LEADS, ATTRIBUTION & QUALIFICATION
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  whatsapp_normalized TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL CHECK (char_length(state) = 2),
  desired_zip_prefix TEXT,
  lead_score INTEGER NOT NULL DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  score_grade TEXT NOT NULL DEFAULT 'C' CHECK (score_grade IN ('A', 'B', 'C', 'D')),
  qualification_status TEXT NOT NULL DEFAULT 'pending' CHECK (qualification_status IN ('pending', 'qualified', 'nurture', 'disqualified')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  primary_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  origin_blog_post_id UUID REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  first_contact_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unattended_alert_sent_at TIMESTAMPTZ,
  submission_count INTEGER NOT NULL DEFAULT 1 CHECK (submission_count >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email_unique ON public.leads (email_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_norm ON public.leads (whatsapp_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_qual_status ON public.leads (qualification_status);
CREATE INDEX IF NOT EXISTS idx_leads_state ON public.leads (state);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON public.leads (assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_unattended ON public.leads (created_at) WHERE first_contact_at IS NULL;

CREATE TABLE IF NOT EXISTS public.lead_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  touch_type TEXT NOT NULL CHECK (touch_type IN ('first_touch', 'last_touch', 'reengagement')),
  session_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  gclid TEXT,
  fbclid TEXT,
  gbraid TEXT,
  wbraid TEXT,
  fbp TEXT,
  fbc TEXT,
  landing_page TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  consent_analytics BOOLEAN NOT NULL DEFAULT FALSE,
  consent_marketing BOOLEAN NOT NULL DEFAULT FALSE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_attributions_lead ON public.lead_attributions (lead_id, touch_type);
CREATE INDEX IF NOT EXISTS idx_lead_attributions_utm ON public.lead_attributions (utm_source, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_lead_attributions_gclid ON public.lead_attributions (gclid) WHERE gclid IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.lead_qualification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  commercial_experience TEXT NOT NULL,
  current_profession TEXT NOT NULL,
  available_capital_range TEXT NOT NULL,
  desired_start_timeframe TEXT NOT NULL,
  intended_track TEXT NOT NULL CHECK (intended_track IN ('comercial', 'designer', 'hibrido')),
  -- Scorecard dos 5 Filtros (Doc. 23: 0, 3 ou 5 pontos por filtro, máximo 25)
  scorecard_financial INTEGER CHECK (scorecard_financial IN (0, 3, 5)),
  scorecard_territory INTEGER CHECK (scorecard_territory IN (0, 3, 5)),
  scorecard_profile INTEGER CHECK (scorecard_profile IN (0, 3, 5)),
  scorecard_dedication INTEGER CHECK (scorecard_dedication IN (0, 3, 5)),
  scorecard_compliance INTEGER CHECK (scorecard_compliance IN (0, 3, 5)),
  scorecard_total INTEGER GENERATED ALWAYS AS (
    COALESCE(scorecard_financial, 0) +
    COALESCE(scorecard_territory, 0) +
    COALESCE(scorecard_profile, 0) +
    COALESCE(scorecard_dedication, 0) +
    COALESCE(scorecard_compliance, 0)
  ) STORED,
  scoring_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. OPPORTUNITIES, ACTIVITIES, TASKS & MEETINGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT,
  owner_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  estimated_value_cents BIGINT NOT NULL DEFAULT 2000000 CHECK (estimated_value_cents >= 0),
  actual_value_cents BIGINT CHECK (actual_value_cents IS NULL OR actual_value_cents >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'disqualified')),
  loss_reason TEXT,
  disqualification_reason TEXT,
  next_follow_up_at TIMESTAMPTZ,
  cof_delivered_at TIMESTAMPTZ,
  cof_legal_release_at TIMESTAMPTZ,
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_lead ON public.opportunities (lead_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON public.opportunities (stage_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON public.opportunities (status);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner ON public.opportunities (owner_id);

CREATE TABLE IF NOT EXISTS public.lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  actor_admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'lead_created', 'lead_reengagement', 'note', 'call', 'whatsapp', 'email',
    'stage_changed', 'score_updated', 'scorecard_evaluated', 'task_created',
    'task_completed', 'meeting_scheduled', 'meeting_completed', 'cof_delivered',
    'automation_executed', 'system'
  )),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_created ON public.lead_activities (lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_lead ON public.tasks (lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON public.tasks (assigned_to, status, due_at);

CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  host_admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  meeting_type TEXT NOT NULL DEFAULT 'apresentacao' CHECK (meeting_type IN ('pre_qualificacao', 'apresentacao', 'tour_fabrica', 'comite', 'fechamento')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45 CHECK (duration_minutes > 0),
  meeting_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'no_show', 'cancelled', 'rescheduled')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_lead ON public.meetings (lead_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled ON public.meetings (scheduled_for DESC, status);

-- ----------------------------------------------------------------------------
-- 7. TRACKING, LGPD CONSENT & CONVERSION EVENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  analytics_consent BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  functional_consent BOOLEAN NOT NULL DEFAULT TRUE,
  policy_version TEXT NOT NULL DEFAULT '1.0',
  ip_hash TEXT,
  user_agent TEXT,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_records_session ON public.consent_records (session_id, consented_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_records_lead ON public.consent_records (lead_id);

CREATE TABLE IF NOT EXISTS public.marketing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  session_id TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('client', 'server')),
  page_url TEXT,
  referrer TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  consent_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_events_event_id ON public.marketing_events (event_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_name_created ON public.marketing_events (event_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta_capi', 'ga4_mp', 'google_ads_offline', 'internal')),
  event_name TEXT NOT NULL,
  event_value_cents BIGINT CHECK (event_value_cents IS NULL OR event_value_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'skipped_no_credentials', 'skipped_no_consent', 'failed', 'dlq')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_status INTEGER,
  response_body JSONB,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversion_events_event_id ON public.conversion_events (event_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_status ON public.conversion_events (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversion_events_lead ON public.conversion_events (lead_id);

-- ----------------------------------------------------------------------------
-- 8. AUTOMATIONS (RULES & BULLMQ EXECUTION LOGS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  job_name TEXT NOT NULL,
  bull_job_id TEXT,
  idempotency_key TEXT UNIQUE,
  rule_id UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('pending_worker', 'queued', 'active', 'completed', 'failed', 'dlq')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON public.automation_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_queue ON public.automation_jobs (queue_name, created_at DESC);

-- ----------------------------------------------------------------------------
-- 9. AUDIT LOGS & SYSTEM SETTINGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('tracking', 'ads_integrations', 'commercial_goals', 'franchise_info', 'landing_content', 'automation', 'security')),
  label TEXT NOT NULL,
  description TEXT,
  value_json JSONB NOT NULL DEFAULT 'null'::jsonb,
  is_secret BOOLEAN NOT NULL DEFAULT FALSE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_category ON public.system_settings (category);
CREATE INDEX IF NOT EXISTS idx_system_settings_public ON public.system_settings (is_public) WHERE is_public = TRUE;

-- ----------------------------------------------------------------------------
-- Triggers de updated_at em todas as tabelas com updated_at
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'admin_roles', 'admin_users', 'blog_categories', 'blog_posts',
      'campaigns', 'campaign_metrics', 'pipeline_stages', 'leads',
      'lead_qualification', 'opportunities', 'tasks', 'meetings',
      'conversion_events', 'automation_rules', 'automation_jobs',
      'system_settings'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;
