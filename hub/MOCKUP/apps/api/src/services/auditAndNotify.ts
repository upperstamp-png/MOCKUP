import { FastifyRequest } from 'fastify';
import { PoolClient } from 'pg';
import { dbPool, dbQuery } from '../plugins/db.js';
import { getExternalIntegrationsStatus } from '../config/env.js';

type Queryable = Pick<PoolClient, 'query'>;

export interface AuditLogInput {
  unitId: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | null;
  request?: FastifyRequest;
}

export async function recordAuditLog(
  input: AuditLogInput,
  executor: Queryable = dbPool
): Promise<void> {
  const ipAddress =
    input.request?.ip ||
    (typeof input.request?.headers['x-forwarded-for'] === 'string'
      ? input.request.headers['x-forwarded-for']
      : null);
  const userAgent =
    typeof input.request?.headers['user-agent'] === 'string'
      ? input.request.headers['user-agent']
      : null;

  await executor.query(
    `INSERT INTO portal.audit_logs (
       unit_id, actor_user_id, actor_email, actor_role, action,
       entity_type, entity_id, before_state, after_state, reason, ip_address, user_agent
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      input.unitId,
      input.actorUserId ?? input.request?.portal?.userId ?? null,
      input.actorEmail ?? input.request?.portal?.email ?? null,
      input.actorRole ?? input.request?.portal?.activeRoleSlug ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.beforeState !== undefined ? JSON.stringify(input.beforeState) : null,
      input.afterState !== undefined ? JSON.stringify(input.afterState) : null,
      input.reason ?? null,
      ipAddress,
      userAgent,
    ]
  );
}

export interface NotificationInput {
  unitId: string;
  userId: string;
  eventType: string;
  title: string;
  body: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  dedupeKey?: string;
}

export async function createPortalNotification(
  input: NotificationInput,
  executor: Queryable = dbPool
): Promise<void> {
  const prefRes = await executor.query<{
    in_app_enabled: boolean;
    muted_event_types: string[];
  }>(
    `SELECT in_app_enabled, muted_event_types
     FROM portal.notification_preferences
     WHERE user_id = $1 AND unit_id = $2`,
    [input.userId, input.unitId]
  );

  const pref = prefRes.rows[0];
  if (pref) {
    if (!pref.in_app_enabled) return;
    if (Array.isArray(pref.muted_event_types) && pref.muted_event_types.includes(input.eventType)) {
      return;
    }
  }

  await executor.query(
    `INSERT INTO portal.notifications (
       unit_id, user_id, event_type, title, body, action_url, entity_type, entity_id, dedupe_key
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (user_id, unit_id, dedupe_key)
     WHERE dedupe_key IS NOT NULL AND is_read = FALSE
     DO NOTHING`,
    [
      input.unitId,
      input.userId,
      input.eventType,
      input.title,
      input.body,
      input.actionUrl ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      input.dedupeKey ?? null,
    ]
  );
}

export async function notifyUnitRoles(
  unitId: string,
  roles: string[],
  payload: Omit<NotificationInput, 'unitId' | 'userId'>,
  executor: Queryable = dbPool
): Promise<void> {
  const membersRes = await executor.query<{ user_id: string }>(
    `SELECT um.user_id
     FROM portal.unit_memberships um
     JOIN portal.profiles p ON p.id = um.user_id
     WHERE um.unit_id = $1
       AND um.status = 'active'
       AND p.is_active = TRUE
       AND um.role_slug = ANY($2::text[])`,
    [unitId, roles]
  );

  for (const row of membersRes.rows) {
    await createPortalNotification(
      {
        unitId,
        userId: row.user_id,
        ...payload,
        dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${row.user_id}` : undefined,
      },
      executor
    );
  }
}

export async function logIntegrationAttempt(params: {
  unitId: string | null;
  integrationName: 'asaas_payments' | 'nfe_emitter' | 'whatsapp_api' | 'email_smtp';
  operation: string;
  payload?: Record<string, unknown>;
  forceStatus?: 'not_configured' | 'blocked_test_mode' | 'queued' | 'sent' | 'failed';
  detailMessage?: string;
}): Promise<{
  id: string;
  status: string;
  detailMessage: string;
  configured: boolean;
}> {
  const statuses = getExternalIntegrationsStatus();
  const configured = Boolean(statuses[params.integrationName]);

  const status = params.forceStatus ?? (configured ? 'queued' : 'not_configured');
  const detailMessage =
    params.detailMessage ??
    (configured
      ? `Solicitação '${params.operation}' registrada na fila para processamento com ${params.integrationName}.`
      : `Integração externa '${params.integrationName}' não configurada neste ambiente. Nenhuma chamada externa foi simulada.`);

  const res = await dbQuery<{ id: string }>(
    `INSERT INTO portal.integration_attempts (
       unit_id, integration_name, operation, status, detail_message, payload
     ) VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      params.unitId,
      params.integrationName,
      params.operation,
      status,
      detailMessage,
      JSON.stringify(params.payload ?? {}),
    ]
  );

  return {
    id: res.rows[0].id,
    status,
    detailMessage,
    configured,
  };
}
