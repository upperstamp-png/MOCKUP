'use strict';

const { createClient } = require('@supabase/supabase-js');
const { env, isSupabaseConfigured } = require('../config/env');
const { ServiceNotConfiguredError } = require('../utils/errors');

let adminClient = null;
let anonClient = null;

function getSupabaseAdmin() {
  if (!isSupabaseConfigured()) {
    throw new ServiceNotConfiguredError(
      'supabase',
      'Supabase não configurado. Preencha SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY no .env.'
    );
  }
  if (!adminClient) {
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: { 'x-application-name': 'king-sports-server' }
      }
    });
  }
  return adminClient;
}

function getSupabaseAnon() {
  if (!isSupabaseConfigured()) {
    throw new ServiceNotConfiguredError(
      'supabase',
      'Supabase não configurado. Preencha SUPABASE_URL e SUPABASE_ANON_KEY no .env.'
    );
  }
  if (!anonClient) {
    anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
  }
  return anonClient;
}

function createSupabaseUserClient(accessToken) {
  if (!isSupabaseConfigured()) {
    throw new ServiceNotConfiguredError('supabase');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

async function checkDatabaseHealth() {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      connected: false,
      status: 'not_configured',
      message: 'Variáveis SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY não definidas.'
    };
  }
  try {
    const db = getSupabaseAdmin();
    const start = Date.now();
    const { error } = await db.from('pipeline_stages').select('id').limit(1);
    const latencyMs = Date.now() - start;
    if (error) {
      return {
        configured: true,
        connected: false,
        status: 'error',
        latency_ms: latencyMs,
        message: error.message
      };
    }
    return {
      configured: true,
      connected: true,
      status: 'connected',
      latency_ms: latencyMs
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      status: 'error',
      message: err.message
    };
  }
}

module.exports = {
  getSupabaseAdmin,
  getSupabaseAnon,
  createSupabaseUserClient,
  checkDatabaseHealth,
  isSupabaseConfigured
};
