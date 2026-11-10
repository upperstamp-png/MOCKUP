'use strict';

const {
  normalizeEmail,
  normalizeBrazilPhone,
  hashIp
} = require('../utils/crypto');
const { ValidationError } = require('../utils/errors');
const { calculateInitialLeadScore } = require('./scoringService');
const { generateEventId, buildIdempotencyKey } = require('../tracking/deduplication');
const logger = require('../utils/logger');

function extractTouchFields(touch = {}, fallback = {}) {
  return {
    session_id: touch.session_id || fallback.session_id || null,
    utm_source: touch.utm_source || null,
    utm_medium: touch.utm_medium || null,
    utm_campaign: touch.utm_campaign || null,
    utm_content: touch.utm_content || null,
    utm_term: touch.utm_term || null,
    gclid: touch.gclid || null,
    fbclid: touch.fbclid || null,
    gbraid: touch.gbraid || null,
    wbraid: touch.wbraid || null,
    fbp: touch.fbp || null,
    fbc: touch.fbc || null,
    landing_page: touch.landing_page || null,
    referrer: touch.referrer || null,
    captured_at: touch.timestamp || new Date().toISOString()
  };
}

function createLeadIngestionService({
  leadsRepo,
  crmRepo,
  trackingRepo,
  campaignsRepo,
  blogRepo,
  automationsRepo,
  enqueueJob
}) {
  return {
    async ingestPublicLead(input, requestMeta = {}) {
      // 1. Anti-spam check (honeypot + impossibly fast submission < 1.5s if provided)
      if (input.website_hp && input.website_hp.length > 0) {
        throw new ValidationError('Submissão inválida detectada pelo filtro anti-spam.');
      }
      if (input.form_started_at && Number.isFinite(input.form_started_at)) {
        const elapsedMs = Date.now() - input.form_started_at;
        if (elapsedMs >= 0 && elapsedMs < 800) {
          throw new ValidationError('Preenchimento rápido demais. Por favor, revise seus dados e tente novamente.');
        }
      }

      const emailNorm = normalizeEmail(input.email);
      const phoneNorm = normalizeBrazilPhone(input.whatsapp);
      const ipHash = hashIp(requestMeta.ip);
      const userAgent = String(requestMeta.userAgent || '').slice(0, 400);

      // 2. Identifica origem de blog se houver slug
      let originBlogPostId = null;
      if (input.blog_post_slug && blogRepo) {
        const post = await blogRepo.findPostBySlugAnyStatus(input.blog_post_slug);
        if (post) {
          originBlogPostId = post.id;
        }
      }

      // 3. Vincula campanha pelo last_touch ou first_touch UTM
      const firstTouch = extractTouchFields(input.attribution?.first_touch, { session_id: input.session_id });
      const lastTouch = extractTouchFields(input.attribution?.last_touch || input.attribution?.first_touch, {
        session_id: input.session_id
      });

      let primaryCampaignId = null;
      if (campaignsRepo && (lastTouch.utm_campaign || lastTouch.utm_source)) {
        const matchedCampaign = await campaignsRepo.findCampaignByUtm(
          lastTouch.utm_campaign,
          lastTouch.utm_source
        );
        if (matchedCampaign) primaryCampaignId = matchedCampaign.id;
      }

      // 4. Calcula pontuação inicial
      const scoring = calculateInitialLeadScore({
        available_capital_range: input.available_capital_range,
        desired_start_timeframe: input.desired_start_timeframe,
        commercial_experience: input.commercial_experience,
        current_profession: input.current_profession,
        intended_track: input.intended_track
      });

      const consentState = {
        analytics_consent: Boolean(input.consent?.analytics),
        marketing_consent: Boolean(input.consent?.marketing),
        functional_consent: input.consent?.functional !== false,
        policy_version: input.consent?.policy_version || '1.0'
      };

      // 5. Verifica lead duplicado (email ou whatsapp normalizado)
      const existingLead = await leadsRepo.findDuplicate(emailNorm, phoneNorm);
      let lead;
      let opportunity;
      let isDuplicate = false;

      if (existingLead) {
        isDuplicate = true;
        lead = await leadsRepo.updateLead(existingLead.id, {
          full_name: input.full_name,
          whatsapp: input.whatsapp,
          whatsapp_normalized: phoneNorm,
          city: input.city,
          state: input.state,
          desired_zip_prefix: input.desired_zip_prefix || existingLead.desired_zip_prefix,
          lead_score: Math.max(existingLead.lead_score || 0, scoring.score),
          score_grade: scoring.score >= (existingLead.lead_score || 0) ? scoring.grade : existingLead.score_grade,
          priority: existingLead.priority === 'urgent' ? 'urgent' : scoring.priority,
          primary_campaign_id: existingLead.primary_campaign_id || primaryCampaignId,
          origin_blog_post_id: existingLead.origin_blog_post_id || originBlogPostId,
          submission_count: (existingLead.submission_count || 1) + 1,
          last_activity_at: new Date().toISOString()
        });

        await leadsRepo.upsertQualification(lead.id, {
          commercial_experience: input.commercial_experience,
          current_profession: input.current_profession,
          available_capital_range: input.available_capital_range,
          desired_start_timeframe: input.desired_start_timeframe,
          intended_track: input.intended_track,
          scoring_breakdown: scoring.breakdown
        });

        // Preserva first_touch original e adiciona reengagement/last_touch
        await leadsRepo.addAttribution({
          lead_id: lead.id,
          touch_type: 'reengagement',
          ...lastTouch,
          user_agent: userAgent,
          ip_hash: ipHash,
          consent_analytics: consentState.analytics_consent,
          consent_marketing: consentState.marketing_consent
        });

        opportunity = await crmRepo.getOpenOpportunityByLead(lead.id);
        if (!opportunity) {
          const initialStage = await crmRepo.getStageBySlug('novo-lead');
          opportunity = await crmRepo.createOpportunity({
            lead_id: lead.id,
            stage_id: initialStage.id,
            title: `Franquia ${input.city}/${input.state} — ${input.full_name}`,
            estimated_value_cents: 2000000,
            status: 'open'
          });
        }

        await crmRepo.addActivity({
          lead_id: lead.id,
          opportunity_id: opportunity.id,
          activity_type: 'lead_reengagement',
          title: 'Candidato enviou nova solicitação pelo formulário',
          description: `Trilha: ${input.intended_track} | Capital: ${input.available_capital_range} | Score: ${scoring.score}/100`,
          metadata: { utm_source: lastTouch.utm_source, utm_campaign: lastTouch.utm_campaign }
        });
      } else {
        lead = await leadsRepo.createLead({
          full_name: input.full_name,
          email: input.email,
          email_normalized: emailNorm,
          whatsapp: input.whatsapp,
          whatsapp_normalized: phoneNorm,
          city: input.city,
          state: input.state,
          desired_zip_prefix: input.desired_zip_prefix || null,
          lead_score: scoring.score,
          score_grade: scoring.grade,
          qualification_status: scoring.qualification_status,
          priority: scoring.priority,
          primary_campaign_id: primaryCampaignId,
          origin_blog_post_id: originBlogPostId,
          last_activity_at: new Date().toISOString()
        });

        await leadsRepo.upsertQualification(lead.id, {
          commercial_experience: input.commercial_experience,
          current_profession: input.current_profession,
          available_capital_range: input.available_capital_range,
          desired_start_timeframe: input.desired_start_timeframe,
          intended_track: input.intended_track,
          scoring_breakdown: scoring.breakdown
        });

        await leadsRepo.addAttribution({
          lead_id: lead.id,
          touch_type: 'first_touch',
          ...firstTouch,
          user_agent: userAgent,
          ip_hash: ipHash,
          consent_analytics: consentState.analytics_consent,
          consent_marketing: consentState.marketing_consent
        });

        await leadsRepo.addAttribution({
          lead_id: lead.id,
          touch_type: 'last_touch',
          ...lastTouch,
          user_agent: userAgent,
          ip_hash: ipHash,
          consent_analytics: consentState.analytics_consent,
          consent_marketing: consentState.marketing_consent
        });

        const initialStage = await crmRepo.getStageBySlug('novo-lead');
        opportunity = await crmRepo.createOpportunity({
          lead_id: lead.id,
          stage_id: initialStage.id,
          title: `Franquia ${input.city}/${input.state} — ${input.full_name}`,
          estimated_value_cents: 2000000,
          status: 'open'
        });

        await crmRepo.addActivity({
          lead_id: lead.id,
          opportunity_id: opportunity.id,
          activity_type: 'lead_created',
          title: 'Lead captado pela Landing Page',
          description: `Perfil ${input.intended_track} • ${input.city}/${input.state} • Score inicial ${scoring.score}/100 (Grade ${scoring.grade})`,
          metadata: {
            utm_source: lastTouch.utm_source,
            utm_medium: lastTouch.utm_medium,
            utm_campaign: lastTouch.utm_campaign
          }
        });

        if (originBlogPostId && blogRepo) {
          await blogRepo.incrementPostLeads(originBlogPostId);
        }
      }

      // 6. Grava registro de consentimento LGPD vinculado ao lead
      if (trackingRepo) {
        await trackingRepo.recordConsent({
          session_id: input.session_id || `lead_${lead.id}`,
          lead_id: lead.id,
          analytics_consent: consentState.analytics_consent,
          marketing_consent: consentState.marketing_consent,
          functional_consent: consentState.functional_consent,
          policy_version: consentState.policy_version,
          ip_hash: ipHash,
          user_agent: userAgent
        });
      }

      // 7. Prepara eventos de conversão deduplicados (mesmo event_id do navegador!)
      const sharedEventId = input.event_id || generateEventId('lead');
      const conversionTargets = [
        { platform: 'meta_capi', eventName: 'Lead' },
        { platform: 'ga4_mp', eventName: 'generate_lead' },
        { platform: 'google_ads_offline', eventName: 'lead_submit' }
      ];

      const queuedJobs = [];
      for (const target of conversionTargets) {
        const idempotencyKey = buildIdempotencyKey({
          platform: target.platform,
          eventName: target.eventName,
          entityId: `${lead.id}:${sharedEventId}`,
          eventId: sharedEventId
        });

        if (trackingRepo) {
          await trackingRepo.upsertConversionEvent({
            event_id: sharedEventId,
            idempotency_key: idempotencyKey,
            lead_id: lead.id,
            opportunity_id: opportunity.id,
            platform: target.platform,
            event_name: target.eventName,
            event_value_cents: null,
            currency: 'BRL',
            status: 'pending',
            payload: {
              attribution: lastTouch,
              consent: consentState,
              event_source_url: lastTouch.landing_page || requestMeta.referer || null
            }
          });
        }

        const jobRes = await enqueueJob({
          queueKey: 'tracking',
          jobName: 'dispatch-conversion',
          idempotencyKey,
          automationsRepo,
          payload: {
            lead_id: lead.id,
            opportunity_id: opportunity.id,
            platform: target.platform,
            event_name: target.eventName,
            event_id: sharedEventId,
            idempotency_key: idempotencyKey,
            client_ip: requestMeta.ip || null,
            user_agent: userAgent,
            event_source_url: lastTouch.landing_page || requestMeta.referer || null,
            attribution: lastTouch,
            consent: consentState
          }
        });
        queuedJobs.push({ platform: target.platform, ...jobRes });
      }

      // 8. Enfileira automação de Novo Lead (e Lead Qualificado se score inicial alto)
      const newLeadJob = await enqueueJob({
        queueKey: 'automations',
        jobName: 'new-lead-workflow',
        idempotencyKey: `auto:new_lead:${lead.id}:${lead.submission_count || 1}`,
        automationsRepo,
        payload: {
          lead_id: lead.id,
          opportunity_id: opportunity.id,
          is_duplicate: isDuplicate,
          score: scoring.score,
          grade: scoring.grade
        }
      });

      if (scoring.qualification_status === 'qualified') {
        await enqueueJob({
          queueKey: 'automations',
          jobName: 'lead-qualified-workflow',
          idempotencyKey: `auto:qualified:${lead.id}`,
          automationsRepo,
          payload: {
            lead_id: lead.id,
            opportunity_id: opportunity.id,
            score: scoring.score,
            consent: consentState,
            attribution: lastTouch
          }
        });
      }

      logger.info('Lead ingested successfully', {
        lead_id: lead.id,
        is_duplicate: isDuplicate,
        score: scoring.score,
        grade: scoring.grade
      });

      return {
        lead_id: lead.id,
        opportunity_id: opportunity.id,
        is_duplicate: isDuplicate,
        event_id: sharedEventId,
        score: scoring.score,
        grade: scoring.grade,
        qualification_status: scoring.qualification_status,
        tracking_jobs: queuedJobs,
        automation_job: newLeadJob
      };
    }
  };
}

module.exports = { createLeadIngestionService };
