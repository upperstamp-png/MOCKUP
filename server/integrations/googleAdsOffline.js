'use strict';

const { hashEmailForAds, hashPhoneForAds } = require('../utils/crypto');
const logger = require('../utils/logger');

function formatGoogleAdsDateTime(date = new Date()) {
  // Format: yyyy-mm-dd hh:mm:ss+00:00
  const iso = new Date(date).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}+00:00`;
}

function buildGoogleAdsOfflinePayload({
  customerId,
  conversionActionResourceName,
  lead,
  attribution,
  eventId,
  conversionValueBrl = 0,
  conversionDateTime = new Date()
}) {
  const userIdentifiers = [];
  if (lead?.email) {
    userIdentifiers.push({ hashedEmail: hashEmailForAds(lead.email) });
  }
  if (lead?.whatsapp) {
    userIdentifiers.push({ hashedPhoneNumber: hashPhoneForAds(lead.whatsapp) });
  }

  const conversion = {
    conversionAction: conversionActionResourceName || `customers/${customerId}/conversionActions/DEFAULT`,
    conversionDateTime: formatGoogleAdsDateTime(conversionDateTime),
    conversionValue: Number(conversionValueBrl || 0),
    currencyCode: 'BRL',
    orderId: eventId,
    userIdentifiers
  };

  if (attribution?.gclid) conversion.gclid = attribution.gclid;
  if (attribution?.gbraid) conversion.gbraid = attribution.gbraid;
  if (attribution?.wbraid) conversion.wbraid = attribution.wbraid;

  return {
    conversions: [conversion],
    partialFailure: true
  };
}

async function exchangeGoogleOAuthToken({ clientId, clientSecret, refreshToken, fetchFn = global.fetch }) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const resp = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Google OAuth HTTP ${resp.status}`);
  }
  return json.access_token;
}

async function sendGoogleAdsOfflineConversion({
  developerToken,
  clientId,
  clientSecret,
  refreshToken,
  customerId,
  loginCustomerId,
  payload,
  fetchFn = global.fetch
}) {
  if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
    return {
      sent: false,
      status: 'skipped_no_credentials',
      reason: 'Credenciais completas do Google Ads API (developer token, OAuth2 e customer ID) não configuradas.'
    };
  }

  // Google Ads Offline click conversion requires gclid/gbraid/wbraid or Enhanced Conversions userIdentifiers
  const conv = payload?.conversions?.[0];
  if (!conv?.gclid && !conv?.gbraid && !conv?.wbraid && (!conv?.userIdentifiers || conv.userIdentifiers.length === 0)) {
    return {
      sent: false,
      status: 'skipped_no_credentials',
      reason: 'Sem identificador Google (gclid/gbraid/wbraid) ou dados elegíveis para Enhanced Conversions.'
    };
  }

  try {
    const accessToken = await exchangeGoogleOAuthToken({ clientId, clientSecret, refreshToken, fetchFn });
    const cleanCustomerId = String(customerId).replace(/\D/g, '');
    const url = `https://googleads.googleapis.com/v18/customers/${cleanCustomerId}:uploadClickConversions`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json'
    };
    if (loginCustomerId) {
      headers['login-customer-id'] = String(loginCustomerId).replace(/\D/g, '');
    }

    const resp = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      logger.warn('Google Ads Offline upload failed', { status: resp.status });
      return {
        sent: false,
        status: 'failed',
        httpStatus: resp.status,
        response: json,
        error: json?.error?.message || `HTTP ${resp.status}`
      };
    }

    return {
      sent: true,
      status: 'sent',
      httpStatus: resp.status,
      response: json
    };
  } catch (err) {
    return {
      sent: false,
      status: 'failed',
      error: err.message
    };
  }
}

module.exports = {
  buildGoogleAdsOfflinePayload,
  sendGoogleAdsOfflineConversion,
  exchangeGoogleOAuthToken
};
