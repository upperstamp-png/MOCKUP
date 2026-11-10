'use strict';

const { env, isSupabaseConfigured } = require('../config/env');
const { getSupabaseAdmin } = require('../database/supabase');
const { ConflictError } = require('../utils/errors');

function getDefaultPublicConfig() {
  return {
    tracking: {
      gtm_id: env.GTM_CONTAINER_ID || '',
      ga4_measurement_id: env.GA4_MEASUREMENT_ID || '',
      google_ads_conversion_id: env.GOOGLE_ADS_CONVERSION_ID || '',
      google_ads_label_lead: env.GOOGLE_ADS_CONVERSION_LABEL_LEAD || '',
      meta_pixel_id: env.META_PIXEL_ID || ''
    },
    franchise: {
      brand_name: 'King Sports Franchising',
      factory_name: 'King Sports LTDA',
      factory_city: 'São Paulo - SP',
      reference_investment_brl: 20000,
      reference_investment_note:
        'Investimento de referência sujeito à confirmação do modelo comercial e jurídico na entrega da COF (Lei nº 13.966/2019).',
      moq_pieces: 10,
      production_sla_days: '20 a 25 dias úteis',
      whatsapp_expansion: env.WHATSAPP_OFFICIAL_EXPANSION || '',
      email_expansion: env.EXPANSION_EMAIL || 'expansao@kingsportsoficial.com.br'
    },
    landing_content: {
      hero_tag: 'EXPANSÃO NACIONAL KING SPORTS • MODELO HOME BASED',
      hero_headline:
        'SEJA UM FRANQUEADO KING SPORTS E COMECE A VENDER UNIFORMES PERSONALIZADOS SEM PRECISAR TER UMA FÁBRICA.',
      hero_subheadline:
        'Empreenda na sua região com uma operação comercial home based e conte com a estrutura produtiva da King Sports.',
      hero_cta_text: 'QUERO CONHECER A FRANQUIA',
      sticky_cta_text: 'QUERO CONHECER A FRANQUIA',
      final_cta_text: 'ENVIAR CANDIDATURA'
    },
    storage_ready: isSupabaseConfigured()
  };
}

function createSettingsService({ settingsRepo, isStorageConfigured = isSupabaseConfigured }) {
  return {
    async getPublicConfig() {
      const defaults = getDefaultPublicConfig();
      if (!isStorageConfigured()) {
        return defaults;
      }
      try {
        const dbMap = await settingsRepo.getSettingsMap({ publicOnly: true });
        return {
          tracking: {
            gtm_id: dbMap['tracking.gtm_id'] || defaults.tracking.gtm_id,
            ga4_measurement_id: dbMap['tracking.ga4_measurement_id'] || defaults.tracking.ga4_measurement_id,
            google_ads_conversion_id:
              dbMap['tracking.google_ads_conversion_id'] || defaults.tracking.google_ads_conversion_id,
            google_ads_label_lead:
              dbMap['tracking.google_ads_label_lead'] || defaults.tracking.google_ads_label_lead,
            meta_pixel_id: dbMap['tracking.meta_pixel_id'] || defaults.tracking.meta_pixel_id
          },
          franchise: {
            ...defaults.franchise,
            ...(typeof dbMap['franchise.public_info'] === 'object' ? dbMap['franchise.public_info'] : {})
          },
          landing_content: {
            ...defaults.landing_content,
            ...(typeof dbMap['landing.content'] === 'object' ? dbMap['landing.content'] : {})
          },
          storage_ready: true
        };
      } catch {
        return defaults;
      }
    },

    async getResolvedServerSecrets() {
      const resolved = {
        gtm_id: env.GTM_CONTAINER_ID || '',
        ga4_measurement_id: env.GA4_MEASUREMENT_ID || '',
        ga4_api_secret: env.GA4_API_SECRET || '',
        ga4_property_id: env.GA4_PROPERTY_ID || '',
        meta_pixel_id: env.META_PIXEL_ID || '',
        meta_capi_token: env.META_CAPI_ACCESS_TOKEN || '',
        meta_ad_account_id: env.META_AD_ACCOUNT_ID || '',
        meta_test_event_code: env.META_TEST_EVENT_CODE || '',
        google_ads_conversion_id: env.GOOGLE_ADS_CONVERSION_ID || '',
        google_ads_customer_id: env.GOOGLE_ADS_CUSTOMER_ID || '',
        google_ads_developer_token: env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
        google_ads_client_id: env.GOOGLE_ADS_CLIENT_ID || '',
        google_ads_client_secret: env.GOOGLE_ADS_CLIENT_SECRET || '',
        google_ads_refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN || '',
        google_ads_login_customer_id: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '',
        google_service_account_json: env.GOOGLE_SERVICE_ACCOUNT_JSON || ''
      };

      if (!isStorageConfigured()) return resolved;
      try {
        const dbMap = await settingsRepo.getSettingsMap({ includeSecretsDecrypted: true });
        return {
          ...resolved,
          gtm_id: dbMap['tracking.gtm_id'] || resolved.gtm_id,
          ga4_measurement_id: dbMap['tracking.ga4_measurement_id'] || resolved.ga4_measurement_id,
          ga4_api_secret: dbMap['tracking.ga4_api_secret'] || resolved.ga4_api_secret,
          ga4_property_id: dbMap['ads.ga4_property_id'] || resolved.ga4_property_id,
          meta_pixel_id: dbMap['tracking.meta_pixel_id'] || resolved.meta_pixel_id,
          meta_capi_token: dbMap['tracking.meta_capi_token'] || resolved.meta_capi_token,
          meta_ad_account_id: dbMap['ads.meta_ad_account_id'] || resolved.meta_ad_account_id,
          meta_test_event_code: dbMap['tracking.meta_test_event_code'] || resolved.meta_test_event_code,
          google_ads_conversion_id:
            dbMap['tracking.google_ads_conversion_id'] || resolved.google_ads_conversion_id,
          google_ads_customer_id: dbMap['ads.google_ads_customer_id'] || resolved.google_ads_customer_id
        };
      } catch {
        return resolved;
      }
    },

    async updateSettingsBulk(settingsObj, adminUser) {
      const results = [];
      for (const [key, value] of Object.entries(settingsObj || {})) {
        const saved = await settingsRepo.upsertSetting(key, value, adminUser?.id || null);
        results.push({ setting_key: saved.setting_key, updated_at: saved.updated_at });
      }
      await settingsRepo.recordAuditLog({
        actor_admin_id: adminUser?.id || null,
        actor_email: adminUser?.email || null,
        action: 'settings.updated',
        entity_type: 'system_settings',
        changes: { keys: Object.keys(settingsObj || {}) }
      });
      return results;
    },

    async inviteOrCreateAdminUser(input, actorAdmin) {
      const existing = await settingsRepo.getAdminByEmail(input.email);
      if (existing) {
        throw new ConflictError('Já existe um usuário administrativo com este e-mail.');
      }

      const roles = await settingsRepo.listRoles();
      const role = roles.find((r) => r.slug === input.role_slug);
      if (!role) {
        throw new ConflictError('Papel administrativo inválido.');
      }

      let authUserId = null;
      const supabaseAdmin = getSupabaseAdmin();
      if (input.password) {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { full_name: input.full_name }
        });
        if (error) throw error;
        authUserId = data.user.id;
      }

      const created = await settingsRepo.createOrUpdateAdminUser({
        auth_user_id: authUserId,
        role_id: role.id,
        full_name: input.full_name,
        email: input.email.toLowerCase(),
        phone: input.phone || null,
        is_active: input.is_active
      });

      await settingsRepo.recordAuditLog({
        actor_admin_id: actorAdmin?.id || null,
        actor_email: actorAdmin?.email || null,
        action: 'admin_user.created',
        entity_type: 'admin_user',
        entity_id: created.id,
        changes: { email: created.email, role_slug: input.role_slug }
      });

      return created;
    }
  };
}

module.exports = {
  createSettingsService,
  getDefaultPublicConfig
};
