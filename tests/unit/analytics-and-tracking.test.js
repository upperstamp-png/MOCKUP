'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateThresholdBand,
  computeDatasetSummary,
  generateDiagnostics
} = require('../../server/services/analyticsService');
const { evaluateConsentForPlatform } = require('../../server/tracking/consentValidator');
const { ensureNotDuplicated, buildIdempotencyKey } = require('../../server/tracking/deduplication');
const { buildMetaCapiPayload } = require('../../server/integrations/metaCapi');

test('evaluateThresholdBand classifica Verde, Laranja e Vermelho corretamente', () => {
  const cplRule = { target: 35, warning: 60, critical: 90, direction: 'lower_is_better' };
  assert.equal(evaluateThresholdBand(28, cplRule).band, 'green');
  assert.equal(evaluateThresholdBand(55, cplRule).band, 'orange');
  assert.equal(evaluateThresholdBand(110, cplRule).band, 'red');

  const roasRule = { target: 5, warning: 3, critical: 1.5, direction: 'higher_is_better' };
  assert.equal(evaluateThresholdBand(6.5, roasRule).band, 'green');
  assert.equal(evaluateThresholdBand(3.2, roasRule).band, 'orange');
  assert.equal(evaluateThresholdBand(1.1, roasRule).band, 'red');
});

test('computeDatasetSummary calcula CPL, CPQL, CAC, ROAS contratado e diagnóstico de gargalo', () => {
  const now = new Date().toISOString();
  const stages = [
    { id: 's1', slug: 'novo-lead', name: 'Novo Lead' },
    { id: 's2', slug: 'proposta', name: 'Proposta' },
    { id: 's3', slug: 'venda', name: 'Venda' }
  ];
  const dataset = {
    stages,
    campaigns: [{ id: 'c1', name: 'Meta Lead Brasil', platform: 'meta_ads', utm_campaign: 'meta_brasil', status: 'active', target_cpl_cents: 3500 }],
    metrics: [{ campaign_id: 'c1', metric_date: now.slice(0, 10), spend_cents: 100000, impressions: 10000, reach: 8000, clicks: 250, visitors: 200 }],
    leads: [
      { id: 'l1', state: 'SP', qualification_status: 'qualified', first_contact_at: now, primary_campaign_id: 'c1', created_at: new Date(Date.now() - 10 * 60000).toISOString() },
      { id: 'l2', state: 'MG', qualification_status: 'pending', first_contact_at: null, primary_campaign_id: 'c1', created_at: new Date(Date.now() - 90 * 60000).toISOString() }
    ],
    opportunities: [
      { id: 'o1', lead_id: 'l1', stage_id: 's3', status: 'won', estimated_value_cents: 2000000, actual_value_cents: 2000000, created_at: now },
      { id: 'o2', lead_id: 'l2', stage_id: 's1', status: 'open', estimated_value_cents: 2000000, created_at: now }
    ],
    meetings: [{ id: 'm1', lead_id: 'l1', status: 'completed', created_at: now }],
    attributions: []
  };

  const summary = computeDatasetSummary(dataset, 30);
  assert.equal(summary.kpis.leads_count, 2);
  assert.equal(summary.kpis.qualified_leads_count, 1);
  assert.equal(summary.kpis.sales_count, 1);
  assert.equal(summary.kpis.media_spend_brl, 1000);
  assert.equal(summary.kpis.cpl_brl, 500);
  assert.equal(summary.kpis.cpql_brl, 1000);
  assert.equal(summary.kpis.cac_brl, 1000);
  assert.equal(summary.kpis.attributed_contracted_revenue_brl, 20000);
  assert.equal(summary.kpis.roas, 20);
  assert.equal(summary.kpis.unattended_leads_count, 1);

  const alerts = generateDiagnostics({ current: summary, previous: null, thresholds: { cpl_brl: { target: 35 } } });
  assert.ok(alerts.some((a) => a.type === 'high_cpl'));
  assert.ok(alerts.some((a) => a.type === 'unattended_leads'));
});

test('evaluateConsentForPlatform bloqueia plataformas sem consentimento LGPD adequado', () => {
  assert.equal(evaluateConsentForPlatform({ analytics: false, marketing: false }, 'meta_capi').allowed, false);
  assert.equal(evaluateConsentForPlatform({ analytics: true, marketing: false }, 'google_ads_offline').allowed, false);
  assert.equal(evaluateConsentForPlatform({ analytics: true, marketing: false }, 'ga4_mp').allowed, true);
  assert.equal(evaluateConsentForPlatform({ analytics: true, marketing: true }, 'meta_capi').allowed, true);
  assert.equal(evaluateConsentForPlatform({}, 'internal').allowed, true);
});

test('ensureNotDuplicated bloqueia reprocessamento via Redis NX e banco', async () => {
  const seenKeys = new Set();
  const mockRedis = {
    async set(key) {
      if (seenKeys.has(key)) return null;
      seenKeys.add(key);
      return 'OK';
    }
  };
  const key = buildIdempotencyKey({ platform: 'meta_capi', eventName: 'Lead', entityId: 'l1' });
  const first = await ensureNotDuplicated({ idempotencyKey: key, redisClient: mockRedis });
  const second = await ensureNotDuplicated({ idempotencyKey: key, redisClient: mockRedis });

  assert.equal(first.duplicated, false);
  assert.equal(second.duplicated, true);
  assert.equal(second.via, 'redis');
});

test('buildMetaCapiPayload envia event_id compartilhado e hashes SHA-256 de e-mail e WhatsApp', () => {
  const payload = buildMetaCapiPayload({
    eventName: 'Lead',
    eventId: 'ks_dedup_999',
    eventSourceUrl: 'https://franquia.kingsportsoficial.com.br/',
    lead: {
      id: 'lead-uuid-1',
      full_name: 'Marcos Oliveira',
      email: 'marcos@teste.com.br',
      whatsapp: '11999990000',
      city: 'São Paulo',
      state: 'SP'
    },
    attribution: { fbp: 'fb.1.123.456', fbc: 'fb.1.123.abc' },
    clientIp: '177.10.20.30',
    userAgent: 'Mozilla/5.0'
  });

  const ev = payload.data[0];
  assert.equal(ev.event_name, 'Lead');
  assert.equal(ev.event_id, 'ks_dedup_999');
  assert.equal(ev.action_source, 'website');
  assert.equal(ev.user_data.em[0].length, 64);
  assert.equal(ev.user_data.ph[0].length, 64);
  assert.equal(ev.user_data.fbp, 'fb.1.123.456');
  assert.equal(ev.user_data.fbc, 'fb.1.123.abc');
});
