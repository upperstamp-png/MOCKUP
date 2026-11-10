'use strict';

const express = require('express');
const { validateBody } = require('../middleware/validate');
const {
  stageChangeSchema,
  leadUpdateSchema,
  scorecardSchema,
  activityCreateSchema,
  taskCreateSchema,
  taskUpdateSchema,
  meetingCreateSchema,
  meetingUpdateSchema
} = require('../utils/validators');
const { requireCsrf } = require('../middleware/csrfMiddleware');

function createAdminCrmRoutes({
  leadsRepo,
  crmRepo,
  settingsRepo,
  crmService,
  analyticsService,
  authMiddleware
}) {
  const router = express.Router();
  const { requireAdminAuth, requireRole } = authMiddleware;

  router.use(requireAdminAuth);
  router.use(requireCsrf);

  // Dashboard Executivo & Marketing
  router.get('/dashboard', async (req, res, next) => {
    try {
      const data = await analyticsService.getDashboardAnalytics({
        days: req.query.days,
        startDate: req.query.start_date,
        endDate: req.query.end_date
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // Lista de Leads
  router.get('/leads', async (req, res, next) => {
    try {
      const result = await leadsRepo.listLeads(req.query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Exportação CSV Auditada
  router.get(
    '/leads/export.csv',
    requireRole(['super_admin', 'expansion_director', 'marketing_analyst']),
    async (req, res, next) => {
      try {
        const { items } = await leadsRepo.listLeads({ ...req.query, page: 1, limit: 100 });
        await settingsRepo.recordAuditLog({
          actor_admin_id: req.adminUser.id,
          actor_email: req.adminUser.email,
          action: 'leads.exported_csv',
          entity_type: 'lead',
          ip_address: req.ip,
          changes: { count: items.length }
        });

        const header = ['ID', 'Nome', 'Email', 'WhatsApp', 'Cidade', 'UF', 'Score', 'Grade', 'Status', 'CriadoEm'];
        const rows = items.map((l) =>
          [
            l.id,
            l.full_name,
            l.email,
            l.whatsapp,
            l.city,
            l.state,
            l.lead_score,
            l.score_grade,
            l.qualification_status,
            l.created_at
          ]
            .map((col) => `"${String(col ?? '').replace(/"/g, '""')}"`)
            .join(',')
        );
        const csv = [header.join(','), ...rows].join('\n');
        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.set('Content-Disposition', 'attachment; filename="leads-king-sports.csv"');
        res.send(`\uFEFF${csv}`);
      } catch (err) {
        next(err);
      }
    }
  );

  // Detalhes 360 do Lead
  router.get('/leads/:id', async (req, res, next) => {
    try {
      const lead = await leadsRepo.getLeadById(req.params.id);
      res.json({ lead });
    } catch (err) {
      next(err);
    }
  });

  // Atualizar propriedades do Lead
  router.patch('/leads/:id', validateBody(leadUpdateSchema), async (req, res, next) => {
    try {
      const body = req.validatedBody;
      const leadPatch = {};
      if (body.priority !== undefined) leadPatch.priority = body.priority;
      if (body.qualification_status !== undefined) leadPatch.qualification_status = body.qualification_status;
      if (body.assigned_to !== undefined) leadPatch.assigned_to = body.assigned_to;
      if (body.desired_zip_prefix !== undefined) leadPatch.desired_zip_prefix = body.desired_zip_prefix;

      let updatedLead = await leadsRepo.getLeadById(req.params.id);
      if (Object.keys(leadPatch).length > 0) {
        updatedLead = await leadsRepo.updateLead(req.params.id, {
          ...leadPatch,
          last_activity_at: new Date().toISOString()
        });
      }

      if (body.next_follow_up_at !== undefined || body.estimated_value_cents !== undefined || body.assigned_to !== undefined) {
        const opp = await crmRepo.getOpenOpportunityByLead(req.params.id);
        if (opp) {
          const oppPatch = {};
          if (body.next_follow_up_at !== undefined) oppPatch.next_follow_up_at = body.next_follow_up_at;
          if (body.estimated_value_cents !== undefined) oppPatch.estimated_value_cents = body.estimated_value_cents;
          if (body.assigned_to !== undefined) oppPatch.owner_id = body.assigned_to;
          await crmRepo.updateOpportunity(opp.id, oppPatch);
        }
      }

      await settingsRepo.recordAuditLog({
        actor_admin_id: req.adminUser.id,
        actor_email: req.adminUser.email,
        action: 'lead.updated',
        entity_type: 'lead',
        entity_id: req.params.id,
        changes: body
      });

      res.json({ lead: updatedLead });
    } catch (err) {
      next(err);
    }
  });

  // Avaliar Scorecard 5 Filtros
  router.post('/leads/:id/scorecard', validateBody(scorecardSchema), async (req, res, next) => {
    try {
      const result = await crmService.evaluateLeadScorecard(
        req.params.id,
        req.validatedBody,
        req.adminUser
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Atividades / Notas
  router.post('/leads/:id/activities', validateBody(activityCreateSchema), async (req, res, next) => {
    try {
      const activity = await crmService.logActivity(req.params.id, req.validatedBody, req.adminUser);
      res.status(201).json({ activity });
    } catch (err) {
      next(err);
    }
  });

  // Tarefas
  router.post('/leads/:id/tasks', validateBody(taskCreateSchema), async (req, res, next) => {
    try {
      const task = await crmService.createTask(req.params.id, req.validatedBody, req.adminUser);
      res.status(201).json({ task });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/tasks/:taskId', validateBody(taskUpdateSchema), async (req, res, next) => {
    try {
      const patch = { ...req.validatedBody };
      if (patch.status === 'completed') patch.completed_at = new Date().toISOString();
      const task = await crmRepo.updateTask(req.params.taskId, patch);
      res.json({ task });
    } catch (err) {
      next(err);
    }
  });

  // Reuniões
  router.post('/leads/:id/meetings', validateBody(meetingCreateSchema), async (req, res, next) => {
    try {
      const meeting = await crmService.scheduleMeeting(req.params.id, req.validatedBody, req.adminUser);
      res.status(201).json({ meeting });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/meetings/:meetingId', validateBody(meetingUpdateSchema), async (req, res, next) => {
    try {
      const patch = { ...req.validatedBody };
      if (patch.status === 'completed') patch.completed_at = new Date().toISOString();
      const meeting = await crmRepo.updateMeeting(req.params.meetingId, patch);
      res.json({ meeting });
    } catch (err) {
      next(err);
    }
  });

  // Pipeline Kanban
  router.get('/pipeline', async (req, res, next) => {
    try {
      const board = await crmService.getKanbanBoard({
        owner_id: req.query.owner_id,
        status: req.query.status
      });
      res.json(board);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/opportunities/:id/stage', validateBody(stageChangeSchema), async (req, res, next) => {
    try {
      const updated = await crmService.moveOpportunityStage(
        req.params.id,
        req.validatedBody,
        req.adminUser
      );
      res.json({ opportunity: updated });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAdminCrmRoutes };
