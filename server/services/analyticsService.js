'use strict';

function resolvePeriodDates({ days = 30, startDate = null, endDate = null } = {}) {
  const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : new Date();
  let start;
  if (startDate) {
    start = new Date(`${startDate}T00:00:00.000Z`);
  } else {
    const numDays = Math.min(365, Math.max(1, Number(days || 30)));
    start = new Date(end.getTime() - numDays * 24 * 60 * 60 * 1000);
  }
  const spanMs = Math.max(24 * 60 * 60 * 1000, end.getTime() - start.getTime());
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    prevStartIso: prevStart.toISOString(),
    prevEndIso: prevEnd.toISOString()
  };
}

/**
 * Classifica um indicador nas faixas Verde / Laranja / Vermelho (Section 7)
 */
function evaluateThresholdBand(value, thresholdConfig) {
  if (value == null || !Number.isFinite(value) || !thresholdConfig) {
    return { band: 'neutral', pct: 0, status_label: 'Sem referência' };
  }
  const { target, warning, critical, direction } = thresholdConfig;
  if (direction === 'lower_is_better') {
    let band = 'green';
    let status_label = 'Dentro da meta';
    if (value > critical) {
      band = 'red';
      status_label = 'Crítico';
    } else if (value > warning || value > target) {
      band = 'orange';
      status_label = 'Atenção';
    }
    const maxScale = Math.max(critical * 1.25, target * 2, 1);
    const pct = Math.min(100, Math.max(6, Math.round((value / maxScale) * 100)));
    return { band, pct, status_label, target, warning, critical };
  }

  // higher_is_better
  let band = 'green';
  let status_label = 'Dentro ou acima da meta';
  if (value < critical) {
    band = 'red';
    status_label = 'Crítico';
  } else if (value < target) {
    band = 'orange';
    status_label = 'Atenção';
  }
  const maxScale = Math.max(target * 1.4, value, 1);
  const pct = Math.min(100, Math.max(6, Math.round((value / maxScale) * 100)));
  return { band, pct, status_label, target, warning, critical };
}

function safeDiv(num, den) {
  if (!den || den === 0) return null;
  return num / den;
}

function computeDatasetSummary(dataset, slaMinutes = 30) {
  const { leads, opportunities, stages, meetings, campaigns, metrics, attributions } = dataset;

  const totalLeads = leads.length;
  const qualifiedLeads = leads.filter((l) => l.qualification_status === 'qualified').length;
  const unattendedLeads = leads.filter((l) => {
    if (l.first_contact_at) return false;
    const ageMin = (Date.now() - new Date(l.created_at).getTime()) / 60000;
    return ageMin >= slaMinutes;
  });

  // Tempo médio de atendimento (minutos entre created_at e first_contact_at)
  const responseTimesMin = leads
    .filter((l) => l.first_contact_at)
    .map((l) => Math.max(0, (new Date(l.first_contact_at) - new Date(l.created_at)) / 60000));
  const avgResponseMinutes = responseTimesMin.length
    ? Math.round(responseTimesMin.reduce((a, b) => a + b, 0) / responseTimesMin.length)
    : null;

  const scheduledMeetings = meetings.length;
  const completedMeetings = meetings.filter((m) => m.status === 'completed').length;

  const stageById = new Map(stages.map((s) => [s.id, s]));
  const proposalsCount = opportunities.filter((o) => {
    const st = stageById.get(o.stage_id);
    return st && ['proposta', 'negociacao', 'documentacao', 'venda'].includes(st.slug);
  }).length;

  const wonOpportunities = opportunities.filter((o) => o.status === 'won');
  const salesCount = wonOpportunities.length;
  const attributedContractedRevenueBrl =
    wonOpportunities.reduce((sum, o) => sum + Number(o.actual_value_cents ?? o.estimated_value_cents ?? 0), 0) / 100;

  // Métricas agregadas de mídia
  const totalSpendBrl = metrics.reduce((s, m) => s + Number(m.spend_cents || 0), 0) / 100;
  const totalImpressions = metrics.reduce((s, m) => s + Number(m.impressions || 0), 0);
  const totalReach = metrics.reduce((s, m) => s + Number(m.reach || 0), 0);
  const totalClicks = metrics.reduce((s, m) => s + Number(m.clicks || 0), 0);
  const totalVisitors = metrics.reduce((s, m) => s + Number(m.visitors || 0), 0);

  const cpm = safeDiv(totalSpendBrl * 1000, totalImpressions);
  const cpc = safeDiv(totalSpendBrl, totalClicks);
  const ctrPct = safeDiv(totalClicks * 100, totalImpressions);
  const cpl = totalSpendBrl > 0 ? safeDiv(totalSpendBrl, totalLeads) : null;
  const cpql = totalSpendBrl > 0 ? safeDiv(totalSpendBrl, qualifiedLeads) : null;
  const costPerMeeting = totalSpendBrl > 0 ? safeDiv(totalSpendBrl, scheduledMeetings) : null;
  const cac = totalSpendBrl > 0 ? safeDiv(totalSpendBrl, salesCount) : null;
  const roas = totalSpendBrl > 0 ? safeDiv(attributedContractedRevenueBrl, totalSpendBrl) : null;

  const qualificationRatePct = totalLeads > 0 ? (qualifiedLeads / totalLeads) * 100 : 0;
  const meetingRatePct = qualifiedLeads > 0 ? (scheduledMeetings / qualifiedLeads) * 100 : 0;
  const closeRatePct = totalLeads > 0 ? (salesCount / totalLeads) * 100 : 0;

  // Distribuição por estágio do pipeline
  const stageBreakdown = stages.map((st) => {
    const count = opportunities.filter((o) => o.stage_id === st.id).length;
    return { id: st.id, slug: st.slug, name: st.name, color_hex: st.color_hex, count };
  });

  // Desempenho por região (UF)
  const regionMap = new Map();
  for (const lead of leads) {
    const uf = lead.state || 'N/A';
    const current = regionMap.get(uf) || { state: uf, leads: 0, qualified: 0, sales: 0 };
    current.leads += 1;
    if (lead.qualification_status === 'qualified') current.qualified += 1;
    regionMap.set(uf, current);
  }
  const leadById = new Map(leads.map((l) => [l.id, l]));
  for (const opp of wonOpportunities) {
    const l = leadById.get(opp.lead_id);
    if (l) {
      const uf = l.state || 'N/A';
      const entry = regionMap.get(uf);
      if (entry) entry.sales += 1;
    }
  }
  const regionalPerformance = Array.from(regionMap.values()).sort((a, b) => b.leads - a.leads);

  // Série temporal diária
  const dailyMap = new Map();
  for (const lead of leads) {
    const day = String(lead.created_at).slice(0, 10);
    const row = dailyMap.get(day) || { date: day, leads: 0, qualified: 0, sales: 0, spend_brl: 0 };
    row.leads += 1;
    if (lead.qualification_status === 'qualified') row.qualified += 1;
    dailyMap.set(day, row);
  }
  for (const opp of wonOpportunities) {
    const day = String(opp.closed_at || opp.created_at).slice(0, 10);
    const row = dailyMap.get(day) || { date: day, leads: 0, qualified: 0, sales: 0, spend_brl: 0 };
    row.sales += 1;
    dailyMap.set(day, row);
  }
  for (const m of metrics) {
    const day = String(m.metric_date).slice(0, 10);
    const row = dailyMap.get(day) || { date: day, leads: 0, qualified: 0, sales: 0, spend_brl: 0 };
    row.spend_brl += Number(m.spend_cents || 0) / 100;
    dailyMap.set(day, row);
  }
  const timeseries = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Desempenho por campanha
  const campaignRows = campaigns.map((camp) => {
    const campMetrics = metrics.filter((m) => m.campaign_id === camp.id);
    const campLeads = leads.filter((l) => {
      if (l.primary_campaign_id === camp.id) return true;
      if (!camp.utm_campaign) return false;
      return attributions.some(
        (a) => a.lead_id === l.id && a.utm_campaign && a.utm_campaign.toLowerCase() === camp.utm_campaign.toLowerCase()
      );
    });
    const campLeadIds = new Set(campLeads.map((l) => l.id));
    const campQualified = campLeads.filter((l) => l.qualification_status === 'qualified').length;
    const campMeetings = meetings.filter((m) => campLeadIds.has(m.lead_id)).length;
    const campWon = wonOpportunities.filter((o) => campLeadIds.has(o.lead_id));
    const campSales = campWon.length;
    const campRevenue =
      campWon.reduce((s, o) => s + Number(o.actual_value_cents ?? o.estimated_value_cents ?? 0), 0) / 100;

    const spend = campMetrics.reduce((s, m) => s + Number(m.spend_cents || 0), 0) / 100;
    const impressions = campMetrics.reduce((s, m) => s + Number(m.impressions || 0), 0);
    const reach = campMetrics.reduce((s, m) => s + Number(m.reach || 0), 0);
    const clicks = campMetrics.reduce((s, m) => s + Number(m.clicks || 0), 0);
    const visitors = campMetrics.reduce((s, m) => s + Number(m.visitors || 0), 0);

    return {
      id: camp.id,
      name: camp.name,
      platform: camp.platform,
      utm_campaign: camp.utm_campaign,
      status: camp.status,
      spend_brl: Number(spend.toFixed(2)),
      impressions,
      reach,
      clicks,
      visitors,
      cpm: safeDiv(spend * 1000, impressions),
      cpc: safeDiv(spend, clicks),
      ctr_pct: safeDiv(clicks * 100, impressions),
      leads: campLeads.length,
      cpl: spend > 0 ? safeDiv(spend, campLeads.length) : null,
      qualified_leads: campQualified,
      cpql: spend > 0 ? safeDiv(spend, campQualified) : null,
      qualification_rate_pct: campLeads.length > 0 ? (campQualified / campLeads.length) * 100 : 0,
      meetings: campMeetings,
      cost_per_meeting: spend > 0 ? safeDiv(spend, campMeetings) : null,
      sales: campSales,
      cac: spend > 0 ? safeDiv(spend, campSales) : null,
      attributed_contracted_revenue_brl: Number(campRevenue.toFixed(2)),
      roas: spend > 0 ? safeDiv(campRevenue, spend) : null,
      target_cpl_brl: camp.target_cpl_cents ? camp.target_cpl_cents / 100 : null
    };
  });

  return {
    kpis: {
      leads_count: totalLeads,
      qualified_leads_count: qualifiedLeads,
      meetings_scheduled_count: scheduledMeetings,
      meetings_completed_count: completedMeetings,
      proposals_count: proposalsCount,
      sales_count: salesCount,
      unattended_leads_count: unattendedLeads.length,
      media_spend_brl: Number(totalSpendBrl.toFixed(2)),
      impressions: totalImpressions,
      reach: totalReach,
      clicks: totalClicks,
      visitors: totalVisitors,
      cpm: cpm != null ? Number(cpm.toFixed(2)) : null,
      cpc: cpc != null ? Number(cpc.toFixed(2)) : null,
      ctr_pct: ctrPct != null ? Number(ctrPct.toFixed(2)) : null,
      cpl_brl: cpl != null ? Number(cpl.toFixed(2)) : null,
      cpql_brl: cpql != null ? Number(cpql.toFixed(2)) : null,
      cost_per_meeting_brl: costPerMeeting != null ? Number(costPerMeeting.toFixed(2)) : null,
      cac_brl: cac != null ? Number(cac.toFixed(2)) : null,
      attributed_contracted_revenue_brl: Number(attributedContractedRevenueBrl.toFixed(2)),
      roas: roas != null ? Number(roas.toFixed(2)) : null,
      qualification_rate_pct: Number(qualificationRatePct.toFixed(1)),
      meeting_rate_pct: Number(meetingRatePct.toFixed(1)),
      close_rate_pct: Number(closeRatePct.toFixed(1)),
      avg_response_minutes: avgResponseMinutes
    },
    stage_breakdown: stageBreakdown,
    regional_performance: regionalPerformance,
    timeseries,
    campaigns: campaignRows,
    unattended_leads: unattendedLeads
  };
}

function generateDiagnostics({ current, previous, thresholds }) {
  const alerts = [];
  const defaultCplTarget = thresholds?.cpl_brl?.target || 35;

  for (const camp of current.campaigns) {
    const campTarget = camp.target_cpl_brl || defaultCplTarget;
    if (camp.cpl != null && camp.cpl > campTarget) {
      alerts.push({
        severity: camp.cpl > campTarget * 1.5 ? 'red' : 'orange',
        type: 'high_cpl',
        title: `CPL acima da meta na campanha "${camp.name}"`,
        description: `CPL atual de R$ ${camp.cpl.toFixed(2)} vs. meta de R$ ${campTarget.toFixed(2)}.`
      });
    }
    if (camp.leads >= 5 && camp.qualification_rate_pct < 20) {
      alerts.push({
        severity: 'orange',
        type: 'low_qualification',
        title: `Alto volume e baixa qualificação em "${camp.name}"`,
        description: `${camp.leads} leads captados, mas apenas ${camp.qualification_rate_pct.toFixed(1)}% qualificados.`
      });
    }
  }

  if (current.kpis.unattended_leads_count > 0) {
    alerts.push({
      severity: current.kpis.unattended_leads_count >= 3 ? 'red' : 'orange',
      type: 'unattended_leads',
      title: `${current.kpis.unattended_leads_count} lead(s) sem primeiro atendimento`,
      description: 'Leads ultrapassaram o prazo de SLA configurado sem registro de contato.'
    });
  }

  // Gargalo no pipeline (estágio aberto com maior retenção)
  const openStages = current.stage_breakdown.filter(
    (s) => !['venda', 'perdido', 'desqualificado'].includes(s.slug) && s.count > 0
  );
  if (openStages.length > 0) {
    const topBottleneck = [...openStages].sort((a, b) => b.count - a.count)[0];
    if (topBottleneck.count >= 3) {
      alerts.push({
        severity: 'orange',
        type: 'pipeline_bottleneck',
        title: `Concentração no estágio "${topBottleneck.name}"`,
        description: `${topBottleneck.count} oportunidades paradas nesta etapa do funil.`
      });
    }
  }

  // Queda de conversão vs período anterior
  if (
    previous &&
    previous.kpis.leads_count >= 5 &&
    current.kpis.leads_count >= 5 &&
    current.kpis.qualification_rate_pct < previous.kpis.qualification_rate_pct - 10
  ) {
    alerts.push({
      severity: 'red',
      type: 'conversion_drop',
      title: 'Queda na taxa de qualificação vs. período anterior',
      description: `Qualificação caiu de ${previous.kpis.qualification_rate_pct}% para ${current.kpis.qualification_rate_pct}%.`
    });
  }

  return alerts;
}

function createAnalyticsService({ campaignsRepo, settingsRepo }) {
  return {
    async getDashboardAnalytics(queryParams = {}) {
      const { startIso, endIso, prevStartIso, prevEndIso } = resolvePeriodDates(queryParams);
      const [currentDataset, prevDataset, settingsMap] = await Promise.all([
        campaignsRepo.getAnalyticsDataset(startIso, endIso),
        campaignsRepo.getAnalyticsDataset(prevStartIso, prevEndIso),
        settingsRepo ? settingsRepo.getSettingsMap() : Promise.resolve({})
      ]);

      const slaMinutes = Number(settingsMap['automation.unattended_sla_minutes'] || 30);
      const thresholds = settingsMap['goals.kpi_thresholds'] || {};

      const current = computeDatasetSummary(currentDataset, slaMinutes);
      const previous = computeDatasetSummary(prevDataset, slaMinutes);
      const diagnostics = generateDiagnostics({ current, previous, thresholds });

      const healthBars = [
        {
          key: 'cpl_brl',
          label: 'CPL (Custo por Lead)',
          value: current.kpis.cpl_brl,
          unit: 'R$',
          ...evaluateThresholdBand(current.kpis.cpl_brl, thresholds.cpl_brl)
        },
        {
          key: 'cpql_brl',
          label: 'CPQL (Custo por Lead Qualificado)',
          value: current.kpis.cpql_brl,
          unit: 'R$',
          ...evaluateThresholdBand(current.kpis.cpql_brl, thresholds.cpql_brl)
        },
        {
          key: 'qualification_rate_pct',
          label: 'Taxa de Qualificação',
          value: current.kpis.qualification_rate_pct,
          unit: '%',
          ...evaluateThresholdBand(current.kpis.qualification_rate_pct, thresholds.qualification_rate_pct)
        },
        {
          key: 'avg_response_minutes',
          label: 'Tempo Médio de Atendimento',
          value: current.kpis.avg_response_minutes,
          unit: 'min',
          ...evaluateThresholdBand(current.kpis.avg_response_minutes, thresholds.avg_response_minutes)
        },
        {
          key: 'cac_brl',
          label: 'CAC (Custo de Aquisição)',
          value: current.kpis.cac_brl,
          unit: 'R$',
          ...evaluateThresholdBand(current.kpis.cac_brl, thresholds.cac_brl)
        },
        {
          key: 'roas',
          label: 'ROAS (Receita Contratada / Mídia)',
          value: current.kpis.roas,
          unit: 'x',
          ...evaluateThresholdBand(current.kpis.roas, thresholds.roas)
        }
      ];

      return {
        period: { start: startIso, end: endIso },
        kpis: current.kpis,
        previous_kpis: previous.kpis,
        health_bars: healthBars,
        stage_breakdown: current.stage_breakdown,
        regional_performance: current.regional_performance,
        timeseries: current.timeseries,
        campaigns: current.campaigns,
        diagnostics,
        revenue_notice:
          'Receita atribuída refere-se exclusivamente a contratos de franquia marcados como Venda (receita contratada), distinta de faturamento recorrente (royalties) ou receita líquida recebida.'
      };
    }
  };
}

module.exports = {
  createAnalyticsService,
  resolvePeriodDates,
  evaluateThresholdBand,
  computeDatasetSummary,
  generateDiagnostics
};
