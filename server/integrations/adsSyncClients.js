'use strict';

const crypto = require('crypto');
const logger = require('../utils/logger');
const { exchangeGoogleOAuthToken } = require('./googleAdsOffline');

/**
 * Meta Marketing API Sync (Com paginação por cursor e controle de rate limit)
 */
async function syncMetaCampaignInsights({
  adAccountId,
  accessToken,
  sinceDate,
  untilDate,
  fetchFn = global.fetch
}) {
  if (!adAccountId || !accessToken) {
    return {
      synced: false,
      status: 'not_configured',
      reason: 'META_AD_ACCOUNT_ID ou META_CAPI_ACCESS_TOKEN não configurados.'
    };
  }

  const normalizedAct = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const fields = 'campaign_id,campaign_name,impressions,reach,clicks,spend,actions,date_start';
  const timeRange = JSON.stringify({ since: sinceDate, until: untilDate });
  let nextUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(normalizedAct)}/insights?level=campaign&time_increment=1&fields=${fields}&time_range=${encodeURIComponent(timeRange)}&limit=100&access_token=${encodeURIComponent(accessToken)}`;

  const rows = [];
  let pageCount = 0;

  while (nextUrl && pageCount < 25) {
    pageCount += 1;
    const resp = await fetchFn(nextUrl);
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      logger.warn('Meta Marketing API sync error', { status: resp.status, message: json?.error?.message });
      return {
        synced: false,
        status: 'error',
        error: json?.error?.message || `HTTP ${resp.status}`
      };
    }
    if (Array.isArray(json.data)) {
      rows.push(...json.data);
    }
    nextUrl = json?.paging?.next || null;
  }

  return {
    synced: true,
    status: 'synced',
    pages_fetched: pageCount,
    rows
  };
}

/**
 * Google Analytics Data API (GA4) via Service Account JWT
 */
async function getGoogleServiceAccountToken(serviceAccountJsonStr, scope, fetchFn = global.fetch) {
  const sa = typeof serviceAccountJsonStr === 'string' ? JSON.parse(serviceAccountJsonStr) : serviceAccountJsonStr;
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })
  ).toString('base64url');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(sa.private_key, 'base64url');
  const assertion = `${header}.${claim}.${signature}`;

  const resp = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error(json.error_description || 'Falha ao autenticar Service Account Google.');
  }
  return json.access_token;
}

async function syncGa4DataReport({
  propertyId,
  serviceAccountJson,
  startDate,
  endDate,
  fetchFn = global.fetch
}) {
  if (!propertyId || !serviceAccountJson) {
    return {
      synced: false,
      status: 'not_configured',
      reason: 'GA4_PROPERTY_ID ou GOOGLE_SERVICE_ACCOUNT_JSON não configurados.'
    };
  }

  try {
    const accessToken = await getGoogleServiceAccountToken(
      serviceAccountJson,
      'https://www.googleapis.com/auth/analytics.readonly',
      fetchFn
    );
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
    const resp = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }, { name: 'sessionCampaignName' }, { name: 'sessionSourceMedium' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }],
        limit: 1000
      })
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        synced: false,
        status: 'error',
        error: json?.error?.message || `HTTP ${resp.status}`
      };
    }
    return {
      synced: true,
      status: 'synced',
      rows: json.rows || []
    };
  } catch (err) {
    return {
      synced: false,
      status: 'error',
      error: err.message
    };
  }
}

/**
 * Google Ads API Reporting (GAQL)
 */
async function syncGoogleAdsCampaignMetrics({
  developerToken,
  clientId,
  clientSecret,
  refreshToken,
  customerId,
  loginCustomerId,
  startDate,
  endDate,
  fetchFn = global.fetch
}) {
  if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
    return {
      synced: false,
      status: 'not_configured',
      reason: 'Credenciais do Google Ads API não configuradas.'
    };
  }

  try {
    const accessToken = await exchangeGoogleOAuthToken({ clientId, clientSecret, refreshToken, fetchFn });
    const cleanCustomer = String(customerId).replace(/\D/g, '');
    const query = `
      SELECT campaign.id, campaign.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json'
    };
    if (loginCustomerId) {
      headers['login-customer-id'] = String(loginCustomerId).replace(/\D/g, '');
    }

    const resp = await fetchFn(
      `https://googleads.googleapis.com/v18/customers/${cleanCustomer}/googleAds:search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, pageSize: 1000 })
      }
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        synced: false,
        status: 'error',
        error: json?.error?.message || `HTTP ${resp.status}`
      };
    }
    return {
      synced: true,
      status: 'synced',
      rows: json.results || []
    };
  } catch (err) {
    return {
      synced: false,
      status: 'error',
      error: err.message
    };
  }
}

module.exports = {
  syncMetaCampaignInsights,
  syncGa4DataReport,
  syncGoogleAdsCampaignMetrics
};
