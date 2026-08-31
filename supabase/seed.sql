-- ====================================================================
-- SUPABASE SEED DATA: seed.sql
-- Seed de desenvolvimento e demonstração da plataforma B2B
-- ====================================================================

-- 1. SEED TENANT
INSERT INTO public.tenants (id, name, cnpj, status)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Fábrica Imperial Uniformes Esportivos Ltda',
    '12.345.678/0001-90',
    'active'
) ON CONFLICT (id) DO NOTHING;

-- 2. SEED LICENSE
-- Serial Key em texto para dev: MOCK-PRO-2026-DEV01
-- Hash SHA-256 de "MOCK-PRO-2026-DEV01" gerado com pgcrypto:
INSERT INTO public.licenses (
    id,
    tenant_id,
    serial_key_hash,
    serial_key_prefix,
    max_devices,
    expires_at,
    status
) VALUES (
    'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    encode(digest('MOCK-PRO-2026-DEV01', 'sha256'), 'hex'),
    'MOCK-PRO-DEV01',
    5,
    NOW() + INTERVAL '365 days',
    'active'
) ON CONFLICT (id) DO NOTHING;

-- 3. SEED DEVICES
INSERT INTO public.devices (
    id,
    license_id,
    tenant_id,
    fingerprint_hash,
    device_name,
    user_agent,
    ip_address,
    is_active
) VALUES 
(
    'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c33',
    'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'Terminal Vendas - Loja Centro (Chrome Windows)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    '187.54.120.10',
    true
),
(
    'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380d44',
    'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce',
    'Notebook Vendedor Externo (Edge MacOS)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    '177.89.44.201',
    true
) ON CONFLICT (id) DO NOTHING;

-- 4. SEED APPAREL MODELS (Modelos Globais e do Tenant)
INSERT INTO public.apparel_models (
    id,
    tenant_id,
    title,
    category,
    front_shadow_url,
    back_shadow_url,
    mask_url,
    mask_back_url,
    thumbnail_url
) VALUES
(
    'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380e55',
    NULL, -- Global
    'Camisa Futebol Dri-Fit Pro',
    'futebol',
    '/assets/models/soccer_jersey_front_shadow.png',
    '/assets/models/soccer_jersey_back_shadow.png',
    '/assets/models/soccer_jersey_mask.png',
    '/assets/models/soccer_jersey_back_mask.png',
    '/assets/models/soccer_jersey_thumb.png'
),
(
    'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380f66',
    NULL, -- Global
    'Regata Basquete Streetwear',
    'basquete',
    '/assets/models/basketball_front_shadow.png',
    '/assets/models/basketball_back_shadow.png',
    '/assets/models/basketball_mask.png',
    '/assets/models/basketball_back_mask.png',
    '/assets/models/basketball_thumb.png'
),
(
    'a6eebc99-9c0b-4ef8-bb6d-6bb9bd380a77',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', -- Privado do Tenant
    'Camisa Polo Corporativa Piquet',
    'polo',
    '/assets/models/polo_front_shadow.png',
    '/assets/models/polo_back_shadow.png',
    '/assets/models/polo_mask.png',
    '/assets/models/polo_back_mask.png',
    '/assets/models/polo_thumb.png'
) ON CONFLICT (id) DO NOTHING;

-- 5. SEED PATTERNS (Estampas Duotone SVG)
INSERT INTO public.patterns (
    id,
    tenant_id,
    title,
    category,
    svg_file_url,
    thumbnail_url
) VALUES
(
    'b7eebc99-9c0b-4ef8-bb6d-6bb9bd380b88',
    NULL,
    'Geométrico Diagonal Thunder',
    'Esportivo',
    '/assets/patterns/geometric_thunder.svg',
    '/assets/patterns/geometric_thunder_thumb.png'
),
(
    'c8eebc99-9c0b-4ef8-bb6d-6bb9bd380c99',
    NULL,
    'Degradê Wave Dinâmico',
    'Abstrato',
    '/assets/patterns/wave_dynamic.svg',
    '/assets/patterns/wave_dynamic_thumb.png'
),
(
    'd9eebc99-9c0b-4ef8-bb6d-6bb9bd380daa',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Camuflado Militar Moderno',
    'Camuflagem',
    '/assets/patterns/camo_modern.svg',
    '/assets/patterns/camo_modern_thumb.png'
) ON CONFLICT (id) DO NOTHING;
