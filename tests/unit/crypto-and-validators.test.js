'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeEmail,
  normalizeBrazilPhone,
  hashEmailForAds,
  hashPhoneForAds,
  encryptSecret,
  decryptSecret,
  maskSecret,
  signCsrfToken,
  verifyCsrfToken,
  sanitizeArticleHtml
} = require('../../server/utils/crypto');
const { leadSubmissionSchema, stageChangeSchema } = require('../../server/utils/validators');
const logger = require('../../server/utils/logger');

test('normalização de e-mail e telefone brasileiro adiciona DDI 55 e padroniza hashes SHA-256', () => {
  assert.equal(normalizeEmail('  Carlos.Silva@Gmail.com  '), 'carlos.silva@gmail.com');
  assert.equal(normalizeBrazilPhone('(11) 98765-4321'), '5511987654321');
  assert.equal(normalizeBrazilPhone('+55 11 98765-4321'), '5511987654321');

  const h1 = hashPhoneForAds('(11) 98765-4321');
  const h2 = hashPhoneForAds('5511987654321');
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  assert.equal(hashEmailForAds('TESTE@EXAMPLE.COM'), hashEmailForAds('teste@example.com'));
});

test('criptografia AES-256-GCM de segredos funciona em roundtrip e mascaramento protege chave', () => {
  const secret = 'EAAGm0PX4ZCpsBA_SECRET_TOKEN_SAMPLE';
  const encrypted = encryptSecret(secret);
  assert.ok(encrypted.startsWith('enc:v1:'));
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted), secret);
  assert.equal(maskSecret(secret), 'EAAG••••MPLE');
});

test('tokens CSRF HMAC são vinculados ao sessionHint e validados com timingSafeEqual', () => {
  const token = signCsrfToken('session-abc-123');
  assert.equal(verifyCsrfToken(token, 'session-abc-123'), true);
  assert.equal(verifyCsrfToken(token, 'outro-session'), false);
  assert.equal(verifyCsrfToken('invalido', 'session-abc-123'), false);
});

test('sanitizeArticleHtml remove scripts e atributos on* mantendo HTML editorial limpo', () => {
  const dirty = '<h2>Título</h2><p onclick="alert(1)">Texto <script>steal()</script><a href="javascript:void(0)">link</a></p>';
  const clean = sanitizeArticleHtml(dirty);
  assert.equal(clean.includes('<script>'), false);
  assert.equal(clean.includes('onclick'), false);
  assert.equal(clean.includes('javascript:'), false);
  assert.ok(clean.includes('<h2>Título</h2>'));
});

test('logger.sanitizeLogData oculta dados pessoais sensíveis (LGPD)', () => {
  const sanitized = logger.sanitizeLogData({
    lead_id: 'uuid-123',
    email: 'candidato@uol.com.br',
    whatsapp: '11999998888',
    access_token: 'secret-token',
    nested: { authorization: 'Bearer xyz' }
  });
  assert.equal(sanitized.lead_id, 'uuid-123');
  assert.equal(sanitized.email, 'ca***@uol.com.br');
  assert.equal(sanitized.whatsapp, '***8888');
  assert.equal(sanitized.access_token, '[REDACTED]');
  assert.equal(sanitized.nested.authorization, '[REDACTED]');
});

test('leadSubmissionSchema rejeita honeypot preenchido, UF inválida e falta de aceite LGPD', () => {
  const baseValid = {
    full_name: 'Ana Paula Souza',
    whatsapp: '11988887777',
    email: 'ana@empresa.com.br',
    city: 'Campinas',
    state: 'sp',
    commercial_experience: '1_a_5_comercial',
    current_profession: 'Representante Comercial',
    available_capital_range: '20k_parcelado',
    desired_start_timeframe: 'imediato',
    intended_track: 'comercial',
    lgpd_accepted: true
  };

  const ok = leadSubmissionSchema.safeParse(baseValid);
  assert.equal(ok.success, true);
  assert.equal(ok.data.state, 'SP');

  const bot = leadSubmissionSchema.safeParse({ ...baseValid, website_hp: 'https://spam.ru' });
  assert.equal(bot.success, false);

  const badState = leadSubmissionSchema.safeParse({ ...baseValid, state: 'XX' });
  assert.equal(badState.success, false);

  const noLgpd = leadSubmissionSchema.safeParse({ ...baseValid, lgpd_accepted: false });
  assert.equal(noLgpd.success, false);

  assert.equal(stageChangeSchema.safeParse({ stage_id: 'not-a-uuid' }).success, false);
});
