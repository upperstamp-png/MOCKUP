'use strict';

/**
 * Avalia se um evento pode trafegar dados pessoais / publicitários
 * conforme o consentimento LGPD registrado para o titular/sessão.
 */
function evaluateConsentForPlatform(consentRecord, platform) {
  const analyticsGranted = Boolean(consentRecord?.analytics_consent ?? consentRecord?.analytics);
  const marketingGranted = Boolean(consentRecord?.marketing_consent ?? consentRecord?.marketing);

  if (platform === 'internal') {
    return { allowed: true, reason: 'legitimate_franchise_application' };
  }

  if (platform === 'ga4_mp') {
    if (!analyticsGranted) {
      return { allowed: false, reason: 'analytics_consent_not_granted' };
    }
    return { allowed: true, includeUserData: marketingGranted };
  }

  if (platform === 'meta_capi' || platform === 'google_ads_offline') {
    if (!marketingGranted) {
      return { allowed: false, reason: 'marketing_consent_not_granted' };
    }
    return { allowed: true, includeUserData: true };
  }

  return { allowed: false, reason: 'unknown_platform' };
}

module.exports = {
  evaluateConsentForPlatform
};
