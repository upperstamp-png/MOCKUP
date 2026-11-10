import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbQuery } from '../../plugins/db.js';
import { createSupabaseAnonClient } from '../../plugins/supabase.js';
import { getExternalIntegrationsStatus } from '../../config/env.js';
import {
  ACCESS_COOKIE_NAME,
  buildPortalContextForUser,
  cacheVerifiedAccessToken,
  clearAuthCookies,
  enforceRateLimit,
  hashToken,
  markTokenRevoked,
  requirePortalAuth,
  setAuthCookies,
} from '../../middleware/portalAuth.js';
import { recordAuditLog } from '../../services/auditAndNotify.js';

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(4, 'Senha obrigatória'),
  deviceName: z.string().max(120).optional(),
  fingerprintHash: z.string().max(120).optional(),
});

const switchUnitSchema = z.object({
  unitId: z.string().uuid('ID de unidade inválido'),
});

export async function portalAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/login
  fastify.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Informe e-mail e senha válidos.',
        details: parsed.error.flatten(),
      });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const rate = await enforceRateLimit(`login:${request.ip}:${email}`, 25, 300);
    if (!rate.allowed) {
      return reply.status(429).send({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'Muitas tentativas de login. Aguarde alguns minutos.',
      });
    }

    const anonClient = createSupabaseAnonClient();
    const { data, error } = await anonClient.auth.signInWithPassword({
      email,
      password: parsed.data.password,
    });

    if (error || !data.session || !data.user) {
      return reply.status(401).send({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha inválidos.',
      });
    }

    const built = await buildPortalContextForUser(
      data.user.id,
      undefined,
      data.session.access_token
    );

    if (!built.context) {
      return reply.status(built.statusCode || 403).send({
        statusCode: built.statusCode || 403,
        code: built.errorCode || 'FORBIDDEN',
        message: built.message || 'Usuário não habilitado para acessar o portal.',
      });
    }

    const ctx = built.context;
    const ua = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : 'Browser';
    const fpHash =
      parsed.data.fingerprintHash?.trim() ||
      hashToken(`${ctx.userId}:${ua.slice(0, 60)}`);
    const deviceLabel = parsed.data.deviceName?.trim() || ua.slice(0, 80) || 'Navegador Web';

    const deviceRes = await dbQuery<{ id: string }>(
      `INSERT INTO portal.user_devices (unit_id, user_id, device_name, fingerprint_hash, user_agent, ip_address, is_active, last_login_at)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW())
       ON CONFLICT (unit_id, user_id, fingerprint_hash)
       DO UPDATE SET device_name = EXCLUDED.device_name, user_agent = EXCLUDED.user_agent, ip_address = EXCLUDED.ip_address, is_active = TRUE, last_login_at = NOW()
       RETURNING id`,
      [ctx.activeUnitId, ctx.userId, deviceLabel, fpHash, ua, request.ip]
    );

    await dbQuery(
      `INSERT INTO portal.active_sessions (unit_id, user_id, device_id, device_label, ip_address, user_agent, session_token_hash, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (session_token_hash)
       DO UPDATE SET last_seen_at = NOW(), unit_id = EXCLUDED.unit_id`,
      [
        ctx.activeUnitId,
        ctx.userId,
        deviceRes.rows[0]?.id ?? null,
        deviceLabel,
        request.ip,
        ua,
        hashToken(data.session.access_token),
      ]
    );

    await cacheVerifiedAccessToken(data.session.access_token, ctx.userId);

    setAuthCookies(
      reply,
      data.session.access_token,
      data.session.refresh_token,
      ctx.activeUnitId
    );

    await recordAuditLog({
      unitId: ctx.activeUnitId,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      actorRole: ctx.activeRoleSlug,
      action: 'auth.login',
      entityType: 'session',
      entityId: ctx.userId,
      request,
    });

    return reply.send({
      user: {
        id: ctx.userId,
        email: ctx.email,
        fullName: ctx.fullName,
        phone: ctx.phone,
      },
      activeUnit: ctx.activeUnit,
      activeRole: {
        slug: ctx.activeRoleSlug,
        name: ctx.activeRoleName,
        scope: ctx.activeScope,
        permissions: ctx.permissions,
      },
      availableUnits: ctx.availableUnits,
      memberships: ctx.memberships,
      integrationsStatus: getExternalIntegrationsStatus(),
    });
  });

  // POST /api/v1/auth/logout
  fastify.post('/logout', async (request, reply) => {
    const token =
      (request.headers.authorization?.startsWith('Bearer ')
        ? request.headers.authorization.slice(7).trim()
        : undefined) || request.cookies?.[ACCESS_COOKIE_NAME];

    if (token) {
      const tokenHash = hashToken(token);
      await Promise.all([
        dbQuery(`DELETE FROM portal.active_sessions WHERE session_token_hash = $1`, [
          tokenHash,
        ]).catch(() => undefined),
        markTokenRevoked(tokenHash),
      ]);
    }
    clearAuthCookies(reply);
    return reply.send({ success: true });
  });

  // GET /api/v1/auth/me
  fastify.get('/me', { preHandler: [requirePortalAuth] }, async (request, reply) => {
    const ctx = request.portal!;
    const [configRes, unreadRes] = await Promise.all([
      dbQuery(
        `SELECT config_status, commercial_modality, royalty_bps, marketing_fund_bps,
                factory_transfer_bps, default_price_list_code, max_discount_bps,
                territory_rule_status, territory_notes, default_lead_time_min_days,
                default_lead_time_max_days, production_release_rules,
                payment_gateway_provider, payment_gateway_status,
                nfe_emitter_provider, nfe_emitter_status, notes
         FROM portal.unit_commercial_configs
         WHERE unit_id = $1`,
        [ctx.activeUnitId]
      ),
      dbQuery<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
         FROM portal.notifications
         WHERE user_id = $1 AND unit_id = $2 AND is_read = FALSE`,
        [ctx.userId, ctx.activeUnitId]
      ),
    ]);

    return reply.send({
      user: {
        id: ctx.userId,
        email: ctx.email,
        fullName: ctx.fullName,
        phone: ctx.phone,
      },
      activeUnit: ctx.activeUnit,
      activeRole: {
        slug: ctx.activeRoleSlug,
        name: ctx.activeRoleName,
        scope: ctx.activeScope,
        permissions: ctx.permissions,
      },
      availableUnits: ctx.availableUnits,
      memberships: ctx.memberships,
      commercialConfig: configRes.rows[0] || null,
      unreadNotifications: Number(unreadRes.rows[0]?.cnt || 0),
      integrationsStatus: getExternalIntegrationsStatus(),
    });
  });

  // POST /api/v1/auth/switch-unit (aceita apenas unidades legitimamente vinculadas ou escopo rede/fábrica)
  fastify.post(
    '/switch-unit',
    { preHandler: [requirePortalAuth] },
    async (request, reply) => {
      const parsed = switchUnitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Unidade inválida.',
        });
      }

      const ctx = request.portal!;
      const built = await buildPortalContextForUser(
        ctx.userId,
        parsed.data.unitId
      );
      if (!built.context) {
        return reply.status(built.statusCode || 403).send({
          statusCode: built.statusCode || 403,
          code: built.errorCode || 'FORBIDDEN_UNIT',
          message: built.message || 'Unidade não autorizada.',
        });
      }

      const token =
        request.cookies?.[ACCESS_COOKIE_NAME] ||
        (request.headers.authorization?.startsWith('Bearer ')
          ? request.headers.authorization.slice(7).trim()
          : '');
      if (token) {
        setAuthCookies(reply, token, undefined, built.context.activeUnitId);
      }

      await recordAuditLog({
        unitId: built.context.activeUnitId,
        action: 'auth.switch_unit',
        entityType: 'unit',
        entityId: built.context.activeUnitId,
        request,
      });

      return reply.send({
        activeUnit: built.context.activeUnit,
        activeRole: {
          slug: built.context.activeRoleSlug,
          name: built.context.activeRoleName,
          scope: built.context.activeScope,
          permissions: built.context.permissions,
        },
        availableUnits: built.context.availableUnits,
      });
    }
  );

  // GET /api/v1/auth/devices
  fastify.get('/devices', { preHandler: [requirePortalAuth] }, async (request, reply) => {
    const ctx = request.portal!;
    const [devicesRes, sessionsRes, unitRes] = await Promise.all([
      dbQuery(
        `SELECT d.id, d.device_name, d.user_agent, d.ip_address, d.is_active, d.last_login_at,
                d.created_at, p.full_name AS user_name, p.email AS user_email
         FROM portal.user_devices d
         JOIN portal.profiles p ON p.id = d.user_id
         WHERE d.unit_id = $1
         ORDER BY d.last_login_at DESC`,
        [ctx.activeUnitId]
      ),
      dbQuery(
        `SELECT s.id, s.device_label, s.ip_address, s.last_seen_at, s.created_at,
                p.full_name AS user_name, (s.session_token_hash = $2) AS is_current
         FROM portal.active_sessions s
         JOIN portal.profiles p ON p.id = s.user_id
         WHERE s.unit_id = $1
         ORDER BY s.last_seen_at DESC`,
        [ctx.activeUnitId, ctx.sessionTokenHash]
      ),
      dbQuery(
        `SELECT id, code, name, legal_name, cnpj, city, state, timezone, operational_status,
                training_completed, banca_approved, implantation_approved, implantation_notes,
                initial_franchise_fee_cents, initial_fee_status, max_devices
         FROM portal.units
         WHERE id = $1`,
        [ctx.activeUnitId]
      ),
    ]);

    return reply.send({
      unit: unitRes.rows[0],
      devices: devicesRes.rows,
      activeSessions: sessionsRes.rows,
    });
  });

  // POST /api/v1/auth/devices/:id/revoke
  fastify.post(
    '/devices/:id/revoke',
    { preHandler: [requirePortalAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!z.string().uuid().safeParse(id).success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'ID de dispositivo inválido.',
        });
      }
      const ctx = request.portal!;
      const res = await dbQuery(
        `UPDATE portal.user_devices
         SET is_active = FALSE
         WHERE id = $1 AND unit_id = $2
         RETURNING id, device_name`,
        [id, ctx.activeUnitId]
      );
      if (res.rowCount === 0) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'DEVICE_NOT_FOUND',
          message: 'Dispositivo não encontrado na unidade ativa.',
        });
      }
      const deletedSessions = await dbQuery<{ session_token_hash: string }>(
        `DELETE FROM portal.active_sessions WHERE device_id = $1 AND unit_id = $2 RETURNING session_token_hash`,
        [id, ctx.activeUnitId]
      );
      await Promise.all(
        deletedSessions.rows.map((row) => markTokenRevoked(row.session_token_hash))
      );
      await recordAuditLog({
        unitId: ctx.activeUnitId,
        action: 'device.revoked',
        entityType: 'user_device',
        entityId: id,
        request,
      });
      return reply.send({ success: true, device: res.rows[0] });
    }
  );

  // GET /api/v1/auth/unit-members (lista membros ativos da unidade corrente para atribuição de tarefas/CRM/artes)
  fastify.get('/unit-members', { preHandler: [requirePortalAuth] }, async (request, reply) => {
    const ctx = request.portal!;
    const rows = await dbQuery<{
      user_id: string;
      full_name: string;
      email: string;
      role_slug: string;
      role_name: string;
    }>(
      `SELECT um.user_id, p.full_name, p.email, um.role_slug, rp.name AS role_name
       FROM portal.unit_memberships um
       JOIN portal.profiles p ON p.id = um.user_id
       JOIN portal.roles_permissions rp ON rp.role_slug = um.role_slug
       WHERE um.unit_id = $1 AND um.status = 'active' AND p.is_active = TRUE
       ORDER BY p.full_name ASC`,
      [ctx.activeUnitId]
    );
    return reply.send({ members: rows.rows });
  });
}
