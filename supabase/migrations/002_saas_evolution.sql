-- ====================================================================
-- SUPABASE MIGRATION: 002_saas_evolution.sql
-- Evolução SaaS B2B: Profiles/Vendedores, Sessões Ativas, 
-- Persistência de LayerState, Billing e Políticas de Storage
-- ====================================================================

-- 1. ENUMS ADICIONAIS
DO $$ BEGIN
    CREATE TYPE seller_role AS ENUM ('tenant_admin', 'seller');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE seller_status AS ENUM ('active', 'blocked', 'invited');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE export_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. PROFILES / VENDEDORES (Vinculados a auth.users e ao tenant)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role seller_role NOT NULL DEFAULT 'seller',
    status seller_status NOT NULL DEFAULT 'active',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3. ACTIVE SESSIONS (Controle estrito de sessões simultâneas de vendedores)
CREATE TABLE IF NOT EXISTS public.active_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_label VARCHAR(150) NOT NULL DEFAULT 'Terminal Web',
    user_agent TEXT,
    ip_address VARCHAR(45),
    session_token_hash VARCHAR(128) NOT NULL UNIQUE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_tenant ON public.active_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_license ON public.active_sessions(license_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON public.active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_seen ON public.active_sessions(last_seen_at);

-- 4. EVOLUÇÃO DE MOCKUP EXPORTS (Persistência completa do LayerState e status)
ALTER TABLE public.mockup_exports 
    ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS layer_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS combined_png_url TEXT,
    ADD COLUMN IF NOT EXISTS status export_status NOT NULL DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 2000,
    ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 2000,
    ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS watermark_applied BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS error_code VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_mockup_exports_seller_id ON public.mockup_exports(seller_id);
CREATE INDEX IF NOT EXISTS idx_mockup_exports_status ON public.mockup_exports(status);

-- 5. BILLING & ASSINATURAS (Arquitetura desacoplada para Gateway de Pagamentos)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    license_id UUID REFERENCES public.licenses(id) ON DELETE SET NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'generic', -- 'asaas', 'pagarme', 'stripe'
    external_customer_id VARCHAR(100),
    external_subscription_id VARCHAR(100),
    plan_name VARCHAR(100) NOT NULL DEFAULT 'Plano B2B Pro',
    price_cents INTEGER NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON public.subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_external_sub ON public.subscriptions(external_subscription_id);

CREATE TRIGGER set_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. RLS POLICIES PARA AS NOVAS TABELAS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 6.1 PROFILES POLICIES
CREATE POLICY "Profiles readable by users in the same tenant"
    ON public.profiles FOR SELECT
    USING (tenant_id = current_tenant_id() OR id = auth.uid());

CREATE POLICY "Profiles editable only by tenant admin"
    ON public.profiles FOR ALL
    USING (
        tenant_id = current_tenant_id() AND 
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'tenant_admin')
    )
    WITH CHECK (
        tenant_id = current_tenant_id() AND 
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'tenant_admin')
    );

-- 6.2 ACTIVE SESSIONS POLICIES
CREATE POLICY "Active sessions readable by tenant members"
    ON public.active_sessions FOR SELECT
    USING (tenant_id = current_tenant_id());

CREATE POLICY "Active sessions modifiable by owning user or tenant admin"
    ON public.active_sessions FOR ALL
    USING (
        tenant_id = current_tenant_id() AND 
        (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'tenant_admin'))
    );

-- 6.3 SUBSCRIPTIONS POLICIES
CREATE POLICY "Subscriptions readable by tenant admin"
    ON public.subscriptions FOR SELECT
    USING (tenant_id = current_tenant_id());

-- 7. REGRAS ESTRITAS DE STORAGE MULTI-TENANT
-- Convenção: {tenant_id}/{folder}/{filename}
CREATE POLICY "Strict tenant storage isolation insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id IN ('models', 'patterns', 'logos', 'mockup-exports') AND
        (storage.foldername(name))[1] = current_tenant_id()::text
    );

CREATE POLICY "Strict tenant storage isolation select"
    ON storage.objects FOR SELECT
    USING (
        bucket_id IN ('models', 'patterns', 'logos', 'mockup-exports') AND
        (storage.foldername(name))[1] = current_tenant_id()::text
    );
