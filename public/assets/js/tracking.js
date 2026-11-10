(function () {
  'use strict';

  var CONSENT_KEY = 'ks_lgpd_consent_v1';
  var SESSION_KEY = 'ks_session_id';
  var FIRST_TOUCH_KEY = 'ks_first_touch_v1';
  var LAST_TOUCH_KEY = 'ks_last_touch_v1';
  var FORM_START_SENT_KEY = 'ks_form_started_sent';

  var publicConfig = null;
  var scriptsLoaded = { gtm: false, ga4: false, meta: false };

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  // Google Consent Mode v2 default (denied before consent)
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
  });

  function generateUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'ks-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getSessionId() {
    try {
      var sid = localStorage.getItem(SESSION_KEY);
      if (!sid) {
        sid = generateUuid();
        localStorage.setItem(SESSION_KEY, sid);
      }
      return sid;
    } catch {
      return generateUuid();
    }
  }

  function captureAttribution() {
    var params = new URLSearchParams(window.location.search);
    var fbclid = params.get('fbclid');
    var fbcCookie = getCookie('_fbc');
    var fbpCookie = getCookie('_fbp');
    var fbcComputed = fbcCookie || (fbclid ? 'fb.1.' + Date.now() + '.' + fbclid : null);

    var touch = {
      session_id: getSessionId(),
      utm_source: params.get('utm_source') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null,
      utm_content: params.get('utm_content') || null,
      utm_term: params.get('utm_term') || null,
      gclid: params.get('gclid') || null,
      fbclid: fbclid || null,
      gbraid: params.get('gbraid') || null,
      wbraid: params.get('wbraid') || null,
      fbp: fbpCookie || null,
      fbc: fbcComputed || null,
      blog_post_slug: params.get('blog_post') || null,
      landing_page: window.location.href,
      referrer: document.referrer || null,
      timestamp: new Date().toISOString()
    };

    try {
      var existingFirst = localStorage.getItem(FIRST_TOUCH_KEY);
      if (!existingFirst) {
        localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
      }
      var hasNewCampaignParams = Boolean(
        touch.utm_source || touch.utm_campaign || touch.gclid || touch.fbclid || touch.gbraid || touch.wbraid
      );
      var existingLast = localStorage.getItem(LAST_TOUCH_KEY);
      if (!existingLast || hasNewCampaignParams) {
        localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(touch));
      }
    } catch {
      // ignore storage errors
    }

    return touch;
  }

  function getAttributionSnapshot() {
    var current = captureAttribution();
    try {
      var first = JSON.parse(localStorage.getItem(FIRST_TOUCH_KEY) || 'null') || current;
      var last = JSON.parse(localStorage.getItem(LAST_TOUCH_KEY) || 'null') || current;
      return { first_touch: first, last_touch: last };
    } catch {
      return { first_touch: current, last_touch: current };
    }
  }

  function getConsent() {
    try {
      var raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function applyGoogleConsent(consent) {
    gtag('consent', 'update', {
      analytics_storage: consent.analytics ? 'granted' : 'denied',
      ad_storage: consent.marketing ? 'granted' : 'denied',
      ad_user_data: consent.marketing ? 'granted' : 'denied',
      ad_personalization: consent.marketing ? 'granted' : 'denied'
    });
  }

  function loadConfiguredTags(config, consent) {
    if (!config || !config.tracking || !consent) return;
    var t = config.tracking;

    if ((consent.analytics || consent.marketing) && t.gtm_id && !scriptsLoaded.gtm) {
      scriptsLoaded.gtm = true;
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      var gtmScript = document.createElement('script');
      gtmScript.async = true;
      gtmScript.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(t.gtm_id);
      document.head.appendChild(gtmScript);
    }

    if (consent.analytics && t.ga4_measurement_id && !scriptsLoaded.ga4) {
      scriptsLoaded.ga4 = true;
      var gaScript = document.createElement('script');
      gaScript.async = true;
      gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(t.ga4_measurement_id);
      document.head.appendChild(gaScript);
      gtag('js', new Date());
      gtag('config', t.ga4_measurement_id, { send_page_view: true });
      if (t.google_ads_conversion_id) {
        gtag('config', t.google_ads_conversion_id);
      }
    }

    if (consent.marketing && t.meta_pixel_id && !scriptsLoaded.meta) {
      scriptsLoaded.meta = true;
      !(function (f, b, e, v, n, t2, s) {
        if (f.fbq) return;
        n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = !0;
        n.version = '2.0';
        n.queue = [];
        t2 = b.createElement(e);
        t2.async = !0;
        t2.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t2, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', t.meta_pixel_id);
      window.fbq('track', 'PageView', {}, { eventID: 'pv_' + generateUuid() });
    }
  }

  function saveConsent(analytics, marketing) {
    var consent = {
      analytics: Boolean(analytics),
      marketing: Boolean(marketing),
      functional: true,
      policy_version: '1.0',
      updated_at: new Date().toISOString()
    };
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    } catch {
      // ignore
    }
    applyGoogleConsent(consent);
    loadConfiguredTags(publicConfig, consent);

    fetch('/api/public/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: getSessionId(),
        analytics_consent: consent.analytics,
        marketing_consent: consent.marketing,
        functional_consent: true,
        policy_version: '1.0'
      })
    }).catch(function () {});

    return consent;
  }

  function pushEvent(eventName, payload, explicitEventId) {
    var eventId = explicitEventId || 'evt_' + generateUuid();
    var consent = getConsent() || { analytics: false, marketing: false, functional: true };

    window.dataLayer.push({
      event: eventName,
      event_id: eventId,
      session_id: getSessionId(),
      consent_analytics: consent.analytics,
      consent_marketing: consent.marketing,
      ...(payload || {})
    });

    if (consent.analytics && typeof window.gtag === 'function') {
      var gaMap = {
        cta_click: 'select_promotion',
        form_start: 'form_start',
        form_step_complete: 'form_progress',
        view_content: 'view_item',
        lead_submit: 'generate_lead'
      };
      if (gaMap[eventName]) {
        window.gtag('event', gaMap[eventName], {
          event_id: eventId,
          transaction_id: eventId,
          ...(payload || {})
        });
      }
    }

    if (consent.marketing && typeof window.fbq === 'function') {
      if (eventName === 'lead_submit') {
        window.fbq('track', 'Lead', { content_name: 'Franquia King Sports' }, { eventID: eventId });
      } else if (eventName === 'view_content') {
        window.fbq('track', 'ViewContent', { content_name: payload?.section || 'Franquia' }, { eventID: eventId });
      }
    }

    if (consent.analytics || consent.marketing) {
      fetch('/api/public/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          event_id: eventId,
          session_id: getSessionId(),
          event_name: eventName,
          page_url: window.location.href,
          referrer: document.referrer || '',
          payload: payload || {},
          consent: consent
        })
      }).catch(function () {});
    }

    return eventId;
  }

  function injectCookieBanner() {
    if (document.getElementById('ks-cookie-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'ks-cookie-banner';
    banner.className = 'ks-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Preferências de Privacidade e Cookies');
    banner.innerHTML =
      '<h3>Privacidade &amp; Cookies (LGPD)</h3>' +
      '<p>Utilizamos cookies essenciais para o funcionamento do formulário e, mediante seu consentimento, cookies analíticos e de mídia para mensurar campanhas. Leia nossa <a href="/privacidade.html" style="color:#38BDF8;text-decoration:underline;">Política de Privacidade</a>.</p>' +
      '<div class="ks-cookie-actions">' +
      '  <button type="button" class="ks-btn ks-btn-primary ks-btn-sm" id="ks-consent-accept-all">Aceitar todos</button>' +
      '  <button type="button" class="ks-btn ks-btn-secondary ks-btn-sm" id="ks-consent-essential">Apenas essenciais</button>' +
      '  <button type="button" class="ks-link-btn" id="ks-consent-toggle-prefs" style="font-size:0.82rem;color:#38BDF8;margin-left:auto;">Personalizar</button>' +
      '</div>' +
      '<div class="ks-cookie-prefs-panel" id="ks-cookie-prefs-panel">' +
      '  <label class="ks-cookie-toggle"><span>Cookies Essenciais (obrigatório)</span><input type="checkbox" checked disabled /></label>' +
      '  <label class="ks-cookie-toggle"><span>Métricas &amp; Analytics (GA4 / GTM)</span><input type="checkbox" id="ks-pref-analytics" checked /></label>' +
      '  <label class="ks-cookie-toggle"><span>Publicidade &amp; Atribuição (Meta / Google Ads)</span><input type="checkbox" id="ks-pref-marketing" checked /></label>' +
      '  <button type="button" class="ks-btn ks-btn-primary ks-btn-sm" id="ks-consent-save-prefs">Salvar preferências</button>' +
      '</div>';

    document.body.appendChild(banner);

    var existing = getConsent();
    if (!existing) {
      banner.classList.add('visible');
    }

    document.getElementById('ks-consent-accept-all').addEventListener('click', function () {
      saveConsent(true, true);
      banner.classList.remove('visible');
    });
    document.getElementById('ks-consent-essential').addEventListener('click', function () {
      saveConsent(false, false);
      banner.classList.remove('visible');
    });
    document.getElementById('ks-consent-toggle-prefs').addEventListener('click', function () {
      document.getElementById('ks-cookie-prefs-panel').classList.toggle('open');
    });
    document.getElementById('ks-consent-save-prefs').addEventListener('click', function () {
      var a = document.getElementById('ks-pref-analytics').checked;
      var m = document.getElementById('ks-pref-marketing').checked;
      saveConsent(a, m);
      banner.classList.remove('visible');
    });

    var openBtn = document.getElementById('ks-open-consent-prefs');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        banner.classList.add('visible');
        document.getElementById('ks-cookie-prefs-panel').classList.add('open');
      });
    }
  }

  function bindCtaTracking() {
    document.addEventListener('click', function (e) {
      var cta = e.target.closest('[data-track-cta]');
      if (!cta) return;
      pushEvent('cta_click', {
        cta_id: cta.getAttribute('data-track-cta'),
        cta_text: (cta.textContent || '').trim().slice(0, 60)
      });
    });
  }

  async function init() {
    captureAttribution();
    injectCookieBanner();
    bindCtaTracking();

    try {
      var resp = await fetch('/api/public/config');
      if (resp.ok) {
        publicConfig = await resp.json();
        window.dispatchEvent(new CustomEvent('ks:config-loaded', { detail: publicConfig }));
      }
    } catch {
      // ignore offline/preview config load errors
    }

    var consent = getConsent();
    if (consent) {
      applyGoogleConsent(consent);
      loadConfiguredTags(publicConfig, consent);
    }
  }

  window.KingTracking = {
    generateUuid: generateUuid,
    getSessionId: getSessionId,
    getAttributionSnapshot: getAttributionSnapshot,
    getConsent: getConsent,
    saveConsent: saveConsent,
    pushEvent: pushEvent,
    trackFormStart: function () {
      try {
        if (sessionStorage.getItem(FORM_START_SENT_KEY)) return;
        sessionStorage.setItem(FORM_START_SENT_KEY, '1');
      } catch {}
      pushEvent('form_start', { form_name: 'candidatura_franquia' });
    },
    trackBlogView: function (slug) {
      fetch('/api/public/blog/' + encodeURIComponent(slug) + '/view', { method: 'POST' }).catch(function () {});
      pushEvent('view_content', { content_type: 'blog_article', slug: slug });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
