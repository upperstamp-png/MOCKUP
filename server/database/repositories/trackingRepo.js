'use strict';

const { getSupabaseAdmin } = require('../supabase');

function createTrackingRepo(getDb = getSupabaseAdmin) {
  return {
    async recordConsent(payload) {
      const db = getDb();
      const { data, error } = await db.from('consent_records').insert(payload).select('*').single();
      if (error) throw error;
      return data;
    },

    async getLatestConsentBySession(sessionId) {
      if (!sessionId) return null;
      const db = getDb();
      const { data, error } = await db
        .from('consent_records')
        .select('*')
        .eq('session_id', sessionId)
        .order('consented_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async insertMarketingEvent(payload) {
      const db = getDb();
      const { data, error } = await db.from('marketing_events').insert(payload).select('*').single();
      if (error) throw error;
      return data;
    },

    async findConversionByIdempotencyKey(idempotencyKey) {
      const db = getDb();
      const { data, error } = await db
        .from('conversion_events')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async upsertConversionEvent(payload) {
      const db = getDb();
      const { data, error } = await db
        .from('conversion_events')
        .upsert(payload, { onConflict: 'idempotency_key', ignoreDuplicates: false })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async updateConversionEvent(id, patch) {
      const db = getDb();
      const { data, error } = await db
        .from('conversion_events')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async listConversionEvents({ limit = 50, platform = null, status = null } = {}) {
      const db = getDb();
      let query = db
        .from('conversion_events')
        .select('*, lead:leads(id, full_name, city, state)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (platform) query = query.eq('platform', platform);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async listMarketingEvents({ limit = 50, eventName = null } = {}) {
      const db = getDb();
      let query = db
        .from('marketing_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (eventName) query = query.eq('event_name', eventName);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  };
}

module.exports = { createTrackingRepo };
