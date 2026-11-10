(function () {
  'use strict';

  var formStartedAt = Date.now();
  var currentStep = 1;

  function sanitizeHttpUrl(candidate) {
    var val = String(candidate || '').trim().replace(/\/+$/, '');
    return /^https?:\/\//i.test(val) ? val : '';
  }

  function applyCrossDomainLinks(cfg) {
    var hostname = (window.location && window.location.hostname) || '';
    if (!/^lp\./i.test(hostname)) return;

    var proto = (window.location && window.location.protocol) || 'https:';
    var port = window.location && window.location.port ? ':' + window.location.port : '';
    var baseHost = hostname.slice(3);

    var urls = (cfg && cfg.urls) || {};
    var hubBase = sanitizeHttpUrl(urls.hub_url) || proto + '//app.' + baseHost + port;
    var crmBase = sanitizeHttpUrl(urls.crm_url) || proto + '//crm.' + baseHost + port;

    var hubLoginUrl = /\/login$/i.test(hubBase) ? hubBase : hubBase + '/login';
    var crmLoginUrl = /\/login\.html$/i.test(crmBase) ? crmBase : crmBase + '/login.html';

    document.querySelectorAll('a[href="/hub/login"], a[data-ks-cross-link="hub"]').forEach(function (a) {
      a.setAttribute('data-ks-cross-link', 'hub');
      a.setAttribute('href', hubLoginUrl);
    });

    document.querySelectorAll('a[href="/admin/login.html"], a[data-ks-cross-link="crm"]').forEach(function (a) {
      a.setAttribute('data-ks-cross-link', 'crm');
      a.setAttribute('href', crmLoginUrl);
    });
  }

  function applyDynamicConfig(cfg) {
    if (!cfg) return;
    applyCrossDomainLinks(cfg);
    if (!cfg.landing_content) return;
    var lc = cfg.landing_content;
    var map = {
      'ks-hero-tag': lc.hero_tag,
      'ks-hero-headline': lc.hero_headline,
      'ks-hero-subheadline': lc.hero_subheadline,
      'ks-submit-btn': lc.final_cta_text
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || !map[id]) return;
      var defText = el.getAttribute('data-default-text');
      if (defText && String(map[id]).trim() === defText.trim()) return;
      el.textContent = map[id];
    });
    var heroCta = document.getElementById('ks-hero-cta');
    if (heroCta && lc.hero_cta_text) {
      var defCta = heroCta.getAttribute('data-default-text');
      if (!defCta || String(lc.hero_cta_text).trim() !== defCta.trim()) {
        var span = heroCta.querySelector('span');
        if (span) span.textContent = lc.hero_cta_text;
      }
    }
  }

  function initMobileMenu() {
    var btn = document.getElementById('ks-hamburger-btn');
    var drawer = document.getElementById('ks-mobile-drawer');
    if (!btn || !drawer || btn.dataset.ksMenuBound === '1') return;
    btn.dataset.ksMenuBound = '1';
    btn.addEventListener('click', function () {
      var open = drawer.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    drawer.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        drawer.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && drawer.classList.contains('open')) {
        drawer.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function initMarquees() {
    var ticker = document.querySelector('.ks-ticker-track');
    if (ticker && ticker.firstElementChild && ticker.children.length === 1) {
      ticker.appendChild(ticker.firstElementChild.cloneNode(true));
    }
    var linesTrack = document.getElementById('ks-lines-track');
    if (linesTrack && linesTrack.children.length > 0 && !linesTrack.dataset.cloned) {
      linesTrack.dataset.cloned = '1';
      Array.prototype.slice.call(linesTrack.children).forEach(function (node) {
        var copy = node.cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        linesTrack.appendChild(copy);
      });
    }
  }

  function initVectorArt() {
    var NS = 'http://www.w3.org/2000/svg';
    var CHEVRON_URL = '/assets/images/king-chevron.svg';
    var uid = 0;

    function createGradient(svg, id) {
      var defs = document.createElementNS(NS, 'defs');
      defs.innerHTML =
        '<linearGradient id="' +
        id +
        '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#68D8FF"/>' +
        '<stop offset="0.52" stop-color="#D6E2F1"/>' +
        '<stop offset="1" stop-color="#0356C5"/>' +
        '</linearGradient>';
      svg.appendChild(defs);
    }

    function createRect(svg, x, y, w, h, r, op, gid) {
      var el = document.createElementNS(NS, 'rect');
      [
        ['x', x],
        ['y', y],
        ['width', w],
        ['height', h],
        ['rx', r],
        ['fill', 'none'],
        ['stroke', 'url(#' + gid + ')'],
        ['stroke-width', 1.4],
        ['opacity', op]
      ].forEach(function (pair) {
        el.setAttribute(pair[0], pair[1]);
      });
      svg.appendChild(el);
    }

    document.querySelectorAll('[data-tunnel]').forEach(function (box) {
      if (box.firstChild) return;
      var parts = box.dataset.tunnel.split(',').map(Number);
      var n = parts[0];
      var w = parts[1];
      var h = parts[2];
      var step = parts[3];
      var W = w + (n - 1) * step * 1.6 + 4;
      var H = h + (n - 1) * step + 4;
      var svg = document.createElementNS(NS, 'svg');
      var gid = 'ks-tg-' + uid++;
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      createGradient(svg, gid);
      for (var i = 0; i < n; i++) {
        var rw = w + i * step * 1.6;
        var rh = h + i * step;
        createRect(svg, (W - rw) / 2, (H - rh) / 2, rw, rh, 14 + i * 2, (0.52 - i * 0.06).toFixed(2), gid);
      }
      box.appendChild(svg);
    });

    document.querySelectorAll('[data-tile]').forEach(function (box) {
      if (box.firstChild) return;
      var svg = document.createElementNS(NS, 'svg');
      var gid = 'ks-tg-' + uid++;
      svg.setAttribute('viewBox', '0 0 640 480');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      createGradient(svg, gid);
      for (var i = 6; i >= 0; i--) {
        var W = 114 + i * 52;
        var H = 104 + i * 48;
        createRect(svg, 320 - W / 2, 240 - H / 2, W, H, 12 + i * 2, (0.95 - i * 0.12).toFixed(2), gid);
      }
      var img = document.createElementNS(NS, 'image');
      img.setAttribute('href', CHEVRON_URL);
      img.setAttribute('x', '286');
      img.setAttribute('y', '206');
      img.setAttribute('width', '68');
      img.setAttribute('height', '68');
      svg.appendChild(img);
      box.appendChild(svg);
    });
  }

  function initCounters() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
    if (!els.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;

    function fmt(el, val) {
      if (el.dataset.plain) {
        return (el.dataset.prefix || '') + Math.round(val) + (el.dataset.suffix || '');
      }
      var dec = Number(el.dataset.dec || 0);
      return (
        (el.dataset.prefix || '') +
        val.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) +
        (el.dataset.suffix || '')
      );
    }

    els.forEach(function (el) {
      el.setAttribute('aria-label', el.textContent);
      var startVal = el.dataset.plain ? 1900 : 0;
      el.textContent = fmt(el, startVal);
    });

    function run(el, delay) {
      var end = parseFloat(el.dataset.count);
      var start = el.dataset.plain ? 1900 : 0;
      var dur = 1600;
      var t0 = null;
      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0 - delay) / dur);
        if (p < 0) {
          requestAnimationFrame(step);
          return;
        }
        var ease = 1 - Math.pow(1 - p, 4);
        el.textContent = fmt(el, start + (end - start) * ease);
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = fmt(el, end);
      }
      requestAnimationFrame(step);
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          run(en.target, els.indexOf(en.target) * 140);
        });
      },
      { threshold: 0.5 }
    );

    els.forEach(function (el) {
      io.observe(el);
    });
  }

  function initComparisonTable() {
    var body = document.getElementById('ks-cmp-body');
    if (!body) return;
    var rows = [
      'Produção centralizada em fábrica própria ativa em São Paulo desde 1995 (sublimação, corte, TPU e costura)',
      'Mostruário físico Maleta King Sports Pro com 8 peças piloto + grade física PP ao EXG + bandeira CMYK',
      'Pedido mínimo fabril acessível (MOQ 10 peças por modelo) para fechar pedidos semanais na região',
      'Zero estoque de rolos de tecido e zero custo com maquinário industrial ou gestão fabril',
      'Simulador 3D Web e King Sports Design Pack com moldes graduados e macro de nomes e números',
      'Operação Triangular fiscal via ME ou SLU no Simples Nacional com entrega direta da fábrica ao destinatário',
      'Modelo enxuto home based com investimento de referência de R$ 20.000* validado em COF (Lei nº 13.966/2019)'
    ];
    body.innerHTML = rows
      .map(function (label) {
        return (
          '<div class="ks-vqt-r ks-vqt-b" role="row">' +
          '<div role="cell">' +
          label +
          '</div>' +
          '<div role="cell" class="ks-vqt-c"><svg class="ks-vqt-no" role="img" aria-label="Não"><use href="#i-x"/></svg></div>' +
          '<div role="cell" class="ks-vqt-c ks-vqt-ks"><span class="ks-vqt-yes" role="img" aria-label="Sim"><svg width="16" height="16"><use href="#i-check"/></svg></span></div>' +
          '</div>'
        );
      })
      .join('');
  }

  function initHeroCarousel() {
    var box = document.getElementById('ks-hero-slides');
    var dots = document.getElementById('ks-car-dots');
    var tagEl = document.getElementById('ks-car-tag');
    var prev = document.getElementById('ks-car-prev');
    var next = document.getElementById('ks-car-next');
    if (!box || !dots) return;

    var slides = Array.prototype.slice.call(box.children);
    var video = box.querySelector('video');
    var cur = 0;
    var timer = null;
    var stopped = false;

    slides.forEach(function (_, idx) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Ir para o slide ' + (idx + 1));
      b.onclick = function () {
        stop();
        go(idx);
      };
      dots.appendChild(b);
    });

    function mark() {
      Array.prototype.forEach.call(dots.children, function (d, i) {
        d.setAttribute('aria-current', i === cur ? 'true' : 'false');
      });
      if (tagEl && slides[cur] && slides[cur].dataset.tag) {
        tagEl.textContent = slides[cur].dataset.tag;
      }
      if (video) {
        if (cur === 0) video.play().catch(function () {});
        else video.pause();
      }
    }

    function go(i) {
      cur = (i + slides.length) % slides.length;
      box.scrollTo({ left: cur * box.clientWidth, behavior: 'smooth' });
      mark();
    }

    function stop() {
      stopped = true;
      clearInterval(timer);
    }

    if (prev) prev.onclick = function () { stop(); go(cur - 1); };
    if (next) next.onclick = function () { stop(); go(cur + 1); };

    box.addEventListener('pointerdown', stop, { passive: true });
    box.addEventListener(
      'scroll',
      function () {
        if (!box.clientWidth) return;
        var idx = Math.round(box.scrollLeft / box.clientWidth);
        if (idx !== cur) {
          cur = idx;
          mark();
        }
      },
      { passive: true }
    );

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      timer = setInterval(function () {
        if (!stopped && !document.hidden) go(cur + 1);
      }, 6500);
    }

    mark();
  }

  function initTabs() {
    var btns = document.querySelectorAll('.ks-tab-btn');
    var panels = document.querySelectorAll('.ks-tab-panel');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-tab');
        btns.forEach(function (b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        panels.forEach(function (p) {
          p.classList.remove('active');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        var panel = document.getElementById('tab-' + target);
        if (panel) panel.classList.add('active');
        if (window.KingTracking) {
          window.KingTracking.pushEvent('view_content', { section: 'showcase_' + target });
        }
      });
    });
  }

  function initFaq() {
    var faqs = document.querySelectorAll('.ks-faq-list details');
    faqs.forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (d.open) {
          faqs.forEach(function (other) {
            if (other !== d) other.open = false;
          });
        }
      });
    });
  }

  function initFormFocusCtas() {
    document.querySelectorAll('a[href="#candidatura"]').forEach(function (anchor) {
      anchor.addEventListener('click', function () {
        setTimeout(function () {
          var firstInput = document.getElementById('f_full_name');
          if (firstInput) firstInput.focus({ preventScroll: true });
        }, 450);
      });
    });
  }

  function formatWhatsappInput(input) {
    var v = input.value.replace(/\D/g, '');
    if (v.length >= 12 && v.slice(0, 2) === '55') {
      v = v.slice(2);
    }
    v = v.slice(0, 11);
    if (v.length >= 11) {
      input.value = '(' + v.slice(0, 2) + ') ' + v.slice(2, 7) + '-' + v.slice(7);
    } else if (v.length >= 7) {
      input.value = '(' + v.slice(0, 2) + ') ' + v.slice(2, 6) + '-' + v.slice(6);
    } else if (v.length >= 3) {
      input.value = '(' + v.slice(0, 2) + ') ' + v.slice(2);
    } else {
      input.value = v;
    }
  }

  function setFieldError(fieldEl, hasError, msg) {
    var wrapper = fieldEl.closest('.ks-field');
    if (!wrapper) return;
    wrapper.classList.toggle('has-error', hasError);
    var errEl = wrapper.querySelector('.ks-field-error');
    if (errEl && msg) errEl.textContent = msg;
  }

  function showFormAlert(alertBox, msg) {
    if (!alertBox) return;
    if (!msg) {
      alertBox.className = 'ks-form-alert';
      alertBox.textContent = '';
      return;
    }
    alertBox.className = 'ks-form-alert error';
    alertBox.textContent = msg;
  }

  function validateStep(stepNumber) {
    var valid = true;
    var firstInvalid = null;

    function mark(el, ok, msg) {
      setFieldError(el, !ok, msg);
      if (!ok) {
        valid = false;
        if (!firstInvalid) firstInvalid = el;
      }
    }

    if (stepNumber === 1) {
      var nameEl = document.getElementById('f_full_name');
      var whatsEl = document.getElementById('f_whatsapp');
      var emailEl = document.getElementById('f_email');
      var cityEl = document.getElementById('f_city');
      var stateEl = document.getElementById('f_state');

      mark(nameEl, nameEl.value.trim().length >= 3, 'Informe seu nome completo (mínimo 3 letras).');

      var digits = whatsEl.value.replace(/\D/g, '');
      mark(whatsEl, digits.length >= 10 && digits.length <= 13, 'Informe um WhatsApp válido com DDD.');

      mark(emailEl, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim()), 'Informe um e-mail válido.');

      mark(cityEl, cityEl.value.trim().length >= 2, 'Informe sua cidade.');

      mark(stateEl, stateEl.value.trim().length === 2, 'UF');
    }

    if (stepNumber === 2) {
      var step2Rules = [
        { id: 'f_intended_track', msg: 'Selecione seu perfil de atuação.' },
        { id: 'f_commercial_experience', msg: 'Selecione sua experiência comercial.' },
        { id: 'f_current_profession', msg: 'Informe sua profissão atual.' },
        { id: 'f_available_capital_range', msg: 'Selecione a faixa de capital disponível.' },
        { id: 'f_desired_start_timeframe', msg: 'Selecione o prazo desejado para começar.' }
      ];
      step2Rules.forEach(function (rule) {
        var el = document.getElementById(rule.id);
        if (!el) return;
        mark(el, el.value.trim().length >= 2, rule.msg);
      });
    }

    if (firstInvalid && typeof firstInvalid.focus === 'function') {
      firstInvalid.focus();
    }

    return valid;
  }

  function showStep(stepNumber) {
    currentStep = stepNumber;
    document.querySelectorAll('.ks-form-step').forEach(function (stepEl) {
      stepEl.classList.toggle('active', Number(stepEl.getAttribute('data-step')) === stepNumber);
    });
    document.querySelectorAll('.ks-progress-seg').forEach(function (seg, idx) {
      seg.classList.toggle('active', idx < stepNumber);
    });
    var caption = document.getElementById('ks-step-caption');
    if (caption) {
      caption.textContent =
        stepNumber === 1
          ? 'ETAPA 1 DE 2 — IDENTIFICAÇÃO E REGIÃO'
          : 'ETAPA 2 DE 2 — PERFIL E INVESTIMENTO';
    }
  }

  function applyServerValidationErrors(details) {
    if (!Array.isArray(details) || !details.length) return;
    var fieldMap = {
      full_name: { id: 'f_full_name', step: 1 },
      whatsapp: { id: 'f_whatsapp', step: 1 },
      email: { id: 'f_email', step: 1 },
      city: { id: 'f_city', step: 1 },
      state: { id: 'f_state', step: 1 },
      desired_zip_prefix: { id: 'f_zip', step: 1 },
      intended_track: { id: 'f_intended_track', step: 2 },
      commercial_experience: { id: 'f_commercial_experience', step: 2 },
      current_profession: { id: 'f_current_profession', step: 2 },
      available_capital_range: { id: 'f_available_capital_range', step: 2 },
      desired_start_timeframe: { id: 'f_desired_start_timeframe', step: 2 }
    };
    var targetStep = currentStep;
    details.forEach(function (item) {
      var mapped = fieldMap[item.field];
      if (!mapped) return;
      var el = document.getElementById(mapped.id);
      if (el) {
        setFieldError(el, true, item.message);
        if (mapped.step === 1) targetStep = 1;
      }
    });
    showStep(targetStep);
  }

  function initMultiStepForm() {
    var form = document.getElementById('ks-franchise-form');
    if (!form) return;

    var whatsEl = document.getElementById('f_whatsapp');
    if (whatsEl) {
      whatsEl.addEventListener('input', function () {
        formatWhatsappInput(whatsEl);
      });
    }

    var alertBox = document.getElementById('ks-form-alert');

    form.querySelectorAll('input, select').forEach(function (el) {
      el.addEventListener('focus', function () {
        if (window.KingTracking) window.KingTracking.trackFormStart();
      });
      var clearField = function () {
        setFieldError(el, false);
        if (el.id === 'f_lgpd' && el.checked) {
          showFormAlert(alertBox, '');
        }
      };
      el.addEventListener('input', clearField);
      el.addEventListener('change', clearField);
    });

    var nextBtn = document.getElementById('ks-next-step-btn');
    var prevBtn = document.getElementById('ks-prev-step-btn');

    function advanceFromStep1() {
      showFormAlert(alertBox, '');
      if (!validateStep(1)) {
        showFormAlert(alertBox, 'Revise os campos destacados na Etapa 1 para continuar.');
        return;
      }
      showStep(2);
      if (window.KingTracking) {
        window.KingTracking.pushEvent('form_step_complete', { step: 1, step_name: 'identificacao' });
      }
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', advanceFromStep1);
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        showFormAlert(alertBox, '');
        showStep(1);
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      showFormAlert(alertBox, '');

      if (currentStep === 1) {
        advanceFromStep1();
        return;
      }

      if (!validateStep(1)) {
        showStep(1);
        showFormAlert(alertBox, 'Revise os campos destacados na Etapa 1 antes de enviar.');
        return;
      }
      if (!validateStep(2)) {
        showStep(2);
        showFormAlert(alertBox, 'Preencha todos os campos obrigatórios da Etapa 2.');
        return;
      }

      var lgpdEl = document.getElementById('f_lgpd');
      if (!lgpdEl.checked) {
        showFormAlert(alertBox, 'É necessário aceitar a Política de Privacidade para enviar sua candidatura.');
        lgpdEl.focus();
        return;
      }

      var submitBtn = document.getElementById('ks-submit-btn');
      var originalText = submitBtn.getAttribute('data-default-text') || submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'ENVIANDO CANDIDATURA...';

      var tracking = window.KingTracking;
      var eventId = tracking ? 'lead_' + tracking.generateUuid() : 'lead_' + Date.now();
      var attribution = tracking ? tracking.getAttributionSnapshot() : {};
      var consent = (tracking && tracking.getConsent()) || {
        analytics: false,
        marketing: false,
        functional: true,
        policy_version: '1.0'
      };
      var params = new URLSearchParams(window.location.search);

      var payload = {
        full_name: document.getElementById('f_full_name').value.trim(),
        whatsapp: document.getElementById('f_whatsapp').value.trim(),
        email: document.getElementById('f_email').value.trim(),
        city: document.getElementById('f_city').value.trim(),
        state: document.getElementById('f_state').value.trim().toUpperCase(),
        desired_zip_prefix: document.getElementById('f_zip').value.trim(),
        commercial_experience: document.getElementById('f_commercial_experience').value.trim(),
        current_profession: document.getElementById('f_current_profession').value.trim(),
        available_capital_range: document.getElementById('f_available_capital_range').value.trim(),
        desired_start_timeframe: document.getElementById('f_desired_start_timeframe').value.trim(),
        intended_track: document.getElementById('f_intended_track').value.trim(),
        website_hp: document.getElementById('f_hp').value,
        form_started_at: formStartedAt,
        event_id: eventId,
        session_id: tracking ? tracking.getSessionId() : '',
        blog_post_slug: params.get('blog_post') || attribution?.last_touch?.blog_post_slug || '',
        lgpd_accepted: true,
        consent: consent,
        attribution: attribution
      };

      try {
        var resp = await fetch('/api/public/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        var data = await resp.json().catch(function () {
          return {};
        });

        if (!resp.ok) {
          if (resp.status === 400 && data?.error?.details) {
            applyServerValidationErrors(data.error.details);
          }
          var errMsg = data?.error?.message;
          if (resp.status === 503 || data?.error?.code === 'SERVICE_NOT_CONFIGURED') {
            errMsg =
              'Nosso sistema de cadastro está temporariamente indisponível no servidor. Tente novamente em alguns instantes.';
          } else if (resp.status === 429) {
            errMsg =
              errMsg ||
              'Muitas tentativas em curto intervalo. Aguarde alguns minutos antes de tentar novamente.';
          } else if (!errMsg) {
            errMsg =
              resp.status >= 500
                ? 'Erro temporário no servidor (HTTP ' + resp.status + '). Tente novamente em instantes.'
                : 'Não foi possível concluir o envio. Revise os dados e tente novamente.';
          }
          throw new Error(errMsg);
        }

        if (tracking) {
          tracking.pushEvent(
            'lead_submit',
            {
              intended_track: payload.intended_track,
              state: payload.state,
              score_grade: data.grade
            },
            data.event_id || eventId
          );
        }

        try {
          sessionStorage.setItem(
            'ks_last_submission',
            JSON.stringify({
              first_name: payload.full_name.split(/\s+/)[0],
              city: payload.city,
              state: payload.state,
              track: payload.intended_track,
              event_id: data.event_id || eventId
            })
          );
        } catch {}

        window.location.href = '/obrigado.html';
      } catch (err) {
        var displayMsg =
          err && err.name === 'TypeError'
            ? 'Falha de conexão com o servidor. Verifique sua internet e tente novamente.'
            : (err && err.message) || 'Não foi possível concluir o envio. Tente novamente.';
        showFormAlert(alertBox, displayMsg);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  window.addEventListener('ks:config-loaded', function (ev) {
    applyDynamicConfig(ev.detail);
  });

  document.addEventListener('DOMContentLoaded', function () {
    initMobileMenu();
    initMarquees();
    initVectorArt();
    initCounters();
    initComparisonTable();
    initHeroCarousel();
    initTabs();
    initFaq();
    initFormFocusCtas();
    initMultiStepForm();
    var cachedCfg =
      window.KingTracking && typeof window.KingTracking.getPublicConfig === 'function'
        ? window.KingTracking.getPublicConfig()
        : null;
    if (cachedCfg) {
      applyDynamicConfig(cachedCfg);
    } else {
      applyCrossDomainLinks(null);
    }
  });
})();
