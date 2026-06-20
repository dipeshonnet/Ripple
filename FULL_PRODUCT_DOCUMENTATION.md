# Performance Arena — Full Product Documentation

## 1. Product name

**Performance Arena**

## 2. Product positioning

Performance Arena is **not just a gamification app**. It is a **Client Outcome Intelligence layer with gamification mechanics**.

The product connects day-to-day operational activity to client-facing outcomes through a role-based performance journey:

```text
Agent controllable behaviors
→ Team Lead coaching and team pattern detection
→ Manager outcome intelligence
→ Client revenue, penalty exposure, and modeled value impact
```

The current prototype uses gamification mechanics such as Arena Points, missions, challenges, leaderboards, store rewards, badges, and Level Progress. However, the strategic positioning is broader than classic points-and-badges gamification.

The intended positioning is:

> Performance Arena explains which behaviors matter, why they matter to the client, and what action should be taken to move the business outcome.

This makes the concept complementary to existing gamification platforms such as Centrical. It should not be positioned by default as a replacement for Centrical. A better executive framing is:

> Centrical motivates activity. Performance Arena’s Client Outcome Intelligence layer explains which activity matters, why it matters to the client, and what action will move the business outcome.

## 3. Core value proposition

Performance Arena creates a single line of sight across three operating layers.

| Role | Primary question answered | Value created |
|---|---|---|
| Agent | What should I improve today? | Clear, controllable behaviors; motivation through points, missions, challenges and Level Progress. |
| Team Lead | Which team pattern should I coach? | Team-level SLA/KPI trends, Client Outcomes, RCA, Team Pulse, coaching and challenge actions. |
| Manager | Which client outcome is at risk and what is the commercial impact? | Account-level outcomes, revenue, penalty exposure, root causes, team contribution and action planning. |

The prototype turns performance management from a static review into a live operating loop:

```text
Measure → Diagnose → Act → Validate → Recognize → Improve
```

## 4. Role-based experience

### 4.1 Agent experience

The Agent experience is focused on motivation and controllable behaviors. Agents should not be shown artificial dollar savings or be blamed for metrics they do not directly control.

#### Agent pages

| Page | Purpose |
|---|---|
| Home | Shows overall game state, current score, RAG summary, points, Level Progress and active mission/challenge. |
| Scorecard | Shows agent-visible call-centre KPIs and “why it matters” guidance. |
| Missions | Quest-style targets that reward behavior improvement with Arena Points and Level Progress. |
| Challenges | Peer challenge experience using Arena Points; challenge wins go to TL validation before rewards are awarded. |
| Leaderboard | Social comparison across relevant scopes and challenge entry points. |
| Store | Reward redemption using Arena Points. |
| Training / PKT | Broadcasts, learning modules and knowledge checks. |
| Profile / reset state | Demo reset and profile/status information. |

#### Agent design rules

- Agents see **controllable behaviors**, not client-dollar savings.
- Agents do **not** own ASA directly.
- Agents should not be told they individually saved the client money from repeat calls.
- Agent scorecard excludes non-agent-owned or back-office metrics.
- Agent experience uses **Arena Points / Pts** as spendable currency.
- Agent experience uses **Level Progress** as growth/status progression.
- Agent experience should avoid prominent “XP” wording in demo-facing UI.

#### Agent metric treatment

Agent-facing metrics focus on behaviors that the agent can influence directly or support through good call handling:

- AHT
- CSAT
- FCR Support / First Contact Support
- Quality Score
- Schedule Adherence
- Attendance
- Calls Handled
- Courtesy & Respect
- Call Resolved
- Transfer Rate

ASA is excluded from the Agent scorecard because it is primarily driven by staffing, forecasting, queue design, interval management and capacity planning.

### 4.2 Team Lead experience

The Team Lead experience is focused on team patterns, coaching actions and team-scoped outcomes.

#### Team Lead pages

| Page | Purpose |
|---|---|
| Client Outcomes | Dedicated business outcome page for the TL’s team. Explains outcome status, drivers, root-cause themes and recommended actions. |
| SLA/KPI Trends | Current week vs previous week trend view for the TL’s team. |
| Driving Client Outcomes | Team-scoped root-cause analysis for client outcome movement. |
| Team Pulse | Team snapshot showing team performance, RAG counts, agent table and action buttons. |
| Coach Console | Risk agents, coaching, recognition, reward approvals and operational nudges. |
| Missions / Challenges | Create and manage missions/challenges for the team. |
| Commercial | Team-scoped penalty/reward exposure. |
| Training / PKT / Rewards | Training compliance, PKT tracking and reward approvals where applicable. |

#### Team Lead design rules

- TL owns team patterns and coaching actions.
- TL sees team/process indicators, not account-level numbers.
- TL penalty exposure is intentionally low and team-scoped for demo credibility.
- TL pages should clarify that repeat-contact and client outcome metrics are team/process indicators, not standalone individual-agent blame metrics.

### 4.3 Manager experience

The Manager experience is organized around account-level client outcomes, revenue and commercial intelligence.

#### Manager pages

| Page | Purpose |
|---|---|
| Client Outcomes | Executive command center for account-level outcome scores, RAG, WoW movement, primary drivers and recommended actions. |
| SLA/KPI Trends | Account-level current week vs previous week trend table, including team contribution. |
| Driving Client Outcomes | Account-level diagnostic view for deteriorating client outcomes. |
| Revenue & Commercial | Total revenue, penalty exposure, reward opportunity, net impact and value bridge. |
| What-If / Action Planner | Scenario modeling and action creation. |
| Team Comparison | Compare team performance and contribution to outcomes. |
| Adoption | Platform adoption, mission uptake, challenge usage and participation. |

#### Manager design rules

- Manager owns account-level outcomes.
- Manager sees revenue, penalty exposure and commercial impact.
- Manager RCA should show client outcome, symptom, driver KPIs, top contributing teams, root-cause themes, commercial/revenue impact and recommended intervention.
- Manager section should be executive-clean and organized around business outcomes, not scattered feature cards.

## 5. Core concepts

### 5.1 Arena Points / Pts

Arena Points are the **spendable reward currency**.

Agents earn points through:

- Performance
- Missions
- Challenges
- Training / PKT
- Recognition or other configured events

Agents spend points in the Arena Store or use them in challenge entry/reward mechanics. Challenge rewards use Pts, not XP.

### 5.2 Level Progress

Level Progress is the **growth/status progression system**. It replaces prominent demo-facing “XP” language.

Level Progress is not spendable. It helps agents move through levels, leagues, badges and status tiers.

Simple distinction:

```text
Arena Points = wallet / spendable reward currency
Level Progress = growth / status progression
```

### 5.3 KPI score

KPI score is a normalized metric score used to evaluate whether a metric is on target, watch, or critical. Some KPIs are higher-is-better, while others are lower-is-better.

Examples:

- CSAT: higher is better.
- AHT: lower is better.
- Transfer Rate: lower is better.
- Calls Handled: higher is better, with quality guardrails.

### 5.4 RAG status

RAG is a simple status system:

| RAG | Demo label | Meaning |
|---|---|---|
| Green | On Target | Metric is healthy or meeting target. |
| Amber | Watch | Metric needs attention but is not critical. |
| Red | Critical | Metric requires immediate focus. |

RAG counts should match the visible metric rows for each role.

### 5.5 Client Outcomes

Client Outcomes are the business-outcome layer on top of operational KPIs. They group related KPI drivers into outcomes that matter to the client.

Examples:

- Member Effort Risk
- Repeat Contact Risk / Leakage
- Access Friction
- Experience Driver Health
- Capacity Stability
- Commercial Value Bridge

### 5.6 Driving Client Outcomes

Driving Client Outcomes is a diagnostic page that explains why an outcome is at risk. It should include:

- Symptom
- Primary driver KPI
- Secondary driver KPI
- Root-cause theme
- Hotspot team or agents
- Recommended intervention
- Confidence and guardrail
- Drill-down panel

### 5.7 SLA/KPI Trends

SLA/KPI Trends show current week vs previous week movement by role scope:

- TL: team-level trends.
- Manager: account-level trends plus team contribution.

Trend direction should be business-readable:

- Improved
- Stable
- Watch
- Worsened

### 5.8 Revenue & Commercial

The Manager view includes modeled revenue and commercial exposure.

Core formula:

```text
Revenue MTD = Billable Calls × Rate per Call
```

Commercial fields include:

- Total Billable Calls MTD
- Rate per Call
- Total Revenue MTD
- Penalty Exposure
- Penalty as % of Revenue
- Reward Opportunity
- Net Commercial Impact
- Client Value Bridge

### 5.9 Repeat Contact Risk

Repeat Contact Risk is a team/process indicator. It should not be used as a standalone individual-agent blame metric.

It represents the risk that members contact again for the same or related issue within a defined window.

### 5.10 Member Effort Risk

Member Effort Risk combines friction signals such as repeat contact, transfer rate, unclear next step, escalation and low call-resolution signals.

### 5.11 Access Friction

Access Friction reflects how difficult it is for members to reach the right support at the right time. Inputs may include ASA, abandonment, schedule adherence, queue stability and transfer/routing friction.

### 5.12 Experience Driver Health

Experience Driver Health is a roll-up of operational KPIs that influence member/customer experience, such as CSAT, Courtesy & Respect, Quality Score and Call Resolved.

### 5.13 Capacity Stability

Capacity Stability reflects whether the operation has sufficient productive capacity to handle the expected volume. Inputs include calls handled, AHT, volume, adherence, and potentially occupancy/interval staffing in future versions.

### 5.14 Penalty Exposure

Penalty Exposure is a modeled commercial risk. It should be treated as a demo assumption until calibrated with contract and client data.

### 5.15 Team-scoped vs account-level exposure

| Scope | Who sees it | Meaning |
|---|---|---|
| Team-scoped exposure | Team Lead | Exposure linked only to the TL’s team. Intentionally low for demo. |
| Account-level exposure | Manager | Exposure across all teams/account. Used for executive and client conversations. |

## 6. Design principles

1. **Agent = behavior and motivation.**  
   Agents should see controllable behaviors, missions, points and level progress.

2. **TL = coaching and pattern detection.**  
   TLs should see team patterns, RCA, trend movement and recommended actions.

3. **Manager = client outcome and commercial intelligence.**  
   Managers should see account-level outcomes, revenue, penalty exposure and action plans.

4. **No agent blame for team/process metrics.**  
   Repeat contact, access friction and FCR outcomes are influenced by multiple factors.

5. **No artificial dollar savings to agents.**  
   Dollars belong primarily in TL/Manager views.

6. **Use influence language.**  
   Say “influences,” “supports,” or “is a driver of.” Do not say “directly determines” unless supported by client data.

7. **Keep modeled metrics transparent.**  
   Every modeled metric should include a definition, inputs, usage guidance, confidence and guardrail.

8. **Business outcome first.**  
   TL and Manager views should start from the client outcome, then drill to KPI drivers and actions.

## 7. Important caveats

- The prototype uses synthetic data.
- It is a static single-page app.
- It has no backend database or API.
- It has no real authentication.
- Role switching is a demo affordance, not a security model.
- State mutations are stored in browser localStorage.
- Commercial and revenue values are modeled assumptions.
- Repeat Contact, Member Effort and RCA are modeled indicators, not production analytics yet.
- The app should be manually reviewed on desktop and mobile before any leadership demo.
- If deployed through Netlify or another static host, upload the app folder contents so `index.html` sits at the root.
