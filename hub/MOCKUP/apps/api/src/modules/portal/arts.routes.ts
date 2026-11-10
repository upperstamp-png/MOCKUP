import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbQuery, withTransaction } from '../../plugins/db.js';
import {
  assertUnitOwnership,
  requireAnyPermission,
  requirePermission,
  requirePortalAuth,
} from '../../middleware/portalAuth.js';
import {
  createAuthorizedSignedUrl,
  parseDataUrlToBuffer,
  PortalBucket,
  uploadPrivatePortalFile,
} from '../../services/storageService.js';
import { notifyUnitRoles, recordAuditLog } from '../../services/auditAndNotify.js';

const createProjectSchema = z.object({
  customerId: z.string().uuid(),
  opportunityId: z.string().uuid().optional().nullable(),
  quoteId: z.string().uuid().optional().nullable(),
  title: z.string().min(2),
  briefing: z.string().default(''),
  assigneeUserId: z.string().uuid().optional().nullable(),
  isSandbox: z.boolean().optional().default(false),
});

const uploadVersionSchema = z.object({
  artifactKind: z.enum(['mockup_ilustrativo', 'arte_revisao', 'arquivo_producao_rip']).default('arte_revisao'),
  fileName: z.string().min(2),
  mimeType: z.string().optional(),
  dataUrl: z.string().optional(),
  previewSummary: z.string().optional().nullable(),
  layerState: z.record(z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function portalArtsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/arts
  fastify.get(
    '/',
    { preHandler: [requirePortalAuth, requirePermission('arts:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as { status?: string; search?: string; sandbox?: string };
      const isSandbox = q.sandbox === 'true';

      const conditions = [`ap.unit_id = $1`, `ap.is_sandbox = $2`];
      const params: unknown[] = [ctx.activeUnitId, isSandbox];
      let idx = 3;

      if (q.status && q.status !== 'todos') {
        conditions.push(`ap.status = $${idx}`);
        params.push(q.status);
        idx++;
      }
      if (q.search?.trim()) {
        conditions.push(`(LOWER(ap.title) LIKE $${idx} OR LOWER(c.name) LIKE $${idx})`);
        params.push(`%${q.search.trim().toLowerCase()}%`);
        idx++;
      }

      const rows = await dbQuery(
        `SELECT ap.*,
                c.name AS customer_name,
                p.full_name AS assignee_name,
                cv.version_number AS current_version_number,
                cv.artifact_kind AS current_artifact_kind,
                av.version_number AS approved_version_number,
                av.artifact_kind AS approved_artifact_kind,
                (SELECT COUNT(*)::int FROM portal.art_versions ver WHERE ver.art_project_id = ap.id) AS versions_count,
                (SELECT COUNT(*)::int FROM portal.art_comments ac WHERE ac.art_project_id = ap.id) AS comments_count
         FROM portal.art_projects ap
         JOIN portal.customers c ON c.id = ap.customer_id
         LEFT JOIN portal.profiles p ON p.id = ap.assignee_user_id
         LEFT JOIN portal.art_versions cv ON cv.id = ap.current_version_id
         LEFT JOIN portal.art_versions av ON av.id = ap.approved_version_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY ap.updated_at DESC`,
        params
      );

      return reply.send({ items: rows.rows });
    }
  );

  // GET /api/v1/arts/:id (detalhe com versões imutáveis, comentários e registro de aprovações)
  fastify.get(
    '/:id',
    { preHandler: [requirePortalAuth, requirePermission('arts:read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const projRes = await dbQuery(
        `SELECT ap.*, c.name AS customer_name, p.full_name AS assignee_name
         FROM portal.art_projects ap
         JOIN portal.customers c ON c.id = ap.customer_id
         LEFT JOIN portal.profiles p ON p.id = ap.assignee_user_id
         WHERE ap.id = $1`,
        [id]
      );
      const project = projRes.rows[0];
      if (!project) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Projeto de arte não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, project.unit_id)) return;

      const [versionsRes, commentsRes, approvalsRes] = await Promise.all([
        dbQuery(
          `SELECT av.*, p.full_name AS created_by_name
           FROM portal.art_versions av
           LEFT JOIN portal.profiles p ON p.id = av.created_by
           WHERE av.art_project_id = $1
           ORDER BY av.version_number DESC`,
          [id]
        ),
        dbQuery(
          `SELECT ac.* FROM portal.art_comments ac
           WHERE ac.art_project_id = $1 ORDER BY ac.created_at ASC`,
          [id]
        ),
        dbQuery(
          `SELECT apv.*, av.version_number
           FROM portal.approvals apv
           LEFT JOIN portal.art_versions av ON av.id = apv.art_version_id
           WHERE apv.art_project_id = $1
           ORDER BY apv.approved_at DESC`,
          [id]
        ),
      ]);

      return reply.send({
        project,
        versions: versionsRes.rows,
        comments: commentsRes.rows,
        approvals: approvalsRes.rows,
      });
    }
  );

  // POST /api/v1/arts
  fastify.post(
    '/',
    { preHandler: [requirePortalAuth, requirePermission('arts:write')] },
    async (request, reply) => {
      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const ctx = request.portal!;
      const d = parsed.data;

      const custRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.customers WHERE id = $1`, [
        d.customerId,
      ]);
      if (!custRes.rows[0] || custRes.rows[0].unit_id !== ctx.activeUnitId) {
        return reply.status(403).send({ statusCode: 403, code: 'CUSTOMER_UNIT_MISMATCH', message: 'Cliente pertence a outra unidade.' });
      }

      const inserted = await dbQuery(
        `INSERT INTO portal.art_projects (
           unit_id, customer_id, opportunity_id, quote_id, title, briefing,
           status, assignee_user_id, is_sandbox, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          ctx.activeUnitId,
          d.customerId,
          d.opportunityId || null,
          d.quoteId || null,
          d.title.trim(),
          d.briefing.trim(),
          d.briefing.trim() ? 'em_criacao' : 'briefing_pendente',
          d.assigneeUserId || ctx.userId,
          d.isSandbox,
          ctx.userId,
        ]
      );

      await recordAuditLog({
        unitId: ctx.activeUnitId,
        action: 'art_project.created',
        entityType: 'art_project',
        entityId: inserted.rows[0].id,
        afterState: inserted.rows[0],
        request,
      });

      return reply.status(201).send({ project: inserted.rows[0] });
    }
  );

  // POST /api/v1/arts/:id/versions (cria nova versão imutável e invalida aprovações anteriores!)
  fastify.post(
    '/:id/versions',
    { preHandler: [requirePortalAuth, requirePermission('arts:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const projRes = await dbQuery<{
        id: string;
        unit_id: string;
        status: string;
        approved_version_id: string | null;
        is_sandbox: boolean;
      }>(`SELECT id, unit_id, status, approved_version_id, is_sandbox FROM portal.art_projects WHERE id = $1`, [id]);

      const project = projRes.rows[0];
      if (!project) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Projeto de arte não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, project.unit_id)) return;

      let uploadInput: z.infer<typeof uploadVersionSchema>;
      let fileBuffer: Buffer | null = null;
      let resolvedMime = 'image/png';

      if (request.isMultipart()) {
        const part = await request.file();
        if (!part) {
          return reply.status(400).send({ statusCode: 400, code: 'FILE_REQUIRED', message: 'Arquivo ausente.' });
        }
        fileBuffer = await part.toBuffer();
        resolvedMime = part.mimetype;
        const fields = part.fields as Record<string, { value?: string }>;
        uploadInput = uploadVersionSchema.parse({
          artifactKind: fields.artifactKind?.value || 'arte_revisao',
          fileName: part.filename,
          mimeType: part.mimetype,
          previewSummary: fields.previewSummary?.value || null,
          notes: fields.notes?.value || null,
        });
      } else {
        const parsed = uploadVersionSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
        }
        uploadInput = parsed.data;
        if (uploadInput.dataUrl) {
          const decoded = parseDataUrlToBuffer(uploadInput.dataUrl);
          if (!decoded) {
            return reply.status(400).send({ statusCode: 400, code: 'INVALID_DATA_URL', message: 'Arquivo codificado inválido.' });
          }
          fileBuffer = decoded.buffer;
          resolvedMime = decoded.mimeType;
        }
      }

      let stored: { storageBucket: PortalBucket; storagePath: string; fileName: string; mimeType: string } | null = null;
      if (fileBuffer) {
        const bucket: PortalBucket = project.is_sandbox ? 'portal-sandbox' : 'portal-art-files';
        stored = await uploadPrivatePortalFile({
          bucket,
          unitId: project.unit_id,
          folder: `arts/${id}`,
          fileName: uploadInput.fileName,
          mimeType: uploadInput.mimeType || resolvedMime,
          buffer: fileBuffer,
        });
      }

      const result = await withTransaction(async (client) => {
        const maxVerRes = await client.query<{ max_ver: number }>(
          `SELECT COALESCE(MAX(version_number), 0)::int AS max_ver FROM portal.art_versions WHERE art_project_id = $1`,
          [id]
        );
        const nextVersionNumber = (maxVerRes.rows[0]?.max_ver || 0) + 1;

        const verRes = await client.query<{ id: string }>(
          `INSERT INTO portal.art_versions (
             art_project_id, unit_id, version_number, artifact_kind, storage_bucket, storage_path,
             file_name, mime_type, preview_summary, layer_state, notes, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING *`,
          [
            id,
            project.unit_id,
            nextVersionNumber,
            uploadInput.artifactKind,
            stored?.storageBucket || null,
            stored?.storagePath || null,
            stored?.fileName || uploadInput.fileName,
            stored?.mimeType || uploadInput.mimeType || null,
            uploadInput.previewSummary || null,
            uploadInput.layerState ? JSON.stringify(uploadInput.layerState) : null,
            uploadInput.notes || null,
            request.portal!.userId,
          ]
        );
        const newVer = verRes.rows[0];

        // Se havia aprovação ativa anterior, invalida por substituição e trava pedidos vinculados que não estavam finalizados!
        const supersededRes = await client.query(
          `UPDATE portal.approvals
           SET status = 'superseded', superseded_by_version_id = $1, superseded_at = NOW()
           WHERE art_project_id = $2 AND entity_type = 'art_version' AND status = 'active'
           RETURNING id`,
          [newVer.id, id]
        );

        await client.query(
          `UPDATE portal.art_projects
           SET current_version_id = $1,
               approved_version_id = NULL,
               status = 'revisao_interna',
               updated_at = NOW()
           WHERE id = $2`,
          [newVer.id, id]
        );

        if ((supersededRes.rowCount ?? 0) > 0) {
          await client.query(
            `UPDATE portal.orders
             SET approval_status = 'revision_required',
                 production_released = CASE WHEN production_status IN ('not_released','blocked') THEN FALSE ELSE production_released END,
                 release_block_reasons = jsonb_build_array('Nova versão de arte publicada — necessária nova aprovação vinculada à v' || $1::text),
                 updated_at = NOW()
             WHERE art_project_id = $2
               AND commercial_status <> 'canceled'
               AND production_status IN ('not_released', 'blocked', 'queued_pcp')`,
            [nextVersionNumber, id]
          );
        }

        await recordAuditLog(
          {
            unitId: project.unit_id,
            action: 'art_version.created',
            entityType: 'art_version',
            entityId: newVer.id,
            afterState: { versionNumber: nextVersionNumber, invalidatedPreviousApprovals: supersededRes.rowCount || 0 },
            request,
          },
          client
        );

        return { version: newVer, invalidatedApprovals: supersededRes.rowCount || 0 };
      });

      return reply.status(201).send(result);
    }
  );

  // GET /api/v1/arts/:id/versions/:versionId/download (URL assinada após validação estrita)
  fastify.get(
    '/:id/versions/:versionId/download',
    { preHandler: [requirePortalAuth, requirePermission('arts:read')] },
    async (request, reply) => {
      const { id, versionId } = request.params as { id: string; versionId: string };
      const verRes = await dbQuery<{
        unit_id: string;
        storage_bucket: string | null;
        storage_path: string | null;
        file_name: string;
      }>(
        `SELECT unit_id, storage_bucket, storage_path, file_name
         FROM portal.art_versions
         WHERE id = $1 AND art_project_id = $2`,
        [versionId, id]
      );
      const ver = verRes.rows[0];
      if (!ver) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Versão de arte não encontrada.' });
      }
      if (!assertUnitOwnership(request, reply, ver.unit_id)) return;

      if (!ver.storage_bucket || !ver.storage_path) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'NO_FILE_ATTACHED',
          message: 'Esta versão foi registrada sem arquivo binário anexado.',
        });
      }

      const ctx = request.portal!;
      const signedUrl = await createAuthorizedSignedUrl({
        bucket: ver.storage_bucket as PortalBucket,
        storagePath: ver.storage_path,
        authorizedUnitId: ver.unit_id,
        allowNetworkScope: ctx.activeScope === 'network' || ctx.activeScope === 'factory',
        expiresInSeconds: 300,
      });

      return reply.send({ signedUrl, fileName: ver.file_name, expiresInSeconds: 300 });
    }
  );

  // POST /api/v1/arts/:id/comments (enviar para revisão / comentários / solicitar ajustes invalida aprovação vigente)
  fastify.post(
    '/:id/comments',
    { preHandler: [requirePortalAuth, requireAnyPermission(['arts:write', 'arts:review_internal', 'arts:approve'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        artVersionId: z.string().uuid().optional().nullable(),
        commentType: z.enum(['comment', 'revision_request', 'internal_review']).default('comment'),
        body: z.string().min(2),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const projRes = await dbQuery<{ unit_id: string; title: string; status: string }>(
        `SELECT unit_id, title, status FROM portal.art_projects WHERE id = $1`,
        [id]
      );
      const project = projRes.rows[0];
      if (!project) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Projeto não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, project.unit_id)) return;

      const ctx = request.portal!;
      const d = parsed.data;

      const result = await withTransaction(async (client) => {
        const cRes = await client.query(
          `INSERT INTO portal.art_comments (
             art_project_id, art_version_id, unit_id, author_user_id, author_name, comment_type, body
           ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [id, d.artVersionId || null, project.unit_id, ctx.userId, ctx.fullName, d.commentType, d.body.trim()]
        );

        let invalidatedApprovals = 0;
        if (d.commentType === 'revision_request') {
          const revRes = await client.query(
            `UPDATE portal.approvals
             SET status = 'revoked', superseded_at = NOW()
             WHERE art_project_id = $1 AND entity_type = 'art_version' AND status = 'active'
             RETURNING id`,
            [id]
          );
          invalidatedApprovals = revRes.rowCount || 0;

          await client.query(
            `UPDATE portal.art_projects
             SET status = 'ajustes', approved_version_id = NULL, updated_at = NOW()
             WHERE id = $1`,
            [id]
          );

          await client.query(
            `UPDATE portal.orders
             SET approval_status = 'revision_required',
                 release_block_reasons = jsonb_build_array('Arte devolvida para ajustes — aprovação anterior revogada'),
                 updated_at = NOW()
             WHERE art_project_id = $1 AND commercial_status <> 'canceled'`,
            [id]
          );
        }

        await recordAuditLog(
          {
            unitId: project.unit_id,
            action: d.commentType === 'revision_request' ? 'art_project.revision_requested' : 'art_project.commented',
            entityType: 'art_project',
            entityId: id,
            afterState: { commentType: d.commentType, invalidatedApprovals },
            request,
          },
          client
        );

        return { comment: cRes.rows[0], invalidatedApprovals };
      });

      return reply.status(201).send(result);
    }
  );

  // POST /api/v1/arts/:id/status (transição para 'enviado_ao_cliente' ou 'revisao_interna')
  fastify.post(
    '/:id/status',
    { preHandler: [requirePortalAuth, requireAnyPermission(['arts:write', 'arts:review_internal'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        status: z.enum(['briefing_pendente', 'em_criacao', 'revisao_interna', 'enviado_ao_cliente', 'ajustes']),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const existing = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.art_projects WHERE id = $1`, [id]);
      if (!existing.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Projeto não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, existing.rows[0].unit_id)) return;

      const up = await dbQuery(
        `UPDATE portal.art_projects SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [parsed.data.status, id]
      );
      return reply.send({ project: up.rows[0] });
    }
  );

  // POST /api/v1/arts/:id/approve (aprovação vinculada especificamente à versão + método de identificação + carimbo data/hora)
  fastify.post(
    '/:id/approve',
    { preHandler: [requirePortalAuth, requirePermission('arts:approve')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        artVersionId: z.string().uuid(),
        approvedByName: z.string().min(2),
        approvedByContact: z.string().optional().nullable(),
        identificationMethod: z.string().min(3),
        acceptanceEvidence: z.string().min(3),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const verRes = await dbQuery<{ id: string; unit_id: string; version_number: number; artifact_kind: string }>(
        `SELECT id, unit_id, version_number, artifact_kind
         FROM portal.art_versions
         WHERE id = $1 AND art_project_id = $2`,
        [parsed.data.artVersionId, id]
      );
      const version = verRes.rows[0];
      if (!version) {
        return reply.status(404).send({ statusCode: 404, code: 'VERSION_NOT_FOUND', message: 'Versão especificada não encontrada.' });
      }
      if (!assertUnitOwnership(request, reply, version.unit_id)) return;

      const d = parsed.data;
      const ctx = request.portal!;

      const approval = await withTransaction(async (client) => {
        // Supersede any old active approval before registering new active version-bound approval
        await client.query(
          `UPDATE portal.approvals
           SET status = 'superseded', superseded_by_version_id = $1, superseded_at = NOW()
           WHERE art_project_id = $2 AND entity_type = 'art_version' AND status = 'active'`,
          [version.id, id]
        );

        const appRes = await client.query(
          `INSERT INTO portal.approvals (
             unit_id, entity_type, entity_id, art_project_id, art_version_id,
             approved_by_name, approved_by_contact, identification_method, acceptance_evidence,
             status, recorded_by_user_id
           ) VALUES ($1,'art_version',$2,$3,$4,$5,$6,$7,$8,'active',$9)
           RETURNING *`,
          [
            version.unit_id,
            version.id,
            id,
            version.id,
            d.approvedByName.trim(),
            d.approvedByContact?.trim() || null,
            d.identificationMethod.trim(),
            d.acceptanceEvidence.trim(),
            ctx.userId,
          ]
        );

        await client.query(
          `UPDATE portal.art_projects
           SET status = 'aprovado', approved_version_id = $1, current_version_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [version.id, id]
        );

        await client.query(
          `UPDATE portal.orders
           SET approved_art_version_id = $1,
               approval_status = CASE WHEN grade_approved THEN 'all_approved' ELSE 'art_approved' END,
               updated_at = NOW()
           WHERE art_project_id = $2 AND commercial_status <> 'canceled'`,
          [version.id, id]
        );

        await notifyUnitRoles(
          version.unit_id,
          ['franqueado'],
          {
            eventType: 'art_approved',
            title: `Arte aprovada na versão v${version.version_number}`,
            body: `${d.approvedByName} aprovou a versão v${version.version_number} (${d.identificationMethod}).`,
            actionUrl: '/?tab=studio',
            entityType: 'art_project',
            entityId: id,
            dedupeKey: `art_approved:${id}:${version.id}`,
          },
          client
        );

        await recordAuditLog(
          {
            unitId: version.unit_id,
            action: 'art_version.approved',
            entityType: 'approval',
            entityId: appRes.rows[0].id,
            afterState: { versionNumber: version.version_number, approvedBy: d.approvedByName },
            request,
          },
          client
        );

        return appRes.rows[0];
      });

      return reply.status(201).send({ approval, versionNumber: version.version_number });
    }
  );
}
