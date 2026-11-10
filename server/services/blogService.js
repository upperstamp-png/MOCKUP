'use strict';

const { env, isSupabaseConfigured } = require('../config/env');
const { slugify, sanitizeArticleHtml } = require('../utils/crypto');
const { ConflictError, NotFoundError } = require('../utils/errors');
const { renderBlogIndexPage, renderBlogArticlePage, renderSitemapXml } = require('./blogRenderer');

function createBlogService({ blogRepo, settingsRepo, isStorageConfigured = isSupabaseConfigured }) {
  return {
    async renderPublicIndex({ categorySlug = null, baseUrl = env.APP_URL } = {}) {
      const cleanBase = String(baseUrl || env.APP_URL).replace(/\/+$/, '');
      if (!isStorageConfigured()) {
        return renderBlogIndexPage({
          appUrl: cleanBase,
          posts: [],
          categories: [],
          activeCategorySlug: categorySlug,
          dbUnavailable: true
        });
      }
      const [{ items: posts }, categories] = await Promise.all([
        blogRepo.listPublishedPosts({ categorySlug, limit: 30 }),
        blogRepo.listCategories()
      ]);
      return renderBlogIndexPage({
        appUrl: cleanBase,
        posts,
        categories,
        activeCategorySlug: categorySlug
      });
    },

    async renderPublicArticle(slug, { baseUrl = env.APP_URL } = {}) {
      const cleanBase = String(baseUrl || env.APP_URL).replace(/\/+$/, '');
      if (!isStorageConfigured()) {
        throw new NotFoundError('Artigo não encontrado (banco não configurado).');
      }
      const post = await blogRepo.getPublishedPostBySlug(slug);
      if (!post) {
        throw new NotFoundError('Artigo não encontrado.');
      }
      const { items } = await blogRepo.listPublishedPosts({ limit: 4 });
      const relatedPosts = items.filter((p) => p.id !== post.id).slice(0, 3);
      return {
        post,
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
      if (!post) return { recorded: false };
      await blogRepo.incrementPostViews(post.id);
      return { recorded: true, post_id: post.id };
    },

    async getPublishedPostsForGeo() {
      if (!isStorageConfigured()) {
        return { posts: [], dbUnavailable: true };
      }
      const { items } = await blogRepo.listPublishedPosts({ limit: 50 });
      return { posts: items || [], dbUnavailable: false };
    },

    async generateSitemap({ baseUrl = env.APP_URL } = {}) {
      const cleanBase = String(baseUrl || env.APP_URL).replace(/\/+$/, '');
      if (!isStorageConfigured()) {
        return renderSitemapXml({ appUrl: cleanBase, posts: [] });
      }
      const { items: posts } = await blogRepo.listPublishedPosts({ limit: 500 });
      return renderSitemapXml({ appUrl: cleanBase, posts });
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

module.exports = { createBlogService };
