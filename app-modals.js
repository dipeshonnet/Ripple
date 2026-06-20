/* eslint-disable */
// Performance Arena — Modals + take-PKT + create flows + verify

(function () {
  const A = window.Arena; if (!A) return;
  const Av = window.ArenaAgentViews;
  const escapeHtml = Av.escapeHtml;

  function modalHeader(title, subtitle, icon, color) {
    return A.modalHeader(title, subtitle, icon, color);
  }

  // ---- Mobile menu drawer -------------------------------------------------
  // Mobile profile switching is handled directly in the header. Keep this
  // drawer lightweight for iPhone/PWA performance: page navigation only.
  function openMobileMenu() {
    const me = A.userById(A.state.activeUserId);
    const nav = (function () {
      if (A.state.role === 'Agent') return [
        { id: 'home',        label: 'Arena Home',  icon: 'gamepad-2' },
        { id: 'scorecard',   label: 'Scorecard',   icon: 'gauge-circle' },
        { id: 'challenges',  label: 'Challenges',  icon: 'swords' },
        { id: 'missions',    label: 'Missions',    icon: 'flag' },
        { id: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
        { id: 'store',       label: 'Arena Store', icon: 'gift' },
        { id: 'broadcasts',  label: 'Broadcasts',  icon: 'megaphone' },
        { id: 'training',    label: 'Training',    icon: 'graduation-cap' },
        { id: 'profile',     label: 'My Profile',  icon: 'user-round' },
      ];
      if (A.state.role === 'Team Lead') return [
        { id: 'lead-outcomes',   label: 'Team Console',          icon: 'shield' },
        { id: 'lead-trends',     label: 'SLA/KPI Trends',        icon: 'line-chart' },
        { id: 'lead-rca',        label: 'Outcome Drivers',       icon: 'git-branch' },
        { id: 'lead-team',       label: 'Team Pulse',            icon: 'users' },
        { id: 'lead-console',    label: 'Coach Console',         icon: 'target' },
        { id: 'lead-missions',   label: 'Missions & Challenges', icon: 'swords' },
        { id: 'lead-commercial', label: 'Commercial',            icon: 'badge-dollar-sign' },
      ];
      return [
        { id: 'mgr-outcomes',   label: 'Account Command',        icon: 'radar' },
        { id: 'mgr-trends',     label: 'SLA/KPI Trends',         icon: 'line-chart' },
        { id: 'mgr-rca',        label: 'Outcome Drivers',        icon: 'git-branch' },
        { id: 'mgr-commercial', label: 'Revenue & Commercial',   icon: 'badge-dollar-sign' },
        { id: 'mgr-whatif',     label: 'What-If / Action Plan',  icon: 'split' },
        { id: 'mgr-teams',      label: 'Team Comparison',        icon: 'columns-3' },
        { id: 'mgr-adoption',   label: 'Adoption',               icon: 'zap' },
      ];
    })();

    A.openModal(`
      ${modalHeader('Pages', `${A.state.role}${me ? ` · ${me.Name}` : ''}`, 'menu', 'cyan-bg')}
      <div class="p-4 overflow-y-auto scrollbar-thin mobile-menu-sheet">
        <div class="text-[11px] text-arena-muted mb-3">Use the role pills and profile selector at the top of the screen to switch profile.</div>
        <div class="grid grid-cols-1 gap-2">
          ${nav.map(n => `
            <button data-nav="${n.id}" class="flex items-center gap-3 px-3 py-3 rounded-xl ${A.state.page === n.id ? 'bg-arena-gold/15 border border-arena-gold/40 text-arena-gold' : 'bg-white/5 border border-white/10 text-arena-text'}">
              <i data-lucide="${n.icon}" class="text-[16px]"></i> <span class="text-[13px] font-semibold">${n.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `);
  }

  // ---- Common: audience fields --------------------------------------------
  function audienceFields() {
    return `
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Audience type</label>
          <select id="m-audience-type">
            <option value="Account">Account · Clover Medicare (all teams)</option>
            <option value="Process">Process</option>
            <option value="Team" selected>Team</option>
            <option value="Role">All Agents (role)</option>
          </select>
        </div>
        <div>
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Audience target</label>
          <select id="m-audience-id"></select>
        </div>
      </div>
    `;
  }
  function fillAudienceTargets(type) {
    const sel = document.getElementById('m-audience-id'); if (!sel) return;
    if (type === 'Account') sel.innerHTML = `<option value="CLOVER_MA">Clover Medicare — All teams</option>`;
    else if (type === 'Process') sel.innerHTML = A.state.processes.map(p => `<option value="${p.ProcessID}">${p.ProcessID} — ${p.ProcessName}</option>`).join('');
    else if (type === 'Team') sel.innerHTML = A.state.teams.map(t => `<option value="${t.TeamID}">${t.TeamID} — ${t.TeamName} (${t.Location})</option>`).join('');
    else sel.innerHTML = `<option value="ALL">All Active Agents</option>`;
  }

  function commonFields(defaults) {
    return `
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Title *</label>
          <input id="m-title" placeholder="e.g. Privacy Refresher Q2" />
        </div>
        <div>
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Priority</label>
          <select id="m-priority">
            <option>Critical</option><option selected>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
        <div>
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Due date</label>
          <input id="m-due" type="date" value="${defaults.due}" />
        </div>
        ${audienceFields()}
        <div class="col-span-2">
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Description / content</label>
          <textarea id="m-desc" rows="3" placeholder="Briefing or content excerpt that agents will see"></textarea>
        </div>
        <div>
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Points on completion</label>
          <input id="m-points" type="number" min="0" value="${defaults.points}" />
        </div>
        <div>
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Level progress on completion</label>
          <input id="m-xp" type="number" min="0" value="${defaults.xp}" />
        </div>
        <div class="col-span-2">
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Badge unlock (optional)</label>
          <input id="m-badge" placeholder="e.g. Compliance Champion" value="${defaults.badge || ''}" />
        </div>
      </div>
    `;
  }

  function readCommon() {
    return {
      title: document.getElementById('m-title')?.value?.trim(),
      priority: document.getElementById('m-priority')?.value,
      audienceType: document.getElementById('m-audience-type')?.value,
      audienceId: document.getElementById('m-audience-id')?.value,
      description: document.getElementById('m-desc')?.value?.trim(),
      contentFormat: document.getElementById('m-format')?.value,
      dueDate: document.getElementById('m-due')?.value,
      requiresAck: document.getElementById('m-ack')?.checked,
      pointsOnCompletion: Number(document.getElementById('m-points')?.value || 0),
      xpOnCompletion: Number(document.getElementById('m-xp')?.value || 0),
      badgeUnlock: document.getElementById('m-badge')?.value?.trim(),
    };
  }

  // ---- Broadcast ----------------------------------------------------------
  function openCreateBroadcast() {
    A.openModal(`
      ${modalHeader('New Broadcast', 'Announcement, alert, process update or quiz — assign and require acknowledgement.', 'megaphone', 'gold-bg')}
      <div class="p-5 overflow-y-auto scrollbar-thin">
        ${commonFields({ due: A.addDays(2), points: 50, xp: 25, badge: 'Broadcast Ready' })}
        <div class="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Format</label>
            <select id="m-format">
              <option>Text</option><option>Alert</option><option>Process Update</option><option>Quiz</option>
            </select>
          </div>
          <div class="flex items-end">
            <label class="flex items-center gap-2 text-[13px] cursor-pointer">
              <input id="m-ack" type="checkbox" checked /> Require acknowledgement
            </label>
          </div>
        </div>
      </div>
      <div class="p-4 border-t border-white/5 flex justify-end gap-2">
        <button data-action="close-modal" class="btn-ghost text-[13px]">Cancel</button>
        <button data-action="submit-broadcast" class="btn-primary text-[13px]"><i data-lucide="send" class="text-[14px]"></i> Publish & Assign</button>
      </div>
    `, { onMount: () => {
      fillAudienceTargets('Team');
      document.getElementById('m-audience-type').addEventListener('change', e => fillAudienceTargets(e.target.value));
    } });
  }
  function submitBroadcast() {
    const c = readCommon();
    if (!c.title) return A.toast('Title is required', 'warn');
    A.createModule({ ...c, moduleType: 'Broadcast', hasPkt: false });
    A.closeModal(); A.state.page = 'training-console'; A.persist(); A.render();
  }

  // ---- Training -----------------------------------------------------------
  function openCreateTraining() {
    A.openModal(`
      ${modalHeader('Upload / Link Training Module', 'PDF, deck, video, audio or external link — agents complete and earn rewards.', 'book-open', 'violet-bg')}
      <div class="p-5 overflow-y-auto scrollbar-thin">
        ${commonFields({ due: A.addDays(5), points: 150, xp: 100, badge: 'Learning Streak' })}
        <div class="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Format</label>
            <select id="m-format">
              <option>PDF</option><option>PPT</option><option>Video</option><option>Audio</option><option>Image</option><option>Link</option><option>Micro-learning</option>
            </select>
          </div>
          <div class="flex items-end">
            <label class="flex items-center gap-2 text-[13px] cursor-pointer">
              <input id="m-ack" type="checkbox" /> Require acknowledgement on top of completion
            </label>
          </div>
          <div class="col-span-2">
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Upload (mock) or external link</label>
            <div class="flex gap-2">
              <input id="m-file" type="file" class="!w-auto flex-1" />
              <input id="m-link" placeholder="Or paste a SharePoint / video URL" class="flex-1" />
            </div>
            <div class="text-[11px] text-arena-muted mt-1"><i data-lucide="info" class="text-[10px]"></i> Files aren't actually uploaded — we record the filename and treat it as the linked artifact.</div>
          </div>
        </div>
      </div>
      <div class="p-4 border-t border-white/5 flex justify-end gap-2">
        <button data-action="close-modal" class="btn-ghost text-[13px]">Cancel</button>
        <button data-action="submit-training" class="btn-primary text-[13px]"><i data-lucide="send" class="text-[14px]"></i> Publish & Assign</button>
      </div>
    `, { onMount: () => {
      fillAudienceTargets('Team');
      document.getElementById('m-audience-type').addEventListener('change', e => fillAudienceTargets(e.target.value));
    } });
  }
  function submitTraining() {
    const c = readCommon();
    if (!c.title) return A.toast('Title is required', 'warn');
    const link = document.getElementById('m-link')?.value || document.getElementById('m-file')?.files?.[0]?.name || '';
    A.createModule({ ...c, moduleType: 'Training', hasPkt: false, contentLink: link });
    A.closeModal(); A.state.page = 'training-console'; A.persist(); A.render();
  }

  // ---- PKT ----------------------------------------------------------------
  let draftPkt = null;
  function openCreatePkt() {
    draftPkt = { questions: [{ text: '', options: ['', '', '', ''], correct: 0 }] };
    A.openModal(`
      ${modalHeader('Create PKT (Knowledge Check)', 'Pass score, attempts, questions and points — auto-creates a learning module.', 'graduation-cap', 'cyan-bg')}
      <div class="p-5 overflow-y-auto scrollbar-thin">
        ${commonFields({ due: A.addDays(7), points: 200, xp: 150, badge: 'Healthcare Knowledge Pro' })}
        <div class="grid grid-cols-3 gap-3 mt-3">
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Pass score (%)</label>
            <input id="m-pass" type="number" min="0" max="100" value="75" />
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Max attempts</label>
            <input id="m-attempts" type="number" min="1" max="5" value="2" />
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">First-attempt bonus</label>
            <input id="m-bonus" type="number" min="0" value="100" />
          </div>
        </div>
        <input id="m-format" type="hidden" value="Quiz" />
        <input id="m-ack" type="hidden" />

        <div class="mt-4 border-t border-white/10 pt-4">
          <div class="flex items-center justify-between mb-2">
            <div class="font-semibold text-[13px] flex items-center gap-2"><i data-lucide="list-checks" class="text-arena-cyan"></i> Questions</div>
            <button data-action="pkt-add-question" class="text-[12px] text-arena-cyan hover:underline flex items-center gap-1"><i data-lucide="plus" class="text-[12px]"></i> Add question</button>
          </div>
          <div id="pkt-questions" class="space-y-3"></div>
        </div>
      </div>
      <div class="p-4 border-t border-white/5 flex justify-end gap-2">
        <button data-action="close-modal" class="btn-ghost text-[13px]">Cancel</button>
        <button data-action="submit-pkt" class="btn-primary text-[13px]"><i data-lucide="send" class="text-[14px]"></i> Publish PKT</button>
      </div>
    `, { onMount: () => {
      fillAudienceTargets('Team');
      document.getElementById('m-audience-type').addEventListener('change', e => fillAudienceTargets(e.target.value));
      renderPktQuestions();
    } });
  }
  function renderPktQuestions() {
    const root = document.getElementById('pkt-questions'); if (!root) return;
    root.innerHTML = draftPkt.questions.map((q, i) => `
      <div class="rounded-xl bg-white/[0.02] border border-white/10 p-3" data-q="${i}">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[12px] text-arena-muted font-semibold">Question ${i + 1}</div>
          ${draftPkt.questions.length > 1 ? `<button data-action="pkt-del-question" data-q="${i}" class="text-[11px] text-arena-red hover:underline">Remove</button>` : ''}
        </div>
        <input class="pkt-q-text mb-2" placeholder="Question text" value="${escapeHtml(q.text || '')}" />
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${q.options.map((opt, oi) => `
            <label class="flex items-center gap-2 bg-arena-base border border-white/10 rounded-lg px-2 py-1.5 cursor-pointer ${q.correct === oi ? 'ring-2 ring-arena-emerald/60' : ''}">
              <input type="radio" name="correct-${i}" data-q="${i}" data-opt="${oi}" class="pkt-q-correct" ${q.correct === oi ? 'checked' : ''} />
              <input class="pkt-q-opt !border-0 !bg-transparent !p-0 !w-full text-[13px]" placeholder="Option ${oi + 1}" data-q="${i}" data-opt="${oi}" value="${escapeHtml(opt)}" />
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
  }
  function persistPktDraftValues() {
    const root = document.getElementById('pkt-questions'); if (!root || !draftPkt) return;
    draftPkt.questions.forEach((q, i) => {
      const t = root.querySelector(`[data-q="${i}"] .pkt-q-text`); if (t) q.text = t.value;
      const opts = root.querySelectorAll(`.pkt-q-opt[data-q="${i}"]`);
      opts.forEach((el, oi) => { q.options[oi] = el.value; });
    });
  }
  function pktAddQuestion() { persistPktDraftValues(); draftPkt.questions.push({ text: '', options: ['', '', '', ''], correct: 0 }); renderPktQuestions(); }
  function pktDelQuestion(idx) { persistPktDraftValues(); draftPkt.questions.splice(idx, 1); renderPktQuestions(); }
  function pktSetCorrect(qIdx, oIdx) { persistPktDraftValues(); if (draftPkt && draftPkt.questions[qIdx]) draftPkt.questions[qIdx].correct = oIdx; renderPktQuestions(); }

  function submitPkt() {
    persistPktDraftValues();
    const c = readCommon();
    if (!c.title) return A.toast('Title is required', 'warn');
    const passScore = Number(document.getElementById('m-pass')?.value || 75);
    const maxAttempts = Number(document.getElementById('m-attempts')?.value || 2);
    const firstAttemptBonus = Number(document.getElementById('m-bonus')?.value || 100);
    const qs = draftPkt.questions.map(q => {
      const correctOption = q.options[q.correct] || q.options[0] || '';
      return { text: q.text, options: q.options, correct: correctOption };
    });
    if (qs.some(q => !q.text || q.options.some(o => !o))) return A.toast('Fill every question and option', 'warn');
    A.createModule({
      ...c, moduleType: 'PKT', hasPkt: true,
      pktConfig: { title: c.title, passScore, maxAttempts, pointsOnPass: c.pointsOnCompletion, xpOnPass: c.xpOnCompletion, firstAttemptBonus, questions: qs },
    });
    draftPkt = null;
    A.closeModal(); A.state.page = 'training-console'; A.persist(); A.render();
  }

  // ---- Take PKT (Agent) ---------------------------------------------------
  let takeSession = null;
  function openTakePkt(moduleId, userId) {
    const pkt = A.pktForModule(moduleId);
    if (!pkt) return A.toast('No PKT for this module', 'warn');
    const m = A.moduleById(moduleId);
    const qs = A.questionsForPkt(pkt.PKT_ID);
    const previous = A.state.pktAttempts.filter(a => a.PKT_ID === pkt.PKT_ID && a.UserID === userId);
    if (previous.some(a => a.Result === 'Pass')) return A.toast('Already passed', 'success');
    if (previous.length >= pkt.Max_Attempts) return A.toast('No attempts remaining', 'warn');
    takeSession = { moduleId, userId, answers: new Array(qs.length).fill(null) };

    A.openModal(`
      ${modalHeader(`PKT · ${escapeHtml(m.Title)}`, `Pass ${pkt.Pass_Score}% · attempt ${previous.length + 1}/${pkt.Max_Attempts} · ${qs.length} questions`, 'graduation-cap', 'cyan-bg')}
      <div class="p-5 overflow-y-auto scrollbar-thin space-y-4">
        ${qs.map((q, i) => {
          const opts = q.Options.split('|');
          return `
            <div class="rounded-xl bg-white/[0.02] border border-white/10 p-4">
              <div class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Question ${i + 1}</div>
              <div class="font-semibold mt-1 mb-3">${escapeHtml(q.Question_Text)}</div>
              <div class="space-y-1.5">
                ${opts.map((opt, oi) => `
                  <label class="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 hover:border-arena-violet/40 cursor-pointer take-pkt-opt" data-q="${i}" data-opt="${escapeHtml(opt)}">
                    <input type="radio" name="take-q-${i}" /> <span class="text-[13px]">${escapeHtml(opt)}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="p-4 border-t border-white/5 flex justify-between items-center gap-2 flex-wrap">
        <div class="text-[11px] text-arena-muted">+${pkt.Points_On_Pass} pts on pass · +${pkt.XP_On_Pass} progress · +${pkt.First_Attempt_Bonus} first-attempt bonus</div>
        <div class="flex gap-2">
          <button data-action="close-modal" class="btn-ghost text-[13px]">Cancel</button>
          <button data-action="submit-pkt-attempt" class="btn-primary text-[13px]"><i data-lucide="check-check" class="text-[14px]"></i> Submit PKT</button>
        </div>
      </div>
    `, { size: 'lg' });
  }
  function submitTakePkt() {
    if (!takeSession) return;
    const pkt = A.pktForModule(takeSession.moduleId);
    const qs = A.questionsForPkt(pkt.PKT_ID);
    const answers = qs.map((_, i) => {
      const checked = document.querySelector(`input[name="take-q-${i}"]:checked`);
      if (!checked) return null;
      const label = checked.closest('label.take-pkt-opt');
      return label?.dataset?.opt || null;
    });
    if (answers.some(a => a == null)) return A.toast('Answer every question', 'warn');
    A.submitPktAttempt(takeSession.moduleId, takeSession.userId, answers);
    takeSession = null;
    A.closeModal(); A.render();
  }

  // ---- Mission ------------------------------------------------------------
  function openCreateMission(prefill) {
    const me = A.userById(A.state.activeUserId);
    const isSla = prefill?.presetType === 'SLA Recovery';
    const kpiId = prefill?.kpiId;
    const kpi = kpiId ? A.kpiById(kpiId) : null;
    const defaultName = prefill?.namePrefix ? `${prefill.namePrefix}${kpi ? ' — ' + kpi.KPI_Name : ''}` : '';
    const teamId = prefill?.audienceId || me?.TeamID;

    A.openModal(`
      ${modalHeader(isSla ? 'New SLA Recovery Mission' : 'New Mission', isSla ? 'Target the riskiest KPI and rally the team to recover SLA before EOM.' : 'KPI-linked goal · earn bonus points and badges by hitting target.', 'flag', isSla ? 'red-bg' : 'gold-bg')}
      <div class="p-5 overflow-y-auto scrollbar-thin space-y-3">
        ${isSla ? `<div class="rounded-xl bg-arena-red/[0.08] border border-arena-red/30 p-3 text-[12px] text-arena-text/85"><i data-lucide="badge-dollar-sign" class="text-arena-red text-[12px]"></i> SLA Recovery missions are commercial-linked. Points award on completion; mission progress feeds the Verification view for both TL and Manager.</div>` : ''}
        <div>
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Mission name *</label>
          <input id="m-name" value="${escapeHtml(defaultName)}" placeholder="e.g. Conversion Recovery Sprint" />
        </div>
        <div>
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Description</label>
          <textarea id="m-desc" rows="2" placeholder="Why this mission, what success looks like">${isSla && kpi ? escapeHtml(`Recover ${kpi.KPI_Name} to target before end of month to avoid penalty exposure.`) : ''}</textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">KPI</label>
            <select id="m-kpi">
              ${A.state.kpis.map(k => `<option value="${k.KPI_ID}" ${kpiId === k.KPI_ID ? 'selected' : ''}>${k.KPI_Name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Target value</label>
            <input id="m-target" type="number" value="${kpi?.Target ?? 95}" />
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Audience type</label>
            <select id="m-audience-type">
              <option ${teamId ? 'selected' : ''}>Team</option><option>Process</option><option>Account</option>
            </select>
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Audience target</label>
            <select id="m-audience-id"></select>
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">End date</label>
            <input id="m-end" type="date" value="${A.addDays(isSla ? 10 : 7)}" />
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Reward points</label>
            <input id="m-reward" type="number" value="${isSla ? 700 : 500}" />
          </div>
          <div class="col-span-2">
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Commercial linkage ${isSla ? '(auto-set)' : '(optional)'}</label>
            <input id="m-link-comm" placeholder="e.g. Linked to conversion/effectuation penalty exposure" value="${isSla && kpi ? escapeHtml(`Linked to ${kpi.KPI_Name} penalty exposure`) : ''}" />
          </div>
        </div>
      </div>
      <div class="p-4 border-t border-white/5 flex justify-end gap-2">
        <button data-action="close-modal" class="btn-ghost text-[13px]">Cancel</button>
        <button data-action="submit-mission" data-mission-type="${isSla ? 'SLA Recovery' : 'Custom'}" class="btn-primary text-[13px]"><i data-lucide="flag" class="text-[14px]"></i> Launch mission</button>
      </div>
    `, { onMount: () => {
      fillAudienceTargets('Team');
      document.getElementById('m-audience-type').addEventListener('change', e => fillAudienceTargets(e.target.value));
      // Pre-select team if prefilled
      if (teamId) {
        const sel = document.getElementById('m-audience-id');
        if (sel) sel.value = teamId;
      }
    } });
  }
  function submitMission() {
    const name = document.getElementById('m-name')?.value?.trim();
    if (!name) return A.toast('Mission name is required', 'warn');
    const submitBtn = document.querySelector('[data-action="submit-mission"]');
    const presetType = submitBtn?.dataset?.missionType;
    const m = {
      Mission_ID: A.uid('MIS'),
      Mission_Name: name,
      Mission_Type: presetType === 'SLA Recovery' ? 'SLA Recovery' : 'Custom',
      Description: document.getElementById('m-desc')?.value?.trim() || '',
      Audience_Type: document.getElementById('m-audience-type')?.value,
      Audience_ID: document.getElementById('m-audience-id')?.value,
      KPI_ID: document.getElementById('m-kpi')?.value,
      Target_Value: Number(document.getElementById('m-target')?.value || 0),
      Reward_Points: Number(document.getElementById('m-reward')?.value || 0),
      XP_Reward: Math.round(Number(document.getElementById('m-reward')?.value || 0) * 0.5),
      Badge_ID: 'B001',
      Start_Date: A.todayStr(),
      End_Date: document.getElementById('m-end')?.value,
      Status: 'Active',
      Commercial_Linkage: document.getElementById('m-link-comm')?.value?.trim() || null,
      Created_By: A.state.activeUserId,
    };
    A.state.missions.unshift(m);
    A.logActivity(`Created mission "${m.Mission_Name}"`, A.userById(A.state.activeUserId)?.Name, 'mission');
    A.toast(`Mission launched · "${m.Mission_Name}"`, 'gold', { icon: 'flag' });
    A.confetti(20);
    A.persist();
    A.closeModal(); A.render();
  }

  // ---- Coaching Note ------------------------------------------------------
  function openCoachingNote(prefill) {
    const me = A.userById(A.state.activeUserId);
    const teamMembers = me ? A.teamMembers(me.TeamID) : A.allAgents();
    A.openModal(`
      ${modalHeader('Add Coaching Note', 'Capture a 1:1 plan for an agent — KPI focus, trigger and next steps.', 'message-square-heart', 'violet-bg')}
      <div class="p-5 overflow-y-auto scrollbar-thin space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Agent *</label>
            <select id="co-agent">${teamMembers.map(u => `<option value="${u.UserID}" ${prefill?.userId === u.UserID ? 'selected' : ''}>${u.Name}</option>`).join('')}</select>
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">KPI focus</label>
            <select id="co-kpi">${A.state.kpis.map(k => `<option value="${k.KPI_ID}" ${prefill?.kpiId === k.KPI_ID ? 'selected' : ''}>${k.KPI_Name}</option>`).join('')}</select>
          </div>
        </div>
        <div>
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Trigger reason</label>
          <input id="co-trigger" placeholder="e.g. Red performance trend / Compliance alert / Recurring eligible-call conversion dip" />
        </div>
        <div>
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Coaching note *</label>
          <textarea id="co-note" rows="3" placeholder="What you'll discuss, what good looks like, and the next checkpoint"></textarea>
        </div>
        <div>
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Due date</label>
          <input id="co-due" type="date" value="${A.addDays(5)}" />
        </div>
      </div>
      <div class="p-4 border-t border-white/5 flex justify-end gap-2">
        <button data-action="close-modal" class="btn-ghost text-[13px]">Cancel</button>
        <button data-action="submit-coaching-note" class="btn-primary text-[13px]"><i data-lucide="message-square-heart" class="text-[14px]"></i> Save note</button>
      </div>
    `);
  }
  function submitCoachingNote() {
    const userId = document.getElementById('co-agent')?.value;
    const kpiId = document.getElementById('co-kpi')?.value;
    const trigger = document.getElementById('co-trigger')?.value?.trim() || 'Performance trend';
    const note = document.getElementById('co-note')?.value?.trim();
    const dueDate = document.getElementById('co-due')?.value;
    if (!userId || !note) return A.toast('Pick an agent and write a note', 'warn');
    A.createCoachingNote({ userId, kpiId, triggerReason: trigger, note, dueDate });
    A.closeModal(); A.render();
  }

  // ---- Challenge ----------------------------------------------------------
  const CHALLENGE_PRESETS = [
    { id: 'Conversion Sprint',  label: 'Conversion Sprint',  icon: 'zap',           kpiId: 'KPI002', entry: 100, pool: 200, days: 2, type: 'Peer',  desc: 'Beat your opponent on eligible-call conversion.' },
    { id: 'APD Dash',           label: 'APD Dash',           icon: 'gauge',         kpiId: 'KPI003', entry: 100, pool: 200, days: 3, type: 'Peer',  desc: 'Win on applications-per-day velocity.' },
    { id: 'Quality Shield',     label: 'Quality Shield',     icon: 'shield-check',  kpiId: 'KPI012', entry: 150, pool: 300, days: 3, type: 'Peer',  desc: 'Highest QA score earns the reward pool.' },
    { id: 'Effectuation Hero',  label: 'Effectuation Hero',  icon: 'check-check',   kpiId: 'KPI004', entry: 100, pool: 200, days: 3, type: 'Peer',  desc: 'Protect effectuated enrollment quality.' },
    { id: 'Disclosure Flow',    label: 'Disclosure Flow',    icon: 'timer',         kpiId: 'KPI010', entry: 75,  pool: 150, days: 2, type: 'Peer',  desc: 'Complete disclosures accurately without rushing.' },
    { id: 'SOA Discipline',     label: 'SOA Discipline',     icon: 'file-check-2',  kpiId: 'KPI009', entry: 75,  pool: 150, days: 5, type: 'Peer',  desc: 'Scope of Appointment documentation discipline.' },
    { id: 'Compliance Quest',   label: 'Compliance Quest',   icon: 'lock',          kpiId: 'KPI006', entry: 100, pool: 250, days: 5, type: 'Peer',  desc: 'CMS test-call and required-disclosure discipline.' },
    { id: 'Team vs Team',       label: 'Team vs Team',       icon: 'users-round',   kpiId: 'KPI001', entry: 0,   pool: 1000, days: 5, type: 'Team',  desc: 'League battle between two squads.' },
    { id: 'TL Assigned',        label: 'TL Assigned',        icon: 'shield',        kpiId: 'KPI005', entry: 0,   pool: 800, days: 5, type: 'Team Lead Issued', desc: 'TL-issued team quest.' },
    { id: 'SLA Recovery',       label: 'SLA Recovery',       icon: 'badge-dollar-sign', kpiId: 'KPI001', entry: 0, pool: 1000, days: 7, type: 'Manager Issued',   desc: 'Recover an SLA at risk this month.' },
    { id: 'Custom',             label: 'Custom',             icon: 'sliders',       kpiId: 'KPI001', entry: 100, pool: 200, days: 3, type: 'Peer',  desc: 'Pick everything yourself.' },
  ];

  let _draftChallenge = null;

  // Build participant options based on creator role + challenge type.
  // Returns [{ id, label }] for the dropdowns.
  function buildParticipantOptions(role, type, excludeId) {
    // Team-vs-team: list of teams excluding `excludeId`
    if (type === 'Team') {
      return A.state.teams
        .filter(t => t.TeamID !== excludeId)
        .map(t => ({ id: t.TeamID, label: `${t.TeamName} · ${t.Location}` }));
    }
    // Agent-level (peer / TL-issued / Manager-issued)
    const me = A.userById(A.state.activeUserId);
    let pool;
    if (role === 'Team Lead') {
      // TL stays in their span — agents from TL's team only
      pool = A.teamMembers(me.TeamID);
    } else if (role === 'Agent') {
      // Same-team agents first; fall back to all active agents if the team has no opponents
      const sameTeam = A.teamMembers(me.TeamID).filter(u => u.UserID !== me.UserID);
      pool = sameTeam.length ? sameTeam : A.allAgents().filter(u => u.UserID !== me.UserID);
    } else {
      // Manager — full account
      pool = A.allAgents();
    }
    return pool
      .filter(u => u.UserID !== excludeId)
      .map(u => ({ id: u.UserID, label: `${u.Name} · ${A.teamById(u.TeamID)?.TeamName || ''}` }));
  }

  function defaultPrimaryParticipant(role) {
    const me = A.userById(A.state.activeUserId);
    if (role === 'Agent') return me?.UserID || '';
    if (role === 'Team Lead') {
      const team = A.teamMembers(me.TeamID);
      return team[0]?.UserID || '';
    }
    // Manager
    const a = A.allAgents()[0];
    return a?.UserID || '';
  }

  function openCreateChallenge(typeOrCategory, prefill) {
    const role = A.state.role;
    let preset = null;
    if (typeOrCategory) preset = CHALLENGE_PRESETS.find(p => p.id === typeOrCategory || p.label === typeOrCategory);
    if (!preset && typeOrCategory) preset = CHALLENGE_PRESETS.find(p => p.type === typeOrCategory);
    if (!preset) preset = CHALLENGE_PRESETS[0];

    _draftChallenge = {
      preset: preset.id,
      kpiId: prefill?.kpiId || preset.kpiId,
      type: preset.type,
      p1: prefill?.againstUser ? defaultPrimaryParticipant(role) : defaultPrimaryParticipant(role),
      p2: prefill?.againstUser || '',
      entry: preset.entry,
      pool: preset.pool,
      days: preset.days,
      name: '',
      minVolume: 20,
      creatorRole: role,
    };

    renderChallengeModal();
  }

  function renderChallengeModal() {
    const me = A.userById(A.state.activeUserId);
    const role = A.state.role;
    const draft = _draftChallenge;
    const presetMeta = CHALLENGE_PRESETS.find(p => p.id === draft.preset);
    const isTeam = draft.type === 'Team';
    const isCustom = draft.preset === 'Custom';
    const agentLocked = role === 'Agent' && !isTeam; // Agent peer challenges: Side A is the agent themselves

    const kpi = A.kpiById(draft.kpiId);
    const startDate = A.todayStr();
    const endDate = A.addDays(draft.days, startDate);

    // Build picker options:
    //   - Side A (p1): excludes the chosen p2
    //   - Side B (p2): excludes the chosen p1
    const p1Options = isTeam
      ? buildParticipantOptions(role, 'Team', draft.p2)
      : buildParticipantOptions(role, 'Peer', draft.p2);
    const p2Options = isTeam
      ? buildParticipantOptions(role, 'Team', draft.p1)
      : buildParticipantOptions(role, 'Peer', draft.p1);

    // Resolve labels for battle preview
    const p1Display = (() => {
      if (!draft.p1) return null;
      return isTeam ? A.teamById(draft.p1) : A.userById(draft.p1);
    })();
    const p1Label = isTeam ? p1Display?.TeamName : p1Display?.Name;
    const p2Display = (() => {
      if (!draft.p2) return null;
      return isTeam ? A.teamById(draft.p2) : A.userById(draft.p2);
    })();
    const p2Label = isTeam ? p2Display?.TeamName : p2Display?.Name;

    const sideALabelText = isTeam ? 'Side A · Team' : (role === 'Agent' ? 'You' : 'Side A · Participant');
    const sideBLabelText = isTeam ? 'Side B · Team' : 'Opponent';

    A.openModal(`
      ${modalHeader('Step into the Arena', `Pick a battle template — winner earns the Reward Pool in Arena Points.`, 'swords', 'cyan-bg')}
      <div class="p-5 overflow-y-auto scrollbar-thin space-y-4">

        <!-- Theme grid -->
        <div>
          <div class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold mb-2">Choose your battle</div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            ${CHALLENGE_PRESETS.map(p => `
              <button data-action="ch-preset" data-preset="${p.id}" class="${draft.preset === p.id ? 'ring-2 ring-arena-gold/60 shadow-gold' : 'hover:border-arena-cyan/40'} text-left rounded-xl bg-white/[0.03] border border-white/10 p-2.5 transition">
                <div class="flex items-center gap-1.5 mb-1">
                  <i data-lucide="${p.icon}" class="text-[14px] ${draft.preset === p.id ? 'text-arena-gold' : 'text-arena-cyan'}"></i>
                  <span class="text-[12px] font-bold">${p.label}</span>
                </div>
                <div class="text-[10px] text-arena-muted line-clamp-2">${p.desc}</div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Battle preview -->
        <div class="rounded-2xl glass p-3">
          <div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold mb-2">Battle preview</div>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-9 h-9 rounded-xl gold-bg grid place-items-center font-bold text-[10px]">${p1Label ? p1Label.split(' ').map(s => s[0]).slice(0,2).join('') : '?'}</div>
              <div class="text-[12px] font-semibold truncate">${p1Label || (agentLocked ? me?.Name : 'Pick Side A')}</div>
            </div>
            <span class="font-display font-extrabold gold-text text-[14px]">VS</span>
            <div class="flex items-center gap-2 min-w-0 justify-end">
              <div class="text-[12px] font-semibold truncate text-right">${p2Label || 'Pick opponent'}</div>
              <div class="w-9 h-9 rounded-xl violet-bg grid place-items-center font-bold text-[10px]">${p2Label ? p2Label.split(' ').map(s => s[0]).slice(0,2).join('') : '?'}</div>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2 mt-3 text-center">
            <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-1.5">
              <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">KPI</div>
              <div class="text-[12.5px] font-bold">${kpi?.KPI_Name || '—'}</div>
            </div>
            <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-1.5">
              <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Reward Pool</div>
              <div class="text-[12.5px] font-bold gold-text">${draft.pool} pts</div>
            </div>
            <div class="rounded-lg bg-white/[0.02] border border-white/5 px-2 py-1.5">
              <div class="text-[9px] uppercase tracking-wider text-arena-muted font-semibold">Window</div>
              <div class="text-[12.5px] font-bold">${draft.days}d</div>
            </div>
          </div>
        </div>

        <!-- Form fields -->
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Challenge name</label>
            <input id="ch-name" placeholder="e.g. ${presetMeta.label} — ${kpi?.KPI_Name || ''}" value="${escapeHtml(draft.name || '')}" />
          </div>

          <!-- Side A (p1) -->
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">${sideALabelText}</label>
            ${agentLocked
              ? `<input value="${escapeHtml(me?.Name || '')}" disabled />
                 <input id="ch-p1" type="hidden" value="${me?.UserID || ''}" />`
              : `<select id="ch-p1">
                   <option value="">— Pick —</option>
                   ${p1Options.map(o => `<option value="${o.id}" ${draft.p1 === o.id ? 'selected' : ''}>${o.label}</option>`).join('')}
                 </select>`
            }
          </div>

          <!-- Side B (p2) -->
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">${sideBLabelText}</label>
            <select id="ch-p2">
              <option value="">— Pick —</option>
              ${p2Options.map(o => `<option value="${o.id}" ${draft.p2 === o.id ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">KPI</label>
            <select id="ch-kpi" ${isCustom ? '' : 'disabled'}>
              ${A.state.kpis.map(k => `<option value="${k.KPI_ID}" ${draft.kpiId === k.KPI_ID ? 'selected' : ''}>${k.KPI_Name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Duration</label>
            <select id="ch-days">
              ${[1,2,3,5,7].map(d => `<option value="${d}" ${draft.days === d ? 'selected' : ''}>${d} day${d === 1 ? '' : 's'}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Min eligibility (volume)</label>
            <input id="ch-min" type="number" value="${draft.minVolume}" />
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Entry Pts</label>
            <input id="ch-entry" type="number" value="${draft.entry}" />
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Reward Pool</label>
            <input id="ch-pool" type="number" value="${draft.pool}" />
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Start date</label>
            <input id="ch-start" type="date" value="${startDate}" disabled />
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">End date</label>
            <input id="ch-end" type="date" value="${endDate}" disabled />
          </div>
        </div>

        <div class="text-[11px] text-arena-muted flex items-center gap-1.5"><i data-lucide="info" class="text-[10px]"></i> Entry Pts contributed by Side A are held until the challenge settles. Winner earns the reward pool. Points circulate inside the Arena economy and are not redeemable for cash.</div>
      </div>
      <div class="p-4 border-t border-white/5 flex justify-end gap-2">
        <button data-action="close-modal" class="btn-ghost text-[13px]">Cancel</button>
        <button data-action="submit-challenge" class="btn-primary text-[13px]"><i data-lucide="swords" class="text-[14px]"></i> Launch challenge</button>
      </div>
    `, { size: 'lg', onMount: (root) => {
        root.addEventListener('change', e => {
          if (e.target.id === 'ch-days')  _draftChallenge.days = Number(e.target.value);
          if (e.target.id === 'ch-kpi')   _draftChallenge.kpiId = e.target.value;
          if (e.target.id === 'ch-entry') _draftChallenge.entry = Number(e.target.value);
          if (e.target.id === 'ch-pool')  _draftChallenge.pool = Number(e.target.value);
          if (e.target.id === 'ch-min')   _draftChallenge.minVolume = Number(e.target.value);
          if (e.target.id === 'ch-p1')    _draftChallenge.p1 = e.target.value;
          if (e.target.id === 'ch-p2')    _draftChallenge.p2 = e.target.value;
          // Re-render preview & rebuild dependent lists when participants/duration/kpi change
          if (['ch-days', 'ch-kpi'].includes(e.target.id)) renderChallengeModal();
        });
        root.addEventListener('input', e => {
          if (e.target.id === 'ch-name') _draftChallenge.name = e.target.value;
        });
      } });
  }

  function applyChallengePreset(presetId) {
    const p = CHALLENGE_PRESETS.find(x => x.id === presetId);
    if (!p) return;
    _draftChallenge.preset = p.id;
    _draftChallenge.kpiId = p.kpiId;
    _draftChallenge.type = p.type;
    _draftChallenge.entry = p.entry;
    _draftChallenge.pool = p.pool;
    _draftChallenge.days = p.days;
    renderChallengeModal();
  }

  function submitCreateChallenge() {
    const draft = _draftChallenge; if (!draft) return;
    // Read fresh values from DOM in case onChange race
    const nameField = document.getElementById('ch-name')?.value?.trim();
    const p1Field = document.getElementById('ch-p1')?.value || draft.p1;
    const p2Field = document.getElementById('ch-p2')?.value || draft.p2;
    if (!p1Field) return A.toast('Pick Side A first', 'warn');
    if (!p2Field) return A.toast('Pick an opponent', 'warn');
    if (p1Field === p2Field) return A.toast('Side A and the opponent must be different', 'warn');
    const kpiId = document.getElementById('ch-kpi')?.value || draft.kpiId;
    const days = Number(document.getElementById('ch-days')?.value || draft.days);
    const entry = Number(document.getElementById('ch-entry')?.value || draft.entry);
    const pool = Number(document.getElementById('ch-pool')?.value || draft.pool);
    const minVol = Number(document.getElementById('ch-min')?.value || draft.minVolume || 0);
    const kpi = A.kpiById(kpiId);
    const finalName = nameField || `${(CHALLENGE_PRESETS.find(p => p.id === draft.preset) || {}).label || 'Challenge'} — ${kpi?.KPI_Name || ''}`;
    const c = A.createChallenge({
      name: finalName,
      type: draft.type,
      p1: p1Field, p2: p2Field,
      kpiId,
      end: A.addDays(days),
      entry, pool,
    });
    if (minVol && c) c.Min_Volume = minVol;
    _draftChallenge = null;
    A.closeModal();

    // Role-aware navigation: stay in role; route to the right view.
    const role = A.state.role;
    if (role === 'Team Lead') {
      A.state.page = 'lead-missions';
    } else if (role === 'Manager') {
      A.state.page = 'mgr-command';
    } else {
      // Agent (default): jump to Challenges page on Sent bucket so they see the new battle queued
      A.state.role = 'Agent';
      A.state.page = 'challenges';
      A.state.challengeBucket = 'sent';
      A.state.challengeTheme = 'all';
    }
    A.persist(); A.render();
  }

  // ---- Verify row (commercial verification) ------------------------------
  function openVerifyRow(rowKey) {
    const row = A.state.verification.find(v => `${v.Entity_ID}|${v.KPI_ID}|${v.Verifier_Role}` === rowKey);
    if (!row) return A.toast('Row not found', 'warn');
    A.openModal(`
      ${modalHeader(`Verify · ${escapeHtml(row.Entity_Name)} · ${escapeHtml(row.KPI_Name)}`, `Forecast EOM ${row.Forecast_EOM} · Net ${row.Net_Impact}`, 'shield-check', 'gold-bg')}
      <div class="p-5 overflow-y-auto scrollbar-thin">
        <div class="grid grid-cols-2 gap-3 text-[12.5px]">
          <div class="rounded-lg bg-white/[0.02] border border-white/10 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-semibold">Target</div><div class="text-lg font-bold">${row.Target}</div></div>
          <div class="rounded-lg bg-white/[0.02] border border-white/10 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-semibold">Actual MTD</div><div class="text-lg font-bold ${row.Variance_to_Target < 0 ? 'rag-red' : 'rag-green'}">${row.Actual_MTD}</div></div>
          <div class="rounded-lg bg-white/[0.02] border border-white/10 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-semibold">Forecast EOM</div><div class="text-lg font-bold">${row.Forecast_EOM}</div></div>
          <div class="rounded-lg bg-white/[0.02] border border-white/10 p-3"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-semibold">Net impact</div><div class="text-lg font-bold ${(row.Net_Impact || 0) >= 0 ? 'rag-green' : 'rag-red'}">${row.Net_Impact || 0}</div></div>
        </div>
        <div class="mt-3">
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Decision</label>
          <select id="v-status">
            <option>Verified</option>
            <option>Action Pending</option>
            <option>Recovery Mission Required</option>
            <option>Escalated</option>
          </select>
        </div>
        <div class="mt-2">
          <label class="text-[11px] uppercase tracking-wider text-arena-muted font-semibold">Comments</label>
          <textarea id="v-comments" rows="3" placeholder="What action will you take? Mission to launch?">${escapeHtml(row.Comments || row.Action_Required || '')}</textarea>
        </div>
      </div>
      <div class="p-4 border-t border-white/5 flex justify-end gap-2">
        <button data-action="close-modal" class="btn-ghost text-[13px]">Cancel</button>
        <button data-action="submit-verify" data-row="${rowKey}" class="btn-primary text-[13px]"><i data-lucide="shield-check" class="text-[14px]"></i> Save verification</button>
      </div>
    `);
  }
  function submitVerify(rowKey) {
    const status = document.getElementById('v-status')?.value;
    const comments = document.getElementById('v-comments')?.value?.trim();
    A.setVerificationStatus(rowKey, status, comments);
    A.closeModal(); A.render();
  }

  // ---- Reward Unlocked ----------------------------------------------------
  function openRewardUnlocked(redemption) {
    const r = A.state.rewards.find(x => x.Reward_ID === redemption.Reward_ID);
    if (!r) return;
    const isPending = redemption.Status === 'Pending Approval';
    const owner = A.userById(redemption.Fulfilment_Owner);
    const icon = r.Icon || 'gift';

    A.openModal(`
      <div class="reward-unlocked-modal relative overflow-hidden">
        <button data-action="close-modal" class="absolute top-3 right-3 z-10 icon-btn"><i data-lucide="x" class="text-[14px]"></i></button>
        <div class="p-6 sm:p-8 text-center relative">
          <div class="flex flex-col items-center gap-4">
            <div class="relative">
              <div class="absolute inset-0 -m-4 level-glow"></div>
              <div class="hex hex-lg gold-bg shadow-gold relative" style="width:96px;height:108px;">
                <i data-lucide="${icon}" class="text-[36px] pop-in"></i>
                <span class="hex-glow"></span>
              </div>
            </div>
            <div>
              <div class="text-[11px] uppercase tracking-[0.22em] text-arena-gold font-bold">${isPending ? 'Submitted for approval' : 'Reward unlocked'}</div>
              <div class="font-display font-extrabold text-2xl sm:text-3xl gold-text leading-tight mt-1">${escapeHtml(r.Reward_Name)}</div>
              <div class="text-[12px] text-arena-text/80 mt-2 max-w-md mx-auto">${escapeHtml(r.Description || '')}</div>
            </div>

            <div class="grid grid-cols-3 gap-2 w-full max-w-md mt-1">
              <div class="rounded-xl bg-white/[0.03] border border-white/8 px-2 py-2">
                <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-bold">Points spent</div>
                <div class="text-[14px] font-bold gold-text">${redemption.Points_Spent.toLocaleString()}</div>
              </div>
              <div class="rounded-xl bg-white/[0.03] border border-white/8 px-2 py-2">
                <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-bold">Status</div>
                <div class="text-[12px] font-bold ${isPending ? 'text-arena-amber' : 'text-arena-emerald'}">${escapeHtml(redemption.Status)}</div>
              </div>
              <div class="rounded-xl bg-white/[0.03] border border-white/8 px-2 py-2">
                <div class="text-[9.5px] uppercase tracking-wider text-arena-muted font-bold">${isPending ? 'Routed to' : 'Fulfilment'}</div>
                <div class="text-[12px] font-bold">${escapeHtml(owner?.Name?.split(' ')[0] || redemption.Fulfilment_Owner || 'Ops')}</div>
              </div>
            </div>

            <div class="text-[12px] ${isPending ? 'text-arena-amber' : 'text-arena-emerald'} flex items-center gap-1.5 mt-1">
              <i data-lucide="${isPending ? 'hourglass' : 'check-check'}" class="text-[14px]"></i>
              ${isPending ? `Your TL will review this and notify you. Points are held until approved.` : `Confirmation arriving in your inbox shortly.`}
            </div>

            <div class="flex items-center gap-2 mt-3 flex-wrap justify-center">
              <button data-action="close-modal" class="btn-secondary text-[12.5px]">Continue browsing</button>
              <button data-action="close-modal-and-earn" class="btn-primary text-[12.5px]"><i data-lucide="flag" class="text-[12px]"></i> Earn more points</button>
            </div>
          </div>
        </div>
      </div>
    `, { onMount: () => { A.confetti(48); } });
  }

  // ---- Export ------------------------------------------------------------
  window.ArenaModals = {
    openMobileMenu, openRewardUnlocked,
    openCreateBroadcast, submitBroadcast,
    openCreateTraining, submitTraining,
    openCreatePkt, submitPkt, pktAddQuestion, pktDelQuestion, pktSetCorrect,
    openTakePkt, submitTakePkt,
    openCreateMission, submitMission,
    openCoachingNote, submitCoachingNote,
    openCreateChallenge, submitCreateChallenge, applyChallengePreset,
    openVerifyRow, submitVerify,
  };
})();
