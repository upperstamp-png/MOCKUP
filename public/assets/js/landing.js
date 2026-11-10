(function () {
  'use strict';

  var formStartedAt = Date.now();
  var currentStep = 1;

  function applyDynamicConfig(cfg) {
    if (!cfg || !cfg.landing_content) return;
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
  }

  function initMobileMenu() {
    var btn = document.getElementById('ks-hamburger-btn');
    var drawer = document.getElementById('ks-mobile-drawer');
    if (!btn || !drawer) return;
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
    var v = input.value.replace(/\D/g, '').slice(0, 11);
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

  function validateStep(stepNumber) {
    var valid = true;
    if (stepNumber === 1) {
      var nameEl = document.getElementById('f_full_name');
      var whatsEl = document.getElementById('f_whatsapp');
      var emailEl = document.getElementById('f_email');
      var cityEl = document.getElementById('f_city');
      var stateEl = document.getElementById('f_state');

      var nameOk = nameEl.value.trim().length >= 3;
      setFieldError(nameEl, !nameOk, 'Informe seu nome completo.');
      if (!nameOk) valid = false;

      var digits = whatsEl.value.replace(/\D/g, '');
      var whatsOk = digits.length >= 10 && digits.length <= 13;
      setFieldError(whatsEl, !whatsOk, 'Informe WhatsApp válido com DDD.');
      if (!whatsOk) valid = false;

      var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim());
      setFieldError(emailEl, !emailOk, 'Informe um e-mail válido.');
      if (!emailOk) valid = false;

      var cityOk = cityEl.value.trim().length >= 2;
      setFieldError(cityEl, !cityOk, 'Informe sua cidade.');
      if (!cityOk) valid = false;

      var stateOk = stateEl.value.trim().length === 2;
      setFieldError(stateEl, !stateOk, 'UF');
      if (!stateOk) valid = false;
    }

    if (stepNumber === 2) {
      ['f_commercial_experience', 'f_current_profession', 'f_available_capital_range', 'f_desired_start_timeframe', 'f_intended_track'].forEach(function (id) {
        var el = document.getElementById(id);
        var ok = el.value.trim().length >= 2;
        setFieldError(el, !ok, 'Campo obrigatório.');
        if (!ok) valid = false;
      });
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

  function initMultiStepForm() {
    var form = document.getElementById('ks-franchise-form');
    if (!form) return;

    var whatsEl = document.getElementById('f_whatsapp');
    if (whatsEl) {
      whatsEl.addEventListener('input', function () {
        formatWhatsappInput(whatsEl);
      });
    }

    form.querySelectorAll('input, select').forEach(function (el) {
      el.addEventListener('focus', function () {
        if (window.KingTracking) window.KingTracking.trackFormStart();
      });
      el.addEventListener('input', function () {
        setFieldError(el, false);
      });
    });

    var nextBtn = document.getElementById('ks-next-step-btn');
    var prevBtn = document.getElementById('ks-prev-step-btn');
    var alertBox = document.getElementById('ks-form-alert');

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (!validateStep(1)) return;
        showStep(2);
        if (window.KingTracking) {
          window.KingTracking.pushEvent('form_step_complete', { step: 1, step_name: 'identificacao' });
        }
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        showStep(1);
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (alertBox) {
        alertBox.className = 'ks-form-alert';
        alertBox.textContent = '';
      }

      if (!validateStep(1)) {
        showStep(1);
        return;
      }
      if (!validateStep(2)) {
        showStep(2);
        return;
      }

      var lgpdEl = document.getElementById('f_lgpd');
      if (!lgpdEl.checked) {
        if (alertBox) {
          alertBox.className = 'ks-form-alert error';
          alertBox.textContent = 'É necessário aceitar a Política de Privacidade para enviar sua candidatura.';
        }
        return;
      }

      var submitBtn = document.getElementById('ks-submit-btn');
      var originalText = submitBtn.textContent;
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
          throw new Error(data?.error?.message || 'Não foi possível concluir o envio. Tente novamente.');
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
        if (alertBox) {
          alertBox.className = 'ks-form-alert error';
          alertBox.textContent = err.message;
        }
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
  });
})();
