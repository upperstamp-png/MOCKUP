'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeBrazilPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

function hashEmailForAds(email) {
  const clean = normalizeEmail(email);
  return clean ? sha256(clean) : null;
}

function hashPhoneForAds(phone) {
  const clean = normalizeBrazilPhone(phone);
  return clean ? sha256(clean) : null;
}

function hashIp(ip) {
  const clean = String(ip || '').trim();
  if (!clean) return null;
  return sha256(`${clean}:${env.SESSION_SECRET.slice(0, 16)}`);
}

function getEncryptionKeyBuffer(secretHex = env.SETTINGS_ENCRYPTION_KEY) {
  if (secretHex && /^[0-9a-fA-F]{64}$/.test(secretHex)) {
    return Buffer.from(secretHex, 'hex');
  }
  return crypto.createHash('sha256').update(env.SESSION_SECRET).digest();
}

function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return '';
  const key = getEncryptionKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') return '';
  if (!ciphertext.startsWith('enc:v1:')) return ciphertext;
  const parts = ciphertext.split(':');
  if (parts.length !== 5) return '';
  const [, , ivHex, tagHex, dataHex] = parts;
  const key = getEncryptionKeyBuffer();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

function maskSecret(secret) {
  const str = String(secret || '');
  if (!str) return '';
  if (str.length <= 8) return '••••••••';
  return `${str.slice(0, 4)}••••${str.slice(-4)}`;
}

function signCsrfToken(sessionHint) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${nonce}.${sessionHint || 'anon'}`;
  const sig = crypto.createHmac('sha256', env.CSRF_SECRET).update(payload).digest('hex');
  return `${nonce}.${sig}`;
}

function verifyCsrfToken(token, sessionHint) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [nonce, sig] = token.split('.');
  if (!nonce || !sig) return false;
  const expected = crypto
    .createHmac('sha256', env.CSRF_SECRET)
    .update(`${nonce}.${sessionHint || 'anon'}`)
    .digest('hex');
  const bufA = Buffer.from(sig, 'utf8');
  const bufB = Buffer.from(expected, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeArticleHtml(html) {
  // Remove dangerous tags and inline event handlers for CMS editorial HTML
  return String(html || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

module.exports = {
  sha256,
  normalizeEmail,
  normalizeBrazilPhone,
  hashEmailForAds,
  hashPhoneForAds,
  hashIp,
  encryptSecret,
  decryptSecret,
  maskSecret,
  signCsrfToken,
  verifyCsrfToken,
  slugify,
  escapeHtml,
  sanitizeArticleHtml
};
