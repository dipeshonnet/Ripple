/* eslint-disable */
// Performance Arena - Agent Home view.

(function () {
  const A = window.Arena;
  const H = window.ArenaAgentViewHelpers;
  if (!A || !H) { console.error('Arena agent home dependencies not loaded'); return; }

  const {
    escapeHtml, avatarHex, heroBadge, visibleTodayRowsForUser, dueLabel,
    priorityChip, rewardIcon,
  } = H;

  function renderHome() {
    const s = A.state;
    const me = A.userById(s.activeUserId);
    if (!me || me.Role !== 'Agent') {
      const first = A.allAgents()[0];
      if (first) s.activeUserId = first.UserID;
      return renderHome();
    }
    const ac = A.agentSnapshot(me.UserID) || {};
    const lvl = A.levelInfo(me.XP || 0);
    const streak = A.streakForUser(me.UserID);
    const teamRank = ac.TeamRank || (A.teamScoreForUser(me.UserID).rank);
    const teamSize = A.teamMembers(me.TeamID).length;
    const todayRows = visibleTodayRowsForUser(me.UserID);
    const score = ac.PerformanceScore || 0;
    const rag = score >= 100 ? 'Green' : score >= 90 ? 'Amber' : 'Red';
    const balance = ac.ArenaPointsBalance || me.ArenaPoints || 0;
    const earnedToday = ac.PointsEarnedToday || 0;

    // Active mission (joined or available)
    const activeMission = s.missions.find(m => m.Status === 'Active' && (
      (m.Audience_Type === 'Team' && m.Audience_ID === me.TeamID)
      || (m.Audience_Type === 'Process' && m.Audience_ID === me.ProcessID)
      || m.Audience_Type === 'Account'
    ));
    const myMissionState = activeMission ? (s.missionProgress[activeMission.Mission_ID]?.[me.UserID]) : null;

    // Active challenge — first one I'm participating in (not settled)
    const myParticipations = (s.challengeParticipants || []).filter(cp => cp.UserID === me.UserID);
    let activeChallenge = null;
    for (const cp of myParticipations) {
      const c = A.challengeById(cp.Challenge_ID);
      if (!c) continue;
      const cs = A.ensureChallengeStatus(c);
      if (cs.status !== 'Settled' && cs.status !== 'Declined') { activeChallenge = c; break; }
    }
    if (!activeChallenge) {
      activeChallenge = s.challenges.find(c =>
        (c.Participant_One === me.UserID || c.Participant_Two === me.UserID)
        && A.ensureChallengeStatus(c).status !== 'Settled'
      );
    }

    // Pending breakdowns by module type
    const myAssigns = s.assignments.filter(a => a.UserID === me.UserID);
    const pendingByType = { Broadcast: 0, Training: 0, PKT: 0 };
    for (const a of myAssigns) {
      const m = A.moduleById(a.Module_ID); if (!m) continue;
      const c = A.findCompletion(a.Assignment_ID);
      if (c && c.Status !== 'Completed') pendingByType[m.Module_Type] = (pendingByType[m.Module_Type] || 0) + 1;
    }

    // Top KPIs come from KPI Manager visibility/configuration; older seed data falls back through core guardrails.
    const myKpis = A.kpisForRole('Agent', { processId: me.ProcessID });
    const topKpiCards = myKpis.slice(0, 6).map(k => {
      const row = todayRows.find(r => r.KPI_ID === k.KPI_ID);
      return { kpi: k, row };
    }).filter(x => x.row);

    // Mini leaderboard
    const board = A.leaderboardForTeam(me.TeamID).slice(0, 5);

    // Affordable + next reward
    const sorted = s.rewards.filter(r => r.Status === 'Active' && r.Stock > 0).sort((a, b) => a.Points_Required - b.Points_Required);
    const affordable = sorted.filter(r => balance >= r.Points_Required);
    const nextReward = sorted.find(r => balance < r.Points_Required) || null;

    // Next badge — pick first locked badge whose criteria mentions a metric we can estimate
    const earnedBadgeIds = new Set(((s.agentBadges || []).filter(ab => ab.UserID === me.UserID).map(ab => ab.Badge_ID)));
    const earnedBadgeNames = new Set(s.completion.filter(c => c.UserID === me.UserID && c.Badge_Earned).map(c => c.Badge_Earned));
    const lockedBadges = s.badges.filter(b => !earnedBadgeIds.has(b.Badge_ID) && !earnedBadgeNames.has(b.Badge_Name));
    const nextBadge = lockedBadges[0];
    const badgeProgressPct = nextBadge ? estimateBadgeProgress(nextBadge, me, streak) : 0;

    // Latest broadcast for me
    const myBroadcasts = s.modules.filter(m => m.Module_Type === 'Broadcast' && (m.Audience_Type === 'Account' || (m.Audience_Type === 'Team' && m.Audience_ID === me.TeamID))).slice(0, 1);

    const greenCount = todayRows.filter(r => r.Status === 'Green').length;
    const amberCount = todayRows.filter(r => r.Status === 'Amber').length;
    const redCount = todayRows.filter(r => r.Status === 'Red').length;
    const focusRows = A.sortKpiRowsForDisplay(todayRows.filter(r => A.kpiMetricGroup(r.KPI_ID) === 'operational')).slice(0, 3);

    const ragHeroClass = rag === 'Green' ? 'rag-green' : rag === 'Amber' ? 'rag-amber' : 'rag-red';

    return `
      <div class="space-y-4 fade-in">

        <!-- ============== HERO ============== -->
        <section class="arena-hero p-4 sm:p-6 relative">
          <span class="sparkle" style="top:14%;left:32%;animation-delay:.1s"></span>
          <span class="sparkle" style="top:42%;right:8%;animation-delay:.7s"></span>
          <span class="sparkle" style="bottom:18%;left:58%;animation-delay:1.3s"></span>
          <span class="sparkle" style="top:8%;right:34%;animation-delay:1.9s"></span>

          <div class="flex items-start gap-4">
            <!-- Avatar with level ring + sub-badge -->
            <div class="relative flex-shrink-0">
              <div class="absolute inset-0 -m-2 level-glow"></div>
              <div class="relative">${avatarHex(me, 'lg')}</div>
              <div class="absolute -bottom-1 -right-1 hex hex-sm gold-bg shadow-gold text-[10px] font-bold pop-in">L${lvl.level}</div>
            </div>

            <div class="flex-1 min-w-0">
              <div class="text-[10px] uppercase tracking-[0.2em] text-arena-muted font-bold">Welcome back</div>
              <div class="font-display font-bold text-2xl sm:text-3xl tracking-tight leading-tight">${escapeHtml(me.Name.split(' ')[0])}<span class="gold-text"> · Your Arena is live.</span></div>

              <div class="flex flex-wrap items-center gap-1.5 mt-2">
                <span class="chip bg-arena-violet/15 text-arena-violet border border-arena-violet/30"><i data-lucide="shield" class="text-[10px]"></i> ${lvl.name} League</span>
                <span class="chip bg-white/5 border border-white/10 text-arena-muted"><i data-lucide="users" class="text-[10px]"></i> ${A.teamById(me.TeamID)?.TeamName || me.TeamID}</span>
                <span class="chip bg-white/5 border border-white/10 text-arena-muted">#${teamRank || '—'} of ${teamSize}</span>
                ${streak > 0 ? `<span class="chip bg-arena-amber/15 text-arena-amber border border-arena-amber/30 streak-pulse"><i data-lucide="flame" class="text-[10px]"></i> ${streak}-day streak</span>` : ''}
              </div>

              <div class="mt-3">
                <div class="flex items-center justify-between text-[10.5px] text-arena-muted mb-1">
                  <span class="uppercase tracking-wider font-semibold">Level Progress · Level ${lvl.level} → ${lvl.level + 1}</span>
                  <span class="text-arena-text font-semibold">${(me.XP || 0).toLocaleString()} / ${((me.XP || 0) + (lvl.span - lvl.into)).toLocaleString()} progress</span>
                </div>
                <div class="progress thick"><span style="width:${lvl.pct}%"></span></div>
              </div>
            </div>
          </div>

          <!-- Hero stats -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-5">
            <div class="rounded-2xl glass p-3 sm:p-4 col-span-2 relative overflow-hidden">
              <div class="absolute -top-8 -right-8 w-32 h-32 level-glow"></div>
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Overall Performance Index</div>
              <div class="flex items-end gap-3 mt-1">
                <div class="hero-num text-5xl sm:text-6xl ${ragHeroClass}" data-counter="${score}" data-counter-decimals="1">${score.toFixed(1)}</div>
                <div class="pb-2 flex flex-col gap-1">${heroBadge(rag, redCount, amberCount)}<span class="text-[10px] text-arena-muted">weighted across ${todayRows.length} KPIs</span></div>
              </div>
              <div class="flex items-center gap-2 mt-2 text-[11px] flex-wrap">
                <button data-nav="scorecard" data-rag-filter="Green" class="chip rag-bg-green rag-green">${greenCount} On Target</button>
                <button data-nav="scorecard" data-rag-filter="Amber" class="chip rag-bg-amber rag-amber">${amberCount} Watch</button>
                <button data-nav="scorecard" data-rag-filter="Red" class="chip rag-bg-red rag-red">${redCount} Critical</button>
              </div>
              ${redCount > 0
                ? `<div class="text-[10.5px] text-arena-muted/90 mt-1.5 italic leading-tight">Critical items need immediate action; coaching steps are flagged below.</div>`
                : (amberCount > 0
                    ? `<div class="text-[10.5px] text-arena-muted/90 mt-1.5 italic leading-tight">Composite score reflects weighted KPIs; watch items show KPI-level coaching opportunities.</div>`
                    : '')
              }
            </div>
            <div class="rounded-2xl glass p-3 relative overflow-hidden">
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Earned today</div>
              <div class="text-2xl sm:text-3xl font-bold gold-text font-display mt-1">+<span data-counter="${earnedToday}">${earnedToday.toLocaleString()}</span></div>
              <div class="text-[10px] text-arena-muted">Arena points</div>
            </div>
            <div class="rounded-2xl glass p-3 relative overflow-hidden">
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Wallet</div>
              <div class="text-2xl sm:text-3xl font-bold text-arena-text font-display mt-1"><span data-counter="${balance}">${balance.toLocaleString()}</span></div>
              <div class="text-[10px] text-arena-muted">Available to spend</div>
            </div>
          </div>
        </section>

        <!-- ============== TODAY'S FOCUS ============== -->
        <section class="grid grid-cols-1 gap-3">
          ${activeMission ? renderActiveMissionCard(activeMission, myMissionState, me) : missionEmpty()}
        </section>

        <!-- ============== MEMBER VALUE + BEHAVIOR FOCUS ============== -->
        <section class="glass rounded-2xl p-4 border-white/10">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">My member impact today</div>
              <div class="font-display font-bold text-[16px] mt-0.5">Focus on behaviors that improve member experience.</div>
              <div class="text-[11.5px] text-arena-muted mt-1">No dollar savings are shown at agent level. Your role is to create clear, accurate, confident resolutions.</div>
            </div>
            <span class="chip bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30"><i data-lucide="heart-handshake" class="text-[10px]"></i> Member-first view</span>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
            ${focusRows.map(row => {
              const kpi = A.kpiById(row.KPI_ID) || {};
              const tone = row.Status === 'Green' ? 'rag-green' : row.Status === 'Red' ? 'rag-red' : 'rag-amber';
              return `<div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">${escapeHtml(kpi.KPI_Name || row.KPI_ID)}</div><div class="hero-num text-2xl mt-1 ${tone}">${row.Current_Value || row.Actual || '---'}</div><div class="text-[10px] text-arena-muted">${escapeHtml(kpi.KPI_Type || 'configured KPI')}</div></div>`;
            }).join('')}
            <div class="rounded-xl bg-white/[0.03] border border-white/8 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Level Progress</div><div class="hero-num text-2xl mt-1 text-arena-violet">${lvl.pct}%</div><div class="text-[10px] text-arena-muted">growth, not spendable</div></div>
          </div>
        </section>

        <!-- ============== KPI HEALTH MINI-CARDS ============== -->
        <section>
          <div class="flex items-center justify-between mb-2">
            <div class="font-display font-bold text-[15px] flex items-center gap-2"><i data-lucide="gauge-circle" class="text-arena-cyan"></i> KPI health · today</div>
            <button data-nav="scorecard" class="text-[11px] text-arena-cyan hover:underline">Full scorecard →</button>
          </div>
          <div class="scroll-x pb-1">
            ${topKpiCards.map(({ kpi, row }) => kpiMiniCard(kpi, row)).join('')}
          </div>
        </section>

        <!-- ============== PENDING COUNTS + STREAK ============== -->
        <section class="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          ${quickStat('Broadcasts', pendingByType.Broadcast || 0, 'megaphone', 'cyan',  'broadcasts', 'pending')}
          ${quickStat('Training',   pendingByType.Training || 0,  'book-open', 'violet', 'training',   'modules')}
          ${quickStat('PKTs',       pendingByType.PKT || 0,       'graduation-cap', 'gold', 'training', 'knowledge checks')}
          ${quickStat('Streak',     `${streak}d`,                  'flame',     'amber',  null,          streak >= 5 ? 'On fire!' : 'Keep going')}
        </section>

        <!-- ============== NEXT BADGE PROGRESS ============== -->
        ${nextBadge ? `
          <section class="glass rounded-2xl p-4 relative overflow-hidden">
            <div class="absolute -right-6 -top-6 w-32 h-32 level-glow"></div>
            <div class="flex items-center gap-3 relative">
              <div class="hex hex-lg ${badgeProgressPct >= 100 ? 'gold-bg' : 'bg-white/5 border border-white/10'} ${badgeProgressPct >= 80 ? 'badge-shine' : ''}">
                <i data-lucide="${nextBadge.Icon || 'award'}" class="${badgeProgressPct >= 80 ? 'text-arena-text' : 'text-arena-muted'}"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">Next badge to unlock</div>
                <div class="font-display font-bold text-[16px] leading-tight">${escapeHtml(nextBadge.Badge_Name)}</div>
                <div class="text-[11px] text-arena-muted line-clamp-1">${escapeHtml(nextBadge.Criteria)}</div>
                <div class="mt-2">
                  <div class="flex items-center justify-between text-[10px] text-arena-muted mb-1">
                    <span class="uppercase tracking-wider font-semibold">Progress</span>
                    <span class="text-arena-text font-semibold">${badgeProgressPct}%</span>
                  </div>
                  <div class="progress gold"><span style="width:${badgeProgressPct}%"></span></div>
                </div>
              </div>
              <div class="text-right hidden sm:block">
                <div class="text-[10px] text-arena-muted uppercase tracking-wider font-semibold">Bonus on unlock</div>
                <div class="text-[14px] font-bold gold-text">+${nextBadge.Points_Bonus || 0} pts</div>
                <div class="text-[10px] text-arena-violet font-semibold">+${nextBadge.XP_Bonus || 0} progress</div>
              </div>
            </div>
          </section>
        ` : ''}

        <!-- ============== NEXT REWARD UNLOCK + AFFORDABLE STRIP ============== -->
        ${nextReward ? `
          <section class="glass rounded-2xl p-4 border-arena-gold/30 relative overflow-hidden">
            <div class="absolute -right-8 -top-10 w-40 h-40 level-glow"></div>
            <div class="flex items-center gap-3 relative">
              <div class="w-12 h-12 rounded-xl gold-bg shadow-gold grid place-items-center"><i data-lucide="${rewardIcon(nextReward.Category)}" class="text-[20px]"></i></div>
              <div class="flex-1 min-w-0">
                <div class="text-[10px] uppercase tracking-wider text-arena-gold font-bold">Next reward unlock</div>
                <div class="font-display font-bold text-[16px] leading-tight">${escapeHtml(nextReward.Reward_Name)}</div>
                <div class="text-[11px] text-arena-muted">${escapeHtml(nextReward.Category)}</div>
                <div class="mt-2">
                  <div class="flex items-center justify-between text-[10px] text-arena-muted mb-1">
                    <span class="uppercase tracking-wider font-semibold">${(nextReward.Points_Required - balance).toLocaleString()} more pts to unlock</span>
                    <span class="text-arena-text font-semibold">${balance.toLocaleString()} / ${nextReward.Points_Required.toLocaleString()}</span>
                  </div>
                  <div class="progress gold"><span style="width:${Math.min(100, Math.round((balance / nextReward.Points_Required) * 100))}%"></span></div>
                </div>
              </div>
            </div>
          </section>
        ` : ''}

        ${affordable.length ? `
          <section>
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[15px] flex items-center gap-2"><i data-lucide="gift" class="text-arena-gold"></i> Rewards within reach</div>
              <button data-nav="store" class="text-[11px] text-arena-cyan hover:underline">Open store →</button>
            </div>
            <div class="scroll-x pb-2">
              ${affordable.slice(0, 6).map(r => `
                <div class="rounded-2xl glass p-3 w-[200px] badge-shine">
                  <div class="w-9 h-9 rounded-lg gold-bg grid place-items-center"><i data-lucide="${rewardIcon(r.Category)}" class="text-[16px]"></i></div>
                  <div class="font-semibold text-[13px] mt-2 leading-tight">${escapeHtml(r.Reward_Name)}</div>
                  <div class="text-[10px] text-arena-muted mt-0.5">${escapeHtml(r.Category)}</div>
                  <div class="flex items-center justify-between mt-2">
                    <div class="text-[12px] gold-text font-semibold">${r.Points_Required} pts</div>
                    <button data-action="agent-redeem" data-reward="${r.Reward_ID}" class="text-[11px] btn-primary !py-1 !px-2.5">Redeem</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- ============== CTA STRIP ============== -->
        <section class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button data-action="agent-create-challenge" class="btn-primary !py-3 !px-4 flex items-center justify-center gap-2 text-[14px] !rounded-2xl shadow-gold">
            <i data-lucide="swords" class="text-[16px]"></i>
            <span>Create Challenge</span>
            <i data-lucide="arrow-right" class="text-[14px]"></i>
          </button>
          <button data-nav="store" class="!py-3 !px-4 flex items-center justify-center gap-2 text-[14px] font-bold rounded-2xl shadow-violet" style="background: linear-gradient(135deg, #8a6cff, #5e3eff); color: white;">
            <i data-lucide="gift" class="text-[16px]"></i>
            <span>Go to Arena Store</span>
            <i data-lucide="arrow-right" class="text-[14px]"></i>
          </button>
        </section>

        <!-- ============== LEADERBOARD + LATEST BROADCAST ============== -->
        <section class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="glass rounded-2xl p-3 md:col-span-2">
            <div class="flex items-center justify-between mb-2">
              <div class="font-display font-bold text-[14px] flex items-center gap-2"><i data-lucide="trophy" class="text-arena-gold"></i> ${escapeHtml(A.teamById(me.TeamID)?.TeamName || '')} top performers</div>
              <button data-nav="leaderboard" class="text-[11px] text-arena-cyan hover:underline">Full board →</button>
            </div>
            <div class="space-y-1">
              ${board.map((b, i) => {
                const u = A.userById(b.UserID);
                const isMe = b.UserID === me.UserID;
                const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
                return `
                  <div class="flex items-center gap-3 px-2 py-1.5 rounded-lg ${isMe ? 'bg-arena-violet/10 border border-arena-violet/30' : ''}">
                    <div class="rank-badge ${rankCls}">${i + 1}</div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-semibold truncate">${escapeHtml(u?.Name || b.UserID)} ${isMe ? '<span class="text-[10px] text-arena-violet ml-1">(you)</span>' : ''}</div>
                      <div class="text-[10px] text-arena-muted">${b.Level} · ${(b.XP || 0).toLocaleString()} progress</div>
                    </div>
                    <div class="text-right">
                      <div class="font-bold ${b.RAGStatus === 'Green' ? 'rag-green' : b.RAGStatus === 'Amber' ? 'rag-amber' : 'rag-red'}">${(b.PerformanceScore || 0).toFixed(1)}</div>
                      <div class="text-[10px] text-arena-muted">+${(b.PointsEarnedToday || 0)} today</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          ${myBroadcasts.length ? `
            <div class="glass rounded-2xl p-3">
              <div class="font-display font-bold text-[14px] flex items-center gap-2 mb-2"><i data-lucide="megaphone" class="text-arena-cyan"></i> Latest broadcast</div>
              ${myBroadcasts.map(m => `
                <div class="rounded-xl bg-white/[0.02] border border-white/10 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <div class="font-semibold text-[13px]">${escapeHtml(m.Title)}</div>
                    ${priorityChip(m.Priority)}
                  </div>
                  <div class="text-[12px] text-arena-muted line-clamp-2 mt-1">${escapeHtml(m.Description || '')}</div>
                  <button data-nav="broadcasts" class="mt-2 text-[11px] text-arena-cyan hover:underline">Open broadcasts →</button>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="glass rounded-2xl p-3">
              <div class="font-display font-bold text-[14px] flex items-center gap-2 mb-2"><i data-lucide="bell" class="text-arena-cyan"></i> Today's brief</div>
              <div class="text-[12px] text-arena-muted">No new broadcasts. Stay focused on conversion quality and CMS compliance today.</div>
            </div>
          `}
        </section>
      </div>
    `;
  }

  function missionEmpty() {
    return `
      <div class="mission-stripe p-4 flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-arena-gold/15 grid place-items-center"><i data-lucide="flag" class="text-arena-gold"></i></div>
        <div class="flex-1">
          <div class="font-semibold">No active mission</div>
          <div class="text-[12px] text-arena-muted">Pick one in Missions to start earning bonus points.</div>
        </div>
        <button data-nav="missions" class="btn-primary text-[12px]">Browse</button>
      </div>
    `;
  }

  function challengeEmpty() {
    return `
      <div class="challenge-stripe p-4 flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-arena-cyan/15 grid place-items-center"><i data-lucide="swords" class="text-arena-cyan"></i></div>
        <div class="flex-1">
          <div class="font-semibold">No active challenge</div>
          <div class="text-[12px] text-arena-muted">Start a peer challenge — winner earns the reward pool in Arena Points.</div>
        </div>
        <button data-action="agent-create-challenge" class="btn-primary text-[12px]">Challenge</button>
      </div>
    `;
  }

  function kpiMiniCard(kpi, row) {
    const status = row.Status || 'Green';
    const dot = status === 'Green' ? 'rag-green' : status === 'Amber' ? 'rag-amber' : 'rag-red';
    const arrow = (kpi.Direction === 'Higher' && row.Variance >= 0) || (kpi.Direction === 'Lower' && row.Variance <= 0) ? 'arrow-up-right' : 'arrow-down-right';
    return `
      <div class="rounded-2xl glass p-3 w-[160px]">
        <div class="flex items-center justify-between">
          <div class="text-[10px] text-arena-muted uppercase tracking-wider font-bold">${escapeHtml(kpi.KPI_Name)}</div>
          <span class="pulse ${dot}"></span>
        </div>
        <div class="hero-num text-2xl mt-1 ${dot}">${row.Actual}<span class="text-[10px] text-arena-muted ml-0.5 font-normal">${kpi.Unit || ''}</span></div>
        <div class="flex items-center justify-between text-[10px] text-arena-muted mt-1">
          <span>vs ${kpi.Target}${kpi.Unit || ''}</span>
          <span class="${dot} flex items-center gap-0.5"><i data-lucide="${arrow}" class="text-[10px]"></i>${row.Variance > 0 ? '+' : ''}${(row.Variance || 0).toFixed(1)}</span>
        </div>
      </div>
    `;
  }

  function estimateBadgeProgress(badge, me, streak) {
    const c = (badge.Criteria || '').toLowerCase();
    // Look for "for N days" pattern
    const m = c.match(/for\s+(\d+)\s*(consecutive\s*)?(day|days|shifts)/);
    if (m) {
      const target = Number(m[1]);
      return Math.min(100, Math.round((streak / target) * 100));
    }
    // Otherwise, estimate by matching against today's KPI achievement
    return Math.min(100, Math.round(((me.XP || 0) % 1000) / 10));
  }

  function quickStat(label, value, icon, tone, navTo, sub) {
    const tones = { gold: 'text-arena-gold', violet: 'text-arena-violet', emerald: 'text-arena-emerald', amber: 'text-arena-amber', cyan: 'text-arena-cyan' };
    const c = tones[tone] || 'text-arena-text';
    const clickAttr = navTo ? `data-nav="${navTo}"` : '';
    return `
      <button ${clickAttr} class="glass rounded-2xl p-3 text-left hover:border-white/15 transition">
        <div class="flex items-center justify-between text-[10px] uppercase tracking-wider text-arena-muted font-bold">
          <span>${label}</span>
          <i data-lucide="${icon}" class="${c} text-[13px]"></i>
        </div>
        <div class="text-2xl font-bold mt-1 font-display ${c}">${value}</div>
        ${sub ? `<div class="text-[10px] text-arena-muted">${sub}</div>` : ''}
      </button>
    `;
  }

  function countMyBadges(user) {
    const myCompletions = A.state.completion.filter(c => c.UserID === user.UserID && c.Badge_Earned);
    return new Set(myCompletions.map(c => c.Badge_Earned)).size;
  }

  function renderActiveMissionCard(m, myState, me) {
    const progress = myState ? Math.round(myState.progress * 100) : 0;
    const status = myState?.status || 'Available';
    const badge = A.state.badges.find(b => b.Badge_ID === m.Badge_ID);
    const kpi = A.kpiById(m.KPI_ID);
    return `
      <div class="mission-stripe p-4">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-arena-gold/20 grid place-items-center flex-shrink-0"><i data-lucide="flag" class="text-arena-gold"></i></div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <div class="text-[10px] uppercase tracking-wider text-arena-gold font-bold">Active Mission</div>
              <span class="chip bg-white/5 border border-white/10 text-arena-muted">${kpi?.KPI_Name || m.KPI_ID}</span>
            </div>
            <div class="font-display font-bold text-[16px] leading-tight mt-0.5">${escapeHtml(m.Mission_Name)}</div>
            <div class="text-[12px] text-arena-muted line-clamp-2 mt-0.5">${escapeHtml(m.Description || '')}</div>
            <div class="flex items-center justify-between mt-3 gap-3">
              <div class="flex-1">
                <div class="flex items-center justify-between text-[10px] text-arena-muted mb-1"><span class="uppercase tracking-wider font-semibold">Progress</span><span class="text-arena-text font-semibold">${progress}%</span></div>
                <div class="progress gold thick"><span style="width:${progress}%"></span></div>
              </div>
            </div>
            <div class="flex items-center justify-between mt-3 gap-2 flex-wrap">
              <div class="flex items-center gap-3 text-[12px] flex-wrap">
                <span class="gold-text font-bold">+${m.Reward_Points} pts</span>
                ${badge ? `<span class="chip bg-arena-gold/15 text-arena-gold border border-arena-gold/30"><i data-lucide="award" class="text-[10px]"></i> ${badge.Badge_Name}</span>` : ''}
                <span class="text-arena-muted">${dueLabel(m.End_Date)}</span>
              </div>
              <div class="flex gap-2">
                ${status === 'Active' ? `
                  <button data-action="agent-progress-mission" data-mission="${m.Mission_ID}" class="btn-primary text-[12px]"><i data-lucide="trending-up" class="text-[12px]"></i> Log progress</button>
                ` : `
                  <button data-action="agent-join-mission" data-mission="${m.Mission_ID}" class="btn-primary text-[12px]"><i data-lucide="play" class="text-[12px]"></i> Accept mission</button>
                `}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderActiveChallengeCard(c, me) {
    const cs = A.ensureChallengeStatus(c);
    const isP1 = c.Participant_One === me.UserID;
    const opp = isP1 ? c.Participant_Two : c.Participant_One;
    const oppName = A.userById(opp)?.Name || A.teamById(opp)?.TeamName || opp;
    const kpi = A.kpiById(c.KPI_ID);
    const accepted = cs.acceptedBy.includes(me.UserID);
    return `
      <div class="challenge-stripe p-4">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-arena-cyan/20 grid place-items-center flex-shrink-0"><i data-lucide="swords" class="text-arena-cyan"></i></div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <div class="text-[10px] uppercase tracking-wider text-arena-cyan font-bold">Active Challenge</div>
              <span class="chip bg-white/5 border border-white/10 text-arena-muted">${escapeHtml(c.Challenge_Type)}</span>
              <span class="chip bg-white/5 border border-white/10 text-arena-muted">${kpi?.KPI_Name || c.KPI_ID}</span>
            </div>
            <div class="font-display font-bold text-[16px] leading-tight mt-0.5">${escapeHtml(c.Challenge_Name)}</div>
            <div class="text-[12px] text-arena-text/80 mt-0.5">vs <span class="font-semibold">${escapeHtml(oppName)}</span> · ends ${c.End_Date}</div>
            <div class="flex items-center justify-between mt-3 gap-2 flex-wrap">
              <div class="flex items-center gap-3 text-[12px]">
                <span class="text-arena-cyan">Entry <span class="font-bold">${c.Entry_Points}</span> pts</span>
                <span class="gold-text font-bold">Pool ${c.Reward_Pool} pts</span>
              </div>
              <div class="flex gap-2">
                ${!accepted ? `
                  <button data-action="agent-reject-challenge" data-challenge="${c.Challenge_ID}" class="btn-ghost text-[12px]"><i data-lucide="shield-off" class="text-[12px]"></i> Decline</button>
                  <button data-action="agent-accept-challenge" data-challenge="${c.Challenge_ID}" class="btn-primary text-[12px]"><i data-lucide="swords" class="text-[12px]"></i> Accept</button>
                ` : `
                  <span class="chip bg-arena-emerald/15 text-arena-emerald border border-arena-emerald/30"><i data-lucide="check" class="text-[10px]"></i> Accepted</span>
                  <button data-action="settle-challenge" data-challenge="${c.Challenge_ID}" data-winner="${me.UserID}" class="btn-primary text-[12px]"><i data-lucide="shield-check" class="text-[12px]"></i> Submit Win for TL Validation</button>
                `}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ---- SCORECARD (Performance Cockpit) ----------------------------------

  window.ArenaAgentHomeViews = { renderHome };
})();
