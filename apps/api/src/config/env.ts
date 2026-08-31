import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('*'),
  JWT_SECRET: z.string().min(32).default('test-jwt-secret-key-32-characters-long!'),
  JWT_EXPIRES_IN: z.string().default('30d'),
  SUPABASE_URL: z.string().default('http://localhost:54321'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('test-supabase-service-role-key-placeholder'),
  ADMIN_API_KEY: z.string().min(16).default('master-admin-key-change-in-prod'),
});

const _env = envSchema.safeParse(process.env);

export const env = _env.success
  ? _env.data
  : {
      NODE_ENV: 'test' as const,
      PORT: 4000,
      HOST: '0.0.0.0',
      CORS_ORIGIN: '*',
      JWT_SECRET: 'test-jwt-secret-key-32-characters-long!',
      JWT_EXPIRES_IN: '30d',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-supabase-service-role-key-placeholder',
      ADMIN_API_KEY: 'master-admin-key-change-in-prod',
    };
