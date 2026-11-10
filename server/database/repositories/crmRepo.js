'use strict';

const { getSupabaseAdmin } = require('../supabase');
const { NotFoundError } = require('../../utils/errors');

function createCrmRepo(getDb = getSupabaseAdmin) {
  return {
    async listStages() {
      const db = getDb();
      const { data, error } = await db
        .from('pipeline_stages')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async getStageBySlug(slug) {
      const db = getDb();
      const { data, error } = await db
        .from('pipeline_stages')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async getStageById(id) {
      const db = getDb();
      const { data, error } = await db
        .from('pipeline_stages')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new NotFoundError('Estágio do pipeline não encontrado.');
      return data;
    },

    async createOpportunity(payload) {
      const db = getDb();
      const { data, error } = await db
        .from('opportunities')
        .insert(payload)
        .select('*, stage:pipeline_stages(*)')
        .single();
      if (error) throw error;
      return data;
    },

    async getOpportunityById(id) {
      const db = getDb();
      const { data, error } = await db
        .from('opportunities')
        .select('*, stage:pipeline_stages(*), lead:leads(*)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new NotFoundError('Oportunidade não encontrada.');
      return data;
    },

    async getOpenOpportunityByLead(leadId) {
      const db = getDb();
      const { data, error } = await db
        .from('opportunities')
        .select('*, stage:pipeline_stages(*)')
        .eq('lead_id', leadId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async updateOpportunity(id, patch) {
      const db = getDb();
      const { data, error } = await db
        .from('opportunities')
        .update(patch)
        .eq('id', id)
        .select('*, stage:pipeline_stages(*), lead:leads(id, full_name, city, state, lead_score, score_grade)')
        .single();
      if (error) throw error;
      return data;
    },

    async listKanbanOpportunities(filters = {}) {
      const db = getDb();
      let query = db
        .from('opportunities')
        .select(`
          *,
          stage:pipeline_stages(*),
          owner:admin_users!opportunities_owner_id_fkey(id, full_name),
          lead:leads(
            id, full_name, whatsapp, email, city, state, lead_score, score_grade,
            priority, qualification_status, first_contact_at, created_at,
            qualification:lead_qualification(intended_track, available_capital_range, scorecard_total),
            attributions:lead_attributions(touch_type, utm_source, utm_campaign)
          )
        `)
        .order('stage_entered_at', { ascending: false });

      if (filters.owner_id) query = query.eq('owner_id', filters.owner_id);
      if (filters.status) query = query.eq('status', filters.status);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async addActivity(payload) {
      const db = getDb();
      const { data, error } = await db
        .from('lead_activities')
        .insert(payload)
        .select('*, actor:admin_users(id, full_name)')
        .single();
      if (error) throw error;
      return data;
    },

    async createTask(payload) {
      const db = getDb();
      const { data, error } = await db
        .from('tasks')
        .insert(payload)
        .select('*, assignee:admin_users!tasks_assigned_to_fkey(id, full_name)')
        .single();
      if (error) throw error;
      return data;
    },

    async updateTask(id, patch) {
      const db = getDb();
      const { data, error } = await db.from('tasks').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      if (!data) throw new NotFoundError('Tarefa não encontrada.');
      return data;
    },

    async createMeeting(payload) {
      const db = getDb();
      const { data, error } = await db
        .from('meetings')
        .insert(payload)
        .select('*, host:admin_users!meetings_host_admin_id_fkey(id, full_name)')
        .single();
      if (error) throw error;
      return data;
    },

    async updateMeeting(id, patch) {
      const db = getDb();
      const { data, error } = await db.from('meetings').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      if (!data) throw new NotFoundError('Reunião não encontrada.');
      return data;
    }
  };
}

module.exports = { createCrmRepo };
