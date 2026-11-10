import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbQuery, withTransaction } from '../../plugins/db.js';
import {
  assertUnitOwnership,
  requireAnyPermission,
  requirePermission,
  requirePortalAuth,
} from '../../middleware/portalAuth.js';
import { recordAuditLog } from '../../services/auditAndNotify.js';
import {
  createAuthorizedSignedUrl,
  parseDataUrlToBuffer,
  uploadPrivatePortalFile,
} from '../../services/storageService.js';

const uuidSchema = z.string().uuid();

export async function portalSandboxRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/sandbox/overview
  fastify.get(
    '/overview',
    { preHandler: [requirePortalAuth, requireAnyPermission(['sandbox:access', 'sandbox:review'])] },
    async (request, reply) => {
      const ctx = request.portal!;
      const [custCnt, oppCnt, quoteCnt, artCnt, orderCnt, evalsRes] = await Promise.all([
        dbQuery<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM portal.customers WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]),
        dbQuery<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM portal.opportunities WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]),
        dbQuery<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM portal.quotes WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]),
        dbQuery<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM portal.art_projects WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]),
        dbQuery<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM portal.orders WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]),
        dbQuery(
          `SELECT be.*, u.code AS unit_code, u.name AS unit_name, p.full_name AS student_name,
                  ev.full_name AS evaluator_name
           FROM portal.banca_evaluations be
           JOIN portal.units u ON u.id = be.unit_id
           JOIN portal.profiles p ON p.id = be.user_id
           LEFT JOIN portal.profiles ev ON ev.id = be.evaluator_user_id
           WHERE be.unit_id = $1
           ORDER BY be.updated_at DESC`,
          [ctx.activeUnitId]
        ),
      ]);

      return reply.send({
        isolationNotice:
          'Ambiente Sandbox isolado (is_sandbox = TRUE). Oportunidades, orçamentos, artes, pedidos e simulações feitas aqui NÃO alteram indicadores reais nem enviam produção à fábrica.',
        counts: {
          customers: Number(custCnt.rows[0]?.cnt || 0),
          opportunities: Number(oppCnt.rows[0]?.cnt || 0),
          quotes: Number(quoteCnt.rows[0]?.cnt || 0),
          artProjects: Number(artCnt.rows[0]?.cnt || 0),
          orders: Number(orderCnt.rows[0]?.cnt || 0),
        },
        bancaEvaluations: evalsRes.rows,
      });
    }
  );

  // POST /api/v1/sandbox/reset (limpa SOMENTE registros is_sandbox = TRUE da unidade ativa)
  fastify.post(
    '/reset',
    { preHandler: [requirePortalAuth, requirePermission('sandbox:access')] },
    async (request, reply) => {
      const ctx = request.portal!;
      await withTransaction(async (client) => {
        await client.query(`DELETE FROM portal.payment_transactions WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.receivables WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.expenses WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.shipments WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.production_events WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.schedule_events WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.orders WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.art_projects WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.quotes WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.crm_activities WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.opportunities WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.tasks WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.support_tickets WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
        await client.query(`DELETE FROM portal.customers WHERE unit_id = $1 AND is_sandbox = TRUE`, [ctx.activeUnitId]);
      });

      await recordAuditLog({
        unitId: ctx.activeUnitId,
        action: 'sandbox.reset',
        entityType: 'sandbox',
        entityId: ctx.activeUnitId,
        request,
      });

      return reply.send({ success: true });
    }
  );

  // POST /api/v1/sandbox/seed-case (cria caso fictício isolado em sandbox para treino completo)
  fastify.post(
    '/seed-case',
    { preHandler: [requirePortalAuth, requirePermission('sandbox:access')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const created = await withTransaction(async (client) => {
        const custRes = await client.query<{ id: string }>(
          `INSERT INTO portal.customers (
             unit_id, name, customer_type, segment, city, state, origin, owner_user_id, notes, is_sandbox, created_by
           ) VALUES ($1,'Atlética Engenharia Fictícia (Sandbox)','atletica','Universitário','Campinas','SP','Treinamento Banca',$2,'Caso prático isolado para simulação.',TRUE,$2)
           RETURNING id`,
          [ctx.activeUnitId, ctx.userId]
        );
        const custId = custRes.rows[0].id;

        const oppRes = await client.query<{ id: string }>(
          `INSERT INTO portal.opportunities (
             unit_id, customer_id, title, stage, status, segment, city, state, origin,
             estimated_value_cents, products_of_interest, next_action, next_action_at, owner_user_id, is_sandbox, created_by
           ) VALUES ($1,$2,'Jogo de 35 Kits InterEng (Sandbox)','orcamento','open','Universitário','Campinas','SP','Treinamento Banca',346150,'["Authentic","College"]'::jsonb,'Enviar prévia 3D + orçamento comercial',NOW() + INTERVAL '1 day',$3,TRUE,$3)
           RETURNING id`,
          [ctx.activeUnitId, custId, ctx.userId]
        );

        return { customerId: custId, opportunityId: oppRes.rows[0].id };
      });

      return reply.status(201).send({ created });
    }
  );

  // POST /api/v1/sandbox/banca/submit (envia checklist + gravação de pitch para avaliação da banca)
  fastify.post(
    '/banca/submit',
    { preHandler: [requirePortalAuth, requirePermission('sandbox:access')] },
    async (request, reply) => {
      const schema = z.object({
        caseTitle: z.string().min(3),
        exerciseChecks: z.record(z.boolean()).default({}),
        submissionNotes: z.string().optional().nullable(),
        videoFile: z.object({ fileName: z.string(), dataUrl: z.string() }).optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const ctx = request.portal!;
      const d = parsed.data;

      let storedVideo: { storagePath: string; fileName: string } | null = null;
      if (d.videoFile?.dataUrl) {
        const decoded = parseDataUrlToBuffer(d.videoFile.dataUrl);
        if (!decoded) {
          return reply.status(400).send({ statusCode: 400, code: 'INVALID_VIDEO', message: 'Vídeo inválido.' });
        }
        const stored = await uploadPrivatePortalFile({
          bucket: 'portal-sandbox',
          unitId: ctx.activeUnitId,
          folder: 'banca-videos',
          fileName: d.videoFile.fileName,
          mimeType: decoded.mimeType,
          buffer: decoded.buffer,
        });
        storedVideo = { storagePath: stored.storagePath, fileName: stored.fileName };
      }

      const ins = await dbQuery(
        `INSERT INTO portal.banca_evaluations (
           unit_id, user_id, case_title, exercise_checks, submission_notes,
           video_storage_path, video_file_name, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'submitted') RETURNING *`,
        [
          ctx.activeUnitId,
          ctx.userId,
          d.caseTitle.trim(),
          JSON.stringify(d.exerciseChecks),
          d.submissionNotes?.trim() || null,
          storedVideo?.storagePath || null,
          storedVideo?.fileName || null,
        ]
      );

      await recordAuditLog({
        unitId: ctx.activeUnitId,
        action: 'banca.submitted',
        entityType: 'banca_evaluation',
        entityId: ins.rows[0].id,
        request,
      });

      return reply.status(201).send({ evaluation: ins.rows[0] });
    }
  );

  // GET /api/v1/sandbox/banca/:id/video-url
  fastify.get(
    '/banca/:id/video-url',
    { preHandler: [requirePortalAuth, requireAnyPermission(['sandbox:access', 'sandbox:review'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!z.string().uuid().safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID inválido.' });
      }
      const res = await dbQuery<{ unit_id: string; video_storage_path: string | null }>(
        `SELECT unit_id, video_storage_path FROM portal.banca_evaluations WHERE id = $1`,
        [id]
      );
      if (!res.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Avaliação não encontrada.' });
      }
      if (!assertUnitOwnership(request, reply, res.rows[0].unit_id)) return;
      if (!res.rows[0].video_storage_path) {
        return reply.status(404).send({ statusCode: 404, code: 'NO_VIDEO', message: 'Avaliação sem vídeo gravado.' });
      }
      const signedUrl = await createAuthorizedSignedUrl({
        bucket: 'portal-sandbox',
        storagePath: res.rows[0].video_storage_path,
        authorizedUnitId: res.rows[0].unit_id,
        allowNetworkScope: request.portal!.activeScope !== 'unit',
      });
      return reply.send({ signedUrl });
    }
  );

  // POST /api/v1/sandbox/banca/:id/evaluate (exclusivo suporte_franqueadora / admin_rede)
  fastify.post(
    '/banca/:id/evaluate',
    { preHandler: [requirePortalAuth, requirePermission('sandbox:review')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID da banca inválido.' });
      }
      const schema = z.object({
        salesScore: z.number().min(0).max(10),
        artScore: z.number().min(0).max(10),
        complianceOk: z.boolean(),
        decision: z.enum(['approved', 'retry_required']),
        evaluatorNotes: z.string().min(3),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const d = parsed.data;
      const finalScore = Number(((d.salesScore + d.artScore) / 2).toFixed(2));

      const evalRes = await withTransaction(async (client) => {
        const up = await client.query<{ unit_id: string }>(
          `UPDATE portal.banca_evaluations SET
             sales_score = $1,
             art_score = $2,
             compliance_ok = $3,
             final_score = $4,
             status = $5,
             evaluator_user_id = $6,
             evaluator_notes = $7,
             evaluated_at = NOW(),
             updated_at = NOW()
           WHERE id = $8 RETURNING *`,
          [d.salesScore, d.artScore, d.complianceOk, finalScore, d.decision, request.portal!.userId, d.evaluatorNotes.trim(), id]
        );
        if (!up.rows[0]) return null;

        if (d.decision === 'approved') {
          await client.query(`UPDATE portal.units SET banca_approved = TRUE, updated_at = NOW() WHERE id = $1`, [
            up.rows[0].unit_id,
          ]);
        }
        return up.rows[0];
      });

      if (!evalRes) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Submissão não encontrada.' });
      }
      return reply.send({ evaluation: evalRes });
    }
  );
}
