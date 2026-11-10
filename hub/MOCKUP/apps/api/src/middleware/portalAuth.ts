import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { dbQuery } from '../plugins/db.js';
import { supabaseAdmin, createSupabaseAnonClient } from '../plugins/supabase.js';
import { getRedisClient } from '../plugins/redis.js';
import { env } from '../config/env.js';

export const ACCESS_COOKIE_NAME = 'ks_portal_access';
export const REFRESH_COOKIE_NAME = 'ks_portal_refresh';
export const UNIT_COOKIE_NAME = 'ks_active_unit';

interface CachedJwksKey {
  kid: string;
  alg?: string;
  keyObject: crypto.KeyObject;
}

let jwksCache: { fetchedAt: number; keys: CachedJwksKey[] } | null = null;
let jwksInflight: Promise<CachedJwksKey[]> | null = null;
const refreshInflight = new Map<
  string,
  Promise<{ accessToken: string; refreshToken?: string; userId: string } | null>
>();
const lastSeenThrottle = new Map<string, number>();

export async function markTokenRevoked(tokenHash: string, ttlSeconds = 60 * 60 * 12): Promise<void> {
  if (!tokenHash) return;
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(`ks:auth:revoked:${tokenHash}`, '1', 'EX', Math.max(60, ttlSeconds));
    await redis.del(`ks:auth:token:${tokenHash}`);
  } catch {
    // Redis indisponível não impede fluxo principal
  }
}

export async function isTokenRevoked(tokenHash: string): Promise<boolean> {
  if (!tokenHash) return false;
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const val = await redis.get(`ks:auth:revoked:${tokenHash}`);
    return val === '1';
  } catch {
    return false;
  }
}

export async function cacheVerifiedAccessToken(
  accessToken: string,
  userId: string
): Promise<void> {
  const redis = getRedisClient();
  if (!redis || !accessToken || !userId) return;
  try {
    const parts = accessToken.split('.');
    let expSec = Math.floor(Date.now() / 1000) + 300;
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        exp?: number;
      };
      if (typeof payload.exp === 'number') {
        expSec = payload.exp;
      }
    }
    const remaining = expSec - Math.floor(Date.now() / 1000);
    if (remaining <= 5) return;
    const ttl = Math.min(600, remaining);
    await redis.set(`ks:auth:token:${hashToken(accessToken)}`, userId, 'EX', ttl);
  } catch {
    // Ignora falha não-crítica de cache Redis
  }
}

async function fetchSupabaseJwks(forceRefresh = false): Promise<CachedJwksKey[]> {
  const now = Date.now();
  if (!forceRefresh && jwksCache && now - jwksCache.fetchedAt < 10 * 60 * 1000) {
    return jwksCache.keys;
  }
  if (jwksInflight && !forceRefresh) {
    return jwksInflight;
  }

  const runner = (async () => {
    try {
      const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`, {
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) {
        return jwksCache?.keys ?? [];
      }
      const data = (await res.json()) as { keys?: Array<Record<string, unknown> & { kid?: string; alg?: string }> };
      const parsed: CachedJwksKey[] = [];
      for (const jwk of data.keys || []) {
        if (typeof jwk.kid === 'string') {
          try {
            const keyObject = crypto.createPublicKey({ key: jwk as unknown as crypto.JsonWebKey, format: 'jwk' });
            parsed.push({ kid: jwk.kid, alg: typeof jwk.alg === 'string' ? jwk.alg : undefined, keyObject });
          } catch {
            // Ignora JWK não suportada
          }
        }
      }
      if (parsed.length > 0) {
        jwksCache = { fetchedAt: Date.now(), keys: parsed };
      }
      return parsed.length > 0 ? parsed : (jwksCache?.keys ?? []);
    } catch {
      return jwksCache?.keys ?? [];
    } finally {
      jwksInflight = null;
    }
  })();

  jwksInflight = runner;
  return runner;
}

async function verifyAccessTokenLocally(
  token: string
): Promise<
  | { status: 'valid'; userId: string }
  | { status: 'expired' }
  | { status: 'invalid' }
  | { status: 'fallback_remote' }
> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { status: 'invalid' };
  }

  let header: { alg?: string; kid?: string };
  let payload: { sub?: string; exp?: number; nbf?: number; aud?: string | string[] };
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { status: 'invalid' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp <= nowSec) {
    return { status: 'expired' };
  }
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec + 30) {
    return { status: 'invalid' };
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    return { status: 'invalid' };
  }
  const audMatch = Array.isArray(payload.aud)
    ? payload.aud.includes('authenticated')
    : payload.aud === 'authenticated';
  if (!audMatch) {
    return { status: 'invalid' };
  }

  // Consulta rápida ao Redis caso o token já tenha sido validado recentemente
  const redis = getRedisClient();
  if (redis) {
    try {
      const cachedUserId = await redis.get(`ks:auth:token:${hashToken(token)}`);
      if (cachedUserId && cachedUserId === payload.sub) {
        return { status: 'valid', userId: cachedUserId };
      }
    } catch {
      // Segue para validação criptográfica local
    }
  }

  if (header.alg === 'ES256' || header.alg === 'RS256' || header.alg === 'EdDSA') {
    let keys = await fetchSupabaseJwks(false);
    let matched = header.kid ? keys.find((k) => k.kid === header.kid) : keys[0];
    if (!matched && header.kid) {
      keys = await fetchSupabaseJwks(true);
      matched = keys.find((k) => k.kid === header.kid);
    }
    if (!matched) {
      return { status: 'fallback_remote' };
    }

    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
    const signature = Buffer.from(parts[2], 'base64url');
    let verified = false;
    if (header.alg === 'ES256') {
      verified = crypto.verify(
        'sha256',
        signingInput,
        { key: matched.keyObject, dsaEncoding: 'ieee-p1363' },
        signature
      );
    } else if (header.alg === 'RS256') {
      verified = crypto.verify('RSA-SHA256', signingInput, matched.keyObject, signature);
    } else if (header.alg === 'EdDSA') {
      verified = crypto.verify(null, signingInput, matched.keyObject, signature);
    }

    if (!verified) {
      return { status: 'invalid' };
    }
    await cacheVerifiedAccessToken(token, payload.sub);
    return { status: 'valid', userId: payload.sub };
  }

  return { status: 'fallback_remote' };
}

async function refreshSessionSingleflight(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string; userId: string } | null> {
  const key = hashToken(refreshToken);
  const existing = refreshInflight.get(key);
  if (existing) {
    return existing;
  }

  const runner = (async () => {
    try {
      const anonClient = createSupabaseAnonClient();
      const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: new Error('AUTH_REFRESH_TIMEOUT') }), 6000)
      );
      const result = await Promise.race([
        anonClient.auth.refreshSession({ refresh_token: refreshToken }),
        timeoutPromise,
      ]);
      if (
        !('error' in result && result.error) &&
        result.data?.session?.access_token &&
        result.data.user?.id
      ) {
        await cacheVerifiedAccessToken(result.data.session.access_token, result.data.user.id);
        return {
          accessToken: result.data.session.access_token,
          refreshToken: result.data.session.refresh_token,
          userId: result.data.user.id,
        };
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshInflight.delete(key);
    }
  })();

  refreshInflight.set(key, runner);
  return runner;
}

export interface PortalMembershipInfo {
  unitId: string;
  unitCode: string;
  unitName: string;
  unitCity: string;
  unitState: string;
  unitTimezone: string;
  unitType: 'franchise' | 'headquarters';
  operationalStatus: 'onboarding' | 'pending_approval' | 'active' | 'restricted' | 'suspended';
  trainingCompleted: boolean;
  bancaApproved: boolean;
  implantationApproved: boolean;
  roleSlug: string;
  roleName: string;
  scope: 'unit' | 'factory' | 'network';
  permissions: string[];
  isPrimary: boolean;
}

export interface PortalUnitSummary {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  timezone: string;
  unitType: 'franchise' | 'headquarters';
  operationalStatus: 'onboarding' | 'pending_approval' | 'active' | 'restricted' | 'suspended';
  trainingCompleted: boolean;
  bancaApproved: boolean;
  implantationApproved: boolean;
}

export interface PortalSessionContext {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  activeUnitId: string;
  activeUnit: PortalUnitSummary;
  activeRoleSlug: string;
  activeRoleName: string;
  activeScope: 'unit' | 'factory' | 'network';
  permissions: string[];
  memberships: PortalMembershipInfo[];
  availableUnits: PortalUnitSummary[];
  sessionTokenHash: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    portal?: PortalSessionContext;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isRequestHttps(reply?: FastifyReply): boolean {
  const req = reply?.request;
  if (!req) return false;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return forwardedProto === 'https' || req.protocol === 'https';
}

function isLocalHttpRequest(reply?: FastifyReply): boolean {
  const req = reply?.request;
  if (!req) return false;
  if (isRequestHttps(reply)) return false;
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const hostname = rawHost.startsWith('[')
    ? rawHost.slice(0, rawHost.indexOf(']') + 1)
    : rawHost.split(':')[0].trim();
  return Boolean(
    hostname &&
      (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname.endsWith('.localhost'))
  );
}

export function getAuthCookieOptions(reply?: FastifyReply) {
  const cookieDomain = env.COOKIE_DOMAIN.trim();
  const httpsConfigured =
    env.HUB_URL.startsWith('https://') || env.APP_URL.startsWith('https://');
  const shouldSecure = Boolean(
    env.COOKIE_SECURE ||
      (env.NODE_ENV === 'production' &&
        (isRequestHttps(reply) || (!isLocalHttpRequest(reply) && httpsConfigured)))
  );
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: shouldSecure,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}

export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken?: string,
  activeUnitId?: string
): void {
  const baseOptions = getAuthCookieOptions(reply);

  reply.setCookie(ACCESS_COOKIE_NAME, accessToken, {
    ...baseOptions,
    maxAge: 60 * 60 * 12,
  });

  if (refreshToken) {
    reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...baseOptions,
      maxAge: 60 * 60 * 24 * 14,
    });
  }

  if (activeUnitId) {
    reply.setCookie(UNIT_COOKIE_NAME, activeUnitId, {
      ...baseOptions,
      maxAge: 60 * 60 * 24 * 14,
    });
  }
}

export function clearAuthCookies(reply: FastifyReply): void {
  const baseOptions = getAuthCookieOptions(reply);
  reply.clearCookie(ACCESS_COOKIE_NAME, baseOptions);
  reply.clearCookie(REFRESH_COOKIE_NAME, baseOptions);
  reply.clearCookie(UNIT_COOKIE_NAME, baseOptions);
}

interface RawMembershipRow {
  unit_id: string;
  unit_code: string;
  unit_name: string;
  unit_city: string;
  unit_state: string;
  unit_timezone: string;
  unit_type: 'franchise' | 'headquarters';
  operational_status: 'onboarding' | 'pending_approval' | 'active' | 'restricted' | 'suspended';
  training_completed: boolean;
  banca_approved: boolean;
  implantation_approved: boolean;
  role_slug: string;
  role_name: string;
  scope: 'unit' | 'factory' | 'network';
  permissions: string[];
  is_primary: boolean;
}

export async function buildPortalContextForUser(
  userId: string,
  requestedUnitId?: string | null,
  accessTokenForHash?: string
): Promise<{ context?: PortalSessionContext; errorCode?: string; statusCode?: number; message?: string }> {
  const profileRes = await dbQuery<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    default_unit_id: string | null;
    is_active: boolean;
  }>(
    `SELECT id, full_name, email, phone, default_unit_id, is_active
     FROM portal.profiles
     WHERE id = $1`,
    [userId]
  );

  const profile = profileRes.rows[0];
  if (!profile || !profile.is_active) {
    return {
      statusCode: 403,
      errorCode: 'PROFILE_INACTIVE',
      message: 'Perfil do portal inexistente ou desativado.',
    };
  }

  const membershipsRes = await dbQuery<RawMembershipRow>(
    `SELECT
       um.unit_id,
       u.code AS unit_code,
       u.name AS unit_name,
       u.city AS unit_city,
       u.state AS unit_state,
       u.timezone AS unit_timezone,
       u.unit_type,
       u.operational_status,
       u.training_completed,
       u.banca_approved,
       u.implantation_approved,
       rp.role_slug,
       rp.name AS role_name,
       rp.scope,
       rp.permissions,
       um.is_primary
     FROM portal.unit_memberships um
     JOIN portal.units u ON u.id = um.unit_id
     JOIN portal.roles_permissions rp ON rp.role_slug = um.role_slug
     WHERE um.user_id = $1
       AND um.status = 'active'
     ORDER BY um.is_primary DESC, u.created_at ASC`,
    [userId]
  );

  if (membershipsRes.rows.length === 0) {
    return {
      statusCode: 403,
      errorCode: 'NO_ACTIVE_MEMBERSHIP',
      message: 'Usuário sem vínculo ativo em nenhuma unidade King Sports.',
    };
  }

  const memberships: PortalMembershipInfo[] = membershipsRes.rows.map((r) => ({
    unitId: r.unit_id,
    unitCode: r.unit_code,
    unitName: r.unit_name,
    unitCity: r.unit_city,
    unitState: r.unit_state,
    unitTimezone: r.unit_timezone,
    unitType: r.unit_type,
    operationalStatus: r.operational_status,
    trainingCompleted: r.training_completed,
    bancaApproved: r.banca_approved,
    implantationApproved: r.implantation_approved,
    roleSlug: r.role_slug,
    roleName: r.role_name,
    scope: r.scope,
    permissions: Array.isArray(r.permissions) ? r.permissions : [],
    isPrimary: r.is_primary,
  }));

  const elevatedMembership = memberships.find((m) => m.scope === 'network' || m.scope === 'factory');

  let availableUnits: PortalUnitSummary[] = [];
  if (elevatedMembership) {
    const unitsRes = await dbQuery<{
      id: string;
      code: string;
      name: string;
      city: string;
      state: string;
      timezone: string;
      unit_type: 'franchise' | 'headquarters';
      operational_status: 'onboarding' | 'pending_approval' | 'active' | 'restricted' | 'suspended';
      training_completed: boolean;
      banca_approved: boolean;
      implantation_approved: boolean;
    }>(
      `SELECT id, code, name, city, state, timezone, unit_type, operational_status,
              training_completed, banca_approved, implantation_approved
       FROM portal.units
       ORDER BY (unit_type = 'headquarters') DESC, name ASC`
    );
    availableUnits = unitsRes.rows.map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      city: u.city,
      state: u.state,
      timezone: u.timezone,
      unitType: u.unit_type,
      operationalStatus: u.operational_status,
      trainingCompleted: u.training_completed,
      bancaApproved: u.banca_approved,
      implantationApproved: u.implantation_approved,
    }));
  } else {
    availableUnits = memberships.map((m) => ({
      id: m.unitId,
      code: m.unitCode,
      name: m.unitName,
      city: m.unitCity,
      state: m.unitState,
      timezone: m.unitTimezone,
      unitType: m.unitType,
      operationalStatus: m.operationalStatus,
      trainingCompleted: m.trainingCompleted,
      bancaApproved: m.bancaApproved,
      implantationApproved: m.implantationApproved,
    }));
  }

  let selectedUnit: PortalUnitSummary | undefined;
  if (requestedUnitId) {
    selectedUnit = availableUnits.find((u) => u.id === requestedUnitId);
    if (!selectedUnit) {
      return {
        statusCode: 403,
        errorCode: 'FORBIDDEN_UNIT',
        message: 'Acesso negado à unidade solicitada. O usuário não possui vínculo autorizado.',
      };
    }
  } else if (profile.default_unit_id) {
    selectedUnit = availableUnits.find((u) => u.id === profile.default_unit_id) || availableUnits[0];
  } else {
    selectedUnit = availableUnits[0];
  }

  const effectiveMembership =
    memberships.find((m) => m.unitId === selectedUnit!.id) || elevatedMembership || memberships[0];

  const context: PortalSessionContext = {
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    phone: profile.phone,
    activeUnitId: selectedUnit.id,
    activeUnit: selectedUnit,
    activeRoleSlug: effectiveMembership.roleSlug,
    activeRoleName: effectiveMembership.roleName,
    activeScope: effectiveMembership.scope,
    permissions: effectiveMembership.permissions,
    memberships,
    availableUnits,
    sessionTokenHash: accessTokenForHash ? hashToken(accessTokenForHash) : '',
  };

  return { context };
}

export async function requirePortalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const cookieAccess = request.cookies?.[ACCESS_COOKIE_NAME];
  const cookieRefresh = request.cookies?.[REFRESH_COOKIE_NAME];
  let accessToken = bearerToken || cookieAccess;

  if (!accessToken && !cookieRefresh) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
      message: 'Autenticação necessária para acessar o Portal do Franqueado.',
    });
    return;
  }

  let authUserId: string | null = null;
  let tokenExplicitlyRevoked = false;

  if (accessToken) {
    if (await isTokenRevoked(hashToken(accessToken))) {
      tokenExplicitlyRevoked = true;
    } else {
      const localCheck = await verifyAccessTokenLocally(accessToken);
      if (localCheck.status === 'valid') {
        authUserId = localCheck.userId;
      } else if (localCheck.status === 'fallback_remote') {
        try {
          const timeoutPromise = new Promise<{ data: null; error: { status: number; message: string } }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: { status: 504, message: 'AUTH_UPSTREAM_TIMEOUT' } }), 5000)
          );
          const remoteRes = await Promise.race([
            supabaseAdmin.auth.getUser(accessToken),
            timeoutPromise,
          ]);
          const rErr = remoteRes.error as { status?: number } | null;
          if (!rErr && remoteRes.data?.user?.id) {
            authUserId = remoteRes.data.user.id;
            await cacheVerifiedAccessToken(accessToken, authUserId);
          } else if (rErr && (rErr.status === 504 || (typeof rErr.status === 'number' && rErr.status >= 500))) {
            reply.status(503).send({
              statusCode: 503,
              error: 'Service Unavailable',
              code: 'AUTH_UPSTREAM_TIMEOUT',
              message: 'Serviço de autenticação temporariamente lento. Tente novamente em instantes.',
            });
            return;
          }
        } catch {
          reply.status(503).send({
            statusCode: 503,
            error: 'Service Unavailable',
            code: 'AUTH_UPSTREAM_ERROR',
            message: 'Falha temporária ao consultar serviço de autenticação.',
          });
          return;
        }
      }
    }
  }

  if (!authUserId && !tokenExplicitlyRevoked && cookieRefresh && !bearerToken) {
    const refreshed = await refreshSessionSingleflight(cookieRefresh);
    if (refreshed) {
      accessToken = refreshed.accessToken;
      authUserId = refreshed.userId;
      setAuthCookies(reply, refreshed.accessToken, refreshed.refreshToken);
    }
  }

  if (!authUserId || !accessToken) {
    clearAuthCookies(reply);
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      code: tokenExplicitlyRevoked ? 'SESSION_REVOKED' : 'SESSION_EXPIRED',
      message: 'Sua sessão expirou ou o token é inválido. Faça login novamente.',
    });
    return;
  }

  const headerUnitId =
    typeof request.headers['x-unit-id'] === 'string' && request.headers['x-unit-id'].trim()
      ? request.headers['x-unit-id'].trim()
      : undefined;
  const cookieUnitId = request.cookies?.[UNIT_COOKIE_NAME];
  const requestedUnitId = headerUnitId || cookieUnitId || undefined;

  const built = await buildPortalContextForUser(authUserId, requestedUnitId, accessToken);
  if (!built.context) {
    reply.status(built.statusCode || 403).send({
      statusCode: built.statusCode || 403,
      error: 'Forbidden',
      code: built.errorCode || 'FORBIDDEN',
      message: built.message || 'Acesso negado ao portal.',
    });
    return;
  }

  request.portal = built.context;

  // Atualiza last_seen com throttle de 60s por usuário (evita contenção de lock em rajadas paralelas)
  const nowMs = Date.now();
  const prevSeen = lastSeenThrottle.get(authUserId) || 0;
  if (nowMs - prevSeen >= 60_000) {
    lastSeenThrottle.set(authUserId, nowMs);
    void dbQuery(`UPDATE portal.profiles SET last_seen_at = NOW() WHERE id = $1`, [authUserId]).catch(
      () => undefined
    );
  }
}

export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.portal) {
      reply.status(401).send({ statusCode: 401, code: 'AUTH_REQUIRED', message: 'Sessão não carregada.' });
      return;
    }
    if (!request.portal.permissions.includes(permission)) {
      reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        code: 'PERMISSION_DENIED',
        message: `Perfil '${request.portal.activeRoleName}' não possui permissão '${permission}'.`,
      });
    }
  };
}

export function requireAnyPermission(permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.portal) {
      reply.status(401).send({ statusCode: 401, code: 'AUTH_REQUIRED', message: 'Sessão não carregada.' });
      return;
    }
    const allowed = permissions.some((p) => request.portal!.permissions.includes(p));
    if (!allowed) {
      reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        code: 'PERMISSION_DENIED',
        message: `Acesso restrito para o perfil '${request.portal.activeRoleName}'.`,
      });
    }
  };
}

export function requireNetworkOrFactoryScope(allowedScopes: Array<'network' | 'factory'> = ['network']) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.portal) {
      reply.status(401).send({ statusCode: 401, code: 'AUTH_REQUIRED', message: 'Sessão não carregada.' });
      return;
    }
    if (!allowedScopes.includes(request.portal.activeScope as 'network' | 'factory')) {
      reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        code: 'SCOPE_FORBIDDEN',
        message: 'Esta ação é exclusiva da franqueadora/fábrica autorizada.',
      });
    }
  };
}

/**
 * Valida no backend se o resource pertence à unidade ativa selecionada
 * (ou se o usuário tem escopo elevado e permissão explícita naquela unidade).
 */
export function assertUnitOwnership(
  request: FastifyRequest,
  reply: FastifyReply,
  resourceUnitId: string | null
): boolean {
  const ctx = request.portal;
  if (!ctx) {
    reply.status(401).send({ statusCode: 401, code: 'AUTH_REQUIRED', message: 'Não autenticado.' });
    return false;
  }
  if (resourceUnitId === null) {
    return true;
  }
  if (resourceUnitId === ctx.activeUnitId) {
    return true;
  }
  if (ctx.activeScope === 'network' || ctx.activeScope === 'factory') {
    return true;
  }
  reply.status(403).send({
    statusCode: 403,
    error: 'Forbidden',
    code: 'CROSS_UNIT_ACCESS_DENIED',
    message: 'Registro pertence a outra unidade franqueada. Acesso bloqueado.',
  });
  return false;
}

export async function enforceRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedisClient();
  if (!redis) {
    return { allowed: true, remaining: maxAttempts };
  }
  try {
    const namespaced = `ks:rl:${key}`;
    const current = await redis.incr(namespaced);
    if (current === 1) {
      await redis.expire(namespaced, windowSeconds);
    }
    return {
      allowed: current <= maxAttempts,
      remaining: Math.max(0, maxAttempts - current),
    };
  } catch {
    return { allowed: true, remaining: maxAttempts };
  }
}
