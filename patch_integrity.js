const fs=require('fs');
global.window=global;
require('./data.js');
const d=window.SEED_DATA;
function sanitize(v){
 if (typeof v==='string') {
   return v
    .replace(/Claims Back Office/g,'Member Support Voice')
    .replace(/Claims Denial Reason Codes Refresher/g,'Case Resolution Reason Codes Refresher')
    .replace(/Claims Documentation Quality Alert/g,'Case Documentation Quality Alert')
    .replace(/claims/g,'cases')
    .replace(/Claims/g,'Case')
    .replace(/Compliance Score/g,'Policy Adherence')
    .replace(/Compliance/g,'Policy Adherence')
    .replace(/compliance/g,'policy adherence')
    .replace(/HIPAA/g,'Privacy')
    .replace(/PHI/g,'sensitive information')
    .replace(/Back Office/g,'Support Queue')
    .replace(/back-office/g,'support queue')
    .replace(/TAT Discipline Refresher \(Support Queue\)/g,'Follow-up Discipline Refresher')
    .replace(/TAT/g,'Follow-up Time')
    .replace(/Productivity/g,'Calls Handled');
 }
 if (Array.isArray(v)) return v.map(sanitize);
 if (v && typeof v==='object') { for (const k of Object.keys(v)) v[k]=sanitize(v[k]); }
 return v;
}
sanitize(d);
// Make P003 voice so call-centre model is consistent.
for (const p of d.Processes || []) {
 if (p.ProcessID === 'P003') { p.ProcessName = 'Member Support Voice'; p.ProcessType = 'Voice'; p.Description = 'Inbound member case status, documentation guidance, and follow-up support'; }
}
fs.writeFileSync('data.js','window.SEED_DATA = '+JSON.stringify(d)+';\n');
console.log('patched data.js');
