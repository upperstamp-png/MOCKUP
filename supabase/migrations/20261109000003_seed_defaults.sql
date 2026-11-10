-- ============================================================================
-- KING SPORTS FRANCHISING — MIGRATION 003: STRUCTURAL DEFAULTS (NO FAKE DATA)
-- Popula apenas papéis administrativos, estágios oficiais do pipeline,
-- categorias editoriais, regras de automação e parâmetros estruturais padrão.
-- ============================================================================

-- 1. Papéis Administrativos
INSERT INTO public.admin_roles (slug, name, description, permissions)
VALUES
  ('super_admin', 'Super Administrador', 'Acesso total ao CRM, configurações, integrações e usuários.', '["*"]'::jsonb),
  ('expansion_director', 'Diretor de Expansão', 'Gestão completa de leads, pipeline, aprovações de comitê, campanhas e metas.', '["crm:*","analytics:*","campaigns:*","automations:read","blog:*","settings:read"]'::jsonb),
  ('expansion_consultant', 'Consultor de Expansão', 'Atendimento de leads, qualificação Scorecard 5 Filtros, reuniões e movimentação de funil.', '["crm:read","crm:write","analytics:read"]'::jsonb),
  ('marketing_analyst', 'Analista de Marketing & Performance', 'Acesso a campanhas, tracking, eventos de conversão, analytics e blog.', '["analytics:*","campaigns:*","blog:*","automations:read"]'::jsonb),
  ('content_editor', 'Editor de Conteúdo / Blog', 'Criação, agendamento e publicação de artigos SEO no blog.', '["blog:*"]'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- 2. Estágios Oficiais do Funil Comercial (Section 6 do Prompt)
INSERT INTO public.pipeline_stages (slug, name, sort_order, color_hex, is_terminal, is_won, is_lost, is_disqualified, sla_hours)
VALUES
  ('novo-lead', 'Novo Lead', 1, '#38BDF8', FALSE, FALSE, FALSE, FALSE, 1),
  ('contato', 'Contato', 2, '#60A5FA', FALSE, FALSE, FALSE, FALSE, 24),
  ('qualificacao', 'Qualificação', 3, '#3B82F6', FALSE, FALSE, FALSE, FALSE, 48),
  ('reuniao', 'Reunião', 4, '#2563EB', FALSE, FALSE, FALSE, FALSE, 72),
  ('proposta', 'Proposta', 5, '#1D4ED8', FALSE, FALSE, FALSE, FALSE, 96),
  ('negociacao', 'Negociação', 6, '#1E40AF', FALSE, FALSE, FALSE, FALSE, 120),
  ('documentacao', 'Documentação (COF 10 Dias)', 7, '#0EA5E9', FALSE, FALSE, FALSE, FALSE, 240),
  ('venda', 'Venda', 8, '#10B981', TRUE, TRUE, FALSE, FALSE, NULL),
  ('perdido', 'Perdido', 9, '#64748B', TRUE, FALSE, TRUE, FALSE, NULL),
  ('desqualificado', 'Desqualificado', 10, '#475569', TRUE, FALSE, FALSE, TRUE, NULL)
ON CONFLICT (slug) DO NOTHING;

-- 3. Categorias Editoriais do Blog
INSERT INTO public.blog_categories (name, slug, description)
VALUES
  ('Mercado de Franquias', 'mercado-de-franquias', 'Análises jurídicas, econômicas e operacionais do modelo de microfranquias home based.'),
  ('Uniformes Personalizados', 'uniformes-personalizados', 'Tecnologias de malhas, sublimação digital, modelagem esportiva e acabamento profissional.'),
  ('Gestão e Vendas Esportivas', 'gestao-e-vendas-esportivas', 'Estratégias comerciais para atender times, arenas, escolinhas e eventos corporativos.'),
  ('Empreendedorismo Esportivo', 'empreendedorismo-esportivo', 'Guias práticos para estruturar sua operação regional com apoio fabril de São Paulo.')
ON CONFLICT (slug) DO NOTHING;

-- 4. Regras de Automação Padrão (Section 8 do Prompt)
INSERT INTO public.automation_rules (rule_key, name, trigger_event, description, is_active, config)
VALUES
  (
    'new_lead_workflow',
    'Novo Lead — Oportunidade, Scoring e Notificação',
    'lead.created',
    'Cria oportunidade em Novo Lead, registra atribuição first/last touch, calcula Lead Score inicial e notifica equipe de expansão.',
    TRUE,
    '{"notify_admin": true, "auto_create_first_task": true, "first_task_due_minutes": 30}'::jsonb
  ),
  (
    'lead_qualified_workflow',
    'Lead Qualificado — Prioridade, Tarefa e Conversão',
    'lead.qualified',
    'Marca prioridade alta quando score >= 70 ou Scorecard >= 18/25, cria tarefa de agendamento e dispara evento de conversão qualificada.',
    TRUE,
    '{"min_score_for_high_priority": 70, "min_scorecard_points": 18, "send_conversion_event": true}'::jsonb
  ),
  (
    'unattended_lead_sla_alert',
    'Alerta de Lead Sem Atendimento',
    'lead.sla_breached',
    'Monitora leads sem primeiro contato registrado após o prazo configurável e gera alerta/tarefa urgente.',
    TRUE,
    '{"sla_minutes": 30, "escalate_priority": true}'::jsonb
  ),
  (
    'meeting_scheduled_workflow',
    'Reunião Agendada — Pipeline e Evento Schedule',
    'meeting.scheduled',
    'Move oportunidade para o estágio Reunião (se anterior), registra atividade e dispara evento Schedule se consentido.',
    TRUE,
    '{"auto_advance_stage": true, "send_schedule_event": true}'::jsonb
  ),
  (
    'franchise_sold_workflow',
    'Franquia Vendida — Valor Real e Conversão Offline',
    'opportunity.won',
    'Registra venda confirmada, valor real contratado, gera evento interno de venda e envia conversões offline elegíveis.',
    TRUE,
    '{"send_offline_conversion": true, "currency": "BRL"}'::jsonb
  )
ON CONFLICT (rule_key) DO NOTHING;

-- 5. Configurações Padrão do Sistema (Sem segredos preenchidos)
INSERT INTO public.system_settings (setting_key, category, label, description, value_json, is_secret, is_public)
VALUES
  ('tracking.gtm_id', 'tracking', 'Google Tag Manager ID', 'Container ID do GTM (ex.: GTM-XXXXXXX).', '""'::jsonb, FALSE, TRUE),
  ('tracking.ga4_measurement_id', 'tracking', 'GA4 Measurement ID', 'ID de medição do Google Analytics 4 (ex.: G-XXXXXXXXXX).', '""'::jsonb, FALSE, TRUE),
  ('tracking.ga4_api_secret', 'tracking', 'GA4 Measurement Protocol Secret', 'Chave secreta para envio server-side via GA4 Measurement Protocol.', '""'::jsonb, TRUE, FALSE),
  ('tracking.google_ads_conversion_id', 'tracking', 'Google Ads Conversion ID', 'ID da tag do Google Ads (ex.: AW-XXXXXXXXX).', '""'::jsonb, FALSE, TRUE),
  ('tracking.google_ads_label_lead', 'tracking', 'Google Ads Label (Lead)', 'Rótulo de conversão de envio de formulário.', '""'::jsonb, FALSE, TRUE),
  ('tracking.meta_pixel_id', 'tracking', 'Meta Pixel ID', 'ID numérico do Pixel Meta Ads.', '""'::jsonb, FALSE, TRUE),
  ('tracking.meta_capi_token', 'tracking', 'Meta Conversions API Access Token', 'Token de acesso da Meta Graph API para CAPI server-side.', '""'::jsonb, TRUE, FALSE),
  ('tracking.meta_test_event_code', 'tracking', 'Meta Test Event Code', 'Código opcional de teste no Gerenciador de Eventos da Meta.', '""'::jsonb, FALSE, FALSE),

  ('ads.meta_ad_account_id', 'ads_integrations', 'Meta Ad Account ID', 'ID da conta de anúncios (ex.: act_123456789).', '""'::jsonb, FALSE, FALSE),
  ('ads.ga4_property_id', 'ads_integrations', 'GA4 Property ID', 'ID numérico da propriedade GA4 para Data API.', '""'::jsonb, FALSE, FALSE),
  ('ads.google_ads_customer_id', 'ads_integrations', 'Google Ads Customer ID', 'ID da conta cliente Google Ads (10 dígitos).', '""'::jsonb, FALSE, FALSE),

  ('goals.kpi_thresholds', 'commercial_goals', 'Metas e Faixas de Indicadores (Verde / Laranja / Vermelho)', 'Limites configuráveis para barras horizontais do dashboard.', '{
    "cpl_brl": { "target": 35, "warning": 60, "critical": 90, "direction": "lower_is_better" },
    "cpql_brl": { "target": 90, "warning": 150, "critical": 220, "direction": "lower_is_better" },
    "cac_brl": { "target": 2500, "warning": 4000, "critical": 6000, "direction": "lower_is_better" },
    "qualification_rate_pct": { "target": 40, "warning": 25, "critical": 15, "direction": "higher_is_better" },
    "avg_response_minutes": { "target": 15, "warning": 45, "critical": 120, "direction": "lower_is_better" },
    "roas": { "target": 5, "warning": 3, "critical": 1.5, "direction": "higher_is_better" }
  }'::jsonb, FALSE, FALSE),

  ('automation.unattended_sla_minutes', 'automation', 'Prazo SLA para Lead sem Atendimento (minutos)', 'Tempo máximo antes de alertar lead sem primeiro contato.', '30'::jsonb, FALSE, FALSE),

  ('franchise.public_info', 'franchise_info', 'Informações Públicas da Franquia King Sports', 'Dados exibidos na landing page e páginas institucionais.', '{
    "brand_name": "King Sports Franchising",
    "factory_name": "King Sports LTDA",
    "factory_city": "São Paulo - SP",
    "reference_investment_brl": 20000,
    "reference_investment_note": "Investimento de referência sujeito à confirmação do modelo comercial e jurídico na entrega da COF (Lei nº 13.966/2019).",
    "moq_pieces": 10,
    "production_sla_days": "20 a 25 dias úteis",
    "whatsapp_expansion": "",
    "email_expansion": "expansao@kingsportsoficial.com.br"
  }'::jsonb, FALSE, TRUE),

  ('landing.content', 'landing_content', 'Textos e CTAs da Landing Page', 'Copy configurável pelo painel administrativo.', '{
    "hero_tag": "EXPANSÃO NACIONAL KING SPORTS • MODELO HOME BASED",
    "hero_headline": "SEJA UM FRANQUEADO KING SPORTS E COMECE A VENDER UNIFORMES PERSONALIZADOS SEM PRECISAR TER UMA FÁBRICA.",
    "hero_subheadline": "Empreenda na sua região com uma operação comercial home based e conte com a estrutura produtiva da King Sports.",
    "hero_cta_text": "QUERO CONHECER A FRANQUIA",
    "sticky_cta_text": "QUERO CONHECER A FRANQUIA",
    "final_cta_text": "ENVIAR CANDIDATURA"
  }'::jsonb, FALSE, TRUE)
ON CONFLICT (setting_key) DO NOTHING;
