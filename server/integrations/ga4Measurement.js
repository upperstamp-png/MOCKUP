'use strict';

const logger = require('../utils/logger');

function buildGa4MeasurementPayload({
  clientId,
  sessionId,
  eventName,
  eventId,
  valueBrl = null,
  params = {},
  consentGranted = { analytics: false, marketing: false }
}) {
  return {
    client_id: clientId || sessionId || '555555.555555',
    non_personalized_ads: !consentGranted.marketing,
    events: [
      {
        name: eventName,
        params: {
          session_id: sessionId || undefined,
          engagement_time_msec: 100,
          transaction_id: eventId,
          event_id: eventId,
          currency: valueBrl != null ? 'BRL' : undefined,
          value: valueBrl != null ? Number(valueBrl) : undefined,
          ...params
        }
      }
    ]
  };
}

async function sendGa4MeasurementEvent({
  measurementId,
  apiSecret,
  payload,
  debug = false,
  fetchFn = global.fetch
}) {
  if (!measurementId || !apiSecret) {
    return {
      sent: false,
      status: 'skipped_no_credentials',
      reason: 'GA4_MEASUREMENT_ID ou GA4_API_SECRET não configurados.'
    };
  }

  const base = debug
    ? 'https://www.google-analytics.com/debug/mp/collect'
    : 'https://www.google-analytics.com/mp/collect';
  const url = `${base}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    logger.warn('GA4 Measurement Protocol error', { status: response.status });
    return {
      sent: false,
      status: 'failed',
      httpStatus: response.status,
      response: json,
      error: `HTTP ${response.status}`
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
  buildGa4MeasurementPayload,
  sendGa4MeasurementEvent
};
