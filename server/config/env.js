'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  LP_HOST: z.string().trim().optional().default('lp.kinsports.com.br'),
  LP_HOST_ALIASES: z
    .string()
    .trim()
    .optional()
    .default('lp.kingsports.com.br,www.kingsports.com.br'),
  CRM_HOST: z.string().trim().optional().default('crm.kingsports.com.br'),
  HUB_HOST: z.string().trim().optional().default('app.kingsports.com.br'),
  LP_URL: z.string().trim().optional().default(''),
  CRM_URL: z.string().trim().optional().default(''),
  HUB_URL: z.string().trim().optional().default(''),
  PORTAL_API_INTERNAL_URL: z.string().trim().optional().default('http://127.0.0.1:4000'),
  HUB_WEB_INTERNAL_URL: z.string().trim().optional().default('http://127.0.0.1:3333'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  SESSION_SECRET: z.string().default('dev-session-secret-change-in-production-64-chars-minimum-ok'),
  CSRF_SECRET: z.string().default('dev-csrf-secret-change-in-production-64-chars-minimum-ok'),
  SETTINGS_ENCRYPTION_KEY: z.string().default(''),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  COOKIE_DOMAIN: z.string().optional().default(''),

  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_ANON_KEY: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),

  REDIS_URL: z.string().optional().default(''),
  REDIS_PASSWORD: z.string().optional().default(''),
  BULLMQ_PREFIX: z.string().default('kingsports'),

  GTM_CONTAINER_ID: z.string().optional().default(''),
  GA4_MEASUREMENT_ID: z.string().optional().default(''),
  GA4_API_SECRET: z.string().optional().default(''),
  GA4_PROPERTY_ID: z.string().optional().default(''),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),

  GOOGLE_ADS_CONVERSION_ID: z.string().optional().default(''),
  GOOGLE_ADS_CONVERSION_LABEL_LEAD: z.string().optional().default(''),
  GOOGLE_ADS_CONVERSION_LABEL_QUALIFIED: z.string().optional().default(''),
  GOOGLE_ADS_CONVERSION_LABEL_SALE: z.string().optional().default(''),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional().default(''),
  GOOGLE_ADS_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_ADS_REFRESH_TOKEN: z.string().optional().default(''),
  GOOGLE_ADS_CUSTOMER_ID: z.string().optional().default(''),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().optional().default(''),

  META_PIXEL_ID: z.string().optional().default(''),
  META_CAPI_ACCESS_TOKEN: z.string().optional().default(''),
  META_AD_ACCOUNT_ID: z.string().optional().default(''),
  META_TEST_EVENT_CODE: z.string().optional().default(''),

  ADMIN_NOTIFICATION_WEBHOOK_URL: z.string().optional().default(''),
  WHATSAPP_OFFICIAL_EXPANSION: z.string().optional().default(''),
  EXPANSION_EMAIL: z.string().optional().default('expansao@kingsportsoficial.com.br'),

  UNATTENDED_LEAD_SLA_MINUTES: z.coerce.number().int().positive().default(30),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5)
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${parsed.error.message}`);
  }
  const data = parsed.data;
  const isProd = data.NODE_ENV === 'production';
  const cleanAppUrl = String(data.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const lpHost = data.LP_HOST || 'lp.kinsports.com.br';
  const crmHost = data.CRM_HOST || 'crm.kingsports.com.br';
  const hubHost = data.HUB_HOST || 'app.kingsports.com.br';

  return {
    ...data,
    LP_HOST: lpHost,
    CRM_HOST: crmHost,
    HUB_HOST: hubHost,
    LP_URL: (data.LP_URL || (isProd ? `https://${lpHost}` : cleanAppUrl)).replace(/\/+$/, ''),
    CRM_URL: (data.CRM_URL || (isProd ? `https://${crmHost}` : '')).replace(/\/+$/, ''),
    HUB_URL: (data.HUB_URL || (isProd ? `https://${hubHost}` : '')).replace(/\/+$/, '')
  };
}

const env = loadEnv();

function isSupabaseConfigured(customEnv = env) {
  return Boolean(
    customEnv.SUPABASE_URL &&
      /^https?:\/\//.test(customEnv.SUPABASE_URL) &&
      customEnv.SUPABASE_ANON_KEY &&
      customEnv.SUPABASE_SERVICE_ROLE_KEY
  );
}

function isRedisConfigured(customEnv = env) {
  return Boolean(customEnv.REDIS_URL && /^rediss?:\/\//.test(customEnv.REDIS_URL));
}

module.exports = {
  env,
  loadEnv,
  isSupabaseConfigured,
  isRedisConfigured
};
