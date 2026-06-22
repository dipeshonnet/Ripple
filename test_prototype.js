/* eslint-disable */
// Performance Arena — regression test harness.
//
// Usage:   node test_prototype.js
//
// Loads each prototype JS file inside a Node `vm` context with a stub
// window/document/localStorage so the IIFEs run end-to-end, then validates:
//   1. modules load
//   2. SEED_DATA has every required entity
//   3. Agent view exports
//   4. Team Lead / Manager view exports
//   5. commercial scoping (TL vs Manager)
//   6. challenge creation (Agent / TL / Manager) — role + Created_By + 2 participants
//   7. reward flow (redeem / approve / reject)
//   8. broadcast / training / PKT mutators
//   9. forbidden text in source files
// Each assertion prints PASS or FAIL with a reason and a suggested fix.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const CORE_SOURCE_FILES = ['app-core-state.js', 'app-core.js'];
const AGENT_SOURCE_FILES = ['app-views-agent-helpers.js', 'app-views-agent-home.js', 'app-views-agent.js'];
const LEAD_SOURCE_FILES = ['app-views-lead-mgr-helpers.js', 'app-views-lead-mgr.js'];
const ADMIN_SOURCE_FILES = ['admin/admin-dashboard.js', 'admin/admin-app.js'];
const SOURCE_FILES = [
  'data.js',
  ...CORE_SOURCE_FILES,
  ...AGENT_SOURCE_FILES,
  ...LEAD_SOURCE_FILES,
  'app-modals.js',
  ...ADMIN_SOURCE_FILES,
];

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn, hint) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    pass += 1;
  } catch (e) {
    console.log(`  FAIL  ${name}`);
    console.log(`        reason: ${e.message}`);
    if (hint) console.log(`        suggested fix: ${hint}`);
    failures.push({ name, reason: e.message, hint });
    fail += 1;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label || 'mismatch'} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---- DOM / window stubs --------------------------------------------------

function makeStubElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {},
    innerHTML: '',
    textContent: '',
    value: '',
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    blur() {},
    click() {},
    remove() {},
    scrollTo() {},
    setSelectionRange() {},
  };
  return el;
}

const stubBody = makeStubElement('body');
const stubDoc = {
  body: stubBody,
  createElement: (t) => makeStubElement(t),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
};

function makeLocalStorage() {
  const map = {};
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    removeItem: (k) => { delete map[k]; },
    clear: () => { for (const k of Object.keys(map)) delete map[k]; },
  };
}

const ctx = {
  console,
  setTimeout: () => 0,
  setInterval: () => 0,
  clearTimeout: () => {},
  clearInterval: () => {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  Date,
  Math,
  JSON,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Error,
  Promise,
  Map,
  Set,
  Symbol,
  RegExp,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
};
ctx.window = ctx;
ctx.document = stubDoc;
ctx.localStorage = makeLocalStorage();
ctx.lucide = { createIcons: () => {} };
ctx.global = ctx;
ctx.globalThis = ctx;

vm.createContext(ctx);

function loadScript(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf-8');
  vm.runInContext(src, ctx, { filename: file });
}

function readSource(files) {
  return files.map(file => fs.readFileSync(path.join(ROOT, file), 'utf-8')).join('\n');
}

// ===========================================================================
//  Phase 1 — module loading
// ===========================================================================
console.log('\n[Phase 1] Module loading');
for (const f of SOURCE_FILES) {
  test(
    `loads ${f}`,
    () => loadScript(f),
    `Open ${f} and verify it parses standalone — likely a syntax error or undefined global.`,
  );
}

// ===========================================================================
//  Phase 2 — SEED_DATA validation
// ===========================================================================
console.log('\n[Phase 1b] Admin route isolation');
const redirects = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf-8');
const serviceWorker = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf-8');
const adminHtml = fs.readFileSync(path.join(ROOT, 'admin', 'index.html'), 'utf-8');

test(
  '/admin redirects before SPA catch-all',
  () => {
    const adminRoute = redirects.indexOf('/admin /admin/index.html 200');
    const catchAll = redirects.indexOf('/* /index.html 200');
    assert(adminRoute >= 0, 'missing /admin redirect');
    assert(catchAll >= 0, 'missing SPA catch-all redirect');
    assert(adminRoute < catchAll, '/admin route must be evaluated before /*');
  },
  'Put /admin and /admin/* redirects above the catch-all fallback.',
);

test(
  'admin shell does not boot role-switching Arena app',
  () => {
    assert(adminHtml.includes('/admin/admin-app.js'), 'admin shell missing admin-app.js');
    assert(!adminHtml.includes('app-core.js'), 'admin shell must not load app-core.js');
    assert(!adminHtml.includes('data-role='), 'admin shell must not expose role switching controls');
  },
  'Keep /admin on its dedicated entry point, separate from Agent/TL/Manager role switching.',
);

test(
  'service worker falls back to admin shell for /admin navigations',
  () => {
    assert(serviceWorker.includes('./admin/index.html'), 'admin shell is not cached');
    assert(serviceWorker.includes("url.pathname.startsWith('/admin') ? ADMIN_SHELL : './index.html'"), 'admin fallback is missing');
    assert(serviceWorker.includes("url.pathname.startsWith('/api/')"), 'API routes should bypass app-shell caching');
  },
  'Update service-worker.js admin shell cache and navigation fallback.',
);

console.log('\n[Phase 2] SEED_DATA validation');
const REQUIRED_ENTITIES = [
  'Users', 'Teams', 'Processes', 'KPI_Master',
  'Performance_Data', 'Daily_Agent_Score', 'Agent_Current',
  'Leaderboard', 'Points_Ledger', 'XP_Ledger',
  'Missions', 'Mission_Assignments',
  'Challenges', 'Challenge_Participants', 'Challenge_Results',
  'Badges', 'Agent_Badges',
  'Rewards', 'Reward_Redemptions',
  'Communications', 'Communication_Status',
  'Learning_Modules', 'Learning_Assignments', 'Learning_Completion_Status',
  'PKT_Assessments', 'PKT_Questions', 'PKT_Attempts',
  'SLA_Commercial_Rules', 'Penalty_Reward_Slabs',
  'Commercial_Exposure', 'Commercial_Verification',
  'What_If_Scenarios',
  'Coaching', 'Recognition',
  'Learning_Points_Rules', 'TL_Manager_Verification',
];

test(
  'window.SEED_DATA is defined',
  () => assert(ctx.window.SEED_DATA && typeof ctx.window.SEED_DATA === 'object', 'SEED_DATA missing'),
  'Run: python export_to_json.py  (regenerates data.js from the workbook).',
);

for (const entity of REQUIRED_ENTITIES) {
  test(
    `SEED_DATA.${entity} present and non-empty`,
    () => {
      const arr = ctx.window.SEED_DATA[entity];
      assert(Array.isArray(arr), `${entity} is not an array`);
      assert(arr.length > 0, `${entity} is empty`);
    },
    `Add the sheet to Performance_Arena_Dataset.xlsx and re-run python export_to_json.py.`,
  );
}

// ===========================================================================
//  Phase 3 — Agent view exports
// ===========================================================================
console.log('\n[Phase 3] Agent view exports');
const AGENT_EXPORTS = [
  'renderHome', 'renderScorecard', 'renderMissions', 'renderChallenges',
  'renderLeaderboard', 'renderStore', 'renderBroadcasts', 'renderTraining', 'renderProfile',
];
for (const fn of AGENT_EXPORTS) {
  test(
    `ArenaAgentViews.${fn}`,
    () => {
      const views = ctx.window.ArenaAgentViews;
      assert(views, 'ArenaAgentViews not exported');
      assert(typeof views[fn] === 'function', `${fn} is not a function on ArenaAgentViews`);
    },
    `Export ${fn} from app-views-agent.js (window.ArenaAgentViews block at the bottom).`,
  );
}

// ===========================================================================
//  Phase 4 — Team Lead / Manager view exports
// ===========================================================================
console.log('\n[Phase 4] Lead/Manager view exports');
const LEAD_MGR_EXPORTS = [
  'renderLeadConsole', 'renderLeadTeam', 'renderLeadCommercial', 'renderLeadOutcomes', 'renderLeadRca', 'renderLeadTrends', 'renderLeadMissions',
  'renderTrainingConsole', 'renderLeadCoaching', 'renderLeadRecognition',
  'renderMgrCommand', 'renderMgrSla', 'renderMgrCommercial', 'renderMgrOutcomes', 'renderMgrRca', 'renderMgrTrends', 'renderMgrWhatIf',
  'renderMgrAdoption', 'renderMgrTeams',
];
for (const fn of LEAD_MGR_EXPORTS) {
  test(
    `ArenaLeadMgrViews.${fn}`,
    () => {
      const views = ctx.window.ArenaLeadMgrViews;
      assert(views, 'ArenaLeadMgrViews not exported');
      assert(typeof views[fn] === 'function', `${fn} is not a function on ArenaLeadMgrViews`);
    },
    `Export ${fn} from app-views-lead-mgr.js (window.ArenaLeadMgrViews block at the bottom).`,
  );
}

const A = ctx.window.Arena;


console.log('\n[Phase 4b] BIC page render smoke');
for (const [name, role, user] of [
  ['renderLeadTeam', 'Team Lead', 'TL001'],
  ['renderLeadRca', 'Team Lead', 'TL001'],
  ['renderLeadTrends', 'Team Lead', 'TL001'],
  ['renderMgrRca', 'Manager', 'MGR001'],
  ['renderMgrTrends', 'Manager', 'MGR001'],
]) {
  test(
    `${name} renders non-empty HTML`,
    () => {
      A.state.role = role;
      A.state.activeUserId = user;
      const html = ctx.window.ArenaLeadMgrViews[name]();
      assert(typeof html === 'string' && html.length > 500, `${name} returned too little HTML`);
      assert(!html.includes('undefined</div>') && !html.includes('undefined ·'), `${name} contains visible undefined`);
    },
    `Check ${name} for missing variables or broken template interpolation.`,
  );
}

// ===========================================================================
//  Phase 5 — commercial scoping
// ===========================================================================
console.log('\n[Phase 5] Commercial scoping');

test(
  'TL001 sees only T001 commercial rows',
  () => {
    const rows = A.state.verification.filter(
      (v) => v.Verifier_Role === 'Team Lead' && v.Owner_ID === 'TL001',
    );
    assert(rows.length > 0, 'no TL001 verification rows');
    for (const r of rows) {
      assertEq(r.Entity_ID, 'T001', `TL001 has cross-team row (Entity_ID=${r.Entity_ID})`);
    }
  },
  'In renderLeadCommercial, ensure rows are filtered by both Verifier_Role==="Team Lead" and Owner_ID===tl.UserID.',
);

test(
  'TL002 sees only T002 commercial rows',
  () => {
    const rows = A.state.verification.filter(
      (v) => v.Verifier_Role === 'Team Lead' && v.Owner_ID === 'TL002',
    );
    assert(rows.length > 0, 'no TL002 verification rows');
    for (const r of rows) {
      assertEq(r.Entity_ID, 'T002', `TL002 has cross-team row (Entity_ID=${r.Entity_ID})`);
    }
  },
  'Check generate_mock_data.py — Owner_ID/Entity_ID for TL rows must match the TL\'s team.',
);

test(
  'Manager sees Account-level rows (HCAxxx)',
  () => {
    const rows = A.state.verification.filter((v) => v.Verifier_Role === 'Manager');
    assert(rows.length > 0, 'no Manager verification rows');
    for (const r of rows) {
      assert(/^HCA/.test(r.Entity_ID), `Manager has non-account row (Entity_ID=${r.Entity_ID})`);
    }
  },
  'Manager rows must have Entity_ID starting with HCA (account scope), not Txxx.',
);

test(
  'Manager has visibility into all TL teams',
  () => {
    const tlEntities = new Set(
      A.state.verification
        .filter((v) => v.Verifier_Role === 'Team Lead')
        .map((v) => v.Entity_ID),
    );
    assert(tlEntities.size >= 2, `expected multiple TL teams in verification, got ${tlEntities.size}`);
  },
  'generate_mock_data.py should produce TL verification rows for every team.',
);

test(
  'TL totals differ from Manager totals (scope sanity)',
  () => {
    const tlNet = A.state.verification
      .filter((v) => v.Verifier_Role === 'Team Lead' && v.Owner_ID === 'TL001')
      .reduce((s, r) => s + (r.Net_Impact || 0), 0);
    const mgrNet = A.state.verification
      .filter((v) => v.Verifier_Role === 'Manager')
      .reduce((s, r) => s + (r.Net_Impact || 0), 0);
    // It is theoretically possible (but unlikely) for these to coincidentally match.
    // If they match exactly, it's almost certainly a scoping bug — manager view leaking into TL view.
    assert(
      tlNet !== mgrNet,
      `TL001 net (${tlNet}) equals Manager net (${mgrNet}) — likely the views are pulling from the same set.`,
    );
  },
  'If totals match, either renderLeadCommercial is missing the Owner_ID filter or seed data is identical.',
);

// ===========================================================================
//  Phase 6 — challenge creation
// ===========================================================================
console.log('\n[Phase 6] Challenge creation');

test(
  'Agent can create challenge — 2 participants, Created_By=Agent',
  () => {
    A.state.role = 'Agent';
    A.state.activeUserId = 'AG001';
    const c = A.createChallenge({
      name: '__test_agent_challenge',
      type: 'Peer',
      p1: 'AG001',
      p2: 'AG006',
      kpiId: 'KPI001',
      end: A.addDays(7),
      entry: 100,
      pool: 200,
    });
    assert(c, 'createChallenge returned null');
    assertEq(c.Created_By, 'AG001', 'Created_By');
    const parts = A.state.challengeParticipants.filter((p) => p.Challenge_ID === c.Challenge_ID);
    assertEq(parts.length, 2, 'Challenge_Participants row count');
    const sides = parts.map((p) => p.Side).sort();
    assertEq(sides.join(','), 'A,B', 'expected sides A and B');
  },
  'In createChallenge (app-core.js): set Created_By = state.activeUserId and seed both Side A and Side B in state.challengeParticipants.',
);

test(
  'Team Lead creating a challenge keeps role=Team Lead',
  () => {
    A.state.role = 'Team Lead';
    A.state.activeUserId = 'TL001';
    const c = A.createChallenge({
      name: '__test_tl_challenge',
      type: 'Peer',
      p1: 'AG001',
      p2: 'AG006',
      kpiId: 'KPI001',
      end: A.addDays(5),
      entry: 0,
      pool: 100,
    });
    assert(c, 'createChallenge returned null');
    assertEq(A.state.role, 'Team Lead', 'role drifted from Team Lead');
    assertEq(c.Created_By, 'TL001', 'Created_By');
  },
  'submitCreateChallenge (app-modals.js) must NOT force state.role to "Agent". Route by role: TL→lead-missions, Mgr→mgr-command, Agent→challenges.',
);

test(
  'Manager creating a challenge keeps role=Manager',
  () => {
    A.state.role = 'Manager';
    A.state.activeUserId = 'MGR001';
    const c = A.createChallenge({
      name: '__test_mgr_challenge',
      type: 'Peer',
      p1: 'AG001',
      p2: 'AG006',
      kpiId: 'KPI001',
      end: A.addDays(5),
      entry: 0,
      pool: 100,
    });
    assert(c, 'createChallenge returned null');
    assertEq(A.state.role, 'Manager', 'role drifted from Manager');
    assertEq(c.Created_By, 'MGR001', 'Created_By');
  },
  'submitCreateChallenge must preserve state.role for Manager.',
);

// ===========================================================================
//  Phase 7 — reward flow
// ===========================================================================
console.log('\n[Phase 7] Reward flow');

test(
  'Agent redeem (instant) reduces stock and writes a Fulfilled redemption',
  () => {
    A.state.role = 'Agent';
    A.state.activeUserId = 'AG001';
    const r = A.state.rewards.find((x) => x.Approval_Required === 'No' && x.Stock > 0);
    assert(r, 'no instant reward in seed');
    A.applyPointsToUser('AG001', r.Points_Required + 100, 0); // ensure affordability
    const stockBefore = r.Stock;
    const redemption = A.redeemReward(r.Reward_ID, 'AG001');
    assert(redemption, 'redeemReward returned null');
    assertEq(r.Stock, stockBefore - 1, 'stock did not decrement');
    assertEq(redemption.Status, 'Fulfilled', 'instant reward should fulfil immediately');
  },
  'redeemReward must decrement r.Stock and set Status=Fulfilled when Approval_Required==="No".',
);

test(
  'Approval reward routes to the agent\'s actual TL (TL001 for AG001)',
  () => {
    A.state.role = 'Agent';
    A.state.activeUserId = 'AG001';
    const u = A.userById('AG001');
    const team = A.state.teams.find((t) => t.TeamID === u.TeamID);
    const expectedOwner = team && team.TeamLeadID;
    const r = A.state.rewards.find((x) => x.Approval_Required === 'Yes' && x.Stock > 0);
    assert(r, 'no approval-required reward');
    A.applyPointsToUser('AG001', r.Points_Required + 100, 0);
    const redemption = A.redeemReward(r.Reward_ID, 'AG001');
    assert(redemption, 'redeemReward returned null');
    assertEq(redemption.Status, 'Pending Approval', 'approval reward should pend');
    assertEq(redemption.Fulfilment_Owner, expectedOwner, 'Fulfilment_Owner');
  },
  'redeemReward must compute Fulfilment_Owner = team.TeamLeadID || user.ManagerID — never hardcoded TL001.',
);

test(
  'TL approve transitions Pending Approval → Fulfilled',
  () => {
    A.state.role = 'Team Lead';
    A.state.activeUserId = 'TL001';
    const pending = A.state.redemptions.find((rd) => rd.Status === 'Pending Approval');
    assert(pending, 'no pending redemption to approve');
    A.approveRedemption(pending.Redemption_ID);
    const after = A.state.redemptions.find((rd) => rd.Redemption_ID === pending.Redemption_ID);
    assertEq(after.Status, 'Fulfilled', 'redemption status after approve');
    assertEq(after.Approved_By, 'TL001', 'Approved_By');
  },
  'approveRedemption must flip Status to Fulfilled and stamp Approved_By/Approved_Date.',
);

test(
  'TL reject transitions Pending → Rejected and refunds points',
  () => {
    A.state.role = 'Agent';
    A.state.activeUserId = 'AG001';
    const r = A.state.rewards.find((x) => x.Approval_Required === 'Yes' && x.Stock > 0);
    assert(r, 'no approval reward for reject test');
    A.applyPointsToUser('AG001', r.Points_Required + 100, 0);
    const redemption = A.redeemReward(r.Reward_ID, 'AG001');
    const ptsAfterRedeem = A.userById('AG001').ArenaPoints;

    A.state.role = 'Team Lead';
    A.state.activeUserId = 'TL001';
    A.rejectRedemption(redemption.Redemption_ID);

    const after = A.state.redemptions.find((rd) => rd.Redemption_ID === redemption.Redemption_ID);
    assertEq(after.Status, 'Rejected', 'redemption status after reject');
    const ptsAfterRefund = A.userById('AG001').ArenaPoints;
    assert(
      ptsAfterRefund > ptsAfterRedeem,
      `points not refunded (after redeem=${ptsAfterRedeem}, after refund=${ptsAfterRefund})`,
    );
  },
  'rejectRedemption must (a) set Status=Rejected, (b) refund Points_Spent via applyPointsToUser, (c) restore stock.',
);

// ===========================================================================
//  Phase 8 — broadcast / training / PKT
// ===========================================================================
console.log('\n[Phase 8] Broadcast / training / PKT');

test(
  'Agent can mark a broadcast assignment as viewed',
  () => {
    A.state.role = 'Agent';
    A.state.activeUserId = 'AG001';
    const broadcastIds = new Set(
      A.state.modules.filter((m) => m.Module_Type === 'Broadcast').map((m) => m.Module_ID),
    );
    const assignment = A.state.assignments.find(
      (a) => a.UserID === 'AG001' && broadcastIds.has(a.Module_ID),
    );
    assert(assignment, 'no broadcast assignment for AG001');
    A.markViewed(assignment.Assignment_ID);
    const c = A.findCompletion(assignment.Assignment_ID);
    assertEq(c.Viewed, 'Yes', 'completion.Viewed');
  },
  'markViewed must set completion.Viewed="Yes" and update assignment.Assignment_Status to "In Progress".',
);

test(
  'Agent can acknowledge a broadcast',
  () => {
    A.state.role = 'Agent';
    A.state.activeUserId = 'AG001';
    const broadcastIds = new Set(
      A.state.modules.filter((m) => m.Module_Type === 'Broadcast').map((m) => m.Module_ID),
    );
    const assignment = A.state.assignments.find((a) => {
      if (a.UserID !== 'AG001' || !broadcastIds.has(a.Module_ID)) return false;
      const c = A.findCompletion(a.Assignment_ID);
      return c && c.Acknowledged !== 'Yes';
    });
    assert(assignment, 'no unacknowledged broadcast for AG001');
    A.acknowledgeAssignment(assignment.Assignment_ID);
    const c = A.findCompletion(assignment.Assignment_ID);
    assertEq(c.Acknowledged, 'Yes', 'completion.Acknowledged');
    assertEq(c.Status, 'Acknowledged', 'completion.Status');
  },
  'acknowledgeAssignment must set Acknowledged="Yes" and award half points/XP.',
);

test(
  'Agent can complete a training module',
  () => {
    A.state.role = 'Agent';
    A.state.activeUserId = 'AG001';
    const trainingIds = new Set(
      A.state.modules.filter((m) => m.Module_Type === 'Training').map((m) => m.Module_ID),
    );
    const assignment = A.state.assignments.find((a) => {
      if (a.UserID !== 'AG001' || !trainingIds.has(a.Module_ID)) return false;
      const c = A.findCompletion(a.Assignment_ID);
      return c && c.Completed !== 'Yes';
    });
    assert(assignment, 'no incomplete training for AG001');
    A.completeAssignment(assignment.Assignment_ID);
    const c = A.findCompletion(assignment.Assignment_ID);
    assertEq(c.Completed, 'Yes', 'completion.Completed');
    assertEq(c.Status, 'Completed', 'completion.Status');
  },
  'completeAssignment must set Completed="Yes", Status="Completed", award full Points/XP.',
);

test(
  'Agent can submit a PKT attempt',
  () => {
    A.state.role = 'Agent';
    A.state.activeUserId = 'AG001';
    const pkt = A.state.pkts[0];
    assert(pkt, 'no PKT in seed');
    const qs = A.questionsForPkt(pkt.PKT_ID);
    assert(qs.length > 0, 'PKT has no questions');
    const before = A.state.pktAttempts.length;
    // Submit all-correct answers so we exercise the Pass branch + bonus path.
    const answers = qs.map((q) => q.Correct_Answer);
    A.submitPktAttempt(pkt.Module_ID, 'AG001', answers);
    assert(A.state.pktAttempts.length > before, 'attempt not recorded in pktAttempts');
    const last = A.state.pktAttempts[A.state.pktAttempts.length - 1];
    assertEq(last.UserID, 'AG001', 'attempt UserID');
    assertEq(last.PKT_ID, pkt.PKT_ID, 'attempt PKT_ID');
  },
  'submitPktAttempt must push a row into state.pktAttempts and award points/XP on Pass.',
);


// ===========================================================================
//  Phase 9 — demo-readiness commercial / what-if / challenge language
// ===========================================================================
console.log('\n[Phase 9] Demo-readiness checks');

test(
  'Commercial exposure is demo-safe: account penalty is >= each TL and TL exposure is materially lower',
  () => {
    const byKpi = new Set(A.state.exposure.map((e) => e.KPI_ID));
    for (const kpi of byKpi) {
      const acc = A.state.exposure.find((e) => e.Entity_Level === 'Account' && e.KPI_ID === kpi);
      const teams = A.state.exposure.filter((e) => e.Entity_Level === 'Team' && e.KPI_ID === kpi);
      if (!acc || !teams.length) continue;
      for (const t of teams) {
        assert((acc.Forecast_Penalty || 0) >= (t.Forecast_Penalty || 0), `${kpi}: ${t.Entity_ID} penalty exceeds account penalty`);
        if ((acc.Forecast_Penalty || 0) > 0) {
          assert((t.Forecast_Penalty || 0) <= (acc.Forecast_Penalty || 0) * 0.10 + 100, `${kpi}: ${t.Entity_ID} team penalty should be a small demo-scoped share of account penalty`);
        }
      }
    }
  },
  'Team Lead exposure is intentionally demo-scoped and much lower than Manager account exposure.',
);

test(
  'Team Lead commercial verification is scoped to TL001 team rows only',
  () => {
    A.state.role = 'Team Lead';
    A.state.activeUserId = 'TL001';
    const rows = A.state.verification.filter((v) => v.Verifier_Role === 'Team Lead' && v.Owner_ID === 'TL001');
    assert(rows.length > 0, 'no Team Lead verification rows for TL001');
    assert(rows.every((r) => r.Entity_ID === 'T001'), 'TL001 must only see T001 commercial rows');
    const tlPenalty = rows.reduce((s, r) => s + (r.Forecast_Penalty || 0), 0);
    const mgrPenalty = A.state.verification.filter((v) => v.Verifier_Role === 'Manager').reduce((s, r) => s + (r.Forecast_Penalty || 0), 0);
    assert(tlPenalty < mgrPenalty, `TL penalty ${tlPenalty} should be lower than Manager account penalty ${mgrPenalty}`);
  },
  'Team Lead commercial rows should be team-scoped and materially lower than account rollup.',
);

test(
  'Manager What-If renders as an interactive simulator and changes with improvement assumption',
  () => {
    A.state.role = 'Manager';
    A.state.activeUserId = 'MGR001';
    A.state.mgrWhatIfKpi = 'KPI001';
    A.state.mgrWhatIfImprove = 0.5;
    const first = ctx.window.ArenaLeadMgrViews.renderMgrWhatIf();
    assert(/Account What-If Simulator/.test(first), 'missing simulator heading');
    assert(/Improvement assumption/.test(first), 'missing improvement controls');
    assert(/Create Recovery Mission/.test(first), 'missing recovery mission action');
    A.state.mgrWhatIfImprove = 2.0;
    const second = ctx.window.ArenaLeadMgrViews.renderMgrWhatIf();
    assert(first !== second, 'what-if output did not change when improvement changed');
  },
  'What-If should be a simulator, not a static slab table.',
);

test(
  'Challenge demo wording uses Pts and does not award challenge XP',
  () => {
    const agentSrc = readSource(AGENT_SOURCE_FILES);
    const coreSrc = readSource(CORE_SOURCE_FILES);
    assert(!/Claim victory \(sim\)/.test(agentSrc), 'old simulated victory label remains');
    assert(agentSrc.includes('Submit Win for TL Validation'), 'TL validation submit label missing');
    assert(!/pts won · \+\$\{Math\.round/.test(agentSrc), 'challenge result still displays bonus XP');
    assert(/Challenges award spendable Pts only/.test(coreSrc), 'challenge settlement should document points-only award');
  },
  'Challenges should use Arena Points as currency; XP is progression only.',
);

// ===========================================================================
//  Phase 10 — forbidden text in source files
// ===========================================================================
console.log('\n[Phase 10] Forbidden text');

const SCAN_FILES = [
  ...CORE_SOURCE_FILES,
  ...AGENT_SOURCE_FILES,
  ...LEAD_SOURCE_FILES,
  'app-modals.js',
  'index.html',
  'styles.css',
];
const FORBIDDEN = [
  { regex: /₹/, label: '₹ (rupee symbol — should be $)', hint: 'Replace ₹ with the usd() helper or "$".' },
  { regex: /\bINR\b/, label: 'INR currency code', hint: 'Use USD (the prototype is dollars now).' },
  { regex: /winner takes the pool/i, label: '"winner takes the pool"', hint: 'Replaced with "winner takes the reward".' },
  { regex: /HIPAA Zero[- ]?Defect/i, label: '"HIPAA Zero-Defect" / "HIPAA Zero Defect"', hint: 'Use "No Critical Errors" everywhere.' },
  { regex: /\bstak(e|ed|es|ing)\b/i, label: 'gambling-style "stake"', hint: 'Rephrase: "self-staked" → "self-issued"; "stake" → "entry" or "commit".' },
];

for (const f of SCAN_FILES) {
  const fpath = path.join(ROOT, f);
  if (!fs.existsSync(fpath)) continue;
  const src = fs.readFileSync(fpath, 'utf-8');
  for (const item of FORBIDDEN) {
    test(
      `${f} contains no ${item.label}`,
      () => {
        const m = src.match(item.regex);
        if (m) {
          // Find the line number for context.
          const idx = src.indexOf(m[0]);
          const lineNo = src.slice(0, idx).split('\n').length;
          throw new Error(`found "${m[0]}" at ${f}:${lineNo}`);
        }
      },
      item.hint,
    );
  }
}

// ===========================================================================
//  Phase 11 — Requested demo fixes
// ===========================================================================
console.log('\n[Phase 11] Requested demo fixes');

test('commercial exposure reduced to demo-safe scale', () => {
  const accountPenalty = ctx.window.Arena.state.exposure.filter(e => e.Entity_Level === 'Account').reduce((s,e)=>s+(e.Forecast_Penalty||0),0);
  assert(accountPenalty > 0 && accountPenalty < 3000000, `account penalty should be reduced; got ${accountPenalty}`);
});

test('Agent vs Agent category uses challenge type, not KPI theme', () => {
  const src = readSource(AGENT_SOURCE_FILES);
  assert(src.includes('if (meta.type) return list.filter(c => c.Challenge_Type === meta.type)'), 'type-based challenge category filter missing');
});

test('opponent selection no longer reopens challenge modal', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app-modals.js'), 'utf-8');
  assert(src.includes("['ch-days', 'ch-kpi'].includes(e.target.id)"), 'participant change should not trigger full modal rerender');
  assert(!src.includes("['ch-days', 'ch-kpi', 'ch-p1', 'ch-p2'].includes(e.target.id)"), 'old participant rerender list still present');
});

test('challenge win goes to TL validation before award', () => {
  const src = readSource(CORE_SOURCE_FILES);
  assert(src.includes("cs.status = 'Pending Validation'"), 'settle should submit for validation');
  assert(src.includes('tl-validate-challenge'), 'TL validation action missing');
});



test('client outcome layer is present and XP is relabelled for demo UI', () => {
  const agentSrc = readSource(AGENT_SOURCE_FILES);
  const leadSrc = readSource(LEAD_SOURCE_FILES);
  assert(agentSrc.includes('My member impact today'), 'Agent member-impact section missing');
  assert(agentSrc.includes('Level Progress'), 'Level Progress label missing from Agent UI');
  assert(leadSrc.includes('Client outcome coaching board'), 'TL outcome coaching board missing');
  assert(leadSrc.includes('Client outcome & value console'), 'Manager client outcome console missing');
  assert(leadSrc.includes('metricHelp('), 'question-mark metric definitions missing');
});

test('agent UI does not show modeled dollar savings for repeat contacts', () => {
  const agentSrc = readSource(AGENT_SOURCE_FILES);
  assert(!/repeat contact.*\$|\$.*repeat contact/i.test(agentSrc), 'Agent UI should not show repeat-contact dollar savings');
  assert(agentSrc.includes('No dollar savings are shown at agent level'), 'Agent guardrail copy missing');
});




// ===========================================================================
//  Final acceptance tests — outcome intelligence fixes
// ===========================================================================
console.log('\n[Phase 10] Final acceptance checks');

test('TL and Manager have separate Client Outcomes navigation', () => {
  const src = readSource(CORE_SOURCE_FILES);
  assert(src.includes("id: 'lead-outcomes'") && src.includes("Team Console"), 'TL Client Outcomes nav missing');
  assert(src.includes("id: 'mgr-outcomes'") && src.includes("Account Command"), 'Manager Client Outcomes nav missing');
});

test('TL and Manager SLA/KPI Trends pages render with week-on-week content', () => {
  ctx.window.Arena.state.role = 'Team Lead'; ctx.window.Arena.state.activeUserId = 'TL001';
  const tl = ctx.window.ArenaLeadMgrViews.renderLeadTrends();
  assert(tl.includes('SLA/KPI Trends') && tl.includes('Current week') && tl.includes('Previous week'), 'TL trends page missing WoW table');
  ctx.window.Arena.state.role = 'Manager'; ctx.window.Arena.state.activeUserId = 'MGR001';
  const mgr = ctx.window.ArenaLeadMgrViews.renderMgrTrends();
  assert(mgr.includes('SLA/KPI Trends') && mgr.includes('Team contribution'), 'Manager trends page missing WoW/team contribution');
  assert(!/undefined|null/.test(tl + mgr), 'Trends pages contain undefined/null');
});

test('TL and Manager Client Metric RCA pages render full RCA fields', () => {
  ctx.window.Arena.state.role = 'Team Lead'; ctx.window.Arena.state.activeUserId = 'TL001';
  const tl = ctx.window.ArenaLeadMgrViews.renderLeadRca();
  ctx.window.Arena.state.role = 'Manager'; ctx.window.Arena.state.activeUserId = 'MGR001';
  const mgr = ctx.window.ArenaLeadMgrViews.renderMgrRca();
  for (const html of [tl, mgr]) {
    assert(html.includes('Symptom') && html.includes('Driver KPIs') && html.includes('Root-cause') && html.includes('Drill-down panel') && html.includes('Recommended intervention'), 'RCA page missing required diagnostic fields');
    assert(!/undefined|null/.test(html), 'RCA page contains undefined/null');
  }
});

test('Medicare agent KPI model matches controllable telesales metrics', () => {
  const data = ctx.window.SEED_DATA;
  const names = data.KPI_Master.map(k => k.KPI_Name).join(' | ');
  ['Overall Conversion Rate','Eligible Call Conversion Rate','Applications Per Day','Effectuation Rate','CMS Test Call Score','SOA Compliance Rate','Disclosure Completion Rate','Quality Assurance Score','Call Adherence Rate'].forEach(name => {
    assert(names.includes(name), `Medicare KPI missing: ${name}`);
  });
  assert(!names.includes('Claims Accuracy'), 'Claims Accuracy should not exist in Medicare telesales KPI master');
  assert(!names.includes('Courtesy & Respect'), 'Healthcare call-centre experience KPI should not remain in Medicare telesales KPI master');
});

test('Manager revenue exists and penalty exposure is <= 5% of revenue', () => {
  const exp = ctx.window.Arena.state.exposure.filter(e => e.Entity_Level === 'Account');
  const revenue = exp[0].Revenue_MTD;
  const penalty = exp.reduce((s,e)=>s+(e.Forecast_Penalty||0),0);
  assert(revenue > 0, 'Manager revenue missing');
  assert(penalty / revenue <= 0.05, `Penalty is ${(penalty/revenue*100).toFixed(2)}% of revenue`);
  const html = ctx.window.ArenaLeadMgrViews.renderMgrCommercial();
  assert(html.includes('Total Revenue MTD') && html.includes('SLA Penalty Exposure') && html.includes('Modeled Medicare financial impact assumptions'), 'Manager Revenue & Commercial page missing executive Medicare tiles');
});

test('TL penalty exposure is less than 10% of Manager account penalty', () => {
  const accPenalty = ctx.window.Arena.state.exposure.filter(e => e.Entity_Level === 'Account').reduce((s,e)=>s+(e.Forecast_Penalty||0),0);
  const teams = ctx.window.Arena.state.teams.map(t => t.TeamID);
  for (const tid of teams) {
    const p = ctx.window.Arena.state.exposure.filter(e => e.Entity_Level === 'Team' && e.Entity_ID === tid).reduce((s,e)=>s+(e.Forecast_Penalty||0),0);
    assert(p < accPenalty * 0.10, `${tid} penalty ${p} should be <10% of account ${accPenalty}`);
  }
});

test('RAG counts and filters are implemented for Agent/TL/Manager', () => {
  const core = readSource(CORE_SOURCE_FILES);
  const agent = readSource(AGENT_SOURCE_FILES);
  const lead = readSource(LEAD_SOURCE_FILES);
  assert(core.includes('state.ragFilter'), 'global RAG filter handling missing');
  assert(agent.includes('data-rag-filter="Green"') && agent.includes('displayRows'), 'Agent RAG filter wiring missing');
  assert(lead.includes('finalRagCountButtons') && lead.includes('finalFilteredRows'), 'TL/Mgr RAG count/filter helpers missing');
  ctx.window.Arena.state.role = 'Team Lead'; ctx.window.Arena.state.activeUserId = 'TL001'; ctx.window.Arena.state.ragFilter = 'Amber';
  const tl = ctx.window.ArenaLeadMgrViews.renderLeadTrends();
  assert(tl.includes('Active filter') || tl.includes('Watch metrics'), 'TL RAG filter did not render active state');
  ctx.window.Arena.state.role = 'Manager'; ctx.window.Arena.state.activeUserId = 'MGR001'; ctx.window.Arena.state.ragFilter = 'Green';
  const mgr = ctx.window.ArenaLeadMgrViews.renderMgrTrends();
  assert(!mgr.includes('No metrics for this filter') || mgr.includes('Show all'), 'Manager filter should not break page');
  ctx.window.Arena.state.ragFilter = 'all';
});

test('Definition help component is visible and mobile-safe', () => {
  const styles = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf-8');
  assert(styles.includes('.metric-help-icon') && styles.includes('@media (max-width: 767px)') && styles.includes('position:fixed'), 'metric help CSS should be visible and mobile-safe');
  const html = ctx.window.ArenaLeadMgrViews.renderMgrCommercial();
  assert(html.includes('metric-help-icon') && html.includes('Revenue MTD'), 'definition help not rendered on revenue page');
});

test('Manager navigation is executive-organized', () => {
  const src = readSource(CORE_SOURCE_FILES);
  const order = ['mgr-outcomes','mgr-trends','mgr-rca','mgr-commercial','mgr-whatif','mgr-teams','mgr-adoption'];
  const positions = order.map(x => src.indexOf(x));
  assert(positions.every(p => p > -1), 'one or more manager nav entries missing');
  for (let i=1;i<positions.length;i++) assert(positions[i] > positions[i-1], `Manager nav order broken at ${order[i]}`);
});

// ===========================================================================
//  Summary
// ===========================================================================
console.log('\n========================================');
console.log(`  ${pass} PASS   ${fail} FAIL   (${pass + fail} total)`);
console.log('========================================');

if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`);
    console.log(`     reason: ${f.reason}`);
    if (f.hint) console.log(`     fix:    ${f.hint}`);
  }
  process.exit(1);
}
process.exit(0);
