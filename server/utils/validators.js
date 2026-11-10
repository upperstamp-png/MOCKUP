'use strict';

const { z } = require('zod');

const brazilStates = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO'
];

const leadSubmissionSchema = z.object({
  // Identificação
  full_name: z.string().trim().min(3, 'Informe seu nome completo.').max(140),
  whatsapp: z
    .string()
    .trim()
    .min(10, 'Informe um WhatsApp válido com DDD.')
    .max(25)
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'WhatsApp precisa ter ao menos 10 dígitos com DDD.'),
  email: z.string().trim().email('Informe um e-mail válido.').max(160),
  city: z.string().trim().min(2, 'Informe sua cidade.').max(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => brazilStates.includes(v), 'Selecione um estado (UF) válido.'),
  desired_zip_prefix: z.string().trim().max(15).optional().default(''),

  // Qualificação
  commercial_experience: z.string().trim().min(2, 'Informe sua experiência comercial.').max(120),
  current_profession: z.string().trim().min(2, 'Informe sua profissão atual.').max(120),
  available_capital_range: z.string().trim().min(2, 'Selecione sua disponibilidade de capital.').max(120),
  desired_start_timeframe: z.string().trim().min(2, 'Selecione o prazo desejado para começar.').max(120),
  intended_track: z.enum(['comercial', 'designer', 'hibrido'], {
    errorMap: () => ({ message: 'Selecione o tipo de atuação pretendida.' })
  }),

  // Anti-spam
  website_hp: z.string().max(0, 'Envio rejeitado.').optional().default(''),
  form_started_at: z.coerce.number().optional(),

  // Tracking & Consentimento LGPD
  event_id: z.string().trim().max(120).optional(),
  session_id: z.string().trim().max(120).optional().default(''),
  blog_post_slug: z.string().trim().max(160).optional().default(''),
  lgpd_accepted: z.boolean().refine((v) => v === true, 'É necessário aceitar a Política de Privacidade para prosseguir.'),
  consent: z
    .object({
      analytics: z.boolean().default(false),
      marketing: z.boolean().default(false),
      functional: z.boolean().default(true),
      policy_version: z.string().default('1.0')
    })
    .optional(),
  attribution: z
    .object({
      first_touch: z.record(z.any()).optional(),
      last_touch: z.record(z.any()).optional()
    })
    .optional()
});

const publicEventSchema = z.object({
  event_id: z.string().trim().min(6).max(120),
  session_id: z.string().trim().min(4).max(120),
  event_name: z.enum([
    'page_view',
    'view_content',
    'cta_click',
    'form_start',
    'form_step_complete',
    'lead_submit',
    'blog_article_view'
  ]),
  page_url: z.string().max(1000).optional().default(''),
  referrer: z.string().max(1000).optional().default(''),
  payload: z.record(z.any()).optional().default({}),
  consent: z
    .object({
      analytics: z.boolean().default(false),
      marketing: z.boolean().default(false),
      functional: z.boolean().default(true)
    })
    .optional()
});

const consentRecordSchema = z.object({
  session_id: z.string().trim().min(4).max(120),
  analytics_consent: z.boolean(),
  marketing_consent: z.boolean(),
  functional_consent: z.boolean().default(true),
  policy_version: z.string().max(20).default('1.0')
});

const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  password: z.string().min(6, 'Senha inválida.')
});

const passwordResetRequestSchema = z.object({
  email: z.string().trim().email('E-mail inválido.')
});

const stageChangeSchema = z.object({
  stage_id: z.string().uuid('Estágio inválido.'),
  actual_value_cents: z.coerce.number().int().min(0).optional().nullable(),
  loss_reason: z.string().trim().max(300).optional().nullable(),
  disqualification_reason: z.string().trim().max(300).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable()
});

const leadUpdateSchema = z.object({
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  qualification_status: z.enum(['pending', 'qualified', 'nurture', 'disqualified']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  desired_zip_prefix: z.string().trim().max(15).optional(),
  next_follow_up_at: z.string().datetime().nullable().optional(),
  estimated_value_cents: z.coerce.number().int().min(0).optional()
});

const scorecardSchema = z.object({
  scorecard_financial: z.union([z.literal(0), z.literal(3), z.literal(5)]),
  scorecard_territory: z.union([z.literal(0), z.literal(3), z.literal(5)]),
  scorecard_profile: z.union([z.literal(0), z.literal(3), z.literal(5)]),
  scorecard_dedication: z.union([z.literal(0), z.literal(3), z.literal(5)]),
  scorecard_compliance: z.union([z.literal(0), z.literal(3), z.literal(5)]),
  notes: z.string().trim().max(1000).optional()
});

const activityCreateSchema = z.object({
  activity_type: z.enum(['note', 'call', 'whatsapp', 'email', 'cof_delivered', 'system']).default('note'),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(3000).optional().default('')
});

const taskCreateSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1000).optional().default(''),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assigned_to: z.string().uuid().optional().nullable(),
  due_at: z.string().datetime().optional().nullable()
});

const taskUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  due_at: z.string().datetime().optional().nullable()
});

const meetingCreateSchema = z.object({
  title: z.string().trim().min(2).max(180),
  meeting_type: z.enum(['pre_qualificacao', 'apresentacao', 'tour_fabrica', 'comite', 'fechamento']).default('apresentacao'),
  scheduled_for: z.string().datetime(),
  duration_minutes: z.coerce.number().int().min(10).max(240).default(45),
  meeting_url: z.string().trim().max(500).optional().default(''),
  notes: z.string().trim().max(2000).optional().default('')
});

const meetingUpdateSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'no_show', 'cancelled', 'rescheduled']),
  notes: z.string().trim().max(2000).optional()
});

const campaignCreateSchema = z.object({
  platform: z.enum(['meta_ads', 'google_ads', 'organic', 'blog', 'direct', 'referral', 'other']),
  external_campaign_id: z.string().trim().max(120).optional().nullable(),
  external_account_id: z.string().trim().max(120).optional().nullable(),
  name: z.string().trim().min(2).max(160),
  utm_campaign: z.string().trim().max(160).optional().nullable(),
  utm_source: z.string().trim().max(100).optional().nullable(),
  utm_medium: z.string().trim().max(100).optional().nullable(),
  status: z.enum(['active', 'paused', 'ended', 'draft']).default('active'),
  daily_budget_cents: z.coerce.number().int().min(0).default(0),
  target_cpl_cents: z.coerce.number().int().min(0).optional().nullable(),
  target_cpql_cents: z.coerce.number().int().min(0).optional().nullable()
});

const campaignMetricSchema = z.object({
  metric_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use formato YYYY-MM-DD.'),
  impressions: z.coerce.number().int().min(0).default(0),
  reach: z.coerce.number().int().min(0).default(0),
  clicks: z.coerce.number().int().min(0).default(0),
  visitors: z.coerce.number().int().min(0).default(0),
  spend_cents: z.coerce.number().int().min(0).default(0),
  platform_leads: z.coerce.number().int().min(0).default(0),
  platform_conversions: z.coerce.number().int().min(0).default(0)
});

const blogPostSchema = z.object({
  category_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(4).max(200),
  slug: z.string().trim().min(3).max(160).optional(),
  excerpt: z.string().trim().max(500).default(''),
  content_html: z.string().min(20),
  cover_image_url: z.string().trim().max(600).optional().nullable(),
  cover_image_alt: z.string().trim().max(240).optional().nullable(),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).default('draft'),
  scheduled_for: z.string().datetime().optional().nullable(),
  reading_time_minutes: z.coerce.number().int().min(1).max(60).default(4),
  meta_title: z.string().trim().max(160).optional().nullable(),
  meta_description: z.string().trim().max(320).optional().nullable(),
  canonical_url: z.string().trim().max(500).optional().nullable(),
  og_title: z.string().trim().max(160).optional().nullable(),
  og_description: z.string().trim().max(320).optional().nullable(),
  og_image_url: z.string().trim().max(600).optional().nullable(),
  schema_type: z.enum(['Article', 'BlogPosting', 'NewsArticle']).default('Article'),
  cta_headline: z.string().trim().max(240).optional().nullable(),
  cta_button_text: z.string().trim().max(80).optional().nullable()
});

const settingsBulkUpdateSchema = z.object({
  settings: z.record(z.any())
});

const automationRuleUpdateSchema = z.object({
  is_active: z.boolean().optional(),
  config: z.record(z.any()).optional()
});

const adminUserCreateSchema = z.object({
  full_name: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72).optional(),
  role_slug: z.enum(['super_admin', 'expansion_director', 'expansion_consultant', 'marketing_analyst', 'content_editor']),
  phone: z.string().trim().max(30).optional().nullable(),
  is_active: z.boolean().default(true)
});

module.exports = {
  brazilStates,
  leadSubmissionSchema,
  publicEventSchema,
  consentRecordSchema,
  loginSchema,
  passwordResetRequestSchema,
  stageChangeSchema,
  leadUpdateSchema,
  scorecardSchema,
  activityCreateSchema,
  taskCreateSchema,
  taskUpdateSchema,
  meetingCreateSchema,
  meetingUpdateSchema,
  campaignCreateSchema,
  campaignMetricSchema,
  blogPostSchema,
  settingsBulkUpdateSchema,
  automationRuleUpdateSchema,
  adminUserCreateSchema
};
