'use strict';

const { getSupabaseAdmin } = require('../supabase');
const { encryptSecret, decryptSecret, maskSecret } = require('../../utils/crypto');

function createSettingsRepo(getDb = getSupabaseAdmin) {
  return {
    async listSettings({ includeSecretsDecrypted = false, publicOnly = false } = {}) {
      const db = getDb();
      let query = db.from('system_settings').select('*').order('category', { ascending: true });
      if (publicOnly) {
        query = query.eq('is_public', true).eq('is_secret', false);
      }
      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((row) => {
        if (!row.is_secret) return row;
        const plain = typeof row.value_json === 'string' ? decryptSecret(row.value_json) : '';
        if (includeSecretsDecrypted) {
          return { ...row, value_json: plain };
        }
        return {
          ...row,
          value_json: plain ? maskSecret(plain) : '',
          has_secret: Boolean(plain)
        };
      });
    },

    async getSettingsMap({ includeSecretsDecrypted = false, publicOnly = false } = {}) {
      const rows = await this.listSettings({ includeSecretsDecrypted, publicOnly });
      const map = {};
      for (const row of rows) {
        map[row.setting_key] = row.value_json;
      }
      return map;
    },

    async upsertSetting(settingKey, value, updatedBy = null) {
      const db = getDb();
      const { data: existing, error: getErr } = await db
        .from('system_settings')
        .select('*')
        .eq('setting_key', settingKey)
        .maybeSingle();
      if (getErr) throw getErr;

      let valueToSave = value;
      if (existing?.is_secret) {
        if (typeof value === 'string' && value.includes('••••')) {
          // Keeps existing secret when masked placeholder was submitted back
          return existing;
        }
        valueToSave = value ? encryptSecret(String(value)) : '';
      }

      if (existing) {
        const { data, error } = await db
          .from('system_settings')
          .update({ value_json: valueToSave, updated_by: updatedBy })
          .eq('setting_key', settingKey)
          .select('*')
          .single();
        if (error) throw error;
        return data;
      }

      const category = settingKey.split('.')[0] || 'tracking';
      const validCategories = ['tracking', 'ads_integrations', 'commercial_goals', 'franchise_info', 'landing_content', 'automation', 'security'];
      const { data, error } = await db
        .from('system_settings')
        .insert({
          setting_key: settingKey,
          category: validCategories.includes(category) ? category : 'tracking',
          label: settingKey,
          value_json: valueToSave,
          updated_by: updatedBy
        })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async getAdminByAuthId(authUserId) {
      const db = getDb();
      const { data, error } = await db
        .from('admin_users')
        .select('*, role:admin_roles(*)')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async getAdminByEmail(email) {
      const db = getDb();
      const { data, error } = await db
        .from('admin_users')
        .select('*, role:admin_roles(*)')
        .ilike('email', email)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async listAdmins() {
      const db = getDb();
      const { data, error } = await db
        .from('admin_users')
        .select('id, auth_user_id, full_name, email, phone, is_active, last_login_at, created_at, role:admin_roles(id, slug, name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async listRoles() {
      const db = getDb();
      const { data, error } = await db.from('admin_roles').select('*').order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async createOrUpdateAdminUser(payload) {
      const db = getDb();
      const { data, error } = await db
        .from('admin_users')
        .upsert(payload, { onConflict: 'email' })
        .select('*, role:admin_roles(*)')
        .single();
      if (error) throw error;
      return data;
    },

    async updateAdminLoginTime(id) {
      const db = getDb();
      await db.from('admin_users').update({ last_login_at: new Date().toISOString() }).eq('id', id);
    },

    async recordAuditLog(payload) {
      try {
        const db = getDb();
        await db.from('audit_logs').insert(payload);
      } catch {
        // Audit log write failure should never crash non-critical reads
      }
    },

    async listAuditLogs(limit = 60) {
      const db = getDb();
      const { data, error } = await db
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    }
  };
}

module.exports = { createSettingsRepo };
