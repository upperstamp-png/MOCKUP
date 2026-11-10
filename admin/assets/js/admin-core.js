(function () {
  'use strict';

  var currentUser = null;
  var csrfToken = '';

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
    var opts = Object.assign({ credentials: 'same-origin' }, options || {});
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    var method = (opts.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }
    opts.headers = headers;

    var resp = await fetch(url, opts);
    var text = await resp.text();
    var json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (resp.status === 401 && !url.includes('/auth/login')) {
      window.location.href = '/admin/login.html';
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
      { slug: 'dashboard', href: '/admin/dashboard.html', label: 'Dashboard Geral' },
      { slug: 'leads', href: '/admin/leads.html', label: 'Leads' },
      { slug: 'pipeline', href: '/admin/pipeline.html', label: 'Pipeline Kanban' },
      { slug: 'campanhas', href: '/admin/campanhas.html', label: 'Campanhas & Mídia' },
      { slug: 'analytics', href: '/admin/analytics.html', label: 'Analytics & Tracking' },
      { slug: 'automacoes', href: '/admin/automacoes.html', label: 'Automações & Filas' },
      { slug: 'blog', href: '/admin/blog.html', label: 'Blog CMS' },
      { slug: 'configuracoes', href: '/admin/configuracoes.html', label: 'Configurações' }
    ];

    el.innerHTML =
      '<div class="ad-brand">' +
      '  <a href="/admin/dashboard.html"><img src="/assets/images/logo-king-dark-bg.png" alt="King Sports" height="30" /></a>' +
      '  <button type="button" class="ad-btn ad-btn-secondary ad-btn-sm ad-mobile-toggle" id="ad-nav-toggle">Menu</button>' +
      '</div>' +
      '<nav class="ad-nav" id="ad-nav-links">' +
      items
        .map(function (it) {
          return '<a href="' + it.href + '" class="' + (activeSlug === it.slug ? 'active' : '') + '">' + esc(it.label) + '</a>';
        })
        .join('') +
      '</nav>' +
      '<div class="ad-user-box">' +
      '  <div class="ad-user-name">' + esc(currentUser ? currentUser.full_name : 'Carregando...') + '</div>' +
      '  <div class="ad-user-role">' + esc(currentUser ? currentUser.role_name : '') + '</div>' +
      '  <div style="display:flex;gap:6px;flex-wrap:wrap;">' +
      '    <a href="/" target="_blank" rel="noopener noreferrer" class="ad-btn ad-btn-secondary ad-btn-sm" style="flex:1;">Ver Site</a>' +
      '    <a href="/hub/login" target="_blank" rel="noopener noreferrer" class="ad-btn ad-btn-secondary ad-btn-sm">Portal HUB</a>' +
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
        await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'same-origin' });
        window.location.href = '/admin/login.html';
      });
    }
  }

  async function initProtectedPage(activeSlug) {
    renderSidebar(activeSlug);
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

  window.KingAdmin = {
    esc: esc,
    formatBrl: formatBrl,
    formatDate: formatDate,
    showToast: showToast,
    apiFetch: apiFetch,
    initProtectedPage: initProtectedPage,
    renderErrorState: renderErrorState,
    getUser: function () {
      return currentUser;
    }
  };
})();
