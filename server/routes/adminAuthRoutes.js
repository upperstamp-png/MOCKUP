'use strict';

const express = require('express');
const { validateBody } = require('../middleware/validate');
const { loginSchema, passwordResetRequestSchema } = require('../utils/validators');
const { getSupabaseAnon, isSupabaseConfigured } = require('../database/supabase');
const {
  UnauthorizedError,
  ForbiddenError,
  ServiceNotConfiguredError
} = require('../utils/errors');
const { issueCsrfToken } = require('../middleware/csrfMiddleware');

function resolvePasswordResetRedirectUrl(req, env) {
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  const hostname = rawHost.startsWith('[')
    ? rawHost.slice(0, rawHost.indexOf(']') + 1).toLowerCase()
    : rawHost.split(':')[0].trim().toLowerCase();
  const crmHost = String(env?.CRM_HOST || '').trim().toLowerCase();
  const isCrmHost = Boolean(
    hostname &&
      ((crmHost && hostname === crmHost) ||
        hostname === 'crm.kingsports.com.br' ||
        hostname === 'crm.localhost' ||
        hostname.startsWith('crm.'))
  );

  const cleanCrmUrl = String(env?.CRM_URL || '').trim().replace(/\/+$/, '');
  if (isCrmHost) {
    let crmUrlHostname = '';
    if (cleanCrmUrl) {
      try {
        crmUrlHostname = new URL(cleanCrmUrl).hostname.toLowerCase();
      } catch {
        crmUrlHostname = '';
      }
    }
    const isLocalCrmHost = hostname === 'crm.localhost' || hostname.endsWith('.localhost');
    if (cleanCrmUrl && (!isLocalCrmHost || crmUrlHostname === hostname || crmUrlHostname.startsWith('crm.'))) {
      return `${cleanCrmUrl}/login.html`;
    }
    if (rawHost) {
      const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
        .split(',')[0]
        .trim();
      return `${proto}://${rawHost}/login.html`;
    }
    if (cleanCrmUrl) {
      return `${cleanCrmUrl}/login.html`;
    }
  }

  const cleanAppUrl = String(env?.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${cleanAppUrl}/admin/login.html`;
}

function createAdminAuthRoutes({
  settingsRepo,
  authMiddleware,
  env,
  limiters,
  signInFn = null
}) {
  const router = express.Router();
  const { SESSION_COOKIE, REFRESH_COOKIE, getCookieOptions, requireAdminAuth } = authMiddleware;

  router.post(
    '/auth/login',
    limiters.adminLoginLimiter,
    validateBody(loginSchema),
    async (req, res, next) => {
      try {
        const { email, password } = req.validatedBody;
        let authResult;

        if (signInFn) {
          authResult = await signInFn(email, password);
        } else {
          if (!isSupabaseConfigured()) {
            throw new ServiceNotConfiguredError(
              'supabase',
              'Supabase Auth não configurado. Configure SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY no .env.'
            );
          }
          const anon = getSupabaseAnon();
          const { data, error } = await anon.auth.signInWithPassword({ email, password });
          if (error || !data?.session || !data?.user) {
            throw new UnauthorizedError('E-mail ou senha inválidos.');
          }
          authResult = data;
        }

        const adminUser = await settingsRepo.getAdminByAuthId(authResult.user.id);
        if (!adminUser) {
          throw new ForbiddenError('Sua conta não está autorizada no CRM King Sports.');
        }
        if (!adminUser.is_active) {
          throw new ForbiddenError('Usuário administrativo desativado.');
        }

        await settingsRepo.updateAdminLoginTime(adminUser.id);
        await settingsRepo.recordAuditLog({
          actor_admin_id: adminUser.id,
          actor_email: adminUser.email,
          action: 'admin.login',
          entity_type: 'admin_user',
          entity_id: adminUser.id,
          ip_address: req.ip,
          user_agent: String(req.get('user-agent') || '').slice(0, 300)
        });

        const accessToken = authResult.session.access_token;
        const refreshToken = authResult.session.refresh_token;
        res.cookie(
          SESSION_COOKIE,
          accessToken,
          getCookieOptions(env, (authResult.session.expires_in || 3600) * 1000, req)
        );
        if (refreshToken) {
          res.cookie(REFRESH_COOKIE, refreshToken, getCookieOptions(env, 1000 * 60 * 60 * 24 * 14, req));
        }

        req.sessionTokenHint = accessToken.slice(-24);
        const csrfToken = issueCsrfToken(req);

        return res.json({
          authenticated: true,
          csrf_token: csrfToken,
          user: {
            id: adminUser.id,
            full_name: adminUser.full_name,
            email: adminUser.email,
            role_slug: adminUser.role?.slug,
            role_name: adminUser.role?.name
          }
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post('/auth/logout', async (req, res) => {
    const clearOptions = getCookieOptions(env, undefined, req);
    res.clearCookie(SESSION_COOKIE, clearOptions);
    res.clearCookie(REFRESH_COOKIE, clearOptions);
    res.json({ authenticated: false });
  });

  router.post(
    '/auth/forgot-password',
    limiters.adminLoginLimiter,
    validateBody(passwordResetRequestSchema),
    async (req, res, next) => {
      try {
        if (!isSupabaseConfigured()) {
          throw new ServiceNotConfiguredError('supabase');
        }
        const anon = getSupabaseAnon();
        await anon.auth.resetPasswordForEmail(req.validatedBody.email, {
          redirectTo: resolvePasswordResetRedirectUrl(req, env)
        });
        // Always return generic success message to prevent user enumeration
        res.json({
          success: true,
          message: 'Se o e-mail estiver cadastrado no painel administrativo, enviaremos instruções de recuperação.'
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/auth/me', requireAdminAuth, (req, res) => {
    const csrfToken = issueCsrfToken(req);
    res.json({
      authenticated: true,
      csrf_token: csrfToken,
      user: req.adminUser
    });
  });

  return router;
}

module.exports = { createAdminAuthRoutes, resolvePasswordResetRedirectUrl };
