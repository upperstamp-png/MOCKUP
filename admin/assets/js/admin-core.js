(function () {
  'use strict';

  var currentUser = null;
  var csrfToken = '';
  var publicConfigPromise = null;
  var publicUrls = {
    lpOrigin: '',
    hubOrigin: '',
    lpUrl: '',
    hubLoginUrl: ''
  };

  function isAdminSubpath() {
    if (typeof window === 'undefined' || !window.location) return false;
    var pathname = window.location.pathname || '';
    return pathname === '/admin' || pathname.startsWith('/admin/');
  }

  function isLoopbackHost(hostname) {
    return /^(localhost|127\.0\.0\.1)$/i.test(String(hostname || '').trim());
  }

  function crmUrl(page) {
    var raw = String(page == null ? '' : page).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    var clean = raw.replace(/^\/+/, '');
    if (clean === 'admin') {
      clean = '';
    } else if (clean.indexOf('admin/') === 0) {
      clean = clean.slice(6);
    }
    var prefix = isAdminSubpath() ? '/admin' : '';
    if (!clean) return prefix || '/';
    return prefix + '/' + clean;
  }

  function resolveAdminApi(url) {
    var raw = String(url == null ? '' : url).trim();
    if (!raw) return '/api/admin';
    if (/^https?:\/\//i.test(raw)) return raw;
    var normalized = raw.charAt(0) === '/' ? raw : '/' + raw;
    if (normalized === '/api' || normalized.indexOf('/api/') === 0) {
      return normalized;
    }
    if (normalized === '/admin' || normalized.indexOf('/admin/') === 0) {
      return '/api' + normalized;
    }
    return '/api/admin' + normalized;
  }

  function sanitizeHref(candidate, fallback) {
    var val = String(candidate || '').trim();
    if (/^(https?:\/\/|\/)/i.test(val)) return val;
    return fallback;
  }

  function trimOrigin(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function buildJoinedUrl(origin, subpath) {
    var raw = String(subpath == null ? '' : subpath).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    var clean = raw ? (raw.charAt(0) === '/' ? raw : '/' + raw) : '/';
    if (!origin || origin === '/') return clean;
    return trimOrigin(origin) + clean;
  }

  function getFallbackCrossUrls() {
    var host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    var proto = (typeof window !== 'undefined' && window.location && window.location.protocol) || 'https:';
    var port = (typeof window !== 'undefined' && window.location && window.location.port)
      ? ':' + window.location.port
      : '';

    if (isAdminSubpath() || isLoopbackHost(host)) {
      return {
        isUnified: true,
        lpOrigin: '',
        hubOrigin: '/hub',
        lpUrl: '/',
        hubLoginUrl: '/hub/login'
      };
    }

    var metaLp = typeof document !== 'undefined'
      ? document.querySelector('meta[name="ks-lp-url"]')
      : null;
    var configuredLp =
      (typeof window !== 'undefined' && (window.__KS_LP_URL__ || window.KS_LP_URL)) ||
      (metaLp && metaLp.getAttribute('content')) ||
      '';

    var derivedLpOrigin = '';
    var derivedHubOrigin = '/hub';
    if (/^crm\./i.test(host)) {
      var baseHost = host.slice(4);
      if (baseHost === 'kingsports.com.br') {
        derivedLpOrigin = proto + '//lp.kinsports.com.br' + port;
      } else {
        derivedLpOrigin = proto + '//lp.' + baseHost + port;
      }
      derivedHubOrigin = proto + '//app.' + baseHost + port;
    }

    var lpOrigin = trimOrigin(sanitizeHref(publicUrls.lpOrigin || configuredLp, derivedLpOrigin));
    var hubOrigin = trimOrigin(sanitizeHref(publicUrls.hubOrigin, derivedHubOrigin));

    return {
      isUnified: false,
      lpOrigin: lpOrigin,
      hubOrigin: hubOrigin,
      lpUrl: lpOrigin ? lpOrigin + '/' : '/',
      hubLoginUrl: sanitizeHref(publicUrls.hubLoginUrl, hubOrigin ? hubOrigin + '/login' : '/hub/login')
    };
  }

  function lpUrl(subpath) {
    var cross = getFallbackCrossUrls();
    return buildJoinedUrl(cross.lpOrigin, subpath);
  }

  function hubUrl(subpath) {
    var cross = getFallbackCrossUrls();
    var raw = String(subpath == null ? '' : subpath).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (cross.isUnified) {
      var clean = raw.replace(/^\/+/, '');
      if (!clean || clean === 'hub') return '/hub';
      if (clean.indexOf('hub/') === 0) return '/' + clean;
      return '/hub/' + clean;
    }
    return buildJoinedUrl(cross.hubOrigin, raw || '/login');
  }

  function syncCrossUrlElements() {
    if (typeof document === 'undefined') return;
    var cross = getFallbackCrossUrls();
    var lpLink = document.getElementById('ad-lp-link');
    if (lpLink) lpLink.setAttribute('href', cross.lpUrl);
    var hubLink = document.getElementById('ad-hub-link');
    if (hubLink) hubLink.setAttribute('href', cross.hubLoginUrl);
    var lpNodes = document.querySelectorAll('[data-ks-lp-path]');
    for (var i = 0; i < lpNodes.length; i++) {
      lpNodes[i].setAttribute('href', lpUrl(lpNodes[i].getAttribute('data-ks-lp-path')));
    }
    var hubNodes = document.querySelectorAll('[data-ks-hub-path]');
    for (var j = 0; j < hubNodes.length; j++) {
      hubNodes[j].setAttribute('href', hubUrl(hubNodes[j].getAttribute('data-ks-hub-path')));
    }
  }

  function loadPublicConfigUrls() {
    if (isAdminSubpath() || publicConfigPromise) return publicConfigPromise;
    publicConfigPromise = fetch(resolveAdminApi('/api/public/config'), { credentials: 'same-origin' })
      .then(function (resp) {
        return resp.ok ? resp.json() : null;
      })
      .then(function (cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        var urls = cfg.urls || cfg.domains || {};
        var franchise = cfg.franchise || {};
        var lpCandidate =
          cfg.lpUrl ||
          cfg.lp_url ||
          urls.lpUrl ||
          urls.lp_url ||
          urls.lp ||
          franchise.lp_url ||
          franchise.lpUrl ||
          '';
        var appCandidate =
          cfg.hubLoginUrl ||
          urls.hubLoginUrl ||
          cfg.appUrl ||
          cfg.app_url ||
          cfg.hubUrl ||
          cfg.hub_url ||
          urls.appUrl ||
          urls.app_url ||
          urls.app ||
          urls.hubUrl ||
          urls.hub ||
          '';

        if (lpCandidate && /^(https?:\/\/|\/)/i.test(String(lpCandidate).trim())) {
          publicUrls.lpOrigin = trimOrigin(String(lpCandidate).trim());
          publicUrls.lpUrl = publicUrls.lpOrigin ? publicUrls.lpOrigin + '/' : '/';
        }

        if (appCandidate && /^(https?:\/\/|\/)/i.test(String(appCandidate).trim())) {
          var cleanApp = trimOrigin(String(appCandidate).trim()).replace(/\/login(?:[?#].*)?$/i, '');
          publicUrls.hubOrigin = cleanApp;
          publicUrls.hubLoginUrl = cleanApp ? cleanApp + '/login' : '/hub/login';
        }
        syncCrossUrlElements();
      })
      .catch(function () {});
    return publicConfigPromise;
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBrl(value) {
    if (value == null || isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(iso));
    } catch {
      return String(iso);
    }
  }

  function showToast(message, isError) {
    var old = document.getElementById('ad-toast');
    if (old) old.remove();
    var div = document.createElement('div');
    div.id = 'ad-toast';
    div.className = 'ad-toast';
    div.style.borderColor = isError ? '#EF4444' : '#68D8FF';
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(function () {
      div.remove();
    }, 4200);
  }

  async function apiFetch(url, options) {
    var resolvedUrl = resolveAdminApi(url);
    var opts = Object.assign({ credentials: 'same-origin' }, options || {});
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    var method = (opts.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }
    opts.headers = headers;

    var resp = await fetch(resolvedUrl, opts);
    var text = await resp.text();
    var json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (resp.status === 401 && !resolvedUrl.includes('/auth/login')) {
      window.location.href = crmUrl('login.html');
      throw new Error('Sessão expirada.');
    }

    if (!resp.ok) {
      var err = new Error(json?.error?.message || 'Erro HTTP ' + resp.status);
      err.status = resp.status;
      err.code = json?.error?.code;
      throw err;
    }

    return json;
  }

  function renderSidebar(activeSlug) {
    var el = document.getElementById('ad-sidebar');
    if (!el) return;

    var items = [
      { slug: 'dashboard', href: crmUrl('dashboard.html'), label: 'Dashboard Geral' },
      { slug: 'leads', href: crmUrl('leads.html'), label: 'Leads' },
      { slug: 'pipeline', href: crmUrl('pipeline.html'), label: 'Pipeline Kanban' },
      { slug: 'campanhas', href: crmUrl('campanhas.html'), label: 'Campanhas & Mídia' },
      { slug: 'analytics', href: crmUrl('analytics.html'), label: 'Analytics & Tracking' },
      { slug: 'automacoes', href: crmUrl('automacoes.html'), label: 'Automações & Filas' },
      { slug: 'blog', href: crmUrl('blog.html'), label: 'Blog CMS' },
      { slug: 'configuracoes', href: crmUrl('configuracoes.html'), label: 'Configurações' }
    ];

    var crossUrls = getFallbackCrossUrls();

    el.innerHTML =
      '<div class="ad-brand">' +
      '  <a href="' + esc(crmUrl('dashboard.html')) + '"><img src="/assets/images/logo-king-dark-bg.png" alt="King Sports" height="30" /></a>' +
      '  <button type="button" class="ad-btn ad-btn-secondary ad-btn-sm ad-mobile-toggle" id="ad-nav-toggle">Menu</button>' +
      '</div>' +
      '<nav class="ad-nav" id="ad-nav-links">' +
      items
        .map(function (it) {
          return '<a href="' + esc(it.href) + '" class="' + (activeSlug === it.slug ? 'active' : '') + '">' + esc(it.label) + '</a>';
        })
        .join('') +
      '</nav>' +
      '<div class="ad-user-box">' +
      '  <div class="ad-user-name">' + esc(currentUser ? currentUser.full_name : 'Carregando...') + '</div>' +
      '  <div class="ad-user-role">' + esc(currentUser ? currentUser.role_name : '') + '</div>' +
      '  <div style="display:flex;gap:6px;flex-wrap:wrap;">' +
      '    <a id="ad-lp-link" href="' + esc(crossUrls.lpUrl) + '" target="_blank" rel="noopener noreferrer" class="ad-btn ad-btn-secondary ad-btn-sm" style="flex:1;">Ver Site</a>' +
      '    <a id="ad-hub-link" href="' + esc(crossUrls.hubLoginUrl) + '" target="_blank" rel="noopener noreferrer" class="ad-btn ad-btn-secondary ad-btn-sm">Portal HUB</a>' +
      '    <button type="button" id="ad-logout-btn" class="ad-btn ad-btn-danger ad-btn-sm">Sair</button>' +
      '  </div>' +
      '</div>';

    var toggle = document.getElementById('ad-nav-toggle');
    var navLinks = document.getElementById('ad-nav-links');
    if (toggle && navLinks) {
      toggle.addEventListener('click', function () {
        navLinks.classList.toggle('open');
      });
    }

    var logoutBtn = document.getElementById('ad-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function () {
        await fetch(resolveAdminApi('/api/admin/auth/logout'), {
          method: 'POST',
          credentials: 'same-origin'
        }).catch(function () {});
        window.location.href = crmUrl('login.html');
      });
    }
  }

  async function initProtectedPage(activeSlug) {
    renderSidebar(activeSlug);
    loadPublicConfigUrls();
    try {
      var data = await apiFetch('/api/admin/auth/me');
      currentUser = data.user;
      csrfToken = data.csrf_token || '';
      renderSidebar(activeSlug);
      return currentUser;
    } catch (err) {
      var banner = document.getElementById('ad-global-alert');
      if (banner) {
        banner.innerHTML =
          '<div class="ad-alert ad-alert-error">' + esc(err.message) + '</div>';
      }
      return null;
    }
  }

  function renderErrorState(containerId, err) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML =
      '<div class="ad-alert ad-alert-error"><strong>Não foi possível carregar os dados:</strong> ' +
      esc(err.message || 'Erro de conexão.') +
      '</div>';
  }

  var adminApi = {
    esc: esc,
    formatBrl: formatBrl,
    formatDate: formatDate,
    showToast: showToast,
    isAdminSubpath: isAdminSubpath,
    crmUrl: crmUrl,
    lpUrl: lpUrl,
    hubUrl: hubUrl,
    loadPublicConfigUrls: loadPublicConfigUrls,
    syncCrossUrlElements: syncCrossUrlElements,
    resolveAdminApi: resolveAdminApi,
    apiFetch: apiFetch,
    initProtectedPage: initProtectedPage,
    renderErrorState: renderErrorState,
    getUser: function () {
      return currentUser;
    }
  };

  window.KingAdmin = adminApi;
  window.KSAdmin = adminApi;
})();
