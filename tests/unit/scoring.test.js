'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateInitialLeadScore,
  evaluateFiveFilterScorecard
} = require('../../server/services/scoringService');

test('calculateInitialLeadScore atribui nota alta (Grade A) para perfil ideal com capital e início imediato', () => {
  const result = calculateInitialLeadScore({
    available_capital_range: 'acima_30k_a_vista',
    desired_start_timeframe: 'imediato_30_dias',
    commercial_experience: '5+_empresario',
    current_profession: 'Diretor Comercial Esportivo',
    intended_track: 'hibrido'
  });

  assert.equal(result.score, 100);
  assert.equal(result.grade, 'A');
  assert.equal(result.qualification_status, 'qualified');
  assert.equal(result.priority, 'high');
});

test('calculateInitialLeadScore encaminha perfil sem capital para nutrição', () => {
  const result = calculateInitialLeadScore({
    available_capital_range: 'sem_capital_agora',
    desired_start_timeframe: 'pesquisando',
    commercial_experience: 'nenhuma',
    current_profession: 'Estudante',
    intended_track: 'comercial'
  });

  assert.equal(result.breakdown.capitalScore, 0);
  assert.equal(result.qualification_status, 'nurture');
  assert.equal(result.priority, 'low');
});

test('evaluateFiveFilterScorecard aprova >= 18 pontos sem zeros (Doc. 23)', () => {
  const res = evaluateFiveFilterScorecard({
    scorecard_financial: 5,
    scorecard_territory: 5,
    scorecard_profile: 3,
    scorecard_dedication: 3,
    scorecard_compliance: 3
  });

  assert.equal(res.total, 19);
  assert.equal(res.hasZero, false);
  assert.equal(res.approved, true);
  assert.equal(res.qualification_status, 'qualified');
  assert.equal(res.normalizedLeadScore, 76);
});

test('evaluateFiveFilterScorecard desqualifica automaticamente se qualquer um dos 5 filtros for 0', () => {
  const res = evaluateFiveFilterScorecard({
    scorecard_financial: 5,
    scorecard_territory: 5,
    scorecard_profile: 5,
    scorecard_dedication: 5,
    scorecard_compliance: 0
  });

  assert.equal(res.total, 20);
  assert.equal(res.hasZero, true);
  assert.equal(res.approved, false);
  assert.equal(res.qualification_status, 'disqualified');
});
