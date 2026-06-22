const {
  clone,
  conflict,
  notFound,
  validationError,
} = require('./store-utils');

function normalizeSlaRuleForSave(state, payload, existing) {
  const incoming = clone(payload || {});
  if (existing && incoming.Rule_ID != null && String(incoming.Rule_ID) !== String(existing.Rule_ID)) {
    conflict('Rule_ID is system-generated and immutable after creation.');
  }
  const next = { ...(existing || {}), ...incoming };
  if (!next.KPI_ID) validationError('SLA rules must be linked to KPI_Master via KPI_ID.', 'SLA_KPI_REQUIRED');
  const kpi = (state.KPI_Master || []).find((row) => row.KPI_ID === next.KPI_ID);
  if (!kpi) notFound(`KPI not found for SLA rule: ${next.KPI_ID}`);
  const target = toFiniteNumber(next.Target, toFiniteNumber(kpi.Target, null));
  if (!Number.isFinite(target)) validationError('SLA rule Target must be numeric.', 'SLA_TARGET_REQUIRED');
  const status = incoming.Status || (existing ? 'Draft' : 'Draft');
  return {
    ...next,
    Rule_ID: existing ? existing.Rule_ID : next.Rule_ID,
    Account_ID: next.Account_ID || 'HCA001',
    KPI_ID: kpi.KPI_ID,
    KPI_Name: next.KPI_Name || kpi.KPI_Name || kpi.KPI_ID,
    Target: target,
    Measurement_Period: next.Measurement_Period || 'Monthly',
    Direction: String(next.Direction || kpi.Direction || 'Higher').toLowerCase() === 'lower' ? 'Lower' : 'Higher',
    Currency: next.Currency || 'USD',
    Max_Penalty: toFiniteNumber(next.Max_Penalty, null),
    Max_Reward: toFiniteNumber(next.Max_Reward, null),
    Status: status,
    Recompute_Status: existing ? 'Pending Publish' : (next.Recompute_Status || 'Pending Publish'),
  };
}

function assertValidSlaSlabs(ruleId, rows) {
  const errors = validateSlabBandsForRows(ruleId, rows);
  if (errors.length) {
    const error = new Error('SLA slab validation failed.');
    error.status = 422;
    error.code = 'SLA_SLAB_OVERLAP';
    error.details = errors;
    throw error;
  }
}

function validateSlabBandsForRows(ruleId, rows) {
  const slabs = (rows || [])
    .filter((slab) => slab.Rule_ID === ruleId)
    .map((slab) => ({
      slabId: slab.Slab_ID,
      from: Number(slab.Variance_From),
      to: Number(slab.Variance_To),
    }))
    .sort((a, b) => a.from - b.from || String(a.slabId || '').localeCompare(String(b.slabId || '')));
  const errors = [];
  for (let i = 0; i < slabs.length; i += 1) {
    const slab = slabs[i];
    if (!Number.isFinite(slab.from) || !Number.isFinite(slab.to) || slab.from > slab.to) {
      errors.push({ slabId: slab.slabId, message: 'Slab variance range is invalid.' });
    }
    const previous = slabs[i - 1];
    if (previous && Number.isFinite(slab.from) && Number.isFinite(previous.to) && slab.from <= previous.to) {
      errors.push({ slabId: slab.slabId, message: `Slab overlaps ${previous.slabId}.` });
    }
  }
  return errors;
}

function commercialPublishState(state, ruleId) {
  const rule = (state.SLA_Commercial_Rules || []).find((row) => row.Rule_ID === ruleId);
  const kpiId = rule && rule.KPI_ID;
  return {
    rule: rule ? clone(rule) : null,
    slabs: clone((state.Penalty_Reward_Slabs || []).filter((row) => row.Rule_ID === ruleId)),
    exposure: clone((state.Commercial_Exposure || []).filter((row) => row.KPI_ID === kpiId)),
    whatIf: clone((state.What_If_Scenarios || []).filter((row) => row.Rule_ID === ruleId || (!row.Rule_ID && row.KPI_ID === kpiId))),
  };
}

function slaPublishSnapshot(rule, slabs, publishedAt, publishedBy) {
  return {
    publishedAt,
    publishedBy: publishedBy || null,
    rule: sanitizeSlaRuleSnapshot(rule),
    slabs: clone(slabs || []).map(sanitizeSlabSnapshot),
  };
}

function sanitizeSlaRuleSnapshot(rule) {
  const copy = clone(rule || {});
  delete copy.Published_Config_Snapshot;
  delete copy.Previous_Published_Config;
  return copy;
}

function sanitizeSlabSnapshot(slab) {
  return clone(slab || {});
}

function buildBaseExposureRows(state, rule, timestamp) {
  const date = timestamp.slice(0, 10);
  const teams = state.Teams || [];
  const performance = latestPerformanceRows(state.Performance_Data || [], rule.KPI_ID);
  const accountTemplate = (state.Commercial_Exposure || []).find((row) => row.Entity_Level === 'Account') || {};
  const teamTemplate = (state.Commercial_Exposure || []).find((row) => row.Entity_Level === 'Team') || {};
  const accountActual = average(performance.map((row) => toFiniteNumber(row.Actual, null)).filter(Number.isFinite));
  const accountForecast = Number.isFinite(accountActual) ? accountActual : toFiniteNumber(rule.Target, 0);
  const accountRow = {
    Snapshot_Date: date,
    Account_ID: accountTemplate.Account_ID || 'CLOVER_MA',
    Account_Name: accountTemplate.Account_Name || 'Clover Health Medicare Advantage Telesales',
    Entity_Level: 'Account',
    Entity_ID: rule.Account_ID || 'HCA001',
    Entity_Name: accountTemplate.Entity_Name || 'Clover Health Medicare Advantage Telesales',
    KPI_ID: rule.KPI_ID,
    KPI_Name: rule.KPI_Name,
    Target: rule.Target,
    Actual_MTD: roundDecimal(accountActual, 2),
    Forecast_EOM: roundDecimal(accountForecast, 2),
    Revenue_MTD: toFiniteNumber(accountTemplate.Revenue_MTD, 0),
    Rate_Card_Per_Call: toFiniteNumber(accountTemplate.Rate_Card_Per_Call, 72),
    Billable_Calls_MTD: toFiniteNumber(accountTemplate.Billable_Calls_MTD, 0),
  };
  const teamRows = teams.map((team) => {
    const rows = performance.filter((row) => row.TeamID === team.TeamID);
    const actual = average(rows.map((row) => toFiniteNumber(row.Actual, null)).filter(Number.isFinite));
    const forecast = Number.isFinite(actual) ? actual : toFiniteNumber(rule.Target, 0);
    return {
      Snapshot_Date: date,
      Account_ID: accountRow.Account_ID,
      Account_Name: accountRow.Account_Name,
      Entity_Level: 'Team',
      Entity_ID: team.TeamID,
      Entity_Name: team.TeamName || team.TeamID,
      KPI_ID: rule.KPI_ID,
      KPI_Name: rule.KPI_Name,
      Target: rule.Target,
      Actual_MTD: roundDecimal(actual, 2),
      Forecast_EOM: roundDecimal(forecast, 2),
      Revenue_MTD: toFiniteNumber(teamTemplate.Revenue_MTD, 0),
      Rate_Card_Per_Call: toFiniteNumber(teamTemplate.Rate_Card_Per_Call, 72),
      Billable_Calls_MTD: toFiniteNumber(teamTemplate.Billable_Calls_MTD, 0),
    };
  });
  return [accountRow, ...teamRows];
}

function latestPerformanceRows(rows, kpiId) {
  const scoped = (rows || []).filter((row) => row.KPI_ID === kpiId);
  const latest = scoped.map((row) => row.Date).filter(Boolean).sort().slice(-1)[0];
  return latest ? scoped.filter((row) => row.Date === latest) : scoped;
}

function recomputeExposureRow(rule, slabs, row, timestamp) {
  const forecast = toFiniteNumber(row.Forecast_EOM, toFiniteNumber(row.Actual_MTD, rule.Target));
  const impact = commercialImpact(rule, slabs, forecast);
  return {
    ...row,
    Snapshot_Date: timestamp.slice(0, 10),
    Rule_ID: rule.Rule_ID,
    KPI_ID: rule.KPI_ID,
    KPI_Name: rule.KPI_Name,
    Target: rule.Target,
    Variance_to_Target: impact.variance,
    Forecast_Penalty: impact.penalty,
    Forecast_Reward: impact.reward,
    Net_Impact: impact.net,
    Recovery_Required: impact.recoveryRequired,
    Risk_Level: impact.riskLevel,
    Impact_Type: impact.impactType,
    Recomputed_At: timestamp,
  };
}

function buildWhatIfRows(rule, slabs, exposureRows, timestamp) {
  const account = exposureRows.find((row) => row.Entity_Level === 'Account') || exposureRows[0];
  if (!account) return [];
  const current = commercialImpact(rule, slabs, toFiniteNumber(account.Forecast_EOM, rule.Target));
  const assumptions = [0.5, 1, 2, 3];
  return assumptions.map((assumption) => {
    const projectedForecast = projectedForecastFor(rule, account.Forecast_EOM, assumption);
    const projected = commercialImpact(rule, slabs, projectedForecast);
    return {
      Scenario_ID: `WI_${rule.Rule_ID}_${String(assumption).replace('.', '_')}`,
      Rule_ID: rule.Rule_ID,
      Scenario_Variance: assumption,
      KPI_ID: rule.KPI_ID,
      KPI_Name: rule.KPI_Name,
      Current_Forecast: roundDecimal(account.Forecast_EOM, 2),
      Improvement_Assumption: assumption,
      Projected_Forecast: roundDecimal(projectedForecast, 2),
      Current_Penalty: current.penalty,
      Projected_Penalty: projected.penalty,
      Current_Reward: current.reward,
      Projected_Reward: projected.reward,
      Net_Improvement: roundMoney(projected.net - current.net),
      Net_Impact: projected.net,
      Recommended_Team: recommendedTeam(exposureRows),
      Revenue_MTD: toFiniteNumber(account.Revenue_MTD, 0),
      Recomputed_At: timestamp,
    };
  });
}

function commercialImpact(rule, slabs, forecast) {
  const target = toFiniteNumber(rule.Target, 0);
  const variance = directionalVariance(rule.Direction, target, forecast);
  const slab = slabForVariance(slabs, variance);
  const rawPenalty = Math.max(0, toFiniteNumber(slab && slab.Penalty_Amount, 0));
  const rawReward = Math.max(0, toFiniteNumber(slab && slab.Reward_Amount, 0));
  const penaltyCap = toFiniteNumber(rule.Max_Penalty, Infinity);
  const rewardCap = toFiniteNumber(rule.Max_Reward, Infinity);
  const penalty = roundMoney(Math.min(rawPenalty, penaltyCap));
  const reward = roundMoney(Math.min(rawReward, rewardCap));
  const impactType = slab ? (slab.Impact_Type || impactTypeForAmounts(penalty, reward, variance)) : impactTypeForAmounts(penalty, reward, variance);
  return {
    variance,
    penalty,
    reward,
    net: roundMoney(reward - penalty),
    recoveryRequired: penalty > 0 ? Math.abs(Math.min(variance, 0)) : 0,
    riskLevel: riskLevelForImpact(penalty, reward, variance),
    impactType,
  };
}

function slabForVariance(slabs, variance) {
  return (slabs || []).find((slab) => {
    const from = Number(slab.Variance_From);
    const to = Number(slab.Variance_To);
    return Number.isFinite(from) && Number.isFinite(to) && variance >= from && variance <= to;
  }) || null;
}

function directionalVariance(direction, target, actualOrForecast) {
  const forecast = toFiniteNumber(actualOrForecast, target);
  if (!Number.isFinite(target) || !Number.isFinite(forecast)) return 0;
  const delta = String(direction || '').toLowerCase() === 'lower'
    ? target - forecast
    : forecast - target;
  return roundDecimal(delta, 2);
}

function projectedForecastFor(rule, forecast, assumption) {
  const current = toFiniteNumber(forecast, toFiniteNumber(rule.Target, 0));
  const multiplier = Math.abs(toFiniteNumber(assumption, 0)) / 100;
  if (String(rule.Direction || '').toLowerCase() === 'lower') {
    return current * (1 - multiplier);
  }
  return current * (1 + multiplier);
}

function recommendedTeam(exposureRows) {
  const teams = (exposureRows || []).filter((row) => row.Entity_Level === 'Team');
  if (!teams.length) return null;
  const ranked = teams.slice().sort((a, b) => {
    const penaltyDelta = toFiniteNumber(b.Forecast_Penalty, 0) - toFiniteNumber(a.Forecast_Penalty, 0);
    if (penaltyDelta) return penaltyDelta;
    return toFiniteNumber(a.Net_Impact, 0) - toFiniteNumber(b.Net_Impact, 0);
  });
  return ranked[0].Entity_ID || null;
}

function impactTypeForAmounts(penalty, reward, variance) {
  if (penalty > 0) return 'Penalty';
  if (reward > 0) return 'Reward';
  return variance < 0 ? 'Penalty' : 'Neutral';
}

function riskLevelForImpact(penalty, reward, variance) {
  if (penalty > 0) return Math.abs(variance) >= 2 ? 'Critical' : 'High';
  if (variance < 0) return 'Watch';
  if (reward > 0) return 'Green';
  return 'Green';
}

function average(values) {
  const nums = (values || []).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function roundDecimal(value, digits) {
  const parsed = toFiniteNumber(value, 0);
  const factor = 10 ** (digits || 0);
  return Math.round(parsed * factor) / factor;
}

function roundMoney(value) {
  return Math.round(toFiniteNumber(value, 0) * 100) / 100;
}

function toFiniteNumber(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  normalizeSlaRuleForSave,
  assertValidSlaSlabs,
  commercialPublishState,
  slaPublishSnapshot,
  sanitizeSlaRuleSnapshot,
  sanitizeSlabSnapshot,
  buildBaseExposureRows,
  recomputeExposureRow,
  buildWhatIfRows,
};
