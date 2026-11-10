'use strict';

const { getSupabaseAdmin } = require('../supabase');

function createCampaignsRepo(getDb = getSupabaseAdmin) {
  return {
    async listCampaigns() {
      const db = getDb();
      const { data, error } = await db
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async createCampaign(payload) {
      const db = getDb();
      const { data, error } = await db.from('campaigns').insert(payload).select('*').single();
      if (error) throw error;
      return data;
    },

    async findCampaignByUtm(utmCampaign, utmSource) {
      if (!utmCampaign && !utmSource) return null;
      const db = getDb();
      let query = db.from('campaigns').select('*').limit(1);
      if (utmCampaign) {
        query = query.ilike('utm_campaign', utmCampaign);
      } else if (utmSource) {
        query = query.ilike('utm_source', utmSource);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },

    async upsertCampaignMetrics(campaignId, metricPayload) {
      const db = getDb();
      const row = {
        campaign_id: campaignId,
        ...metricPayload,
        sync_source: metricPayload.sync_source || 'manual'
      };
      const { data, error } = await db
        .from('campaign_metrics')
        .upsert(row, { onConflict: 'campaign_id,metric_date,sync_source' })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async getAnalyticsDataset(startDateIso, endDateIso) {
      const db = getDb();
      const startDateOnly = startDateIso.slice(0, 10);
      const endDateOnly = endDateIso.slice(0, 10);

      const [
        leadsRes,
        oppsRes,
        stagesRes,
        meetingsRes,
        campaignsRes,
        metricsRes,
        attributionsRes
      ] = await Promise.all([
        db
          .from('leads')
          .select('id, state, city, lead_score, score_grade, qualification_status, priority, first_contact_at, primary_campaign_id, origin_blog_post_id, created_at')
          .gte('created_at', startDateIso)
          .lte('created_at', endDateIso),
        db
          .from('opportunities')
          .select('id, lead_id, stage_id, status, estimated_value_cents, actual_value_cents, stage_entered_at, closed_at, created_at')
          .gte('created_at', startDateIso)
          .lte('created_at', endDateIso),
        db.from('pipeline_stages').select('*').order('sort_order', { ascending: true }),
        db
          .from('meetings')
          .select('id, lead_id, status, scheduled_for, completed_at, created_at')
          .gte('created_at', startDateIso)
          .lte('created_at', endDateIso),
        db.from('campaigns').select('*'),
        db
          .from('campaign_metrics')
          .select('*')
          .gte('metric_date', startDateOnly)
          .lte('metric_date', endDateOnly),
        db
          .from('lead_attributions')
          .select('lead_id, touch_type, utm_source, utm_medium, utm_campaign, captured_at')
          .gte('captured_at', startDateIso)
          .lte('captured_at', endDateIso)
      ]);

      for (const res of [leadsRes, oppsRes, stagesRes, meetingsRes, campaignsRes, metricsRes, attributionsRes]) {
        if (res.error) throw res.error;
      }

      return {
        leads: leadsRes.data || [],
        opportunities: oppsRes.data || [],
        stages: stagesRes.data || [],
        meetings: meetingsRes.data || [],
        campaigns: campaignsRes.data || [],
        metrics: metricsRes.data || [],
        attributions: attributionsRes.data || []
      };
    }
  };
}

module.exports = { createCampaignsRepo };
