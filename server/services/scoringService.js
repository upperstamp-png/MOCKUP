'use strict';

/**
 * Motor de Pontuação e Qualificação King Sports (0-100 pts + Grade A/B/C/D)
 * Baseado nos critérios do Scorecard 5 Filtros (Doc. 23).
 */
function calculateInitialLeadScore(qualification) {
  const capital = String(qualification.available_capital_range || '').toLowerCase();
  const timeframe = String(qualification.desired_start_timeframe || '').toLowerCase();
  const experience = String(qualification.commercial_experience || '').toLowerCase();
  const track = String(qualification.intended_track || '').toLowerCase();
  const profession = String(qualification.current_profession || '').toLowerCase();

  let capitalScore = 10;
  if (capital.includes('acima') || capital.includes('vista') || capital.includes('30') || capital.includes('20k_plus_reserva')) {
    capitalScore = 40;
  } else if (capital.includes('20') || capital.includes('cartao') || capital.includes('parcel')) {
    capitalScore = 30;
  } else if (capital.includes('10') || capital.includes('parcial') || capital.includes('buscando')) {
    capitalScore = 15;
  } else if (capital.includes('sem_capital') || capital.includes('nao_possui') || capital.includes('menos')) {
    capitalScore = 0;
  }

  let timeframeScore = 10;
  if (timeframe.includes('imediato') || timeframe.includes('30') || timeframe.includes('agora')) {
    timeframeScore = 20;
  } else if (timeframe.includes('60') || timeframe.includes('90') || timeframe.includes('curto')) {
    timeframeScore = 14;
  } else if (timeframe.includes('pesquisando') || timeframe.includes('semestre') || timeframe.includes('futuro')) {
    timeframeScore = 6;
  }

  let experienceScore = 8;
  if (experience.includes('5+') || experience.includes('gestao') || experience.includes('empresario') || experience.includes('vendedor_experiente')) {
    experienceScore = 20;
  } else if (experience.includes('1_a_5') || experience.includes('comercial') || experience.includes('atendimento') || experience.includes('sim')) {
    experienceScore = 15;
  } else if (experience.includes('iniciante') || experience.includes('nenhuma')) {
    experienceScore = 6;
  }

  let trackScore = 12;
  if (track === 'designer' || track === 'hibrido') {
    trackScore = 20;
  } else if (track === 'comercial') {
    trackScore = 16;
  }

  // Bonus / penalty check for profession alignment
  if (profession.includes('designer') || profession.includes('esporte') || profession.includes('treinador') || profession.includes('comercial') || profession.includes('vendas')) {
    experienceScore = Math.min(20, experienceScore + 3);
  }

  const total = Math.max(0, Math.min(100, capitalScore + timeframeScore + experienceScore + trackScore));

  let grade = 'C';
  if (total >= 80) grade = 'A';
  else if (total >= 60) grade = 'B';
  else if (total >= 40) grade = 'C';
  else grade = 'D';

  let qualification_status = 'pending';
  let priority = 'normal';

  if (capitalScore === 0) {
    qualification_status = 'nurture';
    priority = 'low';
  } else if (total >= 75) {
    qualification_status = 'qualified';
    priority = 'high';
  } else if (total >= 55) {
    qualification_status = 'pending';
    priority = 'normal';
  } else {
    qualification_status = 'nurture';
    priority = 'low';
  }

  return {
    score: total,
    grade,
    qualification_status,
    priority,
    breakdown: {
      capitalScore,
      timeframeScore,
      experienceScore,
      trackScore
    }
  };
}

/**
 * Avalia o Scorecard oficial dos 5 Filtros (Doc. 23):
 * Corte recomendado >= 18 pontos sem nenhum filtro zerado.
 */
function evaluateFiveFilterScorecard(scores) {
  const filters = [
    Number(scores.scorecard_financial),
    Number(scores.scorecard_territory),
    Number(scores.scorecard_profile),
    Number(scores.scorecard_dedication),
    Number(scores.scorecard_compliance)
  ];
  const hasZero = filters.some((v) => v === 0);
  const total = filters.reduce((sum, v) => sum + v, 0);

  let qualification_status = 'pending';
  let priority = 'normal';

  if (hasZero) {
    qualification_status = 'disqualified';
    priority = 'low';
  } else if (total >= 18) {
    qualification_status = 'qualified';
    priority = total >= 23 ? 'urgent' : 'high';
  } else {
    qualification_status = 'nurture';
    priority = 'normal';
  }

  return {
    total,
    hasZero,
    approved: !hasZero && total >= 18,
    qualification_status,
    priority,
    normalizedLeadScore: Math.round((total / 25) * 100)
  };
}

module.exports = {
  calculateInitialLeadScore,
  evaluateFiveFilterScorecard
};
