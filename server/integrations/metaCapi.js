'use strict';

const { hashEmailForAds, hashPhoneForAds, sha256 } = require('../utils/crypto');
const logger = require('../utils/logger');

const META_API_VERSION = 'v21.0';

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  const first = parts[0] || '';
  const last = parts.length > 1 ? parts.slice(1).join(' ') : '';
  return {
    fn: first ? sha256(first.toLowerCase()) : undefined,
    ln: last ? sha256(last.toLowerCase()) : undefined
  };
}

function buildMetaCapiPayload({
  eventName,
  eventId,
  eventTimeSeconds,
  eventSourceUrl,
  lead,
  attribution,
  clientIp,
  userAgent,
  valueBrl = null,
  testEventCode = ''
}) {
  const { fn, ln } = splitName(lead?.full_name);
  const userData = {
    em: lead?.email ? [hashEmailForAds(lead.email)] : undefined,
    ph: lead?.whatsapp ? [hashPhoneForAds(lead.whatsapp)] : undefined,
    fn: fn ? [fn] : undefined,
    ln: ln ? [ln] : undefined,
    ct: lead?.city ? [sha256(lead.city.trim().toLowerCase())] : undefined,
    st: lead?.state ? [sha256(lead.state.trim().toLowerCase())] : undefined,
    country: [sha256('br')],
    external_id: lead?.id ? [sha256(lead.id)] : undefined,
    fbp: attribution?.fbp || undefined,
    fbc: attribution?.fbc || undefined,
    client_ip_address: clientIp || undefined,
    client_user_agent: userAgent || undefined
  };

  Object.keys(userData).forEach((k) => userData[k] === undefined && delete userData[k]);

  const eventObj = {
    event_name: eventName,
    event_time: eventTimeSeconds || Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: 'website',
    event_source_url: eventSourceUrl || undefined,
    user_data: userData
  };

  if (valueBrl != null && Number.isFinite(Number(valueBrl))) {
    eventObj.custom_data = {
      currency: 'BRL',
      value: Number(valueBrl),
      content_category: 'Franquia Home Based King Sports'
    };
  }

  const body = { data: [eventObj] };
  if (testEventCode) {
    body.test_event_code = testEventCode;
  }
  return body;
}

async function sendMetaCapiEvent({ pixelId, accessToken, payload, fetchFn = global.fetch }) {
  if (!pixelId || !accessToken) {
    return {
      sent: false,
      status: 'skipped_no_credentials',
      reason: 'META_PIXEL_ID ou META_CAPI_ACCESS_TOKEN não configurados.'
    };
  }

  const url = `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    logger.warn('Meta CAPI request failed', { status: response.status, error: json?.error?.message });
    return {
      sent: false,
      status: 'failed',
      httpStatus: response.status,
      response: json,
      error: json?.error?.message || `HTTP ${response.status}`
    };
  }

  return {
    sent: true,
    status: 'sent',
    httpStatus: response.status,
    response: json
  };
}

module.exports = {
  buildMetaCapiPayload,
  sendMetaCapiEvent
};
