'use strict';

const { getSupabaseAdmin } = require('../supabase');
const { NotFoundError } = require('../../utils/errors');

function createLeadsRepo(getDb = getSupabaseAdmin) {
  return {
    async findDuplicate(emailNormalized, whatsappNormalized) {
      const db = getDb();
      const { data: byEmail, error: emailErr } = await db
        .from('leads')
        .select('*')
        .eq('email_normalized', emailNormalized)
        .maybeSingle();
      if (emailErr) throw emailErr;
      if (byEmail) return byEmail;

      if (whatsappNormalized) {
        const { data: byPhone, error: phoneErr } = await db
          .from('leads')
          .select('*')
          .eq('whatsapp_normalized', whatsappNormalized)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (phoneErr) throw phoneErr;
        if (byPhone) return byPhone;
      }
      return null;
    },

    async createLead(payload) {
      const db = getDb();
      const { data, error } = await db.from('leads').insert(payload).select('*').single();
      if (error) throw error;
      return data;
    },

    async updateLead(id, patch) {
      const db = getDb();
      const { data, error } = await db.from('leads').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      if (!data) throw new NotFoundError('Lead não encontrado.');
      return data;
    },

    async getLeadById(id) {
      const db = getDb();
      const { data, error } = await db
        .from('leads')
        .select(`
          *,
          assigned_admin:admin_users!leads_assigned_to_fkey(id, full_name, email),
          qualification:lead_qualification(*),
          attributions:lead_attributions(*),
          opportunities:opportunities(*, stage:pipeline_stages(*)),
          activities:lead_activities(*, actor:admin_users(id, full_name)),
          tasks:tasks(*, assignee:admin_users!tasks_assigned_to_fkey(id, full_name)),
          meetings:meetings(*, host:admin_users!meetings_host_admin_id_fkey(id, full_name))
        `)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new NotFoundError('Lead não encontrado.');
      return data;
    },

    async listLeads(filters = {}) {
      const db = getDb();
      const page = Math.max(1, Number(filters.page || 1));
      const limit = Math.min(100, Math.max(1, Number(filters.limit || 25)));
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = db
        .from('leads')
        .select(
          `
          *,
          assigned_admin:admin_users!leads_assigned_to_fkey(id, full_name),
          qualification:lead_qualification(intended_track, available_capital_range, desired_start_timeframe, scorecard_total),
          opportunities(id, status, stage_id, estimated_value_cents, stage:pipeline_stages(id, slug, name, color_hex)),
          attributions:lead_attributions(touch_type, utm_source, utm_medium, utm_campaign)
        `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filters.search) {
        const q = String(filters.search).trim();
        query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,city.ilike.%${q}%,whatsapp.ilike.%${q}%`);
      }
      if (filters.qualification_status) {
        query = query.eq('qualification_status', filters.qualification_status);
      }
      if (filters.state) {
        query = query.eq('state', filters.state.toUpperCase());
      }
      if (filters.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (filters.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }
      if (filters.unattended === 'true' || filters.unattended === true) {
        query = query.is('first_contact_at', null);
      }
      if (filters.from_date) {
        query = query.gte('created_at', filters.from_date);
      }
      if (filters.to_date) {
        query = query.lte('created_at', filters.to_date);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        items: data || [],
        total: count || 0,
        page,
        limit,
        total_pages: Math.max(1, Math.ceil((count || 0) / limit))
      };
    },

    async upsertQualification(leadId, payload) {
      const db = getDb();
      const { data: existing, error: findErr } = await db
        .from('lead_qualification')
        .select('id')
        .eq('lead_id', leadId)
        .maybeSingle();
      if (findErr) throw findErr;

      if (existing) {
        const { data, error } = await db
          .from('lead_qualification')
          .update(payload)
          .eq('lead_id', leadId)
          .select('*')
          .single();
        if (error) throw error;
        return data;
      }

      const insertPayload = {
        commercial_experience: 'Não informado',
        current_profession: 'Não informado',
        available_capital_range: 'Não informado',
        desired_start_timeframe: 'Não informado',
        intended_track: 'comercial',
        ...payload,
        lead_id: leadId
      };
      const { data, error } = await db
        .from('lead_qualification')
        .insert(insertPayload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async addAttribution(payload) {
      const db = getDb();
      const { data, error } = await db.from('lead_attributions').insert(payload).select('*').single();
      if (error) throw error;
      return data;
    },

    async listUnattendedPastSla(slaMinutes) {
      const db = getDb();
      const cutoff = new Date(Date.now() - slaMinutes * 60 * 1000).toISOString();
      const { data, error } = await db
        .from('leads')
        .select('id, full_name, city, state, priority, created_at, assigned_to, unattended_alert_sent_at')
        .is('first_contact_at', null)
        .is('unattended_alert_sent_at', null)
        .lte('created_at', cutoff)
        .limit(100);
      if (error) throw error;
      return data || [];
    }
  };
}

module.exports = { createLeadsRepo };
