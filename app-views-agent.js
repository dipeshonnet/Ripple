/* eslint-disable */
// Performance Arena — Agent views
// Home (hero), Scorecard, Missions, Challenges, Leaderboard, Training, Store, Profile

(function () {
  const A = window.Arena;
  if (!A) { console.error('Arena core not loaded'); return; }

  const H = window.ArenaAgentViewHelpers;
  const Home = window.ArenaAgentHomeViews;
  if (!H || !Home) { console.error('Arena agent view modules not loaded'); return; }

  const {
    escapeHtml, avatarHex, xpRing, sparkline, priorityChip, ragChip,
    agentDisplayRow, visibleTodayRowsForUser, dueLabel, rewardIcon,
  } = H;
  const renderHome = Home.renderHome;

  function kpiSuggestion(kpiId, status) {
    const kpi = A.kpiById(kpiId) || {};
    const key = (status || 'amber').toLowerCase();
    const configured = kpi[`Coach_${key}`]
      || kpi[`Suggestion_${key}`]
      || kpi[`Next_Best_Action_${key}`]
      || kpi.Next_Best_Action
      || kpi.Coaching_Guidance;
    if (configured) return configured;
    const name = kpi.KPI_Name || 'this KPI';
    if (key === 'green') return `Keep protecting ${name} while maintaining compliance guardrails.`;
    if (key === 'red') return `Prioritize ${name} recovery with your TL before the next interval.`;
    return `Watch ${name} and use the next-best action from your scorecard.`;
  }

  function teamAvgKpi(teamId, kpiId, date) {
    const rows = A.state.performance.filter(p => p.TeamID === teamId && p.KPI_ID === kpiId && p.Date === date);
    if (!rows.length) return null;
    return rows.reduce((s, r) => s + (r.Actual || 0), 0) / rows.length;
  }

  function kpiTrendVsYesterday(userId, kpiId) {
    const rows = A.performanceByUserKpi(userId, kpiId).slice(-2);
    if (rows.length < 2) return null;
    return { today: rows[1].Actual, yesterday: rows[0].Actual, delta: rows[1].Actual - rows[0].Actual };
  }

  // For lower-is-better KPIs, "better" means today < yesterday (or actual < team avg). Returns 'up' (better), 'down' (worse), 'flat'.
  function betterDirection(kpi, todayVal, baselineVal) {
    if (todayVal == null || baselineVal == null) return null;
    const isHigherBetter = (kpi.Direction || 'Higher') === 'Higher';
    if (Math.abs(todayVal - baselineVal) < 1e-3) return 'flat';
    const better = isHigherBetter ? todayVal > baselineVal : todayVal < baselineVal;
    return better ? 'up' : 'down';
  }

  function rankMovement(userId, scope) {
    const rows = A.state.dailyScore || [];
    const dates = [...new Set(rows.map(r => r.Date))].sort();
    if (dates.length < 2) return 0;
    const today = dates[dates.length - 1];
    const yesterday = dates[dates.length - 2];
    const fieldMap = { team: 'Rank_Team', process: 'Rank_Process', account: 'Rank_Account' };
    const field = fieldMap[scope];
    const t = rows.find(r => r.UserID === userId && r.Date === today);
    const y = rows.find(r => r.UserID === userId && r.Date === yesterday);
    if (!t || !y) return 0;
    return (y[field] || 0) - (t[field] || 0); // positive = moved up
  }

  function rankMovementChip(delta) {
    if (!delta || delta === 0) return `<span class="chip bg-white/5 border border-white/10 text-arena-muted"><i data-lucide="minus" class="text-[10px]"></i> Steady</span>`;
    if (delta > 0) return `<span class="chip bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30"><i data-lucide="arrow-up" class="text-[10px]"></i> ${delta} up</span>`;
    return `<span class="chip bg-arena-red/15 text-arena-red border border-arena-red/30"><i data-lucide="arrow-down" class="text-[10px]"></i> ${Math.abs(delta)} down</span>`;
  }

  function bestRiskKpis(rows) {
    if (!rows.length) return { best: null, risk: null };
    const best = rows.slice().sort((a, b) => (b.Score || 0) - (a.Score || 0))[0];
    const risk = rows.slice().sort((a, b) => (a.Score || 0) - (b.Score || 0))[0];
    return { best, risk };
  }

  function renderScorecard() {
    const s = A.state;
    const me = A.userById(s.activeUserId);
    if (!me || me.Role !== 'Agent') return '<div class="glass rounded-2xl p-6">No agent selected.</div>';
    const ac = A.agentSnapshot(me.UserID) || {};
    const todayRows = visibleTodayRowsForUser(me.UserID);
    const greenCount = todayRows.filter(r => r.Status === 'Green').length;
    const amberCount = todayRows.filter(r => r.Status === 'Amber').length;
    const redCount   = todayRows.filter(r => r.Status === 'Red').length;
    const score = ac.PerformanceScore || 0;
    const rag = score >= 100 ? 'Green' : score >= 90 ? 'Amber' : 'Red';
    const ragHero = rag === 'Green' ? 'rag-green' : rag === 'Amber' ? 'rag-amber' : 'rag-red';
    const teamRank = ac.TeamRank;
    const teamSize = A.teamMembers(me.TeamID).length;
    const teamMove = rankMovement(me.UserID, 'team');
    const earnedToday = ac.PointsEarnedToday || 0;
    const xpToday = (s.xpLedger || []).filter(x => x.UserID === me.UserID && x.Timestamp?.startsWith(A.todayStr())).reduce((s, x) => s + (x.XP_Delta || 0), 0);
    const streak = A.streakForUser(me.UserID);
    const { best, risk } = bestRiskKpis(todayRows);

    const recoveryRows = todayRows.filter(r => r.Status !== 'Green').sort((a, b) => (a.Score || 0) - (b.Score || 0)).slice(0, 3);
    const activeRagFilter = A.state.ragFilter || 'all';
    const displayRows = activeRagFilter && activeRagFilter !== 'all' ? todayRows.filter(r => r.Status === activeRagFilter) : todayRows;
    const operationalRows = A.sortKpiRowsForDisplay(displayRows.filter(r => A.kpiMetricGroup(r.KPI_ID) === 'operational'));
    const outcomeRows = A.sortKpiRowsForDisplay(displayRows.filter(r => A.kpiMetricGroup(r.KPI_ID) === 'outcome'));

    return `
      <div class="space-y-4 fade-in">

        <!-- HERO COCKPIT -->
        <section class="cockpit-hero relative overflow-hidden rounded-2xl p-4 sm:p-5">
          <span class="sparkle" style="top:18%;left:34%;animation-delay:.1s"></span>
          <span class="sparkle" style="bottom:24%;right:18%;animation-delay:.7s"></span>
          <div class="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-4 items-center relative">

            <!-- Big score -->
            <div class="flex items-center gap-3">
              <div class="cockpit-dial relative">
                ${cockpitDial(score, rag)}
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-[0.22em] text-arena-muted font-bold">Performance score</div>
                <div class="hero-num text-4xl sm:text-5xl ${ragHero}" data-counter="${score}" data-counter-decimals="1">${score.toFixed(1)}</div>
                <div class="flex items-center gap-1.5 mt-1">
                  ${ragChip(rag)}
                  <span class="text-[11px] text-arena-muted">target 100</span>
                </div>
              </div>
            </div>

            <!-- KPI bands -->
            <div class="grid grid-cols-3 gap-2">
              ${ragSummaryTile('Green', greenCount, 'rag-green')}
              ${ragSummaryTile('Amber', amberCount, 'rag-amber')}
              ${ragSummaryTile('Red',   redCount,   'rag-red')}
            </div>

            <!-- Right column metrics -->
            <div class="grid grid-cols-2 gap-2 min-w-[220px]">
              <div class="rounded-xl glass p-3 text-center">
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Team rank</div>
                <div class="hero-num text-2xl mt-0.5">#${teamRank || '—'}</div>
                <div class="text-[10px] text-arena-muted">of ${teamSize}</div>
                <div class="mt-1.5">${rankMovementChip(teamMove)}</div>
              </div>
              <div class="rounded-xl glass p-3 text-center">
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Streak</div>
                <div class="hero-num text-2xl mt-0.5 text-arena-amber">${streak}<span class="text-[11px] text-arena-muted ml-0.5">d</span></div>
                <div class="mt-1.5"><span class="chip bg-arena-amber/15 text-arena-amber border border-arena-amber/30 streak-pulse"><i data-lucide="flame" class="text-[10px]"></i> ${streak >= 5 ? 'On fire' : streak > 0 ? 'Building' : 'Restart'}</span></div>
              </div>
              <div class="rounded-xl glass p-3 text-center col-span-2">
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Earned today</div>
                <div class="flex items-center justify-center gap-3 mt-0.5">
                  <span class="text-xl font-bold gold-text font-display">+${earnedToday.toLocaleString()} pts</span>
                  <span class="text-arena-muted text-[10px]">·</span>
                  <span class="text-xl font-bold text-arena-violet font-display">+${xpToday.toLocaleString()} progress</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- BEST + RISK CALLOUTS -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${best ? renderBestKpiCallout(best, me) : ''}
          ${risk ? renderRiskKpiCallout(risk, me) : ''}
        </section>

        <!-- SEGMENTED METRIC GRID -->
        <section>
          <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div><div class="font-display font-bold text-[15px] flex items-center gap-2"><i data-lucide="activity" class="text-arena-cyan"></i> Operational Metrics · today</div><div class="text-[11px] text-arena-muted mt-0.5">Regular controllable metrics: AHT, QA, schedule adherence, utilization, SOA, disclosures and call-flow discipline.</div></div>
            <div class="flex items-center gap-2"><span class="text-[11px] text-arena-muted">${operationalRows.length} operational metric${operationalRows.length === 1 ? '' : 's'}</span>${activeRagFilter !== 'all' ? `<button data-rag-filter="all" class="btn-ghost text-[11px] !py-1 !px-2">Show all</button>` : ''}</div>
          </div>
          ${activeRagFilter !== 'all' ? `<div class="mb-2 text-[11px] text-arena-muted">Active filter: <span class="font-bold ${activeRagFilter==='Green'?'rag-green':activeRagFilter==='Amber'?'rag-amber':'rag-red'}">${activeRagFilter === 'Amber' ? 'Watch' : activeRagFilter === 'Red' ? 'Critical' : activeRagFilter}</span></div>` : ''}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${operationalRows.length ? operationalRows.map(r => renderKpiCard(r, me)).join('') : `<div class="glass rounded-2xl p-6 text-center text-arena-muted col-span-full">No operational metrics for this filter.</div>`}
          </div>
        </section>

        <section>
          <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div><div class="font-display font-bold text-[15px] flex items-center gap-2"><i data-lucide="badge-dollar-sign" class="text-arena-gold"></i> Outcome Metrics · today</div><div class="text-[11px] text-arena-muted mt-0.5">Sales outcomes and revenue-quality signals influenced by the operational metrics above. Financial efficiency is shown only at TL/Manager level.</div></div>
            <span class="text-[11px] text-arena-muted">${outcomeRows.length} outcome metric${outcomeRows.length === 1 ? '' : 's'}</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${outcomeRows.length ? outcomeRows.map(r => renderKpiCard(r, me)).join('') : `<div class="glass rounded-2xl p-6 text-center text-arena-muted col-span-full">No outcome metrics for this filter.</div>`}
          </div>
        </section>

        <section class="glass rounded-2xl p-4 border-white/10">
          <div class="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div><div class="font-display font-bold text-[15px] flex items-center gap-2"><i data-lucide="book-open" class="text-arena-cyan"></i> KPI & Outcome Definitions</div><div class="text-[11px] text-arena-muted mt-0.5">Definitions aligned to the Medicare Advantage licensed-agent metrics.</div></div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11.5px]">
            <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><span class="font-bold text-arena-cyan">AHT</span> — talk time plus after-call work per Medicare sales interaction.</div>
            <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><span class="font-bold text-arena-cyan">QA Score</span> — Medicare quality/compliance scorecard performance.</div>
            <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><span class="font-bold text-arena-cyan">Eligible Call Conversion</span> — enrollments divided by eligible and interested calls.</div>
            <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><span class="font-bold text-arena-cyan">Effectuation</span> — applications that become active premium-paying members.</div>
            <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><span class="font-bold text-arena-cyan">SOA / Disclosures</span> — required CMS documentation and disclosures delivered correctly.</div>
            <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><span class="font-bold text-arena-cyan">CTM / Fallout / RFI</span> — complaint, application-quality and hesitant-close signals for coaching.</div>
          </div>
        </section>

        <!-- RECOVERY OPPORTUNITY -->
        ${recoveryRows.length ? `
          <section class="recovery-panel relative overflow-hidden rounded-2xl p-4">
            <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div class="font-display font-bold text-[15px] flex items-center gap-2"><i data-lucide="life-buoy" class="text-arena-amber"></i> Recovery focus today</div>
              <button data-nav="missions" class="btn-primary text-[12px]"><i data-lucide="flag" class="text-[12px]"></i> Open missions</button>
            </div>
            <div class="space-y-2">
              ${recoveryRows.map((row, i) => {
                const kpi = A.kpiById(row.KPI_ID) || {};
                const sugg = kpiSuggestion(row.KPI_ID, row.Status);
                return `
                  <div class="rounded-xl bg-white/[0.02] border border-white/8 p-3 flex items-center gap-3 flex-wrap">
                    <div class="rank-badge rank-other">${i + 1}</div>
                    <div class="w-10 h-10 rounded-xl ${row.Status === 'Red' ? 'bg-arena-red/15 border border-arena-red/30' : 'bg-arena-amber/15 border border-arena-amber/30'} grid place-items-center">
                      <i data-lucide="${row.Status === 'Red' ? 'triangle-alert' : 'circle-alert'}" class="${row.Status === 'Red' ? 'rag-red' : 'rag-amber'} text-[16px]"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold text-[13px]">${escapeHtml(kpi.KPI_Name)}</div>
                      <div class="text-[11px] text-arena-muted">${escapeHtml(sugg || '')}</div>
                    </div>
                    <div class="text-right">
                      <div class="text-[12.5px] font-bold ${row.Status === 'Red' ? 'rag-red' : 'rag-amber'}">${row.Actual}<span class="text-[10px] text-arena-muted ml-0.5">${kpi.Unit || ''}</span></div>
                      <div class="text-[10px] text-arena-muted">target ${row.Target}${kpi.Unit || ''}</div>
                    </div>
                    <div class="flex gap-1.5">
                      <button data-nav="missions" class="btn-ghost text-[11px] !py-1 !px-2"><i data-lucide="flag" class="text-[11px]"></i> Mission</button>

                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        ` : ''}

      </div>
    `;
  }

  function ragSummaryTile(label, count, toneClass) {
    const status = label === 'Green' ? 'Green' : label === 'Amber' ? 'Amber' : 'Red';
    const active = (A.state.ragFilter || 'all') === status;
    return `
      <button data-rag-filter="${status}" class="mobile-tap-card rounded-xl glass p-3 text-center hover:border-white/20 ${active ? 'border-arena-gold/50' : ''}">
        <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">${label === 'Amber' ? 'Watch' : label === 'Red' ? 'Critical' : 'Green'}</div>
        <div class="hero-num text-2xl mt-0.5 ${toneClass}">${count}</div>
        <div class="tap-hint text-[10px] text-arena-muted">tap to filter</div>
      </button>
    `;
  }

  function cockpitDial(score, rag) {
    const pct = Math.max(0, Math.min(115, score)) / 115 * 100;
    const r = 38;
    const C = 2 * Math.PI * r;
    const dash = (pct / 100) * C;
    const color = rag === 'Green' ? '#22c98a' : rag === 'Amber' ? '#f8b441' : '#ef4f6e';
    return `
      <div class="relative" style="width:96px;height:96px">
        <svg class="xp-ring" width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
          <circle cx="48" cy="48" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-dasharray="${dash} ${C - dash}" stroke-linecap="round" style="transition: stroke-dasharray 600ms cubic-bezier(.2,.7,.2,1);"/>
        </svg>
        <div class="absolute inset-0 grid place-items-center">
          <i data-lucide="gauge-circle" class="text-[24px]" style="color:${color}"></i>
        </div>
      </div>
    `;
  }

  function renderBestKpiCallout(row, me) {
    const kpi = A.kpiById(row.KPI_ID) || {};
    const sugg = kpiSuggestion(row.KPI_ID, 'green');
    return `
      <div class="callout-best relative overflow-hidden rounded-2xl p-4">
        <div class="absolute -top-8 -right-8 w-32 h-32 level-glow"></div>
        <div class="flex items-center gap-3 relative">
          <div class="hex hex-lg gold-bg shadow-gold"><i data-lucide="crown" class="text-[20px]"></i></div>
          <div class="flex-1 min-w-0">
            <div class="text-[10px] uppercase tracking-[0.22em] text-arena-gold font-bold">Best KPI today</div>
            <div class="font-display font-bold text-[17px] leading-tight">${escapeHtml(kpi.KPI_Name)}</div>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="text-[14px] font-bold rag-green">${row.Actual}<span class="text-[10px] text-arena-muted ml-0.5">${kpi.Unit || ''}</span></span>
              <span class="chip rag-bg-green rag-green">Score ${(row.Score || 0).toFixed(1)}</span>
              <span class="text-[11px] gold-text font-bold">+${row.Points_Earned || 0} pts</span>
            </div>
            <div class="text-[11px] text-arena-text/80 mt-1.5"><i data-lucide="sparkles" class="text-[10px] text-arena-gold"></i> ${escapeHtml(sugg || '')}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderRiskKpiCallout(row, me) {
    const kpi = A.kpiById(row.KPI_ID) || {};
    const sugg = kpiSuggestion(row.KPI_ID, row.Status);
    const tone = row.Status === 'Red' ? 'rag-red' : row.Status === 'Amber' ? 'rag-amber' : 'rag-green';
    return `
      <div class="callout-risk relative overflow-hidden rounded-2xl p-4">
        <div class="flex items-center gap-3 relative">
          <div class="hex hex-lg" style="background: linear-gradient(135deg, #ff5d80, #c72a4d);"><i data-lucide="triangle-alert" class="text-[20px] text-white"></i></div>
          <div class="flex-1 min-w-0">
            <div class="text-[10px] uppercase tracking-[0.22em] text-arena-red font-bold">Risk KPI today</div>
            <div class="font-display font-bold text-[17px] leading-tight">${escapeHtml(kpi.KPI_Name)}</div>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="text-[14px] font-bold ${tone}">${row.Actual}<span class="text-[10px] text-arena-muted ml-0.5">${kpi.Unit || ''}</span></span>
              <span class="chip ${row.Status === 'Green' ? 'rag-bg-green rag-green' : row.Status === 'Amber' ? 'rag-bg-amber rag-amber' : 'rag-bg-red rag-red'}">Score ${(row.Score || 0).toFixed(1)}</span>
              <span class="text-[11px] text-arena-muted">target ${row.Target}${kpi.Unit || ''}</span>
            </div>
            <div class="text-[11px] text-arena-text/80 mt-1.5"><i data-lucide="life-buoy" class="text-[10px] rag-red"></i> ${escapeHtml(sugg || '')}</div>
            <div class="flex gap-1.5 mt-2">
              <button data-nav="missions" class="btn-ghost text-[11px] !py-1 !px-2"><i data-lucide="flag" class="text-[11px]"></i> Join mission</button>

            </div>
          </div>
        </div>
      </div>
    `;
  }

  function clientImpactLine(kpiId) {
    const kpi = A.kpiById(kpiId) || {};
    const configured = kpi.Description || kpi.Business_Definition || kpi.Definition;
    if (configured) return configured;
    const group = A.kpiMetricGroup(kpiId);
    if (group === 'operational') return 'Configurable operational KPI used for coaching, compliance and capacity guardrails.';
    if (group === 'financial') return 'Leadership-only financial KPI configured in KPI Manager.';
    return 'Configurable outcome KPI aligned to Medicare telesales performance.';
  }

  function renderKpiCard(row, me) {
    const kpi = A.kpiById(row.KPI_ID) || {};
    const trendVals = A.performanceByUserKpi(me.UserID, row.KPI_ID).slice(-14).map(r => r.Score || 0);
    const tone  = row.Status === 'Green' ? 'rag-green' : row.Status === 'Amber' ? 'rag-amber' : 'rag-red';
    const tColor = row.Status === 'Green' ? '#22c98a' : row.Status === 'Amber' ? '#f8b441' : '#ef4f6e';
    const variance = (row.Variance != null) ? Math.abs(row.Variance).toFixed(2) : '—';
    const isHigherBetter = (kpi.Direction || 'Higher') === 'Higher';
    const beatTarget = isHigherBetter ? row.Actual >= row.Target : row.Actual <= row.Target;
    const varTone = beatTarget ? 'rag-green' : 'rag-red';
    const varSign = beatTarget ? (isHigherBetter ? '+' : '−') : (isHigherBetter ? '−' : '+');

    // Trend vs yesterday
    const ty = kpiTrendVsYesterday(me.UserID, row.KPI_ID);
    const yesterdayTone = ty ? betterDirection(kpi, ty.today, ty.yesterday) : null;
    const yChip = (() => {
      if (!ty) return '<span class="chip bg-white/5 border border-white/10 text-arena-muted">—</span>';
      if (yesterdayTone === 'flat') return `<span class="chip bg-white/5 border border-white/10 text-arena-muted">Same as yesterday</span>`;
      const better = yesterdayTone === 'up';
      const cls = better ? 'rag-bg-green rag-green' : 'rag-bg-red rag-red';
      const icon = better ? 'arrow-up-right' : 'arrow-down-right';
      const dyVal = (ty.today - ty.yesterday);
      const display = `${dyVal > 0 ? '+' : ''}${Math.abs(dyVal) < 0.05 ? '0' : dyVal.toFixed(1)}${kpi.Unit || ''}`;
      return `<span class="chip ${cls}"><i data-lucide="${icon}" class="text-[10px]"></i> ${better ? 'Better' : 'Worse'} vs yesterday (${display})</span>`;
    })();

    // Trend vs team avg
    const teamAvg = teamAvgKpi(me.TeamID, row.KPI_ID, row.Date);
    const teamTone = teamAvg != null ? betterDirection(kpi, row.Actual, teamAvg) : null;
    const tChip = (() => {
      if (teamAvg == null) return '<span class="chip bg-white/5 border border-white/10 text-arena-muted">—</span>';
      if (teamTone === 'flat') return `<span class="chip bg-white/5 border border-white/10 text-arena-muted">At team average</span>`;
      const better = teamTone === 'up';
      const cls = better ? 'rag-bg-green rag-green' : 'rag-bg-red rag-red';
      const icon = better ? 'arrow-up-right' : 'arrow-down-right';
      return `<span class="chip ${cls}"><i data-lucide="${icon}" class="text-[10px]"></i> ${better ? 'Above' : 'Below'} team avg (${(teamAvg).toFixed(1)}${kpi.Unit || ''})</span>`;
    })();

    const sugg = kpiSuggestion(row.KPI_ID, row.Status);
    const ringTone = row.Status === 'Green' ? 'kpi-green' : row.Status === 'Amber' ? 'kpi-amber' : 'kpi-red';

    return `
      <article class="kpi-card ${ringTone} relative overflow-hidden rounded-2xl p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">${escapeHtml(kpi.KPI_Type || 'KPI')}</div>
            <div class="font-display font-bold text-[15px] tracking-tight">${escapeHtml(kpi.KPI_Name || row.KPI_ID)}</div>
            <div class="text-[10px] text-arena-muted">${(kpi.Direction || 'Higher') === 'Higher' ? '↑ higher is better' : '↓ lower is better'}</div>
            <div class="text-[10.5px] text-arena-muted mt-1 leading-snug"><span class="text-arena-cyan font-semibold">Why it matters:</span> ${clientImpactLine(row.KPI_ID)}</div>
          </div>
          ${ragChip(row.Status)}
        </div>

        <div class="mt-3 grid grid-cols-3 gap-2">
          <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-2">
            <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Target</div>
            <div class="text-[15px] font-bold font-display">${row.Target}<span class="text-[10px] text-arena-muted ml-0.5">${kpi.Unit || ''}</span></div>
          </div>
          <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-2">
            <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Actual</div>
            <div class="text-[15px] font-bold font-display ${tone}">${row.Actual}<span class="text-[10px] text-arena-muted ml-0.5">${kpi.Unit || ''}</span></div>
          </div>
          <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-2">
            <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Variance</div>
            <div class="text-[15px] font-bold font-display ${varTone}">${varSign}${variance}<span class="text-[10px] text-arena-muted ml-0.5">${kpi.Unit || ''}</span></div>
          </div>
        </div>

        <div class="mt-3">
          ${sparkline(trendVals, tColor)}
        </div>

        <div class="flex flex-wrap gap-1.5 mt-2">
          ${yChip}
          ${tChip}
        </div>

        <div class="flex items-center justify-between mt-2 text-[11px]">
          <span class="text-arena-muted">Score <span class="font-bold ${tone}">${(row.Score || 0).toFixed(1)}</span></span>
          <div class="flex items-center gap-2">
            <span class="gold-text font-bold">+${row.Points_Earned || 0} pts</span>
            <span class="text-arena-violet font-semibold">+${Math.round((row.Points_Earned || 0) * 0.5)} progress</span>
          </div>
        </div>

        ${sugg ? `
          <div class="mt-3 rounded-xl bg-white/[0.02] border border-white/8 p-2.5 flex items-start gap-2">
            <div class="w-6 h-6 rounded-md ${row.Status === 'Red' ? 'bg-arena-red/15' : row.Status === 'Amber' ? 'bg-arena-amber/15' : 'bg-arena-emerald/15'} grid place-items-center flex-shrink-0">
              <i data-lucide="lightbulb" class="${row.Status === 'Red' ? 'rag-red' : row.Status === 'Amber' ? 'rag-amber' : 'rag-green'} text-[12px]"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-semibold">Next best action</div>
              <div class="text-[11.5px] text-arena-text/85 leading-snug">${escapeHtml(sugg)}</div>
            </div>
          </div>
        ` : ''}

        ${row.Status !== 'Green' ? `
          <div class="flex gap-1.5 mt-2">
            <button data-nav="missions" class="btn-ghost text-[11px] !py-1 !px-2 flex-1"><i data-lucide="flag" class="text-[11px]"></i> Join mission</button>

          </div>
        ` : ''}
      </article>
    `;
  }

  // ---- MISSIONS (Quest Board) -------------------------------------------

  const MISSION_CATEGORIES = [
    { id: 'all',            label: 'All',            icon: 'layers',          color: 'text-arena-text',    glow: 'rgba(255,255,255,0.15)' },
    { id: 'Daily',          label: 'Daily',          icon: 'sunrise',         color: 'text-arena-cyan',    glow: 'rgba(58,212,255,0.45)' },
    { id: 'Weekly',         label: 'Weekly',         icon: 'calendar-days',   color: 'text-arena-violet',  glow: 'rgba(124,92,255,0.45)' },
    { id: 'SLA Recovery',   label: 'SLA Recovery',   icon: 'badge-dollar-sign', color: 'text-arena-red',  glow: 'rgba(239,79,110,0.45)' },
    { id: 'Quality Shield', label: 'Quality Shield', icon: 'shield-check',    color: 'text-arena-gold',    glow: 'rgba(245,201,90,0.45)' },
    { id: 'Conversion Sprint', label: 'Conversion Sprint', icon: 'zap',             color: 'text-arena-cyan',    glow: 'rgba(58,212,255,0.45)' },
    { id: 'Compliance',     label: 'Compliance',     icon: 'lock',            color: 'text-arena-violet',  glow: 'rgba(124,92,255,0.45)' },
    { id: 'Training',       label: 'Training',       icon: 'book-open',       color: 'text-arena-amber',   glow: 'rgba(248,180,65,0.45)' },
    { id: 'PKT',            label: 'PKT',            icon: 'graduation-cap',  color: 'text-arena-emerald', glow: 'rgba(34,201,138,0.45)' },
    { id: 'Team Battle',    label: 'Team Battle',    icon: 'users-round',     color: 'text-arena-pink',    glow: 'rgba(255,92,138,0.45)' },
    { id: 'Streak',         label: 'Streak',         icon: 'flame',           color: 'text-arena-amber',   glow: 'rgba(248,180,65,0.45)' },
  ];

  function missionCategory(m) {
    if (m.Mission_Type) return m.Mission_Type;
    const days = (new Date(m.End_Date) - new Date(m.Start_Date)) / 86400000;
    if (m.Commercial_Linkage) return 'SLA Recovery';
    if (m.Linked_Module_ID) {
      const mod = A.moduleById(m.Linked_Module_ID);
      if (mod?.Module_Type === 'PKT') return 'PKT';
      if (mod?.Module_Type === 'Training') return 'Training';
    }
    if (/streak|run|lock/i.test(m.Mission_Name)) return 'Streak';
    const kpi = A.kpiById(m.KPI_ID);
    if (/Quality|QA/.test(kpi?.KPI_Name || '') ) return 'Quality Shield';
    if (/Conversion|Application|Eligible Call/.test(kpi?.KPI_Name || '')) return 'Conversion Sprint';
    if (/SOA|Disclosure|CMS|CTM|Compliance/.test(kpi?.KPI_Name || '')) return 'Compliance';
    return days <= 1 ? 'Daily' : 'Weekly';
  }

  function categoryMeta(id) { return MISSION_CATEGORIES.find(c => c.id === id) || MISSION_CATEGORIES[0]; }

  function isMissionVisibleTo(m, me) {
    if (!me) return true;
    if (m.Audience_Type === 'Account') return true;
    if (m.Audience_Type === 'Team' && m.Audience_ID === me.TeamID) return true;
    if (m.Audience_Type === 'Process' && m.Audience_ID === me.ProcessID) return true;
    return false;
  }

  function isMissionLocked(m, me) {
    // Mario-style "locked" treatment: visible-but-not-yet-yours examples for missions targeting other teams
    if (!me) return false;
    if (m.Audience_Type === 'Account') return false;
    if (m.Audience_Type === 'Team' && m.Audience_ID === me.TeamID) return false;
    if (m.Audience_Type === 'Process' && m.Audience_ID === me.ProcessID) return false;
    return true;
  }

  function renderMissions() {
    const s = A.state;
    const me = A.userById(s.activeUserId);
    if (!me) return '<div class="glass rounded-2xl p-6">No agent selected.</div>';

    const filterId = s.missionFilter || 'all';
    const all = s.missions.filter(m => m.Status === 'Active');

    // Stats: in-progress, completed today, points earned, near-complete badges
    let inProgress = 0, completed = 0, ptsEarned = 0;
    for (const m of all) {
      const slot = s.missionProgress[m.Mission_ID]?.[me.UserID];
      if (!slot) continue;
      if (slot.status === 'Completed') { completed += 1; ptsEarned += (m.Reward_Points || 0); }
      else inProgress += 1;
    }

    const filtered = (filterId === 'all' ? all : all.filter(m => missionCategory(m) === filterId));
    // Order: in-progress first, then available (visible & not joined), then locked (other teams)
    const myJoined = (m) => s.missionProgress[m.Mission_ID]?.[me.UserID];
    const orderKey = (m) => {
      const slot = myJoined(m);
      if (slot && slot.status === 'Completed') return 4;
      if (slot && slot.progress >= 0.8) return 0;
      if (slot) return 1;
      if (!isMissionLocked(m, me)) return 2;
      return 3;
    };
    filtered.sort((a, b) => orderKey(a) - orderKey(b));

    return `
      <div class="space-y-4 fade-in">

        <!-- HERO -->
        <section class="arena-hero p-4 sm:p-5 relative overflow-hidden">
          <span class="sparkle" style="top:18%;left:24%;animation-delay:.1s"></span>
          <span class="sparkle" style="bottom:22%;right:14%;animation-delay:.6s"></span>
          <div class="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div class="text-[10px] uppercase tracking-[0.22em] text-arena-muted font-bold">Quest Board</div>
              <div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">Pick a quest. <span class="gold-text">Level up the floor.</span></div>
              <div class="text-[12px] text-arena-muted">Daily &amp; weekly KPI quests, SLA recovery missions and streak builders.</div>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="chip bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30"><i data-lucide="flag" class="text-[10px]"></i> ${inProgress} in progress</span>
              <span class="chip bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30"><i data-lucide="check-check" class="text-[10px]"></i> ${completed} completed</span>
              <span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30"><i data-lucide="coins" class="text-[10px]"></i> +${ptsEarned} pts earned</span>
            </div>
          </div>
        </section>

        <!-- CATEGORY PILLS -->
        <section>
          <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold mb-2">Mission types</div>
          <div class="scroll-x">
            ${MISSION_CATEGORIES.map(c => {
              const count = c.id === 'all' ? all.length : all.filter(m => missionCategory(m) === c.id).length;
              return `
                <button data-action="set-mission-filter" data-filter="${c.id}" class="${filterId === c.id ? 'gold-bg shadow-gold' : 'btn-ghost'} text-[12px] !px-3 !py-1.5 !rounded-full flex items-center gap-1.5 whitespace-nowrap">
                  <i data-lucide="${c.icon}" class="text-[12px] ${filterId === c.id ? '' : c.color}"></i>
                  <span class="font-semibold">${c.label}</span>
                  <span class="${filterId === c.id ? 'bg-black/20 text-black' : 'bg-white/10 text-arena-muted'} rounded-full px-1.5 py-0.5 text-[10px] font-bold">${count}</span>
                </button>
              `;
            }).join('')}
          </div>
        </section>

        <!-- LEVEL CARDS GRID -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${filtered.length ? filtered.map(m => renderLevelCard(m, me)).join('') : missionEmptyForFilter(filterId)}
        </section>
      </div>
    `;
  }

  function missionEmptyForFilter(filterId) {
    return `
      <div class="glass rounded-2xl p-8 text-center col-span-full">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-arena-cyan/10 border border-arena-cyan/30 grid place-items-center mb-3"><i data-lucide="flag" class="text-arena-cyan text-xl"></i></div>
        <div class="font-display font-bold text-[15px]">No ${filterId === 'all' ? '' : filterId + ' '}missions live right now.</div>
        <div class="text-[12px] text-arena-muted mt-1">Check back tomorrow or pick a different category.</div>
      </div>
    `;
  }

  function renderLevelCard(m, me) {
    const slot = A.state.missionProgress[m.Mission_ID]?.[me.UserID];
    const progress = slot ? Math.round(slot.progress * 100) : 0;
    const joined = !!slot;
    const completed = slot && slot.status === 'Completed';
    const nearComplete = slot && progress >= 80 && !completed;
    const locked = isMissionLocked(m, me);
    const cat = categoryMeta(missionCategory(m));
    const kpi = A.kpiById(m.KPI_ID);
    const badge = A.state.badges.find(b => b.Badge_ID === m.Badge_ID);
    const audienceLabel = m.Audience_Type === 'Team' ? A.teamById(m.Audience_ID)?.TeamName
                       : m.Audience_Type === 'Process' ? A.processById(m.Audience_ID)?.ProcessName
                       : 'Account-wide';

    const stateClass = locked ? 'level-locked'
                     : completed ? 'level-completed'
                     : nearComplete ? 'level-near'
                     : joined ? 'level-active'
                     : 'level-available';

    const statusChip = locked
      ? `<span class="chip bg-white/5 border border-white/10 text-arena-muted"><i data-lucide="lock" class="text-[10px]"></i> Locked</span>`
      : completed
      ? `<span class="chip bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30"><i data-lucide="check-check" class="text-[10px]"></i> Completed</span>`
      : nearComplete
      ? `<span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30 streak-pulse"><i data-lucide="flame" class="text-[10px]"></i> Push to finish</span>`
      : joined
      ? `<span class="chip bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30"><span class="pulse"></span> In progress</span>`
      : `<span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30"><i data-lucide="sparkles" class="text-[10px]"></i> Available</span>`;

    let cta = '';
    if (locked) {
      cta = `<button disabled class="btn-secondary text-[12px] opacity-60 cursor-not-allowed"><i data-lucide="lock" class="text-[12px]"></i> Locked</button>`;
    } else if (completed) {
      cta = `<span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30"><i data-lucide="trophy" class="text-[10px]"></i> Reward claimed</span>`;
    } else if (nearComplete) {
      cta = `<button data-action="agent-progress-mission" data-mission="${m.Mission_ID}" class="btn-primary text-[12px] shadow-gold"><i data-lucide="flag-triangle-right" class="text-[12px]"></i> Push to finish</button>`;
    } else if (joined) {
      cta = `<button data-action="agent-progress-mission" data-mission="${m.Mission_ID}" class="btn-primary text-[12px]"><i data-lucide="trending-up" class="text-[12px]"></i> Log progress</button>`;
    } else if (m.Linked_Module_ID) {
      const mod = A.moduleById(m.Linked_Module_ID);
      const target = mod?.Module_Type === 'PKT' ? 'training' : 'training';
      cta = `<button data-nav="${target}" class="btn-primary text-[12px]"><i data-lucide="play" class="text-[12px]"></i> ${mod?.Module_Type === 'PKT' ? 'Take PKT' : 'Open training'}</button>`;
    } else {
      cta = `<button data-action="agent-join-mission" data-mission="${m.Mission_ID}" class="btn-primary text-[12px]"><i data-lucide="play" class="text-[12px]"></i> Accept mission</button>`;
    }

    const targetText = (() => {
      if (m.Linked_Module_ID) return `Complete linked module`;
      if (kpi?.Direction === 'Lower') return `${kpi?.KPI_Name || ''} ≤ ${m.Target_Value}${kpi?.Unit || ''}`;
      return `${kpi?.KPI_Name || ''} ≥ ${m.Target_Value}${kpi?.Unit || ''}`;
    })();

    return `
      <article class="level-card ${stateClass} relative overflow-hidden rounded-2xl p-4 fade-in" style="--cat-glow: ${cat.glow}">

        <!-- decorative progress rays -->
        <div class="level-rays" aria-hidden="true"></div>

        <!-- top row: hex badge + status chip -->
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex items-center gap-2.5">
            <div class="hex hex-sm relative" style="background: linear-gradient(135deg, var(--cat-glow), rgba(0,0,0,0.4));">
              <i data-lucide="${cat.icon}" class="text-[14px] text-white"></i>
              ${nearComplete ? '<span class="hex-glow"></span>' : ''}
            </div>
            <div>
              <div class="text-[10px] uppercase tracking-wider ${cat.color} font-bold">${escapeHtml(cat.label)}</div>
              <div class="text-[10px] text-arena-muted">${escapeHtml(audienceLabel)} · ${dueLabel(m.End_Date)}</div>
            </div>
          </div>
          ${statusChip}
        </div>

        <!-- title + description -->
        <h3 class="font-display font-bold text-[16px] sm:text-[17px] leading-tight mb-1">${escapeHtml(m.Mission_Name)}</h3>
        <p class="text-[12px] text-arena-muted line-clamp-2 mb-3">${escapeHtml(m.Description || '')}</p>

        <!-- target chip -->
        <div class="flex flex-wrap items-center gap-1.5 mb-3">
          <span class="chip bg-white/5 border border-white/10 text-arena-text"><i data-lucide="target" class="text-[10px] text-arena-cyan"></i> ${escapeHtml(targetText)}</span>
          ${m.Commercial_Linkage ? `<span class="chip bg-arena-amber/10 text-arena-amber border border-arena-amber/30"><i data-lucide="badge-dollar-sign" class="text-[10px]"></i> Commercial</span>` : ''}
        </div>

        <!-- progress bar -->
        <div class="mb-3">
          <div class="flex items-center justify-between text-[10px] mb-1">
            <span class="uppercase tracking-wider text-arena-muted font-semibold">Progress</span>
            <span class="text-arena-text font-semibold">${progress}%</span>
          </div>
          <div class="progress thick ${completed ? 'emerald' : nearComplete ? 'gold' : ''}"><span style="width:${progress}%"></span></div>
        </div>

        <!-- reward stack + cta -->
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="reward-pill gold-bg !text-[11px] !font-bold !rounded-md !px-2 !py-1"><i data-lucide="coins" class="text-[12px]"></i> +${m.Reward_Points} pts</span>
            <span class="reward-pill !text-[11px] !font-bold !rounded-md !px-2 !py-1" style="background: linear-gradient(135deg, #8a6cff, #5e3eff); color: white;"><i data-lucide="zap" class="text-[12px]"></i> +${m.XP_Reward || Math.round(m.Reward_Points / 2)} progress</span>
            ${badge ? `<span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30 ${nearComplete ? 'badge-shine' : ''}"><i data-lucide="award" class="text-[10px]"></i> ${escapeHtml(badge.Badge_Name)}</span>` : ''}
          </div>
          ${cta}
        </div>

        ${completed ? `<div class="absolute top-2 right-2 reward-burst" aria-hidden="true"></div>` : ''}
      </article>
    `;
  }

  // ---- CHALLENGE ARENA ---------------------------------------------------

  const CHALLENGE_THEMES = [
    { id: 'all',                label: 'All',                 icon: 'layers',     color: 'text-arena-text' },
    { id: 'Agent vs Agent',     label: 'Agent vs Agent',      icon: 'swords',     color: 'text-arena-cyan',    type: 'Peer' },
    { id: 'Team vs Team',       label: 'Team vs Team',        icon: 'users-round',     color: 'text-arena-violet',  type: 'Team' },
    { id: 'TL Assigned',        label: 'TL Assigned',         icon: 'shield',     color: 'text-arena-amber',   type: 'Team Lead Issued' },
    { id: 'SLA Recovery',       label: 'SLA Recovery',        icon: 'badge-dollar-sign',   color: 'text-arena-red' },
    { id: 'Quality Shield',     label: 'Quality Shield',      icon: 'shield-check', color: 'text-arena-gold' },
    { id: 'Conversion Sprint',  label: 'Conversion Sprint',   icon: 'zap', color: 'text-arena-cyan' },
    { id: 'APD Dash',           label: 'APD Dash',            icon: 'gauge', color: 'text-arena-pink' },
    { id: 'SOA Discipline',     label: 'SOA Discipline',      icon: 'file-check-2', color: 'text-arena-emerald' },
    { id: 'Compliance Quest',   label: 'Compliance Quest',    icon: 'lock', color: 'text-arena-violet' },
  ];

  function challengeTheme(c) {
    const kpi = A.kpiById(c.KPI_ID);
    if (c.Challenge_Type === 'Manager Issued' || c.Commercial_Linkage) return 'SLA Recovery';
    if (kpi?.KPI_Name === 'Quality Score') return 'Quality Shield';
    if (/Conversion|Application|Eligible Call/.test(kpi?.KPI_Name || '')) return 'Conversion Sprint';
    if (kpi?.KPI_Name === 'Applications Per Day') return 'APD Dash';
    if (kpi?.KPI_Name === 'SOA Compliance Rate') return 'SOA Discipline';
    if (/CMS|CTM|Disclosure|SOA|Compliance/.test(kpi?.KPI_Name || '')) return 'Compliance Quest';
    if (kpi?.KPI_Name === 'Effectuation Rate') return 'Effectuation Hero';
    if (kpi?.KPI_Name === 'Average Handle Time') return 'Disclosure Flow';
    if (c.Challenge_Type === 'Team') return 'Team vs Team';
    if (c.Challenge_Type === 'Team Lead Issued') return 'TL Assigned';
    return 'Agent vs Agent';
  }

  function themeMeta(themeId) {
    return CHALLENGE_THEMES.find(t => t.id === themeId) || { id: themeId, label: themeId, icon: 'swords', color: 'text-arena-cyan' };
  }

  function statusFor(c, me) {
    const cs = A.ensureChallengeStatus(c);
    if (cs.status === 'Settled') return 'Settled';
    if (cs.status === 'Declined') return 'Declined';
    if (cs.rejectedBy.includes(me.UserID)) return 'Declined';

    const cps = (A.state.challengeParticipants || []).filter(p => p.Challenge_ID === c.Challenge_ID);
    const myCp = cps.find(p => p.UserID === me.UserID);
    const iAccepted = cs.acceptedBy.includes(me.UserID);

    // I created it but opponent hasn't accepted yet → show as Pending
    if (isCreatedByMe(c, me)) {
      const opponentsPending = cps.filter(p => p.UserID !== me.UserID).some(p => p.Status === 'Pending' && !cs.acceptedBy.includes(p.UserID));
      if (opponentsPending) return 'Pending';
    }
    if (iAccepted) return 'Active';
    if (myCp) return 'Pending';
    return cs.status || 'Pending';
  }

  function isCreatedByMe(c, me) { return c.Created_By === me.UserID; }
  function isParticipantMe(c, me) {
    if (c.Participant_One === me.UserID || c.Participant_Two === me.UserID) return true;
    return (A.state.challengeParticipants || []).some(cp => cp.Challenge_ID === c.Challenge_ID && cp.UserID === me.UserID);
  }

  function challengeSides(c) {
    const cps = (A.state.challengeParticipants || []).filter(p => p.Challenge_ID === c.Challenge_ID);
    return { sideA: cps.filter(p => p.Side === 'A'), sideB: cps.filter(p => p.Side === 'B') };
  }

  function challengeParticipantIds(c) {
    // Returns [side A id, side B id] — the id can be a UserID or a TeamID depending on type.
    if (c.Participant_One && c.Participant_Two) return [c.Participant_One, c.Participant_Two];
    const { sideA, sideB } = challengeSides(c);
    const isTeamBattle = c.Challenge_Type === 'Team';
    const isIssued = c.Challenge_Type === 'Team Lead Issued' || c.Challenge_Type === 'Manager Issued';
    if (isTeamBattle) {
      const teamA = sideA[0] ? A.userById(sideA[0].UserID)?.TeamID : null;
      const teamB = sideB[0] ? A.userById(sideB[0].UserID)?.TeamID : null;
      return [teamA, teamB];
    }
    if (isIssued) {
      const targetTeam = sideA[0] ? A.userById(sideA[0].UserID)?.TeamID : null;
      return [c.Created_By, targetTeam];
    }
    return [sideA[0]?.UserID || c.Created_By, sideB[0]?.UserID];
  }

  function bucketChallenges(me) {
    const s = A.state;
    const buckets = { active: [], received: [], sent: [], completed: [], all: s.challenges.slice() };
    for (const c of s.challenges) {
      const cs = A.ensureChallengeStatus(c);
      if (cs.status === 'Settled' || cs.status === 'Declined' || cs.status === 'Pending Validation') { buckets.completed.push(c); continue; }
      const cps = (s.challengeParticipants || []).filter(p => p.Challenge_ID === c.Challenge_ID);
      const myCp = cps.find(p => p.UserID === me.UserID);
      const iCreated = isCreatedByMe(c, me);
      const iAccepted = cs.acceptedBy.includes(me.UserID);
      const iRejected = cs.rejectedBy.includes(me.UserID);
      // Sent — I created it and at least one other participant hasn't accepted
      if (iCreated) {
        const others = cps.filter(p => p.UserID !== me.UserID);
        const anyPending = others.some(p => p.Status === 'Pending' && !cs.acceptedBy.includes(p.UserID));
        if (anyPending) { buckets.sent.push(c); continue; }
      }
      // Received — I'm a participant who hasn't accepted/rejected
      if (myCp && !iAccepted && !iRejected) { buckets.received.push(c); continue; }
      // Active — I've accepted and challenge is still live
      if (iAccepted) { buckets.active.push(c); continue; }
    }
    return buckets;
  }

  function applyThemeFilter(list, themeId) {
    if (!themeId || themeId === 'all') return list;
    const meta = themeMeta(themeId);
    // Type-based category filters (Agent vs Agent / Team vs Team / TL Assigned)
    // should not be overridden by KPI themes like Conversion Sprint. This keeps the
    // category counts intuitive: a peer conversion challenge appears under Agent vs Agent.
    if (meta.type) return list.filter(c => c.Challenge_Type === meta.type);
    return list.filter(c => challengeTheme(c) === themeId);
  }

  function uniqueChallenges(list) {
    const seen = new Set();
    return (list || []).filter(c => {
      const id = c && c.Challenge_ID;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function participantSnapshot(participantId, c) {
    // returns {label, sub, score, kpiActual, isTeam}
    const team = A.teamById(participantId);
    if (team) {
      const board = A.leaderboardForTeam(team.TeamID);
      const score = board.length ? board.reduce((s, b) => s + (b.PerformanceScore || 0), 0) / board.length : 0;
      return { label: team.TeamName, sub: `${team.Location} · ${board.length} agents`, score, kpiActual: null, isTeam: true, id: team.TeamID };
    }
    const u = A.userById(participantId);
    if (!u) return { label: participantId, sub: '', score: 0, kpiActual: null };
    const ac = A.agentSnapshot(u.UserID) || {};
    const perf = A.performanceByUserKpi(u.UserID, c.KPI_ID);
    const lastDay = perf.length ? perf[perf.length - 1] : null;
    return {
      label: u.Name, sub: `${u.Level} · ${ac.RAGStatus || ''}`,
      score: ac.PerformanceScore || 0,
      kpiActual: lastDay ? lastDay.Actual : null, isTeam: false, id: u.UserID,
    };
  }

  function renderChallenges() {
    const s = A.state;
    const me = A.userById(s.activeUserId);
    if (!me) return '<div class="glass rounded-2xl p-6">No agent selected.</div>';

    const buckets = bucketChallenges(me);
    const tab = s.challengeBucket || 'active';
    const themeId = s.challengeTheme || 'all';
    const filtered = uniqueChallenges(applyThemeFilter(buckets[tab] || [], themeId));

    const tabs = [
      { id: 'active',    label: 'Active',    icon: 'flame',          count: buckets.active.length },
      { id: 'received',  label: 'Received',  icon: 'inbox',          count: buckets.received.length },
      { id: 'sent',      label: 'Sent',      icon: 'send',           count: buckets.sent.length },
      { id: 'completed', label: 'Completed', icon: 'flag-triangle-right', count: buckets.completed.length },
      { id: 'all',       label: 'All',       icon: 'layers',         count: uniqueChallenges(s.challenges).length },
    ];

    const totals = {
      activeOnTeam: uniqueChallenges(A.state.challenges).filter(c => A.ensureChallengeStatus(c).status !== 'Settled').length,
      pool: uniqueChallenges(A.state.challenges).reduce((s, c) => s + (c.Reward_Pool || 0), 0),
      wins: A.state.challengeResults.filter(r => r.Winner_UserID === me.UserID).length,
    };

    return `
      <div class="space-y-4 fade-in">
        <!-- HERO -->
        <section class="arena-hero p-4 sm:p-5 relative overflow-hidden">
          <span class="sparkle" style="top:14%;left:32%;animation-delay:.1s"></span>
          <span class="sparkle" style="top:42%;right:18%;animation-delay:.7s"></span>
          <div class="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div class="text-[10px] uppercase tracking-[0.22em] text-arena-muted font-bold">Challenge Arena</div>
              <div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">Step in. <span class="gold-text">Earn the reward pool.</span></div>
              <div class="text-[12px] text-arena-muted">Peer duels, team battles, TL-assigned quests &amp; SLA recovery missions.</div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="chip bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30"><i data-lucide="flame" class="text-[10px]"></i> ${totals.activeOnTeam} live</span>
              <span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30"><i data-lucide="trophy" class="text-[10px]"></i> ${totals.wins} wins</span>
              <button data-action="agent-create-challenge" class="btn-primary text-[12px]"><i data-lucide="swords" class="text-[12px]"></i> Create Challenge</button>
            </div>
          </div>
        </section>

        <!-- THEME PILLS -->
        <section>
          <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold mb-2">Categories</div>
          <div class="scroll-x">
            ${CHALLENGE_THEMES.map(t => `
              <button data-action="set-challenge-theme" data-theme="${t.id}" class="${themeId === t.id ? 'gold-bg shadow-gold' : 'btn-ghost'} text-[12px] !px-3 !py-1.5 !rounded-full flex items-center gap-1.5 whitespace-nowrap">
                <i data-lucide="${t.icon}" class="text-[12px] ${themeId === t.id ? '' : t.color}"></i>
                <span class="font-semibold">${t.label}</span>
              </button>
            `).join('')}
          </div>
        </section>

        <!-- STATUS TABS -->
        <section class="flex gap-1 bg-white/5 border border-white/10 rounded-2xl p-1 overflow-x-auto scrollbar-thin">
          ${tabs.map(t => `
            <button data-action="set-challenge-bucket" data-bucket="${t.id}" class="flex-1 min-w-[110px] px-3 py-2 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 ${tab === t.id ? 'gold-bg shadow-gold' : 'text-arena-muted hover:text-arena-text'}">
              <i data-lucide="${t.icon}" class="text-[12px]"></i>
              <span>${t.label}</span>
              <span class="${tab === t.id ? 'bg-black/20 text-black' : 'bg-white/5 text-arena-muted'} rounded-full px-1.5 py-0.5 text-[10px] font-bold">${t.count}</span>
            </button>
          `).join('')}
        </section>

        <!-- BATTLE CARDS -->
        <section class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          ${filtered.length ? filtered.map(c => renderBattleCard(c, me)).join('') : challengeEmptyState(tab, themeId)}
        </section>
      </div>
    `;
  }

  function challengeEmptyState(tab, themeId) {
    const themeLabel = themeId === 'all' ? '' : ` in ${themeMeta(themeId).label}`;
    const messages = {
      active:    `No active challenges${themeLabel}. Throw down a peer challenge to get started.`,
      received:  `No incoming challenges${themeLabel}. Quiet on the front line.`,
      sent:      `No pending invites${themeLabel}. Pick an opponent and step into the arena.`,
      completed: `No settled challenges yet${themeLabel}. Win one to fill this list.`,
      all:       `No challenges${themeLabel} yet.`,
    };
    return `
      <div class="glass rounded-2xl p-8 text-center col-span-full">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-arena-cyan/10 border border-arena-cyan/30 grid place-items-center mb-3"><i data-lucide="swords" class="text-arena-cyan text-xl"></i></div>
        <div class="font-display font-bold text-[15px]">${messages[tab] || messages.all}</div>
        <button data-action="agent-create-challenge" class="btn-primary text-[12px] mt-3"><i data-lucide="swords" class="text-[12px]"></i> Create Challenge</button>
      </div>
    `;
  }

  function renderBattleCard(c, me) {
    const cs = A.ensureChallengeStatus(c);
    const t = themeMeta(challengeTheme(c));
    const kpi = A.kpiById(c.KPI_ID);
    const status = statusFor(c, me);
    const myStatus = cs.acceptedBy.includes(me.UserID);
    const winnerId = cs.winnerId || null;
    const isMine = isParticipantMe(c, me);
    const createdByMe = isCreatedByMe(c, me);

    const [p1Id, p2Id] = challengeParticipantIds(c);
    const p1 = participantSnapshot(p1Id, c);
    const p2 = participantSnapshot(p2Id, c);
    const meIsP1 = p1Id === me.UserID || (p1Id && p1Id === me.TeamID);
    const meIsP2 = p2Id === me.UserID || (p2Id && p2Id === me.TeamID);
    const oppId = meIsP1 ? p2Id : meIsP2 ? p1Id : null;

    const winningSide = (() => {
      if (kpi?.Direction === 'Lower') {
        if (p1.kpiActual != null && p2.kpiActual != null) return p1.kpiActual < p2.kpiActual ? 1 : (p2.kpiActual < p1.kpiActual ? 2 : 0);
      }
      if (p1.kpiActual != null && p2.kpiActual != null) return p1.kpiActual > p2.kpiActual ? 1 : (p2.kpiActual > p1.kpiActual ? 2 : 0);
      if (p1.score === p2.score) return 0;
      return p1.score > p2.score ? 1 : 2;
    })();

    const startMs = new Date(`${c.Start_Date}T00:00:00`).getTime();
    const endMs = new Date(`${c.End_Date}T23:59:59`).getTime();
    const totalMs = endMs - startMs;
    const elapsedMs = Date.now() - startMs;
    const timePct = Math.max(0, Math.min(100, Math.round((elapsedMs / totalMs) * 100)));

    const statusChip = (() => {
      if (status === 'Active')    return `<span class="chip bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30 streak-pulse"><span class="pulse"></span> Active</span>`;
      if (status === 'Pending')   return `<span class="chip bg-arena-amber/15 text-arena-amber border border-arena-amber/30"><i data-lucide="hourglass" class="text-[10px]"></i> Pending</span>`;
      if (status === 'Declined')  return `<span class="chip bg-arena-red/15 text-arena-red border border-arena-red/30"><i data-lucide="x" class="text-[10px]"></i> Declined</span>`;
      if (status === 'Settled' || status === 'Pending Validation') {
        const meWon = winnerId === me.UserID;
        if (winnerId && isMine) return `<span class="chip ${meWon ? 'bg-arena-gold/20 text-arena-gold border border-arena-gold/40' : 'bg-arena-red/15 text-arena-red border border-arena-red/30'}"><i data-lucide="${meWon ? 'crown' : 'flag-off'}" class="text-[10px]"></i> ${meWon ? 'You won' : 'You lost'}</span>`;
        return `<span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30"><i data-lucide="trophy" class="text-[10px]"></i> Settled</span>`;
      }
      return `<span class="chip bg-white/5 border border-white/10 text-arena-muted">${status}</span>`;
    })();

    return `
      <div class="battle-card relative overflow-hidden rounded-2xl p-4 fade-in">
        <!-- title strip -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-1.5">
            <span class="chip bg-white/5 border border-white/10 ${t.color}"><i data-lucide="${t.icon}" class="text-[10px]"></i> ${escapeHtml(t.label)}</span>
            <span class="chip bg-white/5 border border-white/10 text-arena-muted">${escapeHtml(kpi?.KPI_Name || c.KPI_ID)}</span>
          </div>
          ${statusChip}
        </div>

        <!-- title -->
        <div class="text-center font-display font-bold text-[16px] sm:text-[18px] tracking-tight mb-3">${escapeHtml(c.Challenge_Name)}</div>

        <!-- VS row -->
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          ${battleSide(p1, c, kpi, winningSide === 1, meIsP1, status)}
          ${vsBlock(c, status, winnerId, timePct)}
          ${battleSide(p2, c, kpi, winningSide === 2, meIsP2, status, true)}
        </div>

        <!-- pool / entry / countdown -->
        <div class="grid grid-cols-3 gap-2 mt-4 text-center">
          <div class="rounded-xl bg-white/[0.02] border border-white/5 px-2 py-2">
            <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Reward Pool</div>
            <div class="text-[15px] font-bold gold-text">${(c.Reward_Pool || 0).toLocaleString()} pts</div>
          </div>
          <div class="rounded-xl bg-white/[0.02] border border-white/5 px-2 py-2">
            <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">Entry Pts</div>
            <div class="text-[15px] font-bold text-arena-cyan">${(c.Entry_Points || 0).toLocaleString()}</div>
          </div>
          <div class="rounded-xl bg-white/[0.02] border border-white/5 px-2 py-2">
            <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-semibold">${status === 'Settled' ? 'Settled' : status === 'Pending Validation' ? 'Validation' : 'Ends in'}</div>
            <div class="text-[15px] font-bold ${status === 'Settled' ? 'text-arena-muted' : 'text-arena-amber'}" data-countdown-end="${status === 'Settled' ? '' : c.End_Date}">${status === 'Settled' ? c.End_Date : status === 'Pending Validation' ? 'With TL' : ''}</div>
          </div>
        </div>

        <div class="mt-2">
          <div class="flex items-center justify-between text-[10px] text-arena-muted mb-1">
            <span class="uppercase tracking-wider font-semibold">${status === 'Settled' ? 'Final' : status === 'Pending Validation' ? 'Awaiting TL validation' : 'Time elapsed'}</span>
            <span class="text-arena-text font-semibold">${c.Start_Date} → ${c.End_Date}</span>
          </div>
          <div class="progress ${status === 'Settled' ? 'gold' : timePct > 75 ? 'red' : timePct > 50 ? 'amber' : ''}"><span style="width:${timePct}%"></span></div>
        </div>

        <!-- Eligibility -->
        ${c.Min_Volume ? `<div class="text-[11px] text-arena-muted mt-2 flex items-center gap-1"><i data-lucide="info" class="text-[10px]"></i> Eligibility: minimum ${c.Min_Volume} ${kpi?.KPI_Type === 'Speed' ? 'calls' : 'cases'} during the window</div>` : ''}

        <!-- Actions -->
        ${battleActions(c, me, status, isMine, createdByMe, winnerId, oppId)}

        ${(status === 'Settled' || status === 'Pending Validation') && winnerId && isMine ? `
          <div class="mt-3 px-3 py-2 rounded-xl ${winnerId === me.UserID ? 'bg-arena-gold/10 border border-arena-gold/30' : 'bg-arena-red/10 border border-arena-red/30'} flex items-center gap-2 text-[12px]">
            <i data-lucide="${winnerId === me.UserID ? 'crown' : 'medal'}" class="${winnerId === me.UserID ? 'text-arena-gold' : 'text-arena-red'}"></i>
            <span class="${winnerId === me.UserID ? 'gold-text font-bold' : 'rag-red font-semibold'}">${status === 'Pending Validation' ? (winnerId === me.UserID ? `Win submitted · ${c.Reward_Pool} pts pending TL approval` : `Result pending TL approval`) : (winnerId === me.UserID ? `+${c.Reward_Pool} pts won` : `−${c.Entry_Points} pts (entry forfeited)`)}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  function battleSide(p, c, kpi, isLeading, isMe, status, mirror) {
    const align = mirror ? 'items-end text-right' : 'items-start text-left';
    const meBadge = isMe ? `<span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30 mt-1 text-[9px] !px-1.5 !py-0">YOU</span>` : '';
    const crown = isLeading && status !== 'Settled' ? `<i data-lucide="crown" class="text-arena-gold text-[14px] absolute -top-2 ${mirror ? '-right-1' : '-left-1'} drop-shadow-glow"></i>` : '';
    return `
      <div class="flex flex-col ${align} gap-1.5 min-w-0">
        <div class="relative">
          ${avatarHexById(p, mirror)}
          ${crown}
        </div>
        <div class="font-semibold text-[12.5px] truncate w-full">${escapeHtml(p.label)}</div>
        <div class="text-[10px] text-arena-muted truncate w-full">${escapeHtml(p.sub)}</div>
        <div class="flex items-center gap-1.5 ${mirror ? 'justify-end' : ''} flex-wrap">
          <span class="hero-num text-[20px] ${(p.score || 0) >= 100 ? 'rag-green' : (p.score || 0) >= 92 ? 'rag-amber' : 'rag-red'}">${(p.score || 0).toFixed(1)}</span>
          ${p.kpiActual != null ? `<span class="text-[11px] text-arena-muted">${kpi?.KPI_Name}: <span class="font-semibold text-arena-text">${p.kpiActual}${kpi?.Unit || ''}</span></span>` : ''}
        </div>
        ${meBadge}
      </div>
    `;
  }

  function avatarHexById(p, mirror) {
    if (p.isTeam) {
      const initials = (p.label || '?').split(' ').map(s => s[0]).slice(0, 2).join('');
      return `<div class="hex" style="background: linear-gradient(135deg, #5e3eff, #1eaee2); width:54px; height:62px;"><span class="text-[14px] font-display font-bold text-white">${initials}</span></div>`;
    }
    const u = A.userById(p.id);
    return avatarHex(u, 'sm');
  }

  function vsBlock(c, status, winnerId, timePct) {
    if (status === 'Settled' || status === 'Pending Validation') {
      return `
        <div class="flex flex-col items-center gap-1 px-2">
          <div class="hex hex-sm gold-bg shadow-gold"><i data-lucide="trophy" class="text-[14px]"></i></div>
          <div class="text-[9.5px] uppercase tracking-wider text-arena-gold font-bold">Settled</div>
        </div>
      `;
    }
    return `
      <div class="flex flex-col items-center gap-1 px-2">
        <div class="vs-clash">
          <span class="font-display font-extrabold text-[18px] gold-text tracking-wider">VS</span>
        </div>
        <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-bold" data-countdown-end="${c.End_Date}"></div>
      </div>
    `;
  }

  function battleActions(c, me, status, isMine, createdByMe, winnerId, oppId) {
    if (status === 'Pending' && isMine && !createdByMe) {
      // Received — can accept or decline
      return `
        <div class="grid grid-cols-2 gap-2 mt-3">
          <button data-action="agent-reject-challenge" data-challenge="${c.Challenge_ID}" class="btn-ghost text-[12.5px]">
            <i data-lucide="shield-off" class="text-[12px]"></i> Decline
          </button>
          <button data-action="agent-accept-challenge" data-challenge="${c.Challenge_ID}" class="btn-primary text-[12.5px]">
            <i data-lucide="swords" class="text-[12px]"></i> Accept · entry ${c.Entry_Points} pts
          </button>
        </div>
      `;
    }
    if (status === 'Pending' && createdByMe) {
      return `<div class="mt-3 text-center text-[12px] text-arena-muted"><i data-lucide="hourglass" class="text-[12px]"></i> Waiting for opponent to accept</div>`;
    }
    if (status === 'Active' && isMine) {
      return `
        <div class="grid grid-cols-2 gap-2 mt-3">
          <button data-action="settle-challenge" data-challenge="${c.Challenge_ID}" data-winner="${oppId || ''}" class="btn-ghost text-[12.5px]"><i data-lucide="flag" class="text-[12px]"></i> Concede</button>
          <button data-action="settle-challenge" data-challenge="${c.Challenge_ID}" data-winner="${me.UserID}" class="btn-primary text-[12.5px]"><i data-lucide="shield-check" class="text-[12px]"></i> Submit Win for TL Validation</button>
        </div>
      `;
    }
    if (status === 'Settled' && isMine && winnerId && winnerId !== me.UserID) {
      // Lost — show challenge back
      return `
        <div class="mt-3">
          <button data-action="challenge-back" data-user="${oppId || ''}" data-kpi="${c.KPI_ID}" class="btn-primary text-[12.5px] w-full"><i data-lucide="rotate-ccw" class="text-[12px]"></i> Challenge Back</button>
        </div>
      `;
    }
    return '';
  }

  // ---- LEADERBOARD -------------------------------------------------------

  const LB_FILTERS = [
    { id: 'team',      label: 'Team',      icon: 'users',         desc: 'Your squad ranked by today\'s score' },
    { id: 'process',   label: 'Process',   icon: 'workflow',      desc: 'Your process line ranked by score' },
    { id: 'kpi',       label: 'KPI',       icon: 'gauge-circle',  desc: 'Top performers on a single KPI today' },
    { id: 'weekly',    label: 'Weekly',    icon: 'calendar-days', desc: 'Average score across the last 7 days' },
    { id: 'monthly',   label: 'Monthly',   icon: 'calendar',      desc: 'Average score across the rolling month' },
    { id: 'challenge', label: 'Challenges',icon: 'swords',        desc: 'Challenge wins and active participations' },
  ];

  // Build the rank rows for the active filter
  function buildLeaderboardRows(me, filter, kpiId) {
    const s = A.state;
    if (filter === 'team') {
      return A.leaderboardForTeam(me.TeamID).map((b, i) => ({
        userId: b.UserID, score: b.PerformanceScore || 0, sub: `${b.Level} · ${(b.PointsEarnedToday || 0).toLocaleString()} pts today`,
        rag: b.RAGStatus, points: b.ArenaPointsBalance || 0, xp: b.XP || 0, level: b.Level,
        teamName: A.teamById(b.TeamID)?.TeamName, rank: i + 1,
        movement: rankMovement(b.UserID, 'team'),
      }));
    }
    if (filter === 'process') {
      return A.leaderboardForProcess(me.ProcessID).map((b, i) => ({
        userId: b.UserID, score: b.PerformanceScore || 0, sub: `${A.teamById(b.TeamID)?.TeamName || ''} · ${(b.PointsEarnedToday || 0)} pts`,
        rag: b.RAGStatus, points: b.ArenaPointsBalance || 0, xp: b.XP || 0, level: b.Level,
        teamName: A.teamById(b.TeamID)?.TeamName, rank: i + 1,
        movement: rankMovement(b.UserID, 'process'),
      })).slice(0, 30);
    }
    if (filter === 'kpi') {
      const dates = [...new Set(s.performance.map(p => p.Date))].sort();
      const today = dates[dates.length - 1];
      const yesterday = dates[dates.length - 2];
      const todayRows = s.performance.filter(p => p.KPI_ID === kpiId && p.Date === today);
      const yesterdayRows = s.performance.filter(p => p.KPI_ID === kpiId && p.Date === yesterday);
      // sort by Score desc
      const ranked = todayRows.slice().sort((a, b) => (b.Score || 0) - (a.Score || 0));
      const yesterdayRank = {};
      const yRanked = yesterdayRows.slice().sort((a, b) => (b.Score || 0) - (a.Score || 0));
      yRanked.forEach((p, i) => { yesterdayRank[p.UserID] = i + 1; });
      return ranked.map((p, i) => {
        const u = A.userById(p.UserID) || {};
        const ac = A.agentSnapshot(p.UserID) || {};
        return {
          userId: p.UserID, score: p.Score || 0,
          sub: `${u.Level || ''} · ${A.teamById(u.TeamID)?.TeamName || ''}`,
          rag: p.Status, points: ac.ArenaPointsBalance || u.ArenaPoints || 0, xp: ac.XP || u.XP || 0, level: u.Level,
          teamName: A.teamById(u.TeamID)?.TeamName, rank: i + 1,
          movement: (yesterdayRank[p.UserID] || (i + 1)) - (i + 1),
          extra: { actual: p.Actual, target: p.Target, unit: A.kpiById(kpiId)?.Unit },
        };
      }).slice(0, 30);
    }
    if (filter === 'weekly' || filter === 'monthly') {
      const days = filter === 'weekly' ? 7 : 30;
      const dates = [...new Set(s.dailyScore.map(d => d.Date))].sort().slice(-days);
      const dateSet = new Set(dates);
      const acc = {};
      s.dailyScore.forEach(d => {
        if (!dateSet.has(d.Date)) return;
        if (!acc[d.UserID]) acc[d.UserID] = { sum: 0, n: 0, pts: 0 };
        acc[d.UserID].sum += d.PerformanceScore || 0;
        acc[d.UserID].n   += 1;
        acc[d.UserID].pts += d.Points_Earned || 0;
      });
      const ranked = Object.entries(acc).map(([uid, v]) => ({ uid, avg: v.sum / Math.max(1, v.n), pts: v.pts }))
        .sort((a, b) => b.avg - a.avg);
      return ranked.slice(0, 40).map((row, i) => {
        const u = A.userById(row.uid) || {};
        const ac = A.agentSnapshot(row.uid) || {};
        return {
          userId: row.uid, score: row.avg, sub: `${u.Level || ''} · ${row.pts.toLocaleString()} pts in window`,
          rag: row.avg >= 100 ? 'Green' : row.avg >= 92 ? 'Amber' : 'Red',
          points: ac.ArenaPointsBalance || u.ArenaPoints || 0, xp: ac.XP || u.XP || 0, level: u.Level,
          teamName: A.teamById(u.TeamID)?.TeamName, rank: i + 1, movement: 0,
        };
      });
    }
    if (filter === 'challenge') {
      // Wins + accepted participations
      const wins = {};
      (s.challengeResults || []).forEach(r => { if (r.Winner_UserID) wins[r.Winner_UserID] = (wins[r.Winner_UserID] || 0) + 1; });
      const accepted = {};
      (s.challengeParticipants || []).forEach(p => {
        if (p.Status === 'Accepted' || p.Status === 'Completed') {
          accepted[p.UserID] = (accepted[p.UserID] || 0) + 1;
        }
      });
      const candidates = new Set([...Object.keys(wins), ...Object.keys(accepted)]);
      const rows = [...candidates].map(uid => ({
        uid, wins: wins[uid] || 0, plays: accepted[uid] || 0,
      })).sort((a, b) => (b.wins - a.wins) || (b.plays - a.plays));
      return rows.slice(0, 30).map((row, i) => {
        const u = A.userById(row.uid) || {};
        const ac = A.agentSnapshot(row.uid) || {};
        return {
          userId: row.uid, score: row.wins,
          sub: `${row.plays} accepted · ${row.wins} won`,
          rag: row.wins > 0 ? 'Green' : 'Amber',
          points: ac.ArenaPointsBalance || u.ArenaPoints || 0, xp: ac.XP || u.XP || 0, level: u.Level,
          teamName: A.teamById(u.TeamID)?.TeamName, rank: i + 1, movement: 0,
          extra: { wins: row.wins, plays: row.plays, scoreLabel: 'wins' },
        };
      });
    }
    return [];
  }

  function renderLeaderboard() {
    const s = A.state;
    const me = A.userById(s.activeUserId);
    if (!me || me.Role !== 'Agent') return '<div class="glass rounded-2xl p-6">No agent selected.</div>';
    const filter = s.lbFilter || 'team';
    const agentKpis = A.kpisForRole('Agent', { processId: me.ProcessID });
    const defaultKpi = agentKpis.find(k => A.kpiMetricGroup(k) === 'outcome') || agentKpis[0] || {};
    const kpiId = agentKpis.some(k => k.KPI_ID === s.lbKpi) ? s.lbKpi : defaultKpi.KPI_ID;

    const rows = buildLeaderboardRows(me, filter, kpiId);
    const myRow = rows.find(r => r.userId === me.UserID);

    return `
      <div class="space-y-4 fade-in">

        <!-- HERO -->
        <section class="arena-hero p-4 sm:p-5 relative overflow-hidden">
          <span class="sparkle" style="top:14%;left:32%;animation-delay:.1s"></span>
          <span class="sparkle" style="top:42%;right:18%;animation-delay:.7s"></span>
          <div class="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div class="text-[10px] uppercase tracking-[0.22em] text-arena-muted font-bold">Leaderboard</div>
              <div class="font-display font-bold text-2xl sm:text-3xl tracking-tight">Climb the ranks. <span class="gold-text">Take the crown.</span></div>
              <div class="text-[12px] text-arena-muted">${LB_FILTERS.find(f => f.id === filter)?.desc || ''}</div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              ${myRow ? `<span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30"><i data-lucide="user-round" class="text-[10px]"></i> You · #${myRow.rank}</span>` : ''}
              <button data-action="agent-create-challenge" class="btn-primary text-[12px]"><i data-lucide="swords" class="text-[12px]"></i> Create Challenge</button>
            </div>
          </div>
        </section>

        <!-- FILTER TABS -->
        <section>
          <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold mb-2">Boards</div>
          <div class="scroll-x">
            ${LB_FILTERS.map(f => `
              <button data-action="set-lb-filter" data-filter="${f.id}" class="${filter === f.id ? 'gold-bg shadow-gold' : 'btn-ghost'} text-[12px] !px-3 !py-1.5 !rounded-full flex items-center gap-1.5 whitespace-nowrap">
                <i data-lucide="${f.icon}" class="text-[12px] ${filter === f.id ? '' : 'text-arena-muted'}"></i>
                <span class="font-semibold">${f.label}</span>
              </button>
            `).join('')}
          </div>
        </section>

        ${filter === 'kpi' ? `
          <section>
            <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold mb-2">Pick a KPI</div>
            <div class="scroll-x">
              ${agentKpis.map(k => `
                <button data-action="set-lb-kpi" data-kpi="${k.KPI_ID}" class="${kpiId === k.KPI_ID ? 'bg-arena-cyan/15 border-arena-cyan/40 text-arena-cyan' : 'btn-ghost'} text-[11px] !px-3 !py-1.5 !rounded-full whitespace-nowrap border">${escapeHtml(k.KPI_Name)}</button>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- TOP 3 PODIUM -->
        ${rows.length >= 3 ? renderPodium(rows.slice(0, 3), me, filter, kpiId) : ''}

        <!-- RANK LIST (4-N or all if podium not shown) -->
        <section>
          <div class="font-display font-bold text-[15px] mb-2 flex items-center gap-2"><i data-lucide="list-ordered" class="text-arena-cyan"></i> ${rows.length >= 3 ? 'Rank 4 onwards' : 'Standings'}</div>
          <div class="space-y-2">
            ${(rows.length >= 3 ? rows.slice(3) : rows).slice(0, 30).map(r => renderLbRow(r, me, filter, kpiId)).join('') || `<div class="glass rounded-2xl p-6 text-center text-arena-muted">No data yet.</div>`}
          </div>
        </section>
      </div>
    `;
  }

  function renderPodium(top3, me, filter, kpiId) {
    const [g, s, b] = top3; // gold, silver, bronze
    return `
      <section class="podium-wrap relative overflow-hidden rounded-2xl p-4 sm:p-6">
        <div class="absolute -top-12 left-1/2 -translate-x-1/2 w-72 h-72 level-glow"></div>
        <div class="font-display font-bold text-[14px] mb-3 flex items-center gap-2 relative"><i data-lucide="crown" class="text-arena-gold"></i> Top of the board</div>
        <div class="podium relative">
          ${podiumTile(s, me, 2, 'silver', kpiId)}
          ${podiumTile(g, me, 1, 'gold', kpiId)}
          ${podiumTile(b, me, 3, 'bronze', kpiId)}
        </div>
      </section>
    `;
  }

  function podiumTile(row, me, rank, tone, kpiId) {
    const u = A.userById(row.userId);
    const isMe = row.userId === me.UserID;
    const rankCls = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : 'rank-3';
    const tilePos = rank === 1 ? 'podium-1' : rank === 2 ? 'podium-2' : 'podium-3';
    return `
      <div class="podium-tile ${tilePos} ${isMe ? 'podium-me' : ''}">
        <div class="absolute -top-4 left-1/2 -translate-x-1/2">
          <div class="rank-badge ${rankCls} !w-9 !h-9 !text-[14px]">${rank}</div>
        </div>
        <div class="flex flex-col items-center gap-2 mt-3">
          ${u ? avatarHex(u, 'lg') : '<div class="hex hex-lg bg-white/5"></div>'}
          <div class="text-center">
            <div class="font-display font-bold text-[14px] truncate max-w-[140px]">${escapeHtml(u?.Name?.split(' ')[0] || row.userId)}</div>
            <div class="text-[10px] text-arena-muted truncate max-w-[140px]">${escapeHtml(row.teamName || '')}</div>
            <div class="text-[10px] text-arena-muted">${escapeHtml(u?.Level || row.level || '')}</div>
          </div>
          <div class="text-center mt-1">
            <div class="hero-num text-2xl ${row.rag === 'Green' ? 'rag-green' : row.rag === 'Amber' ? 'rag-amber' : 'rag-red'}">${(row.score || 0).toFixed(1)}</div>
            <div class="text-[10px] text-arena-muted">${row.extra?.scoreLabel ? row.extra.scoreLabel : 'score'}</div>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap justify-center mt-1">
            <span class="chip bg-white/5 border border-white/10 text-arena-muted">${(row.points || 0).toLocaleString()} pts</span>
            <span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30">${(row.xp || 0).toLocaleString()} progress</span>
          </div>
          ${!isMe ? `<button data-action="challenge-back" data-user="${row.userId}" data-kpi="${escapeHtml(kpiId || '')}" class="btn-primary text-[11px] !py-1 !px-2.5 mt-1"><i data-lucide="swords" class="text-[11px]"></i> Challenge</button>` : `<span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30 mt-1">YOU</span>`}
        </div>
      </div>
    `;
  }

  function renderLbRow(row, me, filter, kpiId) {
    const u = A.userById(row.userId);
    const isMe = row.userId === me.UserID;
    const rankCls = row.rank === 1 ? 'rank-1' : row.rank === 2 ? 'rank-2' : row.rank === 3 ? 'rank-3' : 'rank-other';
    const ragTone = row.rag === 'Green' ? 'rag-green' : row.rag === 'Amber' ? 'rag-amber' : 'rag-red';
    const ragDot = row.rag === 'Green' ? '<span class="pulse rag-green"></span>' : row.rag === 'Amber' ? '<span class="pulse rag-amber"></span>' : '<span class="pulse rag-red"></span>';
    const streak = A.streakForUser(row.userId);
    const moveChip = (() => {
      if (row.movement > 0) return `<span class="chip bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30 text-[10px] !px-1.5"><i data-lucide="arrow-up" class="text-[9px]"></i>${row.movement}</span>`;
      if (row.movement < 0) return `<span class="chip bg-arena-red/15 text-arena-red border border-arena-red/30 text-[10px] !px-1.5"><i data-lucide="arrow-down" class="text-[9px]"></i>${Math.abs(row.movement)}</span>`;
      return `<span class="chip bg-white/5 border border-white/10 text-arena-muted text-[10px] !px-1.5"><i data-lucide="minus" class="text-[9px]"></i></span>`;
    })();
    const streakChip = streak > 0
      ? `<span class="chip bg-arena-amber/15 text-arena-amber border border-arena-amber/30 text-[10px] !px-1.5"><i data-lucide="flame" class="text-[9px]"></i>${streak}d</span>`
      : `<span class="chip bg-white/5 border border-white/10 text-arena-muted text-[10px] !px-1.5"><i data-lucide="flame" class="text-[9px]"></i>0</span>`;

    const scoreLabel = filter === 'challenge' ? `${row.score} ${row.extra?.scoreLabel || 'wins'}` : `${(row.score || 0).toFixed(1)}`;

    return `
      <div class="lb-row rounded-xl p-3 flex items-center gap-3 ${isMe ? 'lb-me' : ''}">
        <div class="rank-badge ${rankCls}">${row.rank}</div>
        ${u ? avatarHex(u, 'sm') : '<div class="hex hex-sm bg-white/5"></div>'}
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-semibold truncate flex items-center gap-1.5">
            ${escapeHtml(u?.Name || row.userId)}
            ${isMe ? '<span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30 !text-[9px] !px-1.5">YOU</span>' : ''}
          </div>
          <div class="text-[10px] text-arena-muted truncate flex items-center gap-1.5">
            ${ragDot}
            <span>${escapeHtml(row.sub)}</span>
          </div>
        </div>
        <div class="hidden sm:flex flex-col items-end gap-0.5 mr-1">
          <div class="text-[11px] gold-text font-bold">${(row.points || 0).toLocaleString()} pts</div>
          <div class="text-[10px] text-arena-violet">${(row.xp || 0).toLocaleString()} progress</div>
        </div>
        <div class="text-right">
          <div class="text-[14px] font-bold ${ragTone}">${scoreLabel}</div>
          <div class="text-[10px] text-arena-muted">${escapeHtml(u?.Level || row.level || '')}</div>
        </div>
        <div class="flex flex-col items-end gap-1">
          <div class="flex items-center gap-1">${streakChip}${moveChip}</div>
          ${!isMe ? `<button data-action="challenge-back" data-user="${row.userId}" data-kpi="${escapeHtml(kpiId || '')}" class="btn-primary text-[10.5px] !py-1 !px-2"><i data-lucide="swords" class="text-[10px]"></i> Challenge</button>` : ''}
        </div>
      </div>
    `;
  }

  // ---- BROADCASTS (Agent view) -------------------------------------------
  function renderBroadcasts() {
    return renderModuleListView({
      title: 'Broadcasts',
      subtitle: 'Announcements, alerts and process updates assigned to you',
      moduleTypes: ['Broadcast'],
      icon: 'megaphone',
    });
  }

  // ---- TRAINING (Agent view) — Training + PKT --------------------------
  function renderTraining() {
    return renderModuleListView({
      title: 'Training Arena',
      subtitle: 'Training modules and knowledge checks (PKTs) assigned to you',
      moduleTypes: ['Training', 'PKT'],
      icon: 'graduation-cap',
    });
  }

  function renderModuleListView({ title, subtitle, moduleTypes, icon }) {
    const s = A.state;
    const me = A.userById(s.activeUserId);
    const allowed = new Set(moduleTypes);
    const myAssigns = s.assignments.filter(a => a.UserID === me.UserID);
    const items = myAssigns.map(a => {
      const m = A.moduleById(a.Module_ID); const c = A.findCompletion(a.Assignment_ID);
      return { a, m, c };
    }).filter(x => x.m && allowed.has(x.m.Module_Type));
    const pending = items.filter(x => x.c?.Status !== 'Completed');
    const completed = items.filter(x => x.c?.Status === 'Completed');
    const overdue = items.filter(x => x.a.Overdue === 'Yes' && x.c?.Status !== 'Completed');

    return `
      <div class="space-y-4 fade-in">
        <header class="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div class="font-display font-bold text-2xl tracking-tight flex items-center gap-2"><i data-lucide="${icon}" class="text-arena-gold"></i> ${title}</div>
            <div class="text-[12px] text-arena-muted">${subtitle}</div>
          </div>
          <div class="flex gap-2">
            <span class="chip bg-arena-violet/10 text-arena-violet border border-arena-violet/30">${pending.length} pending</span>
            ${overdue.length ? `<span class="chip bg-arena-red/15 text-arena-red border border-arena-red/30">${overdue.length} overdue</span>` : ''}
            <span class="chip bg-arena-emerald/10 text-arena-emerald border border-arena-emerald/30">${completed.length} done</span>
          </div>
        </header>

        ${pending.length ? `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${pending.map(renderAgentTrainingCard).join('')}
          </div>
        ` : `
          <div class="glass rounded-2xl p-8 text-center">
            <div class="w-12 h-12 mx-auto rounded-full bg-arena-emerald/10 border border-arena-emerald/30 grid place-items-center mb-3">
              <i data-lucide="party-popper" class="text-arena-emerald text-xl"></i>
            </div>
            <div class="font-semibold">All caught up!</div>
            <div class="text-[12px] text-arena-muted mt-1">No pending items.</div>
          </div>
        `}

        ${completed.length ? `
          <div class="mt-2">
            <div class="text-[12px] text-arena-muted uppercase tracking-wider font-semibold mb-2">Completed</div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
              ${completed.slice(0, 9).map(renderAgentCompletedTile).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderAgentTrainingCard({ a, m, c }) {
    const isOverdue = a.Overdue === 'Yes';
    const status = c?.Status || 'Not Started';
    const pkt = A.pktForModule(m.Module_ID);
    const userAttempts = pkt ? A.state.pktAttempts.filter(x => x.PKT_ID === pkt.PKT_ID && x.UserID === a.UserID) : [];
    const passedPkt = userAttempts.some(x => x.Result === 'Pass');
    let action = null;
    if (m.Module_Type === 'Broadcast') {
      if (status === 'Not Started') action = { label: 'View', icon: 'eye', kind: 'view' };
      else if (c?.Acknowledged !== 'Yes' && m.Requires_Ack === 'Yes') action = { label: 'Acknowledge', icon: 'check-check', kind: 'ack' };
    } else if (m.Module_Type === 'Training') {
      if (status === 'Not Started') action = { label: 'Start training', icon: 'play', kind: 'view' };
      else if (c?.Completed !== 'Yes') action = { label: 'Mark complete', icon: 'check-check', kind: 'complete' };
    } else if (m.Module_Type === 'PKT') {
      if (passedPkt) action = null;
      else if (userAttempts.length >= (pkt?.Max_Attempts || 2)) action = null;
      else action = { label: userAttempts.length ? 'Retry PKT' : 'Take PKT', icon: 'graduation-cap', kind: 'pkt' };
    }
    const tone = isOverdue ? 'border-arena-red/40' : (m.Priority === 'Critical' ? 'border-arena-amber/30' : 'border-white/10');
    const icon = m.Module_Type === 'Broadcast' ? 'megaphone' : m.Module_Type === 'Training' ? 'book-open' : 'graduation-cap';

    return `
      <div class="rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border ${tone} p-4 flex flex-col gap-3">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2">
            <div class="w-9 h-9 rounded-xl bg-arena-gold/10 border border-arena-gold/30 grid place-items-center"><i data-lucide="${icon}" class="text-arena-gold"></i></div>
            <div>
              <div class="text-[10px] text-arena-muted uppercase tracking-wider font-bold">${m.Module_Type}</div>
              <div class="font-semibold leading-tight">${escapeHtml(m.Title)}</div>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1">
            ${priorityChip(m.Priority)}
            ${isOverdue ? '<span class="chip bg-arena-red/15 text-arena-red border border-arena-red/30"><i data-lucide="alarm-clock" class="text-[10px]"></i> Overdue</span>' : ''}
          </div>
        </div>
        <div class="text-[12px] text-arena-text/80 line-clamp-2">${escapeHtml(m.Description || '')}</div>
        <div class="flex items-center justify-between text-[11px]">
          <div class="flex items-center gap-1 text-arena-muted"><i data-lucide="clock" class="text-[12px]"></i> ${dueLabel(m.Due_Date)}</div>
          <div class="flex items-center gap-2">
            <span class="text-arena-gold font-semibold">+${m.Points_On_Completion} pts</span>
            <span class="text-arena-violet font-semibold">+${m.XP_On_Completion} progress</span>
          </div>
        </div>
        ${m.Badge_Unlock ? `<div class="text-[11px] text-arena-gold flex items-center gap-1"><i data-lucide="award" class="text-[12px]"></i> Unlocks <span class="font-semibold">${escapeHtml(m.Badge_Unlock)}</span></div>` : ''}
        <div class="flex items-center justify-between mt-1">
          <span class="chip ${status === 'Completed' ? 'bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30' : status === 'Acknowledged' ? 'bg-arena-violet/15 text-arena-violet border border-arena-violet/30' : status === 'In Progress' ? 'bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30' : 'bg-white/5 text-arena-muted border border-white/10'}">${isOverdue && status !== 'Completed' ? 'Overdue' : status}</span>
          ${action ? `
            <button data-action="agent-${action.kind}" data-assignment="${a.Assignment_ID}" data-module="${m.Module_ID}" class="btn-primary text-[12px]"><i data-lucide="${action.icon}" class="text-[12px]"></i> ${action.label}</button>
          ` : `<span class="chip bg-arena-emerald/10 text-arena-emerald border border-arena-emerald/30"><i data-lucide="check" class="text-[10px]"></i> Done</span>`}
        </div>
      </div>
    `;
  }

  function renderAgentCompletedTile({ m, c }) {
    return `
      <div class="rounded-xl bg-arena-emerald/[0.04] border border-arena-emerald/20 p-3">
        <div class="flex items-center gap-2 mb-1">
          <i data-lucide="${m.Module_Type === 'Broadcast' ? 'megaphone' : m.Module_Type === 'Training' ? 'book-open' : 'graduation-cap'}" class="text-arena-emerald text-[14px]"></i>
          <div class="text-[12px] font-semibold leading-tight flex-1 truncate">${escapeHtml(m.Title)}</div>
        </div>
        <div class="text-[10px] text-arena-muted mb-1">${c?.Completion_Date || ''}</div>
        <div class="flex items-center gap-2 text-[11px] flex-wrap">
          <span class="text-arena-gold font-semibold">+${c?.Points_Earned || 0} pts</span>
          <span class="text-arena-violet font-semibold">+${c?.XP_Earned || 0} progress</span>
          ${c?.Badge_Earned ? `<span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30"><i data-lucide="award" class="text-[10px]"></i> ${escapeHtml(c.Badge_Earned)}</span>` : ''}
        </div>
      </div>
    `;
  }

  // ---- ARENA STORE (Marketplace) ----------------------------------------

  const STORE_CATEGORIES = [
    { id: 'all',                   label: 'All',                    icon: 'layers',          color: 'text-arena-text',    glow: 'rgba(255,255,255,0.15)' },
    { id: 'Instant Perks',         label: 'Instant Perks',          icon: 'zap',             color: 'text-arena-cyan',    glow: 'rgba(58,212,255,0.45)' },
    { id: 'Recognition Rewards',   label: 'Recognition',            icon: 'medal',           color: 'text-arena-gold',    glow: 'rgba(245,201,90,0.45)' },
    { id: 'Work-Life Rewards',     label: 'Work-Life',              icon: 'sun',             color: 'text-arena-emerald', glow: 'rgba(34,201,138,0.45)' },
    { id: 'Learning Rewards',      label: 'Learning',               icon: 'graduation-cap',  color: 'text-arena-violet',  glow: 'rgba(124,92,255,0.45)' },
    { id: 'Team Rewards',          label: 'Team',                   icon: 'users-round',     color: 'text-arena-pink',    glow: 'rgba(255,92,138,0.45)' },
  ];

  function categoryStoreMeta(id) { return STORE_CATEGORIES.find(c => c.id === id) || STORE_CATEGORIES[0]; }

  function rewardIconName(r) {
    if (r.Icon) return r.Icon;
    return rewardIcon(r.Category);
  }

  function renderStore() {
    const s = A.state;
    const me = A.userById(s.activeUserId);
    if (!me || me.Role !== 'Agent') return '<div class="glass rounded-2xl p-6">No agent selected.</div>';
    const ac = A.agentSnapshot(me.UserID) || {};
    const balance = ac.ArenaPointsBalance || me.ArenaPoints || 0;

    // Redemption + ledger summaries for THIS user
    const myRedemptions = s.redemptions.filter(r => r.UserID === me.UserID);
    const myPending = myRedemptions.filter(r => r.Status === 'Pending Approval');
    const myFulfilled = myRedemptions.filter(r => r.Status === 'Fulfilled');
    const totalSpent = (s.pointsLedger || []).filter(p => p.UserID === me.UserID && p.Source_Type === 'Reward_Redemption').reduce((s, p) => s + Math.abs(p.Points_Delta || 0), 0);
    const totalEarned = (s.pointsLedger || []).filter(p => p.UserID === me.UserID && (p.Points_Delta || 0) > 0).reduce((s, p) => s + (p.Points_Delta || 0), 0)
                      || (me.ArenaPoints + totalSpent); // fallback if ledger sparse

    // Category filter
    const cat = s.storeCategory || 'all';
    const sortedRewards = s.rewards.slice().sort((a, b) => a.Points_Required - b.Points_Required);
    const filteredCatalog = cat === 'all' ? sortedRewards : sortedRewards.filter(r => r.Category === cat);

    // Affordability segments
    const affordable = sortedRewards.filter(r => r.Status === 'Active' && r.Stock > 0 && balance >= r.Points_Required);
    const nextUnlock = sortedRewards.find(r => r.Status === 'Active' && r.Stock > 0 && balance < r.Points_Required) || null;

    // Featured: cheapest aspirational reward, or biggest reward they can afford
    const featured = (() => {
      const reachableAspirational = sortedRewards.find(r => r.Tier === 'Aspirational' && balance >= r.Points_Required);
      if (reachableAspirational) return reachableAspirational;
      // Otherwise the most premium one within reach with > 0 stock
      const premium = affordable.filter(r => r.Tier === 'Premium').sort((a, b) => b.Points_Required - a.Points_Required)[0];
      if (premium) return premium;
      // Otherwise the next aspirational unlock
      return sortedRewards.find(r => r.Tier === 'Aspirational') || sortedRewards[sortedRewards.length - 1];
    })();

    return `
      <div class="space-y-4 fade-in">

        <!-- WALLET HERO + SUMMARY -->
        <section class="store-wallet relative overflow-hidden rounded-2xl p-4 sm:p-5">
          <span class="sparkle" style="top:18%;left:34%;animation-delay:.1s"></span>
          <span class="sparkle" style="bottom:24%;right:18%;animation-delay:.7s"></span>
          <div class="flex items-start gap-4 flex-wrap">
            <div class="relative">
              <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl gold-bg shadow-gold grid place-items-center"><i data-lucide="wallet" class="text-[24px]"></i></div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[10px] uppercase tracking-[0.22em] text-arena-muted font-bold">Arena Wallet</div>
              <div class="hero-num text-3xl sm:text-4xl gold-text leading-tight"><span data-counter="${balance}">${balance.toLocaleString()}</span> <span class="text-[14px] sm:text-[16px] text-arena-muted font-semibold">pts</span></div>
              <div class="text-[12px] text-arena-muted">${escapeHtml(me.Name)} · ${A.teamById(me.TeamID)?.TeamName || ''}</div>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
            <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3">
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Earned</div>
              <div class="text-xl font-bold font-display gold-text">+${(totalEarned || 0).toLocaleString()}</div>
              <div class="text-[10px] text-arena-muted">all time</div>
            </div>
            <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3">
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Spent</div>
              <div class="text-xl font-bold font-display text-arena-pink">−${totalSpent.toLocaleString()}</div>
              <div class="text-[10px] text-arena-muted">${myRedemptions.length} redemption${myRedemptions.length === 1 ? '' : 's'}</div>
            </div>
            <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3">
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Fulfilled</div>
              <div class="text-xl font-bold font-display text-arena-emerald">${myFulfilled.length}</div>
              <div class="text-[10px] text-arena-muted">delivered</div>
            </div>
            <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3">
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Pending</div>
              <div class="text-xl font-bold font-display text-arena-amber">${myPending.length}</div>
              <div class="text-[10px] text-arena-muted">awaiting approval</div>
            </div>
          </div>
        </section>

        <!-- FEATURED REWARD BANNER -->
        ${featured ? renderFeaturedReward(featured, balance) : ''}

        <!-- WITHIN REACH STRIP -->
        ${affordable.length ? `
          <section>
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[15px] flex items-center gap-2"><i data-lucide="sparkles" class="text-arena-gold"></i> Rewards within reach</div>
              <span class="text-[11px] text-arena-muted">${affordable.length} unlocked</span>
            </div>
            <div class="scroll-x">
              ${affordable.slice(0, 8).map(r => renderRewardTile(r, balance)).join('')}
            </div>
          </section>
        ` : ''}

        <!-- NEXT UNLOCK TEASER -->
        ${nextUnlock ? renderNextUnlock(nextUnlock, balance) : ''}

        <!-- CATEGORY PILLS -->
        <section>
          <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold mb-2">Categories</div>
          <div class="scroll-x">
            ${STORE_CATEGORIES.map(c => {
              const count = c.id === 'all' ? sortedRewards.length : sortedRewards.filter(r => r.Category === c.id).length;
              return `
                <button data-action="set-store-category" data-category="${c.id}" class="${cat === c.id ? 'gold-bg shadow-gold' : 'btn-ghost'} text-[12px] !px-3 !py-1.5 !rounded-full flex items-center gap-1.5 whitespace-nowrap">
                  <i data-lucide="${c.icon}" class="text-[12px] ${cat === c.id ? '' : c.color}"></i>
                  <span class="font-semibold">${c.label}</span>
                  <span class="${cat === c.id ? 'bg-black/20 text-black' : 'bg-white/10 text-arena-muted'} rounded-full px-1.5 py-0.5 text-[10px] font-bold">${count}</span>
                </button>
              `;
            }).join('')}
          </div>
        </section>

        <!-- MARKETPLACE GRID -->
        <section>
          <div class="flex items-center justify-between mb-2">
            <div class="font-display font-bold text-[15px] flex items-center gap-2"><i data-lucide="store" class="text-arena-gold"></i> ${cat === 'all' ? 'All rewards' : escapeHtml(cat)}</div>
            <span class="text-[11px] text-arena-muted">${filteredCatalog.length} item${filteredCatalog.length === 1 ? '' : 's'}</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${filteredCatalog.map(r => renderMarketplaceCard(r, balance, me)).join('')}
          </div>
        </section>

        <!-- PENDING APPROVAL -->
        ${myPending.length ? `
          <section>
            <div class="font-display font-bold text-[15px] flex items-center gap-2 mb-2"><i data-lucide="hourglass" class="text-arena-amber"></i> Pending approvals</div>
            <div class="space-y-2">
              ${myPending.map(rd => {
                const r = s.rewards.find(x => x.Reward_ID === rd.Reward_ID);
                const owner = A.userById(rd.Fulfilment_Owner);
                return `
                  <div class="rounded-xl bg-arena-amber/[0.06] border border-arena-amber/30 p-3 flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-arena-amber/20 grid place-items-center"><i data-lucide="${r ? rewardIconName(r) : 'gift'}" class="text-arena-amber text-[16px]"></i></div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-semibold leading-tight">${escapeHtml(r?.Reward_Name || rd.Reward_ID)}</div>
                      <div class="text-[10.5px] text-arena-muted">Submitted ${rd.Redemption_Date} · routed to ${escapeHtml(owner?.Name || rd.Fulfilment_Owner)}</div>
                    </div>
                    <div class="text-right">
                      <div class="text-[12px] gold-text font-bold">−${rd.Points_Spent} pts</div>
                      <span class="chip bg-arena-amber/15 text-arena-amber border border-arena-amber/30">Pending</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        ` : ''}

        <!-- HISTORY -->
        ${myRedemptions.length ? `
          <section>
            <div class="font-display font-bold text-[15px] flex items-center gap-2 mb-2"><i data-lucide="history" class="text-arena-cyan"></i> Redemption history</div>
            <div class="space-y-2">
              ${myRedemptions.slice(0, 12).map(rd => {
                const r = s.rewards.find(x => x.Reward_ID === rd.Reward_ID);
                const tone = rd.Status === 'Fulfilled' ? 'emerald' : rd.Status === 'Pending Approval' ? 'amber' : rd.Status === 'Rejected' ? 'red' : 'muted';
                const colorClass = tone === 'emerald' ? 'text-arena-emerald' : tone === 'amber' ? 'text-arena-amber' : tone === 'red' ? 'text-arena-red' : 'text-arena-muted';
                const bgClass = tone === 'emerald' ? 'bg-arena-emerald/15 border-arena-emerald/30' : tone === 'amber' ? 'bg-arena-amber/15 border-arena-amber/30' : tone === 'red' ? 'bg-arena-red/15 border-arena-red/30' : 'bg-white/5 border-white/10';
                return `
                  <div class="rounded-xl bg-white/[0.02] border border-white/8 p-3 flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-white/5 grid place-items-center"><i data-lucide="${r ? rewardIconName(r) : 'gift'}" class="text-arena-muted text-[16px]"></i></div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-semibold leading-tight">${escapeHtml(r?.Reward_Name || rd.Reward_ID)}</div>
                      <div class="text-[10.5px] text-arena-muted">${rd.Redemption_Date}</div>
                    </div>
                    <div class="text-right">
                      <div class="text-[12px] gold-text font-bold">−${rd.Points_Spent} pts</div>
                      <span class="chip ${bgClass} ${colorClass} border">${rd.Status}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        ` : ''}
      </div>
    `;
  }

  function renderFeaturedReward(r, balance) {
    const affordable = balance >= r.Points_Required;
    const inStock = r.Stock > 0;
    const remaining = Math.max(0, r.Points_Required - balance);
    const pct = Math.min(100, Math.round((balance / r.Points_Required) * 100));
    return `
      <section class="featured-reward relative overflow-hidden rounded-2xl p-4 sm:p-5">
        <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center relative">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <span class="chip bg-arena-gold/20 text-arena-gold border border-arena-gold/40"><i data-lucide="crown" class="text-[10px]"></i> Featured</span>
              <span class="chip bg-white/5 border border-white/10 text-arena-muted">${escapeHtml(r.Category)}</span>
              ${r.Tier === 'Aspirational' ? '<span class="chip bg-arena-pink/15 text-arena-pink border border-arena-pink/40"><i data-lucide="sparkles" class="text-[10px]"></i> Aspirational</span>' : ''}
            </div>
            <div class="font-display font-bold text-[20px] sm:text-[24px] leading-tight gold-text">${escapeHtml(r.Reward_Name)}</div>
            <div class="text-[12px] text-arena-text/85 line-clamp-2 mt-1">${escapeHtml(r.Description || '')}</div>
            <div class="text-[10.5px] text-arena-muted mt-2">${escapeHtml(r.Eligibility_Rule || '')}</div>

            <div class="mt-3">
              <div class="flex items-center justify-between text-[10px] text-arena-muted mb-1">
                <span class="uppercase tracking-wider font-semibold">${affordable ? 'Unlocked' : `${remaining.toLocaleString()} more pts to unlock`}</span>
                <span class="text-arena-text font-semibold">${balance.toLocaleString()} / ${r.Points_Required.toLocaleString()}</span>
              </div>
              <div class="progress thick gold"><span style="width:${pct}%"></span></div>
            </div>

            <div class="flex items-center gap-2 mt-3 flex-wrap">
              <div class="text-2xl font-bold gold-text font-display">${r.Points_Required.toLocaleString()} pts</div>
              ${affordable && inStock
                ? `<button data-action="agent-redeem" data-reward="${r.Reward_ID}" class="btn-primary !py-2.5 !px-4 text-[13px] shadow-gold flex items-center gap-1.5"><i data-lucide="gift" class="text-[14px]"></i> Redeem now</button>`
                : !inStock
                  ? `<button disabled class="btn-secondary text-[13px] opacity-50">Out of stock</button>`
                  : `<button data-nav="missions" class="btn-secondary text-[13px] flex items-center gap-1.5"><i data-lucide="flag" class="text-[14px]"></i> Earn more points</button>`}
            </div>
          </div>
          <div class="featured-art hidden sm:flex items-center justify-center">
            <div class="hex hex-lg gold-bg shadow-gold relative" style="width:96px;height:108px;">
              <i data-lucide="${rewardIconName(r)}" class="text-[36px]"></i>
              <span class="hex-glow"></span>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderRewardTile(r, balance) {
    const affordable = balance >= r.Points_Required;
    const inStock = r.Stock > 0;
    return `
      <div class="reward-tile rounded-2xl p-3 w-[200px] flex-shrink-0 relative">
        <div class="flex items-start justify-between">
          <div class="hex hex-sm gold-bg shadow-gold"><i data-lucide="${rewardIconName(r)}" class="text-[14px]"></i></div>
          ${r.Approval_Required === 'Yes' ? '<span class="chip bg-arena-amber/15 text-arena-amber border border-arena-amber/30 text-[9px]">Approval</span>' : '<span class="chip bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30 text-[9px]">Instant</span>'}
        </div>
        <div class="font-semibold text-[13px] mt-2 leading-tight line-clamp-2">${escapeHtml(r.Reward_Name)}</div>
        <div class="text-[10px] text-arena-muted mt-0.5">${escapeHtml(r.Category)}</div>
        <div class="flex items-center justify-between mt-2">
          <div class="text-[12px] gold-text font-bold">${r.Points_Required} pts</div>
          <button data-action="agent-redeem" data-reward="${r.Reward_ID}" ${(!affordable || !inStock) ? 'disabled' : ''} class="${affordable && inStock ? 'btn-primary !py-1 !px-2.5' : 'btn-secondary !py-1 !px-2.5'} text-[11px]">
            ${affordable && inStock ? 'Redeem' : !inStock ? 'Out' : 'Locked'}
          </button>
        </div>
      </div>
    `;
  }

  function renderNextUnlock(r, balance) {
    const remaining = r.Points_Required - balance;
    const pct = Math.min(100, Math.round((balance / r.Points_Required) * 100));
    return `
      <section class="rounded-2xl glass p-4 border-arena-violet/30 border relative overflow-hidden">
        <div class="absolute -right-8 -top-10 w-40 h-40 level-glow"></div>
        <div class="flex items-center gap-3 relative">
          <div class="hex hex-lg" style="background: linear-gradient(135deg, #8a6cff, #5e3eff); width:64px; height:72px;">
            <i data-lucide="${rewardIconName(r)}" class="text-[24px] text-white"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[10px] uppercase tracking-wider text-arena-violet font-bold">Next unlock</div>
            <div class="font-display font-bold text-[16px] leading-tight">${escapeHtml(r.Reward_Name)}</div>
            <div class="text-[11px] text-arena-muted">${escapeHtml(r.Category)} · ${remaining.toLocaleString()} more pts</div>
            <div class="mt-2">
              <div class="flex items-center justify-between text-[10px] text-arena-muted mb-1">
                <span class="uppercase tracking-wider font-semibold">Progress</span>
                <span class="text-arena-text font-semibold">${balance.toLocaleString()} / ${r.Points_Required.toLocaleString()}</span>
              </div>
              <div class="progress thick"><span style="width:${pct}%"></span></div>
            </div>
          </div>
          <button data-nav="missions" class="hidden sm:inline-flex btn-secondary text-[12px] items-center gap-1.5"><i data-lucide="flag" class="text-[12px]"></i> Earn more</button>
        </div>
      </section>
    `;
  }

  function renderMarketplaceCard(r, balance, me) {
    const affordable = balance >= r.Points_Required;
    const inStock = r.Stock > 0;
    const cat = STORE_CATEGORIES.find(c => c.id === r.Category) || STORE_CATEGORIES[0];
    const stateClass = !inStock ? 'reward-card-empty' : !affordable ? 'reward-card-locked' : r.Tier === 'Aspirational' ? 'reward-card-aspirational' : r.Tier === 'Premium' ? 'reward-card-premium' : 'reward-card-available';

    return `
      <article class="reward-card ${stateClass} relative overflow-hidden rounded-2xl p-4" style="--card-glow: ${cat.glow}">
        <div class="reward-rays" aria-hidden="true"></div>

        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="hex hex-sm relative" style="background: linear-gradient(135deg, var(--card-glow), rgba(0,0,0,0.4));">
            <i data-lucide="${rewardIconName(r)}" class="text-[15px] text-white"></i>
          </div>
          <div class="flex flex-col items-end gap-1">
            ${r.Approval_Required === 'Yes' ? '<span class="chip bg-arena-amber/15 text-arena-amber border border-arena-amber/30">Approval</span>' : '<span class="chip bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30">Instant</span>'}
            <span class="chip bg-white/5 border border-white/10 text-arena-muted ${r.Stock <= 5 ? '!text-arena-red !border-arena-red/30' : ''}">${r.Stock <= 5 ? `Only ${r.Stock} left` : `Stock ${r.Stock}`}</span>
          </div>
        </div>

        <h3 class="font-display font-bold text-[15px] sm:text-[16px] leading-tight">${escapeHtml(r.Reward_Name)}</h3>
        <div class="flex items-center gap-1.5 mt-0.5 mb-1.5">
          <span class="text-[10.5px] ${cat.color} uppercase tracking-wider font-bold">${escapeHtml(r.Category)}</span>
          ${r.Tier === 'Aspirational' ? '<span class="chip bg-arena-pink/15 text-arena-pink border border-arena-pink/30 !text-[9px]"><i data-lucide="sparkles" class="text-[9px]"></i> Aspirational</span>' : ''}
          ${r.Tier === 'Premium' ? '<span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30 !text-[9px]"><i data-lucide="crown" class="text-[9px]"></i> Premium</span>' : ''}
        </div>
        <p class="text-[12px] text-arena-text/80 line-clamp-2 mb-3">${escapeHtml(r.Description || '')}</p>

        <div class="text-[10.5px] text-arena-muted mb-3 flex items-start gap-1"><i data-lucide="info" class="text-[10px] mt-0.5"></i><span>${escapeHtml(r.Eligibility_Rule || 'Open to all active agents')}</span></div>

        <div class="flex items-center justify-between gap-2">
          <div>
            <div class="text-2xl font-bold font-display gold-text leading-none">${r.Points_Required.toLocaleString()}</div>
            <div class="text-[10px] text-arena-muted uppercase tracking-wider font-semibold">Arena points</div>
          </div>
          ${affordable && inStock
            ? `<button data-action="agent-redeem" data-reward="${r.Reward_ID}" class="btn-primary text-[12.5px] flex items-center gap-1.5"><i data-lucide="gift" class="text-[13px]"></i> Redeem</button>`
            : !inStock
              ? `<button disabled class="btn-secondary text-[12.5px] opacity-50 cursor-not-allowed">Out of stock</button>`
              : `<div class="text-right">
                  <div class="text-[12px] text-arena-text font-semibold">Need ${(r.Points_Required - balance).toLocaleString()}</div>
                  <button data-nav="missions" class="text-[11px] text-arena-cyan hover:underline">Earn more →</button>
                </div>`
          }
        </div>
      </article>
    `;
  }

  // ---- PROFILE -----------------------------------------------------------
  function renderProfile() {
    const s = A.state;
    const me = A.userById(s.activeUserId);
    const ac = A.agentSnapshot(me.UserID) || {};
    const lvl = A.levelInfo(me.XP || 0);
    // Earned badges = seeded Agent_Badges + any earned via training-completion in this session
    const earnedFromAgentBadges = (s.agentBadges || []).filter(ab => ab.UserID === me.UserID).map(ab => ab.Badge_ID);
    const earnedFromCompletion = s.completion.filter(c => c.UserID === me.UserID && c.Badge_Earned).map(c => c.Badge_Earned);
    const earnedSet = new Set();
    earnedFromAgentBadges.forEach(id => earnedSet.add(id));
    s.badges.forEach(b => { if (earnedFromCompletion.includes(b.Badge_Name)) earnedSet.add(b.Badge_ID); });
    const myBadges = s.badges.filter(b => earnedSet.has(b.Badge_ID));
    const lockedBadges = s.badges.filter(b => !earnedSet.has(b.Badge_ID));

    // Activity = ledger entries for this user (most recent) + this-session activity
    const ledger = (s.pointsLedger || []).filter(p => p.UserID === me.UserID).slice(-15).reverse();
    const sessionRecent = s.activity.filter(a => a.by === me.Name).slice(0, 8);

    // Recognitions received
    const recsReceived = (s.recognition || []).filter(r => r.UserID === me.UserID);
    return `
      <div class="space-y-4 fade-in">
        <section class="arena-hero p-4 sm:p-5">
          <div class="flex items-center gap-4 flex-wrap">
            ${avatarHex(me, 'lg')}
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <div class="font-display font-bold text-xl tracking-tight">${escapeHtml(me.Name)}</div>
                <span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30">${lvl.name} League · L${lvl.level}</span>
              </div>
              <div class="text-[12px] text-arena-muted">${A.teamById(me.TeamID)?.TeamName} · ${A.processById(me.ProcessID)?.ProcessName} · ${me.Location}</div>
              <div class="mt-2">
                <div class="flex items-center justify-between text-[10px] text-arena-muted mb-1"><span class="uppercase tracking-wider font-semibold">Level Progress</span><span class="text-arena-text font-semibold">${(me.XP || 0).toLocaleString()} progress · ${lvl.into}/${lvl.span} into ${lvl.name}</span></div>
                <div class="progress thick"><span style="width:${lvl.pct}%"></span></div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:w-auto w-full">
              <div class="rounded-xl glass px-3 py-2"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Wallet</div><div class="hero-num text-xl gold-text">${(ac.ArenaPointsBalance || me.ArenaPoints || 0).toLocaleString()}</div></div>
              <div class="rounded-xl glass px-3 py-2"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Badges</div><div class="hero-num text-xl text-arena-emerald">${myBadges.length}</div></div>
            </div>
          </div>
        </section>

        <section>
          <div class="text-[12px] text-arena-muted uppercase tracking-wider font-semibold mb-2">Earned badges</div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            ${myBadges.length ? myBadges.map(b => renderBadgeCard(b, true)).join('') : `<div class="glass rounded-xl p-4 text-arena-muted text-[13px] col-span-full">Complete a training or hit a target to unlock your first badge.</div>`}
          </div>
        </section>

        <section>
          <div class="text-[12px] text-arena-muted uppercase tracking-wider font-semibold mb-2">Locked badges</div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            ${lockedBadges.map(b => renderBadgeCard(b, false)).join('')}
          </div>
        </section>

        ${recsReceived.length ? `
        <section>
          <div class="text-[12px] text-arena-muted uppercase tracking-wider font-semibold mb-2">Recognitions received</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${recsReceived.map(r => `
              <div class="glass rounded-2xl p-3 border-arena-gold/30 border">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg gold-bg grid place-items-center"><i data-lucide="medal" class="text-[14px]"></i></div>
                  <div class="flex-1">
                    <div class="font-semibold text-[13px]">${escapeHtml(r.Title || 'Recognition')}</div>
                    <div class="text-[10px] text-arena-muted">From ${escapeHtml(A.userById(r.Given_By)?.Name || r.Given_By)} · ${r.Given_Date}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-[12px] gold-text font-bold">+${r.Points_Awarded} pts</div>
                    <div class="text-[10px] text-arena-violet font-semibold">+${r.XP_Awarded} progress</div>
                  </div>
                </div>
                <div class="text-[12px] text-arena-text/80 mt-1">${escapeHtml(r.Reason || '')}</div>
              </div>
            `).join('')}
          </div>
        </section>
        ` : ''}

        <section>
          <div class="text-[12px] text-arena-muted uppercase tracking-wider font-semibold mb-2">Points & Level Progress ledger</div>
          <div class="glass rounded-2xl p-3 max-h-[55vh] overflow-y-auto scrollbar-thin">
            ${ledger.length ? ledger.map(l => {
              const tone = l.Source_Type === 'Mission' ? 'bg-arena-gold' :
                           l.Source_Type === 'Challenge' ? 'bg-arena-cyan' :
                           l.Source_Type === 'Training' || l.Source_Type === 'PKT' ? 'bg-arena-violet' :
                           l.Source_Type === 'Recognition' ? 'bg-arena-emerald' :
                           l.Source_Type === 'Reward_Redemption' ? 'bg-arena-pink' :
                           'bg-arena-muted';
              return `
                <div class="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
                  <div class="w-1.5 h-1.5 rounded-full ${tone} mt-2"></div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] truncate">${escapeHtml(l.Description)}</div>
                    <div class="text-[10px] text-arena-muted">${l.Source_Type} · ${(l.Timestamp || '').slice(0, 16).replace('T', ' ')}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-[12px] font-bold ${l.Points_Delta >= 0 ? 'gold-text' : 'rag-red'}">${l.Points_Delta >= 0 ? '+' : ''}${l.Points_Delta} pts</div>
                  </div>
                </div>
              `;
            }).join('') : `<div class="text-arena-muted text-[13px] text-center py-4">No ledger entries yet.</div>`}
          </div>
        </section>

        ${sessionRecent.length ? `
        <section>
          <div class="text-[12px] text-arena-muted uppercase tracking-wider font-semibold mb-2">This session</div>
          <div class="glass rounded-2xl p-3">
            ${sessionRecent.map(a => `
              <div class="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
                <div class="w-1.5 h-1.5 rounded-full ${a.kind === 'mission' ? 'bg-arena-gold' : a.kind === 'challenge' ? 'bg-arena-cyan' : a.kind === 'training' ? 'bg-arena-violet' : 'bg-arena-emerald'} mt-2"></div>
                <div class="flex-1 text-[13px]">${escapeHtml(a.text)}</div>
                <div class="text-[10px] text-arena-muted">${new Date(a.at).toLocaleTimeString()}</div>
              </div>
            `).join('')}
          </div>
        </section>
        ` : ''}
      </div>
    `;
  }

  function renderBadgeCard(b, earned) {
    return `
      <div class="${earned ? 'badge-shine glass' : 'glass'} rounded-2xl p-3 ${earned ? '' : 'opacity-50'}">
        <div class="flex items-center gap-2 mb-2">
          <div class="hex hex-sm ${earned ? 'gold-bg' : 'bg-white/5 border border-white/10'} text-[12px]"><i data-lucide="${b.Icon || 'award'}" class="${earned ? '' : 'text-arena-muted'}"></i></div>
          <div class="flex-1">
            <div class="font-semibold text-[13px] leading-tight">${escapeHtml(b.Badge_Name)}</div>
            <div class="text-[10px] text-arena-muted">${escapeHtml(b.Badge_Category)}</div>
          </div>
        </div>
        <div class="text-[11px] text-arena-text/80 line-clamp-2">${escapeHtml(b.Criteria || '')}</div>
        ${b.Points_Bonus ? `<div class="text-[10.5px] gold-text font-semibold mt-1">+${b.Points_Bonus} bonus pts</div>` : ''}
      </div>
    `;
  }

  // ---- Export ------------------------------------------------------------
  window.ArenaAgentViews = {
    renderHome, renderScorecard, renderMissions, renderChallenges,
    renderLeaderboard, renderBroadcasts, renderTraining, renderStore, renderProfile,
    sparkline, escapeHtml, priorityChip, ragChip, dueLabel, avatarHex, xpRing,
  };
})();
