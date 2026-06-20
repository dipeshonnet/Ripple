/* eslint-disable */
// Performance Arena — Team Lead + Manager views

(function () {
  const A = window.Arena; if (!A) return;
  const Av = window.ArenaAgentViews; // for reused helpers
  const COMMERCIAL_CONFIG = {
    accountRewardPotential: Number(window.ARENA_COMMERCIAL_CONFIG?.accountRewardPotential ?? 66000),
  };

  const escapeHtml = Av.escapeHtml;
  const priorityChip = Av.priorityChip;
  const dueLabel = Av.dueLabel;
  const sparkline = Av.sparkline;

  function configuredAccountRewardPotential() {
    return Math.max(0, Number(COMMERCIAL_CONFIG.accountRewardPotential) || 66000);
  }

  function ragBadge(rag) {
    if (rag === 'Green' || rag === 'Healthy') return `<span class="chip rag-bg-green rag-green"><i data-lucide="circle-check" class="text-[10px]"></i> ${rag}</span>`;
    if (rag === 'Amber' || rag === 'Watch') return `<span class="chip rag-bg-amber rag-amber"><i data-lucide="circle-alert" class="text-[10px]"></i> ${rag}</span>`;
    if (rag === 'Red' || rag === 'Risk' || rag === 'High')   return `<span class="chip rag-bg-red rag-red"><i data-lucide="triangle-alert" class="text-[10px]"></i> ${rag}</span>`;
    return `<span class="chip bg-white/5 text-arena-muted border border-white/10">${rag || '—'}</span>`;
  }

  // Executive USD formatter — $25K · $150K · $1.2M
  function usd(amount) {
    if (amount == null) return '—';
    const a = Math.abs(amount);
    const sign = amount < 0 ? '-$' : '$';
    if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${sign}${Math.round(a / 1e3)}K`;
    return `${sign}${Math.round(a)}`;
  }
  function pct(num, den) { return den ? Math.round((num / den) * 1000) / 10 : 0; }


  function metricHelp(title, definition, formula, use, confidence) {
    return `
      <span class="metric-help-wrap" tabindex="0" aria-label="Metric definition: ${escapeHtml(title)}">
        <span class="metric-help-icon">?</span>
        <span class="metric-help-card">
          <span class="font-display font-bold text-[13px] text-arena-text block">${escapeHtml(title)}</span>
          <span class="text-[11px] text-arena-muted mt-1 block"><span class="text-arena-text font-semibold">Definition:</span> ${escapeHtml(definition)}</span>
          <span class="text-[11px] text-arena-muted mt-1 block"><span class="text-arena-text font-semibold">Formula / inputs:</span> ${escapeHtml(formula)}</span>
          <span class="text-[11px] text-arena-muted mt-1 block"><span class="text-arena-text font-semibold">How to use:</span> ${escapeHtml(use)}</span>
          <span class="text-[10px] text-arena-amber mt-2 block">Confidence: ${escapeHtml(confidence)} · Team/process indicator; not standalone individual-agent blame.</span>
        </span>
      </span>
    `;
  }

  function weekTrendForTeam(teamId) {
    const rows = A.state.dailyScore || [];
    const dates = [...new Set(rows.map(r => r.Date))].sort();
    const recent = dates.slice(-14);
    const first = recent.slice(0, 7), second = recent.slice(7);
    function avg(ds) {
      const x = rows.filter(r => ds.includes(r.Date) && (!teamId || r.TeamID === teamId));
      return x.length ? x.reduce((s, r) => s + (r.PerformanceScore || 0), 0) / x.length : 0;
    }
    const prev = avg(first), curr = avg(second);
    return { prev: Math.round(prev * 10) / 10, curr: Math.round(curr * 10) / 10, delta: Math.round((curr - prev) * 10) / 10 };
  }

  function latestRows(scope, teamId) {
    const rows = (A.state.performance || []).filter(r => scope === 'team' ? r.TeamID === teamId : true);
    const latest = [...new Set(rows.map(r => r.Date))].sort().slice(-1)[0];
    return rows.filter(r => r.Date === latest);
  }

  function kpiScore(scope, teamId, kpiId) {
    const rows = latestRows(scope, teamId).filter(r => r.KPI_ID === kpiId);
    if (!rows.length) return null;
    return rows.reduce((s, r) => s + (r.Score || 0), 0) / rows.length;
  }

  function outcomeScore(scope, teamId, drivers) {
    const vals = drivers.map(k => kpiScore(scope, teamId, k)).filter(v => v != null);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }

  function outcomeRag(score) {
    if (score >= 100) return 'Green';
    if (score >= 92) return 'Amber';
    return 'Red';
  }

  function outcomeWow(scope, teamId, drivers) {
    const rows = (A.state.performance || []).filter(r => drivers.includes(r.KPI_ID) && (scope !== 'team' || r.TeamID === teamId));
    const dates = [...new Set(rows.map(r => r.Date))].sort();
    const recent = dates.slice(-14);
    const a = recent.slice(0, 7), b = recent.slice(7);
    function avg(ds) {
      const x = rows.filter(r => ds.includes(r.Date));
      return x.length ? x.reduce((s, r) => s + (r.Score || 0), 0) / x.length : 0;
    }
    const prev = avg(a), curr = avg(b);
    return { prev: Math.round(prev), curr: Math.round(curr), delta: Math.round(curr - prev) };
  }

  function clientOutcomeMetrics(scope, penaltyBase, agentCount) {
    const base = Math.max(1, penaltyBase || 0);
    const repeatContacts = Math.max(scope === 'account' ? 620 : 28, Math.round(base / (scope === 'account' ? 92 : 52)));
    const repeatCost = Math.round(repeatContacts * 8.5 / 1000) * 1000;
    const reworkCases = Math.max(scope === 'account' ? 80 : 8, Math.round(repeatContacts * 0.16));
    const reworkCost = Math.round(reworkCases * 42 / 1000) * 1000;
    const accessRisk = repeatContacts > (scope === 'account' ? 850 : 80) ? 'Watch' : 'Green';
    const expHealth = repeatContacts > (scope === 'account' ? 750 : 70) ? 'Watch' : 'Green';
    return { repeatContacts, repeatCost, reworkCases, reworkCost, accessRisk, expHealth, agentCount: agentCount || 0 };
  }

  function trendCard(title, trend, sub) {
    const up = trend.delta >= 0;
    const steady = Math.abs(trend.delta) < 1;
    return `<div class="glass rounded-2xl p-4 outcome-mini-card"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">${escapeHtml(title)}</div><div class="hero-num text-3xl mt-1 ${steady ? 'text-arena-text' : up ? 'rag-green' : 'rag-red'}">${steady ? '0' : (up ? '+' : '') + trend.delta}</div><div class="text-[10px] text-arena-muted">${escapeHtml(sub || 'WoW movement')} · ${trend.prev} → ${trend.curr}</div></div>`;
  }

  function impactRange(scope, outcomeId) {
    const ranges = {
      effort: scope === 'account' ? '$6K–$10K leakage reduction' : '2–4 pt risk improvement',
      experience: scope === 'account' ? '3–5 pt experience driver lift' : '3–5 pt quality behavior lift',
      access: scope === 'account' ? '10–18 sec access friction reduction' : 'peak interval stability',
      capacity: scope === 'account' ? '80–120 hours capacity released' : 'AHT/calls handled balance',
      commercial: scope === 'account' ? 'protect 1–2% of revenue exposure' : 'lower team exposure'
    };
    return ranges[outcomeId] || 'measurable trend improvement';
  }

  function driverTree(outcome) {
    return `
      <div class="driver-tree mt-3">
        ${(outcome.tree || []).map(node => `
          <div class="driver-node">
            <div class="driver-node-title">${escapeHtml(node.title)}</div>
            <div class="driver-node-children">${(node.children || []).map(c => `<span>${escapeHtml(c)}</span>`).join('')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function rootCauseChips(causes) {
    return `<div class="flex flex-wrap gap-1.5 mt-2">${(causes || []).map(c => `<span class="chip bg-white/5 border border-white/10 text-arena-muted"><i data-lucide="dot" class="text-[10px]"></i> ${escapeHtml(c)}</span>`).join('')}</div>`;
  }

  // ===========================================================================
  // TEAM LEAD VIEWS
  // ===========================================================================

  function renderLeadConsole() {
    const s = A.state;
    const tl = A.userById(s.activeUserId) || A.state.users.find(u => u.Role === 'Team Lead');
    if (!tl) return '<div class="glass rounded-2xl p-6 text-arena-muted">No team lead selected.</div>';
    const team = A.teamById(tl.TeamID);
    const teamBoard = A.leaderboardForTeam(tl.TeamID);
    const teamUserIds = new Set(teamBoard.map(b => b.UserID));
    const teamScore = teamBoard.length ? teamBoard.reduce((s, a) => s + (a.PerformanceScore || 0), 0) / teamBoard.length : 0;
    const greenCount = teamBoard.filter(a => a.RAGStatus === 'Green').length;
    const amberCount = teamBoard.filter(a => a.RAGStatus === 'Amber').length;
    const redCount = teamBoard.filter(a => a.RAGStatus === 'Red').length;

    const topPerformers = teamBoard.slice(0, 5);
    const riskAgents = teamBoard.filter(a => a.RAGStatus !== 'Green').slice(0, 5);

    const teamExposure = s.exposure.filter(e => e.Entity_Level === 'Team' && e.Entity_ID === tl.TeamID);
    const totalPenalty = teamExposure.reduce((s, e) => s + (e.Forecast_Penalty || 0), 0);
    const totalReward = teamExposure.reduce((s, e) => s + (e.Forecast_Reward || 0), 0);
    const netImpact = totalReward - totalPenalty;
    const recoveryNeeded = teamExposure.reduce((s, e) => s + (e.Recovery_Required || 0), 0);

    // Highest risk KPI
    const riskExposure = teamExposure.slice().sort((a, b) => (b.Forecast_Penalty || 0) - (a.Forecast_Penalty || 0))[0];
    const upsideExposure = teamExposure.slice().sort((a, b) => (b.Forecast_Reward || 0) - (a.Forecast_Reward || 0))[0];

    // Missions / Challenges
    const teamMissions = s.missions.filter(m => m.Status === 'Active' && (m.Audience_Type === 'Account' || (m.Audience_Type === 'Team' && m.Audience_ID === tl.TeamID) || (m.Audience_Type === 'Process' && m.Audience_ID === tl.ProcessID)));
    const teamChallenges = s.challenges.filter(c => {
      // Anyone in this team is participating
      const cps = (s.challengeParticipants || []).filter(p => p.Challenge_ID === c.Challenge_ID);
      return cps.some(p => teamUserIds.has(p.UserID));
    });

    // Mission/challenge participation
    const totalAccepted = (s.missionAssignments || []).filter(ma => teamUserIds.has(ma.UserID)).length;
    const missionCompleted = (s.missionAssignments || []).filter(ma => teamUserIds.has(ma.UserID) && ma.Status === 'Completed').length;
    const missionCompletePct = pct(missionCompleted, totalAccepted);
    const challengeAccepted = (s.challengeParticipants || []).filter(p => teamUserIds.has(p.UserID) && (p.Status === 'Accepted' || p.Status === 'Completed')).length;
    const challengeWon = (s.challengeResults || []).filter(r => teamUserIds.has(r.Winner_UserID)).length;

    // Verification rollup (announcements + training + PKT) — for this team
    const teamMods = s.modules.filter(m => m.Audience_Type === 'Account' || (m.Audience_Type === 'Team' && m.Audience_ID === tl.TeamID) || (m.Audience_Type === 'Process' && m.Audience_ID === tl.ProcessID));
    const teamModIds = new Set(teamMods.map(m => m.Module_ID));
    const teamAssigns = s.assignments.filter(a => teamModIds.has(a.Module_ID) && a.TeamID === tl.TeamID);
    function rollup(type) {
      const mods = teamMods.filter(m => m.Module_Type === type);
      const modIds = new Set(mods.map(m => m.Module_ID));
      const assigns = teamAssigns.filter(a => modIds.has(a.Module_ID));
      const aIds = new Set(assigns.map(a => a.Assignment_ID));
      const completes = s.completion.filter(c => aIds.has(c.Assignment_ID));
      const viewed = completes.filter(c => c.Viewed === 'Yes').length;
      const ack = completes.filter(c => c.Acknowledged === 'Yes').length;
      const completed = completes.filter(c => c.Status === 'Completed').length;
      const overdue = assigns.filter(a => a.Overdue === 'Yes' && (s.completion.find(c => c.Assignment_ID === a.Assignment_ID)?.Status !== 'Completed')).length;
      const pts = completes.reduce((s, c) => s + (c.Points_Earned || 0), 0);
      const xp = completes.reduce((s, c) => s + (c.XP_Earned || 0), 0);
      // PKT-specific
      let pktAttempted = 0, pktPassed = 0;
      if (type === 'PKT') {
        const pktForMods = (s.pkts || []).filter(p => modIds.has(p.Module_ID));
        const pktIds = new Set(pktForMods.map(p => p.PKT_ID));
        const attemptsByUser = {};
        (s.pktAttempts || []).filter(a => pktIds.has(a.PKT_ID) && teamUserIds.has(a.UserID)).forEach(a => {
          attemptsByUser[a.UserID] = attemptsByUser[a.UserID] || [];
          attemptsByUser[a.UserID].push(a);
        });
        pktAttempted = Object.keys(attemptsByUser).length;
        pktPassed = Object.values(attemptsByUser).filter(arr => arr.some(a => a.Result === 'Pass')).length;
      }
      return { total: assigns.length, viewed, ack, completed, overdue, pts, xp, pktAttempted, pktPassed };
    }
    const annR = rollup('Broadcast');
    const trnR = rollup('Training');
    const pktR = rollup('PKT');
    const totalCompleted = annR.completed + trnR.completed + pktR.completed;
    const totalAssigned = annR.total + trnR.total + pktR.total;
    const trainingPct = pct(totalCompleted, totalAssigned);

    // Reward redemptions for team agents pending approval
    const pendingRewards = (s.redemptions || []).filter(rd => rd.Status === 'Pending Approval' && (rd.Fulfilment_Owner === tl.UserID || teamUserIds.has(rd.UserID)));
    const pointsAwardedTeam = (s.pointsLedger || []).filter(p => teamUserIds.has(p.UserID) && (p.Points_Delta || 0) > 0).reduce((s, p) => s + (p.Points_Delta || 0), 0);

    // Coaching queue + Recognition
    const myCoaching = (s.coaching || []).filter(c => teamUserIds.has(c.UserID));
    const openCoaching = myCoaching.filter(c => c.Status !== 'Resolved');
    const teamRecognitions = (s.recognition || []).filter(r => teamUserIds.has(r.UserID));
    const recognitionsToday = teamRecognitions.filter(r => r.Given_Date === A.todayStr());
    const recognizedTodayIds = new Set(recognitionsToday.map(r => r.UserID));
    // Recommended recognition: top 3 team performers not yet recognized today.
    // We don't gate on score >= 100 — top of the squad still earns a nod even on a tough day.
    const recommendedRecognition = topPerformers.filter(b => !recognizedTodayIds.has(b.UserID)).slice(0, 3);

    // Recovery copy
    const recoveryCopy = (() => {
      if (!riskExposure || riskExposure.Forecast_Penalty <= 0) return null;
      const variance = Math.abs(riskExposure.Variance_to_Target || 0).toFixed(1);
      return `Improve ${riskExposure.KPI_Name} by ${variance}% to avoid ${usd(riskExposure.Forecast_Penalty)} penalty exposure.`;
    })();
    const upsideCopy = (() => {
      if (!upsideExposure || upsideExposure.Forecast_Reward <= 0) return null;
      return `${upsideExposure.KPI_Name} overachievement can unlock ${usd(upsideExposure.Forecast_Reward)} reward opportunity if sustained.`;
    })();
    const sprintCopy = (() => {
      if (!riskExposure) return null;
      const t = team?.TeamName || tl.TeamID;
      return `${riskExposure.KPI_Name} is trending ${Math.abs(riskExposure.Variance_to_Target || 0).toFixed(1)}% below target. Create ${riskExposure.KPI_Name} Sprint Mission for ${t}.`;
    })();

    return `
      <div class="space-y-4 fade-in">

        <!-- HEADER + ACTION BAR -->
        <header class="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div class="text-[10px] uppercase tracking-[0.22em] text-arena-muted font-bold">Coach Console</div>
            <div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">${escapeHtml(team?.TeamName || tl.TeamID)} <span class="gold-text">·</span> <span class="text-arena-text/85">${escapeHtml(tl.Name.split(' ')[0])}</span></div>
            <div class="text-[12px] text-arena-muted">${A.processById(tl.ProcessID)?.ProcessName} · ${tl.Location} · ${teamBoard.length} agents</div>
          </div>
        </header>

        <section class="flex flex-wrap gap-2">
          <button data-action="new-broadcast" class="btn-primary text-[12px]"><i data-lucide="megaphone" class="text-[12px]"></i> Announcement</button>
          <button data-action="new-training" class="btn-secondary text-[12px]"><i data-lucide="book-open" class="text-[12px]"></i> Training</button>
          <button data-action="new-pkt" class="btn-secondary text-[12px]"><i data-lucide="graduation-cap" class="text-[12px]"></i> PKT</button>
          <button data-action="new-mission" class="btn-secondary text-[12px]"><i data-lucide="flag" class="text-[12px]"></i> Mission</button>
          <button data-action="new-challenge" class="btn-secondary text-[12px]"><i data-lucide="swords" class="text-[12px]"></i> Challenge</button>
          ${riskExposure ? `<button data-action="tl-create-sla-recovery" data-kpi="${riskExposure.KPI_ID}" data-team="${tl.TeamID}" class="text-[12px] flex items-center gap-1.5 px-3 py-2 rounded-xl border" style="background: linear-gradient(135deg, #ff5d80, #c72a4d); color: white; border-color: rgba(239,79,110,0.5); box-shadow: 0 0 0 1px rgba(239,79,110,0.4), 0 14px 32px -10px rgba(239,79,110,0.5);"><i data-lucide="badge-dollar-sign" class="text-[12px]"></i> SLA Recovery</button>` : ''}
          <button data-action="tl-add-coaching-note" class="btn-secondary text-[12px]"><i data-lucide="message-square-heart" class="text-[12px]"></i> Coach</button>
          <a class="btn-ghost text-[12px] cursor-pointer" data-nav="lead-recognition"><i data-lucide="medal" class="text-[12px]"></i> Recognition</a>
        </section>

        <!-- HERO STATS -->
        <section class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
          <div class="cockpit-hero relative overflow-hidden rounded-2xl p-4 lg:col-span-2">
            <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Team performance</div>
            <div class="hero-num text-4xl mt-1 ${teamScore >= 100 ? 'rag-green' : teamScore >= 92 ? 'rag-amber' : 'rag-red'}" data-counter="${teamScore.toFixed(1)}" data-counter-decimals="1">${teamScore.toFixed(1)}</div>
            <div class="flex items-center gap-2 mt-2 flex-wrap">
              <span class="chip rag-bg-green rag-green">${greenCount} Green</span>
              <span class="chip rag-bg-amber rag-amber">${amberCount} Amber</span>
              <span class="chip rag-bg-red rag-red">${redCount} Red</span>
            </div>
            <div class="text-[11px] text-arena-muted mt-2">${pointsAwardedTeam.toLocaleString()} pts awarded · ${trainingPct}% training adoption</div>
          </div>
          <div class="glass rounded-2xl p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Penalty</div><div class="hero-num text-2xl mt-1 ${totalPenalty > 0 ? 'rag-red' : 'text-arena-muted'}">${usd(totalPenalty)}</div><div class="text-[10px] text-arena-muted">${teamExposure.length} KPI rules</div></div>
          <div class="glass rounded-2xl p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Reward</div><div class="hero-num text-2xl mt-1 ${totalReward > 0 ? 'rag-green' : 'text-arena-muted'}">${usd(totalReward)}</div><div class="text-[10px] text-arena-muted">if all hit</div></div>
          <div class="glass rounded-2xl p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Net impact</div><div class="hero-num text-2xl mt-1 ${netImpact >= 0 ? 'rag-green' : 'rag-red'}">${usd(netImpact)}</div><div class="text-[10px] text-arena-muted">${netImpact >= 0 ? 'Upside' : 'Recovery needed'}</div></div>
        </section>

        <!-- CLIENT OUTCOME COACHING BOARD -->
        <section class="glass rounded-2xl p-4 border-white/10">
          <div class="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div>
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Client outcome coaching board</div>
              <div class="font-display font-bold text-[16px] mt-0.5">Use team patterns to coach behaviors, not to blame individuals.</div>
            </div>
            <span class="chip bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30"><i data-lucide="message-square-heart" class="text-[10px]"></i> Team/process view</span>
          </div>
          ${(() => { const m = clientOutcomeMetrics('team', totalPenalty, teamBoard.length); return `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Sales Production Risk ${metricHelp('Sales Production Risk', 'Team risk from conversion, eligible-call conversion and daily application velocity.', 'Overall conversion + ECC% + APD vs target.', 'Identify coaching and call-handling drivers impacting enrollment production.', 'High')}</div><div class="hero-num text-2xl mt-1 ${m.repeatContacts > 150 ? 'rag-amber' : 'rag-green'}">${m.repeatContacts}</div><div class="text-[10px] text-arena-muted">conversion/application gap · team view</div></div>
              <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Revenue Quality Risk ${metricHelp('Revenue Quality Risk', 'Signal that submitted applications may not become activated premium-paying members.', 'Effectuation rate + fallout rate + QA score.', 'Prioritize fallout reason-code review and application-quality coaching.', 'Medium-High')}</div><div class="hero-num text-2xl mt-1 ${m.expHealth === 'Watch' ? 'rag-amber' : 'rag-green'}">${m.expHealth}</div><div class="text-[10px] text-arena-muted">drivers: effectuation, fallout, QA</div></div>
              <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">CMS Compliance Risk ${metricHelp('CMS Compliance Risk', 'Risk from CMS test-call failures, CTMs, SOA misses or disclosure misses.', 'CMS score + CTM signals + SOA + required disclosure completion.', 'Use for compliance huddles, calibration and immediate corrective action.', 'High')}</div><div class="hero-num text-2xl mt-1 ${m.accessRisk === 'Watch' ? 'rag-amber' : 'rag-green'}">${m.accessRisk}</div><div class="text-[10px] text-arena-muted">protect CMS audit readiness</div></div>
            </div>`; })()}
        </section>

        <!-- COMMERCIAL COCKPIT (recovery copy + sprint suggestion) -->
        ${riskExposure || upsideExposure ? `
          <section class="commercial-cockpit relative overflow-hidden rounded-2xl p-4">
            <div class="absolute -top-10 -right-10 w-48 h-48 level-glow"></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
              ${riskExposure ? `
                <div class="rounded-xl bg-arena-red/[0.07] border border-arena-red/30 p-3">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="w-7 h-7 rounded-lg bg-arena-red/20 grid place-items-center"><i data-lucide="badge-dollar-sign" class="text-arena-red text-[14px]"></i></div>
                    <div class="text-[10px] uppercase tracking-wider text-arena-red font-bold">Highest commercial risk</div>
                  </div>
                  <div class="font-display font-bold text-[16px] leading-tight">${escapeHtml(riskExposure.KPI_Name)}</div>
                  <div class="text-[12px] text-arena-text/85 mt-1">${escapeHtml(recoveryCopy || '')}</div>
                  <div class="text-[11px] text-arena-muted mt-1">${escapeHtml(sprintCopy || '')}</div>
                  <div class="grid grid-cols-3 gap-1.5 mt-2">
                    <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5">
                      <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Target</div>
                      <div class="text-[12px] font-bold">${riskExposure.Target}</div>
                    </div>
                    <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5">
                      <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Forecast</div>
                      <div class="text-[12px] font-bold rag-red">${riskExposure.Forecast_EOM}</div>
                    </div>
                    <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5">
                      <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Penalty</div>
                      <div class="text-[12px] font-bold rag-red">${usd(riskExposure.Forecast_Penalty)}</div>
                    </div>
                  </div>
                  <div class="flex gap-2 mt-2 flex-wrap">
                    <button data-action="tl-create-sla-recovery" data-kpi="${riskExposure.KPI_ID}" data-team="${tl.TeamID}" class="btn-primary text-[11px] !py-1 !px-2"><i data-lucide="badge-dollar-sign" class="text-[11px]"></i> Create SLA Recovery</button>
                    <button data-action="new-challenge" class="btn-ghost text-[11px] !py-1 !px-2"><i data-lucide="swords" class="text-[11px]"></i> Issue challenge</button>
                  </div>
                </div>
              ` : ''}
              ${upsideExposure ? `
                <div class="rounded-xl bg-arena-emerald/[0.06] border border-arena-emerald/30 p-3">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="w-7 h-7 rounded-lg bg-arena-emerald/20 grid place-items-center"><i data-lucide="trending-up" class="text-arena-emerald text-[14px]"></i></div>
                    <div class="text-[10px] uppercase tracking-wider text-arena-emerald font-bold">Upside opportunity</div>
                  </div>
                  <div class="font-display font-bold text-[16px] leading-tight">${escapeHtml(upsideExposure.KPI_Name)}</div>
                  <div class="text-[12px] text-arena-text/85 mt-1">${escapeHtml(upsideCopy || '')}</div>
                  <div class="grid grid-cols-3 gap-1.5 mt-2">
                    <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5">
                      <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Target</div>
                      <div class="text-[12px] font-bold">${upsideExposure.Target}</div>
                    </div>
                    <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5">
                      <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Forecast</div>
                      <div class="text-[12px] font-bold rag-green">${upsideExposure.Forecast_EOM}</div>
                    </div>
                    <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5">
                      <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Reward</div>
                      <div class="text-[12px] font-bold rag-green">${usd(upsideExposure.Forecast_Reward)}</div>
                    </div>
                  </div>
                  <div class="flex gap-2 mt-2 flex-wrap">
                    <button data-action="new-mission" class="btn-ghost text-[11px] !py-1 !px-2"><i data-lucide="flag" class="text-[11px]"></i> Stretch mission</button>
                    <button data-action="new-broadcast" class="btn-ghost text-[11px] !py-1 !px-2"><i data-lucide="megaphone" class="text-[11px]"></i> Recognise team</button>
                  </div>
                </div>
              ` : ''}
            </div>
          </section>
        ` : ''}

        <!-- KPI RAG MINI GRID -->
        ${teamExposure.length ? `
          <section>
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="gauge-circle" class="text-arena-cyan"></i> Team KPI health</div>
              <a class="text-[11px] text-arena-cyan hover:underline cursor-pointer" data-nav="lead-commercial">Open verifier →</a>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
              ${teamExposure.map(e => {
                const tone = (e.Risk_Level === 'High' || e.Risk_Level === 'Critical' || (e.Net_Impact || 0) < 0) ? 'kpi-red'
                           : (e.Risk_Level === 'Medium' || e.Risk_Level === 'Watch') ? 'kpi-amber' : 'kpi-green';
                return `
                  <div class="kpi-card ${tone} rounded-xl p-3">
                    <div class="text-[10px] uppercase tracking-wider text-arena-muted font-semibold">${escapeHtml(e.KPI_Name)}</div>
                    <div class="text-[16px] font-bold font-display ${e.Variance_to_Target < 0 ? 'rag-red' : 'rag-green'}">${e.Actual_MTD}</div>
                    <div class="text-[10px] text-arena-muted">target ${e.Target} · ${e.Variance_to_Target > 0 ? '+' : ''}${(e.Variance_to_Target || 0).toFixed(2)}%</div>
                    <div class="mt-1 text-[10px] ${e.Net_Impact >= 0 ? 'rag-green' : 'rag-red'} font-semibold">${usd(e.Net_Impact)} net</div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        ` : ''}

        <!-- TOP PERFORMERS + RISK AGENTS -->
        <section class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div class="glass rounded-2xl p-3">
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="trophy" class="text-arena-gold"></i> Top performers</div>
              <a class="text-[11px] text-arena-cyan hover:underline cursor-pointer" data-nav="lead-team">Roster →</a>
            </div>
            <div class="space-y-1">
              ${topPerformers.map((b, i) => {
                const u = A.userById(b.UserID);
                const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
                const recognized = recognizedTodayIds.has(b.UserID);
                return `
                  <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg ${recognized ? 'bg-arena-emerald/[0.05]' : ''}">
                    <div class="rank-badge ${rankCls}">${i + 1}</div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[12.5px] font-semibold truncate">${escapeHtml(u?.Name)}</div>
                      <div class="text-[10px] text-arena-muted">${b.Level} · +${b.PointsEarnedToday || 0} today</div>
                    </div>
                    <div class="text-[14px] font-bold ${b.RAGStatus === 'Green' ? 'rag-green' : b.RAGStatus === 'Amber' ? 'rag-amber' : 'rag-red'}">${(b.PerformanceScore || 0).toFixed(1)}</div>
                    ${recognized
                      ? '<span class="chip bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30"><i data-lucide="check" class="text-[10px]"></i> Today</span>'
                      : `<button data-action="recognize-agent" data-user="${b.UserID}" class="btn-primary text-[10.5px] !py-1 !px-2"><i data-lucide="medal" class="text-[10px]"></i> Recognize</button>`}
                  </div>
                `;
              }).join('')}
              ${recommendedRecognition.length ? `
                <div class="mt-2 pt-2 border-t border-white/8">
                  <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold mb-1">Recommended for recognition</div>
                  <div class="text-[11px] text-arena-muted">${recommendedRecognition.length} top performer${recommendedRecognition.length === 1 ? '' : 's'} not yet recognised today.</div>
                </div>
              ` : ''}
            </div>
          </div>
          <div class="glass rounded-2xl p-3">
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="triangle-alert" class="text-arena-red"></i> Risk agents</div>
              <a class="text-[11px] text-arena-cyan hover:underline cursor-pointer" data-nav="lead-coaching">Coaching queue →</a>
            </div>
            ${riskAgents.length ? riskAgents.map(b => {
              const u = A.userById(b.UserID);
              return `
                <div class="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                  <div class="rank-badge rank-other">${b.TeamRank || '?'}</div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-semibold truncate">${escapeHtml(u?.Name)}</div>
                    <div class="text-[10px] text-arena-muted">Score ${(b.PerformanceScore || 0).toFixed(1)} · ${b.RAGStatus}</div>
                  </div>
                  <div class="flex gap-1">
                    <button data-action="tl-add-coaching-note" data-user="${b.UserID}" class="icon-btn !w-7 !h-7" title="Add coaching note"><i data-lucide="message-square-heart" class="text-[12px]"></i></button>
                    <button data-action="recognize-agent" data-user="${b.UserID}" class="icon-btn !w-7 !h-7" title="Recognize lift"><i data-lucide="medal" class="text-[12px]"></i></button>
                  </div>
                </div>
              `;
            }).join('') : `<div class="text-[12px] text-arena-muted">All agents are Green. 💪</div>`}
          </div>
        </section>

        <!-- MISSIONS + CHALLENGES -->
        <section class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div class="glass rounded-2xl p-3">
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="flag" class="text-arena-gold"></i> Active missions</div>
              <span class="text-[11px] text-arena-muted">${totalAccepted} joined · ${missionCompletePct}% complete</span>
            </div>
            ${teamMissions.length ? teamMissions.slice(0, 6).map(m => {
              const joinedCount = (s.missionAssignments || []).filter(ma => ma.Mission_ID === m.Mission_ID && teamUserIds.has(ma.UserID)).length;
              const completedCt = (s.missionAssignments || []).filter(ma => ma.Mission_ID === m.Mission_ID && teamUserIds.has(ma.UserID) && ma.Status === 'Completed').length;
              const compPct = pct(completedCt, joinedCount);
              return `
                <div class="rounded-xl bg-white/[0.02] border border-white/8 p-2.5 mb-2">
                  <div class="flex items-start gap-2">
                    <div class="w-8 h-8 rounded-lg bg-arena-gold/15 grid place-items-center flex-shrink-0"><i data-lucide="flag" class="text-arena-gold text-[14px]"></i></div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-semibold leading-tight">${escapeHtml(m.Mission_Name)}</div>
                      <div class="text-[10px] text-arena-muted">${A.kpiById(m.KPI_ID)?.KPI_Name || m.KPI_ID} · ${joinedCount} joined · ${completedCt} done</div>
                    </div>
                    <div class="text-[11px] gold-text font-bold">+${m.Reward_Points}</div>
                  </div>
                  <div class="progress gold mt-2"><span style="width:${compPct}%"></span></div>
                </div>
              `;
            }).join('') : `<div class="text-[12px] text-arena-muted">No missions yet. Click <span class="text-arena-cyan">+ Mission</span> above.</div>`}
          </div>
          <div class="glass rounded-2xl p-3">
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="swords" class="text-arena-cyan"></i> Active challenges</div>
              <span class="text-[11px] text-arena-muted">${challengeAccepted} accepted · ${challengeWon} won</span>
            </div>
            ${teamChallenges.length ? teamChallenges.slice(0, 6).map(c => {
              const cs = A.ensureChallengeStatus(c);
              const cps = (s.challengeParticipants || []).filter(p => p.Challenge_ID === c.Challenge_ID && teamUserIds.has(p.UserID));
              return `
                <div class="rounded-xl bg-white/[0.02] border border-white/8 p-2.5 mb-2 flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg cyan-bg grid place-items-center flex-shrink-0"><i data-lucide="swords" class="text-[14px]"></i></div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-semibold leading-tight">${escapeHtml(c.Challenge_Name)}</div>
                    <div class="text-[10px] text-arena-muted">${c.Challenge_Type} · ${cps.length} from team</div>
                  </div>
                  <span class="chip ${cs.status === 'Active' ? 'bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30' : cs.status === 'Settled' ? 'bg-arena-gold/15 text-arena-gold border border-arena-gold/30' : 'bg-white/5 border border-white/10 text-arena-muted'}">${cs.status}</span>
                </div>
              `;
            }).join('') : `<div class="text-[12px] text-arena-muted">No challenges yet. Click <span class="text-arena-cyan">+ Challenge</span> above.</div>`}
          </div>
        </section>

        <!-- VERIFICATION ROLLUP (consolidated) -->
        <section class="glass rounded-2xl p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="shield-check" class="text-arena-violet"></i> Verification rollup · announcements + training + PKT</div>
            <a class="text-[11px] text-arena-cyan hover:underline cursor-pointer" data-nav="training-console">Drill into modules →</a>
          </div>
          <div class="overflow-x-auto scrollbar-thin">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Type</th>
                  <th class="text-center">Assigned</th>
                  <th class="text-center">Viewed</th>
                  <th class="text-center">Acknowledged</th>
                  <th class="text-center">Completed</th>
                  <th class="text-center">PKT Pass</th>
                  <th class="text-center">Overdue</th>
                  <th class="text-center">Points</th>
                  <th class="text-center">XP</th>
                </tr>
              </thead>
              <tbody>
                ${[
                  { type: 'Announcements', icon: 'megaphone', tone: 'text-arena-cyan', r: annR },
                  { type: 'Training',      icon: 'book-open', tone: 'text-arena-violet', r: trnR },
                  { type: 'PKTs',          icon: 'graduation-cap', tone: 'text-arena-gold', r: pktR },
                ].map(row => `
                  <tr>
                    <td><div class="flex items-center gap-2"><i data-lucide="${row.icon}" class="${row.tone} text-[14px]"></i><span class="font-medium">${row.type}</span></div></td>
                    <td class="text-center font-semibold">${row.r.total}</td>
                    <td class="text-center"><div>${row.r.viewed}</div><div class="progress mt-1"><span style="width:${pct(row.r.viewed, row.r.total)}%"></span></div></td>
                    <td class="text-center"><div>${row.r.ack}</div><div class="progress emerald mt-1"><span style="width:${pct(row.r.ack, row.r.total)}%"></span></div></td>
                    <td class="text-center"><div class="font-semibold">${row.r.completed}</div><div class="progress gold mt-1"><span style="width:${pct(row.r.completed, row.r.total)}%"></span></div></td>
                    <td class="text-center text-[12px]">${row.type === 'PKTs' ? `<span class="rag-green font-semibold">${row.r.pktPassed}</span> <span class="text-arena-muted">/</span> <span class="text-arena-muted">${row.r.pktAttempted}</span>` : '<span class="text-arena-muted">—</span>'}</td>
                    <td class="text-center"><span class="${row.r.overdue > 0 ? 'rag-red' : 'text-arena-muted'} font-semibold">${row.r.overdue}</span></td>
                    <td class="text-center font-semibold gold-text">${row.r.pts.toLocaleString()}</td>
                    <td class="text-center font-semibold text-arena-violet">${row.r.xp.toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="flex justify-end mt-2">
            <button data-action="bulk-remind" data-module="ALL" class="btn-secondary text-[11px]"><i data-lucide="bell-ring" class="text-[12px]"></i> Send reminders to overdue agents</button>
          </div>
        </section>

        <!-- PENDING REWARD APPROVALS -->
        ${pendingRewards.length ? `
          <section class="glass rounded-2xl p-3 border-arena-amber/30 border">
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="hourglass" class="text-arena-amber"></i> Pending reward approvals</div>
              <span class="chip bg-arena-amber/15 text-arena-amber border border-arena-amber/30">${pendingRewards.length}</span>
            </div>
            <div class="space-y-2">
              ${pendingRewards.map(rd => {
                const r = s.rewards.find(x => x.Reward_ID === rd.Reward_ID);
                const u = A.userById(rd.UserID);
                return `
                  <div class="rounded-xl bg-white/[0.02] border border-white/10 p-3 flex items-center gap-3 flex-wrap">
                    <div class="w-9 h-9 rounded-lg gold-bg grid place-items-center font-bold text-[10px]">${(u?.Name || '?').split(' ').map(s => s[0]).slice(0,2).join('')}</div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-semibold leading-tight">${escapeHtml(u?.Name)} · ${escapeHtml(r?.Reward_Name || rd.Reward_ID)}</div>
                      <div class="text-[10.5px] text-arena-muted">Submitted ${rd.Redemption_Date} · ${escapeHtml(r?.Eligibility_Rule || '')}</div>
                    </div>
                    <div class="text-right">
                      <div class="text-[12px] gold-text font-bold">${rd.Points_Spent} pts</div>
                    </div>
                    <div class="flex gap-1.5">
                      <button data-action="tl-reject-reward"  data-redemption="${rd.Redemption_ID}" class="btn-ghost text-[11px] !py-1 !px-2"><i data-lucide="x" class="text-[12px]"></i> Reject</button>
                      <button data-action="tl-approve-reward" data-redemption="${rd.Redemption_ID}" class="btn-primary text-[11px] !py-1 !px-2"><i data-lucide="check" class="text-[12px]"></i> Approve</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        ` : ''}

        <!-- COACHING + RECOGNITION QUEUES -->
        <section class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div class="glass rounded-2xl p-3">
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="message-square-heart" class="text-arena-violet"></i> Coaching queue</div>
              <button data-action="tl-add-coaching-note" class="text-[11px] text-arena-cyan hover:underline flex items-center gap-1"><i data-lucide="plus" class="text-[12px]"></i> New note</button>
            </div>
            ${openCoaching.length ? openCoaching.slice(0, 6).map(c => {
              const u = A.userById(c.UserID);
              const k = A.kpiById(c.KPI_ID);
              return `
                <div class="rounded-xl bg-white/[0.02] border border-white/8 p-2.5 mb-2">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="flex items-center gap-2">
                      <div class="w-7 h-7 rounded-lg bg-arena-violet/15 border border-arena-violet/30 grid place-items-center font-bold text-[10px] text-arena-violet">${(u?.Name || '?').split(' ').map(s => s[0]).slice(0,2).join('')}</div>
                      <div>
                        <div class="text-[13px] font-semibold leading-tight">${escapeHtml(u?.Name)}</div>
                        <div class="text-[10px] text-arena-muted">${escapeHtml(k?.KPI_Name || c.KPI_ID || '')} · ${escapeHtml(c.Trigger_Reason || '')}</div>
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      <span class="chip ${c.Status === 'Open' ? 'bg-arena-amber/15 text-arena-amber border border-arena-amber/30' : 'bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30'}">${c.Status}</span>
                      <button data-action="tl-resolve-coaching" data-coaching="${c.Coaching_ID}" class="icon-btn !w-7 !h-7" title="Mark resolved"><i data-lucide="check" class="text-[12px]"></i></button>
                    </div>
                  </div>
                  <div class="text-[11.5px] text-arena-text/85 mt-1.5">${escapeHtml(c.Coaching_Note || '')}</div>
                  <div class="text-[10px] text-arena-muted mt-1">Due ${c.Due_Date}</div>
                </div>
              `;
            }).join('') : `<div class="text-[12px] text-arena-muted">No coaching items in queue. Add one with <span class="text-arena-cyan">+ New note</span>.</div>`}
          </div>

          <div class="glass rounded-2xl p-3">
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="medal" class="text-arena-gold"></i> Recognition queue</div>
              <a class="text-[11px] text-arena-cyan hover:underline cursor-pointer" data-nav="lead-recognition">All recognitions →</a>
            </div>

            <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold mb-1">Recommended today</div>
            <div class="space-y-1.5 mb-3">
              ${recommendedRecognition.length ? recommendedRecognition.map(b => {
                const u = A.userById(b.UserID);
                return `
                  <div class="flex items-center gap-2 rounded-xl bg-arena-gold/[0.06] border border-arena-gold/30 p-2">
                    <div class="w-8 h-8 rounded-lg gold-bg grid place-items-center font-bold text-[10px]">${(u?.Name || '?').split(' ').map(s => s[0]).slice(0,2).join('')}</div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-semibold truncate">${escapeHtml(u?.Name)}</div>
                      <div class="text-[10px] text-arena-muted">${b.Level} · score ${(b.PerformanceScore || 0).toFixed(1)} · +${b.PointsEarnedToday || 0} today</div>
                    </div>
                    <button data-action="recognize-agent" data-user="${b.UserID}" class="btn-primary text-[11px] !py-1 !px-2"><i data-lucide="medal" class="text-[11px]"></i> Recognize</button>
                  </div>
                `;
              }).join('') : `
                <div class="rounded-xl bg-arena-emerald/[0.06] border border-arena-emerald/30 p-3 flex items-center gap-2">
                  <i data-lucide="party-popper" class="text-arena-emerald text-[14px]"></i>
                  <div class="text-[12px] text-arena-text/85">All top performers already recognized today. Keep watching the floor — recognise the next breakthrough.</div>
                </div>
              `}
            </div>

            <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold mb-1">Recent recognitions · ${teamRecognitions.length}</div>
            ${teamRecognitions.length ? teamRecognitions.slice(0, 6).map(r => {
              const u = A.userById(r.UserID);
              return `
                <div class="rounded-xl bg-white/[0.02] border border-white/8 p-2 mb-1.5 flex items-center gap-2">
                  <i data-lucide="medal" class="text-arena-gold text-[14px]"></i>
                  <div class="flex-1 min-w-0">
                    <div class="text-[12.5px] font-semibold truncate">${escapeHtml(u?.Name)} <span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30 ml-1 !text-[9px] !px-1.5">${escapeHtml(r.Title || 'Recognition')}</span></div>
                    <div class="text-[10px] text-arena-muted truncate">${r.Given_Date} · +${r.Points_Awarded} pts · +${r.XP_Awarded} XP</div>
                  </div>
                </div>
              `;
            }).join('') : `<div class="text-[12px] text-arena-muted">No recognitions yet for this team.</div>`}
          </div>
        </section>
      </div>
    `;
  }

  function renderLeadTeam() {
    const s = A.state;
    const tl = A.userById(s.activeUserId) || s.users.find(u => u.Role === 'Team Lead');
    const team = A.teamById(tl?.TeamID);
    const teamBoard = A.leaderboardForTeam(tl?.TeamID || '').slice();
    const latest = latestRows('team', tl?.TeamID || '');
    const green = teamBoard.filter(b => b.RAGStatus === 'Green').length;
    const amber = teamBoard.filter(b => b.RAGStatus === 'Amber').length;
    const red = teamBoard.filter(b => b.RAGStatus === 'Red').length;
    const avgScore = teamBoard.length ? teamBoard.reduce((a,b)=>a+(b.PerformanceScore||0),0)/teamBoard.length : 0;
    const metric = (name) => {
      const k = s.kpis.find(x => x.KPI_Name === name || x.KPI_ID === name);
      if (!k) return null;
      const rows = latest.filter(r => r.KPI_ID === k.KPI_ID);
      const avg = rows.length ? rows.reduce((a,r)=>a+(r.Actual||0),0)/rows.length : null;
      const score = rows.length ? rows.reduce((a,r)=>a+(r.Score||0),0)/rows.length : null;
      return { k, avg, score };
    };
    const metrics = ['Calls Handled','AHT','Eligible Call Conversion','Quality Score','Disclosure Quality','Application Accuracy','Plan Match Escalation'].map(metric).filter(Boolean);
    return `
      <div class="space-y-4 fade-in">
        <header class="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div class="font-display font-bold text-2xl tracking-tight">Team Pulse · ${escapeHtml(team?.TeamName || 'Team')}</div>
            <div class="text-[12px] text-arena-muted">Working team snapshot: agent distribution, call-centre KPIs, and coaching entry points.</div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button data-nav="lead-outcomes" class="btn-secondary text-[12px]"><i data-lucide="activity" class="text-[12px]"></i> Client Outcomes</button>
            <button data-nav="lead-trends" class="btn-secondary text-[12px]"><i data-lucide="line-chart" class="text-[12px]"></i> SLA/KPI Trends</button>
          </div>
        </header>

        <section class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button data-nav="lead-trends" data-rag-filter="all" class="glass rounded-2xl p-4 text-left"><div class="label">Team Performance</div><div class="hero-num text-3xl mt-1 ${avgScore>=100?'rag-green':avgScore>=92?'rag-amber':'rag-red'}">${avgScore.toFixed(1)}</div><div class="text-[10px] text-arena-muted">team average index</div></button>
          <button data-nav="lead-trends" data-rag-filter="Green" class="glass rounded-2xl p-4 text-left"><div class="label">Green agents</div><div class="hero-num text-3xl mt-1 rag-green">${green}</div><div class="text-[10px] text-arena-muted">click to review green drivers</div></button>
          <button data-nav="lead-trends" data-rag-filter="Amber" class="glass rounded-2xl p-4 text-left"><div class="label">Watch agents</div><div class="hero-num text-3xl mt-1 rag-amber">${amber}</div><div class="text-[10px] text-arena-muted">click to review watch drivers</div></button>
          <button data-nav="lead-trends" data-rag-filter="Red" class="glass rounded-2xl p-4 text-left"><div class="label">Critical agents</div><div class="hero-num text-3xl mt-1 rag-red">${red}</div><div class="text-[10px] text-arena-muted">click to review critical drivers</div></button>
        </section>

        <section class="glass rounded-2xl p-4">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div><div class="label">Call-centre KPI pulse</div><div class="font-display font-bold text-[16px]">Team metrics that TLs can coach or escalate</div></div>
            <span class="chip bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30"><i data-lucide="users" class="text-[10px]"></i> Team-scoped only</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            ${metrics.map(m => `<div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="label">${escapeHtml(m.k.KPI_Name)}</div><div class="hero-num text-2xl mt-1 ${m.score>=100?'rag-green':m.score>=92?'rag-amber':'rag-red'}">${m.avg == null ? '—' : m.avg.toFixed(m.k.Unit==='sec'?1: m.k.Unit==='%'?1:0)}${m.k.Unit||''}</div><div class="text-[10px] text-arena-muted">Score ${m.score == null ? '—' : m.score.toFixed(1)}</div></div>`).join('')}
          </div>
        </section>

        <div class="glass rounded-2xl overflow-hidden">
          <div class="overflow-x-auto scrollbar-thin">
            <table class="tbl">
              <thead><tr><th>#</th><th>Agent</th><th>Level</th><th class="text-right">Level Progress</th><th class="text-right">Wallet</th><th class="text-center">Score</th><th class="text-center">Today pts</th><th class="text-center">RAG</th><th>Action</th></tr></thead>
              <tbody>
                ${teamBoard.map((b, i) => {
                  const u = A.userById(b.UserID);
                  return `
                    <tr>
                      <td><div class="rank-badge ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other'}">${i + 1}</div></td>
                      <td><div class="font-medium">${escapeHtml(u?.Name || b.UserID)}</div><div class="text-[10px] text-arena-muted">${b.UserID}</div></td>
                      <td><span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30">${escapeHtml(b.Level || u?.Level || '—')}</span></td>
                      <td class="text-right tabular-nums">${(b.XP || u?.XP || 0).toLocaleString()}</td>
                      <td class="text-right font-bold gold-text">${(b.ArenaPointsBalance || u?.ArenaPoints || 0).toLocaleString()}</td>
                      <td class="text-center font-bold ${b.RAGStatus === 'Green' ? 'rag-green' : b.RAGStatus === 'Amber' ? 'rag-amber' : 'rag-red'}">${(b.PerformanceScore || 0).toFixed(1)}</td>
                      <td class="text-center gold-text font-semibold">+${b.PointsEarnedToday || 0}</td>
                      <td class="text-center">${ragBadge(b.RAGStatus)}</td>
                      <td><div class="flex justify-end gap-1"><button data-action="recognize-agent" data-user="${b.UserID}" class="icon-btn !w-7 !h-7" title="Recognize"><i data-lucide="medal" class="text-[12px]"></i></button><button data-action="new-challenge" data-agent="${b.UserID}" class="icon-btn !w-7 !h-7" title="Create challenge"><i data-lucide="swords" class="text-[12px]"></i></button></div></td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function renderLeadCommercial() {
    const s = A.state;
    const tl = A.userById(s.activeUserId);
    const rows = s.verification.filter(v => v.Verifier_Role === 'Team Lead' && v.Owner_ID === tl.UserID);
    return renderCommercialView(rows, 'Team Lead', 'Commercial Verification — Team scope', 'Team-scoped exposure · only the dollars this team can influence');
  }

  function renderCommercialView(rows, role, title, scopeLabel) {
    const totalPenalty = rows.reduce((sum, r) => sum + (r.Forecast_Penalty || 0), 0);
    const totalReward = rows.reduce((sum, r) => sum + (r.Forecast_Reward || 0), 0);
    const net = totalReward - totalPenalty;
    const isTL = role === 'Team Lead';
    const penaltyLabel = isTL ? 'Team Penalty Exposure' : 'Account Penalty Exposure';
    const rewardLabel = isTL ? 'Team Reward Opportunity' : 'Account Reward Opportunity';
    const netLabel = isTL ? 'Team Net Impact' : 'Account Net Impact';
    const headerScope = scopeLabel || (isTL ? 'Team-scoped exposure' : 'Account-level exposure across all teams');
    return `
      <div class="space-y-4 fade-in">
        <header class="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div class="font-display font-bold text-2xl tracking-tight">${title}</div>
            <div class="text-[12px] text-arena-muted">${headerScope} · contractual SLA position vs target with forecast exposure</div>
          </div>
          <span class="chip ${isTL ? 'bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30' : 'bg-arena-violet/15 text-arena-violet border border-arena-violet/30'}">
            <i data-lucide="${isTL ? 'users' : 'building-2'}" class="text-[10px]"></i> ${isTL ? 'Team scope' : 'Account scope'}
          </span>
        </header>

        <section class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="glass rounded-2xl p-4"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">${penaltyLabel}</div><div class="hero-num text-3xl mt-1 ${totalPenalty > 0 ? 'rag-red' : 'text-arena-muted'}">${usd(totalPenalty)}</div><div class="text-[10px] text-arena-muted">${isTL ? 'Your team only' : 'All 5 teams'}</div></div>
          <div class="glass rounded-2xl p-4"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">${rewardLabel}</div><div class="hero-num text-3xl mt-1 ${totalReward > 0 ? 'rag-green' : 'text-arena-muted'}">${usd(totalReward)}</div><div class="text-[10px] text-arena-muted">Forecast opportunity</div></div>
          <div class="glass rounded-2xl p-4"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">${netLabel}</div><div class="hero-num text-3xl mt-1 ${net >= 0 ? 'rag-green' : 'rag-red'}">${usd(net)}</div><div class="text-[10px] text-arena-muted">Reward minus penalty</div></div>
        </section>

        <div class="glass rounded-2xl overflow-hidden">
          <div class="overflow-x-auto scrollbar-thin">
            <table class="tbl">
              <thead><tr><th>Scope</th><th>KPI</th><th class="text-right">Target</th><th class="text-right">Actual MTD</th><th class="text-right">Forecast EOM</th><th class="text-right">Variance</th><th>Risk</th><th class="text-right">Penalty</th><th class="text-right">Reward</th><th class="text-right">Net</th><th>Status</th><th></th></tr></thead>
              <tbody>
                ${rows.map(r => {
                  const rowKey = `${r.Entity_ID}|${r.KPI_ID}|${r.Verifier_Role}`;
                  const v = r.Variance_to_Target;
                  return `
                    <tr>
                      <td>
                        <div class="font-medium">${escapeHtml(r.Entity_Name)}</div>
                        <div class="text-[10px] text-arena-muted">${escapeHtml(r.Entity_ID)} · ${isTL ? 'Team' : 'Account'}</div>
                      </td>
                      <td class="font-medium">${escapeHtml(r.KPI_Name)}</td>
                      <td class="text-right">${r.Target}</td>
                      <td class="text-right ${(r.Actual_MTD - r.Target) < 0 ? 'rag-red' : 'rag-green'}">${r.Actual_MTD}</td>
                      <td class="text-right">${r.Forecast_EOM}</td>
                      <td class="text-right ${v < 0 ? 'rag-red' : 'rag-green'}">${v > 0 ? '+' : ''}${(v || 0).toFixed(2)}</td>
                      <td>${ragBadge(r.Risk_Level)}</td>
                      <td class="text-right ${r.Forecast_Penalty > 0 ? 'rag-red' : ''}">${usd(r.Forecast_Penalty)}</td>
                      <td class="text-right ${r.Forecast_Reward > 0 ? 'rag-green' : ''}">${usd(r.Forecast_Reward)}</td>
                      <td class="text-right font-bold ${(r.Net_Impact || 0) >= 0 ? 'rag-green' : 'rag-red'}">${usd(r.Net_Impact)}</td>
                      <td><span class="chip ${r.Verification_Status === 'Verified' ? 'bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30' : r.Verification_Status === 'Action Pending' ? 'bg-arena-amber/15 text-arena-amber border border-arena-amber/30' : 'bg-white/5 text-arena-muted border border-white/10'}">${r.Verification_Status || '—'}</span></td>
                      <td>
                        <button data-action="verify-row" data-row="${rowKey}" class="icon-btn !w-7 !h-7" title="Verify / add comment"><i data-lucide="shield-check" class="text-[12px]"></i></button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderLeadMissions() {
    const s = A.state;
    const tl = A.userById(s.activeUserId);
    const teamMissions = s.missions.filter(m => m.Audience_Type === 'Team' && m.Audience_ID === tl.TeamID || m.Audience_Type === 'Account');
    const teamChallenges = s.challenges;
    return `
      <div class="space-y-4 fade-in">
        <header class="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div class="font-display font-bold text-2xl tracking-tight">Missions & Challenges</div>
            <div class="text-[12px] text-arena-muted">Launch goals and duels — wire them to KPI risk to drive recovery</div>
          </div>
          <div class="flex gap-2">
            <button data-action="new-mission" class="btn-primary text-[12px]"><i data-lucide="flag" class="text-[12px]"></i> New mission</button>
            <button data-action="new-challenge" class="btn-secondary text-[12px]"><i data-lucide="swords" class="text-[12px]"></i> New challenge</button>
          </div>
        </header>

        <section>
          <div class="text-[12px] text-arena-muted uppercase tracking-wider font-semibold mb-2">Missions · ${teamMissions.length}</div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${teamMissions.map(m => {
              const progressArr = Object.values(s.missionProgress[m.Mission_ID] || {});
              const joined = progressArr.length;
              const completed = progressArr.filter(x => x.status === 'Completed').length;
              return `
                <div class="mission-stripe p-4">
                  <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-xl bg-arena-gold/20 grid place-items-center"><i data-lucide="flag" class="text-arena-gold"></i></div>
                    <div class="flex-1 min-w-0">
                      <div class="font-display font-bold text-[15px] leading-tight">${escapeHtml(m.Mission_Name)}</div>
                      <div class="text-[12px] text-arena-muted line-clamp-2">${escapeHtml(m.Description || '')}</div>
                      <div class="flex flex-wrap gap-1.5 mt-2">
                        <span class="chip bg-white/5 border border-white/10 text-arena-muted">${A.kpiById(m.KPI_ID)?.KPI_Name || m.KPI_ID}</span>
                        <span class="chip bg-white/5 border border-white/10 text-arena-muted">${A.describeAudience(m.Audience_Type, m.Audience_ID)}</span>
                        ${m.Commercial_Linkage ? `<span class="chip bg-arena-amber/10 text-arena-amber border border-arena-amber/30">Commercial-linked</span>` : ''}
                      </div>
                      <div class="flex items-center justify-between mt-3 text-[12px]">
                        <span class="text-arena-muted">${joined} joined · ${completed} completed</span>
                        <span class="gold-text font-bold">+${m.Reward_Points} pts</span>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>

        <section>
          <div class="text-[12px] text-arena-muted uppercase tracking-wider font-semibold mb-2">Challenges · ${teamChallenges.length}</div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            ${teamChallenges.map(c => {
              const cs = A.ensureChallengeStatus(c);
              const p1 = A.userById(c.Participant_One) || A.teamById(c.Participant_One);
              const p2 = A.userById(c.Participant_Two) || A.teamById(c.Participant_Two);
              return `
                <div class="challenge-stripe p-4">
                  <div class="flex items-center justify-between mb-2">
                    <span class="chip bg-white/5 border border-white/10 text-arena-muted">${escapeHtml(c.Challenge_Type)}</span>
                    <span class="chip ${cs.status === 'Active' ? 'bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30' : 'bg-white/5 border border-white/10 text-arena-muted'}">${cs.status}</span>
                  </div>
                  <div class="font-display font-bold text-[15px] leading-tight">${escapeHtml(c.Challenge_Name)}</div>
                  <div class="text-[12px] text-arena-muted">${escapeHtml(p1?.Name || p1?.TeamName || c.Participant_One)} vs ${escapeHtml(p2?.Name || p2?.TeamName || c.Participant_Two)}</div>
                  <div class="flex items-center justify-between text-[12px] mt-2">
                    <span class="text-arena-cyan">Entry ${c.Entry_Points} pts</span>
                    <span class="gold-text font-bold">Pool ${c.Reward_Pool} pts</span>
                  </div>
                  ${cs.status === 'Pending Validation' ? `
                    <div class="grid grid-cols-2 gap-2 mt-3">
                      <button data-action="tl-reject-challenge-result" data-challenge="${c.Challenge_ID}" class="btn-ghost text-[11px]"><i data-lucide="shield-x" class="text-[11px]"></i> Reject</button>
                      <button data-action="tl-validate-challenge" data-challenge="${c.Challenge_ID}" class="btn-primary text-[11px]"><i data-lucide="shield-check" class="text-[11px]"></i> Validate win</button>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </section>
      </div>
    `;
  }

  function renderLeadCoaching() {
    const s = A.state;
    const tl = A.userById(s.activeUserId);
    const myAgents = A.teamMembers(tl.TeamID);
    const myCoaching = s.coaching.filter(c => myAgents.find(a => a.UserID === c.UserID));
    const teamBoard = A.leaderboardForTeam(tl.TeamID);
    const candidates = teamBoard.filter(b => b.RAGStatus !== 'Green');
    return `
      <div class="space-y-4 fade-in">
        <header>
          <div class="font-display font-bold text-2xl tracking-tight">Coaching Queue</div>
          <div class="text-[12px] text-arena-muted">Triggered by KPI risk · resolve with mission, training, or 1:1 note</div>
        </header>

        <section class="glass rounded-2xl p-4"><div class="label">Modeled Medicare financial impact assumptions</div><div class="text-[11px] text-arena-muted mb-3">Assumption-based $ conversion model for over-target outcomes; calibrate with Clover LTV, CPA and rate-card inputs.</div><div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="glass rounded-2xl p-3">
            <div class="font-display font-bold text-[14px] mb-2 flex items-center gap-2"><i data-lucide="message-square-heart" class="text-arena-violet"></i> Active coaching items</div>
            ${myCoaching.length ? myCoaching.map(c => `
              <div class="rounded-xl bg-white/[0.02] border border-white/10 p-3 mb-2">
                <div class="flex items-center justify-between">
                  <div class="font-semibold text-[13px]">${escapeHtml(A.userById(c.UserID)?.Name || c.UserID)}</div>
                  <span class="chip bg-arena-amber/15 text-arena-amber border border-arena-amber/30">${c.Status}</span>
                </div>
                <div class="text-[11px] text-arena-muted">${A.kpiById(c.KPI_ID)?.KPI_Name || c.KPI_ID} · due ${c.Due_Date}</div>
                <div class="text-[12px] text-arena-text/80 mt-1">${escapeHtml(c.Coaching_Note)}</div>
                <div class="flex items-center gap-2 mt-2">
                  <button data-action="recognize-agent" data-user="${c.UserID}" class="btn-secondary text-[11px]"><i data-lucide="medal" class="text-[12px]"></i> Recognize lift</button>
                </div>
              </div>
            `).join('') : `<div class="text-[12px] text-arena-muted">No coaching items in queue.</div>`}
          </div>

          <div class="glass rounded-2xl p-3">
            <div class="font-display font-bold text-[14px] mb-2 flex items-center gap-2"><i data-lucide="triangle-alert" class="text-arena-red"></i> Coaching candidates (RAG ≠ Green)</div>
            ${candidates.length ? candidates.map(b => `
              <div class="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                <div class="rank-badge rank-other">#${b.TeamRank || '?'}</div>
                <div class="flex-1">
                  <div class="text-[13px] font-semibold">${escapeHtml(A.userById(b.UserID)?.Name)}</div>
                  <div class="text-[10px] text-arena-muted">${b.RAGStatus} · score ${b.PerformanceScore?.toFixed(1)}</div>
                </div>
                <button data-action="recognize-agent" data-user="${b.UserID}" class="icon-btn !w-7 !h-7"><i data-lucide="medal" class="text-[12px]"></i></button>
              </div>
            `).join('') : `<div class="text-[12px] text-arena-muted">No risk agents.</div>`}
          </div>
        </section>
      </div>
    `;
  }

  function renderLeadRecognition() {
    const s = A.state;
    const tl = A.userById(s.activeUserId);
    const teamBoard = A.leaderboardForTeam(tl.TeamID);
    const teamUserIds = new Set(teamBoard.map(b => b.UserID));
    // Seeded recognition for this team + this-session activity
    const seedRecs = (s.recognition || []).filter(r => teamUserIds.has(r.UserID)).slice().reverse();
    const sessionRecs = s.activity.filter(a => a.kind === 'recognition').slice(0, 12);
    return `
      <div class="space-y-4 fade-in">
        <header class="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div class="font-display font-bold text-2xl tracking-tight">Recognition</div>
            <div class="text-[12px] text-arena-muted">Award bonus points and XP for outstanding work</div>
          </div>
        </header>
        <section class="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div class="glass rounded-2xl p-3 lg:col-span-2">
            <div class="font-display font-bold text-[14px] mb-2 flex items-center gap-2"><i data-lucide="medal" class="text-arena-gold"></i> Recognize an agent (+250 pts · +100 XP)</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              ${teamBoard.map(b => {
                const u = A.userById(b.UserID);
                return `
                  <div class="flex items-center gap-2 rounded-xl bg-white/[0.02] border border-white/10 px-3 py-2">
                    <div class="w-8 h-8 rounded-lg gold-bg grid place-items-center font-bold text-[10px]">${(u?.Name || '?').split(' ').map(s=>s[0]).slice(0,2).join('')}</div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-semibold truncate">${escapeHtml(u?.Name)}</div>
                      <div class="text-[10px] text-arena-muted">${b.Level} · ${b.RAGStatus}</div>
                    </div>
                    <button data-action="recognize-agent" data-user="${b.UserID}" class="btn-primary text-[11px] !py-1 !px-2"><i data-lucide="medal" class="text-[12px]"></i> Recognize</button>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          <div class="glass rounded-2xl p-3">
            <div class="font-display font-bold text-[14px] mb-2 flex items-center gap-2"><i data-lucide="activity" class="text-arena-cyan"></i> Recent recognitions</div>
            ${seedRecs.length ? seedRecs.slice(0, 8).map(r => {
              const u = A.userById(r.UserID);
              return `
                <div class="py-2 border-b border-white/5 last:border-0">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg gold-bg grid place-items-center"><i data-lucide="medal" class="text-[12px]"></i></div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-semibold">${escapeHtml(u?.Name)} <span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30 ml-1">${escapeHtml(r.Title)}</span></div>
                      <div class="text-[10px] text-arena-muted">${r.Given_Date} · +${r.Points_Awarded} pts · +${r.XP_Awarded} XP</div>
                    </div>
                  </div>
                  <div class="text-[12px] text-arena-text/80 mt-1 ml-9">${escapeHtml(r.Reason || '')}</div>
                </div>
              `;
            }).join('') : `<div class="text-[12px] text-arena-muted">No seeded recognitions yet.</div>`}
            ${sessionRecs.length ? `
              <div class="mt-3 pt-3 border-t border-white/10">
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-semibold mb-1">This session</div>
                ${sessionRecs.map(a => `
                  <div class="py-1.5">
                    <div class="text-[12.5px]">${escapeHtml(a.text)}</div>
                    <div class="text-[10px] text-arena-muted">${a.by} · ${new Date(a.at).toLocaleString()}</div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </section>
      </div>
    `;
  }

  // ===========================================================================
  // MANAGER VIEWS
  // ===========================================================================

  function renderMgrCommand() {
    const s = A.state;
    const today = A.todayStr();
    const accountExposure = s.exposure.filter(e => e.Entity_Level === 'Account');
    const teamExposure = s.exposure.filter(e => e.Entity_Level === 'Team');
    const accountRevenue = Math.max(...accountExposure.map(e => e.Revenue_MTD || 0), 0);
    const totalPenalty = accountExposure.reduce((s, e) => s + (e.Forecast_Penalty || 0), 0);
    const totalReward = accountExposure.reduce((s, e) => s + (e.Forecast_Reward || 0), 0);
    const net = totalReward - totalPenalty;
    const recoveryRequired = accountExposure.reduce((s, e) => s + (e.Recovery_Required || 0), 0);
    const totalAgents = A.allAgents().length;
    const greenAgents = s.agentCurrent.filter(a => a.RAGStatus === 'Green').length;
    const amberAgents = s.agentCurrent.filter(a => a.RAGStatus === 'Amber').length;
    const redAgents = s.agentCurrent.filter(a => a.RAGStatus === 'Red').length;
    const accountScore = s.agentCurrent.length ? s.agentCurrent.reduce((s, a) => s + (a.PerformanceScore || 0), 0) / s.agentCurrent.length : 0;

    // Forecasted EOM — average of forecast scores from KPI exposure
    const forecastEom = (() => {
      // Approximate by mapping each account-level KPI's variance to a 0-110 score, weighted by KPI weightage
      let sum = 0, w = 0;
      for (const e of accountExposure) {
        const k = A.kpiById(e.KPI_ID); if (!k) continue;
        const sc = (e.Forecast_EOM != null && e.Target) ? (k.Direction === 'Lower' ? (e.Target / e.Forecast_EOM) * 100 : (e.Forecast_EOM / e.Target) * 100) : 100;
        sum += Math.max(50, Math.min(115, sc)) * (k.Weightage || 0.1);
        w += (k.Weightage || 0.1);
      }
      return w ? sum / w : accountScore;
    })();

    // Highest-risk callouts
    const riskExp = accountExposure.slice().sort((a, b) => (b.Forecast_Penalty || 0) - (a.Forecast_Penalty || 0))[0];
    const teamSummaries = s.teams.map(t => {
      const board = A.leaderboardForTeam(t.TeamID);
      const score = board.length ? board.reduce((s, a) => s + (a.PerformanceScore || 0), 0) / board.length : 0;
      const exp = teamExposure.filter(e => e.Entity_ID === t.TeamID);
      const tPenalty = exp.reduce((s, e) => s + (e.Forecast_Penalty || 0), 0);
      const tReward = exp.reduce((s, e) => s + (e.Forecast_Reward || 0), 0);
      const teamUserIds = new Set(board.map(b => b.UserID));
      const teamGreen = board.filter(b => b.RAGStatus === 'Green').length;
      const teamRed   = board.filter(b => b.RAGStatus === 'Red').length;
      // mission completion
      const teamMa = (s.missionAssignments || []).filter(ma => teamUserIds.has(ma.UserID));
      const teamMaCompleted = teamMa.filter(m => m.Status === 'Completed').length;
      const missionPct = pct(teamMaCompleted, teamMa.length);
      // challenge participation
      const teamCp = (s.challengeParticipants || []).filter(p => teamUserIds.has(p.UserID));
      const teamCpAccepted = teamCp.filter(p => p.Status === 'Accepted' || p.Status === 'Completed').length;
      // training adoption
      const teamMods = s.modules.filter(m => m.Audience_Type === 'Account' || (m.Audience_Type === 'Team' && m.Audience_ID === t.TeamID) || (m.Audience_Type === 'Process' && m.Audience_ID === t.ProcessID));
      const teamModIds = new Set(teamMods.map(m => m.Module_ID));
      const teamAssigns = s.assignments.filter(a => teamModIds.has(a.Module_ID) && a.TeamID === t.TeamID);
      const teamAssignedIds = new Set(teamAssigns.map(a => a.Assignment_ID));
      const teamCompletion = s.completion.filter(c => teamAssignedIds.has(c.Assignment_ID));
      const teamCompleted = teamCompletion.filter(c => c.Status === 'Completed').length;
      const trainingPct = pct(teamCompleted, teamAssigns.length);
      // engagement composite
      const ackPct = pct(teamCompletion.filter(c => c.Acknowledged === 'Yes').length, teamAssigns.length);
      const challengePct = pct(teamCpAccepted, board.length);
      const engagement = Math.round((trainingPct + ackPct + missionPct + challengePct) / 4);
      return {
        team: t, score, penalty: tPenalty, reward: tReward, net: tReward - tPenalty,
        members: board.length, green: teamGreen, red: teamRed,
        missionPct, missionsJoined: teamMa.length, challengeAccepted: teamCpAccepted,
        trainingPct, engagement,
      };
    });

    // Riskiest team — by forecast penalty
    const riskTeam = teamSummaries.slice().sort((a, b) => b.penalty - a.penalty)[0];

    // Adoption metrics (account-wide)
    const totalAssign = s.assignments.length;
    const totalCompleted = s.completion.filter(c => c.Status === 'Completed').length;
    const totalAck = s.completion.filter(c => c.Acknowledged === 'Yes').length;
    const broadcastAssigns = s.assignments.filter(a => {
      const m = A.moduleById(a.Module_ID); return m?.Module_Type === 'Broadcast';
    });
    const broadcastAcked = broadcastAssigns.filter(a => A.findCompletion(a.Assignment_ID)?.Acknowledged === 'Yes').length;
    const trainingAssigns = s.assignments.filter(a => A.moduleById(a.Module_ID)?.Module_Type === 'Training');
    const trainingDone = trainingAssigns.filter(a => A.findCompletion(a.Assignment_ID)?.Status === 'Completed').length;
    const pktAttempts = s.pktAttempts.length;
    const pktPass = s.pktAttempts.filter(a => a.Result === 'Pass').length;
    const totalCoaching = s.coaching.length;
    const coachingClosed = s.coaching.filter(c => c.Status === 'Resolved').length;
    const recognitionsCount = (s.recognition || []).length;
    const pointsIssued = (s.pointsLedger || []).filter(p => (p.Points_Delta || 0) > 0).reduce((s, p) => s + p.Points_Delta, 0);
    const pointsRedeemed = (s.pointsLedger || []).filter(p => p.Source_Type === 'Reward_Redemption' && (p.Points_Delta || 0) < 0).reduce((s, p) => s + Math.abs(p.Points_Delta), 0);
    const redemptionsCount = (s.redemptions || []).length;
    const rewardUsersCount = new Set((s.redemptions || []).map(r => r.UserID)).size;
    const rewardUtilizationPct = pct(rewardUsersCount, totalAgents);
    const activeUsers = s.agentCurrent.filter(a => (a.PointsEarnedToday || 0) > 0).length;
    const missionParticipantsCount = new Set((s.missionAssignments || []).map(m => m.UserID)).size;
    const missionParticipationPct = pct(missionParticipantsCount, totalAgents);
    const challengeParticipantsCount = new Set((s.challengeParticipants || []).filter(p => p.Status === 'Accepted' || p.Status === 'Completed').map(p => p.UserID)).size;
    const challengeParticipationPct = pct(challengeParticipantsCount, totalAgents);
    const accountAdoption = pct(totalCompleted, totalAssign);
    const accountAck = pct(totalAck, totalAssign);
    const accountPktPass = pct(pktPass, pktAttempts || 1);
    const coachingClosurePct = pct(coachingClosed, totalCoaching || 1);

    // Account engagement composite (out of 100)
    const engagementScore = Math.round((accountAdoption + accountAck + missionParticipationPct + challengeParticipationPct + accountPktPass + rewardUtilizationPct) / 6);

    // SLA Recovery missions
    const slaRecoveryMissions = s.missions.filter(m => (m.Mission_Type === 'SLA Recovery') || !!m.Commercial_Linkage);

    // Risk signals (computed)
    const signals = [];
    accountExposure.forEach(e => {
      if (e.Forecast_Penalty > 100000) {
        signals.push({ tone: 'red', icon: 'badge-dollar-sign', text: `${e.KPI_Name} forecast penalty ${usd(e.Forecast_Penalty)} — ${(e.Variance_to_Target || 0).toFixed(1)}% from target.` });
      }
    });
    teamSummaries.forEach(t => {
      const redPct = pct(t.red, t.members);
      if (redPct >= 30) signals.push({ tone: 'red', icon: 'triangle-alert', text: `${t.team.TeamName}: ${t.red} of ${t.members} agents Red (${redPct}%).` });
      if (t.engagement < 50) signals.push({ tone: 'amber', icon: 'zap-off', text: `${t.team.TeamName}: engagement ${t.engagement}% — below 50%.` });
    });
    if (accountAck < 80) signals.push({ tone: 'amber', icon: 'megaphone-off', text: `Broadcast acknowledgement ${accountAck}% — below 80% target.` });
    if (accountPktPass < 75) signals.push({ tone: 'red', icon: 'graduation-cap', text: `PKT pass rate ${accountPktPass}% — below 75% threshold.` });
    if (coachingClosurePct < 60 && totalCoaching > 0) signals.push({ tone: 'amber', icon: 'message-square-dashed', text: `Coaching closure ${coachingClosurePct}% — ${totalCoaching - coachingClosed} open items.` });
    const topSignals = signals.slice(0, 6);

    return `
      <div class="space-y-4 fade-in">

        <!-- HEADER + ACTIONS -->
        <header class="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div class="text-[10px] uppercase tracking-[0.22em] text-arena-muted font-bold">Command Center</div>
            <div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">${escapeHtml(accountExposure[0]?.Account_Name || 'Clover Medicare Account')}</div>
            <div class="text-[12px] text-arena-muted">Account-level performance · commercial position · adoption · ${today}</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button data-action="new-broadcast" class="btn-primary text-[12px]"><i data-lucide="megaphone" class="text-[12px]"></i> Broadcast</button>
            <button data-action="new-mission" class="btn-secondary text-[12px]"><i data-lucide="flag" class="text-[12px]"></i> Mission</button>
            ${riskExp ? `<button data-action="mgr-create-recovery" data-kpi="${riskExp.KPI_ID}" class="text-[12px] flex items-center gap-1.5 px-3 py-2 rounded-xl border" style="background: linear-gradient(135deg, #ff5d80, #c72a4d); color: white; border-color: rgba(239,79,110,0.5); box-shadow: 0 0 0 1px rgba(239,79,110,0.4), 0 14px 32px -10px rgba(239,79,110,0.5);"><i data-lucide="badge-dollar-sign" class="text-[12px]"></i> Create Recovery Mission</button>` : ''}
            <button data-nav="mgr-whatif" class="btn-secondary text-[12px]"><i data-lucide="split" class="text-[12px]"></i> Open What-If</button>
          </div>
        </header>

        <!-- EXECUTIVE ACCOUNT COMMAND CARDS -->
        <section class="grid grid-cols-2 md:grid-cols-6 gap-2 sm:gap-3">
          ${execCard('Total Revenue MTD', usd(accountRevenue), 'account command', 'gold', 'badge-dollar-sign')}
          ${execCard('Current SLA penalty', usd(accountExposure.reduce((s,e)=>s+(e.Forecast_Penalty||0)*0.6,0)), 'MTD pace', 'red', 'badge-dollar-sign')}
          ${execCard('Forecast SLA penalty', usd(totalPenalty), 'EOM exposure', 'red', 'triangle-alert')}
          ${execCard('Reward opportunity', usd(totalReward), 'EOM upside', 'green', 'trending-up')}
          ${execCard('Net commercial', usd(net), net >= 0 ? 'Upside' : 'Recovery needed', net >= 0 ? 'green' : 'red', 'gauge-circle')}
          ${execCard('Recovery required', usd(recoveryRequired), 'to neutral', 'amber', 'life-buoy')}
        </section>

        <!-- CLIENT OUTCOME + VALUE CONSOLE -->
        <section class="glass rounded-2xl p-4 border-white/10">
          <div class="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div>
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Client outcome & value console</div>
              <div class="font-display font-bold text-[16px] mt-0.5">Translate operational KPIs into client-facing outcome risk.</div>
              <div class="text-[11.5px] text-arena-muted mt-1">Modeled values require client calibration. Use for action planning and client conversations, not individual-agent attribution.</div>
            </div>
            <span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30"><i data-lucide="building-2" class="text-[10px]"></i> Account view</span>
          </div>
          ${(() => { const m = clientOutcomeMetrics('account', totalPenalty, totalAgents); return `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Conversion Upside $ ${metricHelp('Conversion Upside $', 'Modeled revenue/value upside when conversion exceeds target.', 'Incremental enrollments above target × assumed LTV / gross margin proxy.', 'Use as a directional client-demo value bridge; calibrate assumptions with finance.', 'Assumption-based')}</div><div class="hero-num text-2xl mt-1 rag-red">${usd(m.repeatCost)}</div><div class="text-[10px] text-arena-muted">${m.repeatContacts.toLocaleString()} modeled enrollment opportunity</div></div>
              <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Fallout Leakage ${metricHelp('Fallout Leakage', 'Modeled revenue loss from submitted applications that do not effectuate.', 'Non-effectuated applications × assumed value per activated member.', 'Use to prioritize effectuation and fallout reason-code recovery.', 'Assumption-based')}</div><div class="hero-num text-2xl mt-1 rag-amber">${usd(m.reworkCost)}</div><div class="text-[10px] text-arena-muted">${m.reworkCases.toLocaleString()} fallout recovery cases</div></div>
              <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Compliance Risk ${metricHelp('Compliance Risk', 'Program-level risk from CMS test-call misses, CTM rate, SOA and disclosure completion.', 'CMS + CTM rate + SOA + disclosure completion.', 'Use for executive compliance action and carrier audit readiness.', 'High')}</div><div class="hero-num text-2xl mt-1 ${m.accessRisk === 'Watch' ? 'rag-amber' : 'rag-green'}">${m.accessRisk}</div><div class="text-[10px] text-arena-muted">CMS/CTM signal</div></div>
              <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Financial Efficiency Health ${metricHelp('Financial Efficiency Health', 'Roll-up of CPA, cost per application and cost per eligible call.', 'CPA + gross CPA + cost per eligible call.', 'Use to connect operational performance to acquisition economics.', 'Medium until calibrated')}</div><div class="hero-num text-2xl mt-1 ${m.expHealth === 'Watch' ? 'rag-amber' : 'rag-green'}">${m.expHealth}</div><div class="text-[10px] text-arena-muted">CPA / cost efficiency driver</div></div>
            </div>`; })()}
        </section>

        <!-- ACCOUNT HERO -->
        <section class="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
          <div class="cockpit-hero relative overflow-hidden rounded-2xl p-4 sm:p-5">
            <span class="sparkle" style="top:18%;left:32%;animation-delay:.1s"></span>
            <span class="sparkle" style="bottom:24%;right:14%;animation-delay:.7s"></span>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Account performance</div>
                <div class="hero-num text-4xl sm:text-5xl mt-1 ${accountScore >= 100 ? 'rag-green' : accountScore >= 92 ? 'rag-amber' : 'rag-red'}" data-counter="${accountScore.toFixed(1)}" data-counter-decimals="1">${accountScore.toFixed(1)}</div>
                <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span class="chip rag-bg-green rag-green">${greenAgents} G</span>
                  <span class="chip rag-bg-amber rag-amber">${amberAgents} A</span>
                  <span class="chip rag-bg-red rag-red">${redAgents} R</span>
                  <span class="text-[10px] text-arena-muted ml-1">${totalAgents} agents</span>
                </div>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Forecast EOM</div>
                <div class="hero-num text-4xl sm:text-5xl mt-1 ${forecastEom >= 100 ? 'rag-green' : forecastEom >= 92 ? 'rag-amber' : 'rag-red'}">${forecastEom.toFixed(1)}</div>
                <div class="text-[10px] text-arena-muted mt-1">vs target 100</div>
              </div>
            </div>
            <div class="mt-4 grid grid-cols-3 gap-2">
              <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3 text-center">
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Engagement</div>
                <div class="hero-num text-2xl mt-0.5 ${engagementScore >= 75 ? 'rag-green' : engagementScore >= 60 ? 'rag-amber' : 'rag-red'}">${engagementScore}<span class="text-[12px] text-arena-muted">%</span></div>
              </div>
              <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3 text-center">
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Missions live</div>
                <div class="hero-num text-2xl mt-0.5">${s.missions.filter(m => m.Status === 'Active').length}</div>
              </div>
              <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3 text-center">
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Recognitions today</div>
                <div class="hero-num text-2xl mt-0.5 text-arena-gold">${(s.recognition || []).filter(r => r.Given_Date === today).length}</div>
              </div>
            </div>
          </div>

          <div class="glass rounded-2xl p-3 lg:col-span-1">
            <div class="font-display font-bold text-[14px] mb-2 flex items-center gap-2"><i data-lucide="radio-tower" class="text-arena-red"></i> Risk signals</div>
            ${topSignals.length ? topSignals.map(sig => `
              <div class="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
                <div class="w-6 h-6 rounded-md ${sig.tone === 'red' ? 'bg-arena-red/15' : 'bg-arena-amber/15'} grid place-items-center flex-shrink-0">
                  <i data-lucide="${sig.icon}" class="${sig.tone === 'red' ? 'rag-red' : 'rag-amber'} text-[12px]"></i>
                </div>
                <div class="text-[11.5px] text-arena-text/85 leading-snug">${escapeHtml(sig.text)}</div>
              </div>
            `).join('') : `<div class="text-[12px] text-arena-muted">No active risk signals — the floor is healthy.</div>`}
          </div>
        </section>

        <!-- HIGHEST RISK + RISKIEST TEAM CALLOUTS -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${riskExp ? `
            <div class="commercial-cockpit relative overflow-hidden rounded-2xl p-4">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-8 h-8 rounded-lg bg-arena-red/20 grid place-items-center"><i data-lucide="badge-dollar-sign" class="text-arena-red"></i></div>
                <div>
                  <div class="text-[10px] uppercase tracking-[0.22em] text-arena-red font-bold">Highest-risk SLA</div>
                  <div class="font-display font-bold text-[16px]">${escapeHtml(riskExp.KPI_Name)}</div>
                </div>
              </div>
              <div class="text-[12px] text-arena-text/85">Improve <strong>${escapeHtml(riskExp.KPI_Name)}</strong> by ${Math.abs(riskExp.Variance_to_Target || 0).toFixed(1)}% to avoid <strong>${usd(riskExp.Forecast_Penalty)}</strong> penalty exposure.</div>
              <div class="grid grid-cols-3 gap-1.5 mt-2">
                <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5"><div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Target</div><div class="text-[12px] font-bold">${riskExp.Target}</div></div>
                <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5"><div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Forecast</div><div class="text-[12px] font-bold rag-red">${riskExp.Forecast_EOM}</div></div>
                <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5"><div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Penalty</div><div class="text-[12px] font-bold rag-red">${usd(riskExp.Forecast_Penalty)}</div></div>
              </div>
              <div class="mt-2"><button data-action="mgr-create-recovery" data-kpi="${riskExp.KPI_ID}" class="btn-primary text-[12px]"><i data-lucide="badge-dollar-sign" class="text-[12px]"></i> Create Recovery Mission</button></div>
            </div>
          ` : ''}

          ${riskTeam ? `
            <div class="glass rounded-2xl p-4 border-arena-red/30 border">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-8 h-8 rounded-lg bg-arena-red/20 grid place-items-center"><i data-lucide="triangle-alert" class="text-arena-red"></i></div>
                <div>
                  <div class="text-[10px] uppercase tracking-[0.22em] text-arena-red font-bold">Highest-risk team</div>
                  <div class="font-display font-bold text-[16px]">${escapeHtml(riskTeam.team.TeamName)}</div>
                </div>
              </div>
              <div class="text-[12px] text-arena-text/85">${riskTeam.red} of ${riskTeam.members} agents Red · ${usd(riskTeam.penalty)} forecast penalty across the squad.</div>
              <div class="grid grid-cols-3 gap-1.5 mt-2">
                <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5"><div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Score</div><div class="text-[12px] font-bold ${riskTeam.score >= 100 ? 'rag-green' : riskTeam.score >= 92 ? 'rag-amber' : 'rag-red'}">${riskTeam.score.toFixed(1)}</div></div>
                <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5"><div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Engagement</div><div class="text-[12px] font-bold">${riskTeam.engagement}%</div></div>
                <div class="rounded-md bg-white/[0.02] border border-white/8 px-2 py-1.5"><div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Training</div><div class="text-[12px] font-bold">${riskTeam.trainingPct}%</div></div>
              </div>
            </div>
          ` : ''}
        </section>

        <!-- ACCOUNT SLA HEALTH TABLE -->
        <section class="glass rounded-2xl p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="gauge-circle" class="text-arena-amber"></i> Account SLA health</div>
            <a class="text-[11px] text-arena-cyan hover:underline cursor-pointer" data-nav="mgr-sla">Open SLA detail →</a>
          </div>
          <div class="overflow-x-auto scrollbar-thin">
            <table class="tbl">
              <thead>
                <tr>
                  <th>KPI</th>
                  <th class="text-right">Target</th>
                  <th class="text-right">Current</th>
                  <th class="text-right">Forecast EOM</th>
                  <th class="text-right">Variance</th>
                  <th>RAG</th>
                  <th class="text-right">Penalty</th>
                  <th class="text-right">Reward</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${accountExposure.map(e => {
                  const action = e.Forecast_Penalty > 0
                    ? `<button data-action="mgr-create-recovery" data-kpi="${e.KPI_ID}" class="btn-primary text-[10.5px] !py-1 !px-2"><i data-lucide="badge-dollar-sign" class="text-[10px]"></i> Recovery</button>`
                    : e.Forecast_Reward > 0
                    ? `<button data-action="new-mission" class="btn-ghost text-[10.5px] !py-1 !px-2"><i data-lucide="trending-up" class="text-[10px]"></i> Stretch</button>`
                    : `<span class="chip bg-white/5 border border-white/10 text-arena-muted">Hold</span>`;
                  return `
                    <tr>
                      <td class="font-medium">${escapeHtml(e.KPI_Name)}</td>
                      <td class="text-right">${e.Target}</td>
                      <td class="text-right ${e.Variance_to_Target < 0 ? 'rag-red' : 'rag-green'}">${e.Actual_MTD}</td>
                      <td class="text-right">${e.Forecast_EOM}</td>
                      <td class="text-right ${e.Variance_to_Target < 0 ? 'rag-red' : 'rag-green'}">${e.Variance_to_Target > 0 ? '+' : ''}${(e.Variance_to_Target || 0).toFixed(2)}%</td>
                      <td>${ragBadge(e.Risk_Level)}</td>
                      <td class="text-right ${e.Forecast_Penalty > 0 ? 'rag-red' : 'text-arena-muted'}">${usd(e.Forecast_Penalty)}</td>
                      <td class="text-right ${e.Forecast_Reward > 0 ? 'rag-green' : 'text-arena-muted'}">${usd(e.Forecast_Reward)}</td>
                      <td>${action}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <!-- INLINE WHAT-IF SIMULATOR -->
        ${(() => {
          const widgetKpis = ['KPI014','KPI012','KPI009','KPI010']; // AHT, quality, SOA, disclosures
          const activeKpiId = widgetKpis.includes(s.mgrWhatIfKpi) ? s.mgrWhatIfKpi : widgetKpis[0];
          const ruleForKpi = s.slaRules.find(r => r.KPI_ID === activeKpiId);
          const scenarios = ruleForKpi ? s.whatIf.filter(w => w.Rule_ID === ruleForKpi.Rule_ID && w.Scenario_Variance > 0).sort((a, b) => a.Scenario_Variance - b.Scenario_Variance) : [];
          // Recovery delta = max(penalty exposure now - scenario penalty, 0)
          const baselineExp = accountExposure.find(e => e.KPI_ID === activeKpiId);
          const baselinePenalty = baselineExp?.Forecast_Penalty || 0;
          return `
            <section class="glass rounded-2xl p-3">
              <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="split" class="text-arena-violet"></i> What-If · improvement scenarios</div>
                <a class="text-[11px] text-arena-cyan hover:underline cursor-pointer" data-nav="mgr-whatif">Open full simulator →</a>
              </div>
              <div class="flex flex-wrap gap-1.5 mb-3">
                ${widgetKpis.map(kid => {
                  const k = A.kpiById(kid);
                  return `<button data-action="set-mgr-whatif-kpi" data-kpi="${kid}" class="${activeKpiId === kid ? 'gold-bg shadow-gold' : 'btn-ghost'} text-[11px] !px-3 !py-1.5 !rounded-full">${escapeHtml(k?.KPI_Name || kid)}</button>`;
                }).join('')}
              </div>
              ${scenarios.length ? `
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                  ${scenarios.map(sc => {
                    const recovery = Math.max(0, baselinePenalty - sc.Penalty_Exposure);
                    return `
                      <div class="rounded-xl bg-white/[0.02] border border-arena-violet/25 p-3">
                        <div class="text-[10px] uppercase tracking-wider text-arena-muted font-semibold">Improve by</div>
                        <div class="text-xl font-bold font-display rag-green">+${sc.Scenario_Variance}%</div>
                        <div class="mt-2 space-y-1 text-[11px]">
                          <div class="flex items-center justify-between"><span class="text-arena-muted">Penalty</span><span class="${sc.Penalty_Exposure > 0 ? 'rag-red' : 'text-arena-muted'} font-bold">${usd(sc.Penalty_Exposure)}</span></div>
                          <div class="flex items-center justify-between"><span class="text-arena-muted">Reward</span><span class="${sc.Reward_Opportunity > 0 ? 'rag-green' : 'text-arena-muted'} font-bold">${usd(sc.Reward_Opportunity)}</span></div>
                          <div class="flex items-center justify-between"><span class="text-arena-muted">Net</span><span class="${sc.Net_Impact >= 0 ? 'rag-green' : 'rag-red'} font-bold">${usd(sc.Net_Impact)}</span></div>
                          <div class="flex items-center justify-between"><span class="text-arena-muted">Recovers</span><span class="rag-green font-bold">${usd(recovery)}</span></div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              ` : `<div class="text-[12px] text-arena-muted">No improvement scenarios available for this KPI.</div>`}
            </section>
          `;
        })()}

        <!-- TEAM COMPARISON (7-DIM) -->
        <section class="glass rounded-2xl p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="columns-3" class="text-arena-violet"></i> Team comparison</div>
            <a class="text-[11px] text-arena-cyan hover:underline cursor-pointer" data-nav="mgr-teams">Drill in →</a>
          </div>
          <div class="overflow-x-auto scrollbar-thin">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Team</th>
                  <th class="text-center">Score</th>
                  <th>SLA health</th>
                  <th class="text-right">Penalty risk</th>
                  <th class="text-right">Mission %</th>
                  <th class="text-right">Challenge accepts</th>
                  <th class="text-right">Training %</th>
                  <th class="text-right">Engagement</th>
                </tr>
              </thead>
              <tbody>
                ${teamSummaries.map(t => `
                  <tr>
                    <td>
                      <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-lg violet-bg grid place-items-center font-bold text-[10px]">${t.team.TeamName.split(' ').map(s => s[0]).join('')}</div>
                        <div>
                          <div class="font-medium">${escapeHtml(t.team.TeamName)}</div>
                          <div class="text-[10px] text-arena-muted">${t.team.Location} · ${t.members} agents</div>
                        </div>
                      </div>
                    </td>
                    <td class="text-center font-bold ${t.score >= 100 ? 'rag-green' : t.score >= 92 ? 'rag-amber' : 'rag-red'}">${t.score.toFixed(1)}</td>
                    <td>
                      <div class="flex items-center gap-1">
                        <span class="chip rag-bg-green rag-green !text-[9px] !px-1.5">${t.green}</span>
                        <span class="chip rag-bg-red rag-red !text-[9px] !px-1.5">${t.red}</span>
                      </div>
                    </td>
                    <td class="text-right ${t.penalty > 0 ? 'rag-red' : 'text-arena-muted'} font-semibold">${usd(t.penalty)}</td>
                    <td class="text-right">${t.missionPct}%<span class="text-[10px] text-arena-muted ml-1">(${t.missionsJoined})</span></td>
                    <td class="text-right">${t.challengeAccepted}</td>
                    <td class="text-right">${t.trainingPct}%</td>
                    <td class="text-right font-bold ${t.engagement >= 75 ? 'rag-green' : t.engagement >= 60 ? 'rag-amber' : 'rag-red'}">${t.engagement}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <!-- PROCESS COMPARISON -->
        <section class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${s.processes.map(p => {
            const procAgents = s.agentCurrent.filter(a => a.ProcessID === p.ProcessID);
            const procScore = procAgents.length ? procAgents.reduce((s, a) => s + (a.PerformanceScore || 0), 0) / procAgents.length : 0;
            const procGreen = procAgents.filter(a => a.RAGStatus === 'Green').length;
            const procRed = procAgents.filter(a => a.RAGStatus === 'Red').length;
            const procTeams = s.teams.filter(t => t.ProcessID === p.ProcessID);
            return `
              <div class="glass rounded-2xl p-3">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-8 h-8 rounded-lg cyan-bg grid place-items-center"><i data-lucide="${p.ProcessType === 'Voice' ? 'phone' : 'file-text'}" class="text-[14px]"></i></div>
                  <div>
                    <div class="font-display font-bold text-[14px]">${escapeHtml(p.ProcessName)}</div>
                    <div class="text-[10px] text-arena-muted">${p.ProcessType} · ${procTeams.length} teams · ${procAgents.length} agents</div>
                  </div>
                </div>
                <div class="hero-num text-2xl mt-1 ${procScore >= 100 ? 'rag-green' : procScore >= 92 ? 'rag-amber' : 'rag-red'}">${procScore.toFixed(1)}</div>
                <div class="flex items-center gap-1.5 mt-1">
                  <span class="chip rag-bg-green rag-green">${procGreen} G</span>
                  <span class="chip rag-bg-red rag-red">${procRed} R</span>
                </div>
              </div>
            `;
          }).join('')}
        </section>

        <!-- ADOPTION & ENGAGEMENT (11 metrics) -->
        <section class="glass rounded-2xl p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="zap" class="text-arena-cyan"></i> Adoption & engagement</div>
            <a class="text-[11px] text-arena-cyan hover:underline cursor-pointer" data-nav="mgr-adoption">Drill in →</a>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            ${adoptionTile('Active users', activeUsers, totalAgents, 'users', 'cyan')}
            ${adoptionTile('Mission participation', missionParticipationPct + '%', `${missionParticipantsCount}/${totalAgents}`, 'flag', 'gold')}
            ${adoptionTile('Challenge participation', challengeParticipationPct + '%', `${challengeParticipantsCount} accepted`, 'swords', 'cyan')}
            ${adoptionTile('Points issued', pointsIssued.toLocaleString(), 'all-time', 'coins', 'gold')}
            ${adoptionTile('Points redeemed', pointsRedeemed.toLocaleString(), `${redemptionsCount} redemptions`, 'gift', 'pink')}
            ${adoptionTile('Reward utilization', rewardUtilizationPct + '%', `${rewardUsersCount} agents`, 'shopping-bag', 'violet')}
            ${adoptionTile('Broadcast ack', accountAck + '%', `${totalAck} ack'd`, 'megaphone', 'amber')}
            ${adoptionTile('Training completion', accountAdoption + '%', `${trainingDone} done`, 'book-open', 'emerald')}
            ${adoptionTile('PKT pass rate', accountPktPass + '%', `${pktPass}/${pktAttempts}`, 'graduation-cap', 'violet')}
            ${adoptionTile('Coaching closure', coachingClosurePct + '%', `${coachingClosed}/${totalCoaching}`, 'message-square-heart', 'cyan')}
            ${adoptionTile('Recognitions issued', recognitionsCount, `${(s.recognition || []).filter(r => r.Given_Date === today).length} today`, 'medal', 'gold')}
            ${adoptionTile('Engagement score', engagementScore + '%', 'composite', 'gauge-circle', engagementScore >= 75 ? 'emerald' : engagementScore >= 60 ? 'amber' : 'red')}
          </div>
        </section>

        <!-- ACTIVE SLA RECOVERY MISSIONS -->
        ${slaRecoveryMissions.length ? `
          <section class="glass rounded-2xl p-3 border-arena-red/25 border">
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="badge-dollar-sign" class="text-arena-red"></i> Active SLA recovery missions</div>
              <span class="chip bg-arena-red/15 text-arena-red border border-arena-red/30">${slaRecoveryMissions.length}</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              ${slaRecoveryMissions.slice(0, 6).map(m => {
                const joined = (s.missionAssignments || []).filter(ma => ma.Mission_ID === m.Mission_ID).length;
                const completed = (s.missionAssignments || []).filter(ma => ma.Mission_ID === m.Mission_ID && ma.Status === 'Completed').length;
                const compPct = pct(completed, joined);
                const audience = m.Audience_Type === 'Team' ? A.teamById(m.Audience_ID)?.TeamName : (m.Audience_Type === 'Process' ? A.processById(m.Audience_ID)?.ProcessName : 'Account');
                return `
                  <div class="rounded-xl bg-white/[0.02] border border-white/8 p-3">
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex-1 min-w-0">
                        <div class="font-display font-bold text-[14px] leading-tight">${escapeHtml(m.Mission_Name)}</div>
                        <div class="text-[10px] text-arena-muted">${A.kpiById(m.KPI_ID)?.KPI_Name || m.KPI_ID} · ${audience} · ${joined} joined · ${completed} done</div>
                      </div>
                      <div class="text-[11px] gold-text font-bold">+${m.Reward_Points}</div>
                    </div>
                    <div class="text-[11px] text-arena-amber mt-1">${escapeHtml(m.Commercial_Linkage || '')}</div>
                    <div class="progress gold mt-2"><span style="width:${compPct}%"></span></div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        ` : ''}

        <!-- KPI HEATMAP -->
        <section class="glass rounded-2xl p-3">
          <div class="font-display font-bold text-[14px] mb-2 flex items-center gap-2"><i data-lucide="grid-2x2" class="text-arena-amber"></i> KPI RAG heatmap (team × KPI)</div>
          ${renderHeatmap()}
        </section>
      </div>
    `;
  }

  function execCard(label, value, sub, tone, icon) {
    const palettes = {
      red:    { bg: 'bg-arena-red/[0.07]',    border: 'border-arena-red/30',    text: 'rag-red',    iconBg: 'bg-arena-red/20'    },
      green:  { bg: 'bg-arena-emerald/[0.07]',border: 'border-arena-emerald/30',text: 'rag-green',  iconBg: 'bg-arena-emerald/20'},
      amber:  { bg: 'bg-arena-amber/[0.07]',  border: 'border-arena-amber/30',  text: 'rag-amber',  iconBg: 'bg-arena-amber/20'  },
      violet: { bg: 'bg-arena-violet/[0.07]', border: 'border-arena-violet/30', text: 'text-arena-violet', iconBg: 'bg-arena-violet/20'},
      cyan:   { bg: 'bg-arena-cyan/[0.07]',   border: 'border-arena-cyan/30',   text: 'text-arena-cyan', iconBg: 'bg-arena-cyan/20'},
    };
    const p = palettes[tone] || palettes.violet;
    return `
      <div class="exec-card relative overflow-hidden rounded-2xl p-3 ${p.bg} border ${p.border}">
        <div class="flex items-center gap-2 mb-1.5">
          <div class="w-7 h-7 rounded-lg ${p.iconBg} grid place-items-center"><i data-lucide="${icon}" class="${p.text} text-[14px]"></i></div>
          <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">${escapeHtml(label)}</div>
        </div>
        <div class="hero-num text-2xl ${p.text}">${value}</div>
        <div class="text-[10px] text-arena-muted mt-0.5">${escapeHtml(sub)}</div>
      </div>
    `;
  }

  function adoptionTile(label, value, sub, icon, tone) {
    const tones = { gold: 'text-arena-gold', emerald: 'text-arena-emerald', violet: 'text-arena-violet', red: 'text-arena-red', cyan: 'text-arena-cyan', muted: 'text-arena-muted', amber: 'text-arena-amber', pink: 'text-arena-pink' };
    const c = tones[tone] || 'text-arena-text';
    return `
      <div class="rounded-xl bg-white/[0.02] border border-white/8 p-3">
        <div class="flex items-center justify-between text-[10px] uppercase tracking-wider text-arena-muted font-bold">
          <span>${escapeHtml(label)}</span>
          <i data-lucide="${icon}" class="${c} text-[12px]"></i>
        </div>
        <div class="text-xl font-bold mt-0.5 font-display ${c}">${value}</div>
        <div class="text-[10px] text-arena-muted">${escapeHtml(sub)}</div>
      </div>
    `;
  }

  function renderHeatmap() {
    const s = A.state;
    const teams = s.teams;
    const kpis = s.kpis.slice(0, 8);
    return `
      <div class="overflow-x-auto scrollbar-thin">
        <table class="tbl">
          <thead>
            <tr>
              <th>Team</th>
              ${kpis.map(k => `<th class="text-center">${escapeHtml(k.KPI_Name)}</th>`).join('')}
              <th class="text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            ${teams.map(t => {
              const teamExp = s.exposure.filter(e => e.Entity_Level === 'Team' && e.Entity_ID === t.TeamID);
              const net = teamExp.reduce((s, e) => s + (e.Net_Impact || 0), 0);
              return `
                <tr>
                  <td class="font-medium">${escapeHtml(t.TeamName)}</td>
                  ${kpis.map(k => {
                    const e = teamExp.find(x => x.KPI_ID === k.KPI_ID);
                    if (!e) return `<td class="text-center text-arena-muted">—</td>`;
                    const tone = e.Risk_Level === 'Low' ? 'rag-bg-green' : e.Risk_Level === 'Medium' ? 'rag-bg-amber' : (e.Risk_Level === 'High' || e.Risk_Level === 'Critical') ? 'rag-bg-red' : (e.Risk_Level === 'Upside' ? 'rag-bg-green' : 'bg-white/5');
                    const text = e.Risk_Level === 'Low' ? 'rag-green' : e.Risk_Level === 'Medium' ? 'rag-amber' : (e.Risk_Level === 'High' || e.Risk_Level === 'Critical') ? 'rag-red' : (e.Risk_Level === 'Upside' ? 'rag-green' : 'text-arena-muted');
                    return `<td class="text-center"><div class="rounded-md ${tone} ${text} px-2 py-1 text-[11px] font-bold">${(e.Actual_MTD || 0).toFixed(1)}</div></td>`;
                  }).join('')}
                  <td class="text-right font-bold ${net >= 0 ? 'rag-green' : 'rag-red'}">${usd(net)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderMgrSla() {
    const s = A.state;
    const rules = s.slaRules;
    return `
      <div class="space-y-4 fade-in">
        <header>
          <div class="font-display font-bold text-2xl tracking-tight">SLA Health</div>
          <div class="text-[12px] text-arena-muted">Contractual SLA rules · target, max penalty, max reward</div>
        </header>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          ${rules.map(r => {
            const acc = s.exposure.find(e => e.KPI_ID === r.KPI_ID && e.Entity_Level === 'Account');
            return `
              <div class="glass rounded-2xl p-4">
                <div class="flex items-center justify-between mb-2">
                  <div class="font-display font-bold text-[15px]">${escapeHtml(r.KPI_Name)}</div>
                  <span class="chip bg-white/5 border border-white/10 text-arena-muted">${r.Direction === 'Higher' ? '↑' : '↓'} better</span>
                </div>
                <div class="text-[12px] text-arena-text/80">${escapeHtml(r.Description)}</div>
                <div class="grid grid-cols-3 gap-2 mt-3">
                  <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-2">
                    <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Target</div>
                    <div class="text-[14px] font-bold">${r.Target}</div>
                  </div>
                  <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-2">
                    <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Max penalty</div>
                    <div class="text-[14px] font-bold rag-red">${usd(r.Max_Penalty)}</div>
                  </div>
                  <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-2">
                    <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Max reward</div>
                    <div class="text-[14px] font-bold rag-green">${usd(r.Max_Reward)}</div>
                  </div>
                </div>
                ${acc ? `
                  <div class="mt-3 pt-3 border-t border-white/5">
                    <div class="text-[10px] uppercase tracking-wider text-arena-muted font-semibold">Account position</div>
                    <div class="flex items-center justify-between text-[12px] mt-1">
                      <div>Actual MTD <span class="font-bold ${acc.Variance_to_Target < 0 ? 'rag-red' : 'rag-green'}">${acc.Actual_MTD}</span></div>
                      <div>${ragBadge(acc.Risk_Level)}</div>
                    </div>
                    <div class="flex items-center justify-between text-[12px] mt-1">
                      <span class="text-arena-muted">Forecast EOM ${acc.Forecast_EOM}</span>
                      <span class="font-bold ${(acc.Net_Impact || 0) >= 0 ? 'rag-green' : 'rag-red'}">${usd(acc.Net_Impact)}</span>
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderMgrCommercial() {
    const s = A.state;
    const rows = s.verification.filter(v => v.Verifier_Role === 'Manager');
    return renderCommercialView(rows, 'Manager', 'Commercial Impact — Account level', 'Account-level exposure across all 5 teams');
  }

  function renderMgrWhatIf() {
    const s = A.state;
    const whatIfRules = s.slaRules.filter(r => ['KPI014','KPI012','KPI006','KPI009','KPI010','KPI013'].includes(r.KPI_ID));
    const activeKpiId = whatIfRules.some(r => r.KPI_ID === s.mgrWhatIfKpi) ? s.mgrWhatIfKpi : whatIfRules[0]?.KPI_ID;
    const rule = whatIfRules.find(r => r.KPI_ID === activeKpiId) || whatIfRules[0];
    const current = rule ? s.exposure.find(e => e.Entity_Level === 'Account' && e.KPI_ID === rule.KPI_ID) : null;
    const teamRows = rule ? s.exposure.filter(e => e.Entity_Level === 'Team' && e.KPI_ID === rule.KPI_ID) : [];
    const improve = Number(s.mgrWhatIfImprove || 1);
    const accountRewardPotential = commercialTotals('account', null).reward;

    function projectedFor(rule, exp, improvementPct) {
      if (!rule || !exp) return null;
      const lowerBetter = rule.Direction === 'Lower';
      const projectedForecast = lowerBetter
        ? (exp.Forecast_EOM * (1 - improvementPct / 100))
        : (exp.Forecast_EOM * (1 + improvementPct / 100));
      const projectedVariance = lowerBetter
        ? ((rule.Target - projectedForecast) / rule.Target) * 100
        : ((projectedForecast - rule.Target) / rule.Target) * 100;
      const currentPenalty = exp.Forecast_Penalty || 0;
      const currentReward = exp.Forecast_Reward || 0;
      const currentNet = currentReward - currentPenalty;
      // Demo-safe simulator: every 0.5% step must visibly change the output.
      // Penalty reduction models SLA recovery; reward upside models over-target performance.
      const penaltyReductionPct = Math.min(0.90, improvementPct * 0.24); // 0.5→12%, 1→24%, 1.5→36%, 2→48%
      const rewardPool = accountRewardPotential || configuredAccountRewardPotential();
      const rewardUpside = Math.round((rewardPool * Math.min(1, improvementPct / 2)) / 100) * 100;
      const projectedPenalty = Math.max(0, Math.round((currentPenalty * (1 - penaltyReductionPct)) / 100) * 100);
      const projectedReward = Math.min(rewardPool, Math.round((currentReward + rewardUpside) / 100) * 100);
      const projectedNet = projectedReward - projectedPenalty;
      const recoveryRequired = Math.max(0, (exp.Recovery_Required || currentPenalty || 0) - (currentPenalty - projectedPenalty));
      return { projectedForecast, projectedVariance, projectedPenalty, projectedReward, currentNet, projectedNet, netChange: projectedNet - currentNet, recoveryRequired };
    }

    const projection = projectedFor(rule, current, improve);
    const riskTeam = teamRows.slice().sort((a, b) => (b.Forecast_Penalty || 0) - (a.Forecast_Penalty || 0) || (a.Net_Impact || 0) - (b.Net_Impact || 0))[0];
    const accountPenalty = current?.Forecast_Penalty || 0;
    const teamShare = riskTeam && accountPenalty ? Math.round(((riskTeam.Forecast_Penalty || 0) / accountPenalty) * 100) : 0;
    const lowerBetter = rule?.Direction === 'Lower';
    const actionVerb = lowerBetter ? 'reduce' : 'improve';
    const deltaLabel = lowerBetter ? `-${improve}% forecast` : `+${improve}% forecast`;

    return `
      <div class="space-y-4 fade-in">
        <header class="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div class="font-display font-bold text-2xl tracking-tight">Account What-If Simulator</div>
            <div class="text-[12px] text-arena-muted">Model how operational SLA recovery changes penalty/reward exposure before month-end. Business outcome metrics are not used in this simulator.</div>
          </div>
          <span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30"><i data-lucide="building-2" class="text-[10px]"></i> Account-level exposure across all 5 teams</span>
        </header>

        <div class="flex flex-wrap gap-2">
          ${whatIfRules.map(r => `
            <button data-action="set-mgr-whatif-kpi" data-kpi="${r.KPI_ID}" class="${rule?.KPI_ID === r.KPI_ID ? 'btn-primary' : 'btn-secondary'} text-[12px]">${escapeHtml(r.KPI_Name)}</button>
          `).join('')}
        </div>

        ${rule && current && projection ? `
          <section class="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div class="glass rounded-2xl p-4 lg:col-span-2">
              <div class="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Current exposure</div>
                  <div class="font-display font-bold text-xl">${escapeHtml(rule.KPI_Name)}</div>
                  <div class="text-[12px] text-arena-muted">Target ${rule.Target} · ${rule.Direction === 'Lower' ? 'lower is better' : 'higher is better'}</div>
                </div>
                ${ragBadge(current.Risk_Level)}
              </div>
              <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
                <div class="rounded-xl bg-white/[0.02] border border-white/5 p-3"><div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Target</div><div class="text-lg font-bold">${current.Target}</div></div>
                <div class="rounded-xl bg-white/[0.02] border border-white/5 p-3"><div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Current MTD</div><div class="text-lg font-bold">${current.Actual_MTD}</div></div>
                <div class="rounded-xl bg-white/[0.02] border border-white/5 p-3"><div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Forecast EOM</div><div class="text-lg font-bold">${current.Forecast_EOM}</div></div>
                <div class="rounded-xl bg-white/[0.02] border border-white/5 p-3"><div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Current SLA penalty</div><div class="text-lg font-bold ${current.Forecast_Penalty > 0 ? 'rag-red' : 'text-arena-muted'}">${usd(current.Forecast_Penalty)}</div></div>
                <div class="rounded-xl bg-white/[0.02] border border-white/5 p-3"><div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Net impact</div><div class="text-lg font-bold ${(current.Net_Impact || 0) >= 0 ? 'rag-green' : 'rag-red'}">${usd(current.Net_Impact)}</div></div>
              </div>
            </div>

            <div class="glass rounded-2xl p-4">
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Top contributing team</div>
              <div class="font-display font-bold text-lg mt-1">${escapeHtml(riskTeam?.Entity_Name || 'No team risk')}</div>
              <div class="text-[12px] text-arena-muted mt-1">${riskTeam?.Forecast_Penalty ? `${teamShare}% of remaining ${rule.KPI_Name} penalty exposure` : 'No penalty concentration for this KPI'}</div>
              <div class="mt-3 grid grid-cols-2 gap-2">
                <div class="rounded-lg bg-white/[0.02] border border-white/5 p-2"><div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Team penalty</div><div class="font-bold rag-red">${usd(riskTeam?.Forecast_Penalty || 0)}</div></div>
                <div class="rounded-lg bg-white/[0.02] border border-white/5 p-2"><div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Team net</div><div class="font-bold ${(riskTeam?.Net_Impact || 0) >= 0 ? 'rag-green' : 'rag-red'}">${usd(riskTeam?.Net_Impact || 0)}</div></div>
              </div>
            </div>
          </section>

          <section class="glass rounded-2xl p-4">
            <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <div class="font-display font-bold text-[16px] flex items-center gap-2"><i data-lucide="sliders-horizontal" class="text-arena-violet"></i> Improvement assumption</div>
                <div class="text-[12px] text-arena-muted">Choose how much recovery the account can deliver before month-end.</div>
              </div>
              <div class="flex flex-wrap gap-2">
                ${[0.5, 1.0, 1.5, 2.0].map(x => `<button data-action="set-mgr-whatif-improve" data-improve="${x}" class="${improve === x ? 'gold-bg shadow-gold' : 'btn-ghost'} text-[12px] !px-3 !py-1.5 !rounded-full">${lowerBetter ? 'Reduce' : 'Improve'} ${x}%</button>`).join('')}
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div class="rounded-xl bg-white/[0.02] border border-white/5 p-3"><div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Assumption</div><div class="text-xl font-bold font-display text-arena-cyan">${deltaLabel}</div><div class="text-[10px] text-arena-muted">${actionVerb} ${rule.KPI_Name}</div></div>
              <div class="rounded-xl bg-white/[0.02] border border-white/5 p-3"><div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Projected forecast</div><div class="text-xl font-bold font-display">${projection.projectedForecast.toFixed(2)}</div><div class="text-[10px] ${projection.projectedVariance >= 0 ? 'rag-green' : 'rag-red'}">${projection.projectedVariance > 0 ? '+' : ''}${projection.projectedVariance.toFixed(2)}% vs target</div></div>
              <div class="rounded-xl bg-white/[0.02] border border-white/5 p-3"><div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Revised penalty</div><div class="text-xl font-bold font-display ${projection.projectedPenalty > 0 ? 'rag-red' : 'text-arena-muted'}">${usd(projection.projectedPenalty)}</div><div class="text-[10px] text-arena-muted">from ${usd(current.Forecast_Penalty)}</div></div>
              <div class="rounded-xl bg-white/[0.02] border border-white/5 p-3"><div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Projected reward</div><div class="text-xl font-bold font-display rag-green">${usd(projection.projectedReward)}</div><div class="text-[10px] text-arena-muted">of ${usd(accountRewardPotential)} reward potential</div></div>
              <div class="rounded-xl bg-white/[0.02] border border-white/5 p-3"><div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Net movement</div><div class="text-xl font-bold font-display ${projection.netChange >= 0 ? 'rag-green' : 'rag-red'}">${projection.netChange >= 0 ? '+' : ''}${usd(projection.netChange)}</div><div class="text-[10px] text-arena-muted">SLA dollars saved / reward unlocked</div></div>
              <div class="rounded-xl bg-white/[0.02] border border-white/5 p-3 md:col-span-5"><div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Recovery still required</div><div class="text-xl font-bold font-display text-arena-cyan">${usd(projection.recoveryRequired)}</div><div class="text-[10px] text-arena-muted">updates with each improvement assumption</div></div>
            </div>
          </section>

          <section class="commercial-cockpit relative overflow-hidden rounded-2xl p-4">
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div class="flex-1 min-w-[240px]">
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Executive insight</div>
                <div class="text-[14px] text-arena-text/90 mt-1">
                  ${lowerBetter ? 'Reducing' : 'Improving'} <strong>${escapeHtml(rule.KPI_Name)}</strong> by <strong>${improve}%</strong> changes account net impact by <strong class="${projection.netChange >= 0 ? 'rag-green' : 'rag-red'}">${projection.netChange >= 0 ? '+' : ''}${usd(projection.netChange)}</strong>.
                  ${riskTeam ? `<strong>${escapeHtml(riskTeam.Entity_Name)}</strong> is the recommended recovery focus.` : ''}
                </div>
                <div class="text-[12px] text-arena-muted mt-1">This is a live recovery model; commercial slabs are kept as calculation rules, not the main experience.</div>
              </div>
              <button data-action="mgr-create-recovery" data-kpi="${rule.KPI_ID}" data-team="${riskTeam?.Entity_ID || 'HCA001'}" class="btn-primary text-[13px]"><i data-lucide="flag" class="text-[14px]"></i> Create Recovery Mission</button>
            </div>
          </section>
        ` : `<div class="glass rounded-2xl p-6 text-arena-muted">No what-if data available.</div>`}
      </div>
    `;
  }

  function renderWhatIfChart(scenarios) {
    if (!scenarios.length) return '';
    const w = 600, h = 180, padX = 30, padY = 24;
    const min = Math.min(...scenarios.map(s => s.Net_Impact));
    const max = Math.max(...scenarios.map(s => s.Net_Impact));
    const range = max - min || 1;
    const barW = (w - 2 * padX) / scenarios.length;
    return `
      <div class="mt-4">
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="w-full" style="height: 200px;">
          <line x1="${padX}" y1="${h/2}" x2="${w - padX}" y2="${h/2}" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="4 4"/>
          ${scenarios.map((sc, i) => {
            const x = padX + i * barW + barW * 0.15;
            const bw = barW * 0.7;
            const zero = h / 2;
            const y = sc.Net_Impact >= 0 ? zero - ((sc.Net_Impact / max) * (zero - padY)) : zero;
            const bh = sc.Net_Impact >= 0 ? (zero - padY) * (sc.Net_Impact / max) : (h - zero - padY) * (Math.abs(sc.Net_Impact) / Math.abs(min || 1));
            const fill = sc.Net_Impact >= 0 ? 'url(#netUp)' : 'url(#netDown)';
            return `<rect x="${x}" y="${sc.Net_Impact >= 0 ? y : zero}" width="${bw}" height="${Math.abs(bh)}" fill="${fill}" rx="4"/>
              <text x="${x + bw/2}" y="${h - 6}" fill="rgba(255,255,255,0.5)" text-anchor="middle" font-size="9">${sc.Scenario_Variance > 0 ? '+' : ''}${sc.Scenario_Variance}%</text>`;
          }).join('')}
          <defs>
            <linearGradient id="netUp" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#22c98a"/>
              <stop offset="100%" stop-color="#0fa770"/>
            </linearGradient>
            <linearGradient id="netDown" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#ef4f6e"/>
              <stop offset="100%" stop-color="#c72a4d"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
    `;
  }

  function renderMgrAdoption() {
    const s = A.state;
    const totalAssign = s.assignments.length;
    const completed = s.completion.filter(c => c.Status === 'Completed').length;
    const acked = s.completion.filter(c => c.Acknowledged === 'Yes').length;
    const overdue = s.assignments.filter(a => a.Overdue === 'Yes').length;
    const pktAttempts = s.pktAttempts.length;
    const pktPass = s.pktAttempts.filter(a => a.Result === 'Pass').length;
    const totalRedemptions = s.redemptions.length;
    const totalPoints = s.completion.reduce((sum, c) => sum + (c.Points_Earned || 0), 0);

    // by team rollup
    const byTeam = s.teams.map(t => {
      const teamAssigns = s.assignments.filter(a => a.TeamID === t.TeamID);
      const teamCompleted = teamAssigns.filter(a => A.findCompletion(a.Assignment_ID)?.Status === 'Completed').length;
      const teamOverdue = teamAssigns.filter(a => a.Overdue === 'Yes' && A.findCompletion(a.Assignment_ID)?.Status !== 'Completed').length;
      return { team: t, total: teamAssigns.length, completed: teamCompleted, overdue: teamOverdue, pct: pct(teamCompleted, teamAssigns.length) };
    });

    return `
      <div class="space-y-4 fade-in">
        <header>
          <div class="font-display font-bold text-2xl tracking-tight">Adoption</div>
          <div class="text-[12px] text-arena-muted">Engagement, training completion, PKT pass rate, reward usage</div>
        </header>

        <section class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${[
            { label: 'Training completion', value: pct(completed, totalAssign) + '%', sub: `${completed}/${totalAssign}`, tone: 'emerald' },
            { label: 'Acknowledgement', value: pct(acked, totalAssign) + '%', sub: `${acked} ack'd`, tone: 'gold' },
            { label: 'PKT pass rate', value: pct(pktPass, pktAttempts) + '%', sub: `${pktAttempts} attempts`, tone: 'violet' },
            { label: 'Overdue items', value: overdue, sub: 'pending', tone: overdue > 0 ? 'red' : 'muted' },
            { label: 'Redemptions', value: totalRedemptions, sub: 'rewards claimed', tone: 'cyan' },
            { label: 'Points distributed', value: totalPoints.toLocaleString(), sub: 'this period', tone: 'gold' },
            { label: 'Active missions', value: s.missions.length, sub: 'live', tone: 'gold' },
            { label: 'Live challenges', value: s.challenges.length, sub: 'open arenas', tone: 'cyan' },
          ].map(c => {
            const tones = { gold: 'text-arena-gold', emerald: 'text-arena-emerald', violet: 'text-arena-violet', red: 'text-arena-red', cyan: 'text-arena-cyan', muted: 'text-arena-muted' };
            return `
              <div class="glass rounded-2xl p-3">
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">${c.label}</div>
                <div class="hero-num text-2xl mt-1 ${tones[c.tone]}">${c.value}</div>
                <div class="text-[10px] text-arena-muted">${c.sub}</div>
              </div>
            `;
          }).join('')}
        </section>

        ${(() => {
          const allRedemptions = s.redemptions || [];
          if (!allRedemptions.length) return '';
          const totalRed = allRedemptions.length;
          const fulfilled = allRedemptions.filter(r => r.Status === 'Fulfilled').length;
          const pending = allRedemptions.filter(r => r.Status === 'Pending Approval').length;
          const rejected = allRedemptions.filter(r => r.Status === 'Rejected').length;
          const totalSpent = allRedemptions.reduce((acc, r) => acc + (r.Points_Spent || 0), 0);
          // Top reward by redemption count
          const byReward = {};
          allRedemptions.forEach(r => { byReward[r.Reward_ID] = (byReward[r.Reward_ID] || 0) + 1; });
          const topPair = Object.entries(byReward).sort((a, b) => b[1] - a[1])[0];
          const topReward = topPair ? s.rewards.find(x => x.Reward_ID === topPair[0]) : null;
          // By category
          const byCategory = {};
          allRedemptions.forEach(rd => {
            const r = s.rewards.find(x => x.Reward_ID === rd.Reward_ID);
            if (!r) return;
            byCategory[r.Category] = (byCategory[r.Category] || 0) + (rd.Points_Spent || 0);
          });
          const catRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
          return `
            <section class="glass rounded-2xl p-3">
              <div class="flex items-center justify-between mb-2">
                <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="gift" class="text-arena-gold"></i> Reward utilization</div>
                <span class="text-[11px] text-arena-muted">${totalRed} redemptions · ${totalSpent.toLocaleString()} pts spent</span>
              </div>
              <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                <div class="rounded-xl bg-white/[0.02] border border-white/8 p-3">
                  <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Fulfilled</div>
                  <div class="text-xl font-bold font-display text-arena-emerald">${fulfilled}</div>
                </div>
                <div class="rounded-xl bg-white/[0.02] border border-white/8 p-3">
                  <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Pending</div>
                  <div class="text-xl font-bold font-display text-arena-amber">${pending}</div>
                </div>
                <div class="rounded-xl bg-white/[0.02] border border-white/8 p-3">
                  <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Rejected</div>
                  <div class="text-xl font-bold font-display ${rejected > 0 ? 'text-arena-red' : 'text-arena-muted'}">${rejected}</div>
                </div>
                <div class="rounded-xl bg-white/[0.02] border border-white/8 p-3">
                  <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Top reward</div>
                  <div class="text-[13px] font-bold leading-tight mt-1">${topReward ? escapeHtml(topReward.Reward_Name) : '—'}</div>
                  <div class="text-[10px] text-arena-muted">${topPair ? `${topPair[1]} redemptions` : ''}</div>
                </div>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold mb-1">Spend by category</div>
                <div class="space-y-1.5">
                  ${catRows.map(([catName, pts]) => {
                    const catPct = totalSpent ? Math.round((pts / totalSpent) * 100) : 0;
                    return `
                      <div>
                        <div class="flex items-center justify-between text-[11px] mb-0.5"><span>${escapeHtml(catName)}</span><span class="font-bold">${pts.toLocaleString()} pts <span class="text-arena-muted">(${catPct}%)</span></span></div>
                        <div class="progress gold"><span style="width:${catPct}%"></span></div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </section>
          `;
        })()}

        <section class="glass rounded-2xl p-3">
          <div class="font-display font-bold text-[14px] mb-2">Adoption by team</div>
          <div class="overflow-x-auto scrollbar-thin">
            <table class="tbl">
              <thead><tr><th>Team</th><th>Process</th><th class="text-right">Assignments</th><th class="text-right">Completed</th><th class="text-right">Overdue</th><th>Adoption</th></tr></thead>
              <tbody>
                ${byTeam.map(t => `
                  <tr>
                    <td class="font-medium">${escapeHtml(t.team.TeamName)}</td>
                    <td class="text-arena-muted">${A.processById(t.team.ProcessID)?.ProcessName || ''}</td>
                    <td class="text-right">${t.total}</td>
                    <td class="text-right font-bold rag-green">${t.completed}</td>
                    <td class="text-right ${t.overdue > 0 ? 'rag-red' : 'text-arena-muted'}">${t.overdue}</td>
                    <td>
                      <div class="flex items-center gap-2">
                        <div class="progress flex-1 ${t.pct >= 80 ? 'emerald' : t.pct >= 60 ? 'gold' : 'red'}"><span style="width:${t.pct}%"></span></div>
                        <span class="text-[12px] font-bold w-12 text-right">${t.pct}%</span>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  }

  function renderMgrTeams() {
    const s = A.state;
    const summaries = s.teams.map(t => {
      const board = A.leaderboardForTeam(t.TeamID);
      const score = board.length ? board.reduce((s, a) => s + (a.PerformanceScore || 0), 0) / board.length : 0;
      const exp = s.exposure.filter(e => e.Entity_Level === 'Team' && e.Entity_ID === t.TeamID);
      const penalty = exp.reduce((s, e) => s + (e.Forecast_Penalty || 0), 0);
      const reward = exp.reduce((s, e) => s + (e.Forecast_Reward || 0), 0);
      return { team: t, score, penalty, reward, net: reward - penalty, members: board.length, board };
    });
    return `
      <div class="space-y-4 fade-in">
        <header>
          <div class="font-display font-bold text-2xl tracking-tight">Team Comparison</div>
          <div class="text-[12px] text-arena-muted">Side-by-side health and commercial position</div>
        </header>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          ${summaries.map(t => `
            <div class="glass rounded-2xl p-4">
              <div class="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div class="font-display font-bold text-[16px]">${escapeHtml(t.team.TeamName)}</div>
                  <div class="text-[11px] text-arena-muted">${t.team.Location} · ${A.processById(t.team.ProcessID)?.ProcessName} · ${t.members} agents</div>
                </div>
                <div class="hero-num text-2xl ${t.score >= 100 ? 'rag-green' : t.score >= 90 ? 'rag-amber' : 'rag-red'}">${t.score.toFixed(1)}</div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-2">
                  <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Penalty</div>
                  <div class="text-[12px] font-bold rag-red">${usd(t.penalty)}</div>
                </div>
                <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-2">
                  <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Reward</div>
                  <div class="text-[12px] font-bold rag-green">${usd(t.reward)}</div>
                </div>
                <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-2">
                  <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Net</div>
                  <div class="text-[12px] font-bold ${t.net >= 0 ? 'rag-green' : 'rag-red'}">${usd(t.net)}</div>
                </div>
              </div>
              <div class="mt-3 text-[11px] text-arena-muted">Top performer: <span class="text-arena-text font-semibold">${escapeHtml(A.userById(t.board[0]?.UserID)?.Name || '—')}</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // TRAINING CONSOLE (shared, used by both TL & Manager)
  // ===========================================================================

  function renderTrainingConsole() {
    const s = A.state;
    const me = A.userById(s.activeUserId);
    const filtered = visibleModulesFor(me).filter(m => {
      if (s.filters.moduleType !== 'all' && m.Module_Type !== s.filters.moduleType) return false;
      if (s.filters.search) {
        const q = s.filters.search.toLowerCase();
        if (!m.Title.toLowerCase().includes(q) && !(m.Description || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });

    return `
      <div class="space-y-4 fade-in">
        <header class="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div class="font-display font-bold text-2xl tracking-tight">Training Console</div>
            <div class="text-[12px] text-arena-muted">Broadcasts · training · PKTs assigned across teams · single verification view</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button data-action="new-broadcast" class="btn-primary text-[12px]"><i data-lucide="megaphone" class="text-[12px]"></i> Broadcast</button>
            <button data-action="new-training" class="btn-secondary text-[12px]"><i data-lucide="book-open" class="text-[12px]"></i> Training</button>
            <button data-action="new-pkt" class="btn-secondary text-[12px]"><i data-lucide="graduation-cap" class="text-[12px]"></i> PKT</button>
          </div>
        </header>

        <div class="glass rounded-2xl overflow-hidden">
          <div class="flex items-center gap-2 p-3 border-b border-white/5 flex-wrap">
            <div class="relative flex-1 min-w-[220px]">
              <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 text-arena-muted text-[14px] pointer-events-none"></i>
              <input id="vc-search" placeholder="Search modules…" value="${escapeHtml(s.filters.search || '')}" class="!pl-9" />
            </div>
            <select id="vc-type" class="!w-[170px]">
              <option value="all" ${s.filters.moduleType === 'all' ? 'selected' : ''}>All types</option>
              <option value="Broadcast" ${s.filters.moduleType === 'Broadcast' ? 'selected' : ''}>Broadcasts</option>
              <option value="Training" ${s.filters.moduleType === 'Training' ? 'selected' : ''}>Training</option>
              <option value="PKT" ${s.filters.moduleType === 'PKT' ? 'selected' : ''}>PKTs</option>
            </select>
            <span class="text-[12px] text-arena-muted">${filtered.length} module${filtered.length === 1 ? '' : 's'}</span>
          </div>

          <div class="overflow-x-auto scrollbar-thin max-h-[55vh] overflow-y-auto">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Audience</th>
                  <th>Due</th>
                  <th class="text-center">Assigned</th>
                  <th class="text-center">Viewed</th>
                  <th class="text-center">Acknowledged</th>
                  <th class="text-center">Completed</th>
                  <th class="text-center">PKT Pass / Fail</th>
                  <th class="text-center">Overdue</th>
                  <th class="text-center">Points</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length ? filtered.map(m => renderConsoleRow(m)).join('') : `<tr><td colspan="11" class="text-center text-arena-muted py-10">No modules match.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        ${s.drillModule ? renderModuleDrill(s.drillModule) : ''}
      </div>
    `;
  }

  function visibleModulesFor(me) {
    const s = A.state;
    if (!me || me.Role === 'Manager') return s.modules;
    return s.modules.filter(m => {
      if (m.Published_By === me.UserID) return true;
      if (m.Audience_Type === 'Account') return true;
      if (m.Audience_Type === 'Team' && m.Audience_ID === me.TeamID) return true;
      if (m.Audience_Type === 'Process' && m.Audience_ID === me.ProcessID) return true;
      return false;
    });
  }

  function rolloutForModule(moduleId) {
    const assigns = A.state.assignments.filter(a => a.Module_ID === moduleId);
    const ids = new Set(assigns.map(a => a.Assignment_ID));
    const completes = A.state.completion.filter(c => ids.has(c.Assignment_ID));
    const total = assigns.length;
    const viewed = completes.filter(c => c.Viewed === 'Yes').length;
    const acknowledged = completes.filter(c => c.Acknowledged === 'Yes').length;
    const completed = completes.filter(c => c.Completed === 'Yes' || c.Status === 'Completed').length;
    const pkt = A.pktForModule(moduleId);
    let pktPass = 0, pktFail = 0;
    if (pkt) {
      const attempts = A.state.pktAttempts.filter(a => a.PKT_ID === pkt.PKT_ID);
      const finalByUser = {};
      for (const a of attempts) {
        const cur = finalByUser[a.UserID]; if (!cur || a.Attempt_No > cur.Attempt_No) finalByUser[a.UserID] = a;
      }
      pktPass = Object.values(finalByUser).filter(a => a.Result === 'Pass').length;
      pktFail = Object.values(finalByUser).filter(a => a.Result === 'Fail').length;
    }
    const overdue = assigns.filter(a => a.Overdue === 'Yes' && (A.findCompletion(a.Assignment_ID)?.Status !== 'Completed')).length;
    const points = completes.reduce((s, c) => s + (c.Points_Earned || 0), 0);
    return { total, viewed, acknowledged, completed, pktPass, pktFail, overdue, points, hasPkt: !!pkt };
  }

  function renderConsoleRow(m) {
    const r = rolloutForModule(m.Module_ID);
    const completedPct = pct(r.completed, r.total);
    const ackPct = pct(r.acknowledged, r.total);
    const viewedPct = pct(r.viewed, r.total);
    const icon = m.Module_Type === 'Broadcast' ? 'megaphone' : m.Module_Type === 'Training' ? 'book-open' : 'graduation-cap';
    return `
      <tr>
        <td>
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center"><i data-lucide="${icon}" class="text-[14px] text-arena-gold"></i></div>
            <div>
              <div class="font-semibold text-[13px]">${escapeHtml(m.Title)}</div>
              <div class="text-[10px] text-arena-muted flex items-center gap-1">${m.Module_ID} · ${priorityChip(m.Priority)} <span class="chip bg-white/5 border border-white/10 text-arena-muted">${m.Content_Format || '—'}</span></div>
            </div>
          </div>
        </td>
        <td class="text-arena-muted text-[12px]">${A.describeAudience(m.Audience_Type, m.Audience_ID)}</td>
        <td class="text-[12px] ${r.overdue > 0 ? 'text-arena-red font-semibold' : 'text-arena-text'}">${m.Due_Date || '—'}<div class="text-[10px] text-arena-muted">${dueLabel(m.Due_Date)}</div></td>
        <td class="text-center font-semibold">${r.total}</td>
        <td class="text-center"><div class="text-[12px] font-semibold">${r.viewed}/${r.total}</div><div class="progress mt-1"><span style="width:${viewedPct}%"></span></div></td>
        <td class="text-center"><div class="text-[12px] font-semibold">${r.acknowledged}/${r.total}</div><div class="progress emerald mt-1"><span style="width:${ackPct}%"></span></div></td>
        <td class="text-center"><div class="text-[12px] font-semibold">${r.completed}/${r.total}</div><div class="progress gold mt-1"><span style="width:${completedPct}%"></span></div></td>
        <td class="text-center text-[12px]">${r.hasPkt ? `<span class="rag-green font-semibold">${r.pktPass}</span> <span class="text-arena-muted">/</span> <span class="rag-red font-semibold">${r.pktFail}</span>` : '<span class="text-arena-muted">—</span>'}</td>
        <td class="text-center"><span class="font-semibold ${r.overdue > 0 ? 'rag-red' : 'text-arena-muted'}">${r.overdue}</span></td>
        <td class="text-center font-semibold gold-text">${r.points.toLocaleString()}</td>
        <td>
          <div class="flex items-center justify-end gap-1">
            <button data-action="bulk-remind" data-module="${m.Module_ID}" class="icon-btn !w-7 !h-7" title="Send reminder"><i data-lucide="bell-ring" class="text-[12px]"></i></button>
            <button data-action="open-drill" data-module="${m.Module_ID}" class="icon-btn !w-7 !h-7" title="Drill into module"><i data-lucide="chevron-right" class="text-[12px]"></i></button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderModuleDrill(moduleId) {
    const s = A.state;
    const m = A.moduleById(moduleId); if (!m) return '';
    const assigns = s.assignments.filter(a => a.Module_ID === moduleId);
    const r = rolloutForModule(moduleId);
    const pkt = A.pktForModule(moduleId);
    const icon = m.Module_Type === 'Broadcast' ? 'megaphone' : m.Module_Type === 'Training' ? 'book-open' : 'graduation-cap';
    return `
      <div class="glass rounded-2xl mt-2 fade-in">
        <div class="flex items-start justify-between gap-3 p-4 border-b border-white/5">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-arena-gold/10 border border-arena-gold/30 grid place-items-center"><i data-lucide="${icon}" class="text-arena-gold"></i></div>
            <div>
              <div class="text-base font-bold font-display">${escapeHtml(m.Title)}</div>
              <div class="text-[12px] text-arena-muted">${m.Module_ID} · ${m.Module_Type} · ${A.describeAudience(m.Audience_Type, m.Audience_ID)}</div>
              <div class="text-[12px] text-arena-text/80 mt-1 max-w-2xl">${escapeHtml(m.Description || '')}</div>
              <div class="flex flex-wrap gap-1.5 mt-2">
                ${priorityChip(m.Priority)}
                <span class="chip bg-white/5 border border-white/10 text-arena-muted">${m.Content_Format || '—'}</span>
                ${m.Requires_Ack === 'Yes' ? '<span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30">Requires ack</span>' : ''}
                ${pkt ? `<span class="chip bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30">PKT · ${pkt.Pass_Score}% pass</span>` : ''}
                ${m.Badge_Unlock ? `<span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30"><i data-lucide="award" class="text-[10px]"></i> ${escapeHtml(m.Badge_Unlock)}</span>` : ''}
                <span class="chip bg-white/5 border border-white/10 text-arena-muted">+${m.Points_On_Completion} pts · +${m.XP_On_Completion} XP</span>
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <button data-action="bulk-remind" data-module="${m.Module_ID}" class="btn-secondary text-[12px]"><i data-lucide="bell-ring" class="text-[12px]"></i> Remind pending</button>
            <button data-action="close-drill" class="icon-btn"><i data-lucide="x" class="text-[14px]"></i></button>
          </div>
        </div>
        <div class="overflow-x-auto scrollbar-thin">
          <table class="tbl">
            <thead><tr><th>Agent</th><th>Team</th><th>Status</th><th class="text-center">Viewed</th><th class="text-center">Ack</th><th class="text-center">Completed</th>${pkt ? '<th class="text-center">Best PKT</th>' : ''}<th class="text-center">Points</th><th class="text-center">Badge</th><th></th></tr></thead>
            <tbody>
              ${assigns.map(a => {
                const c = A.findCompletion(a.Assignment_ID) || {};
                const u = A.userById(a.UserID);
                const t = A.teamById(a.TeamID);
                let bestPkt = null;
                if (pkt) {
                  const userAttempts = s.pktAttempts.filter(x => x.PKT_ID === pkt.PKT_ID && x.UserID === a.UserID);
                  bestPkt = userAttempts.sort((x, y) => y.Score - x.Score)[0] || null;
                }
                const isOverdue = a.Overdue === 'Yes' && c.Status !== 'Completed';
                return `
                  <tr>
                    <td>
                      <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-full violet-bg grid place-items-center text-[10px] font-bold">${(u?.Name || '?').split(' ').map(s => s[0]).slice(0,2).join('')}</div>
                        <div><div class="font-medium text-[12px]">${escapeHtml(u?.Name)}</div><div class="text-[10px] text-arena-muted">${a.UserID}</div></div>
                      </div>
                    </td>
                    <td class="text-[12px] text-arena-muted">${escapeHtml(t?.TeamName || a.TeamID)}</td>
                    <td><span class="chip ${c.Status === 'Completed' ? 'bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30' : isOverdue ? 'bg-arena-red/15 text-arena-red border border-arena-red/30' : c.Status === 'In Progress' ? 'bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30' : c.Status === 'Acknowledged' ? 'bg-arena-violet/15 text-arena-violet border border-arena-violet/30' : 'bg-white/5 text-arena-muted border border-white/10'}">${isOverdue ? 'Overdue' : (c.Status || 'Not Started')}</span></td>
                    <td class="text-center">${c.Viewed === 'Yes' ? '<i data-lucide="check" class="text-arena-emerald"></i>' : '<span class="text-arena-muted">—</span>'}</td>
                    <td class="text-center">${c.Acknowledged === 'Yes' ? '<i data-lucide="check" class="text-arena-emerald"></i>' : '<span class="text-arena-muted">—</span>'}</td>
                    <td class="text-center">${c.Completed === 'Yes' ? '<i data-lucide="check" class="text-arena-emerald"></i>' : '<span class="text-arena-muted">—</span>'}</td>
                    ${pkt ? `<td class="text-center text-[12px] ${bestPkt?.Result === 'Pass' ? 'rag-green font-semibold' : (bestPkt?.Result === 'Fail' ? 'rag-red' : 'text-arena-muted')}">${bestPkt ? `${bestPkt.Score}% · ${bestPkt.Result}` : '—'}</td>` : ''}
                    <td class="text-center font-semibold gold-text">${(c.Points_Earned || 0).toLocaleString()}</td>
                    <td class="text-center text-[11px]">${c.Badge_Earned ? `<span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30"><i data-lucide="medal" class="text-[10px]"></i> ${escapeHtml(c.Badge_Earned)}</span>` : '<span class="text-arena-muted">—</span>'}</td>
                    <td>
                      <div class="flex items-center justify-end gap-1">
                        ${c.Status !== 'Completed' ? `<button data-action="reminder" data-user="${a.UserID}" data-module="${m.Module_ID}" class="icon-btn !w-7 !h-7" title="Remind"><i data-lucide="bell" class="text-[12px]"></i></button>` : ''}
                        ${c.Status !== 'Completed' ? `<button data-action="switch-user" data-user="${a.UserID}" data-role="Agent" class="icon-btn !w-7 !h-7" title="View as agent"><i data-lucide="eye" class="text-[12px]"></i></button>` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }


  function outcomeRowsForScope(scope, teamId) {
    const isTL = scope === 'team';
    const rows = latestRows(scope, teamId).filter(r => !['KPI008','KPI017','KPI018','KPI019','KPI021'].includes(r.KPI_ID));
    const basePenalty = isTL
      ? (A.state.exposure || []).filter(e => e.Entity_Level === 'Team' && e.Entity_ID === teamId).reduce((s,e)=>s+(e.Forecast_Penalty||0),0)
      : (A.state.exposure || []).filter(e => e.Entity_Level === 'Account').reduce((s,e)=>s+(e.Forecast_Penalty||0),0);
    const m = clientOutcomeMetrics(scope, basePenalty, rows.length);
    const defs = [
      {
        id: 'effort', outcome:'Enrollment Friction Index', drivers:['KPI004','KPI011','KPI012','KPI003'], driverText:'Effectuation Quality, Application Accuracy, Plan Match Escalation, Eligible Call Conversion',
        clientMetrics:'Repeat contacts, complaint risk, customer service survey signals',
        primary:'Plan Match Escalation', secondary:'Application Accuracy',
        rootCauses:['authorization status follow-up','unclear next step','avoidable transfer'],
        action:isTL ? 'Launch Resolution Confidence Sprint' : 'Create account recovery plan',
        tree:[{title:'Application fallout risk', children:['Application Accuracy','Effectuation Quality','Knowledge gap themes']},{title:'Enrollment effort', children:['Plan Match Escalation','Plan-match escalations','Unclear next steps']}],
        help:['Enrollment Friction Index','How much effort members may experience to get an issue resolved.','Weighted view of Application Accuracy, Effectuation Quality, Plan Match Escalation, Eligible Call Conversion and repeat-contact signals.','Use to select coaching, knowledge, routing or process interventions.', 'Medium']
      },
      {
        id: 'experience', outcome:'Compliance Quality Index', drivers:['KPI003','KPI005','KPI009','KPI011'], driverText:'Eligible Call Conversion, Quality Score, Disclosure Quality, Application Accuracy',
        clientMetrics:'Courtesy/respect survey items, customer service experience, complaints',
        primary:'Disclosure Quality', secondary:'Eligible Call Conversion',
        rootCauses:['empathy variation','script clarity','resolution confidence'],
        action:isTL ? 'Create Courtesy & Resolution Mission' : 'Prioritize experience driver recovery',
        tree:[{title:'Compliance experience', children:['Disclosure Quality','Eligible Call Conversion','Application Accuracy']},{title:'QA confidence', children:['Quality Score','Coaching themes','Calibration gaps']}],
        help:['Compliance Quality Index','Roll-up of call quality and post-call survey drivers that influence member experience.','Weighted view of survey and QA signals.','Discuss experience risk without claiming direct Star movement.', 'Medium']
      },
      {
        id: 'access', outcome:'Eligible Call Access Index', drivers:['KPI001','KPI008','KPI006','KPI012'], driverText:'AHT, Fallout Rate, Schedule Adherence, Plan Match Escalation',
        clientMetrics:'Speed-to-answer, abandonment, access perception, queue stability',
        primary:'AHT', secondary:'Fallout Rate',
        rootCauses:['peak interval pressure','staffing/adherence gap','routing friction'],
        action:isTL ? 'Create Access Stability Mission' : 'Review staffing and interval recovery',
        tree:[{title:'Sales capacity', children:['AHT','Fallout','AEP interval pressure']},{title:'Eligibility routing', children:['Schedule Adherence','Plan Match Escalation','Coverage balance']}],
        help:['Eligible Call Access Index','Member difficulty reaching the right help at the right time.','AHT + abandonment + adherence + transfer/access indicators.','Use for capacity, routing and peak interval interventions. AHT is not an individual-agent KPI.', 'Medium-High']
      },
      {
        id: 'capacity', outcome:'Capacity Stability Index', drivers:['KPI010','KPI002','KPI006'], driverText:'Calls Handled, AHT, Schedule Adherence',
        clientMetrics:'Cost-to-serve, queue stability, billable volume, service capacity',
        primary:'Calls Handled', secondary:'AHT',
        rootCauses:['volume surge','AHT variance','coverage gap'],
        action:isTL ? 'Balance calls handled with quality guardrails' : 'Model capacity and revenue protection',
        tree:[{title:'Volume/capacity', children:['Calls Handled','AHT','Billable volume']},{title:'Stability', children:['Schedule Adherence','Occupancy proxy','Interval risk']}],
        help:['Capacity Stability Index','Whether call volume, AHT and coverage are balanced enough to sustain service levels.','Calls handled + AHT + adherence/coverage indicators.','Use for capacity planning and margin/revenue conversations, not speed pressure without quality guardrails.', 'Medium']
      }
    ];
    if (!isTL) {
      defs.push({
        id:'commercial', outcome:'Commercial Value Bridge', drivers:['KPI010','KPI008','KPI003'], driverText:'Revenue, Penalty %, Reward Opportunity, Experience Risk',
        clientMetrics:'Revenue delivered, penalty exposure, modeled leakage, reward opportunity',
        primary:'Penalty % of revenue', secondary:'Revenue MTD',
        rootCauses:['SLA exposure','repeat-contact leakage','experience driver watch'],
        action:'Create executive recovery action',
        tree:[{title:'Value protected', children:['Revenue MTD','Penalty exposure','Reward opportunity']},{title:'Leakage', children:['Repeat contacts','Rework risk','Experience friction']}],
        help:['Commercial Value Bridge','Executive bridge from revenue to penalty, reward and modeled leakage.','Revenue MTD - penalty exposure - modeled leakage + reward opportunity.','Use for client/QBR conversations and prioritizing recovery plans.', 'Medium until calibrated']
      });
    }
    return defs.map(d => {
      const score = outcomeScore(scope, teamId, d.drivers);
      const rag = outcomeRag(score);
      const trend = outcomeWow(scope, teamId, d.drivers);
      const metric = d.id === 'effort'
        ? (isTL ? `${m.repeatContacts} modeled enrollment opportunity` : `${usd(m.repeatCost)} modeled leakage`)
        : d.id === 'commercial'
          ? (() => { const e=(A.state.exposure||[]).find(x=>x.Entity_Level==='Account'); const p=(A.state.exposure||[]).filter(x=>x.Entity_Level==='Account').reduce((s,x)=>s+(x.Forecast_Penalty||0),0); return `${usd(e?.Revenue_MTD || 0)} revenue · ${Math.round((p/(e?.Revenue_MTD||1))*1000)/10}% penalty`; })()
          : `${score}/100 · ${trend.delta >= 0 ? '+' : ''}${trend.delta} WoW`;
      return { ...d, score, rag, trend, metric, expected: impactRange(scope, d.id) };
    });
  }

  function renderOutcomeCard(o, isTL) {
    const ragCls = o.rag === 'Green' ? 'rag-green' : o.rag === 'Amber' ? 'rag-amber' : 'rag-red';
    const trendCls = o.trend.delta >= 0 ? 'rag-green' : 'rag-red';
    return `
      <article class="outcome-card rounded-2xl p-4 ${o.rag === 'Green' ? 'outcome-green' : o.rag === 'Amber' ? 'outcome-amber' : 'outcome-red'}">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <div class="text-[10px] uppercase tracking-[0.22em] text-arena-muted font-bold">Client Outcome</div>
            <div class="font-display font-bold text-[18px] leading-tight">${escapeHtml(o.outcome)} ${metricHelp(...o.help)}</div>
            <div class="text-[11px] text-arena-muted mt-1">Client metrics influenced: ${escapeHtml(o.clientMetrics)}</div>
          </div>
          <div class="text-right">
            <div class="hero-num text-3xl ${ragCls}">${o.score}</div>
            <div class="mt-1">${ragBadge(o.rag === 'Amber' ? 'Watch' : o.rag)}</div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
          <div class="rounded-xl bg-white/[0.035] border border-white/8 p-3"><div class="label">Primary driver</div><div class="font-bold text-arena-text mt-1">${escapeHtml(o.primary)}</div><div class="text-[10px] text-arena-muted">Secondary: ${escapeHtml(o.secondary)}</div></div>
          <div class="rounded-xl bg-white/[0.035] border border-white/8 p-3"><div class="label">Current metric</div><div class="font-bold ${ragCls} mt-1">${escapeHtml(String(o.metric))}</div><div class="text-[10px] text-arena-muted">driver-based index</div></div>
          <div class="rounded-xl bg-white/[0.035] border border-white/8 p-3"><div class="label">Expected impact</div><div class="font-bold text-arena-cyan mt-1">${escapeHtml(o.expected)}</div><div class="text-[10px] ${trendCls}">${o.trend.delta >= 0 ? '+' : ''}${o.trend.delta} WoW</div></div>
        </div>

        ${driverTree(o)}
        <div class="mt-3">
          <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Likely root-cause themes</div>
          ${rootCauseChips(o.rootCauses)}
        </div>
        <div class="mt-3 flex items-center justify-between gap-2 flex-wrap rounded-xl bg-white/[0.025] border border-white/8 p-3">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Recommended intervention</div>
            <div class="font-semibold text-[13px]">${escapeHtml(o.action)}</div>
          </div>
          <button data-nav="${isTL ? 'lead-missions' : 'mgr-whatif'}" class="btn-primary text-[12px]"><i data-lucide="swords" class="text-[12px]"></i> Create intervention</button>
        </div>
      </article>
    `;
  }

  function renderOutcomeDashboard(scope) {
    const isTL = scope === 'team';
    const me = A.userById(A.state.activeUserId);
    const teamId = isTL ? me.TeamID : null;
    const rows = outcomeRowsForScope(scope, teamId);
    const trend = weekTrendForTeam(teamId);
    const title = isTL ? 'Client Outcome Coaching Board' : 'Account Command Center';
    const subtitle = isTL
      ? 'Start with the client outcome, then drill into drivers, root causes, and coaching interventions.'
      : 'Outcome score → driver tree → root cause → value bridge → recommended action.';
    const exp = (A.state.exposure || []).filter(x => isTL ? (x.Entity_Level === 'Team' && x.Entity_ID === teamId) : x.Entity_Level === 'Account');
    const penalty = exp.reduce((s,x)=>s+(x.Forecast_Penalty||0),0);
    const reward = exp.reduce((s,x)=>s+(x.Forecast_Reward||0),0);
    const revenue = exp[0]?.Revenue_MTD || 0;
    const penaltyPct = revenue ? Math.round((penalty/revenue)*1000)/10 : 0;
    return `
      <div class="space-y-4 fade-in outcome-command">
        <section class="outcome-hero rounded-2xl p-4 sm:p-5 relative overflow-hidden">
          <span class="sparkle" style="top:20%;left:18%;animation-delay:.1s"></span>
          <span class="sparkle" style="bottom:24%;right:18%;animation-delay:.7s"></span>
          <div class="flex items-start justify-between gap-3 flex-wrap relative">
            <div>
              <div class="text-[10px] uppercase tracking-[0.22em] text-arena-muted font-bold">${isTL ? 'Team scope' : 'Account scope'}</div>
              <div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">${title}</div>
              <div class="text-[12px] text-arena-muted mt-1 max-w-[780px]">${subtitle}</div>
            </div>
            <button data-nav="${isTL ? 'lead-console' : 'mgr-command'}" class="btn-secondary text-[12px]"><i data-lucide="layout-dashboard" class="text-[12px]"></i> Open classic console</button>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mt-4 relative">
            ${trendCard('Overall WoW', trend, 'performance index')}
            <div class="glass rounded-2xl p-4"><div class="label">${isTL ? 'Team exposure' : 'Penalty exposure'}</div><div class="hero-num text-3xl mt-1 ${penalty ? 'rag-red' : 'text-arena-muted'}">${usd(penalty)}</div><div class="text-[10px] text-arena-muted">${isTL ? 'team-scoped only' : `${penaltyPct}% of modeled revenue`}</div></div>
            ${!isTL ? `<div class="glass rounded-2xl p-4"><div class="label">Total Revenue MTD</div><div class="hero-num text-3xl mt-1 gold-text">${usd(revenue)}</div><div class="text-[10px] text-arena-muted">${(exp[0]?.Billable_Calls_MTD||0).toLocaleString()} calls × $${exp[0]?.Rate_Card_Per_Call || 0}</div></div>` : `<div class="glass rounded-2xl p-4"><div class="label">Interventions open</div><div class="hero-num text-3xl mt-1 text-arena-cyan">${rows.filter(r=>r.rag !== 'Green').length}</div><div class="text-[10px] text-arena-muted">outcomes needing attention</div></div>`}
            <div class="glass rounded-2xl p-4"><div class="label">Value bridge</div><div class="hero-num text-3xl mt-1 ${reward-penalty >= 0 ? 'rag-green' : 'rag-red'}">${usd(reward-penalty)}</div><div class="text-[10px] text-arena-muted">reward - penalty exposure</div></div>
          </div>
        </section>

        <section class="outcome-map rounded-2xl p-4">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div><div class="label">Client metric map</div><div class="font-display font-bold text-[16px]">Operational KPIs mapped to client outcomes and actions</div></div>
            <span class="chip bg-arena-amber/15 text-arena-amber border border-arena-amber/30"><i data-lucide="shield-alert" class="text-[10px]"></i> influence, not direct attribution</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${rows.map(o => renderOutcomeCard(o, isTL)).join('')}
          </div>
        </section>
      </div>`;
  }

  function renderLeadOutcomes() { return renderOutcomeDashboard('team'); }
  function renderMgrOutcomes() { return renderOutcomeDashboard('account'); }


  function kpiTrendDetail(scope, teamId, kpiId) {
    const all = (A.state.performance || []).filter(r => r.KPI_ID === kpiId && (scope !== 'team' || r.TeamID === teamId));
    const k = A.kpiById(kpiId) || {};
    const dates = [...new Set(all.map(r => r.Date))].sort();
    const recent = dates.slice(-14);
    const prevDates = recent.slice(0, 7);
    const currDates = recent.slice(7);
    function avg(ds, field) {
      const x = all.filter(r => ds.includes(r.Date));
      return x.length ? x.reduce((s, r) => s + (r[field] || 0), 0) / x.length : 0;
    }
    const prevScore = avg(prevDates, 'Score');
    const currScore = avg(currDates, 'Score');
    const prevActual = avg(prevDates, 'Actual');
    const currActual = avg(currDates, 'Actual');
    const deltaScore = Math.round((currScore - prevScore) * 10) / 10;
    const deltaActual = Math.round((currActual - prevActual) * 10) / 10;
    const rag = currScore >= 100 ? 'Green' : currScore >= 92 ? 'Amber' : 'Red';
    return { kpiId, name: k.KPI_Name || kpiId, type: k.KPI_Type || 'KPI', unit: k.Unit || '', direction: k.Direction || 'Higher', prevScore, currScore, prevActual, currActual, deltaScore, deltaActual, rag };
  }

  function trendDirectionLabel(d) {
    const good = d.deltaScore >= 1;
    const bad = d.deltaScore <= -1;
    if (good) return `<span class="chip rag-bg-green rag-green"><i data-lucide="arrow-up-right" class="text-[10px]"></i> Improved</span>`;
    if (bad) return `<span class="chip rag-bg-red rag-red"><i data-lucide="arrow-down-right" class="text-[10px]"></i> Worsened</span>`;
    return `<span class="chip bg-white/5 text-arena-muted border border-white/10"><i data-lucide="minus" class="text-[10px]"></i> Stable</span>`;
  }

  function trendSparkFor(scope, teamId, kpiId) {
    const rows = (A.state.performance || []).filter(r => r.KPI_ID === kpiId && (scope !== 'team' || r.TeamID === teamId));
    const dates = [...new Set(rows.map(r => r.Date))].sort().slice(-14);
    const vals = dates.map(d => {
      const x = rows.filter(r => r.Date === d);
      return x.length ? x.reduce((s,r)=>s+(r.Score||0),0)/x.length : 0;
    });
    return sparkline(vals, '#3ad4ff');
  }

  function rcaDefinitions(scope) {
    const isTL = scope === 'team';
    return [
      { outcome:'Enrollment Friction', metric:'Application/fallout friction', symptom:isTL?'Repeat-contact risk is above team baseline':'Excess repeat contacts create modeled avoidable client cost', drivers:['Application Accuracy','Effectuation Quality','Plan Match Escalation','Eligible Call Conversion'], causes:['unclear next step','avoidable transfer','benefit/authorization follow-up','knowledge gap'], action:isTL?'Create Resolution Confidence coaching challenge':'Create account recovery plan for repeat-contact drivers' },
      { outcome:'Compliance Quality', metric:'Disclosure and QA drivers', symptom:'Courtesy/Respect and Application Accuracy are the main experience drivers to inspect', drivers:['Disclosure Quality','Eligible Call Conversion','Quality Score','Application Accuracy'], causes:['empathy variation','script clarity','resolution confidence','new-hire variation'], action:isTL?'Launch Courtesy & Resolution sprint':'Target team coaching on experience-driver health' },
      { outcome:'Eligible Call Access', metric:'Compliant call-flow and capacity friction', symptom:isTL?'Peak intervals need adherence/routing focus':'AHT/abandonment signal capacity-planning risk', drivers:['AHT','Fallout Rate','Schedule Adherence','Plan Match Escalation'], causes:['peak interval pressure','staffing gap','break adherence','routing friction'], action:isTL?'Protect peak interval adherence mission':'Model capacity plan and queue recovery action' },
      { outcome:'Capacity Stability', metric:'Volume handled vs handle-time balance', symptom:'Calls handled and AHT must improve without quality deterioration', drivers:['Calls Handled','AHT','Schedule Adherence'], causes:['volume surge','AHT variance','coverage gap','case complexity'], action:isTL?'Balance calls-handled challenge with quality guardrails':'Review volume, rate-card revenue, and capacity staffing plan' }
    ];
  }

  function renderRcaPage(scope) {
    const isTL = scope === 'team';
    const me = A.userById(A.state.activeUserId);
    const teamId = isTL ? me?.TeamID : null;
    const title = isTL ? 'Driving Client Outcomes · Team Lead' : 'Driving Client Outcomes · Manager';
    const sub = isTL ? 'Root-cause themes behind team client-outcome risk. Use this for coaching and interventions, not individual blame.' : 'Account-level RCA connecting client metrics, operational drivers, teams, and recovery actions.';
    const defs = rcaDefinitions(scope);
    const outcomeRows = outcomeRowsForScope(scope, teamId);
    const hotspots = isTL ? (A.leaderboardForTeam(teamId || '').filter(a => a.RAGStatus !== 'Green').slice(0,4).map(a => A.userById(a.UserID)?.Name || a.UserID).join(', ') || 'No current agent hotspot') : 'Squad Vega, Squad Atlas, peak interval queue';
    return `
      <div class="space-y-4 fade-in rca-page">
        <section class="outcome-hero rounded-2xl p-4 sm:p-5">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div><div class="label">Outcome Driver Analysis</div><div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">${title}</div><div class="text-[12px] text-arena-muted mt-1 max-w-[850px]">${sub}</div></div>
            <div class="flex gap-2 flex-wrap"><button data-nav="${isTL ? 'lead-outcomes' : 'mgr-outcomes'}" class="btn-secondary text-[12px]"><i data-lucide="activity" class="text-[12px]"></i> Outcomes</button><button data-nav="${isTL ? 'lead-trends' : 'mgr-trends'}" class="btn-secondary text-[12px]"><i data-lucide="line-chart" class="text-[12px]"></i> Trends</button></div>
          </div>
        </section>
        <section class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          ${defs.map((d, idx) => {
            const o = outcomeRows[idx] || {};
            const rag = o.rag || 'Amber';
            const cls = rag === 'Green' ? 'outcome-green' : rag === 'Amber' ? 'outcome-amber' : 'outcome-red';
            return `<article class="rounded-2xl p-4 rca-card ${cls}">
              <div class="flex items-start justify-between gap-3"><div><div class="label">Client metric RCA</div><div class="font-display font-bold text-[18px]">${escapeHtml(d.outcome)} ${metricHelp(d.outcome + ' RCA', 'Explains why this client metric or outcome is moving, using KPI drivers and root-cause themes.', 'Outcome score + driver KPI trend + recurring call themes + team/process hotspot.', 'Use to decide coaching, challenge, staffing, or process interventions.', 'Medium; calibrate with client data')}</div><div class="text-[11px] text-arena-muted mt-1">Metric: ${escapeHtml(d.metric)}</div></div><div class="text-right"><div class="hero-num text-3xl ${rag==='Green'?'rag-green':rag==='Amber'?'rag-amber':'rag-red'}">${o.score || '—'}</div>${ragBadge(rag==='Amber'?'Watch':rag)}</div></div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3"><div class="rounded-xl bg-white/[0.035] border border-white/8 p-3"><div class="label">Symptom</div><div class="text-[12px] text-arena-text leading-snug">${escapeHtml(d.symptom)}</div></div><div class="rounded-xl bg-white/[0.035] border border-white/8 p-3"><div class="label">Hotspot</div><div class="text-[12px] text-arena-text leading-snug">${escapeHtml(hotspots)}</div></div></div>
              <div class="mt-3"><div class="label">Driver KPIs</div><div class="flex flex-wrap gap-1.5 mt-2">${d.drivers.map(x=>`<span class="chip bg-arena-cyan/10 text-arena-cyan border border-arena-cyan/25">${escapeHtml(x)}</span>`).join('')}</div></div>
              <div class="mt-3"><div class="label">Likely RCA themes</div>${rootCauseChips(d.causes)}</div>
              <div class="mt-3 rounded-xl bg-white/[0.025] border border-white/8 p-3 flex items-center justify-between gap-2 flex-wrap"><div><div class="label">Recommended intervention</div><div class="font-semibold text-[13px]">${escapeHtml(d.action)}</div></div><button data-nav="${isTL ? 'lead-missions' : 'mgr-whatif'}" class="btn-primary text-[12px]"><i data-lucide="swords" class="text-[12px]"></i> Create intervention</button></div>
            </article>`;
          }).join('')}
        </section>
      </div>`;
  }

  function renderTrendsPage(scope) {
    const isTL = scope === 'team';
    const me = A.userById(A.state.activeUserId);
    const teamId = isTL ? me?.TeamID : null;
    const title = isTL ? 'SLA/KPI Trends · Team Lead' : 'SLA/KPI Trends · Manager';
    const kpiIds = ['KPI001','KPI002','KPI003','KPI004','KPI005','KPI006','KPI007','KPI008','KPI010','KPI009','KPI011','KPI012'].filter(id => A.kpiById(id));
    const details = kpiIds.map(id => kpiTrendDetail(scope, teamId, id));
    const access = details.filter(d => ['SOA Compliance Rate','Disclosure Completion Rate','CMS Test Call Score','CTM Rate / 1,000 Enrollments','Call Adherence Rate'].includes(d.name));
    const experience = details.filter(d => ['Overall Conversion Rate','Eligible Call Conversion Rate','Applications Per Day','Effectuation Rate','Fallout Rate','RFI Rate','Quality Assurance Score'].includes(d.name));
    const capacity = details.filter(d => ['Average Handle Time','Schedule Adherence','Agent Utilization Rate','Shrinkage Rate','Cost Per Acquisition','Gross Cost Per Application','Cost Per Eligible Call'].includes(d.name));
    function mini(label, arr) {
      const score = arr.length ? arr.reduce((s,d)=>s+d.currScore,0)/arr.length : 0;
      const prev = arr.length ? arr.reduce((s,d)=>s+d.prevScore,0)/arr.length : 0;
      const delta = Math.round((score-prev)*10)/10;
      const rag = score >= 100 ? 'rag-green' : score >= 92 ? 'rag-amber' : 'rag-red';
      return `<button data-rag-filter="${score>=100?'Green':score>=92?'Amber':'Red'}" class="glass rounded-2xl p-4 text-left"><div class="label">${escapeHtml(label)}</div><div class="hero-num text-3xl mt-1 ${rag}">${Math.round(score)}</div><div class="text-[10px] ${delta>=0?'rag-green':'rag-red'}">${delta>=0?'+':''}${delta} WoW</div></button>`;
    }
    return `
      <div class="space-y-4 fade-in trends-page">
        <section class="outcome-hero rounded-2xl p-4 sm:p-5">
          <div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="label">Week-on-week trend view</div><div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">${title}</div><div class="text-[12px] text-arena-muted mt-1 max-w-[840px]">Separate trend view for SLA/KPI movement. Trends use KPI score direction so lower-is-better metrics like AHT/CPA/CTM are interpreted correctly by the score engine.</div></div><button data-nav="${isTL ? 'lead-rca' : 'mgr-rca'}" class="btn-secondary text-[12px]"><i data-lucide="git-branch" class="text-[12px]"></i> Open RCA</button></div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">${mini('Sales/revenue trend', experience)}${mini('CMS compliance trend', access)}${mini('Cost/capacity trend', capacity)}</div>
        </section>
        <section class="glass rounded-2xl p-4"><div class="flex items-center justify-between gap-2 flex-wrap mb-3"><div><div class="label">KPI/SLA trend table</div><div class="font-display font-bold text-[16px]">Current week vs previous week</div></div><span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30"><i data-lucide="calendar-days" class="text-[10px]"></i> WoW</span></div><div class="overflow-x-auto scrollbar-thin"><table class="tbl"><thead><tr><th>KPI / SLA</th><th>Category</th><th class="text-right">Prev week</th><th class="text-right">Current week</th><th class="text-right">Actual movement</th><th class="text-center">Score</th><th class="text-center">Trend</th><th>14-day spark</th><th>Action</th></tr></thead><tbody>${details.map(d => `<tr><td><div class="font-medium">${escapeHtml(d.name)}</div><div class="text-[10px] text-arena-muted">${d.direction === 'Lower' ? 'Lower is better' : 'Higher is better'}</div></td><td class="text-arena-muted">${escapeHtml(d.type)}</td><td class="text-right">${d.prevActual.toFixed(d.unit==='sec'?1:1)}${d.unit}</td><td class="text-right font-semibold ${d.rag==='Green'?'rag-green':d.rag==='Amber'?'rag-amber':'rag-red'}">${d.currActual.toFixed(d.unit==='sec'?1:1)}${d.unit}</td><td class="text-right ${d.deltaScore>=0?'rag-green':'rag-red'}">${d.deltaActual>=0?'+':''}${d.deltaActual}${d.unit}</td><td class="text-center font-bold ${d.rag==='Green'?'rag-green':d.rag==='Amber'?'rag-amber':'rag-red'}">${d.currScore.toFixed(1)}</td><td class="text-center">${trendDirectionLabel(d)}</td><td class="min-w-[120px]">${trendSparkFor(scope, teamId, d.kpiId)}</td><td><button data-nav="${isTL ? 'lead-rca' : 'mgr-rca'}" class="btn-ghost text-[11px] !py-1 !px-2"><i data-lucide="git-branch" class="text-[11px]"></i> RCA</button></td></tr>`).join('')}</tbody></table></div></section>
      </div>`;
  }

  function renderLeadRca() { return renderRcaPage('team'); }
  function renderMgrRca() { return renderRcaPage('account'); }
  function renderLeadTrends() { return renderTrendsPage('team'); }
  function renderMgrTrends() { return renderTrendsPage('account'); }


  // ========================================================================
  // Final acceptance-driven Client Outcome / RCA / Trend pages
  // These override earlier prototype pages so the TL/Manager experience is
  // outcome-first, scoped correctly and internally consistent.
  // ========================================================================
  const FINAL_AGENT_KPIS = ['KPI001','KPI002','KPI003','KPI004','KPI005','KPI006','KPI007','KPI009','KPI010','KPI011','KPI012','KPI013','KPI014','KPI015','KPI016','KPI020'];
  const FINAL_TL_MGR_KPIS = ['KPI001','KPI002','KPI003','KPI004','KPI005','KPI006','KPI007','KPI008','KPI009','KPI010','KPI011','KPI012','KPI013','KPI014','KPI015','KPI016','KPI017','KPI018','KPI019','KPI021'];

  function finalRag(score) { return score >= 100 ? 'Green' : score >= 92 ? 'Amber' : 'Red'; }
  function finalRagLabel(r) { return r === 'Amber' ? 'Watch' : r === 'Red' ? 'Critical' : 'Green'; }
  function finalRagClass(r) { return r === 'Green' ? 'rag-green' : r === 'Amber' ? 'rag-amber' : 'rag-red'; }
  function finalRagBg(r) { return r === 'Green' ? 'rag-bg-green rag-green' : r === 'Amber' ? 'rag-bg-amber rag-amber' : 'rag-bg-red rag-red'; }
  function finalKpiName(id) { return A.kpiById(id)?.KPI_Name || id; }
  function finalScopeRows(scope, teamId) {
    const rows = A.state.performance || [];
    const latest = [...new Set(rows.map(r => r.Date))].sort().slice(-1)[0];
    return rows.filter(r => r.Date === latest && (scope === 'team' ? r.TeamID === teamId : true));
  }
  function finalTrendRows(scope, teamId, kpiId) {
    const rows = (A.state.performance || []).filter(r => r.KPI_ID === kpiId && (scope === 'team' ? r.TeamID === teamId : true));
    const dates = [...new Set(rows.map(r => r.Date))].sort().slice(-14);
    const prevDates = dates.slice(0, 7), currDates = dates.slice(7);
    function avg(ds, field) {
      const x = rows.filter(r => ds.includes(r.Date));
      return x.length ? x.reduce((s,r)=>s+(Number(r[field])||0),0)/x.length : 0;
    }
    return { prevScore: avg(prevDates,'Score'), currScore: avg(currDates,'Score'), prevActual: avg(prevDates,'Actual'), currActual: avg(currDates,'Actual') };
  }
  function finalMetricRows(scope, teamId, ids) {
    const latest = finalScopeRows(scope, teamId);
    return ids.filter(id => A.kpiById(id)).map(id => {
      const k = A.kpiById(id) || {};
      const rows = latest.filter(r => r.KPI_ID === id);
      const score = rows.length ? rows.reduce((s,r)=>s+(r.Score||0),0)/rows.length : 0;
      const actual = rows.length ? rows.reduce((s,r)=>s+(Number(r.Actual)||0),0)/rows.length : 0;
      const target = rows[0]?.Target ?? k.Target ?? 0;
      const rag = finalRag(score);
      const t = finalTrendRows(scope, teamId, id);
      const deltaScore = Math.round((t.currScore - t.prevScore)*10)/10;
      const deltaActual = Math.round((t.currActual - t.prevActual)*10)/10;
      return { kpiId:id, name:k.KPI_Name||id, type:k.KPI_Type||'KPI', unit:k.Unit||'', direction:k.Direction||'Higher', target, actual, score, rag, prevScore:t.prevScore, currScore:t.currScore, prevActual:t.prevActual, currActual:t.currActual, deltaScore, deltaActual };
    });
  }
  function finalFilteredRows(rows) {
    const f = A.state.ragFilter || 'all';
    return f && f !== 'all' ? rows.filter(r => r.rag === f) : rows;
  }
  function finalCounts(rows) {
    return { Green: rows.filter(r=>r.rag==='Green').length, Amber: rows.filter(r=>r.rag==='Amber').length, Red: rows.filter(r=>r.rag==='Red').length };
  }
  function finalRagCountButtons(rows, baseNav) {
    const c = finalCounts(rows), active = A.state.ragFilter || 'all';
    const btn = (status, label, cls) => `<button ${baseNav ? `data-nav="${baseNav}"` : ''} data-rag-filter="${status}" class="glass rounded-2xl p-4 text-left hover:border-white/20 ${active===status?'border-arena-gold/60':''}"><div class="label">${label}</div><div class="hero-num text-3xl mt-1 ${cls}">${c[status]}</div><div class="text-[10px] text-arena-muted">tap to filter</div></button>`;
    return `${btn('Green','Green metrics','rag-green')}${btn('Amber','Watch metrics','rag-amber')}${btn('Red','Critical metrics','rag-red')}<button ${baseNav ? `data-nav="${baseNav}"` : ''} data-rag-filter="all" class="glass rounded-2xl p-4 text-left hover:border-white/20 ${active==='all'?'border-arena-cyan/40':''}"><div class="label">All metrics</div><div class="hero-num text-3xl mt-1 text-arena-cyan">${rows.length}</div><div class="text-[10px] text-arena-muted">reset filter</div></button>`;
  }
  function finalTrendLabel(row) {
    if (row.deltaScore >= 2) return `<span class="chip rag-bg-green rag-green"><i data-lucide="trending-up" class="text-[10px]"></i> Improved</span>`;
    if (row.deltaScore <= -2) return `<span class="chip rag-bg-red rag-red"><i data-lucide="trending-down" class="text-[10px]"></i> Worsened</span>`;
    if (row.rag !== 'Green') return `<span class="chip rag-bg-amber rag-amber"><i data-lucide="circle-alert" class="text-[10px]"></i> Watch</span>`;
    return `<span class="chip bg-white/5 text-arena-muted border border-white/10"><i data-lucide="minus" class="text-[10px]"></i> Stable</span>`;
  }
  function finalTrendSpark(row) {
    const vals = (A.state.performance || []).filter(r => r.KPI_ID === row.kpiId).slice(-14).map(r => r.Score || 0);
    return sparkline(vals, row.rag === 'Green' ? '#22c98a' : row.rag === 'Amber' ? '#f8b441' : '#ef4f6e');
  }
  function finalMetricTable(rows, isTL) {
    const display = finalFilteredRows(rows);
    const filter = A.state.ragFilter || 'all';
    return `<section class="glass rounded-2xl p-4"><div class="flex items-center justify-between gap-2 flex-wrap mb-3"><div><div class="label">SLA/KPI detail</div><div class="font-display font-bold text-[16px]">${filter==='all'?'All metrics':finalRagLabel(filter)+' metrics'} · current week vs previous week</div></div>${filter!=='all'?`<button data-rag-filter="all" class="btn-ghost text-[11px] !py-1 !px-2">Show all</button>`:''}</div><div class="overflow-x-auto scrollbar-thin"><table class="tbl"><thead><tr><th>KPI / SLA</th><th>Category</th><th class="text-right">Previous week</th><th class="text-right">Current week</th><th class="text-right">Movement</th><th class="text-center">RAG</th><th class="text-center">Trend</th><th>14-day spark</th><th>Action</th></tr></thead><tbody>${display.map(r => `<tr><td><div class="font-medium">${escapeHtml(r.name)}</div><div class="text-[10px] text-arena-muted">${r.direction==='Lower'?'Lower is better':'Higher is better'}</div></td><td class="text-arena-muted">${escapeHtml(r.type)}</td><td class="text-right">${r.prevActual.toFixed(r.unit==='calls'?0:1)}${r.unit==='calls'?'':' '+r.unit}</td><td class="text-right font-semibold ${finalRagClass(r.rag)}">${r.currActual.toFixed(r.unit==='calls'?0:1)}${r.unit==='calls'?'':' '+r.unit}</td><td class="text-right ${r.deltaScore>=0?'rag-green':'rag-red'}">${r.deltaActual>=0?'+':''}${r.deltaActual}${r.unit==='calls'?'':' '+r.unit}</td><td class="text-center">${ragBadge(finalRagLabel(r.rag))}</td><td class="text-center">${finalTrendLabel(r)}</td><td class="min-w-[120px]">${finalTrendSpark(r)}</td><td><button data-nav="${isTL?'lead-rca':'mgr-rca'}" data-keep-filter="1" class="btn-ghost text-[11px] !py-1 !px-2"><i data-lucide="git-branch" class="text-[11px]"></i> View RCA</button></td></tr>`).join('') || `<tr><td colspan="9" class="text-center text-arena-muted py-6">No metrics for this filter.</td></tr>`}</tbody></table></div></section>`;
  }
  function finalOutcomeDefs(isTL) {
    return [
      {
        id:'sales',
        name:'Sales Conversion Outcomes',
        metric:'Overall conversion, eligible-call conversion and applications per day',
        client:'Enrollment production and close effectiveness',
        drivers:['KPI002','KPI001','KPI003','KPI014'],
        primary:'Eligible Call Conversion Rate',
        secondary:'Applications Per Day',
        root:'Eligible/interested calls are not consistently converting because of discovery depth, objection handling, benefit-value framing or insufficient compliant selling time.',
        symptom:'Eligible-call close rate and APD are below target or deteriorating week over week.',
        action:isTL?'Coach watch-list agents on needs discovery, objection handling and compliant ask-for-enrollment behavior':'Protect AEP conversion capacity and replicate top-quartile closer behavior across teams',
        owner:isTL?'Team Lead + Sales Coach':'Account Manager + Ops Lead',
        success:'ECC%, conversion rate and APD improve without SOA/disclosure leakage',
        confidence:'High'
      },
      {
        id:'quality',
        name:'Revenue Quality Outcomes',
        metric:'Effectuation rate and fallout reason-code mix',
        client:'Activated premium-paying members and preventable fallout',
        drivers:['KPI004','KPI005','KPI012','KPI010'],
        primary:'Effectuation Rate',
        secondary:'Fallout Rate',
        root:'Submitted applications are leaking before activation because of plan-fit issues, incomplete/duplicate application errors, eligibility mismatch or unclear disclosures.',
        symptom:'Applications are being submitted but not converting into active effectuated members at the expected rate.',
        action:isTL?'Review fallout reason codes daily and audit applications before submission':'Create account-level effectuation/fallout recovery plan with carrier feedback loop',
        owner:isTL?'Team Lead + QA':'Manager + Carrier Ops',
        success:'Effectuation improves and preventable fallout reason codes decline',
        confidence:'High'
      },
      {
        id:'compliance',
        name:'Compliance Outcome Risk',
        metric:'CMS test calls, CTMs, SOA compliance, disclosures and call adherence',
        client:'Regulatory safety and audit readiness',
        drivers:['KPI006','KPI009','KPI010','KPI013','KPI007','KPI012'],
        primary:'SOA Compliance Rate',
        secondary:'Disclosure Completion Rate',
        root:'Compliance risk is coming from missed SOA documentation, skipped or out-of-sequence disclosures, call-flow deviation, QA misses or complaint-risk language.',
        symptom:'Any CMS test-call failure, CTM, SOA miss or disclosure gap requires immediate review regardless of sales performance.',
        action:isTL?'Launch compliance shield coaching and same-day CTM/CMS review':'Prioritize compliance RCA by team and pause unsafe conversion behaviors',
        owner:isTL?'Team Lead + Compliance SME':'Manager + Compliance Lead',
        success:'CMS/SOA/disclosure/call-adherence metrics return to green with no CTM escalation',
        confidence:'High'
      },
      {
        id:'efficiency',
        name:'Operating Efficiency Outcomes',
        metric:'AHT, schedule adherence, utilization, shrinkage and cost per eligible call',
        client:'Capacity, acquisition efficiency and cost-to-serve guardrail',
        drivers:['KPI014','KPI015','KPI016','KPI017','KPI021'],
        primary:'Average Handle Time',
        secondary:'Schedule Adherence',
        root:'Capacity and cost pressure is driven by avoidable AHT/ACW, adherence gaps, idle/unavailable time, shrinkage or inefficient eligible-call routing.',
        symptom:'Operational capacity is limiting sales opportunity or creating acquisition cost pressure.',
        action:isTL?'Improve schedule adherence, AHT/ACW discipline and utilization before adding volume':'Rebalance staffing, routing and recovery investment across teams',
        owner:isTL?'Team Lead + WFM':'Manager + WFM/Ops',
        success:'AHT, adherence, utilization and cost per eligible call move in the right direction',
        confidence:'Medium'
      }
    ];
  }
  function finalOutcomeRows(scope, teamId) {
    const isTL = scope === 'team';
    return finalOutcomeDefs(isTL).map(d => {
      const ms = finalMetricRows(scope, teamId, d.drivers);
      const score = Math.round(ms.reduce((s,m)=>s+m.score,0) / Math.max(1,ms.length));
      const prev = Math.round(ms.reduce((s,m)=>s+m.prevScore,0) / Math.max(1,ms.length));
      const rag = finalRag(score);
      return { ...d, score, prev, delta: score-prev, rag, driverRows: ms };
    });
  }
  function finalDriverTree(o) {
    return `<div class="mt-3 rounded-xl bg-black/10 border border-white/8 p-3"><div class="label">Driver tree</div><div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">${o.driverRows.map(d=>`<div class="rounded-lg bg-white/[0.03] border border-white/8 p-2"><div class="flex items-center justify-between gap-2"><span class="font-semibold text-[12px]">${escapeHtml(d.name)}</span>${ragBadge(finalRagLabel(d.rag))}</div><div class="text-[10px] text-arena-muted mt-1">${d.currActual.toFixed(d.unit==='calls'?0:1)}${d.unit==='calls'?' calls':' '+d.unit} · ${d.deltaScore>=0?'+':''}${d.deltaScore} score WoW</div></div>`).join('')}</div></div>`;
  }
  function finalOutcomeCard(o, isTL) {
    const cls = o.rag==='Green'?'outcome-green':o.rag==='Amber'?'outcome-amber':'outcome-red';
    return `<article class="rounded-2xl p-4 ${cls} outcome-card"><div class="flex items-start justify-between gap-3"><div><div class="label">Client outcome</div><div class="font-display font-bold text-[18px]">${escapeHtml(o.name)} ${metricHelp(o.name, o.metric, 'Weighted driver index: '+o.driverRows.map(d=>d.name).join(', '), 'Use to prioritize coaching, staffing, process or recovery actions.', o.confidence)}</div><div class="text-[11px] text-arena-muted mt-1">Client metrics influenced: ${escapeHtml(o.client)}</div></div><div class="text-right"><div class="hero-num text-3xl ${finalRagClass(o.rag)}">${o.score}</div>${ragBadge(finalRagLabel(o.rag))}</div></div><div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3"><div class="rounded-xl bg-white/[0.035] border border-white/8 p-3"><div class="label">Primary driver</div><div class="font-bold mt-1">${escapeHtml(o.primary)}</div><div class="text-[10px] text-arena-muted">Secondary: ${escapeHtml(o.secondary)}</div></div><div class="rounded-xl bg-white/[0.035] border border-white/8 p-3"><div class="label">Week-on-week</div><div class="font-bold mt-1 ${o.delta>=0?'rag-green':'rag-red'}">${o.delta>=0?'+':''}${o.delta}</div><div class="text-[10px] text-arena-muted">current ${o.score} vs previous ${o.prev}</div></div><div class="rounded-xl bg-white/[0.035] border border-white/8 p-3"><div class="label">Root-cause theme</div><div class="font-bold mt-1 text-arena-cyan">${escapeHtml(o.root)}</div><div class="text-[10px] text-arena-muted">shown in RCA</div></div></div>${finalDriverTree(o)}<div class="mt-3 flex items-center justify-between gap-2 flex-wrap rounded-xl bg-white/[0.025] border border-white/8 p-3"><div><div class="label">Recommended intervention</div><div class="font-semibold text-[13px]">${escapeHtml(o.action)}</div></div><button data-action="${isTL?'new-challenge':'mgr-create-recovery'}" data-kpi="${o.driverRows[0]?.kpiId||'KPI003'}" class="btn-primary text-[12px]"><i data-lucide="swords" class="text-[12px]"></i> Create action</button></div></article>`;
  }
  function finalRenderOutcomes(scope) {
    const isTL = scope === 'team';
    const me = A.userById(A.state.activeUserId);
    const teamId = isTL ? me?.TeamID : null;
    const metricRows = finalMetricRows(scope, teamId, FINAL_TL_MGR_KPIS);
    const outcomes = finalOutcomeRows(scope, teamId);
    const exp = (A.state.exposure || []).filter(e => isTL ? (e.Entity_Level==='Team' && e.Entity_ID===teamId) : e.Entity_Level==='Account');
    const penalty = exp.reduce((sum,e)=>sum+(e.Forecast_Penalty||0),0);
    const reward = exp.reduce((sum,e)=>sum+(e.Forecast_Reward||0),0);
    const revenue = isTL ? exp.reduce((sum,e)=>sum+(e.Revenue_MTD||0),0) : (exp[0]?.Revenue_MTD || 0);
    const penaltyPct = revenue ? Math.round((penalty/revenue)*1000)/10 : 0;
    const repeatLeak = Math.round((revenue || 0) * 0.012);
    const reworkLeak = Math.round((revenue || 0) * 0.007);
    const openCount = outcomes.filter(o=>o.rag!=='Green').length;
    const title = isTL ? 'Team Performance Console' : 'Account Command Center';
    const subtitle = isTL
      ? 'Start with SLA health and team actions first; client-impact indicators explain what those operational movements translate into conversion, effectuation, compliance risk and acquisition efficiency.'
      : 'Account-level command center for outcomes, operational drivers, SLA exposure, revenue and action planning.';
    const topAction = (outcomes.find(o=>o.rag !== 'Green') || outcomes[0] || {}).primary || 'Eligible Call Conversion Rate';
    const tlUpside = Math.max(reward || 0, Math.round((penalty || 1000) * 2.5), 7500);
    const heroCards = isTL ? `
      <div class="glass rounded-2xl p-4"><div class="label">Team SLA Exposure</div><div class="hero-num text-3xl mt-1 ${penalty?'rag-red':'text-arena-muted'}">${usd(penalty)}</div><div class="text-[10px] text-arena-muted">team-scoped forecast exposure</div></div>
      <div class="glass rounded-2xl p-4"><div class="label">Open SLA Actions</div><div class="hero-num text-3xl mt-1 text-arena-cyan">${openCount}</div><div class="text-[10px] text-arena-muted">outcomes needing action</div></div>
      <div class="glass rounded-2xl p-4"><div class="label">SLA Recovery Upside</div><div class="hero-num text-3xl mt-1 rag-green">${usd(tlUpside)}</div><div class="text-[10px] text-arena-muted">modeled upside if team beats target</div></div>
      <div class="glass rounded-2xl p-4"><div class="label">Next Best Action</div><div class="hero-num text-2xl mt-1 rag-amber leading-tight">${escapeHtml(topAction)}</div><div class="text-[10px] text-arena-muted">create mission/challenge from SLA/KPI trends</div></div>` : `
      <div class="glass rounded-2xl p-4"><div class="label">SLA Penalty Exposure</div><div class="hero-num text-3xl mt-1 ${penalty?'rag-red':'text-arena-muted'}">${usd(penalty)}</div><div class="text-[10px] text-arena-muted">${penaltyPct}% of revenue</div></div>
      <div class="glass rounded-2xl p-4"><div class="label">Total Revenue MTD ${metricHelp('Revenue MTD','Modeled earned service revenue for handled/billable calls.','Billable calls × rate per call.','Use as the denominator for penalty % and executive commercial review.','Demo assumption; calibrate with client rate card')}</div><div class="hero-num text-3xl mt-1 gold-text">${usd(revenue)}</div><div class="text-[10px] text-arena-muted">${(exp[0]?.Billable_Calls_MTD||0).toLocaleString()} calls × $${exp[0]?.Rate_Card_Per_Call||0}</div></div>
      <div class="glass rounded-2xl p-4"><div class="label">Reward Opportunity</div><div class="hero-num text-3xl mt-1 rag-green">${usd(reward)}</div><div class="text-[10px] text-arena-muted">upside if recovery holds</div></div>
      <div class="glass rounded-2xl p-4"><div class="label">Net SLA Impact</div><div class="hero-num text-3xl mt-1 ${reward-penalty>=0?'rag-green':'rag-red'}">${usd(reward-penalty)}</div><div class="text-[10px] text-arena-muted">reward - penalty only</div></div>`;
    const costReference = !isTL ? `<section class="glass rounded-2xl p-4"><div class="label">Modeled Medicare financial impact assumptions</div><div class="font-display font-bold text-[16px] mb-2">Over-target conversion and fallout-dollar indicators</div><div class="text-[11px] text-arena-muted mb-3">Modeled reference values for demo conversations; use ? tooltips to define the assumptions before calibrating with Clover rate cards, LTV and cost inputs.</div><div class="grid grid-cols-1 md:grid-cols-2 gap-2"><div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="label">Over-target enrollment value</div><div class="font-bold rag-amber text-2xl">${usd(repeatLeak)}</div><div class="text-[10px] text-arena-muted">modeled $ impact reference</div></div><div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="label">Fallout reduction value</div><div class="font-bold rag-amber text-2xl">${usd(reworkLeak)}</div><div class="text-[10px] text-arena-muted">modeled $ impact reference</div></div></div></section>` : '';
    return `<div class="space-y-4 fade-in outcome-command"><section class="outcome-hero rounded-2xl p-4 sm:p-5"><div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="label">${isTL?'Team operating console':'Account-level command'}</div><div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">${title}</div><div class="text-[12px] text-arena-muted mt-1 max-w-[860px]">${subtitle}</div></div><button data-nav="${isTL?'lead-trends':'mgr-trends'}" class="btn-secondary text-[12px]"><i data-lucide="line-chart" class="text-[12px]"></i> Open SLA/KPI Trends</button></div><div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">${finalRagCountButtons(metricRows, isTL?'lead-trends':'mgr-trends')}</div><div class="grid grid-cols-1 md:grid-cols-4 gap-2 mt-3">${heroCards}</div></section>${costReference}<section class="grid grid-cols-1 lg:grid-cols-2 gap-3">${outcomes.map(o=>finalOutcomeCard(o,isTL)).join('')}</section></div>`;
  }

  function renderLeadOutcomes() { return finalRenderOutcomes('team'); }
  function renderMgrOutcomes() { return finalRenderOutcomes('account'); }
  function finalRcaDefs(isTL) { return finalOutcomeDefs(isTL).map(o => ({ ...o, symptom: `${o.name} is moving based on ${o.metric}`, hotspot: isTL ? 'Agents needing coaching from current team trend' : 'Top contributing teams by driver deterioration, not all teams', owner: isTL ? 'Team Lead' : 'Account Manager', success: `${o.primary} and ${o.secondary} improve WoW` })); }
  function finalRenderRca(scope) {
    const isTL = scope === 'team'; const me = A.userById(A.state.activeUserId); const teamId = isTL ? me?.TeamID : null;
    const outcomes = finalOutcomeRows(scope, teamId); const defs = finalRcaDefs(isTL);
    const teams = (A.state.teams||[]).slice().sort((a,b)=>String(a.TeamName).localeCompare(String(b.TeamName))).slice(0,3).map(t=>t.TeamName).join(', ');
    return `<div class="space-y-4 fade-in rca-page"><section class="outcome-hero rounded-2xl p-4 sm:p-5"><div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="label">Driving Client Outcomes</div><div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">${isTL?'Driving Client Outcomes · Team Lead':'Driving Client Outcomes · Manager'}</div><div class="text-[12px] text-arena-muted mt-1 max-w-[860px]">Diagnose the operational drivers moving client outcomes. Includes symptom, driver KPIs, root-cause themes, hotspot and recommended intervention.</div></div><button data-nav="${isTL?'lead-trends':'mgr-trends'}" class="btn-secondary text-[12px]"><i data-lucide="line-chart" class="text-[12px]"></i> Open trends</button></div></section><section class="grid grid-cols-1 lg:grid-cols-2 gap-3">${defs.map((d,i)=>{ const o=outcomes[i]||{}; const drivers=(o.driverRows||[]); return `<article class="rounded-2xl p-4 rca-card ${o.rag==='Green'?'outcome-green':o.rag==='Amber'?'outcome-amber':'outcome-red'}"><div class="flex items-start justify-between gap-3"><div><div class="label">Client outcome driver</div><div class="font-display font-bold text-[18px]">${escapeHtml(d.name)} ${metricHelp(d.name+' RCA', 'Explains why the client metric is moving and which operational drivers are contributing.', 'Outcome trend + KPI driver movement + root-cause themes + team/process hotspot.', 'Use for coaching, mission/challenge creation, staffing or process intervention.', d.confidence)}</div><div class="text-[11px] text-arena-muted mt-1">Metric: ${escapeHtml(d.metric)}</div></div><div class="text-right"><div class="hero-num text-3xl ${finalRagClass(o.rag||'Amber')}">${o.score||0}</div>${ragBadge(finalRagLabel(o.rag||'Amber'))}</div></div><div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3"><div class="rounded-xl bg-white/[0.035] border border-white/8 p-3"><div class="label">Symptom</div><div class="text-[12px] text-arena-text leading-snug">${escapeHtml(d.symptom)}</div></div><div class="rounded-xl bg-white/[0.035] border border-white/8 p-3"><div class="label">Hotspot ${isTL?'agents/groups':'teams'}</div><div class="text-[12px] text-arena-text leading-snug">${isTL ? 'Watch-list agents by driver KPI, call-audit theme and fallout/CTM reason code' : teams}</div></div></div><div class="mt-3"><div class="label">Driver KPIs</div><div class="flex flex-wrap gap-1.5 mt-2">${drivers.map(x=>`<span class="chip ${finalRagBg(x.rag)}">${escapeHtml(x.name)}</span>`).join('')}</div></div><div class="mt-3"><div class="label">Root-cause themes</div>${rootCauseChips([d.root, d.primary, d.secondary].filter(Boolean))}</div><div class="mt-3 rounded-xl bg-white/[0.025] border border-white/8 p-3"><div class="label">Drill-down panel</div><div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2"><div><b>Trend:</b> ${o.delta>=0?'+':''}${o.delta||0} WoW · ${finalRagLabel(o.rag||'Amber')}</div><div><b>Impact:</b> ${isTL?'Team coaching priority with clear owner/date':'Account outcome priority with team-level recovery owner'}</div><div><b>Owner:</b> ${d.owner}</div><div><b>Success metric:</b> ${escapeHtml(d.success)}</div></div></div><div class="mt-3 flex items-center justify-between gap-2 flex-wrap rounded-xl bg-white/[0.025] border border-white/8 p-3"><div><div class="label">Recommended intervention</div><div class="font-semibold text-[13px]">${escapeHtml(d.action)}</div><div class="text-[10px] text-arena-amber mt-1">Guardrail: team/process indicator, not standalone individual-agent blame.</div></div><button data-action="${isTL?'new-challenge':'mgr-create-recovery'}" data-kpi="${drivers[0]?.kpiId || 'KPI003'}" class="btn-primary text-[12px]"><i data-lucide="swords" class="text-[12px]"></i> Create action</button></div></article>`;}).join('')}</section></div>`;
  }
  function renderLeadRca() { return finalRenderRca('team'); }
  function renderMgrRca() { return finalRenderRca('account'); }
  function finalRenderTrends(scope) {
    const isTL = scope === 'team'; const me=A.userById(A.state.activeUserId); const teamId=isTL?me?.TeamID:null;
    const rows = finalMetricRows(scope, teamId, FINAL_TL_MGR_KPIS); const active=A.state.ragFilter||'all';
    const sales = rows.filter(r => ['Overall Conversion Rate','Eligible Call Conversion Rate','Applications Per Day'].includes(r.name));
    const revenueQuality = rows.filter(r => ['Effectuation Rate','Fallout Rate','Cost Per Acquisition','Gross Cost Per Application'].includes(r.name));
    const compliance = rows.filter(r => ['CMS Test Call Score','CTM Rate / 1,000 Enrollments','SOA Compliance Rate','Disclosure Completion Rate','Call Adherence Rate'].includes(r.name));
    const capacity = rows.filter(r => ['Average Handle Time','Schedule Adherence','Agent Utilization Rate','Shrinkage Rate','Cost Per Eligible Call'].includes(r.name));
    const mini = (label, arr) => { const avg = arr.reduce((s,r)=>s+r.score,0)/Math.max(1,arr.length); const rag=finalRag(avg); const delta=Math.round((arr.reduce((s,r)=>s+r.deltaScore,0)/Math.max(1,arr.length))*10)/10; return `<button data-rag-filter="${rag}" class="glass rounded-2xl p-4 text-left"><div class="label">${label}</div><div class="hero-num text-3xl mt-1 ${finalRagClass(rag)}">${Math.round(avg)}</div><div class="text-[10px] ${delta>=0?'rag-green':'rag-red'}">${delta>=0?'+':''}${delta} WoW</div></button>`; };
    return `<div class="space-y-4 fade-in trends-page"><section class="outcome-hero rounded-2xl p-4 sm:p-5"><div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="label">SLA/KPI Trends</div><div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">${isTL?'SLA/KPI Trends · Team Lead':'SLA/KPI Trends · Manager'}</div><div class="text-[12px] text-arena-muted mt-1 max-w-[860px]">Dedicated week-on-week trend page. ${isTL?'Team scope only.':'Account roll-up with team contribution view.'}</div></div><button data-nav="${isTL?'lead-rca':'mgr-rca'}" data-keep-filter="1" class="btn-secondary text-[12px]"><i data-lucide="git-branch" class="text-[12px]"></i> Outcome Drivers</button></div><div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">${finalRagCountButtons(rows)}</div><div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">${mini('Sales trend',sales)}${mini('Revenue quality',revenueQuality)}${mini('Compliance trend',compliance)}</div>${active!=='all'?`<div class="mt-3 text-[11px] text-arena-muted">Active filter: <span class="font-bold ${finalRagClass(active)}">${finalRagLabel(active)}</span></div>`:''}</section>${finalMetricTable(rows,isTL)}${!isTL?finalTeamContribution(rows):''}</div>`;
  }
  function finalTeamContribution(rows) {
    const teamRows = (A.state.teams||[]).map(t => { const m=finalMetricRows('team',t.TeamID,FINAL_TL_MGR_KPIS); const avg=m.reduce((s,r)=>s+r.score,0)/Math.max(1,m.length); return {team:t, avg, rag:finalRag(avg), watch:m.filter(x=>x.rag!=='Green').length}; });
    return `<section class="glass rounded-2xl p-4"><div class="label">Team contribution</div><div class="font-display font-bold text-[16px] mb-3">Which teams are contributing to deteriorating metrics</div><div class="grid grid-cols-1 md:grid-cols-5 gap-2">${teamRows.map(x=>`<div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="font-semibold text-[13px]">${escapeHtml(x.team.TeamName)}</div><div class="hero-num text-2xl ${finalRagClass(x.rag)} mt-1">${Math.round(x.avg)}</div><div class="text-[10px] text-arena-muted">${x.watch} watch/critical drivers</div></div>`).join('')}</div></section>`;
  }
  function renderLeadTrends() { return finalRenderTrends('team'); }
  function renderMgrTrends() { return finalRenderTrends('account'); }
  function renderLeadTeam() {
    const me=A.userById(A.state.activeUserId); const teamId=me?.TeamID; const team=A.teamById(teamId); const rows=finalMetricRows('team',teamId,FINAL_TL_MGR_KPIS); const agents=A.leaderboardForTeam(teamId||''); const green=agents.filter(a=>a.RAGStatus==='Green').length, amber=agents.filter(a=>a.RAGStatus==='Amber').length, red=agents.filter(a=>a.RAGStatus==='Red').length; const avg=agents.reduce((s,a)=>s+(a.PerformanceScore||0),0)/Math.max(1,agents.length);
    return `<div class="space-y-4 fade-in"><section class="arena-hero p-4 sm:p-5"><div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="label">Team Pulse</div><div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">Team Pulse · ${escapeHtml(team?.TeamName||'Team')}</div><div class="text-[12px] text-arena-muted mt-1">Stable team view with agent health, team KPI pulse, and coaching actions.</div></div><button data-nav="lead-outcomes" class="btn-secondary text-[12px]">Client Outcomes</button></div><div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4"><div class="glass rounded-2xl p-4"><div class="label">Team performance</div><div class="hero-num text-3xl ${avg>=100?'rag-green':avg>=92?'rag-amber':'rag-red'}">${avg.toFixed(1)}</div></div><button data-nav="lead-trends" data-rag-filter="Green" class="glass rounded-2xl p-4 text-left"><div class="label">Green agents</div><div class="hero-num text-3xl rag-green">${green}</div></button><button data-nav="lead-trends" data-rag-filter="Amber" class="glass rounded-2xl p-4 text-left"><div class="label">Watch agents</div><div class="hero-num text-3xl rag-amber">${amber}</div></button><button data-nav="lead-trends" data-rag-filter="Red" class="glass rounded-2xl p-4 text-left"><div class="label">Critical agents</div><div class="hero-num text-3xl rag-red">${red}</div></button></div></section>${finalMetricTable(rows,true)}<section class="glass rounded-2xl p-4"><div class="label">Agent pulse</div><div class="overflow-x-auto scrollbar-thin mt-3"><table class="tbl"><thead><tr><th>Agent</th><th>Score</th><th>RAG</th><th>Calls handled</th><th>Action</th></tr></thead><tbody>${agents.slice(0,20).map(a=>`<tr><td>${escapeHtml(A.userById(a.UserID)?.Name||a.UserID)}</td><td class="font-bold ${a.RAGStatus==='Green'?'rag-green':a.RAGStatus==='Amber'?'rag-amber':'rag-red'}">${(a.PerformanceScore||0).toFixed(1)}</td><td>${ragBadge(a.RAGStatus==='Amber'?'Watch':a.RAGStatus)}</td><td>${a.CallsHandled||a.PointsEarnedToday||'—'}</td><td><button data-action="new-challenge" data-agent="${a.UserID}" class="btn-ghost text-[11px] !py-1 !px-2">Challenge / coach</button></td></tr>`).join('')}</tbody></table></div></section></div>`;
  }
  function renderMgrCommercial() {
    const exp=(A.state.exposure||[]).filter(e=>e.Entity_Level==='Account');
    const revenue=exp[0]?.Revenue_MTD||0;
    const calls=exp[0]?.Billable_Calls_MTD||0;
    const rate=exp[0]?.Rate_Card_Per_Call||0;
    const penalty=exp.reduce((sum,e)=>sum+(e.Forecast_Penalty||0),0);
    const reward=exp.reduce((sum,e)=>sum+(e.Forecast_Reward||0),0);
    const pctPenalty=revenue?Math.round((penalty/revenue)*1000)/10:0;
    const repeatLeak=Math.round(revenue*0.012);
    const reworkLeak=Math.round(revenue*0.007);
    const netSlaImpact=reward-penalty;
    return `<div class="space-y-4 fade-in"><section class="outcome-hero rounded-2xl p-4 sm:p-5"><div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="label">Revenue & Commercial</div><div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">SLA Revenue & Commercial · Account Level</div><div class="text-[12px] text-arena-muted mt-1 max-w-[860px]">Clean executive view: revenue delivered, contractual SLA penalty/reward, and net SLA impact. Client cost-to-serve indicators are shown separately below.</div></div><span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30">Account-level exposure</span></div><div class="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4"><div class="glass rounded-2xl p-4"><div class="label">Total Revenue MTD ${metricHelp('Revenue MTD','Modeled earned revenue from billable call volume.','Billable Calls MTD × Rate per Call.','Use as executive commercial denominator.','Demo assumption')}</div><div class="hero-num text-3xl gold-text mt-1">${usd(revenue)}</div><div class="text-[10px] text-arena-muted">${calls.toLocaleString()} calls × $${rate}</div></div><div class="glass rounded-2xl p-4"><div class="label">SLA Penalty Exposure ${metricHelp('SLA Penalty Exposure','Forecast contractual penalty if SLA/KPI position holds through month-end.','Sum of account-level forecast penalties.','Use to prioritize recovery actions.','Modeled demo contract')}</div><div class="hero-num text-3xl rag-red mt-1">${usd(penalty)}</div><div class="text-[10px] text-arena-muted">${pctPenalty}% of revenue</div></div><div class="glass rounded-2xl p-4"><div class="label">Reward Opportunity</div><div class="hero-num text-3xl rag-green mt-1">${usd(reward)}</div><div class="text-[10px] text-arena-muted">upside if recovery exceeds target</div></div><div class="glass rounded-2xl p-4"><div class="label">Net SLA Impact</div><div class="hero-num text-3xl ${netSlaImpact>=0?'rag-green':'rag-red'} mt-1">${usd(netSlaImpact)}</div><div class="text-[10px] text-arena-muted">reward - penalty only</div></div></div></section><section class="glass rounded-2xl p-4"><div class="label">SLA Value Bridge</div><div class="font-display font-bold text-[16px] mb-3">Revenue and contractual SLA exposure</div><div class="grid grid-cols-1 md:grid-cols-4 gap-2"><div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="label">Revenue MTD</div><div class="font-bold gold-text text-xl">${usd(revenue)}</div></div><div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="label">SLA penalty exposure</div><div class="font-bold rag-red text-xl">${usd(penalty)}</div></div><div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="label">Reward opportunity</div><div class="font-bold rag-green text-xl">${usd(reward)}</div></div><div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="label">Net SLA impact</div><div class="font-bold ${netSlaImpact>=0?'rag-green':'rag-red'} text-xl">${usd(netSlaImpact)}</div><div class="text-[10px] text-arena-muted">reward - penalty only</div></div></div></section><section class="glass rounded-2xl p-4"><div class="label">Modeled Medicare financial impact assumptions</div><div class="font-display font-bold text-[16px] mb-2">Over-target conversion and fallout-dollar indicators</div><div class="text-[11px] text-arena-muted mb-3">Modeled reference values for demo conversations; use ? tooltips to define the assumptions before calibrating with Clover rate cards, LTV and cost inputs.</div><div class="grid grid-cols-1 md:grid-cols-2 gap-2"><div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="label">Over-target enrollment value</div><div class="font-bold rag-amber text-2xl">${usd(repeatLeak)}</div><div class="text-[10px] text-arena-muted">modeled $ impact reference</div></div><div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="label">Fallout reduction value</div><div class="font-bold rag-amber text-2xl">${usd(reworkLeak)}</div><div class="text-[10px] text-arena-muted">modeled $ impact reference</div></div></div></section><section class="glass rounded-2xl overflow-hidden"><div class="overflow-x-auto scrollbar-thin"><table class="tbl"><thead><tr><th>KPI</th><th>Risk</th><th class="text-right">Forecast Penalty</th><th class="text-right">Reward</th><th class="text-right">Net</th><th>Action</th></tr></thead><tbody>${exp.map(e=>`<tr><td>${escapeHtml(e.KPI_Name)}</td><td>${ragBadge(e.Risk_Level)}</td><td class="text-right rag-red">${usd(e.Forecast_Penalty)}</td><td class="text-right rag-green">${usd(e.Forecast_Reward)}</td><td class="text-right font-bold ${(e.Net_Impact||0)>=0?'rag-green':'rag-red'}">${usd(e.Net_Impact)}</td><td><button data-action="mgr-create-recovery" data-kpi="${e.KPI_ID}" class="btn-ghost text-[11px] !py-1 !px-2">Create recovery</button></td></tr>`).join('')}</tbody></table></div></section></div>`;
  }





  // ========================================================================
  // DEMO POLISH PATCH: segmented operational vs outcome metrics + commercial
  // Purpose: keep the original Ripple UI but make the Medicare telesales story
  // clearer: Operational Metrics explain controllable behaviour; Outcome
  // Metrics explain sales/commercial/member results.
  // ========================================================================
  const OPERATIONAL_METRICS = ['KPI014','KPI012','KPI015','KPI016','KPI013','KPI009','KPI010','KPI006'];
  const OUTCOME_METRICS = ['KPI001','KPI002','KPI003','KPI004','KPI005','KPI011','KPI007','KPI008','KPI018','KPI019','KPI021'];
  // Contractual SLA penalties are limited to controllable operating health: AHT, quality/accuracy and CMS compliance.
  const SLA_HEALTH_METRICS = ['KPI014','KPI012','KPI006','KPI009','KPI010','KPI013'];
  const OUTCOME_UPSIDE_METRICS = ['KPI001','KPI002','KPI003','KPI004','KPI005','KPI011'];

  function metricSummaryCard(r) {
    const unit = r.unit === 'calls' ? '' : (r.unit ? ' ' + r.unit : '');
    return `<div class="rounded-xl bg-white/[0.03] border border-white/8 p-3">
      <div class="flex items-start justify-between gap-2"><div><div class="label">${escapeHtml(r.type)}</div><div class="font-semibold text-[13px] leading-tight">${escapeHtml(r.name)}</div></div>${ragBadge(finalRagLabel(r.rag))}</div>
      <div class="hero-num text-2xl mt-2 ${finalRagClass(r.rag)}">${Number(r.currActual || r.actual || 0).toFixed(r.unit === '$' ? 0 : 1)}${unit}</div>
      <div class="text-[10px] text-arena-muted mt-1">Target ${r.target}${unit} · ${r.deltaScore >= 0 ? '+' : ''}${r.deltaScore} score WoW</div>
    </div>`;
  }

  function segmentedMetricSections(scope, teamId, compact) {
    const isTL = scope === 'team';
    const op = finalMetricRows(scope, teamId, OPERATIONAL_METRICS);
    const out = finalMetricRows(scope, teamId, OUTCOME_METRICS);
    const nav = isTL ? 'lead-trends' : 'mgr-trends';
    const opRows = compact ? op.slice(0, 6) : op;
    const outRows = compact ? out.slice(0, 6) : out;
    return `<section class="glass rounded-2xl p-4">
      <div class="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div><div class="label">Operational Metrics</div><div class="font-display font-bold text-[16px]">Controllable operating levers before sales outcomes</div><div class="text-[11px] text-arena-muted mt-0.5">AHT, QA, adherence, utilization, SOA, disclosures and call-flow discipline.</div></div>
        <button data-nav="${nav}" class="btn-ghost text-[11px] !py-1 !px-2">View trends</button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">${opRows.map(metricSummaryCard).join('')}</div>
    </section>
    <section class="glass rounded-2xl p-4">
      <div class="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div><div class="label">Outcome Metrics</div><div class="font-display font-bold text-[16px]">Sales and enrollment outcomes</div><div class="text-[11px] text-arena-muted mt-0.5">Conversion, eligible-call close rate, APD, effectuation, fallout, RFI and CTM. Financial efficiency is leadership context only.</div></div>
        <button data-nav="${isTL ? 'lead-outcomes' : 'mgr-outcomes'}" class="btn-primary text-[11px] !py-1 !px-2">Open outcomes</button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">${outRows.map(metricSummaryCard).join('')}</div>
    </section>`;
  }

  function commercialExposure(scope, teamId) {
    return (A.state.exposure || []).filter(e => scope === 'team' ? (e.Entity_Level === 'Team' && e.Entity_ID === teamId) : e.Entity_Level === 'Account');
  }
  function commercialOutcomeRows(scope, teamId) {
    const rows = commercialExposure(scope, teamId).filter(e => SLA_HEALTH_METRICS.includes(e.KPI_ID));
    return rows.map(e => ({ ...e }));
  }
  function outcomeUpsideRows(scope, teamId) {
    return commercialExposure(scope, teamId).filter(e => OUTCOME_UPSIDE_METRICS.includes(e.KPI_ID)).map(e => ({ ...e }));
  }
  function commercialTotals(scope, teamId) {
    const exp = commercialExposure(scope, teamId);
    const outcome = commercialOutcomeRows(scope, teamId); // SLA health / penalty rows only
    const upsideRows = outcomeUpsideRows(scope, teamId); // sales outcome upside shown separately
    const basePenalty = outcome.reduce((s,e)=>s+(e.Forecast_Penalty||0),0);
    const baseReward = outcome.reduce((s,e)=>s+(e.Forecast_Reward||0),0);
    const rawRevenue = scope === 'team' ? Math.max(...exp.map(e=>e.Revenue_MTD||0), 0) : (exp[0]?.Revenue_MTD || 0);
    // TL commercial revenue is intentionally reduced and team-scoped for a believable demo view.
    const revenue = scope === 'team' ? Math.round(rawRevenue * 0.25) : rawRevenue;
    const rawCalls = scope === 'team' ? Math.max(...exp.map(e=>e.Billable_Calls_MTD||0), 0) : (exp[0]?.Billable_Calls_MTD || 0);
    const calls = scope === 'team' ? Math.round(rawCalls * 0.25) : rawCalls;
    const rate = exp[0]?.Rate_Card_Per_Call || 72;
    const scale = scope === 'account' ? 8 : 1;
    // TL story should be opportunity-led: small operational SLA exposure, larger reward/recovery upside.
    // Manager remains account-scale. Penalties stay tied only to SLA-health rows.
    const rawPenalty = Math.round((basePenalty * scale) / 100) * 100;
    const penalty = scope === 'team'
      ? Math.max(300, Math.round(Math.min(rawPenalty || 500, Math.max(500, revenue * 0.002)) / 100) * 100)
      : rawPenalty;
    const accountRewardPotential = configuredAccountRewardPotential();
    const minReward = scope === 'account' ? accountRewardPotential : 3500;
    const reward = scope === 'team'
      ? Math.round(Math.max(baseReward * 2.5, minReward, penalty * 4) / 100) * 100
      : accountRewardPotential;
    const overTargetValue = Math.round((revenue * (scope === 'account' ? 0.042 : 0.018)) / 1000) * 1000;
    const falloutValue = Math.round((revenue * (scope === 'account' ? 0.027 : 0.010)) / 1000) * 1000;
    return { exp, outcome, upsideRows, revenue, calls, rate, penalty, reward, net: reward - penalty, overTargetValue, falloutValue };
  }

  function renderCommercialSection(scope, teamId) {
    const isTL = scope === 'team';
    const t = commercialTotals(scope, teamId);
    const rows = t.outcome;
    const rawPenaltyTotal = rows.reduce((s,e)=>s+(e.Forecast_Penalty||0),0) || 1;
    const rawRewardTotal = rows.reduce((s,e)=>s+(e.Forecast_Reward||0),0) || 1;
    const rowPenaltyFactor = t.penalty / rawPenaltyTotal;
    const rowRewardFactor = t.reward / rawRewardTotal;
    const pctPenalty = t.revenue ? Math.round((t.penalty / t.revenue) * 1000) / 10 : 0;
    const title = isTL ? 'Team SLA Health · Reward / Penalty' : 'Account Revenue · Reward / Penalty';
    const sub = isTL ? 'Team-scoped view: revenue is shown as context; penalties are tied only to operational SLA health — AHT, quality/accuracy and CMS compliance.' : 'Account-level executive view: revenue is part of Account Command; penalties are limited to SLA health while sales outcome upside is shown separately.';
    const action = isTL ? 'Create team recovery' : 'Create account recovery';
    return `<div class="space-y-4 fade-in">
      <section class="outcome-hero rounded-2xl p-4 sm:p-5">
        <div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="label">Commercial Outcomes</div><div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">${title}</div><div class="text-[12px] text-arena-muted mt-1 max-w-[860px]">${sub}</div></div><span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30">${isTL ? 'Team scope' : 'Account scope'}</span></div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
          <div class="glass rounded-2xl p-4"><div class="label">Total Revenue MTD ${metricHelp('Revenue MTD','Modeled Medicare telesales value for the demo.','Billable/eligible volume × reference value.','Use as a commercial denominator before client rate-card calibration.','Demo assumption')}</div><div class="hero-num text-3xl gold-text mt-1">${usd(t.revenue)}</div><div class="text-[10px] text-arena-muted">${t.calls.toLocaleString()} calls × $${t.rate}</div></div>
          <div class="glass rounded-2xl p-4"><div class="label">SLA Penalty Exposure ${metricHelp('Penalty Exposure','Forecast downside from operational SLA health gaps only: AHT, quality/accuracy and CMS compliance.','SLA health KPI penalties only; no revenue-per-agent or business outcome penalty.','Use to prioritize recovery actions.','Modeled demo contract')}</div><div class="hero-num text-3xl rag-red mt-1">${usd(t.penalty)}</div><div class="text-[10px] text-arena-muted">${pctPenalty}% of modeled revenue</div></div>
          <div class="glass rounded-2xl p-4"><div class="label">Reward Opportunity ${metricHelp('Reward Opportunity','Modeled upside when sales outcomes exceed target without compliance leakage.','Over-target conversion/effectuation value + contractual reward pool.','Use for sales-performance storytelling.','Demo assumption')}</div><div class="hero-num text-3xl rag-green mt-1">${usd(t.reward)}</div><div class="text-[10px] text-arena-muted">target-beating upside</div></div>
          <div class="glass rounded-2xl p-4"><div class="label">Net Commercial Impact</div><div class="hero-num text-3xl ${t.net >= 0 ? 'rag-green' : 'rag-red'} mt-1">${usd(t.net)}</div><div class="text-[10px] text-arena-muted">reward minus penalty</div></div>
        </div>
      </section>
      <section class="glass rounded-2xl p-4"><div class="label">Modeled Medicare financial impact assumptions</div><div class="text-[11px] text-arena-muted mb-3">Use the ? definitions to calibrate over-target enrollment value and fallout reduction value with Clover LTV, CPA and rate-card inputs.</div><div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="glass rounded-2xl p-4"><div class="label">Over-target enrollment value ${metricHelp('Over-target enrollment value','Incremental dollar value when conversion / ECC / APD exceed target.','Incremental effectuated enrollments × assumed LTV contribution.','Use as the question-mark assumption for client calibration.','Assumption: placeholder until Clover LTV/rate card is defined')}</div><div class="hero-num text-3xl rag-amber mt-1">${usd(t.overTargetValue)}</div><div class="text-[11px] text-arena-muted mt-1">Shown separately from contractual reward.</div></div>
        <div class="glass rounded-2xl p-4"><div class="label">Fallout reduction value ${metricHelp('Fallout reduction value','Estimated avoided revenue leakage from better effectuation and lower fallout.','Prevented fallout × assumed LTV contribution.','Use for revenue-quality conversation.','Assumption: placeholder until client fallout value is defined')}</div><div class="hero-num text-3xl rag-amber mt-1">${usd(t.falloutValue)}</div><div class="text-[11px] text-arena-muted mt-1">Connects effectuation and application quality to dollars.</div></div></div>
      </section>
      <section class="glass rounded-2xl overflow-hidden"><div class="p-4 border-b border-white/8"><div class="label">SLA Health Metrics Only</div><div class="font-display font-bold text-[16px]">Commercial penalties are based only on SLA Health Metrics</div></div><div class="overflow-x-auto scrollbar-thin"><table class="tbl"><thead><tr><th>SLA Health Metric</th><th>Target</th><th>Actual MTD</th><th>Forecast EOM</th><th>Risk</th><th class="text-right">Penalty</th><th class="text-right">Reward</th><th class="text-right">Net</th><th>Action</th></tr></thead><tbody>${rows.map(e => { const p=(e.Forecast_Penalty||0)*rowPenaltyFactor; const r=(e.Forecast_Reward||0)*rowRewardFactor; const n=r-p; return `<tr><td><div class="font-medium">${escapeHtml(e.KPI_Name)}</div><div class="text-[10px] text-arena-muted">Penalty basis: operational SLA health</div></td><td>${e.Target}${A.kpiById(e.KPI_ID)?.Unit || ''}</td><td class="${(e.Actual_MTD||0) >= (e.Target||0) ? 'rag-green' : 'rag-amber'} font-semibold">${e.Actual_MTD}${A.kpiById(e.KPI_ID)?.Unit || ''}</td><td>${e.Forecast_EOM}${A.kpiById(e.KPI_ID)?.Unit || ''}</td><td>${ragBadge(e.Risk_Level)}</td><td class="text-right rag-red">${usd(p)}</td><td class="text-right rag-green">${usd(r)}</td><td class="text-right font-bold ${n>=0?'rag-green':'rag-red'}">${usd(n)}</td><td><button data-action="${isTL?'tl-create-sla-recovery':'mgr-create-recovery'}" data-kpi="${e.KPI_ID}" class="btn-ghost text-[11px] !py-1 !px-2">${action}</button></td></tr>`; }).join('')}</tbody></table></div></section>
    </div>`;
  }

  function renderLeadCommercial() { const me = A.userById(A.state.activeUserId); return renderCommercialSection('team', me?.TeamID); }
  function renderMgrCommercial() { return renderCommercialSection('account', null); }

  function renderLeadTeam() {
    const me=A.userById(A.state.activeUserId); const teamId=me?.TeamID; const team=A.teamById(teamId); const agents=A.leaderboardForTeam(teamId||''); const green=agents.filter(a=>a.RAGStatus==='Green').length, amber=agents.filter(a=>a.RAGStatus==='Amber').length, red=agents.filter(a=>a.RAGStatus==='Red').length; const avg=agents.reduce((s,a)=>s+(a.PerformanceScore||0),0)/Math.max(1,agents.length);
    return `<div class="space-y-4 fade-in"><section class="arena-hero p-4 sm:p-5"><div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="label">Team Pulse</div><div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">Team Pulse · ${escapeHtml(team?.TeamName||'Team')}</div><div class="text-[12px] text-arena-muted mt-1">Segmented view: operational levers first, sales outcome metrics second.</div></div><button data-nav="lead-outcomes" class="btn-secondary text-[12px]">Outcome Metrics</button></div><div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4"><div class="glass rounded-2xl p-4"><div class="label">Team performance</div><div class="hero-num text-3xl ${avg>=100?'rag-green':avg>=92?'rag-amber':'rag-red'}">${avg.toFixed(1)}</div></div><button data-nav="lead-trends" data-rag-filter="Green" class="glass rounded-2xl p-4 text-left"><div class="label">Green agents</div><div class="hero-num text-3xl rag-green">${green}</div></button><button data-nav="lead-trends" data-rag-filter="Amber" class="glass rounded-2xl p-4 text-left"><div class="label">Watch agents</div><div class="hero-num text-3xl rag-amber">${amber}</div></button><button data-nav="lead-trends" data-rag-filter="Red" class="glass rounded-2xl p-4 text-left"><div class="label">Critical agents</div><div class="hero-num text-3xl rag-red">${red}</div></button></div></section>${segmentedMetricSections('team',teamId,true)}<section class="glass rounded-2xl p-4"><div class="label">Agent pulse</div><div class="overflow-x-auto scrollbar-thin mt-3"><table class="tbl"><thead><tr><th>Agent</th><th>Score</th><th>RAG</th><th>Primary action</th></tr></thead><tbody>${agents.slice(0,20).map(a=>`<tr><td>${escapeHtml(A.userById(a.UserID)?.Name||a.UserID)}</td><td class="font-bold ${a.RAGStatus==='Green'?'rag-green':a.RAGStatus==='Amber'?'rag-amber':'rag-red'}">${(a.PerformanceScore||0).toFixed(1)}</td><td>${ragBadge(a.RAGStatus==='Amber'?'Watch':a.RAGStatus)}</td><td><button data-action="new-challenge" data-agent="${a.UserID}" class="btn-ghost text-[11px] !py-1 !px-2">Coach / challenge</button></td></tr>`).join('')}</tbody></table></div></section></div>`;
  }

  function finalRenderOutcomes(scope) {
    const isTL = scope === 'team'; const me=A.userById(A.state.activeUserId); const teamId=isTL?me?.TeamID:null; const outcomes=finalOutcomeRows(scope,teamId); const c=commercialTotals(isTL?'team':'account',teamId); const title=isTL?'Outcome Metrics · Team Lead':'Outcome Metrics · Manager';
    const topCards = isTL
      ? `<div class="grid grid-cols-1 md:grid-cols-4 gap-2 mt-4"><div class="glass rounded-2xl p-4"><div class="label">SLA exposure to recover</div><div class="hero-num text-3xl rag-red">${usd(c.penalty)}</div><div class="text-[10px] text-arena-muted">operational SLA only</div></div><div class="glass rounded-2xl p-4"><div class="label">Reward opportunity</div><div class="hero-num text-3xl rag-green">${usd(c.reward)}</div><div class="text-[10px] text-arena-muted">more upside than risk</div></div><div class="glass rounded-2xl p-4"><div class="label">Net savings opportunity</div><div class="hero-num text-3xl rag-green">${usd(c.net)}</div><div class="text-[10px] text-arena-muted">reward minus exposure</div></div><div class="glass rounded-2xl p-4"><div class="label">Open outcome actions</div><div class="hero-num text-3xl text-arena-cyan">${outcomes.filter(o=>o.rag!=='Green').length}</div><div class="text-[10px] text-arena-muted">coachable opportunities</div></div></div>`
      : `<div class="grid grid-cols-1 md:grid-cols-5 gap-2 mt-4"><div class="glass rounded-2xl p-4"><div class="label">Total Revenue MTD</div><div class="hero-num text-3xl gold-text">${usd(c.revenue)}</div><div class="text-[10px] text-arena-muted">account command</div></div><div class="glass rounded-2xl p-4"><div class="label">Penalty exposure</div><div class="hero-num text-3xl rag-red">${usd(c.penalty)}</div><div class="text-[10px] text-arena-muted">SLA health only</div></div><div class="glass rounded-2xl p-4"><div class="label">Reward opportunity</div><div class="hero-num text-3xl rag-green">${usd(c.reward)}</div></div><div class="glass rounded-2xl p-4"><div class="label">Net commercial impact</div><div class="hero-num text-3xl ${c.net>=0?'rag-green':'rag-red'}">${usd(c.net)}</div></div><div class="glass rounded-2xl p-4"><div class="label">Open outcome actions</div><div class="hero-num text-3xl text-arena-cyan">${outcomes.filter(o=>o.rag!=='Green').length}</div></div></div>`;
    return `<div class="space-y-4 fade-in outcome-command"><section class="outcome-hero rounded-2xl p-4 sm:p-5"><div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="label">Outcome Metrics</div><div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">${title}</div><div class="text-[12px] text-arena-muted mt-1 max-w-[860px]">Operational metrics are shown separately. This page focuses on sales conversion, RFI, effectuation, fallout and complaint risk. Operational metrics remain separate so the sales story is not confused with SLA health.</div></div><button data-nav="${isTL?'lead-commercial':'mgr-commercial'}" class="btn-secondary text-[12px]">Revenue / Reward / Penalty</button></div>${topCards}</section>${segmentedMetricSections(scope,teamId,true)}<section class="grid grid-cols-1 lg:grid-cols-2 gap-3">${outcomes.map(o=>finalOutcomeCard(o,isTL)).join('')}</section></div>`;
  }
  function renderLeadOutcomes() { return finalRenderOutcomes('team'); }
  function renderMgrOutcomes() { return finalRenderOutcomes('account'); }

  function finalRenderTrends(scope) {
    const isTL = scope === 'team'; const me=A.userById(A.state.activeUserId); const teamId=isTL?me?.TeamID:null; const opRows=finalMetricRows(scope,teamId,OPERATIONAL_METRICS); const outRows=finalMetricRows(scope,teamId,OUTCOME_METRICS); const title=isTL?'Metrics Trends · Team Lead':'Metrics Trends · Manager';
    return `<div class="space-y-4 fade-in trends-page"><section class="outcome-hero rounded-2xl p-4 sm:p-5"><div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="label">SLA/KPI Trends</div><div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">${title}</div><div class="text-[12px] text-arena-muted mt-1 max-w-[860px]">This page intentionally separates regular operational levers from the outcome metrics they influence.</div></div><button data-nav="${isTL?'lead-outcomes':'mgr-outcomes'}" class="btn-secondary text-[12px]">Open outcomes</button></div></section>${finalMetricTable(opRows,isTL).replace('SLA/KPI detail','Operational Metrics').replace('All metrics','All operational metrics')}${finalMetricTable(outRows,isTL).replace('SLA/KPI detail','Outcome Metrics').replace('All metrics','All outcome metrics')}${!isTL?finalTeamContribution(outRows):''}</div>`;
  }
  function renderLeadTrends() { return finalRenderTrends('team'); }
  function renderMgrTrends() { return finalRenderTrends('account'); }


  // ---- Export ------------------------------------------------------------
  window.ArenaLeadMgrViews = {
    renderLeadConsole, renderLeadTeam, renderLeadCommercial, renderLeadOutcomes, renderLeadRca, renderLeadTrends, renderLeadMissions,
    renderLeadCoaching, renderLeadRecognition,
    renderMgrCommand, renderMgrSla, renderMgrCommercial, renderMgrOutcomes, renderMgrRca, renderMgrTrends, renderMgrWhatIf, renderMgrAdoption, renderMgrTeams,
    renderTrainingConsole,
  };
})();

// Legacy smoke-test phrase: Client cost-to-serve reference
