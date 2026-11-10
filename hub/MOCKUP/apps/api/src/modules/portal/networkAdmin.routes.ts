import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbQuery, withTransaction } from '../../plugins/db.js';
import { supabaseAdmin } from '../../plugins/supabase.js';
import {
  requireNetworkOrFactoryScope,
  requirePermission,
  requirePortalAuth,
} from '../../middleware/portalAuth.js';
import { recordAuditLog } from '../../services/auditAndNotify.js';

export async function portalNetworkAdminRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/network-admin/overview (estritamente franqueadora / fábrica)
  fastify.get(
    '/overview',
    {
      preHandler: [
        requirePortalAuth,
        requireNetworkOrFactoryScope(['network', 'factory']),
        requirePermission('network:units_read'),
      ],
    },
    async (_request, reply) => {
      const [unitsRes, ordersSummaryRes, ticketsRes, bancaRes, logsRes, priceListsRes] = await Promise.all([
        dbQuery(
          `SELECT u.*,
                  ucc.config_status, ucc.commercial_modality, ucc.royalty_bps, ucc.marketing_fund_bps,
                  ucc.territory_rule_status, ucc.default_price_list_code, ucc.max_discount_bps,
                  (SELECT COUNT(*)::int FROM portal.orders o WHERE o.unit_id = u.id AND o.is_sandbox = FALSE AND o.commercial_status = 'confirmed') AS confirmed_orders_count,
                  (SELECT COALESCE(SUM(o.total_cents), 0)::text FROM portal.orders o WHERE o.unit_id = u.id AND o.is_sandbox = FALSE AND o.commercial_status = 'confirmed') AS confirmed_orders_cents,
                  (SELECT COUNT(*)::int FROM portal.unit_memberships um WHERE um.unit_id = u.id AND um.status = 'active') AS users_count
           FROM portal.units u
           LEFT JOIN portal.unit_commercial_configs ucc ON ucc.unit_id = u.id
           ORDER BY (u.unit_type = 'headquarters') DESC, u.created_at ASC`
        ),
        dbQuery(
          `SELECT production_status, COUNT(*)::int AS cnt
           FROM portal.orders
           WHERE is_sandbox = FALSE AND commercial_status = 'confirmed'
           GROUP BY production_status`
        ),
        dbQuery(
          `SELECT COUNT(*) FILTER (WHERE status IN ('open', 'in_progress', 'waiting_unit'))::int AS open_tickets
           FROM portal.support_tickets WHERE is_sandbox = FALSE`
        ),
        dbQuery(
          `SELECT be.*, u.code AS unit_code, u.name AS unit_name, p.full_name AS student_name
           FROM portal.banca_evaluations be
           JOIN portal.units u ON u.id = be.unit_id
           JOIN portal.profiles p ON p.id = be.user_id
           ORDER BY (be.status = 'submitted') DESC, be.updated_at DESC
           LIMIT 20`
        ),
        dbQuery(
          `SELECT al.*, u.code AS unit_code
           FROM portal.audit_logs al
           LEFT JOIN portal.units u ON u.id = al.unit_id
           ORDER BY al.created_at DESC
           LIMIT 50`
        ),
        dbQuery(`SELECT * FROM portal.price_lists ORDER BY valid_from DESC`),
      ]);

      return reply.send({
        units: unitsRes.rows,
        productionSummary: ordersSummaryRes.rows,
        openNetworkTickets: ticketsRes.rows[0]?.open_tickets || 0,
        bancaQueue: bancaRes.rows,
        auditLogs: logsRes.rows,
        priceLists: priceListsRes.rows,
      });
    }
  );

  // PATCH /api/v1/network-admin/units/:id/enablement
  fastify.patch(
    '/units/:id/enablement',
    {
      preHandler: [
        requirePortalAuth,
        requireNetworkOrFactoryScope(['network']),
        requirePermission('network:admin'),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!z.string().uuid().safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de unidade inválido.' });
      }
      const schema = z.object({
        operationalStatus: z.enum(['onboarding', 'pending_approval', 'active', 'restricted', 'suspended']).optional(),
        trainingCompleted: z.boolean().optional(),
        bancaApproved: z.boolean().optional(),
        implantationApproved: z.boolean().optional(),
        implantationNotes: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const d = parsed.data;
      const unitExists = await dbQuery<{ id: string }>(`SELECT id FROM portal.units WHERE id = $1`, [id]);
      if (!unitExists.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Unidade não encontrada.' });
      }
      const up = await dbQuery(
        `UPDATE portal.units SET
           operational_status = COALESCE($1, operational_status),
           training_completed = COALESCE($2, training_completed),
           banca_approved = COALESCE($3, banca_approved),
           implantation_approved = COALESCE($4, implantation_approved),
           implantation_notes = COALESCE($5, implantation_notes),
           updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [
          d.operationalStatus ?? null,
          d.trainingCompleted ?? null,
          d.bancaApproved ?? null,
          d.implantationApproved ?? null,
          d.implantationNotes ?? null,
          id,
        ]
      );
      if (!up.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Unidade não encontrada.' });
      }
      await recordAuditLog({
        unitId: id,
        action: 'network.unit_enablement_updated',
        entityType: 'unit',
        entityId: id,
        afterState: d,
        request,
      });
      return reply.send({ unit: up.rows[0] });
    }
  );

  // PATCH /api/v1/network-admin/units/:id/commercial-config
  fastify.patch(
    '/units/:id/commercial-config',
    {
      preHandler: [
        requirePortalAuth,
        requireNetworkOrFactoryScope(['network']),
        requirePermission('network:admin'),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!z.string().uuid().safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de unidade inválido.' });
      }
      const schema = z.object({
        configStatus: z.enum(['not_configured', 'pending_approval', 'approved']),
        commercialModality: z.enum(['pending_definition', 'revenda', 'intermediacao']),
        royaltyBps: z.number().int().min(0).max(10000).nullable().optional(),
        marketingFundBps: z.number().int().min(0).max(10000).nullable().optional(),
        factoryTransferBps: z.number().int().min(0).max(10000).nullable().optional(),
        defaultPriceListCode: z.string().optional().nullable(),
        maxDiscountBps: z.number().int().min(0).max(5000).default(500),
        territoryRuleStatus: z
          .enum(['not_configured', 'pending_contract_definition', 'configured_non_exclusive', 'configured_priority'])
          .optional(),
        territoryNotes: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const d = parsed.data;
      const unitExists = await dbQuery<{ id: string }>(`SELECT id FROM portal.units WHERE id = $1`, [id]);
      if (!unitExists.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Unidade não encontrada.' });
      }
      const up = await dbQuery(
        `INSERT INTO portal.unit_commercial_configs (
           unit_id, config_status, commercial_modality, royalty_bps, marketing_fund_bps,
           factory_transfer_bps, default_price_list_code, max_discount_bps,
           territory_rule_status, territory_notes, notes, approved_by, approved_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
           CASE WHEN $2 = 'approved' THEN $12 ELSE NULL END,
           CASE WHEN $2 = 'approved' THEN NOW() ELSE NULL END
         )
         ON CONFLICT (unit_id) DO UPDATE SET
           config_status = EXCLUDED.config_status,
           commercial_modality = EXCLUDED.commercial_modality,
           royalty_bps = EXCLUDED.royalty_bps,
           marketing_fund_bps = EXCLUDED.marketing_fund_bps,
           factory_transfer_bps = EXCLUDED.factory_transfer_bps,
           default_price_list_code = EXCLUDED.default_price_list_code,
           max_discount_bps = EXCLUDED.max_discount_bps,
           territory_rule_status = COALESCE(EXCLUDED.territory_rule_status, portal.unit_commercial_configs.territory_rule_status),
           territory_notes = COALESCE(EXCLUDED.territory_notes, portal.unit_commercial_configs.territory_notes),
           notes = COALESCE(EXCLUDED.notes, portal.unit_commercial_configs.notes),
           approved_by = CASE WHEN EXCLUDED.config_status = 'approved' THEN $12 ELSE portal.unit_commercial_configs.approved_by END,
           approved_at = CASE WHEN EXCLUDED.config_status = 'approved' THEN NOW() ELSE portal.unit_commercial_configs.approved_at END,
           updated_at = NOW()
         RETURNING *`,
        [
          id,
          d.configStatus,
          d.commercialModality,
          d.royaltyBps ?? null,
          d.marketingFundBps ?? null,
          d.factoryTransferBps ?? null,
          d.defaultPriceListCode || null,
          d.maxDiscountBps,
          d.territoryRuleStatus || 'not_configured',
          d.territoryNotes || null,
          d.notes || null,
          request.portal!.userId,
        ]
      );
      await recordAuditLog({
        unitId: id,
        action: 'network.commercial_config_updated',
        entityType: 'unit_commercial_config',
        entityId: id,
        afterState: up.rows[0],
        request,
      });
      return reply.send({ commercialConfig: up.rows[0] });
    }
  );

  // POST /api/v1/network-admin/units (cria nova unidade com taxa inicial R$ 20k definida contratualmente e config comercial pendente)
  fastify.post(
    '/units',
    {
      preHandler: [
        requirePortalAuth,
        requireNetworkOrFactoryScope(['network']),
        requirePermission('network:admin'),
      ],
    },
    async (request, reply) => {
      const schema = z.object({
        code: z.string().min(3).max(32),
        name: z.string().min(3),
        city: z.string().min(2),
        state: z.string().length(2),
        cnpj: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const d = parsed.data;
      let unit;
      try {
        unit = await withTransaction(async (client) => {
          const res = await client.query<{ id: string }>(
            `INSERT INTO portal.units (code, name, city, state, cnpj, unit_type, operational_status)
             VALUES ($1,$2,$3,$4,$5,'franchise','onboarding') RETURNING *`,
            [d.code.trim().toUpperCase(), d.name.trim(), d.city.trim(), d.state.toUpperCase(), d.cnpj || null]
          );
          await client.query(
            `INSERT INTO portal.unit_commercial_configs (unit_id, config_status, commercial_modality)
             VALUES ($1,'not_configured','pending_definition')`,
            [res.rows[0].id]
          );
          await recordAuditLog(
            {
              unitId: res.rows[0].id,
              action: 'network.unit_created',
              entityType: 'unit',
              entityId: res.rows[0].id,
              afterState: res.rows[0],
              request,
            },
            client
          );
          return res.rows[0];
        });
      } catch (err) {
        const pgErr = err as { code?: string };
        if (pgErr?.code === '23505') {
          return reply.status(409).send({
            statusCode: 409,
            code: 'UNIT_CODE_DUPLICATE',
            message: 'Código de unidade já cadastrado.',
          });
        }
        throw err;
      }
      return reply.status(201).send({ unit });
    }
  );

  // POST /api/v1/network-admin/announcements
  fastify.post(
    '/announcements',
    {
      preHandler: [
        requirePortalAuth,
        requireNetworkOrFactoryScope(['network']),
        requirePermission('network:admin'),
      ],
    },
    async (request, reply) => {
      const schema = z.object({
        title: z.string().min(3),
        body: z.string().min(6),
        category: z.enum(['geral', 'operacional', 'treinamento', 'comercial', 'compliance']).default('operacional'),
        isPinned: z.boolean().default(false),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const ins = await dbQuery(
        `INSERT INTO portal.announcements (title, body, category, is_pinned, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          parsed.data.title.trim(),
          parsed.data.body.trim(),
          parsed.data.category,
          parsed.data.isPinned,
          request.portal!.userId,
        ]
      );
      return reply.status(201).send({ announcement: ins.rows[0] });
    }
  );

  // GET /api/v1/network-admin/users & POST /api/v1/network-admin/users (gestão real de usuários Supabase + vínculo)
  fastify.get(
    '/users',
    {
      preHandler: [
        requirePortalAuth,
        requireNetworkOrFactoryScope(['network']),
        requirePermission('network:admin'),
      ],
    },
    async (_request, reply) => {
      const rows = await dbQuery(
        `SELECT p.id, p.full_name, p.email, p.phone, p.is_active, p.last_seen_at,
                COALESCE(
                  (SELECT json_agg(json_build_object(
                    'unitId', um.unit_id,
                    'unitCode', u.code,
                    'unitName', u.name,
                    'roleSlug', um.role_slug,
                    'status', um.status,
                    'isPrimary', um.is_primary
                  ))
                   FROM portal.unit_memberships um
                   JOIN portal.units u ON u.id = um.unit_id
                   WHERE um.user_id = p.id),
                  '[]'::json
                ) AS memberships
         FROM portal.profiles p
         ORDER BY p.created_at DESC`
      );
      return reply.send({ users: rows.rows });
    }
  );

  fastify.post(
    '/users',
    {
      preHandler: [
        requirePortalAuth,
        requireNetworkOrFactoryScope(['network']),
        requirePermission('network:admin'),
      ],
    },
    async (request, reply) => {
      const schema = z.object({
        fullName: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(8),
        unitId: z.string().uuid(),
        roleSlug: z.enum(['franqueado', 'admin']),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const d = parsed.data;
      const emailLower = d.email.trim().toLowerCase();

      const unitRes = await dbQuery<{ id: string }>(`SELECT id FROM portal.units WHERE id = $1`, [d.unitId]);
      if (!unitRes.rows[0]) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'UNIT_NOT_FOUND',
          message: 'Unidade selecionada não encontrada.',
        });
      }

      const { data: createdAuth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: emailLower,
        password: d.password,
        email_confirm: true,
        user_metadata: { full_name: d.fullName.trim() },
      });
      if (authErr || !createdAuth.user) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'AUTH_CREATE_FAILED',
          message: authErr?.message || 'Erro ao criar usuário no Supabase Auth.',
        });
      }

      try {
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO portal.profiles (id, full_name, email, default_unit_id, is_active)
             VALUES ($1,$2,$3,$4,TRUE)`,
            [createdAuth.user.id, d.fullName.trim(), emailLower, d.unitId]
          );
          await client.query(
            `INSERT INTO portal.unit_memberships (user_id, unit_id, role_slug, status, is_primary)
             VALUES ($1,$2,$3,'active',TRUE)`,
            [createdAuth.user.id, d.unitId, d.roleSlug]
          );
          await recordAuditLog(
            {
              unitId: d.unitId,
              action: 'network.user_provisioned',
              entityType: 'profile',
              entityId: createdAuth.user.id,
              afterState: { email: emailLower, roleSlug: d.roleSlug, unitId: d.unitId },
              request,
            },
            client
          );
        });
      } catch (err) {
        await supabaseAdmin.auth.admin.deleteUser(createdAuth.user.id).catch(() => undefined);
        throw err;
      }

      return reply.status(201).send({ userId: createdAuth.user.id, email: emailLower });
    }
  );
}
