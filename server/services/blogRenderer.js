'use strict';

const { escapeHtml } = require('../utils/crypto');
const { stripHtmlToPlainText } = require('./geoService');

function formatPtDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function serializeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function extractOrigin(canonicalUrl, fallbackAppUrl = '') {
  if (fallbackAppUrl) {
    return String(fallbackAppUrl).replace(/\/+$/, '');
  }
  try {
    return new URL(canonicalUrl).origin;
  } catch {
    return '';
  }
}

function renderSharedHead({
  title,
  description,
  canonicalUrl,
  ogImage,
  ogImageAlt = title,
  ogType = 'website',
  appUrl = '',
  jsonLd = null,
  noindex = false
}) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeCanonical = escapeHtml(canonicalUrl);
  const safeOgImage = escapeHtml(ogImage);
  const safeOgAlt = escapeHtml(ogImageAlt || title);
  const originUrl = extractOrigin(canonicalUrl, appUrl);
  const robotsContent = noindex
    ? 'noindex, nofollow, noarchive'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />
  <meta name="robots" content="${robotsContent}" />
  <meta name="author" content="King Sports Franchising" />
  <meta name="theme-color" content="#02060E" />
  <link rel="canonical" href="${safeCanonical}" />
  <link rel="alternate" hreflang="pt-BR" href="${safeCanonical}" />
  <link rel="alternate" hreflang="x-default" href="${safeCanonical}" />
  ${
    originUrl
      ? `<link rel="alternate" type="text/markdown" href="${escapeHtml(originUrl)}/llms.txt" title="LLMs.txt — Resumo Estruturado King Sports" />
  <link rel="sitemap" type="application/xml" title="Sitemap XML" href="${escapeHtml(originUrl)}/sitemap.xml" />`
      : ''
  }
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/images/favicon-16x16.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/images/apple-touch-icon.png" />
  <meta property="og:site_name" content="King Sports Franchising" />
  <meta property="og:type" content="${escapeHtml(ogType)}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:url" content="${safeCanonical}" />
  <meta property="og:image" content="${safeOgImage}" />
  <meta property="og:image:alt" content="${safeOgAlt}" />
  <meta property="og:locale" content="pt_BR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeOgImage}" />
  <meta name="twitter:image:alt" content="${safeOgAlt}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/css/design-system.css" />
  <link rel="stylesheet" href="/assets/css/blog.css" />
  ${jsonLd ? `<script type="application/ld+json">${serializeJsonLd(jsonLd)}</script>` : ''}
</head>`;
}

function renderSiteHeader() {
  return `
<header class="ks-header">
  <div class="ks-container ks-header-inner">
    <a href="/" class="ks-logo-link" aria-label="King Sports Franchising">
      <img src="/assets/images/logo-king-dark-bg.png" alt="King Sports Franchising" width="136" height="34" />
    </a>
    <nav class="ks-nav" aria-label="Navegação principal">
      <a href="/#oportunidade">Modelo</a>
      <a href="/#comparativo">Compare</a>
      <a href="/#produtos">Produtos</a>
      <a href="/#investimento">Investimento</a>
      <a href="/blog" class="active">Blog</a>
    </nav>
    <a href="/#candidatura" class="ks-btn ks-btn-primary ks-btn-sm" data-track-cta="blog_header_cta">
      QUERO CONHECER A FRANQUIA
    </a>
  </div>
</header>`;
}

function renderSiteFooter() {
  return `
<footer class="ks-footer">
  <div class="ks-container ks-footer-grid">
    <div>
      <img src="/assets/images/logo-king-dark-bg.png" alt="King Sports Franchising" width="144" height="36" />
      <p class="ks-footer-note">
        Expansão Nacional de Franquias Home Based • Indústria homologada em São Paulo/SP.
      </p>
    </div>
    <div>
      <h4>Navegação</h4>
      <ul>
        <li><a href="/">Landing Page da Franquia</a></li>
        <li><a href="/blog">Artigos &amp; Guias</a></li>
        <li><a href="/#candidatura">Formulário de Candidatura</a></li>
        <li><a href="/llms.txt">LLMs.txt (GEO)</a></li>
      </ul>
    </div>
    <div>
      <h4>Transparência &amp; LGPD</h4>
      <ul>
        <li><a href="/privacidade.html">Política de Privacidade</a></li>
        <li><a href="/termos.html">Termos &amp; Aviso Legal (Lei 13.966/19)</a></li>
        <li><button type="button" class="ks-link-btn" id="ks-open-consent-prefs">Gerenciar Cookies</button></li>
      </ul>
    </div>
  </div>
  <div class="ks-container ks-footer-bottom">
    <span>&copy; ${new Date().getFullYear()} King Sports Franchising. Todos os direitos reservados.</span>
    <span>Atendimento comercial conforme Lei nº 13.966/2019.</span>
  </div>
</footer>
<script src="/assets/js/tracking.js" defer></script>`;
}

function renderBlogIndexPage({ appUrl, posts, categories, activeCategorySlug = null, dbUnavailable = false }) {
  const cleanBase = String(appUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const activeCategory = activeCategorySlug
    ? categories.find((c) => c.slug === activeCategorySlug) || null
    : null;

  const canonicalUrl = activeCategorySlug
    ? `${cleanBase}/blog?categoria=${encodeURIComponent(activeCategorySlug)}`
    : `${cleanBase}/blog`;

  const title = activeCategory
    ? `${activeCategory.name} | Blog King Sports Franchising`
    : 'Blog King Sports Franchising | Mercado Esportivo, Uniformes e Franquias';

  const description =
    activeCategory?.description ||
    'Artigos técnicos e estratégicos sobre franquia home based, venda de uniformes esportivos personalizados, tecidos tecnológicos e gestão comercial regional.';

  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Início', item: `${cleanBase}/` },
    { '@type': 'ListItem', position: 2, name: 'Blog', item: `${cleanBase}/blog` }
  ];
  if (activeCategory) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: activeCategory.name,
      item: canonicalUrl
    });
  }

  const graph = [
    {
      '@type': 'Organization',
      '@id': `${cleanBase}/#organization`,
      name: 'King Sports Franchising',
      legalName: 'King Sports Franchising LTDA',
      url: `${cleanBase}/`,
      logo: {
        '@type': 'ImageObject',
        url: `${cleanBase}/assets/images/logo-king-dark-bg.png`
      }
    },
    {
      '@type': 'Blog',
      '@id': `${cleanBase}/blog#blog`,
      name: 'Blog King Sports Franchising',
      description:
        'Publicações técnicas sobre franchising esportivo home based, sublimação profissional, malhas tecnológicas e operação comercial regional.',
      url: `${cleanBase}/blog`,
      inLanguage: 'pt-BR',
      publisher: { '@id': `${cleanBase}/#organization` }
    },
    {
      '@type': 'CollectionPage',
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: title,
      description,
      inLanguage: 'pt-BR',
      isPartOf: { '@id': `${cleanBase}/blog#blog` },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['.ks-blog-hero h1', '.ks-blog-hero p']
      }
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems
    }
  ];

  if (posts.length > 0) {
    graph.push({
      '@type': 'ItemList',
      itemListElement: posts.map((post, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: `${cleanBase}/blog/${post.slug}`,
        name: post.title
      }))
    });
  }

  const head = renderSharedHead({
    title,
    description,
    canonicalUrl,
    ogImage: `${cleanBase}/assets/images/ks-fusion-01.jpg`,
    ogImageAlt: 'Blog King Sports Franchising — Uniformes Esportivos Personalizados e Franquias',
    appUrl: cleanBase,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': graph
    }
  });

  const categoryPills = [
    `<a href="/blog" class="ks-cat-pill ${!activeCategorySlug ? 'active' : ''}">Todos os artigos</a>`,
    ...categories.map(
      (cat) =>
        `<a href="/blog?categoria=${encodeURIComponent(cat.slug)}" class="ks-cat-pill ${
          activeCategorySlug === cat.slug ? 'active' : ''
        }">${escapeHtml(cat.name)}</a>`
    )
  ].join('');

  let cardsHtml = '';
  if (dbUnavailable) {
    cardsHtml = `
      <div class="ks-blog-empty">
        <h2>Blog aguardando conexão com o banco de dados</h2>
        <p>Configure o Supabase no arquivo <code>.env</code> e execute as migrações SQL em <code>sql/migrations/</code> para listar e publicar artigos do CMS.</p>
        <a href="/#candidatura" class="ks-btn ks-btn-primary">Conhecer a Franquia King Sports</a>
      </div>`;
  } else if (!posts.length) {
    cardsHtml = `
      <div class="ks-blog-empty">
        <h2>Nenhum artigo publicado nesta categoria ainda</h2>
        <p>Novos conteúdos editoriais podem ser publicados diretamente pelo painel CRM administrativo.</p>
        <a href="/blog" class="ks-btn ks-btn-secondary">Ver todas as categorias</a>
      </div>`;
  } else {
    cardsHtml = `<div class="ks-blog-grid">${posts
      .map((post) => {
        const img = post.cover_image_url || '/assets/images/ks-fusion-01.jpg';
        const catName = post.category?.name || 'Franchising';
        return `
        <article class="ks-blog-card">
          <a href="/blog/${escapeHtml(post.slug)}" class="ks-blog-card-img-wrap">
            <img src="${escapeHtml(img)}" alt="${escapeHtml(post.cover_image_alt || post.title)}" width="1376" height="768" loading="lazy" decoding="async" />
          </a>
          <div class="ks-blog-card-body">
            <div class="ks-blog-meta">
              <span class="ks-badge">${escapeHtml(catName)}</span>
              <time datetime="${escapeHtml(post.published_at || post.created_at)}">${escapeHtml(
                formatPtDate(post.published_at || post.created_at)
              )}</time>
              <span>• ${Number(post.reading_time_minutes || 4)} min</span>
            </div>
            <h2><a href="/blog/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a></h2>
            <p>${escapeHtml(post.excerpt || '')}</p>
            <a href="/blog/${escapeHtml(post.slug)}" class="ks-read-more">Ler artigo completo →</a>
          </div>
        </article>`;
      })
      .join('')}</div>`;
  }

  return `${head}
<body class="ks-body-dark">
  ${renderSiteHeader()}
  <main class="ks-blog-main">
    <section class="ks-blog-hero">
      <div class="ks-container">
        <span class="ks-tag">CONTEÚDO ESTRATÉGICO • KING SPORTS</span>
        <h1>Blog de Expansão, Mercado Esportivo &amp; Uniformes Personalizados</h1>
        <p>Conteúdo técnico sobre operação home based, produção industrial em São Paulo, tecidos esportivos e desenvolvimento comercial regional.</p>
        <div class="ks-cat-bar">${categoryPills}</div>
      </div>
    </section>

    <section class="ks-container ks-blog-list-section">
      ${cardsHtml}
    </section>

    <section class="ks-container ks-blog-cta-banner">
      <div>
        <span class="ks-tag">EXPANSÃO NACIONAL</span>
        <h2>Quer operar a marca King Sports na sua região?</h2>
        <p>Conheça a estrutura produtiva de São Paulo, a Maleta King Sports Pro e verifique a disponibilidade para a sua cidade.</p>
      </div>
      <a href="/?utm_source=blog&utm_medium=index_cta&utm_campaign=expansao_franquia#candidatura" class="ks-btn ks-btn-primary" data-track-cta="blog_index_bottom_cta">
        QUERO CONHECER A FRANQUIA
      </a>
    </section>
  </main>
  ${renderSiteFooter()}
</body>
</html>`;
}

function renderBlogArticlePage({ appUrl, post, relatedPosts = [] }) {
  const cleanBase = String(appUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const canonicalUrl = post.canonical_url || `${cleanBase}/blog/${post.slug}`;
  const ogImage = post.og_image_url || post.cover_image_url || '/assets/images/ks-fusion-01.jpg';
  const absoluteOgImage = ogImage.startsWith('http') ? ogImage : `${cleanBase}${ogImage}`;
  const title = post.meta_title || `${post.title} | Blog King Sports`;
  const description = post.meta_description || post.excerpt || post.title;
  const ctaLink = `/?utm_source=blog&utm_medium=article_cta&utm_campaign=${encodeURIComponent(
    post.slug
  )}&blog_post=${encodeURIComponent(post.slug)}#candidatura`;

  const plainText = stripHtmlToPlainText(post.content_html || '');
  const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
  const categoryName = post.category?.name || 'Franchising Esportivo';

  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Início', item: `${cleanBase}/` },
    { '@type': 'ListItem', position: 2, name: 'Blog', item: `${cleanBase}/blog` }
  ];
  if (post.category?.slug && post.category?.name) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: post.category.name,
      item: `${cleanBase}/blog?categoria=${encodeURIComponent(post.category.slug)}`
    });
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 4,
      name: post.title,
      item: canonicalUrl
    });
  } else {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: post.title,
      item: canonicalUrl
    });
  }

  const authorEntity = post.author?.full_name
    ? { '@type': 'Person', name: post.author.full_name }
    : { '@type': 'Organization', name: 'Equipe Editorial King Sports' };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${cleanBase}/#organization`,
        name: 'King Sports Franchising',
        legalName: 'King Sports Franchising LTDA',
        url: `${cleanBase}/`,
        logo: {
          '@type': 'ImageObject',
          url: `${cleanBase}/assets/images/logo-king-dark-bg.png`
        }
      },
      {
        '@type': post.schema_type || 'Article',
        '@id': `${canonicalUrl}#article`,
        headline: post.title,
        description,
        inLanguage: 'pt-BR',
        articleSection: categoryName,
        wordCount,
        timeRequired: `PT${Number(post.reading_time_minutes || 4)}M`,
        image: [absoluteOgImage],
        datePublished: post.published_at || post.created_at,
        dateModified: post.updated_at || post.published_at || post.created_at,
        author: authorEntity,
        publisher: { '@id': `${cleanBase}/#organization` },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': canonicalUrl
        },
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['h1', '.ks-article-excerpt']
        }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbItems
      }
    ]
  };

  const head = renderSharedHead({
    title,
    description,
    canonicalUrl,
    ogImage: absoluteOgImage,
    ogImageAlt: post.cover_image_alt || post.title,
    ogType: 'article',
    appUrl: cleanBase,
    jsonLd
  });

  const relatedHtml = relatedPosts.length
    ? `<section class="ks-container ks-related-section">
        <h3>Continue lendo</h3>
        <div class="ks-blog-grid ks-blog-grid-3">
          ${relatedPosts
            .map(
              (item) => `
            <article class="ks-blog-card">
              <div class="ks-blog-card-body">
                <span class="ks-badge">${escapeHtml(item.category?.name || 'Franchising')}</span>
                <h4><a href="/blog/${escapeHtml(item.slug)}">${escapeHtml(item.title)}</a></h4>
                <a href="/blog/${escapeHtml(item.slug)}" class="ks-read-more">Ler artigo →</a>
              </div>
            </article>`
            )
            .join('')}
        </div>
      </section>`
    : '';

  return `${head}
<body class="ks-body-dark" data-blog-slug="${escapeHtml(post.slug)}">
  ${renderSiteHeader()}
  <main class="ks-article-main">
    <article class="ks-container ks-article-wrap">
      <nav class="ks-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Início</a> <span>/</span> <a href="/blog">Blog</a> <span>/</span>
        ${
          post.category?.slug
            ? `<a href="/blog?categoria=${encodeURIComponent(post.category.slug)}">${escapeHtml(
                categoryName
              )}</a>`
            : `<span>${escapeHtml(categoryName)}</span>`
        }
      </nav>
      <header class="ks-article-header">
        <div class="ks-blog-meta">
          <span class="ks-badge">${escapeHtml(categoryName)}</span>
          <time datetime="${escapeHtml(post.published_at || post.created_at)}">${escapeHtml(
            formatPtDate(post.published_at || post.created_at)
          )}</time>
          <span>• ${Number(post.reading_time_minutes || 4)} min de leitura</span>
        </div>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="ks-article-excerpt">${escapeHtml(post.excerpt || '')}</p>
      </header>

      ${
        post.cover_image_url
          ? `<figure class="ks-article-cover">
              <img src="${escapeHtml(post.cover_image_url)}" alt="${escapeHtml(post.cover_image_alt || post.title)}" width="1376" height="768" decoding="async" />
            </figure>`
          : ''
      }

      <div class="ks-article-content">
        ${post.content_html}
      </div>

      <aside class="ks-article-cta-box">
        <div>
          <span class="ks-tag">FRANQUIA HOME BASED KING SPORTS</span>
          <h2>${escapeHtml(post.cta_headline || 'Quer levar a estrutura produtiva da King Sports para a sua região?')}</h2>
          <p>Preencha sua candidatura para análise de perfil e disponibilidade regional, sem compromisso inicial.</p>
        </div>
        <a href="${ctaLink}" class="ks-btn ks-btn-primary" data-track-cta="blog_article_cta">
          ${escapeHtml(post.cta_button_text || 'QUERO CONHECER A FRANQUIA')}
        </a>
      </aside>
    </article>

    ${relatedHtml}
  </main>
  ${renderSiteFooter()}
  <script>
    window.addEventListener('DOMContentLoaded', function() {
      if (window.KingTracking && typeof window.KingTracking.trackBlogView === 'function') {
        window.KingTracking.trackBlogView(${JSON.stringify(post.slug)});
      }
    });
  </script>
</body>
</html>`;
}

function renderBlogNotFoundPage() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Artigo não encontrado | Blog King Sports</title>
  <meta name="robots" content="noindex, nofollow, noarchive" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon-32x32.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/images/apple-touch-icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/css/design-system.css" />
</head>
<body class="ks-body-dark" style="display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center;">
  <main>
    <h1 style="font-family:var(--ks-font-display);font-size:2.4rem;text-transform:uppercase;margin-bottom:12px;">Artigo não encontrado</h1>
    <p style="color:#AEBBD0;margin-bottom:24px;">O artigo solicitado não existe ou ainda não foi publicado.</p>
    <a href="/blog" class="ks-btn ks-btn-primary">Voltar ao Blog King Sports</a>
  </main>
</body>
</html>`;
}

function renderSitemapXml({ appUrl, posts = [], nowIso = new Date().toISOString() }) {
  const cleanBase = String(appUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const latestPostIso = posts.length
    ? new Date(
        Math.max(
          ...posts.map((p) => new Date(p.updated_at || p.published_at || p.created_at || Date.now()).getTime())
        )
      ).toISOString()
    : nowIso;

  const staticUrls = [
    {
      loc: `${cleanBase}/`,
      lastmod: nowIso,
      changefreq: 'weekly',
      priority: '1.0',
      images: [
        {
          loc: `${cleanBase}/assets/images/ks-fusion-01.jpg`,
          title: 'Franquia Home Based King Sports — Uniformes Esportivos Personalizados Linha Fusion'
        },
        {
          loc: `${cleanBase}/assets/images/ks-liberty-01.jpg`,
          title: 'Uniformes Esportivos King Sports Linha Liberty'
        },
        {
          loc: `${cleanBase}/assets/images/maleta-pro.jpg`,
          title: 'Maleta King Sports Pro com peças piloto e grade PP ao EXG'
        },
        {
          loc: `${cleanBase}/assets/images/factory-sublimation.jpg`,
          title: 'Fábrica King Sports em São Paulo — Sublimação digital e calandra térmica'
        }
      ]
    },
    {
      loc: `${cleanBase}/blog`,
      lastmod: latestPostIso,
      changefreq: 'daily',
      priority: '0.9',
      images: []
    },
    {
      loc: `${cleanBase}/privacidade.html`,
      lastmod: nowIso,
      changefreq: 'monthly',
      priority: '0.3',
      images: []
    },
    {
      loc: `${cleanBase}/termos.html`,
      lastmod: nowIso,
      changefreq: 'monthly',
      priority: '0.3',
      images: []
    }
  ];

  const postUrls = posts.map((post) => {
    const imgPath = post.og_image_url || post.cover_image_url || '/assets/images/ks-fusion-01.jpg';
    const absImg = imgPath.startsWith('http') ? imgPath : `${cleanBase}${imgPath}`;
    return {
      loc: `${cleanBase}/blog/${post.slug}`,
      lastmod: new Date(post.updated_at || post.published_at || post.created_at || Date.now()).toISOString(),
      changefreq: 'weekly',
      priority: '0.8',
      images: [
        {
          loc: absImg,
          title: post.cover_image_alt || post.title
        }
      ]
    };
  });

  const allUrls = [...staticUrls, ...postUrls];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${allUrls
  .map((u) => {
    const imageXml = (u.images || [])
      .map(
        (img) => `    <image:image>
      <image:loc>${escapeHtml(img.loc)}</image:loc>
      ${img.title ? `<image:title>${escapeHtml(img.title)}</image:title>` : ''}
    </image:image>`
      )
      .join('\n');

    return `  <url>
    <loc>${escapeHtml(u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${escapeHtml(u.lastmod)}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${imageXml ? `\n${imageXml}` : ''}
  </url>`;
  })
  .join('\n')}
</urlset>`;
}

module.exports = {
  renderBlogIndexPage,
  renderBlogArticlePage,
  renderBlogNotFoundPage,
  renderSitemapXml
};
