import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega .env do app api, da raiz hub/MOCKUP e fallback da raiz unificada (sem sobrescrever env já injetado)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('127.0.0.1'),
  APP_URL: z.string().default('http://127.0.0.1:3000'),
  LP_URL: z.string().trim().optional().default(''),
  CRM_URL: z.string().trim().optional().default(''),
  HUB_URL: z.string().trim().optional().default(''),
  CORS_ORIGIN: z
    .string()
    .default(
      [
        'http://127.0.0.1:3000',
        'http://localhost:3000',
        'http://127.0.0.1:3333',
        'http://localhost:3333',
        'http://app.localhost:3000',
        'http://hub.localhost:3000',
        'http://crm.localhost:3000',
        'http://lp.localhost:3000',
        'https://app.kingsports.com.br',
        'https://crm.kingsports.com.br',
        'https://lp.kinsports.com.br',
        'https://lp.kingsports.com.br',
      ].join(',')
    ),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  COOKIE_DOMAIN: z.string().trim().optional().default(''),
  COOKIE_SECRET: z.string().min(16).default('dev-cookie-secret-change-in-production-32chars'),
  JWT_SECRET: z.string().min(32).default('test-jwt-secret-key-32-characters-long!'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  SUPABASE_URL: z.string().default('http://127.0.0.1:54321'),
  SUPABASE_ANON_KEY: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  ADMIN_API_KEY: z.string().min(16).default('master-admin-key-change-in-prod'),
  ASAAS_API_KEY: z.string().optional().default(''),
  ASAAS_ENV: z.string().optional().default('not_configured'),
  NFE_EMITTER_API_KEY: z.string().optional().default(''),
  NFE_EMITTER_PROVIDER: z.string().optional().default('not_configured'),
  WHATSAPP_PROVIDER_TOKEN: z.string().optional().default(''),
  SMTP_URL: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Configuração de ambiente inválida em @mockup/api: ${parsed.error.message}`);
}

const rawEnv = parsed.data;
const cleanAppUrl = rawEnv.APP_URL.replace(/\/+$/, '');
const isProd = rawEnv.NODE_ENV === 'production';

export const env = {
  ...rawEnv,
  APP_URL: cleanAppUrl,
  LP_URL: (rawEnv.LP_URL || (isProd ? 'https://lp.kinsports.com.br' : cleanAppUrl)).replace(
    /\/+$/,
    ''
  ),
  CRM_URL: (
    rawEnv.CRM_URL || (isProd ? 'https://crm.kingsports.com.br' : `${cleanAppUrl}/admin`)
  ).replace(/\/+$/, ''),
  HUB_URL: (rawEnv.HUB_URL || (isProd ? 'https://app.kingsports.com.br' : cleanAppUrl)).replace(
    /\/+$/,
    ''
  ),
};

export function getExternalIntegrationsStatus() {
  return {
    supabase_auth: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY),
    supabase_storage: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    postgresql: Boolean(env.DATABASE_URL),
    asaas_payments: env.ASAAS_API_KEY.trim().length > 0 && env.ASAAS_ENV !== 'not_configured',
    nfe_emitter: env.NFE_EMITTER_API_KEY.trim().length > 0 && env.NFE_EMITTER_PROVIDER !== 'not_configured',
    whatsapp_api: env.WHATSAPP_PROVIDER_TOKEN.trim().length > 0,
    email_smtp: env.SMTP_URL.trim().length > 0,
  };
}
