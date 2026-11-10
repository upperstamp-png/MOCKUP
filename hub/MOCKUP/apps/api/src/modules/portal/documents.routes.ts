import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbQuery, withTransaction } from '../../plugins/db.js';
import {
  assertUnitOwnership,
  requirePermission,
  requirePortalAuth,
} from '../../middleware/portalAuth.js';
import { recordAuditLog } from '../../services/auditAndNotify.js';
import {
  createAuthorizedSignedUrl,
  parseDataUrlToBuffer,
  uploadPrivatePortalFile,
} from '../../services/storageService.js';

export async function portalDocumentsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/documents
  fastify.get(
    '/',
    { preHandler: [requirePortalAuth, requirePermission('documents:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as { category?: string; classification?: string; status?: string };

      const conditions = [
        `(d.unit_id IS NULL OR d.unit_id = $1)`,
        `d.visible_roles ? $2`,
      ];
      const params: unknown[] = [ctx.activeUnitId, ctx.activeRoleSlug];
      let idx = 3;

      if (q.category && q.category !== 'todos') {
        conditions.push(`d.doc_category = $${idx}`);
        params.push(q.category);
        idx++;
      }
      if (q.classification && q.classification !== 'todos') {
        conditions.push(`d.current_classification = $${idx}`);
        params.push(q.classification);
        idx++;
      }
      if (q.status && q.status !== 'todos') {
        conditions.push(`d.status = $${idx}`);
        params.push(q.status);
        idx++;
      }

      const rows = await dbQuery(
        `SELECT d.*,
                c.name AS customer_name,
                o.order_number,
                p.full_name AS owner_name,
                COALESCE(
                  (SELECT json_agg(dv ORDER BY dv.version_number DESC)
                   FROM portal.document_versions dv WHERE dv.document_id = d.id),
                  '[]'::json
                ) AS versions
         FROM portal.documents d
         LEFT JOIN portal.customers c ON c.id = d.customer_id
         LEFT JOIN portal.orders o ON o.id = d.order_id
         LEFT JOIN portal.profiles p ON p.id = d.owner_user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY (d.unit_id IS NOT NULL) DESC, d.requirement_level ASC, d.updated_at DESC`,
        params
      );

      return reply.send({ items: rows.rows });
    }
  );

  // POST /api/v1/documents (cria documento + primeira versão opcional no Storage privado)
  fastify.post(
    '/',
    { preHandler: [requirePortalAuth, requirePermission('documents:write')] },
    async (request, reply) => {
      const schema = z.object({
        docCategory: z.enum([
          'franquia',
          'unidade',
          'contrato',
          'termo_cliente',
          'aprovacao',
          'autorizacao',
          'manual',
          'comprovante',
        ]),
        requirementLevel: z
          .enum(['mandatory_onboarding', 'mandatory_order_production', 'reference', 'optional'])
          .default('optional'),
        title: z.string().min(3),
        description: z.string().optional().nullable(),
        classification: z.enum(['modelo', 'minuta', 'aprovado', 'assinado']).default('minuta'),
        customerId: z.string().uuid().optional().nullable(),
        orderId: z.string().uuid().optional().nullable(),
        validUntil: z.string().optional().nullable(),
        file: z.object({ fileName: z.string(), dataUrl: z.string() }).optional().nullable(),
        evidenceNotes: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const ctx = request.portal!;
      const d = parsed.data;
      const statusFromClassification =
        d.classification === 'assinado'
          ? 'signed'
          : d.classification === 'aprovado'
            ? 'approved'
            : 'in_review';

      let stored: { storageBucket: string; storagePath: string; fileName: string; mimeType: string } | null = null;
      if (d.file?.dataUrl) {
        const decoded = parseDataUrlToBuffer(d.file.dataUrl);
        if (!decoded) {
          return reply.status(400).send({ statusCode: 400, code: 'INVALID_FILE', message: 'Arquivo codificado inválido.' });
        }
        stored = await uploadPrivatePortalFile({
          bucket: 'portal-documents',
          unitId: ctx.activeUnitId,
          folder: 'vault',
          fileName: d.file.fileName,
          mimeType: decoded.mimeType,
          buffer: decoded.buffer,
        });
      }

      const created = await withTransaction(async (client) => {
        const docRes = await client.query<{ id: string }>(
          `INSERT INTO portal.documents (
             unit_id, customer_id, order_id, doc_category, requirement_level, title, description,
             current_classification, status, owner_user_id, valid_until, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [
            ctx.activeUnitId,
            d.customerId || null,
            d.orderId || null,
            d.docCategory,
            d.requirementLevel,
            d.title.trim(),
            d.description?.trim() || null,
            d.classification,
            statusFromClassification,
            ctx.userId,
            d.validUntil || null,
            ctx.userId,
          ]
        );
        const doc = docRes.rows[0];

        if (stored || d.evidenceNotes) {
          await client.query(
            `INSERT INTO portal.document_versions (
               document_id, version_number, classification, storage_bucket, storage_path,
               file_name, mime_type, evidence_notes, uploaded_by
             ) VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              doc.id,
              d.classification,
              stored?.storageBucket || null,
              stored?.storagePath || null,
              stored?.fileName || null,
              stored?.mimeType || null,
              d.evidenceNotes?.trim() || null,
              ctx.userId,
            ]
          );
        }

        await recordAuditLog(
          {
            unitId: ctx.activeUnitId,
            action: 'document.created',
            entityType: 'document',
            entityId: doc.id,
            afterState: { title: d.title, classification: d.classification },
            request,
          },
          client
        );
        return doc;
      });

      return reply.status(201).send({ document: created });
    }
  );

  // POST /api/v1/documents/:id/versions
  fastify.post(
    '/:id/versions',
    { preHandler: [requirePortalAuth, requirePermission('documents:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const docRes = await dbQuery<{ id: string; unit_id: string | null }>(
        `SELECT id, unit_id FROM portal.documents WHERE id = $1`,
        [id]
      );
      if (!docRes.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Documento não encontrado.' });
      }
      if (docRes.rows[0].unit_id && !assertUnitOwnership(request, reply, docRes.rows[0].unit_id)) return;
      if (!docRes.rows[0].unit_id && request.portal!.activeScope !== 'network') {
        return reply.status(403).send({ statusCode: 403, code: 'SHARED_DOC_LOCKED', message: 'Modelos globais da rede só podem ser versionados pela administração.' });
      }

      const schema = z.object({
        classification: z.enum(['modelo', 'minuta', 'aprovado', 'assinado']).default('minuta'),
        evidenceNotes: z.string().optional().nullable(),
        file: z.object({ fileName: z.string(), dataUrl: z.string() }).optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const d = parsed.data;
      const ctx = request.portal!;
      let stored: { storageBucket: string; storagePath: string; fileName: string; mimeType: string } | null = null;
      if (d.file?.dataUrl) {
        const decoded = parseDataUrlToBuffer(d.file.dataUrl);
        if (!decoded) {
          return reply.status(400).send({ statusCode: 400, code: 'INVALID_FILE', message: 'Arquivo inválido.' });
        }
        stored = await uploadPrivatePortalFile({
          bucket: 'portal-documents',
          unitId: docRes.rows[0].unit_id,
          folder: `vault/${id}`,
          fileName: d.file.fileName,
          mimeType: decoded.mimeType,
          buffer: decoded.buffer,
        });
      }

      const ver = await withTransaction(async (client) => {
        const maxRes = await client.query<{ max_ver: number }>(
          `SELECT COALESCE(MAX(version_number), 0)::int AS max_ver FROM portal.document_versions WHERE document_id = $1`,
          [id]
        );
        const nextVer = (maxRes.rows[0]?.max_ver || 0) + 1;
        const ins = await client.query(
          `INSERT INTO portal.document_versions (
             document_id, version_number, classification, storage_bucket, storage_path,
             file_name, mime_type, evidence_notes, uploaded_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            id,
            nextVer,
            d.classification,
            stored?.storageBucket || null,
            stored?.storagePath || null,
            stored?.fileName || null,
            stored?.mimeType || null,
            d.evidenceNotes?.trim() || null,
            ctx.userId,
          ]
        );

        const nextStatus =
          d.classification === 'assinado'
            ? 'signed'
            : d.classification === 'aprovado'
              ? 'approved'
              : 'in_review';
        await client.query(
          `UPDATE portal.documents SET current_classification = $1, status = $2, updated_at = NOW() WHERE id = $3`,
          [d.classification, nextStatus, id]
        );
        return ins.rows[0];
      });

      return reply.status(201).send({ version: ver });
    }
  );

  // POST /api/v1/documents/:id/status (aprovação documental — franqueadora ou gestor conforme regra)
  fastify.post(
    '/:id/status',
    { preHandler: [requirePortalAuth, requirePermission('documents:approve')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        status: z.enum(['approved', 'signed', 'rejected', 'in_review']),
        classification: z.enum(['modelo', 'minuta', 'aprovado', 'assinado']).optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const updated = await dbQuery(
        `UPDATE portal.documents SET
           status = $1,
           current_classification = COALESCE($2, current_classification),
           updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [parsed.data.status, parsed.data.classification ?? null, id]
      );
      if (!updated.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Documento não encontrado.' });
      }
      await recordAuditLog({
        unitId: updated.rows[0].unit_id,
        action: 'document.status_changed',
        entityType: 'document',
        entityId: id,
        afterState: { status: parsed.data.status },
        request,
      });
      return reply.send({ document: updated.rows[0] });
    }
  );

  // GET /api/v1/documents/:docId/versions/:verId/download
  fastify.get(
    '/:docId/versions/:verId/download',
    { preHandler: [requirePortalAuth, requirePermission('documents:read')] },
    async (request, reply) => {
      const { docId, verId } = request.params as { docId: string; verId: string };
      const res = await dbQuery<{
        unit_id: string | null;
        storage_bucket: string | null;
        storage_path: string | null;
        external_url: string | null;
        file_name: string | null;
      }>(
        `SELECT d.unit_id, dv.storage_bucket, dv.storage_path, dv.external_url, dv.file_name
         FROM portal.document_versions dv
         JOIN portal.documents d ON d.id = dv.document_id
         WHERE dv.id = $1 AND d.id = $2`,
        [verId, docId]
      );
      const row = res.rows[0];
      if (!row) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Versão documental não encontrada.' });
      }
      if (row.unit_id && !assertUnitOwnership(request, reply, row.unit_id)) return;

      if (row.storage_bucket && row.storage_path) {
        const signedUrl = await createAuthorizedSignedUrl({
          bucket: 'portal-documents',
          storagePath: row.storage_path,
          authorizedUnitId: row.unit_id || request.portal!.activeUnitId,
          allowNetworkScope: request.portal!.activeScope !== 'unit',
        });
        return reply.send({ signedUrl, fileName: row.file_name });
      }

      if (row.external_url) {
        return reply.send({ signedUrl: row.external_url, fileName: row.file_name });
      }

      return reply.status(404).send({ statusCode: 404, code: 'NO_FILE', message: 'Versão sem anexo disponível.' });
    }
  );
}
