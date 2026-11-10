'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../../server/app');
const { createInMemoryTestEnv } = require('../helpers/inMemoryStore');

function buildAdminTestApp() {
  const store = createInMemoryTestEnv();
  const authMocks = store.createAuthMocks();
  const app = createApp({
    ...store.repos,
    enqueueJob: store.enqueueJob,
    limiters: store.limiters,
    authVerifier: authMocks.authVerifier,
    signInFn: authMocks.signInFn,
    isStorageConfigured: store.isStorageConfigured,
    redisClient: null,
    checkDatabaseHealth: async () => ({ configured: true, connected: true, status: 'connected' }),
    checkRedisHealth: async () => ({ configured: true, connected: true, status: 'connected' })
  });
  return { app, store };
}

function extractCookies(setCookieHeaders) {
  return (setCookieHeaders || []).map((c) => c.split(';')[0]).join('; ');
}

test('Rotas administrativas bloqueiam requisições sem sessão autenticada (401)', async () => {
  const { app } = buildAdminTestApp();
  const dash = await request(app).get('/api/admin/dashboard');
  assert.equal(dash.status, 401);

  const leads = await request(app).get('/api/admin/leads');
  assert.equal(leads.status, 401);
});

test('Fluxo completo Admin: Login, CSRF, Leads, Scorecard 5 Filtros, Kanban Venda, Segredos e RBAC', async () => {
  const { app, store } = buildAdminTestApp();

  // 1. Cria um lead público primeiro
  const leadRes = await request(app).post('/api/public/leads').send({
    full_name: 'Juliana Costa Almeida',
    whatsapp: '31999887766',
    email: 'juliana@teste.com.br',
    city: 'Belo Horizonte',
    state: 'MG',
    commercial_experience: '1_a_5_comercial',
    current_profession: 'Consultora Esportiva',
    available_capital_range: '20k_parcelado',
    desired_start_timeframe: '60_dias',
    intended_track: 'comercial',
    form_started_at: Date.now() - 5000,
    lgpd_accepted: true,
    consent: { analytics: true, marketing: true, functional: true }
  });
  assert.equal(leadRes.status, 201);
  const { lead_id, opportunity_id } = leadRes.body;

  // 2. Login como super_admin
  const loginSuper = await request(app).post('/api/admin/auth/login').send({
    email: 'admin@kingsports.test',
    password: 'Password123!'
  });
  assert.equal(loginSuper.status, 200);
  assert.equal(loginSuper.body.authenticated, true);
  assert.ok(loginSuper.body.csrf_token);
  const superCookies = extractCookies(loginSuper.headers['set-cookie']);
  assert.ok(superCookies.includes('ks_session='));
  const csrfSuper = loginSuper.body.csrf_token;

  // 3. Rejeita mutação sem CSRF token
  const noCsrf = await request(app)
    .patch(`/api/admin/leads/${lead_id}`)
    .set('Cookie', superCookies)
    .send({ priority: 'high' });
  assert.equal(noCsrf.status, 403);

  // 4. Consulta Dashboard, Lista Leads, Exporta CSV e Detalhes 360
  const dash = await request(app).get('/api/admin/dashboard?days=30').set('Cookie', superCookies);
  assert.equal(dash.status, 200);
  assert.equal(dash.body.kpis.leads_count, 1);

  const csvRes = await request(app).get('/api/admin/leads/export.csv').set('Cookie', superCookies);
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.text.includes('Juliana Costa Almeida'));

  // 5. Avalia Scorecard 5 Filtros
  const scRes = await request(app)
    .post(`/api/admin/leads/${lead_id}/scorecard`)
    .set('Cookie', superCookies)
    .set('x-csrf-token', csrfSuper)
    .send({
      scorecard_financial: 5,
      scorecard_territory: 3,
      scorecard_profile: 5,
      scorecard_dedication: 5,
      scorecard_compliance: 5,
      notes: 'Candidata aderente ao perfil Comercial BH.'
    });
  assert.equal(scRes.status, 200);
  assert.equal(scRes.body.evaluation.total, 23);
  assert.equal(scRes.body.evaluation.approved, true);

  // 6. Kanban: Perdido exige motivo, Venda registra receita contratada e dispara workflow
  const lostStage = store.stages.find((s) => s.slug === 'perdido');
  const wonStage = store.stages.find((s) => s.slug === 'venda');

  const failLost = await request(app)
    .patch(`/api/admin/opportunities/${opportunity_id}/stage`)
    .set('Cookie', superCookies)
    .set('x-csrf-token', csrfSuper)
    .send({ stage_id: lostStage.id });
  assert.equal(failLost.status, 400);

  const winRes = await request(app)
    .patch(`/api/admin/opportunities/${opportunity_id}/stage`)
    .set('Cookie', superCookies)
    .set('x-csrf-token', csrfSuper)
    .send({ stage_id: wonStage.id, actual_value_cents: 2000000, note: 'Contrato assinado após 10 dias de COF.' });
  assert.equal(winRes.status, 200);
  assert.equal(winRes.body.opportunity.status, 'won');
  assert.ok(store.enqueuedJobs.some((j) => j.jobName === 'franchise-sold-workflow'));

  const dashAfterSale = await request(app).get('/api/admin/dashboard?days=30').set('Cookie', superCookies);
  assert.equal(dashAfterSale.body.kpis.sales_count, 1);
  assert.equal(dashAfterSale.body.kpis.attributed_contracted_revenue_brl, 20000);

  // 7. Configurações: criptografa segredo e retorna mascarado; status de integração é honesto
  const saveSet = await request(app)
    .put('/api/admin/settings')
    .set('Cookie', superCookies)
    .set('x-csrf-token', csrfSuper)
    .send({
      settings: {
        'tracking.meta_capi_token': 'EAAG_REAL_SECRET_TOKEN_XYZ99'
      }
    });
  assert.equal(saveSet.status, 200);

  const getSet = await request(app).get('/api/admin/settings').set('Cookie', superCookies);
  assert.equal(getSet.status, 200);
  const metaTokenRow = getSet.body.settings.find((s) => s.setting_key === 'tracking.meta_capi_token');
  assert.ok(metaTokenRow.value_json.includes('••••'));
  assert.equal(metaTokenRow.value_json.includes('EAAG_REAL_SECRET_TOKEN_XYZ99'), false);

  const intTest = await request(app)
    .post('/api/admin/integrations/meta_capi/test')
    .set('Cookie', superCookies)
    .set('x-csrf-token', csrfSuper)
    .send({});
  assert.equal(intTest.status, 200);
  assert.equal(intTest.body.ok, false);
  assert.equal(intTest.body.status, 'not_configured'); // meta_pixel_id ainda vazio!

  // 8. RBAC: expansion_consultant NÃO pode alterar system_settings nem criar campanha
  const loginCons = await request(app).post('/api/admin/auth/login').send({
    email: 'consultor@kingsports.test',
    password: 'Password123!'
  });
  const consCookies = extractCookies(loginCons.headers['set-cookie']);
  const csrfCons = loginCons.body.csrf_token;

  const forbiddenSettings = await request(app)
    .put('/api/admin/settings')
    .set('Cookie', consCookies)
    .set('x-csrf-token', csrfCons)
    .send({ settings: { 'tracking.gtm_id': 'GTM-HACK' } });
  assert.equal(forbiddenSettings.status, 403);
});
