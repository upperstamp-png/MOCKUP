'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../../server/app');
const { createInMemoryTestEnv } = require('../helpers/inMemoryStore');

function buildTestApp() {
  const store = createInMemoryTestEnv();
  const app = createApp({
    ...store.repos,
    enqueueJob: store.enqueueJob,
    limiters: store.limiters,
    isStorageConfigured: store.isStorageConfigured,
    redisClient: null,
    checkDatabaseHealth: async () => ({ configured: false, connected: false, status: 'not_configured' }),
    checkRedisHealth: async () => ({ configured: false, connected: false, status: 'not_configured' })
  });
  return { app, store };
}

test('GET / e páginas públicas servem HTML5 puro sem frameworks e usam identidade oficial King Sports + estrutura V4', async () => {
  const { app } = buildTestApp();

  const home = await request(app).get('/');
  assert.equal(home.status, 200);
  assert.ok(home.text.includes('SEJA UM FRANQUEADO KING SPORTS'));
  assert.ok(home.text.includes('R$ 20.000'));
  assert.ok(home.text.includes('/assets/images/logo-king-dark-bg.png'));
  assert.ok(home.text.includes('/assets/videos/ks-fabrica-01.mp4'));
  assert.ok(home.text.includes('/assets/images/ks-liberty-01.jpg'));
  assert.ok(home.text.includes('/favicon.ico'));
  assert.ok(home.text.includes('ks-ticker'));
  assert.ok(home.text.includes('ks-vqt'));
  assert.ok(home.text.includes('ks-faq-list'));
  assert.ok(home.text.includes('id="ks-franchise-form"'));
  assert.equal(home.text.includes('__NEXT_DATA__'), false);
  assert.equal(home.text.toLowerCase().includes('lakers'), false);

  const obrigado = await request(app).get('/obrigado.html');
  assert.equal(obrigado.status, 200);
  assert.ok(obrigado.text.includes('/assets/images/logo-king-dark-bg.png'));

  const privacidade = await request(app).get('/privacidade.html');
  assert.equal(privacidade.status, 200);
  assert.ok(privacidade.text.includes('/assets/images/logo-king-dark-bg.png'));

  const termos = await request(app).get('/termos.html');
  assert.equal(termos.status, 200);
  assert.ok(termos.text.includes('/assets/images/logo-king-dark-bg.png'));
});

test('GET /api/health e /api/public/config reportam estados reais sem expor segredos', async () => {
  const { app } = buildTestApp();

  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.dependencies.supabase.status, 'not_configured');
  assert.equal(health.body.dependencies.redis.status, 'not_configured');

  const cfg = await request(app).get('/api/public/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.franchise.reference_investment_brl, 20000);
  assert.equal('meta_capi_token' in (cfg.body.tracking || {}), false);
  assert.equal('ga4_api_secret' in (cfg.body.tracking || {}), false);
});

test('POST /api/public/leads cria lead, atribuição, oportunidade, conversões deduplicadas e contabiliza origem do blog', async () => {
  const { app, store } = buildTestApp();
  const sharedEventId = 'ks_lead_dedup_abc123';

  const payload = {
    full_name: 'Rafael Mendes Ferreira',
    whatsapp: '(11) 98765-4321',
    email: 'rafael.mendes@kingsportstest.com.br',
    city: 'São José dos Campos',
    state: 'SP',
    desired_zip_prefix: '12200',
    commercial_experience: '5+_gestao_comercial',
    current_profession: 'Gerente Comercial',
    available_capital_range: 'acima_30k_a_vista',
    desired_start_timeframe: 'imediato_30_dias',
    intended_track: 'hibrido',
    website_hp: '',
    form_started_at: Date.now() - 8000,
    event_id: sharedEventId,
    session_id: 'sess_test_001',
    blog_post_slug: 'como-vender-uniformes-sem-fabrica',
    lgpd_accepted: true,
    consent: { analytics: true, marketing: true, functional: true, policy_version: '1.0' },
    attribution: {
      first_touch: {
        utm_source: 'meta',
        utm_medium: 'cpc',
        utm_campaign: 'expansao_sp',
        fbp: 'fb.1.1700000000.12345',
        landing_page: 'https://franquia.kingsportsoficial.com.br/'
      },
      last_touch: {
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'marca_franquia',
        gclid: 'Cj0KCQiA_GCLID_TEST'
      }
    }
  };

  const res = await request(app).post('/api/public/leads').send(payload);
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.is_duplicate, false);
  assert.equal(res.body.event_id, sharedEventId);
  assert.ok(res.body.score >= 80);
  assert.equal(store.db.leads.length, 1);
  assert.equal(store.db.opportunities.length, 1);
  assert.equal(store.db.attributions.length, 2); // first_touch + last_touch
  assert.equal(store.db.consents.length, 1);
  assert.equal(store.db.conversionEvents.length, 3); // meta_capi, ga4_mp, google_ads_offline
  assert.ok(store.db.conversionEvents.every((ev) => ev.event_id === sharedEventId));
  assert.equal(store.blogPosts[0].leads_count, 1);

  // Reenvio com mesmo WhatsApp em outro formato -> identifica duplicado sem criar nova oportunidade
  const resDup = await request(app)
    .post('/api/public/leads')
    .send({
      ...payload,
      email: 'outro.email@kingsportstest.com.br',
      whatsapp: '+55 11 987654321',
      event_id: 'ks_lead_dedup_second'
    });
  assert.equal(resDup.status, 201);
  assert.equal(resDup.body.is_duplicate, true);
  assert.equal(resDup.body.lead_id, res.body.lead_id);
  assert.equal(store.db.leads.length, 1);
  assert.equal(store.db.opportunities.length, 1);
  assert.equal(store.db.attributions.filter((a) => a.touch_type === 'reengagement').length, 1);
  assert.equal(store.db.attributions.filter((a) => a.touch_type === 'first_touch').length, 1);
});

test('POST /api/public/leads bloqueia spam (honeypot) e formulário sem aceite LGPD', async () => {
  const { app } = buildTestApp();
  const spam = await request(app).post('/api/public/leads').send({
    full_name: 'Bot Spam',
    whatsapp: '11999999999',
    email: 'bot@spam.test',
    city: 'São Paulo',
    state: 'SP',
    commercial_experience: 'sim',
    current_profession: 'bot',
    available_capital_range: '20k',
    desired_start_timeframe: 'imediato',
    intended_track: 'comercial',
    website_hp: 'http://spam.site',
    lgpd_accepted: true
  });
  assert.equal(spam.status, 400);
});

test('POST /api/public/events e /api/public/consent gravam telemetria e consentimento', async () => {
  const { app, store } = buildTestApp();

  const ev = await request(app).post('/api/public/events').send({
    event_id: 'evt_test_001',
    session_id: 'sess_test_xyz',
    event_name: 'cta_click',
    page_url: 'https://franquia.kingsportsoficial.com.br/',
    payload: { cta: 'hero' },
    consent: { analytics: true, marketing: false, functional: true }
  });
  assert.equal(ev.status, 201);
  assert.equal(ev.body.recorded, true);
  assert.equal(store.db.marketingEvents.length, 1);

  const consent = await request(app).post('/api/public/consent').send({
    session_id: 'sess_test_xyz',
    analytics_consent: true,
    marketing_consent: true
  });
  assert.equal(consent.status, 201);
  assert.equal(store.db.consents.length, 1);
});

test('Blog SSR /blog, /blog/:slug, /sitemap.xml e /robots.txt renderizam HTML SEO completo', async () => {
  const { app, store } = buildTestApp();

  const idx = await request(app).get('/blog');
  assert.equal(idx.status, 200);
  assert.ok(idx.headers['x-robots-tag'].includes('index, follow'));
  assert.ok(idx.headers.link.includes('rel="canonical"'));
  assert.ok(idx.headers.link.includes('llms.txt'));
  assert.ok(idx.text.includes('Como vender uniformes personalizados sem montar fábrica'));
  assert.ok(idx.text.includes('"@type":"CollectionPage"'));

  const art = await request(app).get('/blog/como-vender-uniformes-sem-fabrica');
  assert.equal(art.status, 200);
  assert.ok(art.headers['x-robots-tag'].includes('index, follow'));
  assert.ok(art.text.includes('<link rel="canonical"'));
  assert.ok(art.text.includes('hreflang="pt-BR"'));
  assert.ok(art.text.includes('application/ld+json'));
  assert.ok(art.text.includes('"SpeakableSpecification"'));
  assert.ok(art.text.includes('"BreadcrumbList"'));
  assert.ok(art.text.includes('QUERO CONHECER A FRANQUIA'));

  const view = await request(app).post('/api/public/blog/como-vender-uniformes-sem-fabrica/view');
  assert.equal(view.status, 200);
  assert.equal(store.blogPosts[0].views_count, 1);

  const missing = await request(app).get('/blog/slug-que-nao-existe');
  assert.equal(missing.status, 404);
  assert.ok(missing.headers['x-robots-tag'].includes('noindex'));

  const sitemap = await request(app).get('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.ok(sitemap.text.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'));
  assert.ok(sitemap.text.includes('<image:image>'));
  assert.ok(sitemap.text.includes('como-vender-uniformes-sem-fabrica'));
  assert.equal(sitemap.text.includes('obrigado.html'), false);
  assert.equal(sitemap.text.includes('/admin'), false);

  const robots = await request(app).get('/robots.txt');
  assert.equal(robots.status, 200);
  for (const bot of [
    'Googlebot',
    'Bingbot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'GPTBot',
    'PerplexityBot',
    'ClaudeBot',
    'Google-Extended',
    'Applebot-Extended',
    'DuckAssistBot'
  ]) {
    assert.ok(robots.text.includes(`User-agent: ${bot}`), `Falta crawler ${bot} no robots.txt`);
  }
  assert.ok(robots.text.includes('Disallow: /admin/'));
  assert.ok(robots.text.includes('Disallow: /api/'));
  assert.ok(robots.text.includes('Disallow: /obrigado.html'));
  assert.ok(robots.text.includes('/sitemap.xml'));
});

test('SEO Técnico + GEO: canonicals, X-Robots-Tag, Schema.org @graph e llms.txt / llms-full.txt', async () => {
  const { app } = buildTestApp();

  const home = await request(app).get('/');
  assert.equal(home.status, 200);
  assert.ok(home.headers['x-robots-tag'].includes('index, follow'));
  assert.ok(home.headers.link.includes('rel="canonical"'));
  assert.ok(home.headers.link.includes('llms.txt'));
  assert.ok(home.text.includes('hreflang="pt-BR"'));
  assert.ok(home.text.includes('type="text/markdown"'));
  assert.ok(home.text.includes('"@type": "Organization"'));
  assert.ok(home.text.includes('"@type": "FAQPage"'));
  assert.ok(home.text.includes('"@type": "Service"'));
  assert.ok(home.text.includes('"@type": "HowTo"'));
  assert.ok(home.text.includes('"@type": "SpeakableSpecification"'));
  // Reescrita dinâmica para origem da requisição (não fica preso no domínio fixo)
  assert.equal(home.text.includes('https://franquia.kingsportsoficial.com.br'), false);

  const obrigado = await request(app).get('/obrigado.html');
  assert.equal(obrigado.status, 200);
  assert.equal(obrigado.headers['x-robots-tag'], 'noindex, nofollow, noarchive');
  assert.ok(obrigado.text.includes('noindex, nofollow, noarchive'));

  const adminLogin = await request(app).get('/admin/login.html');
  assert.equal(adminLogin.status, 200);
  assert.equal(adminLogin.headers['x-robots-tag'], 'noindex, nofollow, noarchive');

  const health = await request(app).get('/api/health');
  assert.equal(health.headers['x-robots-tag'], 'noindex, nofollow, noarchive');

  const llms = await request(app).get('/llms.txt');
  assert.equal(llms.status, 200);
  assert.ok(llms.headers['content-type'].includes('text/markdown'));
  assert.equal(llms.headers['x-robots-tag'], 'all');
  assert.ok(llms.text.includes('King Sports Franchising'));
  assert.ok(llms.text.includes('00.609.901/0001-85'));
  assert.ok(llms.text.includes('Como vender uniformes personalizados sem montar fábrica'));
  assert.equal(llms.text.toLowerCase().includes('lakers'), false);

  const wellKnownLlms = await request(app).get('/.well-known/llms.txt');
  assert.equal(wellKnownLlms.status, 200);
  assert.ok(wellKnownLlms.headers['content-type'].includes('text/markdown'));

  const llmsFull = await request(app).get('/llms-full.txt');
  assert.equal(llmsFull.status, 200);
  assert.ok(llmsFull.headers['content-type'].includes('text/markdown'));
  assert.ok(llmsFull.text.includes('Maleta King Sports Pro'));
  assert.ok(llmsFull.text.includes('Slide Dry'));
  assert.ok(llmsFull.text.includes('Scorecard 5 Filtros'));
  assert.equal(llmsFull.text.toLowerCase().includes('lakers'), false);
});
