'use strict';

const express = require('express');
const { validateBody } = require('../middleware/validate');
const { ValidationError } = require('../utils/errors');
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

const VALID_QUALIFICATION_STATUSES = new Set(['pending', 'qualified', 'nurture', 'disqualified']);
const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const VALID_SCORE_GRADES = new Set(['A', 'B', 'C', 'D']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuidParam(value, label = 'Identificador') {
  const clean = String(value || '').trim();
  if (!UUID_REGEX.test(clean)) {
    throw new ValidationError(`${label} inválido.`);
  }
  return clean;
}

function pickScalarQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseBoundedInt(raw, fallback, min, max) {
  const scalar = pickScalarQueryValue(raw);
  if (scalar === undefined || scalar === null) return fallback;
  const trimmed = String(scalar).trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function sanitizeSearchQuery(raw) {
  const scalar = pickScalarQueryValue(raw);
  if (scalar === undefined || scalar === null) return '';
  return String(scalar)
    .replace(/[,()\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function normalizeLeadsQuery(query = {}, { defaultLimit = 25 } = {}) {
  const safeQuery = query && typeof query === 'object' ? query : {};
  const page = parseBoundedInt(safeQuery.page, 1, 1, 100000);
  const limit = parseBoundedInt(safeQuery.limit, defaultLimit, 1, 100);
  const filters = { page, limit };

  const search = sanitizeSearchQuery(safeQuery.search);
  if (search) filters.search = search;

  const status = String(pickScalarQueryValue(safeQuery.qualification_status) || '').trim().toLowerCase();
  if (VALID_QUALIFICATION_STATUSES.has(status)) {
    filters.qualification_status = status;
  }

  const priority = String(pickScalarQueryValue(safeQuery.priority) || '').trim().toLowerCase();
  if (VALID_PRIORITIES.has(priority)) {
    filters.priority = priority;
  }

  const grade = String(pickScalarQueryValue(safeQuery.score_grade ?? safeQuery.grade) || '')
    .trim()
    .toUpperCase();
  if (VALID_SCORE_GRADES.has(grade)) {
    filters.score_grade = grade;
  }

  const state = String(pickScalarQueryValue(safeQuery.state) || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(state)) {
    filters.state = state;
  }

  const assignedTo = String(pickScalarQueryValue(safeQuery.assigned_to) || '').trim();
  if (UUID_REGEX.test(assignedTo)) {
    filters.assigned_to = assignedTo;
  }

  const unattendedRaw = pickScalarQueryValue(safeQuery.unattended);
  if (unattendedRaw === true || String(unattendedRaw || '').trim().toLowerCase() === 'true') {
    filters.unattended = 'true';
  }

  const fromDate = String(pickScalarQueryValue(safeQuery.from_date) || '').trim();
  if (fromDate && !Number.isNaN(Date.parse(fromDate))) {
    filters.from_date = fromDate;
  }

  const toDate = String(pickScalarQueryValue(safeQuery.to_date) || '').trim();
  if (toDate && !Number.isNaN(Date.parse(toDate))) {
    filters.to_date = toDate;
  }

  return filters;
}

async function fetchLeadsWithOptionalGrade(leadsRepo, filters) {
  if (!filters.score_grade) {
    return leadsRepo.listLeads(filters);
  }

  const { page, limit, score_grade: scoreGrade, ...baseFilters } = filters;
  const firstResult = await leadsRepo.listLeads({ ...baseFilters, page: 1, limit: 100 });
  const collected = Array.isArray(firstResult?.items) ? [...firstResult.items] : [];

  const totalPages = Math.min(Math.max(1, Number(firstResult?.total_pages || 1)), 20);
  if (collected.length === 100 && totalPages > 1) {
    for (let p = 2; p <= totalPages; p += 1) {
      const nextResult = await leadsRepo.listLeads({ ...baseFilters, page: p, limit: 100 });
      if (Array.isArray(nextResult?.items) && nextResult.items.length > 0) {
        collected.push(...nextResult.items);
      } else {
        break;
      }
    }
  }

  const filtered = collected.filter(
    (item) => String(item?.score_grade || '').toUpperCase() === scoreGrade
  );
  const total = filtered.length;
  const computedTotalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;

  return {
    items: filtered.slice(start, start + limit),
    total,
    page,
    limit,
    total_pages: computedTotalPages
  };
}

function sanitizeCsvCell(value) {
  const raw = String(value ?? '');
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

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
      const filters = normalizeLeadsQuery(req.query, { defaultLimit: 25 });
      const result = await fetchLeadsWithOptionalGrade(leadsRepo, filters);
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
        const filters = normalizeLeadsQuery(req.query, { defaultLimit: 100 });
        const result = await fetchLeadsWithOptionalGrade(leadsRepo, filters);
        const items = Array.isArray(result?.items) ? result.items : [];
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
            .map(sanitizeCsvCell)
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
      const leadId = assertUuidParam(req.params.id, 'ID do lead');
      const lead = await leadsRepo.getLeadById(leadId);
      res.json({ lead });
    } catch (err) {
      next(err);
    }
  });

  // Atualizar propriedades do Lead
  router.patch('/leads/:id', validateBody(leadUpdateSchema), async (req, res, next) => {
    try {
      const leadId = assertUuidParam(req.params.id, 'ID do lead');
      const body = req.validatedBody;
      const leadPatch = {};
      if (body.priority !== undefined) leadPatch.priority = body.priority;
      if (body.qualification_status !== undefined) leadPatch.qualification_status = body.qualification_status;
      if (body.assigned_to !== undefined) leadPatch.assigned_to = body.assigned_to;
      if (body.desired_zip_prefix !== undefined) leadPatch.desired_zip_prefix = body.desired_zip_prefix;

      let updatedLead = await leadsRepo.getLeadById(leadId);
      if (Object.keys(leadPatch).length > 0) {
        updatedLead = await leadsRepo.updateLead(leadId, {
          ...leadPatch,
          last_activity_at: new Date().toISOString()
        });
      }

      if (body.next_follow_up_at !== undefined || body.estimated_value_cents !== undefined || body.assigned_to !== undefined) {
        const opp = await crmRepo.getOpenOpportunityByLead(leadId);
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
        entity_id: leadId,
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
      const leadId = assertUuidParam(req.params.id, 'ID do lead');
      const result = await crmService.evaluateLeadScorecard(
        leadId,
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
      const leadId = assertUuidParam(req.params.id, 'ID do lead');
      const activity = await crmService.logActivity(leadId, req.validatedBody, req.adminUser);
      res.status(201).json({ activity });
    } catch (err) {
      next(err);
    }
  });

  // Tarefas
  router.post('/leads/:id/tasks', validateBody(taskCreateSchema), async (req, res, next) => {
    try {
      const leadId = assertUuidParam(req.params.id, 'ID do lead');
      const task = await crmService.createTask(leadId, req.validatedBody, req.adminUser);
      res.status(201).json({ task });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/tasks/:taskId', validateBody(taskUpdateSchema), async (req, res, next) => {
    try {
      const taskId = assertUuidParam(req.params.taskId, 'ID da tarefa');
      const patch = { ...req.validatedBody };
      if (patch.status === 'completed') patch.completed_at = new Date().toISOString();
      const task = await crmRepo.updateTask(taskId, patch);
      res.json({ task });
    } catch (err) {
      next(err);
    }
  });

  // Reuniões
  router.post('/leads/:id/meetings', validateBody(meetingCreateSchema), async (req, res, next) => {
    try {
      const leadId = assertUuidParam(req.params.id, 'ID do lead');
      const meeting = await crmService.scheduleMeeting(leadId, req.validatedBody, req.adminUser);
      res.status(201).json({ meeting });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/meetings/:meetingId', validateBody(meetingUpdateSchema), async (req, res, next) => {
    try {
      const meetingId = assertUuidParam(req.params.meetingId, 'ID da reunião');
      const patch = { ...req.validatedBody };
      if (patch.status === 'completed') patch.completed_at = new Date().toISOString();
      const meeting = await crmRepo.updateMeeting(meetingId, patch);
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
      const oppId = assertUuidParam(req.params.id, 'ID da oportunidade');
      const updated = await crmService.moveOpportunityStage(
        oppId,
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
