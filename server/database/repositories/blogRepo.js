'use strict';

const { getSupabaseAdmin } = require('../supabase');
const { NotFoundError } = require('../../utils/errors');

function createBlogRepo(getDb = getSupabaseAdmin) {
  return {
    async listCategories() {
      const db = getDb();
      const { data, error } = await db
        .from('blog_categories')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async listPublishedPosts({ categorySlug = null, limit = 20, page = 1 } = {}) {
      const db = getDb();
      const from = (Math.max(1, page) - 1) * limit;
      const to = from + limit - 1;
      const nowIso = new Date().toISOString();

      let query = db
        .from('blog_posts')
        .select('*, category:blog_categories(id, name, slug)', { count: 'exact' })
        .eq('status', 'published')
        .lte('published_at', nowIso)
        .order('published_at', { ascending: false })
        .range(from, to);

      if (categorySlug) {
        const { data: cat } = await db
          .from('blog_categories')
          .select('id')
          .eq('slug', categorySlug)
          .maybeSingle();
        if (cat) {
          query = query.eq('category_id', cat.id);
        } else {
          return { items: [], total: 0, page, limit };
        }
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { items: data || [], total: count || 0, page, limit };
    },

    async getPublishedPostBySlug(slug) {
      const db = getDb();
      const nowIso = new Date().toISOString();
      const { data, error } = await db
        .from('blog_posts')
        .select('*, category:blog_categories(id, name, slug), author:admin_users(id, full_name)')
        .eq('slug', slug)
        .eq('status', 'published')
        .lte('published_at', nowIso)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async findPostBySlugAnyStatus(slug) {
      const db = getDb();
      const { data, error } = await db
        .from('blog_posts')
        .select('id, slug')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async incrementPostViews(id) {
      const db = getDb();
      const { data: current } = await db
        .from('blog_posts')
        .select('views_count')
        .eq('id', id)
        .maybeSingle();
      if (!current) return;
      await db
        .from('blog_posts')
        .update({ views_count: (current.views_count || 0) + 1 })
        .eq('id', id);
    },

    async incrementPostLeads(id) {
      const db = getDb();
      const { data: current } = await db
        .from('blog_posts')
        .select('leads_count')
        .eq('id', id)
        .maybeSingle();
      if (!current) return;
      await db
        .from('blog_posts')
        .update({ leads_count: (current.leads_count || 0) + 1 })
        .eq('id', id);
    },

    async listAllPostsAdmin() {
      const db = getDb();
      const { data, error } = await db
        .from('blog_posts')
        .select('*, category:blog_categories(id, name, slug), author:admin_users(id, full_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async getPostByIdAdmin(id) {
      const db = getDb();
      const { data, error } = await db
        .from('blog_posts')
        .select('*, category:blog_categories(id, name, slug)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new NotFoundError('Artigo não encontrado.');
      return data;
    },

    async createPost(payload) {
      const db = getDb();
      const { data, error } = await db
        .from('blog_posts')
        .insert(payload)
        .select('*, category:blog_categories(id, name, slug)')
        .single();
      if (error) throw error;
      return data;
    },

    async updatePost(id, patch) {
      const db = getDb();
      const { data, error } = await db
        .from('blog_posts')
        .update(patch)
        .eq('id', id)
        .select('*, category:blog_categories(id, name, slug)')
        .single();
      if (error) throw error;
      if (!data) throw new NotFoundError('Artigo não encontrado.');
      return data;
    },

    async deletePost(id) {
      const db = getDb();
      const { error } = await db.from('blog_posts').delete().eq('id', id);
      if (error) throw error;
      return { deleted: true };
    },

    async publishDueScheduledPosts() {
      const db = getDb();
      const nowIso = new Date().toISOString();
      const { data, error } = await db
        .from('blog_posts')
        .update({ status: 'published', published_at: nowIso })
        .eq('status', 'scheduled')
        .lte('scheduled_for', nowIso)
        .select('id, title, slug');
      if (error) throw error;
      return data || [];
    }
  };
}

module.exports = { createBlogRepo };
