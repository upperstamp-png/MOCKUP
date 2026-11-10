'use strict';

/**
 * Catálogo Oficial de Eventos de Tracking & LGPD (King Sports Franchising)
 * Documenta finalidade, origem, destino, base legal / consentimento e deduplicação.
 */
const EVENT_CATALOG = [
  {
    event_name: 'page_view',
    ga4_name: 'page_view',
    meta_name: 'PageView',
    origin: 'client',
    destinations: ['GTM', 'GA4', 'Meta Pixel'],
    consent_required: 'analytics',
    deduplication_rule: 'event_id único por carregamento de página (client)',
    purpose: 'Mensurar visualizações de páginas públicas e artigos do blog para análise de audiência e atribuição.'
  },
  {
    event_name: 'view_content',
    ga4_name: 'view_item',
    meta_name: 'ViewContent',
    origin: 'client',
    destinations: ['GTM', 'GA4', 'Meta Pixel'],
    consent_required: 'analytics',
    deduplication_rule: 'event_id por sessão/seção visualizada',
    purpose: 'Identificar interesse em seções estratégicas (produtos, investimento R$ 20k, trilhas Comercial/Designer).'
  },
  {
    event_name: 'cta_click',
    ga4_name: 'select_promotion',
    meta_name: 'CustomizeProduct',
    origin: 'client',
    destinations: ['GTM', 'GA4', 'Supabase marketing_events'],
    consent_required: 'analytics',
    deduplication_rule: 'event_id por clique',
    purpose: 'Medir taxa de clique (CTR interno) em botões de chamada para ação da landing page e artigos do blog.'
  },
  {
    event_name: 'form_start',
    ga4_name: 'form_start',
    meta_name: null,
    origin: 'client',
    destinations: ['GTM', 'GA4', 'Supabase marketing_events'],
    consent_required: 'analytics',
    deduplication_rule: 'Disparado no máximo 1x por sessão no primeiro foco do formulário',
    purpose: 'Calcular taxa de abandono vs. conclusão do formulário multi-etapas.'
  },
  {
    event_name: 'form_step_complete',
    ga4_name: 'form_progress',
    meta_name: null,
    origin: 'client',
    destinations: ['GTM', 'GA4', 'Supabase marketing_events'],
    consent_required: 'analytics',
    deduplication_rule: 'event_id por transição de etapa',
    purpose: 'Diagnosticar em qual etapa do formulário de candidatura ocorrem atritos.'
  },
  {
    event_name: 'lead_submit',
    ga4_name: 'generate_lead',
    meta_name: 'Lead',
    origin: 'hybrid_client_and_server',
    destinations: ['GTM', 'GA4 (Browser + MP)', 'Meta (Pixel + CAPI)', 'Google Ads'],
    consent_required: 'marketing_for_ads_or_analytics_for_ga4',
    deduplication_rule: 'event_id UUID compartilhado entre navegador (Pixel eventID / GA4 transaction_id) e servidor (Meta CAPI event_id / GA4 MP), mais idempotency_key no banco e Redis',
    purpose: 'Registrar conversão primária de candidatura à franquia com proteção contra duplicidades e bloqueadores.'
  },
  {
    event_name: 'lead_qualified',
    ga4_name: 'qualify_lead',
    meta_name: 'Contact',
    origin: 'server',
    destinations: ['GA4 MP', 'Meta CAPI', 'Google Ads Offline'],
    consent_required: 'marketing_for_ads_with_recorded_consent',
    deduplication_rule: 'idempotency_key: lead_qualified:<lead_id>',
    purpose: 'Otimizar algoritmos de mídia para candidatos aprovados nos critérios de qualificação (Scorecard / capital / perfil).'
  },
  {
    event_name: 'meeting_scheduled',
    ga4_name: 'schedule_meeting',
    meta_name: 'Schedule',
    origin: 'server',
    destinations: ['GA4 MP', 'Meta CAPI', 'Google Ads Offline'],
    consent_required: 'marketing_for_ads_with_recorded_consent',
    deduplication_rule: 'idempotency_key: meeting_scheduled:<meeting_id>',
    purpose: 'Mensurar custo por reunião agendada e retroalimentar campanhas com eventos de fundo de funil.'
  },
  {
    event_name: 'franchise_sold',
    ga4_name: 'purchase',
    meta_name: 'Purchase',
    origin: 'server',
    destinations: ['GA4 MP', 'Meta CAPI', 'Google Ads Offline (GCLID/GBRAID/WBRAID)'],
    consent_required: 'marketing_for_ads_with_recorded_consent',
    deduplication_rule: 'idempotency_key: franchise_sold:<opportunity_id>',
    purpose: 'Atribuir receita contratada real, CAC e ROAS às campanhas de origem sem duplicação.'
  }
];

function getEventCatalog() {
  return EVENT_CATALOG;
}

function getEventDefinition(eventName) {
  return EVENT_CATALOG.find((item) => item.event_name === eventName) || null;
}

module.exports = {
  EVENT_CATALOG,
  getEventCatalog,
  getEventDefinition
};
