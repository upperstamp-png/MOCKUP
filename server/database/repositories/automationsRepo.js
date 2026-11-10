'use strict';

const { getSupabaseAdmin } = require('../supabase');
const { NotFoundError } = require('../../utils/errors');

function createAutomationsRepo(getDb = getSupabaseAdmin) {
  return {
    async listRules() {
      const db = getDb();
      const { data, error } = await db
        .from('automation_rules')
        .select('*')
        .order('rule_key', { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async getRuleByKey(ruleKey) {
      const db = getDb();
      const { data, error } = await db
        .from('automation_rules')
        .select('*')
        .eq('rule_key', ruleKey)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async updateRule(id, patch) {
      const db = getDb();
      const { data, error } = await db
        .from('automation_rules')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      if (!data) throw new NotFoundError('Regra de automação não encontrada.');
      return data;
    },

    async recordJob(payload) {
      const db = getDb();
      if (payload.idempotency_key) {
        const { data: existing, error: findErr } = await db
          .from('automation_jobs')
          .select('*')
          .eq('idempotency_key', payload.idempotency_key)
          .maybeSingle();
        if (findErr) throw findErr;
        if (existing) {
          if (!['pending_worker', 'failed', 'dlq'].includes(existing.status)) {
            return existing;
          }
          const { data: updated, error: updErr } = await db
            .from('automation_jobs')
            .update({ ...payload, error_message: null })
            .eq('id', existing.id)
            .select('*')
            .single();
          if (updErr) throw updErr;
          return updated;
        }
      }
      const { data, error } = await db
        .from('automation_jobs')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async updateJobByIdempotency(idempotencyKey, patch) {
      if (!idempotencyKey) return null;
      const db = getDb();
      const { data, error } = await db
        .from('automation_jobs')
        .update(patch)
        .eq('idempotency_key', idempotencyKey)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async getJobById(id) {
      const db = getDb();
      const { data, error } = await db
        .from('automation_jobs')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new NotFoundError('Job de automação não encontrado.');
      return data;
    },

    async listJobs({ limit = 50, status = null, queueName = null } = {}) {
      const db = getDb();
      let query = db
        .from('automation_jobs')
        .select('*, lead:leads(id, full_name)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (status) query = query.eq('status', status);
      if (queueName) query = query.eq('queue_name', queueName);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  };
}

module.exports = { createAutomationsRepo };
