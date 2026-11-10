'use strict';

const { ValidationError } = require('../utils/errors');
const { evaluateFiveFilterScorecard } = require('./scoringService');
const { generateEventId, buildIdempotencyKey } = require('../tracking/deduplication');

function createCrmService({ leadsRepo, crmRepo, trackingRepo, settingsRepo, automationsRepo, enqueueJob }) {
  return {
    async getKanbanBoard(filters = {}) {
      const [stages, opportunities] = await Promise.all([
        crmRepo.listStages(),
        crmRepo.listKanbanOpportunities(filters)
      ]);

      const columns = stages.map((stage) => {
        const cards = opportunities.filter((opp) => opp.stage_id === stage.id);
        const totalValueCents = cards.reduce(
          (sum, c) => sum + Number(c.actual_value_cents ?? c.estimated_value_cents ?? 0),
          0
        );
        return {
          ...stage,
          count: cards.length,
          total_value_cents: totalValueCents,
          cards
        };
      });

      return { stages, columns, total_opportunities: opportunities.length };
    },

    async moveOpportunityStage(opportunityId, payload, adminUser) {
      const opportunity = await crmRepo.getOpportunityById(opportunityId);
      const targetStage = await crmRepo.getStageById(payload.stage_id);
      const previousStage = opportunity.stage;

      if (targetStage.is_lost && !payload.loss_reason) {
        throw new ValidationError('Informe o motivo de perda ao mover para Perdido.');
      }
      if (targetStage.is_disqualified && !payload.disqualification_reason) {
        throw new ValidationError('Informe o motivo da desqualificação.');
      }

      const nowIso = new Date().toISOString();
      const patch = {
        stage_id: targetStage.id,
        stage_entered_at: nowIso
      };

      if (targetStage.is_won) {
        patch.status = 'won';
        patch.closed_at = nowIso;
        patch.actual_value_cents = payload.actual_value_cents ?? opportunity.estimated_value_cents ?? 2000000;
      } else if (targetStage.is_lost) {
        patch.status = 'lost';
        patch.closed_at = nowIso;
        patch.loss_reason = payload.loss_reason;
      } else if (targetStage.is_disqualified) {
        patch.status = 'disqualified';
        patch.closed_at = nowIso;
        patch.disqualification_reason = payload.disqualification_reason;
      } else {
        patch.status = 'open';
        patch.closed_at = null;
      }

      const updated = await crmRepo.updateOpportunity(opportunityId, patch);

      // Marca primeiro contato automático se avançou de Novo Lead para qualquer estágio comercial
      const leadPatch = { last_activity_at: nowIso };
      if (!opportunity.lead.first_contact_at && targetStage.slug !== 'novo-lead') {
        leadPatch.first_contact_at = nowIso;
      }
      if (targetStage.slug === 'qualificacao') {
        leadPatch.qualification_status = 'qualified';
      } else if (targetStage.is_disqualified) {
        leadPatch.qualification_status = 'disqualified';
      }
      await leadsRepo.updateLead(opportunity.lead_id, leadPatch);

      await crmRepo.addActivity({
        lead_id: opportunity.lead_id,
        opportunity_id: opportunityId,
        actor_admin_id: adminUser?.id || null,
        activity_type: 'stage_changed',
        title: `Estágio alterado: ${previousStage?.name || 'N/A'} → ${targetStage.name}`,
        description: payload.note || payload.loss_reason || payload.disqualification_reason || null,
        metadata: {
          from_stage: previousStage?.slug,
          to_stage: targetStage.slug,
          actual_value_cents: patch.actual_value_cents || null
        }
      });

      if (settingsRepo) {
        await settingsRepo.recordAuditLog({
          actor_admin_id: adminUser?.id || null,
          actor_email: adminUser?.email || null,
          action: 'opportunity.stage_changed',
          entity_type: 'opportunity',
          entity_id: opportunityId,
          changes: {
            from_stage: previousStage?.slug,
            to_stage: targetStage.slug,
            actual_value_cents: patch.actual_value_cents
          }
        });
      }

      // Dispara automações & conversões server-side nos estágios-chave
      if (targetStage.slug === 'qualificacao' && enqueueJob) {
        await enqueueJob({
          queueKey: 'automations',
          jobName: 'lead-qualified-workflow',
          idempotencyKey: `auto:qualified:${opportunity.lead_id}`,
          automationsRepo,
          payload: {
            lead_id: opportunity.lead_id,
            opportunity_id: opportunityId,
            triggered_by: adminUser?.id || null
          }
        });
      }

      if (targetStage.is_won && enqueueJob) {
        await enqueueJob({
          queueKey: 'automations',
          jobName: 'franchise-sold-workflow',
          idempotencyKey: `auto:won:${opportunityId}`,
          automationsRepo,
          payload: {
            lead_id: opportunity.lead_id,
            opportunity_id: opportunityId,
            actual_value_cents: patch.actual_value_cents,
            triggered_by: adminUser?.id || null
          }
        });
      }

      return updated;
    },

    async evaluateLeadScorecard(leadId, scorecardInput, adminUser) {
      const lead = await leadsRepo.getLeadById(leadId);
      const evaluation = evaluateFiveFilterScorecard(scorecardInput);

      await leadsRepo.upsertQualification(leadId, {
        scorecard_financial: scorecardInput.scorecard_financial,
        scorecard_territory: scorecardInput.scorecard_territory,
        scorecard_profile: scorecardInput.scorecard_profile,
        scorecard_dedication: scorecardInput.scorecard_dedication,
        scorecard_compliance: scorecardInput.scorecard_compliance,
        evaluated_by: adminUser?.id || null,
        evaluated_at: new Date().toISOString()
      });

      const updatedLead = await leadsRepo.updateLead(leadId, {
        lead_score: evaluation.normalizedLeadScore,
        score_grade:
          evaluation.normalizedLeadScore >= 80
            ? 'A'
            : evaluation.normalizedLeadScore >= 60
            ? 'B'
            : evaluation.normalizedLeadScore >= 40
            ? 'C'
            : 'D',
        qualification_status: evaluation.qualification_status,
        priority: evaluation.priority,
        first_contact_at: lead.first_contact_at || new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      });

      await crmRepo.addActivity({
        lead_id: leadId,
        actor_admin_id: adminUser?.id || null,
        activity_type: 'scorecard_evaluated',
        title: `Scorecard 5 Filtros avaliado: ${evaluation.total}/25 pontos`,
        description: `${evaluation.approved ? 'Aprovado nos 5 filtros' : 'Reprovado / Nutrição'} • ${scorecardInput.notes || ''}`,
        metadata: evaluation
      });

      if (evaluation.approved && enqueueJob) {
        await enqueueJob({
          queueKey: 'automations',
          jobName: 'lead-qualified-workflow',
          idempotencyKey: `auto:qualified:${leadId}`,
          automationsRepo,
          payload: {
            lead_id: leadId,
            scorecard_total: evaluation.total,
            triggered_by: adminUser?.id || null
          }
        });
      }

      return { lead: updatedLead, evaluation };
    },

    async logActivity(leadId, payload, adminUser) {
      const lead = await leadsRepo.getLeadById(leadId);
      const nowIso = new Date().toISOString();
      if (!lead.first_contact_at && ['call', 'whatsapp', 'email'].includes(payload.activity_type)) {
        await leadsRepo.updateLead(leadId, { first_contact_at: nowIso, last_activity_at: nowIso });
      } else {
        await leadsRepo.updateLead(leadId, { last_activity_at: nowIso });
      }
      return crmRepo.addActivity({
        lead_id: leadId,
        actor_admin_id: adminUser?.id || null,
        activity_type: payload.activity_type,
        title: payload.title,
        description: payload.description || null
      });
    },

    async createTask(leadId, payload, adminUser) {
      const openOpp = await crmRepo.getOpenOpportunityByLead(leadId);
      const task = await crmRepo.createTask({
        lead_id: leadId,
        opportunity_id: openOpp?.id || null,
        assigned_to: payload.assigned_to || adminUser?.id || null,
        created_by: adminUser?.id || null,
        title: payload.title,
        description: payload.description || null,
        priority: payload.priority,
        due_at: payload.due_at || null
      });
      await crmRepo.addActivity({
        lead_id: leadId,
        opportunity_id: openOpp?.id || null,
        actor_admin_id: adminUser?.id || null,
        activity_type: 'task_created',
        title: `Tarefa criada: ${payload.title}`,
        description: payload.due_at ? `Prazo: ${payload.due_at}` : null
      });
      return task;
    },

    async scheduleMeeting(leadId, payload, adminUser) {
      const lead = await leadsRepo.getLeadById(leadId);
      const openOpp = await crmRepo.getOpenOpportunityByLead(leadId);
      const nowIso = new Date().toISOString();

      const meeting = await crmRepo.createMeeting({
        lead_id: leadId,
        opportunity_id: openOpp?.id || null,
        host_admin_id: adminUser?.id || null,
        title: payload.title,
        meeting_type: payload.meeting_type,
        scheduled_for: payload.scheduled_for,
        duration_minutes: payload.duration_minutes,
        meeting_url: payload.meeting_url || null,
        notes: payload.notes || null,
        status: 'scheduled'
      });

      await leadsRepo.updateLead(leadId, {
        first_contact_at: lead.first_contact_at || nowIso,
        last_activity_at: nowIso
      });

      await crmRepo.addActivity({
        lead_id: leadId,
        opportunity_id: openOpp?.id || null,
        actor_admin_id: adminUser?.id || null,
        activity_type: 'meeting_scheduled',
        title: `Reunião agendada: ${payload.title}`,
        description: `Data: ${payload.scheduled_for} • Tipo: ${payload.meeting_type}`
      });

      if (enqueueJob) {
        const eventId = generateEventId('sched');
        await enqueueJob({
          queueKey: 'automations',
          jobName: 'meeting-scheduled-workflow',
          idempotencyKey: buildIdempotencyKey({
            platform: 'internal',
            eventName: 'meeting_scheduled',
            entityId: meeting.id
          }),
          automationsRepo,
          payload: {
            lead_id: leadId,
            opportunity_id: openOpp?.id || null,
            meeting_id: meeting.id,
            event_id: eventId
          }
        });
      }

      return meeting;
    }
  };
}

module.exports = { createCrmService };
