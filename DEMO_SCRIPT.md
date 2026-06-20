# Performance Arena — 7-Minute Leadership Demo

**Audience:** Operations leaders · Transformation leaders · Account leaders · Senior management
**Goal:** Show how Performance Arena turns performance management from static reporting into real-time gamified action.
**Format:** Pitch, not a feature tour. Every screen earns its 30 seconds.

---

## Pre-flight checklist (do this 60 seconds before the meeting)

1. **Reset state** — Agent Profile → "Reset prototype state" → confirm. Or DevTools: `localStorage.removeItem('arena_state_v7'); location.reload();`
2. **Confirm role/user** — Sidebar shows **Agent / Myra Kumar (AG001)** on Arena Home.
3. **Browser zoom 100%, full-screen Chrome** (F11).
4. **Close DevTools** so the Tailwind CDN warning doesn't show.
5. **Speaker notes open on a second screen or printed.**

---

## Time budget (420 seconds total)

| Beat | Time | Cumulative |
|------|------|------------|
| 1. Opening problem | 0:30 | 0:30 |
| 2. Agent experience | 2:00 | 2:30 |
| 3. Team Lead experience | 2:00 | 4:30 |
| 4. Manager experience | 1:30 | 6:00 |
| 5. Business value | 0:40 | 6:40 |
| 6. Closing pitch | 0:20 | 7:00 |

---

# 1. Opening problem statement (30 sec)

**Click path:** Stay on Arena Home, don't move yet.

**Say (verbatim, slow):**
> "Today, performance management in operations is mostly *yesterday's data, in a slide deck, reviewed once a month.* Agents see a number, leads see a spreadsheet, managers see exposure when it's already lost. Everyone is reacting.
>
> Performance Arena is what happens when you make that data live, social, and gamified — for the *same* operation, the *same* KPIs, the *same* SLAs."

**Key beat:** Pause for 1 second. Then click into the demo.

---

# 2. Agent experience (2 min)

> The point of this section: an agent sees their own game, not a report card. Every screen has a CTA. Nothing is read-only.

**Sidebar role:** Agent · `AG001` (Myra Kumar)

### 2a. Arena Home — *the wow screen* (25 sec)

**Click path:** already there.

**Point at:**
- The hero ring — Level Progress and level progression
- "Today's Performance" — live RAG (5 Green / 5 Amber / 0 Red across 10 KPIs)
- Squad rank ("#9 of 20")
- Earned-today strip + active mission card

**Say:**
> "This is what an agent sees when they open the app. Not a report — a game state. Their level, their squad rank, today's RAG across every KPI they're measured on. One screen, real-time, on a phone or a desk."

**🌟 Wow moment:** "Look at the energy density. There are six different live signals on this one screen — and every chip is clickable."

### 2b. Scorecard — *one-click challenge* (15 sec)

**Click path:** Sidebar → **Scorecard**

**Point at:**
- KPI cards with sparklines and variance vs target
- The amber/red KPIs each show "Coach guidance" + a **Challenge** button

**Say:**
> "When Myra sees she's amber on Identity Verification, she can challenge a teammate on that exact KPI in one click. We turn variance into action."

### 2c. Missions — *quest board* (15 sec)

**Click path:** Sidebar → **Missions**

**Point at:**
- The 10 mission types as filter chips (Daily, SLA Recovery, HIPAA, etc.)
- A mission card with progress bar + "Log progress" button

**Say:**
> "Missions are bite-sized targets — daily, weekly, recovery, learning. They're how a team lead nudges behaviour without writing an email. Agents accept them like quests."

### 2d. Challenges — *peer battles* (15 sec)

**Click path:** Sidebar → **Challenges** → click **+ Create Challenge**

**Point at:**
- Opponent dropdown auto-populates with same-team agents
- KPI selector + entry/reward
- Cancel without submitting (don't pollute state)

**Say:**
> "Agents can challenge each other — pick a peer, pick a KPI, set the duration. Side A is themselves, Side B accepts or declines. It's social proof on the metrics that matter."

**Close the modal.**

### 2e. Leaderboard — *social pressure* (10 sec)

**Click path:** Sidebar → **Leaderboard**

**Point at:**
- The filter chips (Team / Process / KPI / Weekly / Monthly / Challenge)
- Top performers each have a "Challenge" button — direct route back to the create-challenge flow

**Say:**
> "The leaderboard is filterable five different ways, and every name on it is a challenge target. Friendly competition, by design."

### 2f. Arena Store — *the dopamine loop* (15 sec)

**Click path:** Sidebar → **Arena Store**

**Point at:**
- Categories (Instant Perks, Recognition, Work-Life, Learning, Team)
- Two visible reward types: instant ("Premium Locker") and approval-required ("Extra Break")
- Hover over a card

**Say:**
> "Points have to be worth something. Instant perks fulfil immediately, work-life rewards route through the team lead for approval. The store is what closes the loop between effort and reward."

### 2g. Broadcasts → Training → PKT (15 sec)

**Click path:** Sidebar → **Training**

**Point at:**
- A broadcast card with "Acknowledge" CTA
- A training card with progress
- A PKT card with "Take PKT" or "Retry"

**Say:**
> "The same gamified surface carries compliance — broadcasts, micro-training, and post-knowledge tests. Acknowledgements are scored, completions earn points, PKT first-attempt passes get bonuses. Compliance becomes part of the game, not a separate task list."

**🌟 Wow moment (transition):** "And every action you just saw — every tap, every redemption, every challenge — is feeding the next two views."

---

# 3. Team Lead experience (2 min)

> The point of this section: a Team Lead has a cockpit, not an inbox.

**Sidebar role:** Team Lead · `TL001` (Ayaan Sharma)

### 3a. Coach Console — *overnight movers* (25 sec)

**Click path:** Already there after switching role (or click **Coach Console**)

**Point at:**
- Team health summary — RAG agent counts, today's score
- "Risk agents" panel — flagged on KPI variance
- "Recommended recognition" — agents who deserve a shout-out

**Say:**
> "When Ayaan starts his shift, he doesn't open six dashboards. He opens this. He sees who's at risk before the SLA breach happens, and who deserves recognition before they slip."

**🌟 Wow moment:** Hover the risk panel — "We surface the *why*, not just the score."

### 3b. Team — *performance health* (15 sec)

**Click path:** Sidebar → **Team**

**Point at:**
- Agent grid with KPI heatmap
- Trend arrows
- One-click drill into any agent

**Say:**
> "20 agents, 10 KPIs, one screen. Trend arrows tell you who's improving and who's not. Heatmap colours pull the eye to the rows that need attention."

### 3c. Create a mission *and* a challenge (20 sec)

**Click path:** Sidebar → **Missions** → click **+ New mission**

**Point at:**
- Mission type, target audience (just Ayaan's team), KPI, points, due date
- Cancel without submitting

**Click path:** **Coach Console** → on a risk agent, click **Issue challenge**

**Point at:**
- Both opponent dropdowns appear (TL is creating, not playing)
- Challenge auto-targets agents on T001 only — not cross-team

**Say:**
> "Ayaan can launch a mission that lands in his agents' phones in seconds. He can also issue a challenge between two of his agents — but notice the picker only shows *his* team. Manager span is the manager's job."

**Close the modal.**

### 3d. Verification tracking — *training & PKT rollup* (15 sec)

**Click path:** Sidebar → **Training Console**

**Point at:**
- Combined view: broadcasts, training, PKTs across all his agents
- Filters by status (Not Started / In Progress / Acknowledged / Completed / Overdue)
- "Bulk remind" for overdue agents

**Say:**
> "He sees who's behind on the HIPAA refresher in one filter — and remind them in one click. No spreadsheets, no chasing."

### 3e. Reward approval — *control that doesn't feel controlling* (15 sec)

**Click path:** Sidebar → **Coach Console** (back) → scroll to "Pending reward approvals" panel · click **Approve** on one item

**Point at:**
- Agent name + reward + cost
- Approve / Reject buttons
- Toast confirmation

**Say:**
> "Reward approvals route to the right TL automatically — it's the agent's actual TL, not a hardcoded queue. He approves an extra break in one tap and Myra gets the toast immediately."

### 3f. Coaching + Recognition (15 sec)

**Click path:** Sidebar → **Coaching** → quick scan → Sidebar → **Recognition**

**Point at:**
- Coaching: open notes with due dates, status pills, resolve button
- Recognition: "Recommended" panel shows top performers Ayaan hasn't recognized yet, plus a free-form recognize button

**Say:**
> "Coaching notes are tracked the same way work is — open, in progress, resolved. Recognition is *prompted*, not optional — we tell the lead who deserves a callout, then make it one click."

### 3g. Commercial exposure — *TL's own scope only* (15 sec)

**Click path:** Sidebar → **Commercial**

**Point at:**
- Forecast penalty / reward opportunity / net impact at the top — in **USD**
- Table is **only T001 rows** (10 KPI lines for his team)
- Risk column highlights what's at risk

**Say:**
> "Here's the part most performance tools miss — Ayaan now sees his team's *commercial* exposure, scoped to his span. Not the account number, his number. He's accountable to revenue, not just the SLA."

**🌟 Wow moment:** "We tested this. TL001's net impact is different from TL002's, and both are different from the manager's account-level number. The data is scoped, not duplicated."

---

# 4. Manager experience (1.5 min)

> The point of this section: a manager runs the account, not a meeting.

**Sidebar role:** Manager · `MGR001` (Anika Mehra)

### 4a. Command Center — *the cockpit* (20 sec)

**Click path:** Already there after role switch.

**Point at:**
- Top KPIs across the whole account
- Trend lines
- Active alerts strip

**Say:**
> "Anika's view is the account, not a team. Same data, rolled up. She doesn't have to wait for a Monday review — she sees the trend the moment it bends."

### 4b. SLA Health (15 sec)

**Click path:** Sidebar → **SLA Health**

**Point at:**
- Every contractual SLA rule with current MTD, forecast EOM, RAG
- The amber/red ones are clickable

**Say:**
> "Every SLA, current vs target vs forecast, all green-amber-red coded. The ones in red are the ones we'll talk about in the next QBR — except we're talking about them today."

### 4c. Commercial Impact — *penalty + reward together* (20 sec)

**Click path:** Sidebar → **Commercial**

**Point at:**
- Three top tiles: forecast penalty, reward opportunity, net impact (all USD)
- Account-level rows (HCA001) — different from any TL view

**Say:**
> "Penalty and reward in the same view — most tools show one or the other. The net number is what shows up in the P&L. Anika sees the account-level exposure across all five teams. She can see the dollar value of every KPI she manages, and chase opportunity, not just avoid penalties."

### 4d. What-If Simulator — *the hero moment* (25 sec)

**Click path:** Sidebar → **What-If**

**Point at:**
- KPI selector across the top
- Variance steps (+/- 0.5%, 1%, 1.5%, 2%) with their penalty/reward at each step
- Click a different rule

**Say:**
> "This is the screen leaders ask for first. *If we close ASA by 1%, what's the reward?* The simulator pulls from the contractual slabs — not assumptions. Anika walks into a steering committee with this, not a guess."

**🌟 Wow moment:** "Click a different KPI — same interface, different numbers, all tied to the actual SLA contract."

### 4e. Recovery mission — *one-click action* (10 sec)

**Click path:** Stay on What-If → on a red KPI, click **Create Recovery Mission**

**Point at:**
- Modal pre-fills the KPI, the team, suggested name, points, due date
- Cancel without submitting

**Say:**
> "When she sees the gap, she doesn't open Outlook to assign work. She launches a recovery mission directly from the screen that diagnosed the problem."

### 4f. Teams (10 sec)

**Click path:** Sidebar → **Teams**

**Point at:**
- Side-by-side comparison of all 5 teams
- KPI rollup per team

**Say:**
> "All five teams, side by side. Who's leading, who's lagging, on which KPI."

### 4g. Adoption (10 sec)

**Click path:** Sidebar → **Adoption**

**Point at:**
- DAU / WAU
- Mission acceptance rate
- Reward redemption rate
- Training completion %

**Say:**
> "We measure the platform itself. Adoption matters — a perfect tool nobody uses is a bad tool. We track DAU, mission take-up, training completion, store redemption — and we surface it back to the manager."

---

# 5. Business value (40 sec)

**Click path:** Click **Command Center** as a clean closing screen.

**Say (do not enumerate slowly — say all six in one breath):**
> "What does this give the business?
>
> **Higher agent engagement** — the game pulls people back into the app daily.
> **Faster SLA recovery** — leads see slippage in hours, not weeks.
> **Better training adoption** — compliance is gamified, not chased.
> **Stronger accountability** — TLs and managers see *their* exposure, not somebody else's.
> **Real commercial visibility** — penalty and reward, in dollars, on every screen.
> **And agent motivation that compounds** — recognition, rewards, and rank are wired into daily work."

---

# 6. Closing pitch (20 sec)

**Say (slow, eye contact):**
> "What you saw is a working prototype — not slides, not mock-ups. The data model holds 36 entities. Every action mutates real state. The same code path scales.
>
> **Today** — the prototype is yours to walk through, demo to clients, and stress-test internally.
> **Next** — pilot it on one account, one quarter, with live data feeds replacing the mock seed.
> **Then** — scale across the operation, with the platform learning from every action.
>
> Performance management as a game. Run by the operation, owned by the agents."

**Pause. Smile. Stop.**

---

# Three executive sound bites

Use these verbatim if a senior leader interrupts and asks "so what?":

1. **"We turn performance management from a monthly slide review into a daily game with live commercial dollars on every screen."**

2. **"Every screen is scoped to the person looking at it — agents see their own game, leads see their own team, managers see their own account, and the numbers don't leak between them."**

3. **"This is the first prototype I've built where compliance, recognition, coaching, and commercial exposure are the *same* product, not four separate dashboards."**

---

# Five likely leadership questions and answers

### Q1. *"Is this real or a mock-up?"*
**A:** *"It's a working prototype with a 36-entity data model and 110 automated regression tests. The data is synthetic — generated by Python, edited through Excel — but every interaction is wired end-to-end: redemptions, approvals, completions, recognitions all mutate real state in the browser. Pilot would replace the synthetic seed with live feeds; the front end stays."*

### Q2. *"How do we know agents will actually use it?"*
**A:** *"Two answers. First, we measure adoption directly — Manager → Adoption shows DAU, mission take-up, redemption, completion. Second, the design borrows from games people already use daily — Level Progress rings, leaderboards, quests, a store. The hard work is making the dopamine loop tight; we built that in. Pilot will tell us if our intuition holds, and we'll see it in week one."*

### Q3. *"What about gaming the metrics? Won't agents farm easy KPIs?"*
**A:** *"Three guardrails. One — challenges have a Min_Volume constraint, so you can't win on a single transaction. Two — verification still flows through the TL and Manager, so commercial reality wins over leaderboard reality. Three — the points system is tuned by the team lead, who can adjust mission rewards if they see farming. We'd watch this in the pilot and tune it; it's a tuning problem, not a structural one."*

### Q4. *"How does this fit with our existing PMS / WFM / LMS?"*
**A:** *"Performance Arena sits **on top** of those systems, not in place of them. KPIs are pulled from PMS, training modules from LMS, schedules from WFM. We don't replace the system of record — we replace the user experience of consuming it. The integration story is read-mostly with two write-back paths: completion status to LMS, recognition events to HRIS."*

### Q5. *"What does the pilot cost and how long?"*
**A:** *"One quarter, one account. Roughly: two weeks to wire one PMS feed and one LMS feed, two weeks of UAT with a TL group, eight weeks live with weekly tuning. We measure SLA movement, training adoption, and reward redemption against the prior quarter's baseline. The prototype itself is the design lift; pilot is integration and tuning, not net-new build."*

---

# Hard-don'ts during the demo

- ❌ **Don't open DevTools** — the Tailwind CDN warning will distract.
- ❌ **Don't submit a Create Challenge / Mission / Reward modal** — it pollutes state and the next demo will start mid-game. Always Cancel.
- ❌ **Don't drift into commercial slabs / what-if math** — the leaders care that it's there, not how it's calculated. Stay at the storyline level.
- ❌ **Don't say "this is just a prototype"** — say "working prototype with the full data model." Word choice matters.

---

# Recovery moves if something glitches

- **Page renders blank** → `localStorage.removeItem('arena_state_v7'); location.reload();` — recovers to fresh state in under 2 seconds.
- **Modal stuck** → press Escape, or click outside; the dispatcher always responds.
- **Wrong role showing** → sidebar role badge → click the right one; resets to that role's home.
- **Internet drops** → only Tailwind CDN + Lucide icons need internet on the very first load; after that the app runs fully offline. Cache it once before the meeting.


---

Client Outcome Layer — updated talk track

Use this after the first demo pass if leaders ask how KPIs connect to client value:

"The next layer is client outcome visibility. Agents see the behaviors that improve member experience — clarity, resolution confidence, quality support and access support. We do not show artificial dollar savings to agents. Team Leads see team/process patterns such as repeat contact risk, member effort risk and access friction, with definitions available through the question-mark icons. Managers see modeled client outcome impact such as repeat contact leakage, rework leakage, access friction and experience driver health. These values are clearly labelled as modeled and should be calibrated with client repeat-contact, cost-per-contact and rework data."

Recommended language:
- Arena Points are spendable rewards.
- Level Progress replaces XP and shows growth/status progression only.
- Repeat Contact Risk is a team/process signal, not an individual-agent blame metric.
- Manager dollar metrics are modeled client-value indicators until calibrated with client data.


## Updated focal-point talk track: Client Outcome Intelligence

Open TL or Manager -> Client Outcomes first. Say: "This is no longer just gamification. The focal point is client outcome intelligence: outcome score, driver tree, root cause theme, value bridge, and recommended intervention."

For Agents: "Agents see controllable behaviors and Level Progress, not artificial dollar savings."

For TLs: "TLs see which team/process pattern is affecting Member Effort, Experience Quality, Access Friction, or Capacity Stability, and can launch a coaching intervention."

For Managers: "Managers see account-level revenue, penalty as percent of revenue, modeled leakage, and which outcome action should be taken next."


## Additional demo beat — Driving Client Outcomes and SLA/KPI Trends

After showing Client Outcomes, open **Driving Client Outcomes** to explain why the outcome is moving: symptom, driver KPIs, root-cause themes, hotspot and recommended intervention. Then open **SLA/KPI Trends** to show week-on-week movement for Experience, Access/SLA and Capacity drivers.


---

# FINAL ACCEPTANCE TALK TRACK

The upgraded story is outcome-first:

- Agents see controllable behaviors and motivation, not artificial dollar savings.
- Team Leads see team patterns, SLA/KPI trends, client outcome RCA and coaching/challenge actions.
- Managers see account outcomes, revenue, penalty exposure, RCA and action planning in one clean executive flow.

Use this phrase in the demo:

> “We are not blaming agents for repeat contacts. Repeat Contact Risk is a team/process indicator. Agents see the behaviors they can control; TLs see the patterns they can coach; Managers see the client outcome and commercial impact they can govern.”
