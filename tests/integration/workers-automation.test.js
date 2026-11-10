'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createInMemoryTestEnv } = require('../helpers/inMemoryStore');
const { createSettingsService } = require('../../server/services/settingsService');
const { createAutomationService } = require('../../server/services/automationService');

test('automationService dispara Meta CAPI e GA4 MP com SHA-256, respeita LGPD e deduplica retries', async () => {
  const store = createInMemoryTestEnv();
  await store.repos.settingsRepo.upsertSetting('tracking.meta_pixel_id', '998877665544');
  await store.repos.settingsRepo.upsertSetting('tracking.meta_capi_token', 'EAAG_MOCK_TOKEN');
  await store.repos.settingsRepo.upsertSetting('tracking.ga4_measurement_id', 'G-TEST123456');
  await store.repos.settingsRepo.upsertSetting('tracking.ga4_api_secret', 'ga4_secret_mock');

  const lead = await store.repos.leadsRepo.createLead({
    full_name: 'Bruno Carvalho',
    email: 'bruno@franquiateste.com.br',
    email_normalized: 'bruno@franquiateste.com.br',
    whatsapp: '11991112222',
    whatsapp_normalized: '5511991112222',
    city: 'Sorocaba',
    state: 'SP',
    lead_score: 82,
    score_grade: 'A',
    qualification_status: 'qualified',
    priority: 'high'
  });

  const httpCalls = [];
  const mockFetch = async (url, opts) => {
    httpCalls.push({ url, body: JSON.parse(opts.body) });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ events_received: 1 });
      }
    };
  };

  const redisSeen = new Set();
  const mockRedis = {
    async set(key) {
      if (redisSeen.has(key)) return null;
      redisSeen.add(key);
      return 'OK';
    }
  };

  const settingsService = createSettingsService({
    settingsRepo: store.repos.settingsRepo,
    isStorageConfigured: () => true
  });

  const automationService = createAutomationService({
    leadsRepo: store.repos.leadsRepo,
    crmRepo: store.repos.crmRepo,
    trackingRepo: store.repos.trackingRepo,
    automationsRepo: store.repos.automationsRepo,
    settingsService,
    redisClient: mockRedis,
    fetchFn: mockFetch
  });

  // 1. Sem consentimento de marketing -> Meta CAPI deve ser bloqueado pela LGPD
  const blocked = await automationService.dispatchConversionEvent({
    lead_id: lead.id,
    platform: 'meta_capi',
    event_name: 'Lead',
    event_id: 'ev_blocked_1',
    idempotency_key: 'meta_capi:Lead:ev_blocked_1',
    consent: { analytics: true, marketing: false },
    attribution: { session_id: 'sess1' }
  });
  assert.equal(blocked.skipped, true);
  assert.equal(blocked.status, 'skipped_no_consent');
  assert.equal(httpCalls.length, 0);

  // 2. Com consentimento completo -> Meta CAPI envia com hashes e mesmo event_id
  const sent = await automationService.dispatchConversionEvent({
    lead_id: lead.id,
    platform: 'meta_capi',
    event_name: 'Lead',
    event_id: 'ev_allowed_1',
    idempotency_key: 'meta_capi:Lead:ev_allowed_1',
    consent: { analytics: true, marketing: true },
    attribution: { session_id: 'sess1', fbp: 'fb.1.123.456' }
  });
  assert.equal(sent.sent, true);
  assert.equal(httpCalls.length, 1);
  assert.ok(httpCalls[0].url.includes('/998877665544/events'));
  assert.equal(httpCalls[0].body.data[0].event_id, 'ev_allowed_1');
  assert.equal(httpCalls[0].body.data[0].user_data.em[0].length, 64);

  // 3. Retry idempotente NÃO dispara segunda requisição HTTP
  const retry = await automationService.dispatchConversionEvent({
    lead_id: lead.id,
    platform: 'meta_capi',
    event_name: 'Lead',
    event_id: 'ev_allowed_1',
    idempotency_key: 'meta_capi:Lead:ev_allowed_1',
    consent: { analytics: true, marketing: true }
  });
  assert.equal(retry.skipped, true);
  assert.equal(httpCalls.length, 1);

  // 4. GA4 Measurement Protocol também dispara quando analytics consentido
  const sentGa4 = await automationService.dispatchConversionEvent({
    lead_id: lead.id,
    platform: 'ga4_mp',
    event_name: 'generate_lead',
    event_id: 'ev_allowed_1',
    idempotency_key: 'ga4_mp:generate_lead:ev_allowed_1',
    consent: { analytics: true, marketing: false },
    attribution: { session_id: 'sess1', utm_source: 'google' }
  });
  assert.equal(sentGa4.sent, true);
  assert.equal(httpCalls.length, 2);
  assert.ok(httpCalls[1].url.includes('measurement_id=G-TEST123456'));
  assert.equal(httpCalls[1].body.non_personalized_ads, true);
});

test('automationService executa workflows de Novo Lead, Franquia Vendida e varredura SLA', async () => {
  const store = createInMemoryTestEnv();
  const settingsService = createSettingsService({
    settingsRepo: store.repos.settingsRepo,
    isStorageConfigured: () => true
  });
  const automationService = createAutomationService({
    leadsRepo: store.repos.leadsRepo,
    crmRepo: store.repos.crmRepo,
    trackingRepo: store.repos.trackingRepo,
    automationsRepo: store.repos.automationsRepo,
    settingsService
  });

  // Cria lead com created_at de 2 horas atrás sem first_contact_at
  const oldLead = await store.repos.leadsRepo.createLead({
    full_name: 'Lead Atrasado SLA',
    email: 'sla@teste.com.br',
    email_normalized: 'sla@teste.com.br',
    whatsapp: '11988881111',
    whatsapp_normalized: '5511988881111',
    city: 'Curitiba',
    state: 'PR',
    priority: 'normal',
    created_at: new Date(Date.now() - 120 * 60 * 1000).toISOString()
  });

  const slaResult = await automationService.scanUnattendedLeadsSla(30);
  assert.equal(slaResult.alerted, 1);
  const updated = await store.repos.leadsRepo.getLeadById(oldLead.id);
  assert.equal(updated.priority, 'urgent');
  assert.ok(updated.unattended_alert_sent_at);
  assert.equal(store.db.tasks.length, 1);

  const saleWf = await automationService.executeAutomationWorkflow(
    'franchise-sold-workflow',
    {
      lead_id: oldLead.id,
      opportunity_id: 'opp-1',
      actual_value_cents: 2000000
    },
    { enqueueJob: store.enqueueJob }
  );
  assert.equal(saleWf.processed, true);
  assert.equal(saleWf.value_brl, 20000);
  assert.ok(store.enqueuedJobs.some((j) => j.payload.event_name === 'Purchase'));
  assert.ok(store.enqueuedJobs.some((j) => j.payload.event_name === 'purchase'));
  assert.ok(store.enqueuedJobs.some((j) => j.payload.event_name === 'franchise_sold'));
});
