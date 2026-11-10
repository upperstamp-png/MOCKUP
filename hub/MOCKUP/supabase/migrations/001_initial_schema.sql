-- ====================================================================
-- SUPABASE MIGRATION: 001_initial_schema.sql
-- Plataforma B2B de Mockups Interativos de Uniformes e Vestuário
-- ====================================================================

-- 1. EXTENSIONS & SCHEMAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUM TYPES
DO $$ BEGIN
    CREATE TYPE tenant_status AS ENUM ('active', 'blocked', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE license_status AS ENUM ('active', 'blocked', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE apparel_category AS ENUM (
        'futebol',
        'basquete',
        'polo',
        'camiseta',
        'bone',
        'moletom',
        'outros'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- 4. TABLES
-- ====================================================================

-- 4.1 TENANTS
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    cnpj VARCHAR(20) NOT NULL UNIQUE,
    status tenant_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4.2 LICENSES
CREATE TABLE IF NOT EXISTS public.licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    serial_key_hash VARCHAR(128) NOT NULL UNIQUE,
    serial_key_prefix VARCHAR(16) NOT NULL, -- Ex: "MOCK-PRO-XXXX"
    max_devices INTEGER NOT NULL DEFAULT 3 CHECK (max_devices > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    status license_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licenses_tenant_id ON public.licenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_licenses_serial_hash ON public.licenses(serial_key_hash);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);

CREATE TRIGGER set_licenses_updated_at
    BEFORE UPDATE ON public.licenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4.3 DEVICES
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    fingerprint_hash VARCHAR(128) NOT NULL,
    device_name VARCHAR(100) NOT NULL DEFAULT 'Web Browser',
    user_agent TEXT,
    ip_address VARCHAR(45),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_active_license_fingerprint UNIQUE(license_id, fingerprint_hash)
);

CREATE INDEX IF NOT EXISTS idx_devices_license_id ON public.devices(license_id);
CREATE INDEX IF NOT EXISTS idx_devices_tenant_id ON public.devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON public.devices(fingerprint_hash);

-- 4.4 APPAREL MODELS (Peças / Roupas)
CREATE TABLE IF NOT EXISTS public.apparel_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL = Modelo Global
    title VARCHAR(100) NOT NULL,
    category apparel_category NOT NULL DEFAULT 'outros',
    front_shadow_url TEXT NOT NULL,
    back_shadow_url TEXT NOT NULL,
    mask_url TEXT NOT NULL,
    mask_back_url TEXT,
    thumbnail_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apparel_models_tenant_id ON public.apparel_models(tenant_id);
CREATE INDEX IF NOT EXISTS idx_apparel_models_category ON public.apparel_models(category);

CREATE TRIGGER set_apparel_models_updated_at
    BEFORE UPDATE ON public.apparel_models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4.5 PATTERNS (Estampas Duotone SVG)
CREATE TABLE IF NOT EXISTS public.patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL = Estampa Global
    title VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'Geral',
    svg_file_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patterns_tenant_id ON public.patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patterns_category ON public.patterns(category);

-- 4.6 MOCKUP EXPORTS (Histórico de Exportações)
CREATE TABLE IF NOT EXISTS public.mockup_exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID,
    client_name VARCHAR(120) NOT NULL,
    front_png_url TEXT NOT NULL,
    back_png_url TEXT NOT NULL,
    sales_board_url TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mockup_exports_tenant_id ON public.mockup_exports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mockup_exports_created_at ON public.mockup_exports(created_at DESC);

-- 4.7 AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    actor_type VARCHAR(30) NOT NULL, -- 'system', 'device', 'admin'
    actor_id VARCHAR(100),
    action VARCHAR(50) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ====================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apparel_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mockup_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to extract tenant_id from auth JWT claim
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('request.jwt.claim.tenantId', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- 5.1 TENANTS POLICIES
CREATE POLICY "Tenants readable by their own authenticated session"
    ON public.tenants FOR SELECT
    USING (id = current_tenant_id());

-- 5.2 LICENSES POLICIES
CREATE POLICY "Licenses readable by owning tenant"
    ON public.licenses FOR SELECT
    USING (tenant_id = current_tenant_id());

-- 5.3 DEVICES POLICIES
CREATE POLICY "Devices readable by owning tenant"
    ON public.devices FOR SELECT
    USING (tenant_id = current_tenant_id());

CREATE POLICY "Devices insertable/updatable by owning tenant"
    ON public.devices FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- 5.4 APPAREL MODELS POLICIES (Global + Tenant Isolation)
CREATE POLICY "Apparel models viewable if global or belongs to tenant"
    ON public.apparel_models FOR SELECT
    USING (tenant_id IS NULL OR tenant_id = current_tenant_id());

CREATE POLICY "Apparel models editable only by owner tenant"
    ON public.apparel_models FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- 5.5 PATTERNS POLICIES (Global + Tenant Isolation)
CREATE POLICY "Patterns viewable if global or belongs to tenant"
    ON public.patterns FOR SELECT
    USING (tenant_id IS NULL OR tenant_id = current_tenant_id());

CREATE POLICY "Patterns editable only by owner tenant"
    ON public.patterns FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- 5.6 MOCKUP EXPORTS POLICIES
CREATE POLICY "Mockup exports isolated strictly by tenant"
    ON public.mockup_exports FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- 5.7 AUDIT LOGS POLICIES
CREATE POLICY "Audit logs readable only by owning tenant"
    ON public.audit_logs FOR SELECT
    USING (tenant_id = current_tenant_id());

-- ====================================================================
-- 6. STORAGE BUCKETS & POLICIES
-- ====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('apparel-models', 'apparel-models', true, 52428800, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
    ('patterns', 'patterns', true, 20971520, ARRAY['image/svg+xml', 'image/png']),
    ('logos', 'logos', false, 20971520, ARRAY['image/png', 'image/svg+xml', 'image/webp']),
    ('mockup-exports', 'mockup-exports', false, 52428800, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage Policies
CREATE POLICY "Public apparel models access"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'apparel-models');

CREATE POLICY "Public patterns access"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'patterns');

CREATE POLICY "Tenant isolated logos upload"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'logos' AND
        (storage.foldername(name))[1] = current_tenant_id()::text
    );

CREATE POLICY "Tenant isolated logos select"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'logos' AND
        (storage.foldername(name))[1] = current_tenant_id()::text
    );

CREATE POLICY "Tenant isolated mockup exports insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'mockup-exports' AND
        (storage.foldername(name))[1] = current_tenant_id()::text
    );

CREATE POLICY "Tenant isolated mockup exports select"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'mockup-exports' AND
        (storage.foldername(name))[1] = current_tenant_id()::text
    );
