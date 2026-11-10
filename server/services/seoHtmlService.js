'use strict';

const fs = require('fs');
const path = require('path');
const { resolveBaseUrl } = require('./geoService');

const CANONICAL_PLACEHOLDER_ORIGIN = 'https://franquia.kingsportsoficial.com.br';

function createSeoHtmlService({ publicDir = path.resolve(process.cwd(), 'public'), env = {} } = {}) {
  const fileCache = new Map();

  function readHtmlFile(relPath) {
    const fullPath = path.join(publicDir, relPath);
    const stat = fs.statSync(fullPath);
    const cached = fileCache.get(relPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.content;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    fileCache.set(relPath, { mtimeMs: stat.mtimeMs, content });
    return content;
  }

  function renderPublicHtml(relPath, req) {
    const baseUrl = resolveBaseUrl(req, env);
    let html = readHtmlFile(relPath);
    if (baseUrl !== CANONICAL_PLACEHOLDER_ORIGIN) {
      html = html.split(CANONICAL_PLACEHOLDER_ORIGIN).join(baseUrl);
    }
    return { html, baseUrl };
  }

  function sendSeoHtml(relPath, { indexable = true } = {}) {
    return (req, res, next) => {
      try {
        const { html, baseUrl } = renderPublicHtml(relPath, req);
        if (indexable) {
          const pathSuffix = relPath === 'index.html' ? '/' : `/${relPath}`;
          res.set('X-Robots-Tag', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
          res.set('Link', `<${baseUrl}${pathSuffix}>; rel="canonical", <${baseUrl}/llms.txt>; rel="alternate"; type="text/markdown"`);
        } else {
          res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
        }
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } catch (err) {
        next(err);
      }
    };
  }

  return {
    renderPublicHtml,
    sendSeoHtml
  };
}

module.exports = {
  createSeoHtmlService,
  CANONICAL_PLACEHOLDER_ORIGIN
};
