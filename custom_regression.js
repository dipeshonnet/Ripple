const fs = require('fs');
function readAll(files) {
  return files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
}
const agent = readAll(['app-views-agent-helpers.js', 'app-views-agent-home.js', 'app-views-agent.js']);
const lm = readAll(['app-views-lead-mgr-helpers.js', 'app-views-lead-mgr.js']);
const data = fs.readFileSync('data.js','utf8');
const all = agent + '\n' + lm;
const checks = [];
function pass(name, cond){ checks.push({name, cond}); }
pass('Agent home challenge summary removed', !agent.includes('Peer challenges live in the Challenges page'));
pass('Agent challenge section has unique challenge de-duplication', agent.includes('function uniqueChallenges') && agent.includes('const filtered = uniqueChallenges'));
pass('Agent Revenue Per Agent Hour removed from runtime labels', !agent.includes('Revenue Per Agent Hour') && !agent.includes('Revenue per Agent Hour'));
pass('Agent operational metrics derive from KPI Manager groups', agent.includes("A.kpiMetricGroup(r.KPI_ID) === 'operational'") && !agent.includes('operational' + 'MetricIds'));
pass('Agent KPI definitions panel added', agent.includes('KPI & Outcome Definitions'));
pass('Agent scorecard definitions use Medicare wording', /Eligible Call Conversion[\s\S]*enrollments divided by eligible and interested calls/i.test(agent));
pass('Old visible call-center terms removed from main view code', !/CSAT|FCR|ASA|Call Abandonment|Transfer Rate|Courtesy & Respect|Call Resolved/.test(all));
pass('TL commercial title simplified', lm.includes('Team SLA Health · Reward / Penalty'));
pass('Manager commercial title includes account revenue', lm.includes('Account Revenue · Reward / Penalty'));
pass('Manager Account Command has Total Revenue MTD card', lm.includes("execCard('Total Revenue MTD'"));
pass('Manager command removed revenue per agent hour language', !lm.includes('revenue per agent hour'));
pass('Penalty text limited to SLA Health', lm.includes('Forecast downside from operational SLA health gaps only'));
pass('SLA health metrics derive from configured operational KPIs', lm.includes('function isConfiguredSlaHealthKpi') && lm.includes("linkedRule && A.kpiMetricGroup(kpi) === 'operational'") && !lm.includes('SLA_' + 'HEALTH_METRICS'));
pass('TL revenue is reduced below previous 50% display', lm.includes('Math.round(rawRevenue * 0.25)'));
pass('What-if still operational navigation exists', lm.includes('Open What-If'));
pass('Old data terms replaced', !/CSAT|FCR|ASA|Call Abandonment|Transfer Rate|Courtesy & Respect|Call Resolved/.test(data));
let ok=0;
for(const c of checks){ console.log((c.cond?'PASS':'FAIL')+'  '+c.name); if(c.cond) ok++; }
console.log(`\n${ok} PASS / ${checks.length-ok} FAIL`);
if(ok !== checks.length) process.exit(1);
