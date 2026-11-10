'use strict';

const { getSupabaseAnon, isSupabaseConfigured } = require('../database/supabase');
const { UnauthorizedError, ForbiddenError, ServiceNotConfiguredError } = require('../utils/errors');

const SESSION_COOKIE = 'ks_session';
const REFRESH_COOKIE = 'ks_refresh';

function getCookieOptions(env, maxAgeMs, req = null) {
  const safeEnv = env || {};
  const isHttpsConfigured =
    String(safeEnv.CRM_URL || '').startsWith('https://') ||
    String(safeEnv.APP_URL || '').startsWith('https://');
  const forwardedProto = req
    ? String(req.headers?.['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase()
    : '';
  const isHttpsReq = Boolean(req && (req.secure || forwardedProto === 'https'));
  const rawHost = req
    ? String(req.headers?.['x-forwarded-host'] || req.headers?.host || '')
        .split(',')[0]
        .trim()
        .toLowerCase()
    : '';
  const hostname = rawHost.startsWith('[')
    ? rawHost.slice(0, rawHost.indexOf(']') + 1)
    : rawHost.split(':')[0].trim();
  const isLocalHttpHost =
    Boolean(hostname) &&
    (hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.localhost')) &&
    !isHttpsReq;

  const shouldSecure = Boolean(
    safeEnv.COOKIE_SECURE ||
      (safeEnv.NODE_ENV === 'production' && (isHttpsReq || (!isLocalHttpHost && isHttpsConfigured)))
  );
  const cookieDomain = String(safeEnv.COOKIE_DOMAIN || '').trim();

  const opts = {
    httpOnly: true,
    secure: shouldSecure,
    sameSite: 'lax',
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {})
  };
  if (typeof maxAgeMs === 'number') {
    opts.maxAge = maxAgeMs;
  }
  return opts;
}

function createAuthMiddleware({ settingsRepo, env, authVerifier = null }) {
  async function verifyAccessToken(token, refreshToken) {
    if (authVerifier) {
      return authVerifier(token, refreshToken);
    }
    if (!isSupabaseConfigured()) {
      throw new ServiceNotConfiguredError(
        'supabase',
        'Supabase Auth não configurado. Preencha SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.'
      );
    }

    const anon = getSupabaseAnon();
    const { data, error } = await anon.auth.getUser(token);
    if (!error && data?.user) {
      return { user: data.user, refreshedSession: null };
    }

    if (refreshToken) {
      const { data: refreshData, error: refreshErr } = await anon.auth.refreshSession({
        refresh_token: refreshToken
      });
      if (!refreshErr && refreshData?.session?.access_token && refreshData?.user) {
        return {
          user: refreshData.user,
          refreshedSession: refreshData.session
        };
      }
    }

    throw new UnauthorizedError('Sessão inválida ou expirada. Faça login novamente.');
  }

  async function requireAdminAuth(req, res, next) {
    try {
      const token = req.cookies?.[SESSION_COOKIE];
      const refreshToken = req.cookies?.[REFRESH_COOKIE];
      if (!token && !refreshToken) {
        throw new UnauthorizedError('Autenticação de administrador obrigatória.');
      }

      const { user, refreshedSession } = await verifyAccessToken(token, refreshToken);
      if (refreshedSession) {
        res.cookie(
          SESSION_COOKIE,
          refreshedSession.access_token,
          getCookieOptions(env, (refreshedSession.expires_in || 3600) * 1000, req)
        );
        if (refreshedSession.refresh_token) {
          res.cookie(
            REFRESH_COOKIE,
            refreshedSession.refresh_token,
            getCookieOptions(env, 1000 * 60 * 60 * 24 * 14, req)
          );
        }
      }

      const adminUser = await settingsRepo.getAdminByAuthId(user.id);
      if (!adminUser) {
        throw new ForbiddenError('Usuário não cadastrado como administrador do CRM.');
      }
      if (!adminUser.is_active) {
        throw new ForbiddenError('Conta administrativa desativada.');
      }

      req.adminUser = {
        id: adminUser.id,
        auth_user_id: adminUser.auth_user_id,
        full_name: adminUser.full_name,
        email: adminUser.email,
        role_slug: adminUser.role?.slug || 'expansion_consultant',
        role_name: adminUser.role?.name || 'Consultor',
        permissions: adminUser.role?.permissions || []
      };
      req.sessionTokenHint = (refreshedSession?.access_token || token || user.id).slice(-24);
      return next();
    } catch (err) {
      return next(err);
    }
  }

  function requireRole(allowedRoles = []) {
    return (req, _res, next) => {
      if (!req.adminUser) {
        return next(new UnauthorizedError());
      }
      if (req.adminUser.role_slug === 'super_admin') {
        return next();
      }
      if (!allowedRoles.includes(req.adminUser.role_slug)) {
        return next(new ForbiddenError('Seu perfil administrativo não possui permissão para esta ação.'));
      }
      return next();
    };
  }

  return {
    SESSION_COOKIE,
    REFRESH_COOKIE,
    getCookieOptions,
    requireAdminAuth,
    requireRole
  };
}

module.exports = {
  createAuthMiddleware,
  SESSION_COOKIE,
  REFRESH_COOKIE
};
