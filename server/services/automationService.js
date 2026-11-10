'use strict';

const logger = require('../utils/logger');
const { evaluateConsentForPlatform } = require('../tracking/consentValidator');
const { ensureNotDuplicated, buildIdempotencyKey, generateEventId } = require('../tracking/deduplication');
const { buildMetaCapiPayload, sendMetaCapiEvent } = require('../integrations/metaCapi');
const { buildGa4MeasurementPayload, sendGa4MeasurementEvent } = require('../integrations/ga4Measurement');
const { buildGoogleAdsOfflinePayload, sendGoogleAdsOfflineConversion } = require('../integrations/googleAdsOffline');
const { env } = require('../config/env');

function createAutomationService({
  leadsRepo,
  crmRepo,
  trackingRepo,
  automationsRepo,
  settingsService,
  redisClient = null,
  fetchFn = global.fetch
}) {
  return {
    async dispatchConversionEvent(jobData) {
      const {
        lead_id,
        opportunity_id,
        platform,
        event_name,
        event_id,
        idempotency_key,
        client_ip,
        user_agent,
        event_source_url,
        attribution,
        value_brl = null
      } = jobData;

      // 1. Verifica idempotência para impedir múltiplos disparos em retries
      const dupCheck = await ensureNotDuplicated({
        idempotencyKey: idempotency_key,
        redisClient,
        trackingRepo
      });
      if (dupCheck.duplicated) {
        logger.info('Conversion event deduplicated (already processed)', {
          idempotency_key,
          via: dupCheck.via
        });
        return { skipped: true, reason: `deduplicated_via_${dupCheck.via}` };
      }

      // 2. Carrega lead e último registro de consentimento LGPD
      const lead = lead_id ? await leadsRepo.getLeadById(lead_id) : null;
      const consentRecord =
        jobData.consent ||
        (lead?.id && trackingRepo ? await trackingRepo.getLatestConsentBySession(attribution?.session_id) : null);

      const consentCheck = evaluateConsentForPlatform(consentRecord, platform);
      if (!consentCheck.allowed) {
        if (trackingRepo) {
          await trackingRepo.upsertConversionEvent({
            event_id,
            idempotency_key,
            lead_id,
            opportunity_id,
            platform,
            event_name,
            event_value_cents: value_brl != null ? Math.round(Number(value_brl) * 100) : null,
            status: 'skipped_no_consent',
            error_message: consentCheck.reason
          });
        }
        return { skipped: true, status: 'skipped_no_consent', reason: consentCheck.reason };
      }

      // 3. Carrega credenciais seguras
      const secrets = await settingsService.getResolvedServerSecrets();
      const firstOrLastAttr =
        attribution ||
        lead?.attributions?.find((a) => a.touch_type === 'last_touch') ||
        lead?.attributions?.[0] ||
        {};

      let result;

      if (platform === 'meta_capi') {
        const payload = buildMetaCapiPayload({
          eventName: event_name,
          eventId: event_id,
          eventSourceUrl: event_source_url,
          lead,
          attribution: firstOrLastAttr,
          clientIp: client_ip,
          userAgent: user_agent,
          valueBrl: value_brl,
          testEventCode: secrets.meta_test_event_code
        });
        result = await sendMetaCapiEvent({
          pixelId: secrets.meta_pixel_id,
          accessToken: secrets.meta_capi_token,
          payload,
          fetchFn
        });
      } else if (platform === 'ga4_mp') {
        const payload = buildGa4MeasurementPayload({
          clientId: firstOrLastAttr.session_id || lead_id,
          sessionId: firstOrLastAttr.session_id,
          eventName: event_name,
          eventId: event_id,
          valueBrl: value_brl,
          params: {
            utm_source: firstOrLastAttr.utm_source,
            utm_campaign: firstOrLastAttr.utm_campaign
          },
          consentGranted: {
            analytics: Boolean(consentRecord?.analytics_consent ?? consentRecord?.analytics),
            marketing: Boolean(consentRecord?.marketing_consent ?? consentRecord?.marketing)
          }
        });
        result = await sendGa4MeasurementEvent({
          measurementId: secrets.ga4_measurement_id,
          apiSecret: secrets.ga4_api_secret,
          payload,
          fetchFn
        });
      } else if (platform === 'google_ads_offline') {
        const payload = buildGoogleAdsOfflinePayload({
          customerId: secrets.google_ads_customer_id,
          lead,
          attribution: firstOrLastAttr,
          eventId: event_id,
          conversionValueBrl: value_brl || 0
        });
        result = await sendGoogleAdsOfflineConversion({
          developerToken: secrets.google_ads_developer_token,
          clientId: secrets.google_ads_client_id,
          clientSecret: secrets.google_ads_client_secret,
          refreshToken: secrets.google_ads_refresh_token,
          customerId: secrets.google_ads_customer_id,
          loginCustomerId: secrets.google_ads_login_customer_id,
          payload,
          fetchFn
        });
      } else {
        result = { sent: true, status: 'sent', response: { internal: true } };
      }

      if (trackingRepo) {
        await trackingRepo.upsertConversionEvent({
          event_id,
          idempotency_key,
          lead_id,
          opportunity_id,
          platform,
          event_name,
          event_value_cents: value_brl != null ? Math.round(Number(value_brl) * 100) : null,
          status: result.status,
          attempts: 1,
          response_status: result.httpStatus || null,
          response_body: result.response || null,
          error_message: result.error || result.reason || null,
          sent_at: result.sent ? new Date().toISOString() : null
        });
      }

      if (result.status === 'failed') {
        throw new Error(result.error || `Falha no envio para ${platform}`);
      }

      return result;
    },

    async executeAutomationWorkflow(jobName, payload, { enqueueJob = null } = {}) {
      if (jobName === 'new-lead-workflow') {
        const rule = automationsRepo ? await automationsRepo.getRuleByKey('new_lead_workflow') : null;
        if (rule && !rule.is_active) return { skipped: true, reason: 'rule_disabled' };

        const dueMinutes = Number(rule?.config?.first_task_due_minutes || 30);
        if (rule?.config?.auto_create_first_task !== false) {
          await crmRepo.createTask({
            lead_id: payload.lead_id,
            opportunity_id: payload.opportunity_id || null,
            title: 'Realizar primeiro contato consultivo (15 min pré-qualificação)',
            description: 'Aplicar os 5 Filtros do Scorecard King Sports e validar CEP desejado.',
            priority: payload.score >= 75 ? 'high' : 'normal',
            due_at: new Date(Date.now() + dueMinutes * 60 * 1000).toISOString()
          });
        }

        // Notificação opcional por webhook sem expor dados sensíveis em log
        if (env.ADMIN_NOTIFICATION_WEBHOOK_URL && rule?.config?.notify_admin !== false) {
          try {
            await fetchFn(env.ADMIN_NOTIFICATION_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'king_sports.new_lead',
                lead_id: payload.lead_id,
                score: payload.score,
                grade: payload.grade
              })
            });
          } catch (err) {
            logger.warn('Webhook notification failed', { message: err.message });
          }
        }
        return { processed: true, workflow: 'new-lead-workflow' };
      }

      if (jobName === 'lead-qualified-workflow') {
        const rule = automationsRepo ? await automationsRepo.getRuleByKey('lead_qualified_workflow') : null;
        if (rule && !rule.is_active) return { skipped: true, reason: 'rule_disabled' };

        await leadsRepo.updateLead(payload.lead_id, {
          qualification_status: 'qualified',
          priority: 'high'
        });

        await crmRepo.createTask({
          lead_id: payload.lead_id,
          opportunity_id: payload.opportunity_id || null,
          title: 'Enviar NDA (Doc. 06) e agendar apresentação de 16 slides',
          description: 'Lead qualificado pela automação. Priorizar agendamento com apresentador.',
          priority: 'high',
          due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        });

        await crmRepo.addActivity({
          lead_id: payload.lead_id,
          opportunity_id: payload.opportunity_id || null,
          activity_type: 'automation_executed',
          title: 'Automação Lead Qualificado executada',
          description: 'Prioridade elevada para Alta e tarefa de agendamento criada.'
        });

        if (enqueueJob) {
          const eventId = generateEventId('qual');
          for (const target of [
            { platform: 'meta_capi', eventName: 'Contact' },
            { platform: 'ga4_mp', eventName: 'qualify_lead' },
            { platform: 'google_ads_offline', eventName: 'lead_qualified' }
          ]) {
            await enqueueJob({
              queueKey: 'tracking',
              jobName: 'dispatch-conversion',
              idempotencyKey: buildIdempotencyKey({
                platform: target.platform,
                eventName: target.eventName,
                entityId: payload.lead_id
              }),
              automationsRepo,
              payload: {
                lead_id: payload.lead_id,
                opportunity_id: payload.opportunity_id || null,
                platform: target.platform,
                event_name: target.eventName,
                event_id: eventId,
                idempotency_key: buildIdempotencyKey({
                  platform: target.platform,
                  eventName: target.eventName,
                  entityId: payload.lead_id
                })
              }
            });
          }
        }
        return { processed: true, workflow: 'lead-qualified-workflow' };
      }

      if (jobName === 'meeting-scheduled-workflow') {
        const rule = automationsRepo ? await automationsRepo.getRuleByKey('meeting_scheduled_workflow') : null;
        if (rule && !rule.is_active) return { skipped: true, reason: 'rule_disabled' };

        if (payload.opportunity_id && rule?.config?.auto_advance_stage !== false) {
          const opp = await crmRepo.getOpportunityById(payload.opportunity_id);
          const stages = await crmRepo.listStages();
          const meetingStage = stages.find((s) => s.slug === 'reuniao');
          if (meetingStage && opp.stage && opp.stage.sort_order < meetingStage.sort_order) {
            await crmRepo.updateOpportunity(opp.id, {
              stage_id: meetingStage.id,
              stage_entered_at: new Date().toISOString()
            });
          }
        }

        if (enqueueJob) {
          const eventId = payload.event_id || generateEventId('sched');
          for (const target of [
            { platform: 'meta_capi', eventName: 'Schedule' },
            { platform: 'ga4_mp', eventName: 'schedule_meeting' }
          ]) {
            const idempotencyKey = buildIdempotencyKey({
              platform: target.platform,
              eventName: target.eventName,
              entityId: payload.meeting_id || payload.lead_id
            });
            await enqueueJob({
              queueKey: 'tracking',
              jobName: 'dispatch-conversion',
              idempotencyKey,
              automationsRepo,
              payload: {
                lead_id: payload.lead_id,
                opportunity_id: payload.opportunity_id || null,
                platform: target.platform,
                event_name: target.eventName,
                event_id: eventId,
                idempotency_key: idempotencyKey
              }
            });
          }
        }
        return { processed: true, workflow: 'meeting-scheduled-workflow' };
      }

      if (jobName === 'franchise-sold-workflow') {
        const rule = automationsRepo ? await automationsRepo.getRuleByKey('franchise_sold_workflow') : null;
        if (rule && !rule.is_active) return { skipped: true, reason: 'rule_disabled' };

        const valueBrl = Number(payload.actual_value_cents || 2000000) / 100;

        await crmRepo.addActivity({
          lead_id: payload.lead_id,
          opportunity_id: payload.opportunity_id,
          activity_type: 'automation_executed',
          title: 'Franquia Vendida — Evento interno & conversões offline disparados',
          description: `Valor real contratado: R$ ${valueBrl.toFixed(2)}`
        });

        if (enqueueJob) {
          const eventId = generateEventId('sale');
          for (const target of [
            { platform: 'meta_capi', eventName: 'Purchase' },
            { platform: 'ga4_mp', eventName: 'purchase' },
            { platform: 'google_ads_offline', eventName: 'franchise_sold' }
          ]) {
            const idempotencyKey = buildIdempotencyKey({
              platform: target.platform,
              eventName: target.eventName,
              entityId: payload.opportunity_id
            });
            await enqueueJob({
              queueKey: 'tracking',
              jobName: 'dispatch-conversion',
              idempotencyKey,
              automationsRepo,
              payload: {
                lead_id: payload.lead_id,
                opportunity_id: payload.opportunity_id,
                platform: target.platform,
                event_name: target.eventName,
                event_id: eventId,
                idempotency_key: idempotencyKey,
                value_brl: valueBrl
              }
            });
          }
        }
        return { processed: true, workflow: 'franchise-sold-workflow', value_brl: valueBrl };
      }

      return { skipped: true, reason: 'unknown_workflow' };
    },

    async scanUnattendedLeadsSla(slaMinutes = 30) {
      const rule = automationsRepo ? await automationsRepo.getRuleByKey('unattended_lead_sla_alert') : null;
      if (rule && !rule.is_active) return { checked: 0, alerted: 0 };

      const effectiveSla = Number(rule?.config?.sla_minutes || slaMinutes || 30);
      const staleLeads = await leadsRepo.listUnattendedPastSla(effectiveSla);

      for (const lead of staleLeads) {
        await leadsRepo.updateLead(lead.id, {
          priority: rule?.config?.escalate_priority ? 'urgent' : lead.priority,
          unattended_alert_sent_at: new Date().toISOString()
        });
        await crmRepo.createTask({
          lead_id: lead.id,
          assigned_to: lead.assigned_to || null,
          title: `SLA ${effectiveSla}min excedido — Contatar lead urgentemente`,
          description: `Lead ${lead.full_name} (${lead.city}/${lead.state}) aguardando primeiro atendimento.`,
          priority: 'urgent',
          due_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
        });
        await crmRepo.addActivity({
          lead_id: lead.id,
          activity_type: 'automation_executed',
          title: `Alerta de Lead sem Atendimento (${effectiveSla} min)`,
          description: 'Prioridade escalada e tarefa urgente criada automaticamente.'
        });
      }

      return { checked: staleLeads.length, alerted: staleLeads.length };
    }
  };
}

module.exports = { createAutomationService };
