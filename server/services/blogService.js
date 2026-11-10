'use strict';

const { env, isSupabaseConfigured } = require('../config/env');
const { slugify, sanitizeArticleHtml } = require('../utils/crypto');
const { ConflictError, NotFoundError } = require('../utils/errors');
const {
  renderBlogIndexPage,
  renderBlogArticlePage,
  renderSitemapXml,
  resolveSafeCanonicalUrl
} = require('./blogRenderer');

function getDefaultBaseUrl() {
  return String(env.LP_URL || env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function isPostPubliclyVisible(post, nowMs = Date.now()) {
  if (!post || post.status !== 'published') {
    return false;
  }
  if (post.published_at) {
    const pubMs = new Date(post.published_at).getTime();
    if (Number.isNaN(pubMs) || pubMs > nowMs) {
      return false;
    }
  }
  return true;
}

function createBlogService({ blogRepo, settingsRepo, isStorageConfigured = isSupabaseConfigured }) {
  return {
    async resolvePublicIndex({ categorySlug = null, baseUrl = getDefaultBaseUrl() } = {}) {
      const cleanBase = String(baseUrl || getDefaultBaseUrl()).replace(/\/+$/, '');
      if (!isStorageConfigured()) {
        return {
          html: renderBlogIndexPage({
            appUrl: cleanBase,
            posts: [],
            categories: [],
            activeCategorySlug: categorySlug,
            dbUnavailable: true
          }),
          canonicalUrl: `${cleanBase}/blog`,
          activeCategory: null,
          notFoundCategory: false,
          dbUnavailable: true
        };
      }
      const [{ items: posts }, categories] = await Promise.all([
        blogRepo.listPublishedPosts({ categorySlug, limit: 30 }),
        blogRepo.listCategories()
      ]);
      const visiblePosts = (posts || []).filter((p) => isPostPubliclyVisible(p));
      const safeCategories = categories || [];
      const activeCategory = categorySlug
        ? safeCategories.find((c) => c.slug === categorySlug) || null
        : null;
      const canonicalUrl = activeCategory
        ? `${cleanBase}/blog?categoria=${encodeURIComponent(activeCategory.slug)}`
        : `${cleanBase}/blog`;
      const notFoundCategory = Boolean(categorySlug && !activeCategory);

      return {
        html: renderBlogIndexPage({
          appUrl: cleanBase,
          posts: visiblePosts,
          categories: safeCategories,
          activeCategorySlug: categorySlug
        }),
        canonicalUrl,
        activeCategory,
        notFoundCategory,
        dbUnavailable: false
      };
    },

    async renderPublicIndex(opts = {}) {
      const result = await this.resolvePublicIndex(opts);
      return result.html;
    },

    async renderPublicArticle(slug, { baseUrl = getDefaultBaseUrl() } = {}) {
      const cleanBase = String(baseUrl || getDefaultBaseUrl()).replace(/\/+$/, '');
      if (!isStorageConfigured()) {
        throw new NotFoundError('Artigo não encontrado (banco não configurado).');
      }
      const post = await blogRepo.getPublishedPostBySlug(slug);
      if (!isPostPubliclyVisible(post)) {
        throw new NotFoundError('Artigo não encontrado.');
      }
      const { items } = await blogRepo.listPublishedPosts({ limit: 4 });
      const relatedPosts = (items || [])
        .filter((p) => p.id !== post.id && isPostPubliclyVisible(p))
        .slice(0, 3);
      const safeSlug = String(post.slug || '').trim();
      const canonicalUrl = resolveSafeCanonicalUrl(
        post.canonical_url,
        `${cleanBase}/blog/${encodeURIComponent(safeSlug)}`,
        cleanBase
      );
      return {
        post,
        canonicalUrl,
        html: renderBlogArticlePage({
          appUrl: cleanBase,
          post,
          relatedPosts
        })
      };
    },

    async registerArticleView(slug) {
      if (!isStorageConfigured()) return { recorded: false };
      const post = await blogRepo.getPublishedPostBySlug(slug);
      if (!isPostPubliclyVisible(post)) return { recorded: false };
      await blogRepo.incrementPostViews(post.id);
      return { recorded: true, post_id: post.id };
    },

    async getPublishedPostsForGeo() {
      if (!isStorageConfigured()) {
        return { posts: [], dbUnavailable: true };
      }
      const { items } = await blogRepo.listPublishedPosts({ limit: 50 });
      const visiblePosts = (items || []).filter((p) => isPostPubliclyVisible(p));
      return { posts: visiblePosts, dbUnavailable: false };
    },

    async generateSitemap({ baseUrl = getDefaultBaseUrl() } = {}) {
      const cleanBase = String(baseUrl || getDefaultBaseUrl()).replace(/\/+$/, '');
      if (!isStorageConfigured()) {
        return renderSitemapXml({ appUrl: cleanBase, posts: [] });
      }
      const { items: posts } = await blogRepo.listPublishedPosts({ limit: 500 });
      const visiblePosts = (posts || []).filter((p) => isPostPubliclyVisible(p));
      return renderSitemapXml({ appUrl: cleanBase, posts: visiblePosts });
    },

    async createPostAdmin(input, adminUser) {
      const targetSlug = slugify(input.slug || input.title);
      const existing = await blogRepo.findPostBySlugAnyStatus(targetSlug);
      if (existing) {
        throw new ConflictError(`Já existe um artigo com o slug "${targetSlug}".`);
      }

      const nowIso = new Date().toISOString();
      const postPayload = {
        ...input,
        slug: targetSlug,
        content_html: sanitizeArticleHtml(input.content_html),
        author_admin_id: adminUser?.id || null,
        published_at: input.status === 'published' ? nowIso : null
      };

      const created = await blogRepo.createPost(postPayload);
      if (settingsRepo) {
        await settingsRepo.recordAuditLog({
          actor_admin_id: adminUser?.id || null,
          actor_email: adminUser?.email || null,
          action: 'blog.post_created',
          entity_type: 'blog_post',
          entity_id: created.id,
          changes: { title: created.title, slug: created.slug, status: created.status }
        });
      }
      return created;
    },

    async updatePostAdmin(id, input, adminUser) {
      const current = await blogRepo.getPostByIdAdmin(id);
      const targetSlug = input.slug ? slugify(input.slug) : current.slug;
      if (targetSlug !== current.slug) {
        const collision = await blogRepo.findPostBySlugAnyStatus(targetSlug);
        if (collision && collision.id !== id) {
          throw new ConflictError(`Já existe um artigo com o slug "${targetSlug}".`);
        }
      }

      const patch = {
        ...input,
        slug: targetSlug,
        content_html: sanitizeArticleHtml(input.content_html)
      };

      if (input.status === 'published' && !current.published_at) {
        patch.published_at = new Date().toISOString();
      } else if (input.status === 'draft' || input.status === 'scheduled') {
        patch.published_at = null;
      }

      const updated = await blogRepo.updatePost(id, patch);
      if (settingsRepo) {
        await settingsRepo.recordAuditLog({
          actor_admin_id: adminUser?.id || null,
          actor_email: adminUser?.email || null,
          action: 'blog.post_updated',
          entity_type: 'blog_post',
          entity_id: id,
          changes: { title: updated.title, status: updated.status }
        });
      }
      return updated;
    }
  };
}

module.exports = { createBlogService, isPostPubliclyVisible };
