'use strict';

const { checkDatabaseHealth } = require('../database/supabase');
const { checkRedisHealth } = require('../jobs/redis');
const { sendGa4MeasurementEvent, buildGa4MeasurementPayload } = require('../integrations/ga4Measurement');
const { syncMetaCampaignInsights, syncGa4DataReport, syncGoogleAdsCampaignMetrics } = require('../integrations/adsSyncClients');

function createIntegrationTestService({ settingsService }) {
  return {
    async getAllIntegrationStatuses() {
      const [dbHealth, redisHealth, secrets] = await Promise.all([
        checkDatabaseHealth(),
        checkRedisHealth(),
        settingsService.getResolvedServerSecrets()
      ]);

      return {
        supabase: dbHealth,
        redis: redisHealth,
        gtm: {
          configured: Boolean(secrets.gtm_id),
          status: secrets.gtm_id ? 'configured' : 'not_configured',
          id: secrets.gtm_id || null
        },
        ga4_measurement: {
          configured: Boolean(secrets.ga4_measurement_id && secrets.ga4_api_secret),
          client_only_configured: Boolean(secrets.ga4_measurement_id),
          status:
            secrets.ga4_measurement_id && secrets.ga4_api_secret
              ? 'configured'
              : secrets.ga4_measurement_id
              ? 'partial_missing_secret'
              : 'not_configured'
        },
        meta_capi: {
          configured: Boolean(secrets.meta_pixel_id && secrets.meta_capi_token),
          pixel_only_configured: Boolean(secrets.meta_pixel_id),
          status:
            secrets.meta_pixel_id && secrets.meta_capi_token
              ? 'configured'
              : secrets.meta_pixel_id
              ? 'partial_missing_token'
              : 'not_configured'
        },
        meta_marketing_api: {
          configured: Boolean(secrets.meta_ad_account_id && secrets.meta_capi_token),
          status:
            secrets.meta_ad_account_id && secrets.meta_capi_token ? 'configured' : 'not_configured'
        },
        ga4_data_api: {
          configured: Boolean(secrets.ga4_property_id && secrets.google_service_account_json),
          status:
            secrets.ga4_property_id && secrets.google_service_account_json
              ? 'configured'
              : 'not_configured'
        },
        google_ads_api: {
          configured: Boolean(
            secrets.google_ads_developer_token &&
              secrets.google_ads_client_id &&
              secrets.google_ads_client_secret &&
              secrets.google_ads_refresh_token &&
              secrets.google_ads_customer_id
          ),
          tag_only_configured: Boolean(secrets.google_ads_conversion_id),
          status:
            secrets.google_ads_developer_token &&
            secrets.google_ads_refresh_token &&
            secrets.google_ads_customer_id
              ? 'configured'
              : 'not_configured'
        }
      };
    },

    async testIntegration(target, fetchFn = global.fetch) {
      const secrets = await settingsService.getResolvedServerSecrets();

      if (target === 'supabase') {
        return checkDatabaseHealth();
      }

      if (target === 'redis') {
        return checkRedisHealth();
      }

      if (target === 'meta_capi') {
        if (!secrets.meta_pixel_id || !secrets.meta_capi_token) {
          return {
            ok: false,
            status: 'not_configured',
            message: 'Meta Pixel ID ou Access Token da Conversions API não configurados.'
          };
        }
        try {
          const resp = await fetchFn(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(secrets.meta_pixel_id)}?fields=id,name&access_token=${encodeURIComponent(secrets.meta_capi_token)}`
          );
          const json = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            return { ok: false, status: 'error', message: json?.error?.message || `HTTP ${resp.status}` };
          }
          return { ok: true, status: 'connected', details: { pixel_id: json.id, name: json.name } };
        } catch (err) {
          return { ok: false, status: 'error', message: err.message };
        }
      }

      if (target === 'ga4_mp') {
        if (!secrets.ga4_measurement_id || !secrets.ga4_api_secret) {
          return {
            ok: false,
            status: 'not_configured',
            message: 'GA4 Measurement ID ou API Secret não configurados.'
          };
        }
        const payload = buildGa4MeasurementPayload({
          clientId: 'test_validation.12345',
          eventName: 'king_integration_validation',
          eventId: `test_${Date.now()}`,
          consentGranted: { analytics: true, marketing: false }
        });
        const res = await sendGa4MeasurementEvent({
          measurementId: secrets.ga4_measurement_id,
          apiSecret: secrets.ga4_api_secret,
          payload,
          debug: true,
          fetchFn
        });
        const validationMessages = res.response?.validationMessages || [];
        return {
          ok: res.sent && validationMessages.length === 0,
          status: res.sent ? 'connected' : 'error',
          message: validationMessages.length
            ? validationMessages.map((m) => m.description).join('; ')
            : res.sent
            ? 'GA4 Measurement Protocol validado via /debug/mp/collect.'
            : res.error,
          details: res.response
        };
      }

      if (target === 'meta_marketing_api') {
        const today = new Date().toISOString().slice(0, 10);
        const res = await syncMetaCampaignInsights({
          adAccountId: secrets.meta_ad_account_id,
          accessToken: secrets.meta_capi_token,
          sinceDate: today,
          untilDate: today,
          fetchFn
        });
        return {
          ok: res.synced,
          status: res.status,
          message: res.reason || res.error || `Meta Marketing API acessível (${res.rows?.length || 0} linhas hoje).`
        };
      }

      if (target === 'ga4_data_api') {
        const today = new Date().toISOString().slice(0, 10);
        const res = await syncGa4DataReport({
          propertyId: secrets.ga4_property_id,
          serviceAccountJson: secrets.google_service_account_json,
          startDate: today,
          endDate: today,
          fetchFn
        });
        return {
          ok: res.synced,
          status: res.status,
          message: res.reason || res.error || `GA4 Data API acessível (${res.rows?.length || 0} linhas hoje).`
        };
      }

      if (target === 'google_ads_api') {
        const today = new Date().toISOString().slice(0, 10);
        const res = await syncGoogleAdsCampaignMetrics({
          developerToken: secrets.google_ads_developer_token,
          clientId: secrets.google_ads_client_id,
          clientSecret: secrets.google_ads_client_secret,
          refreshToken: secrets.google_ads_refresh_token,
          customerId: secrets.google_ads_customer_id,
          loginCustomerId: secrets.google_ads_login_customer_id,
          startDate: today,
          endDate: today,
          fetchFn
        });
        return {
          ok: res.synced,
          status: res.status,
          message: res.reason || res.error || `Google Ads API acessível (${res.rows?.length || 0} linhas hoje).`
        };
      }

      return { ok: false, status: 'unknown_target', message: 'Integração desconhecida.' };
    }
  };
}

module.exports = { createIntegrationTestService };
