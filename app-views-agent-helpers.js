/* eslint-disable */
// Performance Arena - Agent view shared helpers.

(function () {
  const A = window.Arena;
  if (!A) { console.error('Arena core not loaded for agent helpers'); return; }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  // ---- Avatar ------------------------------------------------------------

  function avatarHex(user, size) {
    const initials = (user?.Name || '?').split(' ').map(s => s[0]).slice(0, 2).join('');
    const id = user?.UserID || '';
    const seedHue = (id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)) % 360;
    const cls = size === 'lg' ? 'hex hex-lg' : (size === 'sm' ? 'hex hex-sm' : 'hex');
    return `
      <div class="${cls} text-white font-display font-bold relative" style="background: linear-gradient(135deg, hsl(${seedHue}, 70%, 50%), hsl(${(seedHue + 60) % 360}, 70%, 35%));">
        <span class="text-[14px] sm:text-[18px] tracking-tight">${initials}</span>
      </div>
    `;
  }

  // ---- Level Progress ring -----------------------------------------------------------

  function xpRing(pct, lvl, size) {
    const r = (size || 56) / 2 - 4;
    const C = 2 * Math.PI * r;
    const dash = (pct / 100) * C;
    const s = size || 56;
    return `
      <div class="relative" style="width:${s}px;height:${s}px">
        <svg class="xp-ring" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
          <circle cx="${s/2}" cy="${s/2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"/>
          <circle cx="${s/2}" cy="${s/2}" r="${r}" fill="none" stroke="url(#xpGrad)" stroke-width="3" stroke-dasharray="${dash} ${C - dash}" stroke-linecap="round"/>
          <defs>
            <linearGradient id="xpGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7c5cff"/>
              <stop offset="100%" stop-color="#3ad4ff"/>
            </linearGradient>
          </defs>
        </svg>
        <div class="absolute inset-0 grid place-items-center">
          <div class="text-center leading-none">
            <div class="text-[8px] uppercase tracking-wider text-arena-muted font-semibold">L${lvl}</div>
            <div class="text-[10px] font-bold text-arena-text">${pct}%</div>
          </div>
        </div>
      </div>
    `;
  }

  // ---- Sparkline (mini SVG) ----------------------------------------------

  function sparkline(values, color) {
    if (!values || !values.length) return '';
    const w = 100, h = 24, pad = 2;
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((v - min) / range) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark">
        <polyline fill="none" stroke="${color || '#7c5cff'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" points="${pts}" opacity="0.95"/>
        <polyline fill="none" stroke="${color || '#7c5cff'}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" points="${pts}" opacity="0.18"/>
      </svg>
    `;
  }

  function priorityChip(p) {
    const map = { Critical: 'bg-arena-red/15 text-arena-red border border-arena-red/30',
                  High: 'bg-arena-amber/15 text-arena-amber border border-arena-amber/30',
                  Medium: 'bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30',
                  Low: 'bg-white/5 text-arena-muted border border-white/10' };
    return `<span class="chip ${map[p] || map.Low}">${p || 'Low'}</span>`;
  }

  function ragChip(rag) {
    if (rag === 'Green') return `<span class="chip rag-bg-green rag-green"><i data-lucide="check" class="text-[10px]"></i> Green</span>`;
    if (rag === 'Amber') return `<span class="chip rag-bg-amber rag-amber"><i data-lucide="circle-alert" class="text-[10px]"></i> Amber</span>`;
    if (rag === 'Red')   return `<span class="chip rag-bg-red rag-red"><i data-lucide="triangle-alert" class="text-[10px]"></i> Red</span>`;
    return `<span class="chip bg-white/5 text-arena-muted border border-white/10">${rag || '—'}</span>`;
  }

  function statusFromScore(score) {
    const n = Number(score || 0);
    if (n >= 100) return 'Green';
    if (n >= 90) return 'Amber';
    return 'Red';
  }

  function agentDisplayRow(row) {
    return row ? { ...row, Status: statusFromScore(row.Score) } : row;
  }

  // Demo-facing composite badge for the Agent Home hero. Combines the weighted
  // RAG with KPI-level counts so a "Green" composite with several Amber KPIs
  // doesn't read as "all clear" to a leadership audience.
  //   - red > 0                              → "At Risk"
  //   - rag = Green and amber >= 3           → "Green · Watch Items"
  //   - rag = Green and amber < 3            → "Green"
  //   - rag = Amber                          → "Watch"
  //   - rag = Red (no individual reds)       → "At Risk"

  function heroBadge(rag, redCount, amberCount) {
    // Composite score owns the main color. KPI-level Watch/Critical counts are
    // still visible below, but a 100+ score should never display a Red badge.
    if (rag === 'Green') {
      if (redCount > 0 || amberCount > 0) {
        return `<span class="chip rag-bg-green rag-green"><i data-lucide="check" class="text-[10px]"></i> Green · Action Items</span>`;
      }
      return `<span class="chip rag-bg-green rag-green"><i data-lucide="check" class="text-[10px]"></i> Green</span>`;
    }
    if (rag === 'Amber') {
      return `<span class="chip rag-bg-amber rag-amber"><i data-lucide="circle-alert" class="text-[10px]"></i> Watch</span>`;
    }
    return `<span class="chip rag-bg-red rag-red"><i data-lucide="triangle-alert" class="text-[10px]"></i> At Risk</span>`;
  }

  function agentVisibleKpiRow(row) {
    return row && A.kpiVisibleForRole(row.KPI_ID, 'Agent');
  }

  function visibleTodayRowsForUser(userId) {
    const user = A.userById(userId);
    return A.visibleKpiRowsForRole(A.todaysRowsForUser(userId), 'Agent', { processId: user?.ProcessID }).map(agentDisplayRow);
  }

  function dueLabel(due) {
    if (!due) return '—';
    const today = new Date(A.todayStr()); const d = new Date(due);
    const diff = Math.round((d - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `Overdue ${Math.abs(diff)}d`;
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    return `Due in ${diff}d`;
  }

  // ---- HOME (the hero) ----------------------------------------------------

  function rewardIcon(category) {
    if (/voucher|coffee/i.test(category)) return 'coffee';
    if (/break|work-life/i.test(category)) return 'sun';
    if (/recognition/i.test(category)) return 'medal';
    if (/learning/i.test(category)) return 'book-open';
    if (/charity/i.test(category)) return 'heart';
    return 'gift';
  }

  window.ArenaAgentViewHelpers = {
    escapeHtml, avatarHex, xpRing, sparkline, priorityChip, ragChip,
    statusFromScore, agentDisplayRow, heroBadge, agentVisibleKpiRow,
    visibleTodayRowsForUser, dueLabel, rewardIcon,
  };
})();
