'use strict';

const SENSITIVE_KEYS = new Set([
  'email',
  'email_normalized',
  'whatsapp',
  'whatsapp_normalized',
  'phone',
  'telefone',
  'cpf',
  'cnpj',
  'password',
  'senha',
  'token',
  'access_token',
  'refresh_token',
  'client_secret',
  'developer_token',
  'api_secret',
  'service_role',
  'supabase_service_role_key',
  'authorization',
  'cookie',
  'set-cookie',
  'ks_session',
  'ks_refresh',
  'ip',
  'ip_address',
  'user_data',
  'em',
  'ph'
]);

function maskValue(key, val) {
  if (val == null) return val;
  const k = String(key).toLowerCase();
  if (k.includes('email') && typeof val === 'string' && val.includes('@')) {
    const [local, domain] = val.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if ((k.includes('whatsapp') || k.includes('phone') || k.includes('telefone')) && typeof val === 'string') {
    const digits = val.replace(/\D/g, '');
    return digits.length >= 4 ? `***${digits.slice(-4)}` : '***';
  }
  return '[REDACTED]';
}

function sanitizeLogData(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (typeof value === 'string') {
    // Mask accidental inline emails or Bearer tokens in free-form strings
    return value
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (match) => maskValue('email', match));
  }
  if (typeof value !== 'object') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogData(value.message, depth + 1),
      code: value.code
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogData(item, depth + 1));
  }
  const output = {};
  for (const [k, v] of Object.entries(value)) {
    const lower = k.toLowerCase();
    if (
      SENSITIVE_KEYS.has(lower) ||
      lower.includes('secret') ||
      lower.includes('token') ||
      lower.includes('password') ||
      lower.includes('key') && lower !== 'setting_key' && lower !== 'idempotency_key' && lower !== 'rule_key'
    ) {
      output[k] = maskValue(k, v);
    } else {
      output[k] = sanitizeLogData(v, depth + 1);
    }
  }
  return output;
}

function writeLog(level, message, meta = {}) {
  if (process.env.NODE_ENV === 'test' && process.env.LOG_IN_TESTS !== 'true') {
    return;
  }
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME || 'king-sports',
    message: sanitizeLogData(message),
    ...(meta && Object.keys(meta).length ? { meta: sanitizeLogData(meta) } : {})
  };
  const serialized = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${serialized}\n`);
  } else {
    process.stdout.write(`${serialized}\n`);
  }
}

module.exports = {
  info: (msg, meta) => writeLog('info', msg, meta),
  warn: (msg, meta) => writeLog('warn', msg, meta),
  error: (msg, meta) => writeLog('error', msg, meta),
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') writeLog('debug', msg, meta);
  },
  sanitizeLogData
};
