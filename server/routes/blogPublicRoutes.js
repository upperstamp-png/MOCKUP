'use strict';

const express = require('express');
const { env: defaultEnv } = require('../config/env');
const { NotFoundError } = require('../utils/errors');
const { renderBlogNotFoundPage, resolveSafeCanonicalUrl } = require('../services/blogRenderer');
const { resolveBaseUrl, renderLlmsTxt, renderLlmsFullTxt } = require('../services/geoService');
const { createSeoHtmlService } = require('../services/seoHtmlService');

function buildRobotsTxt(baseUrl) {
  const cleanBase = String(baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const agents = [
    'Googlebot',
    'Bingbot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'GPTBot',
    'PerplexityBot',
    'ClaudeBot',
    'Google-Extended',
    'Applebot-Extended',
    'DuckAssistBot',
    '*'
  ];

  const blocks = agents.map((agent) =>
    [
      `User-agent: ${agent}`,
      'Allow: /',
      'Disallow: /admin/',
      'Disallow: /hub/',
      'Disallow: /studio',
      'Disallow: /universidade',
      'Disallow: /quotes/',
      'Disallow: /login',
      'Disallow: /api/',
      'Disallow: /obrigado.html'
    ].join('\n')
  );

  return [
    '# King Sports Franchising — Diretrizes de Rastreamento (SEO + GEO / LLMs)',
    `# LLMs.txt: ${cleanBase}/llms.txt`,
    `# LLMs Full: ${cleanBase}/llms-full.txt`,
    '',
    blocks.join('\n\n'),
    '',
    `Sitemap: ${cleanBase}/sitemap.xml`,
    ''
  ].join('\n');
}

function normalizeQueryStringParam(rawValue) {
  const single = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (single == null) return null;
  const trimmed = String(single).trim();
  return trimmed || null;
}

function createBlogPublicRoutes({ blogService, seoHtmlService, env }) {
  const router = express.Router();
  const resolvedEnv = env === undefined ? defaultEnv : env;
  const htmlService = seoHtmlService || createSeoHtmlService({ env: resolvedEnv });

  // Páginas públicas estáticas com reescrita dinâmica de canonical/OG/JSON-LD + X-Robots-Tag
  router.get(['/', '/index.html'], htmlService.sendSeoHtml('index.html', { indexable: true }));
  router.get('/privacidade.html', htmlService.sendSeoHtml('privacidade.html', { indexable: true }));
  router.get('/termos.html', htmlService.sendSeoHtml('termos.html', { indexable: true }));
  router.get('/obrigado.html', htmlService.sendSeoHtml('obrigado.html', { indexable: false }));

  // GEO (Generative Engine Optimization) — llms.txt & llms-full.txt dinâmicos em Markdown
  router.get(['/llms.txt', '/.well-known/llms.txt'], async (req, res, next) => {
    try {
      const baseUrl = resolveBaseUrl(req, resolvedEnv);
      const { posts } = await blogService.getPublishedPostsForGeo();
      const markdown = renderLlmsTxt({
        baseUrl,
        posts,
        expansionEmail: resolvedEnv?.EXPANSION_EMAIL
      });
      res
        .vary('Host')
        .vary('X-Forwarded-Host')
        .set('Content-Type', 'text/markdown; charset=utf-8')
        .set('X-Robots-Tag', 'all')
        .set('Link', `<${baseUrl}/llms.txt>; rel="canonical"`)
        .set('Cache-Control', 'public, max-age=300')
        .send(markdown);
    } catch (err) {
      next(err);
    }
  });

  router.get('/llms-full.txt', async (req, res, next) => {
    try {
      const baseUrl = resolveBaseUrl(req, resolvedEnv);
      const { posts } = await blogService.getPublishedPostsForGeo();
      const markdown = renderLlmsFullTxt({ baseUrl, posts });
      res
        .vary('Host')
        .vary('X-Forwarded-Host')
        .set('Content-Type', 'text/markdown; charset=utf-8')
        .set('X-Robots-Tag', 'all')
        .set('Link', `<${baseUrl}/llms-full.txt>; rel="canonical"`)
        .set('Cache-Control', 'public, max-age=300')
        .send(markdown);
    } catch (err) {
      next(err);
    }
  });

  // Blog SSR
  router.get('/blog', async (req, res, next) => {
    try {
      const baseUrl = resolveBaseUrl(req, resolvedEnv);
      const categorySlug = normalizeQueryStringParam(req.query.categoria);
      let html;
      let canonical;
      let notFoundCategory = false;

      if (typeof blogService.resolvePublicIndex === 'function') {
        const result = await blogService.resolvePublicIndex({ categorySlug, baseUrl });
        html = result.html;
        canonical = result.canonicalUrl;
        notFoundCategory = Boolean(result.notFoundCategory);
      } else {
        html = await blogService.renderPublicIndex({ categorySlug, baseUrl });
        canonical = categorySlug
          ? `${baseUrl}/blog?categoria=${encodeURIComponent(categorySlug)}`
          : `${baseUrl}/blog`;
      }

      const robotsTag = notFoundCategory
        ? 'noindex, follow'
        : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

      res
        .vary('Host')
        .vary('X-Forwarded-Host')
        .set('X-Robots-Tag', robotsTag)
        .set('Link', `<${canonical}>; rel="canonical", <${baseUrl}/llms.txt>; rel="alternate"; type="text/markdown"`)
        .set('Content-Type', 'text/html; charset=utf-8')
        .send(html);
    } catch (err) {
      next(err);
    }
  });

  router.get('/blog/:slug', async (req, res, next) => {
    try {
      const baseUrl = resolveBaseUrl(req, resolvedEnv);
      const { post, html, canonicalUrl } = await blogService.renderPublicArticle(req.params.slug, {
        baseUrl
      });
      const fallbackCanonical = `${baseUrl}/blog/${encodeURIComponent(String(post.slug || '').trim())}`;
      const canonical =
        canonicalUrl || resolveSafeCanonicalUrl(post.canonical_url, fallbackCanonical, baseUrl);

      res
        .vary('Host')
        .vary('X-Forwarded-Host')
        .set('X-Robots-Tag', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1')
        .set('Link', `<${canonical}>; rel="canonical", <${baseUrl}/llms.txt>; rel="alternate"; type="text/markdown"`)
        .set('Content-Type', 'text/html; charset=utf-8')
        .send(html);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res
          .status(404)
          .set('X-Robots-Tag', 'noindex, nofollow, noarchive')
          .set('Content-Type', 'text/html; charset=utf-8')
          .send(renderBlogNotFoundPage());
      }
      return next(err);
    }
  });

  // Sitemap XML com namespace de imagens
  router.get('/sitemap.xml', async (req, res, next) => {
    try {
      const baseUrl = resolveBaseUrl(req, resolvedEnv);
      const xml = await blogService.generateSitemap({ baseUrl });
      res
        .vary('Host')
        .vary('X-Forwarded-Host')
        .set('Content-Type', 'application/xml; charset=utf-8')
        .set('Cache-Control', 'public, max-age=300')
        .send(xml);
    } catch (err) {
      next(err);
    }
  });

  // Robots.txt (Search Engines + Generative AI Crawlers)
  router.get('/robots.txt', (req, res) => {
    const baseUrl = resolveBaseUrl(req, resolvedEnv);
    const body = buildRobotsTxt(baseUrl);
    res
      .vary('Host')
      .vary('X-Forwarded-Host')
      .set('Content-Type', 'text/plain; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300')
      .send(body);
  });

  return router;
}

module.exports = {
  createBlogPublicRoutes,
  buildRobotsTxt
};
