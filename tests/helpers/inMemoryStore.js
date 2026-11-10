'use strict';

const crypto = require('crypto');
const { encryptSecret, decryptSecret, maskSecret } = require('../../server/utils/crypto');

function uuid() {
  return crypto.randomUUID();
}

function createInMemoryTestEnv() {
  const now = new Date().toISOString();

  const roles = [
    { id: uuid(), slug: 'super_admin', name: 'Super Administrador', permissions: ['*'] },
    { id: uuid(), slug: 'expansion_director', name: 'Diretor de Expansão', permissions: ['crm:*', 'analytics:*'] },
    { id: uuid(), slug: 'expansion_consultant', name: 'Consultor de Expansão', permissions: ['crm:read', 'crm:write'] },
    { id: uuid(), slug: 'marketing_analyst', name: 'Analista de Marketing', permissions: ['analytics:*', 'campaigns:*'] },
    { id: uuid(), slug: 'content_editor', name: 'Editor de Blog', permissions: ['blog:*'] }
  ];

  const adminUsers = [
    {
      id: uuid(),
      auth_user_id: 'auth-super-1',
      role_id: roles[0].id,
      role: roles[0],
      full_name: 'Diretor Teste King Sports',
      email: 'admin@kingsports.test',
      is_active: true,
      last_login_at: null,
      created_at: now
    },
    {
      id: uuid(),
      auth_user_id: 'auth-consultor-1',
      role_id: roles[2].id,
      role: roles[2],
      full_name: 'Consultor Teste',
      email: 'consultor@kingsports.test',
      is_active: true,
      last_login_at: null,
      created_at: now
    }
  ];

  const stageDefs = [
    { slug: 'novo-lead', name: 'Novo Lead', sort_order: 1, color_hex: '#38BDF8' },
    { slug: 'contato', name: 'Contato', sort_order: 2, color_hex: '#60A5FA' },
    { slug: 'qualificacao', name: 'Qualificação', sort_order: 3, color_hex: '#3B82F6' },
    { slug: 'reuniao', name: 'Reunião', sort_order: 4, color_hex: '#2563EB' },
    { slug: 'proposta', name: 'Proposta', sort_order: 5, color_hex: '#1D4ED8' },
    { slug: 'negociacao', name: 'Negociação', sort_order: 6, color_hex: '#1E40AF' },
    { slug: 'documentacao', name: 'Documentação (COF 10 Dias)', sort_order: 7, color_hex: '#0EA5E9' },
    { slug: 'venda', name: 'Venda', sort_order: 8, color_hex: '#10B981', is_terminal: true, is_won: true },
    { slug: 'perdido', name: 'Perdido', sort_order: 9, color_hex: '#64748B', is_terminal: true, is_lost: true },
    { slug: 'desqualificado', name: 'Desqualificado', sort_order: 10, color_hex: '#475569', is_terminal: true, is_disqualified: true }
  ].map((s) => ({
    id: uuid(),
    is_terminal: false,
    is_won: false,
    is_lost: false,
    is_disqualified: false,
    ...s
  }));

  const blogCategories = [
    { id: uuid(), name: 'Mercado de Franquias', slug: 'mercado-de-franquias', description: 'Mercado' },
    { id: uuid(), name: 'Uniformes Personalizados', slug: 'uniformes-personalizados', description: 'Produtos' }
  ];

  const blogPosts = [
    {
      id: uuid(),
      category_id: blogCategories[0].id,
      category: blogCategories[0],
      author: { id: adminUsers[0].id, full_name: adminUsers[0].full_name },
      title: 'Como vender uniformes personalizados sem montar fábrica',
      slug: 'como-vender-uniformes-sem-fabrica',
      excerpt: 'Entenda a operação comercial home based com produção centralizada em São Paulo.',
      content_html: '<h2>Modelo Home Based</h2><p>Operação enxuta com apoio fabril da King Sports LTDA.</p>',
      cover_image_url: '/assets/images/products-lineup.jpg',
      cover_image_alt: 'Linha King Sports',
      status: 'published',
      published_at: now,
      reading_time_minutes: 5,
      views_count: 0,
      leads_count: 0,
      schema_type: 'Article',
      cta_headline: 'Quer empreender na sua cidade?',
      cta_button_text: 'QUERO CONHECER A FRANQUIA',
      created_at: now,
      updated_at: now
    }
  ];

  const automationRules = [
    { id: uuid(), rule_key: 'new_lead_workflow', name: 'Novo Lead', trigger_event: 'lead.created', description: 'Workflow inicial', is_active: true, config: { notify_admin: false, auto_create_first_task: true, first_task_due_minutes: 30 } },
    { id: uuid(), rule_key: 'lead_qualified_workflow', name: 'Lead Qualificado', trigger_event: 'lead.qualified', description: 'Qualificação', is_active: true, config: {} },
    { id: uuid(), rule_key: 'unattended_lead_sla_alert', name: 'SLA Atendimento', trigger_event: 'lead.sla_breached', description: 'Alerta SLA', is_active: true, config: { sla_minutes: 30, escalate_priority: true } },
    { id: uuid(), rule_key: 'meeting_scheduled_workflow', name: 'Reunião Agendada', trigger_event: 'meeting.scheduled', description: 'Reunião', is_active: true, config: { auto_advance_stage: true } },
    { id: uuid(), rule_key: 'franchise_sold_workflow', name: 'Franquia Vendida', trigger_event: 'opportunity.won', description: 'Venda confirmada', is_active: true, config: { currency: 'BRL' } }
  ];

  const settings = new Map([
    ['tracking.gtm_id', { setting_key: 'tracking.gtm_id', category: 'tracking', label: 'GTM', value_json: '', is_secret: false, is_public: true }],
    ['tracking.meta_pixel_id', { setting_key: 'tracking.meta_pixel_id', category: 'tracking', label: 'Meta Pixel', value_json: '', is_secret: false, is_public: true }],
    ['tracking.meta_capi_token', { setting_key: 'tracking.meta_capi_token', category: 'tracking', label: 'Meta CAPI Token', value_json: '', is_secret: true, is_public: false }],
    ['tracking.ga4_measurement_id', { setting_key: 'tracking.ga4_measurement_id', category: 'tracking', label: 'GA4 ID', value_json: '', is_secret: false, is_public: true }],
    ['tracking.ga4_api_secret', { setting_key: 'tracking.ga4_api_secret', category: 'tracking', label: 'GA4 Secret', value_json: '', is_secret: true, is_public: false }],
    ['automation.unattended_sla_minutes', { setting_key: 'automation.unattended_sla_minutes', category: 'automation', label: 'SLA', value_json: 30, is_secret: false, is_public: false }],
    ['goals.kpi_thresholds', {
      setting_key: 'goals.kpi_thresholds',
      category: 'commercial_goals',
      label: 'Metas',
      value_json: {
        cpl_brl: { target: 35, warning: 60, critical: 90, direction: 'lower_is_better' },
        cpql_brl: { target: 90, warning: 150, critical: 220, direction: 'lower_is_better' },
        cac_brl: { target: 2500, warning: 4000, critical: 6000, direction: 'lower_is_better' },
        qualification_rate_pct: { target: 40, warning: 25, critical: 15, direction: 'higher_is_better' },
        avg_response_minutes: { target: 15, warning: 45, critical: 120, direction: 'lower_is_better' },
        roas: { target: 5, warning: 3, critical: 1.5, direction: 'higher_is_better' }
      },
      is_secret: false,
      is_public: false
    }]
  ]);

  const db = {
    leads: [],
    qualifications: [],
    attributions: [],
    opportunities: [],
    activities: [],
    tasks: [],
    meetings: [],
    campaigns: [],
    campaignMetrics: [],
    consents: [],
    marketingEvents: [],
    conversionEvents: [],
    automationJobs: [],
    auditLogs: []
  };

  const enqueuedJobs = [];

  const leadsRepo = {
    async findDuplicate(emailNormalized, whatsappNormalized) {
      return (
        db.leads.find((l) => l.email_normalized === emailNormalized) ||
        db.leads.find((l) => whatsappNormalized && l.whatsapp_normalized === whatsappNormalized) ||
        null
      );
    },
    async createLead(payload) {
      const row = {
        id: uuid(),
        submission_count: 1,
        first_contact_at: null,
        unattended_alert_sent_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload
      };
      db.leads.push(row);
      return { ...row };
    },
    async updateLead(id, patch) {
      const idx = db.leads.findIndex((l) => l.id === id);
      if (idx === -1) throw new Error('Lead não encontrado.');
      db.leads[idx] = { ...db.leads[idx], ...patch, updated_at: new Date().toISOString() };
      return { ...db.leads[idx] };
    },
    async getLeadById(id) {
      const lead = db.leads.find((l) => l.id === id);
      if (!lead) {
        const err = new Error('Lead não encontrado.');
        err.statusCode = 404;
        throw err;
      }
      return {
        ...lead,
        qualification: db.qualifications.find((q) => q.lead_id === id) || null,
        attributions: db.attributions.filter((a) => a.lead_id === id),
        opportunities: db.opportunities
          .filter((o) => o.lead_id === id)
          .map((o) => ({ ...o, stage: stageDefs.find((s) => s.id === o.stage_id) })),
        activities: db.activities.filter((a) => a.lead_id === id),
        tasks: db.tasks.filter((t) => t.lead_id === id),
        meetings: db.meetings.filter((m) => m.lead_id === id)
      };
    },
    async listLeads(filters = {}) {
      let rows = [...db.leads];
      if (filters.search) {
        const q = String(filters.search).toLowerCase();
        rows = rows.filter(
          (l) =>
            l.full_name.toLowerCase().includes(q) ||
            l.email.toLowerCase().includes(q) ||
            l.city.toLowerCase().includes(q)
        );
      }
      if (filters.qualification_status) {
        rows = rows.filter((l) => l.qualification_status === filters.qualification_status);
      }
      const items = rows.map((l) => ({
        ...l,
        qualification: db.qualifications.find((q) => q.lead_id === l.id) || null,
        opportunities: db.opportunities
          .filter((o) => o.lead_id === l.id)
          .map((o) => ({ ...o, stage: stageDefs.find((s) => s.id === o.stage_id) })),
        attributions: db.attributions.filter((a) => a.lead_id === l.id)
      }));
      return { items, total: items.length, page: 1, limit: 25, total_pages: 1 };
    },
    async upsertQualification(leadId, payload) {
      const idx = db.qualifications.findIndex((q) => q.lead_id === leadId);
      const total =
        payload.scorecard_financial != null
          ? Number(payload.scorecard_financial) +
            Number(payload.scorecard_territory) +
            Number(payload.scorecard_profile) +
            Number(payload.scorecard_dedication) +
            Number(payload.scorecard_compliance)
          : null;
      if (idx >= 0) {
        db.qualifications[idx] = { ...db.qualifications[idx], ...payload, scorecard_total: total };
        return db.qualifications[idx];
      }
      const row = { id: uuid(), lead_id: leadId, ...payload, scorecard_total: total };
      db.qualifications.push(row);
      return row;
    },
    async addAttribution(payload) {
      const row = { id: uuid(), created_at: new Date().toISOString(), ...payload };
      db.attributions.push(row);
      return row;
    },
    async listUnattendedPastSla(slaMinutes) {
      const cutoff = Date.now() - slaMinutes * 60 * 1000;
      return db.leads.filter(
        (l) => !l.first_contact_at && !l.unattended_alert_sent_at && new Date(l.created_at).getTime() <= cutoff
      );
    }
  };

  const crmRepo = {
    async listStages() {
      return stageDefs;
    },
    async getStageBySlug(slug) {
      return stageDefs.find((s) => s.slug === slug) || null;
    },
    async getStageById(id) {
      const found = stageDefs.find((s) => s.id === id);
      if (!found) throw new Error('Estágio não encontrado.');
      return found;
    },
    async createOpportunity(payload) {
      const row = { id: uuid(), created_at: new Date().toISOString(), stage_entered_at: new Date().toISOString(), ...payload };
      db.opportunities.push(row);
      return { ...row, stage: stageDefs.find((s) => s.id === row.stage_id) };
    },
    async getOpportunityById(id) {
      const row = db.opportunities.find((o) => o.id === id);
      if (!row) throw new Error('Oportunidade não encontrada.');
      return {
        ...row,
        stage: stageDefs.find((s) => s.id === row.stage_id),
        lead: db.leads.find((l) => l.id === row.lead_id)
      };
    },
    async getOpenOpportunityByLead(leadId) {
      const row = db.opportunities.find((o) => o.lead_id === leadId && o.status === 'open');
      if (!row) return null;
      return { ...row, stage: stageDefs.find((s) => s.id === row.stage_id) };
    },
    async updateOpportunity(id, patch) {
      const idx = db.opportunities.findIndex((o) => o.id === id);
      if (idx === -1) throw new Error('Oportunidade não encontrada.');
      db.opportunities[idx] = { ...db.opportunities[idx], ...patch, updated_at: new Date().toISOString() };
      const row = db.opportunities[idx];
      return {
        ...row,
        stage: stageDefs.find((s) => s.id === row.stage_id),
        lead: db.leads.find((l) => l.id === row.lead_id)
      };
    },
    async listKanbanOpportunities(filters = {}) {
      let rows = db.opportunities;
      if (filters.owner_id) rows = rows.filter((o) => o.owner_id === filters.owner_id);
      if (filters.status) rows = rows.filter((o) => o.status === filters.status);
      return rows.map((o) => ({
        ...o,
        stage: stageDefs.find((s) => s.id === o.stage_id),
        lead: db.leads.find((l) => l.id === o.lead_id)
      }));
    },
    async addActivity(payload) {
      const row = { id: uuid(), created_at: new Date().toISOString(), ...payload };
      db.activities.push(row);
      return row;
    },
    async createTask(payload) {
      const row = { id: uuid(), status: 'pending', created_at: new Date().toISOString(), ...payload };
      db.tasks.push(row);
      return row;
    },
    async updateTask(id, patch) {
      const idx = db.tasks.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error('Tarefa não encontrada.');
      db.tasks[idx] = { ...db.tasks[idx], ...patch };
      return db.tasks[idx];
    },
    async createMeeting(payload) {
      const row = { id: uuid(), created_at: new Date().toISOString(), ...payload };
      db.meetings.push(row);
      return row;
    },
    async updateMeeting(id, patch) {
      const idx = db.meetings.findIndex((m) => m.id === id);
      if (idx === -1) throw new Error('Reunião não encontrada.');
      db.meetings[idx] = { ...db.meetings[idx], ...patch };
      return db.meetings[idx];
    }
  };

  const trackingRepo = {
    async recordConsent(payload) {
      const row = { id: uuid(), consented_at: new Date().toISOString(), ...payload };
      db.consents.push(row);
      return row;
    },
    async getLatestConsentBySession(sessionId) {
      const matches = db.consents.filter((c) => c.session_id === sessionId);
      return matches[matches.length - 1] || null;
    },
    async insertMarketingEvent(payload) {
      const row = { id: uuid(), created_at: new Date().toISOString(), ...payload };
      db.marketingEvents.push(row);
      return row;
    },
    async findConversionByIdempotencyKey(key) {
      return db.conversionEvents.find((c) => c.idempotency_key === key) || null;
    },
    async upsertConversionEvent(payload) {
      const idx = db.conversionEvents.findIndex((c) => c.idempotency_key === payload.idempotency_key);
      if (idx >= 0) {
        db.conversionEvents[idx] = { ...db.conversionEvents[idx], ...payload, updated_at: new Date().toISOString() };
        return db.conversionEvents[idx];
      }
      const row = { id: uuid(), attempts: 0, created_at: new Date().toISOString(), ...payload };
      db.conversionEvents.push(row);
      return row;
    },
    async updateConversionEvent(id, patch) {
      const idx = db.conversionEvents.findIndex((c) => c.id === id);
      if (idx >= 0) db.conversionEvents[idx] = { ...db.conversionEvents[idx], ...patch };
      return db.conversionEvents[idx];
    },
    async listConversionEvents({ platform = null, status = null } = {}) {
      return db.conversionEvents.filter(
        (c) => (!platform || c.platform === platform) && (!status || c.status === status)
      );
    },
    async listMarketingEvents() {
      return db.marketingEvents;
    }
  };

  const campaignsRepo = {
    async listCampaigns() {
      return db.campaigns;
    },
    async createCampaign(payload) {
      const row = { id: uuid(), created_at: new Date().toISOString(), ...payload };
      db.campaigns.push(row);
      return row;
    },
    async findCampaignByUtm(utmCampaign, utmSource) {
      return (
        db.campaigns.find(
          (c) =>
            (utmCampaign && c.utm_campaign && c.utm_campaign.toLowerCase() === utmCampaign.toLowerCase()) ||
            (utmSource && c.utm_source && c.utm_source.toLowerCase() === utmSource.toLowerCase())
        ) || null
      );
    },
    async upsertCampaignMetrics(campaignId, payload) {
      const row = { id: uuid(), campaign_id: campaignId, ...payload };
      db.campaignMetrics.push(row);
      return row;
    },
    async getAnalyticsDataset(startIso, endIso) {
      const startMs = new Date(startIso).getTime();
      const endMs = new Date(endIso).getTime();
      const inWindow = (iso) => {
        const ms = new Date(iso).getTime();
        return ms >= startMs && ms <= endMs;
      };
      return {
        leads: db.leads.filter((l) => inWindow(l.created_at)),
        opportunities: db.opportunities.filter((o) => inWindow(o.created_at)),
        stages: stageDefs,
        meetings: db.meetings.filter((m) => inWindow(m.created_at)),
        campaigns: db.campaigns,
        metrics: db.campaignMetrics,
        attributions: db.attributions
      };
    }
  };

  const automationsRepo = {
    async listRules() {
      return automationRules;
    },
    async getRuleByKey(ruleKey) {
      return automationRules.find((r) => r.rule_key === ruleKey) || null;
    },
    async updateRule(id, patch) {
      const idx = automationRules.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error('Regra não encontrada.');
      automationRules[idx] = { ...automationRules[idx], ...patch };
      return automationRules[idx];
    },
    async recordJob(payload) {
      const row = { id: uuid(), created_at: new Date().toISOString(), ...payload };
      db.automationJobs.push(row);
      return row;
    },
    async updateJobByIdempotency(key, patch) {
      const idx = db.automationJobs.findIndex((j) => j.idempotency_key === key);
      if (idx >= 0) db.automationJobs[idx] = { ...db.automationJobs[idx], ...patch };
      return db.automationJobs[idx] || null;
    },
    async getJobById(id) {
      const j = db.automationJobs.find((x) => x.id === id);
      if (!j) throw new Error('Job não encontrado.');
      return j;
    },
    async listJobs() {
      return db.automationJobs;
    }
  };

  const blogRepo = {
    async listCategories() {
      return blogCategories;
    },
    async listPublishedPosts({ categorySlug = null } = {}) {
      let rows = blogPosts.filter((p) => p.status === 'published');
      if (categorySlug) {
        const cat = blogCategories.find((c) => c.slug === categorySlug);
        rows = cat ? rows.filter((p) => p.category_id === cat.id) : [];
      }
      return { items: rows, total: rows.length, page: 1, limit: 20 };
    },
    async getPublishedPostBySlug(slug) {
      return blogPosts.find((p) => p.slug === slug && p.status === 'published') || null;
    },
    async findPostBySlugAnyStatus(slug) {
      return blogPosts.find((p) => p.slug === slug) || null;
    },
    async incrementPostViews(id) {
      const post = blogPosts.find((p) => p.id === id);
      if (post) post.views_count += 1;
    },
    async incrementPostLeads(id) {
      const post = blogPosts.find((p) => p.id === id);
      if (post) post.leads_count += 1;
    },
    async listAllPostsAdmin() {
      return blogPosts;
    },
    async getPostByIdAdmin(id) {
      const post = blogPosts.find((p) => p.id === id);
      if (!post) throw new Error('Artigo não encontrado.');
      return post;
    },
    async createPost(payload) {
      const row = { id: uuid(), views_count: 0, leads_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
      blogPosts.push(row);
      return row;
    },
    async updatePost(id, patch) {
      const idx = blogPosts.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error('Artigo não encontrado.');
      blogPosts[idx] = { ...blogPosts[idx], ...patch, updated_at: new Date().toISOString() };
      return blogPosts[idx];
    },
    async deletePost(id) {
      const idx = blogPosts.findIndex((p) => p.id === id);
      if (idx >= 0) blogPosts.splice(idx, 1);
      return { deleted: true };
    }
  };

  const settingsRepo = {
    async listSettings({ includeSecretsDecrypted = false, publicOnly = false } = {}) {
      const rows = Array.from(settings.values()).filter((s) => (!publicOnly || (s.is_public && !s.is_secret)));
      return rows.map((row) => {
        if (!row.is_secret) return { ...row };
        const plain = row.value_json ? decryptSecret(row.value_json) : '';
        if (includeSecretsDecrypted) return { ...row, value_json: plain };
        return { ...row, value_json: plain ? maskSecret(plain) : '', has_secret: Boolean(plain) };
      });
    },
    async getSettingsMap(opts = {}) {
      const rows = await this.listSettings(opts);
      const map = {};
      for (const r of rows) map[r.setting_key] = r.value_json;
      return map;
    },
    async upsertSetting(key, value) {
      const existing = settings.get(key);
      if (existing) {
        if (existing.is_secret) {
          if (typeof value === 'string' && value.includes('••••')) return existing;
          existing.value_json = value ? encryptSecret(String(value)) : '';
        } else {
          existing.value_json = value;
        }
        existing.updated_at = new Date().toISOString();
        return existing;
      }
      const created = {
        setting_key: key,
        category: key.split('.')[0] || 'tracking',
        label: key,
        value_json: value,
        is_secret: false,
        is_public: false,
        updated_at: new Date().toISOString()
      };
      settings.set(key, created);
      return created;
    },
    async getAdminByAuthId(authId) {
      return adminUsers.find((u) => u.auth_user_id === authId) || null;
    },
    async getAdminByEmail(email) {
      return adminUsers.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
    },
    async listAdmins() {
      return adminUsers;
    },
    async listRoles() {
      return roles;
    },
    async updateAdminLoginTime(id) {
      const u = adminUsers.find((a) => a.id === id);
      if (u) u.last_login_at = new Date().toISOString();
    },
    async recordAuditLog(payload) {
      db.auditLogs.push({ id: uuid(), created_at: new Date().toISOString(), ...payload });
    },
    async listAuditLogs(limit = 50) {
      return db.auditLogs.slice(-limit).reverse();
    }
  };

  async function enqueueJob({ queueKey, jobName, idempotencyKey, payload }) {
    const job = { queueKey, jobName, idempotencyKey, payload };
    enqueuedJobs.push(job);
    await automationsRepo.recordJob({
      queue_name: queueKey === 'tracking' ? 'tracking-events' : 'crm-automations',
      job_name: jobName,
      idempotency_key: idempotencyKey,
      lead_id: payload?.lead_id || null,
      opportunity_id: payload?.opportunity_id || null,
      status: 'queued',
      payload
    });
    return { queued: true, bullJobId: `mock-${enqueuedJobs.length}` };
  }

  const noopMiddleware = (_req, _res, next) => next();
  const limiters = {
    publicLeadLimiter: noopMiddleware,
    publicEventLimiter: noopMiddleware,
    adminLoginLimiter: noopMiddleware,
    adminApiLimiter: noopMiddleware
  };

  function createAuthMocks() {
    const tokens = {
      'token-super-admin-1234567890': adminUsers[0],
      'token-consultor-1234567890': adminUsers[1]
    };
    return {
      async signInFn(email, _password) {
        const user = adminUsers.find((a) => a.email === email);
        if (!user) throw Object.assign(new Error('Credenciais inválidas'), { statusCode: 401 });
        const token = user.role.slug === 'super_admin'
          ? 'token-super-admin-1234567890'
          : 'token-consultor-1234567890';
        return {
          user: { id: user.auth_user_id, email: user.email },
          session: { access_token: token, refresh_token: 'ref-' + token, expires_in: 3600 }
        };
      },
      async authVerifier(token) {
        const user = tokens[token];
        if (!user) throw Object.assign(new Error('Sessão inválida'), { statusCode: 401 });
        return { user: { id: user.auth_user_id, email: user.email }, refreshedSession: null };
      }
    };
  }

  return {
    db,
    stages: stageDefs,
    roles,
    adminUsers,
    blogPosts,
    enqueuedJobs,
    repos: {
      leadsRepo,
      crmRepo,
      trackingRepo,
      campaignsRepo,
      automationsRepo,
      blogRepo,
      settingsRepo
    },
    enqueueJob,
    limiters,
    createAuthMocks,
    isStorageConfigured: () => true
  };
}

module.exports = { createInMemoryTestEnv };
