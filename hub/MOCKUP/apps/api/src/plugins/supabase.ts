import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Cliente Supabase Service Role — exclusivo no backend para Storage privado e gestão Auth.
 * Jamais expor no frontend.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || 'unconfigured-service-role-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/**
 * Cliente Supabase Anon efêmero para fluxos de login via email/senha ou refresh token.
 */
export function createSupabaseAnonClient(): SupabaseClient {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY || 'unconfigured-anon-key',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
